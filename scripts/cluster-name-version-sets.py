#!/usr/bin/env python3
"""Cluster marketplace versions by the same illustration.

Within one card name (Cacturne, not Cacturne ex). Names are case-insensitive
except XY-era **EX** vs SV **ex** (those stay different cards):

  Alolan Exeggutor ex  ==  Alolan exeggutor ex
  Ho-Oh EX             !=  Ho-Oh ex
  Unown [P]            ==  Unown [P] LV.13   (printed level, not LV.X)
  Unown [P]            !=  Unown [Q]

  /home/nez/Projects/ai-toolkit/venv/bin/python scripts/cluster-name-version-sets.py --match '^unown \\[' --dry-run
  /home/nez/Projects/ai-toolkit/venv/bin/python scripts/cluster-name-version-sets.py --expansion "30th Celebration JP" --refresh-candidates
  /home/nez/Projects/ai-toolkit/venv/bin/python scripts/cluster-name-version-sets.py --ids 790994 --refresh-candidates

Do **not** union leftover-catalog CLIP first. That 2026-09-06 --all pass
chained every Flareon / Pikachu δ into one key (species embeddings ≥ 0.83).
The searchbar strip is also too short: any Pikachu face looks like any other.

1. Illustration **box** CLIP on the leftover JPEG (Espurr window, not
   `artcut/` searchbar crops). Merge near-identical crops at ≥ 0.94
   (stamps / reverse holos). Then ≥ 0.80 when each cluster’s next
   option is ≥ 0.04 worse (unique nearest). Do not union-find at 0.80
   or 0.90 — that chained every Flareon / Pikachu face.
2. Catalog CLIP ≥ 0.83 only to attach a printing that has **no** artbox
   vector, and only onto its unique nearest cluster.
3. Equalized 64×64 pixels, **face-weighted** (0.6 character / 0.4 illustration
   window) when CLIP cannot split poses. Auto-merge ≥ 0.90 reprint stacks
   (stamps / JP/EN/CN of the same crop). Then unique nearest ≥ 0.75 with
   margin 0.12. Worked examples: PCG-P 112 `504600` → Legend Maker
   093/92 `233564`, not Holon Phantoms 079; Cottonee 010/098 `236234` →
   Black Collection 004/053 `271986`; Tapu Lele GX 60/145 `240808` →
   Alolan Moonlight 022/050 `270564`, not FA 137/145.
4. Cluster-level pixel folds (the max-pooled join with no other candidate)
   must clear 0.80 for **Pokémon** names (`pokoin_pokedex_name_sort`);
   Giuseppe 2026-09-18 full pass. Same-species different paintings sit at
   0.53–0.57 (Girafarig Kanda vs Kusube) and the old 0.55 floor glued them
   into one version key. Trainers/items/energy keep 0.55 — vintage trainer
   reprints (washed photos, TCGPlayer shots) sit far lower and cannot be
   told apart from name alone.

Each public_id keeps its own desk. Lookup is WHERE version = key.

  scripts/version-sets-pipeline.sh --dry-run
  scripts/version-sets-pipeline.sh

`--pipeline` runs leftover tests, clusters every name (CLIP cache unless
`--reencode`), applies to nezopt 15T Postgres, then SQL-checks known pairs.
`--expansion` / `--ids` re-cluster only the name buckets that contain those
new leftovers (Base Set Charizard still joins 30th Celebration JP Charizard).
`--apply-cached` writes `scripts/out/version-groups.json` if apply drops.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

CATALOGS = Path("/home/nez/Projects/BattleScan/runtime/catalogs-20260903-jp-reference")
# Prefer the 15T 1:1 Pi replica on nezopt. Do not crop or CLIP on the Pi.
PI_REPLICA = Path("/home/nez/mnt/mybook/pokoin-pi-card-images")
PI_OBJECTS = PI_REPLICA / "objects"
PI_ARTCUT = PI_REPLICA / "artcut"
CDN = Path("/home/nez/Projects/pokoin/PokoinTest/index/cdn_images")
DIGEST = Path("/home/nez/pokoincdn/cdn_images_digest")
REPO = Path("/home/nez/Projects/pokemon-card-extension")
CACHE = REPO / "scripts/out/artbox-clip.npz"
PIXEL_CACHE = REPO / "scripts/out/artbox-pixel.npz"
CANDIDATES = REPO / "scripts/out/version-candidates.json"
GROUPS = REPO / "scripts/out/version-groups.json"
# Washed leftovers CLIP/pixels cannot join. Applied as source=artbox-pin
# so later --all passes keep them. BW-P 147 is a 21 KB scan (pixels 0.233).
ARTBOX_PINS = (
    (222076, (222076, 503926), "Drifblim"),
    # Lost Thunder 199/214 is the red-art FA (n < set size, so split_secret
    # treats it as regular and drops it from the rainbow/FA stack).
    (245368, (245328, 245368, 286596, 286612, 739514, 739540), "Blacephalon GX"),
    # Item trainer: gold/secret is the same leftover painting as 156/202.
    # CLIP split the uncommon stack from Black Bolt / gold 213/202.
    (258812, (
        258636, 258812, 286738, 286774, 450356, 465800, 467332, 480480,
        485136, 641958, 664852, 684690, 686838, 689448, 689668, 691652,
        691700, 703348, 716642, 718096, 719958, 728708, 729904, 738620,
        738758, 741638, 749840, 771094, 771190, 805924, 805960, 805998,
    ), "Air Balloon"),
    # 30th Celebration JP 137/103 is Arita Base Set Charizard with a gold
    # frame and Pikachu stamp in the illustration box. CLIP 0.88 to Classic
    # 003/034; leftover pixels 0.44 lose unique-nearest / 0.55 cluster join.
    (243508, (
        243508, 403530, 456892, 538520, 790994,
    ), "Charizard"),
    # CardTrader versions: BW Promos #234 + Noble Victories #234. Both leftovers
    # are the same Japanese 234/BW-P (Sanosuke Sakuma). The BW Promos JPEG is a
    # 38 KB washed crop and was never in artbox-clip.npz, so CLIP left both
    # singleton. NV 234/197 is a duplicate CT listing, not English NVI.
    (293030, (293030, 504094), "Victini"),
    # Ninja Spinner 067/083 + Chaos Rising 069/086 (Satoshi Ito canyon). CLIP
    # cached Chaos Rising 069 as the Chinese CSM2d GX leftover (clip=1.0), so
    # unique-nearest never saw the JP regular. Do not recluster Tauros to fix
    # this — that would dump CSM2d onto Unified Minds. IR pair already matched.
    (756082, (756082, 780020), "Tauros"),
    # Pitch Black 076/084 Fossil Quarry ↔ Abyss Eye 079/081. CLIP left both
    # singleton (JP CT title was "Fossil Excavation Site"). Pin so Scan Desk EN
    # remaps to western Pitch Black art; name sanitized to Fossil Quarry.
    (798844, (782938, 798844), "Fossil Quarry"),
    # Ken Sugimori Base Set boxing stance. Listed Base Set leftover is the
    # unlimited TCGPlayer photo (bsu2); CLIP unique-nearest prefers JP
    # Expansion Pack (0.877, margin 0.009) and leftover pixels to Base Set 2
    # are 0.719 vs shadowless 0.662 (margin < 0.12). Do not recluster
    # Hitmonchan — Classic/SS are Shigenori Negishi, 151 is another painting.
    (222308, (
        222308, 222514, 222774, 222776, 236846, 268352, 275892, 276194,
        276390, 342804,
    ), "Hitmonchan"),
    # Same bsu2 miss as Hitmonchan. Visual leftover pass of remaining Base Set
    # singletons + shadowless/Evolutions/JP reprints. Do not recluster names:
    # Classic Bill is HGSS, Wizards Venusaur 13 is Sugimori (not Arita Base Set).
    (222316, (
        222316, 222520, 236782, 237042, 243188, 268544, 275802, 276104,
        276356,
    ), "Nidoking"),
    (222320, (
        222320, 222528, 236706, 237028, 268464, 275842, 276144, 276320,
    ), "Poliwrath"),
    (222324, (
        222324, 222534, 243136, 268534, 275798, 276100, 403532, 535054,
        539192,
    ), "Venusaur"),
    (222328, (
        222328, 222540, 236640, 243144, 268556, 275800, 276102, 276284,
    ), "Beedrill"),
    (222374, (
        222374, 222614, 236862, 243308, 268490, 275900, 276202, 276400,
    ), "Raticate"),
    (222420, (
        222420, 222684, 243444, 268400, 275822, 276124, 535270, 538636,
        544264,
    ), "Squirtle"),
    (222468, (
        222468, 222728, 236920, 268498, 275940, 276242, 276426,
    ), "Pokédex"),
    (222470, (
        222470, 222730, 268518, 275930, 276232, 535108, 535298, 535368,
        538518, 538656, 539156,
    ), "Professor Oak"),
    (222476, (
        222476, 222734, 243496, 268392, 275924, 276226,
    ), "Bill"),
    (242960, (
        222562, 242960, 242992, 281936, 748520,
    ), "Victreebel"),
    # Southern Islands 7/18 is Keiko Fukuyama (printed Illus. + pkmncards).
    # CLIP joined Skyridge 72/144 Masako Yamashita as v255408 and same-art
    # copy stamped Yamashita onto the SI leftover. Do not recluster Ledyba.
    (255724, (255724, 507370), "Ledyba"),
    # Pokémon ≥0.80 cluster floor can no longer make these calls; both are
    # same-painting VERIFY pairs below 0.80 pixels. Drifblim DP34 + WotC
    # McDonald's 031/DP-P (0.595). Legendary Collection 38/110 + Team Rocket
    # 33/82 + Rocket Gang No.148 Himeno (max 0.746). Pin so the full pass
    # keeps them. Do not recluster these names.
    (227266, (227266, 557286), "Drifblim"),
    (243216, (243216, 258900, 283850), "Dark Dragonair"),
)
# WCD 2012–2016 and 30th JP XY **EX** leftovers CardTrader named "ex".
# name_key keeps EX ≠ ex, so CLIP never saw Plasma Blast from the WCD bucket.
# Pixel ≥0.55 (WCD stamps) / 30th Pikachu-stamp Genesect 0.96. Do not pin
# 30th SV-era Pikachu/Greninja/Fuecoco (CLIP ~0.80, leftover pixels ~0.1).
STAMP_EX_PINS = (
    (219826, (219826, 271382, 516796, 543674, 569482, 631056, 632054), "Hoopa EX"),
    (219902, (219902, 271424, 543732, 569524, 632062), "Giratina EX"),
    (221024, (221024, 282642, 569604, 631956), "Darkrai EX"),
    (222116, (222116, 250050, 286000, 456952, 651372, 651730), "Deoxys EX"),
    (223520, (223520, 243684, 272936, 275374, 629784, 631140, 636518, 637026, 651782), "Keldeo EX"),
    (223676, (223676, 277060, 689348), "Landorus EX"),
    (227514, (227514, 274016, 632184, 651764), "Raikou EX"),
    (227610, (227610, 227822, 243846, 274056, 275504, 629806, 653488), "Darkrai EX"),
    (227716, (227716, 274100, 633270), "Tornadus EX"),
    (229200, (229200, 274936, 498524, 824988), "Rayquaza EX"),
    (238046, (238046, 631068), "Audino EX"),
    (238522, (238522, 516826, 543914, 637034), "Kangaskhan EX"),
    (239418, (239418, 283576, 543140, 569410, 628298), "Seismitoad EX"),
    (239552, (239552, 283640, 543770, 545752, 569562, 630956), "Lucario EX"),
    (249482, (249482, 280184, 640472, 824990), "Genesect EX"),
    (249674, (249674, 280266, 636544, 640470), "Jirachi EX"),
    (249992, (249992, 287366, 589162, 651378), "Thundurus EX"),
    (250176, (250176, 250268, 287408, 651362), "Latias EX"),
    (252184, (252184, 277690, 543758, 651390), "Groudon EX"),
    (252186, (252186, 277692, 342802, 543748, 651430), "Primal Groudon EX"),
    (253342, (253342, 275720, 543906, 569820, 628296, 630968, 630988, 631104, 632060, 636534), "Shaymin EX"),
    (278364, (278364, 824970), "Scizor EX"),
)
VERIFY_TOGETHER = (
    ((227266, 557286), "DP34 + McDonald's 031/DP-P"),
    ((227970, 285598), "D&P 24/130 + Space-Time Creation"),
    ((222076, 503926), "BW64 + BW-P 147"),
    ((243216, 258900, 283850), "Dark Dragonair Himeno reprints"),
    ((504600, 233564), "Pikachu δ PCG-P 112 + Legend Maker 093/92"),
    ((236234, 271986), "Cottonee 010 + Black Collection 004"),
    ((240808, 270564), "Tapu Lele GX 60 + Alolan Moonlight"),
    ((245328, 245368), "Lost Thunder 199 red art + rainbow 219"),
    ((256260, 279784), "Stormfront 16/100 + Intense Fight"),
    ((258636, 258812, 286738, 684690), "Air Balloon 156/202 + gold 213/202 + JP Sword + Black Bolt"),
    ((790994, 403530, 538520), "30th JP Charizard 137 + Celebrations BS 004 + Classic 003/034"),
    ((293030, 504094), "Noble Victories 234/197 + BW-P 234"),
    ((756082, 780020), "Ninja Spinner 067 + Chaos Rising 069"),
    ((782938, 798844), "Abyss Eye 079 Fossil Quarry + Pitch Black 076"),
    ((222308, 222514, 268352, 236846, 276194), "Base Set Hitmonchan + BS2 + shadowless + Evolutions + JP"),
    ((222316, 222520, 236782, 243188), "Base Set Nidoking + BS2 + Evolutions + LC"),
    ((222320, 236706, 268464), "Base Set Poliwrath + Evolutions + shadowless"),
    ((222324, 222534, 403532), "Base Set Venusaur + BS2 + Celebrations"),
    ((222328, 236640, 268556), "Base Set Beedrill + Evolutions + shadowless"),
    ((222374, 236862, 268490), "Base Set Raticate + Evolutions + shadowless"),
    ((222420, 268400, 535270), "Base Set Squirtle + shadowless + JP Classic"),
    ((222468, 236920, 268498), "Base Set Pokédex + Evolutions + shadowless"),
    ((222470, 222730, 538518), "Base Set Professor Oak + BS2 + Classic"),
    ((222476, 222734, 268392), "Base Set Bill + BS2 + shadowless"),
    ((242960, 222562, 242992), "Jungle Victreebel holo + BS2 + Jungle 30/64"),
    ((249482, 640472, 824990), "Plasma Blast Genesect EX + WCD 2014 + 30th JP"),
    ((229200, 824988), "Dragons Exalted Rayquaza EX + 30th JP"),
    ((250176, 651362), "Plasma Freeze Latias EX + WCD 2014"),
    ((255724, 507370), "Southern Islands Ledyba EN + JP"),
)
VERIFY_APART = (
    ((227266, 227970), "DP34 vs D&P 24/130 (two Arita paintings)"),
    ((256260, 596910), "Stormfront 16/100 vs SVP 135"),
    ((233564, 233090), "Pikachu δ Legend Maker vs Holon Phantoms"),
    ((236234, 236230), "Cottonee 010 vs 009"),
    ((240808, 241092), "Tapu Lele GX regular vs FA"),
    ((235350, 235354), "Dark Dragonair EX 31/109 vs 32/109"),
    ((780020, 746620), "Chaos Rising 069 vs CSM2d GX starter"),
    ((222308, 258410), "Base Set Hitmonchan vs Sword & Shield Negishi"),
    ((222308, 502712), "Base Set Hitmonchan vs 151"),
    ((222308, 224826), "Base Set Hitmonchan vs Call of Legends"),
    ((222324, 263464), "Base Set Venusaur Arita vs Wizards promo Sugimori"),
    ((222476, 535086), "Base Set Bill vs Classic HGSS Bill"),
    ((222420, 761084), "Base Set Squirtle vs 30th First Partner"),
    ((255724, 255408), "SI Ledyba Fukuyama vs Skyridge Yamashita"),
)
LANGS = ("western", "japanese", "chinese")
CATALOG_MIN = 0.83
ARTCUT_AUTO = 0.94
ARTCUT_MIN = 0.80
ARTCUT_MARGIN = 0.04
# Keep in sync with artwork-lang-pipeline.py PIXEL_*.
PIXEL_BOX = (0.16, 0.155, 0.84, 0.50)
# Center-upper of the leftover scan — the Pokémon, not the frame/text.
PIXEL_FACE_BOX = (0.28, 0.16, 0.72, 0.40)
PIXEL_FACE_WEIGHT = 0.6
PIXEL_SIZE = 64
# 0.80 missed EN/JP of the same illustration (Cottonee 010/098 ↔ Black Collection
# 004/053 sits at ~0.77 because of frame/foil). Unique-nearest + 0.12 margin still
# blocks other poses (~0.19). Reprint stacks (Tapu Lele GX 60/145 EN/JP/CN/WCD)
# sit at ≥0.90 and have no unique nearest — auto-merge those first.
PIXEL_AUTO = 0.90
PIXEL_MIN = 0.70
PIXEL_MARGIN = 0.12
# Cluster-level reprint join. Printing-level unique-nearest fails when EN
# Legendary Collection + Team Rocket are already one cluster and JP is ~0.77
# to both (Challenge!, The Boss's Way). Auto 0.80 stacks vintage JP/EN/20th.
PIXEL_CLUSTER_AUTO = 0.80
# 0.45 glued Stormfront 16/100 to SVP 135 (~0.493, different balloon art).
# 0.55 still joins DP34 ↔ McDonald's 031/DP-P (~0.595) and Rocket Gang /
# Challenge! (~0.77). CLIP unique-nearest misses DP34 (0.765 vs 0.764 to
# the other Arita painting); leftover pixels have to make that call.
PIXEL_CLUSTER_MIN = 0.55
# Pokémon buckets refuse cluster-level pixel joins below 0.80 (full pass
# 2026-09-18). Same-species different paintings sit at 0.53–0.57 and the
# 0.55 floor glued Girafarig Kanda vs Kusube into one version key. The
# same-painting pairs the 0.55 floor was keeping (Drifblim DP34, Dark
# Dragonair Himeno) are artbox-pins now. Printing-level unique-nearest
# keeps PIXEL_MIN 0.70: mutual nearest + 0.12 margin never mis-joined, and
# Cottonee EN/JP sits at 0.797.
POKEMON_PIXEL_CLUSTER_MIN = 0.80
# CLIP unique-nearest still groups EX Dark Dragonair 31/109 with 32/109
# (~0.87) while leftover pixels are ~0.08. Refuse that merge.
PIXEL_VETO = 0.40
PIXEL_ATTACH = 0.20
# JP Rocket Gang vs EN Team Rocket often sits at CLIP 0.72–0.79 (frames).
ATTACH_CLIP = 0.72
# Espurr artwork box on the leftover JPEG (left, top, right, bottom).
# Not the thin searchbar strip in art-cut.js / artcut/.
ART_BOX = (0.07, 0.115, 0.93, 0.515)
CLIP_MODEL = "ViT-B-32"
CLIP_PRETRAINED = "laion2b_s34b_b79k"
BATCH_CPU = 64
BATCH_GPU = 256


def psql(sql: str, timeout: int = 300) -> str:
    completed = subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            "pokoin-marketplace-postgres-15t",
            "psql",
            "-U",
            "pokoin_marketplace",
            "-d",
            "pokoin_marketplace",
            "-v",
            "ON_ERROR_STOP=1",
        ],
        input=sql if sql.rstrip().endswith(";") else sql.rstrip() + ";",
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit(completed.stderr or completed.stdout or f"psql exit {completed.returncode}")
    return completed.stdout


def dump_candidates(force: bool = False) -> list[dict]:
    if CANDIDATES.exists() and not force and CANDIDATES.stat().st_size > 1000:
        return json.loads(CANDIDATES.read_text())
    CANDIDATES.parent.mkdir(parents=True, exist_ok=True)
    raw = psql(
        """
