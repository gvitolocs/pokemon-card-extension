/**
 * Extension match contract (AU Software Correctness lecture 14).
 *
 * A match session is correct when it starts in a state that meets Requires,
 * terminates, and ends in a state that meets Ensures. Modifies is the frame.
 *
 * Spec (what): rows for this listing + selected chips.
 * Implementations (how): overlay chips, listing identify, Cardvault chip-search fallback.
 * Identify lookalikes are the candidate pool. Selected chips rank that pool.
 * Chip-search is fallback when scan is empty or disabled. Overlay does not wait
 * on identify (tokens can show first). Listing identify starts when the reduced
 * overlay icon is clicked, not on Vinted/eBay visit. That click also opens the
 * side panel if it is not already showing. The expanded Pokoin.com button
 * refreshes the scan; X collapses.
 *
 * Stages
 * - ready: supported listing is open, but the user has not requested analysis.
 * - awaiting-tokens: no overlay chips yet. loading may be true.
 * - tokens: chips are known. That is not a Cardvault match. loading must be false.
 * - chip-search / resolved: Cardvault fallback finished, or listings without photos.
 *   loading must be false.
 * - scan-merge: identify lookalikes ranked by chips. loading must be false.
 *   selected name ranks matching scan rows first; it does not veto the pool.
 */
const MATCH_STAGE = {
    IDLE: 'idle',
    READY: 'ready',
    AWAITING_TOKENS: 'awaiting-tokens',
    TOKENS: 'tokens',
    CHIP_SEARCH: 'chip-search',
    RESOLVED: 'resolved',
    SCAN_MERGE: 'scan-merge',
};

function compactMatchValue(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function matchNamesCompatible(left = '', right = '') {
    const a = compactMatchValue(left);
    const b = compactMatchValue(right);
    if (!a || !b) {
        return false;
    }
    return a === b || a.includes(b) || b.includes(a);
}

function inferMatchStage(state = {}) {
    const debug = state.debug || {};
    if (state.pageInfo?.vintedIdle || debug.vintedIdle || debug.matchStage === MATCH_STAGE.IDLE) {
        return MATCH_STAGE.IDLE;
    }
    if (debug.matchStage) {
        return debug.matchStage;
    }
    if (debug.awaitingChipSearch) {
        return MATCH_STAGE.TOKENS;
    }
    if (debug.chipSearchCompleted && debug.listingScanPending === false) {
        return MATCH_STAGE.SCAN_MERGE;
    }
    if (debug.chipSearchCompleted || (Array.isArray(state.rows) && state.rows.length > 0 && !state.loading)) {
        return MATCH_STAGE.RESOLVED;
    }
    if (debug.waitingForVintedPreview && state.loading) {
        return MATCH_STAGE.AWAITING_TOKENS;
    }
    if (state.loading) {
        return MATCH_STAGE.CHIP_SEARCH;
    }
    return MATCH_STAGE.AWAITING_TOKENS;
}

function matchStageAllowsLoading(stage = '') {
    return stage === MATCH_STAGE.AWAITING_TOKENS || stage === MATCH_STAGE.CHIP_SEARCH;
}

function applyMatchContractToSidePanelState(state = {}) {
    const next = {
        ...state,
        debug: { ...(state.debug || {}) },
    };
    const stage = inferMatchStage(next);
    next.debug.matchStage = stage;
    if (stage === MATCH_STAGE.IDLE) {
        next.debug.vintedIdle = true;
        next.debug.awaitingChipSearch = false;
        next.debug.waitingForVintedPreview = false;
        if (next.pageInfo && typeof next.pageInfo === 'object') {
            next.pageInfo = { ...next.pageInfo, vintedIdle: true };
        }
        delete next.loading;
    }
    if (!matchStageAllowsLoading(stage) && Object.prototype.hasOwnProperty.call(next, 'loading')) {
        delete next.loading;
    }
    if (next.debug.awaitingChipSearch || next.debug.chipSearchCompleted) {
        delete next.loading;
        if (next.debug.awaitingChipSearch) {
            next.debug.waitingForVintedPreview = false;
        }
    }
    return next;
}

function scanMergePreservesSelectedName(structuredCard = {}, mergedRows = []) {
    const requested = structuredCard?.name || '';
    if (!compactMatchValue(requested) || !Array.isArray(mergedRows) || mergedRows.length === 0) {
        return true;
    }
    if ((structuredCard?.listingKind || '') === 'album') {
        return true;
    }
    return matchNamesCompatible(requested, mergedRows[0]?.name || '');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MATCH_STAGE,
        compactMatchValue,
        matchNamesCompatible,
        inferMatchStage,
        matchStageAllowsLoading,
        applyMatchContractToSidePanelState,
        scanMergePreservesSelectedName,
    };
}
