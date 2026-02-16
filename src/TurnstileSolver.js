import log4js from "log4js";

const logger = log4js.getLogger('TurnstileSolver');
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
 * Solver for Cloudflare Turnstile captcha.
 * Turnstile uses iframes with shadow DOM and different challenge types.
 */
export class TurnstileSolver {
    /**
     * @param {import('playwright').Page} page - The Playwright page instance.
     */
    constructor(page) {
        this.page = page;
    }

    /**
     * Detects if Turnstile is present on the page (not reCaptcha).
     * @returns {Promise<boolean>}
     */
    async detect() {
        try {
            // First check if reCaptcha is present - if so, this is NOT Turnstile
            const recaptchaFrame = await this.page.locator('iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"]').first();
            if (await recaptchaFrame.count() > 0) {
                logger.debug('reCaptcha detected, skipping Turnstile detection');
                return false;
            }

            const recaptchaCheckbox = await this.page.locator('.recaptcha-checkbox-border, #recaptcha-anchor').first();
            if (await recaptchaCheckbox.count() > 0) {
                logger.debug('reCaptcha checkbox detected, skipping Turnstile detection');
                return false;
            }

            // Check for Turnstile-specific iframe (most reliable)
            const turnstileFrame = await this.findTurnstileFrame();
            if (turnstileFrame) {
                logger.info('Turnstile detected via iframe');
                return true;
            }

            // Check for Turnstile class names (cf-turnstile is specific to Cloudflare)
            const cfWidget = await this.page.locator('.cf-turnstile, [class*="cf-turnstile"]').first();
            if (await cfWidget.count() > 0) {
                logger.info('Turnstile widget detected by class');
                return true;
            }

            // Check for Turnstile iframe elements
            const iframe = await this.page.locator('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]').first();
            if (await iframe.count() > 0) {
                logger.info('Turnstile iframe detected');
                return true;
            }

            // Last resort: check for data-sitekey but only if no reCaptcha indicators
            const widget = await this.page.locator('[data-sitekey]').first();
            if (await widget.count() > 0) {
                const sitekey = await widget.getAttribute('data-sitekey');
                if (sitekey && sitekey.length > 0) {
                    // Double-check it's not reCaptcha
                    const hasRecaptcha = await this.page.locator('iframe[src*="recaptcha"], .recaptcha-checkbox-border').count() > 0;
                    if (!hasRecaptcha) {
                        logger.info('Turnstile widget detected with sitekey (no reCaptcha found)');
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            logger.debug('Turnstile detection error:', error.message);
            return false;
        }
    }

    /**
     * Solves Cloudflare Turnstile challenge.
     * @returns {Promise<boolean>} True if solved successfully, false otherwise.
     */
    async solve() {
        try {
            logger.info('Starting Turnstile solution...');

            // Check if already solved first
            if (await this.isSolved()) {
                logger.info('Turnstile already solved');
                return true;
            }

            // Find the Turnstile widget on the main page (not iframe)
            const widget = await this.page.locator('[data-sitekey]').first();
            if (await widget.count() === 0) {
                logger.warn('Turnstile widget not found');
                return false;
            }

            // Wait for widget to be ready
            await delay(randomDelay(1000, 2000));

            // Click the widget on the main page (this triggers Turnstile verification)
            logger.debug('Clicking Turnstile widget...');
            await widget.click({ delay: randomDelay(50, 150) });
            
            // Wait for Turnstile to process (it may show a challenge or solve automatically)
            await delay(randomDelay(2000, 4000));

            // Check if solved after initial click
            if (await this.isSolved()) {
                logger.info('Turnstile solved after initial click');
                return true;
            }

            // If not solved, try clicking the iframe checkbox
            const turnstileFrame = await this.findTurnstileFrame();
            if (turnstileFrame) {
                logger.debug('Attempting to click checkbox in iframe...');
                const solved = await this.clickCheckbox(turnstileFrame);
                if (solved) {
                    await delay(randomDelay(2000, 3000));
                    return await this.isSolved();
                }
            }

            // Wait a bit more and check again (Turnstile might be processing)
            await delay(randomDelay(3000, 5000));
            return await this.isSolved();

        } catch (error) {
            logger.error('Error in Turnstile solve process:', error);
            return false;
        }
    }

    /**
     * Finds the Turnstile iframe.
     * @returns {Promise<import('playwright').Frame|null>}
     */
    async findTurnstileFrame() {
        const frames = this.page.frames();
        
        for (const frame of frames) {
            const url = frame.url();
            // Cloudflare Turnstile iframe patterns
            if (url.includes('challenges.cloudflare.com') || 
                url.includes('turnstile') ||
                url.includes('cloudflare.com/cdn-cgi/challenge-platform')) {
                logger.debug(`Found Turnstile frame: ${url}`);
                return frame;
            }
        }

        // Also check for iframe elements in DOM
        const iframes = await this.page.locator('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"], iframe[data-sitekey]').all();
        for (const iframe of iframes) {
            try {
                const frame = await iframe.contentFrame();
                if (frame) {
                    const url = frame.url();
                    if (url.includes('challenges.cloudflare.com') || url.includes('turnstile')) {
                        return frame;
                    }
                }
            } catch (e) {
                // Iframe might not be accessible
                continue;
            }
        }

        return null;
    }

    /**
     * Clicks the Turnstile checkbox using various strategies.
     * @param {import('playwright').Frame} frame - The Turnstile frame.
     * @returns {Promise<boolean>}
     */
    async clickCheckbox(frame) {
        try {
            // Strategy 1: Try clicking via common selectors
            const selectors = [
                'input[type="checkbox"]',
                '.cb-container',
                '#challenge-stage',
                '[role="checkbox"]',
                '.mark',
                'label[for*="cf-"]'
            ];

            for (const selector of selectors) {
                try {
                    const element = frame.locator(selector).first();
                    if (await element.count() > 0 && await element.isVisible()) {
                        logger.debug(`Clicking checkbox using selector: ${selector}`);
                        await element.click({ delay: randomDelay(50, 150) });
                        await delay(randomDelay(1000, 2000));
                        if (await this.isSolved()) {
                            return true;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            // Strategy 2: Click via coordinates (if checkbox is visible)
            try {
                const checkboxArea = frame.locator('body').first();
                if (await checkboxArea.count() > 0) {
                    const box = await checkboxArea.boundingBox();
                    if (box) {
                        // Click in the center of the frame (where checkbox usually is)
                        const x = box.x + box.width / 2;
                        const y = box.y + box.height / 2;
                        logger.debug(`Clicking checkbox via coordinates: ${x}, ${y}`);
                        await this.page.mouse.move(x, y, { steps: randomDelay(5, 10) });
                        await delay(randomDelay(100, 300));
                        await this.page.mouse.click(x, y, { delay: randomDelay(50, 150) });
                        await delay(randomDelay(1000, 2000));
                        if (await this.isSolved()) {
                            return true;
                        }
                    }
                }
            } catch (e) {
                logger.debug('Coordinate click failed:', e.message);
            }

            // Strategy 3: Execute JavaScript in frame context
            try {
                const clicked = await frame.evaluate(() => {
                    // Try to find and click checkbox via JS
                    const checkbox = document.querySelector('input[type="checkbox"]') ||
                                   document.querySelector('[role="checkbox"]') ||
                                   document.querySelector('.cb-container') ||
                                   document.querySelector('#challenge-stage');
                    
                    if (checkbox) {
                        checkbox.click();
                        return true;
                    }
                    return false;
                });

                if (clicked) {
                    await delay(randomDelay(1000, 2000));
                    return await this.isSolved();
                }
            } catch (e) {
                logger.debug('JavaScript click failed:', e.message);
            }

            return false;
        } catch (error) {
            logger.error('Error clicking Turnstile checkbox:', error);
            return false;
        }
    }

    /**
     * Checks if Turnstile is solved.
     * @returns {Promise<boolean>}
     */
    async isSolved() {
        try {
            // Primary check: Look for the token in the input field
            const tokenInput = await this.page.locator('input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]').first();
            if (await tokenInput.count() > 0) {
                const token = await tokenInput.inputValue().catch(() => '');
                if (token && token.length > 10) {
                    logger.debug('Turnstile solved (token found in input)');
                    return true;
                }
            }

            // Check via JavaScript evaluation (more reliable)
            const token = await this.page.evaluate(() => {
                // Check for token in input field
                const input = document.querySelector('input[name="cf-turnstile-response"]') || 
                             document.querySelector('input[name="g-recaptcha-response"]');
                if (input && input.value && input.value.length > 10) {
                    return input.value;
                }

                // Check for token in window object
                if (window.turnstileToken && window.turnstileToken.length > 10) {
                    return window.turnstileToken;
                }

                // Check widget state
                const widget = document.querySelector('[data-sitekey]');
                if (widget) {
                    // Check if widget has success state
                    const iframe = widget.querySelector('iframe');
                    if (iframe) {
                        try {
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                            if (iframeDoc) {
                                const checked = iframeDoc.querySelector('[aria-checked="true"], input[checked]');
                                if (checked) return 'solved';
                            }
                        } catch (e) {
                            // Cross-origin, can't access
                        }
                    }
                }

                return null;
            }).catch(() => null);

            if (token && token.length > 10) {
                logger.debug('Turnstile solved (token found)');
                return true;
            }

            // Check for visual success indicators
            const successIndicators = [
                '.cf-turnstile-success',
                '[aria-checked="true"]',
                '[data-callback]'
            ];

            for (const selector of successIndicators) {
                const element = this.page.locator(selector).first();
                if (await element.count() > 0) {
                    const isVisible = await element.isVisible().catch(() => false);
                    if (isVisible) {
                        logger.debug('Turnstile solved (indicator found)');
                        return true;
                    }
                }
            }

            // Check iframe for success state (if accessible)
            const frame = await this.findTurnstileFrame();
            if (frame) {
                try {
                    const isSuccess = await frame.evaluate(() => {
                        return document.querySelector('[aria-checked="true"]') !== null ||
                               document.querySelector('input[checked]') !== null ||
                               document.body.classList.contains('success') ||
                               document.body.classList.contains('verified');
                    }).catch(() => false);

                    if (isSuccess) {
                        logger.debug('Turnstile solved (iframe check)');
                        return true;
                    }
                } catch (e) {
                    // Cross-origin iframe, can't check
                }
            }

            return false;
        } catch (error) {
            logger.debug('Error checking Turnstile solved state:', error.message);
            return false;
        }
    }
}
