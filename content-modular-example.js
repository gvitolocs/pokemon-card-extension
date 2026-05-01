/**
 * content-modular-example.js - Esempio di content.js modulare
 * Shows how to use created modules to organize code
 */

// Initialize modules
const extensionCore = new ExtensionCore();
const cacheManager = new CacheManager();
const buttonManager = new ButtonManager();
const titleExtractor = new TitleExtractor();
const urlGenerator = new UrlGenerator();

// Global button created only once at startup (outside all loops)
let globalButton = null;

// Initialize global variables if they do not exist
if (typeof window.supabaseClient === 'undefined') {
    window.supabaseClient = null;
}

// Create the global button only once (outside all loops)
globalButton = buttonManager.createGlobalButton();

// Event listeners for module communication
document.addEventListener('cardtrader-dom-ready', () => {
    console.log('⚡ [CardTrader] DOM loaded, restarting observer...');
    startObserver();
});

document.addEventListener('cardtrader-check-periodic', () => {
    console.log('⚡ [CardTrader] Periodic check - starting observer...');
    startObserver();
});

document.addEventListener('cardtrader-force-start', () => {
    console.log('⚡ [CardTrader] Final forced observer start...');
    startObserver();
});

document.addEventListener('cardtrader-url-changed', (event) => {
    console.log('🔄 [CardTrader] URL changed, clearing states...');
    cacheManager.clearAllCaches();
    cacheManager.clearProcessingAttributes();
    
    // Restart observer after a short delay
    setTimeout(() => {
        startObserver();
    }, 500);
});

// Initialize the extension
async function initializeExtension() {
    try {
        console.log('🃏 Pokemon Card Trader Linker - Fast initialization...');
        
        // Initialize core
        await extensionCore.initialize();
        
        // Configure URL change handler
        extensionCore.setupUrlChangeHandler();
        
        // Start the observer immediately for fast insertion
        startObserver();
        
        console.log('✅ Extension initialized quickly');
        
    } catch (error) {
        console.error('❌ Error nell\'initialization:', error);
        startObserver();
    }
}

// Ultra-fast initialization that runs immediately
function initializeUltraFast() {
    console.log('⚡ [CardTrader] Initialization ultra-rapida...');
    
    // Clear successful matches when the page changes
    cacheManager.clearSuccessfulMatches();
    
    // Start observer immediately
    startObserver();
    
    // If the DOM is still loading, restart when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('⚡ [CardTrader] DOM loaded, restarting observer...');
            document.dispatchEvent(new CustomEvent('cardtrader-dom-ready'));
        });
    }
    
    // Backup: check every 50ms for new elements
    const checkInterval = setInterval(() => {
        if (document.body) {
            console.log('⚡ [CardTrader] Periodic check - starting observer...');
            document.dispatchEvent(new CustomEvent('cardtrader-check-periodic'));
        }
        
        // Stop checking after 5 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
        }, 5000);
    }, 50);
    
    // Final backup: if it has not started after 200ms, force start
    setTimeout(() => {
        console.log('⚡ [CardTrader] Final forced observer start...');
        document.dispatchEvent(new CustomEvent('cardtrader-force-start'));
    }, 200);
}

// Start observer to detect new listings with immediate insertion
function startObserver() {
    try {
        console.log('🔍 [CardTrader] Starting observer with immediate insertion...');
        
        // Immediate insertion for already present elements
        processExistingListingsImmediate();
        
        const observer = new MutationObserver((mutations) => {
            if (!extensionCore.isExtensionEnabled()) return;
            
            let hasNewListings = false;
            let pendingListings = [];
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const listings = findListingsInContainer(node);
                            if (listings.length > 0) {
                                hasNewListings = true;
                                pendingListings.push(...listings);
                            }
                        }
                    });
                }
            });
            
            if (hasNewListings) {
                // Processing immediato for nuovi elementi
                console.log(`⚡ [CardTrader] Immediate processing of ${pendingListings.length} new listings`);
                
                // Process only the first 3 elements immediately to avoid overload
                const immediateListings = pendingListings.slice(0, 3);
                immediateListings.forEach(listing => {
                    processListingImmediate(listing);
                });
                
                // Debounce for subsequent processing
                cacheManager.setDebounceTimer(() => {
                    console.log(`🔄 [CardTrader] Subsequent processing of ${pendingListings.length} listings`);
                    
                    // Process in batches to improve performance
                    const batchSize = 3;
                    for (let i = 0; i < pendingListings.length; i += batchSize) {
                        const batch = pendingListings.slice(i, i + batchSize);
                        setTimeout(() => {
                            batch.forEach(listing => {
                                // Check whether we already have a successful match for this element
                                const title = titleExtractor.extractTitleFromListing(listing);
                                if (title) {
                                    const cacheKey = titleExtractor.generateCacheKey(title);
                                    if (!cacheManager.hasSuccessfulMatch(cacheKey)) {
                                        processListing(listing);
                                    }
                                }
                            });
                        }, i * 50);
                    }
                }, 100);
            }
        });
        
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Periodic check for existing elements
            setInterval(() => {
                if (extensionCore.isExtensionEnabled() && !extensionCore.isExtensionProcessing()) {
                    processExistingListings();
                }
            }, 5000);
            
            console.log('✅ [CardTrader] Observer with immediate insertion started');
        } else {
            console.warn('⚠️ [CardTrader] Document.body not available, retrying in 500ms');
            setTimeout(startObserver, 500);
        }
    } catch (error) {
        console.error('❌ [CardTrader] Error while starting observer:', error);
    }
}

