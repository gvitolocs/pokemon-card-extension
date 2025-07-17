/**
 * UrlGenerator.js - Generazione link CardTrader
 * Gestisce la generazione dei link per CardTrader e altri servizi
 */

class UrlGenerator {
    constructor() {
        console.log('🔗 UrlGenerator inizializzato');
    }
    
    /**
     * Genera un link CardTrader per un blueprint ID
     */
    generateCardTraderLink(blueprintId) {
        if (!blueprintId) {
            console.warn('⚠️ [CardTrader] Blueprint ID mancante per generare link');
            return null;
        }
        
        const url = `https://www.cardtrader.com/blueprints/${blueprintId}`;
        console.log(`🔗 [CardTrader] Link generato: ${url}`);
        return url;
    }
    
    /**
     * Genera un link Cardmarket per un risultato
     */
    generateCardmarketLink(result, titleInfo, originalTitle) {
        if (!result || !result.pokemon_name) {
            console.warn('⚠️ [CardTrader] Dati insufficienti per generare link Cardmarket');
            return null;
        }
        
        // Costruisci il link Cardmarket
        const pokemonName = result.pokemon_name.toLowerCase().replace(/\s+/g, '-');
        const expansionName = result.expansion_name_en ? 
            result.expansion_name_en.toLowerCase().replace(/\s+/g, '-') : '';
        
        let url = `https://www.cardmarket.com/en/Pokemon/Products/Singles/${expansionName}/${pokemonName}`;
        
        // Aggiungi numero collezionista se disponibile
        if (result.collector_number) {
            url += `-${result.collector_number}`;
        }
        
        console.log(`🔗 [CardTrader] Link Cardmarket generato: ${url}`);
        return url;
    }
    
    /**
     * Genera un link di ricerca generico per CardTrader
     */
    generateSearchLink(searchTerm) {
        if (!searchTerm) {
            console.warn('⚠️ [CardTrader] Termine di ricerca mancante');
            return null;
        }
        
        const encodedTerm = encodeURIComponent(searchTerm);
        const url = `https://www.cardtrader.com/cards?search=${encodedTerm}`;
        
        console.log(`🔗 [CardTrader] Link di ricerca generato: ${url}`);
        return url;
    }
    
    /**
     * Genera un link per una carta specifica su CardTrader
     */
    generateSpecificCardLink(pokemonName, expansionName, collectorNumber) {
        if (!pokemonName) {
            console.warn('⚠️ [CardTrader] Nome Pokemon mancante per link specifico');
            return null;
        }
        
        // Costruisci il termine di ricerca
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
     * Verifica se un URL è valido
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
     * Apre un link in una nuova tab
     */
    openLink(url) {
        if (!this.isValidUrl(url)) {
            console.error('❌ [CardTrader] URL non valido:', url);
            return false;
        }
        
        try {
            window.open(url, '_blank');
            console.log(`✅ [CardTrader] Link aperto: ${url}`);
            return true;
        } catch (error) {
            console.error('❌ [CardTrader] Errore nell\'apertura del link:', error);
            return false;
        }
    }
    
    /**
     * Genera un link di fallback per CardTrader
     */
    generateFallbackLink(titleInfo) {
        if (!titleInfo || !titleInfo.pokemonName) {
            return 'https://www.cardtrader.com/cards';
        }
        
        const searchTerm = `${titleInfo.pokemonName} ${titleInfo.expansionName || ''} ${titleInfo.collectorNumber || ''}`.trim();
        return this.generateSearchLink(searchTerm);
    }
}

// Esporta la classe per l'uso in altri moduli
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UrlGenerator;
} else {
    // Per uso in browser
    window.UrlGenerator = UrlGenerator;
} 