/**
 * CacheManager.js - Extension cache/state manager
 * Handles lookup cache, processed elements, and runtime state.
 */

class CacheManager {
    constructor() {
        // Cache for search results
        this.cardCache = new Map();
        
        // Cache for already-processed elements
        this.observerCache = new WeakSet();
        
        // Track successful matches to avoid reprocessing
        this.successfulMatches = new Set();
        
        // Debounce timer
        this.debounceTimer = null;
        
        // Elements currently being processed
        this.processingElements = new WeakSet();
        
        console.log('📦 CacheManager initialized');
    }
    
    /**
     * Clear all caches
     */
    clearAllCaches() {
        this.cardCache.clear();
        this.observerCache = new WeakSet();
        this.successfulMatches.clear();
        this.processingElements = new WeakSet();
        
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        console.log('🧹 [CardTrader] All caches cleared');
    }
    
    /**
     * Clear only result cache
     */
    clearCardCache() {
        this.cardCache.clear();
        console.log('🧹 [CardTrader] Result cache cleared');
    }
    
    /**
     * Clear only successful matches
     */
    clearSuccessfulMatches() {
        this.successfulMatches.clear();
        console.log('🧹 [CardTrader] Successful matches cleared');
    }
    
    /**
     * Clear processing elements
     */
    clearProcessingElements() {
        this.processingElements = new WeakSet();
        console.log('🧹 [CardTrader] Processing elements cleared');
    }
    
    /**
     * Add element to processed cache
     */
    addToObserverCache(element) {
        this.observerCache.add(element);
    }
    
    /**
     * Check if element is in observer cache
     */
    isInObserverCache(element) {
        return this.observerCache.has(element);
    }
    
    /**
     * Add element to processing set
     */
    addToProcessingElements(element) {
        this.processingElements.add(element);
    }
    
    /**
     * Remove element from processing set
     */
    removeFromProcessingElements(element) {
        this.processingElements.delete(element);
    }
    
    /**
     * Check if element is being processed
     */
    isInProcessingElements(element) {
        return this.processingElements.has(element);
    }
    
    /**
     * Add successful match key
     */
    addSuccessfulMatch(cacheKey) {
        this.successfulMatches.add(cacheKey);
    }
    
    /**
     * Check if match already succeeded
     */
    hasSuccessfulMatch(cacheKey) {
        return this.successfulMatches.has(cacheKey);
    }
    
    /**
     * Save a result in cache
     */
    saveToCardCache(cacheKey, data) {
        this.cardCache.set(cacheKey, data);
        
        // Limit cache size (max 100 entries)
        if (this.cardCache.size > 100) {
            const firstKey = this.cardCache.keys().next().value;
            this.cardCache.delete(firstKey);
        }
    }
    
    /**
     * Get cached result
     */
    getFromCardCache(cacheKey) {
        return this.cardCache.get(cacheKey);
    }
    
    /**
     * Check if result exists in cache
     */
    hasInCardCache(cacheKey) {
        return this.cardCache.has(cacheKey);
    }
    
    /**
     * Set debounce timer
     */
    setDebounceTimer(callback, delay) {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(callback, delay);
    }
    
    /**
     * Clear debounce timer
     */
    clearDebounceTimer() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
    
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            cardCacheSize: this.cardCache.size,
            successfulMatchesSize: this.successfulMatches.size,
            processingElementsSize: this.processingElements.size,
            hasDebounceTimer: this.debounceTimer !== null
        };
    }
    
    /**
     * Clear processing attributes from DOM
     */
    clearProcessingAttributes() {
        const processedElements = document.querySelectorAll('[data-pokemon-linker-processed]');
        processedElements.forEach(element => {
            element.removeAttribute('data-pokemon-linker-processed');
        });
        
        console.log(`🧹 [CardTrader] Removed processing attributes from ${processedElements.length} elements`);
    }
}

// Export class for other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CacheManager;
} else {
    // Browser global fallback
    window.CacheManager = CacheManager;
} 