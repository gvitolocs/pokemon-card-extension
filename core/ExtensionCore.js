/**
 * ExtensionCore.js - Core runtime for Pokemon Card Trader Linker
 * Handles startup lifecycle and global extension state.
 */

class ExtensionCore {
    constructor() {
        // Extension state
        this.isEnabled = true;
        this.isProcessing = false;
        this.currentUrl = window.location.href;
        
        console.log('🃏 Pokemon Card Trader Linker - Core initialized');
    }
    
    /**
     * Initialize extension runtime
     */
    async initialize() {
        try {
            console.log('🃏 Pokemon Card Trader Linker - Fast initialization...');
            
            // Load configuration in background
            if (typeof loadConfig === 'function') {
                loadConfig().then(() => {
                    console.log('✅ Configuration loaded');
                }).catch(error => {
                    console.warn('⚠️ Error loading configuration:', error);
                });
            } else {
                console.warn('⚠️ loadConfig function not available');
            }
            
            console.log('✅ Extension initialized');
            
        } catch (error) {
            console.error('❌ Initialization error:', error);
        }
    }
    
    /**
     * Ultra-fast initialization hooks
     */
    initializeUltraFast() {
        console.log('⚡ [CardTrader] Ultra-fast initialization...');
        
        // If DOM is still loading, restart when ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                console.log('⚡ [CardTrader] DOM loaded, restarting observer...');
                // Trigger event to restart observer
                document.dispatchEvent(new CustomEvent('cardtrader-dom-ready'));
            });
        }
        
        // Backup: check every 50ms for new elements
        const checkInterval = setInterval(() => {
            if (document.body) {
                console.log('⚡ [CardTrader] Periodic check - starting observer...');
                document.dispatchEvent(new CustomEvent('cardtrader-check-periodic'));
            }
        }, 50);
        
        // Stop periodic checks after 5 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
        }, 5000);
        
        // Final backup: force start after 200ms
        setTimeout(() => {
            console.log('⚡ [CardTrader] Final forced observer start...');
            document.dispatchEvent(new CustomEvent('cardtrader-force-start'));
        }, 200);
    }
    
    /**
     * Handle URL changes (SPA navigation)
     */
    setupUrlChangeHandler() {
        if (this.urlObserver) {
            this.urlObserver.disconnect();
        }

        const urlObserver = new MutationObserver(() => {
            if (window.location.href !== this.currentUrl) {
                console.log('🔄 [CardTrader] URL changed, clearing state...');
                const oldUrl = this.currentUrl;
                this.currentUrl = window.location.href;
                
                // Trigger event so other modules can reset state
                document.dispatchEvent(new CustomEvent('cardtrader-url-changed', {
                    detail: { oldUrl, newUrl: this.currentUrl }
                }));
            }
        });
        this.urlObserver = urlObserver;
        
        // Observe DOM mutations that can indicate SPA navigation
        if (document.body) {
            urlObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }
    
    /**
     * Enable/disable extension
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`🔄 [CardTrader] Extension ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Set processing state
     */
    setProcessing(processing) {
        this.isProcessing = processing;
    }
    
    /**
     * Check whether extension is enabled
     */
    isExtensionEnabled() {
        return this.isEnabled;
    }
    
    /**
     * Check whether extension is processing
     */
    isExtensionProcessing() {
        return this.isProcessing;
    }
}

// Export class for other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExtensionCore;
} else {
    // Browser global fallback
    window.ExtensionCore = ExtensionCore;
} 