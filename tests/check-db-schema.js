const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'packages/master/data/master.db');

try {
  const db = new Database(dbPath);
  
  // Get all tables
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all();
  
  console.log('Tables in database:');
  tables.forEach(t => console.log('  -', t.name));
  
  // Check if replies table exists and get its schema
  const replyTableExists = tables.find(t => t.name === 'replies');
  if (replyTableExists) {
    const schema = db.prepare(
      "PRAGMA table_info(replies)"
    ).all();
    console.log('\nReplies table schema:');
    schema.forEach(col => console.log(`  ${col.name}: ${col.type}`));
  } else {
    console.log('\nReplies table does not exist yet');
  }
  
  db.close();
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
