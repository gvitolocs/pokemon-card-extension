// CardTrader API v2 Integration
class CardTraderAPI {
    constructor() {
        this.baseURL = API_CONFIG.baseURL;
        this.cache = new Map();
        this.cacheTimeout = API_CONFIG.cacheTimeout;
        this.requestCount = 0;
        this.lastRequestTime = 0;
        this.lastMarketplaceRequest = 0;
        this.pokemonGameId = null;
        this.expansions = new Map();
        this.blueprints = new Map();
    }

    // Funzione per estrarre informazioni dalla carta dal titolo
    extractCardInfo(title) {
        const cleanedTitle = title.toLowerCase().trim();
        
        // Rimuovi caratteri speciali e parentesi
        let processedTitle = cleanedTitle
            .replace(/[()\[\]{}]/g, ' ')  // Rimuovi parentesi
            .replace(/[^\w\s-]/g, ' ')    // Rimuovi caratteri speciali
            .replace(/\s+/g, ' ')         // Normalizza spazi
            .trim();
        
        // Rimuovi parole comuni che non sono nomi di Pokemon
        const commonWords = ['pokemon', 'card', 'tcg', 'sealed', 'new', 'mint', 'condition', 'rare', 'ultra', 'secret'];
        
        for (const word of commonWords) {
            processedTitle = processedTitle.replace(new RegExp(`\\b${word}\\b`, 'g'), ' ').trim();
        }
        
        // Cerca pattern comuni per tipi di carta
        const typePatterns = {
            'vmax': /vmax|v\s*max/i,
            'v': /(?<!v\s*max)\bv\b/i,
            'gx': /gx/i,
            'ex': /ex/i,
            'holo': /holo|holofoil/i,
            'reverse holo': /reverse\s*holo|reverse\s*holofoil/i,
            'full art': /full\s*art/i,
            'secret rare': /secret\s*rare|ultra\s*rare/i
        };
        
        let cardType = null;
        for (const [type, pattern] of Object.entries(typePatterns)) {
            if (pattern.test(cleanedTitle)) {
                cardType = type;
                break;
            }
        }
        
        // Estrai informazioni sul set
        const set = this.extractSet(cleanedTitle);
        
        // Estrai il nome del Pokemon
        let pokemonName = this.extractPokemonName(processedTitle, typePatterns);
        
        // Gestisci casi speciali di nomi italiani
        if (pokemonName.includes('di ')) {
            const englishVariants = {
                'ho-oh di armonio': 'ho-oh',
                'ho-oh di ethan': 'ho-oh',
                'charizard di leon': 'charizard',
                'pikachu di ash': 'pikachu'
            };
            
            const englishName = englishVariants[pokemonName.toLowerCase()];
            if (englishName) {
                return {
                    pokemonName: englishName,
                    originalName: pokemonName,
                    cardType: cardType,
                    set: set
                };
            }
        }
        
        return {
            pokemonName: pokemonName,
            cardType: cardType,
            set: set
        };
    }

    // Estrae il nome del Pokemon dal titolo processato
    extractPokemonName(processedTitle, typePatterns) {
        const words = processedTitle.split(/\s+/).filter(word => word.length > 0);
        let nameWords = [];
        
        for (const word of words) {
            // Salta parole che sono tipi di carta, numeri o caratteri speciali
            if (Object.keys(typePatterns).some(type => type.includes(word)) || 
                /^\d+$/.test(word) || 
                /^(vmax|v|gx|ex|holo|reverse|full|art|secret|ultra|rare)$/i.test(word) ||
                /^[^\w-]+$/.test(word)) {  // Salta caratteri speciali
                continue;
            }
            
            nameWords.push(word);
            
            // Limita a 2-3 parole per il nome del Pokemon
            if (nameWords.length >= 3) break;
        }
        
        let pokemonName = nameWords.join(' ').trim();
        
        // Se non abbiamo un nome valido, prova pattern specifici
        if (!pokemonName || pokemonName.length < 2) {
            // Pattern per nomi composti come "Ho-Oh", "Porygon-Z", etc.
            const compoundPattern = /([a-zA-Z]+(?:-[a-zA-Z]+)*)/;
            const match = processedTitle.match(compoundPattern);
            if (match) {
                pokemonName = match[1];
            }
        }
        
        return pokemonName;
    }



