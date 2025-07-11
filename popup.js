// Popup script per Pokemon Card Trader Linker
document.addEventListener('DOMContentLoaded', function() {
    const statusElement = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    const refreshBtn = document.getElementById('refreshBtn');
    const toggleBtn = document.getElementById('toggleBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    // Controlla se siamo su un sito supportato
    function checkCurrentSite() {
        return new Promise((resolve) => {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const currentTab = tabs[0];
                const url = currentTab.url;
                
                if (url.includes('ebay.it') || url.includes('ebay.com') || 
                    url.includes('vinted.it') || url.includes('vinted.com')) {
                    resolve({
                        supported: true,
                        site: url.includes('ebay') ? 'eBay' : 'Vinted',
                        url: url
                    });
                } else {
                    resolve({
                        supported: false,
                        site: null,
                        url: url
                    });
                }
            });
        });
    }

    // Aggiorna lo stato del popup
    async function updateStatus() {
        const siteInfo = await checkCurrentSite();
        
        if (siteInfo.supported) {
            statusElement.className = 'status active';
            statusElement.innerHTML = `
                <span class="status-icon">✅</span>
                <span id="status-text">Attivo su ${siteInfo.site}</span>
            `;
        } else {
            statusElement.className = 'status inactive';
            statusElement.innerHTML = `
                <span class="status-icon">❌</span>
                <span id="status-text">Sito non supportato</span>
            `;
        }
    }

    // Ricarica la pagina corrente
    refreshBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.reload(tabs[0].id);
        });
    });

    // Toggle pausa/ripresa
    toggleBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'toggle'}, function(response) {
                if (response && response.paused !== undefined) {
                    if (response.paused) {
                        toggleBtn.textContent = '▶️ Riprendi';
                    } else {
                        toggleBtn.textContent = '⏸️ Pausa';
                    }
                }
            });
        });
    });

    // Apri impostazioni
    settingsBtn.addEventListener('click', function() {
        // Per ora, apri una nuova tab con le impostazioni
        chrome.tabs.create({
            url: chrome.runtime.getURL('settings.html')
        });
    });

    // Inizializza il popup
    updateStatus();

    // Aggiorna lo stato quando il popup viene aperto
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            updateStatus();
        }
    });
}); 