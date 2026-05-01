/**
 * PromoFilter.js - Promo card filter logic
 * Contains all logic used to detect and filter promo cards.
 */

class PromoFilter {
    constructor() {
        // Keywords used to identify promo cards
        this.promoKeywords = [
            'promo', 'promotional',
            'event', 'convention',
            'pre-release', 'prerelease', 'preview',
            'stamp', 'limited',
            'exclusive', 'special',
            'collector', 'anniversary',
            'celebration', 'holiday',
            'christmas', 'halloween', 'easter', 'valentine', 'birthday',
            'tournament', 'championship', 'league', 'gym',
            'challenge', 'battle',
            'season', 'series',
            'edition', 'version',
            'variant', 'alternate',
            'secret', 'hidden',
            'rare', 'ultra rare',
            'shiny', 'holo', 'reverse holo', 'full art',
            'rainbow', 'gold', 'silver'
        ];

        // Patterns for promo numbers
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

        // Expansions that mostly contain promo cards
        this.promoExpansions = [
            'promo', 'promotional',
            'black star promo', 'promo black star',
            'event promo',
            'convention promo',
            'pre-release promo',
            'stamp promo',
            'collector promo',
            'anniversary promo',
            'celebration promo',
            'holiday promo',
            'christmas promo',
            'halloween promo',
            'easter promo',
            'valentine promo',
            'birthday promo',
            'tournament promo',
            'championship promo',
            'league promo',
            'gym promo',
            'challenge promo',
            'battle promo',
            'season promo',
            'series promo'
        ];
    }

