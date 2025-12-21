
import assert from 'assert';

// ==========================================
// MOCK ENVIRONMENT
// ==========================================
global.window = {
    location: {
        href: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
        hostname: 'challenges.cloudflare.com'
    },
    innerWidth: 0,
    innerHeight: 0,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    screenX: 0,
    screenY: 0
};

class MockElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.classList = { contains: () => false };
        this.style = {};
        this.dataset = {};
        this.value = '';
        this.children = [];
        this.offsetParent = {}; // Visible
    }
    focus() { }
    click() { }
    dispatchEvent() { }
    getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; }
    scrollIntoView() { }
    closest() { return null; }
}

global.document = {
    readyState: 'complete',
    body: {
        innerText: '',
        children: [],
        dataset: {},
        style: {},
        querySelector: () => null,
        querySelectorAll: () => []
    },
    querySelector: (sel) => null,
    querySelectorAll: () => [],
    createTreeWalker: () => ({ nextNode: () => null }),
    elementFromPoint: () => null,
    createElement: (tag) => new MockElement(tag.toUpperCase())
};

global.NodeFilter = { SHOW_ELEMENT: 1 };
global.KeyboardEvent = class { };
global.InputEvent = class { };
global.PointerEvent = class { };
global.MouseEvent = class { };
global.FocusEvent = class { };

// Mock Sleep
const sleep = (ms) => new Promise(r => setTimeout(r, 10)); // Fast sleep
const randomDelay = (min, max) => 1;

// ==========================================
// TARGET CODE (TurnstileSolver Class)
// ==========================================
// Copied from content.js for testing logic
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

    async check() {
        // 1. Context Check
        if (!this.isCloudflareFrame()) return;

        // 2. Load Check
        if (document.readyState !== 'complete' && document.readyState !== 'interactive') return;

        // 3. Status Check
        const status = this.getFrameStatus();

        if (status === 'FATAL') {
            if (!this.failureLogged) {
                console.log(`[TEST] FATAL: ${window.innerWidth}x${window.innerHeight}`);
                this.failureLogged = true;
            }
            return 'FATAL';
        }

        if (status === 'WAITING') {
            return 'WAITING';
        }

        this.failureLogged = false;

        // 4. Initialization
        if (!this.active) this.init();

        // 5. Solve Attempt
        if (!this.solved && this.attempts < this.maxAttempts) {
            await this.solve();
            return 'SOLVING';
        }
        return 'IDLE';
    }

    isCloudflareFrame() {
        return window.location.hostname.includes('challenges.cloudflare.com');
    }

    getFrameStatus() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const href = window.location.href;

        const isStandardWidget = (width > 150 && height >= 50);

        if (!isStandardWidget && (href.includes('/failure') || href.includes('/error') || href.includes('error='))) {
            if (!href.includes('failure_retry')) return 'FATAL';
        }

        if (!isStandardWidget) {
            const bodyText = document.body.innerText;
            if (bodyText.match(/Error|400 Bad Request|400070/i)) return 'FATAL';
        }

        if (width < 50 || height < 50) {
            const hasContent = document.querySelector('.ctp-checkbox-container, input[type="checkbox"], .cb-lb, #challenge-stage');

            if (hasContent) {
                return 'READY';
            }

            if (this.stabilizationAttempts < this.maxStabilizationAttempts) {
                this.stabilizationAttempts++;
                return 'WAITING';
            }
            return 'READY';
        }

        this.stabilizationAttempts = 0;
        return 'READY';
    }

    init() {
        this.active = true;
    }

    findTarget() {
        // Selectors
        const selectors = ['input[type="checkbox"]'];

        // 1. Standard
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el;
        }

        // 2. Nested Iframes (The logic we want to test)
        const nestedIframes = document.querySelectorAll('iframe');
        for (const iframe of nestedIframes) {
            try {
                const doc = iframe.contentDocument;
                if (doc) {
                    for (const sel of selectors) {
                        const el = doc.querySelector(sel);
                        if (el) return el;
                    }
                }
            } catch (e) { }
        }
        return null;
    }

    async solve() {
        this.attempts++;
        const target = this.findTarget ? this.findTarget() : null;

        if (target) {
            // Click target logic
            this.solved = true;
        } else {
            // Fallback: Immediate Blind Click
            if (this.executeBlindClick) await this.executeBlindClick();
        }
    }
}

