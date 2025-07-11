const express = require('express');
const { Client } = require('pg');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const connectionString = 'postgresql://postgres.msngrrrihwudtnyjatlo:Gi17!NoV1199@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
const client = new Client({ connectionString });

// Connect to database
async function connectDB() {
    try {
        await client.connect();
        console.log('✅ Connected to Supabase database');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

// Initialize database connection
connectDB();

// Routes
app.get('/', (req, res) => {
    res.json({ 
        message: 'Pokemon Card API is running!',
        endpoints: {
            '/api/tables': 'Get all tables',
            '/api/pokemon/:name': 'Search Pokemon by name',
            '/api/blueprint/:id': 'Get blueprint by ID',
            '/api/search': 'Search with query parameters'
        }
    });
});

// Get all tables
app.get('/api/tables', async (req, res) => {
    try {
        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        res.json({ tables: result.rows.map(row => row.table_name) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search Pokemon by name
app.get('/api/pokemon/:name', async (req, res) => {
    try {
        const pokemonName = req.params.name.toLowerCase();
        
        // First, let's see what tables we have
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        const tables = tablesResult.rows.map(row => row.table_name);
        console.log('Available tables:', tables);
        
        // Search in all tables for Pokemon data
        let allResults = [];
        
        for (const table of tables) {
            try {
                // Get table columns to understand structure
                const columnsResult = await client.query(`
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = $1 AND table_schema = 'public'
                `, [table]);
                
                const columns = columnsResult.rows.map(col => col.column_name);
                console.log(`Table ${table} columns:`, columns);
                
                // Look for columns that might contain Pokemon names
                const nameColumns = columns.filter(col => 
                    col.toLowerCase().includes('name') || 
                    col.toLowerCase().includes('pokemon') ||
                    col.toLowerCase().includes('card')
                );
                
                if (nameColumns.length > 0) {
                    // Search in name columns
                    for (const nameCol of nameColumns) {
                        try {
                            const searchResult = await client.query(`
                                SELECT * FROM "${table}" 
                                WHERE LOWER(${nameCol}) LIKE $1 
                                LIMIT 10
                            `, [`%${pokemonName}%`]);
                            
                            if (searchResult.rows.length > 0) {
                                allResults.push({
                                    table,
                                    column: nameCol,
                                    results: searchResult.rows
                                });
                            }
                        } catch (e) {
                            console.log(`Error searching ${table}.${nameCol}:`, e.message);
                        }
                    }
                } else {
                    // Search in all text columns
                    const textColumns = columns.filter(col => 
                        columnsResult.rows.find(c => c.column_name === col)?.data_type === 'character varying' ||
                        columnsResult.rows.find(c => c.column_name === col)?.data_type === 'text'
                    );
                    
                    for (const textCol of textColumns) {
                        try {
                            const searchResult = await client.query(`
                                SELECT * FROM "${table}" 
                                WHERE LOWER(${textCol}) LIKE $1 
                                LIMIT 5
                            `, [`%${pokemonName}%`]);
                            
                            if (searchResult.rows.length > 0) {
                                allResults.push({
                                    table,
                                    column: textCol,
                                    results: searchResult.rows
                                });
                            }
                        } catch (e) {
                            // Skip columns that can't be searched
                        }
                    }
                }
                
            } catch (e) {
                console.log(`Error exploring table ${table}:`, e.message);
            }
        }
        
        res.json({
            pokemon: pokemonName,
            results: allResults,
            totalTables: tables.length
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get blueprint by ID
app.get('/api/blueprint/:id', async (req, res) => {
    try {
        const blueprintId = req.params.id;
        
        // Search in all tables for the blueprint ID
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        for (const table of tablesResult.rows) {
            try {
                const result = await client.query(`
                    SELECT * FROM "${table.table_name}" 
                    WHERE id = $1 OR blueprint_id = $1 OR "blueprintId" = $1
                    LIMIT 1
                `, [blueprintId]);
                
                if (result.rows.length > 0) {
                    return res.json({
                        blueprintId,
                        table: table.table_name,
                        data: result.rows[0]
                    });
                }
            } catch (e) {
                // Continue searching other tables
            }
        }
        
        res.status(404).json({ error: 'Blueprint not found' });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// General search endpoint
app.get('/api/search', async (req, res) => {
    try {
        const { q, table, limit = 10 } = req.query;
        
        if (!q) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }
        
        if (table) {
            // Search in specific table
            const result = await client.query(`
                SELECT * FROM "${table}" 
                WHERE to_tsvector('english', *) @@ plainto_tsquery('english', $1)
                LIMIT $2
            `, [q, limit]);
            
            res.json({ query: q, table, results: result.rows });
        } else {
            // Search in all tables
            const tablesResult = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            `);
            
            let allResults = [];
            
            for (const tableRow of tablesResult.rows) {
                try {
                    const result = await client.query(`
                        SELECT * FROM "${tableRow.table_name}" 
                        WHERE to_tsvector('english', *) @@ plainto_tsquery('english', $1)
                        LIMIT 5
                    `, [q]);
                    
                    if (result.rows.length > 0) {
                        allResults.push({
                            table: tableRow.table_name,
                            results: result.rows
                        });
                    }
                } catch (e) {
                    // Skip tables that don't support full-text search
                }
            }
            
            res.json({ query: q, results: allResults });
        }
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${connectionString.split('@')[1]}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    await client.end();
    process.exit(0);
}); 