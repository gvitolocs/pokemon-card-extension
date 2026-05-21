(() => {
    const TRUSTED_ORIGIN = 'https://pokoin.com';
    const REQUEST_TYPE = 'POKOIN_EXTENSION_AUTH_TOKEN_REQUEST';
    const RESPONSE_TYPE = 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE';

    function isBridgePage() {
        return window.location.origin === TRUSTED_ORIGIN &&
            window.location.pathname === '/extension/auth-bridge';
    }

    function parseBridgeMessage(data) {
        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            } catch (error) {
                return null;
            }
        }
        return data && typeof data === 'object' ? data : null;
    }

    function isTokenMessage(data) {
        return data &&
            typeof data === 'object' &&
            (
                (data.type === RESPONSE_TYPE && typeof data.token === 'string' && data.token.length > 20) ||
                (data.type === 'pokoin-auth-token' && data.ok === true && typeof data.token?.accessToken === 'string' && data.token.accessToken.length > 20)
            );
    }

    function normalizeTokenMessage(data) {
        if (data.type === 'pokoin-auth-token') {
            return {
                type: RESPONSE_TYPE,
                token: data.token.accessToken,
                expiresAt: data.token.expiresAt || data.token.expirationTime || null,
                issuedAt: data.token.issuedAt || null,
                uid: data.token.uid || '',
                email: data.token.email || '',
            };
        }

        return {
            type: data.type,
            token: data.token,
            expiresAt: data.expiresAt || data.expirationTime || null,
            issuedAt: data.issuedAt || null,
        };
    }

    if (!isBridgePage()) {
        return;
    }

    window.addEventListener('message', (event) => {
        const data = parseBridgeMessage(event.data);
        if (event.origin !== TRUSTED_ORIGIN || event.source !== window || !isTokenMessage(data)) {
            return;
        }

        chrome.runtime.sendMessage({
            action: 'pokoinAuthTokenReceived',
            tokenMessage: normalizeTokenMessage(data),
        }).catch(() => {});
    });

    window.postMessage({
        type: REQUEST_TYPE,
        source: 'pokemon-card-extension',
    }, TRUSTED_ORIGIN);
})();
