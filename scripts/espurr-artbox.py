#!/usr/bin/env python3
"""Cluster Espurr leftover JPEGs by the same illustration.

Loops the artwork box (TCG window under HP / above attacks) through OpenCLIP
ViT-B-32. Leftover catalog CLIP is the JP↔EN backbone; art-box CLIP fills
catalog holes (deck kits) and same-art CN / reprints / stamps. Each public_id
stays its own product.
"""
from __future__ import annotations

import json
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

CARDS = Path("/tmp/espurr.json")
CDN = Path("/home/nez/Projects/pokoin/PokoinTest/index/cdn_images")
DIGEST = Path("/home/nez/pokoincdn/cdn_images_digest")
REPO = Path("/home/nez/Projects/pokemon-card-extension")
WEB = Path("/home/nez/Projects/pokoin-web")
OUT = REPO / "scripts/out/artwork-lang"
CROPS = WEB / "market/public/review/espurr-art"
CATALOGS = Path("/home/nez/Projects/BattleScan/runtime/catalogs-20260903-jp-reference")
# Standard portrait TCG illustration window (fractions of the leftover JPEG).
ART_BOX = (0.07, 0.115, 0.93, 0.515)
CATALOG_MIN = 0.83
ARTBOX_HOLE_MIN = 0.80
CLIP_MODEL = "ViT-B-32"
CLIP_PRETRAINED = "laion2b_s34b_b79k"


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


def resolve(card: dict) -> Path:
    names = []
    if card.get("local"):
        names.append(card["local"])
    if card.get("ct_id"):
        names.append(f"{card['ct_id']}_espurr.jpg")
    for name in names:
        for root in (CDN, DIGEST):
            path = root / name
            if path.is_file():
                return path
    if card.get("ct_id"):
        prefix = f"{card['ct_id']}_"
        for root in (CDN, DIGEST):
            hits = sorted(root.glob(f"{prefix}*"))
            if hits:
                return hits[0]
    raise FileNotFoundError(card["id"])


