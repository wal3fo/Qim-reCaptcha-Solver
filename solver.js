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

        // Apply advanced stealth scripts
        await applyStealth(page);

        try {
            logger.debug('Navigating to target...');
            // Using the demo URL as per user's latest edit
            await page.goto(`https://www.google.com/recaptcha/api2/demo`, {
                waitUntil: 'networkidle',
                timeout: config.timeouts.navigation
            });
        } catch (error) {
            logger.warn('Navigation error:', error.message);
        }

        // Initialize and run the new Speech-to-Text Captcha Solver
        const solver = new CaptchaSolver(page);
        const isSolved = await solver.solve();

        if (isSolved) {
            try {
                // Check if there is a post button (Demo page has 'recaptcha-demo-submit')
                const submitBtn = page.locator('#recaptcha-demo-submit');
                if (await submitBtn.count() > 0) {
                    await submitBtn.click();
                    await delay(2000);
                    logger.info('Demo form submitted!');
                } else {
                    // Fallback for the original site button
                    const postBut = page.locator('#postbut');
                    if (await postBut.count() > 0) {
                        await postBut.click();
                        await delay(5048);
                        logger.info('Vote validé !');
                    }
                }
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
