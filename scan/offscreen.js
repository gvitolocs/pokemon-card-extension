/* global ort, ON_DEVICE_SCAN, chrome */

const MODEL_BASE = chrome.runtime.getURL('scan/models/');
const ORT_BASE = chrome.runtime.getURL('scan/ort/');
const LISTING_IMAGE_MAX_BYTES = 2.5 * 1024 * 1024;
const LISTING_IMAGE_TIMEOUT_MS = 8000;

let yoloSession = null;
let miloSession = null;
let catalog = null;
let loadPromise = null;

function wasmThreadConfiguration() {
    const hardwareConcurrency = Math.max(1, Number(globalThis.navigator?.hardwareConcurrency) || 1);
    const sharedMemory = Boolean(globalThis.crossOriginIsolated && typeof globalThis.SharedArrayBuffer === 'function');
    // Four inference workers gives the best ORT/WASM trade-off for the two bundled
    // convolutional models. Leave the remaining logical cores to Chrome and the
    // synchronous 128-d catalogue search so the tab remains responsive.
    const numThreads = sharedMemory
        ? Math.max(2, Math.min(4, Math.ceil(hardwareConcurrency / 2)))
        : 1;
    return {
        numThreads,
        hardwareConcurrency,
        sharedMemory,
        crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
    };
}

function assetUrl(name) {
    return `${MODEL_BASE}${name}`;
}

async function gunzipJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`catalog HTTP ${response.status}`);
    }
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
}

async function loadCatalog() {
    const [cards, embeddingBuffer] = await Promise.all([
        gunzipJson(assetUrl('western-cards.json.gz')),
        fetch(assetUrl('western-embeddings.bin')).then(async (response) => {
            if (!response.ok) {
                throw new Error(`embeddings HTTP ${response.status}`);
            }
            return response.arrayBuffer();
        }),
    ]);
    const vectors = new Float32Array(embeddingBuffer);
    const dim = ON_DEVICE_SCAN.EMBED_DIM;
    const count = cards.length;
    if (vectors.length !== count * dim) {
        throw new Error(`western catalog size ${vectors.length} != ${count}x${dim}`);
    }
    return { cards, vectors, count, dim };
}

async function createSession(modelUrl, providers) {
    return ort.InferenceSession.create(modelUrl, {
        executionProviders: providers,
        graphOptimizationLevel: 'all',
        logSeverityLevel: 3,
    });
}

async function loadEngine() {
    if (yoloSession && miloSession && catalog) {
        return {
            provider: yoloSession._pokoinProvider || 'unknown',
            ...(yoloSession._pokoinThreadConfiguration || wasmThreadConfiguration()),
        };
    }
    if (loadPromise) {
        return loadPromise;
    }
    loadPromise = (async () => {
        const threadConfiguration = wasmThreadConfiguration();
        ort.env.wasm.wasmPaths = ORT_BASE;
        ort.env.wasm.numThreads = threadConfiguration.numThreads;
        ort.env.wasm.proxy = false;
        ort.env.logLevel = 'error';
        catalog = await loadCatalog();
        const yoloUrl = assetUrl('card_detector.onnx');
        const miloUrl = assetUrl('milo.onnx');
        yoloSession = await createSession(yoloUrl, ['wasm']);
        miloSession = await createSession(miloUrl, ['wasm']);
        const provider = 'wasm';
        yoloSession._pokoinProvider = provider;
        yoloSession._pokoinThreadConfiguration = threadConfiguration;
        return { provider, cards: catalog.count, ...threadConfiguration };
    })().catch((error) => {
        loadPromise = null;
        throw error;
    });
    return loadPromise;
}

function rgbaToNchw(imageData, { normalize = 'unit', mean = null, std = null } = {}) {
    const { width, height, data } = imageData;
    const plane = width * height;
    const tensor = new Float32Array(3 * plane);
    for (let index = 0; index < plane; index += 1) {
        const r = data[index * 4] / 255;
        const g = data[index * 4 + 1] / 255;
        const b = data[index * 4 + 2] / 255;
        if (normalize === 'imagenet') {
            tensor[index] = (r - mean[0]) / std[0];
            tensor[plane + index] = (g - mean[1]) / std[1];
            tensor[(2 * plane) + index] = (b - mean[2]) / std[2];
        } else {
            tensor[index] = r;
            tensor[plane + index] = g;
            tensor[(2 * plane) + index] = b;
        }
    }
    return tensor;
}

function drawCover(source, width, height) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(source, 0, 0, width, height);
    return { canvas, ctx, imageData: ctx.getImageData(0, 0, width, height) };
}

async function bitmapFromBlob(blob) {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(blob);
    }
    throw new Error('createImageBitmap is unavailable');
}