    // Estrae informazioni sul set dal titolo
    extractSet(title) {
        const sets = [
            'base set', 'jungle', 'fossil', 'team rocket', 'gym heroes', 'gym challenge',
            'neo genesis', 'neo discovery', 'neo revelation', 'neo destiny',
            'legendary collection', 'expedition', 'aquapolis', 'skyridge',
            'ruby & sapphire', 'sandstorm', 'dragon', 'team magma vs team aqua',
            'hidden legends', 'firered & leafgreen', 'team rocket returns',
            'deoxys', 'emerald', 'unseen forces', 'delta species', 'legend maker',
            'holon phantoms', 'crystal guardians', 'dragon frontiers', 'power keepers',
            'diamond & pearl', 'mysterious treasures', 'secret wonders', 'great encounters',
            'majestic dawn', 'legends awakened', 'stormfront', 'platinum',
            'rising rivals', 'supreme victors', 'arceus', 'heartgold & soulsilver',
            'unleashed', 'undaunted', 'triumphant', 'call of legends', 'black & white',
            'emerging powers', 'noble victories', 'next destinies', 'dark explorers',
            'dragons exalted', 'boundaries crossed', 'plasma storm', 'plasma freeze',
            'plasma blast', 'legendary treasures', 'xy', 'flashfire', 'furious fists',
            'phantom forces', 'primal clash', 'roaring skies', 'ancient origins',
            'breakthrough', 'breakpoint', 'generations', 'fates collide',
            'steam siege', 'evolutions', 'sun & moon', 'guardians rising',
            'burning shadows', 'shining legends', 'crimson invasion', 'ultra prism',
            'forbidden light', 'celestial storm', 'dragon majesty', 'lost thunder',
            'team up', 'detective pikachu', 'unbroken bonds', 'unified minds',
            'hidden fates', 'cosmic eclipse', 'sword & shield', 'rebel clash',
            'darkness ablaze', 'champions path', 'vivid voltage', 'shining fates',
            'battle styles', 'chilling reign', 'evolving skies', 'fusion strike',
            'brilliant stars', 'astral radiance', 'lost origin', 'silver tempest',
            'scarlet & violet', 'paldea evolved', 'obsidian flames', '151',
            'paradox rift', 'paldean fates', 'temporal forces', 'twilight masquerade',
            'black star promo', 'black star promos', 'wizards black star promo', 'wizards black star promos'
        ];

        for (const set of sets) {
            if (title.includes(set.toLowerCase())) {
                return set;
            }
        }

        return null;
    }

    // Inizializza l'API ottenendo le informazioni necessarie
    async initialize() {
        if (!API_CONFIG.authToken) {
            console.warn('CardTrader API: Token di autenticazione non configurato');
            return false;
        }

        try {
            // Ottieni l'ID del gioco Pokemon
            await this.getPokemonGameId();
            
            // Precarica le espansioni Pokemon
            await this.loadPokemonExpansions();
            
            console.log('CardTrader API: Inizializzazione completata');
            return true;
        } catch (error) {
            console.error('CardTrader API: Errore durante l\'inizializzazione:', error);
            return false;
        }
    }

    // Ottieni l'ID del gioco Pokemon
    async getPokemonGameId() {
        if (this.pokemonGameId) {
            return this.pokemonGameId;
        }

        const response = await this.makeRequest('/games');
        const games = response.data || response;
        
        const pokemonGame = games.find(game => 
            game.name.toLowerCase() === 'pokemon' || 
            game.name.toLowerCase() === 'pokémon' ||
            game.display_name.toLowerCase().includes('pokemon') ||
            game.display_name.toLowerCase().includes('pokémon')
        );
        
        if (pokemonGame) {
            this.pokemonGameId = pokemonGame.id;
            API_CONFIG.pokemonGameId = pokemonGame.id;
            console.log('CardTrader API: Pokemon Game ID trovato:', this.pokemonGameId);
            console.log('CardTrader API: Pokemon Game trovato:', pokemonGame);
        } else {
            console.error('CardTrader API: Giochi disponibili:', games.map(g => ({ name: g.name, display_name: g.display_name })));
            throw new Error('Pokemon game non trovato nelle API');
        }
        
        return this.pokemonGameId;
    }

