// Content script for Pokemon Card Trader Linker
// It activates automatically on eBay and Vinted

// Singleton pattern to prevent multiple initializations
class PokemonCardTraderLinker {
    constructor() {
        if (PokemonCardTraderLinker.instance) {
            console.log('🃏 Pokemon Card Trader Linker - Singleton already exists, reusing...');
            return PokemonCardTraderLinker.instance;
        }
        
        console.log('🃏 Pokemon Card Trader Linker - Creazione nuova istanza Singleton...');
        PokemonCardTraderLinker.instance = this;
        
        this.isEnabled = true;
        this.isProcessing = false;
        this.cardCache = new Map();
        this.observerCache = new WeakSet();
        this.debounceTimer = null;
        this.successfulMatches = new Set();
        this.globalButton = null;
        this.processingElements = new WeakSet();
        this.processNewListingsTimeout = null;
        
        this.init();
    }
    
    init() {
        console.log('🃏 Pokemon Card Trader Linker - Extension activated');
        this.createGlobalButton();
        this.initializeExtension();
    }
    
    createGlobalButton() {
        // Create the global button only once
        if (!window.globalCardTraderButton) {
            this.globalButton = document.createElement('button');
            window.globalCardTraderButton = this.globalButton;
        } else {
            this.globalButton = window.globalCardTraderButton;
        }
        
        setPokoinButtonLabel(this.globalButton);
        this.globalButton.style.cssText = `
            margin-top: 8px;
            margin-left: 8px;
            padding: 8px 16px;
            font-size: 17px;
            min-width: 100px;
        `;
        applyPokoinButtonStyles(this.globalButton, { background: '#6c757d' });

        console.log('✅ Global Pokoin button created once at startup');
    }
    
    async initializeExtension() {
        // Prevent multiple initialization
        if (this.extensionInitializationInProgress) {
            console.log('🃏 Pokemon Card Trader Linker - Initialization already in progress, skipping...');
            return;
        }
        
        this.extensionInitializationInProgress = true;
        
        try {
            console.log('🃏 Pokemon Card Trader Linker - Fast initialization...');
            
            // Clear successful matches when the page changes
            this.successfulMatches.clear();
            
            // Start the observer immediately for fast insertion
            this.startObserver();
            
            console.log('✅ Extension initialized quickly');
            
            // Expose global functions for processors
            this.exportGlobalFunctions();
            
            // Initialize the site-specific processor immediately
            this.initializeProcessors();
            patchCardTraderCardPage();
            watchCardTraderNavigation();
            
        } catch (error) {
            console.error('❌ Error nell\'initialization:', error);
            this.startObserver();
        }
    }
    
    exportGlobalFunctions() {
        // Export functions globally for processors (only once)
        if (!window.extractTitleInfo) {
            window.extractTitleInfo = this.extractTitleInfo.bind(this);
            window.searchCardInDatabase = this.searchCardInDatabase.bind(this);
            window.generateCardTraderLink = this.generateCardTraderLink.bind(this);
            console.log('✅ [CardTrader] Global functions exported for processors');
        }
    }
    
    initializeProcessors() {
        const hostname = window.location.hostname;
        
        // Check that global functions are available
        if (typeof window.extractTitleInfo !== 'function') {
            console.log('⚠️ [CardTrader] extractTitleInfo not available, retrying in 1 second');
            setTimeout(() => {
                if (typeof window.extractTitleInfo === 'function') {
                    console.log('✅ [CardTrader] extractTitleInfo now available, initializing processors');
                    this.initializeProcessors();
                } else {
                    console.log('❌ [CardTrader] extractTitleInfo still not available, using original logic');
                    this.initializeFallback();
                }
            }, 1000);
            return;
        }
        
        if (hostname.includes('vinted')) {
            console.log('🔍 [CardTrader] Controllo VintedProcessor...');
            console.log('🔍 [CardTrader] window.VintedProcessor:', typeof window.VintedProcessor);
            console.log('🔍 [CardTrader] window.VintedProcessor value:', window.VintedProcessor);
            
            if (window.VintedProcessor) {
                console.log('✅ [CardTrader] Initializing VintedProcessor');
                try {
                    window.vintedProcessor = new window.VintedProcessor();
                    window.vintedProcessor.init();
                    console.log('✅ [CardTrader] VintedProcessor initialized successfully');
                } catch (error) {
                    console.error('❌ [CardTrader] Error nell\'initialization VintedProcessor:', error);
                    this.patchVintedProductPage();
                }
            } else {
                console.log('⚠️ [CardTrader] VintedProcessor not available, using original logic');
                this.patchVintedProductPage();
            }
        } else if (hostname.includes('ebay')) {
            if (window.EbayProcessor) {
                console.log('✅ [CardTrader] Initializing EbayProcessor');
                window.ebayProcessor = new window.EbayProcessor();
                window.ebayProcessor.init();
            } else {
                console.log('⚠️ [CardTrader] EbayProcessor not available, using original logic');
                this.patchEbayProductPage();
            }
        } else if (hostname.includes('cardmarket')) {
            if (window.CardmarketProcessor) {
                console.log('✅ [CardTrader] Initializing CardmarketProcessor');
                window.cardmarketProcessor = new window.CardmarketProcessor();
                window.cardmarketProcessor.init();
            } else {
                console.log('⚠️ [CardTrader] CardmarketProcessor not available, using original logic');
                this.patchCardmarketProductPage();
            }
        } else if (hostname.includes('cardtrader')) {
            patchCardTraderCardPage();
            watchCardTraderNavigation();
        }
    }
    
    initializeFallback() {
        const hostname = window.location.hostname;
        
        if (hostname.includes('vinted')) {
            // If VintedProcessor is active, do not use fallback logic
            if (window.vintedProcessor) {
                console.log('🚫 [CardTrader] VintedProcessor active, skipping fallback logic for Vinted');
                return;
            }
            this.patchVintedProductPage();
        } else if (hostname.includes('ebay')) {
            // If EbayProcessor is active, do not use fallback logic
            if (window.ebayProcessor) {
                console.log('🚫 [CardTrader] EbayProcessor active, skipping fallback logic for eBay');
                return;
            }
            this.patchEbayProductPage();
        } else if (hostname.includes('cardmarket')) {
            // If CardmarketProcessor is active, do not use fallback logic
            if (window.cardmarketProcessor) {
                console.log('🚫 [CardTrader] CardmarketProcessor active, skipping fallback logic for Cardmarket');
                return;
            }
            this.patchCardmarketProductPage();
        }
    }
    
    // Ultra-fast initialization for static pages
    initializeUltraFast() {
        // Prevent multiple initialization
        if (this.ultraFastInitialized) {
            console.log('⚡ [CardTrader] Ultra-fast initialization already completed, skipping...');
            return;
        }
        
        this.ultraFastInitialized = true;
        console.log('⚡ [CardTrader] Ultra-fast initialization for static pages...');
        
        // Clear successful matches when the page changes
        this.successfulMatches.clear();
        
        // Start processing immediately
        this.startObserver();
        patchCardTraderCardPage();
        watchCardTraderNavigation();
        
        // If the DOM is still loading, restart when ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                console.log('⚡ [CardTrader] DOM loaded, restarting processing...');
                this.startObserver();
                patchCardTraderCardPage();
            });
        }
    }
    
    // Simplified function for static pages - no observer
    startObserver() {
        try {
            console.log('🔍 [CardTrader] Starting static page processing...');
            
            // If we are on Vinted and VintedProcessor is active, do not process here
            if (window.location.hostname.includes('vinted') && window.vintedProcessor) {
                console.log('🚫 [CardTrader] VintedProcessor active, skipping static page processing');
                return;
            }
            
            // If we are on eBay and EbayProcessor is active, do not process here
            if (window.location.hostname.includes('ebay') && window.ebayProcessor) {
                console.log('🚫 [CardTrader] EbayProcessor active, skipping static page processing');
                return;
            }
            
            // If we are on Cardmarket and CardmarketProcessor is active, do not process here
            if (window.location.hostname.includes('cardmarket') && window.cardmarketProcessor) {
                console.log('🚫 [CardTrader] CardmarketProcessor active, skipping static page processing');
                return;
            }
            
            // Immediate processing for already present elements
            this.processExistingListingsImmediate();
            
            console.log('✅ [CardTrader] Static page processing completed');
        } catch (error) {
            console.error('❌ [CardTrader] Error during static page processing:', error);
        }
    }
    
    // Metodi delegati alle funzioni esistenti
    processExistingListingsImmediate() {
        if (!this.isEnabled) return;
        
        // If we are on Vinted and VINT processor is active, do not process here
        if (window.location.hostname.includes('vinted') && window.vintedProcessor) {
            console.log('🚫 [CardTrader] VintedProcessor active, skipping main processing');
            return;
        }
        
        // If we are on eBay and EBAYE processor is active, do not process here
        if (window.location.hostname.includes('ebay') && window.ebayProcessor) {
            console.log('🚫 [CardTrader] EbayProcessor active, skipping main processing');
            return;
        }
        
        // If we are on Cardmarket and CME processor is active, do not process here
        if (window.location.hostname.includes('cardmarket') && window.cardmarketProcessor) {
            console.log('🚫 [CardTrader] CardmarketProcessor active, skipping main processing');
            return;
        }
        
        console.log('⚡ [CardTrader] Processing existing listings for static pages...');
        
        if (typeof this.findListings !== 'function') {
            console.warn('⚠️ [CardTrader] findListings function not available');
            return;
        }
        
        const listings = this.findListings();
        console.log(`⚡ [CardTrader] Found ${listings.length} listings for processing`);
        
        // Process all listings
        listings.forEach(listing => {
            this.processListing(listing);
        });
    }
    
    // Methods delegating to existing global functions
    processListing(listingElement) {
        // Implementation delegated to existing function
        return window.processListing(listingElement);
    }
    
    findListings() {
        // Implementation delegated to existing function
        return window.findListings();
    }
    
    extractTitleInfo(title) {
        // Implementation delegated to existing function
        return window.extractTitleInfo(title);
    }
    
    async searchCardInDatabase(titleInfo, originalTitle = '') {
        // Implementation delegated to existing function
        return await window.searchCardInDatabase(titleInfo, originalTitle);
    }
    
    generateCardTraderLink(blueprintId) {
        // Implementation delegated to existing function
        return window.generateCardTraderLink(blueprintId);
    }
    
    patchVintedProductPage() {
        // Implementation delegated to existing function
        return window.patchVintedProductPage();
    }
    
    patchEbayProductPage() {
        // Implementation delegated to existing function
        return window.patchEbayProductPage();
    }
    
    patchCardmarketProductPage() {
        // Implementation delegated to existing function
        return window.patchCardmarketProductPage();
    }
}

// Istanza globale del Singleton
let pokemonCardTraderInstance = null;

function pokoinIconUrl() {
    return chrome.runtime.getURL('assets/pokoin-512.png');
}

function setPokoinButtonLabel(button, matchCount = null) {
    const suffix = Number.isFinite(matchCount) ? ` (${matchCount})` : '';
    button.innerHTML = `
        <img src="${pokoinIconUrl()}" alt="" aria-hidden="true">
        <span>Pokoin.com${suffix}</span>
    `;
    if (window.location?.hostname?.includes('cardmarket')) {
        applyPokoinButtonStyles(button, {
            width: 'auto',
            maxWidth: 'max-content',
            flex: '0 0 auto',
            alignSelf: 'flex-start',
        });
    }
}

function isHighConfidenceMatch(result = {}) {
    const rawScore = result.search_score ?? result.relevanceScore ?? result.score ?? result.search_rank;
    const score = Number(rawScore);
    if (!Number.isFinite(score)) {
        return false;
    }
    if (score <= 1) {
        return score >= 0.7;
    }
    if (score <= 100) {
        return score >= 70;
    }
    return true;
}

function countHighConfidenceMatches(results = []) {
    return results.filter(isHighConfidenceMatch).length;
}

function applyPokoinButtonStyles(button, styles = {}) {
    Object.assign(button.style, {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        background: '#0ea5e9',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        transition: 'all 0.2s ease',
        ...styles,
    });

    const icon = button.querySelector('img');
    if (icon) {
        Object.assign(icon.style, {
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
        });
    }
}

function extractCardTraderBlueprintId(pathname = window.location.pathname) {
    const match = pathname.match(/\/(?:[a-z]{2}\/)?cards\/(\d+)(?:-|\/|$)/i);
    return match ? match[1] : '';
}

function patchCardTraderCardPage() {
    if (!window.location.hostname.includes('cardtrader')) {
        return;
    }

    const blueprintId = extractCardTraderBlueprintId();
    if (!blueprintId || document.querySelector('[data-pokoin-cardtrader-button]')) {
        return;
    }

    const titleBlock = document.querySelector('.py-3.text-center.text-sm-left');
    const titleElement = titleBlock?.querySelector('h2');
    if (!titleBlock || !titleElement) {
        setTimeout(patchCardTraderCardPage, 500);
        return;
    }

    const link = document.createElement('button');
    link.setAttribute('data-pokoin-cardtrader-button', 'true');
    link.type = 'button';
    setPokoinButtonLabel(link);
    Object.assign(link.style, {
        marginLeft: '12px',
        padding: '7px 14px',
        fontSize: '14px',
        lineHeight: '1',
        textDecoration: 'none',
        verticalAlign: 'middle',
    });
    applyPokoinButtonStyles(link, {
        background: '#0ea5e9',
        boxShadow: '0 2px 8px rgba(14, 165, 233, 0.28)',
    });

    link.addEventListener('mouseenter', () => {
        link.style.background = '#0284c7';
        link.style.transform = 'translateY(-1px)';
        link.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.35)';
    });
    link.addEventListener('mouseleave', () => {
        link.style.background = '#0ea5e9';
        link.style.transform = 'translateY(0)';
        link.style.boxShadow = '0 2px 8px rgba(14, 165, 233, 0.28)';
    });
    link.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openPokoinSidePanel();
    }, true);

    titleElement.insertAdjacentElement('afterend', link);
    console.log(`✅ [CardTrader] Added Pokoin button for blueprint ${blueprintId}`);
}

function watchCardTraderNavigation() {
    if (!window.location.hostname.includes('cardtrader') || window.pokoinCardTraderNavigationWatcher) {
        return;
    }

    window.pokoinCardTraderNavigationWatcher = true;
    let lastUrl = window.location.href;
    const checkPage = () => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            setTimeout(patchCardTraderCardPage, 300);
        } else {
            patchCardTraderCardPage();
        }
    };

    new MutationObserver(checkPage).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    window.addEventListener('popstate', () => setTimeout(checkPage, 300));
}

function notifySidePanelNavigation() {
    chrome.runtime.sendMessage({
        action: 'marketplaceNavigationChanged',
        url: window.location.href,
        title: document.title,
    }).catch(() => {
        // The background service worker may be asleep; tabs.onUpdated is a fallback.
    });
}

function openPokoinSidePanel() {
    const cardtraderBlueprintId = extractCardTraderBlueprintId();
    const directTitle = cardtraderBlueprintId
        ? (document.querySelector('.py-3.text-center.text-sm-left h2, h1, h2')?.textContent || document.title).replace(/\s+/g, ' ').trim()
        : document.title;
    return chrome.runtime.sendMessage({
        action: 'openSidePanelForCurrentTab',
        url: window.location.href,
        title: directTitle,
        cardtraderBlueprintId,
    }).catch((error) => {
        console.warn('⚠️ [Pokoin] Unable to open side panel:', error);
        return { success: false, error: error.message };
    });
}

function attachPokoinSidePanelClick(button) {
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPokoinSidePanel();
    });
}

function watchMarketplaceNavigationForSidePanel() {
    if (window.pokoinSidePanelNavigationWatcher) {
        return;
    }

    window.pokoinSidePanelNavigationWatcher = true;
    let lastUrl = window.location.href;
    let debounceId = 0;
    const scheduleNotify = () => {
        window.clearTimeout(debounceId);
        debounceId = window.setTimeout(() => {
            if (window.location.href === lastUrl) {
                return;
            }
            lastUrl = window.location.href;
            notifySidePanelNavigation();
        }, 350);
    };

    const wrapHistoryMethod = (methodName) => {
        const original = history[methodName];
        history[methodName] = function patchedHistoryMethod(...args) {
            const result = original.apply(this, args);
            scheduleNotify();
            return result;
        };
    };

    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');
    window.addEventListener('popstate', scheduleNotify);

    new MutationObserver(scheduleNotify).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
}

// Create the global button only once (outside all loops)
if (!window.globalCardTraderButton) {
    globalButton = document.createElement('button');
    window.globalCardTraderButton = globalButton;
} else {
    globalButton = window.globalCardTraderButton;
}
setPokoinButtonLabel(globalButton);
globalButton.style.cssText = `
    margin-top: 8px;
    margin-left: 8px;
    padding: 8px 16px;
    font-size: 17px;
    min-width: 100px;
`;
applyPokoinButtonStyles(globalButton, { background: '#6c757d' });

console.log('✅ Global Pokoin button created once at startup');

// Initialize the extension
async function initializeExtension() {
    // Prevent multiple initialization
    if (window.extensionInitializationInProgress) {
        console.log('🃏 Pokemon Card Trader Linker - Initialization already in progress, skipping...');
        return;
    }
    
    window.extensionInitializationInProgress = true;
    
    try {
        console.log('🃏 Pokemon Card Trader Linker - Fast initialization...');
        

        
        // Clear successful matches when the page changes
        successfulMatches.clear();
        
        // Start the observer immediately for fast insertion
        startObserver();
        
        console.log('✅ Extension initialized quickly');
        
        // Expose global functions for processors
        window.extractTitleInfo = extractTitleInfo;
        window.searchCardInDatabase = searchCardInDatabase;
        
        // Initialize the processor specific to the current site with delay to ensure files are loaded
        setTimeout(() => {
            const hostname = window.location.hostname;
            
            // Check that global functions are available
            if (typeof window.extractTitleInfo !== 'function') {
                console.log('⚠️ [CardTrader] extractTitleInfo not available, retrying in 1 second');
                setTimeout(() => {
                    if (typeof window.extractTitleInfo === 'function') {
                        console.log('✅ [CardTrader] extractTitleInfo now available, initializing processors');
                        initializeProcessors();
                    } else {
                        console.log('❌ [CardTrader] extractTitleInfo still not available, using original logic');
                        initializeFallback();
                    }
                }, 1000);
                return;
            }
            
            initializeProcessors();
            patchCardTraderCardPage();
            watchCardTraderNavigation();
            
        }, 500); // 500ms delay to ensure files are loaded
        
        function initializeProcessors() {
            const hostname = window.location.hostname;
            
            if (hostname.includes('vinted')) {
                if (window.VintedProcessor) {
                    console.log('✅ [CardTrader] Initializing VintedProcessor');
                    window.vintedProcessor = new window.VintedProcessor();
                    window.vintedProcessor.init();
                } else {
                    console.log('⚠️ [CardTrader] VintedProcessor not available, using original logic');
                    patchVintedProductPage();
                }
            } else if (hostname.includes('ebay')) {
                if (window.EbayProcessor) {
                    console.log('✅ [CardTrader] Initializing EbayProcessor');
                    window.ebayProcessor = new window.EbayProcessor();
                    window.ebayProcessor.init();
                } else {
                    console.log('⚠️ [CardTrader] EbayProcessor not available, using original logic');
                    patchEbayProductPage();
                }
            } else if (hostname.includes('cardmarket')) {
                if (window.CardmarketProcessor) {
                    console.log('✅ [CardTrader] Initializing CardmarketProcessor');
                    window.cardmarketProcessor = new window.CardmarketProcessor();
                    window.cardmarketProcessor.init();
                } else {
                    console.log('⚠️ [CardTrader] CardmarketProcessor not available, using original logic');
                    patchCardmarketProductPage();
                }
            } else if (hostname.includes('cardtrader')) {
                patchCardTraderCardPage();
                watchCardTraderNavigation();
            }
        }
        
        function initializeFallback() {
            const hostname = window.location.hostname;
            
            if (hostname.includes('vinted')) {
                // If VintedProcessor is active, do not use fallback logic
                if (window.vintedProcessor) {
                    console.log('🚫 [CardTrader] VintedProcessor active, skipping fallback logic for Vinted');
                    return;
                }
                patchVintedProductPage();
            } else if (hostname.includes('ebay')) {
                // If EbayProcessor is active, do not use fallback logic
                if (window.ebayProcessor) {
                    console.log('🚫 [CardTrader] EbayProcessor active, skipping fallback logic for eBay');
                    return;
                }
                patchEbayProductPage();
            } else if (hostname.includes('cardmarket')) {
                // If CardmarketProcessor is active, do not use fallback logic
                if (window.cardmarketProcessor) {
                    console.log('🚫 [CardTrader] CardmarketProcessor active, skipping fallback logic for Cardmarket');
                    return;
                }
                patchCardmarketProductPage();
            } else if (hostname.includes('cardtrader')) {
                patchCardTraderCardPage();
            }
        }
        
    } catch (error) {
        console.error('❌ Error nell\'initialization:', error);
        startObserver();
    }
}