SET statement_timeout = 0;
SELECT json_agg(row_to_json(t)) FROM (
  SELECT c.card_id, c.ct_id, c.name, c.set_name, c.card_number, c.version,
         e.nationality
    FROM marketplace_search_candidates c
    LEFT JOIN pokoin_pokemon_expansions e ON e.name = c.set_name
   WHERE c.item_kind = 'single'
     AND c.product_type = 'card'
   ORDER BY c.name, c.card_id
) t;
""",
        timeout=180,
    )
    payload = None
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("["):
            payload = json.loads(line)
            break
    if not payload:
        raise SystemExit(f"no candidates\n{raw[:500]}")
    CANDIDATES.write_text(json.dumps(payload))
    return payload


def load_catalog_vecs() -> dict[int, np.ndarray]:
    found = {}
    for lang in LANGS:
        meta = [
            json.loads(line)
            for line in (CATALOGS / f"pokemon_{lang}" / "metadata.jsonl").read_text().splitlines()
            if line.strip()
        ]
        emb = np.load(CATALOGS / f"pokemon_{lang}" / "embeddings.npy")
        norms = np.linalg.norm(emb, axis=1, keepdims=True)
        norms[norms == 0] = 1
        emb = (emb / norms).astype(np.float32)
        for index, row in enumerate(meta):
            pid = int(row.get("public_id") or row.get("id") or 0)
            if pid:
                found[pid] = emb[index]
    return found


def _ingest_leftovers(root: Path, mapped: dict[int, list[Path]], leftover_jpg_only: bool) -> None:
    if not root.is_dir():
        return
    for path in root.iterdir():
        if not path.is_file():
            continue
        name = path.name
        low = name.lower()
        if leftover_jpg_only:
            if "_homepage" in low:
                continue
            if not (low.endswith(".jpg") or low.endswith(".jpeg")):
                continue
        stem = name.split("_", 1)[0]
        if not stem.isdigit():
            continue
        cid = int(stem)
        bucket = mapped.setdefault(cid, [])
        if leftover_jpg_only or not bucket:
            if path not in bucket:
                bucket.append(path)
        elif low.endswith((".jpg", ".jpeg")) and "_homepage" not in low:
            if path not in bucket:
                bucket.append(path)


# WOTC printed level on JP/EN names ("Unown [P] LV.13"). Not Pokémon LV.X.
_PRINTED_LEVEL = re.compile(r"\s+lv\.?\s*\d+\s*$", re.IGNORECASE)
# Japanese CT titles insert the mechanic words western GX names omit.
_TAG_TEAM_GX = re.compile(r"\s*tag team gx\s*$", re.IGNORECASE)
_SLUG_TOKEN = re.compile(r"[a-z0-9]+")


def parse_id_list(raw: str) -> list[int]:
    found: list[int] = []
    seen: set[int] = set()
    for part in re.split(r"[\s,]+", str(raw or "").strip()):
        if not part.isdigit():
            continue
        n = int(part)
        if n in seen:
            continue
        seen.add(n)
        found.append(n)
    return found


def name_keys_for_import(
    rows: list[dict],
    ids: list[int] | None = None,
    expansion: str = "",
) -> set[str]:
    """Name buckets that contain the newly imported printings.

    Cluster the whole name (Base Set Charizard too), not only the new row.
    Expansion match is exact folded `set_name` so `30th Celebration JP`
    does not also eat western `30th Celebration`.
    """
    want: set[str] = set()
    idset = set(ids or [])
    needle = str(expansion or "").casefold().strip()
    for row in rows:
        pid = int(row.get("card_id") or 0)
        cid = 0
        if str(row.get("ct_id") or "").isdigit():
            cid = int(row["ct_id"])
        hit_id = bool(idset) and (pid in idset or cid in idset)
        hit_set = bool(needle) and needle == str(row.get("set_name") or "").casefold()
        if not hit_id and not hit_set:
            continue
        key = name_key(row.get("name"))
        if key:
            want.add(key)
    return want


def name_key(name: str) -> str:
    """Bucket reprints of the same card. Fold case, keep EX vs ex distinct."""
    raw = " ".join(str(name or "").split())
    if not raw:
        return ""
    raw = _PRINTED_LEVEL.sub("", raw)
    raw = _TAG_TEAM_GX.sub(" GX", raw)
    folded = raw.casefold()
    last = raw.split()[-1] if raw else ""
    if last == "EX":
        prefix, sep, _ = folded.rpartition("ex")
        return (prefix + "EX") if sep else folded
    if last == "ex":
        prefix, sep, _ = folded.rpartition("ex")
        return (prefix + "ex") if sep else folded
    return folded


def pokemon_name_keys() -> set[str]:
    """name_keys whose blueprint is a Pokémon species or form.

    Source of truth is pokoin_pokedex_name_sort: species/forms carry
    pokedex_num < 10000, trainers/items/energies 10000. Level suffixes fold
    away in name_key (Dark Dragonair Lv.28 → dark dragonair). A name missing
    from the table stays non-Pokémon, so an unknown bucket keeps the old
    0.55 floor instead of silently behaving like a stricter Pokémon bucket.
    """
    payload = _json_from_psql(
        psql(
            """
