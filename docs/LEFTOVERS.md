# Leftover inventory

This is the leftover map for `pokemon-card-extension`. Live matching is processors plus `config/background.js`. Everything below is still in the tree so a later agent does not treat it as an open matching bug.

Do not wire these leftovers back into search. Selected-chip ranking, printed collectors, and side-panel ownership stay in the background worker.

## Dead page-origin Cardvault fetches

`content.js` `searchCardInDatabase` now sends `searchCardForTitle`. These helpers still `fetch` `https://pokoin.com` from the marketplace page origin, but nothing calls them:

| Function | Lines | Endpoint |
|---|---|---|
| `resolveNameFromCardvaultTitle` | ~2998 | `POST /api/marketplace-autocomplete` |
| `enrichTitleInfoWithCardvaultName` | ~3034 | wrapper around the resolver |
| `searchPokoinCardApi` | ~3130 | `POST /api/extension-card-search`, then autocomplete |
| `searchPokoinAutocomplete` | ~3204 | `POST /api/marketplace-autocomplete` |

Supporting helpers used only by that dead fetch path:

- `structuredPayloadFromTitleInfo`
- `resolvedCardNameFromRow`
- `normalizeCardvaultRows`
- `candidateNameTermsFromTitle`
- `matchMatchesStructuredName`
- `isAllowedBaseSetFamilyMatch`
- `sortMatchesForPayload`
- `uniqueMatchesById`
- `legacyResultFromPokoinMatch`
- `legacyResultFromAutocompleteRow`
- `buildPokoinAutocompleteQuery`

`removeMarketplaceSearchNoise` and `compactSearchValue` in `content.js` are also only used by that dead cluster. The live copies live in `config/background.js`.

Tests: `content leftover searchCardInDatabase routes through the background worker` and `content.js leftover page-origin Cardvault fetches are unreferenced from live search`.

## Other unused functions in `content.js`

These are defined and never called. `content.js` never registers a runtime message listener.

| Function | What it was |
|---|---|
| `handlePopupSearch` | Popup-driven search |
| `handleAutoSearchCurrentPage` | Popup page-title scrape |
| `searchCardInDatabaseForPopup` | Popup Cardmarket-shaped search |
| `extractRarityFromImageUrl` | URL rarity guess |
| `extractAllWordsFromTitle` | Local title tokenizer for image scoring |
| `calculateImageUrlWordMatch` | Image-URL word overlap |
| `scoreAndValidateResults` | Local result scorer with hardcoded blueprint bonuses (`274416` Mew, `236583` Lucario jumbo, `294979` Fezandipiti) |
| `initializeUltraFast` (function and class method) | Never invoked; startup is `PokemonCardTraderLinker.init` |
| standalone `initializeExtension` (~592) | Duplicate of the class method; never invoked |

`calculateSimilarity` is only used from `extractTitleInfo` (live local name matching) and from dead `scoreAndValidateResults`.

## Inert fallbacks (called, then return)

| Function | Behavior |
|---|---|
| `patchVintedProductPage` | Warns and returns. VintedProcessor owns Vinted. Dead code after the `return` is unreachable. |
| `patchCardmarketProductPage` | Warns and returns. `processors/CME.js` owns Cardmarket. |

## Still live leftovers

These still run on some pages. They are compatibility, not the overlay product.

| Path | Behavior |
|---|---|
| `content.js` `processListing` | CardTrader/generic listing cards still insert a gray button and search immediately through background `searchCardForTitle`. eBay/Vinted/Cardmarket skip this when their processor is present. |
| `patchEbayProductPage` | Only if `EbayProcessor` is missing. Inserts a gray button and searches. |
| `window.extractTitleInfo` | Local title parser still used by processors when they delegate. |
| `generateCardTraderLink` | Compatibility name for a Pokoin card URL. Copies exist in `content.js`, `config/api-config.js`, and `utils/UrlGenerator.js`. |
| `PokemonCardTraderLinker` singleton | Real content-script bootstrap. Duplicates ideas from `ExtensionCore` / `CacheManager` / `ButtonManager`. |

## Loaded by `manifest.json`, never constructed

These files inject a class onto `window` and stop. No `new ...()` exists in runtime JS.

- `core/ExtensionCore.js` — poll removed, but the class is still unused
- `core/CacheManager.js`
- `ui/ButtonManager.js` — still creates a `CardTrader`-labeled template button in the constructor if it were constructed
- `data/TitleExtractor.js`
- `utils/UrlGenerator.js`

## UI not in the Manifest V3 action

`manifest.json` has `action.default_title` and no `default_popup`.

- `ui-pages/popup.html` / `popup.js` — old Pokemon Notes UI. Sends `autoSearchCurrentPage`; nothing listens.
- `ui-pages/settings.html` / `settings.js` — old settings page, not opened by the action.

The live UI is `ui-pages/sidepanel.html`.

## Processor leftovers

- `processors/VINT.js` `createProductButton` — labeled legacy, never called. Overlay creation is the live path.
- `processors/VINT.js` `searchCardInDatabase` — live adapter to background search, kept for name compatibility.

## Docs that must stay aligned

- Live search is background-only. Do not say leftover adapters still `fetch` Cardvault from the page.
- Installation does not open a toolbar popup. Verify with marketplace buttons and the side panel.
- `docs/STANDALONE_SETUP.md` is historical.

## Safe to delete later

Dead fetch cluster, unused scorers, unused popup handlers, unreachable Vinted fallback body, unused helper modules if the manifest script list is trimmed, popup/settings pages. Do not delete `extractTitleInfo`, CardTrader `processListing`, or processor `searchCardInDatabase` adapters without a dedicated pass.