// Immediate processing of existing listings
function processExistingListingsImmediate() {
    if (!extensionCore.isExtensionEnabled()) return;
    
    console.log('⚡ [CardTrader] Immediate processing of existing listings...');
    
    const listings = findListings();
    console.log(`⚡ [CardTrader] Found ${listings.length} listings for processing immediato`);
    
    // Immediately process only the first 5 elements
    const immediateListings = listings.slice(0, 5);
    immediateListings.forEach(listing => {
        processListingImmediate(listing);
    });
    
    // Process the rest with a longer delay
    if (listings.length > 5) {
        setTimeout(() => {
            const remainingListings = listings.slice(5);
            remainingListings.forEach(listing => {
                // Check whether we already have a successful match for this element
                const title = titleExtractor.extractTitleFromListing(listing);
                if (title) {
                    const cacheKey = titleExtractor.generateCacheKey(title);
                    if (!cacheManager.hasSuccessfulMatch(cacheKey)) {
                        processListing(listing);
                    }
                }
            });
        }, 200);
    }
}

// Immediate processing of a single listing
function processListingImmediate(listingElement) {
    if (!extensionCore.isExtensionEnabled() || !listingElement || listingElement.hasAttribute('data-pokemon-linker-processed')) {
        return;
    }
    
    try {
        // Extract title immediately
        const title = titleExtractor.extractTitleFromListing(listingElement);
        if (!title || title.trim().length < 3) {
            return;
        }
        
        // Check whether we already have a successful match for this title
        const cacheKey = titleExtractor.generateCacheKey(title);
        if (cacheManager.hasSuccessfulMatch(cacheKey)) {
            console.log(`🚫 [CardTrader] Match already successful for: "${title}", skipping`);
            return;
        }
        
        // Create an immediate loading button (clone the global button)
        const loadingButton = globalButton.cloneNode(true);
        buttonManager.inserisciButton(listingElement, loadingButton);
        
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

// Get selectors for listings
function getListingSelectors() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('vinted')) {
        return [
            '[data-testid="item-card"]',
            '.feed-grid__item',
            '.web_ui__Card__body',
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
        return [
            '.product-title',
            '.col-12 .product-title'
        ];
    }
    
    return [];
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

// Process existing listings
function processExistingListings() {
    if (!extensionCore.isExtensionEnabled() || extensionCore.isExtensionProcessing()) return;
    
    const listings = findListings();
    console.log(`🔍 Found ${listings.length} listings to process`);
    
    // Limit number of listings processed for batch
    const limitedListings = listings.slice(0, 10);
    
    limitedListings.forEach(listing => {
        // Check whether we already have a successful match for this element
        const title = titleExtractor.extractTitleFromListing(listing);
        if (title) {
            const cacheKey = titleExtractor.generateCacheKey(title);
            if (!cacheManager.hasSuccessfulMatch(cacheKey)) {
                processListing(listing);
            }
        }
    });
}

// Process a single listing
async function processListing(listingElement) {
    if (!extensionCore.isExtensionEnabled() || extensionCore.isExtensionProcessing()) return;
    
    try {
        // ROBUST DUPLICATION CHECK
        const isAlreadyProcessed = 
            listingElement.hasAttribute('data-pokemon-linker-processed') ||
            cacheManager.isInObserverCache(listingElement) ||
            cacheManager.isInProcessingElements(listingElement);
        
        // Additional check to avoid recent multiple processing
        const lastProcessedTime = listingElement.getAttribute('data-pokemon-linker-last-processed');
        if (lastProcessedTime) {
            const timeSinceLastProcess = Date.now() - parseInt(lastProcessedTime);
            if (timeSinceLastProcess < 1000) {
                console.log(`🚫 [CardTrader] Element processed recently (${Math.round(timeSinceLastProcess)}ms ago), skipping`);
                return;
            }
        }
        
        if (isAlreadyProcessed) {
            console.log('🚫 [CardTrader] Element already processed (robust check), skipping');
            return;
        }
        
        // Mark IMMEDIATELY as processing to avoid duplicates
        cacheManager.addToProcessingElements(listingElement);
        listingElement.setAttribute('data-pokemon-linker-processing', 'true');
        
        // Extract title
        const title = titleExtractor.extractTitleFromListing(listingElement);
        if (!title || title.trim().length < 3) {
            console.log('🚫 [CardTrader] Title too short or empty, skipping');
            return;
        }
        
        // Check whether we already have a successful match for this title
        const cacheKey = titleExtractor.generateCacheKey(title);
        if (cacheManager.hasSuccessfulMatch(cacheKey)) {
            console.log(`🚫 [CardTrader] Match already successful for: "${title}", skipping`);
            return;
        }
        
        // Extract info from title
        const titleInfo = titleExtractor.extractTitleInfo(title);
        if (!titleInfo.pokemonName) {
            console.log('🚫 [CardTrader] No Pokemon found in title');
            return;
        }
        
        console.log(`🔍 [CardTrader] Processando: "${title}" -> ${titleInfo.pokemonName}`);
        
        // Create button with "CardTrader" (gray by default)
        const button = buttonManager.cloneButton();
        
        // Insert button immediately (gray)
        const inseriscied = buttonManager.inserisciButton(listingElement, button);
        
        if (inseriscied) {
            console.log(`✅ [CardTrader] Added CardTrader button (loading) for ${titleInfo.pokemonName}`);
            
            // Search in database
            console.log(`🔍 [CardTrader] Starting search for: "${title}"`);
            let results = await searchCardInDatabase(titleInfo, title);
            console.log(`🔍 [CardTrader] Results received:`, results);
            
            if (results && results.length > 0) {
                console.log(`✅ [CardTrader] Found ${results.length} results`);
                
                // Mark as successful match to avoid reprocessing
                cacheManager.addSuccessfulMatch(cacheKey);
                
                // Save in cache for future searches
                cacheManager.saveToCardCache(cacheKey, { results, titleInfo });
                
                const bestResult = results[0];
                
                // Set button to success
                buttonManager.setButtonSuccess(button, (e) => {
                    const cardTraderUrl = urlGenerator.generateCardTraderLink(bestResult.blueprint_id);
                    if (cardTraderUrl) {
                        urlGenerator.openLink(cardTraderUrl);
                    }
                });
                
            } else {
                console.log('❌ [CardTrader] No result found in database');
                
                // Check if Supabase is available
                if (typeof window.supabaseClient === 'undefined' || !window.supabaseClient) {
                    console.log('⚠️ [CardTrader] Supabase not available, button stays gray');
                    buttonManager.setButtonDisabled(button, 'CardTrader (DB offline)');
                } else {
                    buttonManager.setButtonDisabled(button);
                }
            }
        } else {
            console.log(`⚠️ [CardTrader] Unable to inserisci button for ${titleInfo.pokemonName}`);
        }
        
        // Marca come processed
        cacheManager.addToObserverCache(listingElement);
        listingElement.setAttribute('data-pokemon-linker-processed', 'true');
        listingElement.setAttribute('data-pokemon-linker-last-processed', Date.now().toString());
        
    } catch (error) {
        console.error('❌ [CardTrader] Error processing listing:', error);
    } finally {
        // Remove from list of elements being processed
        cacheManager.removeFromProcessingElements(listingElement);
        // Remove processing attribute
        listingElement.removeAttribute('data-pokemon-linker-processing');
    }
}

// Function to search in database (to be implemented)
async function searchCardInDatabase(titleInfo, originalTitle) {
    // Database search implementation
    // This function should be implemented in the DatabaseManager module
    console.log('🔍 [CardTrader] Database search for:', titleInfo.pokemonName);
    return [];
}

// Ultra-fast initialization for immediate insertion
initializeUltraFast();

// Full initialization in background
initializeExtension(); 