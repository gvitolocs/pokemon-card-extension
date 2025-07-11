# Pokemon Card Trader Linker 🎴

Un'estensione Chrome che converte automaticamente i titoli delle inserzioni di carte Pokemon da eBay e Vinted in link cliccabili che puntano alla ricerca su CardTrader.

## ✨ Caratteristiche

- **Rilevamento automatico**: Identifica automaticamente le inserzioni di carte Pokemon
- **Link intelligenti**: Utilizza le API di CardTrader per generare link specifici e diretti alle carte
- **Estrazione informazioni**: Analizza i titoli per identificare Pokemon, set e tipi di carta
- **Siti supportati**: Funziona su eBay (Italia e Internazionale) e Vinted (Italia e Internazionale)
- **Personalizzabile**: Puoi modificare le parole chiave per identificare le carte Pokemon
- **Interfaccia moderna**: Design pulito e intuitivo
- **Impostazioni avanzate**: Controllo completo sulle funzionalità
- **Performance ottimizzate**: Cache intelligente e rate limiting per le API

## 🚀 Installazione

### Metodo 1: Caricamento manuale (Sviluppo)

1. **Scarica il codice**:
   ```bash
   git clone https://github.com/tuousername/pokemon-card-extension.git
   cd pokemon-card-extension
   ```

2. **Apri Chrome** e vai su `chrome://extensions/`

3. **Attiva la modalità sviluppatore** (toggle in alto a destra)

4. **Clicca "Carica estensione non pacchettizzata"**

5. **Seleziona la cartella** del progetto

6. **L'estensione è ora installata!** 🎉

### Metodo 2: Installazione da Chrome Web Store (Prossimamente)

L'estensione sarà presto disponibile sul Chrome Web Store per un'installazione più semplice.

## 📖 Come usare

### Uso base

1. **Vai su eBay o Vinted** e cerca carte Pokemon
2. **L'estensione si attiva automaticamente** sui siti supportati
3. **Vedrai dei badge "CardTrader"** accanto ai titoli delle inserzioni Pokemon
4. **Clicca sui badge** per aprire la ricerca su CardTrader

### Controlli avanzati

- **Clicca sull'icona dell'estensione** nella barra degli strumenti per:
  - Vedere lo stato dell'estensione
  - Ricaricare la pagina
  - Mettere in pausa/riprendere l'estensione
  - Aprire le impostazioni

### Personalizzazione

1. **Apri le impostazioni** dall'icona dell'estensione
2. **Modifica le parole chiave** per identificare le carte Pokemon
3. **Configura le opzioni** come notifiche e apertura in nuova tab
4. **Salva le impostazioni**

## ⚙️ Impostazioni

### Parole chiave predefinite

L'estensione riconosce automaticamente le carte Pokemon cercando queste parole chiave:

- `pokemon`, `pokémon`
- `carta`, `card`, `tcg`, `trading card`
- `charizard`, `pikachu`, `blastoise`, `venusaur`, `mewtwo`
- `holo`, `reverse holo`, `full art`, `secret rare`, `ultra rare`

### Opzioni disponibili

- **Attivazione automatica**: Attiva/disattiva l'estensione automaticamente
- **Notifiche**: Mostra notifiche quando vengono trovati link
- **Apertura in nuova tab**: Apri i link CardTrader in una nuova tab
- **Parole chiave personalizzate**: Aggiungi o rimuovi parole chiave

## 🧪 Test delle API

### Test Locale
Per testare le API CardTrader v2:

1. **Apri il file `test-api.html`** nel browser
2. **Clicca su "Test Autenticazione"** per verificare il token
3. **Esegui i test individuali** o usa "Esegui Tutti i Test"
4. **Controlla i risultati** per verificare il funzionamento

### Test Avanzati
Per testare le funzionalità avanzate:

1. **Apri il file `test-api-debug.html`** nel browser
2. **Esegui i test per metodi avanzati**:
   - **Categorie Pokemon**: Carica e analizza le categorie disponibili
   - **Analisi Proprietà**: Esplora le proprietà dei blueprint per determinare rarità
   - **Confronto Blueprint**: Confronta blueprint per trovare differenze (es. Full Art vs Ultra Rare)
   - **Statistiche Prezzi**: Calcola statistiche sui prezzi per un blueprint
   - **Ricerca con Filtri**: Testa la ricerca marketplace con filtri avanzati

### Test nell'Estensione
1. **Carica l'estensione** in Chrome
2. **Configura il token** nelle impostazioni
3. **Vai su eBay o Vinted** e cerca carte Pokemon
4. **Verifica che i link generati** siano specifici e funzionanti

## 🔧 Funzionalità Avanzate API

### Integrazione CardTrader API v2 Completa

L'estensione utilizza tutte le funzionalità avanzate dell'API CardTrader v2:

#### 🔍 Ricerca Intelligente
- **Blueprint-based search**: Ricerca diretta tramite ID blueprint per massima precisione
- **Expansion filtering**: Filtraggio per espansioni specifiche
- **Property analysis**: Analisi delle proprietà per distinguere varianti
- **Advanced matching**: Algoritmi avanzati per il matching delle carte

#### 📊 Analisi Dati
- **Price statistics**: Calcolo di statistiche sui prezzi (min, max, mediano, medio)
- **Blueprint comparison**: Confronto tra blueprint per identificare differenze
- **Property exploration**: Esplorazione delle proprietà disponibili
- **Category analysis**: Analisi delle categorie Pokemon