SELECT COALESCE(json_agg(json_build_object('n', name)), '[]'::json)
  FROM pokoin_pokedex_name_sort
 WHERE pokedex_num < 10000;
"""
        )
    ) or []
    keys = set()
    for row in payload:
        key = name_key(str(row.get("n") or ""))
        if key:
            keys.add(key)
    return keys


def leftover_slug_score(path: Path, name: str, number: str = "") -> int:
    """Prefer the JPEG whose filename matches the card, not a public-id collision."""
    slug = path.stem.split("_", 1)[-1].lower()
    name_tokens = set(_SLUG_TOKEN.findall(str(name or "").lower()))
    name_tokens.update(_SLUG_TOKEN.findall(str(number or "").lower()))
    slug_tokens = set(_SLUG_TOKEN.findall(slug))
    score = len(name_tokens & slug_tokens)
    # Generic full-v4 scans lose ties to collector/set slugs of the same ct_id
    # (D&P 24/130 `drifblim-24-130-diamond-pearl` vs `drifblim-lv-40-full-v4`).
    if "full" in slug_tokens and "v4" in slug_tokens:
        score -= 2
    return score


def display_name(members: list[dict]) -> str:
    counts = {}
    for row in members:
        label = str(row.get("name") or "").strip()
        if label:
            counts[label] = counts.get(label, 0) + 1
    if not counts:
        return ""
    return sorted(counts, key=lambda n: (-counts[n], n))[0]


def leftover_index() -> dict[int, list[Path]]:
    mapped: dict[int, list[Path]] = {}
    _ingest_leftovers(PI_OBJECTS, mapped, leftover_jpg_only=True)
    for root in (CDN, DIGEST):
        _ingest_leftovers(root, mapped, leftover_jpg_only=False)
    return mapped


def resolve_leftover(ct_id, index: dict[int, list[Path]] | None = None, name: str = "", number: str = "") -> Path | None:
    if not ct_id:
        return None
    cid = int(ct_id)
    hits = list(index.get(cid) or []) if index is not None else []
    if not hits:
        prefix = f"{cid}_"
        for root in (PI_OBJECTS, CDN, DIGEST):
            if not root.is_dir():
                continue
            hits.extend(
                p
                for p in root.glob(prefix + "*")
                if p.is_file() and "_homepage" not in p.name.lower()
            )
            if hits:
                break
    if not hits:
        return None
    if len(hits) == 1:
        return hits[0]
    return max(hits, key=lambda path: (leftover_slug_score(path, name, number), -len(path.name)))


# CardTrader `card_uploader` preview; Pokoin missing-card stamp is 63:88 630×880.
CT_PLACEHOLDER_SIZE = (186, 260)
POKOIN_PLACEHOLDER_SIZE = (630, 880)


def is_placeholder_leftover(path: Path) -> bool:
    """Do not CLIP grey CT backs or the Pokoin coin leftover — they glue names."""
    try:
        with Image.open(path) as image:
            return image.size in {CT_PLACEHOLDER_SIZE, POKOIN_PLACEHOLDER_SIZE}
    except Exception:
        return True


def art_crop(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    left, top, right, bottom = ART_BOX
    return image.crop(
        (
            int(width * left),
            int(height * top),
            int(width * right),
            int(height * bottom),
        )
    )


def _equalized_pixel_vec(path: Path, box: tuple[float, float, float, float]) -> np.ndarray | None:
    from PIL import ImageOps

    try:
        image = Image.open(path).convert("RGB")
    except Exception:
        return None
    width, height = image.size
    if width < 16 or height < 16:
        return None
    left, top, right, bottom = box
    crop = image.crop(
        (
            int(width * left),
            int(height * top),
            int(width * right),
            int(height * bottom),
        )
    )
    gray = ImageOps.equalize(crop.convert("L")).resize((PIXEL_SIZE, PIXEL_SIZE), Image.Resampling.LANCZOS)
    arr = np.asarray(gray, dtype=np.float32)
    arr = arr - arr.mean()
    norm = float(np.linalg.norm(arr)) or 1e-8
    return (arr.reshape(-1) / norm).astype(np.float32)


def pixel_art_vec(path: Path, box: tuple[float, float, float, float] | None = None) -> np.ndarray | None:
    """Equalized illustration pixels, face-weighted. CLIP cannot split Pikachu δ poses."""
    full = _equalized_pixel_vec(path, box or PIXEL_BOX)
    if box is not None:
        return full
    face = _equalized_pixel_vec(path, PIXEL_FACE_BOX)
    if full is None:
        return face
    if face is None:
        return full
    blended = (1.0 - PIXEL_FACE_WEIGHT) * full + PIXEL_FACE_WEIGHT * face
    norm = float(np.linalg.norm(blended)) or 1e-8
    return (blended / norm).astype(np.float32)


class UnionFind:
    def __init__(self):
        self.parent = {}

    def add(self, item):
        self.parent.setdefault(item, item)

    def find(self, item):
        parent = self.parent.setdefault(item, item)
        if parent != item:
            self.parent[item] = self.find(parent)
        return self.parent[item]

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


def load_artcut_cache() -> dict[int, np.ndarray]:
    if not CACHE.exists():
        return {}
    data = np.load(CACHE, allow_pickle=False)
    ids = data["ids"].astype(np.int64)
    vecs = data["vecs"].astype(np.float32)
    return {int(pid): vecs[index] for index, pid in enumerate(ids)}


def save_artcut_cache(cache: dict[int, np.ndarray]) -> None:
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    ids = np.fromiter(cache.keys(), dtype=np.int64)
    vecs = np.stack([cache[int(pid)] for pid in ids])
    np.savez_compressed(CACHE, ids=ids, vecs=vecs)


def load_pixel_cache() -> dict[int, tuple[str, np.ndarray]]:
    if not PIXEL_CACHE.exists():
        return {}
    data = np.load(PIXEL_CACHE, allow_pickle=False)
    ids = data["ids"].astype(np.int64)
    names = data["names"].astype(str)
    vecs = data["vecs"].astype(np.float32)
    return {int(pid): (str(names[index]), vecs[index]) for index, pid in enumerate(ids)}


def save_pixel_cache(cache: dict[int, tuple[str, np.ndarray]]) -> None:
    PIXEL_CACHE.parent.mkdir(parents=True, exist_ok=True)
    ids = np.fromiter(cache.keys(), dtype=np.int64)
    names = np.array([cache[int(pid)][0] for pid in ids], dtype="U256")
    vecs = np.stack([cache[int(pid)][1] for pid in ids])
    np.savez_compressed(PIXEL_CACHE, ids=ids, names=names, vecs=vecs)


def _json_from_psql(raw: str):
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("{") or line.startswith("["):
            return json.loads(line)
    return None


def apply_artbox_pins() -> None:
    for key, ids, name in (*ARTBOX_PINS, *STAMP_EX_PINS):
        id_list = ", ".join(str(i) for i in ids)
        label = name.replace("'", "''")
        psql(
            f"""
