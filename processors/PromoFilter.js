/**
 * PromoFilter.js - Gestione filtri per carte promo
 * Contiene tutta la logica per identificare e filtrare carte promo
 */

class PromoFilter {
    constructor() {
        // Parole chiave per identificare carte promo
        this.promoKeywords = [
            'promo', 'promotional', 'promozionale', 'promozione',
            'event', 'evento', 'convention', 'convenzione',
            'pre-release', 'prerelease', 'preview', 'anteprima',
            'stamp', 'stampa', 'limited', 'limitata',
            'exclusive', 'esclusiva', 'special', 'speciale',
            'collector', 'collezionista', 'anniversary', 'anniversario',
            'celebration', 'celebrazione', 'holiday', 'festività',
            'christmas', 'natale', 'halloween', 'pasqua',
            'easter', 'valentine', 'san valentino', 'birthday',
            'compleanno', 'tournament', 'torneo', 'championship',
            'campionato', 'league', 'lega', 'gym', 'palestra',
            'challenge', 'sfida', 'battle', 'battaglia',
            'season', 'stagione', 'series', 'serie',
            'edition', 'edizione', 'version', 'versione',
            'variant', 'variante', 'alternate', 'alternativa',
            'secret', 'segreto', 'hidden', 'nascosto',
            'rare', 'rara', 'ultra rare', 'ultra rara',
            'shiny', 'lucido', 'holo', 'olografica',
            'reverse holo', 'reverse olografica', 'full art', 'arte completa',
            'rainbow', 'arcobaleno', 'gold', 'oro', 'silver', 'argento'
        ];

        // Pattern per numeri promo
        this.promoNumberPatterns = [
            /promo/i,
            /p\d+/i,
            /promo\d+/i,
            /s\d+/i,
            /sw\d+/i,
            /sm\d+/i,
            /dp\d+/i,
            /ex\d+/i,
            /g\d+/i,
            /e\d+/i,
            /neo\d+/i,
            /gym\d+/i,
            /team rocket\d+/i,
            /fossil\d+/i,
            /jungle\d+/i,
            /base set\d+/i
        ];

        // Espansioni che contengono principalmente carte promo
        this.promoExpansions = [
            'promo', 'promotional', 'promozionale',
            'black star promo', 'promo black star',
            'event promo', 'promo evento',
            'convention promo', 'promo convenzione',
            'pre-release promo', 'promo pre-release',
            'stamp promo', 'promo stampa',
            'collector promo', 'promo collezionista',
            'anniversary promo', 'promo anniversario',
            'celebration promo', 'promo celebrazione',
            'holiday promo', 'promo festività',
            'christmas promo', 'promo natale',
            'halloween promo', 'promo halloween',
            'easter promo', 'promo pasqua',
            'valentine promo', 'promo san valentino',
            'birthday promo', 'promo compleanno',
            'tournament promo', 'promo torneo',
            'championship promo', 'promo campionato',
            'league promo', 'promo lega',
            'gym promo', 'promo palestra',
            'challenge promo', 'promo sfida',
            'battle promo', 'promo battaglia',
            'season promo', 'promo stagione',
            'series promo', 'promo serie'
        ];
    }

