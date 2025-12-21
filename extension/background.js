// Background Service Worker

/**
 * Transcribes audio using Wit.ai
 * @param {string} audioUrl - URL of the audio file
 * @param {string} token - Wit.ai token
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeAudio(audioUrl, token) {
    try {
        console.log('Downloading audio from:', audioUrl);
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();

        console.log('Sending to Wit.ai...');
        const witResponse = await fetch('https://api.wit.ai/speech?v=20230215', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'audio/mpeg3',
                'X-Requested-With': 'XMLHttpRequest' // Required by some APIs to avoid checks
            },
            body: arrayBuffer
        });

        const data = await witResponse.text(); // Wit.ai sometimes returns NDJSON or JSON
        console.log('Wit.ai response:', data);

        // Parse Wit.ai response
        // Similar logic to SpeechRecognizer.js but simplified for browser
        let text = null;

        try {
            // Try standard JSON
            const json = JSON.parse(data);
            if (json.text) return json.text;
        } catch (e) {
            // NDJSON fallback (common with Wit.ai chunks)
            const lines = data.trim().split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                try {
                    const json = JSON.parse(lines[i]);
                    if (json.text) {
                        return json.text;
                    }
                } catch (err) {
                    // Ignore parsing errors for intermediate chunks
                }
            }
        }

        // Regex fallback
        const match = data.match(/"text":\s*"(.*)"/);
        if (match) return match[1];

        return null;

    } catch (error) {
        console.error('Transcription failed:', error);
        return null;
    }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'transcribe') {
        // ... (existing code)
        // Must return true to indicate async response
        (async () => {
            try {
                const { audioUrl } = request;

                // Get token from storage
                const data = await chrome.storage.sync.get(['witAiToken']);
                const token = data.witAiToken;

                if (!token) {
                    console.warn('No Wit.ai token found in settings.');
                    sendResponse({ success: false, error: 'Token missing' });
                    return;
                }

                const text = await transcribeAudio(audioUrl, token);

                if (text) {
                    sendResponse({ success: true, text });
                } else {
                    sendResponse({ success: false, error: 'Transcription returned null' });
                }
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // Keep message channel open
    }
});