// Ultra-fast initialization for static pages
function initializeUltraFast() {
    // Prevent multiple initialization
    if (window.ultraFastInitialized) {
        console.log('⚡ [CardTrader] Ultra-fast initialization already completed, skipping...');
        return;
    }
    
    window.ultraFastInitialized = true;
    console.log('⚡ [CardTrader] Ultra-fast initialization for static pages...');
    
    // Clear successful matches when the page changes
    successfulMatches.clear();
    
    // Start processing immediately
    startObserver();
    patchCardTraderCardPage();
    watchCardTraderNavigation();
    
    // If the DOM is still loading, restart when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('⚡ [CardTrader] DOM loaded, restarting processing...');
            startObserver();
            patchCardTraderCardPage();
        });
    }
}

// Simplified function for static pages - no observer
function startObserver() {
    try {
        console.log('🔍 [CardTrader] Starting static page processing...');
        
        // If we are on Vinted and VintedProcessor is active, do not process here
        if (window.location.hostname.includes('vinted') && window.vintedProcessor) {
            console.log('🚫 [CardTrader] VintedProcessor active, skipping static page processing');
            return;
        }
        
        // If we are on eBay and EbayProcessor is active, do not process here
        if (window.location.hostname.includes('ebay') && window.ebayProcessor) {
            console.log('🚫 [CardTrader] EbayProcessor active, skipping static page processing');
            return;
        }
        
        // If we are on Cardmarket and CardmarketProcessor is active, do not process here
        if (window.location.hostname.includes('cardmarket') && window.cardmarketProcessor) {
            console.log('🚫 [CardTrader] CardmarketProcessor active, skipping static page processing');
            return;
        }
        
        // Immediate processing for already present elements
        processExistingListingsImmediate();
        
        console.log('✅ [CardTrader] Static page processing completed');
    } catch (error) {
        console.error('❌ [CardTrader] Error during static page processing:', error);
    }
}

// Processing existing listings for static pages
function processExistingListingsImmediate() {
    if (!isEnabled) return;
    
    // If we are on Vinted and VINT processor is active, do not process here
    if (window.location.hostname.includes('vinted') && window.vintedProcessor) {
        console.log('🚫 [CardTrader] VintedProcessor active, skipping main processing');
        return;
    }
    
    // If we are on eBay and EBAYE processor is active, do not process here
    if (window.location.hostname.includes('ebay') && window.ebayProcessor) {
        console.log('🚫 [CardTrader] EbayProcessor active, skipping main processing');
        return;
    }
    
    // If we are on Cardmarket and CME processor is active, do not process here
    if (window.location.hostname.includes('cardmarket') && window.cardmarketProcessor) {
        console.log('🚫 [CardTrader] CardmarketProcessor active, skipping main processing');
        return;
    }
    
    console.log('⚡ [CardTrader] Processing existing listings for static pages...');
    
    if (typeof findListings !== 'function') {
        console.warn('⚠️ [CardTrader] findListings function not available');
        return;
    }
    
    const listings = findListings();
    console.log(`⚡ [CardTrader] Found ${listings.length} listings for processing`);
    
    // Process all listings
    listings.forEach(listing => {
        processListing(listing);
    });
}

// Immediate processing of a single listing
function processListingImmediate(listingElement) {
    // Use the Singleton instance
    const instance = pokemonCardTraderInstance;
    if (!instance || !instance.isEnabled || !listingElement || listingElement.hasAttribute('data-pokemon-linker-processed')) {
        return;
    }
    
    // If we are on Vinted and VINT processor is active, do not process here
    if (window.location.hostname.includes('vinted') && window.vintedProcessor) {
        console.log('🚫 [CardTrader] VintedProcessor active, skipping immediate processing');
        return;
    }
    
    try {
        // Extract title immediately
        const title = extractTitleFromListing(listingElement);
        if (!title || title.trim().length < 3) {
            return;
        }
        
        // Check whether we already have a successful match for this title
        const cacheKey = generateCacheKey(title);
        if (instance.successfulMatches.has(cacheKey)) {
            console.log(`🚫 [CardTrader] Match already successful for: "${title}", skipping`);
            return;
        }
        
        // Create an immediate loading button (clone the global button)
        const loadingButton = instance.globalButton.cloneNode(true);
        inserisciLinkContainer(listingElement, loadingButton);
        
        // Mark as processed to avoid duplicates
        listingElement.setAttribute('data-pokemon-linker-processed', 'true');
        
        // Start background search
        requestIdleCallback(() => {
            processListing(listingElement);
        });
        
    } catch (error) {
        console.error('❌ [CardTrader] Error during immediate processing:', error);
    }
}

// Process existing listings
function processExistingListings() {
    // Use the Singleton instance
    const instance = pokemonCardTraderInstance;
    if (!instance || !instance.isEnabled || instance.isProcessing) return;
    
    // If we are on Vinted and VINT processor is active, do not process here
    if (window.location.hostname.includes('vinted') && window.vintedProcessor) {
        console.log('🚫 [CardTrader] VintedProcessor active, skipping main processing');
        return;
    }
    
    // If we are on eBay and EBAYE processor is active, do not process here
    if (window.location.hostname.includes('ebay') && window.ebayProcessor) {
        console.log('🚫 [CardTrader] EbayProcessor active, skipping main processing');
        return;
    }
    
    // If we are on Cardmarket and CME processor is active, do not process here
    if (window.location.hostname.includes('cardmarket') && window.cardmarketProcessor) {
        console.log('🚫 [CardTrader] CardmarketProcessor active, skipping main processing');
        return;
    }
    
    if (typeof findListings !== 'function') {
        console.warn('⚠️ [CardTrader] findListings function not available');
        return;
    }
    
    const listings = findListings();
    console.log(`🔍 Found ${listings.length} listings to process`);
    
    // Limit number of listings processed for batch
    const limitedListings = listings.slice(0, 10);
    
    limitedListings.forEach(listing => {
        // Check whether we already have a successful match for this element
        const title = extractTitleFromListing(listing);
        if (title) {
            const cacheKey = generateCacheKey(title);
            if (!instance.successfulMatches.has(cacheKey)) {
                processListing(listing);
            }
        }
    });
}

// Process new listings
// Debounce to avoid rapid multiple behavior
function processNewListings(container) {
    // Use the Singleton instance
    const instance = pokemonCardTraderInstance;
    if (!instance || !instance.isEnabled || instance.isProcessing) return;
    
    // If we are on Vinted and VINT processor is active, do not process here
    if (window.location.hostname.includes('vinted') && window.vintedProcessor) {
        console.log('🚫 [CardTrader] VintedProcessor active, skipping main processing');
        return;
    }
    
    // If we are on eBay and EBAYE processor is active, do not process here
    if (window.location.hostname.includes('ebay') && window.ebayProcessor) {
        console.log('🚫 [CardTrader] EbayProcessor active, skipping main processing');
        return;
    }
    
    // If we are on Cardmarket and CME processor is active, do not process here
    if (window.location.hostname.includes('cardmarket') && window.cardmarketProcessor) {
        console.log('🚫 [CardTrader] CardmarketProcessor active, skipping main processing');
        return;
    }
    
    if (typeof findListingsInContainer !== 'function') {
        console.warn('⚠️ [CardTrader] findListingsInContainer function not available');
        return;
    }
    
    // Clear previous timeout
    if (instance.processNewListingsTimeout) {
        clearTimeout(instance.processNewListingsTimeout);
    }
    
    // Debounce di 150ms for evitare comportamenti multipli
    instance.processNewListingsTimeout = setTimeout(() => {
        const listings = findListingsInContainer(container);
        
        // Filter elements already processed or being processed
        const unprocessedListings = listings.filter(listing => 
            !listing.hasAttribute('data-pokemon-linker-processed') &&
            !instance.processingElements.has(listing)
        );
        
        console.log(`🔍 [CardTrader] Processando ${unprocessedListings.length} new listings (${listings.length} totali)`);
        
        // Limit number of listings processed for batch
        const limitedListings = unprocessedListings.slice(0, 5);
        
        limitedListings.forEach(listing => {
            // Check whether we already have a successful match for this element
            const title = extractTitleFromListing(listing);
            if (title) {
                const cacheKey = generateCacheKey(title);
                if (!instance.successfulMatches.has(cacheKey)) {
                    processListing(listing);
                }
            }
        });
    }, 150); // Aumentato da 100 a 150ms
}

// Find all listings on the page
function findListings() {
    const selectors = getListingSelectors();
    const listings = [];
    const hostname = window.location.hostname;
    
    selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            if (!element.hasAttribute('data-pokemon-linker-processed')) {
                if (hostname.includes('vinted')) {
                    const skipSelectors = [
                        '[data-testid="item-attributes-upload_date"]',
                        '[data-testid="item-attributes-status"]',
                        '[data-testid="item-attributes-brand-menu-button"]',
                        '.details-list__item-value',
                        '.web_ui__Text__subtitle',
                        '.web_ui__Text__body',
                        '.web_ui__Spacer__',
                        '.web_ui__Divider__',
                        '.overflow-menu',
                        '.u-cursor-pointer',
                        'button',
                        'a'
                    ];
                    
                    let shouldSkip = false;
                    skipSelectors.forEach(skipSelector => {
                        if (element.matches(skipSelector)) {
                            shouldSkip = true;
                        }
                    });
                    
                    if (!shouldSkip) {
                        listings.push(element);
                    }
                } else {
                    listings.push(element);
                }
            }
        });
    });
    
    return listings;
}

// Find listings in a specific container
function findListingsInContainer(container) {
    const selectors = getListingSelectors();
    const listings = [];
    const hostname = window.location.hostname;
    
    selectors.forEach(selector => {
        const elements = container.querySelectorAll ? container.querySelectorAll(selector) : [];
        elements.forEach(element => {
            if (!element.hasAttribute('data-pokemon-linker-processed')) {
                if (hostname.includes('vinted')) {
                    const skipSelectors = [
                        '[data-testid="item-attributes-upload_date"]',
                        '[data-testid="item-attributes-status"]',
                        '[data-testid="item-attributes-brand-menu-button"]',
                        '.details-list__item-value',
                        '.web_ui__Text__subtitle',
                        '.web_ui__Text__body',
                        '.web_ui__Spacer__',
                        '.web_ui__Divider__',
                        '.overflow-menu',
                        '.u-cursor-pointer',
                        'button',
                        'a'
                    ];
                    
                    let shouldSkip = false;
                    skipSelectors.forEach(skipSelector => {
                        if (element.matches(skipSelector)) {
                            shouldSkip = true;
                        }
                    });
                    
                    if (!shouldSkip) {
                        listings.push(element);
                    }
                } else {
                    listings.push(element);
                }
            }
        });
    });
    
    return listings;
}

// Get selectors for listings
function getListingSelectors() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('vinted')) {
        return [
            '[data-testid="item-card"]',
            '.feed-grid__item',
            '.web_ui__Card__body',
            // More specific selectors to avoid irrelevant elements
            '[data-testid="item-page-summary-plugin"] .web_ui__Text__title',
            '.item-details .web_ui__Text__title',
            '.product-details .web_ui__Text__title'
        ];
    } else if (hostname.includes('ebay')) {
        return [
            '.s-item',
            '.srp-results .s-item',
            '.srp-results .s-item__info',
            '.srp-results .s-item__title'
        ];
    } else if (hostname.includes('cardmarket')) {
        // For Cardmarket, use only listing selectors (not product pages)
        // Product pages are handled by the patch
        return [
            '.product-title', // only for listing
            '.col-12 .product-title' // only for listing
        ];
    }
    
    return [];
}

// Process a single listing with cache e ottimizzazioni
// WeakSet to tracciare elements being processed
const processingElements = new WeakSet();

async function processListing(listingElement) {
    // Use the Singleton instance
    const instance = pokemonCardTraderInstance;
    if (!instance || !instance.isEnabled || instance.isProcessing) return;
    
    // If we are on Vinted and VINT processor is active, do not process here
    if (window.location.hostname.includes('vinted') && window.vintedProcessor) {
        console.log('🚫 [CardTrader] VintedProcessor active, skipping main processing');
        return;
    }
    
    try {
        // Controllo duplicazione
        if (listingElement.hasAttribute('data-pokemon-linker-processed') || 
            listingElement.hasAttribute('data-pokemon-linker-processing') ||
            instance.observerCache.has(listingElement) || 
            instance.processingElements.has(listingElement)) {
            console.log('🚫 [CardTrader] Element already processed, skipping');
            return;
        }
        
        // Mark as being processed
        instance.processingElements.add(listingElement);
        listingElement.setAttribute('data-pokemon-linker-processing', 'true');
        
        // Extract title
        const title = extractTitleFromListing(listingElement);
        if (!title) {
            console.log('🚫 [CardTrader] No title found, skipping');
            return;
        }
        
        // Genera chiave cache
        const cacheKey = generateCacheKey(title);
        
        // Controlla cache
        if (instance.cardCache.has(cacheKey)) {
            console.log(`⚡ [CardTrader] Results in cache for: "${title}"`);
            const cachedResults = instance.cardCache.get(cacheKey);
            instance.observerCache.add(listingElement);
            listingElement.setAttribute('data-pokemon-linker-processed', 'true');
            instance.successfulMatches.add(cacheKey);
            return;
        }
        
        console.log(`🔍 [CardTrader] Processing listing: "${title}"`);
        
        // Extract info from title
        const titleInfo = extractTitleInfo(title);
        
        console.log(`🎯 [CardTrader] Local title info:`, titleInfo);
        

        
        // Crea button gray (loading)
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        setPokoinButtonLabel(button);
        button.style.cssText = `
            margin-top: 8px;
            margin-left: 8px;
            padding: 8px 16px;
            font-size: 17px;
            min-width: 100px;
        `;
        applyPokoinButtonStyles(button, { background: '#6c757d' });
        attachPokoinSidePanelClick(button);
        
        // Insert button
        const inseriscied = inserisciLinkContainer(listingElement, button);
        
        if (inseriscied) {
            console.log(`✅ [CardTrader] Added Pokoin button (loading) for ${titleInfo.pokemonName || title}`);
            
            // Search in database
            console.log(`🔍 [CardTrader] Starting search for: "${title}"`);
            let results = await searchCardInDatabase(titleInfo, title);
            console.log(`🔍 [CardTrader] Results received:`, results);
            
            if (results && results.length > 0) {
                console.log(`✅ [CardTrader] Found ${results.length} results`);
                
                // Marca come match riuscito
                instance.successfulMatches.add(cacheKey);
                
                // Save to cache
                instance.cardCache.set(cacheKey, { results, titleInfo });
                
                // Limita cache
                if (instance.cardCache.size > 100) {
                    const firstKey = instance.cardCache.keys().next().value;
                    instance.cardCache.delete(firstKey);
                }
                
                // Change color to green
                button.style.background = '#28a745';
                setPokoinButtonLabel(button, countHighConfidenceMatches(results));
                console.log(`✅ [CardTrader] Link found, button turned green for: ${titleInfo.pokemonName || title}`);
                
                // Hover effects (green)
                button.addEventListener('mouseenter', () => {
                    button.style.background = '#218838';
                    button.style.transform = 'scale(1.05)';
                    button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                });
                
                button.addEventListener('mouseleave', () => {
                    button.style.background = '#28a745';
                    button.style.transform = 'scale(1)';
                    button.style.boxShadow = 'none';
                });
                
            } else {
                console.log('❌ [CardTrader] No result found in database');
                
                // Effetti hover (gray)
                button.addEventListener('mouseenter', () => {
                    button.style.background = '#5a6268';
                    button.style.transform = 'scale(1.05)';
                    button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                });
                
                button.addEventListener('mouseleave', () => {
                    button.style.background = '#6c757d';
                    button.style.transform = 'scale(1)';
                    button.style.boxShadow = 'none';
                });
            }
        } else {
            console.log(`⚠️ [CardTrader] Unable to inserisci button for ${titleInfo.pokemonName}`);
        }
        
        // Marca come processed
        instance.observerCache.add(listingElement);
        listingElement.setAttribute('data-pokemon-linker-processed', 'true');
        listingElement.setAttribute('data-pokemon-linker-last-processed', Date.now().toString());
        
    } catch (error) {
        console.error('❌ [CardTrader] Error processing listing:', error);
    } finally {
        // Remove from list of elements being processed
        instance.processingElements.delete(listingElement);
        listingElement.removeAttribute('data-pokemon-linker-processing');
    }
}

// Extract title from a listing
function extractTitleFromListing(listingElement) {
    const hostname = window.location.hostname;
    
    if (hostname.includes('vinted')) {
        // Selectors for Vinted (more specific)
        const titleSelectors = [
            '[data-testid="item-card-title"]',
            '[data-testid="item-page-summary-plugin"] .web_ui__Text__title',
            '.item-details .web_ui__Text__title',
            '.product-details .web_ui__Text__title',
            '.web_ui__Text__title:not([data-testid*="service"]):not([data-testid*="commission"])'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                let title = element.textContent.trim();
                // Rimuovi eventuali pulsanti CardTrader dal title
                title = title.replace(/\b(CardTrader|Pokoin)\b/g, '').trim();
                return title;
            }
        }
        
        // Fallback: usa il testo of elemento stesso
        if (listingElement.textContent && listingElement.textContent.trim()) {
            let title = listingElement.textContent.trim();
            // Rimuovi eventuali pulsanti CardTrader dal title
            title = title.replace(/\b(CardTrader|Pokoin)\b/g, '').trim();
            return title;
        }
        
    } else if (hostname.includes('ebay')) {
        // Selettori for eBay
        const titleSelectors = [
            '.s-item__title',
            '.s-item__link',
            'h3',
            '.title',
            '.name'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                let title = element.textContent.trim();
                // Rimuovi eventuali pulsanti CardTrader dal title
                title = title.replace(/\b(CardTrader|Pokoin)\b/g, '').trim();
                return title;
            }
        }
        
        // Fallback: usa il testo of elemento stesso
        if (listingElement.textContent && listingElement.textContent.trim()) {
            let title = listingElement.textContent.trim();
            // Rimuovi eventuali pulsanti CardTrader dal title
            title = title.replace(/\b(CardTrader|Pokoin)\b/g, '').trim();
            return title;
        }
    } else if (hostname.includes('cardmarket')) {
        // Cardmarket: product page and listing
        const titleSelectors = [
            '.page-title-container', // container principale
            '.page-title-container .flex-grow-1 h1', // h1 specifico
            'h1', // product page
            '.product-title', // listing
            '.col-12 .d-flex .flex-grow-1 h1', // struttura tipica Cardmarket
            '.col-12 .product-title'
        ];
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector) || (listingElement.matches(selector) ? listingElement : null);
            if (element && element.textContent && element.textContent.trim()) {
                console.log(`🔍 [CardTrader] Cardmarket selettore found: "${selector}"`);
                let title = '';
                // For Cardmarket, get the ENTIRE h1 content including spans (to capture expansion)
                if (element.tagName === 'H1') {
                    title = element.textContent.trim();
                    console.log(`🔍 [CardTrader] Cardmarket H1 completo - Title estratto: "${title}"`);
                } else {
                    title = element.textContent.trim();
                    console.log(`🔍 [CardTrader] Cardmarket title normale - Title estratto: "${title}"`);
                }
                // Rimuovi eventuali pulsanti CardTrader dal title
                title = title.replace(/\b(CardTrader|Pokoin)\b/g, '').trim();
                console.log(`🔍 [CardTrader] Cardmarket title finale: "${title}"`);
                return title;
            }
        }
        console.log(`❌ [CardTrader] Cardmarket: no selettore ha found elementi`);
        // Fallback: usa il testo of elemento stesso
        if (listingElement.textContent && listingElement.textContent.trim()) {
            let title = listingElement.textContent.trim();
            title = title.replace(/\b(CardTrader|Pokoin)\b/g, '').trim();
            console.log(`🔍 [CardTrader] Cardmarket fallback - Title: "${title}"`);
            return title;
        }
    }
    
    return null;
}





