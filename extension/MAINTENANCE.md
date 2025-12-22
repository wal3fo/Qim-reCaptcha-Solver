# Maintenance & Developer Guide

This document provides technical details, architecture overview, and maintenance instructions for the Qim reCaptcha Solver extension.

## Architecture Overview

The extension follows the standard Chrome Extension Manifest V3 architecture:

1.  **`manifest.json`**: Entry point defining permissions and scripts.
2.  **`content.js`**:
    -   Injects into `<all_urls>`.
    -   Contains the core logic for detecting and interacting with captcha widgets.
    -   **Key Components:**
        -   `solveLoop()`: Async loop for Google reCaptcha v2 (checkbox + audio).
        -   `PerformanceMetrics` (class): Tracks success rates and timing.
3.  **`background.js`**:
    -   Service Worker.
    -   Handles `chrome.runtime.onMessage` for tasks requiring cross-origin privileges (CORS).
    -   **Primary Task:** Transcribing audio via Wit.ai API (since content scripts cannot easily make cross-origin requests to arbitrary APIs).
4.  **`popup/`**:
    -   Simple UI for saving the Wit.ai token to `chrome.storage.sync`.

---

## Codebase Details

### 1. `content.js`

#### reCaptcha Logic (`solveLoop`)
-   **Detection:** Checks for `.recaptcha-checkbox-border` and `#recaptcha-audio-button`.
-   **Interaction:** Uses `click()` events.
-   **Solving:**
    -   Extracts audio URL from `#audio-source`.
    -   Sends message `action: 'transcribe'` to `background.js`.
    -   Receives text and uses `simulateTyping()` to enter it.
    -   **Typing Simulation:** Dispatches `keydown`, `keypress`, `input`, `keyup` events to mimic human typing.

### 2. `background.js`

-   **`transcribeAudio(audioUrl, token)`:**
    -   Fetches the audio file (ArrayBuffer).
    -   POSTs to `https://api.wit.ai/speech`.
    -   Parses the response (handles both JSON and NDJSON formats).

---

## Common Maintenance Tasks

### Updating Selectors
If Google updates their widget HTML, you may need to update the CSS selectors in `content.js`.

-   **reCaptcha Selectors:** Located in `solveLoop()`:
    -   Checkbox: `.recaptcha-checkbox-border`
    -   Audio Button: `#recaptcha-audio-button`

### Adjusting Timing/Delays
-   **Typing Speed:** Modify `CONFIG.typingSpeed` in `content.js` (lines 4-7).
-   **Click Delays:** `sleep()` calls in `solveLoop()` control how fast the events fire.

### Debugging
-   **Console Logs:** The extension logs extensively to the console.
-   **Visual Debugging:** The extension adds colored borders to elements it detects:
    -   **Yellow Dotted:** Solver is active in the frame.
    -   **Green Solid:** Solved successfully.

---

## Removing/Restoring Features

### 2captcha Integration
**Status:** Removed in v2.5.0.

If you need to restore external captcha solving services (like 2captcha/CapSolver):
1.  **Background:** Re-implement the API proxy in `background.js` to handle the HTTP requests (to avoid CORS in content script).
2.  **Content:** Add the API key configuration and the logic to send the sitekey/url to the background script.

---

## Release Checklist

1.  **Update Version:** Bump version in `manifest.json`.
2.  **Test reCaptcha:**
    -   Verify checkbox click.
    -   Verify audio download and transcription.
3.  **Check Logs:** Ensure no errors in `chrome://extensions`.
