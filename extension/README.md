# Qim reCaptcha Solver (Chrome Extension)

A powerful, automated solver for Google reCaptcha v2 challenges. This extension operates locally within the browser, prioritizing privacy and speed.

## Features

### Google reCaptcha v2 Solver
- **Method:** Audio Challenge Transcription (Speech-to-Text).
- **Engine:** Uses Wit.ai API for accurate audio transcription.
- **Workflow:**
  1.  Detects reCaptcha widget.
  2.  Clicks "I'm not a robot".
  3.  Switches to Audio Challenge.
  4.  Downloads audio, sends to Wit.ai, and types the transcribed text.
  5.  Verifies the solution.

## Installation

1.  **Clone/Download** this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer mode** (toggle in the top right).
4.  Click **Load unpacked**.
5.  Select the `extension` folder from this project.

## Configuration

### Required for reCaptcha
To solve Google reCaptcha, you need a free Wit.ai Server Access Token.

1.  Go to [https://wit.ai/](https://wit.ai/) and log in with your Facebook/Meta account.
2.  Create a new App (e.g., "CaptchaSolver").
3.  Go to **Management > Settings**.
4.  Copy the **Server Access Token**.
5.  Click the **Qim Solver extension icon** in your browser toolbar.
6.  Paste the token into the "Wit.ai Server Access Token" field and click **Save Settings**.

## Troubleshooting

- **reCaptcha Audio Challenge Disabled:** If Google detects too much automated traffic from your IP, they may temporarily disable the audio challenge. Try changing your IP (VPN/Proxy) or waiting a few hours.
- **Extension Errors:** Check `chrome://extensions` > "Errors" for any logs.
- **Console Logs:** Open the browser's Developer Tools (F12) > Console to see detailed logs.

## Privacy

- Audio files are sent to Wit.ai (Meta) for transcription only.
- No other browsing data is collected or sent to any third-party servers.
