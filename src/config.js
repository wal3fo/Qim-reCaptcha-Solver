export default {
    // Wit.ai token for speech-to-text conversion
    witAiToken: process.env.WIT_AI_TOKEN || 'JVHWCNWJLWLGN6MFALYLHAPKUFHMNTAC',

    // HTTP Proxy (e.g., http://user:pass@host:port)
    proxy: process.env.PROXY || null,

    // URL to trigger IP reset (optional)
    ipResetUrl: process.env.IP_RESET_URL || null,

    // Timeout configurations (ms)
    timeouts: {
        navigation: 30000,
        selector: 10000,
        typing: { min: 30, max: 75 }
    }
};
