// Background script for Pokemon Card Trader Linker
const EXTENSION_VERSION = (chrome.runtime?.getManifest?.() || {}).version || '2.0.0';
const EXTENSION_BUILD_MARKER = `${EXTENSION_VERSION}-runtime-divergence-guard`;
const EXTENSION_RUNTIME_STORAGE_KEY = 'pokoinExtensionRuntime';
const CARDVAULT_API_BASE_URL = 'https://pokoin.com';
const POKOIN_AUTH_ORIGIN = 'https://pokoin.com';
const POKOIN_AUTH_BRIDGE_PATH = '/extension/auth-bridge';
const POKOIN_AUTH_BRIDGE_URL = `${POKOIN_AUTH_ORIGIN}${POKOIN_AUTH_BRIDGE_PATH}`;
const POKOIN_AUTH_STORAGE_KEY = 'pokoinAuthSession';
const POKOIN_AUTH_TOKEN_RESPONSE_TYPE = 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE';
const POKOIN_TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const POKOIN_FALLBACK_TOKEN_TTL_MS = 50 * 60 * 1000;
const CARDMARKET_OBSERVATION_ENDPOINT = `${CARDVAULT_API_BASE_URL}/api/cardmarket-scrape-observation`;
const MAX_PENDING_CARDMARKET_OBSERVATIONS = 20;
const CARDVAULT_FETCH_TIMEOUT_MS = 6000;
const CARDVAULT_FETCH_RETRY_DELAY_MS = 250;
const VINTED_TOKEN_READY_TIMEOUT_MS = 6000;
const RECENT_SEARCH_CACHE_LIMIT = 20;
const CARDVAULT_NAME_RESOLUTION_CACHE_LIMIT = 50;
const SEARCHBAR_TOKEN_PREDICT_MIN_CONFIDENCE = 70;
const CARDVAULT_TOKEN_PREDICTION_CACHE_LIMIT = 50;

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

