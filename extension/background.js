// Background Service Worker for Qim reCaptcha Solver
// Enhanced with robust error handling, caching, and translation capabilities.

const CONFIG = {
    witApiVersion: '20230215',
    defaultLanguage: 'en',
    maxRetries: 3,
    retryDelay: 1000,
    cacheExpiration: 1000 * 60 * 60 * 24, // 24 hours
    debug: true
};

/**
 * Advanced Logging
 */
const Logger = {
    log: (...args) => CONFIG.debug && console.log('[Background]', ...args),
    warn: (...args) => console.warn('[Background]', ...args),
    error: (...args) => console.error('[Background]', ...args)
};

/**
 * Audio Validator Service
 * Validates audio integrity silently
 */
class AudioValidator {
    static validate(arrayBuffer) {
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error('Empty audio buffer');
        }

        // Minimum size check (e.g., < 100 bytes is likely invalid for a captcha)
        if (arrayBuffer.byteLength < 100) {
            throw new Error('Audio buffer too small, likely invalid');
        }

        // MP3 Header Check (ID3 or Frame Sync)
        // Simple check for ID3 tag (starts with 'ID3') or Frame Sync (0xFFE0)
        const view = new DataView(arrayBuffer);
        const header = view.getUint8(0);
        const header2 = view.getUint8(1);
        const header3 = view.getUint8(2);

        // ID3 check
        if (header === 0x49 && header2 === 0x44 && header3 === 0x33) {
            return true;
        }

        // Frame Sync (first 11 bits set to 1) -> 0xFF and top 3 bits of next byte
        if (header === 0xFF && (header2 & 0xE0) === 0xE0) {
            return true;
        }

        // Warning only, as MP3 structure varies (e.g. storage in container)
        Logger.warn('Audio header validation uncertain, proceeding...');
        return true;
    }
}

/**
 * In-memory cache for high-speed access during session
 * Map<hash, {text: string, timestamp: number}>
 */
const memoryCache = new Map();

/**
 * Service for caching transcription results
 */
class CacheService {
    static async generateHash(buffer) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    static async get(hash) {
        // 1. Check Memory
        if (memoryCache.has(hash)) {
            Logger.log('Memory cache hit:', hash);
            return memoryCache.get(hash).text;
        }

        // 2. Check Storage
        const key = `cache_${hash}`;
        const result = await chrome.storage.local.get([key]);
        if (result[key]) {
            const { text, timestamp } = result[key];
            if (Date.now() - timestamp < CONFIG.cacheExpiration) {
                Logger.log('Storage cache hit:', hash);
                // Hydrate memory
                memoryCache.set(hash, { text, timestamp });
                return text;
            } else {
                // Clean up expired
                chrome.storage.local.remove(key);
            }
        }
        return null;
    }

    static async set(hash, text) {
        const entry = { text, timestamp: Date.now() };
        // 1. Memory
        memoryCache.set(hash, entry);
        // 2. Storage
        const key = `cache_${hash}`;
        await chrome.storage.local.set({ [key]: entry });

        // Prune memory if too large
        if (memoryCache.size > 100) {
            const firstKey = memoryCache.keys().next().value;
            memoryCache.delete(firstKey);
        }
    }
}

/**
 * Service for translating/normalizing text
 * Primarily converts number words to digits for reCaptcha
 */
class TranslationService {
    static NUMBER_MAP = {
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

    /**
     * Converts "eight five" -> "85"
     */
    static normalize(text) {
        if (!text) return '';

        const lower = text.toLowerCase().trim();
        const tokens = lower.split(/\s+/);

        const translated = tokens.map(token => {
            // Remove punctuation
            const cleanToken = token.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
            return this.NUMBER_MAP[cleanToken] || cleanToken;
        });

        // If all tokens are digits, join them
        const allDigits = translated.every(t => /^\d+$/.test(t));
        if (allDigits) {
            return translated.join('');
        }

        return translated.join(' ');
    }
}

/**
 * Client for interacting with Wit.ai API
 */
class WitClient {
    constructor(token) {
        this.token = token;
    }

