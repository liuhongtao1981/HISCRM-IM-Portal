/**
 * 抖音登录流程测试脚本
 * 用于调试和验证登录检测逻辑
 * 
 * 运行方式：
 * node packages/worker/test-douyin-login.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 创建日志函数
function log(message, ...args) {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args);
}

// 主测试函数
async function testDouyinLogin() {
  let browser = null;
  let context = null;
  
  try {
    log('🚀 开始测试抖音登录流程...');
    
    // 1. 创建测试数据目录
    const testDataDir = path.join(__dirname, 'data', 'test-browser');
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
    
    // 2. 启动浏览器（可见模式，便于调试）
    log('📱 启动浏览器（可见模式）...');
    context = await chromium.launchPersistentContext(testDataDir, {
      headless: false,  // 🔍 可见模式
      slowMo: 500,      // 🔍 慢速模式，便于观察
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    
    browser = context.browser();
    const page = await context.newPage();
    
    log('✅ 浏览器已启动');
    
    // 3. 访问抖音创作者中心
    log('🌐 访问抖音创作者中心: https://creator.douyin.com/');
    await page.goto('https://creator.douyin.com/', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    log('✅ 页面加载完成');
    await page.waitForTimeout(2000);
    
    // 4. 保存初始页面截图
    const screenshotDir = path.join(__dirname, 'data', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    const screenshotPath = path.join(screenshotDir, `test-login-page-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log('📸 页面截图已保存:', screenshotPath);
    
    // 5. 检查当前页面 URL
    const currentUrl = page.url();
    log('📍 当前 URL:', currentUrl);
    
    // 6. 检测登录状态
    log('\n🔍 ========== 开始检测登录状态 ==========');
    
    // 检查 URL
    if (currentUrl.includes('/creator-micro/home')) {
      log('✅ [URL检测] 已登录 - 当前在首页');
    } else if (currentUrl.includes('/login')) {
      log('❌ [URL检测] 未登录 - 当前在登录页');
    } else {
      log('⚠️  [URL检测] URL 状态未知:', currentUrl);
    }
    
    // 检查用户头像
    log('\n🔍 检查用户头像元素（只检测导航栏头像，不检测装饰性头像）...');
    const avatarSelectors = [
      '#header-avatar > div',
      '#header-avatar',
      'header [class*="avatar"]',
      '.header [class*="avatar"]',
      '.user-avatar',
      '.avatar-icon',
    ];
    
    let avatarFound = false;
    for (const selector of avatarSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          log(`  ${selector}: ${element ? '存在' : '不存在'}, 可见: ${isVisible}`);
          if (isVisible) {
            log(`  ✅ 找到可见的用户头像: ${selector}`);
            avatarFound = true;
            break;
          }
        }
      } catch (e) {
        log(`  ${selector}: 查询失败 - ${e.message}`);
      }
    }
    
    if (avatarFound) {
      log('✅ [头像检测] 已登录');
    } else {
      log('❌ [头像检测] 未找到用户头像，可能未登录');
    }
    
    // 7. 检查二维码元素
    log('\n🔍 检查二维码元素...');
    const qrCodeSelectors = [
      '#animate_qrcode_container > div[class*="qrcode"] > img',
      '#animate_qrcode_container img',
      'img[class*="qrcode"]',
      'img[alt*="二维码"]',
      'canvas[class*="qrcode"]',
      '.qrcode-image',
      '.login-qrcode img',
      '[class*="qr-code"] img',
    ];
    
    let qrFound = false;
    let qrSelector = null;
    for (const selector of qrCodeSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          log(`  ${selector}: 存在, 可见: ${isVisible}`);
          if (isVisible) {
            log(`  ✅ 找到可见的二维码: ${selector}`);
            qrFound = true;
            qrSelector = selector;
            
            // 截取二维码图片
            const qrImage = await element.screenshot();
            const qrImagePath = path.join(screenshotDir, `test-qrcode-${Date.now()}.png`);
            fs.writeFileSync(qrImagePath, qrImage);
            log(`  📸 二维码图片已保存: ${qrImagePath}`);
            break;
          }
        } else {
          log(`  ${selector}: 不存在`);
        }
      } catch (e) {
        log(`  ${selector}: 查询失败 - ${e.message}`);
      }
    }
    
    if (qrFound) {
      log('✅ [二维码检测] 找到二维码，可以进行扫码登录');
    } else {
      log('❌ [二维码检测] 未找到二维码');
    }
    
    // 8. 检查手机号登录输入框
    log('\n🔍 检查手机号登录输入框...');
    const phoneSelectors = [
      'input[placeholder*="手机号"]',
      'input[placeholder*="手机"]',
      'input[type="tel"]',
      'input[name="mobile"]',
      'input[name="phone"]',
    ];
    
    let phoneFound = false;
    for (const selector of phoneSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          log(`  ${selector}: 存在, 可见: ${isVisible}`);
          if (isVisible) {
            log(`  ✅ 找到手机号输入框: ${selector}`);
            phoneFound = true;
            break;
          }
        }
      } catch (e) {
        log(`  ${selector}: 查询失败 - ${e.message}`);
      }
    }
    
    if (phoneFound) {
      log('✅ [手机号检测] 找到手机号输入框，可以进行短信登录');
    } else {
      log('❌ [手机号检测] 未找到手机号输入框');
    }
    
    // 9. 获取页面 HTML 结构（保存到文件）
    log('\n💾 保存页面 HTML 结构...');
    const htmlContent = await page.content();
    const htmlPath = path.join(screenshotDir, `test-page-structure-${Date.now()}.html`);
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    log('📄 HTML 结构已保存:', htmlPath);
    
    // 10. 执行页面内 JavaScript 分析
    log('\n🔍 执行页面内元素分析...');
    const pageAnalysis = await page.evaluate(() => {
      const analysis = {
        hasQRCode: false,
        hasPhoneInput: false,
        hasAvatar: false,
        allImages: [],
        allInputs: [],
        loginRelatedElements: [],
      };
      
      // 查找所有图片
      const images = document.querySelectorAll('img');
      images.forEach((img, index) => {
        const info = {
          index,
          src: img.src,
          alt: img.alt,
          className: img.className,
          id: img.id,
          visible: img.offsetParent !== null,
        };
        analysis.allImages.push(info);
        
        // 检查是否是二维码
        const text = (img.className + img.id + img.alt).toLowerCase();
        if (text.includes('qr') || text.includes('qrcode') || text.includes('二维码')) {
          analysis.hasQRCode = true;
          analysis.loginRelatedElements.push({ type: 'qrcode', ...info });
        }
        
        // 检查是否是头像
        if (text.includes('avatar') || text.includes('头像') || text.includes('user')) {
          analysis.hasAvatar = true;
          analysis.loginRelatedElements.push({ type: 'avatar', ...info });
        }
      });
      
      // 查找所有输入框
      const inputs = document.querySelectorAll('input');
      inputs.forEach((input, index) => {
        const info = {
          index,
          type: input.type,
          name: input.name,
          placeholder: input.placeholder,
          className: input.className,
          id: input.id,
          visible: input.offsetParent !== null,
        };
        analysis.allInputs.push(info);
        
        // 检查是否是手机号输入
        const text = (input.placeholder + input.name + input.className).toLowerCase();
        if (text.includes('phone') || text.includes('mobile') || text.includes('手机')) {
          analysis.hasPhoneInput = true;
          analysis.loginRelatedElements.push({ type: 'phone', ...info });
        }
      });
      
      return analysis;
    });
    
    log('📊 页面分析结果:');
    log('  - 图片总数:', pageAnalysis.allImages.length);
    log('  - 输入框总数:', pageAnalysis.allInputs.length);
    log('  - 发现二维码:', pageAnalysis.hasQRCode ? '是' : '否');
    log('  - 发现手机输入框:', pageAnalysis.hasPhoneInput ? '是' : '否');
    log('  - 发现用户头像:', pageAnalysis.hasAvatar ? '是' : '否');
    
    if (pageAnalysis.loginRelatedElements.length > 0) {
      log('\n📋 登录相关元素详情:');
      pageAnalysis.loginRelatedElements.forEach((el, i) => {
        log(`  ${i + 1}. ${el.type}:`, {
          className: el.className,
          id: el.id,
          visible: el.visible,
        });
      });
    }
    
    // 11. 总结
    log('\n✅ ========== 检测完成 ==========');
    log('\n📝 总结:');
    if (avatarFound) {
      log('  ✅ 用户已登录');
      log('  建议: checkLoginStatus 应该返回 { isLoggedIn: true }');
    } else if (qrFound) {
      log('  ⚠️  未登录，显示二维码登录');
      log('  建议: detectLoginMethod 应该返回 { type: "qrcode", selector: "' + qrSelector + '" }');
    } else if (phoneFound) {
      log('  ⚠️  未登录，显示手机号登录');
      log('  建议: detectLoginMethod 应该返回 { type: "sms" }');
    } else {
      log('  ❌ 无法确定登录状态');
      log('  建议: 检查页面 HTML 文件和截图进行人工分析');
    }
    
    log('\n📁 生成的文件:');
    log('  - 页面截图:', screenshotPath);
    log('  - HTML 结构:', htmlPath);
    if (qrFound) {
      log('  - 二维码图片: (已保存)');
    }
    
    // 12. 等待用户操作
    log('\n⏳ 浏览器将保持打开状态 60 秒，您可以手动操作...');
    log('   按 Ctrl+C 可以提前结束');
    await page.waitForTimeout(60000);
    
  } catch (error) {
    log('❌ 测试失败:', error.message);
    log('错误堆栈:', error.stack);
  } finally {
    // 清理
    if (context) {
      log('\n🧹 关闭浏览器...');
      await context.close();
    }
    log('✅ 测试完成');
  }
}

// 运行测试
testDouyinLogin().catch(console.error);
