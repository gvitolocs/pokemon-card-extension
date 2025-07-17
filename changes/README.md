# Sistema di Tracciamento Modifiche

## 📁 Cartella `changes/`

Questa cartella contiene tutti i log delle modifiche fatte all'estensione Pokemon Card Trader Linker.

### 🎯 Scopo
- **Tracciare** tutte le modifiche fatte al codice
- **Documentare** il motivo e i dettagli di ogni modifica
- **Organizzare** le modifiche in file di 10 modifiche ciascuno
- **Mantenere** una cronologia completa per sviluppatore e assistente

### 📋 Struttura File

```
changes/
├── README.md                    # Questo file di spiegazione
├── changes_log_001.txt          # Modifiche 1-10
├── changes_log_002.txt          # Modifiche 11-20 (quando creato)
├── changes_log_003.txt          # Modifiche 21-30 (quando creato)
└── ...
```

### 📝 Formato Log

Ogni modifica include:
- **Numero modifica** e data
- **File modificato**
- **Tipo di modifica** (correzione, aggiunta, rimozione, ecc.)
- **Descrizione** breve
- **Dettagli** specifici
- **Impatto** sulla funzionalità

### 🔄 Sistema di Rotazione

- **Ogni 10 modifiche** viene creato un nuovo file
- **File precedente** rimane per riferimento storico
- **Numerazione progressiva** (001, 002, 003, ecc.)
- **Ultimo file** sempre attivo per nuove modifiche

### 🚫 Non Incluso nel Manifest

La cartella `changes/` **NON** è inclusa nel `manifest.json` perché:
- È solo per **documentazione** e **tracciamento**
- Non influisce sul **funzionamento** dell'estensione
- Mantiene il **manifest pulito** e **leggero**

### 📊 Stato Attuale

**File attivo:** `changes_log_001.txt`
**Modifiche registrate:** 10/10
**Prossimo file:** `changes_log_002.txt` (alla modifica #11)

### 🎯 Vantaggi

1. **Cronologia completa** di tutte le modifiche
2. **Facile debugging** quando qualcosa non funziona
3. **Documentazione** per sviluppatori futuri
4. **Tracciamento** delle decisioni di design
5. **Rollback** facilitato se necessario

### 📝 Come Usare

1. **Leggi** i log per capire cosa è stato modificato
2. **Cerca** modifiche specifiche per file o tipo
3. **Verifica** l'impatto di modifiche precedenti
4. **Pianifica** modifiche future basandoti sulla cronologia

---
*Sistema creato per mantenere traccia di tutte le modifiche all'estensione Pokemon Card Trader Linker* 