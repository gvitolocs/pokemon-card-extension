/**
 * EBAYE.js - Gestione specifica per eBay
 * Contiene tutta la logica per pagine prodotto e inserzioni eBay
 */

class EbayProcessor {
    constructor() {
        this.isEnabled = true;
        this.processedPages = new Set();
    }

    /**
     * Inizializza il processore eBay
     */
    init() {
        console.log('🔴 [EBAYE] Inizializzazione processore eBay...');
        
        // Processa immediatamente se siamo su una pagina prodotto
        if (this.isProductPage()) {
            this.processProductPage();
        }
        
        // Avvia observer per nuove inserzioni
        this.startObserver();
    }

    /**
     * Controlla se siamo su una pagina prodotto eBay
     */
    isProductPage() {
        return window.location.hostname.includes('ebay') && 
               (window.location.pathname.includes('/itm/') || 
                document.querySelector('h1.x-item-title__mainTitle'));
    }

    /**
     * Processa una pagina prodotto eBay
     */
    processProductPage() {
        if (this.processedPages.has(window.location.href)) {
            console.log('🚫 [EBAYE] Pagina prodotto già processata, saltando');
            return;
        }

        try {
            console.log('🔍 [EBAYE] Processando pagina prodotto eBay...');
            
            // Cerca il titolo del prodotto
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
                console.log('⚠️ [EBAYE] Titolo prodotto non trovato');
                return;
            }
            
            const title = titleElement.textContent.trim();
            if (!title) {
                console.log('⚠️ [EBAYE] Titolo prodotto vuoto');
                return;
            }
            
            console.log(`🔍 [EBAYE] Titolo prodotto: "${title}"`);
            
            // Estrai informazioni dal titolo
            const titleInfo = this.extractTitleInfo(title);
            if (!titleInfo.pokemonName) {
                console.log('🚫 [EBAYE] Nessun Pokemon trovato nel titolo');
                return;
            }
            
            // Crea pulsante
            const button = document.createElement('button');
            button.setAttribute('data-pokemon-linker-button', 'true');
            button.innerHTML = 'CardTrader';
            button.style.cssText = `
                margin: 16px 0;
                padding: 8px 16px;
                background: #6c757d;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                font-weight: bold;
                min-width: 120px;
                display: inline-block;
                transition: all 0.2s ease;
            `;
            
            // Inserisci il pulsante dopo il titolo
            if (titleElement.parentNode) {
                titleElement.parentNode.insertBefore(button, titleElement.nextSibling);
                console.log(`✅ [EBAYE] Aggiunto pulsante CT (loading) alla pagina prodotto`);
            } else {
                console.log('⚠️ [EBAYE] Impossibile inserire pulsante CT');
                return;
            }
            
            // Cerca nel database e aggiorna il pulsante
            this.searchCardInDatabase(titleInfo, title).then(results => {
                if (results && results.length > 0) {
                    // Cambia il colore in verde quando ha trovato il link
                    button.style.background = '#28a745';
                    console.log(`✅ [EBAYE] Link trovato, pulsante diventato verde`);
                    
                    // Apri direttamente il link CardTrader quando si clicca
                    const bestResult = results[0];
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const cardTraderUrl = this.generateCardTraderLink(bestResult.blueprint_id);
                        window.open(cardTraderUrl, '_blank');
                    });
                    
                    // Effetti hover migliorati (verde)
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
                    // Mantieni grigio se non ha trovato risultati
                    console.log(`⚠️ [EBAYE] Nessun risultato trovato, pulsante rimane grigio`);
                    
                    // Effetti hover per pulsante grigio (disabilitato)
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
            
            // Marca pagina come processata
            this.processedPages.add(window.location.href);
            
        } catch (error) {
            console.error('❌ [EBAYE] Errore nel processamento pagina prodotto:', error);
        }
    }

    /**
     * Avvia observer per nuove inserzioni
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
            console.log('✅ [EBAYE] Observer avviato');
        }
    }

    /**
     * Processa nuove inserzioni
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
     * Trova inserzioni in un container
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
     * Processa una singola inserzione
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
            
            // Crea pulsante
            const button = document.createElement('button');
            button.setAttribute('data-pokemon-linker-button', 'true');
            button.innerHTML = 'CardTrader';
            button.style.cssText = `
                margin-top: 8px;
                margin-left: 8px;
                padding: 8px 16px;
                background: #6c757d;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 17px;
                cursor: pointer;
                font-weight: bold;
                min-width: 100px;
                display: inline-block;
                transition: all 0.2s ease;
            `;
            
            // Inserisci pulsante
            const inserted = this.insertLinkContainer(listingElement, button);
            if (inserted) {
                console.log(`✅ [EBAYE] Aggiunto pulsante per ${titleInfo.pokemonName}`);
                
                // Cerca nel database
                const results = await this.searchCardInDatabase(titleInfo, title);
                if (results && results.length > 0) {
                    button.style.background = '#28a745';
                    const bestResult = results[0];
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const cardTraderUrl = this.generateCardTraderLink(bestResult.blueprint_id);
                        window.open(cardTraderUrl, '_blank');
                    });
                }
            }
            
            listingElement.setAttribute('data-pokemon-linker-processed', 'true');
            
        } catch (error) {
            console.error('❌ [EBAYE] Errore nel processamento inserzione:', error);
        }
    }

    /**
     * Estrae il titolo da un'inserzione
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
                title = title.replace(/\bCardTrader\b/g, '').trim();
                return title;
            }
        }
        
        return null;
    }

    /**
     * Inserisce il container del link
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
     * Estrae informazioni dal titolo (delega a content.js)
     */
    extractTitleInfo(title) {
        // Delega alla funzione globale se disponibile
        if (typeof window.extractTitleInfo === 'function') {
            return window.extractTitleInfo(title);
        }
        return { pokemonName: null };
    }

    /**
     * Cerca nel database (delega a content.js)
     */
    async searchCardInDatabase(titleInfo, title) {
        // Delega alla funzione globale se disponibile
        if (typeof window.searchCardInDatabase === 'function') {
            return await window.searchCardInDatabase(titleInfo, title);
        }
        return [];
    }

    /**
     * Genera link CardTrader
     */
    generateCardTraderLink(blueprintId) {
        return `https://www.cardtrader.com/cards/${blueprintId}`;
    }
}

// Esporta per uso globale
window.EbayProcessor = EbayProcessor; 