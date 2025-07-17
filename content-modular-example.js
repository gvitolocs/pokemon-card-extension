/**
 * content-modular-example.js - Esempio di content.js modulare
 * Mostra come usare i moduli creati per organizzare il codice
 */

// Inizializza i moduli
const extensionCore = new ExtensionCore();
const cacheManager = new CacheManager();
const buttonManager = new ButtonManager();
const titleExtractor = new TitleExtractor();
const urlGenerator = new UrlGenerator();

// Pulsante globale creato una sola volta all'avvio (fuori da tutti i cicli)
let globalButton = null;

// Inizializza le variabili globali se non esistono
if (typeof window.supabaseClient === 'undefined') {
    window.supabaseClient = null;
}

// Crea il pulsante globale una sola volta (fuori da tutti i cicli)
globalButton = buttonManager.createGlobalButton();

// Event listeners per la comunicazione tra moduli
document.addEventListener('cardtrader-dom-ready', () => {
    console.log('⚡ [CardTrader] DOM caricato, riavvio osservatore...');
    startObserver();
});

document.addEventListener('cardtrader-check-periodic', () => {
    console.log('⚡ [CardTrader] Controllo periodico - avvio osservatore...');
    startObserver();
});

document.addEventListener('cardtrader-force-start', () => {
    console.log('⚡ [CardTrader] Forzatura finale avvio osservatore...');
    startObserver();
});

document.addEventListener('cardtrader-url-changed', (event) => {
    console.log('🔄 [CardTrader] URL cambiato, pulendo stati...');
    cacheManager.clearAllCaches();
    cacheManager.clearProcessingAttributes();
    
    // Riavvia l'osservatore dopo un breve delay
    setTimeout(() => {
        startObserver();
    }, 500);
});

// Inizializza l'estensione
async function initializeExtension() {
    try {
        console.log('🃏 Pokemon Card Trader Linker - Inizializzazione rapida...');
        
        // Inizializza il core
        await extensionCore.initialize();
        
        // Configura il gestore dei cambi URL
        extensionCore.setupUrlChangeHandler();
        
        // Avvia immediatamente l'osservatore per inserimento veloce
        startObserver();
        
        console.log('✅ Estensione inizializzata rapidamente');
        
    } catch (error) {
        console.error('❌ Errore nell\'inizializzazione:', error);
        startObserver();
    }
}

// Inizializzazione ultra-rapida che si attiva immediatamente
function initializeUltraFast() {
    console.log('⚡ [CardTrader] Inizializzazione ultra-rapida...');
    
    // Pulisci i match riusciti quando cambia la pagina
    cacheManager.clearSuccessfulMatches();
    
    // Avvia immediatamente l'osservatore
    startObserver();
    
    // Se il DOM è ancora in caricamento, riavvia quando è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('⚡ [CardTrader] DOM caricato, riavvio osservatore...');
            document.dispatchEvent(new CustomEvent('cardtrader-dom-ready'));
        });
    }
    
    // Backup: controlla ogni 50ms se ci sono nuovi elementi
    const checkInterval = setInterval(() => {
        if (document.body) {
            console.log('⚡ [CardTrader] Controllo periodico - avvio osservatore...');
            document.dispatchEvent(new CustomEvent('cardtrader-check-periodic'));
        }
        
        // Ferma il controllo dopo 5 secondi
        setTimeout(() => {
            clearInterval(checkInterval);
        }, 5000);
    }, 50);
    
    // Backup finale: se dopo 200ms non è ancora partito, forza l'avvio
    setTimeout(() => {
        console.log('⚡ [CardTrader] Forzatura finale avvio osservatore...');
        document.dispatchEvent(new CustomEvent('cardtrader-force-start'));
    }, 200);
}

