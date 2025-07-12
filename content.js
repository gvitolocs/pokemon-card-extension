// Content script per Pokemon Card Trader Linker
// Si attiva automaticamente su eBay e Vinted

console.log('🃏 Pokemon Card Trader Linker - Estensione attivata');

// Stato dell'estensione
let isEnabled = true;
let isProcessing = false;

// Inizializza le variabili globali se non esistono
if (typeof window.supabaseClient === 'undefined') {
    window.supabaseClient = null;
}

// Inizializza l'estensione
async function initializeExtension() {
    try {
        console.log('🃏 Pokemon Card Trader Linker - Inizializzazione...');
        
        // Carica la configurazione
        if (typeof loadConfig === 'function') {
            await loadConfig();
            console.log('✅ Configurazione caricata');
        } else {
            console.warn('⚠️ Funzione loadConfig non disponibile');
        }
        
        // Inizializza Supabase
        if (typeof initializeSupabase === 'function') {
            const supabaseReady = await initializeSupabase();
            
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
        } else {
            console.warn('⚠️ Funzione initializeSupabase non disponibile');
        }
        
        // Pulisci attributi processati esistenti
        cleanupProcessedAttributes();
        
        // Avvia l'osservatore per le nuove inserzioni
        startObserver();
        
        console.log('✅ Estensione inizializzata correttamente');
        
    } catch (error) {
        console.error('❌ Errore nell\'inizializzazione:', error);
        startObserver();
    }
}

// Funzione per pulire gli attributi processati
function cleanupProcessedAttributes() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('vinted')) {
        const cleanupSelectors = [
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
        
        cleanupSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (element.hasAttribute('data-pokemon-linker-processed')) {
                    element.removeAttribute('data-pokemon-linker-processed');
                }
            });
        });
        
        console.log('🧹 [CardTrader] Puliti attributi processati da elementi non rilevanti');
    }
}

// Avvia l'osservatore per rilevare nuove inserzioni
function startObserver() {
    try {
        console.log('🔍 [CardTrader] Avvio osservatore...');
        
        cleanupProcessedAttributes();
        
        const observer = new MutationObserver((mutations) => {
            if (!isEnabled || isProcessing) return;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            processNewListings(node);
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
            
            setTimeout(() => {
                processExistingListings();
            }, 2000);
            
            console.log('✅ [CardTrader] Osservatore avviato correttamente');
        } else {
            console.warn('⚠️ [CardTrader] Document.body non disponibile, riprovo tra 1 secondo');
            setTimeout(startObserver, 1000);
        }
    } catch (error) {
        console.error('❌ [CardTrader] Errore nell\'avvio osservatore:', error);
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
    
    listings.forEach(listing => {
        processListing(listing);
    });
}

// Processa le nuove inserzioni
function processNewListings(container) {
    if (!isEnabled || isProcessing) return;
    
    if (typeof findListingsInContainer !== 'function') {
        console.warn('⚠️ [CardTrader] Funzione findListingsInContainer non disponibile');
        return;
    }
    
    const listings = findListingsInContainer(container);
    
    listings.forEach(listing => {
        processListing(listing);
    });
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
            '.web_ui__Text__title',
            '.web_ui__Text__subtitle',
            '.web_ui__Text__body'
        ];
    } else if (hostname.includes('ebay')) {
        return [
            '.s-item',
            '.srp-results .s-item',
            '.srp-results .s-item__info',
            '.srp-results .s-item__title'
        ];
    }
    
    return [];
}

