// Background script for Pokemon Card Trader Linker
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
        .replace(/\bPokoin\.com(?:\s*\(\d+\))?\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s*-?\s*Singles?\s*$/i, '')
        .trim();
}

function scrapeCardmarketContext(title = '') {
    const subtitleFromHeadingSpan = cleanCardmarketText(
        document.querySelector('.page-title-container h1 span, h1 span.h4, h1 .text-muted')
            ?.textContent || ''
    );
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

    return {
        subtitle: subtitleFromHeadingSpan || subtitle,
        breadcrumbParts,
        expansion: subtitleFromHeadingSpan || subtitle || pageUrlExpansion || expansionFromBreadcrumb || cleanCardmarketText(documentTitleExpansion),
    };
}

function normalizeExpansionAlias(value = '') {
    const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
    const aliases = [
        { pattern: /\b(?:set\s+base|base\s+set)\b/i, name: 'Base Set' },
        { pattern: /\bevoluzioni\b/i, name: 'Evolutions' },
    ];
    return aliases.find(({ pattern }) => pattern.test(cleanValue))?.name || cleanValue;
}

function parseCardmarketCollectorCode(value = '') {
    const match = String(value || '').match(/\b([A-Z0-9]{1,6})?\s*(\d{1,4}[a-z]?)\b/i);
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
        const printedCollectorNumber = cardPrefix ? `${cardPrefix.toUpperCase()} ${cardNumber}` : cardNumber;
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
            numericCollectorNumber: cardNumber,
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
    const rowSet = compactSetValue(rowExpansion || '');
    const requestedSet = compactSetValue(requestedExpansion || '');
    if (!requestedSet) {
        return true;
    }
    if (requestedSet === 'baseset') {
        return isAllowedBaseSetFamily({ set_name: rowExpansion });
    }
    return rowSet === requestedSet ||
        Boolean(rowSet && requestedSet && (rowSet.includes(requestedSet) || requestedSet.includes(rowSet)));
}

function normalizeCollectorValue(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/\b(?:no|number|num|card)\b/g, ' ')
        .replace(/[^a-z0-9/]+/g, '')
        .replace(/^0+(\d)/, '$1');
}

