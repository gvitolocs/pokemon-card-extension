#!/usr/bin/env python3
"""Copy YOLO, Milo, and western leftover embeddings into scan/ for the extension."""
from __future__ import annotations

import gzip
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATTLESCAN = Path("/home/nez/Projects/BattleScan")
MODELS = ROOT / "scan" / "models"
ORT = ROOT / "scan" / "ort"
ORT_DIST = ROOT / "node_modules" / "onnxruntime-web" / "dist"
CARD_BACK_CATALOGS = (
    BATTLESCAN / "catalogs" / "pokemon_generic",
    BATTLESCAN / "runtime" / "catalogs-20260903-jp-reference" / "pokemon_generic",
)


def western_card_row(row: dict) -> dict:
    payload = {
        "id": str(row.get("id") or row.get("public_id") or ""),
        "public_id": str(row.get("public_id") or row.get("id") or ""),
        "ct_id": str(row.get("ct_id") or ""),
        "name": row.get("name") or "",
        "collector_number": row.get("collector_number") or "",
        "set": row.get("set") or "",
        "image_url": row.get("image_url") or "",
        "pokoin_url": row.get("pokoin_url") or "",
    }
    kind = str(row.get("item_kind") or "").strip()
    if kind:
        payload["item_kind"] = kind
    return payload


def is_card_back_row(row: dict) -> bool:
    public_id = str(row.get("public_id") or row.get("id") or "")
    name = "".join(ch for ch in str(row.get("name") or "").lower() if ch.isalnum())
    return (
        str(row.get("item_kind") or "") == "card_back"
        or public_id.startswith("pokemon-card-back")
        or "pokemoncardback" in name
        or name == "cardback"
    )


def load_card_back_catalog():
    import numpy as np

    for dest in CARD_BACK_CATALOGS:
        meta_path = dest / "metadata.jsonl"
        emb_path = dest / "embeddings.npy"
        if not meta_path.is_file() or not emb_path.is_file():
            continue
        rows = [json.loads(line) for line in meta_path.read_text().splitlines() if line.strip()]
        vectors = np.load(emb_path)
        indexes = [index for index, row in enumerate(rows) if is_card_back_row(row)]
        if not indexes:
            continue
        if vectors.shape[0] != len(rows):
            raise SystemExit(f"card-back catalog count {len(rows)} vs embeddings {vectors.shape[0]} in {dest}")
        return (
            [western_card_row({**rows[index], "item_kind": "card_back"}) for index in indexes],
            np.asarray(vectors[indexes], dtype=np.float32),
        )
    raise SystemExit("missing Pokemon Card Back catalog rows; expected pokemon_generic supplements")


def main() -> int:
    venv_python = BATTLESCAN / ".venv" / "bin" / "python"
    if str(Path(sys.executable).resolve()) != str(venv_python.resolve()):
        print("Tip: use BattleScan/.venv/bin/python so numpy/onnx are available.", file=sys.stderr)
    import numpy as np
    import onnx

    MODELS.mkdir(parents=True, exist_ok=True)
    ORT.mkdir(parents=True, exist_ok=True)

    yolo_src = BATTLESCAN / "models" / "card_detector.onnx"
    model = onnx.load(str(yolo_src), load_external_data=True)
    onnx.save_model(model, str(MODELS / "card_detector.onnx"), save_as_external_data=False)
    shutil.copy2(BATTLESCAN / "runtime" / "fast-models" / "milo.onnx", MODELS / "milo.onnx")

    vecs = np.load(BATTLESCAN / "catalogs" / "pokemon_western" / "embeddings.npy")
    if vecs.dtype != np.float32 or vecs.ndim != 2 or vecs.shape[1] != 128:
        raise SystemExit(f"unexpected western embeddings {vecs.shape} {vecs.dtype}")

    cards = []
    with (BATTLESCAN / "catalogs" / "pokemon_western" / "metadata.jsonl").open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            cards.append(western_card_row(row))
    if len(cards) != vecs.shape[0]:
        raise SystemExit(f"catalog count {len(cards)} vs embeddings {vecs.shape[0]}")

    back_rows, back_vecs = load_card_back_catalog()
    if back_rows and back_vecs is not None:
        cards.extend(back_rows)
        vecs = np.concatenate([vecs, back_vecs], axis=0)

    (MODELS / "western-embeddings.bin").write_bytes(np.ascontiguousarray(vecs).tobytes())
    payload = json.dumps(cards, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    with gzip.open(MODELS / "western-cards.json.gz", "wb", compresslevel=9) as handle:
        handle.write(payload)

    runtime_files = (
        "ort.wasm.min.js",
        "ort-wasm-simd-threaded.mjs",
        "ort-wasm-simd-threaded.wasm",
    )
    for name in runtime_files:
        src = ORT_DIST / name
        if not src.is_file():
            raise SystemExit(f"missing {src}; run npm install")
        shutil.copy2(src, ORT / name)
    for stale_name in (
        "ort.webgpu.min.js",
        "ort-wasm-simd-threaded.jsep.mjs",
        "ort-wasm-simd-threaded.jsep.wasm",
    ):
        (ORT / stale_name).unlink(missing_ok=True)

    print(json.dumps({
        "yolo_mb": round((MODELS / "card_detector.onnx").stat().st_size / 1e6, 2),
        "milo_mb": round((MODELS / "milo.onnx").stat().st_size / 1e6, 2),
        "embeddings_mb": round((MODELS / "western-embeddings.bin").stat().st_size / 1e6, 2),
        "cards": len(cards),
        "card_backs": sum(1 for row in cards if row.get("item_kind") == "card_back"),
        "cards_gz_kb": round((MODELS / "western-cards.json.gz").stat().st_size / 1e3, 1),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
