// Supabase configuration for Chrome extension
// Replace these values with your actual Supabase project details

const SUPABASE_CONFIG = {
    // Your Supabase project URL (found in your Supabase dashboard)
    url: 'https://msngrrrihwudtnyjatlo.supabase.co',
    
    // Your Supabase anon key (found in your Supabase dashboard)
    // This is safe to use in client-side code
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbmdycnJpaHd1ZHRueWphdGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNTU2NTIsImV4cCI6MjA2NTkzMTY1Mn0.Y0D-FHepxqXznrg2W0n_NOJkgY--GOPJD4EoloK94Yo',
    
    // Optional: Enable/disable Supabase integration
    enabled: true,
    
    // Cache settings
    cacheEnabled: true,
    cacheExpiry: 5 * 60 * 1000, // 5 minutes in milliseconds
    
    // Search settings
    maxResultsPerTable: 10,
    maxTablesToSearch: 50
};

// Load Supabase client library
function loadSupabaseClient() {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (window.supabase) {
            resolve(window.supabase);
            return;
        }
        
        // Load Supabase client from CDN
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/@supabase/supabase-js@2';
        script.onload = () => {
            if (window.supabase) {
                resolve(window.supabase);
            } else {
                reject(new Error('Failed to load Supabase client'));
            }
        };
        script.onerror = () => reject(new Error('Failed to load Supabase client'));
        document.head.appendChild(script);
    });
}

// Initialize Supabase client
async function initializeSupabase() {
    try {
        if (!SUPABASE_CONFIG.enabled) {
            console.log('Supabase integration is disabled');
            return null;
        }
        
        if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
            console.warn('Supabase configuration is incomplete. Please check supabase-config.js');
            return null;
        }
        
        const supabase = await loadSupabaseClient();
        const client = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        
        console.log('✅ Supabase client initialized');
        return client;
    } catch (error) {
        console.error('❌ Failed to initialize Supabase:', error);
        return null;
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SUPABASE_CONFIG, initializeSupabase };
} else {
    window.SUPABASE_CONFIG = SUPABASE_CONFIG;
    window.initializeSupabase = initializeSupabase;
} 