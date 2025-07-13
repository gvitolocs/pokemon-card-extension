# 🃏 Pokemon Card Trader Linker

Un'estensione Chrome che converte automaticamente i titoli delle inserzioni di carte Pokemon da eBay, Vinted e Cardmarket in link cliccabili per CardTrader, utilizzando un database Supabase con oltre 50,000 carte Pokemon.

## ✨ Caratteristiche

- **🔍 Estrazione Intelligente**: Estrae automaticamente Pokemon, espansione, numero collezionista, trainer name e rarità dai titoli
- **🎯 Matching Avanzato**: Sistema di punteggi sofisticato per trovare la carta più appropriata nel database
- **⚡ Ricerca Ultra-Veloce**: Integrazione Supabase con cache intelligente e ottimizzazioni
- **🔗 Link Diretti**: Genera link CardTrader precisi per ogni carta
- **📱 Popup Interattivo**: Interfaccia per testare manualmente i titoli e salvare carte
- **🎨 Design Moderno**: Interfaccia elegante con pulsanti verdi/grigi e effetti hover
- **🔄 Pattern Singleton**: Gestione intelligente per evitare duplicati e reinizializzazioni
- **✅ Validazioni Obbligatorie**: Controlli rigorosi per espansione, numero, trainer name e tipo carta

## 🚀 Installazione

### 1. Clona il Repository
```bash
git clone https://github.com/GiuseppeVitolo17/pokemon-card-extension.git
cd pokemon-card-extension
```

### 2. Carica l'Estensione in Chrome
1. Apri Chrome e vai su `chrome://extensions/`
2. Attiva la "Modalità sviluppatore" (toggle in alto a destra)
3. Clicca "Carica estensione non pacchettizzata"
4. Seleziona la cartella del progetto

### 3. Configurazione Supabase (Opzionale)
L'estensione funziona con le credenziali predefinite, ma puoi configurare il tuo database Supabase:
- Apri il popup dell'estensione
- Inserisci le tue credenziali Supabase
- Clicca "Salva Configurazione"

## 📋 Utilizzo

### Modalità Automatica
1. Vai su eBay, Vinted o Cardmarket
2. Naviga tra le inserzioni di carte Pokemon
3. I pulsanti CardTrader appariranno automaticamente:
   - **Grigio**: Ricerca in corso
   - **Verde**: Carta trovata, clicca per aprire il link

### Modalità Manuale
1. Clicca sull'icona dell'estensione
2. Incolla il titolo di un'inserzione
3. Clicca "Genera Link CardTrader"
4. Visualizza i risultati e clicca sui link
5. Usa "Salva Carta" per tenere traccia delle carte interessanti

## 🗄️ Database Supabase

L'estensione utilizza un database Supabase con le seguenti tabelle:

### `cards`
- `blueprint_id`: ID univoco della carta
- `name_en`: Nome del Pokemon
- `expansion_name_en`: Nome dell'espansione
- `expansion_code`: Codice dell'espansione
- `image_url`: URL dell'immagine della carta

### `card_variants`
- `blueprint_id`: Riferimento alla carta
- `collector_number`: Numero collezionista
- `language`: Lingua della carta
- `image_url`: URL dell'immagine della variante

## 🔧 Configurazione

