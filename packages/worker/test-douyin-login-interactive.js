/**
 * 抖音登录状态测试脚本
 * 用于验证扫码后的登录状态检测
 * 
 * 运行方式：
 * node packages/worker/test-douyin-login-interactive.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// 创建日志函数
function log(message, ...args) {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args);
}

// 创建用户输入接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 等待用户输入
function waitForUserInput(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

// 检测登录状态
async function checkLoginStatus(page, stepName) {
  log(`\n🔍 ========== ${stepName} - 检测登录状态 ==========`);
  
  // 检查 URL
  const currentUrl = page.url();
  log('📍 当前 URL:', currentUrl);
  
  if (currentUrl.includes('/creator-micro/home')) {
    log('✅ [URL检测] 已登录 - 当前在首页');
  } else if (currentUrl.includes('/login')) {
    log('❌ [URL检测] 未登录 - 当前在登录页');
  } else {
    log('⚠️  [URL检测] URL 状态未知:', currentUrl);
  }
  
  // 检查用户头像（只检测导航栏的）
  log('\n🔍 检查导航栏用户头像元素...');
  const avatarSelectors = [
    '#header-avatar > div',
    '#header-avatar',
    'header [class*="avatar"]',
    '.header [class*="avatar"]',
    '.user-avatar',
  ];
  
  let avatarFound = false;
  let avatarSelector = null;
  for (const selector of avatarSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await element.isVisible();
        log(`  ${selector}: 存在=${!!element}, 可见=${isVisible}`);
        if (isVisible) {
          log(`  ✅ 找到可见的用户头像: ${selector}`);
          avatarFound = true;
          avatarSelector = selector;
          break;
        }
      } else {
        log(`  ${selector}: 不存在`);
      }
    } catch (e) {
      log(`  ${selector}: 查询失败 - ${e.message}`);
    }
  }
  
  if (avatarFound) {
    log('✅ [头像检测] 已登录 - 找到导航栏头像');
  } else {
    log('❌ [头像检测] 未登录 - 未找到导航栏头像');
  }
  
  // 检查 Cookie
  log('\n🔍 检查 Cookie...');
  const cookies = await page.context().cookies();
  const sessionCookies = cookies.filter(c => 
    c.name.includes('sessionid') || 
    c.name.includes('sid') ||
    c.name === 'ttwid' ||
    c.name.includes('passport')
  );
  
  if (sessionCookies.length > 0) {
    log(`✅ [Cookie检测] 找到 ${sessionCookies.length} 个会话相关 Cookie:`);
    sessionCookies.forEach(c => {
      log(`  - ${c.name}: ${c.value.substring(0, 20)}...`);
    });
  } else {
    log('❌ [Cookie检测] 未找到会话 Cookie');
  }
  
  // 检查页面内的用户信息
  log('\n🔍 检查页面内的用户信息元素...');
  const userInfoAnalysis = await page.evaluate(() => {
    const info = {
      hasUserName: false,
      hasUserAvatar: false,
      userElements: [],
    };
    
    // 查找可能包含用户名的元素
    const textElements = document.querySelectorAll('[class*="user"], [class*="name"], [class*="nickname"]');
    textElements.forEach((el, index) => {
      if (el.offsetParent !== null && el.textContent.trim().length > 0) {
        info.userElements.push({
          index,
          className: el.className,
          text: el.textContent.trim().substring(0, 50),
          tagName: el.tagName,
        });
      }
    });
    
    // 查找导航栏中的头像
    const headerAvatars = document.querySelectorAll('header img, .header img, #header-avatar img');
    headerAvatars.forEach((img, index) => {
      if (img.offsetParent !== null) {
        info.hasUserAvatar = true;
        info.userElements.push({
          type: 'header-avatar',
          index,
          src: img.src,
          className: img.className,
        });
      }
    });
    
    return info;
  });
  
  if (userInfoAnalysis.hasUserAvatar) {
    log('✅ [用户信息] 找到导航栏头像元素');
  }
  
  if (userInfoAnalysis.userElements.length > 0) {
    log(`📋 找到 ${userInfoAnalysis.userElements.length} 个可能的用户相关元素`);
    userInfoAnalysis.userElements.slice(0, 5).forEach((el, i) => {
      log(`  ${i + 1}.`, el);
    });
  }
  
  // 总结
  log('\n📝 本次检测总结:');
  const isLoggedIn = avatarFound || currentUrl.includes('/creator-micro/home');
  if (isLoggedIn) {
    log('  ✅ 判断结果: 已登录');
    log('  依据:', avatarFound ? `导航栏头像 (${avatarSelector})` : 'URL 在首页');
  } else {
    log('  ❌ 判断结果: 未登录');
    log('  依据: 未找到导航栏头像且不在首页');
  }
  
  return isLoggedIn;
}

// 主测试函数
async function testDouyinLoginInteractive() {
  let browser = null;
  let context = null;
  
  try {
    log('🚀 开始交互式抖音登录测试...');
    
    // 1. 创建测试数据目录
    const testDataDir = path.join(__dirname, 'data', 'test-browser');
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
    
    // 2. 启动浏览器（可见模式）
    log('📱 启动浏览器（可见模式）...');
    context = await chromium.launchPersistentContext(testDataDir, {
      headless: false,
      slowMo: 100,
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    
    browser = context.browser();
    const page = await context.newPage();
    
    log('✅ 浏览器已启动');
    
    // 3. 访问抖音创作者中心
    log('🌐 访问抖音创作者中心...');
    await page.goto('https://creator.douyin.com/', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    log('✅ 页面加载完成');
    await page.waitForTimeout(2000);
    
    // 4. 第一次检测（登录前）
    const isLoggedInBefore = await checkLoginStatus(page, '步骤1: 登录前');
    
    if (isLoggedInBefore) {
      log('\n⚠️  检测到已经登录，如果要测试登录流程，请先清除浏览器数据');
      log('清除命令: Remove-Item -Recurse -Force packages\\worker\\data\\test-browser');
    } else {
      log('\n✅ 检测到未登录状态，准备进行扫码登录测试');
    }
    
    // 5. 保存截图
    const screenshotDir = path.join(__dirname, 'data', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    const beforeScreenshot = path.join(screenshotDir, `before-login-${Date.now()}.png`);
    await page.screenshot({ path: beforeScreenshot, fullPage: true });
    log('📸 登录前截图已保存:', beforeScreenshot);
    
    // 6. 等待用户扫码
    log('\n⏳ ========================================');
    log('请在浏览器中使用抖音 APP 扫码登录');
    log('登录成功后，回到命令行按 Enter 键继续...');
    log('========================================\n');
    
    await waitForUserInput('按 Enter 键继续检测登录状态 > ');
    
    // 7. 等待页面可能的跳转
    log('\n⏳ 等待页面跳转和加载...');
    await page.waitForTimeout(3000);
    
    // 8. 第二次检测（登录后）
    const isLoggedInAfter = await checkLoginStatus(page, '步骤2: 登录后');
    
    // 9. 保存登录后的截图
    const afterScreenshot = path.join(screenshotDir, `after-login-${Date.now()}.png`);
    await page.screenshot({ path: afterScreenshot, fullPage: true });
    log('📸 登录后截图已保存:', afterScreenshot);
    
    // 10. 保存登录后的 HTML
    const htmlContent = await page.content();
    const htmlPath = path.join(screenshotDir, `after-login-${Date.now()}.html`);
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    log('📄 登录后 HTML 已保存:', htmlPath);
    
    // 11. 提取用户信息
    if (isLoggedInAfter) {
      log('\n🔍 尝试提取用户信息...');
      const userInfo = await page.evaluate(() => {
        const info = {};
        
        // 尝试获取用户名
        const nameSelectors = [
          '.user-name',
          '[class*="username"]',
          '[class*="nickname"]',
          'header [class*="name"]',
        ];
        
        for (const selector of nameSelectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.trim()) {
            info.username = el.textContent.trim();
            break;
          }
        }
        
        // 尝试获取头像
        const avatarSelectors = [
          '#header-avatar img',
          'header img[class*="avatar"]',
          '.user-avatar img',
        ];
        
        for (const selector of avatarSelectors) {
          const el = document.querySelector(selector);
          if (el && el.src) {
            info.avatar = el.src;
            break;
          }
        }
        
        // 获取用户 ID（如果有）
        const userId = window.location.pathname.match(/user\/(\d+)/);
        if (userId) {
          info.userId = userId[1];
        }
        
        return info;
      });
      
      log('👤 提取的用户信息:', JSON.stringify(userInfo, null, 2));
    }
    
    // 12. 最终总结
    log('\n✅ ========== 测试完成 ==========');
    log('\n📊 测试结果:');
    log('  登录前状态:', isLoggedInBefore ? '已登录' : '未登录');
    log('  登录后状态:', isLoggedInAfter ? '已登录' : '未登录');
    log('  登录是否成功:', !isLoggedInBefore && isLoggedInAfter ? '✅ 是' : '❌ 否');
    
    if (!isLoggedInBefore && isLoggedInAfter) {
      log('\n🎉 恭喜！登录状态检测逻辑工作正常！');
      log('✅ checkLoginStatus 能够正确识别登录状态');
    } else if (isLoggedInBefore && isLoggedInAfter) {
      log('\n⚠️  两次检测都是已登录状态');
      log('可能原因: 浏览器已保存登录状态');
    } else if (!isLoggedInAfter) {
      log('\n❌ 登录后仍然检测为未登录');
      log('请检查: 1) 是否真的登录成功 2) 选择器是否需要调整');
    }
    
    log('\n📁 生成的文件:');
    log('  - 登录前截图:', beforeScreenshot);
    log('  - 登录后截图:', afterScreenshot);
    log('  - 登录后HTML:', htmlPath);
    
    // 13. 保持浏览器打开
    log('\n⏳ 浏览器将保持打开，您可以继续手动测试...');
    log('按 Enter 键关闭浏览器并结束测试 > ');
    await waitForUserInput('');
    
  } catch (error) {
    log('❌ 测试失败:', error.message);
    log('错误堆栈:', error.stack);
  } finally {
    // 清理
    rl.close();
    if (context) {
      log('\n🧹 关闭浏览器...');
      await context.close();
    }
    log('✅ 测试完成');
    process.exit(0);
  }
}

// 运行测试
testDouyinLoginInteractive().catch(console.error);
