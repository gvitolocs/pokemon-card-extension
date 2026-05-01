/**
 * ButtonManager.js - CardTrader button manager
 * Handles button creation, cloning, and insertion.
 */

class ButtonManager {
    constructor() {
        // Global button created once at startup (outside all loops)
        this.globalButton = this.createGlobalButton();
        
        console.log('🔘 ButtonManager initialized');
    }
    
    /**
     * Create the global button once
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
        
        console.log('✅ Global CardTrader button created once at startup');
        return button;
    }
    
    /**
     * Clone the global button for a new insertion
     */
    cloneButton() {
        return this.globalButton.cloneNode(true);
    }
    
    /**
     * Create a button with custom styles
     */
    createCustomButton(styles = {}) {
        const button = this.cloneButton();
        
        // Apply custom styles
        Object.assign(button.style, styles);
        
        return button;
    }
    
    /**
     * Set button to success state (green)
     */
    setButtonSuccess(button, clickHandler) {
        button.style.background = '#28a745';
        
        // Add click handler
        if (clickHandler) {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                clickHandler(e);
            });
        }
        
        // Enhanced hover effects (green)
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
     * Set button to disabled state (gray)
     */
    setButtonDisabled(button, message = 'CardTrader (DB offline)') {
        button.innerHTML = message;
        button.style.background = '#6c757d';
        
        // Hover effects for gray disabled button
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
     * Insert button into target element
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
     * Insert button on Vinted
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
        
        // Fallback: insert after current element
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    }
    
    /**
     * Insert button on eBay
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
        
        // Fallback: insert after current element
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    }
    
    /**
     * Insert button on Cardmarket
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
        
        // Fallback: insert after current element
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    }
    
    /**
     * Create button for eBay product page
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
     * Create button for Cardmarket product page
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

// Export class for other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ButtonManager;
} else {
    // Browser global fallback
    window.ButtonManager = ButtonManager;
} 