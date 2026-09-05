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
- `sidepanel.iframe-reused` versus `sidepanel.iframe-url-changed`: confirm the embedded Pokoin page was intentionally kept or replaced.
- `api.response`, `api.failure`, and `api.extension-card-search.failure`: confirm endpoint, status, and timing without exposing auth tokens.

The log redacts token-like fields, truncates long strings, and keeps only the latest 300 events.
