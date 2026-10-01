#!/usr/bin/env bash
# Match leftover reprints into pokoin_version_sets.
# Tests first, then every name (CLIP cache unless --reencode), then Pi apply
# unless --dry-run, then SQL fixtures. Encode on nezopt; never crop on the Pi.
set -euo pipefail
cd /home/nez/Projects/pokemon-card-extension
export HIP_VISIBLE_DEVICES="${HIP_VISIBLE_DEVICES:-0}"
PYTHON="${PYTHON:-/home/nez/Projects/ai-toolkit/venv/bin/python}"
exec "$PYTHON" scripts/cluster-name-version-sets.py --pipeline "$@"
