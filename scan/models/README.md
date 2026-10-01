Pack YOLO, Milo, and the western leftover catalog for the Chrome extension.

From BattleScan:
  card_detector.onnx  (TCG YOLO, NMS output 1x300x6)
  runtime/fast-models/milo.onnx
  catalogs/pokemon_western/embeddings.npy + metadata.jsonl

Also copies onnxruntime-web WebGPU/WASM into scan/ort/.

Run from the extension repo:

  BattleScan/.venv/bin/python scripts/bundle-ondevice-scan.py
