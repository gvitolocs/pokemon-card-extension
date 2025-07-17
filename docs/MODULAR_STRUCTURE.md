# 🏗️ Struttura Modulare - Pokemon Card Trader Linker

## 📁 **Panoramica della Struttura**

Il progetto è stato riorganizzato in una struttura modulare simile alle classi Java, con ogni modulo che ha una responsabilità specifica e ben definita.

```
pokemon-card-extension-fresh/
├── 📁 core/                    # Core dell'estensione
│   ├── ExtensionCore.js       # Gestione principale e inizializzazione
│   └── CacheManager.js        # Gestione cache e stati
├── 📁 ui/                     # Interfaccia utente
│   └── ButtonManager.js       # Gestione pulsanti CardTrader
├── 📁 data/                   # Gestione dati
│   └── TitleExtractor.js      # Estrazione e parsing dei titoli
├── 📁 utils/                  # Utility
│   └── UrlGenerator.js        # Generazione link CardTrader
├── 📁 processors/             # Processori per siti specifici (futuro)
├── content.js                 # File principale (da aggiornare)
├── content-modular-example.js # Esempio di implementazione modulare
└── manifest.json              # Configurazione estensione
```

## 🔧 **Moduli Principali**

### **1. `core/ExtensionCore.js`**
**Responsabilità:** Core principale dell'estensione
- ✅ Inizializzazione dell'estensione
- ✅ Gestione dello stato globale
- ✅ Gestione dei cambi URL (SPA navigation)
- ✅ Abilitazione/disabilitazione dell'estensione

**Metodi principali:**
```javascript
const extensionCore = new ExtensionCore();
await extensionCore.initialize();
extensionCore.setupUrlChangeHandler();
extensionCore.isExtensionEnabled();
```

### **2. `core/CacheManager.js`**
**Responsabilità:** Gestione cache e stati
- ✅ Cache per risultati delle ricerche
- ✅ Cache per elementi già processati
- ✅ Traccia match riusciti
- ✅ Gestione debounce timer
- ✅ Elementi in fase di processamento

**Metodi principali:**
```javascript
const cacheManager = new CacheManager();
cacheManager.clearAllCaches();
cacheManager.addSuccessfulMatch(cacheKey);
cacheManager.hasSuccessfulMatch(cacheKey);
cacheManager.saveToCardCache(cacheKey, data);
```

### **3. `ui/ButtonManager.js`**
**Responsabilità:** Gestione pulsanti CardTrader
- ✅ Creazione pulsante globale (una sola volta)
- ✅ Clonazione pulsanti per nuovi inserimenti
- ✅ Inserimento pulsanti su siti specifici
- ✅ Gestione stati pulsanti (successo/disabilitato)

**Metodi principali:**
```javascript
const buttonManager = new ButtonManager();
const button = buttonManager.cloneButton();
buttonManager.insertButton(listingElement, button);
buttonManager.setButtonSuccess(button, clickHandler);
buttonManager.setButtonDisabled(button, message);
```

### **4. `data/TitleExtractor.js`**
**Responsabilità:** Estrazione e parsing dei titoli
- ✅ Estrazione titoli da Vinted, eBay, Cardmarket
- ✅ Parsing informazioni Pokemon
- ✅ Gestione casi speciali (Mr. Mime, Type: Null, etc.)
- ✅ Pulizia titoli da elementi estensione

**Metodi principali:**
```javascript
const titleExtractor = new TitleExtractor();
const title = titleExtractor.extractTitleFromListing(listingElement);
const titleInfo = titleExtractor.extractTitleInfo(title);
const cacheKey = titleExtractor.generateCacheKey(title);
```

### **5. `utils/UrlGenerator.js`**
**Responsabilità:** Generazione link CardTrader
- ✅ Generazione link CardTrader per blueprint ID
- ✅ Generazione link Cardmarket
- ✅ Link di ricerca generici
- ✅ Validazione e apertura URL

**Metodi principali:**
```javascript
const urlGenerator = new UrlGenerator();
const url = urlGenerator.generateCardTraderLink(blueprintId);
const searchUrl = urlGenerator.generateSearchLink(searchTerm);
urlGenerator.openLink(url);
```

## 🚀 **Come Usare i Moduli**

