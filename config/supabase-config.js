// Supabase configuration and initialization
let supabaseClient = null;
let initializationPromise = null;

// Initialize Supabase client (singleton pattern)
// PROBLEM: on Vinted (and other SPA sites) the extension can reinitialize multiple times
// because:
// 1. SPA navigation does not fully reload the page
// 2. The extension can reactivate on internal URL changes
// 3. Each activation may call initializeSupabase(), creating multiple clients
// 4. Supabase warns: "Multiple GoTrueClient instances detected"
//
// SOLUTION: singleton pattern guarantees only one client instance
async function initializeSupabase() {
    // If already initialized, return existing instance
    // This prevents multiple client creation on SPA navigation
    if (supabaseClient) {
        console.log('✅ Supabase client already initialized, reusing existing instance');
        return true;
    }
    
    // If initialization is already running, await it
    // This avoids race conditions from concurrent calls
    if (initializationPromise) {
        console.log('⏳ Supabase initialization already in progress, waiting...');
        return await initializationPromise;
    }
    
    // Create a shared initialization promise
    // The same promise is reused by simultaneous callers
    initializationPromise = (async () => {
        try {
            console.log('🔄 Initializing new Supabase client...');
            
            // Load configuration from storage
            const result = await chrome.storage.sync.get(['supabaseUrl', 'supabaseKey']);
            
            const supabaseUrl = result.supabaseUrl || 'https://msngrrrihwudtnyjatlo.supabase.co';
            const supabaseKey = result.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbmdycnJpaHd1ZHRueWphdGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNTU2NTIsImV4cCI6MjA2NTkzMTY1Mn0.Y0D-FHepxqXznrg2W0n_NOJkgY--GOPJD4EoloK94Yo';
            
            // Create Supabase client
            supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
            
            // Expose client globally
            window.supabaseClient = supabaseClient;
            
            // Test connection
            const { data, error } = await supabaseClient
                .from('cards')
                .select('count')
                .limit(1);
            
            if (error) {
                console.error('❌ Supabase connection error:', error);
                supabaseClient = null;
                window.supabaseClient = null;
                return false;
            }
            
            console.log('✅ Supabase initialized successfully');
            console.log('✅ Supabase client exposed globally');
            return true;
            
        } catch (error) {
            console.error('❌ Error during Supabase initialization:', error);
            supabaseClient = null;
            window.supabaseClient = null;
            return false;
        } finally {
            // Clear shared initialization promise
            // Allows new initialization if client is reset
            initializationPromise = null;
        }
    })();
    
    return await initializationPromise;
}

// Get Supabase client
function getSupabaseClient() {
    return supabaseClient;
}

// Check whether Supabase is configured
function isSupabaseConfigured() {
    return supabaseClient !== null;
}

// Initialize Supabase when DOM is ready (only once)
// EXTRA SAFETY CHECK: verify client does not already exist
// Needed because on Vinted the DOM can become "ready" more than once
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