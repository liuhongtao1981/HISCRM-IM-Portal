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
const BrowserManager = require('./browser/browser-manager');
const DouyinLoginHandler = require('./browser/douyin-login-handler');
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
let loginHandler;

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

    // 1. 初始化Socket.IO客户端
    socketClient = new SocketClient(MASTER_HOST, MASTER_PORT, WORKER_ID);
    await socketClient.connect();
    logger.info('✓ Connected to master');

    // 2. 注册Worker
    workerRegistration = new WorkerRegistration(socketClient, WORKER_ID, {
      host: '127.0.0.1',
      port: WORKER_PORT,
      version: '1.0.0',
      capabilities: ['douyin'],
      maxAccounts: 10,
    });

    const assignedAccounts = await workerRegistration.register();
    logger.info(`✓ Registered with master (${assignedAccounts.length} accounts assigned)`);

    // 3. 启动心跳发送器
    heartbeatSender = new HeartbeatSender(socketClient, WORKER_ID);
    heartbeatSender.start();
    logger.info('✓ Heartbeat sender started');

    // 4. 初始化浏览器管理器
    browserManager = new BrowserManager(WORKER_ID, {
      headless: process.env.HEADLESS !== 'false', // 默认 headless
      dataDir: `./data/browser/${WORKER_ID}`,  // Worker 专属目录,实现数据隔离
    });
    // 不立即启动浏览器，等到需要时再启动
    logger.info('✓ Browser manager initialized');

    // 5. 初始化登录处理器
    loginHandler = new DouyinLoginHandler(browserManager, socketClient.socket);
    logger.info('✓ Login handler initialized');

    // 6. 启动任务执行器
    taskRunner = new TaskRunner(socketClient, heartbeatSender);
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
  const { account_id, session_id, proxy } = data;

  try {
    logger.info(`Received login request for account ${account_id}, session ${session_id}`);

    // 如果有代理配置，记录日志
    if (proxy) {
      logger.info(`Using proxy for account ${account_id}: ${proxy.server}`);
    }

    // 启动登录流程（传递代理配置）
    await loginHandler.startLogin(account_id, session_id, proxy);

    logger.info(`Login process started for account ${account_id}`);
  } catch (error) {
    logger.error(`Failed to handle login request for account ${account_id}:`, error);
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

  // 关闭浏览器
  if (browserManager) {
    await browserManager.close();
    logger.info('Browser closed');
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
