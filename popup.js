// Blocco Note Carte Pokemon - Versione Completamente Riscritta
let currentCardData = null;
let currentFilter = 'all';
let currentSearch = '';

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 [Popup] Inizializzazione blocco note...');
    
    // Elementi DOM
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Auto-detection
    const autoDetection = document.getElementById('autoDetection');
    const autoCardName = document.getElementById('autoCardName');
    const autoCardInfo = document.getElementById('autoCardInfo');
    const autoCardUrl = document.getElementById('autoCardUrl');
    const autoSaveBtn = document.getElementById('autoSaveBtn');
    const autoViewBtn = document.getElementById('autoViewBtn');
    
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
    checkForAutoDetection();
    
    // Event listeners
    autoSaveBtn.addEventListener('click', saveAutoDetectedCard);
    autoViewBtn.addEventListener('click', viewAutoDetectedCard);
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
    
    // Controlla se c'è una carta da rilevare automaticamente
    async function checkForAutoDetection() {
        try {
            console.log('🔍 [Popup] Controllando rilevamento automatico...');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                console.log('❌ [Popup] Nessun tab attivo trovato');
                return;
            }
            
            const hostname = new URL(tab.url).hostname;
            const supportedSites = ['ebay.com', 'vinted.com', 'cardmarket.com'];
            const isSupported = supportedSites.some(site => hostname.includes(site));
            
            if (!isSupported) {
                console.log('🚫 [Popup] Sito non supportato:', hostname);
                return;
            }
            
            console.log(`✅ [Popup] Sito supportato: ${hostname}`);
            
            // Chiedi al content script di estrarre il titolo
            const response = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tab.id, { 
                    action: 'autoSearchCurrentPage'
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.log(`❌ [Popup] Errore runtime:`, chrome.runtime.lastError);
                        resolve(null);
                    } else if (response && response.success && response.results && response.results.length > 0) {
                        console.log(`✅ [Popup] Risposta ricevuta con ${response.results.length} risultati`);
                        resolve(response);
                    } else {
                        console.log(`⚠️ [Popup] Nessun risultato trovato`);
                        resolve(null);
                    }
                });
            });
            
            if (response && response.pageInfo) {
                const pageInfo = response.pageInfo;
                const cardNameText = pageInfo.pageTitle || pageInfo.title || 'Pagina corrente';
                
                // Salva i dati della carta corrente
                currentCardData = {
                    name: cardNameText,
                    info: `Pagina ${pageInfo.hostname}`,
                    listingUrl: pageInfo.url,
                    cardmarketUrl: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(cardNameText)}`
                };
                
                // Popola i campi
                autoCardName.textContent = cardNameText;
                autoCardInfo.textContent = `Pagina ${pageInfo.hostname}`;
                
                // Mostra l'URL della pagina con icona del sito
                let siteName, siteIcon;
                if (pageInfo.hostname.includes('ebay')) {
                    siteName = 'eBay';
                    siteIcon = 'fas fa-shopping-cart';
                } else if (pageInfo.hostname.includes('vinted')) {
                    siteName = 'Vinted';
                    siteIcon = 'fas fa-tshirt';
                } else if (pageInfo.hostname.includes('cardmarket')) {
                    siteName = 'Cardmarket';
                    siteIcon = 'fas fa-cards-blank';
                } else {
                    siteName = 'Sito';
                    siteIcon = 'fas fa-external-link-alt';
                }
                autoCardUrl.innerHTML = `<a href="${pageInfo.url}" target="_blank"><i class="${siteIcon}"></i> ${siteName}</a>`;
                
                // Controlla se la pagina è già stata salvata
                const existingCard = checkIfPageExists(pageInfo.url);
                if (existingCard) {
                    showMessage(`Pagina già presente nelle ${getCategoryName(existingCard.category)}`, 'info');
                    autoSaveBtn.innerHTML = '<i class="fas fa-check"></i> Già Salvata';
                    autoSaveBtn.classList.add('disabled');
                    autoSaveBtn.disabled = true;
                } else {
                    autoSaveBtn.innerHTML = '<i class="fas fa-save"></i> Salva';
                    autoSaveBtn.classList.remove('disabled');
                    autoSaveBtn.disabled = false;
                }
                
                // Mostra la sezione con animazione
                console.log('✅ [Popup] Mostrando sezione auto-detection');
                autoDetection.classList.add('show');
                
            } else {
                console.log('⚠️ [Popup] Nessuna carta rilevata');
                autoDetection.classList.remove('show');
            }
            
        } catch (error) {
            console.error('❌ [Popup] Errore nel controllo automatico:', error);
            autoDetection.classList.remove('show');
        }
    }
    
    // Salva la carta rilevata automaticamente
    function saveAutoDetectedCard() {
        if (!currentCardData) {
            showMessage('Nessuna carta da salvare', 'error');
            return;
        }
        
        const card = {
            id: Date.now(),
            name: currentCardData.name,
            info: currentCardData.info,
            category: 'viewed', // Default per carte rilevate automaticamente
            listingUrl: currentCardData.listingUrl,
            cardmarketUrl: currentCardData.cardmarketUrl,
            date: new Date().toLocaleString('it-IT'),
            type: 'auto',
            added: new Date().toISOString()
        };
        
        saveCard(card);
        showSaveConfirmation();
        loadCards();
        showMessage(`Pagina "${currentCardData.name}" salvata nelle Viste`, 'success');
        
        // Reset del pulsante
        autoSaveBtn.innerHTML = '<i class="fas fa-check"></i> Salvata!';
        autoSaveBtn.classList.add('disabled');
        autoSaveBtn.disabled = true;
        
        setTimeout(() => {
            autoSaveBtn.innerHTML = '<i class="fas fa-save"></i> Salva';
            autoSaveBtn.classList.remove('disabled');
            autoSaveBtn.disabled = false;
        }, 2000);
    }
    
    // Visualizza la carta rilevata su Cardmarket
    function viewAutoDetectedCard() {
        if (currentCardData?.cardmarketUrl) {
            chrome.tabs.create({ url: currentCardData.cardmarketUrl });
        } else {
            showMessage('Link Cardmarket non disponibile', 'error');
        }
    }
    
    // Aggiunge una carta manualmente
    function addManualCard(inputElement, categoryElement) {
        const cardText = inputElement.value.trim();
        const category = categoryElement.value;
        
        if (!cardText) {
            showMessage('Inserisci il nome di una carta', 'error');
            return;
        }
        
        const card = {
            id: Date.now(),
            name: cardText,
            info: '',
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
        showMessage(`Carta "${cardText}" aggiunta alla ${getCategoryName(category)}`, 'success');
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
    function loadCards() {
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
                    <div>Nessuna carta trovata</div>
                    <div style="font-size: 9px; margin-top: 4px;">Prova a cambiare filtro o ricerca</div>
                </div>
            `;
        } else {
            cardsList.innerHTML = cards.map(card => `
                <div class="card-item">
                    <div class="card-item-header">
                        <div class="card-item-name">${card.name}</div>
                        <div class="card-item-category">${getCategoryIcon(card.category)} ${getCategoryName(card.category)}</div>
                    </div>
                    ${card.info ? `<div class="card-item-info">${card.info}</div>` : ''}
                    <div class="card-item-date">${card.date}</div>
                </div>
            `).join('');
        }
    }
    
    // Esporta le carte
    function exportCards() {
        const cards = getCards();
        if (cards.length === 0) {
            showMessage('Nessuna carta da esportare', 'error');
            return;
        }
        
        const dataStr = JSON.stringify(cards, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `pokemon-cards-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        showMessage(`${cards.length} carte esportate con successo`, 'success');
    }
    
    // Svuota tutte le carte
    function clearAllCards() {
        if (confirm('Sei sicuro di voler eliminare tutte le carte?')) {
            localStorage.removeItem('pokemonCardNotes');
            loadCards();
            showMessage('Tutte le carte sono state eliminate', 'success');
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
        const originalText = autoSaveBtn.innerHTML;
        autoSaveBtn.innerHTML = '<i class="fas fa-check"></i> Salvata!';
        autoSaveBtn.style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
        
        setTimeout(() => {
            autoSaveBtn.innerHTML = originalText;
            autoSaveBtn.style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
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
    
    console.log('✅ [Popup] Blocco note inizializzato con successo');
}); 