function collectorNumberMatches(rowNumber = '', requestedNumber = '') {
    const rowCompact = normalizeCollectorValue(rowNumber);
    const requestedCompact = normalizeCollectorValue(requestedNumber);
    if (!rowCompact || !requestedCompact) {
        return false;
    }

    const rowPrimary = rowCompact.match(/\d{1,4}[a-z]?(?=\/|$)/i)?.[0]?.replace(/^0+(\d)/, '$1') ||
        rowCompact.match(/\d{1,4}[a-z]?/i)?.[0]?.replace(/^0+(\d)/, '$1') ||
        '';
    const requestedPrimary = requestedCompact.match(/\d{1,4}[a-z]?(?=\/|$)/i)?.[0]?.replace(/^0+(\d)/, '$1') ||
        requestedCompact.match(/\d{1,4}[a-z]?/i)?.[0]?.replace(/^0+(\d)/, '$1') ||
        '';
    return rowCompact === requestedCompact ||
        rowCompact.endsWith(requestedCompact) ||
        requestedCompact.endsWith(rowCompact) ||
        Boolean(rowPrimary && requestedPrimary && rowPrimary === requestedPrimary);
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
        const aExpansionMatch = expansionMatches(a.set_name || '', structuredCard.expansion || '');
        const bExpansionMatch = expansionMatches(b.set_name || '', structuredCard.expansion || '');
        const aExpansionPenalty = requestedExpansion && !aExpansionMatch ? 1 : 0;
        const bExpansionPenalty = requestedExpansion && !bExpansionMatch ? 1 : 0;
        if (aExpansionPenalty !== bExpansionPenalty) {
            return aExpansionPenalty - bExpansionPenalty;
        }

        const aCollectorPenalty = requestedCollectorNumber && !collectorNumberMatches(a.card_number || '', requestedCollectorNumber) ? 1 : 0;
        const bCollectorPenalty = requestedCollectorNumber && !collectorNumberMatches(b.card_number || '', requestedCollectorNumber) ? 1 : 0;
        if (aCollectorPenalty !== bCollectorPenalty) {
            return aCollectorPenalty - bCollectorPenalty;
        }

        const aExactStructuredMatch = requestedExpansion &&
            requestedCollectorNumber &&
            aExpansionPenalty === 0 &&
            aCollectorPenalty === 0 ? 0 : 1;
        const bExactStructuredMatch = requestedExpansion &&
            requestedCollectorNumber &&
            bExpansionPenalty === 0 &&
            bCollectorPenalty === 0 ? 0 : 1;
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
        collectorNumber: structuredCard.collectorNumber,
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

const sidePanelRefreshTimers = new Map();
const backgroundSearchInFlight = new Map();
const backgroundSearchResultCache = new Map();
const pokoinPriceCache = new Map();
const cardmarketObservationSignatures = new Set();
const cardmarketObservationInFlight = new Map();
let pokoinAuthBridgeInFlight = null;

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
    const storedToken = await getStoredPokoinAuthToken();
    if (storedToken) {
        return { token: storedToken, openedBridge: false };
    }
    await openPokoinAuthBridge();
    return { token: '', openedBridge: true };
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

async function persistPendingCardmarketObservation(payload) {
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
}

async function sendCardmarketObservation(payload = {}) {
    const signature = buildCardmarketObservationSignature(payload);
    if (!signature || cardmarketObservationInFlight.has(signature) || cardmarketObservationSignatures.has(signature)) {
        return { success: true, deduped: true };
    }

    const token = await getStoredPokoinAuthToken();
    if (!token) {
        await persistPendingCardmarketObservation(payload);
        await requestPokoinAuthToken();
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
                await requestPokoinAuthToken();
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
    if (currentStateUrl && sameUrlWithoutHash(currentStateUrl, tab.url) && reason !== 'activated') {
        return;
    }

    const scheduledUrl = tab.url || '';
    clearTimeout(sidePanelRefreshTimers.get(tab.id));
    sidePanelRefreshTimers.set(tab.id, setTimeout(async () => {
        sidePanelRefreshTimers.delete(tab.id);
        try {
            const latestTab = chrome.tabs?.get ? await chrome.tabs.get(tab.id).catch(() => tab) : tab;
            const refreshTab = latestTab?.id ? latestTab : tab;
            if (!sameUrlWithoutHash(scheduledUrl, refreshTab.url || '')) {
                return;
            }

            const { sidePanelState: latestSidePanelState } = await chrome.storage.session.get('sidePanelState');
            if (isLockedCardTraderDirectState(latestSidePanelState, refreshTab.url || scheduledUrl)) {
                return;
            }

            await chrome.storage.session.set({
                sidePanelState: {
                    ...(latestSidePanelState || {}),
                    updatedAt: Date.now(),
                    loading: true,
                    pageInfo: {
                        ...(latestSidePanelState?.pageInfo || {}),
                        title: refreshTab.title || '',
                        url: refreshTab.url || '',
                        hostname: refreshTab.url ? new URL(refreshTab.url).hostname : '',
                    },
                    error: '',
                },
            });
            await resolveActiveTabForSidePanel(refreshTab, { expectedUrl: scheduledUrl });
            console.log(`✅ [Background] Side panel refreshed after ${reason}`);
        } catch (error) {
            console.warn(`⚠️ [Background] Side panel refresh failed after ${reason}:`, error);
        }
    }, 700));
}

async function resolveActiveTabForSidePanel(tab, requestContext = {}) {
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

    await enrichRowsWithPokoinPrices(rows);

    const best = rows[0] || null;
    const blueprintId = best?.card_id ? String(best.card_id) : '';
    const pokoinUrl = blueprintId ? `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${blueprintId}` : '';
    debug.rowCount = rows.length;
    debug.bestId = blueprintId;

    if (requestContext.expectedUrl && !sameUrlWithoutHash(requestContext.expectedUrl, pageInfo.url || tab?.url || '')) {
        console.log('ℹ️ [Background] Ignored stale side panel refresh for changed tab URL');
        return { pageInfo, rows, best, blueprintId, pokoinUrl, error, debug, stale: true };
    }

    const { sidePanelState: latestSidePanelState } = await chrome.storage.session.get('sidePanelState');
    if (
        isLockedCardTraderDirectState(latestSidePanelState, latestSidePanelState?.pageInfo?.url || '') &&
        !pageInfo.cardtraderBlueprintId &&
        !sameCardTraderDirectBlueprint(latestSidePanelState?.pageInfo?.url || '', pageInfo.url || tab?.url || '')
    ) {
        console.log('ℹ️ [Background] Ignored stale refresh behind CardTrader direct state');
        return { pageInfo, rows, best, blueprintId, pokoinUrl, error, debug, stale: true };
    }

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

    await observeCardmarketScrape({ pageInfo, rows, best, blueprintId, pokoinUrl, error, debug }, {
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
            return true;
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
                    const searchResult = await searchExtensionCard(structuredCard);
                    if (searchResult.rows.length > 0) {
                        await enrichRowsWithPokoinPrices(searchResult.rows);
                        if (isCardmarketUrl(requestUrl)) {
                            const legacyRows = searchResult.rows.map(legacyResultFromRow);
                            await sendCardmarketObservation({
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
                            });
                            return legacyRows;
                        }
                        return searchResult.rows.map(legacyResultFromRow);
                    }
                    const fallbackSearch = await searchCardvault(title, structuredCard?.name || '');
                    await enrichRowsWithPokoinPrices(fallbackSearch.rows);
                    return fallbackSearch.rows.map(legacyResultFromRow);
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
    } else if (request.action === 'openSidePanelForCurrentTab') {
        const senderTab = sender.tab;
        if (!senderTab?.id) {
            sendResponse({ success: false, error: 'No sender tab found.' });
            return false;
        }

        const openSidePanelPromise = chrome.sidePanel?.open
            ? chrome.sidePanel.open({ tabId: senderTab.id })
            : Promise.resolve();
        Promise.resolve()
            .then(async () => {
                const tab = await chrome.tabs.get(senderTab.id);
                const currentUrl = request.url || tab.url || senderTab.url || '';
                const currentTitle = request.title || tab.title || senderTab.title || '';
                const directCardTraderBlueprintId = request.cardtraderBlueprintId || cardtraderBlueprintIdFromUrl(currentUrl);
                clearTimeout(sidePanelRefreshTimers.get(tab.id));
                await openSidePanelPromise;
                const requestClues = normalizeRequestClues(request.clues);
                const requestPrimaryClues = normalizeRequestClues(request.primaryClues);
                const requestTitle = buildPrimaryClueSearchTitle(request.originalTitle || currentTitle, requestClues, requestPrimaryClues);
                const selectedCandidateRow = selectedCandidateRowFromRequest(request);
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
                    await chrome.storage.session.set({
                        sidePanelState: {
                            updatedAt: Date.now(),
                            ...directResult,
                        },
                    });
                    return directResult;
                }
                if (selectedCandidateRow) {
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
                    await chrome.storage.session.set({
                        sidePanelState: {
                            updatedAt: Date.now(),
                            ...selectedResult,
                        },
                    });
                    await observeCardmarketScrape(selectedResult, { promoteVerifiedLink: isCardmarketUrl(currentUrl) });
                    return selectedResult;
                }
                await chrome.storage.session.set({
                    sidePanelState: {
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
                    },
                });
                return resolveActiveTabForSidePanel({
                    ...tab,
                    url: currentUrl || tab.url,
                    title: requestTitle || currentTitle || tab.title,
                }, {
                    originalTitle: request.originalTitle || currentTitle,
                    clues: requestClues,
                    primaryClues: requestPrimaryClues,
                    promoteVerifiedLink: isCardmarketUrl(currentUrl),
                });
            })
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