# 🃏 Pokemon Card Trader Linker

Chrome extension that turns Pokemon card listing titles from eBay, Vinted, CardTrader, and Cardmarket into Pokoin marketplace links.

## What It Does

- Detects card listings directly on supported marketplaces
- Extracts card metadata from listing titles
- Matches cards through Pokoin/Cardvault APIs
- Injects Pokoin buttons into listing UIs
- Opens matched Pokoin marketplace cards in Chrome side panel

## Current Architecture

The live product is a Manifest V3 matching engine. Marketplace processors send selected clues to the background service worker, which searches Pokoin/Cardvault and opens matched cards in the Chrome side panel.

- `config/background.js`: service worker, search, side-panel ownership, Cardmarket observations, session debug log
- `processors/`: site-specific overlays and parsers (`VINT`, `EBAYE`, `CME`, `PromoFilter`)
- `pokoin-auth-bridge.js`: Firebase token bridge on `https://pokoin.com/extension/auth-bridge`
- `ui-pages/sidepanel.html`: embedded Pokoin marketplace page
- `content.js`: orchestration and leftover compatibility path; Cardmarket/Vinted product pages belong to their processors
- `core/`, `data/`, `ui/`, `utils/`: shared helpers still loaded by the content-script bundle
- `ui-pages/popup.html` and `settings.html`: older manual surfaces, not the overlay workflow

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

1. Open eBay, Vinted, Cardmarket, or CardTrader
2. Browse card listings
3. Wait for Pokoin buttons to appear

Button states:

- Gray/loading: matching in progress (Cardmarket compact gray)
- Matched: `Pokoin.com (N)` with a high-confidence count. Vinted stays Pokoin blue. Cardmarket switches to compact bright blue.
- Click opens the Chrome side panel for the current tab, not a new browser tab.

### Manual Mode (Popup)

The popup can still generate a link from a pasted title. Day-to-day matching is the marketplace overlay plus side panel.

## Supported Sites

- eBay (regional and international domains)
- Vinted (regional and international domains)
- Cardmarket
- CardTrader card pages

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
- `tests/extension-workflow.test.js`

Run the focused workflow suite with:

```bash
node --test tests/extension-workflow.test.js
```

Run the live Cardvault API smoke suite with:

```bash
node --test tests/cardvault-api-smoke.test.js
```

## Documentation

Technical documentation lives in `docs/`:

- `docs/README.md`: docs index
- `docs/EXTENSION_WORKFLOW.md`: overlay, side-panel, and matching rules
- `docs/EXTENSION_AGENT_HANDOFF.md`: runtime, APIs, and remaining work
- `docs/INSTALLATION.md`: setup steps
- `docs/MODULAR_STRUCTURE.md`: module overview
- `docs/API_INTEGRATION.md`: API and auth behavior
- `docs/POKOIN_AUTH_CARDMARKET_BLOCKER.md`: resolved auth/observation postmortem
- `docs/DATABASE_STRUCTURE.md`: legacy schema notes
- `docs/STANDALONE_SETUP.md`: legacy/standalone notes
- `docs/ICONS.md`: icon generation and placement
- `errors/EXTENSION_DEBUG_LOGGING.md`: session debug-log export

## Contributing

1. Fork the repository
2. Create a branch (`git checkout -b feature/your-feature`)
3. Commit (`git commit -m "Describe your change"`)
4. Push (`git push origin feature/your-feature`)
5. Open a pull request

## License

MIT. See `LICENSE` if present in your branch/release packaging.
