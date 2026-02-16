import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

/**
 * Handles speech-to-text operations using the Wit.ai API.
 * Enhanced with caching, retries, and result normalization.
 */
export class SpeechRecognizer {
    /**
     * @param {string} token - The Wit.ai Server Access Token.
     */
    constructor(token) {
        if (!token) throw new Error('Wit.ai token is required.');
        this.token = token;
        
        this.client = axios.create({
            baseURL: 'https://api.wit.ai',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'audio/mpeg3',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 10000,
            responseType: 'text',
            maxRedirects: 5
        });

        // In-memory cache: Map<hash, text>
        this.cache = new Map();
        
        // Configuration
        this.maxRetries = 3;
        this.retryDelay = 1000;
    }

    /**
     * Transcribes audio buffer to text.
     * @param {ArrayBuffer|Buffer} audioBuffer - The audio data to transcribe.
     * @returns {Promise<string|null>} The transcribed text or null if failed.
     */
    async transcribe(audioBuffer) {
        try {
            // 1. Check Cache (silent)
            const hash = this.generateHash(audioBuffer);
            if (this.cache.has(hash)) {
                return this.cache.get(hash);
            }

            // 2. API Call with Retries
            let rawText = null;
            let lastError;

            for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                try {
                    const response = await this.client.post('/speech?v=20230215', audioBuffer);
                    rawText = this.parseResponse(response.data);
                    if (rawText) break;
                } catch (error) {
                    lastError = error;
                    // Silent error handling (no console logs)
                    if (attempt < this.maxRetries) {
                        await new Promise(r => setTimeout(r, this.retryDelay * attempt));
                    }
                }
            }

            if (!rawText) throw lastError || new Error('Transcription failed after retries');

            // 3. Normalize/Translate
            const finalText = this.normalize(rawText);

            // 4. Update Cache
            this.cache.set(hash, finalText);

            return finalText;

        } catch (error) {
            console.error('[SpeechRecognizer] Critical error:', error.message);
            return null;
        }
    }

    /**
     * Generates MD5 hash of the buffer for caching
     */
    generateHash(buffer) {
        return crypto.createHash('md5').update(buffer).digest('hex');
    }

    /**
     * Parses Wit.ai NDJSON/JSON response
     */
    parseResponse(data) {
        if (typeof data === 'object') return data.text; // Already JSON

        const lines = data.trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            try {
                const json = JSON.parse(lines[i]);
                if (json.text) return json.text;
            } catch (e) {
                // Regex fallback
                const match = lines[i].match(/"text":\s*"(.*)"/);
                if (match) return match[1];
            }
        }
        return null;
    }

    /**
     * Normalizes text (translates number words to digits)
     */
    normalize(text) {
        if (!text) return '';
        
        const map = {
            // English
            'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 
            'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
            // French
            'zéro': '0', 'un': '1', 'deux': '2', 'trois': '3', 'quatre': '4',
            'cinq': '5', 'six': '6', 'sept': '7', 'huit': '8', 'neuf': '9',
            // German
            'null': '0', 'eins': '1', 'zwei': '2', 'drei': '3', 'vier': '4',
            'fünf': '5', 'sechs': '6', 'sieben': '7', 'acht': '8', 'neun': '9',
            // Spanish
            'cero': '0', 'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4',
            'cinco': '5', 'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9'
        };

        const lower = text.toLowerCase().trim();
        const tokens = lower.split(/\s+/);
        
        const translated = tokens.map(token => {
            const cleanToken = token.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
            return map[cleanToken] || cleanToken;
        });

        const allDigits = translated.every(t => /^\d+$/.test(t));
        if (allDigits) return translated.join('');
        
        return translated.join(' ');
    }
}
