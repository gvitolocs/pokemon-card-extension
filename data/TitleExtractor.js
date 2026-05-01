/**
 * TitleExtractor.js - Listing title extraction and parsing
 * Extracts titles from listings and parses card metadata.
 */

class TitleExtractor {
    constructor() {
        console.log('📝 TitleExtractor initialized');
    }
    
    /**
     * Extract title from a listing
     */
    extractTitleFromListing(listingElement) {
        const hostname = window.location.hostname;
        
        if (hostname.includes('vinted')) {
            return this.extractTitleVinted(listingElement);
        } else if (hostname.includes('ebay')) {
            return this.extractTitleEbay(listingElement);
        } else if (hostname.includes('cardmarket')) {
            return this.extractTitleCardmarket(listingElement);
        }
        
        return null;
    }
    
    /**
     * Extract title from Vinted
     */
    extractTitleVinted(listingElement) {
        const titleSelectors = [
            '[data-testid="item-card-title"]',
            '[data-testid="item-page-summary-plugin"] .web_ui__Text__title',
            '.item-details .web_ui__Text__title',
            '.product-details .web_ui__Text__title',
            '.web_ui__Text__title:not([data-testid*="service"]):not([data-testid*="commission"])'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                let title = element.textContent.trim();
                title = this.cleanTitle(title);
                return title;
            }
        }
        
        // Fallback: use listing element text
        if (listingElement.textContent && listingElement.textContent.trim()) {
            let title = listingElement.textContent.trim();
            title = this.cleanTitle(title);
            return title;
        }
        
