/**
 * VINT.js - Gestione specifica per Vinted
 * Processore semplificato per pagine prodotto con singole carte
 */

class VintedProcessor {
    constructor() {
        this.isEnabled = true;
        this.processedPages = new Set();
    }

    /**
     * Inizializza il processore Vinted
     */
    init() {
        console.log('🟢 [VINT] Inizializzazione processore Vinted...');
        
        if (this.isProductPage()) {
            console.log('✅ [VINT] Pagina prodotto rilevata, avvio processamento...');
            this.processProductPage();
        } else {
            console.log('ℹ️ [VINT] Pagina non prodotto, nessuna azione necessaria');
        }
    }

    /**
     * Controlla se è una pagina prodotto Vinted
     */
    isProductPage() {
        const isVinted = window.location.hostname.includes('vinted');
        const hasItemPath = window.location.pathname.includes('/item/') || window.location.pathname.includes('/items/');
        const hasItemTitle = document.querySelector('[data-testid="item-title"]') || document.querySelector('h1');
        
        const result = {
            isVinted,
            hasItemPath,
            hasItemTitle: !!hasItemTitle,
            pathname: window.location.pathname
        };
        
        console.log('🔍 [VINT] Controllo pagina prodotto:', result);
        
        return isVinted && (hasItemPath || hasItemTitle);
    }

    /**
     * Processa la pagina prodotto Vinted
     */
    processProductPage() {
        if (this.processedPages.has(window.location.href)) {
            console.log('🚫 [VINT] Pagina prodotto già processata, saltando');
            return;
        }

        try {
            console.log('🔍 [VINT] Processando pagina prodotto Vinted...');
            
            // Cerca il titolo del prodotto
            const titleSelectors = [
                'h1.web_ui__Text__title',
                '[data-testid="item-title"]',
                'h1[data-testid="item-title"]',
                'h1',
                '.web_ui__Text__title',
                '.web_ui__Text__subtitle'
            ];
            
            console.log(`🔍 [VINT] Cercando titolo con selettori:`, titleSelectors);
            
            let titleElement = null;
            for (const selector of titleSelectors) {
                titleElement = document.querySelector(selector);
                console.log(`🔍 [VINT] Prova selettore "${selector}":`, titleElement ? 'TROVATO' : 'NON TROVATO');
                if (titleElement) {
                    console.log(`✅ [VINT] Titolo trovato con selettore: ${selector}`);
                    console.log(`🔍 [VINT] Contenuto titolo: "${titleElement.textContent.trim()}"`);
                    break;
                }
            }
            
            if (!titleElement) {
                console.log('⚠️ [VINT] Titolo prodotto non trovato');
                return;
            }
            
            const title = titleElement.textContent.trim();
            if (!title) {
                console.log('⚠️ [VINT] Titolo prodotto vuoto');
                return;
            }
            
            console.log(`🔍 [VINT] Titolo prodotto: "${title}"`);
            
            // Estrai informazioni dal titolo
            const titleInfo = this.extractTitleInfo(title);
            
            // Crea sempre un pulsante grigio di fallback (anche se non è un Pokemon)
            console.log('🔍 [VINT] Creando pulsante grigio di fallback...');
            this.createFallbackButton(titleElement);
            
            // Se non è un Pokemon, non fare la ricerca nel database
            if (!titleInfo.pokemonName) {
                console.log('🚫 [VINT] Nessun Pokemon trovato nel titolo, pulsante rimane grigio');
                return;
            }
            
            // Cerca nel database
            this.searchCardInDatabase(titleInfo, title).then(results => {
                console.log(`🔍 [VINT] Risultati ricevuti dal database:`, results);
                if (results && results.length > 0) {
                    console.log(`✅ [VINT] Aggiornando pulsante con ${results.length} risultati`);
                    this.updateButtonWithResults(results);
                } else {
                    console.log('⚠️ [VINT] Nessun risultato trovato nel database, pulsante rimane grigio');
                }
            }).catch(error => {
                console.error('❌ [VINT] Errore nella ricerca database:', error);
            });
            
            // Marca pagina come processata
            this.processedPages.add(window.location.href);
            
        } catch (error) {
            console.error('❌ [VINT] Errore nel processamento pagina prodotto:', error);
        }
    }

    /**
     * Crea un pulsante grigio di fallback
     */
    createFallbackButton(titleElement) {
        console.log(`🔍 [VINT] Creando pulsante grigio fisso in alto a destra`);
        
        // Usa sempre il metodo con posizione fissa in alto a destra
        this.createFixedPositionButton();
    }