function downscaleBitmap(bitmap) {
    const maxSide = Math.max(bitmap.width, bitmap.height);
    const scale = maxSide > 1600 ? 1600 / maxSide : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { canvas, width, height };
}

function cropBox(sourceCanvas, box) {
    const [x1, y1, x2, y2] = box.xyxy;
    const width = Math.max(8, Math.round(x2 - x1));
    const height = Math.max(8, Math.round(y2 - y1));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sourceCanvas, Math.round(x1), Math.round(y1), width, height, 0, 0, width, height);
    return canvas;
}

function rotateCanvas(source, degrees) {
    if (!degrees) {
        return source;
    }
    const radians = (degrees * Math.PI) / 180;
    const swap = degrees === 90 || degrees === 270;
    const width = swap ? source.height : source.width;
    const height = swap ? source.width : source.height;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.translate(width / 2, height / 2);
    ctx.rotate(radians);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    return canvas;
}

async function runYolo(frameCanvas) {
    const sized = drawCover(frameCanvas, ON_DEVICE_SCAN.YOLO_SIZE, ON_DEVICE_SCAN.YOLO_SIZE);
    const tensor = rgbaToNchw(sized.imageData, { normalize: 'unit' });
    const feeds = {
        images: new ort.Tensor('float32', tensor, [1, 3, ON_DEVICE_SCAN.YOLO_SIZE, ON_DEVICE_SCAN.YOLO_SIZE]),
    };
    const out = await yoloSession.run(feeds);
    const output = out.output0 || Object.values(out)[0];
    return ON_DEVICE_SCAN.boxesFromYoloOutput(output, frameCanvas.width, frameCanvas.height);
}

async function embedCanvas(cropCanvas) {
    const sized = drawCover(cropCanvas, ON_DEVICE_SCAN.MILO_SIZE, ON_DEVICE_SCAN.MILO_SIZE);
    const tensor = rgbaToNchw(sized.imageData, {
        normalize: 'imagenet',
        mean: ON_DEVICE_SCAN.MILO_MEAN,
        std: ON_DEVICE_SCAN.MILO_STD,
    });
    const feeds = {
        image: new ort.Tensor('float32', tensor, [1, 3, ON_DEVICE_SCAN.MILO_SIZE, ON_DEVICE_SCAN.MILO_SIZE]),
    };
    const out = await miloSession.run(feeds);
    const output = out.embedding || Object.values(out)[0];
    return ON_DEVICE_SCAN.l2normalize(output.data || output);
}

async function detectPhotoBlob(blob, options = {}) {
    const boxLimit = Math.max(1, Math.min(36, Number(options.boxLimit) || ON_DEVICE_SCAN.ALBUM_BOX_LIMIT));
    const bitmap = await bitmapFromBlob(blob);
    const frame = downscaleBitmap(bitmap);
    bitmap.close?.();
    const detectStarted = performance.now();
    let boxes = await runYolo(frame.canvas);
    if (!boxes.length) {
        boxes = [{
            xyxy: [0, 0, frame.width, frame.height],
            conf: 1,
            detector: 'full-frame',
        }];
    }
    boxes = ON_DEVICE_SCAN.sortBoxesReadingOrder(boxes).slice(0, boxLimit);
    return { frame, boxes, detectMs: performance.now() - detectStarted };
}

async function embedPhotoBoxes(frame, boxes, detectMs = 0, options = {}) {
    const live = options.live !== false;
    const topK = Math.max(1, Math.min(8, Number(options.topK) || 1));
    const matches = [];
    let embedMs = 0;
    let searchMs = 0;
    for (const box of boxes) {
        const crop = cropBox(frame.canvas, box);
        const angles = ON_DEVICE_SCAN.miloOrientations(crop.width, crop.height);
        let bestHits = [];
        let bestScore = -1;
        let bestOrientation = angles[0] || 0;
        let orientationsTried = 0;
        for (const angle of angles) {
            orientationsTried += 1;
            const oriented = rotateCanvas(crop, angle);
            const embedStarted = performance.now();
            const vector = await embedCanvas(oriented);
            embedMs += performance.now() - embedStarted;
            const searchStarted = performance.now();
            const hits = ON_DEVICE_SCAN.searchWesternCatalog(vector, catalog, topK);
            searchMs += performance.now() - searchStarted;
            const score = Number(hits[0]?.score) || -1;
            if (score > bestScore) {
                bestScore = score;
                bestHits = hits;
                bestOrientation = angle;
            }
            if (bestScore >= 0.82) {
                break;
            }
        }
        matches.push({
            box,
            hits: bestHits,
            top1: bestHits[0] || null,
            orientation: bestOrientation,
            orientationsTried,
        });
    }
    return ON_DEVICE_SCAN.photoPayloadFromMatches(matches, boxes, frame.width, frame.height, {
        detect_ms: Math.round(detectMs * 10) / 10,
        identify_ms: Math.round((embedMs + searchMs) * 10) / 10,
        embed_ms: Math.round(embedMs * 10) / 10,
        search_ms: Math.round(searchMs * 10) / 10,
    });
}

