# Extension Debug Logging

The extension cannot write directly into this `errors/` folder while it runs in Chrome. Runtime diagnostics are stored in a bounded `chrome.storage.session` debug log and can be exported from DevTools.

## Capture A Log

1. Load the unpacked extension and reproduce the inconsistent result, stale side panel, duplicate request, or tab-switch refresh.
2. Open the extension service worker DevTools from `chrome://extensions`.
3. Run:

```js
chrome.runtime.sendMessage({ action: 'getExtensionDebugLog' }, console.log)
```

4. Copy the returned `events` array into a dated file such as `errors/2026-05-24-extension-debug-log.md`.
5. Optional cleanup before a fresh run:

```js
chrome.runtime.sendMessage({ action: 'clearExtensionDebugLog' }, console.log)
```

## What To Compare

- `source`, `url`, and listing key: verify all events refer to the same marketplace page.
- `selectedClues`, `primaryClues`, `previewSignature`, and `selectionRevision`: confirm chip changes create a new signature and old responses are ignored.
- `background.search-cache-hit`, `background.search-duplicate-suppressed`, and `processor.search-skip`: identify cache reuse or duplicate suppression.
- `side-panel.owner-created`, `side-panel.write`, and `side-panel.write-suppressed`: check which request id owned the panel and why any write was ignored.
- `background.listing-scan-start`, `background.listing-scan`, and `background.listing-scan-merge`: follow one local photo scan through its ID, timing, hits, and final candidate merge.
- `background.on-device-scan`: inspect every detected box, detector confidence, Milo top-1, and up to eight Milo alternatives. These raw candidates remain logged even when their score is below the 0.65 panel threshold.
- `background.chip-fallback-start`, `background.chip-fallback-complete`, and `background.chip-fallback-failed`: identify any clue search that ran after the photo scan and exactly which rows it introduced.
- `background.side-panel-commit`, `side-panel.write`, and `sidepanel.render`: compare internal, published, stored, and actually rendered rows in order. Candidate summaries include card ID, name, collector, score, and source.
- `vinted.*`: all Vinted processor lifecycle events are forwarded with session and sequence IDs, mount state, cache/in-flight state, clues, and candidate rows.
- `sidepanel.iframe-reused` versus `sidepanel.iframe-url-changed`: confirm the embedded Pokoin page was intentionally kept or replaced.
- `api.response`, `api.failure`, and `api.extension-card-search.failure`: confirm endpoint, status, and timing without exposing auth tokens.

The log stays on the device, redacts token-like fields, truncates long strings, and keeps only the latest 1,200 events.
