// Content script per Pokemon Card Trader Linker
// Si attiva automaticamente su eBay e Vinted

console.log('🃏 Pokemon Card Trader Linker - Estensione attivata');

// Stato dell'estensione
let isEnabled = true;
let isProcessing = false;

// Inizializza l'estensione
async function initializeExtension() {
    try {
        // Carica la configurazione
        await loadConfig();
        
        // Inizializza Supabase
        const supabaseReady = await initializeSupabase();
        
        if (supabaseReady) {
            console.log('✅ Supabase connesso - Cambiando icona a verde');
            // Cambia l'icona dell'estensione a verde per indicare connessione attiva
            chrome.runtime.sendMessage({ 
                action: 'updateIcon', 
                status: 'connected' 
            });
        } else {
            console.warn('⚠️ Supabase non configurato, l\'estensione funzionerà in modalità limitata');
            // Cambia l'icona dell'estensione a rosso per indicare errore
            chrome.runtime.sendMessage({ 
                action: 'updateIcon', 
                status: 'error' 
            });
        }
        
        // Avvia l'osservatore per le nuove inserzioni
        startObserver();
        
        console.log('✅ Estensione inizializzata correttamente');
        
    } catch (error) {
        console.error('❌ Errore nell\'inizializzazione:', error);
    }
}

// Avvia l'osservatore per rilevare nuove inserzioni
function startObserver() {
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
    
    // Osserva tutto il documento
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Processa anche le inserzioni già presenti
    setTimeout(() => {
        processExistingListings();
    }, 2000);
}

// Processa le inserzioni esistenti
function processExistingListings() {
    if (!isEnabled || isProcessing) return;
    
    const listings = findListings();
    console.log(`🔍 Trovate ${listings.length} inserzioni da processare`);
    
    listings.forEach(listing => {
        processListing(listing);
    });
}

// Processa le nuove inserzioni
function processNewListings(container) {
    if (!isEnabled || isProcessing) return;
    
    const listings = findListingsInContainer(container);
    
    listings.forEach(listing => {
        processListing(listing);
    });
}

// Trova tutte le inserzioni nella pagina
function findListings() {
    const selectors = getListingSelectors();
    const listings = [];
    
    selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            if (!element.hasAttribute('data-pokemon-linker-processed')) {
                listings.push(element);
            }
        });
    });
    
    return listings;
}

// Trova inserzioni in un container specifico
function findListingsInContainer(container) {
    const selectors = getListingSelectors();
    const listings = [];
    
    selectors.forEach(selector => {
        const elements = container.querySelectorAll ? container.querySelectorAll(selector) : [];
        elements.forEach(element => {
            if (!element.hasAttribute('data-pokemon-linker-processed')) {
                listings.push(element);
            }
        });
    });
    
    return listings;
}

// Ottiene i selettori CSS per le inserzioni in base al sito
function getListingSelectors() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('ebay')) {
        return [
            '[data-testid="listing-card"]',
            '.s-item',
            '.srp-results .s-item',
            '[data-testid="item-card"]'
        ];
    } else if (hostname.includes('vinted')) {
        return [
            '[data-testid="item-card"]',
            '.feed-grid__item',
            '.web_ui__Text__text',
            '[data-testid="item"]'
        ];
    }
    
    return [];
}

// Processa una singola inserzione
async function processListing(listingElement) {
    if (listingElement.hasAttribute('data-pokemon-linker-processed')) {
        return;
    }
    
            // Marca come processata per evitare duplicati
        listingElement.setAttribute('data-pokemon-linker-processed', 'true');
        
        // Aggiorna statistiche
        updateStats('cardsProcessed', 1);
    
    try {
        // Estrai il titolo
        const title = extractTitleFromListing(listingElement);
        
        if (!title) {
            return;
        }
        
        // Estrai informazioni dal titolo
        const titleInfo = extractTitleInfo(title);
        
        if (!titleInfo.pokemonName) {
            return;
        }
        
        console.log('🔍 Processando inserzione:', titleInfo);
        
        // Cerca nel database
        const results = await searchCardInDatabase(titleInfo, title);
        
        if (results.length > 0) {
            // Aggiungi i link
            addCardTraderLinks(listingElement, results, titleInfo);
            
            // Aggiorna statistiche
            updateStats('linksGenerated', results.length);
        }
        
    } catch (error) {
        console.error('❌ Errore nel processare inserzione:', error);
    }
}

// Estrae il titolo da un elemento inserzione
function extractTitleFromListing(listingElement) {
    const hostname = window.location.hostname;
    
    if (hostname.includes('ebay')) {
        // eBay
        const titleSelectors = [
            '[data-testid="item-title"]',
            '.s-item__title',
            '.s-item__link',
            'h3.s-item__title'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector);
            if (element) {
                return element.textContent.trim();
            }
        }
        
    } else if (hostname.includes('vinted')) {
        // Vinted
        const titleSelectors = [
            '[data-testid="item-title"]',
            '.web_ui__Text__text',
            'h3',
            '.item-title'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector);
            if (element) {
                return element.textContent.trim();
            }
        }
    }
    
    return null;
}

// Aggiunge i link CardTrader all'inserzione
function addCardTraderLinks(listingElement, results, titleInfo) {
    // Rimuovi eventuali link esistenti
    const existingLinks = listingElement.querySelectorAll('.pokemon-card-linker');
    existingLinks.forEach(link => link.remove());
    
    // Crea il container per i link
    const linkContainer = document.createElement('div');
    linkContainer.className = 'pokemon-card-linker';
    
    const bestMatch = results[0];
    const cardTraderLink = generateCardTraderLink(bestMatch.blueprint_id);
    
    // Crea l'header
    const header = document.createElement('div');
    header.className = 'pokemon-card-linker-header';
    
    const title = document.createElement('h4');
    title.className = 'pokemon-card-linker-title';
    title.innerHTML = '🃏 Pokemon Card Trader Linker';
    
    const closeButton = document.createElement('button');
    closeButton.className = 'pokemon-card-linker-close';
    closeButton.innerHTML = '×';
    closeButton.onclick = () => linkContainer.remove();
    
    header.appendChild(title);
    header.appendChild(closeButton);
    
    // Crea il link principale
    const mainLink = document.createElement('a');
    mainLink.href = cardTraderLink;
    mainLink.target = '_blank';
    mainLink.className = 'pokemon-card-linker-link';
    
    const linkIcon = document.createElement('span');
    linkIcon.className = 'pokemon-card-linker-link-icon';
    linkIcon.innerHTML = '🔗';
    
    const linkText = document.createElement('span');
    linkText.className = 'pokemon-card-linker-link-text';
    linkText.textContent = `Vedi ${bestMatch.name_en || bestMatch.pokemon_name} su CardTrader`;
    
    const badge = document.createElement('span');
    badge.className = 'pokemon-card-linker-badge pokemon-card-linker-badge-perfect';
    badge.textContent = 'Match';
    
    mainLink.appendChild(linkIcon);
    mainLink.appendChild(linkText);
    mainLink.appendChild(badge);
    
    // Crea il container per i link
    const linksContainer = document.createElement('div');
    linksContainer.className = 'pokemon-card-linker-links';
    linksContainer.appendChild(mainLink);
    
    // Aggiungi link aggiuntivi se ci sono più risultati
    if (results.length > 1) {
        results.slice(1, 3).forEach((result, index) => {
            const additionalLink = document.createElement('a');
            additionalLink.href = generateCardTraderLink(result.blueprint_id);
            additionalLink.target = '_blank';
            additionalLink.className = 'pokemon-card-linker-link';
            
            const additionalIcon = document.createElement('span');
            additionalIcon.className = 'pokemon-card-linker-link-icon';
            additionalIcon.innerHTML = '🔗';
            
            const additionalText = document.createElement('span');
            additionalText.className = 'pokemon-card-linker-link-text';
            additionalText.textContent = `Variante ${index + 2}: ${result.name_en || result.pokemon_name}`;
            
            const additionalBadge = document.createElement('span');
            additionalBadge.className = 'pokemon-card-linker-badge pokemon-card-linker-badge-good';
            additionalBadge.textContent = 'Alt';
            
            additionalLink.appendChild(additionalIcon);
            additionalLink.appendChild(additionalText);
            additionalLink.appendChild(additionalBadge);
            
            linksContainer.appendChild(additionalLink);
        });
    }
    
    // Assembla tutto
    linkContainer.appendChild(header);
    linkContainer.appendChild(linksContainer);
    
    // Inserisci il container nell'inserzione
    insertLinkContainer(listingElement, linkContainer);
}