async function identifyAlbum(blobs, options = {}, onPhoto = null) {
    const started = await loadEngine();
    const albumStarted = performance.now();
    const photos = new Array(blobs.length);
    // Two-stage pipeline: while Milo embeds photo N's boxes, YOLO is already
    // detecting photo N+1. Embeds stay serialized per session, but the two
    // models no longer wait on each other between photos. At most two decoded
    // frames are alive at once (the one embedding plus the primed detection).
    let primedDetect = blobs.length ? detectPhotoBlob(blobs[0], options) : null;
    for (let index = 0; index < blobs.length; index += 1) {
        const stage = await primedDetect;
        primedDetect = index + 1 < blobs.length
            ? detectPhotoBlob(blobs[index + 1], options)
            : null;
        const photo = await embedPhotoBoxes(stage.frame, stage.boxes, stage.detectMs, options);
        photos[index] = photo;
        if (onPhoto) {
            try {
                onPhoto(photo, index, blobs.length);
            } catch (_) {}
        }
    }
    return {
        ok: true,
        identity: 'public_id',
        catalog: 'pokemon_western',
        worker: started.provider || 'on-device',
        numThreads: Number(started.numThreads) || 1,
        hardwareConcurrency: Number(started.hardwareConcurrency) || 1,
        sharedMemory: Boolean(started.sharedMemory),
        crossOriginIsolated: Boolean(started.crossOriginIsolated),
        total_ms: Math.round((performance.now() - albumStarted) * 10) / 10,
        onDevice: true,
        photoCount: photos.length,
        photos,
    };
}

function bytesFromBase64(value = '') {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function blobFromSerializedImage(image) {
    image = image || {};
    const base64 = String(image?.base64 || '');
    if (!base64) {
        throw new Error('Missing serialized image data');
    }
    return new Blob([bytesFromBase64(base64)], { type: image.type || 'image/jpeg' });
}

async function blobFromImageUrl(imageUrl = '') {
    // Listing identify should not rely on this path: COEP require-corp blocks
    // CDN photos without CORP. The service worker fetches and sends {base64,type}.
    const url = String(imageUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) {
        throw new Error('Unsupported listing image URL');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LISTING_IMAGE_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            credentials: 'omit',
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`listing image HTTP ${response.status}`);
        }
        const blob = await response.blob();
        if (!blob.size || blob.size > LISTING_IMAGE_MAX_BYTES) {
            throw new Error(blob.size ? 'listing image too large' : 'listing image empty');
        }
        return blob;
    } finally {
        clearTimeout(timeout);
    }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!request || (request.action !== 'onDeviceIdentifyAlbum' && request.action !== 'onDeviceScanReady')) {
        return undefined;
    }
    if (request.action === 'onDeviceScanReady') {
        loadEngine()
            .then((info) => sendResponse({ success: true, ...info }))
            .catch((error) => sendResponse({ success: false, error: error.message || String(error) }));
        return true;
    }
    const images = Array.isArray(request.images) ? request.images : [];
    const imageUrls = Array.isArray(request.imageUrls) ? request.imageUrls : [];
    const scanId = String(request.scanId || '');
    Promise.all([
        ...images.map(async (image) => blobFromSerializedImage(image)),
        ...imageUrls.map(async (imageUrl) => {
            try {
                return await blobFromImageUrl(imageUrl);
            } catch (_) {
                return null;
            }
        }),
    ])
        .then((blobs) => blobs.filter(Boolean))
        .then((blobs) => {
            if (!blobs.length) {
                throw new Error('No readable listing images');
            }
            return identifyAlbum(blobs, {
                live: request.live !== false,
                topK: request.topK,
                boxLimit: request.boxLimit,
            }, scanId ? (photo, index, photoCount) => {
                // Progressive photo stream: the service worker merges partial
                // rows into the side panel while later photos still infer.
                void chrome.runtime.sendMessage({
                    action: 'onDeviceIdentifyAlbumPhoto',
                    scanId,
                    index,
                    photoCount,
                    photo,
                }).catch(() => {});
            } : null);
        })
        .then((payload) => sendResponse({ success: true, payload }))
        .catch((error) => sendResponse({ success: false, error: error.message || String(error) }));
    return true;
});
