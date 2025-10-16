/**
 * 验证浏览器持久化登录状态
 * 测试账户重启后是否仍保持登录
 */

const { chromium } = require('playwright');
const path = require('path');

async function testPersistentLogin() {
  const accountId = 'acc-59112c67-ff87-44e3-9176-44313ce2b0b6';
  const userDataDir = path.join(__dirname, 'data', 'browser', `browser_${accountId}`);
  
  console.log('\n🔍 测试浏览器持久化登录状态...\n');
  console.log(`📂 User Data Dir: ${userDataDir}\n`);
  
  // 启动持久化浏览器上下文
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  });
  
  const page = context.pages()[0] || await context.newPage();
  
  try {
    console.log('📍 导航到抖音创作者中心首页...');
    await page.goto('https://creator.douyin.com/creator-micro/home', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    
    console.log('✅ 页面加载完成\n');
    
    // 等待页面完全加载
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    console.log(`📍 当前 URL: ${currentUrl}\n`);
    
    // 检查是否被重定向到登录页
    if (currentUrl.includes('/login') || !currentUrl.includes('/creator-micro/home')) {
      console.log('❌ 被重定向到登录页 - 持久化登录失败');
      console.log('   原因：浏览器数据未正确保存或 Cookie 已过期\n');
      await context.close();
      return false;
    }
    
    console.log('✅ 成功停留在首页 - 未被重定向到登录页\n');
    
    // 检查"抖音号："文本
    console.log('🔍 检查页面内容...');
    const pageText = await page.textContent('body');
    
    if (pageText && pageText.includes('抖音号：')) {
      console.log('✅ 找到 "抖音号：" 文本 - 确认处于登录状态\n');
      
      // 提取用户信息
      const userInfo = await page.evaluate(() => {
        const douyinIdElement = document.querySelector('[class*="unique_id"]');
        const nicknameElement = document.querySelector('[class*="name-"]');
        
        const douyinId = douyinIdElement ? douyinIdElement.textContent : null;
        const nickname = nicknameElement ? nicknameElement.textContent : null;
        
        return { douyinId, nickname };
      });
      
      console.log('👤 用户信息:');
      console.log(`   昵称: ${userInfo.nickname}`);
      console.log(`   ${userInfo.douyinId}\n`);
      
      // 检查 Cookie
      const cookies = await context.cookies();
      const sessionCookies = cookies.filter(c => 
        c.name.includes('sessionid') || c.name.includes('sid')
      );
      
      console.log(`🍪 会话 Cookie 数量: ${sessionCookies.length}`);
      sessionCookies.forEach(c => {
        console.log(`   - ${c.name}: ${c.value.substring(0, 20)}...`);
      });
      
      console.log('\n🎉 持久化登录验证成功！');
      console.log('✅ 浏览器数据已正确保存');
      console.log('✅ 重启后无需重新登录\n');
      
      await page.waitForTimeout(5000);
      await context.close();
      return true;
      
    } else {
      console.log('❌ 未找到 "抖音号：" 文本');
      console.log('   页面可能还在加载或登录状态丢失\n');
      
      // 保存截图用于调试
      await page.screenshot({ 
        path: path.join(__dirname, 'data', 'screenshots', 'persistent-login-check.png'),
        fullPage: true 
      });
      console.log('📸 已保存截图: persistent-login-check.png\n');
      
      await context.close();
      return false;
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    await context.close();
    return false;
  }
}

console.log('浏览器持久化登录验证');
console.log('======================');
console.log('这个测试会验证账户的浏览器数据是否正确保存');
console.log('如果保存成功，重启后应该无需重新登录\n');

testPersistentLogin()
  .then(success => {
    if (success) {
      console.log('✅ 测试通过！');
      process.exit(0);
    } else {
      console.log('❌ 测试失败！');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ 测试异常:', error);
    process.exit(1);
  });
