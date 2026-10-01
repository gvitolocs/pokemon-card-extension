#!/usr/bin/env node
/**
 * Load the unpacked repo in Playwright Chromium, navigate a Vinted singles
 * listing then an album listing, and read overlay + sidePanelState.
 *
 *   xvfb-run -a node scripts/extension-sidepanel-smoke.mjs
 *
 * Branded Google Chrome dropped --load-extension; this uses Playwright's
 * Chromium channel. POKOIN_EXTENSION_PATH defaults to this repo.
 */
import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'scripts', 'out');
const EXTENSION_PATH = process.env.POKOIN_EXTENSION_PATH || ROOT;
const SINGLES_URL = process.env.VINTED_SINGLE_URL
    || 'https://www.vinted.it/items/9601989251-pokemon-machamp-lv59';
const ALBUM_URL = process.env.VINTED_ALBUM_URL
    || 'https://www.vinted.it/items/9897000201-album-pieno-di-carte-pokemon';
const WAIT_MS = Number(process.env.POKOIN_SMOKE_WAIT_MS || 45000);

function summarizeState(state) {
    if (!state) {
        return null;
    }
    return {
        matchStage: state.debug?.matchStage || '',
        awaitingChipSearch: Boolean(state.debug?.awaitingChipSearch),
        listingScanPending: Boolean(state.debug?.listingScanPending),
        listingKind: state.pageInfo?.structuredCard?.listingKind
            || state.pageInfo?.vintedPayload?.listingKind
            || state.debug?.listingKind
            || '',
        photoCount: (state.pageInfo?.marketplacePayload?.listingImageUrls
            || state.pageInfo?.vintedPayload?.listingImageUrls
            || []).length,
        listingScanError: state.debug?.listingScanError || '',
        listingScanHits: state.debug?.listingScanHits || 0,
        usedChipSearchFallback: Boolean(state.debug?.usedChipSearchFallback),
        rowCount: Array.isArray(state.rows) ? state.rows.length : 0,
        bestName: state.best?.name || '',
        bestId: state.best?.card_id || state.blueprintId || '',
        cardNameHint: state.pageInfo?.structuredCard?.name || '',
        error: state.error || '',
        title: state.pageInfo?.title || '',
        url: state.pageInfo?.url || '',
        topRows: (state.rows || []).slice(0, 5).map((row) => ({
            id: row.card_id,
            name: row.name,
        })),
    };
}

async function overlaySnapshot(page) {
    return page.evaluate(() => {
        const hosts = [...document.querySelectorAll('[data-pokoin-vinted-panel-host], [data-pokoin-extension-panel]')];
        const shadowPanels = hosts
            .map((host) => host.shadowRoot?.querySelector('[data-pokoin-vinted-panel], [data-pokemon-linker-button]'))
            .filter(Boolean);
        const button = document.querySelector('[data-pokemon-linker-button], [data-pokoin-vinted-header-row]')
            || hosts.map((host) => host.shadowRoot?.querySelector('[data-pokemon-linker-button], [data-pokoin-vinted-header-row]')).find(Boolean);
        const panel = document.querySelector('[data-pokoin-vinted-panel]')
            || shadowPanels[0]
            || null;
        const cardName = panel?.querySelector?.('[data-pokoin-card-name], [data-pokoin-best-name]')
            || document.querySelector('[data-pokoin-card-name], [data-pokoin-best-name]');
        return {
            href: location.href,
            title: document.title,
            buttonText: button?.innerText?.slice(0, 400) || '',
            panelText: panel?.innerText?.slice(0, 1500) || '',
            cardName: cardName?.innerText || '',
            chipCount: (panel?.querySelectorAll?.('[data-pokoin-chip], [data-pokoin-keyword]') || []).length
                || document.querySelectorAll('[data-pokoin-chip], [data-pokoin-keyword]').length,
            overlayPresent: Boolean(button || panel || hosts.length),
            hostCount: hosts.length,
        };
    });
}

async function readSidePanelState(serviceWorker) {
    return serviceWorker.evaluate(async () => {
        const { sidePanelState } = await chrome.storage.session.get('sidePanelState');
        return sidePanelState || null;
    });
}

