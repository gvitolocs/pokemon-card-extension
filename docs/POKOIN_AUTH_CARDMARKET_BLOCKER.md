# Cardmarket Auth Observation Postmortem

Status: **resolved in code** (`58b57b4`, shipped in `7d90e40`). Keep this file as the live checklist, not as a current patch list.

## What Was Wrong

Pokoin production already had:

- `https://pokoin.com/extension/auth-bridge`
- `POST /api/cardmarket-scrape-observation` with CORS for `POST` and `OPTIONS`

The React SPA later dropped that route, so live Vercel returned **404 NOT_FOUND**
until `/extension/auth-bridge` was added again (`market/src/pages/ExtensionAuthBridge.jsx`,
`vercel.json` rewrite to `/market/index.html`). The page posts `pokoin-auth-token`
with `token.accessToken`.

The extension still expected `data.token.token` and omitted a top-level Cardmarket URL. Pokoin sends `data.token.accessToken` and requires `url`, `cardmarketUrl`, or `pageUrl`. Until those two mismatches were fixed, the only observation row was a deploy smoke test (`Hydreigon` / `114322` / `source = deploy-smoke-test`).

## What The Extension Does Now

`pokoin-auth-bridge.js` parses object or JSON-string messages and accepts:

- `type: POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE` with a string `token`, or
- `type: pokoin-auth-token` with `ok: true` and `token.accessToken`

It normalizes to `POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE`. `config/background.js` stores `chrome.storage.session.pokoinAuthSession.token`. `buildCardmarketObservationPayload()` includes top-level `url`, `title`, `hostname`, `structuredCard`, `cardmarketContext`, `match`, `promoteVerifiedLink`, `extensionVersion`, and `source`.

Do not reintroduce `data.token.token` as the only accepted shape.

## Remaining Product Gap

Live Cardmarket rows with `source = pokemon-card-extension` still need a signed-in Chrome check. The payload and token parser are not the open bug.

## Manual Test Checklist

1. Log into `https://pokoin.com` in the same Chrome profile used by the extension.
2. Open `https://pokoin.com/extension/auth-bridge`.
3. Confirm `pokoin-auth-bridge.js` receives a `pokoin-auth-token` message.
4. Confirm `chrome.storage.session.pokoinAuthSession.token` is populated.
5. Open a Cardmarket product page.
6. Confirm `buildCardmarketObservationPayload()` includes top-level `url`.
7. Confirm `fetch('https://pokoin.com/api/cardmarket-scrape-observation', ...)`
   is called with `Authorization: Bearer ...`.
8. Confirm the API returns `201`.
9. Confirm a new row appears in `marketplace_cm_scrape_observations` with
   `source = 'pokemon-card-extension'`.
