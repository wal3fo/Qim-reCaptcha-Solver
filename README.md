# Google reCaptcha Solver (Speech-to-Text Edition)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-v1.40+-orange)](https://playwright.dev/)

An automated, cost-effective solver for Google reCaptcha v2. This project leverages **Speech-to-Text (STT)** technology using [Wit.ai](https://wit.ai/) to solve audio challenges, eliminating the need for paid third-party solving services. It is built on **Playwright** for robust, stealthy browser automation.

## 🚀 Features

- **Cost-Free Solving**: Uses Wit.ai's free API for audio transcription.
- **Robust Automation**: Built with Playwright for reliable execution and auto-waiting.
- **Stealth Mode**: Includes custom stealth scripts to evade bot detection.
- **Proxy Support**: Configurable HTTP proxy with authentication.
- **Modular Design**: Clean separation of solver logic, speech recognition, and configuration.

## 📋 Prerequisites

- **Node.js**: v14 or higher
- **Wit.ai Token**: A free Server Access Token from [Wit.ai](https://wit.ai/).
- **Proxy (Optional)**: Recommended for heavy usage to avoid IP bans.

## 🛠️ Installation

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

## 🏃 Usage

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

- **`src/CaptchaSolver.js`**: Core logic utilizing Playwright Locators to interact with reCaptcha frames.
- **`src/SpeechRecognizer.js`**: Handles audio download and communication with Wit.ai API.
- **`src/Stealth.js`**: Injects JavaScript overrides to mask automation fingerprints.
- **`solver.js`**: Entry point orchestrating the browser session and solver instantiation.

## 🤝 Contributing

Contributions are welcome! Please check out [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This tool is for educational purposes only. Automated interaction with websites may violate their Terms of Service. Use responsibly.
