const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 查看 accounts 表结构
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'").get();
console.log('\n=== accounts 表结构 ===');
console.log(schema.sql);

// 查看账户数据
const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
console.log('\n=== 账户数据 ===');
console.log(JSON.stringify(account, null, 2));

db.close();
