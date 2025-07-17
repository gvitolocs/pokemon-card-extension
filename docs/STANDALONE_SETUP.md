# Pokemon Card Trader Linker - Setup Standalone

## Panoramica

Questa estensione Chrome è stata progettata per essere il più possibile standalone, riducendo le dipendenze esterne e migliorando l'affidabilità del matching.

## File Principali

### 1. `standalone-config.js`
- **Scopo**: Configurazione centralizzata per tutti i parametri dell'estensione
- **Contenuto**: Punteggi di matching, parole chiave, configurazioni UI
- **Vantaggio**: Facile da modificare senza toccare il codice principale

### 2. `content.js`
- **Scopo**: Script principale che processa le pagine eBay e Vinted
- **Funzionalità**: 
  - Estrazione informazioni dai titoli
  - Matching con database CardTrader
  - Aggiunta link cliccabili
- **Miglioramenti recenti**:
  - Matching più rigoroso per espansioni specifiche
  - Penalizzazioni per espansioni non corrette
  - Bonus ridotti per parole generiche

### 3. `manifest.json`
- **Scopo**: Configurazione dell'estensione Chrome
- **Dipendenze**: Tutti i file JavaScript necessari

## Configurazione Standalone

### 1. Configurazione Supabase
```javascript
// In standalone-config.js
supabase: {
    url: 'https://your-project.supabase.co',
    key: 'your-anon-key',
    fallbackEnabled: true,  // Usa fallback se Supabase non è disponibile
    localDataEnabled: true  // Abilita dati locali come backup
}
```

### 2. Configurazione Matching
```javascript
// Punteggi per diversi tipi di match
scores: {
    pokemonExact: 10000,           // Match esatto Pokemon
    expansionExact: 40000,         // Match esatto espansione
    vStarUniverse: 50000,          // Bonus speciale V Star Universe
    expansionMismatch: -30000      // Penalizzazione espansione sbagliata
}
```

### 3. Parole Chiave
```javascript
keywords: {
    important: ['vmax', 'vstar', 'sl', 'tg'],
    medium: ['ex', 'gx', 'v', 'shiny', 'promo'],
    generic: ['holo', 'rare'],     // Bonus molto bassi
    excluded: ['pokemon', 'card', 'game', 'tcg']
}
```

## Miglioramenti del Matching

### 1. Espansioni Specifiche
- **V Star Universe**: Match esatto richiesto
- **Dragon Frontiers**: Match esatto richiesto
- **Delta Species**: Match esatto richiesto

### 2. Penalizzazioni
- Carte con espansione sbagliata: -30,000 punti
- Parole generiche senza espansione: +1,000 punti
- Parole generiche con espansione: +2,000 punti

### 3. Bonus Speciali
- V Star Universe: +50,000 punti
- Trainer match: +100,000 punti
- Numero collezionista esatto: +50,000 punti

## Installazione Standalone

### 1. Clona il repository
```bash
git clone https://github.com/GiuseppeVitolo17/pokemon-card-extension.git
cd pokemon-card-extension
```

### 2. Configura Supabase (opzionale)
- Crea un progetto Supabase
- Aggiorna `standalone-config.js` con le tue credenziali
- Se non configuri Supabase, l'estensione funzionerà in modalità limitata

### 3. Carica l'estensione in Chrome
- Apri Chrome e vai a `chrome://extensions/`
- Abilita "Modalità sviluppatore"
- Clicca "Carica estensione non pacchettizzata"
- Seleziona la cartella del progetto

## Test del Matching

### Test Case: "Pokemon TCG - Mew V Star Universe"
**Risultato atteso**: Mew da V Star Universe
**Risultato precedente**: Mew da EX Legend Maker (sbagliato)

**Miglioramenti applicati**:
1. Bonus speciale per V Star Universe (+50,000 punti)
2. Penalizzazione per espansioni non corrette (-30,000 punti)
3. Bonus ridotti per parole generiche (holo, rare)
4. Controllo rigoroso del Pokemon nell'image URL

## Debug e Logging

### Abilita debug dettagliato
```javascript
// In standalone-config.js
debug: {
    enabled: true,
    logLevel: 'debug',
    showConsoleLogs: true
}
```

### Log di esempio
```
🎯 [CardTrader] V STAR UNIVERSE TROVATO: "v star universe" = "v star universe" -> +50000 punti
🚫 [CardTrader] PENALIZZAZIONE: Espansione "v star universe" non trovata in "ex legend maker" -> -30000 punti
```

## Personalizzazione

### Modifica punteggi
```javascript
// In standalone-config.js
scores: {
    pokemonExact: 15000,  // Aumenta il bonus per match Pokemon
    expansionExact: 60000 // Aumenta il bonus per espansioni
}
```

### Aggiungi nuove espansioni
```javascript
// In content.js, aggiungi pattern per nuove espansioni
const expansionPatterns = [
    /nuova espansione/i,
    // ... altri pattern
];
```

## Troubleshooting

### 1. Match sbagliati
- Controlla i log della console per vedere i punteggi
- Verifica che l'espansione sia estratta correttamente
- Controlla se ci sono penalizzazioni applicate

### 2. Estensione non funziona
- Verifica che tutti i file siano presenti
- Controlla la console per errori JavaScript
- Verifica le configurazioni in `standalone-config.js`

### 3. Performance lente
- Riduci il numero di risultati massimi in `ui.maxResults`
- Disabilita il debug dettagliato
- Verifica la connessione a Supabase

## Contribuire

1. Testa l'estensione con diversi titoli
2. Segnala match sbagliati con log dettagliati
3. Proponi miglioramenti al sistema di scoring
4. Aggiungi supporto per nuove espansioni 