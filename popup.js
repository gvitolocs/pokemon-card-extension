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
            const supportedSites = ['ebay.com', 'ebay.it', 'ebay.co.uk', 'ebay.de', 'ebay.fr', 'ebay.es', 'vinted.com', 'cardmarket.com'];
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
                
                // Abilita il pulsante di salvataggio
                saveUrlBtn.innerHTML = '<i class="fas fa-save"></i> Salva URL';
                saveUrlBtn.classList.remove('disabled');
                saveUrlBtn.disabled = false;
            }
            
        } catch (error) {
            console.error('❌ [Popup] Errore nel caricamento pagina:', error);
            pageTitle.textContent = 'Errore nel caricamento';
            pageUrl.textContent = 'Errore';
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
            id: Date.now(),
            name: currentPageData.name,
            info: currentPageData.info,
            category: 'viewed', // Default per pagine salvate
            listingUrl: currentPageData.listingUrl,
            cardmarketUrl: currentPageData.cardmarketUrl,
            date: new Date().toLocaleString('it-IT'),
            type: 'page',
            added: new Date().toISOString()
        };
        
        saveCard(card);
        showSaveConfirmation();
        loadCards();
        showMessage(`Pagina "${currentPageData.name}" salvata nelle Viste`, 'success');
        
        // Reset del pulsante
        saveUrlBtn.innerHTML = '<i class="fas fa-check"></i> Salvata!';
        saveUrlBtn.classList.add('disabled');
        saveUrlBtn.disabled = true;
        
        setTimeout(() => {
            saveUrlBtn.innerHTML = '<i class="fas fa-save"></i> Salva URL';
            saveUrlBtn.classList.remove('disabled');
            saveUrlBtn.disabled = false;
        }, 2000);
    }
    
    // Aggiunge una carta manualmente
    async function addManualCard(inputElement, categoryElement) {
        const cardText = inputElement.value.trim();
        const category = categoryElement.value;
        
        if (!cardText) {
            showMessage('Inserisci il nome di un Pokemon', 'error');
            return;
        }
        
        const card = {
            id: Date.now(),
            name: cardText,
            info: 'Aggiunta manualmente',
            category: category,
            listingUrl: '',
            cardmarketUrl: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(cardText)}`,
            date: new Date().toLocaleString('it-IT'),
            type: 'manual',
            added: new Date().toISOString()
        };
        
        saveCard(card);
        inputElement.value = '';
        loadCards();
        showMessage(`Pokemon "${cardText}" aggiunto alla ${getCategoryName(category)}`, 'success');
    }
    
    // Gestisce la ricerca
    function handleSearch() {
        currentSearch = searchInput.value.toLowerCase();
        loadCards();
    }
    
    // Salva una carta nel localStorage
    function saveCard(card) {
        const cards = getCards();
        cards.unshift(card); // Aggiungi all'inizio
        localStorage.setItem('pokemonCardNotes', JSON.stringify(cards));
    }
    
    // Carica le carte dal localStorage
    function getCards() {
        const cards = localStorage.getItem('pokemonCardNotes');
        return cards ? JSON.parse(cards) : [];
    }
    
    // Carica e mostra le carte
    async function loadCards() {
        let cards = getCards();
        
        // Filtra per categoria
        if (currentFilter !== 'all') {
            cards = cards.filter(card => card.category === currentFilter);
        }
        
        // Filtra per ricerca
        if (currentSearch) {
            cards = cards.filter(card => 
                card.name.toLowerCase().includes(currentSearch) ||
                card.info.toLowerCase().includes(currentSearch)
            );
        }
        
        // Mostra le carte
        if (cards.length === 0) {
            cardsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <div>Nessuna pagina trovata</div>
                    <div style="font-size: 8px; margin-top: 3px;">Prova a cambiare filtro o ricerca</div>
                </div>
            `;
        } else {
            const cardsHtml = await Promise.all(cards.map(async (card) => {
                const pokemonName = extractPokemonName(card.name);
                const spriteUrl = await getPokemonSprite(pokemonName);
                
                return `
                    <div class="card-item">
                        <div class="pokemon-sprite">
                            ${spriteUrl ? `<img src="${spriteUrl}" alt="${pokemonName}" />` : '<i class="fas fa-question"></i>'}
                        </div>
                        <div class="card-content">
                            <div class="card-header">
                                <div class="card-name">${card.name}</div>
                                <div class="card-category">${getCategoryIcon(card.category)} ${getCategoryName(card.category)}</div>
                            </div>
                            ${card.info ? `<div class="card-info">${card.info}</div>` : ''}
                            <div class="card-date">${card.date}</div>
                        </div>
                    </div>
                `;
            }));
            
            cardsList.innerHTML = cardsHtml.join('');
        }
    }
    
    // Estrae il nome del Pokemon dal titolo
    function extractPokemonName(title) {
        // Lista dei Pokemon più comuni
        const pokemonNames = [
            'pikachu', 'charizard', 'blastoise', 'venusaur', 'mewtwo', 'mew', 'lugia', 'ho-oh',
            'rayquaza', 'groudon', 'kyogre', 'dialga', 'palkia', 'giratina', 'arceus', 'reshiram',
            'zekrom', 'kyurem', 'xerneas', 'yveltal', 'zygarde', 'solgaleo', 'lunala', 'necrozma',
            'zacian', 'zamazenta', 'eternatus', 'calyrex', 'koraidon', 'miraidon', 'eevee', 'vaporeon',
            'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon', 'garchomp',
            'lucario', 'gengar', 'dragonite', 'tyranitar', 'metagross', 'salamence', 'garchomp'
        ];
        
        const titleLower = title.toLowerCase();
        
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
    
    // Ottiene lo sprite del Pokemon dalla PokeAPI
    async function getPokemonSprite(pokemonName) {
        try {
            if (pokemonName === 'unknown') return null;
            
            const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonName.toLowerCase()}`);
            if (!response.ok) return null;
            
            const data = await response.json();
            return data.sprites.front_default;
            
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