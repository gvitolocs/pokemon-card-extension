// Background script for Pokemon Card Trader Linker
const EXTENSION_VERSION = (chrome.runtime?.getManifest?.() || {}).version || '2.0.0';
const EXTENSION_BUILD_MARKER = `${EXTENSION_VERSION}-runtime-divergence-guard`;
const EXTENSION_RUNTIME_STORAGE_KEY = 'pokoinExtensionRuntime';
const CARDVAULT_API_BASE_URL = 'https://pokoin.com';
const POKOIN_AUTH_ORIGIN = 'https://pokoin.com';
const POKOIN_AUTH_BRIDGE_URL = `${POKOIN_AUTH_ORIGIN}/extension/auth-bridge`;
const POKOIN_AUTH_STORAGE_KEY = 'pokoinAuthSession';
const POKOIN_AUTH_TOKEN_RESPONSE_TYPE = 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE';
const POKOIN_TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const POKOIN_FALLBACK_TOKEN_TTL_MS = 50 * 60 * 1000;
const CARDMARKET_OBSERVATION_ENDPOINT = `${CARDVAULT_API_BASE_URL}/api/cardmarket-scrape-observation`;
const MAX_PENDING_CARDMARKET_OBSERVATIONS = 20;

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

function normalizeExpansionAlias(value = '') {
    const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
    const aliases = [
        { pattern: /\b(?:set\s+base|base\s+set)\b/i, name: 'Base Set' },
        { pattern: /\bevoluzioni\b/i, name: 'Evolutions' },
        { pattern: /\bequilibrio\s+perfetto\b/i, name: 'Perfect Order' },
        { pattern: /\bTR\s+Team\s+Rocket\b|\bTeam\s+Rocket\b/i, name: 'Team Rocket' },
    ];
    return aliases.find(({ pattern }) => pattern.test(cleanValue))?.name || cleanValue;
}

