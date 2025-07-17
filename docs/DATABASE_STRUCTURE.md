# Database Structure - Pokemon Card Trader Linker

## Panoramica

Il database Supabase contiene le informazioni sulle carte Pokemon per il matching automatico. La struttura è ottimizzata per ricerche veloci e matching accurati.

## Tabelle

### 1. `cards` - Tabella principale delle carte

```sql
create table public.cards (
  name_en text null,                    -- Nome inglese della carta
  expansion_id integer null,            -- ID dell'espansione
  expansion_code text null,             -- Codice espansione (es: "SV", "SWSH")
  expansion_name_en text null,          -- Nome inglese espansione
  blueprint_id integer null,            -- ID univoco della carta
  constraint cards_blueprint_id_unique unique (blueprint_id)
) TABLESPACE pg_default;
```

**Campi principali**:
- `name_en`: Nome della carta (es: "Mew V", "Charizard VMAX")
- `expansion_name_en`: Nome espansione (es: "V Star Universe", "Dragon Frontiers")
- `expansion_code`: Codice espansione (es: "SV", "SWSH", "SM")
- `blueprint_id`: ID univoco per identificare la carta

### 2. `card_variants` - Varianti delle carte

```sql
create table public.card_variants (
  blueprint_id integer not null,        -- Riferimento alla carta principale
  collector_number text null,           -- Numero collezionista (es: "101", "TG02")
  language text null,                   -- Lingua della carta
  id serial not null,                   -- ID univoco della variante
  image_url text null,                  -- URL immagine della variante
  constraint card_variants_pkey primary key (id),
  constraint uniq_variant unique (blueprint_id, language, collector_number),
  constraint fk_cards_blueprint foreign KEY (blueprint_id) references cards (blueprint_id) on delete CASCADE
) TABLESPACE pg_default;
```

**Campi principali**:
- `blueprint_id`: Riferimento alla carta principale
- `collector_number`: Numero collezionista specifico
- `language`: Lingua della carta (es: "en", "it", "fr")
- `image_url`: URL dell'immagine della variante

## Relazioni

```
cards (1) -----> (N) card_variants
```

- Una carta può avere multiple varianti (diverse lingue, numeri collezionista)
- Ogni variante appartiene a una carta principale

## Query di Esempio

### 1. Cerca carte per nome Pokemon
```sql
SELECT * FROM cards 
WHERE name_en ILIKE '%mew%'
AND name_en NOT ILIKE '%deck%'
AND name_en NOT ILIKE '%booster%';
```

### 2. Cerca varianti con numero collezionista
```sql
SELECT cv.*, c.name_en, c.expansion_name_en 
FROM card_variants cv
JOIN cards c ON cv.blueprint_id = c.blueprint_id
WHERE cv.collector_number = '101';
```

### 3. Cerca carte per espansione
```sql
SELECT * FROM cards 
WHERE expansion_name_en ILIKE '%v star universe%'
AND name_en ILIKE '%mew%';
```

## Configurazione Supabase

### Credenziali
```javascript
const SUPABASE_CONFIG = {
    url: 'https://msngrrrihwudtnyjatlo.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbmdycnJpaHd1ZHRueWphdGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNTU2NTIsImV4cCI6MjA2NTkzMTY1Mn0.Y0D-FHepxqXznrg2W0n_NOJkgY--GOPJD4EoloK94Yo'
};
```

### Inizializzazione
```javascript
// In supabase-config.js
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
window.supabaseClient = supabaseClient;
```

## Strategie di Matching

### 1. Matching per Nome Pokemon
```javascript
// Cerca carte con nome Pokemon
const { data: cards } = await supabaseClient
    .from('cards')
    .select('*')
    .ilike('name_en', `%${pokemonName}%`)
    .not('name_en', 'ilike', '%deck%');
```

### 2. Matching per Espansione
```javascript
// Cerca carte per espansione specifica
const { data: cards } = await supabaseClient
    .from('cards')
    .select('*')
    .ilike('expansion_name_en', `%${expansion}%`);
```

### 3. Matching per Numero Collezionista
```javascript
// Cerca varianti con numero specifico
const { data: variants } = await supabaseClient
    .from('card_variants')
    .select('*, cards(*)')
    .eq('collector_number', collectorNumber);
```

## Indici Consigliati

Per ottimizzare le performance, considera di aggiungere questi indici:

```sql
-- Indice per ricerca per nome
CREATE INDEX idx_cards_name_en ON cards USING gin(to_tsvector('english', name_en));

-- Indice per ricerca per espansione
CREATE INDEX idx_cards_expansion_name ON cards USING gin(to_tsvector('english', expansion_name_en));

-- Indice per numero collezionista
CREATE INDEX idx_variants_collector_number ON card_variants(collector_number);

-- Indice per blueprint_id
CREATE INDEX idx_variants_blueprint_id ON card_variants(blueprint_id);
```

## Backup e Manutenzione

### 1. Backup Regolare
```sql
-- Backup completo delle tabelle
pg_dump -h your-host -U your-user -d your-database -t cards -t card_variants > backup.sql
```

### 2. Pulizia Dati
```sql
-- Rimuovi varianti duplicate
DELETE FROM card_variants 
WHERE id NOT IN (
    SELECT MIN(id) 
    FROM card_variants 
    GROUP BY blueprint_id, language, collector_number
);
```

### 3. Statistiche
```sql
-- Conta carte per espansione
SELECT expansion_name_en, COUNT(*) as card_count 
FROM cards 
GROUP BY expansion_name_en 
ORDER BY card_count DESC;
```

## Troubleshooting

### 1. Connessione Fallita
- Verifica le credenziali Supabase
- Controlla i permessi RLS (Row Level Security)
- Verifica la connessione internet

### 2. Query Lente
- Aggiungi indici appropriati
- Ottimizza le query con LIMIT
- Usa caching quando possibile

### 3. Dati Mancanti
- Verifica che le tabelle siano popolate
- Controlla i vincoli di integrità
- Verifica le relazioni tra tabelle 