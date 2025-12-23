// Content Script - Runs in the page (and iframes)

// Configuration
const CONFIG = {
    checkInterval: 200,
    typingSpeed: { min: 30, max: 70 }
};

// State
let isSolving = false;
let hasNotified = false;

// UI Loader
const Loader = {
    injectStyles: () => {
        if (document.getElementById('rc-solver-style')) return;
        const style = document.createElement('style');
        style.id = 'rc-solver-style';
        style.textContent = `
            .rc-solver-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: #ffffff;
                z-index: 2147483647;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                cursor: wait;
            }
            .rc-solver-spinner {
                width: 28px; height: 28px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #4285f4;
                border-radius: 50%;
                animation: rc-spin 1s linear infinite;
                margin-bottom: 8px;
            }
            .rc-solver-text {
                color: #555;
                font-family: Roboto, Arial, sans-serif;
                font-size: 13px;
                font-weight: 500;
                text-align: center;
                user-select: none;
            }
            @keyframes rc-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            
            /* Hide captcha elements when solver is active */
            body.rc-solver-active .rc-imageselect-view,
            body.rc-solver-active .rc-audiochallenge-block,
            body.rc-solver-active .rc-audiochallenge-error-message {
                opacity: 0 !important;
                visibility: hidden !important;
                pointer-events: none !important;
                transition: opacity 0.3s ease;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    },
    show: (text = 'Solving...') => {
        Loader.injectStyles();
        if (!document.body) return; // Safety check

        // AUTHORIZATION LOGIC:
        // Identify the current view context to determine visibility permissions.
        // We want to block rendering ONLY for specific challenge modals (Grids, Audio).
        // The standard Captcha Widget (Anchor) must remain visible.

        const isGridsModal = document.querySelector('.rc-imageselect-view');
        const isAudioModal = document.querySelector('.rc-audiochallenge-block') ||
            document.querySelector('#recaptcha-audio-button') ||
            document.querySelector('#audio-source');

        // Condition 1: If we are in a Challenge Modal (Grids or Audio), enforce hiding.
        if (isGridsModal || isAudioModal) {
            document.body.classList.add('rc-solver-active');
        }
        // Condition 2: If we are in the Anchor/Widget view or unknown, ensure visibility.
        else {
            document.body.classList.remove('rc-solver-active');
        }

        let overlay = document.querySelector('.rc-solver-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'rc-solver-overlay';
            overlay.innerHTML = `<div class="rc-solver-spinner"></div><div class="rc-solver-text">${text}</div>`;
            document.body.appendChild(overlay);
        } else {
            const textEl = overlay.querySelector('.rc-solver-text');
            if (textEl) textEl.textContent = text;
        }
    },
    hide: () => {
        if (document.body) document.body.classList.remove('rc-solver-active');
        const overlay = document.querySelector('.rc-solver-overlay');
        if (overlay) overlay.remove();
    }
};

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
        Loader.hide(); // Reveal success state
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
        Loader.show('Initializing...');
        isSolving = true;
        await sleep(randomDelay(500, 1000));
        checkbox.click();
        isSolving = false;
        // Keep loader until audio challenge appears or success
        return;
    }

    // 2. Check for Audio Button (Challenge Frame)
    const audioBtn = document.querySelector('#recaptcha-audio-button');
    if (audioBtn && audioBtn.offsetParent !== null && !document.querySelector('.rc-audiochallenge-block')) {
        console.log('Found audio button. Clicking...');
        Loader.show('Start Challenge...');
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
        Loader.show('Surfing...');
        const src = audioSource.src;
        console.log('Found audio source:', src);

        // Send to background for transcription
        try {
            console.log('Requesting transcription...');
            chrome.runtime.sendMessage({ action: 'transcribe', audioUrl: src }, async (response) => {
                if (response && response.success && response.text) {
                    // Silent Validation of Result
                    if (response.text.length < 1) {
                        console.error('Surf empty, skipping input.');
                        Loader.hide(); // Show error
                        isSolving = false;
                        return;
                    }

                    console.log('Surf received (Silent Validation Passed):', response.text);
                    Loader.show('Verifying...');

                    await sleep(randomDelay(500, 1000));
                    await simulateTyping(responseInput, response.text);

                    await sleep(randomDelay(500, 1000));
                    verifyBtn.click();
                } else {
                    console.error('Transcription failed:', response ? response.error : 'Unknown error');
                    Loader.hide(); // Reveal for manual intervention or reload
                    // Reload audio silently
                    const reloadBtn = document.querySelector('#recaptcha-reload-button');
                    if (reloadBtn) reloadBtn.click();
                }
                isSolving = false;
            });
        } catch (e) {
            isSolving = false;
            Loader.hide();
        }
        return;
    }

    // 4. Check for errors
    const errorMsg = document.querySelector('.rc-audiochallenge-error-message');
    if (errorMsg && errorMsg.offsetParent !== null) {
        console.log('Blocked/Error detected. Reloading...');
        Loader.hide(); // Show error
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
