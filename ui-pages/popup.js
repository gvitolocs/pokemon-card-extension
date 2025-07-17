// Blocco Note Pokemon - Versione Moderna con PokeAPI
let currentPageData = null;
let currentFilter = 'all';
let currentSearch = '';

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 [Popup] Inizializzazione blocco note Pokemon...');
    
    // Elementi DOM
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Salva URL
    const saveUrlSection = document.getElementById('saveUrlSection');
    const pageTitle = document.getElementById('pageTitle');
    const pageUrl = document.getElementById('pageUrl');
    const pageSite = document.getElementById('pageSite');
    const saveUrlBtn = document.getElementById('saveUrlBtn');
    
    // Manual add
    const manualCardInput = document.getElementById('manualCardInput');
    const manualCategorySelect = document.getElementById('manualCategorySelect');
    const manualAddBtn = document.getElementById('manualAddBtn');
    const manualCardInput2 = document.getElementById('manualCardInput2');
    const manualCategorySelect2 = document.getElementById('manualCategorySelect2');
    const manualAddBtn2 = document.getElementById('manualAddBtn2');
    
    // Collection
    const searchInput = document.getElementById('searchInput');
    const categoryButtons = document.querySelectorAll('.category-btn');
    const cardsList = document.getElementById('cardsList');
    const exportBtn = document.getElementById('exportBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    // Inizializza
    initializeTabs();
    initializeCollection();
    loadCurrentPage();
    
    // Carica sempre le carte salvate all'avvio
    loadCards();
    
    // Event listeners
    saveUrlBtn.addEventListener('click', saveCurrentPage);
    manualAddBtn.addEventListener('click', () => addManualCard(manualCardInput, manualCategorySelect));
    manualAddBtn2.addEventListener('click', () => addManualCard(manualCardInput2, manualCategorySelect2));
    exportBtn.addEventListener('click', exportCards);
    clearBtn.addEventListener('click', clearAllCards);
    searchInput.addEventListener('input', handleSearch);
    
    // Enter key per input manuali
    manualCardInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addManualCard(manualCardInput, manualCategorySelect);
    });
    manualCardInput2.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addManualCard(manualCardInput2, manualCategorySelect2);
    });
    
    // Inizializza i tab
    function initializeTabs() {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');
                
                // Rimuovi classe active da tutti i tab
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(tc => tc.classList.remove('active'));
                
                // Aggiungi classe active al tab cliccato
                tab.classList.add('active');
                document.getElementById(`${targetTab}-tab`).classList.add('active');
                
                // Se vai alla collezione, aggiorna la lista
                if (targetTab === 'collection') {
                    loadCards();
                }
            });
        });
    }
    
    // Inizializza la collezione
    function initializeCollection() {
        // Event listeners per i filtri categoria
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                categoryButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.getAttribute('data-category');
                loadCards();
            });
        });
        
        // Carica le carte
        loadCards();
    }
    
    // Carica informazioni della pagina corrente
    async function loadCurrentPage() {
        try {
            console.log('🔍 [Popup] Caricando informazioni pagina corrente...');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                console.log('❌ [Popup] Nessun tab attivo trovato');
                return;
            }
            
            const hostname = new URL(tab.url).hostname;
            const supportedSites = ['ebay.com', 'ebay.it', 'ebay.co.uk', 'ebay.de', 'ebay.fr', 'ebay.es', 'vinted.com', 'vinted.it', 'vinted.fr', 'vinted.de', 'vinted.es', 'vinted.pl', 'vinted.nl', 'vinted.be', 'vinted.at', 'vinted.lu', 'cardmarket.com'];
            const isSupported = supportedSites.some(site => hostname.includes(site));
            
            console.log(`🔍 [Popup] Hostname: ${hostname}, Supportato: ${isSupported}`);
            
            if (!isSupported) {
                pageTitle.textContent = 'Sito non supportato';
                pageUrl.textContent = tab.url;
                pageSite.innerHTML = '<i class="fas fa-external-link-alt"></i> Altro sito';
                saveUrlBtn.disabled = true;
                saveUrlBtn.classList.add('disabled');
                return;
            }
            
            // Chiedi al content script di estrarre le informazioni
            const response = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tab.id, { 
                    action: 'autoSearchCurrentPage'
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.log(`❌ [Popup] Errore runtime:`, chrome.runtime.lastError);
                        resolve(null);
                    } else {
                        console.log(`✅ [Popup] Risposta ricevuta`);
                        resolve(response);
                    }
                });
            });
            
            if (response && response.pageInfo) {
                const pageInfo = response.pageInfo;
                currentPageData = {
                    name: pageInfo.pageTitle || pageInfo.title || 'Pagina corrente',
                    info: `Pagina ${pageInfo.hostname}`,
                    listingUrl: pageInfo.url,
                    cardmarketUrl: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(pageInfo.pageTitle || pageInfo.title)}`
                };
                
                // Popola i campi
                pageTitle.textContent = currentPageData.name;
                pageUrl.textContent = pageInfo.url;
                
                // Mostra l'icona del sito
                let siteName, siteIcon;
                if (hostname.includes('ebay')) {
                    siteName = 'eBay';
                    siteIcon = 'fas fa-shopping-cart';
                } else if (hostname.includes('vinted')) {
                    siteName = 'Vinted';
                    siteIcon = 'fas fa-tshirt';
                } else if (hostname.includes('cardmarket')) {
                    siteName = 'Cardmarket';
                    siteIcon = 'fas fa-cards-blank';
                } else {
                    siteName = 'Sito';
                    siteIcon = 'fas fa-external-link-alt';
                }
                pageSite.innerHTML = `<i class="${siteIcon}"></i> ${siteName}`;
                
                // Controlla se la pagina è già stata salvata
                const existingCard = checkIfPageExists(pageInfo.url);
                if (existingCard) {
                    showMessage(`Pagina già presente nelle ${getCategoryName(existingCard.category)}`, 'info');
                    saveUrlBtn.innerHTML = '<i class="fas fa-check"></i> Già Salvata';
                    saveUrlBtn.classList.add('disabled');
                    saveUrlBtn.disabled = true;
                } else {
                    saveUrlBtn.innerHTML = '<i class="fas fa-save"></i> Salva URL';
                    saveUrlBtn.classList.remove('disabled');
                    saveUrlBtn.disabled = false;
                }
                
            } else {
                console.log('⚠️ [Popup] Content script non ha risposto, uso fallback');
                // Fallback: usa le informazioni del tab
                currentPageData = {
                    name: tab.title || 'Pagina eBay',
                    info: `Pagina ${hostname}`,
                    listingUrl: tab.url,
                    cardmarketUrl: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(tab.title || 'pokemon')}`
                };
                
                pageTitle.textContent = currentPageData.name;
                pageUrl.textContent = tab.url;
                
                // Mostra l'icona del sito
                let siteName, siteIcon;
                if (hostname.includes('ebay')) {
                    siteName = 'eBay';
                    siteIcon = 'fas fa-shopping-cart';
                } else if (hostname.includes('vinted')) {
                    siteName = 'Vinted';
                    siteIcon = 'fas fa-tshirt';
                } else if (hostname.includes('cardmarket')) {
                    siteName = 'Cardmarket';
                    siteIcon = 'fas fa-cards-blank';
                } else {
                    siteName = 'Sito';
                    siteIcon = 'fas fa-external-link-alt';
                }
                pageSite.innerHTML = `<i class="${siteIcon}"></i> ${siteName}`;
                
                // Controlla se la pagina è già stata salvata
                const existingCard = checkIfPageExists(tab.url);
                if (existingCard) {
                    showMessage(`Pagina già presente nelle ${getCategoryName(existingCard.category)}`, 'info');
                    saveUrlBtn.innerHTML = '<i class="fas fa-check"></i> Già Salvata';
                    saveUrlBtn.classList.add('disabled');
                    saveUrlBtn.disabled = true;
                } else {
                    saveUrlBtn.innerHTML = '<i class="fas fa-save"></i> Salva URL';
                    saveUrlBtn.classList.remove('disabled');
                    saveUrlBtn.disabled = false;
                }
            }
            
        } catch (error) {
            console.log('❌ [Popup] Errore nel caricamento pagina:', error);
            pageTitle.textContent = 'Errore nel caricamento';
            pageUrl.textContent = 'Impossibile caricare le informazioni';
            pageSite.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Errore';
            saveUrlBtn.disabled = true;
            saveUrlBtn.classList.add('disabled');
        }
    }
    
    // Salva la pagina corrente
    function saveCurrentPage() {
        if (!currentPageData) {
            showMessage('Nessuna pagina da salvare', 'error');
            return;
        }
        
        const card = {
            name: currentPageData.name,
            info: currentPageData.info,
            listingUrl: currentPageData.listingUrl,
            cardmarketUrl: currentPageData.cardmarketUrl,
            category: 'viewed',
            date: new Date().toLocaleDateString('it-IT')
        };
        
        saveCard(card);
        showSaveConfirmation();
        showMessage(`Pagina salvata nelle ${getCategoryName(card.category)}`, 'success');
        
        // Aggiorna il bottone
        saveUrlBtn.innerHTML = '<i class="fas fa-check"></i> Già Salvata';
        saveUrlBtn.classList.add('disabled');
        saveUrlBtn.disabled = true;
    }
    
    // Aggiunge una carta manualmente
    async function addManualCard(inputElement, categoryElement) {
        const cardName = inputElement.value.trim();
        const category = categoryElement.value;
        
        if (!cardName) {
            showMessage('Inserisci il nome della carta', 'error');
            return;
        }
        
        if (checkIfCardExists(cardName, 'Carta aggiunta manualmente')) {
            showMessage('Questa carta è già presente', 'error');
            return;
        }
        
        const card = {
            name: cardName,
            info: 'Carta aggiunta manualmente',
            listingUrl: '',
            cardmarketUrl: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(cardName)}`,
            category: category,
            date: new Date().toLocaleDateString('it-IT')
        };
        
        saveCard(card);
        inputElement.value = '';
        showMessage(`Carta aggiunta alle ${getCategoryName(category)}`, 'success');
        loadCards();
    }
    
    // Gestisce la ricerca
    function handleSearch() {
        currentSearch = searchInput.value.toLowerCase();
        loadCards();
    }
    
    // Salva una carta
    function saveCard(card) {
        const cards = getCards();
        cards.unshift(card);
        localStorage.setItem('pokemonCardNotes', JSON.stringify(cards));
    }
    
    // Ottiene tutte le carte
    function getCards() {
        const cards = localStorage.getItem('pokemonCardNotes');
        return cards ? JSON.parse(cards) : [];
    }
    
    // Carica e mostra le carte
    async function loadCards() {
        console.log('📚 [Popup] Caricando carte...');
        
        let cards = getCards();
        
        // Filtra per categoria
        if (currentFilter !== 'all') {
            cards = cards.filter(card => card.category === currentFilter);
        }
        
        // Filtra per ricerca
        if (currentSearch) {
            cards = cards.filter(card => 
                card.name.toLowerCase().includes(currentSearch) ||
                (card.info && card.info.toLowerCase().includes(currentSearch))
            );
        }
        
        console.log(`📚 [Popup] Trovate ${cards.length} carte dopo filtri`);
        
        // Mostra le carte
        if (cards.length === 0) {
            cardsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <div>Nessuna pagina trovata</div>
                    <div>Prova a cambiare filtro o ricerca</div>
                </div>
            `;
        } else {
            const cardsHtml = await Promise.all(cards.map(async (card, index) => {
                const pokemonName = extractPokemonName(card.name);
                const spriteUrl = await getPokemonSprite(pokemonName);
                
                return `
                    <div class="card-item" data-index="${index}">
                        <div class="pokemon-sprite">
                            ${spriteUrl ? `<img src="${spriteUrl}" alt="${pokemonName}" />` : '<i class="fas fa-question"></i>'}
                        </div>
                        <div class="card-content">
                            <div class="card-header">
                                <div class="card-name" onclick="openCardUrl('${card.listingUrl || card.cardmarketUrl}')">${card.name}</div>
                                <div class="card-category">${getCategoryIcon(card.category)} ${getCategoryName(card.category)}</div>
                            </div>
                            ${card.info ? `<div class="card-info">${card.info}</div>` : ''}
                            <div class="card-date">${card.date}</div>
                        </div>
                    </div>
                `;
            }));
            
            cardsList.innerHTML = cardsHtml.join('');
            
            // Aggiungi event listeners per aprire gli URL
            document.querySelectorAll('.card-item').forEach((item, index) => {
                item.addEventListener('click', (e) => {
                    // Non aprire l'URL se si clicca sul nome (che ha già il suo handler)
                    if (e.target.classList.contains('card-name')) return;
                    
                    const card = cards[index];
                    const url = card.listingUrl || card.cardmarketUrl;
                    if (url) {
                        chrome.tabs.create({ url: url });
                    }
                });
            });
        }
    }
    
    // Funzione globale per aprire URL delle carte
    window.openCardUrl = function(url) {
        if (url) {
            chrome.tabs.create({ url: url });
        }
    };
    
    // Estrae il nome del Pokemon dal titolo
    function extractPokemonName(title) {
        // Lista estesa dei Pokemon più comuni, inclusi Raikou e varianti di nomi
        const pokemonNames = [
            'pikachu', 'charizard', 'blastoise', 'venusaur', 'mewtwo', 'mew', 'lugia', 'ho-oh',
            'rayquaza', 'groudon', 'kyogre', 'dialga', 'palkia', 'giratina', 'arceus', 'reshiram',
            'zekrom', 'kyurem', 'xerneas', 'yveltal', 'zygarde', 'solgaleo', 'lunala', 'necrozma',
            'zacian', 'zamazenta', 'eternatus', 'calyrex', 'koraidon', 'miraidon', 'eevee', 'vaporeon',
            'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon', 'garchomp',
            'lucario', 'gengar', 'dragonite', 'tyranitar', 'metagross', 'salamence', 'garchomp',
            'raikou', 'entei', 'suicune', 'celebi', 'jirachi', 'deoxys', 'darkrai', 'shaymin',
            'victini', 'keldeo', 'meloetta', 'genesect', 'volcanion', 'marshadow', 'zeraora',
            'meltan', 'melmetal', 'zarude', 'regieleki', 'regidrago', 'glastrier', 'spectrier',
            'calyrex', 'enamorus', 'koraidon', 'miraidon', 'walking wake', 'iron leaves'
        ];
        
        const titleLower = title.toLowerCase();
        
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
        
        // Controlla prima i casi speciali
        for (const [variant, pokemonId] of Object.entries(specialCases)) {
            if (titleLower.includes(variant)) {
                return pokemonId;
            }
        }
        
        // Poi controlla la lista normale
        for (const pokemon of pokemonNames) {
            if (titleLower.includes(pokemon)) {
                return pokemon;
            }
        }
        
        // Se non trova un Pokemon specifico, prova a estrarre la prima parola
        const words = titleLower.split(/\s+/);
        if (words.length > 0 && words[0].length > 2) {
            return words[0];
        }
        
        return 'unknown';
    }
    
    // Ottiene lo sprite del Pokemon dalla PokeAPI con fallback migliorato
    async function getPokemonSprite(pokemonName) {
        try {
            if (pokemonName === 'unknown') return null;
            
            // Prova prima con il nome esatto
            let response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonName.toLowerCase()}`);
            
            if (!response.ok) {
                // Se fallisce, prova a cercare nella lista completa
                const searchResponse = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=1000`);
                if (searchResponse.ok) {
                    const searchData = await searchResponse.json();
                    const pokemon = searchData.results.find(p => 
                        p.name.toLowerCase() === pokemonName.toLowerCase()
                    );
                    
                    if (pokemon) {
                        response = await fetch(pokemon.url);
                    }
                }
            }
            
            if (response && response.ok) {
                const data = await response.json();
                return data.sprites.front_default;
            }
            
            return null;
            
        } catch (error) {
            console.log(`❌ [Popup] Errore nel caricamento sprite per ${pokemonName}:`, error);
            return null;
        }
    }
    
    // Esporta le carte
    function exportCards() {
        const cards = getCards();
        if (cards.length === 0) {
            showMessage('Nessuna pagina da esportare', 'error');
            return;
        }
        
        const dataStr = JSON.stringify(cards, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `pokemon-pages-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        showMessage(`${cards.length} pagine esportate con successo`, 'success');
    }
    
    // Svuota tutte le carte
    function clearAllCards() {
        if (confirm('Sei sicuro di voler eliminare tutte le pagine?')) {
            localStorage.removeItem('pokemonCardNotes');
            loadCards();
            showMessage('Tutte le pagine sono state eliminate', 'success');
        }
    }
    
    // Controlla se una carta esiste già
    function checkIfCardExists(cardName, cardInfo) {
        const cards = getCards();
        return cards.find(card => 
            card.name.toLowerCase() === cardName.toLowerCase() &&
            card.info === cardInfo
        );
    }
    
    // Controlla se una pagina esiste già
    function checkIfPageExists(pageUrl) {
        const cards = getCards();
        return cards.find(card => card.listingUrl === pageUrl);
    }
    
    // Mostra un messaggio
    function showMessage(text, type = 'success') {
        const messageDiv = document.createElement('div');
        let iconClass;
        
        switch (type) {
            case 'success':
                iconClass = 'check-circle';
                break;
            case 'error':
                iconClass = 'exclamation-circle';
                break;
            case 'info':
                iconClass = 'info-circle';
                break;
            default:
                iconClass = 'check-circle';
        }
        
        messageDiv.className = `message ${type}`;
        messageDiv.innerHTML = `
            <i class="fas fa-${iconClass}"></i>
            ${text}
        `;
        
        // Inserisci il messaggio all'inizio del container
        const container = document.querySelector('.container');
        container.insertBefore(messageDiv, container.firstChild);
        
        // Rimuovi il messaggio dopo 3 secondi
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 3000);
    }
    
    // Mostra conferma di salvataggio
    function showSaveConfirmation() {
        const originalText = saveUrlBtn.innerHTML;
        saveUrlBtn.innerHTML = '<i class="fas fa-check"></i> Salvata!';
        saveUrlBtn.style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
        
        setTimeout(() => {
            saveUrlBtn.innerHTML = originalText;
            saveUrlBtn.style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
        }, 2000);
    }
    
    // Ottiene il nome della categoria
    function getCategoryName(category) {
        const names = {
            'wishlist': 'Wishlist',
            'viewed': 'Viste',
            'favorite': 'Preferite'
        };
        return names[category] || category;
    }
    
    // Ottiene l'icona della categoria
    function getCategoryIcon(category) {
        const icons = {
            'wishlist': '🎯',
            'viewed': '👁️',
            'favorite': '⭐'
        };
        return icons[category] || '📝';
    }
    
    console.log('✅ [Popup] Blocco note Pokemon inizializzato con successo');
}); 