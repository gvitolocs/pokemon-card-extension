// Configurazione Supabase per l'estensione Pokemon Card Trader Linker
const SUPABASE_CONFIG = {
    URL: 'https://msngrrrihwudtnyjatlo.supabase.co',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbmdycnJpaHd1ZHRueWphdGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNTU2NTIsImV4cCI6MjA2NTkzMTY1Mn0.Y0D-FHepxqXznrg2W0n_NOJkgY--GOPJD4EoloK94Yo'
};

// Funzione per caricare la configurazione dal storage
async function loadConfig() {
    try {
        const result = await chrome.storage.sync.get(['supabaseUrl', 'supabaseKey']);
        
        if (result.supabaseUrl) {
            SUPABASE_CONFIG.URL = result.supabaseUrl;
        }
        if (result.supabaseKey) {
            SUPABASE_CONFIG.ANON_KEY = result.supabaseKey;
        }
        
        console.log('✅ Configurazione Supabase caricata');
        
    } catch (error) {
        console.error('❌ Errore nel caricamento della configurazione:', error);
    }
}

// Funzione per salvare la configurazione
async function saveConfig(config) {
    try {
        await chrome.storage.sync.set({
            supabaseUrl: config.supabaseUrl || SUPABASE_CONFIG.URL,
            supabaseKey: config.supabaseKey || SUPABASE_CONFIG.ANON_KEY
        });
        
        // Ricarica la configurazione
        await loadConfig();
        
        console.log('✅ Configurazione salvata');
        return true;
        
    } catch (error) {
        console.error('❌ Errore nel salvataggio della configurazione:', error);
        return false;
    }
}

// Funzione per generare link CardTrader diretto
function generateCardTraderLink(blueprintId) {
    return `https://www.cardtrader.com/cards/${blueprintId}`;
}

// Carica la configurazione all'avvio
loadConfig(); 