    /**
     * Check whether a card is promo based on title
     * @param {string} title - Card title
     * @returns {boolean} - True if promo
     */
    isPromoByTitle(title) {
        if (!title) return false;
        
        const titleLower = title.toLowerCase();
        
        // Check promo keywords
        for (const keyword of this.promoKeywords) {
            if (titleLower.includes(keyword.toLowerCase())) {
                console.log(`🎯 [PromoFilter] Promo card detected by keyword: "${keyword}"`);
                return true;
            }
        }
        
        // Check promo number patterns
        for (const pattern of this.promoNumberPatterns) {
            if (pattern.test(title)) {
                console.log(`🎯 [PromoFilter] Promo card detected by pattern: "${pattern}"`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Check whether a card is promo based on expansion
     * @param {string} expansion - Expansion name
     * @returns {boolean} - True if promo
     */
    isPromoByExpansion(expansion) {
        if (!expansion) return false;
        
        const expansionLower = expansion.toLowerCase();
        
        for (const promoExpansion of this.promoExpansions) {
            if (expansionLower.includes(promoExpansion.toLowerCase())) {
                console.log(`🎯 [PromoFilter] Promo card detected by expansion: "${promoExpansion}"`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Check whether a card is promo based on collector number
     * @param {string} collectorNumber - Collector number
     * @returns {boolean} - True if promo
     */
    isPromoByCollectorNumber(collectorNumber) {
        if (!collectorNumber) return false;
        
        const numberStr = collectorNumber.toString().toLowerCase();
        
        // Common patterns for promo numbers
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
                console.log(`🎯 [PromoFilter] Promo card detected by collector number: "${collectorNumber}"`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Check whether a card is promo using all criteria
     * @param {Object} cardInfo - Card metadata
     * @returns {boolean} - True if promo
     */
    isPromoCard(cardInfo) {
        if (!cardInfo) return false;
        
        // Check by title
        if (cardInfo.name_en && this.isPromoByTitle(cardInfo.name_en)) {
            return true;
        }
        
        if (cardInfo.pokemon_name && this.isPromoByTitle(cardInfo.pokemon_name)) {
            return true;
        }
        
        // Check by expansion
        if (cardInfo.expansion_name_en && this.isPromoByExpansion(cardInfo.expansion_name_en)) {
            return true;
        }
        
        // Check by collector number
        if (cardInfo.collector_number && this.isPromoByCollectorNumber(cardInfo.collector_number)) {
            return true;
        }
        
        return false;
    }

    /**
     * Filter results by promo requirement
     * @param {Array} results - Result array
     * @param {Object} titleInfo - Extracted title info
     * @returns {Array} - Filtered results
     */
    filterPromoResults(results, titleInfo) {
        if (!results || !Array.isArray(results)) return results;
        
        // If title explicitly requests promo, keep only promo cards
        const wantsPromo = this.isPromoByTitle(titleInfo.originalTitle || '');
        
        if (wantsPromo) {
            console.log(`🎯 [PromoFilter] Promo request detected, filtering to promo cards only`);
            return results.filter(card => this.isPromoCard(card));
        }
        
        // If title does not request promo, remove promo cards
        const filteredResults = results.filter(card => !this.isPromoCard(card));
        
        if (filteredResults.length !== results.length) {
            console.log(`🎯 [PromoFilter] Removed ${results.length - filteredResults.length} non-requested promo cards`);
        }
        
        return filteredResults;
    }

    /**
     * Adjust score based on promo logic
     * @param {Object} card - Card to evaluate
     * @param {Object} titleInfo - Extracted title info
     * @param {number} baseScore - Base score
     * @returns {number} - Adjusted score
     */
    adjustScoreForPromo(card, titleInfo, baseScore) {
        const isPromo = this.isPromoCard(card);
        const wantsPromo = this.isPromoByTitle(titleInfo.originalTitle || '');
        
        if (isPromo && wantsPromo) {
            // Bonus for requested promo
            console.log(`🎯 [PromoFilter] Score bonus for requested promo: +1000`);
            return baseScore + 1000;
        } else if (isPromo && !wantsPromo) {
            // Penalty for non-requested promo
            console.log(`🎯 [PromoFilter] Score penalty for non-requested promo: -2000`);
            return baseScore - 2000;
        }
        
        return baseScore;
    }

    /**
     * Check whether title requests a promo card
     * @param {string} title - Title to inspect
     * @returns {boolean} - True if promo requested
     */
    titleRequestsPromo(title) {
        if (!title) return false;
        
        const promoRequestKeywords = [
            'promo', 'promotional',
            'event', 'convention',
            'pre-release', 'prerelease', 'preview',
            'stamp', 'limited',
            'exclusive', 'special',
            'collector', 'anniversary',
            'celebration', 'holiday',
            'christmas', 'halloween', 'easter', 'valentine', 'birthday',
            'tournament', 'championship', 'league', 'gym',
            'challenge', 'battle'
        ];
        
        const titleLower = title.toLowerCase();
        
        for (const keyword of promoRequestKeywords) {
            if (titleLower.includes(keyword.toLowerCase())) {
                console.log(`🎯 [PromoFilter] Promo request detected in title: "${keyword}"`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Get detailed promo information for a card
     * @param {Object} card - Card to inspect
     * @returns {Object} - Detailed metadata
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
        
        // Analyze title
        if (card.name_en) {
            const titleLower = card.name_en.toLowerCase();
            for (const keyword of this.promoKeywords) {
                if (titleLower.includes(keyword.toLowerCase())) {
                    details.promoKeywords.push(keyword);
                    details.promoType = 'title';
                    details.promoReason = `Contains keyword: "${keyword}"`;
                }
            }
        }
        
        // Analyze expansion
        if (card.expansion_name_en) {
            const expansionLower = card.expansion_name_en.toLowerCase();
            for (const promoExpansion of this.promoExpansions) {
                if (expansionLower.includes(promoExpansion.toLowerCase())) {
                    details.promoType = 'expansion';
                    details.promoReason = `Promo expansion: "${promoExpansion}"`;
                    break;
                }
            }
        }
        
        // Analyze collector number
        if (card.collector_number) {
            const numberStr = card.collector_number.toString().toLowerCase();
            for (const pattern of this.promoNumberPatterns) {
                if (pattern.test(numberStr)) {
                    details.promoType = 'collector_number';
                    details.promoReason = `Promo collector number: "${card.collector_number}"`;
                    break;
                }
            }
        }
        
        return details;
    }
}

// Export class for other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PromoFilter;
} else {
    // Browser global fallback
    window.PromoFilter = PromoFilter;
}

console.log('✅ [PromoFilter] PromoFilter module loaded successfully');