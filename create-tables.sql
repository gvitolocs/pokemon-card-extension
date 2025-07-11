-- Script per creare le tabelle necessarie nel database Supabase
-- Esegui questo script nel SQL Editor di Supabase

-- 1. Tabella principale per le carte Pokemon
CREATE TABLE IF NOT EXISTS pokemon_cards (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    pokemon_name VARCHAR(255),
    card_name VARCHAR(255),
    expansion_name VARCHAR(255),
    expansion VARCHAR(255),
    blueprint_id INTEGER,
    cardtrader_url TEXT,
    image_url TEXT,
    rarity VARCHAR(100),
    card_type VARCHAR(100),
    collector_number VARCHAR(50),
    is_full_art BOOLEAN DEFAULT FALSE,
    is_secret_rare BOOLEAN DEFAULT FALSE,
    is_ultra_rare BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabella per i blueprint di CardTrader
CREATE TABLE IF NOT EXISTS blueprints (
    id SERIAL PRIMARY KEY,
    blueprint_id INTEGER UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    expansion_name VARCHAR(255),
    expansion_id INTEGER,
    card_type VARCHAR(100),
    rarity VARCHAR(100),
    image_url TEXT,
    cardtrader_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabella per i dati delle carte (formato generico)
CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    pokemon_name VARCHAR(255),
    expansion VARCHAR(255),
    blueprint_id INTEGER,
    image_url TEXT,
    cardtrader_url TEXT,
    rarity VARCHAR(100),
    card_type VARCHAR(100),
    collector_number VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabella per i dati Pokemon (formato semplificato)
CREATE TABLE IF NOT EXISTS pokemon (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    pokemon_name VARCHAR(255),
    card_name VARCHAR(255),
    expansion VARCHAR(255),
    blueprint_id INTEGER,
    image_url TEXT,
    cardtrader_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabella per i dati CardTrader
CREATE TABLE IF NOT EXISTS cardtrader_data (
    id SERIAL PRIMARY KEY,
    blueprint_id INTEGER UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    expansion_name VARCHAR(255),
    expansion_id INTEGER,
    card_type VARCHAR(100),
    rarity VARCHAR(100),
    image_url TEXT,
    cardtrader_url TEXT,
    market_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indici per migliorare le performance delle ricerche
CREATE INDEX IF NOT EXISTS idx_pokemon_cards_name ON pokemon_cards(name);
CREATE INDEX IF NOT EXISTS idx_pokemon_cards_pokemon_name ON pokemon_cards(pokemon_name);
CREATE INDEX IF NOT EXISTS idx_pokemon_cards_blueprint_id ON pokemon_cards(blueprint_id);

CREATE INDEX IF NOT EXISTS idx_blueprints_name ON blueprints(name);
CREATE INDEX IF NOT EXISTS idx_blueprints_blueprint_id ON blueprints(blueprint_id);

CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_pokemon_name ON cards(pokemon_name);

CREATE INDEX IF NOT EXISTS idx_pokemon_name ON pokemon(name);
CREATE INDEX IF NOT EXISTS idx_pokemon_pokemon_name ON pokemon(pokemon_name);

CREATE INDEX IF NOT EXISTS idx_cardtrader_data_name ON cardtrader_data(name);
CREATE INDEX IF NOT EXISTS idx_cardtrader_data_blueprint_id ON cardtrader_data(blueprint_id);

-- Inserisci alcuni dati di esempio per testare
INSERT INTO pokemon_cards (name, pokemon_name, expansion_name, blueprint_id, cardtrader_url, rarity, card_type) VALUES
('Jolteon', 'Jolteon', 'Base Set', 12345, 'https://www.cardtrader.com/cards/base-set/jolteon', 'Holo Rare', 'Pokemon'),
('Pikachu', 'Pikachu', 'Base Set', 12346, 'https://www.cardtrader.com/cards/base-set/pikachu', 'Common', 'Pokemon'),
('Charizard', 'Charizard', 'Base Set', 12347, 'https://www.cardtrader.com/cards/base-set/charizard', 'Holo Rare', 'Pokemon'),
('Jolteon ex', 'Jolteon', 'Scarlet & Violet', 12348, 'https://www.cardtrader.com/cards/scarlet-violet/jolteon-ex', 'Ultra Rare', 'Pokemon'),
('Pikachu ex', 'Pikachu', 'Scarlet & Violet', 12349, 'https://www.cardtrader.com/cards/scarlet-violet/pikachu-ex', 'Ultra Rare', 'Pokemon');

INSERT INTO blueprints (blueprint_id, name, expansion_name, card_type, rarity) VALUES
(12345, 'Jolteon', 'Base Set', 'Pokemon', 'Holo Rare'),
(12346, 'Pikachu', 'Base Set', 'Pokemon', 'Common'),
(12347, 'Charizard', 'Base Set', 'Pokemon', 'Holo Rare'),
(12348, 'Jolteon ex', 'Scarlet & Violet', 'Pokemon', 'Ultra Rare'),
(12349, 'Pikachu ex', 'Scarlet & Violet', 'Pokemon', 'Ultra Rare');

INSERT INTO cards (name, pokemon_name, expansion, blueprint_id, rarity, card_type) VALUES
('Jolteon', 'Jolteon', 'Base Set', 12345, 'Holo Rare', 'Pokemon'),
('Pikachu', 'Pikachu', 'Base Set', 12346, 'Common', 'Pokemon'),
('Charizard', 'Charizard', 'Base Set', 12347, 'Holo Rare', 'Pokemon'),
('Jolteon ex', 'Jolteon', 'Scarlet & Violet', 12348, 'Ultra Rare', 'Pokemon'),
('Pikachu ex', 'Pikachu', 'Scarlet & Violet', 12349, 'Ultra Rare', 'Pokemon');

INSERT INTO pokemon (name, pokemon_name, expansion, blueprint_id) VALUES
('Jolteon', 'Jolteon', 'Base Set', 12345),
('Pikachu', 'Pikachu', 'Base Set', 12346),
('Charizard', 'Charizard', 'Base Set', 12347),
('Jolteon ex', 'Jolteon', 'Scarlet & Violet', 12348),
('Pikachu ex', 'Pikachu', 'Scarlet & Violet', 12349);

INSERT INTO cardtrader_data (blueprint_id, name, expansion_name, card_type, rarity) VALUES
(12345, 'Jolteon', 'Base Set', 'Pokemon', 'Holo Rare'),
(12346, 'Pikachu', 'Base Set', 'Pokemon', 'Common'),
(12347, 'Charizard', 'Base Set', 'Pokemon', 'Holo Rare'),
(12348, 'Jolteon ex', 'Scarlet & Violet', 'Pokemon', 'Ultra Rare'),
(12349, 'Pikachu ex', 'Scarlet & Violet', 'Pokemon', 'Ultra Rare');

-- Funzione per aggiornare il timestamp updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger per aggiornare automaticamente updated_at
CREATE TRIGGER update_pokemon_cards_updated_at BEFORE UPDATE ON pokemon_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cardtrader_data_updated_at BEFORE UPDATE ON cardtrader_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Abilita RLS (Row Level Security) per sicurezza
ALTER TABLE pokemon_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardtrader_data ENABLE ROW LEVEL SECURITY;

-- Politiche per permettere lettura pubblica (necessario per l'estensione)
CREATE POLICY "Allow public read access" ON pokemon_cards FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON blueprints FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON cards FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON pokemon FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON cardtrader_data FOR SELECT USING (true); 