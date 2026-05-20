// Background script for Pokemon Card Trader Linker
const CARDVAULT_API_BASE_URL = 'https://pokoin.com';

let stats = {
    cardsProcessed: 0,
    linksGenerated: 0,
    lastUpdate: Date.now()
};

// Update extension icon
async function updateIcon(status) {
    try {
        let iconPath;
        switch (status) {
            case 'connected':
                iconPath = 'icon-green.png';
                break;
            case 'error':
                iconPath = 'icon-red.png';
                break;
            default:
                iconPath = 'icon-default.png';
                break;
        }
        
        await chrome.action.setIcon({ path: iconPath });
        console.log('✅ Icon updated:', iconPath);
    } catch (error) {
        console.log('⚠️ Unable to update icon, keeping default icon');
        // No-op: keep default icon
    }
}

// Update extension statistics
async function updateStats(type, increment = 1) {
    if (type === 'cardsProcessed') {
        stats.cardsProcessed += increment;
    } else if (type === 'linksGenerated') {
        stats.linksGenerated += increment;
    }
    stats.lastUpdate = Date.now();
    
    // Save stats in storage
    try {
        await chrome.storage.local.set({ stats });
    } catch (error) {
        console.log('⚠️ Error while saving stats:', error);
    }
}

function isSupportedMarketplaceUrl(url = '') {
    try {
        const { hostname } = new URL(url);
        return hostname.includes('ebay') ||
            hostname.includes('vinted') ||
            hostname.includes('cardmarket');
    } catch (error) {
        return false;
    }
}

async function extractTitleFromPage() {
    const hostname = window.location.hostname;
    const startedAt = Date.now();
    const selectorMap = {
        vinted: [
            '[data-testid="item-page-summary-plugin"] h1.web_ui__Text__title',
            '[data-testid="item-page-summary-plugin"] .web_ui__Text__title',
            '[data-testid="item-title"]',
            'h1.web_ui__Text__title',
            'h1',
            '.web_ui__Text__title',
        ],
        ebay: [
            'h1.x-item-title__mainTitle',
            'h1[data-testid="x-item-title__mainTitle"]',
            '[data-testid="x-item-title"] h1',
            'h1',
        ],
        cardmarket: [
            '.page-title-container h1',
            'h1',
            '.product-title',
            '.card-title',
        ],
    };

    const selectors = hostname.includes('vinted')
        ? selectorMap.vinted
        : hostname.includes('ebay')
            ? selectorMap.ebay
            : hostname.includes('cardmarket')
                ? selectorMap.cardmarket
                : ['h1', 'title'];

    const selectorChecks = [];
    let titleSource = '';

    const readPageTitle = () => {
        selectorChecks.length = 0;
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            const title = element?.textContent?.trim();
            selectorChecks.push({
                selector,
                found: Boolean(element),
                text: title ? title.replace(/\s+/g, ' ').slice(0, 160) : '',
            });
            if (title) {
                titleSource = selector;
                return title.replace(/\s+/g, ' ');
            }
        }

        const metaTitle = document.querySelector('meta[property="og:title"], meta[name="twitter:title"]')
            ?.getAttribute('content')
            ?.trim();
        if (metaTitle) {
            titleSource = 'meta[property="og:title"], meta[name="twitter:title"]';
            return metaTitle.replace(/\s+/g, ' ');
        }

        return '';
    };

    let title = readPageTitle();
    let attempts = 0;
    for (; !title && attempts < 10; attempts += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        title = readPageTitle();
    }

    if (!title) {
        titleSource = 'document.title fallback';
    }

    return {
        title: title || document.title.replace(/\s+/g, ' ').trim(),
        url: window.location.href,
        hostname,
        debug: {
            extractorVersion: 2,
            startedAt,
            elapsedMs: Date.now() - startedAt,
            attempts,
            selectors,
            selectorChecks,
            titleSource,
            documentTitle: document.title.replace(/\s+/g, ' ').trim(),
            readyState: document.readyState,
            bodyTextSample: document.body?.innerText?.replace(/\s+/g, ' ').slice(0, 300) || '',
        },
    };
}

async function getActivePageInfo(tab) {
    if (!tab?.id || !isSupportedMarketplaceUrl(tab.url)) {
        return {
            title: tab?.title || '',
            url: tab?.url || '',
            hostname: tab?.url ? new URL(tab.url).hostname : '',
            unsupported: true,
        };
    }

    const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractTitleFromPage,
    });

    return result?.result || {
        title: tab.title || '',
        url: tab.url || '',
        hostname: new URL(tab.url).hostname,
    };
}

