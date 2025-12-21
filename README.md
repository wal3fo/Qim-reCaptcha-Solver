# Google reCaptcha Solver (Speech-to-Text Edition)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-v1.40+-orange)](https://playwright.dev/)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-googlechrome.svg)](https://www.google.com/chrome/)

A comprehensive solution for automating Google reCaptcha v2 challenges using **Speech-to-Text (STT)** technology. This repository provides two powerful tools:

1.  **Chrome Extension**: A browser extension that automatically solves captchas on any webpage you visit.
2.  **Node.js Solver**: A standalone script using Playwright for server-side automation and scraping tasks.

Both tools leverage [Wit.ai](https://wit.ai/) (free) to transcribe audio challenges, eliminating the need for expensive third-party solving services.

## 🚀 Features

### Core Features
-   **Cost-Free Solving**: Utilizes Wit.ai's free API for high-accuracy audio transcription.
-   **Smart Logic**: Automatically handles the entire flow: clicking the checkbox, selecting the audio challenge, transcribing, and verifying.
-   **Stealthy**: Implements human-like behavior (random delays, realistic typing simulation) to avoid detection.
-   **Error Recovery**: Automatically reloads challenges if blocked or if transcription fails.

### Chrome Extension Specifics
-   **Plug-and-Play**: Works on any website containing a reCaptcha v2 frame.
-   **User-Friendly UI**: Simple popup interface to manage your API token.
-   **Background Processing**: Handles audio downloads and API calls efficiently in a service worker.

### Node.js Solver Specifics
-   **Headless Support**: Runs in headless Chromium via Playwright.
-   **Stealth Plugins**: Includes custom scripts to mask automation fingerprints (WebDriver, permissions, etc.).
-   **Proxy Support**: Configurable HTTP/HTTPS proxy support for large-scale operations.

## 📋 Prerequisites

-   **Wit.ai Token**: A free Server Access Token from [Wit.ai](https://wit.ai/).
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
4.  Navigate to any page with a Google reCaptcha v2. The extension will automatically detect and attempt to solve it.

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
1.  Launch a stealthy Chromium instance.
2.  Navigate to the target page (default: Google reCaptcha Demo).
3.  Detect and solve the captcha using audio transcription.
4.  Submit the form upon success.

## 🏗️ Architecture

-   **`extension/`**: Contains the Chrome Extension source code (Manifest V3).
    -   `background.js`: Service worker for API communication.
    -   `content.js`: Page script for DOM interaction and typing simulation.
    -   `popup/`: Settings UI.
-   **`src/`**: Core logic for the Node.js solver.
    -   `CaptchaSolver.js`: Playwright-based solver class.
    -   `SpeechRecognizer.js`: Node.js implementation of Wit.ai client.
    -   `Stealth.js`: Anti-detection scripts.
-   **`solver.js`**: Entry point for the Node.js automation.

## 🤝 Contributing

Contributions are welcome! Please check out [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This tool is for educational purposes only. Automated interaction with websites may violate their Terms of Service. Use responsibly.
