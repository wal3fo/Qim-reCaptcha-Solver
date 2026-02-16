import { chromium } from "playwright";
import log4js from "log4js";
import userAgent from "user-agents";
import { CaptchaSolver } from "./src/CaptchaSolver.js";
import config from "./src/config.js";
import { applyStealth } from "./src/Stealth.js";
import path from 'path';

const logger = log4js.getLogger();
logger.level = process.env.LOG_LEVEL || 'debug';

const delay = ms => new Promise(res => setTimeout(res, ms));

async function main() {
    logger.info("Starting Solver Loop...");

    while (true) {
        let browser = null;
        try {
            // Prepare Proxy Config
            const proxyConfig = config.proxy ? {
                server: config.proxy,
                username: process.env.PROXY_USERNAME,
                password: process.env.PROXY_PASSWORD
            } : undefined;

            if (proxyConfig) {
                logger.debug(`Using proxy: ${proxyConfig.server}`);
            }

            const extensionPath = path.join(process.cwd(), 'extension');

            // Launch Browser
            // Note: We use Chromium because we are loading a Chrome Extension.
            // Firefox/WebKit support for loading unpacked extensions varies or requires different setup.
            browser = await chromium.launch({
                headless: false, // Must be false for extension
                args: [
                    '--no-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    `--disable-extensions-except=${extensionPath}`,
                    `--load-extension=${extensionPath}`
                ]
            });

            // Create Context
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

            // Apply Stealth
            await applyStealth(page);

            // Initialize Solver
            const captchaSolver = new CaptchaSolver(page);

            // Navigate
            try {
                logger.debug('Navigating to target...');
                // Using Google reCaptcha v2 Demo
                await page.goto(`https://www.google.com/recaptcha/api2/demo`, {
                    waitUntil: 'networkidle',
                    timeout: config.timeouts.navigation
                });
            } catch (error) {
                logger.warn('Navigation error:', error.message);
            }

            let isSolved = false;

            // Check for reCaptcha or Turnstile
            logger.info('Checking for captcha (reCaptcha or Turnstile)...');
            isSolved = await captchaSolver.solve();

            if (isSolved) {
                logger.info('Captcha solved successfully!');
                // Here you would normally submit the form or extract data
            } else {
                logger.warn('Captcha was not solved.');
            }

        } catch (error) {
            logger.error('Critical error in solver loop:', error);
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (e) {
                    logger.error('Error closing browser:', e);
                }
            }

            // IP Reset Logic
            if (config.ipResetUrl) {
                try {
                    logger.debug(`Attempting IP reset via ${config.ipResetUrl}...`);
                    const response = await fetch(config.ipResetUrl);
                    if (response.ok) {
                        logger.info('IP reset successful.');
                    } else {
                        logger.warn(`IP reset failed with status: ${response.status}`);
                    }
                } catch (e) {
                    logger.warn(`Failed to reset IP: ${e.message}`);
                }
            }

            // Delay before restart
            logger.info('Waiting 5 seconds before restart...');
            await delay(5000);
        }
    }
}

main();
