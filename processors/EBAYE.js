/**
 * EBAYE.js - eBay-specific processor
 * Contains logic for eBay product pages and listing feeds.
 */

class EbayProcessor {
    constructor() {
        this.isEnabled = true;
        this.processedPages = new Set();
        this.latestResultsByUrl = new Map();
        this.latestTitleByUrl = new Map();
        this.recentSearchResults = new Map();
        this.currentTitle = '';
        this.currentTitleElement = null;
        this.currentKeywords = [];
        this.selectedKeywordValues = new Set();
        this.currentPanel = null;
        this.currentPanelHost = null;
        this.currentButton = null;
        this.latestSearchToken = 0;
        this.currentSelectionRevision = 0;
        this.lastAppliedSearchSignature = '';
        this.searchResultsBySignature = new Map();
        this.pendingSearchApplications = new Map();
        this.lastRenderedPreviewResults = [];
        this.lastSentEbayPreviewReadySignature = '';
        this.lastSentEbayPreviewReadyRowIds = '';
        this.currentMatchCount = 0;
        this.pokoinButtonScanState = 'idle';
        this.currentListingKind = '';
        this.ebayOverlayCollapsed = true;
        this.overlayDock = { side: 'left', top: 12, left: 12 };
        this.overlayDockRestored = false;
        this.overlayDockHydratedFromSync = this.hydrateOverlayDockFromSyncCache();
        this.overlayDrag = null;
        this.overlayDragMoved = false;
    }

    pokoinIconUrl() {
        return chrome.runtime.getURL('assets/pokoin-512.png');
    }

    pokoinExtensionVersionSuffix() {
        const version = chrome?.runtime?.getManifest?.()?.version || '';
        return version ? ` v${version}` : '';
    }

    setPokoinButtonLabel(button, matchCount = null) {
        const displayedMatchCount = Number.isFinite(matchCount)
            ? Math.max(0, Math.trunc(matchCount))
            : Math.max(0, Math.trunc(Number(this.currentMatchCount) || 0));
        button?.setAttribute?.('data-pokoin-match-count', String(displayedMatchCount));
        const matchLabel = `${displayedMatchCount} ${displayedMatchCount === 1 ? 'match' : 'matches'}`;
        const versionSuffix = this.pokoinExtensionVersionSuffix();
        const collapsed = Boolean(this.ebayOverlayCollapsed);
        const label = displayedMatchCount > 0
            ? (collapsed ? matchLabel : `Pokoin.com${versionSuffix} (${matchLabel})`)
            : `Pokoin.com${versionSuffix}`;
        const iconSize = collapsed ? 28 : 20;
        button.innerHTML = collapsed
            ? `
            <img class="pokoin-icon" data-pokoin-button-icon="true" src="${this.pokoinIconUrl()}" alt="" aria-hidden="true" draggable="false" style="width:${iconSize}px;height:${iconSize}px;min-width:${iconSize}px;min-height:${iconSize}px;max-width:${iconSize}px;max-height:${iconSize}px;flex:0 0 ${iconSize}px;border-radius:50%;object-fit:cover;display:block;">
        `
            : `
            <img class="pokoin-icon" data-pokoin-button-icon="true" src="${this.pokoinIconUrl()}" alt="" aria-hidden="true" draggable="false" style="width:${iconSize}px;height:${iconSize}px;min-width:${iconSize}px;min-height:${iconSize}px;max-width:${iconSize}px;max-height:${iconSize}px;flex:0 0 ${iconSize}px;border-radius:50%;object-fit:cover;display:block;">
            <span data-pokoin-button-label="true">${label}</span>
        `;
        button.setAttribute?.('aria-label', collapsed ? `Show Pokoin results (${matchLabel})` : label);
        button.setAttribute?.('title', collapsed ? 'Show Pokoin results' : label);
    }

    applyPokoinButtonCollapsedLayout(button = this.currentButton) {
        if (!button) {
            return;
        }
        const collapsed = Boolean(this.ebayOverlayCollapsed);
        const background = button.style.background || '#075985';
        const border = button.style.border || '1px solid rgba(56, 189, 248, 0.35)';
        const boxShadow = button.style.boxShadow || '0 4px 12px rgba(2, 132, 199, 0.18)';
        if (collapsed) {
            button.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 40px;
                width: 40px;
                min-width: 40px;
                max-width: 40px;
                height: 40px;
                padding: 0;
                gap: 0;
                border-radius: 12px;
                background: ${background};
                color: white;
                border: ${border};
                box-shadow: ${boxShadow};
                cursor: grab;
                touch-action: none;
                font-weight: bold;
                transition: all 0.2s ease;
            `;
            Object.assign(button.style, {
                flex: '0 0 40px',
                width: '40px',
                minWidth: '40px',
                maxWidth: '40px',
                height: '40px',
                padding: '0',
                gap: '0',
                borderRadius: '12px',
                background,
                border,
                boxShadow,
                cursor: 'grab',
                touchAction: 'none',
            });
        } else {
            button.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 1 1 auto;
                width: auto;
                min-width: 0;
                padding: 10px 14px;
                gap: 8px;
                border-radius: 8px;
                background: ${background};
                color: white;
                border: ${border};
                box-shadow: ${boxShadow};
                cursor: pointer;
                font-weight: bold;
                font-size: 14px;
                font-family: Arial, sans-serif;
                transition: all 0.2s ease;
            `;
            Object.assign(button.style, {
                flex: '1 1 auto',
                width: 'auto',
                minWidth: '0',
                maxWidth: '',
                height: '',
                padding: '10px 14px',
                gap: '8px',
                borderRadius: '8px',
                background,
                border,
                boxShadow,
            });
        }
        const icon = button.querySelector?.('img[data-pokoin-button-icon], img.pokoin-icon, img');
        if (icon) {
            const iconSize = collapsed ? 28 : 20;
            Object.assign(icon.style, {
                width: `${iconSize}px`,
                height: `${iconSize}px`,
                minWidth: `${iconSize}px`,
                minHeight: `${iconSize}px`,
                maxWidth: `${iconSize}px`,
                maxHeight: `${iconSize}px`,
                flex: `0 0 ${iconSize}px`,
                borderRadius: '50%',
                objectFit: 'cover',
                display: 'block',
            });
        }
    }

    pokoinBlue() {
        return '#0ea5e9';
    }

    pokoinBlueHover() {
        return '#0284c7';
    }

    pokoinScanRed() {
        return '#dc2626';
    }

    pokoinScanRedHover() {
        return '#b91c1c';
    }

    pokoinScanGreen() {
        return '#16a34a';
    }

    pokoinScanGreenHover() {
        return '#15803d';
    }

