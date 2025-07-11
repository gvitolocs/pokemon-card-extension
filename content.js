// Pokemon Card Trader Linker - Content Script
(function() {
    'use strict';

    // Variabili globali
    let isPaused = false;
    let settings = {
        autoActivate: true,
        notifications: true,
        newTab: true,
        useAdvancedAPI: false,
        apiToken: '',

        pokemonKeywords: [
            'pokemon', 'pokémon', 'carta', 'card', 'tcg', 'trading card',
            'charizard', 'pikachu', 'picachu', 'blastoise', 'venusaur', 'mewtwo',
            'holo', 'reverse holo', 'full art', 'secret rare', 'ultra rare'
        ]
    };

    // Configurazione per i diversi siti
    const siteConfigs = {
        'ebay.it': {
            titleSelectors: [
                'h1.x-item-title__mainTitle',
                '.x-item-title__mainTitle',
                '.s-item__title',
                'h3.s-item__title',
                '.s-item__link .s-item__title',
                '[data-testid="x-item-title"] h1',
                '.vim.x-item-title h1'
            ],
            containerSelector: '.s-item__info, [data-testid="x-item-title"], .vim.x-item-title'
        },
        'www.ebay.it': {
            titleSelectors: [
                'h1.x-item-title__mainTitle',
                '.x-item-title__mainTitle',
                '.s-item__title',
                'h3.s-item__title',
                '.s-item__link .s-item__title',
                '[data-testid="x-item-title"] h1',
                '.vim.x-item-title h1'
            ],
            containerSelector: '.s-item__info, [data-testid="x-item-title"], .vim.x-item-title'
        },
        'ebay.com': {
            titleSelectors: [
                'h1.x-item-title__mainTitle',
                '.x-item-title__mainTitle',
                '.s-item__title',
                'h3.s-item__title',
                '.s-item__link .s-item__title',
                '[data-testid="x-item-title"] h1',
                '.vim.x-item-title h1'
            ],
            containerSelector: '.s-item__info, [data-testid="x-item-title"], .vim.x-item-title'
        },
        'www.ebay.com': {
            titleSelectors: [
                'h1.x-item-title__mainTitle',
                '.x-item-title__mainTitle',
                '.s-item__title',
                'h3.s-item__title',
                '.s-item__link .s-item__title',
                '[data-testid="x-item-title"] h1',
                '.vim.x-item-title h1'
            ],
            containerSelector: '.s-item__info, [data-testid="x-item-title"], .vim.x-item-title'
        },
        'vinted.it': {
            titleSelectors: [
                'h1.web_ui__Text__text.web_ui__Text__title',
                '.web_ui__Text__text.web_ui__Text__title',
                '.web_ui__Text__text',
                '.web_ui__Text__text--bold',
                '[data-testid="item-title"]',
                '.item-box__title',
                '.summary-max-lines-4 h1',
                '.summary-max-lines-4 .web_ui__Text__text.web_ui__Text__title'
            ],
            containerSelector: '.item-box, .summary-max-lines-4, .box--item-details'
        },
        'www.vinted.it': {
            titleSelectors: [
                'h1.web_ui__Text__text.web_ui__Text__title',
                '.web_ui__Text__text.web_ui__Text__title',
                '.web_ui__Text__text',
                '.web_ui__Text__text--bold',
                '[data-testid="item-title"]',
                '.item-box__title',
                '.summary-max-lines-4 h1',
                '.summary-max-lines-4 .web_ui__Text__text.web_ui__Text__title'
            ],
            containerSelector: '.item-box, .summary-max-lines-4, .box--item-details'
        },
        'vinted.com': {
            titleSelectors: [
                'h1.web_ui__Text__text.web_ui__Text__title',
                '.web_ui__Text__text.web_ui__Text__title',
                '.web_ui__Text__text',
                '.web_ui__Text__text--bold',
                '[data-testid="item-title"]',
                '.item-box__title',
                '.summary-max-lines-4 h1',
                '.summary-max-lines-4 .web_ui__Text__text.web_ui__Text__title'
            ],
            containerSelector: '.item-box, .summary-max-lines-4, .box--item-details'
        },
        'www.vinted.com': {
            titleSelectors: [
                'h1.web_ui__Text__text.web_ui__Text__title',
                '.web_ui__Text__text.web_ui__Text__title',
                '.web_ui__Text__text',
                '.web_ui__Text__text--bold',
                '[data-testid="item-title"]',
                '.item-box__title',
                '.summary-max-lines-4 h1',
                '.summary-max-lines-4 .web_ui__Text__text.web_ui__Text__title'
            ],
            containerSelector: '.item-box, .summary-max-lines-4, .box--item-details'
        }
    };

    // Funzione per pulire il testo del titolo
    function cleanTitle(title) {
        return title
            .replace(/[^\w\s]/g, ' ') // Rimuove caratteri speciali
            .replace(/\s+/g, ' ') // Sostituisce spazi multipli con uno solo
            .trim()
            .toLowerCase();
    }

    // Istanza globale dell'API CardTrader
    let cardTraderAPI = null;
    
    // Istanza globale di Supabase
    let supabaseDB = null;

    // Funzione per inizializzare Supabase
    async function initializeSupabase() {
        try {
            if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.enabled) {
                const supabaseClient = await window.initializeSupabase();
                if (supabaseClient) {
                    supabaseDB = new SupabasePokemonDB(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
                    console.log('✅ Supabase integrato per ricerche veloci');
                }
            }
        } catch (error) {
            console.log('⚠️ Supabase non disponibile, usando solo CardTrader API');
        }
    }

    // Funzione per creare il link CardTrader con integrazione Supabase
    async function createCardTraderLink(title) {
        // Prima prova a cercare nel database Supabase (molto più veloce)
        if (supabaseDB) {
            try {
                console.log('🔍 Ricerca veloce in Supabase per:', title);
                
                // Estrai il nome del Pokemon dal titolo
                const pokemonName = extractPokemonName(title);
                if (pokemonName) {
                    // Usa la ricerca migliorata che include le varianti
                    const supabaseResults = await supabaseDB.searchPokemonWithVariants(pokemonName);
                    
                    if (supabaseResults && supabaseResults.length > 0) {
                        // Trova il miglior match
                        const bestMatch = findBestMatch(supabaseResults, title);
                        if (bestMatch) {
                            const link = supabaseDB.generateCardTraderLink(bestMatch);
                            console.log('✅ Link generato da Supabase:', link);
                            return link;
                        }
                    }
                }
            } catch (error) {
                console.log('⚠️ Ricerca Supabase fallita, usando CardTrader API:', error.message);
            }
        }

        // Fallback all'API CardTrader
        const shouldUseAPI = settings.useAdvancedAPI || (API_CONFIG.authToken && !settings.apiToken);
        
        if (!shouldUseAPI) {
            return API_CONFIG.fallback.genericLink;
        }

        // Inizializza l'API se non è già stata inizializzata
        if (!cardTraderAPI) {
            cardTraderAPI = new CardTraderAPI();
            // Configura il token (usa quello delle impostazioni o quello predefinito)
            API_CONFIG.authToken = settings.apiToken || API_CONFIG.authToken;
        }

        try {
            // Usa l'API per generare un link specifico
            const link = await cardTraderAPI.createCardTraderLink(title);
            console.log('Pokemon Card Trader: Link generato con API:', link);
            return link;
        } catch (error) {
            console.error('Pokemon Card Trader: Errore nella generazione del link:', error);
            // Fallback al link generico
            return API_CONFIG.fallback.genericLink;
        }
    }

    // Funzione per estrarre il nome del Pokemon dal titolo
    function extractPokemonName(title) {
        const pokemonNames = [
            'jolteon', 'pikachu', 'charizard', 'blastoise', 'venusaur', 'mewtwo',
            'mew', 'lugia', 'ho-oh', 'rayquaza', 'garchomp', 'lucario',
            'gengar', 'dragonite', 'tyranitar', 'metagross', 'salamence',
            'moltres', 'articuno', 'zapdos', 'entei', 'raikou', 'suicune'
        ];
        
        const titleLower = title.toLowerCase();
        
        for (const pokemon of pokemonNames) {
            if (titleLower.includes(pokemon)) {
                return pokemon;
            }
        }
        
        // Se non trova un nome specifico, prova a estrarre parole che potrebbero essere Pokemon
        const words = titleLower.split(/\s+/);
        for (const word of words) {
            if (word.length > 3 && /^[a-z]+$/.test(word)) {
                return word;
            }
        }
        
        return null;
    }

    // Funzione per trovare il miglior match nei risultati Supabase
    function findBestMatch(supabaseResults, title) {
        const titleLower = title.toLowerCase();
        
        // Estrai informazioni specifiche dal titolo
        const titleInfo = extractTitleInfo(title);
        console.log('🔍 Informazioni estratte dal titolo:', titleInfo);
        
        // Calcola punteggi per ogni risultato
        const scoredResults = [];
        
        for (const tableResult of supabaseResults) {
            for (const result of tableResult.results) {
                const name = (result.name_en || result.name || result.pokemon_name || '').toLowerCase();
                const expansion = (result.expansion_name_en || result.expansion_name || result.expansion_code || '').toLowerCase();
                const collectorNumber = result.collector_number ? result.collector_number.toString() : '';
                
                let score = 0;
                let matchReason = '';
                
                // Punteggio base per match del nome Pokemon
                if (titleLower.includes(name) || name.includes(titleInfo.pokemonName)) {
                    score += 10;
                    matchReason += 'Nome Pokemon ';
                }
                
                // Bonus per match esatto del nome
                if (name === titleInfo.pokemonName) {
                    score += 20;
                    matchReason += 'Nome esatto ';
                }
                
                // Bonus per match con "ex" se il titolo contiene "ex"
                if (titleLower.includes(' ex ') && name.includes(' ex')) {
                    score += 15;
                    matchReason += 'Match ex ';
                }
                
                // Bonus per match dell'espansione
                if (titleInfo.expansion && expansion.includes(titleInfo.expansion)) {
                    score += 25;
                    matchReason += 'Espansione ';
                }
                
                // Bonus per match del numero collezionista
                if (titleInfo.collectorNumber && collectorNumber.includes(titleInfo.collectorNumber)) {
                    score += 30;
                    matchReason += 'Numero collezionista ';
                }
                
                // Bonus per presenza di immagine
                if (result.image_url) {
                    score += 5;
                    matchReason += 'Con immagine ';
                }
                
                // Bonus per presenza di blueprint_id
                if (result.blueprint_id || result.id) {
                    score += 5;
                    matchReason += 'Con blueprint_id ';
                }
                
                // Penalità per espansioni non corrispondenti
                if (titleInfo.expansion && !expansion.includes(titleInfo.expansion)) {
                    score -= 10;
                    matchReason += 'Espansione diversa ';
                }
                
                // Penalità per numeri collezionista non corrispondenti
                if (titleInfo.collectorNumber && collectorNumber && !collectorNumber.includes(titleInfo.collectorNumber)) {
                    score -= 10;
                    matchReason += 'Numero diverso ';
                }
                
                if (score > 0) {
                    scoredResults.push({
                        result: result,
                        score: score,
                        reason: matchReason.trim()
                    });
                }
            }
        }
        
        // Ordina per punteggio decrescente
        scoredResults.sort((a, b) => b.score - a.score);
        
        console.log('📊 Risultati con punteggi:');
        scoredResults.slice(0, 5).forEach((item, index) => {
            console.log(`${index + 1}. ${item.result.name_en || item.result.pokemon_name} (${item.result.expansion_name_en || item.result.expansion_name}) - Punteggio: ${item.score} - Motivo: ${item.reason}`);
        });
        
        // Restituisci il risultato con punteggio più alto
        if (scoredResults.length > 0) {
            const bestMatch = scoredResults[0];
            console.log(`✅ Miglior match: ${bestMatch.result.name_en || bestMatch.result.pokemon_name} - Punteggio: ${bestMatch.score} - Motivo: ${bestMatch.reason}`);
            return bestMatch.result;
        }
        
        // Fallback al primo risultato disponibile
        if (supabaseResults.length > 0 && supabaseResults[0].results.length > 0) {
            console.log('✅ Fallback al primo risultato disponibile:', supabaseResults[0].results[0]);
            return supabaseResults[0].results[0];
        }
        
        return null;
    }
    
    function extractTitleInfo(title) {
        const titleLower = title.toLowerCase();
        const info = {
            pokemonName: '',
            expansion: '',
            collectorNumber: '',
            rarity: ''
        };
        
        // Estrai il nome del Pokemon
        info.pokemonName = extractPokemonName(title);
        
        // Estrai l'espansione (cerca pattern comuni)
        const expansionPatterns = [
            // Scarlet & Violet - priorità alta per Terastal Festival ex
            /terastal festival ex/i,
            /sv\d+/i,
            /scarlet & violet/i,
            /sv base set/i,
            /sv paldea evolved/i,
            /sv obsidian flames/i,
            /sv 151/i,
            /sv paradox rift/i,
            /sv temporal forces/i,
            /sv paldean fates/i,
            /sv terastal festival ex/i,
            
            // Sword & Shield
            /sword & shield/i,
            /swsh/i,
            /swsh sword & shield/i,
            /swsh rebel clash/i,
            /swsh darkness ablaze/i,
            /swsh champions path/i,
            /swsh vivid voltage/i,
            /swsh shining fates/i,
            /swsh battle styles/i,
            /swsh chilling reign/i,
            /swsh evolving skies/i,
            /swsh fusion strike/i,
            /swsh brilliant stars/i,
            /swsh astral radiance/i,
            /swsh lost origin/i,
            /swsh silver tempest/i,
            /swsh crown zenith/i,
            
            // Sun & Moon
            /sun & moon/i,
            /sm/i,
            /sm sun & moon/i,
            /sm guardians rising/i,
            /sm burning shadows/i,
            /sm shining legends/i,
            /sm crimson invasion/i,
            /sm ultra prism/i,
            /sm forbidden light/i,
            /sm celestial storm/i,
            /sm dragon majesty/i,
            /sm lost thunder/i,
            /sm team up/i,
            /sm detective pikachu/i,
            /sm unbroken bonds/i,
            /sm unified minds/i,
            /sm hidden fates/i,
            /sm cosmic eclipse/i,
            
            // XY
            /xy/i,
            /xy kalos starter set/i,
            /xy xy/i,
            /xy flashfire/i,
            /xy furious fists/i,
            /xy phantom forces/i,
            /xy primal clash/i,
            /xy double crisis/i,
            /xy roaring skies/i,
            /xy ancient origins/i,
            /xy breakthrough/i,
            /xy breakpoint/i,
            /xy generations/i,
            /xy fates collide/i,
            /xy steam siege/i,
            /xy evolutions/i,
            
            // Black & White
            /black & white/i,
            /bw/i,
            /bw black star promos/i,
            /bw next destinies/i,
            /bw noble victories/i,
            /bw emerging powers/i,
            /bw black & white/i,
            /bw dark explorers/i,
            /bw dragons exalted/i,
            /bw boundaries crossed/i,
            /bw plasma storm/i,
            /bw plasma freeze/i,
            /bw plasma blast/i,
            /bw legendary treasures/i,
            /bw xy/i,
            
            // HeartGold & SoulSilver
            /heartgold & soulsilver/i,
            /hgss/i,
            
            // Platinum
            /platinum/i,
            
            // Diamond & Pearl
            /diamond & pearl/i,
            /dp/i,
            
            // EX Series
            /ex delta species/i,
            /ex unseen forces/i,
            /ex sandstorm/i,
            /ex power keepers/i,
            /ex ruby & sapphire/i,
            /ex fire red & leaf green/i,
            /ex team rocket returns/i,
            /ex deoxys/i,
            /ex emerald/i,
            /ex holon phantoms/i,
            /ex crystal guardians/i,
            /ex dragon frontiers/i,
            /ex diamond & pearl/i,
            /ex mysterious treasures/i,
            /ex secret wonders/i,
            /ex great encounters/i,
            /ex majestic dawn/i,
            /ex legends awakened/i,
            /ex stormfront/i,
            /ex platinum/i,
            /ex rising rivals/i,
            /ex supreme victors/i,
            /ex arceus/i,
            /ex heartgold & soulsilver/i,
            /ex unleashed/i,
            /ex undaunted/i,
            /ex triumphant/i,
            /ex call of legends/i
        ];
        
        for (const pattern of expansionPatterns) {
            const match = titleLower.match(pattern);
            if (match) {
                info.expansion = match[0];
                break;
            }
        }
        
        // Estrai il numero collezionista (pattern: XXX/YYY)
        const collectorPattern = /(\d+)\/(\d+)/;
        const collectorMatch = titleLower.match(collectorPattern);
        if (collectorMatch) {
            info.collectorNumber = collectorMatch[1]; // Prendi solo il primo numero
        }
        
        // Estrai la rarità
        const rarityPatterns = [
            /full art/i,
            /ultra rare/i,
            /secret rare/i,
            /rainbow rare/i,
            /gold rare/i,
            /alternate art/i,
            /alt art/i,
            /special art/i,
            /special illustration/i,
            /illustration rare/i,
            /character rare/i,
            /character super rare/i,
            /super rare/i,
            /rare/i,
            /uncommon/i,
            /common/i
        ];
        
        for (const pattern of rarityPatterns) {
            const match = titleLower.match(pattern);
            if (match) {
                info.rarity = match[0];
                break;
            }
        }
        
        return info;
    }

    // Funzione per caricare le impostazioni
    function loadSettings() {
        chrome.storage.sync.get(settings, function(items) {
            settings = { ...settings, ...items };
        });
    }

    // Funzione per nascondere elementi pubblicitari di Vinted
    function hideVintedAds() {
        if (!window.location.hostname.includes('vinted')) {
            return;
        }

        // Selettori per elementi pubblicitari
        const adSelectors = [
            '[data-testid="slot-container"]',
            '[data-testid="slot-placeholder"]',
            '[data-testid="slot-placeholder-image"]',
            '[data-testid="slot-placeholder-image--img"]',
            '[data-testid="main-slot"]',
            '.slot-container',
            '.slot-container--leaderboard',
            '.slot-placeholder',
            '.slot-placeholder--leaderboard',
            '.slot-content',
            '#slot-leaderboard',
            '.web_ui__Image__image[data-testid="slot-placeholder-image"]',
            '.web_ui__Image__content[data-testid="slot-placeholder-image--img"]',
            '[data-testid*="ad"]',
            '[data-testid*="advertisement"]',
            '[data-testid*="promo"]',
            '[data-testid*="sponsored"]',
            '[class*="ad-"]',
            '[class*="advertisement"]',
            '[class*="promo"]',
            '[class*="sponsored"]',
            '[id*="ad-"]',
            '[id*="advertisement"]',
            '[id*="promo"]',
            '[id*="sponsored"]'
        ];

        adSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.style.display = 'none';
                element.style.visibility = 'hidden';
                element.style.opacity = '0';
                element.style.height = '0';
                element.style.width = '0';
                element.style.overflow = 'hidden';
            });
        });

        // Nascondi immagini con URL specifici
        const adImages = document.querySelectorAll('img[src*="placeholders"], img[src*="ads"], img[src*="leaderboard"]');
        adImages.forEach(img => {
            img.style.display = 'none';
            img.style.visibility = 'hidden';
            img.style.opacity = '0';
        });

        // Nascondi testo all'interno dei placeholder
        const adTexts = document.querySelectorAll('.slot-placeholder__text, .slot-placeholder .web_ui__Text__text');
        adTexts.forEach(text => {
            text.style.display = 'none';
            text.style.visibility = 'hidden';
            text.style.opacity = '0';
        });
    }



    // Funzione per creare il pulsante CT
    async function createCTButton(title) {
        const link = await createCardTraderLink(title);
        console.log('Pokemon Card Trader: Link CardTrader generato:', link);
        const button = document.createElement('a');
        button.className = 'ct-button';
        button.href = link;
        button.target = '_blank';
        button.textContent = 'CT';
        button.title = 'Vai su CardTrader Pokemon';
        button.style.cssText = `
            cursor: pointer;
            margin-left: 5px;
            background-color: rgb(240, 240, 240);
            border: 1px solid rgb(204, 204, 204);
            border-radius: 4px;
            padding: 3px 6px;
            text-decoration: none;
            color: black;
            font-size: 11px;
            font-weight: bold;
            display: inline-block;
            transition: all 0.2s ease;
        `;
        
        // Aggiungi hover effect
        button.addEventListener('mouseenter', function() {
            this.style.backgroundColor = 'rgb(220, 220, 220)';
            this.style.borderColor = 'rgb(180, 180, 180)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.backgroundColor = 'rgb(240, 240, 240)';
            this.style.borderColor = 'rgb(204, 204, 204)';
        });
        
        return button;
    }

    // Funzione per processare un elemento titolo
    async function processTitleElement(titleElement, container) {
        // Controlla se è già stato processato
        if (titleElement.dataset.cardtraderProcessed) {
            return;
        }

        const title = titleElement.textContent || titleElement.innerText;
        if (!title || title.trim().length === 0) {
            return;
        }

        // Debug: log del titolo trovato
        console.log('Pokemon Card Trader: Trovato titolo:', title);

        // Cerca parole chiave Pokemon dalle impostazioni
        const cleanedTitle = cleanTitle(title);
        const hasPokemonKeywords = settings.pokemonKeywords.some(keyword => 
            cleanedTitle.includes(keyword.toLowerCase())
        );

        // Debug: log del risultato del controllo
        console.log('Pokemon Card Trader: Titolo pulito:', cleanedTitle);
        console.log('Pokemon Card Trader: Contiene parole chiave Pokemon:', hasPokemonKeywords);
        console.log('Pokemon Card Trader: Estensione in pausa:', isPaused);

        if (hasPokemonKeywords && !isPaused) {
            console.log('Pokemon Card Trader: Creando pulsante CT per:', title);
            // Crea e aggiungi il pulsante CT
            const ctButton = await createCTButton(title);
            
            // Trova la posizione migliore per inserire il pulsante
            let insertPosition = null;
            
            // Per eBay, inserisci accanto al titolo
            if (window.location.hostname.includes('ebay')) {
                // Per il nuovo formato con data-testid, inserisci nel container principale
                if (container.matches('[data-testid="x-item-title"]') || container.matches('.vim.x-item-title')) {
                    // Inserisci il pulsante nel container principale, come fa HISTORY
                    container.appendChild(ctButton);
                    insertPosition = container;
                } else {
                    // Per i formati classici, inserisci nell'elemento titolo
                    const titleElement = container.querySelector('.x-item-title__mainTitle') || 
                                       container.querySelector('h1.x-item-title__mainTitle') ||
                                       container.querySelector('.s-item__title');
                    
                    if (titleElement) {
                        titleElement.appendChild(ctButton);
                        insertPosition = titleElement;
                    }
                }
            }
            
            // Per Vinted, inserisci accanto al titolo
            if (window.location.hostname.includes('vinted')) {
                const titleElement = container.querySelector('.item-box__title') || 
                                   container.querySelector('[data-testid="item-title"]') ||
                                   container.querySelector('.web_ui__Text__text.web_ui__Text__title') ||
                                   container.querySelector('h1.web_ui__Text__text.web_ui__Text__title');
                
                if (titleElement) {
                    // Inserisci il pulsante dopo il titolo
                    titleElement.appendChild(ctButton);
                    insertPosition = titleElement;
                }
            }

            // Se il pulsante è stato inserito, marca come processato
            if (insertPosition) {
                console.log('Pokemon Card Trader: Pulsante CT inserito con successo');
                titleElement.dataset.cardtraderProcessed = 'true';
            } else {
                console.log('Pokemon Card Trader: Impossibile inserire il pulsante CT');
            }
        }
    }

    // Funzione principale per processare la pagina
    async function processPage() {
        console.log('Pokemon Card Trader: processPage chiamata');
        
        if (isPaused || !settings.autoActivate) {
            console.log('Pokemon Card Trader: Estensione in pausa o autoActivate disabilitato');
            return;
        }

        const hostname = window.location.hostname;
        const config = siteConfigs[hostname];

        if (!config) {
            console.log('Pokemon Card Trader: Nessuna configurazione trovata per', hostname);
            return;
        }
        
        console.log('Pokemon Card Trader: Configurazione trovata per', hostname);

        // Nascondi pubblicità su Vinted
        hideVintedAds();

        // Trova tutti i container delle inserzioni
        const containers = document.querySelectorAll(config.containerSelector);
        console.log('Pokemon Card Trader: Trovati', containers.length, 'container');
        
        // Processa i container in parallelo per migliorare le performance
        const promises = containers.map(async container => {
            // Trova il titolo usando i selettori configurati
            let titleElement = null;
            for (const selector of config.titleSelectors) {
                titleElement = container.querySelector(selector);
                if (titleElement) {
                    console.log('Pokemon Card Trader: Trovato titolo con selettore:', selector);
                    break;
                }
            }

            if (titleElement) {
                await processTitleElement(titleElement, container);
            } else {
                console.log('Pokemon Card Trader: Nessun titolo trovato nel container:', container);
            }
        });

        // Aspetta che tutti i container siano processati
        await Promise.all(promises);
    }

    // Osserva i cambiamenti nella pagina (per pagine dinamiche)
    function observePageChanges() {
        const observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Controlla se sono stati aggiunti nuovi elementi di inserzioni
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const hostname = window.location.hostname;
                            const config = siteConfigs[hostname];
                            if (config && (
                                node.matches?.(config.containerSelector) ||
                                node.querySelector?.(config.containerSelector) ||
                                node.querySelector?.('.summary-max-lines-4') ||
                                node.querySelector?.('.web_ui__Text__text.web_ui__Text__title') ||
                                node.querySelector?.('h1.x-item-title__mainTitle') ||
                                node.querySelector?.('.x-item-title__mainTitle') ||
                                node.querySelector?.('[data-testid="x-item-title"]') ||
                                node.querySelector?.('.vim.x-item-title')
                            )) {
                                shouldProcess = true;
                            }


                        }
                    });
                }
            });

            if (shouldProcess) {
                // Aspetta un po' per permettere al DOM di stabilizzarsi
                setTimeout(() => processPage().catch(console.error), 100);
            }

            // Controlla anche se sono stati aggiunti elementi pubblicitari
            if (window.location.hostname.includes('vinted') && (
                node.matches?.('[data-testid="slot-placeholder"]') ||
                node.matches?.('[data-testid="slot-container"]') ||
                node.matches?.('.slot-placeholder') ||
                node.matches?.('.slot-container') ||
                node.querySelector?.('[data-testid="slot-placeholder"]') ||
                node.querySelector?.('[data-testid="slot-container"]') ||
                node.querySelector?.('.slot-placeholder') ||
                node.querySelector?.('.slot-container')
            )) {
                setTimeout(hideVintedAds, 100);
            }
        });

        // Nascondi anche pubblicità che potrebbero essere aggiunte dinamicamente
        if (window.location.hostname.includes('vinted')) {
            setTimeout(hideVintedAds, 500);
            setTimeout(hideVintedAds, 2000);
        }

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Inizializzazione
    async function init() {
        console.log('Pokemon Card Trader: Estensione inizializzata su', window.location.hostname);
        console.log('Pokemon Card Trader: Impostazioni caricate:', settings);
        console.log('Pokemon Card Trader: Parole chiave Pokemon:', settings.pokemonKeywords);
        
        // Inizializza Supabase per ricerche veloci
        await initializeSupabase();
        
        // Processa la pagina corrente
        processPage().catch(console.error);
        
        // Osserva i cambiamenti per pagine dinamiche
        observePageChanges();
        
        // Processa di nuovo dopo un breve delay per assicurarsi che tutto sia caricato
        setTimeout(() => processPage().catch(console.error), 1000);
    }

    // Avvia quando il DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Processa anche quando la pagina cambia (per SPA)
    window.addEventListener('load', () => processPage().catch(console.error));
    
    // Processa periodicamente per assicurarsi che tutto sia processato
    setInterval(() => processPage().catch(console.error), 3000);

    // Gestione dei messaggi dal popup e dalle impostazioni
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        switch (request.action) {
            case 'toggle':
                isPaused = !isPaused;
                sendResponse({paused: isPaused});
                break;
            
            case 'updateSettings':
                settings = { ...settings, ...request.settings };
                // Ricarica la pagina per applicare le nuove impostazioni
                setTimeout(() => processPage().catch(console.error), 100);
                sendResponse({success: true});
                break;
            
            case 'getStatus':
                sendResponse({
                    paused: isPaused,
                    autoActivate: settings.autoActivate,
                    site: window.location.hostname
                });
                break;
        }
    });

    // Carica le impostazioni all'avvio
    loadSettings();

})(); 