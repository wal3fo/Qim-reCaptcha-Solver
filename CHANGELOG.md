# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2024-03-15

### Added
- Speech-to-Text captcha solving using Wit.ai.
- Playwright integration for robust browser automation.
- Custom stealth module to evade detection.
- Configurable proxy and IP reset support.
- GitHub Actions for CI.

### Changed
- Migrated from Puppeteer to Playwright.
- Removed third-party captcha solver dependencies (2Captcha, AntiCaptcha).
- Refactored `CaptchaSolver` to use Locators and auto-waiting.
