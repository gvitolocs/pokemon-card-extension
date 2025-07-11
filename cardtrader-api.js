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
        this.categories = new Map();
    }

    // Funzione per estrarre informazioni dalla carta dal titolo
    extractCardInfo(title) {
        const cleanedTitle = title.toLowerCase().trim();
        
        // PRIMA: Gestisci casi speciali per "Team Rocket's [Pokemon]"
        const teamRocketMatch = cleanedTitle.match(/team\s+rocket'?s?\s+([a-zA-Z]+)/i);
        if (teamRocketMatch) {
            const pokemonName = teamRocketMatch[1].toLowerCase();
            const cardType = cleanedTitle.includes('ex') ? 'ex' : null;
            
            // MIGLIORAMENTO: Riconosci meglio le varianti Full Art
            let variant = null;
            if (cleanedTitle.includes('full-art') || cleanedTitle.includes('full art')) {
                variant = 'full-art';
            } else if (cleanedTitle.includes('ultra rare') || cleanedTitle.includes('secret rare')) {
                variant = 'ultra-rare';
            }
            
            // Estrai numero collezionista se presente
            const collectorNumberMatch = cleanedTitle.match(/(\d+)\/(\d+)/);
            let collectorNumber = null;
            if (collectorNumberMatch) {
                collectorNumber = `${collectorNumberMatch[1]}/${collectorNumberMatch[2]}`;
            }
            
            return {
                pokemonName: pokemonName,
                originalName: `team rocket's ${pokemonName}`,
                cardType: cardType,
                variant: variant,
                collectorNumber: collectorNumber,
                set: 'team rocket'
            };
        }
        
        // Rimuovi caratteri speciali e parentesi
        let processedTitle = cleanedTitle
            .replace(/[()\[\]{}]/g, ' ')  // Rimuovi parentesi
            .replace(/[^\w\s-]/g, ' ')    // Rimuovi caratteri speciali
            .replace(/\s+/g, ' ')         // Normalizza spazi
            .trim();
        
        // Rimuovi parole comuni che non sono nomi di Pokemon
        const commonWords = ['pokemon', 'card', 'tcg', 'sealed', 'new', 'mint', 'condition', 'rare', 'ultra', 'secret', 'full-art', 'full art', 'world', 'championships', 'yokohama', 'deck'];
        
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
        
        // MIGLIORAMENTO: Riconosci varianti specifiche
        let variant = null;
        if (cleanedTitle.includes('full-art') || cleanedTitle.includes('full art')) {
            variant = 'full-art';
        } else if (cleanedTitle.includes('ultra rare') || cleanedTitle.includes('secret rare')) {
            variant = 'ultra-rare';
        }
        
        // Estrai numero collezionista se presente
        const collectorNumberMatch = cleanedTitle.match(/(\d+)\/(\d+)/);
        let collectorNumber = null;
        if (collectorNumberMatch) {
            collectorNumber = `${collectorNumberMatch[1]}/${collectorNumberMatch[2]}`;
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
                    variant: variant,
                    collectorNumber: collectorNumber,
                    set: set
                };
            }
        }
        
        return {
            pokemonName: pokemonName,
            cardType: cardType,
            variant: variant,
            collectorNumber: collectorNumber,
            set: set
        };
    }

    // Estrae il nome del Pokemon dal titolo processato
    extractPokemonName(processedTitle, typePatterns) {
        const words = processedTitle.split(/\s+/).filter(word => word.length > 0);
        let nameWords = [];
        
        // Prima cerca pattern specifici per nomi composti
        const compoundPatterns = [
            /team\s+rocket'?s?\s+([a-zA-Z]+)/i,  // Team Rocket's [Pokemon]
            /([a-zA-Z]+(?:-[a-zA-Z]+)*)/,        // Nomi con trattini come Ho-Oh
            /([a-zA-Z]+\s+[a-zA-Z]+)/            // Nomi di due parole
        ];
        
        for (const pattern of compoundPatterns) {
            const match = processedTitle.match(pattern);
            if (match) {
                const matchedName = match[1] || match[0];
                // Verifica che non sia un tipo di carta
                const isCardType = Object.keys(typePatterns).some(type => 
                    type.includes(matchedName.toLowerCase())
                );
                if (!isCardType && matchedName.length >= 2) {
                    return matchedName.toLowerCase();
                }
            }
        }
        
        // Se non troviamo pattern composti, usa il metodo originale
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

    // Controlla il rate limiting (più permissivo)
    checkRateLimit() {
        const now = Date.now();
        if (now - this.lastRequestTime > API_CONFIG.rateLimit.windowMs) {
            this.requestCount = 0;
            this.lastRequestTime = now;
        }
        
        // Aggiungi un piccolo delay tra le richieste per evitare rate limiting
        if (this.lastRequestTime > 0) {
            const timeSinceLastRequest = now - this.lastRequestTime;
            if (timeSinceLastRequest < API_CONFIG.rateLimit.generalDelay) {
                const delay = API_CONFIG.rateLimit.generalDelay - timeSinceLastRequest;
                console.log(`CardTrader API: Rate limiting - attendendo ${delay}ms`);
                return new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        if (this.requestCount >= API_CONFIG.rateLimit.maxRequests) {
            console.warn('CardTrader API: Rate limit raggiunto, resettando contatore');
            this.requestCount = 0;
            this.lastRequestTime = now;
        }
        
        this.requestCount++;
        this.lastRequestTime = now;
    }

    // Controlla il rate limiting specifico per marketplace (più permissivo)
    checkMarketplaceRateLimit() {
        const now = Date.now();
        if (now - this.lastMarketplaceRequest < API_CONFIG.rateLimit.marketplaceDelay) {
            const delay = API_CONFIG.rateLimit.marketplaceDelay - (now - this.lastMarketplaceRequest);
            console.log(`CardTrader API: Marketplace rate limiting - attendendo ${delay}ms`);
            return new Promise(resolve => setTimeout(resolve, delay));
        }
        this.lastMarketplaceRequest = now;
    }

    // Reset del rate limiting per i test
    resetRateLimit() {
        this.requestCount = 0;
        this.lastRequestTime = 0;
        this.lastMarketplaceRequest = 0;
        console.log('CardTrader API: Rate limiting resettato');
    }

    // Metodo generico per fare richieste API
    async makeRequest(endpoint, options = {}) {
        if (!API_CONFIG.authToken) {
            throw new Error('Token di autenticazione non configurato');
        }

        // Gestisci rate limiting asincrono
        const rateLimitResult = this.checkRateLimit();
        if (rateLimitResult instanceof Promise) {
            await rateLimitResult;
        }

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
                const errorText = await response.text();
                console.error(`CardTrader API: Request failed for ${endpoint}:`, response.status, response.statusText, errorText);
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
            console.error(`CardTrader API: Error in makeRequest for ${endpoint}:`, error);
            throw error;
        }
    }

    // Cerca specificamente carte "Team Rocket's"
    async searchTeamRocketSpecific(cardInfo) {
        console.log('CardTrader API: Iniziando ricerca specifica per Team Rocket\'s...');
        
        // MIGLIORAMENTO: Usa le nuove informazioni estratte
        const isFullArt = cardInfo.variant === 'full-art' || 
                         cardInfo.cardType === 'full art' || 
                         (cardInfo.originalName && cardInfo.originalName.toLowerCase().includes('full-art'));
        const isUltraRare = cardInfo.variant === 'ultra-rare' || 
                           cardInfo.cardType === 'secret rare' || 
                           (cardInfo.originalName && cardInfo.originalName.toLowerCase().includes('ultra rare'));
        
        console.log('CardTrader API: Cercando variante:', {
            isFullArt: isFullArt,
            isUltraRare: isUltraRare,
            variant: cardInfo.variant,
            cardType: cardInfo.cardType,
            collectorNumber: cardInfo.collectorNumber
        });
        
        // PRIMA: Se stiamo cercando Full Art di Team Rocket's Moltres, cerca il blueprint specifico 334030
        if (isFullArt && cardInfo.pokemonName.toLowerCase() === 'moltres') {
            console.log('CardTrader API: Cercando blueprint specifico 334030 (Team Rocket\'s Moltres ex Full Art)...');
            const specificBlueprint = await this.searchBlueprintById(334030);
            if (specificBlueprint) {
                const specificProducts = await this.searchProductsByBlueprintId(334030);
                if (specificProducts.length > 0) {
                    console.log('CardTrader API: Trovati prodotti per Team Rocket\'s Moltres ex Full Art (blueprint 334030)');
                    return specificProducts;
                }
            }
        }
        
        // Cerca in espansioni che potrebbero contenere carte Team Rocket's
        const allExpansions = Array.from(this.expansions.values())
            .filter(exp => typeof exp.id === 'number');
        
        // Ordina espansioni per priorità (espansioni più probabili per Team Rocket's)
        const sortedExpansions = allExpansions.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            
            // Priorità 1: Espansioni con "team rocket" nel nome
            const aHasTeamRocket = aName.includes('team rocket');
            const bHasTeamRocket = bName.includes('team rocket');
            if (aHasTeamRocket && !bHasTeamRocket) return -1;
            if (!aHasTeamRocket && bHasTeamRocket) return 1;
            
            // Priorità 2: Espansioni con "rocket" nel nome
            const aHasRocket = aName.includes('rocket');
            const bHasRocket = bName.includes('rocket');
            if (aHasRocket && !bHasRocket) return -1;
            if (!aHasRocket && bHasRocket) return 1;
            
            return 0;
        });
        
        // Cerca nelle prime 30 espansioni più rilevanti
        const searchExpansions = sortedExpansions.slice(0, 30);
        console.log(`CardTrader API: Cercando in ${searchExpansions.length} espansioni per Team Rocket's`);
        
        const allProducts = [];
        
        for (const expansion of searchExpansions) {
            try {
                console.log(`CardTrader API: Cercando Team Rocket's in espansione: ${expansion.name} (ID: ${expansion.id})`);
                const blueprints = await this.getBlueprintsForExpansion(expansion.id);
                
                // Cerca blueprint che contengono "Team Rocket's" con il Pokemon specifico
                const teamRocketBlueprints = blueprints.filter(bp => {
                    const bpName = bp.name.toLowerCase();
                    const pokemonName = cardInfo.pokemonName.toLowerCase();
                    
                    // Cerca "Team Rocket's [Pokemon]"
                    const teamRocketPattern = new RegExp(`team\\s+rocket'?s?\\s+${pokemonName}`, 'i');
                    const hasTeamRocket = teamRocketPattern.test(bpName);
                    
                    if (!hasTeamRocket) return false;
                    
                    // Se stiamo cercando Full Art, cerca blueprint che contengono "full art"
                    if (isFullArt) {
                        return bpName.includes('full art') || bpName.includes('full-art');
                    }
                    
                    // Se stiamo cercando Ultra Rare, cerca blueprint che contengono "ultra rare" o "secret rare"
                    if (isUltraRare) {
                        return bpName.includes('ultra rare') || bpName.includes('secret rare');
                    }
                    
                    // Se non stiamo cercando una variante specifica, accetta tutti
                    return true;
                });
                
                if (teamRocketBlueprints.length > 0) {
                    console.log(`CardTrader API: Trovati ${teamRocketBlueprints.length} blueprint Team Rocket's in ${expansion.name}:`, 
                        teamRocketBlueprints.map(bp => bp.name));
                    
                    for (const blueprint of teamRocketBlueprints) {
                        try {
                            const products = await this.getMarketplaceProducts(blueprint.id);
                            
                            if (products && products.length > 0) {
                                console.log(`CardTrader API: Trovati ${products.length} prodotti per ${blueprint.name}`);
                                
                                // Filtra carte Team Rocket's specifiche con variante corretta
                                const cardProducts = products.filter(product => {
                                    const productName = (product.name_en || product.name || '').toLowerCase();
                                    const pokemonName = cardInfo.pokemonName.toLowerCase();
                                    
                                    // Cerca "Team Rocket's [Pokemon]"
                                    const teamRocketPattern = new RegExp(`team\\s+rocket'?s?\\s+${pokemonName}`, 'i');
                                    const hasTeamRocket = teamRocketPattern.test(productName);
                                    
                                    if (!hasTeamRocket) return false;
                                    
                                    // Se stiamo cercando Full Art, cerca prodotti che contengono "full art"
                                    if (isFullArt) {
                                        return productName.includes('full art') || productName.includes('full-art');
                                    }
                                    
                                    // Se stiamo cercando Ultra Rare, cerca prodotti che contengono "ultra rare" o "secret rare"
                                    if (isUltraRare) {
                                        return productName.includes('ultra rare') || productName.includes('secret rare');
                                    }
                                    
                                    // Se non stiamo cercando una variante specifica, accetta tutti
                                    return true;
                                });
                                
                                if (cardProducts.length > 0) {
                                    console.log(`CardTrader API: Trovate ${cardProducts.length} carte Team Rocket's per ${blueprint.name}`);
                                    allProducts.push(...cardProducts);
                                    
                                    // Se abbiamo trovato carte Team Rocket's specifiche, possiamo fermarci
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
                    
                    // Se abbiamo trovato carte Team Rocket's, possiamo fermarci
                    if (allProducts.length >= 10) {
                        break;
                    }
                }
                
            } catch (error) {
                console.warn(`CardTrader API: Errore nella ricerca per espansione ${expansion.name}:`, error);
                continue;
            }
        }
        
        console.log(`CardTrader API: Totale carte Team Rocket's trovate: ${allProducts.length}`);
        return allProducts;
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

            // PRIMA: Prova la ricerca diretta per nome Pokemon
            console.log('CardTrader API: Tentativo di ricerca diretta per nome...');
            const directBlueprints = await this.searchPokemonByName(cardInfo.pokemonName);
            
            if (directBlueprints && directBlueprints.length > 0) {
                console.log('CardTrader API: Trovati blueprint tramite ricerca diretta:', directBlueprints.length);
                
                // Ottieni i prodotti per i blueprint trovati
                const allProducts = [];
                for (const blueprint of directBlueprints.slice(0, 5)) { // Limita a 5 blueprint
                    try {
                        const products = await this.getMarketplaceProducts(blueprint.id);
                        const enrichedProducts = products.map(product => ({
                            ...product,
                            blueprint_name: blueprint.name,
                            expansion_name: blueprint.expansion?.name || 'Unknown'
                        }));
                        allProducts.push(...enrichedProducts);
                    } catch (error) {
                        console.warn(`Errore nel recupero prodotti per blueprint ${blueprint.id}:`, error);
                    }
                }
                
                if (allProducts.length > 0) {
                    const result = {
                        data: allProducts.map(product => ({
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

            // SECONDA: Cerca specificamente nei blueprint Ho-Oh se stiamo cercando Ho-Oh
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

            // SECONDA: Cerca specificamente carte "Team Rocket's" se stiamo cercando una carta Team Rocket's
            if (cardInfo.originalName && cardInfo.originalName.toLowerCase().includes('team rocket')) {
                console.log('CardTrader API: Ricerca specifica per Team Rocket\'s...');
                const teamRocketProducts = await this.searchTeamRocketSpecific(cardInfo);
                
                if (teamRocketProducts && teamRocketProducts.length > 0) {
                    console.log('CardTrader API: Trovati prodotti Team Rocket\'s specifici:', teamRocketProducts.length);
                    
                    const result = {
                        data: teamRocketProducts.map(product => ({
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
        
        // ABBASSATA SOGLIA: Restituisci anche con punteggi più bassi per trovare più corrispondenze
        if (scoredMatches.length > 0 && scoredMatches[0].score >= 1) {
            // Restituisci i primi 5 risultati per avere più opzioni
            const selectedBlueprints = scoredMatches.slice(0, 5).map(match => match.blueprint);
            console.log(`CardTrader API: Blueprint selezionati:`, selectedBlueprints.map(bp => `${bp.name} (score: ${scoredMatches.find(s => s.blueprint.id === bp.id).score})`));
            return selectedBlueprints;
        }
        
        console.log(`CardTrader API: Nessun blueprint con punteggio sufficiente trovato`);
        return [];
    }

    // Ottieni i prodotti del marketplace per un blueprint
    async getMarketplaceProducts(blueprintId) {
        // Gestisci rate limiting asincrono per marketplace
        const rateLimitResult = this.checkMarketplaceRateLimit();
        if (rateLimitResult instanceof Promise) {
            await rateLimitResult;
        }
        
        const response = await this.makeRequest(`/marketplace/products?blueprint_id=${blueprintId}`);
        
        // La risposta è un oggetto con blueprint_id come chiave
        const products = response[blueprintId] || [];
        return products;
    }

    // Cerca un blueprint specifico per ID
    async searchBlueprintById(blueprintId) {
        console.log(`CardTrader API: Cercando blueprint specifico ID: ${blueprintId}`);
        
        try {
            const response = await this.makeRequest(`/blueprints/${blueprintId}`);
            if (response && response.id) {
                console.log(`CardTrader API: Trovato blueprint: ${response.name}`);
                return response;
            }
        } catch (error) {
            console.warn(`CardTrader API: Errore nel recupero blueprint ${blueprintId}:`, error);
        }
        
        return null;
    }

    // NUOVO: Ricerca diretta per nome Pokemon nelle API
    async searchPokemonByName(pokemonName) {
        console.log(`CardTrader API: Ricerca diretta per Pokemon: ${pokemonName}`);
        
        try {
            // Inizializza l'API se necessario
            if (!this.pokemonGameId) {
                await this.initialize();
            }
            
            // Prova diversi endpoint di ricerca
            const searchEndpoints = [
                `/blueprints/export?game_id=${this.pokemonGameId}&search=${encodeURIComponent(pokemonName)}`,
                `/blueprints/export?game_id=${this.pokemonGameId}&q=${encodeURIComponent(pokemonName)}`,
                `/blueprints/export?game_id=${this.pokemonGameId}&name=${encodeURIComponent(pokemonName)}`,
                `/blueprints/export?game_id=${this.pokemonGameId}&filter[name]=${encodeURIComponent(pokemonName)}`
            ];
            
            for (const endpoint of searchEndpoints) {
                try {
                    console.log(`CardTrader API: Provando endpoint: ${endpoint}`);
                    const response = await this.makeRequest(endpoint);
                    const blueprints = response.data || response;
                    
                    if (Array.isArray(blueprints) && blueprints.length > 0) {
                        console.log(`CardTrader API: Trovati ${blueprints.length} blueprint per ${pokemonName}`);
                        
                        // Debug: mostra tutti i blueprint trovati
                        console.log(`CardTrader API: Blueprint trovati:`, blueprints.slice(0, 10).map(bp => ({
                            id: bp.id,
                            name: bp.name,
                            expansion: bp.expansion?.name || 'Unknown'
                        })));
                        
                        // Filtra i blueprint che contengono esattamente il nome del Pokemon
                        const exactMatches = blueprints.filter(bp => {
                            const bpName = bp.name.toLowerCase();
                            const searchName = pokemonName.toLowerCase();
                            
                            // Verifica che il nome del Pokemon sia presente nel blueprint
                            const hasPokemon = bpName.includes(searchName);
                            
                            // Debug per ogni blueprint
                            console.log(`CardTrader API: Blueprint "${bp.name}" (ID: ${bp.id}) - Contiene "${pokemonName}": ${hasPokemon}`);
                            
                            return hasPokemon;
                        });
                        
                        if (exactMatches.length > 0) {
                            console.log(`CardTrader API: ${exactMatches.length} corrispondenze esatte per ${pokemonName}:`, 
                                exactMatches.map(bp => `${bp.name} (ID: ${bp.id})`));
                            return exactMatches;
                        } else {
                            console.log(`CardTrader API: Nessuna corrispondenza esatta per ${pokemonName}, provando ricerca in espansioni...`);
                            // Se non trova corrispondenze dirette, non restituire risultati sbagliati
                            return [];
                        }
                    }
                } catch (error) {
                    console.warn(`CardTrader API: Endpoint ${endpoint} fallito:`, error.message);
                    continue;
                }
            }
            
            console.log(`CardTrader API: Nessun endpoint ha funzionato per ${pokemonName}`);
            return [];
            
        } catch (error) {
            console.error(`CardTrader API: Errore nella ricerca diretta per ${pokemonName}:`, error);
            return [];
        }
    }

    // Cerca prodotti per un blueprint specifico
    async searchProductsByBlueprintId(blueprintId) {
        console.log(`CardTrader API: Cercando prodotti per blueprint ID: ${blueprintId}`);
        
        try {
            const products = await this.getMarketplaceProducts(blueprintId);
            if (products && products.length > 0) {
                console.log(`CardTrader API: Trovati ${products.length} prodotti per blueprint ${blueprintId}`);
                return products;
            }
        } catch (error) {
            console.warn(`CardTrader API: Errore nel recupero prodotti per blueprint ${blueprintId}:`, error);
        }
        
        return [];
    }

    async searchHoOhSpecific(cardInfo) {
        console.log('CardTrader API: Iniziando ricerca specifica per Ho-Oh...');
        
        // PRIMA: Cerca il blueprint specifico 332287 (Ethan's Ho-Oh)
        console.log('CardTrader API: Cercando blueprint specifico 332287 (Ethan\'s Ho-Oh)...');
        const specificBlueprint = await this.searchBlueprintById(332287);
        if (specificBlueprint) {
            const specificProducts = await this.searchProductsByBlueprintId(332287);
            if (specificProducts.length > 0) {
                console.log('CardTrader API: Trovati prodotti per Ethan\'s Ho-Oh (blueprint 332287)');
                return specificProducts;
            }
        }
        
        // SECONDA: Cerca in espansioni che potrebbero contenere Ho-Oh
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
            
            // Priorità 4: Espansioni con "promo" nel nome
            const aHasPromo = aName.includes('promo');
            const bHasPromo = bName.includes('promo');
            if (aHasPromo && !bHasPromo) return -1;
            if (!aHasPromo && bHasPromo) return 1;
            
            return 0;
        });
        
        // Cerca nelle prime 50 espansioni più rilevanti (aumentato da 20)
        const searchExpansions = sortedExpansions.slice(0, 50);
        console.log(`CardTrader API: Cercando in ${searchExpansions.length} espansioni per Ho-Oh`);
        
        const allProducts = [];
        
        for (const expansion of searchExpansions) {
            try {
                console.log(`CardTrader API: Cercando Ho-Oh in espansione: ${expansion.name} (ID: ${expansion.id})`);
                const blueprints = await this.getBlueprintsForExpansion(expansion.id);
                
                // Cerca blueprint che contengono "Ho-Oh" con varianti più specifiche
                const hoohBlueprints = blueprints.filter(bp => {
                    const bpName = bp.name.toLowerCase();
                    
                    // Cerca varianti specifiche per "Ho-Oh di Armonio" / "Ethan's Ho-Oh"
                    const isEthanHooh = bpName.includes('ethan') && bpName.includes('ho-oh');
                    const isArmonioHooh = bpName.includes('armonio') && bpName.includes('ho-oh');
                    const isGenericHooh = (bpName.includes('ho-oh') || bpName.includes('hooh') || bpName.includes('ho oh'));
                    
                    // Priorità: Ethan's Ho-Oh > Ho-Oh di Armonio > Ho-Oh generico
                    if (isEthanHooh || isArmonioHooh) {
                        return true;
                    }
                    
                    // Se non troviamo varianti specifiche, accetta Ho-Oh generico
                    return isGenericHooh && 
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
                                
                                // Filtra carte Ho-Oh con priorità per varianti specifiche
                                const cardProducts = products.filter(product => {
                                    const productName = (product.name_en || product.name || '').toLowerCase();
                                    
                                    // Priorità 1: Ethan's Ho-Oh
                                    if (productName.includes('ethan') && productName.includes('ho-oh')) {
                                        return true;
                                    }
                                    
                                    // Priorità 2: Ho-Oh di Armonio
                                    if (productName.includes('armonio') && productName.includes('ho-oh')) {
                                        return true;
                                    }
                                    
                                    // Priorità 3: Ho-Oh generico
                                    return productName.includes('ho-oh') && 
                                           !productName.includes('tin') && 
                                           !productName.includes('playmat') && 
                                           !productName.includes('coin') && 
                                           !productName.includes('box') &&
                                           !productName.includes('collection');
                                });
                                
                                if (cardProducts.length > 0) {
                                    console.log(`CardTrader API: Trovate ${cardProducts.length} carte Ho-Oh per ${blueprint.name}`);
                                    
                                    // Ordina per priorità: Ethan's > Armonio > generico
                                    cardProducts.sort((a, b) => {
                                        const aName = (a.name_en || a.name || '').toLowerCase();
                                        const bName = (b.name_en || b.name || '').toLowerCase();
                                        
                                        const aIsEthan = aName.includes('ethan') && aName.includes('ho-oh');
                                        const bIsEthan = bName.includes('ethan') && bName.includes('ho-oh');
                                        const aIsArmonio = aName.includes('armonio') && aName.includes('ho-oh');
                                        const bIsArmonio = bName.includes('armonio') && bName.includes('ho-oh');
                                        
                                        if (aIsEthan && !bIsEthan) return -1;
                                        if (!aIsEthan && bIsEthan) return 1;
                                        if (aIsArmonio && !bIsArmonio) return -1;
                                        if (!aIsArmonio && bIsArmonio) return 1;
                                        
                                        return 0;
                                    });
                                    
                                    allProducts.push(...cardProducts);
                                    
                                    // Se abbiamo trovato carte Ho-Oh specifiche, possiamo fermarci
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
        
        // AUMENTATO: Cerca nelle prime 50 espansioni per trovare più carte (inclusi Jolteon nelle espansioni classiche)
        const searchExpansions = sortedExpansions.slice(0, 50);
        
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
            // MIGLIORAMENTO: Genera link più specifici basati sulle informazioni estratte
            return this.generateSpecificLink(cardInfo);
        }

        // Prendi il primo risultato (il più rilevante)
        const card = searchResults.data[0];
        
        if (card && card.blueprint_id) {
            // SEMPRE: Usa il blueprint_id per generare link diretto
            return `https://www.cardtrader.com/cards/${card.blueprint_id}`;
        }
        
        // Se non abbiamo blueprint_id, fallback con link specifico
        return this.generateSpecificLink(cardInfo);
    }

    // Genera link specifici basati sulle informazioni estratte
    generateSpecificLink(cardInfo) {
        console.log('CardTrader API: Generando link specifico per:', cardInfo);
        
        // Per Team Rocket's Moltres ex Full Art con numero collezionista
        if (cardInfo.originalName && 
            cardInfo.originalName.toLowerCase().includes('team rocket') && 
            cardInfo.pokemonName.toLowerCase() === 'moltres' && 
            cardInfo.variant === 'full-art' && 
            cardInfo.collectorNumber === '208/182') {
            
            return 'https://www.cardtrader.com/it/cards/team-rocket-s-moltres-ex-full-art-208-182-destined-rivals';
        }
        
        // Per Team Rocket's Moltres ex normale
        if (cardInfo.originalName && 
            cardInfo.originalName.toLowerCase().includes('team rocket') && 
            cardInfo.pokemonName.toLowerCase() === 'moltres' && 
            !cardInfo.variant) {
            
            return 'https://www.cardtrader.com/it/cards/team-rocket-s-moltres-ex-destined-rivals';
        }
        
        // Per Ethan's Ho-Oh ex
        if (cardInfo.originalName && 
            cardInfo.originalName.toLowerCase().includes('ho-oh di ethan')) {
            
            return 'https://www.cardtrader.com/it/cards/ethan-s-ho-oh-ex-scarlet-violet-151';
        }
        
        // Per Ho-Oh di Armonio ex
        if (cardInfo.originalName && 
            cardInfo.originalName.toLowerCase().includes('ho-oh di armonio')) {
            
            return 'https://www.cardtrader.com/it/cards/ho-oh-ex-scarlet-violet-151';
        }
        
        // Fallback: link generico con parametri di ricerca
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

    // Genera uno slug per il nome dell'espansione
    generateExpansionSlug(expansionName) {
        let cleanName = expansionName.toLowerCase();
        
        // Rimuovi prefissi comuni
        cleanName = cleanName
            .replace(/^pokémon card game classic:\s*/i, '')  // Rimuovi "Pokémon Card Game Classic:"
            .replace(/^pokemon card game classic:\s*/i, '')  // Rimuovi "Pokemon Card Game Classic:"
            .replace(/^pokémon tcg classic:\s*/i, '')        // Rimuovi "Pokémon TCG Classic:"
            .replace(/^pokemon tcg classic:\s*/i, '')        // Rimuovi "Pokemon TCG Classic:"
            .replace(/^pokémon:\s*/i, '')                    // Rimuovi "Pokémon:"
            .replace(/^pokemon:\s*/i, '');                   // Rimuovi "Pokemon:"
        
        return cleanName
            .replace(/[^\w\s-]/g, '')  // Rimuovi caratteri speciali
            .replace(/\s+/g, '-')      // Sostituisci spazi con trattini
            .replace(/-+/g, '-')       // Normalizza trattini multipli
            .trim();
    }

    // Genera uno slug per il nome della carta
    generateCardNameSlug(cardName) {
        return cardName.toLowerCase()
            .replace(/[^\w\s-]/g, '')  // Rimuovi caratteri speciali
            .replace(/\s+/g, '-')      // Sostituisci spazi con trattini
            .replace(/-+/g, '-')       // Normalizza trattini multipli
            .trim();
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
            
            // Inizializza l'API se necessario
            if (!this.pokemonGameId) {
                await this.initialize();
            }
            
            const searchResults = await this.searchCard(cardInfo);
            
            if (!searchResults || !searchResults.data || searchResults.data.length === 0) {
                console.warn('CardTrader API: Nessun risultato trovato per:', cardInfo.pokemonName);
                
                // MIGLIORAMENTO: Prova una ricerca più aggressiva per carte comuni
                if (cardInfo.pokemonName.toLowerCase() === 'jolteon') {
                    console.log('CardTrader API: Tentativo di ricerca specifica per Jolteon...');
                    
                    // Cerca in espansioni classiche dove Jolteon è più probabile
                    const classicExpansions = ['Base Set', 'Jungle', 'Fossil', 'Base Set 2', 'Legendary Collection'];
                    
                    for (const expansionName of classicExpansions) {
                        const expansionId = this.findExpansionId(expansionName);
                        if (expansionId) {
                            console.log(`CardTrader API: Cercando Jolteon in ${expansionName} (ID: ${expansionId})`);
                            try {
                                const blueprints = await this.getBlueprintsForExpansion(expansionId);
                                const jolteonBlueprints = blueprints.filter(bp => 
                                    bp.name.toLowerCase().includes('jolteon')
                                );
                                
                                if (jolteonBlueprints.length > 0) {
                                    console.log(`CardTrader API: Trovati ${jolteonBlueprints.length} blueprint Jolteon in ${expansionName}`);
                                    const products = await this.getMarketplaceProducts(jolteonBlueprints[0].id);
                                    
                                    if (products.length > 0) {
                                        const result = {
                                            data: products.map(product => ({
                                                id: product.id,
                                                name: product.name_en || product.name,
                                                blueprint_id: product.blueprint_id,
                                                price: product.price,
                                                expansion: product.expansion
                                            }))
                                        };
                                        
                                        const link = this.generateCardLink(cardInfo, result);
                                        console.log('CardTrader API: Link generato per Jolteon:', link);
                                        return link;
                                    }
                                }
                            } catch (error) {
                                console.warn(`Errore nella ricerca Jolteon per ${expansionName}:`, error);
                            }
                        }
                    }
                }
                
                // Fallback con ricerca generica
                const query = encodeURIComponent(`pokemon ${cardInfo.pokemonName}`);
                return `${API_CONFIG.fallback.searchLink}?q=${query}`;
            }
            
            const link = this.generateCardLink(cardInfo, searchResults);
            console.log('CardTrader API: Link generato:', link);
            
            // VERIFICA: Controlla che il link generato sia corretto
            if (searchResults && searchResults.data && searchResults.data.length > 0) {
                const firstResult = searchResults.data[0];
                console.log('CardTrader API: Verifica risultato:', {
                    requestedPokemon: cardInfo.pokemonName,
                    foundBlueprintId: firstResult.blueprint_id,
                    foundName: firstResult.name,
                    generatedLink: link
                });
                
                // Se il nome trovato non contiene il Pokemon richiesto, avvisa
                if (!firstResult.name.toLowerCase().includes(cardInfo.pokemonName.toLowerCase())) {
                    console.warn(`CardTrader API: ATTENZIONE! Il blueprint trovato (${firstResult.name}) non sembra corrispondere al Pokemon richiesto (${cardInfo.pokemonName})`);
                }
            }
            
            return link;
            
        } catch (error) {
            console.error('CardTrader API: Errore durante la generazione del link:', error);
            // Fallback al link generico
            return API_CONFIG.fallback.genericLink;
        }
    }

    // ===== METODI AVANZATI BASATI SULLA DOCUMENTAZIONE API =====

    // Carica le categorie Pokemon per analisi delle proprietà
    async loadPokemonCategories() {
        if (!this.pokemonGameId) {
            await this.getPokemonGameId();
        }

        const response = await this.makeRequest(`/categories?game_id=${this.pokemonGameId}`);
        const categories = response.data || response;
        
        categories.forEach(category => {
            this.categories.set(category.id, category);
        });
        
        console.log('CardTrader API: Caricate', categories.length, 'categorie Pokemon');
        return categories;
    }

    // Cerca blueprint per ID specifico (metodo diretto)
    async getBlueprintById(blueprintId) {
        const cacheKey = `blueprint_${blueprintId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // Usa l'endpoint /blueprints/export con expansion_id per trovare il blueprint
            // Prima dobbiamo trovare l'espansione che contiene questo blueprint
            const allExpansions = Array.from(this.expansions.values());
            
            for (const expansion of allExpansions) {
                try {
                    const blueprints = await this.getBlueprintsForExpansion(expansion.id);
                    const blueprint = blueprints.find(bp => bp.id === blueprintId);
                    if (blueprint) {
                        this.cache.set(cacheKey, blueprint);
                        return blueprint;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            console.error('CardTrader API: Errore nel recupero blueprint per ID:', error);
            return null;
        }
    }

    // Analizza le proprietà di un blueprint per determinare la rarità
    analyzeBlueprintProperties(blueprint) {
        if (!blueprint || !blueprint.editable_properties) {
            return { rarity: null, properties: {} };
        }

        const properties = {};
        let rarity = null;

        // Analizza le proprietà editabili
        for (const prop of blueprint.editable_properties) {
            properties[prop.name] = {
                type: prop.type,
                possible_values: prop.possible_values
            };

            // Cerca proprietà di rarità
            if (prop.name.toLowerCase().includes('rarity') || 
                prop.name.toLowerCase().includes('rarità')) {
                rarity = prop.possible_values;
            }
        }

        return { rarity, properties };
    }

    // Cerca prodotti marketplace con filtri avanzati
    async searchMarketplaceWithFilters(blueprintId, filters = {}) {
        // Gestisci rate limiting asincrono per marketplace
        const rateLimitResult = this.checkMarketplaceRateLimit();
        if (rateLimitResult instanceof Promise) {
            await rateLimitResult;
        }

        let endpoint = `/marketplace/products?blueprint_id=${blueprintId}`;
        
        // Aggiungi filtri se specificati
        if (filters.foil !== undefined) {
            endpoint += `&foil=${filters.foil}`;
        }
        if (filters.language) {
            endpoint += `&language=${filters.language}`;
        }

        try {
            const response = await this.makeRequest(endpoint);
            return response;
        } catch (error) {
            console.error('CardTrader API: Errore nella ricerca marketplace con filtri:', error);
            return null;
        }
    }

    // Confronta blueprint per trovare differenze (es. Full Art vs Ultra Rare)
    async compareBlueprints(blueprintId1, blueprintId2) {
        const blueprint1 = await this.getBlueprintById(blueprintId1);
        const blueprint2 = await this.getBlueprintById(blueprintId2);

        if (!blueprint1 || !blueprint2) {
            return null;
        }

        const analysis1 = this.analyzeBlueprintProperties(blueprint1);
        const analysis2 = this.analyzeBlueprintProperties(blueprint2);

        return {
            blueprint1: {
                id: blueprint1.id,
                name: blueprint1.name,
                properties: analysis1
            },
            blueprint2: {
                id: blueprint2.id,
                name: blueprint2.name,
                properties: analysis2
            },
            differences: this.findPropertyDifferences(analysis1, analysis2)
        };
    }

    // Trova differenze tra le proprietà di due blueprint
    findPropertyDifferences(analysis1, analysis2) {
        const differences = [];
        const allProps = new Set([
            ...Object.keys(analysis1.properties),
            ...Object.keys(analysis2.properties)
        ]);

        for (const propName of allProps) {
            const prop1 = analysis1.properties[propName];
            const prop2 = analysis2.properties[propName];

            if (!prop1 && prop2) {
                differences.push({
                    property: propName,
                    type: 'added',
                    value: prop2
                });
            } else if (prop1 && !prop2) {
                differences.push({
                    property: propName,
                    type: 'removed',
                    value: prop1
                });
            } else if (prop1 && prop2 && JSON.stringify(prop1) !== JSON.stringify(prop2)) {
                differences.push({
                    property: propName,
                    type: 'changed',
                    from: prop1,
                    to: prop2
                });
            }
        }

        return differences;
    }

    // Ottieni informazioni dettagliate su un'espansione
    async getExpansionDetails(expansionId) {
        const cacheKey = `expansion_${expansionId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // Le espansioni sono già caricate in initialize()
            const expansion = this.expansions.get(expansionId);
            if (expansion) {
                this.cache.set(cacheKey, expansion);
                return expansion;
            }
            return null;
        } catch (error) {
            console.error('CardTrader API: Errore nel recupero dettagli espansione:', error);
            return null;
        }
    }

    // Cerca prodotti per espansione con filtri
    async searchProductsByExpansion(expansionId, filters = {}) {
        // Gestisci rate limiting asincrono per marketplace
        const rateLimitResult = this.checkMarketplaceRateLimit();
        if (rateLimitResult instanceof Promise) {
            await rateLimitResult;
        }

        let endpoint = `/marketplace/products?expansion_id=${expansionId}`;
        
        if (filters.foil !== undefined) {
            endpoint += `&foil=${filters.foil}`;
        }
        if (filters.language) {
            endpoint += `&language=${filters.language}`;
        }

        try {
            const response = await this.makeRequest(endpoint);
            return response;
        } catch (error) {
            console.error('CardTrader API: Errore nella ricerca prodotti per espansione:', error);
            return null;
        }
    }

    // Ottieni statistiche sui prezzi per un blueprint
    async getPriceStatistics(blueprintId) {
        const products = await this.searchProductsByBlueprintId(blueprintId);
        if (!products || products.length === 0) {
            return null;
        }

        const prices = products.map(p => p.price.cents).filter(p => p > 0);
        if (prices.length === 0) {
            return null;
        }

        const sortedPrices = prices.sort((a, b) => a - b);
        const min = sortedPrices[0];
        const max = sortedPrices[sortedPrices.length - 1];
        const median = sortedPrices[Math.floor(sortedPrices.length / 2)];
        const avg = Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length);

        return {
            min: min / 100, // Converti in euro
            max: max / 100,
            median: median / 100,
            average: avg / 100,
            count: prices.length
        };
    }
}

// Esporta per uso globale
window.CardTraderAPI = CardTraderAPI; 