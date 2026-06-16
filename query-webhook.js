const { Client } = require('pg');

const connectionString = 'postgresql://farmuser:tljoix3e5ZFBnq2LOyrF2hTkaqr35PNk@dpg-d8e32el8nd3s73a8k1k0-a.frankfurt-postgres.render.com/farmbackend?sslmode=require';
const depositRef = 'd405cb4b-131f-476d-b7de-1f007b8f198f';

let retries = 3;
let client;

async function createClient() {
  return new Client({ 
    connectionString,
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
    ssl: { rejectUnauthorized: false },
  });
}

async function main() {
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`\n[Attempt ${attempt}/${retries}] Connecting to database...`);
      console.log('Host: dpg-d8e32el8nd3s73a8k1k0-a.frankfurt-postgres.render.com');
      console.log('Database: farmbackend\n');
      
      client = await createClient();
      await client.connect();
      console.log('✓ Connected to database\n');

    // Test connectivity
    const connTest = await client.query('SELECT 1 as connected');
    console.log('Connectivity test:', connTest.rows[0], '\n');

    // Query webhook_logs
    console.log(`\n=== WEBHOOK_LOGS for reference ${depositRef} ===`);
    const webhookResult = await client.query(
      `SELECT id, provider, event_name, payload::text, response, status, created_at 
       FROM webhook_logs 
       WHERE payload::text LIKE $1 
       ORDER BY created_at DESC;`,
      [`%${depositRef}%`]
    );
    
    if (webhookResult.rows.length === 0) {
      console.log('❌ No webhook_logs found for this reference');
    } else {
      console.log(`✓ Found ${webhookResult.rows.length} record(s):\n`);
      webhookResult.rows.forEach((row, idx) => {
        console.log(`Record ${idx + 1}:`);
        console.log(`  ID: ${row.id}`);
        console.log(`  Provider: ${row.provider}`);
        console.log(`  Event: ${row.event_name}`);
        console.log(`  Status: ${row.status}`);
        console.log(`  Created: ${row.created_at}`);
        console.log(`  Payload (first 200 chars): ${row.payload.substring(0, 200)}...`);
        console.log(`  Response (first 200 chars): ${row.response ? row.response.substring(0, 200) + '...' : 'null'}`);
        console.log();
      });
    }

    // Query Deposit table
    console.log(`\n=== DEPOSIT for reference ${depositRef} ===`);
    try {
      const depositResult = await client.query(
        `SELECT * FROM "Deposit" WHERE reference = $1;`,
        [depositRef]
      );
      
      if (depositResult.rows.length === 0) {
        console.log('❌ No Deposit found for this reference');
      } else {
        console.log('✓ Found Deposit(s):\n');
        depositResult.rows.forEach((row, idx) => {
          console.log(`Deposit ${idx + 1}:`, JSON.stringify(row, null, 2));
        });
      }
    } catch (err) {
      console.log('⚠ Deposit query failed (table may not exist):', err.message);
    }

    // Query transactions
    console.log(`\n=== TRANSACTIONS for reference ${depositRef} ===`);
    try {
      const txResult = await client.query(
        `SELECT id, transaction_reference, transaction_type, status, amount, currency, created_at 
         FROM transactions 
         WHERE transaction_reference = $1;`,
        [depositRef]
      );
      
      if (txResult.rows.length === 0) {
        console.log('❌ No transactions found for this reference');
      } else {
        console.log('✓ Found transaction(s):\n');
        txResult.rows.forEach((row, idx) => {
          console.log(`Transaction ${idx + 1}:`, JSON.stringify(row, null, 2));
        });
      }
    } catch (err) {
      console.log('⚠ Transactions query failed:', err.message);
    }

    console.log('\n✓ All queries complete');
    return; // Success, exit retry loop
  } catch (err) {
    lastError = err;
    console.error(`❌ Error (Attempt ${attempt}/${retries}):`, err.message);
    
    if (client) {
      try {
        await client.end();
      } catch (e) {}
    }
    
    if (attempt < retries) {
      const delay = attempt * 2000; // 2s, 4s delays
      console.log(`   Retrying in ${delay/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  }
  
  // All retries exhausted
  console.error('\n❌ Failed to connect after', retries, 'attempts');
  if (lastError) {
    console.error('Final error:', lastError.message);
    if (lastError.code === 'ECONNREFUSED') {
      console.error('   → Connection refused. Check if database is reachable.');
    } else if (lastError.code === 'ECONNRESET') {
      console.error('   → Connection reset. Database may be temporarily down or network unstable.');
    } else if (lastError.code === 'ETIMEDOUT') {
      console.error('   → Connection timeout. Check network connectivity.');
    }
  }
}

main();