#### 🎯 Filtri Avanzati
- **Foil filtering**: Ricerca specifica per carte foil/non-foil
- **Language filtering**: Filtraggio per lingua specifica
- **Condition filtering**: Filtraggio per condizione
- **Rarity filtering**: Filtraggio basato su proprietà di rarità

#### ⚡ Performance Ottimizzate
- **Intelligent caching**: Cache intelligente per blueprint e espansioni
- **Rate limiting**: Rispetto dei limiti API (1 chiamata/secondo per marketplace)
- **Batch operations**: Operazioni in batch per ottimizzare le chiamate
- **Error handling**: Gestione errori avanzata con fallback intelligente

## 🛠️ Sviluppo

### Struttura del progetto

```
pokemon-card-extension/
├── manifest.json          # Configurazione dell'estensione
├── api-config.js          # Configurazione API CardTrader
├── cardtrader-api.js      # Integrazione API CardTrader
├── content.js             # Script principale che funziona nelle pagine
├── popup.html             # Interfaccia del popup
├── popup.js               # Logica del popup
├── settings.html          # Pagina delle impostazioni
├── settings.js            # Logica delle impostazioni
├── styles.css             # Stili per i badge
├── test-api.html          # Pagina di test per le API
├── API_INTEGRATION.md     # Documentazione API
└── README.md              # Questo file
```

### Tecnologie utilizzate

- **Manifest V3**: Versione più recente del manifest di Chrome
- **Content Scripts**: Per modificare le pagine web
- **Chrome Storage API**: Per salvare le impostazioni
- **MutationObserver**: Per rilevare cambiamenti dinamici nelle pagine
- **CardTrader API**: Per la ricerca intelligente delle carte
- **Async/Await**: Per gestire le chiamate API in modo efficiente
- **Cache System**: Per ottimizzare le performance delle API

### Come contribuire

1. **Fork** il repository
2. **Crea un branch** per la tua feature (`git checkout -b feature/nuova-funzionalita`)
3. **Commit** le modifiche (`git commit -am 'Aggiungi nuova funzionalità'`)
4. **Push** al branch (`git push origin feature/nuova-funzionalita`)
5. **Crea una Pull Request**

## 🐛 Risoluzione problemi

### L'estensione non funziona

1. **Verifica che sia attiva**: Controlla l'icona nella barra degli strumenti
2. **Ricarica la pagina**: Usa il pulsante "Ricarica" nel popup
3. **Controlla le impostazioni**: Assicurati che l'attivazione automatica sia abilitata
4. **Verifica il sito**: L'estensione funziona solo su eBay e Vinted

### I badge non appaiono

1. **Controlla le parole chiave**: Verifica che il titolo contenga parole chiave Pokemon
2. **Ricarica la pagina**: A volte è necessario ricaricare per vedere i badge
3. **Controlla la console**: Apri gli strumenti di sviluppo per eventuali errori

### Problemi con CardTrader

1. **Verifica la connessione**: Assicurati di avere una connessione internet
2. **Controlla l'URL**: I link puntano a `https://www.cardtrader.com/cards/search`
3. **Problemi del sito**: CardTrader potrebbe essere temporaneamente non disponibile

## 📝 Changelog

### v1.3.0
- ✅ **Funzionalità API Avanzate**: Integrazione completa con CardTrader API v2
- ✅ **Analisi Proprietà**: Analisi automatica delle proprietà blueprint per determinare rarità
- ✅ **Confronto Blueprint**: Confronto tra blueprint per distinguere varianti (Full Art vs Ultra Rare)
- ✅ **Statistiche Prezzi**: Calcolo di statistiche sui prezzi per ogni blueprint
- ✅ **Filtri Marketplace**: Ricerca marketplace con filtri avanzati (foil, lingua, condizione)
- ✅ **Test Avanzati**: Pagina di debug completa per testare tutte le funzionalità API
- ✅ **Gestione Categorie**: Caricamento e analisi delle categorie Pokemon
- ✅ **Performance Ottimizzate**: Cache intelligente e operazioni batch

### v1.2.0
- ✅ Integrazione API CardTrader v2 con autenticazione
- ✅ Configurazione token tramite interfaccia utente
- ✅ Ricerca avanzata tramite espansioni e blueprint
- ✅ Rate limiting ottimizzato per marketplace (1 chiamata/secondo)
- ✅ Gestione errori migliorata con fallback intelligente

### v1.1.0
- ✅ Integrazione API CardTrader per link intelligenti
- ✅ Estrazione automatica di Pokemon, set e tipi di carta
- ✅ Cache intelligente per ottimizzare le performance
- ✅ Rate limiting per rispettare i limiti dell'API
- ✅ Gestione errori avanzata con fallback

### v1.0.0
- ✅ Rilevamento automatico delle carte Pokemon
- ✅ Link diretti a CardTrader
- ✅ Supporto per eBay e Vinted
- ✅ Interfaccia personalizzabile
- ✅ Impostazioni avanzate

## 📄 Licenza

Questo progetto è rilasciato sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.

## 🤝 Supporto

Se hai problemi o suggerimenti:

1. **Apri un issue** su GitHub
2. **Contatta lo sviluppatore** via email
3. **Leggi la documentazione** per soluzioni comuni

## 🙏 Ringraziamenti

- **CardTrader** per il servizio di ricerca carte
- **Chrome Extensions API** per le funzionalità
- **Comunità Pokemon** per l'ispirazione

---

**Pokemon Card Trader Linker** - Trova facilmente le tue carte su CardTrader! 🎴✨ 