SET statement_timeout = 0;
INSERT INTO public.pokoin_version_sets (version, gameplay_name, member_count, source)
VALUES ('v{key}', '{label}', {len(ids)}, 'artbox-pin')
ON CONFLICT (version) DO UPDATE
  SET gameplay_name = EXCLUDED.gameplay_name,
      member_count = EXCLUDED.member_count,
      source = EXCLUDED.source,
      updated_at = now();
UPDATE public.marketplace_search_candidates
   SET version = 'v{key}'
 WHERE card_id IN ({id_list});
"""
        )
        print(f"  pin v{key} n={len(ids)} {name}", flush=True)


def version_map(ids: list[int]) -> dict[int, str]:
    id_list = ", ".join(str(i) for i in ids)
    payload = _json_from_psql(
        psql(
            f"""
SELECT json_agg(json_build_object('card_id', c.card_id, 'version', c.version))
  FROM marketplace_search_candidates c
 WHERE c.card_id IN ({id_list});
"""
        )
    )
    return {int(row["card_id"]): str(row.get("version") or "") for row in (payload or [])}


def singleton_stats() -> dict:
    payload = _json_from_psql(
        psql(
            """
SELECT json_build_object(
  'printings', COUNT(*),
  'singletons', COUNT(*) FILTER (
    WHERE s.member_count IS NULL OR s.member_count <= 1
  )
)
  FROM marketplace_search_candidates c
  LEFT JOIN pokoin_version_sets s ON s.version = c.version
 WHERE c.item_kind = 'single'
   AND c.product_type = 'card';