async function waitForSettledState(serviceWorker, timeoutMs) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeoutMs) {
        try {
            last = await readSidePanelState(serviceWorker);
        } catch (error) {
            last = { evaluateError: error.message || String(error) };
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
        }
        const pending = Boolean(last?.debug?.listingScanPending);
        const stage = last?.debug?.matchStage || '';
        const hasBest = Boolean(last?.best?.card_id || last?.best?.name);
        const hasRows = (last?.rows || []).length > 0;
        const scanError = Boolean(last?.debug?.listingScanError);
        if (last && !pending && (hasBest || hasRows || scanError || stage === 'scan-merge' || stage === 'resolved')) {
            return last;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return last;
}

async function openSidePanelTab(context, extensionId) {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/ui-pages/sidepanel.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    const dom = await page.evaluate(() => ({
        version: document.getElementById('extensionVersion')?.textContent || '',
        cardName: document.getElementById('cardName')?.textContent || '',
        status: document.getElementById('status')?.textContent || '',
        candidateCount: document.querySelectorAll('.candidate').length,
        bodyText: document.body?.innerText?.slice(0, 1200) || '',
    }));
    return { page, dom };
}

async function captureListing(context, serviceWorker, extensionId, page, url, label) {
    const swLogs = [];
    const consoleHandler = (message) => {
        swLogs.push(`${message.type()}: ${message.text()}`);
    };
    page.on('console', consoleHandler);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const overlayEarly = await overlaySnapshot(page).catch((error) => ({ error: error.message || String(error) }));
    const state = await waitForSettledState(serviceWorker, WAIT_MS);
    const overlay = await overlaySnapshot(page).catch((error) => ({ error: error.message || String(error) }));
    page.off('console', consoleHandler);
    let panel = null;
    try {
        const opened = await openSidePanelTab(context, extensionId);
        panel = opened.dom;
        await opened.page.close();
    } catch (error) {
        panel = { error: error.message || String(error) };
    }
    return {
        label,
        url,
        overlayEarly,
        overlay,
        sidePanelState: summarizeState(state),
        sidePanelDom: panel,
        swLogs: swLogs.slice(-40),
    };
}

async function main() {
    mkdirSync(OUT_DIR, { recursive: true });
    const userDataDir = mkdtempSync(join(tmpdir(), 'pokoin-ext-smoke-'));
    const startedAt = Date.now();
    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
        ],
    });
    const swLogs = [];
    context.on('console', (message) => {
        swLogs.push(`${message.type()}: ${message.text()}`);
    });
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    const extensionId = new URL(serviceWorker.url()).host;
    const page = await context.newPage();
    const singles = await captureListing(context, serviceWorker, extensionId, page, SINGLES_URL, 'singles');
    const album = await captureListing(context, serviceWorker, extensionId, page, ALBUM_URL, 'album');
    let manifestVersion = '';
    try {
        manifestVersion = await serviceWorker.evaluate(() => chrome.runtime.getManifest().version);
    } catch (error) {
        manifestVersion = error.message || String(error);
    }
    let debugLog = null;
    try {
        debugLog = await serviceWorker.evaluate(async () => {
            const stored = await chrome.storage.session.get('pokoinExtensionDebugLog');
            const events = stored?.pokoinExtensionDebugLog?.events || stored?.pokoinExtensionDebugLog || [];
            return Array.isArray(events)
                ? events.filter((event) => /listing-scan|search|vinted|side-panel|chip/i.test(String(event.type || ''))).slice(-50)
                : events;
        });
    } catch (error) {
        debugLog = { error: error.message || String(error) };
    }
    const report = {
        startedAt: new Date(startedAt).toISOString(),
        elapsedMs: Date.now() - startedAt,
        extensionId,
        extensionPath: EXTENSION_PATH,
        manifestVersion,
        singles,
        album,
        debugLog,
        contextLogs: swLogs.slice(-80),
    };
    const outPath = join(OUT_DIR, 'extension-sidepanel-smoke-latest.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        outPath,
        elapsedMs: report.elapsedMs,
        extensionId,
        manifestVersion,
        singles: {
            overlay: singles.overlay?.buttonText?.slice(0, 120),
            overlayPresent: singles.overlay?.overlayPresent,
            state: singles.sidePanelState,
            panelCardName: singles.sidePanelDom?.cardName,
            panelStatus: singles.sidePanelDom?.status,
        },
        album: {
            overlay: album.overlay?.buttonText?.slice(0, 120),
            overlayPresent: album.overlay?.overlayPresent,
            state: album.sidePanelState,
            panelCardName: album.sidePanelDom?.cardName,
            panelStatus: album.sidePanelDom?.status,
        },
    }, null, 2));
    await context.close();
    const singlesStuck = /matching selected chips|identifying listing photos/i.test(singles.sidePanelDom?.cardName || '');
    if (singlesStuck) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
