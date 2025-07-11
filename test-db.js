const { Client } = require('pg');

const connectionString = 'postgresql://postgres.msngrrrihwudtnyjatlo:Gi17!NoV1199@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

async function testConnection() {
  const client = new Client({ connectionString });
  
  try {
    console.log('Connecting to Supabase...');
    await client.connect();
    console.log('✅ Connection successful!');
    
    // Get table count
    const tableCount = await client.query('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = \'public\'');
    console.log('📊 Tables count:', tableCount.rows[0].count);
    
    // List all tables
    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    console.log('📋 Tables:');
    tables.rows.forEach(row => console.log('  -', row.table_name));
    
    // If there are tables, explore the first one
    if (tables.rows.length > 0) {
      const firstTable = tables.rows[0].table_name;
      console.log(`\n🔍 Exploring table: ${firstTable}`);
      
      const columns = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${firstTable}' ORDER BY ordinal_position`);
      console.log('Columns:');
      columns.rows.forEach(col => console.log(`  - ${col.column_name}: ${col.data_type}`));
      
      const sampleData = await client.query(`SELECT * FROM "${firstTable}" LIMIT 3`);
      console.log(`\nSample data (${sampleData.rows.length} rows):`);
      sampleData.rows.forEach((row, i) => {
        console.log(`  Row ${i + 1}:`, row);
      });
    }
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await client.end();
  }
}

testConnection(); 