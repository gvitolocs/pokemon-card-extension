/**
 * CME.js - Gestione specifica per Cardmarket
 * Contiene tutta la logica per pagine prodotto e inserzioni Cardmarket
 */

class CardmarketProcessor {
    constructor() {
        this.isEnabled = true;
        this.processedPages = new Set();
    }

    /**
     * Inizializza il processore Cardmarket
     */
    init() {
        console.log('🟡 [CME] Inizializzazione processore Cardmarket...');
        
        // Processa immediatamente se siamo su una pagina prodotto
        if (this.isProductPage()) {
            this.processProductPage();
        }
        
        // Avvia observer per nuove inserzioni
        this.startObserver();
    }

    /**
     * Controlla se siamo su una pagina prodotto Cardmarket
     */
    isProductPage() {
        return window.location.hostname.includes('cardmarket') && 
               (window.location.pathname.includes('/Products/Singles/') || 
                document.querySelector('.page-title-container h1'));
    }

    /**
     * Processa una pagina prodotto Cardmarket
     */
    processProductPage() {
        if (this.processedPages.has(window.location.href)) {
            console.log('🚫 [CME] Pagina prodotto già processata, saltando');
            return;
        }

        try {
            console.log('🔍 [CME] Processando pagina prodotto Cardmarket...');
            
            // Cerca il titolo del prodotto
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
                console.log('⚠️ [CME] Titolo prodotto non trovato');
                return;
            }
            
            const title = titleElement.textContent.trim();
            if (!title) {
                console.log('⚠️ [CME] Titolo prodotto vuoto');
                return;
            }
            
            console.log(`🔍 [CME] Titolo prodotto: "${title}"`);
            
            // Estrai informazioni dal titolo
            const titleInfo = this.extractTitleInfo(title);
            if (!titleInfo.pokemonName) {
                console.log('🚫 [CME] Nessun Pokemon trovato nel titolo');
                return;
            }
            
            // Crea pulsante
            const button = document.createElement('button');
            button.setAttribute('data-pokemon-linker-button', 'true');
            button.innerHTML = 'CardTrader';
            button.style.cssText = `
                margin: 0;
                padding: 6px 12px;
                background: #6c757d;
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 15px;
                cursor: pointer;
                font-weight: bold;
                min-width: 90px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                text-decoration: none;
                text-align: center;
            `;
            
            // Cerca il link "Contact Support" e sostituiscilo con il pulsante CardTrader
            const supportLink = document.querySelector('a[href*="support/tickets/new"]');
            let buttonInserted = false; // Flag per tracciare se il pulsante è stato inserito
            
            // Inserisci il pulsante
            if (supportLink && supportLink.parentNode) {
                supportLink.parentNode.replaceChild(button, supportLink);
                console.log(`✅ [CME] Sostituito link supporto con pulsante CT su Cardmarket (loading)`);
                buttonInserted = true;
            } else {
                // Cerca il contenitore del link di supporto e inserisci il pulsante lì
                const supportContainer = document.querySelector('.align-self-end.mb-md-1 div');
                if (supportContainer) {
                    supportContainer.appendChild(button);
                    console.log(`✅ [CME] Inserito pulsante CT nel contenitore supporto su Cardmarket (loading)`);
                    buttonInserted = true;
                } else {
                    // Fallback: inserisci direttamente nell'h1
                    titleElement.appendChild(button);
                    console.log(`✅ [CME] Aggiunto pulsante CT alla pagina prodotto Cardmarket (loading fallback)`);
                    buttonInserted = true;
                }
            }

            
            // Ottieni il riferimento al pulsante
            let targetButton = button;
            
            // Esegui sempre la ricerca database se il pulsante esiste (nuovo o già presente)
            console.log('🔍 [CME] Avvio ricerca database per:', titleInfo.pokemonName);
            this.searchCardInDatabase(titleInfo, title).then(results => {
                if (results && results.length > 0) {
                    // Cambia il colore in verde quando ha trovato il link
                    targetButton.style.background = '#28a745';
                    console.log(`✅ [CME] Link trovato, pulsante diventato verde`);
                    
                    // Apri direttamente il link CardTrader quando si clicca
                    targetButton.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const bestResult = results[0];
                        const cardTraderUrl = this.generateCardTraderLink(bestResult.blueprint_id);
                        window.open(cardTraderUrl, '_blank');
                    });
                    
                    // Effetti hover migliorati (verde)
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
                    // Mantieni grigio se non ha trovato risultati
                    console.log(`⚠️ [CME] Nessun risultato trovato, pulsante rimane grigio`);
                    
                    // Effetti hover per pulsante grigio (disabilitato)
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
            
            // Marca pagina come processata
            this.processedPages.add(window.location.href);
            
        } catch (error) {
            console.error('❌ [CME] Errore nel processamento pagina prodotto:', error);
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
            console.log('✅ [CME] Observer avviato');
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
                console.log(`✅ [CME] Aggiunto pulsante per ${titleInfo.pokemonName}`);
                
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
            console.error('❌ [CME] Errore nel processamento inserzione:', error);
        }
    }

    /**
     * Estrae il titolo da un'inserzione
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
     * Inserisce il container del link
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
window.CardmarketProcessor = CardmarketProcessor; 