// Avvia l'osservatore per rilevare nuove inserzioni con inserimento immediato
function startObserver() {
    try {
        console.log('🔍 [CardTrader] Avvio osservatore con inserimento immediato...');
        
        // Inserimento immediato per elementi già presenti
        processExistingListingsImmediate();
        
        const observer = new MutationObserver((mutations) => {
            if (!extensionCore.isExtensionEnabled()) return;
            
            let hasNewListings = false;
            let pendingListings = [];
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const listings = findListingsInContainer(node);
                            if (listings.length > 0) {
                                hasNewListings = true;
                                pendingListings.push(...listings);
                            }
                        }
                    });
                }
            });
            
            if (hasNewListings) {
                // Processamento immediato per nuovi elementi
                console.log(`⚡ [CardTrader] Processamento immediato di ${pendingListings.length} nuove inserzioni`);
                
                // Processa solo i primi 3 elementi immediatamente per evitare sovraccarico
                const immediateListings = pendingListings.slice(0, 3);
                immediateListings.forEach(listing => {
                    processListingImmediate(listing);
                });
                
                // Debounce per elaborazioni successive
                cacheManager.setDebounceTimer(() => {
                    console.log(`🔄 [CardTrader] Elaborazione successiva di ${pendingListings.length} inserzioni`);
                    
                    // Processa in batch per migliorare le performance
                    const batchSize = 3;
                    for (let i = 0; i < pendingListings.length; i += batchSize) {
                        const batch = pendingListings.slice(i, i + batchSize);
                        setTimeout(() => {
                            batch.forEach(listing => {
                                // Controlla se abbiamo già un match riuscito per questo elemento
                                const title = titleExtractor.extractTitleFromListing(listing);
                                if (title) {
                                    const cacheKey = titleExtractor.generateCacheKey(title);
                                    if (!cacheManager.hasSuccessfulMatch(cacheKey)) {
                                        processListing(listing);
                                    }
                                }
                            });
                        }, i * 50);
                    }
                }, 100);
            }
        });
        
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Controllo periodico per elementi esistenti
            setInterval(() => {
                if (extensionCore.isExtensionEnabled() && !extensionCore.isExtensionProcessing()) {
                    processExistingListings();
                }
            }, 5000);
            
            console.log('✅ [CardTrader] Osservatore con inserimento immediato avviato');
        } else {
            console.warn('⚠️ [CardTrader] Document.body non disponibile, riprovo tra 500ms');
            setTimeout(startObserver, 500);
        }
    } catch (error) {
        console.error('❌ [CardTrader] Errore nell\'avvio osservatore:', error);
    }
}

// Processamento immediato delle inserzioni esistenti
function processExistingListingsImmediate() {
    if (!extensionCore.isExtensionEnabled()) return;
    
    console.log('⚡ [CardTrader] Processamento immediato delle inserzioni esistenti...');
    
    const listings = findListings();
    console.log(`⚡ [CardTrader] Trovate ${listings.length} inserzioni per processamento immediato`);
    
    // Processa immediatamente solo i primi 5 elementi
    const immediateListings = listings.slice(0, 5);
    immediateListings.forEach(listing => {
        processListingImmediate(listing);
    });
    
    // Processa il resto con un delay maggiore
    if (listings.length > 5) {
        setTimeout(() => {
            const remainingListings = listings.slice(5);
            remainingListings.forEach(listing => {
                // Controlla se abbiamo già un match riuscito per questo elemento
                const title = titleExtractor.extractTitleFromListing(listing);
                if (title) {
                    const cacheKey = titleExtractor.generateCacheKey(title);
                    if (!cacheManager.hasSuccessfulMatch(cacheKey)) {
                        processListing(listing);
                    }
                }
            });
        }, 200);
    }
}

// Processamento immediato di una singola inserzione
function processListingImmediate(listingElement) {
    if (!extensionCore.isExtensionEnabled() || !listingElement || listingElement.hasAttribute('data-pokemon-linker-processed')) {
        return;
    }
    
    try {
        // Estrai il titolo immediatamente
        const title = titleExtractor.extractTitleFromListing(listingElement);
        if (!title || title.trim().length < 3) {
            return;
        }
        
        // Controlla se abbiamo già un match riuscito per questo titolo
        const cacheKey = titleExtractor.generateCacheKey(title);
        if (cacheManager.hasSuccessfulMatch(cacheKey)) {
            console.log(`🚫 [CardTrader] Match già riuscito per: "${title}", saltando`);
            return;
        }
        
        // Crea un pulsante di caricamento immediato (clona il pulsante globale)
        const loadingButton = globalButton.cloneNode(true);
        buttonManager.insertButton(listingElement, loadingButton);
        
        // Marca come processato per evitare duplicati
        listingElement.setAttribute('data-pokemon-linker-processed', 'true');
        
        // Avvia la ricerca in background
        requestIdleCallback(() => {
            processListing(listingElement);
        });
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nel processamento immediato:', error);
    }
}

