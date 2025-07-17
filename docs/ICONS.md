# Generazione Icone

## Conversione da SVG a PNG

L'estensione richiede icone PNG in diverse dimensioni. Puoi convertire l'icona SVG in PNG usando uno di questi metodi:

### Metodo 1: Online Converter
1. Vai su https://convertio.co/svg-png/ o https://cloudconvert.com/svg-to-png
2. Carica il file `icon.svg`
3. Imposta le dimensioni:
   - 16x16 per `icon16.png`
   - 48x48 per `icon48.png`
   - 128x128 per `icon128.png`
4. Scarica i file PNG

### Metodo 2: Inkscape (Gratuito)
1. Apri `icon.svg` in Inkscape
2. File → Export PNG Image
3. Imposta le dimensioni e esporta

### Metodo 3: GIMP (Gratuito)
1. Apri `icon.svg` in GIMP
2. Immagine → Scala immagine
3. Imposta le dimensioni e salva

### Metodo 4: Photoshop
1. Apri `icon.svg` in Photoshop
2. File → Export As
3. Scegli PNG e imposta le dimensioni

## Dimensioni richieste

- `icon16.png` - 16x16 pixel (barra degli strumenti)
- `icon48.png` - 48x48 pixel (gestione estensioni)
- `icon128.png` - 128x128 pixel (Chrome Web Store)

## Posizionamento file

Dopo la conversione, posiziona i file PNG nella root del progetto:

```
pokemon-card-extension/
├── icon16.png
├── icon48.png
├── icon128.png
└── ...
```

## Note

- Assicurati che le icone siano quadrate
- Mantieni la trasparenza se presente
- Le icone devono essere chiare anche in dimensioni piccole
- Testa le icone in Chrome per verificare che si vedano bene 