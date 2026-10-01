#!/usr/bin/env python3
"""Time bundled extension YOLO+Milo western search vs cardscan.pokoin.com on nezopt."""
from __future__ import annotations

import json
import time
import urllib.request
from io import BytesIO
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

ROOT = Path("/home/nez/Projects/pokemon-card-extension")
MODELS = ROOT / "scan" / "models"
API = "https://cardscan.pokoin.com"
CDN = Path("/home/nez/Projects/pokoin/PokoinTest/index/cdn_images")
FIXTURES = Path("/home/nez/Projects/BattleScan/.staging/catalog-switching-20260903/fixtures")
OUT = ROOT / "scripts" / "out" / "ondevice-vs-api-bench.json"

YOLO_SIZE = 640
MILO_SIZE = 448
MILO_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
MILO_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
YOLO_CONF = 0.25
MIN_AREA = 0.01
VINTED_PHOTOS = [
    "https://images1.vinted.net/t/02_02128_978Th5LpKnqbeq1AZeGLrCu4/f800/1786129845.webp?s=4c66bde8bb6b3b9ad653d9d795b7710e4952178f",
    "https://images1.vinted.net/t/02_01a2d_RdHX4YJ77EMTGaQ3i6nKU2rF/f800/1786129845.webp?s=ac9cb9a17ec7dcd2c1fb246f0e26c2cecf0d3df7",
]


def timed(fn):
    t0 = time.perf_counter()
    value = fn()
    return value, (time.perf_counter() - t0) * 1000


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"user-agent": "pokoin-ondevice-bench/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()


def post_api(path: str, blob: bytes, name: str = "listing.jpg") -> tuple[dict, float]:
    boundary = "----pokoinbench"
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode() + blob + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{API}{path}",
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=60) as response:
        payload = json.loads(response.read().decode())
    return payload, (time.perf_counter() - t0) * 1000


def load_rgb(blob: bytes) -> np.ndarray:
    im = ImageOps.exif_transpose(Image.open(BytesIO(blob))).convert("RGB")
    w, h = im.size
    if max(w, h) > 1600:
        scale = 1600 / max(w, h)
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BILINEAR)
    return np.asarray(im)


def boxes_from_yolo(output: np.ndarray, img_w: int, img_h: int) -> list[dict]:
    rows = output.reshape(-1, 6)
    sample = rows[:32]
    max_coord = float(np.max(sample[:, 2:4])) if len(sample) else 0.0
    normalized = max_coord <= 1.5
    sx = img_w if normalized else img_w / YOLO_SIZE
    sy = img_h if normalized else img_h / YOLO_SIZE
    min_area = MIN_AREA * img_w * img_h
    raw = []
    for x1, y1, x2, y2, conf, _cls in rows:
        if conf < YOLO_CONF:
            continue
        px1 = max(0.0, min(img_w, float(x1) * sx))
        py1 = max(0.0, min(img_h, float(y1) * sy))
        px2 = max(0.0, min(img_w, float(x2) * sx))
        py2 = max(0.0, min(img_h, float(y2) * sy))
        if (px2 - px1) * (py2 - py1) < min_area:
            continue
        raw.append((px1, py1, px2, py2, float(conf)))
    raw.sort(key=lambda b: b[4], reverse=True)
    kept = []
    for box in raw:
        if all(_iou(box, prior) <= 0.45 for prior in kept):
            kept.append(box)
    return [{"xyxy": [round(v, 1) for v in b[:4]], "conf": round(b[4], 4)} for b in kept]


def _iou(a, b) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0:
        return 0.0
    aa = (a[2] - a[0]) * (a[3] - a[1])
    ba = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (aa + ba - inter)


