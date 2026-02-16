import log4js from "log4js";
import { SpeechRecognizer } from './SpeechRecognizer.js';
import { TurnstileSolver } from './TurnstileSolver.js';
import config from './config.js';

const logger = log4js.getLogger('CaptchaSolver');
logger.level = 'debug';

/**
 * Delays execution for a specified duration.
 * @param {number} ms - Milliseconds to wait.
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates a random delay between min and max.
 * @param {number} min - Minimum delay in ms.
 * @param {number} max - Maximum delay in ms.
 * @returns {number} The calculated delay.
 */
function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Core logic for solving Google reCaptcha v2 using Audio Challenge.
 */
export class CaptchaSolver {
    /**
     * @param {import('playwright').Page} page - The Playwright page instance.
     */
    constructor(page) {
        this.page = page;
        this.recognizer = new SpeechRecognizer(config.witAiToken);
        this.turnstileSolver = new TurnstileSolver(page);
    }

    /**
     * Detects which type of captcha is present and solves it.
     * @returns {Promise<boolean>} True if solved successfully, false otherwise.
     */
    async solve() {
        try {
            // First check for Turnstile
            const isTurnstile = await this.turnstileSolver.detect();
            if (isTurnstile) {
                logger.info('Detected Cloudflare Turnstile, solving...');
                return await this.turnstileSolver.solve();
            }

            // Otherwise, try reCaptcha
            logger.info('Starting reCaptcha solution...');
            return await this.solveRecaptcha();
        } catch (error) {
            logger.error('Error in solve process:', error);
            return false;
        }
    }

    /**
     * Orchestrates the solving process for reCaptcha.
     * @returns {Promise<boolean>} True if solved successfully, false otherwise.
     */
    async solveRecaptcha() {
        try {

            // 1. Find Anchor Frame
            let anchorFrame = await this.findFrame(/api2\/anchor/);
            if (!anchorFrame) {
                // Retry finding frames
                await delay(1000);
                anchorFrame = await this.findFrame(/api2\/anchor/);
                if (!anchorFrame) {
                    logger.warn('Recaptcha anchor frame not found');
                    return false;
                }
            }

            // 2. Click Checkbox
            // Use locator for auto-waiting
            const checkbox = anchorFrame.locator('.recaptcha-checkbox-border, #recaptcha-anchor');
            if (await checkbox.count() > 0) {
                logger.debug('Clicking captcha checkbox...');
                await checkbox.first().click({ delay: randomDelay(30, 100) });
                await delay(randomDelay(2000, 3000));
            } else {
                logger.debug('Checkbox selector not found, checking if already open...');
            }

            // 3. Find Challenge Frame (bframe)
            let bFrame = await this.findFrame(/api2\/bframe/);
            if (!bFrame) {
                logger.info('No challenge frame found. Checking if solved...');
                const isSolved = await this.isSolved(anchorFrame);
                if (isSolved) return true;

                // Wait a bit more
                await delay(2000);
                bFrame = await this.findFrame(/api2\/bframe/);
            }

            if (!bFrame) {
                // Final check
                if (await this.isSolved(anchorFrame)) {
                    logger.info('Captcha solved without challenge.');
                    return true;
                }
                logger.warn('Challenge frame did not appear.');
                return false;
            }

            // 4. Switch to Audio
            const audioButton = bFrame.locator('#recaptcha-audio-button');
            if (await audioButton.isVisible()) {
                logger.debug('Switching to audio challenge...');
                await audioButton.click({ delay: randomDelay(50, 150) });
                await delay(randomDelay(2000, 3000));

                // Re-acquire frame after interaction (it might reload)
                bFrame = await this.findFrame(/api2\/bframe/);
            } else {
                logger.warn('Audio button not found. May already be in audio mode or unsupported.');
            }

            // 5. Handle Audio Challenge
            return await this.handleAudioChallenge(bFrame);

        } catch (error) {
            logger.error('Error in solve process:', error);
            return false;
        }
    }

