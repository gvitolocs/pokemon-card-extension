# 📦 Guida all'Installazione - Pokemon Card Trader Linker

## 🚀 Installazione Rapida

### Passo 1: Scarica l'Estensione
1. **Scarica** tutti i file del progetto in una cartella
2. **Assicurati** che tutti i file siano presenti:
   ```
   pokemon-card-extension/
   ├── manifest.json
   ├── popup.html
   ├── popup.js
   ├── content.js
   ├── api-config.js
   ├── supabase-config.js
   ├── supabase-integration.js
   ├── styles.css
   ├── icon.svg
   ├── README.md
   └── INSTALLAZIONE.md
   ```

### Passo 2: Carica in Chrome
1. **Apri Chrome** e vai su `chrome://extensions/`
2. **Attiva** la "Modalità sviluppatore" (toggle in alto a destra)
3. **Clicca** "Carica estensione non pacchettizzata"
4. **Seleziona** la cartella `pokemon-card-extension`
5. **Conferma** l'installazione

### Passo 3: Verifica l'Installazione
1. **Cerca** l'icona 🃏 nella barra degli strumenti di Chrome
2. **Clicca** sull'icona per aprire il popup
3. **Testa** con un titolo di esempio:
   ```
   Jolteon ex SAR 209/187 sv8a Terastal Festival ex JP
   ```

## ✅ Verifica del Funzionamento

### Test Automatico
1. **Vai su eBay** e cerca "Pokemon cards"
2. **Naviga** tra le inserzioni
3. **Verifica** che appaiano i link CardTrader sotto i titoli

### Test Manuale
1. **Clicca** sull'icona dell'estensione
2. **Incolla** questo titolo di test:
   ```
   Glaceon ex Special Illustration Rare #150 Terastal Festival
   ```
3. **Clicca** "Genera Link CardTrader"
4. **Verifica** che appaia il risultato con il link

## 🔧 Risoluzione Problemi

### L'estensione non si carica
- **Verifica** che tutti i file siano presenti
- **Controlla** che il manifest.json sia corretto
- **Ricarica** l'estensione in `chrome://extensions/`

### I link non appaiono
- **Verifica** la connessione internet
- **Controlla** la console del browser per errori
- **Assicurati** di essere su eBay o Vinted

### Errore Supabase
- **Verifica** che le credenziali siano corrette
- **Controlla** che il database sia accessibile
- **Prova** a ricaricare la pagina

## 🎯 Primi Passi

### 1. Testa con eBay
1. Vai su `https://www.ebay.it`
2. Cerca "Pokemon cards"
3. Naviga tra le inserzioni
4. Verifica che appaiano i link CardTrader

### 2. Testa con Vinted
1. Vai su `https://www.vinted.it`
2. Cerca "Pokemon"
3. Naviga tra le inserzioni
4. Verifica che appaiano i link CardTrader

### 3. Usa il Popup
1. Clicca sull'icona dell'estensione
2. Prova con diversi titoli di esempio
3. Verifica i risultati e i link generati

## 📱 Funzionalità Disponibili

### Modalità Automatica
- ✅ **Rilevamento automatico** delle inserzioni Pokemon
- ✅ **Link diretti** a CardTrader
- ✅ **Matching intelligente** delle carte
- ✅ **Estrazione rarità** dall'URL delle immagini

### Modalità Manuale
- ✅ **Popup interattivo** per testare titoli
- ✅ **Analisi dettagliata** dei risultati
- ✅ **Link multipli** per varianti
- ✅ **Debug informazioni** complete

## 🎨 Personalizzazione

### Configurazione Supabase (Opzionale)
Se vuoi usare il tuo database Supabase:
1. **Crea** un progetto Supabase
2. **Configura** le tabelle `cards` e `card_variants`
3. **Inserisci** le credenziali nel popup
4. **Salva** la configurazione

### Stili CSS
Puoi personalizzare l'aspetto modificando `styles.css`:
- Colori e gradienti
- Dimensioni e spaziature
- Animazioni e transizioni
- Responsive design

## 🔒 Sicurezza

### Credenziali
- ✅ Le credenziali Supabase sono sicure per uso client-side
- ✅ Nessuna chiave API CardTrader richiesta
- ✅ Nessun dato personale raccolto

### Permessi
- ✅ Solo accesso a eBay e Vinted
- ✅ Solo lettura dei titoli delle inserzioni
- ✅ Nessun accesso a dati personali

## 📞 Supporto

### Problemi Comuni
1. **L'estensione non funziona**: Ricarica la pagina e verifica la connessione
2. **Link non corretti**: Verifica che il titolo contenga informazioni sufficienti
3. **Errore database**: Controlla le credenziali Supabase

### Contatti
- **GitHub Issues**: Apri una issue per bug o feature requests
- **Email**: [tua-email@example.com]
- **Documentazione**: Leggi il README.md completo

---

**🎉 Congratulazioni!** L'estensione è ora installata e pronta all'uso. Buona caccia alle carte Pokemon! 🃏✨ 