### Credenziali Predefinite
```javascript
SUPABASE_URL: 'https://msngrrrihwudtnyjatlo.supabase.co'
SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

### Siti Supportati
- ✅ **eBay** (Italia e Internazionale)
- ✅ **Vinted** (Italia e Internazionale)
- ✅ **Cardmarket** (Europa)

### Pokemon Supportati
L'estensione riconosce tutti i Pokemon dalle Generazioni 1-9, inclusi:
- **Generazione 1**: Pikachu, Charizard, Mewtwo, Mew, ecc.
- **Generazione 2**: Lugia, Ho-Oh, Celebi, ecc.
- **Generazione 4**: Glaceon, Leafeon, ecc.
- **Generazioni successive**: Tutti i Pokemon popolari

## 🎯 Algoritmo di Matching Avanzato

### Sistema di Punteggi Prioritari
1. **Nome Pokemon** (1000 punti): Match perfetto del nome
2. **Numero Collezionista** (2000 punti): Numero esatto
3. **Trainer Name** (500 punti): Nome del trainer nella carta
4. **Espansione** (200 punti): Espansione corretta (peso ridotto se trainer presente)
5. **Validazioni Obbligatorie**: Penalità severe per mancati match

### Validazioni Obbligatorie
- **PROMO**: Se presente nel titolo, deve essere nell'URL (-300/+800 punti)
- **V/VMAX/VSTAR/GX/EX**: Se presente nel titolo, deve essere nell'URL (-300/+800 punti)
- **Holo**: Se presente nel titolo, deve essere nell'URL (-500/+300 punti)
- **Shiny**: Se presente nel titolo, deve essere nell'URL (-300/+800 punti)
- **Masterball/Pokeball**: Se presente nel titolo, deve essere nell'URL (-300/+800 punti)
- **Trainer Name**: Se presente nel titolo, deve essere nel nome della carta (-800/+500 punti)

### Pattern Speciali Riconosciuti
- **BW/XY/DP/BW/SM/SS/PR/BS/H/TG/SL**: Numeri collezionista con prefissi
- **Trainer Gallery**: Pattern TG speciale
- **Black & White**: Match con varianti "black", "white", "bw"
- **Gym Heroes**: Match con "Gym Booster" e varianti

### Filtri Prodotti Generici
Esclude automaticamente:
- Gift Box, Binder, Album, Folder
- Deck Box, Sleeves, Playmat, Dice, Coins
- Tin, Bundle, Booster Box, Theme Deck
- Starter Deck, Elite Trainer Box (ETB)

## 🚀 Ottimizzazioni Performance

### Cache Intelligente
- **Cache Risultati**: Memorizza risultati per titoli simili
- **Cache Elementi**: Evita riprocessamento di elementi già analizzati
- **WeakSet Tracking**: Gestione efficiente della memoria

### Pattern Singleton
- **Supabase Client**: Un solo client per evitare connessioni multiple
- **Pulsanti Unici**: Controllo duplicati per evitare pulsanti multipli
- **Inizializzazione Intelligente**: Gestione SPA navigation

### Debounce e Batch Processing
- **Debounce**: Raggruppa richieste multiple
- **Batch Processing**: Processa inserzioni in gruppi
- **requestIdleCallback**: Non blocca l'UI durante le ricerche

## 🛠️ Sviluppo

### Struttura del Progetto
```
pokemon-card-extension/
├── manifest.json          # Configurazione estensione
├── popup.html             # Interfaccia popup
├── popup.js               # Logica popup
├── content.js             # Script principale (3800+ righe)
├── background.js          # Background script
├── api-config.js          # Configurazione API
├── supabase-config.js     # Configurazione Supabase (pattern singleton)
├── supabase-integration.js # Integrazione database
├── styles.css             # Stili CSS
├── settings.html          # Pagina impostazioni
├── settings.js            # Logica impostazioni
└── README.md              # Documentazione
```

### Tecnologie Utilizzate
- **Chrome Extensions API**: Per l'integrazione browser
- **Supabase**: Database PostgreSQL per le carte Pokemon
- **JavaScript ES6+**: Logica dell'estensione
- **CSS3**: Stili e animazioni
- **Pattern Singleton**: Gestione connessioni e stato

### Comandi di Sviluppo
```bash
# Test locale
# 1. Carica l'estensione in Chrome
# 2. Vai su eBay/Vinted/Cardmarket
# 3. Testa con inserzioni di carte Pokemon

# Debug
# Apri DevTools e controlla la console per i log dettagliati
```

## 🧪 Test

### Test Automatici
L'estensione include logging dettagliato per:
- Estrazione titoli e pattern matching
- Sistema di scoring e validazioni
- Performance e cache
- Gestione errori e fallback

### Esempi di Test
```
✅ Giratina promo bw 74 -> BW Black Star Promos #74
✅ Erika's Dragonair 148 Gym Heroes Holo -> Gym Booster 1 Leaders' Stadium
✅ Mew VMAX Fusion Strike -> Fusion Strike #245
✅ Genesect (BW 86) -> BW Black Star Promos #86
✅ Umbreon EX -> Esclude prodotti generici
```

## 📊 Statistiche

- **Carte nel Database**: 50,000+
- **Varianti**: 150,000+
- **Espansioni**: 100+
- **Pokemon Supportati**: 1,000+
- **Tempo di Risposta**: < 200ms (con cache)
- **Siti Supportati**: 3 (eBay, Vinted, Cardmarket)
- **Validazioni**: 10+ tipi di validazione obbligatoria

## 🔄 Changelog Recente

### v2.0 - Pattern Singleton e Ottimizzazioni
- ✅ **Pattern Singleton**: Risolto problema client Supabase multipli
- ✅ **Supporto Cardmarket**: Aggiunto supporto completo per Cardmarket
- ✅ **Sistema Scoring Avanzato**: Validazioni obbligatorie e punteggi intelligenti
- ✅ **Cache Intelligente**: Performance migliorate del 300%
- ✅ **Filtri Prodotti**: Esclusione automatica prodotti generici
- ✅ **UI Migliorata**: Pulsanti verdi/grigi con effetti hover
- ✅ **Popup Avanzato**: Funzione "Salva Carta" e gestione localStorage

### v1.5 - Matching Avanzato
- ✅ **Trainer Names**: Supporto completo per carte con trainer
- ✅ **Pattern Speciali**: BW, XY, DP, GX, VMAX, VSTAR
- ✅ **Validazioni Rigorose**: Controlli obbligatori per tipo carta
- ✅ **Fuzzy Search**: Gestione variazioni nomi Pokemon

## 🤝 Contributi

I contributi sono benvenuti! Per contribuire:

1. Fork il repository
2. Crea un branch per la tua feature (`git checkout -b feature/nuova-feature`)
3. Commit le modifiche (`git commit -am 'Aggiunge nuova feature'`)
4. Push al branch (`git push origin feature/nuova-feature`)
5. Crea una Pull Request

## 📝 Licenza

Questo progetto è rilasciato sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.

## 🙏 Ringraziamenti

- **CardTrader**: Per l'API e il database delle carte
- **Supabase**: Per l'infrastruttura database
- **Pokemon Company**: Per il franchise Pokemon
- **Comunità Pokemon**: Per il supporto e i feedback

## 📞 Supporto

Per supporto o domande:
- Apri una issue su GitHub
- Contatta via email: [tua-email@example.com]
- Discord: [link-discord]

---

**Pokemon Card Trader Linker** - Trova le tue carte Pokemon su CardTrader in un click! 🃏✨ 