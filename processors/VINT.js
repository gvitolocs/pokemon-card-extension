/**
 * VINT.js - Vinted-specific processor
 * Product-page overlay for singles and album/lot listings.
 */

class VintedProcessor {
    constructor() {
        this.isEnabled = true;
        this.processedPages = new Set();
        this.currentTitle = '';
        this.currentTitleElement = null;
        this.currentKeywords = [];
        this.selectedKeywordValues = new Set();
        this.latestSearchToken = 0;
        this.currentPanel = null;
        this.currentPanelHost = null;
        this.currentButton = null;
        this.currentListingKey = '';
        this.lastAppliedSearchSignature = '';
        this.searchResultsBySignature = new Map();
        this.recentSearchResults = new Map();
        this.inFlightSearches = new Map();
        this.listingScanFinalSignatures = new Set();
        this.pendingSearchApplications = new Map();
        this.lastRenderedPreviewResults = [];
        this.vintedPanelObserver = null;
        this.vintedNavigationObserver = null;
        this.vintedNavigationTimer = null;
        this.vintedReinsertTimer = null;
        this.vintedProcessAttempts = new Map();
        this.vintedProcessRetryDelayMs = 500;
        this.vintedProcessMaxRetries = 10;
        this.vintedSessionId = `vinted-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        this.vintedSequenceId = 0;
        this.vintedDiagnostics = [];
        this.vintedOverlayCollapsed = true;
        this.overlayDock = { side: 'left', top: 12, left: 12 };
        this.overlayDockRestored = false;
        this.overlayDockHydratedFromSync = this.hydrateOverlayDockFromSyncCache();
        this.overlayDrag = null;
        this.overlayDragMoved = false;
        this.currentMatchCount = 0;
        this.pokoinButtonScanState = 'idle';
        this.currentSelectionRevision = 0;
        this.lastVintedCatalogueWarmupSignature = '';
        this.currentListingKind = '';
        this.lastSentListingImageCount = -1;
        this.vintedListingPhotoObserver = null;
        this.vintedListingPhotoTimer = null;
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
        const collapsed = Boolean(this.vintedOverlayCollapsed);
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
        const collapsed = Boolean(this.vintedOverlayCollapsed);
        const background = button.style.background || this.pokoinBlue();
        const border = button.style.border || 'none';
        const boxShadow = button.style.boxShadow || 'none';
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

    countPreviewCandidateMatches(results = []) {
        const previewResults = Array.isArray(results) ? results.slice(0, this.vintedCandidateRowLimit()) : [];
        const highConfidenceCount = this.countHighConfidenceMatches(previewResults);
        return highConfidenceCount > 0 ? highConfidenceCount : previewResults.length;
    }

    vintedCandidateRowLimit() {
        return Number.MAX_SAFE_INTEGER;
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
            color: '#ffffff',
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

    targetedVintedNameAliases() {
        return {
            magaerna: 'Magearna',
            magaeran: 'Magearna',
        };
    }

    normalizeTargetedVintedNameAlias(value = '') {
        return this.targetedVintedNameAliases()[this.compactClueValue(value)] || '';
    }

    normalizeTargetedVintedNameAliasFromPhrase(value = '') {
        const exactAlias = this.normalizeTargetedVintedNameAlias(value);
        if (exactAlias) {
            return exactAlias;
        }
        const withoutVariation = this.normalizeClueValue(value)
            .replace(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const aliasWithoutVariation = this.normalizeTargetedVintedNameAlias(withoutVariation);
        if (aliasWithoutVariation) {
            return aliasWithoutVariation;
        }
        const compactWithoutVariation = this.compactClueValue(withoutVariation);
        return Object.values(this.targetedVintedNameAliases()).find((canonicalName) =>
            this.compactClueValue(canonicalName) === compactWithoutVariation
        ) || '';
    }

    normalizeTargetedVintedNameAliasPhrase(value = '') {
        let normalized = this.normalizeClueValue(value);
        for (const [aliasCompact, canonicalName] of Object.entries(this.targetedVintedNameAliases())) {
            const pattern = new RegExp(`\\b${aliasCompact.split('').join('\\s*')}\\b`, 'i');
            normalized = normalized.replace(pattern, canonicalName);
        }
        return normalized !== this.normalizeClueValue(value) ? normalized : '';
    }

    removeVintedMarketplaceNoise(value = '') {
        return this.normalizeClueValue(value)
            .replace(/\b(?:pok[eé]mon|pokemon|pkkmn|pkn|pokn)\b/gi, ' ')
            .replace(/\b(?:carta|carte|card|cards)\b/gi, ' ')
            .replace(/\b(?:sealed|seal(?:ed)?|salead|saled|sigillat[aoe]?|pack|booster|lot)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    vintedKeywordStopWords() {
        return new Set([
            'a', 'an', 'and', 'con', 'da', 'de', 'del', 'della', 'di', 'e', 'for', 'in', 'il', 'la', 'le',
            'of', 'per', 'the', 'un', 'una', 'with',
            'pokemon', 'pokémon', 'pokemom', 'pkkmn', 'pkn', 'pokn',
            'carta', 'carte', 'card', 'cards',
            'tcg', 'gioco', 'trading', 'collezione', 'collezionabile',
            'condizione', 'condizioni', 'condition', 'conditions', 'ottime', 'perfette', 'buone', 'nuova', 'nuovo',
            'near', 'mint', 'excellent', 'good', 'played', 'used', 'usata', 'usato',
            'vendo', 'vendita', 'spedizione', 'scambio', 'scrivimi', 'lotto', 'lot', 'bundle',
            'originale', 'original', 'italiano', 'italiana', 'inglese', 'english', 'japanese', 'giapponese',
            'liv', 'lv', 'level', 'specie',
            'psa', 'bgs', 'cgc', 'sgc',
        ]);
    }

    isRarityFeatureClue(value = '') {
        return /\b(?:special\s+illustration\s+rare|illustration\s+rare|secret\s+rare|ultra\s+rare|holo\s+rare|reverse\s+holo|holo|promo|rare)\b/i.test(this.normalizeClueValue(value));
    }

    addKeywordCandidate(candidates, value, source = 'description') {
        let label = this.normalizeClueValue(value);
        label = label
            .replace(/\bex\b/gi, 'ex')
            .replace(/\bgx\b/gi, 'GX')
            .replace(/\bv\b/gi, 'V')
            .replace(/\bmega\b/gi, 'Mega')
            .replace(/\bvmax\b/gi, 'VMAX')
            .replace(/\bvstar\b/gi, 'VSTAR');
        if (/\bset\s+base\b/i.test(label)) {
            label = label.replace(/\bset\s+base\b/gi, 'Base Set');
        }
        if (source !== 'text' && this.isCollectorNumberClue(label)) {
            label = this.normalizeVintedCollectorNumber(label);
        }
        const compact = this.compactClueValue(label);
        const stopWords = this.vintedKeywordStopWords();
        const isVariation = this.isVariationClue(label) || /^[XY]$/i.test(label);
        if (!label || (compact.length < 2 && !isVariation) || stopWords.has(label.toLowerCase()) || stopWords.has(compact)) {
            return;
        }
        if (!candidates.some((candidate) => candidate.compact === compact)) {
            candidates.push({ label, value: label, compact, source });
        }
    }

    isPokemonNameLikeClue(value = '') {
        const label = this.removeVintedMarketplaceNoise(typeof value === 'object' ? value.label || value.value : value);
        const compact = this.compactClueValue(label);
        if (!label || compact.length < 3) {
            return false;
        }
        if (this.isRarityFeatureClue(label) || this.isExpansionClue(label)) {
            return false;
        }

        const normalizedParts = label.split(/\s+/).filter(Boolean);
        if (normalizedParts.length > 3) {
            return false;
        }

        if (typeof window.extractTitleInfo !== 'function') {
            return false;
        }

        try {
            const titleInfo = window.extractTitleInfo(label) || {};
            const resolvedName = titleInfo.pokemonName || titleInfo.name || '';
            if (this.normalizeTargetedVintedNameAliasFromPhrase(label)) {
                return true;
            }
            return Boolean(resolvedName && this.compactClueValue(resolvedName) === compact);
        } catch (error) {
            console.warn('⚠️ [VINT] Unable to validate clue as Pokemon name:', error);
            return false;
        }
    }

    isVariationClue(value = '') {
        return /\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break|delta(?:\s+species)?|species\s+delta|specie\s+delta)\b/i.test(this.normalizeClueValue(value));
    }

    displayVariationToken(value = '') {
        const compact = this.compactClueValue(value);
        const labels = {
            vmax: 'VMAX',
            vstar: 'VSTAR',
            ex: 'ex',
            gx: 'GX',
            v: 'V',
            lvx: 'Lv. X',
            mega: 'Mega',
            radiant: 'Radiant',
            shining: 'Shining',
            prime: 'Prime',
            break: 'BREAK',
            x: 'X',
            y: 'Y',
            delta: 'Delta Species',
            deltaspecies: 'Delta Species',
            speciesdelta: 'Delta Species',
            speciedelta: 'Delta Species',
        };
        return labels[compact] || value;
    }

    variationClueValuesFromPhrase(value = '') {
        const source = this.normalizeClueValue(value);
        const matches = source.match(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break|delta(?:\s+species)?|species\s+delta|specie\s+delta)\b/gi) || [];
        const megaFormMatches = /\bmega\b/i.test(source)
            ? (source.match(/\b[XY]\b/g) || [])
            : [];
        const seen = new Set();
        return [...matches, ...megaFormMatches]
            .map((token) => this.displayVariationToken(token))
            .filter((token) => {
                const compact = this.compactClueValue(token);
                if (!compact || seen.has(compact)) {
                    return false;
                }
                seen.add(compact);
                return true;
            });
    }

    vintedVariationCompacts() {
        return ['vmax', 'vstar', 'ex', 'gx', 'v', 'lvx', 'mega', 'radiant', 'shining', 'prime', 'break', 'x', 'y', 'delta', 'deltaspecies', 'speciesdelta', 'speciedelta'];
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

    resolvedPokemonNameFromClue(value = '') {
        if (typeof window.extractTitleInfo !== 'function') {
            return '';
        }

        try {
            const normalized = this.normalizeClueValue(value);
            const titleInfo = window.extractTitleInfo(normalized) || {};
            const resolvedName = titleInfo.pokemonName || titleInfo.name || '';
            if (resolvedName) {
                return resolvedName;
            }
            const withoutVariation = normalized
                .replace(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break|delta(?:\s+species)?|species\s+delta|specie\s+delta)\b/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (withoutVariation && withoutVariation !== normalized) {
                const fallbackTitleInfo = window.extractTitleInfo(withoutVariation) || {};
                const fallbackName = fallbackTitleInfo.pokemonName || fallbackTitleInfo.name || '';
                if (fallbackName) {
                    return fallbackName;
                }
            }
            return this.normalizeTargetedVintedNameAliasFromPhrase(value) || '';
        } catch (error) {
            console.warn('⚠️ [VINT] Unable to resolve clue Pokemon name:', error);
            return this.normalizeTargetedVintedNameAliasFromPhrase(value) || '';
        }
    }

    resolvedPokemonNameSuffixFromPhrase(value = '') {
        const label = this.removeVintedMarketplaceNoise(typeof value === 'object' ? value.label || value.value : value);
        const normalized = this.normalizeClueValue(label);
        const resolvedName = this.resolvedPokemonNameFromClue(normalized);
        const labelCompact = this.compactClueValue(normalized);
        const resolvedCompact = this.compactClueValue(resolvedName);
        if (!normalized || !resolvedName || labelCompact === resolvedCompact || normalized.split(/\s+/).length < 2) {
            return '';
        }
        return labelCompact.endsWith(resolvedCompact) ? resolvedName : '';
    }

    isVintedFullCardIdentityPhrase(value = '') {
        const label = this.removeVintedMarketplaceNoise(typeof value === 'object' ? value.label || value.value : value);
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

    knownVintedCompositeName(value = '') {
        const normalized = this.normalizeClueValue(value);
        const compositeNames = [
            'Rocket Zapdos',
            "Team Rocket's Mimikyu",
            'Dark Magneton',
            'Holon Transceiver',
            "Alto Mare's Latias",
            "Holon's Magneton",
            'Gengar Mimikyu',
            'Gengar Mimikyu GX',
            'Espeon & Deoxys',
            'Espeon & Deoxys ex',
        ];
        return compositeNames.find((name) =>
            this.compactClueValue(name) === this.compactClueValue(normalized)
        ) || '';
    }

    addOwnerTeamCompositeCandidates(candidates, title = '') {
        const source = this.normalizeClueValue(title)
            .replace(/[’`]/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
        const patterns = [
            /\b([A-Za-z][A-Za-z']*)\s+(?:del|della|di|de|of)\s+Team\s+Rocket\b/gi,
            /\bTeam\s+Rocket(?:'s)?\s+([A-Za-z][A-Za-z']*)\b/gi,
        ];

        patterns.forEach((pattern) => {
            for (const match of source.matchAll(pattern)) {
                const name = this.normalizeClueValue(match[1] || '');
                if (!name || this.vintedKeywordStopWords().has(name.toLowerCase())) {
                    continue;
                }
                this.addKeywordCandidate(candidates, `Team Rocket's ${name}`, 'title-composite');
            }
        });
    }

