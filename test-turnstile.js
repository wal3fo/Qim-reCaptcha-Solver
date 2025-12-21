import { chromium } from 'playwright';

/**
 * Cloudflare Turnstile Verification Test
 * 
 * This script verifies the selectors and interaction logic used in the Chrome Extension
 * against a live Turnstile demo page.
 */
(async () => {
    console.log('Starting Turnstile Verification Test...');
    const browser = await chromium.launch({ headless: false }); // Headless: false to see interaction
    const page = await browser.newPage();

    // Forward console logs from the browser to the terminal
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    try {
        // 1. Navigate to a reliable Turnstile demo
        console.log('Navigating to NopeCHA Turnstile Demo...');
        await page.goto('https://nopecha.com/demo/turnstile', { waitUntil: 'networkidle' });

        // 2. Wait for the Turnstile iframe to load
        console.log('Waiting for Turnstile iframe...');
        const frameElement = await page.waitForSelector('iframe[src*="challenges.cloudflare.com"]', { timeout: 10000 });
        const frame = await frameElement.contentFrame();

        if (!frame) {
            throw new Error('Could not access Turnstile iframe content.');
        }

        console.log('Iframe found. Analyzing DOM...');

        // 3. Inject the "findElement" logic (Mimicking content.js)
        // We evaluate this INSIDE the iframe context
        const result = await frame.evaluate(() => {
            const findElement = (root, selector) => {
                if (!root) return null;
                const el = root.querySelector(selector);
                if (el) return el;

                // Deep traversal for Shadow DOM
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
                let node;
                while (node = walker.nextNode()) {
                    if (node.shadowRoot) {
                        const found = findElement(node.shadowRoot, selector);
                        if (found) return found;
                    }
                }
                return null;
            };

            const selectors = [
                '.cb-lb-t',
                '.ctp-checkbox-label',
                'label.ctp-checkbox-label',
                '.ctp-checkbox-container',
                'input[type="checkbox"]'
            ];

            for (const selector of selectors) {
                const el = findElement(document, selector);
                if (el) return { found: true, selector: selector, tagName: el.tagName };
            }

            return { found: false, html: document.body.innerHTML };
        });

        // 4. Report Findings
        if (result.found) {
            console.log(`✅ SUCCESS: Found target element using selector: "${result.selector}" (${result.tagName})`);

            // 5. Attempt Interaction (Test Click)
            console.log('Attempting click interaction...');

            // We need to click specifically where the element is
            // Playwright click might be too perfect, so we just use standard click here for verification
            await frame.click(result.selector);

            // Wait for success state
            console.log('Click sent. Waiting for success verification...');
            // Wait for potential token input or success message
            // Note: On nopecha demo, it might just show a success message in the parent frame

            // We'll wait a bit
            await page.waitForTimeout(3000);
            console.log('Test complete. Please visually verify if the captcha turned green.');

        } else {
            console.error('❌ FAILURE: Could not find target element in iframe.');
            console.log('Dumped HTML (first 500 chars):', result.html.substring(0, 500));
        }

    } catch (error) {
        console.error('Test Failed:', error.message);
    } finally {
        // Keep browser open briefly to inspect
        await page.waitForTimeout(5000);
        await browser.close();
    }
})();
