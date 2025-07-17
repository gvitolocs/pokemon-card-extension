/**
 * ExtensionCore.js - Core principale dell'estensione Pokemon Card Trader Linker
 * Gestisce l'inizializzazione e lo stato globale dell'estensione
 */

class ExtensionCore {
    constructor() {
        // Stato dell'estensione
        this.isEnabled = true;
        this.isProcessing = false;
        this.currentUrl = window.location.href;
        
        // Inizializza le variabili globali se non esistono
        if (typeof window.supabaseClient === 'undefined') {
            window.supabaseClient = null;
        }
        
        console.log('🃏 Pokemon Card Trader Linker - Core inizializzato');
    }
    
    /**
     * Inizializza l'estensione
     */
    async initialize() {
        try {
            console.log('🃏 Pokemon Card Trader Linker - Inizializzazione rapida...');
            
            // Carica la configurazione in background
            if (typeof loadConfig === 'function') {
                loadConfig().then(() => {
                    console.log('✅ Configurazione caricata');
                }).catch(error => {
                    console.warn('⚠️ Errore nel caricamento configurazione:', error);
                });
            } else {
                console.warn('⚠️ Funzione loadConfig non disponibile');
            }
            
            // Inizializza Supabase in background
            if (typeof initializeSupabase === 'function') {
                initializeSupabase().then(supabaseReady => {
                    if (supabaseReady) {
                        console.log('✅ Supabase connesso - Cambiando icona a verde');
                        chrome.runtime.sendMessage({ 
                            action: 'updateIcon', 
                            status: 'connected' 
                        });
                    } else {
                        console.warn('⚠️ Supabase non configurato, l\'estensione funzionerà in modalità limitata');
                        chrome.runtime.sendMessage({ 
                            action: 'updateIcon', 
                            status: 'error' 
                        });
                    }
                }).catch(error => {
                    console.warn('⚠️ Errore nell\'inizializzazione Supabase:', error);
                });
            } else {
                console.warn('⚠️ Funzione initializeSupabase non disponibile');
            }
            
            console.log('✅ Estensione inizializzata rapidamente');
            
        } catch (error) {
            console.error('❌ Errore nell\'inizializzazione:', error);
        }
    }
    
    /**
     * Inizializzazione ultra-rapida
     */
    initializeUltraFast() {
        console.log('⚡ [CardTrader] Inizializzazione ultra-rapida...');
        
        // Se il DOM è ancora in caricamento, riavvia quando è pronto
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                console.log('⚡ [CardTrader] DOM caricato, riavvio osservatore...');
                // Trigger event per riavviare l'observer
                document.dispatchEvent(new CustomEvent('cardtrader-dom-ready'));
            });
        }
        
        // Backup: controlla ogni 50ms se ci sono nuovi elementi
        const checkInterval = setInterval(() => {
            if (document.body) {
                console.log('⚡ [CardTrader] Controllo periodico - avvio osservatore...');
                document.dispatchEvent(new CustomEvent('cardtrader-check-periodic'));
            }
            
            // Ferma il controllo dopo 5 secondi
            setTimeout(() => {
                clearInterval(checkInterval);
            }, 5000);
        }, 50);
        
        // Backup finale: se dopo 200ms non è ancora partito, forza l'avvio
        setTimeout(() => {
            console.log('⚡ [CardTrader] Forzatura finale avvio osservatore...');
            document.dispatchEvent(new CustomEvent('cardtrader-force-start'));
        }, 200);
    }
    
    /**
     * Gestisce i cambi di URL (SPA navigation)
     */
    setupUrlChangeHandler() {
        const urlObserver = new MutationObserver(() => {
            if (window.location.href !== this.currentUrl) {
                console.log('🔄 [CardTrader] URL cambiato, pulendo stati...');
                this.currentUrl = window.location.href;
                
                // Trigger event per pulire gli stati
                document.dispatchEvent(new CustomEvent('cardtrader-url-changed', {
                    detail: { oldUrl: this.currentUrl, newUrl: window.location.href }
                }));
            }
        });
        
        // Osserva cambiamenti nel DOM che potrebbero indicare navigazione SPA
        if (document.body) {
            urlObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }
    
    /**
     * Abilita/disabilita l'estensione
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`🔄 [CardTrader] Estensione ${enabled ? 'abilitata' : 'disabilitata'}`);
    }
    
    /**
     * Imposta lo stato di processamento
     */
    setProcessing(processing) {
        this.isProcessing = processing;
    }
    
    /**
     * Verifica se l'estensione è abilitata
     */
    isExtensionEnabled() {
        return this.isEnabled;
    }
    
    /**
     * Verifica se è in fase di processamento
     */
    isExtensionProcessing() {
        return this.isProcessing;
    }
}

// Esporta la classe per l'uso in altri moduli
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExtensionCore;
} else {
    // Per uso in browser
    window.ExtensionCore = ExtensionCore;
} 