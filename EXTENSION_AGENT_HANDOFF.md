# Extension Agent Handoff

## Current State

This repository is the Chrome extension for matching marketplace card listings to Pokoin/Cardvault cards. The active runtime is Manifest V3, with marketplace processors in `processors/`, a background service worker in `config/background.js`, and the side panel UI in `ui-pages/`.

The extension is now centered on a selected-key-first workflow:

- Vinted and eBay render a top-left transparent overlay with a Pokoin button, selectable clue chips, and preview candidates.
- Selected chips are the canonical first search layer. Raw title scraping and autocomplete fallback happen only after selected-key search is unavailable or insufficient.
- Vinted/eBay selected payloads carry structured fields: `name`, `variation`, `variationTokens`, `collectorNumber`, `numericCollectorNumber`, `expansion`, `features`, `rarity`, and now `rarityAliases`.
- The background tries `POST /api/searchbar-token-predict` as the lightweight name-token step before heavier `POST /api/marketplace-autocomplete` canonicalization, except when a selected multi-word clue already is the structured search name. The autocomplete resolver caches by normalized query/language/source/selected clue signature, persists resolved LRU entries in `chrome.storage.session.pokoinSearchLruCache`, and skips standalone context tokens such as `holo`, `delta`, `illustration`, level text, expansion names, condition words, and collector numbers.
- Cardmarket uses a readiness-gated product parser and sends scrape observations to Pokoin after matching.
- CardTrader direct URLs use the blueprint id from the URL and bypass generic search.

## Recent Extension Changes

