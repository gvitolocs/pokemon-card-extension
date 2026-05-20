# 2026-05-20 Chrome Extension Tab Errors

Captured from code inspection after Chrome extension error reports.

## Fixed sources

1. `loadConfig function not available`
   - Cause: Supabase/API config injection was removed, but `content.js` and `core/ExtensionCore.js` still warned when `loadConfig` was absent.
   - Fix: removed stale optional config loading calls.

2. Invalid DOM method calls
   - Cause: legacy code used translated method names like `inserisciBefore` and `contiene`.
   - Fix: replaced with native `insertBefore` and `contains`.

3. Missing action icon paths
   - Cause: background `updateIcon()` referenced root files like `icon-default.png`, `icon-green.png`, and `icon-red.png`.
   - Fix: switched to existing `icons/icon-32.png`.

## Still worth watching

- Network errors from content-script fetches can still happen if Pokoin API/CORS/network is temporarily unavailable. These paths now fail closed by returning no rows.
- If Chrome still reports errors after reloading the unpacked extension, capture the exact stack trace and add it here.
