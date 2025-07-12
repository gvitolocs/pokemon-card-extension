// Popup script per Pokemon Card Trader Linker
document.addEventListener('DOMContentLoaded', function() {
    const resultSection = document.getElementById('resultSection');
    const resultContent = document.getElementById('resultContent');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    // Inizializza il popup
    initializePopup();
    
    // Inizializza il popup
    async function initializePopup() {
        try {
            // Verifica stato connessione
            checkConnectionStatus();
            
            // Se siamo su eBay/Vinted, cerca automaticamente
            await autoSearchCurrentPage();
            
        } catch (error) {
            console.error('Errore nell\'inizializzazione del popup:', error);
            updateStatus('error', 'Errore di inizializzazione');
        }
    }
    
    // Ricerca automatica sulla pagina corrente
    async function autoSearchCurrentPage() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab && (tab.url.includes('ebay') || tab.url.includes('vinted'))) {
                // Mostra messaggio di caricamento
                showLoading('🔍 Cercando carte nella pagina corrente...');
                
                // Chiedi al content script di estrarre il titolo e cercare
                const response = await new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(tab.id, { 
                        action: 'autoSearchCurrentPage'
                    }, function(response) {
                        if (chrome.runtime.lastError) {
                            reject(new Error('Errore di comunicazione con la pagina'));
                        } else if (response && response.success) {
                            resolve(response);
                        } else {
                            reject(new Error(response?.error || 'Errore sconosciuto'));
                        }
                    });
                });
                
                if (response.titleInfo && response.results) {
                    // Mostra i risultati automaticamente
                    displayResults(response.results, response.titleInfo);
                } else {
                    showNoResults('❌ Nessuna carta Pokemon trovata in questa pagina');
                }
            } else {
                showNoResults('⚠️ Apri una pagina eBay o Vinted per cercare carte');
            }
        } catch (error) {
            console.error('Errore nella ricerca automatica:', error);
            showNoResults('❌ Errore nella ricerca: ' + error.message);
        }
    }
    
    // Verifica lo stato della connessione
    async function checkConnectionStatus() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab && (tab.url.includes('ebay') || tab.url.includes('vinted'))) {
                chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }, function(response) {
                    if (chrome.runtime.lastError) {
                        updateStatus('disconnected', 'Non connesso');
                    } else if (response && response.connected) {
                        updateStatus('connected', 'Connesso a Supabase');
                    } else {
                        updateStatus('disconnected', 'Non connesso');
                    }
                });
            } else {
                updateStatus('disconnected', 'Non su eBay/Vinted');
            }
        } catch (error) {
            updateStatus('error', 'Errore di connessione');
        }
    }
    
    // Aggiorna lo stato visuale
    function updateStatus(status, message) {
        statusText.textContent = message;
        statusIndicator.className = 'status-indicator';
        
        switch (status) {
            case 'connected':
                statusIndicator.classList.add('status-connected');
                break;
            case 'disconnected':
                statusIndicator.classList.add('status-disconnected');
                break;
            case 'loading':
                statusIndicator.classList.add('status-loading');
                break;
            case 'error':
                statusIndicator.classList.add('status-disconnected');
                break;
        }
    }
    
    // Mostra messaggio di caricamento
    function showLoading(message) {
        resultContent.innerHTML = `<div class="loading">${message}</div>`;
        resultSection.style.display = 'block';
    }
    
    // Mostra messaggio di nessun risultato
    function showNoResults(message) {
        resultContent.innerHTML = `<div class="no-results">${message}</div>`;
        resultSection.style.display = 'block';
    }
    
    // Mostra i risultati
    function displayResults(results, titleInfo) {
        let html = '';
        
        // Filtra i duplicati basandosi su blueprint_id
        const uniqueResults = [];
        const seenBlueprintIds = new Set();
        
        results.forEach(result => {
            if (result.blueprint_id && !seenBlueprintIds.has(result.blueprint_id)) {
                seenBlueprintIds.add(result.blueprint_id);
                uniqueResults.push(result);
            }
        });
        
        console.log(`🔍 [Popup] Risultati originali: ${results.length}, unici: ${uniqueResults.length}`);
        
        // Mostra le prime 10 carte uniche con punteggio
        const maxResults = Math.min(uniqueResults.length, 10);
        uniqueResults.slice(0, maxResults).forEach((result, index) => {
            const score = calculateScore(result, titleInfo);
            const scoreClass = score >= 1500 ? 'score-perfect' : score >= 1000 ? 'score-good' : 'score-low';
            const scoreText = score >= 1500 ? 'Perfetto' : score >= 1000 ? 'Buono' : 'Basso';
            let extra = '';
            if (result.collector_number) extra += ` (#${result.collector_number})`;
            if (result.expansion_code) extra += ` [${result.expansion_code}]`;
            html += `
                <div class="result-item">
                    <a href="${generateCardTraderLink(result.blueprint_id)}" target="_blank" class="result-link">
                        #${index + 1} ${result.name_en || result.pokemon_name || 'N/A'}${extra}
                        <span class="score-badge ${scoreClass}">${scoreText}</span>
                    </a>
                    <div class="card-info">
                        ${result.expansion_name_en || result.expansion_name || 'N/A'}
                        ${result.collector_number ? '• #' + result.collector_number : ''}
                        ${result.expansion_code ? '• [' + result.expansion_code + ']' : ''}
                        • ${result.image_url ? '🖼️' : '❌'}
                    </div>
                </div>
            `;
        });
        
        resultContent.innerHTML = html;
        resultSection.style.display = 'block';
    }
    
    // Funzione per calcolare il punteggio di una carta
    function calculateScore(result, titleInfo) {
        let score = 0;
        
        // Punteggio base per nome Pokemon (1000 punti)
        const name = (result.name_en || result.pokemon_name || '').toLowerCase();
        if (name.includes(titleInfo.pokemonName)) {
            score += 1000;
        }
        
        // Punteggio per numero collezionista (500 punti)
        if (titleInfo.collectorNumber && result.collector_number === titleInfo.collectorNumber) {
            score += 500;
        }
        
        // Punteggio per espansione (200 punti)
        if (titleInfo.expansion) {
            const expansion = (result.expansion_name_en || result.expansion_name || '').toLowerCase();
            if (expansion.includes(titleInfo.expansion.toLowerCase())) {
                score += 200;
            }
        }
        
        // Bonus per image_url (100 punti)
        if (result.image_url) {
            score += 100;
        }
        
        // Bonus per source 'card_variants' (50 punti)
        if (result.source === 'card_variants') {
            score += 50;
        }
        
        return score;
    }
    
    // Funzione per generare link CardTrader
    function generateCardTraderLink(blueprintId) {
        return `https://cardtrader.com/cards/${blueprintId}`;
    }
}); 