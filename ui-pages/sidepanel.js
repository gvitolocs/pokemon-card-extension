const CARDVAULT_API_BASE_URL = 'https://pokoin.com';
const POKOIN_DESK_ORIGIN = 'https://pokoin.com';
const POKOIN_DESK_SESSION_TYPE = 'POKOIN_EXTENSION_DESK_SESSION';
const POKOIN_DESK_SESSION_REQUEST_TYPE = 'POKOIN_EXTENSION_DESK_SESSION_REQUEST';
const POKOIN_OPEN_TAB_TYPE = 'POKOIN_OPEN_TAB';
const POKOIN_SILVER_PILL_TYPE = 'POKOIN_SILVER_PILL';
const LISTING_RECOGNITION_DISPLAY_THRESHOLD = 0.65;

const elements = {
    cardName: document.getElementById('cardName'),
    status: document.getElementById('status'),
    tabScanBtn: document.getElementById('tabScanBtn'),
    tabScanPreview: document.getElementById('tabScanPreview'),
    tabScanFallback: document.getElementById('tabScanFallback'),
    frameSection: document.getElementById('frameSection'),
    pokoinFrame: document.getElementById('pokoinFrame'),
    candidatesSection: document.getElementById('candidatesSection'),
    candidateList: document.getElementById('candidateList'),
    extensionVersion: document.getElementById('extensionVersion'),
    listingTotal: document.getElementById('listingTotal'),
    emptyActions: document.getElementById('emptyActions'),
    loadListingBtn: document.getElementById('loadListingBtn'),
    analyzeScreenshotBtn: document.getElementById('analyzeScreenshotBtn'),
    powerToolsStatus: document.getElementById('powerToolsStatus'),
    powerToolsBtn: document.getElementById('powerToolsBtn'),
};

function paintExtensionVersion() {
    const node = elements.extensionVersion;
    if (!node) {
        return;
    }
    const version = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version) || '';
    node.textContent = version ? `v${version}` : '';
}

function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('error', isError);
    elements.status.hidden = !message;
}

function showEmptyActions(visible = true) {
    if (elements.emptyActions) {
        elements.emptyActions.hidden = !visible;
    }
}

function listingHasScannablePhotos(pageInfo = {}) {
    const payload = pageInfo.vintedPayload || pageInfo.ebayPayload || pageInfo.marketplacePayload || {};
    return Array.isArray(payload.listingImageUrls) && payload.listingImageUrls.length > 0;
}

function noMatchStatus(pageInfo = {}) {
    if (listingHasScannablePhotos(pageInfo)) {
        return `No cards reached the ${LISTING_RECOGNITION_DISPLAY_THRESHOLD.toFixed(2)} recognition threshold in the listing photos.`;
    }
    return pageInfo.title
        ? `No Pokoin match found for "${pageInfo.title}".`
        : 'No usable listing information or card photos were found on this page.';
}

function isVintedIdleSidePanelState(state = {}) {
    if (state?.debug?.viewportScan || state?.pageInfo?.viewportScan) {
        return false;
    }
    const pageInfo = state?.pageInfo || {};
    if (pageInfo.vintedIdle || state?.debug?.vintedIdle || state?.debug?.matchStage === 'idle') {
        return true;
    }
    const url = String(pageInfo.url || '');
    try {
        const parsed = new URL(url);
        return parsed.hostname.toLowerCase().includes('vinted') && !/(?:^|\/)items\/\d+/i.test(parsed.pathname);
    } catch (_) {
        return false;
    }
}

function recordExtensionDebugEvent(type, details = {}) {
    if (!chrome.runtime?.id || typeof chrome.runtime.sendMessage !== 'function') {
        return Promise.resolve(null);
    }
    return Promise.resolve(chrome.runtime.sendMessage({
        action: 'recordExtensionDebugEvent',
        type,
        details: {
            source: 'sidepanel',
            ...details,
        },
    })).catch(() => null);
}

function sidePanelRowSummaries(rows = []) {
    return (Array.isArray(rows) ? rows : []).slice(0, 40).map((row) => ({
        id: row?.card_id || row?.id || '',
        name: row?.name || '',
        collector: row?.collector_number || row?.collectorNumber || '',
        score: Number(row?.score ?? row?.similarity ?? row?.confidence) || 0,
        source: row?.source || row?.match_source || '',
    }));
}

function isSidePanelAnalysisInFlight(state = {}) {
    const debug = state?.debug || {};
    return Boolean(
        state?.loading
        || debug.loading
        || debug.waitingForVintedPreview
        || debug.automaticPanelAnalysis
        || debug.listingScanPending
        || debug.awaitingChipSearch
        || debug.matchStage === 'awaiting-tokens'
        || debug.matchStage === 'tokens'
        || debug.matchStage === 'scan-merge'
    );
}

function sidePanelRenderDecision(state = {}) {
    if (isVintedIdleSidePanelState(state)) return 'idle';
    if (state?.error) return 'error';
    if (state?.debug?.listingScanPending) return 'listing-scan-pending';
    if ((state?.debug?.awaitingChipSearch || state?.debug?.matchStage === 'tokens') && !state?.best) return 'chip-search-pending';
    if (isSidePanelAnalysisInFlight(state) && !state?.best) return 'loading';
    if ((state?.debug?.readyForUserAction || state?.debug?.matchStage === 'ready') && !state?.best) return 'ready-for-user-action';
    if (state?.pageInfo?.unsupported) return 'unsupported';
    if (!(state?.blueprintId || state?.best?.card_id) || !state?.best) return 'no-match';
    return 'results';
}

const LISTING_TILE_CACHE_KEY = 'pokoinListingTileCache';
const LISTING_TILE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
let listingTileCache = { listings: {} };
let lastSidePanelState = null;
let lastVisibleTileRows = [];
let sidePanelUserActionInFlight = false;
var printLangsIndex = typeof emptyPrintLangsIndex === 'function'
    ? emptyPrintLangsIndex()
    : { ids: {}, img: {} };

async function hydrateSidepanelPrintLangs() {
    if (typeof fetch !== 'function' || typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
        return printLangsIndex;
    }
    if (typeof parsePrintLangsIndex !== 'function') {
        return printLangsIndex;
    }
    try {
        const response = await fetch(chrome.runtime.getURL('data/print-langs.json'));
        if (!response.ok) {
            return printLangsIndex;
        }
        const parsed = parsePrintLangsIndex(await response.json());
        if (parsed && parsed.ids) {
            printLangsIndex = parsed;
        }
    } catch (_) {
        // Tiles still render from row.print_langs or leftover JPEG URLs on the row.
    }
    return printLangsIndex;
}

const printLangsReady = hydrateSidepanelPrintLangs();

function listingTileCacheKey(url = '') {
    return String(url || '').trim().split('#')[0].replace(/\/+$/, '');
}

function emptyListingTileCache() {
    return { listings: {} };
}

function pruneListingTileCache(cache = emptyListingTileCache(), now = Date.now()) {
    const listings = {};
    Object.entries(cache?.listings && typeof cache.listings === 'object' ? cache.listings : {}).forEach(([key, entry]) => {
        const hidden = {};
        const wished = {};
        Object.entries(entry?.hidden && typeof entry.hidden === 'object' ? entry.hidden : {}).forEach(([id, ts]) => {
            const stamp = Number(ts);
            if (id && stamp && now - stamp < LISTING_TILE_TTL_MS) {
                hidden[id] = stamp;
            }
        });
        Object.entries(entry?.wished && typeof entry.wished === 'object' ? entry.wished : {}).forEach(([id, ts]) => {
            const stamp = Number(ts);
            if (id && stamp && now - stamp < LISTING_TILE_TTL_MS) {
                wished[id] = stamp;
            }
        });
        if (Object.keys(hidden).length || Object.keys(wished).length) {
            listings[key] = { hidden, wished };
        }
    });
    return { listings };
}

function listingTileEntry(cache, listingUrl) {
    return cache?.listings?.[listingTileCacheKey(listingUrl)] || { hidden: {}, wished: {} };
}

