/**
 * UrlGenerator.js - Pokoin marketplace URL helpers.
 *
 * Some method names still mention CardTrader because older processors call them.
 * The generated card destinations are Pokoin URLs.
 */

class UrlGenerator {
    constructor() {
        console.log('🔗 UrlGenerator initialized');
    }
    
    /**
     * Generate Pokoin marketplace URL for a CardTrader/Pokoin blueprint ID.
     */
    generateCardTraderLink(blueprintId) {
        if (!blueprintId) {
            console.warn('⚠️ [Pokoin] Missing blueprint ID, cannot generate link');
            return null;
        }
        
        const url = `https://pokoin.com/marketplace/en/cards/${encodeURIComponent(blueprintId)}`;
        console.log(`🔗 [Pokoin] Generated marketplace link: ${url}`);
        return url;
    }
    
    /**
     * Generate Cardmarket URL for a result
     */
    generateCardmarketLink(result, titleInfo, originalTitle) {
        if (!result || !result.pokemon_name) {
            console.warn('⚠️ [CardTrader] Insufficient data to generate Cardmarket link');
            return null;
        }
        
        // Build Cardmarket URL
        const pokemonName = result.pokemon_name.toLowerCase().replace(/\s+/g, '-');
        const expansionName = result.expansion_name_en ? 
            result.expansion_name_en.toLowerCase().replace(/\s+/g, '-') : '';
        
        let url = `https://www.cardmarket.com/en/Pokemon/Products/Singles/${expansionName}/${pokemonName}`;
        
        // Add collector number if available
        if (result.collector_number) {
            url += `-${result.collector_number}`;
        }
        
        console.log(`🔗 [CardTrader] Generated Cardmarket link: ${url}`);
        return url;
    }
    
    /**
     * Generate generic Pokoin marketplace search URL.
     */
    generateSearchLink(searchTerm) {
        if (!searchTerm) {
            console.warn('⚠️ [Pokoin] Missing search term');
            return null;
        }
        
        const encodedTerm = encodeURIComponent(searchTerm);
        const url = `https://pokoin.com/marketplace/en?search=${encodedTerm}`;
        
        console.log(`🔗 [Pokoin] Generated marketplace search link: ${url}`);
        return url;
    }
    
    /**
     * Generate URL for a specific card search on Pokoin.
     */
    generateSpecificCardLink(pokemonName, expansionName, collectorNumber) {
        if (!pokemonName) {
            console.warn('⚠️ [CardTrader] Missing Pokemon name for specific link');
            return null;
        }
        
        // Build search term
        let searchTerm = pokemonName;
        
        if (expansionName) {
            searchTerm += ` ${expansionName}`;
        }
        
        if (collectorNumber) {
            searchTerm += ` ${collectorNumber}`;
        }
        
        return this.generateSearchLink(searchTerm);
    }
    
    /**
     * Validate URL
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Open URL in new tab
     */
    openLink(url) {
        if (!this.isValidUrl(url)) {
            console.error('❌ [CardTrader] Invalid URL:', url);
            return false;
        }
        
        try {
            window.open(url, '_blank');
            console.log(`✅ [CardTrader] Opened link: ${url}`);
            return true;
        } catch (error) {
            console.error('❌ [CardTrader] Error opening link:', error);
            return false;
        }
    }
    
    /**
     * Generate fallback Pokoin URL.
     */
    generateFallbackLink(titleInfo) {
        if (!titleInfo || !titleInfo.pokemonName) {
            return 'https://pokoin.com/marketplace/en';
        }
        
        const searchTerm = `${titleInfo.pokemonName} ${titleInfo.expansionName || ''} ${titleInfo.collectorNumber || ''}`.trim();
        return this.generateSearchLink(searchTerm);
    }
}

// Export class for other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UrlGenerator;
} else {
    // Browser global fallback
    window.UrlGenerator = UrlGenerator;
} 