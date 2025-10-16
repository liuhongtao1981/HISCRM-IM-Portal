/**
 * 测试二维码刷新监控功能
 * 验证系统能检测到抖音二维码的自动刷新
 */

const { chromium } = require('playwright');

async function testQRRefreshMonitoring() {
  console.log('\n🚀 测试二维码刷新监控功能...\n');
  
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  });
  
  const page = await context.newPage();
  
  try {
    // 访问抖音创作者中心
    console.log('📍 访问抖音创作者中心...');
    await page.goto('https://creator.douyin.com/', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    console.log('✅ 页面加载完成\n');
    
    // 等待二维码加载
    await page.waitForTimeout(2000);
    
    const qrSelector = '#animate_qrcode_container > div[class*="qrcode"] > img';
    
    // 检查二维码是否存在
    const qrElement = await page.$(qrSelector);
    if (!qrElement) {
      console.error('❌ 未找到二维码元素');
      return;
    }
    
    console.log('✅ 找到二维码元素\n');
    
    // 开始监控二维码变化
    let lastQrBase64 = null;
    let refreshCount = 0;
    const checkInterval = 3000; // 每3秒检查一次
    const maxChecks = 60; // 最多检查60次（3分钟）
    let checkCount = 0;
    
    console.log('🔍 开始监控二维码变化...');
    console.log(`   检查间隔: ${checkInterval}ms`);
    console.log(`   最大检查次数: ${maxChecks}\n`);
    
    const monitorInterval = setInterval(async () => {
      try {
        checkCount++;
        
        const currentElement = await page.$(qrSelector);
        if (!currentElement) {
          console.log(`⚠️  [${checkCount}] 二维码元素消失`);
          return;
        }
        
        // 截取当前二维码
        const qrImage = await currentElement.screenshot();
        const currentQrBase64 = qrImage.toString('base64');
        
        if (lastQrBase64 === null) {
          // 第一次截取
          lastQrBase64 = currentQrBase64;
          console.log(`📸 [${checkCount}] 初始二维码已保存（大小: ${currentQrBase64.length} 字符）`);
        } else if (currentQrBase64 !== lastQrBase64) {
          // 二维码变化了！
          refreshCount++;
          const changePercent = Math.abs(currentQrBase64.length - lastQrBase64.length) / lastQrBase64.length * 100;
          
          console.log(`\n🔄 [${checkCount}] ⚠️  检测到二维码刷新！`);
          console.log(`   刷新次数: ${refreshCount}`);
          console.log(`   大小变化: ${changePercent.toFixed(2)}%`);
          console.log(`   新大小: ${currentQrBase64.length} 字符`);
          console.log(`   旧大小: ${lastQrBase64.length} 字符\n`);
          
          lastQrBase64 = currentQrBase64;
        } else {
          // 二维码未变化
          console.log(`✓ [${checkCount}] 二维码未变化`);
        }
        
        // 检查是否达到最大次数
        if (checkCount >= maxChecks) {
          clearInterval(monitorInterval);
          
          console.log('\n📊 监控完成！');
          console.log(`   总检查次数: ${checkCount}`);
          console.log(`   检测到刷新次数: ${refreshCount}`);
          
          if (refreshCount > 0) {
            const avgRefreshInterval = (checkCount * checkInterval) / refreshCount / 1000;
            console.log(`   平均刷新间隔: ${avgRefreshInterval.toFixed(1)} 秒`);
          }
          
          await browser.close();
        }
        
      } catch (error) {
        console.error(`❌ [${checkCount}] 检查失败:`, error.message);
      }
    }, checkInterval);
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    await browser.close();
  }
}

console.log('二维码刷新监控测试');
console.log('====================');
console.log('这个测试会监控抖音登录二维码的自动刷新');
console.log('通常二维码会在 30-120 秒后自动刷新\n');

testQRRefreshMonitoring().catch(console.error);
