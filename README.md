# Google reCaptcha & Cloudflare Turnstile Solver (Audio)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-v1.40+-orange)](https://playwright.dev/)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-googlechrome.svg)](https://www.google.com/chrome/)

A comprehensive solution for automating **Google reCaptcha v2** and **Cloudflare Turnstile** challenges. This repository provides two powerful tools:

1.  **Chrome Extension**: A browser extension that automatically solves captchas on any webpage you visit.
2.  **Node.js Solver**: A standalone script using Playwright for server-side automation and scraping tasks.

## 🚀 Features

### Core Features
-   **Google reCaptcha v2 Support**: Solves reCaptcha Audio challenges with optimized stealth processing.
-   **Cloudflare Turnstile Support**: Automatically detects and solves Cloudflare Turnstile captchas.
-   **Cost-Free Solving**: Utilizes Wit.ai's free API for audio transcription.
-   **Smart Logic**: Automatically handles the entire flow: clicking checkboxes, switching to audio mode, transcribing, and verifying tokens.
-   **Advanced Stealth**: Implements comprehensive anti-detection techniques including:
    - Hidden audio processing (no console logs, silent API calls)
    - Human-like typing patterns with variable speeds and pauses
    - WebDriver masking and fingerprint protection
    - Canvas and WebGL fingerprint randomization
-   **Error Recovery**: Automatically reloads challenges if blocked or if transcription fails.

### Chrome Extension Specifics
-   **Plug-and-Play**: Works on any website containing supported captcha frames.
-   **User-Friendly UI**: Simple popup interface to manage your Wit.ai token and view solver status.
-   **Background Processing**: Handles audio downloads and API calls efficiently in a service worker.

### Node.js Solver Specifics
-   **Playwright Automation**: Uses Playwright for robust, cross-browser automation.
-   **Stealth Plugins**: Includes custom scripts to mask automation fingerprints (WebDriver, permissions, etc.).
-   **Proxy Support**: Configurable HTTP/HTTPS proxy support for large-scale operations.

## 📋 Prerequisites

-   **Wit.ai Token**: A free Server Access Token from [Wit.ai](https://wit.ai/) (Required).
    1.  Create a new app on Wit.ai.
    2.  Go to **Management > Settings**.
    3.  Copy the **Server Access Token**.

## 🧩 Option 1: Chrome Extension

### Installation
1.  Clone or download this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** (toggle in the top right).
4.  Click **Load unpacked**.
5.  Select the `extension` directory from this project.

### Usage
1.  Click the extension icon in the Chrome toolbar.
2.  Enter your **Wit.ai Server Access Token**.
3.  Click **Save Settings**.
4.  Navigate to any page with a Google reCaptcha or Cloudflare Turnstile. The extension will automatically detect and attempt to solve it.

---

## 💻 Option 2: Node.js Standalone Solver

### Installation
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/username/google-recaptcha-solver.git
    cd google-recaptcha-solver
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    npx playwright install --with-deps chromium
    ```

3.  **Configure Environment**:
    Copy `.env.example` to `.env` and fill in your details:
    ```bash
    cp .env.example .env
    ```
    
    Edit `.env`:
    ```env
    WIT_AI_TOKEN=your_wit_ai_token_here
    PROXY=http://user:pass@host:port  # Optional
    ```

### Usage
Run the main solver script:

```bash
node solver.js
```

The script will:
1.  Launch a stealthy Chromium instance (Headful mode is required for extension support).
2.  Navigate to the target page (Google reCaptcha Demo or any page with captcha).
3.  Automatically detect and solve reCaptcha or Turnstile using the loaded extension or internal logic.

### Playwright Implementation Details
The core logic resides in `src/CaptchaSolver.js`. It provides a `CaptchaSolver` class that:
-   **Auto-Detection**: Automatically detects whether the page contains reCaptcha or Turnstile.
-   **Manages Frames**: Automatically finds and switches to captcha iframes.
-   **Audio Solving**: Downloads and transcribes reCaptcha audio challenges using Wit.ai (silent mode).
-   **Turnstile Solving**: Handles Cloudflare Turnstile challenges with multiple click strategies.
-   **Human-like Typing**: Simulates natural typing patterns with variable speeds and pauses.
-   **Smart Waits**: Uses Playwright's auto-waiting locators to handle dynamic content loading.
-   **Error Handling**: Robust try-catch blocks to handle network failures, missing elements, or blocking.

## 🏗️ Architecture

-   **`extension/`**: Contains the Chrome Extension source code (Manifest V3).
    -   `background.js`: Service worker for API communication (silent audio processing).
    -   `content.js`: Page script for DOM interaction, typing simulation, and Turnstile support.
    -   `popup/`: Settings UI.
-   **`src/`**: Core logic for the Node.js solver.
    -   `CaptchaSolver.js`: Playwright-based solver class supporting both reCaptcha and Turnstile.
    -   `TurnstileSolver.js`: Dedicated Cloudflare Turnstile solver with multiple click strategies.
    -   `SpeechRecognizer.js`: Node.js implementation of Wit.ai client (optimized for stealth).
    -   `Stealth.js`: Advanced anti-detection scripts including audio processing hiding.
-   **`solver.js`**: Entry point for the Node.js automation.

## 🤝 Contributing

Contributions are welcome! Please check out [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This tool is for educational purposes only. Automated interaction with websites may violate their Terms of Service. Use responsibly.
