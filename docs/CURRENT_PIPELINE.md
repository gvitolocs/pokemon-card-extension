# Current pipeline (2026-09-14, v12.0.33)

Source of truth is this git repo on nezopt:

`/home/nez/Projects/pokemon-card-extension`

On the Mac that folder is:

`/Users/giuseppe/mnt/nezopt/Projects/pokemon-card-extension`

Chrome shows whatever folder was last **Load unpacked**, plus the last **Reload**. Editing files on nezopt does nothing until that Reload. Overlay text `Pokoin.com v…` is `manifest.json` `version` from the loaded folder.

## Load unpacked (do this)

1. `chrome://extensions` → Developer mode.
2. **Remove** the old Pokemon Card Trader Linker if it still says 2.0.7.
3. **Load unpacked** → select the **repo** folder above (the one that contains `manifest.json` next to `config/`, `processors/`, `ui-pages/`).
4. Confirm the card on `chrome://extensions` says **12.0.33**.
5. Open a Vinted **item URL** (`/items/…`), not Catalogo, homepage, member closet, or a photo lightbox on search results.
6. Overlay must say **Pokoin.com v12.0.33**. If it does not, Chrome is still on another folder. Canonical docs live in the Pi Obsidian vault `/home/nes/Obsidian/Pokoin`, not on Desktop.

Do not unzip `dist/pokemon-card-extension-2.0.0.zip` onto Samba. Copy unpacked files, or Load unpacked from the repo mount.

`~/Desktop/pokoin-extension` is only a mirror. It is not the Mac Projects mount. If Desktop still shows 2.0.7 after a repo Reload, Chrome is loaded from Desktop: Remove, then Load unpacked from the Projects path.

## What the UI should say

- Vinted homepage / Catalogo / closet: idle copy until the user clicks the side-panel tab screenshot. That capture POSTs identify-album and paints leftover tiles for cards in different posts. Overlay auto-identify stays item-URL only.
- Vinted/eBay item pages start with the reduced 40×40 Pokoin icon at the last `left`/`top` dock (page `localStorage` so a reload does not flash at 12px). If the **side panel is open**, listing scan starts even while that icon stays collapsed. Closing the panel stops auto-scan on the next listing. Click the reduced icon to expand and scan when the panel is closed. Click the expanded Pokoin.com header to refresh identify. X collapses. Overlay rows iframe the western EN Pokoin desk in the side panel.
- Singles side-panel: iframe the western EN Pokoin desk in the panel. Do not open a Pokoin tab and do not show an Open Pokoin page button. `pokoin-origin` drops `X-Frame-Options` and allows `chrome-extension:` frame-ancestors. Two or more leftover tiles stay the art-cut grid. CardTrader uses `public_id = ct_id * 2`.
- Album side-panel title: `N cards` (no “in album”) plus the gold last-median PKN total of the tiles still on screen. Hide × updates both.
- Overlay list first row: `ALL` when there are two or more matches. One match hides ALL and shows only that card. Overlay ALL restores the art-cut tile grid for every match. An overlay row, or a one-card Vinted/eBay listing, iframes that card’s western EN Pokoin desk with the same edge-to-edge CardTrader chrome. Never leftover-embed. Listing chips start **unpressed**. Description names (Pikachu on a lot) can stay visible on albums but do not Cardvault-search until clicked. A **LOTTO/album** listing keeps every identify uniqueHit, including 2+ box extra photos above 0.50 (Zacian on Lotto JP). Duplicate leftover printings of the same card overlay onto one stacked tile before that grid (Alolan Meowth 118 LT twice is one tile).
- Album tiles crop the illustration window with the same CSS art-cut as the pokoin-web searchbar popup (`--art-left: 0.105`, `--art-top: 0.135`, `--art-width: 0.79`, `--art-height: 0.33`). `_homepage.webp` is still a full-card scan. EN / JP / CN are always in the tile chrome; missing packs stay disabled. Default is **EN** when a western public_id exists, **JP** for Japanese-only leftovers (Rocket Gang), **CN** for Chinese-only leftovers (CS4a). Identify `public_id` stays the scan match. A **one-card listing insert** and a **selected overlay row** iframe the western EN/EUR Pokoin desk when that leftover sibling exists (JP Thievul → EN desk, not leftover-embed and not the JP identify page). Never leftover-embed. Leftover tiles do **not** show “N versions” — `print-langs.v` is every catalog row with that English name. Desk “View all N versions” is the CardTrader lineage. **CardTrader is the target model** (`docs/CARDTRADER_MODEL.md`): versions are that same card as Japan printed it and as the West later released that expansion (Nihil Zero → Perfect Order), not every row named Espurr. Pokoin desk today only lists same-set siblings (cap 8).