function tileRowIds(row = {}) {
    return [...new Set([
        String(row.card_id || row.cardId || ''),
        String(row.print_langs?.eur?.id || ''),
        String(row.print_langs?.jp?.id || ''),
        String(row.print_langs?.cn?.id || ''),
    ].filter(Boolean))];
}

function listingTileStampActive(map, id, now = Date.now()) {
    const stamp = Number(map?.[String(id || '')] || 0);
    return Boolean(stamp && now - stamp < LISTING_TILE_TTL_MS);
}

function isListingTileHidden(entry, row, now = Date.now()) {
    return tileRowIds(row).some((id) => listingTileStampActive(entry?.hidden, id, now));
}

function isListingTileWished(entry, row, now = Date.now()) {
    return tileRowIds(row).some((id) => listingTileStampActive(entry?.wished, id, now));
}

function orderListingTiles(rows = [], entry = { hidden: {}, wished: {} }, now = Date.now()) {
    return (Array.isArray(rows) ? rows : [])
        .map((row, index) => ({ row, index }))
        .sort((left, right) => {
            const priceDifference = candidateRowPriceAmount(right.row) - candidateRowPriceAmount(left.row);
            if (priceDifference) {
                return priceDifference;
            }
            const wishDifference = Number(isListingTileWished(entry, right.row, now)) -
                Number(isListingTileWished(entry, left.row, now));
            return wishDifference || left.index - right.index;
        })
        .map(({ row }) => row);
}

function stampListingTile(cache, listingUrl, ids, field, on, now = Date.now()) {
    const key = listingTileCacheKey(listingUrl);
    if (!key || (field !== 'hidden' && field !== 'wished')) {
        return pruneListingTileCache(cache, now);
    }
    const next = pruneListingTileCache(cache, now);
    const entry = {
        hidden: { ...(next.listings[key]?.hidden || {}) },
        wished: { ...(next.listings[key]?.wished || {}) },
    };
    (Array.isArray(ids) ? ids : [ids]).forEach((id) => {
        const clean = String(id || '').trim();
        if (!clean) {
            return;
        }
        if (on) {
            entry[field][clean] = now;
        } else {
            delete entry[field][clean];
        }
    });
    if (!Object.keys(entry.hidden).length && !Object.keys(entry.wished).length) {
        delete next.listings[key];
    } else {
        next.listings[key] = entry;
    }
    return next;
}

function sidePanelListingUrl(state = {}) {
    const pageInfo = state?.pageInfo || {};
    return pageInfo.vintedPayload?.listingKey
        || pageInfo.ebayPayload?.listingKey
        || pageInfo.url
        || '';
}

async function hydrateListingTileCache() {
    try {
        const stored = await chrome.storage?.local?.get?.(LISTING_TILE_CACHE_KEY);
        listingTileCache = pruneListingTileCache(stored?.[LISTING_TILE_CACHE_KEY] || emptyListingTileCache());
    } catch (_) {
        listingTileCache = emptyListingTileCache();
    }
    return listingTileCache;
}

let listingTilePersist = Promise.resolve();

async function persistListingTileCache(next = listingTileCache) {
    listingTileCache = pruneListingTileCache(next);
    listingTilePersist = listingTilePersist.catch(() => null).then(async () => {
        try {
            await chrome.storage?.local?.set?.({ [LISTING_TILE_CACHE_KEY]: listingTileCache });
        } catch (_) {
            // Local hide/wish still apply in this panel session.
        }
        return listingTileCache;
    });
    return listingTilePersist;
}

function selectedTileCardId(row = {}, langs = null, selected = '') {
    return String(langs?.[selected]?.id || row.card_id || row.cardId || '').trim();
}

async function applyListingTileAction({ hide = false, wish = false, wished = false, row = {}, langs = null, selected = '', listingUrl = '' } = {}) {
    const ids = tileRowIds(row);
    const packId = selectedTileCardId(row, langs, selected);
    if (packId && !ids.includes(packId)) {
        ids.push(packId);
    }
    const listing = listingUrl || sidePanelListingUrl(lastSidePanelState);
    if (hide) {
        listingTileCache = stampListingTile(listingTileCache, listing, ids, 'hidden', true);
        renderState(lastSidePanelState);
        await persistListingTileCache(listingTileCache);
        return;
    }
    if (wish) {
        listingTileCache = stampListingTile(listingTileCache, listing, ids, 'wished', wished);
        renderState(lastSidePanelState);
        if (packId && chrome.runtime?.sendMessage) {
            void Promise.resolve(chrome.runtime.sendMessage({
                action: 'savePokoinWatchlist',
                cardId: packId,
                watchlistAction: wished ? 'add' : 'remove',
                listingUrl: listing,
            })).catch(() => null);
        }
        await persistListingTileCache(listingTileCache);
    }
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

function isPokoinDeskMessageOrigin(origin = '') {
    return origin === POKOIN_DESK_ORIGIN || origin === 'https://www.pokoin.com';
}

function publicCardIdFromDeskSrc() {
    const match = String(elements.pokoinFrame?.src || '').match(/\/marketplace\/(?:[a-z]{2}\/)?cards\/(\d+)/i);
    return match ? match[1] : '';
}

function requestForegroundMarketplaceTab(payload = {}) {
    if (typeof chrome.runtime?.sendMessage !== 'function') {
        return;
    }
    void chrome.runtime.sendMessage(payload).catch(() => {});
}

function deskEmbedUrl(pathOrUrl = '') {
    const nextUrl = absolutePokoinUrl(pathOrUrl);
    if (!nextUrl) {
        return '';
    }
    try {
        const parsed = new URL(nextUrl);
        const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
        if (host === 'pokoin.com') {
            parsed.searchParams.set('pokoin_embed', '1');
            return parsed.toString();
        }
    } catch (error) {
        return nextUrl;
    }
    return nextUrl;
}

function pokoinPublicIdFromCardTraderId(cardTraderId = '') {
    const clean = String(cardTraderId || '').trim();
    if (!/^[1-9]\d*$/.test(clean)) {
        return '';
    }
    try {
        return String(BigInt(clean) * 2n);
    } catch (error) {
        return '';
    }
}

function tileLangsForRow(row = {}) {
    row = row && typeof row === 'object' ? row : {};
    const index = typeof printLangsIndex === 'object' ? printLangsIndex : undefined;
    const bundled = typeof printLangsForCardId === 'function'
        ? printLangsForCardId(row.card_id || row.cardId, index, row.name || row.name_en || '')
        : null;
    const fromRow = typeof mergePrintLangs === 'function'
        ? mergePrintLangs(row.print_langs, bundled)
        : (row.print_langs || bundled);
    if (typeof tilePrintLangs === 'function') {
        return tilePrintLangs(row, fromRow, index);
    }
    if (typeof normalizePrintLangs === 'function') {
        return normalizePrintLangs(row, fromRow);
    }
    return fromRow;
}

function cardUrl(rowOrBlueprintId, options = {}) {
    if (rowOrBlueprintId && typeof rowOrBlueprintId === 'object') {
        const row = rowOrBlueprintId;
        const langs = tileLangsForRow(row);
        if (langs && row.source !== 'cardtrader_url') {
            const selected = typeof defaultPrintLangKey === 'function'
                ? defaultPrintLangKey(row, langs)
                : 'eur';
            const packId = langs[selected]?.id;
            if (packId) {
                return typeof printLangDeskUrl === 'function'
                    ? printLangDeskUrl(packId)
                    : `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${encodeURIComponent(packId)}`;
            }
        }
        const directUrl = row.canonicalUrl ||
            row.canonical_url ||
            row.marketplaceUrl ||
            row.marketplace_url ||
            '';
        const fromFields = absolutePokoinUrl(directUrl) ||
            absolutePokoinUrl(row.canonicalPath || row.canonical_path || row.marketplacePath || row.marketplace_path);
        if (fromFields) {
            return fromFields;
        }
        if (row.source === 'cardtrader_url') {
            const publicId = pokoinPublicIdFromCardTraderId(row.card_id || row.blueprint_id || '');
            return publicId ? `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${encodeURIComponent(publicId)}` : '';
        }
        return row.card_id ? `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${encodeURIComponent(row.card_id)}` : '';
    }
    return `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${encodeURIComponent(rowOrBlueprintId)}`;
}

function openWithWindow(url) {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
        return false;
    }
    window.open(url, '_blank', 'noopener');
    return true;
}

