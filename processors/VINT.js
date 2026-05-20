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
        this.vintedProcessAttempts = new Map();
        this.vintedProcessRetryDelayMs = 500;
        this.vintedProcessMaxRetries = 10;
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

    normalizeClueValue(value = '') {
        return String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[’`]/g, "'")
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
            'vendo', 'vendita', 'spedizione', 'scambio', 'lotto', 'lot', 'bundle',
            'originale', 'original', 'italiano', 'italiana', 'inglese', 'english', 'japanese', 'giapponese',
        ]);
    }

    addKeywordCandidate(candidates, value, source = 'description') {
        const label = this.normalizeClueValue(value);
        const compact = this.compactClueValue(label);
        const stopWords = this.vintedKeywordStopWords();
        if (!label || compact.length < 2 || stopWords.has(label.toLowerCase()) || stopWords.has(compact)) {
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

    prepareVintedKeywordCandidates(candidates = []) {
        return candidates
            .map((candidate, index) => {
                const nameLike = this.isPokemonNameLikeClue(candidate);
                return {
                    ...candidate,
                    nameLike,
                    selectedByDefault: nameLike,
                    _index: index,
                };
            })
            .sort((left, right) => {
                if (left.selectedByDefault !== right.selectedByDefault) {
                    return left.selectedByDefault ? -1 : 1;
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
            'Legendary Treasures', 'Black Star Promos', 'Evolving Skies', 'Fusion Strike',
            'Paldean Fates', 'Pokemon 151', 'Scarlet Violet', 'Obsidian Flames', 'Crown Zenith',
            'Chilling Reign', 'Silver Tempest', 'Brilliant Stars', 'Astral Radiance',
        ];
        expansionHints.forEach((hint) => {
            if (new RegExp(`\\b${hint.replace(/\s+/g, '\\s+')}\\b`, 'i').test(sourceText)) {
                this.addKeywordCandidate(candidates, hint, 'expansion');
            }
        });

        const cluePatterns = [
            /\b(?:BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\b/gi,
            /\b[A-Z]{1,6}\s?\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/gi,
            /\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/gi,
            /\b(?:special illustration rare|illustration rare|secret rare|ultra rare|holo rare|reverse holo|holo|promo|rare)\b/gi,
            /\b(?:vmax|vstar|ex|gx|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi,
        ];
        cluePatterns.forEach((pattern) => {
            for (const match of sourceText.matchAll(pattern)) {
                this.addKeywordCandidate(candidates, match[0].replace(/\s+/g, ' '), 'pattern');
            }
        });

        const normalized = sourceText
            .replace(/[()"'’`.,:;!?\\[\]{}|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const words = normalized
            .split(/\s+/)
            .map((word) => this.normalizeClueValue(word))
            .filter((word) => word && !this.vintedKeywordStopWords().has(word.toLowerCase()));

        for (let size = Math.min(2, words.length); size >= 1; size -= 1) {
            for (let index = 0; index <= words.length - size; index += 1) {
                const phrase = words.slice(index, index + size).join(' ');
                if (phrase.length >= 3 && !/^\d+$/.test(phrase)) {
                    this.addKeywordCandidate(candidates, phrase, 'text');
                }
            }
        }

        return this.prepareVintedKeywordCandidates(candidates);
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
                .filter((keyword) => keyword.nameLike)
                .map((keyword) => keyword.compact)
        );

        return clues.filter((clue) => selectedCompacts.has(this.compactClueValue(clue)));
    }

    buildVintedSearchTitle(title = this.currentTitle, clues = this.selectedKeywordLabels()) {
        const primaryClues = this.selectedPrimaryClues(clues);
        const searchParts = primaryClues.length > 0
            ? primaryClues
            : [this.removeVintedMarketplaceNoise(title), ...clues];

        return searchParts
            .map((part) => this.removeVintedMarketplaceNoise(part))
            .filter(Boolean)
            .filter((part, index, all) => all.findIndex((candidate) => this.compactClueValue(candidate) === this.compactClueValue(part)) === index)
            .join(' ');
    }

    compactCandidateMeta(result = {}) {
        const number = String(result.collector_number || result.card_number || '')
            .match(/\b(?:[A-Z]{1,6}\s?)?(\d{1,4}[a-z]?)(?:\s*\/\s*\d{1,4}[a-z]?)?\b/i)?.[1] || '';
        const setName = result.expansion_name_en || result.set_name || '';
        const setShort = String(setName)
            .replace(/\b(?:and|of|the|a|an)\b/gi, ' ')
            .split(/\s+/)
            .map((part) => part[0])
            .join('')
            .toUpperCase();
        return [number, setShort || setName].filter(Boolean).join(' · ');
    }

    renderCandidatePreview(results = []) {
        document.querySelectorAll('[data-pokoin-candidate-preview]').forEach((element) => element.remove());
        if (!this.currentButton || !document.contains(this.currentButton) || results.length === 0) {
            return;
        }

        const panel = this.currentButton.closest?.('[data-pokoin-vinted-panel]');
        const preview = document.createElement('div');
        preview.setAttribute('data-pokoin-candidate-preview', 'true');
        preview.style.cssText = `
            width: 100%;
            padding: 12px;
            border: 1px solid rgba(56, 189, 248, 0.35);
            border-radius: 16px;
            background: rgba(7, 17, 31, 0.94);
            color: #f8fafc;
            box-shadow: 0 18px 42px rgba(2, 6, 23, 0.35);
            font-family: Arial, sans-serif;
        `;

        results.slice(0, 8).forEach((result) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.style.cssText = `
                display: grid;
                grid-template-columns: 1fr;
                width: 100%;
                padding: 8px 0;
                border: 0;
                border-top: 1px solid rgba(148, 163, 184, 0.18);
                background: transparent;
                color: inherit;
                text-align: left;
                cursor: pointer;
            `;
            row.innerHTML = `
                <strong style="display:block;font-size:13px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${result.name_en || result.pokemon_name || 'Candidate'}</strong>
                <span style="display:block;margin-top:3px;color:#94a3b8;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.compactCandidateMeta(result)}</span>
            `;
            row.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.openPokoinSidePanel();
            });
            preview.appendChild(row);
        });

        if (panel) {
            panel.appendChild(preview);
        } else {
            document.body.appendChild(preview);
        }
    }

    openPokoinSidePanel() {
        const clues = this.selectedKeywordLabels();
        const primaryClues = this.selectedPrimaryClues(clues);
        return chrome.runtime.sendMessage({
            action: 'openSidePanelForCurrentTab',
            url: window.location.href,
            title: this.buildVintedSearchTitle(this.currentTitle || document.title, clues),
            originalTitle: this.currentTitle || document.title,
            clues,
            primaryClues,
        }).catch((error) => {
            console.warn('⚠️ [VINT] Unable to open side panel:', error);
        });
    }

    async searchCardWithBackground(title, clues = this.selectedKeywordLabels()) {
        const primaryClues = this.selectedPrimaryClues(clues);
        const response = await chrome.runtime.sendMessage({
            action: 'searchCardForTitle',
            title: this.buildVintedSearchTitle(title, clues),
            originalTitle: title,
            clues,
            primaryClues,
            url: window.location.href,
        });
        return response?.success && Array.isArray(response.results) ? response.results : [];
    }

    vintedInsertedPanelStyles() {
        return {
            position: 'static',
            width: '100%',
            maxWidth: '420px',
            margin: '12px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '8px',
            pointerEvents: 'auto',
            fontFamily: 'Arial, sans-serif',
        };
    }

    vintedFallbackPanelStyles() {
        return {
            position: 'fixed',
            left: '16px',
            bottom: '16px',
            right: 'auto',
            top: 'auto',
            zIndex: '9999',
            width: 'min(280px, calc(100vw - 32px))',
            maxWidth: '280px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '8px',
            pointerEvents: 'auto',
            fontFamily: 'Arial, sans-serif',
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

    insertVintedPanelNearDetails(panel, titleElement) {
        const detailsContainer = this.findVintedDetailsContainer(titleElement);
        if (!detailsContainer) {
            return false;
        }

        Object.assign(panel.style, this.vintedInsertedPanelStyles());
        panel.setAttribute('data-pokoin-vinted-placement', 'anchored');

        const actionArea = this.findVintedActionArea(detailsContainer);
        if (actionArea?.parentNode === detailsContainer) {
            detailsContainer.insertBefore(panel, actionArea);
            return true;
        }

        if (titleElement?.parentNode === detailsContainer && titleElement.nextSibling) {
            detailsContainer.insertBefore(panel, titleElement.nextSibling);
            return true;
        }

        if (titleElement?.parentNode === detailsContainer) {
            detailsContainer.appendChild(panel);
            return true;
        }

        detailsContainer.appendChild(panel);
        return true;
    }

    ensureVintedPanel(titleElement = this.currentTitleElement) {
        let panel = this.currentPanel || document.querySelector?.('[data-pokoin-vinted-panel]');
        if (!panel) {
            panel = document.createElement('div');
            panel.setAttribute('data-pokoin-vinted-panel', 'true');
            if (!this.insertVintedPanelNearDetails(panel, titleElement)) {
                Object.assign(panel.style, this.vintedFallbackPanelStyles());
                panel.setAttribute('data-pokoin-vinted-placement', 'fallback-fixed');
                document.body.appendChild(panel);
            }
        }
        this.currentPanel = panel;
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
            background: '#0ea5e9',
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

    /**
     * Initialize Vinted processor
     */
    init() {
        console.log('🟢 [VINT] Initializing Vinted processor...');
        
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

    /**
     * Process Vinted product page
     */
    processProductPage() {
        if (this.processedPages.has(window.location.href)) {
            console.log('🚫 [VINT] Product page already processed, skipping');
            return;
        }

        try {
            console.log('🔍 [VINT] Processing Vinted product page...');
            
            const { titleElement, title, detailsContainer } = this.resolveVintedProductAnchor();
            if (!titleElement) {
                this.scheduleVintedProductRetry('safe item title not found');
                return;
            }
            
            if (!title) {
                this.scheduleVintedProductRetry('item title is empty');
                return;
            }

            if (!detailsContainer && this.hasVintedRetryBudget()) {
                this.scheduleVintedProductRetry('item details block not ready');
                return;
            }
            
            console.log(`🔍 [VINT] Product title: "${title}"`);
            this.currentTitle = title;
            this.currentTitleElement = titleElement;
            
            // Extract title information
            const titleInfo = this.extractTitleInfo(title);
            
            // Always create a gray fallback button (even for non-Pokemon titles)
            console.log('🔍 [VINT] Creating gray fallback button...');
            this.createFallbackButton(titleElement);
            this.renderKeywordToggles(title, this.extractVintedDescription());
            
            this.runVintedSearch(titleInfo, title);
            
            // Mark page as processed
            this.processedPages.add(window.location.href);
            
        } catch (error) {
            console.error('❌ [VINT] Error while processing product page:', error);
        }
    }

    renderKeywordToggles(title, description) {
        document.querySelectorAll('[data-pokoin-vinted-keywords]').forEach((element) => element.remove());
        this.currentKeywords = this.extractVintedKeywords(title, description);
        this.selectedKeywordValues = new Set(
            this.currentKeywords
                .filter((keyword) => keyword.selectedByDefault)
                .map((keyword) => keyword.compact)
        );
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
                this.runVintedSearch(this.extractTitleInfo(this.buildVintedSearchTitle(this.currentTitle)), this.currentTitle);
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

    async runVintedSearch(titleInfo, title) {
        const searchToken = ++this.latestSearchToken;
        void titleInfo;
        const backgroundResults = await this.searchCardWithBackground(title);

        if (searchToken !== this.latestSearchToken) {
            return;
        }

        if (backgroundResults.length > 0) {
            this.updateButtonWithResults(backgroundResults);
        } else {
            this.updateButtonWithoutResults();
        }
    }

    updateButtonWithoutResults() {
        if (!this.currentButton || !document.contains(this.currentButton)) {
            return;
        }
        this.setPokoinButtonLabel(this.currentButton);
        this.currentButton.setAttribute('data-pokemon-linker-fallback', 'true');
        this.applyPokoinButtonStyles(this.currentButton, { background: '#6c757d' });
        this.renderCandidatePreview([]);
    }

    /**
     * Create gray fallback button
     */
    createFallbackButton(titleElement) {
        console.log(`🔍 [VINT] Creating Pokoin action panel near Vinted item details`);
        this.createVintedPanelButton(titleElement);
    }



    /**
     * Create fixed top-right button
     */
    createVintedPanelButton(titleElement = this.currentTitleElement) {
        console.log('🔄 [VINT] Creating compact Vinted action panel...');
        
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
        this.applyPokoinButtonStyles(button, { background: '#6c757d' });
        
        // Hover effects (gray)
        button.addEventListener('mouseenter', () => {
            button.style.background = '#5a6268';
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = '#6c757d';
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        });
        
        const panel = this.ensureVintedPanel(titleElement);
        if (typeof panel.prepend === 'function') {
            panel.prepend(button);
        } else {
            panel.appendChild(button);
        }
        console.log(`✅ [VINT] Added compact panel button`);
        this.currentButton = button;
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openPokoinSidePanel();
        });
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
        if (!document.contains(this.currentButton)) {
            console.log('⚠️ [VINT] Button is no longer in DOM');
            return;
        }

        const applyResolvedButtonState = (button) => {
            button.removeAttribute('data-pokemon-linker-fallback');
            this.setPokoinButtonLabel(button, this.countHighConfidenceMatches(results));
            this.applyPokoinButtonStyles(button, {
                background: '#28a745',
                color: '#ffffff',
                border: '2px solid #16a34a',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.35)',
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
                background: '#28a745',
                color: '#ffffff',
                border: '2px solid #16a34a',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.35)',
            });
        } else {
            applyResolvedButtonState(this.currentButton);
        }
        
        // Remove previous listeners by cloning the button
        const newButton = this.currentButton.cloneNode(true);
        this.currentButton.parentNode.replaceChild(newButton, this.currentButton);
        this.currentButton = newButton;
        applyResolvedButtonState(this.currentButton);
        
        // Add click handler
        this.currentButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openPokoinSidePanel();
        });
        
        // Hover effects (green)
        this.currentButton.addEventListener('mouseenter', () => {
            this.currentButton.style.background = '#218838';
            this.currentButton.style.transform = 'scale(1.05)';
            this.currentButton.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        });
        
        this.currentButton.addEventListener('mouseleave', () => {
            this.currentButton.style.background = '#28a745';
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
        this.applyPokoinButtonStyles(button, { background: '#28a745' });
        
        // Add click handler with top-ranked result
        const bestResult = results[0];
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openPokoinSidePanel();
        });
        
        // Hover effects
        button.addEventListener('mouseenter', () => {
            button.style.background = '#218838';
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = '#28a745';
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