## Identify

Live recognition runs **only in the extension**: bundled TCG YOLO + Milo 128-d on standard WASM, searched against the packaged western catalog (`pokemon_western` leftovers plus Pokemon Card Back embeds). Card-back and Blank Filler hits are ignored. There is no CardScan API endpoint or remote identify fallback. Listing identify starts when the side panel is open on a Vinted `/items/{id}` URL or a Cardmarket `/Products/Singles/{expansion}/{card}` product URL, even if the overlay stays collapsed. Closed panel still does not search on navigation. Cardmarket catalog, search, and expansion-only Singles pages stay Scan-tab-only. Typed Add clue still re-identifies. Chip clicks still Cardvault-search without a new identify.

| Kind | Request | Boxes |
|---|---|---|
| Every listing insertion | On-device YOLO+Milo western, else `POST /identify-album?live=1&top_k=1` | up to 24 YOLO boxes per photo |
| Fallback | `POST /identify?live=1&album=1&top_k=1` | same album catalog and box limit |

Do not send `timeoutMs: 0`. Desk ids are `public_id`; never double a TCGPlayer `id`. Camera `/identify?catalog=pokemon_generic&top_k=8` is unused for marketplace listing photos. After scan, 2+ boxes still render as album rows; a 1-box photo can still show as a single.

## Listing kind

Album text: `album`, `binder`, `raccoglitore`, `lotto`/`lot`, `bundle`, binder pages, `set completo`, or quantity 2+ carte. Title album wins over description `singole`.

Not album by itself: Italian `collezione` / `collection` (“carta da collezione”).

Album-view from scan: max YOLO boxes on **one** photo, not the sum of front+back. Extra gallery photos of that same page do not replace those hits with low-score lookalikes or a second leftover of the same name. Vinted overlay and listing identify run only on `vinted.*/items/{id}` product URLs. Catalogo, homepage, member closets, and gallery lightboxes stay quiet (`enableListingScan` false) so they do not POST feed pictures to cardscan.

## Search

- Identify lookalikes are the singles candidate pool on first load; selected chips rank that pool.
- Clicking a listing/user chip runs Cardvault search into the overlay and side panel. It does not re-POST identify.
- Typing Add clue forces a new listing identify and a Cardvault search. Name-incompatible album uniqueHits (Raikou/Blaziken for a Koraidon clue) do not replace that search.
- Chip-search is also fallback when scan is empty, disabled, or (named singles/albums) lookalikes are not name-compatible.
- Overlay must not wait for identify (tokens-ready).
- Chip-search fallback stays 8 rows. Album overlay/panel lists are uncapped.
- Unnamed albums must not chip-search truncated titles (`Album pieno di`).
- `pokoin.com` chip-search is Cloudflare **403** from nezopt; Cardvault works from the Mac.

## Debug log

From the extension service worker DevTools:

```js
chrome.runtime.sendMessage({ action: 'getExtensionDebugLog' }, console.log)
```

Paste into `errors/YYYY-MM-DD-extension-debug-log.md`. Compare `url`, `listingKind`, `listingScanHits`, `listingScanError`, `extensionVersion`.