// Processa una singola inserzione
async function processListing(listingElement) {
    if (!isEnabled || isProcessing) return;
    
    try {
        isProcessing = true;
        
        // Evita di processare elementi già processati
        if (listingElement.hasAttribute('data-pokemon-linker-processed')) {
            return;
        }
        
        // Estrai il titolo
        const title = extractTitleFromListing(listingElement);
        if (!title) {
            console.log('🚫 [CardTrader] Nessun titolo trovato, saltando');
            return;
        }
        
        console.log(`🔍 [CardTrader] Processando inserzione: "${title}"`);
        
        // Estrai informazioni dal titolo
        const titleInfo = extractTitleInfo(title);
        if (!titleInfo.pokemonName) {
            console.log('🚫 [CardTrader] Nessun Pokemon trovato nel titolo, saltando');
            return;
        }
        
        console.log(`🎯 [CardTrader] Pokemon trovato: ${titleInfo.pokemonName}`);
        
        // Cerca nel database
        const results = await searchCardInDatabase(titleInfo, title);
        if (!results || results.length === 0) {
            console.log('❌ [CardTrader] Nessun risultato trovato nel database');
            return;
        }
        
        console.log(`✅ [CardTrader] Trovati ${results.length} risultati`);
        
        // Aggiungi i link CardTrader
        addCardTraderLinks(listingElement, results, titleInfo);
        
        // Marca come processato
        listingElement.setAttribute('data-pokemon-linker-processed', 'true');
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nel processamento inserzione:', error);
    } finally {
        isProcessing = false;
    }
}

// Estrai il titolo da un'inserzione
function extractTitleFromListing(listingElement) {
    const hostname = window.location.hostname;
    
    if (hostname.includes('vinted')) {
        // Selettori per Vinted
        const titleSelectors = [
            '[data-testid="item-card-title"]',
            '.web_ui__Text__title',
            '.web_ui__Text__subtitle',
            '.web_ui__Text__body',
            'h3',
            'h4',
            'h5',
            '.title',
            '.name'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                return element.textContent.trim();
            }
        }
        
        // Fallback: usa il testo dell'elemento stesso
        if (listingElement.textContent && listingElement.textContent.trim()) {
            return listingElement.textContent.trim();
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
                return element.textContent.trim();
            }
        }
        
        // Fallback: usa il testo dell'elemento stesso
        if (listingElement.textContent && listingElement.textContent.trim()) {
            return listingElement.textContent.trim();
        }
    }
    
    return null;
}

// Aggiungi i link CardTrader
function addCardTraderLinks(listingElement, results, titleInfo) {
    try {
        // Rimuovi link esistenti
        const existingLinks = listingElement.querySelectorAll('.pokemon-linker-links');
        existingLinks.forEach(link => link.remove());
        
        // Crea il container per i link
        const linkContainer = document.createElement('div');
        linkContainer.className = 'pokemon-linker-links';
        linkContainer.style.cssText = `
            margin-top: 8px;
            padding: 8px;
            background: #f8f9fa;
            border-radius: 4px;
            border: 1px solid #e9ecef;
            font-size: 12px;
        `;
        
        // Aggiungi il titolo
        const titleElement = document.createElement('div');
        titleElement.style.cssText = 'font-weight: bold; margin-bottom: 4px; color: #495057;';
        titleElement.textContent = '🔗 CardTrader Links:';
        linkContainer.appendChild(titleElement);
        
        // Aggiungi i link (massimo 3)
        const maxLinks = Math.min(results.length, 3);
        for (let i = 0; i < maxLinks; i++) {
            const result = results[i];
            const linkElement = document.createElement('a');
            linkElement.href = generateCardTraderLink(result.blueprint_id);
            linkElement.target = '_blank';
            linkElement.style.cssText = `
                display: block;
                margin-bottom: 2px;
                color: #007bff;
                text-decoration: none;
                font-size: 11px;
            `;
            linkElement.textContent = `${result.name_en || result.pokemon_name} (${result.expansion_name_en || 'Unknown'})`;
            
            linkElement.addEventListener('mouseenter', () => {
                linkElement.style.textDecoration = 'underline';
            });
            
            linkElement.addEventListener('mouseleave', () => {
                linkElement.style.textDecoration = 'none';
            });
            
            linkContainer.appendChild(linkElement);
        }
        
        // Inserisci il container
        insertLinkContainer(listingElement, linkContainer);
        
        console.log(`✅ [CardTrader] Aggiunti ${maxLinks} link CardTrader`);
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nell\'aggiunta link:', error);
    }
}