    // Carica le espansioni Pokemon
    async loadPokemonExpansions() {
        if (!this.pokemonGameId) {
            await this.getPokemonGameId();
        }

                    const response = await this.makeRequest('/expansions');
            const allExpansions = response.data || response;
            
            // Assicurati che sia un array
            if (!Array.isArray(allExpansions)) {
                console.error('CardTrader API: Risposta espansioni non è un array:', allExpansions);
                return;
            }
        
        // Filtra solo le espansioni Pokemon
        const pokemonExpansions = allExpansions.filter(expansion => 
            expansion.game_id === this.pokemonGameId
        );
        
        // Salva nella cache
        pokemonExpansions.forEach(expansion => {
            this.expansions.set(expansion.id, expansion);
            this.expansions.set(expansion.code.toLowerCase(), expansion);
            this.expansions.set(expansion.name.toLowerCase(), expansion);
        });
        
        console.log('CardTrader API: Caricate', pokemonExpansions.length, 'espansioni Pokemon');
    }

    // Controlla il rate limiting
    checkRateLimit() {
        const now = Date.now();
        if (now - this.lastRequestTime > API_CONFIG.rateLimit.windowMs) {
            this.requestCount = 0;
            this.lastRequestTime = now;
        }
        
        if (this.requestCount >= API_CONFIG.rateLimit.maxRequests) {
            throw new Error('Rate limit exceeded');
        }
        
        this.requestCount++;
    }

    // Controlla il rate limiting specifico per marketplace
    checkMarketplaceRateLimit() {
        const now = Date.now();
        if (now - this.lastMarketplaceRequest < API_CONFIG.rateLimit.marketplaceDelay) {
            const delay = API_CONFIG.rateLimit.marketplaceDelay - (now - this.lastMarketplaceRequest);
            throw new Error(`Marketplace rate limit: attendere ${delay}ms`);
        }
        this.lastMarketplaceRequest = now;
    }