function isTransientFetchError(error = {}) {
    const message = String(error?.message || error || '');
    return error?.name === 'TypeError' ||
        error?.name === 'AbortError' ||
        /failed to fetch|network|timeout|aborted/i.test(message);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cardvaultFetch(url, options = {}, retryOptions = {}) {
    const attempts = Number.isFinite(retryOptions.attempts) ? retryOptions.attempts : 2;
    const timeoutMs = Number.isFinite(retryOptions.timeoutMs) ? retryOptions.timeoutMs : CARDVAULT_FETCH_TIMEOUT_MS;
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const controller = typeof AbortController !== 'undefined' && !options.signal
            ? new AbortController()
            : null;
        const timeoutId = controller
            ? setTimeout(() => controller.abort(), timeoutMs)
            : null;
        try {
            return await fetch(url, {
                ...options,
                ...(controller ? { signal: controller.signal } : {}),
            });
        } catch (error) {
            lastError = error;
            if (attempt >= attempts || !isTransientFetchError(error)) {
                throw error;
            }
            await delay(CARDVAULT_FETCH_RETRY_DELAY_MS);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }

    throw lastError || new Error('Cardvault request failed.');
}

function cardtraderBlueprintIdFromUrl(url = '') {
    try {
        const { hostname, pathname } = new URL(url);
        if (!hostname.includes('cardtrader')) {
            return '';
        }
        return pathname.match(/\/(?:[a-z]{2}\/)?cards\/(\d+)(?:-|\/|$)/i)?.[1] || '';
    } catch (error) {
        return '';
    }
}

function titleCaseCardTraderSlugName(value = '') {
    return String(value || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b(?:and)\b/gi, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b(?:ex|gx|vmax|vstar|v|lv x)\b/gi, (match) => match.toUpperCase())
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function cardTraderNameFromUrlSlug(value = '') {
    try {
        const pathname = new URL(value).pathname;
        const slug = pathname.match(/\/(?:[a-z]{2}\/)?cards\/\d+(?:-|\/)([^/?#]+)/i)?.[1] || '';
        return slug ? titleCaseCardTraderSlugName(decodeURIComponent(slug)) : '';
    } catch (error) {
        return '';
    }
}

function normalizeCardTraderDirectTitle(value = '') {
    return String(value || '')
        .replace(/^(.+?)\s*\([^)]*(?:\||\d{1,4}\s*\/\s*\d{1,4}|©|Wizards|WOTC)[^)]*\).*$/i, '$1')
        .replace(/\s*\|\s*(?:CardTrader|Pok[eé]mon)\s*$/gi, '')
        .replace(/\s*\|.*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripCardTraderExpansionSuffix(value = '') {
    return String(value || '')
        .replace(/\s+\b(?:Wizards\s+of\s+the\s+Coast(?:\s+Era)?(?:\s+Promos)?|WOTC(?:\s+Promos)?|Black\s+Star\s+Promos?|Team\s+Up|Base\s+Set|Jungle|Fossil|Rocket|Gym\s+(?:Heroes|Challenge)|Neo\s+\w+|EX\s+\w+|Diamond\s+&\s+Pearl|Platinum|HeartGold\s+SoulSilver|Black\s+&\s+White|XY|Sun\s+&\s+Moon|Sword\s+&\s+Shield|Scarlet\s+&\s+Violet)\b.*$/i, '')
        .replace(/\s+\b(?:Promo|Promos|Singles?|Cards?|Pok[eé]mon)\b.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanCardTraderDirectName(value = '', url = '', blueprintId = '') {
    const slugName = stripCardTraderExpansionSuffix(cardTraderNameFromUrlSlug(url || value));
    const cleanValue = normalizeCardTraderDirectTitle(value);
    const looksLikeUrl = /^https?:\/\//i.test(cleanValue) ||
        /cardtrader\.com/i.test(cleanValue) ||
        /\/cards\/\d+/i.test(cleanValue);

    if (cleanValue && !looksLikeUrl) {
        const slugPrefix = slugName
            ? cleanValue.match(new RegExp(`^\\s*${slugName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'))?.[0] || ''
            : '';
        if (slugPrefix) {
            return slugPrefix.replace(/\s+/g, ' ').trim();
        }
        const titleName = stripCardTraderExpansionSuffix(scrapeStructuredCardFields(cleanValue).name);
        if (titleName) {
            return titleName;
        }
        return stripCardTraderExpansionSuffix(cleanValue) || cleanValue;
    }

    if (slugName) {
        return slugName;
    }
    return blueprintId ? `CardTrader card ${blueprintId}` : '';
}

function buildCardTraderDirectPageInfo(tab = {}) {
    const blueprintId = cardtraderBlueprintIdFromUrl(tab.url || '');
    if (!blueprintId) {
        return null;
    }

    const title = cleanCardTraderDirectName(tab.title || '', tab.url || '', blueprintId);
    return {
        title,
        url: tab.url || '',
        hostname: tab.url ? new URL(tab.url).hostname : '',
        structuredCard: scrapeStructuredCardFields(title),
        cardtraderBlueprintId: blueprintId,
        debug: {
            extractorVersion: 2,
            titleSource: 'cardtrader URL blueprint id',
            directCardTrader: true,
        },
    };
}

async function extractTitleFromPage() {
    const hostname = window.location.hostname;
    const startedAt = Date.now();
    const isCardmarketPage = hostname.includes('cardmarket');
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
            : isCardmarketPage
                ? selectorMap.cardmarket
                : hostname.includes('cardtrader')
                    ? selectorMap.cardtrader
                    : ['h1', 'title'];

    const selectorChecks = [];
    let titleSource = '';

    const isPokoinOwnedElement = (element) => Boolean(element?.closest?.(
        '[data-pokemon-linker-button], [data-pokoin-extension-panel], [data-pokoin-vinted-panel], [data-pokoin-vinted-panel-host], [data-pokoin-candidate-preview]'
    ));

    const cleanElementText = (element) => {
        if (!element) {
            return '';
        }
        const clone = element.cloneNode?.(true);
        if (clone?.querySelectorAll) {
            [...clone.querySelectorAll('[data-pokemon-linker-button], [data-pokoin-extension-panel], [data-pokoin-vinted-panel], [data-pokoin-vinted-panel-host], [data-pokoin-candidate-preview], button, input, iframe')]
                .forEach((child) => child.remove?.());
        }
        return cleanCardmarketText((clone?.textContent || element.textContent || '').replace(/\s+/g, ' '));
    };

    const findCardmarketTitleElement = () => {
        const titleElements = [
            ...document.querySelectorAll('.page-title-container h1'),
            ...document.querySelectorAll('main h1'),
            ...document.querySelectorAll('h1'),
        ];
        return titleElements.find((element) => {
            if (!element || isPokoinOwnedElement(element)) {
                return false;
            }
            const text = cleanElementText(element);
            return /\([A-Z0-9]{1,6}\s*\d{1,4}[a-z]?\)/i.test(text) ||
                Boolean(element.closest?.('.page-title-container'));
        }) || null;
    };

    const readPageTitle = () => {
        selectorChecks.length = 0;
        if (isCardmarketPage) {
            const titleElement = findCardmarketTitleElement();
            const title = cleanElementText(titleElement);
            selectorChecks.push({
                selector: 'cardmarket-page-title',
                found: Boolean(titleElement),
                text: title ? title.replace(/\s+/g, ' ').slice(0, 160) : '',
            });
            if (title) {
                titleSource = 'cardmarket-page-title';
                return title;
            }
        }

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            const title = isCardmarketPage
                ? cleanElementText(element)
                : element?.textContent?.trim();
            selectorChecks.push({
                selector,
                found: Boolean(element),
                text: title ? title.replace(/\s+/g, ' ').slice(0, 160) : '',
            });
            if (title && (!isCardmarketPage || !isPokoinOwnedElement(element))) {
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
    const cardmarketContext = isCardmarketPage
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
        .replace(/\bPokoin\.com(?:\s*\(\d+\))?\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s*-?\s*Singles?\s*$/i, '')
        .trim();
}

function isCardmarketExpansionText(value = '') {
    const cleanValue = cleanCardmarketText(value);
    return Boolean(
        cleanValue &&
        !/^\(?\d+\)?$/.test(cleanValue) &&
        !/^Pokoin\.com\b/i.test(String(value || '').trim())
    );
}

function normalizeCardmarketDetailLabel(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function scrapeCardmarketDetailFields() {
    const labels = {
        number: new Set(['numero', 'number', 'nr', 'no']),
        expansion: new Set(['stampata in', 'printed in', 'expansion', 'espansione', 'set']),
        species: new Set(['specie', 'species']),
        rarity: new Set(['rarita', 'rarity']),
    };
    const fields = {};
    const detailRoot = document.querySelector('main.container #mainContent, #mainContent, main.container, main') || document;
    const candidates = [...detailRoot.querySelectorAll('dl.labeled dt, dl.labeled th, dl.labeled strong, dl.labeled b, dt, th')];

    for (const element of candidates) {
        const label = normalizeCardmarketDetailLabel(element.textContent || '');
        const fieldName = Object.entries(labels).find(([, values]) => values.has(label))?.[0];
        if (!fieldName || fields[fieldName]) {
            continue;
        }
        const valueElement = element.nextElementSibling || element.parentElement?.querySelector?.('dd, td, .col-6:last-child, .col-md-8, .col-md-9');
        const value = cleanCardmarketText(valueElement?.textContent || '');
        if (value && normalizeCardmarketDetailLabel(value) !== label) {
            fields[fieldName] = value;
        }
    }

    return fields;
}

function scrapeCardmarketContext(title = '') {
    const subtitleFromHeadingSpan = [...document.querySelectorAll('.page-title-container h1 span, h1 span.h4, h1 .text-muted')]
        .map((element) => element.textContent || '')
        .filter(isCardmarketExpansionText)
        .map(cleanCardmarketText)
        .find(Boolean) || '';
    const subtitle = cleanCardmarketText(
        document.querySelector('.page-title-container h1 + div, .page-title-container .font-italic, .page-title-container em, .page-title-container small')
            ?.textContent || ''
    );
    const breadcrumbParts = [...document.querySelectorAll('.breadcrumb a, nav a')]
        .map((element) => cleanCardmarketText(element.textContent))
        .filter(Boolean);
    const pageUrlExpansion = cardmarketExpansionFromUrl(window.location.href);
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
    const details = scrapeCardmarketDetailFields();

    return {
        subtitle: subtitleFromHeadingSpan || subtitle,
        breadcrumbParts,
        details,
        expansion: details.expansion || subtitleFromHeadingSpan || subtitle || pageUrlExpansion || expansionFromBreadcrumb || cleanCardmarketText(documentTitleExpansion),
    };
}

function cardmarketExpansionAliases() {
    return [
        { pattern: /^(?:DRS|Dragon\s+Selection)$/i, name: 'Dragon Selection' },
        { pattern: /\b(?:RC|Radiant\s+Collection)\b/i, name: 'Radiant Collection' },
        { pattern: /\bGenerations\s+Radiant\s+Collection\b/i, name: 'Generations Radiant Collection' },
        { pattern: /\b(?:ex\s+)?(?:sandstorm|tempesta\s+di\s+sabbia)\b/i, name: 'EX Sandstorm' },
        { pattern: /\b(?:set\s+base|base\s+set)\b/i, name: 'Base Set' },
        { pattern: /\bevoluzioni\b/i, name: 'Evolutions' },
        { pattern: /\bequilibrio\s+perfetto\b/i, name: 'Perfect Order' },
        { pattern: /\bcaos\s+nascente\b/i, name: 'Chaos Rising' },
        { pattern: /\bex\s+leggende\s+nascoste\b/i, name: 'EX Hidden Legends' },
        { pattern: /\bex\s+hidden\s+legends\b/i, name: 'EX Hidden Legends' },
        { pattern: /\bHL\s+EX\s+Hidden\s+Legends\b|\bEX\s+Hidden\s+Legends\b/i, name: 'HL EX Hidden Legends' },
        { pattern: /\btesori\s+misteriosi\b|\bmysterious\s+treasures\b/i, name: 'Mysterious Treasures' },
        { pattern: /\bselezione\s+drago\b|\bdragon\s+selection\b/i, name: 'Dragon Selection' },
        { pattern: /\bTR\s+Team\s+Rocket\b|\bTeam\s+Rocket\b/i, name: 'Team Rocket' },
    ];
}

function normalizeExpansionAlias(value = '') {
    const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
    const aliases = typeof cardmarketExpansionAliases === 'function'
        ? cardmarketExpansionAliases()
        : [
            { pattern: /^(?:DRS|Dragon\s+Selection)$/i, name: 'Dragon Selection' },
            { pattern: /\b(?:RC|Radiant\s+Collection)\b/i, name: 'Radiant Collection' },
            { pattern: /\bGenerations\s+Radiant\s+Collection\b/i, name: 'Generations Radiant Collection' },
            { pattern: /\b(?:ex\s+)?(?:sandstorm|tempesta\s+di\s+sabbia)\b/i, name: 'EX Sandstorm' },
            { pattern: /\b(?:set\s+base|base\s+set)\b/i, name: 'Base Set' },
            { pattern: /\bevoluzioni\b/i, name: 'Evolutions' },
            { pattern: /\bequilibrio\s+perfetto\b/i, name: 'Perfect Order' },
            { pattern: /\bcaos\s+nascente\b/i, name: 'Chaos Rising' },
            { pattern: /\bex\s+leggende\s+nascoste\b/i, name: 'EX Hidden Legends' },
            { pattern: /\bex\s+hidden\s+legends\b/i, name: 'EX Hidden Legends' },
            { pattern: /\bHL\s+EX\s+Hidden\s+Legends\b|\bEX\s+Hidden\s+Legends\b/i, name: 'HL EX Hidden Legends' },
            { pattern: /\btesori\s+misteriosi\b|\bmysterious\s+treasures\b/i, name: 'Mysterious Treasures' },
            { pattern: /\bselezione\s+drago\b|\bdragon\s+selection\b/i, name: 'Dragon Selection' },
            { pattern: /\bTR\s+Team\s+Rocket\b|\bTeam\s+Rocket\b/i, name: 'Team Rocket' },
        ];
    return aliases.find(({ pattern }) => pattern.test(cleanValue))?.name || cleanValue;
}

function parseCardmarketCollectorCode(value = '') {
    const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
    if (/\b(?:NM|LP|MP|HP|DMG|GD|VG|PR)\s*\/\s*(?:NM|LP|MP|HP|DMG|GD|VG|PR)\b/i.test(cleanValue) ||
        /\b(?:NM|LP|MP|HP|DMG|GD|VG|PR)\s+\d{4}\b/i.test(cleanValue)) {
        return { collectorNumber: '', printedNumber: '' };
    }
    if (/^\d{1,4}[a-z]?$/i.test(cleanValue)) {
        return { collectorNumber: cleanValue, printedNumber: cleanValue };
    }

    const match = cleanValue.match(/\b([A-Z0-9]*[A-Z][A-Z0-9]{0,5})?\s*(\d{1,4}[a-z]?)\b/i);
    if (!match) {
        return { collectorNumber: '', printedNumber: '' };
    }
    const prefix = (match[1] || '').trim();
    const printedNumber = match[2];
    return {
        collectorNumber: [prefix.toUpperCase(), printedNumber].filter(Boolean).join(' '),
        printedNumber,
    };
}

function cardmarketContextFromRequest(request = {}, requestUrl = '') {
    if (!isCardmarketUrl(requestUrl)) {
        return null;
    }
    const requestClues = normalizeRequestClues(request.selectedClues || request.clues);
    const urlExpansion = cardmarketExpansionFromUrl(requestUrl);
    const expansionClue = requestClues.find((clue) => {
        const normalized = normalizeExpansionAlias(clue);
        return normalized && compactSetValue(normalized) !== compactSetValue(clue);
    }) || '';
    const numberClue = requestClues.find((clue) =>
        Boolean(parseCardmarketCollectorCode(clue).collectorNumber)
    ) || '';
    return {
        expansion: normalizeExpansionAlias(expansionClue || urlExpansion),
        details: {
            number: numberClue,
            expansion: expansionClue || urlExpansion,
        },
    };
}

function cardmarketExpansionFromUrl(url = '') {
    try {
        const pathParts = new URL(url).pathname
            .split('/')
            .map((part) => decodeURIComponent(part))
            .filter(Boolean);
        const singlesIndex = pathParts.findIndex((part) => /^Singles$/i.test(part));
        const expansionSlug = singlesIndex >= 0 ? pathParts[singlesIndex + 1] : '';
        return expansionSlug
            ? expansionSlug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
            : '';
    } catch (error) {
        return '';
    }
}

function titleCaseCardmarketSlug(value = '') {
    let text = String(value || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\bex|gx|vmax|vstar|lv x\b/gi, (match) => match.toUpperCase())
        .replace(/\bmc\b/gi, 'MC')
        .replace(/\b\w/g, (match) => match.toUpperCase())
        .replace(/\bS\b/g, 's')
        .replace(/\bEX\b/g, 'ex')
        .replace(/\bGX\b/g, 'GX')
        .replace(/\bVMAX\b/g, 'VMAX')
        .replace(/\bVSTAR\b/g, 'VSTAR')
        .replace(/\s+/g, ' ')
        .trim();
    text = text.replace(/\b([A-Z][a-z]+)s\s+([A-Z][a-z]+)\b/g, "$1's $2");
    return text;
}

function cardmarketProductInfoFromUrl(url = '', title = '') {
    try {
        const parsed = new URL(url);
        if (!parsed.hostname.includes('cardmarket')) {
            return null;
        }
        const parts = parsed.pathname
            .split('/')
            .map((part) => decodeURIComponent(part))
            .filter(Boolean);
        const singlesIndex = parts.findIndex((part) => /^Singles$/i.test(part));
        const expansionSlug = singlesIndex >= 0 ? parts[singlesIndex + 1] || '' : '';
        const productSlug = singlesIndex >= 0 ? parts[singlesIndex + 2] || '' : '';
        if (!productSlug) {
            return null;
        }
        const productMatch = productSlug.match(/^(.+?)-([A-Z]{1,6})(\d{1,4}[a-z]?)$/i);
        if (!productMatch) {
            return null;
        }
        const [, rawName, rawPrefix, rawNumber] = productMatch;
        const name = titleCaseCardmarketSlug(rawName);
        const collectorNumber = `${rawPrefix.toUpperCase()} ${rawNumber}`;
        const expansion = normalizeExpansionAlias(titleCaseCardmarketSlug(expansionSlug));
        const derivedTitle = `${name} (${collectorNumber})`;
        const structuredCard = scrapeStructuredCardFields(derivedTitle, { expansion });
        if (!hasExactStructuredIdentity(structuredCard)) {
            return null;
        }
        return {
            title: derivedTitle,
            url,
            hostname: parsed.hostname,
            structuredCard,
            debug: {
                extractorVersion: 2,
                titleSource: 'cardmarket-url-product-slug',
                originalTitle: title || '',
            },
        };
    } catch (error) {
        return null;
    }
}

function scrapeStructuredCardFields(title = '', context = null) {
    const cleanTitle = String(title || '')
        .replace(/\s*\|\s*Vinted\s*$/i, '')
        .replace(/\s*\|\s*Cardmarket\s*$/i, '')
        .replace(/\bPokoin\.com(?:\s*\(\d+\))?\b/gi, ' ')
        .replace(/\bvastro\b/gi, 'vstar')
        .replace(/\bfull\s*-?\s*art\b|\bfullart\b/gi, 'illustration')
        .replace(/\bspecie\s+delta\b/gi, 'Delta Species')
        .replace(/\b(?:liv|lv|level)\.?\s*(\d{1,4}[a-z]?)\b/gi, 'Lv. $1')
        .replace(/\s+/g, ' ')
        .trim();
    const cardmarketMatch = cleanTitle.match(/^(.+?)\s*\((?:([A-Z0-9]{1,6})\s*)?(\d{1,4}[a-z]?)\)\s*(?:[-–]?\s*(.+?))?$/i);
    if (cardmarketMatch) {
        const [, cardName, cardPrefix, cardNumber, trailingExpansion] = cardmarketMatch;
        const detailsCollector = typeof parseCardmarketCollectorCode === 'function'
            ? parseCardmarketCollectorCode(context?.details?.number || '')
            : { collectorNumber: '', printedNumber: '' };
        const titleCollectorNumber = cardPrefix ? `${cardPrefix.toUpperCase()} ${cardNumber}` : cardNumber;
        const printedCollectorNumber = cardPrefix ? titleCollectorNumber : (detailsCollector.collectorNumber || titleCollectorNumber);
        const numericCollectorNumber = detailsCollector.printedNumber || cardNumber;
        const expansion = normalizeExpansionAlias(cleanCardmarketText(
            context?.expansion ||
            trailingExpansion ||
            ''
        ));
        const cleanName = removeMarketplaceSearchNoise(cardName);

        return {
            rawTitle: cleanTitle,
            name: cleanName,
            collectorNumber: printedCollectorNumber,
            collectorNumberPrefix: cardPrefix?.toUpperCase() || '',
            printedCollectorNumber,
            numericCollectorNumber,
            expansion,
            rarity: '',
            variation: '',
            searchName: cleanName,
        };
    }

    const withoutMarketplaceNoise = cleanTitle
        .replace(/\b(Carte|Carta|Card|Pok[eé]mon|Pokemon)\b/gi, ' ')
        .replace(/\b(Stamp|Stampa|Stamped)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const prefixedSlashCollectorNumber = cleanTitle.match(/\b([A-Z][A-Z0-9-]{0,7})\s?(\d{1,4}[a-z]?)\s*\/\s*(?:([A-Z][A-Z0-9-]{0,7})\s?)?(\d{1,4}[a-z]?)\b/i);
    const prefixedCollectorNumber = (cleanTitle.match(/\b([A-Z0-9][A-Z0-9-]{1,7})\s+(\d{1,4}[a-z]?)\b/g) || [])
        .map((value) => value.match(/\b([A-Z0-9][A-Z0-9-]{1,7})\s+(\d{1,4}[a-z]?)\b/))
        .find((match) => match && parseCardmarketCollectorCode(match[0]).collectorNumber) || null;
    const compactPrefixedCollectorNumber = cleanTitle.match(/\b(BW|XY|SM|SWSH|SVP|SV-P)(\d{1,4}[a-z]?)\b/i);
    const prefixedSlashCollector = prefixedSlashCollectorNumber
        ? `${prefixedSlashCollectorNumber[1].toUpperCase()}${prefixedSlashCollectorNumber[2]}/${(prefixedSlashCollectorNumber[3] || prefixedSlashCollectorNumber[1]).toUpperCase()}${prefixedSlashCollectorNumber[4]}`
        : '';
    const prefixedCollectorValue = prefixedSlashCollector ||
        (prefixedCollectorNumber ? `${prefixedCollectorNumber[1].toUpperCase()} ${prefixedCollectorNumber[2]}` : '') ||
        (compactPrefixedCollectorNumber ? `${compactPrefixedCollectorNumber[1].toUpperCase()}${compactPrefixedCollectorNumber[2]}` : '');
    const numericCollectorNumber = prefixedSlashCollectorNumber?.[2] ||
        prefixedCollectorNumber?.[2] ||
        compactPrefixedCollectorNumber?.[2] ||
        cleanTitle.match(/\b(\d{1,4}[a-z]?)\s*\/\s*\d{1,4}[a-z]?\b/)?.[1] ||
        '';
    const collectorNumber = (
        prefixedCollectorValue ||
        cleanTitle.match(/\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/)?.[0] ||
        ''
    ).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();

    const variationMatch = cleanTitle.match(/\b(?:ex|gx|vmax|vstar|v|lv\.?\s*x|mega|radiant|shining|prime|break|delta(?:\s+species)?|species\s+delta|specie\s+delta)\b/i);
    const variation = variationMatch
        ? variationMatch[0].replace(/\s+/g, '').replace(/\./g, '').toLowerCase()
        : '';
    const levelNumber = cleanTitle.match(/\b(?:liv|lv|level)\.?\s*(\d{1,4}[a-z]?)\b/i)?.[1] || '';

    const rarityMatch = cleanTitle.match(/\b(?:special illustration rare|illustration rare|illustration|secret rare|ultra rare|holo rare|holo|promo|rare)\b/i);
    const rarity = rarityMatch ? rarityMatch[0].replace(/\s+/g, ' ') : '';

    const hasEditionHint = /\b(?:1st|first|prima|primo|1)\s+(?:edition|edizione)\b/i.test(cleanTitle);
    const expansionAliases = [
        { pattern: /\b(?:set\s+base|base\s+set)\b/i, name: 'Base Set' },
        { pattern: /\bevoluzioni\b/i, name: 'Evolutions' },
        { pattern: /\b(?:ex\s+)?(?:sandstorm|tempesta\s+di\s+sabbia)\b/i, name: 'EX Sandstorm' },
        { pattern: /\btesori\s+misteriosi\b|\bmysterious\s+treasures\b/i, name: 'Mysterious Treasures' },
    ];
    const aliasedExpansion = expansionAliases.find(({ pattern }) => pattern.test(cleanTitle))?.name || '';
    const expansionNoise = [
        'Legendary Treasure',
        'Legendary Treasures',
        'Dragon Selection',
        'Black Star Promos',
        'BW Black Star Promos',
        'Paldean Fates',
        'Pokemon 151',
        'Generations Radiant Collection',
        'Radiant Collection',
        'Generations',
        'EX Sandstorm',
        'Mysterious Treasures',
        'Steam Siege',
        'Fates Collide',
        'Evolutions',
    ];
    const expansion = normalizeExpansionAlias(aliasedExpansion || expansionNoise.find((candidate) =>
        new RegExp(`\\b${candidate.replace(/\s+/g, '\\s+')}\\b`, 'i').test(cleanTitle)
    ) || '');

    let name = withoutMarketplaceNoise;
    if (collectorNumber) {
        name = name.replace(new RegExp(`\\b${collectorNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), ' ');
    }
    if (expansion) {
        name = name.replace(new RegExp(`\\b${expansion.replace(/\s+/g, '\\s+')}\\b`, 'i'), ' ');
    }
    name = name
        .replace(/\b(?:set\s+base|base\s+set)\b/gi, ' ')
        .replace(/\bevoluzioni\b/gi, ' ')
        .replace(/\b(?:Mysterious\s+Treasures|Tesori\s+Misteriosi)\b/gi, ' ')
        .replace(/\b(?:Dragon\s+Selection|Generations\s+Radiant\s+Collection|Radiant\s+Collection|Generations)\b/gi, ' ')
        .replace(/\b(?:Legendary|Treasure|Treasures|Promo|Promos)\b/gi, ' ')
        .replace(/\b(?:special illustration rare|illustration rare|illustration|secret rare|ultra rare|holo rare|holo|promo|rare)\b/gi, ' ')
        .replace(/\b(?:ex|gx|vmax|vstar|v|lv\.?\s*x|mega|radiant|shining|prime|break|delta(?:\s+species)?|species\s+delta|specie\s+delta)\b/gi, ' ')
        .replace(/\s+\d{1,4}[a-z]?\s*$/i, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return {
        rawTitle: cleanTitle,
        name: removeMarketplaceSearchNoise(name),
        collectorNumber,
        collectorNumberPrefix: (prefixedSlashCollectorNumber?.[1] || prefixedCollectorNumber?.[1] || compactPrefixedCollectorNumber?.[1] || '').toUpperCase(),
        printedCollectorNumber: prefixedCollectorValue || collectorNumber,
        numericCollectorNumber,
        expansion,
        levelNumber,
        editionHint: hasEditionHint,
        rarity,
        variation,
        searchName: removeMarketplaceSearchNoise([name, variation].filter(Boolean).join(' ')),
    };
}

function removeMarketplaceSearchNoise(value = '') {
    return String(value || '')
        .replace(/\bvastro\b/gi, 'vstar')
        .replace(/\bspecie\s+delta\b/gi, 'Delta Species')
        .replace(/\b(?:liv|lv|level)\.?\s*(\d{1,4}[a-z]?)\b/gi, 'Lv. $1')
        .replace(/\b(?:1st|first|prima|primo|1)\s+(?:edition|edizione)\b/gi, ' ')
        .replace(/\b(?:set\s+base|base\s+set)\b/gi, ' ')
        .replace(/\btesori\s+misteriosi\b/gi, 'Mysterious Treasures')
        .replace(/\b(?:pok[eé]mon|pokemon|pkkmn|pkn|pokn)\b/gi, ' ')
        .replace(/\b(?:carta|carte|card|cards|tcg)\b/gi, ' ')
        .replace(/\b(?:sealed|seal(?:ed)?|salead|saled|sigillat[aoe]?|pack|booster|lot)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeRequestClues(clues = []) {
    const stopWords = new Set(['carta', 'carte', 'card', 'cards', 'pokemon', 'pokémon']);
    const seen = new Set();
    return (Array.isArray(clues) ? clues : [])
        .map((clue) => removeMarketplaceSearchNoise(clue)
            .replace(/\bevoluzioni\b/gi, 'Evolutions')
            .replace(/\btesori\s+misteriosi\b/gi, 'Mysterious Treasures')
            .replace(/\bspecie\s+delta\b/gi, 'Delta Species')
            .replace(/\b(?:liv|lv|level)\.?\s*(\d{1,4}[a-z]?)\b/gi, 'Lv. $1')
            .replace(/[^a-z0-9/'\s-]+/gi, (match) => match.includes('/') ? '/' : ' ')
            .replace(/\s+/g, ' ')
            .trim())
        .filter((clue) => {
            const compact = compactSearchValue(clue);
            if (!clue || compact.length < 2 || stopWords.has(clue.toLowerCase()) || stopWords.has(compact) || seen.has(compact)) {
                return false;
            }
            seen.add(compact);
            return true;
        })
        .slice(0, 10);
}

function normalizeVintedPayload(payload = null) {
    if (!payload || typeof payload !== 'object' || payload.source !== 'vinted') {
        return null;
    }
    return normalizeMarketplacePayload(payload);
}

function normalizeEbayPayload(payload = null) {
    if (!payload || typeof payload !== 'object' || payload.source !== 'ebay') {
        return null;
    }
    return normalizeMarketplacePayload(payload);
}

function normalizeMarketplacePayload(payload = null) {
    if (!payload || typeof payload !== 'object' || !['vinted', 'ebay'].includes(payload.source)) {
        return null;
    }
    const selectedClues = normalizeRequestClues(payload.selectedClues);
    const primaryClues = normalizeRequestClues(payload.primaryClues);
    const features = normalizeRequestClues(payload.features);
    const collectorNumber = removeMarketplaceSearchNoise(payload.collectorNumber || '')
        .replace(/\s*\/\s*/g, '/')
        .replace(/\s+/g, ' ')
        .trim();
    const numericCollectorNumber = removeMarketplaceSearchNoise(payload.numericCollectorNumber || '')
        .replace(/\s+/g, '')
        .trim();
    const levelNumber = removeMarketplaceSearchNoise(payload.levelNumber || '')
        .match(/\b(?:lv|level)\.?\s*(\d{1,4}[a-z]?)\b/i)?.[1] ||
        removeMarketplaceSearchNoise(payload.levelNumber || '').match(/\b(\d{1,4}[a-z]?)\b/i)?.[1] ||
        '';
    const selectedSearchTitle = buildPrimaryClueSearchTitle('', selectedClues, primaryClues) ||
        removeMarketplaceSearchNoise(payload.searchTitle || '');
    const structuredVariation = structuredVariationFromPayload(payload, primaryClues);
    const variationTokens = normalizedVariationTokens(structuredVariation);
    const rarity = removeMarketplaceSearchNoise(payload.rarity || (features.includes('illustration') ? 'illustration' : ''));
    const rarityAliases = rarityAliasesForRarity(rarity, features);
    const primaryName = removeMarketplaceSearchNoise(payload.name || primaryClues.find((clue) => {
        const compact = compactSearchValue(clue);
        return compact && !variationTokens.includes(normalizeVariationValue(clue)) && !isStandaloneNameResolverNoise(clue);
    }) || primaryClues[0] || '');
    const structuredCard = {
        rawTitle: payload.source === 'vinted'
            ? selectedSearchTitle
            : (payload.searchTitle || payload.originalTitle || ''),
        name: primaryName,
        collectorNumber,
        collectorNumberPrefix: collectorNumber.match(/^([A-Z]{1,6})\b/i)?.[1]?.toUpperCase() || '',
        printedCollectorNumber: collectorNumber,
        numericCollectorNumber,
        expansion: normalizeExpansionAlias(removeMarketplaceSearchNoise(payload.expansion || '')),
        rarity,
        rarityAliases,
        variation: removeMarketplaceSearchNoise(payload.variation || ''),
        variationTokens,
        levelNumber,
        selectedClues,
        primaryClues,
        strictVariation: payload.source === 'vinted' && !payload.variation,
        searchName: searchNameWithVariation(primaryName, payload.variation || ''),
    };
    return {
        ...payload,
        source: payload.source,
        selectedClues,
        primaryClues,
        features,
        collectorNumber,
        numericCollectorNumber,
        levelNumber,
        structuredCard,
    };
}

function recentSearchCacheGet(cache, key = '') {
    if (!key || !cache?.has(key)) {
        return null;
    }
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
}

function recentSearchCacheSet(cache, key = '', value = null, limit = RECENT_SEARCH_CACHE_LIMIT) {
    if (!key || !cache) {
        return value;
    }
    if (cache.has(key)) {
        cache.delete(key);
    }
    cache.set(key, value);
    while (cache.size > limit) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
    }
    return value;
}

function recentSearchStableParts(values = []) {
    return values
        .map((value) => compactSearchValue(value))
        .filter(Boolean)
        .sort()
        .join(',');
}

function recentMarketplaceSearchIdentity({
    source = '',
    url = '',
    listingKey = '',
    title = '',
    originalTitle = '',
    clues = [],
    primaryClues = [],
    payload = null,
    previewSignature = '',
    selectionRevision = '',
} = {}) {
    const marketplacePayload = normalizeMarketplacePayload(payload);
    const identitySource = marketplacePayload?.source || source || 'marketplace';
    const identityUrl = stableSearchUrl(marketplacePayload?.listingKey || listingKey || url);
    const selectedClues = marketplacePayload?.selectedClues || normalizeRequestClues(clues);
    const selectedPrimaryClues = marketplacePayload?.primaryClues || normalizeRequestClues(primaryClues);
    const structuredCard = marketplacePayload?.structuredCard || {};
    return [
        identitySource,
        identityUrl,
        compactSearchValue(marketplacePayload?.searchTitle || title),
        compactSearchValue(marketplacePayload?.originalTitle || originalTitle),
        recentSearchStableParts(selectedClues),
        recentSearchStableParts(selectedPrimaryClues),
        compactSearchValue(structuredCard.name || marketplacePayload?.name || ''),
        compactSearchValue(structuredCard.variation || marketplacePayload?.variation || ''),
        compactSearchValue(structuredCard.collectorNumber || marketplacePayload?.collectorNumber || ''),
        compactSearchValue(structuredCard.numericCollectorNumber || marketplacePayload?.numericCollectorNumber || ''),
        compactSearchValue(structuredCard.expansion || marketplacePayload?.expansion || ''),
        compactSearchValue(structuredCard.levelNumber || marketplacePayload?.levelNumber || ''),
        compactSearchValue(previewSignature || ''),
        selectionRevision === '' || selectionRevision === null || selectionRevision === undefined
            ? ''
            : String(selectionRevision),
    ].join('|');
}

function buildTitleWithRequestClues(title = '', clues = []) {
    const normalizedClues = normalizeRequestClues(clues);
    const seen = new Set();
    const selectedParts = [];
    return [removeMarketplaceSearchNoise(title), ...normalizedClues]
        .map((part) => removeMarketplaceSearchNoise(part).replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .filter((part) => {
            const compact = compactSearchValue(part);
            const isContainedInExistingPart = selectedParts.some((existingPart) =>
                new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i').test(existingPart)
            );
            if (seen.has(compact) || isContainedInExistingPart) {
                return false;
            }
            seen.add(compact);
            selectedParts.push(part);
            return true;
        })
        .join(' ');
}

function rarityAliasesForRarity(rarity = '', features = []) {
    const values = [
        rarity,
        ...(Array.isArray(features) ? features : []),
    ].map((value) => String(value || '').toLowerCase());
    const wantsIllustration = values.some((value) =>
        /\billustration\b|\bfull\s*-?\s*art\b|\bfullart\b|\bsir\b|\bir\b/.test(value)
    );
    if (!wantsIllustration) {
        return [];
    }
    return ['Illustration Rare', 'Special Illustration Rare', 'full art', 'illustration'];
}

function buildPrimaryClueSearchTitle(title = '', clues = [], primaryClues = []) {
    const normalizedPrimaryClues = normalizeRequestClues(primaryClues);
    if (normalizedPrimaryClues.length > 0) {
        const normalizedClues = normalizeRequestClues(clues);
        const variationClues = normalizedClues.filter((clue) =>
            /\b(?:vmax|vstar|ex|gx|lv\.?\s*x|mega|radiant|shining|prime|break)\b/i.test(clue)
        );
        const expansionClues = normalizedClues.filter((clue) =>
            /\b(?:base\s+set|set\s+base|evolutions|evoluzioni|black\s+star\s+promos?|pokemon\s+151|evolving\s+skies|fusion\s+strike|paldean\s+fates|scarlet\s+violet|obsidian\s+flames|crown\s+zenith|chilling\s+reign|silver\s+tempest|brilliant\s+stars|astral\s+radiance)\b/i.test(clue)
        );
        const collectorClues = normalizedClues.filter((clue) =>
            /\b(?:BW|XY|SM|SWSH|SVP|SV-P|PROMO)\s?\d{1,4}[a-z]?\b/i.test(clue) ||
            /\b(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\s*\/\s*(?:(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?)?\d{1,4}[a-z]?\b/i.test(clue) ||
            /\b[A-Z]{1,8}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z]{1,8}\s?)?\d{1,4}[a-z]?\b/i.test(clue) ||
            /\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i.test(clue)
        );
        const rarityClues = normalizedClues.filter((clue) =>
            /\billustration\b/i.test(clue)
        );
        return buildTitleWithRequestClues('', [...normalizedPrimaryClues, ...expansionClues, ...collectorClues, ...rarityClues, ...variationClues]);
    }
    return buildTitleWithRequestClues(title, clues);
}

function isCardmarketUrl(url = '') {
    try {
        return new URL(url).hostname.includes('cardmarket');
    } catch (error) {
        return false;
    }
}

function compactSearchValue(value = '') {
    return removeMarketplaceSearchNoise(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function compactSetValue(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function resolvedCardNameFromRow(row, term = '') {
    const compactTerm = compactSearchValue(term);
    if (compactTerm === 'nidoran') {
        return 'Nidoran';
    }

    const canonical = row?.canonical_name || row?.canonicalName || '';
    const display = row?.name || row?.name_en || row?.pokemon_name || '';
    return compactSearchValue(display) === compactTerm ? display : (canonical || display);
}

function normalizeNameResolverTerm(value = '') {
    return removeMarketplaceSearchNoise(String(value || '')
        .replace(/\s*\|\s*(?:Vinted|Cardmarket)\s*$/i, '')
        .replace(/[’`]/g, "'")
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[".,:;!?\\[\]{}|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim());
}

function isCollectorLikeResolverTerm(term = '') {
    const clean = String(term || '').replace(/\s+/g, ' ').trim();
    return /^(?:[A-Z]{1,8}\s*)?\d{1,4}[a-z]?(?:\s*\/\s*(?:[A-Z]{1,8}\s*)?\d{1,4}[a-z]?)?$/i.test(clean) ||
        /^(?:PROMO|BW|XY|SM|SWSH|SVP|SV-P|TG|GG|RC|SL|SH|DRS|HL|CP5|POR|TR)\s*\d{1,4}[a-z]?$/i.test(clean);
}

function isStandaloneNameResolverNoise(term = '') {
    const clean = normalizeNameResolverTerm(term);
    const compact = compactSearchValue(clean);
    const standaloneNoise = new Set([
        'holo', 'reverseholo', 'foil', 'rare', 'rarity', 'illustration', 'illustrationrare',
        'specialillustrationrare', 'fullart', 'sir', 'ir', 'delta', 'deltaspecies',
        'speciesdelta', 'speciedelta', 'promo', 'promos', 'blackstarpromo',
        'blackstarpromos', 'shadowless', 'firstedition', 'edition', 'edizione',
        'set', 'baseset', 'evolutions', 'evoluzioni', 'mysterioustreasures',
        'tesorimisteriosi', 'dragonselection', 'radiantcollection', 'generations',
        'teamrocket', 'lostorigin', 'evolvingskies', 'fusionstrike', 'paldeanfates',
        'scarletviolet', 'obsidianflames', 'crownzenith', 'chillingreign',
        'silvertempest', 'brilliantstars', 'astralradiance', 'near', 'mint',
        'nearmint', 'condition', 'condizioni', 'ottime', 'psa', 'graded',
        'vintage', 'versione', 'volo', 'ex', 'gx', 'v', 'vmax', 'vstar',
        'mega', 'x', 'y', 'radiant', 'shining', 'prime', 'break',
    ]);
    return !compact ||
        standaloneNoise.has(compact) ||
        isCollectorLikeResolverTerm(clean) ||
        /^(?:lv|liv|level)\.?\d{1,4}[a-z]?$/i.test(compact) ||
        /^\d{1,4}[a-z]?$/.test(compact);
}

function meaningfulNameResolverText(term = '') {
    return normalizeNameResolverTerm(term)
        .replace(/\b(?:reverse\s+holo|holo|foil|delta(?:\s+species)?|species\s+delta|specie\s+delta|illustration(?:\s+rare)?|special\s+illustration\s+rare|full\s*-?\s*art|sir|ir|rare|rarity|promo|promos|shadowless|first\s+edition|prima\s+edizione|edition|edizione|near\s+mint|condition|condizioni|ottime|psa|graded|vintage|versione|volo)\b/gi, ' ')
        .replace(/\b(?:liv|lv|level)\.?\s*\d{1,4}[a-z]?\b/gi, ' ')
        .replace(/\b(?:vmax|vstar|ex|gx|v|mega|radiant|shining|prime|break)\b/gi, ' ')
        .replace(/\b[XY]\b/g, ' ')
        .replace(/\b(?:[A-Z]{1,8}\s*)?\d{1,4}[a-z]?(?:\s*\/\s*(?:[A-Z]{1,8}\s*)?\d{1,4}[a-z]?)?\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isLikelyCardNameResolverTerm(term = '') {
    const clean = normalizeNameResolverTerm(term);
    if (!clean || isStandaloneNameResolverNoise(clean)) {
        return false;
    }
    const meaningful = meaningfulNameResolverText(clean);
    return /[a-z]/i.test(meaningful) && compactSearchValue(meaningful).length >= 3;
}

function candidateNameTermsFromTitle(title = '', structuredCard = null, options = {}) {
    const terms = [];
    const requestedNameCompact = compactSearchValue(structuredCard?.name || '');
    if (structuredCard?.name) {
        terms.push(structuredCard.name);
    }
    if (structuredCard?.searchName && structuredCard.searchName !== structuredCard.name) {
        terms.push(structuredCard.searchName);
    }

    const primaryClues = normalizeRequestClues(options.primaryClues || []);
    const selectedClues = normalizeRequestClues(options.clues || options.selectedClues || []);
    const selectedPhraseClues = [...primaryClues, ...selectedClues].filter((clue) => {
        const compact = compactSearchValue(clue);
        return requestedNameCompact &&
            compact !== requestedNameCompact &&
            compact.includes(requestedNameCompact) &&
            normalizeNameResolverTerm(clue).split(/\s+/).filter(Boolean).length >= 2 &&
            isLikelyCardNameResolverTerm(clue);
    });
    terms.unshift(...selectedPhraseClues);
    terms.push(...primaryClues, ...selectedClues);

    const cleaned = normalizeNameResolverTerm(title);
    const stopWords = new Set([
        'carte', 'carta', 'card', 'cards', 'promo', 'promos', 'rare', 'holo',
        'stamp', 'stampa', 'stamped', 'black', 'star', 'treasure', 'treasures',
        'legendary', 'ottime', 'condizioni', 'condition', 'near', 'mint',
        'first', 'prima', 'primo', 'edition', 'edizione', 'set', 'base',
        'delta', 'species', 'illustration', 'liv', 'lv', 'level', 'volo',
        'versione', 'vintage', 'psa', 'graded',
    ]);
    const words = cleaned
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word && !stopWords.has(word.toLowerCase()) && !isStandaloneNameResolverNoise(word));

    if (cleaned) {
        const cleanedWithoutTrailingNumber = cleaned
            .replace(/\b(?:[A-Z]{1,8}\s*)?\d{1,4}[a-z]?(?:\s*\/\s*(?:[A-Z]{1,8}\s*)?\d{1,4}[a-z]?)?\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (cleanedWithoutTrailingNumber) {
            terms.push(cleanedWithoutTrailingNumber);
        }
        terms.push(cleaned);
    }

    for (let size = Math.min(4, words.length); size >= 1; size -= 1) {
        for (let index = 0; index <= words.length - size; index += 1) {
            terms.push(words.slice(index, index + size).join(' '));
        }
    }

    const seen = new Set();
    return terms
        .map(normalizeNameResolverTerm)
        .filter(isLikelyCardNameResolverTerm)
        .filter((term) => {
            const compact = compactSearchValue(term);
            if (seen.has(compact)) {
                return false;
            }
            seen.add(compact);
            return true;
        })
        .slice(0, 12);
}

function titleForNameResolution(title = '', originalTitle = '', clues = []) {
    return buildTitleWithRequestClues(
        '',
        [title, ...(Array.isArray(clues) ? clues : []), originalTitle].filter(Boolean)
    );
}

function shouldUseResolvedCardName(resolvedName = '', structuredCard = null) {
    const requestedName = compactSearchValue(structuredCard?.name || '');
    if (!resolvedName) {
        return false;
    }
    if (requestedName && /[&'’]/.test(structuredCard?.name || '') && compactSearchValue(resolvedName).length < requestedName.length) {
        return false;
    }
    if (!selectedCluesContainResolvedNamePhrase(resolvedName, structuredCard) && !rowMatchesStructuredVariation({ name: resolvedName }, structuredCard)) {
        return false;
    }
    if (!requestedName) {
        return true;
    }

    const resolvedCompact = compactSearchValue(resolvedName);
    if (requestedName && requestedName.length > resolvedCompact.length && requestedName.includes(resolvedCompact)) {
        return false;
    }
    const searchCompact = compactSearchValue(structuredCard?.searchName || '');
    const requestedWithoutNumbers = compactSearchValue(String(structuredCard?.name || '').replace(/\b\d{1,4}[a-z]?\b/gi, ' '));
    const searchWithoutNumbers = compactSearchValue(String(structuredCard?.searchName || '').replace(/\b\d{1,4}[a-z]?\b/gi, ' '));
    return resolvedCompact === requestedName ||
        resolvedCompact.includes(requestedName) ||
        (searchCompact && resolvedCompact === searchCompact) ||
        (requestedWithoutNumbers && resolvedCompact.includes(requestedWithoutNumbers)) ||
        (searchWithoutNumbers && resolvedCompact === searchWithoutNumbers) ||
        compactEditDistanceWithin(resolvedCompact, requestedName, requestedName.length > 7 ? 2 : 1);
}

function selectedCluesContainResolvedName(resolvedName = '', structuredCard = {}) {
    const resolvedCompact = compactSearchValue(resolvedName);
    if (!resolvedCompact) {
        return false;
    }
    return [
        ...(Array.isArray(structuredCard?.primaryClues) ? structuredCard.primaryClues : []),
        ...(Array.isArray(structuredCard?.selectedClues) ? structuredCard.selectedClues : []),
    ].some((clue) => compactSearchValue(clue || '') === resolvedCompact);
}

function selectedCluesContainResolvedNamePhrase(resolvedName = '', structuredCard = {}) {
    const resolvedCompact = compactSearchValue(resolvedName);
    if (!resolvedCompact) {
        return false;
    }
    return [
        ...(Array.isArray(structuredCard?.primaryClues) ? structuredCard.primaryClues : []),
        ...(Array.isArray(structuredCard?.selectedClues) ? structuredCard.selectedClues : []),
    ].some((clue) => {
        const compactClue = compactSearchValue(clue || '');
        return compactClue &&
            compactClue.length >= resolvedCompact.length &&
            (compactClue === resolvedCompact || compactClue.includes(resolvedCompact));
    });
}

function compactEditDistanceWithin(left = '', right = '', maxDistance = 1) {
    if (!left || !right || Math.abs(left.length - right.length) > maxDistance) {
        return false;
    }
    const previous = Array(right.length + 1).fill(0).map((_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        let diagonal = previous[0];
        previous[0] = leftIndex;
        let rowMin = previous[0];
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            const above = previous[rightIndex];
            const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
            previous[rightIndex] = Math.min(
                previous[rightIndex] + 1,
                previous[rightIndex - 1] + 1,
                diagonal + cost
            );
            diagonal = above;
            rowMin = Math.min(rowMin, previous[rightIndex]);
        }
        if (rowMin > maxDistance) {
            return false;
        }
    }
    return previous[right.length] <= maxDistance;
}

function searchNameWithVariation(name = '', variation = '') {
    const cleanName = String(name || '').replace(/\s+\d{1,4}[a-z]?\s*$/i, '').trim();
    const compactName = compactSearchValue(cleanName);
    const compactVariation = compactSearchValue(variation);
    if (!compactVariation || compactName.endsWith(compactVariation)) {
        return cleanName;
    }
    const variationTokens = normalizedVariationTokens(variation);
    if (variationTokens.includes('mega')) {
        const suffixTokens = variationTokens.filter((token) => token !== 'mega');
        return ['Mega', cleanName, ...suffixTokens].filter(Boolean).join(' ');
    }
    return [cleanName, variation].filter(Boolean).join(' ');
}

function possibleCompositeTitleTerms(title = '') {
    const cleanTitle = removeMarketplaceSearchNoise(String(title || '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[’`]/g, "'")
        .replace(/\s+/g, ' ')
        .trim());
    const possessive = cleanTitle.match(/\b([A-Za-z][A-Za-z]+['’]s\s+[A-Za-z][A-Za-z]+(?:\s+(?:ex|gx|vmax|vstar|v|mega))?)\b/i)?.[1] || '';
    const connector = cleanTitle.match(/\b([A-Za-z][A-Za-z]+)\s+(?:&|and|e|\+|\/)\s+([A-Za-z][A-Za-z]+)(?:\s+(ex|gx|vmax|vstar|v|mega))?\b/i);
    const teamRocketOwner = cleanTitle.match(/\b([A-Za-z][A-Za-z']*)\s+(?:del|della|di|de|of)\s+Team\s+Rocket\b/i)?.[1] ||
        cleanTitle.match(/\bTeam\s+Rocket(?:'s)?\s+([A-Za-z][A-Za-z']*)\b/i)?.[1] ||
        '';
    return [
        possessive,
        teamRocketOwner ? `Team Rocket's ${teamRocketOwner}` : '',
        teamRocketOwner ? `Team Rocket ${teamRocketOwner}` : '',
        connector ? [connector[1], '&', connector[2], connector[3] || ''].filter(Boolean).join(' ') : '',
        connector ? [connector[1], connector[2], connector[3] || ''].filter(Boolean).join(' ') : '',
    ].filter(Boolean);
}

function cardvaultNameResolverPoolLimit(searchTerm = '') {
    const wordCount = normalizeNameResolverTerm(searchTerm).split(/\s+/).filter(Boolean).length;
    if (wordCount <= 1) {
        return 1000;
    }
    if (wordCount === 2) {
        return 5000;
    }
    if (wordCount === 3) {
        return 2500;
    }
    if (wordCount === 4) {
        return 1250;
    }
    return 500;
}

function cardvaultNameResolverSessionId() {
    return `extension-name-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function searchbarTokenPredictPayload(searchTerm = '', options = {}) {
    return {
        query: normalizeNameResolverTerm(searchTerm),
        search_language: options.searchLanguage || 'en',
        limit: options.limit || 5,
    };
}

function tokenPredictionExtendsFragment(prediction = {}, fragment = '') {
    const display = String(prediction.display_token || prediction.displayToken || '').trim();
    const normalizedToken = String(prediction.normalized_token || prediction.normalizedToken || display).trim();
    const compactFragment = compactSearchValue(fragment);
    const compactDisplay = compactSearchValue(display);
    const compactNormalized = compactSearchValue(normalizedToken);
    return Boolean(
        display &&
        compactFragment &&
        (compactDisplay.startsWith(compactFragment) || compactNormalized.startsWith(compactFragment))
    );
}

function acceptedSearchbarTokenPrediction(payload = {}, fragment = '') {
    const predictions = Array.isArray(payload?.predictions) ? payload.predictions : [];
    return predictions.find((prediction) => {
        const confidence = Number(prediction.confidence ?? 0);
        return Number.isFinite(confidence) &&
            confidence >= SEARCHBAR_TOKEN_PREDICT_MIN_CONFIDENCE &&
            tokenPredictionExtendsFragment(prediction, fragment);
    }) || null;
}

async function predictCardNameToken(searchTerm = '', options = {}) {
    const payload = searchbarTokenPredictPayload(searchTerm, options);
    if (!payload.query || !isLikelyCardNameResolverTerm(payload.query)) {
        return { name: '', payload: null, skipped: true };
    }
    const cacheKey = cardvaultNameResolutionCacheKey(payload.query, {
        ...options,
        source: `${options.source || 'marketplace'}:token-predict`,
    });
    const cached = recentSearchCacheGet(cardvaultTokenPredictionCache, cacheKey);
    if (cached) {
        return cached;
    }

    const requestPromise = cardvaultFetch(`${CARDVAULT_API_BASE_URL}/api/searchbar-token-predict`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    })
        .then(async (response) => {
            if (!response.ok) {
                return { name: '', payload, error: `HTTP ${response.status}` };
            }

            const data = await response.json();
            const accepted = acceptedSearchbarTokenPrediction(data, payload.query);
            return {
                name: accepted?.display_token || accepted?.displayToken || '',
                payload,
                prediction: accepted || null,
                meta: data?.meta || null,
                predictionCount: Array.isArray(data?.predictions) ? data.predictions.length : 0,
            };
        })
        .catch((error) => ({
            name: '',
            payload,
            error: error.message || 'Searchbar token prediction failed.',
        }));

    recentSearchCacheSet(cardvaultTokenPredictionCache, cacheKey, requestPromise, CARDVAULT_TOKEN_PREDICTION_CACHE_LIMIT);
    const result = await requestPromise;
    recentSearchCacheSet(cardvaultTokenPredictionCache, cacheKey, result, CARDVAULT_TOKEN_PREDICTION_CACHE_LIMIT);
    return result;
}

function cardvaultNameResolutionCacheKey(searchTerm = '', options = {}) {
    return [
        options.source || 'marketplace',
        options.searchLanguage || 'en',
        compactSearchValue(searchTerm),
        options.selectedClueSignature || '',
    ].join('|');
}

async function fetchCardvaultNameResolverRows(searchTerm = '', options = {}) {
    const normalizedTerm = normalizeNameResolverTerm(searchTerm);
    if (!isLikelyCardNameResolverTerm(normalizedTerm)) {
        return { rows: [], payload: null, cached: false, skipped: true };
    }
    const cacheKey = cardvaultNameResolutionCacheKey(normalizedTerm, options);
    const cached = recentSearchCacheGet(cardvaultNameResolutionCache, cacheKey);
    if (cached) {
        return cached;
    }

    const requestPromise = cardvaultFetch(`${CARDVAULT_API_BASE_URL}/api/marketplace-autocomplete`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            search_term: normalizedTerm,
            result_limit: options.resultLimit || 20,
            pool_limit: options.poolLimit || cardvaultNameResolverPoolLimit(normalizedTerm),
            search_language: options.searchLanguage || 'en',
            search_session_id: options.searchSessionId || cardvaultNameResolverSessionId(),
        }),
    })
        .then(async (response) => {
            if (!response.ok) {
                return { rows: [], payload: null, cached: false, error: `HTTP ${response.status}` };
            }
            const payload = await response.json();
            return {
                rows: normalizeCardvaultRows(payload),
                payload,
                cached: false,
                searchContext: payload?.search_context || null,
            };
        })
        .catch((error) => ({
            rows: [],
            payload: null,
            cached: false,
            error: error.message || 'Cardvault name resolver failed.',
        }));

    recentSearchCacheSet(cardvaultNameResolutionCache, cacheKey, requestPromise, CARDVAULT_NAME_RESOLUTION_CACHE_LIMIT);
    const result = await requestPromise;
    recentSearchCacheSet(cardvaultNameResolutionCache, cacheKey, { ...result, cached: false }, CARDVAULT_NAME_RESOLUTION_CACHE_LIMIT);
    return result;
}

function rowMatchesCompositeResolverTerm(row = {}, term = '') {
    const tokens = compositeNameTokens(term);
    if (tokens.length < 2) {
        return true;
    }
    return rowHasAllNameTokens(row, tokens);
}

function rowNameContainsSelectedSuffix(row = {}, structuredCard = null) {
    const selectedTexts = [
        structuredCard?.name,
        structuredCard?.searchName,
        ...(Array.isArray(structuredCard?.primaryClues) ? structuredCard.primaryClues : []),
        ...(Array.isArray(structuredCard?.selectedClues) ? structuredCard.selectedClues : []),
    ];
    const rowName = resolvedCardNameFromRow(row, '') || row?.canonical_name || row?.canonicalName || row?.name || '';
    const compactRowName = compactSearchValue(rowName);
    if (!compactRowName) {
        return false;
    }
    return selectedTexts.some((text) => {
        const compactText = compactSearchValue(text || '');
        return compactText &&
            compactText.length >= 4 &&
            compactText !== compactRowName &&
            compactRowName.includes(compactText);
    });
}

function acceptedNameResolverRow(rows = [], term = '', structuredCard = null) {
    const compactTerm = compactSearchValue(term);
    const requestedName = compactSearchValue(structuredCard?.name || '');
    const fullPhraseRow = rows.find((row) => {
        const resolvedName = resolvedCardNameFromRow(row, term);
        const resolvedCompact = compactSearchValue(resolvedName);
        return resolvedName &&
            rowNameContainsSelectedSuffix(row, structuredCard) &&
            (!requestedName || resolvedCompact.includes(requestedName)) &&
            rowMatchesCompositeResolverTerm(row, resolvedName);
    });
    if (fullPhraseRow) {
        return fullPhraseRow;
    }

    const exactRow = rows.find((row) => {
        const canonical = compactSearchValue(row.canonical_name || row.canonicalName || '');
        const display = compactSearchValue(row.name || row.name_en || row.pokemon_name || '');
        return canonical === compactTerm || display === compactTerm;
    });
    if (exactRow && rowMatchesCompositeResolverTerm(exactRow, term)) {
        return exactRow;
    }

    return rows.find((row) => {
        const resolvedName = resolvedCardNameFromRow(row, term);
        if (!resolvedName || !rowMatchesCompositeResolverTerm(row, term)) {
            return false;
        }
        if (structuredCard && !rowMatchesStructuredVariation({ ...row, name: resolvedName }, {
            ...structuredCard,
            name: resolvedName,
            searchName: searchNameWithVariation(resolvedName, structuredCard.variation || ''),
        })) {
            return false;
        }
        return true;
    }) || null;
}

async function resolveNameFromCardvaultTitle(title = '', structuredCard = null, options = {}) {
    const attemptedTerms = [];
    const source = options.source || 'marketplace';
    const resolverOptions = {
        ...options,
        source,
        searchLanguage: options.searchLanguage || 'en',
    };

    for (const term of [...new Set([
        ...possibleCompositeTitleTerms(title),
        ...candidateNameTermsFromTitle(title, structuredCard, options),
    ])].filter(isLikelyCardNameResolverTerm)) {
        try {
            const prediction = await predictCardNameToken(term, resolverOptions);
            if (prediction.name && shouldUseResolvedCardName(prediction.name, structuredCard || {})) {
                const predictedStructuredCard = structuredCard
                    ? {
                        ...structuredCard,
                        name: prediction.name,
                        searchName: searchNameWithVariation(prediction.name, structuredCard.variation || ''),
                    }
                    : null;
                attemptedTerms.push({
                    term,
                    rowCount: 0,
                    acceptedName: prediction.name,
                    cached: false,
                    source: 'searchbar-token-predict',
                    predictionCount: prediction.predictionCount || 0,
                    confidence: prediction.prediction?.confidence ?? null,
                    searchContext: null,
                });
                return {
                    name: prediction.name,
                    rows: [],
                    source: 'searchbar-token-predict',
                    term,
                    attemptedTerms,
                    structuredCard: predictedStructuredCard,
                };
            }
            attemptedTerms.push({
                term,
                rowCount: 0,
                acceptedName: '',
                cached: false,
                source: 'searchbar-token-predict',
                predictionCount: prediction.predictionCount || 0,
                confidence: prediction.prediction?.confidence ?? null,
                error: prediction.error || '',
                searchContext: null,
            });
        } catch (predictionError) {
            attemptedTerms.push({
                term,
                rowCount: 0,
                acceptedName: '',
                cached: false,
                source: 'searchbar-token-predict',
                error: predictionError.message || 'Searchbar token prediction failed.',
                searchContext: null,
            });
        }

        const queryResult = await fetchCardvaultNameResolverRows(term, resolverOptions);
        const rows = sortRowsForTitle(queryResult.rows || [], term, structuredCard?.name || '');
        const acceptedRow = acceptedNameResolverRow(rows, term, structuredCard);

        attemptedTerms.push({
            term,
            rowCount: rows.length,
            acceptedName: acceptedRow ? resolvedCardNameFromRow(acceptedRow, term) : '',
            cached: Boolean(queryResult.cached),
            searchContext: queryResult.searchContext || null,
            error: queryResult.error || '',
        });

        if (acceptedRow) {
            return {
                name: resolvedCardNameFromRow(acceptedRow, term),
                rows,
                source: 'marketplace-autocomplete-name-index',
                term,
                attemptedTerms,
            };
        }
    }

    return {
        name: '',
        rows: [],
        source: 'marketplace-autocomplete-name-index',
        attemptedTerms,
    };
}

function shouldResolveNameBeforeExactSearch(structuredCard = {}, options = {}) {
    if (!['vinted', 'ebay'].includes(options.source || '')) {
        return false;
    }
    if (normalizeVariationValue(structuredCard?.variation || '')) {
        return false;
    }
    const requestedName = compactSearchValue(structuredCard?.name || '');
    if (!requestedName) {
        return false;
    }
    const selectedClues = [
        ...(Array.isArray(structuredCard?.primaryClues) ? structuredCard.primaryClues : []),
        ...(Array.isArray(structuredCard?.selectedClues) ? structuredCard.selectedClues : []),
    ];
    if (selectedClues.some((clue) => {
        const compactClue = compactSearchValue(clue || '');
        return compactClue &&
            compactClue !== requestedName &&
            compactClue.includes(requestedName) &&
            normalizeNameResolverTerm(clue).split(/\s+/).filter(Boolean).length >= 2 &&
            isLikelyCardNameResolverTerm(clue);
    })) {
        return true;
    }

    const titleTerms = candidateNameTermsFromTitle(options.title || '', structuredCard, options);
    return titleTerms.some((term) => {
        const compactTerm = compactSearchValue(term || '');
        return compactTerm &&
            compactTerm !== requestedName &&
            compactTerm.endsWith(requestedName) &&
            normalizeNameResolverTerm(term).split(/\s+/).filter(Boolean).length >= 2;
    });
}

async function promoteStructuredNameFromCardvaultTitle(title = '', structuredCard = {}, options = {}) {
    const nameResolution = await resolveNameFromCardvaultTitle(title, structuredCard, options);
    if (!shouldUseResolvedCardName(nameResolution.name, structuredCard)) {
        return { structuredCard, nameResolution, applied: false };
    }
    const nextStructuredCard = {
        ...(structuredCard || {}),
        name: nameResolution.name,
    };
    nextStructuredCard.searchName = searchNameWithVariation(nameResolution.name, nextStructuredCard.variation || '');
    return { structuredCard: nextStructuredCard, nameResolution, applied: true };
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

    const cardTraderDirectPageInfo = buildCardTraderDirectPageInfo(tab);
    if (cardTraderDirectPageInfo) {
        return cardTraderDirectPageInfo;
    }

    const cardmarketUrlPageInfo = cardmarketProductInfoFromUrl(tab.url || '', tab.title || '');

    const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractTitleFromPage,
    });

    const pageInfo = result?.result || {
        title: tab.title || '',
        url: tab.url || '',
        hostname: new URL(tab.url).hostname,
    };
    const scrapedHasExactIdentity = hasExactStructuredIdentity(pageInfo.structuredCard);
    if (cardmarketUrlPageInfo && !scrapedHasExactIdentity) {
        return {
            ...cardmarketUrlPageInfo,
            debug: {
                ...(pageInfo.debug || {}),
                ...cardmarketUrlPageInfo.debug,
                replacedScrapedTitle: pageInfo.title || '',
            },
        };
    }
    return pageInfo;
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
            .replace(/\b(Carta|Carte|Card|Cards|Stamp|Stampa|Legendary|Treasure|Treasures)\b/gi, ' ')
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
        const response = await cardvaultFetch(`${CARDVAULT_API_BASE_URL}/api/marketplace-autocomplete`, {
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

function buildStructuredFallbackQueries(structuredCard = {}, title = '') {
    const name = structuredCard.searchName || structuredCard.name || '';
    const collectorNumber = structuredCard.collectorNumber || structuredCard.printedCollectorNumber || '';
    const numericCollectorNumber = structuredCard.numericCollectorNumber || '';
    const expansion = structuredCard.expansion || '';
    const levelNumber = structuredCard.levelNumber || '';
    const variationTokens = requestedVariationTokens(structuredCard);
    const deltaAliases = variationTokens.some((token) => token === 'delta' || token === 'deltaspecies')
        ? ['Delta Species', 'delta']
        : [];
    const rarityAliases = Array.isArray(structuredCard.rarityAliases) ? structuredCard.rarityAliases : [];
    return [
        ...deltaAliases.flatMap((deltaAlias) => [
            [name, deltaAlias, collectorNumber, expansion].filter(Boolean).join(' '),
            [name, deltaAlias, expansion, collectorNumber].filter(Boolean).join(' '),
        ]),
        ...rarityAliases.flatMap((rarity) => [
            [name, rarity, collectorNumber, expansion].filter(Boolean).join(' '),
            [name, rarity, expansion, collectorNumber].filter(Boolean).join(' '),
        ]),
        [name, 'Lv.', levelNumber, expansion].filter(Boolean).join(' '),
        [name, levelNumber, expansion].filter(Boolean).join(' '),
        [name, collectorNumber].filter(Boolean).join(' '),
        [name, collectorNumber, expansion].filter(Boolean).join(' '),
        [name, expansion, collectorNumber].filter(Boolean).join(' '),
        [name, numericCollectorNumber].filter(Boolean).join(' '),
        [name, levelNumber].filter(Boolean).join(' '),
        title,
        name,
    ]
        .map((query) => removeMarketplaceSearchNoise(query).replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}

async function searchCardvaultForStructuredCard(title = '', structuredCard = {}) {
    const attemptedQueries = [];
    const queries = [...new Set(buildStructuredFallbackQueries(structuredCard, title))];

    for (const searchTerm of queries) {
        const response = await cardvaultFetch(`${CARDVAULT_API_BASE_URL}/api/marketplace-autocomplete`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                search_term: searchTerm,
                result_limit: 8,
                pool_limit: 80,
                search_language: 'en',
            }),
        });

        if (!response.ok) {
            throw new Error(`Cardvault search failed with HTTP ${response.status}`);
        }

        const payload = await response.json();
        const rows = sortRowsForStructuredCard(
            sortRowsForTitle(normalizeCardvaultRows(payload), title, structuredCard?.name || ''),
            structuredCard
        );
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

    const cardId = match.cardId || match.card_id || match.blueprintId || match.blueprint_id || '';
    const imageUrl = match.imageUrl || match.image_url || match.cdnImageUrl || match.cdn_image_url || '';
    const previewImageUrl = match.previewImageUrl || match.preview_image_url || imageUrl;
    return {
        card_id: cardId,
        name: match.name || match.name_en || match.pokemon_name || '',
        set_name: match.expansionName || match.expansion_name || match.expansion_name_en || match.setName || match.set_name || '',
        card_number: match.collectorNumber || match.collector_number || match.cardNumber || match.card_number || '',
        rarity: match.rarity,
        card_type: match.cardType,
        item_kind: match.itemKind,
        product_type: match.productType,
        trainer_name: match.trainerName,
        image_url: imageUrl,
        cdn_image_url: match.cdnImageUrl || match.cdn_image_url || imageUrl,
        preview_image_url: previewImageUrl,
        card_palette: match.cardPalette || match.card_palette,
        emoji: match.emoji,
        search_rank: match.score ?? match.relevanceScore ?? match.relevance_score ?? '',
        relevance_score: match.relevanceScore ?? match.relevance_score ?? '',
        analytics_boost: match.analyticsBoost ?? match.analytics_boost ?? '',
        pokoin_price: match.pokoinPrice || match.pokoin_price || match.priceFormatted || match.price_formatted || '',
        canonicalUrl: match.canonicalUrl || match.canonical_url || '',
        marketplaceUrl: match.marketplaceUrl || match.marketplace_url || '',
        canonicalPath: match.canonicalPath || match.canonical_path || '',
        marketplacePath: match.marketplacePath || match.marketplace_path || '',
    };
}

function absolutePokoinUrl(pathOrUrl = '') {
    const value = String(pathOrUrl || '').trim();
    if (!value) {
        return '';
    }
    if (/^https?:\/\//i.test(value)) {
        return value;
    }
    return `${CARDVAULT_API_BASE_URL}${value.startsWith('/') ? '' : '/'}${value}`;
}

function canonicalUrlFieldsFromRow(row = {}) {
    if (!row) {
        return {
            canonicalUrl: '',
            marketplaceUrl: '',
            canonicalPath: '',
            marketplacePath: '',
        };
    }
    return {
        canonicalUrl: row.canonicalUrl || row.canonical_url || '',
        marketplaceUrl: row.marketplaceUrl || row.marketplace_url || '',
        canonicalPath: row.canonicalPath || row.canonical_path || '',
        marketplacePath: row.marketplacePath || row.marketplace_path || '',
    };
}

function imageFieldsFromRow(row = {}) {
    const imageUrl = row.image_url || row.imageUrl || row.cdn_image_url || row.cdnImageUrl || '';
    const previewImageUrl = row.preview_image_url || row.previewImageUrl || imageUrl;
    return {
        image_url: imageUrl,
        preview_image_url: previewImageUrl,
    };
}

function pokoinUrlForRow(row = {}) {
    const urls = canonicalUrlFieldsFromRow(row);
    return urls.canonicalUrl ||
        urls.marketplaceUrl ||
        absolutePokoinUrl(urls.canonicalPath || urls.marketplacePath) ||
        (row?.card_id ? `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${encodeURIComponent(row.card_id)}` : '');
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

    if (structuredCard?.collectorNumberFirstRecovery) {
        return true;
    }
    if (hasStructuredCollectorIdentity(structuredCard) && !normalizeVariationValue(structuredCard?.variation || '')) {
        return rowName === requestedName;
    }
    if (requestedName.length > rowName.length && requestedName.includes(rowName)) {
        return false;
    }
    return rowName === requestedName ||
        rowName.includes(requestedName) ||
        requestedName.includes(rowName);
}

function isAllowedBaseSetFamily(row) {
    const setName = compactSetValue(row?.set_name || '');
    return setName === 'baseset' ||
        setName === 'baseset2' ||
        setName === 'basesetshadowless' ||
        setName === 'baseexpansionpack';
}

function expansionMatches(rowExpansion = '', requestedExpansion = '') {
    return expansionMatchRank(rowExpansion, requestedExpansion) < 99;
}

function expansionAliasCompacts(expansion = '') {
    const cleanExpansion = normalizeExpansionAlias(String(expansion || '').replace(/\s+/g, ' ').trim());
    if (!cleanExpansion) {
        return [];
    }

    const variants = new Set([cleanExpansion]);
    const normalizedAlias = normalizeExpansionAlias(cleanExpansion);
    if (normalizedAlias && normalizedAlias !== cleanExpansion) {
        variants.add(normalizedAlias);
    }
    const compactExpansion = compactSetValue(cleanExpansion);
    const codeAliases = {
        drs: 'Dragon Selection',
        dragonselection: 'DRS',
        hl: 'EX Hidden Legends',
        exhiddenlegends: 'HL',
        hlexhiddenlegends: 'EX Hidden Legends',
        rc: 'Radiant Collection',
        radiantcollection: 'RC',
        generationsradiantcollection: 'Radiant Collection',
        generations: 'Radiant Collection',
        exsandstorm: 'Sandstorm',
        sandstorm: 'EX Sandstorm',
    };
    if (codeAliases[compactExpansion]) {
        variants.add(codeAliases[compactExpansion]);
    }
    const prefixedExpansion = cleanExpansion.match(/^([A-Z0-9]{2,6})\s+(.+)$/i);
    if (prefixedExpansion) {
        variants.add(prefixedExpansion[2]);
    }

    for (const variant of [...variants]) {
        variants.add(variant.replace(/\bpromos\b/gi, 'Promo'));
        variants.add(variant.replace(/\bpromo\b/gi, 'Promos'));
    }

    return [...variants]
        .map(compactSetValue)
        .filter(Boolean);
}

function expansionMatchRank(rowExpansion = '', requestedExpansion = '') {
    const requestedAliases = expansionAliasCompacts(requestedExpansion);
    if (requestedAliases.length === 0) {
        return 0;
    }
    const rowAliases = expansionAliasCompacts(rowExpansion);
    if (rowAliases.length === 0) {
        return 99;
    }
    if (requestedAliases.includes('baseset')) {
        return isAllowedBaseSetFamily({ set_name: rowExpansion }) ? 0 : 99;
    }
    if (rowAliases.some((rowSet) => requestedAliases.includes(rowSet))) {
        return 0;
    }
    if (rowAliases.some((rowSet) => requestedAliases.some((requestedSet) =>
        rowSet.includes(requestedSet) || requestedSet.includes(rowSet)
    ))) {
        return 1;
    }
    return 99;
}

function collectorNumberParts(value = '') {
    const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
    const normalized = normalizeCollectorValue(cleanValue);
    const prefix = cleanValue.match(/\b(PROMO|[A-Z0-9]*[A-Z][A-Z0-9-]{0,7})\s*\d{1,4}[a-z]?\b/i)?.[1]?.toLowerCase() || '';
    const slashMatch = normalized.match(/([a-z0-9-]*?)(\d{1,4}[a-z]?)\/([a-z0-9-]*?)(\d{1,4}[a-z]?)/i);
    const primary = normalized.match(/\d{1,4}[a-z]?(?=\/|$)/i)?.[0] ||
        normalized.match(/\d{1,4}[a-z]?/i)?.[0] ||
        '';
    return {
        normalized,
        prefix,
        primary,
        numericPrimary: primary.replace(/^0+(\d)/, '$1'),
        hasSlash: normalized.includes('/'),
        slashRight: slashMatch?.[4] || '',
        normalizedWithoutPrefix: normalized.replace(/^[a-z0-9-]*?(?=\d)/i, ''),
    };
}

function collectorNumberMatchRank(rowNumber = '', requestedNumber = '') {
    const row = collectorNumberParts(rowNumber);
    const requested = collectorNumberParts(requestedNumber);
    if (!row.normalized || !requested.normalized) {
        return 99;
    }

    if (row.normalized === requested.normalized) {
        return 0;
    }

    if (
        row.hasSlash &&
        requested.hasSlash &&
        row.prefix &&
        requested.prefix &&
        row.prefix !== requested.prefix
    ) {
        return 99;
    }

    if (requested.hasSlash && requested.prefix) {
        return 99;
    }

    if (!row.primary || !requested.primary) {
        return 99;
    }

    if (row.primary === requested.primary) {
        if (requested.prefix && row.prefix === requested.prefix) {
            return 0;
        }
        if (requested.prefix && !row.prefix && !row.hasSlash) {
            return 1;
        }
        if (!requested.prefix) {
            return row.hasSlash ? 2 : 1;
        }
        return 4;
    }

    if (!row.numericPrimary || !requested.numericPrimary || row.numericPrimary !== requested.numericPrimary) {
        return 99;
    }

    // Numeric equivalence is useful for unpadded marketplace data, but it must
    // not outrank an exact padded collector match such as DRS 009 -> 009/020.
    if (requested.prefix && row.prefix === requested.prefix) {
        return 5;
    }
    if (requested.prefix && !row.prefix && !row.hasSlash) {
        return 6;
    }
    if (requested.prefix && row.hasSlash) {
        return 7;
    }
    if (!requested.prefix) {
        return row.hasSlash ? 7 : 6;
    }
    return 8;
}

function normalizeCollectorValue(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/\b(?:no|number|num|card)\b/g, ' ')
        .replace(/[^a-z0-9/]+/g, '')
        .trim();
}

function collectorNumberMatches(rowNumber = '', requestedNumber = '') {
    return collectorNumberMatchRank(rowNumber, requestedNumber) < 99;
}

function normalizeVariationValue(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/\bvastro\b/g, 'vstar')
        .replace(/\bspecie\s+delta\b/g, 'delta species')
        .replace(/\bspecies\s+delta\b/g, 'delta species')
        .replace(/[^a-z0-9]+/g, '');
}

function explicitVariationsFromName(value = '') {
    const source = String(value || '');
    const matches = source.match(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break|delta(?:\s+species)?|species\s+delta|specie\s+delta)\b/gi) || [];
    const megaFormMatches = /\bmega\b/i.test(source)
        ? (source.match(/\b[XY]\b/g) || [])
        : [];
    return [...new Set([...matches, ...megaFormMatches].map(normalizeVariationValue).filter(Boolean))];
}

function explicitVariationFromName(value = '') {
    return explicitVariationsFromName(value)[0] || '';
}

function normalizedVariationTokens(value = '') {
    return explicitVariationsFromName(value);
}

function structuredVariationFromPayload(payload = {}, primaryClues = []) {
    const variationParts = [payload.variation || ''];
    for (const clue of primaryClues) {
        const clueTokens = explicitVariationsFromName(clue);
        if (clueTokens.length === 0) {
            continue;
        }
        const resolvedNameCompact = compactSearchValue(payload.name || '');
        const clueCompact = compactSearchValue(clue);
        if (!resolvedNameCompact || clueCompact.includes(resolvedNameCompact)) {
            variationParts.push(clue);
        }
    }
    return variationParts.join(' ');
}

function rowDeltaRank(row = {}, structuredCard = {}) {
    const requestedTokens = requestedVariationTokens(structuredCard);
    if (!requestedTokens.includes('deltaspecies') && !requestedTokens.includes('delta')) {
        return 0;
    }
    const rowText = compactSearchValue([
        row?.name,
        row?.canonical_name,
        row?.set_name,
        row?.expansion_name_en,
        row?.product_type,
        row?.item_kind,
        row?.rarity,
    ].filter(Boolean).join(' '));
    return /deltaspecies|delta/.test(rowText) ? 0 : 9;
}

function rowLevelRank(row = {}, structuredCard = {}) {
    const levelNumber = String(structuredCard?.levelNumber || '').trim();
    if (!levelNumber) {
        return 0;
    }
    const levelCompact = compactSearchValue(levelNumber);
    const rowText = compactSearchValue([
        row?.name,
        row?.canonical_name,
        row?.card_number,
        row?.collector_number,
        row?.set_name,
        row?.expansion_name_en,
        row?.product_type,
        row?.item_kind,
    ].filter(Boolean).join(' '));
    if (new RegExp(`(?:lv|level)?${levelCompact}\\b`).test(rowText)) {
        return 0;
    }
    return 9;
}

function requestedVariationTokens(structuredCard = {}) {
    const tokens = Array.isArray(structuredCard?.variationTokens)
        ? structuredCard.variationTokens
        : normalizedVariationTokens(structuredCard?.variation || '');
    const requestedVariation = normalizeVariationValue(structuredCard?.variation || '');
    return [...new Set([
        ...tokens,
        ...(tokens.includes('deltaspecies') ? ['delta'] : []),
        ...(tokens.includes('delta') ? ['deltaspecies'] : []),
        ...(
            requestedVariation && tokens.length === 0
                ? [requestedVariation]
                : []
        ),
    ].filter(Boolean))];
}

function rowMatchesStructuredVariation(row = {}, structuredCard = {}) {
    const requestedTokens = requestedVariationTokens(structuredCard);
    const rowTokens = explicitVariationsFromName(row?.name || row?.canonical_name || '');
    if (requestedTokens.length === 0) {
        return !structuredCard?.strictVariation || rowTokens.length === 0;
    }
    if (requestedTokens.includes('deltaspecies') || requestedTokens.includes('delta')) {
        return rowDeltaRank(row, structuredCard) === 0;
    }
    if (compositeNameTokens(structuredCard.name || '').length >= 2 && rowHasAllNameTokens(row, compositeNameTokens(structuredCard.name || ''))) {
        return true;
    }
    if (requestedTokens.length === 1 && requestedTokens[0] === 'v' && !hasExplicitVariationStructuredRows([row], structuredCard)) {
        return false;
    }
    if (hasStructuredCollectorIdentity(structuredCard) && rowTokens.length === 0) {
        return false;
    }
    return requestedTokens.every((token) => rowTokens.includes(token));
}

function variationMatchRank(row = {}, structuredCard = {}) {
    const requestedTokens = requestedVariationTokens(structuredCard);
    if (requestedTokens.length === 0) {
        return 0;
    }
    const deltaRank = rowDeltaRank(row, structuredCard);
    if (deltaRank > 0 && (requestedTokens.includes('deltaspecies') || requestedTokens.includes('delta'))) {
        return deltaRank;
    }
    if (deltaRank === 0 && (requestedTokens.includes('deltaspecies') || requestedTokens.includes('delta'))) {
        return 0;
    }
    const rowTokens = explicitVariationsFromName(row?.name || row?.canonical_name || '');
    if (compositeNameTokens(structuredCard.name || '').length >= 2 && rowHasAllNameTokens(row, compositeNameTokens(structuredCard.name || ''))) {
        return 0;
    }
    if (rowTokens.length === 0) {
        return 1;
    }
    return requestedTokens.every((token) => rowTokens.includes(token)) ? 0 : 99;
}

function rarityMatchRank(row = {}, structuredCard = {}) {
    const aliases = Array.isArray(structuredCard?.rarityAliases) ? structuredCard.rarityAliases : [];
    if (aliases.length === 0) {
        return 0;
    }
    const rowRarity = compactSearchValue(row?.rarity || '');
    const rowText = compactSearchValue([
        row?.rarity,
        row?.name,
        row?.set_name,
        row?.card_number,
        row?.product_type,
        row?.item_kind,
    ].filter(Boolean).join(' '));
    if (aliases.some((alias) => rowRarity && rowRarity === compactSearchValue(alias))) {
        return 0;
    }
    if (aliases.some((alias) => rowText.includes(compactSearchValue(alias)))) {
        return 1;
    }
    return 9;
}

function sortRowsForStructuredCard(rows, structuredCard = {}) {
    const requestedExpansion = compactSetValue(structuredCard.expansion || '');
    const requestedName = compactSearchValue(structuredCard.name || '');
    const requestedNameTokens = compositeNameTokens(structuredCard.name || '');
    const expectsCompositeName = requestedNameTokens.length >= 2;
    const requestedCollectorNumber = structuredCard.collectorNumber ||
        structuredCard.printedCollectorNumber ||
        structuredCard.numericCollectorNumber ||
        '';
    const hasEditionHint = Boolean(structuredCard.editionHint);

    return [...rows].sort((a, b) => {
        const aVariationRank = variationMatchRank(a, structuredCard);
        const bVariationRank = variationMatchRank(b, structuredCard);
        if (aVariationRank !== bVariationRank) {
            return aVariationRank - bVariationRank;
        }

        const aLevelRank = rowLevelRank(a, structuredCard);
        const bLevelRank = rowLevelRank(b, structuredCard);
        if (aLevelRank !== bLevelRank) {
            return aLevelRank - bLevelRank;
        }

        const aRarityRank = rarityMatchRank(a, structuredCard);
        const bRarityRank = rarityMatchRank(b, structuredCard);
        if (aRarityRank !== bRarityRank) {
            return aRarityRank - bRarityRank;
        }

        const aExpansionRank = requestedExpansion ? expansionMatchRank(rowExpansionName(a), structuredCard.expansion || '') : 0;
        const bExpansionRank = requestedExpansion ? expansionMatchRank(rowExpansionName(b), structuredCard.expansion || '') : 0;
        if (aExpansionRank !== bExpansionRank) {
            return aExpansionRank - bExpansionRank;
        }

        const aCollectorRank = requestedCollectorNumber ? collectorNumberMatchRank(rowCollectorNumber(a), requestedCollectorNumber) : 0;
        const bCollectorRank = requestedCollectorNumber ? collectorNumberMatchRank(rowCollectorNumber(b), requestedCollectorNumber) : 0;
        if (aCollectorRank !== bCollectorRank) {
            return aCollectorRank - bCollectorRank;
        }

        const aExactStructuredMatch = requestedExpansion &&
            requestedCollectorNumber &&
            aExpansionRank < 99 &&
            aCollectorRank < 99 ? 0 : 1;
        const bExactStructuredMatch = requestedExpansion &&
            requestedCollectorNumber &&
            bExpansionRank < 99 &&
            bCollectorRank < 99 ? 0 : 1;
        if (aExactStructuredMatch !== bExactStructuredMatch) {
            return aExactStructuredMatch - bExactStructuredMatch;
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

        const aCompositePenalty = expectsCompositeName && !rowHasAllNameTokens(a, requestedNameTokens) ? 1 : 0;
        const bCompositePenalty = expectsCompositeName && !rowHasAllNameTokens(b, requestedNameTokens) ? 1 : 0;
        if (aCompositePenalty !== bCompositePenalty) {
            return aCompositePenalty - bCompositePenalty;
        }

        return Number(b.search_rank || 0) - Number(a.search_rank || 0);
    });
}

function compositeNameTokens(value = '') {
    const stopWords = new Set(['and', 'e', 'ex', 'gx', 'v', 'vmax', 'vstar', 'tag', 'team']);
    const tokens = String(value || '')
        .toLowerCase()
        .replace(/[&+/]/g, ' ')
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !stopWords.has(token));
    return [...new Set(tokens)];
}

function rowHasAllNameTokens(row = {}, tokens = []) {
    if (tokens.length === 0) {
        return true;
    }
    const rowName = compactSearchValue(row?.name || row?.canonical_name || '');
    return tokens.every((token) => rowName.includes(compactSearchValue(token)));
}

function rowExpansionName(row = {}) {
    return row.set_name ||
        row.expansion_name_en ||
        row.expansionName ||
        row.expansion_name ||
        '';
}

function rowCollectorNumber(row = {}) {
    return row.card_number ||
        row.collector_number ||
        row.collectorNumber ||
        '';
}

function hasExactStructuredIdentity(structuredCard = {}) {
    return Boolean(
        structuredCard?.expansion &&
        (structuredCard.collectorNumber || structuredCard.printedCollectorNumber || structuredCard.numericCollectorNumber)
    );
}

function hasStructuredCollectorIdentity(structuredCard = {}) {
    const name = String(structuredCard?.name || '').trim();
    return Boolean(
        name &&
        // Possessive/trainer composite names rely on Cardvault's name table so
        // they should still resolve before accepting Pokemon-only fallbacks.
        !/[&'’]/.test(name) &&
        (structuredCard.collectorNumber || structuredCard.printedCollectorNumber || structuredCard.numericCollectorNumber)
    );
}

function hasExactNameVariation(structuredCard = {}) {
    const name = String(structuredCard?.name || '').trim();
    return Boolean(
        name &&
        structuredCard?.variation &&
        // Possessive/trainer composite names rely on Cardvault's name table so
        // they should still resolve before accepting Pokemon-only fallbacks.
        !/[&'’]/.test(name)
    );
}

function hasExactSearchFastPath(structuredCard = {}) {
    return hasStructuredCollectorIdentity(structuredCard) || hasExactNameVariation(structuredCard);
}

function collectorNumberForExtensionPayload(structuredCard = {}) {
    const collectorNumber = structuredCard.collectorNumber || structuredCard.printedCollectorNumber || '';
    if (
        /^(?:POR|TR)$/i.test(structuredCard.collectorNumberPrefix || '') &&
        structuredCard.numericCollectorNumber &&
        ['perfectorder', 'teamrocket'].includes(compactSetValue(structuredCard.expansion || ''))
    ) {
        return structuredCard.numericCollectorNumber;
    }
    return collectorNumber;
}

function rowMatchesStructuredIdentity(row = {}, structuredCard = {}) {
    if (!hasExactStructuredIdentity(structuredCard)) {
        return false;
    }
    const requestedCollectorNumber = structuredCard.collectorNumber ||
        structuredCard.printedCollectorNumber ||
        structuredCard.numericCollectorNumber ||
        '';
    return rowMatchesExactStructuredName(row, structuredCard) &&
        expansionMatches(rowExpansionName(row), structuredCard.expansion || '') &&
        collectorNumberMatches(rowCollectorNumber(row), requestedCollectorNumber);
}

function rowMatchesStructuredCollectorIdentity(row = {}, structuredCard = {}) {
    if (!hasStructuredCollectorIdentity(structuredCard)) {
        return false;
    }
    const requestedCollectorNumber = structuredCard.collectorNumber ||
        structuredCard.printedCollectorNumber ||
        structuredCard.numericCollectorNumber ||
        '';
    return rowMatchesExactStructuredName(row, structuredCard) &&
        collectorNumberMatches(rowCollectorNumber(row), requestedCollectorNumber) &&
        (!structuredCard.expansion || expansionMatches(rowExpansionName(row), structuredCard.expansion || ''));
}

function rowMatchesExactStructuredName(row = {}, structuredCard = {}) {
    const requestedName = compactSearchValue(structuredCard?.name || '');
    if (!requestedName) {
        return false;
    }
    const rowName = compactSearchValue(row?.name || '');
    if (requestedName === 'nidoran') {
        return rowName.startsWith('nidoran');
    }
    const requestedSearchName = compactSearchValue(structuredCard?.searchName || searchNameWithVariation(structuredCard?.name || '', structuredCard?.variation || ''));
    return rowName === requestedName ||
        (requestedSearchName && rowName === requestedSearchName);
}

function rowMatchesGoodEnoughExact(row = {}, structuredCard = {}) {
    const requestedCollectorNumber = structuredCard.collectorNumber ||
        structuredCard.printedCollectorNumber ||
        structuredCard.numericCollectorNumber ||
        '';
    return rowMatchesExactOrStructuredVariationName(row, structuredCard) &&
        collectorNumberMatches(rowCollectorNumber(row), requestedCollectorNumber) &&
        (!structuredCard.expansion || expansionMatches(rowExpansionName(row), structuredCard.expansion || ''));
}

function hasGoodEnoughExactRows(rows = [], structuredCard = {}) {
    return rows.some((row) => rowMatchesGoodEnoughExact(row, structuredCard));
}

function hasExplicitVariationStructuredRows(rows = [], structuredCard = {}) {
    const requestedTokens = requestedVariationTokens(structuredCard);
    if (requestedTokens.includes('delta') || requestedTokens.includes('deltaspecies')) {
        return requestedTokens.length > 0 && rows.some((row) => rowDeltaRank(row, structuredCard) === 0);
    }
    return requestedTokens.length > 0 && rows.some((row) => {
        const rowTokens = explicitVariationsFromName(row?.name || row?.canonical_name || '');
        return requestedTokens.every((token) => rowTokens.includes(token));
    });
}

function filterStrongExactRows(rows = [], structuredCard = {}) {
    if (
        hasStructuredCollectorIdentity(structuredCard) &&
        normalizeVariationValue(structuredCard?.variation || '')
    ) {
        const requestedCollectorNumber = structuredCard.collectorNumber ||
            structuredCard.printedCollectorNumber ||
            structuredCard.numericCollectorNumber ||
            '';
        const exactVariationRows = rows.filter((row) =>
            rowMatchesExactOrStructuredVariationName(row, structuredCard) &&
            rowMatchesStructuredVariation(row, structuredCard) &&
            collectorNumberMatches(rowCollectorNumber(row), requestedCollectorNumber) &&
            (!structuredCard.expansion || expansionMatches(rowExpansionName(row), structuredCard.expansion || ''))
        );
        return exactVariationRows.length > 0 ? exactVariationRows : rows;
    }

    if (
        hasStructuredCollectorIdentity(structuredCard) &&
        !normalizeVariationValue(structuredCard?.variation || '') &&
        compactSearchValue(structuredCard?.collectorNumber || structuredCard?.printedCollectorNumber || '') !==
            compactSearchValue(structuredCard?.numericCollectorNumber || '')
    ) {
        const requestedCollectorNumber = structuredCard.collectorNumber ||
            structuredCard.printedCollectorNumber ||
            structuredCard.numericCollectorNumber ||
            '';
        const exactRows = rows.filter((row) =>
            rowMatchesExactStructuredName(row, structuredCard) &&
            collectorNumberMatches(rowCollectorNumber(row), requestedCollectorNumber) &&
            (!structuredCard.expansion || expansionMatches(rowExpansionName(row), structuredCard.expansion || ''))
        );
        const requestedParts = collectorNumberParts(requestedCollectorNumber);
        const hasPrefixedRow = exactRows.some((row) =>
            collectorNumberParts(rowCollectorNumber(row)).prefix
        );
        const exactRowsHaveAllRequestedPrimary = exactRows.every((row) => {
            const rowParts = collectorNumberParts(rowCollectorNumber(row));
            return rowParts.primary === requestedParts.primary ||
                (!requestedParts.primary.startsWith('0') && rowParts.numericPrimary === requestedParts.numericPrimary);
        });
        const prefixedExactRows = requestedParts.prefix
            ? exactRows.filter((row) => collectorNumberParts(rowCollectorNumber(row)).prefix === requestedParts.prefix)
            : [];
        if (prefixedExactRows.length > 0) {
            return prefixedExactRows;
        }
        const hasNameMismatch = rows.some((row) => !rowMatchesExactStructuredName(row, structuredCard));
        if (!hasNameMismatch || !exactRowsHaveAllRequestedPrimary) {
            return rows;
        }
        return exactRows.length > 0 ? exactRows : rows;
    }
    return rows;
}

function rowMatchesExactOrStructuredVariationName(row = {}, structuredCard = {}) {
    if (rowMatchesExactStructuredName(row, structuredCard)) {
        return true;
    }
    const requestedName = compactSearchValue(structuredCard?.name || '');
    const requestedTokens = requestedVariationTokens(structuredCard);
    const rowName = compactSearchValue(row?.name || '');
    const rowTokens = explicitVariationsFromName(row?.name || row?.canonical_name || '');
    return Boolean(
        requestedName &&
        requestedTokens.length > 0 &&
        requestedTokens.every((token) => rowTokens.includes(token)) &&
        rowName.includes(requestedName)
    );
}

function shouldRunAutocompleteFallback(rows = [], structuredCard = {}) {
    if (rows.length === 0) {
        return true;
    }
    if (structuredCard?.levelNumber && !rows.some((row) => rowLevelRank(row, structuredCard) === 0)) {
        return true;
    }
    const requestedTokens = requestedVariationTokens(structuredCard);
    if (
        (requestedTokens.includes('delta') || requestedTokens.includes('deltaspecies')) &&
        !rows.some((row) => rowDeltaRank(row, structuredCard) === 0)
    ) {
        return true;
    }
    if (
        marketplaceBroadMegaSearch(structuredCard) &&
        rows.length < 8
    ) {
        return true;
    }
    if (hasExplicitVariationStructuredRows(rows, structuredCard)) {
        return false;
    }
    if (hasStructuredCollectorIdentity(structuredCard)) {
        return !hasGoodEnoughExactRows(rows, structuredCard);
    }
    if (hasExactNameVariation(structuredCard)) {
        return false;
    }
    return rows.length < 8;
}

function marketplaceBroadMegaSearch(structuredCard = {}) {
    const requestedTokens = requestedVariationTokens(structuredCard);
    const selectedClueText = normalizeRequestClues(structuredCard?.selectedClues || [])
        .join(' ');
    const nameText = `${structuredCard?.name || ''} ${structuredCard?.searchName || ''} ${selectedClueText}`;
    const broadSelectedMegaCharizard = /mega\s+charizard/i.test(selectedClueText) ||
        /mega\s+charizard/i.test(structuredCard?.rawTitle || '');
    return (requestedTokens.includes('mega') || broadSelectedMegaCharizard) &&
        /charizard/i.test(nameText) &&
        !requestedTokens.includes('x') &&
        !requestedTokens.includes('y') &&
        !requestedTokens.includes('ex');
}

function mergeAndRankStructuredRows(primaryRows = [], fallbackRows = [], structuredCard = {}) {
    return filterStrongExactRows(
        sortRowsForStructuredCard(uniqueRowsById([...primaryRows, ...fallbackRows]), structuredCard),
        structuredCard
    );
}

function hasCollectorEvidence(structuredCard = {}) {
    return Boolean(structuredCard?.collectorNumber || structuredCard?.printedCollectorNumber || structuredCard?.numericCollectorNumber);
}

function shouldUseCollectorFirstRecovery(structuredCard = {}) {
    return hasCollectorEvidence(structuredCard) && !/[&'’]/.test(String(structuredCard?.name || ''));
}

function collectorOnlyStructuredCard(structuredCard = {}) {
    return {
        ...structuredCard,
        name: '',
        searchName: '',
        collectorNumberFirstRecovery: true,
    };
}

function inferStructuredNameFromCollectorRows(structuredCard = {}, rows = []) {
    if (!hasCollectorEvidence(structuredCard) || rows.length === 0) {
        return structuredCard;
    }
    const requestedCollectorNumber = structuredCard.collectorNumber ||
        structuredCard.printedCollectorNumber ||
        structuredCard.numericCollectorNumber ||
        '';
    const exactCollectorRows = rows.filter((row) =>
        collectorNumberMatches(rowCollectorNumber(row), requestedCollectorNumber) &&
        (!structuredCard.expansion || expansionMatches(rowExpansionName(row), structuredCard.expansion || '')) &&
        rowMatchesStructuredVariation(row, structuredCard)
    );
    const candidateRows = exactCollectorRows.length > 0 ? exactCollectorRows : rows;
    const firstName = candidateRows[0]?.name || '';
    const allSameName = firstName && candidateRows.every((row) => compactSearchValue(row.name || '') === compactSearchValue(firstName));
    if (!allSameName) {
        return structuredCard;
    }
    return {
        ...structuredCard,
        name: firstName,
        searchName: searchNameWithVariation(firstName, structuredCard.variation || ''),
        collectorNumberRecoveredName: true,
    };
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
        name: structuredCard.searchName || structuredCard.name,
        collectorNumber: collectorNumberForExtensionPayload(structuredCard),
        numericCollectorNumber: structuredCard.numericCollectorNumber,
        printedCollectorNumber: structuredCard.printedCollectorNumber,
        expansion: structuredCard.expansion,
        rarity: structuredCard.rarity,
        rarityAliases: structuredCard.rarityAliases,
        variation: structuredCard.variation,
        levelNumber: structuredCard.levelNumber,
        editionHint: structuredCard.editionHint,
        language: 'en',
        limit: 8,
    };

    const response = await cardvaultFetch(`${CARDVAULT_API_BASE_URL}/api/extension-card-search`, {
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
        try {
            const editionResponse = await cardvaultFetch(`${CARDVAULT_API_BASE_URL}/api/extension-card-search`, {
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
        } catch (error) {
            console.warn('⚠️ [Background] Ignored edition refinement failure:', error);
        }
    }

    const rows = uniqueRowsById(matches
        .map(rowFromExtensionMatch)
        .filter(Boolean)
        .filter((row) => rowMatchesStructuredName(row, structuredCard))
        .filter((row) => rowMatchesStructuredVariation(row, structuredCard))
        .filter((row) => compactSetValue(structuredCard.expansion || '') !== 'baseset' || isAllowedBaseSetFamily(row)));

    return {
        rows: filterStrongExactRows(sortRowsForStructuredCard(rows, structuredCard), structuredCard),
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
    const canonicalFields = canonicalUrlFieldsFromRow(row);
    const imageFields = imageFieldsFromRow(row);
    return {
        blueprint_id: row.card_id,
        name_en: row.name,
        pokemon_name: row.name,
        expansion_name_en: row.set_name,
        collector_number: row.card_number,
        rarity: row.rarity,
        image_url: imageFields.image_url,
        preview_image_url: imageFields.preview_image_url,
        previewImageUrl: imageFields.preview_image_url,
        imageUrl: imageFields.image_url,
        source: row.source || 'background_card_search',
        search_score: row.search_rank,
        pokoin_price: row.pokoin_price || row.pokoinPrice || row.price_formatted || row.priceFormatted || '',
        ...canonicalFields,
        canonical_url: canonicalFields.canonicalUrl,
        marketplace_url: canonicalFields.marketplaceUrl,
        canonical_path: canonicalFields.canonicalPath,
        marketplace_path: canonicalFields.marketplacePath,
    };
}

function selectedCandidateRowFromRequest(request = {}) {
    const selected = request.selectedCandidate || {};
    const cardId = request.selectedCandidateId || selected.card_id || selected.blueprint_id || selected.cardId || selected.blueprintId || '';
    if (!cardId) {
        return null;
    }
    const imageFields = imageFieldsFromRow(selected);

    return {
        card_id: String(cardId),
        name: selected.name || selected.name_en || selected.pokemon_name || request.title || `Blueprint ${cardId}`,
        set_name: selected.set_name || selected.expansion_name_en || selected.expansionName || selected.expansion_name || '',
        card_number: selected.card_number || selected.collector_number || selected.collectorNumber || '',
        expansion_symbol_url: selected.expansion_symbol_url || selected.expansionSymbolUrl || selected.symbolImageUrl || '',
        ...imageFields,
        source: selected.source || 'selected_candidate',
        search_rank: selected.search_rank || selected.searchScore || selected.search_score || selected.relevanceScore || selected.score || 999999,
        pokoin_price: selected.pokoin_price || selected.pokoinPrice || selected.price_formatted || selected.priceFormatted || '',
        ...canonicalUrlFieldsFromRow(selected),
    };
}

function sidePanelRowFromPreview(row = {}) {
    const cardId = row.card_id || row.blueprint_id || row.cardId || row.blueprintId || '';
    if (!cardId) {
        return null;
    }
    return {
        card_id: String(cardId),
        name: row.name || row.name_en || row.pokemon_name || '',
        set_name: row.set_name || row.expansion_name_en || row.expansionName || row.expansion_name || '',
        card_number: row.card_number || row.collector_number || row.collectorNumber || '',
        expansion_symbol_url: row.expansion_symbol_url || row.expansionSymbolUrl || row.symbolImageUrl || '',
        ...imageFieldsFromRow(row),
        source: row.source || 'vinted_overlay_preview',
        search_rank: row.search_rank || row.searchScore || row.search_score || row.relevanceScore || row.score || '',
        pokoin_price: row.pokoin_price || row.pokoinPrice || row.price_formatted || row.priceFormatted || '',
        ...canonicalUrlFieldsFromRow(row),
    };
}

function sidePanelStatePokoinUrl(row = {}) {
    return pokoinUrlForRow(row);
}

function cardTraderDirectPokoinUrl(blueprintId = '') {
    const stableBlueprintId = String(blueprintId || '').trim();
    return stableBlueprintId ? `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${encodeURIComponent(stableBlueprintId)}` : '';
}

function previewRowsFromRequest(request = {}) {
    return (Array.isArray(request.previewRows) ? request.previewRows : [])
        .map(sidePanelRowFromPreview)
        .filter(Boolean)
        .slice(0, 8);
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

function sameCardTraderDirectBlueprint(a = '', b = '') {
    const leftBlueprintId = cardtraderBlueprintIdFromUrl(a);
    const rightBlueprintId = cardtraderBlueprintIdFromUrl(b);
    return Boolean(leftBlueprintId && rightBlueprintId && leftBlueprintId === rightBlueprintId);
}

function isCardTraderDirectUrl(url = '') {
    return Boolean(cardtraderBlueprintIdFromUrl(url));
}

function cardTraderDirectStateCacheKey({ url = '', blueprintId = '', pokoinUrl = '' } = {}) {
    const stableBlueprintId = String(blueprintId || cardtraderBlueprintIdFromUrl(url) || '').trim();
    const stableCardUrl = stableSearchUrl(url);
    const stablePokoinUrl = stableSearchUrl(pokoinUrl || cardTraderDirectPokoinUrl(stableBlueprintId));
    if (!stableBlueprintId || !stableCardUrl || !stablePokoinUrl) {
        return '';
    }
    return ['cardtrader', stableCardUrl, stableBlueprintId, stablePokoinUrl].join('|');
}

function cardTraderDirectStateCacheKeyFromState(state = {}) {
    const pageInfo = state?.pageInfo || {};
    return cardTraderDirectStateCacheKey({
        url: pageInfo.url || '',
        blueprintId: pageInfo.cardtraderBlueprintId || state?.debug?.cardtraderBlueprintId || state?.blueprintId || state?.best?.card_id || '',
        pokoinUrl: state?.pokoinUrl || sidePanelStatePokoinUrl(state?.best || {}),
    });
}

function isCardTraderDirectState(state = {}) {
    const pageInfo = state?.pageInfo || {};
    return Boolean(
        !state?.loading &&
        !state?.error &&
        (pageInfo.cardtraderBlueprintId || state?.debug?.directCardTrader || state?.best?.source === 'cardtrader_url') &&
        (state?.blueprintId || state?.best?.card_id || state?.best?.blueprint_id)
    );
}

function cloneSidePanelState(state = {}) {
    return {
        ...state,
        pageInfo: {
            ...(state?.pageInfo || {}),
            structuredCard: { ...(state?.pageInfo?.structuredCard || {}) },
            debug: { ...(state?.pageInfo?.debug || {}) },
        },
        rows: Array.isArray(state?.rows) ? state.rows.map((row) => ({ ...row })) : [],
        best: state?.best ? { ...state.best } : null,
        debug: { ...(state?.debug || {}) },
    };
}

function rememberCardTraderDirectState(state = {}) {
    if (!isCardTraderDirectState(state)) {
        return null;
    }
    const cacheKey = cardTraderDirectStateCacheKeyFromState(state);
    if (!cacheKey) {
        return null;
    }
    return recentSearchCacheSet(recentCardTraderDirectStateCache, cacheKey, cloneSidePanelState(state), RECENT_SEARCH_CACHE_LIMIT);
}

function validCachedCardTraderDirectState(state = {}, url = '') {
    if (!isCardTraderDirectState(state)) {
        return false;
    }
    const blueprintId = cardtraderBlueprintIdFromUrl(url);
    const stateBlueprintId = state?.pageInfo?.cardtraderBlueprintId || state?.debug?.cardtraderBlueprintId || state?.blueprintId || state?.best?.card_id || '';
    return Boolean(
        blueprintId &&
        stateBlueprintId &&
        String(blueprintId) === String(stateBlueprintId) &&
        sameUrlWithoutHash(state?.pageInfo?.url || '', url)
    );
}

function latestRecentCardTraderDirectState(tab = {}, state = null) {
    const url = tab?.url || '';
    const blueprintId = cardtraderBlueprintIdFromUrl(url);
    if (!blueprintId) {
        return null;
    }
    if (validCachedCardTraderDirectState(state, url)) {
        rememberCardTraderDirectState(state);
        return state;
    }
    const cacheKey = cardTraderDirectStateCacheKey({
        url,
        blueprintId,
        pokoinUrl: cardTraderDirectPokoinUrl(blueprintId),
    });
    const cached = recentSearchCacheGet(recentCardTraderDirectStateCache, cacheKey);
    return validCachedCardTraderDirectState(cached, url) ? cached : null;
}

function isDuplicateCardTraderDirectState(currentState = {}, nextState = {}) {
    return Boolean(
        isCardTraderDirectState(currentState) &&
        isCardTraderDirectState(nextState) &&
        cardTraderDirectStateCacheKeyFromState(currentState) &&
        cardTraderDirectStateCacheKeyFromState(currentState) === cardTraderDirectStateCacheKeyFromState(nextState) &&
        stableSearchUrl(currentState.pokoinUrl || sidePanelStatePokoinUrl(currentState.best || {})) === stableSearchUrl(nextState.pokoinUrl || sidePanelStatePokoinUrl(nextState.best || {}))
    );
}

async function applyCardTraderDirectCachedState(tab = {}, cachedState = {}, owner = null, options = {}) {
    const blueprintId = cardtraderBlueprintIdFromUrl(tab?.url || cachedState?.pageInfo?.url || '') ||
        cachedState?.pageInfo?.cardtraderBlueprintId ||
        cachedState?.blueprintId ||
        cachedState?.best?.card_id ||
        '';
    if (!blueprintId || !validCachedCardTraderDirectState(cachedState, tab?.url || cachedState?.pageInfo?.url || '')) {
        return null;
    }
    const state = cloneSidePanelState(cachedState);
    state.updatedAt = Date.now();
    state.loading = false;
    state.error = '';
    state.pageInfo = {
        ...(state.pageInfo || {}),
        url: state.pageInfo?.url || tab?.url || '',
        hostname: state.pageInfo?.hostname || safeUrlHostname(state.pageInfo?.url || tab?.url),
        cardtraderBlueprintId: String(blueprintId),
    };
    state.blueprintId = String(blueprintId);
    state.pokoinUrl = state.pokoinUrl || cardTraderDirectPokoinUrl(blueprintId);
    state.debug = {
        ...(state.debug || {}),
        searched: false,
        directCardTrader: true,
        cardtraderBlueprintId: String(blueprintId),
        cardTraderDirectCacheHit: true,
        refreshFailureReason: options.reason || '',
    };
    return setSidePanelState(state, owner);
}

function isLockedCardTraderDirectState(state = {}, url = '') {
    const stateUrl = state?.pageInfo?.url || '';
    const stateBlueprintId = state?.pageInfo?.cardtraderBlueprintId || state?.debug?.cardtraderBlueprintId || state?.blueprintId || '';
    const urlBlueprintId = cardtraderBlueprintIdFromUrl(url);
    return Boolean(
        urlBlueprintId &&
        stateBlueprintId &&
        String(stateBlueprintId) === String(urlBlueprintId) &&
        sameUrlWithoutHash(stateUrl, url)
    );
}

function isExactCardmarketState(state = {}) {
    const pageInfo = state?.pageInfo || {};
    return Boolean(
        isCardmarketUrl(pageInfo.url || '') &&
        hasExactStructuredIdentity(pageInfo.structuredCard || {}) &&
        (state.blueprintId || state.best?.card_id || state.best?.blueprint_id)
    );
}

function isVintedUrl(url = '') {
    try {
        return new URL(url).hostname.includes('vinted');
    } catch (error) {
        return false;
    }
}

function isEbayUrl(url = '') {
    try {
        return new URL(url).hostname.includes('ebay');
    } catch (error) {
        return false;
    }
}

function isPinnedVintedPreviewState(state = {}) {
    return Boolean(
        state?.debug?.pinnedVintedPreview &&
        state?.debug?.pinnedPreviewRows &&
        isVintedUrl(state?.pageInfo?.url || '') &&
        Array.isArray(state?.rows) &&
        state.rows.length > 0
    );
}

function samePinnedVintedPreviewState(state = {}, url = '') {
    return Boolean(
        isPinnedVintedPreviewState(state) &&
        sameUrlWithoutHash(state.pageInfo?.url || '', url || '')
    );
}

function selectedClueSignature(clues = [], primaryClues = []) {
    return [
        normalizeRequestClues(clues).map(compactSearchValue).sort().join(','),
        normalizeRequestClues(primaryClues).map(compactSearchValue).sort().join(','),
    ].join('|');
}

function marketplacePreviewRowIds(rows = []) {
    return (Array.isArray(rows) ? rows : [])
        .map((row) => String(row.card_id || row.blueprint_id || row.cardId || row.blueprintId || ''))
        .filter(Boolean)
        .join('|');
}

function vintedStateSelectionSignature(state = {}) {
    const pageInfo = state?.pageInfo || {};
    const payload = normalizeVintedPayload(pageInfo.vintedPayload);
    return selectedClueSignature(
        payload?.selectedClues || pageInfo.selectedClues || pageInfo.clues,
        payload?.primaryClues || pageInfo.primaryClues
    );
}

function isNewerVintedSelectionState(existingState = {}, nextState = {}) {
    if (!isVintedUrl(existingState?.pageInfo?.url || '') || !isVintedUrl(nextState?.pageInfo?.url || '')) {
        return false;
    }
    if (!sameUrlWithoutHash(existingState.pageInfo?.url || '', nextState.pageInfo?.url || '')) {
        return false;
    }
    const existingRevision = Number(existingState.pageInfo?.selectionRevision ?? existingState.debug?.selectionRevision ?? 0);
    const nextRevision = Number(nextState.pageInfo?.selectionRevision ?? nextState.debug?.selectionRevision ?? 0);
    if (Number.isFinite(nextRevision) && nextRevision > existingRevision) {
        return true;
    }
    const existingSignature = existingState.pageInfo?.previewSignature || existingState.debug?.previewSignature || vintedStateSelectionSignature(existingState);
    const nextSignature = nextState.pageInfo?.previewSignature || nextState.debug?.previewSignature || vintedStateSelectionSignature(nextState);
    return Boolean(nextSignature && existingSignature && nextSignature !== existingSignature);
}

function shouldKeepExistingExactCardmarketState(existingState = {}, nextState = {}) {
    if (!isExactCardmarketState(existingState)) {
        return false;
    }
    const existingUrl = existingState.pageInfo?.url || '';
    const nextUrl = nextState.pageInfo?.url || '';
    if (!existingUrl || !nextUrl || !sameUrlWithoutHash(existingUrl, nextUrl)) {
        return false;
    }
    return !isExactCardmarketState(nextState);
}

function shouldKeepExistingPinnedVintedState(existingState = {}, nextState = {}) {
    if (!isPinnedVintedPreviewState(existingState)) {
        return false;
    }
    const existingUrl = existingState.pageInfo?.url || '';
    const nextUrl = nextState.pageInfo?.url || '';
    if (!existingUrl || !nextUrl || !sameUrlWithoutHash(existingUrl, nextUrl)) {
        return false;
    }
    if (isNewerVintedSelectionState(existingState, nextState)) {
        return false;
    }
    return !nextState.debug?.pinnedVintedPreview;
}

function safeUrlHostname(url = '') {
    try {
        return url ? new URL(url).hostname : '';
    } catch (error) {
        return '';
    }
}

function sidePanelOwnerDebug(owner = null, extra = {}) {
    return runtimeDebugMetadata({
        ...(owner ? {
            sidePanelRequestId: owner.requestId,
            sidePanelReason: owner.reason,
            sidePanelTabId: owner.tabId || null,
            sidePanelUrl: owner.url || '',
        } : {}),
        staleIgnoredCount: sidePanelStaleIgnoredCount,
        ...extra,
    });
}

function markStaleSidePanelOwner(owner = null, reason = 'stale') {
    sidePanelStaleIgnoredCount += 1;
    if (owner) {
        owner.stale = true;
        owner.staleReason = reason;
    }
    console.log(`ℹ️ [Background] Ignored stale side panel request${owner?.requestId ? ` #${owner.requestId}` : ''}: ${reason}`);
}

function isSidePanelOwnerCurrent(owner = null, url = '') {
    if (!owner) {
        return true;
    }
    const currentOwner = sidePanelCurrentOwner;
    const currentUrl = url || owner.url || '';
    return Boolean(
        currentOwner &&
        currentOwner.requestId === owner.requestId &&
        currentOwner.tabId === owner.tabId &&
        sameUrlWithoutHash(currentOwner.url || '', currentUrl) &&
        sameUrlWithoutHash(owner.url || '', currentUrl)
    );
}

function createSidePanelRequestOwner(tab = {}, reason = 'refresh') {
    const previousOwner = sidePanelCurrentOwner;
    if (previousOwner?.tabId && (previousOwner.tabId !== tab?.id || !sameUrlWithoutHash(previousOwner.url || '', tab?.url || ''))) {
        clearTimeout(sidePanelRefreshTimers.get(previousOwner.tabId));
        sidePanelRefreshTimers.delete(previousOwner.tabId);
    }

    const requestId = sidePanelRequestSequence + 1;
    sidePanelRequestSequence = requestId;
    const abortController = typeof AbortController !== 'undefined'
        ? new AbortController()
        : null;
    const owner = {
        requestId,
        tabId: tab?.id || null,
        url: tab?.url || '',
        reason,
        startedAt: Date.now(),
        abortController,
    };
    if (owner.tabId) {
        sidePanelOwnersByTab.set(owner.tabId, owner);
    }
    sidePanelCurrentOwner = owner;
    if (owner.tabId) {
        clearTimeout(sidePanelRefreshTimers.get(owner.tabId));
        sidePanelRefreshTimers.delete(owner.tabId);
    }
    if (previousOwner?.abortController && previousOwner.requestId !== owner.requestId) {
        try {
            previousOwner.abortController.abort();
        } catch (error) {
            // Older requests are also gated by request id before writing.
        }
    }
    return owner;
}

async function setSidePanelState(nextState = {}, owner = null) {
    if (owner && !isSidePanelOwnerCurrent(owner, nextState?.pageInfo?.url || owner.url || '')) {
        markStaleSidePanelOwner(owner, 'write owner no longer current');
        return null;
    }
    const state = {
        ...nextState,
        debug: sidePanelOwnerDebug(owner, nextState.debug || {}),
    };
    const { sidePanelState: currentState } = await chrome.storage.session.get('sidePanelState');
    if (owner && !isSidePanelOwnerCurrent(owner, state?.pageInfo?.url || owner.url || '')) {
        markStaleSidePanelOwner(owner, 'write owner changed during storage read');
        return null;
    }
    if (shouldKeepExistingExactCardmarketState(currentState, state)) {
        console.log('ℹ️ [Background] Kept exact Cardmarket state over weaker same-URL update');
        return currentState;
    }
    if (shouldKeepExistingPinnedVintedState(currentState, state)) {
        console.log('ℹ️ [Background] Kept Vinted preview rows over broader same-URL update');
        return currentState;
    }
    if (
        isDuplicateCardTraderDirectState(currentState, state) &&
        !state.debug?.priceEnriched &&
        !state.debug?.forceCardTraderDirectRefresh
    ) {
        rememberCardTraderDirectState(currentState);
        console.log('ℹ️ [Background] Kept CardTrader direct state over duplicate same-card update');
        return currentState;
    }
    if (
        currentState?.debug?.pinnedPreviewRows &&
        !state.debug?.pinnedPreviewRows &&
        sameUrlWithoutHash(currentState.pageInfo?.url || '', state.pageInfo?.url || '')
    ) {
        console.log('ℹ️ [Background] Kept pinned preview rows over weaker same-URL update');
        return currentState;
    }
    await chrome.storage.session.set({ sidePanelState: state });
    rememberCardTraderDirectState(state);
    return state;
}

function clearBackgroundSearchCachesForUrl(url = '') {
    const stableUrl = stableSearchUrl(url);
    if (!stableUrl) {
        return;
    }
    for (const key of [...backgroundSearchInFlight.keys()]) {
        if (key.includes(`|${stableUrl}|`) || key.startsWith(`background|${stableUrl}|`)) {
            backgroundSearchInFlight.delete(key);
        }
    }
    for (const key of [...backgroundSearchResultCache.keys()]) {
        if (key.includes(`|${stableUrl}|`) || key.startsWith(`background|${stableUrl}|`)) {
            backgroundSearchResultCache.delete(key);
        }
    }
    for (const key of [...vintedCanonicalApplyInFlight.keys()]) {
        if (key.includes(`|${stableUrl}|`)) {
            vintedCanonicalApplyInFlight.delete(key);
        }
    }
    for (const key of [...vintedCanonicalApplyRecent.keys()]) {
        if (key.includes(`|${stableUrl}|`)) {
            vintedCanonicalApplyRecent.delete(key);
        }
    }
    for (const key of [...ebayCanonicalApplyInFlight.keys()]) {
        if (key.includes(`|${stableUrl}|`)) {
            ebayCanonicalApplyInFlight.delete(key);
        }
    }
    for (const key of [...ebayCanonicalApplyRecent.keys()]) {
        if (key.includes(`|${stableUrl}|`)) {
            ebayCanonicalApplyRecent.delete(key);
        }
    }
}

const sidePanelRefreshTimers = new Map();
let sidePanelRequestSequence = 0;
let sidePanelCurrentOwner = null;
let sidePanelStaleIgnoredCount = 0;
const sidePanelOwnersByTab = new Map();
const backgroundSearchInFlight = new Map();
const backgroundSearchResultCache = new Map();
const latestVintedCanonicalByTabUrl = new Map();
const recentVintedCanonicalPreviewCache = new Map();
const latestEbayCanonicalByTabUrl = new Map();
const recentEbayCanonicalPreviewCache = new Map();
const recentCardTraderDirectStateCache = new Map();
const ebayCanonicalApplyInFlight = new Map();
const ebayCanonicalApplyRecent = new Map();
const vintedCanonicalApplyInFlight = new Map();
const vintedCanonicalApplyRecent = new Map();
const vintedTokenWaitTimers = new Map();
const cardvaultNameResolutionCache = new Map();
const cardvaultTokenPredictionCache = new Map();
const pokoinPriceCache = new Map();
const cardmarketObservationSignatures = new Set();
const cardmarketObservationInFlight = new Map();
let pendingCardmarketObservationWrite = Promise.resolve();
let pokoinAuthBridgeInFlight = null;
let pokoinAuthTokenRequestInFlight = null;
let pokoinAuthBridgeTab = null;

function runtimeDebugMetadata(extra = {}) {
    return {
        extensionVersion: EXTENSION_VERSION,
        buildMarker: EXTENSION_BUILD_MARKER,
        ...extra,
    };
}

async function ensureRuntimeStorageCurrent() {
    const storage = await chrome.storage.session.get([EXTENSION_RUNTIME_STORAGE_KEY, 'sidePanelState']);
    const runtime = storage?.[EXTENSION_RUNTIME_STORAGE_KEY] || {};
    if (runtime.buildMarker === EXTENSION_BUILD_MARKER) {
        return;
    }
    if (!runtime.buildMarker) {
        await chrome.storage.session.set({
            [EXTENSION_RUNTIME_STORAGE_KEY]: {
                extensionVersion: EXTENSION_VERSION,
                buildMarker: EXTENSION_BUILD_MARKER,
                initializedAt: Date.now(),
            },
        });
        return;
    }
    backgroundSearchInFlight.clear();
    backgroundSearchResultCache.clear();
    recentVintedCanonicalPreviewCache.clear();
    vintedCanonicalApplyInFlight.clear();
    vintedCanonicalApplyRecent.clear();
    for (const timeoutId of vintedTokenWaitTimers.values()) {
        clearTimeout(timeoutId);
    }
    vintedTokenWaitTimers.clear();
    latestVintedCanonicalByTabUrl.clear();
    latestEbayCanonicalByTabUrl.clear();
    cardvaultNameResolutionCache.clear();
    cardvaultTokenPredictionCache.clear();
    recentEbayCanonicalPreviewCache.clear();
    recentCardTraderDirectStateCache.clear();
    ebayCanonicalApplyInFlight.clear();
    ebayCanonicalApplyRecent.clear();
    sidePanelCurrentOwner = null;
    sidePanelOwnersByTab.clear();
    await chrome.storage.session.set({
        [EXTENSION_RUNTIME_STORAGE_KEY]: {
            extensionVersion: EXTENSION_VERSION,
            buildMarker: EXTENSION_BUILD_MARKER,
            initializedAt: Date.now(),
        },
        sidePanelState: storage.sidePanelState
            ? {
                updatedAt: Date.now(),
                pageInfo: {
                    ...(storage.sidePanelState.pageInfo || {}),
                    title: '',
                    url: '',
                    hostname: '',
                },
                rows: [],
                best: null,
                blueprintId: '',
                pokoinUrl: '',
                error: '',
                loading: false,
                debug: runtimeDebugMetadata({
                    invalidatedPreviousBuildMarker: runtime.buildMarker || '',
                }),
            }
            : storage.sidePanelState,
    });
}

function normalizePokoinTokenExpiry(value, receivedAt = Date.now()) {
    if (!value) {
        return receivedAt + POKOIN_FALLBACK_TOKEN_TTL_MS;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value < 100000000000 ? value * 1000 : value;
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : receivedAt + POKOIN_FALLBACK_TOKEN_TTL_MS;
}

function validatePokoinAuthTokenMessage(message = {}) {
    if (!message || typeof message !== 'object') {
        return { valid: false, error: 'Invalid auth message.' };
    }
    if (message.type !== POKOIN_AUTH_TOKEN_RESPONSE_TYPE) {
        return { valid: false, error: 'Unexpected auth message type.' };
    }
    const token = typeof message.token === 'string' ? message.token.trim() : '';
    if (token.length <= 20) {
        return { valid: false, error: 'Missing Pokoin ID token.' };
    }
    const receivedAt = Date.now();
    const expiresAt = normalizePokoinTokenExpiry(message.expiresAt || message.expirationTime, receivedAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= receivedAt) {
        return { valid: false, error: 'Expired Pokoin ID token.' };
    }
    return {
        valid: true,
        session: {
            token,
            receivedAt,
            expiresAt,
            issuedAt: message.issuedAt || null,
        },
    };
}

async function storePokoinAuthToken(tokenMessage = {}) {
    const validation = validatePokoinAuthTokenMessage(tokenMessage);
    if (!validation.valid) {
        return validation;
    }
    await chrome.storage.session.set({
        [POKOIN_AUTH_STORAGE_KEY]: validation.session,
    });
    return validation;
}

async function getStoredPokoinAuthToken() {
    const storage = await chrome.storage.session.get(POKOIN_AUTH_STORAGE_KEY);
    const session = storage?.[POKOIN_AUTH_STORAGE_KEY];
    if (!session?.token || !session.expiresAt || Number(session.expiresAt) <= Date.now() + POKOIN_TOKEN_REFRESH_SKEW_MS) {
        return '';
    }
    return session.token;
}

function isPokoinAuthBridgeUrl(url = '') {
    try {
        const parsed = new URL(url);
        return parsed.origin === POKOIN_AUTH_ORIGIN && parsed.pathname === POKOIN_AUTH_BRIDGE_PATH;
    } catch (error) {
        return false;
    }
}

function trackPokoinAuthBridgeTab(tab = null, options = {}) {
    if (!tab?.id) {
        return null;
    }
    pokoinAuthBridgeTab = {
        tabId: tab.id,
        windowId: tab.windowId || null,
        url: tab.url || POKOIN_AUTH_BRIDGE_URL,
        openedByExtension: Boolean(options.openedByExtension || pokoinAuthBridgeTab?.tabId === tab.id && pokoinAuthBridgeTab.openedByExtension),
    };
    return pokoinAuthBridgeTab;
}

async function closeTrackedPokoinAuthBridgeTab() {
    const trackedTab = pokoinAuthBridgeTab;
    if (!trackedTab?.tabId || !chrome.tabs?.remove) {
        return false;
    }

    pokoinAuthBridgeTab = null;

    try {
        const currentTab = chrome.tabs?.get
            ? await chrome.tabs.get(trackedTab.tabId).catch(() => null)
            : null;
        const currentUrl = currentTab?.url || trackedTab.url || '';
        if (!trackedTab.openedByExtension && !isPokoinAuthBridgeUrl(currentUrl)) {
            return false;
        }
        await chrome.tabs.remove(trackedTab.tabId);
        return true;
    } catch (error) {
        console.warn('⚠️ [Background] Unable to close Pokoin auth bridge tab:', error?.message || error);
        return false;
    }
}

async function openPokoinAuthBridge() {
    if (pokoinAuthBridgeInFlight) {
        return pokoinAuthBridgeInFlight;
    }

    pokoinAuthBridgeInFlight = Promise.resolve()
        .then(async () => {
            const existingTabs = chrome.tabs?.query
                ? await chrome.tabs.query({ url: `${POKOIN_AUTH_BRIDGE_URL}*` }).catch(() => [])
                : [];
            const existingTab = existingTabs.find((tab) => tab?.id);
            if (existingTab?.id && chrome.tabs?.update) {
                const updatedTab = await chrome.tabs.update(existingTab.id, { active: false }).catch(() => existingTab);
                return trackPokoinAuthBridgeTab(updatedTab || existingTab, { openedByExtension: false });
            }
            if (chrome.tabs?.create) {
                const createdTab = await chrome.tabs.create({ url: POKOIN_AUTH_BRIDGE_URL, active: false });
                return trackPokoinAuthBridgeTab(createdTab, { openedByExtension: true });
            }
            return null;
        })
        .finally(() => {
            pokoinAuthBridgeInFlight = null;
        });

    return pokoinAuthBridgeInFlight;
}

async function requestPokoinAuthToken() {
    if (pokoinAuthTokenRequestInFlight) {
        return pokoinAuthTokenRequestInFlight;
    }

    pokoinAuthTokenRequestInFlight = Promise.resolve()
        .then(async () => {
            const storedToken = await getStoredPokoinAuthToken();
            if (storedToken) {
                return { token: storedToken, openedBridge: false, reusedSession: true };
            }
            const startedAt = Date.now();
            await openPokoinAuthBridge();
            return {
                token: '',
                openedBridge: true,
                reusedSession: false,
                bridgeRequestMs: Date.now() - startedAt,
            };
        })
        .finally(() => {
            pokoinAuthTokenRequestInFlight = null;
        });

    return pokoinAuthTokenRequestInFlight;
}

function normalizeObservationUrl(url = '') {
    try {
        const parsed = new URL(url);
        parsed.hash = '';
        return parsed.href;
    } catch (error) {
        return String(url || '').split('#')[0];
    }
}

function buildCardmarketObservationSignature(payload = {}) {
    const structuredCard = payload.structuredCard || {};
    const match = payload.match || {};
    return [
        normalizeObservationUrl(payload.cardmarketContext?.url || ''),
        compactSearchValue(structuredCard.name || ''),
        compactSearchValue(structuredCard.collectorNumber || structuredCard.printedCollectorNumber || structuredCard.numericCollectorNumber || ''),
        compactSetValue(structuredCard.expansion || ''),
        String(match.cardId || match.card_id || match.blueprintId || match.blueprint_id || ''),
        payload.promoteVerifiedLink ? 'promote' : 'observe',
    ].join('|');
}

function cardmarketContextFromPageInfo(pageInfo = {}) {
    const context = pageInfo.debug?.cardmarketContext || {};
    return {
        url: normalizeObservationUrl(pageInfo.url || ''),
        title: pageInfo.title || '',
        hostname: pageInfo.hostname || '',
        expansion: context.expansion || pageInfo.structuredCard?.expansion || '',
        subtitle: context.subtitle || '',
        breadcrumbParts: Array.isArray(context.breadcrumbParts) ? context.breadcrumbParts : [],
    };
}

function matchFromRow(row = null) {
    if (!row) {
        return null;
    }
    return {
        cardId: row.card_id || row.blueprint_id || '',
        name: row.name || row.name_en || row.pokemon_name || '',
        expansionName: row.set_name || row.expansion_name_en || row.expansionName || '',
        collectorNumber: row.card_number || row.collector_number || row.collectorNumber || '',
        rarity: row.rarity || '',
        source: row.source || '',
        score: row.search_rank || row.search_score || row.score || null,
        pokoinPrice: row.pokoin_price || row.pokoinPrice || row.price_formatted || row.priceFormatted || '',
    };
}

function buildCardmarketObservationPayload({ pageInfo = {}, best = null, rows = [], promoteVerifiedLink = false } = {}) {
    if (!isCardmarketUrl(pageInfo.url || '')) {
        return null;
    }
    if (!best && (!Array.isArray(rows) || rows.length === 0)) {
        return null;
    }
    const structuredCard = pageInfo.structuredCard || {};
    if (!structuredCard.name && !structuredCard.collectorNumber && !structuredCard.printedCollectorNumber) {
        return null;
    }
    const match = matchFromRow(best || rows[0] || null);
    const cardmarketContext = cardmarketContextFromPageInfo(pageInfo);
    return {
        url: cardmarketContext.url,
        title: cardmarketContext.title,
        hostname: cardmarketContext.hostname,
        structuredCard,
        cardmarketContext,
        match,
        promoteVerifiedLink: Boolean(promoteVerifiedLink && match?.cardId),
        extensionVersion: EXTENSION_VERSION,
        source: 'pokemon-card-extension',
    };
}

function observeCardmarketScrapeSoon(result = {}, options = {}) {
    void observeCardmarketScrape(result, options).catch((error) => {
        console.warn('⚠️ [Background] Cardmarket observation failed:', error);
    });
}

async function persistPendingCardmarketObservation(payload) {
    pendingCardmarketObservationWrite = pendingCardmarketObservationWrite
        .catch(() => null)
        .then(async () => {
            const storage = await chrome.storage.session.get('pendingCardmarketObservations');
            const pending = Array.isArray(storage.pendingCardmarketObservations)
                ? storage.pendingCardmarketObservations
                : [];
            const signature = buildCardmarketObservationSignature(payload);
            const nextPending = [
                ...pending.filter((entry) => entry?.signature !== signature),
                {
                    signature,
                    payload,
                    queuedAt: Date.now(),
                },
            ].slice(-MAX_PENDING_CARDMARKET_OBSERVATIONS);
            await chrome.storage.session.set({ pendingCardmarketObservations: nextPending });
        });
    return pendingCardmarketObservationWrite;
}

async function sendCardmarketObservation(payload = {}) {
    const signature = buildCardmarketObservationSignature(payload);
    if (!signature || cardmarketObservationInFlight.has(signature) || cardmarketObservationSignatures.has(signature)) {
        return { success: true, deduped: true };
    }

    const token = await getStoredPokoinAuthToken();
    if (!token) {
        await persistPendingCardmarketObservation(payload);
        void requestPokoinAuthToken().catch((error) => {
            console.warn('⚠️ [Background] Unable to request Pokoin auth token for queued Cardmarket observation:', error);
        });
        return { success: false, queued: true, reason: 'missing_token' };
    }

    const requestPromise = fetch(CARDMARKET_OBSERVATION_ENDPOINT, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    })
        .then(async (response) => {
            if (response.status === 401 || response.status === 403) {
                await chrome.storage.session.set({ [POKOIN_AUTH_STORAGE_KEY]: null });
                await persistPendingCardmarketObservation(payload);
                void requestPokoinAuthToken().catch((error) => {
                    console.warn('⚠️ [Background] Unable to refresh Pokoin auth token for queued Cardmarket observation:', error);
                });
                return { success: false, queued: true, status: response.status };
            }
            if (!response.ok) {
                await persistPendingCardmarketObservation(payload);
                return { success: false, queued: true, status: response.status };
            }
            cardmarketObservationSignatures.add(signature);
            return { success: true };
        })
        .catch(async (error) => {
            await persistPendingCardmarketObservation(payload);
            return { success: false, queued: true, error: error.message || 'Observation request failed.' };
        })
        .finally(() => {
            cardmarketObservationInFlight.delete(signature);
        });

    cardmarketObservationInFlight.set(signature, requestPromise);
    return requestPromise;
}

async function flushPendingCardmarketObservations() {
    const token = await getStoredPokoinAuthToken();
    if (!token) {
        return { success: false, flushed: 0 };
    }
    const storage = await chrome.storage.session.get('pendingCardmarketObservations');
    const pending = Array.isArray(storage.pendingCardmarketObservations)
        ? storage.pendingCardmarketObservations
        : [];
    if (pending.length === 0) {
        return { success: true, flushed: 0 };
    }
    await chrome.storage.session.set({ pendingCardmarketObservations: [] });
    let flushed = 0;
    for (const entry of pending) {
        const result = await sendCardmarketObservation(entry.payload);
        if (result.success) {
            flushed += 1;
        }
    }
    return { success: true, flushed };
}

async function observeCardmarketScrape(result = {}, options = {}) {
    const payload = buildCardmarketObservationPayload({
        pageInfo: result.pageInfo,
        best: result.best,
        rows: result.rows,
        promoteVerifiedLink: options.promoteVerifiedLink,
    });
    if (!payload) {
        return { success: true, skipped: true };
    }
    return sendCardmarketObservation(payload);
}

function formatPokoinPknPrice(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return '';
    }
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)} PKN`;
}

function extractPokoinListingPrice(payload = {}) {
    if (!payload || payload.price_pkn == null) {
        return '';
    }
    return formatPokoinPknPrice(payload.price_pkn);
}

async function fetchPokoinListingPrice(cardId) {
    const stableCardId = String(cardId || '').trim();
    if (!stableCardId) {
        return '';
    }
    if (pokoinPriceCache.has(stableCardId)) {
        return pokoinPriceCache.get(stableCardId);
    }

    const pricePromise = fetch(`${CARDVAULT_API_BASE_URL}/api/marketplace-blueprint-price?blueprintId=${encodeURIComponent(stableCardId)}`, {
        headers: {
            accept: 'application/json',
        },
    })
        .then((response) => response.ok || response.status === 404 ? response.json().catch(() => null) : null)
        .then((payload) => payload ? extractPokoinListingPrice(payload) : '')
        .catch(() => '');

    pokoinPriceCache.set(stableCardId, pricePromise);
    const price = await pricePromise;
    pokoinPriceCache.set(stableCardId, price);
    return price;
}

async function enrichRowsWithPokoinPrices(rows = [], limit = 8) {
    const rowsToEnrich = rows.slice(0, limit);
    await Promise.all(rowsToEnrich.map(async (row) => {
        if (!row?.card_id || row.pokoin_price || row.pokoinPrice) {
            return;
        }
        const price = await fetchPokoinListingPrice(row.card_id);
        if (price) {
            row.pokoin_price = price;
        }
    }));
    return rows;
}

function rowsNeedPokoinPrices(rows = [], limit = 8) {
    return rows.slice(0, limit).some((row) => row?.card_id && !row.pokoin_price && !row.pokoinPrice);
}

function schedulePriceEnrichment(rows = [], onComplete = null) {
    if (!rowsNeedPokoinPrices(rows)) {
        return Promise.resolve(rows);
    }
    return enrichRowsWithPokoinPrices(rows)
        .then((enrichedRows) => {
            if (typeof onComplete === 'function') {
                return onComplete(enrichedRows);
            }
            return enrichedRows;
        })
        .catch(() => rows);
}

function stableSearchUrl(url = '') {
    try {
        const parsed = new URL(url);
        parsed.hash = '';
        parsed.search = '';
        return parsed.href.replace(/\/+$/, '');
    } catch (error) {
        return String(url || '').split('#')[0].split('?')[0].replace(/\/+$/, '');
    }
}

function vintedCanonicalCacheKey(tabId, url = '') {
    const stableUrl = stableSearchUrl(url);
    return tabId && stableUrl ? `${tabId}|${stableUrl}` : '';
}

function ebayCanonicalCacheKey(tabId, url = '') {
    const stableUrl = stableSearchUrl(url);
    return tabId && stableUrl ? `${tabId}|${stableUrl}` : '';
}

function vintedRecentCanonicalCacheKey(canonical = {}) {
    if (!canonical?.url) {
        return '';
    }
    return recentMarketplaceSearchIdentity({
        source: 'vinted',
        url: canonical.url,
        listingKey: canonical.listingKey,
        title: canonical.title,
        originalTitle: canonical.originalTitle,
        clues: canonical.clues,
        primaryClues: canonical.primaryClues,
        payload: canonical.vintedPayload,
        previewSignature: canonical.previewSignature,
        selectionRevision: canonical.selectionRevision,
    });
}

function ebayRecentCanonicalCacheKey(canonical = {}) {
    if (!canonical?.url) {
        return '';
    }
    return recentMarketplaceSearchIdentity({
        source: 'ebay',
        url: canonical.url,
        listingKey: canonical.listingKey,
        title: canonical.title,
        originalTitle: canonical.originalTitle,
        clues: canonical.clues,
        primaryClues: canonical.primaryClues,
        payload: canonical.ebayPayload,
        previewSignature: canonical.previewSignature,
        selectionRevision: canonical.selectionRevision,
    });
}

function ebayCanonicalFromPinnedState(state = {}, tab = {}) {
    const pageInfo = state?.pageInfo || {};
    if (!state?.debug?.pinnedEbayPreview || !isEbayUrl(pageInfo.url || '') || !sameUrlWithoutHash(pageInfo.url || '', tab?.url || '')) {
        return null;
    }
    return {
        tabId: tab?.id || null,
        url: pageInfo.url || tab?.url || '',
        title: pageInfo.title || tab?.title || '',
        originalTitle: pageInfo.originalTitle || tab?.title || pageInfo.title || '',
        listingKey: pageInfo.ebayPayload?.listingKey || stableSearchUrl(pageInfo.url || tab?.url || ''),
        clues: normalizeRequestClues(pageInfo.selectedClues || pageInfo.clues),
        primaryClues: normalizeRequestClues(pageInfo.primaryClues),
        ebayPayload: normalizeEbayPayload(pageInfo.ebayPayload || pageInfo.marketplacePayload),
        previewSignature: pageInfo.previewSignature || state.debug?.previewSignature || '',
        previewSource: state.debug?.previewSource || 'ebay_overlay',
        previewRows: (Array.isArray(state.rows) ? state.rows : [])
            .map(sidePanelRowFromPreview)
            .filter(Boolean),
        selectedCandidateId: pageInfo.selectedCandidateId || '',
        selectionRevision: Number(pageInfo.selectionRevision || state.debug?.selectionRevision || 0),
        updatedAt: state.updatedAt || Date.now(),
        source: 'ebay',
    };
}

function ebayCanonicalFromRequest(request = {}, senderTab = {}) {
    const url = request.url || senderTab?.url || '';
    if (!isEbayUrl(url) || (senderTab?.url && !sameUrlWithoutHash(url, senderTab.url))) {
        return null;
    }
    const ebayPayload = normalizeEbayPayload(request.ebayPayload || request.marketplacePayload);
    const previewRows = previewRowsFromRequest(request);
    if (!ebayPayload && previewRows.length === 0) {
        return null;
    }
    return {
        tabId: senderTab?.id || null,
        url,
        title: request.title || ebayPayload?.searchTitle || senderTab?.title || '',
        originalTitle: request.originalTitle || ebayPayload?.originalTitle || senderTab?.title || '',
        listingKey: request.listingKey || ebayPayload?.listingKey || stableSearchUrl(url),
        clues: ebayPayload?.selectedClues || normalizeRequestClues(request.selectedClues || request.clues),
        primaryClues: ebayPayload?.primaryClues || normalizeRequestClues(request.primaryClues),
        ebayPayload,
        previewSignature: request.previewSignature || '',
        previewSource: request.previewSource || 'ebay_overlay',
        previewRows,
        selectedCandidateId: request.selectedCandidateId || '',
        selectionRevision: Number(request.selectionRevision || ebayPayload?.selectionRevision || 0),
        updatedAt: Date.now(),
        source: 'ebay',
    };
}

function rememberEbayCanonicalPreview(canonical = null) {
    const cacheKey = ebayCanonicalCacheKey(canonical?.tabId, canonical?.url);
    if (!cacheKey) {
        return null;
    }
    latestEbayCanonicalByTabUrl.set(cacheKey, canonical);
    const recentKey = ebayRecentCanonicalCacheKey(canonical);
    if (recentKey) {
        recentSearchCacheSet(recentEbayCanonicalPreviewCache, recentKey, canonical);
    }
    return canonical;
}

function latestEbayCanonicalPreview(tab = {}, state = null) {
    const cacheKey = ebayCanonicalCacheKey(tab?.id, tab?.url || '');
    return (cacheKey && latestEbayCanonicalByTabUrl.get(cacheKey)) ||
        ebayCanonicalFromPinnedState(state, tab);
}

function latestRecentEbayCanonicalPreview(request = {}, tab = {}) {
    const canonical = ebayCanonicalFromRequest(request, tab);
    const cacheKey = ebayRecentCanonicalCacheKey(canonical);
    if (!cacheKey) {
        return null;
    }
    const cached = recentSearchCacheGet(recentEbayCanonicalPreviewCache, cacheKey);
    if (!cached?.url || !sameUrlWithoutHash(cached.url, canonical.url)) {
        return null;
    }
    return cached;
}

function vintedCanonicalFromPinnedState(state = {}, tab = {}) {
    if (!samePinnedVintedPreviewState(state, tab?.url || '')) {
        return null;
    }
    const pageInfo = state.pageInfo || {};
    return {
        tabId: tab?.id || null,
        url: pageInfo.url || tab?.url || '',
        title: pageInfo.title || tab?.title || '',
        originalTitle: pageInfo.originalTitle || tab?.title || pageInfo.title || '',
        listingKey: pageInfo.vintedPayload?.listingKey || stableSearchUrl(pageInfo.url || tab?.url || ''),
        clues: normalizeRequestClues(pageInfo.selectedClues || pageInfo.clues),
        primaryClues: normalizeRequestClues(pageInfo.primaryClues),
        vintedPayload: normalizeVintedPayload(pageInfo.vintedPayload),
        previewSignature: pageInfo.previewSignature || state.debug?.previewSignature || '',
        previewSource: state.debug?.previewSource || 'vinted_overlay',
        previewRows: (Array.isArray(state.rows) ? state.rows : [])
            .map(sidePanelRowFromPreview)
            .filter(Boolean),
        selectedCandidateId: pageInfo.selectedCandidateId || '',
        updatedAt: state.updatedAt || Date.now(),
        source: 'vinted',
    };
}

function vintedCanonicalFromRequest(request = {}, senderTab = {}) {
    const url = request.url || senderTab?.url || '';
    if (!isVintedUrl(url) || (senderTab?.url && !sameUrlWithoutHash(url, senderTab.url))) {
        return null;
    }
    const vintedPayload = normalizeVintedPayload(request.vintedPayload || request.marketplacePayload);
    const previewRows = previewRowsFromRequest(request);
    if (!vintedPayload && previewRows.length === 0) {
        return null;
    }
    return {
        tabId: senderTab?.id || null,
        url,
        title: request.title || vintedPayload?.searchTitle || senderTab?.title || '',
        originalTitle: request.originalTitle || vintedPayload?.originalTitle || senderTab?.title || '',
        listingKey: request.listingKey || vintedPayload?.listingKey || stableSearchUrl(url),
        clues: vintedPayload?.selectedClues || normalizeRequestClues(request.selectedClues || request.clues),
        primaryClues: vintedPayload?.primaryClues || normalizeRequestClues(request.primaryClues),
        vintedPayload,
        previewSignature: request.previewSignature || '',
        previewSource: request.previewSource || 'vinted_overlay',
        previewRows,
        selectedCandidateId: request.selectedCandidateId || '',
        selectionRevision: Number(request.selectionRevision || vintedPayload?.selectionRevision || 0),
        updatedAt: Date.now(),
        source: 'vinted',
    };
}

function rememberVintedCanonicalPreview(canonical = null, options = {}) {
    const cacheKey = vintedCanonicalCacheKey(canonical?.tabId, canonical?.url);
    if (!cacheKey) {
        return null;
    }
    if (options.clearWaitTimer !== false) {
        clearTimeout(vintedTokenWaitTimers.get(cacheKey));
        vintedTokenWaitTimers.delete(cacheKey);
    }
    latestVintedCanonicalByTabUrl.set(cacheKey, canonical);
    const recentKey = vintedRecentCanonicalCacheKey(canonical);
    if (recentKey) {
        recentSearchCacheSet(recentVintedCanonicalPreviewCache, recentKey, canonical);
    }
    return canonical;
}

function latestVintedCanonicalPreview(tab = {}, state = null) {
    const cacheKey = vintedCanonicalCacheKey(tab?.id, tab?.url || '');
    return (cacheKey && latestVintedCanonicalByTabUrl.get(cacheKey)) ||
        vintedCanonicalFromPinnedState(state, tab);
}

function latestRecentVintedCanonicalPreview(request = {}, tab = {}) {
    const canonical = vintedCanonicalFromRequest(request, tab);
    const cacheKey = vintedRecentCanonicalCacheKey(canonical);
    if (!cacheKey) {
        return null;
    }
    const cached = recentSearchCacheGet(recentVintedCanonicalPreviewCache, cacheKey);
    if (!cached?.url || !sameUrlWithoutHash(cached.url, canonical.url)) {
        return null;
    }
    return cached;
}

async function setVintedWaitingForPreviewState(tab = {}, reason = 'waiting-for-vinted-preview', owner = null) {
    const state = {
        updatedAt: Date.now(),
        loading: true,
        pageInfo: {
            title: tab?.title || '',
            url: tab?.url || '',
            hostname: safeUrlHostname(tab?.url),
        },
        rows: [],
        best: null,
        blueprintId: '',
        pokoinUrl: '',
        error: '',
        debug: {
            loading: true,
            waitingForVintedPreview: true,
            refreshFailureReason: reason,
        },
    };
    const writtenState = await setSidePanelState(state, owner);
    const cacheKey = vintedCanonicalCacheKey(tab?.id, tab?.url || '');
    if (cacheKey && typeof setTimeout === 'function') {
        clearTimeout(vintedTokenWaitTimers.get(cacheKey));
        const timeoutId = setTimeout(async () => {
            vintedTokenWaitTimers.delete(cacheKey);
            const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
            if (owner && !isSidePanelOwnerCurrent(owner, tab?.url || '')) {
                return;
            }
            const canonical = latestVintedCanonicalPreview(tab, sidePanelState);
            if (canonical?.previewRows?.length > 0) {
                return;
            }
            if (canonical?.vintedPayload) {
                await applyVintedCanonicalToSidePanel(tab, canonical, owner, {
                    reason: `${reason}-token-ready-timeout`,
                    forceRefresh: true,
                });
                return;
            }
            await setSidePanelState({
                updatedAt: Date.now(),
                loading: false,
                pageInfo: {
                    title: tab?.title || '',
                    url: tab?.url || '',
                    hostname: safeUrlHostname(tab?.url),
                },
                rows: [],
                best: null,
                blueprintId: '',
                pokoinUrl: '',
                error: 'Waiting for Vinted listing details.',
                debug: {
                    waitingForVintedPreview: true,
                    vintedTokenReadyTimeout: true,
                    refreshFailureReason: reason,
                },
            }, owner);
        }, VINTED_TOKEN_READY_TIMEOUT_MS);
        timeoutId?.unref?.();
        vintedTokenWaitTimers.set(cacheKey, timeoutId);
    }
    return writtenState;
}

function vintedPreviewRowIds(rows = []) {
    return marketplacePreviewRowIds(rows);
}

function isDuplicateVintedCanonicalState(state = {}, canonical = {}) {
    if (!state?.pageInfo?.url || !canonical?.url || !sameUrlWithoutHash(state.pageInfo.url, canonical.url)) {
        return false;
    }
    const stateSignature = state.pageInfo?.previewSignature || state.debug?.previewSignature || state.debug?.vintedPreviewSignature || '';
    const canonicalSignature = canonical.previewSignature || '';
    if (stateSignature && canonicalSignature && stateSignature !== canonicalSignature) {
        return false;
    }
    const stateRevision = Number(state.pageInfo?.selectionRevision || state.debug?.selectionRevision || 0);
    const canonicalRevision = Number(canonical.selectionRevision || 0);
    if (Number.isFinite(stateRevision) && Number.isFinite(canonicalRevision) && stateRevision !== canonicalRevision) {
        return false;
    }
    if (canonical.selectedCandidateId && String(state.pageInfo?.selectedCandidateId || '') !== String(canonical.selectedCandidateId)) {
        return false;
    }
    const canonicalRows = vintedPreviewRowIds(canonical.previewRows);
    if (canonicalRows) {
        return Boolean(state.debug?.pinnedVintedPreview) && vintedPreviewRowIds(state.rows) === canonicalRows;
    }
    return Boolean(state.pageInfo?.vintedPayload && state.debug?.vintedTokenReadyDriven);
}

function vintedCanonicalApplyKey(tab = {}, canonical = {}) {
    const url = stableSearchUrl(canonical?.url || tab?.url || '');
    if (!url) {
        return '';
    }
    return [
        tab?.id || canonical?.tabId || '',
        url,
        canonical?.previewSignature || '',
        canonical?.selectionRevision || 0,
        canonical?.previewSource || '',
        vintedPreviewRowIds(canonical?.previewRows || []),
        canonical?.selectedCandidateId || '',
    ].join('|');
}

function ebayCanonicalApplyKey(tab = {}, canonical = {}) {
    const url = stableSearchUrl(canonical?.url || tab?.url || '');
    if (!url) {
        return '';
    }
    return [
        tab?.id || canonical?.tabId || '',
        url,
        canonical?.previewSignature || '',
        canonical?.selectionRevision || 0,
        canonical?.previewSource || '',
        marketplacePreviewRowIds(canonical?.previewRows || []),
        canonical?.selectedCandidateId || '',
    ].join('|');
}

function isDuplicateEbayCanonicalState(state = {}, canonical = {}) {
    if (!state?.pageInfo?.url || !canonical?.url || !sameUrlWithoutHash(state.pageInfo.url, canonical.url)) {
        return false;
    }
    const stateSignature = state.pageInfo?.previewSignature || state.debug?.previewSignature || '';
    const canonicalSignature = canonical.previewSignature || '';
    if (stateSignature && canonicalSignature && stateSignature !== canonicalSignature) {
        return false;
    }
    const stateRevision = Number(state.pageInfo?.selectionRevision || state.debug?.selectionRevision || 0);
    const canonicalRevision = Number(canonical.selectionRevision || 0);
    if (Number.isFinite(stateRevision) && Number.isFinite(canonicalRevision) && stateRevision !== canonicalRevision) {
        return false;
    }
    if (canonical.selectedCandidateId && String(state.pageInfo?.selectedCandidateId || '') !== String(canonical.selectedCandidateId)) {
        return false;
    }
    const canonicalRows = marketplacePreviewRowIds(canonical.previewRows);
    return Boolean(canonicalRows && state.debug?.pinnedEbayPreview && marketplacePreviewRowIds(state.rows) === canonicalRows);
}

async function applyEbayCanonicalPreviewToSidePanel(tab = {}, canonical = {}, owner = null, options = {}) {
    if (!canonical?.url || !sameUrlWithoutHash(canonical.url, tab?.url || canonical.url)) {
        if (owner) {
            markStaleSidePanelOwner(owner, 'eBay canonical URL is stale');
        }
        return null;
    }
    const ebayPayload = normalizeEbayPayload(canonical.ebayPayload);
    const requestClues = ebayPayload?.selectedClues || normalizeRequestClues(canonical.clues);
    const requestPrimaryClues = ebayPayload?.primaryClues || normalizeRequestClues(canonical.primaryClues);
    const requestTitle = ebayPayload?.selectedClues?.length > 0
        ? buildPrimaryClueSearchTitle('', requestClues, requestPrimaryClues)
        : ebayPayload?.searchTitle ||
        buildPrimaryClueSearchTitle(canonical.originalTitle || canonical.title || tab?.title || '', requestClues, requestPrimaryClues);
    const requestStructuredCard = ebayPayload?.structuredCard || scrapeStructuredCardFields(requestTitle || '');
    const previewRows = (Array.isArray(canonical.previewRows) ? canonical.previewRows : [])
        .map(sidePanelRowFromPreview)
        .filter(Boolean)
        .slice(0, 8);
    const bestPreviewRow = canonical.selectedCandidateId
        ? previewRows.find((row) => String(row.card_id) === String(canonical.selectedCandidateId)) || previewRows[0] || null
        : previewRows[0] || null;
    const previewResult = {
        pageInfo: {
            title: requestTitle || canonical.title || tab?.title || '',
            url: canonical.url || tab?.url || '',
            hostname: safeUrlHostname(canonical.url || tab?.url),
            originalTitle: canonical.originalTitle || tab?.title || '',
            clues: requestClues,
            primaryClues: requestPrimaryClues,
            selectedClues: requestClues,
            structuredCard: requestStructuredCard,
            ebayPayload,
            marketplacePayload: ebayPayload,
            previewSignature: canonical.previewSignature || '',
            selectedCandidateId: canonical.selectedCandidateId || '',
            selectionRevision: canonical.selectionRevision || 0,
        },
        rows: previewRows,
        best: bestPreviewRow,
        blueprintId: bestPreviewRow?.card_id ? String(bestPreviewRow.card_id) : '',
        pokoinUrl: sidePanelStatePokoinUrl(bestPreviewRow),
        error: previewRows.length > 0 ? '' : 'Waiting for eBay product details.',
        debug: {
            version: 2,
            tab: {
                id: tab?.id || null,
                title: tab?.title || '',
                url: tab?.url || '',
            },
            query: requestTitle || canonical.title || tab?.title || '',
            apiBaseUrl: CARDVAULT_API_BASE_URL,
            attemptedQueries: [],
            searched: false,
            rowCount: previewRows.length,
            bestId: bestPreviewRow?.card_id ? String(bestPreviewRow.card_id) : '',
            selectedCandidateId: canonical.selectedCandidateId || '',
            pinnedPreviewRows: previewRows.length > 0,
            pinnedEbayPreview: previewRows.length > 0,
            previewSignature: canonical.previewSignature || '',
            previewSource: canonical.previewSource || 'ebay_overlay',
            selectionRevision: canonical.selectionRevision || 0,
            ebayReadyDriven: true,
            ebayCanonicalUpdatedAt: canonical.updatedAt || null,
            refreshFailureReason: options.reason || '',
            marketplacePayload: ebayPayload ? {
                source: ebayPayload.source,
                selectedChipCategories: ebayPayload.selectedChipCategories || [],
                structuredCard: requestStructuredCard,
            } : null,
            error: '',
        },
    };
    await setSidePanelState({
        updatedAt: Date.now(),
        ...previewResult,
    }, owner);
    if (previewRows.length > 0) {
        void schedulePriceEnrichment(previewRows, async (enrichedRows) => {
            if (owner && !isSidePanelOwnerCurrent(owner, canonical.url || tab?.url || '')) {
                markStaleSidePanelOwner(owner, 'eBay preview price enrichment owner no longer current');
                return enrichedRows;
            }
            const { sidePanelState: currentSidePanelState } = await chrome.storage.session.get('sidePanelState');
            if (
                !currentSidePanelState?.debug?.pinnedEbayPreview ||
                !sameUrlWithoutHash(currentSidePanelState.pageInfo?.url || '', canonical.url || tab?.url || '') ||
                String(currentSidePanelState.blueprintId || '') !== String(bestPreviewRow?.card_id || '')
            ) {
                return enrichedRows;
            }
            const enrichedBest = canonical.selectedCandidateId
                ? enrichedRows.find((row) => String(row.card_id) === String(canonical.selectedCandidateId)) || enrichedRows[0] || null
                : enrichedRows[0] || null;
            const enrichedCanonical = {
                ...canonical,
                previewRows: enrichedRows,
                updatedAt: Date.now(),
            };
            rememberEbayCanonicalPreview(enrichedCanonical);
            await setSidePanelState({
                updatedAt: Date.now(),
                ...previewResult,
                rows: enrichedRows,
                best: enrichedBest,
                blueprintId: enrichedBest?.card_id ? String(enrichedBest.card_id) : '',
                pokoinUrl: sidePanelStatePokoinUrl(enrichedBest),
                debug: {
                    ...previewResult.debug,
                    priceEnriched: true,
                },
            }, owner);
            return enrichedRows;
        });
    }
    return previewResult;
}

async function applyEbayCanonicalToSidePanel(tab = {}, canonical = {}, owner = null, options = {}) {
    const applyKey = !options.forceRefresh && !options.skipInFlightGuard ? ebayCanonicalApplyKey(tab, canonical) : '';
    if (applyKey && ebayCanonicalApplyInFlight.has(applyKey)) {
        return ebayCanonicalApplyInFlight.get(applyKey);
    }
    if (applyKey) {
        const recent = ebayCanonicalApplyRecent.get(applyKey);
        if (recent && Date.now() - recent.timestamp < 1000 && isDuplicateEbayCanonicalState(recent.result, canonical)) {
            return recent.result;
        }
    }
    const applyPromise = (async () => {
        if (!options.forceRefresh) {
            const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
            if (isDuplicateEbayCanonicalState(sidePanelState, canonical)) {
                return sidePanelState;
            }
        }
        if (canonical?.previewRows?.length > 0) {
            return applyEbayCanonicalPreviewToSidePanel(tab, canonical, owner, options);
        }
        return null;
    })();
    if (applyKey) {
        ebayCanonicalApplyInFlight.set(applyKey, applyPromise.finally(() => {
            ebayCanonicalApplyInFlight.delete(applyKey);
        }));
        return ebayCanonicalApplyInFlight.get(applyKey)
            .then((result) => {
                if (isDuplicateEbayCanonicalState(result, canonical)) {
                    ebayCanonicalApplyRecent.set(applyKey, { result, timestamp: Date.now() });
                }
                return result;
            });
    }
    return applyPromise;
}

async function resolveVintedCanonicalTokensForSidePanel(tab = {}, canonical = {}, owner = null, options = {}) {
    const vintedPayload = normalizeVintedPayload(canonical.vintedPayload);
    if (!vintedPayload) {
        return applyVintedCanonicalPreviewToSidePanel(tab, canonical, owner, options);
    }
    const tokenTab = {
        ...tab,
        url: canonical.url || tab?.url || '',
        title: canonical.title || vintedPayload.searchTitle || tab?.title || '',
    };
    return resolveActiveTabForSidePanel(tokenTab, {
        expectedUrl: canonical.url || tab?.url || '',
        originalTitle: canonical.originalTitle || vintedPayload.originalTitle || tab?.title || '',
        clues: canonical.clues || vintedPayload.selectedClues,
        primaryClues: canonical.primaryClues || vintedPayload.primaryClues,
        vintedPayload,
        owner,
        vintedTokenReadyDriven: true,
        vintedPreviewSignature: canonical.previewSignature || '',
        vintedPreviewSource: canonical.previewSource || 'vinted_overlay_tokens',
        reason: options.reason || '',
    });
}

async function applyVintedCanonicalToSidePanel(tab = {}, canonical = {}, owner = null, options = {}) {
    const applyKey = !options.forceRefresh && !options.skipInFlightGuard ? vintedCanonicalApplyKey(tab, canonical) : '';
    if (applyKey && vintedCanonicalApplyInFlight.has(applyKey)) {
        return vintedCanonicalApplyInFlight.get(applyKey);
    }
    if (applyKey) {
        const recent = vintedCanonicalApplyRecent.get(applyKey);
        if (recent && Date.now() - recent.timestamp < 1000 && isDuplicateVintedCanonicalState(recent.result, canonical)) {
            return recent.result;
        }
    }
    const applyPromise = (async () => {
    if (!options.forceRefresh) {
        const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
        if (isDuplicateVintedCanonicalState(sidePanelState, canonical)) {
            return sidePanelState;
        }
    }
    if (canonical?.previewRows?.length > 0) {
        return applyVintedCanonicalPreviewToSidePanel(tab, canonical, owner, options);
    }
    if (canonical?.vintedPayload) {
        return resolveVintedCanonicalTokensForSidePanel(tab, canonical, owner, options);
    }
    return setVintedWaitingForPreviewState(tab, options.reason || 'awaiting-vinted-tokens', owner);
    })();
    if (applyKey) {
        vintedCanonicalApplyInFlight.set(applyKey, applyPromise.finally(() => {
            vintedCanonicalApplyInFlight.delete(applyKey);
        }));
        return vintedCanonicalApplyInFlight.get(applyKey)
            .then((result) => {
                if (isDuplicateVintedCanonicalState(result, canonical)) {
                    vintedCanonicalApplyRecent.set(applyKey, { result, timestamp: Date.now() });
                }
                return result;
            });
    }
    return applyPromise;
}

async function applyVintedCanonicalPreviewToSidePanel(tab = {}, canonical = {}, owner = null, options = {}) {
    if (!canonical?.url || !sameUrlWithoutHash(canonical.url, tab?.url || canonical.url)) {
        if (owner) {
            markStaleSidePanelOwner(owner, 'Vinted canonical URL is stale');
        }
        return null;
    }
    const vintedPayload = normalizeVintedPayload(canonical.vintedPayload);
    const requestClues = vintedPayload?.selectedClues || normalizeRequestClues(canonical.clues);
    const requestPrimaryClues = vintedPayload?.primaryClues || normalizeRequestClues(canonical.primaryClues);
    const requestTitle = vintedPayload?.selectedClues?.length > 0
        ? buildPrimaryClueSearchTitle('', requestClues, requestPrimaryClues)
        : vintedPayload?.searchTitle ||
        buildPrimaryClueSearchTitle(canonical.originalTitle || canonical.title || tab?.title || '', requestClues, requestPrimaryClues);
    const requestStructuredCard = vintedPayload?.structuredCard || scrapeStructuredCardFields(requestTitle || '');
    const previewRows = (Array.isArray(canonical.previewRows) ? canonical.previewRows : [])
        .map(sidePanelRowFromPreview)
        .filter(Boolean)
        .slice(0, 8);
    const bestPreviewRow = canonical.selectedCandidateId
        ? previewRows.find((row) => String(row.card_id) === String(canonical.selectedCandidateId)) || previewRows[0] || null
        : previewRows[0] || null;
    const previewResult = {
        pageInfo: {
            title: requestTitle || canonical.title || tab?.title || '',
            url: canonical.url || tab?.url || '',
            hostname: safeUrlHostname(canonical.url || tab?.url),
            originalTitle: canonical.originalTitle || tab?.title || '',
            clues: requestClues,
            primaryClues: requestPrimaryClues,
            selectedClues: requestClues,
            structuredCard: requestStructuredCard,
            vintedPayload,
            previewSignature: canonical.previewSignature || '',
            selectedCandidateId: canonical.selectedCandidateId || '',
            selectionRevision: canonical.selectionRevision || 0,
        },
        rows: previewRows,
        best: bestPreviewRow,
        blueprintId: bestPreviewRow?.card_id ? String(bestPreviewRow.card_id) : '',
        pokoinUrl: sidePanelStatePokoinUrl(bestPreviewRow),
        error: previewRows.length > 0 ? '' : 'Waiting for Vinted product details.',
        debug: {
            version: 2,
            tab: {
                id: tab?.id || null,
                title: tab?.title || '',
                url: tab?.url || '',
            },
            query: requestTitle || canonical.title || tab?.title || '',
            apiBaseUrl: CARDVAULT_API_BASE_URL,
            attemptedQueries: [],
            searched: false,
            rowCount: previewRows.length,
            bestId: bestPreviewRow?.card_id ? String(bestPreviewRow.card_id) : '',
            selectedCandidateId: canonical.selectedCandidateId || '',
            pinnedPreviewRows: previewRows.length > 0,
            pinnedVintedPreview: previewRows.length > 0,
            previewSignature: canonical.previewSignature || '',
            previewSource: canonical.previewSource || 'vinted_overlay',
            selectionRevision: canonical.selectionRevision || 0,
            vintedReadyDriven: true,
            vintedCanonicalUpdatedAt: canonical.updatedAt || null,
            refreshFailureReason: options.reason || '',
            vintedPayload: vintedPayload ? {
                selectedChipCategories: vintedPayload.selectedChipCategories || [],
                structuredCard: requestStructuredCard,
            } : null,
            error: '',
        },
    };
    await setSidePanelState({
        updatedAt: Date.now(),
        ...previewResult,
    }, owner);
    if (previewRows.length > 0) {
        void schedulePriceEnrichment(previewRows, async (enrichedRows) => {
            if (owner && !isSidePanelOwnerCurrent(owner, canonical.url || tab?.url || '')) {
                markStaleSidePanelOwner(owner, 'Vinted preview price enrichment owner no longer current');
                return enrichedRows;
            }
            const { sidePanelState: currentSidePanelState } = await chrome.storage.session.get('sidePanelState');
            if (
                !currentSidePanelState?.debug?.pinnedVintedPreview ||
                !sameUrlWithoutHash(currentSidePanelState.pageInfo?.url || '', canonical.url || tab?.url || '') ||
                String(currentSidePanelState.blueprintId || '') !== String(bestPreviewRow?.card_id || '')
            ) {
                return enrichedRows;
            }
            const enrichedBest = canonical.selectedCandidateId
                ? enrichedRows.find((row) => String(row.card_id) === String(canonical.selectedCandidateId)) || enrichedRows[0] || null
                : enrichedRows[0] || null;
            const enrichedCanonical = {
                ...canonical,
                previewRows: enrichedRows,
                updatedAt: Date.now(),
            };
            rememberVintedCanonicalPreview(enrichedCanonical);
            await setSidePanelState({
                updatedAt: Date.now(),
                ...previewResult,
                rows: enrichedRows,
                best: enrichedBest,
                blueprintId: enrichedBest?.card_id ? String(enrichedBest.card_id) : '',
                pokoinUrl: sidePanelStatePokoinUrl(enrichedBest),
                debug: {
                    ...previewResult.debug,
                    priceEnriched: true,
                },
            }, owner);
            return enrichedRows;
        });
    }
    return previewResult;
}

function buildBackgroundSearchSignature({ title = '', originalTitle = '', clues = [], primaryClues = [], url = '' } = {}) {
    return [
        stableSearchUrl(url),
        compactSearchValue(title),
        compactSearchValue(originalTitle),
        normalizeRequestClues(clues).map(compactSearchValue).sort().join(','),
        normalizeRequestClues(primaryClues).map(compactSearchValue).sort().join(','),
    ].join('|');
}

function buildBackgroundRecentSearchKey({
    title = '',
    originalTitle = '',
    clues = [],
    primaryClues = [],
    url = '',
    payload = null,
    previewSignature = '',
    selectionRevision = '',
} = {}) {
    const marketplacePayload = normalizeMarketplacePayload(payload);
    if (marketplacePayload) {
        return recentMarketplaceSearchIdentity({
            source: marketplacePayload.source,
            url,
            listingKey: marketplacePayload.listingKey,
            title,
            originalTitle,
            clues,
            primaryClues,
            payload: marketplacePayload,
            previewSignature,
            selectionRevision,
        });
    }
    return [
        'background',
        buildBackgroundSearchSignature({ title, originalTitle, clues, primaryClues, url }),
    ].join('|');
}

async function scheduleSidePanelRefresh(tab, reason = 'navigation') {
    await ensureRuntimeStorageCurrent();
    if (!tab?.id || !isSupportedMarketplaceUrl(tab.url)) {
        return;
    }

    const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
    const currentStateUrl = sidePanelState?.pageInfo?.url || '';
    if (isVintedUrl(tab.url)) {
        const owner = createSidePanelRequestOwner(tab, reason);
        clearTimeout(sidePanelRefreshTimers.get(tab.id));
        sidePanelRefreshTimers.delete(tab.id);
        const canonical = latestVintedCanonicalPreview(tab, sidePanelState);
        if (canonical?.vintedPayload || canonical?.previewRows?.length > 0) {
            await applyVintedCanonicalToSidePanel(tab, canonical, owner, { reason });
            return;
        }
        await setVintedWaitingForPreviewState(tab, reason, owner);
        return;
    }
    if (isEbayUrl(tab.url)) {
        const canonical = latestEbayCanonicalPreview(tab, sidePanelState);
        if (canonical?.previewRows?.length > 0) {
            const owner = createSidePanelRequestOwner(tab, reason);
            clearTimeout(sidePanelRefreshTimers.get(tab.id));
            sidePanelRefreshTimers.delete(tab.id);
            await applyEbayCanonicalToSidePanel(tab, canonical, owner, { reason });
            return;
        }
    }
    if (isCardTraderDirectUrl(tab.url)) {
        clearTimeout(sidePanelRefreshTimers.get(tab.id));
        sidePanelRefreshTimers.delete(tab.id);
        if (isLockedCardTraderDirectState(sidePanelState, tab.url)) {
            rememberCardTraderDirectState(sidePanelState);
            return;
        }
        const owner = createSidePanelRequestOwner(tab, reason);
        const cached = latestRecentCardTraderDirectState(tab, sidePanelState);
        if (cached && !reason.includes('force')) {
            await applyCardTraderDirectCachedState(tab, cached, owner, { reason });
            return;
        }
        await resolveActiveTabForSidePanel(tab, { expectedUrl: tab.url || '', owner });
        return;
    }
    if (isLockedCardTraderDirectState(sidePanelState, tab.url)) {
        clearTimeout(sidePanelRefreshTimers.get(tab.id));
        sidePanelRefreshTimers.delete(tab.id);
        return;
    }
    if (samePinnedVintedPreviewState(sidePanelState, tab.url)) {
        clearTimeout(sidePanelRefreshTimers.get(tab.id));
        sidePanelRefreshTimers.delete(tab.id);
        return;
    }
    if (currentStateUrl && sameUrlWithoutHash(currentStateUrl, tab.url)) {
        return;
    }

    const owner = createSidePanelRequestOwner(tab, reason);
    const scheduledUrl = tab.url || '';
    sidePanelRefreshTimers.set(tab.id, setTimeout(async () => {
        sidePanelRefreshTimers.delete(tab.id);
        try {
            const latestTab = chrome.tabs?.get ? await chrome.tabs.get(tab.id).catch(() => tab) : tab;
            const refreshTab = latestTab?.id ? latestTab : tab;
            if (!sameUrlWithoutHash(scheduledUrl, refreshTab.url || '') || !isSidePanelOwnerCurrent(owner, refreshTab.url || scheduledUrl)) {
                markStaleSidePanelOwner(owner, 'scheduled tab URL changed');
                return;
            }

            const { sidePanelState: latestSidePanelState } = await chrome.storage.session.get('sidePanelState');
            if (isLockedCardTraderDirectState(latestSidePanelState, refreshTab.url || scheduledUrl)) {
                return;
            }
            if (samePinnedVintedPreviewState(latestSidePanelState, refreshTab.url || scheduledUrl)) {
                return;
            }
            if (isEbayUrl(refreshTab.url || scheduledUrl)) {
                const canonical = latestEbayCanonicalPreview(refreshTab, latestSidePanelState);
                if (canonical?.previewRows?.length > 0) {
                    await applyEbayCanonicalToSidePanel(refreshTab, canonical, owner, { reason });
                    return;
                }
            }

            await setSidePanelState({
                ...(latestSidePanelState || {}),
                updatedAt: Date.now(),
                loading: true,
                pageInfo: {
                    ...(latestSidePanelState?.pageInfo || {}),
                    title: refreshTab.title || '',
                    url: refreshTab.url || '',
                    hostname: safeUrlHostname(refreshTab.url),
                },
                error: '',
                rows: [],
                best: null,
                blueprintId: '',
                pokoinUrl: '',
                debug: {
                    loading: true,
                },
            }, owner);
            await resolveActiveTabForSidePanel(refreshTab, { expectedUrl: scheduledUrl, owner });
            console.log(`✅ [Background] Side panel refreshed after ${reason} #${owner.requestId}`);
        } catch (error) {
            console.warn(`⚠️ [Background] Side panel refresh failed after ${reason}:`, error);
            await setSidePanelState({
                updatedAt: Date.now(),
                pageInfo: {
                    title: tab?.title || '',
                    url: scheduledUrl || tab?.url || '',
                    hostname: safeUrlHostname(scheduledUrl || tab?.url),
                },
                rows: [],
                best: null,
                blueprintId: '',
                pokoinUrl: '',
                error: error.message || 'Unable to refresh active tab match.',
                debug: {
                    error: true,
                    refreshFailureReason: reason,
                },
            }, owner);
        }
    }, 700));
}

async function resolveActiveTabForSidePanel(tab, requestContext = {}) {
    await ensureRuntimeStorageCurrent();
    const resolveStartedAt = Date.now();
    const owner = requestContext.owner || null;
    const { sidePanelState: existingSidePanelState } = await chrome.storage.session.get('sidePanelState');
    if (
        !requestContext.forceRefresh &&
        samePinnedVintedPreviewState(existingSidePanelState, tab?.url || '') &&
        (!owner || ['activated', 'tab-complete', 'tab-url', 'content-navigation', 'action-click', 'refresh'].includes(owner.reason || ''))
    ) {
        return existingSidePanelState;
    }
    if (
        !requestContext.forceRefresh &&
        isDuplicateEbayCanonicalState(existingSidePanelState, latestEbayCanonicalPreview(tab, existingSidePanelState) || {}) &&
        (!owner || ['activated', 'tab-complete', 'tab-url', 'content-navigation', 'action-click', 'refresh'].includes(owner.reason || ''))
    ) {
        return existingSidePanelState;
    }
    if (!requestContext.forceRefresh && isCardTraderDirectUrl(tab?.url || '')) {
        const cachedCardTraderState = latestRecentCardTraderDirectState(tab, existingSidePanelState);
        if (cachedCardTraderState) {
            if (isDuplicateCardTraderDirectState(existingSidePanelState, cachedCardTraderState)) {
                return existingSidePanelState;
            }
            const cachedResult = await applyCardTraderDirectCachedState(tab, cachedCardTraderState, owner, {
                reason: requestContext.reason || owner?.reason || 'resolve-cardtrader-direct-cache',
            });
            if (cachedResult) {
                return cachedResult;
            }
        }
    }
    const phaseTimings = {};
    let phaseStartedAt = resolveStartedAt;
    const markPhase = (name) => {
        phaseTimings[name] = Date.now() - phaseStartedAt;
        phaseStartedAt = Date.now();
    };
    const requestClues = normalizeRequestClues(requestContext.clues);
    const requestPrimaryClues = normalizeRequestClues(requestContext.primaryClues);
    const marketplacePayload = normalizeMarketplacePayload(requestContext.vintedPayload || requestContext.ebayPayload || requestContext.marketplacePayload);
    const effectiveRequestClues = marketplacePayload?.selectedClues || requestClues;
    const effectivePrimaryClues = marketplacePayload?.primaryClues || requestPrimaryClues;
    let pageInfo;
    let pageInfoError = '';
    if (marketplacePayload) {
        const hasSelectedMarketplaceClues = marketplacePayload.selectedClues?.length > 0;
        const originalTitle = requestContext.originalTitle || marketplacePayload.originalTitle || tab?.title || '';
        const selectedTitle = hasSelectedMarketplaceClues
            ? buildPrimaryClueSearchTitle('', effectiveRequestClues, effectivePrimaryClues)
            : '';
        pageInfo = {
            title: selectedTitle || marketplacePayload.searchTitle || buildPrimaryClueSearchTitle(originalTitle, effectiveRequestClues, effectivePrimaryClues),
            url: tab?.url || marketplacePayload.listingKey || '',
            hostname: tab?.url ? new URL(tab.url).hostname : '',
            originalTitle,
            clues: effectiveRequestClues,
            primaryClues: effectivePrimaryClues,
            selectedClues: effectiveRequestClues,
            structuredCard: marketplacePayload.structuredCard,
            vintedPayload: marketplacePayload.source === 'vinted' ? marketplacePayload : null,
            ebayPayload: marketplacePayload.source === 'ebay' ? marketplacePayload : null,
            marketplacePayload,
        };
    } else {
        try {
            pageInfo = await getActivePageInfo(tab);
        } catch (error) {
            pageInfoError = error.message || 'Unable to read marketplace page.';
            pageInfo = {
                title: tab?.title || '',
                url: tab?.url || '',
                hostname: tab?.url ? new URL(tab.url).hostname : '',
                structuredCard: scrapeStructuredCardFields(tab?.title || ''),
            };
        }
    }
    markPhase('pageInfoMs');
    if (owner && !isSidePanelOwnerCurrent(owner, pageInfo.url || tab?.url || '')) {
        markStaleSidePanelOwner(owner, 'page info behind current side panel owner');
        return { pageInfo, rows: [], best: null, blueprintId: '', pokoinUrl: '', error: pageInfoError, debug: sidePanelOwnerDebug(owner), stale: true };
    }
    if (effectiveRequestClues.length > 0) {
        const originalTitle = requestContext.originalTitle || pageInfo.title || tab?.title || '';
        pageInfo.originalTitle = originalTitle;
        pageInfo.clues = effectiveRequestClues;
        pageInfo.primaryClues = effectivePrimaryClues;
        pageInfo.selectedClues = effectiveRequestClues;
        pageInfo.title = marketplacePayload?.source && effectiveRequestClues.length > 0
            ? buildPrimaryClueSearchTitle('', effectiveRequestClues, effectivePrimaryClues)
            : (marketplacePayload?.searchTitle || buildPrimaryClueSearchTitle(originalTitle, effectiveRequestClues, effectivePrimaryClues));
        pageInfo.structuredCard = marketplacePayload?.structuredCard || scrapeStructuredCardFields(pageInfo.title, cardmarketContextFromRequest({ clues: effectiveRequestClues }, pageInfo.url || tab?.url || ''));
        pageInfo.vintedPayload = marketplacePayload?.source === 'vinted' ? marketplacePayload : null;
        pageInfo.ebayPayload = marketplacePayload?.source === 'ebay' ? marketplacePayload : null;
        pageInfo.marketplacePayload = marketplacePayload;
    }
    let rows = [];
    let error = pageInfoError;
    const debug = {
        version: 2,
        ...runtimeDebugMetadata(),
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
        error,
        phaseTimings,
        vintedTokenReadyDriven: Boolean(requestContext.vintedTokenReadyDriven),
        vintedPreviewSignature: requestContext.vintedPreviewSignature || '',
        vintedPreviewSource: requestContext.vintedPreviewSource || '',
    };

    if (!pageInfo.unsupported && pageInfo.title) {
        try {
            debug.searched = true;
            if (pageInfo.cardtraderBlueprintId) {
                const directName = cleanCardTraderDirectName(
                    pageInfo.title || pageInfo.structuredCard?.name,
                    pageInfo.url,
                    pageInfo.cardtraderBlueprintId
                );
                pageInfo.title = directName;
                pageInfo.structuredCard = {
                    ...(pageInfo.structuredCard || {}),
                    name: directName,
                    searchName: directName,
                };
                rows = [{
                    card_id: pageInfo.cardtraderBlueprintId,
                    name: directName,
                    set_name: pageInfo.structuredCard?.expansion || '',
                    card_number: pageInfo.structuredCard?.collectorNumber || '',
                    source: 'cardtrader_url',
                    search_rank: 999999,
                }];
                debug.cardtraderBlueprintId = pageInfo.cardtraderBlueprintId;
            } else {
                let exactIdentity = hasExactStructuredIdentity(pageInfo.structuredCard);
                let exactFastPath = hasExactSearchFastPath(pageInfo.structuredCard);
                const nameResolutionTitle = titleForNameResolution(
                    pageInfo.title,
                    marketplacePayload?.source && effectiveRequestClues.length > 0 ? '' : (pageInfo.originalTitle || tab?.title || ''),
                    pageInfo.clues
                );
                const nameResolutionOptions = {
                    source: marketplacePayload?.source || (isCardmarketUrl(pageInfo.url) ? 'cardmarket' : 'marketplace'),
                    clues: effectiveRequestClues,
                    primaryClues: effectivePrimaryClues,
                    title: nameResolutionTitle,
                    selectedClueSignature: selectedClueSignature(effectiveRequestClues, effectivePrimaryClues),
                };
                if (shouldResolveNameBeforeExactSearch(pageInfo.structuredCard, nameResolutionOptions)) {
                    try {
                        const promotedResolution = await promoteStructuredNameFromCardvaultTitle(
                            nameResolutionTitle,
                            pageInfo.structuredCard,
                            nameResolutionOptions
                        );
                        debug.nameResolution = promotedResolution.nameResolution;
                        if (promotedResolution.applied) {
                            pageInfo.structuredCard = promotedResolution.structuredCard;
                            exactIdentity = hasExactStructuredIdentity(pageInfo.structuredCard);
                            exactFastPath = hasExactSearchFastPath(pageInfo.structuredCard);
                        }
                    } catch (nameResolutionError) {
                        debug.nameResolution = {
                            source: 'marketplace_card_names_for_language',
                            error: nameResolutionError.message || 'Card name resolution failed.',
                        };
                    }
                    markPhase('preExactNameResolutionMs');
                }
                if (exactFastPath) {
                    try {
                        const extensionSearchResult = await searchExtensionCard(pageInfo.structuredCard);
                        rows = extensionSearchResult.rows;
                        debug.extensionSearch = extensionSearchResult.debug;
                        debug.exactStructuredFastPath = true;
                    } catch (extensionSearchError) {
                        debug.extensionSearch = {
                            endpoint: '/api/extension-card-search',
                            error: extensionSearchError.message || 'Extension card search failed.',
                        };
                    }
                    markPhase('extensionSearchMs');
                }

                if (!hasGoodEnoughExactRows(rows, pageInfo.structuredCard)) {
                    if (shouldUseCollectorFirstRecovery(pageInfo.structuredCard)) {
                        try {
                            const collectorRecovery = await searchExtensionCard(collectorOnlyStructuredCard(pageInfo.structuredCard));
                            if (collectorRecovery.rows.length > 0) {
                                pageInfo.structuredCard = inferStructuredNameFromCollectorRows(pageInfo.structuredCard, collectorRecovery.rows);
                                rows = mergeAndRankStructuredRows(rows, collectorRecovery.rows, pageInfo.structuredCard);
                                debug.collectorNumberFirstRecovery = collectorRecovery.debug;
                            }
                        } catch (collectorRecoveryError) {
                            debug.collectorNumberFirstRecovery = {
                                endpoint: '/api/extension-card-search',
                                error: collectorRecoveryError.message || 'Collector recovery failed.',
                            };
                        }
                    }
                    try {
                        const nameResolution = debug.nameResolution?.name
                            ? debug.nameResolution
                            : await resolveNameFromCardvaultTitle(
                            nameResolutionTitle,
                            pageInfo.structuredCard,
                            nameResolutionOptions
                        );
                        debug.nameResolution = nameResolution;
                        if (shouldUseResolvedCardName(nameResolution.name, pageInfo.structuredCard)) {
                            pageInfo.structuredCard = {
                                ...(pageInfo.structuredCard || {}),
                                name: nameResolution.name,
                            };
                            pageInfo.structuredCard.searchName = searchNameWithVariation(nameResolution.name, pageInfo.structuredCard.variation || '');
                        }
                    } catch (nameResolutionError) {
                        debug.nameResolution = {
                            source: 'marketplace_card_names_for_language',
                            error: nameResolutionError.message || 'Card name resolution failed.',
                        };
                    }
                    markPhase('nameResolutionMs');

                    if (!exactFastPath || rows.length === 0) {
                        try {
                            const extensionSearchResult = await searchExtensionCard(pageInfo.structuredCard);
                            rows = mergeAndRankStructuredRows(rows, extensionSearchResult.rows, pageInfo.structuredCard);
                            debug.extensionSearch = extensionSearchResult.debug;
                        } catch (extensionSearchError) {
                            debug.extensionSearch = {
                                endpoint: '/api/extension-card-search',
                                error: extensionSearchError.message || 'Extension card search failed.',
                            };
                        }
                        markPhase('extensionSearchAfterResolutionMs');
                    }
                }

                if (shouldRunAutocompleteFallback(rows, pageInfo.structuredCard)) {
                    try {
                        const searchResult = exactIdentity
                            ? await searchCardvaultForStructuredCard(pageInfo.title, pageInfo.structuredCard)
                            : await searchCardvault(pageInfo.title, pageInfo.structuredCard?.searchName || pageInfo.structuredCard?.name || '');
                        rows = mergeAndRankStructuredRows(rows, searchResult.rows, pageInfo.structuredCard);
                        debug.attemptedQueries = searchResult.debug.attemptedQueries;
                    } catch (fallbackError) {
                        debug.autocompleteFallback = {
                            error: fallbackError.message || 'Autocomplete fallback failed.',
                            preservedRowCount: rows.length,
                        };
                        if (rows.length === 0) {
                            error = fallbackError.message || 'Cardvault search failed.';
                        }
                    }
                    markPhase('autocompleteFallbackMs');
                }
            }
        } catch (searchError) {
            error = searchError.message || 'Cardvault search failed.';
            debug.error = error;
        }
    }

    const best = rows[0] || null;
    const blueprintId = best?.card_id ? String(best.card_id) : '';
    const pokoinUrl = sidePanelStatePokoinUrl(best);
    debug.rowCount = rows.length;
    debug.bestId = blueprintId;
    debug.phaseTimings.totalMs = Date.now() - resolveStartedAt;
    debug.sidePanelRequestId = owner?.requestId || null;
    debug.sidePanelReason = owner?.reason || '';

    if (requestContext.expectedUrl && !sameUrlWithoutHash(requestContext.expectedUrl, pageInfo.url || tab?.url || '')) {
        console.log('ℹ️ [Background] Ignored stale side panel refresh for changed tab URL');
        if (owner) {
            markStaleSidePanelOwner(owner, 'expected URL changed');
        }
        return { pageInfo, rows, best, blueprintId, pokoinUrl, error, debug, stale: true };
    }

    if (owner && !isSidePanelOwnerCurrent(owner, pageInfo.url || tab?.url || '')) {
        markStaleSidePanelOwner(owner, 'result behind current side panel owner');
        return { pageInfo, rows, best, blueprintId, pokoinUrl, error, debug, stale: true };
    }

    const { sidePanelState: latestSidePanelState } = await chrome.storage.session.get('sidePanelState');
    const latestStateUrl = latestSidePanelState?.pageInfo?.url || '';
    if (
        latestSidePanelState?.updatedAt > resolveStartedAt &&
        latestStateUrl &&
        !sameUrlWithoutHash(latestStateUrl, pageInfo.url || tab?.url || '') &&
        isSupportedMarketplaceUrl(latestStateUrl)
    ) {
        console.log('ℹ️ [Background] Ignored stale side panel result behind newer page state');
        if (owner) {
            markStaleSidePanelOwner(owner, 'newer page state exists');
        }
        return { pageInfo, rows, best, blueprintId, pokoinUrl, error, debug, stale: true };
    }
    if (
        isLockedCardTraderDirectState(latestSidePanelState, latestStateUrl) &&
        !pageInfo.cardtraderBlueprintId &&
        !sameCardTraderDirectBlueprint(latestStateUrl, pageInfo.url || tab?.url || '')
    ) {
        console.log('ℹ️ [Background] Ignored stale refresh behind CardTrader direct state');
        if (owner) {
            markStaleSidePanelOwner(owner, 'CardTrader direct state owns panel');
        }
        return { pageInfo, rows, best, blueprintId, pokoinUrl, error, debug, stale: true };
    }

    await setSidePanelState({
        updatedAt: Date.now(),
        pageInfo,
        rows,
        best,
        blueprintId,
        pokoinUrl,
        error,
        debug,
    }, owner);

    if (pageInfo.cardtraderBlueprintId) {
        return { pageInfo, rows, best, blueprintId, pokoinUrl, error, debug };
    }

    void schedulePriceEnrichment(rows, async (enrichedRows) => {
        if (owner && !isSidePanelOwnerCurrent(owner, pageInfo.url || tab?.url || '')) {
            markStaleSidePanelOwner(owner, 'price enrichment owner no longer current');
            return enrichedRows;
        }
        const { sidePanelState: currentSidePanelState } = await chrome.storage.session.get('sidePanelState');
        const currentUrl = currentSidePanelState?.pageInfo?.url || '';
        const currentBlueprintId = currentSidePanelState?.blueprintId || currentSidePanelState?.best?.card_id || '';
        if (
            !sameUrlWithoutHash(currentUrl, pageInfo.url || tab?.url || '') ||
            String(currentBlueprintId || '') !== String(blueprintId || '')
        ) {
            return enrichedRows;
        }
        const enrichedBest = enrichedRows[0] || null;
        await setSidePanelState({
            updatedAt: Date.now(),
            pageInfo,
            rows: enrichedRows,
            best: enrichedBest,
            blueprintId,
            pokoinUrl,
            error,
            debug: {
                ...debug,
                priceEnriched: true,
            },
        }, owner);
    });

    observeCardmarketScrapeSoon({ pageInfo, rows, best, blueprintId, pokoinUrl, error, debug }, {
        promoteVerifiedLink: Boolean(requestContext.promoteVerifiedLink),
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
    } else if (request.action === 'getRuntimeInfo') {
        ensureRuntimeStorageCurrent()
            .then(() => sendResponse({ success: true, runtime: runtimeDebugMetadata() }))
            .catch((error) => sendResponse({ success: false, error: error.message || 'Unable to read runtime info.' }));
    } else if (request.action === 'toggleExtension') {
        // Implement extension enable/disable logic
        sendResponse({ success: true });
    } else if (request.action === 'pokoinAuthTokenReceived') {
        storePokoinAuthToken(request.tokenMessage)
            .then(async (result) => {
                if (result.valid) {
                    await flushPendingCardmarketObservations();
                    await closeTrackedPokoinAuthBridgeTab();
                    sendResponse({ success: true });
                    return;
                }
                sendResponse({ success: false, error: result.error || 'Invalid Pokoin auth token.' });
            })
            .catch((error) => {
                sendResponse({ success: false, error: error.message || 'Unable to store Pokoin auth token.' });
            });
    } else if (request.action === 'requestPokoinAuthToken') {
        requestPokoinAuthToken()
            .then((result) => sendResponse({ success: true, ...result }))
            .catch((error) => sendResponse({ success: false, error: error.message || 'Unable to request Pokoin auth token.' }));
    } else if (request.action === 'resolveActiveTabForSidePanel') {
        getActiveTab()
            .then(async (tab) => {
                if (!tab) {
                    throw new Error('No active tab found.');
                }
                const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
                if (isVintedUrl(tab.url || '')) {
                    const canonical = latestVintedCanonicalPreview(tab, sidePanelState);
                    if (canonical?.vintedPayload || canonical?.previewRows?.length > 0) {
                        const owner = createSidePanelRequestOwner(tab, request.forceRefresh ? 'refresh-vinted-canonical' : 'resolve-vinted-canonical');
                        return applyVintedCanonicalToSidePanel(tab, canonical, owner, {
                            reason: request.forceRefresh ? 'side-panel-refresh' : 'resolve-active-tab',
                            forceRefresh: Boolean(request.forceRefresh),
                        });
                    }
                    const owner = createSidePanelRequestOwner(tab, request.forceRefresh ? 'refresh-vinted-waiting' : 'resolve-vinted-waiting');
                    await setVintedWaitingForPreviewState(tab, request.forceRefresh ? 'side-panel-refresh-awaiting-vinted-preview' : 'awaiting-vinted-preview', owner);
                    return {
                        pageInfo: {
                            title: tab.title || '',
                            url: tab.url || '',
                            hostname: safeUrlHostname(tab.url),
                        },
                        rows: [],
                        best: null,
                        blueprintId: '',
                        pokoinUrl: '',
                        error: '',
                        loading: true,
                        debug: sidePanelOwnerDebug(owner, {
                            waitingForVintedPreview: true,
                            searched: false,
                        }),
                    };
                }
                if (isEbayUrl(tab.url || '')) {
                    const canonical = latestEbayCanonicalPreview(tab, sidePanelState);
                    if (canonical?.previewRows?.length > 0 && !request.forceRefresh) {
                        const owner = createSidePanelRequestOwner(tab, 'resolve-ebay-canonical');
                        return applyEbayCanonicalToSidePanel(tab, canonical, owner, {
                            reason: 'resolve-active-tab',
                        });
                    }
                }
                return resolveActiveTabForSidePanel(tab, {
                    forceRefresh: Boolean(request.forceRefresh),
                    clues: request.clues,
                    primaryClues: request.primaryClues,
                    vintedPayload: request.vintedPayload || request.ebayPayload || request.marketplacePayload,
                });
            })
            .then((result) => sendResponse({ success: true, result }))
            .catch((error) => {
                sendResponse({ success: false, error: error.message || 'Unable to refresh match.' });
            });
    } else if (request.action === 'searchCardForTitle') {
        ensureRuntimeStorageCurrent()
            .then(() => {
                const tab = sender.tab;
                const directCardTraderBlueprintId = cardtraderBlueprintIdFromUrl(request.url || tab?.url || '');
                const marketplacePayload = normalizeMarketplacePayload(request.vintedPayload || request.ebayPayload || request.marketplacePayload);
                const isSelectedOverlaySearch = ['vinted', 'ebay'].includes(marketplacePayload?.source) && marketplacePayload.selectedClues?.length > 0;
                const clues = marketplacePayload?.selectedClues || normalizeRequestClues(request.selectedClues || request.clues);
                const primaryClues = marketplacePayload?.primaryClues || normalizeRequestClues(request.primaryClues);
                const title = isSelectedOverlaySearch
                    ? buildPrimaryClueSearchTitle('', clues, primaryClues)
                    : (marketplacePayload?.searchTitle || buildPrimaryClueSearchTitle(request.originalTitle || request.title || tab?.title || '', clues, primaryClues));
                const requestUrl = request.url || tab?.url || '';
                const searchSignature = buildBackgroundSearchSignature({
                    title,
                    originalTitle: request.originalTitle || request.title || tab?.title || '',
                    clues,
                    primaryClues,
                    url: requestUrl,
                });
                const recentSearchKey = buildBackgroundRecentSearchKey({
                    title,
                    originalTitle: request.originalTitle || request.title || tab?.title || '',
                    clues,
                    primaryClues,
                    url: requestUrl,
                    payload: marketplacePayload,
                    previewSignature: request.previewSignature || '',
                    selectionRevision: request.selectionRevision ?? marketplacePayload?.selectionRevision ?? '',
                });
                const cachedResults = recentSearchCacheGet(backgroundSearchResultCache, recentSearchKey);
                if (cachedResults && !request.forceRefresh) {
                    sendResponse({ success: true, results: cachedResults });
                    return;
                }
                if (!backgroundSearchInFlight.has(recentSearchKey)) {
                    backgroundSearchInFlight.set(recentSearchKey, Promise.resolve()
                .then(async () => {
                    if (directCardTraderBlueprintId) {
                        const directName = cleanCardTraderDirectName(title || tab?.title || '', request.url || tab?.url || '', directCardTraderBlueprintId);
                        return [legacyResultFromRow({
                            card_id: directCardTraderBlueprintId,
                            name: directName,
                            source: 'cardtrader_url',
                            search_rank: 999999,
                        })];
                    }
                    if (!title) {
                        return [];
                    }
                    const cardmarketContext = cardmarketContextFromRequest(request, requestUrl);
                    const structuredCard = marketplacePayload?.structuredCard || scrapeStructuredCardFields(title, cardmarketContext);
                    let exactIdentity = hasExactStructuredIdentity(structuredCard);
                    let exactFastPath = hasExactSearchFastPath(structuredCard);
                    let rows = [];
                    let searchResult = null;
                    let preExactNameResolution = null;
                    const nameResolutionTitle = titleForNameResolution(title, isSelectedOverlaySearch ? '' : (request.originalTitle || tab?.title || ''), [...clues, ...primaryClues]);
                    const nameResolutionOptions = {
                        source: marketplacePayload?.source || (isCardmarketUrl(requestUrl) ? 'cardmarket' : 'marketplace'),
                        clues,
                        primaryClues,
                        title: nameResolutionTitle,
                        selectedClueSignature: selectedClueSignature(clues, primaryClues),
                    };
                    if (shouldResolveNameBeforeExactSearch(structuredCard, nameResolutionOptions)) {
                        const promotedResolution = await promoteStructuredNameFromCardvaultTitle(
                            nameResolutionTitle,
                            structuredCard,
                            nameResolutionOptions
                        );
                        preExactNameResolution = promotedResolution.nameResolution;
                        if (promotedResolution.applied) {
                            Object.assign(structuredCard, promotedResolution.structuredCard);
                            exactIdentity = hasExactStructuredIdentity(structuredCard);
                            exactFastPath = hasExactSearchFastPath(structuredCard);
                        }
                    }
                    if (exactFastPath) {
                        searchResult = await searchExtensionCard(structuredCard);
                        rows = searchResult.rows;
                    }

                    if (rows.length === 0 || (exactIdentity && !hasGoodEnoughExactRows(rows, structuredCard))) {
                        if (shouldUseCollectorFirstRecovery(structuredCard)) {
                            try {
                                const collectorRecovery = await searchExtensionCard(collectorOnlyStructuredCard(structuredCard));
                                if (collectorRecovery.rows.length > 0) {
                                    Object.assign(structuredCard, inferStructuredNameFromCollectorRows(structuredCard, collectorRecovery.rows));
                                    rows = mergeAndRankStructuredRows(rows, collectorRecovery.rows, structuredCard);
                                }
                            } catch (collectorRecoveryError) {
                                console.warn('⚠️ [Background] Collector-first recovery failed:', collectorRecoveryError);
                            }
                        }
                        const structuredContext = isCardmarketUrl(requestUrl) ? structuredCard : null;
                        const nameResolution = preExactNameResolution?.name
                            ? preExactNameResolution
                            : await resolveNameFromCardvaultTitle(
                                nameResolutionTitle,
                                structuredContext || structuredCard,
                                nameResolutionOptions
                            );
                        if (shouldUseResolvedCardName(nameResolution.name, structuredCard)) {
                            structuredCard.name = nameResolution.name;
                            structuredCard.searchName = searchNameWithVariation(nameResolution.name, structuredCard.variation || '');
                        }
                        if (!exactFastPath || rows.length === 0) {
                            searchResult = await searchExtensionCard(structuredCard);
                            rows = mergeAndRankStructuredRows(rows, searchResult.rows, structuredCard);
                        }
                    }

                    if (shouldRunAutocompleteFallback(rows, structuredCard)) {
                        try {
                            const fallbackSearch = exactIdentity
                                ? await searchCardvaultForStructuredCard(title, structuredCard)
                                : await searchCardvault(title, structuredCard?.searchName || structuredCard?.name || '');
                            rows = mergeAndRankStructuredRows(rows, fallbackSearch.rows, structuredCard);
                        } catch (fallbackError) {
                            if (rows.length === 0) {
                                throw fallbackError;
                            }
                            console.warn('⚠️ [Background] Preserved exact rows after fallback failure:', fallbackError);
                        }
                    }

                    const legacyRows = rows.map(legacyResultFromRow);
                    void schedulePriceEnrichment(rows);
                    if (isCardmarketUrl(requestUrl) && legacyRows.length > 0) {
                        void sendCardmarketObservation({
                            structuredCard,
                            cardmarketContext: {
                                url: normalizeObservationUrl(requestUrl),
                                title,
                                hostname: requestUrl ? new URL(requestUrl).hostname : '',
                                expansion: structuredCard.expansion || '',
                                subtitle: '',
                                breadcrumbParts: [],
                            },
                            match: matchFromRow(legacyRows[0]),
                            promoteVerifiedLink: false,
                        }).catch((error) => {
                            console.warn('⚠️ [Background] Cardmarket observation failed:', error);
                        });
                    }
                    return legacyRows;
                })
                .then((results) => {
                    recentSearchCacheSet(backgroundSearchResultCache, recentSearchKey, results);
                    return results;
                })
                .finally(() => {
                    backgroundSearchInFlight.delete(recentSearchKey);
                }));
                }
                backgroundSearchInFlight.get(recentSearchKey)
                    .then((results) => sendResponse({ success: true, results }))
                    .catch((error) => sendResponse({ success: false, error: error.message || 'Unable to search card.' }));
            })
            .catch((error) => sendResponse({ success: false, error: error.message || 'Unable to initialize runtime state.' }));
    } else if (request.action === 'openSidePanelForCurrentTab') {
        const senderTab = sender.tab;
        if (!senderTab?.id) {
            sendResponse({ success: false, error: 'No sender tab found.' });
            return false;
        }

        const openSidePanelPromise = chrome.sidePanel?.open
            ? chrome.sidePanel.open({ tabId: senderTab.id })
            : Promise.resolve();
        let openOwner = null;
        let openUrl = senderTab.url || '';
        let openTitle = senderTab.title || '';
        Promise.resolve()
            .then(async () => {
                await ensureRuntimeStorageCurrent();
                const tab = await chrome.tabs.get(senderTab.id);
                const currentUrl = request.url || tab.url || senderTab.url || '';
                const currentTitle = tab.title || senderTab.title || request.title || '';
                openUrl = currentUrl;
                openTitle = currentTitle;
                const directCardTraderBlueprintId = request.cardtraderBlueprintId || cardtraderBlueprintIdFromUrl(currentUrl);
                clearTimeout(sidePanelRefreshTimers.get(tab.id));
                const owner = createSidePanelRequestOwner({
                    ...tab,
                    id: senderTab.id,
                    url: currentUrl || tab.url || senderTab.url || '',
                    title: currentTitle || tab.title || senderTab.title || '',
                }, 'open');
                openOwner = owner;
                await openSidePanelPromise;
                const marketplacePayload = normalizeMarketplacePayload(request.vintedPayload || request.ebayPayload || request.marketplacePayload);
                const isSelectedOverlayOpen = ['vinted', 'ebay'].includes(marketplacePayload?.source) && marketplacePayload.selectedClues?.length > 0;
                const requestClues = marketplacePayload?.selectedClues || normalizeRequestClues(request.selectedClues || request.clues);
                const requestPrimaryClues = marketplacePayload?.primaryClues || normalizeRequestClues(request.primaryClues);
                const requestTitle = isSelectedOverlayOpen
                    ? buildPrimaryClueSearchTitle('', requestClues, requestPrimaryClues)
                    : (marketplacePayload?.searchTitle || buildPrimaryClueSearchTitle(request.originalTitle || currentTitle, requestClues, requestPrimaryClues));
                const requestStructuredCard = marketplacePayload?.structuredCard ||
                    scrapeStructuredCardFields(requestTitle || (isSelectedOverlayOpen ? '' : currentTitle), cardmarketContextFromRequest(request, currentUrl));
                const selectedCandidateRow = selectedCandidateRowFromRequest(request);
                const previewRows = previewRowsFromRequest(request);
                const vintedCanonical = vintedCanonicalFromRequest(request, {
                    ...tab,
                    id: senderTab.id,
                    url: currentUrl || tab.url || senderTab.url || '',
                });
                const recentVintedCanonical = previewRows.length === 0
                    ? latestRecentVintedCanonicalPreview(request, {
                        ...tab,
                        id: senderTab.id,
                        url: currentUrl || tab.url || senderTab.url || '',
                    })
                    : null;
                const recentEbayCanonical = previewRows.length === 0
                    ? latestRecentEbayCanonicalPreview(request, {
                        ...tab,
                        id: senderTab.id,
                        url: currentUrl || tab.url || senderTab.url || '',
                    })
                    : null;
                if (
                    recentVintedCanonical?.previewRows?.length > 0 &&
                    !request.forceRefresh
                ) {
                    return applyVintedCanonicalToSidePanel({
                        ...tab,
                        id: senderTab.id,
                        url: currentUrl || tab.url || senderTab.url || '',
                        title: request.title || currentTitle || tab.title || '',
                    }, recentVintedCanonical, owner, { reason: 'open-recent-vinted-cache' });
                }
                if (
                    recentEbayCanonical?.previewRows?.length > 0 &&
                    !request.forceRefresh
                ) {
                    return applyEbayCanonicalToSidePanel({
                        ...tab,
                        id: senderTab.id,
                        url: currentUrl || tab.url || senderTab.url || '',
                        title: request.title || currentTitle || tab.title || '',
                    }, recentEbayCanonical, owner, { reason: 'open-recent-ebay-cache' });
                }
                if (vintedCanonical) {
                    rememberVintedCanonicalPreview({
                        ...vintedCanonical,
                        selectedCandidateId: selectedCandidateRow?.card_id || vintedCanonical.selectedCandidateId || '',
                    });
                }
                const ebayCanonical = ebayCanonicalFromRequest(request, {
                    ...tab,
                    id: senderTab.id,
                    url: currentUrl || tab.url || senderTab.url || '',
                });
                if (ebayCanonical?.previewRows?.length > 0) {
                    rememberEbayCanonicalPreview({
                        ...ebayCanonical,
                        selectedCandidateId: selectedCandidateRow?.card_id || ebayCanonical.selectedCandidateId || '',
                    });
                }
                if (directCardTraderBlueprintId) {
                    const cachedDirectState = !request.forceRefresh
                        ? latestRecentCardTraderDirectState({
                            ...tab,
                            id: senderTab.id,
                            url: currentUrl || tab.url || senderTab.url || '',
                            title: currentTitle || tab.title || senderTab.title || '',
                        })
                        : null;
                    if (cachedDirectState) {
                        return applyCardTraderDirectCachedState({
                            ...tab,
                            id: senderTab.id,
                            url: currentUrl || tab.url || senderTab.url || '',
                            title: currentTitle || tab.title || senderTab.title || '',
                        }, cachedDirectState, owner, { reason: 'open-cardtrader-direct-cache' });
                    }
                    const directName = cleanCardTraderDirectName(currentTitle, currentUrl, directCardTraderBlueprintId);
                    const directRow = {
                        card_id: directCardTraderBlueprintId,
                        name: directName,
                        source: 'cardtrader_url',
                        search_rank: 999999,
                    };
                    const directResult = {
                        pageInfo: {
                            title: directName,
                            url: currentUrl,
                            hostname: currentUrl ? new URL(currentUrl).hostname : '',
                            structuredCard: scrapeStructuredCardFields(directName),
                            cardtraderBlueprintId: String(directCardTraderBlueprintId),
                            debug: {
                                extractorVersion: 2,
                                titleSource: 'cardtrader button URL blueprint id',
                                directCardTrader: true,
                            },
                        },
                        rows: [directRow],
                        best: directRow,
                        blueprintId: String(directCardTraderBlueprintId),
                        pokoinUrl: sidePanelStatePokoinUrl(directRow),
                        error: '',
                        debug: {
                            version: 2,
                            tab: {
                                id: tab?.id || null,
                                title: tab?.title || '',
                                url: tab?.url || '',
                            },
                            query: directName,
                            apiBaseUrl: CARDVAULT_API_BASE_URL,
                            attemptedQueries: [],
                            searched: false,
                            rowCount: 1,
                            bestId: String(directCardTraderBlueprintId),
                            cardtraderBlueprintId: String(directCardTraderBlueprintId),
                            directCardTrader: true,
                            error: '',
                        },
                    };
                    await setSidePanelState({
                        updatedAt: Date.now(),
                        ...directResult,
                    }, owner);
                    return directResult;
                }
                if (selectedCandidateRow && previewRows.length === 0) {
                    const selectedResult = {
                        pageInfo: {
                            title: requestTitle || currentTitle,
                            url: currentUrl,
                            hostname: currentUrl ? new URL(currentUrl).hostname : '',
                            originalTitle: request.originalTitle || currentTitle,
                            clues: requestClues,
                            primaryClues: requestPrimaryClues,
                            selectedClues: requestClues,
                            structuredCard: requestStructuredCard,
                            vintedPayload: marketplacePayload?.source === 'vinted' ? marketplacePayload : null,
                            ebayPayload: marketplacePayload?.source === 'ebay' ? marketplacePayload : null,
                            marketplacePayload,
                            selectedCandidateId: String(selectedCandidateRow.card_id),
                            selectionRevision: Number(request.selectionRevision || 0),
                        },
                        rows: [selectedCandidateRow],
                        best: selectedCandidateRow,
                        blueprintId: String(selectedCandidateRow.card_id),
                        pokoinUrl: sidePanelStatePokoinUrl(selectedCandidateRow),
                        error: '',
                        debug: {
                            version: 2,
                            tab: {
                                id: tab?.id || null,
                                title: tab?.title || '',
                                url: tab?.url || '',
                            },
                            query: requestTitle || currentTitle,
                            apiBaseUrl: CARDVAULT_API_BASE_URL,
                            attemptedQueries: [],
                            searched: false,
                            rowCount: 1,
                            bestId: String(selectedCandidateRow.card_id),
                            selectedCandidateId: String(selectedCandidateRow.card_id),
                            error: '',
                        },
                    };
                    await setSidePanelState({
                        updatedAt: Date.now(),
                        ...selectedResult,
                    }, owner);
                    observeCardmarketScrapeSoon(selectedResult, { promoteVerifiedLink: isCardmarketUrl(currentUrl) });
                    return selectedResult;
                }
                if (previewRows.length > 0) {
                    const selectedPreviewRow = selectedCandidateRow
                        ? previewRows.find((row) => String(row.card_id) === String(selectedCandidateRow.card_id)) || selectedCandidateRow
                        : null;
                    const bestPreviewRow = selectedPreviewRow || previewRows[0];
                    const orderedPreviewRows = previewRows;
                    const previewResult = {
                        pageInfo: {
                            title: requestTitle || currentTitle,
                            url: currentUrl,
                            hostname: currentUrl ? new URL(currentUrl).hostname : '',
                            originalTitle: request.originalTitle || currentTitle,
                            clues: requestClues,
                            primaryClues: requestPrimaryClues,
                            selectedClues: requestClues,
                            structuredCard: requestStructuredCard,
                            vintedPayload: marketplacePayload?.source === 'vinted' ? marketplacePayload : null,
                            ebayPayload: marketplacePayload?.source === 'ebay' ? marketplacePayload : null,
                            marketplacePayload,
                            previewSignature: request.previewSignature || '',
                            selectedCandidateId: selectedCandidateRow?.card_id ? String(selectedCandidateRow.card_id) : '',
                            selectionRevision: Number(request.selectionRevision || 0),
                        },
                        rows: orderedPreviewRows,
                        best: bestPreviewRow,
                        blueprintId: String(bestPreviewRow.card_id),
                        pokoinUrl: sidePanelStatePokoinUrl(bestPreviewRow),
                        error: '',
                        debug: {
                            version: 2,
                            tab: {
                                id: tab?.id || null,
                                title: tab?.title || '',
                                url: tab?.url || '',
                            },
                            query: requestTitle || currentTitle,
                            apiBaseUrl: CARDVAULT_API_BASE_URL,
                            attemptedQueries: [],
                            searched: false,
                            rowCount: orderedPreviewRows.length,
                            bestId: String(bestPreviewRow.card_id),
                            selectedCandidateId: selectedCandidateRow?.card_id ? String(selectedCandidateRow.card_id) : '',
                            pinnedPreviewRows: true,
                            pinnedVintedPreview: request.previewSource === 'vinted_overlay' || /^vinted\|/.test(request.previewSignature || ''),
                            pinnedEbayPreview: request.previewSource === 'ebay_overlay' || /^ebay\|/.test(request.previewSignature || ''),
                            previewSignature: request.previewSignature || '',
                            previewSource: request.previewSource || '',
                            selectionRevision: Number(request.selectionRevision || 0),
                            marketplacePayload: marketplacePayload ? {
                                source: marketplacePayload.source,
                                selectedChipCategories: marketplacePayload.selectedChipCategories || [],
                                structuredCard: requestStructuredCard,
                            } : null,
                            error: '',
                        },
                    };
                    await setSidePanelState({
                        updatedAt: Date.now(),
                        ...previewResult,
                    }, owner);
                    void schedulePriceEnrichment(orderedPreviewRows, async (enrichedRows) => {
                        if (!isSidePanelOwnerCurrent(owner, currentUrl)) {
                            markStaleSidePanelOwner(owner, 'preview price enrichment owner no longer current');
                            return enrichedRows;
                        }
                        const { sidePanelState: currentSidePanelState } = await chrome.storage.session.get('sidePanelState');
                        if (
                            !currentSidePanelState?.debug?.pinnedPreviewRows ||
                            !sameUrlWithoutHash(currentSidePanelState.pageInfo?.url || '', currentUrl) ||
                            String(currentSidePanelState.blueprintId || '') !== String(bestPreviewRow.card_id || '')
                        ) {
                            return enrichedRows;
                        }
                        const enrichedBest = enrichedRows.find((row) => String(row.card_id) === String(bestPreviewRow.card_id)) || enrichedRows[0] || null;
                        await setSidePanelState({
                            updatedAt: Date.now(),
                            ...previewResult,
                            rows: enrichedRows,
                            best: enrichedBest,
                            blueprintId: enrichedBest?.card_id ? String(enrichedBest.card_id) : '',
                            pokoinUrl: sidePanelStatePokoinUrl(enrichedBest),
                            debug: {
                                ...previewResult.debug,
                                priceEnriched: true,
                            },
                        }, owner);
                        return enrichedRows;
                    });
                    return previewResult;
                }
                clearBackgroundSearchCachesForUrl(currentUrl);
                await setSidePanelState({
                    updatedAt: Date.now(),
                    loading: true,
                    pageInfo: {
                        title: requestTitle || currentTitle,
                        url: currentUrl,
                        hostname: currentUrl ? new URL(currentUrl).hostname : '',
                        originalTitle: request.originalTitle || currentTitle,
                        clues: requestClues,
                        primaryClues: requestPrimaryClues,
                        selectedClues: requestClues,
                        structuredCard: requestStructuredCard,
                        vintedPayload: marketplacePayload?.source === 'vinted' ? marketplacePayload : null,
                        ebayPayload: marketplacePayload?.source === 'ebay' ? marketplacePayload : null,
                        marketplacePayload,
                        previewSignature: request.previewSignature || '',
                        selectionRevision: Number(request.selectionRevision || 0),
                    },
                    rows: [],
                    best: null,
                    blueprintId: '',
                    pokoinUrl: '',
                    error: '',
                    debug: {
                        loading: true,
                    },
                }, owner);
                return resolveActiveTabForSidePanel({
                    ...tab,
                    url: currentUrl || tab.url,
                    title: requestTitle || currentTitle || tab.title,
                }, {
                    expectedUrl: currentUrl || tab.url || '',
                    originalTitle: request.originalTitle || currentTitle,
                    clues: requestClues,
                    primaryClues: requestPrimaryClues,
                    vintedPayload: marketplacePayload?.source === 'vinted' ? marketplacePayload : null,
                    ebayPayload: marketplacePayload?.source === 'ebay' ? marketplacePayload : null,
                    marketplacePayload,
                    promoteVerifiedLink: isCardmarketUrl(currentUrl),
                    owner,
                });
            })
            .then((result) => sendResponse({ success: true, result }))
            .catch(async (error) => {
                if (openOwner) {
                    await setSidePanelState({
                        updatedAt: Date.now(),
                        pageInfo: {
                            title: openTitle || '',
                            url: openUrl || '',
                            hostname: safeUrlHostname(openUrl),
                        },
                        rows: [],
                        best: null,
                        blueprintId: '',
                        pokoinUrl: '',
                        error: error.message || 'Unable to open side panel.',
                        debug: {
                            error: true,
                            refreshFailureReason: 'open',
                        },
                    }, openOwner).catch(() => null);
                }
                sendResponse({ success: false, error: error.message || 'Unable to open side panel.' });
            });
    } else if (request.action === 'marketplaceNavigationChanged') {
        const tab = sender.tab;
        scheduleSidePanelRefresh(tab, 'content-navigation')
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message || 'Unable to schedule refresh.' }));
    } else if (request.action === 'marketplacePreviewReady' && request.source === 'ebay') {
        Promise.resolve()
            .then(async () => {
                await ensureRuntimeStorageCurrent();
                const senderTab = sender.tab;
                if (!senderTab?.id) {
                    return { success: false, error: 'No sender tab found.' };
                }
                const tab = chrome.tabs?.get ? await chrome.tabs.get(senderTab.id).catch(() => senderTab) : senderTab;
                const currentTab = tab?.id ? tab : senderTab;
                const currentUrl = request.url || currentTab.url || senderTab.url || '';
                if (!isEbayUrl(currentUrl) || !sameUrlWithoutHash(currentUrl, currentTab.url || currentUrl)) {
                    return { success: true, ignored: true, reason: 'stale-ebay-preview-url' };
                }
                const canonicalRequest = ebayCanonicalFromRequest(request, {
                    ...currentTab,
                    id: senderTab.id,
                    url: currentUrl,
                });
                const hasPreviewRows = canonicalRequest?.previewRows?.length > 0;
                const canonical = rememberEbayCanonicalPreview(canonicalRequest);
                if (!canonical || !hasPreviewRows) {
                    return { success: true, ignored: true, reason: 'missing-ebay-canonical-preview' };
                }
                const canonicalTab = {
                    ...currentTab,
                    id: senderTab.id,
                    url: currentUrl,
                    title: request.title || currentTab.title || '',
                };
                const applyKey = !request.forceRefresh ? ebayCanonicalApplyKey(canonicalTab, canonical) : '';
                if (applyKey && ebayCanonicalApplyInFlight.has(applyKey)) {
                    return ebayCanonicalApplyInFlight.get(applyKey)
                        .then((result) => ({ success: true, result }));
                }
                const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
                const sidePanelUrl = sidePanelState?.pageInfo?.url || '';
                if (
                    sidePanelUrl &&
                    !sameUrlWithoutHash(sidePanelUrl, currentUrl) &&
                    isSupportedMarketplaceUrl(sidePanelUrl)
                ) {
                    return { success: true, ignored: true, reason: 'side-panel-owned-by-other-url' };
                }
                const owner = createSidePanelRequestOwner(canonicalTab, 'ebay-preview-ready');
                const applyPromise = applyEbayCanonicalToSidePanel(canonicalTab, canonical, owner, {
                    reason: 'ebay-preview-ready',
                    skipInFlightGuard: true,
                });
                if (applyKey) {
                    ebayCanonicalApplyInFlight.set(applyKey, applyPromise.finally(() => {
                        ebayCanonicalApplyInFlight.delete(applyKey);
                    }));
                }
                const result = await applyPromise;
                return { success: true, result };
            })
            .then((response) => sendResponse(response))
            .catch((error) => sendResponse({ success: false, error: error.message || 'Unable to apply eBay preview.' }));
    } else if (request.action === 'marketplacePreviewReady' || request.action === 'vintedProductReady') {
        Promise.resolve()
            .then(async () => {
                await ensureRuntimeStorageCurrent();
                const senderTab = sender.tab;
                if (!senderTab?.id) {
                    return { success: false, error: 'No sender tab found.' };
                }
                const tab = chrome.tabs?.get ? await chrome.tabs.get(senderTab.id).catch(() => senderTab) : senderTab;
                const currentTab = tab?.id ? tab : senderTab;
                const currentUrl = request.url || currentTab.url || senderTab.url || '';
                if (!isVintedUrl(currentUrl) || !sameUrlWithoutHash(currentUrl, currentTab.url || currentUrl)) {
                    return { success: true, ignored: true, reason: 'stale-vinted-preview-url' };
                }
                const canonicalRequest = vintedCanonicalFromRequest(request, {
                    ...currentTab,
                    id: senderTab.id,
                    url: currentUrl,
                });
                const hasPreviewRows = canonicalRequest?.previewRows?.length > 0;
                const canonical = rememberVintedCanonicalPreview(canonicalRequest, {
                    clearWaitTimer: hasPreviewRows,
                });
                if (!canonical) {
                    return { success: true, ignored: true, reason: 'missing-vinted-canonical-preview' };
                }
                if (!hasPreviewRows && request.tokensReady) {
                    return { success: true, deferred: true, reason: 'awaiting-vinted-preview-rows' };
                }
                const canonicalTab = {
                    ...currentTab,
                    id: senderTab.id,
                    url: currentUrl,
                    title: request.title || currentTab.title || '',
                };
                const applyKey = !request.forceRefresh ? vintedCanonicalApplyKey(canonicalTab, canonical) : '';
                if (applyKey && vintedCanonicalApplyInFlight.has(applyKey)) {
                    return vintedCanonicalApplyInFlight.get(applyKey)
                        .then((result) => ({ success: true, result }));
                }
                const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
                const sidePanelUrl = sidePanelState?.pageInfo?.url || '';
                if (
                    sidePanelUrl &&
                    !sameUrlWithoutHash(sidePanelUrl, currentUrl) &&
                    isSupportedMarketplaceUrl(sidePanelUrl)
                ) {
                    return { success: true, ignored: true, reason: 'side-panel-owned-by-other-url' };
                }
                const owner = createSidePanelRequestOwner(canonicalTab, 'vinted-preview-ready');
                const applyPromise = applyVintedCanonicalToSidePanel(canonicalTab, canonical, owner, {
                    reason: 'vinted-preview-ready',
                    skipInFlightGuard: true,
                });
                if (applyKey) {
                    vintedCanonicalApplyInFlight.set(applyKey, applyPromise.finally(() => {
                        vintedCanonicalApplyInFlight.delete(applyKey);
                    }));
                }
                const result = await applyPromise;
                return { success: true, result };
            })
            .then((response) => sendResponse(response))
            .catch((error) => sendResponse({ success: false, error: error.message || 'Unable to apply Vinted preview.' }));
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
    const owner = createSidePanelRequestOwner(tab, 'action-click');
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

        const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
        if (isVintedUrl(tab?.url || '')) {
            const canonical = latestVintedCanonicalPreview(tab, sidePanelState);
            if (canonical?.vintedPayload || canonical?.previewRows?.length > 0) {
                await applyVintedCanonicalToSidePanel(tab, canonical, owner, { reason: 'action-click' });
                return;
            }
            await setVintedWaitingForPreviewState(tab, 'action-click-awaiting-vinted-preview', owner);
            return;
        }

        if (samePinnedVintedPreviewState(sidePanelState, tab?.url || '')) {
            return;
        }

        if (isEbayUrl(tab?.url || '')) {
            const canonical = latestEbayCanonicalPreview(tab, sidePanelState);
            if (canonical?.previewRows?.length > 0) {
                await applyEbayCanonicalToSidePanel(tab, canonical, owner, { reason: 'action-click' });
                return;
            }
        }

        if (isCardTraderDirectUrl(tab?.url || '')) {
            if (isLockedCardTraderDirectState(sidePanelState, tab.url)) {
                rememberCardTraderDirectState(sidePanelState);
                return;
            }
            const cached = latestRecentCardTraderDirectState(tab, sidePanelState);
            if (cached) {
                await applyCardTraderDirectCachedState(tab, cached, owner, { reason: 'action-click' });
                return;
            }
            await resolveActiveTabForSidePanel(tab, { expectedUrl: tab?.url || '', owner });
            return;
        }

        await setSidePanelState({
            updatedAt: Date.now(),
            pageInfo: {
                title: tab?.title || '',
                url: tab?.url || '',
                hostname: safeUrlHostname(tab?.url),
            },
            rows: [],
            best: null,
            blueprintId: '',
            pokoinUrl: '',
            error: '',
            loading: true,
            debug: {
                loading: true,
            },
        }, owner);

        await resolveActiveTabForSidePanel(tab, { expectedUrl: tab?.url || '', owner });
    } catch (error) {
        console.error('❌ Failed to open CardTrader side panel:', error);
        await setSidePanelState({
            updatedAt: Date.now(),
            pageInfo: {
                title: tab?.title || '',
                url: tab?.url || '',
                hostname: safeUrlHostname(tab?.url),
            },
            rows: [],
            best: null,
            blueprintId: '',
            pokoinUrl: '',
            error: error.message || 'Unable to open side panel.',
            debug: {
                error: true,
            },
        }, owner);

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