- **12.0.5 full local diagnostics:** The bounded, sanitized session log now keeps 1,200 events and traces scan IDs/timings, recognizer and chip-fallback candidates, side-panel commits/writes, and every render decision. Vinted forwards all processor lifecycle events so brief correct results can be compared with later overwrites without sending browsing data to a server.
- **12.0.4 scan-first side panel:** Automatic title/chip hydration can no longer bypass the listing-photo scan. Provisional clue rows stay hidden until scan merge, and the empty panel offers explicit listing-information and Chrome-screenshot actions with accurate progress labels.
- **12.0.3 hot scanner and direct image transport:** Supported marketplace tabs prewarm the offscreen YOLO/Milo sessions and bundled catalogue. Normal listing scans send their HTTPS image URLs to the offscreen document, which downloads them directly; JSON-safe Base64 remains only for captured screenshots and blob-only inputs.
- **12.0.2 overlay artwork-language badges:** Vinted and eBay candidate rows show only the available EUR/JP/CN badges from the bundled same-art `print-langs` lineage. Background search awaits language-index hydration before returning overlay candidates.
- **3.0.30 split overlay candidates from side-panel focus:** The bundled scanner requests `topK: 8` for marketplace listings. Vinted's floating overlay shows all local visual candidates at score `>= 0.65` in descending relevance, while the side panel keeps only the authoritative top-one card.
- **3.0.29 accurate scan labels:** Side-panel empty/progress states now describe the automatic Vinted listing read, bundled on-device photo scan, and Pokoin matching. Obsolete selected-chip collection and Cardvault-search wording is removed.
- **3.0.28 Vinted exact-title guard:** Unpressed title chips still encode high-confidence name, full collector fraction, and expansion into the listing scan payload. Single-card certainty is `0.65`, but a visual hit that conflicts with an exact title collector cannot displace the exact title/API row.
- **3.0.27 language-ready tile paint:** The side panel waits for bundled `print-langs.json` before its first state render. Album language buttons fall back to authoritative CardTrader version preview images when a Pokoin `_homepage.webp` derivative is unavailable, so Mega Dragalge ex `780090` enables JP `756152` immediately.
- **3.0.26 visible-tab multi-card scan:** Scan visible tab preserves every distinct Milo-recognized card in the captured viewport. Unmatched YOLO/page-chrome boxes do not create rows, while valid second and later cards are no longer collapsed to top1. `background.viewport-scan` persists box, recognized-hit, row, card-id, and score diagnostics.
- **3.0.25 Chrome-safe local scan transport:** Service-worker/offscreen messages carry each image as JSON-safe `{base64, type}` data. The offscreen scanner reconstructs a byte-backed Blob before `createImageBitmap`, so Chrome's JSON message serialization can no longer turn an `ArrayBuffer` into an undecodable image. YOLO and Milo remain fully bundled and local.
- **2.0.3 scan-primary ranking:** On Vinted/eBay product photos, identify lookalikes are the candidate pool and selected chips only rank that pool. Cardvault chip-search is fallback when scan is empty or disabled. Overlay tokens can show before identify finishes.
- **2.0.4 album/collector lots:** Album listings union uniqueHits from every identified photo, including one-box closeups. Overlay rows include the card name. Scan merge writes those rows into the open side panel; the panel must not chip-search a truncated album title such as `Album pieno di`.
- **2.0.5 album marketplace grid:** Album lots have no 8/24 row cap. The side panel lists every uniqueHit in binder reading order as clickable Pokoin marketplace tiles (card image, name, number/set, PKN price or Out of stock) and hides the single-card iframe.
- **2.0.6 live identify top_k:** `cardscan.pokoin.com/identify` rejects `top_k` above 8 with HTTP 422. Album identify uses `top_k=8` (clamped). 2.0.5’s `top_k=32` made every album photo fail, so the side panel fell through to Cardvault `"Album pieno di"`.
- **2.0.8 album Milo API:** Camera `/identify` stays `top_k<=8`. Album lots call `POST https://cardscan.pokoin.com/identify-album` (Milo 128-d, leftover-JPEG `pokemon_generic`, `identity: public_id`) and fall back to `/identify?album=1`. Overlay, side panel, and album photo lists stay uncapped. Singles galleries still scan at most two photos. Chip-search fallback stays eight rows.
- **2.0.10 live album multi-box:** Camera `/identify` stays 1-box `top_k<=8`. Album lots used live `/identify?live=1&multi=1&catalog=pokemon_western&top_k=1` while `/identify-album` was Caddy 404 (max 4 boxes).
- **2.0.15 always album identify:** Every marketplace listing insertion POSTs `/identify-album` (fallback `/identify?album=1`). A 4-card “carte regalo” photo is no longer 1-box singles lookalikes.
- **2.0.16 CardTrader printings:** Local leftover JPEG gallery + Qwen 3.8 27B labels reprint vs alt on peer2 (`pokoin_card_printings`). Western embed still display-only. See `docs/CARDTRADER_MODEL.md`.
- **3.0.3 singles title chips:** Overlay name chips on singles come from the item title. Description-only Pokemon names and `promo bgs` grading tokens are dropped. Album/lot listings still keep description names.
- **3.0.24 scan/search race and exact set recovery:** A completed listing scan finalizes its Vinted search signature, invalidates the older title request, and cannot be overwritten when that request resolves later. If `/api/extension-card-search` returns no rows for a name + collector + expansion query, the extension retries without expansion and then locally keeps only the requested expansion; this recovers Jungle Pikachu 60/64 from the current API regression without admitting W Promo 60/64.
- **3.0.23 certainty ignores rejected boxes:** A non-album scan with exactly one valid Milo hit at score ≥ 0.75 replaces all title-search alternatives even if YOLO also found weak boxes that Milo rejected. The RC15 Meowstic screenshot produced the correct `252498` hit at 0.8586 plus a rejected 0.4706 side-panel-thumbnail hit.
- **3.0.22 complete version-language import:** `artwork-lang-pipeline.py --version-links-only` imports all cross-language Peer2 `version` groups, joins expansion nationality, and fills representative EN/JP/CN packs for every member. The bundled index has 61,996 ids; 50,479 have JP and 46,778 have multiple languages. Reviewed groups are applied last.
- **3.0.21 viewport scan + threshold + JP link:** Current-tab capture ignores raw page-chrome YOLO boxes when deciding album vs singles, uses distinct recognized hits, tries rotations, and reports local scanner failures. Exactly one recognized hit at score ≥ 0.75 is authoritative. Meowstic BREAKpoint (`220966`) links to reviewed JP printing `642866`.
- **3.0.20 certain single-card result:** Exactly one YOLO box plus one unique Milo hit at score ≥ 0.80 was authoritative. The threshold is 0.75 from 3.0.21.
- **3.0.19 local-only scanner:** The extension loads `ort.wasm.min.js` and standard WASM only. WebGPU/JSEP and all remote CardScan identify endpoints/fallbacks/permissions are removed. Packages include YOLO, Milo, the western embeddings/catalog, and the 3.0.17 reviewed JP link.
- **3.0.18 on-device fallback:** Superseded by 3.0.19 because WebGPU/JSEP still emitted ONNX session-assignment logs in Chrome.
- **3.0.17 reviewed JP language link:** Mewtwo Evolutions (`236804`) exposes the JP same-art printing (`276178`) in album tiles. `scripts/artwork-lang-pipeline.py --known-links-only` reapplies reviewed links without rebuilding the full catalogs.
- **3.0.16 on-device western scan:** Listing photos and Scan tab introduced bundled TCG YOLO + Milo 128-d in `scan/offscreen.html` against `pokemon_western`. Its remote fallback and WebGPU/JSEP runtime were removed in 3.0.19.
- **3.0.15 one-card CardTrader chrome:** One leftover tile on Vinted or eBay uses the same edge-to-edge Pokoin desk iframe as CardTrader (`direct-card-view` / `frame-section-direct`). Overlay ALL with two or more tiles stays the art-cut grid.
- **12.0.1 narrow host access:** The package no longer requests `<all_urls>`. The compact Scan tab uses `activeTab`, granted when the user opens the panel from the Pokoin toolbar icon. If the panel was opened only from an in-page control, the scan error asks the user to click the extension icon once.
- **3.0.13 tab capture thumbnail:** The Current tab button stays on “Scan tab” until a jpeg data URL is painted. `#tabScanBtn img { display:block }` no longer overrides `hidden` (broken image + alt Current tab). Capture queries the last focused http(s) tab.
- **3.0.12 overlay dock coordinates:** Vinted and eBay keep the dragged `left`/`top` pixels (and collapsed). `localStorage pokoin.overlayDock` paints that position on first mount so a page reload does not flash at 12px while `chrome.storage.local` loads. Drop no longer snaps to a 12px left/right edge.
- **3.0.11 reduced opens panel, expanded refreshes:** Clicking the reduced 40×40 icon expands, scans, and opens the side panel if it is not already showing (`ensureSidePanelOpen`). Clicking the expanded Pokoin.com header refreshes identify. X still collapses. Overlay rows still iframe the western EN desk.
- **3.0.10 chips off + album extras:** Listing chips start unpressed. Unselected description names and illustration do not search. identify-album unions 2+ box extra photos at 0.50 (Zacian on Lotto JP); 1-box extras still need 0.80 only when the primary photo is dense.
- **3.0.9 tab screenshot scan:** The side panel has no Refresh button. The header shows the current Chrome tab screenshot. Clicking it captures the viewport, POSTs identify-album, and paints leftover tiles for cards visible in different posts. Overlay auto-identify stays item-URL only.
- **3.0.8 click-to-scan:** Vinted and eBay do not identify or Cardvault-search on listing visit. The reduced 40×40 Pokoin icon click expands and runs identify-album. Overlay rows still iframe the western EN desk.
- **3.0.7 overlay row EN desk:** Clicking one overlay row, or a one-card listing, iframes the western EN Pokoin desk. Overlay ALL stays the leftover art-cut tile grid. Never leftover-embed.
- **3.0.6 one-card EN desk + api.pokoin.com:** A single leftover tile iframes the western EN Pokoin desk. Extension JSON APIs use `https://api.pokoin.com` because Free Bot Fight cannot be skipped on `pokoin.com`.
- **3.0.5 leftover PKN via api.pokoin.com:** Cloudflare WAF 403s `pokoin.com/api/marketplace-card-last-median`. Leftover tiles retry `api.pokoin.com` and read `marketplace-card-sales` `series.lastMedianPkn` when last-median is not hosted there. Price fetches write `api.response` / `api.failure` into the session debug log.
- **3.0.4 leftover header PKN:** Gold last-median total stays next to `N cards`. Row prices fill it when tile `.candidate-price` nodes are still empty; overlay ALL must not abort the write.
- **3.0.2 scanner floor 0.50:** Overlay and leftover tiles drop identify uniqueHits with Milo score 0.50 or less. Dense binder pages still keep 0.51–0.79. Sparse closeups stay at 0.80.
- **3.0.1 multi-page binders:** Every photo with 6+ YOLO boxes unions uniqueHits. The 0.80 extra-photo filter is only for sparse closeups (Boxed Order 0.38), not other binder pages. Vinted reads `__NEXT_DATA__` / JSON-LD gallery URLs beyond the five visible thumbs.
- **3.0.0 dense album extras:** A 9-card binder photo keeps those uniqueHits (Goop Gas Attack 0.75 included). Extra gallery photos do not put Boxed Order 0.38 over Abra 0.88, and do not add a second leftover tile for the same English name. Sparse lots still union one-box closeups.
- **2.0.68 Vinted homepage idle labels:** Homepage, Catalogo, closets, and other non-`/items/{id}` Vinted pages idle the side panel as **Open a listing** / **Pokoin matches cards on Vinted item pages.** They do not keep Matching selected chips or Searching Cardvault.
- **2.0.67 overlay gold PKN:** Vinted and eBay overlay candidate rows paint last-median PKN in coin gold (`#ffcc03`) next to the card name. The side-panel header total stays the sum of visible leftover tiles.
- **2.0.66 Vinted homepage idle labels:** Homepage, Catalogo, closets, and other non-`/items/{id}` Vinted pages idle the side panel as **Open a listing** / **Pokoin matches cards on Vinted item pages.** They do not keep Matching selected chips or Searching Cardvault.
- **2.0.65 header PKN total:** The side-panel title paints `N cards` plus the gold last-median PKN sum of visible leftover tiles. Hide × drops that card from the count and the total. Coin gold is `--pkn-gold: #ffcc03`. One-card desk iframes still hide the total.
- **2.0.64 leftover doubles overlay:** Album leftover tiles overlay the same leftover printing onto one stacked tile before the grid (Alolan Meowth 118 LT). Overlay preview rows collapse the same way. Identify `public_id` stays the first binder hit.
- **2.0.63 leftover JP exclusive:** Japanese-only leftovers (Rocket Gang Dark Jolteon Lv.23) press JP, not EN. Keep the lookalike tile. EN stays the default only when a western leftover public_id exists.
- **2.0.62 leftover same-art EN:** JP leftover tiles default to a unique same-illustration EN leftover when CLIP left eur empty (Pikachu δ PCG-P 112 → EN Legend Maker 093/92, not Holon 079). Identify `public_id` stays the scan match.
- **2.0.61 leftover last-day median + header total:** Leftover tiles show the last known sold median PKN for the pressed EN/JP/CN leftover (`GET /api/marketplace-card-last-median`), defaulting to EN/EUR. The sticky header paints a bright total of visible tile prices. Listing floor (`/api/marketplace-blueprint-price`) is the fallback when no median exists.
- **2.0.60 overlay stays reduced:** The collapsed 40×40 Pokoin icon stays collapsed across Vinted and eBay listing navigation until the user clicks it to expand. `pokoinOverlayDock.collapsed` persists that choice. Click without a drag still expands; a drag is not a click.
- **2.0.59 leftover tile chrome:** Album leftover hide × and heart stay on each tile’s artwork. They never paint over the sticky header. The tile grid scrolls below a locked header.
- **2.0.58 side panel print_langs crash:** `pokoinUrlForRow(null)` no longer throws. Search and scan merge do not wait on `print-langs.json`. Overlay can paint while the leftover index loads.
- **2.0.57 leftover JPEG backfill:** EN leftovers that exist on disk but had empty `cdn_image_url` (Mega Froslass 741826) are backfilled into `pokemon_generic`. print-langs links the JP identify hit to that western pack (720194 → 741826). Reload does not invent catalog rows.
- **2.0.56 Vinted /items only:** Overlay, Cardvault search, and listing identify run only on `vinted.*/items/{id}`. Catalogo, homepage, member closets, and gallery lightboxes stay quiet so they do not POST feed pictures to cardscan.
- **2.0.55 album lot uniqueHits:** A LOTTO listing keeps every identify uniqueHit in the overlay and art-cut tile grid. Auto-selected title names must not collapse the lot to leftover-embed JP Silvally. Chip search still replaces name-incompatible lookalikes. Leftover-embed only after an overlay row click.
- **2.0.54 one-card EN desk:** A one-card listing insert iframes the western EN/EUR Pokoin desk when that leftover sibling exists. Identify `public_id` stays the scan match. Do not leftover-embed. JP-only cards still iframe the identify desk.
- **2.0.53 one-card desk:** A one-card listing insert iframes the identify Pokoin desk. Do not leftover-embed EN. Album ALL stays art-cut tiles; a selected album row can leftover-embed.
- **2.0.52 leftover homepage stem:** The side panel hydrates `data/print-langs.json` and album tiles derive `_homepage.webp` from leftover JPEG stems (`235635_iron-treads-ex-058-078-violet-ex`). Do not invent `{public_id}_{english-name}_homepage.webp`. Identify `public_id` stays the scan match.
- **2.0.51 one-card EN leftover:** A one-card listing insert leftover-embeds the western EN scan (EN pressed). Overlay preview rows keep print_langs so a JP identify hit does not open the JP desk iframe.
- **2.0.50 leftover EN label:** Album leftover tiles paint EN / JP / CN to match desk print language (Rampardos Pitch Black is EN, not EUR). Western pack key stays `eur` and still defaults when a western leftover exists. Do not open the UK desk iframe as the leftover default.
- **2.0.49 leftover tile hide/heart:** Album leftover tiles overlay a red × (hide this card on this listing for 3 days in `chrome.storage.local`) and a heart that POSTs `https://pokoin.com/api/marketplace-watchlist` for the signed-in Pokoin wishlist. Wishlisted tiles sort first. Identify `public_id` stays the scan match.
- **2.0.48 leftover versions off tiles:** Album leftover tiles do not show `print-langs.v` (COUNT of every row with that English name). Desk “View all N versions” is the CardTrader lineage. EUR/JP/CN stay leftover scans of one artwork.
- **2.0.47 leftover slug meta:** EUR/JP/CN leftover tiles label collector and expansion from the selected leftover stem (`095-203-evolving-skies` → `095 · ES`). Identify CS4a text is not kept under the name when EUR is pressed. Language click updates that line. Identify `public_id` stays the scan match.
- **2.0.46 leftover lang chrome:** Album tiles always paint EUR / JP / CN, even when print-langs has no pack for that id. Disabled buttons stay in the layout. CS4a still presses CN; western siblings still default to EUR.
- **2.0.45 Chinese leftover is CN:** CS4a / CSMPi leftovers that were stored in the eur slot press CN when there is no western public_id. EUR remains the default only for a real western sibling (Thundurus SM133).
- **2.0.44 western leftover sibling:** CN/JP identify hits that have a unique western leftover (Thundurus GX SM133 vs CSMPi 005) default the tile scan, collector label, and click to that EUR public_id. Identify `public_id` stays the scan match. EUR / JP / CN still swap the JPEG and the tile link.
- **2.0.43 overlay ALL tiles:** Overlay ALL switches the side panel to the art-cut tile grid for every match. A selected overlay row opens that one leftover scan or desk page.
- **2.0.42 leftover EUR default:** Singles with print-langs show the leftover embed with EUR pressed. JP identify does not open the UK desk iframe. EUR / JP / CN labels; desk `public_id` stays the match.
- **2.0.41 eBay Vinted dashboard:** eBay overlay uses the same header + X, 320px shell, 40×40 collapse, and named candidate rows as Vinted.
- **2.0.40 eBay tokens-ready:** eBay overlay publishes tokens-ready like Vinted. Chip click Cardvault-searches without a new identify; typed Add clue re-identifies. Empty or same-tab search overwrites a side panel still titled for another listing URL.
- **2.0.39 hide ALL on one match:** Overlay ALL is only for two or more rows. A single match shows just that card.
- **2.0.38 eBay scan merge:** Identify lookalikes paint the eBay overlay. Porygon2 is a name clue (digits allowed); Cardvault also tries `Porygon 2`.
- **2.0.37 collapsed drag handle:** The reduced 40×40 Pokoin icon is itself draggable (40×40 host, pointer-events auto, immediate capture). Click without a drag still expands.
- **2.0.36 CardTrader desk id:** CardTrader URL `ct_id` iframes `pokoin.com/marketplace/en/cards/{ct_id * 2}`. Identify/Cardvault `card_id` is already public and is not doubled.
- **2.0.35 eBay draggable overlay:** Grab the Pokoin.com header on eBay and drop it; `left`/`top` persist in `pokoinOverlayDock` like Vinted. A drag is not a click.
- **2.0.34 chip vs typed clue:** Clicking a listing/user chip Cardvault-searches the overlay and side panel without a new identify. Typing Add clue forces a new listing identify plus search. Name-incompatible album uniqueHits do not keep Raikou/Blaziken over a Koraidon clue. Overlay ALL still reuses cached rows.
- **2.0.33 draggable overlay:** The collapsed 40×40 Pokoin icon can be grabbed and dropped. It snaps to the left or right edge and remembers that dock. A drag does not count as a click.
- **2.0.28 tile-only side panel:** Marketplace matches always show art-cut tiles with EN/JP/CN and versions. Overlay ALL and individual overlay rows never open the Pokoin desk iframe. CardTrader direct URL still uses the iframe.
- **2.0.26 ALL leftover grid:** Overlay ALL reuses cached overlay rows and restores the leftover/art-cut tile grid. Individual overlay rows still open that card's Pokoin desk iframe.
- **2.0.25 unique clue chips:** Overlay chips keep unique single words from listing text. Sliding phrases like `Album Rivali Predestinati` are dropped; recognized card names, expansions, and collector codes stay multi-word.
- **2.0.24 overlay ALL row:** First overlay line is ALL and opens the album leftover tile grid. Individual overlay rows still open that card's Pokoin desk iframe.
- **2.0.23 overlay desk iframe:** Clicking a left-overlay match opens that card's Pokoin marketplace page in the side-panel iframe. Album leftover tiles stay on the listing grid, not on overlay row clicks.
- **2.0.22 western EN default:** EN / JP / CN default to EN whenever a western pack exists. JP/CN only switch the scan. Desk `public_id` stays the identify match.
- **2.0.21 album searchbar art-cut:** Album tiles crop the illustration window with the same CSS as the pokoin-web searchbar popup. `_homepage.webp` is still a full-card scan.
- **2.0.20 album artwork cut + EN/JP/CN:** Album tiles use rectangular `_homepage.webp` crops. EN / JP / CN under each tile switches homepage webp by language id; leftover full-card JPEGs stay on singles leftover embed. Desk `public_id` does not change.
- **2.0.19 album homepage tiles:** Album side-panel tiles use `pokoin.com/card-images/{public_id}_{slug}_homepage.webp`. EUR/JP/CN leftover scans stay on singles leftover embed.
- **2.0.18 ignore Blank Filler Card:** Album/scan rows named Blank Filler Card are dropped. Binder filler sleeves must not appear in the overlay or side panel.
- **2.0.17 western leftover singles:** Scan singles with print-lang versions hide the JP desk iframe and default the leftover JPEG to `pokoin.com/card-images` western. EUR/JP/CN only switches the scan. Desk `public_id` stays the identify match.
- **2.0.14 western leftover + language toggle:** Identify still uses leftover-JPEG `pokemon_generic`. Tiles default to a western leftover **scan** of that artwork. EUR/JP/CN only switches the leftover JPEG. The matched `public_id` stays the desk link. CardTrader’s versions tab is the target model (`docs/CARDTRADER_MODEL.md`): each printing is its own product; versions are the JP card plus the western release of that expansion, not a merged id and not every row with the same English name.
- **2.0.13 leftover JPEG:** Singles always send `catalog=pokemon_generic`. Albums use live `/identify-album` (peer1 Caddy now routes it; `ALBUM_CATALOG=pokemon_generic`, 24 boxes) with `/identify?album=1` fallback. Desk ids are `public_id`; TCGPlayer `id` is not doubled.
- **2.0.11 side-panel count:** Singles say `1 card`. Albums say `N cards`. No “in album”; the card name stays on the tiles/rows.
- **2.0.12 Load unpacked:** Overlay version is the loaded folder’s `manifest.json`. Mac Chrome must Load unpacked from `/Users/giuseppe/mnt/nezopt/Projects/pokemon-card-extension` (or Remove + Reload). Desktop `pokoin-extension` is a mirror; a stale Load path keeps v2.0.7. See `docs/DESKTOP_RELOAD.md` and `docs/CURRENT_PIPELINE.md`.