## Recent versions

- **12.0.34** Offscreen scan pipelines the two models: YOLO detects photo N+1 while Milo embeds photo N's boxes. Each finished photo streams back to the service worker (`onDeviceIdentifyAlbumPhoto`, scanId-filtered) and merges provisional rows into the side panel while later photos still infer; the final scan-merge stays authoritative and clears `progressiveScanId`.
- **12.0.21** Bundled Pokemon Card Back embeds so a TCG back is ignored like Blank Filler instead of nearest-neighbor Aipom/Horsea. Front+back singles stay one leftover tile; a late scan merge cannot expand that one-card panel with a 1-box extra below 0.80. Last-median only fills PKN on rows already on screen.
- **12.0.33** Desk iframe has no `allow="popups"` (Chrome does not recognize that Permissions-Policy feature). Session `postMessage` waits until the iframe is actually pokoin.com, then uses `*` so it does not target the empty `chrome-extension://` about:blank document.
- **12.0.32** Framed Best Deal CT/CM/VT clicks open a Chrome tab via `chrome.tabs.create`. Credentialless `window.open` is blocked, and apex `/api/cardtrader-redirect` 403s, so the extension maps even `public_id / 2` to CardTrader and fetches Cardmarket redirects from `api.pokoin.com`.
- **12.0.31** Automatic listing identify YOLO-runs every gallery photo (cropped on-page pixels when visible, then remaining CDN URLs) and unions uniqueHits like Scan tab. Title "singles" no longer keeps only top1.
- **12.0.30** Listing auto-identify fetches Vinted/eBay photos in the service worker and sends `{base64,type}` into the COEP offscreen document. Scan tab already used screenshot blobs; CDN photos have no CORP/ACAO so offscreen `fetch(imageUrl)` was empty.
- **12.0.29** Vinted overlay runs on every country host including vinted.dk. CardTrader leftover JPEG `{ct_id}_` confirms the desk public_id. Desk iframe sets `pokoin_embed=1` so pokoin-web talks to api.pokoin.com and does not replace the card with the Pikachu downtime page.
- **12.0.28** CardTrader Pokoin button unhides the side-panel desk iframe before setting src, so Chrome paints pokoin.com instead of a black panel.
- **12.0.27** Scan tab captures CardTrader/Cardmarket visible photos from the page MAIN world (isolated-world canvas taints same-origin thumbs). Cardmarket `/Products/Singles/{expansion}/{card}` pages auto-identify listing photos when the side panel is open. Catalog, search, and expansion-only Singles URLs stay Scan-tab-only.
- **12.0.26** Open-panel auto-scan waits for the listing gallery: `__NEXT_DATA__` photos must match `/items/{id}`, and a later photo count growth re-identifies instead of keeping the first og:image/thumb scan.
- **12.0.25** Credentialless Pokoin desk iframe receives the stored auth session via `postMessage` (`POKOIN_EXTENSION_DESK_SESSION`). Scan tab viewport rows stay when listing identify arrives on the same URL. Weak Milo top1 below 0.65 does not fill singles identity. Cardvault does not retry `AbortError` (the 6s timeout storm).
- **12.0.24** Same marketplace-only Scan tab as 12.0.23, rebuilt for Mac Desktop Load unpacked (`pokemon-card-extension-12.0.24` via Pi jump).
- **12.0.23** Scan tab drops `<all_urls>`. Capture is Vinted, eBay, Instagram, and Facebook (plus CardTrader/Cardmarket). Side-panel Scan reads visible photos when `captureVisibleTab` still wants all_urls or activeTab.
- **12.0.22** Leftover EN/JP/CN buttons keep live `marketplace-version-set` packs. Bundled `print-langs.json` no longer overwrites a JP sibling the overlay already showed (Dark Dragonair EX Team Rocket Returns → JP Silver Deck Kit).
- **12.0.20** One-card / selected overlay row / CardTrader restore the in-panel Pokoin desk iframe. `pokoin-origin` allows chrome-extension framing and fetches origin without the extension iframe Referer. Never auto-open a Pokoin tab. Two or more leftover tiles stay the art-cut grid.
- **12.0.16** Open side panel starts the listing scan even if the overlay stays collapsed. Open vs closed is remembered (`pokoin-side-panel-lifecycle` port, session tab ids, local `pokoinSidePanelPreferredOpen`). Closed panel still does not search on navigation. Analyzing copy replaces Ready to analyze while a scan is in flight.
- **12.0.15** Leftover/CDN tile `<img>` uses `crossorigin=anonymous` so COEP `require-corp` does not blank artwork. Keep WASM `require-corp`. Host permission includes `https://cdn.pokoin.com/*`. Overlay Pokoin button is red while scanning and green when results are ready; unmatched stays muted blue.
- **12.0.17** Marketplace one-card / selected overlay rows briefly painted leftover art-cut tiles while pokoin.com desk iframes were blank under `X-Frame-Options: SAMEORIGIN` (superseded by 12.0.20). Scan tab briefly restored `<all_urls>` for `captureVisibleTab`; **12.0.23** removes it again.
- **12.0.14** Visible-tab screenshots are serialized below Chrome's capture quota. If Chrome retains quota state across a service-worker restart, the extension lets the rolling window expire and retries the user scan once instead of showing `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`.
- **12.0.13** EN / JP / CN buttons hydrate from `GET /api/marketplace-version-set?cardId={public_id}`. Each returned printing maps by authoritative expansion `nationality` (`western` → EN, `japanese` → JP, `chinese` → CN); the bundled `print-langs.json` remains the offline fallback.
- **2.0.7** Desktop copy Giuseppe was running: `timeoutMs: 0`, `collezione` as album keyword, 1-box album fallback, “N cards in album”.
- **2.0.9** hang fix: identify timeouts, `collezione` not album, album title beats `singole`, identify failure writes the panel.
- **2.0.10** albums use live `multi=1` + `pokemon_western`.
- **2.0.11** side-panel count: `1 card` / `N cards`.
- **2.0.12** this doc + Load-unpacked instructions (Reload stamp).
- **2.0.13** leftover-JPEG scan: singles and albums use `pokemon_generic` / `public_id`; live `/identify-album` is routed on peer1 Caddy.
- **2.0.14** western leftover embed is **display-only**; EUR/JP/CN does not change desk id. Target product model is CardTrader (`docs/CARDTRADER_MODEL.md`). Identify still `pokemon_generic`.
- **2.0.15** every marketplace listing insertion uses live `/identify-album` (fallback `/identify?album=1`). Text kind no longer picks the 1-box singles `/identify` hop.
- **2.0.16** CardTrader printings pipeline: local leftover gallery + Qwen 3.8 27B labels reprint vs alt; peer2 `pokoin_card_printings` / `pokoin_card_version_groups`; western embed stays display-only.
- **2.0.17** Scan singles with print-lang versions default the leftover embed to `pokoin.com/card-images` western JPEG. EUR / JP / CN only switches the scan. The matched `public_id` stays the desk link.
- **2.0.18** Drop `Blank Filler Card` from album/scan tiles and side-panel rows. Binder filler sleeves are not marketplace cards.
- **2.0.19** Album tiles use homepage `_homepage.webp` (`card-images/{public_id}_{slug}_homepage.webp`). Leftover EUR/JP/CN scans stay on singles leftover embed.
- **2.0.20** Album tiles keep the rectangular `_homepage.webp` artwork cut and restore EN / JP / CN under each tile. Buttons switch homepage crops by language id; leftover full-card JPEGs stay on singles leftover embed.
- **2.0.21** Album tiles use the searchbar popup art-cut CSS (illustration window on the full-card scan). `_homepage.webp` is not itself a crop.
- **2.0.22** EN / JP / CN default to EN whenever a western pack exists. A JP identify hit no longer presses JP. Desk `public_id` stays the match.
- **2.0.23** Clicking an overlay match opens that card's Pokoin marketplace page in the side-panel iframe. Album leftover tiles stay on the listing grid.
- **2.0.43** Overlay ALL restores the multi-card art-cut tile grid from a leftover embed or desk iframe. A selected overlay row still opens that one card.
- **3.0.3** Singles overlay name chips come from the item title. Description-only Pokemon names (Pikachu/Charizard SEO on a Rowlet listing) and `promo bgs` grading tokens are dropped. Album/lot listings still keep description names.
- **3.0.28** Vinted keeps high-confidence card name, full collector fraction, and expansion parsed from the listing title in the scan payload even while clue chips remain unpressed. Single-card certainty is `0.65`; a visual hit that conflicts with an exact title collector cannot replace the exact title/API row.
- **3.0.29** Side-panel progress copy describes the automatic local workflow: reading the listing, running the on-device scan, and matching against Pokoin. It no longer claims that selected chips are required or that Cardvault is being searched.
- **3.0.30** Singles scans request up to eight local Milo neighbors. The side panel remains focused on the single authoritative best card, while the Vinted floating overlay receives every visual candidate scoring at least `0.65`, sorted by descending similarity.
- **3.0.27** Side-panel tiles wait for bundled print-language hydration before first paint. When a language pack has no Pokoin homepage derivative, its authoritative CardTrader preview remains a valid button image; Mega Dragalge ex `780090` therefore enables JP `756152` immediately.
- **3.0.26** Scan visible tab treats the viewport as a multi-card surface and preserves every distinct Milo-recognized card. Raw YOLO boxes without a valid recognition are ignored instead of making an album; valid later hits are not collapsed to top1. Persistent viewport diagnostics include box, recognized-hit, row, id, and score details.
- **3.0.25** Local scan image messages use JSON-safe base64 plus MIME type instead of `ArrayBuffer`. Chrome serializes extension messages as JSON; the offscreen scanner decodes the payload into a byte-backed Blob before `createImageBitmap`, then runs bundled YOLO and Milo without a remote scan API.
- **3.0.24** Listing-scan rows finalize the current Vinted search signature, so a slower title/API response cannot repaint generic same-name cards afterward. Exact collector searches that the API rejects only when an expansion is present retry without the expansion and locally enforce the requested set; Jungle Pikachu 60/64 is the regression fixture.
- **3.0.23** Single-card certainty uses exactly one valid Milo hit at score ≥ 0.75 on a non-album listing. Rejected raw YOLO boxes (for example a weak detection on the side-panel thumbnail) no longer prevent the recognized card from replacing title-search alternatives.
- **3.0.22** The print-language build imports every cross-language illustration lineage from Peer2's authoritative `marketplace_search_candidates.version` groups and expansion nationality. The bundled index now contains 61,996 public ids, including 50,479 JP-enabled rows and 46,778 cross-language rows. Explicit reviewed links remain final overrides.
- **3.0.21** Current-tab capture runs the bundled scanner with rotations, classifies the result from distinct recognized hits instead of raw YOLO boxes from page chrome, and surfaces local runtime errors. A single recognized card at score ≥ 0.75 is authoritative. Meowstic BREAKpoint (`220966`) exposes its reviewed JP same-art printing (`642866`).
- **3.0.20** A certain single-card scan (exactly one YOLO box, one unique Milo hit, score ≥ 0.80) replaced title-search alternatives with exactly that card. Its 0.80 threshold is superseded by 3.0.21.
- **3.0.19** Scanning is WASM-only and fully local. WebGPU/JSEP was removed to eliminate its Chrome runtime logs; CardScan API endpoints, fallbacks, and host permission were removed. Includes the 3.0.17 JP fix.
- **3.0.18** The on-device scanner tried WebGPU first and fell back to WASM. Superseded by the WASM-only 3.0.19 runtime.
- **3.0.17** Mewtwo Evolutions (`236804`) now links its confirmed JP same-art printing (`276178`) in the tile language selector. The reviewed link is preserved by future print-langs rebuilds.
- **3.0.16** Listing and Scan tab run bundled TCG YOLO + Milo in an offscreen document (WebGPU, WASM fallback) against western leftover embeddings. Remote identify-album is fallback only.
- **3.0.15** One-card Vinted and eBay side panels use the same edge-to-edge Pokoin desk iframe as CardTrader (`direct-card-view`). Two or more leftover tiles stay the art-cut grid.
- **12.0.1** Host access briefly dropped `<all_urls>` in favor of `activeTab`; Scan tab from the side panel could not grant capture. Restored in **12.0.17**, then replaced in **12.0.23** with marketplace-only visible-photo capture.
- **3.0.13** The side-panel Current tab thumbnail stays hidden until a jpeg data URL paints. CSS no longer forces the empty `alt="Current tab"` img visible (broken-image icon). Capture uses the last focused http(s) tab.
- **3.0.12** Overlay dock keeps pixel `left`/`top` (not snap-to-12px edges). Page `localStorage` hydrates the icon on first paint so a reload does not flash at the default corner.
- **3.0.11** Reduced 40×40 Pokoin click expands, scans, and opens the side panel if it is not already showing. Expanded Pokoin.com click refreshes identify; X still collapses.
- **3.0.10** Overlay chips start unpressed (illustration and description names included). Unselected names do not Cardvault-search. Dense identify-album unions 2+ box extra photos at the 0.50 floor so a junk 6-box page does not hide Zacian 0.58 on the group photo. 1-box extras still need 0.80 only when the primary photo is dense.
- **3.0.9** Side panel Refresh is gone. The header shows a screenshot of the current Chrome tab; clicking it captures the viewport, POSTs identify-album, and paints leftover tiles for every uniqueHit (cards from different posts on catalog/search). Score 0.50 floor still applies.
- **3.0.8** Vinted/eBay listing identify waits for a click on the reduced 40×40 Pokoin icon. Visit does not POST cardscan. Overlay rows still open the desk.
- **3.0.7** Clicking one overlay row iframes the western EN Pokoin desk. Never leftover-embed. Overlay ALL stays the art-cut tile grid.
- **3.0.6** One leftover tile iframes the EN Pokoin desk. JSON APIs use `api.pokoin.com` (Bot Fight cannot be skipped on Free for `pokoin.com`).
- **3.0.5** Leftover PKN retries `api.pokoin.com` when Cloudflare 403s `pokoin.com` last-median, and reads sold-series `lastMedianPkn` when that thin route is missing on the API host.
- **3.0.4** Album leftover header paints gold last-median PKN next to `N cards` from row prices when tile nodes still show `…`. Overlay ALL must not drop that write.
- **3.0.2** Overlay and leftover tiles drop identify uniqueHits with Milo score 0.50 or less (Jolteon singles lookalikes). Dense binder pages still keep 0.51–0.79 hits.
- **3.0.1** Multi-page binders union every photo with 6+ YOLO boxes. The 0.80 extra-photo filter is only for sparse closeups, not other 9-card pages. Vinted also reads `__NEXT_DATA__` / JSON-LD gallery URLs so +9 photos are not limited to the five visible thumbs.
- **3.0.0** Dense album pages (6+ YOLO boxes on one photo) keep that binder page even when a hit is 0.75. Extra gallery photos cannot cover those cards with low-score lookalikes or EN/JP leftover doubles of the same name. One-box lots still union closeups.
- **2.0.68** Vinted homepage / Catalogo / closet side-panel copy is idle: **Open a listing** and **Pokoin matches cards on Vinted item pages.** It must not keep Matching selected chips or Searching Cardvault. Overlay, identify, and Cardvault stay off those pages.
- **2.0.67** Vinted and eBay overlay candidate rows paint last-median PKN in coin gold (`#ffcc03`) next to the name. Side-panel header total is unchanged.
- **2.0.66** Vinted homepage / Catalogo / closet side-panel copy is idle: **Open a listing** and **Pokoin matches cards on Vinted item pages.** It must not keep Matching selected chips or Searching Cardvault. Overlay, identify, and Cardvault stay off those pages.
- **2.0.65** The side-panel title row shows `N cards` plus the gold PKN total of visible leftover tiles (`GET /api/marketplace-card-last-median`). Hiding a tile drops that card from the count and the sum. Coin gold is `--pkn-gold: #ffcc03`.
- **2.0.64** Album leftover tiles overlay duplicate printings of the same leftover (Alolan Meowth 118 LT twice) onto one stacked tile before the grid. Identify `public_id` stays the first binder hit.
- **2.0.63** Japanese-only leftovers (Rocket Gang Dark Jolteon Lv.23) press JP, not EN. Keep the lookalike tile; EN stays pressed only when a western leftover public_id exists. Chinese-only leftovers still press CN.
- **2.0.62** JP leftover tiles default to a unique same-illustration EN leftover when CLIP left eur empty (Pikachu δ PCG-P 112 → EN Legend Maker 093/92). Equalized art-window pixels; identify `public_id` stays the scan match. Holon Phantoms 079 is a different pose and stays its own pack.
- **2.0.61** Leftover tiles show last-day median sold PKN (`GET /api/marketplace-card-last-median`) for the pressed EN/JP/CN leftover, defaulting to EN/EUR. The sticky header paints a bright total of visible tile prices. Listing floor is the fallback when no median exists.
- **2.0.60** Reduced 40×40 Pokoin icon stays reduced across Vinted/eBay listing navigation until the icon is clicked to expand. Collapsed persists in `pokoinOverlayDock`.
- **2.0.59** Album leftover hide/heart stay on each tile. They never paint over the sticky header (X on “cards”, heart on Refresh). The tile grid scrolls under a locked header.
- **2.0.58** Side panel no longer crashes on `print_langs` of null (empty selected row / ALL). Cardvault search and overlay scan merge do not wait to parse `print-langs.json`. Unique western leftover attach is a prefix map, not a nested scan of every group.
- **2.0.57** Missing leftover JPEGs (EN Mega Froslass 741826 and the same class of cards) are backfilled into `pokemon_generic` from the local gallery when marketplace `cdn_image_url` is empty. print-langs links JP identify hits to that unique western pack via mutual nearest-neighbor CLIP (Mega Froslass JP SIR 720194 → EN 741826). Reload alone cannot invent a catalog row.
- **2.0.56** Vinted overlay, Cardvault search, and listing identify run only on `/items/{id}` product URLs. Homepage, Catalogo, member closets, and gallery lightboxes stay quiet so they do not saturate cardscan with feed pictures.
- **2.0.55** Album/LOTTO uniqueHits stay the overlay and side-panel grid. An auto-selected title name (Silvally on a 6-card lot) must not collapse to leftover-embed JP. Chip search still wins when uniqueHits are name-incompatible (Koraidon vs Raikou). Leftover-embed only after an overlay row click.
- **2.0.54** One-card listing inserts iframe the western EN/EUR Pokoin desk when that leftover sibling exists. Identify `public_id` stays the scan match. Do not leftover-embed; do not open the JP identify page as the default.
- **2.0.53** One-card listing inserts iframe the identify Pokoin desk (JP Thievul stays that desk). Do not leftover-embed EN. Album ALL stays art-cut tiles; a selected album row can leftover-embed.
- **2.0.52** Album leftover tiles hydrate `data/print-langs.json` in the side panel and derive `_homepage.webp` from leftover JPEG stems. Do not invent `{public_id}_{english-name}_homepage.webp` (Iron Treads 058 VE / Luxray 068 TM).
- **2.0.51** One-card listing inserts leftover-embed the western EN scan (EN pressed). Overlay preview rows keep print_langs so a JP identify hit does not open the JP desk iframe.
- **2.0.50** Leftover tiles paint EN / JP / CN (desk print language). Western leftover key stays `eur` and still defaults when that pack exists. Do not label the western leftover EUR.
- **2.0.49** Album leftover tiles overlay a red × to hide that card on this listing for 3 days, and a heart that saves it to the Pokoin wishlist. Wishlisted tiles sort first.
- **2.0.48** Leftover tiles no longer paint `print-langs.v` (name-wide COUNT of every Iron Treads ex). Desk “View all N versions” is the lineage count.
- **2.0.47** Album leftover tiles label collector/expansion from the selected leftover slug (EUR Evolving Skies `095 · ES`, not identify CS4a). Language click updates that line.
- **2.0.46** Album leftover tiles always paint EUR / JP / CN in the tile chrome. Missing print-langs packs stay disabled; the matched leftover still fills the inferred language.
- **2.0.45** Chinese-only leftovers (CS4a, CSMPi with no western sibling) press CN. EUR stays the default only when a western public_id exists.
- **2.0.44** CN/JP identify tiles attach a unique western leftover sibling (Thundurus GX SM133 vs CSMPi) and default the scan, label, and tile link to EUR. Identify `public_id` stays the scan match.
- **2.0.42** Singles leftover embed defaults to EUR (not the UK desk iframe). EUR / JP / CN labels; EUR is pressed whenever a western pack exists.
- **2.0.41** eBay overlay uses the same dashboard chrome as Vinted: header + X, 320px shell, collapse to the 40×40 icon, and candidate rows include the card name.
- **2.0.40** eBay overlay uses the same tokens-ready / chip-search path as Vinted. Empty or chip search overwrites a side panel still titled for another listing in the same tab. Overlay ALL is hidden when there is only one match.
- **2.0.39** Overlay ALL is hidden when there is only one match. Two or more rows still start with ALL.
- **2.0.38** eBay overlay applies identify lookalikes (`pokoinListingScanMerged`). Porygon/Porygon2 are name clues; Cardvault retries `Porygon 2`.
- **2.0.37** The collapsed 40×40 Pokoin icon is the drag handle: host is 40×40 with pointer-events auto, no panel margin, immediate pointer capture. Click without a drag still expands.
- **2.0.36** CardTrader page `ct_id` maps to Pokoin desk `public_id = ct_id * 2`. Identify/Cardvault ids stay undoubled.
- **2.0.35** eBay overlay is draggable like Vinted. Drop snaps left or right and the dock persists in `pokoinOverlayDock`. A drag is not a click.
- **2.0.34** Typed Add clue re-identifies; clicking a listing/user chip Cardvault-searches the side panel. Overlay ALL still reuses cached rows.
- **2.0.33** Album tiles derive `_homepage.webp` from the leftover JPEG stem (`{ct_id}_{leftover-slug}`), same as marketplace homepage tiles. Do not invent `{public_id}_{english-name}_homepage.webp`.
- **2.0.33** Collapsed Vinted overlay icon is draggable. Drop snaps left or right and the dock persists. A drag is not a click.
- **2.0.32** Overlay list first row is ALL again (Vinted and eBay). Click ALL to restore the leftover tile grid without a new scan.
- **2.0.24** Overlay list first row is ALL and opens the album leftover tile grid. Individual overlay rows still open that card's Pokoin desk iframe.
- **2.0.29** Side panel always shows art-cut tiles with EN/JP/CN and versions. Overlay ALL and individual rows never open the Pokoin desk iframe.
- **2.0.26** Overlay ALL reuses cached preview rows and restores the leftover tile grid. Individual overlay rows still open that card's Pokoin desk iframe.
- **2.0.25** Overlay clue chips keep unique single words from listing text. Sliding title phrases like `Album Rivali Predestinati` are dropped; recognized card names, expansions, and collector codes stay multi-word.
