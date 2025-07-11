// Supabase integration for Chrome extension
// This uses the official Supabase JavaScript client

class SupabasePokemonDB {
    constructor(supabaseUrl, supabaseKey) {
        // Initialize Supabase client
        this.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        this.cache = new Map(); // Simple cache for performance
    }
    
    async searchPokemon(pokemonName) {
        try {
            // Check cache first
            const cacheKey = `pokemon_${pokemonName.toLowerCase()}`;
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }
            
            console.log(`🔍 Searching Supabase for: ${pokemonName}`);
            
            // Search in all tables that might contain Pokemon data
            const results = await this.searchAllTables(pokemonName);
            
            // Sort results to prioritize cards with images
            if (results && results.length > 0) {
                results.forEach(tableResult => {
                    if (tableResult.results && tableResult.results.length > 0) {
                        tableResult.results.sort((a, b) => {
                            const aHasImage = a.image_url ? 1 : 0;
                            const bHasImage = b.image_url ? 1 : 0;
                            return bHasImage - aHasImage; // Sort by image availability
                        });
                    }
                });
            }
            
            // Cache the results
            this.cache.set(cacheKey, results);
            
            return results;
        } catch (error) {
            console.error('Supabase search error:', error);
            throw error;
        }
    }
    
    async searchAllTables(pokemonName) {
        const pokemonNameLower = pokemonName.toLowerCase();
        let allResults = [];
        
        // Try to search in known table names first
        const knownTables = [
            'cards',
            'card_variants'
        ];
        
        console.log(`🔍 Searching in known tables for: ${pokemonName}`);
        
        // Search in known tables
        for (const tableName of knownTables) {
            try {
                const tableResults = await this.searchTable(tableName, pokemonNameLower);
                if (tableResults.length > 0) {
                    allResults.push({
                        table: tableName,
                        results: tableResults
                    });
                }
            } catch (error) {
                // Table doesn't exist or can't be accessed, skip it
                console.log(`Table ${tableName} not accessible: ${error.message}`);
            }
        }
        
        // If no results found, try a broader search
        if (allResults.length === 0) {
            console.log('No results in known tables, trying broader search...');
            
            // Try to get tables using a different approach
            try {
                const { data: tables, error: tablesError } = await this.supabase
                    .rpc('get_public_tables');
                
                if (!tablesError && tables) {
                    for (const tableName of tables) {
                        try {
                            const tableResults = await this.searchTable(tableName, pokemonNameLower);
                            if (tableResults.length > 0) {
                                allResults.push({
                                    table: tableName,
                                    results: tableResults
                                });
                            }
                        } catch (error) {
                            // Skip tables that can't be searched
                        }
                    }
                }
            } catch (error) {
                console.log('Could not get table list, using fallback search');
            }
        }
        
        return allResults;
    }
    
    async searchTable(tableName, pokemonName) {
        let results = [];
        
        // Try different column name patterns based on actual table structure
        const possibleColumns = [
            'name_en', 'name', 'pokemon_name', 'card_name', 'title',
            'expansion_name_en', 'expansion_code'
        ];
        
        // Search in each possible column
        for (const columnName of possibleColumns) {
            try {
                const { data, error } = await this.supabase
                    .from(tableName)
                    .select('*')
                    .ilike(columnName, `%${pokemonName}%`)
                    .limit(10);
                
                if (!error && data && data.length > 0) {
                    console.log(`✅ Found ${data.length} results in ${tableName}.${columnName}`);
                    results.push(...data);
                }
            } catch (e) {
                // Column doesn't exist, try next one
            }
        }
        
        // If no results found with specific columns, try a broader search
        if (results.length === 0) {
            try {
                // Try to get all data and filter client-side
                const { data, error } = await this.supabase
                    .from(tableName)
                    .select('*')
                    .limit(50); // Limit to avoid performance issues
                
                if (!error && data) {
                    // Filter results that contain the pokemon name
                    const filtered = data.filter(row => {
                        const rowStr = JSON.stringify(row).toLowerCase();
                        return rowStr.includes(pokemonName);
                    });
                    
                    if (filtered.length > 0) {
                        console.log(`✅ Found ${filtered.length} results in ${tableName} (client-side filter)`);
                        results.push(...filtered);
                    }
                }
            } catch (e) {
                console.log(`Could not search table ${tableName}: ${e.message}`);
            }
        }
        
        return results;
    }
    
    async getBlueprintById(blueprintId) {
        try {
            // Search in known tables for the blueprint ID
            const knownTables = [
                'cards',
                'card_variants'
            ];
            
            for (const tableName of knownTables) {
                try {
                    const { data, error } = await this.supabase
                        .from(tableName)
                        .select('*')
                        .or(`id.eq.${blueprintId},blueprint_id.eq.${blueprintId}`)
                        .limit(1);
                    
                    if (!error && data && data.length > 0) {
                        return {
                            table: tableName,
                            data: data[0]
                        };
                    }
                } catch (e) {
                    // Table doesn't exist or can't be accessed, try next one
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error getting blueprint by ID:', error);
            throw error;
        }
    }
    
    // Extract card info from image URL
    extractCardInfoFromImageUrl(imageUrl) {
        if (!imageUrl) return null;
        
        try {
            // Common patterns in CardTrader image URLs
            const patterns = [
                // Pattern: .../cards/[expansion]/[card-name]-[rarity]-[number].jpg
                /\/cards\/([^\/]+)\/([^\/]+)-([^-]+)-(\d+)\.[a-z]+$/i,
                // Pattern: .../cards/[expansion]/[card-name]-[number]-[rarity].jpg
                /\/cards\/([^\/]+)\/([^\/]+)-(\d+)-([^-]+)\.[a-z]+$/i,
                // Pattern: .../cards/[expansion]/[card-name]-[rarity].jpg
                /\/cards\/([^\/]+)\/([^\/]+)-([^-]+)\.[a-z]+$/i,
                // Pattern: .../cards/[expansion]/[card-name]-[number].jpg
                /\/cards\/([^\/]+)\/([^\/]+)-(\d+)\.[a-z]+$/i
            ];
            
            for (const pattern of patterns) {
                const match = imageUrl.match(pattern);
                if (match) {
                    const [, expansion, cardName, ...rest] = match;
                    
                    // Determine which parts are rarity vs number
                    let rarity = null;
                    let collectorNumber = null;
                    
                    if (rest.length === 2) {
                        // Check if first part is number or rarity
                        if (/^\d+$/.test(rest[0])) {
                            collectorNumber = rest[0];
                            rarity = rest[1];
                        } else {
                            rarity = rest[0];
                            collectorNumber = rest[1];
                        }
                    } else if (rest.length === 1) {
                        // Single part - could be either
                        if (/^\d+$/.test(rest[0])) {
                            collectorNumber = rest[0];
                        } else {
                            rarity = rest[0];
                        }
                    }
                    
                    return {
                        expansion: expansion.replace(/-/g, ' '),
                        cardName: cardName.replace(/-/g, ' '),
                        rarity: rarity,
                        collectorNumber: collectorNumber,
                        imageUrl: imageUrl
                    };
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error extracting card info from URL:', error);
            return null;
        }
    }
    
    // Generate CardTrader link from database data
    generateCardTraderLink(pokemonData) {
        if (!pokemonData) return null;
        
        // Extract relevant data
        const name = pokemonData.name_en || pokemonData.name || pokemonData.pokemon_name || pokemonData.card_name;
        const blueprintId = pokemonData.blueprint_id || pokemonData.id;
        
        // ALWAYS use blueprint ID format: https://www.cardtrader.com/cards/[blueprint-id]
        if (blueprintId) {
            return `https://www.cardtrader.com/cards/${blueprintId}`;
        }
        
        // Fallback only if no blueprint ID is available
        if (name) {
            const cleanName = name.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
            return `https://www.cardtrader.com/cards/${cleanName}`;
        }
        
        return null;
    }
    
    // Search for card variants
    async searchCardVariants(pokemonName) {
        try {
            const pokemonNameLower = pokemonName.toLowerCase();
            let results = [];
            
            // First, search in the cards table to get blueprint_ids
            const { data: cards, error: cardsError } = await this.supabase
                .from('cards')
                .select('blueprint_id, name_en, expansion_name_en, expansion_code')
                .ilike('name_en', `%${pokemonNameLower}%`)
                .limit(20);
            
            if (cardsError) {
                console.log('Error searching cards table:', cardsError.message);
                return results;
            }
            
            if (cards && cards.length > 0) {
                // Get blueprint_ids from found cards
                const blueprintIds = cards.map(card => card.blueprint_id).filter(id => id);
                
                if (blueprintIds.length > 0) {
                    // Search for variants of these cards
                    const { data: variants, error: variantsError } = await this.supabase
                        .from('card_variants')
                        .select('*')
                        .in('blueprint_id', blueprintIds);
                    
                    if (!variantsError && variants && variants.length > 0) {
                        // Combine card data with variant data
                        const combinedResults = variants.map(variant => {
                            const card = cards.find(c => c.blueprint_id === variant.blueprint_id);
                            return {
                                ...variant,
                                card_name: card?.name_en,
                                pokemon_name: card?.name_en,
                                expansion_name: card?.expansion_name_en,
                                expansion_code: card?.expansion_code,
                                source_table: 'card_variants'
                            };
                        });
                        
                        results.push(...combinedResults);
                        console.log(`✅ Found ${combinedResults.length} variants for ${pokemonName}`);
                    }
                }
            }
            
            return results;
        } catch (error) {
            console.error('Error searching card variants:', error);
            return [];
        }
    }
    
    // Enhanced search that includes variants
    async searchPokemonWithVariants(pokemonName) {
        try {
            // Search in regular tables
            const regularResults = await this.searchPokemon(pokemonName);
            
            // Search for variants
            const variantResults = await this.searchCardVariants(pokemonName);
            
            // Combine results
            if (variantResults.length > 0) {
                regularResults.push({
                    table: 'card_variants',
                    results: variantResults
                });
            }
            
            return regularResults;
        } catch (error) {
            console.error('Error in enhanced search:', error);
            return await this.searchPokemon(pokemonName);
        }
    }
    
    // Clear cache
    clearCache() {
        this.cache.clear();
    }
}

// Export for use in Chrome extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabasePokemonDB;
} else {
    window.SupabasePokemonDB = SupabasePokemonDB;
} 