- Owner/team composite matching:
  - Vinted detects titles such as `Mimikyu del Team Rocket`.
  - The overlay creates and defaults `Team Rocket's Mimikyu`.
  - Background name resolution tries `Team Rocket's Mimikyu` before generic `Mimikyu`.

- Vinted/eBay overlay placement:
  - Vinted and eBay Pokoin overlays are draggable from the Pokoin header. Drop keeps `left`/`top` pixels and persists `pokoinOverlayDock` in page `localStorage` plus `chrome.storage.local`. A drag is not a click.
  - Broad fixed hosts use `pointer-events: none`; only visible controls are interactive.

- Pipeline cost reductions (keep ranking rules intact):
  - Leftover `content.js` `searchCardInDatabase` sends `searchCardForTitle` instead of fetching Pokoin APIs from the marketplace page.
  - `core/ExtensionCore.js` no longer polls every 50ms for 5s; it keeps DOMContentLoaded plus a 200ms one-shot force-start.
  - Resolved search/name/token LRU maps persist to `chrome.storage.session.pokoinSearchLruCache` and hydrate after service-worker restarts. Build-marker changes clear that key.
  - Token-predict is skipped when the selected composite already compact-equals the structured name; it still runs for longer owner/team composites.
  - Autocomplete fallback no longer fills Mega searches to 8 rows when exact collector+name (and expansion when present) already matched.
  - eBay and Cardmarket listing-feed buttons search on click; Vinted/eBay product overlays stay token-ready.

