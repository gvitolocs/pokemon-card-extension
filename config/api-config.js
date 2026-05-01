// Supabase configuration for Pokemon Card Trader Linker
const SUPABASE_CONFIG = {
    URL: 'https://msngrrrihwudtnyjatlo.supabase.co',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbmdycnJpaHd1ZHRueWphdGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNTU2NTIsImV4cCI6MjA2NTkzMTY1Mn0.Y0D-FHepxqXznrg2W0n_NOJkgY--GOPJD4EoloK94Yo'
};

// Load configuration from storage
async function loadConfig() {
    try {
        const result = await chrome.storage.sync.get(['supabaseUrl', 'supabaseKey']);
        
        if (result.supabaseUrl) {
            SUPABASE_CONFIG.URL = result.supabaseUrl;
        }
        if (result.supabaseKey) {
            SUPABASE_CONFIG.ANON_KEY = result.supabaseKey;
        }
        
        console.log('✅ Supabase configuration loaded');
        
    } catch (error) {
        console.error('❌ Error loading configuration:', error);
    }
}

// Save configuration
async function saveConfig(config) {
    try {
        await chrome.storage.sync.set({
            supabaseUrl: config.supabaseUrl || SUPABASE_CONFIG.URL,
            supabaseKey: config.supabaseKey || SUPABASE_CONFIG.ANON_KEY
        });
        
        // Reload configuration
        await loadConfig();
        
        console.log('✅ Configuration saved');
        return true;
        
    } catch (error) {
        console.error('❌ Error saving configuration:', error);
        return false;
    }
}

// Generate direct CardTrader link
function generateCardTraderLink(blueprintId) {
    return `https://www.cardtrader.com/cards/${blueprintId}`;
}

// Load configuration at startup
loadConfig(); 