"""
        )
    )
    return payload or {}


def verify_version_sets() -> str:
    want = {pid for ids, _ in VERIFY_TOGETHER for pid in ids}
    want.update(pid for ids, _ in VERIFY_APART for pid in ids)
    versions = version_map(sorted(want))
    errors = []
    for ids, label in VERIFY_TOGETHER:
        keys = [versions.get(pid, "") for pid in ids]
        if not all(keys) or len(set(keys)) != 1:
            errors.append(f"together? {label}: {dict(zip(ids, keys))}")
    for ids, label in VERIFY_APART:
        keys = [versions.get(pid, "") for pid in ids]
        if not all(keys) or len(set(keys)) < 2:
            errors.append(f"apart? {label}: {dict(zip(ids, keys))}")
    stats = singleton_stats()
    printings = int(stats.get("printings") or 0)
    singles = int(stats.get("singletons") or 0)
    pct = (100.0 * singles / printings) if printings else 0.0
    summary = f"singletons {singles}/{printings} ({pct:.1f}%)"
    if errors:
        raise SystemExit("verify failed:\n" + "\n".join(errors) + "\n" + summary)
    return "verify ok · " + summary


def clip_device():
    """RX 7900 XTX on nezopt (HIP device 0, ~24 GiB). Not the Raphael iGPU."""
    os.environ.setdefault("HIP_VISIBLE_DEVICES", "0")
    import torch

    if not torch.cuda.is_available():
        print("CLIP device cpu (no HIP)", flush=True)
        return "cpu"
    props = torch.cuda.get_device_properties(0)
    print(
        f"CLIP device cuda:0 {torch.cuda.get_device_name(0)} "
        f"{props.total_memory / 1024 ** 3:.1f} GiB {getattr(props, 'gcnArchName', '')}",
        flush=True,
    )
    return "cuda:0"


def encode_artcuts(need: list[tuple[int, Path]], cache: dict[int, np.ndarray]) -> None:
    pending = [(pid, path) for pid, path in need if pid not in cache]
    if not pending:
        return
    import torch
    import open_clip

    device = clip_device()
    batch_size = BATCH_GPU if device != "cpu" else BATCH_CPU
    model, _, preprocess = open_clip.create_model_and_transforms(
        CLIP_MODEL, pretrained=CLIP_PRETRAINED, device=device
    )
    model.eval()
    started = time.time()
    for offset in range(0, len(pending), batch_size):
        chunk = pending[offset : offset + batch_size]
        crops = []
        ok = []
        for pid, path in chunk:
            try:
                crops.append(art_crop(path))
                ok.append(pid)
            except Exception:
                continue
        if not crops:
            continue
        batch = torch.stack([preprocess(crop) for crop in crops]).to(device)
        with torch.inference_mode():
            vecs = model.encode_image(batch)
            vecs = vecs / vecs.norm(dim=-1, keepdim=True)
        arr = vecs.detach().cpu().numpy().astype(np.float32)
        for index, pid in enumerate(ok):
            cache[pid] = arr[index]
        done = min(offset + batch_size, len(pending))
        if done == len(pending) or done % 2048 < batch_size:
            save_artcut_cache(cache)
            print(
                f"  art-cut {done}/{len(pending)} cached={len(cache)} "
                f"{round(time.time() - started, 1)}s {device}",
                flush=True,
            )
    save_artcut_cache(cache)


def cluster_name(
    ids: list[int],
    catalog: dict[int, np.ndarray],
    art: dict[int, np.ndarray],
    pixel: dict[int, np.ndarray] | None = None,
    pokemon: bool = False,
) -> list[list[int]]:
    """Same illustration only. Unique-nearest merge so mascots do not chain.

    Pokémon buckets raise the cluster-level pixel fold to
    POKEMON_PIXEL_CLUSTER_MIN: the max-pooled join has no second candidate
    when only two groups remain, so 0.55–0.79 same-species lookalikes glue
    whole clusters. Trainers/items/energy keep PIXEL_CLUSTER_MIN.
    """
    pixel_floor = POKEMON_PIXEL_CLUSTER_MIN if pokemon else PIXEL_CLUSTER_MIN
    art_ids = [pid for pid in ids if pid in art]
    clusters = _artbox_clusters(art_ids, art, pixel)
    used = {pid for members in clusters for pid in members}
    used = {pid for members in clusters for pid in members}
    for pid in ids:
        if pid in used or pid not in catalog:
            continue
        va = catalog[pid]
        scored = []
        for index, members in enumerate(clusters):
            best = -1.0
            for other in members:
                vb = catalog.get(other)
                if vb is None:
                    continue
                best = max(best, float(va @ vb))
            scored.append((best, index))
        if not scored:
            clusters.append([pid])
            used.add(pid)
            continue
        scored.sort(reverse=True)
        score, index = scored[0]
        second = scored[1][0] if len(scored) > 1 else -1.0
        if score >= CATALOG_MIN and score - max(second, -1.0) >= ARTCUT_MARGIN:
            clusters[index].append(pid)
            used.add(pid)
        else:
            clusters.append([pid])
            used.add(pid)
    if pixel:
        clusters = _pixel_union_clusters(clusters, pixel)
        leftover = [pid for pid in ids if pid not in {m for chunk in clusters for m in chunk}]
        if leftover:
            extra = _pixel_union_clusters([[pid] for pid in leftover], pixel)
            clusters.extend(extra)
        clusters = _pixel_join_clusters(clusters, pixel, pixel_floor)
        clusters = _clip_join_clusters(clusters, art, pixel, pixel_floor)
    clusters = _attach_artbox_orphans(clusters, art, pixel)
    return [sorted(set(members)) for members in clusters if len(members) >= 2]


_COLLECTOR_FRAC = re.compile(r"(\d+)\s*/\s*(\d+)")


def collector_frac(number) -> tuple[int, int] | None:
    match = _COLLECTOR_FRAC.search(str(number or ""))
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def collector_secret(number) -> bool:
    """True when the printed collector is a secret (IR/FA/SIR), n > set size."""
    frac = collector_frac(number)
    return bool(frac and frac[0] > frac[1])


# Item trainers reprint the same leftover painting (SWSH Air Balloon 156/202
# gold 213/202). Illustrated supporters (Misty at a pool) still split.
ITEM_TRAINER_SAME_ART = frozenset({"air balloon"})


def _item_trainer_reprint(chunk: list[int], rows_by_id: dict[int, dict]) -> bool:
    names = {
        str((rows_by_id.get(pid) or {}).get("name") or "").strip().casefold()
        for pid in chunk
    }
    names.discard("")
    return bool(names) and names <= ITEM_TRAINER_SAME_ART


def split_secret_regular_arts(
    chunks: list[list[int]],
    rows_by_id: dict[int, dict],
) -> list[list[int]]:
    """Same-set regular and secret rarities are different paintings.

    CLIP groups Misty's Vitality 080/084 with Ultra Rare 111/084 because both
    show Misty at a pool. Those belong on Versions, not Same artwork. If any
    expansion in the chunk has both, split the whole chunk by secret flag so
    JP/EN reprints of each painting stay together and the chase art cannot
    bridge back onto the regulars. A CLIP group that is only one expansion
    with several collector numbers (Mega Rayquaza UR/FA/SIR/gold) splits by
    collector n so reverse holos of the same number stay together.

    Item trainers are the exception: the gold/secret is the same painting as
    the uncommon, so Air Balloon 156/202 stays with 213/202.
    """
    out: list[list[int]] = []
    for chunk in chunks:
        if _item_trainer_reprint(chunk, rows_by_id):
            if len(chunk) >= 2:
                out.append(sorted(set(chunk)))
            continue
        set_names = {
            str((rows_by_id.get(pid) or {}).get("set_name") or "").strip().casefold()
            for pid in chunk
        }
        if len(set_names) == 1:
            by_n: dict[int | None, list[int]] = {}
            for pid in chunk:
                frac = collector_frac((rows_by_id.get(pid) or {}).get("card_number"))
                key = frac[0] if frac else None
                by_n.setdefault(key, []).append(pid)
            numbered = [key for key in by_n if key is not None]
            if len(numbered) >= 2:
                for group in by_n.values():
                    if len(group) >= 2:
                        out.append(sorted(set(group)))
                continue
        mixed = False
        by_set: dict[str, tuple[bool, bool]] = {}
        for pid in chunk:
            row = rows_by_id.get(pid) or {}
            set_name = str(row.get("set_name") or "").strip().casefold()
            secret = collector_secret(row.get("card_number"))
            had_reg, had_sec = by_set.get(set_name, (False, False))
            by_set[set_name] = (had_reg or not secret, had_sec or secret)
            if by_set[set_name][0] and by_set[set_name][1]:
                mixed = True
        if not mixed:
            if len(chunk) >= 2:
                out.append(sorted(set(chunk)))
            continue
        regs = [
            pid for pid in chunk
            if not collector_secret((rows_by_id.get(pid) or {}).get("card_number"))
        ]
        secs = [
            pid for pid in chunk
            if collector_secret((rows_by_id.get(pid) or {}).get("card_number"))
        ]
        if len(regs) >= 2:
            out.append(sorted(set(regs)))
        if len(secs) >= 2:
            out.append(sorted(set(secs)))
    return out


def _pixel_union_clusters(
    clusters: list[list[int]],
    pixel: dict[int, np.ndarray],
) -> list[list[int]]:
    """Join CLIP leftovers that share a unique pixel pose (PCG-P 112 → 093/92)."""
    uf = UnionFind()
    for members in clusters:
        if not members:
            continue
        uf.add(members[0])
        for pid in members[1:]:
            uf.add(pid)
            uf.union(members[0], pid)
    ids = [pid for members in clusters for pid in members if pid in pixel]
    if len(ids) < 2:
        return clusters
    vecs = np.stack([pixel[pid] for pid in ids])
    sim = vecs @ vecs.T
    # Reprint stacks (same crop, many langs/stamps) have no unique nearest.
    auto = np.triu(sim, 1)
    for i, j in zip(*np.where(auto >= PIXEL_AUTO)):
        uf.add(ids[int(i)])
        uf.add(ids[int(j)])
        uf.union(ids[int(i)], ids[int(j)])
    np.fill_diagonal(sim, -np.inf)
    for i, pid in enumerate(ids):
        j = int(sim[i].argmax())
        score = float(sim[i, j])
        if score < PIXEL_MIN:
            continue
        ranked = np.sort(sim[i])
        second = float(ranked[-2]) if ranked.size > 1 else -np.inf
        if score - second < PIXEL_MARGIN:
            continue
        if int(sim[:, j].argmax()) != i:
            continue
        uf.add(ids[j])
        uf.union(pid, ids[j])
    grouped: dict = defaultdict(list)
    seen = set()
    for members in clusters:
        for pid in members:
            if pid in seen:
                continue
            seen.add(pid)
            grouped[uf.find(pid)].append(pid)
    return list(grouped.values())


def _cluster_pixel_sim(
    left_ids: list[int],
    right_ids: list[int],
    pixel: dict[int, np.ndarray] | None,
) -> float | None:
    dots = [
        dot
        for a in left_ids
        for b in right_ids
        if (dot := _pixel_dot(pixel, a, b)) is not None
    ]
    if not dots:
        return None
    return max(dots)


def _pixel_join_clusters(
    clusters: list[list[int]],
    pixel: dict[int, np.ndarray],
    pixel_floor: float = PIXEL_CLUSTER_MIN,
) -> list[list[int]]:
    """Join CLIP clusters that share a leftover pose.

    Printing-level unique-nearest cannot attach JP Challenge! onto already
    merged Legendary Collection + Team Rocket: both EN scans sit at ~0.77,
    so the margin vs the second printing is ~0.006. Pokémon buckets pass
    POKEMON_PIXEL_CLUSTER_MIN — the fold runs with no second candidate when
    only two groups remain, so a lone score decides the version key.
    """
    groups = [list(chunk) for chunk in clusters if chunk]
    if len(groups) < 2:
        return groups
    uf = UnionFind()
    for index in range(len(groups)):
        uf.add(index)
    n = len(groups)
    sim = np.full((n, n), -np.inf, dtype=np.float64)
    for i in range(n):
        for j in range(i + 1, n):
            score = _cluster_pixel_sim(groups[i], groups[j], pixel)
            if score is None:
                continue
            sim[i, j] = sim[j, i] = score
            if score >= PIXEL_CLUSTER_AUTO:
                uf.union(i, j)
    np.fill_diagonal(sim, -np.inf)
    alive = [uf.find(i) == i for i in range(n)]
    # Fold already-auto-merged rows so unique-nearest sees clusters, not leftovers.
    current = sim.copy()
    for i in range(n):
        root = uf.find(i)
        if root == i:
            continue
        current[root, :] = np.maximum(current[root, :], current[i, :])
        current[:, root] = current[root, :]
        current[i, :] = -np.inf
        current[:, i] = -np.inf
        current[root, root] = -np.inf
        alive[i] = False
    while sum(alive) >= 2:
        idx = [i for i, keep in enumerate(alive) if keep]
        if len(idx) == 2:
            i, j = idx
            score = float(current[i, j])
            if np.isfinite(score) and score >= pixel_floor:
                uf.union(i, j)
            break
        sub = current[np.ix_(idx, idx)]
        nearest = np.argmax(sub, axis=1)
        nearest_s = sub.max(axis=1)
        blocked = sub.copy()
        blocked[np.arange(len(idx)), nearest] = -np.inf
        second = blocked.max(axis=1)
        second = np.where(np.isfinite(second), second, -np.inf)
        with np.errstate(invalid="ignore"):
            unique = (
                (nearest_s >= pixel_floor)
                & np.isfinite(nearest_s)
                & (nearest_s - second >= PIXEL_MARGIN)
            )
        best_local, best_s = -1, -1.0
        for local, ok in enumerate(unique):
            if not ok:
                continue
            score = float(nearest_s[local])
            if score > best_s:
                best_local, best_s = local, score
        if best_local < 0:
            break
        i = idx[best_local]
        j = idx[int(nearest[best_local])]
        uf.union(i, j)
        current[i, :] = np.maximum(current[i, :], current[j, :])
        current[:, i] = current[i, :]
        current[i, i] = -np.inf
        current[j, :] = -np.inf
        current[:, j] = -np.inf
        alive[j] = False
    folded: dict = defaultdict(list)
    for index, members in enumerate(groups):
        folded[uf.find(index)].extend(members)
    return list(folded.values())


def _cluster_clip_sim(
    left_ids: list[int],
    right_ids: list[int],
    art: dict[int, np.ndarray],
) -> float:
    best = -1.0
    for a in left_ids:
        va = art.get(a)
        if va is None:
            continue
        for b in right_ids:
            vb = art.get(b)
            if vb is None:
                continue
            best = max(best, float(va @ vb))
    return best


def _clip_join_clusters(
    clusters: list[list[int]],
    art: dict[int, np.ndarray],
    pixel: dict[int, np.ndarray] | None,
    pixel_floor: float = PIXEL_CLUSTER_MIN,
) -> list[list[int]]:
    """Join leftover clusters CLIP already knows are the same painting.

    Dark Gyarados JP + 25th Anniversary sit together at pixel ~0.63, then
    cannot unique-nearest onto Team Rocket (~0.20 pixels) without CLIP.
    """
    if not art or len(clusters) < 2:
        return clusters
    groups = [list(chunk) for chunk in clusters if chunk]
    moved = True
    while moved:
        moved = False
        if len(groups) < 2:
            break
        best: tuple[float, int, int] | None = None
        for source, chunk in enumerate(groups):
            if not chunk:
                continue
            scored = []
            for target, other in enumerate(groups):
                if target == source or not other:
                    continue
                clip = _cluster_clip_sim(chunk, other, art)
                pix = _cluster_pixel_sim(chunk, other, pixel)
                scored.append((clip, pix, target))
            if not scored:
                continue
            scored.sort(key=lambda item: item[0], reverse=True)
            clip, pix, target = scored[0]
            second = scored[1][0] if len(scored) > 1 else -1.0
            if clip < ATTACH_CLIP:
                continue
            if pix is None or pix < pixel_floor:
                continue
            if len(scored) > 1 and clip - max(second, -1.0) < ARTCUT_MARGIN:
                continue
            if best is None or clip > best[0]:
                best = (clip, source, target)
        if best is None:
            break
        _, source, target = best
        groups[target].extend(groups[source])
        groups[source] = []
        groups = [chunk for chunk in groups if chunk]
        moved = True
    return groups


def _pixel_dot(pixel: dict[int, np.ndarray] | None, left: int, right: int) -> float | None:
    if not pixel or left not in pixel or right not in pixel:
        return None
    return float(pixel[left] @ pixel[right])


def _pixel_allows_merge(
    pixel: dict[int, np.ndarray] | None,
    left_ids: list[int],
    right_ids: list[int],
    min_dot: float = PIXEL_VETO,
) -> bool:
    """CLIP may not join leftover JPEGs whose pixels are different paintings."""
    dots = [
        dot
        for a in left_ids
        for b in right_ids
        if (dot := _pixel_dot(pixel, a, b)) is not None
    ]
    if not dots:
        return True
    return max(dots) >= min_dot


def _attach_artbox_orphans(
    clusters: list[list[int]],
    art: dict[int, np.ndarray],
    pixel: dict[int, np.ndarray] | None = None,
) -> list[list[int]]:
    """Hang a leftover singleton onto its unique-nearest CLIP cluster.

    Dark Dragonair JP Rocket Gang sits at ~0.81 with Team Rocket / Legendary
    Collection after those two EN reprints have already been pixel-joined.
    Unique-nearest inside the first CLIP pass loses the pair because the JP
    reprint is a close second (margin < 0.04). Do not use this to glue two
    singletons that leftover pixels already split (EX 31/109 vs 32/109).
    """
    if not art or len(clusters) < 2:
        return clusters
    groups = [list(chunk) for chunk in clusters if chunk]

    def score_to(pid: int, members: list[int]) -> float:
        vec = art.get(pid)
        if vec is None:
            return -1.0
        best = -1.0
        for other in members:
            other_vec = art.get(other)
            if other_vec is None:
                continue
            best = max(best, float(vec @ other_vec))
        return best

    moved = True
    while moved:
        moved = False
        singles = [index for index, chunk in enumerate(groups) if len(chunk) == 1 and chunk[0] in art]
        if not singles:
            break
        best: tuple[float, int, int] | None = None
        for source in singles:
            pid = groups[source][0]
            scored = []
            for target, chunk in enumerate(groups):
                if target == source or not chunk:
                    continue
                scored.append((score_to(pid, chunk), target))
            if not scored:
                continue
            scored.sort(reverse=True)
            score, target = scored[0]
            second = scored[1][0] if len(scored) > 1 else -1.0
            pixel_score = _cluster_pixel_sim([pid], groups[target], pixel)
            if pixel_score is None:
                if score < ARTCUT_MIN:
                    continue
                if len(scored) < 2 or score - max(second, -1.0) < ARTCUT_MARGIN:
                    continue
            elif score < ARTCUT_MIN:
                if score < ATTACH_CLIP:
                    continue
                if len(scored) < 2 or score - max(second, -1.0) < ARTCUT_MARGIN:
                    continue
                if pixel_score < PIXEL_ATTACH:
                    continue
            else:
                if len(scored) > 1 and score - max(second, -1.0) < ARTCUT_MARGIN:
                    continue
                if pixel_score < PIXEL_ATTACH:
                    continue
            if best is None or score > best[0]:
                best = (score, source, target)
        if best is None:
            break
        _, source, target = best
        groups[target].extend(groups[source])
        groups[source] = []
        moved = True
    return [chunk for chunk in groups if chunk]


def _artbox_clusters(
    art_ids: list[int],
    art: dict[int, np.ndarray],
    pixel: dict[int, np.ndarray] | None = None,
) -> list[list[int]]:
    if len(art_ids) < 2:
        return [[pid] for pid in art_ids]
    order = list(art_ids)
    vecs = np.stack([art[pid] for pid in order])
    current = vecs @ vecs.T
    np.fill_diagonal(current, -np.inf)
    n = len(order)
    if pixel:
        for i in range(n):
            for j in range(i + 1, n):
                if _pixel_allows_merge(pixel, [order[i]], [order[j]]):
                    continue
                current[i, j] = -np.inf
                current[j, i] = -np.inf
    if n == 2:
        score = float(current[0, 1])
        if score >= ARTCUT_MIN:
            return [order]
        return [[pid] for pid in order]
    alive = np.ones(n, dtype=bool)
    members = [[i] for i in range(n)]

    def best_pair() -> tuple[int, int, float]:
        work = current.copy()
        work[~alive, :] = -np.inf
        work[:, ~alive] = -np.inf
        flat = int(np.argmax(work))
        i, j = divmod(flat, n)
        return i, j, float(work[i, j])

    def merge(i: int, j: int) -> None:
        members[i].extend(members[j])
        members[j] = []
        alive[j] = False
        current[i, :] = np.maximum(current[i, :], current[j, :])
        current[:, i] = current[i, :]
        current[i, i] = -np.inf

    while int(alive.sum()) >= 2:
        i, j, score = best_pair()
        if not np.isfinite(score) or score < ARTCUT_AUTO:
            break
        merge(i, j)

    while int(alive.sum()) > 2:
        work = current.copy()
        work[~alive, :] = -np.inf
        work[:, ~alive] = -np.inf
        np.fill_diagonal(work, -np.inf)
        idx = np.flatnonzero(alive)
        sub = work[np.ix_(idx, idx)]
        nearest = np.argmax(sub, axis=1)
        nearest_s = sub.max(axis=1)
        blocked = sub.copy()
        blocked[np.arange(len(idx)), nearest] = -np.inf
        second = blocked.max(axis=1)
        second = np.where(np.isfinite(second), second, -np.inf)
        with np.errstate(invalid="ignore"):
            unique = (nearest_s >= ARTCUT_MIN) & np.isfinite(nearest_s) & (nearest_s - second >= ARTCUT_MARGIN)
        best_local, best_s = -1, -1.0
        for local, ok in enumerate(unique):
            if not ok:
                continue
            other = int(nearest[local])
            if not bool(unique[other]) or int(nearest[other]) != local:
                continue
            score = float(nearest_s[local])
            if score > best_s:
                best_local, best_s = local, score
        if best_local < 0:
            break
        merge(int(idx[best_local]), int(idx[int(nearest[best_local])]))

    return [[order[index] for index in chunk] for chunk, keep in zip(members, alive) if keep]


def protected_card_ids() -> set[int]:
    raw = psql(
        """
