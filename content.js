// Content script per Pokemon Card Trader Linker
// Si attiva automaticamente su eBay e Vinted

console.log('🃏 Pokemon Card Trader Linker - Estensione attivata');

// Stato dell'estensione con cache ottimizzata
let isEnabled = true;
let isProcessing = false;
let cardCache = new Map(); // Cache per i risultati delle ricerche
let observerCache = new WeakSet(); // Cache per elementi già processati
let debounceTimer = null; // Debounce per evitare troppe ricerche
let successfulMatches = new Set(); // Traccia match riusciti per evitare riprocessamento

// Inizializza le variabili globali se non esistono
if (typeof window.supabaseClient === 'undefined') {
    window.supabaseClient = null;
}

// Inizializza l'estensione
async function initializeExtension() {
    try {
        console.log('🃏 Pokemon Card Trader Linker - Inizializzazione rapida...');
        
        // Pulisci i match riusciti quando cambia la pagina
        successfulMatches.clear();
        
        // Avvia immediatamente l'osservatore per inserimento veloce
        startObserver();
        
        // Carica la configurazione in background
        if (typeof loadConfig === 'function') {
            loadConfig().then(() => {
                console.log('✅ Configurazione caricata');
            }).catch(error => {
                console.warn('⚠️ Errore nel caricamento configurazione:', error);
            });
        } else {
            console.warn('⚠️ Funzione loadConfig non disponibile');
        }
        
        // Inizializza Supabase in background
        // NOTA: Su Vinted questa funzione viene chiamata più volte a causa della navigazione SPA
        // Il pattern singleton in supabase-config.js garantisce che venga creato un solo client
        if (typeof initializeSupabase === 'function') {
            initializeSupabase().then(supabaseReady => {
                if (supabaseReady) {
                    console.log('✅ Supabase connesso - Cambiando icona a verde');
                    chrome.runtime.sendMessage({ 
                        action: 'updateIcon', 
                        status: 'connected' 
                    });
                } else {
                    console.warn('⚠️ Supabase non configurato, l\'estensione funzionerà in modalità limitata');
                    chrome.runtime.sendMessage({ 
                        action: 'updateIcon', 
                        status: 'error' 
                    });
                }
            }).catch(error => {
                console.warn('⚠️ Errore nell\'inizializzazione Supabase:', error);
            });
        } else {
            console.warn('⚠️ Funzione initializeSupabase non disponibile');
        }
        
        console.log('✅ Estensione inizializzata rapidamente');
        
        // Aggiungi listener per cambi di URL (SPA navigation)
        // PROBLEMA VINTED: La navigazione SPA causa reinizializzazioni multiple dell'estensione
        // Ogni cambio di URL interno su Vinted attiva nuovamente il content script
        // Questo è il motivo principale per cui serviva il pattern singleton per Supabase
        let currentUrl = window.location.href;
        const urlObserver = new MutationObserver(() => {
            if (window.location.href !== currentUrl) {
                console.log('🔄 [CardTrader] URL cambiato, pulendo match riusciti...');
                currentUrl = window.location.href;
                successfulMatches.clear();
                cardCache.clear();
                observerCache = new WeakSet();
                processingElements.clear();
                
                // Rimuovi tutti i pulsanti esistenti
                const existingButtons = document.querySelectorAll('.pokemon-linker-button');
                existingButtons.forEach(button => button.remove());
                
                // Rimuovi attributi di processamento
                const processedElements = document.querySelectorAll('[data-pokemon-linker-processed]');
                processedElements.forEach(element => {
                    element.removeAttribute('data-pokemon-linker-processed');
                });
                
                // Riavvia l'osservatore dopo un breve delay
                setTimeout(() => {
                    startObserver();
                }, 500);
            }
        });
        
        // Osserva cambiamenti nel DOM che potrebbero indicare navigazione SPA
        urlObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
    } catch (error) {
        console.error('❌ Errore nell\'inizializzazione:', error);
        startObserver();
    }
}

// Inizializzazione ultra-rapida che si attiva immediatamente
function initializeUltraFast() {
    console.log('⚡ [CardTrader] Inizializzazione ultra-rapida...');
    
    // Pulisci i match riusciti quando cambia la pagina
    successfulMatches.clear();
    
    // Avvia immediatamente l'osservatore
    startObserver();
    
    // Se il DOM è ancora in caricamento, riavvia quando è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('⚡ [CardTrader] DOM caricato, riavvio osservatore...');
            startObserver();
        });
    }
    
    // Backup: controlla ogni 50ms se ci sono nuovi elementi
    const checkInterval = setInterval(() => {
        if (document.body && !document.querySelector('.pokemon-linker-button')) {
            console.log('⚡ [CardTrader] Controllo periodico - avvio osservatore...');
            startObserver();
        }
        
        // Ferma il controllo dopo 5 secondi
        setTimeout(() => {
            clearInterval(checkInterval);
        }, 5000);
    }, 50);
    
    // Backup finale: se dopo 200ms non è ancora partito, forza l'avvio
    setTimeout(() => {
        if (!document.querySelector('.pokemon-linker-button')) {
            console.log('⚡ [CardTrader] Forzatura finale avvio osservatore...');
            startObserver();
        }
    }, 200);
}

// Avvia l'osservatore per rilevare nuove inserzioni con inserimento immediato
function startObserver() {
    try {
        console.log('🔍 [CardTrader] Avvio osservatore con inserimento immediato...');
        
        // Inserimento immediato per elementi già presenti
        processExistingListingsImmediate();
        
        const observer = new MutationObserver((mutations) => {
            if (!isEnabled) return;
            
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
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
                
                debounceTimer = setTimeout(() => {
                    console.log(`🔄 [CardTrader] Elaborazione successiva di ${pendingListings.length} inserzioni`);
                    
                    // Processa in batch per migliorare le performance
                    const batchSize = 3; // Ridotto da 5 a 3
                    for (let i = 0; i < pendingListings.length; i += batchSize) {
                        const batch = pendingListings.slice(i, i + batchSize);
                        setTimeout(() => {
                            batch.forEach(listing => {
                                // Controlla se abbiamo già un match riuscito per questo elemento
                                const cacheKey = generateCacheKey(extractTitleFromListing(listing) || '');
                                if (!successfulMatches.has(cacheKey)) {
                                    processListing(listing);
                                }
                            });
                        }, i * 50); // Aumentato da 30 a 50ms
                    }
                }, 100); // Aumentato da 50 a 100ms
            }
        });
        
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Processamento periodico ridotto per elementi che potrebbero essere sfuggiti
            setInterval(() => {
                if (isEnabled && !isProcessing) {
                    // Controlla solo se non ci sono pulsanti presenti
                    const existingButtons = document.querySelectorAll('.pokemon-linker-button');
                    if (existingButtons.length === 0) {
                        processExistingListings();
                    }
                }
            }, 5000); // Aumentato da 3 a 5 secondi
            
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
    if (!isEnabled) return;
    
    console.log('⚡ [CardTrader] Processamento immediato delle inserzioni esistenti...');
    
    if (typeof findListings !== 'function') {
        console.warn('⚠️ [CardTrader] Funzione findListings non disponibile');
        return;
    }
    
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
                const cacheKey = generateCacheKey(extractTitleFromListing(listing) || '');
                if (!successfulMatches.has(cacheKey)) {
                    processListing(listing);
                }
            });
        }, 200); // Aumentato da 100 a 200ms
    }
}

// Processamento immediato di una singola inserzione
function processListingImmediate(listingElement) {
    if (!isEnabled || !listingElement || listingElement.hasAttribute('data-pokemon-linker-processed')) {
        return;
    }
    
    try {
        // Estrai il titolo immediatamente
        const title = extractTitleFromListing(listingElement);
        if (!title || title.trim().length < 3) {
            return;
        }
        
        // Controlla se abbiamo già un match riuscito per questo titolo
        const cacheKey = generateCacheKey(title);
        if (successfulMatches.has(cacheKey)) {
            console.log(`🚫 [CardTrader] Match già riuscito per: "${title}", saltando`);
            return;
        }
        
        // Crea un pulsante di caricamento immediato
        const loadingButton = createLoadingButton('Caricamento...');
        insertLinkContainer(listingElement, loadingButton);
        
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

// Processa le inserzioni esistenti
function processExistingListings() {
    if (!isEnabled || isProcessing) return;
    
    if (typeof findListings !== 'function') {
        console.warn('⚠️ [CardTrader] Funzione findListings non disponibile');
        return;
    }
    
    const listings = findListings();
    console.log(`🔍 Trovate ${listings.length} inserzioni da processare`);
    
    // Limita il numero di inserzioni processate per volta
    const limitedListings = listings.slice(0, 10);
    
    limitedListings.forEach(listing => {
        // Controlla se abbiamo già un match riuscito per questo elemento
        const title = extractTitleFromListing(listing);
        if (title) {
            const cacheKey = generateCacheKey(title);
            if (!successfulMatches.has(cacheKey)) {
                processListing(listing);
            }
        }
    });
}

// Processa le nuove inserzioni
// Debounce per evitare comportamenti multipli rapidi
let processNewListingsTimeout = null;

function processNewListings(container) {
    if (!isEnabled || isProcessing) return;
    
    if (typeof findListingsInContainer !== 'function') {
        console.warn('⚠️ [CardTrader] Funzione findListingsInContainer non disponibile');
        return;
    }
    
    // Cancella il timeout precedente
    if (processNewListingsTimeout) {
        clearTimeout(processNewListingsTimeout);
    }
    
    // Debounce di 150ms per evitare comportamenti multipli
    processNewListingsTimeout = setTimeout(() => {
        const listings = findListingsInContainer(container);
        
        // Filtra elementi già processati o in fase di processamento
        const unprocessedListings = listings.filter(listing => 
            !listing.hasAttribute('data-pokemon-linker-processed') &&
            !listing.hasAttribute('data-pokemon-linker-button-added') &&
            !listing.querySelector('.pokemon-linker-button') &&
            !processingElements.has(listing)
        );
        
        console.log(`🔍 [CardTrader] Processando ${unprocessedListings.length} nuove inserzioni (${listings.length} totali)`);
        
        // Limita il numero di inserzioni processate per volta
        const limitedListings = unprocessedListings.slice(0, 5);
        
        limitedListings.forEach(listing => {
            // Controlla se abbiamo già un match riuscito per questo elemento
            const title = extractTitleFromListing(listing);
            if (title) {
                const cacheKey = generateCacheKey(title);
                if (!successfulMatches.has(cacheKey)) {
                    processListing(listing);
                }
            }
        });
    }, 150); // Aumentato da 100 a 150ms
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

// Ottieni i selettori per le inserzioni
function getListingSelectors() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('vinted')) {
        return [
            '[data-testid="item-card"]',
            '.feed-grid__item',
            '.web_ui__Card__body',
            // Selettori più specifici per evitare elementi non rilevanti
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
        // Per Cardmarket, usa solo selettori per listing (non pagine prodotto)
        // Le pagine prodotto sono gestite dal patch
        return [
            '.product-title', // solo per listing
            '.col-12 .product-title' // solo per listing
        ];
    }
    
    return [];
}

// Processa una singola inserzione con cache e ottimizzazioni
// WeakSet per tracciare elementi in fase di processamento
const processingElements = new WeakSet();

async function processListing(listingElement) {
    if (!isEnabled || isProcessing) return;
    
    try {
        // CONTROLLO DUPLICAZIONE ROBUSTO: Verifica tutti i possibili indicatori di duplicazione
        const isAlreadyProcessed = 
            listingElement.hasAttribute('data-pokemon-linker-button-added') ||
            listingElement.hasAttribute('data-pokemon-linker-processed') ||
            observerCache.has(listingElement) ||
            processingElements.has(listingElement) ||
            listingElement.querySelector('.pokemon-linker-button');
        
        // Controllo aggiuntivo per evitare processamento multiplo recente
        const lastProcessedTime = listingElement.getAttribute('data-pokemon-linker-last-processed');
        if (lastProcessedTime) {
            const timeSinceLastProcess = Date.now() - parseInt(lastProcessedTime);
            if (timeSinceLastProcess < 1000) { // 1 secondo di cooldown (ridotto da 5)
                console.log(`🚫 [CardTrader] Elemento processato di recente (${Math.round(timeSinceLastProcess)}ms fa), saltando`);
                return;
            }
        }
        
        if (isAlreadyProcessed) {
            console.log('🚫 [CardTrader] Elemento già processato (controllo robusto), saltando');
            return;
        }
        
        // Marca IMMEDIATAMENTE come in fase di processamento per evitare duplicazioni
        processingElements.add(listingElement);
        listingElement.setAttribute('data-pokemon-linker-processing', 'true');
        
        // Controllo specifico per Cardmarket: evita pagine categoria
        const hostname = window.location.hostname;
        if (hostname.includes('cardmarket')) {
            // Controllo per distinguere tra pagine prodotto e pagine categoria
            const pathParts = window.location.pathname.split('/');
            const isCategoryPage = pathParts.includes('Singles') && pathParts.length > 6;
            
            if (isCategoryPage) {
                console.log(`🚫 [CardTrader] Pagina categoria Cardmarket rilevata, saltando processamento listing`);
                return;
            }
            
            // Controllo aggiuntivo: se siamo su una pagina prodotto, processa solo l'h1 principale
            const isProductPage = window.location.pathname.includes('/en/Pokemon/') || 
                                 window.location.pathname.includes('/it/Pokemon/') ||
                                 window.location.pathname.includes('/de/Pokemon/') ||
                                 window.location.pathname.includes('/fr/Pokemon/');
            
            if (isProductPage) {
                // Su pagine prodotto, processa solo l'h1 principale, non altri elementi
                const isMainH1 = listingElement.matches('.page-title-container .flex-grow-1 h1') || 
                                listingElement.matches('.col-12 .d-flex .flex-grow-1 h1');
                
                if (!isMainH1) {
                    console.log(`🚫 [CardTrader] Non è l'h1 principale su pagina prodotto Cardmarket, saltando`);
                    return;
                }
            }
        }
        
        // Estrai il titolo
        const title = extractTitleFromListing(listingElement);
        if (!title) {
            console.log('🚫 [CardTrader] Nessun titolo trovato, saltando');
            return;
        }
        
        // Controllo per evitare elementi non rilevanti (Vinted specifico)
        if (hostname.includes('vinted')) {
            // Controllo attributi data-testid
            const irrelevantTestIds = ['service', 'commission', 'fee', 'protection', 'payment'];
            const hasIrrelevantTestId = irrelevantTestIds.some(testId => 
                listingElement.getAttribute('data-testid')?.includes(testId) ||
                listingElement.querySelector(`[data-testid*="${testId}"]`)
            );
            
            if (hasIrrelevantTestId) {
                console.log(`🚫 [CardTrader] Elemento con data-testid non rilevante rilevato, saltando`);
                return;
            }
            
            // Controllo testo non rilevante
            const irrelevantTexts = [
                'commissione', 'protezione', 'acquisti', 'spedizione', 'consegna',
                'pagamento', 'sicurezza', 'garanzia', 'restituzione', 'rimborso',
                'assistenza', 'supporto', 'aiuto', 'informazioni', 'condizioni',
                'privacy', 'cookies', 'termini', 'legali', 'contatti'
            ];
            
            const titleLower = title.toLowerCase();
            const hasIrrelevantText = irrelevantTexts.some(text => titleLower.includes(text));
            
            if (hasIrrelevantText) {
                console.log(`🚫 [CardTrader] Elemento non rilevante rilevato: "${title}", saltando`);
                return;
            }
        }
        
        // Genera una chiave cache per questa ricerca
        const cacheKey = generateCacheKey(title);
        
        // Controlla se abbiamo già i risultati in cache
        if (cardCache.has(cacheKey)) {
            console.log(`⚡ [CardTrader] Risultati trovati in cache per: "${title}"`);
            const cachedResults = cardCache.get(cacheKey);
            addCardTraderLinks(listingElement, cachedResults.results, cachedResults.titleInfo);
            observerCache.add(listingElement);
            listingElement.setAttribute('data-pokemon-linker-processed', 'true');
            // Marca come match riuscito anche per i risultati in cache
            successfulMatches.add(cacheKey);
            return;
        }
        
        console.log(`🔍 [CardTrader] Processando inserzione: "${title}"`);
        
        // Estrai informazioni dal titolo
        const titleInfo = extractTitleInfo(title);
        if (!titleInfo.pokemonName) {
            console.log('🚫 [CardTrader] Nessun Pokemon trovato nel titolo, saltando');
            console.log(`🔍 [CardTrader] Titolo analizzato: "${title}"`);
            console.log(`🔍 [CardTrader] TitleInfo:`, titleInfo);
            return;
        }
        
        console.log(`🎯 [CardTrader] Pokemon trovato: ${titleInfo.pokemonName}`);
        console.log(`🔍 [CardTrader] TitleInfo completo:`, titleInfo);
        
        // Crea subito il pulsante grigio (loading)
        const button = createLoadingButton(titleInfo.pokemonName);
        const inserted = insertLinkContainer(listingElement, button);
        
        if (inserted) {
            console.log(`✅ [CardTrader] Aggiunto pulsante CardTrader (loading) per ${titleInfo.pokemonName}`);
            
            // Marca l'elemento come processato
            listingElement.setAttribute('data-pokemon-linker-button-added', 'true');
            
                    // Cerca nel database
        console.log(`🔍 [CardTrader] Avvio ricerca per: "${title}"`);
        let results = await searchCardInDatabase(titleInfo, title);
        console.log(`🔍 [CardTrader] Risultati ricevuti:`, results);
        
        // Se non ci sono risultati e siamo su Vinted, prova a riavviare Supabase
        if ((!results || results.length === 0) && hostname.includes('vinted')) {
            console.log('🔄 [CardTrader] Nessun risultato su Vinted, tentativo di riavvio Supabase...');
            
            // Prova a reinizializzare Supabase
            if (typeof initializeSupabase === 'function') {
                try {
                    const supabaseReady = await initializeSupabase();
                    if (supabaseReady) {
                        console.log('✅ [CardTrader] Supabase riavviato, riprovo la ricerca...');
                        results = await searchCardInDatabase(titleInfo, title);
                        console.log(`🔍 [CardTrader] Risultati dopo riavvio:`, results);
                    }
                } catch (error) {
                    console.warn('⚠️ [CardTrader] Errore nel riavvio Supabase:', error);
                }
            }
        }
        
        if (results && results.length > 0) {
            console.log(`✅ [CardTrader] Trovati ${results.length} risultati`);
            
            // Marca come match riuscito per evitare riprocessamento
            successfulMatches.add(cacheKey);
            
            // Salva in cache per future ricerche
            cardCache.set(cacheKey, { results, titleInfo });
            
            // Limita la dimensione della cache (max 100 elementi)
            if (cardCache.size > 100) {
                const firstKey = cardCache.keys().next().value;
                cardCache.delete(firstKey);
            }
            
            // Cambia il colore in verde quando ha trovato il link
            button.style.background = '#28a745';
            console.log(`✅ [CardTrader] Link trovato, pulsante diventato verde per: ${titleInfo.pokemonName}`);
                
                // Apri direttamente il link CardTrader quando si clicca
                const bestResult = results[0];
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const cardTraderUrl = generateCardTraderLink(bestResult.blueprint_id);
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
            console.log('❌ [CardTrader] Nessun risultato trovato nel database');
            
            // Controlla se Supabase è disponibile
            if (typeof window.supabaseClient === 'undefined' || !window.supabaseClient) {
                console.log('⚠️ [CardTrader] Supabase non disponibile, pulsante rimane grigio');
                button.innerHTML = 'CardTrader (DB offline)';
            }
            
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
        } else {
            console.log(`⚠️ [CardTrader] Impossibile inserire pulsante per ${titleInfo.pokemonName}`);
        }
        
        // Marca come processato
        observerCache.add(listingElement);
        listingElement.setAttribute('data-pokemon-linker-processed', 'true');
        listingElement.setAttribute('data-pokemon-linker-last-processed', Date.now().toString());
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nel processamento inserzione:', error);
    } finally {
        // Rimuovi dall'elenco degli elementi in fase di processamento
        processingElements.delete(listingElement);
        // Rimuovi l'attributo di processamento
        listingElement.removeAttribute('data-pokemon-linker-processing');
    }
}

// Estrai il titolo da un'inserzione
function extractTitleFromListing(listingElement) {
    const hostname = window.location.hostname;
    
    if (hostname.includes('vinted')) {
        // Selettori per Vinted (più specifici)
        const titleSelectors = [
            '[data-testid="item-card-title"]',
            '[data-testid="item-page-summary-plugin"] .web_ui__Text__title',
            '.item-details .web_ui__Text__title',
            '.product-details .web_ui__Text__title',
            '.web_ui__Text__title:not([data-testid*="service"]):not([data-testid*="commission"])'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                let title = element.textContent.trim();
                // Rimuovi eventuali pulsanti CardTrader dal titolo
                title = title.replace(/\bCardTrader\b/g, '').trim();
                return title;
            }
        }
        
        // Fallback: usa il testo dell'elemento stesso
        if (listingElement.textContent && listingElement.textContent.trim()) {
            let title = listingElement.textContent.trim();
            // Rimuovi eventuali pulsanti CardTrader dal titolo
            title = title.replace(/\bCardTrader\b/g, '').trim();
            return title;
        }
        
    } else if (hostname.includes('ebay')) {
        // Selettori per eBay
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
                // Rimuovi eventuali pulsanti CardTrader dal titolo
                title = title.replace(/\bCardTrader\b/g, '').trim();
                return title;
            }
        }
        
        // Fallback: usa il testo dell'elemento stesso
        if (listingElement.textContent && listingElement.textContent.trim()) {
            let title = listingElement.textContent.trim();
            // Rimuovi eventuali pulsanti CardTrader dal titolo
            title = title.replace(/\bCardTrader\b/g, '').trim();
            return title;
        }
    } else if (hostname.includes('cardmarket')) {
        // Cardmarket: pagina prodotto e listing
        const titleSelectors = [
            '.page-title-container', // container principale
            '.page-title-container .flex-grow-1 h1', // h1 specifico
            'h1', // pagina prodotto
            '.product-title', // listing
            '.col-12 .d-flex .flex-grow-1 h1', // struttura tipica Cardmarket
            '.col-12 .product-title'
        ];
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector) || (listingElement.matches(selector) ? listingElement : null);
            if (element && element.textContent && element.textContent.trim()) {
                console.log(`🔍 [CardTrader] Cardmarket selettore trovato: "${selector}"`);
                let title = '';
                // Per Cardmarket, prendi TUTTO il contenuto dell'h1 inclusi gli span (per avere l'espansione)
                if (element.tagName === 'H1') {
                    title = element.textContent.trim();
                    console.log(`🔍 [CardTrader] Cardmarket H1 completo - Titolo estratto: "${title}"`);
                } else {
                    title = element.textContent.trim();
                    console.log(`🔍 [CardTrader] Cardmarket titolo normale - Titolo estratto: "${title}"`);
                }
                // Rimuovi eventuali pulsanti CardTrader dal titolo
                title = title.replace(/\bCardTrader\b/g, '').trim();
                console.log(`🔍 [CardTrader] Cardmarket titolo finale: "${title}"`);
                return title;
            }
        }
        console.log(`❌ [CardTrader] Cardmarket: nessun selettore ha trovato elementi`);
        // Fallback: usa il testo dell'elemento stesso
        if (listingElement.textContent && listingElement.textContent.trim()) {
            let title = listingElement.textContent.trim();
            title = title.replace(/\bCardTrader\b/g, '').trim();
            console.log(`🔍 [CardTrader] Cardmarket fallback - Titolo: "${title}"`);
            return title;
        }
    }
    
    return null;
}

