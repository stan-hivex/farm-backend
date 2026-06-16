const { Client } = require('pg');

const host = 'dpg-d8e32el8nd3s73a8k1k0-a.frankfurt-postgres.render.com';
const user = 'farmuser';
const password = 'tljoix3e5ZFBnq2LOyrF2hTkaqr35PNk';

async function main() {
  // First, try connecting to the default 'postgres' database to list all databases
  const connectionString = `postgresql://${user}:${password}@${host}/postgres?sslmode=require`;
  
  const client = new Client({ 
    connectionString,
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('Connecting to postgres database to list all available databases...\n');
    await client.connect();
    console.log('✓ Connected\n');

    const result = await client.query(`
      SELECT datname FROM pg_database 
      WHERE datistemplate = false 
      ORDER BY datname;
    `);

    console.log('📋 Available databases:');
    result.rows.forEach(row => {
      console.log(`   - ${row.datname}`);
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