- Vinted leftover `searchCardInDatabase` now delegates to background search like eBay/Cardmarket, not `window.searchCardInDatabase`.

- Illustration rarity alias support:
  - The UI can keep the simple `illustration` chip.
  - Background normalizes selected illustration evidence into `rarityAliases`:
    - `Illustration Rare`
    - `Special Illustration Rare`
    - `full art`
    - `illustration`
  - `/api/extension-card-search` receives `rarityAliases`.
  - Autocomplete fallback tries alias query forms such as `Sprigatito Illustration Rare` and `Sprigatito Special Illustration Rare`.
  - Ranking prefers rows whose `rarity` or row metadata matches the illustration aliases over generic same-name rows.

## Important Matching Rules

Keep these rules intact when changing marketplace matching:

1. Exact collector evidence wins first. Preserve printed forms like `TG16/TG30`, `RC32/RC32`, `SV-P 129`, `DRS 009`, `HL 9`, and `14/100`.
2. Numeric collector equivalence is a fallback only. It must not outrank exact prefixed/slash collector evidence.
3. Validated composite names beat shorter species names:
   - `Rocket Zapdos`
   - `Team Rocket's Mimikyu`
   - `Espeon & Deoxys ex`
   - `Arven's Mabosstiff ex`
   - `Alto Mare's Latias`
