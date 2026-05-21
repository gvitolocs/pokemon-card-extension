(() => {
    const TRUSTED_ORIGIN = 'https://pokoin.com';
    const REQUEST_TYPE = 'POKOIN_EXTENSION_AUTH_TOKEN_REQUEST';
    const RESPONSE_TYPE = 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE';

    function isBridgePage() {
        return window.location.origin === TRUSTED_ORIGIN &&
            window.location.pathname === '/extension/auth-bridge';
    }

    function isTokenMessage(data) {
        return data &&
            typeof data === 'object' &&
            data.type === RESPONSE_TYPE &&
            typeof data.token === 'string' &&
            data.token.length > 20;
    }

    if (!isBridgePage()) {
        return;
    }

    window.addEventListener('message', (event) => {
        if (event.origin !== TRUSTED_ORIGIN || event.source !== window || !isTokenMessage(event.data)) {
            return;
        }

        chrome.runtime.sendMessage({
            action: 'pokoinAuthTokenReceived',
            tokenMessage: {
                type: event.data.type,
                token: event.data.token,
                expiresAt: event.data.expiresAt || event.data.expirationTime || null,
                issuedAt: event.data.issuedAt || null,
            },
        }).catch(() => {});
    });

    window.postMessage({
        type: REQUEST_TYPE,
        source: 'pokemon-card-extension',
    }, TRUSTED_ORIGIN);
})();
