// Content Script - Optimized for stability and reliability
// Runs in page context and iframes

// Prevent duplicate initialization
if (window.rcSolverInitialized) {
    console.log('[Solver] Already initialized, skipping...');
} else {
    window.rcSolverInitialized = true;

    const CONFIG = {
        checkInterval: 300, // Slightly slower to reduce CPU usage
        typingSpeed: { min: 35, max: 75 },
        maxSolveAttempts: 5,
        messageTimeout: 30000, // 30 second timeout for transcription
        debounceDelay: 500
    };

    // State Management
    const State = {
        isSolving: false,
        hasNotified: false,
        solveAttempts: 0,
        lastSolveTime: 0,
        activeType: null, // 'recaptcha' or 'turnstile'

        reset() {
            this.isSolving = false;
            this.solveAttempts = 0;
            this.lastSolveTime = 0;
        },

        canRetry() {
            return this.solveAttempts < CONFIG.maxSolveAttempts;
        },

        incrementAttempt() {
            this.solveAttempts++;
            this.lastSolveTime = Date.now();
        },

        shouldDebounce() {
            const timeSinceLastSolve = Date.now() - this.lastSolveTime;
            return timeSinceLastSolve < CONFIG.debounceDelay;
        }
    };

    /**
     * Enhanced Loader UI
     */
    const Loader = {
        injectStyles: () => {
            if (document.getElementById('rc-solver-style')) return;

            const style = document.createElement('style');
            style.id = 'rc-solver-style';
            style.textContent = `
            .rc-solver-overlay {
                position: fixed;
                top: 10px;
                right: 10px;
                width: auto;
                height: auto;
                background: rgba(66, 133, 244, 0.95);
                z-index: 2147483647;
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: center;
                cursor: default;
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                transition: opacity 0.3s ease;
            }
            
            .rc-solver-spinner {
                width: 20px;
                height: 20px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-top: 2px solid #ffffff;
                border-radius: 50%;
                animation: rc-spin 0.8s linear infinite;
                margin-right: 10px;
            }
            
            .rc-solver-text {
                color: #ffffff;
                font-family: 'Roboto', Arial, sans-serif;
                font-size: 13px;
                font-weight: 500;
                text-align: left;
                user-select: none;
                white-space: nowrap;
            }
            
            @keyframes rc-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;

            (document.head || document.documentElement).appendChild(style);
        },

        show: (text = 'Solving...') => {
            Loader.injectStyles();

            if (!document.body) {
                console.warn('[Solver] Body not ready for loader');
                return;
            }

            let overlay = document.querySelector('.rc-solver-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'rc-solver-overlay';
                overlay.innerHTML = `
                <div class="rc-solver-spinner"></div>
                <div class="rc-solver-text">${text}</div>
            `;
                document.body.appendChild(overlay);
            } else {
                const textEl = overlay.querySelector('.rc-solver-text');
                if (textEl) textEl.textContent = text;
            }
        },

        hide: () => {
            const overlay = document.querySelector('.rc-solver-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 300);
            }
        },

        updateText: (text) => {
            const overlay = document.querySelector('.rc-solver-overlay');
            if (overlay) {
                const textEl = overlay.querySelector('.rc-solver-text');
                if (textEl) textEl.textContent = text;
            }
        }
    };

    /**
     * Utility Functions
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Human-like typing simulation
     */
    async function simulateTyping(element, text) {
        if (!text || text.length === 0) {
            console.warn('[Solver] Empty text for typing');
            return;
        }

        if (!element) {
            console.error('[Solver] Invalid element for typing');
            return;
        }

        try {
            element.focus();
            await sleep(randomDelay(100, 200));

            // Clear existing value
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(randomDelay(50, 100));

            // Type each character
            for (let i = 0; i < text.length; i++) {
                const char = text[i];

                // Variable speed (slower at start/end)
                let delay = CONFIG.typingSpeed.min;
                if (i < 2 || i >= text.length - 2) {
                    delay = CONFIG.typingSpeed.max;
                } else {
                    delay = randomDelay(CONFIG.typingSpeed.min, CONFIG.typingSpeed.max);
                }

                // Occasional pause (thinking)
                if (Math.random() < 0.15 && i > 0 && i < text.length - 1) {
                    await sleep(randomDelay(150, 400));
                }

                // Realistic keyboard events
                const keyCode = char.charCodeAt(0);

                element.dispatchEvent(new KeyboardEvent('keydown', {
                    key: char,
                    code: `Key${char.toUpperCase()}`,
                    keyCode,
                    which: keyCode,
                    bubbles: true,
                    cancelable: true
                }));

                element.value += char;

                element.dispatchEvent(new InputEvent('input', {
                    data: char,
                    inputType: 'insertText',
                    bubbles: true
                }));

                element.dispatchEvent(new KeyboardEvent('keyup', {
                    key: char,
                    code: `Key${char.toUpperCase()}`,
                    keyCode,
                    which: keyCode,
                    bubbles: true
                }));

                await sleep(delay);
                await sleep(randomDelay(5, 20)); // Micro delay
            }

            // Final events
            element.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(randomDelay(100, 200));

            console.log(`[Solver] Typed: "${text}"`);

        } catch (error) {
            console.error('[Solver] Typing error:', error);
            throw error;
        }
    }

    /**
     * Send message with timeout protection
     */
    function sendMessageWithTimeout(message, timeout = CONFIG.messageTimeout) {
        return new Promise((resolve, reject) => {
            console.log('[Solver] Setting up message with timeout:', timeout + 'ms');

            const timer = setTimeout(() => {
                console.error('[Solver] MESSAGE TIMEOUT after', timeout + 'ms');
                reject(new Error('Message timeout - background script not responding'));
            }, timeout);

            try {
                console.log('[Solver] Calling chrome.runtime.sendMessage...');
                chrome.runtime.sendMessage(message, (response) => {
                    clearTimeout(timer);

                    console.log('[Solver] Message callback received');

                    if (chrome.runtime.lastError) {
                        console.error('[Solver] Chrome runtime error:', chrome.runtime.lastError);
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        console.log('[Solver] Response received:', response);
                        resolve(response);
                    }
                });
            } catch (error) {
                clearTimeout(timer);
                console.error('[Solver] Exception in sendMessage:', error);
                reject(error);
            }
        });
    }

    /**
     * Turnstile Detection
     */
    function detectTurnstile() {
        // Cloudflare Turnstile indicators
        const turnstileIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]');
        if (turnstileIframe) return true;

        const cfWidget = document.querySelector('.cf-turnstile, [class*="cf-turnstile"]');
        if (cfWidget) return true;

        // Check for Turnstile-specific attributes
        const turnstileWidget = document.querySelector('[data-sitekey][data-callback], [data-sitekey][data-theme]');
        if (turnstileWidget) {
            // Exclude reCaptcha
            const hasRecaptcha = document.querySelector('iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"]');
            if (!hasRecaptcha) return true;
        }

        return false;
    }

    /**
     * reCaptcha Detection
     */
    function detectRecaptcha() {
        // Anchor checkbox
        if (document.querySelector('.recaptcha-checkbox-border, #recaptcha-anchor')) {
            return true;
        }

        // Challenge frame
        if (document.querySelector('iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"]')) {
            return true;
        }

        // Challenge elements
        if (document.querySelector('#recaptcha-audio-button, #audio-source, .rc-audiochallenge-block')) {
            return true;
        }

        return false;
    }

    /**
     * Turnstile Solver
     */
    async function solveTurnstile() {
        if (State.isSolving || !State.canRetry()) return false;
        if (!detectTurnstile()) return false;

        try {
            // Check if already solved
            const tokenInput = document.querySelector('input[name="cf-turnstile-response"]');
            if (tokenInput?.value && tokenInput.value.length > 20) {
                if (!State.hasNotified) {
                    console.log('[Solver] Turnstile already solved');
                    await sendMessageWithTimeout({
                        action: 'notify',
                        title: 'Turnstile Solver',
                        message: 'Captcha solved successfully!'
                    });
                    State.hasNotified = true;
                }
                Loader.hide();
                return true;
            }

            // Find widget
            let widget = document.querySelector('.cf-turnstile, [data-sitekey]');
            if (!widget) {
                widget = document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]');
            }

            if (!widget) return false;

            State.isSolving = true;
            State.incrementAttempt();
            Loader.show('Verifying Turnstile...');

            await sleep(randomDelay(800, 1500));

            // Click widget
            if (widget.tagName === 'IFRAME') {
                const parent = widget.parentElement;
                if (parent) {
                    parent.click();
                }
            } else {
                widget.click();
            }

            // Wait for processing
            await sleep(randomDelay(3000, 5000));

            // Check result
            const checkToken = document.querySelector('input[name="cf-turnstile-response"]');
            if (checkToken?.value && checkToken.value.length > 20) {
                console.log('[Solver] Turnstile solved!');

                if (!State.hasNotified) {
                    await sendMessageWithTimeout({
                        action: 'notify',
                        title: 'Turnstile Solver',
                        message: 'Captcha solved successfully!'
                    });
                    State.hasNotified = true;
                }

                State.reset();
                Loader.hide();
                return true;
            }

            State.isSolving = false;
            Loader.hide();
            return false;

        } catch (error) {
            console.error('[Solver] Turnstile error:', error);
            State.isSolving = false;
            Loader.hide();
            return false;
        }
    }

    /**
     * reCaptcha Solver
     */
    async function solveRecaptcha() {
        if (State.isSolving || !State.canRetry()) return;
        if (State.shouldDebounce()) return;

        try {
            // 0. Check for Success
            const isChecked = document.querySelector('.recaptcha-checkbox-checked');
            if (isChecked && isChecked.offsetParent !== null) {
                Loader.hide();

                if (!State.hasNotified) {
                    console.log('[Solver] reCaptcha solved!');
                    await sendMessageWithTimeout({
                        action: 'notify',
                        title: 'reCaptcha Solver',
                        message: 'Captcha solved successfully!'
                    });
                    State.hasNotified = true;
                }

                State.reset();
                return;
            }

            // Reset notification if checkbox exists but unchecked
            const checkboxBorder = document.querySelector('.recaptcha-checkbox-border');
            if (checkboxBorder && !isChecked) {
                State.hasNotified = false;
            }

            // 1. Click Checkbox (Anchor)
            if (checkboxBorder && !isChecked && checkboxBorder.offsetParent !== null) {
                console.log('[Solver] Clicking reCaptcha checkbox');
                Loader.show('Initializing reCaptcha...');
                State.isSolving = true;
                State.incrementAttempt();

                await sleep(randomDelay(500, 1000));
                checkboxBorder.click();
                await sleep(randomDelay(2000, 3000));

                State.isSolving = false;
                return;
            }

            // 2. Click Audio Button
            const audioBtn = document.querySelector('#recaptcha-audio-button');
            if (audioBtn && audioBtn.offsetParent !== null && !document.querySelector('.rc-audiochallenge-block')) {
                console.log('[Solver] Switching to audio challenge');
                Loader.show('Loading audio challenge...');
                State.isSolving = true;
                State.incrementAttempt();

                await sleep(randomDelay(500, 1000));
                audioBtn.click();
                await sleep(randomDelay(2000, 3500));

                State.isSolving = false;
                return;
            }

            // 3. Solve Audio Challenge
            const audioSource = document.querySelector('#audio-source');
            const responseInput = document.querySelector('#audio-response');
            const verifyBtn = document.querySelector('#recaptcha-verify-button');

            if (audioSource && responseInput && verifyBtn && !responseInput.value) {
                State.isSolving = true;
                State.incrementAttempt();
                Loader.show('Transcribing audio...');

                const audioUrl = audioSource.src;
                console.log('[Solver] Processing audio:', audioUrl);

                try {
                    console.log('[Solver] Sending transcription request...');

                    const response = await sendMessageWithTimeout({
                        action: 'transcribe',
                        audioUrl: audioUrl
                    }).catch(err => {
                        console.error('[Solver] Message sending failed:', err);
                        throw new Error(`Background script not responding: ${err.message}`);
                    });

                    console.log('[Solver] Received response:', response);

                    if (response && response.success && response.text) {
                        const text = response.text.trim();

                        if (text.length === 0) {
                            throw new Error('Empty transcription result');
                        }

                        console.log('[Solver] Transcription:', text);
                        Loader.updateText('Entering answer...');

                        await sleep(randomDelay(500, 1000));
                        await simulateTyping(responseInput, text);

                        Loader.updateText('Verifying...');
                        await sleep(randomDelay(500, 1000));

                        verifyBtn.click();
                        await sleep(randomDelay(2000, 3000));

                    } else {
                        throw new Error(response?.error || 'Transcription failed');
                    }

                } catch (error) {
                    console.error('[Solver] Audio processing error:', error);
                    console.error('[Solver] Error details:', {
                        message: error.message,
                        stack: error.stack
                    });

                    // Show error to user
                    Loader.updateText(`Error: ${error.message.substring(0, 50)}...`);
                    await sleep(3000); // Show error for 3 seconds

                    // Reload audio on error
                    const reloadBtn = document.querySelector('#recaptcha-reload-button');
                    if (reloadBtn && State.canRetry()) {
                        console.log('[Solver] Reloading audio...');
                        Loader.updateText('Reloading...');
                        await sleep(randomDelay(1000, 2000));
                        reloadBtn.click();
                        await sleep(randomDelay(1500, 2500));
                    } else {
                        Loader.hide();
                    }
                }

                State.isSolving = false;
                return;
            }

            // 4. Handle Errors
            const errorMsg = document.querySelector('.rc-audiochallenge-error-message');
            if (errorMsg && errorMsg.offsetParent !== null) {
                console.warn('[Solver] Error detected, reloading...');

                const reloadBtn = document.querySelector('#recaptcha-reload-button');
                if (reloadBtn && State.canRetry()) {
                    State.incrementAttempt();
                    reloadBtn.click();
                    await sleep(randomDelay(1500, 2500));
                } else {
                    console.error('[Solver] Max attempts reached');
                    Loader.hide();
                    State.reset();
                }
            }

        } catch (error) {
            console.error('[Solver] reCaptcha error:', error);
            State.isSolving = false;
            Loader.hide();
        }
    }

    /**
     * Main Solve Loop
     */
    async function solveLoop() {
        if (State.isSolving || State.shouldDebounce()) return;

        try {
            const hasTurnstile = detectTurnstile();
            const hasRecaptcha = detectRecaptcha();

            // Prioritize reCaptcha over Turnstile
            if (hasRecaptcha) {
                State.activeType = 'recaptcha';
                await solveRecaptcha();
            } else if (hasTurnstile) {
                State.activeType = 'turnstile';
                await solveTurnstile();
            }

        } catch (error) {
            // Isolate from page errors - only log extension errors
            if (error && error.message && !error.message.includes('React')) {
                console.error('[Solver] Loop error:', error);
            }
            State.isSolving = false;
            Loader.hide();
        }
    }

    // Start solver loop
    const solverInterval = setInterval(solveLoop, CONFIG.checkInterval);

    // Prevent page errors from affecting extension
    window.addEventListener('error', (event) => {
        // Only suppress React and page errors, not extension errors
        if (event.message && (
            event.message.includes('React') ||
            event.message.includes('Minified') ||
            event.filename?.includes('index-Du-7DxHg.js') ||
            event.filename?.includes('index-cPLjtMcm.js')
        )) {
            // Silently ignore page errors - they're not ours
            event.stopPropagation();
        }
    }, true);

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
        clearInterval(solverInterval);
        Loader.hide();
    });


    // Detect context
    const isIframe = window.self !== window.top;
    const context = isIframe ? 'iframe' : 'main page';
    console.log(`[Solver] Extension loaded (v3.1 optimized) in ${context}`);

    // Test background script connectivity
    chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[Solver] ⚠️ WARNING: Cannot connect to background script!');
            console.error('[Solver] Error:', chrome.runtime.lastError.message);
            console.error('[Solver] Please check Service Worker in chrome://extensions/');
        } else {
            console.log('[Solver] ✅ Background script connected');
        }
    });

} // End of initialization guard