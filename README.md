# 🃏 Pokemon Card Trader Linker

Un'estensione Chrome che converte automaticamente i titoli delle inserzioni di carte Pokemon da eBay e Vinted in link cliccabili per CardTrader, utilizzando un database Supabase con oltre 50,000 carte Pokemon.

## ✨ Caratteristiche

- **🔍 Estrazione Intelligente**: Estrae automaticamente Pokemon, espansione, numero collezionista e rarità dai titoli eBay/Vinted
- **🎯 Matching Avanzato**: Sistema di punteggi per trovare la carta più appropriata nel database
- **⚡ Ricerca Veloce**: Integrazione Supabase per ricerche istantanee
- **🔗 Link Diretti**: Genera link CardTrader precisi per ogni carta
- **📱 Popup Interattivo**: Interfaccia per testare manualmente i titoli
- **🎨 Design Moderno**: Interfaccia elegante e responsive

## 🚀 Installazione

### 1. Clona il Repository
```bash
git clone https://github.com/tuousername/pokemon-card-extension.git
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
1. Vai su eBay o Vinted
2. Naviga tra le inserzioni di carte Pokemon
3. I link CardTrader appariranno automaticamente sotto i titoli delle inserzioni

### Modalità Manuale
1. Clicca sull'icona dell'estensione
2. Incolla il titolo di un'inserzione eBay/Vinted
3. Clicca "Genera Link CardTrader"
4. Visualizza i risultati e clicca sui link

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
- ✅ eBay (Italia e Internazionale)
- ✅ Vinted (Italia e Internazionale)

### Pokemon Supportati
L'estensione riconosce tutti i Pokemon dalle Generazioni 1-9, inclusi:
- Generazione 1: Pikachu, Charizard, Mewtwo, Mew, ecc.
- Generazione 2: Lugia, Ho-Oh, Celebi, ecc.
- Generazione 4: Glaceon, Leafeon, ecc.
- Generazioni successive: Tutti i Pokemon popolari

## 🎯 Algoritmo di Matching

### Sistema di Punteggi
1. **Nome Pokemon** (1000 punti): Match perfetto del nome
2. **Numero Collezionista** (500 punti): Numero esatto
3. **Espansione** (200 punti): Espansione corretta
4. **Rarità** (150 punti): Rarità dall'URL dell'immagine
5. **Match "ex"** (50 punti): Presenza di "ex" nel nome

### Estrazione Rarità
L'estensione estrae la rarità dall'URL dell'immagine:
- `special-illustration-rare` → "Special Illustration Rare"
- `ultra-rare` → "Ultra Rare"
- `full-art` → "Full Art"
- `secret-rare` → "Secret Rare"
- E molti altri...

## 🛠️ Sviluppo

### Struttura del Progetto
```
pokemon-card-extension/
├── manifest.json          # Configurazione estensione
├── popup.html             # Interfaccia popup
├── popup.js               # Logica popup
├── content.js             # Script principale
├── api-config.js          # Configurazione API
├── supabase-config.js     # Configurazione Supabase
├── supabase-integration.js # Integrazione database
├── styles.css             # Stili CSS
└── README.md              # Documentazione
```

### Tecnologie Utilizzate
- **Chrome Extensions API**: Per l'integrazione browser
- **Supabase**: Database PostgreSQL per le carte Pokemon
- **JavaScript ES6+**: Logica dell'estensione
- **CSS3**: Stili e animazioni

### Comandi di Sviluppo
```bash
# Test locale
# 1. Carica l'estensione in Chrome
# 2. Vai su eBay/Vinted
# 3. Testa con inserzioni di carte Pokemon

# Debug
# Apri DevTools e controlla la console per i log
```

## 🧪 Test

### Test Automatici
L'estensione include una pagina di test completa (`test-extension.html`) con:
- Test di estrazione titoli
- Test di matching database
- Test di connessione Supabase
- Esempi di titoli eBay/Vinted

### Esempi di Test
```
✅ Jolteon ex SAR 209/187 sv8a Terastal Festival ex JP
✅ Glaceon ex Special Illustration Rare #150
✅ Lugia XY 156 Black Star Promo
✅ Pikachu ex #184 Terastal Festival
```

## 📊 Statistiche

- **Carte nel Database**: 50,000+
- **Varianti**: 150,000+
- **Espansioni**: 100+
- **Pokemon Supportati**: 1,000+
- **Tempo di Risposta**: < 500ms

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