// Popup script per Pokemon Card Trader Linker
document.addEventListener('DOMContentLoaded', function() {
    const titleInput = document.getElementById('titleInput');
    const searchButton = document.getElementById('searchButton');
    const resultSection = document.getElementById('resultSection');
    const resultContent = document.getElementById('resultContent');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const toggleButton = document.getElementById('toggleButton');
    const cardsProcessed = document.getElementById('cardsProcessed');
    const linksGenerated = document.getElementById('linksGenerated');
    
    let isExtensionEnabled = true;
    let stats = {
        cardsProcessed: 0,
        linksGenerated: 0
    };
    
    // Inizializza il popup
    initializePopup();
    
    // Event listeners
    searchButton.addEventListener('click', handleSearch);
    titleInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    toggleButton.addEventListener('click', toggleExtension);
    
    // Inizializza il popup
    async function initializePopup() {
        try {
            // Carica statistiche
            const result = await chrome.storage.local.get(['stats', 'extensionEnabled']);
            if (result.stats) {
                stats = result.stats;
                updateStats();
            }
            
            if (result.extensionEnabled !== undefined) {
                isExtensionEnabled = result.extensionEnabled;
                updateToggleButton();
            }
            
            // Verifica stato connessione
            checkConnectionStatus();
            
            // Aggiorna statistiche ogni 2 secondi
            setInterval(updateStatsFromStorage, 2000);
            
        } catch (error) {
            console.error('Errore nell\'inizializzazione del popup:', error);
            updateStatus('error', 'Errore di inizializzazione');
        }
    }
    
    // Verifica lo stato della connessione
    async function checkConnectionStatus() {
        try {
            // Invia messaggio al content script per verificare lo stato
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
    
    // Gestisce la ricerca manuale
    async function handleSearch() {
        const title = titleInput.value.trim();
        
        if (!title) {
            showResult('⚠️ Inserisci un titolo da cercare', 'error');
            return;
        }
        
        searchButton.disabled = true;
        searchButton.textContent = '🔍 Cercando...';
        
        try {
            // Estrai informazioni dal titolo
            const titleInfo = extractTitleInfo(title);
            
            if (!titleInfo.pokemonName) {
                showResult('❌ Nessun Pokemon trovato nel titolo', 'error');
                return;
            }
            
            // Cerca nel database
            const results = await searchCardInDatabase(titleInfo);
            
            if (results.length === 0) {
                showResult('❌ Nessuna carta trovata nel database', 'error');
                return;
            }
            
            // Mostra i risultati
            displayResults(results, titleInfo);
            
            // Aggiorna statistiche
            stats.linksGenerated += results.length;
            await saveStats();
            updateStats();
            
        } catch (error) {
            console.error('Errore nella ricerca:', error);
            showResult('❌ Errore durante la ricerca: ' + error.message, 'error');
        } finally {
            searchButton.disabled = false;
            searchButton.textContent = '🔍 Cerca Carta';
        }
    }
    
    // Mostra i risultati
    function displayResults(results, titleInfo) {
        let html = `<div class="result-item">
            <strong>🎯 Carte trovate (${results.length}):</strong><br>
            <small>Ordinate per punteggio di corrispondenza</small>
        </div>`;
        
        // Mostra le prime 5 carte con punteggio (per non sovraccaricare il popup)
        const maxResults = Math.min(results.length, 5);
        results.slice(0, maxResults).forEach((result, index) => {
            const score = calculateScore(result, titleInfo);
            const scoreColor = score >= 1500 ? '#4CAF50' : score >= 1000 ? '#FF9800' : '#F44336';
            const scoreText = score >= 1500 ? 'Perfetto' : score >= 1000 ? 'Buono' : 'Basso';
            
            html += `
                <div class="result-item">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <strong>#${index + 1} ${result.name_en || result.pokemon_name || 'N/A'}</strong>
                        <span style="background: ${scoreColor}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold;">
                            ${scoreText} (${score})
                        </span>
                    </div>
                    <div style="font-size: 11px; margin-bottom: 8px;">
                        <strong>Espansione:</strong> ${result.expansion_name_en || result.expansion_name || 'N/A'}<br>
                        <strong>Numero:</strong> ${result.collector_number || 'N/A'}<br>
                        <strong>Fonte:</strong> ${result.source || 'cards'}<br>
                        ${result.image_url ? '🖼️ Ha immagine' : '❌ Nessuna immagine'}
                    </div>
                    <a href="${generateCardTraderLink(result.blueprint_id)}" target="_blank" class="result-link">
                        🔗 Apri su CardTrader
                    </a>
                </div>
            `;
        });
        
        // Aggiungi messaggio se ci sono più risultati
        if (results.length > 5) {
            html += `<div class="result-item" style="text-align: center; font-style: italic; opacity: 0.7;">
                <small>... e altre ${results.length - 5} carte trovate</small>
            </div>`;
        }
        
        resultContent.innerHTML = html;
        resultSection.style.display = 'block';
    }
    
    // Mostra un messaggio di risultato
    function showResult(message, type = 'info') {
        resultContent.innerHTML = `<div class="result-item">${message}</div>`;
        resultSection.style.display = 'block';
    }
    
    // Toggle dell'estensione
    async function toggleExtension() {
        isExtensionEnabled = !isExtensionEnabled;
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab && (tab.url.includes('ebay') || tab.url.includes('vinted'))) {
                chrome.tabs.sendMessage(tab.id, { action: 'toggle' }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.log('Tab non supportata');
                    }
                });
            }
            
            await chrome.storage.local.set({ extensionEnabled: isExtensionEnabled });
            updateToggleButton();
            
        } catch (error) {
            console.error('Errore nel toggle dell\'estensione:', error);
        }
    }
    
    // Aggiorna il pulsante toggle
    function updateToggleButton() {
        if (isExtensionEnabled) {
            toggleButton.textContent = '⏸️ Pausa Estensione';
            toggleButton.classList.remove('paused');
        } else {
            toggleButton.textContent = '▶️ Attiva Estensione';
            toggleButton.classList.add('paused');
        }
    }
    
    // Aggiorna le statistiche
    function updateStats() {
        cardsProcessed.textContent = stats.cardsProcessed;
        linksGenerated.textContent = stats.linksGenerated;
    }
    
    // Aggiorna statistiche dal storage
    async function updateStatsFromStorage() {
        try {
            const result = await chrome.storage.local.get(['stats']);
            if (result.stats) {
                stats = result.stats;
                updateStats();
            }
        } catch (error) {
            console.error('Errore nell\'aggiornamento statistiche:', error);
        }
    }
    
    // Salva le statistiche
    async function saveStats() {
        try {
            await chrome.storage.local.set({ stats: stats });
        } catch (error) {
            console.error('Errore nel salvataggio statistiche:', error);
        }
    }
    
    // Funzione per estrarre informazioni dal titolo
    function extractTitleInfo(title) {
        const titleLower = title.toLowerCase();
        
        // Lista Pokemon (versione ridotta)
        const pokemonList = [
            'pikachu', 'charizard', 'jolteon', 'glaceon', 'lugia', 'ho-oh', 'mewtwo', 'mew',
            'bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'squirtle', 'wartortle', 'blastoise',
            'eevee', 'vaporeon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'sylveon'
        ];
        
        let pokemonName = null;
        for (const pokemon of pokemonList) {
            if (titleLower.includes(pokemon.toLowerCase())) {
                pokemonName = pokemon.toLowerCase();
                break;
            }
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
            // Usa l'API di Supabase direttamente
            const supabaseUrl = 'https://msngrrrihwudtnyjatlo.supabase.co';
            const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbmdycnJpaHd1ZHRueWphdGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNTU2NTIsImV4cCI6MjA2NTkzMTY1Mn0.Y0D-FHepxqXznrg2W0n_NOJkgY--GOPJD4EoloK94Yo';
            
            const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
            
            let allResults = [];
            
            // Cerca nelle carte
            const { data: cards, error: cardsError } = await supabase
                .from('cards')
                .select('*')
                .ilike('name_en', `%${titleInfo.pokemonName}%`)
                .limit(10);
            
            if (!cardsError && cards && cards.length > 0) {
                allResults.push(...cards.map(card => ({ ...card, source: 'cards' })));
            }
            
            // Se abbiamo un numero collezionista, cerca anche nelle varianti
            if (titleInfo.collectorNumber) {
                const { data: pokemonCards, error: pokemonError } = await supabase
                    .from('cards')
                    .select('blueprint_id, name_en, expansion_name_en, expansion_code')
                    .ilike('name_en', `%${titleInfo.pokemonName}%`);
                
                if (!pokemonError && pokemonCards && pokemonCards.length > 0) {
                    const blueprintIds = pokemonCards.map(card => card.blueprint_id).filter(id => id);
                    
                    const { data: variants, error: variantsError } = await supabase
                        .from('card_variants')
                        .select('*')
                        .in('blueprint_id', blueprintIds)
                        .eq('collector_number', titleInfo.collectorNumber);
                    
                    if (!variantsError && variants && variants.length > 0) {
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
            
            // Sistema di punteggi
            const scoredResults = allResults.map(result => {
                let score = 0;
                
                // Punteggio per nome Pokemon
                const name = (result.name_en || result.pokemon_name || '').toLowerCase();
                if (name.includes(titleInfo.pokemonName)) {
                    score += 1000;
                }
                
                // Punteggio per numero collezionista
                if (titleInfo.collectorNumber && result.collector_number === titleInfo.collectorNumber) {
                    score += 500;
                }
                
                // Punteggio per espansione
                if (titleInfo.expansion) {
                    const expansion = (result.expansion_name_en || result.expansion_name || '').toLowerCase();
                    if (expansion.includes(titleInfo.expansion.toLowerCase())) {
                        score += 200;
                    }
                }
                
                // Bonus per image_url
                if (result.image_url) {
                    score += 100;
                }
                
                return { result, score };
            });
            
            // Ordina per punteggio
            scoredResults.sort((a, b) => b.score - a.score);
            
            // Ritorna solo i risultati con punteggio > 0
            return scoredResults
                .filter(item => item.score > 0)
                .map(item => item.result)
                .slice(0, 5);
                
        } catch (error) {
            console.error('Errore nella ricerca database:', error);
            throw error;
        }
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