async function searchCardvault(title) {
    if (!title) {
        return [];
    }
    const searchTerm = title.replace(/\s*\|\s*Vinted\s*$/i, '').trim();

    const response = await fetch(`${CARDVAULT_API_BASE_URL}/api/marketplace-autocomplete`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            search_term: searchTerm,
            result_limit: 5,
            pool_limit: 50,
            search_language: 'en',
        }),
    });

    if (!response.ok) {
        throw new Error(`Cardvault search failed with HTTP ${response.status}`);
    }

    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}

async function resolveActiveTabForSidePanel(tab) {
    const pageInfo = await getActivePageInfo(tab);
    let rows = [];
    let error = '';
    const debug = {
        version: 2,
        tab: {
            id: tab?.id || null,
            title: tab?.title || '',
            url: tab?.url || '',
        },
        query: (pageInfo.title || '').replace(/\s*\|\s*Vinted\s*$/i, '').trim(),
        apiBaseUrl: CARDVAULT_API_BASE_URL,
        searched: false,
        rowCount: 0,
        bestId: '',
        error: '',
    };

    if (!pageInfo.unsupported && pageInfo.title) {
        try {
            debug.searched = true;
            rows = await searchCardvault(pageInfo.title);
        } catch (searchError) {
            error = searchError.message || 'Cardvault search failed.';
            debug.error = error;
        }
    }

    const best = rows[0] || null;
    const blueprintId = best?.card_id ? String(best.card_id) : '';
    const pokoinUrl = blueprintId ? `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${blueprintId}` : '';
    debug.rowCount = rows.length;
    debug.bestId = blueprintId;

    await chrome.storage.session.set({
        sidePanelState: {
            updatedAt: Date.now(),
            pageInfo,
            rows,
            best,
            blueprintId,
            pokoinUrl,
            error,
            debug,
        },
    });

    return { pageInfo, rows, best, blueprintId, pokoinUrl, error, debug };
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 [Background] Message received:', request);
    
    if (request.action === 'updateIcon') {
        console.log('🎨 [Background] Updating icon to:', request.status);
        updateIcon(request.status);
        sendResponse({ success: true });
    } else if (request.action === 'updateStats') {
        updateStats(request.type, request.increment);
        sendResponse({ success: true });
    } else if (request.action === 'getStats') {
        sendResponse({ stats });
    } else if (request.action === 'toggleExtension') {
        // Implement extension enable/disable logic
        sendResponse({ success: true });
    } else if (request.action === 'resolveActiveTabForSidePanel') {
        getActiveTab()
            .then((tab) => {
                if (!tab) {
                    throw new Error('No active tab found.');
                }
                return resolveActiveTabForSidePanel(tab);
            })
            .then((result) => sendResponse({ success: true, result }))
            .catch((error) => {
                sendResponse({ success: false, error: error.message || 'Unable to refresh match.' });
            });
    }
    return true; // Keep channel open for async responses
});

chrome.action.onClicked.addListener(async (tab) => {
    try {
        if (chrome.sidePanel?.setOptions && tab?.id) {
            await chrome.sidePanel.setOptions({
                tabId: tab.id,
                path: 'ui-pages/sidepanel.html',
                enabled: true,
            });
        }

        if (chrome.sidePanel?.open) {
            await chrome.sidePanel.open({ tabId: tab.id });
        }

        await chrome.storage.session.set({
            sidePanelState: {
                updatedAt: Date.now(),
                pageInfo: {
                    title: tab?.title || '',
                    url: tab?.url || '',
                    hostname: tab?.url ? new URL(tab.url).hostname : '',
                },
                rows: [],
                best: null,
                blueprintId: '',
                pokoinUrl: '',
                error: '',
                loading: true,
            },
        });

        await resolveActiveTabForSidePanel(tab);
    } catch (error) {
        console.error('❌ Failed to open CardTrader side panel:', error);
        await chrome.storage.session.set({
            sidePanelState: {
                updatedAt: Date.now(),
                pageInfo: {
                    title: tab?.title || '',
                    url: tab?.url || '',
                    hostname: tab?.url ? new URL(tab.url).hostname : '',
                },
                rows: [],
                best: null,
                blueprintId: '',
                pokoinUrl: '',
                error: error.message || 'Unable to open side panel.',
            },
        });

        if (chrome.sidePanel?.open && tab?.id) {
            await chrome.sidePanel.open({ tabId: tab.id });
        }
    }
});

// Initialization
chrome.runtime.onInstalled.addListener(() => {
    console.log('🃏 Pokemon Card Trader Linker - Extension installed');
    updateIcon('default');
    if (chrome.sidePanel?.setPanelBehavior) {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    }
});

// Startup hook
chrome.runtime.onStartup.addListener(() => {
    console.log('🃏 Pokemon Card Trader Linker - Extension started');
    updateIcon('default');
}); 