// Popup script per Blocco Note Carte Pokemon
document.addEventListener('DOMContentLoaded', function() {
    const cardInput = document.getElementById('cardInput');
    const addButton = document.getElementById('addButton');
    const clearButton = document.getElementById('clearButton');
    const notesContent = document.getElementById('notesContent');
    const autoAddSection = document.getElementById('autoAddSection');
    const autoAddText = document.getElementById('autoAddText');
    const autoAddButton = document.getElementById('autoAddButton');
    
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
    autoAddButton.addEventListener('click', addAutoDetectedCard);
    
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
    
    // Aggiunge una carta rilevata automaticamente
    function addAutoDetectedCard() {
        const cardText = autoAddText.textContent;
        if (!cardText) {
            return;
        }
        
        const note = {
            id: Date.now(),
            text: cardText,
            date: new Date().toLocaleString('it-IT'),
            type: 'auto'
        };
        
        saveNote(note);
        autoAddSection.style.display = 'none';
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
        const notes = getNotes();
        
        if (notes.length === 0) {
            notesContent.innerHTML = '<div class="empty-notes">Nessuna carta salvata</div>';
            return;
        }
        
        let html = '';
        notes.forEach(note => {
            html += `
                <div class="note-item">
                    <div class="note-text">${note.text}</div>
                    <div class="note-date">${note.date}</div>
                    <div class="note-actions">
                        <a href="https://cardtrader.com/search?q=${encodeURIComponent(note.text)}" target="_blank" class="note-link">🔍 Cerca su CardTrader</a>
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
            
            if (tab && (tab.url.includes('ebay') || tab.url.includes('vinted'))) {
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
                    const cardText = `${bestMatch.name_en || bestMatch.pokemon_name || 'N/A'} ${bestMatch.expansion_code ? '[' + bestMatch.expansion_code + ']' : ''} ${bestMatch.collector_number ? '#' + bestMatch.collector_number : ''}`.trim();
                    
                    autoAddText.textContent = cardText;
                    autoAddSection.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Errore nel controllo automatico:', error);
        }
    }
}); 