/**
 * 批量替换脚本: works → contents
 * 使用前请确保已经备份代码和数据库！
 */

const fs = require('fs');
const path = require('path');

console.log('======================================');
console.log('🔄 批量替换: works → contents');
console.log('======================================\n');

const projectRoot = path.join(__dirname, '..');
console.log(`📁 工作目录: ${projectRoot}\n`);

// 替换规则
const replacements = [
  // 1. 表名
  { from: /'works'/g, to: "'contents'", desc: "表名 'works' → 'contents'" },
  { from: /"works"/g, to: '"contents"', desc: '表名 "works" → "contents"' },
  { from: /FROM works/g, to: 'FROM contents', desc: 'SQL FROM works' },
  { from: /INTO works/g, to: 'INTO contents', desc: 'SQL INTO works' },
  { from: /TABLE works/g, to: 'TABLE contents', desc: 'SQL TABLE works' },
  { from: /\bworks\b/g, to: 'contents', desc: '单词 works → contents' },

  // 2. 类名
  { from: /WorksDAO/g, to: 'ContentsDAO', desc: 'WorksDAO → ContentsDAO' },
  { from: /worksDAO/g, to: 'contentsDAO', desc: 'worksDAO → contentsDAO' },

  // 3. 文件引用
  { from: /works-dao/g, to: 'contents-dao', desc: 'works-dao → contents-dao' },
  { from: /WorkDAO/g, to: 'ContentDAO', desc: 'WorkDAO → ContentDAO' },

  // 4. 字段名
  { from: /platform_work_id/g, to: 'platform_content_id', desc: 'platform_work_id → platform_content_id' },
  { from: /work_type/g, to: 'content_type', desc: 'work_type → content_type' },
  { from: /work_id/g, to: 'content_id', desc: 'work_id → content_id (discussions)' },

  // 5. 统计字段
  { from: /total_comment_count/g, to: 'stats_comment_count', desc: 'total_comment_count → stats_comment_count' },
  { from: /\bnew_comment_count\b/g, to: 'stats_new_comment_count', desc: 'new_comment_count → stats_new_comment_count' },
  { from: /\blike_count\b/g, to: 'stats_like_count', desc: 'like_count → stats_like_count' },
  { from: /\bshare_count\b/g, to: 'stats_share_count', desc: 'share_count → stats_share_count' },
  { from: /\bview_count\b/g, to: 'stats_view_count', desc: 'view_count → stats_view_count' },

  // 6. 索引名
  { from: /idx_works_/g, to: 'idx_contents_', desc: 'idx_works_ → idx_contents_' },
  { from: /idx_discussions_work\b/g, to: 'idx_discussions_content', desc: 'idx_discussions_work → idx_discussions_content' },
];

// 递归查找所有 .js 文件
function findJSFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // 跳过 node_modules 和 .git
      if (file !== 'node_modules' && file !== '.git' && file !== 'data') {
        findJSFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// 扫描需要处理的目录
const dirsToProcess = [
  path.join(projectRoot, 'packages'),
  path.join(projectRoot, 'tests'),
];

console.log('======================================');
console.log('📊 扫描需要修改的文件');
console.log('======================================\n');

let allFiles = [];
dirsToProcess.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = findJSFiles(dir);
    allFiles = allFiles.concat(files);
    console.log(`${path.basename(dir)}/ 目录: ${files.length} 个文件`);
  }
});

console.log(`\n总计: ${allFiles.length} 个文件\n`);

// 确认
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('是否继续执行替换？(y/n) ', (answer) => {
  readline.close();

  if (answer.toLowerCase() !== 'y') {
    console.log('\n❌ 操作已取消');
    process.exit(0);
  }

  console.log('\n======================================');
  console.log('🚀 开始批量替换');
  console.log('======================================\n');

  let totalReplacements = 0;
  let filesModified = 0;

  allFiles.forEach((filePath, index) => {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let fileReplacements = 0;

    replacements.forEach(({ from, to }) => {
      const matches = content.match(from);
      if (matches) {
        content = content.replace(from, to);
        fileReplacements += matches.length;
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      filesModified++;
      totalReplacements += fileReplacements;

      // 显示进度
      if (filesModified % 5 === 0 || filesModified === 1) {
        console.log(`   处理中... ${filesModified}/${allFiles.length} 个文件 (${fileReplacements} 处替换)`);
      }
    }
  });

  console.log(`\n✅ 处理完成: 修改了 ${filesModified} 个文件，共 ${totalReplacements} 处替换\n`);

  console.log('======================================');
  console.log('✅ 批量替换完成！');
  console.log('======================================\n');

  console.log('📝 已完成的替换:');
  replacements.forEach(({ desc }) => {
    console.log(`   ✅ ${desc}`);
  });

  console.log('\n⚠️  注意事项:');
  console.log('   1. 请手动检查关键文件是否正确');
  console.log('   2. 运行测试验证功能');
  console.log('   3. 提交前再次确认\n');
});
