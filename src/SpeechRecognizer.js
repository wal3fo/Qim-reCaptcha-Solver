import axios from 'axios';
import https from 'https';

/**
 * Handles speech-to-text operations using the Wit.ai API.
 */
export class SpeechRecognizer {
    /**
     * @param {string} token - The Wit.ai Server Access Token.
     */
    constructor(token) {
        if (!token) throw new Error('Wit.ai token is required. Set WIT_AI_TOKEN in your environment or config.');
        this.token = token ?? 'JVHWCNWJLWLGN6MFALYLHAPKUFHMNTAC';
        this.client = axios.create({
            baseURL: 'https://api.wit.ai',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'audio/mpeg3',
                'X-Requested-With': 'XMLHttpRequest'
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 10000,
            responseType: 'text' // Force text to handle potential NDJSON
        });
    }

    /**
     * Transcribes audio buffer to text.
     * @param {ArrayBuffer|Buffer} audioBuffer - The audio data to transcribe.
     * @returns {Promise<string|null>} The transcribed text or null if failed.
     */
    async transcribe(audioBuffer) {
        try {
            // Using API version 20230215
            const response = await this.client.post('/speech?v=20230215', audioBuffer);

            let text = null;

            // Handle different response formats (JSON or NDJSON)
            if (typeof response.data === 'string') {
                const lines = response.data.trim().split('\n');
                // Iterate backwards to find the final result
                for (let i = lines.length - 1; i >= 0; i--) {
                    try {
                        const json = JSON.parse(lines[i]);
                        if (json.text) {
                            text = json.text;
                            break;
                        }
                    } catch (e) {
                        // Fallback regex for loose JSON
                        const match = lines[i].match(/"text":\s*"(.*)"/);
                        if (match) {
                            text = match[1];
                            break;
                        }
                    }
                }
            } else if (typeof response.data === 'object') {
                text = response.data.text;
            }

            return text ? text.trim() : null;

        } catch (error) {
            console.error('Speech recognition error:', error.message);
            if (error.response) {
                console.error('API Response:', error.response.data);
            }
            return null;
        }
    }
}
