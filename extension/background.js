// Background Service Worker for Qim reCaptcha Solver
// Optimized with robust error handling, caching, and proper async management

const CONFIG = {
    witApiVersion: '20230215',
    defaultLanguage: 'en',
    maxRetries: 3,
    retryDelay: 1000,
    cacheExpiration: 1000 * 60 * 60 * 24, // 24 hours
    maxCacheSize: 100,
    debug: true, // TEMPORARY: Enable for debugging
    minAudioSize: 100,
    maxMemoryCacheSize: 50 // Reduced to prevent memory issues
};

/**
 * Advanced Logging with proper filtering
 */
const Logger = {
    log: (...args) => {
        if (CONFIG.debug) {
            console.log('[Background]', ...args);
        }
    },
    warn: (...args) => {
        if (CONFIG.debug) {
            console.warn('[Background]', ...args);
        }
    },
    error: (...args) => {
        // Always log errors
        console.error('[Background]', ...args);
    },
    info: (...args) => {
        console.info('[Background]', ...args);
    }
};

/**
 * Audio Validator Service
 */
class AudioValidator {
    static validate(arrayBuffer) {
        if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
            throw new Error('Invalid buffer type');
        }

        if (arrayBuffer.byteLength === 0) {
            throw new Error('Empty audio buffer');
        }

        if (arrayBuffer.byteLength < CONFIG.minAudioSize) {
            throw new Error(`Audio buffer too small: ${arrayBuffer.byteLength} bytes`);
        }

        // MP3 Header validation
        const view = new DataView(arrayBuffer);
        const header = view.getUint8(0);
        const header2 = view.getUint8(1);
        const header3 = view.getUint8(2);

        // ID3 tag check
        if (header === 0x49 && header2 === 0x44 && header3 === 0x33) {
            Logger.log('Valid MP3 with ID3 tag');
            return true;
        }

        // Frame Sync check (MPEG audio)
        if (header === 0xFF && (header2 & 0xE0) === 0xE0) {
            Logger.log('Valid MP3 with frame sync');
            return true;
        }

        // Allow through with warning (some MP3s have non-standard headers)
        Logger.warn('Audio header validation uncertain, proceeding...');
        return true;
    }
}

/**
 * In-memory cache with LRU eviction
 */
class MemoryCache {
    constructor(maxSize = CONFIG.maxMemoryCacheSize) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key) {
        if (!this.cache.has(key)) return null;

        // Move to end (LRU)
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);

        return value;
    }

    set(key, value) {
        // Remove if exists (to re-add at end)
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            Logger.log(`Evicted cache entry: ${firstKey.substring(0, 8)}...`);
        }

        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }

    get size() {
        return this.cache.size;
    }
}

const memoryCache = new MemoryCache();

/**
 * Cache Service with proper error handling
 */
