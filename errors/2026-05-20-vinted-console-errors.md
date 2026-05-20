# 2026-05-20 Vinted Console Errors

Source screenshot: Vinted listing page `https://www.vinted.it/items/8965119476-carte-pokemon-tornadus-ex-bw96-stamp-legendary-treasure?referrer=catalog`

## Error 1: loadConfig warning

```text
⚠️ loadConfig function not available
Stack:
content.js:82 (initializeExtension)
content.js:31 (init)
content.js:25 (PokemonCardTraderLinker)
content.js:3832 (anonymous function)
```

Likely cause: `manifest.json` no longer injects `config/api-config.js`, but `content.js` still warns when `loadConfig` is unavailable. This is noisy rather than fatal.

## Error 2: Vinted global search fetch failure

```text
❌ [VINT] Error in global searchCardInDatabase call: TypeError: Failed to fetch
```

Likely cause: content-script fetch to Pokoin/Cardvault API failed from Vinted context. Check host permissions, API availability, CORS, and whether `https://pokoin.com/api/extension-card-search` returned a non-network failure.

## Next checks

- Remove or silence the stale `loadConfig` warning if no runtime config is required.
- Add better error details around `searchPokoinCardApi()` and `searchPokoinAutocomplete()` so failed endpoint/status/body are visible.
- Confirm `https://pokoin.com/*` host permission is present in `manifest.json`.