// Trova tutte le inserzioni nella pagina
function findListings() {
    const selectors = getListingSelectors();
    const listings = [];
    const hostname = window.location.hostname;
    
    selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            if (!element.hasAttribute('data-pokemon-linker-processed')) {
                if (hostname.includes('vinted')) {
                    const skipSelectors = [
                        '[data-testid="item-attributes-upload_date"]',
                        '[data-testid="item-attributes-status"]',
                        '[data-testid="item-attributes-brand-menu-button"]',
                        '.details-list__item-value',
                        '.web_ui__Text__subtitle',
                        '.web_ui__Text__body',
                        '.web_ui__Spacer__',
                        '.web_ui__Divider__',
                        '.overflow-menu',
                        '.u-cursor-pointer',
                        'button',
                        'a'
                    ];
                    
                    let shouldSkip = false;
                    skipSelectors.forEach(skipSelector => {
                        if (element.matches(skipSelector)) {
                            shouldSkip = true;
                        }
                    });
                    
                    if (!shouldSkip) {
                        listings.push(element);
                    }
                } else {
                    listings.push(element);
                }
            }
        });
    });
    
    return listings;
}

// Ottieni i selettori per le inserzioni
function getListingSelectors() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('vinted')) {
        return [
            '[data-testid="item-card"]',
            '.feed-grid__item',
            '.web_ui__Card__body',
            '[data-testid="item-page-summary-plugin"] .web_ui__Text__title',
            '.item-details .web_ui__Text__title',
            '.product-details .web_ui__Text__title'
        ];
    } else if (hostname.includes('ebay')) {
        return [
            '.s-item',
            '.srp-results .s-item',
            '.srp-results .s-item__info',
            '.srp-results .s-item__title'
        ];
    } else if (hostname.includes('cardmarket')) {
        return [
            '.product-title',
            '.col-12 .product-title'
        ];
    }
    
    return [];
}

// Trova inserzioni in un container specifico
function findListingsInContainer(container) {
    const selectors = getListingSelectors();
    const listings = [];
    const hostname = window.location.hostname;
    
    selectors.forEach(selector => {
        const elements = container.querySelectorAll ? container.querySelectorAll(selector) : [];
        elements.forEach(element => {
            if (!element.hasAttribute('data-pokemon-linker-processed')) {
                if (hostname.includes('vinted')) {
                    const skipSelectors = [
                        '[data-testid="item-attributes-upload_date"]',
                        '[data-testid="item-attributes-status"]',
                        '[data-testid="item-attributes-brand-menu-button"]',
                        '.details-list__item-value',
                        '.web_ui__Text__subtitle',
                        '.web_ui__Text__body',
                        '.web_ui__Spacer__',
                        '.web_ui__Divider__',
                        '.overflow-menu',
                        '.u-cursor-pointer',
                        'button',
                        'a'
                    ];
                    
                    let shouldSkip = false;
                    skipSelectors.forEach(skipSelector => {
                        if (element.matches(skipSelector)) {
                            shouldSkip = true;
                        }
                    });
                    
                    if (!shouldSkip) {
                        listings.push(element);
                    }
                } else {
                    listings.push(element);
                }
            }
        });
    });
    
    return listings;
}

// Processa le inserzioni esistenti
function processExistingListings() {
    if (!extensionCore.isExtensionEnabled() || extensionCore.isExtensionProcessing()) return;
    
    const listings = findListings();
    console.log(`🔍 Trovate ${listings.length} inserzioni da processare`);
    
    // Limita il numero di inserzioni processate per volta
    const limitedListings = listings.slice(0, 10);
    
    limitedListings.forEach(listing => {
        // Controlla se abbiamo già un match riuscito per questo elemento
        const title = titleExtractor.extractTitleFromListing(listing);
        if (title) {
            const cacheKey = titleExtractor.generateCacheKey(title);
            if (!cacheManager.hasSuccessfulMatch(cacheKey)) {
                processListing(listing);
            }
        }
    });
}

