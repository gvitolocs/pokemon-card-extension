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
        
        if (!supabaseReady) {
            console.warn('⚠️ Supabase non configurato, l\'estensione funzionerà in modalità limitata');
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
        const results = await searchCardInDatabase(titleInfo);
        
        if (results.length > 0) {
            // Aggiungi i link
            addCardTraderLinks(listingElement, results, titleInfo);
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
    }
    
    return true;
});

// Inizializza l'estensione quando il DOM è pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
} 