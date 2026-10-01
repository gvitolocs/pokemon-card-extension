/**
 * On-device TCG YOLO + Milo 128-d search against the western leftover catalog.
 * Inference sessions live in scan/offscreen.js; this file is the CPU postprocess.
 */
(function attachOnDeviceIdentify(root) {
    const YOLO_SIZE = 640;
    const YOLO_CONF = 0.25;
    const YOLO_IOU = 0.45;
    const MIN_AREA = 0.01;
    const MILO_SIZE = 448;
    const MILO_MEAN = [0.485, 0.456, 0.406];
    const MILO_STD = [0.229, 0.224, 0.225];
    const EMBED_DIM = 128;
    const ALBUM_BOX_LIMIT = 24;
    const ALBUM_UNIQUE_MIN_SCORE = 0.50;
    const CARD_BACK_PROMOTE_SCORE = 0.58;
    const CARD_BACK_NEAR_TOP_SCORE = 0.48;
    const CARD_BACK_NEAR_TOP_GAP = 0.10;

    function compactCardName(value = '') {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    function isCardBackHit(hit = {}) {
        if (String(hit.item_kind || '') === 'card_back') {
            return true;
        }
        const id = String(hit.public_id || hit.id || '');
        if (id.startsWith('pokemon-card-back')) {
            return true;
        }
        const compact = compactCardName(hit.name);
        return compact.includes('pokemoncardback') || compact === 'cardback';
    }

    function isIgnoredOnDeviceHit(hit = {}) {
        if (isCardBackHit(hit)) {
            return true;
        }
        return compactCardName(hit.name).includes('blankfillercard');
    }

    function preferCardBackHits(hits = [], catalog = null, scores = null) {
        const cards = catalog?.cards || [];
        const list = Array.isArray(hits) ? hits : [];
        if (!list.length || !scores || !cards.length) {
            return list;
        }
        let bestIndex = -1;
        let bestScore = -1;
        for (let index = 0; index < cards.length; index += 1) {
            if (!isCardBackHit(cards[index])) {
                continue;
            }
            const score = Number(scores[index]);
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        }
        if (bestIndex < 0 || bestScore < CARD_BACK_NEAR_TOP_SCORE) {
            return list;
        }
        const topScore = Number(list[0]?.score) || 0;
        if (isCardBackHit(list[0]) && topScore + 1e-6 >= bestScore) {
            return list;
        }
        if (!(bestScore >= CARD_BACK_PROMOTE_SCORE || (bestScore >= CARD_BACK_NEAR_TOP_SCORE && (topScore - bestScore) <= CARD_BACK_NEAR_TOP_GAP))) {
            return list;
        }
        const card = cards[bestIndex] || {};
        const promoted = {
            id: String(card.id || card.public_id || 'pokemon-card-back'),
            public_id: String(card.public_id || card.id || 'pokemon-card-back'),
            ct_id: String(card.ct_id || ''),
            name: card.name || 'Pokemon Card Back',
            collector_number: card.collector_number || 'Back',
            set: card.set || 'Card Back',
            image_url: card.image_url || '',
            pokoin_url: card.pokoin_url || '',
            item_kind: 'card_back',
            identity: 'public_id',
            score: Math.round(bestScore * 10000) / 10000,
        };
        return [promoted, ...list.filter((hit) => !isCardBackHit(hit))];
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function iou(a, b) {
        const ix1 = Math.max(a.xyxy[0], b.xyxy[0]);
        const iy1 = Math.max(a.xyxy[1], b.xyxy[1]);
        const ix2 = Math.min(a.xyxy[2], b.xyxy[2]);
        const iy2 = Math.min(a.xyxy[3], b.xyxy[3]);
        const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
        if (inter <= 0) {
            return 0;
        }
        const aa = (a.xyxy[2] - a.xyxy[0]) * (a.xyxy[3] - a.xyxy[1]);
        const ba = (b.xyxy[2] - b.xyxy[0]) * (b.xyxy[3] - b.xyxy[1]);
        return inter / (aa + ba - inter);
    }

    function nmsBoxes(boxes, iouThreshold = YOLO_IOU) {
        const ranked = [...(boxes || [])].sort((left, right) => right.conf - left.conf);
        const kept = [];
        ranked.forEach((box) => {
            if (kept.every((prior) => iou(box, prior) <= iouThreshold)) {
                kept.push(box);
            }
        });
        return kept;
    }

    function boxesFromYoloOutput(output, imgW, imgH, options = {}) {
        const confMin = Number(options.conf) > 0 ? Number(options.conf) : YOLO_CONF;
        const width = Math.max(1, Number(imgW) || 1);
        const height = Math.max(1, Number(imgH) || 1);
        const data = output?.data || output;
        if (!data || typeof data.length !== 'number') {
            return [];
        }
        const stride = 6;
        const rows = Math.floor(data.length / stride);
        let maxCoord = 0;
        for (let index = 0; index < Math.min(rows, 32); index += 1) {
            maxCoord = Math.max(maxCoord, Number(data[index * stride + 2]) || 0, Number(data[index * stride + 3]) || 0);
        }
        const normalized = maxCoord <= 1.5;
        const scaleX = normalized ? width : width / YOLO_SIZE;
        const scaleY = normalized ? height : height / YOLO_SIZE;
        const minArea = MIN_AREA * width * height;
        const raw = [];
        for (let index = 0; index < rows; index += 1) {
            const offset = index * stride;
            const conf = Number(data[offset + 4]) || 0;
            if (conf < confMin) {
                continue;
            }
            const x1 = clamp((Number(data[offset]) || 0) * scaleX, 0, width);
            const y1 = clamp((Number(data[offset + 1]) || 0) * scaleY, 0, height);
            const x2 = clamp((Number(data[offset + 2]) || 0) * scaleX, 0, width);
            const y2 = clamp((Number(data[offset + 3]) || 0) * scaleY, 0, height);
            if ((x2 - x1) * (y2 - y1) < minArea) {
                continue;
            }
            raw.push({
                xyxy: [Math.round(x1 * 10) / 10, Math.round(y1 * 10) / 10, Math.round(x2 * 10) / 10, Math.round(y2 * 10) / 10],
                conf: Math.round(conf * 10000) / 10000,
            });
        }
        return nmsBoxes(raw);
    }

    function boxReadingKey(box = {}) {
        const xyxy = box.xyxy || [0, 0, 0, 0];
        return [Number(xyxy[1]) || 0, Number(xyxy[0]) || 0];
    }

    function sortBoxesReadingOrder(boxes = []) {
        return [...boxes].sort((left, right) => {
            const [ly, lx] = boxReadingKey(left);
            const [ry, rx] = boxReadingKey(right);
            return ly - ry || lx - rx;
        });
    }

    function miloOrientations(width, height) {
        const aspect = width / Math.max(height, 1);
        if (width < 8 || height < 8) {
            return [0];
        }
        if (aspect >= 0.85 && aspect <= 1.18) {
            return [0, 90, 180, 270];
        }
        if (width > height) {
            return [90, 270];
        }
        return [0, 180];
    }

    function l2normalize(vector) {
        let sum = 0;
        for (let index = 0; index < vector.length; index += 1) {
            sum += vector[index] * vector[index];
        }
        const norm = Math.sqrt(sum) || 1e-8;
        const out = new Float32Array(vector.length);
        for (let index = 0; index < vector.length; index += 1) {
            out[index] = vector[index] / norm;
        }
        return out;
    }

    function searchWesternCatalog(vector, catalog, topK = 1) {
        const count = Number(catalog?.count) || 0;
        const dim = Number(catalog?.dim) || EMBED_DIM;
        const vectors = catalog?.vectors;
        const cards = catalog?.cards || [];
        if (!vectors || !count) {
            return [];
        }
        const k = Math.max(1, Math.min(Number(topK) || 1, count));
        const scores = new Float32Array(count);
        for (let row = 0; row < count; row += 1) {
            let dot = 0;
            const base = row * dim;
            for (let axis = 0; axis < dim; axis += 1) {
                dot += vectors[base + axis] * vector[axis];
            }
            scores[row] = dot;
        }
        const picked = [];
        const used = new Set();
        for (let rank = 0; rank < k; rank += 1) {
            let bestIndex = -1;
            let bestScore = -2;
            for (let row = 0; row < count; row += 1) {
                if (used.has(row) || scores[row] <= bestScore) {
                    continue;
                }
                bestScore = scores[row];
                bestIndex = row;
            }
            if (bestIndex < 0) {
                break;
            }
            used.add(bestIndex);
            const card = cards[bestIndex] || {};
            picked.push({
                id: String(card.id || card.public_id || ''),
                public_id: String(card.public_id || card.id || ''),
                ct_id: String(card.ct_id || ''),
                name: card.name || '',
                collector_number: card.collector_number || '',
                set: card.set || '',
                image_url: card.image_url || '',
                pokoin_url: card.pokoin_url || '',
                item_kind: card.item_kind || '',
                identity: 'public_id',
                score: Math.round(bestScore * 10000) / 10000,
            });
        }
        return preferCardBackHits(picked, catalog, scores);
    }

    function uniqueTop1Hits(matches = []) {
        const seen = new Set();
        const hits = [];
        matches.forEach((match) => {
            const top = match?.top1;
            if (!top || isIgnoredOnDeviceHit(top)) {
                return;
            }
            const key = `${top.id || ''}|${top.name || ''}|${top.collector_number || ''}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            hits.push(top);
        });
        return hits;
    }

    function photoPayloadFromMatches(matches, boxes, imgW, imgH, timings = {}) {
        const ranked = sortBoxesReadingOrder(matches.map((match) => match.box).filter(Boolean));
        const uniqueHits = uniqueTop1Hits(matches).filter((hit) => Number(hit.score) > ALBUM_UNIQUE_MIN_SCORE);
        return {
            ok: true,
            identity: 'public_id',
            catalog: 'pokemon_western',
            game: 'pokemon',
            identify: 'milo-128',
            worker: 'on-device',
            img_w: imgW,
            img_h: imgH,
            detect_ms: Number(timings.detect_ms) || 0,
            identify_ms: Number(timings.identify_ms) || 0,
            embed_ms: Number(timings.embed_ms) || 0,
            search_ms: Number(timings.search_ms) || 0,
            boxes: ranked,
            boxCount: ranked.length,
            cards: matches,
            hits: uniqueHits,
            uniqueHits,
            top1: uniqueHits[0] || null,
            photoCount: 1,
            album: ranked.length >= 2,
        };
    }

    root.ON_DEVICE_SCAN = {
        YOLO_SIZE,
        MILO_SIZE,
        MILO_MEAN,
        MILO_STD,
        EMBED_DIM,
        ALBUM_BOX_LIMIT,
        boxesFromYoloOutput,
        nmsBoxes,
        sortBoxesReadingOrder,
        miloOrientations,
        l2normalize,
        searchWesternCatalog,
        uniqueTop1Hits,
        photoPayloadFromMatches,
        isCardBackHit,
        preferCardBackHits,
    };
}(typeof globalThis !== 'undefined' ? globalThis : this));