// Aggiungi i link CardTrader
function addCardTraderLinks(listingElement, results, titleInfo) {
    try {
        // Rimuovi solo i pulsanti CardTrader esistenti in questo elemento specifico
        const existingButtons = listingElement.querySelectorAll('.pokemon-linker-button');
        if (existingButtons.length > 0) {
            console.log(`🧹 [CardTrader] Rimossi ${existingButtons.length} pulsanti esistenti da questo elemento`);
            existingButtons.forEach(button => button.remove());
        }
        
        // Crea il pulsante con "CardTrader" (grigio di default)
        const button = document.createElement('button');
        button.className = 'pokemon-linker-button';
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
        
        // Inserisci il pulsante subito (grigio)
        const inserted = insertLinkContainer(listingElement, button);
        
        if (inserted) {
            console.log(`✅ [CardTrader] Aggiunto pulsante CardTrader (loading) per ${titleInfo.pokemonName}`);
            
            // Cerca nel database e cambia colore quando trova risultati
            console.log(`🔍 [CardTrader] Risultati ricevuti: ${results.length} risultati`);
            console.log(`🔍 [CardTrader] Primo risultato:`, results[0]);
            
            const bestResult = results[0];
            if (bestResult) {
                // Cambia il colore in verde quando ha trovato il link CardTrader
                button.style.background = '#28a745';
                console.log(`✅ [CardTrader] Link trovato, pulsante diventato verde`);
                
                // Apri direttamente il link CardTrader quando si clicca
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const cardTraderUrl = generateCardTraderLink(bestResult.blueprint_id);
                    if (cardTraderUrl) {
                        window.open(cardTraderUrl, '_blank');
                    }
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
                console.log(`⚠️ [CardTrader] Nessun risultato trovato, pulsante rimane grigio`);
                
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
        } else {
            console.log(`⚠️ [CardTrader] Impossibile inserire pulsante per ${titleInfo.pokemonName}`);
        }
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nell\'aggiunta pulsante:', error);
    }
}

// Crea un pulsante di loading (grigio)
function createLoadingButton(pokemonName) {
    const button = document.createElement('button');
    button.className = 'pokemon-linker-button';
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
    return button;
}

// Inserisci il pulsante CT
function insertLinkContainer(listingElement, button) {
    const hostname = window.location.hostname;
    
    if (hostname.includes('vinted')) {
        // Per Vinted, inserisci dopo il contenuto principale
        const insertAfterSelectors = [
            '.web_ui__Text__body',
            '.web_ui__Text__subtitle',
            '.web_ui__Text__title',
            '[data-testid="item-card-title"]'
        ];
        
        for (const selector of insertAfterSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.parentNode) {
                const parent = element.parentNode;
                parent.insertBefore(button, element.nextSibling);
                return true;
            }
        }
        
        // Fallback: inserisci dopo l'elemento
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
        
    } else if (hostname.includes('ebay')) {
        // Per eBay, inserisci dopo il titolo
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
        
        // Fallback: inserisci dopo l'elemento
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    } else if (hostname.includes('cardmarket')) {
        // Per Cardmarket, inserisci dopo il titolo
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
        
        // Fallback: inserisci dopo l'elemento
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    }
    
    return false;
}

