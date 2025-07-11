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
            autoActivateToggle.classList.toggle('active', items.autoActivate);
            notificationsToggle.classList.toggle('active', items.notifications);
            newTabToggle.classList.toggle('active', items.newTab);
            useAdvancedAPIToggle.classList.toggle('active', items.useAdvancedAPI);

            pokemonKeywords.value = Array.isArray(items.pokemonKeywords) 
                ? items.pokemonKeywords.join('\n') 
                : items.pokemonKeywords;
            
            apiToken.value = items.apiToken || '';
        });
    }

    // Salva le impostazioni
    function saveSettings() {
        const settings = {
            autoActivate: autoActivateToggle.classList.contains('active'),
            notifications: notificationsToggle.classList.contains('active'),
            newTab: newTabToggle.classList.contains('active'),
            useAdvancedAPI: useAdvancedAPIToggle.classList.contains('active'),
            apiToken: apiToken.value.trim(),

            pokemonKeywords: pokemonKeywords.value.split('\n').filter(keyword => keyword.trim() !== '')
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
    autoActivateToggle.addEventListener('click', function() {
        this.classList.toggle('active');
    });

    notificationsToggle.addEventListener('click', function() {
        this.classList.toggle('active');
    });

    newTabToggle.addEventListener('click', function() {
        this.classList.toggle('active');
    });

    useAdvancedAPIToggle.addEventListener('click', function() {
        this.classList.toggle('active');
    });



    // Salva quando si clicca il pulsante
    saveBtn.addEventListener('click', saveSettings);

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