function openCandidateUrl(url) {
    const targetUrl = absolutePokoinUrl(url);
    if (!targetUrl) {
        return false;
    }

    try {
        const createTab = typeof chrome === 'undefined' ? null : chrome?.tabs?.create;
        if (typeof createTab === 'function') {
            const result = createTab.call(chrome.tabs, { url: targetUrl, active: true });
            if (result && typeof result.catch === 'function') {
                result.catch(() => openWithWindow(targetUrl));
            }
            return true;
        }
    } catch (error) {
        // Fall through to window.open when the tabs API is unavailable in tests or browsers.
    }

    return openWithWindow(targetUrl);
}

function cardTraderUrl(blueprintId) {
    return `${CARDVAULT_API_BASE_URL}/api/cardtrader-redirect?id=${encodeURIComponent(blueprintId)}`;
}

function canonicalFrameUrlKey(pathOrUrl = '') {
    const absoluteUrl = absolutePokoinUrl(pathOrUrl);
    if (!absoluteUrl) {
        return '';
    }

    try {
        const parsed = new URL(absoluteUrl);
        const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
        const pathname = parsed.pathname.replace(/\/+$/, '') || '/';

        const pokoinCardId = pathname.match(/^\/marketplace\/(?:[a-z]{2}\/)?cards\/([^/]+)/i)?.[1] || '';
        if (hostname === 'pokoin.com' && pokoinCardId) {
            return `pokoin-card:${decodeURIComponent(pokoinCardId)}`;
        }

        const cardTraderRedirectId = hostname === 'pokoin.com' && pathname === '/api/cardtrader-redirect'
            ? parsed.searchParams.get('id') || ''
            : '';
        if (cardTraderRedirectId) {
            return `pokoin-card:${cardTraderRedirectId}`;
        }

        const cardTraderBlueprintId = hostname.includes('cardtrader')
            ? pathname.match(/^\/(?:[a-z]{2}\/)?cards\/(\d+)(?:-|\/|$)/i)?.[1] || ''
            : '';
        if (cardTraderBlueprintId) {
            return `pokoin-card:${cardTraderBlueprintId}`;
        }

        const sortedSearch = [...parsed.searchParams.entries()]
            .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        return `${parsed.protocol}//${hostname}${pathname}${sortedSearch ? `?${sortedSearch}` : ''}`;
    } catch (error) {
        return absoluteUrl;
    }
}

function updatePokoinFrameUrl(pathOrUrl = '', options = {}) {
    const nextUrl = deskEmbedUrl(pathOrUrl);
    if (!nextUrl || !elements.pokoinFrame) {
        return false;
    }
    const force = Boolean(options.force);
    const nextKey = canonicalFrameUrlKey(nextUrl);
    const dataset = elements.pokoinFrame.dataset || (elements.pokoinFrame.dataset = {});
    const currentUrl = dataset.pokoinUrl || elements.pokoinFrame.getAttribute?.('src') || elements.pokoinFrame.src || '';
    const currentKey = dataset.pokoinUrlKey || canonicalFrameUrlKey(currentUrl);

    if (!force && nextKey && currentKey === nextKey) {
        dataset.pokoinUrl = nextUrl;
        dataset.pokoinUrlKey = nextKey;
        void recordExtensionDebugEvent('sidepanel.iframe-reused', {
            pokoinUrl: nextUrl,
            frameKey: nextKey,
        });
        void injectPokoinDeskSession();
        return false;
    }

    // Same src while display:none does not reload. Bounce so Chrome paints
    // after the CardTrader button unhides the desk.
    if (force && nextKey && currentKey === nextKey) {
        elements.pokoinFrame.src = 'about:blank';
    }
    elements.pokoinFrame.src = nextUrl;
    dataset.pokoinUrl = nextUrl;
    dataset.pokoinUrlKey = nextKey;
    void recordExtensionDebugEvent('sidepanel.iframe-url-changed', {
        previousUrl: currentUrl,
        pokoinUrl: nextUrl,
        previousFrameKey: currentKey,
        frameKey: nextKey,
        force,
    });
    return true;
}

function hidePokoinDeskFrame() {
    if (!elements.frameSection) {
        return;
    }
    elements.frameSection.hidden = true;
    elements.frameSection.classList.toggle('frame-section-direct', false);
    document.body.classList.toggle('direct-card-view', false);
}

function showPokoinDeskFrame(pokoinUrl = '') {
    if (!elements.frameSection) {
        return;
    }
    elements.frameSection.classList.toggle('frame-section-direct', true);
    document.body.classList.toggle('direct-card-view', true);
    elements.candidatesSection.hidden = true;
    // Unhide before assigning src. Navigating a display:none iframe stays black
    // after the CardTrader button click (Chrome does not paint that document).
    const wasHidden = Boolean(elements.frameSection.hidden);
    elements.frameSection.hidden = false;
    updatePokoinFrameUrl(pokoinUrl, { force: wasHidden });
}

