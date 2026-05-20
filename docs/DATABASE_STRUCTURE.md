# Legacy Database Structure

## Overview

This file is historical context for the old direct database integration. The active extension no longer connects to a database from content scripts; card matching now goes through Pokoin/Cardvault APIs.

## Core Tables

### `cards`

```sql
create table public.cards (
  name_en text null,
  expansion_id integer null,
  expansion_code text null,
  expansion_name_en text null,
  blueprint_id integer null,
  constraint cards_blueprint_id_unique unique (blueprint_id)
);
```

Main fields:

- `name_en`: card name
- `expansion_name_en`: expansion name
- `expansion_code`: short expansion code
- `blueprint_id`: stable card identifier

### `card_variants`

```sql
create table public.card_variants (
  blueprint_id integer not null,
  collector_number text null,
  language text null,
  id serial not null,
  image_url text null,
  constraint card_variants_pkey primary key (id),
  constraint uniq_variant unique (blueprint_id, language, collector_number),
  constraint fk_cards_blueprint
    foreign key (blueprint_id)
    references cards (blueprint_id)
    on delete cascade
);
```

Main fields:

- `blueprint_id`: reference to `cards.blueprint_id`
- `collector_number`: variant number
- `language`: language code
- `image_url`: variant artwork URL

## Relationship

```text
cards (1) -> (N) card_variants
```

## Example Queries

### Search by card name

```sql
select *
from cards
where name_en ilike '%mew%'
  and name_en not ilike '%deck%'
  and name_en not ilike '%booster%';
```

### Find by collector number

```sql
select cv.*, c.name_en, c.expansion_name_en
from card_variants cv
join cards c on cv.blueprint_id = c.blueprint_id
where cv.collector_number = '101';
```

### Search by expansion + name

```sql
select *
from cards
where expansion_name_en ilike '%v star universe%'
  and name_en ilike '%mew%';
```

## Recommended Indexes

```sql
create index if not exists idx_cards_name_en_tsv
  on cards using gin(to_tsvector('english', coalesce(name_en, '')));

create index if not exists idx_cards_expansion_name_tsv
  on cards using gin(to_tsvector('english', coalesce(expansion_name_en, '')));

create index if not exists idx_card_variants_collector_number
  on card_variants(collector_number);

create index if not exists idx_card_variants_blueprint_id
  on card_variants(blueprint_id);
```

## Security and Config Notes

- Do not hardcode private credentials in source code or docs.
- Keep marketplace matching behind server-side APIs instead of browser database clients.