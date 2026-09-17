#!/usr/bin/env python3
"""Tag local leftover JPEG printings like CardTrader's versions tab.

Each public_id stays a product. CLIP clusters leftover scans inside a gameplay
name so we can label reprint vs alt. When CLIP leaves eur empty, equalized
64×64 art-window pixels uniquely link the same illustration across languages
(Pikachu δ PCG-P 112 → EN Legend Maker 093/92). Qwen 3.8 27B reviews those
clusters using local gallery filenames (not live CDN). Western/JP/CN scan ids
are embed sources only — never desk-id rewrites.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import re
import subprocess
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

import numpy as np

CATALOGS = Path("/home/nez/Projects/BattleScan/runtime/catalogs-20260903-jp-reference")
LOCAL_CDN = Path("/home/nez/Projects/pokoin/PokoinTest/index/cdn_images")
LOCAL_CDN_DIGEST = Path("/home/nez/pokoincdn/cdn_images_digest")
PI_OBJECTS = Path("/home/nez/mnt/mybook/pokoin-pi-card-images/objects")
REPO = Path("/home/nez/Projects/pokemon-card-extension")
LEFTOVER_ROOTS = (LOCAL_CDN, PI_OBJECTS, LOCAL_CDN_DIGEST)
QWEN_MODEL = "qwen3.8:27b-128k"
# Leftover gallery prompts are a few KB. 131072 makes every Ollama call spend
# ~30s in prompt eval; MCP chat still uses 131072.
QWEN_NUM_CTX = 16384
AUTO_MERGE = 0.90
CROSS_LANG = 0.86
# Greedy CROSS_LANG misses EN SIR leftovers at ~0.85 (Mega Froslass 741826↔720194).
# Mutual nearest-neighbor with a 0.03 margin links those without Oddish-style collisions.
AMBIG_LO = 0.82
AMBIG_MARGIN = 0.03
# CLIP art-box chains Pikachu δ faces (~0.90 running Holon 079 vs leaning 93/92).
# Equalized illustration pixels separate those poses (0.90 vs 0.10).
# 0.80 missed EN/JP of the same crop (Cottonee 010/098 ↔ Black Collection 004/053 ~0.77).
PIXEL_BOX = (0.16, 0.155, 0.84, 0.50)
PIXEL_FACE_BOX = (0.28, 0.16, 0.72, 0.40)
PIXEL_FACE_WEIGHT = 0.6
PIXEL_SIZE = 64
PIXEL_AUTO = 0.90
PIXEL_MIN = 0.80
PIXEL_MARGIN = 0.12
STAMP_RE = re.compile(
    r"staff|top8|top 8|league promos|prize pack|battle academy|championship|stamped",
    re.I,
)
ALT_HINT_RE = re.compile(
    r"secret rare|gold|illustration rare|full art|alt art|gg end|hyper rare",
    re.I,
)
LANGS = ("western", "japanese", "chinese")
# Same-art links confirmed by the live Pokoin versions lineage but missed by
# the image thresholds. Keep these explicit so regenerating print-langs does
# not disable a language that the desk can already show.
KNOWN_SAME_ART_GROUPS = (
    {
        "members": ("236804", "275876", "276178"),
        "eur": "236804",
        "jp": "276178",
        "cn": "",
        "art": "art_236804",
    },
    {
        "members": ("220966", "642866"),
        "eur": "220966",
        "jp": "642866",
        "cn": "",
        "art": "art_220966",
        "images": {
            "642866": "https://cardtrader.com/uploads/blueprints/image/321433/preview_meowstic-008-022-emboar-ex-vs-togekiss-ex-deck-kit.jpg",
        },
    },
)
NULL_FIELDS = {
    "ct_id",
    "illustrator",
    "leftover_image_url",
    "leftover_local_name",
    "collector_number",
    "set_name",
    "eur_scan_id",
    "jp_scan_id",
    "cn_scan_id",
    "eur_image_url",
    "jp_image_url",
    "cn_image_url",
    "reprint_cluster_id",
}


class UnionFind:
    def __init__(self):
        self.parent = {}

    def add(self, item):
        self.parent.setdefault(item, item)

    def find(self, item):
        self.add(item)
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


def load_lang(lang: str):
    meta_path = CATALOGS / f"pokemon_{lang}" / "metadata.jsonl"
    emb_path = CATALOGS / f"pokemon_{lang}" / "embeddings.npy"
    meta = [json.loads(line) for line in meta_path.read_text().splitlines() if line.strip()]
    emb = np.load(emb_path)
    if len(meta) != len(emb):
        raise SystemExit(f"{lang} metadata/embeddings length mismatch {len(meta)} vs {len(emb)}")
    norms = np.linalg.norm(emb, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return meta, (emb / norms).astype(np.float32)


_LOCAL_NAMES = None


def leftover_local_name(image_url: str) -> str:
    return Path(urlparse(image_url or "").path).name


def local_names() -> set[str]:
    global _LOCAL_NAMES
    if _LOCAL_NAMES is None:
        _LOCAL_NAMES = {path.name for path in LOCAL_CDN.iterdir() if path.is_file()} if LOCAL_CDN.is_dir() else set()
        print(f"local leftover gallery {len(_LOCAL_NAMES)} files under {LOCAL_CDN}", flush=True)
    return _LOCAL_NAMES


def local_cdn_exists(image_url: str) -> bool:
    name = leftover_local_name(image_url)
    return bool(name) and name in local_names()


def leftover_files_by_ct_id() -> dict[str, list[str]]:
    files: dict[str, list[str]] = defaultdict(list)
    for name in local_names():
        stem = name.split("_", 1)[0]
        if stem.isdigit():
            files[stem].append(name)
    return files


def leftover_path(row: dict) -> Path | None:
    local_name = leftover_local_name(row.get("image_url") or row.get("local_name") or "")
    ct_id = str(row.get("ct_id") or "")
    if local_name:
        for root in LEFTOVER_ROOTS:
            if not root.is_dir():
                continue
            path = root / local_name
            if path.is_file() and "_homepage" not in path.name.lower():
                return path
    if not ct_id.isdigit():
        return None
    for root in LEFTOVER_ROOTS:
        if not root.is_dir():
            continue
        hits = sorted(
            path
            for path in root.glob(ct_id + "_*")
            if path.is_file()
            and "_homepage" not in path.name.lower()
            and path.suffix.lower() in {".jpg", ".jpeg", ".png"}
        )
        if hits:
            return hits[0]
    return None


def pixel_art_vec(path: Path, box: tuple[float, float, float, float] | None = None) -> np.ndarray | None:
    from PIL import Image, ImageOps

    def crop_vec(use_box: tuple[float, float, float, float]) -> np.ndarray | None:
        try:
            image = Image.open(path)
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGBA").convert("RGB")
            else:
                image = image.convert("RGB")
        except Exception:
            return None
        width, height = image.size
        if width < 16 or height < 16:
            return None
        left, top, right, bottom = use_box
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

    if box is not None:
        return crop_vec(box)
    full = crop_vec(PIXEL_BOX)
    face = crop_vec(PIXEL_FACE_BOX)
    if full is None:
        return face
    if face is None:
        return full
    blended = (1.0 - PIXEL_FACE_WEIGHT) * full + PIXEL_FACE_WEIGHT * face
    norm = float(np.linalg.norm(blended)) or 1e-8
    return (blended / norm).astype(np.float32)


def pixel_vec_for_row(row: dict, cache: dict[str, np.ndarray | None]) -> np.ndarray | None:
    pid = str(row.get("public_id") or "")
    if pid in cache:
        return cache[pid]
    path = leftover_path(row)
    vec = pixel_art_vec(path) if path else None
    cache[pid] = vec
    return vec


def leftover_jpeg_cdn_url(ct_id: str, files_by_ct: dict[str, list[str]] | None = None) -> str:
    files = (files_by_ct or {}).get(str(ct_id or ""), [])
    for name in files:
        lower = name.lower()
        if lower.endswith(".jpg") or lower.endswith(".jpeg"):
            return f"https://cdn.pokoin.com/{name}"
    return ""


def backfill_row_image_url(row: dict, files_by_ct: dict[str, list[str]]) -> dict:
    if row.get("image_url"):
        return row
    filled = leftover_jpeg_cdn_url(row.get("ct_id") or "", files_by_ct)
    if filled:
        row = dict(row)
        row["image_url"] = filled
        row["local_name"] = leftover_local_name(filled)
        row["cdn_local"] = True
    return row


def union_cross_lang(
    a_rows: list[dict],
    b_rows: list[dict],
    uf: UnionFind,
    threshold: float,
    *,
    mutual: bool = False,
    margin: float = 0.0,
) -> int:
    if not a_rows or not b_rows:
        return 0
    sim = np.stack([row["vec"] for row in a_rows]) @ np.stack([row["vec"] for row in b_rows]).T
    links = 0
    for i, a in enumerate(a_rows):
        j = int(sim[i].argmax())
        score = float(sim[i, j])
        if score < threshold:
            continue
        if margin:
            ranked = np.sort(sim[i])
            second = float(ranked[-2]) if ranked.size > 1 else 0.0
            if score - second < margin:
                continue
        if mutual and int(sim[:, j].argmax()) != i:
            continue
        uf.union(a["public_id"], b_rows[j]["public_id"])
        links += 1
    return links


def union_pixel_cross_lang(
    a_rows: list[dict],
    b_rows: list[dict],
    uf: UnionFind,
    cache: dict[str, np.ndarray | None],
    *,
    threshold: float = PIXEL_MIN,
    margin: float = PIXEL_MARGIN,
) -> int:
    """Mutual unique nearest leftover pixels. CLIP cannot split Pikachu δ poses."""
    a_ready = []
    b_ready = []
    for row in a_rows:
        vec = pixel_vec_for_row(row, cache)
        if vec is not None:
            a_ready.append((row, vec))
    for row in b_rows:
        vec = pixel_vec_for_row(row, cache)
        if vec is not None:
            b_ready.append((row, vec))
    if not a_ready or not b_ready:
        return 0
    sim = np.stack([vec for _, vec in a_ready]) @ np.stack([vec for _, vec in b_ready]).T
    links = 0
    for i, (a, _) in enumerate(a_ready):
        j = int(sim[i].argmax())
        score = float(sim[i, j])
        if score < threshold:
            continue
        ranked = np.sort(sim[i])
        second = float(ranked[-2]) if ranked.size > 1 else 0.0
        if score - second < margin:
            continue
        if int(sim[:, j].argmax()) != i:
            continue
        uf.union(a["public_id"], b_ready[j][0]["public_id"])
        links += 1
    return links


def merge_lang_rec(left: list, right: list) -> list | None:
    next_rec = [
        str(left[0] or right[0] or "").strip(),
        str(left[1] or right[1] or "").strip(),
        str(left[2] or right[2] or "").strip(),
        max(int(left[3] or 0), int(right[3] or 0)),
        left[4] or right[4] or "",
    ]
    for index in range(3):
        a = str(left[index] or "").strip()
        b = str(right[index] or "").strip()
        if a and b and a != b:
            return None
    return next_rec


def apply_known_same_art_index(index: dict) -> int:
    """Apply reviewed same-art language links to an existing compact index."""
    ids = index.setdefault("ids", {})
    images = index.setdefault("img", {})
    links = 0
    for group in KNOWN_SAME_ART_GROUPS:
        members = tuple(str(pid) for pid in group["members"])
        versions = max(
            (int((ids.get(pid) or ["", "", "", 0])[3] or 0) for pid in members),
            default=0,
        )
        rec = [group["eur"], group["jp"], group["cn"], versions, group["art"]]
        for pid in members:
            if ids.get(pid) != rec:
                links += 1
            ids[pid] = rec
        for pid, image_url in (group.get("images") or {}).items():
            images[str(pid)] = str(image_url)
    return links


def rec_from_catalog_row(row: dict) -> list:
    pid = str(row.get("public_id") or "")
    lang = row.get("language") or ""
    eur = pid if lang == "western" else ""
    jp = pid if lang == "japanese" else ""
    cn = pid if lang == "chinese" else ""
    return [eur, jp, cn, 0, f"art_{pid}"]


def pixel_link_index(index: dict, by_name: dict[str, list[dict]]) -> int:
    """Fill empty eur/jp/cn packs from pixel-unique same-illustration leftovers."""
    ids = index.setdefault("ids", {})
    img = index.setdefault("img", {})
    uf = UnionFind()
    cache: dict[str, np.ndarray | None] = {}
    by_pid = {}
    for pid in ids:
        uf.add(pid)
    links = 0
    pending_names = 0
    for rows in by_name.values():
        grouped = defaultdict(list)
        pending = False
        for row in rows:
            grouped[row["language"]].append(row)
            uf.add(row["public_id"])
            by_pid[row["public_id"]] = row
            url = row.get("image_url") or ""
            if url and row["public_id"] not in img:
                img[row["public_id"]] = url
            rec = ids.get(row["public_id"])
            if rec and row["language"] != "western" and not rec[0]:
                pending = True
        if not pending or not grouped["western"] or not (grouped["japanese"] or grouped["chinese"]):
            continue
        pending_names += 1
        if pending_names == 1 or pending_names % 100 == 0:
            print(f"  pixel names {pending_names} links {links}", flush=True)
        for left, right in (("western", "japanese"), ("western", "chinese"), ("japanese", "chinese")):
            links += union_pixel_cross_lang(grouped[left], grouped[right], uf, cache)
    roots: dict[str, list[str]] = defaultdict(list)
    for pid in set(ids) | set(by_pid):
        roots[uf.find(pid)].append(pid)
    merged_groups = 0
    for members in roots.values():
        if len(set(members)) < 2:
            continue
        merged = None
        ok = True
        for pid in members:
            rec = ids.get(pid) or (rec_from_catalog_row(by_pid[pid]) if pid in by_pid else None)
            if not rec:
                continue
            merged = print_lang_tuple(rec) if merged is None else merge_lang_rec(merged, print_lang_tuple(rec))
            if merged is None:
                ok = False
                break
        if not ok or not merged or not (merged[0] and (merged[1] or merged[2])):
            continue
        keys = {pid for pid in members if pid}
        keys.update(slot for slot in merged[:3] if slot)
        for pid in keys:
            ids[pid] = merged
        merged_groups += 1
    return links


def print_lang_tuple(rec: list) -> list:
    return [
        str(rec[0] or "").strip(),
        str(rec[1] or "").strip(),
        str(rec[2] or "").strip(),
        int(rec[3] or 0),
        rec[4] if len(rec) > 4 else "",
    ]


def catalog_rows_by_name() -> dict[str, list[dict]]:
    files_by_ct = leftover_files_by_ct_id()
    by_name: dict[str, list[dict]] = defaultdict(list)
    for lang in LANGS:
        meta_path = CATALOGS / f"pokemon_{lang}" / "metadata.jsonl"
        for line in meta_path.read_text().splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            name = row.get("name") or ""
            pid = str(row.get("public_id") or row.get("id") or "")
            if not name or not pid:
                continue
            item = backfill_row_image_url(
                {
                    "public_id": pid,
                    "ct_id": str(row.get("ct_id") or ""),
                    "name": name,
                    "language": lang,
                    "image_url": row.get("image_url") or "",
                    "local_name": leftover_local_name(row.get("image_url") or ""),
                },
                files_by_ct,
            )
            by_name[name].append(item)
    return by_name


def stamp_penalty(row: dict) -> int:
    blob = " ".join(str(row.get(key) or "") for key in ("set", "collector_number", "image_url"))
    return 1 if STAMP_RE.search(blob) else 0


def pick_representative(rows: list[dict]) -> dict | None:
    if not rows:
        return None
    return sorted(
        rows,
        key=lambda row: (
            stamp_penalty(row),
            0 if local_cdn_exists(row.get("image_url") or "") else 1,
            int(row["public_id"]),
        ),
    )[0]


def cluster_id_for(rows: list[dict]) -> str:
    return f"art_{min(int(row['public_id']) for row in rows)}"


def peer2_psql_script(sql: str) -> str:
    completed = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "pokoin-marketplace",
            "docker exec -i pokoin-marketplace-postgres "
            "psql -U pokoin_marketplace -d pokoin_marketplace -v ON_ERROR_STOP=1",
        ],
        input=sql if sql.lstrip().startswith("\\") or sql.rstrip().endswith(";") else sql.rstrip() + ";",
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit(completed.stderr or completed.stdout or "peer2 command failed")
    return completed.stdout


def gameplay_version_counts() -> dict[str, int]:
    out = peer2_psql_script(
        "COPY (SELECT name, COUNT(*) FROM public.marketplace_search_candidates GROUP BY name) TO STDOUT WITH CSV"
    )
    counts = {}
    for line in out.splitlines():
        if not line.strip():
            continue
        name, _, count = line.rpartition(",")
        try:
            counts[name.strip('"')] = int(count)
        except ValueError:
            continue
    return counts


def peer2_version_language_groups() -> dict[str, list[dict]]:
    """Read authoritative same-illustration lineages with expansion nationality."""
    out = peer2_psql_script(
        "COPY ("
        "SELECT c.version, c.card_id::text, x.nationality, "
        "coalesce(nullif(c.cdn_image_url, ''), nullif(c.image_url, ''), "
        "nullif(c.preview_image_url, ''), '') "
        "FROM public.marketplace_search_candidates c "
        "JOIN LATERAL (SELECT e.nationality FROM public.pokoin_pokemon_expansions e "
        "WHERE lower(e.name) = lower(c.set_name) "
        "AND e.nationality IN ('western', 'japanese', 'chinese') "
        "ORDER BY (e.name = c.set_name) DESC, e.expansion_id LIMIT 1) x ON true "
        "WHERE c.version IS NOT NULL AND c.version <> '' "
        "AND c.card_id IS NOT NULL AND c.item_kind = 'single' "
        "ORDER BY c.version, c.card_id"
        ") TO STDOUT WITH CSV"
    )
    groups = defaultdict(list)
    for version, pid, nationality, image_url in csv.reader(out.splitlines()):
        groups[version].append({
            "public_id": str(pid),
            "nationality": nationality,
            "image_url": image_url,
        })
    return groups


def apply_peer2_version_groups_index(index: dict) -> dict:
    """Fill EN/JP/CN packs for every cross-language version lineage."""
    ids = index.setdefault("ids", {})
    images = index.setdefault("img", {})
    applied_groups = 0
    applied_members = 0
    language_slot = {"western": 0, "japanese": 1, "chinese": 2}
    for version, rows in peer2_version_language_groups().items():
        by_id = {row["public_id"]: row for row in rows}
        by_lang = defaultdict(list)
        for row in by_id.values():
            by_lang[row["nationality"]].append(row)
        if len([lang for lang in language_slot if by_lang.get(lang)]) < 2:
            continue

        reps = ["", "", ""]
        for lang, slot in language_slot.items():
            candidates = by_lang.get(lang) or []
            if not candidates:
                continue
            candidate_ids = {row["public_id"] for row in candidates}
            for pid in by_id:
                current = ids.get(pid) or []
                if len(current) > slot and str(current[slot] or "") in candidate_ids:
                    reps[slot] = str(current[slot])
                    break
            if not reps[slot]:
                candidates.sort(key=lambda row: (0 if "cdn.pokoin.com" in row["image_url"] else 1, int(row["public_id"])))
                reps[slot] = candidates[0]["public_id"]

        prior = next((ids.get(pid) for pid in by_id if ids.get(pid)), None) or []
        artwork_id = str(prior[4] or "") if len(prior) > 4 else ""
        if not artwork_id:
            artwork_id = f"art_{min(int(pid) for pid in by_id)}"
        rec = [reps[0], reps[1], reps[2], len(by_id), artwork_id]
        changed = False
        for pid in by_id:
            if ids.get(pid) != rec:
                changed = True
                applied_members += 1
            ids[pid] = rec
        for pid in reps:
            if pid and by_id[pid].get("image_url"):
                images[pid] = by_id[pid]["image_url"]
        if changed:
            applied_groups += 1
    return {"groups": applied_groups, "members": applied_members}


def illustrators_by_card_id() -> dict[str, str]:
    try:
        out = peer2_psql_script(
            "COPY (SELECT card_id::text, coalesce(nullif(illustrator, ''), artist) "
            "FROM public.marketplace_blueprint_artists "
            "WHERE coalesce(nullif(illustrator, ''), artist) IS NOT NULL) TO STDOUT WITH CSV"
        )
    except SystemExit as error:
        print(f"illustrator copy skipped: {error}", file=sys.stderr)
        return {}
    mapped = {}
    for line in out.splitlines():
        card_id, _, artist = line.partition(",")
        artist = artist.strip().strip('"')
        if card_id and artist:
            mapped[card_id.strip('"')] = artist
    return mapped


def qwen_chat(prompt: str, timeout_s: int = 240) -> str:
    body = json.dumps(
        {
            "model": QWEN_MODEL,
            "stream": False,
            "keep_alive": "30m",
            "think": False,
            "options": {
                "num_ctx": QWEN_NUM_CTX,
                "temperature": 0.1,
                "num_predict": 700,
            },
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are Qwen 3.8 27B labeling Pokoin leftover JPEG printings the way "
                        "CardTrader's versions tab works. Each public_id is its own product. "
                        "A versions tab lists reprints of the same illustration AND alternative "
                        "illustrations. Never merge ids. Stamped Battle Academy copies of the same "
                        "Nest Ball art are reprints. Gold secret / different illustrator / GG End "
                        "are alt. Do not think aloud. Reply with JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        }
    ).encode()
    req = urllib.request.Request(
        "http://127.0.0.1:11434/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as response:
        payload = json.loads(response.read().decode())
    return ((payload.get("message") or {}).get("content") or "").strip()


def parse_qwen_json(text: str):
    if not text:
        return {}
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        start = text.find("[")
        end = text.rfind("]")
        if start < 0 or end <= start:
            return {}
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return {}
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}


def cluster_records():
    local_names()
    packs = {}
    for lang in LANGS:
        packs[lang] = load_lang(lang)
        print(f"loaded {lang} leftover catalog ({len(packs[lang][0])} rows)", flush=True)
    files_by_ct = leftover_files_by_ct_id()
    by_name = defaultdict(list)
    records = {}
    for lang, (meta, emb) in packs.items():
        for index, row in enumerate(meta):
            name = row.get("name") or ""
            pid = str(row.get("public_id") or row.get("id") or "")
            if not name or not pid:
                continue
            item = backfill_row_image_url(
                {
                    "public_id": pid,
                    "ct_id": str(row.get("ct_id") or ""),
                    "name": name,
                    "set": row.get("set") or "",
                    "collector_number": row.get("collector_number") or "",
                    "language": lang,
                    "image_url": row.get("image_url") or "",
                    "local_name": leftover_local_name(row.get("image_url") or ""),
                    "cdn_local": local_cdn_exists(row.get("image_url") or ""),
                    "vec": emb[index],
                },
                files_by_ct,
            )
            records[pid] = item
            by_name[name].append(item)

    uf = UnionFind()
    for pid in records:
        uf.add(pid)
    for group in KNOWN_SAME_ART_GROUPS:
        members = [pid for pid in group["members"] if pid in records]
        for pid in members[1:]:
            uf.union(members[0], pid)
    auto_links = 0
    for name, rows in by_name.items():
        grouped = defaultdict(list)
        for row in rows:
            grouped[row["language"]].append(row)
        for lang in LANGS:
            lang_rows = grouped[lang]
            if len(lang_rows) < 2:
                continue
            mat = np.stack([row["vec"] for row in lang_rows])
            sim = mat @ mat.T
            for i, a in enumerate(lang_rows):
                for j in range(i + 1, len(lang_rows)):
                    if float(sim[i, j]) >= AUTO_MERGE:
                        uf.union(a["public_id"], lang_rows[j]["public_id"])
                        auto_links += 1
        for left, right in (("western", "japanese"), ("western", "chinese"), ("japanese", "chinese")):
            auto_links += union_cross_lang(grouped[left], grouped[right], uf, CROSS_LANG)
            auto_links += union_cross_lang(
                grouped[left],
                grouped[right],
                uf,
                AMBIG_LO,
                mutual=True,
                margin=AMBIG_MARGIN,
            )
    pixel_cache: dict[str, np.ndarray | None] = {}
    pixel_links = 0
    for rows in by_name.values():
        grouped = defaultdict(list)
        for row in rows:
            grouped[row["language"]].append(row)
        for left, right in (("western", "japanese"), ("western", "chinese"), ("japanese", "chinese")):
            pixel_links += union_pixel_cross_lang(grouped[left], grouped[right], uf, pixel_cache)
    auto_links += pixel_links
    print(
        f"clustered {len(records)} leftover printings across {len(by_name)} names "
        f"({auto_links} links, {pixel_links} pixel)",
        flush=True,
    )
    return records, by_name, uf, auto_links


def name_clusters(rows: list[dict], uf: UnionFind) -> dict[str, list[dict]]:
    clustered = defaultdict(list)
    for row in rows:
        clustered[uf.find(row["public_id"])].append(row)
    return {cluster_id_for(members): members for members in clustered.values()}


def auto_reprint_cluster(clusters: dict[str, list[dict]]) -> str:
    return max(clusters, key=lambda cid: (len(clusters[cid]), -int(cid.split("_")[1])))


def slim_qwen_job(job: dict) -> dict:
    clusters = []
    for cluster in (job.get("clusters") or [])[:6]:
        members = []
        for row in (cluster.get("members") or [])[:1]:
            member = {
                "lang": row.get("lang"),
                "set": (row.get("set") or "")[:32],
                "num": row.get("num"),
            }
            if row.get("hint") == "alt":
                member["hint"] = "alt"
            members.append(member)
        clusters.append({"id": cluster.get("id"), "n": cluster.get("size"), "m": members})
    compact_index = {"ids": compact_ids, "img": compact_img}
    try:
        peer2_links = apply_peer2_version_groups_index(compact_index)
    except SystemExit as error:
        print(f"peer2 version links skipped: {error}", file=sys.stderr)
        peer2_links = {"groups": 0, "members": 0}
    apply_known_same_art_index(compact_index)
    return {
        "name": job.get("name"),
        "versions": job.get("peer2_versions"),
        "clusters": clusters,
    }


def qwen_label_names(jobs: list[dict], limit: int) -> dict[str, dict]:
    labeled = {}
    jobs = sorted(
        jobs,
        key=lambda job: (-int(job.get("peer2_versions") or 0), -len(job.get("clusters") or [])),
    )[:limit]
    heavy_n = sum(1 for job in jobs if len(job.get("clusters") or []) >= 6)
    print(f"qwen queue {len(jobs)} (heavy {heavy_n}, light {len(jobs) - heavy_n})", flush=True)
    print("qwen first names: " + ", ".join(job.get("name") or "?" for job in jobs[:8]), flush=True)
    batches = [[slim_qwen_job(job)] for job in jobs]

    done = 0
    for batch_index, batch in enumerate(batches):
        prompt = (
            "/no_think\nLocal leftover JPEG gallery on nezopt. Label CardTrader versions. "
            "Return JSON {\"names\":[{\"name\":\"Nest Ball\",\"reprint\":[\"art_1\"],\"alt\":[\"art_2\"]}]}. "
            "reprint = same illustration (including stamps). alt = different illustration.\n"
            + json.dumps(batch, ensure_ascii=False)
        )
        timeout_s = 180
        started = time.time()
        try:
            payload = parse_qwen_json(qwen_chat(prompt, timeout_s=timeout_s))
        except Exception as error:
            print(
                f"qwen batch {batch_index} failed ({len(batch)} names, {len(prompt)} chars): {error}",
                file=sys.stderr,
                flush=True,
            )
            if len(batch) > 1:
                for item in batch:
                    try:
                        payload = parse_qwen_json(
                            qwen_chat(
                                "/no_think\nLocal leftover JPEG gallery. JSON "
                                "{\"names\":[{\"name\":\"x\",\"reprint\":[\"art_1\"],\"alt\":[\"art_2\"]}]}.\n"
                                + json.dumps([item], ensure_ascii=False),
                                timeout_s=240,
                            )
                        )
                    except Exception as inner:
                        print(f"qwen retry {item.get('name')} failed: {inner}", file=sys.stderr, flush=True)
                        continue
                    rows = payload.get("names") if isinstance(payload, dict) else payload
                    if isinstance(rows, list):
                        for row in rows:
                            name = str(row.get("name") or "")
                            if name:
                                labeled[name] = {
                                    "reprint": [str(x) for x in (row.get("reprint") or [])],
                                    "alt": [str(x) for x in (row.get("alt") or [])],
                                }
                done += len(batch)
                print(f"qwen names {done} / {len(jobs)} (retried)", flush=True)
            continue
        rows = payload.get("names") if isinstance(payload, dict) else payload
        if isinstance(rows, list):
            for row in rows:
                name = str(row.get("name") or "")
                if name:
                    labeled[name] = {
                        "reprint": [str(item) for item in (row.get("reprint") or [])],
                        "alt": [str(item) for item in (row.get("alt") or [])],
                    }
        done += len(batch)
        print(
            f"qwen names {done} / {len(jobs)} ({len(batch)} in {round(time.time() - started, 1)}s)",
            flush=True,
        )
    return labeled


def build_outputs(skip_qwen: bool, qwen_limit: int) -> dict:
    records, by_name, uf, auto_links = cluster_records()
    print("reading peer2 version counts", flush=True)
    try:
        versions = gameplay_version_counts()
    except Exception as error:
        print(f"peer2 version counts failed: {error}", file=sys.stderr)
        versions = {name: len(rows) for name, rows in by_name.items()}
    artists = illustrators_by_card_id()

    name_cluster_map = {name: name_clusters(rows, uf) for name, rows in by_name.items()}
    qwen_jobs = []
    for name, clusters in name_cluster_map.items():
        if len(clusters) < 2:
            continue
        job_clusters = []
        for cid, members in sorted(clusters.items(), key=lambda item: -len(item[1])):
            sample = sorted(members, key=lambda row: int(row["public_id"]))[:6]
            job_clusters.append(
                {
                    "id": cid,
                    "size": len(members),
                    "members": [
                        {
                            "id": row["public_id"],
                            "lang": row["language"],
                            "set": row["set"],
                            "num": row["collector_number"],
                            "local": row["local_name"] if row["cdn_local"] else "",
                            "hint": "alt" if ALT_HINT_RE.search(row["collector_number"] or row["set"]) else "reprint",
                        }
                        for row in sample
                    ],
                }
            )
        qwen_jobs.append(
            {
                "name": name,
                "peer2_versions": int(versions.get(name) or sum(len(v) for v in clusters.values())),
                "clusters": job_clusters,
            }
        )

    qwen_status = "skipped" if skip_qwen else "auto"
    qwen_labels = {}
    print(f"qwen jobs {len(qwen_jobs)} (limit {qwen_limit}, skip={skip_qwen})", flush=True)
    if not skip_qwen and qwen_jobs:
        qwen_labels = qwen_label_names(qwen_jobs, qwen_limit)
        qwen_status = "reviewed" if qwen_labels else "auto"

    printings = []
    groups = []
    ids = {}
    img = {}
    for name, clusters in name_cluster_map.items():
        reprint_id = auto_reprint_cluster(clusters)
        labels = qwen_labels.get(name) or {}
        reprint_set = set(labels.get("reprint") or [reprint_id])
        alt_set = set(labels.get("alt") or [])
        if not reprint_set:
            reprint_set = {reprint_id}
        version_count = int(versions.get(name) or sum(len(v) for v in clusters.values()))
        name_qwen = "reviewed" if name in qwen_labels else ("skipped" if skip_qwen else "auto")
        groups.append(
            {
                "gameplay_name": name,
                "version_count": version_count,
                "leftover_printing_count": sum(len(v) for v in clusters.values()),
                "reprint_cluster_id": next(iter(reprint_set)),
                "alt_cluster_count": max(len(clusters) - 1, len(alt_set)),
                "qwen_status": name_qwen,
            }
        )
        for cid, members in clusters.items():
            kind = "alt" if cid in alt_set or (cid not in reprint_set and len(clusters) > 1) else "reprint"
            if kind == "alt" and cid in reprint_set:
                kind = "reprint"
            by_lang = defaultdict(list)
            for row in members:
                by_lang[row["language"]].append(row)
            reps = {lang: pick_representative(by_lang.get(lang) or []) for lang in LANGS}
            rec = [
                reps["western"]["public_id"] if reps["western"] else "",
                reps["japanese"]["public_id"] if reps["japanese"] else "",
                reps["chinese"]["public_id"] if reps["chinese"] else "",
                version_count,
                cid,
            ]
            for lang in LANGS:
                if reps[lang] and reps[lang].get("image_url"):
                    img[reps[lang]["public_id"]] = reps[lang]["image_url"]
            for row in members:
                printings.append(
                    {
                        "public_id": row["public_id"],
                        "gameplay_name": name,
                        "version_count": version_count,
                        "nationality": row["language"],
                        "artwork_cluster_id": cid,
                        "artwork_kind": kind,
                        "leftover_image_url": row["image_url"],
                        "leftover_local_name": row["local_name"],
                        "ct_id": row["ct_id"],
                        "collector_number": row["collector_number"],
                        "set_name": row["set"],
                        "illustrator": artists.get(row["public_id"], ""),
                        "eur_scan_id": rec[0],
                        "jp_scan_id": rec[1],
                        "cn_scan_id": rec[2],
                        "eur_image_url": img.get(rec[0], ""),
                        "jp_image_url": img.get(rec[1], ""),
                        "cn_image_url": img.get(rec[2], ""),
                        "cdn_local": "t" if row["cdn_local"] else "f",
                        "qwen_status": name_qwen,
                    }
                )
                ids[row["public_id"]] = rec

    compact_ids = {}
    compact_img = {}
    for pid, rec in ids.items():
        eur_id, jp_id, cn_id, _versions, _art = rec
        if not (jp_id or cn_id or (eur_id and eur_id != pid) or _versions > 1):
            continue
        compact_ids[pid] = rec
        for sibling in (eur_id, jp_id, cn_id):
            if sibling and sibling in img:
                compact_img[sibling] = img[sibling]

    return {
        "printings": printings,
        "groups": groups,
        "index": compact_index,
        "stats": {
            "records": len(records),
            "names": len(by_name),
            "printings": len(printings),
            "groups": len(groups),
            "auto_links": auto_links,
            "qwen_jobs": len(qwen_jobs),
            "qwen_labeled": len(qwen_labels),
            "qwen_status": qwen_status,
            "cdn_local_members": sum(1 for row in printings if row["cdn_local"] == "t"),
            "alts": sum(1 for row in printings if row["artwork_kind"] == "alt"),
            "peer2_version_groups": peer2_links["groups"],
            "peer2_version_members": peer2_links["members"],
        },
    }


def csv_cell(key, value):
    if value is None or value == "":
        return ""
    return value


def write_csv(path: Path, rows: list[dict], fields: list[str]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: csv_cell(key, row.get(key)) for key in fields})


PRINTING_FIELDS = [
    "public_id",
    "gameplay_name",
    "version_count",
    "nationality",
    "artwork_cluster_id",
    "artwork_kind",
    "leftover_image_url",
    "leftover_local_name",
    "ct_id",
    "collector_number",
    "set_name",
    "illustrator",
    "eur_scan_id",
    "jp_scan_id",
    "cn_scan_id",
    "eur_image_url",
    "jp_image_url",
    "cn_image_url",
    "cdn_local",
    "qwen_status",
]
GROUP_FIELDS = [
    "gameplay_name",
    "version_count",
    "leftover_printing_count",
    "reprint_cluster_id",
    "alt_cluster_count",
    "qwen_status",
]


def load_peer2(out_dir: Path):
    schema_local = REPO / "scripts" / "artwork-lang-schema.sql"
    for src, dest in (
        (schema_local, "pokoin-marketplace:/tmp/artwork-lang-schema.sql"),
        (out_dir / "printings.csv", "pokoin-marketplace:/tmp/pokoin-printings.csv"),
        (out_dir / "version-groups.csv", "pokoin-marketplace:/tmp/pokoin-version-groups.csv"),
    ):
        subprocess.run(["scp", "-o", "BatchMode=yes", str(src), dest], check=True)
    completed = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "pokoin-marketplace",
            "docker cp /tmp/artwork-lang-schema.sql pokoin-marketplace-postgres:/tmp/artwork-lang-schema.sql && "
            "docker cp /tmp/pokoin-printings.csv pokoin-marketplace-postgres:/tmp/pokoin-printings.csv && "
            "docker cp /tmp/pokoin-version-groups.csv pokoin-marketplace-postgres:/tmp/pokoin-version-groups.csv",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit(completed.stderr or completed.stdout or "docker cp failed")
    schema = schema_local.read_text()
    peer2_psql_script(
        "SET statement_timeout = 0;\n"
        "DROP TABLE IF EXISTS public.pokoin_card_artwork_members;\n"
        "DROP TABLE IF EXISTS public.pokoin_card_artwork_groups;\n"
        "DROP TABLE IF EXISTS public.pokoin_card_printings;\n"
        "DROP TABLE IF EXISTS public.pokoin_card_version_groups;\n"
        f"{schema}\n"
        "COPY public.pokoin_card_version_groups "
        "(gameplay_name,version_count,leftover_printing_count,reprint_cluster_id,alt_cluster_count,qwen_status) "
        "FROM '/tmp/pokoin-version-groups.csv' WITH (FORMAT csv, HEADER true, "
        "FORCE_NULL (reprint_cluster_id));\n"
        "COPY public.pokoin_card_printings "
        "(public_id,gameplay_name,version_count,nationality,artwork_cluster_id,artwork_kind,"
        "leftover_image_url,leftover_local_name,ct_id,collector_number,set_name,illustrator,"
        "eur_scan_id,jp_scan_id,cn_scan_id,eur_image_url,jp_image_url,cn_image_url,cdn_local,qwen_status) "
        "FROM '/tmp/pokoin-printings.csv' WITH (FORMAT csv, HEADER true, FORCE_NULL "
        "(ct_id,illustrator,leftover_image_url,leftover_local_name,collector_number,set_name,"
        "eur_scan_id,jp_scan_id,cn_scan_id,eur_image_url,jp_image_url,cn_image_url));\n"
    )


def write_index(index: dict) -> Path:
    index_path = REPO / "data" / "print-langs.json"
    raw = json.dumps(index, separators=(",", ":"))
    # This repo is also mounted over SMB on the Mac. Replacing the inode can
    # leave that client reading a stale directory record; update and truncate
    # the existing file instead.
    with index_path.open("r+") as handle:
        handle.seek(0)
        handle.write(raw)
        handle.truncate()
    gz_path = REPO / "data" / "print-langs.json.gz"
    compressed = gzip.compress(raw.encode())
    with gz_path.open("r+b") as handle:
        handle.seek(0)
        handle.write(compressed)
        handle.truncate()
    LOCAL_CDN_DIGEST.mkdir(parents=True, exist_ok=True)
    (LOCAL_CDN_DIGEST / "print-langs.json").write_text(raw)
    return index_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-qwen", action="store_true")
    parser.add_argument("--qwen-limit", type=int, default=4000)
    parser.add_argument("--skip-peer2", action="store_true")
    parser.add_argument("--load-only", action="store_true")
    parser.add_argument("--pixel-index", action="store_true")
    parser.add_argument("--known-links-only", action="store_true")
    parser.add_argument("--version-links-only", action="store_true")
    parser.add_argument("--out", default=str(REPO / "scripts" / "out" / "artwork-lang"))
    args = parser.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.load_only:
        load_peer2(out_dir)
        print(json.dumps({"loaded": True, "out": str(out_dir)}))
        return
    if args.pixel_index:
        started = time.time()
        index_path = REPO / "data" / "print-langs.json"
        index = json.loads(index_path.read_text())
        by_name = catalog_rows_by_name()
        links = pixel_link_index(index, by_name)
        write_index(index)
        print(json.dumps({
            "pixel_links": links,
            "ids": len(index.get("ids") or {}),
            "seconds": round(time.time() - started, 1),
            "pikachu_504600": (index.get("ids") or {}).get("504600"),
        }, indent=2))
        return
    if args.known_links_only:
        index_path = REPO / "data" / "print-langs.json"
        index = json.loads(index_path.read_text())
        links = apply_known_same_art_index(index)
        write_index(index)
        print(json.dumps({"known_links": links, "ids": len(index.get("ids") or {})}, indent=2))
        return
    if args.version_links_only:
        index_path = REPO / "data" / "print-langs.json"
        index = json.loads(index_path.read_text())
        links = apply_peer2_version_groups_index(index)
        apply_known_same_art_index(index)
        write_index(index)
        print(json.dumps({**links, "ids": len(index.get("ids") or {})}, indent=2))
        return

    started = time.time()
    result = build_outputs(skip_qwen=args.skip_qwen, qwen_limit=args.qwen_limit)
    write_csv(out_dir / "printings.csv", result["printings"], PRINTING_FIELDS)
    write_csv(out_dir / "version-groups.csv", result["groups"], GROUP_FIELDS)
    write_index(result["index"])
    (out_dir / "stats.json").write_text(json.dumps(result["stats"], indent=2) + "\n")
    if not args.skip_peer2:
        load_peer2(out_dir)
    print(json.dumps({**result["stats"], "seconds": round(time.time() - started, 1)}, indent=2))


if __name__ == "__main__":
    main()