// Inserisce il container dei link nell'inserzione
function insertLinkContainer(listingElement, linkContainer) {
    const hostname = window.location.hostname;
    
    if (hostname.includes('ebay')) {
        // eBay: inserisci dopo il titolo
        const titleElement = listingElement.querySelector('[data-testid="item-title"], .s-item__title, h3.s-item__title');
        if (titleElement && titleElement.parentNode) {
            titleElement.parentNode.insertBefore(linkContainer, titleElement.nextSibling);
        } else {
            listingElement.appendChild(linkContainer);
        }
        
    } else if (hostname.includes('vinted')) {
        // Vinted: inserisci dopo il titolo
        const titleElement = listingElement.querySelector('[data-testid="item-title"], .web_ui__Text__text, h3');
        if (titleElement && titleElement.parentNode) {
            titleElement.parentNode.insertBefore(linkContainer, titleElement.nextSibling);
        } else {
            listingElement.appendChild(linkContainer);
        }
    }
}

// Gestisce i messaggi dal popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle') {
        isEnabled = !isEnabled;
        sendResponse({ paused: !isEnabled });
        
        if (isEnabled) {
            console.log('▶️ Estensione riattivata');
            processExistingListings();
        } else {
            console.log('⏸️ Estensione in pausa');
        }
    } else if (request.action === 'getStatus') {
        // Risponde con lo stato della connessione
        sendResponse({ 
            connected: window.supabaseClient !== null,
            enabled: isEnabled 
        });
    } else if (request.action === 'searchCard') {
        // Gestisce la ricerca manuale dal popup
        handlePopupSearch(request.titleInfo, sendResponse);
        return true; // Mantieni il canale aperto per risposta asincrona
    } else if (request.action === 'autoSearchCurrentPage') {
        // Gestisce la ricerca automatica dalla pagina corrente
        handleAutoSearchCurrentPage(sendResponse);
        return true; // Mantieni il canale aperto per risposta asincrona
    }
    
    return true;
});