    /**
     * Crea un pulsante fisso in alto a destra
     */
    createFixedPositionButton() {
        console.log('🔄 [VINT] Creazione pulsante fisso in alto a destra...');
        
        // Crea un pulsante grigio con posizione fissa
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        button.setAttribute('data-pokemon-linker-fallback', 'true');
        button.innerHTML = 'CardTrader (Caricamento...)';
        button.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            z-index: 9999;
            padding: 12px 24px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            font-weight: bold;
            min-width: 120px;
            display: inline-block;
            transition: all 0.2s ease;
            font-family: Arial, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        
        // Effetti hover (grigio)
        button.addEventListener('mouseenter', () => {
            button.style.background = '#5a6268';
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = '#6c757d';
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        });
        
        // Inserisci nel body
        document.body.appendChild(button);
        console.log(`✅ [VINT] Aggiunto pulsante fisso in alto a destra`);
        this.currentButton = button;
    }

    /**
     * Metodo alternativo per inserire il pulsante se il metodo principale fallisce
     */
    createAlternativeButton(titleElement) {
        console.log('🔄 [VINT] Creazione pulsante alternativo...');
        
        // Crea un pulsante grigio
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        button.setAttribute('data-pokemon-linker-fallback', 'true');
        button.innerHTML = 'CardTrader (Caricamento...)';
        button.style.cssText = `
            margin: 16px 0;
            padding: 12px 24px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            font-weight: bold;
            min-width: 120px;
            display: inline-block;
            transition: all 0.2s ease;
            font-family: Arial, sans-serif;
        `;
        
        // Effetti hover (grigio)
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
        
        // Inserisci dopo il titolo
        if (titleElement.parentNode) {
            titleElement.parentNode.insertBefore(button, titleElement.nextSibling);
            console.log(`✅ [VINT] Aggiunto pulsante alternativo`);
            this.currentButton = button;
        } else {
            console.log('⚠️ [VINT] Impossibile inserire pulsante alternativo');
        }
    }





    /**
     * Avvia un observer per monitorare se il pulsante viene rimosso dal DOM
     */
    startButtonObserver(button, titleElement) {
        console.log('🔍 [VINT] Avvio observer per monitorare pulsante...');
        
        // Controlla periodicamente se il pulsante è ancora nel DOM
        const checkInterval = setInterval(() => {
            if (!document.contains(button)) {
                console.log('⚠️ [VINT] Pulsante rimosso dal DOM, tentativo re-inserimento...');
                clearInterval(checkInterval);
                
                // Aspetta un po' e poi riprova a inserire il pulsante
                setTimeout(() => {
                    if (!document.querySelector('[data-pokemon-linker-button]')) {
                        console.log('🔄 [VINT] Re-inserimento pulsante grigio...');
                        this.createFallbackButton(titleElement);
                    }
                }, 500);
            }
        }, 200);
        
        // Ferma l'observer dopo 30 secondi per evitare loop infiniti
        setTimeout(() => {
            clearInterval(checkInterval);
            console.log('⏹️ [VINT] Observer fermato dopo 30 secondi');
        }, 30000);
    }