class LocalEngine:
    def __init__(self):
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        self.providers = ort.get_available_providers()
        self.yolo = ort.InferenceSession(str(MODELS / "card_detector.onnx"), opts, providers=["CPUExecutionProvider"])
        self.milo = ort.InferenceSession(str(MODELS / "milo.onnx"), opts, providers=["CPUExecutionProvider"])
        self.vectors = np.fromfile(MODELS / "western-embeddings.bin", dtype=np.float32).reshape(-1, 128)
        import gzip
        self.cards = json.loads(gzip.open(MODELS / "western-cards.json.gz", "rb").read())
        self.yolo_name = self.yolo.get_inputs()[0].name
        self.milo_name = self.milo.get_inputs()[0].name

    def detect(self, rgb: np.ndarray) -> tuple[list[dict], float]:
        h, w = rgb.shape[:2]
        inp = np.asarray(Image.fromarray(rgb).resize((YOLO_SIZE, YOLO_SIZE), Image.BILINEAR), dtype=np.float32) / 255.0
        inp = np.transpose(inp, (2, 0, 1))[None, ...]
        (out,), ms = timed(lambda: self.yolo.run(None, {self.yolo_name: inp}))
        return boxes_from_yolo(out[0], w, h), ms

    def embed(self, crop: np.ndarray) -> tuple[np.ndarray, float]:
        im = Image.fromarray(crop).resize((MILO_SIZE, MILO_SIZE), Image.BILINEAR)
        x = np.asarray(im, dtype=np.float32) / 255.0
        x = (x - MILO_MEAN) / MILO_STD
        x = np.transpose(x, (2, 0, 1))[None, ...]
        (out,), ms = timed(lambda: self.milo.run(None, {self.milo_name: x}))
        vec = np.asarray(out, dtype=np.float32).reshape(-1)
        vec = vec / max(float(np.linalg.norm(vec)), 1e-8)
        return vec, ms

    def search(self, vec: np.ndarray, top_k: int = 1) -> tuple[list[dict], float]:
        def _run():
            scores = self.vectors @ vec
            idx = int(np.argmax(scores))
            rec = dict(self.cards[idx])
            rec["score"] = round(float(scores[idx]), 4)
            return [rec]
        return timed(_run)

    def identify(self, blob: bytes, box_limit: int = 24, live: bool = True) -> dict:
        rgb = load_rgb(blob)
        boxes, detect_ms = self.detect(rgb)
        if not boxes:
            h, w = rgb.shape[:2]
            boxes = [{"xyxy": [0, 0, float(w), float(h)], "conf": 1.0}]
        boxes = boxes[:box_limit]
        matches = []
        embed_ms = 0.0
        search_ms = 0.0
        for box in boxes:
            x1, y1, x2, y2 = (int(round(v)) for v in box["xyxy"])
            crop = rgb[max(0, y1):max(0, y2), max(0, x1):max(0, x2)]
            if crop.size == 0:
                continue
            vec, e_ms = self.embed(crop)
            embed_ms += e_ms
            hits, s_ms = self.search(vec)
            search_ms += s_ms
            matches.append({"box": box, "top1": hits[0] if hits else None})
        unique = []
        seen = set()
        for match in matches:
            top = match.get("top1")
            if not top or float(top.get("score") or 0) <= 0.50:
                continue
            key = (top.get("id"), top.get("name"), top.get("collector_number"))
            if key in seen:
                continue
            seen.add(key)
            unique.append(top)
        return {
            "ok": True,
            "worker": "on-device-cpu",
            "providers": self.providers,
            "boxCount": len(boxes),
            "uniqueHits": unique,
            "top1": unique[0] if unique else None,
            "detect_ms": round(detect_ms, 1),
            "embed_ms": round(embed_ms, 1),
            "search_ms": round(search_ms, 1),
            "identify_ms": round(embed_ms + search_ms, 1),
        }


def summarize(payload: dict) -> dict:
    hits = payload.get("uniqueHits") or payload.get("hits") or []
    top = payload.get("top1") or (hits[0] if hits else None)
    return {
        "boxCount": payload.get("boxCount") or len(payload.get("boxes") or []),
        "uniqueCount": len(hits) if isinstance(hits, list) else 0,
        "detect_ms": payload.get("detect_ms"),
        "embed_ms": payload.get("embed_ms"),
        "search_ms": payload.get("search_ms"),
        "identify_ms": payload.get("identify_ms"),
        "top1": None if not top else {
            "name": top.get("name"),
            "set": top.get("set"),
            "collector_number": top.get("collector_number"),
            "score": top.get("score"),
            "id": top.get("id") or top.get("public_id"),
        },
    }