function parseCardmarketCollectorCode(value = '') {
    const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
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
    return String(value || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\bex|gx|vmax|vstar|lv x\b/gi, (match) => match.toUpperCase())
        .replace(/\bmc\b/gi, 'MC')
        .replace(/\b\w/g, (match) => match.toUpperCase())
        .replace(/\s+/g, ' ')
        .trim();
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
        const cleanName = removeMarketplaceSearchNoise(context?.details?.species || cardName);

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

    const prefixedCollectorNumber = cleanTitle.match(/\b([A-Z]{1,6})\s?(\d{1,4}[a-z]?)(?:\s*\/\s*\d{1,4}[a-z]?)?\b/i);
    const collectorNumber = (
        cleanTitle.match(/\b(?:BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\b/i)?.[0] ||
        cleanTitle.match(/\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/)?.[0] ||
        prefixedCollectorNumber?.[2] ||
        ''
    ).replace(/\s+/g, '');

    const variationMatch = cleanTitle.match(/\b(?:ex|gx|vmax|vstar|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/i);
    const variation = variationMatch
        ? variationMatch[0].replace(/\s+/g, '').replace(/\./g, '').toLowerCase()
        : '';

    const rarityMatch = cleanTitle.match(/\b(?:special illustration rare|illustration rare|illustration|secret rare|ultra rare|holo rare|holo|promo|rare)\b/i);
    const rarity = rarityMatch ? rarityMatch[0].replace(/\s+/g, ' ') : '';

    const hasEditionHint = /\b(?:1st|first|prima|primo|1)\s+(?:edition|edizione)\b/i.test(cleanTitle);
    const expansionAliases = [
        { pattern: /\b(?:set\s+base|base\s+set)\b/i, name: 'Base Set' },
        { pattern: /\bevoluzioni\b/i, name: 'Evolutions' },
    ];
    const aliasedExpansion = expansionAliases.find(({ pattern }) => pattern.test(cleanTitle))?.name || '';
    const expansionNoise = [
        'Legendary Treasure',
        'Legendary Treasures',
        'Black Star Promos',
        'BW Black Star Promos',
        'Paldean Fates',
        'Pokemon 151',
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
        .replace(/\b(?:Legendary|Treasure|Treasures|Promo|Promos)\b/gi, ' ')
        .replace(/\b(?:special illustration rare|illustration rare|illustration|secret rare|ultra rare|holo rare|holo|promo|rare)\b/gi, ' ')
        .replace(/\b(?:ex|gx|vmax|vstar|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return {
        rawTitle: cleanTitle,
        name: removeMarketplaceSearchNoise(name),
        collectorNumber,
        collectorNumberPrefix: prefixedCollectorNumber?.[1]?.toUpperCase() || '',
        printedCollectorNumber: prefixedCollectorNumber?.[1]
            ? `${prefixedCollectorNumber[1].toUpperCase()} ${prefixedCollectorNumber[2]}`
            : collectorNumber,
        expansion,
        editionHint: hasEditionHint,
        rarity,
        variation,
        searchName: removeMarketplaceSearchNoise([name, variation].filter(Boolean).join(' ')),
    };
}

function removeMarketplaceSearchNoise(value = '') {
    return String(value || '')
        .replace(/\bvastro\b/gi, 'vstar')
        .replace(/\b(?:1st|first|prima|primo|1)\s+(?:edition|edizione)\b/gi, ' ')
        .replace(/\b(?:set\s+base|base\s+set)\b/gi, ' ')
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
            /\b(?:BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\b/i.test(clue) ||
            /\b[A-Z]{1,6}\s?\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i.test(clue) ||
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

    return row?.canonical_name || row?.name || '';
}

function candidateNameTermsFromTitle(title = '', structuredCard = null) {
    const terms = [];
    if (structuredCard?.name) {
        terms.push(structuredCard.name);
    }

    const cleaned = removeMarketplaceSearchNoise(String(title || '')
        .replace(/\s*\|\s*(?:Vinted|Cardmarket)\s*$/i, '')
        .replace(/[’`]/g, "'")
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[".,:;!?/\\[\]{}|]+/g, ' ')
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

    if (cleaned) {
        const cleanedWithoutTrailingNumber = cleaned.replace(/\s+\d{1,4}[a-z]?\s*$/i, '').trim();
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

    return [...new Set(terms)].slice(0, 18);
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
    if (!requestedName) {
        return true;
    }

    const resolvedCompact = compactSearchValue(resolvedName);
    const searchCompact = compactSearchValue(structuredCard?.searchName || '');
    const requestedWithoutNumbers = compactSearchValue(String(structuredCard?.name || '').replace(/\b\d{1,4}[a-z]?\b/gi, ' '));
    const searchWithoutNumbers = compactSearchValue(String(structuredCard?.searchName || '').replace(/\b\d{1,4}[a-z]?\b/gi, ' '));
    return resolvedCompact === requestedName ||
        resolvedCompact.includes(requestedName) ||
        (searchCompact && resolvedCompact === searchCompact) ||
        (requestedWithoutNumbers && resolvedCompact.includes(requestedWithoutNumbers)) ||
        (searchWithoutNumbers && resolvedCompact === searchWithoutNumbers);
}

function searchNameWithVariation(name = '', variation = '') {
    const compactName = compactSearchValue(name);
    const compactVariation = compactSearchValue(variation);
    if (!compactVariation || compactName.endsWith(compactVariation)) {
        return name;
    }
    return [name, variation].filter(Boolean).join(' ');
}

async function resolveNameFromCardvaultTitle(title = '', structuredCard = null) {
    const attemptedTerms = [];

    for (const term of candidateNameTermsFromTitle(title, structuredCard)) {
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

function buildStructuredFallbackQueries(structuredCard = {}, title = '') {
    const name = structuredCard.searchName || structuredCard.name || '';
    const collectorNumber = structuredCard.collectorNumber || structuredCard.printedCollectorNumber || '';
    const numericCollectorNumber = structuredCard.numericCollectorNumber || '';
    const expansion = structuredCard.expansion || '';
    return [
        [name, collectorNumber].filter(Boolean).join(' '),
        [name, collectorNumber, expansion].filter(Boolean).join(' '),
        [name, expansion, collectorNumber].filter(Boolean).join(' '),
        [name, numericCollectorNumber].filter(Boolean).join(' '),
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
        const response = await fetch(`${CARDVAULT_API_BASE_URL}/api/marketplace-autocomplete`, {
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
        pokoin_price: match.pokoinPrice || match.pokoin_price || match.priceFormatted || match.price_formatted || '',
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
    const cleanExpansion = String(expansion || '').replace(/\s+/g, ' ').trim();
    if (!cleanExpansion) {
        return [];
    }

    const variants = new Set([cleanExpansion]);
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
    const prefix = cleanValue.match(/\b([A-Z0-9]*[A-Z][A-Z0-9]{0,5})\s*\d{1,4}[a-z]?\b/i)?.[1]?.toLowerCase() || '';
    const primary = normalized.match(/\d{1,4}[a-z]?(?=\/|$)/i)?.[0]?.replace(/^0+(\d)/, '$1') ||
        normalized.match(/\d{1,4}[a-z]?/i)?.[0]?.replace(/^0+(\d)/, '$1') ||
        '';
    return {
        normalized,
        prefix,
        primary,
        hasSlash: normalized.includes('/'),
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

    if (!row.primary || !requested.primary || row.primary !== requested.primary) {
        return 99;
    }

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

function normalizeCollectorValue(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/\b(?:no|number|num|card)\b/g, ' ')
        .replace(/[^a-z0-9/]+/g, '')
        .replace(/^0+(\d)/, '$1');
}

function collectorNumberMatches(rowNumber = '', requestedNumber = '') {
    return collectorNumberMatchRank(rowNumber, requestedNumber) < 99;
}

function sortRowsForStructuredCard(rows, structuredCard = {}) {
    const requestedExpansion = compactSetValue(structuredCard.expansion || '');
    const requestedName = compactSearchValue(structuredCard.name || '');
    const requestedCollectorNumber = structuredCard.collectorNumber ||
        structuredCard.printedCollectorNumber ||
        structuredCard.numericCollectorNumber ||
        '';
    const hasEditionHint = Boolean(structuredCard.editionHint);

    return [...rows].sort((a, b) => {
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

        return Number(b.search_rank || 0) - Number(a.search_rank || 0);
    });
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
    return expansionMatches(rowExpansionName(row), structuredCard.expansion || '') &&
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
    return collectorNumberMatches(rowCollectorNumber(row), requestedCollectorNumber) &&
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
    return rowName === requestedName;
}

function rowMatchesGoodEnoughExact(row = {}, structuredCard = {}) {
    return rowMatchesExactStructuredName(row, structuredCard) &&
        rowMatchesStructuredCollectorIdentity(row, structuredCard);
}

function hasGoodEnoughExactRows(rows = [], structuredCard = {}) {
    return rows.some((row) => rowMatchesGoodEnoughExact(row, structuredCard));
}

function shouldRunAutocompleteFallback(rows = [], structuredCard = {}) {
    if (rows.length === 0) {
        return true;
    }
    if (hasStructuredCollectorIdentity(structuredCard)) {
        return !hasGoodEnoughExactRows(rows, structuredCard);
    }
    if (hasExactNameVariation(structuredCard)) {
        return false;
    }
    return rows.length < 8;
}

function mergeAndRankStructuredRows(primaryRows = [], fallbackRows = [], structuredCard = {}) {
    return sortRowsForStructuredCard(uniqueRowsById([...primaryRows, ...fallbackRows]), structuredCard);
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
        .filter((row) => compactSetValue(structuredCard.expansion || '') !== 'baseset' || isAllowedBaseSetFamily(row)));

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
        pokoin_price: row.pokoin_price || row.pokoinPrice || row.price_formatted || row.priceFormatted || '',
    };
}

function selectedCandidateRowFromRequest(request = {}) {
    const selected = request.selectedCandidate || {};
    const cardId = request.selectedCandidateId || selected.card_id || selected.blueprint_id || selected.cardId || selected.blueprintId || '';
    if (!cardId) {
        return null;
    }

    return {
        card_id: String(cardId),
        name: selected.name || selected.name_en || selected.pokemon_name || request.title || `Blueprint ${cardId}`,
        set_name: selected.set_name || selected.expansion_name_en || selected.expansionName || selected.expansion_name || '',
        card_number: selected.card_number || selected.collector_number || selected.collectorNumber || '',
        expansion_symbol_url: selected.expansion_symbol_url || selected.expansionSymbolUrl || selected.symbolImageUrl || '',
        source: selected.source || 'selected_candidate',
        search_rank: selected.search_rank || selected.searchScore || selected.search_score || selected.relevanceScore || selected.score || 999999,
        pokoin_price: selected.pokoin_price || selected.pokoinPrice || selected.price_formatted || selected.priceFormatted || '',
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
        source: row.source || 'vinted_overlay_preview',
        search_rank: row.search_rank || row.searchScore || row.search_score || row.relevanceScore || row.score || '',
        pokoin_price: row.pokoin_price || row.pokoinPrice || row.price_formatted || row.priceFormatted || '',
    };
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
    if (
        currentState?.debug?.pinnedPreviewRows &&
        !state.debug?.pinnedPreviewRows &&
        sameUrlWithoutHash(currentState.pageInfo?.url || '', state.pageInfo?.url || '')
    ) {
        console.log('ℹ️ [Background] Kept pinned preview rows over weaker same-URL update');
        return currentState;
    }
    await chrome.storage.session.set({ sidePanelState: state });
    return state;
}

function clearBackgroundSearchCachesForUrl(url = '') {
    const stableUrl = stableSearchUrl(url);
    if (!stableUrl) {
        return;
    }
    for (const key of [...backgroundSearchInFlight.keys()]) {
        if (key.startsWith(`${stableUrl}|`)) {
            backgroundSearchInFlight.delete(key);
        }
    }
    for (const key of [...backgroundSearchResultCache.keys()]) {
        if (key.startsWith(`${stableUrl}|`)) {
            backgroundSearchResultCache.delete(key);
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
const cardvaultNameResolutionCache = new Map();
const pokoinPriceCache = new Map();
const cardmarketObservationSignatures = new Set();
const cardmarketObservationInFlight = new Map();
let pendingCardmarketObservationWrite = Promise.resolve();
let pokoinAuthBridgeInFlight = null;
let pokoinAuthTokenRequestInFlight = null;

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
    cardvaultNameResolutionCache.clear();
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
                await chrome.tabs.update(existingTab.id, { active: false }).catch(() => {});
                return existingTab;
            }
            if (chrome.tabs?.create) {
                return chrome.tabs.create({ url: POKOIN_AUTH_BRIDGE_URL, active: false });
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
    return {
        structuredCard,
        cardmarketContext: cardmarketContextFromPageInfo(pageInfo),
        match,
        promoteVerifiedLink: Boolean(promoteVerifiedLink && match?.cardId),
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

function extractPokoinListingPrice(payload = {}) {
    const products = Array.isArray(payload.products) ? payload.products : [];
    const firstPricedProduct = products.find((product) =>
        product?.price?.non_layered_price_formatted ||
        product?.price?.formatted ||
        product?.price_formatted ||
        (Number.isFinite(Number(product?.price_cents)) && product?.price_currency)
    );

    if (!firstPricedProduct) {
        return '';
    }

    const formatted = firstPricedProduct.price?.non_layered_price_formatted ||
        firstPricedProduct.price?.formatted ||
        firstPricedProduct.price_formatted ||
        '';
    if (formatted) {
        return formatted;
    }

    const cents = Number(firstPricedProduct.price_cents);
    const currency = String(firstPricedProduct.price_currency || '').trim().toUpperCase();
    if (!Number.isFinite(cents) || !currency) {
        return '';
    }

    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
        }).format(cents / 100);
    } catch (error) {
        return `${currency} ${(cents / 100).toFixed(2)}`;
    }
}

async function fetchPokoinListingPrice(cardId) {
    const stableCardId = String(cardId || '').trim();
    if (!stableCardId) {
        return '';
    }
    if (pokoinPriceCache.has(stableCardId)) {
        return pokoinPriceCache.get(stableCardId);
    }

    const pricePromise = fetch(`${CARDVAULT_API_BASE_URL}/api/cardtrader-redirect?id=${encodeURIComponent(stableCardId)}`, {
        headers: {
            accept: 'application/json',
        },
    })
        .then((response) => response.ok ? response.json() : null)
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

function buildBackgroundSearchSignature({ title = '', originalTitle = '', clues = [], primaryClues = [], url = '' } = {}) {
    return [
        stableSearchUrl(url),
        compactSearchValue(title),
        compactSearchValue(originalTitle),
        normalizeRequestClues(clues).map(compactSearchValue).sort().join(','),
        normalizeRequestClues(primaryClues).map(compactSearchValue).sort().join(','),
    ].join('|');
}

async function scheduleSidePanelRefresh(tab, reason = 'navigation') {
    await ensureRuntimeStorageCurrent();
    if (!tab?.id || !isSupportedMarketplaceUrl(tab.url)) {
        return;
    }

    const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
    const currentStateUrl = sidePanelState?.pageInfo?.url || '';
    if (isLockedCardTraderDirectState(sidePanelState, tab.url)) {
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
    const phaseTimings = {};
    let phaseStartedAt = resolveStartedAt;
    const markPhase = (name) => {
        phaseTimings[name] = Date.now() - phaseStartedAt;
        phaseStartedAt = Date.now();
    };
    let pageInfo;
    let pageInfoError = '';
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
    markPhase('pageInfoMs');
    if (owner && !isSidePanelOwnerCurrent(owner, pageInfo.url || tab?.url || '')) {
        markStaleSidePanelOwner(owner, 'page info behind current side panel owner');
        return { pageInfo, rows: [], best: null, blueprintId: '', pokoinUrl: '', error: pageInfoError, debug: sidePanelOwnerDebug(owner), stale: true };
    }
    const requestClues = normalizeRequestClues(requestContext.clues);
    const requestPrimaryClues = normalizeRequestClues(requestContext.primaryClues);
    if (requestClues.length > 0) {
        const originalTitle = requestContext.originalTitle || pageInfo.title || tab?.title || '';
        pageInfo.originalTitle = originalTitle;
        pageInfo.clues = requestClues;
        pageInfo.primaryClues = requestPrimaryClues;
        pageInfo.title = buildPrimaryClueSearchTitle(originalTitle, requestClues, requestPrimaryClues);
        pageInfo.structuredCard = scrapeStructuredCardFields(pageInfo.title);
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
                const exactIdentity = hasExactStructuredIdentity(pageInfo.structuredCard);
                const exactFastPath = hasExactSearchFastPath(pageInfo.structuredCard);
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
                    try {
                        const nameResolutionTitle = titleForNameResolution(
                            pageInfo.title,
                            pageInfo.originalTitle || tab?.title || '',
                            pageInfo.clues
                        );
                        const nameResolution = await resolveNameFromCardvaultTitle(
                            nameResolutionTitle,
                            isCardmarketUrl(pageInfo.url) ? pageInfo.structuredCard : null
                        );
                        debug.nameResolution = nameResolution;
                        if (shouldUseResolvedCardName(nameResolution.name, pageInfo.structuredCard)) {
                            pageInfo.structuredCard = {
                                ...(pageInfo.structuredCard || {}),
                                name: nameResolution.name,
                            };
                            if (pageInfo.structuredCard.variation) {
                                pageInfo.structuredCard.searchName = searchNameWithVariation(nameResolution.name, pageInfo.structuredCard.variation);
                            }
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
                    const searchResult = exactIdentity
                        ? await searchCardvaultForStructuredCard(pageInfo.title, pageInfo.structuredCard)
                        : await searchCardvault(pageInfo.title, pageInfo.structuredCard?.name || '');
                    rows = mergeAndRankStructuredRows(rows, searchResult.rows, pageInfo.structuredCard);
                    debug.attemptedQueries = searchResult.debug.attemptedQueries;
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
    const pokoinUrl = blueprintId ? `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${blueprintId}` : '';
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
        ensureRuntimeStorageCurrent()
            .then(() => {
                const tab = sender.tab;
                const directCardTraderBlueprintId = cardtraderBlueprintIdFromUrl(request.url || tab?.url || '');
                const clues = normalizeRequestClues(request.clues);
                const primaryClues = normalizeRequestClues(request.primaryClues);
                const title = buildPrimaryClueSearchTitle(request.originalTitle || request.title || tab?.title || '', clues, primaryClues);
                const requestUrl = request.url || tab?.url || '';
                const searchSignature = buildBackgroundSearchSignature({
                    title,
                    originalTitle: request.originalTitle || request.title || tab?.title || '',
                    clues,
                    primaryClues,
                    url: requestUrl,
                });
                if (backgroundSearchResultCache.has(searchSignature)) {
                    sendResponse({ success: true, results: backgroundSearchResultCache.get(searchSignature) });
                    return;
                }
                if (!backgroundSearchInFlight.has(searchSignature)) {
                    backgroundSearchInFlight.set(searchSignature, Promise.resolve()
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
                    const cardmarketContext = isCardmarketUrl(requestUrl)
                        ? { expansion: cardmarketExpansionFromUrl(requestUrl) }
                        : null;
                    const structuredCard = scrapeStructuredCardFields(title, cardmarketContext);
                    const exactIdentity = hasExactStructuredIdentity(structuredCard);
                    const exactFastPath = hasExactSearchFastPath(structuredCard);
                    let rows = [];
                    let searchResult = null;
                    if (exactFastPath) {
                        searchResult = await searchExtensionCard(structuredCard);
                        rows = searchResult.rows;
                    }

                    if (rows.length === 0 || (exactIdentity && !hasGoodEnoughExactRows(rows, structuredCard))) {
                        const structuredContext = isCardmarketUrl(requestUrl) ? structuredCard : null;
                        const nameResolution = await resolveNameFromCardvaultTitle(
                            titleForNameResolution(title, request.originalTitle || tab?.title || '', [...clues, ...primaryClues]),
                            structuredContext
                        );
                        if (shouldUseResolvedCardName(nameResolution.name, structuredCard)) {
                            structuredCard.name = nameResolution.name;
                            if (structuredCard.variation) {
                                structuredCard.searchName = searchNameWithVariation(nameResolution.name, structuredCard.variation);
                            }
                        }
                        if (!exactFastPath || rows.length === 0) {
                            searchResult = await searchExtensionCard(structuredCard);
                            rows = mergeAndRankStructuredRows(rows, searchResult.rows, structuredCard);
                        }
                    }

                    if (shouldRunAutocompleteFallback(rows, structuredCard)) {
                        const fallbackSearch = exactIdentity
                            ? await searchCardvaultForStructuredCard(title, structuredCard)
                            : await searchCardvault(title, structuredCard?.name || '');
                        rows = mergeAndRankStructuredRows(rows, fallbackSearch.rows, structuredCard);
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
                    backgroundSearchResultCache.set(searchSignature, results);
                    return results;
                })
                .finally(() => {
                    backgroundSearchInFlight.delete(searchSignature);
                }));
                }
                backgroundSearchInFlight.get(searchSignature)
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
                const currentTitle = request.title || tab.title || senderTab.title || '';
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
                const requestClues = normalizeRequestClues(request.clues);
                const requestPrimaryClues = normalizeRequestClues(request.primaryClues);
                const requestTitle = buildPrimaryClueSearchTitle(request.originalTitle || currentTitle, requestClues, requestPrimaryClues);
                const selectedCandidateRow = selectedCandidateRowFromRequest(request);
                const previewRows = previewRowsFromRequest(request);
                if (directCardTraderBlueprintId) {
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
                        pokoinUrl: `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${directCardTraderBlueprintId}`,
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
                            structuredCard: scrapeStructuredCardFields(requestTitle || currentTitle),
                            selectedCandidateId: String(selectedCandidateRow.card_id),
                        },
                        rows: [selectedCandidateRow],
                        best: selectedCandidateRow,
                        blueprintId: String(selectedCandidateRow.card_id),
                        pokoinUrl: `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${selectedCandidateRow.card_id}`,
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
                    const bestPreviewRow = selectedCandidateRow || previewRows[0];
                    const orderedPreviewRows = selectedCandidateRow
                        ? [
                            selectedCandidateRow,
                            ...previewRows.filter((row) => String(row.card_id) !== String(selectedCandidateRow.card_id)),
                        ]
                        : previewRows;
                    const previewResult = {
                        pageInfo: {
                            title: requestTitle || currentTitle,
                            url: currentUrl,
                            hostname: currentUrl ? new URL(currentUrl).hostname : '',
                            originalTitle: request.originalTitle || currentTitle,
                            clues: requestClues,
                            primaryClues: requestPrimaryClues,
                            structuredCard: scrapeStructuredCardFields(requestTitle || currentTitle),
                            previewSignature: request.previewSignature || '',
                            selectedCandidateId: bestPreviewRow?.card_id ? String(bestPreviewRow.card_id) : '',
                        },
                        rows: orderedPreviewRows,
                        best: bestPreviewRow,
                        blueprintId: String(bestPreviewRow.card_id),
                        pokoinUrl: `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${bestPreviewRow.card_id}`,
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
                            selectedCandidateId: bestPreviewRow?.card_id ? String(bestPreviewRow.card_id) : '',
                            pinnedPreviewRows: true,
                            pinnedVintedPreview: /^vinted\|/.test(request.previewSignature || ''),
                            previewSignature: request.previewSignature || '',
                            previewSource: request.previewSource || '',
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
                            pokoinUrl: enrichedBest?.card_id ? `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${enrichedBest.card_id}` : '',
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