/**
 * Worker进程入口
 * 负责社交媒体账户监控和消息检测
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const SocketClient = require('./communication/socket-client');
const WorkerRegistration = require('./communication/registration');
const HeartbeatSender = require('./communication/heartbeat');
const TaskRunner = require('./handlers/task-runner');
const { getBrowserManager, getArchitectureInfo } = require('./config/browser-config');
const WorkerBridge = require('./platforms/base/worker-bridge');
const PlatformManager = require('./platform-manager');
const AccountInitializer = require('./handlers/account-initializer');
const AccountStatusReporter = require('./handlers/account-status-reporter');
const IsNewPushTask = require('./tasks/is-new-push-task');
const { getCacheManager } = require('./services/cache-manager');
const { MASTER_TASK_ASSIGN, MASTER_TASK_REVOKE, MASTER_ACCOUNT_LOGOUT, WORKER_ACCOUNT_LOGOUT_ACK, createMessage } = require('@hiscrm-im/shared/protocol/messages');
const { MESSAGE } = require('@hiscrm-im/shared/protocol/events');
const ChromeDevToolsMCP = require('./debug/chrome-devtools-mcp');
const debugConfig = require('./config/debug-config');
const { TabTag } = require('./browser/tab-manager');

// 初始化logger
const logger = createLogger('worker', './logs');

// 配置
const WORKER_ID = process.env.WORKER_ID || `worker-${uuidv4().slice(0, 8)}`;
const MASTER_HOST = process.env.MASTER_HOST || 'localhost';
const MASTER_PORT = process.env.MASTER_PORT || 3000;
const WORKER_PORT = process.env.WORKER_PORT || 4000;

// 全局实例
let socketClient;
let workerRegistration;
let heartbeatSender;
let taskRunner;
let browserManager;
let workerBridge;
let platformManager;
let accountInitializer;
let accountStatusReporter;
let isNewPushTask;
let chromeDevToolsMCP; // Chrome DevTools MCP 调试接口

// ⭐ 账户配置缓存（accountId -> account对象）
const accountsCache = new Map();

/**
 * ⭐ 重新加载账户配置（从Master获取最新配置）
 * @param {string} accountId - 账户ID
 * @returns {Promise<Object|null>} 返回更新后的账户对象，失败返回null
 */
async function reloadAccountConfig(accountId) {
  try {
    logger.info(`🔄 Reloading configuration for account ${accountId}...`);

    // 1. 从Master获取最新账户配置
    if (!workerRegistration) {
      logger.error('WorkerRegistration not initialized, cannot reload account config');
      return null;
    }

    // 通过WorkerRegistration获取最新的账户列表
    const updatedAccounts = await workerRegistration.register();

    // 2. 查找目标账户的新配置
    const updatedAccount = updatedAccounts.find(acc => acc.id === accountId);
    if (!updatedAccount) {
      logger.warn(`Account ${accountId} not found in updated accounts list`);
      return null;
    }

    // 3. 更新缓存
    accountsCache.set(accountId, updatedAccount);
    logger.info(`✅ Account config reloaded for ${accountId}`, {
      platform_user_id: updatedAccount.platform_user_id || '(still missing)',
      login_status: updatedAccount.login_status,
    });

    // 4. 通知taskRunner更新任务配置
    if (taskRunner) {
      taskRunner.updateAccountConfig(accountId, updatedAccount);
      logger.info(`✅ Task runner config updated for account ${accountId}`);
    }

    return updatedAccount;
  } catch (error) {
    logger.error(`Failed to reload account config for ${accountId}:`, error);
    return null;
  }
}

/**
 * 启动Worker
 */
