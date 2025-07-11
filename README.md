# Pokemon Card Trader Linker 🎴

Un'estensione Chrome che converte automaticamente i titoli delle inserzioni di carte Pokemon da eBay e Vinted in link cliccabili che puntano alla ricerca su CardTrader.

## ✨ Caratteristiche

- **Rilevamento automatico**: Identifica automaticamente le inserzioni di carte Pokemon
- **Link diretti**: Crea link cliccabili che portano direttamente alla ricerca su CardTrader
- **Siti supportati**: Funziona su eBay (Italia e Internazionale) e Vinted (Italia e Internazionale)
- **Personalizzabile**: Puoi modificare le parole chiave per identificare le carte Pokemon
- **Interfaccia moderna**: Design pulito e intuitivo
- **Impostazioni avanzate**: Controllo completo sulle funzionalità

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

## 🛠️ Sviluppo

### Struttura del progetto

```
pokemon-card-extension/
├── manifest.json          # Configurazione dell'estensione
├── content.js             # Script principale che funziona nelle pagine
├── popup.html             # Interfaccia del popup
├── popup.js               # Logica del popup
├── settings.html          # Pagina delle impostazioni
├── settings.js            # Logica delle impostazioni
├── styles.css             # Stili per i badge
└── README.md              # Questo file
```

### Tecnologie utilizzate

- **Manifest V3**: Versione più recente del manifest di Chrome
- **Content Scripts**: Per modificare le pagine web
- **Chrome Storage API**: Per salvare le impostazioni
- **MutationObserver**: Per rilevare cambiamenti dinamici nelle pagine

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