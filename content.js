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
        const results = await searchCardInDatabase(titleInfo);
        
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

// Inizializza l'estensione quando il DOM è pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
} 

// --- PATCH: Supporto pagina prodotto eBay con pulsante CARDTRADER nel titolo ---
function patchEbayProductPage() {
    if (!window.location.hostname.includes('ebay')) return;
    
    console.log('🔍 [CardTrader] Cercando box del titolo...');
    
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
        searchCardInDatabase(titleInfo).then(results => {
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
        'lapras', 'ditto', 'vaporeon', 'jolteon', 'flareon', 'omanyte', 'omastar', 'kabuto', 'kabutops',
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
        if (titleLower.includes(pokemonLower)) {
            pokemonName = pokemon.toLowerCase();
            console.log('✅ [CardTrader] Pokemon trovato (match diretto):', pokemonName);
            break;
        }
        
        // Cerca anche con forme speciali (Ex, GX, V, VMAX, etc.)
        const specialForms = ['ex', 'gx', 'v', 'vmax', 'vstar', 'break', 'prime', 'star', 'delta', 'shining', 'crystal'];
        for (const form of specialForms) {
            if (titleLower.includes(pokemonLower + ' ' + form) || titleLower.includes(pokemonLower + form)) {
                pokemonName = pokemon.toLowerCase();
                console.log('✅ [CardTrader] Pokemon trovato (con forma speciale):', pokemonName, 'forma:', form);
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
    } else {
        // Cerca un numero singolo dopo "XY" o simili
        const singleNumberMatch = titleLower.match(/(?:xy|swsh|sv|sm)\s*(\d+)/i);
        if (singleNumberMatch) {
            collectorNumber = singleNumberMatch[1];
        }
    }
    
    // Estrai espansione
    let expansion = null;
    const expansionPatterns = [
        /terastal festival/i,
        /prismatic evolution/i,
        /scarlet & violet/i,
        /sword & shield/i,
        /sun & moon/i
    ];
    
    for (const pattern of expansionPatterns) {
        const match = titleLower.match(pattern);
        if (match) {
            expansion = match[0];
            break;
        }
    }
    
    // Estrai rarità
    let rarity = null;
    const rarityPatterns = [
        /special illustration rare/i,
        /ultra rare/i,
        /full art/i,
        /secret rare/i
    ];
    
    for (const pattern of rarityPatterns) {
        const match = titleLower.match(pattern);
        if (match) {
            rarity = match[0];
            break;
        }
    }
    
    return {
        pokemonName,
        expansion,
        collectorNumber,
        rarity
    };
}

// Funzione per cercare nel database
async function searchCardInDatabase(titleInfo) {
    try {
        const supabaseClient = window.supabaseClient;
        
        if (!supabaseClient) {
            console.error('❌ [CardTrader] Supabase client non disponibile');
            return [];
        }
        
        console.log('🔍 [CardTrader] Cercando con criteri:', titleInfo);
        
        let allResults = [];
        
        // 1. Cerca nelle carte con il nome Pokemon
        const { data: cards, error: cardsError } = await supabaseClient
            .from('cards')
            .select('*')
            .ilike('name_en', `%${titleInfo.pokemonName}%`)
            .limit(20);
        
        if (!cardsError && cards && cards.length > 0) {
            console.log(`✅ [CardTrader] Trovate ${cards.length} carte con nome Pokemon`);
            allResults.push(...cards.map(card => ({ ...card, source: 'cards' })));
        }
        
        // 2. Se abbiamo un numero collezionista, cerca nelle varianti
        if (titleInfo.collectorNumber) {
            console.log(`🔍 [CardTrader] Cercando varianti con numero ${titleInfo.collectorNumber}`);
            
            // Prima trova le carte Pokemon
            const { data: pokemonCards, error: pokemonError } = await supabaseClient
                .from('cards')
                .select('blueprint_id, name_en, expansion_name_en, expansion_code')
                .ilike('name_en', `%${titleInfo.pokemonName}%`);
            
            if (!pokemonError && pokemonCards && pokemonCards.length > 0) {
                const blueprintIds = pokemonCards.map(card => card.blueprint_id).filter(id => id);
                console.log(`🔍 [CardTrader] Cercando varianti per ${blueprintIds.length} blueprint IDs`);
                
                // Poi cerca le varianti con il numero collezionista
                const { data: variants, error: variantsError } = await supabaseClient
                    .from('card_variants')
                    .select('*')
                    .in('blueprint_id', blueprintIds)
                    .eq('collector_number', titleInfo.collectorNumber);
                
                if (!variantsError && variants && variants.length > 0) {
                    console.log(`✅ [CardTrader] Trovate ${variants.length} varianti con numero collezionista`);
                    variants.forEach(variant => {
                        const card = pokemonCards.find(c => c.blueprint_id === variant.blueprint_id);
                        if (card) {
                            const combinedVariant = {
                                ...variant,
                                name_en: card.name_en,
                                pokemon_name: card.name_en,
                                expansion_name_en: card.expansion_name_en,
                                expansion_name: card.expansion_name_en,
                                expansion_code: card.expansion_code,
                                source: 'card_variants'
                            };
                            allResults.push(combinedVariant);
                        }
                    });
                }
            }
        }
        
        // 3. Sistema di punteggi migliorato
        const scoredResults = allResults.map(result => {
            let score = 0;
            
            // Punteggio base per nome Pokemon (1000 punti)
            const name = (result.name_en || result.pokemon_name || '').toLowerCase();
            if (name.includes(titleInfo.pokemonName)) {
                score += 1000;
                console.log(`🎯 [CardTrader] Match nome: ${name} -> +1000 punti`);
            }
            
            // Punteggio per numero collezionista (500 punti)
            if (titleInfo.collectorNumber && result.collector_number === titleInfo.collectorNumber) {
                score += 500;
                console.log(`🎯 [CardTrader] Match numero: ${result.collector_number} -> +500 punti`);
            }
            
            // Punteggio per espansione (200 punti)
            if (titleInfo.expansion) {
                const expansion = (result.expansion_name_en || result.expansion_name || '').toLowerCase();
                if (expansion.includes(titleInfo.expansion.toLowerCase())) {
                    score += 200;
                    console.log(`🎯 [CardTrader] Match espansione: ${expansion} -> +200 punti`);
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
            
            console.log(`📊 [CardTrader] ${result.name_en || result.pokemon_name} - Punteggio totale: ${score}`);
            
            return { result, score };
        });
        
        // Ordina per punteggio (decrescente)
        scoredResults.sort((a, b) => b.score - a.score);
        
        // Filtra solo risultati con punteggio > 0 e prendi i migliori
        const filteredResults = scoredResults
            .filter(item => item.score > 0)
            .map(item => item.result)
            .slice(0, 5);
        
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

// Esegui il patch iniziale
patchEbayProductPage();

// Retry del patch per pagine che si caricano dopo
setTimeout(() => {
    console.log('🔄 [CardTrader] Retry patch pagina prodotto...');
    patchEbayProductPage();
}, 3000);

setTimeout(() => {
    console.log('🔄 [CardTrader] Secondo retry patch pagina prodotto...');
    patchEbayProductPage();
}, 5000); 