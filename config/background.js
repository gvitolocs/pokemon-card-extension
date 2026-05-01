// Background script for Pokemon Card Trader Linker
let stats = {
    cardsProcessed: 0,
    linksGenerated: 0,
    lastUpdate: Date.now()
};

// Update extension icon
async function updateIcon(status) {
    try {
        let iconPath;
        switch (status) {
            case 'connected':
                iconPath = 'icon-green.png';
                break;
            case 'error':
                iconPath = 'icon-red.png';
                break;
            default:
                iconPath = 'icon-default.png';
                break;
        }
        
        await chrome.action.setIcon({ path: iconPath });
        console.log('✅ Icon updated:', iconPath);
    } catch (error) {
        console.log('⚠️ Unable to update icon, keeping default icon');
        // No-op: keep default icon
    }
}

// Update extension statistics
async function updateStats(type, increment = 1) {
    if (type === 'cardsProcessed') {
        stats.cardsProcessed += increment;
    } else if (type === 'linksGenerated') {
        stats.linksGenerated += increment;
    }
    stats.lastUpdate = Date.now();
    
    // Save stats in storage
    try {
        await chrome.storage.local.set({ stats });
    } catch (error) {
        console.log('⚠️ Error while saving stats:', error);
    }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 [Background] Message received:', request);
    
    if (request.action === 'updateIcon') {
        console.log('🎨 [Background] Updating icon to:', request.status);
        updateIcon(request.status);
        sendResponse({ success: true });
    } else if (request.action === 'updateStats') {
        updateStats(request.type, request.increment);
        sendResponse({ success: true });
    } else if (request.action === 'getStats') {
        sendResponse({ stats });
    } else if (request.action === 'toggleExtension') {
        // Implement extension enable/disable logic
        sendResponse({ success: true });
    }
    return true; // Keep channel open for async responses
});

// Initialization
chrome.runtime.onInstalled.addListener(() => {
    console.log('🃏 Pokemon Card Trader Linker - Extension installed');
    updateIcon('default');
});

// Startup hook
chrome.runtime.onStartup.addListener(() => {
    console.log('🃏 Pokemon Card Trader Linker - Extension started');
    updateIcon('default');
}); 