// Popup script per Blocco Note Carte Pokemon - Versione Moderna
let currentCardData = null;
let currentFilter = 'all';
let currentSearch = '';

document.addEventListener('DOMContentLoaded', function() {
    // Elementi DOM
    const cardInput = document.getElementById('cardInput');
    const categorySelect = document.getElementById('categorySelect');
    const addButton = document.getElementById('addButton');
    const clearButton = document.getElementById('clearButton');
    const exportButton = document.getElementById('exportButton');
    const notesContent = document.getElementById('notesContent');
    const autoAddSection = document.getElementById('autoAddSection');
    const cardName = document.getElementById('cardName');
    const cardInfo = document.getElementById('cardInfo');
    const cardPrice = document.getElementById('cardPrice');
    const cardUrl = document.getElementById('cardUrl');
    const saveCardButton = document.getElementById('saveCardButton');
    const viewCardButton = document.getElementById('viewCardButton');
    const searchInput = document.getElementById('searchInput');
    const exportDataBtn = document.getElementById('exportDataBtn');
    const importDataBtn = document.getElementById('importDataBtn');
    
    // Tabs
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Filtri categoria
    const categoryButtons = document.querySelectorAll('.category-btn');
    
    // Toggle switches
    const autoDetectionToggle = document.getElementById('autoDetectionToggle');
    const priceNotificationsToggle = document.getElementById('priceNotificationsToggle');
    const darkThemeToggle = document.getElementById('darkThemeToggle');
    
    // Inizializza il blocco note
    initializeNotepad();
    initializeTabs();
    initializeFilters();
    initializeSettings();
    
    // Event listeners
    addButton.addEventListener('click', addCard);
    clearButton.addEventListener('click', clearAllNotes);
    exportButton.addEventListener('click', exportNotes);
    cardInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addCard();
        }
    });
    saveCardButton.addEventListener('click', saveCurrentCard);
    viewCardButton.addEventListener('click', viewCurrentCard);
    searchInput.addEventListener('input', handleSearch);
    exportDataBtn.addEventListener('click', exportAllData);
    importDataBtn.addEventListener('click', importAllData);
    
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
                
                // Aggiorna le statistiche quando si va alla collezione
                if (targetTab === 'collection') {
                    updateStats();
                }
            });
        });
    }
    
    // Inizializza i filtri categoria
    function initializeFilters() {
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                categoryButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.getAttribute('data-category');
                loadNotes();
            });
        });
    }
    
    // Inizializza le impostazioni
    function initializeSettings() {
        // Carica le impostazioni salvate
        const settings = getSettings();
        
        if (settings.autoDetection !== false) autoDetectionToggle.classList.add('active');
        if (settings.priceNotifications) priceNotificationsToggle.classList.add('active');
        if (settings.darkTheme) darkThemeToggle.classList.add('active');
        
        // Event listeners per i toggle
        autoDetectionToggle.addEventListener('click', () => {
            autoDetectionToggle.classList.toggle('active');
            saveSettings({ autoDetection: autoDetectionToggle.classList.contains('active') });
        });
        
        priceNotificationsToggle.addEventListener('click', () => {
            priceNotificationsToggle.classList.toggle('active');
            saveSettings({ priceNotifications: priceNotificationsToggle.classList.contains('active') });
        });
        
        darkThemeToggle.addEventListener('click', () => {
            darkThemeToggle.classList.toggle('active');
            saveSettings({ darkTheme: darkThemeToggle.classList.contains('active') });
            applyTheme();
        });
        
        applyTheme();
    }
    
    // Applica il tema
    function applyTheme() {
        const settings = getSettings();
        if (settings.darkTheme) {
            document.body.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
        } else {
            document.body.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
    }
    
    // Inizializza il blocco note
    function initializeNotepad() {
        loadNotes();
        updateStats();
        checkForAutoDetection();
    }
    
    // Aggiunge una carta manualmente
    function addCard() {
        const cardText = cardInput.value.trim();
        const category = categorySelect.value;
        
        if (!cardText) {
            showMessage('Inserisci il nome di una carta', 'error');
            return;
        }
        
        const note = {
            id: Date.now(),
            text: cardText,
            category: category,
            date: new Date().toLocaleString('it-IT'),
            type: 'manual',
            added: new Date().toISOString()
        };
        
        saveNote(note);
        cardInput.value = '';
        loadNotes();
        updateStats();
        showMessage(`Carta "${cardText}" aggiunta alla ${getCategoryName(category)}`, 'success');
    }
    
    // Salva la carta corrente
    function saveCurrentCard() {
        const cardText = cardName.textContent;
        if (!cardText) {
            showMessage('Nessuna carta da salvare', 'error');
            return;
        }
        
        const note = {
            id: Date.now(),
            text: cardText,
            category: 'viewed',
            info: cardInfo.textContent,
            price: cardPrice.textContent,
            listingUrl: currentCardData?.listingUrl || '',
            date: new Date().toLocaleString('it-IT'),
            type: 'current',
            cardTraderUrl: currentCardData?.cardTraderUrl || '',
            added: new Date().toISOString()
        };
        
        saveNote(note);
        showSaveConfirmation();
        loadNotes();
        updateStats();
        showMessage(`Carta "${cardText}" salvata`, 'success');
    }
    
    // Visualizza la carta corrente su CardTrader
    function viewCurrentCard() {
        if (currentCardData?.cardTraderUrl) {
            chrome.tabs.create({ url: currentCardData.cardTraderUrl });
        } else {
            showMessage('Link CardTrader non disponibile', 'error');
        }
    }
    
    // Mostra conferma di salvataggio
    function showSaveConfirmation() {
        const originalText = saveCardButton.innerHTML;
        saveCardButton.innerHTML = '<i class="fas fa-check"></i> Salvata!';
        saveCardButton.style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
        
        setTimeout(() => {
            saveCardButton.innerHTML = originalText;
            saveCardButton.style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
        }, 2000);
    }
    
    // Gestisce la ricerca
    function handleSearch() {
        currentSearch = searchInput.value.toLowerCase();
        loadNotes();
    }
    
    // Salva una nota nel localStorage
    function saveNote(note) {
        const notes = getNotes();
        notes.unshift(note); // Aggiungi all'inizio
        localStorage.setItem('pokemonCardNotes', JSON.stringify(notes));
    }
    
    // Carica le note dal localStorage
    function getNotes() {
        const notes = localStorage.getItem('pokemonCardNotes');
        return notes ? JSON.parse(notes) : [];
    }
    
    // Carica e mostra le note
    function loadNotes() {
        let notes = getNotes();
        
        // Filtra per categoria
        if (currentFilter !== 'all') {
            notes = notes.filter(note => note.category === currentFilter);
        }
        
        // Filtra per ricerca
        if (currentSearch) {
            notes = notes.filter(note => 
                note.text.toLowerCase().includes(currentSearch) ||
                (note.info && note.info.toLowerCase().includes(currentSearch))
            );
        }
        
        if (notes.length === 0) {
            const emptyMessage = currentSearch || currentFilter !== 'all' 
                ? 'Nessuna carta trovata con i filtri attuali'
                : 'Nessuna carta salvata';
            notesContent.innerHTML = `
                <div class="empty-notes">
                    <i class="fas fa-search"></i>
                    <div>${emptyMessage}</div>
                    <div style="font-size: 10px; margin-top: 5px;">
                        ${currentSearch ? 'Prova a modificare la ricerca' : 'Inizia aggiungendo la tua prima carta!'}
                    </div>
                </div>
            `;
            return;
        }
        
        let html = '';
        notes.forEach(note => {
            const cardInfoHtml = note.info ? `<div class="note-info">${note.info}</div>` : '';
            const cardPriceHtml = note.price ? `<div class="note-price">${note.price}</div>` : '';
            const listingUrlHtml = note.listingUrl ? `<div class="note-url"><a href="${note.listingUrl}" target="_blank" class="note-link"><i class="fas fa-external-link-alt"></i> Inserzione</a></div>` : '';
            const cardTraderLink = note.cardTraderUrl ? 
                `<a href="${note.cardTraderUrl}" target="_blank" class="note-link"><i class="fas fa-search"></i> CardTrader</a>` :
                `<a href="https://cardtrader.com/search?q=${encodeURIComponent(note.text)}" target="_blank" class="note-link"><i class="fas fa-search"></i> Cerca su CardTrader</a>`;
            
            const categoryBadge = `<span class="note-category">${getCategoryIcon(note.category)} ${getCategoryName(note.category)}</span>`;
            
            html += `
                <div class="note-item fade-in">
                    <div class="note-header">
                        <div class="note-text">${note.text}</div>
                        ${categoryBadge}
                    </div>
                    ${cardInfoHtml}
                    ${cardPriceHtml}
                    ${listingUrlHtml}
                    <div class="note-date"><i class="fas fa-clock"></i> ${note.date}</div>
                    <div class="note-actions">
                        ${cardTraderLink}
                        <button class="delete-button" onclick="deleteNote(${note.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        notesContent.innerHTML = html;
    }
    
    // Elimina una nota
    window.deleteNote = function(noteId) {
        if (confirm('Sei sicuro di voler eliminare questa carta?')) {
            const notes = getNotes();
            const filteredNotes = notes.filter(note => note.id !== noteId);
            localStorage.setItem('pokemonCardNotes', JSON.stringify(filteredNotes));
            loadNotes();
            updateStats();
            showMessage('Carta eliminata', 'success');
        }
    };
    
    // Svuota tutte le note
    function clearAllNotes() {
        if (confirm('Sei sicuro di voler eliminare tutte le carte? Questa azione non può essere annullata.')) {
            localStorage.removeItem('pokemonCardNotes');
            loadNotes();
            updateStats();
            showMessage('Tutte le carte sono state eliminate', 'success');
        }
    }
    
    // Esporta le note
    function exportNotes() {
        const notes = getNotes();
        if (notes.length === 0) {
            showMessage('Nessuna carta da esportare', 'error');
            return;
        }
        
        const dataStr = JSON.stringify(notes, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `pokemon-cards-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        showMessage('Carte esportate con successo', 'success');
    }
    
    // Esporta tutti i dati
    function exportAllData() {
        const data = {
            notes: getNotes(),
            settings: getSettings(),
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
        
        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `pokemon-card-extension-backup-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        showMessage('Backup completo esportato', 'success');
    }
    
    // Importa tutti i dati
    function importAllData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    if (data.notes) {
                        localStorage.setItem('pokemonCardNotes', JSON.stringify(data.notes));
                    }
                    
                    if (data.settings) {
                        localStorage.setItem('pokemonCardSettings', JSON.stringify(data.settings));
                        initializeSettings();
                    }
                    
                    loadNotes();
                    updateStats();
                    showMessage('Dati importati con successo', 'success');
                } catch (error) {
                    showMessage('Errore nell\'importazione del file', 'error');
                }
            };
            reader.readAsText(file);
        };
        
        input.click();
    }
    
    // Aggiorna le statistiche
    function updateStats() {
        const notes = getNotes();
        const totalCards = notes.length;
        const wishlistCards = notes.filter(note => note.category === 'wishlist').length;
        const viewedCards = notes.filter(note => note.category === 'viewed').length;
        const favoriteCards = notes.filter(note => note.category === 'favorite').length;
        
        document.getElementById('totalCards').textContent = totalCards;
        document.getElementById('wishlistCards').textContent = wishlistCards;
        document.getElementById('viewedCards').textContent = viewedCards + favoriteCards;
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
    
    // Mostra un messaggio
    function showMessage(text, type = 'success') {
        const messageDiv = document.createElement('div');
        messageDiv.className = type === 'success' ? 'success-message' : 'error-message';
        messageDiv.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
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
    
    // Carica le impostazioni
    function getSettings() {
        const settings = localStorage.getItem('pokemonCardSettings');
        return settings ? JSON.parse(settings) : {
            autoDetection: true,
            priceNotifications: false,
            darkTheme: false
        };
    }
    
    // Salva le impostazioni
    function saveSettings(newSettings) {
        const currentSettings = getSettings();
        const updatedSettings = { ...currentSettings, ...newSettings };
        localStorage.setItem('pokemonCardSettings', JSON.stringify(updatedSettings));
    }
    
    // Controlla se c'è una carta da rilevare automaticamente
    async function checkForAutoDetection() {
        const settings = getSettings();
        if (!settings.autoDetection) return;
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab && (tab.url.includes('ebay') || tab.url.includes('vinted') || tab.url.includes('cardmarket'))) {
                console.log(`🔍 [Popup] Controllando pagina: ${tab.url}`);
                
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
                
                if (response && response.titleInfo && response.results) {
                    const bestMatch = response.results[0];
                    const cardNameText = bestMatch.name_en || bestMatch.pokemon_name || 'N/A';
                    const cardInfoText = `${bestMatch.expansion_name_en || bestMatch.expansion_code || ''} ${bestMatch.collector_number ? '#' + bestMatch.collector_number : ''}`.trim();
                    
                    // Salva i dati della carta corrente
                    currentCardData = {
                        name: cardNameText,
                        info: cardInfoText,
                        cardTraderUrl: `https://cardtrader.com/cards/${bestMatch.blueprint_id}`,
                        listingUrl: tab.url
                    };
                    
                    // Popola i campi
                    cardName.textContent = cardNameText;
                    cardInfo.textContent = cardInfoText;
                    cardPrice.textContent = 'Prezzo: N/A'; // Per ora, potrebbe essere aggiunto in futuro
                    
                    // Mostra l'URL dell'inserzione
                    const hostname = new URL(tab.url).hostname;
                    const siteName = hostname.includes('ebay') ? 'eBay' : 
                                   hostname.includes('vinted') ? 'Vinted' : 
                                   hostname.includes('cardmarket') ? 'Cardmarket' : 'Sito';
                    cardUrl.innerHTML = `<a href="${tab.url}" target="_blank"><i class="fas fa-external-link-alt"></i> ${siteName}</a>`;
                    
                    autoAddSection.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Errore nel controllo automatico:', error);
        }
    }
}); 