class CacheService {
    static async generateHash(buffer) {
        try {
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (error) {
            Logger.error('Hash generation failed:', error);
            throw error;
        }
    }

    static async get(hash) {
        try {
            // 1. Check Memory Cache
            const memResult = memoryCache.get(hash);
            if (memResult) {
                Logger.log(`Memory cache hit: ${hash.substring(0, 8)}...`);
                return memResult.text;
            }

            // 2. Check Storage Cache
            const key = `cache_${hash}`;
            const result = await chrome.storage.local.get([key]);

            if (result[key]) {
                const { text, timestamp } = result[key];
                const age = Date.now() - timestamp;

                if (age < CONFIG.cacheExpiration) {
                    Logger.log(`Storage cache hit: ${hash.substring(0, 8)}... (age: ${Math.round(age / 1000)}s)`);
                    // Hydrate memory cache
                    memoryCache.set(hash, { text, timestamp });
                    return text;
                } else {
                    // Clean up expired entry
                    Logger.log(`Removing expired cache: ${hash.substring(0, 8)}...`);
                    await chrome.storage.local.remove(key);
                }
            }

            return null;
        } catch (error) {
            Logger.error('Cache get failed:', error);
            return null; // Don't throw, just miss cache
        }
    }

    static async set(hash, text) {
        if (!text || text.length === 0) {
            Logger.warn('Refusing to cache empty text');
            return;
        }

        try {
            const entry = { text, timestamp: Date.now() };

            // 1. Memory Cache
            memoryCache.set(hash, entry);

            // 2. Storage Cache
            const key = `cache_${hash}`;
            await chrome.storage.local.set({ [key]: entry });

            Logger.log(`Cached result: ${hash.substring(0, 8)}... -> "${text}"`);
        } catch (error) {
            Logger.error('Cache set failed:', error);
            // Don't throw - caching failure shouldn't break the flow
        }
    }

    static async clearExpired() {
        try {
            const storage = await chrome.storage.local.get(null);
            const now = Date.now();
            const keysToRemove = [];

            for (const [key, value] of Object.entries(storage)) {
                if (key.startsWith('cache_') && value.timestamp) {
                    if (now - value.timestamp >= CONFIG.cacheExpiration) {
                        keysToRemove.push(key);
                    }
                }
            }

            if (keysToRemove.length > 0) {
                await chrome.storage.local.remove(keysToRemove);
                Logger.info(`Cleared ${keysToRemove.length} expired cache entries`);
            }
        } catch (error) {
            Logger.error('Cache cleanup failed:', error);
        }
    }
}

/**
 * Translation Service for number normalization
 */
class TranslationService {
    static NUMBER_MAP = {
        // English
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
        'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
        'ten': '10', // Added
        // French
        'zéro': '0', 'un': '1', 'deux': '2', 'trois': '3', 'quatre': '4',
        'cinq': '5', 'six': '6', 'sept': '7', 'huit': '8', 'neuf': '9',
        'dix': '10',
        // German
        'null': '0', 'eins': '1', 'zwei': '2', 'drei': '3', 'vier': '4',
        'fünf': '5', 'sechs': '6', 'sieben': '7', 'acht': '8', 'neun': '9',
        'zehn': '10',
        // Spanish
        'cero': '0', 'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4',
        'cinco': '5', 'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9',
        'diez': '10'
    };

    /**
     * Converts "eight five" -> "85"
     * Also handles "85", "8 5", etc.
     */
    static normalize(text) {
        if (!text || typeof text !== 'string') return '';

        const lower = text.toLowerCase().trim();

        // Already digits only? Return as-is
        if (/^\d+$/.test(lower)) {
            return lower;
        }

        const tokens = lower.split(/\s+/);
        const translated = tokens.map(token => {
            // Remove punctuation
            const cleanToken = token.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
            return this.NUMBER_MAP[cleanToken] || cleanToken;
        });

        // If all tokens are now digits, join them
        const allDigits = translated.every(t => /^\d+$/.test(t));
        if (allDigits) {
            return translated.join('');
        }

        // Otherwise return space-separated
        return translated.join(' ');
    }
}

/**
 * Wit.ai Client with proper error handling
 */
class WitClient {
    constructor(token) {
        if (!token) {
            throw new Error('Wit.ai token is required');
        }
        this.token = token;
    }