### **1. Inizializzazione**
```javascript
// Inizializza tutti i moduli
const extensionCore = new ExtensionCore();
const cacheManager = new CacheManager();
const buttonManager = new ButtonManager();
const titleExtractor = new TitleExtractor();
const urlGenerator = new UrlGenerator();

// Crea il pulsante globale una sola volta
const globalButton = buttonManager.createGlobalButton();
```

### **2. Processamento di un'inserzione**
```javascript
async function processListing(listingElement) {
    // Estrai il titolo
    const title = titleExtractor.extractTitleFromListing(listingElement);
    if (!title) return;
    
    // Controlla cache
    const cacheKey = titleExtractor.generateCacheKey(title);
    if (cacheManager.hasSuccessfulMatch(cacheKey)) return;
    
    // Crea e inserisci pulsante
    const button = buttonManager.cloneButton();
    buttonManager.insertButton(listingElement, button);
    
    // Cerca nel database
    const results = await searchCardInDatabase(titleInfo, title);
    
    if (results.length > 0) {
        // Successo
        cacheManager.addSuccessfulMatch(cacheKey);
        buttonManager.setButtonSuccess(button, () => {
            const url = urlGenerator.generateCardTraderLink(results[0].blueprint_id);
            urlGenerator.openLink(url);
        });
    } else {
        // Nessun risultato
        buttonManager.setButtonDisabled(button);
    }
}
```

### **3. Gestione eventi**
```javascript
// Event listeners per comunicazione tra moduli
document.addEventListener('cardtrader-url-changed', (event) => {
    cacheManager.clearAllCaches();
    cacheManager.clearProcessingAttributes();
    setTimeout(() => startObserver(), 500);
});
```

## 📋 **Vantaggi della Struttura Modulare**

### **✅ Separazione delle Responsabilità**
- Ogni modulo ha una funzione specifica
- Codice più facile da mantenere e testare
- Riduzione della complessità ciclomatica

### **✅ Riutilizzabilità**
- Moduli possono essere usati in altri progetti
- Facile aggiungere nuove funzionalità
- Test unitari per ogni modulo

### **✅ Manutenibilità**
- Bug più facili da isolare
- Modifiche localizzate
- Documentazione per ogni modulo

### **✅ Scalabilità**
- Facile aggiungere nuovi siti (processors/)
- Nuove funzionalità senza toccare il core
- Architettura estensibile

## 🔄 **Migrazione dal Codice Attuale**

### **Passo 1: Aggiorna manifest.json**
```json
{
  "content_scripts": [{
    "js": [
      "supabase.js",
      "api-config.js", 
      "supabase-config.js",
      "supabase-integration.js",
      "core/ExtensionCore.js",
      "core/CacheManager.js", 
      "ui/ButtonManager.js",
      "data/TitleExtractor.js",
      "utils/UrlGenerator.js",
      "content.js"
    ]
  }]
}
```

### **Passo 2: Sostituisci content.js**
- Usa `content-modular-example.js` come riferimento
- Inizializza tutti i moduli all'inizio
- Sostituisci le funzioni con chiamate ai moduli

### **Passo 3: Testa l'estensione**
- Verifica che tutti i moduli siano caricati
- Controlla che i pulsanti funzionino
- Testa su Vinted, eBay, Cardmarket

## 🎯 **Prossimi Passi**

### **Moduli da Aggiungere:**
1. **`data/DatabaseManager.js`** - Gestione database Supabase
2. **`data/SearchEngine.js`** - Motore di ricerca e scoring
3. **`processors/EbayProcessor.js`** - Logica specifica eBay
4. **`processors/VintedProcessor.js`** - Logica specifica Vinted
5. **`processors/CardmarketProcessor.js`** - Logica specifica Cardmarket
6. **`utils/SimilarityCalculator.js`** - Calcoli di similarità
7. **`utils/ConfigManager.js`** - Gestione configurazioni

### **Miglioramenti:**
- Test unitari per ogni modulo
- Documentazione JSDoc completa
- Esempi di utilizzo
- Performance monitoring

## 📚 **Riferimenti**

- **Esempio completo:** `content-modular-example.js`
- **Struttura attuale:** `content.js`
- **Configurazione:** `manifest.json`
- **Documentazione:** Questo file

---

*Questa struttura modulare rende il codice più organizzato, manutenibile e scalabile, seguendo i principi delle classi Java.* 