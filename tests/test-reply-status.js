const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'packages/master/data/master.db');

try {
  const db = new Database(dbPath);
  
  // Query all replies
  const rows = db.prepare(
    `SELECT reply_id, request_id, account_id, target_type, status, created_at, updated_at 
     FROM replies 
     ORDER BY created_at DESC 
     LIMIT 5`
  ).all();
  
  console.log('Recent replies:');
  console.log(JSON.stringify(rows, null, 2));
  
  db.close();
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