    async transcribe(arrayBuffer) {
        let lastError = null;

        for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
            try {
                Logger.log(`Transcription attempt ${attempt}/${CONFIG.maxRetries}`);

                const response = await fetch(`https://api.wit.ai/speech?v=${CONFIG.witApiVersion}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'audio/mpeg3',
                        'Accept': 'application/json'
                    },
                    body: arrayBuffer
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Wit.ai API error: ${response.status} - ${errorText}`);
                }

                const rawText = await response.text();
                const result = this.parseResponse(rawText);

                if (result && result.length > 0) {
                    Logger.log(`Transcription successful: "${result}"`);
                    return result;
                }

                throw new Error('No valid text in response');

            } catch (error) {
                lastError = error;
                Logger.warn(`Attempt ${attempt} failed:`, error.message);

                if (attempt < CONFIG.maxRetries) {
                    const delay = CONFIG.retryDelay * attempt;
                    Logger.log(`Retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        throw new Error(`Transcription failed after ${CONFIG.maxRetries} attempts: ${lastError.message}`);
    }

    parseResponse(data) {
        if (!data) return null;

        // Wit.ai returns NDJSON (newline-delimited JSON)
        const lines = data.trim().split('\n');
        let bestCandidate = null;
        let finalText = null;

        // Process from last to first (most recent first)
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line) continue;

            try {
                const json = JSON.parse(line);

                if (json.text) {
                    // If marked as final, use it immediately
                    if (json.is_final === true) {
                        finalText = json.text;
                        break;
                    }

                    // Otherwise keep as candidate
                    if (!bestCandidate) {
                        bestCandidate = json.text;
                    }
                }
            } catch (e) {
                // Try regex fallback for malformed JSON
                const match = line.match(/"text"\s*:\s*"([^"]*)"/);
                if (match && match[1] && !bestCandidate) {
                    bestCandidate = match[1];
                }
            }
        }

        return finalText || bestCandidate;
    }
}

/**
 * Main Audio Processing Pipeline
 */
async function processAudioPipeline(audioUrl, token) {
    const startTime = Date.now();

    try {
        // 1. Download Audio
        Logger.log('Downloading audio:', audioUrl);
        const response = await fetch(audioUrl, {
            method: 'GET',
            headers: {
                'Accept': 'audio/mpeg,audio/*,*/*'
            },
            credentials: 'omit',
            cache: 'no-cache'
        });

        if (!response.ok) {
            throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        Logger.log(`Downloaded ${arrayBuffer.byteLength} bytes`);

        // 2. Validate Audio
        AudioValidator.validate(arrayBuffer);

        // 3. Check Cache
        const hash = await CacheService.generateHash(arrayBuffer);
        const cachedText = await CacheService.get(hash);

        if (cachedText) {
            const duration = Date.now() - startTime;
            Logger.info(`Cache hit! Duration: ${duration}ms`);
            return {
                text: cachedText,
                source: 'cache',
                duration
            };
        }

        // 4. Transcribe
        const witClient = new WitClient(token);
        const rawText = await witClient.transcribe(arrayBuffer);

        if (!rawText) {
            throw new Error('Transcription returned empty result');
        }

        // 5. Normalize
        const finalText = TranslationService.normalize(rawText);

        if (!finalText || finalText.length === 0) {
            throw new Error('Normalization produced empty result');
        }

        // 6. Cache Result
        await CacheService.set(hash, finalText);

        const duration = Date.now() - startTime;
        Logger.info(`Transcription complete: "${finalText}" (${duration}ms)`);

        return {
            text: finalText,
            source: 'api',
            duration,
            rawText
        };

    } catch (error) {
        Logger.error('Pipeline error:', error);
        throw error;
    }
}

/**
 * Message Listener with proper async handling
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    Logger.log('Message received:', request.action);

    // Handle ping (connectivity check)
    if (request.action === 'ping') {
        sendResponse({ success: true, pong: true });
        return false;
    }

    // Handle transcription request
    if (request.action === 'transcribe') {
        // Use async IIFE and keep channel open
        (async () => {
            try {
                const { audioUrl } = request;

                if (!audioUrl) {
                    sendResponse({
                        success: false,
                        error: 'Missing audioUrl parameter'
                    });
                    return;
                }

                // Get settings
                const settings = await chrome.storage.sync.get(['witAiToken', 'targetLanguage']);

                if (!settings.witAiToken) {
                    sendResponse({
                        success: false,
                        error: 'Wit.ai Token is missing. Please configure the extension.'
                    });
                    return;
                }

                // Process audio
                const result = await processAudioPipeline(audioUrl, settings.witAiToken);

                sendResponse({
                    success: true,
                    text: result.text,
                    metadata: {
                        source: result.source,
                        duration: result.duration,
                        rawText: result.rawText
                    }
                });

            } catch (error) {
                Logger.error('Transcription failed:', error);
                sendResponse({
                    success: false,
                    error: error.message || 'Unknown error occurred'
                });
            }
        })();

        // Keep message channel open for async response
        return true;
    }

    // Handle notification request
    if (request.action === 'notify') {
        const title = request.title || 'Qim reCaptcha Solver';
        const message = request.message || 'Captcha Solved Successfully!';

        // Check if notifications API is available
        if (!chrome.notifications) {
            Logger.warn('Notifications API not available');
            sendResponse({ success: false, error: 'Notifications not supported' });
            return false;
        }

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/favicon.png',
            title: title,
            message: message,
            priority: 2
        }, (notificationId) => {
            if (chrome.runtime.lastError) {
                Logger.error('Notification error:', chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, notificationId });
            }
        });

        return true; // Keep channel open
    }

    // Unknown action
    Logger.warn('Unknown action:', request.action);
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
});

/**
 * Periodic cache cleanup
 */
if (chrome.alarms) {
    chrome.alarms.create('cleanupCache', { periodInMinutes: 60 });
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'cleanupCache') {
            Logger.log('Running cache cleanup...');
            CacheService.clearExpired();
        }
    });
    Logger.log('Cache cleanup scheduled (every 60 minutes)');
} else {
    Logger.warn('Alarms API not available - cache cleanup disabled');
}

// Initialize
Logger.info('Background service worker initialized');