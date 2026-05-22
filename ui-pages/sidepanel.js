const CARDVAULT_API_BASE_URL = 'https://pokoin.com';

const elements = {
    cardName: document.getElementById('cardName'),
    status: document.getElementById('status'),
    refreshBtn: document.getElementById('refreshBtn'),
    frameSection: document.getElementById('frameSection'),
    pokoinFrame: document.getElementById('pokoinFrame'),
    candidatesSection: document.getElementById('candidatesSection'),
    candidateList: document.getElementById('candidateList'),
};

function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('error', isError);
    elements.status.hidden = !message;
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

function cardUrl(rowOrBlueprintId) {
    if (rowOrBlueprintId && typeof rowOrBlueprintId === 'object') {
        const row = rowOrBlueprintId;
        return row.canonicalUrl ||
            row.canonical_url ||
            row.marketplaceUrl ||
            row.marketplace_url ||
            absolutePokoinUrl(row.canonicalPath || row.canonical_path || row.marketplacePath || row.marketplace_path) ||
            (row.card_id ? `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${encodeURIComponent(row.card_id)}` : '');
    }
    return `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${encodeURIComponent(rowOrBlueprintId)}`;
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

function updatePokoinFrameUrl(pathOrUrl = '') {
    const nextUrl = absolutePokoinUrl(pathOrUrl);
    const nextKey = canonicalFrameUrlKey(nextUrl);
    const dataset = elements.pokoinFrame.dataset || (elements.pokoinFrame.dataset = {});
    const currentUrl = dataset.pokoinUrl || elements.pokoinFrame.getAttribute?.('src') || elements.pokoinFrame.src || '';
    const currentKey = dataset.pokoinUrlKey || canonicalFrameUrlKey(currentUrl);

    if (nextKey && currentKey === nextKey) {
        dataset.pokoinUrl = nextUrl;
        dataset.pokoinUrlKey = nextKey;
        return false;
    }

    elements.pokoinFrame.src = nextUrl;
    dataset.pokoinUrl = nextUrl;
    dataset.pokoinUrlKey = nextKey;
    return true;
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

function expansionLogoUrl(row) {
    const directLogo = row.expansion_symbol_url || row.expansionSymbolUrl || row.symbolImageUrl || '';
    if (directLogo) {
        return directLogo;
    }

    const setName = row.set_name || row.expansion_name || '';
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

function compactCandidateMeta(row = {}) {
    const collector = firstCollectorNumber(row.card_number);
    const expansion = expansionShortName(row);
    const price = row.pokoin_price || row.pokoinPrice || row.price_formatted || row.priceFormatted || '';
    return [collector, expansion, price].filter(Boolean).join(' · ');
}

function candidatePreviewImageUrl(row = {}) {
    return row.preview_image_url || row.previewImageUrl || row.image_url || row.imageUrl || row.cdn_image_url || row.cdnImageUrl || '';
}

function renderCandidate(row, isBest = false) {
    const link = document.createElement('a');
    link.className = `candidate${isBest ? ' candidate-best' : ''}`;
    link.href = cardUrl(row);
    link.target = '_blank';
    link.rel = 'noreferrer';

    const imageUrl = candidatePreviewImageUrl(row);
    const mediaSlot = document.createElement('span');
    mediaSlot.className = 'candidate-media-slot';

    if (imageUrl) {
        const image = document.createElement('img');
        image.className = 'candidate-preview-image';
        image.alt = '';
        image.loading = 'lazy';
        image.src = imageUrl;
        image.addEventListener('error', () => {
            image.remove();
            mediaSlot.classList.add('candidate-media-empty');
        }, { once: true });
        mediaSlot.appendChild(image);
    } else {
        const logoUrl = expansionLogoUrl(row);
        const logo = document.createElement('img');
        logo.className = 'candidate-logo';
        logo.alt = '';
        logo.loading = 'lazy';
        if (logoUrl) {
            logo.src = logoUrl;
            logo.addEventListener('error', () => {
                logo.remove();
                mediaSlot.classList.add('candidate-media-empty');
            }, { once: true });
            mediaSlot.appendChild(logo);
        } else {
            mediaSlot.classList.add('candidate-media-empty');
        }
    }

    const copy = document.createElement('span');
    copy.className = 'candidate-copy';

    const title = document.createElement('strong');
    title.textContent = row.name || `Blueprint ${row.card_id}`;

    const meta = document.createElement('span');
    meta.className = 'candidate-meta';
    meta.textContent = compactCandidateMeta(row);

    copy.append(title, meta);

    link.append(mediaSlot, copy);
    return link;
}

function renderState(state) {
    const pageInfo = state?.pageInfo || {};
    const best = state?.best || null;
    const blueprintId = state?.blueprintId || best?.card_id || '';
    const isCardTraderDirect = Boolean(pageInfo.cardtraderBlueprintId || best?.source === 'cardtrader_url');

    elements.frameSection.hidden = true;
    elements.candidatesSection.hidden = true;
    elements.frameSection.classList.toggle('frame-section-direct', false);
    document.body.classList.toggle('direct-card-view', false);
    elements.candidateList.replaceChildren();

    if (state?.error) {
        elements.cardName.textContent = 'No card loaded';
        setStatus(state.error, true);
        return;
    }

    if (state?.loading) {
        elements.cardName.textContent = 'Resolving card...';
        setStatus('Finding Pokoin matches...');
        return;
    }

    if (pageInfo.unsupported) {
        elements.cardName.textContent = 'Unsupported page';
        setStatus('Open a supported eBay, Vinted, or Cardmarket listing, then click the extension icon again.', true);
        return;
    }

    if (!blueprintId || !best) {
        elements.cardName.textContent = 'No match found';
        setStatus(pageInfo.title
            ? `No Cardvault match found for "${pageInfo.title}".`
            : 'No listing title found on this page.', true);
        return;
    }

    const pokoinUrl = state.pokoinUrl || cardUrl(best);
    elements.cardName.textContent = isCardTraderDirect
        ? directCardDisplayName(pageInfo, best, blueprintId)
        : best.name || `Blueprint ${blueprintId}`;
    updatePokoinFrameUrl(pokoinUrl);

    elements.frameSection.hidden = false;
    elements.frameSection.classList.toggle('frame-section-direct', isCardTraderDirect);
    document.body.classList.toggle('direct-card-view', isCardTraderDirect);
    setStatus('');

    if (isCardTraderDirect) {
        return;
    }

    const rows = state.rows?.length ? state.rows : [best];
    const candidates = rows.slice(0, 8);
    if (candidates.length > 0) {
        elements.candidatesSection.hidden = false;
        candidates.forEach((row) => {
            elements.candidateList.appendChild(renderCandidate(row, String(row.card_id) === String(blueprintId)));
        });
    }
}

async function loadState() {
    const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
    renderState(sidePanelState);
}

async function warmPokoinAuthSession() {
    try {
        await chrome.runtime.sendMessage({ action: 'requestPokoinAuthToken' });
    } catch (error) {
        // Auth is opportunistic: the panel still works for public matching.
    }
}

elements.refreshBtn.addEventListener('click', async () => {
    setStatus('Refreshing active tab match...');
    try {
        const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
        const response = await chrome.runtime.sendMessage({
            action: 'resolveActiveTabForSidePanel',
            forceRefresh: true,
            clues: sidePanelState?.pageInfo?.selectedClues || sidePanelState?.pageInfo?.clues || [],
            primaryClues: sidePanelState?.pageInfo?.primaryClues || [],
            vintedPayload: sidePanelState?.pageInfo?.vintedPayload || null,
            ebayPayload: sidePanelState?.pageInfo?.ebayPayload || null,
            marketplacePayload: sidePanelState?.pageInfo?.marketplacePayload || null,
        });
        if (!response?.success) {
            throw new Error(response?.error || 'Refresh failed.');
        }
        await loadState();
    } catch (error) {
        setStatus(error.message || 'Unable to refresh active tab match.', true);
        await loadState();
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'session' && changes.sidePanelState) {
        renderState(changes.sidePanelState.newValue);
    }
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
