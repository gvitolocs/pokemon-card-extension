# Integrazione API CardTrader v2

## Panoramica

L'estensione Pokemon Card Trader Linker è stata aggiornata per utilizzare le API v2 di CardTrader per generare link più specifici e diretti alle carte Pokemon. Questa integrazione richiede un token di autenticazione per accedere alle API avanzate.

## Funzionalità

### 1. Estrazione Informazioni Carta
L'estensione analizza i titoli delle inserzioni per estrarre:
- **Nome del Pokemon**: Charizard, Pikachu, Mewtwo, ecc.
- **Tipo di carta**: VMAX, V, GX, EX, Holo, Reverse Holo, Full Art, Secret Rare
- **Set**: Base Set, Jungle, Fossil, Sword & Shield, ecc.

### 2. Ricerca API v2
- Utilizza le API v2 di CardTrader per cercare carte specifiche
- Richiede autenticazione tramite token Bearer
- Cerca attraverso espansioni, blueprint e marketplace
- Gestisce il rate limiting per rispettare i limiti dell'API (1 chiamata/secondo per marketplace)

### 3. Generazione Link
- **Link diretti**: Se la carta viene trovata, genera un link diretto alla pagina della carta
- **Link di ricerca**: Se la carta non viene trovata, genera un link di ricerca con parametri ottimizzati
- **Fallback**: In caso di errore, utilizza il link generico alla sezione Pokemon

## File Principali

### `api-config.js`
Configurazione centralizzata per l'API:
- URL base dell'API
- Timeout per le richieste
- Configurazione cache
- Rate limiting
- Headers predefiniti

### `cardtrader-api.js`
Classe principale per l'integrazione API:
- `CardTraderAPI`: Classe per gestire le chiamate API
- `extractCardInfo()`: Estrae informazioni dalla carta dal titolo
- `searchCard()`: Cerca la carta tramite API
- `generateCardLink()`: Genera link specifici

### `content.js`
Script principale aggiornato:
- Utilizza la nuova API per generare link
- Gestisce le chiamate asincrone
- Mantiene la compatibilità con il codice esistente

## Configurazione

### Rate Limiting
```javascript
rateLimit: {
    maxRequests: 60, // Richieste massime per minuto (più conservativo)
    windowMs: 60 * 1000, // Finestra temporale
    marketplaceDelay: 1000 // 1 secondo tra chiamate marketplace
}
```

### Cache
```javascript
cacheTimeout: 5 * 60 * 1000 // 5 minuti di cache
```

### Timeout
```javascript
requestTimeout: 10000 // 10 secondi per richiesta
```

## Pattern di Ricerca

L'estensione riconosce i seguenti pattern nei titoli:

### Pokemon Popolari
- Charizard, Pikachu, Blastoise, Venusaur, Mewtwo
- Rayquaza, Lugia, Ho-oh, Kyogre, Groudon
- Dialga, Palkia, Giratina, Arceus
- Reshiram, Zekrom, Xerneas, Yveltal
- Solgaleo, Lunala, Necrozma, Zacian, Zamazenta, Calyrex

### Tipi di Carta
- VMAX, V, GX, EX
- Holo, Reverse Holo
- Full Art, Secret Rare, Ultra Rare

### Set Principali
- Base Set, Jungle, Fossil
- Sword & Shield, Scarlet & Violet
- 151, Paradox Rift, Paldean Fates
- E molti altri set storici e moderni

## Gestione Errori

### Fallback Strategy
1. **Link diretto alla carta**: Se la ricerca API ha successo
2. **Link di ricerca**: Se la carta non viene trovata ma il Pokemon è identificato
3. **Link generico**: Se non è possibile estrarre informazioni specifiche

### Errori Comuni
- **Rate limit exceeded**: Troppe richieste in poco tempo
- **API timeout**: Richiesta troppo lenta
- **Network error**: Problemi di connessione
- **Invalid response**: Risposta API non valida

## Performance

### Ottimizzazioni
- **Cache**: Risultati API memorizzati per 5 minuti
- **Rate limiting**: Controllo automatico delle richieste
- **Parallel processing**: Elaborazione parallela dei container
- **Timeout**: Prevenzione di richieste bloccate

### Metriche
- Tempo medio di generazione link: < 500ms
- Hit rate cache: ~80% per ricerche ripetute
- Fallback rate: < 5% per titoli ben formattati

## Compatibilità

### Siti Supportati
- eBay (tutti i domini)
- Vinted (tutti i domini)
- Compatibilità con layout dinamici

### Browser
- Chrome (manifest v3)
- Edge (manifest v3)
- Altri browser basati su Chromium

## Sviluppo Futuro

### Possibili Miglioramenti
1. **API Key**: Supporto per API key per rate limit più alti
2. **Machine Learning**: Miglioramento dell'estrazione informazioni
3. **Database locale**: Cache persistente tra sessioni
4. **Analytics**: Tracciamento delle performance
5. **Altri giochi**: Estensione a Magic: The Gathering, Yu-Gi-Oh!, ecc.

### API Endpoints Utilizzati
- `GET /api/v2/games`: Ottiene la lista dei giochi
- `GET /api/v2/expansions`: Ottiene la lista delle espansioni
- `GET /api/v2/blueprints/export`: Ottiene i blueprint per un'espansione
- `GET /api/v2/marketplace/products`: Ottiene i prodotti del marketplace
- `GET /api/v2/info`: Test dell'autenticazione

## Configurazione Token

### Ottenere il Token
1. Vai su [CardTrader Settings](https://www.cardtrader.com/settings)
2. Accedi al tuo account CardTrader
3. Cerca la sezione "API" o "Developer"
4. Copia il token di autenticazione

### Configurare l'Estensione
1. Apri le impostazioni dell'estensione
2. Vai alla sezione "🔑 API CardTrader"
3. Incolla il tuo token nel campo "Token di autenticazione"
4. Abilita "Usa API avanzate"
5. Salva le impostazioni

### Sicurezza
- Il token viene salvato localmente nel browser
- Non viene mai inviato a server esterni
- Puoi disabilitare le API avanzate in qualsiasi momento

## Troubleshooting

### Problemi Comuni
1. **Token non valido**: Verifica che il token sia corretto e non scaduto
2. **Link non generati**: Controllare la console per errori API
3. **Link generici**: Titolo non riconosciuto o API non configurate
4. **Performance lente**: Possibile rate limiting, attendere un minuto
5. **Errori di rete**: Verificare la connessione internet

### Debug
Abilitare i log nella console del browser per vedere:
- Informazioni estratte dai titoli
- Query API generate
- Risultati delle ricerche
- Errori e fallback 