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
                iconPath = 'icons/icon-32.png';
                break;
            case 'error':
                iconPath = 'icons/icon-32.png';
                break;
            default:
                iconPath = 'icons/icon-32.png';
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
            hostname.includes('cardmarket') ||
            hostname.includes('cardtrader');
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
        cardtrader: [
            '.py-3.text-center.text-sm-left h2',
            'h1',
            'h2',
        ],
    };

    const selectors = hostname.includes('vinted')
        ? selectorMap.vinted
        : hostname.includes('ebay')
            ? selectorMap.ebay
            : hostname.includes('cardmarket')
                ? selectorMap.cardmarket
                : hostname.includes('cardtrader')
                    ? selectorMap.cardtrader
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
    const cardmarketContext = hostname.includes('cardmarket')
        ? scrapeCardmarketContext(finalTitle)
        : null;
    const structuredCard = scrapeStructuredCardFields(finalTitle, cardmarketContext);
    const cardtraderBlueprintId = hostname.includes('cardtrader')
        ? window.location.pathname.match(/\/(?:[a-z]{2}\/)?cards\/(\d+)(?:-|\/|$)/i)?.[1] || ''
        : '';

    return {
        title: finalTitle,
        url: window.location.href,
        hostname,
        structuredCard,
        cardtraderBlueprintId,
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
            cardmarketContext,
        },
    };
}

function cleanCardmarketText(value = '') {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/\s+-\s+Singles?\s*$/i, '')
        .trim();
}

function scrapeCardmarketContext(title = '') {
    const subtitle = cleanCardmarketText(
        document.querySelector('.page-title-container h1 + div, .page-title-container .font-italic, .page-title-container em, .page-title-container small')
            ?.textContent || ''
    );
    const breadcrumbParts = [...document.querySelectorAll('.breadcrumb a, nav a')]
        .map((element) => cleanCardmarketText(element.textContent))
        .filter(Boolean);
    const expansionFromBreadcrumb = breadcrumbParts
        .slice()
        .reverse()
        .find((part) =>
            !/^(products?|pok[eé]mon|singles?|all)$/i.test(part) &&
            cleanCardmarketText(title).toLowerCase().indexOf(part.toLowerCase()) === -1
        ) || '';
    const documentTitleExpansion = cleanCardmarketText(title)
        .replace(/\s*\|\s*Cardmarket\s*$/i, '')
        .match(/\)\s*[-–]\s*(.+?)(?:\s*[-–]\s*Singles?)?$/i)?.[1] || '';

    return {
        subtitle,
        breadcrumbParts,
        expansion: subtitle || expansionFromBreadcrumb || cleanCardmarketText(documentTitleExpansion),
    };
}