// Gestisci la ricerca dal popup
async function handlePopupSearch(titleInfo, sendResponse) {
    try {
        console.log('🔍 [CardTrader] Ricerca richiesta dal popup:', titleInfo);
        
        const results = await searchCardInDatabase(titleInfo, titleInfo.originalTitle || '');
        
        sendResponse({
            success: true,
            results: results,
            count: results.length
        });
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nella ricerca popup:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Gestisci la ricerca automatica della pagina corrente
async function handleAutoSearchCurrentPage(sendResponse) {
    try {
        console.log('🔍 [Popup] Ottieni informazioni pagina corrente');
        
        const hostname = window.location.hostname;
        let pageInfo = {
            url: window.location.href,
            title: document.title,
            hostname: hostname
        };
        
        // Estrai il titolo della pagina
        if (hostname.includes('cardmarket')) {
            const titleElement = document.querySelector('h1, .page-title, .product-title');
            if (titleElement) {
                pageInfo.pageTitle = titleElement.textContent.trim();
            }
        } else if (hostname.includes('ebay')) {
            const titleElement = document.querySelector('h1, [data-testid="x-item-title"], .x-item-title');
            if (titleElement) {
                pageInfo.pageTitle = titleElement.textContent.trim();
            }
        } else if (hostname.includes('vinted')) {
            const titleElement = document.querySelector('h1, [data-testid="item-title"], .web_ui__Text__title');
            if (titleElement) {
                pageInfo.pageTitle = titleElement.textContent.trim();
            }
        }
        
        // Se non abbiamo un titolo specifico, usa il titolo del documento
        if (!pageInfo.pageTitle) {
            pageInfo.pageTitle = document.title;
        }
        
        console.log(`✅ [Popup] Informazioni pagina: ${pageInfo.pageTitle}`);
        
        sendResponse({
            success: true,
            pageInfo: pageInfo
        });
        
    } catch (error) {
        console.error('❌ [Popup] Errore nel recupero informazioni pagina:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Funzione specifica per il popup che cerca su Cardmarket
async function searchCardInDatabaseForPopup(titleInfo, originalTitle = '') {
    try {
        // Aspetta che Supabase sia inizializzato se non lo è già
        let supabaseClient = window.supabaseClient;
        
        if (!supabaseClient) {
            console.log('⏳ [Popup] Supabase non inizializzato, aspetto...');
            
            // Aspetta fino a 5 secondi che Supabase sia inizializzato
            let attempts = 0;
            const maxAttempts = 50; // 50 tentativi * 100ms = 5 secondi
            
            while (!supabaseClient && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                supabaseClient = window.supabaseClient;
                attempts++;
                
                if (attempts % 10 === 0) {
                    console.log(`⏳ [Popup] Tentativo ${attempts}/${maxAttempts} - Aspetto Supabase...`);
                }
            }
            
            if (!supabaseClient) {
                console.error('❌ [Popup] Supabase client non disponibile dopo 5 secondi di attesa');
                return [];
            } else {
                console.log('✅ [Popup] Supabase inizializzato, procedo con la ricerca');
            }
        }
        
        console.log('🔍 [Popup] Cercando su Cardmarket con criteri:', JSON.stringify(titleInfo, null, 2));
        
        // Cerca nel database come per CardTrader
        const results = await performSearch(supabaseClient, titleInfo, originalTitle);
        
        // Modifica i risultati per usare link Cardmarket invece di CardTrader
        if (results && results.length > 0) {
            return results.map(result => ({
                ...result,
                cardmarketUrl: generateCardmarketLink(result, titleInfo, originalTitle)
            }));
        }
        
        return results;
        
    } catch (error) {
        console.error('❌ [Popup] Errore nella ricerca:', error);
        return [];
    }
}

// Genera link per Cardmarket
function generateCardmarketLink(result, titleInfo, originalTitle) {
    try {
        // Costruisci una query di ricerca per Cardmarket
        let searchQuery = '';
        
        // Usa il nome del Pokemon
        if (result.name_en) {
            searchQuery += result.name_en;
        } else if (result.pokemon_name) {
            searchQuery += result.pokemon_name;
        } else if (titleInfo.pokemonName) {
            searchQuery += titleInfo.pokemonName;
        }
        
        // Aggiungi l'espansione se disponibile
        if (result.expansion_name_en) {
            searchQuery += ` ${result.expansion_name_en}`;
        } else if (result.expansion_code) {
            searchQuery += ` ${result.expansion_code}`;
        }
        
        // Aggiungi il numero collezionista se disponibile
        if (result.collector_number) {
            searchQuery += ` ${result.collector_number}`;
        }
        
        // Codifica la query per l'URL
        const encodedQuery = encodeURIComponent(searchQuery.trim());
        
        // Genera il link Cardmarket
        return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodedQuery}`;
        
    } catch (error) {
        console.error('❌ [Popup] Errore nella generazione link Cardmarket:', error);
        // Fallback: ricerca generica per Pokemon
        const pokemonName = titleInfo.pokemonName || 'pokemon';
        return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(pokemonName)}`;
    }
}

// Patch per pagine prodotto eBay
function patchEbayProductPage() {
    if (!window.location.hostname.includes('ebay')) return;
    
    try {
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
            console.log('⚠️ [CardTrader] Titolo prodotto eBay non trovato');
            return;
        }
        
        const title = titleElement.textContent.trim();
        if (!title) {
            console.log('⚠️ [CardTrader] Titolo prodotto eBay vuoto');
            return;
        }
        
        console.log(`🔍 [CardTrader] Titolo prodotto eBay: "${title}"`);
        
        // Estrai informazioni dal titolo
        const titleInfo = extractTitleInfo(title);
        if (!titleInfo.pokemonName) {
            console.log('🚫 [CardTrader] Nessun Pokemon trovato nel titolo prodotto');
            return;
        }
        
        // Controlla se il pulsante CT è già presente
        const existingButton = document.querySelector('.pokemon-linker-button');
        if (existingButton) {
            console.log('🚫 [CardTrader] Pulsante CT già presente su eBay, non reinserisco');
            return;
        }
        
        // Crea subito il pulsante grigio (loading)
        const button = document.createElement('button');
        button.className = 'pokemon-linker-button';
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
            console.log(`✅ [CardTrader] Aggiunto pulsante CT (loading) alla pagina prodotto eBay`);
        } else {
            console.log('⚠️ [CardTrader] Impossibile inserire pulsante CT su eBay');
            return;
        }
        
        // Cerca nel database e aggiorna il pulsante
        searchCardInDatabase(titleInfo, title).then(results => {
            if (results && results.length > 0) {
                // Cambia il colore in verde quando ha trovato il link
                button.style.background = '#28a745';
                console.log(`✅ [CardTrader] Link trovato, pulsante diventato verde su eBay`);
                
                // Apri direttamente il link CardTrader quando si clicca
                const bestResult = results[0];
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const cardTraderUrl = generateCardTraderLink(bestResult.blueprint_id);
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
                console.log(`⚠️ [CardTrader] Nessun risultato trovato, pulsante rimane grigio su eBay`);
                
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
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nel patch pagina prodotto eBay:', error);
    }
}

// Patch per pagine prodotto Vinted
function patchVintedProductPage() {
    if (!window.location.hostname.includes('vinted')) return;
    
    try {
        // Cerca il titolo del prodotto
        const titleSelectors = [
            '[data-testid="item-title"]',
            'h1[data-testid="item-title"]',
            'h1',
            '.web_ui__Text__title',
            '.web_ui__Text__subtitle'
        ];
        
        let titleElement = null;
        for (const selector of titleSelectors) {
            titleElement = document.querySelector(selector);
            if (titleElement) break;
        }
        
        if (!titleElement) {
            console.log('⚠️ [CardTrader] Titolo prodotto Vinted non trovato');
            return;
        }
        
        const title = titleElement.textContent.trim();
        if (!title) {
            console.log('⚠️ [CardTrader] Titolo prodotto Vinted vuoto');
            return;
        }
        
        console.log(`🔍 [CardTrader] Titolo prodotto Vinted: "${title}"`);
        
        // Estrai informazioni dal titolo
        const titleInfo = extractTitleInfo(title);
        if (!titleInfo.pokemonName) {
            console.log('🚫 [CardTrader] Nessun Pokemon trovato nel titolo prodotto');
            return;
        }
        
        // Cerca nel database
        searchCardInDatabase(titleInfo, title).then(results => {
            if (results && results.length > 0) {
                // Crea un container per i link
                const linkContainer = document.createElement('div');
                linkContainer.className = 'pokemon-linker-product-links';
                linkContainer.style.cssText = `
                    margin: 16px 0;
                    padding: 16px;
                    background: #f8f9fa;
                    border-radius: 8px;
                    border: 1px solid #e9ecef;
                    font-family: Arial, sans-serif;
                `;
                
                const titleElement = document.createElement('h3');
                titleElement.style.cssText = 'margin: 0 0 12px 0; color: #495057; font-size: 16px;';
                titleElement.textContent = '🔗 CardTrader Links:';
                linkContainer.appendChild(titleElement);
                
                // Aggiungi i link (massimo 5)
                const maxLinks = Math.min(results.length, 5);
                for (let i = 0; i < maxLinks; i++) {
                    const result = results[i];
                    const linkElement = document.createElement('a');
                    linkElement.href = generateCardTraderLink(result.blueprint_id);
                    linkElement.target = '_blank';
                    linkElement.style.cssText = `
                        display: block;
                        margin-bottom: 8px;
                        color: #007bff;
                        text-decoration: none;
                        font-size: 14px;
                        padding: 8px;
                        background: white;
                        border-radius: 4px;
                        border: 1px solid #dee2e6;
                    `;
                    linkElement.textContent = `${result.name_en || result.pokemon_name} (${result.expansion_name_en || 'Unknown'})`;
                    
                    linkElement.addEventListener('mouseenter', () => {
                        linkElement.style.backgroundColor = '#f8f9fa';
                        linkElement.style.textDecoration = 'underline';
                    });
                    
                    linkElement.addEventListener('mouseleave', () => {
                        linkElement.style.backgroundColor = 'white';
                        linkElement.style.textDecoration = 'none';
                    });
                    
                    linkContainer.appendChild(linkElement);
                }
                
                // Inserisci dopo il titolo (con controllo per evitare errori DOM)
                console.log(`🔍 [CardTrader] Tentativo inserimento link container...`);
                console.log(`🔍 [CardTrader] titleElement:`, titleElement);
                console.log(`🔍 [CardTrader] titleElement.parentNode:`, titleElement.parentNode);
                console.log(`🔍 [CardTrader] linkContainer:`, linkContainer);
                
                if (titleElement.parentNode && !titleElement.parentNode.contains(linkContainer)) {
                    console.log(`✅ [CardTrader] Inserimento normale nel parentNode`);
                    titleElement.parentNode.insertBefore(linkContainer, titleElement.nextSibling);
                } else {
                    console.log('⚠️ [CardTrader] Impossibile inserire link container, fallback...');
                    console.log(`🔍 [CardTrader] titleElement.parentNode:`, titleElement.parentNode);
                    console.log(`🔍 [CardTrader] titleElement.parentNode.parentNode:`, titleElement.parentNode?.parentNode);
                    
                    // Fallback sicuro: inserisci dopo l'elemento padre del titolo
                    if (titleElement.parentNode && titleElement.parentNode.parentNode) {
                        console.log(`✅ [CardTrader] Fallback 1: inserimento nel parentNode del parentNode`);
                        titleElement.parentNode.parentNode.insertBefore(linkContainer, titleElement.parentNode.nextSibling);
                    } else {
                        // Ultimo fallback: inserisci alla fine del body
                        console.log(`✅ [CardTrader] Fallback 2: inserimento nel body`);
                        document.body.appendChild(linkContainer);
                    }
                }
                
                console.log(`✅ [CardTrader] Aggiunti ${maxLinks} link CardTrader alla pagina prodotto`);
                
                // Verifica se i pulsanti sono stati inseriti correttamente
                const insertedButtons = document.querySelectorAll('.pokemon-linker-button');
                console.log(`🔍 [CardTrader] Pulsanti CT trovati nella pagina: ${insertedButtons.length}`);
                
                // Aggiorna SOLO i pulsanti appena inseriti (gli ultimi maxLinks)
                if (results && results.length > 0) {
                    // Prendi solo gli ultimi maxLinks pulsanti (quelli appena inseriti)
                    const recentButtons = Array.from(insertedButtons).slice(-maxLinks);
                    console.log(`🔍 [CardTrader] Aggiornando ${recentButtons.length} pulsanti recenti`);
                    
                    recentButtons.forEach((button, index) => {
                        // Rimuovi event listener esistenti per evitare duplicati
                        const newButton = button.cloneNode(true);
                        button.parentNode.replaceChild(newButton, button);
                        
                        // Cambia il colore in verde
                        newButton.style.background = '#28a745';
                        console.log(`✅ [CardTrader] Pulsante ${index + 1} diventato verde`);
                        
                        // Aggiungi event listener per il click
                        const result = results[index];
                        newButton.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const cardTraderUrl = generateCardTraderLink(result.blueprint_id);
                            window.open(cardTraderUrl, '_blank');
                        });
                    });
                }
            }
        });
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nel patch pagina prodotto Vinted:', error);
    }
}

// Patch per pagine prodotto Cardmarket
function patchCardmarketProductPage() {
    if (!window.location.hostname.includes('cardmarket')) return;
    
    try {
        // Cerca il titolo del prodotto
        const titleSelectors = [
            '.page-title-container h1',
            'h1',
            '.col-12 .d-flex .flex-grow-1 h1',
            '.product-details h1',
            '.card-title',
            '.product-title'
        ];
        
        let titleElement = null;
        for (const selector of titleSelectors) {
            titleElement = document.querySelector(selector);
            if (titleElement) break;
        }
        
        if (!titleElement) {
            console.log('⚠️ [CardTrader] Titolo prodotto Cardmarket non trovato');
            return;
        }
        
        // Per Cardmarket, prendi TUTTO il contenuto dell'h1 inclusi gli span (per avere l'espansione)
        let title = titleElement.textContent.trim();
        
        if (!title) {
            console.log('⚠️ [CardTrader] Titolo prodotto Cardmarket vuoto');
            return;
        }
        
        console.log(`🔍 [CardTrader] Titolo prodotto Cardmarket: "${title}"`);
        
        // Estrai informazioni dal titolo
        const titleInfo = extractTitleInfo(title);
        if (!titleInfo.pokemonName) {
            console.log('🚫 [CardTrader] Nessun Pokemon trovato nel titolo prodotto');
            return;
        }
        
        // Crea subito il pulsante grigio (loading)
        const button = document.createElement('button');
        button.className = 'pokemon-linker-button';
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
        
        // Prima controlla se il pulsante CT è già presente da qualche parte nella pagina
        const existingButton = document.querySelector('.pokemon-linker-button');
        if (existingButton) {
            console.log('🚫 [CardTrader] Pulsante CT già presente, non reinserisco');
            buttonInserted = true; // Il pulsante esiste già
        } else {
            // Il pulsante non esiste, procedi con l'inserimento
            if (supportLink && supportLink.parentNode) {
                supportLink.parentNode.replaceChild(button, supportLink);
                console.log(`✅ [CardTrader] Sostituito link supporto con pulsante CT su Cardmarket (loading)`);
                buttonInserted = true;
            } else {
                // Cerca il contenitore del link di supporto e inserisci il pulsante lì
                const supportContainer = document.querySelector('.align-self-end.mb-md-1 div');
                if (supportContainer) {
                    supportContainer.appendChild(button);
                    console.log(`✅ [CardTrader] Inserito pulsante CT nel contenitore supporto su Cardmarket (loading)`);
                    buttonInserted = true;
                } else {
                    // Fallback: inserisci direttamente nell'h1
                    titleElement.appendChild(button);
                    console.log(`✅ [CardTrader] Aggiunto pulsante CT alla pagina prodotto Cardmarket (loading fallback)`);
                    buttonInserted = true;
                }
            }
        }

        
        // Cerca nel database SOLO se il pulsante è stato inserito o esiste già
        if (!buttonInserted) {
            console.log('❌ [CardTrader] Pulsante CT non inserito, saltando ricerca database');
            return;
        }
        
        // Ottieni il riferimento al pulsante (quello appena creato o quello esistente)
        let targetButton = button; // Usa il pulsante appena creato se inserito
        if (!button.parentNode) {
            // Se il pulsante non è stato inserito, cerca quello esistente
            targetButton = document.querySelector('.pokemon-linker-button');
            if (!targetButton) {
                console.log('❌ [CardTrader] Pulsante CT non trovato nella pagina, saltando ricerca database');
                return;
            }
        }
        
        // Esegui sempre la ricerca database se il pulsante esiste (nuovo o già presente)
        console.log('🔍 [CardTrader] Avvio ricerca database per:', titleInfo.pokemonName);
        searchCardInDatabase(titleInfo, title).then(results => {
            if (results && results.length > 0) {
                // Cambia il colore in verde quando ha trovato il link
                targetButton.style.background = '#28a745';
                console.log(`✅ [CardTrader] Link trovato, pulsante diventato verde`);
                
                // Apri direttamente il link CardTrader quando si clicca
                targetButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const bestResult = results[0];
                    const cardTraderUrl = generateCardTraderLink(bestResult.blueprint_id);
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
                console.log(`⚠️ [CardTrader] Nessun risultato trovato, pulsante rimane grigio`);
                
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
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nel patch pagina prodotto Cardmarket:', error);
    }
}

// Estrai informazioni dal titolo
function extractTitleInfo(title) {
    // Pulisci il titolo da "CardTrader" e altri elementi dell'estensione
    let cleanTitle = title.replace(/\bCardTrader\b/g, '').trim();
    cleanTitle = cleanTitle.replace(/\bDB offline\b/g, '').trim();
    cleanTitle = cleanTitle.replace(/\bCaricamento\.\.\.\b/g, '').trim();
    
    console.log(`🔍 [CardTrader] Processando titolo: "${cleanTitle}" (originale: "${title}")`);
    const titleLower = cleanTitle.toLowerCase();
    
    // Gestione speciale per Pokemon con nomi multipli o varianti
    const specialCases = {
        'mr. mime': 'mr-mime',
        'mr mime': 'mr-mime', 
        'mrmime': 'mr-mime',
        'mr. mime galar': 'mr-rime',
        'mr mime galar': 'mr-rime',
        'mrmime galar': 'mr-rime',
        'mr. rime': 'mr-rime',
        'mr rime': 'mr-rime',
        'mrrime': 'mr-rime',
        'mime jr.': 'mime-jr',
        'mime jr': 'mime-jr',
        'mimejr': 'mime-jr',
        'type: null': 'type-null',
        'type null': 'type-null',
        'typenull': 'type-null',
        'porygon-z': 'porygon-z',
        'porygon z': 'porygon-z',
        'porygonz': 'porygon-z',
        'ho-oh': 'ho-oh',
        'ho oh': 'ho-oh',
        'hooh': 'ho-oh',
        'jangmo-o': 'jangmo-o',
        'jangmo o': 'jangmo-o',
        'jangmoo': 'jangmo-o',
        'hakamo-o': 'hakamo-o',
        'hakamo o': 'hakamo-o',
        'hakamoo': 'hakamo-o',
        'kommo-o': 'kommo-o',
        'kommo o': 'kommo-o',
        'kommoo': 'kommo-o',
        'farfetch\'d': 'farfetchd',
        'farfetchd': 'farfetchd',
        'sirfetch\'d': 'sirfetchd',
        'sirfetchd': 'sirfetchd',
        'flabébé': 'flabebe',
        'flabebe': 'flabebe',
        'floette': 'floette',
        'florges': 'florges',
        'oricorio': 'oricorio',
        'oricorio baile': 'oricorio-baile',
        'oricorio pom-pom': 'oricorio-pom-pom',
        'oricorio pom pom': 'oricorio-pom-pom',
        'oricorio pom': 'oricorio-pom-pom',
        'oricorio pau': 'oricorio-pau',
        'oricorio sensu': 'oricorio-sensu',
        'minior': 'minior',
        'minior red': 'minior-red',
        'minior blue': 'minior-blue',
        'minior green': 'minior-green',
        'minior yellow': 'minior-yellow',
        'minior orange': 'minior-orange',
        'minior violet': 'minior-violet',
        'minior indigo': 'minior-indigo',
        'mimikyu': 'mimikyu',
        'mimikyu busted': 'mimikyu-busted',
        'mimikyu totem': 'mimikyu-totem',
        'toxtricity': 'toxtricity',
        'toxtricity amped': 'toxtricity-amped',
        'toxtricity low key': 'toxtricity-low-key',
        'toxtricity lowkey': 'toxtricity-low-key',
        'urshifu': 'urshifu',
        'urshifu single strike': 'urshifu-single-strike',
        'urshifu rapid strike': 'urshifu-rapid-strike',
        'calyrex': 'calyrex',
        'calyrex ice rider': 'calyrex-ice-rider',
        'calyrex shadow rider': 'calyrex-shadow-rider',
        'enamorus': 'enamorus',
        'enamorus incarnate': 'enamorus-incarnate',
        'enamorus therian': 'enamorus-therian'
    };

    // Lista completa di tutti i Pokemon (Generazioni 1-9)
    const pokemonNames = [
        // Generazione 1 (Kanto) - 151 Pokemon
        'bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard',
        'squirtle', 'wartortle', 'blastoise', 'caterpie', 'metapod', 'butterfree',
        'weedle', 'kakuna', 'beedrill', 'pidgey', 'pidgeotto', 'pidgeot',
        'rattata', 'raticate', 'spearow', 'fearow', 'ekans', 'arbok',
        'pichu', 'pikachu', 'raichu', 'sandshrew', 'sandslash', 'nidoran♀', 'nidorina', 'nidoqueen',
        'nidoran♂', 'nidorino', 'nidoking', 'cleffa', 'clefairy', 'clefable',
        'vulpix', 'ninetales', 'igglybuff', 'jigglypuff', 'wigglytuff', 'zubat', 'golbat',
        'oddish', 'gloom', 'vileplume', 'paras', 'parasect', 'venonat', 'venomoth',
        'diglett', 'dugtrio', 'meowth', 'persian', 'psyduck', 'golduck',
        'mankey', 'primeape', 'growlithe', 'arcanine', 'poliwag', 'poliwhirl', 'poliwrath',
        'abra', 'kadabra', 'alakazam', 'machop', 'machoke', 'machamp',
        'bellsprout', 'weepinbell', 'victreebel', 'tentacool', 'tentacruel', 'geodude', 'graveler', 'golem',
        'ponyta', 'rapidash', 'slowpoke', 'slowbro', 'magnemite', 'magneton',
        'farfetch\'d', 'doduo', 'dodrio', 'seel', 'dewgong', 'grimer', 'muk',
        'shellder', 'cloyster', 'gastly', 'haunter', 'gengar', 'drowzee', 'hypno',
        'krabby', 'kingler', 'voltorb', 'electrode', 'exeggcute', 'exeggutor',
        'cubone', 'marowak', 'tyrogue', 'hitmonlee', 'hitmonchan', 'hitmontop', 'lickitung',
        'koffing', 'weezing', 'rhyhorn', 'rhydon', 'chansey', 'tangela',
        'kangaskhan', 'horsea', 'seadra', 'goldeen', 'seaking', 'staryu', 'starmie',
        'mime jr.', 'mr. mime', 'scyther', 'smoochum', 'jynx', 'elekid', 'electabuzz',
        'magby', 'magmar', 'pinsir', 'tauros', 'magikarp', 'gyarados',
        'lapras', 'ditto', 'vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon',
        'omanyte', 'omastar', 'kabuto', 'kabutops', 'aerodactyl', 'munchlax', 'snorlax',
        'articuno', 'zapdos', 'moltres', 'dratini', 'dragonair', 'dragonite',
        'mewtwo', 'mew',
        
        // Generazione 2 (Johto) - 100 Pokemon
        'chikorita', 'bayleef', 'meganium', 'cyndaquil', 'quilava', 'typhlosion',
        'totodile', 'croconaw', 'feraligatr', 'sentret', 'furret', 'hoothoot', 'noctowl',
        'ledyba', 'ledian', 'spinarak', 'ariados', 'chinchou', 'lanturn',
        'togepi', 'togetic', 'togekiss', 'natu', 'xatu', 'mareep', 'flaaffy', 'ampharos',
        'azurill', 'marill', 'azumarill', 'sudowoodo', 'hoppip', 'skiploom', 'jumpluff',
        'aipom', 'sunkern', 'sunflora', 'yanma', 'wooper', 'quagsire',
        'murkrow', 'slowking', 'misdreavus', 'unown', 'wobbuffet', 'girafarig',
        'pineco', 'forretress', 'dunsparce', 'gligar', 'steelix', 'snubbull', 'granbull',
        'qwilfish', 'scizor', 'shuckle', 'heracross', 'sneasel', 'teddiursa', 'ursaring',
        'slugma', 'magcargo', 'swinub', 'piloswine', 'corsola', 'remoraid', 'octillery',
        'delibird', 'mantine', 'skarmory', 'houndour', 'houndoom', 'kingdra',
        'phanpy', 'donphan', 'porygon2', 'stantler', 'smeargle', 'tyrogue', 'hitmontop',
        'smoochum', 'elekid', 'magby', 'miltank', 'blissey', 'raikou', 'entei', 'suicune',
        'larvitar', 'pupitar', 'tyranitar', 'lugia', 'ho-oh', 'celebi',
        
        // Generazione 3 (Hoenn) - 135 Pokemon
        'treecko', 'grovyle', 'sceptile', 'torchic', 'combusken', 'blaziken',
        'mudkip', 'marshtomp', 'swampert', 'poochyena', 'mightyena', 'zigzagoon', 'linoone',
        'wurmple', 'silcoon', 'beautifly', 'cascoon', 'dustox', 'lotad', 'lombre', 'ludicolo',
        'seedot', 'nuzleaf', 'shiftry', 'taillow', 'swellow', 'wingull', 'pelipper',
        'ralts', 'kirlia', 'gardevoir', 'gallade', 'surskit', 'masquerain', 'shroomish', 'breloom',
        'slakoth', 'vigoroth', 'slaking', 'nincada', 'ninjask', 'shedinja',
        'whismur', 'loudred', 'exploud', 'makuhita', 'hariyama', 'azurill', 'nosepass', 'probopass',
        'skitty', 'delcatty', 'sableye', 'mawile', 'aron', 'lairon', 'aggron',
        'meditite', 'medicham', 'electrike', 'manectric', 'plusle', 'minun', 'volbeat', 'illumise',
        'roselia', 'gulpin', 'swalot', 'carvanha', 'sharpedo', 'wailmer', 'wailord',
        'numel', 'camerupt', 'torkoal', 'spoink', 'grumpig', 'spinda', 'trapinch', 'vibrava', 'flygon',
        'cacnea', 'cacturne', 'swablu', 'altaria', 'zangoose', 'seviper', 'lunatone', 'solrock',
        'barboach', 'whiscash', 'corphish', 'crawdaunt', 'baltoy', 'claydol', 'lileep', 'cradily',
        'anorith', 'armaldo', 'feebas', 'milotic', 'castform', 'kecleon', 'shuppet', 'banette',
        'duskull', 'dusclops', 'dusknoir', 'tropius', 'chimecho', 'absol', 'wynaut', 'wobbuffet',
        'snorunt', 'glalie', 'froslass', 'spheal', 'sealeo', 'walrein', 'clamperl', 'huntail', 'gorebyss',
        'relicanth', 'luvdisc', 'bagon', 'shelgon', 'salamence', 'beldum', 'metang', 'metagross',
        'regirock', 'regice', 'registeel', 'latias', 'latios', 'kyogre', 'groudon', 'rayquaza',
        'jirachi', 'deoxys',
        
        // Generazione 4 (Sinnoh) - 107 Pokemon
        'turtwig', 'grotle', 'torterra', 'chimchar', 'monferno', 'infernape',
        'piplup', 'prinplup', 'empoleon', 'starly', 'staravia', 'staraptor', 'bidoof', 'bibarel',
        'kricketot', 'kricketune', 'shinx', 'luxio', 'luxray', 'budew', 'roserade',
        'cranidos', 'rampardos', 'shieldon', 'bastiodon', 'burmy', 'wormadam', 'mothim',
        'combee', 'vespiquen', 'pachirisu', 'buizel', 'floatzel', 'cherubi', 'cherrim',
        'shellos', 'gastrodon', 'ambipom', 'drifloon', 'drifblim', 'buneary', 'lopunny',
        'mismagius', 'honchkrow', 'glameow', 'purugly', 'chingling', 'stunky', 'skuntank',
        'bronzor', 'bronzong', 'bonsly', 'mime jr.', 'happiny', 'chatot', 'spiritomb',
        'gible', 'gabite', 'garchomp', 'munchlax', 'riolu', 'lucario', 'hippopotas', 'hippowdon',
        'skorupi', 'drapion', 'croagunk', 'toxicroak', 'carnivine', 'finneon', 'lumineon',
        'mantyke', 'snover', 'abomasnow', 'weavile', 'magnezone', 'lickilicky', 'rhyperior',
        'tangrowth', 'electivire', 'magmortar', 'togekiss', 'yanmega', 'leafeon', 'glaceon',
        'gliscor', 'mamoswine', 'porygon-z', 'gallade', 'probopass', 'dusknoir', 'froslass',
        'rotom', 'uxie', 'mesprit', 'azelf', 'dialga', 'palkia', 'heatran', 'regigigas',
        'giratina', 'cresselia', 'phione', 'manaphy', 'darkrai', 'shaymin', 'arceus',
        
        // Generazione 5 (Unova) - 156 Pokemon
        'victini', 'snivy', 'servine', 'serperior', 'tepig', 'pignite', 'emboar',
        'oshawott', 'dewott', 'samurott', 'patrat', 'watchog', 'lillipup', 'herdier', 'stoutland',
        'purrloin', 'liepard', 'pansage', 'simisage', 'pansear', 'simisear', 'panpour', 'simipour',
        'munna', 'musharna', 'pidove', 'tranquill', 'unfezant', 'blitzle', 'zebstrika',
        'roggenrola', 'boldore', 'gigalith', 'woobat', 'swoobat', 'drilbur', 'excadrill',
        'audino', 'timburr', 'gurdurr', 'conkeldurr', 'tympole', 'palpitoad', 'seismitoad',
        'throh', 'sawk', 'sewaddle', 'swadloon', 'leavanny', 'venipede', 'whirlipede', 'scolipede',
        'cottonee', 'whimsicott', 'petilil', 'lilligant', 'basculin', 'sandile', 'krokorok', 'krookodile',
        'darumaka', 'darmanitan', 'maractus', 'dwebble', 'crustle', 'scraggy', 'scrafty',
        'sigilyph', 'yamask', 'cofagrigus', 'tirtouga', 'carracosta', 'archen', 'archeops',
        'trubbish', 'garbodor', 'zorua', 'zoroark', 'minccino', 'cinccino', 'gothita', 'gothorita', 'gothitelle',
        'solosis', 'duosion', 'reuniclus', 'ducklett', 'swanna', 'vanillite', 'vanillish', 'vanilluxe',
        'deerling', 'sawsbuck', 'emolga', 'karrablast', 'escavalier', 'foongus', 'amoonguss',
        'frillish', 'jellicent', 'alomomola', 'joltik', 'galvantula', 'ferroseed', 'ferrothorn',
        'klink', 'klang', 'klinklang', 'tynamo', 'eelektrik', 'eelektross', 'elgyem', 'beheeyem',
        'litwick', 'lampent', 'chandelure', 'axew', 'fraxure', 'haxorus', 'cubchoo', 'beartic',
        'cryogonal', 'shelmet', 'accelgor', 'stunfisk', 'mienfoo', 'mienshao', 'druddigon',
        'golett', 'golurk', 'pawniard', 'bisharp', 'kingambit', 'bouffalant', 'rufflet', 'braviary',
        'vullaby', 'mandibuzz', 'heatmor', 'durant', 'deino', 'zweilous', 'hydreigon',
        'larvesta', 'volcarona', 'cobalion', 'terrakion', 'virizion', 'tornadus', 'thundurus', 'reshiram',
        'zekrom', 'landorus', 'kyurem', 'keldeo', 'meloetta', 'genesect',
        
        // Generazione 6 (Kalos) - 72 Pokemon
        'chespin', 'quilladin', 'chesnaught', 'fennekin', 'braixen', 'delphox',
        'froakie', 'frogadier', 'greninja', 'bunnelby', 'diggersby', 'fletchling', 'fletchinder', 'talonflame',
        'scatterbug', 'spewpa', 'vivillon', 'litleo', 'pyroar', 'flabébé', 'floette', 'florges',
        'skiddo', 'gogoat', 'pancham', 'pangoro', 'furfrou', 'espurr', 'meowstic',
        'honedge', 'doublade', 'aegislash', 'spritzee', 'aromatisse', 'swirlix', 'slurpuff',
        'inkay', 'malamar', 'binacle', 'barbaracle', 'skrelp', 'dragalge', 'clauncher', 'clawitzer',
        'helioptile', 'heliolisk', 'tyrunt', 'tyrantrum', 'amaura', 'aurorus',
        'sylveon', 'hawlucha', 'dedenne', 'carbink', 'goomy', 'sliggoo', 'goodra',
        'klefki', 'phantump', 'trevenant', 'pumpkaboo', 'gourgeist', 'bergmite', 'avalugg',
        'noibat', 'noivern', 'xerneas', 'yveltal', 'zygarde', 'diancie', 'hoopa', 'volcanion',
        
        // Generazione 7 (Alola) - 88 Pokemon
        'rowlet', 'dartrix', 'decidueye', 'litten', 'torracat', 'incineroar',
        'popplio', 'brionne', 'primarina', 'pikipek', 'trumbeak', 'toucannon', 'yungoos', 'gumshoos',
        'grubbin', 'charjabug', 'vikavolt', 'crabrawler', 'crabominable', 'oricorio',
        'cutiefly', 'ribombee', 'rockruff', 'lycanroc', 'wishiwashi', 'mareanie', 'toxapex',
        'mudbray', 'mudsdale', 'dewpider', 'araquanid', 'fomantis', 'lurantis', 'morelull', 'shiinotic',
        'salandit', 'salazzle', 'stufful', 'bewear', 'bounsweet', 'steenee', 'tsareena',
        'comfey', 'oranguru', 'passimian', 'wimpod', 'golisopod', 'sandygast', 'palossand', 'pyukumuku',
        'type: null', 'silvally', 'minior', 'komala', 'turtonator', 'togedemaru',
        'mimikyu', 'bruxish', 'drampa', 'dhelmise', 'jangmo-o', 'hakamo-o', 'kommo-o',
        'tapu koko', 'tapu lele', 'tapu bulu', 'tapu fini', 'cosmog', 'cosmoem', 'solgaleo', 'lunala',
        'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord',
        'necrozma', 'magearna', 'marshadow', 'poipole', 'naganadel', 'stakataka', 'blacephalon', 'zeraora',
        'meltan', 'melmetal',
        
        // Generazione 8 (Galar) - 89 Pokemon
        'grookey', 'thwackey', 'rillaboom', 'scorbunny', 'raboot', 'cinderace',
        'sobble', 'drizzile', 'inteleon', 'skwovet', 'greedent', 'rookidee', 'corvisquire', 'corviknight',
        'blipbug', 'dottler', 'orbeetle', 'nickit', 'thievul', 'gossifleur', 'eldegoss',
        'wooloo', 'dubwool', 'chewtle', 'drednaw', 'yamper', 'boltund', 'rolycoly', 'carkol', 'coalossal',
        'applin', 'flapple', 'appletun', 'silicobra', 'sandaconda', 'cramorant', 'arrokuda', 'barraskewda',
        'toxel', 'toxtricity', 'sizzlipede', 'centiskorch', 'clobbopus', 'grapploct', 'sinistea', 'polteageist',
        'hatenna', 'hattrem', 'hatterene', 'impidimp', 'morgrem', 'grimmsnarl', 'obstagoon',
        'perrserker', 'cursola', 'sirfetch\'d', 'mr. rime', 'runerigus', 'milcery', 'alcremie',
        'falinks', 'pincurchin', 'snom', 'frosmoth', 'stonjourner', 'eiscue', 'indeedee', 'morpeko',
        'cufant', 'copperajah', 'dracozolt', 'arctozolt', 'dracovish', 'arctovish', 'duraludon',
        'dreepy', 'drakloak', 'dragapult', 'zacian', 'zamazenta', 'eternatus', 'kubfu', 'urshifu',
        'zarude', 'regieleki', 'regidrago', 'glastrier', 'spectrier', 'calyrex',
        
        // Generazione 9 (Paldea) - 120 Pokemon
        'sprigatito', 'floragato', 'meowscarada', 'fuecoco', 'crocalor', 'skeledirge',
        'quaxly', 'quaxwell', 'quaquaval', 'lechonk', 'oinkologne', 'tarountula', 'spidops',
        'nymble', 'lokix', 'pawmi', 'pawmo', 'pawmot', 'tandemaus', 'maushold',
        'fidough', 'dachsbun', 'smoliv', 'dolliv', 'arboliva', 'squawkabilly',
        'nacli', 'naclstack', 'garganacl', 'charcadet', 'armarouge', 'ceruledge',
        'tadbulb', 'bellibolt', 'wattrel', 'kilowattrel', 'maschiff', 'mabosstiff',
        'shroodle', 'grafaiai', 'bramblin', 'brambleghast', 'toedscool', 'toedscruel',
        'klawf', 'capsakid', 'scovillain', 'rellor', 'rabsca', 'flittle', 'espathra',
        'tinkatink', 'tinkatuff', 'tinkaton', 'wiglett', 'wugtrio', 'bombirdier',
        'finizen', 'palafin', 'varoom', 'revavroom', 'cyclizar', 'orthworm',
        'glimmet', 'glimmora', 'greavard', 'houndstone', 'flamigo', 'cetoddle', 'cetitan',
        'veluza', 'dondozo', 'tatsugiri', 'annihilape', 'clodsire', 'farigiraf',
        'dudunsparce', 'kingambit', 'great tusk', 'scream tail', 'brute bonnet', 'flutter mane',
        'slither wing', 'sandy shocks', 'iron treads', 'iron bundle', 'iron hands', 'iron jugulis',
        'iron moth', 'iron thorns', 'frigibax', 'arctibax', 'baxcalibur', 'gimmighoul', 'gholdengo',
        'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu', 'roaring moon', 'iron valiant',
        'koraidon', 'miraidon', 'walking wake', 'iron leaves', 'okidogi', 'munkidori', 'fezandipiti',
        'ogerpon', 'gouging fire', 'raging bolt', 'iron boulder', 'iron crown', 'terapagos', 'pecharunt'
    ];
    
    // Cerca il Pokemon nel titolo con fuzzy search
    let pokemonName = null;
    let secondPokemonName = null;
    const titleWords = titleLower.split(/\s+/);
    
    // Prima controlla i casi speciali (varianti di nomi)
    for (const [variant, pokemonId] of Object.entries(specialCases)) {
        if (titleLower.includes(variant)) {
            pokemonName = pokemonId;
            console.log(`🎯 [CardTrader] Caso speciale trovato: "${variant}" → "${pokemonId}"`);
            break;
        }
    }
    
    // Se non ha trovato casi speciali, cerca nella lista normale
    if (!pokemonName) {
        // Prima cerca match esatti, dando priorità ai Pokemon che appaiono prima nel titolo
        const foundPokemon = [];
        for (const pokemon of pokemonNames) {
            const pokemonLower = pokemon.toLowerCase();
            const index = titleLower.indexOf(pokemonLower);
            if (index !== -1) {
                foundPokemon.push({ pokemon, index });
            }
        }
    
    // Ordina per posizione nel titolo (prima = priorità più alta)
    foundPokemon.sort((a, b) => a.index - b.index);
    
    if (foundPokemon.length > 0) {
        // Se abbiamo più Pokemon, cerca di identificare quello principale
        if (foundPokemon.length > 1) {
            console.log(`🔍 [CardTrader] Trovati ${foundPokemon.length} Pokemon nel titolo:`, foundPokemon.map(p => p.pokemon));
            
            // Cerca pattern specifici che indicano il Pokemon principale
            const mainPokemonPatterns = [
                /(umbreon|espeon|sylveon|leafeon|glaceon|flareon|jolteon|vaporeon)\s+ex/i,
                /(mew|mewtwo|rayquaza|charizard|blastoise|venusaur)\s+ex/i,
                /(pikachu|raichu)\s+ex/i
            ];
            
            for (const pattern of mainPokemonPatterns) {
                const match = title.match(pattern);
                if (match) {
                    const mainPokemon = match[1].toLowerCase();
                    const found = foundPokemon.find(p => p.pokemon.toLowerCase() === mainPokemon);
                    if (found) {
                        pokemonName = found.pokemon;
                        console.log(`🎯 [CardTrader] Pokemon principale identificato dal pattern: "${pokemonName}"`);
                        break;
                    }
                }
            }
            
            // Se non abbiamo trovato un pattern specifico, usa il primo
            if (!pokemonName) {
                pokemonName = foundPokemon[0].pokemon;
                console.log(`🎯 [CardTrader] Usando primo Pokemon trovato: "${pokemonName}"`);
            }
            
            // Il secondo Pokemon è il prossimo nella lista
            secondPokemonName = foundPokemon[1].pokemon;
            console.log(`🎯 [CardTrader] Secondo Pokemon: "${secondPokemonName}"`);
        } else {
            pokemonName = foundPokemon[0].pokemon;
            console.log(`🎯 [CardTrader] Match esatto trovato: "${pokemonName}" in "${title}"`);
        }
    }
    }
    
    // Estrazione specifica per Cardmarket: cerca pattern come "Pokemon (SET 123)" o "Pokemon (SET123)"
    let cardmarketMatch = title.match(/([a-z]+)\s+\(([a-z]{2,4})\s*(\d+)\)/i);
    
    // Se non trova il pattern con parentesi, cerca senza parentesi: "Pokemon SET 123"
    if (!cardmarketMatch) {
        cardmarketMatch = title.match(/([a-z]+)\s+([a-z]{2,4})\s+(\d+)/i);
    }
    
    if (cardmarketMatch) {
        const [, extractedPokemon, setCode, cardNumber] = cardmarketMatch;
        console.log(`🎯 [CardTrader] Pattern Cardmarket trovato: Pokemon="${extractedPokemon}", Set="${setCode}", Numero="${cardNumber}"`);
        
        // Se il Pokemon estratto dal pattern corrisponde a un Pokemon valido
        const extractedPokemonLower = extractedPokemon.toLowerCase();
        if (pokemonNames.includes(extractedPokemonLower)) {
            // Solo se non abbiamo già trovato un Pokemon dal titolo principale
            if (!pokemonName) {
                pokemonName = extractedPokemon;
                console.log(`✅ [CardTrader] Pokemon confermato dal pattern Cardmarket: "${pokemonName}"`);
            } else {
                console.log(`⚠️ [CardTrader] Pokemon già trovato nel titolo principale: "${pokemonName}", ignorando pattern Cardmarket: "${extractedPokemon}"`);
            }
        } else {
            // Cerca un match fuzzy nel caso il nome non sia esatto
            if (!pokemonName) {
                for (const pokemon of pokemonNames) {
                    if (pokemon.toLowerCase() === extractedPokemonLower || 
                        pokemon.toLowerCase().includes(extractedPokemonLower) || 
                        extractedPokemonLower.includes(pokemon.toLowerCase())) {
                        pokemonName = pokemon;
                        console.log(`✅ [CardTrader] Pokemon trovato con match fuzzy dal pattern Cardmarket: "${extractedPokemon}" -> "${pokemonName}"`);
                        break;
                    }
                }
            }
        }
    }
    
    // Se non trova match esatti, cerca match fuzzy
    if (!pokemonName) {
        console.log(`🔍 [CardTrader] Nessun match esatto, cercando match fuzzy...`);
        
        for (const pokemon of pokemonNames) {
            const pokemonLower = pokemon.toLowerCase();
            
            // Controlla ogni parola del titolo
            for (const word of titleWords) {
                const wordLower = word.toLowerCase();
                
                // Match fuzzy: una parola contiene il Pokemon o viceversa
                if (wordLower.includes(pokemonLower) || pokemonLower.includes(wordLower)) {
                    // Calcola similarità per evitare falsi positivi
                    const similarity = calculateSimilarity(wordLower, pokemonLower);
                    
                    if (similarity >= 0.7) { // Soglia di similarità
                        pokemonName = pokemon;
                        console.log(`🎯 [CardTrader] Match fuzzy trovato: "${word}" → "${pokemon}" (similarità: ${Math.round(similarity * 100)}%)`);
                        break;
                    }
                }
            }
            
            if (pokemonName) break;
        }
    }
    
    // Se ancora non trova nulla, cerca match più permissivi per casi speciali
    if (!pokemonName) {
        console.log(`🔍 [CardTrader] Nessun match fuzzy, cercando match permissivi...`);
        
        // Casi speciali noti
        const specialCases = {
            'evee': 'eevee',
            'eevee': 'eevee',
            'eve': 'eevee',
            'pikachu': 'pikachu',
            'pikach': 'pikachu',
            'charizard': 'charizard',
            'chariz': 'charizard',
            'mew': 'mew',
            'mewtwo': 'mewtwo',
            'lugia': 'lugia',
            'ho-oh': 'ho-oh',
            'hooh': 'ho-oh'
        };
        
        for (const word of titleWords) {
            const wordLower = word.toLowerCase();
            if (specialCases[wordLower]) {
                pokemonName = specialCases[wordLower];
                console.log(`🎯 [CardTrader] Match speciale trovato: "${word}" → "${pokemonName}"`);
                break;
            }
        }
    }
    
    // Cerca numero collezionista (pattern: numero/numero o XY numero o solo numero)
    let collectorNumber = null;
    let specialPattern = null; // Per memorizzare TG o SL
    
    // Prima cerca pattern speciali come TG16/TG30 o SL16/SL30
    const tgSlMatch = title.match(/(?:tg|sl)(\d+)\/(?:tg|sl)?(\d+)/i);
    if (tgSlMatch) {
        collectorNumber = tgSlMatch[1]; // Prendi il primo numero
        specialPattern = title.match(/(tg|sl)/i)[1].toLowerCase(); // Estrai TG o SL
        console.log(`🔍 [CardTrader] Trovato pattern TG/SL: ${collectorNumber} da ${tgSlMatch[0]}, pattern: ${specialPattern}`);
    } else {
        // Cerca pattern singolo come TG16 o SL16
        const singleTgSlMatch = title.match(/(?:tg|sl)(\d+)/i);
        if (singleTgSlMatch) {
            collectorNumber = singleTgSlMatch[1];
            specialPattern = title.match(/(tg|sl)/i)[1].toLowerCase(); // Estrai TG o SL
            console.log(`🔍 [CardTrader] Trovato pattern TG/SL singolo: ${collectorNumber} da ${singleTgSlMatch[0]}, pattern: ${specialPattern}`);
        } else {
            // Cerca "trainer gallery" come pattern TG
            if (titleLower.includes('trainer gallery')) {
                specialPattern = 'tg';
                console.log(`🎯 [CardTrader] Pattern speciale trovato: Trainer Gallery (TG)`);
            }
            
            // Cerca il pattern standard numero/numero
            const standardMatch = title.match(/(\d+)\/(\d+)/);
            if (standardMatch) {
                collectorNumber = standardMatch[1];
            } else {
                // Cerca pattern Cardmarket specifico come "Pokemon (SET 123)" o "Pokemon (SET123)"
                let cardmarketMatch = title.match(/([a-z]+)\s+\(([a-z]{2,4})\s*(\d+)\)/i);
                if (!cardmarketMatch) {
                    cardmarketMatch = title.match(/([a-z]+)\s+([a-z]{2,4})\s+(\d+)/i);
                }
                if (cardmarketMatch) {
                    const [, extractedPokemon, setCode, cardNumber] = cardmarketMatch;
                    console.log(`🎯 [CardTrader] Pattern Cardmarket trovato: Pokemon="${extractedPokemon}", Set="${setCode}", Numero="${cardNumber}"`);
                    
                    // Se non abbiamo ancora un Pokemon, usa quello dal pattern
                    if (!pokemonName) {
                        pokemonName = extractedPokemon;
                        console.log(`✅ [CardTrader] Pokemon confermato dal pattern Cardmarket: "${pokemonName}"`);
                    } else {
                        console.log(`⚠️ [CardTrader] Pokemon già trovato nel titolo principale: "${pokemonName}", ignorando pattern Cardmarket: "${extractedPokemon}"`);
                    }
                    
                    // Usa il numero dal pattern Cardmarket
                    collectorNumber = cardNumber;
                    console.log(`🎯 [CardTrader] Numero collezionista estratto dal pattern Cardmarket: "${collectorNumber}"`);
                } else {
                    // Cerca pattern come "SV67", "sv67", "SV 67" (Scarlet & Violet)
                    const svMatch = title.match(/(?:sv|sv\s+)(\d+)/i);
                    if (svMatch) {
                        collectorNumber = `sv${svMatch[1]}`;
                        console.log(`🔍 [CardTrader] Trovato pattern SV: ${collectorNumber} da ${svMatch[0]}`);
                    } else {
                        // Cerca pattern come "XY 156", "xy156", "XY156" (XY Series)
                        const xyMatch = title.match(/(?:xy|xy\s+)(\d+)/i);
                        if (xyMatch) {
                            collectorNumber = `xy${xyMatch[1]}`;
                            console.log(`🔍 [CardTrader] Trovato pattern XY: ${collectorNumber} da ${xyMatch[0]}`);
                        } else {
                            // Cerca pattern come "DP 156", "dp156", "DP156" (Diamond & Pearl)
                            const dpMatch = title.match(/(?:dp|dp\s+)(\d+)/i);
                            if (dpMatch) {
                                collectorNumber = `dp${dpMatch[1]}`;
                                console.log(`🔍 [CardTrader] Trovato pattern DP: ${collectorNumber} da ${dpMatch[0]}`);
                            } else {
                                // Cerca pattern come "BW 156", "bw156", "BW156" (Black & White)
                                const bwMatch = title.match(/(?:bw|bw\s+)(\d+)/i);
                                if (bwMatch) {
                                    collectorNumber = `bw${bwMatch[1]}`;
                                    console.log(`🔍 [CardTrader] Trovato pattern BW: ${collectorNumber} da ${bwMatch[0]}`);
                                } else {
                                    // Cerca pattern come "SM 156", "sm156", "SM156" (Sun & Moon)
                                    const smMatch = title.match(/(?:sm|sm\s+)(\d+)/i);
                                    if (smMatch) {
                                        collectorNumber = `sm${smMatch[1]}`;
                                        console.log(`🔍 [CardTrader] Trovato pattern SM: ${collectorNumber} da ${smMatch[0]}`);
                                    } else {
                                        // Cerca pattern come "SS 156", "ss156", "SS156" (Sword & Shield)
                                        const ssMatch = title.match(/(?:ss|ss\s+)(\d+)/i);
                                        if (ssMatch) {
                                            collectorNumber = `ss${ssMatch[1]}`;
                                            console.log(`🔍 [CardTrader] Trovato pattern SS: ${collectorNumber} da ${ssMatch[0]}`);
                                        } else {
                                            // Cerca pattern come "PR 156", "pr156", "PR156" (Promo)
                                            const prMatch = title.match(/(?:pr|pr\s+)(\d+)/i);
                                            if (prMatch) {
                                                collectorNumber = `pr${prMatch[1]}`;
                                                console.log(`🔍 [CardTrader] Trovato pattern PR: ${collectorNumber} da ${prMatch[0]}`);
                                            } else {
                                                // Cerca pattern come "BS 156", "bs156", "BS156" (Black Star Promo)
                                                const bsMatch = title.match(/(?:bs|bs\s+)(\d+)/i);
                                                if (bsMatch) {
                                                    collectorNumber = `bs${bsMatch[1]}`;
                                                    console.log(`🔍 [CardTrader] Trovato pattern BS: ${collectorNumber} da ${bsMatch[0]}`);
                                                } else {
                                                    // Cerca pattern come "H 156", "h156", "H156" (Holo)
                                                    const hMatch = title.match(/(?:h|h\s+)(\d+)/i);
                                                    if (hMatch) {
                                                        collectorNumber = `h${hMatch[1]}`;
                                                        console.log(`🔍 [CardTrader] Trovato pattern H: ${collectorNumber} da ${hMatch[0]}`);
                                                    } else {
                                                        // Cerca solo numeri isolati (ma non anni come 2016)
                                                        const numberMatch = title.match(/\b(?!2016|2015|2014|2013|2012|2011|2010|2009|2008|2007|2006|2005|2004|2003|2002|2001|2000|1999)(\d{1,4})\b/);
                                                        if (numberMatch) {
                                                            collectorNumber = numberMatch[1];
                                                            console.log(`🔍 [CardTrader] Trovato numero collezionista: ${collectorNumber}`);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Lista completa di Trainer (spostata dopo la definizione di expansions e cardTypes)
    const trainerNames = [
        // Gym Leaders Kanto
        'brock', 'misty', 'lt. surge', 'erika', 'koga', 'sabrina', 'blaine', 'giovanni',
        
        // Elite Four Kanto
        'lorelei', 'bruno', 'agatha', 'lance',
        
        // Protagonisti e rivali
        'red', 'blue', 'green', 'leaf', 'yellow', 'crystal', 'ethan', 'lyra', 'kris',
        'brendan', 'may', 'ruby', 'sapphire', 'emerald', 'lucas', 'dawn', 'diamond', 'pearl', 'platinum',
        'hilbert', 'hilda', 'nate', 'rosa', 'black 2', 'white 2',
        'calem', 'serena', 'x', 'y', 'elio', 'selene', 'sun', 'moon', 'ultra sun', 'ultra moon',
        'victor', 'gloria', 'florian', 'juliana',
        
        // Gym Leaders Johto
        'falkner', 'bugsy', 'whitney', 'morty', 'chuck', 'jasmine', 'pryce', 'clair',
        
        // Elite Four Johto
        'will', 'koga', 'bruno', 'karen',
        
        // Gym Leaders Hoenn
        'roxanne', 'brawly', 'wattson', 'flannery', 'norman', 'winona', 'tate', 'liza', 'juan', 'wallace',
        
        // Elite Four Hoenn
        'sidney', 'phoebe', 'glacia', 'drake',
        
        // Gym Leaders Sinnoh
        'roark', 'gardenia', 'maylene', 'crasher wake', 'fantina', 'byron', 'candice', 'volkner',
        
        // Elite Four Sinnoh
        'aaron', 'bertha', 'flint', 'lucian',
        
        // Gym Leaders Unova
        'cilan', 'chili', 'cress', 'lenora', 'burgh', 'elesa', 'clay', 'skyla', 'brycen', 'drayden', 'iris',
        
        // Elite Four Unova
        'shauntal', 'grimsley', 'caitlin', 'marshall',
        
        // Gym Leaders Kalos
        'viola', 'grant', 'korrina', 'ramos', 'clemont', 'valerie', 'olympia', 'wulfric',
        
        // Elite Four Kalos
        'malva', 'siebold', 'wikstrom', 'drasna',
        
        // Gym Leaders Alola
        'hala', 'lana', 'kiawe', 'mallow', 'olivia', 'sophocles', 'acerola', 'nanu', 'hapu',
        
        // Elite Four Alola
        'hala', 'molayne', 'olivia', 'akahata',
        
        // Gym Leaders Galar
        'milo', 'nessa', 'kabu', 'bea', 'allister', 'opal', 'gordie', 'melony', 'piers', 'raihan',
        
        // Elite Four Galar
        'leon', 'hop', 'bede', 'marnie',
        
        // Gym Leaders Paldea
        'katy', 'brassius', 'iono', 'kofu', 'larry', 'ryme', 'tulip', 'grusha',
        
        // Elite Four Paldea
        'rika', 'poppy', 'hassel', 'geeta',
        
        // Trainer importanti e speciali
        'cynthia', 'steven', 'wallace', 'aaron', 'bertha', 'flint', 'lucian', 'shauntal', 'grimsley', 'caitlin', 'marshall',
        'malva', 'siebold', 'wikstrom', 'drasna', 'molayne', 'akahata', 'leon', 'hop', 'bede', 'marnie',
        'rika', 'poppy', 'hassel', 'geeta', 'nemona', 'penny', 'arven', 'clavell', 'jacq', 'miriam', 'saguaro',
        
        // Team Leaders
        'giovanni', 'maxie', 'tabitha', 'courtney', 'matt', 'shelly', 'archie', 'cyrus', 'mars', 'jupiter', 'saturn',
        'charon', 'ghetsis', 'n', 'colress', 'lysandre', 'xerosic', 'celosia', 'bryony', 'aliana', 'mabel',
        'guzma', 'plumeria', 'gladion', 'lusamine', 'rose', 'oleana', 'peony', 'peonia', 'clavell', 'sada', 'turo',
        
        // Champion e personaggi speciali
        'champion', 'professor oak', 'professor elm', 'professor birch', 'professor rowan', 'professor juniper',
        'professor sycamore', 'professor kukui', 'professor burnet', 'professor magnolia', 'professor sada', 'professor turo',
        'nurse joy', 'officer jenny', 'bill', 'mr. fuji', 'mr. pokemon', 'kurt', 'baoba', 'lanette', 'bebe', 'celio',
        'buck', 'riley', 'cheryl', 'marley', 'mira', 'darach', 'caitlin', 'benga', 'ingo', 'emmet', 'lenora', 'hawes',
        'fennel', 'amus', 'bianca', 'cedric juniper', 'fennel', 'amus', 'bianca', 'cedric juniper', 'colress', 'ghetsis',
        'n', 'anthea', 'concordia', 'hugh', 'roxie', 'marlon', 'shauna', 'tierno', 'trevor', 'serena', 'calem',
        'diantha', 'malva', 'siebold', 'wikstrom', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna',
        'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna',
        
        // Trainer di carte speciali
        'cynthia', 'steven', 'wallace', 'aaron', 'bertha', 'flint', 'lucian', 'shauntal', 'grimsley', 'caitlin', 'marshall',
        'malva', 'siebold', 'wikstrom', 'drasna', 'molayne', 'akahata', 'leon', 'hop', 'bede', 'marnie',
        'rika', 'poppy', 'hassel', 'geeta', 'nemona', 'penny', 'arven', 'clavell', 'jacq', 'miriam', 'saguaro',
        
        // Altri trainer importanti
        'red', 'blue', 'green', 'leaf', 'yellow', 'crystal', 'ethan', 'lyra', 'kris',
        'brendan', 'may', 'ruby', 'sapphire', 'emerald', 'lucas', 'dawn', 'diamond', 'pearl', 'platinum',
        'hilbert', 'hilda', 'nate', 'rosa', 'black 2', 'white 2',
        'calem', 'serena', 'x', 'y', 'elio', 'selene', 'sun', 'moon', 'ultra sun', 'ultra moon',
        'victor', 'gloria', 'florian', 'juliana'
    ];
    
    // Cerca tipi di carta specifici (GX, V, VMAX, VSTAR, EX, ecc.)
    const cardTypes = [
        'gx', 'v', 'vmax', 'vstar', 'ex', 'break', 'prime', 'legend', 'shining',
        'gold star', 'crystal', 'delta', 'secret rare', 'ultra rare', 'rare holo',
        'rare', 'uncommon', 'common', 'promo', 'black star', 'prerelease', 'staff'
    ];
    
    let cardType = null;
    
    // Gestione speciale per "black star" - deve essere cercato prima di "star"
    if (titleLower.includes('black star')) {
        cardType = 'black star';
    } else if (titleLower.includes('gold star')) {
        cardType = 'gold star';
    } else {
        // Cerca altri tipi di carta con match più flessibili
        for (const type of cardTypes) {
            // Cerca il tipo carta come parola separata o attaccata al Pokemon
            const typeLower = type.toLowerCase();
            
            // Pattern 1: tipo carta come parola separata (con spazi)
            if (titleLower.includes(` ${typeLower} `) || 
                titleLower.startsWith(`${typeLower} `) || 
                titleLower.endsWith(` ${typeLower}`)) {
                cardType = type;
                console.log(`🎯 [CardTrader] Tipo carta rilevato (separato): "${type}" nel titolo`);
                break;
            }
            
            // Pattern 2: tipo carta attaccato al Pokemon (senza spazi)
            // Cerca pattern come "PokemonEx", "PokemonV", "PokemonGX", etc.
            const pokemonPattern = new RegExp(`\\b\\w+${typeLower}\\b`, 'i');
            if (pokemonPattern.test(titleLower)) {
                cardType = type;
                console.log(`🎯 [CardTrader] Tipo carta rilevato (attaccato): "${type}" nel titolo`);
                break;
            }
            
            // Pattern 3: tipo carta come parola singola (fallback)
            if (titleLower === typeLower) {
                cardType = type;
                console.log(`🎯 [CardTrader] Tipo carta rilevato (singolo): "${type}" nel titolo`);
                break;
            }
        }
    }
    
    // Cerca rarità specifiche
    const rarities = [
        'promo', 'secret rare', 'ultra rare', 'rare holo', 'rare', 'uncommon', 'common',
        'holo rare', 'reverse holo', 'cosmos holo', 'starlight holo', 'cracked ice holo',
        'sheen holo', 'non-holo', 'special illustration rare', 'rainbow rare', 'gold rare'
    ];
    
    let rarity = null;
    for (const rar of rarities) {
        if (titleLower.includes(rar.toLowerCase())) {
            rarity = rar;
            break;
        }
    }
    
    // Cerca espansioni specifiche
    const expansions = [
        // Base Set e espansioni originali
        'base set', 'base', 'base set 2', 'base 2', 'base set unlimited', 'unlimited',
        'jungle', 'jungle set', 'fossil', 'fossil set', 'team rocket', 'team rocket set',
        'gym heroes', 'gym challenge', 'gym leaders', 'gym booster 1 leaders stadium', 'gym booster 1', 'leaders stadium',
        'neo genesis', 'neo discovery', 'neo revelation', 'neo destiny',
        'legendary collection', 'expedition base set', 'aquapolis', 'skyridge',
        'ex ruby & sapphire', 'ex sandstorm', 'ex dragon', 'ex team magma vs team aqua',
        'ex hidden legends', 'ex fire red & leaf green', 'ex team rocket returns', 'ex deoxys',
        'ex emerald', 'ex unseen forces', 'ex delta species', 'ex legend maker',
        'ex holon phantoms', 'ex crystal guardians', 'ex dragon frontiers', 'ex power keepers',
        'diamond & pearl', 'dp', 'mysterious treasures', 'secret wonders', 'great encounters',
        'majestic dawn', 'legends awakened', 'stormfront', 'platinum', 'rising rivals',
        'supreme victors', 'arceus', 'heartgold & soulsilver', 'hgss', 'unleashed',
        'undaunted', 'triumphant', 'call of legends', 'black & white', 'bw', 'emerging powers',
        'noble victories', 'next destinies', 'dark explorers', 'dragons exalted',
        'boundaries crossed', 'plasma storm', 'plasma freeze', 'plasma blast',
        'legendary treasures', 'xy', 'kalos starter set', 'flashfire', 'furious fists',
        'phantom forces', 'primal clash', 'roaring skies', 'ancient origins',
        'breakthrough', 'breakpoint', 'fates collide', 'steam siege', 'evolutions',
        'sun & moon', 'guardians rising', 'burning shadows', 'crimson invasion',
        'ultra prism', 'forbidden light', 'celestial storm', 'dragon majesty',
        'lost thunder', 'team up', 'detective pikachu', 'unbroken bonds',
        'unified minds', 'hidden fates', 'cosmic eclipse', 'sword & shield',
        'rebel clash', 'darkness ablaze', 'champions path', 'vivid voltage',
        'shining fates', 'battle styles', 'chilling reign', 'evolving skies',
        'fusion strike', 'brilliant stars', 'astral radiance', 'lost origin',
        'silver tempest', 'scarlet & violet', 'paldea evolved', 'obsidian flames',
        '151', 'paradox rift', 'temporal forces', 'v star universe', 'vstar universe',
        'dragon frontier', 'dragon frontiers', 'delta species', 'secret wonders',
        'next destinies', 'boundaries crossed', 'plasma storm', 'plasma freeze',
        'legendary treasures', 'flashfire', 'furious fists', 'phantom forces',
        'primal clash', 'roaring skies', 'ancient origins', 'breakthrough',
        'breakpoint', 'fates collide', 'steam siege', 'evolutions', 'sun & moon',
        'guardians rising', 'burning shadows', 'crimson invasion', 'ultra prism',
        'forbidden light', 'celestial storm', 'dragon majesty', 'lost thunder',
        'team up', 'unbroken bonds', 'unified minds', 'hidden fates', 'cosmic eclipse',
        'sword & shield', 'rebel clash', 'darkness ablaze', 'champions path',
        'vivid voltage', 'shining fates', 'battle styles', 'chilling reign',
        'evolving skies', 'fusion strike', 'brilliant stars', 'astral radiance',
        'lost origin', 'silver tempest', 'scarlet & violet', 'paldea evolved',
        'obsidian flames', '151', 'paradox rift', 'temporal forces'
    ];
    
    let expansion = null;
    
    // Se abbiamo un pattern Cardmarket, usa l'espansione dal pattern
    if (cardmarketMatch) {
        const [, , setCode, cardNumber] = cardmarketMatch;
        
        // Mappa dei codici set Cardmarket alle espansioni
        const setCodeMap = {
            // Black & White Series
            'bw': 'black & white',
            'nxd': 'next destinies',
            'dex': 'dark explorers',
            'drx': 'dragons exalted',
            'bcr': 'boundaries crossed',
            'pls': 'plasma storm',
            'plf': 'plasma freeze',
            'plb': 'plasma blast',
            'lt': 'legendary treasures',
            
            // XY Series
            'xy': 'xy',
            'flf': 'flashfire',
            'ffi': 'furious fists',
            'phf': 'phantom forces',
            'pcl': 'primal clash',
            'ros': 'roaring skies',
            'aor': 'ancient origins',
            'bkt': 'breakthrough',
            'bkp': 'breakpoint',
            'fco': 'fates collide',
            'sts': 'steam siege',
            'evo': 'evolutions',
            
            // Sun & Moon Series
            'sm': 'sun & moon',
            'gri': 'guardians rising',
            'bus': 'burning shadows',
            'cri': 'crimson invasion',
            'upl': 'ultra prism',
            'fli': 'forbidden light',
            'ces': 'celestial storm',
            'drm': 'dragon majesty',
            'lot': 'lost thunder',
            'teu': 'team up',
            'unb': 'unbroken bonds',
            'unm': 'unified minds',
            'hif': 'hidden fates',
            'cos': 'cosmic eclipse',
            
            // Sword & Shield Series
            'ss': 'sword & shield',
            'swsh': 'sword & shield black star promos', // SWSH sono le promo, non l'espansione
            'rcl': 'rebel clash',
            'dab': 'darkness ablaze',
            'cpa': 'champions path',
            'vvi': 'vivid voltage',
            'shf': 'shining fates',
            'bst': 'battle styles',
            'chr': 'chilling reign',
            'evs': 'evolving skies',
            'fus': 'fusion strike',
            'brs': 'brilliant stars',
            'ast': 'astral radiance',
            'lor': 'lost origin',
            'sit': 'silver tempest',
            
            // Scarlet & Violet Series
            'sv': 'scarlet & violet',
            'pal': 'paldea evolved',
            'obf': 'obsidian flames',
            '151': '151',
            'par': 'paradox rift',
            'tfu': 'temporal forces',
            
            // Diamond & Pearl Series
            'dp': 'diamond & pearl',
            'mt': 'mysterious treasures',
            'sw': 'secret wonders',
            'ge': 'great encounters',
            'md': 'majestic dawn',
            'la': 'legends awakened',
            'sf': 'stormfront',
            'pl': 'platinum',
            'rr': 'rising rivals',
            'sv': 'supreme victors',
            'ar': 'arceus',
            
            // HeartGold & SoulSilver Series
            'hgss': 'heartgold & soulsilver',
            'ul': 'unleashed',
            'ud': 'undone',
            'tm': 'triumphant',
            'cl': 'call of legends'
        };
        
        if (setCodeMap[setCode.toLowerCase()]) {
            expansion = setCodeMap[setCode.toLowerCase()];
            console.log(`🎯 [CardTrader] Espansione estratta dal pattern Cardmarket: "${setCode}" -> "${expansion}"`);
        }
        
        // Se non abbiamo ancora un numero collezionista, usa quello dal pattern
        if (!collectorNumber) {
            collectorNumber = cardNumber;
            console.log(`🎯 [CardTrader] Numero collezionista estratto dal pattern Cardmarket: "${collectorNumber}"`);
        } else {
            // Se abbiamo già un numero, ma il pattern Cardmarket è più specifico, usa quello
            console.log(`🎯 [CardTrader] Pattern Cardmarket trovato ma numero già estratto: "${collectorNumber}" vs "${cardNumber}"`);
        }
    }
    
    // Se non abbiamo trovato l'espansione dal pattern, cerca nelle espansioni note
    if (!expansion) {
        console.log(`🔍 [CardTrader] Cercando espansione nel titolo: "${titleLower}"`);
        
        // Priorità per espansioni più specifiche e comuni
        const priorityExpansions = [
            'sword & shield', 'swsh', 'sun & moon', 'xy', 'black & white', 'diamond & pearl',
            'scarlet & violet', 'sv', 'platinum', 'heartgold & soulsilver', 'hgss'
        ];
        
        // Prima cerca nelle espansioni prioritarie
        for (const exp of priorityExpansions) {
            if (titleLower.includes(exp.toLowerCase())) {
                expansion = exp;
                console.log(`🎯 [CardTrader] Espansione prioritaria trovata nel testo: "${expansion}"`);
                break;
            }
        }
        
        // Se non trova espansioni prioritarie, cerca in tutte le espansioni
        if (!expansion) {
            for (const exp of expansions) {
                // Evita di rilevare "arceus" come espansione se è già stato rilevato come Pokemon
                if (exp.toLowerCase() === 'arceus' && pokemonName && pokemonName.toLowerCase() === 'arceus') {
                    console.log(`🚫 [CardTrader] Ignorando "arceus" come espansione perché è già il Pokemon principale`);
                    continue;
                }
                
                if (titleLower.includes(exp.toLowerCase())) {
                    expansion = exp;
                    console.log(`🎯 [CardTrader] Espansione trovata nel testo: "${expansion}"`);
                    break;
                }
            }
        }
        
        if (!expansion) {
            console.log(`⚠️ [CardTrader] Nessuna espansione trovata nel titolo`);
        }
    } else {
        console.log(`🎯 [CardTrader] Espansione estratta dal pattern Cardmarket: "${expansion}"`);
    }
    
    // Logica speciale per espansioni correlate
    if (titleLower.includes('gym heroes') && !expansion) {
        // Se trova "gym heroes" ma non ha trovato un'espansione specifica, cerca espansioni correlate
        if (titleLower.includes('gym') && titleLower.includes('heroes')) {
            expansion = 'gym heroes';
            console.log(`🎯 [CardTrader] Espansione correlata trovata: Gym Heroes`);
        }
    }
    
    // Verifica se è una carta V
    const isVCard = /\bv\b/i.test(cleanTitle) || /\w+v\b/i.test(cleanTitle);
    if (isVCard) {
        console.log(`🎯 [CardTrader] Carta V rilevata nel titolo`);
    }
    
    // Verifica se è una carta GX
    const isGXCard = /\bgx\b/i.test(cleanTitle) || /\w+gx\b/i.test(cleanTitle);
    if (isGXCard) {
        console.log(`🎯 [CardTrader] Carta GX rilevata nel titolo`);
    }
    
    // Verifica se è una carta VSTAR
    const isVSTARCard = /\bvstar\b/i.test(cleanTitle) || /\w+vstar\b/i.test(cleanTitle);
    if (isVSTARCard) {
        console.log(`🎯 [CardTrader] Carta VSTAR rilevata nel titolo`);
    }
    
    // Verifica se è una carta EX
    const isEXCard = /\bex\b/i.test(cleanTitle) || /\w+ex\b/i.test(cleanTitle);
    if (isEXCard) {
        console.log(`🎯 [CardTrader] Carta EX rilevata nel titolo`);
    }
    
    // Cerca trainer names (dopo aver definito expansions e cardTypes)
    let trainerName = null;
    for (const trainer of trainerNames) {
        // Evita di rilevare trainer names che sono solo lettere singole (come "n" in "giratina")
        if (trainer.length <= 1) continue;
        
        // Cerca il trainer name come parola separata
        const trainerRegex = new RegExp(`\\b${trainer.toLowerCase()}\\b`, 'i');
        if (trainerRegex.test(titleLower)) {
            // Controlla se il trainer name fa parte di un'espansione
            let isPartOfExpansion = false;
            for (const exp of expansions) {
                if (exp.toLowerCase().includes(trainer.toLowerCase())) {
                    console.log(`🚫 [CardTrader] Trainer "${trainer}" ignorato perché parte dell'espansione "${exp}"`);
                    isPartOfExpansion = true;
                    break;
                }
            }
            
            // Controlla anche se fa parte di tipi di carta
            if (!isPartOfExpansion) {
                for (const type of cardTypes) {
                    if (type.toLowerCase().includes(trainer.toLowerCase())) {
                        console.log(`🚫 [CardTrader] Trainer "${trainer}" ignorato perché parte del tipo "${type}"`);
                        isPartOfExpansion = true;
                        break;
                    }
                }
            }
            
            if (!isPartOfExpansion) {
                trainerName = trainer;
                console.log(`🎯 [CardTrader] Trainer name rilevato: "${trainer}"`);
                break;
            }
        }
    }
    
    return {
        pokemonName: pokemonName,
        secondPokemonName: secondPokemonName,
        collectorNumber: collectorNumber,
        specialPattern: specialPattern,
        trainerName: trainerName,
        cardType: cardType,
        rarity: rarity,
        expansion: expansion,
        isVCard: isVCard,
        isGXCard: isGXCard,
        isVSTARCard: isVSTARCard,
        isEXCard: isEXCard,
        originalTitle: title
    };
}

// Cerca carte nel database
async function searchCardInDatabase(titleInfo, originalTitle = '') {
    try {
        // Aspetta che Supabase sia inizializzato se non lo è già
        let supabaseClient = window.supabaseClient;
        
        if (!supabaseClient) {
            console.log('⏳ [CardTrader] Supabase non inizializzato, aspetto...');
            
            // Aspetta fino a 5 secondi che Supabase sia inizializzato
            let attempts = 0;
            const maxAttempts = 50; // 50 tentativi * 100ms = 5 secondi
            
            while (!supabaseClient && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                supabaseClient = window.supabaseClient;
                attempts++;
                
                if (attempts % 10 === 0) {
                    console.log(`⏳ [CardTrader] Tentativo ${attempts}/${maxAttempts} - Aspetto Supabase...`);
                }
            }
            
            if (!supabaseClient) {
                console.error('❌ [CardTrader] Supabase client non disponibile dopo 5 secondi di attesa');
                return [];
            } else {
                console.log('✅ [CardTrader] Supabase inizializzato, procedo con la ricerca');
            }
        }
        
        // Ottimizzazione: usa requestIdleCallback se disponibile per non bloccare l'UI
        if (window.requestIdleCallback) {
            return new Promise((resolve) => {
                requestIdleCallback(() => {
                    performSearch(supabaseClient, titleInfo, originalTitle).then(resolve);
                });
            });
        } else {
            return performSearch(supabaseClient, titleInfo, originalTitle);
        }
    } catch (error) {
        console.error('❌ [CardTrader] Errore nella ricerca:', error);
        return [];
    }
}

async function performSearch(supabaseClient, titleInfo, originalTitle) {
    try {
        
        console.log('🔍 [CardTrader] Cercando con criteri:', JSON.stringify(titleInfo, null, 2));
        
        // PRIORITÀ 1: Se c'è un trainer name, cerca direttamente le carte di quell'allenatore
        if (titleInfo.trainerName) {
            console.log(`🎯 [CardTrader] RICERCA PRIORITARIA per trainer: ${titleInfo.trainerName} ${titleInfo.pokemonName}`);
            
            // Cerca tutte le carte del Pokemon con trainer name nel NOME della carta
            let trainerQuery = supabaseClient
                .from('cards')
                .select('*')
                .ilike('name_en', `%${titleInfo.pokemonName}%`)
                .ilike('name_en', `%${titleInfo.trainerName}%`)
                .not('name_en', 'ilike', '%deck%')
                .not('name_en', 'ilike', '%booster%')
                .not('name_en', 'ilike', '%bundle%')
                .not('name_en', 'ilike', '%lot%')
                .not('name_en', 'ilike', '%binder%')
                .not('name_en', 'ilike', '%album%')
                .not('name_en', 'ilike', '%sleeve%')
                .not('name_en', 'ilike', '%dice%')
                .not('name_en', 'ilike', '%token%')
                .not('name_en', 'ilike', '%gift box%')
                .not('name_en', 'ilike', '%box%')
                .not('name_en', 'ilike', '%tin%')
                .not('name_en', 'ilike', '%collection%');
            
            const { data: trainerResults, error: trainerError } = await trainerQuery;
            
            if (trainerError) {
                console.error('❌ [CardTrader] Errore query trainer:', trainerError);
            } else if (trainerResults && trainerResults.length > 0) {
                console.log(`✅ [CardTrader] Trovate ${trainerResults.length} carte con trainer ${titleInfo.trainerName}`);
                
                // Se c'è anche un numero collezionista, filtra per quello
                if (titleInfo.collectorNumber) {
                    console.log(`🎯 [CardTrader] Filtro per numero: ${titleInfo.collectorNumber}`);
                    
                    const blueprintIds = trainerResults.map(card => card.blueprint_id).filter(id => id);
                    
                    if (blueprintIds.length > 0) {
                        const numberQuery = supabaseClient
                            .from('card_variants')
                            .select('*')
                            .in('blueprint_id', blueprintIds)
                            .eq('collector_number', titleInfo.collectorNumber);
                        
                        const { data: numberResults, error: numberError } = await numberQuery;
                        
                        if (numberError) {
                            console.error('❌ [CardTrader] Errore query numero:', numberError);
                        } else if (numberResults && numberResults.length > 0) {
                            console.log(`✅ [CardTrader] Trovate ${numberResults.length} carte con trainer + numero`);
                            
                            // Combina i risultati e filtra per assicurarsi che siano carte valide
                            const combinedResults = numberResults.map(variant => {
                                const card = trainerResults.find(c => c.blueprint_id === variant.blueprint_id);
                                if (card) {
                                    // Verifica aggiuntiva: il nome deve contenere sia Pokemon che trainer
                                    const cardNameLower = card.name_en.toLowerCase();
                                    const pokemonLower = titleInfo.pokemonName.toLowerCase();
                                    const trainerLower = titleInfo.trainerName.toLowerCase();
                                    
                                    if (cardNameLower.includes(pokemonLower) && cardNameLower.includes(trainerLower)) {
                                        console.log(`✅ [CardTrader] Carta valida trovata: "${card.name_en}"`);
                                        return {
                                            ...variant,
                                            name_en: card.name_en,
                                            pokemon_name: card.name_en,
                                            expansion_name_en: card.expansion_name_en,
                                            expansion_code: card.expansion_code,
                                            source: 'trainer_number_match',
                                            exact_number_match: true
                                        };
                                    } else {
                                        console.log(`❌ [CardTrader] Carta scartata: "${card.name_en}" (manca Pokemon o trainer)`);
                                    }
                                }
                                return null;
                            }).filter(result => result !== null);
                            
                            if (combinedResults.length > 0) {
                                console.log(`✅ [CardTrader] ${combinedResults.length} risultati validi dopo filtro`);
                                return scoreAndValidateResults(combinedResults, titleInfo, originalTitle);
                            } else {
                                console.log(`⚠️ [CardTrader] Nessun risultato valido dopo filtro`);
                            }
                        }
                    }
                }
                
                // Se non c'è numero o non trovato, valida le carte trainer trovate
                const trainerCards = trainerResults.map(card => ({
                    ...card,
                    source: 'trainer_match',
                    exact_number_match: false
                }));
                
                return scoreAndValidateResults(trainerCards, titleInfo, originalTitle);
            }
        }
        
        let allResults = [];
        
        // FALLBACK: Ricerca tradizionale (solo se non c'è trainer name o non trovato)
        console.log(`🔍 [CardTrader] Fallback: ricerca tradizionale per ${titleInfo.pokemonName}`);
        
        // 1. Cerca nelle carte con il nome Pokemon
        let query = supabaseClient
            .from('cards')
            .select('*');
        
        // Controllo speciale per Pokemon con nomi simili
        if (titleInfo.pokemonName === 'mew') {
            query = query.ilike('name_en', '%mew%')
                        .not('name_en', 'ilike', '%mewtwo%');
        } else if (titleInfo.pokemonName === 'mewtwo') {
            query = query.ilike('name_en', '%mewtwo%');
        } else if (titleInfo.pokemonName === 'eevee') {
            // Gestione speciale per Eevee e variazioni
            query = query.or('name_en.ilike.%eevee%,name_en.ilike.%evee%')
                        .not('name_en', 'ilike', '%vaporeon%')
                        .not('name_en', 'ilike', '%jolteon%')
                        .not('name_en', 'ilike', '%flareon%')
                        .not('name_en', 'ilike', '%espeon%')
                        .not('name_en', 'ilike', '%umbreon%')
                        .not('name_en', 'ilike', '%leafeon%')
                        .not('name_en', 'ilike', '%glaceon%')
                        .not('name_en', 'ilike', '%sylveon%');
        } else if (titleInfo.pokemonName === 'ho-oh') {
            // Gestione speciale per Ho-Oh e variazioni
            query = query.or('name_en.ilike.%ho-oh%,name_en.ilike.%ho oh%,name_en.ilike.%hooh%');
        } else if (titleInfo.pokemonName === 'porygon-z') {
            // Gestione speciale per Porygon-Z e variazioni
            query = query.or('name_en.ilike.%porygon-z%,name_en.ilike.%porygon z%,name_en.ilike.%porygonz%');
        } else if (titleInfo.pokemonName === 'jangmo-o' || titleInfo.pokemonName === 'hakamo-o' || titleInfo.pokemonName === 'kommo-o') {
            // Gestione speciale per la famiglia Jangmo-o
            const baseName = titleInfo.pokemonName.replace('-o', '');
            query = query.or(`name_en.ilike.%${titleInfo.pokemonName}%,name_en.ilike.%${baseName} o%,name_en.ilike.%${baseName}o%`);
        } else if (titleInfo.pokemonName === 'type-null') {
            // Gestione speciale per Type: Null
            query = query.or('name_en.ilike.%type: null%,name_en.ilike.%type null%,name_en.ilike.%typenull%');
        } else if (titleInfo.pokemonName === 'mime-jr') {
            // Gestione speciale per Mime Jr.
            query = query.or('name_en.ilike.%mime jr.%,name_en.ilike.%mime jr%,name_en.ilike.%mimejr%');
        } else if (titleInfo.pokemonName === 'mr-rime') {
            // Gestione speciale per Mr. Rime
            query = query.or('name_en.ilike.%mr. rime%,name_en.ilike.%mr rime%,name_en.ilike.%mrrime%');
        } else if (titleInfo.pokemonName === 'farfetchd') {
            // Gestione speciale per Farfetch'd
            query = query.or('name_en.ilike.%farfetch\'d%,name_en.ilike.%farfetchd%');
        } else if (titleInfo.pokemonName === 'sirfetchd') {
            // Gestione speciale per Sirfetch'd
            query = query.or('name_en.ilike.%sirfetch\'d%,name_en.ilike.%sirfetchd%');
        } else if (titleInfo.pokemonName === 'flabebe') {
            // Gestione speciale per Flabébé
            query = query.or('name_en.ilike.%flabébé%,name_en.ilike.%flabebe%');
        } else if (titleInfo.isGXCard) {
            // Per carte GX, cerca carte che contengono il Pokemon e GX
            const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
            query = query.ilike('name_en', `%${pokemonNameLower}%`)
                        .ilike('name_en', '%gx%');
            console.log(`🔍 [CardTrader] Ricerca GX per: ${titleInfo.pokemonName}`);
            
            // Se c'è un secondo Pokemon, cerca carte che contengono entrambi
            if (titleInfo.secondPokemonName) {
                const secondPokemonLower = titleInfo.secondPokemonName.toLowerCase();
                query = query.ilike('name_en', `%${secondPokemonLower}%`);
                console.log(`🔍 [CardTrader] Ricerca GX multi-Pokemon: ${titleInfo.pokemonName} & ${titleInfo.secondPokemonName}`);
            }
        } else if (titleInfo.isVCard) {
            // Per carte V, cerca carte che contengono il Pokemon e V
            const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
            query = query.ilike('name_en', `%${pokemonNameLower}%`)
                        .ilike('name_en', '% v %');
            console.log(`🔍 [CardTrader] Ricerca V per: ${titleInfo.pokemonName}`);
            
            // Se c'è un secondo Pokemon, cerca carte che contengono entrambi
            if (titleInfo.secondPokemonName) {
                const secondPokemonLower = titleInfo.secondPokemonName.toLowerCase();
                query = query.ilike('name_en', `%${secondPokemonLower}%`);
                console.log(`🔍 [CardTrader] Ricerca V multi-Pokemon: ${titleInfo.pokemonName} & ${titleInfo.secondPokemonName}`);
            }
        } else if (titleInfo.isVSTARCard) {
            // Per carte VSTAR, cerca carte che contengono il Pokemon e VSTAR
            const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
            query = query.ilike('name_en', `%${pokemonNameLower}%`)
                        .ilike('name_en', '%vstar%');
            console.log(`🔍 [CardTrader] Ricerca VSTAR per: ${titleInfo.pokemonName}`);
            
            // Se c'è un secondo Pokemon, cerca carte che contengono entrambi
            if (titleInfo.secondPokemonName) {
                const secondPokemonLower = titleInfo.secondPokemonName.toLowerCase();
                query = query.ilike('name_en', `%${secondPokemonLower}%`);
                console.log(`🔍 [CardTrader] Ricerca VSTAR multi-Pokemon: ${titleInfo.pokemonName} & ${titleInfo.secondPokemonName}`);
            }
        } else if (titleInfo.isEXCard) {
            // Per carte EX, cerca carte che contengono il Pokemon e EX (logica originale che funzionava)
            const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
            query = query.ilike('name_en', `%${pokemonNameLower}% ex%`);
            console.log(`🔍 [CardTrader] Ricerca EX per: ${titleInfo.pokemonName}`);
            
            // Se c'è un secondo Pokemon, cerca carte che contengono entrambi
            if (titleInfo.secondPokemonName) {
                const secondPokemonLower = titleInfo.secondPokemonName.toLowerCase();
                query = query.ilike('name_en', `%${secondPokemonLower}%`);
                console.log(`🔍 [CardTrader] Ricerca EX multi-Pokemon: ${titleInfo.pokemonName} & ${titleInfo.secondPokemonName}`);
            }
        } else {
            // Ricerca fuzzy per altri Pokemon (FALLBACK per tutti i casi)
            const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
            
            // Gestione speciale per Pokemon con trattini (come mr-mime)
            if (pokemonNameLower.includes('-')) {
                const variants = [
                    pokemonNameLower, // mr-mime
                    pokemonNameLower.replace('-', ' '), // mr mime
                    pokemonNameLower.replace('-', '. '), // mr. mime
                    pokemonNameLower.replace('-', ''), // mrmime
                ];
                
                console.log(`🔍 [CardTrader] Ricerca varianti per ${pokemonNameLower}:`, variants);
                
                // Crea una query OR per tutte le varianti
                const orConditions = variants.map(variant => `name_en.ilike.%${variant}%`).join(',');
                query = query.or(orConditions);
            } else {
                query = query.or(`name_en.ilike.%${pokemonNameLower}%,name_en.ilike.%${pokemonNameLower}%`);
            }
        }
        

        
        console.log(`🔍 [CardTrader] Eseguendo query Supabase...`);
        
        const { data: cards, error: cardsError } = await query
            .not('name_en', 'ilike', '%deck%')
            .not('name_en', 'ilike', '%booster%')
            .not('name_en', 'ilike', '%bundle%')
            .not('name_en', 'ilike', '%lot%')
            .not('name_en', 'ilike', '%binder%')
            .not('name_en', 'ilike', '%album%')
            .not('name_en', 'ilike', '%sleeve%')
            .not('name_en', 'ilike', '%dice%')
            .not('name_en', 'ilike', '%token%')
            .not('name_en', 'ilike', '%gift box%')
            .not('name_en', 'ilike', '%box%')
            .not('name_en', 'ilike', '%tin%')
            .not('name_en', 'ilike', '%collection%');
        
        console.log(`🔍 [CardTrader] Query completata. Risultati: ${cards?.length || 0}, Errore: ${cardsError ? 'Sì' : 'No'}`);
        
        if (cardsError) {
            console.error('❌ [CardTrader] Errore query carte:', cardsError);
        } else if (cards && cards.length > 0) {
            console.log(`✅ [CardTrader] Trovate ${cards.length} carte per ${titleInfo.pokemonName}`);
            allResults.push(...cards);
        } else {
            console.log(`⚠️ [CardTrader] Nessuna carta trovata per ${titleInfo.pokemonName}`);
        }
        
        // 2. Se c'è un numero collezionista, cerca anche nelle varianti
        if (titleInfo.collectorNumber && allResults.length > 0) {
            console.log(`🔍 [CardTrader] Cercando varianti per numero: ${titleInfo.collectorNumber}`);
            
            const blueprintIds = allResults.map(card => card.blueprint_id).filter(id => id);
            
            if (blueprintIds.length > 0) {
                // Cerca prima il numero esatto
                const { data: variants, error: variantsError } = await supabaseClient
                    .from('card_variants')
                    .select('*')
                    .in('blueprint_id', blueprintIds)
                    .eq('collector_number', titleInfo.collectorNumber);
                
                if (variantsError) {
                    console.error('❌ [CardTrader] Errore query varianti:', variantsError);
                } else if (variants && variants.length > 0) {
                    console.log(`✅ [CardTrader] Trovate ${variants.length} varianti con numero ${titleInfo.collectorNumber}`);
                    
                    // Combina le varianti con le informazioni delle carte
                    const variantResults = variants.map(variant => {
                        const card = allResults.find(c => c.blueprint_id === variant.blueprint_id);
                        if (card) {
                            return {
                                ...variant,
                                name_en: card.name_en,
                                pokemon_name: card.name_en,
                                expansion_name_en: card.expansion_name_en,
                                expansion_code: card.expansion_code,
                                source: 'variant_number_match',
                                exact_number_match: true
                            };
                        }
                        return null;
                    }).filter(result => result !== null);
                    
                    allResults.push(...variantResults);
                }
                
                // Cerca anche varianti con prefissi di espansione (es: SWSH307, swsh307)
                const expansionPrefixes = ['swsh', 'sv', 'sm', 'xy', 'bw', 'dp', 'ss'];
                for (const prefix of expansionPrefixes) {
                    const prefixedNumber = prefix + titleInfo.collectorNumber;
                    console.log(`🔍 [CardTrader] Cercando varianti con prefisso: ${prefixedNumber}`);
                    
                    const { data: prefixedVariants, error: prefixedError } = await supabaseClient
                        .from('card_variants')
                        .select('*')
                        .in('blueprint_id', blueprintIds)
                        .eq('collector_number', prefixedNumber);
                    
                    if (!prefixedError && prefixedVariants && prefixedVariants.length > 0) {
                        console.log(`✅ [CardTrader] Trovate ${prefixedVariants.length} varianti con numero ${prefixedNumber}`);
                        
                        const prefixedResults = prefixedVariants.map(variant => {
                            const card = allResults.find(c => c.blueprint_id === variant.blueprint_id);
                            if (card) {
                                return {
                                    ...variant,
                                    name_en: card.name_en,
                                    pokemon_name: card.name_en,
                                    expansion_name_en: card.expansion_name_en,
                                    expansion_code: card.expansion_code,
                                    source: 'variant_prefixed_number_match',
                                    exact_number_match: true
                                };
                            }
                            return null;
                        }).filter(result => result !== null);
                        
                        allResults.push(...prefixedResults);
                    }
                }
            }
        }
        
        // 3. Se c'è un'espansione, filtra per quella
        if (titleInfo.expansion && allResults.length > 0) {
            console.log(`🔍 [CardTrader] Filtro per espansione: ${titleInfo.expansion}`);
            
            const expansionLower = titleInfo.expansion.toLowerCase();
            
            // Logica speciale per promo SWSH: non filtrare per espansione se è una promo
            if (expansionLower.includes('sword & shield black star promos') || 
                expansionLower.includes('black star promos') ||
                (titleInfo.collectorNumber && titleInfo.cardType === 'black star')) {
                console.log(`🎯 [CardTrader] Promo SWSH rilevata, saltando filtro espansione`);
            } else {
                allResults = allResults.filter(card => {
                    const cardExpansion = (card.expansion_name_en || card.expansion_code || '').toLowerCase();
                    return cardExpansion.includes(expansionLower) || expansionLower.includes(cardExpansion);
                });
            }
            
            console.log(`✅ [CardTrader] ${allResults.length} carte dopo filtro espansione`);
        }
        
        // 4. Valida e punteggia i risultati
        const validatedResults = scoreAndValidateResults(allResults, titleInfo, originalTitle);
        
        // 5. FALLBACK SPECIALE PER CARDMARKET: Se siamo su Cardmarket e non troviamo risultati, 
        // NON creare un link di ricerca su Cardmarket (l'utente vuole andare su CardTrader)
        if (validatedResults.length === 0 && window.location.hostname.includes('cardmarket')) {
            console.log('🔍 [CardTrader] Nessun risultato trovato su Cardmarket, ma siamo già su Cardmarket - non creo fallback');
            return [];
        }
        
        return validatedResults;
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nella ricerca:', error);
        return [];
    }
}

// Estrai la rarità dall'URL dell'immagine
function extractRarityFromImageUrl(imageUrl) {
    if (!imageUrl) return null;
    
    // Cerca pattern comuni di rarità negli URL
    const rarityPatterns = [
        /rarity=(\w+)/i,
        /-(\w+)-rare-/i,
        /-(\w+)-uncommon-/i,
        /-(\w+)-common-/i,
        /-(\w+)-secret-/i,
        /-(\w+)-ultra-/i,
        /-(\w+)-holo-/i,
        /-(\w+)-reverse-/i
    ];
    
    for (const pattern of rarityPatterns) {
        const match = imageUrl.match(pattern);
        if (match) {
            return match[1].toLowerCase();
        }
    }
    
    return null;
}

// Calcola la similarità tra due stringhe (algoritmo di Levenshtein semplificato)
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    // Se sono identiche, similarità massima
    if (s1 === s2) return 1;
    
    // Se una contiene l'altra, alta similarità
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    // Casi speciali per Pokemon
    const specialMatches = {
        'evee': 'eevee',
        'eevee': 'evee',
        'pikach': 'pikachu',
        'chariz': 'charizard',
        'mew': 'mewtwo',
        'mewtwo': 'mew'
    };
    
    if (specialMatches[s1] === s2 || specialMatches[s2] === s1) {
        return 0.8; // Alta similarità per casi speciali
    }
    
    // Calcola similarità basata su caratteri comuni
    const len1 = s1.length;
    const len2 = s2.length;
    const maxLen = Math.max(len1, len2);
    
    if (maxLen === 0) return 1;
    
    // Calcola la distanza di Levenshtein semplificata
    let distance = 0;
    let i = 0, j = 0;
    
    while (i < len1 && j < len2) {
        if (s1[i] === s2[j]) {
            i++;
            j++;
        } else {
            distance++;
            // Avanza nella stringa più corta
            if (len1 < len2) {
                j++;
            } else if (len2 < len1) {
                i++;
            } else {
                i++;
                j++;
            }
        }
    }
    
    // Aggiungi la differenza di lunghezza
    distance += Math.abs(len1 - len2);
    
    // Converti distanza in similarità
    return Math.max(0, 1 - (distance / maxLen));
}

// Funzione per estrarre TUTTE le parole dal titolo (escludendo Pokemon name e collector number)
function extractAllWordsFromTitle(originalTitle, titleInfo) {
    if (!originalTitle) return [];
    
    // Converti in minuscolo e rimuovi caratteri speciali
    let cleanTitle = originalTitle.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Sostituisci caratteri speciali con spazi
        .replace(/\s+/g, ' ') // Normalizza spazi multipli
        .trim();
    
    // Rimuovi il nome Pokemon se presente
    if (titleInfo.pokemonName) {
        const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
        cleanTitle = cleanTitle.replace(new RegExp(`\\b${pokemonNameLower}\\b`, 'gi'), '');
    }
    
    // Rimuovi il numero collezionista se presente
    if (titleInfo.collectorNumber) {
        const collectorNumberStr = titleInfo.collectorNumber.toString();
        cleanTitle = cleanTitle.replace(new RegExp(`\\b${collectorNumberStr}\\b`, 'gi'), '');
    }
    
    // Rimuovi l'espansione se presente
    if (titleInfo.expansion) {
        const expansionLower = titleInfo.expansion.toLowerCase();
        cleanTitle = cleanTitle.replace(new RegExp(`\\b${expansionLower}\\b`, 'gi'), '');
    }
    
    // Estrai tutte le parole rimanenti (lunghezza >= 2 caratteri)
    const words = cleanTitle.split(/\s+/)
        .filter(word => word.length >= 2)
        .filter(word => !['card', 'pokemon', 'game', 'trading', 'collectible'].includes(word)); // Rimuovi parole generiche
    
    console.log(`🔍 [CardTrader] Parole estratte da "${originalTitle}":`, words);
    return words;
}

// Funzione per calcolare il punteggio di matching parola per parola con image_url
function calculateImageUrlWordMatch(imageUrl, titleWords) {
    if (!imageUrl || !titleWords || titleWords.length === 0) return 0;
    
    // Estrai la parte finale dell'URL (dopo l'ultimo /)
    const urlParts = imageUrl.split('/');
    const finalPart = urlParts[urlParts.length - 1] || '';
    
    // Rimuovi l'estensione del file se presente
    const finalPartWithoutExt = finalPart.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    
    // Converti in minuscolo e normalizza
    const normalizedFinalPart = finalPartWithoutExt.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Sostituisci caratteri speciali con spazi
        .replace(/\s+/g, ' ') // Normalizza spazi multipli
        .trim();
    
    console.log(`🔍 [CardTrader] Parte finale URL: "${normalizedFinalPart}"`);
    
    let totalScore = 0;
    let matchedWords = [];
    
    // Per ogni parola del titolo, cerca match nella parte finale dell'URL
    titleWords.forEach((word, index) => {
        const wordLower = word.toLowerCase();
        
        // Controlla se la parola è presente nella parte finale dell'URL
        if (normalizedFinalPart.includes(wordLower)) {
            // Punteggio progressivo: prima parola = 1000, seconda = 900, terza = 800, ecc.
            const progressiveScore = Math.max(100, 1000 - (index * 100));
            totalScore += progressiveScore;
            matchedWords.push({ word: wordLower, score: progressiveScore });
            
            console.log(`🎯 [CardTrader] MATCH PAROLA: "${wordLower}" -> +${progressiveScore} punti`);
        }
    });
    
    if (matchedWords.length > 0) {
        console.log(`📊 [CardTrader] Parole matchate:`, matchedWords);
    }
    
    return totalScore;
}

// Funzione per generare chiave cache
function generateCacheKey(title) {
    return title.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Funzione per generare link CardTrader
function generateCardTraderLink(blueprintId) {
    // Caso speciale per ricerca Cardmarket
    if (blueprintId === 'cardmarket_search') {
        return null; // Non generare link CardTrader per ricerche Cardmarket
    }
    return `https://cardtrader.com/cards/${blueprintId}`;
}

// Funzione per aggiornare le statistiche
async function updateStats(type, increment = 1) {
    try {
        const result = await chrome.storage.local.get(['stats']);
        const stats = result.stats || { cardsProcessed: 0, linksGenerated: 0 };
        
        if (type === 'cardsProcessed') {
            stats.cardsProcessed += increment;
        } else if (type === 'linksGenerated') {
            stats.linksGenerated += increment;
        }
        
        await chrome.storage.local.set({ stats: stats });
    } catch (error) {
        console.error('Errore nell\'aggiornamento statistiche:', error);
    }
}

// Esegui il patch iniziale per entrambi i siti
patchEbayProductPage();
patchVintedProductPage();
patchCardmarketProductPage();

// Retry del patch per pagine che si caricano dopo
setTimeout(() => {
    console.log('🔄 [CardTrader] Retry patch pagina prodotto...');
    patchEbayProductPage();
    patchVintedProductPage();
    patchCardmarketProductPage();
}, 3000);

setTimeout(() => {
    console.log('🔄 [CardTrader] Secondo retry patch pagina prodotto...');
    patchEbayProductPage();
    patchVintedProductPage();
    patchCardmarketProductPage();
}, 5000);

// Funzione per punteggiare e validare i risultati
function scoreAndValidateResults(results, titleInfo, originalTitle) {
    console.log(`🔍 [CardTrader] Validando ${results.length} risultati`);
    
    const scoredResults = results.map(result => {
        const name = result.name_en || result.pokemon_name || '';
        const collectorNumber = result.collector_number || '';
        const imageUrlLower = (result.image_url || '').toLowerCase();
        
        console.log(`🔍 [CardTrader] Analizzando carta: "${name}" (${collectorNumber}) - URL: ${result.image_url}`);
        
        let score = 0;
        let reason = '';
        
        // PRIORITÀ 0: Controllo IMMEDIATO per carte jumbo/oversized nell'URL
        const requiresJumbo = originalTitle.toLowerCase().includes('jumbo') || originalTitle.toLowerCase().includes('oversized') || originalTitle.toLowerCase().includes('oversize') || originalTitle.toLowerCase().includes('giant') || originalTitle.toLowerCase().includes('large');
        
        // ESCLUSIONE SPECIFICA: Blueprint 236583 (Carta jumbo Lucario VSTAR 214)
        if (result.blueprint_id === 236583) {
            reason = `Blueprint 236583 (Carta jumbo Lucario VSTAR 214) - ESCLUSA SPECIFICAMENTE`;
            console.log(`🚫 [CardTrader] Blueprint 236583 ESCLUSA SPECIFICAMENTE: "${result.name_en || result.pokemon_name}" (ID: ${result.blueprint_id})`);
            return { result, score: -9999, reason: reason.trim() };
        }
        
        // ESCLUSIONE SPECIFICA: Carta jumbo Lucario VSTAR 214 (URL)
        if (imageUrlLower && imageUrlLower.includes('lucario-vstar-jumbo-oversized-214-swsh-black-star-promos')) {
            reason = `Carta jumbo Lucario VSTAR 214 - ESCLUSA SPECIFICAMENTE`;
            console.log(`🚫 [CardTrader] Carta jumbo Lucario VSTAR 214 ESCLUSA SPECIFICAMENTE: "${result.image_url}"`);
            return { result, score: -9999, reason: reason.trim() };
        }
        
        // Se l'URL contiene jumbo/oversized e non è richiesto nel titolo, ESCLUDI IMMEDIATAMENTE
        if (imageUrlLower && !requiresJumbo && (imageUrlLower.includes('jumbo') || imageUrlLower.includes('oversized') || imageUrlLower.includes('oversize') || imageUrlLower.includes('giant') || imageUrlLower.includes('large'))) {
            reason = `Carta jumbo/oversized nell'URL non richiesta - ESCLUSA COMPLETAMENTE`;
            console.log(`🚫 [CardTrader] Carta jumbo/oversized ESCLUSA COMPLETAMENTE dall'URL: "${result.image_url}"`);
            return { result, score: -9999, reason: reason.trim() };
        }
        
        // PRIORITÀ 1: Escludi altri prodotti generici (Gift Box, Binder, Album, etc.)
        const genericProducts = [
            'gift box', 'gift-box', 'giftbox',
            'binder', 'album', 'folder',
            'deck box', 'deck-box', 'deckbox',
            'sleeves', 'sleeve',
            'playmat', 'play-mat', 'play mat',
            'dice', 'die',
            'coin', 'coins',
            'box set', 'box-set', 'boxset',
            'tin', 'tins',
            'collection', 'collections',
            'bundle', 'bundles',
            'booster box', 'booster-box', 'boosterbox',
            'theme deck', 'theme-deck', 'themedeck',
            'starter deck', 'starter-deck', 'starterdeck',
            'preconstructed deck', 'preconstructed-deck',
            'promo box', 'promo-box', 'promobox',
            'elite trainer box', 'elite-trainer-box', 'elitetrainerbox',
            'etb', 'etbs'
        ];
        
        const nameAndUrlLower = (name + ' ' + imageUrlLower).toLowerCase();
        let isGenericProduct = false;
        
        // Controlla altri prodotti generici
        for (const generic of genericProducts) {
            if (nameAndUrlLower.includes(generic)) {
                score -= 2000; // Penalità MASSIMA per prodotti generici
                reason += `Prodotto generico (${generic}) - ESCLUSO `;
                console.log(`❌ [CardTrader] Prodotto generico rilevato: "${generic}" in "${name}" -> -2000 punti`);
                isGenericProduct = true;
                break;
            }
        }
        
        // Se è un prodotto generico, salta tutte le altre validazioni
        if (isGenericProduct) {
            return { result, score, reason: reason.trim() };
        }
        
        // PRIORITÀ 1: Espansione (peso ridotto se c'è trainer name)
        let expansionScore = 0;
        let expansionReason = '';
        
        if (titleInfo.expansion && result.expansion_name_en) {
            const expansionSimilarity = calculateSimilarity(titleInfo.expansion.toLowerCase(), result.expansion_name_en.toLowerCase());
            if (expansionSimilarity >= 0.8) {
                expansionScore = titleInfo.trainerName ? 100 : 200; // Peso ridotto per trainer
                expansionReason = titleInfo.trainerName ? 'Espansione corretta (peso ridotto per trainer) ' : 'Espansione corretta ';
            } else if (expansionSimilarity >= 0.5) {
                expansionScore = titleInfo.trainerName ? 50 : 100; // Peso ridotto per trainer
                expansionReason = titleInfo.trainerName ? 'Espansione simile (peso ridotto per trainer) ' : 'Espansione simile ';
            } else {
                expansionScore = -20;
                expansionReason = 'Espansione completamente diversa ';
            }
            
            // PENALITÀ MASSIMA: Espansione completamente sbagliata quando abbiamo numero collezionista
            if (titleInfo.collectorNumber && expansionSimilarity < 0.3) {
                expansionScore -= 3000; // Penalità MASSIMA per espansione sbagliata con numero specifico
                expansionReason += 'Espansione SBAGLIATA con numero specifico ';
                console.log(`❌ [CardTrader] Espansione SBAGLIATA con numero specifico: "${titleInfo.expansion}" vs "${result.expansion_name_en}" -> -3000 punti`);
            }
        } else if (titleInfo.expansion) {
            expansionScore = -20;
            expansionReason = 'Espansione mancante nel database ';
        }
        score += expansionScore;
        reason += expansionReason;
        
        // PRIORITÀ 2: Nome del Pokemon (peso massimo)
        const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
        const resultNameLower = name.toLowerCase();
        
        // Normalizza i nomi per il confronto (rimuovi spazi, punti, trattini)
        const normalizedPokemonName = pokemonNameLower.replace(/[\s.-]/g, '');
        const normalizedResultName = resultNameLower.replace(/[\s.-]/g, '');
        
        console.log(`🔍 [CardTrader] Confronto nomi: "${pokemonNameLower}" vs "${resultNameLower}"`);
        console.log(`🔍 [CardTrader] Normalizzati: "${normalizedPokemonName}" vs "${normalizedResultName}"`);
        
        if (normalizedResultName.includes(normalizedPokemonName) || 
            normalizedPokemonName.includes(normalizedResultName) ||
            resultNameLower.includes(pokemonNameLower) || 
            pokemonNameLower.includes(resultNameLower)) {
            score += 1000; // Peso massimo per il nome Pokemon
            reason += 'Nome Pokemon PERFETTO ';
            console.log(`✅ [CardTrader] Match nome Pokemon: "${name}" -> +1000 punti`);
        } else {
            score -= 2000; // Penalità severa se il nome non corrisponde
            reason += 'Nome Pokemon SBAGLIATO ';
            console.log(`❌ [CardTrader] Nome Pokemon non match: "${name}" -> -2000 punti`);
        }
        
        // BONUS: Nome Pokemon esatto (senza altre parole)
        if (normalizedResultName === normalizedPokemonName) {
            score += 500; // Bonus extra per nome esatto
            reason += 'Nome Pokemon ESATTO ';
            console.log(`🎯 [CardTrader] Nome Pokemon ESATTO: "${name}" -> +500 punti`);
        }
        
        // PRIORITÀ 3: Numero collezionista (PESO MASSIMO) - Gestione prefissi espansione
        if (titleInfo.collectorNumber) {
            const requestedNumber = titleInfo.collectorNumber;
            const dbNumber = collectorNumber;
            
            console.log(`🔍 [CardTrader] Confronto numeri: Richiesto="${requestedNumber}" vs Database="${dbNumber}"`);
            
            // Controlla match esatto
            if (dbNumber === requestedNumber) {
                score += 5000; // Peso MASSIMO per numero perfetto
                reason += 'Numero collezionista PERFETTO (PRIORITÀ MASSIMA) ';
                console.log(`🎯 [CardTrader] Numero collezionista PERFETTO: "${dbNumber}" = "${requestedNumber}" -> +5000 punti (PRIORITÀ MASSIMA)`);
            } 
            // Controlla se il numero del database contiene quello richiesto (es: "SWSH291" contiene "291")
            else if (dbNumber.toLowerCase().includes(requestedNumber.toLowerCase())) {
                score += 4000; // Peso molto alto per numero con prefisso
                reason += 'Numero collezionista con prefisso espansione ';
                console.log(`🎯 [CardTrader] Numero con prefisso: "${dbNumber}" include "${requestedNumber}" -> +4000 punti`);
            }
            // Controlla se il numero richiesto contiene quello del database (es: "291" in "SWSH291")
            else if (requestedNumber.toLowerCase().includes(dbNumber.toLowerCase())) {
                score += 3000; // Peso alto per match inverso
                reason += 'Numero collezionista match inverso ';
                console.log(`🎯 [CardTrader] Match inverso: "${requestedNumber}" include "${dbNumber}" -> +3000 punti`);
            }
            // Controlla varianti comuni per carte promo
            else {
                // Estrai solo i numeri da entrambi per confronto
                const requestedNumbers = requestedNumber.match(/\d+/g) || [];
                const dbNumbers = dbNumber.match(/\d+/g) || [];
                
                let numberMatch = false;
                for (const reqNum of requestedNumbers) {
                    for (const dbNum of dbNumbers) {
                        if (reqNum === dbNum) {
                            score += 2000; // Peso alto per match numerico
                            reason += `Match numerico: ${reqNum} `;
                            console.log(`🎯 [CardTrader] Match numerico: "${reqNum}" trovato in "${dbNumber}" -> +2000 punti`);
                            numberMatch = true;
                            break;
                        }
                    }
                    if (numberMatch) break;
                }
                
                if (!numberMatch) {
                    score -= 2000; // Penalità MASSIMA se il numero non corrisponde
                    reason += 'Numero collezionista SBAGLIATO ';
                    console.log(`❌ [CardTrader] Numero collezionista SBAGLIATO: "${dbNumber}" ≠ "${requestedNumber}" -> -2000 punti`);
                }
            }
        } else {
            reason += 'Numero collezionista non richiesto ';
        }
        
        // PRIORITÀ 4: Validazione obbligatoria per trainer name (nel NOME della carta)
        if (titleInfo.trainerName) {
            const trainerNameLower = titleInfo.trainerName.toLowerCase();
            const cardNameLower = name.toLowerCase();
            let trainerFound = false;
            
            // Cerca match esatto nel nome della carta
            if (cardNameLower.includes(trainerNameLower)) {
                score += 500; // Bonus MASSIMO per trainer name presente
                reason += `Trainer ${titleInfo.trainerName} nel NOME CORRETTO `;
                console.log(`🎯 [CardTrader] Trainer ${titleInfo.trainerName} trovato nel nome: "${name}" -> +500 punti`);
                trainerFound = true;
            } else {
                // Cerca varianti comuni nel nome della carta
                const trainerVariants = [
                    trainerNameLower + 's', // erika -> erikas
                    trainerNameLower + '\'s', // erika -> erika's
                    trainerNameLower.replace('lt. ', 'lt'), // lt. surge -> ltsurge
                    trainerNameLower.replace('mr. ', 'mr'), // mr. mime -> mrmime
                ];
                
                for (const variant of trainerVariants) {
                    if (cardNameLower.includes(variant)) {
                        score += 400; // Bonus alto per variante trainer name
                        reason += `Trainer ${titleInfo.trainerName} (variante ${variant}) nel NOME CORRETTO `;
                        console.log(`🎯 [CardTrader] Trainer ${titleInfo.trainerName} (variante ${variant}) trovato nel nome: "${name}" -> +400 punti`);
                        trainerFound = true;
                        break;
                    }
                }
            }
            
            if (!trainerFound) {
                score -= 800; // Penalità MASSIMA per trainer name mancante
                reason += `Trainer ${titleInfo.trainerName} richiesto ma mancante nel NOME `;
                console.log(`❌ [CardTrader] Trainer ${titleInfo.trainerName} richiesto ma non trovato nel nome: "${name}" -> -800 punti`);
            }
        }
        
        // PRIORITÀ 5: Validazione obbligatoria per Holo
        if (originalTitle.toLowerCase().includes('holo') && imageUrlLower && !imageUrlLower.includes('holo')) {
            score -= 500; // Penalità MASSIMA per Holo mancante
            reason += 'Holo richiesto ma mancante nell\'URL ';
            console.log(`❌ [CardTrader] Holo richiesto ma non trovato in: "${result.image_url}" -> -500 punti`);
        } else if (originalTitle.toLowerCase().includes('holo') && imageUrlLower && imageUrlLower.includes('holo')) {
            score += 300; // Bonus MASSIMO per Holo presente
            reason += 'Holo nell\'URL CORRETTO ';
            console.log(`🎯 [CardTrader] Holo trovato in: "${result.image_url}" -> +300 punti`);
        }
        
        // Gestione speciale per "star" - solo se non è "black star promo"
        const titleLower = originalTitle.toLowerCase();
        if (titleLower.includes(' star ') && !titleLower.includes('black star promo') && !titleLower.includes('gold star')) {
            if (imageUrlLower && !imageUrlLower.includes('star')) {
                score -= 500; // Penalità MASSIMA per Star mancante
                reason += 'Star richiesto ma mancante nell\'URL ';
                console.log(`❌ [CardTrader] Star richiesto ma non trovato in: "${result.image_url}" -> -500 punti`);
            } else if (imageUrlLower && imageUrlLower.includes('star')) {
                score += 300; // Bonus MASSIMO per Star presente
                reason += 'Star nell\'URL CORRETTO ';
                console.log(`🎯 [CardTrader] Star trovato in: "${result.image_url}" -> +300 punti`);
            }
        }
        
        // PRIORITÀ ALTA: Validazione e bonus per tipi di carte speciali (VSTAR, EX, GX, VMAX, V, etc.)
        const cardTypeConfigs = [
            { title: ' ex ', url: 'ex', name: 'EX', bonus: 1500 },
            { title: ' v ', url: 'v', name: 'V', bonus: 1200 },
            { title: ' vmax ', url: 'vmax', name: 'VMAX', bonus: 1500 },
            { title: ' vstar ', url: 'vstar', name: 'VSTAR', bonus: 1500 },
            { title: ' gx ', url: 'gx', name: 'GX', bonus: 1500 },
            { title: ' break ', url: 'break', name: 'BREAK', bonus: 1000 },
            { title: ' prime ', url: 'prime', name: 'Prime', bonus: 1000 },
            { title: ' lv.x ', url: 'lv.x', name: 'LV.X', bonus: 1000 },
            { title: ' lvx ', url: 'lvx', name: 'LVX', bonus: 1000 },
            { title: ' delta ', url: 'delta', name: 'Delta', bonus: 800 },
            { title: ' crystal ', url: 'crystal', name: 'Crystal', bonus: 800 },
            { title: ' shining ', url: 'shining', name: 'Shining', bonus: 800 },
            { title: ' gold star ', url: 'gold-star', name: 'Gold Star', bonus: 1000 },
            { title: ' goldstar ', url: 'goldstar', name: 'Gold Star', bonus: 1000 }
        ];
        
        // Controlla se il titolo contiene keyword di tipo carta
        let keywordFound = false;
        for (const cardType of cardTypeConfigs) {
            if (titleLower.includes(cardType.title)) {
                keywordFound = true;
                
                // Controlla se la keyword è presente nel nome della carta
                const cardNameLower = name.toLowerCase();
                if (cardNameLower.includes(cardType.url)) {
                    // BONUS MASSIMO: Keyword presente sia nel titolo che nel nome della carta
                    score += cardType.bonus;
                    reason += `${cardType.name} nel NOME CORRETTO (PRIORITÀ ALTA) `;
                    console.log(`🎯 [CardTrader] ${cardType.name} trovato nel nome: "${name}" -> +${cardType.bonus} punti (PRIORITÀ ALTA)`);
                } else {
                    // Penalità: Keyword nel titolo ma non nel nome della carta
                    score -= 2000; // Penalità aumentata da -1000 a -2000
                    reason += `${cardType.name} richiesto ma mancante nel NOME `;
                    console.log(`❌ [CardTrader] ${cardType.name} richiesto ma non trovato nel nome: "${name}" -> -2000 punti`);
                }
                
                // Controlla anche l'URL dell'immagine per conferma aggiuntiva
                if (imageUrlLower && imageUrlLower.includes(cardType.url)) {
                    score += 2000; // Bonus MASSIMO per conferma URL nell'URL (era 500)
                    reason += `${cardType.name} confermato nell'URL (PRIORITÀ ALTA) `;
                    console.log(`🎯 [CardTrader] ${cardType.name} confermato nell'URL: "${result.image_url}" -> +2000 punti (PRIORITÀ ALTA)`);
                    
                    // BONUS EXTRA: Keyword perfettamente posizionata nell'URL
                    const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
                    if (imageUrlLower.includes(pokemonNameLower + '-' + cardType.url) || 
                        imageUrlLower.includes(cardType.url + '-' + pokemonNameLower)) {
                        score += 1000; // Bonus extra per posizione perfetta
                        reason += `${cardType.name} posizione perfetta nell'URL `;
                        console.log(`🎯 [CardTrader] ${cardType.name} posizione perfetta nell'URL: "${result.image_url}" -> +1000 punti extra`);
                    }
                } else if (imageUrlLower && !imageUrlLower.includes(cardType.url)) {
                    score -= 2000; // Penalità MASSIMA per mancata conferma URL (era -1000)
                    reason += `${cardType.name} non confermato nell'URL `;
                    console.log(`⚠️ [CardTrader] ${cardType.name} non confermato nell'URL: "${result.image_url}" -> -2000 punti`);
                }
                
                break; // Usa solo la prima keyword trovata per evitare conflitti
            }
        }
        
        // Se non è stata trovata nessuna keyword nel titolo, non applicare penalità
        if (!keywordFound) {
            reason += 'Nessuna keyword di tipo carta richiesta ';
        }
        
        // PENALITÀ: Keyword sbagliate nel nome della carta quando non richieste
        if (keywordFound) {
            const cardNameLower = name.toLowerCase();
            for (const cardType of cardTypeConfigs) {
                if (cardNameLower.includes(cardType.url) && !titleLower.includes(cardType.title)) {
                    score -= 3000; // Penalità aumentata per keyword sbagliata (era -1500)
                    reason += `${cardType.name} presente ma non richiesto `;
                    console.log(`❌ [CardTrader] ${cardType.name} presente ma non richiesto: "${name}" -> -3000 punti`);
                }
            }
        }
        
        // PENALITÀ MASSIMA: Carte promo/LV quando richiesta carta VSTAR/V/EX
        if (keywordFound) {
            const cardNameLower = name.toLowerCase();
            const titleLower = originalTitle.toLowerCase();
            
            // Se il titolo richiede VSTAR/V/EX ma la carta è LV/promo
            if ((titleLower.includes(' vstar ') || titleLower.includes(' v ') || titleLower.includes(' ex ')) && 
                (cardNameLower.includes('lv') || cardNameLower.includes('promo') || cardNameLower.includes('ar'))) {
                score -= 5000; // Penalità MASSIMA per tipo carta completamente sbagliato
                reason += 'Carta LV/promo quando richiesta VSTAR/V/EX ';
                console.log(`❌ [CardTrader] Carta LV/promo quando richiesta VSTAR/V/EX: "${name}" -> -5000 punti`);
            }
            
            // Se il titolo richiede LV/promo ma la carta è VSTAR/V/EX
            if ((titleLower.includes(' lv ') || titleLower.includes(' promo ') || titleLower.includes(' ar ')) && 
                (cardNameLower.includes('vstar') || cardNameLower.includes('v') || cardNameLower.includes('ex'))) {
                score -= 5000; // Penalità MASSIMA per tipo carta completamente sbagliato
                reason += 'Carta VSTAR/V/EX quando richiesta LV/promo ';
                console.log(`❌ [CardTrader] Carta VSTAR/V/EX quando richiesta LV/promo: "${name}" -> -5000 punti`);
            }
        }
        
        // PENALITÀ MASSIMA: Carte promo nell'URL quando non richieste
        if (imageUrlLower) {
            const titleLower = originalTitle.toLowerCase();
            
            // Se il titolo NON richiede promo ma l'URL contiene promo
            if (!titleLower.includes(' promo ') && !titleLower.includes(' ar ') && 
                (imageUrlLower.includes('ar') || imageUrlLower.includes('promo'))) {
                score -= 4000; // Penalità MASSIMA per promo nell'URL non richiesto
                reason += 'Carta promo nell\'URL non richiesta ';
                console.log(`❌ [CardTrader] Carta promo nell'URL non richiesta: "${result.image_url}" -> -4000 punti`);
            }
            
            // Se il titolo richiede VSTAR ma l'URL contiene LV/promo
            if (titleLower.includes(' vstar ') && 
                (imageUrlLower.includes('lv') || imageUrlLower.includes('ar') || imageUrlLower.includes('promo'))) {
                score -= 6000; // Penalità MASSIMA per LV/promo nell'URL quando richiesta VSTAR
                reason += 'LV/promo nell\'URL quando richiesta VSTAR ';
                console.log(`❌ [CardTrader] LV/promo nell'URL quando richiesta VSTAR: "${result.image_url}" -> -6000 punti`);
            }
            
            // BONUS: Se l'URL contiene sia la keyword richiesta che "promos" (carte promo normali)
            if (keywordFound && imageUrlLower.includes('promos') && imageUrlLower.includes('black-star-promos')) {
                score += 500; // Bonus per carta promo normale con keyword corretta
                reason += 'Carta promo normale con keyword corretta ';
                console.log(`🎯 [CardTrader] Carta promo normale con keyword corretta: "${result.image_url}" -> +500 punti`);
            }
        }
        

        
        // Bonus per match esatto del numero
        if (result.exact_number_match) {
            score += 500; // Bonus extra per match esatto
            reason += 'Match esatto numero ';
            console.log(`🎯 [CardTrader] BONUS MATCH ESATTO: +500 punti`);
        }
        
        // BONUS COMBINATO: Numero perfetto + Keyword corretta (PRIORITÀ MASSIMA)
        if (titleInfo.collectorNumber && collectorNumber === titleInfo.collectorNumber && keywordFound) {
            score += 2000; // Bonus MASSIMO per combinazione perfetta
            reason += 'COMBINAZIONE PERFETTA: Numero + Keyword (PRIORITÀ MASSIMA) ';
            console.log(`🎯 [CardTrader] BONUS COMBINATO PERFETTO: Numero "${collectorNumber}" + Keyword -> +2000 punti (PRIORITÀ MASSIMA)`);
        }
        
        // BONUS SPECIALE: Carte promo con numero nell'URL (es: lucario-vstar-swsh291-swsh-black-star-promos)
        if (titleInfo.collectorNumber && imageUrlLower) {
            const requestedNumber = titleInfo.collectorNumber.toLowerCase();
            const urlNumberMatch = imageUrlLower.includes(requestedNumber);
            
            if (urlNumberMatch) {
                score += 1500; // Bonus alto per numero nell'URL
                reason += 'Numero confermato nell\'URL (PROMO) ';
                console.log(`🎯 [CardTrader] Numero "${requestedNumber}" confermato nell'URL: "${result.image_url}" -> +1500 punti (PROMO)`);
            }
            
            // Controlla anche varianti con prefissi nell'URL
            const expansionPrefixes = ['swsh', 'sv', 'sm', 'xy', 'bw', 'dp'];
            for (const prefix of expansionPrefixes) {
                const prefixedNumber = prefix + requestedNumber;
                if (imageUrlLower.includes(prefixedNumber)) {
                    score += 1000; // Bonus per prefisso nell'URL
                    reason += `Prefisso ${prefix.toUpperCase()} confermato nell'URL `;
                    console.log(`🎯 [CardTrader] Prefisso "${prefixedNumber}" confermato nell'URL -> +1000 punti`);
                    break;
                }
            }
        }
        
        // Bonus per priorità alta
        if (result.priority === 'high') {
            score += 300; // Bonus per priorità alta
            reason += 'Priorità alta ';
            console.log(`🎯 [CardTrader] BONUS PRIORITÀ ALTA: +300 punti`);
        }
        
        // PRIORITÀ SPECIALE: Bonus per Fezandipiti ex blueprint 294979
        if (titleInfo.pokemonName && titleInfo.pokemonName.toLowerCase().includes('fezandipiti') && 
            result.blueprint_id === 294979) {
            score += 5000; // Bonus MASSIMO per il blueprint specifico
            reason += 'Fezandipiti ex blueprint 294979 (PRIORITÀ SPECIALE) ';
            console.log(`🎯 [CardTrader] BONUS FEZANDIPITI EX BLUEPRINT 294979: +5000 punti`);
        }
        
        // BONUS SPECIALE: Carte VSTAR quando richieste specificamente
        if (titleInfo.pokemonName && originalTitle.toLowerCase().includes(' vstar ') && 
            name.toLowerCase().includes('vstar')) {
            score += 3000; // Bonus alto per VSTAR richiesto e trovato
            reason += 'VSTAR richiesto e trovato (BONUS SPECIALE) ';
            console.log(`🎯 [CardTrader] BONUS VSTAR RICHIESTO E TROVATO: "${name}" -> +3000 punti`);
        }
        
        console.log(`📊 [CardTrader] Punteggio finale per "${name}": ${score} - Motivo: ${reason.trim()}`);
        return { result, score, reason: reason.trim() };
    });
    
    // Ordina per punteggio
    scoredResults.sort((a, b) => b.score - a.score);
    
    // Filtra risultati con punteggi troppo bassi e prodotti generici
    const goodResults = scoredResults.filter(item => {
        // ESCLUSIONE SPECIFICA: Blueprint 236583 (Carta jumbo Lucario VSTAR 214)
        if (item.result.blueprint_id === 236583) {
            console.log(`🚫 [CardTrader] Blueprint 236583 ESCLUSA SPECIFICAMENTE dal filtro finale: "${item.result.name_en || item.result.pokemon_name}" (ID: ${item.result.blueprint_id})`);
            return false;
        }
        
        // ESCLUSIONE SPECIFICA: Carta jumbo Lucario VSTAR 214 (URL)
        const imageUrl = (item.result.image_url || '').toLowerCase();
        if (imageUrl.includes('lucario-vstar-jumbo-oversized-214-swsh-black-star-promos')) {
            console.log(`🚫 [CardTrader] Carta jumbo Lucario VSTAR 214 ESCLUSA SPECIFICAMENTE dal filtro finale: "${item.result.image_url}"`);
            return false;
        }
        
        // Controllo ESPLICITO per carte jumbo/oversized nell'URL
        const requiresJumbo = originalTitle.toLowerCase().includes('jumbo') || originalTitle.toLowerCase().includes('oversized') || originalTitle.toLowerCase().includes('oversize') || originalTitle.toLowerCase().includes('giant') || originalTitle.toLowerCase().includes('large');
        
        if (imageUrl && !requiresJumbo && (imageUrl.includes('jumbo') || imageUrl.includes('oversized') || imageUrl.includes('oversize') || imageUrl.includes('giant') || imageUrl.includes('large'))) {
            console.log(`🚫 [CardTrader] Carta jumbo/oversized ESCLUSA dal filtro finale: "${item.result.image_url}"`);
            return false;
        }
        
        // Escludi prodotti generici completamente
        const nameAndUrl = (item.result.name_en || item.result.pokemon_name || '') + ' ' + (item.result.image_url || '');
        const nameAndUrlLower = nameAndUrl.toLowerCase();
        
        const genericProducts = [
            'gift box', 'gift-box', 'giftbox',
            'binder', 'album', 'folder',
            'deck box', 'deck-box', 'deckbox',
            'sleeves', 'sleeve',
            'playmat', 'play-mat', 'play mat',
            'dice', 'die',
            'coin', 'coins',
            'box set', 'box-set', 'boxset',
            'tin', 'tins',
            'collection', 'collections',
            'bundle', 'bundles',
            'booster box', 'booster-box', 'boosterbox',
            'theme deck', 'theme-deck', 'themedeck',
            'starter deck', 'starter-deck', 'starterdeck',
            'preconstructed deck', 'preconstructed-deck',
            'promo box', 'promo-box', 'promobox',
            'elite trainer box', 'elite-trainer-box', 'elitetrainerbox',
            'etb', 'etbs'
        ];
        
        for (const generic of genericProducts) {
            if (nameAndUrlLower.includes(generic)) {
                console.log(`🚫 [CardTrader] Escluso prodotto generico: "${generic}" in "${item.result.name_en || item.result.pokemon_name}"`);
                return false;
            }
        }
        
        return item.score > -100;
    });
    
    console.log(`✅ [CardTrader] Risultati finali: ${goodResults.length} carte con punteggi validi`);
    
    // Log dei primi 3 risultati per debug
    goodResults.slice(0, 3).forEach((item, index) => {
        console.log(`🏆 [CardTrader] Risultato ${index + 1}: ${item.result.name_en || item.result.pokemon_name} - Punteggio: ${item.score} - Motivo: ${item.reason}`);
    });
    
    return goodResults.map(item => item.result);
}

// Inizializzazione ultra-rapida per inserimento immediato
initializeUltraFast();

// Inizializzazione completa in background
initializeExtension();