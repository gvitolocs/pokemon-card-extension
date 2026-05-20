/**
 * EBAYE.js - eBay-specific processor
 * Contains logic for eBay product pages and listing feeds.
 */

class EbayProcessor {
    constructor() {
        this.isEnabled = true;
        this.processedPages = new Set();
    }

    pokoinIconUrl() {
        return chrome.runtime.getURL('assets/pokoin.svg');
    }

    setPokoinButtonLabel(button, suffix = '') {
        button.innerHTML = `
            <img src="${this.pokoinIconUrl()}" alt="" aria-hidden="true">
            <span>Pokoin${suffix ? ` ${suffix}` : ''}</span>
        `;
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
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                objectFit: 'cover',
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
            if (!titleInfo.pokemonName) {
                console.log('🚫 [EBAYE] No Pokemon found in title');
                return;
            }
            
            // Create button
            const button = document.createElement('button');
            button.setAttribute('data-pokemon-linker-button', 'true');
            this.setPokoinButtonLabel(button);
            button.style.cssText = `
                margin: 16px 0;
                padding: 8px 16px;
                font-size: 16px;
                min-width: 120px;
            `;
            this.applyPokoinButtonStyles(button, { background: '#6c757d' });
            
            // Insert button after title
            if (titleElement.parentNode) {
                titleElement.parentNode.insertBefore(button, titleElement.nextSibling);
                console.log(`✅ [EBAYE] Added CT button (loading) on product page`);
            } else {
                console.log('⚠️ [EBAYE] Unable to insert CT button');
                return;
            }
            
            // Search database and update button state
            this.searchCardInDatabase(titleInfo, title).then(results => {
                if (results && results.length > 0) {
                    // Turn button green when a link is found
                    button.style.background = '#28a745';
                    console.log(`✅ [EBAYE] Link found, button turned green`);
                    
                    // Open Pokoin card page on click
                    const bestResult = results[0];
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const pokoinUrl = this.generatePokoinLink(bestResult.blueprint_id);
                        window.open(pokoinUrl, '_blank');
                    });
                    
                    // Enhanced hover effects (green)
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
                    
                } else {
                    // Keep gray if no result is found
                    console.log(`⚠️ [EBAYE] No result found, button remains gray`);
                    
                    // Hover effects for gray (disabled) button
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
            if (!titleInfo.pokemonName) return;
            
            // Create button
            const button = document.createElement('button');
            button.setAttribute('data-pokemon-linker-button', 'true');
            this.setPokoinButtonLabel(button);
            button.style.cssText = `
                margin-top: 8px;
                margin-left: 8px;
                padding: 8px 16px;
                font-size: 17px;
                min-width: 100px;
            `;
            this.applyPokoinButtonStyles(button, { background: '#6c757d' });
            
            // Insert button
            const inserted = this.insertLinkContainer(listingElement, button);
            if (inserted) {
                console.log(`✅ [EBAYE] Added button for ${titleInfo.pokemonName}`);
                
                // Search database
                const results = await this.searchCardInDatabase(titleInfo, title);
                if (results && results.length > 0) {
                    button.style.background = '#28a745';
                    const bestResult = results[0];
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const pokoinUrl = this.generatePokoinLink(bestResult.blueprint_id);
                        window.open(pokoinUrl, '_blank');
                    });
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
     * Search database (delegates to `content.js`)
     */
    async searchCardInDatabase(titleInfo, title) {
        // Delegate to global function when available
        if (typeof window.searchCardInDatabase === 'function') {
            return await window.searchCardInDatabase(titleInfo, title);
        }
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
window.EbayProcessor = EbayProcessor; 