const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'packages/master/data/master.db');

try {
  const db = new Database(dbPath);
  
  // Query the specific reply we just created
  const reply = db.prepare(
    `SELECT id, request_id, account_id, target_type, reply_status, 
            submitted_count, assigned_worker_id, error_message, platform_reply_id
     FROM replies 
     WHERE request_id = 'test-comment-reply-fix-verify'`
  ).get();
  
  if (reply) {
    console.log('Found reply:');
    console.log(JSON.stringify(reply, null, 2));
  } else {
    console.log('Reply not found, checking all recent replies:');
    const rows = db.prepare(
      `SELECT id, request_id, account_id, target_type, reply_status, 
              submitted_count, error_message, platform_reply_id
       FROM replies 
       ORDER BY created_at DESC 
       LIMIT 5`
    ).all();
    console.log(JSON.stringify(rows, null, 2));
  }
  
  db.close();
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
