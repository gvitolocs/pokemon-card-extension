// Background script per l'estensione Pokemon Card Trader Linker
let stats = {
    cardsProcessed: 0,
    linksGenerated: 0,
    lastUpdate: Date.now()
};

// Funzione per aggiornare l'icona dell'estensione
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
        console.log('✅ Icona aggiornata:', iconPath);
    } catch (error) {
        console.log('⚠️ Impossibile aggiornare icona, usando icona di default');
        // Non fare nulla, lascia l'icona di default
    }
}

// Funzione per aggiornare le statistiche
async function updateStats(type, increment = 1) {
    if (type === 'cardsProcessed') {
        stats.cardsProcessed += increment;
    } else if (type === 'linksGenerated') {
        stats.linksGenerated += increment;
    }
    stats.lastUpdate = Date.now();
    
    // Salva le statistiche in storage
    try {
        await chrome.storage.local.set({ stats });
    } catch (error) {
        console.log('⚠️ Errore nel salvataggio statistiche:', error);
    }
}

// Gestione messaggi dal content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 [Background] Messaggio ricevuto:', request);
    
    if (request.action === 'updateIcon') {
        console.log('🎨 [Background] Aggiornamento icona a:', request.status);
        updateIcon(request.status);
        sendResponse({ success: true });
    } else if (request.action === 'updateStats') {
        updateStats(request.type, request.increment);
        sendResponse({ success: true });
    } else if (request.action === 'getStats') {
        sendResponse({ stats });
    } else if (request.action === 'toggleExtension') {
        // Implementa la logica per attivare/disattivare l'estensione
        sendResponse({ success: true });
    }
    return true; // Mantieni il canale aperto per risposte asincrone
});

// Inizializzazione
chrome.runtime.onInstalled.addListener(() => {
    console.log('🃏 Pokemon Card Trader Linker - Estensione installata');
    updateIcon('default');
});

// Gestione errori di connessione
chrome.runtime.onStartup.addListener(() => {
    console.log('🃏 Pokemon Card Trader Linker - Estensione avviata');
    updateIcon('default');
}); 