def crop_artbox(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    left, top, right, bottom = ART_BOX
    box = (
        int(width * left),
        int(height * top),
        int(width * right),
        int(height * bottom),
    )
    return image.crop(box)


def load_catalog_vecs(cards: list[dict]) -> dict[int, np.ndarray]:
    wanted = {int(card["id"]) for card in cards}
    found = {}
    for lang in ("western", "japanese", "chinese"):
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
            if pid in wanted:
                found[pid] = emb[index]
    return found


def pair_score(a: dict, b: dict, art: float, catalog: dict[int, np.ndarray]) -> tuple[float, str]:
    va, vb = catalog.get(a["id"]), catalog.get(b["id"])
    if va is not None and vb is not None:
        return float(va @ vb), "catalog"
    return art, "artbox"


def encode_crops(crops: list[Image.Image]) -> np.ndarray:
    import torch
    import open_clip

    device = "cpu"
    model, _, preprocess = open_clip.create_model_and_transforms(
        CLIP_MODEL, pretrained=CLIP_PRETRAINED, device=device
    )
    model.eval()
    batch = torch.stack([preprocess(crop) for crop in crops]).to(device)
    with torch.inference_mode():
        vecs = model.encode_image(batch)
        vecs = vecs / vecs.norm(dim=-1, keepdim=True)
    return vecs.cpu().numpy().astype(np.float32)


def slim(card: dict) -> dict:
    return {
        "id": card["id"],
        "ct_id": card["ct_id"],
        "lang": card["lang"],
        "set": card["set"],
        "num": card["num"],
        "code": card["code"],
        "image": card["image"],
        "desk": f"https://pokoin.com/marketplace/en/cards/{card['id']}",
        "artbox": f"/review/espurr-art/{card['id']}.jpg",
    }


def group_title(members: list[dict]) -> str:
    by_lang = defaultdict(list)
    for card in members:
        by_lang[card["lang"]].append(card)
    parts = []
    for lang, label in (("japanese", "JP"), ("western", "EN"), ("chinese", "CN")):
        if by_lang[lang]:
            names = " / ".join(f"{row['set']} {row['num']}" for row in by_lang[lang])
            parts.append(f"{label} {names}")
    return " · ".join(parts)


def main() -> None:
    started = time.perf_counter()
    cards = json.loads(CARDS.read_text())
    cards.sort(key=lambda row: (row["lang"], row["set"], row["num"]))
    OUT.mkdir(parents=True, exist_ok=True)
    CROPS.mkdir(parents=True, exist_ok=True)

    crops = []
    paths = []
    for card in cards:
        path = resolve(card)
        paths.append(path)
        crop = crop_artbox(path)
        crops.append(crop)
        crop.save(CROPS / f"{card['id']}.jpg", quality=86)

    t0 = time.perf_counter()
    catalog = load_catalog_vecs(cards)
    catalog_ms = (time.perf_counter() - t0) * 1000
    t0 = time.perf_counter()
    vecs = encode_crops(crops)
    encode_ms = (time.perf_counter() - t0) * 1000
    art_sim = vecs @ vecs.T

    uf = UnionFind()
    links = []
    for i, a in enumerate(cards):
        uf.add(a["id"])
        for j in range(i + 1, len(cards)):
            art = float(art_sim[i, j])
            score, source = pair_score(a, cards[j], art, catalog)
            minimum = CATALOG_MIN if source == "catalog" else ARTBOX_HOLE_MIN
            if score >= minimum:
                uf.union(a["id"], cards[j]["id"])
                links.append((score, source, a, cards[j]))

    clustered = defaultdict(list)
    for index, card in enumerate(cards):
        clustered[uf.find(card["id"])].append((index, card))

    groups = []
    for members in sorted(
        clustered.values(),
        key=lambda rows: (-len(rows), min(row[1]["id"] for row in rows)),
    ):
        member_cards = [card for _, card in members]
        langs = {card["lang"] for card in member_cards}
        scores = []
        indexes = [index for index, _ in members]
        for i, left in enumerate(indexes):
            for right in indexes[i + 1 :]:
                scores.append(float(art_sim[left, right]))
        printings = [slim(card) for card in sorted(member_cards, key=lambda row: (row["lang"], row["id"]))]
        by_lang = {lang: next((row for row in printings if row["lang"] == lang), None) for lang in ("japanese", "western", "chinese")}
        groups.append(
            {
                "title": group_title(member_cards),
                "paired": len(langs) >= 2,
                "note": (
                    f"Same artwork box · {len(printings)} printings · CLIP {min(scores):.3f}–{max(scores):.3f}"
                    if scores
                    else "Unique artwork box in this Espurr list"
                ),
                "score": round(min(scores), 4) if scores else None,
                "artbox": printings[0]["artbox"],
                "printings": printings,
                "jp": by_lang["japanese"],
                "en": by_lang["western"],
                "cn": by_lang["chinese"],
            }
        )

    payload = {
        "revision": "2026-09-06-espurr-artbox",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "host": "test.pokoin.com",
        "path": "/espurr",
        "url": "https://test.pokoin.com/espurr",
        "model": (
            f"leftover catalog CLIP ≥{CATALOG_MIN} plus art-box "
            f"{CLIP_MODEL} {CLIP_PRETRAINED} ≥{ARTBOX_HOLE_MIN} for catalog holes"
        ),
        "rule": (
            "Same card = same illustration, any language. JP/EN/CN, deck reprints, "
            "and stamp reverses of that art stay in one group. Each public_id keeps its own page."
        ),
        "counts": {
            "printings": len(cards),
            "western": sum(1 for card in cards if card["lang"] == "western"),
            "japanese": sum(1 for card in cards if card["lang"] == "japanese"),
            "chinese": sum(1 for card in cards if card["lang"] == "chinese"),
            "artworks": len(groups),
            "paired": sum(1 for group in groups if group["paired"]),
            "unpaired": sum(1 for group in groups if not group["paired"]),
            "catalog_ms": round(catalog_ms, 1),
            "encode_ms": round(encode_ms, 1),
            "total_ms": round((time.perf_counter() - started) * 1000, 1),
            "catalog_min": CATALOG_MIN,
            "artbox_hole_min": ARTBOX_HOLE_MIN,
            "catalog_hits": len(catalog),
        },
        "groups": groups,
    }
    dests = [
        OUT / "espurr-versions.json",
        WEB / "market/public/review/espurr.json",
    ]
    text = json.dumps(payload, indent=2) + "\n"
    for dest in dests:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text)

    print(
        f"catalog {len(catalog)}/{len(cards)} in {catalog_ms:.0f}ms · "
        f"art-box {len(cards)} in {encode_ms:.0f}ms · {len(groups)} artworks"
    )
    print(f"links: {len(links)}")
    for score, source, a, b in sorted(links, reverse=True)[:50]:
        print(
            f"  {score:.3f} {source:7}  {a['lang'][:2]} {a['set'][:24]:24} {a['num'][:18]:18} "
            f"↔ {b['lang'][:2]} {b['set'][:24]:24} {b['num'][:18]}"
        )
    print("--- groups ---")
    for group in groups:
        n = len(group["printings"])
        flag = "PAIR" if group["paired"] else "solo"
        print(f"  [{flag} n={n}] {group['title']}")


if __name__ == "__main__":
    main()
