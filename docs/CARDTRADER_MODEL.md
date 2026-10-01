# CardTrader model is the target

Pokoin printings, leftover scans, and the extension tiles follow **CardTrader’s
product model**. Each printing keeps its own page. Versions are that **same
card** as Japan printed it and as the West (and China) later released it — not
every catalog row that shares an English Pokémon name.

## Japanese expansion → western release

Cards are designed for a **Japanese set first**. The English/European set is
the later localization of that Japanese expansion (sometimes two JP sets
folded into one EN set, plus a few extra cards). Collector numbers **do not
stay 1:1** because the EN base is larger.

Worked example: Japan **Nihil Zero** (M3, 23 Jan 2026, 80-card base / 117
total) → English **Perfect Order** (POR, 27 Mar 2026, 88-card base / 124
total). Secret numbers shift by eight (EN inserted eight extra base cards).

[Espurr Nihil Zero Illustration Rare 087/080](https://www.cardtrader.com/en/cards/368031-espurr-illustration-rare-087-080-nihil-zero/versions)
is one card. Its versions are that card in JP and in the western set, plus the
other rarity of **that same set pair** (regular vs illustration rare):

| Version | Set | Number | What it is |
| --- | --- | --- | --- |
| JP regular | Nihil Zero | `032/080` | Japanese printing of this Espurr |
| EN regular | Perfect Order | `033/088` | Western release of that same regular |
| JP illustration rare | Nihil Zero | `087/080` | Japanese alt of this Espurr |
| EN illustration rare | Perfect Order | `095/088` | Western release of that same IR (`087 + 8`) |

Flashfire Espurr, Burning Shadows Espurr, and the rest of `name = 'Espurr'`
are **other cards** (other JP expansions, other arts). They are not versions
of Nihil Zero / Perfect Order Espurr.

A Chinese set that reprints the same Japanese card is another version of that
same card, with its own `public_id`.

Nest Ball’s long CardTrader tab is the same idea over many years: that trainer
reprinted in later **Japanese** sets, each with a western localization, plus
alt arts of **that** card — not a Pokédex dump of every ball.

## What CardTrader actually is

| Surface | What it is | What it is not |
| --- | --- | --- |
| One product | One printing: that set + collector + variant. Own URL / `public_id`. | JP and EN collapsed into one desk page |
| **Versions tab** | The same card across JP → western (→ CN) release, and alt arts of that card in that lineage | Every catalog row with the same English name (all Espurr ever). Not a language switcher on one id |
| Language on the product page | Filter on **offers** of that printing (EN, FR, DE, …) | Changing which printing you are on |
| Card image | The leftover / scan of **that** printing | A substitute product from another era’s Espurr |

## Target for Pokoin

1. **Every `public_id` stays a product.** Opening a tile opens that printing.
   Never rewrite the desk id to a western sibling.
2. **Versions** = JP source printing + western localization of that printing +
   CN if it exists + alt arts of **that** card. Count should match CardTrader
   for that lineage, not `COUNT(*) WHERE name = 'Espurr'`.
3. **Artwork labels** (Qwen / leftover CLIP) tag `reprint` vs `alt` inside that
   lineage. They do not merge ids and they do not attach Flashfire Espurr to
   Nihil Zero Espurr.
4. **Western embed** is display-only: default JPEG to the western leftover of
   that same card. EN / JP / CN only swaps the scan. `card_id` does not change.
5. Offer language (EN/FR/DE) is separate from print nationality
   (`pokoin_pokemon_expansions.nationality`: western / japanese / chinese).

## What Pokoin must not keep doing

The extension's compact EN/JP/CN index is rebuilt from
`marketplace_search_candidates.version`, with each member's language supplied
by `pokoin_pokemon_expansions.nationality`. This is the same authoritative
illustration lineage used by the marketplace versions page; it is not a
same-name or same-set guess.

Do not group versions by English name across the whole catalog (peer2 Espurr
is 35 candidates). That mixes unrelated JP expansions.

Do not union-find JP/EN/CN `public_id`s into one western desk card.

Do not store the sibling `public_id` list on every printing. That list grows
with every reprint. Raspberry keeps one row in `pokoin_version_sets` per
illustration group and a `marketplace_search_candidates.version` key. Members
are `WHERE version = key`.

## Extension (v2.0.17)

- Identify is unchanged: leftover-JPEG `pokemon_generic`, desk ids are `public_id`.
- `applyWesternEmbed` may replace `preview_image_url` only.
- Singles with print-lang versions iframe the western EN Pokoin desk. Never leftover-embed.
- Side-panel EN / JP / CN buttons change `img.src` only and default to EN whenever a western pack exists. Album tiles crop the illustration window with the searchbar art-cut CSS. One-card listings and overlay row clicks iframe the western EN Pokoin desk; never leftover-embed.

## Pipeline

Desk versions use `pokoin_version_sets` + `marketplace_search_candidates.version`.
Same **English name** + **same illustration**, not `gameplay_name` dumps.
Web map: pokoin-web `docs/VERSIONS.md`.

`scripts/artwork-lang-pipeline.py` still clusters leftover JPEGs **by English
name** for extension print-langs (eur/jp/cn packs). When CLIP leaves `eur`
empty, equalized 64×64 pixels uniquely link the same pose (Pikachu δ PCG-P
112 `504600` → Legend Maker 093/92 `233564`, not Holon 079).

- Espurr: artwork-box groups on test.pokoin.com/espurr (`apply-version-sets.py`).
- Every name: `scripts/cluster-name-version-sets.py`. Pokemon names are
  case-insensitive (`Alolan Exeggutor ex` = `Alolan exeggutor ex`); XY **EX**
  stays distinct from SV **ex**. Matching is the illustration window, not the
  catalog string. JP promo 183/SV-P joins Paradise Dragona / Surging Sparks of
  the same Tera art. Run on **nezopt** against the 15T replica
  (`/home/nez/mnt/mybook/pokoin-pi-card-images/objects`).
  Sync is local rsync then LAN `rsync://` (`scripts/sync-pi-card-images-replica.sh`),
  not SSH. Encode on the RX 7900 XTX:
  `scripts/version-sets-pipeline.sh` (tests, cluster, apply, SQL fixtures).
  `--reencode` only when `scripts/out/artbox-clip.npz` is stale.
  The Pi is origin only — no Pillow.
  If Pi SSH drops after matching, groups are in `scripts/out/version-groups.json`;
  apply with `--apply-cached` (CLIP cache is `scripts/out/artbox-clip.npz`).
  Illustration-box CLIP ≥0.94 stamps; unique nearest ≥0.80 (margin 0.04).
  Do **not** union leftover-catalog CLIP first (that chained every Pikachu δ).
  When CLIP cannot split mascot poses, face-weighted equalized pixels auto-merge
  ≥0.90 reprint stacks, then unique nearest ≥0.70 (margin 0.12). Cluster join
  floor is **0.55** so DP34 ↔ McDonald's 031/DP-P (~0.595) still merge and
  Stormfront 16/100 does not glue onto SVP 135 (~0.493). EN/JP frames of the
  same illustration still join (Cottonee 010/098 → Black Collection 004/053;
  Tapu Lele GX 60/145 → Alolan Moonlight 022/050). Washed leftovers that
  pixels cannot join (BW64 + BW-P 147, 21 KB JP scan) stay `artbox-pin`.
  Catalog CLIP ≥0.83 only if there is no artbox vector.
  Do not write `gameplay_name` groups onto the desk.

See `docs/CURRENT_PIPELINE.md` for Load unpacked and identify URLs.
