# Google reCaptcha Solver (Chrome Extension)

This directory contains the Chrome Extension version of the solver.

## Installation

1.  Open Chrome and go to `chrome://extensions`.
2.  Enable **Developer mode** (toggle in the top right).
3.  Click **Load unpacked**.
4.  Select the `extension` folder in this repository.

## Configuration

1.  Click the extension icon in the toolbar.
2.  Enter your **Wit.ai Server Access Token**.
3.  Click **Save Settings**.

## Usage

Navigate to any page with a Google reCaptcha v2. The extension will automatically:
1.  Click the "I'm not a robot" checkbox.
2.  Switch to the Audio Challenge.
3.  Transcribe the audio using Wit.ai.
4.  Solve the captcha.

## Notes

- Ensure you have a valid internet connection to reach Wit.ai.
- If the IP is blocked by Google (too many requests), the solver might fail or the audio challenge might be disabled.