// Insert CT button
function inserisciLinkContainer(listingElement, button) {
    const hostname = window.location.hostname;
    
    if (hostname.includes('vinted')) {
        // For Vinted, inserisci after il contenuto principale
        const inserisciAfterSelectors = [
            '.web_ui__Text__body',
            '.web_ui__Text__subtitle',
            '.web_ui__Text__title',
            '[data-testid="item-card-title"]'
        ];
        
        for (const selector of inserisciAfterSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.parentNode) {
                const parent = element.parentNode;
                parent.insertBefore(button, element.nextSibling);
                return true;
            }
        }
        
        // Fallback: inserisci after l'elemento
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
        
    } else if (hostname.includes('ebay')) {
        // For eBay, inserisci after il title
        const inserisciAfterSelectors = [
            '.s-item__title',
            '.s-item__link',
            'h3'
        ];
        
        for (const selector of inserisciAfterSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.parentNode) {
                const parent = element.parentNode;
                parent.insertBefore(button, element.nextSibling);
                return true;
            }
        }
        
        // Fallback: inserisci after l'elemento
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    } else if (hostname.includes('cardmarket')) {
        // For Cardmarket, inserisci after il title
        const inserisciAfterSelectors = [
            '.col-12 .d-flex .flex-grow-1 h1',
            '.product-details h1',
            '.card-title',
            '.product-title',
            'h1',
            '.page-title-container h1'
        ];
        
        for (const selector of inserisciAfterSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.parentNode) {
                const parent = element.parentNode;
                parent.insertBefore(button, element.nextSibling);
                return true;
            }
        }
        
        // Fallback: inserisci after l'elemento
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    }
    
    return false;
}