// Processa una singola inserzione
async function processListing(listingElement) {
    if (!extensionCore.isExtensionEnabled() || extensionCore.isExtensionProcessing()) return;
    
    try {
        // CONTROLLO DUPLICAZIONE ROBUSTO
        const isAlreadyProcessed = 
            listingElement.hasAttribute('data-pokemon-linker-processed') ||
            cacheManager.isInObserverCache(listingElement) ||
            cacheManager.isInProcessingElements(listingElement);
        
        // Controllo aggiuntivo per evitare processamento multiplo recente
        const lastProcessedTime = listingElement.getAttribute('data-pokemon-linker-last-processed');
        if (lastProcessedTime) {
            const timeSinceLastProcess = Date.now() - parseInt(lastProcessedTime);
            if (timeSinceLastProcess < 1000) {
                console.log(`🚫 [CardTrader] Elemento processato di recente (${Math.round(timeSinceLastProcess)}ms fa), saltando`);
                return;
            }
        }
        
        if (isAlreadyProcessed) {
            console.log('🚫 [CardTrader] Elemento già processato (controllo robusto), saltando');
            return;
        }
        
        // Marca IMMEDIATAMENTE come in fase di processamento per evitare duplicazioni
        cacheManager.addToProcessingElements(listingElement);
        listingElement.setAttribute('data-pokemon-linker-processing', 'true');
        
        // Estrai il titolo
        const title = titleExtractor.extractTitleFromListing(listingElement);
        if (!title || title.trim().length < 3) {
            console.log('🚫 [CardTrader] Titolo troppo corto o vuoto, saltando');
            return;
        }
        
        // Controlla se abbiamo già un match riuscito per questo titolo
        const cacheKey = titleExtractor.generateCacheKey(title);
        if (cacheManager.hasSuccessfulMatch(cacheKey)) {
            console.log(`🚫 [CardTrader] Match già riuscito per: "${title}", saltando`);
            return;
        }
        
        // Estrai informazioni dal titolo
        const titleInfo = titleExtractor.extractTitleInfo(title);
        if (!titleInfo.pokemonName) {
            console.log('🚫 [CardTrader] Nessun Pokemon trovato nel titolo');
            return;
        }
        
        console.log(`🔍 [CardTrader] Processando: "${title}" -> ${titleInfo.pokemonName}`);
        
        // Crea il pulsante con "CardTrader" (grigio di default)
        const button = buttonManager.cloneButton();
        
        // Inserisci il pulsante subito (grigio)
        const inserted = buttonManager.insertButton(listingElement, button);
        
        if (inserted) {
            console.log(`✅ [CardTrader] Aggiunto pulsante CardTrader (loading) per ${titleInfo.pokemonName}`);
            
            // Cerca nel database
            console.log(`🔍 [CardTrader] Avvio ricerca per: "${title}"`);
            let results = await searchCardInDatabase(titleInfo, title);
            console.log(`🔍 [CardTrader] Risultati ricevuti:`, results);
            
            if (results && results.length > 0) {
                console.log(`✅ [CardTrader] Trovati ${results.length} risultati`);
                
                // Marca come match riuscito per evitare riprocessamento
                cacheManager.addSuccessfulMatch(cacheKey);
                
                // Salva in cache per future ricerche
                cacheManager.saveToCardCache(cacheKey, { results, titleInfo });
                
                const bestResult = results[0];
                
                // Imposta il pulsante come successo
                buttonManager.setButtonSuccess(button, (e) => {
                    const cardTraderUrl = urlGenerator.generateCardTraderLink(bestResult.blueprint_id);
                    if (cardTraderUrl) {
                        urlGenerator.openLink(cardTraderUrl);
                    }
                });
                
            } else {
                console.log('❌ [CardTrader] Nessun risultato trovato nel database');
                
                // Controlla se Supabase è disponibile
                if (typeof window.supabaseClient === 'undefined' || !window.supabaseClient) {
                    console.log('⚠️ [CardTrader] Supabase non disponibile, pulsante rimane grigio');
                    buttonManager.setButtonDisabled(button, 'CardTrader (DB offline)');
                } else {
                    buttonManager.setButtonDisabled(button);
                }
            }
        } else {
            console.log(`⚠️ [CardTrader] Impossibile inserire pulsante per ${titleInfo.pokemonName}`);
        }
        
        // Marca come processato
        cacheManager.addToObserverCache(listingElement);
        listingElement.setAttribute('data-pokemon-linker-processed', 'true');
        listingElement.setAttribute('data-pokemon-linker-last-processed', Date.now().toString());
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nel processamento inserzione:', error);
    } finally {
        // Rimuovi dall'elenco degli elementi in fase di processamento
        cacheManager.removeFromProcessingElements(listingElement);
        // Rimuovi l'attributo di processamento
        listingElement.removeAttribute('data-pokemon-linker-processing');
    }
}

// Funzione per cercare nel database (da implementare)
async function searchCardInDatabase(titleInfo, originalTitle) {
    // Implementazione della ricerca nel database
    // Questa funzione dovrebbe essere implementata nel modulo DatabaseManager
    console.log('🔍 [CardTrader] Ricerca nel database per:', titleInfo.pokemonName);
    return [];
}

// Inizializzazione ultra-rapida per inserimento immediato
initializeUltraFast();

// Inizializzazione completa in background
initializeExtension(); 