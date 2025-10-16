/**
 * 快速测试：检查二维码登录页面上的头像元素
 * 验证 checkLoginStatus 是否会误判
 */

const { chromium } = require('playwright');

async function testQRPageDetection() {
  console.log('\n🚀 测试二维码登录页面的元素检测...\n');
  
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
    
    // 等待登录页面完全加载
    await page.waitForTimeout(2000);
    
    // 检测当前 URL
    const currentUrl = page.url();
    console.log(`📍 当前 URL: ${currentUrl}`);
    
    // 检查所有可能被误判的选择器
    console.log('\n🔍 检查 checkLoginStatus 中使用的头像选择器:\n');
    
    const avatarSelectors = [
      '#header-avatar > div',
      '#header-avatar',
      'header [class*="avatar"]',
      '.header [class*="avatar"]',
      '.user-avatar',  // ⚠️ 可能有问题
      '.avatar-icon',  // ⚠️ 可能有问题
    ];
    
    for (const selector of avatarSelectors) {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await element.isVisible();
        const tagName = await element.evaluate(el => el.tagName);
        const className = await element.evaluate(el => el.className);
        const innerHTML = await element.evaluate(el => el.innerHTML.substring(0, 100));
        
        console.log(`❌ 找到元素: ${selector}`);
        console.log(`   标签: ${tagName}, 类名: ${className}`);
        console.log(`   可见: ${isVisible}`);
        console.log(`   内容预览: ${innerHTML}...`);
        console.log('');
        
        if (isVisible) {
          console.log(`⚠️  警告: ${selector} 在登录页面可见！会导致误判为已登录！\n`);
        }
      } else {
        console.log(`✅ ${selector}: 未找到`);
      }
    }
    
    // 检查二维码是否存在
    console.log('\n🔍 检查二维码元素:\n');
    const qrElement = await page.$('#animate_qrcode_container > div[class*="qrcode"] > img');
    if (qrElement) {
      const isVisible = await qrElement.isVisible();
      console.log(`✅ 二维码存在，可见: ${isVisible}`);
    } else {
      console.log('❌ 二维码未找到');
    }
    
    // 等待用户观察
    console.log('\n⏳ 浏览器将保持打开30秒，供您观察页面...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    await browser.close();
    console.log('\n✅ 测试完成');
  }
}

testQRPageDetection().catch(console.error);
