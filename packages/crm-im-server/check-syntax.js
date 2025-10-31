const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

// 提取script标签内容
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) {
  console.log('No script found');
  process.exit(1);
}

const script = scriptMatch[1];

// 直接尝试编译整个脚本
try {
  new Function(script);
  console.log('✓ 没有发现语法错误!');
  process.exit(0);
} catch (e) {
  console.log('✗ 发现语法错误:');
  console.log('错误:', e.message);
  console.log('堆栈:', e.stack);
  process.exit(1);
}