// Inserisci il container dei link
function insertLinkContainer(listingElement, linkContainer) {
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
                element.parentNode.insertBefore(linkContainer, element.nextSibling);
                return;
            }
        }
        
        // Fallback: inserisci alla fine dell'elemento
        listingElement.appendChild(linkContainer);
        
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
                element.parentNode.insertBefore(linkContainer, element.nextSibling);
                return;
            }
        }
        
        // Fallback: inserisci alla fine dell'elemento
        listingElement.appendChild(linkContainer);
    }
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
        console.log('🔍 [CardTrader] Ricerca automatica pagina corrente');
        
        const listings = findListings();
        let totalProcessed = 0;
        let totalResults = 0;
        
        for (const listing of listings) {
            if (listing.hasAttribute('data-pokemon-linker-processed')) {
                continue;
            }
            
            const title = extractTitleFromListing(listing);
            if (!title) continue;
            
            const titleInfo = extractTitleInfo(title);
            if (!titleInfo.pokemonName) continue;
            
            const results = await searchCardInDatabase(titleInfo, title);
            if (results && results.length > 0) {
                addCardTraderLinks(listing, results, titleInfo);
                totalResults += results.length;
            }
            
            listing.setAttribute('data-pokemon-linker-processed', 'true');
            totalProcessed++;
        }
        
        sendResponse({
            success: true,
            processed: totalProcessed,
            results: totalResults
        });
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nella ricerca automatica:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Patch per pagine prodotto eBay
function patchEbayProductPage() {
    if (!window.location.hostname.includes('ebay')) return;
    
    try {
        // Cerca il titolo del prodotto
        const titleSelectors = [
            'h1[data-testid="x-item-title__mainTitle"]',
            'h1.x-item-title__mainTitle',
            'h1.x-item-title__titleText',
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
                
                // Inserisci dopo il titolo
                titleElement.parentNode.insertBefore(linkContainer, titleElement.nextSibling);
                
                console.log(`✅ [CardTrader] Aggiunti ${maxLinks} link CardTrader alla pagina prodotto`);
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
                
                // Inserisci dopo il titolo
                titleElement.parentNode.insertBefore(linkContainer, titleElement.nextSibling);
                
                console.log(`✅ [CardTrader] Aggiunti ${maxLinks} link CardTrader alla pagina prodotto`);
            }
        });
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nel patch pagina prodotto Vinted:', error);
    }
}

// Estrai informazioni dal titolo
function extractTitleInfo(title) {
    const titleLower = title.toLowerCase();
    
    // Lista di Pokemon (solo quelli più comuni)
    const pokemonNames = [
        'mew', 'mewtwo', 'charizard', 'pikachu', 'blastoise', 'venusaur',
        'lugia', 'ho-oh', 'rayquaza', 'groudon', 'kyogre', 'dialga',
        'palkia', 'giratina', 'reshiram', 'zekrom', 'kyurem', 'xerneas',
        'yveltal', 'zygarde', 'solgaleo', 'lunala', 'necrozma', 'zacian',
        'zamazenta', 'calyrex', 'miraidon', 'koraidon', 'terapagos'
    ];
    
    // Cerca il Pokemon nel titolo
    let pokemonName = null;
    for (const pokemon of pokemonNames) {
        if (titleLower.includes(pokemon.toLowerCase())) {
            pokemonName = pokemon;
            break;
        }
    }
    
    // Cerca numero collezionista (pattern: numero/numero)
    const collectorNumberMatch = title.match(/(\d+)\/(\d+)/);
    const collectorNumber = collectorNumberMatch ? collectorNumberMatch[1] : null;
    
    // Cerca allenatori specifici
    const trainerNames = [
        'erika', 'sabrina', 'blaine', 'giovanni', 'brock', 'misty',
        'lt. surge', 'koga', 'bruno', 'agatha', 'lorelei', 'lance',
        'red', 'blue', 'green', 'yellow', 'crystal', 'ruby', 'sapphire',
        'emerald', 'diamond', 'pearl', 'platinum', 'black', 'white',
        'x', 'y', 'sun', 'moon', 'sword', 'shield', 'scarlet', 'violet'
    ];
    
    let trainerName = null;
    for (const trainer of trainerNames) {
        if (titleLower.includes(trainer.toLowerCase())) {
            trainerName = trainer;
            break;
        }
    }
    
    // Cerca espansioni specifiche
    const expansions = [
        'v star universe', 'vstar universe', 'dragon frontier', 'dragon frontiers',
        'delta species', 'secret wonders', 'next destinies', 'boundaries crossed',
        'plasma storm', 'plasma freeze', 'legendary treasures', 'flashfire',
        'furious fists', 'phantom forces', 'primal clash', 'roaring skies',
        'ancient origins', 'breakthrough', 'breakpoint', 'fates collide',
        'steam siege', 'evolutions', 'sun & moon', 'guardians rising',
        'burning shadows', 'crimson invasion', 'ultra prism', 'forbidden light',
        'celestial storm', 'dragon majesty', 'lost thunder', 'team up',
        'unbroken bonds', 'unified minds', 'hidden fates', 'cosmic eclipse',
        'sword & shield', 'rebel clash', 'darkness ablaze', 'champions path',
        'vivid voltage', 'shining fates', 'battle styles', 'chilling reign',
        'evolving skies', 'fusion strike', 'brilliant stars', 'astral radiance',
        'lost origin', 'silver tempest', 'scarlet & violet', 'paldea evolved',
        'obsidian flames', '151', 'paradox rift', 'temporal forces'
    ];
    
    let expansion = null;
    for (const exp of expansions) {
        if (titleLower.includes(exp.toLowerCase())) {
            expansion = exp;
            break;
        }
    }
    
    return {
        pokemonName: pokemonName,
        collectorNumber: collectorNumber,
        trainerName: trainerName,
        expansion: expansion,
        originalTitle: title
    };
}