    /**
     * Controlla se una carta è una promo basandosi sul titolo
     * @param {string} title - Il titolo della carta
     * @returns {boolean} - True se è una promo
     */
    isPromoByTitle(title) {
        if (!title) return false;
        
        const titleLower = title.toLowerCase();
        
        // Controlla parole chiave promo
        for (const keyword of this.promoKeywords) {
            if (titleLower.includes(keyword.toLowerCase())) {
                console.log(`🎯 [PromoFilter] Carta promo rilevata per keyword: "${keyword}"`);
                return true;
            }
        }
        
        // Controlla pattern numeri promo
        for (const pattern of this.promoNumberPatterns) {
            if (pattern.test(title)) {
                console.log(`🎯 [PromoFilter] Carta promo rilevata per pattern: "${pattern}"`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Controlla se una carta è una promo basandosi sull'espansione
     * @param {string} expansion - Il nome dell'espansione
     * @returns {boolean} - True se è una promo
     */
    isPromoByExpansion(expansion) {
        if (!expansion) return false;
        
        const expansionLower = expansion.toLowerCase();
        
        for (const promoExpansion of this.promoExpansions) {
            if (expansionLower.includes(promoExpansion.toLowerCase())) {
                console.log(`🎯 [PromoFilter] Carta promo rilevata per espansione: "${promoExpansion}"`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Controlla se una carta è una promo basandosi sul numero collezionista
     * @param {string} collectorNumber - Il numero collezionista
     * @returns {boolean} - True se è una promo
     */
    isPromoByCollectorNumber(collectorNumber) {
        if (!collectorNumber) return false;
        
        const numberStr = collectorNumber.toString().toLowerCase();
        
        // Pattern comuni per numeri promo
        const promoPatterns = [
            /^promo\d+$/i,
            /^p\d+$/i,
            /^s\d+$/i,
            /^sw\d+$/i,
            /^sm\d+$/i,
            /^dp\d+$/i,
            /^ex\d+$/i,
            /^g\d+$/i,
            /^e\d+$/i,
            /^neo\d+$/i,
            /^gym\d+$/i,
            /^team rocket\d+$/i,
            /^fossil\d+$/i,
            /^jungle\d+$/i,
            /^base set\d+$/i
        ];
        
        for (const pattern of promoPatterns) {
            if (pattern.test(numberStr)) {
                console.log(`🎯 [PromoFilter] Carta promo rilevata per numero collezionista: "${collectorNumber}"`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Controlla se una carta è una promo basandosi su tutti i criteri
     * @param {Object} cardInfo - Informazioni sulla carta
     * @returns {boolean} - True se è una promo
     */
    isPromoCard(cardInfo) {
        if (!cardInfo) return false;
        
        // Controlla per titolo
        if (cardInfo.name_en && this.isPromoByTitle(cardInfo.name_en)) {
            return true;
        }
        
        if (cardInfo.pokemon_name && this.isPromoByTitle(cardInfo.pokemon_name)) {
            return true;
        }
        
        // Controlla per espansione
        if (cardInfo.expansion_name_en && this.isPromoByExpansion(cardInfo.expansion_name_en)) {
            return true;
        }
        
        // Controlla per numero collezionista
        if (cardInfo.collector_number && this.isPromoByCollectorNumber(cardInfo.collector_number)) {
            return true;
        }
        
        return false;
    }

    /**
     * Filtra i risultati rimuovendo le carte promo se non richieste
     * @param {Array} results - Array di risultati
     * @param {Object} titleInfo - Informazioni dal titolo
     * @returns {Array} - Risultati filtrati
     */
    filterPromoResults(results, titleInfo) {
        if (!results || !Array.isArray(results)) return results;
        
        // Se il titolo richiede esplicitamente una promo, mantieni solo le promo
        const wantsPromo = this.isPromoByTitle(titleInfo.originalTitle || '');
        
        if (wantsPromo) {
            console.log(`🎯 [PromoFilter] Richiesta promo rilevata, filtrando solo carte promo`);
            return results.filter(card => this.isPromoCard(card));
        }
        
        // Se il titolo NON richiede promo, rimuovi le promo
        const filteredResults = results.filter(card => !this.isPromoCard(card));
        
        if (filteredResults.length !== results.length) {
            console.log(`🎯 [PromoFilter] Rimosse ${results.length - filteredResults.length} carte promo non richieste`);
        }
        
        return filteredResults;
    }

    /**
     * Aggiusta il punteggio per le carte promo
     * @param {Object} card - Carta da valutare
     * @param {Object} titleInfo - Informazioni dal titolo
     * @param {number} baseScore - Punteggio base
     * @returns {number} - Punteggio aggiustato
     */
    adjustScoreForPromo(card, titleInfo, baseScore) {
        const isPromo = this.isPromoCard(card);
        const wantsPromo = this.isPromoByTitle(titleInfo.originalTitle || '');
        
        if (isPromo && wantsPromo) {
            // Bonus per promo quando richiesta
            console.log(`🎯 [PromoFilter] Bonus punteggio per promo richiesta: +1000`);
            return baseScore + 1000;
        } else if (isPromo && !wantsPromo) {
            // Penalità per promo quando non richiesta
            console.log(`🎯 [PromoFilter] Penalità punteggio per promo non richiesta: -2000`);
            return baseScore - 2000;
        }
        
        return baseScore;
    }

    /**
     * Controlla se il titolo richiede una carta promo
     * @param {string} title - Il titolo da analizzare
     * @returns {boolean} - True se richiede una promo
     */
    titleRequestsPromo(title) {
        if (!title) return false;
        
        const promoRequestKeywords = [
            'promo', 'promotional', 'promozionale', 'promozione',
            'event', 'evento', 'convention', 'convenzione',
            'pre-release', 'prerelease', 'preview', 'anteprima',
            'stamp', 'stampa', 'limited', 'limitata',
            'exclusive', 'esclusiva', 'special', 'speciale',
            'collector', 'collezionista', 'anniversary', 'anniversario',
            'celebration', 'celebrazione', 'holiday', 'festività',
            'christmas', 'natale', 'halloween', 'pasqua',
            'easter', 'valentine', 'san valentino', 'birthday',
            'compleanno', 'tournament', 'torneo', 'championship',
            'campionato', 'league', 'lega', 'gym', 'palestra',
            'challenge', 'sfida', 'battle', 'battaglia'
        ];
        
        const titleLower = title.toLowerCase();
        
        for (const keyword of promoRequestKeywords) {
            if (titleLower.includes(keyword.toLowerCase())) {
                console.log(`🎯 [PromoFilter] Richiesta promo rilevata nel titolo: "${keyword}"`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Ottieni informazioni dettagliate su una carta promo
     * @param {Object} card - Carta da analizzare
     * @returns {Object} - Informazioni dettagliate
     */
    getPromoDetails(card) {
        const details = {
            isPromo: false,
            promoType: null,
            promoReason: null,
            promoKeywords: []
        };
        
        if (!this.isPromoCard(card)) {
            return details;
        }
        
        details.isPromo = true;
        
        // Analizza il titolo
        if (card.name_en) {
            const titleLower = card.name_en.toLowerCase();
            for (const keyword of this.promoKeywords) {
                if (titleLower.includes(keyword.toLowerCase())) {
                    details.promoKeywords.push(keyword);
                    details.promoType = 'title';
                    details.promoReason = `Contiene keyword: "${keyword}"`;
                }
            }
        }
        
        // Analizza l'espansione
        if (card.expansion_name_en) {
            const expansionLower = card.expansion_name_en.toLowerCase();
            for (const promoExpansion of this.promoExpansions) {
                if (expansionLower.includes(promoExpansion.toLowerCase())) {
                    details.promoType = 'expansion';
                    details.promoReason = `Espansione promo: "${promoExpansion}"`;
                    break;
                }
            }
        }
        
        // Analizza il numero collezionista
        if (card.collector_number) {
            const numberStr = card.collector_number.toString().toLowerCase();
            for (const pattern of this.promoNumberPatterns) {
                if (pattern.test(numberStr)) {
                    details.promoType = 'collector_number';
                    details.promoReason = `Numero collezionista promo: "${card.collector_number}"`;
                    break;
                }
            }
        }
        
        return details;
    }
}

// Esporta la classe per l'uso in altri file
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PromoFilter;
} else {
    // Per uso in browser
    window.PromoFilter = PromoFilter;
}

console.log('✅ [PromoFilter] Modulo PromoFilter caricato correttamente'); 