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
    }

    pokoinIconUrl() {
        return chrome.runtime.getURL('assets/pokoin-512.png');
    }

    setPokoinButtonLabel(button, matchCount = null) {
        const suffix = Number.isFinite(matchCount) ? ` (${matchCount})` : '';
        button.innerHTML = `
            <img data-pokoin-button-icon="true" src="${this.pokoinIconUrl()}" alt="" aria-hidden="true" style="width:20px;height:20px;min-width:20px;min-height:20px;max-width:20px;max-height:20px;flex:0 0 20px;border-radius:50%;object-fit:cover;display:block;">
            <span>Pokoin.com${suffix}</span>
        `;
        this.applyPokoinButtonStyles(button);
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
            .replace(/[^a-z0-9/'\s-]+/gi, (match) => match.includes('/') ? '/' : ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    compactClueValue(value = '') {
        return this.normalizeClueValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
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
            { pattern: /\bsteam\s*(?:siege|\.\.\.)?\b/i, name: 'Steam Siege' },
            { pattern: /\bfates\s+collide\b/i, name: 'Fates Collide' },
            { pattern: /\bbreakpoint\b/i, name: 'BREAKpoint' },
            { pattern: /\bbreakthrough\b/i, name: 'BREAKthrough' },
            { pattern: /\bevolutions\b|\bevoluzioni\b/i, name: 'Evolutions' },
            { pattern: /\bbase\s+set\b|\bset\s+base\b/i, name: 'Base Set' },
        ];
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

    numericCollectorNumber(value = '') {
        return this.normalizeClueValue(value).match(/\b(\d{1,4}[a-z]?)(?:\/\d{1,4}[a-z]?)?\b/i)?.[1] || '';
    }

    extractVariation(titleInfo = {}, text = '') {
        const variation = titleInfo.cardType ||
            (titleInfo.isEXCard ? 'ex' : '') ||
            (titleInfo.isGXCard ? 'gx' : '') ||
            (titleInfo.isVSTARCard ? 'vstar' : '') ||
            (titleInfo.isVCard ? 'v' : '') ||
            (text.match(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/i)?.[0] || '');
        return String(variation || '').replace(/\s+/g, '').replace(/\./g, '').toLowerCase();
    }

    extractExpansion(titleInfo = {}, text = '') {
        const explicitExpansion = titleInfo.expansion || titleInfo.expansionName || '';
        if (explicitExpansion) {
            return explicitExpansion;
        }
        return this.knownExpansionAliases().find(({ pattern }) => pattern.test(text))?.name || '';
    }

    extractCollectorNumber(titleInfo = {}, text = '') {
        return (
            text.match(/\b(?:BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\b/i)?.[0] ||
            text.match(/\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i)?.[0] ||
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
        const withoutVariation = firstSegment
            .replace(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return this.normalizeTargetedNameAlias(withoutVariation) || withoutVariation;
    }

    buildEbayPayload(title = document.title, titleInfo = this.extractTitleInfo(title), details = this.extractEbayDetails()) {
        const evidence = [title, details].filter(Boolean).join(' ');
        const name = this.extractName(titleInfo, title);
        const variation = this.extractVariation(titleInfo, evidence);
        const collectorNumber = this.extractCollectorNumber(titleInfo, evidence);
        const expansion = this.extractExpansion(titleInfo, evidence);
        const features = [];
        const rarity = /\b(?:special illustration rare|illustration rare|illustration|full\s*-?\s*art|fullart)\b/i.test(evidence)
            ? 'illustration'
            : (titleInfo.rarity || '');
        if (rarity) {
            features.push(rarity);
        }
        const selectedClues = [
            [name, variation].filter(Boolean).join(' '),
            variation,
            collectorNumber,
            expansion,
            ...features,
        ]
            .map((clue) => this.normalizeClueValue(clue))
            .filter(Boolean)
            .filter((clue, index, all) => all.findIndex((candidate) => this.compactClueValue(candidate) === this.compactClueValue(clue)) === index);
        const primaryClues = selectedClues.filter((clue) => {
            const compact = this.compactClueValue(clue);
            return compact === this.compactClueValue(name) ||
                compact === this.compactClueValue([name, variation].filter(Boolean).join(' ')) ||
                compact === this.compactClueValue(variation);
        });
        const searchTitle = [name, variation, expansion, collectorNumber, ...features]
            .map((part) => this.removeEbayMarketplaceNoise(part))
            .filter(Boolean)
            .filter((part, index, all) => all.findIndex((candidate) => this.compactClueValue(candidate) === this.compactClueValue(part)) === index)
            .join(' ');

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
                category: value === collectorNumber ? 'collector' :
                    value === expansion ? 'expansion' :
                    value === variation ? 'variation' :
                    features.includes(value) ? 'feature' :
                    'name',
                selectedByDefault: true,
            })),
            name,
            variation,
            collectorNumber,
            numericCollectorNumber: collectorNumber ? this.numericCollectorNumber(collectorNumber) : '',
            expansion,
            features,
            rarity,
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

    async searchCardWithBackground(title, ebayPayload = this.buildEbayPayload(title)) {
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
            url: window.location.href,
        });
        const results = response?.success && Array.isArray(response.results) ? response.results : [];
        this.storeMatchedResults(window.location.href, title, results);
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

    buildSidePanelPreviewRowsPayload(url = window.location.href) {
        const rows = (this.latestResultsByUrl.get(this.stableUrl(url)) || [])
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
                    source: result.source || 'ebay_button_preview',
                    search_rank: result.search_rank || result.searchScore || result.search_score || result.relevanceScore || result.score || '',
                    pokoin_price: result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '',
                };
            })
            .filter(Boolean);
        return rows.length > 0 ? { previewRows: rows } : {};
    }

    openPokoinSidePanel(url = window.location.href, title = document.title, ebayPayload = this.buildEbayPayload(title)) {
        const stableUrl = this.stableUrl(url);
        return chrome.runtime.sendMessage({
            action: 'openSidePanelForCurrentTab',
            url,
            title: ebayPayload.searchTitle || this.latestTitleByUrl.get(stableUrl) || title,
            originalTitle: title,
            clues: ebayPayload.selectedClues || [],
            primaryClues: ebayPayload.primaryClues || [],
            selectedClues: ebayPayload.selectedClues || [],
            ebayPayload,
            marketplacePayload: ebayPayload,
            previewSignature: this.buildEbaySearchSignature(ebayPayload),
            previewSource: 'ebay_button_preview',
            ...this.buildSidePanelPreviewRowsPayload(url),
        }).catch((error) => {
            console.warn('⚠️ [EBAYE] Unable to open side panel:', error);
        });
    }

    attachSidePanelClick(button, title = document.title, url = window.location.href, ebayPayload = this.buildEbayPayload(title)) {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            this.openPokoinSidePanel(url, title, ebayPayload);
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

    /**
     * Initialize eBay processor
     */
    init() {
        console.log('🔴 [EBAYE] Initializing eBay processor...');
        
        // Process immediately if current page is a product page
        if (this.isProductPage()) {
            this.processProductPage();
        }
        
        // Start observer for new listings
        this.startObserver();
    }

    /**
     * Check whether current page is an eBay product page
     */
    isProductPage() {
        return window.location.hostname.includes('ebay') && 
               (window.location.pathname.includes('/itm/') || 
                document.querySelector('h1.x-item-title__mainTitle'));
    }

    /**
     * Process an eBay product page
     */
    processProductPage() {
        if (this.processedPages.has(window.location.href)) {
            console.log('🚫 [EBAYE] Product page already processed, skipping');
            return;
        }

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
            
            console.log(`🔍 [EBAYE] Product title: "${title}"`);
            
            // Extract metadata from title
            const titleInfo = this.extractTitleInfo(title);
            const ebayPayload = this.buildEbayPayload(title, titleInfo);
            
            // Create button
            const button = document.createElement('button');
            button.setAttribute('data-pokemon-linker-button', 'true');
            this.setPokoinButtonLabel(button);
            button.style.cssText = `
                margin: 10px 0;
                padding: 6px 12px;
                font-size: 14px;
            `;
            this.applyPokoinButtonStyles(button);
            this.attachSidePanelClick(button, title, window.location.href, ebayPayload);
            
            // Insert button after title
            if (titleElement.parentNode) {
                titleElement.parentNode.insertBefore(button, titleElement.nextSibling);
                console.log(`✅ [EBAYE] Added CT button (loading) on product page`);
            } else {
                console.log('⚠️ [EBAYE] Unable to insert CT button');
                return;
            }
            
            // Search database and update button state
            this.searchCardInDatabase(titleInfo, title, ebayPayload).then(results => {
                this.storeMatchedResults(window.location.href, title, results);
                if (results && results.length > 0) {
                    this.setPokoinButtonLabel(button, this.countHighConfidenceMatches(results));
                    console.log(`✅ [EBAYE] Link found, button updated`);
                    
                    button.addEventListener('mouseenter', () => {
                        button.style.background = this.pokoinBlueHover();
                        button.style.transform = 'translateY(-1px)';
                        button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                    });
                    
                    button.addEventListener('mouseleave', () => {
                        button.style.background = this.pokoinBlue();
                        button.style.transform = 'translateY(0)';
                        button.style.boxShadow = 'none';
                    });
                    
                } else {
                    console.log(`⚠️ [EBAYE] No result found, button remains blue`);
                    
                    button.addEventListener('mouseenter', () => {
                        button.style.background = this.pokoinBlueHover();
                        button.style.transform = 'translateY(-1px)';
                        button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                    });
                    
                    button.addEventListener('mouseleave', () => {
                        button.style.background = this.pokoinBlue();
                        button.style.transform = 'translateY(0)';
                        button.style.boxShadow = 'none';
                    });
                }
            });
            
            // Mark page as processed
            this.processedPages.add(window.location.href);
            
        } catch (error) {
            console.error('❌ [EBAYE] Error while processing product page:', error);
        }
    }

    /**
     * Start observer for new listings
     */
    startObserver() {
        const observer = new MutationObserver((mutations) => {
            if (!this.isEnabled) return;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
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
            this.attachSidePanelClick(button, title, listingUrl, { ...ebayPayload, listingKey: this.stableUrl(listingUrl) });
            
            // Insert button
            const inserted = this.insertLinkContainer(listingElement, button);
            if (inserted) {
                console.log(`✅ [EBAYE] Added button for ${titleInfo.pokemonName || title}`);
                
                // Search database
                const results = await this.searchCardInDatabase(titleInfo, title, ebayPayload);
                this.storeMatchedResults(listingUrl, title, results);
                if (results && results.length > 0) {
                    this.setPokoinButtonLabel(button, this.countHighConfidenceMatches(results));
                }
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
        return this.searchCardWithBackground(title, ebayPayload);
    }

    /**
     * Generate Pokoin card link
     */
    generatePokoinLink(blueprintId) {
        return `https://pokoin.com/marketplace/en/cards/${blueprintId}`;
    }
}

// Export for global usage
window.EbayProcessor = EbayProcessor; 