function scrapeStructuredCardFields(title = '', context = null) {
    const cleanTitle = String(title || '')
        .replace(/\s*\|\s*Vinted\s*$/i, '')
        .replace(/\s*\|\s*Cardmarket\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    const cardmarketMatch = cleanTitle.match(/^(.+?)\s*\((?:[A-Z0-9]{2,6}\s*)?(\d{1,4}[a-z]?)\)\s*(?:[-–]\s*(.+?))?$/i);
    if (cardmarketMatch) {
        const [, cardName, cardNumber, trailingExpansion] = cardmarketMatch;
        const expansion = cleanCardmarketText(
            context?.expansion ||
            trailingExpansion ||
            ''
        );

        return {
            rawTitle: cleanTitle,
            name: removeMarketplaceSearchNoise(cardName),
            collectorNumber: cardNumber,
            expansion,
            rarity: '',
            variation: '',
        };
    }

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

    const hasEditionHint = /\b(?:1st|first|prima|primo|1)\s+(?:edition|edizione)\b/i.test(cleanTitle);
    const expansionAliases = [
        { pattern: /\b(?:set\s+base|base\s+set)\b/i, name: 'Base Set' },
    ];
    const aliasedExpansion = expansionAliases.find(({ pattern }) => pattern.test(cleanTitle))?.name || '';
    const expansionNoise = [
        'Legendary Treasure',
        'Legendary Treasures',
        'Black Star Promos',
        'BW Black Star Promos',
        'Paldean Fates',
        'Pokemon 151',
    ];
    const expansion = aliasedExpansion || expansionNoise.find((candidate) =>
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
        .replace(/\b(?:set\s+base|base\s+set)\b/gi, ' ')
        .replace(/\b(?:Legendary|Treasure|Treasures|Promo|Promos)\b/gi, ' ')
        .replace(/\b(?:special illustration rare|illustration rare|secret rare|ultra rare|holo rare|holo|promo|rare)\b/gi, ' ')
        .replace(/\b(?:ex|gx|vmax|vstar|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return {
        rawTitle: cleanTitle,
        name: removeMarketplaceSearchNoise(name),
        collectorNumber,
        expansion,
        editionHint: hasEditionHint,
        rarity,
        variation,
    };
}

function removeMarketplaceSearchNoise(value = '') {
    return String(value || '')
        .replace(/\b(?:1st|first|prima|primo|1)\s+(?:edition|edizione)\b/gi, ' ')
        .replace(/\b(?:set\s+base|base\s+set)\b/gi, ' ')
        .replace(/\b(?:pok[eé]mon|pokemon|pkkmn|pkn|pokn)\b/gi, ' ')
        .replace(/\b(?:sealed|seal(?:ed)?|salead|saled|sigillat[aoe]?|pack|booster|lot)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function compactSearchValue(value = '') {
    return removeMarketplaceSearchNoise(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function resolvedCardNameFromRow(row, term = '') {
    const compactTerm = compactSearchValue(term);
    if (compactTerm === 'nidoran') {
        return 'Nidoran';
    }

    return row?.canonical_name || row?.name || '';
}

function candidateNameTermsFromTitle(title = '') {
    const cleaned = removeMarketplaceSearchNoise(String(title || '')
        .replace(/\s*\|\s*(?:Vinted|Cardmarket)\s*$/i, '')
        .replace(/[()"'’`.,:;!?/\\[\]{}|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim());
    const stopWords = new Set([
        'carte', 'carta', 'card', 'cards', 'promo', 'promos', 'rare', 'holo',
        'stamp', 'stampa', 'stamped', 'black', 'star', 'treasure', 'treasures',
        'legendary', 'ottime', 'condizioni', 'condition', 'near', 'mint',
        'first', 'prima', 'primo', 'edition', 'edizione', 'set', 'base',
    ]);
    const words = cleaned
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word && !stopWords.has(word.toLowerCase()));
    const terms = [];

    for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
        for (let index = 0; index <= words.length - size; index += 1) {
            terms.push(words.slice(index, index + size).join(' '));
        }
    }

    return [...new Set(terms)].slice(0, 18);
}

async function resolveNameFromCardvaultTitle(title = '') {
    const attemptedTerms = [];

    for (const term of candidateNameTermsFromTitle(title)) {
        const response = await fetch(`${CARDVAULT_API_BASE_URL}/api/marketplace-autocomplete`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                search_term: term,
                result_limit: 3,
                pool_limit: 30,
                search_language: 'en',
            }),
        });

        if (!response.ok) {
            attemptedTerms.push({ term, error: `HTTP ${response.status}` });
            continue;
        }

        const payload = await response.json();
        const rows = normalizeCardvaultRows(payload);
        const compactTerm = compactSearchValue(term);
        const exactRow = rows.find((row) => {
            const canonical = compactSearchValue(row.canonical_name || '');
            const display = compactSearchValue(row.name || '');
            return canonical === compactTerm || display === compactTerm;
        });

        attemptedTerms.push({
            term,
            rowCount: rows.length,
            acceptedName: exactRow ? resolvedCardNameFromRow(exactRow, term) : '',
        });

        if (exactRow) {
            return {
                name: resolvedCardNameFromRow(exactRow, term),
                source: 'marketplace_card_names_for_language',
                term,
                attemptedTerms,
            };
        }
    }

    return {
        name: '',
        source: 'marketplace_card_names_for_language',
        attemptedTerms,
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
    const cleanTitle = removeMarketplaceSearchNoise(title.replace(/\s*\|\s*Vinted\s*$/i, '')).trim();
    const queries = [cleanTitle];
    const promoCode = cleanTitle.match(/\b(?:BW|XY|SM|SWSH|SVP)\s?\d+\b/i)?.[0]?.replace(/\s+/g, '');

    if (promoCode) {
        // Promo codes are often the strongest identifier when marketplace titles
        // include noisy set guesses such as "Legendary Treasure".
        queries.push(promoCode);

        const withoutNoise = cleanTitle
            .replace(/\b(Carte|Stamp|Stampa|Legendary|Treasure|Treasures)\b/gi, ' ')
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

function sortRowsForTitle(rows, title, preferredName = '') {
    const normalizedTitle = title.toLowerCase();
    const compactPreferredName = compactSearchValue(preferredName);
    return [...rows].sort((a, b) => {
        const aNameMatch = compactPreferredName && compactSearchValue(a.canonical_name || a.name) === compactPreferredName ? 0 : 1;
        const bNameMatch = compactPreferredName && compactSearchValue(b.canonical_name || b.name) === compactPreferredName ? 0 : 1;
        if (aNameMatch !== bNameMatch) {
            return aNameMatch - bNameMatch;
        }

        const aStaffPenalty = !normalizedTitle.includes('staff') && /staff/i.test(a.card_number || '') ? 1 : 0;
        const bStaffPenalty = !normalizedTitle.includes('staff') && /staff/i.test(b.card_number || '') ? 1 : 0;
        return aStaffPenalty - bStaffPenalty;
    });
}

async function searchCardvault(title, preferredName = '') {
    if (!title) {
        return { rows: [], debug: { attemptedQueries: [] } };
    }

    const attemptedQueries = [];
    const queries = preferredName
        ? [preferredName, ...buildCardvaultQueries(title).filter((query) => compactSearchValue(query).includes(compactSearchValue(preferredName)))]
        : buildCardvaultQueries(title);

    for (const searchTerm of [...new Set(queries.filter(Boolean))]) {
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
        const rows = sortRowsForTitle(normalizeCardvaultRows(payload), title, preferredName);
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

function rowMatchesStructuredName(row, structuredCard) {
    const requestedName = compactSearchValue(structuredCard?.name || '');
    if (!requestedName) {
        return true;
    }

    const rowName = compactSearchValue(row?.name || '');
    if (!rowName) {
        return false;
    }

    if (requestedName === 'nidoran') {
        return rowName.startsWith('nidoran');
    }

    return rowName === requestedName ||
        rowName.includes(requestedName) ||
        requestedName.includes(rowName);
}

function isAllowedBaseSetFamily(row) {
    const setName = compactSearchValue(row?.set_name || '');
    return setName === 'baseset' ||
        setName === 'baseset2' ||
        setName === 'basesetshadowless';
}

function sortRowsForStructuredCard(rows, structuredCard = {}) {
    const requestedExpansion = compactSearchValue(structuredCard.expansion || '');
    const requestedName = compactSearchValue(structuredCard.name || '');
    const hasEditionHint = Boolean(structuredCard.editionHint);

    return [...rows].sort((a, b) => {
        const aExpansionPenalty = requestedExpansion && compactSearchValue(a.set_name || '') !== requestedExpansion ? 1 : 0;
        const bExpansionPenalty = requestedExpansion && compactSearchValue(b.set_name || '') !== requestedExpansion ? 1 : 0;
        if (aExpansionPenalty !== bExpansionPenalty) {
            return aExpansionPenalty - bExpansionPenalty;
        }

        const aEditionBoost = hasEditionHint && isAllowedBaseSetFamily(a) ? 0 : 1;
        const bEditionBoost = hasEditionHint && isAllowedBaseSetFamily(b) ? 0 : 1;
        if (aEditionBoost !== bEditionBoost) {
            return aEditionBoost - bEditionBoost;
        }

        const aNamePenalty = requestedName === 'nidoran' && !compactSearchValue(a.name || '').startsWith('nidoran') ? 1 : 0;
        const bNamePenalty = requestedName === 'nidoran' && !compactSearchValue(b.name || '').startsWith('nidoran') ? 1 : 0;
        if (aNamePenalty !== bNamePenalty) {
            return aNamePenalty - bNamePenalty;
        }

        return Number(b.search_rank || 0) - Number(a.search_rank || 0);
    });
}

function uniqueRowsById(rows = []) {
    const seen = new Set();
    return rows.filter((row) => {
        const id = String(row.card_id || '');
        if (!id || seen.has(id)) {
            return false;
        }
        seen.add(id);
        return true;
    });
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
        editionHint: structuredCard.editionHint,
        language: 'en',
        limit: 8,
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
    let matches = data.matches || [];
    if (structuredCard.editionHint && !structuredCard.expansion && structuredCard.name) {
        const editionResponse = await fetch(`${CARDVAULT_API_BASE_URL}/api/extension-card-search`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                ...payload,
                expansion: 'Base Set',
                editionHint: false,
                limit: 5,
            }),
        });
        if (editionResponse.ok) {
            const editionData = await editionResponse.json();
            matches = [...(editionData.matches || []), ...matches];
        }
    }

    const rows = uniqueRowsById(matches
        .map(rowFromExtensionMatch)
        .filter(Boolean)
        .filter((row) => rowMatchesStructuredName(row, structuredCard))
        .filter((row) => compactSearchValue(structuredCard.expansion || '') !== 'baseset' || isAllowedBaseSetFamily(row)));

    return {
        rows: sortRowsForStructuredCard(rows, structuredCard),
        debug: {
            endpoint: '/api/extension-card-search',
            payload,
            query: data.query || '',
            source: data.source || '',
            input: data.input || {},
            matchCount: data.matches?.length || 0,
            acceptedMatchCount: rows.length,
        },
    };
}

function legacyResultFromRow(row) {
    return {
        blueprint_id: row.card_id,
        name_en: row.name,
        pokemon_name: row.name,
        expansion_name_en: row.set_name,
        collector_number: row.card_number,
        rarity: row.rarity,
        image_url: row.image_url || row.cdn_image_url,
        preview_image_url: row.preview_image_url,
        source: row.source || 'background_card_search',
        search_score: row.search_rank,
    };
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}

function sameUrlWithoutHash(a = '', b = '') {
    try {
        const left = new URL(a);
        const right = new URL(b);
        left.hash = '';
        right.hash = '';
        return left.href === right.href;
    } catch (error) {
        return a === b;
    }
}

const sidePanelRefreshTimers = new Map();

async function scheduleSidePanelRefresh(tab, reason = 'navigation') {
    if (!tab?.id || !isSupportedMarketplaceUrl(tab.url)) {
        return;
    }

    const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
    const currentStateUrl = sidePanelState?.pageInfo?.url || '';
    if (currentStateUrl && sameUrlWithoutHash(currentStateUrl, tab.url) && reason !== 'activated') {
        return;
    }

    clearTimeout(sidePanelRefreshTimers.get(tab.id));
    sidePanelRefreshTimers.set(tab.id, setTimeout(async () => {
        sidePanelRefreshTimers.delete(tab.id);
        try {
            await chrome.storage.session.set({
                sidePanelState: {
                    ...(sidePanelState || {}),
                    updatedAt: Date.now(),
                    loading: true,
                    pageInfo: {
                        ...(sidePanelState?.pageInfo || {}),
                        title: tab.title || '',
                        url: tab.url || '',
                        hostname: tab.url ? new URL(tab.url).hostname : '',
                    },
                    error: '',
                },
            });
            await resolveActiveTabForSidePanel(tab);
            console.log(`✅ [Background] Side panel refreshed after ${reason}`);
        } catch (error) {
            console.warn(`⚠️ [Background] Side panel refresh failed after ${reason}:`, error);
        }
    }, 700));
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
            if (pageInfo.cardtraderBlueprintId) {
                rows = [{
                    card_id: pageInfo.cardtraderBlueprintId,
                    name: pageInfo.structuredCard?.name || pageInfo.title,
                    set_name: pageInfo.structuredCard?.expansion || '',
                    card_number: pageInfo.structuredCard?.collectorNumber || '',
                    source: 'cardtrader_url',
                    search_rank: 999999,
                }];
                debug.cardtraderBlueprintId = pageInfo.cardtraderBlueprintId;
            } else {
                try {
                    const nameResolution = await resolveNameFromCardvaultTitle(pageInfo.title);
                    debug.nameResolution = nameResolution;
                    if (nameResolution.name) {
                        pageInfo.structuredCard = {
                            ...(pageInfo.structuredCard || {}),
                            name: nameResolution.name,
                        };
                    }
                } catch (nameResolutionError) {
                    debug.nameResolution = {
                        source: 'marketplace_card_names_for_language',
                        error: nameResolutionError.message || 'Card name resolution failed.',
                    };
                }

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
                    const searchResult = await searchCardvault(pageInfo.title, pageInfo.structuredCard?.name || '');
                    rows = searchResult.rows;
                    debug.attemptedQueries = searchResult.debug.attemptedQueries;
                }
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
    } else if (request.action === 'searchCardForTitle') {
        const tab = sender.tab;
        const title = request.title || tab?.title || '';
        Promise.resolve()
            .then(async () => {
                if (!title) {
                    return [];
                }
                const structuredCard = scrapeStructuredCardFields(title);
                const nameResolution = await resolveNameFromCardvaultTitle(title);
                if (nameResolution.name) {
                    structuredCard.name = nameResolution.name;
                }
                const searchResult = await searchExtensionCard(structuredCard);
                return searchResult.rows.map(legacyResultFromRow);
            })
            .then((results) => sendResponse({ success: true, results }))
            .catch((error) => sendResponse({ success: false, error: error.message || 'Unable to search card.' }));
    } else if (request.action === 'openSidePanelForCurrentTab') {
        const tab = sender.tab;
        if (!tab?.id) {
            sendResponse({ success: false, error: 'No sender tab found.' });
            return false;
        }

        chrome.sidePanel?.open({ tabId: tab.id })
            .then(() => resolveActiveTabForSidePanel(tab))
            .then((result) => sendResponse({ success: true, result }))
            .catch((error) => {
                sendResponse({ success: false, error: error.message || 'Unable to open side panel.' });
            });
    } else if (request.action === 'marketplaceNavigationChanged') {
        const tab = sender.tab;
        scheduleSidePanelRefresh(tab, 'content-navigation')
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message || 'Unable to schedule refresh.' }));
    }
    return true; // Keep channel open for async responses
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== 'complete') {
        return;
    }
    scheduleSidePanelRefresh(tab, changeInfo.url ? 'tab-url' : 'tab-complete');
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        const tab = await chrome.tabs.get(tabId);
        await scheduleSidePanelRefresh(tab, 'activated');
    } catch (error) {
        console.warn('⚠️ [Background] Unable to refresh after tab activation:', error);
    }
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