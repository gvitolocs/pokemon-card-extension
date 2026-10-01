-- CardTrader versions tab target (docs/CARDTRADER_MODEL.md, D00000U).
-- Every public_id is one printing. Same-illustration groups live in
-- pokoin_version_sets; marketplace_search_candidates.version is that key.
-- Do not put sibling id arrays on the printing row.
--
-- pokoin_card_version_groups.gameplay_name is leftover name-wide counts from
-- the CLIP pipeline. Desk versions do not use it.
--
-- Language (western/japanese/chinese) is a property of that printing.
-- eur_scan_id / jp_scan_id / cn_scan_id are leftover JPEG sources for the
-- extension embed toggle. They are NOT replacement desk ids.

CREATE TABLE IF NOT EXISTS public.pokoin_card_version_groups (
    gameplay_name text PRIMARY KEY,
    version_count integer NOT NULL DEFAULT 1,
    leftover_printing_count integer NOT NULL DEFAULT 1,
    reprint_cluster_id text,
    alt_cluster_count integer NOT NULL DEFAULT 0,
    qwen_status text NOT NULL DEFAULT 'auto',
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pokoin_card_printings (
    public_id bigint PRIMARY KEY,
    gameplay_name text NOT NULL,
    version_count integer NOT NULL DEFAULT 1,
    nationality text NOT NULL,
    artwork_cluster_id text NOT NULL,
    artwork_kind text NOT NULL CHECK (artwork_kind IN ('reprint', 'alt')),
    leftover_image_url text,
    leftover_local_name text,
    ct_id bigint,
    collector_number text,
    set_name text,
    illustrator text,
    eur_scan_id bigint,
    jp_scan_id bigint,
    cn_scan_id bigint,
    eur_image_url text,
    jp_image_url text,
    cn_image_url text,
    cdn_local boolean NOT NULL DEFAULT false,
    qwen_status text NOT NULL DEFAULT 'auto',
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pokoin_card_printings_name_idx
    ON public.pokoin_card_printings (gameplay_name);

CREATE INDEX IF NOT EXISTS pokoin_card_printings_cluster_idx
    ON public.pokoin_card_printings (artwork_cluster_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pokoin_card_version_groups TO pokoin_marketplace;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pokoin_card_printings TO pokoin_marketplace;
