/**
 * ButtonManager.js - Gestione pulsanti CardTrader
 * Gestisce la creazione, clonazione e inserimento dei pulsanti
 */

class ButtonManager {
    constructor() {
        // Pulsante globale creato una sola volta all'avvio (fuori da tutti i cicli)
        this.globalButton = this.createGlobalButton();
        
        console.log('🔘 ButtonManager inizializzato');
    }
    
    /**
     * Crea il pulsante globale una sola volta
     */
    createGlobalButton() {
        const button = document.createElement('button');
        button.innerHTML = 'CardTrader';
        button.style.cssText = `
            margin-top: 8px;
            margin-left: 8px;
            padding: 8px 16px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 17px;
            cursor: pointer;
            font-weight: bold;
            min-width: 100px;
            display: inline-block;
            transition: all 0.2s ease;
        `;
        
        console.log('✅ Pulsante globale CardTrader creato UNA SOLA VOLTA all\'avvio');
        return button;
    }
    
    /**
     * Clona il pulsante globale per un nuovo inserimento
     */
    cloneButton() {
        return this.globalButton.cloneNode(true);
    }
    
    /**
     * Crea un pulsante con stili personalizzati
     */
    createCustomButton(styles = {}) {
        const button = this.cloneButton();
        
        // Applica stili personalizzati
        Object.assign(button.style, styles);
        
        return button;
    }
    
    /**
     * Imposta il pulsante come "successo" (verde)
     */
    setButtonSuccess(button, clickHandler) {
        button.style.background = '#28a745';
        
        // Aggiungi event listener per il click
        if (clickHandler) {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                clickHandler(e);
            });
        }
        
        // Effetti hover migliorati (verde)
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
    }
    
    /**
     * Imposta il pulsante come "disabilitato" (grigio)
     */
    setButtonDisabled(button, message = 'CardTrader (DB offline)') {
        button.innerHTML = message;
        button.style.background = '#6c757d';
        
        // Effetti hover per pulsante grigio (disabilitato)
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
    
    /**
     * Inserisce il pulsante in un elemento specifico
     */
    insertButton(listingElement, button) {
        const hostname = window.location.hostname;
        
        if (hostname.includes('vinted')) {
            return this.insertButtonVinted(listingElement, button);
        } else if (hostname.includes('ebay')) {
            return this.insertButtonEbay(listingElement, button);
        } else if (hostname.includes('cardmarket')) {
            return this.insertButtonCardmarket(listingElement, button);
        }
        
        return false;
    }
    
    /**
     * Inserisce il pulsante su Vinted
     */
    insertButtonVinted(listingElement, button) {
        const insertAfterSelectors = [
            '.web_ui__Text__body',
            '.web_ui__Text__subtitle',
            '.web_ui__Text__title',
            '[data-testid="item-card-title"]'
        ];
        
        for (const selector of insertAfterSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.parentNode) {
                const parent = element.parentNode;
                parent.insertBefore(button, element.nextSibling);
                return true;
            }
        }
        
        // Fallback: inserisci dopo l'elemento
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    }
    
    /**
     * Inserisce il pulsante su eBay
     */
    insertButtonEbay(listingElement, button) {
        const insertAfterSelectors = [
            '.s-item__title',
            '.s-item__link',
            'h3'
        ];
        
        for (const selector of insertAfterSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.parentNode) {
                const parent = element.parentNode;
                parent.insertBefore(button, element.nextSibling);
                return true;
            }
        }
        
        // Fallback: inserisci dopo l'elemento
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    }
    
    /**
     * Inserisce il pulsante su Cardmarket
     */
    insertButtonCardmarket(listingElement, button) {
        const insertAfterSelectors = [
            '.col-12 .d-flex .flex-grow-1 h1',
            '.product-details h1',
            '.card-title',
            '.product-title',
            'h1',
            '.page-title-container h1'
        ];
        
        for (const selector of insertAfterSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.parentNode) {
                const parent = element.parentNode;
                parent.insertBefore(button, element.nextSibling);
                return true;
            }
        }
        
        // Fallback: inserisci dopo l'elemento
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    }
    
    /**
     * Crea un pulsante per pagina prodotto eBay
     */
    createEbayProductButton() {
        return this.createCustomButton({
            margin: '16px 0',
            padding: '8px 16px',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: 'pointer',
            fontWeight: 'bold',
            minWidth: '120px',
            display: 'inline-block',
            transition: 'all 0.2s ease'
        });
    }
    
    /**
     * Crea un pulsante per pagina prodotto Cardmarket
     */
    createCardmarketProductButton() {
        return this.createCustomButton({
            margin: '0',
            padding: '6px 12px',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '15px',
            cursor: 'pointer',
            fontWeight: 'bold',
            minWidth: '90px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            textDecoration: 'none',
            textAlign: 'center'
        });
    }
}

// Esporta la classe per l'uso in altri moduli
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ButtonManager;
} else {
    // Per uso in browser
    window.ButtonManager = ButtonManager;
} 