        return null;
    }
    
    /**
     * Extract title from eBay
     */
    extractTitleEbay(listingElement) {
        const titleSelectors = [
            '.s-item__title',
            '.s-item__link',
            'h3',
            '.title',
            '.name'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                let title = element.textContent.trim();
                title = this.cleanTitle(title);
                return title;
            }
        }
        
        // Fallback: use listing element text
        if (listingElement.textContent && listingElement.textContent.trim()) {
            let title = listingElement.textContent.trim();
            title = this.cleanTitle(title);
            return title;
        }
        
        return null;
    }
    
    /**
     * Extract title from Cardmarket
     */
    extractTitleCardmarket(listingElement) {
        const titleSelectors = [
            '.page-title-container', // main container
            '.page-title-container .flex-grow-1 h1', // specific h1
            'h1', // product page
            '.product-title', // listing
            '.col-12 .d-flex .flex-grow-1 h1', // typical Cardmarket structure
            '.col-12 .product-title'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector) || (listingElement.matches(selector) ? listingElement : null);
            if (element && element.textContent && element.textContent.trim()) {
                console.log(`🔍 [CardTrader] Cardmarket selector found: "${selector}"`);
                let title = '';
                
                // On Cardmarket, take full h1 text including spans (to include expansion)
                if (element.tagName === 'H1') {
                    title = element.textContent.trim();
                    console.log(`🔍 [CardTrader] Full Cardmarket H1 - extracted title: "${title}"`);
                } else {
                    title = element.textContent.trim();
                    console.log(`🔍 [CardTrader] Standard Cardmarket title - extracted: "${title}"`);
                }
                
                title = this.cleanTitle(title);
                console.log(`🔍 [CardTrader] Final Cardmarket title: "${title}"`);
                return title;
            }
        }
        
        return null;
    }
    
    /**
     * Remove extension artifacts from title
     */
    cleanTitle(title) {
        // Remove possible CardTrader button artifacts from title
        title = title.replace(/\bCardTrader\b/g, '').trim();
        title = title.replace(/\bDB offline\b/g, '').trim();
        title = title.replace(/\bLoading\.\.\.\b/g, '').trim();
        
        return title;
    }
    
    /**
     * Extract metadata from title
     */
    extractTitleInfo(title) {
        // Remove extension artifacts from title
        let cleanTitle = this.cleanTitle(title);
        
        console.log(`🔍 [CardTrader] Processing title: "${cleanTitle}" (original: "${title}")`);
        const titleLower = cleanTitle.toLowerCase();
        
        // Special handling for Pokemon with multi-word names/variants
        const specialCases = {
            'mr. mime': 'mr-mime',
            'mr mime': 'mr-mime', 
            'mrmime': 'mr-mime',
            'mr. mime galar': 'mr-rime',
            'mr mime galar': 'mr-rime',
            'mrmime galar': 'mr-rime',
            'mr. rime': 'mr-rime',
            'mr rime': 'mr-rime',
            'mrrime': 'mr-rime',
            'mime jr.': 'mime-jr',
            'mime jr': 'mime-jr',
            'mimejr': 'mime-jr',
            'type: null': 'type-null',
            'type null': 'type-null',
            'typenull': 'type-null',
            'porygon-z': 'porygon-z',
            'porygon z': 'porygon-z',
            'porygonz': 'porygon-z',
            'ho-oh': 'ho-oh',
            'ho oh': 'ho-oh',
            'hooh': 'ho-oh',
            'jangmo-o': 'jangmo-o',
            'jangmo o': 'jangmo-o',
            'jangmoo': 'jangmo-o',
            'hakamo-o': 'hakamo-o',
            'hakamo o': 'hakamo-o',
            'hakamoo': 'hakamo-o',
            'kommo-o': 'kommo-o',
            'kommo o': 'kommo-o',
            'kommoo': 'kommo-o',
            'farfetch\'d': 'farfetchd',
            'farfetchd': 'farfetchd',
            'sirfetch\'d': 'sirfetchd',
            'sirfetchd': 'sirfetchd',
            'flabébé': 'flabebe',
            'flabebe': 'flabebe',
            'floette': 'floette',
            'florges': 'florges'
        };

        // Full Pokemon list (Generations 1-9)
        const pokemonNames = [
            // Generation 1 (Kanto) - 151 Pokemon
            'bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard',
            'squirtle', 'wartortle', 'blastoise', 'caterpie', 'metapod', 'butterfree',
            'weedle', 'kakuna', 'beedrill', 'pidgey', 'pidgeotto', 'pidgeot',
            'rattata', 'raticate', 'spearow', 'fearow', 'ekans', 'arbok',
            'pichu', 'pikachu', 'raichu', 'sandshrew', 'sandslash', 'nidoran♀', 'nidorina', 'nidoqueen',
            'nidoran♂', 'nidorino', 'nidoking', 'cleffa', 'clefairy', 'clefable',
            'vulpix', 'ninetales', 'igglybuff', 'jigglypuff', 'wigglytuff', 'zubat', 'golbat',
            'oddish', 'gloom', 'vileplume', 'paras', 'parasect', 'venonat', 'venomoth',
            'diglett', 'dugtrio', 'meowth', 'persian', 'psyduck', 'golduck',
            'mankey', 'primeape', 'growlithe', 'arcanine', 'poliwag', 'poliwhirl', 'poliwrath',
            'abra', 'kadabra', 'alakazam', 'machop', 'machoke', 'machamp',
            'bellsprout', 'weepinbell', 'victreebel', 'tentacool', 'tentacruel', 'geodude', 'graveler', 'golem',
            'ponyta', 'rapidash', 'slowpoke', 'slowbro', 'magnemite', 'magneton',
            'farfetch\'d', 'doduo', 'dodrio', 'seel', 'dewgong', 'grimer', 'muk',
            'shellder', 'cloyster', 'gastly', 'haunter', 'gengar', 'drowzee', 'hypno',
            'krabby', 'kingler', 'voltorb', 'electrode', 'exeggcute', 'exeggutor',
            'cubone', 'marowak', 'hitmonlee', 'hitmonchan', 'lickitung', 'koffing', 'weezing',
            'rhyhorn', 'rhydon', 'chansey', 'tangela', 'kangaskhan', 'horsea', 'seadra',
            'goldeen', 'seaking', 'staryu', 'starmie', 'mr. mime', 'scyther', 'jynx',
            'electabuzz', 'magmar', 'pinsir', 'tauros', 'magikarp', 'gyarados', 'lapras',
            'ditto', 'vaporeon', 'jolteon', 'flareon', 'omanyte', 'omastar', 'kabuto', 'kabutops',
            'aerodactyl', 'snorlax', 'articuno', 'zapdos', 'moltres', 'dratini', 'dragonair', 'dragonite',
            'mewtwo', 'mew'
        ];

        // Search Pokemon name in title
        let pokemonName = null;
        let expansionName = null;
        let collectorNumber = null;
        let rarity = null;

        // Check special cases first
        for (const [variant, normalized] of Object.entries(specialCases)) {
            if (titleLower.includes(variant)) {
                pokemonName = normalized;
                break;
            }
        }

        // If not found in special cases, scan general list
        if (!pokemonName) {
            for (const name of pokemonNames) {
                if (titleLower.includes(name)) {
                    pokemonName = name;
                    break;
                }
            }
        }

        // Extract collector number (number in spaces or parentheses)
        const numberMatch = cleanTitle.match(/(?:\(|^|\s)(\d{1,3})(?:\)|$|\s)/);
        if (numberMatch) {
            collectorNumber = numberMatch[1];
        }

        // Extract expansion by known keywords
        const expansionKeywords = [
            'evoluzioni prismatiche', 'prismatiche', 'evoluzioni', 'evolutions',
            'base set', 'jungle', 'fossil', 'team rocket', 'gym heroes', 'gym challenge',
            'neo genesis', 'neo discovery', 'neo revelation', 'neo destiny',
            'expedition', 'aquapolis', 'skyridge', 'ruby & sapphire', 'sandstorm', 'dragon',
            'hidden legends', 'fire red & leaf green', 'team magma vs team aqua', 'hidden legends',
            'deoxys', 'emerald', 'unseen forces', 'delta species', 'legend maker', 'holon phantoms',
            'crystal guardians', 'dragon frontiers', 'power keepers', 'diamond & pearl', 'mysterious treasures',
            'secret wonders', 'great encounters', 'majestic dawn', 'legends awakened', 'stormfront',
            'platinum', 'rising rivals', 'supreme victors', 'arceus', 'heartgold & soulsilver',
            'unleashed', 'undaunted', 'triumphant', 'call of legends', 'black & white', 'emerging powers',
            'noble victories', 'next destinies', 'dark explorers', 'dragons exalted', 'boundaries crossed',
            'plasma storm', 'plasma freeze', 'plasma blast', 'legendary treasures', 'xy', 'flashfire',
            'furious fists', 'phantom forces', 'primal clash', 'roaring skies', 'ancient origins',
            'breakthrough', 'breakpoint', 'generations', 'fates collide', 'steam siege', 'evolutions',
            'sun & moon', 'guardians rising', 'burning shadows', 'crimson invasion', 'ultra prism',
            'forbidden light', 'celestial storm', 'dragon majesty', 'lost thunder', 'team up',
            'detective pikachu', 'unbroken bonds', 'unified minds', 'hidden fates', 'cosmic eclipse',
            'sword & shield', 'rebel clash', 'darkness ablaze', 'champions path', 'vivid voltage',
            'shining fates', 'battle styles', 'chilling reign', 'evolving skies', 'fusion strike',
            'brilliant stars', 'astral radiance', 'lost origin', 'silver tempest', 'scarlet & violet',
            'paldea evolved', 'obsidian flames', '151', 'paradox rift', 'temporal forces',
            'twilight masquerade', 'ancient roar', 'future flash', 'shrouded fable'
        ];

        for (const keyword of expansionKeywords) {
            if (titleLower.includes(keyword)) {
                expansionName = keyword;
                break;
            }
        }

        // Extract rarity
        const rarityKeywords = {
            'common': ['common'],
            'uncommon': ['uncommon'],
            'rare': ['rare'],
            'rare holo': ['rare holo', 'holo'],
            'ultra rare': ['ultra rare'],
            'secret rare': ['secret rare'],
            'promo': ['promo', 'promotional'],
            'v': ['v'],
            'vmax': ['vmax'],
            'vstar': ['vstar'],
            'ex': ['ex'],
            'gx': ['gx'],
            'break': ['break'],
            'lv.x': ['lv.x', 'level x'],
            'star': ['star'],
            'prime': ['prime'],
            'legend': ['legend'],
            'ace spec': ['ace spec'],
            'trainer': ['trainer'],
            'supporter': ['supporter'],
            'item': ['item'],
            'stadium': ['stadium'],
            'energy': ['energy']
        };

        for (const [rarityType, keywords] of Object.entries(rarityKeywords)) {
            for (const keyword of keywords) {
                if (titleLower.includes(keyword)) {
                    rarity = rarityType;
                    break;
                }
            }
            if (rarity) break;
        }

        return {
            pokemonName,
            expansionName,
            collectorNumber,
            rarity,
            originalTitle: title,
            cleanTitle: cleanTitle
        };
    }
    
    /**
     * Generate cache key for title
     */
    generateCacheKey(title) {
        return title.toLowerCase().trim().replace(/\s+/g, ' ');
    }
}

// Export class for other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TitleExtractor;
} else {
    // Browser global fallback
    window.TitleExtractor = TitleExtractor;
} 