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

    const finalTitle = title || document.title.replace(/\s+/g, ' ').trim();
    const structuredCard = scrapeStructuredCardFields(finalTitle);

    return {
        title: finalTitle,
        url: window.location.href,
        hostname,
        structuredCard,
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

function scrapeStructuredCardFields(title = '') {
    const cleanTitle = String(title || '')
        .replace(/\s*\|\s*Vinted\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    const withoutMarketplaceNoise = cleanTitle
        .replace(/\b(Carte|Carta|Card|Pok[eé]mon|Pokemon)\b/gi, ' ')
        .replace(/\b(Stamp|Stampa|Stamped)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const collectorNumber = (
        cleanTitle.match(/\b(?:BW|XY|SM|SWSH|SVP)\s?\d+[a-z]?\b/i)?.[0] ||
        cleanTitle.match(/\b\d{1,3}\s*\/\s*\d{1,3}\b/)?.[0] ||
        cleanTitle.match(/\b[A-Z]{1,5}\d{1,3}[a-z]?\b/)?.[0] ||
        ''
    ).replace(/\s+/g, '');

    const variationMatch = cleanTitle.match(/\b(?:ex|gx|vmax|vstar|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/i);
    const variation = variationMatch
        ? variationMatch[0].replace(/\s+/g, '').replace(/\./g, '').toLowerCase()
        : '';

    const rarityMatch = cleanTitle.match(/\b(?:special illustration rare|illustration rare|secret rare|ultra rare|holo rare|holo|promo|rare)\b/i);
    const rarity = rarityMatch ? rarityMatch[0].replace(/\s+/g, ' ') : '';

    const expansionNoise = [
        'Legendary Treasure',
        'Legendary Treasures',
        'Black Star Promos',
        'BW Black Star Promos',
        'Paldean Fates',
        'Pokemon 151',
    ];
    const expansion = expansionNoise.find((candidate) =>
        new RegExp(`\\b${candidate.replace(/\s+/g, '\\s+')}\\b`, 'i').test(cleanTitle)
    ) || '';

    let name = withoutMarketplaceNoise;
    if (collectorNumber) {
        name = name.replace(new RegExp(`\\b${collectorNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), ' ');
    }
    if (expansion) {
        name = name.replace(new RegExp(`\\b${expansion.replace(/\s+/g, '\\s+')}\\b`, 'i'), ' ');
    }
    name = name
        .replace(/\b(?:Legendary|Treasure|Treasures|Promo|Promos)\b/gi, ' ')
        .replace(/\b(?:special illustration rare|illustration rare|secret rare|ultra rare|holo rare|holo|promo|rare)\b/gi, ' ')
        .replace(/\b(?:ex|gx|vmax|vstar|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return {
        rawTitle: cleanTitle,
        name,
        collectorNumber,
        expansion,
        rarity,
        variation,
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

function buildCardvaultQueries(title) {
    const cleanTitle = title.replace(/\s*\|\s*Vinted\s*$/i, '').trim();
    const queries = [cleanTitle];
    const promoCode = cleanTitle.match(/\b(?:BW|XY|SM|SWSH|SVP)\s?\d+\b/i)?.[0]?.replace(/\s+/g, '');

    if (promoCode) {
        // Promo codes are often the strongest identifier when marketplace titles
        // include noisy set guesses such as "Legendary Treasure".
        queries.push(promoCode);

        const withoutNoise = cleanTitle
            .replace(/\b(Carte|Pok[eé]mon|Pokemon|Stamp|Stampa|Legendary|Treasure|Treasures)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (withoutNoise) {
            queries.push(withoutNoise);
        }
    }

    return [...new Set(queries.filter(Boolean))];
}

function normalizeCardvaultRows(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload && typeof payload === 'object') {
        return payload.rows || payload.results || payload.data || [];
    }

    return [];
}

function sortRowsForTitle(rows, title) {
    const normalizedTitle = title.toLowerCase();
    return [...rows].sort((a, b) => {
        const aStaffPenalty = !normalizedTitle.includes('staff') && /staff/i.test(a.card_number || '') ? 1 : 0;
        const bStaffPenalty = !normalizedTitle.includes('staff') && /staff/i.test(b.card_number || '') ? 1 : 0;
        return aStaffPenalty - bStaffPenalty;
    });
}

async function searchCardvault(title) {
    if (!title) {
        return { rows: [], debug: { attemptedQueries: [] } };
    }

    const attemptedQueries = [];

    for (const searchTerm of buildCardvaultQueries(title)) {
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

        const payload = await response.json();
        const rows = sortRowsForTitle(normalizeCardvaultRows(payload), title);
        attemptedQueries.push({
            query: searchTerm,
            rowCount: rows.length,
            responseShape: Array.isArray(payload) ? 'array' : typeof payload,
            searchContext: payload?.search_context || null,
        });

        if (rows.length > 0) {
            return { rows, debug: { attemptedQueries } };
        }
    }

    return { rows: [], debug: { attemptedQueries } };
}

function rowFromExtensionMatch(match) {
    if (!match) {
        return null;
    }

    return {
        card_id: match.cardId,
        name: match.name,
        set_name: match.expansionName,
        card_number: match.collectorNumber,
        rarity: match.rarity,
        card_type: match.cardType,
        item_kind: match.itemKind,
        product_type: match.productType,
        trainer_name: match.trainerName,
        image_url: match.imageUrl,
        cdn_image_url: match.imageUrl,
        preview_image_url: match.previewImageUrl,
        card_palette: match.cardPalette,
        emoji: match.emoji,
        search_rank: match.score,
    };
}

async function searchExtensionCard(structuredCard) {
    if (!structuredCard?.name && !structuredCard?.collectorNumber) {
        return { rows: [], debug: { endpoint: '/api/extension-card-search', skipped: true } };
    }

    const payload = {
        name: structuredCard.name,
        collectorNumber: structuredCard.collectorNumber,
        expansion: structuredCard.expansion,
        rarity: structuredCard.rarity,
        variation: structuredCard.variation,
        language: 'en',
        limit: 3,
    };

    const response = await fetch(`${CARDVAULT_API_BASE_URL}/api/extension-card-search`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Extension card search failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
        rows: (data.matches || []).map(rowFromExtensionMatch).filter(Boolean),
        debug: {
            endpoint: '/api/extension-card-search',
            payload,
            query: data.query || '',
            source: data.source || '',
            input: data.input || {},
            matchCount: data.matches?.length || 0,
        },
    };
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
        attemptedQueries: [],
        searched: false,
        rowCount: 0,
        bestId: '',
        error: '',
    };

    if (!pageInfo.unsupported && pageInfo.title) {
        try {
            debug.searched = true;
            try {
                const extensionSearchResult = await searchExtensionCard(pageInfo.structuredCard);
                rows = extensionSearchResult.rows;
                debug.extensionSearch = extensionSearchResult.debug;
            } catch (extensionSearchError) {
                debug.extensionSearch = {
                    endpoint: '/api/extension-card-search',
                    error: extensionSearchError.message || 'Extension card search failed.',
                };
            }

            if (rows.length === 0) {
                const searchResult = await searchCardvault(pageInfo.title);
                rows = searchResult.rows;
                debug.attemptedQueries = searchResult.debug.attemptedQueries;
            }
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