function nameFromCardTraderSlug(value = '') {
    const rawValue = String(value || '').trim();
    let pathname = rawValue;

    try {
        pathname = new URL(rawValue).pathname;
    } catch (error) {
        pathname = rawValue;
    }

    const slug = pathname.match(/\/(?:[a-z]{2}\/)?cards\/\d+(?:-|\/)([^/?#]+)/i)?.[1] || '';
    if (!slug) {
        return '';
    }

    return decodeURIComponent(slug)
        .replace(/[-_]+/g, ' ')
        .replace(/\b(?:and)\b/gi, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b(?:ex|gx|vmax|vstar|v|lv x)\b/gi, (match) => match.toUpperCase())
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeCardTraderDirectTitle(value = '') {
    return String(value || '')
        .replace(/^(.+?)\s*\([^)]*(?:\||\d{1,4}\s*\/\s*\d{1,4}|©|Wizards|WOTC)[^)]*\).*$/i, '$1')
        .replace(/\s*\|\s*(?:CardTrader|Pok[eé]mon)\s*$/gi, '')
        .replace(/\s*\|.*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isSlugLikeCardName(value = '') {
    const cleanValue = String(value || '').trim();
    return /^https?:\/\//i.test(cleanValue) ||
        /cardtrader\.com/i.test(cleanValue) ||
        /\/cards\/\d+/i.test(cleanValue);
}

function escapeRegExp(value = '') {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripCardTraderExpansionSuffix(value = '') {
    return String(value || '')
        .replace(/\s+\b(?:Wizards\s+of\s+the\s+Coast(?:\s+Era)?(?:\s+Promos)?|WOTC(?:\s+Promos)?|Black\s+Star\s+Promos?|Team\s+Up|Base\s+Set|Jungle|Fossil|Rocket|Gym\s+(?:Heroes|Challenge)|Neo\s+\w+|EX\s+\w+|Diamond\s+&\s+Pearl|Platinum|HeartGold\s+SoulSilver|Black\s+&\s+White|XY|Sun\s+&\s+Moon|Sword\s+&\s+Shield|Scarlet\s+&\s+Violet)\b.*$/i, '')
        .replace(/\s+\b(?:Promo|Promos|Singles?|Cards?|Pok[eé]mon)\b.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanCardTraderDisplayCandidate(value = '', slugName = '') {
    const cleanValue = normalizeCardTraderDirectTitle(value);
    if (!cleanValue || isSlugLikeCardName(cleanValue)) {
        return '';
    }

    if (slugName) {
        const slugPrefix = cleanValue.match(new RegExp(`^\\s*${escapeRegExp(slugName)}\\b`, 'i'))?.[0] || '';
        if (slugPrefix) {
            return slugPrefix.replace(/\s+/g, ' ').trim();
        }
    }

    return stripCardTraderExpansionSuffix(cleanValue) || cleanValue;
}

function directCardDisplayName(pageInfo = {}, best = null, blueprintId = '') {
    const slugName = stripCardTraderExpansionSuffix(nameFromCardTraderSlug(pageInfo.url || pageInfo.title || best?.name || ''));
    const structuredName = pageInfo.structuredCard?.name || '';
    const bestName = best?.name || '';
    const pageTitle = pageInfo.structuredCard?.title || pageInfo.title || '';

    for (const candidate of [bestName, structuredName, pageTitle]) {
        const cleanCandidate = cleanCardTraderDisplayCandidate(candidate, slugName);
        if (cleanCandidate) {
            return cleanCandidate;
        }
    }

    return slugName || `Blueprint ${blueprintId}`;
}

const expansionLogoCache = new Map();
let expansionLogoPromise = null;

function normalizeExpansionName(value = '') {
    return String(value).trim().toLowerCase();
}

function slugifyExpansion(value = '') {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 140);
}

async function loadExpansionLogos() {
    if (expansionLogoPromise) {
        return expansionLogoPromise;
    }

    expansionLogoPromise = fetch(`${CARDVAULT_API_BASE_URL}/api/marketplace-expansions?limit=2000`)
        .then((response) => response.ok ? response.json() : { expansions: [] })
        .then((payload) => {
            for (const expansion of payload.expansions || []) {
                const logoUrl = expansion.symbolImageUrl || '';
                if (expansion.name && logoUrl) {
                    expansionLogoCache.set(normalizeExpansionName(expansion.name), logoUrl);
                }
            }
            return expansionLogoCache;
        })
        .catch(() => expansionLogoCache);

    return expansionLogoPromise;
}

function expansionName(row = {}) {
    return row.set_name || row.expansion_name || row.expansionName || row.expansion_name_en || '';
}

function expansionLogoUrl(row) {
    const directLogo = row.expansion_symbol_url || row.expansionSymbolUrl || row.symbolImageUrl || row.symbol_image_url || row.symbol_image || '';
    if (directLogo) {
        return directLogo;
    }

    const setName = expansionName(row);
    const cachedLogo = expansionLogoCache.get(normalizeExpansionName(setName));
    if (cachedLogo) {
        return cachedLogo;
    }

    const slug = slugifyExpansion(setName);
    return slug ? `https://cdn.pokoin.com/expansions/symbols/${slug}.png` : '';
}

function firstCollectorNumber(value = '') {
    const cleanValue = String(value || '');
    const slashNumber = cleanValue.match(/\b(?:[A-Z]{1,6}\s?)?(\d{1,4}[a-z]?)\s*\/\s*\d{1,4}[a-z]?\b/i);
    if (slashNumber) {
        return slashNumber[1].replace(/\s+/g, '');
    }

    const pipeNumber = cleanValue.match(/\|\s*(?:[A-Z]{1,6}\s?)?(\d{1,4}[a-z]?)\b/i);
    if (pipeNumber) {
        return pipeNumber[1].replace(/\s+/g, '');
    }

    const promoNumber = cleanValue.match(/\b(?:[A-Z]{1,6}\s?)?(\d{1,4}[a-z]?)\b/i);
    return promoNumber ? promoNumber[1].replace(/\s+/g, '') : '';
}

function collectorPrefix(value = '') {
    const cleanValue = String(value || '');
    return (
        cleanValue.match(/\b([A-Z]{1,6})\s?\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i)?.[1] ||
        cleanValue.match(/\|\s*([A-Z]{1,6})\s?\d{1,4}[a-z]?\b/i)?.[1] ||
        cleanValue.match(/\b([A-Z]{1,6})\s?\d{1,4}[a-z]?\b/i)?.[1] ||
        ''
    ).toUpperCase();
}

function expansionShortName(row = {}) {
    const explicit = row.expansion_code || row.expansionCode || row.set_code || row.setCode || '';
    if (explicit) {
        return explicit;
    }

    const setName = String(row.set_name || row.expansion_name || '').trim();
    const promoPrefix = collectorPrefix(row.card_number);
    if (promoPrefix) {
        return promoPrefix.toUpperCase();
    }

    const initials = setName
        .replace(/\b(?:and|of|the|a|an)\b/gi, ' ')
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .toUpperCase();

    return initials.length >= 2 && initials.length <= 5 ? initials : setName;
}

function compactCandidateMeta(row = {}, { includePrice = true, langKey = '', album = false } = {}) {
    const langs = tileLangsForRow(row);
    const selected = langKey
        || (langs && typeof defaultPrintLangKey === 'function'
            ? defaultPrintLangKey(row, langs, { album })
            : '');
    const pack = selected && langs ? langs[selected] : null;
    let collector = firstCollectorNumber(row.card_number);
    let expansion = expansionShortName(row);
    const leftoverUrl = pack?.image_url || '';
    const fromPack = leftoverUrl && typeof leftoverMetaFromUrl === 'function'
        ? leftoverMetaFromUrl(leftoverUrl)
        : leftoverUrl && typeof collectorLabelFromLeftoverUrl === 'function'
            ? {
                collector: collectorLabelFromLeftoverUrl(leftoverUrl),
                expansion: typeof expansionLabelFromLeftoverUrl === 'function'
                    ? expansionLabelFromLeftoverUrl(leftoverUrl)
                    : '',
            }
            : null;
    if (fromPack?.collector) {
        collector = /[A-Za-z]/.test(fromPack.collector)
            ? fromPack.collector
            : (firstCollectorNumber(fromPack.collector) || fromPack.collector);
    }
    if (fromPack?.expansion) {
        expansion = fromPack.expansion;
    }
    const price = includePrice
        ? (row.pokoin_price || row.pokoinPrice || row.price_formatted || row.priceFormatted || '')
        : '';
    return [collector, expansion, price].filter(Boolean).join(' · ');
}

function candidatePriceLabel(row = {}) {
    return row.pokoin_price || row.pokoinPrice || row.price_formatted || row.priceFormatted || '';
}

function parsePokoinPknAmount(label = '') {
    if (/^out of stock$/i.test(String(label || '').trim())) {
        return 0;
    }
    const text = String(label || '').replace(/,/g, '');
    const match = text.match(/([0-9]+(?:\.[0-9]+)?)/);
    const amount = match ? Number(match[1]) : 0;
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function formatPokoinPknPrice(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
        return '';
    }
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)} PKN`;
}

function langPriceLabel(row = {}, langKey = '') {
    const prices = row.print_lang_prices && typeof row.print_lang_prices === 'object'
        ? row.print_lang_prices
        : {};
    if (langKey && prices[langKey]) {
        return prices[langKey];
    }
    return candidatePriceLabel(row);
}

function paintCandidatePrice(node, label = '') {
    if (!node) {
        return;
    }
    const text = String(label || '');
    const amount = parsePokoinPknAmount(text);
    node.textContent = text || '…';
    node.className = `candidate-price${/^out of stock$/i.test(text) ? ' candidate-price-oos' : ''}`;
    node.setAttribute('class', node.className);
    node.setAttribute('data-pkn', amount > 0 ? String(amount) : '0');
}

function hideListingTotal() {
    const node = elements.listingTotal;
    if (!node) {
        return;
    }
    node.hidden = true;
    node.textContent = '';
}

function candidateRowPriceAmount(row = {}) {
    const langs = tileLangsForRow(row);
    const selected = typeof defaultPrintLangKey === 'function'
        ? defaultPrintLangKey(row, langs || {}, { album: true })
        : '';
    const fromLang = Number(row?.print_lang_price_pkn?.[selected]) || 0;
    if (fromLang > 0) {
        return fromLang;
    }
    return parsePokoinPknAmount(langPriceLabel(row, selected));
}

function paintListingTotal(rows = null) {
    const node = elements.listingTotal;
    if (!node) {
        return;
    }
    if (elements.candidatesSection?.hidden) {
        hideListingTotal();
        return;
    }
    let total = 0;
    let counted = 0;
    const prices = elements.candidateList?.querySelectorAll?.('.candidate-price');
    if (prices && prices.length) {
        [...prices].forEach((el) => {
            const amount = Number(el.getAttribute?.('data-pkn')) || parsePokoinPknAmount(el.textContent);
            if (amount > 0) {
                total += amount;
                counted += 1;
            }
        });
    }
    if (!counted) {
        (Array.isArray(rows) && rows.length ? rows : lastVisibleTileRows).forEach((row) => {
            const amount = candidateRowPriceAmount(row);
            if (amount > 0) {
                total += amount;
                counted += 1;
            }
        });
    }
    if (!counted) {
        hideListingTotal();
        return;
    }
    node.hidden = false;
    node.removeAttribute?.('hidden');
    node.textContent = formatPokoinPknPrice(total);
}

function assignCrossOriginImage(image, url = '') {
    const next = String(url || '').trim();
    if (!image) {
        return;
    }
    // Extension pages use COEP require-corp for on-device WASM. Leftover and
    // CDN card art send ACAO * but not CORP, so no-cors <img> loads are blocked.
    if (/^https?:\/\//i.test(next)) {
        image.crossOrigin = 'anonymous';
        image.setAttribute?.('crossorigin', 'anonymous');
    }
    image.src = next;
}

function pokoinCdnPreviewUrl(cardId = '', name = '') {
    const id = String(cardId || '').trim();
    if (!id) {
        return '';
    }
    const slug = slugifyExpansion(name);
    return slug
        ? `https://cdn.pokoin.com/previews/${encodeURIComponent(id)}_${slug}.jpg`
        : `https://cdn.pokoin.com/previews/${encodeURIComponent(id)}.jpg`;
}

function homepageTileImageUrl(row = {}, cardId = '', leftoverUrl = '') {
    if (typeof homepageDerivativeUrl !== 'function') {
        return '';
    }
    const fromPack = homepageDerivativeUrl(leftoverUrl);
    if (fromPack) {
        return fromPack;
    }
    const id = String(cardId || row.card_id || '').trim();
    const fromIndex = typeof leftoverScanUrl === 'function' && typeof printLangsIndex === 'object'
        ? leftoverScanUrl(id, printLangsIndex, row.name || row.name_en || '')
        : '';
    return homepageDerivativeUrl(
        fromIndex
        || row.image_url
        || row.imageUrl
        || row.preview_image_url
        || row.previewImageUrl
        || row.cdn_image_url
        || row.cdnImageUrl
        || '',
    ) || '';
}

function langDisplayImageUrl(row = {}, pack = null, options = {}) {
    if (options.album && pack?.id) {
        return homepageTileImageUrl(row, pack.id, pack.image_url)
            || pack.image_url
            || pokoinCdnPreviewUrl(pack.id, row.name || row.name_en || '');
    }
    return pack?.image_url || '';
}

function defaultPrintLangKey(row = {}, langs = {}, options = {}) {
    const order = typeof PRINT_LANG_ORDER !== 'undefined' ? PRINT_LANG_ORDER : ['eur', 'jp', 'cn'];
    return order.find((key) => langDisplayImageUrl(row, langs?.[key], options)) || 'eur';
}

function candidatePreviewImageUrl(row = {}, options = {}) {
    const langs = tileLangsForRow(row);
    if (langs) {
        const selected = defaultPrintLangKey(row, langs, options);
        const fromLang = langDisplayImageUrl(row, langs?.[selected], options);
        if (fromLang) {
            return fromLang;
        }
        if (options.album) {
            return homepageTileImageUrl(row) || pokoinCdnPreviewUrl(row.card_id, row.name);
        }
    }
    if (options.album) {
        return homepageTileImageUrl(row) || pokoinCdnPreviewUrl(row.card_id, row.name);
    }
    return row.preview_image_url
        || row.previewImageUrl
        || row.image_url
        || row.imageUrl
        || row.cdn_image_url
        || row.cdnImageUrl
        || pokoinCdnPreviewUrl(row.card_id, row.name);
}

function isAlbumListing(pageInfo = {}) {
    return pageInfo.structuredCard?.listingKind === 'album'
        || pageInfo.vintedPayload?.listingKind === 'album'
        || pageInfo.marketplacePayload?.listingKind === 'album';
}

function leftoverTileCandidates(rows = []) {
    if (typeof uniqueRowsByLeftoverTile !== 'function') {
        return Array.isArray(rows) ? rows : [];
    }
    return uniqueRowsByLeftoverTile(rows, printLangsIndex);
}

function isIgnoredMarketplaceCard(row = {}) {
    const compact = String(row.name || row.name_en || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
    if (!compact) {
        return false;
    }
    return compact.includes('blankfillercard')
        || compact.includes('pokemoncardback')
        || compact === 'cardback';}

function renderCandidate(row, isBest = false, options = {}) {
    const isTile = options.layout === 'tile';
    const link = document.createElement('a');
    link.className = `candidate${isBest && !isTile ? ' candidate-best' : ''}${isTile ? ' candidate-tile' : ''}${isTile && Number(row.leftoverCopies) > 1 ? ' leftover-stack' : ''}`;
    link.href = cardUrl(row);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        openCandidateUrl(link.href);
    });
    link.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
        event.stopPropagation?.();
        openCandidateUrl(link.href);
    });

    const imageUrl = candidatePreviewImageUrl(row, options);
    const langs = tileLangsForRow(row);
    const langOrder = typeof PRINT_LANG_ORDER !== 'undefined' ? PRINT_LANG_ORDER : ['eur', 'jp', 'cn'];
    const langLabels = typeof PRINT_LANG_LABELS !== 'undefined' ? PRINT_LANG_LABELS : { eur: 'EN', jp: 'JP', cn: 'CN' };
    const listingUrl = options.listingUrl || '';
    const wished = Boolean(options.wished);
    const logoUrl = expansionLogoUrl(row);
    const mediaSlot = document.createElement('span');
    mediaSlot.className = 'candidate-media-slot';

    const appendPreviewImage = () => {
        const image = document.createElement('img');
        image.className = 'candidate-preview-image';
        image.setAttribute('class', 'candidate-preview-image');
        image.alt = row.name || '';
        image.loading = 'lazy';
        assignCrossOriginImage(image, imageUrl);
        const host = options.album
            ? (() => {
                const cut = document.createElement('span');
                cut.className = 'art-cut';
                cut.setAttribute('class', 'art-cut');
                mediaSlot.appendChild(cut);
                return cut;
            })()
            : mediaSlot;
        image.addEventListener('error', () => {
            const current = String(image.src || '');
            if (options.album && /_homepage\.webp(?:\?|$)/i.test(current)) {
                assignCrossOriginImage(image, current.replace(/_homepage\.webp(\?|$)/i, '.jpg$1'));
                return;
            }
            if (options.album && /https:\/\/pokoin\.com\/card-images\//i.test(current)) {
                assignCrossOriginImage(
                    image,
                    current.replace(/https:\/\/pokoin\.com\/card-images\//i, 'https://cdn.pokoin.com/'),
                );
                return;
            }
            image.remove();
            mediaSlot.classList?.add?.('candidate-media-empty');
        });
        host.appendChild(image);
    };

    const appendLogo = (className) => {
        const logo = document.createElement('img');
        logo.className = className;
        logo.alt = '';
        logo.loading = 'lazy';
        assignCrossOriginImage(logo, logoUrl);
        logo.addEventListener('error', () => {
            logo.remove();
            if (imageUrl && className === 'candidate-logo') {
                appendPreviewImage();
            } else if (!mediaSlot.children?.length) {
                mediaSlot.classList?.add?.('candidate-media-empty');
            }
        }, { once: true });
        mediaSlot.appendChild(logo);
    };

    if (isTile) {
        if (imageUrl) {
            appendPreviewImage();
            if (logoUrl) {
                appendLogo('candidate-logo-badge');
            }
        } else if (logoUrl) {
            appendLogo('candidate-logo');
        } else {
            mediaSlot.classList?.add?.('candidate-media-empty');
        }
    } else if (logoUrl) {
        appendLogo('candidate-logo');
    } else if (imageUrl) {
        appendPreviewImage();
    } else {
        mediaSlot.classList?.add?.('candidate-media-empty');
    }

    let selected = isTile
        ? defaultPrintLangKey(row, langs || {}, options)
        : '';
    if (isTile) {
        const hideBtn = document.createElement('button');
        hideBtn.type = 'button';
        hideBtn.className = 'candidate-tile-hide';
        hideBtn.setAttribute('class', 'candidate-tile-hide');
        hideBtn.setAttribute('aria-label', 'Hide this card');
        hideBtn.textContent = '×';
        hideBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void applyListingTileAction({
                hide: true,
                row,
                langs,
                selected,
                listingUrl,
            });
        });
        const wishBtn = document.createElement('button');
        wishBtn.type = 'button';
        wishBtn.className = wished ? 'candidate-tile-wish is-wished' : 'candidate-tile-wish';
        wishBtn.setAttribute('class', wishBtn.className);
        wishBtn.setAttribute('aria-label', wished ? 'Remove from wishlist' : 'Save to wishlist');
        wishBtn.setAttribute('aria-pressed', wished ? 'true' : 'false');
        wishBtn.textContent = '♥';
        wishBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void applyListingTileAction({
                wish: true,
                wished: !wished,
                row,
                langs,
                selected,
                listingUrl,
            });
        });
        mediaSlot.append(hideBtn, wishBtn);
    }

    const copy = document.createElement('span');
    copy.className = 'candidate-copy';

    const title = document.createElement('strong');
    title.textContent = row.name || `Blueprint ${row.card_id}`;

    const meta = document.createElement('span');
    meta.className = 'candidate-meta';
    meta.textContent = compactCandidateMeta(row, { includePrice: !isTile, album: options.album });

    copy.append(title, meta);
    if (isTile) {
        const priceEl = document.createElement('span');
        paintCandidatePrice(priceEl, langPriceLabel(row, selected));
        copy.append(priceEl);
        const toggle = document.createElement('span');
        toggle.className = 'candidate-lang-toggle';
        toggle.setAttribute('class', 'candidate-lang-toggle');
        toggle.setAttribute('role', 'group');
        toggle.setAttribute('aria-label', 'Card print language');
        const image = () => mediaSlot.querySelector('.candidate-preview-image');
        langOrder.forEach((key) => {
            const pack = langs?.[key] || null;
            const displayUrl = langDisplayImageUrl(row, pack, options);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'candidate-lang-btn';
            button.setAttribute('class', 'candidate-lang-btn');
            button.textContent = langLabels[key] || key.toUpperCase();
            button.disabled = !displayUrl;
            button.setAttribute('aria-pressed', selected === key ? 'true' : 'false');
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!displayUrl) {
                    return;
                }
                selected = key;
                toggle.querySelectorAll('.candidate-lang-btn').forEach((node) => {
                    node.setAttribute('aria-pressed', node === button ? 'true' : 'false');
                });
                if (image()) {
                    assignCrossOriginImage(image(), displayUrl);
                }
                meta.textContent = compactCandidateMeta(row, {
                    includePrice: !isTile,
                    langKey: key,
                    album: options.album,
                });
                paintCandidatePrice(priceEl, langPriceLabel(row, key));
                paintListingTotal();
                if (pack?.id && row.source !== 'cardtrader_url') {
                    link.href = typeof printLangDeskUrl === 'function'
                        ? printLangDeskUrl(pack.id)
                        : `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${encodeURIComponent(pack.id)}`;
                }
            });
            toggle.appendChild(button);
        });
        copy.append(toggle);
        // print-langs.v is COUNT(*) by English name (all Iron Treads ex).
        // Desk versions are that printing's lineage (D00000T). Do not paint the name dump.
    }

    link.append(mediaSlot, copy);
    return link;
}