// ==========================================
// TEST SUITE
// ==========================================
async function runTests() {
    console.log('Starting Unit Tests...');

    // Test 1: Stabilization Logic (0x0 start)
    console.log('Test 1: Stabilization Logic (0x0 start)');
    const solver = new TurnstileSolver();
    window.innerWidth = 0;
    window.innerHeight = 0;

    let result = await solver.check();
    assert.strictEqual(result, 'WAITING', 'Should be WAITING on first check (0x0)');
    assert.strictEqual(solver.stabilizationAttempts, 1, 'Should increment stabilization attempts');

    // Test 2: Timeout Logic
    console.log('Test 2: Timeout Logic');
    solver.stabilizationAttempts = 19;
    result = await solver.check(); // 20
    assert.strictEqual(result, 'WAITING', 'Should still wait at 20');

    result = await solver.check(); // 21 -> SOLVING (Timeout -> Invisible Assumption)
    assert.strictEqual(result, 'SOLVING', 'Should be SOLVING after max attempts (Timeout -> Invisible Assumption)');

    // Test 3: Expansion Logic
    console.log('Test 3: Expansion Logic');
    const solver2 = new TurnstileSolver();
    window.innerWidth = 0;

    await solver2.check(); // WAITING
    assert.strictEqual(solver2.stabilizationAttempts, 1);

    // Expand
    window.innerWidth = 300;
    window.innerHeight = 65;

    result = await solver2.check();
    assert.strictEqual(result, 'SOLVING', 'Should switch to SOLVING when dimensions match');
    assert.strictEqual(solver2.stabilizationAttempts, 0, 'Should reset stabilization attempts');

    // Test 4: Invisible but Content Logic
    console.log('Test 4: Invisible but Content Logic');
    const solver3 = new TurnstileSolver();
    window.innerWidth = 0;

    // Mock querySelector to return something
    document.querySelector = (sel) => {
        if (sel.includes('input')) return new MockElement('INPUT');
        return null;
    };

    result = await solver3.check();
    assert.strictEqual(result, 'SOLVING', 'Should SOLVE if content found despite small dimensions');

    // Test 5: No Target -> Immediate Blind Click
    console.log('Test 5: No Target -> Immediate Blind Click');
    const solver4 = new TurnstileSolver();
    window.innerWidth = 300;

    // Mock solve to track if blind click was called
    let blindClickCalled = false;
    solver4.executeBlindClick = async () => { blindClickCalled = true; };
    solver4.findTarget = () => null; // No target found

    await solver4.solve();
    assert.strictEqual(blindClickCalled, true, 'Should execute blind click immediately if no target found');

    // Test 6: Nested Iframe Target
    console.log('Test 6: Nested Iframe Target');
    const solver5 = new TurnstileSolver();
    window.innerWidth = 300;

    // Create nested iframe mock
    const nestedIframe = document.createElement('IFRAME');
    nestedIframe.contentDocument = {
        querySelector: (sel) => {
            if (sel === 'input[type="checkbox"]') return new MockElement('INPUT');
            return null;
        },
        body: { children: [] }
    };

    // Mock document.querySelectorAll to return our nested iframe
    document.querySelectorAll = (sel) => {
        if (sel === 'iframe') return [nestedIframe];
        return [];
    };

    // Should find target in nested iframe
    const target = solver5.findTarget();
    assert.ok(target, 'Should find target inside nested iframe');
    assert.strictEqual(target.tagName, 'INPUT', 'Target should be the input from nested iframe');

    // Test 7: Ready State 'interactive'
    console.log('Test 7: Ready State interactive');
    const solver6 = new TurnstileSolver();
    global.document.readyState = 'interactive'; // Simulate interactive state
    window.innerWidth = 300; // Standard size

    // Should return IDLE or SOLVING, not undefined (which means returned early)
    // Note: In our mock, solve() returns 'SOLVING' if it runs.
    // We need to reset active state or check return value
    const resultInteractive = await solver6.check();
    assert.notStrictEqual(resultInteractive, undefined, 'Should proceed when readyState is interactive');

    console.log('All Unit Tests Passed!');
}

runTests().catch(e => {
    console.error('Test Failed:', e);
    process.exit(1);
});
