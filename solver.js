import { chromium } from "playwright";
import log4js from "log4js";
import request from "request";
import userAgent from "user-agents";
import { CaptchaSolver } from "./src/CaptchaSolver.js";
import config from "./src/config.js";
import { applyStealth } from "./src/Stealth.js";

const logger = log4js.getLogger();
logger.level = process.env.LOG_LEVEL || 'debug';

const delay = ms => new Promise(res => setTimeout(res, ms));

const initGrabber = async () => {
    let browser;
    try {
        // Prepare Proxy Config
        const proxyConfig = config.proxy ? {
            server: config.proxy,
            username: process.env.PROXY_USERNAME,
            password: process.env.PROXY_PASSWORD
        } : undefined;

        if (proxyConfig) {
            logger.debug(`Using proxy: ${proxyConfig.server}`);
        } else {
            logger.debug('No proxy configured. Running directly.');
        }

        browser = await chromium.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled', // Basic stealth
                `--disable-extensions-except=${process.cwd()}\\extension`,
                `--load-extension=${process.cwd()}\\extension`
            ]
        });

        // Create a context with specific user agent and viewport
        const contextOptions = {
            userAgent: new userAgent().toString(),
            viewport: { width: 1280, height: 720 },
            ignoreHTTPSErrors: true,
            locale: 'en-US'
        };

        if (proxyConfig) {
            contextOptions.proxy = proxyConfig;
            contextOptions.httpCredentials = {
                username: proxyConfig.username,
                password: proxyConfig.password
            };
        }

        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();

        // Listen to browser console logs
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[Turnstile]') || text.includes('Turnstile')) {
                console.log('BROWSER:', text);
            }
        });

        // Apply advanced stealth scripts
        await applyStealth(page);

        // Initialize Solvers
        const reCaptchaSolver = new CaptchaSolver(page);

        try {
            logger.debug('Navigating to target...');
            // Using Turnstile demo URL (Nopecha is more reliable than peet.ws)
            await page.goto(`https://nopecha.com/demo/turnstile`, {
                waitUntil: 'networkidle',
                timeout: config.timeouts.navigation
            });
        } catch (error) {
            logger.warn('Navigation error:', error.message);
        }

        let isSolved = false;

        // Check for Cloudflare Turnstile
        logger.info('Checking for Cloudflare Turnstile...');
        // Let the extension handle it, just wait and observe
        try {
            logger.info('Waiting for solution...');
            await page.waitForFunction(() => {
                const input = document.querySelector('[name="cf-turnstile-response"]');
                // Also check for success text as alternate confirmation
                const successText = document.querySelector('#success-text, .success-message');
                return (input && input.value.length > 0) || (successText && successText.offsetParent !== null);
            }, { timeout: 25000 });

            logger.info('Turnstile solved by extension!');
            isSolved = true;
        } catch (e) {
            logger.warn('Turnstile not solved within timeout (or handled manually via logs).');
        }

        /* Manual solver disabled to test extension
        try {
            // Find iframe with Turnstile
            const turnstileFrame = page.frames().find(f => f.url().includes('challenges.cloudflare.com'));
        
            if (turnstileFrame) {
                logger.info('Turnstile iframe detected. Attempting to click...');
        
                // Usually just clicking the checkbox is enough
                const selectors = ['input[type="checkbox"]', '.ctp-checkbox-label', '#challenge-stage label'];
                const checkbox = await turnstileFrame.waitForSelector(selectors.join(','), { timeout: 5000 }).catch(() => null);
        
                if (checkbox) {
                    await delay(1000 + Math.random() * 500);
                    await checkbox.click();
                    logger.info('Clicked Turnstile checkbox.');
        
                    // Wait for success
                    await page.waitForFunction(() => {
                        // Check if the widget has success state or token input is filled
                        const input = document.querySelector('[name="cf-turnstile-response"]');
                        return input && input.value.length > 0;
                    }, { timeout: 10000 }).catch(() => null);
        
                    isSolved = true;
                    logger.info('Turnstile solved (token generated).');
                } else {
                    logger.warn('Turnstile detected but checkbox not found.');
                }
            } else {
                // Try finding via main page selector if iframe is cross-origin restricted
                const turnstileContainer = await page.$('.cf-turnstile');
                if (turnstileContainer) {
                    logger.info('Turnstile container found. Waiting for widget...');
                    await delay(2000);
                    // Often needs to click inside the iframe
                }
            }
        } catch (err) {
            logger.error('Error solving Turnstile:', err);
        }
        */

        if (!isSolved) {
            // Fallback to reCaptcha
            logger.info('Turnstile not solved or not present. Checking for reCaptcha...');
            isSolved = await reCaptchaSolver.solve();
        }

        if (isSolved) {
            try {
                // Generic success check
                logger.info('Captcha solved successfully!');
            } catch (e) {
                logger.error('Failed to submit form', e);
            }
        } else {
            logger.warn('Captcha was not solved.');
        }

    } catch (error) {
        logger.warn('Critical error in grabber:', error);
    } finally {
        if (browser) await browser.close();

        // IP Reset Logic
        if (config.ipResetUrl) {
            try {
                logger.debug(`Attempting IP reset via ${config.ipResetUrl}...`);
                await new Promise((resolve, reject) => {
                    request.get(config.ipResetUrl, { timeout: 5000 }, (err, res, body) => {
                        if (err) reject(err);
                        else resolve(body);
                    });
                });
                logger.info('IP reset successful.');
            } catch (e) {
                // Log but do not crash.
                logger.warn(`Failed to reset IP: ${e.message}`);
            }
        } else {
            logger.debug('Skipping IP reset (no URL configured).');
        }

        // Restart loop
        await delay(5000);
        initGrabber();
    }
};

initGrabber();