    // Metodo generico per fare richieste API
    async makeRequest(endpoint, options = {}) {
        if (!API_CONFIG.authToken) {
            throw new Error('Token di autenticazione non configurato');
        }

        this.checkRateLimit();

        const url = `${this.baseURL}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.requestTimeout);

        try {
            const response = await fetch(url, {
                method: options.method || 'GET',
                headers: {
                    ...API_CONFIG.defaultHeaders,
                    'Authorization': `Bearer ${API_CONFIG.authToken}`,
                    ...options.headers
                },
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            // Gestisci il formato di risposta CardTrader v2
            // Le risposte possono essere {array: [...]} o array diretto
            if (data && data.array) {
                return data.array;
            }
            
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    // Cerca una carta su CardTrader usando le API v2
    async searchCard(cardInfo) {
        const cacheKey = JSON.stringify(cardInfo);
        
        // Controlla la cache
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.result;
            }
        }

        try {
            // Inizializza l'API se necessario
            if (!this.pokemonGameId) {
                await this.initialize();
            }

            console.log('CardTrader API: Ricerca iniziata per:', cardInfo.pokemonName);
            console.log('CardTrader API: Informazioni carta complete:', cardInfo);
            console.log('CardTrader API: Espansioni caricate:', this.expansions.size);

            // PRIMA: Cerca specificamente nei blueprint Ho-Oh se stiamo cercando Ho-Oh
            if (cardInfo.pokemonName.toLowerCase().includes('ho-oh') || 
                cardInfo.pokemonName.toLowerCase().includes('hooh') ||
                cardInfo.pokemonName.toLowerCase().includes('ho oh')) {
                
                console.log('CardTrader API: Ricerca specifica per Ho-Oh...');
                const hoohProducts = await this.searchHoOhSpecific(cardInfo);
                
                if (hoohProducts && hoohProducts.length > 0) {
                    console.log('CardTrader API: Trovati prodotti Ho-Oh specifici:', hoohProducts.length);
                    
                    const result = {
                        data: hoohProducts.map(product => ({
                            id: product.id,
                            name: product.name_en || product.name,
                            blueprint_id: product.blueprint_id,
                            price: product.price,
                            expansion: product.expansion
                        }))
                    };
                    
                    // Salva nella cache
                    this.cache.set(cacheKey, {
                        result: result,
                        timestamp: Date.now()
                    });
                    
                    return result;
                }
            }

            // Trova l'espansione se specificata
            let expansionId = null;
            if (cardInfo.set) {
                expansionId = this.findExpansionId(cardInfo.set);
                console.log('CardTrader API: Espansione trovata:', expansionId);
            }

            // Se abbiamo un'espansione specifica, cerca i blueprint
            if (expansionId) {
                const blueprints = await this.getBlueprintsForExpansion(expansionId);
                console.log('CardTrader API: Blueprint trovati per espansione:', blueprints.length);
                const matchingBlueprints = this.findMatchingBlueprint(blueprints, cardInfo);
                console.log('CardTrader API: Blueprint corrispondenti:', matchingBlueprints.length);
                
                if (matchingBlueprints.length > 0) {
                    const allProducts = [];
                    
                    for (const blueprint of matchingBlueprints) {
                        console.log('CardTrader API: Cercando prodotti per blueprint:', blueprint.name);
                        const products = await this.getMarketplaceProducts(blueprint.id);
                        console.log('CardTrader API: Prodotti trovati:', products.length);
                        allProducts.push(...products);
                    }
                    
                    const result = {
                        data: allProducts.map(product => ({
                            id: product.id,
                            name: product.name_en,
                            blueprint_id: product.blueprint_id,
                            price: product.price,
                            expansion: product.expansion
                        }))
                    };
                    
                    console.log('CardTrader API: Risultati totali:', result.data.length);
                    
                    // Salva nella cache
                    this.cache.set(cacheKey, {
                        result: result,
                        timestamp: Date.now()
                    });
                    
                    return result;
                }
            }

            // Fallback: cerca in tutte le espansioni Pokemon
            console.log('CardTrader API: Ricerca in tutte le espansioni...');
            const allProducts = await this.searchAcrossAllExpansions(cardInfo);
            console.log('CardTrader API: Prodotti trovati in tutte le espansioni:', allProducts.length);
            
            const result = {
                data: allProducts.map(product => ({
                    id: product.id,
                    name: product.name_en,
                    blueprint_id: product.blueprint_id,
                    price: product.price,
                    expansion: product.expansion
                }))
            };
            
            // Salva nella cache
            this.cache.set(cacheKey, {
                result: result,
                timestamp: Date.now()
            });
            
            return result;

        } catch (error) {
            console.error('CardTrader API Error:', error);
            return null;
        }
    }

    // Trova l'ID dell'espansione dal nome
    findExpansionId(setName) {
        const searchName = setName.toLowerCase();
        
        for (const [key, expansion] of this.expansions.entries()) {
            if (typeof key === 'string' && key.includes(searchName)) {
                return expansion.id;
            }
        }
        
        return null;
    }

    // Ottieni i blueprint per un'espansione
    async getBlueprintsForExpansion(expansionId) {
        const cacheKey = `blueprints_${expansionId}`;
        
        if (this.blueprints.has(cacheKey)) {
            return this.blueprints.get(cacheKey);
        }

        const response = await this.makeRequest(`/blueprints/export?expansion_id=${expansionId}`);
        const blueprints = response.data || response;
        
        // Assicurati che sia un array
        if (!Array.isArray(blueprints)) {
            console.error('CardTrader API: Risposta blueprint non è un array:', blueprints);
            return [];
        }
        
        this.blueprints.set(cacheKey, blueprints);
        return blueprints;
    }

    // Trova il blueprint che corrisponde alle informazioni della carta
    findMatchingBlueprint(blueprints, cardInfo) {
        const searchName = cardInfo.pokemonName.toLowerCase();
        const searchWords = searchName.split(/\s+/).filter(word => word.length > 0);
        
        console.log(`CardTrader API: Cercando blueprint per: "${searchName}"`);
        console.log(`CardTrader API: Parole di ricerca:`, searchWords);
        console.log(`CardTrader API: Tipo carta:`, cardInfo.cardType);
        console.log(`CardTrader API: Blueprint totali da analizzare:`, blueprints.length);
        
        // Debug: mostra alcuni blueprint per capire i nomi
        if (blueprints.length > 0) {
            const sampleBlueprints = blueprints.slice(0, 10).map(bp => bp.name);
            console.log(`CardTrader API: Esempi blueprint disponibili:`, sampleBlueprints);
        }
        
        // Calcola il punteggio di corrispondenza per ogni blueprint
        const scoredMatches = blueprints.map(blueprint => {
            const blueprintName = blueprint.name.toLowerCase();
            let score = 0;
            
            // Punteggio per corrispondenza esatta
            if (blueprintName === searchName) {
                score += 100;
            }
            
            // Punteggio per corrispondenza parziale
            if (blueprintName.includes(searchName) || searchName.includes(blueprintName)) {
                score += 50;
            }
            
            // Punteggio per parole comuni
            const blueprintWords = blueprintName.split(/\s+/);
            for (const searchWord of searchWords) {
                if (blueprintWords.some(bpWord => bpWord.includes(searchWord) || searchWord.includes(bpWord))) {
                    score += 10;
                }
            }
            
            // Bonus per nomi che iniziano con la stessa parola
            if (blueprintWords[0] === searchWords[0]) {
                score += 20;
            }
            
            // Bonus per tipi di carta corrispondenti
            if (cardInfo.cardType) {
                const cardType = cardInfo.cardType.toLowerCase();
                if (blueprintName.includes(cardType)) {
                    score += 15;
                }
            }
            
            // Bonus per "full art" se specificato
            if (cardInfo.cardType === 'full art' && blueprintName.includes('full art')) {
                score += 25;
            }
            
            // Bonus per "ex" se specificato
            if (cardInfo.cardType === 'ex' && blueprintName.includes('ex')) {
                score += 20;
            }
            
            // Penalità per nomi troppo lunghi (probabilmente meno rilevanti)
            if (blueprintWords.length > searchWords.length + 2) {
                score -= 5;
            }
            
            return { blueprint, score };
        });
        
        // Ordina per punteggio e restituisci i migliori
        scoredMatches.sort((a, b) => b.score - a.score);
        
        // Debug: mostra i migliori risultati
        const topResults = scoredMatches.slice(0, 10); // Mostra top 10 invece di 5
        console.log(`CardTrader API: Top 10 risultati per "${searchName}":`, 
            topResults.map(r => `${r.blueprint.name} (score: ${r.score})`));
        
        // Restituisci solo se il punteggio è abbastanza alto
        if (scoredMatches.length > 0 && scoredMatches[0].score >= 5) {
            // Restituisci i primi 3 risultati per avere più opzioni
            const selectedBlueprints = scoredMatches.slice(0, 3).map(match => match.blueprint);
            console.log(`CardTrader API: Blueprint selezionati:`, selectedBlueprints.map(bp => bp.name));
            return selectedBlueprints;
        }
        
        console.log(`CardTrader API: Nessun blueprint con punteggio sufficiente trovato`);
        return [];
    }

    // Ottieni i prodotti del marketplace per un blueprint
    async getMarketplaceProducts(blueprintId) {
        this.checkMarketplaceRateLimit();
        
        const response = await this.makeRequest(`/marketplace/products?blueprint_id=${blueprintId}`);
        
        // La risposta è un oggetto con blueprint_id come chiave
        const products = response[blueprintId] || [];
        return products;
    }

    // Cerca specificamente carte Ho-Oh
    async searchHoOhSpecific(cardInfo) {
        console.log('CardTrader API: Iniziando ricerca specifica per Ho-Oh...');
        
        // Cerca in espansioni che potrebbero contenere Ho-Oh
        const allExpansions = Array.from(this.expansions.values())
            .filter(exp => typeof exp.id === 'number');
        
        // Ordina espansioni per priorità (espansioni più probabili per Ho-Oh)
        const sortedExpansions = allExpansions.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            
            // Priorità 1: Espansioni con "ho-oh" nel nome
            const aHasHooh = aName.includes('ho-oh') || aName.includes('hooh');
            const bHasHooh = bName.includes('ho-oh') || bName.includes('hooh');
            if (aHasHooh && !bHasHooh) return -1;
            if (!aHasHooh && bHasHooh) return 1;
            
            // Priorità 2: Espansioni con "legendary" nel nome
            const aHasLegendary = aName.includes('legendary');
            const bHasLegendary = bName.includes('legendary');
            if (aHasLegendary && !bHasLegendary) return -1;
            if (!aHasLegendary && bHasLegendary) return 1;
            
            // Priorità 3: Espansioni con "neo" nel nome (Ho-Oh è stato introdotto in Neo)
            const aHasNeo = aName.includes('neo');
            const bHasNeo = bName.includes('neo');
            if (aHasNeo && !bHasNeo) return -1;
            if (!aHasNeo && bHasNeo) return 1;
            
            return 0;
        });
        
        // Cerca nelle prime 20 espansioni più rilevanti
        const searchExpansions = sortedExpansions.slice(0, 20);
        console.log(`CardTrader API: Cercando in ${searchExpansions.length} espansioni per Ho-Oh`);
        
        const allProducts = [];
        
        for (const expansion of searchExpansions) {
            try {
                console.log(`CardTrader API: Cercando Ho-Oh in espansione: ${expansion.name} (ID: ${expansion.id})`);
                const blueprints = await this.getBlueprintsForExpansion(expansion.id);
                
                // Cerca blueprint che contengono "Ho-Oh" (carte vere, non prodotti)
                const hoohBlueprints = blueprints.filter(bp => {
                    const bpName = bp.name.toLowerCase();
                    return (bpName.includes('ho-oh') || bpName.includes('hooh') || bpName.includes('ho oh')) &&
                           !bpName.includes('tin') && 
                           !bpName.includes('playmat') && 
                           !bpName.includes('coin') && 
                           !bpName.includes('box') &&
                           !bpName.includes('collection') &&
                           !bpName.includes('deck') &&
                           !bpName.includes('product');
                });
                
                if (hoohBlueprints.length > 0) {
                    console.log(`CardTrader API: Trovati ${hoohBlueprints.length} blueprint Ho-Oh in ${expansion.name}:`, 
                        hoohBlueprints.map(bp => bp.name));
                    
                    for (const blueprint of hoohBlueprints) {
                        try {
                            const products = await this.getMarketplaceProducts(blueprint.id);
                            
                            if (products && products.length > 0) {
                                console.log(`CardTrader API: Trovati ${products.length} prodotti per ${blueprint.name}`);
                                
                                // Filtra solo carte Ho-Oh vere
                                const cardProducts = products.filter(product => {
                                    const productName = (product.name_en || product.name || '').toLowerCase();
                                    return productName.includes('ho-oh') && 
                                           !productName.includes('tin') && 
                                           !productName.includes('playmat') && 
                                           !productName.includes('coin') && 
                                           !productName.includes('box') &&
                                           !productName.includes('collection');
                                });
                                
                                if (cardProducts.length > 0) {
                                    console.log(`CardTrader API: Trovate ${cardProducts.length} carte Ho-Oh per ${blueprint.name}`);
                                    allProducts.push(...cardProducts);
                                    
                                    // Se abbiamo trovato carte Ho-Oh, possiamo fermarci
                                    if (allProducts.length >= 10) {
                                        break;
                                    }
                                }
                            }
                            
                            // Rispetta il rate limiting
                            await new Promise(resolve => setTimeout(resolve, API_CONFIG.rateLimit.marketplaceDelay));
                            
                        } catch (error) {
                            console.warn(`CardTrader API: Errore nel recupero prodotti per ${blueprint.name}:`, error);
                            continue;
                        }
                    }
                    
                    // Se abbiamo trovato carte Ho-Oh, possiamo fermarci
                    if (allProducts.length >= 10) {
                        break;
                    }
                }
                
            } catch (error) {
                console.warn(`CardTrader API: Errore nella ricerca per espansione ${expansion.name}:`, error);
                continue;
            }
        }
        
        console.log(`CardTrader API: Totale carte Ho-Oh trovate: ${allProducts.length}`);
        return allProducts;
    }

    // Cerca in tutte le espansioni Pokemon
    async searchAcrossAllExpansions(cardInfo) {
        const allProducts = [];
        const searchName = cardInfo.pokemonName.toLowerCase();
        
        // Ottieni tutte le espansioni Pokemon
        const allExpansions = Array.from(this.expansions.values())
            .filter(exp => typeof exp.id === 'number');
        
        console.log(`CardTrader API: Espansioni Pokemon totali: ${allExpansions.length}`);
        
        // Ordina le espansioni per priorità:
        // 1. Espansioni recenti (più probabilità di trovare carte moderne)
        // 2. Espansioni con "promo" nel nome
        // 3. Altre espansioni
        const sortedExpansions = allExpansions.sort((a, b) => {
            const aIsPromo = a.name.toLowerCase().includes('promo');
            const bIsPromo = b.name.toLowerCase().includes('promo');
            const aIsRecent = a.name.toLowerCase().includes('202') || a.name.toLowerCase().includes('2023') || a.name.toLowerCase().includes('2024');
            const bIsRecent = b.name.toLowerCase().includes('202') || b.name.toLowerCase().includes('2023') || b.name.toLowerCase().includes('2024');
            
            if (aIsRecent && !bIsRecent) return -1;
            if (!aIsRecent && bIsRecent) return 1;
            if (aIsPromo && !bIsPromo) return -1;
            if (!aIsPromo && bIsPromo) return 1;
            return 0;
        });
        
        // Cerca nelle prime 10 espansioni per evitare rate limiting
        const searchExpansions = sortedExpansions.slice(0, 10);
        
        console.log(`CardTrader API: Cercando nelle prime ${searchExpansions.length} espansioni`);
        
        // Prima cerca espansioni che potrebbero contenere Ho-Oh specificamente
        const hoohExpansions = searchExpansions.filter(exp => 
            exp.name.toLowerCase().includes('ho-oh') || 
            exp.name.toLowerCase().includes('hooh') ||
            exp.name.toLowerCase().includes('ho oh') ||
            exp.name.toLowerCase().includes('legendary') ||
            exp.name.toLowerCase().includes('promo')
        );
        
        // Se troviamo espansioni specifiche per Ho-Oh, cerca prima lì
        if (hoohExpansions.length > 0) {
            console.log(`CardTrader API: Trovate ${hoohExpansions.length} espansioni potenzialmente rilevanti per Ho-Oh`);
            for (const expansion of hoohExpansions) {
                try {
                    console.log(`CardTrader API: Cercando in espansione Ho-Oh: ${expansion.name} (ID: ${expansion.id})`);
                    const blueprints = await this.getBlueprintsForExpansion(expansion.id);
                    
                    // Cerca specificamente blueprint Ho-Oh
                    const hoohBlueprints = blueprints.filter(bp => 
                        bp.name.toLowerCase().includes('ho-oh') || 
                        bp.name.toLowerCase().includes('hooh') ||
                        bp.name.toLowerCase().includes('ho oh')
                    );
                    
                    if (hoohBlueprints.length > 0) {
                        console.log(`CardTrader API: Trovati ${hoohBlueprints.length} blueprint Ho-Oh in ${expansion.name}`);
                        for (const blueprint of hoohBlueprints) {
                            const products = await this.getMarketplaceProducts(blueprint.id);
                            const enrichedProducts = products.map(product => ({
                                ...product,
                                expansion_name: expansion.name,
                                blueprint_name: blueprint.name
                            }));
                            allProducts.push(...enrichedProducts);
                        }
                        break; // Se troviamo Ho-Oh, non serve cercare altro
                    }
                } catch (error) {
                    console.warn(`Errore nella ricerca Ho-Oh per espansione ${expansion.name}:`, error);
                }
            }
        }
        
        // Se non abbiamo trovato Ho-Oh specifico, cerca con il metodo generico
        if (allProducts.length === 0) {
            console.log(`CardTrader API: Nessun Ho-Oh specifico trovato, cercando con metodo generico`);
            
            for (const expansion of searchExpansions) {
                try {
                    console.log(`CardTrader API: Cercando in espansione: ${expansion.name} (ID: ${expansion.id})`);
                    const blueprints = await this.getBlueprintsForExpansion(expansion.id);
                    console.log(`CardTrader API: Blueprint in ${expansion.name}:`, blueprints.length);
                    
                    // Debug: mostra alcuni blueprint per capire i nomi
                    if (blueprints.length > 0) {
                        const sampleBlueprints = blueprints.slice(0, 5).map(bp => bp.name);
                        console.log(`CardTrader API: Esempi blueprint in ${expansion.name}:`, sampleBlueprints);
                    }
                    
                    const matchingBlueprints = this.findMatchingBlueprint(blueprints, cardInfo);
                    console.log(`CardTrader API: Blueprint corrispondenti in ${expansion.name}:`, matchingBlueprints.length);
                    
                    if (matchingBlueprints.length > 0) {
                        for (const blueprint of matchingBlueprints) {
                            console.log(`CardTrader API: Cercando prodotti per: ${blueprint.name}`);
                            const products = await this.getMarketplaceProducts(blueprint.id);
                            console.log(`CardTrader API: Prodotti trovati per ${blueprint.name}:`, products.length);
                            
                            // Aggiungi informazioni sull'espansione ai prodotti
                            const enrichedProducts = products.map(product => ({
                                ...product,
                                expansion_name: expansion.name,
                                blueprint_name: blueprint.name
                            }));
                            
                            allProducts.push(...enrichedProducts);
                            
                            // Limita i risultati per performance
                            if (allProducts.length >= API_CONFIG.maxResults) {
                                break;
                            }
                        }
                        
                        // Se abbiamo abbastanza risultati, esci dal loop
                        if (allProducts.length >= API_CONFIG.maxResults) {
                            break;
                        }
                    }
                    
                    // Rispetta il rate limiting del marketplace (1 secondo tra chiamate)
                    await new Promise(resolve => setTimeout(resolve, API_CONFIG.rateLimit.marketplaceDelay));
                    
                } catch (error) {
                    console.warn(`Errore nella ricerca per espansione ${expansion.name}:`, error);
                    continue;
                }
            }
        }
        
        console.log(`CardTrader API: Totale prodotti trovati: ${allProducts.length}`);
        return allProducts.slice(0, API_CONFIG.maxResults);
    }



    // Genera un link diretto alla carta
    generateCardLink(cardInfo, searchResults) {
        if (!searchResults || !searchResults.data || searchResults.data.length === 0) {
            // Fallback: link generico con parametri di ricerca
            const query = encodeURIComponent(`pokemon ${cardInfo.pokemonName}`);
            return `${API_CONFIG.fallback.searchLink}?q=${query}`;
        }

        // Prendi il primo risultato (il più rilevante)
        const card = searchResults.data[0];
        
        if (card && card.id) {
            // Genera link nel formato /cards/ usando le informazioni del blueprint
            if (card.blueprint_name) {
                // Converti il nome del blueprint in slug per l'URL
                const slug = this.generateCardSlug(card.blueprint_name, card.expansion_name);
                return `https://www.cardtrader.com/cards/${slug}`;
            }
            