    /**
     * Aggiorna il pulsante con i risultati del database
     */
    updateButtonWithResults(results) {
        if (!this.currentButton) {
            console.log('⚠️ [VINT] Nessun pulsante da aggiornare');
            return;
        }
        
        console.log(`🔍 [VINT] Aggiornando pulsante con ${results.length} risultati`);
        console.log(`🔍 [VINT] Primo risultato:`, results[0]);
        
        const bestResult = results[0];
        
        // Verifica che il pulsante sia ancora nel DOM
        if (!document.contains(this.currentButton)) {
            console.log('⚠️ [VINT] Pulsante non più presente nel DOM');
            return;
        }
        
        // Aggiorna il pulsante
        if (this.currentButton.tagName === 'A') {
            // Se è un link (pulsante sostituito), aggiorna il contenuto
            this.currentButton.innerHTML = `
                <span class="web_ui__Button__content">
                    <span class="web_ui__Button__label">CardTrader</span>
                </span>
            `;
            this.currentButton.style.background = '#28a745';
            this.currentButton.style.color = 'white';
        } else {
            // Se è un button normale
            this.currentButton.innerHTML = 'CardTrader';
            this.currentButton.style.background = '#28a745';
        }
        
        this.currentButton.removeAttribute('data-pokemon-linker-fallback');
        
        // Rimuovi tutti gli event listener precedenti clonando il pulsante
        const newButton = this.currentButton.cloneNode(true);
        this.currentButton.parentNode.replaceChild(newButton, this.currentButton);
        this.currentButton = newButton;
        
        // Aggiungi click handler
        this.currentButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cardTraderUrl = this.generateCardTraderLink(bestResult.blueprint_id);
            window.open(cardTraderUrl, '_blank');
        });
        
        // Effetti hover (verde)
        this.currentButton.addEventListener('mouseenter', () => {
            this.currentButton.style.background = '#218838';
            this.currentButton.style.transform = 'scale(1.05)';
            this.currentButton.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        });
        
        this.currentButton.addEventListener('mouseleave', () => {
            this.currentButton.style.background = '#28a745';
            this.currentButton.style.transform = 'scale(1)';
            this.currentButton.style.boxShadow = 'none';
        });
        
        console.log(`✅ [VINT] Pulsante aggiornato con successo per: ${bestResult.name_en || bestResult.pokemon_name}`);
    }

    /**
     * Crea il pulsante CardTrader per la pagina prodotto (metodo legacy)
     */
    createProductButton(titleElement, results) {
        console.log(`🔍 [VINT] Iniziando creazione pulsante con ${results.length} risultati`);
        console.log(`🔍 [VINT] Primo risultato:`, results[0]);
        
        // Crea un singolo pulsante CardTrader
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        button.innerHTML = 'CardTrader';
        button.style.cssText = `
            margin: 16px 0;
            padding: 12px 24px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            font-weight: bold;
            min-width: 120px;
            display: inline-block;
            transition: all 0.2s ease;
            font-family: Arial, sans-serif;
        `;
        
        // Aggiungi click handler con il miglior risultato
        const bestResult = results[0];
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cardTraderUrl = this.generateCardTraderLink(bestResult.blueprint_id);
            window.open(cardTraderUrl, '_blank');
        });
        
        // Effetti hover
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
        
        // Inserisci dopo il titolo
        console.log(`🔍 [VINT] Tentativo inserimento pulsante dopo:`, titleElement);
        console.log(`🔍 [VINT] Parent node:`, titleElement.parentNode);
        
        if (titleElement.parentNode) {
            titleElement.parentNode.insertBefore(button, titleElement.nextSibling);
            console.log(`✅ [VINT] Aggiunto pulsante CardTrader alla pagina prodotto per: ${bestResult.name_en || bestResult.pokemon_name}`);
            console.log(`✅ [VINT] Pulsante inserito con successo nel DOM`);
        } else {
            console.log('⚠️ [VINT] Impossibile inserire pulsante CardTrader: parentNode non trovato');
        }
    }

    /**
     * Estrae informazioni dal titolo (delega a content.js)
     */
    extractTitleInfo(title) {
        // Delega alla funzione globale se disponibile
        if (typeof window.extractTitleInfo === 'function') {
            console.log(`🔍 [VINT] Usando extractTitleInfo globale per: "${title}"`);
            return window.extractTitleInfo(title);
        }
        console.log(`⚠️ [VINT] extractTitleInfo globale non disponibile, restituendo null`);
        return { pokemonName: null };
    }

    /**
     * Cerca nel database (delega a content.js)
     */
    async searchCardInDatabase(titleInfo, title) {
        // Delega alla funzione globale se disponibile
        if (typeof window.searchCardInDatabase === 'function') {
            console.log(`🔍 [VINT] Usando searchCardInDatabase globale per: "${title}"`);
            console.log(`🔍 [VINT] Parametri inviati:`, { titleInfo, title });
            
            try {
                const results = await window.searchCardInDatabase(titleInfo, title);
                console.log(`🔍 [VINT] Risultati ricevuti dalla funzione globale:`, results);
                console.log(`🔍 [VINT] Tipo di risultati:`, typeof results);
                console.log(`🔍 [VINT] Lunghezza risultati:`, results ? results.length : 'null/undefined');
                return results;
            } catch (error) {
                console.error(`❌ [VINT] Errore nella chiamata searchCardInDatabase globale:`, error);
                return [];
            }
        }
        console.log(`⚠️ [VINT] searchCardInDatabase globale non disponibile, restituendo array vuoto`);
        return [];
    }

    /**
     * Genera link CardTrader
     */
    generateCardTraderLink(blueprintId) {
        return `https://www.cardtrader.com/cards/${blueprintId}`;
    }
}

// Esporta per uso globale
window.VintedProcessor = VintedProcessor; 