function renderState(state) {
    lastSidePanelState = state;
    const pageInfo = state?.pageInfo || {};
    const best = state?.best || null;
    const blueprintId = state?.blueprintId || best?.card_id || '';
    const isCardTraderDirect = Boolean(pageInfo.cardtraderBlueprintId || best?.source === 'cardtrader_url');

    void recordExtensionDebugEvent('sidepanel.render', {
        decision: sidePanelRenderDecision(state),
        stateUpdatedAt: state?.updatedAt || 0,
        url: pageInfo.url || '',
        requestId: state?.debug?.sidePanelRequestId || null,
        reason: state?.debug?.sidePanelReason || '',
        matchStage: state?.debug?.matchStage || '',
        listingScanPending: Boolean(state?.debug?.listingScanPending),
        provisionalRowCount: Number(state?.debug?.provisionalRowCount) || 0,
        loading: Boolean(state?.loading),
        error: state?.error || '',
        bestId: state?.best?.card_id || state?.blueprintId || '',
        rows: sidePanelRowSummaries(state?.rows),
    });

    elements.candidatesSection.hidden = true;
    elements.frameSection.classList.toggle('frame-section-direct', false);
    document.body.classList.toggle('direct-card-view', false);
    document.body.classList.toggle('album-card-view', false);
    document.body.classList.toggle('leftover-embed-view', false);
    elements.candidatesSection.classList.toggle('album-marketplace', false);
    elements.candidateList.classList.toggle('candidate-grid', false);
    elements.candidateList.classList.toggle('candidate-grid-single', false);
    elements.candidateList.classList.toggle('leftover-embed-grid', false);
    elements.candidateList.replaceChildren();
    hideListingTotal();
    showEmptyActions(false);

    if (isVintedIdleSidePanelState(state)) {
        hidePokoinDeskFrame();
        elements.cardName.textContent = 'Ready to analyze';
        setStatus('Open a marketplace listing, then load its information or analyze the visible tab.');
        showEmptyActions(true);
        return;
    }

    if (state?.error) {
        hidePokoinDeskFrame();
        elements.cardName.textContent = 'Could not analyze this tab';
        setStatus(state.error, true);
        showEmptyActions(true);
        return;
    }

    if (state?.debug?.listingScanPending) {
        hidePokoinDeskFrame();
        elements.cardName.textContent = 'Analyzing listing photos...';
        setStatus('The on-device scanner is identifying cards before listing clues are searched.');
        return;
    }

    if ((state?.debug?.awaitingChipSearch || state?.debug?.matchStage === 'tokens') && !state?.best) {
        hidePokoinDeskFrame();
        elements.cardName.textContent = 'Searching listing clues...';
        setStatus('The photo scan finished; Pokoin is checking the listing details.');
        return;
    }

    if (isSidePanelAnalysisInFlight(state) && !state?.best) {
        hidePokoinDeskFrame();
        elements.cardName.textContent = 'Analyzing listing photos...';
        setStatus('The side panel is open, so Pokoin is scanning this listing now.');
        return;
    }

    if ((state?.debug?.readyForUserAction || state?.debug?.matchStage === 'ready') && !state?.best) {
        hidePokoinDeskFrame();
        elements.cardName.textContent = 'Ready to analyze';
        setStatus('Choose how to analyze this Chrome tab.');
        showEmptyActions(true);
        return;
    }

    if (pageInfo.unsupported) {
        hidePokoinDeskFrame();
        elements.cardName.textContent = 'Unsupported page';
        setStatus('Open a supported eBay, Vinted, or Cardmarket listing, then click the extension icon again.', true);
        showEmptyActions(true);
        return;
    }

    if (!blueprintId || !best) {
        hidePokoinDeskFrame();
        elements.cardName.textContent = 'No match found';
        setStatus(noMatchStatus(pageInfo), true);
        showEmptyActions(true);
        return;
    }

    const rows = (state.rows?.length ? state.rows : [best])
        .filter((row) => !isIgnoredMarketplaceCard(row))
        .map((row) => (typeof applyWesternEmbed === 'function'
            ? applyWesternEmbed({ ...row }, printLangsIndex)
            : row));
    const candidates = rows;
    if (candidates.length === 0) {
        hidePokoinDeskFrame();
        elements.cardName.textContent = 'No match found';
        setStatus(noMatchStatus(pageInfo), true);
        showEmptyActions(true);
        return;
    }
    const debug = state?.debug || {};
    const openAllCards = Boolean(debug.openAllCards);
    const selectedCandidateId = openAllCards
        ? ''
        : String(debug.selectedCandidateId || pageInfo.selectedCandidateId || '');
    const focused = selectedCandidateId
        ? candidates.find((row) => String(row.card_id) === selectedCandidateId)
        : null;
    const viewCandidates = leftoverTileCandidates(focused ? [focused] : candidates);
    const viewBest = viewCandidates[0] || best;
    const pokoinUrl = cardUrl(viewBest) || cardUrl(best) || state.pokoinUrl;
    const deskLayout = isCardTraderDirect || viewCandidates.length === 1;
    const tileLayout = !deskLayout && viewCandidates.length >= 2;
    const listingUrl = sidePanelListingUrl(state);
    const listingEntry = listingTileEntry(listingTileCache, listingUrl);
    const visibleCandidates = (tileLayout ? viewCandidates.filter((row) => !isListingTileHidden(listingEntry, row)) : viewCandidates);
    const orderedCandidates = tileLayout
        ? orderListingTiles(visibleCandidates, listingEntry)
        : visibleCandidates;
    const headerCount = tileLayout ? orderedCandidates.length : viewCandidates.length;
    const cardTraderName = isCardTraderDirect
        ? directCardDisplayName(pageInfo, viewBest, blueprintId)
        : '';

    elements.cardName.textContent = isCardTraderDirect
        ? (cardTraderName || '1 card')
        : (headerCount === 1
            ? (viewCandidates[0]?.name || viewBest?.name || '1 card')
            : `${headerCount} cards`);
    document.body.classList.toggle('album-card-view', tileLayout);
    document.body.classList.toggle('leftover-embed-view', false);
    elements.candidatesSection.classList.toggle('album-marketplace', tileLayout);
    elements.candidateList.classList.toggle('candidate-grid', tileLayout);
    elements.candidateList.classList.toggle('candidate-grid-single', false);
    elements.candidateList.classList.toggle('leftover-embed-grid', false);
    elements.frameSection.classList.toggle('frame-section-direct', deskLayout);
    document.body.classList.toggle('direct-card-view', deskLayout);
    setStatus('');

    if (deskLayout) {
        showPokoinDeskFrame(pokoinUrl);
        lastVisibleTileRows = [];
        hideListingTotal();
        return;
    }

    hidePokoinDeskFrame();
    elements.candidatesSection.hidden = false;
    orderedCandidates.forEach((row) => {
        elements.candidateList.appendChild(renderCandidate(
            row,
            String(row.card_id) === String(viewBest.card_id || blueprintId),
            {
                layout: 'tile',
                album: true,
                listingUrl,
                wished: isListingTileWished(listingEntry, row),
            }
        ));
    });
    lastVisibleTileRows = orderedCandidates;
    paintListingTotal(orderedCandidates);
}

