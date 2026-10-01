#!/usr/bin/env node
/**
 * Playwright replica of the Mac unpacked-extension path.
 *
 * Chrome removed --load-extension on branded Google Chrome. This uses
 * Playwright's Chromium channel + launchPersistentContext, which is the
 * documented MV3 recipe:
 * https://playwright.dev/docs/chrome-extensions
 *
 *   npx playwright install chromium
 *   xvfb-run -a node scripts/extension-bench.mjs
 *
 * On nezopt, pokoin.com chip-search is Cloudflare 403; cardscan identify
 * still works. Run this on the Mac (or any residential IP) for Cardvault
 * timings that match the live extension. HTTP hops: scripts/pipeline-bench.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'scripts', 'out');
const EXTENSION_PATH = process.env.POKOIN_EXTENSION_PATH || ROOT;
const LISTING_URL = process.env.VINTED_ITEM_URL
    || 'https://www.vinted.it/items/9601989251-pokemon-machamp-lv59';

async function main() {
    mkdirSync(OUT_DIR, { recursive: true });
    const userDataDir = join(OUT_DIR, 'pw-profile');
    const startedAt = Date.now();
    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
        ],
    });
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    const extensionId = new URL(serviceWorker.url()).host;
    const scannerReady = await serviceWorker.evaluate(async () => {
        const exists = typeof chrome.offscreen.hasDocument === 'function'
            ? await chrome.offscreen.hasDocument()
            : false;
        if (!exists) {
            await chrome.offscreen.createDocument({
                url: 'scan/offscreen.html',
                reasons: ['BLOBS'],
                justification: 'Verify the bundled card scanner runtime.',
            });
        }
        return chrome.runtime.sendMessage({ action: 'onDeviceScanReady' });
    });
    const scannerSmoke = await serviceWorker.evaluate(async () => {
        const response = await fetch(chrome.runtime.getURL('assets/pokoin-512.png'));
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let index = 0; index < bytes.length; index += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        }
        const result = await chrome.runtime.sendMessage({
            action: 'onDeviceIdentifyAlbum',
            images: [{ base64: btoa(binary), type: 'image/png' }],
            live: false,
            topK: 1,
            boxLimit: 1,
        });
        return {
            success: Boolean(result?.success),
            numThreads: result?.payload?.numThreads,
            totalMs: result?.payload?.total_ms,
            photoCount: result?.payload?.photoCount,
        };
    });
    const page = await context.newPage();
    const cpuBefore = process.cpuUsage();
    await page.goto(LISTING_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000);
    const overlay = await page.evaluate(() => {
        const button = document.querySelector('[data-pokemon-linker-button], [data-pokoin-vinted-header-row]');
        const panel = document.querySelector('[data-pokoin-vinted-panel]');
        return {
            buttonText: button?.innerText || '',
            panelText: panel?.innerText?.slice(0, 1500) || '',
            chipCount: document.querySelectorAll('[data-pokoin-chip], [data-pokoin-keyword]').length,
        };
    });
    let debugLog = null;
    try {
        debugLog = await serviceWorker.evaluate(async () => {
            const response = await chrome.runtime.sendMessage({ action: 'getExtensionDebugLog' });
            return response;
        });
    } catch (error) {
        debugLog = { error: error.message || String(error) };
    }
    const cpu = process.cpuUsage(cpuBefore);
    const report = {
        startedAt: new Date(startedAt).toISOString(),
        elapsedMs: Date.now() - startedAt,
        extensionId,
        scannerReady,
        scannerSmoke,
        extensionPath: EXTENSION_PATH,
        listing: LISTING_URL,
        overlay,
        cpuUserMs: Math.round(cpu.user / 100) / 10,
        cpuSystemMs: Math.round(cpu.system / 100) / 10,
        debugEventCount: Array.isArray(debugLog?.events) ? debugLog.events.length : 0,
        apiEvents: Array.isArray(debugLog?.events)
            ? debugLog.events
                .filter((event) => String(event.type || '').startsWith('api.') || String(event.type || '').includes('listing-scan') || String(event.type || '').includes('search'))
                .slice(-40)
            : debugLog,
    };
    const outPath = join(OUT_DIR, 'extension-bench-latest.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        outPath,
        elapsedMs: report.elapsedMs,
        extensionId,
        scannerReady,
        scannerSmoke,
        buttonText: overlay.buttonText,
        debugEventCount: report.debugEventCount,
    }, null, 2));
    await context.close();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