SELECT c.card_id
  FROM public.marketplace_search_candidates c
  JOIN public.pokoin_version_sets s ON s.version = c.version
 WHERE s.source IN ('storm-emeralda-printings', 'artbox-pin');
"""
    )
    found: set[int] = set()
    for line in raw.split():
        line = line.strip()
        if line.isdigit():
            found.add(int(line))
    return found


def apply_groups(
    groups: list[tuple[str, list[int]]],
    reset_ids: list[int] | None = None,
    respect_pins: bool = True,
) -> str:
    protected = protected_card_ids() if respect_pins else set()
    if protected:
        print(f"  keep {len(protected)} pinned printings", flush=True)
        groups = [
            (name, [pid for pid in ids if pid not in protected])
            for name, ids in groups
        ]
        groups = [(name, ids) for name, ids in groups if len(ids) >= 2]
        if reset_ids:
            reset_ids = [pid for pid in reset_ids if pid not in protected]
    if reset_ids:
        unique_reset = sorted(set(reset_ids))
        print(f"  reset {len(unique_reset)} printings to singleton keys", flush=True)
        reset_chunk = 2000
        for offset in range(0, len(unique_reset), reset_chunk):
            id_list = ", ".join(str(i) for i in unique_reset[offset : offset + reset_chunk])
            psql(
                f"""
