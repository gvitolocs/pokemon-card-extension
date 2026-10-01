(() => {
    const TRUSTED_ORIGIN = 'https://pokoin.com';
    const TRUSTED_WWW_ORIGIN = 'https://www.pokoin.com';
    const SESSION_TYPE = 'POKOIN_EXTENSION_DESK_SESSION';
    const REQUEST_TYPE = 'POKOIN_EXTENSION_DESK_SESSION_REQUEST';
    const OPEN_TYPE = 'POKOIN_OPEN_TAB';
    const PILL_TYPE = 'POKOIN_SILVER_PILL';
    const SOURCE = 'pokemon-card-extension';

    function inFramedDesk() {
        try {
            return window !== window.top;
        } catch (error) {
            return true;
        }
    }

    function isTrustedDeskOrigin(origin = '') {
        return origin === TRUSTED_ORIGIN
            || origin === TRUSTED_WWW_ORIGIN
            || origin === 'null'
            || origin === window.location.origin
            || String(origin).startsWith('chrome-extension:');
    }

    function publicCardIdFromPath() {
        const match = String(window.location.pathname || '').match(/\/marketplace\/(?:[a-z]{2}\/)?cards\/(\d+)/i);
        return match ? match[1] : '';
    }

    function deskCardName() {
        return String(document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function sendRuntime(message) {
        if (typeof chrome.runtime?.sendMessage !== 'function') {
            return;
        }
        void chrome.runtime.sendMessage(message).catch(() => {});
    }

    function postSession(session = {}) {
        const token = typeof session.token === 'string' ? session.token.trim() : '';
        const uid = String(session.uid || '').trim();
        if (!token || token.length <= 20 || !uid || !inFramedDesk()) {
            return;
        }
        window.postMessage({
            type: SESSION_TYPE,
            source: SOURCE,
            token,
            uid,
            expiresAt: Number(session.expiresAt) || 0,
        }, '*');
    }

    async function injectStoredSession() {
        if (!inFramedDesk() || typeof chrome.runtime?.sendMessage !== 'function') {
            return;
        }
        try {
            const session = await chrome.runtime.sendMessage({ action: 'getPokoinAuthSession' });
            postSession(session);
        } catch (error) {
            // Desk still paints as a guest until the parent posts the session.
        }
    }

    window.addEventListener('message', (event) => {
        if (!isTrustedDeskOrigin(event.origin)) {
            return;
        }
        const data = event.data || {};
        if (data.source !== SOURCE && data.source !== 'pokoin-web') {
            return;
        }
        if (data.type === REQUEST_TYPE && data.source === 'pokoin-web') {
            void injectStoredSession();
            return;
        }
        if (data.type === OPEN_TYPE && data.url) {
            sendRuntime({ action: 'openForegroundTab', url: data.url });
            return;
        }
        if (data.type === PILL_TYPE && data.kind) {
            sendRuntime({
                action: 'openSilverMarketplaceTab',
                kind: data.kind,
                publicId: publicCardIdFromPath(),
                cardName: deskCardName(),
            });
        }
    });

    if (typeof chrome.storage?.onChanged?.addListener === 'function') {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'session' && changes.pokoinAuthSession) {
                postSession(changes.pokoinAuthSession.newValue || {});
            }
        });
    }

    void injectStoredSession();
})();
