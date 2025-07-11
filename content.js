// Pokemon Card Trader Linker - Content Script
(function() {
    'use strict';

    // Variabili globali
    let isPaused = false;
    let settings = {
        autoActivate: true,
        notifications: true,
        newTab: true,

        pokemonKeywords: [
            'pokemon', 'pokémon', 'carta', 'card', 'tcg', 'trading card',
            'charizard', 'pikachu', 'blastoise', 'venusaur', 'mewtwo',
            'holo', 'reverse holo', 'full art', 'secret rare', 'ultra rare'
        ]
    };

    // Configurazione per i diversi siti
    const siteConfigs = {
        'ebay.it': {
            titleSelectors: [
                'h1.x-item-title__mainTitle',
                '.x-item-title__mainTitle',
                '.s-item__title',
                'h3.s-item__title',
                '.s-item__link .s-item__title',
                '[data-testid="x-item-title"] h1',
                '.vim.x-item-title h1'
            ],
            containerSelector: '.s-item__info, [data-testid="x-item-title"], .vim.x-item-title'
        },
        'ebay.com': {
            titleSelectors: [
                'h1.x-item-title__mainTitle',
                '.x-item-title__mainTitle',
                '.s-item__title',
                'h3.s-item__title',
                '.s-item__link .s-item__title',
                '[data-testid="x-item-title"] h1',
                '.vim.x-item-title h1'
            ],
            containerSelector: '.s-item__info, [data-testid="x-item-title"], .vim.x-item-title'
        },
        'vinted.it': {
            titleSelectors: [
                '.web_ui__Text__text.web_ui__Text__title',
                'h1.web_ui__Text__text.web_ui__Text__title',
                '.web_ui__Text__text',
                '.web_ui__Text__text--bold',
                '[data-testid="item-title"]',
                '.item-box__title'
            ],
            containerSelector: '.item-box, .summary-max-lines-4'
        },
        'vinted.com': {
            titleSelectors: [
                '.web_ui__Text__text.web_ui__Text__title',
                'h1.web_ui__Text__text.web_ui__Text__title',
                '.web_ui__Text__text',
                '.web_ui__Text__text--bold',
                '[data-testid="item-title"]',
                '.item-box__title'
            ],
            containerSelector: '.item-box, .summary-max-lines-4'
        }
    };

    // Funzione per pulire il testo del titolo
    function cleanTitle(title) {
        return title
            .replace(/[^\w\s]/g, ' ') // Rimuove caratteri speciali
            .replace(/\s+/g, ' ') // Sostituisce spazi multipli con uno solo
            .trim()
            .toLowerCase();
    }

    // Funzione per creare il link CardTrader
    function createCardTraderLink(title) {
        const cleanTitleText = cleanTitle(title);
        const searchQuery = encodeURIComponent(cleanTitleText);
        return `https://www.cardtrader.com/cards/search?q=${searchQuery}`;
    }

    // Funzione per caricare le impostazioni
    function loadSettings() {
        chrome.storage.sync.get(settings, function(items) {
            settings = { ...settings, ...items };
        });
    }

    // Funzione per nascondere elementi pubblicitari di Vinted
    function hideVintedAds() {
        if (!window.location.hostname.includes('vinted')) {
            return;
        }

        // Selettori per elementi pubblicitari
        const adSelectors = [
            '[data-testid="slot-container"]',
            '[data-testid="slot-placeholder"]',
            '[data-testid="slot-placeholder-image"]',
            '[data-testid="slot-placeholder-image--img"]',
            '[data-testid="main-slot"]',
            '.slot-container',
            '.slot-container--leaderboard',
            '.slot-placeholder',
            '.slot-placeholder--leaderboard',
            '.slot-content',
            '#slot-leaderboard',
            '.web_ui__Image__image[data-testid="slot-placeholder-image"]',
            '.web_ui__Image__content[data-testid="slot-placeholder-image--img"]',
            '[data-testid*="ad"]',
            '[data-testid*="advertisement"]',
            '[data-testid*="promo"]',
            '[data-testid*="sponsored"]',
            '[class*="ad-"]',
            '[class*="advertisement"]',
            '[class*="promo"]',
            '[class*="sponsored"]',
            '[id*="ad-"]',
            '[id*="advertisement"]',
            '[id*="promo"]',
            '[id*="sponsored"]'
        ];

        adSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.style.display = 'none';
                element.style.visibility = 'hidden';
                element.style.opacity = '0';
                element.style.height = '0';
                element.style.width = '0';
                element.style.overflow = 'hidden';
            });
        });

        // Nascondi immagini con URL specifici
        const adImages = document.querySelectorAll('img[src*="placeholders"], img[src*="ads"], img[src*="leaderboard"]');
        adImages.forEach(img => {
            img.style.display = 'none';
            img.style.visibility = 'hidden';
            img.style.opacity = '0';
        });

        // Nascondi testo all'interno dei placeholder
        const adTexts = document.querySelectorAll('.slot-placeholder__text, .slot-placeholder .web_ui__Text__text');
        adTexts.forEach(text => {
            text.style.display = 'none';
            text.style.visibility = 'hidden';
            text.style.opacity = '0';
        });
    }



    // Funzione per creare il pulsante CT
    function createCTButton(title) {
        const link = createCardTraderLink(title);
        const button = document.createElement('a');
        button.className = 'ct-button';
        button.href = link;
        button.target = '_blank';
        button.textContent = 'CT';
        button.title = 'Cerca su CardTrader';
        button.style.cssText = `
            cursor: pointer;
            margin-left: 5px;
            background-color: rgb(240, 240, 240);
            border: 1px solid rgb(204, 204, 204);
            border-radius: 4px;
            padding: 3px 6px;
            text-decoration: none;
            color: black;
            font-size: 11px;
            font-weight: bold;
            display: inline-block;
            transition: all 0.2s ease;
        `;
        
        // Aggiungi hover effect
        button.addEventListener('mouseenter', function() {
            this.style.backgroundColor = 'rgb(220, 220, 220)';
            this.style.borderColor = 'rgb(180, 180, 180)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.backgroundColor = 'rgb(240, 240, 240)';
            this.style.borderColor = 'rgb(204, 204, 204)';
        });
        
        return button;
    }

    // Funzione per processare un elemento titolo
    function processTitleElement(titleElement, container) {
        // Controlla se è già stato processato
        if (titleElement.dataset.cardtraderProcessed) {
            return;
        }

        const title = titleElement.textContent || titleElement.innerText;
        if (!title || title.trim().length === 0) {
            return;
        }

        // Cerca parole chiave Pokemon dalle impostazioni
        const cleanTitle = cleanTitle(title);
        const hasPokemonKeywords = settings.pokemonKeywords.some(keyword => 
            cleanTitle.includes(keyword.toLowerCase())
        );

        if (hasPokemonKeywords && !isPaused) {
            // Crea e aggiungi il pulsante CT
            const ctButton = createCTButton(title);
            
            // Trova la posizione migliore per inserire il pulsante
            let insertPosition = null;
            
            // Per eBay, inserisci accanto al titolo
            if (window.location.hostname.includes('ebay')) {
                // Per il nuovo formato con data-testid, inserisci nel container principale
                if (container.matches('[data-testid="x-item-title"]') || container.matches('.vim.x-item-title')) {
                    // Inserisci il pulsante nel container principale, come fa HISTORY
                    container.appendChild(ctButton);
                    insertPosition = container;
                } else {
                    // Per i formati classici, inserisci nell'elemento titolo
                    const titleElement = container.querySelector('.x-item-title__mainTitle') || 
                                       container.querySelector('h1.x-item-title__mainTitle') ||
                                       container.querySelector('.s-item__title');
                    
                    if (titleElement) {
                        titleElement.appendChild(ctButton);
                        insertPosition = titleElement;
                    }
                }
            }
            
            // Per Vinted, inserisci accanto al titolo
            if (window.location.hostname.includes('vinted')) {
                const titleElement = container.querySelector('.item-box__title') || 
                                   container.querySelector('[data-testid="item-title"]') ||
                                   container.querySelector('.web_ui__Text__text.web_ui__Text__title') ||
                                   container.querySelector('h1.web_ui__Text__text.web_ui__Text__title');
                
                if (titleElement) {
                    // Inserisci il pulsante dopo il titolo
                    titleElement.appendChild(ctButton);
                    insertPosition = titleElement;
                }
            }

            // Se il pulsante è stato inserito, marca come processato
            if (insertPosition) {
                titleElement.dataset.cardtraderProcessed = 'true';
            }
        }
    }

    // Funzione principale per processare la pagina
    function processPage() {
        if (isPaused || !settings.autoActivate) {
            return;
        }

        const hostname = window.location.hostname;
        const config = siteConfigs[hostname];

        if (!config) {
            return;
        }

        // Nascondi pubblicità su Vinted
        hideVintedAds();

        // Trova tutti i container delle inserzioni
        const containers = document.querySelectorAll(config.containerSelector);
        
        containers.forEach(container => {
            // Trova il titolo usando i selettori configurati
            let titleElement = null;
            for (const selector of config.titleSelectors) {
                titleElement = container.querySelector(selector);
                if (titleElement) break;
            }

            if (titleElement) {
                processTitleElement(titleElement, container);
            }
        });
    }

    // Osserva i cambiamenti nella pagina (per pagine dinamiche)
    function observePageChanges() {
        const observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Controlla se sono stati aggiunti nuovi elementi di inserzioni
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const hostname = window.location.hostname;
                            const config = siteConfigs[hostname];
                            if (config && (
                                node.matches?.(config.containerSelector) ||
                                node.querySelector?.(config.containerSelector) ||
                                node.querySelector?.('.summary-max-lines-4') ||
                                node.querySelector?.('.web_ui__Text__text.web_ui__Text__title') ||
                                node.querySelector?.('h1.x-item-title__mainTitle') ||
                                node.querySelector?.('.x-item-title__mainTitle') ||
                                node.querySelector?.('[data-testid="x-item-title"]') ||
                                node.querySelector?.('.vim.x-item-title')
                            )) {
                                shouldProcess = true;
                            }


                        }
                    });
                }
            });

            if (shouldProcess) {
                // Aspetta un po' per permettere al DOM di stabilizzarsi
                setTimeout(processPage, 100);
            }

            // Controlla anche se sono stati aggiunti elementi pubblicitari
            if (window.location.hostname.includes('vinted') && (
                node.matches?.('[data-testid="slot-placeholder"]') ||
                node.matches?.('[data-testid="slot-container"]') ||
                node.matches?.('.slot-placeholder') ||
                node.matches?.('.slot-container') ||
                node.querySelector?.('[data-testid="slot-placeholder"]') ||
                node.querySelector?.('[data-testid="slot-container"]') ||
                node.querySelector?.('.slot-placeholder') ||
                node.querySelector?.('.slot-container')
            )) {
                setTimeout(hideVintedAds, 100);
            }
        });

        // Nascondi anche pubblicità che potrebbero essere aggiunte dinamicamente
        if (window.location.hostname.includes('vinted')) {
            setTimeout(hideVintedAds, 500);
            setTimeout(hideVintedAds, 2000);
        }

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Inizializzazione
    function init() {
        // Processa la pagina corrente
        processPage();
        
        // Osserva i cambiamenti per pagine dinamiche
        observePageChanges();
        
        // Processa di nuovo dopo un breve delay per assicurarsi che tutto sia caricato
        setTimeout(processPage, 1000);
    }

    // Avvia quando il DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Processa anche quando la pagina cambia (per SPA)
    window.addEventListener('load', processPage);
    
    // Processa periodicamente per assicurarsi che tutto sia processato
    setInterval(processPage, 3000);

    // Gestione dei messaggi dal popup e dalle impostazioni
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        switch (request.action) {
            case 'toggle':
                isPaused = !isPaused;
                sendResponse({paused: isPaused});
                break;
            
            case 'updateSettings':
                settings = { ...settings, ...request.settings };
                // Ricarica la pagina per applicare le nuove impostazioni
                setTimeout(processPage, 100);
                sendResponse({success: true});
                break;
            
            case 'getStatus':
                sendResponse({
                    paused: isPaused,
                    autoActivate: settings.autoActivate,
                    site: window.location.hostname
                });
                break;
        }
    });

    // Carica le impostazioni all'avvio
    loadSettings();

})(); 