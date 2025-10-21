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

    // 8. 为所有分配的账号初始化浏览器环境
    logger.info(`Initializing browsers for ${assignedAccounts.length} accounts...`);
    const initResults = await accountInitializer.initializeAccounts(assignedAccounts);
    const successCount = initResults.filter(r => r.success).length;
    logger.info(`✓ Browsers initialized: ${successCount}/${assignedAccounts.length} succeeded`);

    // 9. 初始化账号状态上报器（在 TaskRunner 之前创建）
    accountStatusReporter = new AccountStatusReporter(socketClient.socket, WORKER_ID);

    // 10. 启动任务执行器（传入 platformManager、accountStatusReporter 和 browserManager）
    taskRunner = new TaskRunner(socketClient, heartbeatSender, platformManager, accountStatusReporter, browserManager);
    taskRunner.start();
    logger.info('✓ Task runner started');

    // 11. 添加已成功初始化的账户到任务执行器
    let addedTasksCount = 0;
    for (const account of assignedAccounts) {
      if (accountInitializer.isInitialized(account.id)) {
        taskRunner.addTask(account);
        addedTasksCount++;
      } else {
        logger.warn(`Skipping task for account ${account.id} (browser initialization failed)`);
      }
    }
    logger.info(`✓ Added ${addedTasksCount} monitoring tasks`);

    // 12. 为所有账号设置初始在线状态（在启动前设置）
    for (const account of assignedAccounts) {
      if (accountInitializer.isInitialized(account.id)) {
        accountStatusReporter.setAccountOnline(account.id);
        logger.info(`Set account ${account.id} status to online`);
      }
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

    // 2. 添加到注册表
    workerRegistration.addAccount(account);

    // 3. 添加到任务执行器
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
  const { account_id, session_id, platform, proxy } = data;

  try {
    logger.info(`Received login request for account ${account_id}, platform ${platform}, session ${session_id}`);

    // 如果有代理配置，记录日志
    if (proxy) {
      logger.info(`Using proxy for account ${account_id}: ${proxy.server}`);
    }

    // 获取对应平台实例
    const platformInstance = platformManager.getPlatform(platform);
    if (!platformInstance) {
      throw new Error(`Platform ${platform} not supported or not loaded`);
    }

    // 启动登录流程（传递代理配置）
    await platformInstance.startLogin({
      accountId: account_id,
      sessionId: session_id,
      proxy,
    });

    logger.info(`Login process started for account ${account_id} on platform ${platform}`);
  } catch (error) {
    logger.error(`Failed to handle login request for account ${account_id}:`, error);
    // 发送登录失败事件
    workerBridge.sendLoginStatus(data.account_id, data.session_id, 'failed', error.message);
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
