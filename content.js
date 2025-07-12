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
        } else {
            console.warn('⚠️ Funzione initializeSupabase non disponibile');
        }
        
        // Avvia l'osservatore per le nuove inserzioni
        startObserver();
        
        console.log('✅ Estensione inizializzata correttamente');
        
    } catch (error) {
        console.error('❌ Errore nell\'inizializzazione:', error);
        // Continua comunque l'esecuzione
        startObserver();
    }
}

// Avvia l'osservatore per rilevare nuove inserzioni
function startObserver() {
    try {
        console.log('🔍 [CardTrader] Avvio osservatore...');
        
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
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Processa anche le inserzioni già presenti
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
    try {
        if (listingElement.hasAttribute('data-pokemon-linker-processed')) {
            return;
        }
        
        // Marca come processata per evitare duplicati
        listingElement.setAttribute('data-pokemon-linker-processed', 'true');
        
        // Aggiorna statistiche
        if (typeof updateStats === 'function') {
            updateStats('cardsProcessed', 1);
        }
        
        // Estrai il titolo
        if (typeof extractTitleFromListing !== 'function') {
            console.warn('⚠️ [CardTrader] Funzione extractTitleFromListing non disponibile');
            return;
        }
        
        const title = extractTitleFromListing(listingElement);
        
        if (!title) {
            return;
        }
        
        // Estrai informazioni dal titolo
        if (typeof extractTitleInfo !== 'function') {
            console.warn('⚠️ [CardTrader] Funzione extractTitleInfo non disponibile');
            return;
        }
        
        const titleInfo = extractTitleInfo(title);
        
        if (!titleInfo.pokemonName) {
            return;
        }
        
        console.log('🔍 Processando inserzione:', titleInfo);
        
        // Cerca nel database
        if (typeof searchCardInDatabase !== 'function') {
            console.warn('⚠️ [CardTrader] Funzione searchCardInDatabase non disponibile');
            return;
        }
        
        const results = await searchCardInDatabase(titleInfo, title);
        
        if (results.length > 0) {
            // Aggiungi i link
            if (typeof addCardTraderLinks === 'function') {
                addCardTraderLinks(listingElement, results, titleInfo);
            }
            
            // Aggiorna statistiche
            if (typeof updateStats === 'function') {
                updateStats('linksGenerated', results.length);
            }
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
        'lapras', 'ditto', 'porygon', 'eevee', 'vaporeon', 'jolteon', 'flareon', 'omanyte', 'omastar', 'kabuto', 'kabutops',
        'aerodactyl', 'snorlax', 'articuno', 'zapdos', 'moltres', 'dratini', 'dragonair', 'dragonite',
        'mewtwo', 'mew',
        
        // Generazione 2
        'chikorita', 'bayleef', 'meganium', 'cyndaquil', 'quilava', 'typhlosion', 'totodile', 'croconaw', 'feraligatr',
        'sentret', 'furret', 'hoothoot', 'noctowl', 'ledyba', 'ledian', 'spinarak', 'ariados', 'crobat',
        'chinchou', 'lanturn', 'pichu', 'cleffa', 'igglybuff', 'togepi', 'togetic', 'natu', 'xatu', 'yanma',
        'mareep', 'flaaffy', 'ampharos', 'bellossom', 'marill', 'azumarill', 'sudowoodo', 'politoed',
        'hoppip', 'skiploom', 'jumpluff', 'aipom', 'sunkern', 'sunflora', 'yanmega', 'wooper', 'quagsire',
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
    let trainerName = null; // Aggiungi variabile per il nome dell'allenatore
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
        const possessiveMatch = titleLower.match(new RegExp(`(\\w+)'s\\s+${pokemonLower}\\b`, 'i'));
        if (possessiveMatch) {
            trainerName = possessiveMatch[1].toLowerCase();
            pokemonName = pokemon.toLowerCase();
            console.log('✅ [CardTrader] Pokemon trovato (con possessivo):', pokemonName, 'allenatore:', trainerName, 'match:', possessiveMatch[0]);
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
    
    // Se non abbiamo trovato un Pokemon, prova a cercare pattern specifici per allenatori
    if (!pokemonName) {
        // Lista di allenatori noti e i loro Pokemon
        // Dizionario completo dei nomi degli allenatori
        const trainerNames = {
            // Allenatori di palestra Kanto
            'erika': ['erika', 'erika\'s'],
            'giovanni': ['giovanni', 'giovanni\'s'],
            'misty': ['misty', 'misty\'s'],
            'brock': ['brock', 'brock\'s'],
            'lt. surge': ['lt. surge', 'lt surge', 'lieutenant surge', 'surge', 'surge\'s'],
            'sabrina': ['sabrina', 'sabrina\'s'],
            'koga': ['koga', 'koga\'s'],
            'blaine': ['blaine', 'blaine\'s'],
            
            // Elite Four e Campione
            'bruno': ['bruno', 'bruno\'s'],
            'agatha': ['agatha', 'agatha\'s'],
            'lorelei': ['lorelei', 'lorelei\'s'],
            'lance': ['lance', 'lance\'s'],
            'blue': ['blue', 'blue\'s', 'gary', 'gary\'s'],
            'red': ['red', 'red\'s'],
            
            // Allenatori di palestra Johto
            'falkner': ['falkner', 'falkner\'s'],
            'bugsy': ['bugsy', 'bugs\'s'],
            'whitney': ['whitney', 'whitney\'s'],
            'morty': ['morty', 'morty\'s'],
            'chuck': ['chuck', 'chuck\'s'],
            'jasmine': ['jasmine', 'jasmine\'s'],
            'pryce': ['pryce', 'pryce\'s'],
            'clair': ['clair', 'clair\'s'],
            
            // Elite Four Johto
            'will': ['will', 'will\'s'],
            'karen': ['karen', 'karen\'s'],
            
            // Allenatori di palestra Hoenn
            'roxanne': ['roxanne', 'roxanne\'s'],
            'brawly': ['brawly', 'brawly\'s'],
            'wattson': ['wattson', 'wattson\'s'],
            'flannery': ['flannery', 'flannery\'s'],
            'norman': ['norman', 'norman\'s'],
            'winona': ['winona', 'winona\'s'],
            'tate': ['tate', 'tate\'s'],
            'liza': ['liza', 'liza\'s'],
            'wallace': ['wallace', 'wallace\'s'],
            'juan': ['juan', 'juan\'s'],
            
            // Elite Four Hoenn
            'sidney': ['sidney', 'sidney\'s'],
            'phoebe': ['phoebe', 'phoebe\'s'],
            'glacia': ['glacia', 'glacia\'s'],
            'drake': ['drake', 'drake\'s'],
            'steven': ['steven', 'steven\'s'],
            
            // Allenatori di palestra Sinnoh
            'roark': ['roark', 'roark\'s'],
            'gardenia': ['gardenia', 'gardenia\'s'],
            'maylene': ['maylene', 'maylene\'s'],
            'crasher wake': ['crasher wake', 'crasher wake\'s', 'wake', 'wake\'s'],
            'fantina': ['fantina', 'fantina\'s'],
            'byron': ['byron', 'byron\'s'],
            'candice': ['candice', 'candice\'s'],
            'volkner': ['volkner', 'volkner\'s'],
            
            // Elite Four Sinnoh
            'aaron': ['aaron', 'aaron\'s'],
            'bertha': ['bertha', 'bertha\'s'],
            'flint': ['flint', 'flint\'s'],
            'lucian': ['lucian', 'lucian\'s'],
            'cynthia': ['cynthia', 'cynthia\'s'],
            
            // Allenatori di palestra Unova
            'cilan': ['cilan', 'cilan\'s'],
            'chili': ['chili', 'chili\'s'],
            'cress': ['cress', 'cress\'s'],
            'lenora': ['lenora', 'lenora\'s'],
            'burgh': ['burgh', 'burgh\'s'],
            'elesa': ['elesa', 'elesa\'s'],
            'clay': ['clay', 'clay\'s'],
            'skyla': ['skyla', 'skyla\'s'],
            'brycen': ['brycen', 'brycen\'s'],
            'drayden': ['drayden', 'drayden\'s'],
            'iris': ['iris', 'iris\'s'],
            
            // Elite Four Unova
            'shauntal': ['shauntal', 'shauntal\'s'],
            'grimsley': ['grimsley', 'grimsley\'s'],
            'caitlin': ['caitlin', 'caitlin\'s'],
            'marshall': ['marshall', 'marshall\'s'],
            'alder': ['alder', 'alder\'s'],
            
            // Allenatori di palestra Kalos
            'viola': ['viola', 'viola\'s'],
            'grant': ['grant', 'grant\'s'],
            'korrina': ['korrina', 'korrina\'s'],
            'ramos': ['ramos', 'ramos\'s'],
            'clemont': ['clemont', 'clemont\'s'],
            'valerie': ['valerie', 'valerie\'s'],
            'olympia': ['olympia', 'olympia\'s'],
            'wulfric': ['wulfric', 'wulfric\'s'],
            
            // Elite Four Kalos
            'malva': ['malva', 'malva\'s'],
            'siebold': ['siebold', 'siebold\'s'],
            'wikstrom': ['wikstrom', 'wikstrom\'s'],
            'drasna': ['drasna', 'drasna\'s'],
            'diantha': ['diantha', 'diantha\'s'],
            
            // Allenatori di palestra Alola
            'hala': ['hala', 'hala\'s'],
            'lana': ['lana', 'lana\'s'],
            'kiawe': ['kiawe', 'kiawe\'s'],
            'mallow': ['mallow', 'mallow\'s'],
            'sophocles': ['sophocles', 'sophocles\'s'],
            'mina': ['mina', 'mina\'s'],
            'olivia': ['olivia', 'olivia\'s'],
            'nanu': ['nanu', 'nanu\'s'],
            'hapu': ['hapu', 'hapu\'s'],
            'molayne': ['molayne', 'molayne\'s'],
            'acerola': ['acerola', 'acerola\'s'],
            'kahili': ['kahili', 'kahili\'s'],
            
            // Elite Four Alola
            'hala elite': ['hala elite', 'hala elite\'s'],
            'molayne elite': ['molayne elite', 'molayne elite\'s'],
            'olivia elite': ['olivia elite', 'olivia elite\'s'],
            'acerola elite': ['acerola elite', 'acerola elite\'s'],
            'kukui': ['kukui', 'kukui\'s'],
            
            // Allenatori di palestra Galar
            'milo': ['milo', 'milo\'s'],
            'nessa': ['nessa', 'nessa\'s'],
            'kabu': ['kabu', 'kabu\'s'],
            'bea': ['bea', 'bea\'s'],
            'allister': ['allister', 'allister\'s'],
            'opal': ['opal', 'opal\'s'],
            'bede': ['bede', 'bede\'s'],
            'gordie': ['gordie', 'gordie\'s'],
            'melony': ['melony', 'melony\'s'],
            'piers': ['piers', 'piers\'s'],
            'marnie': ['marnie', 'marnie\'s'],
            'raihan': ['raihan', 'raihan\'s'],
            
            // Elite Four Galar
            'leon': ['leon', 'leon\'s'],
            'hop': ['hop', 'hop\'s'],
            
            // Allenatori di palestra Paldea
            'katy': ['katy', 'katy\'s'],
            'brassius': ['brassius', 'brassius\'s'],
            'iono': ['iono', 'iono\'s'],
            'kofu': ['kofu', 'kofu\'s'],
            'larry': ['larry', 'larry\'s'],
            'ryme': ['ryme', 'ryme\'s'],
            'tulip': ['tulip', 'tulip\'s'],
            'grusha': ['grusha', 'grusha\'s'],
            'geeta': ['geeta', 'geeta\'s'],
            'nemona': ['nemona', 'nemona\'s'],
            'penny': ['penny', 'penny\'s'],
            'arven': ['arven', 'arven\'s'],
            
            // Allenatori speciali
            'cyrus': ['cyrus', 'cyrus\'s'],
            'lysandre': ['lysandre', 'lysandre\'s'],
            'guzma': ['guzma', 'guzma\'s'],
            'lusamine': ['lusamine', 'lusamine\'s'],
            'rose': ['rose', 'rose\'s'],
            'oleana': ['oleana', 'oleana\'s'],
            'volo': ['volo', 'volo\'s'],
            'cogita': ['cogita', 'cogita\'s'],
            'sada': ['sada', 'sada\'s'],
            'turo': ['turo', 'turo\'s'],
            'clavell': ['clavell', 'clavell\'s'],
            'jacq': ['jacq', 'jacq\'s'],
            'dirge': ['dirge', 'dirge\'s'],
            'saguaro': ['saguaro', 'saguaro\'s'],
            'salvatore': ['salvatore', 'salvatore\'s'],
            'dendra': ['dendra', 'dendra\'s'],
            'hassel': ['hassel', 'hassel\'s']
        };

        const trainerPokemon = {
            'erika': ['dragonair', 'vileplume', 'victreebel', 'tangela'],
            'giovanni': ['nidoking', 'nidoqueen', 'rhydon', 'kangaskhan', 'mewtwo'],
            'misty': ['starmie', 'golduck', 'seaking', 'gyarados'],
            'brock': ['onix', 'rhydon', 'golem', 'kabutops'],
            'lt. surge': ['raichu', 'electabuzz', 'magneton'],
            'sabrina': ['alakazam', 'kadabra', 'mr. mime', 'venomoth'],
            'koga': ['weezing', 'muk', 'arbok', 'golbat'],
            'blaine': ['arcanine', 'rapidash', 'magmar', 'ninetales'],
            'bruno': ['hitmonchan', 'hitmonlee', 'onix', 'machamp'],
            'agatha': ['gengar', 'haunter', 'arbok', 'golbat'],
            'lorelei': ['dewgong', 'cloyster', 'slowbro', 'jynx'],
            'lance': ['dragonite', 'gyarados', 'aerodactyl', 'charizard'],
            'blue': ['pidgeot', 'alakazam', 'rhydon', 'gyarados', 'exeggutor', 'arcanine'],
            'red': ['pikachu', 'charizard', 'venusaur', 'blastoise', 'snorlax', 'lapras']
        };
        
        // Cerca pattern di allenatori nel titolo usando il dizionario completo
        for (const [trainerKey, trainerVariants] of Object.entries(trainerNames)) {
            for (const trainerVariant of trainerVariants) {
                if (titleLower.includes(trainerVariant.toLowerCase())) {
                    console.log('🔍 [CardTrader] Allenatore trovato:', trainerVariant, 'chiave:', trainerKey);
                    
                    // Cerca i Pokemon di questo allenatore nel dizionario trainerPokemon
                    if (trainerPokemon[trainerKey]) {
                        for (const pokemon of trainerPokemon[trainerKey]) {
                            if (titleLower.includes(pokemon.toLowerCase())) {
                                trainerName = trainerKey.toLowerCase();
                                pokemonName = pokemon.toLowerCase();
                                console.log('✅ [CardTrader] Pokemon di allenatore trovato:', pokemonName, 'allenatore:', trainerName);
                                break;
                            }
                        }
                    } else {
                        // Se l'allenatore non è nel dizionario trainerPokemon, cerca qualsiasi Pokemon nel titolo
                        console.log('🔍 [CardTrader] Allenatore trovato ma non nel dizionario Pokemon, cercando qualsiasi Pokemon');
                        // Qui potresti aggiungere una ricerca generica per Pokemon
                    }
                    
                    if (pokemonName) break;
                }
            }
            if (pokemonName) break;
        }
    }
    
    if (!pokemonName) {
        console.log('❌ [CardTrader] Nessun Pokemon trovato nella lista. Titolo completo:', title);
    }
    
    // Estrai numero collezionista (formato X/Y o solo numero)
    let collectorNumber = null;
    
    // Cerca pattern come "tg02/tg30" (lettere + numeri / lettere + numeri)
    const tgPattern = titleLower.match(/([a-z]{1,3}\d+)\/([a-z]{1,3}\d+)/i);
    if (tgPattern) {
        collectorNumber = tgPattern[1].toUpperCase();
        console.log(`🎯 [CardTrader] Numero collezionista estratto (TG X/Y): ${collectorNumber} da ${tgPattern[0]}`);
    } else {
        // Cerca formato X/Y standard (numeri)
        const numberMatch = titleLower.match(/(\d+)\/(\d+)/);
        if (numberMatch) {
            collectorNumber = numberMatch[1];
            console.log(`🎯 [CardTrader] Numero collezionista estratto (X/Y): ${collectorNumber} da ${numberMatch[0]}`);
        } else {
            // Cerca un numero singolo dopo "n." o "numero" o "XY" o simili
            const singleNumberMatch = titleLower.match(/(?:n\.|numero|#|xy|swsh|sv|sm|svp|sl|tg)\s*(\d+)/i);
            if (singleNumberMatch) {
                collectorNumber = singleNumberMatch[1];
                console.log(`🎯 [CardTrader] Numero collezionista estratto (singolo): ${collectorNumber} da ${singleNumberMatch[0]}`);
            } else {
                // Cerca un numero singolo isolato (per casi come "148", "200", "074")
                // Migliorato per gestire meglio i numeri isolati
                const isolatedNumberMatch = titleLower.match(/\b(\d{1,4})\b/);
                if (isolatedNumberMatch) {
                    // Verifica che non sia parte di un formato X/Y già processato
                    const number = isolatedNumberMatch[1];
                    const context = titleLower.substring(Math.max(0, isolatedNumberMatch.index - 10), 
                                                       Math.min(titleLower.length, isolatedNumberMatch.index + 15));
                    
                    // Se il numero è circondato da parole che suggeriscono un numero collezionista
                    if (context.includes('n.') || context.includes('numero') || context.includes('gym') || 
                        context.includes('heroes') || context.includes('challenge') || context.includes('neo') ||
                        context.includes('promo') || context.includes('svp') || context.includes('sl') ||
                        context.includes('tg') || context.includes('sit')) {
                        collectorNumber = number;
                        console.log(`🎯 [CardTrader] Numero collezionista estratto (isolato con contesto): ${collectorNumber} da ${isolatedNumberMatch[0]} (contesto: ${context})`);
                    }
                }
            }
        }
    }
    
    // Estrai codice di espansione (es: SL7, XY123, SAR, sv8a, SVP, SIT=Silver Tempest, etc.)
    let expansionCode = null;
    
    // Cerca pattern come "SAR sv8a" o "sv8a"
    const sarPattern = titleLower.match(/\b(sar\s+sv\d+[a-z]*)\b/i);
    if (sarPattern) {
        expansionCode = sarPattern[1].toUpperCase();
        console.log(`🎯 [CardTrader] Codice espansione SAR trovato: ${expansionCode}`);
    } else {
        // Cerca pattern specifici per Terastal Festival
        const terastalPattern = titleLower.match(/\b(sv\d+[a-z]*)\b/i);
        if (terastalPattern) {
            expansionCode = terastalPattern[1].toUpperCase();
            console.log(`🎯 [CardTrader] Codice espansione Terastal trovato: ${expansionCode}`);
        } else {
            // Cerca pattern per promo come SVP, SL, SIT, etc.
            const promoPattern = titleLower.match(/\b(svp|sl\d*|xy\d*|swsh\d*|sm\d*|sit)\b/i);
            if (promoPattern) {
                expansionCode = promoPattern[1].toUpperCase();
                if (expansionCode === 'SIT') {
                    console.log(`🎯 [CardTrader] Codice espansione SIT trovato (Silver Tempest): ${expansionCode}`);
                } else {
                    console.log(`🎯 [CardTrader] Codice espansione Promo trovato: ${expansionCode}`);
                }
            } else {
                // Cerca pattern generico come SL7, XY123, SIT, etc.
                const expansionCodeMatch = titleLower.match(/\b([a-z]{1,3}\d*[a-z]*)\b/i);
                if (expansionCodeMatch) {
                    expansionCode = expansionCodeMatch[1].toUpperCase();
                    console.log(`🎯 [CardTrader] Codice espansione generico trovato: ${expansionCode}`);
                }
            }
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
        
        // Promo e Black Star Promos
        /black star promos/i,
        /black star promo/i,
        /promo/i,
        /svp/i,
        /sl\d*/i,
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
        /silver tempest/i,
        /sit/i,
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
        /silver tempest promo/i,
        /sit promo/i,
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
        trainerName, // Aggiungi il nome dell'allenatore
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
        console.log('🔍 [CardTrader] Titolo originale:', originalTitle);
        console.log('🔍 [CardTrader] TrainerName:', titleInfo.trainerName, 'Titolo contiene Erika\'s:', originalTitle.toLowerCase().includes("erika's"));
        
        let allResults = [];
        
        // 1. Cerca nelle carte con il nome Pokemon (senza filtro numero) - NO LIMIT
        const { data: cards, error: cardsError } = await supabaseClient
            .from('cards')
            .select('*')
            .ilike('name_en', `%${titleInfo.pokemonName}%`);
        
        if (!cardsError && cards && cards.length > 0) {
            console.log(`✅ [CardTrader] Trovate ${cards.length} carte con nome Pokemon`);
            allResults.push(...cards.map(card => ({ ...card, source: 'cards' })));
        }
        
        // 1.1. Se abbiamo un allenatore, cerca carte specifiche dell'allenatore
        if (titleInfo.trainerName) {
            console.log(`🔍 [CardTrader] Cercando carte dell'allenatore: ${titleInfo.trainerName}`);
            
            // Cerca carte che contengono il nome dell'allenatore
            const { data: trainerCards, error: trainerCardsError } = await supabaseClient
                .from('cards')
                .select('*')
                .or(`name_en.ilike.%${titleInfo.trainerName}%,name_en.ilike.%${titleInfo.pokemonName}%`);
            
            if (!trainerCardsError && trainerCards && trainerCards.length > 0) {
                console.log(`✅ [CardTrader] Trovate ${trainerCards.length} carte dell'allenatore`);
                
                // Filtra solo le carte che contengono sia l'allenatore che il Pokemon
                const filteredTrainerCards = trainerCards.filter(card => {
                    const cardName = (card.name_en || '').toLowerCase();
                    return cardName.includes(titleInfo.trainerName.toLowerCase()) && 
                           cardName.includes(titleInfo.pokemonName.toLowerCase());
                });
                
                if (filteredTrainerCards.length > 0) {
                    console.log(`✅ [CardTrader] Trovate ${filteredTrainerCards.length} carte specifiche dell'allenatore`);
                    allResults.push(...filteredTrainerCards.map(card => ({ 
                        ...card, 
                        source: 'trainer_cards',
                        trainer_match: true
                    })));
                }
            }
            
            // 1.1.1. Ricerca più specifica per il pattern "Allenatore's Pokemon"
            console.log(`🔍 [CardTrader] Ricerca specifica per pattern: ${titleInfo.trainerName}'s ${titleInfo.pokemonName}`);
            
            const { data: specificTrainerCards, error: specificTrainerError } = await supabaseClient
                .from('cards')
                .select('*')
                .ilike('name_en', `%${titleInfo.trainerName}'s ${titleInfo.pokemonName}%`);
            
            if (!specificTrainerError && specificTrainerCards && specificTrainerCards.length > 0) {
                console.log(`✅ [CardTrader] Trovate ${specificTrainerCards.length} carte con pattern esatto dell'allenatore`);
                
                specificTrainerCards.forEach(card => {
                    // Evita duplicati
                    const existing = allResults.find(r => r.blueprint_id === card.blueprint_id);
                    if (!existing) {
                        allResults.push({ 
                            ...card, 
                            source: 'trainer_cards_exact',
                            trainer_match: true,
                            exact_trainer_match: true
                        });
                    }
                });
            }
        }
        
        // 2. Se abbiamo un numero collezionista specifico, cerca le varianti con quel numero
        if (titleInfo.collectorNumber) {
            console.log(`🔍 [CardTrader] Cercando varianti con numero collezionista: ${titleInfo.collectorNumber}`);
            
            // Prima trova le carte del Pokemon
            const { data: pokemonCards, error: pokemonCardsError } = await supabaseClient
                .from('cards')
                .select('blueprint_id, name_en, expansion_name_en, expansion_code')
                .ilike('name_en', `%${titleInfo.pokemonName}%`);
            
            if (!pokemonCardsError && pokemonCards && pokemonCards.length > 0) {
                const blueprintIds = pokemonCards.map(card => card.blueprint_id).filter(id => id);
                
                if (blueprintIds.length > 0) {
                    // Cerca varianti con numero collezionista
                    const { data: variantsWithNumber, error: variantsError } = await supabaseClient
                        .from('card_variants')
                        .select('*')
                        .in('blueprint_id', blueprintIds)
                        .or(`collector_number.eq.${titleInfo.collectorNumber},collector_number.ilike.%${titleInfo.collectorNumber}%`);
                    
                    if (!variantsError && variantsWithNumber && variantsWithNumber.length > 0) {
                        console.log(`✅ [CardTrader] Trovate ${variantsWithNumber.length} varianti con numero ${titleInfo.collectorNumber}`);
                        
                        // Combina con i dati delle carte
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
        
        // 2.1. Se abbiamo un allenatore e un numero, cerca varianti specifiche dell'allenatore
        if (titleInfo.trainerName && titleInfo.collectorNumber) {
            console.log(`🔍 [CardTrader] Cercando varianti dell'allenatore con numero: ${titleInfo.trainerName} ${titleInfo.collectorNumber}`);
            
            // Cerca carte dell'allenatore
            const { data: trainerCards, error: trainerCardsError } = await supabaseClient
                .from('cards')
                .select('blueprint_id, name_en, expansion_name_en, expansion_code')
                .or(`name_en.ilike.%${titleInfo.trainerName}%,name_en.ilike.%${titleInfo.pokemonName}%`);
            
            if (!trainerCardsError && trainerCards && trainerCards.length > 0) {
                // Filtra carte che contengono sia l'allenatore che il Pokemon
                const filteredTrainerCards = trainerCards.filter(card => {
                    const cardName = (card.name_en || '').toLowerCase();
                    return cardName.includes(titleInfo.trainerName.toLowerCase()) && 
                           cardName.includes(titleInfo.pokemonName.toLowerCase());
                });
                
                if (filteredTrainerCards.length > 0) {
                    const trainerBlueprintIds = filteredTrainerCards.map(card => card.blueprint_id).filter(id => id);
                    
                    // Cerca varianti con numero collezionista
                    const { data: trainerVariants, error: trainerVariantsError } = await supabaseClient
                        .from('card_variants')
                        .select('*')
                        .in('blueprint_id', trainerBlueprintIds)
                        .eq('collector_number', titleInfo.collectorNumber);
                    
                    if (!trainerVariantsError && trainerVariants && trainerVariants.length > 0) {
                        console.log(`✅ [CardTrader] Trovate ${trainerVariants.length} varianti dell'allenatore con numero esatto`);
                        
                        // Combina con i dati delle carte
                        trainerVariants.forEach(variant => {
                            const card = filteredTrainerCards.find(c => c.blueprint_id === variant.blueprint_id);
                            if (card) {
                                const combinedResult = {
                                    ...variant,
                                    name_en: card.name_en,
                                    pokemon_name: card.name_en,
                                    expansion_name_en: card.expansion_name_en,
                                    expansion_code: card.expansion_code,
                                    source: 'trainer_variants_exact',
                                    trainer_match: true,
                                    exact_number_match: true
                                };
                                allResults.unshift(combinedResult); // Aggiungi all'inizio per priorità massima
                            }
                        });
                    }
                }
            }
        }
        
        // 3. Se abbiamo un'espansione specifica, cerca carte con quell'espansione
        if (titleInfo.expansion || titleInfo.expansionCode) {
            console.log(`🔍 [CardTrader] Cercando carte per espansione: ${titleInfo.expansion || titleInfo.expansionCode}`);
            
            const expansionFilter = titleInfo.expansion ? titleInfo.expansion.toLowerCase() : '';
            const expansionCode = titleInfo.expansionCode || '';
            
            // Query separata per evitare errori OR
            if (expansionFilter) {
                const { data: cards1, error: error1 } = await supabaseClient
                    .from('cards')
                    .select('*')
                    .ilike('name_en', `%${titleInfo.pokemonName}%`)
                    .ilike('expansion_name_en', `%${expansionFilter}%`);
                
                if (!error1 && cards1) {
                    cards1.forEach(card => {
                        // Evita duplicati
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
            
            if (expansionCode) {
                const { data: cards2, error: error2 } = await supabaseClient
                    .from('cards')
                    .select('*')
                    .ilike('name_en', `%${titleInfo.pokemonName}%`)
                    .ilike('expansion_code', `%${expansionCode}%`);
                
                if (!error2 && cards2) {
                    cards2.forEach(card => {
                        // Evita duplicati
                        const existing = allResults.find(r => r.blueprint_id === card.blueprint_id);
                        if (!existing) {
                            allResults.push({ 
                                ...card, 
                                source: 'cards_expansion_code',
                                expansion_code_match: true
                            });
                        }
                    });
                }
            }
        }
        
        // 3.1. Se il titolo contiene "tg", cerca specificamente carte TG (Trainer Gallery)
        if (originalTitle.toLowerCase().includes('tg')) {
            console.log(`🔍 [CardTrader] Cercando carte TG (Trainer Gallery) per: ${titleInfo.pokemonName}`);
            
            // Cerca carte che contengono "TG" nel nome o nell'image_url
            const { data: tgCards, error: tgCardsError } = await supabaseClient
                .from('cards')
                .select('*')
                .ilike('name_en', `%${titleInfo.pokemonName}%`)
                .or(`name_en.ilike.%tg%,image_url.ilike.%tg%`);
            
            if (!tgCardsError && tgCards && tgCards.length > 0) {
                console.log(`✅ [CardTrader] Trovate ${tgCards.length} carte TG`);
                
                tgCards.forEach(card => {
                    // Evita duplicati
                    const existing = allResults.find(r => r.blueprint_id === card.blueprint_id);
                    if (!existing) {
                        allResults.push({ 
                            ...card, 
                            source: 'tg_cards',
                            tg_match: true
                        });
                    }
                });
            }
        }
        
        // 3.2. Se il titolo contiene "sl", cerca specificamente carte SL (Shining Legends)
        if (originalTitle.toLowerCase().includes('sl')) {
            console.log(`🔍 [CardTrader] Cercando carte SL (Shining Legends) per: ${titleInfo.pokemonName}`);
            
            // Cerca carte che contengono "SL" nel nome o nell'image_url
            const { data: slCards, error: slCardsError } = await supabaseClient
                .from('cards')
                .select('*')
                .ilike('name_en', `%${titleInfo.pokemonName}%`)
                .or(`name_en.ilike.%sl%,image_url.ilike.%sl%`);
            
            if (!slCardsError && slCards && slCards.length > 0) {
                console.log(`✅ [CardTrader] Trovate ${slCards.length} carte SL`);
                
                slCards.forEach(card => {
                    // Evita duplicati
                    const existing = allResults.find(r => r.blueprint_id === card.blueprint_id);
                    if (!existing) {
                        allResults.push({ 
                            ...card, 
                            source: 'sl_cards',
                            sl_match: true
                        });
                    }
                });
            }
        }
        
        // 4. Filtro finale basato su image_url per eliminare dubbi (verrà applicato dopo il punteggio)
        console.log(`🔍 [CardTrader] Filtro image_url verrà applicato dopo il punteggio per eliminare dubbi`);
        
        if (allResults.length === 0) {
            console.log('❌ [CardTrader] Nessuna carta trovata');
            return [];
        }
        
        // 4. Sistema di punteggi semplificato - SOLO FILTRO FINALE SU IMAGE_URL
        console.log(`🔍 [CardTrader] Applicando SOLO filtro finale basato su image_url per eliminare dubbi`);
        
        const finalResults = allResults.map(result => {
            let imageUrlScore = 0;
            let imageUrlMatches = [];
            let nameScore = 0;
            
            // PRIORITÀ ASSOLUTA: Se abbiamo un allenatore, cerca nel nome della carta
            if (titleInfo.trainerName) {
                const cardName = (result.name_en || result.pokemon_name || '').toLowerCase();
                const trainerName = titleInfo.trainerName.toLowerCase();
                
                if (cardName.includes(trainerName)) {
                    nameScore += 100000; // PRIORITÀ MASSIMA per carte con nome allenatore
                    console.log(`🎯 [CardTrader] NOME ALLENATORE TROVATO: ${trainerName} in "${cardName}" -> +100000 punti (PRIORITÀ MASSIMA)`);
                }
            }
            
            // PRIORITÀ MASSIMA: Se il titolo contiene un allenatore, cerca nel nome della carta anche senza trainerName
            if (!titleInfo.trainerName && originalTitle.toLowerCase().includes("erika's")) {
                const cardName = (result.name_en || result.pokemon_name || '').toLowerCase();
                if (cardName.includes('erika')) {
                    nameScore += 100000; // PRIORITÀ MASSIMA per carte con nome allenatore
                    console.log(`🎯 [CardTrader] NOME ALLENATORE TROVATO NEL TITOLO: erika in "${cardName}" -> +100000 punti (PRIORITÀ MASSIMA)`);
                }
            }
            
            // PRIORITÀ ALTA: Se il titolo contiene "ex" o "shiny", cerca nel nome della carta
            const titleLower = originalTitle.toLowerCase();
            const cardName = (result.name_en || result.pokemon_name || '').toLowerCase();
            
            if (titleLower.includes('ex') && cardName.includes('ex')) {
                nameScore += 5000; // Bonus per match "ex"
                console.log(`🎯 [CardTrader] MATCH EX TROVATO in "${cardName}" -> +5000 punti`);
            }
            
            if (titleLower.includes('shiny') && cardName.includes('shiny')) {
                nameScore += 5000; // Bonus per match "shiny"
                console.log(`🎯 [CardTrader] MATCH SHINY TROVATO in "${cardName}" -> +5000 punti`);
            }
            
            if (titleLower.includes('promo') && cardName.includes('promo')) {
                nameScore += 3000; // Bonus per match "promo"
                console.log(`🎯 [CardTrader] MATCH PROMO TROVATO in "${cardName}" -> +3000 punti`);
            }
            
            // Bonus per TG (Trainer Gallery) cards
            if (titleLower.includes('tg') && (cardName.includes('tg') || (result.image_url && result.image_url.toLowerCase().includes('tg')))) {
                nameScore += 4000; // Bonus per match "tg"
                console.log(`🎯 [CardTrader] MATCH TG TROVATO in "${cardName}" -> +4000 punti`);
            }
            
            // BONUS MASSIMO per image_url che contiene TG (priorità assoluta per carte TG)
            if (result.image_url && result.image_url.toLowerCase().includes('tg')) {
                nameScore += 10000; // Bonus MASSIMO per image_url con TG
                console.log(`🎯 [CardTrader] IMAGE_URL CON TG TROVATO: ${result.image_url} -> +10000 punti (PRIORITÀ ASSOLUTA)`);
            }
            
            // BONUS MASSIMO per image_url che contiene SL (priorità assoluta per carte SL)
            if (result.image_url && result.image_url.toLowerCase().includes('sl')) {
                nameScore += 10000; // Bonus MASSIMO per image_url con SL
                console.log(`🎯 [CardTrader] IMAGE_URL CON SL TROVATO: ${result.image_url} -> +10000 punti (PRIORITÀ ASSOLUTA)`);
            }
            
            if (result.image_url) {
                const imageUrl = result.image_url.toLowerCase();
                
                // Cerca pattern specifici nell'image_url
                const patterns = [
                    titleInfo.pokemonName.toLowerCase(),
                    titleInfo.trainerName ? titleInfo.trainerName.toLowerCase() : '',
                    titleInfo.collectorNumber || '',
                    titleInfo.expansion ? titleInfo.expansion.toLowerCase() : '',
                    titleInfo.expansionCode ? titleInfo.expansionCode.toLowerCase() : ''
                ].filter(p => p); // Rimuovi pattern vuoti
                
                // Conta quanti pattern sono presenti nell'image_url
                patterns.forEach(pattern => {
                    if (imageUrl.includes(pattern)) {
                        imageUrlMatches.push(pattern);
                        imageUrlScore += 500; // +500 punti per ogni pattern trovato
                    }
                });
                
                // Bonus extra per match perfetti nell'image_url
                if (titleInfo.trainerName && titleInfo.collectorNumber) {
                    const trainerPattern = `${titleInfo.trainerName.toLowerCase()}-${titleInfo.collectorNumber}`;
                    if (imageUrl.includes(trainerPattern)) {
                        imageUrlScore += 10000; // Bonus MASSIMO per pattern allenatore-numero (priorità assoluta)
                        imageUrlMatches.push(`pattern_perfetto: ${trainerPattern}`);
                        console.log(`🎯 [CardTrader] PATTERN PERFETTO TROVATO: ${trainerPattern} -> +10000 punti (PRIORITÀ ASSOLUTA)`);
                    }
                }
                
                if (imageUrlMatches.length > 0) {
                    console.log(`🎯 [CardTrader] Image URL match per ${result.name_en || result.pokemon_name}: ${imageUrlMatches.join(', ')} -> +${imageUrlScore} punti`);
                    result.image_url_final_score = imageUrlScore;
                    result.image_url_matches = imageUrlMatches;
                }
            }
            
            return { result, imageUrlScore, nameScore };
        });
        
        // Riordina per punteggio totale (nome + image_url)
        finalResults.sort((a, b) => (b.nameScore + b.imageUrlScore) - (a.nameScore + a.imageUrlScore));
        
        // Debug: mostra tutti i risultati con punteggi
        console.log('📊 [CardTrader] Tutti i risultati ordinati per punteggio totale:');
        finalResults.forEach((item, index) => {
            const totalScore = item.nameScore + item.imageUrlScore;
            console.log(`${index + 1}. ${item.result.name_en || item.result.pokemon_name} - Punteggio Totale: ${totalScore} (Nome: ${item.nameScore}, Image: ${item.imageUrlScore}) - Blueprint: ${item.result.blueprint_id} - Image URL: ${item.result.image_url}`);
        });
        
        // Se abbiamo carte con nome allenatore, priorità assoluta
        const trainerNameMatches = finalResults.filter(item => item.nameScore >= 100000);
        
        if (trainerNameMatches.length > 0) {
            console.log(`✅ [CardTrader] Trovati ${trainerNameMatches.length} match con nome allenatore - priorità assoluta`);
            return trainerNameMatches.map(item => item.result).slice(0, 5);
        }
        
        // Se abbiamo match perfetti nell'image_url, priorità alta
        const perfectImageUrlMatches = finalResults.filter(item => 
            item.result.image_url_final_score && item.result.image_url_final_score >= 10000
        );
        
        if (perfectImageUrlMatches.length > 0) {
            console.log(`✅ [CardTrader] Trovati ${perfectImageUrlMatches.length} match perfetti nell'image_url - priorità alta`);
            return perfectImageUrlMatches.map(item => item.result).slice(0, 5);
        }
        
        // Altrimenti, mostra i migliori risultati con punteggio totale > 0
        const goodResults = finalResults.filter(item => (item.nameScore + item.imageUrlScore) > 0);
        
        if (goodResults.length > 0) {
            console.log(`✅ [CardTrader] Trovati ${goodResults.length} risultati con punteggio totale > 0`);
            return goodResults.map(item => item.result).slice(0, 10);
        }
        
        // Se nessun match nell'image_url, mostra tutti i risultati
        console.log(`⚠️ [CardTrader] Nessun match nell'image_url, mostrando tutti i risultati`);
        return allResults.slice(0, 10);
            
    } catch (error) {
        console.error('❌ [CardTrader] Errore nella ricerca database:', error);
        return [];
    }
}

// Funzione per calcolare la similarità tra stringhe (come nel test extension)
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1;
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    // Calcolo semplice della similarità
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    
    let matches = 0;
    words1.forEach(word1 => {
        words2.forEach(word2 => {
            if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
                matches++;
            }
        });
    });
    
    return matches / Math.max(words1.length, words2.length);
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