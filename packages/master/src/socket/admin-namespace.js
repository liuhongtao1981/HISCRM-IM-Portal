/**
 * Admin Namespace - Socket.IO 命名空间
 * 用于管理平台与 Master 之间的实时通信
 * 主要功能:
 * 1. 推送登录二维码给管理员
 * 2. 推送登录状态更新
 * 3. 系统状态监控
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('admin-namespace');

/**
 * 初始化 Admin Namespace
 * @param {SocketIO.Server} io - Socket.IO 服务器实例
 * @param {Object} masterServer - Master 服务器实例（用于访问数据库等）
 */
function initAdminNamespace(io, masterServer) {
  const adminNamespace = io.of('/admin');

  // 存储已连接的管理员客户端
  const adminClients = new Map();

  /**
   * 管理员连接事件
   */
  adminNamespace.on('connection', (socket) => {
    logger.info(`Admin client connected: ${socket.id}`);

    // 默认认证通过（后期可以加强认证机制）
    socket.authenticated = true;
    adminClients.set(socket.id, {
      socket,
      connectedAt: Date.now(),
      userId: socket.handshake.query.userId || 'anonymous',
    });

    // 发送欢迎消息
    socket.emit('admin:connected', {
      message: 'Connected to Master Admin Namespace',
      timestamp: Date.now(),
    });

    /**
     * 事件: admin:auth - 管理员认证
     * 简单的认证机制，后期可以增强为 JWT 或 OAuth
     */
    socket.on('admin:auth', (data) => {
      const { token, userId } = data;

      // TODO: 实现真实的认证逻辑
      // 目前简单验证 token 是否存在
      if (token && token.length > 0) {
        socket.authenticated = true;
        const client = adminClients.get(socket.id);
        if (client) {
          client.userId = userId || 'anonymous';
        }
        socket.emit('admin:auth:success', {
          userId,
          timestamp: Date.now(),
        });
        logger.info(`Admin authenticated: ${userId} (socket: ${socket.id})`);

        // 发送测试通知，验证推送功能
        setTimeout(() => {
          socket.emit('notification:new', {
            id: `test-${Date.now()}`,
            type: 'system',
            content: '🎉 连接成功！通知推送功能正常工作',
            timestamp: Date.now(),
          });
          logger.info(`✅ Test notification sent to admin ${userId} (socket: ${socket.id})`);
        }, 500); // 延迟500ms发送，确保客户端已准备好接收
      } else {
        socket.authenticated = false;
        socket.emit('admin:auth:failed', {
          error: 'Invalid token',
          timestamp: Date.now(),
        });
        logger.warn(`Admin auth failed: ${socket.id}`);
      }
    });

    /**
     * 事件: admin:status:request - 请求系统状态
     */
    socket.on('admin:status:request', async () => {
      try {
        if (!socket.authenticated) {
          socket.emit('admin:error', { error: 'Not authenticated' });
          return;
        }

        const db = masterServer.db;

        // Workers 统计 - 只统计在 worker_configs 中配置的 worker
        const totalWorkers = db.prepare('SELECT COUNT(*) as count FROM worker_configs').get().count;
        const onlineWorkers = db.prepare(`
          SELECT COUNT(*) as count
          FROM workers w
          INNER JOIN worker_configs wc ON w.id = wc.worker_id
          WHERE w.status = ?
        `).get('online').count;
        const offlineWorkers = totalWorkers - onlineWorkers;

        // 账户统计
        const totalAccounts = db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
        const activeAccounts = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE status = ?').get('active').count;
        const loggedInAccounts = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE login_status = ?').get('logged_in').count;
        const notLoggedInAccounts = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE login_status = ?').get('not_logged_in').count;
        const loginFailedAccounts = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE login_status = ?').get('login_failed').count;

        // 按 worker_status 统计账户
        const onlineAccountsCount = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE worker_status = ?').get('online').count;
        const offlineAccountsCount = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE worker_status = ?').get('offline').count;
        const errorAccountsCount = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE worker_status = ?').get('error').count;

        // 运行时统计
        const totalComments = db.prepare('SELECT SUM(total_comments) as sum FROM accounts').get().sum || 0;
        const totalWorks = db.prepare('SELECT SUM(total_works) as sum FROM accounts').get().sum || 0;
        const totalFollowers = db.prepare('SELECT SUM(total_followers) as sum FROM accounts').get().sum || 0;

        // 登录会话统计
        const pendingLoginSessions = db.prepare('SELECT COUNT(*) as count FROM login_sessions WHERE status IN (?, ?)').get('pending', 'scanning').count;
        const successLoginSessions = db.prepare('SELECT COUNT(*) as count FROM login_sessions WHERE status = ?').get('success').count;
        const failedLoginSessions = db.prepare('SELECT COUNT(*) as count FROM login_sessions WHERE status = ?').get('failed').count;

        // 平台统计
        const platformStats = db.prepare(`
          SELECT platform, COUNT(*) as count
          FROM accounts
          GROUP BY platform
        `).all();

        const status = {
          workers: {
            total: totalWorkers,
            online: onlineWorkers,
            offline: offlineWorkers,
          },
          accounts: {
            total: totalAccounts,
            active: activeAccounts,
            inactive: totalAccounts - activeAccounts,
            loggedIn: loggedInAccounts,
            notLoggedIn: notLoggedInAccounts,
            loginFailed: loginFailedAccounts,
            // 按 worker_status 分类
            onlineStatus: onlineAccountsCount,
            offlineStatus: offlineAccountsCount,
            errorStatus: errorAccountsCount,
          },
          runtime: {
            totalComments,
            totalWorks,
            totalFollowers,
          },
          loginSessions: {
            pending: pendingLoginSessions,
            success: successLoginSessions,
            failed: failedLoginSessions,
            total: pendingLoginSessions + successLoginSessions + failedLoginSessions,
          },
          platforms: platformStats.reduce((acc, item) => {
            acc[item.platform] = item.count;
            return acc;
          }, {}),
          timestamp: Date.now(),
        };

        socket.emit('admin:status:response', status);
        logger.debug(`System status sent to admin ${socket.id}`);

      } catch (error) {
        logger.error('Error fetching system status:', error);
        socket.emit('admin:error', {
          error: 'Failed to fetch system status',
          message: error.message,
        });
      }
    });

    /**
     * 事件: admin:login_sessions:list - 获取登录会话列表
     */
    socket.on('admin:login_sessions:list', async () => {
      try {
        if (!socket.authenticated) {
          socket.emit('admin:error', { error: 'Not authenticated' });
          return;
        }

        const db = masterServer.db;
        const sessions = db.prepare(`
          SELECT
            ls.*,
            a.account_name,
            a.platform,
            w.id as worker_name
          FROM login_sessions ls
          LEFT JOIN accounts a ON ls.account_id = a.id
          LEFT JOIN workers w ON ls.worker_id = w.id
          WHERE ls.status IN ('pending', 'scanning')
          ORDER BY ls.created_at DESC
          LIMIT 50
        `).all();

        socket.emit('admin:login_sessions:list:response', {
          sessions,
          timestamp: Date.now(),
        });

      } catch (error) {
        logger.error('Error fetching login sessions:', error);
        socket.emit('admin:error', {
          error: 'Failed to fetch login sessions',
          message: error.message,
        });
      }
    });

    /**
     * 事件: master:login:start - 启动登录流程
     * Admin Web 请求启动登录 → Master → Worker
     */
    socket.on('master:login:start', async (data) => {
      try {
        if (!socket.authenticated) {
          socket.emit('admin:error', { error: 'Not authenticated' });
          return;
        }

        const { account_id, worker_id, session_id } = data;

        logger.info(`Admin ${socket.id} requested login for account ${account_id}, worker ${worker_id}, session ${session_id}`);

        // 查询账户信息获取平台
        const db = masterServer.db;
        const account = db.prepare('SELECT platform FROM accounts WHERE id = ?').get(account_id);
        
        if (!account) {
          socket.emit('admin:error', { error: 'Account not found' });
          return;
        }

        // 创建登录会话记录
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + 300; // 5 分钟

        db.prepare(`
          INSERT INTO login_sessions (
            id, account_id, worker_id, status, expires_at, created_at, login_method
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(session_id, account_id, worker_id, 'pending', expiresAt, now, 'qrcode');

        // 更新账户状态为 pending_login
        db.prepare('UPDATE accounts SET login_status = ? WHERE id = ?').run('pending_login', account_id);

        // 查询 Worker 的代理配置（从 worker_configs 表获取）
        const workerConfig = db.prepare(`
          SELECT wc.proxy_id, p.server, p.protocol, p.username, p.password, p.name
          FROM worker_configs wc
          LEFT JOIN proxies p ON wc.proxy_id = p.id
          WHERE wc.worker_id = ?
        `).get(worker_id);

        let proxyConfig = null;
        if (workerConfig && workerConfig.server) {
          proxyConfig = {
            server: workerConfig.server,
            protocol: workerConfig.protocol,
            username: workerConfig.username || undefined,
            password: workerConfig.password || undefined,
          };
          logger.info(`Using proxy for worker ${worker_id}: ${workerConfig.name || workerConfig.server}`);
        } else {
          logger.info(`No proxy configured for worker ${worker_id}`);
        }

        // 转发到 Worker (通过 /worker 命名空间)
        const workerNamespace = io.of('/worker');
        const workerSockets = await workerNamespace.fetchSockets();

        // 找到对应的 Worker socket
        let sent = false;
        for (const workerSocket of workerSockets) {
          if (workerSocket.workerId === worker_id) {
            workerSocket.emit('master:login:start', {
              account_id,
              session_id,
              platform: account.platform,  // 添加平台参数
              proxy: proxyConfig,  // 添加代理配置
            });
            sent = true;
            logger.info(`Login request sent to worker ${worker_id} for platform ${account.platform}`);
            break;
          }
        }

        if (!sent) {
          logger.warn(`Worker ${worker_id} not found or offline`);
          socket.emit('admin:error', {
            error: 'Worker not available',
            message: `Worker ${worker_id} is offline or not connected`,
          });

          // 更新会话状态为失败
          db.prepare('UPDATE login_sessions SET status = ?, error_message = ? WHERE id = ?')
            .run('failed', 'Worker not available', session_id);
        } else {
          // 通知 Admin 请求已发送
          socket.emit('admin:login:start:ack', {
            account_id,
            worker_id,
            session_id,
            status: 'sent',
            timestamp: Date.now(),
          });
        }

      } catch (error) {
        logger.error('Error starting login:', error);
        socket.emit('admin:error', {
          error: 'Failed to start login',
          message: error.message,
        });
      }
    });

    /**
     * 事件: master:login:user_input - 用户输入（手机号、验证码等）
     * Admin Web 发送用户输入 → Master → Worker
     */
    socket.on('master:login:user_input', async (data) => {
      try {
        if (!socket.authenticated) {
          socket.emit('admin:error', { error: 'Not authenticated' });
          return;
        }

        const { session_id, input_type, value } = data;

        logger.info(`Admin ${socket.id} submitted user input for session ${session_id}, type: ${input_type}`);

        // 查询登录会话获取 worker_id
        const db = masterServer.db;
        const session = db.prepare('SELECT worker_id, account_id FROM login_sessions WHERE id = ?').get(session_id);

        if (!session) {
          socket.emit('admin:error', { error: 'Login session not found' });
          logger.warn(`Login session not found: ${session_id}`);
          return;
        }

        // 转发到对应的 Worker
        const workerNamespace = io.of('/worker');
        const workerSockets = await workerNamespace.fetchSockets();

        let sent = false;
        for (const workerSocket of workerSockets) {
          if (workerSocket.workerId === session.worker_id) {
            workerSocket.emit('master:login:user_input', {
              session_id,
              input_type,
              value,
            });
            sent = true;
            logger.info(`User input forwarded to worker ${session.worker_id} for session ${session_id}`);
            break;
          }
        }

        if (!sent) {
          logger.warn(`Worker ${session.worker_id} not found or offline for session ${session_id}`);
          socket.emit('admin:error', {
            error: 'Worker not available',
            message: `Worker ${session.worker_id} is offline`,
          });
        } else {
          // 通知 Admin 输入已接收
          socket.emit('admin:login:user_input:ack', {
            session_id,
            input_type,
            status: 'received',
            timestamp: Date.now(),
          });
        }

      } catch (error) {
        logger.error('Error handling user input:', error);
        socket.emit('admin:error', {
          error: 'Failed to handle user input',
          message: error.message,
        });
      }
    });

    /**
     * 断开连接
     */
    socket.on('disconnect', () => {
      adminClients.delete(socket.id);
      logger.info(`Admin client disconnected: ${socket.id}`);
    });

    /**
     * 错误处理
     */
    socket.on('error', (error) => {
      logger.error(`Admin socket error (${socket.id}):`, error);
    });
  });

  /**
   * Helper: 向所有已认证的管理员客户端广播消息
   * @param {string} event - 事件名称
   * @param {Object} data - 数据
   */
  function broadcastToAdmins(event, data) {
    let count = 0;
    adminClients.forEach((client) => {
      if (client.socket.authenticated) {
        client.socket.emit(event, data);
        count++;
      }
    });
    logger.debug(`Broadcast ${event} to ${count} admin clients`);
  }

  /**
   * Helper: 向特定管理员发送消息
   * @param {string} socketId - Socket ID
   * @param {string} event - 事件名称
   * @param {Object} data - 数据
   */
  function sendToAdmin(socketId, event, data) {
    const client = adminClients.get(socketId);
    if (client && client.socket.authenticated) {
      client.socket.emit(event, data);
      logger.debug(`Sent ${event} to admin ${socketId}`);
      return true;
    }
    return false;
  }

  // 返回 namespace 和辅助方法
  return {
    namespace: adminNamespace,
    broadcastToAdmins,
    sendToAdmin,
    getAdminClients: () => adminClients,
  };
}

module.exports = { initAdminNamespace };
