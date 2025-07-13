// Configurazione e inizializzazione Supabase
let supabaseClient = null;
let initializationPromise = null;

// Funzione per inizializzare il client Supabase (singleton pattern)
// PROBLEMA: Su Vinted (e altri siti SPA) l'estensione viene reinizializzata più volte
// perché:
// 1. Vinted usa navigazione SPA che non ricarica la pagina
// 2. L'estensione si riattiva ad ogni cambio di URL interno
// 3. Ogni attivazione chiama initializeSupabase() creando client multipli
// 4. Supabase genera warning "Multiple GoTrueClient instances detected"
//
// SOLUZIONE: Pattern singleton che garantisce un solo client
async function initializeSupabase() {
    // Se il client è già stato inizializzato, restituisci quello esistente
    // Questo evita di creare client multipli su navigazioni SPA
    if (supabaseClient) {
        console.log('✅ Client Supabase già inizializzato, riutilizzo esistente');
        return true;
    }
    
    // Se l'inizializzazione è già in corso, aspetta che finisca
    // Questo evita race conditions quando più chiamate arrivano contemporaneamente
    if (initializationPromise) {
        console.log('⏳ Inizializzazione Supabase già in corso, aspetto...');
        return await initializationPromise;
    }
    
    // Crea una nuova promessa di inizializzazione
    // Questa promessa viene condivisa tra tutte le chiamate simultanee
    initializationPromise = (async () => {
        try {
            console.log('🔄 Inizializzazione nuovo client Supabase...');
            
            // Carica la configurazione dal storage
            const result = await chrome.storage.sync.get(['supabaseUrl', 'supabaseKey']);
            
            const supabaseUrl = result.supabaseUrl || 'https://msngrrrihwudtnyjatlo.supabase.co';
            const supabaseKey = result.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbmdycnJpaHd1ZHRueWphdGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNTU2NTIsImV4cCI6MjA2NTkzMTY1Mn0.Y0D-FHepxqXznrg2W0n_NOJkgY--GOPJD4EoloK94Yo';
            
            // Crea il client Supabase
            supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
            
            // Rendi il client disponibile globalmente
            window.supabaseClient = supabaseClient;
            
            // Testa la connessione
            const { data, error } = await supabaseClient
                .from('cards')
                .select('count')
                .limit(1);
            
            if (error) {
                console.error('❌ Errore connessione Supabase:', error);
                supabaseClient = null;
                window.supabaseClient = null;
                return false;
            }
            
            console.log('✅ Supabase inizializzato correttamente');
            console.log('✅ Client Supabase reso disponibile globalmente');
            return true;
            
        } catch (error) {
            console.error('❌ Errore nell\'inizializzazione di Supabase:', error);
            supabaseClient = null;
            window.supabaseClient = null;
            return false;
        } finally {
            // Pulisci la promessa di inizializzazione
            // Questo permette nuove inizializzazioni se il client viene resettato
            initializationPromise = null;
        }
    })();
    
    return await initializationPromise;
}

// Funzione per ottenere il client Supabase
function getSupabaseClient() {
    return supabaseClient;
}

// Funzione per verificare se Supabase è configurato
function isSupabaseConfigured() {
    return supabaseClient !== null;
}

// Inizializza Supabase quando il DOM è pronto (solo se non è già stato fatto)
// CONTROLLO AGGIUNTIVO: Verifica se il client esiste già prima di inizializzare
// Questo è necessario perché su Vinted il DOM può essere "pronto" più volte
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!supabaseClient) {
            initializeSupabase();
        }
    });
} else {
    if (!supabaseClient) {
        initializeSupabase();
    }
} 