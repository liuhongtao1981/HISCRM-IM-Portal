/**
 * Test Platform Loading
 * Check if platform can be loaded correctly
 */

console.log('🧪 Testing Platform Loading\n');

// Mock dependencies
const mockBridge = {
  socket: { emit: () => {} }
};

const mockBrowserManager = {
  getOrCreateFingerprintConfig: () => ({}),
  createBrowser: () => Promise.resolve({})
};

try {
  console.log('1️⃣ Loading config.json...');
  const config = require('../packages/worker/src/platforms/douyin/config.json');
  console.log('   ✅ Config loaded:', config.platform);
  console.log('');

  console.log('2️⃣ Loading platform class...');
  const DouyinPlatform = require('../packages/worker/src/platforms/douyin/platform.js');
  console.log('   ✅ Platform class loaded');
  console.log('   Type:', typeof DouyinPlatform);
  console.log('   Name:', DouyinPlatform.name);
  console.log('');

  console.log('3️⃣ Creating platform instance...');
  const platform = new DouyinPlatform(config, mockBridge, mockBrowserManager);
  console.log('   ✅ Platform instance created');
  console.log('   Constructor:', platform.constructor.name);
  console.log('');

  console.log('4️⃣ Checking methods...');
  const methods = ['getName', 'startLogin', 'login'];
  for (const method of methods) {
    if (typeof platform[method] === 'function') {
      console.log(`   ✅ ${method}: function`);
    } else {
      console.log(`   ❌ ${method}: ${typeof platform[method]}`);
    }
  }
  console.log('');

  console.log('5️⃣ Calling getName()...');
  const name = platform.getName();
  console.log(`   ✅ getName() returned: "${name}"`);
  console.log('');

  console.log('✅ All tests passed!');

} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error('\nStack trace:');
  console.error(error.stack);
  process.exit(1);
}
