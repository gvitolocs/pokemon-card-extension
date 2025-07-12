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
            padding: 4px 8px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 3px;
            font-size: 11px;
            cursor: pointer;
            font-weight: bold;
            min-width: 30px;
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
                element.parentNode.insertBefore(button, element.nextSibling);
                return;
            }
        }
        
        // Fallback: inserisci alla fine dell'elemento
        listingElement.appendChild(button);
        
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
                element.parentNode.insertBefore(button, element.nextSibling);
                return;
            }
        }
        
        // Fallback: inserisci alla fine dell'elemento
        listingElement.appendChild(button);
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
    
    // Lista completa di Pokemon (tutti i Pokemon principali)
    const pokemonNames = [
        // Generazione 1 (Kanto)
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
        'cubone', 'marowak', 'hitmonlee', 'hitmonchan', 'lickitung', 'koffing', 'weezing',
        'rhyhorn', 'rhydon', 'chansey', 'tangela', 'kangaskhan', 'horsea', 'seadra',
        'goldeen', 'seaking', 'staryu', 'starmie', 'mr. mime', 'scyther', 'jynx',
        'electabuzz', 'magmar', 'pinsir', 'tauros', 'magikarp', 'gyarados',
        'lapras', 'ditto', 'vaporeon', 'jolteon', 'flareon', 'omanyte', 'omastar',
        'kabuto', 'kabutops', 'aerodactyl', 'snorlax', 'articuno', 'zapdos', 'moltres',
        'dratini', 'dragonair', 'dragonite', 'mewtwo', 'mew',
        
        // Generazione 2 (Johto)
        'chikorita', 'bayleef', 'meganium', 'cyndaquil', 'quilava', 'typhlosion',
        'totodile', 'croconaw', 'feraligatr', 'sentret', 'furret', 'hoothoot', 'noctowl',
        'ledyba', 'ledian', 'spinarak', 'ariados', 'crobat', 'chinchou', 'lanturn',
        'pichu', 'cleffa', 'igglybuff', 'togepi', 'togetic', 'natu', 'xatu',
        'mareep', 'flaaffy', 'ampharos', 'bellossom', 'marill', 'azumarill',
        'sudowoodo', 'politoed', 'hoppip', 'skiploom', 'jumpluff', 'aipom',
        'sunkern', 'sunflora', 'yanma', 'wooper', 'quagsire', 'espeon', 'umbreon',
        'murkrow', 'slowking', 'misdreavus', 'unown', 'wobbuffet', 'girafarig',
        'pineco', 'forretress', 'dunsparce', 'gligar', 'steelix', 'snubbull', 'granbull',
        'qwilfish', 'scizor', 'shuckle', 'heracross', 'sneasel', 'teddiursa', 'ursaring',
        'slugma', 'magcargo', 'swinub', 'piloswine', 'corsola', 'remoraid', 'octillery',
        'delibird', 'mantine', 'skarmory', 'houndour', 'houndoom', 'kingdra',
        'phanpy', 'donphan', 'porygon2', 'stantler', 'smeargle', 'tyrogue', 'hitmontop',
        'smoochum', 'elekid', 'magby', 'miltank', 'blissey', 'raikou', 'entei', 'suicune',
        'larvitar', 'pupitar', 'tyranitar', 'lugia', 'ho-oh', 'celebi',
        
        // Generazione 3 (Hoenn)
        'treecko', 'grovyle', 'sceptile', 'torchic', 'combusken', 'blaziken',
        'mudkip', 'marshtomp', 'swampert', 'poochyena', 'mightyena', 'zigzagoon', 'linoone',
        'wurmple', 'silcoon', 'beautifly', 'cascoon', 'dustox', 'lotad', 'lombre', 'ludicolo',
        'seedot', 'nuzleaf', 'shiftry', 'taillow', 'swellow', 'wingull', 'pelipper',
        'ralts', 'kirlia', 'gardevoir', 'surskit', 'masquerain', 'shroomish', 'breloom',
        'slakoth', 'vigoroth', 'slaking', 'nincada', 'ninjask', 'shedinja',
        'whismur', 'loudred', 'exploud', 'makuhita', 'hariyama', 'azurill', 'nosepass',
        'skitty', 'delcatty', 'sableye', 'mawile', 'aron', 'lairon', 'aggron',
        'meditite', 'medicham', 'electrike', 'manectric', 'plusle', 'minun',
        'volbeat', 'illumise', 'roselia', 'gulpin', 'swalot', 'carvanha', 'sharpedo',
        'wailmer', 'wailord', 'numel', 'camerupt', 'torkoal', 'spoink', 'grumpig',
        'spinda', 'trapinch', 'vibrava', 'flygon', 'cacnea', 'cacturne', 'swablu', 'altaria',
        'zangoose', 'seviper', 'lunatone', 'solrock', 'barboach', 'whiscash', 'corphish', 'crawdaunt',
        'baltoy', 'claydol', 'lileep', 'cradily', 'anorith', 'armaldo', 'feebas', 'milotic',
        'castform', 'kecleon', 'shuppet', 'banette', 'duskull', 'dusclops', 'tropius',
        'chimecho', 'absol', 'wynaut', 'snorunt', 'glalie', 'spheal', 'sealeo', 'walrein',
        'clamperl', 'huntail', 'gorebyss', 'relicanth', 'luvdisc', 'bagon', 'shelgon', 'salamence',
        'beldum', 'metang', 'metagross', 'regirock', 'regice', 'registeel', 'latias', 'latios',
        'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys',
        
        // Generazione 4 (Sinnoh)
        'turtwig', 'grotle', 'torterra', 'chimchar', 'monferno', 'infernape',
        'piplup', 'prinplup', 'empoleon', 'starly', 'staravia', 'staraptor',
        'bidoof', 'bibarel', 'kricketot', 'kricketune', 'shinx', 'luxio', 'luxray',
        'budew', 'roserade', 'cranidos', 'rampardos', 'shieldon', 'bastiodon',
        'burmy', 'wormadam', 'mothim', 'combee', 'vespiquen', 'pachirisu',
        'buizel', 'floatzel', 'cherubi', 'cherrim', 'shellos', 'gastrodon',
        'ambipom', 'drifloon', 'drifblim', 'buneary', 'lopunny', 'mismagius', 'honchkrow',
        'glameow', 'purugly', 'chingling', 'stunky', 'skuntank', 'bronzor', 'bronzong',
        'bonsly', 'mime jr.', 'happiny', 'chatot', 'spiritomb', 'gible', 'gabite', 'garchomp',
        'munchlax', 'riolu', 'lucario', 'hippopotas', 'hippowdon', 'skorupi', 'drapion',
        'croagunk', 'toxicroak', 'carnivine', 'finneon', 'lumineon', 'mantyke', 'snover', 'abomasnow',
        'weavile', 'magnezone', 'lickilicky', 'rhyperior', 'tangrowth', 'electivire', 'magmortar',
        'togekiss', 'yanmega', 'leafeon', 'glaceon', 'gliscor', 'mamoswine', 'porygon-z',
        'gallade', 'probopass', 'dusknoir', 'froslass', 'rotom', 'uxie', 'mesprit', 'azelf',
        'dialga', 'palkia', 'heatran', 'regigigas', 'giratina', 'cresselia', 'phione', 'manaphy',
        'darkrai', 'shaymin', 'arceus',
        
        // Generazione 5 (Unova)
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
        'golett', 'golurk', 'pawniard', 'bisharp', 'bouffalant', 'rufflet', 'braviary',
        'vullaby', 'mandibuzz', 'heatmor', 'durant', 'deino', 'zweilous', 'hydreigon',
        'larvesta', 'volcarona', 'cobalion', 'terrakion', 'virizion', 'tornadus', 'thundurus', 'reshiram',
        'zekrom', 'landorus', 'kyurem', 'keldeo', 'meloetta', 'genesect',
        
        // Generazione 6 (Kalos)
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
        
        // Generazione 7 (Alola)
        'rowlet', 'dartrix', 'decidueye', 'litten', 'torracat', 'incineroar',
        'popplio', 'brionne', 'primarina', 'pikipek', 'trumbeak', 'toucannon',
        'yungoos', 'gumshoos', 'grubbin', 'charjabug', 'vikavolt', 'crabrawler', 'crabominable',
        'oricorio', 'cutiefly', 'ribombee', 'rockruff', 'lycanroc', 'wishiwashi',
        'mareanie', 'toxapex', 'mudbray', 'mudsdale', 'dewpider', 'araquanid',
        'fomantis', 'lurantis', 'morelull', 'shiinotic', 'salandit', 'salazzle',
        'stufful', 'bewear', 'bounsweet', 'steenee', 'tsareena', 'comfey', 'oranguru',
        'passimian', 'wimpod', 'golisopod', 'sandygast', 'palossand', 'pyukumuku',
        'type: null', 'silvally', 'minior', 'komala', 'turtonator', 'togedemaru',
        'mimikyu', 'bruxish', 'drampa', 'dhelmise', 'jangmo-o', 'hakamo-o', 'kommo-o',
        'tapu koko', 'tapu lele', 'tapu bulu', 'tapu fini', 'cosmog', 'cosmoem', 'solgaleo', 'lunala',
        'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord',
        'necrozma', 'magearna', 'marshadow', 'poipole', 'naganadel', 'stakataka', 'blacephalon', 'zeraora',
        'meltan', 'melmetal',
        
        // Generazione 8 (Galar)
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
        
        // Generazione 9 (Paldea)
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
    
    // Cerca il Pokemon nel titolo
    let pokemonName = null;
    for (const pokemon of pokemonNames) {
        if (titleLower.includes(pokemon.toLowerCase())) {
            pokemonName = pokemon;
            break;
        }
    }
    
    // Cerca numero collezionista (pattern: numero/numero o XY numero o solo numero)
    let collectorNumber = null;
    
    // Prima cerca il pattern standard numero/numero
    const standardMatch = title.match(/(\d+)\/(\d+)/);
    if (standardMatch) {
        collectorNumber = standardMatch[1];
    } else {
        // Cerca pattern come "XY 156", "xy156", "XY156"
        const xyMatch = title.match(/(?:xy|xy\s+)(\d+)/i);
        if (xyMatch) {
            collectorNumber = `xy${xyMatch[1]}`;
        } else {
            // Cerca solo numeri isolati (ma non anni come 2016)
            const numberMatch = title.match(/\b(?!2016|2015|2014|2013|2012|2011|2010|2009|2008|2007|2006|2005|2004|2003|2002|2001|2000|1999)(\d{1,3})\b/);
            if (numberMatch) {
                collectorNumber = numberMatch[1];
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
        cardType: cardType,
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
            
            // PRIORITÀ 2: Match Tipo Carta (ALTA PRIORITÀ - FILTRO CRITICO)
            if (titleInfo.cardType && cardName) {
                const titleCardType = titleInfo.cardType.toLowerCase();
                const cardNameLower = cardName.toLowerCase();
                
                // Controlla se il tipo di carta nel titolo corrisponde al nome della carta
                if (titleCardType === 'gx' && cardNameLower.includes('gx')) {
                    score += 30000; // Bonus alto per match tipo esatto
                    console.log(`🎯 [CardTrader] TIPO CARTA ESATTO: GX -> +30000 punti`);
                } else if (titleCardType === 'v' && cardNameLower.includes('v') && !cardNameLower.includes('vmax') && !cardNameLower.includes('vstar')) {
                    score += 30000;
                    console.log(`🎯 [CardTrader] TIPO CARTA ESATTO: V -> +30000 punti`);
                } else if (titleCardType === 'vmax' && cardNameLower.includes('vmax')) {
                    score += 30000;
                    console.log(`🎯 [CardTrader] TIPO CARTA ESATTO: VMAX -> +30000 punti`);
                } else if (titleCardType === 'vstar' && cardNameLower.includes('vstar')) {
                    score += 30000;
                    console.log(`🎯 [CardTrader] TIPO CARTA ESATTO: VSTAR -> +30000 punti`);
                } else if (titleCardType === 'ex' && cardNameLower.includes('ex')) {
                    score += 30000;
                    console.log(`🎯 [CardTrader] TIPO CARTA ESATTO: EX -> +30000 punti`);
                } else if (titleCardType && !cardNameLower.includes(titleCardType)) {
                    // PENALIZZA SE IL TIPO NON CORRISPONDE
                    score -= 50000; // Penalità massima per tipo sbagliato
                    console.log(`❌ [CardTrader] TIPO CARTA SBAGLIATO: "${titleCardType}" non in "${cardName}" -> -50000 punti`);
                }
            }
            
            // PRIORITÀ 3: Match Numero Collezione (ALTA PRIORITÀ)
            if (titleInfo.collectorNumber && result.collector_number) {
                const titleNumber = titleInfo.collectorNumber.toString();
                const cardNumber = result.collector_number.toString();
                
                if (titleNumber === cardNumber) {
                    score += 50000; // PRIORITÀ MASSIMA per numero esatto
                    console.log(`🎯 [CardTrader] NUMERO COLLEZIONE ESATTO: ${titleNumber} = ${cardNumber} -> +50000 punti`);
                }
            }
            
            // PRIORITÀ 4: Match Espansione (solo se abbiamo già un match Pokemon)
            if (score >= 10000 && titleInfo.expansion && result.expansion_name_en) {
                const titleExpansion = titleInfo.expansion.toLowerCase();
                const cardExpansion = result.expansion_name_en.toLowerCase();
                
                if (cardExpansion.includes(titleExpansion) || titleExpansion.includes(cardExpansion)) {
                    score += 20000; // Bonus per espansione specifica
                    console.log(`🎯 [CardTrader] ESPANSIONE SPECIFICA: "${titleExpansion}" in "${cardExpansion}" -> +20000 punti`);
                }
            }
            
            // PRIORITÀ 5: MATCHING PAROLA PER PAROLA CON IMAGE_URL
            if (result.image_url && titleWords.length > 0) {
                const imageUrlScore = calculateImageUrlWordMatch(result.image_url, titleWords);
                score += imageUrlScore;
                if (imageUrlScore > 0) {
                    console.log(`🎯 [CardTrader] MATCH IMAGE_URL: ${imageUrlScore} punti per "${result.image_url}"`);
                }
            }
            
            // PRIORITÀ 1.5: Se il titolo contiene '&' o ' and ', il nome della carta deve contenerlo
            const titleHasAnd = originalTitle.includes('&') || originalTitle.toLowerCase().includes(' and ');
            if (titleHasAnd) {
                const cardNameHasAnd = cardName.includes('&') || cardName.toLowerCase().includes(' and ');
                if (!cardNameHasAnd) {
                    score -= 50000;
                    console.log(`❌ [CardTrader] Il titolo contiene '&' o 'and' ma la carta no: penalità -50000 punti`);
                } else {
                    score += 1000;
                    console.log(`🎯 [CardTrader] Match '&' o 'and' sia nel titolo che nel nome carta: +1000 punti`);
                }
            }
            
            // PRIORITÀ 0: Se il titolo contiene un numero collezionista, solo le carte con lo stesso collector_number sono valide
            if (titleInfo.collectorNumber) {
                const titleNumber = titleInfo.collectorNumber.toString().replace(/\s+/g, '').toLowerCase();
                const cardNumber = (result.collector_number || '').replace(/\s+/g, '').toLowerCase();
                if (titleNumber !== cardNumber) {
                    score -= 100000;
                    console.log(`❌ [CardTrader] Collector number richiesto "${titleNumber}" ma la carta ha "${cardNumber}": penalità -100000 punti`);
                } else {
                    score += 50000;
                    console.log(`🎯 [CardTrader] Collector number esatto: ${titleNumber} = ${cardNumber} -> +50000 punti`);
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