4. Explicit forms/variations are required evidence when selected:
   - `Mega + X/Y + ex`
   - `Mega + ex`
   - `VMAX`, `VSTAR`, `V`, `GX`, `ex`
5. Rarity/feature chips should be expanded to backend-compatible aliases before search.
6. Price enrichment, Cardmarket observation auth, and fallback autocomplete are decoration/recovery. They must not replace stronger overlay-selected rows for the same URL/signature.

## APIs Used

- `POST https://pokoin.com/api/extension-card-search`
  - Main structured search endpoint.
  - Payload includes name, collector numbers, expansion, rarity, `rarityAliases`, variation, edition hint, language, and limit.

- `POST https://pokoin.com/api/searchbar-token-predict`
  - Lightweight card-name token predictor used before heavier autocomplete name resolution.
  - The extension accepts only high-confidence predictions that extend the scraped fragment, then retries `/api/extension-card-search` with that clean token while preserving collector, expansion, rarity, and variation fields.

- `POST https://pokoin.com/api/marketplace-autocomplete`
  - Fast Cardvault name-index canonicalization and fallback candidate search.
  - Used after weak/empty exact selected-key results when token prediction is empty or unavailable, then again only as a broader candidate-fill fallback when structured search remains insufficient.
  - Name resolver requests use `result_limit: 20`, query-length pool limits, `search_language: "en"`, and generated `search_session_id` values.

