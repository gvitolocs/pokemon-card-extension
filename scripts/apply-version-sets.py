#!/usr/bin/env python3
"""Create pokoin_version_sets on Raspberry and point candidates.version at it.

Every candidate starts as its own set (key v{card_id}). Espurr artwork groups
from the review JSON are then merged onto one key per illustration. Sibling
lists are never stored on the row — lookup is WHERE version = key.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path("/home/nez/Projects/pokemon-card-extension")
SCHEMA = REPO / "scripts/pokoin-version-sets.sql"
ESPURR = Path("/home/nez/Projects/pokoin-web/market/public/review/espurr.json")


def psql(sql: str, timeout: int = 120) -> str:
    completed = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "pi-home",
            "docker exec -i pokoin-marketplace-postgres-replica "
            "psql -U pokoin_marketplace -d pokoin_marketplace -v ON_ERROR_STOP=1",
        ],
        input=sql if sql.rstrip().endswith(";") else sql.rstrip() + ";",
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit(completed.stderr or completed.stdout or f"psql exit {completed.returncode}")
    return completed.stdout


def espurr_merges() -> list[tuple[str, list[int]]]:
    groups = json.loads(ESPURR.read_text())["groups"]
    merges = []
    for group in groups:
        ids = sorted({int(card["id"]) for card in group["printings"]})
        if not ids:
            continue
        merges.append((f"v{ids[0]}", ids))
    return merges


def main() -> None:
    print(psql(SCHEMA.read_text(), timeout=60))

    print(
        psql(
            """
SET statement_timeout = 0;
INSERT INTO public.pokoin_version_sets (version, gameplay_name, member_count, source)
SELECT 'v' || card_id::text, name, 1, 'singleton'
  FROM public.marketplace_search_candidates
 WHERE NOT EXISTS (
        SELECT 1 FROM public.pokoin_version_sets s
         WHERE s.version = 'v' || marketplace_search_candidates.card_id::text
      );
UPDATE public.marketplace_search_candidates
   SET version = 'v' || card_id::text
 WHERE version IS NULL;
""",
            timeout=180,
        )
    )

    statements = ["SET statement_timeout = 0;"]
    for key, ids in espurr_merges():
        id_list = ", ".join(str(i) for i in ids)
        others = ", ".join(f"'v{i}'" for i in ids if f"v{i}" != key)
        statements.append(
            f"""
INSERT INTO public.pokoin_version_sets (version, gameplay_name, member_count, source)
VALUES ('{key}', 'Espurr', {len(ids)}, 'artbox')
ON CONFLICT (version) DO UPDATE
  SET gameplay_name = EXCLUDED.gameplay_name,
      member_count = EXCLUDED.member_count,
      source = EXCLUDED.source,
      updated_at = now();
UPDATE public.marketplace_search_candidates
   SET version = '{key}'
 WHERE card_id IN ({id_list});
"""
        )
        if others:
            statements.append(
                f"""
DELETE FROM public.pokoin_version_sets
 WHERE version IN ({others})
   AND version <> '{key}';
"""
            )
    statements.append(
        """
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_search_candidates_version_fkey'
  ) THEN
    ALTER TABLE public.marketplace_search_candidates
      ADD CONSTRAINT marketplace_search_candidates_version_fkey
      FOREIGN KEY (version) REFERENCES public.pokoin_version_sets(version);
  END IF;
END $$;
"""
    )
    print(psql("\n".join(statements), timeout=120))

    print(
        psql(
            """
SELECT 'sets' AS src, COUNT(*) FROM pokoin_version_sets
UNION ALL
SELECT 'candidates_with_version', COUNT(*) FROM marketplace_search_candidates WHERE version IS NOT NULL
UNION ALL
SELECT 'espurr_keys', COUNT(DISTINCT version) FROM marketplace_search_candidates WHERE name = 'Espurr';
SELECT version, COUNT(*) AS n, array_agg(card_id ORDER BY card_id) AS ids
  FROM marketplace_search_candidates
 WHERE name = 'Espurr'
 GROUP BY version
 ORDER BY n DESC, version;
"""
        )
    )


if __name__ == "__main__":
    main()
