/**
 * VINT.js - Vinted-specific processor
 * Simplified processor for single-card product pages.
 */

class VintedProcessor {
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

    openPokoinSidePanel() {
        return chrome.runtime.sendMessage({
            action: 'openSidePanelForCurrentTab',
            url: window.location.href,
            title: document.title,
        }).catch((error) => {
            console.warn('⚠️ [VINT] Unable to open side panel:', error);
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
            
            // Find product title
            const titleSelectors = [
                'h1.web_ui__Text__title',
                '[data-testid="item-title"]',
                'h1[data-testid="item-title"]',
                'h1',
                '.web_ui__Text__title',
                '.web_ui__Text__subtitle'
            ];
            
            console.log(`🔍 [VINT] Looking for title with selectors:`, titleSelectors);
            
            let titleElement = null;
            for (const selector of titleSelectors) {
                titleElement = document.querySelector(selector);
                console.log(`🔍 [VINT] Trying selector "${selector}":`, titleElement ? 'FOUND' : 'NOT FOUND');
                if (titleElement) {
                    console.log(`✅ [VINT] Title found with selector: ${selector}`);
                    console.log(`🔍 [VINT] Title content: "${titleElement.textContent.trim()}"`);
                    break;
                }
            }
            
            if (!titleElement) {
                console.log('⚠️ [VINT] Product title not found');
                return;
            }
            
            const title = titleElement.textContent.trim();
            if (!title) {
                console.log('⚠️ [VINT] Product title is empty');
                return;
            }
            
            console.log(`🔍 [VINT] Product title: "${title}"`);
            
            // Extract title information
            const titleInfo = this.extractTitleInfo(title);
            
            // Always create a gray fallback button (even for non-Pokemon titles)
            console.log('🔍 [VINT] Creating gray fallback button...');
            this.createFallbackButton(titleElement);
            
            // Search in the database
            this.searchCardInDatabase(titleInfo, title).then(results => {
                console.log(`🔍 [VINT] Results received from database:`, results);
                if (results && results.length > 0) {
                    console.log(`✅ [VINT] Updating button with ${results.length} results`);
                    this.updateButtonWithResults(results);
                } else {
                    console.log('⚠️ [VINT] No database result found, button stays gray');
                }
            }).catch(error => {
                console.error('❌ [VINT] Database lookup error:', error);
            });
            
            // Mark page as processed
            this.processedPages.add(window.location.href);
            
        } catch (error) {
            console.error('❌ [VINT] Error while processing product page:', error);
        }
    }

    /**
     * Create gray fallback button
     */
    createFallbackButton(titleElement) {
        console.log(`🔍 [VINT] Creating fixed gray button at top-right`);
        
        // Always use fixed-position top-right method
        this.createFixedPositionButton();
    }



    /**
     * Create fixed top-right button
     */
    createFixedPositionButton() {
        console.log('🔄 [VINT] Creating fixed top-right button...');
        
        // Create gray fixed-position button
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        button.setAttribute('data-pokemon-linker-fallback', 'true');
        this.setPokoinButtonLabel(button);
        button.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            z-index: 9999;
            padding: 12px 24px;
            font-size: 16px;
            min-width: 120px;
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
        
        // Insert into body
        document.body.appendChild(button);
        console.log(`✅ [VINT] Added fixed top-right button`);
        this.currentButton = button;
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
            this.currentButton.style.background = '#28a745';
            this.currentButton.style.color = 'white';
        } else {
            // If this is a normal button
            this.setPokoinButtonLabel(this.currentButton, this.countHighConfidenceMatches(results));
            this.currentButton.style.background = '#28a745';
            this.applyPokoinButtonStyles(this.currentButton, { background: '#28a745' });
        }
        
        this.currentButton.removeAttribute('data-pokemon-linker-fallback');
        
        // Remove previous listeners by cloning the button
        const newButton = this.currentButton.cloneNode(true);
        this.currentButton.parentNode.replaceChild(newButton, this.currentButton);
        this.currentButton = newButton;
        
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
                console.error(`❌ [VINT] Error in global searchCardInDatabase call:`, error);
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