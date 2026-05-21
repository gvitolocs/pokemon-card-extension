/**
 * VINT.js - Vinted-specific processor
 * Simplified processor for single-card product pages.
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
        this.inFlightSearches = new Map();
        this.pendingSearchApplications = new Map();
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
        this.vintedOverlayCollapsed = false;
    }

    pokoinIconUrl() {
        return chrome.runtime.getURL('assets/pokoin-512.png');
    }

    setPokoinButtonLabel(button, matchCount = null) {
        const suffix = Number.isFinite(matchCount) ? ` (${matchCount})` : '';
        button.innerHTML = `
            <img src="${this.pokoinIconUrl()}" alt="" aria-hidden="true">
            <span>Pokoin.com${suffix}</span>
        `;
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

    pokoinBlue() {
        return '#0ea5e9';
    }

    pokoinBlueHover() {
        return '#0284c7';
    }

    normalizeClueValue(value = '') {
        return String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[’`]/g, "'")
            .replace(/\bvastro\b/gi, 'vstar')
            .replace(/[^a-z0-9/'\s-]+/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    compactClueValue(value = '') {
        return this.normalizeClueValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
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
        ]);
    }

    addKeywordCandidate(candidates, value, source = 'description') {
        let label = this.normalizeClueValue(value);
        label = label
            .replace(/\bex\b/gi, 'ex')
            .replace(/\bgx\b/gi, 'GX')
            .replace(/\bv\b/gi, 'V')
            .replace(/\bvmax\b/gi, 'VMAX')
            .replace(/\bvstar\b/gi, 'VSTAR');
        if (/\bset\s+base\b/i.test(label)) {
            label = label.replace(/\bset\s+base\b/gi, 'Base Set');
        }
        const compact = this.compactClueValue(label);
        const stopWords = this.vintedKeywordStopWords();
        const isVariation = this.isVariationClue(label);
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
        if (!label || compact.length < 3 || /\d/.test(label)) {
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
            return Boolean(resolvedName && this.compactClueValue(resolvedName) === compact);
        } catch (error) {
            console.warn('⚠️ [VINT] Unable to validate clue as Pokemon name:', error);
            return false;
        }
    }

    isVariationClue(value = '') {
        return /\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/i.test(this.normalizeClueValue(value));
    }

    vintedVariationCompacts() {
        return ['vmax', 'vstar', 'ex', 'gx', 'v', 'lvx', 'mega', 'radiant', 'shining', 'prime', 'break'];
    }

    resolvedPokemonNameFromClue(value = '') {
        if (typeof window.extractTitleInfo !== 'function') {
            return '';
        }

        try {
            const titleInfo = window.extractTitleInfo(this.normalizeClueValue(value)) || {};
            return titleInfo.pokemonName || titleInfo.name || '';
        } catch (error) {
            console.warn('⚠️ [VINT] Unable to resolve clue Pokemon name:', error);
            return '';
        }
    }

    hasAttachedVariationForName(name = '', sourceText = '') {
        const nameCompact = this.compactClueValue(name);
        const sourceCompact = this.compactClueValue(sourceText);
        if (!nameCompact || !sourceCompact) {
            return false;
        }

        return this.vintedVariationCompacts().some((variation) => sourceCompact.includes(`${nameCompact}${variation}`));
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
        return Boolean(
            labelCompact &&
            nameCompact &&
            labelCompact !== nameCompact &&
            this.vintedVariationCompacts().some((variation) =>
                labelCompact.endsWith(`${nameCompact}${variation}`)
            )
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
        const label = this.normalizeClueValue(value);
        return /\b(?:BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\b/i.test(label) ||
            /\b[A-Z]{1,6}\s?\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i.test(label) ||
            /\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i.test(label);
    }

    vintedExpansionAliases() {
        return [
            { pattern: /\bevoluzioni\b/i, label: 'Evolutions' },
        ];
    }

    isExpansionClue(value = '') {
        return this.isBaseSetClue(value) ||
            /\b(?:evolutions|evoluzioni|black\s+star\s+promos?|pokemon\s+151|evolving\s+skies|fusion\s+strike|paldean\s+fates|scarlet\s+violet|obsidian\s+flames|crown\s+zenith|chilling\s+reign|silver\s+tempest|brilliant\s+stars|astral\s+radiance)\b/i.test(this.normalizeClueValue(value));
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

    prepareVintedKeywordCandidates(candidates = [], sourceText = '') {
        const prepared = candidates
            .map((candidate, index) => {
                const nameLike = this.isPokemonNameLikeClue(candidate);
                const variation = this.isVariationClue(candidate.label || candidate.value);
                const baseSet = this.isBaseSetClue(candidate.label || candidate.value);
                const collectorNumber = this.isCollectorNumberClue(candidate.label || candidate.value);
                const expansion = this.isExpansionClue(candidate.label || candidate.value);
                const illustration = this.isIllustrationClue(candidate.label || candidate.value);
                const attachedNamePhrase = this.isAttachedNamePhraseClue(candidate);
                const selectedNameLike = nameLike && !this.hasAttachedVariationForName(candidate.label || candidate.value, sourceText);
                const selectedHighConfidenceContext =
                    (collectorNumber || expansion) &&
                    /^(?:title|title-pattern|title-expansion)$/.test(candidate.source || '') &&
                    this.sourceContainsClue(candidate.label || candidate.value, sourceText);
                return {
                    ...candidate,
                    nameLike,
                    variation,
                    baseSet,
                    collectorNumber,
                    expansion,
                    illustration,
                    attachedNamePhrase,
                    attachedVariation: false,
                    selectedByDefault: attachedNamePhrase || selectedNameLike || selectedHighConfidenceContext,
                    _index: index,
                };
            });

        const selectedAttachedVariations = new Set(
            prepared
                .filter((keyword) => keyword.attachedNamePhrase)
                .flatMap((keyword) => {
                    const compact = keyword.compact;
                    return this.vintedVariationCompacts().filter((variation) => compact.endsWith(variation));
                })
        );

        return prepared
            .map((keyword) => {
                const attachedVariation = keyword.variation && selectedAttachedVariations.has(keyword.compact);
                return {
                    ...keyword,
                    attachedVariation,
                    selectedByDefault: keyword.selectedByDefault || attachedVariation,
                };
            })
            .sort((left, right) => {
                if (left.selectedByDefault !== right.selectedByDefault) {
                    return left.selectedByDefault ? -1 : 1;
                }
                if (left.attachedNamePhrase !== right.attachedNamePhrase) {
                    return left.attachedNamePhrase ? -1 : 1;
                }
                if (left.attachedVariation !== right.attachedVariation) {
                    return left.attachedVariation ? -1 : 1;
                }
                return left._index - right._index;
            })
            .slice(0, 10)
            .map(({ _index, ...keyword }) => keyword);
    }

    extractVintedDescription() {
        const selectors = [
            '[data-testid="item-description"]',
            '[data-testid="item-description"] p',
            '[itemprop="description"]',
            '[data-testid="item-page-description"]',
            '[data-testid="item-details-description"]',
            '[data-testid="item-details"] [class*="description"]',
            '[class*="item-description"]',
            '[class*="description"]',
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

    extractVintedKeywords(title = '', description = '') {
        const sourceText = `${title} ${description}`.replace(/\s+/g, ' ').trim();
        if (!sourceText) {
            return [];
        }

        const candidates = [];
        const expansionHints = [
            'Base Set', 'Base Set 2', 'Base Set Shadowless', 'Jungle', 'Fossil', 'Team Rocket',
            'Evolutions',
            'Legendary Treasures', 'Black Star Promos', 'Evolving Skies', 'Fusion Strike',
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
        const hasFullArtHint = /\bfull\s*-?\s*art\b|\bfullart\b/i.test(sourceText);
        if (hasFullArtHint) {
            this.addKeywordCandidate(candidates, 'illustration', 'rarity');
        }

        const cluePatterns = [
            /\b(?:BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\b/gi,
            /\b[A-Z]{1,6}\s?\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/gi,
            /\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/gi,
            /\b(?:special illustration rare|illustration rare|secret rare|ultra rare|holo rare|reverse holo|holo|promo|rare)\b/gi,
            /\b(?:vmax|vstar|vastro|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi,
        ];
        cluePatterns.forEach((pattern) => {
            for (const match of title.matchAll(pattern)) {
                this.addKeywordCandidate(candidates, match[0].replace(/\s+/g, ' '), 'title-pattern');
            }
            for (const match of description.matchAll(pattern)) {
                this.addKeywordCandidate(candidates, match[0].replace(/\s+/g, ' '), 'pattern');
            }
        });

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

        for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
            for (let index = 0; index <= words.length - size; index += 1) {
                const phrase = words.slice(index, index + size).join(' ');
                if (phrase.length >= 3 && !/^\d+$/.test(phrase)) {
                    this.addKeywordCandidate(candidates, phrase, 'text');
                }
            }
        }

        return this.prepareVintedKeywordCandidates(candidates, sourceText);
    }

    selectedKeywordLabels() {
        return this.currentKeywords
            .filter((keyword) => this.selectedKeywordValues.has(keyword.compact))
            .map((keyword) => keyword.value);
    }

    selectedPrimaryClues(clues = this.selectedKeywordLabels()) {
        const selectedCompacts = new Set(
            this.currentKeywords
                .filter((keyword) => this.selectedKeywordValues.has(keyword.compact))
                .filter((keyword) => keyword.nameLike || keyword.attachedNamePhrase || keyword.attachedVariation)
                .map((keyword) => keyword.compact)
        );

        return clues.filter((clue) => selectedCompacts.has(this.compactClueValue(clue)));
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
            timestamp: Date.now(),
        };
        this.vintedDiagnostics.push(entry);
        if (this.vintedDiagnostics.length > 80) {
            this.vintedDiagnostics.shift();
        }
        window.__pokoinVintedDiagnostics = this.vintedDiagnostics;
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
        return [
            this.currentVintedListingKey(),
            this.compactClueValue(this.buildVintedSearchTitle(title, clues)),
            selectedClues.join(','),
            primaryClues.join(','),
        ].join('|');
    }

    resetVintedListingState(nextListingKey) {
        if (this.currentPanelHost?.remove) {
            this.currentPanelHost.remove();
        }
        this.currentListingKey = nextListingKey;
        this.currentPanel = null;
        this.currentPanelHost = null;
        this.currentButton = null;
        this.currentKeywords = [];
        this.selectedKeywordValues = new Set();
        this.latestSearchToken += 1;
        this.lastAppliedSearchSignature = '';
        this.searchResultsBySignature.clear();
        this.inFlightSearches.clear();
        this.pendingSearchApplications.clear();
        this.recordVintedDiagnostic('listing-reset', {
            listingKey: nextListingKey,
            reason: 'stable listing URL changed',
        });
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
        const searchParts = primaryClues.length > 0
            ? [...searchPrimaryClues, ...expansionClues, ...collectorNumberClues, ...illustrationClues, ...additionalVariationClues]
            : [this.removeVintedMarketplaceNoise(title), ...clues];

        return searchParts
            .map((part) => this.removeVintedMarketplaceNoise(part))
            .filter(Boolean)
            .filter((part) => !includedByLongerPrimary(part))
            .filter((part, index, all) => all.findIndex((candidate) => this.compactClueValue(candidate) === this.compactClueValue(part)) === index)
            .join(' ');
    }

    compactCandidateMeta(result = {}) {
        const rawNumber = String(result.collector_number || result.card_number || result.collectorNumber || '')
            .trim();
        const number = rawNumber
            .match(/\b(?:[A-Z]{1,6}\s?)?(\d{1,4}[a-z]?)(?:\s*\/\s*\d{1,4}[a-z]?)?\b/i)?.[1] || '';
        const setName = result.expansion_name_en || result.expansionName || result.set_name || result.setName || '';
        const price = result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '';
        return [number || rawNumber, setName, price].filter(Boolean).join(' · ');
    }

    currentPreviewResults() {
        const signature = this.buildVintedSearchSignature(this.currentTitle);
        const results = this.searchResultsBySignature.get(signature) || this.pendingSearchApplications.get(signature) || [];
        return Array.isArray(results) ? results : [];
    }

    vintedPanelRoot(panel = this.currentPanel) {
        return panel?.shadowRoot || panel;
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
        if (toggle) {
            toggle.textContent = collapsed ? 'Show' : 'Hide';
            toggle.setAttribute?.('aria-expanded', collapsed ? 'false' : 'true');
            toggle.setAttribute?.('aria-label', collapsed ? 'Expand Pokoin Vinted overlay' : 'Collapse Pokoin Vinted overlay');
        }
    }

    setVintedOverlayCollapsed(collapsed) {
        this.vintedOverlayCollapsed = Boolean(collapsed);
        this.applyVintedOverlayCollapsedState();
    }

    renderVintedCollapseToggle() {
        const root = this.vintedPanelRoot();
        if (!root || root.querySelector?.('[data-pokoin-vinted-collapse-toggle]')) {
            this.applyVintedOverlayCollapsedState();
            return;
        }

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.setAttribute('data-pokoin-vinted-collapse-toggle', 'true');
        toggle.style.cssText = `
            align-self: flex-end;
            padding: 5px 9px;
            border: 1px solid rgba(148, 163, 184, 0.45);
            border-radius: 999px;
            background: rgba(15, 23, 42, 0.72);
            color: #e0f2fe;
            font-size: 11px;
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

        const panel = this.currentPanel;
        if (typeof panel?.prepend === 'function') {
            panel.prepend(toggle);
        } else {
            panel?.appendChild(toggle);
        }
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
        if (!this.isVintedOwnedNodeConnected(this.currentButton) || results.length === 0) {
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

        results.slice(0, 8).forEach((result) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.setAttribute('data-pokoin-candidate-row', 'true');
            row.setAttribute('aria-label', `Open ${this.compactCandidateMeta(result) || 'candidate'} in Pokoin side panel`);
            row.style.cssText = `
                display: grid;
                grid-template-columns: 1fr;
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
            row.innerHTML = `
                <span style="display:block;color:#f8fafc;font-size:13px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.compactCandidateMeta(result) || 'Candidate'}</span>
            `;
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
                source: result.source || 'vinted_overlay',
                search_rank: result.search_rank || result.searchScore || result.search_score || result.relevanceScore || result.score || '',
                pokoin_price: result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '',
            },
        };
    }

    buildSidePanelPreviewRowsPayload(results = this.currentPreviewResults()) {
        const rows = (Array.isArray(results) ? results : [])
            .slice(0, 8)
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
                    source: result.source || 'vinted_overlay_preview',
                    search_rank: result.search_rank || result.searchScore || result.search_score || result.relevanceScore || result.score || '',
                    pokoin_price: result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '',
                };
            })
            .filter(Boolean);
        return rows.length > 0 ? { previewRows: rows } : {};
    }

    openPokoinSidePanel(candidate = null) {
        const clues = this.selectedKeywordLabels();
        const primaryClues = this.selectedPrimaryClues(clues);
        const message = {
            action: 'openSidePanelForCurrentTab',
            url: window.location.href,
            title: this.buildVintedSearchTitle(this.currentTitle || document.title, clues),
            originalTitle: this.currentTitle || document.title,
            clues,
            primaryClues,
            previewSignature: this.buildVintedSearchSignature(this.currentTitle || document.title, clues),
            ...this.buildSidePanelPreviewRowsPayload(),
            ...this.buildSidePanelCandidatePayload(candidate || {}),
        };
        return Promise.resolve(chrome.runtime.sendMessage(message)).catch((error) => {
            console.warn('⚠️ [VINT] Unable to open side panel:', error);
        });
    }

    async searchCardWithBackground(title, clues = this.selectedKeywordLabels()) {
        const signature = this.buildVintedSearchSignature(title, clues);
        if (this.searchResultsBySignature.has(signature)) {
            this.recordVintedDiagnostic('search-skip', {
                searchSignature: signature,
                skippedDuplicateReason: 'cached-results',
                hasCachedResults: true,
                title,
            });
            return this.searchResultsBySignature.get(signature);
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
        const requestUrl = window.location.href;
        this.recordVintedDiagnostic('search-start', {
            searchSignature: signature,
            trigger: 'background-preview',
            title,
        });
        const searchPromise = chrome.runtime.sendMessage({
            action: 'searchCardForTitle',
            title: this.buildVintedSearchTitle(title, clues),
            originalTitle: title,
            clues,
            primaryClues,
            url: requestUrl,
        }).then((response) => {
            const results = response?.success && Array.isArray(response.results) ? response.results : [];
            this.searchResultsBySignature.set(signature, results);
            this.recordVintedDiagnostic('search-complete', {
                searchSignature: signature,
                reason: `${results.length} result(s)`,
                hasCachedResults: true,
                title,
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
            pointerEvents: 'auto',
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
                pointer-events: auto;
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
            img {
                max-width: none;
            }
        `;
    }

    vintedFallbackPanelStyles() {
        return {
            position: 'fixed',
            left: '16px',
            top: '48px',
            bottom: '24px',
            right: 'auto',
            zIndex: '2147483647',
            width: 'min(320px, calc(100vw - 32px))',
            maxWidth: '320px',
            maxHeight: 'calc(100vh - 72px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '8px',
            pointerEvents: 'auto',
            fontFamily: 'Arial, sans-serif',
            opacity: '0.96',
        };
    }

    vintedFloatingPanelStyles() {
        return this.vintedFallbackPanelStyles();
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
        document.body.appendChild(host);
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
            Object.assign(icon.style, {
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                objectFit: 'cover',
                display: 'block',
            });
        }
    }

    attachVintedSidePanelClick(button) {
        if (!button) {
            return;
        }
        if (button.__pokoinVintedSidePanelClickAttached) {
            return;
        }
        button.__pokoinVintedSidePanelClickAttached = true;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            this.openPokoinSidePanel();
        }, true);
    }

    /**
     * Initialize Vinted processor
     */
    init() {
        console.log('🟢 [VINT] Initializing Vinted processor...');
        this.startVintedNavigationObserver();
        
        if (this.isProductPage()) {
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
        const hasItemPath = window.location.pathname.includes('/item/') || window.location.pathname.includes('/items/');
        const hasItemTitle = document.querySelector('[data-testid="item-title"]') || document.querySelector('h1');
        
        const result = {
            isVinted,
            hasItemPath,
            hasItemTitle: !!hasItemTitle,
            pathname: window.location.pathname
        };
        
        console.log('🔍 [VINT] Product page check:', result);
        
        return isVinted && (hasItemPath || hasItemTitle);
    }

    scheduleVintedPageProcess() {
        if (this.vintedNavigationTimer || typeof setTimeout !== 'function') {
            return;
        }

        this.vintedNavigationTimer = setTimeout(() => {
            this.vintedNavigationTimer = null;
            if (this.isProductPage()) {
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

        window.addEventListener('pokoin:vinted-navigation', () => this.scheduleVintedPageProcess());
        this.vintedNavigationObserver = new MutationObserver(() => this.scheduleVintedPageProcess());
        this.vintedNavigationObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }

    /**
     * Process Vinted product page
     */
    processProductPage() {
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
            this.prepareVintedKeywords(searchSource.title, searchSource.description);
            const titleInfo = this.extractTitleInfo(searchSource.title);
            this.runVintedSearch(titleInfo, searchSource.title, 'product-data');

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
                this.runVintedSearch(this.extractTitleInfo(this.buildVintedSearchTitle(this.currentTitle)), this.currentTitle, 'keyword-toggle');
            });
            container.appendChild(chip);
        });

        this.ensureVintedPanel(this.currentTitleElement).appendChild(container);
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
        const clues = this.selectedKeywordLabels();
        const searchSignature = this.buildVintedSearchSignature(title, clues);
        if (searchSignature === this.lastAppliedSearchSignature && this.searchResultsBySignature.has(searchSignature)) {
            this.recordVintedDiagnostic('search-skip', {
                searchSignature,
                trigger,
                skippedDuplicateReason: 'already applied',
                hasCachedResults: true,
                title,
            });
            return;
        }

        const searchToken = ++this.latestSearchToken;
        void titleInfo;
        const backgroundResults = await this.searchCardWithBackground(title, clues);

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
        });
        if (results.length > 0) {
            this.updateButtonWithResults(results);
        } else {
            this.updateButtonWithoutResults();
        }
        return true;
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
        this.setPokoinButtonLabel(this.currentButton);
        this.currentButton.setAttribute('data-pokemon-linker-fallback', 'true');
        this.applyPokoinButtonStyles(this.currentButton, {
            background: '#075985',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.18)',
        });
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
        
        // Create gray fixed-position button
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        button.setAttribute('data-pokemon-linker-fallback', 'true');
        this.setPokoinButtonLabel(button);
        button.style.cssText = `
            width: 100%;
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
        
        // Hover effects (gray)
        button.addEventListener('mouseenter', () => {
            button.style.background = '#0369a1';
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 6px 16px rgba(2, 132, 199, 0.28)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = '#075985';
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 12px rgba(2, 132, 199, 0.18)';
        });
        
        if (typeof panel.prepend === 'function') {
            panel.prepend(button);
        } else {
            panel.appendChild(button);
        }
        console.log(`✅ [VINT] Added compact panel button`);
        this.currentButton = button;
        this.attachVintedSidePanelClick(button);
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
            this.setPokoinButtonLabel(button, this.countHighConfidenceMatches(results));
            this.applyPokoinButtonStyles(button, {
                background: this.pokoinBlue(),
                color: '#ffffff',
                border: '2px solid #38bdf8',
                boxShadow: '0 4px 12px rgba(14, 165, 233, 0.35)',
            });
        };
        
        // Update button
        if (this.currentButton.tagName === 'A') {
            // If this is a link element (replacement case), update content
            this.currentButton.innerHTML = `
                <span class="web_ui__Button__content">
                    <span class="web_ui__Button__label">
                        <img src="${this.pokoinIconUrl()}" alt="" aria-hidden="true" style="width:22px;height:22px;border-radius:50%;object-fit:cover;margin-right:8px;vertical-align:middle;">
                        Pokoin.com (${this.countHighConfidenceMatches(results)})
                    </span>
                </span>
            `;
            this.applyPokoinButtonStyles(this.currentButton, {
                background: this.pokoinBlue(),
                color: '#ffffff',
                border: '2px solid #38bdf8',
                boxShadow: '0 4px 12px rgba(14, 165, 233, 0.35)',
            });
        } else {
            applyResolvedButtonState(this.currentButton);
        }
        this.attachVintedSidePanelClick(this.currentButton);
        
        // Hover effects (blue)
        this.currentButton.addEventListener('mouseenter', () => {
            this.currentButton.style.background = this.pokoinBlueHover();
            this.currentButton.style.transform = 'scale(1.05)';
            this.currentButton.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        });
        
        this.currentButton.addEventListener('mouseleave', () => {
            this.currentButton.style.background = this.pokoinBlue();
            this.currentButton.style.transform = 'scale(1)';
            this.currentButton.style.boxShadow = 'none';
        });

        this.renderCandidatePreview(results);
        
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
     * Search database (delegates to `content.js`)
     */
    async searchCardInDatabase(titleInfo, title) {
        // Delegate to global function when available
        if (typeof window.searchCardInDatabase === 'function') {
            console.log(`🔍 [VINT] Using global searchCardInDatabase for: "${title}"`);
            console.log(`🔍 [VINT] Sent parameters:`, { titleInfo, title });
            
            try {
                const results = await window.searchCardInDatabase(titleInfo, title);
                console.log(`🔍 [VINT] Results received from global function:`, results);
                console.log(`🔍 [VINT] Result type:`, typeof results);
                console.log(`🔍 [VINT] Result length:`, results ? results.length : 'null/undefined');
                return results;
            } catch (error) {
                console.warn(`⚠️ [VINT] Global searchCardInDatabase unavailable:`, error);
                return [];
            }
        }
        console.log(`⚠️ [VINT] Global searchCardInDatabase unavailable, returning empty array`);
        return [];
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