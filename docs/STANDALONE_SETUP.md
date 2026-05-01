# Standalone Setup Notes (Legacy)

## Purpose

This document captures older standalone ideas and migration notes.
It is kept for context, but the active project structure is documented in:

- `README.md` (root)
- `docs/MODULAR_STRUCTURE.md`

## Current Reality

- There is no active `standalone-config.js` in this repository.
- Runtime configuration is currently spread across `config/` and runtime logic in `content.js`.
- Supabase connection and related behavior are managed by:
  - `config/supabase-config.js`
  - `config/supabase-integration.js`

## If You Need a Fully Standalone Profile

Create a dedicated config module and wire it in `manifest.json` before `content.js`.
At minimum, include:

- API base URLs and request timeouts
- Match scoring weights
- Feature flags (debug, fallback modes)
- Default keyword sets

Then keep all constants out of `content.js` and import them from one place.

## Suggested Migration Path

1. Introduce a single config source (`config/runtime-config.js`).
2. Move hardcoded values from `content.js` into this config.
3. Guard verbose logs behind a `debugEnabled` flag.
4. Add one smoke test page that validates extraction + button injection.

## Why This File Still Exists

- It explains historical decisions.
- It highlights that some referenced legacy files no longer exist.
- It prevents repeating old architecture drift.