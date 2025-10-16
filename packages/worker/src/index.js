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
const { MASTER_TASK_ASSIGN, MASTER_TASK_REVOKE } = require('@hiscrm-im/shared/protocol/messages');

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

/**
 * 启动Worker
 */
async function start() {
  try {
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
    browserManager = getBrowserManager(WORKER_ID, {
      headless: process.env.HEADLESS !== 'false',
      dataDir: `./data/browser/${WORKER_ID}`,
    });
    logger.info('✓ Browser manager initialized');

    // 3. 初始化 Worker Bridge
    // 3. 启动心跳发送器
    heartbeatSender = new HeartbeatSender(socketClient, WORKER_ID);
    heartbeatSender.start();
    logger.info('✓ Heartbeat sender started');

    // 4. 初始化浏览器管理器 (多Browser架构)
    browserManager = getBrowserManager(WORKER_ID, {
      headless: process.env.HEADLESS !== 'false', // 默认 headless
      dataDir: `./data/browser/${WORKER_ID}`,  // Worker 专属目录,实现数据隔离
    });
    // 不立即启动浏览器，等到需要时再启动
    logger.info('✓ Browser manager initialized');

    // 5. 初始化 Worker Bridge
    workerBridge = new WorkerBridge(socketClient, WORKER_ID);
    logger.info('✓ Worker bridge initialized');

    // 6. 初始化平台管理器并加载平台脚本
    platformManager = new PlatformManager(workerBridge, browserManager);
    await platformManager.loadPlatforms();
    
    const supportedPlatforms = platformManager.getSupportedPlatforms();
    logger.info(`✓ Platform manager initialized with platforms: ${supportedPlatforms.join(', ')}`);

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

    // 8. 启动任务执行器（传入 platformManager）
    taskRunner = new TaskRunner(socketClient, heartbeatSender, platformManager);
    taskRunner.start();
    logger.info('✓ Task runner started');

    // 7. 添加分配的账户到任务执行器
    for (const account of assignedAccounts) {
      taskRunner.addTask(account);
    }
    logger.info(`✓ Added ${assignedAccounts.length} monitoring tasks`);

    // 8. 监听任务分配消息
    socketClient.onMessage(MASTER_TASK_ASSIGN, (msg) => {
      handleTaskAssign(msg);
    });

    socketClient.onMessage(MASTER_TASK_REVOKE, (msg) => {
      handleTaskRevoke(msg);
    });

    // 9. 监听登录请求
    socketClient.socket.on('master:login:start', (data) => {
      handleLoginRequest(data);
    });

    // 10. 监听用户输入（用于短信验证码等场景）
    socketClient.socket.on('master:login:user_input', (data) => {
      handleUserInput(data);
    });

    logger.info('╔═══════════════════════════════════════════╗');
    logger.info('║  Worker Ready                             ║');
    logger.info('╚═══════════════════════════════════════════╝');
  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}

/**
 * 处理任务分配
 * @param {object} msg - 任务分配消息
 */
function handleTaskAssign(msg) {
  const { payload } = msg;
  logger.info(`Received task assignment for account ${payload.account_id}`);

  const account = {
    id: payload.account_id,
    platform: payload.platform,
    credentials: payload.account_credentials,
    monitor_interval: payload.monitor_interval,
  };

  workerRegistration.addAccount(account);
  taskRunner.addTask(account);

  logger.info(`Added monitoring task for account ${payload.account_id}`);
}

/**
 * 处理任务撤销
 * @param {object} msg - 任务撤销消息
 */
function handleTaskRevoke(msg) {
  const { payload } = msg;
  logger.info(`Received task revoke for account ${payload.account_id}`);

  workerRegistration.removeAccount(payload.account_id);
  taskRunner.removeTask(payload.account_id);

  logger.info(`Removed monitoring task for account ${payload.account_id}`);
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
 * 优雅关闭
 */
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);

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

  // 关闭所有浏览器实例
  if (browserManager) {
    await browserManager.closeAll();
    logger.info('All browsers closed');
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