// Cerca carte nel database
async function searchCardInDatabase(titleInfo, originalTitle = '') {
    try {
        const supabaseClient = window.supabaseClient;
        
        if (!supabaseClient) {
            console.error('❌ [CardTrader] Supabase client non disponibile');
            return [];
        }
        
        console.log('🔍 [CardTrader] Cercando con criteri:', titleInfo);
        
        let allResults = [];
        
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
        } else {
            query = query.ilike('name_en', `%${titleInfo.pokemonName}%`);
        }
        
        const { data: cards, error: cardsError } = await query
            .not('name_en', 'ilike', '%deck%')
            .not('name_en', 'ilike', '%booster%')
            .not('name_en', 'ilike', '%bundle%')
            .not('name_en', 'ilike', '%lot%')
            .not('name_en', 'ilike', '%binder%')
            .not('name_en', 'ilike', '%album%')
            .not('name_en', 'ilike', '%sleeve%')
            .not('name_en', 'ilike', '%dice%')
            .not('name_en', 'ilike', '%token%');
        
        if (!cardsError && cards && cards.length > 0) {
            console.log(`✅ [CardTrader] Trovate ${cards.length} carte base per ${titleInfo.pokemonName}`);
            
            // Aggiungi le carte base
            cards.forEach(card => {
                allResults.push({ 
                    ...card, 
                    source: 'cards_base',
                    pokemon_match: true
                });
            });
            
            // Cerca anche le varianti con image_url per queste carte
            const blueprintIds = cards.map(card => card.blueprint_id).filter(id => id);
            
            if (blueprintIds.length > 0) {
                console.log(`🔍 [CardTrader] Cercando varianti con image_url per ${blueprintIds.length} carte`);
                
                const { data: variants, error: variantsError } = await supabaseClient
                    .from('card_variants')
                    .select('*')
                    .in('blueprint_id', blueprintIds)
                    .not('image_url', 'is', null)
                    .limit(50); // Limita per performance
                
                if (!variantsError && variants && variants.length > 0) {
                    console.log(`✅ [CardTrader] Trovate ${variants.length} varianti con image_url`);
                    
                    variants.forEach(variant => {
                        const card = cards.find(c => c.blueprint_id === variant.blueprint_id);
                        if (card) {
                            const combinedResult = {
                                ...variant,
                                name_en: card.name_en,
                                pokemon_name: card.name_en,
                                expansion_name_en: card.expansion_name_en,
                                expansion_code: card.expansion_code,
                                source: 'card_variants_with_image'
                            };
                            allResults.push(combinedResult);
                        }
                    });
                }
            }
        }
        
        // 2. Se abbiamo un numero collezionista specifico, cerca le varianti
        if (titleInfo.collectorNumber) {
            console.log(`🔍 [CardTrader] Cercando varianti con numero collezionista: ${titleInfo.collectorNumber}`);
            
            let pokemonQuery = supabaseClient
                .from('cards')
                .select('blueprint_id, name_en, expansion_name_en, expansion_code');
            
            if (titleInfo.pokemonName === 'mew') {
                pokemonQuery = pokemonQuery.ilike('name_en', '%mew%')
                                         .not('name_en', 'ilike', '%mewtwo%');
            } else if (titleInfo.pokemonName === 'mewtwo') {
                pokemonQuery = pokemonQuery.ilike('name_en', '%mewtwo%');
            } else {
                pokemonQuery = pokemonQuery.ilike('name_en', `%${titleInfo.pokemonName}%`);
            }
            
            const { data: pokemonCards, error: pokemonCardsError } = await pokemonQuery;
            
            if (!pokemonCardsError && pokemonCards && pokemonCards.length > 0) {
                const blueprintIds = pokemonCards.map(card => card.blueprint_id).filter(id => id);
                
                if (blueprintIds.length > 0) {
                    const { data: variantsWithNumber, error: variantsError } = await supabaseClient
                        .from('card_variants')
                        .select('*')
                        .in('blueprint_id', blueprintIds)
                        .eq('collector_number', titleInfo.collectorNumber);
                    
                    if (!variantsError && variantsWithNumber && variantsWithNumber.length > 0) {
                        console.log(`✅ [CardTrader] Trovate ${variantsWithNumber.length} varianti con numero ${titleInfo.collectorNumber}`);
                        
                        variantsWithNumber.forEach(variant => {
                            const card = pokemonCards.find(c => c.blueprint_id === variant.blueprint_id);
                            if (card) {
                                const combinedResult = {
                                    ...variant,
                                    name_en: card.name_en,
                                    pokemon_name: card.name_en,
                                    expansion_name_en: card.expansion_name_en,
                                    expansion_code: card.expansion_code,
                                    source: 'card_variants_number'
                                };
                                allResults.push(combinedResult);
                            }
                        });
                    }
                }
            }
        }
        
        // 3. Se abbiamo un'espansione specifica, cerca in quella espansione
        if (titleInfo.expansion) {
            console.log(`🔍 [CardTrader] Cercando nell'espansione: ${titleInfo.expansion}`);
            
            let expansionQuery = supabaseClient
                .from('cards')
                .select('*');
            
            if (titleInfo.pokemonName === 'mew') {
                expansionQuery = expansionQuery.ilike('name_en', '%mew%')
                                             .not('name_en', 'ilike', '%mewtwo%');
            } else if (titleInfo.pokemonName === 'mewtwo') {
                expansionQuery = expansionQuery.ilike('name_en', '%mewtwo%');
            } else {
                expansionQuery = expansionQuery.ilike('name_en', `%${titleInfo.pokemonName}%`);
            }
            
            const { data: expansionCards, error: expansionError } = await expansionQuery
                .ilike('expansion_name_en', `%${titleInfo.expansion}%`);
            
            if (!expansionError && expansionCards && expansionCards.length > 0) {
                console.log(`✅ [CardTrader] Trovate ${expansionCards.length} carte nell'espansione ${titleInfo.expansion}`);
                
                expansionCards.forEach(card => {
                    const existing = allResults.find(r => r.blueprint_id === card.blueprint_id);
                    if (!existing) {
                        allResults.push({ 
                            ...card, 
                            source: 'cards_expansion',
                            expansion_match: true
                        });
                    }
                });
            }
        }
        
        if (allResults.length === 0) {
            console.log('❌ [CardTrader] Nessuna carta trovata');
            return [];
        }
        
        // 4. Sistema di punteggi BASATO SU MATCHING PAROLA PER PAROLA
        console.log(`🔍 [CardTrader] Applicando sistema di punteggi parola per parola`);
        
        // Estrai TUTTE le parole dal titolo originale (escludendo Pokemon name e collector number)
        const titleWords = extractAllWordsFromTitle(originalTitle, titleInfo);
        console.log(`📝 [CardTrader] Parole estratte dal titolo:`, titleWords);
        
        const finalResults = allResults.map(result => {
            let score = 0;
            
            // PRIORITÀ 1: Match Pokemon (BASE)
            const cardName = (result.name_en || result.pokemon_name || '').toLowerCase();
            const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
            
            if (cardName.includes(pokemonNameLower)) {
                score += 10000; // Base score per match Pokemon
                console.log(`🎯 [CardTrader] MATCH POKEMON: "${pokemonNameLower}" in "${cardName}" -> +10000 punti`);
            }
            
            // PRIORITÀ 2: Match Numero Collezione (ALTA PRIORITÀ)
            if (titleInfo.collectorNumber && result.collector_number) {
                const titleNumber = titleInfo.collectorNumber.toString();
                const cardNumber = result.collector_number.toString();
                
                if (titleNumber === cardNumber) {
                    score += 50000; // PRIORITÀ MASSIMA per numero esatto
                    console.log(`🎯 [CardTrader] NUMERO COLLEZIONE ESATTO: ${titleNumber} = ${cardNumber} -> +50000 punti`);
                }
            }
            
            // PRIORITÀ 3: Match Espansione (solo se abbiamo già un match Pokemon)
            if (score >= 10000 && titleInfo.expansion && result.expansion_name_en) {
                const titleExpansion = titleInfo.expansion.toLowerCase();
                const cardExpansion = result.expansion_name_en.toLowerCase();
                
                if (cardExpansion.includes(titleExpansion) || titleExpansion.includes(cardExpansion)) {
                    score += 20000; // Bonus per espansione specifica
                    console.log(`🎯 [CardTrader] ESPANSIONE SPECIFICA: "${titleExpansion}" in "${cardExpansion}" -> +20000 punti`);
                }
            }
            
            // PRIORITÀ 4: MATCHING PAROLA PER PAROLA CON IMAGE_URL
            if (result.image_url && titleWords.length > 0) {
                const imageUrlScore = calculateImageUrlWordMatch(result.image_url, titleWords);
                score += imageUrlScore;
                if (imageUrlScore > 0) {
                    console.log(`🎯 [CardTrader] MATCH IMAGE_URL: ${imageUrlScore} punti per "${result.image_url}"`);
                }
            }
            
            return { result, score };
        });
        
        // Riordina per punteggio
        finalResults.sort((a, b) => b.score - a.score);
        
        // Debug: mostra tutti i risultati con punteggi
        console.log('📊 [CardTrader] Tutti i risultati ordinati per punteggio:');
        finalResults.forEach((item, index) => {
            console.log(`${index + 1}. ${item.result.name_en || item.result.pokemon_name} - Punteggio: ${item.score} - Blueprint: ${item.result.blueprint_id}`);
        });
        
        // Ritorna i migliori risultati
        const goodResults = finalResults.filter(item => item.score > 0);
        
        if (goodResults.length > 0) {
            console.log(`✅ [CardTrader] Trovati ${goodResults.length} risultati con punteggio > 0`);
            return goodResults.map(item => item.result).slice(0, 5);
        }
        
        // Se nessun match, mostra tutti i risultati
        console.log(`⚠️ [CardTrader] Nessun match trovato, mostrando tutti i risultati`);
        return allResults.slice(0, 5);
            
    } catch (error) {
        console.error('❌ [CardTrader] Errore nella ricerca database:', error);
        return [];
    }
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

// Funzione per generare link CardTrader
function generateCardTraderLink(blueprintId) {
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

// Retry del patch per pagine che si caricano dopo
setTimeout(() => {
    console.log('🔄 [CardTrader] Retry patch pagina prodotto...');
    patchEbayProductPage();
    patchVintedProductPage();
}, 3000);

setTimeout(() => {
    console.log('🔄 [CardTrader] Secondo retry patch pagina prodotto...');
    patchEbayProductPage();
    patchVintedProductPage();
}, 5000);

// Inizializza l'estensione
initializeExtension();