    addDeltaSpeciesCandidates(candidates, title = '') {
        const source = this.normalizeClueValue(title)
            .replace(/\bspecie\s+delta\b/gi, 'Delta Species')
            .replace(/\bspecies\s+delta\b/gi, 'Delta Species')
            .replace(/\s+/g, ' ')
            .trim();
        if (!/\bdelta(?:\s+species)?\b/i.test(source)) {
            return;
        }
        const beforeDelta = source.match(/\b([A-Za-z][A-Za-z']*)\s+(?:delta(?:\s+species)?|Delta\s+Species)\b/i)?.[1] || '';
        const afterDelta = source.match(/\b(?:delta(?:\s+species)?|Delta\s+Species)\s+([A-Za-z][A-Za-z']*)\b/i)?.[1] || '';
        const name = this.normalizeClueValue(beforeDelta || afterDelta);
        if (name && !this.vintedKeywordStopWords().has(name.toLowerCase())) {
            this.addKeywordCandidate(candidates, `${name} Delta Species`, 'title-composite');
        }
        this.addKeywordCandidate(candidates, 'Delta Species', 'title-pattern');
    }

    vintedTitleTokenSource(value = '') {
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
            if (!left || !right || this.vintedKeywordStopWords().has(left.toLowerCase()) || this.vintedKeywordStopWords().has(right.toLowerCase())) {
                continue;
            }
            this.addKeywordCandidate(candidates, [left, '&', right, variation].filter(Boolean).join(' '), 'title-composite');
            this.addKeywordCandidate(candidates, [left, right, variation].filter(Boolean).join(' '), 'title-composite');
        }
    }

    isManualVintedKeyword(keyword = {}) {
        return keyword?.source === 'manual-input';
    }

    createManualVintedKeyword(value = '') {
        const label = this.normalizeClueValue(value)
            .replace(/\bspecie\s+delta\b/gi, 'Delta Species')
            .replace(/\bspecies\s+delta\b/gi, 'Delta Species')
            .replace(/\b(?:liv|lv|level)\.?\s*(\d{1,4}[a-z]?)\b/gi, 'Lv. $1')
            .replace(/\btesori\s+misteriosi\b/gi, 'Mysterious Treasures')
            .replace(/\s+/g, ' ')
            .trim();
        const compact = this.compactClueValue(label);
        if (!label || compact.length < 2) {
            return null;
        }

        const manualKeyword = {
            label,
            value: label,
            compact,
            source: 'manual-input',
            selectedByDefault: true,
            manual: true,
        };
        const nameLike = this.isPokemonNameLikeClue(manualKeyword);
        const variation = this.isVariationClue(label);
        const collectorNumber = this.isCollectorNumberClue(label);
        const levelNumber = this.isLevelNumberClue(label);
        const expansion = this.isExpansionClue(label);
        const illustration = this.isIllustrationClue(label) || this.isRarityFeatureClue(label);
        return {
            ...manualKeyword,
            nameLike,
            variation,
            collectorNumber,
            levelNumber,
            expansion,
            illustration,
            attachedNamePhrase: this.isAttachedNamePhraseClue(manualKeyword),
            attachedVariation: false,
            category: this.vintedKeywordCategory({
                ...manualKeyword,
                nameLike,
                variation,
                collectorNumber,
                levelNumber,
                expansion,
                illustration,
                attachedNamePhrase: this.isAttachedNamePhraseClue(manualKeyword),
            }),
        };
    }

    addManualVintedKeyword(value = '') {
        const keyword = this.createManualVintedKeyword(value);
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

    triggerVintedSelectionRefresh(trigger = 'keyword-toggle') {
        this.invalidateVintedPreviewForSelectionChange();
        this.sendVintedTokensReady(trigger, {
            skipListingScan: trigger === 'keyword-toggle',
            forceListingScan: trigger === 'manual-clue',
        });
        return this.runVintedSearch(this.extractTitleInfo(this.buildVintedSearchTitle(this.currentTitle)), this.currentTitle, trigger);
    }

    hasAttachedVariationForName(name = '', sourceText = '') {
        const nameCompact = this.compactClueValue(name);
        const normalizedSource = this.normalizeClueValue(sourceText);
        if (!nameCompact || !normalizedSource) {
            return false;
        }

        const namePattern = this.normalizeClueValue(name)
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\s+/g, '\\s*');
        const aliasPatterns = Object.entries(this.targetedVintedNameAliases())
            .filter(([, canonicalName]) => this.compactClueValue(canonicalName) === nameCompact)
            .map(([alias]) => alias.split('').join('\\s*'));
        const variationPattern = '(?:vmax|vstar|ex|gx|v|lv\\.?\\s*x|mega|radiant|shining|prime|break|delta(?:\\s+species)?|species\\s+delta|specie\\s+delta)';
        return [namePattern, ...aliasPatterns]
            .filter(Boolean)
            .some((pattern) => new RegExp(`\\b${pattern}\\s*${variationPattern}\\b`, 'i').test(normalizedSource));
    }

    isAttachedNamePhraseClue(value = '') {
        const label = this.removeVintedMarketplaceNoise(typeof value === 'object' ? value.label || value.value : value);
        if (!this.isVariationClue(label)) {
            return false;
        }

        const resolvedName = this.resolvedPokemonNameFromClue(label);
        if (!resolvedName) {
            return false;
        }

        const labelCompact = this.compactClueValue(label);
        const nameCompact = this.compactClueValue(resolvedName);
        const aliasCompacts = Object.entries(this.targetedVintedNameAliases())
            .filter(([, canonicalName]) => this.compactClueValue(canonicalName) === nameCompact)
            .map(([alias]) => alias);
        return Boolean(
            labelCompact &&
            nameCompact &&
            labelCompact !== nameCompact &&
            [nameCompact, ...aliasCompacts].some((compact) =>
                this.vintedVariationCompacts().some((variation) =>
                    labelCompact.endsWith(`${compact}${variation}`) ||
                    labelCompact.startsWith(`${variation}${compact}`)
                )
            )
        );
    }

    attachedVariationCompactsForNamePhrase(keyword = {}) {
        const label = keyword.label || keyword.value || '';
        const resolvedName = this.resolvedPokemonNameFromClue(label);
        const labelCompact = this.compactClueValue(label);
        const nameCompact = this.compactClueValue(resolvedName);
        if (!labelCompact || !nameCompact) {
            return [];
        }
        return this.vintedVariationCompacts().filter((variation) =>
            labelCompact.endsWith(`${nameCompact}${variation}`) ||
            labelCompact.startsWith(`${variation}${nameCompact}`)
        );
    }

    isPureAttachedVariationPhrase(keyword = {}) {
        const resolvedName = this.resolvedPokemonNameFromClue(keyword.label || keyword.value || '');
        const nameCompact = this.compactClueValue(resolvedName);
        const variationCompacts = this.attachedVariationCompactsForNamePhrase(keyword);
        const labelCompact = this.compactClueValue(keyword.label || keyword.value || '');
        return Boolean(
            nameCompact &&
            labelCompact &&
            variationCompacts.length > 0 &&
            labelCompact.length === nameCompact.length + variationCompacts.join('').length
        );
    }

    isAttachedVariationClue(value = '', sourceText = '') {
        if (!this.isVariationClue(value)) {
            return false;
        }

        const labelCompact = this.compactClueValue(value);
        if (!this.vintedVariationCompacts().includes(labelCompact)) {
            return false;
        }

        const sourceCompact = this.compactClueValue(sourceText);
        if (!sourceCompact) {
            return false;
        }

        return this.currentKeywords
            .filter((keyword) => keyword.attachedNamePhrase)
            .some((keyword) => this.compactClueValue(keyword.value).endsWith(labelCompact));
    }

    isIllustrationClue(value = '') {
        return /\b(?:illustration|full\s*-?\s*art|fullart)\b/i.test(this.normalizeClueValue(value));
    }

    isBaseSetClue(value = '') {
        return /\b(?:base\s+set|set\s+base)\b/i.test(this.normalizeClueValue(value));
    }

    isCollectorNumberClue(value = '') {
        const label = this.normalizeCollectorText(value);
        if (/^(?:PSA|BGS|CGC|SGC)\s+\d{1,2}$/i.test(label)) {
            return false;
        }
        return /^\d{1,4}[a-z]?$/i.test(label) ||
            /\bPROMO\s+\d{1,4}[a-z]?\b/i.test(label) ||
            /\b[A-Z0-9]{2,6}\s+[A-Za-z0-9]*\d[A-Za-z0-9]*\s+\d{1,4}[a-z]?\b/.test(label) ||
            /\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/.test(label) ||
            /\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/i.test(label) ||
            /\b(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\s*\/\s*(?:(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?)?\d{1,4}[a-z]?\b/i.test(label) ||
            /\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/.test(label) ||
            /\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i.test(label);
    }

    isLevelNumberClue(value = '') {
        return /\b(?:liv|lv|level)\.?\s*(\d{1,4}[a-z]?)\b/i.test(this.normalizeCollectorText(value));
    }

    normalizeVintedLevelNumber(value = '') {
        return this.normalizeCollectorText(value).match(/\b(?:liv|lv|level)\.?\s*(\d{1,4}[a-z]?)\b/i)?.[1] || '';
    }

    vintedCollectorNumberPatterns() {
        return [
            /\bPROMO\s+\d{1,4}[a-z]?\b/gi,
            /\b(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\s*\/\s*(?:(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?)?\d{1,4}[a-z]?\b/gi,
            /\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/g,
            /\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/gi,
            /\b[A-Z0-9]{2,8}\s+[A-Za-z0-9]*\d[A-Za-z0-9]*\s+\d{1,4}[a-z]?\b/g,
            /\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/g,
            /\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/gi,
        ];
    }

    hasVintedBareCollectorContext(text = '') {
        const normalized = this.normalizeClueValue(text);
        if (/\b(?:pok[eé]mon|pokemon|carta|carte|card|cards|tcg|collector|numero|number)\b/i.test(normalized)) {
            return true;
        }
        const withoutNumbers = normalized.replace(/\b\d{1,4}[a-z]?\b/gi, ' ');
        const withoutFeatureContext = withoutNumbers
            .replace(/\b(?:delta(?:\s+species)?|species\s+delta|specie\s+delta|illustration|holo|rare)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return this.isPokemonNameLikeClue(withoutNumbers) ||
            Boolean(this.knownVintedCompositeName(withoutNumbers)) ||
            Boolean(this.knownVintedCompositeName(withoutFeatureContext));
    }

    isLikelyVintedBareCollectorNumber(value = '') {
        const number = this.normalizeClueValue(value);
        if (!/^\d{1,4}[a-z]?$/i.test(number)) {
            return false;
        }
        const numericValue = Number(number.replace(/[a-z]+$/i, ''));
        return !(numericValue >= 1900 && numericValue <= 2099);
    }

    collectVintedCollectorClues(text = '', options = {}) {
        const matches = [];
        const protectedBareNumberSpans = [];
        this.vintedCollectorNumberPatterns().forEach((pattern) => {
            for (const match of String(text || '').matchAll(pattern)) {
                matches.push(match[0].replace(/\s+/g, ' ').trim());
                const rawMatch = match[0] || '';
                const numberMatch = [...rawMatch.matchAll(/\b\d{1,4}[a-z]?\b/gi)].at(-1);
                if (numberMatch) {
                    const start = match.index + numberMatch.index;
                    protectedBareNumberSpans.push([start, start + numberMatch[0].length]);
                }
            }
        });
        if (options.includeBareNumbers && this.hasVintedBareCollectorContext(options.contextText || text)) {
            for (const match of String(text || '').matchAll(/\b\d{1,4}[a-z]?\b/gi)) {
                const start = match.index;
                const end = start + match[0].length;
                const before = String(text || '').slice(Math.max(0, start - 12), start);
                if (/\b(?:psa|bgs|cgc|sgc)\s*$/i.test(before)) {
                    continue;
                }
                const protectedSpan = protectedBareNumberSpans.find(([spanStart, spanEnd]) => start >= spanStart && end <= spanEnd);
                if (protectedSpan && !String(text || '').slice(protectedSpan[0], protectedSpan[1]).includes('/')) {
                    continue;
                }
                const label = match[0].trim();
                if (this.isLikelyVintedBareCollectorNumber(label)) {
                    matches.push(label);
                }
            }
        }
        const seen = new Set();
        const uniqueMatches = matches.filter((label) => {
            const compact = this.compactClueValue(label);
            const prefix = String(label || '').trim().split(/\s+/)[0] || '';
            if (!compact || seen.has(compact) || this.isVariationClue(prefix) || /^(?:PSA|BGS|CGC|SGC)\s+\d{1,2}$/i.test(label)) {
                return false;
            }
            seen.add(compact);
            return true;
        });
        return uniqueMatches
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

    parseVintedSlashCollectorClue(value = '') {
        const match = String(value || '').trim().match(/^(\d{1,4}[a-z]?)\/(\d{1,4}[a-z]?)$/i);
        if (!match) {
            return null;
        }
        return {
            left: match[1].toLowerCase(),
            right: match[2].toLowerCase(),
            label: `${match[1]}/${match[2]}`,
        };
    }

    /**
     * Seller title typos like 231/1818 must not beat description 231/191.
     * Title collectors are auto-selected; description ones were not — so the
     * typo became the structured collector and fought identify (Drasna 231/191).
     */
    reconcileVintedCollectorClues(collectorClues = []) {
        const list = Array.isArray(collectorClues) ? collectorClues : [];
        const descriptionSlashByLeft = new Map();
        list.forEach((entry) => {
            if (!entry || entry.source === 'title-pattern' || /^title/.test(String(entry.source || ''))) {
                return;
            }
            const parsed = this.parseVintedSlashCollectorClue(entry.label);
            if (!parsed) {
                return;
            }
            if (!descriptionSlashByLeft.has(parsed.left)) {
                descriptionSlashByLeft.set(parsed.left, { ...entry, parsed });
            }
        });
        if (descriptionSlashByLeft.size === 0) {
            return list;
        }

        const droppedTitleCompacts = new Set();
        const kept = list.filter((entry) => {
            const parsed = this.parseVintedSlashCollectorClue(entry?.label);
            if (!parsed) {
                return true;
            }
            const descriptionHit = descriptionSlashByLeft.get(parsed.left);
            if (!descriptionHit || descriptionHit.parsed.right === parsed.right) {
                return true;
            }
            if (entry.source === 'title-pattern' || /^title/.test(String(entry.source || ''))) {
                droppedTitleCompacts.add(this.compactClueValue(entry.label));
                return false;
            }
            return true;
        });

        if (droppedTitleCompacts.size === 0) {
            return kept;
        }

        return kept.map((entry) => {
            const parsed = this.parseVintedSlashCollectorClue(entry?.label);
            if (!parsed || entry.source === 'title-pattern' || /^title/.test(String(entry.source || ''))) {
                return entry;
            }
            const descriptionHit = descriptionSlashByLeft.get(parsed.left);
            if (!descriptionHit || descriptionHit.parsed.right !== parsed.right) {
                return entry;
            }
            return { ...entry, source: 'title-pattern' };
        });
    }

    vintedExpansionAliases() {
        return [
            { pattern: /\bevoluzioni\b/i, label: 'Evolutions' },
            { pattern: /\borigine\s+perduta\b/i, label: 'Lost Origin' },
            { pattern: /\bneo\s+discovery\b/i, label: 'Neo Discovery' },
            { pattern: /\btesori\s+misteriosi\b/i, label: 'Mysterious Treasures' },
            { pattern: /\bdiamante\s+e?\s*perla\b/i, label: 'Diamond & Pearl' },
            { pattern: /\bdiamond\s*(?:and|&)\s*pearl\b/i, label: 'Diamond & Pearl' },
        ];
    }

    isExpansionClue(value = '') {
        return this.isBaseSetClue(value) ||
            /\b(?:team\s+rocket|evolutions|evoluzioni|lost\s+origin|origine\s+perduta|neo\s+discovery|mysterious\s+treasures|tesori\s+misteriosi|diamond\s*(?:and|&)\s*pearl|diamante\s+e?\s*perla|black\s+star\s+promos?|pokemon\s+151|evolving\s+skies|fusion\s+strike|paldean\s+fates|scarlet\s+violet|obsidian\s+flames|crown\s+zenith|chilling\s+reign|silver\s+tempest|brilliant\s+stars|astral\s+radiance)\b/i.test(this.normalizeClueValue(value));
    }

    sourceContainsClue(value = '', sourceText = '') {
        const compactClue = this.compactClueValue(value);
        const compactSource = this.compactClueValue(sourceText);
        if (compactClue && compactSource.includes(compactClue)) {
            return true;
        }
        return this.vintedExpansionAliases().some(({ pattern, label }) =>
            this.compactClueValue(label) === compactClue && pattern.test(sourceText)
        );
    }

    vintedKeywordCategory(keyword = {}) {
        if (keyword.nameLike || keyword.attachedNamePhrase) return 'name';
        if (keyword.collectorNumber) return 'collector';
        if (keyword.levelNumber) return 'level';
        if (keyword.expansion) return 'expansion';
        if (keyword.variation || keyword.attachedVariation) return 'variation';
        if (keyword.illustration) return 'feature';
        return 'context';
    }

    isGenericTextPhraseChip(keyword = {}) {
        if ((keyword.source || '') !== 'text') {
            return false;
        }
        const label = String(keyword.label || keyword.value || '').trim();
        const wordCount = label.split(/\s+/).filter(Boolean).length;
        if (wordCount <= 1) {
            return false;
        }
        if (keyword.illustration && !/^(?:special illustration rare|illustration rare|secret rare|ultra rare|holo rare|reverse holo|full art)$/i.test(label)) {
            return true;
        }
        return !(
            keyword.nameLike ||
            keyword.compositeName ||
            keyword.fullCardIdentityName ||
            keyword.attachedNamePhrase ||
            keyword.expansion ||
            keyword.variation ||
            keyword.collectorNumber ||
            keyword.levelNumber ||
            keyword.illustration
        );
    }

    keepTitleNameChipsUnlessAlbum(keywords = [], title = '', description = '') {
        const listingKind = typeof classifyMarketplaceListingKindFromText === 'function'
            ? classifyMarketplaceListingKindFromText(title, description).kind
            : 'unknown';
        if (listingKind === 'album') {
            return keywords;
        }

        // Chip labels are often normalized (typo aliases, Italian "e" -> &,
        // specie delta -> Delta Species, Mimikyu del Team Rocket -> Team Rocket's Mimikyu).
        // Build comparable title compacts from those same normalizations so identity
        // chips are not dropped by a raw-title includes() check.
        const titleSource = this.vintedTitleTokenSource(title);
        const aliasedTitle = this.normalizeTargetedVintedNameAliasPhrase(titleSource) || titleSource;
        const connectorNormalized = this.normalizeClueValue(titleSource)
            .replace(/\s+(?:e|and|&|\+|\/)\s+/gi, ' & ');
        const deltaNormalized = this.normalizeClueValue(connectorNormalized)
            .replace(/\bspecie\s+delta\b/gi, 'Delta Species')
            .replace(/\bspecies\s+delta\b/gi, 'Delta Species');
        const rocketNormalized = this.normalizeClueValue(deltaNormalized)
            .replace(/\b([A-Za-z][A-Za-z']*)\s+(?:del|della|di|de|of)\s+Team\s+Rocket\b/gi, "Team Rocket's $1")
            .replace(/\bTeam\s+Rocket(?:'s)?\s+([A-Za-z][A-Za-z']*)\b/gi, "Team Rocket's $1");
        const titleCompacts = [...new Set([
            this.compactClueValue(aliasedTitle),
            this.compactClueValue(titleSource),
            this.compactClueValue(connectorNormalized),
            this.compactClueValue(deltaNormalized),
            this.compactClueValue(rocketNormalized),
        ].filter(Boolean))];

        const titleHasNameChip = keywords.some((keyword) => {
            if (!keyword.nameLike && !keyword.compositeName && !keyword.fullCardIdentityName && !keyword.attachedNamePhrase) {
                return false;
            }
            return Boolean(keyword.compact && titleCompacts.some((titleCompact) => titleCompact.includes(keyword.compact)));
        });

        return keywords.filter((keyword) => {
            if (!keyword.nameLike && !keyword.compositeName && !keyword.fullCardIdentityName && !keyword.attachedNamePhrase) {
                return true;
            }
            // Strong identity chips may appear only in the description on singles.
            if (keyword.compositeName || keyword.fullCardIdentityName) {
                return true;
            }
            if (
                keyword.attachedNamePhrase &&
                /['’]s\b|\bteam\s*rockets?\b/i.test(String(keyword.label || keyword.value || ''))
            ) {
                return true;
            }
            if (keyword.compact && titleCompacts.some((titleCompact) => titleCompact.includes(keyword.compact))) {
                return true;
            }
            // Noisy marketplace titles ("Carta Pokemon") with no title identity: keep
            // validated description name chips so search still has a Pokemon clue.
            if (!titleHasNameChip && (keyword.nameLike || keyword.attachedNamePhrase)) {
                return true;
            }
            return false;
        });
    }

    limitVintedKeywords(keywords = [], limit = 10) {
        const limited = keywords.slice(0, limit);
        keywords
            .filter((keyword) => keyword.illustration || keyword.levelNumber)
            .forEach((keyword) => {
                if (limited.some((candidate) => candidate.compact === keyword.compact)) {
                    return;
                }
                const replaceIndex = [...limited]
                    .map((candidate, index) => ({ candidate, index }))
                    .reverse()
                    .find(({ candidate }) => !candidate.selectedByDefault && candidate.category === 'context')?.index ??
                    [...limited]
                        .map((candidate, index) => ({ candidate, index }))
                        .reverse()
                        .find(({ candidate }) => candidate.category === 'context')?.index ??
                    limited.length - 1;
                if (replaceIndex >= 0) {
                    limited[replaceIndex] = keyword;
                }
            });
        return limited;
    }

    prepareVintedKeywordCandidates(candidates = [], sourceText = '', title = '', description = '') {
        const prepared = candidates
            .map((candidate, index) => {
                const aliasPhraseLabel = this.normalizeTargetedVintedNameAliasPhrase(candidate.label || candidate.value);
                const normalizedCandidate = aliasPhraseLabel
                    ? { ...candidate, label: aliasPhraseLabel, value: aliasPhraseLabel, compact: this.compactClueValue(aliasPhraseLabel) }
                    : candidate;
                const knownCompositeName = this.knownVintedCompositeName(normalizedCandidate.label || normalizedCandidate.value);
                const compositeName = Boolean(knownCompositeName);
                const compositeNormalizedCandidate = knownCompositeName
                    ? { ...normalizedCandidate, label: knownCompositeName, value: knownCompositeName, compact: this.compactClueValue(knownCompositeName) }
                    : normalizedCandidate;
                const fullCardIdentityName = !compositeName && this.isVintedFullCardIdentityPhrase(compositeNormalizedCandidate);
                const variation = this.isVariationClue(compositeNormalizedCandidate.label || compositeNormalizedCandidate.value) ||
                    this.isMegaFormClue(compositeNormalizedCandidate, sourceText);
                const baseSet = this.isBaseSetClue(compositeNormalizedCandidate.label || compositeNormalizedCandidate.value);
                const collectorNumber = this.isCollectorNumberClue(compositeNormalizedCandidate.label || compositeNormalizedCandidate.value);
                const levelNumber = this.isLevelNumberClue(compositeNormalizedCandidate.label || compositeNormalizedCandidate.value);
                const expansion = this.isExpansionClue(compositeNormalizedCandidate.label || compositeNormalizedCandidate.value);
                const illustration = this.isIllustrationClue(compositeNormalizedCandidate.label || compositeNormalizedCandidate.value) ||
                    this.isRarityFeatureClue(compositeNormalizedCandidate.label || compositeNormalizedCandidate.value);
                const attachedNamePhrase = this.isAttachedNamePhraseClue(compositeNormalizedCandidate);
                // Attached name+variation phrases (Tornadus ex) are name identity chips.
                // Keep nameLike true so side-panel selection filters that key on nameLike
                // still pick the composite phrase instead of only the bare species token.
                const nameLike = compositeName || fullCardIdentityName || attachedNamePhrase ||
                    this.isPokemonNameLikeClue(compositeNormalizedCandidate);
                const selectedNameLike = nameLike &&
                    (compositeName || !this.hasAttachedVariationForName(compositeNormalizedCandidate.label || compositeNormalizedCandidate.value, sourceText));
                const selectedHighConfidenceContext =
                    (collectorNumber || levelNumber || expansion) &&
                    /^(?:title|title-pattern|title-expansion|expansion)$/.test(candidate.source || '') &&
                    (
                        this.sourceContainsClue(candidate.label || candidate.value, sourceText) ||
                        (levelNumber && sourceText.includes(this.normalizeVintedLevelNumber(candidate.label || candidate.value)))
                    );
                const selectedIllustrationContext = illustration &&
                    (candidate.source === 'title-illustration' || /\bpromo\b/i.test(sourceText));
                return {
                    ...compositeNormalizedCandidate,
                    nameLike,
                    compositeName,
                    fullCardIdentityName,
                    variation,
                    baseSet,
                    collectorNumber,
                    levelNumber,
                    expansion,
                    illustration,
                    attachedNamePhrase,
                    attachedVariation: false,
                    selectedByDefault: attachedNamePhrase || selectedNameLike || selectedHighConfidenceContext || selectedIllustrationContext,
                    _index: index,
                };
            });

        const selectedAttachedVariations = new Set(
            prepared
                .filter((keyword) => keyword.attachedNamePhrase)
                .flatMap((keyword) => this.attachedVariationCompactsForNamePhrase(keyword))
        );

        const selectedCompositeNames = prepared
            .filter((keyword) => (keyword.compositeName || keyword.fullCardIdentityName) && keyword.selectedByDefault)
            .map((keyword) => keyword.compact);
        const selectedCompositeNamesWithVariation = prepared
            .filter((keyword) => (keyword.compositeName || keyword.fullCardIdentityName) && keyword.selectedByDefault && this.isVariationClue(keyword.label || keyword.value))
            .map((keyword) => keyword.compact);
        const selectedAttachedNamePhrases = prepared
            .filter((keyword) => keyword.attachedNamePhrase && keyword.selectedByDefault && this.isPureAttachedVariationPhrase(keyword))
            .map((keyword) => keyword.compact);
        const hasSelectedTitleCollector = prepared.some((keyword) =>
            keyword.collectorNumber &&
            keyword.selectedByDefault &&
            /^(?:title|title-pattern|title-expansion)$/.test(keyword.source || '')
        );

        const sorted = prepared
            .map((keyword) => {
                const attachedVariation = keyword.variation && selectedAttachedVariations.has(keyword.compact);
                const selectedExplicitTitleVariation = Boolean(
                    keyword.variation &&
                    this.vintedVariationCompacts().includes(keyword.compact) &&
                    keyword.source === 'title-pattern' &&
                    (hasSelectedTitleCollector || this.isMegaFormClue(keyword, sourceText))
                );
                const selectedValidatedNameWithTitleCollector = Boolean(
                    keyword.nameLike &&
                    !this.hasAttachedVariationForName(keyword.label || keyword.value, sourceText) &&
                    hasSelectedTitleCollector
                );
                const shadowedByComposite = Boolean(
                    (keyword.nameLike || keyword.compositeName || keyword.fullCardIdentityName) &&
                    !keyword.compositeName &&
                    !keyword.fullCardIdentityName &&
                    selectedCompositeNames.some((compositeCompact) =>
                        compositeCompact !== keyword.compact && compositeCompact.includes(keyword.compact)
                    )
                ) || Boolean(
                    (keyword.compositeName || keyword.fullCardIdentityName) &&
                    !this.isVariationClue(keyword.label || keyword.value) &&
                    selectedCompositeNamesWithVariation.some((compositeCompact) =>
                        compositeCompact !== keyword.compact && compositeCompact.includes(keyword.compact)
                    )
                );
                const shadowedByAttachedNamePhrase = Boolean(
                    keyword.attachedNamePhrase &&
                    this.isPureAttachedVariationPhrase(keyword) &&
                    selectedAttachedNamePhrases.some((attachedCompact) =>
                        attachedCompact !== keyword.compact && attachedCompact.includes(keyword.compact)
                    )
                );
                const enrichedKeyword = {
                    ...keyword,
                    attachedVariation: attachedVariation || selectedExplicitTitleVariation,
                    shadowedByComposite: shadowedByComposite || shadowedByAttachedNamePhrase,
                    selectedByDefault: (
                        keyword.selectedByDefault ||
                        attachedVariation ||
                        selectedExplicitTitleVariation ||
                        selectedValidatedNameWithTitleCollector
                    ) && !shadowedByComposite && !shadowedByAttachedNamePhrase,
                };
                return {
                    ...enrichedKeyword,
                    category: this.vintedKeywordCategory(enrichedKeyword),
                };
            })
            .sort((left, right) => {
                const leftFullIdentity = left.compositeName || left.fullCardIdentityName;
                const rightFullIdentity = right.compositeName || right.fullCardIdentityName;
                if (leftFullIdentity !== rightFullIdentity) {
                    return leftFullIdentity ? -1 : 1;
                }
                if (left.attachedNamePhrase !== right.attachedNamePhrase) {
                    return left.attachedNamePhrase ? -1 : 1;
                }
                if (left.attachedVariation !== right.attachedVariation) {
                    return left.attachedVariation ? -1 : 1;
                }
                if (left.nameLike !== right.nameLike) {
                    return left.nameLike ? -1 : 1;
                }
                if (left.selectedByDefault !== right.selectedByDefault) {
                    return left.selectedByDefault ? -1 : 1;
                }
                if (left.expansion !== right.expansion) {
                    return left.expansion ? -1 : 1;
                }
                if (left.collectorNumber !== right.collectorNumber) {
                    return left.collectorNumber ? -1 : 1;
                }
                if (left.levelNumber !== right.levelNumber) {
                    return left.levelNumber ? -1 : 1;
                }
                if (left.illustration !== right.illustration) {
                    return left.illustration ? -1 : 1;
                }
                return left._index - right._index;
            })
            .filter((keyword) => !this.isGenericTextPhraseChip(keyword));
        const titleScoped = this.keepTitleNameChipsUnlessAlbum(sorted, title, description);
        return this.limitVintedKeywords(titleScoped, 12)
            .map(({ _index, ...keyword }) => {
                const preferredChip = Boolean(keyword.selectedByDefault);
                return {
                    ...keyword,
                    preferredChip,
                    // Listing chips stay visible but unpressed. Typed Add clue stays selected.
                    selectedByDefault: Boolean(keyword.manual || keyword.source === 'manual-input'),
                };
            });
    }

    extractVintedDescription() {
        if (typeof document?.querySelector !== 'function') {
            return '';
        }
        const selectors = [
            '[data-testid="item-description"]',
            '[data-testid="item-description"] p',
            '[itemprop="description"]',
            '[data-testid="item-page-description"]',
            '[data-testid="item-details-description"]',
            '[data-testid="item-details"] [class*="description"]',
            '[class*="item-description"]',
            'meta[property="og:description"]',
            'meta[name="description"]',
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            const text = element?.getAttribute?.('content') || element?.textContent || '';
            const cleaned = text.replace(/\s+/g, ' ').trim();
            if (cleaned && cleaned.length >= 8 && !/^vinted\b/i.test(cleaned)) {
                return cleaned;
            }
        }

        return '';
    }

    extractVintedListingImageUrls() {
        if (!this.isVintedItemListingPage()) {
            return [];
        }
        if (typeof extractListingImageUrlsFromDocument === 'function') {
            return extractListingImageUrlsFromDocument(document, {
                source: 'vinted',
                pageUrl: window.location.href,
            });
        }
        return [];
    }

    classifyVintedListingKind(title = '', description = '', photoCount = 0) {
        if (typeof classifyMarketplaceListingKind === 'function') {
            return classifyMarketplaceListingKind({ title, description, photoCount });
        }
        return { kind: 'unknown', reason: 'listing-scan-unavailable', photoCount };
    }

    extractVintedKeywords(title = '', description = '') {
        const tokenizedTitle = this.vintedTitleTokenSource(title);
        const tokenizedDescription = this.vintedTitleTokenSource(description);
        const sourceText = `${tokenizedTitle} ${tokenizedDescription}`.replace(/\s+/g, ' ').trim();
        if (!sourceText) {
            return [];
        }

        const candidates = [];
        this.addCompositeConnectorCandidates(candidates, tokenizedTitle);
        this.addOwnerTeamCompositeCandidates(candidates, tokenizedTitle);
        this.addDeltaSpeciesCandidates(candidates, tokenizedTitle);
        const expansionHints = [
            'Base Set', 'Base Set 2', 'Base Set Shadowless', 'Jungle', 'Fossil', 'Team Rocket',
            'Evolutions',
            'Legendary Treasures', 'Mysterious Treasures', 'Diamond & Pearl', 'Black Star Promos', 'Evolving Skies', 'Fusion Strike',
            'Paldean Fates', 'Pokemon 151', 'Scarlet Violet', 'Obsidian Flames', 'Crown Zenith',
            'Chilling Reign', 'Silver Tempest', 'Brilliant Stars', 'Astral Radiance',
        ];
        expansionHints.forEach((hint) => {
            const pattern = new RegExp(`\\b${hint.replace(/\s+/g, '\\s+')}\\b`, 'i');
            if (pattern.test(title)) {
                this.addKeywordCandidate(candidates, hint, 'title-expansion');
            } else if (pattern.test(description)) {
                this.addKeywordCandidate(candidates, hint, 'expansion');
            }
        });
        if (/\bset\s+base\b/i.test(sourceText)) {
            this.addKeywordCandidate(candidates, 'Base Set', /\bset\s+base\b/i.test(title) ? 'title-expansion' : 'expansion');
        }
        this.vintedExpansionAliases().forEach(({ pattern, label }) => {
            if (pattern.test(sourceText)) {
                this.addKeywordCandidate(candidates, label, pattern.test(title) ? 'title-expansion' : 'expansion');
            }
        });
        const titleHasIllustrationHint = /\b(?:full\s*-?\s*art|fullart|illustration)\b/i.test(title);
        this.addKeywordCandidate(candidates, 'illustration', titleHasIllustrationHint ? 'title-illustration' : 'manual-illustration');

        const collectorContextText = sourceText;
        const collectorClues = this.reconcileVintedCollectorClues([
            ...this.collectVintedCollectorClues(tokenizedTitle, {
                includeBareNumbers: true,
                contextText: collectorContextText,
            }).map((label) => ({ label, source: 'title-pattern' })),
            ...this.collectVintedCollectorClues(tokenizedDescription, {
                includeBareNumbers: true,
                contextText: collectorContextText,
            }).map((label) => ({ label, source: 'pattern' })),
        ]);
        collectorClues.forEach(({ label, source }) => this.addKeywordCandidate(candidates, label, source));
        const reconciledSlashByLeft = new Map();
        collectorClues.forEach(({ label }) => {
            const parsed = this.parseVintedSlashCollectorClue(label);
            if (parsed) {
                reconciledSlashByLeft.set(parsed.left, parsed);
            }
        });
        const phraseConflictsReconciledCollector = (phrase = '') => {
            for (const match of String(phrase || '').matchAll(/\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/gi)) {
                const parsed = this.parseVintedSlashCollectorClue(match[0].replace(/\s*\/\s*/g, '/'));
                if (!parsed) {
                    continue;
                }
                const kept = reconciledSlashByLeft.get(parsed.left);
                if (kept && kept.right !== parsed.right) {
                    return true;
                }
            }
            return false;
        };

        for (const match of tokenizedTitle.matchAll(/\b(?:liv|lv|level)\.?\s*(\d{1,4}[a-z]?)\b/gi)) {
            this.addKeywordCandidate(candidates, `Lv. ${match[1]}`, 'title-pattern');
        }
        for (const match of tokenizedDescription.matchAll(/\b(?:liv|lv|level)\.?\s*(\d{1,4}[a-z]?)\b/gi)) {
            this.addKeywordCandidate(candidates, `Lv. ${match[1]}`, 'pattern');
        }

        const cluePatterns = [
            /\b(?:special illustration rare|illustration rare|secret rare|ultra rare|holo rare|reverse holo|holo|promo|rare)\b/gi,
            /\b(?:vmax|vstar|vastro|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break|delta(?:\s+species)?|species\s+delta|specie\s+delta)\b/gi,
        ];
        cluePatterns.forEach((pattern) => {
            for (const match of tokenizedTitle.matchAll(pattern)) {
                this.addKeywordCandidate(candidates, match[0].replace(/\s+/g, ' '), 'title-pattern');
            }
            for (const match of tokenizedDescription.matchAll(pattern)) {
                this.addKeywordCandidate(candidates, match[0].replace(/\s+/g, ' '), 'pattern');
            }
        });
        if (/\bmega\b/i.test(tokenizedTitle)) {
            for (const match of tokenizedTitle.matchAll(/\b[XY]\b/gi)) {
                this.addKeywordCandidate(candidates, match[0].toUpperCase(), 'title-pattern');
            }
        }

        const normalized = sourceText
            .replace(/\bfull\s*-?\s*art\b|\bfullart\b/gi, ' ')
            .replace(/[’`]/g, "'")
            .replace(/[()".,:;!?\\[\]{}|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const words = normalized
            .split(/\s+/)
            .map((word) => this.normalizeClueValue(word))
            .filter((word) => word && !this.vintedKeywordStopWords().has(word.toLowerCase()));
        const collectorCompacts = collectorClues.map(({ label }) => this.compactClueValue(label)).filter(Boolean);
        const collectorTokenCompacts = collectorClues
            .flatMap(({ label }) => label.split(/\s+/).map((token) => this.compactClueValue(token)).filter(Boolean));
        const protectedEvidenceCompacts = [
            ...collectorTokenCompacts,
            ...candidates
                .filter((candidate) => this.isLevelNumberClue(candidate.label || candidate.value))
                .flatMap((candidate) => [
                    this.compactClueValue(candidate.label || candidate.value),
                    this.compactClueValue(this.normalizeVintedLevelNumber(candidate.label || candidate.value)),
                ])
                .filter(Boolean),
        ];
        const phraseOverlapsCollector = (phrase) => {
            const compactPhrase = this.compactClueValue(phrase);
            return collectorCompacts.some((collectorCompact) =>
                compactPhrase &&
                compactPhrase !== collectorCompact &&
                (collectorCompact.includes(compactPhrase) || compactPhrase.includes(collectorCompact))
            ) ||
                phrase.split(/\s+/)
                    .map((token) => this.compactClueValue(token))
                    .filter(Boolean)
                    .some((token) => protectedEvidenceCompacts.includes(token) && !collectorCompacts.includes(compactPhrase));
        };

        for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
            for (let index = 0; index <= words.length - size; index += 1) {
                const phrase = words.slice(index, index + size).join(' ');
                if (
                    phrase.length >= 3 &&
                    !/^\d+$/.test(phrase) &&
                    !phraseOverlapsCollector(phrase) &&
                    !phraseConflictsReconciledCollector(phrase)
                ) {
                    this.addKeywordCandidate(candidates, phrase, 'text');
                }
            }
        }

        return this.prepareVintedKeywordCandidates(candidates, sourceText, tokenizedTitle, tokenizedDescription);
    }

    selectedKeywordLabels() {
        return this.currentKeywords
            .filter((keyword) => this.selectedKeywordValues.has(keyword.compact))
            .map((keyword) => keyword.value);
    }

    selectedVintedKeywords() {
        return this.currentKeywords.filter((keyword) => this.selectedKeywordValues.has(keyword.compact));
    }

    selectedPrimaryClues(clues = this.selectedKeywordLabels()) {
        const selectedPrimaryKeywords = this.currentKeywords
            .filter((keyword) => this.selectedKeywordValues.has(keyword.compact))
            .filter((keyword) =>
                keyword.nameLike ||
                keyword.attachedNamePhrase ||
                keyword.attachedVariation ||
                (this.isManualVintedKeyword(keyword) && !keyword.collectorNumber && !keyword.expansion && !keyword.illustration)
            );
        const selectedCompacts = new Set(selectedPrimaryKeywords.map((keyword) => keyword.compact));
        const selectedFullIdentityCompacts = selectedPrimaryKeywords
            .filter((keyword) => keyword.compositeName || keyword.fullCardIdentityName)
            .map((keyword) => keyword.compact)
            .filter(Boolean);

        return clues
            .filter((clue) => selectedCompacts.has(this.compactClueValue(clue)))
            .filter((clue) => {
                const compact = this.compactClueValue(clue);
                if (!compact || this.isVariationClue(clue)) {
                    return true;
                }
                return !selectedFullIdentityCompacts.some((identityCompact) =>
                    identityCompact !== compact && identityCompact.includes(compact)
                );
            });
    }

    selectedVariationClues(clues = this.selectedKeywordLabels()) {
        return clues.filter((clue) => this.isVariationClue(clue));
    }

    selectedIllustrationClues(clues = this.selectedKeywordLabels()) {
        return clues.filter((clue) => this.isIllustrationClue(clue));
    }

    selectedBaseSetClues(clues = this.selectedKeywordLabels()) {
        return clues.filter((clue) => this.isBaseSetClue(clue));
    }

    selectedExpansionClues(clues = this.selectedKeywordLabels()) {
        return clues.filter((clue) => this.isExpansionClue(clue));
    }

    selectedCollectorNumberClues(clues = this.selectedKeywordLabels()) {
        return clues.filter((clue) => this.isCollectorNumberClue(clue));
    }

    normalizeVintedCollectorNumber(value = '') {
        const normalized = this.normalizeCollectorText(value)
            .replace(/\bpromo\s+(\d{1,4}[a-z]?)\b/gi, 'PROMO $1')
            .replace(/\s*\/\s*/g, '/')
            .replace(/\s+/g, ' ')
            .trim();
        return normalized.match(/\bPROMO\s+\d{1,4}[a-z]?\b/i)?.[0] ||
            normalized.match(/\b(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\s*\/\s*(?:(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?)?\d{1,4}[a-z]?\b/i)?.[0]?.replace(/\s*\/\s*/g, '/').replace(/\s+/g, '') ||
            normalized.match(/\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/)?.[0]?.replace(/\s*\/\s*/g, '/').replace(/\s+/g, '') ||
            normalized.match(/\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/i)?.[0]?.replace(/\s+/g, ' ') ||
            normalized.match(/\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/)?.[0] ||
            normalized.match(/\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i)?.[0]?.replace(/\s*\/\s*/g, '/') ||
            normalized;
    }

    numericVintedCollectorNumber(value = '') {
        return this.normalizeVintedCollectorNumber(value).match(/\b[A-Z]{1,6}\s?(\d{1,4}[a-z]?)(?:\/(?:[A-Z]{1,6}\s?)?\d{1,4}[a-z]?)?\b/i)?.[1] ||
            this.normalizeVintedCollectorNumber(value).match(/\b(\d{1,4}[a-z]?)(?:\/\d{1,4}[a-z]?)?\b/i)?.[1] ||
            '';
    }

    buildVintedPayload(title = this.currentTitle, clues = this.selectedKeywordLabels()) {
        const selectedClues = Array.from(clues);
        const primaryClues = this.selectedPrimaryClues(selectedClues);
        const selectedKeywords = this.selectedVintedKeywords();
        // Chips intentionally start unpressed, but title-derived identity is still
        // authoritative listing evidence. `preferredChip` preserves the extractor's
        // pre-unpress confidence without treating description-only names as selected.
        const preferredTitleKeywords = selectedClues.length === 0
            ? this.currentKeywords.filter((keyword) => keyword.preferredChip)
            : [];
        const passiveCollectorKeyword = preferredTitleKeywords.find((keyword) => keyword.collectorNumber);
        const passiveIdentityKeywords = passiveCollectorKeyword ? preferredTitleKeywords : [];
        const keywordFor = (category) => selectedKeywords.find((keyword) => keyword.category === category);
        const nameKeyword = selectedKeywords.find((keyword) => keyword.nameLike) ||
            selectedKeywords.find((keyword) => keyword.attachedNamePhrase) ||
            passiveIdentityKeywords.find((keyword) => keyword.nameLike) ||
            passiveIdentityKeywords.find((keyword) => keyword.attachedNamePhrase);
        const collectorKeyword = keywordFor('collector') ||
            passiveCollectorKeyword;
        const levelKeyword = keywordFor('level');
        const expansionKeyword = keywordFor('expansion') ||
            passiveIdentityKeywords.find((keyword) => keyword.expansion) ||
            (passiveCollectorKeyword
                ? this.currentKeywords.find((keyword) => keyword.source === 'title-expansion')
                : null);
        const featureKeywords = selectedKeywords.filter((keyword) => keyword.category === 'feature');
        const variationKeywords = selectedKeywords.filter((keyword) => keyword.category === 'variation');
        const levelNumber = levelKeyword ? this.normalizeVintedLevelNumber(levelKeyword.value) : '';
        const variationValues = [
            ...variationKeywords.map((keyword) => keyword.value),
            ...selectedKeywords
                .filter((keyword) => keyword.attachedNamePhrase)
                .flatMap((keyword) => this.variationClueValuesFromPhrase(keyword.value)),
        ].filter((value, index, all) => {
            const compact = this.compactClueValue(value);
            if (!compact) {
                return false;
            }
            if (compact === 'delta' || compact === 'speciedelta' || compact === 'speciesdelta') {
                return !all.some((candidate) => this.compactClueValue(candidate) === 'deltaspecies');
            }
            return all.findIndex((candidate) => this.compactClueValue(candidate) === compact) === index;
        });
        const name = nameKeyword
            ? (
                this.knownVintedCompositeName(nameKeyword.value) ||
                (nameKeyword.fullCardIdentityName ? nameKeyword.value : this.resolvedPokemonNameFromClue(nameKeyword.value)) ||
                nameKeyword.value
            )
            : (primaryClues.find((clue) => !this.isVariationClue(clue)) || primaryClues[0] || '');
        let collectorNumber = collectorKeyword ? this.normalizeVintedCollectorNumber(collectorKeyword.value) : '';
        if (
            collectorNumber &&
            levelNumber &&
            /^\d{1,4}[a-z]?$/i.test(collectorNumber) &&
            this.numericVintedCollectorNumber(collectorNumber) === levelNumber
        ) {
            collectorNumber = '';
        }
        const description = this.extractVintedDescription();
        const listingImageUrls = this.extractVintedListingImageUrls();
        const listingKindResult = this.classifyVintedListingKind(title, description, listingImageUrls.length);
        this.currentListingKind = listingKindResult.kind;
        return {
            source: 'vinted',
            listingKey: this.currentVintedListingKey(),
            originalTitle: title,
            searchTitle: this.buildVintedSearchTitle(title, selectedClues),
            primaryClues,
            selectedClues,
            selectedChipCategories: selectedKeywords.map((keyword) => ({
                label: keyword.label,
                value: keyword.value,
                category: keyword.category,
                selectedByDefault: Boolean(keyword.selectedByDefault),
            })),
            name,
            variation: variationValues.join(' '),
            collectorNumber,
            numericCollectorNumber: collectorNumber ? this.numericVintedCollectorNumber(collectorNumber) : '',
            expansion: expansionKeyword?.value || '',
            features: featureKeywords.map((keyword) => keyword.value),
            levelNumber,
            rarity: featureKeywords.some((keyword) => this.isIllustrationClue(keyword.value)) ? 'illustration' : '',
            listingKind: listingKindResult.kind,
            listingKindSignals: listingKindResult,
            listingDescription: String(description || '').slice(0, 2000),
            listingImageUrls,
            enableListingScan: this.isVintedItemListingPage(),
        };
    }

    currentVintedListingKey(url = window.location.href) {
        try {
            const parsed = new URL(url);
            parsed.hash = '';
            parsed.search = '';
            return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
        } catch (error) {
            return String(url || '').split('#')[0].split('?')[0].replace(/\/+$/, '');
        }
    }

    isVintedItemListingPage(url = window.location.href) {
        if (typeof isVintedItemListingUrl === 'function') {
            return isVintedItemListingUrl(url);
        }
        try {
            const parsed = new URL(url, window.location.href);
            return parsed.hostname.toLowerCase().includes('vinted')
                && /(?:^|\/)items\/\d+/i.test(parsed.pathname);
        } catch (error) {
            return /vinted\.[^/?#]+\/(?:[a-z]{2}\/)?items\/\d+/i.test(String(url || ''));
        }
    }

    isVintedCataloguePage(url = window.location.href) {
        try {
            const parsed = new URL(url);
            if (!parsed.hostname.toLowerCase().includes('vinted')) {
                return false;
            }
            return !this.isVintedItemListingPage(parsed.href);
        } catch (error) {
            return /vinted\./i.test(String(url || '')) && !this.isVintedItemListingPage(url);
        }
    }

    vintedCatalogueSearchText(url = window.location.href) {
        try {
            const parsed = new URL(url);
            if (!this.isVintedCataloguePage(parsed.href)) {
                return '';
            }
            return (parsed.searchParams.get('search_text') || '').replace(/\s+/g, ' ').trim();
        } catch (error) {
            return '';
        }
    }

    clearVintedOwnedUi(reason = 'quiet page') {
        if (this.vintedReinsertTimer && typeof clearTimeout === 'function') {
            clearTimeout(this.vintedReinsertTimer);
            this.vintedReinsertTimer = null;
        }
        if (this.currentPanelHost?.remove) {
            this.currentPanelHost.remove();
        } else {
            this.findExistingVintedPanelHost()?.remove?.();
        }

        this.currentPanel = null;
        this.currentPanelHost = null;
        this.currentButton = null;
        this.currentKeywords = [];
        this.selectedKeywordValues = new Set();
        this.currentMatchCount = 0;
        this.lastRenderedPreviewResults = [];
        this.pendingSearchApplications.clear();
        this.lastAppliedSearchSignature = '';
        this.latestSearchToken += 1;
        this.recordVintedDiagnostic('ui-clear', { reason });
    }

    handleVintedCataloguePage() {
        const pageKey = this.currentVintedListingKey();
        if (this.currentListingKey && this.currentListingKey !== pageKey) {
            this.resetVintedListingState(pageKey);
        } else {
            this.currentListingKey = pageKey;
            this.clearVintedOwnedUi('Vinted catalogue/search page');
        }

        this.notifyVintedIdlePage();

        const searchText = this.vintedCatalogueSearchText();
        const warmupSignature = `${pageKey}|${this.compactClueValue(searchText)}`;
        if (searchText && warmupSignature !== this.lastVintedCatalogueWarmupSignature) {
            this.lastVintedCatalogueWarmupSignature = warmupSignature;
            this.recordVintedDiagnostic('catalogue-warmup', {
                listingKey: pageKey,
                reason: 'search_text parsed from catalogue URL',
                title: searchText,
            });
        }
    }

    notifyVintedIdlePage() {
        if (typeof chrome.runtime?.sendMessage !== 'function') {
            return;
        }
        void Promise.resolve(chrome.runtime.sendMessage({
            action: 'vintedIdlePage',
            url: window.location.href,
        })).catch(() => null);
    }

    recordVintedDiagnostic(event, details = {}) {
        const entry = {
            sessionId: this.vintedSessionId,
            sequenceId: ++this.vintedSequenceId,
            event,
            listingKey: details.listingKey || this.currentVintedListingKey(),
            searchSignature: details.searchSignature || '',
            reason: details.reason || '',
            trigger: details.trigger || '',
            anchorMounted: Boolean(details.anchorMounted ?? this.findVintedDetailsContainer(this.currentTitleElement)),
            uiMounted: Boolean(details.uiMounted ?? this.isVintedOwnedNodeConnected(this.currentButton)),
            hasCachedResults: Boolean(details.hasCachedResults),
            inFlight: Boolean(details.inFlight),
            skippedDuplicateReason: details.skippedDuplicateReason || '',
            staleResponseIgnored: Boolean(details.staleResponseIgnored),
            title: String(details.title || this.currentTitle || '').slice(0, 160),
            selectedChipCategories: details.selectedChipCategories || this.selectedVintedKeywords().map((keyword) => `${keyword.category}:${keyword.value}`),
            payload: details.payload || null,
            resultRows: details.resultRows || [],
            timestamp: Date.now(),
        };
        this.vintedDiagnostics.push(entry);
        if (this.vintedDiagnostics.length > 80) {
            this.vintedDiagnostics.shift();
        }
        window.__pokoinVintedDiagnostics = this.vintedDiagnostics;
        if (chrome.runtime?.id && typeof chrome.runtime.sendMessage === 'function') {
            void Promise.resolve(chrome.runtime.sendMessage({
                action: 'recordExtensionDebugEvent',
                type: `vinted.${event}`,
                details: {
                    source: 'vinted',
                    sessionId: entry.sessionId,
                    sequenceId: entry.sequenceId,
                    url: window.location.href,
                    listingKey: entry.listingKey,
                    searchSignature: entry.searchSignature,
                    reason: entry.reason,
                    trigger: entry.trigger,
                    anchorMounted: entry.anchorMounted,
                    uiMounted: entry.uiMounted,
                    hasCachedResults: entry.hasCachedResults,
                    inFlight: entry.inFlight,
                    selectedChipCategories: entry.selectedChipCategories,
                    skippedDuplicateReason: entry.skippedDuplicateReason,
                    staleResponseIgnored: entry.staleResponseIgnored,
                    title: entry.title,
                    payload: entry.payload,
                    resultRows: entry.resultRows,
                },
            })).catch(() => null);
        }
        return entry;
    }

    buildVintedSearchSignature(title = this.currentTitle, clues = this.selectedKeywordLabels()) {
        const primaryClues = this.selectedPrimaryClues(clues)
            .map((clue) => this.compactClueValue(clue))
            .sort();
        const selectedClues = clues
            .map((clue) => this.compactClueValue(clue))
            .filter(Boolean)
            .sort();
        const payload = this.buildVintedPayload(title, clues);
        return [
            this.currentVintedListingKey(),
            this.compactClueValue(this.buildVintedSearchTitle(title, clues)),
            selectedClues.join(','),
            primaryClues.join(','),
            this.compactClueValue(payload.name || ''),
            this.compactClueValue(payload.variation || ''),
            this.compactClueValue(payload.collectorNumber || ''),
            this.compactClueValue(payload.expansion || ''),
            this.compactClueValue(payload.levelNumber || ''),
            String(this.currentSelectionRevision || 0),
        ].join('|');
    }

    resetVintedListingState(nextListingKey) {
        if (this.vintedReinsertTimer && typeof clearTimeout === 'function') {
            clearTimeout(this.vintedReinsertTimer);
            this.vintedReinsertTimer = null;
        }
        if (this.currentPanelHost?.remove) {
            this.currentPanelHost.remove();
        }
        this.currentListingKey = nextListingKey;
        this.currentPanel = null;
        this.currentPanelHost = null;
        this.currentButton = null;
        this.vintedOverlayCollapsed = true;
        this.currentKeywords = [];
        this.selectedKeywordValues = new Set();
        this.currentMatchCount = 0;
        this.latestSearchToken += 1;
        this.lastAppliedSearchSignature = '';
        this.searchResultsBySignature.clear();
        this.listingScanFinalSignatures.clear();
        this.inFlightSearches.clear();
        this.pendingSearchApplications.clear();
        this.lastRenderedPreviewResults = [];
        this.lastSentListingImageCount = -1;
        this.persistOverlayDock();
        this.recordVintedDiagnostic('listing-reset', {
            listingKey: nextListingKey,
            reason: 'stable listing URL changed',
        });
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

    buildVintedSearchTitle(title = this.currentTitle, clues = this.selectedKeywordLabels()) {
        const primaryClues = this.selectedPrimaryClues(clues);
        const variationClues = this.selectedVariationClues(clues);
        const expansionClues = this.selectedExpansionClues(clues);
        const collectorNumberClues = this.selectedCollectorNumberClues(clues);
        const illustrationClues = this.selectedIllustrationClues(clues);
        const primaryCompacts = primaryClues.map((clue) => this.compactClueValue(clue));
        const searchPrimaryClues = primaryClues.filter((clue) => {
            const compact = this.compactClueValue(clue);
            if (!this.vintedVariationCompacts().includes(compact)) {
                return true;
            }
            return !primaryCompacts.some((primaryCompact) => primaryCompact !== compact && primaryCompact.endsWith(compact));
        });
        const additionalVariationClues = variationClues.filter((clue) => {
            const compact = this.compactClueValue(clue);
            if (!this.vintedVariationCompacts().includes(compact)) {
                return false;
            }
            return !primaryCompacts.some((primaryCompact) => primaryCompact === compact || primaryCompact.endsWith(compact));
        });
        const selectedCompositeCompacts = primaryClues
            .map((clue) => this.compactClueValue(clue))
            .filter((compact) => compact.length > 0);
        const includedByLongerPrimary = (clue) => {
            const compact = this.compactClueValue(clue);
            return selectedCompositeCompacts.some((primaryCompact) =>
                primaryCompact !== compact && primaryCompact.includes(compact)
            );
        };
        const selectedOnlyParts = [
            ...searchPrimaryClues,
            ...expansionClues,
            ...collectorNumberClues,
            ...illustrationClues,
            ...additionalVariationClues,
            ...clues.filter((clue) =>
                !primaryClues.includes(clue) &&
                !expansionClues.includes(clue) &&
                !collectorNumberClues.includes(clue) &&
                !illustrationClues.includes(clue) &&
                !variationClues.includes(clue)
            ),
        ];
        const searchParts = clues.length > 0
            ? [
                ...(
                    primaryClues.length > 0 || !title
                        ? []
                        : [this.removeVintedMarketplaceNoise(title)]
                ),
                ...selectedOnlyParts,
            ]
            : [this.removeVintedMarketplaceNoise(title)];

        return searchParts
            .map((part) => this.removeVintedMarketplaceNoise(part))
            .filter(Boolean)
            .filter((part) => !includedByLongerPrimary(part))
            .filter((part, index, all) => all.findIndex((candidate) => this.compactClueValue(candidate) === this.compactClueValue(part)) === index)
            .join(' ');
    }

    overlayCandidateParts(result = {}) {
        const name = String(result.name || result.name_en || result.pokemon_name || '').trim();
        const rawNumber = String(result.collector_number || result.card_number || result.collectorNumber || '')
            .trim();
        const number = rawNumber
            .match(/\b(?:[A-Z]{1,6}\s?)?(\d{1,4}[a-z]?)(?:\s*\/\s*\d{1,4}[a-z]?)?\b/i)?.[1] || '';
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

    currentPreviewResults(options = {}) {
        const signature = this.buildVintedSearchSignature(this.currentTitle, this.selectedKeywordLabels());
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

    vintedPanelRoot(panel = this.currentPanel) {
        return panel?.shadowRoot || panel;
    }

    vintedHeaderRow() {
        return this.vintedPanelRoot()?.querySelector?.('[data-pokoin-vinted-header-row]') || null;
    }

    applyVintedOverlayCollapsedState() {
        const collapsed = Boolean(this.vintedOverlayCollapsed);
        this.currentPanelHost?.setAttribute('data-pokoin-vinted-collapsed', collapsed ? 'true' : 'false');
        this.currentPanel?.setAttribute('data-pokoin-vinted-collapsed', collapsed ? 'true' : 'false');
        this.vintedPanelRoot()?.querySelectorAll?.('[data-pokoin-vinted-keywords], [data-pokoin-candidate-preview]')
            .forEach((element) => {
                element.style.display = collapsed ? 'none' : '';
                element.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
            });
        const toggle = this.vintedPanelRoot()?.querySelector?.('[data-pokoin-vinted-collapse-toggle]');
        if (toggle?.setAttribute) {
            if (toggle.style) {
                toggle.style.display = collapsed ? 'none' : '';
            }
            toggle.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
            toggle.textContent = collapsed ? '+' : 'X';
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            toggle.setAttribute('aria-label', collapsed ? 'Expand Pokoin Vinted overlay' : 'Collapse Pokoin Vinted overlay');
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
        const header = this.vintedHeaderRow();
        if (header?.style) {
            header.style.gap = collapsed ? '0' : '8px';
            header.style.width = collapsed ? '40px' : '100%';
            header.style.cursor = collapsed ? 'grab' : '';
            header.style.touchAction = collapsed ? 'none' : '';
        }
        this.applyOverlayDock();
    }

    setVintedOverlayCollapsed(collapsed) {
        this.vintedOverlayCollapsed = Boolean(collapsed);
        this.applyVintedOverlayCollapsedState();
        this.persistOverlayDock();
    }

    ensureVintedHeaderRow() {
        const root = this.vintedPanelRoot();
        if (!root) {
            return null;
        }
        let header = root.querySelector?.('[data-pokoin-vinted-header-row]');
        if (header && typeof header.appendChild === 'function') {
            return header;
        }
        header = document.createElement('div');
        header.setAttribute('data-pokoin-vinted-header-row', 'true');
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

    renderVintedCollapseToggle() {
        const header = this.ensureVintedHeaderRow();
        if (!header) {
            return;
        }
        if (header.querySelector?.('[data-pokoin-vinted-collapse-toggle]')) {
            this.applyVintedOverlayCollapsedState();
            return;
        }

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.setAttribute('data-pokoin-vinted-collapse-toggle', 'true');
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
            this.setVintedOverlayCollapsed(!this.vintedOverlayCollapsed);
        }, true);

        header.appendChild(toggle);
        this.applyVintedOverlayCollapsedState();
    }

    createVintedOwnedPanelHost() {
        const host = document.createElement('div');
        host.setAttribute('data-pokoin-extension-panel', 'vinted');
        host.setAttribute('data-pokoin-vinted-panel-host', 'true');
        Object.assign(host.style, this.vintedPanelBaseStyles());

        let root = host;
        if (typeof host.attachShadow === 'function') {
            root = host.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = this.vintedPanelResetStyles();
            root.appendChild(style);
        }

        const panel = document.createElement('div');
        panel.setAttribute('data-pokoin-vinted-panel', 'true');
        panel.setAttribute('data-pokoin-extension-panel', 'vinted-content');
        Object.assign(panel.style, this.vintedInsertedPanelStyles());
        root.appendChild(panel);

        return { host, panel };
    }

    findExistingVintedPanelHost() {
        return document.querySelector?.('[data-pokoin-vinted-panel-host]');
    }

    findExistingVintedPanel(host = this.currentPanelHost) {
        if (!host) {
            return null;
        }
        return host.shadowRoot?.querySelector?.('[data-pokoin-vinted-panel]') || host.querySelector?.('[data-pokoin-vinted-panel]');
    }

    removeOwnedPanelChildren(selector) {
        const root = this.vintedPanelRoot();
        root?.querySelectorAll?.(selector).forEach((element) => element.remove());
    }

    isVintedOwnedNodeConnected(node) {
        if (!node) {
            return false;
        }
        return document.contains(node)
            || Boolean(this.currentPanelHost && document.contains(this.currentPanelHost) && this.currentPanelHost.contains?.(node))
            || Boolean(this.currentPanelHost && document.contains(this.currentPanelHost) && this.currentPanel?.contains?.(node));
    }

    renderCandidatePreview(results = []) {
        this.removeOwnedPanelChildren('[data-pokoin-candidate-preview]');
        this.lastRenderedPreviewResults = Array.isArray(results) ? results : [];
        this.currentMatchCount = this.countPreviewCandidateMatches(results);
        if (this.currentButton) {
            this.setPokoinButtonLabel(this.currentButton, this.currentMatchCount);
            this.applyPokoinButtonCollapsedLayout(this.currentButton);
        }
        if (!this.isVintedOwnedNodeConnected(this.currentButton) || results.length === 0) {
            this.applyVintedOverlayCollapsedState();
            return;
        }

        const panel = this.currentPanel || this.currentButton.closest?.('[data-pokoin-vinted-panel]');
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
        Object.assign(preview.style, {
            maxHeight: 'calc(100vh - 220px)',
            overflowY: 'auto',
        });

        const visibleResults = results.slice(0, this.vintedCandidateRowLimit());
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
                this.openPokoinSidePanel(result);
            }, true);
            preview.appendChild(row);
        });

        if (panel) {
            panel.appendChild(preview);
        } else {
            this.ensureVintedPanel(this.currentTitleElement).appendChild(preview);
        }
        this.applyVintedOverlayCollapsedState();
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
            this.openPokoinSidePanel(null, { all: true });
        }, true);
        preview.appendChild(row);
    }

    candidateCardId(result = {}) {
        return result.card_id || result.blueprint_id || result.cardId || result.blueprintId || '';
    }

    buildSidePanelCandidatePayload(result = {}) {
        const cardId = this.candidateCardId(result);
        if (!cardId) {
            return {};
        }

        return {
            selectedCandidateId: String(cardId),
            selectedCandidate: {
                card_id: cardId,
                name: result.name || result.name_en || result.pokemon_name || '',
                set_name: result.set_name || result.expansion_name_en || result.expansionName || result.expansion_name || '',
                card_number: result.card_number || result.collector_number || result.collectorNumber || '',
                expansion_symbol_url: result.expansion_symbol_url || result.expansionSymbolUrl || result.symbolImageUrl || '',
                preview_image_url: result.preview_image_url || result.previewImageUrl || result.image_url || result.imageUrl || result.cdn_image_url || '',
                image_url: result.image_url || result.imageUrl || result.cdn_image_url || result.cdnImageUrl || '',
                print_langs: result.print_langs || result.printLangs || null,
                source: result.source || 'vinted_overlay',
                search_rank: result.search_rank || result.searchScore || result.search_score || result.relevanceScore || result.score || '',
                pokoin_price: result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '',
                print_lang_prices: result.print_lang_prices || null,
                print_lang_price_pkn: result.print_lang_price_pkn || null,
                canonicalUrl: result.canonicalUrl || result.canonical_url || '',
                marketplaceUrl: result.marketplaceUrl || result.marketplace_url || '',
                canonicalPath: result.canonicalPath || result.canonical_path || '',
                marketplacePath: result.marketplacePath || result.marketplace_path || '',
            },
        };
    }

    buildSidePanelPreviewRowsPayload(results = this.currentPreviewResults()) {
        const rows = (Array.isArray(results) ? results : [])
            .slice(0, this.vintedCandidateRowLimit())
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
                    print_langs: result.print_langs || result.printLangs || null,
                    source: result.source || 'vinted_overlay_preview',
                    search_rank: result.search_rank || result.searchScore || result.search_score || result.relevanceScore || result.score || '',
                    pokoin_price: result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '',
                    print_lang_prices: result.print_lang_prices || null,
                    print_lang_price_pkn: result.print_lang_price_pkn || null,
                    canonicalUrl: result.canonicalUrl || result.canonical_url || '',
                    marketplaceUrl: result.marketplaceUrl || result.marketplace_url || '',
                    canonicalPath: result.canonicalPath || result.canonical_path || '',
                    marketplacePath: result.marketplacePath || result.marketplace_path || '',
                };
            })
            .filter(Boolean);
        return rows.length > 0 ? { previewRows: rows } : {};
    }

    hasActivePreviewRows() {
        return this.buildSidePanelPreviewRowsPayload().previewRows?.length > 0;
    }

    invalidateVintedPreviewForSelectionChange() {
        this.currentSelectionRevision += 1;
        this.latestSearchToken += 1;
        this.lastAppliedSearchSignature = '';
        this.searchResultsBySignature.clear();
        this.recentSearchResults.clear();
        this.inFlightSearches.clear();
        this.pendingSearchApplications.clear();
        this.lastRenderedPreviewResults = [];
        this.removeOwnedPanelChildren('[data-pokoin-candidate-preview]');
        this.currentMatchCount = 0;
        if (this.currentButton) {
            this.setPokoinButtonLabel(this.currentButton, this.currentMatchCount);
            this.setPokoinButtonScanState('scanning');
        }
    }

    openPokoinSidePanel(candidate = null, options = {}) {
        const clues = this.selectedKeywordLabels();
        const primaryClues = this.selectedPrimaryClues(clues);
        const vintedPayload = this.buildVintedPayload(this.currentTitle || document.title, clues);
        const previewPayload = this.buildSidePanelPreviewRowsPayload(
            this.currentPreviewResults({
                allowRenderedFallback: Boolean(candidate) || Boolean(options.all),
            })
        );
        if (!previewPayload.previewRows?.length && candidate) {
            previewPayload.previewRows = [this.buildSidePanelCandidatePayload(candidate).selectedCandidate]
                .filter(Boolean);
        }
        const previewRowCount = previewPayload.previewRows?.length || 0;
        const openAllCards = Boolean(options.all) || (!candidate && previewRowCount > 1);
        const message = {
            action: 'openSidePanelForCurrentTab',
            url: window.location.href,
            title: this.buildVintedSearchTitle(this.currentTitle || document.title, clues),
            originalTitle: this.currentTitle || document.title,
            clues,
            primaryClues,
            selectedClues: clues,
            vintedPayload,
            previewSignature: this.buildVintedSearchSignature(this.currentTitle || document.title, clues),
            previewSource: 'vinted_overlay',
            selectionRevision: this.currentSelectionRevision,
            ...previewPayload,
            ...(options.all || !candidate ? {} : this.buildSidePanelCandidatePayload(candidate || {})),
            openAllCards,
        };
        this.recordVintedDiagnostic('side-panel-payload', {
            trigger: candidate ? 'candidate-click' : (options.all ? 'all-click' : 'main-button'),
            searchSignature: message.previewSignature,
            selectedChipCategories: vintedPayload.selectedChipCategories,
            payload: vintedPayload,
            title: message.title,
        });
        return Promise.resolve(chrome.runtime.sendMessage(message)).catch((error) => {
            console.warn('⚠️ [VINT] Unable to open side panel:', error);
        });
    }

    async searchCardWithBackground(title, clues = this.selectedKeywordLabels(), trigger = 'background-preview') {
        const signature = this.buildVintedSearchSignature(title, clues);
        const bypassResultCache = trigger === 'overlay-expand' || trigger === 'overlay-refresh' || trigger === 'manual-clue' || trigger === 'keyword-toggle' || trigger === 'listing-gallery-grown';
        if (!bypassResultCache && this.searchResultsBySignature.has(signature)) {
            this.recordVintedDiagnostic('search-skip', {
                searchSignature: signature,
                skippedDuplicateReason: 'cached-results',
                hasCachedResults: true,
                title,
            });
            return this.searchResultsBySignature.get(signature);
        }
        if (!bypassResultCache && this.recentSearchResults.has(signature)) {
            const cachedResults = this.recentSearchResults.get(signature);
            this.recentSearchResults.delete(signature);
            this.recentSearchResults.set(signature, cachedResults);
            this.searchResultsBySignature.set(signature, cachedResults);
            this.recordVintedDiagnostic('search-skip', {
                searchSignature: signature,
                skippedDuplicateReason: 'recent-search-cache',
                hasCachedResults: true,
                title,
            });
            return cachedResults;
        }
        if (this.inFlightSearches.has(signature)) {
            this.recordVintedDiagnostic('search-skip', {
                searchSignature: signature,
                skippedDuplicateReason: 'in-flight',
                inFlight: true,
                title,
            });
            return this.inFlightSearches.get(signature);
        }

        const primaryClues = this.selectedPrimaryClues(clues);
        const vintedPayload = this.buildVintedPayload(title, clues);
        const requestUrl = window.location.href;
        const userChipSearch = trigger === 'keyword-toggle';
        const userInputScan = trigger === 'manual-clue';
        const overlayExpandScan = trigger === 'overlay-expand' || trigger === 'overlay-refresh';
        this.recordVintedDiagnostic('search-start', {
            searchSignature: signature,
            trigger,
            title,
            selectedChipCategories: vintedPayload.selectedChipCategories,
            payload: vintedPayload,
        });
        const searchPromise = chrome.runtime.sendMessage({
            action: 'searchCardForTitle',
            title: this.buildVintedSearchTitle(title, clues),
            originalTitle: title,
            clues,
            primaryClues,
            selectedClues: clues,
            vintedPayload,
            selectionRevision: this.currentSelectionRevision,
            url: requestUrl,
            forceRefresh: userChipSearch || userInputScan || overlayExpandScan,
            skipListingScan: userChipSearch,
            forceListingScan: userInputScan || overlayExpandScan || trigger === 'listing-gallery-grown',
            searchTrigger: trigger,
        }).then((response) => {
            if (this.listingScanFinalSignatures.has(signature)) {
                const finalResults = this.searchResultsBySignature.get(signature) || [];
                this.recordVintedDiagnostic('search-stale', {
                    searchSignature: signature,
                    trigger,
                    staleResponseIgnored: true,
                    reason: 'listing scan already finalized this signature',
                    title,
                });
                return finalResults;
            }
            const results = response?.success && Array.isArray(response.results) ? response.results : [];
            this.searchResultsBySignature.set(signature, results);
            this.rememberRecentSearchResults(signature, results);
            this.recordVintedDiagnostic('search-complete', {
                searchSignature: signature,
                reason: `${results.length} result(s)`,
                hasCachedResults: true,
                title,
                resultRows: results.map((row) => ({
                    id: row?.card_id || row?.id || '',
                    name: row?.name || '',
                    collector: row?.collector_number || row?.collectorNumber || '',
                    score: Number(row?.score ?? row?.similarity ?? row?.confidence) || 0,
                    source: row?.source || row?.match_source || '',
                })),
            });
            return results;
        }).finally(() => {
            this.inFlightSearches.delete(signature);
        });

        this.inFlightSearches.set(signature, searchPromise);
        return searchPromise;
    }

    vintedInsertedPanelStyles() {
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

    vintedPanelBaseStyles() {
        return {
            all: 'initial',
            boxSizing: 'border-box',
            contain: 'layout style',
            colorScheme: 'light',
            pointerEvents: 'none',
            fontFamily: 'Arial, sans-serif',
        };
    }

    vintedPanelResetStyles() {
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
            [data-pokoin-vinted-panel] img,
            [data-pokoin-vinted-panel] svg,
            [data-pokoin-vinted-header-row] img,
            [data-pokoin-vinted-header-row] svg,
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

    vintedFallbackPanelStyles() {
        return {
            position: 'fixed',
            bottom: 'auto',
            right: 'auto',
            zIndex: '2147483647',
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

    vintedFloatingPanelStyles() {
        return this.vintedFallbackPanelStyles();
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
        return this.vintedOverlayCollapsed ? 40 : 320;
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

    normalizeOverlayDock(dock = {}, collapsed = this.vintedOverlayCollapsed) {
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
            collapsed: Boolean(this.vintedOverlayCollapsed),
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
            this.vintedOverlayCollapsed = cached.collapsed;
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
        const collapsed = Boolean(this.vintedOverlayCollapsed);
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
                        this.vintedOverlayCollapsed = dock.collapsed;
                    }
                    this.writeOverlayDockSyncCache(this.overlayDockPayload());
                }
                this.applyVintedOverlayCollapsedState();
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
        const dragThreshold = this.vintedOverlayCollapsed ? 3 : 8;
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
            root.removeEventListener?.('mousemove', onMove, true);
            root.removeEventListener?.('mouseup', onUp, true);
            handle.releasePointerCapture?.(this.overlayDrag?.pointerId ?? event?.pointerId);
            if (handle.style) {
                handle.style.cursor = this.vintedOverlayCollapsed ? 'grab' : 'pointer';
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
        root.addEventListener?.('mousemove', onMove, true);
        root.addEventListener?.('mouseup', onUp, true);
    }

    nearestElement(node) {
        let current = node;
        while (current && current.nodeType && current.nodeType !== Node.ELEMENT_NODE) {
            current = current.parentElement || current.parentNode;
        }
        return current || null;
    }

    vintedDetailsSelectors() {
        return [
            '[data-testid="item-page-summary-plugin"]',
            '[data-testid="item-details"]',
            '[data-testid="item-page-details"]',
            '[data-testid="item-details-container"]',
            '[data-testid="item-info"]',
            '[data-testid="item-summary"]',
            '[data-testid="item-overview"]',
            '[itemtype*="schema.org/Product"]',
            '.box--item-details',
            '[class*="item-details"]',
            '[class*="ItemDetails"]',
            '[class*="item-page-summary"]',
        ];
    }

    isVintedUnsafeAnchorElement(element) {
        if (!element?.closest) {
            return true;
        }

        const unsafeSelectors = [
            'header',
            'nav',
            'footer',
            'aside',
            '[role="banner"]',
            '[role="navigation"]',
            '[data-testid*="ad"]',
            '[data-testid*="banner"]',
            '[data-testid*="catalog"]',
            '[data-testid*="category"]',
            '[data-testid*="feed"]',
            '[data-testid*="header"]',
            '[data-testid*="navigation"]',
            '[data-testid*="placeholder"]',
            '[data-testid*="search"]',
            '[data-testid*="skeleton"]',
            '[class*="ad-"]',
            '[class*="banner"]',
            '[class*="catalog"]',
            '[class*="category"]',
            '[class*="feed"]',
            '[class*="header"]',
            '[class*="navigation"]',
            '[class*="placeholder"]',
            '[class*="skeleton"]',
        ];

        return unsafeSelectors.some((selector) => element.closest(selector));
    }

    isVintedTitleText(text = '') {
        const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
        if (cleaned.length < 3) {
            return false;
        }

        return !/^(?:vinted|loading|caricamento|advertisement|sponsored|promoted|pubblicit[aà])\b/i.test(cleaned);
    }

    isSafeVintedDetailsContainer(container) {
        return Boolean(container?.querySelector && !this.isVintedUnsafeAnchorElement(container));
    }

    isSafeVintedTitleElement(element) {
        if (!element || !this.isVintedTitleText(element.textContent) || this.isVintedUnsafeAnchorElement(element)) {
            return false;
        }

        return Boolean(this.findVintedDetailsContainer(element));
    }

    isVintedSearchableTitleElement(element) {
        return Boolean(element && this.isVintedTitleText(element.textContent) && !this.isVintedUnsafeAnchorElement(element));
    }

    findVintedTitleElement() {
        const titleSelectors = [
            '[data-testid="item-title"]',
            'h1[data-testid="item-title"]',
            '[data-testid="item-page-summary-plugin"] h1',
            '[data-testid="item-page-summary-plugin"] .web_ui__Text__title',
            '[data-testid="item-details"] h1',
            '[data-testid="item-page-details"] h1',
            '[data-testid="item-details-container"] h1',
            '[class*="item-details"] h1',
            '[class*="ItemDetails"] h1',
            'h1.web_ui__Text__title',
            'h1',
        ];

        for (const selector of titleSelectors) {
            const candidates = Array.from(document.querySelectorAll?.(selector) || []);
            const titleElement = candidates.find((candidate) => this.isSafeVintedTitleElement(candidate));
            console.log(`🔍 [VINT] Trying selector "${selector}":`, titleElement ? 'FOUND' : 'NOT FOUND');
            if (titleElement) {
                return titleElement;
            }
        }

        return null;
    }

    findVintedSearchableTitleElement() {
        const titleSelectors = [
            '[data-testid="item-title"]',
            'h1[data-testid="item-title"]',
            '[data-testid="item-page-summary-plugin"] h1',
            '[data-testid="item-page-summary-plugin"] .web_ui__Text__title',
            '[data-testid="item-details"] h1',
            '[data-testid="item-page-details"] h1',
            '[data-testid="item-details-container"] h1',
            '[class*="item-details"] h1',
            '[class*="ItemDetails"] h1',
            'h1.web_ui__Text__title',
            'h1',
            'meta[property="og:title"]',
            'meta[name="twitter:title"]',
        ];

        for (const selector of titleSelectors) {
            const candidates = Array.from(document.querySelectorAll?.(selector) || []);
            const titleElement = candidates.find((candidate) => this.isVintedSearchableTitleElement(candidate));
            if (titleElement) {
                return titleElement;
            }
        }

        const metaTitle = document.querySelector?.('meta[property="og:title"], meta[name="twitter:title"]');
        const metaText = metaTitle?.getAttribute?.('content')?.replace(/\s+/g, ' ').trim() || '';
        if (this.isVintedTitleText(metaText)) {
            return metaTitle;
        }

        return null;
    }

    findVintedDetailsContainer(titleElement) {
        if (!titleElement) {
            return null;
        }

        const detailSelectors = this.vintedDetailsSelectors();

        for (const selector of detailSelectors) {
            const closest = titleElement.closest?.(selector);
            if (this.isSafeVintedDetailsContainer(closest)) {
                return closest;
            }
        }

        for (const selector of detailSelectors) {
            const candidate = document.querySelector?.(selector);
            if (
                this.isSafeVintedDetailsContainer(candidate) &&
                (candidate.contains?.(titleElement) || candidate.querySelector?.('h1, [data-testid="item-title"]') === titleElement)
            ) {
                return candidate;
            }
        }

        return null;
    }

    resolveVintedProductAnchor() {
        const titleElement = this.findVintedTitleElement();
        const title = titleElement?.textContent?.replace(/\s+/g, ' ').trim() || '';
        return {
            titleElement,
            title,
            detailsContainer: this.findVintedDetailsContainer(titleElement),
        };
    }

    resolveVintedSearchSource() {
        const titleElement = this.findVintedSearchableTitleElement();
        const title = (
            titleElement?.getAttribute?.('content') ||
            titleElement?.textContent ||
            ''
        ).replace(/\s+/g, ' ').replace(/\s*\|\s*Vinted\s*$/i, '').trim();
        return {
            titleElement,
            title,
            description: this.extractVintedDescription(),
            detailsContainer: this.findVintedDetailsContainer(titleElement),
        };
    }

    scheduleVintedProductRetry(reason) {
        const pageKey = window.location.href;
        const attempts = this.vintedProcessAttempts.get(pageKey) || 0;
        if (attempts >= this.vintedProcessMaxRetries || typeof setTimeout !== 'function') {
            console.log(`⚠️ [VINT] Product details unavailable after retries: ${reason}`);
            return false;
        }

        this.vintedProcessAttempts.set(pageKey, attempts + 1);
        console.log(`⏳ [VINT] Waiting for product details (${attempts + 1}/${this.vintedProcessMaxRetries}): ${reason}`);
        setTimeout(() => this.processProductPage(), this.vintedProcessRetryDelayMs);
        return true;
    }

    hasVintedRetryBudget() {
        return (this.vintedProcessAttempts.get(window.location.href) || 0) < this.vintedProcessMaxRetries;
    }

    findVintedActionArea(container) {
        if (!container?.querySelector) {
            return null;
        }

        const actionSelectors = [
            '[data-testid="item-actions"]',
            '[data-testid="item-action-bar"]',
            '[data-testid="item-buy-button"]',
            '[data-testid="item-message-button"]',
            '[class*="item-actions"]',
            '[class*="ItemActions"]',
        ];

        for (const selector of actionSelectors) {
            const actionArea = container.querySelector(selector);
            if (actionArea) {
                return actionArea;
            }
        }

        return null;
    }

    insertVintedPanelNearDetails(host, titleElement) {
        void host;
        void titleElement;
        return false;
    }

    placeVintedPanelHost(host, titleElement = this.currentTitleElement) {
        void titleElement;
        Object.assign(host.style, this.vintedPanelBaseStyles(), this.vintedFallbackPanelStyles());
        host.setAttribute('data-pokoin-vinted-placement', 'overlay-fixed');
        this.applyOverlayDock(host);
        document.body.appendChild(host);
        this.restoreOverlayDock();
        this.bindOverlayDragHandle(this.currentButton);
        return true;
    }

    removeDuplicateVintedPanelHosts(ownedHost) {
        document.querySelectorAll?.('[data-pokoin-vinted-panel-host]').forEach((host) => {
            if (host !== ownedHost) {
                host.remove();
            }
        });
    }

    scheduleVintedPanelReinsert() {
        if (this.vintedReinsertTimer || typeof setTimeout !== 'function') {
            return;
        }

        this.vintedReinsertTimer = setTimeout(() => {
            this.vintedReinsertTimer = null;
            this.ensureVintedPanel(this.currentTitleElement);
        }, 100);
    }

    startVintedPanelObserver() {
        if (this.vintedPanelObserver || typeof MutationObserver !== 'function' || !document.body) {
            return;
        }

        this.vintedPanelObserver = new MutationObserver(() => {
            if (this.currentPanelHost && !document.contains(this.currentPanelHost)) {
                this.scheduleVintedPanelReinsert();
            }
        });
        this.vintedPanelObserver.observe(document.body, { childList: true, subtree: true });
    }

    ensureVintedPanel(titleElement = this.currentTitleElement) {
        let host = this.currentPanelHost;
        let panel = this.findExistingVintedPanel(host);

        if (!host || !panel) {
            host = this.findExistingVintedPanelHost();
            panel = this.findExistingVintedPanel(host);
        }

        if (!host || !panel) {
            ({ host, panel } = this.createVintedOwnedPanelHost());
        }

        this.currentPanelHost = host;
        this.currentPanel = panel;
        this.removeDuplicateVintedPanelHosts(host);

        if (!host.parentNode || !document.contains(host)) {
            this.placeVintedPanelHost(host, titleElement);
        }

        this.startVintedPanelObserver();
        this.currentPanel = panel;
        this.renderVintedCollapseToggle();
        return panel;
    }

    ensureVintedFloatingPanel() {
        return this.ensureVintedPanel();
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
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.2s ease',
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

    expandVintedOverlayAndRecognize() {
        return this.recognizeVintedListing('overlay-expand');
    }

    refreshVintedOverlayScan() {
        return this.recognizeVintedListing('overlay-refresh');
    }

    recognizeVintedListing(trigger = 'overlay-expand') {
        this.setVintedOverlayCollapsed(false);
        const title = this.currentTitle || (typeof document !== 'undefined' ? document.title : '');
        if (!title) {
            return Promise.resolve();
        }
        const titleInfo = typeof this.extractTitleInfo === 'function'
            ? this.extractTitleInfo(title)
            : {};
        return this.runVintedSearch(titleInfo, title, trigger);
    }

    ensurePokoinSidePanelOpen() {
        if (typeof chrome.runtime?.sendMessage !== 'function') {
            return Promise.resolve();
        }
        return Promise.resolve(chrome.runtime.sendMessage({ action: 'ensureSidePanelOpen' })).catch((error) => {
            console.warn('⚠️ [VINT] Unable to open side panel:', error);
        });
    }

    attachVintedSidePanelClick(button) {
        if (!button) {
            return;
        }
        if (button.__pokoinVintedSidePanelClickAttached) {
            return;
        }
        button.__pokoinVintedSidePanelClickAttached = true;
        this.bindOverlayDragHandle(button);
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            if (this.consumeOverlayDragClick(event)) {
                return;
            }
            if (this.vintedOverlayCollapsed) {
                this.expandVintedOverlayAndRecognize();
                this.ensurePokoinSidePanelOpen();
                return;
            }
            this.refreshVintedOverlayScan();
        }, true);
    }

    /**
     * Initialize Vinted processor
     */
    init() {
        console.log('🟢 [VINT] Initializing Vinted processor...');
        this.startVintedNavigationObserver();
        
        if (this.isVintedCataloguePage()) {
            console.log('ℹ️ [VINT] Catalogue/search page detected, keeping overlay quiet');
            this.handleVintedCataloguePage();
        } else if (this.isProductPage()) {
            console.log('✅ [VINT] Product page detected, starting processing...');
            this.processProductPage();
        } else {
            console.log('ℹ️ [VINT] Not a product page, no action required');
        }
    }

    /**
     * Check whether this is a Vinted product page
     */
    isProductPage() {
        const isVinted = window.location.hostname.includes('vinted');
        const hasItemPath = this.isVintedItemListingPage();
        const result = {
            isVinted,
            hasItemPath,
            pathname: window.location.pathname,
            excludedCataloguePage: this.isVintedCataloguePage(),
        };
        console.log('🔍 [VINT] Product page check:', result);
        return isVinted && hasItemPath;
    }

    scheduleVintedPageProcess() {
        if (this.vintedNavigationTimer || typeof setTimeout !== 'function') {
            return;
        }

        this.vintedNavigationTimer = setTimeout(() => {
            this.vintedNavigationTimer = null;
            if (this.isVintedCataloguePage()) {
                this.handleVintedCataloguePage();
            } else if (this.isProductPage()) {
                this.processProductPage();
            }
        }, 250);
    }

    startVintedNavigationObserver() {
        if (this.vintedNavigationObserver || typeof MutationObserver !== 'function') {
            return;
        }

        if (!window.__pokoinVintedHistoryPatched) {
            window.__pokoinVintedHistoryPatched = true;
            ['pushState', 'replaceState'].forEach((methodName) => {
                const original = history[methodName];
                if (typeof original !== 'function') {
                    return;
                }
                history[methodName] = function pokoinVintedHistoryPatch(...args) {
                    const result = original.apply(this, args);
                    window.dispatchEvent(new Event('pokoin:vinted-navigation'));
                    return result;
                };
            });
            window.addEventListener('popstate', () => window.dispatchEvent(new Event('pokoin:vinted-navigation')));
        }

        window.addEventListener('pokoin:vinted-navigation', () => {
            this.recordVintedDiagnostic('navigation', {
                reason: 'Vinted SPA navigation observed',
                listingKey: this.currentVintedListingKey(),
            });
            this.scheduleVintedPageProcess();
        });
        this.vintedNavigationObserver = new MutationObserver(() => this.scheduleVintedPageProcess());
        this.vintedNavigationObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
        this.ensureVintedListingPhotoObserver();
    }

    listingImageCountForScan() {
        return this.extractVintedListingImageUrls().length;
    }

    rememberSentListingImageCount(count = 0) {
        this.lastSentListingImageCount = Math.max(this.lastSentListingImageCount, Number(count) || 0);
    }

    notifyVintedListingGalleryIfGrown() {
        if (!this.isVintedItemListingPage() || this.lastSentListingImageCount < 0) {
            return;
        }
        const urls = this.extractVintedListingImageUrls();
        if (urls.length <= this.lastSentListingImageCount) {
            return;
        }
        this.rememberSentListingImageCount(urls.length);
        this.recordVintedDiagnostic('listing-gallery-grown', {
            listingKey: this.currentVintedListingKey(),
            imageCount: urls.length,
            reason: 'more listing photos became available after the first auto-scan',
        });
        this.sendVintedTokensReady('listing-gallery-grown', { forceListingScan: true });
    }

    ensureVintedListingPhotoObserver() {
        if (this.vintedListingPhotoObserver || typeof MutationObserver !== 'function') {
            return;
        }
        this.vintedListingPhotoObserver = new MutationObserver(() => {
            if (this.vintedListingPhotoTimer || typeof setTimeout !== 'function') {
                return;
            }
            this.vintedListingPhotoTimer = setTimeout(() => {
                this.vintedListingPhotoTimer = null;
                this.notifyVintedListingGalleryIfGrown();
            }, 250);
        });
        const root = document.documentElement || document.body;
        if (!root) {
            return;
        }
        this.vintedListingPhotoObserver.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'srcset', 'data-src', 'data-srcset'],
        });
    }

    /**
     * Process Vinted product page
     */
    processProductPage() {
        if (this.isVintedCataloguePage()) {
            this.handleVintedCataloguePage();
            return;
        }

        const pageKey = this.currentVintedListingKey();
        if (this.currentListingKey && this.currentListingKey !== pageKey) {
            this.resetVintedListingState(pageKey);
        } else if (!this.currentListingKey) {
            this.currentListingKey = pageKey;
        }

        if (
            this.processedPages.has(pageKey) &&
            this.isVintedOwnedNodeConnected(this.currentButton)
        ) {
            this.recordVintedDiagnostic('process-skip', {
                skippedDuplicateReason: 'same listing already mounted',
                uiMounted: true,
            });
            return;
        }

        try {
            const searchSource = this.resolveVintedSearchSource();
            if (!searchSource.titleElement) {
                this.recordVintedDiagnostic('process-wait', { reason: 'searchable item title not found' });
                this.scheduleVintedProductRetry('searchable item title not found');
                return;
            }

            if (!searchSource.title) {
                this.recordVintedDiagnostic('process-wait', { reason: 'item title is empty' });
                this.scheduleVintedProductRetry('item title is empty');
                return;
            }

            this.currentTitle = searchSource.title;
            this.currentTitleElement = searchSource.titleElement;
            this.recordVintedDiagnostic('title-ready', {
                reason: 'searchable item title and description resolved',
                title: searchSource.title,
            });
            this.prepareVintedKeywords(searchSource.title, searchSource.description);

            this.currentTitle = searchSource.title;
            this.currentTitleElement = searchSource.titleElement;
            this.recordVintedDiagnostic('ui-mount', {
                reason: 'overlay mounted from scraped item data',
                anchorMounted: Boolean(searchSource.detailsContainer),
                title: this.currentTitle,
            });
            this.createFallbackButton(searchSource.titleElement);
            this.renderKeywordToggles(this.currentTitle, searchSource.description);
            this.applyPendingVintedSearchResults();
            this.processedPages.add(pageKey);
            this.ensureVintedListingPhotoObserver();

        } catch (error) {
            console.error('❌ [VINT] Error while processing product page:', error);
        }
    }

    prepareVintedKeywords(title, description) {
        this.currentKeywords = this.extractVintedKeywords(title, description);
        this.selectedKeywordValues = new Set(
            this.currentKeywords
                .filter((keyword) => keyword.selectedByDefault)
                .map((keyword) => keyword.compact)
        );
    }

    renderKeywordToggles(title, description) {
        this.removeOwnedPanelChildren('[data-pokoin-vinted-keywords]');
        this.prepareVintedKeywords(title, description);
        if (!this.currentButton || this.currentKeywords.length === 0) {
            return;
        }

        const container = document.createElement('div');
        container.setAttribute('data-pokoin-vinted-keywords', 'true');
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
            chip.setAttribute('data-pokoin-vinted-keyword', keyword.compact);
            chip.setAttribute('data-pokoin-vinted-keyword-name-like', keyword.nameLike ? 'true' : 'false');
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
                this.triggerVintedSelectionRefresh('keyword-toggle');
            });
            container.appendChild(chip);
        });

        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('data-pokoin-vinted-manual-clue-input', 'true');
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
            const beforeSignature = this.buildVintedSearchSignature(this.currentTitle, this.selectedKeywordLabels());
            this.addManualVintedKeyword(value);
            const afterSignature = this.buildVintedSearchSignature(this.currentTitle, this.selectedKeywordLabels());
            if (afterSignature === beforeSignature) {
                return;
            }
            this.renderKeywordTogglesFromCurrent();
            this.triggerVintedSelectionRefresh('manual-clue');
        };
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            submitManualClue();
        });
        input.addEventListener('blur', submitManualClue);
        container.appendChild(input);

        this.ensureVintedPanel(this.currentTitleElement).appendChild(container);
    }

    renderKeywordTogglesFromCurrent() {
        this.removeOwnedPanelChildren('[data-pokoin-vinted-keywords]');
        if (!this.currentButton || this.currentKeywords.length === 0) {
            return;
        }
        const existingKeywords = this.currentKeywords;
        const existingSelection = new Set(this.selectedKeywordValues);
        this.currentKeywords = existingKeywords;
        this.selectedKeywordValues = existingSelection;
        const originalPrepare = this.prepareVintedKeywords;
        this.prepareVintedKeywords = () => {};
        try {
            this.renderKeywordToggles(this.currentTitle, '');
        } finally {
            this.prepareVintedKeywords = originalPrepare;
        }
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

    async runVintedSearch(titleInfo, title, trigger = 'process') {
        if (this.isVintedCataloguePage()) {
            this.notifyVintedIdlePage();
            return;
        }
        const clues = this.selectedKeywordLabels();
        const searchSignature = this.buildVintedSearchSignature(title, clues);
        const forceNewSearch = trigger === 'keyword-toggle' || trigger === 'manual-clue' || trigger === 'overlay-expand' || trigger === 'overlay-refresh';
        if (!forceNewSearch && searchSignature === this.lastAppliedSearchSignature && this.searchResultsBySignature.has(searchSignature)) {
            this.recordVintedDiagnostic('search-skip', {
                searchSignature,
                trigger,
                skippedDuplicateReason: 'already applied',
                hasCachedResults: true,
                title,
            });
            return;
        }
        const reuseOverlayPreview = !forceNewSearch;
        if (reuseOverlayPreview && this.hasActivePreviewRows()) {
            this.recordVintedDiagnostic('search-skip', {
                searchSignature,
                trigger,
                skippedDuplicateReason: 'collapsed/open preview rows already canonical',
                hasCachedResults: true,
                title,
            });
            this.applyVintedSearchResults(searchSignature, this.currentPreviewResults(), { title, trigger });
            return;
        }

        const searchToken = ++this.latestSearchToken;
        void titleInfo;
        this.setPokoinButtonScanState('scanning');
        const backgroundResults = await this.searchCardWithBackground(title, clues, trigger);

        if (searchToken !== this.latestSearchToken || searchSignature !== this.buildVintedSearchSignature(title, clues)) {
            this.recordVintedDiagnostic('search-stale', {
                searchSignature,
                trigger,
                staleResponseIgnored: true,
                title,
            });
            return;
        }

        this.applyVintedSearchResults(searchSignature, backgroundResults, { title, trigger });
    }

    applyVintedSearchResults(searchSignature, results = [], details = {}) {
        if (!this.isVintedOwnedNodeConnected(this.currentButton)) {
            this.pendingSearchApplications.set(searchSignature, results);
            this.recordVintedDiagnostic('search-pending-ui', {
                searchSignature,
                trigger: details.trigger || '',
                reason: 'results ready before UI mount',
                hasCachedResults: true,
                title: details.title || this.currentTitle,
            });
            return false;
        }

        this.lastAppliedSearchSignature = searchSignature;
        this.pendingSearchApplications.delete(searchSignature);
        this.recordVintedDiagnostic('search-apply', {
            searchSignature,
            trigger: details.trigger || '',
            reason: `${results.length} result(s) applied`,
            hasCachedResults: true,
            uiMounted: true,
            title: details.title || this.currentTitle,
            resultRows: results.map((row) => ({
                id: row?.card_id || row?.id || '',
                name: row?.name || '',
                collector: row?.collector_number || row?.collectorNumber || '',
                score: Number(row?.score ?? row?.similarity ?? row?.confidence) || 0,
                source: row?.source || row?.match_source || '',
            })),
        });
        if (results.length > 0) {
            this.updateButtonWithResults(results);
        } else {
            this.updateButtonWithoutResults();
        }
        this.sendVintedPreviewReady(searchSignature, details, results);
        return true;
    }

    sendVintedPreviewReady(searchSignature, details = {}, results = null) {
        return this.sendVintedTokensReady(details.trigger || 'preview-ready', {
            searchSignature,
            includePreviewRows: true,
            previewResults: Array.isArray(results) ? results : this.currentPreviewResults(),
        });
    }

    sendVintedTokensReady(trigger = 'tokens-ready', options = {}) {
        if (this.isVintedCataloguePage()) {
            this.notifyVintedIdlePage();
            return Promise.resolve();
        }
        const clues = this.selectedKeywordLabels();
        const primaryClues = this.selectedPrimaryClues(clues);
        const vintedPayload = this.buildVintedPayload(this.currentTitle || document.title, clues);
        this.rememberSentListingImageCount(vintedPayload.listingImageUrls?.length || 0);
        const previewPayload = options.includePreviewRows
            ? this.buildSidePanelPreviewRowsPayload(options.previewResults || this.currentPreviewResults())
            : {};
        const previewSignature = options.searchSignature || this.buildVintedSearchSignature(this.currentTitle || document.title, clues);
        const message = {
            action: 'marketplacePreviewReady',
            source: 'vinted',
            tokensReady: true,
            url: window.location.href,
            title: this.buildVintedSearchTitle(this.currentTitle || document.title, clues),
            originalTitle: this.currentTitle || document.title,
            listingKey: this.currentVintedListingKey(),
            clues,
            primaryClues,
            selectedClues: clues,
            vintedPayload,
            previewSignature,
            previewSource: options.includePreviewRows ? 'vinted_overlay' : 'vinted_overlay_tokens',
            selectionRevision: this.currentSelectionRevision,
            // Automatic title hydration must wait for the image scan. Treating
            // title-ready like a manual chip click allowed broad clue results to
            // reach the side panel before the recognizer finished.
            skipListingScan: Boolean(options.skipListingScan) || trigger === 'keyword-toggle',
            forceListingScan: Boolean(options.forceListingScan)
                || trigger === 'manual-clue'
                || trigger === 'overlay-expand'
                || trigger === 'overlay-refresh'
                || trigger === 'listing-gallery-grown',
            ...previewPayload,
        };
        this.recordVintedDiagnostic(options.includePreviewRows ? 'preview-ready' : 'tokens-ready', {
            trigger,
            searchSignature: message.previewSignature,
            reason: options.includePreviewRows
                ? `${message.previewRows?.length || 0} preview row(s) ready`
                : 'selected Vinted tokens ready',
            selectedChipCategories: vintedPayload.selectedChipCategories,
            payload: vintedPayload,
            title: message.title,
        });
        return Promise.resolve(chrome.runtime.sendMessage(message)).catch((error) => {
            this.recordVintedDiagnostic(options.includePreviewRows ? 'preview-ready-send-failed' : 'tokens-ready-send-failed', {
                trigger,
                searchSignature: message.previewSignature,
                reason: error?.message || 'Unable to send Vinted ready message',
                title: message.title,
            });
        });
    }

    applyPendingVintedSearchResults() {
        const signature = this.buildVintedSearchSignature(this.currentTitle);
        if (this.pendingSearchApplications.has(signature)) {
            this.applyVintedSearchResults(signature, this.pendingSearchApplications.get(signature), {
                trigger: 'ui-mount',
                title: this.currentTitle,
            });
            return true;
        }
        if (this.searchResultsBySignature.has(signature) && this.lastAppliedSearchSignature !== signature) {
            this.applyVintedSearchResults(signature, this.searchResultsBySignature.get(signature), {
                trigger: 'ui-mount-cache',
                title: this.currentTitle,
            });
            return true;
        }
        this.recordVintedDiagnostic('search-apply-skip', {
            searchSignature: signature,
            trigger: 'ui-mount',
            skippedDuplicateReason: this.lastAppliedSearchSignature === signature ? 'already applied' : 'no cached results',
            hasCachedResults: this.searchResultsBySignature.has(signature),
            title: this.currentTitle,
        });
        return false;
    }

    updateButtonWithoutResults() {
        if (!this.isVintedOwnedNodeConnected(this.currentButton)) {
            return;
        }
        this.currentMatchCount = 0;
        this.setPokoinButtonLabel(this.currentButton);
        this.currentButton.setAttribute('data-pokemon-linker-fallback', 'true');
        this.setPokoinButtonScanState('idle');
        this.renderCandidatePreview([]);
    }

    /**
     * Create gray fallback button
     */
    createFallbackButton(titleElement) {
        console.log(`🔍 [VINT] Creating Pokoin overlay panel`);
        this.createVintedPanelButton(titleElement);
    }



    /**
     * Create fixed top-right button
     */
    createVintedPanelButton(titleElement = this.currentTitleElement) {
        console.log('🔄 [VINT] Creating compact Vinted action panel...');
        const panel = this.ensureVintedPanel(titleElement);
        this.removeOwnedPanelChildren('[data-pokemon-linker-button]');
        const header = this.ensureVintedHeaderRow();
        
        // Create gray fixed-position button
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        button.setAttribute('data-pokemon-linker-fallback', 'true');
        this.setPokoinButtonLabel(button);
        button.style.cssText = `
            flex: 1 1 auto;
            width: auto;
            padding: 10px 14px;
            font-size: 14px;
            min-width: 0;
            font-family: Arial, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        this.applyPokoinButtonStyles(button, {
            background: '#075985',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.18)',
        });
        this.currentButton = button;
        this.setPokoinButtonScanState('scanning', button);
        
        // Hover effects follow the current scan state (red / green / muted blue)
        button.addEventListener('mouseenter', () => {
            if (this.vintedOverlayCollapsed) {
                return;
            }
            button.style.background = this.pokoinButtonScanHoverBackground();
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = this.pokoinButtonScanAppearance().boxShadow;
        });
        
        button.addEventListener('mouseleave', () => {
            if (this.vintedOverlayCollapsed) {
                button.style.transform = 'none';
                return;
            }
            button.style.background = this.pokoinButtonScanAppearance().background;
            button.style.transform = 'scale(1)';
            button.style.boxShadow = this.pokoinButtonScanAppearance().boxShadow;
        });
        
        if (header) {
            header.insertBefore(button, header.children?.[0] || null);
            this.renderVintedCollapseToggle();
        } else if (typeof panel.prepend === 'function') {
            panel.prepend(button);
        } else {
            panel.appendChild(button);
        }
        console.log(`✅ [VINT] Added compact panel button`);
        this.currentButton = button;
        this.attachVintedSidePanelClick(button);
        this.applyVintedOverlayCollapsedState();
    }

    createFixedPositionButton() {
        this.createVintedPanelButton(this.currentTitleElement);
    }

    /**
     * Alternate insertion method if primary method fails
     */
    createAlternativeButton(titleElement) {
        console.log('🔄 [VINT] Creating alternate button...');
        
        // Create gray button
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        button.setAttribute('data-pokemon-linker-fallback', 'true');
        this.setPokoinButtonLabel(button);
        button.style.cssText = `
            margin: 16px 0;
            padding: 12px 24px;
            font-size: 16px;
            min-width: 120px;
            font-family: Arial, sans-serif;
        `;
        this.applyPokoinButtonStyles(button, { background: '#6c757d' });
        
        // Hover effects (gray)
        button.addEventListener('mouseenter', () => {
            button.style.background = '#5a6268';
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = '#6c757d';
            button.style.transform = 'scale(1)';
            button.style.boxShadow = 'none';
        });
        
        // Insert after title
        if (titleElement.parentNode) {
            titleElement.parentNode.insertBefore(button, titleElement.nextSibling);
            console.log(`✅ [VINT] Added alternate button`);
            this.currentButton = button;
            this.attachVintedSidePanelClick(button);
        } else {
            console.log('⚠️ [VINT] Unable to insert alternate button');
        }
    }





    /**
     * Start observer to monitor button removal from DOM
     */
    startButtonObserver(button, titleElement) {
        console.log('🔍 [VINT] Starting observer to monitor button...');
        
        // Periodically check if button is still in DOM
        const checkInterval = setInterval(() => {
            if (!document.contains(button)) {
                console.log('⚠️ [VINT] Button removed from DOM, trying reinsertion...');
                clearInterval(checkInterval);
                
                // Wait briefly, then attempt reinsertion
                setTimeout(() => {
                    if (!document.querySelector('[data-pokemon-linker-button]')) {
                        console.log('🔄 [VINT] Reinserting gray button...');
                        this.createFallbackButton(titleElement);
                    }
                }, 500);
            }
        }, 200);
        
        // Stop observer after 30 seconds to avoid infinite loops
        setTimeout(() => {
            clearInterval(checkInterval);
            console.log('⏹️ [VINT] Observer stopped after 30 seconds');
        }, 30000);
    }

    /**
     * Update button using database results
     */
    updateButtonWithResults(results) {
        if (!this.currentButton) {
            console.log('⚠️ [VINT] No button to update');
            return;
        }
        
        console.log(`🔍 [VINT] Updating button with ${results.length} results`);
        console.log(`🔍 [VINT] First result:`, results[0]);
        
        const bestResult = results[0];
        
        // Ensure button is still in DOM
        if (!this.isVintedOwnedNodeConnected(this.currentButton)) {
            console.log('⚠️ [VINT] Button is no longer in DOM');
            return;
        }

        const applyResolvedButtonState = (button) => {
            button.removeAttribute('data-pokemon-linker-fallback');
            this.currentMatchCount = this.countPreviewCandidateMatches(results);
            this.setPokoinButtonLabel(button, this.currentMatchCount);
            this.setPokoinButtonScanState('ready', button);
        };
        
        // Update button
        if (this.currentButton.tagName === 'A') {
            // If this is a link element (replacement case), update content
            applyResolvedButtonState(this.currentButton);
        } else {
            applyResolvedButtonState(this.currentButton);
        }
        this.attachVintedSidePanelClick(this.currentButton);
        
        this.currentButton.addEventListener('mouseenter', () => {
            if (this.vintedOverlayCollapsed) {
                return;
            }
            this.currentButton.style.background = this.pokoinButtonScanHoverBackground();
            this.currentButton.style.transform = 'scale(1.05)';
            this.currentButton.style.boxShadow = this.pokoinButtonScanAppearance().boxShadow;
        });
        
        this.currentButton.addEventListener('mouseleave', () => {
            if (this.vintedOverlayCollapsed) {
                this.currentButton.style.transform = 'none';
                return;
            }
            this.currentButton.style.background = this.pokoinButtonScanAppearance().background;
            this.currentButton.style.transform = 'scale(1)';
            this.currentButton.style.boxShadow = this.pokoinButtonScanAppearance().boxShadow;
        });

        this.renderCandidatePreview(results);
        this.applyVintedOverlayCollapsedState();
        
        console.log(`✅ [VINT] Button updated successfully for: ${bestResult.name_en || bestResult.pokemon_name}`);
    }

    /**
     * Create Pokoin button for product page (legacy method)
     */
    createProductButton(titleElement, results) {
        console.log(`🔍 [VINT] Starting button creation with ${results.length} results`);
        console.log(`🔍 [VINT] First result:`, results[0]);
        
        // Create single Pokoin button
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        this.setPokoinButtonLabel(button);
        button.style.cssText = `
            margin: 16px 0;
            padding: 12px 24px;
            font-size: 16px;
            min-width: 120px;
            font-family: Arial, sans-serif;
        `;
        this.applyPokoinButtonStyles(button, { background: this.pokoinBlue() });
        
        // Add click handler with top-ranked result
        const bestResult = results[0];
        this.attachVintedSidePanelClick(button);
        
        // Hover effects
        button.addEventListener('mouseenter', () => {
            button.style.background = this.pokoinBlueHover();
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = this.pokoinBlue();
            button.style.transform = 'scale(1)';
            button.style.boxShadow = 'none';
        });
        
        // Insert after title
        console.log(`🔍 [VINT] Attempting button insertion after:`, titleElement);
        console.log(`🔍 [VINT] Parent node:`, titleElement.parentNode);
        
        if (titleElement.parentNode) {
            titleElement.parentNode.insertBefore(button, titleElement.nextSibling);
            console.log(`✅ [VINT] Added Pokoin button on product page for: ${bestResult.name_en || bestResult.pokemon_name}`);
            console.log(`✅ [VINT] Button inserted successfully in DOM`);
        } else {
            console.log('⚠️ [VINT] Unable to insert Pokoin button: parentNode not found');
        }
    }

    /**
     * Extract title info (delegates to `content.js`)
     */
    extractTitleInfo(title) {
        // Delegate to global function when available
        if (typeof window.extractTitleInfo === 'function') {
            console.log(`🔍 [VINT] Using global extractTitleInfo for: "${title}"`);
            return window.extractTitleInfo(title);
        }
        console.log(`⚠️ [VINT] Global extractTitleInfo unavailable, returning null`);
        return { pokemonName: null };
    }

    /**
     * Search database through the background service worker.
     */
    async searchCardInDatabase(titleInfo, title) {
        void titleInfo;
        return this.searchCardWithBackground(title);
    }

    /**
     * Generate Pokoin card link
     */
    generatePokoinLink(blueprintId) {
        return `https://pokoin.com/marketplace/en/cards/${blueprintId}`;
    }
}

// Export for global usage
window.VintedProcessor = VintedProcessor;

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (request?.action === 'pokoinRequestMatchTokens') {
            if (!String(window.location.hostname || '').includes('vinted')) {
                return undefined;
            }
            const processor = window.vintedProcessor;
            if (!processor || typeof processor.sendVintedTokensReady !== 'function') {
                sendResponse?.({ success: false });
                return false;
            }
            if (typeof processor.isVintedCataloguePage === 'function' && processor.isVintedCataloguePage()) {
                processor.notifyVintedIdlePage?.();
                sendResponse?.({ success: true, idle: true });
                return false;
            }
            const title = processor.currentTitle || document.title;
            processor.sendVintedTokensReady('service-worker-request');
            if (typeof processor.runVintedSearch === 'function' && title) {
                const titleInfo = typeof processor.extractTitleInfo === 'function'
                    ? processor.extractTitleInfo(title)
                    : {};
                void processor.runVintedSearch(titleInfo, title, 'service-worker-request');
            }
            sendResponse?.({ success: true });
            return false;
        }
        if (request?.action !== 'pokoinListingScanMerged') {
            return undefined;
        }
        const processor = window.vintedProcessor;
        if (!processor || typeof processor.applyVintedSearchResults !== 'function') {
            sendResponse?.({ success: false });
            return false;
        }
        const requestUrl = String(request.url || '').split('#')[0];
        const pageUrl = String(window.location.href || '').split('#')[0];
        if (requestUrl && pageUrl && requestUrl !== pageUrl) {
            sendResponse?.({ success: true, ignored: true });
            return false;
        }
        const clues = typeof processor.selectedKeywordLabels === 'function'
            ? processor.selectedKeywordLabels()
            : [];
        const signature = request.searchSignature
            || (typeof processor.buildVintedSearchSignature === 'function'
                ? processor.buildVintedSearchSignature(processor.currentTitle || document.title, clues)
                : '');
        const results = Array.isArray(request.results) ? request.results : [];
        if (request.listingKind) {
            processor.currentListingKind = request.listingKind;
        }
        if (signature) {
            processor.listingScanFinalSignatures?.add(signature);
            processor.searchResultsBySignature?.set(signature, results);
            processor.rememberRecentSearchResults?.(signature, results);
        }
        processor.latestSearchToken += 1;
        processor.applyVintedSearchResults(signature, results, {
            title: processor.currentTitle,
            trigger: 'listing-scan-merged',
        });
        sendResponse?.({ success: true, rowCount: results.length });
        return false;
    });
} 
