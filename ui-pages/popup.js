// Pokemon Notes - modern version with PokeAPI
let currentPageData = null;
let currentFilter = 'all';
let currentSearch = '';
const SUPPORTED_SITES = [
    'ebay.com', 'ebay.it', 'ebay.co.uk', 'ebay.de', 'ebay.fr', 'ebay.es',
    'vinted.com', 'vinted.it', 'vinted.fr', 'vinted.de', 'vinted.es',
    'vinted.pl', 'vinted.nl', 'vinted.be', 'vinted.at', 'vinted.lu',
    'cardmarket.com'
];
const pokemonSpriteCache = new Map();
let pokemonListPromise = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 [Popup] Initializing Pokemon notes...');
    
    // DOM elements
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Save URL
    const saveUrlSection = document.getElementById('saveUrlSection');
    const pageTitle = document.getElementById('pageTitle');
    const pageUrl = document.getElementById('pageUrl');
    const pageSite = document.getElementById('pageSite');
    const saveUrlBtn = document.getElementById('saveUrlBtn');
    
    // Manual add
    const manualCardInput = document.getElementById('manualCardInput');
    const manualCategorySelect = document.getElementById('manualCategorySelect');
    const manualAddBtn = document.getElementById('manualAddBtn');
    const manualCardInput2 = document.getElementById('manualCardInput2');
    const manualCategorySelect2 = document.getElementById('manualCategorySelect2');
    const manualAddBtn2 = document.getElementById('manualAddBtn2');
    
    // Collection
    const searchInput = document.getElementById('searchInput');
    const categoryButtons = document.querySelectorAll('.category-btn');
    const cardsList = document.getElementById('cardsList');
    const exportBtn = document.getElementById('exportBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    // Initialize
    initializeTabs();
    initializeCollection();
    loadCurrentPage();
    
    // Always load saved cards on startup
    loadCards();
    
    // Event listeners
    saveUrlBtn.addEventListener('click', saveCurrentPage);
    manualAddBtn.addEventListener('click', () => addManualCard(manualCardInput, manualCategorySelect));
    manualAddBtn2.addEventListener('click', () => addManualCard(manualCardInput2, manualCategorySelect2));
    exportBtn.addEventListener('click', exportCards);
    clearBtn.addEventListener('click', clearAllCards);
    searchInput.addEventListener('input', handleSearch);
    
    // Enter key per input manuali
    manualCardInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addManualCard(manualCardInput, manualCategorySelect);
    });
    manualCardInput2.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addManualCard(manualCardInput2, manualCategorySelect2);
    });
    
    // Initialize tabs
    function initializeTabs() {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');
                
                // Remove active class from all tabs
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(tc => tc.classList.remove('active'));
                
                // Add active class to clicked tab
                tab.classList.add('active');
                document.getElementById(`${targetTab}-tab`).classList.add('active');
                
                // Refresh list when entering collection tab
                if (targetTab === 'collection') {
                    loadCards();
                }
            });
        });
    }
    
    // Initialize collection
    function initializeCollection() {
        // Event listeners for category filters
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                categoryButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.getAttribute('data-category');
                loadCards();
            });
        });
        
        // Load cards
        loadCards();
    }
    
    // Load current page information
    async function loadCurrentPage() {
        try {
            console.log('🔍 [Popup] Loading current page information...');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                console.log('❌ [Popup] No active tab found');
                return;
            }
            
            const hostname = new URL(tab.url).hostname;
            const isSupported = SUPPORTED_SITES.some(site => hostname.includes(site));
            
            console.log(`🔍 [Popup] Hostname: ${hostname}, Supported: ${isSupported}`);
            
            if (!isSupported) {
                pageTitle.textContent = 'Unsupported site';
                pageUrl.textContent = tab.url;
                pageSite.innerHTML = '<i class="fas fa-external-link-alt"></i> Other site';
                saveUrlBtn.disabled = true;
                saveUrlBtn.classList.add('disabled');
                return;
            }
            
            // Ask content script for extracted page information
            const response = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tab.id, { 
                    action: 'autoSearchCurrentPage'
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.log(`❌ [Popup] Runtime error:`, chrome.runtime.lastError);
                        resolve(null);
                    } else {
                        console.log(`✅ [Popup] Response received`);
                        resolve(response);
                    }
                });
            });
            
            if (response && response.pageInfo) {
                const pageInfo = response.pageInfo;
                currentPageData = {
                    name: pageInfo.pageTitle || pageInfo.title || 'Current page',
                    info: `Page ${pageInfo.hostname}`,
                    listingUrl: pageInfo.url,
                    cardmarketUrl: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(pageInfo.pageTitle || pageInfo.title)}`
                };
                
                // Populate UI fields
                pageTitle.textContent = currentPageData.name;
                pageUrl.textContent = pageInfo.url;
                
                // Show site icon
                let siteName, siteIcon;
                if (hostname.includes('ebay')) {
                    siteName = 'eBay';
                    siteIcon = 'fas fa-shopping-cart';
                } else if (hostname.includes('vinted')) {
                    siteName = 'Vinted';
                    siteIcon = 'fas fa-tshirt';
                } else if (hostname.includes('cardmarket')) {
                    siteName = 'Cardmarket';
                    siteIcon = 'fas fa-cards-blank';
                } else {
                    siteName = 'Site';
                    siteIcon = 'fas fa-external-link-alt';
                }
                pageSite.innerHTML = `<i class="${siteIcon}"></i> ${siteName}`;
                
                // Check if current page is already saved
                const existingCard = checkIfPageExists(pageInfo.url);
                if (existingCard) {
                    showMessage(`Page already present in ${getCategoryName(existingCard.category)}`, 'info');
                    saveUrlBtn.innerHTML = '<i class="fas fa-check"></i> Already Saved';
                    saveUrlBtn.classList.add('disabled');
                    saveUrlBtn.disabled = true;
                } else {
                    saveUrlBtn.innerHTML = '<i class="fas fa-save"></i> Save URL';
                    saveUrlBtn.classList.remove('disabled');
                    saveUrlBtn.disabled = false;
                }
                
            } else {
                console.log('⚠️ [Popup] Content script did not respond, using fallback');
                // Fallback: use tab information directly
                currentPageData = {
                    name: tab.title || 'eBay page',
                    info: `Page ${hostname}`,
                    listingUrl: tab.url,
                    cardmarketUrl: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(tab.title || 'pokemon')}`
                };
                
                pageTitle.textContent = currentPageData.name;
                pageUrl.textContent = tab.url;
                
                // Show site icon
                let siteName, siteIcon;
                if (hostname.includes('ebay')) {
                    siteName = 'eBay';
                    siteIcon = 'fas fa-shopping-cart';
                } else if (hostname.includes('vinted')) {
                    siteName = 'Vinted';
                    siteIcon = 'fas fa-tshirt';
                } else if (hostname.includes('cardmarket')) {
                    siteName = 'Cardmarket';
                    siteIcon = 'fas fa-cards-blank';
                } else {
                    siteName = 'Site';
                    siteIcon = 'fas fa-external-link-alt';
                }
                pageSite.innerHTML = `<i class="${siteIcon}"></i> ${siteName}`;
                
                // Check if current page is already saved
                const existingCard = checkIfPageExists(tab.url);
                if (existingCard) {
                    showMessage(`Page already present in ${getCategoryName(existingCard.category)}`, 'info');
                    saveUrlBtn.innerHTML = '<i class="fas fa-check"></i> Already Saved';
                    saveUrlBtn.classList.add('disabled');
                    saveUrlBtn.disabled = true;
                } else {
                    saveUrlBtn.innerHTML = '<i class="fas fa-save"></i> Save URL';
                    saveUrlBtn.classList.remove('disabled');
                    saveUrlBtn.disabled = false;
                }
            }
            
        } catch (error) {
            console.log('❌ [Popup] Error while loading page:', error);
            pageTitle.textContent = 'Load error';
            pageUrl.textContent = 'Unable to load page information';
            pageSite.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
            saveUrlBtn.disabled = true;
            saveUrlBtn.classList.add('disabled');
        }
    }
    
    // Save current page
    function saveCurrentPage() {
        if (!currentPageData) {
            showMessage('No page to save', 'error');
            return;
        }
        
        const card = {
            name: currentPageData.name,
            info: currentPageData.info,
            listingUrl: currentPageData.listingUrl,
            cardmarketUrl: currentPageData.cardmarketUrl,
            category: 'viewed',
            date: new Date().toLocaleDateString('en-US')
        };
        
        saveCard(card);
        showSaveConfirmation();
        showMessage(`Page saved in ${getCategoryName(card.category)}`, 'success');
        
        // Update save button state
        saveUrlBtn.innerHTML = '<i class="fas fa-check"></i> Already Saved';
        saveUrlBtn.classList.add('disabled');
        saveUrlBtn.disabled = true;
    }
    
    // Add card manually
    async function addManualCard(inputElement, categoryElement) {
        const cardName = inputElement.value.trim();
        const category = categoryElement.value;
        
        if (!cardName) {
            showMessage('Enter a card name', 'error');
            return;
        }
        
        if (checkIfCardExists(cardName, 'Card added manually')) {
            showMessage('This card already exists', 'error');
            return;
        }
        
        const card = {
            name: cardName,
            info: 'Card added manually',
            listingUrl: '',
            cardmarketUrl: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(cardName)}`,
            category: category,
            date: new Date().toLocaleDateString('en-US')
        };
        
        saveCard(card);
        inputElement.value = '';
        showMessage(`Card added to ${getCategoryName(category)}`, 'success');
        loadCards();
    }
    
    // Handle search
    function handleSearch() {
        currentSearch = searchInput.value.toLowerCase();
        loadCards();
    }
    
    // Save a card
    function saveCard(card) {
        const cards = getCards();
        cards.unshift(card);
        localStorage.setItem('pokemonCardNotes', JSON.stringify(cards));
    }
    
    // Get all cards
    function getCards() {
        const cards = localStorage.getItem('pokemonCardNotes');
        return cards ? JSON.parse(cards) : [];
    }
    
    // Load and render cards
    async function loadCards() {
        console.log('📚 [Popup] Loading cards...');
        
        let cards = getCards();
        
        // Filter by category
        if (currentFilter !== 'all') {
            cards = cards.filter(card => card.category === currentFilter);
        }
        
        // Filter by search term
        if (currentSearch) {
            cards = cards.filter(card => 
                card.name.toLowerCase().includes(currentSearch) ||
                (card.info && card.info.toLowerCase().includes(currentSearch))
            );
        }
        
        console.log(`📚 [Popup] Found ${cards.length} cards after filters`);
        
        // Render cards
        if (cards.length === 0) {
            cardsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <div>No pages found</div>
                    <div>Try changing filter or search</div>
                </div>
            `;
        } else {
            const cardsHtml = await Promise.all(cards.map(async (card, index) => {
                const pokemonName = extractPokemonName(card.name);
                const spriteUrl = await getPokemonSprite(pokemonName);
                
                return `
                    <div class="card-item" data-index="${index}">
                        <div class="pokemon-sprite">
                            ${spriteUrl ? `<img src="${spriteUrl}" alt="${pokemonName}" />` : '<i class="fas fa-question"></i>'}
                        </div>
                        <div class="card-content">
                            <div class="card-header">
                                <div class="card-name" onclick="openCardUrl('${card.listingUrl || card.cardmarketUrl}')">${card.name}</div>
                                <div class="card-category">${getCategoryIcon(card.category)} ${getCategoryName(card.category)}</div>
                            </div>
                            ${card.info ? `<div class="card-info">${card.info}</div>` : ''}
                            <div class="card-date">${card.date}</div>
                        </div>
                    </div>
                `;
            }));
            
            cardsList.innerHTML = cardsHtml.join('');
            
            // Add event listeners to open URLs
            document.querySelectorAll('.card-item').forEach((item, index) => {
                item.addEventListener('click', (e) => {
                    // Skip because card name already has its own click handler
                    if (e.target.classList.contains('card-name')) return;
                    
                    const card = cards[index];
                    const url = card.listingUrl || card.cardmarketUrl;
                    if (url) {
                        chrome.tabs.create({ url: url });
                    }
                });
            });
        }
    }
    
    // Global helper to open card URLs
    window.openCardUrl = function(url) {
        if (url) {
            chrome.tabs.create({ url: url });
        }
    };
    
    // Extract Pokemon name from title
    function extractPokemonName(title) {
        // Extended list of common Pokemon names (with known variants)
        const pokemonNames = [
            'pikachu', 'charizard', 'blastoise', 'venusaur', 'mewtwo', 'mew', 'lugia', 'ho-oh',
            'rayquaza', 'groudon', 'kyogre', 'dialga', 'palkia', 'giratina', 'arceus', 'reshiram',
            'zekrom', 'kyurem', 'xerneas', 'yveltal', 'zygarde', 'solgaleo', 'lunala', 'necrozma',
            'zacian', 'zamazenta', 'eternatus', 'calyrex', 'koraidon', 'miraidon', 'eevee', 'vaporeon',
            'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon', 'garchomp',
            'lucario', 'gengar', 'dragonite', 'tyranitar', 'metagross', 'salamence', 'garchomp',
            'raikou', 'entei', 'suicune', 'celebi', 'jirachi', 'deoxys', 'darkrai', 'shaymin',
            'victini', 'keldeo', 'meloetta', 'genesect', 'volcanion', 'marshadow', 'zeraora',
            'meltan', 'melmetal', 'zarude', 'regieleki', 'regidrago', 'glastrier', 'spectrier',
            'calyrex', 'enamorus', 'koraidon', 'miraidon', 'walking wake', 'iron leaves'
        ];
        
        const titleLower = title.toLowerCase();
        
        // Special handling for multi-word names and variants
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
        
        // Check special cases first
        for (const [variant, pokemonId] of Object.entries(specialCases)) {
            if (titleLower.includes(variant)) {
                return pokemonId;
            }
        }
        
        // Then check standard list
        for (const pokemon of pokemonNames) {
            if (titleLower.includes(pokemon)) {
                return pokemon;
            }
        }
        
        // If no explicit Pokemon is found, fallback to first meaningful word
        const words = titleLower.split(/\s+/);
        if (words.length > 0 && words[0].length > 2) {
            return words[0];
        }
        
        return 'unknown';
    }
    
    // Retrieve Pokemon sprite from PokeAPI with caching
    async function getPokemonList() {
        if (!pokemonListPromise) {
            pokemonListPromise = fetch('https://pokeapi.co/api/v2/pokemon?limit=1000')
                .then(response => (response.ok ? response.json() : null))
                .then(data => (data?.results || []))
                .catch(() => []);
        }
        return pokemonListPromise;
    }

    async function getPokemonSprite(pokemonName) {
        try {
            if (pokemonName === 'unknown') return null;
            const normalizedName = pokemonName.toLowerCase();
            if (pokemonSpriteCache.has(normalizedName)) {
                return pokemonSpriteCache.get(normalizedName);
            }
            
            // Try exact name first
            let response = await fetch(`https://pokeapi.co/api/v2/pokemon/${normalizedName}`);
            
            if (!response.ok) {
                // On failure, lookup from cached Pokemon list
                const pokemonList = await getPokemonList();
                const pokemon = pokemonList.find(p => p.name.toLowerCase() === normalizedName);
                if (pokemon) {
                    response = await fetch(pokemon.url);
                }
            }
            
            if (response && response.ok) {
                const data = await response.json();
                const spriteUrl = data.sprites.front_default;
                pokemonSpriteCache.set(normalizedName, spriteUrl || null);
                return spriteUrl || null;
            }
            
            pokemonSpriteCache.set(normalizedName, null);
            return null;
            
        } catch (error) {
            console.log(`❌ [Popup] Error loading sprite for ${pokemonName}:`, error);
            return null;
        }
    }
    
    // Export cards
    function exportCards() {
        const cards = getCards();
        if (cards.length === 0) {
            showMessage('No pages to export', 'error');
            return;
        }
        
        const dataStr = JSON.stringify(cards, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `pokemon-pages-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        showMessage(`${cards.length} pages exported successfully`, 'success');
    }
    
    // Clear all cards
    function clearAllCards() {
        if (confirm('Are you sure you want to delete all pages?')) {
            localStorage.removeItem('pokemonCardNotes');
            loadCards();
            showMessage('All pages were cleared', 'success');
        }
    }
    
    // Check whether a card already exists
    function checkIfCardExists(cardName, cardInfo) {
        const cards = getCards();
        return cards.find(card => 
            card.name.toLowerCase() === cardName.toLowerCase() &&
            card.info === cardInfo
        );
    }
    
    // Check whether a page already exists
    function checkIfPageExists(pageUrl) {
        const cards = getCards();
        return cards.find(card => card.listingUrl === pageUrl);
    }
    
    // Show a message
    function showMessage(text, type = 'success') {
        const messageDiv = document.createElement('div');
        let iconClass;
        
        switch (type) {
            case 'success':
                iconClass = 'check-circle';
                break;
            case 'error':
                iconClass = 'exclamation-circle';
                break;
            case 'info':
                iconClass = 'info-circle';
                break;
            default:
                iconClass = 'check-circle';
        }
        
        messageDiv.className = `message ${type}`;
        messageDiv.innerHTML = `
            <i class="fas fa-${iconClass}"></i>
            ${text}
        `;
        
        // Insert message at top of container
        const container = document.querySelector('.container');
        container.insertBefore(messageDiv, container.firstChild);
        
        // Remove message after 3 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 3000);
    }
    
    // Show save confirmation
    function showSaveConfirmation() {
        const originalText = saveUrlBtn.innerHTML;
        saveUrlBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        saveUrlBtn.style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
        
        setTimeout(() => {
            saveUrlBtn.innerHTML = originalText;
            saveUrlBtn.style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
        }, 2000);
    }
    
    // Get category display name
    function getCategoryName(category) {
        const names = {
            'wishlist': 'Wishlist',
            'viewed': 'Viewed',
            'favorite': 'Favorites'
        };
        return names[category] || category;
    }
    
    // Get category icon
    function getCategoryIcon(category) {
        const icons = {
            'wishlist': '🎯',
            'viewed': '👁️',
            'favorite': '⭐'
        };
        return icons[category] || '📝';
    }
    
    console.log('✅ [Popup] Pokemon notes initialized successfully');
}); 