// Logica per il popup dell'estensione Pokemon Card Trader Linker

document.addEventListener('DOMContentLoaded', function() {
    const titleInput = document.getElementById('titleInput');
    const generateButton = document.getElementById('generateButton');
    const resultDiv = document.getElementById('result');
    
    // Inizializza Supabase
    initializeSupabase().then(success => {
        if (!success) {
            showResult('❌ Errore di connessione a Supabase. Verifica la configurazione.', 'error');
        }
    });
    
    // Gestisce il click sul pulsante di generazione
    generateButton.addEventListener('click', async function() {
        const title = titleInput.value.trim();
        
        if (!title) {
            showResult('❌ Inserisci un titolo da analizzare', 'error');
            return;
        }
        
        if (!isSupabaseConfigured()) {
            showResult('❌ Supabase non configurato. Riprova tra qualche secondo.', 'error');
            return;
        }
        
        // Mostra stato di caricamento
        generateButton.disabled = true;
        generateButton.textContent = '⏳ Analizzando...';
        showResult('🔍 Analizzando il titolo...', 'info');
        
        try {
            // Estrai informazioni dal titolo
            const titleInfo = extractTitleInfo(title);
            
            if (!titleInfo.pokemonName) {
                showResult('❌ Nessun Pokemon trovato nel titolo', 'error');
                return;
            }
            
            // Cerca nel database Supabase
            const results = await searchCardInDatabase(titleInfo);
            
            if (results.length === 0) {
                showResult('❌ Nessuna carta trovata nel database', 'error');
                return;
            }
            
            // Mostra i risultati
            displayResults(results, titleInfo);
            
        } catch (error) {
            console.error('Errore durante l\'analisi:', error);
            showResult('❌ Errore durante l\'analisi: ' + error.message, 'error');
        } finally {
            // Ripristina il pulsante
            generateButton.disabled = false;
            generateButton.textContent = '🔗 Genera Link CardTrader';
        }
    });
    
    // Gestisce l'invio con Enter
    titleInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !generateButton.disabled) {
            generateButton.click();
        }
    });
    
    // Funzione per mostrare i risultati
    function displayResults(results, titleInfo) {
        const bestMatch = results[0];
        
        let html = `
            <h4>✅ Carta trovata:</h4>
            <p><strong>Pokemon:</strong> ${bestMatch.name_en || bestMatch.pokemon_name || 'N/A'}</p>
            <p><strong>Espansione:</strong> ${bestMatch.expansion_name_en || bestMatch.expansion_name || 'N/A'}</p>
            <p><strong>Numero:</strong> ${bestMatch.collector_number || 'N/A'}</p>
        `;
        
        if (bestMatch.blueprint_id) {
            const cardTraderLink = generateCardTraderLink(bestMatch.blueprint_id);
            html += `
                <div style="margin-top: 15px;">
                    <a href="${cardTraderLink}" target="_blank" class="pokemon-card-linker-popup-button" style="text-decoration: none; display: inline-block;">
                        🔗 Apri su CardTrader
                    </a>
                </div>
            `;
        }
        
        if (results.length > 1) {
            html += `
                <div style="margin-top: 15px; font-size: 12px; color: #666;">
                    <p>📋 Trovate ${results.length} varianti. Mostrata la migliore.</p>
                </div>
            `;
        }
        
        showResult(html, 'success');
    }
    
    // Funzione per mostrare messaggi
    function showResult(message, type = 'info') {
        resultDiv.style.display = 'block';
        resultDiv.className = `pokemon-card-linker-popup-result ${type}`;
        resultDiv.innerHTML = message;
    }
});

// Funzione per estrarre informazioni dal titolo (semplificata per il popup)
function extractTitleInfo(title) {
    const titleLower = title.toLowerCase();
    
    // Lista Pokemon (versione ridotta per il popup)
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
    
    // Estrai numero collezionista
    const numberMatch = titleLower.match(/(\d+)\/(\d+)/);
    const collectorNumber = numberMatch ? numberMatch[1] : null;
    
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

// Funzione per cercare nel database (semplificata per il popup)
async function searchCardInDatabase(titleInfo) {
    const supabaseClient = getSupabaseClient();
    
    if (!supabaseClient) {
        throw new Error('Supabase non configurato');
    }
    
    let allResults = [];
    
    // Cerca nelle carte
    const { data: cards, error: cardsError } = await supabaseClient
        .from('cards')
        .select('*')
        .ilike('name_en', `%${titleInfo.pokemonName}%`)
        .limit(10);
    
    if (!cardsError && cards && cards.length > 0) {
        allResults.push(...cards.map(card => ({ ...card, source: 'cards' })));
    }
    
    // Se abbiamo un numero collezionista, cerca anche nelle varianti
    if (titleInfo.collectorNumber) {
        const { data: pokemonCards, error: pokemonError } = await supabaseClient
            .from('cards')
            .select('blueprint_id, name_en, expansion_name_en, expansion_code')
            .ilike('name_en', `%${titleInfo.pokemonName}%`);
        
        if (!pokemonError && pokemonCards && pokemonCards.length > 0) {
            const blueprintIds = pokemonCards.map(card => card.blueprint_id).filter(id => id);
            
            const { data: variants, error: variantsError } = await supabaseClient
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
    
    // Sistema di punteggi semplificato
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
        
        return { result, score };
    });
    
    // Ordina per punteggio
    scoredResults.sort((a, b) => b.score - a.score);
    
    // Ritorna solo i risultati con punteggio > 0
    return scoredResults
        .filter(item => item.score > 0)
        .map(item => item.result)
        .slice(0, 5); // Massimo 5 risultati
} 