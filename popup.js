// Popup script per Blocco Note Carte Pokemon
let currentCardData = null;

document.addEventListener('DOMContentLoaded', function() {
    const cardInput = document.getElementById('cardInput');
    const addButton = document.getElementById('addButton');
    const clearButton = document.getElementById('clearButton');
    const notesContent = document.getElementById('notesContent');
    const autoAddSection = document.getElementById('autoAddSection');
    const cardName = document.getElementById('cardName');
    const cardInfo = document.getElementById('cardInfo');
    const cardPrice = document.getElementById('cardPrice');
    const cardUrl = document.getElementById('cardUrl');
    const saveCardButton = document.getElementById('saveCardButton');
    const viewCardButton = document.getElementById('viewCardButton');
    
    // Inizializza il blocco note
    initializeNotepad();
    
    // Event listeners
    addButton.addEventListener('click', addCard);
    clearButton.addEventListener('click', clearAllNotes);
    cardInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addCard();
        }
    });
    saveCardButton.addEventListener('click', saveCurrentCard);
    viewCardButton.addEventListener('click', viewCurrentCard);
    
    // Inizializza il blocco note
    function initializeNotepad() {
        loadNotes();
        checkForAutoDetection();
    }
    
    // Aggiunge una carta manualmente
    function addCard() {
        const cardText = cardInput.value.trim();
        if (!cardText) {
            return;
        }
        
        const note = {
            id: Date.now(),
            text: cardText,
            date: new Date().toLocaleString('it-IT'),
            type: 'manual'
        };
        
        saveNote(note);
        cardInput.value = '';
        loadNotes();
    }
    
    // Salva la carta corrente
    function saveCurrentCard() {
        const cardText = cardName.textContent;
        if (!cardText) {
            return;
        }
        
        const note = {
            id: Date.now(),
            text: cardText,
            info: cardInfo.textContent,
            price: cardPrice.textContent,
            listingUrl: currentCardData?.listingUrl || '',
            date: new Date().toLocaleString('it-IT'),
            type: 'current',
            cardTraderUrl: currentCardData?.cardTraderUrl || ''
        };
        
        saveNote(note);
        showSaveConfirmation();
        loadNotes();
    }
    
    // Visualizza la carta corrente su CardTrader
    function viewCurrentCard() {
        if (currentCardData?.cardTraderUrl) {
            chrome.tabs.create({ url: currentCardData.cardTraderUrl });
        }
    }
    
    // Mostra conferma di salvataggio
    function showSaveConfirmation() {
        const originalText = saveCardButton.textContent;
        saveCardButton.textContent = '✅ Salvata!';
        saveCardButton.style.background = '#4CAF50';
        
        setTimeout(() => {
            saveCardButton.textContent = originalText;
            saveCardButton.style.background = '#4CAF50';
        }, 2000);
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
        const notes = getNotes();
        
        if (notes.length === 0) {
            notesContent.innerHTML = '<div class="empty-notes">Nessuna carta salvata</div>';
            return;
        }
        
        let html = '';
        notes.forEach(note => {
            const cardInfoHtml = note.info ? `<div class="note-info">${note.info}</div>` : '';
            const cardPriceHtml = note.price ? `<div class="note-price">${note.price}</div>` : '';
            const listingUrlHtml = note.listingUrl ? `<div class="note-url"><a href="${note.listingUrl}" target="_blank" class="note-link">🔗 Inserzione</a></div>` : '';
            const cardTraderLink = note.cardTraderUrl ? 
                `<a href="${note.cardTraderUrl}" target="_blank" class="note-link">🔗 CardTrader</a>` :
                `<a href="https://cardtrader.com/search?q=${encodeURIComponent(note.text)}" target="_blank" class="note-link">🔍 Cerca su CardTrader</a>`;
            
            html += `
                <div class="note-item">
                    <div class="note-text">${note.text}</div>
                    ${cardInfoHtml}
                    ${cardPriceHtml}
                    ${listingUrlHtml}
                    <div class="note-date">${note.date}</div>
                    <div class="note-actions">
                        ${cardTraderLink}
                        <button class="delete-button" onclick="deleteNote(${note.id})">🗑️</button>
                    </div>
                </div>
            `;
        });
        
        notesContent.innerHTML = html;
    }
    
    // Elimina una nota
    window.deleteNote = function(noteId) {
        const notes = getNotes();
        const filteredNotes = notes.filter(note => note.id !== noteId);
        localStorage.setItem('pokemonCardNotes', JSON.stringify(filteredNotes));
        loadNotes();
    };
    
    // Svuota tutte le note
    function clearAllNotes() {
        if (confirm('Sei sicuro di voler eliminare tutte le carte?')) {
            localStorage.removeItem('pokemonCardNotes');
            loadNotes();
        }
    }
    
    // Controlla se c'è una carta da rilevare automaticamente
    async function checkForAutoDetection() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab && (tab.url.includes('ebay') || tab.url.includes('vinted') || tab.url.includes('cardmarket'))) {
                // Chiedi al content script di estrarre il titolo
                const response = await new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(tab.id, { 
                        action: 'autoSearchCurrentPage'
                    }, function(response) {
                        if (chrome.runtime.lastError) {
                            resolve(null);
                        } else if (response && response.success && response.results && response.results.length > 0) {
                            resolve(response);
                        } else {
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
                    cardUrl.innerHTML = `<a href="${tab.url}" target="_blank">🔗 ${siteName}</a>`;
                    
                    autoAddSection.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Errore nel controllo automatico:', error);
        }
    }
}); 