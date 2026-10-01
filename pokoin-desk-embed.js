/** MAIN-world desk hooks. Isolated `pokoin-desk-session.js` opens the tab. */
(() => {
    const OPEN_TYPE = 'POKOIN_OPEN_TAB';
    const PILL_TYPE = 'POKOIN_SILVER_PILL';
    const SOURCE = 'pokemon-card-extension';

    function framedDesk() {
        try {
            return window !== window.top;
        } catch (_) {
            return true;
        }
    }

    if (!framedDesk()) {
        return;
    }

    function notify(payload) {
        const message = { source: SOURCE, ...payload };
        window.postMessage(message, '*');
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
            }
        } catch (_) {
            /* chrome-extension parent still receives the iframe postMessage */
        }
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = function patchedFetch(input, init) {
        try {
            const raw = typeof input === 'string' ? input : (input && input.url) || '';
            if (raw.startsWith('/api') || /^https:\/\/(?:www\.)?pokoin\.com\/api/i.test(raw)) {
                const path = raw.startsWith('/api') ? raw : raw.replace(/^https:\/\/(?:www\.)?pokoin\.com/i, '');
                const next = `https://api.pokoin.com${path.startsWith('/') ? path : `/${path}`}`;
                if (typeof input === 'string') {
                    return originalFetch(next, init);
                }
                return originalFetch(new Request(next, input), init);
            }
        } catch (_) {
            /* keep the original request */
        }
        return originalFetch(input, init);
    };

    const originalOpen = window.open.bind(window);
    window.open = function patchedOpen(url, target, features) {
        const href = String(url || '').trim();
        if (/^https:\/\//i.test(href)) {
            notify({ type: OPEN_TYPE, url: href });
            return { closed: false, close() {}, focus() {} };
        }
        return originalOpen(url, target, features);
    };

    function pillKind(node) {
        if (!node || !node.classList) {
            return '';
        }
        if (node.classList.contains('is-ct')) return 'ct';
        if (node.classList.contains('is-cm')) return 'cm';
        if (node.classList.contains('is-vt')) return 'vt';
        return '';
    }

    document.addEventListener('click', (event) => {
        const pill = event.target && event.target.closest && event.target.closest('.silver-pill');
        const kind = pillKind(pill);
        if (!kind) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        notify({ type: PILL_TYPE, kind });
    }, true);
})();
