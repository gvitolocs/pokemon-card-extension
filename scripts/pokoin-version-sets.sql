-- CardTrader versions tab (docs/CARDTRADER_MODEL.md).
-- One row per same-card set (same illustration across JP/EN/CN/reprints/stamps).
-- marketplace_search_candidates.version stores that key. Members are the
-- candidate rows sharing it — never an array of sibling ids on each row.

CREATE TABLE IF NOT EXISTS public.pokoin_version_sets (
    version text PRIMARY KEY,
    gameplay_name text NOT NULL DEFAULT '',
    member_count integer NOT NULL DEFAULT 1,
    source text NOT NULL DEFAULT 'singleton',
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_search_candidates
    ADD COLUMN IF NOT EXISTS version text;

CREATE INDEX IF NOT EXISTS marketplace_search_candidates_version_idx
    ON public.marketplace_search_candidates (version);

CREATE OR REPLACE FUNCTION public.pokoin_version_assign()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version IS NULL OR NEW.version = '' THEN
    NEW.version := 'v' || NEW.card_id::text;
  END IF;
  INSERT INTO public.pokoin_version_sets (version, gameplay_name, member_count, source)
  VALUES (NEW.version, COALESCE(NEW.name, ''), 1, 'singleton')
  ON CONFLICT (version) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pokoin_version_assign_trg ON public.marketplace_search_candidates;
CREATE TRIGGER pokoin_version_assign_trg
BEFORE INSERT ON public.marketplace_search_candidates
FOR EACH ROW
EXECUTE FUNCTION public.pokoin_version_assign();

CREATE OR REPLACE FUNCTION public.pokoin_version_sets_recount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.version IS NOT DISTINCT FROM NEW.version THEN
    RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.version IS NOT NULL THEN
    UPDATE public.pokoin_version_sets
       SET member_count = (
             SELECT COUNT(*)::integer
               FROM public.marketplace_search_candidates
              WHERE version = OLD.version
           ),
           updated_at = now()
     WHERE version = OLD.version;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.version IS NOT NULL THEN
    UPDATE public.pokoin_version_sets
       SET member_count = (
             SELECT COUNT(*)::integer
               FROM public.marketplace_search_candidates
              WHERE version = NEW.version
           ),
           updated_at = now()
     WHERE version = NEW.version;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS pokoin_version_sets_recount_trg ON public.marketplace_search_candidates;
CREATE TRIGGER pokoin_version_sets_recount_trg
AFTER INSERT OR UPDATE OF version OR DELETE ON public.marketplace_search_candidates
FOR EACH ROW
EXECUTE FUNCTION public.pokoin_version_sets_recount();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pokoin_version_sets TO pokoin_marketplace;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_search_candidates TO pokoin_marketplace;
