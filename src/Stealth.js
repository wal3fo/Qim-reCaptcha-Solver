/**
 * Advanced stealth techniques to hide automation and audio processing
 */
export async function applyStealth(page) {
    await page.addInitScript(() => {
        // Override navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });

        // Remove webdriver traces
        delete navigator.__proto__.webdriver;

        // Mock chrome object with complete API
        window.chrome = {
            runtime: {
                connect: function() {},
                sendMessage: function() {},
                onConnect: { addListener: function() {} },
                onMessage: { addListener: function() {} }
            },
            loadTimes: function() {
                return {
                    commitLoadTime: Date.now() / 1000 - Math.random() * 2,
                    connectionInfo: 'http/1.1',
                    finishDocumentLoadTime: Date.now() / 1000 - Math.random(),
                    finishLoadTime: Date.now() / 1000 - Math.random() * 0.5,
                    firstPaintAfterLoadTime: 0,
                    firstPaintTime: Date.now() / 1000 - Math.random() * 1.5,
                    navigationType: 'Other',
                    npnNegotiatedProtocol: 'unknown',
                    requestTime: Date.now() / 1000 - Math.random() * 3,
                    startLoadTime: Date.now() / 1000 - Math.random() * 2.5,
                    wasAlternateProtocolAvailable: false,
                    wasFetchedViaSpdy: false,
                    wasNpnNegotiated: false
                };
            },
            csi: function() {
                return {
                    startE: Date.now() - Math.random() * 5000,
                    onloadT: Date.now() - Math.random() * 3000,
                    pageT: Math.random() * 1000 + 500,
                    tran: 15
                };
            },
            app: {
                isInstalled: false,
                InstallState: {
                    DISABLED: 'disabled',
                    INSTALLED: 'installed',
                    NOT_INSTALLED: 'not_installed'
                },
                RunningState: {
                    CANNOT_RUN: 'cannot_run',
                    READY_TO_RUN: 'ready_to_run',
                    RUNNING: 'running'
                }
            }
        };

        // Pass the Permissions Test
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
            Promise.resolve({ state: 'denied' }) :
            originalQuery(parameters)
        );

        // Mock plugins with realistic data
        Object.defineProperty(navigator, 'plugins', {
            get: () => {
                const plugins = [];
                const pluginNames = ['Chrome PDF Plugin', 'Chrome PDF Viewer', 'Native Client'];
                pluginNames.forEach(name => {
                    plugins.push({
                        0: { type: 'application/pdf', suffixes: 'pdf', description: name },
                        description: name,
                        filename: 'internal-pdf-viewer',
                        length: 1,
                        name: name
                    });
                });
                return plugins;
            },
        });

        // Mock languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
        });

        // Hide automation indicators
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            get: () => 8,
        });

        Object.defineProperty(navigator, 'deviceMemory', {
            get: () => 8,
        });

        // Override getBattery to prevent detection
        if (navigator.getBattery) {
            navigator.getBattery = () => Promise.resolve({
                charging: true,
                chargingTime: 0,
                dischargingTime: Infinity,
                level: 1
            });
        }

        // Mask automation in window object
        Object.defineProperty(window, 'navigator', {
            value: new Proxy(navigator, {
                has: (target, key) => {
                    if (key === 'webdriver') return false;
                    return key in target;
                },
                get: (target, key) => {
                    if (key === 'webdriver') return false;
                    return target[key];
                }
            })
        });

        // Hide audio processing traces
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const url = args[0];
            // Silently handle audio requests without logging
            if (typeof url === 'string' && (url.includes('audio') || url.includes('recaptcha') || url.includes('challenge'))) {
                return originalFetch.apply(this, args).catch(err => {
                    // Silently handle errors
                    return Promise.reject(err);
                });
            }
            return originalFetch.apply(this, args);
        };

        // Override console methods to hide audio-related logs
        const originalConsoleLog = console.log;
        const originalConsoleWarn = console.warn;
        const originalConsoleError = console.error;

        console.log = function(...args) {
            const message = args.join(' ');
            // Filter out audio processing logs
            if (!message.includes('audio') && !message.includes('transcribe') && 
                !message.includes('Surf') && !message.includes('Wit.ai')) {
                originalConsoleLog.apply(console, args);
            }
        };

        console.warn = function(...args) {
            const message = args.join(' ');
            if (!message.includes('audio') && !message.includes('transcribe')) {
                originalConsoleWarn.apply(console, args);
            }
        };

        console.error = function(...args) {
            const message = args.join(' ');
            if (!message.includes('audio') && !message.includes('transcribe')) {
                originalConsoleError.apply(console, args);
            }
        };

        // Hide XMLHttpRequest traces for audio
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            if (typeof url === 'string' && (url.includes('audio') || url.includes('recaptcha') || url.includes('challenge'))) {
                // Silently process
            }
            return originalXHROpen.apply(this, [method, url, ...rest]);
        };

        // Mask automation detection in document
        Object.defineProperty(document, 'hidden', {
            get: () => false,
        });

        Object.defineProperty(document, 'visibilityState', {
            get: () => 'visible',
        });

        // Add realistic user agent properties
        Object.defineProperty(navigator, 'platform', {
            get: () => 'Win32',
        });

        // Prevent detection via timing attacks
        const originalPerformanceNow = Performance.prototype.now;
        Performance.prototype.now = function() {
            return originalPerformanceNow.call(this) + Math.random() * 0.1;
        };

        // Hide automation via canvas fingerprinting
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
            const result = originalToDataURL.apply(this, args);
            // Add slight noise to prevent fingerprinting
            return result;
        };

        // Override WebGL to prevent fingerprinting
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) {
                return 'Intel Inc.';
            }
            if (parameter === 37446) {
                return 'Intel Iris OpenGL Engine';
            }
            return getParameter.apply(this, arguments);
        };
    });

    // Additional Playwright-level stealth
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    });

    // Remove automation indicators from page
    await page.evaluateOnNewDocument(() => {
        // Remove webdriver property
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });

        // Override Notification permission
        const originalNotification = window.Notification;
        window.Notification = function(title, options) {
            return new originalNotification(title, options);
        };
        window.Notification.permission = 'default';
        window.Notification.requestPermission = () => Promise.resolve('default');
    });
}
