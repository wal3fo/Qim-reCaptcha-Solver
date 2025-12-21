// Content Script - Runs in the page (and iframes)

// Configuration
const CONFIG = {
    checkInterval: 1000,
    typingSpeed: { min: 30, max: 70 }
};

// API Configuration (2Captcha)
// Replace 'YOUR_API_KEY' with your actual 2Captcha API Key
const API_CONFIG = {
    apiKey: 'YOUR_API_KEY',
    enabled: false // Set to true to enable API solving instead of Clicker
};

// State
let isSolving = false;

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
                    console.log('Transcription received:', response.text);

                    await sleep(randomDelay(500, 1000));
                    await simulateTyping(responseInput, response.text);

                    await sleep(randomDelay(500, 1000));
                    verifyBtn.click();
                } else {
                    console.error('Transcription failed:', response ? response.error : 'Unknown error');
                    // Reload audio?
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

// ==========================================
// CLOUDFLARE TURNSTILE SOLVER (Refactored)
// ==========================================
class TurnstileSolver {
    constructor() {
        this.maxAttempts = 30;
        this.attempts = 0;
        this.solved = false;
        this.active = false;
        this.widgetSelector = '.cf-turnstile, iframe[src*="challenges.cloudflare.com"], iframe[id^="cf-chl-widget-"]';

        // Stabilization for 0x0 or loading frames
        this.stabilizationAttempts = 0;
        this.maxStabilizationAttempts = 20; // ~40 seconds
    }

    /**
     * Main check function called periodically
     */
    async check() {
        // 1. Context Check: Are we in a Cloudflare iframe?
        if (!this.isCloudflareFrame()) {
            this.detectWidgetsOnMainPage();
            return;
        }

        // If API Solving is enabled, we skip the internal iframe clicker logic
        if (API_CONFIG.enabled) {
            return;
        }

        // 2. Load Check
        if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
            return;
        }

        // 3. Status Check
        const status = this.getFrameStatus();

        if (status === 'FATAL') {
            if (!this.failureLogged) {
                console.log(`[Turnstile-V2] Frame Skipped (FATAL). Size: ${window.innerWidth}x${window.innerHeight}`);
                this.failureLogged = true;
            }
            return;
        }

        if (status === 'WAITING') {
            // Just return, let it stabilize
            return;
        }

        this.failureLogged = false;

        // 4. Initialization (Visuals)
        if (!this.active) {
            this.init();
        }

        // 5. Solve Attempt
        // Debugging: Log why we are (or aren't) solving
        if (!this.solved && this.attempts < this.maxAttempts) {
            await this.solve();
        } else if (this.attempts >= this.maxAttempts) {
            console.log('[Turnstile] Max attempts reached.');
        } else if (this.solved) {
            // Already solved, silent return
        }
    }

    isCloudflareFrame() {
        return window.location.hostname.includes('challenges.cloudflare.com');
    }

    getFrameStatus() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const href = window.location.href;

        // A. Is this a standard visible widget?
        const isStandardWidget = (width > 150 && height >= 50);

        // B. Critical Error URLs (unless standard widget)
        if (!isStandardWidget && (href.includes('/failure') || href.includes('/error') || href.includes('error='))) {
            if (!href.includes('failure_retry')) return 'FATAL';
        }

        // C. DOM Error Text (unless standard widget)
        if (!isStandardWidget) {
            const bodyText = document.body.innerText;
            if (bodyText.match(/Error|400 Bad Request|400070/i)) return 'FATAL';
        }

        // D. Dimension / Content Logic
        // If 0x0 or very small
        if (width < 50 || height < 50) {
            // Check if there is ANY content
            const hasContent = document.querySelector('.ctp-checkbox-container, input[type="checkbox"], .cb-lb, #challenge-stage');

            if (hasContent) {
                // Content exists, but frame is small. 
                // This implies an "Invisible" challenge OR a rendering glitch.
                // We should treat it as READY to attempt solving (might be a hidden input click).
                console.log(`[Turnstile] Small frame (${width}x${height}) with content detected. Proceeding.`);
                return 'READY';
            }

            // No content AND small.
            if (this.stabilizationAttempts < this.maxStabilizationAttempts) {
                this.stabilizationAttempts++;
                if (this.stabilizationAttempts % 5 === 0) {
                    console.log(`[Turnstile] Frame 0x0/Empty. Stabilizing... (${this.stabilizationAttempts}/${this.maxStabilizationAttempts})`);
                }
                return 'WAITING';
            }

            // Timed out waiting for render
            // Instead of FATAL, we assume it's an invisible widget that just didn't render DOM content we recognize.
            // We return READY so the solver can attempt the blind click strategy.
            console.log(`[Turnstile] Stabilization timeout (${this.maxStabilizationAttempts} attempts). Assuming invisible widget. Proceeding.`);
            return 'READY';
        }

        // Reset stabilization if we have good dimensions
        this.stabilizationAttempts = 0;
        return 'READY';
    }

    init() {
        this.active = true;
        document.body.dataset.turnstileSolverActive = 'true';
        // Use a less intrusive border for invisible ones?
        if (window.innerWidth > 50) {
            document.body.style.border = '2px dotted #CDDC39';
        }
        console.log('[Turnstile-V2] Solver active in frame:', window.location.href);
    }

    detectWidgetsOnMainPage() {
        const widgets = document.querySelectorAll(this.widgetSelector);
        if (widgets.length > 0) {
            widgets.forEach(widget => {
                if (!widget.dataset.detected) {
                    widget.dataset.detected = 'true';
                    const sitekey = widget.dataset.sitekey || widget.getAttribute('data-sitekey') || 'unknown';
                    console.log(`[Turnstile] Widget detected on main page. Sitekey: ${sitekey}`, widget);

                    // Visual indicator on the widget container
                    widget.style.border = '2px dashed #FF9800'; // Orange = Detected

                    // API Solver Trigger
                    if (API_CONFIG.enabled && sitekey !== 'unknown') {
                        this.solveWithAPI(widget, sitekey);
                    }
                }
            });
        }

        // Monitor for Solution (The "How to solve" part from the screen)
        // The screen says: "token is sent through the input with name='cf-turnstile-response'"
        const responseInputs = document.querySelectorAll('input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]');
        responseInputs.forEach(input => {
            if (input.value && !input.dataset.logged) {
                input.dataset.logged = 'true';
                console.log(`[Turnstile] Solution Token captured on Main Page: ${input.value.substring(0, 20)}...`);

                // Find the closest widget and mark it green
                const widget = input.closest('form')?.querySelector(this.widgetSelector) || document.querySelector(this.widgetSelector);
                if (widget) {
                    widget.style.border = '2px solid #4CAF50'; // Green = Solved
                }
            }
        });
    }

    async solveWithAPI(widget, sitekey) {
        if (!API_CONFIG.enabled || API_CONFIG.apiKey === 'YOUR_API_KEY') {
            console.warn('[Turnstile-API] API Key not configured. Please edit content.js to add your 2Captcha Key.');
            return;
        }

        if (widget.dataset.apiSolving) return;
        widget.dataset.apiSolving = 'true';

        console.log(`[Turnstile-API] Sending request for sitekey: ${sitekey}`);
        widget.style.border = '2px dashed #2196F3'; // Blue = API Solving

        try {
            // 1. Send Request
            const inUrl = `https://2captcha.com/in.php?key=${API_CONFIG.apiKey}&method=turnstile&sitekey=${sitekey}&pageurl=${window.location.href}&json=1`;
            const inResp = await fetch(inUrl).then(r => r.json());

            if (inResp.status !== 1) {
                console.error('[Turnstile-API] Error sending captcha:', inResp);
                widget.style.border = '2px solid #F44336'; // Red = Error
                widget.dataset.apiSolving = 'false';
                return;
            }

            const id = inResp.request;
            console.log(`[Turnstile-API] Captcha ID: ${id}. Polling...`);

            // 2. Poll for Result
            let attempts = 0;
            while (attempts < 60) { // 3 minutes timeout (60 * 5s)
                await sleep(5000); // Wait 5s
                attempts++;

                const resUrl = `https://2captcha.com/res.php?key=${API_CONFIG.apiKey}&action=get&id=${id}&json=1`;
                const resResp = await fetch(resUrl).then(r => r.json());

                if (resResp.status === 1) {
                    console.log('[Turnstile-API] Solved! Token:', resResp.request);
                    this.injectToken(widget, resResp.request);
                    return;
                }

                if (resResp.request !== 'CAPCHA_NOT_READY') {
                    console.error('[Turnstile-API] Error polling:', resResp);
                    widget.style.border = '2px solid #F44336';
                    break;
                }
            }
        } catch (e) {
            console.error('[Turnstile-API] Exception:', e);
            widget.style.border = '2px solid #F44336';
        }
    }

    injectToken(widget, token) {
        // Find the input in the same form or container
        const form = widget.closest('form') || document.body;
        let input = form.querySelector('input[name="cf-turnstile-response"]');

        if (!input) {
            // Create if missing (sometimes dynamically injected)
            input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'cf-turnstile-response';
            if (widget.parentNode) widget.parentNode.appendChild(input);
            else form.appendChild(input);
        }

        // Set value
        input.value = token;

        // Dispatch events
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // Also g-recaptcha-response often used as fallback
        const gInput = form.querySelector('input[name="g-recaptcha-response"]');
        if (gInput) {
            gInput.value = token;
            gInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Trigger callback if defined (optional, often 'turnstile.render' has callback)
        // We can't easily call the JS callback from content script due to isolation.
        // But injecting the input is usually enough for form submissions.

        console.log('[Turnstile-API] Token injected successfully.');
        widget.style.border = '2px solid #00BCD4'; // Cyan = API Solved
    }

    async solve() {
        // Check if already solved (hidden token)
        if (this.isSolved()) {
            this.markSolved();
            return;
        }

        console.log('[Turnstile] Attempting solve... Attempt:', this.attempts + 1);

        this.attempts++;
        const target = this.findTarget();

        if (target) {
            console.log(`[Turnstile] Target found: ${target.tagName}.${target.className}`);
            await this.clickTarget(target);
            this.markSolved();
        } else {
            // Fallback: Just click inside the iframe (Body/Center)
            await this.executeBlindClick();

            // Debug Log
            if (this.attempts % 5 === 0) {
                console.log(`[Turnstile] Clicking background... (${this.attempts}/${this.maxAttempts})`);
            }
        }
    }

    isSolved() {
        // Check for the hidden token input
        const responseInput = document.querySelector('input[name="cf-turnstile-response"]');
        if (responseInput && responseInput.value) return true;

        // Check for success text/icon
        if (document.querySelector('#success-text') || document.querySelector('#success-icon')) return true;

        return false;
    }

    markSolved() {
        this.solved = true;
        document.body.style.border = '2px solid #4CAF50'; // Green = Solved
        console.log('[Turnstile] Solved!');
    }

    findTarget() {
        // Selectors in order of preference
        const selectors = [
            // User provided specific selector (and variations)
            '#SoGDz7 > div > label > input[type=checkbox]',
            '#SoGDz7 input[type=checkbox]',

            // Standard Cloudflare selectors
            '.cb-lb-t',                // Specific text label
            'input[type="checkbox"]',  // The actual checkbox
            '.ctp-checkbox-label',     // Label wrapper
            'label.ctp-checkbox-label',

            // Structural fallbacks
            'div > label > input[type="checkbox"]',
            'label > input[type="checkbox"]',

            // Generic fallbacks
            '.ctp-checkbox-container', // Container
            'label',                   // Generic label
            'input'                    // Any input
        ];

        // 1. Try standard DOM
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && this.isVisible(el)) return el;
        }

        // 2. Try Shadow DOM (Deep traversal)
        const shadowEl = this.findInShadow(document.body, selectors);
        if (shadowEl) return shadowEl;

        // 3. Try Nested Iframes (Recursive check for nested widgets)
        const nestedIframes = document.querySelectorAll('iframe');
        for (const iframe of nestedIframes) {
            try {
                // Check if we can access content (Same Origin)
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                if (doc) {
                    // Search in this iframe's DOM
                    for (const sel of selectors) {
                        const el = doc.querySelector(sel);
                        if (el && this.isVisible(el)) {
                            console.log(`[Turnstile] Target found in nested iframe: ${sel}`);
                            return el;
                        }
                    }
                    // Search in this iframe's Shadow DOM
                    const shadowInFrame = this.findInShadow(doc.body, selectors);
                    if (shadowInFrame) {
                        console.log(`[Turnstile] Target found in nested iframe Shadow DOM`);
                        return shadowInFrame;
                    }
                }
            } catch (e) {
                // Cross-origin restriction, cannot peer into this iframe
                // This is expected for some nested frames
            }
        }

        return null;
    }

    findInShadow(root, selectors) {
        if (!root) return null;

        // TreeWalker to find all shadow roots
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let node;
        while (node = walker.nextNode()) {
            if (node.shadowRoot) {
                // Check this shadow root
                for (const sel of selectors) {
                    const el = node.shadowRoot.querySelector(sel);
                    if (el && this.isVisible(el)) return el;
                }
                // Recursive check (nested shadows)
                const found = this.findInShadow(node.shadowRoot, selectors);
                if (found) return found;
            }
        }
        return null;
    }

    isVisible(el) {
        // Basic visibility check
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    // ... (rest of methods)

    async clickTarget(element) {
        console.log(`[Turnstile] Attempting robust interaction with <${element.tagName}>...`);

        // 1. Scroll into view (Ensure visibility)
        try {
            element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        } catch (e) { }
        await sleep(randomDelay(100, 300));

        // 2. Focus
        try { element.focus({ preventScroll: true }); } catch (e) { }

        // 3. Primary Interaction Strategy: Dispatch Complex Events
        await this.dispatchClickEvents(element);

        // 4. Verification & Fallback Strategy
        await sleep(300);

        // If it's a checkbox, check state
        if (element.tagName === 'INPUT' && element.type === 'checkbox') {
            if (element.checked) {
                console.log('[Turnstile] Verification: Checkbox is CHECKED.');
                return;
            } else {
                console.warn('[Turnstile] Verification: Checkbox NOT checked. executing Fallbacks...');
            }

            // Fallback A: Native JS Click
            console.log('[Turnstile] Fallback A: Native Element Click');
            element.click();
            await sleep(200);
            if (element.checked) return;

            // Fallback B: Click Parent Label (Common in frameworks)
            const label = element.closest('label');
            if (label) {
                console.log('[Turnstile] Fallback B: Clicking Parent Label');
                await this.dispatchClickEvents(label);
                await sleep(200);
                if (element.checked) return;
            }

            // Fallback C: Click Parent Container
            const container = element.closest('div');
            if (container) {
                console.log('[Turnstile] Fallback C: Clicking Parent Container');
                await this.dispatchClickEvents(container);
            }
        }
    }

    async dispatchClickEvents(element) {
        const rect = element.getBoundingClientRect();
        // Target center with slight randomization
        const x = rect.left + (rect.width / 2) + (Math.random() * 2 - 1);
        const y = rect.top + (rect.height / 2) + (Math.random() * 2 - 1);

        const eventOptions = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            screenX: x + window.screenX,
            screenY: y + window.screenY,
            pointerId: 1,
            width: 1,
            height: 1,
            pressure: 0.5,
            isPrimary: true
        };

        // Modern Pointer Events + Legacy Mouse Events
        const eventTypes = [
            { type: 'pointerover', cls: PointerEvent },
            { type: 'mouseover', cls: MouseEvent },
            { type: 'pointerdown', cls: PointerEvent },
            { type: 'mousedown', cls: MouseEvent },
            { type: 'focus', cls: FocusEvent }, // Ensure focus
            { type: 'pointerup', cls: PointerEvent },
            { type: 'mouseup', cls: MouseEvent },
            { type: 'click', cls: MouseEvent }
        ];

        for (const evt of eventTypes) {
            let e;
            if (evt.type === 'focus') {
                element.focus();
                continue;
            } else {
                e = new evt.cls(evt.type, eventOptions);
            }

            element.dispatchEvent(e);

            // Pause between down and up
            if (evt.type.includes('down')) {
                await sleep(randomDelay(50, 150));
            }
        }
    }

    async executeBlindClick() {
        console.log('[Turnstile] Executing Blind Click Strategy...');

        // 1. Checkbox Area (Left side) - Most likely target
        // Turnstile widget is usually 300x65. Checkbox center is ~28px, 32px.
        const coords = [
            { x: 28, y: 32, label: 'Checkbox Area' },
            { x: window.innerWidth / 2, y: window.innerHeight / 2, label: 'Center' }
        ];

        for (const point of coords) {
            console.log(`[Turnstile] Blind Click: ${point.label} (${point.x}, ${point.y})`);
            const el = document.elementFromPoint(point.x, point.y) || document.body;

            // Focus
            el.focus({ preventScroll: true });

            const eventOptions = {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: point.x,
                clientY: point.y,
                screenX: point.x + window.screenX,
                screenY: point.y + window.screenY,
                pointerId: 1,
                width: 1,
                height: 1,
                pressure: 0.5,
                isPrimary: true
            };

            // Dispatch Pointer Events (Modern) & Mouse Events (Legacy)
            const eventTypes = [
                { type: 'pointerover', cls: PointerEvent },
                { type: 'mouseover', cls: MouseEvent },
                { type: 'pointerdown', cls: PointerEvent },
                { type: 'mousedown', cls: MouseEvent },
                { type: 'pointerup', cls: PointerEvent },
                { type: 'mouseup', cls: MouseEvent },
                { type: 'click', cls: MouseEvent }
            ];

            for (const evt of eventTypes) {
                const e = new evt.cls(evt.type, eventOptions);
                el.dispatchEvent(e);
                if (evt.type.includes('down')) await sleep(50 + Math.random() * 50);
            }

            await sleep(100);
        }
    }
}

// Instantiate
const turnstileSolver = new TurnstileSolver();

// Listen for messages from background
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'show_notification') {
        alert(request.message);
    }
});

// Start Loops
setInterval(solveLoop, CONFIG.checkInterval); // ReCaptcha
setInterval(() => turnstileSolver.check(), 2000); // Turnstile

console.log('Google reCaptcha & Turnstile Solver extension loaded (v2.4).');