- `GET https://pokoin.com/api/marketplace-card-last-median?cardId=:cardId` (or `cardIds=1,2,3`)
  - Latest UTC-day median inferred sold PKN from CardTrader removed-sale comps. One leftover `public_id` per request; do not merge ids.
  - Album lots batch leftover EN/JP/CN ids in one hop (max 40).
  - Used first for leftover tile prices and the side-panel header total.

- `GET https://pokoin.com/api/marketplace-blueprint-price?blueprintId=:cardId`
  - Used for Pokoin PKN listing-floor fallback when no last-day median exists.
  - Result is decoration only.

- `POST https://pokoin.com/api/cardmarket-scrape-observation`
  - Sends Cardmarket scrape observations.
  - Requires `Authorization: Bearer <firebase-id-token>`.
  - Payload includes top-level `url`, page metadata, structured card, context, match, source, extension version, and promotion flag.

## Auth Flow

Cardmarket observations use a Pokoin-origin auth bridge:

1. Background opens or reuses `https://pokoin.com/extension/auth-bridge`.
2. `pokoin-auth-bridge.js` accepts object or JSON-string token messages from `https://pokoin.com`.
3. Current Pokoin payload shape is `token.accessToken`.
4. The bridge normalizes to `POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE`.
5. Background stores the token in `chrome.storage.session.pokoinAuthSession`.
6. Pending Cardmarket observations flush with `Authorization: Bearer <token>`.
7. The bridge tab is closed only when it is the tracked extension-opened auth bridge tab.