            // Fallback: link diretto al prodotto specifico del marketplace
            return `https://www.cardtrader.com/marketplace/products/${card.id}`;
        }

        // Fallback con query di ricerca
        const query = encodeURIComponent(`pokemon ${cardInfo.pokemonName}`);
        return `${API_CONFIG.fallback.searchLink}?q=${query}`;
    }

    // Genera uno slug per l'URL della carta
    generateCardSlug(blueprintName, expansionName) {
        // Converti il nome in slug (minuscolo, spazi in trattini, rimuovi caratteri speciali)
        let slug = blueprintName.toLowerCase()
            .replace(/[^\w\s-]/g, '')  // Rimuovi caratteri speciali
            .replace(/\s+/g, '-')      // Sostituisci spazi con trattini
            .replace(/-+/g, '-')       // Normalizza trattini multipli
            .trim();
        
        // Aggiungi informazioni sull'espansione se disponibile
        if (expansionName) {
            const expansionSlug = expansionName.toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .trim();
            
            slug = `${slug}-${expansionSlug}`;
        }
        
        return slug;
    }

    // Funzione principale per generare il link
    async createCardTraderLink(title) {
        const cardInfo = this.extractCardInfo(title);
        
        if (!cardInfo || !cardInfo.pokemonName || cardInfo.pokemonName.length < 2) {
            // Se non riusciamo a estrarre informazioni specifiche, usa il link generico
            console.warn('CardTrader API: Impossibile estrarre informazioni dalla carta:', title);
            return API_CONFIG.fallback.genericLink;
        }

        try {
            console.log('CardTrader API: Ricerca carta:', cardInfo);
            const searchResults = await this.searchCard(cardInfo);
            
            if (!searchResults || !searchResults.data || searchResults.data.length === 0) {
                console.warn('CardTrader API: Nessun risultato trovato per:', cardInfo.pokemonName);
                // Fallback con ricerca generica
                const query = encodeURIComponent(`pokemon ${cardInfo.pokemonName}`);
                return `${API_CONFIG.fallback.searchLink}?q=${query}`;
            }
            
            const link = this.generateCardLink(cardInfo, searchResults);
            console.log('CardTrader API: Link generato:', link);
            return link;
            
        } catch (error) {
            console.error('CardTrader API: Errore durante la generazione del link:', error);
            // Fallback al link generico
            return API_CONFIG.fallback.genericLink;
        }
    }
}

// Esporta per uso globale
window.CardTraderAPI = CardTraderAPI; 