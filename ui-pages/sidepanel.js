const CARDVAULT_API_BASE_URL = 'https://pokoin.com';

const elements = {
    cardName: document.getElementById('cardName'),
    status: document.getElementById('status'),
    refreshBtn: document.getElementById('refreshBtn'),
    frameSection: document.getElementById('frameSection'),
    pokoinFrame: document.getElementById('pokoinFrame'),
    candidatesSection: document.getElementById('candidatesSection'),
    candidateList: document.getElementById('candidateList'),
    debugOutput: document.getElementById('debugOutput'),
};

function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('error', isError);
}

function cardUrl(blueprintId) {
    return `${CARDVAULT_API_BASE_URL}/marketplace/en/cards/${encodeURIComponent(blueprintId)}`;
}

function cardTraderUrl(blueprintId) {
    return `${CARDVAULT_API_BASE_URL}/api/cardtrader-redirect?id=${encodeURIComponent(blueprintId)}`;
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

function hasKnownExpansionLogo(row) {
    const directLogo = row.expansion_symbol_url || row.expansionSymbolUrl || row.symbolImageUrl || '';
    if (directLogo) {
        return true;
    }

    const setName = row.set_name || row.expansion_name || '';
    return expansionLogoCache.has(normalizeExpansionName(setName));
}

function sortCandidates(rows = []) {
    return [...rows].sort((a, b) => {
        const aHasLogo = hasKnownExpansionLogo(a) ? 1 : 0;
        const bHasLogo = hasKnownExpansionLogo(b) ? 1 : 0;
        return bHasLogo - aHasLogo;
    });
}

function renderCandidate(row, isBest = false) {
    const link = document.createElement('a');
    link.className = `candidate${isBest ? ' candidate-best' : ''}`;
    link.href = cardUrl(row.card_id);
    link.target = '_blank';
    link.rel = 'noreferrer';

    const logoUrl = expansionLogoUrl(row);
    const logo = document.createElement('img');
    logo.className = 'candidate-logo';
    logo.alt = '';
    logo.loading = 'lazy';
    if (logoUrl) {
        logo.src = logoUrl;
        logo.addEventListener('error', () => {
            logo.hidden = true;
        }, { once: true });
    } else {
        logo.hidden = true;
    }

    const copy = document.createElement('span');
    copy.className = 'candidate-copy';

    const title = document.createElement('strong');
    title.textContent = row.name || `Blueprint ${row.card_id}`;

    const meta = document.createElement('span');
    meta.textContent = [row.set_name, row.card_number].filter(Boolean).join(' · ');

    copy.append(title, meta);

    const action = document.createElement('span');
    action.className = 'candidate-action';
    action.textContent = isBest ? 'Open' : 'View';

    link.append(logo, copy, action);
    return link;
}

function renderDebug(state) {
    const pageInfo = state?.pageInfo || {};
    const pageDebug = pageInfo.debug || {};
    const debug = state?.debug || {};
    const structuredCard = pageInfo.structuredCard || {};
    const selectorLines = (pageDebug.selectorChecks || [])
        .map((check) => {
            const status = check.found ? 'hit' : 'miss';
            const text = check.text ? ` -> "${check.text}"` : '';
            return `${status}: ${check.selector}${text}`;
        });

    const lines = [
        `updated: ${state?.updatedAt ? new Date(state.updatedAt).toLocaleTimeString() : '-'}`,
        `url: ${pageInfo.url || '-'}`,
        `host: ${pageInfo.hostname || '-'}`,
        `title: ${pageInfo.title || '-'}`,
        `titleSource: ${pageDebug.titleSource || '-'}`,
        `pokemonName: ${structuredCard.name || '-'}`,
        `variation: ${structuredCard.variation || '-'}`,
        `collectorNumber: ${structuredCard.collectorNumber || '-'}`,
        `expansion: ${structuredCard.expansion || '-'}`,
        `rarity: ${structuredCard.rarity || '-'}`,
        `documentTitle: ${pageDebug.documentTitle || '-'}`,
        `readyState: ${pageDebug.readyState || '-'}`,
        `extractorVersion: ${pageDebug.extractorVersion || '-'}`,
        `extractMs: ${pageDebug.elapsedMs ?? '-'}`,
        `waitAttempts: ${pageDebug.attempts ?? '-'}`,
        `extensionEndpoint: ${debug.extensionSearch?.endpoint || '-'}`,
        `extensionPayload: ${debug.extensionSearch?.payload ? JSON.stringify(debug.extensionSearch.payload) : '-'}`,
        `extensionMatches: ${debug.extensionSearch?.matchCount ?? '-'}`,
        `extensionError: ${debug.extensionSearch?.error || '-'}`,
        `apiQuery: ${debug.query || '-'}`,
        `apiSearched: ${debug.searched ? 'yes' : 'no'}`,
        `apiRows: ${debug.rowCount ?? (state?.rows || []).length}`,
        `bestId: ${debug.bestId || state?.blueprintId || '-'}`,
        `error: ${state?.error || debug.error || '-'}`,
        '',
        'attemptedQueries:',
        ...((debug.attemptedQueries || []).map((attempt) =>
            `${attempt.rowCount} row(s): ${attempt.query}`
        )),
        ...(debug.attemptedQueries?.length ? [] : ['-']),
        '',
        'selectors:',
        ...(selectorLines.length ? selectorLines : ['-']),
    ];

    elements.debugOutput.textContent = lines.join('\n');
}

function renderState(state) {
    const pageInfo = state?.pageInfo || {};
    const best = state?.best || null;
    const blueprintId = state?.blueprintId || best?.card_id || '';

    elements.frameSection.hidden = true;
    elements.candidatesSection.hidden = true;
    elements.candidateList.replaceChildren();
    renderDebug(state);

    if (state?.error) {
        elements.cardName.textContent = 'No card loaded';
        setStatus(state.error, true);
        return;
    }

    if (state?.loading) {
        elements.cardName.textContent = 'Resolving card...';
        setStatus('Reading the active marketplace page and searching Cardvault.');
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

    const pokoinUrl = state.pokoinUrl || cardUrl(blueprintId);
    elements.cardName.textContent = best.name || `Blueprint ${blueprintId}`;
    elements.pokoinFrame.src = pokoinUrl;

    elements.frameSection.hidden = false;
    setStatus('Matched through Cardvault Oracle search.');

    const candidates = sortCandidates(state.rows || []).slice(0, 5);
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

elements.refreshBtn.addEventListener('click', async () => {
    setStatus('Refreshing active tab match...');
    try {
        const response = await chrome.runtime.sendMessage({ action: 'resolveActiveTabForSidePanel' });
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

loadExpansionLogos()
    .then(loadState)
    .catch(() => {
        // Candidate cards still render without set symbols.
    });
