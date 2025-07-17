// Settings script per Pokemon Card Trader Linker
document.addEventListener('DOMContentLoaded', function() {
    const autoActivateToggle = document.getElementById('autoActivate');
    const notificationsToggle = document.getElementById('notifications');
    const newTabToggle = document.getElementById('newTab');
    const useAdvancedAPIToggle = document.getElementById('useAdvancedAPI');

    const pokemonKeywords = document.getElementById('pokemonKeywords');
    const apiToken = document.getElementById('apiToken');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');

    // Impostazioni di default
    const defaultSettings = {
        autoActivate: true,
        notifications: true,
        newTab: true,
        useAdvancedAPI: false,
        apiToken: '',

        pokemonKeywords: [
            'pokemon', 'pokémon', 'carta', 'card', 'tcg', 'trading card',
            'charizard', 'pikachu', 'blastoise', 'venusaur', 'mewtwo',
            'holo', 'reverse holo', 'full art', 'secret rare', 'ultra rare'
        ]
    };

    // Carica le impostazioni salvate
    function loadSettings() {
        chrome.storage.sync.get(defaultSettings, function(items) {
            if (autoActivateToggle) autoActivateToggle.classList.toggle('active', items.autoActivate);
            if (notificationsToggle) notificationsToggle.classList.toggle('active', items.notifications);
            if (newTabToggle) newTabToggle.classList.toggle('active', items.newTab);
            if (useAdvancedAPIToggle) useAdvancedAPIToggle.classList.toggle('active', items.useAdvancedAPI);

            if (pokemonKeywords) {
                pokemonKeywords.value = Array.isArray(items.pokemonKeywords) 
                    ? items.pokemonKeywords.join('\n') 
                    : items.pokemonKeywords;
            }
            
            if (apiToken) apiToken.value = items.apiToken || '';
        });
    }

    // Salva le impostazioni
    function saveSettings() {
        const settings = {
            autoActivate: autoActivateToggle && autoActivateToggle.classList.contains('active'),
            notifications: notificationsToggle && notificationsToggle.classList.contains('active'),
            newTab: newTabToggle && newTabToggle.classList.contains('active'),
            useAdvancedAPI: useAdvancedAPIToggle && useAdvancedAPIToggle.classList.contains('active'),
            apiToken: apiToken ? apiToken.value.trim() : '',

            pokemonKeywords: pokemonKeywords ? pokemonKeywords.value.split('\n').filter(keyword => keyword.trim() !== '') : []
        };

        chrome.storage.sync.set(settings, function() {
            showStatus('Impostazioni salvate con successo!', 'success');
            
            // Aggiorna le pagine attive
            chrome.tabs.query({}, function(tabs) {
                tabs.forEach(tab => {
                    if (tab.url && (tab.url.includes('ebay') || tab.url.includes('vinted'))) {
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'updateSettings',
                            settings: settings
                        });
                    }
                });
            });
        });
    }

    // Mostra messaggio di stato
    function showStatus(message, type) {
        status.textContent = message;
        status.className = `status ${type}`;
        status.style.display = 'block';
        
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    }

    // Gestione dei toggle
    if (autoActivateToggle) {
        autoActivateToggle.addEventListener('click', function() {
            this.classList.toggle('active');
        });
    }

    if (notificationsToggle) {
        notificationsToggle.addEventListener('click', function() {
            this.classList.toggle('active');
        });
    }

    if (newTabToggle) {
        newTabToggle.addEventListener('click', function() {
            this.classList.toggle('active');
        });
    }

    if (useAdvancedAPIToggle) {
        useAdvancedAPIToggle.addEventListener('click', function() {
            this.classList.toggle('active');
        });
    }

    // Salva quando si clicca il pulsante
    if (saveBtn) {
        saveBtn.addEventListener('click', saveSettings);
    }

    // Salva anche quando si preme Ctrl+S
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveSettings();
        }
    });

    // Carica le impostazioni all'avvio
    loadSettings();
}); 