SET statement_timeout = 0;
INSERT INTO public.pokoin_version_sets (version, gameplay_name, member_count, source)
SELECT 'v' || c.card_id::text,
       COALESCE(NULLIF(c.name, ''), 'card'),
       1,
       'singleton'
  FROM public.marketplace_search_candidates c
 WHERE c.card_id IN ({id_list})
ON CONFLICT (version) DO NOTHING;
UPDATE public.marketplace_search_candidates
   SET version = 'v' || card_id::text
 WHERE card_id IN ({id_list});
""",
                timeout=600,
            )
            print(f"  reset {min(offset + reset_chunk, len(unique_reset))}/{len(unique_reset)}", flush=True)
        psql(
            """
SET statement_timeout = 0;
DELETE FROM public.pokoin_version_sets s
 WHERE s.source = 'artcut'
   AND NOT EXISTS (
     SELECT 1 FROM public.marketplace_search_candidates c
      WHERE c.version = s.version
   );
""",
            timeout=600,
        )
    if not groups:
        return "no groups"
    # One SSH session per chunk. Keep chunks large so we don't hammer sshd.
    chunk = []
    outputs = []
    done = 0
    for name, ids in groups:
        chunk.append((name, ids))
        if len(chunk) >= 400:
            outputs.append(psql("\n".join(statements_for(chunk)), timeout=600))
            done += len(chunk)
            print(f"  apply {done}/{len(groups)}", flush=True)
            chunk = []
    if chunk:
        outputs.append(psql("\n".join(statements_for(chunk)), timeout=600))
        done += len(chunk)
        print(f"  apply {done}/{len(groups)}", flush=True)
    return "\n".join(outputs[-3:])


def statements_for(groups: list[tuple[str, list[int]]]) -> list[str]:
    statements = ["SET statement_timeout = 0;"]
    for name, ids in groups:
        key = f"v{ids[0]}"
        id_list = ", ".join(str(i) for i in ids)
        others = ", ".join(f"'v{i}'" for i in ids[1:])
        label = name.replace("'", "''")
        statements.append(
            f"""
INSERT INTO public.pokoin_version_sets (version, gameplay_name, member_count, source)
VALUES ('{key}', '{label}', {len(ids)}, 'artcut')
ON CONFLICT (version) DO UPDATE
  SET gameplay_name = EXCLUDED.gameplay_name,
      member_count = EXCLUDED.member_count,
      source = EXCLUDED.source,
      updated_at = now();
UPDATE public.marketplace_search_candidates
   SET version = '{key}'
 WHERE card_id IN ({id_list});
"""
        )
        if others:
            statements.append(
                f"""
DELETE FROM public.pokoin_version_sets
 WHERE version IN ({others})
   AND NOT EXISTS (
     SELECT 1 FROM public.marketplace_search_candidates c
      WHERE c.version = pokoin_version_sets.version
   );
