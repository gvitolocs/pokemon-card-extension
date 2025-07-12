// Configurazione e inizializzazione Supabase
let supabaseClient = null;

// Funzione per inizializzare il client Supabase
async function initializeSupabase() {
    try {
        // Carica la configurazione dal storage
        const result = await chrome.storage.sync.get(['supabaseUrl', 'supabaseKey']);
        
        const supabaseUrl = result.supabaseUrl || 'https://msngrrrihwudtnyjatlo.supabase.co';
        const supabaseKey = result.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbmdycnJpaHd1ZHRueWphdGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNTU2NTIsImV4cCI6MjA2NTkzMTY1Mn0.Y0D-FHepxqXznrg2W0n_NOJkgY--GOPJD4EoloK94Yo';
        
        // Crea il client Supabase
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        
        // Testa la connessione
        const { data, error } = await supabaseClient
            .from('cards')
            .select('count')
            .limit(1);
        
        if (error) {
            console.error('❌ Errore connessione Supabase:', error);
            return false;
        }
        
        console.log('✅ Supabase inizializzato correttamente');
        return true;
        
    } catch (error) {
        console.error('❌ Errore nell\'inizializzazione di Supabase:', error);
        return false;
    }
}

// Funzione per ottenere il client Supabase
function getSupabaseClient() {
    return supabaseClient;
}

// Funzione per verificare se Supabase è configurato
function isSupabaseConfigured() {
    return supabaseClient !== null;
}

// Inizializza Supabase quando il DOM è pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSupabase);
} else {
    initializeSupabase();
} 