/**
 * Test Platform Loading
 * Check if platform can be loaded correctly
 */

console.log('üß™ Testing Platform Loading\n');

// Mock dependencies
const mockBridge = {
  socket: { emit: () => {} }
};

const mockBrowserManager = {
  getOrCreateFingerprintConfig: () => ({}),
  createBrowser: () => Promise.resolve({})
};

try {
  console.log('1Ô∏è‚É£ Loading config.json...');
  const config = require('../packages/worker/src/platforms/douyin/config.json');
  console.log('   ‚ú?Config loaded:', config.platform);
  console.log('');

  console.log('2Ô∏è‚É£ Loading platform class...');
  const DouyinPlatform = require('../packages/worker/src/platforms/douyin/platform.js');
  console.log('   ‚ú?Platform class loaded');
  console.log('   Type:', typeof DouyinPlatform);
  console.log('   Name:', DouyinPlatform.name);
  console.log('');

  console.log('3Ô∏è‚É£ Creating platform instance...');
  const platform = new DouyinPlatform(config, mockBridge, mockBrowserManager);
  console.log('   ‚ú?Platform instance created');
  console.log('   Constructor:', platform.constructor.name);
  console.log('');

  console.log('4Ô∏è‚É£ Checking methods...');
  const methods = ['getName', 'startLogin', 'login'];
  for (const method of methods) {
    if (typeof platform[method] === 'function') {
      console.log(`   ‚ú?${method}: function`);
    } else {
      console.log(`   ‚ù?${method}: ${typeof platform[method]}`);
    }
  }
  console.log('');

  console.log('5Ô∏è‚É£ Calling getName()...');
  const name = platform.getName();
  console.log(`   ‚ú?getName() returned: "${name}"`);
  console.log('');

  console.log('‚ú?All tests passed!');

} catch (error) {
  console.error('\n‚ù?Error:', error.message);
  console.error('\nStack trace:');
  console.error(error.stack);
  process.exit(1);
}