"""
            )
    return statements


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name", nargs="?", help="Exact card name, or omit with --all")
    parser.add_argument("--all", action="store_true")
    parser.add_argument(
        "--match",
        help="Only name_keys matching this regex. Unown letters: '^unown \\\\['",
    )
    parser.add_argument(
        "--ids",
        help="Public card_id and/or leftover ct_id list. Re-clusters those name buckets.",
    )
    parser.add_argument(
        "--expansion",
        help='Exact set_name (folded). Example: "30th Celebration JP"',
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--refresh-candidates", action="store_true")
    parser.add_argument(
        "--reencode",
        action="store_true",
        help="Rebuild illustration-box CLIP vectors on the 7900 XTX",
    )
    parser.add_argument(
        "--split-secrets",
        action="store_true",
        help="Split existing version-sets that mixed same-set regular and IR/FA/SIR arts",
    )
    parser.add_argument(
        "--apply-cached",
        action="store_true",
        help="Apply scripts/out/version-groups.json without re-encoding",
    )
    parser.add_argument(
        "--pipeline",
        action="store_true",
        help="Run leftover tests, cluster --all, apply, then SQL-verify known pairs",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="SQL-check known reprint pairs on nezopt 15T Postgres",
    )
    args = parser.parse_args()
    if args.pipeline:
        test = Path(__file__).with_name("cluster-name-version-sets.test.py")
        print(f"tests {test}", flush=True)
        completed = subprocess.run([sys.executable, str(test)])
        if completed.returncode != 0:
            raise SystemExit(completed.returncode)
        args.all = True
        args.refresh_candidates = True
    if args.verify and not (
        args.all
        or args.name
        or args.match
        or args.ids
        or args.expansion
        or args.apply_cached
        or args.split_secrets
        or args.pipeline
    ):
        print(verify_version_sets())
        return
    if args.split_secrets:
        rows = dump_candidates(force=args.refresh_candidates)
        by_version = defaultdict(list)
        for row in rows:
            pid = int(row.get("card_id") or 0)
            key = str(row.get("version") or "").strip()
            if pid and key:
                by_version[key].append(row)
        groups = []
        reset_ids = []
        for members in by_version.values():
            ids = [int(row["card_id"]) for row in members]
            by_id = {int(row["card_id"]): row for row in members}
            split = split_secret_regular_arts([ids], by_id)
            unchanged = [sorted(set(ids))] if len(ids) >= 2 else []
            if split == unchanged:
                continue
            reset_ids.extend(ids)
            label = display_name(members)
            for chunk in split:
                groups.append((label, chunk))
        print(
            f"split mixed regular/secret groups "
            f"{len(set(reset_ids))} printings → {len(groups)} artwork keys",
            flush=True,
        )
        if args.dry_run:
            return
        print(apply_groups(groups, reset_ids=sorted(set(reset_ids)), respect_pins=False))
        return
    if args.apply_cached:
        raw = json.loads(GROUPS.read_text())
        if isinstance(raw, dict):
            groups = [tuple(item) for item in raw.get("groups") or []]
            reset_ids = [int(i) for i in raw.get("reset_ids") or []]
        else:
            groups = [tuple(item) for item in raw]
            reset_ids = [int(pid) for _, ids in groups for pid in ids]
        print(f"cached groups {len(groups)} from {GROUPS}", flush=True)
        print(apply_groups(groups, reset_ids=reset_ids))
        apply_artbox_pins()
        if args.verify or args.pipeline:
            print(verify_version_sets())
        return
    if not args.all and not args.name and not args.match and not args.ids and not args.expansion:
        raise SystemExit("pass a name, --match, --ids, --expansion, or --all")

    rows = dump_candidates(force=args.refresh_candidates)
    if args.name:
        want = name_key(args.name)
        rows = [row for row in rows if name_key(row.get("name")) == want]
    by_name = defaultdict(list)
    for row in rows:
        key = name_key(row.get("name"))
        pid = int(row.get("card_id") or 0)
        if key and pid:
            by_name[key].append(row)
    if args.match:
        rx = re.compile(args.match)
        by_name = defaultdict(list, {key: members for key, members in by_name.items() if rx.search(key)})
        if not by_name:
            raise SystemExit(f"no name_keys match {args.match!r}")
    if args.ids or args.expansion:
        imported = name_keys_for_import(
            rows,
            parse_id_list(args.ids or ""),
            args.expansion or "",
        )
        if not imported:
            raise SystemExit("no imported printings matched --ids/--expansion")
        by_name = defaultdict(list, {key: members for key, members in by_name.items() if key in imported})
        print(f"import name buckets {len(by_name)}", flush=True)
    catalog = load_catalog_vecs()
    leftovers = leftover_index()
    cache = load_artcut_cache()
    need = []
    placeholder_ids: set[int] = set()
    for members in by_name.values():
        if len(members) < 2:
            continue
        for row in members:
            pid = int(row["card_id"])
            path = resolve_leftover(row.get("ct_id"), leftovers, row.get("name") or "", row.get("card_number") or "")
            if not path:
                continue
            if is_placeholder_leftover(path):
                placeholder_ids.add(pid)
                continue
            if args.reencode or pid not in cache:
                need.append((pid, path))
    if args.reencode:
        for pid, _ in need:
            cache.pop(pid, None)
    print(f"names {len(by_name)} · leftovers {len(leftovers)} · art-box missing {len(need)} · placeholders {len(placeholder_ids)} · cache {len(cache)}", flush=True)
    encode_artcuts(need, cache)

    pixel_store = {} if args.reencode else load_pixel_cache()
    pixel: dict[int, np.ndarray] = {}
    pixel_need = 0
    for members in by_name.values():
        if len(members) < 2:
            continue
        for row in members:
            pid = int(row["card_id"])
            path = resolve_leftover(row.get("ct_id"), leftovers, row.get("name") or "", row.get("card_number") or "")
            if not path or pid in placeholder_ids or is_placeholder_leftover(path):
                continue
            cached = pixel_store.get(pid)
            if cached and cached[0] == path.name:
                pixel[pid] = cached[1]
                continue
            vec = pixel_art_vec(path)
            if vec is None:
                continue
            pixel[pid] = vec
            pixel_store[pid] = (path.name, vec)
            pixel_need += 1
            if pixel_need % 2000 == 0:
                print(f"  pixel {pixel_need}", flush=True)
    if pixel_need:
        save_pixel_cache(pixel_store)
    print(f"pixel poses {len(pixel)} (encoded {pixel_need})", flush=True)

    groups = []
    pokemon_keys = pokemon_name_keys()
    print(f"pokemon name keys {len(pokemon_keys)}", flush=True)
    for key, members in sorted(by_name.items()):
        ids = [int(row["card_id"]) for row in members if int(row["card_id"]) not in placeholder_ids]
        clustered = cluster_name(ids, catalog, cache, pixel, pokemon=key in pokemon_keys)
        by_id = {int(row["card_id"]): row for row in members}
        clustered = split_secret_regular_arts(clustered, by_id)
        label = display_name(members)
        for chunk in clustered:
            groups.append((label, chunk))

    print(f"illustration groups {len(groups)} (≥2 printings)")
    reset_ids = [int(row["card_id"]) for members in by_name.values() for row in members]
    GROUPS.parent.mkdir(parents=True, exist_ok=True)
    GROUPS.write_text(json.dumps({"groups": groups, "reset_ids": reset_ids}))
    ranked = sorted(groups, key=lambda item: -len(item[1]))
    if ranked:
        print(f"largest n={len(ranked[0][1])} {ranked[0][0]} v{ranked[0][1][0]}")
    for name, ids in ranked:
        if len(ids) < 12:
            break
        print(f"  large v{ids[0]} n={len(ids)} {name}")
    scoped = bool(args.name or args.match or args.ids or args.expansion)
    show = groups if scoped else [
        g
        for g in groups
        if 234452 in g[1]
        or 271336 in g[1]
        or 504600 in g[1]
        or 609298 in g[1]
        or g[0] in ("Cacturne", "Flareon", "Espurr", "Pikachu δ Delta Species", "Drifblim")
    ]
    if args.name or args.match:
        show = groups
    by_id = {int(row["card_id"]): row for members in by_name.values() for row in members}
    for name, ids in show[:80]:
        print(f"  v{ids[0]} n={len(ids)} {name}")
        for pid in ids:
            row = by_id[pid]
            lang = (row.get("nationality") or "")[:8]
            print(f"    {pid} {lang:8} {row.get('set_name')} {row.get('card_number')}")
    if args.dry_run or not groups:
        if args.pipeline and args.dry_run:
            print("dry-run: skip apply and SQL verify", flush=True)
        return
    try:
        print(apply_groups(groups, reset_ids=reset_ids))
        apply_artbox_pins()
        print(
            "pokedex sort "
            + psql("SELECT public.marketplace_refresh_artwork_cluster_sort(NULL);").strip(),
            flush=True,
        )
    except SystemExit:
        print(f"apply failed; retry with --apply-cached ({GROUPS})", flush=True)
        raise
    if args.pipeline or args.verify:
        print(verify_version_sets())


if __name__ == "__main__":
    main()
