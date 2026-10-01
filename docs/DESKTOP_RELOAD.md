# Why Chrome still shows an old version

The overlay reads `chrome.runtime.getManifest().version` from the **loaded unpacked folder**, not from git, not from nezopt Desktop unless that is the folder you loaded.

Honcho `cursor-global` metadata:

- Mac repo mount: `/Users/giuseppe/mnt/nezopt/Projects/pokemon-card-extension`
- nezopt repo: `/home/nez/Projects/pokemon-card-extension`
- Desktop mirror (optional): `/home/nez/Desktop/pokoin-extension` ↔ Mac `~/Desktop/pokoin-extension`

If the overlay still says **v2.0.7**, Chrome’s Load unpacked path is still the old Desktop folder **and** the service worker was not Reloaded.

## Fix

1. `chrome://extensions`
2. Find Pokemon Card Trader Linker. Read the **path** under the version. It must end in `pokemon-card-extension` (repo), not a stale `pokoin-extension` Desktop copy, unless you just synced that copy.
3. Click **Reload**. Hard way: **Remove**, then **Load unpacked** on the repo folder.
4. Hard-refresh the Vinted tab.
5. Overlay must show `Pokoin.com v12.0.7`.

If you Load unpacked from **Skrivebord** (`/Users/giuseppe/Desktop/pokoin-extension`), that folder must be synced from nezopt first. After a Desktop sync, click the circular Reload on the same card until it says **12.0.7**.