async function loadState() {
    await hydrateListingTileCache();
    // Do not paint a partial tile with disabled EN/JP/CN controls. The bundled
    // lineage index is authoritative and must be ready before the first render.
    await printLangsReady;
    const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
    renderState(sidePanelState);
}

let sidePanelLifecyclePort = null;
let sidePanelLifecycleHeartbeat = 0;
let sidePanelLifecycleReconnect = 0;

async function registerSidePanelLifecycle() {
    if (!sidePanelLifecyclePort || typeof chrome.tabs?.query !== 'function') {
        return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
        return;
    }
    sidePanelLifecyclePort.postMessage({
        action: 'registerSidePanelLifecycle',
        tabId: tab.id,
        windowId: tab.windowId,
    });
}

function connectSidePanelLifecycle() {
    if (typeof chrome.runtime?.connect !== 'function') {
        return;
    }
    window.clearTimeout(sidePanelLifecycleReconnect);
    window.clearInterval(sidePanelLifecycleHeartbeat);
    const port = chrome.runtime.connect({ name: 'pokoin-side-panel-lifecycle' });
    sidePanelLifecyclePort = port;
    void registerSidePanelLifecycle();
    sidePanelLifecycleHeartbeat = window.setInterval(() => {
        void registerSidePanelLifecycle();
    }, 20000);
    port.onDisconnect?.addListener?.(() => {
        if (sidePanelLifecyclePort !== port) {
            return;
        }
        sidePanelLifecyclePort = null;
        window.clearInterval(sidePanelLifecycleHeartbeat);
        sidePanelLifecycleReconnect = window.setTimeout(connectSidePanelLifecycle, 500);
    });
}

