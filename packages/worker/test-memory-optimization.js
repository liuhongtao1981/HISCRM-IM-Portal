/**
 * 浏览器内存优化配置测试脚本
 *
 * 用途：验证内存优化配置是否正确加载
 */

const { getOptimizedConfig, PRESETS } = require('./src/config/browser-memory-optimization');

console.log('========================================');
console.log('浏览器内存优化配置测试');
console.log('========================================\n');

// 测试所有预设
const presets = ['MAXIMUM_SAVINGS', 'BALANCED', 'MINIMAL'];

presets.forEach(preset => {
  console.log(`\n📋 预设: ${preset}`);
  console.log('-'.repeat(40));

  const config = getOptimizedConfig(preset);

  console.log(`预估内存占用: ${config.estimatedMemory}`);
  console.log(`启动参数数量: ${config.args.length} 个`);
  console.log(`\n核心优化参数:`);

  // 显示关键参数
  const keyArgs = [
    '--disable-gpu',
    '--single-process',
    '--disable-extensions',
    '--blink-settings=imagesEnabled=false',
  ];

  keyArgs.forEach(arg => {
    const enabled = config.args.some(a => a.includes(arg.split('=')[0]));
    console.log(`  ${enabled ? '✅' : '❌'} ${arg}`);
  });

  // 显示上下文选项
  console.log(`\n上下文选项:`);
  console.log(`  Service Workers: ${config.contextOptions.serviceWorkers || 'allow'}`);
});

// 显示推荐配置
console.log('\n');
console.log('========================================');
console.log('💡 推荐配置');
console.log('========================================');
console.log('');
console.log('在 .env 文件中设置:');
console.log('');
console.log('# 生产环境推荐');
console.log('BROWSER_MEMORY_PRESET=BALANCED');
console.log('');
console.log('# 内存极度紧张时');
console.log('BROWSER_MEMORY_PRESET=MAXIMUM_SAVINGS');
console.log('');
console.log('# 追求稳定性时');
console.log('BROWSER_MEMORY_PRESET=MINIMAL');
console.log('');

// 显示环境变量
console.log('========================================');
console.log('🔧 当前环境变量');
console.log('========================================');
console.log('');
console.log(`BROWSER_MEMORY_PRESET = ${process.env.BROWSER_MEMORY_PRESET || '(未设置，默认 BALANCED)'}`);
console.log('');

// 验证当前配置
const currentPreset = process.env.BROWSER_MEMORY_PRESET || 'BALANCED';
const currentConfig = getOptimizedConfig(currentPreset);

console.log('========================================');
console.log('✅ 当前生效配置');
console.log('========================================');
console.log('');
console.log(`预设: ${currentPreset}`);
console.log(`预估内存: ${currentConfig.estimatedMemory}/账户`);
console.log(`启动参数数量: ${currentConfig.args.length} 个`);
console.log('');
console.log('详细参数请查看: docs/浏览器内存优化指南.md');
console.log('');