// Gestisce la ricerca dal popup
async function handlePopupSearch(titleInfo, sendResponse) {
    try {
        console.log('🔍 [Popup] Ricerca richiesta per:', titleInfo);
        
        const results = await searchCardInDatabase(titleInfo);
        
        console.log('✅ [Popup] Risultati trovati:', results.length);
        
        sendResponse({
            success: true,
            results: results
        });
    } catch (error) {
        console.error('❌ [Popup] Errore nella ricerca:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Gestisce la ricerca automatica dalla pagina corrente
async function handleAutoSearchCurrentPage(sendResponse) {
    try {
        console.log('🔍 [Popup] Ricerca automatica richiesta');
        
        // Estrai il titolo dalla pagina corrente
        let title = null;
        
        if (window.location.hostname.includes('ebay')) {
            // Per eBay
            const titleSelectors = [
                'h1.x-item-title__mainTitle',
                '.x-item-title__mainTitle',
                '[data-testid="x-item-title"] h1',
                '[data-testid="item-title"]',
                '.item-title',
                'h1'
            ];
            
            for (const selector of titleSelectors) {
                const titleElem = document.querySelector(selector);
                if (titleElem) {
                    title = titleElem.textContent.replace(/\s+/g, ' ').trim();
                    break;
                }
            }
        } else if (window.location.hostname.includes('vinted')) {
            // Per Vinted
            const titleSelectors = [
                '[data-testid="item-title"]',
                '.item-title',
                'h1',
                '.title'
            ];
            
            for (const selector of titleSelectors) {
                const titleElem = document.querySelector(selector);
                if (titleElem) {
                    title = titleElem.textContent.replace(/\s+/g, ' ').trim();
                    break;
                }
            }
        }
        
        if (!title) {
            console.log('❌ [Popup] Nessun titolo trovato nella pagina');
            sendResponse({
                success: false,
                error: 'Nessun titolo trovato nella pagina'
            });
            return;
        }
        
        console.log('📝 [Popup] Titolo estratto:', title);
        
        // Estrai informazioni dal titolo
        const titleInfo = extractTitleInfo(title);
        
        if (!titleInfo.pokemonName) {
            console.log('❌ [Popup] Nessun Pokemon trovato nel titolo');
            sendResponse({
                success: false,
                error: 'Nessun Pokemon trovato nel titolo'
            });
            return;
        }
        
        console.log('🎯 [Popup] Pokemon trovato:', titleInfo.pokemonName);
        
        // Cerca nel database
        const results = await searchCardInDatabase(titleInfo);
        
        console.log('✅ [Popup] Risultati trovati:', results.length);
        
        sendResponse({
            success: true,
            titleInfo: titleInfo,
            results: results
        });
        
    } catch (error) {
        console.error('❌ [Popup] Errore nella ricerca automatica:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Inizializza l'estensione quando il DOM è pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
} 

// --- PATCH: Supporto pagina prodotto eBay con pulsante CARDTRADER nel titolo ---
function patchEbayProductPage() {
    if (!window.location.hostname.includes('ebay')) return;
    
    console.log('🔍 [CardTrader] Cercando box del titolo eBay...');
    
    // Cerca il box del titolo con più selettori
    const titleBox = document.querySelector('.x-item-title, [data-testid="x-item-title"], .item-title-container, .title-section');
    console.log('🔍 [CardTrader] Box del titolo trovato:', !!titleBox);
    
    if (titleBox && !document.querySelector('.pokemon-card-linker-product')) {
        console.log('✅ [CardTrader] Box del titolo trovato, cercando titolo...');
        
        // Trova il titolo con più selettori
        const titleSelectors = [
            'h1.x-item-title__mainTitle',
            '.x-item-title__mainTitle',
            '[data-testid="x-item-title"] h1',
            '[data-testid="item-title"]',
            '.item-title',
            'h1'
        ];
        
        let titleElem = null;
        for (const selector of titleSelectors) {
            titleElem = document.querySelector(selector);
            if (titleElem) {
                console.log('✅ [CardTrader] Titolo trovato con selettore:', selector);
                break;
            }
        }
        
        const title = titleElem ? titleElem.textContent.replace(/\s+/g, ' ').trim() : null;
        console.log('📝 [CardTrader] Titolo estratto:', title);
        console.log('📝 [CardTrader] Elemento titolo:', titleElem);
        console.log('📝 [CardTrader] HTML titolo:', titleElem ? titleElem.innerHTML : 'null');
        
        if (!title) {
            console.log('❌ [CardTrader] Nessun titolo trovato');
            return;
        }
        
        // Estrai info
        const titleInfo = extractTitleInfo(title);
        console.log('🔍 [CardTrader] Info estratte:', titleInfo);
        console.log('🎯 [CardTrader] Pokemon trovato:', titleInfo.pokemonName);
        
        if (!titleInfo.pokemonName) {
            console.log('❌ [CardTrader] Nessun Pokemon trovato nel titolo');
            return;
        }
        
        // Cerca nel database e inserisci il bottone
        console.log('🔍 [CardTrader] Cercando nel database...');
        console.log('🔍 [CardTrader] Client Supabase disponibile:', !!window.supabaseClient);
        searchCardInDatabase(titleInfo, title).then(results => {
            console.log('📊 [CardTrader] Risultati database:', results);
            
            if (!results || results.length === 0) {
                console.log('❌ [CardTrader] Nessun risultato trovato nel database');
                return;
            }
            
            const bestMatch = results[0];
            const cardTraderLink = generateCardTraderLink(bestMatch.blueprint_id);
            console.log('🔗 [CardTrader] Link generato:', cardTraderLink);
            
            // Crea il bottone CardTrader
            const ctBtn = document.createElement('a');
            ctBtn.href = cardTraderLink;
            ctBtn.target = '_blank';
            ctBtn.className = 'pokemon-card-linker-product';
            ctBtn.style.cssText = 'display:inline-block;margin-left:10px;padding:6px 12px;background:#28a745;color:white;border:1px solid #1e7e34;border-radius:4px;text-decoration:none;font-size:12px;font-weight:bold;transition:background 0.3s;';
            ctBtn.textContent = 'CARDTRADER';
            ctBtn.title = 'Vedi su CardTrader';
            
            // Aggiungi hover effect
            ctBtn.addEventListener('mouseenter', () => {
                ctBtn.style.background = '#218838';
            });
            ctBtn.addEventListener('mouseleave', () => {
                ctBtn.style.background = '#28a745';
            });
            
            // Inserisci nel box del titolo, dopo il titolo principale
            const titleElement = titleBox.querySelector('h1, .x-item-title__mainTitle, [data-testid="item-title"]');
            if (titleElement && titleElement.parentNode) {
                titleElement.parentNode.insertBefore(ctBtn, titleElement.nextSibling);
            } else {
                titleBox.appendChild(ctBtn);
            }
            console.log('✅ [CardTrader] Pulsante CARDTRADER aggiunto!');
        }).catch(error => {
            console.error('❌ [CardTrader] Errore nella ricerca database:', error);
        });
    } else {
        console.log('❌ [CardTrader] Box del titolo non trovato o pulsante CARDTRADER già presente');
    }
}

function patchVintedProductPage() {
    if (!window.location.hostname.includes('vinted')) return;
    
    console.log('🔍 [CardTrader] Cercando box del titolo Vinted...');
    
    // Cerca il box del titolo con più selettori per Vinted
    const titleBox = document.querySelector('.summary-max-lines-4, [data-testid="item-title"], .item-title-container, .title-section');
    console.log('🔍 [CardTrader] Box del titolo Vinted trovato:', !!titleBox);
    
    if (titleBox && !document.querySelector('.pokemon-card-linker-product')) {
        console.log('✅ [CardTrader] Box del titolo Vinted trovato, cercando titolo...');
        
        // Trova il titolo con più selettori per Vinted
        const titleSelectors = [
            'h1.web_ui__Text__text.web_ui__Text__title.web_ui__Text__left',
            '.web_ui__Text__text.web_ui__Text__title',
            '[data-testid="item-title"]',
            '.item-title',
            'h1'
        ];
        
        let titleElem = null;
        for (const selector of titleSelectors) {
            titleElem = document.querySelector(selector);
            if (titleElem) {
                console.log('✅ [CardTrader] Titolo Vinted trovato con selettore:', selector);
                break;
            }
        }
        
        const title = titleElem ? titleElem.textContent.replace(/\s+/g, ' ').trim() : null;
        console.log('📝 [CardTrader] Titolo Vinted estratto:', title);
        console.log('📝 [CardTrader] Elemento titolo Vinted:', titleElem);
        console.log('📝 [CardTrader] HTML titolo Vinted:', titleElem ? titleElem.innerHTML : 'null');
        
        if (!title) {
            console.log('❌ [CardTrader] Nessun titolo Vinted trovato');
            return;
        }
        
        // Estrai info
        const titleInfo = extractTitleInfo(title);
        console.log('🔍 [CardTrader] Info estratte Vinted:', titleInfo);
        console.log('🎯 [CardTrader] Pokemon trovato Vinted:', titleInfo.pokemonName);
        
        if (!titleInfo.pokemonName) {
            console.log('❌ [CardTrader] Nessun Pokemon trovato nel titolo Vinted');
            return;
        }
        
        // Cerca nel database e inserisci il bottone
        console.log('🔍 [CardTrader] Cercando nel database Vinted...');
        console.log('🔍 [CardTrader] Client Supabase disponibile:', !!window.supabaseClient);
        searchCardInDatabase(titleInfo, title).then(results => {
            console.log('📊 [CardTrader] Risultati database Vinted:', results);
            
            if (!results || results.length === 0) {
                console.log('❌ [CardTrader] Nessun risultato trovato nel database Vinted');
                return;
            }
            
            const bestMatch = results[0];
            const cardTraderLink = generateCardTraderLink(bestMatch.blueprint_id);
            console.log('🔗 [CardTrader] Link generato Vinted:', cardTraderLink);
            
            // Crea il bottone CardTrader
            const ctBtn = document.createElement('a');
            ctBtn.href = cardTraderLink;
            ctBtn.target = '_blank';
            ctBtn.className = 'pokemon-card-linker-product';
            ctBtn.style.cssText = 'display:inline-block;margin-left:10px;padding:6px 12px;background:#28a745;color:white;border:1px solid #1e7e34;border-radius:4px;text-decoration:none;font-size:12px;font-weight:bold;transition:background 0.3s;';
            ctBtn.textContent = 'CARDTRADER';
            ctBtn.title = 'Vedi su CardTrader';
            
            // Aggiungi hover effect
            ctBtn.addEventListener('mouseenter', () => {
                ctBtn.style.background = '#218838';
            });
            ctBtn.addEventListener('mouseleave', () => {
                ctBtn.style.background = '#28a745';
            });
            
            // Inserisci nel box del titolo, dopo il titolo principale
            const titleElement = titleBox.querySelector('h1, .web_ui__Text__text.web_ui__Text__title, [data-testid="item-title"]');
            if (titleElement && titleElement.parentNode) {
                titleElement.parentNode.insertBefore(ctBtn, titleElement.nextSibling);
            } else {
                titleBox.appendChild(ctBtn);
            }
            console.log('✅ [CardTrader] Pulsante CARDTRADER aggiunto a Vinted!');
        }).catch(error => {
            console.error('❌ [CardTrader] Errore nella ricerca database Vinted:', error);
        });
    } else {
        console.log('❌ [CardTrader] Box del titolo Vinted non trovato o pulsante CARDTRADER già presente');
    }
}

// Funzione per estrarre informazioni dal titolo
function extractTitleInfo(title) {
    const titleLower = title.toLowerCase();
    
    // Lista completa dei Pokemon
    const pokemonList = [
        // Generazione 1
        'bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard', 'squirtle', 'wartortle', 'blastoise',
        'caterpie', 'metapod', 'butterfree', 'weedle', 'kakuna', 'beedrill', 'pidgey', 'pidgeotto', 'pidgeot',
        'rattata', 'raticate', 'spearow', 'fearow', 'ekans', 'arbok', 'pichu', 'pikachu', 'raichu',
        'sandshrew', 'sandslash', 'nidoran♀', 'nidorina', 'nidoqueen', 'nidoran♂', 'nidorino', 'nidoking',
        'cleffa', 'clefairy', 'clefable', 'vulpix', 'ninetales', 'igglybuff', 'jigglypuff', 'wigglytuff',
        'zubat', 'golbat', 'oddish', 'gloom', 'vileplume', 'paras', 'parasect', 'venonat', 'venomoth',
        'diglett', 'dugtrio', 'meowth', 'persian', 'psyduck', 'golduck', 'mankey', 'primeape', 'growlithe', 'arcanine',
        'poliwag', 'poliwhirl', 'poliwrath', 'abra', 'kadabra', 'alakazam', 'machop', 'machoke', 'machamp',
        'bellsprout', 'weepinbell', 'victreebel', 'tentacool', 'tentacruel', 'geodude', 'graveler', 'golem',
        'ponyta', 'rapidash', 'slowpoke', 'slowbro', 'magnemite', 'magneton', 'farfetch\'d', 'doduo', 'dodrio',
        'seel', 'dewgong', 'grimer', 'muk', 'shellder', 'cloyster', 'gastly', 'haunter', 'gengar',
        'drowzee', 'hypno', 'krabby', 'kingler', 'voltorb', 'electrode', 'exeggcute', 'exeggutor',
        'cubone', 'marowak', 'hitmonlee', 'hitmonchan', 'lickitung', 'koffing', 'weezing', 'rhyhorn', 'rhydon',
        'chansey', 'tangela', 'kangaskhan', 'horsea', 'seadra', 'goldeen', 'seaking', 'staryu', 'starmie',
        'mr. mime', 'scyther', 'jynx', 'electabuzz', 'magmar', 'pinsir', 'tauros', 'magikarp', 'gyarados',
        'lapras', 'ditto', 'porygon', 'vaporeon', 'jolteon', 'flareon', 'omanyte', 'omastar', 'kabuto', 'kabutops',
        'aerodactyl', 'snorlax', 'articuno', 'zapdos', 'moltres', 'dratini', 'dragonair', 'dragonite',
        'mewtwo', 'mew',
        
        // Generazione 2
        'chikorita', 'bayleef', 'meganium', 'cyndaquil', 'quilava', 'typhlosion', 'totodile', 'croconaw', 'feraligatr',
        'sentret', 'furret', 'hoothoot', 'noctowl', 'ledyba', 'ledian', 'spinarak', 'ariados', 'crobat',
        'chinchou', 'lanturn', 'pichu', 'cleffa', 'igglybuff', 'togepi', 'togetic', 'natu', 'xatu',
        'mareep', 'flaaffy', 'ampharos', 'bellossom', 'marill', 'azumarill', 'sudowoodo', 'politoed',
        'hoppip', 'skiploom', 'jumpluff', 'aipom', 'sunkern', 'sunflora', 'yanma', 'wooper', 'quagsire',
        'espeon', 'umbreon', 'murkrow', 'slowking', 'misdreavus', 'unown', 'wobbuffet', 'girafarig',
        'pineco', 'forretress', 'dunsparce', 'gligar', 'steelix', 'snubbull', 'granbull', 'qwilfish',
        'scizor', 'shuckle', 'heracross', 'sneasel', 'teddiursa', 'ursaring', 'slugma', 'magcargo',
        'swinub', 'piloswine', 'corsola', 'remoraid', 'octillery', 'delibird', 'mantine', 'skarmory',
        'houndour', 'houndoom', 'kingdra', 'phanpy', 'donphan', 'porygon2', 'stantler', 'smeargle',
        'tyrogue', 'hitmontop', 'smoochum', 'elekid', 'magby', 'miltank', 'blissey', 'raikou', 'entei', 'suicune',
        'larvitar', 'pupitar', 'tyranitar', 'lugia', 'ho-oh', 'celebi',
        
        // Generazione 3
        'treecko', 'grovyle', 'sceptile', 'torchic', 'combusken', 'blaziken', 'mudkip', 'marshtomp', 'swampert',
        'poochyena', 'mightyena', 'zigzagoon', 'linoone', 'wurmple', 'silcoon', 'beautifly', 'cascoon', 'dustox',
        'lotad', 'lombre', 'ludicolo', 'seedot', 'nuzleaf', 'shiftry', 'taillow', 'swellow', 'wingull', 'pelipper',
        'ralts', 'kirlia', 'gardevoir', 'surskit', 'masquerain', 'shroomish', 'breloom', 'slakoth', 'vigoroth', 'slaking',
        'nincada', 'ninjask', 'shedinja', 'whismur', 'loudred', 'exploud', 'makuhita', 'hariyama', 'azurill',
        'nosepass', 'skitty', 'delcatty', 'sableye', 'mawile', 'aron', 'lairon', 'aggron', 'meditite', 'medicham',
        'electrike', 'manectric', 'plusle', 'minun', 'volbeat', 'illumise', 'roselia', 'gulpin', 'swalot',
        'carvanha', 'sharpedo', 'wailmer', 'wailord', 'numel', 'camerupt', 'torkoal', 'spoink', 'grumpig',
        'spinda', 'trapinch', 'vibrava', 'flygon', 'cacnea', 'cacturne', 'swablu', 'altaria', 'zangoose', 'seviper',
        'lunatone', 'solrock', 'barboach', 'whiscash', 'corphish', 'crawdaunt', 'baltoy', 'claydol', 'lileep', 'cradily',
        'anorith', 'armaldo', 'feebas', 'milotic', 'castform', 'kecleon', 'shuppet', 'banette', 'duskull', 'dusclops',
        'tropius', 'chimecho', 'absol', 'wynaut', 'snorunt', 'glalie', 'spheal', 'sealeo', 'walrein', 'clamperl',
        'huntail', 'gorebyss', 'relicanth', 'luvdisc', 'bagon', 'shelgon', 'salamence', 'beldum', 'metang', 'metagross',
        'regirock', 'regice', 'registeel', 'latias', 'latios', 'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys',
        
        // Generazione 4
        'turtwig', 'grotle', 'torterra', 'chimchar', 'monferno', 'infernape', 'piplup', 'prinplup', 'empoleon',
        'starly', 'staravia', 'staraptor', 'bidoof', 'bibarel', 'kricketot', 'kricketune', 'shinx', 'luxio', 'luxray',
        'budew', 'roserade', 'cranidos', 'rampardos', 'shieldon', 'bastiodon', 'burmy', 'wormadam', 'mothim',
        'combee', 'vespiquen', 'pachirisu', 'buizel', 'floatzel', 'cherubi', 'cherrim', 'shellos', 'gastrodon',
        'ambipom', 'drifloon', 'drifblim', 'buneary', 'lopunny', 'mismagius', 'honchkrow', 'glameow', 'purugly',
        'chingling', 'stunky', 'skuntank', 'bronzor', 'bronzong', 'bonsly', 'mime jr.', 'happiny', 'chatot',
        'spiritomb', 'gible', 'gabite', 'garchomp', 'munchlax', 'riolu', 'lucario', 'hippopotas', 'hippowdon',
        'skorupi', 'drapion', 'croagunk', 'toxicroak', 'carnivine', 'finneon', 'lumineon', 'mantyke', 'snover', 'abomasnow',
        'weavile', 'magnezone', 'lickilicky', 'rhyperior', 'tangrowth', 'electivire', 'magmortar', 'togekiss',
        'yanmega', 'leafeon', 'glaceon', 'gliscor', 'mamoswine', 'porygon-z', 'gallade', 'probopass', 'dusknoir',
        'froslass', 'rotom', 'uxie', 'mesprit', 'azelf', 'dialga', 'palkia', 'heatran', 'regigigas', 'giratina', 'cresselia',
        'phione', 'manaphy', 'darkrai', 'shaymin', 'arceus',
        
        // Generazione 5
        'victini', 'snivy', 'servine', 'serperior', 'tepig', 'pignite', 'emboar', 'oshawott', 'dewott', 'samurott',
        'patrat', 'watchog', 'lillipup', 'herdier', 'stoutland', 'purrloin', 'liepard', 'pansage', 'simisage',
        'pansear', 'simisear', 'panpour', 'simipour', 'munna', 'musharna', 'pidove', 'tranquill', 'unfezant',
        'blitzle', 'zebstrika', 'roggenrola', 'boldore', 'gigalith', 'woobat', 'swoobat', 'drilbur', 'excadrill',
        'audino', 'timburr', 'gurdurr', 'conkeldurr', 'tympole', 'palpitoad', 'seismitoad', 'throh', 'sawk',
        'sewaddle', 'swadloon', 'leavanny', 'venipede', 'whirlipede', 'scolipede', 'cottonee', 'whimsicott',
        'petilil', 'lilligant', 'basculin', 'sandile', 'krokorok', 'krookodile', 'darumaka', 'darmanitan',
        'maractus', 'dwebble', 'crustle', 'scraggy', 'scrafty', 'sigilyph', 'yamask', 'cofagrigus', 'tirtouga', 'carracosta',
        'archen', 'archeops', 'trubbish', 'garbodor', 'zorua', 'zoroark', 'minccino', 'cinccino', 'gothita', 'gothorita', 'gothitelle',
        'solosis', 'duosion', 'reuniclus', 'ducklett', 'swanna', 'vanillite', 'vanillish', 'vanilluxe', 'deerling', 'sawsbuck',
        'emolga', 'karrablast', 'escavalier', 'foongus', 'amoonguss', 'frillish', 'jellicent', 'alomomola', 'joltik', 'galvantula',
        'ferroseed', 'ferrothorn', 'klink', 'klang', 'klinklang', 'tynamo', 'eelektrik', 'eelektross', 'elgyem', 'beheeyem',
        'litwick', 'lampent', 'chandelure', 'axew', 'fraxure', 'haxorus', 'cubchoo', 'beartic', 'cryogonal', 'shelmet', 'accelgor',
        'stunfisk', 'mienfoo', 'mienshao', 'druddigon', 'golett', 'golurk', 'pawniard', 'bisharp', 'bouffalant', 'rufflet', 'braviary',
        'vullaby', 'mandibuzz', 'heatmor', 'durant', 'deino', 'zweilous', 'hydreigon', 'larvesta', 'volcarona',
        'cobalion', 'terrakion', 'virizion', 'tornadus', 'thundurus', 'reshiram', 'zekrom', 'landorus', 'kyurem', 'keldeo', 'meloetta', 'genesect',
        
        // Generazione 6
        'chespin', 'quilladin', 'chesnaught', 'fennekin', 'braixen', 'delphox', 'froakie', 'frogadier', 'greninja',
        'bunnelby', 'diggersby', 'fletchling', 'fletchinder', 'talonflame', 'scatterbug', 'spewpa', 'vivillon',
        'litleo', 'pyroar', 'flabébé', 'floette', 'florges', 'skiddo', 'gogoat', 'pancham', 'pangoro',
        'furfrou', 'espurr', 'meowstic', 'honedge', 'doublade', 'aegislash', 'spritzee', 'aromatisse',
        'swirlix', 'slurpuff', 'inkay', 'malamar', 'binacle', 'barbaracle', 'skrelp', 'dragalge', 'clauncher', 'clawitzer',
        'helioptile', 'heliolisk', 'tyrunt', 'tyrantrum', 'amaura', 'aurorus', 'sylveon', 'hawlucha', 'dedenne',
        'carbink', 'goomy', 'sliggoo', 'goodra', 'klefki', 'phantump', 'trevenant', 'pumpkaboo', 'gourgeist',
        'bergmite', 'avalugg', 'noibat', 'noivern', 'xerneas', 'yveltal', 'zygarde', 'diancie', 'hoopa', 'volcanion',
        
        // Generazione 7
        'rowlet', 'dartrix', 'decidueye', 'litten', 'torracat', 'incineroar', 'popplio', 'brionne', 'primarina',
        'pikipek', 'trumbeak', 'toucannon', 'yungoos', 'gumshoos', 'grubbin', 'charjabug', 'vikavolt',
        'crabrawler', 'crabominable', 'oricorio', 'cutiefly', 'ribombee', 'rockruff', 'lycanroc', 'wishiwashi',
        'mareanie', 'toxapex', 'mudbray', 'mudsdale', 'dewpider', 'araquanid', 'fomantis', 'lurantis',
        'morelull', 'shiinotic', 'salandit', 'salazzle', 'stufful', 'bewear', 'bounsweet', 'steenee', 'tsareena',
        'comfey', 'oranguru', 'passimian', 'wimpod', 'golisopod', 'sandygast', 'palossand', 'pyukumuku',
        'type: null', 'silvally', 'minior', 'komala', 'turtonator', 'togedemaru', 'mimikyu', 'bruxish',
        'drampa', 'dhelmise', 'jangmo-o', 'hakamo-o', 'kommo-o', 'tapu koko', 'tapu lele', 'tapu bulu', 'tapu fini',
        'cosmog', 'cosmoem', 'solgaleo', 'lunala', 'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela',
        'kartana', 'guzzlord', 'necrozma', 'magearna', 'marshadow', 'poipole', 'naganadel', 'stakataka', 'blacephalon', 'zeraora', 'meltan', 'melmetal',
        
        // Generazione 8
        'grookey', 'thwackey', 'rillaboom', 'scorbunny', 'raboot', 'cinderace', 'sobble', 'drizzile', 'inteleon',
        'skwovet', 'greedent', 'rookidee', 'corvisquire', 'corviknight', 'blipbug', 'dottler', 'orbeetle',
        'nickit', 'thievul', 'gossifleur', 'eldegoss', 'wooloo', 'dubwool', 'chewtle', 'drednaw', 'yamper', 'boltund',
        'rolycoly', 'carkol', 'coalossal', 'applin', 'flapple', 'appletun', 'silicobra', 'sandaconda',
        'cramorant', 'arrokuda', 'barraskewda', 'toxel', 'toxtricity', 'sizzlipede', 'centiskorch', 'clobbopus', 'grapploct',
        'sinistea', 'polteageist', 'hatenna', 'hattrem', 'hatterene', 'impidimp', 'morgrem', 'grimmsnarl',
        'obstagoon', 'perrserker', 'cursola', 'sirfetch\'d', 'mr. rime', 'runerigus', 'milcery', 'alcremie',
        'falinks', 'pincurchin', 'snom', 'frosmoth', 'stonjourner', 'eiscue', 'indeedee', 'morpeko',
        'cufant', 'copperajah', 'dracozolt', 'arctozolt', 'dracovish', 'arctovish', 'duraludon', 'dreepy', 'drakloak', 'dragapult',
        'zacian', 'zamazenta', 'eternatus', 'kubfu', 'urshifu', 'zarude', 'regieleki', 'regidrago', 'glastrier', 'spectrier',
        'calyrex', 'wyrdeer', 'kleavor', 'ursaluna', 'basculegion', 'sneasler', 'overqwil', 'enamorus',
        
        // Generazione 9
        'sprigatito', 'floragato', 'meowscarada', 'fuecoco', 'crocalor', 'skeledirge', 'quaxly', 'quaxwell', 'quaquaval',
        'lechonk', 'oinkologne', 'tarountula', 'spidops', 'nymble', 'lokix', 'pawmi', 'pawmo', 'pawmot',
        'tandemaus', 'maushold', 'fidough', 'dachsbun', 'smoliv', 'dolliv', 'arboliva', 'squawkabilly',
        'nacli', 'naclstack', 'garganacl', 'charcadet', 'armarouge', 'ceruledge', 'tadbulb', 'bellibolt',
        'wattrel', 'kilowattrel', 'maschiff', 'mabosstiff', 'shroodle', 'grafaiai', 'bramblin', 'brambleghast',
        'toedscool', 'toedscruel', 'klawf', 'capsakid', 'scovillain', 'rellor', 'rabsca', 'flittle', 'espathra',
        'tinkatink', 'tinkatuff', 'tinkaton', 'wiglett', 'wugtrio', 'bombirdier', 'finizen', 'palafin',
        'varoom', 'revavroom', 'cyclizar', 'orthworm', 'glimmet', 'glimmora', 'greavard', 'houndstone',
        'flamigo', 'cetoddle', 'cetitan', 'veluza', 'dondozo', 'tatsugiri', 'annihilape', 'clodsire',
        'farigiraf', 'dudunsparce', 'kingambit', 'great tusk', 'scream tail', 'brute bonnet', 'flutter mane', 'slither wing',
        'sandy shocks', 'iron treads', 'iron bundle', 'iron hands', 'iron jugulis', 'iron moth', 'iron thorns', 'frigibax', 'arctibax', 'baxcalibur',
        'gimmighoul', 'gholdengo', 'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu', 'roaring moon', 'iron valiant',
        'koraidon', 'miraidon', 'walking wake', 'iron leaves', 'dipplin', 'poltchageist', 'sinistcha', 'okidogi',
        'munkidori', 'fezandipiti', 'ogerpon', 'archaludon', 'hydrapple', 'gouging fire', 'raging bolt', 'iron boulder', 'iron crown', 'terapagos', 'pecharunt'
    ];
    
    let pokemonName = null;
    console.log('🔍 [CardTrader] Cercando Pokemon nel titolo:', titleLower);
    
    for (const pokemon of pokemonList) {
        // Cerca il Pokemon con variazioni di maiuscole/minuscole
        const pokemonLower = pokemon.toLowerCase();
        
        // Match diretto
        if (titleLower.includes(pokemonLower)) {
            pokemonName = pokemon.toLowerCase();
            console.log('✅ [CardTrader] Pokemon trovato (match diretto):', pokemonName);
            break;
        }
        
        // Cerca con possessivi (es: "Erika's Dragonair", "Giovanni's Nidoking")
        const possessiveMatch = titleLower.match(new RegExp(`\\w+'s\\s+${pokemonLower}\\b`, 'i'));
        if (possessiveMatch) {
            pokemonName = pokemon.toLowerCase();
            console.log('✅ [CardTrader] Pokemon trovato (con possessivo):', pokemonName, 'match:', possessiveMatch[0]);
            break;
        }
        
        // Cerca anche con forme speciali (Ex, GX, V, VMAX, etc.)
        const specialForms = ['ex', 'gx', 'v', 'vmax', 'vstar', 'break', 'prime', 'star', 'delta', 'shining', 'crystal'];
        for (const form of specialForms) {
            // Cerca con spazio: "Leafeon ex" o senza spazio: "Leafeonex"
            if (titleLower.includes(pokemonLower + ' ' + form) || titleLower.includes(pokemonLower + form)) {
                pokemonName = pokemon.toLowerCase();
                console.log('✅ [CardTrader] Pokemon trovato (con forma speciale):', pokemonName, 'forma:', form);
                break;
            }
            // Cerca anche con trattino: "Leafeon-ex"
            if (titleLower.includes(pokemonLower + '-' + form)) {
                pokemonName = pokemon.toLowerCase();
                console.log('✅ [CardTrader] Pokemon trovato (con forma speciale e trattino):', pokemonName, 'forma:', form);
                break;
            }
        }
        if (pokemonName) break;
    }
    
    if (!pokemonName) {
        console.log('❌ [CardTrader] Nessun Pokemon trovato nella lista. Titolo completo:', title);
    }
    
    // Estrai numero collezionista (formato X/Y o solo numero)
    let collectorNumber = null;
    const numberMatch = titleLower.match(/(\d+)\/(\d+)/);
    if (numberMatch) {
        collectorNumber = numberMatch[1];
        console.log(`🎯 [CardTrader] Numero collezionista estratto (X/Y): ${collectorNumber} da ${numberMatch[0]}`);
    } else {
        // Cerca un numero singolo dopo "n." o "numero" o "XY" o simili
        const singleNumberMatch = titleLower.match(/(?:n\.|numero|#|xy|swsh|sv|sm)\s*(\d+)/i);
        if (singleNumberMatch) {
            collectorNumber = singleNumberMatch[1];
            console.log(`🎯 [CardTrader] Numero collezionista estratto (singolo): ${collectorNumber} da ${singleNumberMatch[0]}`);
        } else {
            // Cerca un numero singolo isolato (per casi come "148", "200")
            const isolatedNumberMatch = titleLower.match(/\b(\d{1,4})\b/);
            if (isolatedNumberMatch) {
                collectorNumber = isolatedNumberMatch[1];
                console.log(`🎯 [CardTrader] Numero collezionista estratto (isolato): ${collectorNumber} da ${isolatedNumberMatch[0]}`);
            }
        }
    }
    
    // Estrai codice di espansione (es: SL7, XY123, SAR, sv8a, etc.)
    let expansionCode = null;
    
    // Cerca pattern come "SAR sv8a" o "sv8a"
    const sarPattern = titleLower.match(/\b(sar\s+sv\d+[a-z]*)\b/i);
    if (sarPattern) {
        expansionCode = sarPattern[1].toUpperCase();
        console.log(`🎯 [CardTrader] Codice espansione SAR trovato: ${expansionCode}`);
    } else {
        // Cerca pattern generico come SL7, XY123, etc.
        const expansionCodeMatch = titleLower.match(/\b([a-z]{1,3}\d*[a-z]*)\b/i);
        if (expansionCodeMatch) {
            expansionCode = expansionCodeMatch[1].toUpperCase();
            console.log(`🎯 [CardTrader] Codice espansione trovato: ${expansionCode}`);
        }
    }
    
    // Estrai espansione
    let expansion = null;
    const expansionPatterns = [
        // Espansioni classiche
        /gym heroes/i,
        /gym challenge/i,
        /team rocket/i,
        /neo genesis/i,
        /neo discovery/i,
        /neo revelation/i,
        /neo destiny/i,
        /legendary collection/i,
        /base set/i,
        /jungle/i,
        /fossil/i,
        /base set 2/i,
        /team rocket returns/i,
        /fire red & leaf green/i,
        /hidden legends/i,
        /deoxys/i,
        /emerald/i,
        /unseen forces/i,
        /delta species/i,
        /holon phantoms/i,
        /crystal guardians/i,
        /dragon frontiers/i,
        /power keepers/i,
        /ex dragon/i,
        /ex ruby & sapphire/i,
        /ex sandstorm/i,
        /ex team magma vs team aqua/i,
        /ex unseen forces/i,
        /ex dragon/i,
        /ex dragon frontiers/i,
        /ex power keepers/i,
        /ex holon phantoms/i,
        /ex crystal guardians/i,
        /ex legend maker/i,
        
        // Espansioni moderne
        /terastal festival/i,
        /prismatic evolution/i,
        /scarlet & violet/i,
        /sword & shield/i,
        /sun & moon/i,
        /xy/i,
        /black & white/i,
        /heartgold & soulsilver/i,
        /platinum/i,
        /diamond & pearl/i,
        /sar/i,
        /sv8a/i,
        /sv\d+[a-z]*/i,
        /sar\s+sv\d+[a-z]*/i,
        /terastal\s+festival/i,
        /festival\s+terastal/i,
        /ex delta species/i,
        /ex deoxys/i,
        /ex emerald/i,
        /ex fire red & leaf green/i,
        /ex hidden legends/i,
        /ex ruby & sapphire/i,
        /ex sandstorm/i,
        /ex team magma vs team aqua/i,
        /ex unseen forces/i,
        /ex dragon/i,
        /ex dragon frontiers/i,
        /ex power keepers/i,
        /ex holon phantoms/i,
        /ex crystal guardians/i,
        /ex legend maker/i,
        
        // Espansioni aggiuntive
        /brilliant stars/i,
        /astral radiance/i,
        /lost origin/i,
        /silver tempest/i,
        /crown zenith/i,
        /scarlet & violet base/i,
        /paldea evolved/i,
        /obsidian flames/i,
        /151/i,
        /paradox rift/i,
        /paldean fates/i,
        /temporal forces/i,
        /twilight masquerade/i,
        /ancient roar/i,
        /future flash/i,
        /shining fates/i,
        /champions path/i,
        /vivid voltage/i,
        /darkness ablaze/i,
        /rebel clash/i,
        /sword & shield base/i,
        /cosmic eclipse/i,
        /hidden fates/i,
        /unified minds/i,
        /unbroken bonds/i,
        /detective pikachu/i,
        /team up/i,
        /lost thunder/i,
        /dragon majesty/i,
        /celestial storm/i,
        /forbidden light/i,
        /ultra prism/i,
        /crimson invasion/i,
        /shining legends/i,
        /burning shadows/i,
        /guardians rising/i,
        /sun & moon base/i,
        /evolutions/i,
        /steam siege/i,
        /fates collide/i,
        /generations/i,
        /breakpoint/i,
        /breakthrough/i,
        /ancient origins/i,
        /roaring skies/i,
        /double crisis/i,
        /primal clash/i,
        /phantom forces/i,
        /furious fists/i,
        /flashfire/i,
        /xy base/i,
        /kalos starter set/i,
        /legendary treasures/i,
        /plasma blast/i,
        /plasma freeze/i,
        /plasma storm/i,
        /boundaries crossed/i,
        /dragons exalted/i,
        /dark explorers/i,
        /next destinies/i,
        /noble victories/i,
        /emerging powers/i,
        /black & white base/i,
        /call of legends/i,
        /fuori serie/i,
        /out of series/i,
        /special series/i,
        /triumphant/i,
        /undauted/i,
        /unleashed/i,
        /unseen forces/i,
        /fire red & leaf green/i,
        /team magma vs team aqua/i,
        /hidden legends/i,
        /deoxys/i,
        /emerald/i,
        /team rocket returns/i,
        /dragon/i,
        /sandstorm/i,
        /ruby & sapphire/i,
        /expedition/i,
        /aquapolis/i,
        /skyridge/i,
        /legendary collection/i,
        /neo destiny/i,
        /neo revelation/i,
        /neo discovery/i,
        /neo genesis/i,
        /gym challenge/i,
        /gym heroes/i,
        /team rocket/i,
        /fossil/i,
        /jungle/i,
        /base set/i,
        /base set 2/i,
        /base set unlimited/i,
        /shadowless/i,
        /1st edition/i,
        /unlimited/i,
        /promo/i,
        /black star promo/i,
        /wizards black star promo/i,
        /pop series/i,
        /diamond & pearl promo/i,
        /platinum promo/i,
        /heartgold & soulsilver promo/i,
        /black & white promo/i,
        /xy promo/i,
        /sun & moon promo/i,
        /sword & shield promo/i,
        /scarlet & violet promo/i,
        /terastal festival promo/i,
        /prismatic evolution promo/i,
        /151 promo/i,
        /paradox rift promo/i,
        /paldean fates promo/i,
        /temporal forces promo/i,
        /twilight masquerade promo/i,
        /ancient roar promo/i,
        /future flash promo/i,
        /shining fates promo/i,
        /champions path promo/i,
        /vivid voltage promo/i,
        /darkness ablaze promo/i,
        /rebel clash promo/i,
        /sword & shield base promo/i,
        /cosmic eclipse promo/i,
        /hidden fates promo/i,
        /unified minds promo/i,
        /unbroken bonds promo/i,
        /detective pikachu promo/i,
        /team up promo/i,
        /lost thunder promo/i,
        /dragon majesty promo/i,
        /celestial storm promo/i,
        /forbidden light promo/i,
        /ultra prism promo/i,
        /crimson invasion promo/i,
        /shining legends promo/i,
        /burning shadows promo/i,
        /guardians rising promo/i,
        /sun & moon base promo/i,
        /evolutions promo/i,
        /steam siege promo/i,
        /fates collide promo/i,
        /generations promo/i,
        /breakpoint promo/i,
        /breakthrough promo/i,
        /ancient origins promo/i,
        /roaring skies promo/i,
        /double crisis promo/i,
        /primal clash promo/i,
        /phantom forces promo/i,
        /furious fists promo/i,
        /flashfire promo/i,
        /xy base promo/i,
        /kalos starter set promo/i,
        /legendary treasures promo/i,
        /plasma blast promo/i,
        /plasma freeze promo/i,
        /plasma storm promo/i,
        /boundaries crossed promo/i,
        /dragons exalted promo/i,
        /dark explorers promo/i,
        /next destinies promo/i,
        /noble victories promo/i,
        /emerging powers promo/i,
        /black & white base promo/i,
        /call of legends promo/i,
        /triumphant promo/i,
        /undauted promo/i,
        /unleashed promo/i,
        /unseen forces promo/i,
        /fire red & leaf green promo/i,
        /team magma vs team aqua promo/i,
        /hidden legends promo/i,
        /deoxys promo/i,
        /emerald promo/i,
        /team rocket returns promo/i,
        /dragon promo/i,
        /sandstorm promo/i,
        /ruby & sapphire promo/i,
        /expedition promo/i,
        /aquapolis promo/i,
        /skyridge promo/i,
        /legendary collection promo/i,
        /neo destiny promo/i,
        /neo revelation promo/i,
        /neo discovery promo/i,
        /neo genesis promo/i,
        /gym challenge promo/i,
        /gym heroes promo/i,
        /team rocket promo/i,
        /fossil promo/i,
        /jungle promo/i,
        /base set promo/i,
        /base set 2 promo/i,
        /base set unlimited promo/i,
        /shadowless promo/i,
        /1st edition promo/i,
        /unlimited promo/i
    ];
    
    for (const pattern of expansionPatterns) {
        const match = titleLower.match(pattern);
        if (match) {
            expansion = match[0];
            console.log(`🎯 [CardTrader] Espansione estratta: ${expansion} con pattern: ${pattern}`);
            break;
        }
    }
    
    // Estrai rarità
    let rarity = null;
    const rarityPatterns = [
        /special illustration rare/i,
        /special-illustration-rare/i,
        /ultra rare/i,
        /full art/i,
        /secret rare/i,
        /illustration rare/i,
        /special rare/i
    ];
    
    for (const pattern of rarityPatterns) {
        const match = titleLower.match(pattern);
        if (match) {
            rarity = match[0];
            break;
        }
    }
    
    const result = {
        pokemonName,
        expansion,
        expansionCode,
        collectorNumber,
        rarity
    };
    
    console.log(`📊 [CardTrader] Info estratte complete:`, result);
    
    return result;
}

// Funzione per cercare nel database
async function searchCardInDatabase(titleInfo, originalTitle = '') {
    try {
        const supabaseClient = window.supabaseClient;
        
        if (!supabaseClient) {
            console.error('❌ [CardTrader] Supabase client non disponibile');
            return [];
        }
        
        console.log('🔍 [CardTrader] Cercando con criteri:', titleInfo);
        
        let allResults = [];
        
        // 1. Cerca nelle carte con il nome Pokemon (senza filtro numero)
        const { data: cards, error: cardsError } = await supabaseClient
            .from('cards')
            .select('*')
            .ilike('name_en', `%${titleInfo.pokemonName}%`)
            .limit(20);
        
        if (!cardsError && cards && cards.length > 0) {
            console.log(`✅ [CardTrader] Trovate ${cards.length} carte con nome Pokemon`);
            allResults.push(...cards.map(card => ({ ...card, source: 'cards' })));
        }
        
        // 2. Ricerca semplice con JOIN come nel test extension
        console.log(`🔍 [CardTrader] Ricerca con JOIN per: ${titleInfo.pokemonName}`);
        
        // Fai una query JOIN tra cards e card_variants (metodo test extension)
        let joinQuery = supabaseClient
            .from('cards')
            .select(`
                *,
                card_variants(*)
            `)
            .ilike('name_en', `%${titleInfo.pokemonName}%`);
        
        // Se abbiamo un'espansione specifica, filtra per quella
        if (titleInfo.expansion || titleInfo.expansionCode) {
            const expansionFilter = titleInfo.expansion || titleInfo.expansionCode;
            joinQuery = joinQuery.or(`expansion_name_en.ilike.%${expansionFilter}%,expansion_code.ilike.%${expansionFilter}%`);
        }
        
        const { data: cardsWithVariants, error: joinError } = await joinQuery.limit(50);
        
        if (!joinError && cardsWithVariants && cardsWithVariants.length > 0) {
            console.log(`✅ [CardTrader] Trovate ${cardsWithVariants.length} carte con JOIN`);
            
            // Processa i risultati del JOIN
            cardsWithVariants.forEach(card => {
                // Aggiungi la carta principale
                allResults.push({ ...card, source: 'cards_join' });
                
                // Aggiungi le varianti se esistono
                if (card.card_variants && card.card_variants.length > 0) {
                    card.card_variants.forEach(variant => {
                        const combinedVariant = {
                            ...variant,
                            name_en: card.name_en,
                            pokemon_name: card.name_en,
                            expansion_name_en: card.expansion_name_en,
                            expansion_name: card.expansion_name_en,
                            expansion_code: card.expansion_code,
                            source: 'card_variants_join'
                        };
                        allResults.push(combinedVariant);
                    });
                }
            });
        }
        

        
        // 3. Ricerca avanzata nelle carte per espansione
        if (titleInfo.expansion || titleInfo.expansionCode) {
            console.log(`🔍 [CardTrader] Cercando carte per espansione: ${titleInfo.expansion || titleInfo.expansionCode}`);
            
            const expansionLower = titleInfo.expansion ? titleInfo.expansion.toLowerCase() : '';
            const expansionCode = titleInfo.expansionCode || '';
            
            // Cerca nel nome dell'espansione e codice
            let expansionNameCards = [];
            let expansionNameError = null;
            
            // Query separata per evitare errori OR
            if (expansionLower) {
                const { data: cards1, error: error1 } = await supabaseClient
                    .from('cards')
                    .select('*')
                    .ilike('name_en', `%${titleInfo.pokemonName}%`)
                    .ilike('expansion_name_en', `%${expansionLower}%`)
                    .limit(10);
                
                if (!error1 && cards1) {
                    expansionNameCards.push(...cards1);
                }
                expansionNameError = error1;
            }
            
            if (expansionCode) {
                const { data: cards2, error: error2 } = await supabaseClient
                    .from('cards')
                    .select('*')
                    .ilike('name_en', `%${titleInfo.pokemonName}%`)
                    .ilike('expansion_code', `%${expansionCode}%`)
                    .limit(10);
                
                if (!error2 && cards2) {
                    expansionNameCards.push(...cards2);
                }
                if (!expansionNameError) expansionNameError = error2;
            }
            
            if (!expansionNameError && expansionNameCards && expansionNameCards.length > 0) {
                console.log(`✅ [CardTrader] Trovate ${expansionNameCards.length} carte per nome espansione`);
                expansionNameCards.forEach(card => {
                    // Evita duplicati
                    const existing = allResults.find(r => r.blueprint_id === card.blueprint_id);
                    if (!existing) {
                        allResults.push({ 
                            ...card, 
                            source: 'cards', 
                            expansion_match: true,
                            expansion_name_match: true
                        });
                    }
                });
            }
        }
        
        // 4. Ricerca avanzata nell'image_url per match precisi (RIMOSSA - causa errori 400)
        console.log(`🔍 [CardTrader] Ricerca nell'image_url disabilitata per evitare errori 400`);
        


        // 5. Sistema di punteggi migliorato
        const scoredResults = allResults.map(result => {
            let score = 0;
            
            // Punteggio base per nome Pokemon (1000 punti)
            const name = (result.name_en || result.pokemon_name || '').toLowerCase();
            if (name.includes(titleInfo.pokemonName)) {
                score += 1000;
                console.log(`🎯 [CardTrader] Match nome: ${name} -> +1000 punti`);
            }
            
            // Punteggio per numero collezionista (PRIORITÀ ASSOLUTA - 2500 punti per match esatto)
            if (titleInfo.collectorNumber && result.collector_number) {
                if (result.collector_number === titleInfo.collectorNumber) {
                    score += 2500;
                    console.log(`🎯 [CardTrader] Match numero esatto: ${result.collector_number} -> +2500 punti (PRIORITÀ ASSOLUTA)`);
                } else if (result.exact_number_match) {
                    score += 2500;
                    console.log(`🎯 [CardTrader] Match numero esatto (variante): ${result.collector_number} -> +2500 punti (PRIORITÀ ASSOLUTA)`);
                } else if (result.collector_number.toString().includes(titleInfo.collectorNumber) || 
                          titleInfo.collectorNumber.includes(result.collector_number.toString())) {
                    score += 800;
                    console.log(`🎯 [CardTrader] Match numero parziale: ${result.collector_number} -> +800 punti`);
                }
            }
            
            // Punteggio per espansione (PRIORITÀ ALTA - 1500 punti per match esatto)
            if (titleInfo.expansion || titleInfo.expansionCode) {
                const expansion = (result.expansion_name_en || result.expansion_name || '').toLowerCase();
                const expansionCode = (result.expansion_code || '').toUpperCase();
                const searchExpansion = titleInfo.expansion ? titleInfo.expansion.toLowerCase() : '';
                const searchExpansionCode = titleInfo.expansionCode || '';
                // Match per codice di espansione (PRIORITÀ ASSOLUTA)
                if (searchExpansionCode && expansionCode === searchExpansionCode) {
                    score += 3000;
                    console.log(`🎯 [CardTrader] Match codice espansione esatto: ${expansionCode} -> +3000 punti (PRIORITÀ ASSOLUTA)`);
                } else if (searchExpansionCode && expansionCode.includes(searchExpansionCode) || searchExpansionCode.includes(expansionCode)) {
                    score += 2000;
                    console.log(`🎯 [CardTrader] Match codice espansione parziale: ${expansionCode} -> +2000 punti (PRIORITÀ ALTA)`);
                } else if (expansion.includes(searchExpansion) || searchExpansion.includes(expansion)) {
                    score += 1000;
                    console.log(`🎯 [CardTrader] Match espansione: ${expansion} -> +1000 punti (PRIORITÀ ALTA)`);
                } else if (result.expansion_url_match) {
                    score += 800;
                    console.log(`🎯 [CardTrader] Match espansione nell'URL: ${expansion} -> +800 punti`);
                } else if (result.expansion_name_match) {
                    score += 600;
                    console.log(`🎯 [CardTrader] Match nome espansione: ${expansion} -> +600 punti`);
                } else if (result.expansion_match) {
                    score += 400;
                    console.log(`🎯 [CardTrader] Match espansione parziale: ${expansion} -> +400 punti`);
                }
                // Punti extra se expansionCode è presente in image_url
                if (searchExpansionCode && result.image_url && result.image_url.toUpperCase().includes(searchExpansionCode)) {
                    score += 500;
                    console.log(`🎯 [CardTrader] Codice espansione ${searchExpansionCode} presente in image_url -> +500 punti EXTRA`);
                }
            }
            
            // Bonus per image_url (100 punti)
            if (result.image_url) {
                score += 100;
                console.log(`🎯 [CardTrader] Ha image_url -> +100 punti`);
            }
            
            // Bonus per source 'card_variants' (50 punti)
            if (result.source === 'card_variants') {
                score += 50;
                console.log(`🎯 [CardTrader] Variante -> +50 punti`);
            }
            
            // Bonus per match nell'image_url (RIMOSSO - causa errori 400)
            // if (result.image_url_match) {
            //     score += 800;
            //     console.log(`🎯 [CardTrader] Match nell'image_url (pattern: ${result.matched_pattern}) -> +800 punti (PRIORITÀ ALTA)`);
            // }
            
            // Bonus per carte "ex" (500 punti) - AUMENTATO per Leafeon ex Terastal
            const cardName = (result.name_en || result.pokemon_name || '').toLowerCase();
            if (cardName.includes(' ex') || cardName.endsWith('ex')) {
                score += 500;
                console.log(`🎯 [CardTrader] Carta EX rilevata: ${cardName} -> +500 punti`);
            }
            
            // Bonus per rarità (200 punti) - RIMOSSO per evitare errori 400
            // if (titleInfo.rarity) {
            //     const imageUrl = (result.image_url || '').toLowerCase();
            //     const rarityLower = titleInfo.rarity.toLowerCase();
            //     if (imageUrl.includes(rarityLower) || imageUrl.includes(rarityLower.replace(/\s+/g, '-'))) {
            //         score += 200;
            //         console.log(`🎯 [CardTrader] Rarità ${titleInfo.rarity} nell'image_url -> +200 punti`);
            //     }
            // }
            
            console.log(`📊 [CardTrader] ${result.name_en || result.pokemon_name} - Punteggio totale: ${score}`);
            
            return { result, score };
        });
        
        // Ordina per punteggio (decrescente)
        scoredResults.sort((a, b) => b.score - a.score);
        
        // Filtra solo risultati con punteggio > 0 e prendi i migliori
        let filteredResults = scoredResults
            .filter(item => item.score > 0)
            .map(item => item.result)
            .slice(0, 10);
        
        // Filtro finale: se abbiamo un'espansione, verifica che sia presente nel titolo originale (MIGLIORATO)
        if (originalTitle && (titleInfo.expansion || titleInfo.expansionCode)) {
            const originalTitleLower = originalTitle.toLowerCase();
            const expansionToCheck = titleInfo.expansion ? titleInfo.expansion.toLowerCase() : '';
            const expansionCodeToCheck = titleInfo.expansionCode ? titleInfo.expansionCode.toLowerCase() : '';
            
            // Filtra solo se abbiamo risultati con espansione specifica
            const resultsWithExpansion = filteredResults.filter(result => {
                const resultExpansion = (result.expansion_name_en || result.expansion_name || '').toLowerCase();
                const resultExpansionCode = (result.expansion_code || '').toLowerCase();
                
                return resultExpansion || resultExpansionCode;
            });
            
            if (resultsWithExpansion.length > 0) {
                filteredResults = resultsWithExpansion.filter(result => {
                    const resultExpansion = (result.expansion_name_en || result.expansion_name || '').toLowerCase();
                    const resultExpansionCode = (result.expansion_code || '').toLowerCase();
                    
                    // Verifica se l'espansione o il codice sono presenti nel titolo originale
                    const expansionInTitle = expansionToCheck && originalTitleLower.includes(expansionToCheck);
                    const codeInTitle = expansionCodeToCheck && originalTitleLower.includes(expansionCodeToCheck);
                    
                    // Se abbiamo un codice di espansione specifico nel titolo, verifica match intelligente
                    if (codeInTitle && resultExpansionCode) {
                        // Match esatto (priorità massima)
                        if (resultExpansionCode === expansionCodeToCheck) {
                            return true;
                        }
                        
                        // Match per codici specifici che devono essere esatti (SL7, XY123, sv8a, etc.)
                        const exactMatchCodes = ['sl', 'xy', 'swsh', 'sm', 'bw', 'sv'];
                        const needsExactMatch = exactMatchCodes.some(code => 
                            expansionCodeToCheck.startsWith(code) && expansionCodeToCheck.length <= 6
                        );
                        
                        if (needsExactMatch) {
                            console.log(`🔍 [CardTrader] Filtro: codice specifico ${resultExpansionCode} non matcha esatto ${expansionCodeToCheck}`);
                            return false;
                        }
                        
                        // Match per codici generici (SAR, SV, etc.) - più permissivo
                        const genericCodes = ['sar', 'sv'];
                        const isGenericCode = genericCodes.some(code => 
                            expansionCodeToCheck.startsWith(code)
                        );
                        
                        if (isGenericCode) {
                            // Per codici generici, permette match parziale
                            const hasPartialMatch = genericCodes.some(code => 
                                originalTitleLower.includes(code) && resultExpansionCode.includes(code)
                            );
                            
                            if (hasPartialMatch) {
                                return true;
                            }
                        }
                        
                        console.log(`🔍 [CardTrader] Filtro: codice ${resultExpansionCode} non matcha ${expansionCodeToCheck}`);
                        return false;
                    }
                    
                    // Se abbiamo un'espansione nel titolo, verifica match più flessibile
                    if (expansionInTitle && resultExpansion) {
                        // Match diretto
                        if (resultExpansion.includes(expansionToCheck) || expansionToCheck.includes(resultExpansion)) {
                            return true;
                        }
                        
                        // Match per parole chiave comuni
                        const expansionKeywords = ['festival', 'terastal', 'ex', 'gx', 'v', 'vmax', 'vstar', 'sv'];
                        const hasKeyword = expansionKeywords.some(keyword => 
                            resultExpansion.includes(keyword) && originalTitleLower.includes(keyword)
                        );
                        
                        if (hasKeyword) {
                            return true;
                        }
                        
                        // Match per codici di espansione comuni nel titolo
                        const commonCodes = ['sar', 'sv', 'swsh', 'sm', 'xy', 'bw', 'sv8a'];
                        const hasCommonCode = commonCodes.some(code => 
                            originalTitleLower.includes(code) && resultExpansionCode.includes(code)
                        );
                        
                        if (hasCommonCode) {
                            return true;
                        }
                        
                        console.log(`🔍 [CardTrader] Filtro: espansione ${resultExpansion} non matcha ${expansionToCheck}`);
                        return false;
                    }
                    
                    return true;
                });
            }
            
            console.log(`🔍 [CardTrader] Filtro finale espansione: ${filteredResults.length} risultati rimasti`);
        }
        
        // Se non abbiamo risultati dopo il filtro, prova a essere più permissivo
        if (filteredResults.length === 0 && originalTitle) {
            console.log(`🔍 [CardTrader] Nessun risultato dopo filtro, ripristino risultati originali`);
            filteredResults = scoredResults
                .filter(item => item.score > 0)
                .map(item => item.result)
                .slice(0, 5); // Prendi solo i primi 5 per sicurezza
        }
        
        console.log(`📊 [CardTrader] Risultati finali: ${filteredResults.length} carte con punteggio > 0`);
        
        return filteredResults;
            
    } catch (error) {
        console.error('❌ [CardTrader] Errore nella ricerca database:', error);
        return [];
    }
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