    async transcribe(arrayBuffer) {
        let lastError;

        for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
            try {
                Logger.log(`Transcription attempt ${attempt}/${CONFIG.maxRetries}`);

                const response = await fetch(`https://api.wit.ai/speech?v=${CONFIG.witApiVersion}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'audio/mpeg3',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: arrayBuffer
                });

                if (!response.ok) {
                    throw new Error(`Wit.ai API error: ${response.status} ${response.statusText}`);
                }

                const rawText = await response.text();
                const result = this.parseResponse(rawText);

                if (result) return result;

                throw new Error('No valid text in response');

            } catch (error) {
                Logger.warn('Attempt failed:', error.message);
                lastError = error;
                if (attempt < CONFIG.maxRetries) {
                    await new Promise(r => setTimeout(r, CONFIG.retryDelay * attempt));
                }
            }
        }

        throw lastError;
    }

    parseResponse(data) {
        // Wit.ai streaming response handling (NDJSON)
        // We buffer the results and look for the final recognizable text
        const lines = data.trim().split('\n');
        let bestCandidate = null;

        for (let i = lines.length - 1; i >= 0; i--) {
            try {
                const json = JSON.parse(lines[i]);
                if (json.text) {
                    bestCandidate = json.text;
                    // Usually the last non-empty text is the final result
                    if (json.is_final) return json.text;
                    break;
                }
            } catch (e) {
                // Fallback for regex
                const match = lines[i].match(/"text":\s*"(.*)"/);
                if (match) {
                    bestCandidate = match[1];
                    break;
                }
            }
        }
        return bestCandidate;
    }
}

/**
 * Main Audio Processing Workflow
 */
async function processAudioPipeline(audioUrl, token) {
    // 1. Download
    Logger.log('Downloading audio...', audioUrl);
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error('Failed to download audio file');
    const arrayBuffer = await response.arrayBuffer();

    // 2. Validate Audio (Silent Background Validation)
    AudioValidator.validate(arrayBuffer);

    // 3. Caching Check
    const hash = await CacheService.generateHash(arrayBuffer);
    const cachedText = await CacheService.get(hash);
    if (cachedText) {
        return { text: cachedText, source: 'cache' };
    }

    // 4. Transcription
    const witClient = new WitClient(token);
    const rawText = await witClient.transcribe(arrayBuffer);
    Logger.log('Raw Transcription:', rawText);

    // 5. Translation / Normalization (Validation Logic)
    // Convert "Eight Five" -> "85"
    const finalText = TranslationService.normalize(rawText);
    Logger.log('Normalized Text:', finalText);

    // 6. Cache Result
    if (finalText) {
        await CacheService.set(hash, finalText);
    }

    return { text: finalText, source: 'api' };
}

// Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'transcribe') {
        (async () => {
            try {
                const { audioUrl } = request;

                // Validate Settings
                const settings = await chrome.storage.sync.get(['witAiToken', 'targetLanguage']);
                if (!settings.witAiToken) {
                    sendResponse({ success: false, error: 'Wit.ai Token is missing. Please set it in the extension popup.' });
                    return;
                }

                const result = await processAudioPipeline(audioUrl, settings.witAiToken);

                sendResponse({
                    success: true,
                    text: result.text,
                    metadata: {
                        source: result.source,
                        latency: 0 // Could calculate this
                    }
                });

            } catch (error) {
                Logger.error('Pipeline failed:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // Async response
    }

    if (request.action === 'notify') {
        const title = request.title || 'Qim reCaptcha Solver';
        const message = request.message || 'Captcha Solved Successfully!';

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/favicon.png',
            title: title,
            message: message,
            priority: 2
        });

        sendResponse({ success: true });
        return false;
    }
});
