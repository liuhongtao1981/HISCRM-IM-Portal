/**
 * 浏览器内存优化配置
 *
 * 目标：将每个账户的浏览器内存占用从 600MB-1GB 降低到 200-300MB
 *
 * 优化策略：
 * 1. 禁用不必要的浏览器功能
 * 2. 限制渲染和缓存资源
 * 3. 减少后台进程
 * 4. 优化 GPU 和硬件加速
 */

/**
 * 获取内存优化的浏览器启动参数
 * @param {Object} options - 配置选项
 * @returns {Array<string>} 优化后的启动参数
 */
function getMemoryOptimizedArgs(options = {}) {
  const {
    // 是否启用 GPU（默认禁用以节省内存）
    enableGPU = false,
    // 是否启用图片加载（爬虫场景可以禁用）
    enableImages = true,
    // 磁盘缓存大小（MB）
    diskCacheSize = 50,
    // 内存缓存大小（MB）
    memoryCacheSize = 20,
  } = options;

  const args = [
    // ==================== 基础安全参数 ====================
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',

    // ==================== 内存优化核心参数 ====================

    // 1. 禁用 GPU 加速（可节省 100-200MB 内存）
    ...(enableGPU ? [] : [
      '--disable-gpu',
      '--disable-gpu-compositing',
      '--disable-gpu-rasterization',
      '--disable-gpu-sandbox',
      '--disable-software-rasterizer',
    ]),

    // 2. 禁用各种后台服务和功能
    '--disable-background-networking',          // 禁用后台网络
    '--disable-background-timer-throttling',    // 禁用后台定时器节流
    '--disable-backgrounding-occluded-windows', // 禁用隐藏窗口后台化
    '--disable-breakpad',                       // 禁用崩溃报告
    '--disable-client-side-phishing-detection', // 禁用钓鱼检测
    '--disable-component-extensions-with-background-pages', // 禁用后台扩展
    '--disable-default-apps',                   // 禁用默认应用
    '--disable-domain-reliability',             // 禁用域名可靠性服务
    '--disable-extensions',                     // 禁用扩展（可节省 50-100MB）
    '--disable-features=TranslateUI',           // 禁用翻译功能
    '--disable-hang-monitor',                   // 禁用挂起监控
    '--disable-ipc-flooding-protection',        // 禁用 IPC 洪水保护
    '--disable-popup-blocking',                 // 禁用弹窗阻止
    '--disable-prompt-on-repost',               // 禁用重新提交提示
    '--disable-renderer-backgrounding',         // 禁用渲染器后台化
    '--disable-sync',                           // 禁用同步
    '--disable-web-security',                   // 禁用 Web 安全（仅爬虫使用）

    // 3. 禁用各种通知和提示
    '--disable-notifications',                  // 禁用通知
    '--disable-component-update',               // 禁用组件更新
    '--disable-features=PrivacySandboxSettings4', // 禁用隐私沙盒

    // 4. 音频/视频优化（可节省 50-100MB）
    '--autoplay-policy=no-user-gesture-required', // 自动播放策略
    '--disable-audio-output',                   // 禁用音频输出（如不需要音频）
    // '--mute-audio',                          // 静音（可选）

    // 5. 缓存优化
    `--disk-cache-size=${diskCacheSize * 1024 * 1024}`,   // 磁盘缓存大小
    `--media-cache-size=${memoryCacheSize * 1024 * 1024}`, // 媒体缓存大小

    // 6. 进程模型优化
    // 单进程模式根据 singleProcess 参数决定
    ...(options.singleProcess ? [
      '--single-process',                       // ⚠️ 单进程模式（节省最多内存，但稳定性降低）
    ] : [
      // '--process-per-site',                  // 每个站点一个进程（平衡方案）
      '--renderer-process-limit=2',             // 限制渲染进程数量为2（平衡内存和稳定性）
    ]),

    // 7. 禁用不需要的功能
    '--disable-features=IsolateOrigins,site-per-process', // 禁用站点隔离（节省进程）
    '--disable-site-isolation-trials',          // 禁用站点隔离试验
    '--disable-web-resources',                  // 禁用 Web 资源
    '--disable-databases',                      // 禁用数据库（如不需要 IndexedDB）

    // 8. 其他优化
    '--metrics-recording-only',                 // 仅记录指标
    '--no-default-browser-check',               // 不检查默认浏览器
    '--no-first-run',                           // 跳过首次运行
    '--no-pings',                               // 禁用 ping
    '--password-store=basic',                   // 基础密码存储
    '--use-mock-keychain',                      // 使用模拟钥匙链
  ];

  // 9. 图片优化（如果爬虫不需要图片，可以禁用）
  if (!enableImages) {
    args.push('--blink-settings=imagesEnabled=false');
  }

  return args.filter(Boolean);
}

/**
 * 获取内存优化的上下文选项
 * @param {Object} options - 配置选项
 * @returns {Object} 优化后的上下文选项
 */
function getMemoryOptimizedContextOptions(options = {}) {
  return {
    // 禁用 JavaScript（仅当爬虫不需要 JS 时）
    // javaScriptEnabled: false,

    // 禁用图片（如果不需要）
    // 注意：很多网站依赖图片加载触发逻辑，建议保留
    // ignoreDefaultArgs: ['--enable-automation'],

    // 减少视口大小（更小的视口 = 更少的渲染内存）
    // viewport: { width: 1024, height: 768 }, // 从 1920x1080 降低到 1024x768

    // Service Worker 优化
    serviceWorkers: 'block', // 阻止 Service Workers（可节省内存）

    // 其他选项
    bypassCSP: false,        // 不绕过 CSP（更安全）
    ignoreHTTPSErrors: true, // 忽略 HTTPS 错误
  };
}

/**
 * 预设配置
 */
const PRESETS = {
  // 最大内存节省（约 150-250MB/账户）
  // ⚠️ 稳定性较差，可能导致崩溃
  MAXIMUM_SAVINGS: {
    enableGPU: false,
    enableImages: false,
    diskCacheSize: 20,
    memoryCacheSize: 10,
    singleProcess: true,  // 使用单进程模式
  },

  // 平衡模式（约 200-350MB/账户）
  // ✅ 推荐：在内存节省和稳定性之间取得平衡
  BALANCED: {
    enableGPU: false,
    enableImages: true,
    diskCacheSize: 50,
    memoryCacheSize: 20,
    singleProcess: false, // 使用多进程以提高稳定性
  },

  // 最小优化（约 300-500MB/账户）
  // 仅禁用明显不需要的功能
  MINIMAL: {
    enableGPU: true,
    enableImages: true,
    diskCacheSize: 100,
    memoryCacheSize: 50,
    singleProcess: false,
  },
};

/**
 * 获取推荐的优化配置
 * @param {string} preset - 预设名称 ('MAXIMUM_SAVINGS' | 'BALANCED' | 'MINIMAL')
 * @returns {Object} 完整的优化配置
 */
function getOptimizedConfig(preset = 'BALANCED') {
  const presetConfig = PRESETS[preset] || PRESETS.BALANCED;

  return {
    args: getMemoryOptimizedArgs(presetConfig),
    contextOptions: getMemoryOptimizedContextOptions(presetConfig),
    preset,
    estimatedMemory: {
      MAXIMUM_SAVINGS: '150-250MB',
      BALANCED: '200-350MB',
      MINIMAL: '300-500MB',
    }[preset],
  };
}

module.exports = {
  getMemoryOptimizedArgs,
  getMemoryOptimizedContextOptions,
  getOptimizedConfig,
  PRESETS,
};
