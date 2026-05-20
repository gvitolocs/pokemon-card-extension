# 🃏 Pokemon Card Trader Linker

Chrome extension that turns Pokemon card listing titles from eBay, Vinted, CardTrader, and Cardmarket into Pokoin marketplace links.

## What It Does

- Detects card listings directly on supported marketplaces
- Extracts card metadata from listing titles
- Matches cards through Pokoin/Cardvault APIs
- Injects Pokoin buttons into listing UIs
- Opens matched Pokoin marketplace cards in Chrome side panel

## Current Architecture

The extension is split into focused modules:

- `content.js`: orchestration, fallback flow, and page patching logic
- `core/`: shared core logic (`ExtensionCore`, `CacheManager`)
- `processors/`: site-specific behavior (`EBAYE`, `VINT`, `CME`, `PromoFilter`)
- `data/`: title parsing (`TitleExtractor`)
- `ui/`: UI button handling (`ButtonManager`)
- `utils/`: URL generation (`UrlGenerator`)
- `config/`: Pokoin API and background configuration
- `ui-pages/`: popup/settings HTML and JS

## Installation

1. Clone this repository:

```bash
git clone https://github.com/gvitolocs/pokemon-card-extension.git
cd pokemon-card-extension
```

2. Open `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project folder

## Usage

### Automatic Mode

1. Open eBay, Vinted, or Cardmarket
2. Browse card listings
3. Wait for Pokoin buttons to appear

Button states:
- Gray: searching/matching in progress
- Green: match found and ready to open

### Manual Mode (Popup)

1. Click the extension icon
2. Paste a listing title
3. Generate the Pokoin link
4. Save cards to your local collection if needed

## Supported Sites

- eBay (regional and international domains)
- Vinted (regional and international domains)
- Cardmarket

## Configuration

The extension uses Pokoin/Cardvault APIs hosted at `https://pokoin.com`.

## Development

Primary files:

- `manifest.json`
- `content.js`
- `config/*.js`
- `core/*.js`
- `processors/*.js`
- `ui-pages/*`

Testing helpers:

- `tests/generate-icons.html`
- `tests/cardvault-api-smoke.test.js`

Run the Cardvault API smoke suite with:

```bash
node --test tests/cardvault-api-smoke.test.js
```

## Documentation

Technical documentation lives in `docs/`:

- `docs/README.md`: docs index
- `docs/INSTALLATION.md`: setup steps
- `docs/MODULAR_STRUCTURE.md`: module overview
- `docs/API_INTEGRATION.md`: API and auth behavior
- `docs/DATABASE_STRUCTURE.md`: legacy schema notes
- `docs/STANDALONE_SETUP.md`: legacy/standalone notes
- `docs/ICONS.md`: icon generation and placement

## Contributing

1. Fork the repository
2. Create a branch (`git checkout -b feature/your-feature`)
3. Commit (`git commit -m "Describe your change"`)
4. Push (`git push origin feature/your-feature`)
5. Open a pull request

## License

MIT. See `LICENSE` if present in your branch/release packaging.