    /**
     * Handles the specific audio challenge logic.
     * @param {import('playwright').Frame} frame - The challenge frame.
     * @returns {Promise<boolean>} True if solved.
     */
    async handleAudioChallenge(frame) {
        try {
            // Check for error message
            const errorMsg = frame.locator('.rc-audiochallenge-error-message');
            if (await errorMsg.isVisible()) {
                const text = await errorMsg.innerText();
                if (text && text.trim().length > 0) {
                    logger.error(`Audio challenge blocked: ${text}`);
                    return false;
                }
            }

            // Get Audio Source
            const audioSource = frame.locator('#audio-source');
            // Wait for it to be attached
            try {
                await audioSource.waitFor({ state: 'attached', timeout: 5000 });
            } catch (e) {
                logger.error('Audio source element not found.');
                return false;
            }

            const audioUrl = await audioSource.getAttribute('src');
            logger.debug(`Found audio URL: ${audioUrl}`);

            // Download audio silently (no logging)
            const audioBuffer = await this.downloadAudio(frame, audioUrl);
            if (!audioBuffer) return false;

            // Transcribe silently (minimal logging)
            const text = await this.recognizer.transcribe(audioBuffer);
            if (!text) {
                logger.debug('Transcription failed (silent mode).');
                return false;
            }
            logger.debug(`Audio processed successfully`);

            // Input Answer
            const input = frame.locator('#audio-response');
            if (await input.count() === 0) {
                logger.error('Input field not found.');
                return false;
            }

            await input.click();
            await delay(randomDelay(50, 100));

            // Simulate human-like typing with variable speeds and occasional pauses
            await this.simulateHumanTyping(input, text);

            await delay(randomDelay(500, 1000));

            // Verify
            const verifyBtn = frame.locator('#recaptcha-verify-button');
            if (await verifyBtn.count() > 0) {
                await verifyBtn.click({ delay: randomDelay(50, 150) });
                await delay(3000);
            }

            // Final verification
            const anchorFrame = await this.findFrame('api2/anchor');
            return await this.isSolved(anchorFrame);

        } catch (error) {
            logger.error('Audio challenge error:', error);
            return false;
        }
    }

    /**
     * Checks if the captcha is solved.
     * @param {import('playwright').Frame} frame - The anchor frame.
     * @returns {Promise<boolean>}
     */
    async isSolved(frame) {
        if (!frame) return false;
        const checked = frame.locator('.recaptcha-checkbox-checked');
        const isVisible = await checked.isVisible().catch(() => false);
        return isVisible;
    }

    /**
     * Downloads audio content from the frame silently.
     * Uses stealth techniques to hide the download process.
     * @param {import('playwright').Frame} frame - The frame context.
     * @param {string} url - The audio URL.
     * @returns {Promise<Buffer|null>}
     */
    async downloadAudio(frame, url) {
        try {
            // Use stealth download to avoid detection
            const buffer = await frame.evaluate(async (audioUrl) => {
                // Suppress console logs during fetch
                const originalLog = console.log;
                const originalWarn = console.warn;
                console.log = () => {};
                console.warn = () => {};
                
                try {
                    // Use fetch with minimal headers to avoid detection
                    const response = await fetch(audioUrl, {
                        method: 'GET',
                        headers: {
                            'Accept': '*/*',
                            'Accept-Language': 'en-US,en;q=0.9',
                        },
                        credentials: 'omit',
                        cache: 'no-cache'
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const buffer = await response.arrayBuffer();
                    const result = Array.from(new Uint8Array(buffer));
                    
                    // Restore console
                    console.log = originalLog;
                    console.warn = originalWarn;
                    
                    return result;
                } catch (err) {
                    console.log = originalLog;
                    console.warn = originalWarn;
                    throw err;
                }
            }, url);
            
            return Buffer.from(buffer);
        } catch (error) {
            logger.debug('Audio download failed (silent mode)');
            return null;
        }
    }

    /**
     * Simulates human-like typing with natural variations.
     * Includes random pauses, variable speeds, and occasional corrections.
     * @param {import('playwright').Locator} input - The input element.
     * @param {string} text - The text to type.
     */
    async simulateHumanTyping(input, text) {
        if (!text || text.length === 0) return;

        // Clear input first
        await input.click();
        await delay(randomDelay(50, 150));
        await input.fill('');
        await delay(randomDelay(100, 200));

        // Type character by character with human-like patterns
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            
            // Variable typing speed (slower at start, faster in middle, slower at end)
            let baseDelay = config.timeouts.typing.min;
            if (i < 2 || i > text.length - 2) {
                baseDelay = config.timeouts.typing.max; // Slower at start/end
            } else {
                baseDelay = randomDelay(config.timeouts.typing.min, config.timeouts.typing.max);
            }

            // Occasional longer pause (simulating thinking)
            if (Math.random() < 0.1 && i > 0) {
                await delay(randomDelay(200, 500));
            }

            // Type the character
            await input.pressSequentially(char, { delay: baseDelay });
            
            // Small random delay between characters
            await delay(randomDelay(10, 30));
        }

        // Final pause before submission
        await delay(randomDelay(200, 400));
    }

    /**
     * Finds a frame by partial URL match or Regex.
     * @param {string|RegExp} urlPart - Partial URL string or Regex.
     * @returns {Promise<import('playwright').Frame|null>}
     */
    async findFrame(urlPart) {
        const frames = this.page.frames();
        for (const frame of frames) {
            const url = frame.url();
            if (urlPart instanceof RegExp) {
                if (urlPart.test(url)) return frame;
            } else if (url.includes(urlPart)) {
                return frame;
            }
        }
        return null;
    }
}
