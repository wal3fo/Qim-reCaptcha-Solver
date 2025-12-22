// Content Script - Runs in the page (and iframes)

// Configuration
const CONFIG = {
    checkInterval: 1000,
    typingSpeed: { min: 30, max: 70 }
};

// State
let isSolving = false;
let hasNotified = false;

// Performance Metrics
class PerformanceMetrics {
    constructor() {
        this.startTime = null;
        this.endTime = null;
        this.attempts = 0;
    }

    start() {
        if (!this.startTime) this.startTime = Date.now();
    }

    end() {
        this.endTime = Date.now();
        this.logMetrics();
    }

    incrementAttempts() {
        this.attempts++;
    }

    logMetrics() {
        if (this.startTime && this.endTime) {
            const duration = this.endTime - this.startTime;
            console.log(`[ReCaptcha-Metrics] Success! Duration: ${duration}ms, Attempts: ${this.attempts}`);
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Simulates typing into an input field
 */
async function simulateTyping(element, text) {
    if (!text || text.length === 0) return;

    element.focus();
    // Clear existing
    element.value = '';

    for (const char of text) {
        // Create events
        const keydown = new KeyboardEvent('keydown', { key: char, bubbles: true });
        const keypress = new KeyboardEvent('keypress', { key: char, bubbles: true });
        const input = new InputEvent('input', { data: char, bubbles: true });
        const keyup = new KeyboardEvent('keyup', { key: char, bubbles: true });

        element.dispatchEvent(keydown);
        element.dispatchEvent(keypress);
        element.value += char;
        element.dispatchEvent(input);
        element.dispatchEvent(keyup);

        await sleep(randomDelay(CONFIG.typingSpeed.min, CONFIG.typingSpeed.max));
    }

    // Change event at the end
    element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Main Solver Loop (reCaptcha)
 */
async function solveLoop() {
    if (isSolving) return;

    // 0. Check for Success (Anchor Frame)
    const isChecked = document.querySelector('.recaptcha-checkbox-checked');
    if (isChecked && isChecked.offsetParent !== null) {
        if (!hasNotified) {
            console.log('Captcha solved successfully!');
            chrome.runtime.sendMessage({
                action: 'notify',
                title: 'reCaptcha Solver',
                message: 'Captcha solved successfully!'
            });
            hasNotified = true;
        }
        return;
    }

    // Reset notification state if checkbox exists but is not checked
    const checkboxBorder = document.querySelector('.recaptcha-checkbox-border');
    if (checkboxBorder && !isChecked) {
        hasNotified = false;
    }

    // 1. Check for Checkbox (Anchor Frame)
    const checkbox = document.querySelector('.recaptcha-checkbox-border');
    if (checkbox && !checkbox.classList.contains('recaptcha-checkbox-checked') && checkbox.offsetParent !== null) {
        console.log('Found unchecked captcha. Clicking...');
        isSolving = true;
        await sleep(randomDelay(500, 1000));
        checkbox.click();
        isSolving = false;
        return;
    }

    // 2. Check for Audio Button (Challenge Frame)
    const audioBtn = document.querySelector('#recaptcha-audio-button');
    if (audioBtn && audioBtn.offsetParent !== null && !document.querySelector('.rc-audiochallenge-block')) {
        console.log('Found audio button. Clicking...');
        isSolving = true;
        await sleep(randomDelay(500, 1000));
        audioBtn.click();
        isSolving = false;
        return;
    }

    // 3. Check for Audio Source (Challenge Frame)
    const audioSource = document.querySelector('#audio-source');
    const responseInput = document.querySelector('#audio-response');
    const verifyBtn = document.querySelector('#recaptcha-verify-button');

    if (audioSource && responseInput && verifyBtn && !responseInput.value) {
        isSolving = true;
        const src = audioSource.src;
        console.log('Found audio source:', src);

        // Send to background for transcription
        try {
            console.log('Requesting transcription...');
            chrome.runtime.sendMessage({ action: 'transcribe', audioUrl: src }, async (response) => {
                if (response && response.success && response.text) {
                    // Silent Validation of Result
                    if (response.text.length < 1) {
                        console.error('Transcription empty, skipping input.');
                        isSolving = false;
                        return;
                    }

                    console.log('Transcription received (Silent Validation Passed):', response.text);

                    await sleep(randomDelay(500, 1000));
                    await simulateTyping(responseInput, response.text);

                    await sleep(randomDelay(500, 1000));
                    verifyBtn.click();
                } else {
                    console.error('Transcription failed:', response ? response.error : 'Unknown error');
                    // Reload audio silently
                    const reloadBtn = document.querySelector('#recaptcha-reload-button');
                    if (reloadBtn) reloadBtn.click();
                }
                isSolving = false;
            });
        } catch (e) {
            isSolving = false;
        }
        return;
    }

    // 4. Check for errors
    const errorMsg = document.querySelector('.rc-audiochallenge-error-message');
    if (errorMsg && errorMsg.offsetParent !== null) {
        console.log('Blocked/Error detected. Reloading...');
        const reloadBtn = document.querySelector('#recaptcha-reload-button');
        if (reloadBtn) {
            reloadBtn.click();
            await sleep(2000);
        }
    }
}

// Start Loops
setInterval(solveLoop, CONFIG.checkInterval); // ReCaptcha

console.log('Google reCaptcha Solver extension loaded (v2.5).');
