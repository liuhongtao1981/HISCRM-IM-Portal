/**
 * 验证构建配置脚本
 * 用于检查打包前的必要文件和配置
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 开始验证构建配置...\n');

let hasErrors = false;

// 检查 config.json
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  console.log('✅ config.json 存在');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log('   WebSocket URL:', config.websocket?.url || '未配置');
  } catch (err) {
    console.error('❌ config.json 格式错误:', err.message);
    hasErrors = true;
  }
} else {
  console.error('❌ config.json 不存在');
  hasErrors = true;
}

// 检查 dist 目录
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  console.log('✅ dist/ 目录存在');

  // 检查 dist/config.json
  const distConfigPath = path.join(distPath, 'config.json');
  if (fs.existsSync(distConfigPath)) {
    console.log('✅ dist/config.json 已复制');
  } else {
    console.warn('⚠️  dist/config.json 不存在 (需要先运行 npm run build)');
  }

  // 检查 index.html
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    console.log('✅ dist/index.html 存在');
  } else {
    console.error('❌ dist/index.html 不存在');
    hasErrors = true;
  }
} else {
  console.warn('⚠️  dist/ 目录不存在 (需要先运行 npm run build)');
}

// 检查 dist-electron 目录
const distElectronPath = path.join(__dirname, 'dist-electron');
if (fs.existsSync(distElectronPath)) {
  console.log('✅ dist-electron/ 目录存在');

  const mainPath = path.join(distElectronPath, 'main.js');
  if (fs.existsSync(mainPath)) {
    console.log('✅ dist-electron/main.js 存在');
  } else {
    console.error('❌ dist-electron/main.js 不存在');
    hasErrors = true;
  }

  const preloadPath = path.join(distElectronPath, 'preload.js');
  if (fs.existsSync(preloadPath)) {
    console.log('✅ dist-electron/preload.js 存在');
  } else {
    console.warn('⚠️  dist-electron/preload.js 不存在');
  }
} else {
  console.warn('⚠️  dist-electron/ 目录不存在 (需要先运行 npm run build:electron)');
}

// 检查 package.json
const packagePath = path.join(__dirname, 'package.json');
if (fs.existsSync(packagePath)) {
  console.log('✅ package.json 存在');
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    if (pkg.build && pkg.build.files) {
      console.log('✅ Electron Builder 配置存在');
      console.log('   打包文件:', pkg.build.files);
    }
  } catch (err) {
    console.error('❌ package.json 格式错误:', err.message);
    hasErrors = true;
  }
}

console.log('\n' + '='.repeat(50));

if (hasErrors) {
  console.error('❌ 验证失败! 请修复上述错误后再打包');
  process.exit(1);
} else {
  console.log('✅ 验证通过! 可以执行打包');
  console.log('\n建议的打包步骤:');
  console.log('1. npm run build          # 构建前端');
  console.log('2. npm run build:electron # 构建 Electron 主进程');
  console.log('3. npm run electron:build # 打包为可执行文件');
  console.log('\n或直接运行: npm run electron:build (会自动执行上述步骤)');
  process.exit(0);
}