async function start() {
  try {
    // 打印Debug配置信息（如果Debug模式启用）
    if (debugConfig.enabled) {
      debugConfig.print();
    }

    logger.info(`╔═══════════════════════════════════════════╗`);
    logger.info(`║  Worker Starting                          ║`);
    logger.info(`╠═══════════════════════════════════════════╣`);
    logger.info(`║  Worker ID: ${WORKER_ID.padEnd(29)} ║`);
    logger.info(`║  Master: ${MASTER_HOST}:${MASTER_PORT}${' '.repeat(21 - MASTER_HOST.length - MASTER_PORT.toString().length)} ║`);
    logger.info(`╚═══════════════════════════════════════════╝`);

    // 显示浏览器架构信息
    const archInfo = getArchitectureInfo();
    logger.info(`\n🔧 浏览器架构: ${archInfo.name}`);
    logger.info(`   ${archInfo.description}`);
    logger.info(`   指纹隔离: ${archInfo.fingerprint_isolation}`);
    logger.info(`   内存占用: ${archInfo.memory_per_account}`);
    logger.info(`   启动时间: ${archInfo.startup_time}`);
    logger.info(`   建议最大账户数: ${archInfo.max_recommended_accounts}\n`);

    // 1. 初始化Socket.IO客户端
    socketClient = new SocketClient(MASTER_HOST, MASTER_PORT, WORKER_ID);
    await socketClient.connect();
    logger.info('✓ Connected to master');

    // 2. 初始化浏览器管理器（在注册前初始化）
    // 如果Debug模式启用，使用Debug配置的headless设置；否则使用环境变量
    const headless = debugConfig.enabled ? debugConfig.browser.headless : (process.env.HEADLESS !== 'false');
    browserManager = getBrowserManager(WORKER_ID, {
      headless: headless,
      dataDir: `./data/browser/${WORKER_ID}`,  // Worker 专属目录,实现数据隔离
      devtools: debugConfig.enabled ? debugConfig.browser.devtools : false,
    });
    // 不立即启动浏览器，等到需要时再启动
    logger.info('✓ Browser manager initialized');

    // 3. 启动心跳发送器
    heartbeatSender = new HeartbeatSender(socketClient, WORKER_ID);
    heartbeatSender.start();
    logger.info('✓ Heartbeat sender started');

    // 4. 初始化 Worker Bridge
    workerBridge = new WorkerBridge(socketClient, WORKER_ID);
    logger.info('✓ Worker bridge initialized');

    // 5. 初始化平台管理器并加载平台脚本
    platformManager = new PlatformManager(workerBridge, browserManager);
    await platformManager.loadPlatforms();
    
    const supportedPlatforms = platformManager.getSupportedPlatforms();
    logger.info(`✓ Platform manager initialized with platforms: ${supportedPlatforms.join(', ')}`);

    // 6. 初始化账号初始化器
    accountInitializer = new AccountInitializer(browserManager, platformManager);
    logger.info('✓ Account initializer created');

    // 7. 注册Worker（使用动态加载的平台能力）
    workerRegistration = new WorkerRegistration(socketClient, WORKER_ID, {
      host: '127.0.0.1',
      port: WORKER_PORT,
      version: '1.0.0',
      capabilities: supportedPlatforms, // 动态获取支持的平台
      maxAccounts: 10,
    });

    const assignedAccounts = await workerRegistration.register();
    logger.info(`✓ Registered with master (${assignedAccounts.length} accounts assigned)`);

    // ⭐ 7.5 填充账户配置缓存
    for (const account of assignedAccounts) {
      accountsCache.set(account.id, account);
    }
    logger.info(`✓ Cached ${accountsCache.size} account configurations`);

    // ⭐ 7.6 注册配置更新处理器
    const { MASTER_ACCOUNT_CONFIG_UPDATE, MASTER_ACCOUNT_CONFIG_UPDATE_ACK, createMessage } = require('@hiscrm-im/shared/protocol/messages');
    socketClient.onMessage(MASTER_ACCOUNT_CONFIG_UPDATE, async (msg) => {
      const { account_id, reason, updated_fields } = msg.payload;
      logger.info(`📥 Received config update for account ${account_id}, reason: ${reason}, fields: ${updated_fields?.join(', ')}`);

      // 重新加载账户配置
      const updated = await reloadAccountConfig(account_id);

      // 发送确认
      const ackMessage = createMessage(MASTER_ACCOUNT_CONFIG_UPDATE_ACK, {
        account_id,
        success: !!updated,
        reloaded_at: Date.now(),
      });
      socketClient.sendMessage(ackMessage);
    });
    logger.info(`✓ Registered config update handler`);

    // 8. 为所有分配的账号初始化浏览器环境
    logger.info(`Initializing browsers for ${assignedAccounts.length} accounts...`);
    const initResults = await accountInitializer.initializeAccounts(assignedAccounts);
    const successCount = initResults.filter(r => r.success).length;
    logger.info(`✓ Browsers initialized: ${successCount}/${assignedAccounts.length} succeeded`);

    // 9. 初始化平台和 DataManager（为所有已分配账户）
    logger.info('Initializing platforms and DataManagers for assigned accounts...');
    for (const account of assignedAccounts) {
      logger.info(`Processing account ${account.id}, initialized: ${accountInitializer.isInitialized(account.id)}`);
      if (accountInitializer.isInitialized(account.id)) {
        try {
          logger.info(`Getting platform for ${account.platform}...`);
          const platform = platformManager.getPlatform(account.platform);
          logger.info(`Platform found: ${!!platform}, type: ${platform ? platform.constructor.name : 'null'}`);

          if (platform) {
            logger.info(`Calling platform.initialize() for account ${account.id}...`);
            logger.info(`platform.initialize is a function: ${typeof platform.initialize === 'function'}`);
            logger.info(`platform.dataManagers before: ${platform.dataManagers ? platform.dataManagers.size : 'undefined'}`);

            const result = await platform.initialize(account);

            logger.info(`platform.initialize() returned: ${result}`);
            logger.info(`platform.dataManagers after: ${platform.dataManagers ? platform.dataManagers.size : 'undefined'}`);
            logger.info(`✓ Platform initialized for account ${account.id}`);
          } else {
            logger.warn(`Platform ${account.platform} not found for account ${account.id}`);
          }
        } catch (error) {
          logger.error(`Failed to initialize platform for account ${account.id}:`, error);
          logger.error(`Error stack:`, error.stack);
        }
      }
    }
    logger.info('✓ Platform initialization completed');

    // 10. 初始化账号状态上报器（在 TaskRunner 之前创建）
    accountStatusReporter = new AccountStatusReporter(socketClient.socket, WORKER_ID);

    // 11. 启动任务执行器（传入 platformManager、accountStatusReporter 和 browserManager）
    taskRunner = new TaskRunner(socketClient, heartbeatSender, platformManager, accountStatusReporter, browserManager);
    taskRunner.start();
    logger.info('✓ Task runner started');

    // 12. 添加已成功初始化的账户到任务执行器
    // 检查是否启用独立登录检测
    const loginCheckEnabled = process.env.LOGIN_CHECK_ENABLED === 'true';
    logger.info(`Login check mode: ${loginCheckEnabled ? 'Independent' : 'Legacy'}`);
    
    let addedTasksCount = 0;
    const initializedAccounts = [];
    
    for (const account of assignedAccounts) {
      if (accountInitializer.isInitialized(account.id)) {
        // 先添加任务，但不启动登录检测（等账户完全就绪）
        await taskRunner.addTask(account, { startLoginDetection: false });
        addedTasksCount++;
        initializedAccounts.push(account);
      } else {
        logger.warn(`Skipping task for account ${account.id} (browser initialization failed)`);
      }
    }
    logger.info(`✓ Added ${addedTasksCount} ${loginCheckEnabled ? 'login detection + monitoring' : 'monitoring'} tasks`);

    // ⭐ 所有账户任务添加完成后，统一启动登录检测任务
    if (loginCheckEnabled && initializedAccounts.length > 0) {
      logger.info(`Starting login detection for ${initializedAccounts.length} accounts...`);
      for (const account of initializedAccounts) {
        await taskRunner.startLoginDetection(account.id);
      }
      logger.info(`✓ Login detection started for all accounts`);
    }

    // 12. 检查登录状态并上报给 Master（仅在传统模式下）
    if (!loginCheckEnabled) {
      logger.info('Checking login status for all accounts (legacy mode)...');
      for (const account of assignedAccounts) {
        if (accountInitializer.isInitialized(account.id)) {
          try {
            // 获取平台实例
            const platform = platformManager.getPlatform(account.platform);
            if (!platform) {
              logger.warn(`Platform ${account.platform} not found for account ${account.id}`);
              continue;
            }

            // 获取浏览器上下文
            const context = browserManager.contexts.get(account.id);
            if (!context) {
              logger.warn(`Browser context not found for account ${account.id}`);
              continue;
            }

            // 获取账户页面（Spider1）
            // ⭐ getAccountPage() 现在会自动导航到创作中心，无需手动导航
            const page = await browserManager.getAccountPage(account.id);
            if (!page) {
              logger.warn(`Account page not found for account ${account.id}`);
              continue;
            }

            // 检查登录状态（页面已由 getAccountPage() 导航到创作中心）
            logger.info(`Checking login status for account ${account.id}...`);
            const loginStatus = await platform.checkLoginStatus(page);

            if (loginStatus.isLoggedIn) {
              logger.info(`✓ Account ${account.id} is logged in - setting status to online`);
              accountStatusReporter.updateAccountStatus(account.id, {
                worker_status: 'online',
                login_status: 'logged_in'
              });
            } else {
              logger.warn(`✗ Account ${account.id} is NOT logged in - setting status to not_logged_in`);
              accountStatusReporter.recordError(account.id, 'Not logged in - login required');
              // 设置为离线状态并更新登录状态
              accountStatusReporter.updateAccountStatus(account.id, {
                worker_status: 'offline',
                login_status: 'not_logged_in'
              });
            }
          } catch (error) {
            logger.error(`Failed to check login status for account ${account.id}:`, error);
            accountStatusReporter.recordError(account.id, `Login check failed: ${error.message}`);
          }
        }
      }
    } else {
      logger.info('Skipping initial login status check (independent login detection enabled)');
    }

    // 13. 启动上报器（此时已有账号状态数据）
    accountStatusReporter.start();
    logger.info('✓ Account status reporter started');

    // 14. 初始化并启动 IsNewPushTask（用于新数据推送）
    const cacheManager = getCacheManager();
    isNewPushTask = new IsNewPushTask(cacheManager, workerBridge);
    isNewPushTask.start();
    logger.info('✓ IsNewPushTask started (new data push scanning every 60s)');

    // 15. 监听任务分配消息
    socketClient.onMessage(MASTER_TASK_ASSIGN, (msg) => {
      handleTaskAssign(msg);
    });

    socketClient.onMessage(MASTER_TASK_REVOKE, (msg) => {
      handleTaskRevoke(msg);
    });

    socketClient.onMessage(MASTER_ACCOUNT_LOGOUT, (msg) => {
      handleAccountLogout(msg);
    });

    // 16. 监听登录请求
    socketClient.socket.on('master:login:start', (data) => {
      handleLoginRequest(data);
    });

    // 17. 监听用户输入（用于短信验证码等场景）
    socketClient.socket.on('master:login:user_input', (data) => {
      handleUserInput(data);
    });

    logger.info('╔═══════════════════════════════════════════╗');
    logger.info('║  Worker Ready                             ║');
    logger.info('╚═══════════════════════════════════════════╝');

    // 18. 启动 Chrome DevTools MCP 调试接口 (使用配置文件)
    if (debugConfig.mcp.enabled) {
      chromeDevToolsMCP = new ChromeDevToolsMCP(debugConfig.mcp.port);
      await chromeDevToolsMCP.start(WORKER_ID);
      logger.info(`🔍 Chrome DevTools MCP 调试接口已启动: http://${debugConfig.mcp.host}:${debugConfig.mcp.port}`);

      // 将 MCP 实例设置到 AccountInitializer，以便浏览器就绪时通知 MCP 客户端
      accountInitializer.chromeDevToolsMCP = chromeDevToolsMCP;
      logger.info(`✓ AccountInitializer linked to MCP for browser ready notifications`);
    }

    // 19. 启动浏览器健康检查（每 1 分钟检查一次）
    browserManager.startBrowserHealthCheck(60000);
    logger.info('✓ Browser health check started (interval: 60s)');

  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}

/**
 * 处理任务分配
 * @param {object} msg - 任务分配消息
 */
async function handleTaskAssign(msg) {
  const { payload } = msg;
  logger.info(`Received task assignment for account ${payload.id || payload.account_id}`);

  try {
    // payload 现在包含完整的账号数据
    const account = {
      id: payload.id || payload.account_id,
      platform: payload.platform,
      account_id: payload.account_id,
      account_name: payload.account_name,
      credentials: payload.credentials,
      monitor_interval: payload.monitor_interval,
      status: payload.status,
      login_status: payload.login_status,
      cookies_valid_until: payload.cookies_valid_until,
      user_info: payload.user_info,
      last_check_time: payload.last_check_time,
      last_login_time: payload.last_login_time,
    };

    // 1. 初始化浏览器环境
    logger.info(`Initializing browser for newly assigned account ${account.id}...`);
    await accountInitializer.initializeAccount(account);

    // 2. 初始化平台和 DataManager
    logger.info(`Initializing platform for account ${account.id}...`);
    const platform = platformManager.getPlatform(account.platform);
    if (platform) {
      await platform.initialize(account);
      logger.info(`✓ Platform initialized for account ${account.id}`);
    } else {
      logger.warn(`Platform ${account.platform} not found, skipping platform initialization`);
    }

    // 3. 添加到注册表
    workerRegistration.addAccount(account);

    // 4. 添加到任务执行器
    taskRunner.addTask(account);

    logger.info(`✓ Successfully added monitoring task for account ${account.id}`);

  } catch (error) {
    logger.error(`Failed to handle task assignment for account ${payload.id || payload.account_id}:`, error);
  }
}

/**
 * 处理任务撤销
 * @param {object} msg - 任务撤销消息
 */
async function handleTaskRevoke(msg) {
  const { payload } = msg;
  logger.info(`Received task revoke for account ${payload.account_id}`);

  try {
    // 1. 从任务执行器移除
    taskRunner.removeTask(payload.account_id);

    // 2. 从注册表移除
    workerRegistration.removeAccount(payload.account_id);

    // 3. 关闭浏览器并清理资源
    await accountInitializer.removeAccount(payload.account_id);

    logger.info(`✓ Successfully removed monitoring task for account ${payload.account_id}`);

  } catch (error) {
    logger.error(`Failed to handle task revoke for account ${payload.account_id}:`, error);
  }
}

/**
 * 处理登录请求
 * @param {object} data - 登录请求数据
 */
async function handleLoginRequest(data) {
  logger.info(`[handleLoginRequest] ========== START ==========`);
  logger.info(`[handleLoginRequest] Raw data:`, JSON.stringify(data, null, 2));

  const { account_id, session_id, platform, proxy } = data;

  try {
    logger.info(`[handleLoginRequest] Parsed: account_id=${account_id}, platform=${platform}, session_id=${session_id}`);

    // 如果有代理配置，记录日志
    if (proxy) {
      logger.info(`[handleLoginRequest] Using proxy: ${proxy.server}`);
    } else {
      logger.info(`[handleLoginRequest] No proxy configured`);
    }

    // 验证 platformManager
    if (!platformManager) {
      throw new Error('platformManager is not initialized');
    }
    logger.info(`[handleLoginRequest] platformManager is available`);

    // 获取对应平台实例
    logger.info(`[handleLoginRequest] Getting platform instance for: ${platform}`);
    const platformInstance = platformManager.getPlatform(platform);

    if (!platformInstance) {
      logger.error(`[handleLoginRequest] Platform ${platform} NOT FOUND!`);
      logger.error(`[handleLoginRequest] Available platforms:`, Object.keys(platformManager.platforms || {}));
      throw new Error(`Platform ${platform} not supported or not loaded`);
    }

    logger.info(`[handleLoginRequest] ✓ Platform instance found: ${platformInstance.config.displayName} (${platformInstance.config.platform})`);

    // 启动登录流程（传递代理配置）
    logger.info(`[handleLoginRequest] Calling startLogin()...`);
    await platformInstance.startLogin({
      accountId: account_id,
      sessionId: session_id,
      proxy: proxy
    });

    logger.info(`[handleLoginRequest] ✓ Login process started successfully`);
    logger.info(`[handleLoginRequest] ========== END (SUCCESS) ==========`);

  } catch (error) {
    logger.error(`[handleLoginRequest] ========== END (ERROR) ==========`);
    logger.error(`[handleLoginRequest] FATAL ERROR for account ${account_id}:`, error.message);
    logger.error(`[handleLoginRequest] Error stack:`, error.stack);

    // 确保发送登录失败事件
    try {
      workerBridge.sendLoginStatus(session_id, 'failed', {
        account_id: account_id,
        error_message: error.message
      });
      logger.info(`[handleLoginRequest] Sent failure status to Master`);
    } catch (sendError) {
      logger.error(`[handleLoginRequest] Failed to send error status:`, sendError);
    }
  }
}

/**
 * 处理用户输入（短信验证码等）
 * @param {object} data - 用户输入数据
 */
function handleUserInput(data) {
  const { session_id, input_type, value } = data;

  try {
    logger.info(`Received user input for session ${session_id}, type: ${input_type}`);

    // 触发 WorkerBridge 的用户输入回调
    workerBridge.triggerUserInput(session_id, input_type, value);

    logger.info(`User input handled for session ${session_id}`);
  } catch (error) {
    logger.error(`Failed to handle user input for session ${session_id}:`, error);
  }
}

/**
 * 处理账号退出请求
 * @param {object} msg - 退出请求消息
 */
async function handleAccountLogout(msg) {
  const { payload } = msg;
  const { account_id } = payload;

  try {
    logger.info(`Received logout request for account ${account_id}`);

    // TODO: 实现退出登录逻辑
    // 1. 获取对应的平台实例
    // 2. 调用平台的退出登录方法（清除 cookies、session 等）
    // 3. 关闭对应账号的浏览器实例
    // 4. 更新账号状态为未登录

    logger.info(`[TODO] Logout logic not implemented yet for account ${account_id}`);

    // 发送确认消息
    const ackMessage = createMessage(WORKER_ACCOUNT_LOGOUT_ACK, {
      success: true,
      account_id,
      message: 'Logout request received (not yet implemented)',
    });

    socketClient.socket.emit(MESSAGE, ackMessage);
    logger.info(`Sent logout ACK for account ${account_id}`);

  } catch (error) {
    logger.error(`Failed to handle logout request for account ${account_id}:`, error);

    // 发送失败确认
    const ackMessage = createMessage(WORKER_ACCOUNT_LOGOUT_ACK, {
      success: false,
      account_id,
      error: error.message,
    });

    socketClient.socket.emit(MESSAGE, ackMessage);
  }
}

/**
 * 优雅关闭
 */
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);

  // 停止 IsNewPushTask
  if (isNewPushTask) {
    isNewPushTask.stop();
    logger.info('IsNewPushTask stopped');
  }

  // 停止任务执行器
  if (taskRunner) {
    taskRunner.stop();
    logger.info('Task runner stopped');
  }

  // 停止心跳
  if (heartbeatSender) {
    heartbeatSender.stop();
    logger.info('Heartbeat sender stopped');
  }

  // 停止账号状态上报器
  if (accountStatusReporter) {
    accountStatusReporter.stop();
    logger.info('Account status reporter stopped');
  }

  // 停止浏览器健康检查
  if (browserManager) {
    browserManager.stopBrowserHealthCheck();
    logger.info('Browser health check stopped');
  }

  // 关闭所有浏览器实例
  if (browserManager) {
    await browserManager.closeAll();
    logger.info('All browsers closed');
  }

  // 关闭 Chrome DevTools MCP 调试接口
  if (chromeDevToolsMCP) {
    await chromeDevToolsMCP.stop();
    logger.info('Chrome DevTools MCP stopped');
  }

  // 断开Socket连接
  if (socketClient) {
    socketClient.disconnect();
    logger.info('Disconnected from master');
  }

  logger.info('Shutdown complete');
  process.exit(0);
}

// 注册信号处理
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// 启动Worker
start();

// ⭐ 导出 TabTag 供平台代码使用
module.exports = {
  TabTag,
  getBrowserManager: () => browserManager,
};
