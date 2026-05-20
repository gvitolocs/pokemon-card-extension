/**
 * CME.js - Cardmarket-specific processor
 * Contains logic for Cardmarket product pages and listing feeds.
 */

class CardmarketProcessor {
    constructor() {
        this.isEnabled = true;
        this.processedPages = new Set();
    }

    pokoinIconUrl() {
        return chrome.runtime.getURL('assets/pokoin-512.png');
    }

    setPokoinButtonLabel(button, matchCount = null) {
        const suffix = Number.isFinite(matchCount) ? ` (${matchCount})` : '';
        button.innerHTML = `
            <img src="${this.pokoinIconUrl()}" alt="" aria-hidden="true">
            <span>Pokoin${suffix}</span>
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

    openPokoinSidePanel() {
        return chrome.runtime.sendMessage({
            action: 'openSidePanelForCurrentTab',
            url: window.location.href,
            title: document.title,
        }).catch((error) => {
            console.warn('⚠️ [CME] Unable to open side panel:', error);
        });
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
            textDecoration: 'none',
            textAlign: 'center',
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
     * Initialize Cardmarket processor
     */
    init() {
        console.log('🟡 [CME] Initializing Cardmarket processor...');
        
        // Process immediately if current page is a product page
        if (this.isProductPage()) {
            this.processProductPage();
        }
        
        // Start observer for new listings
        this.startObserver();
    }

    /**
     * Check whether current page is a Cardmarket product page
     */
    isProductPage() {
        return window.location.hostname.includes('cardmarket') && 
               (window.location.pathname.includes('/Products/Singles/') || 
                document.querySelector('.page-title-container h1'));
    }

    /**
     * Process a Cardmarket product page
     */
    processProductPage() {
        if (this.processedPages.has(window.location.href)) {
            console.log('🚫 [CME] Product page already processed, skipping');
            return;
        }

        try {
            console.log('🔍 [CME] Processing Cardmarket product page...');
            
            // Find product title
            const titleSelectors = [
                '.page-title-container h1',
                'h1',
                '.product-title',
                '.card-title'
            ];
            
            let titleElement = null;
            for (const selector of titleSelectors) {
                titleElement = document.querySelector(selector);
                if (titleElement) break;
            }
            
            if (!titleElement) {
                console.log('⚠️ [CME] Product title not found');
                return;
            }
            
            const title = titleElement.textContent.trim();
            if (!title) {
                console.log('⚠️ [CME] Product title is empty');
                return;
            }
            
            console.log(`🔍 [CME] Product title: "${title}"`);
            
            // Extract title information
            const titleInfo = this.extractTitleInfo(title);
            
            // Create button
            const button = document.createElement('button');
            button.setAttribute('data-pokemon-linker-button', 'true');
            this.setPokoinButtonLabel(button);
            button.style.cssText = `
                margin: 0;
                padding: 6px 12px;
                font-size: 15px;
                min-width: 100px;
            `;
            this.applyPokoinButtonStyles(button, { background: '#6c757d' });
            
            // Look for "Contact Support" link and replace with Pokoin button
            const supportLink = document.querySelector('a[href*="support/tickets/new"]');
            let buttonInserted = false; // Track whether the button was inserted
            
            // Insert button
            if (supportLink && supportLink.parentNode) {
                supportLink.parentNode.replaceChild(button, supportLink);
                console.log(`✅ [CME] Replaced support link with Pokoin button on Cardmarket (loading)`);
                buttonInserted = true;
            } else {
                // Try support-link container and insert button there
                const supportContainer = document.querySelector('.align-self-end.mb-md-1 div');
                if (supportContainer) {
                    supportContainer.appendChild(button);
                    console.log(`✅ [CME] Inserted Pokoin button in support container on Cardmarket (loading)`);
                    buttonInserted = true;
                } else {
                    // Fallback: insert directly in h1
                    titleElement.appendChild(button);
                    console.log(`✅ [CME] Added Pokoin button to Cardmarket product page (loading fallback)`);
                    buttonInserted = true;
                }
            }

            
            // Keep button reference
            let targetButton = button;
            
            // Always run database lookup if button exists (new or already present)
            console.log('🔍 [CME] Starting database lookup for:', titleInfo.pokemonName || title);
            this.searchCardInDatabase(titleInfo, title).then(results => {
                if (results && results.length > 0) {
                    // Turn button green when link is found
                    targetButton.style.background = '#28a745';
                    this.setPokoinButtonLabel(targetButton, this.countHighConfidenceMatches(results));
                    console.log(`✅ [CME] Link found, button turned green`);
                    
                    // Open Pokoin link on click
                    targetButton.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.openPokoinSidePanel();
                    });
                    
                    // Enhanced hover effects (green)
                    targetButton.addEventListener('mouseenter', () => {
                        targetButton.style.background = '#218838';
                        targetButton.style.transform = 'scale(1.02)';
                        targetButton.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)';
                    });
                    
                    targetButton.addEventListener('mouseleave', () => {
                        targetButton.style.background = '#28a745';
                        targetButton.style.transform = 'scale(1)';
                        targetButton.style.boxShadow = 'none';
                    });
                    
                } else {
                    // Keep gray if no result is found
                    console.log(`⚠️ [CME] No result found, button remains gray`);
                    
                    // Hover effects for gray (disabled) button
                    targetButton.addEventListener('mouseenter', () => {
                        targetButton.style.background = '#5a6268';
                        targetButton.style.transform = 'scale(1.02)';
                        targetButton.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)';
                    });
                    
                    targetButton.addEventListener('mouseleave', () => {
                        targetButton.style.background = '#6c757d';
                        targetButton.style.transform = 'scale(1)';
                        targetButton.style.boxShadow = 'none';
                    });
                }
            });
            
            // Mark page as processed
            this.processedPages.add(window.location.href);
            
        } catch (error) {
            console.error('❌ [CME] Error while processing product page:', error);
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
            console.log('✅ [CME] Observer started');
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
            '.article-row',
            '.product-article',
            '.article-item',
            '.product-row'
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
                console.log(`✅ [CME] Added button for ${titleInfo.pokemonName || title}`);
                
                // Search database
                const results = await this.searchCardInDatabase(titleInfo, title);
                if (results && results.length > 0) {
                    button.style.background = '#28a745';
                    this.setPokoinButtonLabel(button, this.countHighConfidenceMatches(results));
                    const bestResult = results[0];
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.openPokoinSidePanel();
                    });
                }
            }
            
            listingElement.setAttribute('data-pokemon-linker-processed', 'true');
            
        } catch (error) {
            console.error('❌ [CME] Error while processing listing:', error);
        }
    }

    /**
     * Extract title from listing
     */
    extractTitleFromListing(listingElement) {
        const titleSelectors = [
            '.col-12 .d-flex .flex-grow-1 h1',
            '.product-details h1',
            '.card-title',
            '.product-title',
            'h1',
            '.page-title-container h1'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                let title = element.textContent.trim();
                title = title.replace(/\bCardTrader\b/g, '').trim();
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
            '.col-12 .d-flex .flex-grow-1 h1',
            '.product-details h1',
            '.card-title',
            '.product-title',
            'h1',
            '.page-title-container h1'
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
     * Generate Pokoin link
     */
    generatePokoinLink(blueprintId) {
        return `https://pokoin.com/marketplace/en/cards/${blueprintId}`;
    }
}

// Export for global usage
window.CardmarketProcessor = CardmarketProcessor; 