def main() -> int:
    photos = {
        "oddish-leftover": (CDN / "109849_oddish-full-v4.jpg").read_bytes(),
        "hitmonchan-base": (CDN / "111154_hitmonchan-rare-holo-7-102-base-set.jpg").read_bytes(),
        "fixture-case-04": (FIXTURES / "case-04.jpg").read_bytes(),
        "fixture-case-17": (FIXTURES / "case-17.jpg").read_bytes(),
    }
    for index, url in enumerate(VINTED_PHOTOS):
        photos[f"vinted-{index}"] = download(url)

    print("loading local engine...", flush=True)
    load_t0 = time.perf_counter()
    engine = LocalEngine()
    load_ms = (time.perf_counter() - load_t0) * 1000
    print(f"local load {load_ms:.0f}ms providers={engine.providers} cards={len(engine.cards)}", flush=True)
    warmup_blob = next(iter(photos.values()))
    _, warmup_ms = timed(lambda: engine.identify(warmup_blob))
    print(f"local warmup {warmup_ms:.0f}ms", flush=True)

    health, health_ms = timed(lambda: json.loads(urllib.request.urlopen(f"{API}/health", timeout=15).read().decode()))
    print(f"api health {health_ms:.0f}ms worker={health.get('worker')} generic={health.get('n')}", flush=True)

    results = {
        "host": "nezopt",
        "providers": engine.providers,
        "localLoadMs": round(load_ms, 1),
        "apiHealthMs": round(health_ms, 1),
        "apiWorker": health.get("worker"),
        "photos": {},
    }

    for name, blob in photos.items():
        print(f"\n== {name} {len(blob)} bytes ==", flush=True)
        local_runs = []
        for _ in range(3):
            payload, wall = timed(lambda: engine.identify(blob))
            local_runs.append({"wall_ms": round(wall, 1), **summarize(payload), **{k: payload[k] for k in ("detect_ms", "embed_ms", "search_ms") if k in payload}})
            print(f"  local {wall:7.1f}ms detect={payload['detect_ms']:.1f} embed={payload['embed_ms']:.1f} search={payload['search_ms']:.1f} boxes={payload['boxCount']} top={payload['top1']}", flush=True)

        api_album = []
        for _ in range(3):
            try:
                payload, wall = post_api("/identify-album?live=1&top_k=1", blob)
                api_album.append({"wall_ms": round(wall, 1), **summarize(payload)})
                print(f"  api-album {wall:7.1f}ms boxes={payload.get('boxCount')} top={payload.get('top1')}", flush=True)
            except Exception as exc:
                api_album.append({"wall_ms": None, "error": str(exc)})
                print(f"  api-album FAIL {exc}", flush=True)

        api_west = []
        for _ in range(2):
            try:
                payload, wall = post_api("/identify?live=1&album=1&catalog=pokemon_western&top_k=1", blob)
                api_west.append({"wall_ms": round(wall, 1), **summarize(payload)})
                print(f"  api-west  {wall:7.1f}ms boxes={len(payload.get('boxes') or [])} top={payload.get('top1')}", flush=True)
            except Exception as exc:
                api_west.append({"wall_ms": None, "error": str(exc)})
                print(f"  api-west FAIL {exc}", flush=True)

        def median(rows, key="wall_ms"):
            vals = sorted(row[key] for row in rows if isinstance(row.get(key), (int, float)))
            if not vals:
                return None
            return vals[len(vals) // 2]

        local_med = median(local_runs)
        album_med = median(api_album)
        results["photos"][name] = {
            "bytes": len(blob),
            "local": local_runs,
            "apiAlbum": api_album,
            "apiWestern": api_west,
            "localMedianMs": local_med,
            "apiAlbumMedianMs": album_med,
            "slowdown": None if not local_med or not album_med else round(local_med / album_med, 2),
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, indent=2, default=str))
    print(f"\nwrote {OUT}", flush=True)
    print("\nsummary:")
    for name, row in results["photos"].items():
        print(f"  {name:18} local {row['localMedianMs']}ms  api-album {row['apiAlbumMedianMs']}ms  x{row['slowdown']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
