const axios = require('axios');

/**
 * Cloudflare Turnstile Server-Side Verification Example
 * 
 * This module demonstrates how to verify a Turnstile token on your backend.
 * 
 * API Reference: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA'; // Replace with your secret key (Dummy key for testing)

/**
 * Verify the Turnstile token with Cloudflare's API.
 * 
 * @param {string} token - The cf-turnstile-response token from the client.
 * @param {string} ip - (Optional) The user's IP address.
 * @returns {Promise<object>} - The validation result.
 */
async function verifyTurnstileToken(token, ip = null) {
    const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    
    const formData = new URLSearchParams();
    formData.append('secret', SECRET_KEY);
    formData.append('response', token);
    if (ip) {
        formData.append('remoteip', ip);
    }

    try {
        const response = await axios.post(url, formData);
        const data = response.data;

        if (data.success) {
            console.log('Token verification successful:', data);
            return { success: true, ...data };
        } else {
            console.warn('Token verification failed:', data['error-codes']);
            return { success: false, errors: data['error-codes'] };
        }
    } catch (error) {
        console.error('Error contacting Cloudflare API:', error.message);
        return { success: false, error: 'network_error' };
    }
}

// Example Usage
/*
(async () => {
    const sampleToken = 'ITEM-TOKEN-FROM-CLIENT';
    const result = await verifyTurnstileToken(sampleToken);
    
    if (result.success) {
        // Proceed with login/signup
    } else {
        // Block request
    }
})();
*/

module.exports = { verifyTurnstileToken };
