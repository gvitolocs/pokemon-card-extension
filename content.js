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
                let title = element.textContent.trim();
                // Rimuovi eventuali pulsanti CT dal titolo
                title = title.replace(/\bCT\b/g, '').trim();
                return title;
            }
        }
        
        // Fallback: usa il testo dell'elemento stesso
        if (listingElement.textContent && listingElement.textContent.trim()) {
            let title = listingElement.textContent.trim();
            // Rimuovi eventuali pulsanti CT dal titolo
            title = title.replace(/\bCT\b/g, '').trim();
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
                // Rimuovi eventuali pulsanti CT dal titolo
                title = title.replace(/\bCT\b/g, '').trim();
                return title;
            }
        }
        
        // Fallback: usa il testo dell'elemento stesso
        if (listingElement.textContent && listingElement.textContent.trim()) {
            let title = listingElement.textContent.trim();
            // Rimuovi eventuali pulsanti CT dal titolo
            title = title.replace(/\bCT\b/g, '').trim();
            return title;
        }
    }
    
    return null;
}

// Aggiungi i link CardTrader
function addCardTraderLinks(listingElement, results, titleInfo) {
    try {
        // Rimuovi pulsanti esistenti
        const existingButtons = listingElement.querySelectorAll('.pokemon-linker-button');
        existingButtons.forEach(button => button.remove());
        
        // Prendi il miglior risultato (il primo)
        const bestResult = results[0];
        if (!bestResult) return;
        
        // Crea il pulsante semplice con "CT"
        const button = document.createElement('button');
        button.className = 'pokemon-linker-button';
        button.innerHTML = 'CT';
        button.style.cssText = `
            margin-top: 8px;
            margin-left: 8px;
            padding: 4px 8px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 3px;
            font-size: 11px;
            cursor: pointer;
            font-weight: bold;
            min-width: 30px;
            display: inline-block;
        `;
        
        // Apri direttamente il link CardTrader quando si clicca
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cardTraderUrl = generateCardTraderLink(bestResult.blueprint_id);
            window.open(cardTraderUrl, '_blank');
        });
        
        // Effetti hover
        button.addEventListener('mouseenter', () => {
            button.style.background = '#0056b3';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = '#007bff';
        });
        
        // Inserisci il pulsante
        insertLinkContainer(listingElement, button);
        
        console.log(`✅ [CardTrader] Aggiunto pulsante CT per ${bestResult.name_en || bestResult.pokemon_name}`);
        
    } catch (error) {
        console.error('❌ [CardTrader] Errore nell\'aggiunta pulsante:', error);
    }
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
                // Verifica che il pulsante non sia già presente
                if (!element.parentNode.querySelector('.pokemon-linker-button')) {
                    element.parentNode.insertBefore(button, element.nextSibling);
                    return;
                }
            }
        }
        
        // Fallback: inserisci alla fine dell'elemento se non è già presente
        if (!listingElement.querySelector('.pokemon-linker-button')) {
            listingElement.appendChild(button);
        }
        
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
                // Verifica che il pulsante non sia già presente
                if (!element.parentNode.querySelector('.pokemon-linker-button')) {
                    element.parentNode.insertBefore(button, element.nextSibling);
                    return;
                }
            }
        }
        
        // Fallback: inserisci alla fine dell'elemento se non è già presente
        if (!listingElement.querySelector('.pokemon-linker-button')) {
            listingElement.appendChild(button);
        }
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
        
        // Cerca nel database
        searchCardInDatabase(titleInfo, title).then(results => {
            if (results && results.length > 0) {
                // Usa il pulsante CT come nelle liste
                addCardTraderLinks(titleElement.parentNode, results, titleInfo);
                
                console.log(`✅ [CardTrader] Aggiunto pulsante CT alla pagina prodotto eBay`);
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
    
    // Prima cerca match esatti
    for (const pokemon of pokemonNames) {
        if (titleLower.includes(pokemon.toLowerCase())) {
            if (!pokemonName) {
                pokemonName = pokemon;
                console.log(`🎯 [CardTrader] Match esatto trovato: "${pokemon}" in "${title}"`);
            } else if (!secondPokemonName) {
                secondPokemonName = pokemon;
                console.log(`🎯 [CardTrader] Secondo Pokemon trovato: "${pokemon}" in "${title}"`);
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
    
    // Lista completa di Trainer (tutti i trainer principali)
    const trainerNames = [
        // Gym Leaders Kanto
        'brock', 'misty', 'lt. surge', 'erika', 'koga', 'sabrina', 'blaine', 'giovanni',
        
        // Elite Four Kanto
        'lorelei', 'bruno', 'agatha', 'lance',
        
        // Protagonisti e rivali
        'red', 'blue', 'green', 'leaf', 'yellow', 'crystal', 'ethan', 'lyra', 'kris',
        'brendan', 'may', 'ruby', 'sapphire', 'emerald', 'lucas', 'dawn', 'diamond', 'pearl', 'platinum',
        'hilbert', 'hilda', 'nate', 'rosa', 'black', 'white', 'black 2', 'white 2',
        'calem', 'serena', 'x', 'y', 'elio', 'selene', 'sun', 'moon', 'ultra sun', 'ultra moon',
        'victor', 'gloria', 'sword', 'shield', 'florian', 'juliana', 'scarlet', 'violet',
        
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
        'hilbert', 'hilda', 'nate', 'rosa', 'black', 'white', 'black 2', 'white 2',
        'calem', 'serena', 'x', 'y', 'elio', 'selene', 'sun', 'moon', 'ultra sun', 'ultra moon',
        'victor', 'gloria', 'sword', 'shield', 'florian', 'juliana', 'scarlet', 'violet'
    ];
    
    let trainerName = null;
    for (const trainer of trainerNames) {
        if (titleLower.includes(trainer.toLowerCase())) {
            trainerName = trainer;
            break;
        }
    }
    
    // Cerca tipi di carta specifici (GX, V, VMAX, VSTAR, EX, ecc.)
    const cardTypes = [
        'gx', 'v', 'vmax', 'vstar', 'ex', 'break', 'prime', 'legend', 'star', 'shining',
        'gold star', 'crystal', 'delta', 'shining', 'secret rare', 'ultra rare', 'rare holo',
        'rare', 'uncommon', 'common', 'promo', 'black star', 'prerelease', 'staff'
    ];
    
    let cardType = null;
    for (const type of cardTypes) {
        if (titleLower.includes(type.toLowerCase())) {
            cardType = type;
            break;
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
        'gym heroes', 'gym challenge', 'gym leaders', 'gym booster 1 leaders stadium', 'gym booster 1', 'leaders stadium',
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
    
    // Logica speciale per espansioni correlate
    if (titleLower.includes('gym heroes') && !expansion) {
        // Se trova "gym heroes" ma non ha trovato un'espansione specifica, cerca espansioni correlate
        if (titleLower.includes('gym') && titleLower.includes('heroes')) {
            expansion = 'gym heroes';
            console.log(`🎯 [CardTrader] Espansione correlata trovata: Gym Heroes`);
        }
    }
    
    // Verifica se è una carta V
    const isVCard = /\bv\b/i.test(title);
    if (isVCard) {
        console.log(`🎯 [CardTrader] Carta V rilevata nel titolo`);
    }
    
    // Verifica se è una carta GX
    const isGXCard = /\bgx\b/i.test(title);
    if (isGXCard) {
        console.log(`🎯 [CardTrader] Carta GX rilevata nel titolo`);
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
        
        console.log('🔍 [CardTrader] Cercando con criteri:', JSON.stringify(titleInfo, null, 2));
        
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
        } else {
            // Ricerca fuzzy per altri Pokemon
            const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
            query = query.or(`name_en.ilike.%${pokemonNameLower}%,name_en.ilike.%${pokemonNameLower}%`);
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
                    .not('image_url', 'is', null);
                
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
            } else if (titleInfo.pokemonName === 'eevee') {
                // Gestione speciale per Eevee e variazioni
                pokemonQuery = pokemonQuery.or('name_en.ilike.%eevee%,name_en.ilike.%evee%')
                            .not('name_en', 'ilike', '%vaporeon%')
                            .not('name_en', 'ilike', '%jolteon%')
                            .not('name_en', 'ilike', '%flareon%')
                            .not('name_en', 'ilike', '%espeon%')
                            .not('name_en', 'ilike', '%umbreon%')
                            .not('name_en', 'ilike', '%leafeon%')
                            .not('name_en', 'ilike', '%glaceon%')
                            .not('name_en', 'ilike', '%sylveon%');
            } else if (titleInfo.isGXCard) {
                // Per carte GX, cerca carte che contengono il Pokemon e GX
                const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
                pokemonQuery = pokemonQuery.ilike('name_en', `%${pokemonNameLower}%`)
                            .ilike('name_en', '%gx%');
                
                // Se c'è un secondo Pokemon, cerca carte che contengono entrambi
                if (titleInfo.secondPokemonName) {
                    const secondPokemonLower = titleInfo.secondPokemonName.toLowerCase();
                    pokemonQuery = pokemonQuery.ilike('name_en', `%${secondPokemonLower}%`);
                }
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
                                    source: 'card_variants_number',
                                    exact_number_match: true
                                };
                                allResults.push(combinedResult);
                            }
                        });
                    }
                }
            }
        }
        
        // 2.5. Ricerca SEMPLIFICATA per Pokemon + numero collezionista
        if (titleInfo.pokemonName && titleInfo.collectorNumber) {
            console.log(`🔍 [CardTrader] Ricerca SEMPLIFICATA: ${titleInfo.pokemonName} ${titleInfo.collectorNumber}`);
            
            // Cerca direttamente le carte che contengono Pokemon + numero
            let simpleQuery = supabaseClient
                .from('cards')
                .select('blueprint_id, name_en, expansion_name_en, expansion_code');
            
            // Filtro per Pokemon principale
            const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
            simpleQuery = simpleQuery.ilike('name_en', `%${pokemonNameLower}%`);
            
            // Se c'è un secondo Pokemon, aggiungi il filtro
            if (titleInfo.secondPokemonName) {
                const secondPokemonLower = titleInfo.secondPokemonName.toLowerCase();
                simpleQuery = simpleQuery.ilike('name_en', `%${secondPokemonLower}%`);
            }
            
            // Se è una carta GX, aggiungi il filtro
            if (titleInfo.isGXCard) {
                simpleQuery = simpleQuery.ilike('name_en', '%gx%');
            }
            
            const { data: matchingCards, error: matchingCardsError } = await simpleQuery;
            
            if (!matchingCardsError && matchingCards && matchingCards.length > 0) {
                console.log(`✅ [CardTrader] Trovate ${matchingCards.length} carte che corrispondono ai criteri`);
                
                // Cerca le varianti con il numero specifico
                const blueprintIds = matchingCards.map(card => card.blueprint_id).filter(id => id);
                
                if (blueprintIds.length > 0) {
                    const { data: variantsWithNumber, error: variantsError } = await supabaseClient
                        .from('card_variants')
                        .select('*')
                        .in('blueprint_id', blueprintIds)
                        .eq('collector_number', titleInfo.collectorNumber);
                    
                    if (!variantsError && variantsWithNumber && variantsWithNumber.length > 0) {
                        console.log(`🎯 [CardTrader] Trovate ${variantsWithNumber.length} varianti con numero ${titleInfo.collectorNumber}`);
                        
                        variantsWithNumber.forEach(variant => {
                            const card = matchingCards.find(c => c.blueprint_id === variant.blueprint_id);
                            if (card) {
                                const combinedResult = {
                                    ...variant,
                                    name_en: card.name_en,
                                    pokemon_name: card.name_en,
                                    expansion_name_en: card.expansion_name_en,
                                    expansion_code: card.expansion_code,
                                    source: 'simple_pokemon_number_search',
                                    exact_number_match: true,
                                    priority: 'high'
                                };
                                allResults.push(combinedResult);
                                console.log(`🎯 [CardTrader] Match SEMPLIFICATO: ${card.name_en} con numero ${titleInfo.collectorNumber}`);
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
            } else if (titleInfo.pokemonName === 'eevee') {
                // Gestione speciale per Eevee e variazioni
                expansionQuery = expansionQuery.or('name_en.ilike.%eevee%,name_en.ilike.%evee%')
                            .not('name_en', 'ilike', '%vaporeon%')
                            .not('name_en', 'ilike', '%jolteon%')
                            .not('name_en', 'ilike', '%flareon%')
                            .not('name_en', 'ilike', '%espeon%')
                            .not('name_en', 'ilike', '%umbreon%')
                            .not('name_en', 'ilike', '%leafeon%')
                            .not('name_en', 'ilike', '%glaceon%')
                            .not('name_en', 'ilike', '%sylveon%');
            } else if (titleInfo.isGXCard) {
                // Per carte GX, cerca carte che contengono il Pokemon e GX
                const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
                expansionQuery = expansionQuery.ilike('name_en', `%${pokemonNameLower}%`)
                            .ilike('name_en', '%gx%');
                
                // Se c'è un secondo Pokemon, cerca carte che contengono entrambi
                if (titleInfo.secondPokemonName) {
                    const secondPokemonLower = titleInfo.secondPokemonName.toLowerCase();
                    expansionQuery = expansionQuery.ilike('name_en', `%${secondPokemonLower}%`);
                }
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
        
        // 4. Sistema di punteggi SOPHISTICATO (come nel test file)
        console.log(`🔍 [CardTrader] Applicando sistema di punteggi sofisticato`);
        
        const scoredResults = allResults.map(result => {
            // Gestisci i nomi delle colonne per entrambe le tabelle
            const name = result.source === 'cards' 
                ? (result.name_en || result.name || '').toLowerCase()
                : (result.pokemon_name || result.name || '').toLowerCase();
            const expansion = (result.expansion_name_en || result.expansion_name || result.expansion_code || '').toLowerCase();
            const collectorNumber = result.collector_number ? result.collector_number.toString() : '';
            
            // Estrai la rarità dall'URL dell'immagine se disponibile
            const imageRarity = extractRarityFromImageUrl(result.image_url);
            
            let score = 0;
            let reason = '';
            
            // PRIORITÀ 1: Espansione (fattore più importante)
            let expansionScore = 0;
            let expansionReason = '';
            if (titleInfo.expansion && expansion) {
                const similarity = calculateSimilarity(titleInfo.expansion, expansion);
                console.log(`🔍 [CardTrader] Controllando espansione: "${titleInfo.expansion}" vs "${expansion}" (similarità: ${Math.round(similarity * 100)}%)`);
                
                if (similarity >= 0.8) {
                    expansionScore = 100;
                    expansionReason = `Espansione corretta (${Math.round(similarity * 100)}%) `;
                    if (similarity >= 0.95) {
                        expansionScore += 50;
                        expansionReason += 'Espansione quasi esatta ';
                    } else if (similarity >= 0.9) {
                        expansionScore += 25;
                        expansionReason += 'Espansione molto simile ';
                    }
                } else if (expansion.includes(titleInfo.expansion) || titleInfo.expansion.includes(expansion)) {
                    expansionScore = 60;
                    expansionReason = 'Espansione parziale ';
                } else if (titleInfo.expansion === 'gym heroes' && expansion.includes('gym booster')) {
                    // Bonus speciale per Gym Heroes che corrisponde a Gym Booster
                    expansionScore = 80;
                    expansionReason = 'Gym Heroes corrisponde a Gym Booster ';
                    console.log(`🎯 [CardTrader] Match speciale Gym Heroes -> Gym Booster: +80 punti`);
                } else {
                    if (similarity < 0.3) {
                        expansionScore = -200;
                        expansionReason = `Espansione completamente diversa (${Math.round(similarity * 100)}%) `;
                    } else if (similarity < 0.5) {
                        expansionScore = -100;
                        expansionReason = `Espansione molto diversa (${Math.round(similarity * 100)}%) `;
                    } else if (similarity < 0.7) {
                        expansionScore = -50;
                        expansionReason = `Espansione diversa (${Math.round(similarity * 100)}%) `;
                    }
                }
            } else if (titleInfo.expansion) {
                expansionScore = -20;
                expansionReason = 'Espansione mancante nel database ';
            }
            score += expansionScore;
            reason += expansionReason;
            
            // PRIORITÀ 1.5: Trainer Name (gestito nella validazione obbligatoria)
            if (titleInfo.trainerName) {
                console.log(`🔍 [CardTrader] Trainer rilevato: "${titleInfo.trainerName}" - sarà validato nell'URL`);
            }
            
            // PRIORITÀ 2: Nome del Pokemon (peso massimo)
            const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
            const resultNameLower = name.toLowerCase();
            
            if (resultNameLower.includes(pokemonNameLower) || pokemonNameLower.includes(resultNameLower)) {
                score += 1000; // Peso massimo per il nome Pokemon
                reason += 'Nome Pokemon PERFETTO ';
            } else {
                score -= 2000; // Penalità severa se il nome non corrisponde
                reason += 'Nome Pokemon SBAGLIATO ';
            }
            
            // PRIORITÀ 3: Numero collezionista (PRIORITÀ MASSIMA se presente nel titolo)
            if (titleInfo.collectorNumber) {
                if (collectorNumber === titleInfo.collectorNumber) {
                    score += 2000; // Peso MASSIMO per numero perfetto
                    reason += 'Numero collezionista PERFETTO ';
                } else if (collectorNumber.includes(titleInfo.collectorNumber)) {
                    score += 200; // Peso medio per numero parziale
                    reason += 'Numero collezionista parziale ';
                } else {
                    score -= 1000; // Penalità severa se il numero non corrisponde
                    reason += 'Numero collezionista SBAGLIATO ';
                }
            } else {
                // Se non c'è numero nel titolo, punteggio 0 per numero (neutro)
                reason += 'Numero collezionista non richiesto ';
            }
            
            // PRIORITÀ 4: Match PROMO nell'URL (ALTA PRIORITÀ quando il titolo contiene "promo")
            if ((originalTitle.toLowerCase().includes('promo') || titleInfo.rarity === 'promo') && result.image_url) {
                const imageUrlLower = result.image_url.toLowerCase();
                if (imageUrlLower.includes('promo')) {
                    score += 800; // Bonus molto alto per match promo
                    reason += 'PROMO nell\'URL CORRETTO ';
                    console.log(`🎯 [CardTrader] MATCH PROMO: "${result.image_url}" -> +800 punti`);
                } else {
                    score -= 300; // Penalità se il titolo dice promo ma l'URL no
                    reason += 'PROMO richiesto ma non nell\'URL ';
                    console.log(`❌ [CardTrader] PROMO richiesto ma non trovato in: "${result.image_url}" -> -300 punti`);
                }
            }
            
            // PRIORITÀ 4.5: Match TG/SL nell'URL (ALTA PRIORITÀ quando il titolo contiene TG o SL)
            if (titleInfo.specialPattern && result.image_url) {
                const imageUrlLower = result.image_url.toLowerCase();
                const pattern = titleInfo.specialPattern.toLowerCase();
                
                if (imageUrlLower.includes(pattern)) {
                    score += 600; // Bonus alto per match TG/SL
                    reason += `${pattern.toUpperCase()} nell\'URL CORRETTO `;
                    console.log(`🎯 [CardTrader] MATCH ${pattern.toUpperCase()}: "${result.image_url}" -> +600 punti`);
                } else {
                    score -= 200; // Penalità se il titolo dice TG/SL ma l'URL no
                    reason += `${pattern.toUpperCase()} richiesto ma non nell\'URL `;
                    console.log(`❌ [CardTrader] ${pattern.toUpperCase()} richiesto ma non trovato in: "${result.image_url}" -> -200 punti`);
                }
            }
            
            // PRIORITÀ 4.6: Match V nell'URL (ALTA PRIORITÀ quando il titolo contiene V)
            if (titleInfo.isVCard && result.image_url) {
                const imageUrlLower = result.image_url.toLowerCase();
                
                if (imageUrlLower.includes('v')) {
                    score += 400; // Bonus alto per match V
                    reason += 'V nell\'URL CORRETTO ';
                    console.log(`🎯 [CardTrader] MATCH V: "${result.image_url}" -> +400 punti`);
                } else {
                    score -= 300; // Penalità severa se il titolo dice V ma l'URL no
                    reason += 'V richiesto ma non nell\'URL ';
                    console.log(`❌ [CardTrader] V richiesto ma non trovato in: "${result.image_url}" -> -300 punti`);
                }
            }
            
            // PRIORITÀ 4.7: Match GX nell'URL (ALTA PRIORITÀ quando il titolo contiene GX)
            if (titleInfo.isGXCard && result.image_url) {
                const imageUrlLower = result.image_url.toLowerCase();
                
                if (imageUrlLower.includes('gx')) {
                    score += 500; // Bonus molto alto per match GX
                    reason += 'GX nell\'URL CORRETTO ';
                    console.log(`🎯 [CardTrader] MATCH GX: "${result.image_url}" -> +500 punti`);
                } else {
                    score -= 400; // Penalità severa se il titolo dice GX ma l'URL no
                    reason += 'GX richiesto ma non nell\'URL ';
                    console.log(`❌ [CardTrader] GX richiesto ma non trovato in: "${result.image_url}" -> -400 punti`);
                }
            }
            
            // PRIORITÀ 4.8: Match numero collezionista nell'URL (PRIORITÀ MASSIMA quando presente nel titolo)
            if (titleInfo.collectorNumber && result.image_url) {
                const imageUrlLower = result.image_url.toLowerCase();
                const collectorNumberStr = titleInfo.collectorNumber.toString();
                
                // Gestisci pattern speciali come SV, XY, TG, SL
                let numberFound = false;
                let matchType = '';
                
                if (collectorNumberStr.startsWith('sv')) {
                    // Per pattern SV, cerca sia "sv67" che solo "67"
                    const svNumber = collectorNumberStr.substring(2);
                    if (imageUrlLower.includes(collectorNumberStr) || imageUrlLower.includes(svNumber)) {
                        numberFound = true;
                        matchType = imageUrlLower.includes(collectorNumberStr) ? 'SV completo' : 'Solo numero';
                    }
                } else if (collectorNumberStr.startsWith('xy')) {
                    // Per pattern XY, cerca sia "xy156" che solo "156"
                    const xyNumber = collectorNumberStr.substring(2);
                    if (imageUrlLower.includes(collectorNumberStr) || imageUrlLower.includes(xyNumber)) {
                        numberFound = true;
                        matchType = imageUrlLower.includes(collectorNumberStr) ? 'XY completo' : 'Solo numero';
                    }
                } else if (collectorNumberStr.startsWith('dp')) {
                    // Per pattern DP, cerca sia "dp156" che solo "156"
                    const dpNumber = collectorNumberStr.substring(2);
                    if (imageUrlLower.includes(collectorNumberStr) || imageUrlLower.includes(dpNumber)) {
                        numberFound = true;
                        matchType = imageUrlLower.includes(collectorNumberStr) ? 'DP completo' : 'Solo numero';
                    }
                } else if (collectorNumberStr.startsWith('bw')) {
                    // Per pattern BW, cerca sia "bw156" che solo "156"
                    const bwNumber = collectorNumberStr.substring(2);
                    if (imageUrlLower.includes(collectorNumberStr) || imageUrlLower.includes(bwNumber)) {
                        numberFound = true;
                        matchType = imageUrlLower.includes(collectorNumberStr) ? 'BW completo' : 'Solo numero';
                    }
                } else if (collectorNumberStr.startsWith('sm')) {
                    // Per pattern SM, cerca sia "sm156" che solo "156"
                    const smNumber = collectorNumberStr.substring(2);
                    if (imageUrlLower.includes(collectorNumberStr) || imageUrlLower.includes(smNumber)) {
                        numberFound = true;
                        matchType = imageUrlLower.includes(collectorNumberStr) ? 'SM completo' : 'Solo numero';
                    }
                } else if (collectorNumberStr.startsWith('ss')) {
                    // Per pattern SS, cerca sia "ss156" che solo "156"
                    const ssNumber = collectorNumberStr.substring(2);
                    if (imageUrlLower.includes(collectorNumberStr) || imageUrlLower.includes(ssNumber)) {
                        numberFound = true;
                        matchType = imageUrlLower.includes(collectorNumberStr) ? 'SS completo' : 'Solo numero';
                    }
                } else if (collectorNumberStr.startsWith('pr')) {
                    // Per pattern PR, cerca sia "pr156" che solo "156"
                    const prNumber = collectorNumberStr.substring(2);
                    if (imageUrlLower.includes(collectorNumberStr) || imageUrlLower.includes(prNumber)) {
                        numberFound = true;
                        matchType = imageUrlLower.includes(collectorNumberStr) ? 'PR completo' : 'Solo numero';
                    }
                } else if (collectorNumberStr.startsWith('bs')) {
                    // Per pattern BS, cerca sia "bs156" che solo "156"
                    const bsNumber = collectorNumberStr.substring(2);
                    if (imageUrlLower.includes(collectorNumberStr) || imageUrlLower.includes(bsNumber)) {
                        numberFound = true;
                        matchType = imageUrlLower.includes(collectorNumberStr) ? 'BS completo' : 'Solo numero';
                    }
                } else if (collectorNumberStr.startsWith('h')) {
                    // Per pattern H, cerca sia "h156" che solo "156"
                    const hNumber = collectorNumberStr.substring(1);
                    if (imageUrlLower.includes(collectorNumberStr) || imageUrlLower.includes(hNumber)) {
                        numberFound = true;
                        matchType = imageUrlLower.includes(collectorNumberStr) ? 'H completo' : 'Solo numero';
                    }
                } else if (collectorNumberStr.startsWith('tg') || collectorNumberStr.startsWith('sl')) {
                    // Per pattern TG/SL, cerca sia "tg16" che solo "16"
                    const tgSlNumber = collectorNumberStr.substring(2);
                    if (imageUrlLower.includes(collectorNumberStr) || imageUrlLower.includes(tgSlNumber)) {
                        numberFound = true;
                        matchType = imageUrlLower.includes(collectorNumberStr) ? 'TG/SL completo' : 'Solo numero';
                    }
                } else {
                    // Per numeri normali, cerca il numero esatto
                    if (imageUrlLower.includes(collectorNumberStr)) {
                        numberFound = true;
                        matchType = 'Numero esatto';
                    }
                }
                
                if (numberFound) {
                    score += 1000; // Bonus MASSIMO per match numero esatto
                    reason += `Numero ${collectorNumberStr} nell\'URL CORRETTO (${matchType}) `;
                    console.log(`🎯 [CardTrader] MATCH NUMERO ${collectorNumberStr}: "${result.image_url}" -> +1000 punti (${matchType})`);
                    
                    // Bonus extra se il numero è isolato (non parte di altri numeri)
                    const numberPattern = new RegExp(`\\b${collectorNumberStr.replace(/^(sv|xy|dp|bw|sm|ss|pr|bs|h|tg|sl)/, '')}\\b`);
                    if (numberPattern.test(imageUrlLower)) {
                        score += 200; // Bonus per numero isolato
                        reason += `Numero ${collectorNumberStr} isolato nell\'URL `;
                        console.log(`🎯 [CardTrader] NUMERO ISOLATO: +200 punti`);
                    }
                } else {
                    score -= 800; // Penalità MASSIMA se il numero non è nell'URL
                    reason += `Numero ${collectorNumberStr} richiesto ma non nell\'URL `;
                    console.log(`❌ [CardTrader] Numero ${collectorNumberStr} richiesto ma non trovato in: "${result.image_url}" -> -800 punti`);
                }
            }
            
            // PRIORITÀ 4.9: Validazione completa per risolvere ambiguità
            if (result.image_url) {
                const imageUrlLower = result.image_url.toLowerCase();
                let validationScore = 0;
                let validationReason = '';
                
                // Verifica che tutti i Pokemon richiesti siano nell'URL
                if (titleInfo.pokemonName) {
                    const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
                    if (imageUrlLower.includes(pokemonNameLower)) {
                        validationScore += 100;
                        validationReason += `Pokemon ${titleInfo.pokemonName} nell\'URL `;
                    } else {
                        validationScore -= 200;
                        validationReason += `Pokemon ${titleInfo.pokemonName} mancante nell\'URL `;
                    }
                }
                
                if (titleInfo.secondPokemonName) {
                    const secondPokemonLower = titleInfo.secondPokemonName.toLowerCase();
                    if (imageUrlLower.includes(secondPokemonLower)) {
                        validationScore += 100;
                        validationReason += `Secondo Pokemon ${titleInfo.secondPokemonName} nell\'URL `;
                    } else {
                        validationScore -= 200;
                        validationReason += `Secondo Pokemon ${titleInfo.secondPokemonName} mancante nell\'URL `;
                    }
                }
                
                // Verifica tipo di carta
                if (titleInfo.isGXCard && !imageUrlLower.includes('gx')) {
                    validationScore -= 300;
                    validationReason += 'GX mancante nell\'URL ';
                }
                
                if (titleInfo.isVCard && !imageUrlLower.includes('v')) {
                    validationScore -= 300;
                    validationReason += 'V mancante nell\'URL ';
                }
                
                // Verifica obbligatoria per Masterball e Pokeball
                const titleLower = originalTitle.toLowerCase();
                if (titleLower.includes('masterball') && !imageUrlLower.includes('masterball')) {
                    validationScore -= 500; // Penalità MASSIMA per Masterball mancante
                    validationReason += 'Masterball richiesto ma mancante nell\'URL ';
                    console.log(`❌ [CardTrader] Masterball richiesto ma non trovato in: "${result.image_url}" -> -500 punti`);
                }
                
                if (titleLower.includes('pokeball') && !imageUrlLower.includes('pokeball')) {
                    validationScore -= 500; // Penalità MASSIMA per Pokeball mancante
                    validationReason += 'Pokeball richiesto ma mancante nell\'URL ';
                    console.log(`❌ [CardTrader] Pokeball richiesto ma non trovato in: "${result.image_url}" -> -500 punti`);
                }
                
                if (titleLower.includes('shiny') && !imageUrlLower.includes('shiny')) {
                    validationScore -= 500; // Penalità MASSIMA per Shiny mancante
                    validationReason += 'Shiny richiesto ma mancante nell\'URL ';
                    console.log(`❌ [CardTrader] Shiny richiesto ma non trovato in: "${result.image_url}" -> -500 punti`);
                }
                
                if (titleLower.includes('holo') && !imageUrlLower.includes('holo')) {
                    validationScore -= 500; // Penalità MASSIMA per Holo mancante
                    validationReason += 'Holo richiesto ma mancante nell\'URL ';
                    console.log(`❌ [CardTrader] Holo richiesto ma non trovato in: "${result.image_url}" -> -500 punti`);
                }
                
                // Bonus se Masterball/Pokeball/Shiny sono presenti nell'URL quando richiesti
                if (titleLower.includes('masterball') && imageUrlLower.includes('masterball')) {
                    validationScore += 300; // Bonus alto per Masterball presente
                    validationReason += 'Masterball nell\'URL CORRETTO ';
                    console.log(`🎯 [CardTrader] Masterball trovato in: "${result.image_url}" -> +300 punti`);
                }
                
                if (titleLower.includes('pokeball') && imageUrlLower.includes('pokeball')) {
                    validationScore += 300; // Bonus alto per Pokeball presente
                    validationReason += 'Pokeball nell\'URL CORRETTO ';
                    console.log(`🎯 [CardTrader] Pokeball trovato in: "${result.image_url}" -> +300 punti`);
                }
                
                if (titleLower.includes('shiny') && imageUrlLower.includes('shiny')) {
                    validationScore += 300; // Bonus alto per Shiny presente
                    validationReason += 'Shiny nell\'URL CORRETTO ';
                    console.log(`🎯 [CardTrader] Shiny trovato in: "${result.image_url}" -> +300 punti`);
                }
                
                if (titleLower.includes('holo') && imageUrlLower.includes('holo')) {
                    validationScore += 300; // Bonus alto per Holo presente
                    validationReason += 'Holo nell\'URL CORRETTO ';
                    console.log(`🎯 [CardTrader] Holo trovato in: "${result.image_url}" -> +300 punti`);
                }
                
                // Validazione OBBLIGATORIA per Trainer Name
                if (titleInfo.trainerName && !imageUrlLower.includes(titleInfo.trainerName.toLowerCase())) {
                    validationScore -= 800; // Penalità MASSIMA per trainer name mancante
                    validationReason += `Trainer ${titleInfo.trainerName} richiesto ma mancante nell\'URL `;
                    console.log(`❌ [CardTrader] Trainer ${titleInfo.trainerName} richiesto ma non trovato in: "${result.image_url}" -> -800 punti`);
                }
                
                if (titleInfo.trainerName && imageUrlLower.includes(titleInfo.trainerName.toLowerCase())) {
                    validationScore += 500; // Bonus MASSIMO per trainer name presente
                    validationReason += `Trainer ${titleInfo.trainerName} nell\'URL CORRETTO `;
                    console.log(`🎯 [CardTrader] Trainer ${titleInfo.trainerName} trovato in: "${result.image_url}" -> +500 punti`);
                }
                
                score += validationScore;
                reason += validationReason;
                
                if (validationScore > 0) {
                    console.log(`✅ [CardTrader] Validazione URL: +${validationScore} punti - ${validationReason}`);
                } else if (validationScore < 0) {
                    console.log(`❌ [CardTrader] Validazione URL: ${validationScore} punti - ${validationReason}`);
                }
            }
            
            // PRIORITÀ 5: Rarità
            let rarityScore = 0;
            let rarityReason = '';
            
            // Controlla la rarità dal titolo vs rarità dal database
            if (titleInfo.rarity && result.rarity) {
                const raritySimilarity = calculateSimilarity(titleInfo.rarity.toLowerCase(), result.rarity.toLowerCase());
                if (raritySimilarity >= 0.8) {
                    rarityScore += 100; // Peso alto per rarità corretta
                    rarityReason += 'Rarità titolo corretta ';
                } else if (raritySimilarity >= 0.5) {
                    rarityScore += 25; // Peso medio per rarità simile
                    rarityReason += 'Rarità titolo simile ';
                }
            }
            
            // Controlla la rarità dal titolo vs rarità dall'URL dell'immagine
            if (titleInfo.rarity && imageRarity) {
                const imageRaritySimilarity = calculateSimilarity(titleInfo.rarity.toLowerCase(), imageRarity.toLowerCase());
                if (imageRaritySimilarity >= 0.8) {
                    rarityScore += 150; // Peso molto alto per rarità URL corretta
                    rarityReason += 'Rarità URL corretta ';
                } else if (imageRaritySimilarity >= 0.5) {
                    rarityScore += 50; // Peso alto per rarità URL simile
                    rarityReason += 'Rarità URL simile ';
                }
            }
            
            // Controlla la rarità dal database vs rarità dall'URL dell'immagine
            if (result.rarity && imageRarity) {
                const dbImageRaritySimilarity = calculateSimilarity(result.rarity.toLowerCase(), imageRarity.toLowerCase());
                if (dbImageRaritySimilarity >= 0.8) {
                    rarityScore += 50; // Peso medio per coerenza database-URL
                    rarityReason += 'Rarità DB-URL coerente ';
                }
            }
            
            score += rarityScore;
            reason += rarityReason;
            
            // PRIORITÀ 6: Match ex
            if (originalTitle.toLowerCase().includes(' ex ') && name.includes(' ex')) {
                score += 50;
                reason += 'Match ex ';
            }
            
            // Bonus per presenza di dati
            if (result.image_url) score += 5;
            if (result.blueprint_id || result.id) score += 5;
            
            // Bonus extra per match esatto del numero
            if (result.exact_number_match) {
                score += 500; // Bonus extra per match esatto
                reason += 'Match esatto numero ';
                console.log(`🎯 [CardTrader] BONUS MATCH ESATTO: +500 punti`);
            }
            
            // Bonus per priorità alta
            if (result.priority === 'high') {
                score += 300; // Bonus per priorità alta
                reason += 'Priorità alta ';
                console.log(`🎯 [CardTrader] BONUS PRIORITÀ ALTA: +300 punti`);
            }
            
            return { result, score, reason: reason.trim() };
        });
        
        // Deduplica i risultati per blueprint_id + collector_number
        const uniqueMap = new Map();
        scoredResults.forEach(item => {
            const key = (item.result.blueprint_id || item.result.id || '') + '|' + (item.result.collector_number || '');
            if (!uniqueMap.has(key) || uniqueMap.get(key).score < item.score) {
                uniqueMap.set(key, item);
            }
        });
        
        const finalResults = Array.from(uniqueMap.values());
        finalResults.sort((a, b) => b.score - a.score);
        
        // Filtra risultati con punteggi troppo bassi, ma sii più permissivo
        const goodResults = finalResults.filter(item => item.score > -100);
        
        console.log(`✅ [CardTrader] Risultati finali: ${goodResults.length} carte con punteggi validi`);
        
        // Log dei primi 3 risultati per debug
        goodResults.slice(0, 3).forEach((item, index) => {
            console.log(`🏆 [CardTrader] Risultato ${index + 1}: ${item.result.name_en || item.result.pokemon_name} - Punteggio: ${item.score} - Motivo: ${item.reason}`);
        });
        
        return goodResults.map(item => item.result);
        
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