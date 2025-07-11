#!/usr/bin/env python3
"""
Test script to connect to Supabase database and explore Pokemon data
"""

import psycopg2
import json
from urllib.parse import urlparse

# Database connection string
CONNECTION_STRING = "postgresql://postgres.msngrrrihwudtnyjatlo:Gi17!NoV1199@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"

def test_connection():
    """Test database connection"""
    try:
        print("🔗 Testing database connection...")
        conn = psycopg2.connect(CONNECTION_STRING)
        print("✅ Connection successful!")
        return conn
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return None

def get_tables(conn):
    """Get all tables in the database"""
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        """)
        tables = [row[0] for row in cursor.fetchall()]
        cursor.close()
        return tables
    except Exception as e:
        print(f"❌ Error getting tables: {e}")
        return []

def get_table_columns(conn, table_name):
    """Get columns for a specific table"""
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = %s AND table_schema = 'public'
            ORDER BY ordinal_position
        """, (table_name,))
        columns = cursor.fetchall()
        cursor.close()
        return columns
    except Exception as e:
        print(f"❌ Error getting columns for {table_name}: {e}")
        return []

def search_pokemon(conn, pokemon_name):
    """Search for Pokemon data across all tables"""
    tables = get_tables(conn)
    print(f"📊 Found {len(tables)} tables")
    
    results = []
    
    for table in tables:
        print(f"🔍 Searching in table: {table}")
        columns = get_table_columns(conn, table)
        
        # Look for name-like columns
        name_columns = [col[0] for col in columns if 'name' in col[0].lower() or 'pokemon' in col[0].lower()]
        
        if name_columns:
            for name_col in name_columns:
                try:
                    cursor = conn.cursor()
                    cursor.execute(f"""
                        SELECT * FROM "{table}" 
                        WHERE LOWER({name_col}) LIKE %s 
                        LIMIT 5
                    """, (f'%{pokemon_name.lower()}%',))
                    
                    rows = cursor.fetchall()
                    if rows:
                        print(f"  ✅ Found {len(rows)} results in {table}.{name_col}")
                        results.append({
                            'table': table,
                            'column': name_col,
                            'results': rows
                        })
                    
                    cursor.close()
                except Exception as e:
                    print(f"  ❌ Error searching {table}.{name_col}: {e}")
        else:
            # Search in all text columns
            text_columns = [col[0] for col in columns if col[1] in ['character varying', 'text']]
            for text_col in text_columns:
                try:
                    cursor = conn.cursor()
                    cursor.execute(f"""
                        SELECT * FROM "{table}" 
                        WHERE LOWER({text_col}) LIKE %s 
                        LIMIT 3
                    """, (f'%{pokemon_name.lower()}%',))
                    
                    rows = cursor.fetchall()
                    if rows:
                        print(f"  ✅ Found {len(rows)} results in {table}.{text_col}")
                        results.append({
                            'table': table,
                            'column': text_col,
                            'results': rows
                        })
                    
                    cursor.close()
                except Exception as e:
                    # Skip columns that can't be searched
                    pass
    
    return results

def explore_table(conn, table_name):
    """Explore a specific table structure and sample data"""
    print(f"\n🔍 Exploring table: {table_name}")
    
    # Get columns
    columns = get_table_columns(conn, table_name)
    print("Columns:")
    for col_name, col_type in columns:
        print(f"  - {col_name}: {col_type}")
    
    # Get sample data
    try:
        cursor = conn.cursor()
        cursor.execute(f'SELECT * FROM "{table_name}" LIMIT 3')
        rows = cursor.fetchall()
        cursor.close()
        
        if rows:
            print(f"\nSample data ({len(rows)} rows):")
            for i, row in enumerate(rows, 1):
                print(f"  Row {i}: {row}")
        else:
            print("  No data found")
            
    except Exception as e:
        print(f"  ❌ Error getting sample data: {e}")

def main():
    """Main function"""
    print("🚀 Starting Supabase database exploration...")
    
    # Test connection
    conn = test_connection()
    if not conn:
        return
    
    try:
        # Get all tables
        tables = get_tables(conn)
        print(f"\n📋 Available tables ({len(tables)}):")
        for table in tables:
            print(f"  - {table}")
        
        # Explore first few tables
        for table in tables[:3]:
            explore_table(conn, table)
        
        # Search for Pokemon
        print(f"\n🔍 Searching for Pokemon data...")
        pokemon_results = search_pokemon(conn, "jolteon")
        
        if pokemon_results:
            print(f"\n🎯 Found Pokemon data in {len(pokemon_results)} tables:")
            for result in pokemon_results:
                print(f"\n📋 Table: {result['table']} (Column: {result['column']})")
                print(f"📄 Found {len(result['results'])} results:")
                for i, row in enumerate(result['results'], 1):
                    print(f"  {i}. {row}")
        else:
            print("❌ No Pokemon data found")
        
        # Test with different Pokemon
        test_pokemon = ["pikachu", "charizard", "mewtwo"]
        for pokemon in test_pokemon:
            print(f"\n🔍 Testing search for: {pokemon}")
            results = search_pokemon(conn, pokemon)
            if results:
                print(f"✅ Found {len(results)} tables with {pokemon} data")
            else:
                print(f"❌ No data found for {pokemon}")
    
    finally:
        conn.close()
        print("\n🔚 Database connection closed")

if __name__ == "__main__":
    main() 