// Gestisci la search dal popup
async function handlePopupSearch(titleInfo, sendResponse) {
    try {
        console.log('🔍 [CardTrader] Search richiesta dal popup:', titleInfo);
        
        const results = await searchCardInDatabase(titleInfo, titleInfo.originalTitle || '');
        
        sendResponse({
            success: true,
            results: results,
            count: results.length
        });
        
    } catch (error) {
        console.error('❌ [CardTrader] Error in popup search:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Handle automatic search for the current page
async function handleAutoSearchCurrentPage(sendResponse) {
    try {
        console.log('🔍 [Popup] Get current page information');
        
        const hostname = window.location.hostname;
        let pageInfo = {
            url: window.location.href,
            title: document.title,
            hostname: hostname
        };
        
        // Extract page title
        if (hostname.includes('cardmarket')) {
            const titleElement = document.querySelector('h1, .page-title, .product-title');
            if (titleElement) {
                pageInfo.pageTitle = titleElement.textContent.trim();
            }
        } else if (hostname.includes('ebay')) {
            const titleElement = document.querySelector('h1, [data-testid="x-item-title"], .x-item-title');
            if (titleElement) {
                pageInfo.pageTitle = titleElement.textContent.trim();
            }
        } else if (hostname.includes('vinted')) {
            const titleElement = document.querySelector('h1, [data-testid="item-title"], .web_ui__Text__title');
            if (titleElement) {
                pageInfo.pageTitle = titleElement.textContent.trim();
            }
        }
        
        // Se not abbiamo un title specifico, usa il title del documento
        if (!pageInfo.pageTitle) {
            pageInfo.pageTitle = document.title;
        }
        
        console.log(`✅ [Popup] Page information: ${pageInfo.pageTitle}`);
        
        sendResponse({
            success: true,
            pageInfo: pageInfo
        });
        
    } catch (error) {
        console.error('❌ [Popup] Error retrieving page information:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Function specifica for il popup che search su Cardmarket
async function searchCardInDatabaseForPopup(titleInfo, originalTitle = '') {
    try {
        const results = await searchCardInDatabase(titleInfo, originalTitle);
        if (results && results.length > 0) {
            return results.map(result => ({
                ...result,
                cardmarketUrl: generateCardmarketLink(result, titleInfo, originalTitle)
            }));
        }
        
        return results;
        
    } catch (error) {
        console.error('❌ [Popup] Error during search:', error);
        return [];
    }
}

// Genera link for Cardmarket
function generateCardmarketLink(result, titleInfo, originalTitle) {
    try {
        // Costruisci una query di search for Cardmarket
        let searchQuery = '';
        
        // Usa il nome del Pokemon
        if (result.name_en) {
            searchQuery += result.name_en;
        } else if (result.pokemon_name) {
            searchQuery += result.pokemon_name;
        } else if (titleInfo.pokemonName) {
            searchQuery += titleInfo.pokemonName;
        }
        
        // Add expansion if available
        if (result.expansion_name_en) {
            searchQuery += ` ${result.expansion_name_en}`;
        } else if (result.expansion_code) {
            searchQuery += ` ${result.expansion_code}`;
        }
        
        // Add collector number if available
        if (result.collector_number) {
            searchQuery += ` ${result.collector_number}`;
        }
        
        // Codifica la query for l'URL
        const encodedQuery = encodeURIComponent(searchQuery.trim());
        
        // Genera il link Cardmarket
        return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodedQuery}`;
        
    } catch (error) {
        console.error('❌ [Popup] Error generating Cardmarket link:', error);
        // Fallback: search generica for Pokemon
        const pokemonName = titleInfo.pokemonName || 'pokemon';
        return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(pokemonName)}`;
    }
}

// Patch for eBay product pages
function patchEbayProductPage() {
    if (!window.location.hostname.includes('ebay')) return;
    
    try {
        // Search for i product title
        const titleSelectors = [
            'h1.x-item-title__mainTitle',
            'h1[data-testid="x-item-title__mainTitle"]',
            'h1.x-item-title__titleText',
            '[data-testid="x-item-title"] h1',
            'h1[class*="title"]',
            'h1'
        ];
        
        let titleElement = null;
        for (const selector of titleSelectors) {
            titleElement = document.querySelector(selector);
            if (titleElement) break;
        }
        
        if (!titleElement) {
            console.log('⚠️ [CardTrader] eBay product title not found');
            return;
        }
        
        const title = titleElement.textContent.trim();
        if (!title) {
            console.log('⚠️ [CardTrader] eBay product title is empty');
            return;
        }
        
        console.log(`🔍 [CardTrader] eBay product title: "${title}"`);
        
        // Check if the page has already been processed
        if (document.body.hasAttribute('data-pokemon-linker-processed')) {
            console.log('🚫 [CardTrader] eBay product page already processed, skipping');
            return;
        }
        
        // Extract info from title
        const titleInfo = extractTitleInfo(title);
        

        
        // Create gray loading button immediately
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        setPokoinButtonLabel(button);
        button.style.cssText = `
            margin: 16px 0;
            padding: 8px 16px;
            font-size: 16px;
            min-width: 120px;
        `;
        applyPokoinButtonStyles(button, { background: '#6c757d' });
        attachPokoinSidePanelClick(button);
        
        // Insert the button after the title
        if (titleElement.parentNode) {
            titleElement.parentNode.insertBefore(button, titleElement.nextSibling);
            console.log(`✅ [CardTrader] Added button CT (loading) to the eBay product page`);
            
            // Mark the page as processed
            document.body.setAttribute('data-pokemon-linker-processed', 'true');
        } else {
            console.log('⚠️ [CardTrader] Impossibile inserire button CT su eBay');
            return;
        }
        
        // Search in database e aggiorna il button
        searchCardInDatabase(titleInfo, title).then(results => {
            if (results && results.length > 0) {
                // Change color to green when a link is found
                button.style.background = '#28a745';
                setPokoinButtonLabel(button, countHighConfidenceMatches(results));
                console.log(`✅ [CardTrader] Link found, button turned green su eBay`);
                
                // Enhanced hover effects (green)
                button.addEventListener('mouseenter', () => {
                    button.style.background = '#218838';
                    button.style.transform = 'scale(1.05)';
                    button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                });
                
                button.addEventListener('mouseleave', () => {
                    button.style.background = '#28a745';
                    button.style.transform = 'scale(1)';
                    button.style.boxShadow = 'none';
                });
                
            } else {
                // Mantieni gray se not ha found results
                console.log(`⚠️ [CardTrader] No result found, button stays gray on eBay`);
                
                // Effetti hover for button gray (disabilitato)
                button.addEventListener('mouseenter', () => {
                    button.style.background = '#5a6268';
                    button.style.transform = 'scale(1.05)';
                    button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                });
                
                button.addEventListener('mouseleave', () => {
                    button.style.background = '#6c757d';
                    button.style.transform = 'scale(1)';
                    button.style.boxShadow = 'none';
                });
            }
        });
        
    } catch (error) {
        console.error('❌ [CardTrader] Error patching eBay product page:', error);
    }
}

// Patch for Vinted product pages
function patchVintedProductPage() {
    if (!window.location.hostname.includes('vinted')) return;
    
    try {
        // Search for i product title
        const titleSelectors = [
            '[data-testid="item-title"]',
            'h1[data-testid="item-title"]',
            'h1',
            '.web_ui__Text__title',
            '.web_ui__Text__subtitle'
        ];
        
        let titleElement = null;
        for (const selector of titleSelectors) {
            titleElement = document.querySelector(selector);
            if (titleElement) break;
        }
        
        if (!titleElement) {
            console.log('⚠️ [CardTrader] Vinted product title not found');
            return;
        }
        
        const title = titleElement.textContent.trim();
        if (!title) {
            console.log('⚠️ [CardTrader] Vinted product title is empty');
            return;
        }
        
        console.log(`🔍 [CardTrader] Vinted product title: "${title}"`);
        
        // Extract info from title
        const titleInfo = extractTitleInfo(title);
        
        // Search in database
        searchCardInDatabase(titleInfo, title).then(results => {
            if (results && results.length > 0) {
                // Crea un container for i link
                const linkContainer = document.createElement('div');
                linkContainer.className = 'pokemon-linker-product-links';
                linkContainer.style.cssText = `
                    margin: 16px 0;
                    padding: 16px;
                    background: #f8f9fa;
                    border-radius: 8px;
                    border: 1px solid #e9ecef;
                    font-family: Arial, sans-serif;
                `;
                
                const titleElement = document.createElement('h3');
                titleElement.style.cssText = 'margin: 0 0 12px 0; color: #495057; font-size: 16px;';
                titleElement.textContent = '🔗 CardTrader Links:';
                linkContainer.appendChild(titleElement);
                
                // Add i link (massimo 5)
                const maxLinks = Math.min(results.length, 5);
                for (let i = 0; i < maxLinks; i++) {
                    const result = results[i];
                    const linkElement = document.createElement('a');
                    linkElement.href = generateCardTraderLink(result.blueprint_id);
                    linkElement.target = '_blank';
                    linkElement.style.cssText = `
                        display: block;
                        margin-bottom: 8px;
                        color: #007bff;
                        text-decoration: none;
                        font-size: 14px;
                        padding: 8px;
                        background: white;
                        border-radius: 4px;
                        border: 1px solid #dee2e6;
                    `;
                    linkElement.textContent = `${result.name_en || result.pokemon_name} (${result.expansion_name_en || 'Unknown'})`;
                    
                    linkElement.addEventListener('mouseenter', () => {
                        linkElement.style.backgroundColor = '#f8f9fa';
                        linkElement.style.textDecoration = 'underline';
                    });
                    
                    linkElement.addEventListener('mouseleave', () => {
                        linkElement.style.backgroundColor = 'white';
                        linkElement.style.textDecoration = 'none';
                    });
                    
                    linkContainer.appendChild(linkElement);
                }
                
                // Inserisci after il title (with controllo for evitare errori DOM)
                console.log(`🔍 [CardTrader] Attempting link container insertion...`);
                console.log(`🔍 [CardTrader] titleElement:`, titleElement);
                console.log(`🔍 [CardTrader] titleElement.parentNode:`, titleElement.parentNode);
                console.log(`🔍 [CardTrader] linkContainer:`, linkContainer);
                
                if (titleElement.parentNode && !titleElement.parentNode.contains(linkContainer)) {
                    console.log(`✅ [CardTrader] Standard insertion in parentNode`);
                    titleElement.parentNode.insertBefore(linkContainer, titleElement.nextSibling);
                } else {
                    console.log('⚠️ [CardTrader] Impossibile inserire link container, fallback...');
                    console.log(`🔍 [CardTrader] titleElement.parentNode:`, titleElement.parentNode);
                    console.log(`🔍 [CardTrader] titleElement.parentNode.parentNode:`, titleElement.parentNode?.parentNode);
                    
                    // Fallback sicuro: inserisci after l'elemento padre del title
                    if (titleElement.parentNode && titleElement.parentNode.parentNode) {
                        console.log(`✅ [CardTrader] Fallback 1: inserted into parentNode.parentNode`);
                        titleElement.parentNode.parentNode.insertBefore(linkContainer, titleElement.parentNode.nextSibling);
                    } else {
                        // Ultimo fallback: inserisci alla fine del body
                        console.log(`✅ [CardTrader] Fallback 2: inserted into body`);
                        document.body.appendChild(linkContainer);
                    }
                }
                
                console.log(`✅ [CardTrader] Added ${maxLinks} link CardTrader to the product page`);
                

            }
        });
        
    } catch (error) {
        console.error('❌ [CardTrader] Error patching Vinted product page:', error);
    }
}

// Patch for Cardmarket product pages
function patchCardmarketProductPage() {
    if (!window.location.hostname.includes('cardmarket')) return;
    
    try {
        // Search for i product title
        const titleSelectors = [
            '.page-title-container h1',
            'h1',
            '.col-12 .d-flex .flex-grow-1 h1',
            '.product-details h1',
            '.card-title',
            '.product-title'
        ];
        
        let titleElement = null;
        for (const selector of titleSelectors) {
            titleElement = document.querySelector(selector);
            if (titleElement) break;
        }
        
        if (!titleElement) {
            console.log('⚠️ [CardTrader] Cardmarket product title not found');
            return;
        }
        
        // For Cardmarket, get the ENTIRE h1 content including spans (to capture expansion)
        let title = titleElement.textContent.trim();
        
        if (!title) {
            console.log('⚠️ [CardTrader] Cardmarket product title is empty');
            return;
        }
        
        console.log(`🔍 [CardTrader] Cardmarket product title: "${title}"`);
        
        // Extract info from title
        const titleInfo = extractTitleInfo(title);
        
        // Create gray loading button immediately
        const button = document.createElement('button');
        setPokoinButtonLabel(button);
        button.style.cssText = `
            margin: 0;
            padding: 6px 12px;
            font-size: 15px;
            min-width: 100px;
        `;
        applyPokoinButtonStyles(button, { background: '#6c757d' });
        attachPokoinSidePanelClick(button);
        
        // Search il link "Contact Support" e sostituiscilo with il button Pokoin
        const supportLink = document.querySelector('a[href*="support/tickets/new"]');
        let buttonInserted = false; // Flag to track whether the button was inserted
        
        // Inserisci il button
        if (supportLink && supportLink.parentNode) {
            supportLink.parentNode.replaceChild(button, supportLink);
            console.log(`✅ [CardTrader] Replaced support link with Pokoin button on Cardmarket (loading)`);
            buttonInserted = true;
        } else {
            // Find the support link container and insert the button there
            const supportContainer = document.querySelector('.align-self-end.mb-md-1 div');
            if (supportContainer) {
                supportContainer.appendChild(button);
                console.log(`✅ [CardTrader] Inserted Pokoin button in support container on Cardmarket (loading)`);
                buttonInserted = true;
            } else {
                // Fallback: inserisci direttamente in h1
                titleElement.appendChild(button);
                console.log(`✅ [CardTrader] Added Pokoin button to the product page Cardmarket (loading fallback)`);
                buttonInserted = true;
            }
        }

        
        // Ottieni il riferimento al button
        let targetButton = button;
        
        // Esegui sempre la search database se il button esiste (nuovo o already presente)
        console.log('🔍 [CardTrader] Avvio search database for:', titleInfo.pokemonName || title);
        searchCardInDatabase(titleInfo, title).then(results => {
            if (results && results.length > 0) {
                // Change color to green when a link is found
                targetButton.style.background = '#28a745';
                setPokoinButtonLabel(targetButton, countHighConfidenceMatches(results));
                console.log(`✅ [CardTrader] Link found, button turned green`);
                
                // Enhanced hover effects (green)
                targetButton.addEventListener('mouseenter', () => {
                    targetButton.style.background = '#218838';
                    targetButton.style.transform = 'scale(1.02)';
                    targetButton.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)';
                });
                
                targetButton.addEventListener('mouseleave', () => {
                    targetButton.style.background = '#28a745';
                    targetButton.style.transform = 'scale(1)';
                    targetButton.style.boxShadow = 'none';
                });
                
            } else {
                // Mantieni gray se not ha found results
                console.log(`⚠️ [CardTrader] No result found, button stays gray`);
                
                // Effetti hover for button gray (disabilitato)
                targetButton.addEventListener('mouseenter', () => {
                    targetButton.style.background = '#5a6268';
                    targetButton.style.transform = 'scale(1.02)';
                    targetButton.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)';
                });
                
                targetButton.addEventListener('mouseleave', () => {
                    targetButton.style.background = '#6c757d';
                    targetButton.style.transform = 'scale(1)';
                    targetButton.style.boxShadow = 'none';
                });
            }
        });
        
    } catch (error) {
        console.error('❌ [CardTrader] Error patching Cardmarket product page:', error);
    }
}

// Extract info from title
function extractTitleInfo(title) {
    // Clean title from "CardTrader" and other extension elements
    let cleanTitle = title.replace(/\b(CardTrader|Pokoin)\b/g, '').trim();
    cleanTitle = cleanTitle.replace(/\bDB offline\b/g, '').trim();
    cleanTitle = cleanTitle.replace(/\bCaricamento\.\.\.\b/g, '').trim();
    
    console.log(`🔍 [CardTrader] Processing title: "${cleanTitle}" (original: "${title}")`);
    const titleLower = cleanTitle.toLowerCase();
    
    // Declare cardmarketMatch variable (used only on cardmarket.com)
    let cardmarketMatch = null;
    
    // Special handling for Pokemon with multiple names or variants
    const specialCases = {
        'mr. mime': 'mr-mime',
        'mr mime': 'mr-mime', 
        'mrmime': 'mr-mime',
        'mr. mime galar': 'mr-rime',
        'mr mime galar': 'mr-rime',
        'mrmime galar': 'mr-rime',
        'mr. rime': 'mr-rime',
        'mr rime': 'mr-rime',
        'mrrime': 'mr-rime',
        'mime jr.': 'mime-jr',
        'mime jr': 'mime-jr',
        'mimejr': 'mime-jr',
        'type: null': 'type-null',
        'type null': 'type-null',
        'typenull': 'type-null',
        'porygon-z': 'porygon-z',
        'porygon z': 'porygon-z',
        'porygonz': 'porygon-z',
        'ho-oh': 'ho-oh',
        'ho oh': 'ho-oh',
        'hooh': 'ho-oh',
        'jangmo-o': 'jangmo-o',
        'jangmo o': 'jangmo-o',
        'jangmoo': 'jangmo-o',
        'hakamo-o': 'hakamo-o',
        'hakamo o': 'hakamo-o',
        'hakamoo': 'hakamo-o',
        'kommo-o': 'kommo-o',
        'kommo o': 'kommo-o',
        'kommoo': 'kommo-o',
        'farfetch\'d': 'farfetchd',
        'farfetchd': 'farfetchd',
        'sirfetch\'d': 'sirfetchd',
        'sirfetchd': 'sirfetchd',
        'flabébé': 'flabebe',
        'flabebe': 'flabebe',
        'floette': 'floette',
        'florges': 'florges',
        'oricorio': 'oricorio',
        'oricorio baile': 'oricorio-baile',
        'oricorio pom-pom': 'oricorio-pom-pom',
        'oricorio pom pom': 'oricorio-pom-pom',
        'oricorio pom': 'oricorio-pom-pom',
        'oricorio pau': 'oricorio-pau',
        'oricorio sensu': 'oricorio-sensu',
        'minior': 'minior',
        'minior red': 'minior-red',
        'minior blue': 'minior-blue',
        'minior green': 'minior-green',
        'minior yellow': 'minior-yellow',
        'minior orange': 'minior-orange',
        'minior violet': 'minior-violet',
        'minior indigo': 'minior-indigo',
        'mimikyu': 'mimikyu',
        'mimikyu busted': 'mimikyu-busted',
        'mimikyu totem': 'mimikyu-totem',
        'toxtricity': 'toxtricity',
        'toxtricity amped': 'toxtricity-amped',
        'toxtricity low key': 'toxtricity-low-key',
        'toxtricity lowkey': 'toxtricity-low-key',
        'urshifu': 'urshifu',
        'urshifu single strike': 'urshifu-single-strike',
        'urshifu rapid strike': 'urshifu-rapid-strike',
        'calyrex': 'calyrex',
        'calyrex ice rider': 'calyrex-ice-rider',
        'calyrex shadow rider': 'calyrex-shadow-rider',
        'enamorus': 'enamorus',
        'enamorus incarnate': 'enamorus-incarnate',
        'enamorus therian': 'enamorus-therian'
    };

    // Complete list of all Pokemon (Generations 1-9)
    const pokemonNames = [
        // Generation 1 (Kanto) - 151 Pokemon
        'bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard',
        'squirtle', 'wartortle', 'blastoise', 'caterpie', 'metapod', 'butterfree',
        'weedle', 'kakuna', 'beedrill', 'pidgey', 'pidgeotto', 'pidgeot',
        'rattata', 'raticate', 'spearow', 'fearow', 'ekans', 'arbok',
        'pichu', 'pikachu', 'raichu', 'sandshrew', 'sandslash', 'nidoran♀', 'nidorina', 'nidoqueen',
        'nidoran♂', 'nidorino', 'nidoking', 'cleffa', 'clefairy', 'clefable',
        'vulpix', 'ninetales', 'igglybuff', 'jigglypuff', 'wigglytuff', 'zubat', 'golbat',
        'oddish', 'gloom', 'vileplume', 'paras', 'parasect', 'venonat', 'venomoth',
        'diglett', 'dugtrio', 'meowth', 'persian', 'psyduck', 'golduck',
        'mankey', 'primeape', 'growlithe', 'arcanine', 'poliwag', 'poliwhirl', 'poliwrath',
        'abra', 'kadabra', 'alakazam', 'machop', 'machoke', 'machamp',
        'bellsprout', 'weepinbell', 'victreebel', 'tentacool', 'tentacruel', 'geodude', 'graveler', 'golem',
        'ponyta', 'rapidash', 'slowpoke', 'slowbro', 'magnemite', 'magneton',
        'farfetch\'d', 'doduo', 'dodrio', 'seel', 'dewgong', 'grimer', 'muk',
        'shellder', 'cloyster', 'gastly', 'haunter', 'gengar', 'drowzee', 'hypno',
        'krabby', 'kingler', 'voltorb', 'electrode', 'exeggcute', 'exeggutor',
        'cubone', 'marowak', 'tyrogue', 'hitmonlee', 'hitmonchan', 'hitmontop', 'lickitung',
        'koffing', 'weezing', 'rhyhorn', 'rhydon', 'chansey', 'tangela',
        'kangaskhan', 'horsea', 'seadra', 'goldeen', 'seaking', 'staryu', 'starmie',
        'mime jr.', 'mr. mime', 'scyther', 'smoochum', 'jynx', 'elekid', 'electabuzz',
        'magby', 'magmar', 'pinsir', 'tauros', 'magikarp', 'gyarados',
        'lapras', 'ditto', 'vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon',
        'omanyte', 'omastar', 'kabuto', 'kabutops', 'aerodactyl', 'munchlax', 'snorlax',
        'articuno', 'zapdos', 'moltres', 'dratini', 'dragonair', 'dragonite',
        'mewtwo', 'mew',
        
        // Generation 2 (Johto) - 100 Pokemon
        'chikorita', 'bayleef', 'meganium', 'cyndaquil', 'quilava', 'typhlosion',
        'totodile', 'croconaw', 'feraligatr', 'sentret', 'furret', 'hoothoot', 'noctowl',
        'ledyba', 'ledian', 'spinarak', 'ariados', 'chinchou', 'lanturn',
        'togepi', 'togetic', 'togekiss', 'natu', 'xatu', 'mareep', 'flaaffy', 'ampharos',
        'azurill', 'marill', 'azumarill', 'sudowoodo', 'hoppip', 'skiploom', 'jumpluff',
        'aipom', 'sunkern', 'sunflora', 'yanma', 'wooper', 'quagsire',
        'murkrow', 'slowking', 'misdreavus', 'unown', 'wobbuffet', 'girafarig',
        'pineco', 'forretress', 'dunsparce', 'gligar', 'steelix', 'snubbull', 'granbull',
        'qwilfish', 'scizor', 'shuckle', 'heracross', 'sneasel', 'teddiursa', 'ursaring',
        'slugma', 'magcargo', 'swinub', 'piloswine', 'corsola', 'remoraid', 'octillery',
        'delibird', 'mantine', 'skarmory', 'houndour', 'houndoom', 'kingdra',
        'phanpy', 'donphan', 'porygon2', 'stantler', 'smeargle', 'tyrogue', 'hitmontop',
        'smoochum', 'elekid', 'magby', 'miltank', 'blissey', 'raikou', 'entei', 'suicune',
        'larvitar', 'pupitar', 'tyranitar', 'lugia', 'ho-oh', 'celebi',
        
        // Generation 3 (Hoenn) - 135 Pokemon
        'treecko', 'grovyle', 'sceptile', 'torchic', 'combusken', 'blaziken',
        'mudkip', 'marshtomp', 'swampert', 'poochyena', 'mightyena', 'zigzagoon', 'linoone',
        'wurmple', 'silcoon', 'beautifly', 'cascoon', 'dustox', 'lotad', 'lombre', 'ludicolo',
        'seedot', 'nuzleaf', 'shiftry', 'taillow', 'swellow', 'wingull', 'pelipper',
        'ralts', 'kirlia', 'gardevoir', 'gallade', 'surskit', 'masquerain', 'shroomish', 'breloom',
        'slakoth', 'vigoroth', 'slaking', 'nincada', 'ninjask', 'shedinja',
        'whismur', 'loudred', 'exploud', 'makuhita', 'hariyama', 'azurill', 'nosepass', 'probopass',
        'skitty', 'delcatty', 'sableye', 'mawile', 'aron', 'lairon', 'aggron',
        'meditite', 'medicham', 'electrike', 'manectric', 'plusle', 'minun', 'volbeat', 'illumise',
        'roselia', 'gulpin', 'swalot', 'carvanha', 'sharpedo', 'wailmer', 'wailord',
        'numel', 'camerupt', 'torkoal', 'spoink', 'grumpig', 'spinda', 'trapinch', 'vibrava', 'flygon',
        'cacnea', 'cacturne', 'swablu', 'altaria', 'zangoose', 'seviper', 'lunatone', 'solrock',
        'barboach', 'whiscash', 'corphish', 'crawdaunt', 'baltoy', 'claydol', 'lileep', 'cradily',
        'anorith', 'armaldo', 'feebas', 'milotic', 'castform', 'kecleon', 'shuppet', 'banette',
        'duskull', 'dusclops', 'dusknoir', 'tropius', 'chimecho', 'absol', 'wynaut', 'wobbuffet',
        'snorunt', 'glalie', 'froslass', 'spheal', 'sealeo', 'walrein', 'clamperl', 'huntail', 'gorebyss',
        'relicanth', 'luvdisc', 'bagon', 'shelgon', 'salamence', 'beldum', 'metang', 'metagross',
        'regirock', 'regice', 'registeel', 'latias', 'latios', 'kyogre', 'groudon', 'rayquaza',
        'jirachi', 'deoxys',
        
        // Generation 4 (Sinnoh) - 107 Pokemon
        'turtwig', 'grotle', 'torterra', 'chimchar', 'monferno', 'infernape',
        'piplup', 'prinplup', 'empoleon', 'starly', 'staravia', 'staraptor', 'bidoof', 'bibarel',
        'kricketot', 'kricketune', 'shinx', 'luxio', 'luxray', 'budew', 'roserade',
        'cranidos', 'rampardos', 'shieldon', 'bastiodon', 'burmy', 'wormadam', 'mothim',
        'combee', 'vespiquen', 'pachirisu', 'buizel', 'floatzel', 'cherubi', 'cherrim',
        'shellos', 'gastrodon', 'ambipom', 'drifloon', 'drifblim', 'buneary', 'lopunny',
        'mismagius', 'honchkrow', 'glameow', 'purugly', 'chingling', 'stunky', 'skuntank',
        'bronzor', 'bronzong', 'bonsly', 'mime jr.', 'happiny', 'chatot', 'spiritomb',
        'gible', 'gabite', 'garchomp', 'munchlax', 'riolu', 'lucario', 'hippopotas', 'hippowdon',
        'skorupi', 'drapion', 'croagunk', 'toxicroak', 'carnivine', 'finneon', 'lumineon',
        'mantyke', 'snover', 'abomasnow', 'weavile', 'magnezone', 'lickilicky', 'rhyperior',
        'tangrowth', 'electivire', 'magmortar', 'togekiss', 'yanmega', 'leafeon', 'glaceon',
        'gliscor', 'mamoswine', 'porygon-z', 'gallade', 'probopass', 'dusknoir', 'froslass',
        'rotom', 'uxie', 'mesprit', 'azelf', 'dialga', 'palkia', 'heatran', 'regigigas',
        'giratina', 'cresselia', 'phione', 'manaphy', 'darkrai', 'shaymin', 'arceus',
        
        // Generation 5 (Unova) - 156 Pokemon
        'victini', 'snivy', 'servine', 'serperior', 'tepig', 'pignite', 'emboar',
        'oshawott', 'dewott', 'samurott', 'patrat', 'watchog', 'lillipup', 'herdier', 'stoutland',
        'purrloin', 'liepard', 'pansage', 'simisage', 'pansear', 'simisear', 'panpour', 'simipour',
        'munna', 'musharna', 'pidove', 'tranquill', 'unfezant', 'blitzle', 'zebstrika',
        'roggenrola', 'boldore', 'gigalith', 'woobat', 'swoobat', 'drilbur', 'excadrill',
        'audino', 'timburr', 'gurdurr', 'conkeldurr', 'tympole', 'palpitoad', 'seismitoad',
        'throh', 'sawk', 'sewaddle', 'swadloon', 'leavanny', 'venipede', 'whirlipede', 'scolipede',
        'cottonee', 'whimsicott', 'petilil', 'lilligant', 'basculin', 'sandile', 'krokorok', 'krookodile',
        'darumaka', 'darmanitan', 'maractus', 'dwebble', 'crustle', 'scraggy', 'scrafty',
        'sigilyph', 'yamask', 'cofagrigus', 'tirtouga', 'carracosta', 'archen', 'archeops',
        'trubbish', 'garbodor', 'zorua', 'zoroark', 'minccino', 'cinccino', 'gothita', 'gothorita', 'gothitelle',
        'solosis', 'duosion', 'reuniclus', 'ducklett', 'swanna', 'vanillite', 'vanillish', 'vanilluxe',
        'deerling', 'sawsbuck', 'emolga', 'karrablast', 'escavalier', 'foongus', 'amoonguss',
        'frillish', 'jellicent', 'alomomola', 'joltik', 'galvantula', 'ferroseed', 'ferrothorn',
        'klink', 'klang', 'klinklang', 'tynamo', 'eelektrik', 'eelektross', 'elgyem', 'beheeyem',
        'litwick', 'lampent', 'chandelure', 'axew', 'fraxure', 'haxorus', 'cubchoo', 'beartic',
        'cryogonal', 'shelmet', 'accelgor', 'stunfisk', 'mienfoo', 'mienshao', 'druddigon',
        'golett', 'golurk', 'pawniard', 'bisharp', 'kingambit', 'bouffalant', 'rufflet', 'braviary',
        'vullaby', 'mandibuzz', 'heatmor', 'durant', 'deino', 'zweilous', 'hydreigon',
        'larvesta', 'volcarona', 'cobalion', 'terrakion', 'virizion', 'tornadus', 'thundurus', 'reshiram',
        'zekrom', 'landorus', 'kyurem', 'keldeo', 'meloetta', 'genesect',
        
        // Generation 6 (Kalos) - 72 Pokemon
        'chespin', 'quilladin', 'chesnaught', 'fennekin', 'braixen', 'delphox',
        'froakie', 'frogadier', 'greninja', 'bunnelby', 'diggersby', 'fletchling', 'fletchinder', 'talonflame',
        'scatterbug', 'spewpa', 'vivillon', 'litleo', 'pyroar', 'flabébé', 'floette', 'florges',
        'skiddo', 'gogoat', 'pancham', 'pangoro', 'furfrou', 'espurr', 'meowstic',
        'honedge', 'doublade', 'aegislash', 'spritzee', 'aromatisse', 'swirlix', 'slurpuff',
        'inkay', 'malamar', 'binacle', 'barbaracle', 'skrelp', 'dragalge', 'clauncher', 'clawitzer',
        'helioptile', 'heliolisk', 'tyrunt', 'tyrantrum', 'amaura', 'aurorus',
        'sylveon', 'hawlucha', 'dedenne', 'carbink', 'goomy', 'sliggoo', 'goodra',
        'klefki', 'phantump', 'trevenant', 'pumpkaboo', 'gourgeist', 'bergmite', 'avalugg',
        'noibat', 'noivern', 'xerneas', 'yveltal', 'zygarde', 'diancie', 'hoopa', 'volcanion',
        
        // Generation 7 (Alola) - 88 Pokemon
        'rowlet', 'dartrix', 'decidueye', 'litten', 'torracat', 'incineroar',
        'popplio', 'brionne', 'primarina', 'pikipek', 'trumbeak', 'toucannon', 'yungoos', 'gumshoos',
        'grubbin', 'charjabug', 'vikavolt', 'crabrawler', 'crabominable', 'oricorio',
        'cutiefly', 'ribombee', 'rockruff', 'lycanroc', 'wishiwashi', 'mareanie', 'toxapex',
        'mudbray', 'mudsdale', 'dewpider', 'araquanid', 'fomantis', 'lurantis', 'morelull', 'shiinotic',
        'salandit', 'salazzle', 'stufful', 'bewear', 'bounsweet', 'steenee', 'tsareena',
        'comfey', 'oranguru', 'passimian', 'wimpod', 'golisopod', 'sandygast', 'palossand', 'pyukumuku',
        'type: null', 'silvally', 'minior', 'komala', 'turtonator', 'togedemaru',
        'mimikyu', 'bruxish', 'drampa', 'dhelmise', 'jangmo-o', 'hakamo-o', 'kommo-o',
        'tapu koko', 'tapu lele', 'tapu bulu', 'tapu fini', 'cosmog', 'cosmoem', 'solgaleo', 'lunala',
        'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord',
        'necrozma', 'magearna', 'marshadow', 'poipole', 'naganadel', 'stakataka', 'blacephalon', 'zeraora',
        'meltan', 'melmetal',
        
        // Generation 8 (Galar) - 89 Pokemon
        'grookey', 'thwackey', 'rillaboom', 'scorbunny', 'raboot', 'cinderace',
        'sobble', 'drizzile', 'inteleon', 'skwovet', 'greedent', 'rookidee', 'corvisquire', 'corviknight',
        'blipbug', 'dottler', 'orbeetle', 'nickit', 'thievul', 'gossifleur', 'eldegoss',
        'wooloo', 'dubwool', 'chewtle', 'drednaw', 'yamper', 'boltund', 'rolycoly', 'carkol', 'coalossal',
        'applin', 'flapple', 'appletun', 'silicobra', 'sandaconda', 'cramorant', 'arrokuda', 'barraskewda',
        'toxel', 'toxtricity', 'sizzlipede', 'centiskorch', 'clobbopus', 'grapploct', 'sinistea', 'polteageist',
        'hatenna', 'hattrem', 'hatterene', 'impidimp', 'morgrem', 'grimmsnarl', 'obstagoon',
        'perrserker', 'cursola', 'sirfetch\'d', 'mr. rime', 'runerigus', 'milcery', 'alcremie',
        'falinks', 'pincurchin', 'snom', 'frosmoth', 'stonjourner', 'eiscue', 'indeedee', 'morpeko',
        'cufant', 'copperajah', 'dracozolt', 'arctozolt', 'dracovish', 'arctovish', 'duraludon',
        'dreepy', 'drakloak', 'dragapult', 'zacian', 'zamazenta', 'eternatus', 'kubfu', 'urshifu',
        'zarude', 'regieleki', 'regidrago', 'glastrier', 'spectrier', 'calyrex',
        
        // Generation 9 (Paldea) - 120 Pokemon
        'sprigatito', 'floragato', 'meowscarada', 'fuecoco', 'crocalor', 'skeledirge',
        'quaxly', 'quaxwell', 'quaquaval', 'lechonk', 'oinkologne', 'tarountula', 'spidops',
        'nymble', 'lokix', 'pawmi', 'pawmo', 'pawmot', 'tandemaus', 'maushold',
        'fidough', 'dachsbun', 'smoliv', 'dolliv', 'arboliva', 'squawkabilly',
        'nacli', 'naclstack', 'garganacl', 'charcadet', 'armarouge', 'ceruledge',
        'tadbulb', 'bellibolt', 'wattrel', 'kilowattrel', 'maschiff', 'mabosstiff',
        'shroodle', 'grafaiai', 'bramblin', 'brambleghast', 'toedscool', 'toedscruel',
        'klawf', 'capsakid', 'scovillain', 'rellor', 'rabsca', 'flittle', 'espathra',
        'tinkatink', 'tinkatuff', 'tinkaton', 'wiglett', 'wugtrio', 'bombirdier',
        'finizen', 'palafin', 'varoom', 'revavroom', 'cyclizar', 'orthworm',
        'glimmet', 'glimmora', 'greavard', 'houndstone', 'flamigo', 'cetoddle', 'cetitan',
        'veluza', 'dondozo', 'tatsugiri', 'annihilape', 'clodsire', 'farigiraf',
        'dudunsparce', 'kingambit', 'great tusk', 'scream tail', 'brute bonnet', 'flutter mane',
        'slither wing', 'sandy shocks', 'iron treads', 'iron bundle', 'iron hands', 'iron jugulis',
        'iron moth', 'iron thorns', 'frigibax', 'arctibax', 'baxcalibur', 'gimmighoul', 'gholdengo',
        'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu', 'roaring moon', 'iron valiant',
        'koraidon', 'miraidon', 'walking wake', 'iron leaves', 'okidogi', 'munkidori', 'fezandipiti',
        'ogerpon', 'gouging fire', 'raging bolt', 'iron boulder', 'iron crown', 'terapagos', 'pecharunt'
    ];
    
    // Search Pokemon in title with fuzzy search
    let pokemonName = null;
    let secondPokemonName = null;
    const titleWords = titleLower.split(/\s+/);
    
    // First check special cases (name variants)
    for (const [variant, pokemonId] of Object.entries(specialCases)) {
        if (titleLower.includes(variant)) {
            pokemonName = pokemonId;
            console.log(`🎯 [CardTrader] Caso special found: "${variant}" → "${pokemonId}"`);
            break;
        }
    }
    
    // If no special cases are found, search the normal list
    if (!pokemonName) {
        // First search exact matches, prioritizing Pokemon that appear earlier in title
        const foundPokemon = [];
        for (const pokemon of pokemonNames) {
            const pokemonLower = pokemon.toLowerCase();
            // Skip card types that are not actual Pokemon
            if (["ex", "gx", "v", "vmax", "vstar", "lv.x", "ar", "promo"].includes(pokemonLower)) continue;
            const index = titleLower.indexOf(pokemonLower);
            if (index !== -1) {
                foundPokemon.push({ pokemon, index });
            }
        }
    
    // Sort by position in title (earlier = higher priority)
    foundPokemon.sort((a, b) => a.index - b.index);
    
    if (foundPokemon.length > 0) {
        // If we have multiple Pokemon, try to identify the main one
        if (foundPokemon.length > 1) {
            console.log(`🔍 [CardTrader] Found ${foundPokemon.length} Pokemon in title:`, foundPokemon.map(p => p.pokemon));
            
            // Search specific patterns indicating main Pokemon
            const mainPokemonPatterns = [
                /(umbreon|espeon|sylveon|leafeon|glaceon|flareon|jolteon|vaporeon)\s+ex/i,
                /(mew|mewtwo|rayquaza|charizard|blastoise|venusaur)\s+ex/i,
                /(pikachu|raichu)\s+ex/i
            ];
            
            for (const pattern of mainPokemonPatterns) {
                const match = title.match(pattern);
                if (match) {
                    const mainPokemon = match[1].toLowerCase();
                    const found = foundPokemon.find(p => p.pokemon.toLowerCase() === mainPokemon);
                    if (found) {
                        pokemonName = found.pokemon;
                        console.log(`🎯 [CardTrader] Pokemon principale identificato dal pattern: "${pokemonName}"`);
                        break;
                    }
                }
            }
            
            // Se not abbiamo found un pattern specifico, usa il primo
            if (!pokemonName) {
                pokemonName = foundPokemon[0].pokemon;
                console.log(`🎯 [CardTrader] Usando primo Pokemon found: "${pokemonName}"`);
            }
            
            // The second Pokemon is the next one in the list
            secondPokemonName = foundPokemon[1].pokemon;
            console.log(`🎯 [CardTrader] Secondo Pokemon: "${secondPokemonName}"`);
        } else {
            pokemonName = foundPokemon[0].pokemon;
            console.log(`🎯 [CardTrader] Match exact found: "${pokemonName}" in "${title}"`);
        }
    }
    }
    
    // Estrazione specifica for Cardmarket: search pattern come "Pokemon (SET 123)" o "Pokemon (SET123)"
    // SOLO se siamo su cardmarket.com
    if (window.location.hostname.includes('cardmarket')) {
        cardmarketMatch = title.match(/([a-z]+)\s+\(([a-z0-9]{2,6})\s*(\d+)\)/i);
        
        // Se not trova il pattern with parentesi, search senza parentesi: "Pokemon SET 123"
        if (!cardmarketMatch) {
            cardmarketMatch = title.match(/([a-z]+)\s+([a-z0-9]{2,6})\s+(\d+)/i);
        }
        
        if (cardmarketMatch) {
            const [, extractedPokemon, setCode, cardNumber] = cardmarketMatch;
            console.log(`🎯 [CardTrader] Pattern Cardmarket found: Pokemon="${extractedPokemon}", Set="${setCode}", Number="${cardNumber}"`);
            
            // Se il Pokemon estratto dal pattern corrisponde a un Pokemon valid
            const extractedPokemonLower = extractedPokemon.toLowerCase();
            if (pokemonNames.includes(extractedPokemonLower)) {
                // Only if we have not already found a Pokemon from the main title
                if (!pokemonName) {
                    pokemonName = extractedPokemon;
                    console.log(`✅ [CardTrader] Pokemon confermato dal pattern Cardmarket: "${pokemonName}"`);
                } else {
                    console.log(`⚠️ [CardTrader] Pokemon already found in main title: "${pokemonName}", ignoring Cardmarket pattern: "${extractedPokemon}"`);
                }
            } else {
                // Search a fuzzy match if the name is not exact
                if (!pokemonName) {
                    for (const pokemon of pokemonNames) {
                        if (pokemon.toLowerCase() === extractedPokemonLower || 
                            pokemon.toLowerCase().includes(extractedPokemonLower) || 
                            extractedPokemonLower.includes(pokemon.toLowerCase())) {
                            pokemonName = pokemon;
                            console.log(`✅ [CardTrader] Pokemon found with fuzzy match from Cardmarket pattern: "${extractedPokemon}" -> "${pokemonName}"`);
                            break;
                        }
                    }
                }
            }
        }
    }
    
    // If no exact matches are found, search fuzzy matches
    if (!pokemonName) {
        console.log(`🔍 [CardTrader] No exact match, searching fuzzy match...`);
        // If 'eevee' is present in title, take it immediately
        if (titleLower.includes('eevee')) {
            pokemonName = 'eevee';
            console.log('🎯 [CardTrader] Direct match: "eevee" found in title');
        } else {
            for (const pokemon of pokemonNames) {
                const pokemonLower = pokemon.toLowerCase();
                // Skip card types that are not actual Pokemon
                if (["ex", "gx", "v", "vmax", "vstar", "lv.x", "ar", "promo"].includes(pokemonLower)) continue;
                // Controlla ogni parola del title
                for (const word of titleWords) {
                    const wordLower = word.toLowerCase();
                    // If the word is a card-type keyword, never match it as Pokemon
                    if (["ex", "gx", "v", "vmax", "vstar", "lv.x", "ar", "promo"].includes(wordLower)) continue;
                    // Fuzzy match: a word contains the Pokemon or vice versa
                    if (wordLower.includes(pokemonLower) || pokemonLower.includes(wordLower)) {
                        // Calculate similarity to avoid false positives
                        const similarity = calculateSimilarity(wordLower, pokemonLower);
                        if (similarity >= 0.7) { // Similarity threshold
                            pokemonName = pokemon;
                            console.log(`🎯 [CardTrader] Match fuzzy found: "${word}" → "${pokemon}" (similarity: ${Math.round(similarity * 100)}%)`);
                            break;
                        }
                    }
                }
                if (pokemonName) break;
            }
        }
    }
    
    // Se ancora not trova nulla, search match more permissivi for casi special
    if (!pokemonName) {
        console.log(`🔍 [CardTrader] No fuzzy match, searching permissive matches...`);
        
        // Casi special noti
        const specialCases = {
            'evee': 'eevee',
            'eevee': 'eevee',
            'eve': 'eevee',
            'pikachu': 'pikachu',
            'pikach': 'pikachu',
            'charizard': 'charizard',
            'chariz': 'charizard',
            'mew': 'mew',
            'mewtwo': 'mewtwo',
            'lugia': 'lugia',
            'ho-oh': 'ho-oh',
            'hooh': 'ho-oh'
        };
        
        for (const word of titleWords) {
            const wordLower = word.toLowerCase();
            if (specialCases[wordLower]) {
                pokemonName = specialCases[wordLower];
                console.log(`🎯 [CardTrader] Special match found: "${word}" → "${pokemonName}"`);
                break;
            }
        }
    }
    
    // Search collector number (pattern: number/number, XY number, or single number)
    let collectorNumber = null;
    let specialePattern = null; // For memorizzare TG o SL
    
    // First search pattern special come TG16/TG30 o SL16/SL30
    const tgSlMatch = title.match(/(?:tg|sl)(\d+)\/(?:tg|sl)?(\d+)/i);
    if (tgSlMatch) {
        const extractedNumber = parseInt(tgSlMatch[1]);
        // Validate that the number is below 300
        if (extractedNumber < 300) {
            collectorNumber = tgSlMatch[1]; // Take the first number
            specialePattern = title.match(/(tg|sl)/i)[1].toLowerCase(); // Estrai TG o SL
            console.log(`🔍 [CardTrader] Found pattern TG/SL valid: ${collectorNumber} da ${tgSlMatch[0]}, pattern: ${specialePattern} (below 300)`);
        } else {
            console.log(`⚠️ [CardTrader] Number TG/SL ${extractedNumber} ignored because >= 300`);
        }
    } else {
        // Search single pattern like TG16 or SL16
        const singleTgSlMatch = title.match(/(?:tg|sl)(\d+)/i);
        if (singleTgSlMatch) {
            const extractedNumber = parseInt(singleTgSlMatch[1]);
            // Validate that the number is below 300
            if (extractedNumber < 300) {
                collectorNumber = singleTgSlMatch[1];
                specialePattern = title.match(/(tg|sl)/i)[1].toLowerCase(); // Estrai TG o SL
                console.log(`🔍 [CardTrader] Found pattern TG/SL singolo valid: ${collectorNumber} da ${singleTgSlMatch[0]}, pattern: ${specialePattern} (below 300)`);
            } else {
                console.log(`⚠️ [CardTrader] Number TG/SL singolo ${extractedNumber} ignored because >= 300`);
            }
        } else {
            // Search "trainer gallery" as TG pattern
            if (titleLower.includes('trainer gallery')) {
                specialePattern = 'tg';
                console.log(`🎯 [CardTrader] Special pattern found: Trainer Gallery (TG)`);
            }
            
            // Search standard number/number pattern
            const standardMatch = title.match(/(\d+)\/(\d+)/);
            if (standardMatch) {
                const extractedNumber = parseInt(standardMatch[1]);
                // Validate that the number is below 300
                if (extractedNumber < 300) {
                    collectorNumber = standardMatch[1];
                    console.log(`🔍 [CardTrader] Found pattern standard valid: ${collectorNumber} (below 300)`);
                } else {
                    console.log(`⚠️ [CardTrader] Number pattern standard ${extractedNumber} ignored because >= 300`);
                }
                            } else {
                    // Search Cardmarket-specific pattern like "Pokemon (SET 123)" or "Pokemon (SET123)"
                    // SOLO se siamo su cardmarket.com
                    if (window.location.hostname.includes('cardmarket')) {
                        cardmarketMatch = title.match(/([a-z]+)\s+\(([a-z0-9]{2,6})\s*(\d+)\)/i);
                        if (!cardmarketMatch) {
                            cardmarketMatch = title.match(/([a-z]+)\s+([a-z0-9]{2,6})\s+(\d+)/i);
                        }
                        if (cardmarketMatch) {
                            const [, extractedPokemon, setCode, cardNumber] = cardmarketMatch;
                            console.log(`🎯 [CardTrader] Pattern Cardmarket found: Pokemon="${extractedPokemon}", Set="${setCode}", Number="${cardNumber}"`);
                            
                            // Se not abbiamo ancora un Pokemon, usa quello dal pattern
                            if (!pokemonName) {
                                pokemonName = extractedPokemon;
                                console.log(`✅ [CardTrader] Pokemon confermato dal pattern Cardmarket: "${pokemonName}"`);
                            } else {
                                console.log(`⚠️ [CardTrader] Pokemon already found in main title: "${pokemonName}", ignoring Cardmarket pattern: "${extractedPokemon}"`);
                            }
                            
                            // Use the number from the Cardmarket pattern
                            const extractedNumber = parseInt(cardNumber);
                            // Validate that the number is below 300
                            if (extractedNumber < 300) {
                                collectorNumber = cardNumber;
                                console.log(`🎯 [CardTrader] Extracted collector number dal pattern Cardmarket valid: "${collectorNumber}" (below 300)`);
                            } else {
                                console.log(`⚠️ [CardTrader] Number Cardmarket ${extractedNumber} ignored because >= 300`);
                            }
                        }
                    } else {
                    // Fuzzy search for expansion patterns with typos
                    const expansionPatterns = [
                        { pattern: /(?:svp|svp\s+)(\d+)/i, prefix: 'svp', name: 'SVP' },
                        { pattern: /(?:sv|sv\s+)(\d+)/i, prefix: 'sv', name: 'SV' },
                        { pattern: /(?:xy|xy\s+)(\d+)/i, prefix: 'xy', name: 'XY' },
                        { pattern: /(?:dp|dp\s+)(\d+)/i, prefix: 'dp', name: 'DP' },
                        { pattern: /(?:bw|bw\s+)(\d+)/i, prefix: 'bw', name: 'BW' },
                        { pattern: /(?:sm|sm\s+)(\d+)/i, prefix: 'sm', name: 'SM' },
                        { pattern: /(?:ss|ss\s+)(\d+)/i, prefix: 'ss', name: 'SS' },
                        { pattern: /(?:pr|pr\s+)(\d+)/i, prefix: 'pr', name: 'PR' },
                        { pattern: /(?:bs|bs\s+)(\d+)/i, prefix: 'bs', name: 'BS' },
                        { pattern: /(?:h|h\s+)(\d+)/i, prefix: 'h', name: 'H' }
                    ];

                    // Search exact patterns first
                    let foundPattern = false;
                    for (const expPattern of expansionPatterns) {
                        const match = title.match(expPattern.pattern);
                        if (match) {
                            const extractedNumber = parseInt(match[1]);
                            // Validate that the number is below 300
                            if (extractedNumber < 300) {
                                collectorNumber = `${expPattern.prefix}${match[1]}`;
                                console.log(`🔍 [CardTrader] Found pattern ${expPattern.name} valid: ${collectorNumber} da ${match[0]} (below 300)`);
                                foundPattern = true;
                                break;
                            } else {
                                console.log(`⚠️ [CardTrader] Number pattern ${expPattern.name} ${extractedNumber} ignored because >= 300`);
                            }
                        }
                    }

                    // If no exact patterns are found, try fuzzy search for typos
                    if (!foundPattern) {
                        // Search patterns with common errors (e.g. SVP174 -> SV174, SV174 -> SVP174)
                        const fuzzyPatterns = [
                            { 
                                pattern: /(?:svp|svp\s+)(\d+)/i, 
                                alternatives: ['sv', 'svp'], 
                                name: 'SVP/SV fuzzy' 
                            },
                            { 
                                pattern: /(?:sv|sv\s+)(\d+)/i, 
                                alternatives: ['sv', 'svp'], 
                                name: 'SV/SVP fuzzy' 
                            }
                        ];

                        for (const fuzzyPattern of fuzzyPatterns) {
                            const match = title.match(fuzzyPattern.pattern);
                            if (match) {
                                const number = match[1];
                                const extractedNumber = parseInt(number);
                                // Validate that the number is below 300
                                if (extractedNumber < 300) {
                                    // Try both alternatives to see which is more likely
                                    const alternatives = fuzzyPattern.alternatives.map(prefix => `${prefix}${number}`);
                                    console.log(`🔍 [CardTrader] Fuzzy search for ${fuzzyPattern.name} valid: ${alternatives.join(' o ')} (below 300)`);
                                    
                                    // For now use the first alternative (SV), but this can be improved with a database search
                                    // In the future, we could search both alternatives in the database and choose the one with more results
                                    collectorNumber = alternatives[0];
                                    foundPattern = true;
                                    break;
                                } else {
                                    console.log(`⚠️ [CardTrader] Number fuzzy pattern ${fuzzyPattern.name} ${extractedNumber} ignored because >= 300`);
                                }
                            }
                        }
                    }

                    if (!foundPattern) {
                        // Search only isolated numbers (but not years like 2016)
                        const numberMatch = title.match(/\b(?!2016|2015|2014|2013|2012|2011|2010|2009|2008|2007|2006|2005|2004|2003|2002|2001|2000|1999)(\d{1,4})\b/);
                        if (numberMatch) {
                            const extractedNumber = parseInt(numberMatch[1]);
                            // Validate that the number is below 300
                            if (extractedNumber < 300) {
                                collectorNumber = numberMatch[1];
                                console.log(`🔍 [CardTrader] Found valid collector number: ${collectorNumber} (below 300)`);
                            } else {
                                console.log(`⚠️ [CardTrader] Number ${extractedNumber} ignored because >= 300`);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Lista completa di Trainer (spostata after la definizione di expansions e cardTypes)
    const trainerNames = [
        // Gym Leaders Kanto
        'brock', 'misty', 'lt. surge', 'erika', 'koga', 'sabrina', 'blaine', 'giovanni',
        
        // Elite Four Kanto
        'lorelei', 'bruno', 'agatha', 'lance',
        
        // Protagonisti e rivali
        'red', 'blue', 'green', 'leaf', 'yellow', 'crystal', 'ethan', 'lyra', 'kris',
        'brendan', 'may', 'ruby', 'sapphire', 'emerald', 'lucas', 'dawn', 'diamond', 'pearl', 'platinum',
        'hilbert', 'hilda', 'nate', 'rosa', 'black 2', 'white 2',
        'calem', 'serena', 'x', 'y', 'elio', 'selene', 'sun', 'moon', 'ultra sun', 'ultra moon',
        'victor', 'gloria', 'florian', 'juliana',
        
        // Gym Leaders Johto
        'falkner', 'bugsy', 'whitney', 'morty', 'chuck', 'jasmine', 'pryce', 'clair',
        
        // Elite Four Johto
        'will', 'koga', 'bruno', 'karen',
        
        // Gym Leaders Hoenn
        'roxanne', 'brawly', 'wattson', 'flannery', 'norman', 'winona', 'tate', 'liza', 'juan', 'wallace',
        
        // Elite Four Hoenn
        'sidney', 'phoebe', 'glacia', 'drake',
        
        // Gym Leaders Sinnoh
        'roark', 'gardenia', 'maylene', 'crasher wake', 'fantina', 'byron', 'candice', 'volkner',
        
        // Elite Four Sinnoh
        'aaron', 'bertha', 'flint', 'lucian',
        
        // Gym Leaders Unova
        'cilan', 'chili', 'cress', 'lenora', 'burgh', 'elesa', 'clay', 'skyla', 'brycen', 'drayden', 'iris',
        
        // Elite Four Unova
        'shauntal', 'grimsley', 'caitlin', 'marshall',
        
        // Gym Leaders Kalos
        'viola', 'grant', 'korrina', 'ramos', 'clemont', 'valerie', 'olympia', 'wulfric',
        
        // Elite Four Kalos
        'malva', 'siebold', 'wikstrom', 'drasna',
        
        // Gym Leaders Alola
        'hala', 'lana', 'kiawe', 'mallow', 'olivia', 'sophocles', 'acerola', 'nanu', 'hapu',
        
        // Elite Four Alola
        'hala', 'molayne', 'olivia', 'akahata',
        
        // Gym Leaders Galar
        'milo', 'nessa', 'kabu', 'bea', 'allister', 'opal', 'gordie', 'melony', 'piers', 'raihan',
        
        // Elite Four Galar
        'leon', 'hop', 'bede', 'marnie',
        
        // Gym Leaders Paldea
        'katy', 'brassius', 'iono', 'kofu', 'larry', 'ryme', 'tulip', 'grusha',
        
        // Elite Four Paldea
        'rika', 'poppy', 'hassel', 'geeta',
        
        // Trainer importanti e special
        'cynthia', 'steven', 'wallace', 'aaron', 'bertha', 'flint', 'lucian', 'shauntal', 'grimsley', 'caitlin', 'marshall',
        'malva', 'siebold', 'wikstrom', 'drasna', 'molayne', 'akahata', 'leon', 'hop', 'bede', 'marnie',
        'rika', 'poppy', 'hassel', 'geeta', 'nemona', 'penny', 'arven', 'clavell', 'jacq', 'miriam', 'saguaro',
        
        // Team Leaders
        'giovanni', 'maxie', 'tabitha', 'courtney', 'matt', 'shelly', 'archie', 'cyrus', 'mars', 'jupiter', 'saturn',
        'charon', 'ghetsis', 'n', 'colress', 'lysandre', 'xerosic', 'celosia', 'bryony', 'aliana', 'mabel',
        'guzma', 'plumeria', 'gladion', 'lusamine', 'rose', 'oleana', 'peony', 'peonia', 'clavell', 'sada', 'turo',
        
        // Champion e personaggi special
        'champion', 'professor oak', 'professor elm', 'professor birch', 'professor rowan', 'professor juniper',
        'professor sycamore', 'professor kukui', 'professor burnet', 'professor magnolia', 'professor sada', 'professor turo',
        'nurse joy', 'officer jenny', 'bill', 'mr. fuji', 'mr. pokemon', 'kurt', 'baoba', 'lanette', 'bebe', 'celio',
        'buck', 'riley', 'cheryl', 'marley', 'mira', 'darach', 'caitlin', 'benga', 'ingo', 'emmet', 'lenora', 'hawes',
        'fennel', 'amus', 'bianca', 'cedric juniper', 'fennel', 'amus', 'bianca', 'cedric juniper', 'colress', 'ghetsis',
        'n', 'anthea', 'concordia', 'hugh', 'roxie', 'marlon', 'shauna', 'tierno', 'trevor', 'serena', 'calem',
        'diantha', 'malva', 'siebold', 'wikstrom', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna',
        'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna', 'drasna',
        
        // Special card trainers
        'cynthia', 'steven', 'wallace', 'aaron', 'bertha', 'flint', 'lucian', 'shauntal', 'grimsley', 'caitlin', 'marshall',
        'malva', 'siebold', 'wikstrom', 'drasna', 'molayne', 'akahata', 'leon', 'hop', 'bede', 'marnie',
        'rika', 'poppy', 'hassel', 'geeta', 'nemona', 'penny', 'arven', 'clavell', 'jacq', 'miriam', 'saguaro',
        
        // Other important trainers
        'red', 'blue', 'green', 'leaf', 'yellow', 'crystal', 'ethan', 'lyra', 'kris',
        'brendan', 'may', 'ruby', 'sapphire', 'emerald', 'lucas', 'dawn', 'diamond', 'pearl', 'platinum',
        'hilbert', 'hilda', 'nate', 'rosa', 'black 2', 'white 2',
        'calem', 'serena', 'x', 'y', 'elio', 'selene', 'sun', 'moon', 'ultra sun', 'ultra moon',
        'victor', 'gloria', 'florian', 'juliana'
    ];
    
    // Search specific card types (GX, VMAX, VSTAR, EX, etc.)
    const cardTypes = [
        'gx', 'vmax', 'vstar', 'ex', 'break', 'prime', 'legend', 'shining',
        'gold star', 'crystal', 'delta', 'secret rare', 'ultra rare', 'rare holo',
        'rare', 'uncommon', 'common', 'promo', 'black star', 'prerelease', 'staff'
    ];
    
    let cardType = null;
    
    // Special handling for "black star" - it must be searched before "star"
    if (titleLower.includes('black star')) {
        cardType = 'black star';
    } else if (titleLower.includes('gold star')) {
        cardType = 'gold star';
    } else {
        // Search other card types with more flexible matching
        for (const type of cardTypes) {
            // Search card type as separate word or attached to Pokemon
            const typeLower = type.toLowerCase();
            
            // Pattern 1: tipo card come parola separata (with spazi)
            if (titleLower.includes(` ${typeLower} `) || 
                titleLower.startsWith(`${typeLower} `) || 
                titleLower.endsWith(` ${typeLower}`)) {
                cardType = type;
                console.log(`🎯 [CardTrader] Card type detected (separate): "${type}" in title`);
                break;
            }
            
            // Pattern 2: tipo card attaccato al Pokemon (senza spazi)
            // Search patterns like "PokemonEx", "PokemonV", "PokemonGX", etc.
            const pokemonPattern = new RegExp(`\\b\\w+${typeLower}\\b`, 'i');
            if (pokemonPattern.test(titleLower)) {
                cardType = type;
                console.log(`🎯 [CardTrader] Card type detected (attached): "${type}" in title`);
                break;
            }
            
            // Pattern 3: tipo card come parola singola (fallback)
            if (titleLower === typeLower) {
                cardType = type;
                console.log(`🎯 [CardTrader] Card type detected (single): "${type}" in title`);
                break;
            }
        }
    }
    
    // Search specific rarities
    const rarities = [
        'promo', 'secret rare', 'ultra rare', 'rare holo', 'rare', 'uncommon', 'common',
        'holo rare', 'reverse holo', 'cosmos holo', 'starlight holo', 'cracked ice holo',
        'sheen holo', 'non-holo', 'special illustration rare', 'rainbow rare', 'gold rare'
    ];
    
    let rarity = null;
    for (const rar of rarities) {
        if (titleLower.includes(rar.toLowerCase())) {
            rarity = rar;
            break;
        }
    }
    
    // Search specific expansions
    const expansions = [
        // Base Set e espansioni originali
        'base set', 'base', 'base set 2', 'base 2', 'base set unlimited', 'unlimited',
        'jungle', 'jungle set', 'fossil', 'fossil set', 'team rocket', 'team rocket set',
        'gym heroes', 'gym challenge', 'gym leaders', 'gym booster 1 leaders stadium', 'gym booster 1', 'leaders stadium',
        'neo genesis', 'neo discovery', 'neo revelation', 'neo destiny',
        'legendary collection', 'expedition base set', 'aquapolis', 'skyridge',
        'ex ruby & sapphire', 'ex sandstorm', 'ex dragon', 'ex team magma vs team aqua',
        'ex hidden legends', 'ex fire red & leaf green', 'ex team rocket returns', 'ex deoxys',
        'ex emerald', 'ex unseen forces', 'ex delta species', 'ex legend maker',
        'ex holon phantoms', 'ex crystal guardians', 'ex dragon frontiers', 'ex power keepers',
        'diamond & pearl', 'dp', 'mysterious treasures', 'secret wonders', 'great encounters',
        'majestic dawn', 'legends awakened', 'stormfront', 'platinum', 'rising rivals',
        'supreme victors', 'arceus', 'heartgold & soulsilver', 'hgss', 'unleashed',
        'undaunted', 'triumphant', 'call of legends', 'black & white', 'bw', 'emerging powers',
        'noble victories', 'next destinies', 'dark explorers', 'dragons exalted',
        'boundaries crossed', 'plasma storm', 'plasma freeze', 'plasma blast',
        'legendary treasures', 'xy', 'kalos starter set', 'flashfire', 'furious fists',
        'phantom forces', 'primal clash', 'roaring skies', 'ancient origins',
        'breakthrough', 'breakpoint', 'fates collide', 'steam siege', 'evolutions',
        'sun & moon', 'guardians rising', 'burning shadows', 'crimson invasion',
        'ultra prism', 'forbidden light', 'celestial storm', 'dragon majesty',
        'lost thunder', 'team up', 'detective pikachu', 'unbroken bonds',
        'unified minds', 'hidden fates', 'cosmic eclipse', 'sword & shield',
        'rebel clash', 'darkness ablaze', 'champions path', 'vivid voltage',
        'shining fates', 'battle styles', 'chilling reign', 'evolving skies',
        'fusion strike', 'brilliant stars', 'astral radiance', 'lost origin',
        'silver tempest', 'scarlet & violet', 'paldea evolved', 'obsidian flames',
        '151', 'paradox rift', 'temporal forces', 'v star universe', 'vstar universe',
        'dragon frontier', 'dragon frontiers', 'delta species', 'secret wonders',
        'next destinies', 'boundaries crossed', 'plasma storm', 'plasma freeze',
        'legendary treasures', 'flashfire', 'furious fists', 'phantom forces',
        'primal clash', 'roaring skies', 'ancient origins', 'breakthrough',
        'breakpoint', 'fates collide', 'steam siege', 'evolutions', 'sun & moon',
        'guardians rising', 'burning shadows', 'crimson invasion', 'ultra prism',
        'forbidden light', 'celestial storm', 'dragon majesty', 'lost thunder',
        'team up', 'unbroken bonds', 'unified minds', 'hidden fates', 'cosmic eclipse',
        'sword & shield', 'rebel clash', 'darkness ablaze', 'champions path',
        'vivid voltage', 'shining fates', 'battle styles', 'chilling reign',
        'evolving skies', 'fusion strike', 'brilliant stars', 'astral radiance',
        'lost origin', 'silver tempest', 'scarlet & violet', 'paldea evolved',
        'obsidian flames', '151', 'paradox rift', 'temporal forces'
    ];
    
    let expansion = null;
    
    // If we have a Cardmarket pattern, use the expansion from the pattern
    // SOLO se siamo su cardmarket.com
    if (window.location.hostname.includes('cardmarket') && cardmarketMatch) {
        const [, , setCode, cardNumber] = cardmarketMatch;
        
        // Mappa dei codici set Cardmarket alle espansioni
        const setCodeMap = {
            // Black & White Series
            'bw': 'black & white',
            'nxd': 'next destinies',
            'dex': 'dark explorers',
            'drx': 'dragons exalted',
            'bcr': 'boundaries crossed',
            'pls': 'plasma storm',
            'plf': 'plasma freeze',
            'plb': 'plasma blast',
            'lt': 'legendary treasures',
            
            // XY Series
            'xy': 'xy',
            'flf': 'flashfire',
            'ffi': 'furious fists',
            'phf': 'phantom forces',
            'pcl': 'primal clash',
            'ros': 'roaring skies',
            'aor': 'ancient origins',
            'bkt': 'breakthrough',
            'bkp': 'breakpoint',
            'fco': 'fates collide',
            'sts': 'steam siege',
            'evo': 'evolutions',
            
            // Sun & Moon Series
            'sm': 'sun & moon',
            'gri': 'guardians rising',
            'bus': 'burning shadows',
            'cri': 'crimson invasion',
            'upl': 'ultra prism',
            'fli': 'forbidden light',
            'ces': 'celestial storm',
            'drm': 'dragon majesty',
            'lot': 'lost thunder',
            'teu': 'team up',
            'unb': 'unbroken bonds',
            'unm': 'unified minds',
            'hif': 'hidden fates',
            'cos': 'cosmic eclipse',
            
            // Sword & Shield Series
            'ss': 'sword & shield',
            'swsh': 'sword & shield black star promos', // SWSH are promos, not the expansion
            'rcl': 'rebel clash',
            'dab': 'darkness ablaze',
            'cpa': 'champions path',
            'vvi': 'vivid voltage',
            'shf': 'shining fates',
            'bst': 'battle styles',
            'chr': 'chilling reign',
            'evs': 'evolving skies',
            'fus': 'fusion strike',
            'brs': 'brilliant stars',
            'ast': 'astral radiance',
            'lor': 'lost origin',
            'sit': 'silver tempest',
            
            // Scarlet & Violet Series
            'sv': 'scarlet & violet',
            'pal': 'paldea evolved',
            'obf': 'obsidian flames',
            '151': '151',
            'par': 'paradox rift',
            'tfu': 'temporal forces',
            
            // Diamond & Pearl Series
            'dp': 'diamond & pearl',
            'mt': 'mysterious treasures',
            'sw': 'secret wonders',
            'ge': 'great encounters',
            'md': 'majestic dawn',
            'la': 'legends awakened',
            'sf': 'stormfront',
            'pl': 'platinum',
            'rr': 'rising rivals',
            'sv': 'supreme victors',
            'ar': 'arceus',
            
            // HeartGold & SoulSilver Series
            'hgss': 'heartgold & soulsilver',
            'ul': 'unleashed',
            'ud': 'undone',
            'tm': 'triumphant',
            'cl': 'call of legends',
            'cp6': 'expansion pack 20th anniversary'
        };
        
        if (setCodeMap[setCode.toLowerCase()]) {
            expansion = setCodeMap[setCode.toLowerCase()];
            console.log(`🎯 [CardTrader] Extracted expansion dal pattern Cardmarket: "${setCode}" -> "${expansion}"`);
        }
        
        // If we still do not have a collector number, use the one from the pattern
        if (!collectorNumber) {
            collectorNumber = cardNumber;
            console.log(`🎯 [CardTrader] Extracted collector number dal pattern Cardmarket: "${collectorNumber}"`);
        } else {
            // If we already have a number, but the Cardmarket pattern is more specific, use that one
            console.log(`🎯 [CardTrader] Cardmarket pattern found but number already extracted: "${collectorNumber}" vs "${cardNumber}"`);
        }
    }
    
    // If we have not found expansion from pattern, search known expansions
    if (!expansion) {
        console.log(`🔍 [CardTrader] Searching expansion in title: "${titleLower}"`);
        
        // Priority for more specific and common expansions
        const priorityExpansions = [
            'sword & shield', 'swsh', 'diamond & pearl', 'platinum'
        ];
        
        // First search in priority expansions
        for (const exp of priorityExpansions) {
            if (titleLower.includes(exp.toLowerCase())) {
                expansion = exp;
                console.log(`🎯 [CardTrader] Priority expansion found in text: "${expansion}"`);
                break;
            }
        }
        
        // If no priority expansion is found, search all expansions
        if (!expansion) {
            for (const exp of expansions) {
                // Avoid detecting "arceus" as expansion if already detected as Pokemon
                if (exp.toLowerCase() === 'arceus' && pokemonName && pokemonName.toLowerCase() === 'arceus') {
                    console.log(`🚫 [CardTrader] Ignoring "arceus" as expansion because it is already the main Pokemon`);
                    continue;
                }
                
                if (titleLower.includes(exp.toLowerCase())) {
                    expansion = exp;
                    console.log(`🎯 [CardTrader] Expansion found in text: "${expansion}"`);
                    break;
                }
            }
        }
        
        if (!expansion) {
            console.log(`⚠️ [CardTrader] No expansion found in title`);
        }
    } else {
        console.log(`🎯 [CardTrader] Extracted expansion dal pattern Cardmarket: "${expansion}"`);
    }
    
    // Special logic for related expansions
    if (titleLower.includes('gym heroes') && !expansion) {
        // If it finds "gym heroes" but has not found a specific expansion, search related expansions
        if (titleLower.includes('gym') && titleLower.includes('heroes')) {
            expansion = 'gym heroes';
            console.log(`🎯 [CardTrader] Expansion correlata found: Gym Heroes`);
        }
    }
    
    // Check if it is a V card (DISABLED)
    const isVCard = false; // Disabilitato for evitare falsi positivi
    
    // Check if it is a GX card
    const isGXCard = /\bgx\b/i.test(cleanTitle) || /\w+gx\b/i.test(cleanTitle);
    if (isGXCard) {
        console.log(`🎯 [CardTrader] GX card detected in title`);
    }
    
    // Check if it is a VSTAR card
    const isVSTARCard = /\bvstar\b/i.test(cleanTitle) || /\w+vstar\b/i.test(cleanTitle);
    if (isVSTARCard) {
        console.log(`🎯 [CardTrader] VSTAR card detected in title`);
    }
    
    // Check if it is an EX card
    const isEXCard = /\bex\b/i.test(cleanTitle) || /\w+ex\b/i.test(cleanTitle);
    if (isEXCard) {
        console.log(`🎯 [CardTrader] EX card detected in title`);
    }
    
    // Search trainer names (after defining expansions and cardTypes)
    let trainerName = null;
    for (const trainer of trainerNames) {
        // Avoid detecting trainer names that are single letters (like "n" in "giratina")
        if (trainer.length <= 1) continue;
        
        // Search trainer name as separate word
        const trainerRegex = new RegExp(`\\b${trainer.toLowerCase()}\\b`, 'i');
        if (trainerRegex.test(titleLower)) {
            // Check if trainer name is part of an expansion
            let isPartOfExpansion = false;
            for (const exp of expansions) {
                if (exp.toLowerCase().includes(trainer.toLowerCase())) {
                    console.log(`🚫 [CardTrader] Trainer "${trainer}" ignored because it is part of expansion "${exp}"`);
                    isPartOfExpansion = true;
                    break;
                }
            }
            
            // Also check if it is part of card types
            if (!isPartOfExpansion) {
                for (const type of cardTypes) {
                    if (type.toLowerCase().includes(trainer.toLowerCase())) {
                        console.log(`🚫 [CardTrader] Trainer "${trainer}" ignored because it is part of type "${type}"`);
                        isPartOfExpansion = true;
                        break;
                    }
                }
            }
            
            if (!isPartOfExpansion) {
                trainerName = trainer;
                console.log(`🎯 [CardTrader] Trainer name detected: "${trainer}"`);
                break;
            }
        }
    }
    
    return {
        pokemonName: pokemonName,
        secondPokemonName: secondPokemonName,
        collectorNumber: collectorNumber,
        specialePattern: specialePattern,
        trainerName: trainerName,
        cardType: cardType,
        rarity: rarity,
        expansion: expansion,
        isVCard: isVCard,
        isGXCard: isGXCard,
        isVSTARCard: isVSTARCard,
        isEXCard: isEXCard,
        originalTitle: title
    };
}

// Search cards in database
async function searchCardInDatabase(titleInfo, originalTitle = '') {
    try {
        const enrichedTitleInfo = await enrichTitleInfoWithCardvaultName(titleInfo, originalTitle);
        return await searchPokoinCardApi(enrichedTitleInfo, originalTitle);
    } catch (error) {
        console.warn('⚠️ [Pokoin] Content search unavailable; processor/background fallback can continue:', error);
        return [];
    }
}

function structuredPayloadFromTitleInfo(titleInfo = {}, originalTitle = '') {
    const title = originalTitle || titleInfo.originalTitle || '';
    const promoNumber = title.match(/\b(?:BW|XY|SM|SWSH|SVP)\s?\d+[a-z]?\b/i)?.[0]?.replace(/\s+/g, '');
    const collectorNumber = promoNumber || titleInfo.collectorNumber || titleInfo.cardNumber || '';
    const expansionAlias = /\b(?:set\s+base|base\s+set)\b/i.test(title)
        ? 'Base Set'
        : '';
    const editionHint = /\b(?:1st|first|prima|primo|1)\s+(?:edition|edizione)\b/i.test(title);
    const variation = titleInfo.cardType ||
        (titleInfo.isEXCard ? 'ex' : '') ||
        (titleInfo.isGXCard ? 'gx' : '') ||
        (titleInfo.isVSTARCard ? 'vstar' : '') ||
        (titleInfo.isVCard ? 'v' : '') ||
        (title.match(/\b(?:ex|gx|vmax|vstar|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/i)?.[0] || '');

    return {
        name: titleInfo.pokemonName || titleInfo.name || '',
        collectorNumber,
        expansion: titleInfo.expansion || titleInfo.expansionName || expansionAlias,
        rarity: titleInfo.rarity || '',
        variation: String(variation || '').replace(/\s+/g, '').replace(/\./g, '').toLowerCase(),
        editionHint,
        language: 'en',
        limit: 5,
    };
}

function removeMarketplaceSearchNoise(value = '') {
    return String(value || '')
        .replace(/\b(?:1st|first|prima|primo|1)\s+(?:edition|edizione)\b/gi, ' ')
        .replace(/\b(?:set\s+base|base\s+set)\b/gi, ' ')
        .replace(/\b(?:pok[eé]mon|pokemon|pkkmn|pkn|pokn)\b/gi, ' ')
        .replace(/\b(?:carta|carte|card|cards)\b/gi, ' ')
        .replace(/\b(?:sealed|seal(?:ed)?|salead|saled|sigillat[aoe]?|pack|booster|lot)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function compactSearchValue(value = '') {
    return removeMarketplaceSearchNoise(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function resolvedCardNameFromRow(row, term = '') {
    const compactTerm = compactSearchValue(term);
    if (compactTerm === 'nidoran') {
        return 'Nidoran';
    }

    return row?.canonical_name || row?.name || '';
}

function normalizeCardvaultRows(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload && typeof payload === 'object') {
        return payload.rows || payload.results || payload.data || [];
    }

    return [];
}

function candidateNameTermsFromTitle(title = '') {
    const cleaned = removeMarketplaceSearchNoise(String(title || '')
        .replace(/\s*\|\s*(?:Vinted|Cardmarket)\s*$/i, '')
        .replace(/[()"'’`.,:;!?/\\[\]{}|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim());
    const stopWords = new Set([
        'carte', 'carta', 'card', 'cards', 'promo', 'promos', 'rare', 'holo',
        'stamp', 'stampa', 'stamped', 'black', 'star', 'treasure', 'treasures',
        'legendary', 'ottime', 'condizioni', 'condition', 'near', 'mint',
        'first', 'prima', 'primo', 'edition', 'edizione', 'set', 'base',
    ]);
    const words = cleaned
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word && !stopWords.has(word.toLowerCase()));
    const terms = [];

    for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
        for (let index = 0; index <= words.length - size; index += 1) {
            terms.push(words.slice(index, index + size).join(' '));
        }
    }

    return [...new Set(terms)].slice(0, 18);
}

async function resolveNameFromCardvaultTitle(title = '') {
    for (const term of candidateNameTermsFromTitle(title)) {
        const response = await fetch('https://pokoin.com/api/marketplace-autocomplete', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                search_term: term,
                result_limit: 3,
                pool_limit: 30,
                search_language: 'en',
            }),
        });

        if (!response.ok) {
            continue;
        }

        const payload = await response.json();
        const rows = normalizeCardvaultRows(payload);
        const compactTerm = compactSearchValue(term);
        const exactRow = rows.find((row) => {
            const canonical = compactSearchValue(row.canonical_name || '');
            const display = compactSearchValue(row.name || '');
            return canonical === compactTerm || display === compactTerm;
        });

        if (exactRow) {
            return resolvedCardNameFromRow(exactRow, term);
        }
    }

    return '';
}

async function enrichTitleInfoWithCardvaultName(titleInfo = {}, originalTitle = '') {
    const resolvedName = await resolveNameFromCardvaultTitle(originalTitle || titleInfo.originalTitle || '');
    if (!resolvedName) {
        return titleInfo;
    }

    return {
        ...titleInfo,
        pokemonName: resolvedName,
        name: resolvedName,
        cardvaultResolvedName: resolvedName,
    };
}

function matchMatchesStructuredName(match, payload) {
    const requestedName = compactSearchValue(payload?.name || '');
    if (!requestedName) {
        return true;
    }

    const matchName = compactSearchValue(match?.name || '');
    if (!matchName) {
        return false;
    }

    if (requestedName === 'nidoran') {
        return matchName.startsWith('nidoran');
    }

    return matchName === requestedName ||
        matchName.includes(requestedName) ||
        requestedName.includes(matchName);
}

function isAllowedBaseSetFamilyMatch(match) {
    const expansionName = compactSearchValue(match?.expansionName || '');
    return expansionName === 'baseset' ||
        expansionName === 'baseset2' ||
        expansionName === 'basesetshadowless';
}

function sortMatchesForPayload(matches = [], payload = {}) {
    const requestedExpansion = compactSearchValue(payload.expansion || '');
    const requestedName = compactSearchValue(payload.name || '');
    const hasEditionHint = Boolean(payload.editionHint);

    return [...matches].sort((a, b) => {
        const aExpansionPenalty = requestedExpansion && compactSearchValue(a.expansionName || '') !== requestedExpansion ? 1 : 0;
        const bExpansionPenalty = requestedExpansion && compactSearchValue(b.expansionName || '') !== requestedExpansion ? 1 : 0;
        if (aExpansionPenalty !== bExpansionPenalty) {
            return aExpansionPenalty - bExpansionPenalty;
        }

        const aEditionBoost = hasEditionHint && isAllowedBaseSetFamilyMatch(a) ? 0 : 1;
        const bEditionBoost = hasEditionHint && isAllowedBaseSetFamilyMatch(b) ? 0 : 1;
        if (aEditionBoost !== bEditionBoost) {
            return aEditionBoost - bEditionBoost;
        }

        const aNamePenalty = requestedName === 'nidoran' && !compactSearchValue(a.name || '').startsWith('nidoran') ? 1 : 0;
        const bNamePenalty = requestedName === 'nidoran' && !compactSearchValue(b.name || '').startsWith('nidoran') ? 1 : 0;
        if (aNamePenalty !== bNamePenalty) {
            return aNamePenalty - bNamePenalty;
        }

        return Number(b.score || 0) - Number(a.score || 0);
    });
}

function uniqueMatchesById(matches = []) {
    const seen = new Set();
    return matches.filter((match) => {
        const id = String(match.cardId || match.card_id || '');
        if (!id || seen.has(id)) {
            return false;
        }
        seen.add(id);
        return true;
    });
}

function legacyResultFromPokoinMatch(match) {
    return {
        blueprint_id: match.cardId,
        name_en: match.name,
        pokemon_name: match.name,
        expansion_name_en: match.expansionName,
        collector_number: match.collectorNumber,
        rarity: match.rarity,
        image_url: match.imageUrl,
        preview_image_url: match.previewImageUrl,
        source: 'pokoin_extension_card_search',
        search_score: match.score,
    };
}

async function searchPokoinCardApi(titleInfo, originalTitle) {
    const payload = structuredPayloadFromTitleInfo(titleInfo, originalTitle);
    const response = await fetch('https://pokoin.com/api/extension-card-search', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        console.warn(`⚠️ [Pokoin] Extension card search failed with HTTP ${response.status}`);
        return searchPokoinAutocomplete(titleInfo, originalTitle);
    }

    const data = await response.json();
    let matches = Array.isArray(data.matches) ? data.matches : [];
    if (payload.editionHint && !payload.expansion && payload.name) {
        const editionResponse = await fetch('https://pokoin.com/api/extension-card-search', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                ...payload,
                expansion: 'Base Set',
                editionHint: false,
                limit: 5,
            }),
        });
        if (editionResponse.ok) {
            const editionData = await editionResponse.json();
            matches = uniqueMatchesById([...(editionData.matches || []), ...matches]);
        }
    }
    const acceptedMatches = sortMatchesForPayload(
        matches
            .filter((match) => matchMatchesStructuredName(match, payload))
            .filter((match) => compactSearchValue(payload.expansion || '') !== 'baseset' || isAllowedBaseSetFamilyMatch(match)),
        payload
    );
    if (acceptedMatches.length > 0) {
        return acceptedMatches.map(legacyResultFromPokoinMatch);
    }

    return searchPokoinAutocomplete(titleInfo, originalTitle);
}

function legacyResultFromAutocompleteRow(row) {
    return {
        blueprint_id: row.card_id,
        name_en: row.name,
        pokemon_name: row.name,
        expansion_name_en: row.set_name,
        collector_number: row.card_number,
        rarity: row.rarity,
        image_url: row.image_url || row.cdn_image_url,
        preview_image_url: row.preview_image_url,
        source: 'pokoin_marketplace_autocomplete',
        search_score: row.score ?? row.search_rank,
    };
}

function buildPokoinAutocompleteQuery(titleInfo = {}, originalTitle = '') {
    const structuredQuery = [
        titleInfo.pokemonName || titleInfo.name,
        titleInfo.cardType,
        titleInfo.collectorNumber || titleInfo.cardNumber,
        titleInfo.expansion || titleInfo.expansionName,
    ].filter(Boolean).join(' ').trim();

    return removeMarketplaceSearchNoise(structuredQuery || originalTitle);
}

async function searchPokoinAutocomplete(titleInfo, originalTitle) {
    const searchTerm = buildPokoinAutocompleteQuery(titleInfo, originalTitle);
    if (!searchTerm) {
        return [];
    }

    const response = await fetch('https://pokoin.com/api/marketplace-autocomplete', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            search_term: searchTerm,
            result_limit: 5,
            pool_limit: 50,
            search_language: 'en',
        }),
    });

    if (!response.ok) {
        console.warn(`⚠️ [Pokoin] Autocomplete failed with HTTP ${response.status}`);
        return [];
    }

    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : payload.rows;
    return Array.isArray(rows) ? rows.map(legacyResultFromAutocompleteRow) : [];
}

// Estrai la rarity dall'URL of immagine
function extractRarityFromImageUrl(imageUrl) {
    if (!imageUrl) return null;
    
    // Search pattern comuni di rarity negli URL
    const rarityPatterns = [
        /rarity=(\w+)/i,
        /-(\w+)-rare-/i,
        /-(\w+)-uncommon-/i,
        /-(\w+)-common-/i,
        /-(\w+)-secret-/i,
        /-(\w+)-ultra-/i,
        /-(\w+)-holo-/i,
        /-(\w+)-reverse-/i
    ];
    
    for (const pattern of rarityPatterns) {
        const match = imageUrl.match(pattern);
        if (match) {
            return match[1].toLowerCase();
        }
    }
    
    return null;
}

// Calcola la similarity tra due stringhe (algoritmo di Levenshtein semplificato)
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    // Se sono identiche, similarity massima
    if (s1 === s2) return 1;
    
    // Se una contiene l'altra, alta similarity
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    // Casi special for Pokemon
    const specialeMatches = {
        'evee': 'eevee',
        'eevee': 'evee',
        'pikach': 'pikachu',
        'chariz': 'charizard',
        'mew': 'mewtwo',
        'mewtwo': 'mew'
    };
    
    if (specialeMatches[s1] === s2 || specialeMatches[s2] === s1) {
        return 0.8; // Alta similarity for casi special
    }
    
    // Calculate similarity based on common characters
    const len1 = s1.length;
    const len2 = s2.length;
    const maxLen = Math.max(len1, len2);
    
    if (maxLen === 0) return 1;
    
    // Calcola la distanza di Levenshtein semplificata
    let distance = 0;
    let i = 0, j = 0;
    
    while (i < len1 && j < len2) {
        if (s1[i] === s2[j]) {
            i++;
            j++;
        } else {
            distance++;
            // Advance in the shorter string
            if (len1 < len2) {
                j++;
            } else if (len2 < len1) {
                i++;
            } else {
                i++;
                j++;
            }
        }
    }
    
    // Add la differenza di lunghezza
    distance += Math.abs(len1 - len2);
    
    // Converti distanza in similarity
    return Math.max(0, 1 - (distance / maxLen));
}

// Function for estrarre TUTTE le parole dal title (escludendo Pokemon name e collector number)
function extractAllWordsFromTitle(originalTitle, titleInfo) {
    if (!originalTitle) return [];
    
    // Convert to lowercase and remove special characters
    let cleanTitle = originalTitle.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Replace special characters with spaces
        .replace(/\s+/g, ' ') // Normalizza spazi multipli
        .trim();
    
    // Rimuovi il nome Pokemon se presente
    if (titleInfo.pokemonName) {
        const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
        cleanTitle = cleanTitle.replace(new RegExp(`\\b${pokemonNameLower}\\b`, 'gi'), '');
    }
    
    // Remove collector number if present
    if (titleInfo.collectorNumber) {
        const collectorNumberStr = titleInfo.collectorNumber.toString();
        cleanTitle = cleanTitle.replace(new RegExp(`\\b${collectorNumberStr}\\b`, 'gi'), '');
    }
    
    // Rimuovi l'expansion se presente
    if (titleInfo.expansion) {
        const expansionLower = titleInfo.expansion.toLowerCase();
        cleanTitle = cleanTitle.replace(new RegExp(`\\b${expansionLower}\\b`, 'gi'), '');
    }
    
    // Extract all remaining words (length >= 2 characters)
    const words = cleanTitle.split(/\s+/)
        .filter(word => word.length >= 2)
        .filter(word => !['card', 'pokemon', 'game', 'trading', 'collectible'].includes(word)); // Rimuovi parole generiche
    
    console.log(`🔍 [CardTrader] Parole estratte da "${originalTitle}":`, words);
    return words;
}

// Function to calculate word-by-word match score with image_url
function calculateImageUrlWordMatch(imageUrl, titleWords) {
    if (!imageUrl || !titleWords || titleWords.length === 0) return 0;
    
    // Extract final part of URL (after the last /)
    const urlParts = imageUrl.split('/');
    const finalPart = urlParts[urlParts.length - 1] || '';
    
    // Remove file extension when present
    const finalPartWithoutExt = finalPart.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    
    // Converti in minuscolo e normalizza
    const normalizedFinalPart = finalPartWithoutExt.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Replace special characters with spaces
        .replace(/\s+/g, ' ') // Normalizza spazi multipli
        .trim();
    
    console.log(`🔍 [CardTrader] Parte finale URL: "${normalizedFinalPart}"`);
    
    let totalScore = 0;
    let matchedWords = [];
    
    // For each word in the title, search for a match in the final URL part
    titleWords.forEach((word, index) => {
        const wordLower = word.toLowerCase();
        
        // Check whether the word is present in the final URL part
        if (normalizedFinalPart.includes(wordLower)) {
            // Score progressivo: first parola = 1000, seconda = 900, terza = 800, ecc.
            const progressiveScore = Math.max(100, 1000 - (index * 100));
            totalScore += progressiveScore;
            matchedWords.push({ word: wordLower, score: progressiveScore });
            
            console.log(`🎯 [CardTrader] MATCH PAROLA: "${wordLower}" -> +${progressiveScore} points`);
        }
    });
    
    if (matchedWords.length > 0) {
        console.log(`📊 [CardTrader] Parole matchate:`, matchedWords);
    }
    
    return totalScore;
}

// Function for generare chiave cache
function generateCacheKey(title) {
    return title.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Function for generare link Pokoin
function generatePokoinLink(blueprintId) {
    // Caso special for search Cardmarket
    if (blueprintId === 'cardmarket_search') {
        return null; // Not generare link Pokoin for ricerche Cardmarket
    }
    return `https://pokoin.com/marketplace/en/cards/${blueprintId}`;
}

function generateCardTraderLink(blueprintId) {
    if (blueprintId === 'cardmarket_search') {
        return null;
    }
    return `https://cardtrader.com/cards/${blueprintId}`;
}

// Function for aggiornare le statistiche
async function updateStats(type, increment = 1) {
    try {
        const result = await chrome.storage.local.get(['stats']);
        const stats = result.stats || { cardsProcessed: 0, linksGenerated: 0 };
        
        if (type === 'cardsProcessed') {
            stats.cardsProcessed += increment;
        } else if (type === 'linksGenerated') {
            stats.linksGenerated += increment;
        }
        
        await chrome.storage.local.set({ stats: stats });
    } catch (error) {
        console.error('Error nell\'aggiornamento statistiche:', error);
    }
}

// Separate processors now handle product pages
// Not servono more le chiamate multiple alle funzioni di patch

// Function for punteggiare e validare i results
function scoreAndValidateResults(results, titleInfo, originalTitle) {
    console.log(`🔍 [CardTrader] Validando ${results.length} results`);
    
    const scoredResults = results.map(result => {
        const name = result.name_en || result.pokemon_name || '';
        const collectorNumber = result.collector_number || '';
        const imageUrlLower = (result.image_url || '').toLowerCase();
        
        console.log(`🔍 [CardTrader] Analizzando card: "${name}" (${collectorNumber}) - URL: ${result.image_url}`);
        
        let score = 0;
        let reason = '';
        
        // PRIORITY 0: Special case for "Mew bubble" - maximum score
        if (result.speciale_case && result.blueprint_id === 274416) {
            console.log('🎯 [CardTrader] SPECIAL CASE: Mew bubble - maximum score');
            return { result, score: 99999, reason: 'Caso special Mew bubble - blueprint_id 274416' };
        }
        
        // PRIORITY 0.5: Special case for Terastal Festival SAR cards - maximum score
        if (result.speciale_case && result.source === 'sar_terastal_festival_speciale_case') {
            console.log('🎯 [CardTrader] SPECIAL CASE: Card SAR Terastal Festival - maximum score');
            return { result, score: 99998, reason: 'Caso special SAR Terastal Festival' };
        }
        
        // PRIORITY 0: Controllo IMMEDIATO for cards jumbo/oversized in URL
        const requiresJumbo = originalTitle.toLowerCase().includes('jumbo') || originalTitle.toLowerCase().includes('oversized') || originalTitle.toLowerCase().includes('oversize') || originalTitle.toLowerCase().includes('giant') || originalTitle.toLowerCase().includes('large');
        
        // ESCLUSIONE SPECIFICA: Blueprint 236583 (Card jumbo Lucario VSTAR 214)
        if (result.blueprint_id === 236583) {
            reason = `Blueprint 236583 (Card jumbo Lucario VSTAR 214) - ESCLUSA SPECIFICAMENTE`;
            console.log(`🚫 [CardTrader] Blueprint 236583 ESCLUSA SPECIFICAMENTE: "${result.name_en || result.pokemon_name}" (ID: ${result.blueprint_id})`);
            return { result, score: -9999, reason: reason.trim() };
        }
        
        // ESCLUSIONE SPECIFICA: Card jumbo Lucario VSTAR 214 (URL)
        if (imageUrlLower && imageUrlLower.includes('lucario-vstar-jumbo-oversized-214-swsh-black-star-promos')) {
            reason = `Card jumbo Lucario VSTAR 214 - ESCLUSA SPECIFICAMENTE`;
            console.log(`🚫 [CardTrader] Card jumbo Lucario VSTAR 214 ESCLUSA SPECIFICAMENTE: "${result.image_url}"`);
            return { result, score: -9999, reason: reason.trim() };
        }
        
        // If URL contains jumbo/oversized and it is not requested in title, EXCLUDE IMMEDIATELY
        if (imageUrlLower && !requiresJumbo && (imageUrlLower.includes('jumbo') || imageUrlLower.includes('oversized') || imageUrlLower.includes('oversize') || imageUrlLower.includes('giant') || imageUrlLower.includes('large'))) {
            reason = `Card jumbo/oversized in URL not richiesta - ESCLUSA COMPLETAMENTE`;
            console.log(`🚫 [CardTrader] Card jumbo/oversized ESCLUSA COMPLETAMENTE dall'URL: "${result.image_url}"`);
            return { result, score: -9999, reason: reason.trim() };
        }
        
        // PRIORITY 1: Exclude other generic products (Gift Box, Binder, Album, etc.)
        const genericProducts = [
            'gift box', 'gift-box', 'giftbox',
            'binder', 'album', 'folder',
            'deck box', 'deck-box', 'deckbox',
            'sleeves', 'sleeve',
            'playmat', 'play-mat', 'play mat',
            'dice', 'die',
            'coin', 'coins',
            'box set', 'box-set', 'boxset',
            'tin', 'tins',
            'collection', 'collections',
            'bundle', 'bundles',
            'booster box', 'booster-box', 'boosterbox',
            'theme deck', 'theme-deck', 'themedeck',
            'starter deck', 'starter-deck', 'starterdeck',
            'preconstructed deck', 'preconstructed-deck',
            'promo box', 'promo-box', 'promobox',
            'elite trainer box', 'elite-trainer-box', 'elitetrainerbox',
            'etb', 'etbs'
        ];
        
        const nameAndUrlLower = (name + ' ' + imageUrlLower).toLowerCase();
        let isGenericProduct = false;
        
        // Check other generic products
        for (const generic of genericProducts) {
            if (nameAndUrlLower.includes(generic)) {
                score -= 2000; // MAX penalty for generic products
                reason += `Prodotto generico (${generic}) - ESCLUSO `;
                console.log(`❌ [CardTrader] Prodotto generico detected: "${generic}" in "${name}" -> -2000 points`);
                isGenericProduct = true;
                break;
            }
        }
        
        // If it is a generic product, skip all other validations
        if (isGenericProduct) {
            return { result, score, reason: reason.trim() };
        }
        
        // PRIORITY 1: Expansion (reduced weight when trainer name is present)
        let expansionScore = 0;
        let expansionReason = '';
        
        if (titleInfo.expansion && result.expansion_name_en) {
            const expansionSimilarity = calculateSimilarity(titleInfo.expansion.toLowerCase(), result.expansion_name_en.toLowerCase());
            if (expansionSimilarity >= 0.8) {
                expansionScore = titleInfo.trainerName ? 100 : 200; // Peso ridotto for trainer
                expansionReason = titleInfo.trainerName ? 'Correct expansion (peso ridotto for trainer) ' : 'Correct expansion ';
            } else if (expansionSimilarity >= 0.5) {
                expansionScore = titleInfo.trainerName ? 50 : 100; // Peso ridotto for trainer
                expansionReason = titleInfo.trainerName ? 'Similar expansion (peso ridotto for trainer) ' : 'Similar expansion ';
            } else {
                expansionScore = -20;
                expansionReason = 'Completely different expansion ';
            }
            
            // MAX PENALTY: Completely wrong expansion when collector number is present
            if (titleInfo.collectorNumber && expansionSimilarity < 0.3) {
                expansionScore -= 3000; // MAX penalty for wrong expansion with specific number
                expansionReason += 'Expansion SBAGLIATA with number specifico ';
                console.log(`❌ [CardTrader] Expansion SBAGLIATA with number specifico: "${titleInfo.expansion}" vs "${result.expansion_name_en}" -> -3000 points`);
            }
        } else if (titleInfo.expansion) {
            expansionScore = -20;
            expansionReason = 'Expansion missing in database ';
        }
        score += expansionScore;
        reason += expansionReason;
        
        // PRIORITY 2: Nome del Pokemon (peso massimo)
        const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
        const resultNameLower = name.toLowerCase();
        
        // Normalizza i names for il confronto (rimuovi spazi, points, hyphens)
        const normalizedPokemonName = pokemonNameLower.replace(/[\s.-]/g, '');
        const normalizedResultName = resultNameLower.replace(/[\s.-]/g, '');
        
        console.log(`🔍 [CardTrader] Confronto names: "${pokemonNameLower}" vs "${resultNameLower}"`);
        console.log(`🔍 [CardTrader] Normalizzati: "${normalizedPokemonName}" vs "${normalizedResultName}"`);
        
        if (normalizedResultName.includes(normalizedPokemonName) || 
            normalizedPokemonName.includes(normalizedResultName) ||
            resultNameLower.includes(pokemonNameLower) || 
            pokemonNameLower.includes(resultNameLower)) {
            score += 1000; // Max weight for il nome Pokemon
            reason += 'Pokemon name PERFECT ';
            console.log(`✅ [CardTrader] Match nome Pokemon: "${name}" -> +1000 points`);
        } else {
            score -= 2000; // Severe penalty if name does not match
            reason += 'Pokemon name WRONG ';
            console.log(`❌ [CardTrader] Nome Pokemon not match: "${name}" -> -2000 points`);
        }
        
        // BONUS: Nome Pokemon exact (senza altre parole)
        if (normalizedResultName === normalizedPokemonName) {
            score += 500; // Bonus extra for nome exact
            reason += 'Nome Pokemon ESATTO ';
            console.log(`🎯 [CardTrader] Nome Pokemon ESATTO: "${name}" -> +500 points`);
        }
        
        // PRIORITY 3: Collector number (MAX WEIGHT) - expansion prefix handling
        if (titleInfo.collectorNumber) {
            const requestedNumber = titleInfo.collectorNumber;
            const dbNumber = collectorNumber;
            
            console.log(`🔍 [CardTrader] Confronto numeri: Richiesto="${requestedNumber}" vs Database="${dbNumber}"`);
            
            // Controlla match exact
            if (dbNumber === requestedNumber) {
                score += 50000; // Peso MASSIMO for perfect number (aumentato da 5000 a 50000)
                reason += 'Collector number PERFECT (PRIORITY MASSIMA) ';
                console.log(`🎯 [CardTrader] Collector number PERFECT: "${dbNumber}" = "${requestedNumber}" -> +50000 points (PRIORITY MASSIMA)`);
            } 
            // Check if database number contains requested one (es: "SWSH291" contiene "291")
            else if (dbNumber.toLowerCase().includes(requestedNumber.toLowerCase())) {
                score += 40000; // Very high weight for number with prefix (aumentato da 4000 a 40000)
                reason += 'Collector number with prefix expansion ';
                console.log(`🎯 [CardTrader] Number with prefix: "${dbNumber}" includes "${requestedNumber}" -> +40000 points`);
            }
            // Check if requested number contains the database one (es: "291" in "SWSH291")
            else if (requestedNumber.toLowerCase().includes(dbNumber.toLowerCase())) {
                score += 30000; // High weight for match inverso (aumentato da 3000 a 30000)
                reason += 'Collector number match inverso ';
                console.log(`🎯 [CardTrader] Match inverso: "${requestedNumber}" includes "${dbNumber}" -> +30000 points`);
            }
            // Controlla variants comuni for cards promo
            else {
                // Extract only digits from both for comparison
                const requestedNumbers = requestedNumber.match(/\d+/g) || [];
                const dbNumbers = dbNumber.match(/\d+/g) || [];
                
                let numberMatch = false;
                for (const reqNum of requestedNumbers) {
                    for (const dbNum of dbNumbers) {
                        if (reqNum === dbNum) {
                            score += 20000; // High weight for match numerico (aumentato da 2000 a 20000)
                            reason += `Match numerico: ${reqNum} `;
                            console.log(`🎯 [CardTrader] Match numerico: "${reqNum}" found in "${dbNumber}" -> +20000 points`);
                            numberMatch = true;
                            break;
                        }
                    }
                    if (numberMatch) break;
                }
                
                if (!numberMatch) {
                    score -= 50000; // MAX penalty if number does not match (aumentata da -2000 a -50000)
                    reason += 'Collector number WRONG ';
                    console.log(`❌ [CardTrader] Collector number WRONG: "${dbNumber}" ≠ "${requestedNumber}" -> -50000 points`);
                }
            }
        } else {
            reason += 'Collector number not requested ';
        }
        
        // PRIORITY 4: Mandatory validation for trainer name (in card NAME)
        if (titleInfo.trainerName) {
            const trainerNameLower = titleInfo.trainerName.toLowerCase();
            const cardNameLower = name.toLowerCase();
            let trainerFound = false;
            
            // Search exact match in card name
            if (cardNameLower.includes(trainerNameLower)) {
                score += 500; // Bonus MASSIMO for trainer name presente
                reason += `Trainer ${titleInfo.trainerName} in CORRECT NAME `;
                console.log(`🎯 [CardTrader] Trainer ${titleInfo.trainerName} found in name: "${name}" -> +500 points`);
                trainerFound = true;
            } else {
                // Search common variants in card name
                const trainerVariants = [
                    trainerNameLower + 's', // erika -> erikas
                    trainerNameLower + '\'s', // erika -> erika's
                    trainerNameLower.replace('lt. ', 'lt'), // lt. surge -> ltsurge
                    trainerNameLower.replace('mr. ', 'mr'), // mr. mime -> mrmime
                ];
                
                for (const variant of trainerVariants) {
                    if (cardNameLower.includes(variant)) {
                        score += 400; // High bonus for trainer-name variant
                        reason += `Trainer ${titleInfo.trainerName} (variant ${variant}) in CORRECT NAME `;
                        console.log(`🎯 [CardTrader] Trainer ${titleInfo.trainerName} (variant ${variant}) found in name: "${name}" -> +400 points`);
                        trainerFound = true;
                        break;
                    }
                }
            }
            
            if (!trainerFound) {
                score -= 800; // MAX penalty for missing trainer name
                reason += `Trainer ${titleInfo.trainerName} requested but missing in NAME `;
                console.log(`❌ [CardTrader] Trainer ${titleInfo.trainerName} requested but not found in name: "${name}" -> -800 points`);
            }
        }
        
        // PRIORITY 5: Validazione obbligatoria for Holo
        if (originalTitle.toLowerCase().includes('holo') && imageUrlLower && !imageUrlLower.includes('holo')) {
            score -= 500; // MAX penalty for missing Holo
            reason += 'Holo requested but missing in URL ';
            console.log(`❌ [CardTrader] Holo requested but not found in: "${result.image_url}" -> -500 points`);
        } else if (originalTitle.toLowerCase().includes('holo') && imageUrlLower && imageUrlLower.includes('holo')) {
            score += 300; // Bonus MASSIMO for Holo presente
            reason += 'Holo nell\'URL CORRETTO ';
            console.log(`🎯 [CardTrader] Holo found in: "${result.image_url}" -> +300 points`);
        }
        
        // Special handling for "star" - only if not "black star promo"
        const titleLower = originalTitle.toLowerCase();
        if (titleLower.includes(' star ') && !titleLower.includes('black star promo') && !titleLower.includes('gold star')) {
            if (imageUrlLower && !imageUrlLower.includes('star')) {
                score -= 500; // MAX penalty for missing Star
                reason += 'Star requested but missing in URL ';
                console.log(`❌ [CardTrader] Star requested but not found in: "${result.image_url}" -> -500 points`);
            } else if (imageUrlLower && imageUrlLower.includes('star')) {
                score += 300; // Bonus MASSIMO for Star presente
                reason += 'Star nell\'URL CORRETTO ';
                console.log(`🎯 [CardTrader] Star found in: "${result.image_url}" -> +300 points`);
            }
        }
        
        // PRIORITY ALTA: Validazione e bonus for tipi di cards special (VSTAR, EX, GX, VMAX, V, etc.)
        const cardTypeConfigs = [
            { title: ' ex ', url: 'ex', name: 'EX', bonus: 1500 },
            { title: ' v ', url: 'v', name: 'V', bonus: 1200 },
            { title: ' vmax ', url: 'vmax', name: 'VMAX', bonus: 1500 },
            { title: ' vstar ', url: 'vstar', name: 'VSTAR', bonus: 1500 },
            { title: ' gx ', url: 'gx', name: 'GX', bonus: 1500 },
            { title: ' break ', url: 'break', name: 'BREAK', bonus: 1000 },
            { title: ' prime ', url: 'prime', name: 'Prime', bonus: 1000 },
            { title: ' lv.x ', url: 'lv.x', name: 'LV.X', bonus: 1000 },
            { title: ' lvx ', url: 'lvx', name: 'LVX', bonus: 1000 },
            { title: ' delta ', url: 'delta', name: 'Delta', bonus: 800 },
            { title: ' crystal ', url: 'crystal', name: 'Crystal', bonus: 800 },
            { title: ' shining ', url: 'shining', name: 'Shining', bonus: 800 },
            { title: ' gold star ', url: 'gold-star', name: 'Gold Star', bonus: 1000 },
            { title: ' goldstar ', url: 'goldstar', name: 'Gold Star', bonus: 1000 }
        ];
        
        // Controlla se il title contiene keyword di tipo card
        let keywordFound = false;
        for (const cardType of cardTypeConfigs) {
            if (titleLower.includes(cardType.title)) {
                keywordFound = true;
                
                // Check whether keyword is present in card name
                const cardNameLower = name.toLowerCase();
                if (cardNameLower.includes(cardType.url)) {
                    // BONUS MASSIMO: Keyword present in both title and card name
                    score += cardType.bonus;
                    reason += `${cardType.name} in CORRECT NAME (PRIORITY ALTA) `;
                    console.log(`🎯 [CardTrader] ${cardType.name} found in name: "${name}" -> +${cardType.bonus} points (PRIORITY ALTA)`);
                } else {
                    // Penalty: keyword in title but not in card name
                    score -= 2000; // Penalty increased from -1000 to -2000
                    reason += `${cardType.name} requested but missing in NAME `;
                    console.log(`❌ [CardTrader] ${cardType.name} requested but not found in name: "${name}" -> -2000 points`);
                }
                
                // Also check image URL for additional confirmation
                if (imageUrlLower && imageUrlLower.includes(cardType.url)) {
                    score += 2000; // Bonus MASSIMO for conferma URL in URL (era 500)
                    reason += `${cardType.name} confermato in URL (PRIORITY ALTA) `;
                    console.log(`🎯 [CardTrader] ${cardType.name} confermato in URL: "${result.image_url}" -> +2000 points (PRIORITY ALTA)`);
                    
                    // BONUS EXTRA: Keyword perfettamente posizionata in URL
                    const pokemonNameLower = titleInfo.pokemonName.toLowerCase();
                    if (imageUrlLower.includes(pokemonNameLower + '-' + cardType.url) || 
                        imageUrlLower.includes(cardType.url + '-' + pokemonNameLower)) {
                        score += 1000; // Bonus extra for posizione perfetta
                        reason += `${cardType.name} posizione perfetta in URL `;
                        console.log(`🎯 [CardTrader] ${cardType.name} posizione perfetta in URL: "${result.image_url}" -> +1000 points extra`);
                    }
                } else if (imageUrlLower && !imageUrlLower.includes(cardType.url)) {
                    score -= 2000; // MAX penalty for missing URL confirmation (era -1000)
                    reason += `${cardType.name} not confermato in URL `;
                    console.log(`⚠️ [CardTrader] ${cardType.name} not confermato in URL: "${result.image_url}" -> -2000 points`);
                }
                
                break; // Use only the first found keyword to avoid conflicts
            }
        }
        
        // If no keyword is found in title, do not apply penalty
        if (!keywordFound) {
            reason += 'No keyword di tipo card richiesta ';
        }
        
        // PENALITÀ: Wrong keywords in card name when not requested
        if (keywordFound) {
            const cardNameLower = name.toLowerCase();
            for (const cardType of cardTypeConfigs) {
                if (cardNameLower.includes(cardType.url) && !titleLower.includes(cardType.title)) {
                    score -= 3000; // Penalty increased for wrong keyword (era -1500)
                    reason += `${cardType.name} present but not requested `;
                    console.log(`❌ [CardTrader] ${cardType.name} present but not requested: "${name}" -> -3000 points`);
                }
            }
        }
        
        // MAX PENALTY: promo/LV cards when VSTAR/V/EX card is requested
        if (keywordFound) {
            const cardNameLower = name.toLowerCase();
            const titleLower = originalTitle.toLowerCase();
            
            // If title requires VSTAR/V/EX but card is LV/promo
            if ((titleLower.includes(' vstar ') || titleLower.includes(' v ') || titleLower.includes(' ex ')) && 
                (cardNameLower.includes('lv') || cardNameLower.includes('promo') || cardNameLower.includes('ar'))) {
                score -= 5000; // MAX penalty for completely wrong card type
                reason += 'Card LV/promo when VSTAR/V/EX is requested ';
                console.log(`❌ [CardTrader] Card LV/promo when requested VSTAR/V/EX: "${name}" -> -5000 points`);
            }
            
            // If title requires LV/promo but card is VSTAR/V/EX
            if ((titleLower.includes(' lv ') || titleLower.includes(' promo ') || titleLower.includes(' ar ')) && 
                (cardNameLower.includes('vstar') || cardNameLower.includes('v') || cardNameLower.includes('ex'))) {
                score -= 5000; // MAX penalty for completely wrong card type
                reason += 'Card VSTAR/V/EX when LV/promo is requested ';
                console.log(`❌ [CardTrader] Card VSTAR/V/EX when requested LV/promo: "${name}" -> -5000 points`);
            }
        }
        
        // MAX PENALTY: Promo cards when not specifically requested and a collector number exists
        if (titleInfo.collectorNumber && !originalTitle.toLowerCase().includes('promo') && !originalTitle.toLowerCase().includes('ar')) {
            const cardNameLower = name.toLowerCase();
            const imageUrlLower = (result.image_url || '').toLowerCase();
            
            // If card is a promo (in name or URL) but not requested
            if (cardNameLower.includes('promo') || imageUrlLower.includes('promo') || imageUrlLower.includes('black-star-promos')) {
                score -= 30000; // MAX penalty for unrequested promo card with specific number
                reason += 'Card promo not richiesta with number specifico ';
                console.log(`❌ [CardTrader] Card promo not richiesta with number specifico: "${name}" -> -30000 points`);
            }
        }
        
        // MAX PENALTY: Promo cards in URL when not requested
        if (imageUrlLower) {
            const titleLower = originalTitle.toLowerCase();
            
            // Se il title NON richiede promo ma l'URL contiene promo
            if (!titleLower.includes(' promo ') && !titleLower.includes(' ar ') && 
                (imageUrlLower.includes('ar') || imageUrlLower.includes('promo'))) {
                score -= 4000; // MAX penalty for unrequested promo in URL
                reason += 'Card promo nell\'URL not richiesta ';
                console.log(`❌ [CardTrader] Card promo in URL not richiesta: "${result.image_url}" -> -4000 points`);
            }
            
            // Se il title richiede VSTAR ma l'URL contiene LV/promo
            if (titleLower.includes(' vstar ') && 
                (imageUrlLower.includes('lv') || imageUrlLower.includes('ar') || imageUrlLower.includes('promo'))) {
                score -= 6000; // MAX penalty for LV/promo in URL when VSTAR requested
                reason += 'LV/promo nell\'URL when requested VSTAR ';
                console.log(`❌ [CardTrader] LV/promo in URL when requested VSTAR: "${result.image_url}" -> -6000 points`);
            }
            
            // BONUS: Se l'URL contiene sia la keyword richiesta che "promos" (cards promo normali)
            if (keywordFound && imageUrlLower.includes('promos') && imageUrlLower.includes('black-star-promos')) {
                score += 500; // Bonus for card promo normale with keyword corretta
                reason += 'Card promo normale with keyword corretta ';
                console.log(`🎯 [CardTrader] Card promo normale with keyword corretta: "${result.image_url}" -> +500 points`);
            }
        }
        

        
        // Bonus for exact number match
        if (result.exact_number_match) {
            score += 500; // Bonus extra for match exact
            reason += 'Exact number match ';
            console.log(`🎯 [CardTrader] BONUS MATCH ESATTO: +500 points`);
        }
        
        // BONUS COMBINATO: Number perfetto + Keyword corretta (PRIORITY MASSIMA)
        if (titleInfo.collectorNumber && collectorNumber === titleInfo.collectorNumber && keywordFound) {
            score += 2000; // Bonus MASSIMO for combinazione perfetta
            reason += 'COMBINAZIONE PERFETTA: Number + Keyword (PRIORITY MASSIMA) ';
            console.log(`🎯 [CardTrader] BONUS COMBINATO PERFETTO: Number "${collectorNumber}" + Keyword -> +2000 points (PRIORITY MASSIMA)`);
        }
        
        // BONUS SPECIALE: Cards promo with number in URL (es: lucario-vstar-swsh291-swsh-black-star-promos)
        if (titleInfo.collectorNumber && imageUrlLower) {
            const requestedNumber = titleInfo.collectorNumber.toLowerCase();
            const urlNumberMatch = imageUrlLower.includes(requestedNumber);
            
            if (urlNumberMatch) {
                score += 1500; // High bonus for number in URL
                reason += 'Number confermato nell\'URL (PROMO) ';
                console.log(`🎯 [CardTrader] Number "${requestedNumber}" confermato in URL: "${result.image_url}" -> +1500 points (PROMO)`);
            }
            
            // Also check variants with prefixes in URL
            const expansionPrefixes = ['swsh', 'sv', 'sm', 'xy', 'bw', 'dp'];
            for (const prefix of expansionPrefixes) {
                const prefixedNumber = prefix + requestedNumber;
                if (imageUrlLower.includes(prefixedNumber)) {
                    score += 1000; // Bonus for prefix in URL
                    reason += `Prefisso ${prefix.toUpperCase()} confermato in URL `;
                    console.log(`🎯 [CardTrader] Prefisso "${prefixedNumber}" confermato in URL -> +1000 points`);
                    break;
                }
            }
        }

        // BONUS FUZZY MATCH: If this is a fuzzy-match result, add a bonus
        if (result.fuzzy_match) {
            score += 2000; // Bonus for fuzzy match
            reason += 'Fuzzy match (correzione error digitazione) ';
            console.log(`🎯 [CardTrader] Fuzzy match detected -> +2000 points`);
        }
        
        // Bonus for high priority
        if (result.priority === 'high') {
            score += 300; // Bonus for high priority
            reason += 'High priority ';
            console.log(`🎯 [CardTrader] BONUS PRIORITY ALTA: +300 points`);
        }
        
        // PRIORITY SPECIALE: Bonus for Fezandipiti ex blueprint 294979
        if (titleInfo.pokemonName && titleInfo.pokemonName.toLowerCase().includes('fezandipiti') && 
            result.blueprint_id === 294979) {
            score += 5000; // Bonus MASSIMO for il blueprint specifico
            reason += 'Fezandipiti ex blueprint 294979 (PRIORITY SPECIALE) ';
            console.log(`🎯 [CardTrader] BONUS FEZANDIPITI EX BLUEPRINT 294979: +5000 points`);
        }
        
        // SPECIAL BONUS: VSTAR cards when specifically requested
        if (titleInfo.pokemonName && originalTitle.toLowerCase().includes(' vstar ') && 
            name.toLowerCase().includes('vstar')) {
            score += 3000; // High bonus for requested and found VSTAR
            reason += 'VSTAR requested and found (SPECIAL BONUS) ';
            console.log(`🎯 [CardTrader] BONUS VSTAR RICHIESTO E TROVATO: "${name}" -> +3000 points`);
        }
        
        console.log(`📊 [CardTrader] Score finale for "${name}": ${score} - Reason: ${reason.trim()}`);
        return { result, score, reason: reason.trim() };
    });
    
    // Sort by score
    scoredResults.sort((a, b) => b.score - a.score);
    
    // Filtra results with punteggi troppo bassi e prodotti generici
    const goodResults = scoredResults.filter(item => {
        // ESCLUSIONE SPECIFICA: Blueprint 236583 (Card jumbo Lucario VSTAR 214)
        if (item.result.blueprint_id === 236583) {
            console.log(`🚫 [CardTrader] Blueprint 236583 SPECIFICALLY EXCLUDED from final filter: "${item.result.name_en || item.result.pokemon_name}" (ID: ${item.result.blueprint_id})`);
            return false;
        }
        
        // ESCLUSIONE SPECIFICA: Card jumbo Lucario VSTAR 214 (URL)
        const imageUrl = (item.result.image_url || '').toLowerCase();
        if (imageUrl.includes('lucario-vstar-jumbo-oversized-214-swsh-black-star-promos')) {
            console.log(`🚫 [CardTrader] Jumbo card Lucario VSTAR 214 SPECIFICALLY EXCLUDED from final filter: "${item.result.image_url}"`);
            return false;
        }
        
        // Controllo ESPLICITO for cards jumbo/oversized in URL
        const requiresJumbo = originalTitle.toLowerCase().includes('jumbo') || originalTitle.toLowerCase().includes('oversized') || originalTitle.toLowerCase().includes('oversize') || originalTitle.toLowerCase().includes('giant') || originalTitle.toLowerCase().includes('large');
        
        if (imageUrl && !requiresJumbo && (imageUrl.includes('jumbo') || imageUrl.includes('oversized') || imageUrl.includes('oversize') || imageUrl.includes('giant') || imageUrl.includes('large'))) {
            console.log(`🚫 [CardTrader] Jumbo/oversized card EXCLUDED from final filter: "${item.result.image_url}"`);
            return false;
        }
        
        // Escludi prodotti generici completamente
        const nameAndUrl = (item.result.name_en || item.result.pokemon_name || '') + ' ' + (item.result.image_url || '');
        const nameAndUrlLower = nameAndUrl.toLowerCase();
        
        const genericProducts = [
            'gift box', 'gift-box', 'giftbox',
            'binder', 'album', 'folder',
            'deck box', 'deck-box', 'deckbox',
            'sleeves', 'sleeve',
            'playmat', 'play-mat', 'play mat',
            'dice', 'die',
            'coin', 'coins',
            'box set', 'box-set', 'boxset',
            'tin', 'tins',
            'collection', 'collections',
            'bundle', 'bundles',
            'booster box', 'booster-box', 'boosterbox',
            'theme deck', 'theme-deck', 'themedeck',
            'starter deck', 'starter-deck', 'starterdeck',
            'preconstructed deck', 'preconstructed-deck',
            'promo box', 'promo-box', 'promobox',
            'elite trainer box', 'elite-trainer-box', 'elitetrainerbox',
            'etb', 'etbs'
        ];
        
        for (const generic of genericProducts) {
            if (nameAndUrlLower.includes(generic)) {
                console.log(`🚫 [CardTrader] Excluded generic product: "${generic}" in "${item.result.name_en || item.result.pokemon_name}"`);
                return false;
            }
        }
        
        return item.score > -100;
    });
    
    console.log(`✅ [CardTrader] Results finali: ${goodResults.length} cards with punteggi valid`);
    
    // Se not ci sono results buoni ma ci sono results disponibili, show almeno il migliore
    if (goodResults.length === 0 && scoredResults.length > 0) {
        console.log(`⚠️ [CardTrader] No result perfetto, mostro il migliore available`);
        
        // Take result with highest score (even if negative)
        const bestAvailable = scoredResults[0];
        console.log(`🏆 [CardTrader] Migliore available: ${bestAvailable.result.name_en || bestAvailable.result.pokemon_name} - Score: ${bestAvailable.score} - Reason: ${bestAvailable.reason}`);
        
        return [bestAvailable.result];
    }
    
    // Log dei primi 3 results for debug
    goodResults.slice(0, 3).forEach((item, index) => {
        console.log(`🏆 [CardTrader] Result ${index + 1}: ${item.result.name_en || item.result.pokemon_name} - Score: ${item.score} - Reason: ${item.reason}`);
    });
    
    return goodResults.map(item => item.result);
}

// Rendi le funzioni esistenti disponibili globalmente for il Singleton
window.processListing = processListing;
window.findListings = findListings;
window.extractTitleInfo = extractTitleInfo;
window.searchCardInDatabase = searchCardInDatabase;
window.generateCardTraderLink = generateCardTraderLink;
window.patchVintedProductPage = patchVintedProductPage;
window.patchEbayProductPage = patchEbayProductPage;
window.patchCardmarketProductPage = patchCardmarketProductPage;

watchMarketplaceNavigationForSidePanel();

// Singleton creation - this guarantees a single instance of extension
pokemonCardTraderInstance = new PokemonCardTraderLinker();