async function warmPokoinAuthSession() {
    try {
        await chrome.runtime.sendMessage({ action: 'requestPokoinAuthToken' });
    } catch (error) {
        // Auth is opportunistic: the panel still works for public matching.
    }
    await injectPokoinDeskSession();
}

function pokoinDeskIframeAcceptsSession() {
    const frame = elements.pokoinFrame;
    const src = String(frame?.src || '');
    if (!frame?.contentWindow || !/^https:\/\/(?:www\.)?pokoin\.com\//i.test(src)) {
        return false;
    }
    try {
        const loc = frame.contentWindow.location;
        if (!('location' in frame.contentWindow) || loc == null) {
            return true;
        }
        const href = String(loc.href || '');
        if (!href || href === 'about:blank' || href.startsWith('chrome-extension:')) {
            return false;
        }
        return /^https:\/\/(?:www\.)?pokoin\.com\//i.test(href);
    } catch (error) {
        return true;
    }
}

function isPokoinDeskFrameMessage(event) {
    if (event?.source && event.source === elements.pokoinFrame?.contentWindow) {
        return true;
    }
    return isPokoinDeskMessageOrigin(event?.origin) || event?.origin === 'null';
}

function postPokoinDeskSession(session = {}) {
    const frame = elements.pokoinFrame;
    const token = typeof session.token === 'string' ? session.token.trim() : '';
    const uid = String(session.uid || '').trim();
    if (!pokoinDeskIframeAcceptsSession() || !token || token.length <= 20 || !uid) {
        return false;
    }
    try {
        frame.contentWindow.postMessage({
            type: POKOIN_DESK_SESSION_TYPE,
            source: 'pokemon-card-extension',
            token,
            uid,
            expiresAt: Number(session.expiresAt) || 0,
        }, '*');
        return true;
    } catch (error) {
        return false;
    }
}

async function injectPokoinDeskSession() {
    if (!chrome.runtime?.id || typeof chrome.runtime.sendMessage !== 'function') {
        return;
    }
    try {
        let session = await chrome.runtime.sendMessage({ action: 'getPokoinAuthSession' });
        if (!session?.token) {
            await chrome.runtime.sendMessage({ action: 'requestPokoinAuthToken' });
            session = await chrome.runtime.sendMessage({ action: 'getPokoinAuthSession' });
        }
        postPokoinDeskSession(session);
    } catch (error) {
        // Guest desk still matches public card pages.
    }
}

function isTabScanPreviewDataUrl(value = '') {
    return /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(String(value || ''));
}

function paintTabScanPreview(dataUrl = '') {
    if (!elements.tabScanPreview) {
        return;
    }
    const image = String(dataUrl || '');
    if (!isTabScanPreviewDataUrl(image)) {
        elements.tabScanPreview.removeAttribute('src');
        elements.tabScanPreview.hidden = true;
        elements.tabScanBtn?.classList.remove('has-preview');
        return;
    }
    elements.tabScanPreview.onerror = () => {
        paintTabScanPreview('');
    };
    elements.tabScanPreview.src = image;
    elements.tabScanPreview.hidden = false;
    elements.tabScanBtn?.classList.add('has-preview');
}

async function requestTabScanPreview() {
    if (!chrome.runtime?.id || typeof chrome.runtime.sendMessage !== 'function') {
        return;
    }
    try {
        const response = await chrome.runtime.sendMessage({ action: 'captureVisibleTabPreview' });
        if (response?.screenshotDataUrl) {
            paintTabScanPreview(response.screenshotDataUrl);
        }
    } catch (_) {
        // Preview is optional; the click path still scans.
    }
}

