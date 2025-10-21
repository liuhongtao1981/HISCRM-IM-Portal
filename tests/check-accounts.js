const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'packages/master/data/master.db');

try {
  const db = new Database(dbPath);
  
  // Query all accounts
  const accounts = db.prepare(
    `SELECT id, platform, account_name, login_status, status, assigned_worker_id, created_at
     FROM accounts`
  ).all();
  
  console.log(`Found ${accounts.length} accounts:`);
  console.log(JSON.stringify(accounts, null, 2));
  
  // Check specific account
  const specificAccount = db.prepare(
    `SELECT * FROM accounts WHERE id = 'acc-40dab768-fee1-4718-b64b-eb3a7c23beac'`
  ).get();
  
  if (specificAccount) {
    console.log('\nSpecific account details:');
    console.log(JSON.stringify(specificAccount, null, 2));
  } else {
    console.log('\nSpecific account not found');
  }
  
  db.close();
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
