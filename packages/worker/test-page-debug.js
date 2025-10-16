/**
 * 调试页面内容 - 查看页面实际渲染内容
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function debugPageContent() {
  const accountId = 'acc-59112c67-ff87-44e3-9176-44313ce2b0b6';
  const userDataDir = path.join(__dirname, 'data', 'browser', `browser_${accountId}`);
  
  console.log('\n🔍 调试页面内容...\n');
  
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  });
  
  const page = context.pages()[0] || await context.newPage();
  
  try {
    console.log('📍 导航到首页...');
    await page.goto('https://creator.douyin.com/creator-micro/home', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    
    // 等待页面完全加载
    await page.waitForTimeout(3000);
    
    console.log(`📍 当前 URL: ${page.url()}\n`);
    
    // 获取页面 HTML
    const html = await page.content();
    const htmlPath = path.join(__dirname, 'data', 'screenshots', 'page-debug.html');
    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`✅ 已保存 HTML: ${htmlPath}\n`);
    
    // 检查"抖音号："
    console.log('🔍 搜索 "抖音号：" 文本...');
    const bodyText = await page.textContent('body');
    
    if (bodyText.includes('抖音号：')) {
      console.log('✅ 找到 "抖音号：" 文本\n');
      
      const index = bodyText.indexOf('抖音号：');
      const snippet = bodyText.substring(index, index + 50);
      console.log(`   内容片段: ${snippet}\n`);
    } else {
      console.log('❌ 未找到 "抖音号：" 文本\n');
      
      // 搜索可能的相关文本
      console.log('🔍 搜索其他可能的文本标识...\n');
      
      const keywords = ['抖音', '创作者', '首页', '发布', '数据', '粉丝', '登录', '扫码'];
      keywords.forEach(keyword => {
        if (bodyText.includes(keyword)) {
          console.log(`   ✅ 找到: ${keyword}`);
        } else {
          console.log(`   ❌ 未找到: ${keyword}`);
        }
      });
    }
    
    console.log('\n🔍 检查关键元素...\n');
    
    // 检查 unique_id 元素
    const uniqueIdElement = await page.$('[class*="unique_id"]');
    if (uniqueIdElement) {
      const text = await uniqueIdElement.textContent();
      console.log(`   ✅ [class*="unique_id"]: ${text}`);
    } else {
      console.log(`   ❌ 未找到 [class*="unique_id"]`);
    }
    
    // 检查 name 元素
    const nameElement = await page.$('[class*="name-"]');
    if (nameElement) {
      const text = await nameElement.textContent();
      console.log(`   ✅ [class*="name-"]: ${text}`);
    } else {
      console.log(`   ❌ 未找到 [class*="name-"]`);
    }
    
    // 检查头像
    const avatarElement = await page.$('#header-avatar');
    if (avatarElement) {
      console.log(`   ✅ #header-avatar 存在`);
    } else {
      console.log(`   ❌ 未找到 #header-avatar`);
    }
    
    // 获取所有 Cookie
    console.log('\n🍪 Cookie 列表:\n');
    const cookies = await context.cookies();
    console.log(`   总数: ${cookies.length}`);
    
    const importantCookies = cookies.filter(c => 
      c.name.includes('session') || 
      c.name.includes('sid') || 
      c.name.includes('uid') || 
      c.name.includes('token')
    );
    
    if (importantCookies.length > 0) {
      console.log(`\n   重要 Cookie (${importantCookies.length}):`);
      importantCookies.forEach(c => {
        console.log(`   - ${c.name}: ${c.value.substring(0, 30)}...`);
      });
    } else {
      console.log(`\n   ⚠️ 未找到会话相关 Cookie`);
    }
    
    // 保存截图
    await page.screenshot({ 
      path: path.join(__dirname, 'data', 'screenshots', 'page-debug.png'),
      fullPage: true 
    });
    
    console.log('\n📸 已保存截图: page-debug.png');
    console.log('\n⏳ 保持浏览器打开 10 秒，请手动检查页面...\n');
    
    await page.waitForTimeout(10000);
    
    await context.close();
    
  } catch (error) {
    console.error('❌ 错误:', error);
    await context.close();
  }
}

debugPageContent();