async function ensureVisibleTabCaptureAccess() {
    // captureVisibleTab still wants <all_urls> or activeTab. Side-panel clicks
    // cannot grant activeTab, so Scan tab reads visible photos on Vinted, eBay,
    // Instagram, Facebook, CardTrader, and Cardmarket with those host_permissions
    // instead of all_urls.
    const pageUrl = lastSidePanelState?.pageInfo?.url || '';
    let originPattern = '';
    try {
        const parsed = new URL(pageUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return true;
        }
        originPattern = `${parsed.origin}/*`;
    } catch (_) {
        return true;
    }
    if (typeof chrome.permissions?.contains === 'function') {
        try {
            const granted = await chrome.permissions.contains({ origins: [originPattern] });
            if (granted) {
                void recordExtensionDebugEvent('sidepanel.capture-host-access', {
                    originPattern,
                    granted: true,
                    via: 'host',
                });
                return true;
            }
        } catch (_) {
            // Fall through to an origin request for a declared marketplace host.
        }
    }
    if (typeof chrome.permissions?.request !== 'function') {
        return true;
    }
    try {
        const granted = await chrome.permissions.request({ origins: [originPattern] });
        void recordExtensionDebugEvent('sidepanel.capture-host-access', {
            originPattern,
            granted: Boolean(granted),
            via: 'origin',
        });
        if (!granted) {
            throw new Error('Allow Pokoin access to this Vinted, eBay, Instagram, Facebook, CardTrader, or Cardmarket page, then try Scan tab again.');
        }
        return true;
    } catch (error) {
        void recordExtensionDebugEvent('sidepanel.capture-host-access-failed', {
            originPattern,
            error: error?.message || String(error || ''),
        });
        if (/Open a Vinted|Allow Pokoin/i.test(String(error?.message || ''))) {
            throw error;
        }
        throw new Error('Open a Vinted, eBay, Instagram, Facebook, CardTrader, or Cardmarket page, then try Scan tab again.');
    }
}

async function runVisibleTabScan() {
    sidePanelUserActionInFlight = true;
    void recordExtensionDebugEvent('sidepanel.viewport-scan-click', {
        url: lastSidePanelState?.pageInfo?.url || '',
    });
    elements.tabScanBtn?.classList?.add('scanning');
    elements.analyzeScreenshotBtn?.classList?.add('scanning');
    setStatus('Analyzing the Chrome tab screenshot...');
    try {
        await ensureVisibleTabCaptureAccess();
        const response = await chrome.runtime.sendMessage({ action: 'scanVisibleTab' });
        void recordExtensionDebugEvent('sidepanel.viewport-scan-requested', {
            success: Boolean(response?.success),
            error: response?.success ? '' : response?.error || 'Tab screenshot analysis failed.',
            rowCount: Number(response?.rowCount) || 0,
        });
        if (response?.screenshotDataUrl) {
            paintTabScanPreview(response.screenshotDataUrl);
        }
        if (!response?.success) {
            throw new Error(response?.error || 'Tab screenshot analysis failed.');
        }
        await loadState();
        if (!response?.rowCount) {
            setStatus(response?.error || 'No cards found in the Chrome tab screenshot.', true);
            showEmptyActions(true);
        }
    } catch (error) {
        setStatus(error.message || 'Unable to analyze the Chrome tab screenshot.', true);
        showEmptyActions(true);
    } finally {
        sidePanelUserActionInFlight = false;
        elements.tabScanBtn?.classList?.remove('scanning');
        elements.analyzeScreenshotBtn?.classList?.remove('scanning');
    }
}

async function loadListingInformation() {
    sidePanelUserActionInFlight = true;
    void recordExtensionDebugEvent('sidepanel.load-listing-click', {
        url: lastSidePanelState?.pageInfo?.url || '',
    });
    elements.loadListingBtn?.classList?.add('scanning');
    setStatus('Loading listing information...');
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'resolveActiveTabForSidePanel',
            forceRefresh: true,
        });
        if (!response?.success) {
            throw new Error(response?.error || 'Unable to load listing information.');
        }
        await loadState();
    } catch (error) {
        setStatus(error.message || 'Unable to load listing information.', true);
        showEmptyActions(true);
    } finally {
        sidePanelUserActionInFlight = false;
        elements.loadListingBtn?.classList?.remove('scanning');
    }
}

if (elements.tabScanBtn) {
    elements.tabScanBtn.addEventListener('click', runVisibleTabScan);
}
if (elements.analyzeScreenshotBtn) {
    elements.analyzeScreenshotBtn.addEventListener('click', runVisibleTabScan);
}
if (elements.loadListingBtn) {
    elements.loadListingBtn.addEventListener('click', loadListingInformation);
}

requestTabScanPreview();

if (elements.pokoinFrame) {
    elements.pokoinFrame.addEventListener('load', () => {
        void injectPokoinDeskSession();
    });
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('message', (event) => {
        if (!isPokoinDeskFrameMessage(event)) {
            return;
        }
        const data = event.data || {};
        if (data.type === POKOIN_OPEN_TAB_TYPE && data.url) {
            requestForegroundMarketplaceTab({ action: 'openForegroundTab', url: data.url });
            return;
        }
        if (data.type === POKOIN_SILVER_PILL_TYPE && data.kind) {
            requestForegroundMarketplaceTab({
                action: 'openSilverMarketplaceTab',
                kind: data.kind,
                publicId: publicCardIdFromDeskSrc(),
                cardName: String(elements.cardName?.textContent || '').trim(),
            });
            return;
        }
        if (data.type !== POKOIN_DESK_SESSION_REQUEST_TYPE || data.source !== 'pokoin-web') {
            return;
        }
        void injectPokoinDeskSession();
    });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'session' && changes.sidePanelState) {
        void printLangsReady.then(() => renderState(changes.sidePanelState.newValue));
    }
    if (areaName === 'session' && changes.pokoinAuthSession) {
        postPokoinDeskSession(changes.pokoinAuthSession.newValue || {});
    }
    if (areaName === 'local' && changes[LISTING_TILE_CACHE_KEY]) {
        listingTileCache = pruneListingTileCache(changes[LISTING_TILE_CACHE_KEY].newValue || emptyListingTileCache());
        if (lastSidePanelState) {
            renderState(lastSidePanelState);
        }
    }
});

paintExtensionVersion();

connectSidePanelLifecycle();
chrome.tabs?.onActivated?.addListener?.(() => {
    void registerSidePanelLifecycle();
});

loadState().catch((error) => {
    setStatus(error.message || 'Unable to load side panel state.', true);
});

warmPokoinAuthSession();

loadExpansionLogos()
    .then(loadState)
    .catch(() => {
        // Candidate cards still render without set symbols.
    });


// Power Tools connect: the seller clicks, the background reads the Power Tools
// session (opening its sign-in when needed) and Pokoin stores it encrypted.
let powerToolsConnected = false;

function paintPowerTools(status, message = '') {
    const text = elements.powerToolsStatus;
    const button = elements.powerToolsBtn;
    if (!text || !button) return;
    powerToolsConnected = status?.connected === true;
    if (message) {
        text.textContent = message;
    } else if (status?.pokoinSignedOut) {
        text.textContent = 'Connect your Power Tools account to see its picking state on pokoin.com/mypokoin/zero.';
    } else if (powerToolsConnected) {
        const who = status.account?.username || 'your account';
        text.textContent = status.cardtraderMatch === false
            ? `Connected as ${who}, but linked to a different CardTrader seller than Pokoin.`
            : `Connected as ${who}.`;
    } else {
        text.textContent = 'Not connected. Sign in to Power Tools in Chrome, then click Connect.';
    }
    text.classList.toggle('error', Boolean(message) && /fail|error|timed out|sign in to pokoin|cannot|did not/i.test(message));
    button.hidden = false;
    button.disabled = false;
    button.textContent = powerToolsConnected ? 'Disconnect' : 'Connect';
}

async function loadPowerToolsStatus() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'powerToolsStatus' });
        if (response?.success) paintPowerTools(response.status);
        else paintPowerTools(null, response?.error || 'Power Tools status unavailable.');
    } catch (error) {
        paintPowerTools(null, 'Power Tools status unavailable.');
    }
}

elements.powerToolsBtn?.addEventListener('click', async () => {
    const button = elements.powerToolsBtn;
    button.disabled = true;
    const disconnecting = powerToolsConnected;
    elements.powerToolsStatus.textContent = disconnecting
        ? 'Disconnecting…'
        : 'Connecting… If a Power Tools tab opens, sign in there.';
    try {
        const response = await chrome.runtime.sendMessage({ action: disconnecting ? 'powerToolsDisconnect' : 'powerToolsConnect' });
        if (response?.success) paintPowerTools(response.status);
        else paintPowerTools(null, response?.error || 'Power Tools connect failed.');
    } catch (error) {
        paintPowerTools(null, error?.message || 'Power Tools connect failed.');
    }
});

void loadPowerToolsStatus();
