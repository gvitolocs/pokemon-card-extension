/**
 * CacheManager.js - Gestione cache e stati dell'estensione
 * Gestisce cache per risultati, elementi processati e stati
 */

class CacheManager {
    constructor() {
        // Cache per i risultati delle ricerche
        this.cardCache = new Map();
        
        // Cache per elementi già processati
        this.observerCache = new WeakSet();
        
        // Traccia match riusciti per evitare riprocessamento
        this.successfulMatches = new Set();
        
        // Debounce timer
        this.debounceTimer = null;
        
        // Elementi in fase di processamento
        this.processingElements = new WeakSet();
        
        console.log('📦 CacheManager inizializzato');
    }
    
    /**
     * Pulisce tutte le cache
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
        
        console.log('🧹 [CardTrader] Tutte le cache pulite');
    }
    
    /**
     * Pulisce solo la cache dei risultati
     */
    clearCardCache() {
        this.cardCache.clear();
        console.log('🧹 [CardTrader] Cache risultati pulita');
    }
    
    /**
     * Pulisce solo i match riusciti
     */
    clearSuccessfulMatches() {
        this.successfulMatches.clear();
        console.log('🧹 [CardTrader] Match riusciti puliti');
    }
    
    /**
     * Pulisce gli elementi in processamento
     */
    clearProcessingElements() {
        this.processingElements = new WeakSet();
        console.log('🧹 [CardTrader] Elementi in processamento puliti');
    }
    
    /**
     * Aggiunge un elemento alla cache degli elementi processati
     */
    addToObserverCache(element) {
        this.observerCache.add(element);
    }
    
    /**
     * Verifica se un elemento è nella cache degli observer
     */
    isInObserverCache(element) {
        return this.observerCache.has(element);
    }
    
    /**
     * Aggiunge un elemento agli elementi in processamento
     */
    addToProcessingElements(element) {
        this.processingElements.add(element);
    }
    
    /**
     * Rimuove un elemento dagli elementi in processamento
     */
    removeFromProcessingElements(element) {
        this.processingElements.delete(element);
    }
    
    /**
     * Verifica se un elemento è in fase di processamento
     */
    isInProcessingElements(element) {
        return this.processingElements.has(element);
    }
    
    /**
     * Aggiunge un match riuscito
     */
    addSuccessfulMatch(cacheKey) {
        this.successfulMatches.add(cacheKey);
    }
    
    /**
     * Verifica se un match è già riuscito
     */
    hasSuccessfulMatch(cacheKey) {
        return this.successfulMatches.has(cacheKey);
    }
    
    /**
     * Salva un risultato nella cache
     */
    saveToCardCache(cacheKey, data) {
        this.cardCache.set(cacheKey, data);
        
        // Limita la dimensione della cache (max 100 elementi)
        if (this.cardCache.size > 100) {
            const firstKey = this.cardCache.keys().next().value;
            this.cardCache.delete(firstKey);
        }
    }
    
    /**
     * Recupera un risultato dalla cache
     */
    getFromCardCache(cacheKey) {
        return this.cardCache.get(cacheKey);
    }
    
    /**
     * Verifica se un risultato è in cache
     */
    hasInCardCache(cacheKey) {
        return this.cardCache.has(cacheKey);
    }
    
    /**
     * Imposta il debounce timer
     */
    setDebounceTimer(callback, delay) {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(callback, delay);
    }
    
    /**
     * Cancella il debounce timer
     */
    clearDebounceTimer() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
    
    /**
     * Ottiene statistiche della cache
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
     * Pulisce attributi di processamento dal DOM
     */
    clearProcessingAttributes() {
        const processedElements = document.querySelectorAll('[data-pokemon-linker-processed]');
        processedElements.forEach(element => {
            element.removeAttribute('data-pokemon-linker-processed');
        });
        
        console.log(`🧹 [CardTrader] Rimossi attributi di processamento da ${processedElements.length} elementi`);
    }
}

// Esporta la classe per l'uso in altri moduli
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CacheManager;
} else {
    // Per uso in browser
    window.CacheManager = CacheManager;
} 