Tokens must never be stored in `chrome.storage.local` or exposed to marketplace content scripts.

## Verification Steps

Run:

```bash
node --test tests/extension-workflow.test.js
```

Expected: all tests pass.

When runtime files change, bump the `manifest.json` patch version first (currently `12.0.5`) so `chrome://extensions`, the overlay `Pokoin.com v…` label, and the side-panel eyebrow show a new number after Reload. Then rebuild:

```bash
rm -f dist/pokemon-card-extension-2.0.0.zip
zip -r dist/pokemon-card-extension-2.0.0.zip manifest.json content.js pokoin-auth-bridge.js assets icons config processors core ui data utils ui-pages scan docs README.md -x "*.DS_Store" "*/.DS_Store" "._*" "*/._*" "docs/POKOIN_AUTH_CARDMARKET_BLOCKER.md"
node --test tests/extension-workflow.test.js
```

The zip hash guard in the tests checks that packaged runtime files match source.

## Leftovers

See `docs/LEFTOVERS.md`. Short version:

- Dead: `content.js` still contains `searchPokoinCardApi` / `searchPokoinAutocomplete` / `enrichTitleInfoWithCardvaultName` page-origin fetches that nothing calls.
- Dead: popup handlers, `scoreAndValidateResults`, and several helper modules loaded by the manifest but never constructed.
- Inert: `patchVintedProductPage` and `patchCardmarketProductPage` return immediately.
- Live leftover: CardTrader/generic `processListing` still searches on insert through the background worker.

## Remaining Work

- CardTrader versions tab is the target (`docs/CARDTRADER_MODEL.md`). Each `public_id` keeps its own page. Versions are that card as Japan printed it and as the West released that expansion (Nihil Zero → Perfect Order). Do not group by English name across the catalog.

- Live-verify a Cardmarket observation after Pokoin login: `pokoinAuthSession.token` set, HTTP 201, `source = pokemon-card-extension`. The auth-bridge `accessToken` parser and top-level observation `url` already shipped in `7d90e40`.
- Validate the live Pokoin `/api/extension-card-search` behavior with `rarityAliases`. The extension now sends the field, but backend support should be confirmed in production logs/API traces.
- If the backend does not yet consume `rarityAliases`, it should map the aliases server-side or accept multiple rarity values.
- Consider adding explicit row fields for rarity match confidence in the API response, so the extension can avoid guessing from text fields.
- Keep testing real Vinted/eBay screenshots where the card image shows rarity or collector evidence missing from the text title.
- Live-verify album/binder photos: YOLO box count >= 2 should keep multi-card scan rows and must not collapse the overlay to one species name.
- Live-verify a Vinted/eBay single with a strong identify `top1` that fills a missing name/collector without overriding selected chips.
