// Configurazione Standalone per Pokemon Card Trader Linker
// Questo file contiene tutte le configurazioni necessarie per l'estensione

const STANDALONE_CONFIG = {
    // Configurazione Supabase
    supabase: {
        url: 'https://msngrrrihwudtnyjatlo.supabase.co',
        key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbmdycnJpaHd1ZHRueWphdGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNTU2NTIsImV4cCI6MjA2NTkzMTY1Mn0.Y0D-FHepxqXznrg2W0n_NOJkgY--GOPJD4EoloK94Yo',
        // Fallback: se Supabase non è disponibile, usa un database locale o API alternative
        fallbackEnabled: true,
        localDataEnabled: true
    },
    
    // Configurazione CardTrader API
    cardtrader: {
        baseUrl: 'https://www.cardtrader.com',
        apiUrl: 'https://api.cardtrader.com',
        // Fallback per quando l'API non è disponibile
        fallbackEnabled: true
    },
    
    // Configurazione matching
    matching: {
        // Punteggi per diversi tipi di match
        scores: {
            pokemonExact: 10000,
            pokemonPartial: 500,
            collectorNumberExact: 50000,
            collectorNumberPartial: 30000,
            expansionExact: 40000,
            expansionPartial: 25000,
            vStarUniverse: 50000, // Bonus speciale per V Star Universe
            trainerMatch: 100000,
            vmaxMatch: 8000,
            vstarMatch: 7000,
            vMatch: 6000,
            genericWord: 3000,
            genericWordWithExpansion: 2000,
            genericWordWithoutExpansion: 1000,
            expansionMismatch: -30000 // Penalizzazione
        },
        
        // Parole chiave per diversi tipi di carte
        keywords: {
            important: ['vmax', 'vstar', 'sl', 'tg'],
            medium: ['ex', 'gx', 'v', 'shiny', 'promo'],
            expansion: ['star', 'universe', 'frontier', 'dragon', 'delta', 'species'],
            generic: ['holo', 'rare'],
            excluded: ['pokemon', 'card', 'game', 'tcg', 'carta', 'pokémon']
        },
        
        // Espansioni speciali che richiedono match esatti
        exactExpansions: [
            'v star universe',
            'vstar universe',
            'dragon frontiers',
            'dragon frontier',
            'delta species',
            'v star universe'
        ]
    },
    
    // Configurazione UI
    ui: {
        popupPosition: 'bottom-right',
        maxResults: 5,
        showDebugInfo: true,
        autoSearch: true
    },
    
    // Configurazione debug
    debug: {
        enabled: true,
        logLevel: 'info', // 'debug', 'info', 'warn', 'error'
        showConsoleLogs: true
    }
};

// Funzione per ottenere la configurazione
function getConfig() {
    return STANDALONE_CONFIG;
}

// Funzione per aggiornare la configurazione
function updateConfig(newConfig) {
    Object.assign(STANDALONE_CONFIG, newConfig);
}

// Esporta per uso in altri file
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STANDALONE_CONFIG, getConfig, updateConfig };
} else {
    window.STANDALONE_CONFIG = STANDALONE_CONFIG;
    window.getConfig = getConfig;
    window.updateConfig = updateConfig;
} 