    pokoinButtonScanAppearance(state = this.pokoinButtonScanState) {
        if (state === 'scanning') {
            return {
                background: this.pokoinScanRed(),
                border: '1px solid rgba(248, 113, 113, 0.7)',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.35)',
            };
        }
        if (state === 'ready') {
            return {
                background: this.pokoinScanGreen(),
                border: '1px solid rgba(74, 222, 128, 0.7)',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.35)',
            };
        }
        return {
            background: '#075985',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.18)',
        };
    }

    pokoinButtonScanHoverBackground(state = this.pokoinButtonScanState) {
        if (state === 'scanning') {
            return this.pokoinScanRedHover();
        }
        if (state === 'ready') {
            return this.pokoinScanGreenHover();
        }
        return '#0369a1';
    }

    setPokoinButtonScanState(state, button = this.currentButton) {
        this.pokoinButtonScanState = state === 'scanning' || state === 'ready' ? state : 'idle';
        if (!button) {
            return;
        }
        button.setAttribute?.('data-pokoin-scan-state', this.pokoinButtonScanState);
        this.applyPokoinButtonStyles(button, {
            ...this.pokoinButtonScanAppearance(),
            borderRadius: '8px',
            color: '#ffffff',
            cursor: 'pointer',
            flex: '1 1 auto',
            width: 'auto',
            maxWidth: '',
        });
        this.applyPokoinButtonCollapsedLayout(button);
    }

    normalizeClueValue(value = '') {
        return String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[’`]/g, "'")
            .replace(/\bvastro\b/gi, 'vstar')
            .replace(/[^a-z0-9/'&+\s-]+/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    compactClueValue(value = '') {
        return this.normalizeClueValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    normalizeCollectorText(value = '') {
        return String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[’`]/g, "'")
            .replace(/\bvastro\b/gi, 'vstar')
            .replace(/[^a-z0-9/\s-]+/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    ebayStopWords() {
        return new Set([
            'a', 'an', 'and', 'for', 'in', 'of', 'the', 'with',
            'pokemon', 'pokémon', 'pkkmn', 'pkn', 'pokn',
            'card', 'cards', 'carta', 'carte', 'tcg', 'trading',
            'near', 'mint', 'nm', 'lp', 'mp', 'hp', 'played', 'used',
            'full', 'art', 'holo', 'rare', 'ultra', 'secret', 'collection',
            'psa', 'bgs', 'cgc', 'sgc',
        ]);
    }

    isGenericTextPhraseChip(keyword = {}) {
        if ((keyword.source || '') !== 'text') {
            return false;
        }
        const wordCount = String(keyword.label || keyword.value || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean).length;
        if (wordCount <= 1) {
            return false;
        }
        return !(
            keyword.nameLike ||
            keyword.compositeName ||
            keyword.fullCardIdentityName ||
            keyword.expansion ||
            keyword.variation ||
            keyword.collectorNumber ||
            keyword.feature
        );
    }

    keepTitleNameChipsUnlessAlbum(keywords = [], title = '', details = '') {
        const listingKind = typeof classifyMarketplaceListingKindFromText === 'function'
            ? classifyMarketplaceListingKindFromText(title, details).kind
            : 'unknown';
        if (listingKind === 'album') {
            return keywords;
        }
        const titleCompact = this.compactClueValue(this.ebayTitleTokenSource(title));
        return keywords.filter((keyword) => {
            if (!keyword.nameLike && !keyword.compositeName && !keyword.fullCardIdentityName) {
                return true;
            }
            return Boolean(keyword.compact && titleCompact.includes(keyword.compact));
        });
    }

    addKeywordCandidate(candidates, value, source = 'text') {
        let label = this.normalizeClueValue(value)
            .replace(/\bex\b/gi, 'ex')
            .replace(/\bgx\b/gi, 'GX')
            .replace(/\bv\b/gi, 'V')
            .replace(/\bmega\b/gi, 'Mega')
            .replace(/\bvmax\b/gi, 'VMAX')
            .replace(/\bvstar\b/gi, 'VSTAR');
        if (/\bgenerations\b/i.test(label) && /\bradiant\s+collection\b/i.test(label)) {
            label = 'Generations Radiant Collection';
        } else {
            const aliasExpansion = this.knownExpansionAliases().find(({ pattern }) => pattern.test(label));
            if (aliasExpansion) {
                label = aliasExpansion.name;
            }
        }
        if (/\bsteam\b/i.test(label)) {
            label = 'Steam Siege';
        }
        if (source !== 'text' && this.isCollectorNumberClue(label)) {
            label = this.normalizeEbayCollectorNumber(label);
        }
        const compact = this.compactClueValue(label);
        if (!label || (compact.length < 2 && !this.isVariationClue(label) && !/^[XY]$/i.test(label)) || this.ebayStopWords().has(label.toLowerCase()) || this.ebayStopWords().has(compact)) {
            return;
        }
        if (!candidates.some((candidate) => candidate.compact === compact)) {
            candidates.push({ label, value: label, compact, source });
        }
    }

    createManualEbayKeyword(value = '') {
        const candidates = [];
        this.addKeywordCandidate(candidates, value, 'manual-input');
        const keyword = candidates[0];
        if (!keyword) {
            return null;
        }
        const label = keyword.label || keyword.value || '';
        const nameLike = this.isPokemonNameLikeClue(label);
        const collectorNumber = this.isCollectorNumberClue(label);
        const expansion = this.isExpansionClue(label);
        const feature = this.isFeatureClue(label);
        const variation = (this.isVariationClue(label) || this.isMegaFormClue(label, `${this.currentTitle} ${label}`)) && !expansion && !feature;
        return {
            ...keyword,
            manual: true,
            nameLike,
            variation,
            collectorNumber,
            expansion,
            feature,
            selectedByDefault: true,
            category: nameLike ? 'name' : collectorNumber ? 'collector' : expansion ? 'expansion' : variation ? 'variation' : feature ? 'feature' : 'context',
        };
    }

    addManualEbayKeyword(value = '') {
        const keyword = this.createManualEbayKeyword(value);
        if (!keyword) {
            return false;
        }
        const existing = this.currentKeywords.find((candidate) => candidate.compact === keyword.compact);
        if (existing) {
            this.selectedKeywordValues.add(existing.compact);
            return false;
        }
        this.currentKeywords = [...this.currentKeywords, keyword];
        this.selectedKeywordValues.add(keyword.compact);
        return true;
    }

    triggerEbaySelectionRefresh(trigger = 'keyword-toggle') {
        this.invalidateEbayPreviewForSelectionChange();
        this.sendEbayTokensReady(trigger, {
            skipListingScan: trigger === 'keyword-toggle',
            forceListingScan: trigger === 'manual-clue',
        });
        return this.runEbaySearch(this.currentTitle, trigger);
    }

    isVariationClue(value = '') {
        return /\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/i.test(this.normalizeClueValue(value));
    }

    isMegaFormClue(value = '', sourceText = '') {
        const label = this.normalizeClueValue(typeof value === 'object' ? value.label || value.value : value);
        if (!/^[XY]$/i.test(label)) {
            return false;
        }
        const source = this.normalizeClueValue(sourceText);
        return /\bmega\b[\s\S]{0,32}\b[xy]\b[\s\S]{0,16}\b(?:ex|gx)?\b/i.test(source) ||
            /\b(?:charizard|mewtwo)\b\s+[xy]\b/i.test(source);
    }

    isCollectorNumberClue(value = '') {
        const label = this.normalizeCollectorText(value);
        if (/^(?:PSA|BGS|CGC|SGC)\s+\d{1,2}$/i.test(label)) {
            return false;
        }
        if (/\b(?:NM|LP|MP|HP|DMG|GD|VG|PR)\s*\/\s*(?:NM|LP|MP|HP|DMG|GD|VG|PR)\b/i.test(label) ||
            /\b(?:NM|LP|MP|HP|DMG|GD|VG|PR)\s+\d{4}\b/i.test(label)) {
            return false;
        }
        return /\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/i.test(label) ||
            /\b(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\s*\/\s*(?:(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?)?\d{1,4}[a-z]?\b/i.test(label) ||
            /\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/.test(label) ||
            /\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/.test(label) ||
            /\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i.test(label);
    }

    isExpansionClue(value = '') {
        return this.knownExpansionAliases().some(({ pattern, name }) =>
            pattern.test(value) || this.compactClueValue(name) === this.compactClueValue(value)
        ) || /\b(?:team\s+rocket|team\s+magma\s+vs\s+aqua|ex\s+team\s+magma\s+vs\s+aqua)\b/i.test(this.normalizeClueValue(value));
    }

    isFeatureClue(value = '') {
        return /\b(?:illustration|full\s*-?\s*art|fullart|special illustration rare|illustration rare|secret rare|ultra rare|holo rare|holo|promo)\b/i.test(this.normalizeClueValue(value));
    }

    isPokemonNameLikeClue(value = '') {
        const label = this.removeEbayMarketplaceNoise(value);
        const compact = this.compactClueValue(label);
        if (!label || compact.length < 3 || this.isVariationClue(label)) {
            return false;
        }
        if (typeof window.extractTitleInfo !== 'function') {
            return false;
        }
        try {
            const titleInfo = window.extractTitleInfo(label) || {};
            const resolvedName = titleInfo.pokemonName || titleInfo.name || '';
            return Boolean(resolvedName && this.compactClueValue(resolvedName) === compact);
        } catch (error) {
            console.warn('⚠️ [EBAYE] Unable to validate eBay clue as Pokemon name:', error);
            return false;
        }
    }

    knownEbayCompositeName(value = '') {
        const normalized = this.normalizeClueValue(value);
        const compositeNames = [
            'Holon Transceiver',
            "Team Rocket's Mimikyu",
            "Arven's Mabosstiff ex",
            'Gengar Mimikyu',
            'Gengar Mimikyu GX',
            'Espeon & Deoxys',
            'Espeon & Deoxys ex',
        ];
        return compositeNames.find((name) =>
            this.compactClueValue(name) === this.compactClueValue(normalized)
        ) || '';
    }

    resolvedPokemonNameFromClue(value = '') {
        if (typeof window.extractTitleInfo !== 'function') {
            return '';
        }
        try {
            const titleInfo = window.extractTitleInfo(this.normalizeClueValue(value)) || {};
            const resolvedName = titleInfo.pokemonName || titleInfo.name || '';
            if (resolvedName) {
                return resolvedName;
            }
            const withoutVariation = this.normalizeClueValue(value)
                .replace(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const fallbackInfo = withoutVariation ? window.extractTitleInfo(withoutVariation) || {} : {};
            return fallbackInfo.pokemonName || fallbackInfo.name || '';
        } catch (error) {
            console.warn('⚠️ [EBAYE] Unable to resolve eBay clue Pokemon name:', error);
            return '';
        }
    }

    resolvedPokemonNameSuffixFromPhrase(value = '') {
        const label = this.removeEbayMarketplaceNoise(value);
        const resolvedName = this.resolvedPokemonNameFromClue(label);
        const labelCompact = this.compactClueValue(label);
        const resolvedCompact = this.compactClueValue(resolvedName);
        if (!label || !resolvedName || labelCompact === resolvedCompact || label.split(/\s+/).length < 2) {
            return '';
        }
        return labelCompact.endsWith(resolvedCompact) ? resolvedName : '';
    }

    isEbayFullCardIdentityPhrase(value = '') {
        const label = this.removeEbayMarketplaceNoise(value);
        const resolvedSuffix = this.resolvedPokemonNameSuffixFromPhrase(label);
        if (!resolvedSuffix || this.isVariationClue(label) || this.isCollectorNumberClue(label) || this.isExpansionClue(label)) {
            return false;
        }

        const prefix = this.normalizeClueValue(label)
            .slice(0, Math.max(0, this.normalizeClueValue(label).length - resolvedSuffix.length))
            .replace(/\s+/g, ' ')
            .trim();
        return /\b(?:dark|light|rocket|alto\s+mare's|holon's|team\s+rocket's?|team\s+rocket)\b/i.test(prefix) ||
            /(?:^|\s)[A-Za-z][A-Za-z]+['’]s\s*$/i.test(prefix);
    }

    removeEbayMarketplaceNoise(value = '') {
        return this.normalizeClueValue(value)
            .replace(/\b(?:pok[eé]mon|pokemon|pkkmn|pkn|pokn)\b/gi, ' ')
            .replace(/\b(?:carta|carte|card|cards|tcg|trading)\b/gi, ' ')
            .replace(/\b(?:sealed|seal(?:ed)?|pack|booster|lot|near mint|nm|mint|used)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    normalizeTargetedNameAlias(value = '') {
        const aliases = {
            magaerna: 'Magearna',
            magaeran: 'Magearna',
        };
        return aliases[this.compactClueValue(value)] || '';
    }

    knownExpansionAliases() {
        return [
            { pattern: /\b(?:ex\s+)?(?:sandstorm|tempesta\s+di\s+sabbia)\b/i, name: 'EX Sandstorm' },
            { pattern: /\bgenerations\s+radiant\s+collection\b/i, name: 'Generations Radiant Collection' },
            { pattern: /\bradiant\s+collection\b/i, name: 'Radiant Collection' },
            { pattern: /\bgenerations\b/i, name: 'Generations' },
            { pattern: /\bsteam\s*(?:siege|\.\.\.)?\b/i, name: 'Steam Siege' },
            { pattern: /\bfates\s+collide\b/i, name: 'Fates Collide' },
            { pattern: /\bbreakpoint\b/i, name: 'BREAKpoint' },
            { pattern: /\bbreakthrough\b/i, name: 'BREAKthrough' },
            { pattern: /\bevolutions\b|\bevoluzioni\b/i, name: 'Evolutions' },
            { pattern: /\bbase\s+set\b|\bset\s+base\b/i, name: 'Base Set' },
        ];
    }

    stripKnownExpansionAliases(value = '') {
        return this.knownExpansionAliases().reduce(
            (text, { pattern }) => text.replace(pattern, ' '),
            String(value || '')
        ).replace(/\s+/g, ' ').trim();
    }

    extractEbayDetails() {
        const selectors = [
            '[data-testid*="ux-labels-values"]',
            '.ux-labels-values',
            '.ux-layout-section__item',
            '.x-about-this-item',
            '.vim.x-about-this-item',
            '#viTabs_0_is',
        ];
        const text = selectors
            .flatMap((selector) => Array.from(document.querySelectorAll?.(selector) || []))
            .map((element) => element.textContent || '')
            .filter(Boolean)
            .join(' ');
        return this.normalizeClueValue(text).slice(0, 2000);
    }

    extractEbayListingImageUrls() {
        if (typeof extractListingImageUrlsFromDocument === 'function') {
            return extractListingImageUrlsFromDocument(document, { source: 'ebay' });
        }
        return [];
    }

    classifyEbayListingKind(title = '', details = '', photoCount = 0) {
        if (typeof classifyMarketplaceListingKind === 'function') {
            return classifyMarketplaceListingKind({ title, description: details, photoCount });
        }
        return { kind: 'unknown', reason: 'listing-scan-unavailable', photoCount };
    }

    ebayCandidateRowLimit() {
        return Number.MAX_SAFE_INTEGER;
    }

    ebayCollectorNumberPatterns() {
        return [
            /\b(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\s*\/\s*(?:(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?)?\d{1,4}[a-z]?\b/gi,
            /\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/g,
            /\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/gi,
            /\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/g,
            /\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/gi,
        ];
    }

    normalizeEbayCollectorNumber(value = '') {
        const normalized = this.normalizeCollectorText(value)
            .replace(/\s*\/\s*/g, '/')
            .replace(/\s+/g, ' ')
            .trim();
        return normalized.match(/\b(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\s*\/\s*(?:(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?)?\d{1,4}[a-z]?\b/i)?.[0]?.replace(/\s*\/\s*/g, '/').replace(/\s+/g, '') ||
            normalized.match(/\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/)?.[0]?.replace(/\s*\/\s*/g, '/').replace(/\s+/g, '') ||
            normalized.match(/\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/i)?.[0]?.replace(/\s+/g, ' ') ||
            normalized.match(/\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/)?.[0] ||
            normalized.match(/\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i)?.[0]?.replace(/\s*\/\s*/g, '/') ||
            normalized;
    }

    collectEbayCollectorClues(text = '') {
        const matches = [];
        this.ebayCollectorNumberPatterns().forEach((pattern) => {
            for (const match of String(text || '').matchAll(pattern)) {
                const label = this.normalizeEbayCollectorNumber(match[0]);
                if (this.isCollectorNumberClue(label)) {
                    matches.push(label);
                }
            }
        });
        const seen = new Set();
        return matches
            .filter((label) => {
                const compact = this.compactClueValue(label);
                if (!compact || seen.has(compact)) {
                    return false;
                }
                seen.add(compact);
                return true;
            })
            .sort((left, right) => this.compactClueValue(right).length - this.compactClueValue(left).length)
            .filter((label, index, all) => {
                const compact = this.compactClueValue(label);
                return !all.some((other, otherIndex) =>
                    otherIndex < index &&
                    this.compactClueValue(other).includes(compact) &&
                    !String(label || '').includes('/')
                );
            });
    }

    ebayTitleTokenSource(value = '') {
        return String(value || '')
            .replace(/([a-z])(\d{1,4}[a-z]?\s*\/\s*(?:[a-z]{0,6}\s*)?\d{1,4}[a-z]?)/gi, '$1 $2')
            .replace(/(\d{1,4}[a-z]?\s*\/\s*(?:[a-z]{0,6}\s*)?\d{1,4}[a-z]?)([a-z])/gi, '$1 $2')
            .replace(/\s+(?:&|\+|\/)\s+/g, ' ');
    }

    addCompositeConnectorCandidates(candidates, title = '') {
        const source = this.normalizeClueValue(title)
            .replace(/\s+(?:e|and|&|\+|\/)\s+/gi, ' & ')
            .replace(/\s+/g, ' ')
            .trim();
        const pattern = /\b([A-Za-z][A-Za-z']*)\s+&\s+([A-Za-z][A-Za-z']*)(?:\s+(vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break))?\b/gi;
        for (const match of source.matchAll(pattern)) {
            const left = match[1].trim() || '';
            const right = match[2].trim() || '';
            const variation = match[3] || '';
            if (!left || !right || this.ebayStopWords().has(left.toLowerCase()) || this.ebayStopWords().has(right.toLowerCase())) {
                continue;
            }
            this.addKeywordCandidate(candidates, [left, '&', right, variation].filter(Boolean).join(' '), 'title-composite');
            this.addKeywordCandidate(candidates, [left, right, variation].filter(Boolean).join(' '), 'title-composite');
        }
    }

    addHolonPhraseCandidates(candidates, title = '') {
        const source = this.normalizeClueValue(title)
            .replace(/\s+/g, ' ')
            .trim();
        if (/\bholon\s+transceiver\b/i.test(source)) {
            this.addKeywordCandidate(candidates, 'Holon Transceiver', 'title-composite');
        }
    }

    extractEbayKeywords(title = '', details = '', titleInfo = {}) {
        const tokenizedTitle = this.ebayTitleTokenSource(title);
        const tokenizedDetails = this.ebayTitleTokenSource(details);
        const sourceText = `${tokenizedTitle} ${tokenizedDetails}`.replace(/\s+/g, ' ').trim();
        if (!sourceText) {
            return [];
        }
        const candidates = [];
        this.addCompositeConnectorCandidates(candidates, tokenizedTitle);
        this.addHolonPhraseCandidates(candidates, tokenizedTitle);
        const expansionHints = [
            'Generations Radiant Collection',
            'Radiant Collection',
            'Generations',
            'EX Team Magma vs Aqua',
            'Team Magma vs Aqua',
            'Steam',
            'Steam Siege',
            'Fates Collide',
            'BREAKpoint',
            'BREAKthrough',
            'Evolutions',
            'Base Set',
        ];
        expansionHints.forEach((hint) => {
            const pattern = new RegExp(`\\b${hint.replace(/\s+/g, '\\s+')}\\b`, 'i');
            if (pattern.test(sourceText)) {
                this.addKeywordCandidate(candidates, hint, pattern.test(title) ? 'title-expansion' : 'expansion');
            }
        });
        if (/\bRC\s*\d{1,4}[a-z]?(?:\s*\/\s*RC?\s*\d{1,4}[a-z]?)?\b/i.test(sourceText)) {
            this.addKeywordCandidate(
                candidates,
                /\bgenerations\b/i.test(sourceText) ? 'Generations Radiant Collection' : 'Radiant Collection',
                /\bRC\s*\d{1,4}/i.test(title) ? 'title-expansion' : 'expansion'
            );
        }
        this.knownExpansionAliases().forEach(({ pattern, name }) => {
            if (pattern.test(sourceText)) {
                this.addKeywordCandidate(candidates, name, pattern.test(title) ? 'title-expansion' : 'expansion');
            }
        });
        if ((titleInfo?.expansion || titleInfo?.expansionName) && new RegExp(`\\b${String(titleInfo.expansion || titleInfo.expansionName).replace(/\s+/g, '\\s+')}\\b`, 'i').test(sourceText)) {
            this.addKeywordCandidate(candidates, titleInfo.expansion || titleInfo.expansionName, 'title-expansion');
        }
        this.collectEbayCollectorClues(tokenizedTitle).forEach((label) => this.addKeywordCandidate(candidates, label, 'title-pattern'));
        this.collectEbayCollectorClues(tokenizedDetails).forEach((label) => this.addKeywordCandidate(candidates, label, 'pattern'));
        [
            /\b(?:special illustration rare|illustration rare|secret rare|ultra rare|holo rare|reverse holo|holo|promo|rare)\b/gi,
            /\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi,
        ].forEach((pattern, patternIndex) => {
            const titleSource = patternIndex === 1 ? this.stripKnownExpansionAliases(tokenizedTitle) : tokenizedTitle;
            const detailsSource = patternIndex === 1 ? this.stripKnownExpansionAliases(tokenizedDetails) : tokenizedDetails;
            for (const match of titleSource.matchAll(pattern)) {
                this.addKeywordCandidate(candidates, match[0], 'title-pattern');
            }
            for (const match of detailsSource.matchAll(pattern)) {
                this.addKeywordCandidate(candidates, match[0], 'pattern');
            }
        });
        if (/\bmega\b/i.test(tokenizedTitle)) {
            for (const match of tokenizedTitle.matchAll(/\b[XY]\b/gi)) {
                this.addKeywordCandidate(candidates, match[0].toUpperCase(), 'title-pattern');
            }
        }
        const normalized = sourceText
            .replace(/\bfull\s*-?\s*art\b|\bfullart\b/gi, ' ')
            .replace(/[()".,:;!?\\[\]{}|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const words = normalized
            .split(/\s+/)
            .map((word) => this.normalizeClueValue(word))
            .filter((word) => word && !this.ebayStopWords().has(word.toLowerCase()));
        const collectorCompacts = this.collectEbayCollectorClues(sourceText).map((label) => this.compactClueValue(label));
        const phraseOverlapsCollector = (phrase) => {
            const compactPhrase = this.compactClueValue(phrase);
            return collectorCompacts.some((collectorCompact) =>
                compactPhrase &&
                compactPhrase !== collectorCompact &&
                (collectorCompact.includes(compactPhrase) || compactPhrase.includes(collectorCompact))
            );
        };
        for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
            for (let index = 0; index <= words.length - size; index += 1) {
                const phrase = words.slice(index, index + size).join(' ');
                if (phrase.length >= 3 && !/^\d+$/.test(phrase) && !phraseOverlapsCollector(phrase)) {
                    this.addKeywordCandidate(candidates, phrase, 'text');
                }
            }
        }
        return this.prepareEbayKeywordCandidates(candidates, sourceText, tokenizedTitle, tokenizedDetails);
    }

    prepareEbayKeywordCandidates(candidates = [], sourceText = '', title = '', details = '') {
        const prepared = candidates.map((candidate, index) => {
            const label = candidate.label || candidate.value || '';
            const knownCompositeName = this.knownEbayCompositeName(label);
            const compositeName = Boolean(knownCompositeName);
            const normalizedCandidate = knownCompositeName
                ? { ...candidate, label: knownCompositeName, value: knownCompositeName, compact: this.compactClueValue(knownCompositeName) }
                : candidate;
            const normalizedLabel = normalizedCandidate.label || normalizedCandidate.value || '';
            const fullCardIdentityName = !compositeName && this.isEbayFullCardIdentityPhrase(normalizedLabel);
            const nameLike = compositeName || fullCardIdentityName || this.isPokemonNameLikeClue(normalizedLabel);
            const collectorNumber = this.isCollectorNumberClue(normalizedLabel);
            const expansion = this.isExpansionClue(normalizedLabel);
            const feature = this.isFeatureClue(normalizedLabel);
            const variation = (this.isVariationClue(normalizedLabel) || this.isMegaFormClue(normalizedLabel, sourceText)) && !expansion && !feature;
            const selectedByDefault =
                nameLike ||
                collectorNumber ||
                (variation && /^(?:title-pattern|title-expansion)$/.test(candidate.source || '')) ||
                (expansion && /^(?:title-expansion|title-pattern)$/.test(candidate.source || ''));
            return {
                ...normalizedCandidate,
                nameLike,
                compositeName,
                fullCardIdentityName,
                variation,
                collectorNumber,
                expansion,
                feature,
                selectedByDefault,
                category: nameLike ? 'name' : collectorNumber ? 'collector' : expansion ? 'expansion' : variation ? 'variation' : feature ? 'feature' : 'context',
                _index: index,
            };
        });
        const hasSelectedCollector = prepared.some((keyword) => keyword.collectorNumber && keyword.selectedByDefault);
        const selectedCompositeNames = prepared
            .filter((keyword) => (keyword.compositeName || keyword.fullCardIdentityName) && keyword.selectedByDefault)
            .map((keyword) => keyword.compact);
        const filtered = prepared
            .map((keyword) => {
                const shadowedByComposite = Boolean(
                    keyword.nameLike &&
                    !keyword.compositeName &&
                    !keyword.fullCardIdentityName &&
                    selectedCompositeNames.some((compositeCompact) =>
                        compositeCompact !== keyword.compact && compositeCompact.includes(keyword.compact)
                    )
                );
                return {
                    ...keyword,
                    selectedByDefault: (keyword.selectedByDefault || (hasSelectedCollector && keyword.nameLike)) && !shadowedByComposite,
                    shadowedByComposite,
                };
            })
            .sort((left, right) => {
                const leftFullIdentity = left.compositeName || left.fullCardIdentityName;
                const rightFullIdentity = right.compositeName || right.fullCardIdentityName;
                if (leftFullIdentity !== rightFullIdentity) return leftFullIdentity ? -1 : 1;
                if (left.nameLike !== right.nameLike) return left.nameLike ? -1 : 1;
                if (left.selectedByDefault !== right.selectedByDefault) return left.selectedByDefault ? -1 : 1;
                if (left.collectorNumber !== right.collectorNumber) return left.collectorNumber ? -1 : 1;
                if (left.expansion !== right.expansion) return left.expansion ? -1 : 1;
                if (left.variation !== right.variation) return left.variation ? -1 : 1;
                return left._index - right._index;
            })
            .filter((keyword) => !this.isGenericTextPhraseChip(keyword));
        return this.keepTitleNameChipsUnlessAlbum(filtered, title, details)
            .slice(0, 16)
            .map(({ _index, ...keyword }) => {
                const preferredChip = Boolean(keyword.selectedByDefault);
                return {
                    ...keyword,
                    preferredChip,
                    selectedByDefault: Boolean(keyword.manual || keyword.source === 'manual-input'),
                };
            });
    }

    numericCollectorNumber(value = '') {
        return this.normalizeClueValue(value).match(/\b(\d{1,4}[a-z]?)(?:\/\d{1,4}[a-z]?)?\b/i)?.[1] || '';
    }

    extractVariation(titleInfo = {}, text = '') {
        const textWithoutExpansion = this.stripKnownExpansionAliases(text);
        const explicitVariation = textWithoutExpansion.match(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/i)?.[0] || '';
        const variation = explicitVariation ||
            (!text ? (
                titleInfo.cardType ||
                (titleInfo.isEXCard ? 'ex' : '') ||
                (titleInfo.isGXCard ? 'gx' : '') ||
                (titleInfo.isVSTARCard ? 'vstar' : '') ||
                (titleInfo.isVCard ? 'v' : '')
            ) : '');
        return String(variation || '').replace(/\s+/g, '').replace(/\./g, '').toLowerCase();
    }

    extractExpansion(titleInfo = {}, text = '') {
        const explicitExpansion = titleInfo.expansion || titleInfo.expansionName || '';
        if (explicitExpansion) {
            return explicitExpansion;
        }
        if (/\bRC\s*\d{1,4}[a-z]?(?:\s*\/\s*RC?\s*\d{1,4}[a-z]?)?\b/i.test(text)) {
            return /\bgenerations\b/i.test(text) ? 'Generations Radiant Collection' : 'Radiant Collection';
        }
        return this.knownExpansionAliases().find(({ pattern }) => pattern.test(text))?.name || '';
    }

    extractCollectorNumber(titleInfo = {}, text = '') {
        // Prefer bare slash collectors (14/100) before prefixed patterns. The
        // prefixed matcher is case-insensitive and otherwise eats "Zangoose 14/100".
        return (
            text.match(/\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i)?.[0] ||
            text.match(/\b(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\s*\/\s*(?:(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?)?\d{1,4}[a-z]?\b/i)?.[0] ||
            text.match(/\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/i)?.[0] ||
            text.match(/\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/)?.[0] ||
            text.match(/\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/)?.[0] ||
            titleInfo.collectorNumber ||
            titleInfo.cardNumber ||
            ''
        ).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
    }

    extractName(titleInfo = {}, title = '') {
        const titleName = titleInfo.pokemonName || titleInfo.name || titleInfo.trainerName || '';
        if (titleName) {
            return this.normalizeTargetedNameAlias(titleName) || titleName;
        }
        const withoutFeatureWords = String(title || '').replace(/\bfull\s*-?\s*art\b|\bfullart\b|\billustration\b/gi, ' ');
        const firstSegment = this.removeEbayMarketplaceNoise(withoutFeatureWords.split(/\s+-\s+/)[0] || withoutFeatureWords);
        const withoutCollectorExpansion = this.knownExpansionAliases().reduce((value, { pattern }) => value.replace(pattern, ' '), firstSegment)
            .replace(/\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/g, ' ')
            .replace(/\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/gi, ' ')
            .replace(/\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/g, ' ')
            .replace(/\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/gi, ' ');
        const withoutVariation = firstSegment
            .replace(withoutCollectorExpansion !== firstSegment ? firstSegment : /^$/, withoutCollectorExpansion)
            .replace(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi, ' ')
            .replace(/\b(?:special illustration rare|illustration rare|secret rare|ultra rare|holo rare|holo|rare|near mint|nm|lp|mp|hp)\b/gi, ' ')
            .replace(/\b\d{2,3}\s*hp\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return this.normalizeTargetedNameAlias(withoutVariation) || withoutVariation;
    }

    buildEbayPayload(title = document.title, titleInfo = this.extractTitleInfo(title), details = this.extractEbayDetails()) {
        const keywords = Array.isArray(this.currentKeywords) && this.currentKeywords.length
            ? this.currentKeywords
            : this.extractEbayKeywords(title, details, titleInfo);
        const hasExplicitSelection = this.selectedKeywordValues instanceof Set && this.selectedKeywordValues.size > 0;
        // Without an explicit chip selection, honor selectedByDefault only (listing
        // chips start unpressed). preferredChip is for UI defaults before the user
        // presses Analyze, not for silent payload selection.
        const selectedKeywords = keywords.filter((keyword) => hasExplicitSelection
            ? this.selectedKeywordValues.has(keyword.compact)
            : keyword.selectedByDefault);
        const selectedClues = selectedKeywords.map((keyword) => keyword.value);
        const nameKeyword = selectedKeywords.find((keyword) => keyword.nameLike);
        const collectorKeyword = selectedKeywords.find((keyword) => keyword.collectorNumber);
        const expansionKeyword = selectedKeywords.find((keyword) => keyword.expansion);
        const variationKeywords = selectedKeywords.filter((keyword) => keyword.variation);
        const featureKeywords = selectedKeywords.filter((keyword) => keyword.feature);
        const evidence = [title, details].filter(Boolean).join(' ');
        const fallbackName = this.extractName(titleInfo, title);
        const name = nameKeyword
            ? (
                this.knownEbayCompositeName(nameKeyword.value) ||
                (nameKeyword.fullCardIdentityName ? nameKeyword.value : this.resolvedPokemonNameFromClue(nameKeyword.value)) ||
                nameKeyword.value
            )
            : fallbackName;
        const variation = variationKeywords.map((keyword) => keyword.value).join(' ') || this.extractVariation(titleInfo, evidence);
        const collectorNumber = collectorKeyword ? this.normalizeEbayCollectorNumber(collectorKeyword.value) : (titleInfo.collectorNumber || titleInfo.cardNumber || this.extractCollectorNumber(titleInfo, evidence));
        const inferredExpansion = this.extractExpansion(titleInfo, evidence);
        const expansion = /^RC/i.test(collectorNumber) && /generations/i.test(evidence)
            ? 'Generations Radiant Collection'
            : (expansionKeyword?.value || inferredExpansion);
        const rarity = featureKeywords.find((keyword) => /illustration|full\s*-?\s*art|fullart/i.test(keyword.value))?.value ||
            (/\b(?:special illustration rare|illustration rare|illustration|full\s*-?\s*art|fullart)\b/i.test(evidence) ? 'illustration' : (titleInfo.rarity || ''));
        const features = [
            ...featureKeywords.map((keyword) => keyword.value),
            ...(rarity ? [rarity] : []),
        ].filter((feature, index, all) => all.findIndex((candidate) => this.compactClueValue(candidate) === this.compactClueValue(feature)) === index);
        const primaryClues = [name, variation].filter(Boolean);
        const searchTitle = this.buildEbaySearchTitle(title, selectedClues, keywords, {
            name,
            variation,
            expansion,
            collectorNumber,
            features,
        });
        const enableListingScan = this.isProductPage();
        const listingImageUrls = enableListingScan ? this.extractEbayListingImageUrls() : [];
        const listingKindResult = this.classifyEbayListingKind(title, details, listingImageUrls.length);
        this.currentListingKind = listingKindResult.kind;

        return {
            source: 'ebay',
            listingKey: this.stableUrl(),
            originalTitle: title,
            searchTitle: searchTitle || this.removeEbayMarketplaceNoise(title),
            primaryClues,
            selectedClues,
            selectedChipCategories: selectedClues.map((value) => ({
                label: value,
                value,
                category: selectedKeywords.find((keyword) => this.compactClueValue(keyword.value) === this.compactClueValue(value))?.category || 'context',
                selectedByDefault: true,
            })),
            name,
            variation,
            collectorNumber,
            numericCollectorNumber: collectorNumber ? this.numericCollectorNumber(collectorNumber) : '',
            expansion,
            features,
            rarity,
            listingKind: listingKindResult.kind,
            listingKindSignals: listingKindResult,
            listingDescription: String(details || '').slice(0, 2000),
            listingImageUrls,
            enableListingScan,
        };
    }

    buildEbaySearchTitle(title = this.currentTitle, clues = this.selectedKeywordLabels(), keywords = this.currentKeywords, fallback = {}) {
        const keywordForClue = (clue) => keywords.find((keyword) => this.compactClueValue(keyword.value) === this.compactClueValue(clue));
        const primaryClues = clues.filter((clue) => {
            const keyword = keywordForClue(clue);
            return keyword?.nameLike || keyword?.variation;
        });
        const selectedNameClues = primaryClues.filter((clue) => keywordForClue(clue)?.nameLike);
        const expansionClues = clues.filter((clue) => keywordForClue(clue)?.expansion);
        const collectorClues = clues.filter((clue) => keywordForClue(clue)?.collectorNumber);
        const featureClues = clues.filter((clue) => keywordForClue(clue)?.feature);
        const contextClues = clues.filter((clue) => {
            const keyword = keywordForClue(clue);
            return keyword && !keyword.nameLike && !keyword.variation && !keyword.expansion && !keyword.collectorNumber && !keyword.feature;
        });
        const compactExpansionClues = expansionClues.map((clue) => ({ clue, compact: this.compactClueValue(clue) }));
        const filteredExpansionClues = compactExpansionClues
            .filter(({ compact }, index, all) => !all.some((other, otherIndex) =>
                otherIndex !== index &&
                other.compact &&
                compact &&
                other.compact.includes(compact)
            ))
            .map(({ clue }) => clue);
        const effectiveExpansionClues = filteredExpansionClues.length > 0
            ? filteredExpansionClues
            : (fallback.expansion ? [fallback.expansion] : []);
        const effectiveFeatureClues = featureClues.length > 0
            ? featureClues
            : (fallback.features || []);
        const fallbackNameVariation = [fallback.name, fallback.variation].filter(Boolean).join(' ');
        const primaryWithoutFallbackDupes = primaryClues.filter((clue) => {
            const compactClue = this.compactClueValue(clue);
            const compactFallback = this.compactClueValue(fallbackNameVariation);
            return !(compactClue && compactFallback && compactFallback.endsWith(compactClue));
        });
        const selectedParts = clues.length > 0
            ? [
                ...(
                    selectedNameClues.length > 0
                        ? primaryClues
                        : [fallbackNameVariation, ...primaryWithoutFallbackDupes]
                ),
                ...effectiveExpansionClues,
                ...collectorClues,
                ...effectiveFeatureClues,
                ...contextClues,
            ]
            : [
                fallbackNameVariation,
                fallback.expansion,
                fallback.collectorNumber,
                ...(fallback.features || []),
            ];
        return selectedParts
            .map((part) => this.removeEbayMarketplaceNoise(part))
            .filter(Boolean)
            .filter((part, index, all) => {
                const compact = this.compactClueValue(part);
                return all.findIndex((candidate) => this.compactClueValue(candidate) === compact) === index &&
                    !all.some((candidate) => {
                        const candidateCompact = this.compactClueValue(candidate);
                        return candidateCompact !== compact &&
                            candidateCompact.includes(compact) &&
                            compact.length >= 4;
                    });
            })
            .join(' ') || this.removeEbayMarketplaceNoise(title);
    }

    selectedKeywordLabels() {
        return this.currentKeywords
            .filter((keyword) => this.selectedKeywordValues.has(keyword.compact))
            .map((keyword) => keyword.value);
    }

    selectedEbayKeywords() {
        return this.currentKeywords.filter((keyword) => this.selectedKeywordValues.has(keyword.compact));
    }

    selectedPrimaryClues(clues = this.selectedKeywordLabels()) {
        void clues;
        const selectedKeywords = this.selectedEbayKeywords();
        const nameKeyword = selectedKeywords.find((keyword) => keyword.nameLike);
        const variationKeywords = selectedKeywords.filter((keyword) => keyword.variation);
        const titleInfo = this.extractTitleInfo(this.currentTitle || '');
        const resolvedName = nameKeyword
            ? (
                this.knownEbayCompositeName(nameKeyword.value) ||
                (nameKeyword.fullCardIdentityName ? nameKeyword.value : this.resolvedPokemonNameFromClue(nameKeyword.value)) ||
                nameKeyword.value
            )
            : '';
        const name = resolvedName || this.extractName(titleInfo, this.currentTitle || '');
        const variation = variationKeywords.map((keyword) => keyword.value).join(' ') || this.extractVariation(titleInfo, this.currentTitle || '');
        const combinedName = this.compactClueValue(name).endsWith(this.compactClueValue(variation))
            ? name
            : [name, variation].filter(Boolean).join(' ');
        return [
            combinedName,
            variation,
        ].filter(Boolean).filter((clue, index, all) =>
            all.findIndex((candidate) => this.compactClueValue(candidate) === this.compactClueValue(clue)) === index
        );
    }

    buildSelectedEbayPayload(title = this.currentTitle, details = this.extractEbayDetails()) {
        const titleInfo = this.extractTitleInfo(title);
        const selectedClues = this.selectedKeywordLabels();
        const selectedKeywords = this.selectedEbayKeywords();
        const nameKeyword = selectedKeywords.find((keyword) => keyword.nameLike);
        const collectorKeyword = selectedKeywords.find((keyword) => keyword.collectorNumber);
        const expansionKeyword = selectedKeywords.find((keyword) => keyword.expansion);
        const variationKeywords = selectedKeywords.filter((keyword) => keyword.variation);
        const featureKeywords = selectedKeywords.filter((keyword) => keyword.feature);
        const evidence = [title, details].filter(Boolean).join(' ');
        const name = nameKeyword
            ? (
                this.knownEbayCompositeName(nameKeyword.value) ||
                (nameKeyword.fullCardIdentityName ? nameKeyword.value : this.resolvedPokemonNameFromClue(nameKeyword.value)) ||
                nameKeyword.value
            )
            : this.extractName(titleInfo, title);
        const variation = variationKeywords.map((keyword) => keyword.value).join(' ') || this.extractVariation(titleInfo, evidence);
        const collectorNumber = collectorKeyword ? this.normalizeEbayCollectorNumber(collectorKeyword.value) : (titleInfo.collectorNumber || titleInfo.cardNumber || this.extractCollectorNumber(titleInfo, evidence));
        const inferredExpansion = this.extractExpansion(titleInfo, evidence);
        const expansion = /^RC/i.test(collectorNumber) && /generations/i.test(evidence)
            ? 'Generations Radiant Collection'
            : (expansionKeyword?.value || inferredExpansion);
        const features = featureKeywords.map((keyword) => keyword.value);
        const fallback = {
            name,
            variation: variation || this.extractVariation(titleInfo, evidence),
            expansion: expansion || this.extractExpansion(titleInfo, evidence),
            collectorNumber: collectorNumber || this.extractCollectorNumber(titleInfo, evidence),
            features,
        };
        const enableListingScan = this.isProductPage();
        const listingImageUrls = enableListingScan ? this.extractEbayListingImageUrls() : [];
        const listingKindResult = this.classifyEbayListingKind(title, details, listingImageUrls.length);
        this.currentListingKind = listingKindResult.kind;
        return {
            source: 'ebay',
            listingKey: this.stableUrl(),
            originalTitle: title,
            searchTitle: this.buildEbaySearchTitle(title, selectedClues, this.currentKeywords, fallback),
            primaryClues: this.selectedPrimaryClues(selectedClues),
            selectedClues,
            selectedChipCategories: selectedKeywords.map((keyword) => ({
                label: keyword.label,
                value: keyword.value,
                category: keyword.category,
                selectedByDefault: Boolean(keyword.selectedByDefault),
            })),
            name,
            variation,
            collectorNumber,
            numericCollectorNumber: collectorNumber ? this.numericCollectorNumber(collectorNumber) : '',
            expansion,
            features,
            rarity: featureKeywords.some((keyword) => /illustration|full\s*-?\s*art|fullart/i.test(keyword.value)) ? 'illustration' : '',
            listingKind: listingKindResult.kind,
            listingKindSignals: listingKindResult,
            listingDescription: String(details || '').slice(0, 2000),
            listingImageUrls,
            enableListingScan,
        };
    }

    buildEbaySearchSignature(payload = {}) {
        return [
            'ebay',
            this.stableUrl(payload.listingKey || window.location.href),
            this.compactClueValue(payload.searchTitle || ''),
            ...(payload.selectedClues || []).map((clue) => this.compactClueValue(clue)).sort(),
            ...(payload.primaryClues || []).map((clue) => this.compactClueValue(clue)).sort(),
        ].join('|');
    }

    isHighConfidenceMatch(result = {}) {
        const rawScore = result.search_score ?? result.relevanceScore ?? result.score ?? result.search_rank;
        const score = Number(rawScore);
        if (!Number.isFinite(score)) return false;
        if (score <= 1) return score >= 0.7;
        if (score <= 100) return score >= 70;
        return true;
    }

    countHighConfidenceMatches(results = []) {
        return results.filter((result) => this.isHighConfidenceMatch(result)).length;
    }

    recordExtensionDebugEvent(type, details = {}) {
        if (!chrome.runtime?.id || typeof chrome.runtime.sendMessage !== 'function') {
            return Promise.resolve(null);
        }
        return Promise.resolve(chrome.runtime.sendMessage({
            action: 'recordExtensionDebugEvent',
            type,
            details: {
                source: 'ebay',
                url: window.location.href,
                ...details,
            },
        })).catch(() => null);
    }

    async searchCardWithBackground(title, ebayPayload = this.buildEbayPayload(title), trigger = 'process') {
        const signature = this.buildEbaySearchSignature(ebayPayload);
        const userChipSearch = trigger === 'keyword-toggle';
        const userInputScan = trigger === 'manual-clue';
        const overlayExpandScan = trigger === 'overlay-expand' || trigger === 'overlay-refresh';
        if (!userChipSearch && !userInputScan && !overlayExpandScan && this.searchResultsBySignature.has(signature)) {
            void this.recordExtensionDebugEvent('processor.search-skip', {
                searchSignature: signature,
                skippedDuplicateReason: 'cached-results',
                selectedClues: ebayPayload.selectedClues || [],
                previewSignature: signature,
                selectionRevision: this.currentSelectionRevision,
            });
            return this.searchResultsBySignature.get(signature);
        }
        if (!userChipSearch && !userInputScan && !overlayExpandScan && this.recentSearchResults.has(signature)) {
            const cachedResults = this.recentSearchResults.get(signature);
            this.recentSearchResults.delete(signature);
            this.recentSearchResults.set(signature, cachedResults);
            this.searchResultsBySignature.set(signature, cachedResults);
            this.storeMatchedResults(window.location.href, title, cachedResults);
            void this.recordExtensionDebugEvent('processor.search-skip', {
                searchSignature: signature,
                skippedDuplicateReason: 'recent-search-cache',
                selectedClues: ebayPayload.selectedClues || [],
                previewSignature: signature,
                selectionRevision: this.currentSelectionRevision,
                rowCount: cachedResults.length,
            });
            return cachedResults;
        }
        void this.recordExtensionDebugEvent('processor.search-start', {
            searchSignature: signature,
            title: ebayPayload.searchTitle || title,
            listingKey: ebayPayload.listingKey || this.stableUrl(),
            selectedClues: ebayPayload.selectedClues || [],
            primaryClues: ebayPayload.primaryClues || [],
            previewSignature: signature,
            selectionRevision: this.currentSelectionRevision,
        });
        this.setPokoinButtonScanState('scanning');
        const response = await chrome.runtime.sendMessage({
            action: 'searchCardForTitle',
            title: ebayPayload.searchTitle || title,
            originalTitle: title,
            clues: ebayPayload.selectedClues || [],
            primaryClues: ebayPayload.primaryClues || [],
            selectedClues: ebayPayload.selectedClues || [],
            ebayPayload,
            marketplacePayload: ebayPayload,
            previewSignature: this.buildEbaySearchSignature(ebayPayload),
            selectionRevision: this.currentSelectionRevision,
            url: window.location.href,
            forceRefresh: userChipSearch || userInputScan || overlayExpandScan,
            skipListingScan: userChipSearch,
            forceListingScan: userInputScan || overlayExpandScan,
            searchTrigger: trigger,
        });
        const results = response?.success && Array.isArray(response.results) ? response.results : [];
        this.searchResultsBySignature.set(signature, results);
        this.rememberRecentSearchResults(signature, results);
        this.storeMatchedResults(window.location.href, title, results);
        void this.recordExtensionDebugEvent(response?.success ? 'processor.search-complete' : 'processor.search-failed', {
            searchSignature: signature,
            title: ebayPayload.searchTitle || title,
            selectedClues: ebayPayload.selectedClues || [],
            previewSignature: signature,
            selectionRevision: this.currentSelectionRevision,
            rowCount: results.length,
            resultRows: results.map((row) => ({
                id: row?.card_id || row?.id || '',
                name: row?.name || '',
                collector: row?.collector_number || row?.collectorNumber || '',
                score: Number(row?.score ?? row?.similarity ?? row?.confidence) || 0,
                source: row?.source || row?.match_source || '',
            })),
            error: response?.success ? '' : response?.error || 'Search failed',
        });
        return results;
    }

    stableUrl(url = window.location.href) {
        try {
            const parsed = new URL(url);
            parsed.hash = '';
            parsed.search = '';
            return parsed.href.replace(/\/+$/, '');
        } catch (error) {
            return String(url || '').split('#')[0].split('?')[0].replace(/\/+$/, '');
        }
    }

    candidateCardId(result = {}) {
        return result.card_id || result.blueprint_id || result.cardId || result.blueprintId || '';
    }

    storeMatchedResults(url = window.location.href, title = '', results = []) {
        const key = this.stableUrl(url);
        this.latestTitleByUrl.set(key, title || document.title || '');
        this.latestResultsByUrl.set(key, Array.isArray(results) ? results : []);
    }

    rememberRecentSearchResults(signature, results = []) {
        if (!signature) {
            return;
        }
        if (this.recentSearchResults.has(signature)) {
            this.recentSearchResults.delete(signature);
        }
        this.recentSearchResults.set(signature, Array.isArray(results) ? results : []);
        while (this.recentSearchResults.size > 20) {
            this.recentSearchResults.delete(this.recentSearchResults.keys().next().value);
        }
    }

    buildSidePanelPreviewRowsPayload(url = window.location.href, results = this.latestResultsByUrl.get(this.stableUrl(url)) || []) {
        const rows = (Array.isArray(results) ? results : [])
            .slice(0, this.ebayCandidateRowLimit())
            .map((result) => {
                const cardId = this.candidateCardId(result);
                if (!cardId) {
                    return null;
                }
                return {
                    card_id: String(cardId),
                    name: result.name || result.name_en || result.pokemon_name || '',
                    set_name: result.set_name || result.expansion_name_en || result.expansionName || result.expansion_name || '',
                    card_number: result.card_number || result.collector_number || result.collectorNumber || '',
                    expansion_symbol_url: result.expansion_symbol_url || result.expansionSymbolUrl || result.symbolImageUrl || '',
                    preview_image_url: result.preview_image_url || result.previewImageUrl || result.image_url || result.imageUrl || result.cdn_image_url || '',
                    image_url: result.image_url || result.imageUrl || result.cdn_image_url || result.cdnImageUrl || '',
                    source: result.source || 'ebay_overlay_preview',
                    search_rank: result.search_rank || result.searchScore || result.search_score || result.relevanceScore || result.score || '',
                    pokoin_price: result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '',
                    canonicalUrl: result.canonicalUrl || result.canonical_url || '',
                    marketplaceUrl: result.marketplaceUrl || result.marketplace_url || '',
                    canonicalPath: result.canonicalPath || result.canonical_path || '',
                    marketplacePath: result.marketplacePath || result.marketplace_path || '',
                };
            })
            .filter(Boolean);
        return rows.length > 0 ? { previewRows: rows } : {};
    }

    buildSidePanelCandidatePayload(result = {}) {
        const cardId = this.candidateCardId(result);
        if (!cardId) {
            return {};
        }
        return {
            selectedCandidateId: String(cardId),
            selectedCandidate: {
                card_id: String(cardId),
                name: result.name || result.name_en || result.pokemon_name || '',
                set_name: result.set_name || result.expansion_name_en || result.expansionName || result.expansion_name || '',
                card_number: result.card_number || result.collector_number || result.collectorNumber || '',
                expansion_symbol_url: result.expansion_symbol_url || result.expansionSymbolUrl || result.symbolImageUrl || '',
                preview_image_url: result.preview_image_url || result.previewImageUrl || result.image_url || result.imageUrl || result.cdn_image_url || '',
                image_url: result.image_url || result.imageUrl || result.cdn_image_url || result.cdnImageUrl || '',
                source: result.source || 'ebay_overlay',
                search_rank: result.search_rank || result.searchScore || result.search_score || result.relevanceScore || result.score || '',
                pokoin_price: result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '',
                canonicalUrl: result.canonicalUrl || result.canonical_url || '',
                marketplaceUrl: result.marketplaceUrl || result.marketplace_url || '',
                canonicalPath: result.canonicalPath || result.canonical_path || '',
                marketplacePath: result.marketplacePath || result.marketplace_path || '',
            },
        };
    }

    currentPreviewResults(options = {}) {
        const payload = this.buildSelectedEbayPayload(this.currentTitle || document.title);
        const signature = this.buildEbaySearchSignature(payload);
        const results = this.searchResultsBySignature.get(signature) ||
            this.pendingSearchApplications.get(signature) ||
            (
                options.allowRenderedFallback || signature === this.lastAppliedSearchSignature
                    ? this.lastRenderedPreviewResults
                    : []
            ) ||
            [];
        return Array.isArray(results) ? results : [];
    }

    openPokoinSidePanel(url = window.location.href, title = document.title, ebayPayload = this.buildEbayPayload(title), candidate = null, options = {}) {
        const stableUrl = this.stableUrl(url);
        const hasSelectedOverlayState = this.currentKeywords.length > 0 &&
            this.selectedKeywordValues.size > 0 &&
            this.compactClueValue(title || '') === this.compactClueValue(this.currentTitle || '');
        const payload = hasSelectedOverlayState ? ebayPayload : this.buildEbayPayload(title);
        const previewResults = this.currentPreviewResults({
            allowRenderedFallback: Boolean(candidate) || Boolean(options.all),
        });
        const previewPayload = this.buildSidePanelPreviewRowsPayload(
            url,
            previewResults.length ? previewResults : (this.latestResultsByUrl.get(stableUrl) || [])
        );
        if (!previewPayload.previewRows?.length && candidate) {
            previewPayload.previewRows = [this.buildSidePanelCandidatePayload(candidate).selectedCandidate].filter(Boolean);
        }
        const previewRowCount = previewPayload.previewRows?.length || 0;
        const openAllCards = Boolean(options.all) || (!candidate && previewRowCount > 1);
        return chrome.runtime.sendMessage({
            action: 'openSidePanelForCurrentTab',
            url,
            title: payload.searchTitle || this.latestTitleByUrl.get(stableUrl) || title,
            originalTitle: title,
            clues: payload.selectedClues || [],
            primaryClues: payload.primaryClues || [],
            selectedClues: payload.selectedClues || [],
            ebayPayload: payload,
            marketplacePayload: payload,
            previewSignature: this.buildEbaySearchSignature(payload),
            previewSource: this.currentButton ? 'ebay_overlay' : 'ebay_button_preview',
            selectionRevision: this.currentSelectionRevision,
            ...previewPayload,
            ...(options.all || !candidate ? {} : this.buildSidePanelCandidatePayload(candidate || {})),
            openAllCards,
        }).catch((error) => {
            console.warn('⚠️ [EBAYE] Unable to open side panel:', error);
        });
    }

    attachSidePanelClick(button, title = document.title, url = window.location.href, ebayPayload = this.buildEbayPayload(title), options = {}) {
        let searchInFlight = null;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            if (this.consumeOverlayDragClick(event)) {
                return;
            }
            const open = () => this.openPokoinSidePanel(url, title, ebayPayload);
            if (!options.searchOnClick) {
                open();
                return;
            }
            if (!searchInFlight) {
                searchInFlight = this.searchCardWithBackground(title, ebayPayload)
                    .then((results) => {
                        this.storeMatchedResults(url, title, results);
                        if (results?.length) {
                            this.setPokoinButtonLabel(button, this.countHighConfidenceMatches(results));
                        }
                        return results;
                    })
                    .catch(() => []);
            }
            return Promise.resolve(searchInFlight).then(() => open());
        });
    }

    applyPokoinButtonStyles(button, styles = {}) {
        Object.assign(button.style, {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: this.pokoinBlue(),
            color: 'white',
            border: 'none',
            borderRadius: '999px',
            cursor: 'pointer',
            fontWeight: '700',
            transition: 'all 0.2s ease',
            width: 'auto',
            maxWidth: 'max-content',
            minWidth: '0',
            minHeight: '0',
            lineHeight: '1.2',
            boxSizing: 'border-box',
            flex: '0 0 auto',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            ...styles,
        });
        const icon = button.querySelector('img');
        if (icon) {
            icon.setAttribute?.('data-pokoin-button-icon', 'true');
            Object.assign(icon.style, {
                width: '20px',
                height: '20px',
                minWidth: '20px',
                minHeight: '20px',
                maxWidth: '20px',
                maxHeight: '20px',
                flex: '0 0 20px',
                borderRadius: '50%',
                objectFit: 'cover',
                display: 'block',
            });
        }
    }

    ebayPanelRoot(panel = this.currentPanel) {
        return panel?.shadowRoot || panel;
    }

    removeOwnedPanelChildren(selector) {
        this.ebayPanelRoot()?.querySelectorAll?.(selector).forEach((element) => element.remove());
    }

    createEbayOwnedPanelHost() {
        const host = document.createElement('div');
        host.setAttribute('data-pokoin-extension-panel', 'ebay');
        host.setAttribute('data-pokoin-ebay-panel-host', 'true');
        Object.assign(host.style, this.ebayPanelBaseStyles(), this.ebayFallbackPanelStyles());
        let root = host;
        if (typeof host.attachShadow === 'function') {
            root = host.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = this.ebayPanelResetStyles();
            root.appendChild(style);
        }
        const panel = document.createElement('div');
        panel.setAttribute('data-pokoin-ebay-panel', 'true');
        Object.assign(panel.style, this.ebayInsertedPanelStyles());
        root.appendChild(panel);
        return { host, panel };
    }

    ebayInsertedPanelStyles() {
        return {
            position: 'static',
            width: '100%',
            maxWidth: '420px',
            margin: '12px 0',
            maxHeight: 'calc(100vh - 72px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '8px',
            overflow: 'visible',
            pointerEvents: 'auto',
            fontFamily: 'Arial, sans-serif',
        };
    }

    ebayPanelBaseStyles() {
        return {
            all: 'initial',
            boxSizing: 'border-box',
            contain: 'layout style',
            colorScheme: 'light',
            pointerEvents: 'none',
            fontFamily: 'Arial, sans-serif',
        };
    }

    ebayPanelResetStyles() {
        return `
            :host {
                all: initial;
                box-sizing: border-box;
                contain: layout style;
                color-scheme: light;
                pointer-events: none;
                font-family: Arial, sans-serif;
            }
            *, *::before, *::after {
                box-sizing: border-box;
                font-family: Arial, sans-serif;
            }
            button {
                appearance: none;
                -webkit-appearance: none;
                font: inherit;
            }
            [data-pokoin-ebay-panel] img,
            [data-pokoin-ebay-panel] svg,
            [data-pokoin-ebay-header-row] img,
            [data-pokoin-ebay-header-row] svg,
            [data-pokemon-linker-button] img,
            .pokoin-icon {
                width: 20px !important;
                height: 20px !important;
                min-width: 20px !important;
                min-height: 20px !important;
                max-width: 20px !important;
                max-height: 20px !important;
                flex: 0 0 auto !important;
                object-fit: contain !important;
                display: block !important;
            }
            [data-pokoin-button-icon] {
                width: 20px !important;
                height: 20px !important;
                min-width: 20px !important;
                min-height: 20px !important;
                max-width: 20px !important;
                max-height: 20px !important;
                flex: 0 0 20px !important;
                border-radius: 50% !important;
                object-fit: cover !important;
                display: block !important;
            }
        `;
    }

    ebayFallbackPanelStyles() {
        return {
            position: 'fixed',
            bottom: 'auto',
            right: 'auto',
            zIndex: '2147483646',
            width: 'min(320px, calc(100vw - 32px))',
            maxWidth: '320px',
            maxHeight: 'calc(100vh - 24px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '8px',
            pointerEvents: 'none',
            fontFamily: 'Arial, sans-serif',
            opacity: '0.96',
        };
    }

    ebayHeaderRow() {
        return this.ebayPanelRoot()?.querySelector?.('[data-pokoin-ebay-header-row]') || null;
    }

    ensureEbayHeaderRow() {
        const root = this.ebayPanelRoot();
        if (!root) {
            return null;
        }
        let header = root.querySelector?.('[data-pokoin-ebay-header-row]');
        if (header && typeof header.appendChild === 'function') {
            return header;
        }
        header = document.createElement('div');
        header.setAttribute('data-pokoin-ebay-header-row', 'true');
        header.style.cssText = `
            display: flex;
            align-items: stretch;
            gap: 8px;
            width: 100%;
        `;
        const panel = this.currentPanel;
        if (typeof panel?.prepend === 'function') {
            panel.prepend(header);
        } else {
            panel?.appendChild(header);
        }
        return header;
    }

    renderEbayCollapseToggle() {
        const header = this.ensureEbayHeaderRow();
        if (!header) {
            return;
        }
        if (header.querySelector?.('[data-pokoin-ebay-collapse-toggle]')) {
            this.applyEbayOverlayCollapsedState();
            return;
        }
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.setAttribute('data-pokoin-ebay-collapse-toggle', 'true');
        toggle.style.cssText = `
            flex: 0 0 40px;
            width: 40px;
            min-width: 40px;
            height: 40px;
            padding: 0;
            border: 1px solid rgba(148, 163, 184, 0.45);
            border-radius: 10px;
            background: rgba(15, 23, 42, 0.72);
            color: #e0f2fe;
            font-size: 14px;
            font-weight: 700;
            line-height: 1;
            cursor: pointer;
            pointer-events: auto;
        `;
        toggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            this.setEbayOverlayCollapsed(!this.ebayOverlayCollapsed);
        }, true);
        header.appendChild(toggle);
        this.applyEbayOverlayCollapsedState();
    }

    applyEbayOverlayCollapsedState() {
        const collapsed = Boolean(this.ebayOverlayCollapsed);
        this.currentPanelHost?.setAttribute('data-pokoin-ebay-collapsed', collapsed ? 'true' : 'false');
        this.currentPanel?.setAttribute('data-pokoin-ebay-collapsed', collapsed ? 'true' : 'false');
        this.ebayPanelRoot()?.querySelectorAll?.('[data-pokoin-ebay-keywords], [data-pokoin-candidate-preview]')
            .forEach((element) => {
                element.style.display = collapsed ? 'none' : '';
                element.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
            });
        const toggle = this.ebayPanelRoot()?.querySelector?.('[data-pokoin-ebay-collapse-toggle]');
        if (toggle?.setAttribute) {
            if (toggle.style) {
                toggle.style.display = collapsed ? 'none' : '';
            }
            toggle.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
            toggle.textContent = collapsed ? '+' : 'X';
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            toggle.setAttribute('aria-label', collapsed ? 'Expand Pokoin eBay overlay' : 'Collapse Pokoin eBay overlay');
            toggle.setAttribute('title', collapsed ? 'Show Pokoin results' : 'Hide Pokoin results');
        }
        if (this.currentButton) {
            this.setPokoinButtonLabel(this.currentButton, this.currentMatchCount);
            this.applyPokoinButtonCollapsedLayout(this.currentButton);
            this.bindOverlayDragHandle(this.currentButton);
        }
        const panel = this.currentPanel;
        if (panel?.style) {
            panel.style.margin = collapsed ? '0' : '12px 0';
            panel.style.width = collapsed ? '40px' : '100%';
            panel.style.maxWidth = collapsed ? '40px' : '420px';
            panel.style.gap = collapsed ? '0' : '8px';
            panel.style.pointerEvents = 'auto';
        }
        const header = this.ebayHeaderRow();
        if (header?.style) {
            header.style.gap = collapsed ? '0' : '8px';
            header.style.width = collapsed ? '40px' : '100%';
            header.style.cursor = collapsed ? 'grab' : '';
            header.style.touchAction = collapsed ? 'none' : '';
        }
        this.applyOverlayDock();
    }

    setEbayOverlayCollapsed(collapsed) {
        this.ebayOverlayCollapsed = Boolean(collapsed);
        this.applyEbayOverlayCollapsedState();
        this.persistOverlayDock();
    }

    expandEbayOverlayAndRecognize() {
        return this.recognizeEbayListing('overlay-expand');
    }

    refreshEbayOverlayScan() {
        return this.recognizeEbayListing('overlay-refresh');
    }

    recognizeEbayListing(trigger = 'overlay-expand') {
        this.setEbayOverlayCollapsed(false);
        const title = this.currentTitle || (typeof document !== 'undefined' ? document.title : '');
        if (!title) {
            return Promise.resolve();
        }
        return this.runEbaySearch(title, trigger);
    }

    ensurePokoinSidePanelOpen() {
        if (typeof chrome.runtime?.sendMessage !== 'function') {
            return Promise.resolve();
        }
        return Promise.resolve(chrome.runtime.sendMessage({ action: 'ensureSidePanelOpen' })).catch((error) => {
            console.warn('⚠️ [EBAYE] Unable to open side panel:', error);
        });
    }

    findExistingEbayPanelHost() {
        return document.querySelector?.('[data-pokoin-ebay-panel-host]') || document.body?.querySelector?.('[data-pokoin-ebay-panel-host]') || null;
    }

    findExistingEbayPanel(host = this.currentPanelHost) {
        if (!host) {
            return null;
        }
        return host.shadowRoot?.querySelector?.('[data-pokoin-ebay-panel]') || host.querySelector?.('[data-pokoin-ebay-panel]');
    }

    ensureEbayPanel() {
        let host = this.currentPanelHost;
        let panel = this.findExistingEbayPanel(host);
        if (!host || !panel) {
            host = this.findExistingEbayPanelHost();
            panel = this.findExistingEbayPanel(host);
        }
        if (!host || !panel) {
            ({ host, panel } = this.createEbayOwnedPanelHost());
        }
        this.currentPanelHost = host;
        this.currentPanel = panel;
        if (!host.parentNode || !document.contains(host)) {
            document.body?.appendChild(host);
        }
        this.applyOverlayDock(host);
        this.restoreOverlayDock();
        this.bindOverlayDragHandle(this.currentButton);
        return panel;
    }

    overlayDockStorageKey() {
        return 'pokoinOverlayDock';
    }

    overlayDockSyncCacheKey() {
        return 'pokoin.overlayDock';
    }

    overlayDragRoot() {
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            return document;
        }
        return this.currentButton || this.currentPanelHost;
    }

    overlayHostWidth() {
        return this.ebayOverlayCollapsed ? 40 : 320;
    }

    overlayStorage() {
        try {
            return window?.localStorage || globalThis.localStorage || null;
        } catch {
            return null;
        }
    }

    clampOverlayTop(top, viewportHeight = (typeof window !== 'undefined' && window.innerHeight) || 600) {
        const maxTop = Math.max(8, Number(viewportHeight) - 56);
        return Math.max(8, Math.min(maxTop, Math.round(Number(top) || 12)));
    }

    clampOverlayLeft(left, width = this.overlayHostWidth(), viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || 800) {
        const maxLeft = Math.max(8, Number(viewportWidth) - Number(width) - 8);
        return Math.max(8, Math.min(maxLeft, Math.round(Number(left) || 12)));
    }

    normalizeOverlayDock(dock = {}, collapsed = this.ebayOverlayCollapsed) {
        const width = collapsed ? 40 : 320;
        const viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || 800;
        const side = dock?.side === 'right' ? 'right' : 'left';
        const top = this.clampOverlayTop(dock?.top);
        const hasLeft = Number.isFinite(Number(dock?.left));
        const left = hasLeft
            ? this.clampOverlayLeft(dock.left, width, viewportWidth)
            : this.clampOverlayLeft(side === 'right' ? viewportWidth - width - 12 : 12, width, viewportWidth);
        return {
            side,
            top,
            left,
            collapsed: typeof dock?.collapsed === 'boolean' ? dock.collapsed : undefined,
        };
    }

    overlayDockPayload() {
        const dock = this.normalizeOverlayDock(this.overlayDock);
        return {
            side: dock.side,
            top: dock.top,
            left: dock.left,
            collapsed: Boolean(this.ebayOverlayCollapsed),
        };
    }

    readOverlayDockSyncCache() {
        try {
            const raw = this.overlayStorage()?.getItem?.(this.overlayDockSyncCacheKey());
            if (!raw) {
                return null;
            }
            return this.normalizeOverlayDock(JSON.parse(raw));
        } catch {
            return null;
        }
    }

    writeOverlayDockSyncCache(dock = this.overlayDockPayload()) {
        try {
            this.overlayStorage()?.setItem?.(this.overlayDockSyncCacheKey(), JSON.stringify(dock));
        } catch {
            // Page storage can be blocked; chrome.storage.local still persists.
        }
    }

    hydrateOverlayDockFromSyncCache() {
        const cached = this.readOverlayDockSyncCache();
        if (!cached) {
            return false;
        }
        this.overlayDock = { side: cached.side, top: cached.top, left: cached.left };
        if (typeof cached.collapsed === 'boolean') {
            this.ebayOverlayCollapsed = cached.collapsed;
        }
        return true;
    }

    snapOverlayDockFromRect(rect = {}, viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || 800) {
        const width = Number(rect.width) || this.overlayHostWidth();
        const left = this.clampOverlayLeft(rect.left, width, viewportWidth);
        const top = this.clampOverlayTop(rect.top);
        this.overlayDock = {
            side: (left + (width / 2)) > (Number(viewportWidth) / 2) ? 'right' : 'left',
            top,
            left,
        };
        return this.overlayDock;
    }

    applyOverlayDock(host = this.currentPanelHost) {
        if (!host?.style) {
            return host;
        }
        const collapsed = Boolean(this.ebayOverlayCollapsed);
        const dock = this.normalizeOverlayDock(this.overlayDock, collapsed);
        this.overlayDock = { side: dock.side, top: dock.top, left: dock.left };
        host.style.top = `${dock.top}px`;
        host.style.left = `${dock.left}px`;
        host.style.bottom = 'auto';
        host.style.right = 'auto';
        if (collapsed) {
            host.style.width = '40px';
            host.style.maxWidth = '40px';
            host.style.height = '40px';
            host.style.maxHeight = '40px';
            host.style.gap = '0';
            host.style.overflow = 'hidden';
            host.style.contain = 'none';
            host.style.pointerEvents = 'auto';
            host.style.touchAction = 'none';
        } else {
            host.style.width = 'min(320px, calc(100vw - 32px))';
            host.style.maxWidth = '320px';
            host.style.height = '';
            host.style.maxHeight = 'calc(100vh - 24px)';
            host.style.gap = '8px';
            host.style.overflow = '';
            host.style.contain = 'layout style';
            host.style.pointerEvents = 'none';
            host.style.touchAction = '';
        }
        host.setAttribute?.('data-pokoin-overlay-side', dock.side);
        return host;
    }

    persistOverlayDock() {
        const payload = this.overlayDockPayload();
        this.writeOverlayDockSyncCache(payload);
        try {
            chrome.storage?.local?.set?.({
                [this.overlayDockStorageKey()]: payload,
            });
        } catch {
            // Ignore storage failures; dock still applies for this page.
        }
    }

    restoreOverlayDock() {
        if (this.overlayDockHydratedFromSync) {
            this.applyOverlayDock();
            this.overlayDockRestored = true;
            this.revealOverlayHost();
            return;
        }
        this.applyOverlayDock();
        if (this.overlayDockRestored) {
            this.revealOverlayHost();
            return;
        }
        const get = chrome.storage?.local?.get;
        if (typeof get !== 'function') {
            this.overlayDockRestored = true;
            this.revealOverlayHost();
            return;
        }
        this.overlayDockRestored = true;
        this.hideOverlayHostUntilDocked();
        Promise.resolve(get.call(chrome.storage.local, this.overlayDockStorageKey()))
            .then((stored) => {
                const dock = stored?.[this.overlayDockStorageKey()] || stored;
                if (dock && typeof dock === 'object') {
                    const normalized = this.normalizeOverlayDock(dock);
                    this.overlayDock = { side: normalized.side, top: normalized.top, left: normalized.left };
                    if (typeof dock.collapsed === 'boolean') {
                        this.ebayOverlayCollapsed = dock.collapsed;
                    }
                    this.writeOverlayDockSyncCache(this.overlayDockPayload());
                }
                this.applyEbayOverlayCollapsedState();
                this.revealOverlayHost();
            })
            .catch(() => {
                this.revealOverlayHost();
            });
    }

    hideOverlayHostUntilDocked(host = this.currentPanelHost) {
        if (host?.style && !this.overlayDockHydratedFromSync) {
            host.style.visibility = 'hidden';
        }
    }

    revealOverlayHost(host = this.currentPanelHost) {
        if (host?.style) {
            host.style.visibility = 'visible';
        }
    }

    consumeOverlayDragClick(event) {
        if (!this.overlayDragMoved) {
            return false;
        }
        this.overlayDragMoved = false;
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        return true;
    }

    bindOverlayDragHandle(handle) {
        if (!handle || handle.__pokoinOverlayDragBound) {
            return;
        }
        handle.__pokoinOverlayDragBound = true;
        if (handle.style) {
            handle.style.touchAction = 'none';
        }
        handle.addEventListener('pointerdown', (event) => this.beginOverlayDrag(event, handle), true);
    }

    beginOverlayDrag(event, handle) {
        if (event?.button != null && event.button !== 0) {
            return;
        }
        if (this.overlayDrag) {
            return;
        }
        const host = this.currentPanelHost;
        if (!host) {
            return;
        }
        event?.stopPropagation?.();
        const startX = Number(event?.clientX) || 0;
        const startY = Number(event?.clientY) || 0;
        const rect = typeof host.getBoundingClientRect === 'function'
            ? host.getBoundingClientRect()
            : {
                left: parseFloat(host.style.left) || 12,
                top: parseFloat(host.style.top) || this.overlayDock.top || 12,
                width: this.overlayHostWidth(),
                height: 40,
            };
        const originLeft = Number(rect.left) || 12;
        const originTop = Number(rect.top) || 12;
        const width = Number(rect.width) || this.overlayHostWidth();
        this.overlayDrag = {
            startX,
            startY,
            originLeft,
            originTop,
            width,
            left: originLeft,
            top: originTop,
            moved: false,
            pointerId: event?.pointerId,
        };
        handle.setPointerCapture?.(event?.pointerId);
        const dragThreshold = this.ebayOverlayCollapsed ? 3 : 8;
        const root = this.overlayDragRoot();
        const onMove = (moveEvent) => {
            if (this.overlayDrag?.pointerId != null && moveEvent?.pointerId != null && moveEvent.pointerId !== this.overlayDrag.pointerId) {
                return;
            }
            const dx = (Number(moveEvent?.clientX) || 0) - startX;
            const dy = (Number(moveEvent?.clientY) || 0) - startY;
            if (!this.overlayDrag.moved && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
                this.overlayDrag.moved = true;
                this.overlayDragMoved = true;
                if (handle.style) {
                    handle.style.cursor = 'grabbing';
                    handle.style.transform = 'none';
                }
            }
            if (!this.overlayDrag.moved) {
                return;
            }
            moveEvent?.preventDefault?.();
            const viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || 800;
            const viewportHeight = (typeof window !== 'undefined' && window.innerHeight) || 600;
            const left = Math.max(8, Math.min(viewportWidth - this.overlayDrag.width - 8, originLeft + dx));
            const top = this.clampOverlayTop(originTop + dy, viewportHeight);
            this.overlayDrag.left = left;
            this.overlayDrag.top = top;
            host.style.left = `${Math.round(left)}px`;
            host.style.right = 'auto';
            host.style.top = `${Math.round(top)}px`;
        };
        const onUp = (upEvent) => {
            root.removeEventListener?.('pointermove', onMove, true);
            root.removeEventListener?.('pointerup', onUp, true);
            root.removeEventListener?.('pointercancel', onUp, true);
            handle.releasePointerCapture?.(this.overlayDrag?.pointerId ?? event?.pointerId);
            if (handle.style) {
                handle.style.cursor = this.ebayOverlayCollapsed ? 'grab' : 'pointer';
            }
            const drag = this.overlayDrag;
            this.overlayDrag = null;
            if (!drag?.moved) {
                return;
            }
            upEvent?.preventDefault?.();
            upEvent?.stopPropagation?.();
            this.snapOverlayDockFromRect({
                left: drag.left,
                top: drag.top,
                width: drag.width,
            });
            this.applyOverlayDock(host);
            this.persistOverlayDock();
            setTimeout(() => {
                this.overlayDragMoved = false;
            }, 50);
        };
        root.addEventListener?.('pointermove', onMove, true);
        root.addEventListener?.('pointerup', onUp, true);
        root.addEventListener?.('pointercancel', onUp, true);
    }

    isEbayOwnedNodeConnected(node) {
        if (!node) {
            return false;
        }
        return document.contains(node) ||
            Boolean(this.currentPanelHost && document.contains(this.currentPanelHost) && this.currentPanelHost.contains?.(node)) ||
            Boolean(this.currentPanelHost && document.contains(this.currentPanelHost) && this.currentPanel?.contains?.(node));
    }

    createEbayPanelButton() {
        const panel = this.ensureEbayPanel();
        this.removeOwnedPanelChildren('[data-pokemon-linker-button]');
        const header = this.ensureEbayHeaderRow();
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        button.setAttribute('data-pokoin-ebay-primary-button', 'true');
        this.setPokoinButtonLabel(button, this.currentMatchCount);
        button.style.cssText = `
            flex: 1 1 auto;
            width: auto;
            padding: 10px 14px;
            font-size: 14px;
            min-width: 0;
            font-family: Arial, sans-serif;
            box-shadow: 0 4px 12px rgba(2, 132, 199, 0.18);
        `;
        this.applyPokoinButtonStyles(button, {
            borderRadius: '8px',
            background: '#075985',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            cursor: 'pointer',
            flex: '1 1 auto',
            width: 'auto',
            maxWidth: '',
        });
        this.currentButton = button;
        this.setPokoinButtonScanState('scanning', button);
        button.addEventListener('mouseenter', () => {
            if (this.ebayOverlayCollapsed) {
                return;
            }
            button.style.background = this.pokoinButtonScanHoverBackground();
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = this.pokoinButtonScanAppearance().boxShadow;
        });
        button.addEventListener('mouseleave', () => {
            if (this.ebayOverlayCollapsed) {
                button.style.transform = 'none';
                return;
            }
            button.style.background = this.pokoinButtonScanAppearance().background;
            button.style.transform = 'scale(1)';
            button.style.boxShadow = this.pokoinButtonScanAppearance().boxShadow;
        });
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            if (this.consumeOverlayDragClick(event)) {
                return;
            }
            if (this.ebayOverlayCollapsed) {
                this.expandEbayOverlayAndRecognize();
                this.ensurePokoinSidePanelOpen();
                return;
            }
            this.refreshEbayOverlayScan();
        }, true);
        if (header) {
            header.insertBefore(button, header.children?.[0] || null);
            this.renderEbayCollapseToggle();
        } else if (typeof panel.prepend === 'function') {
            panel.prepend(button);
        } else {
            panel.appendChild(button);
        }
        this.currentButton = button;
        this.bindOverlayDragHandle(button);
        this.applyPokoinButtonCollapsedLayout(button);
        return button;
    }

    prepareEbayKeywords(title, details) {
        this.currentKeywords = this.extractEbayKeywords(title, details, this.extractTitleInfo(title));
        this.selectedKeywordValues = new Set(
            this.currentKeywords
                .filter((keyword) => keyword.selectedByDefault)
                .map((keyword) => keyword.compact)
        );
    }

    applyKeywordChipStyle(chip, selected) {
        Object.assign(chip.style, {
            border: selected ? '1px solid #38bdf8' : '1px solid rgba(148, 163, 184, 0.45)',
            borderRadius: '999px',
            padding: '5px 9px',
            background: selected ? 'rgba(14, 165, 233, 0.92)' : 'rgba(15, 23, 42, 0.68)',
            color: '#ffffff',
            fontSize: '12px',
            lineHeight: '1',
            cursor: 'pointer',
            fontWeight: selected ? '700' : '500',
        });
        chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }

    renderKeywordToggles(title, details) {
        this.removeOwnedPanelChildren('[data-pokoin-ebay-keywords]');
        if (!this.currentKeywords.length) {
            this.prepareEbayKeywords(title, details);
        }
        const container = document.createElement('div');
        container.setAttribute('data-pokoin-ebay-keywords', 'true');
        container.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 8px;
            border-radius: 12px;
            background: rgba(15, 23, 42, 0.86);
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.22);
            font-family: Arial, sans-serif;
        `;
        this.currentKeywords.forEach((keyword) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.textContent = keyword.label;
            chip.setAttribute('data-pokoin-ebay-keyword', keyword.compact);
            chip.setAttribute('data-pokoin-ebay-keyword-category', keyword.category);
            this.applyKeywordChipStyle(chip, this.selectedKeywordValues.has(keyword.compact));
            chip.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const isSelected = this.selectedKeywordValues.has(keyword.compact);
                if (isSelected) {
                    this.selectedKeywordValues.delete(keyword.compact);
                } else {
                    this.selectedKeywordValues.add(keyword.compact);
                }
                this.applyKeywordChipStyle(chip, !isSelected);
                this.triggerEbaySelectionRefresh('keyword-toggle');
            }, true);
            container.appendChild(chip);
        });
        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('data-pokoin-ebay-manual-clue-input', 'true');
        input.setAttribute('aria-label', 'Add Pokoin search clue');
        input.placeholder = 'Add clue...';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.style.cssText = `
            flex: 0 1 120px;
            width: 120px;
            min-width: 92px;
            max-width: 140px;
            height: 26px;
            box-sizing: border-box;
            padding: 4px 8px;
            border: 1px solid rgba(148, 163, 184, 0.55);
            border-radius: 999px;
            background: rgba(2, 6, 23, 0.78);
            color: #f8fafc;
            font: 12px/1.2 Arial, sans-serif;
            outline: none;
            pointer-events: auto;
        `;
        const submitManualClue = () => {
            const value = input.value || '';
            input.value = '';
            const beforeSignature = this.buildEbaySearchSignature(this.buildSelectedEbayPayload(this.currentTitle || document.title));
            this.addManualEbayKeyword(value);
            const afterSignature = this.buildEbaySearchSignature(this.buildSelectedEbayPayload(this.currentTitle || document.title));
            if (afterSignature === beforeSignature) {
                return;
            }
            void this.recordExtensionDebugEvent('processor.manual-clue-changed', {
                clue: value,
                beforeSignature,
                afterSignature,
                selectedClues: this.selectedKeywordLabels(),
                selectionRevision: this.currentSelectionRevision,
            });
            this.renderKeywordTogglesFromCurrent();
            this.triggerEbaySelectionRefresh('manual-clue');
        };
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            submitManualClue();
        }, true);
        input.addEventListener('blur', submitManualClue, true);
        container.appendChild(input);
        this.ensureEbayPanel().appendChild(container);
        this.applyEbayOverlayCollapsedState();
    }

    renderKeywordTogglesFromCurrent() {
        this.removeOwnedPanelChildren('[data-pokoin-ebay-keywords]');
        if (!this.currentButton || this.currentKeywords.length === 0) {
            return;
        }
        this.renderKeywordToggles(this.currentTitle || document.title, this.extractEbayDetails());
    }

    overlayCandidateParts(result = {}) {
        const name = String(result.name || result.name_en || result.pokemon_name || '').trim();
        const rawNumber = String(result.collector_number || result.card_number || result.collectorNumber || '').trim();
        const number = rawNumber.match(/\b(?:[A-Z]{1,6}\s?)?(\d{1,4}[a-z]?)(?:\s*\/\s*(?:[A-Z]{1,6}\s?)?\d{1,4}[a-z]?)?\b/i)?.[1] || '';
        const setName = result.expansion_name_en || result.expansionName || result.set_name || result.setName || '';
        const price = String(result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '').trim();
        return {
            meta: [name, number || rawNumber, setName].filter(Boolean).join(' · '),
            price,
        };
    }

    compactCandidateMeta(result = {}) {
        const { meta, price } = this.overlayCandidateParts(result);
        return [meta, price].filter(Boolean).join(' · ');
    }

    candidateLanguageBadgesHtml(result = {}) {
        const langs = result.print_langs || result.printLangs || {};
        const available = (pack) => Boolean(
            pack && (
                pack === true ||
                typeof pack === 'string' ||
                pack.id ||
                pack.image_url ||
                pack.imageUrl
            )
        );
        const badges = [
            ['eur', '🇪🇺', 'EUR'],
            ['jp', '🇯🇵', 'JP'],
            ['cn', '🇨🇳', 'CN'],
        ].filter(([key]) => available(langs[key]));
        if (!badges.length) {
            return '';
        }
        return `<span data-pokoin-language-badges="true" aria-label="Available print languages: ${badges.map(([, , label]) => label).join(', ')}" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">${badges.map(([key, flag, label]) => `<span data-pokoin-language="${key}" style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border:1px solid rgba(56,189,248,0.45);border-radius:999px;background:rgba(15,23,42,0.8);color:#bae6fd;font-size:10px;font-weight:800;line-height:1;"><span aria-hidden="true">${flag}</span>${label}</span>`).join('')}</span>`;
    }

    overlayCandidateRowHtml(result = {}) {
        const logoUrl = this.candidateExpansionLogoUrl(result);
        const { meta, price } = this.overlayCandidateParts(result);
        const priceHtml = price
            ? `${meta ? ' · ' : ''}<span data-pokoin-pkn-price="true" style="color:#ffcc03;font-weight:800;">${price}</span>`
            : '';
        const label = `${meta || (price ? '' : 'Candidate')}${priceHtml}`;
        const languageBadges = this.candidateLanguageBadgesHtml(result);
        return `${logoUrl ? `<img src="${logoUrl}" alt="" style="width:20px;height:20px;object-fit:contain;border-radius:999px;background:rgba(15,23,42,0.72);">` : ''}<span style="display:flex;min-width:0;flex-direction:column;gap:5px;"><span style="display:block;color:#f8fafc;font-size:13px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label || 'Candidate'}</span>${languageBadges}</span>`;
    }

    candidateExpansionLogoUrl(result = {}) {
        return result.expansion_symbol_url || result.expansionSymbolUrl || result.symbolImageUrl || result.symbol_image_url || '';
    }

    renderCandidatePreview(results = []) {
        this.removeOwnedPanelChildren('[data-pokoin-candidate-preview]');
        this.lastRenderedPreviewResults = Array.isArray(results) ? results : [];
        this.currentMatchCount = Array.isArray(results) ? results.slice(0, this.ebayCandidateRowLimit()).length : 0;
        if (this.currentButton) {
            this.setPokoinButtonLabel(this.currentButton, this.currentMatchCount);
            this.applyPokoinButtonCollapsedLayout(this.currentButton);
        }
        if (!this.isEbayOwnedNodeConnected(this.currentButton) || results.length === 0) {
            this.applyEbayOverlayCollapsedState();
            return;
        }
        const preview = document.createElement('div');
        preview.setAttribute('data-pokoin-candidate-preview', 'true');
        preview.style.cssText = `
            width: 100%;
            max-height: calc(100vh - 220px);
            overflow-y: auto;
            padding: 12px;
            border: 1px solid rgba(56, 189, 248, 0.35);
            border-radius: 16px;
            background: rgba(7, 17, 31, 0.94);
            color: #f8fafc;
            box-shadow: 0 18px 42px rgba(2, 6, 23, 0.35);
            font-family: Arial, sans-serif;
        `;
        const visibleResults = results.slice(0, this.ebayCandidateRowLimit());
        if (visibleResults.length > 1) {
            this.appendAllOverlayRow(preview);
        }
        visibleResults.forEach((result) => {
            const row = document.createElement('button');
            const logoUrl = this.candidateExpansionLogoUrl(result);
            row.type = 'button';
            row.setAttribute('data-pokoin-candidate-row', 'true');
            row.setAttribute('aria-label', `Open ${this.compactCandidateMeta(result) || 'candidate'} in Pokoin side panel`);
            row.style.cssText = `
                display: grid;
                grid-template-columns: ${logoUrl ? '22px minmax(0, 1fr)' : '1fr'};
                align-items: center;
                gap: 8px;
                width: 100%;
                padding: 10px 0;
                border: 0;
                border-top: 1px solid rgba(148, 163, 184, 0.18);
                background: transparent;
                color: inherit;
                text-align: left;
                cursor: pointer;
                pointer-events: auto;
            `;
            row.innerHTML = this.overlayCandidateRowHtml(result);
            row.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation?.();
                this.openPokoinSidePanel(window.location.href, this.currentTitle || document.title, this.buildSelectedEbayPayload(this.currentTitle || document.title), result);
            }, true);
            preview.appendChild(row);
        });
        this.ensureEbayPanel().appendChild(preview);
        this.applyEbayOverlayCollapsedState();
    }

    appendAllOverlayRow(preview) {
        const row = document.createElement('button');
        row.type = 'button';
        row.setAttribute('data-pokoin-candidate-all', 'true');
        row.setAttribute('aria-label', 'Show all cards in Pokoin side panel');
        row.style.cssText = `
            display: grid;
            grid-template-columns: 1fr;
            align-items: center;
            width: 100%;
            padding: 10px 0;
            border: 0;
            border-top: 1px solid rgba(148, 163, 184, 0.18);
            background: transparent;
            color: inherit;
            text-align: left;
            cursor: pointer;
            pointer-events: auto;
        `;
        row.innerHTML = `<span style="display:block;color:#f8fafc;font-size:13px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">ALL</span>`;
        row.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            this.openPokoinSidePanel(
                window.location.href,
                this.currentTitle || document.title,
                this.buildSelectedEbayPayload(this.currentTitle || document.title),
                null,
                { all: true }
            );
        }, true);
        preview.appendChild(row);
    }

    invalidateEbayPreviewForSelectionChange() {
        this.currentSelectionRevision += 1;
        this.latestSearchToken += 1;
        this.lastAppliedSearchSignature = '';
        this.searchResultsBySignature.clear();
        this.recentSearchResults.clear();
        this.pendingSearchApplications.clear();
        this.lastRenderedPreviewResults = [];
        this.lastSentEbayPreviewReadySignature = '';
        this.lastSentEbayPreviewReadyRowIds = '';
        this.removeOwnedPanelChildren('[data-pokoin-candidate-preview]');
        this.currentMatchCount = 0;
        if (this.currentButton) {
            this.setPokoinButtonLabel(this.currentButton, this.currentMatchCount);
            this.setPokoinButtonScanState('scanning');
        }
        void this.recordExtensionDebugEvent('processor.selection-invalidated', {
            selectionRevision: this.currentSelectionRevision,
            selectedClues: this.selectedKeywordLabels(),
            url: window.location.href,
        });
    }

    async runEbaySearch(title = this.currentTitle, trigger = 'process') {
        const ebayPayload = this.buildSelectedEbayPayload(title);
        const searchSignature = this.buildEbaySearchSignature(ebayPayload);
        const userDriven = trigger === 'keyword-toggle' || trigger === 'manual-clue' || trigger === 'overlay-expand' || trigger === 'overlay-refresh';
        if (!userDriven && searchSignature === this.lastAppliedSearchSignature && this.searchResultsBySignature.has(searchSignature)) {
            void this.recordExtensionDebugEvent('processor.search-skip', {
                searchSignature,
                trigger,
                skippedDuplicateReason: 'already applied',
                selectedClues: ebayPayload.selectedClues || [],
                selectionRevision: this.currentSelectionRevision,
            });
            this.applyEbaySearchResults(searchSignature, this.searchResultsBySignature.get(searchSignature), { trigger });
            return;
        }
        if (!userDriven && this.searchResultsBySignature.has(searchSignature)) {
            void this.recordExtensionDebugEvent('processor.search-skip', {
                searchSignature,
                trigger,
                skippedDuplicateReason: 'cached-results',
                selectedClues: ebayPayload.selectedClues || [],
                selectionRevision: this.currentSelectionRevision,
            });
            this.applyEbaySearchResults(searchSignature, this.searchResultsBySignature.get(searchSignature), { trigger });
            return;
        }
        const searchToken = ++this.latestSearchToken;
        this.setPokoinButtonScanState('scanning');
        const backgroundResults = await this.searchCardWithBackground(title, ebayPayload, trigger);
        if (searchToken !== this.latestSearchToken || searchSignature !== this.buildEbaySearchSignature(this.buildSelectedEbayPayload(title))) {
            void this.recordExtensionDebugEvent('processor.search-stale', {
                searchSignature,
                trigger,
                staleResponseIgnored: true,
                selectedClues: ebayPayload.selectedClues || [],
                selectionRevision: this.currentSelectionRevision,
            });
            console.log('🚫 [EBAYE] Ignored stale eBay overlay search response');
            return;
        }
        this.searchResultsBySignature.set(searchSignature, backgroundResults);
        this.applyEbaySearchResults(searchSignature, backgroundResults, { trigger });
    }

    applyEbaySearchResults(searchSignature, results = []) {
        const isConnected = this.isEbayOwnedNodeConnected(this.currentButton);
        this.lastAppliedSearchSignature = searchSignature;
        this.pendingSearchApplications.delete(searchSignature);
        this.searchResultsBySignature.set(searchSignature, results);
        this.renderCandidatePreview(results);
        this.setPokoinButtonScanState(Array.isArray(results) && results.length ? 'ready' : 'idle');
        void this.recordExtensionDebugEvent('processor.search-apply', {
            searchSignature,
            rowCount: Array.isArray(results) ? results.length : 0,
            resultRows: (Array.isArray(results) ? results : []).map((row) => ({
                id: row?.card_id || row?.id || '',
                name: row?.name || '',
                collector: row?.collector_number || row?.collectorNumber || '',
                score: Number(row?.score ?? row?.similarity ?? row?.confidence) || 0,
                source: row?.source || row?.match_source || '',
            })),
            uiMounted: isConnected,
            selectionRevision: this.currentSelectionRevision,
        });
        this.sendEbayPreviewReady(searchSignature, results);
        return isConnected;
    }

    ebayPreviewRowIds(results = []) {
        return (Array.isArray(results) ? results : [])
            .slice(0, this.ebayCandidateRowLimit())
            .map((result) => String(this.candidateCardId(result) || ''))
            .filter(Boolean)
            .join('|');
    }

    sendEbayPreviewReady(searchSignature, results = []) {
        const rowIds = this.ebayPreviewRowIds(results);
        if (this.lastSentEbayPreviewReadySignature === searchSignature && this.lastSentEbayPreviewReadyRowIds === rowIds) {
            void this.recordExtensionDebugEvent('processor.preview-skip', {
                searchSignature,
                skippedDuplicateReason: 'same preview rows already sent',
                rowIds,
                selectionRevision: this.currentSelectionRevision,
            });
            return Promise.resolve();
        }
        this.lastSentEbayPreviewReadySignature = searchSignature;
        this.lastSentEbayPreviewReadyRowIds = rowIds;
        return this.sendEbayTokensReady('preview-ready', {
            searchSignature,
            includePreviewRows: true,
            previewResults: Array.isArray(results) ? results : [],
        });
    }

    sendEbayTokensReady(trigger = 'tokens-ready', options = {}) {
        const ebayPayload = this.buildSelectedEbayPayload(this.currentTitle || document.title);
        const previewPayload = options.includePreviewRows
            ? this.buildSidePanelPreviewRowsPayload(window.location.href, options.previewResults || [])
            : {};
        const previewSignature = options.searchSignature || this.buildEbaySearchSignature(ebayPayload);
        void this.recordExtensionDebugEvent(options.includePreviewRows ? 'processor.preview-ready' : 'processor.tokens-ready', {
            searchSignature: previewSignature,
            trigger,
            rowCount: previewPayload.previewRows?.length || 0,
            selectedClues: ebayPayload.selectedClues || [],
            selectionRevision: this.currentSelectionRevision,
        });
        return Promise.resolve(chrome.runtime.sendMessage({
            action: 'marketplacePreviewReady',
            source: 'ebay',
            tokensReady: true,
            url: window.location.href,
            title: ebayPayload.searchTitle || this.currentTitle || document.title,
            originalTitle: this.currentTitle || document.title,
            listingKey: ebayPayload.listingKey || this.stableUrl(),
            clues: ebayPayload.selectedClues || [],
            primaryClues: ebayPayload.primaryClues || [],
            selectedClues: ebayPayload.selectedClues || [],
            ebayPayload,
            marketplacePayload: ebayPayload,
            previewSignature,
            previewSource: options.includePreviewRows ? 'ebay_overlay' : 'ebay_overlay_tokens',
            selectionRevision: this.currentSelectionRevision,
            // Automatic title hydration must wait for the image scan. Treating
            // title-ready like a manual chip click caused provisional clue
            // matches to flash before the recognized card was available.
            skipListingScan: Boolean(options.skipListingScan) || trigger === 'keyword-toggle',
            forceListingScan: Boolean(options.forceListingScan) || trigger === 'manual-clue' || trigger === 'overlay-expand' || trigger === 'overlay-refresh',
            ...previewPayload,
        })).catch((error) => {
            console.warn('⚠️ [EBAYE] Unable to send eBay tokens/preview:', error);
        });
    }

    /**
     * Initialize eBay processor
     */
    init() {
        console.log('🔴 [EBAYE] Initializing eBay processor...');
        
        // Process immediately if current page is a product page
        if (this.isProductPage()) {
            this.processProductPage();
        } else if (window.location.hostname.includes('ebay') && window.location.pathname.includes('/itm/')) {
            this.scheduleProductPageRetry('initial-hydration');
        }
        
        // Start observer for new listings
        this.startObserver();
    }

    /**
     * Check whether current page is an eBay product page
     */
    isProductPage() {
        const hostname = String(window.location?.hostname || '');
        const pathname = String(window.location?.pathname || '');
        if (!hostname.includes('ebay')) {
            return false;
        }
        if (pathname.includes('/itm/')) {
            return true;
        }
        return typeof document?.querySelector === 'function' &&
            Boolean(document.querySelector('h1.x-item-title__mainTitle'));
    }

    /**
     * Process an eBay product page
     */
    processProductPage() {
        const pageKey = this.stableUrl(window.location.href);

        try {
            console.log('🔍 [EBAYE] Processing eBay product page...');

            // Find product title
            const titleSelectors = [
                'h1.x-item-title__mainTitle',
                'h1[data-testid="x-item-title__mainTitle"]',
                'h1.x-item-title__titleText',
                '[data-testid="x-item-title"] h1',
                'h1[class*="title"]',
                'h1'
            ];

            let titleElement = null;
            for (const selector of titleSelectors) {
                titleElement = document.querySelector(selector);
                if (titleElement) break;
            }

            if (!titleElement) {
                console.log('⚠️ [EBAYE] Product title not found');
                return;
            }

            const title = titleElement.textContent.trim();
            if (!title) {
                console.log('⚠️ [EBAYE] Product title is empty');
                return;
            }

            if (
                this.processedPages.has(pageKey) &&
                this.isEbayOwnedNodeConnected(this.currentButton) &&
                this.compactClueValue(this.currentTitle) === this.compactClueValue(title)
            ) {
                console.log('🚫 [EBAYE] Product page already processed, skipping');
                return;
            }

            if (!this.processedPages.has(pageKey)) {
                this.ebayOverlayCollapsed = true;
                this.persistOverlayDock();
            }
            
            console.log(`🔍 [EBAYE] Product title: "${title}"`);

            const details = this.extractEbayDetails();
            this.currentTitle = title;
            this.currentTitleElement = titleElement;
            this.prepareEbayKeywords(title, details);
            this.createEbayPanelButton();
            this.renderKeywordToggles(title, details);
            
            // Mark page as processed
            this.processedPages.add(pageKey);
            
        } catch (error) {
            console.error('❌ [EBAYE] Error while processing product page:', error);
        }
    }

    scheduleProductPageRetry(reason = 'dom-update') {
        if (this.productPageRetryTimer) {
            return;
        }
        this.productPageRetryTimer = setTimeout(() => {
            this.productPageRetryTimer = null;
            if (this.isProductPage()) {
                console.log(`🔁 [EBAYE] Retrying product page processing after ${reason}`);
                this.processProductPage();
            }
        }, 250);
    }

    /**
     * Start observer for new listings
     */
    startObserver() {
        const observer = new MutationObserver((mutations) => {
            if (!this.isEnabled) return;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    if (window.location.pathname.includes('/itm/') && !this.isEbayOwnedNodeConnected(this.currentButton)) {
                        this.scheduleProductPageRetry('mutation');
                    }
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.processNewListings(node);
                        }
                    });
                }
            });
        });
        
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            console.log('✅ [EBAYE] Observer started');
        }
    }

    /**
     * Process new listings
     */
    processNewListings(container) {
        const listings = this.findListings(container);
        listings.forEach(listing => {
            if (!listing.hasAttribute('data-pokemon-linker-processed')) {
                this.processListing(listing);
            }
        });
    }

    /**
     * Find listings in a container
     */
    findListings(container) {
        const selectors = [
            '.s-item',
            '.s-item__wrapper',
            '.s-item__info',
            '.s-item__details'
        ];
        
        const listings = [];
        selectors.forEach(selector => {
            const elements = container.querySelectorAll ? 
                container.querySelectorAll(selector) : 
                (container.matches && container.matches(selector) ? [container] : []);
            listings.push(...elements);
        });
        
        return listings;
    }

    /**
     * Process one listing
     */
    async processListing(listingElement) {
        if (!this.isEnabled || listingElement.hasAttribute('data-pokemon-linker-processed')) {
            return;
        }

        try {
            const title = this.extractTitleFromListing(listingElement);
            if (!title) return;
            
            const titleInfo = this.extractTitleInfo(title);
            const ebayPayload = this.buildEbayPayload(title, titleInfo);
            
            // Create button
            const button = document.createElement('button');
            button.setAttribute('data-pokemon-linker-button', 'true');
            this.setPokoinButtonLabel(button);
            button.style.cssText = `
                margin-top: 8px;
                margin-left: 8px;
                padding: 6px 12px;
                font-size: 14px;
            `;
            this.applyPokoinButtonStyles(button);
            const listingUrl = listingElement.querySelector?.('a[href*="/itm/"]')?.href || window.location.href;
            this.attachSidePanelClick(button, title, listingUrl, { ...ebayPayload, listingKey: this.stableUrl(listingUrl) }, { searchOnClick: true });
            
            // Insert button
            const inserted = this.insertLinkContainer(listingElement, button);
            if (inserted) {
                console.log(`✅ [EBAYE] Added button for ${titleInfo.pokemonName || title}`);
            }
            
            listingElement.setAttribute('data-pokemon-linker-processed', 'true');
            
        } catch (error) {
            console.error('❌ [EBAYE] Error while processing listing:', error);
        }
    }

    /**
     * Extract title from listing
     */
    extractTitleFromListing(listingElement) {
        const titleSelectors = [
            '.s-item__title',
            '.s-item__link',
            'h3',
            '.title',
            '.name'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                let title = element.textContent.trim();
                title = title.replace(/\b(CardTrader|Pokoin)\b/g, '').trim();
                return title;
            }
        }
        
        return null;
    }

    /**
     * Insert link container
     */
    insertLinkContainer(listingElement, button) {
        const insertAfterSelectors = [
            '.s-item__title',
            '.s-item__link',
            'h3'
        ];
        
        for (const selector of insertAfterSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.parentNode) {
                const parent = element.parentNode;
                parent.insertBefore(button, element.nextSibling);
                return true;
            }
        }
        
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    }

    /**
     * Extract title info (delegates to `content.js`)
     */
    extractTitleInfo(title) {
        // Delegate to global function when available
        if (typeof window.extractTitleInfo === 'function') {
            return window.extractTitleInfo(title);
        }
        return { pokemonName: null };
    }

    /**
     * Search database through the background service worker.
     */
    async searchCardInDatabase(titleInfo, title, ebayPayload = this.buildEbayPayload(title, titleInfo)) {
        void titleInfo;
        return this.searchCardWithBackground(title, ebayPayload, 'listing-click');
    }

    /**
     * Generate Pokoin card link
     */
    generatePokoinLink(blueprintId) {
        return `https://pokoin.com/marketplace/en/cards/${blueprintId}`;
    }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener && !window.__pokoinEbayScanMergedListener) {
    window.__pokoinEbayScanMergedListener = true;
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request?.action !== 'pokoinListingScanMerged') {
            return undefined;
        }
        const processor = window.ebayProcessor;
        if (!processor || typeof processor.applyEbaySearchResults !== 'function') {
            sendResponse?.({ success: false });
            return false;
        }
        const requestUrl = String(request.url || '').split('#')[0];
        const pageUrl = String(window.location.href || '').split('#')[0];
        if (requestUrl && pageUrl && requestUrl !== pageUrl) {
            sendResponse?.({ success: true, ignored: true });
            return false;
        }
        const ebayPayload = typeof processor.buildSelectedEbayPayload === 'function'
            ? processor.buildSelectedEbayPayload(processor.currentTitle || document.title)
            : {};
        const signature = request.searchSignature
            || (typeof processor.buildEbaySearchSignature === 'function'
                ? processor.buildEbaySearchSignature(ebayPayload)
                : '');
        const results = Array.isArray(request.results) ? request.results : [];
        if (request.listingKind) {
            processor.currentListingKind = request.listingKind;
        }
        if (signature) {
            processor.searchResultsBySignature?.set(signature, results);
        }
        processor.applyEbaySearchResults(signature, results, { trigger: 'listing-scan-merged' });
        sendResponse?.({ success: true, rowCount: results.length });
        return false;
    });
}

// Export for global usage
window.EbayProcessor = EbayProcessor; 
