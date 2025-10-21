/**
 * Chrome DevTools MCP 调试接口
 *
 * 提供了一个可以在运行期间监控 Worker 行为的 MCP (Message Closer Protocol) 接口
 * 支持通过 Chrome DevTools 或其他客户端进行实时监控
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const http = require('http');
const WebSocket = require('ws');

const logger = createLogger('chrome-devtools-mcp');

class ChromeDevToolsMCP {
  constructor(port = 9222) {
    this.port = port;
    this.server = null;
    this.wsServer = null;
    this.wsClients = new Set(); // 连接的浏览器客户端
    this.connectedBrowsers = new Map(); // browserId -> browser info

    this.monitoringData = {
      worker: {
        id: null,
        startTime: null,
        uptime: 0,
        status: 'initializing',
      },
      accounts: new Map(),
      tasks: {
        active: [],
        completed: [],
        failed: [],
      },
      performance: {
        memoryUsage: {},
        taskExecutionTimes: [],
        crawlStats: {},
      },
      logs: [],
      maxLogs: 1000, // 最多保存 1000 条日志
      browserEvents: [], // 浏览器事件日志
      maxBrowserEvents: 500,
    };
  }

  /**
   * 启动 MCP 服务器（包含WebSocket支持用于浏览器直连调试）
   */
  async start(workerId) {
    this.monitoringData.worker.id = workerId;
    this.monitoringData.worker.startTime = Date.now();

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // 启用WebSocket服务器（用于浏览器直连调试）
    this.wsServer = new WebSocket.Server({ server: this.server });
    this.wsServer.on('connection', (ws, req) => {
      this.handleWebSocketConnection(ws, req);
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        logger.info(`Chrome DevTools MCP 调试接口启动成功`, {
          workerId,
          port: this.port,
          httpUrl: `http://localhost:${this.port}/`,
          wsUrl: `ws://localhost:${this.port}/`,
        });
        resolve();
      });

      this.server.on('error', (err) => {
        logger.error('Chrome DevTools MCP 启动失败:', err);
        reject(err);
      });
    });
  }

  /**
   * 处理WebSocket连接（浏览器直连调试）
   */
  handleWebSocketConnection(ws, req) {
    const browserId = `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info(`🔗 浏览器已连接到MCP调试接口`, { browserId });

    this.wsClients.add(ws);
    this.connectedBrowsers.set(browserId, {
      id: browserId,
      connectedAt: Date.now(),
      userAgent: req.headers['user-agent'],
      accountId: null,
    });

    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'welcome',
      browserId,
      message: 'Connected to MCP Debug Interface',
      timestamp: Date.now(),
    }));

    // 处理浏览器发送的消息
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        this.handleBrowserMessage(browserId, data, ws);
      } catch (error) {
        logger.error('WebSocket消息解析失败:', error);
      }
    });

    // 处理断开连接
    ws.on('close', () => {
      logger.info(`🔌 浏览器已断开连接`, { browserId });
      this.wsClients.delete(ws);
      this.connectedBrowsers.delete(browserId);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket错误:', error);
    });
  }

  /**
   * 处理浏览器消息
   */
  handleBrowserMessage(browserId, data, ws) {
    const { type, accountId, event, content } = data;

    // 更新浏览器信息
    const browserInfo = this.connectedBrowsers.get(browserId);
    if (browserInfo && accountId) {
      browserInfo.accountId = accountId;
    }

    // 处理不同类型的消息
    switch (type) {
      case 'register':
        logger.info(`🔍 浏览器已注册`, {
          browserId,
          accountId,
          capabilities: data.capabilities
        });
        break;

      case 'event':
        // 记录浏览器事件
        this.recordBrowserEvent({
          browserId,
          accountId,
          eventType: event,
          timestamp: Date.now(),
          details: content,
        });
        logger.debug(`[浏览器事件] ${event}`, { browserId, accountId });
        break;

      case 'log':
        // 记录浏览器日志
        const level = data.level || 'info';
        logger.log(level, `[浏览器] ${content}`, { browserId, accountId });
        break;

      default:
        logger.debug(`未知的浏览器消息类型: ${type}`);
    }
  }

  /**
   * 记录浏览器事件
   */
  recordBrowserEvent(event) {
    this.monitoringData.browserEvents.push({
      ...event,
      id: `${event.browserId}_${Date.now()}`,
    });

    if (this.monitoringData.browserEvents.length > this.monitoringData.maxBrowserEvents) {
      this.monitoringData.browserEvents.shift();
    }
  }

  /**
   * 获取浏览器连接URL（供Worker使用）
   */
  getConnectUrl(browserId = null) {
    return `ws://localhost:${this.port}/?browserId=${browserId || 'new'}`;
  }

  /**
   * 处理 HTTP 请求
   */
  handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const pathname = url.pathname;

    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // 路由处理
      if (pathname === '/') {
        this.serveHome(res);
      } else if (pathname === '/api/status') {
        this.handleStatus(res);
      } else if (pathname === '/api/accounts') {
        this.handleAccounts(res);
      } else if (pathname === '/api/tasks') {
        this.handleTasks(res);
      } else if (pathname === '/api/performance') {
        this.handlePerformance(res);
      } else if (pathname === '/api/logs') {
        this.handleLogs(res, url.searchParams);
      } else if (pathname === '/api/worker-info') {
        this.handleWorkerInfo(res);
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    } catch (error) {
      logger.error('MCP 请求处理错误:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }

  /**
   * 主页 HTML
   */
  serveHome(res) {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Worker 调试面板</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { text-align: center; margin-bottom: 30px; color: #58a6ff; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 20px;
        }
        .card h2 { font-size: 14px; color: #79c0ff; margin-bottom: 15px; }
        .stat { display: flex; justify-content: space-between; margin: 8px 0; font-size: 13px; }
        .stat-value { color: #79c0ff; font-weight: bold; }
        .table-container { margin-top: 30px; }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        th {
            background: #0d1117;
            color: #79c0ff;
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #30363d;
        }
        td {
            padding: 10px 12px;
            border-bottom: 1px solid #30363d;
        }
        tr:hover { background: #161b22; }
        .status-active { color: #3fb950; }
        .status-error { color: #f85149; }
        .btn {
            background: #238636;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            margin-right: 10px;
        }
        .btn:hover { background: #2ea043; }
        .log-panel {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 15px;
            max-height: 400px;
            overflow-y: auto;
            margin-top: 20px;
        }
        .log-entry {
            font-family: 'Courier New', monospace;
            font-size: 11px;
            margin: 3px 0;
            color: #8b949e;
        }
        .log-entry.info { color: #58a6ff; }
        .log-entry.warn { color: #d29922; }
        .log-entry.error { color: #f85149; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 Worker 实时监控面板</h1>

        <div class="grid">
            <div class="card">
                <h2>Worker 状态</h2>
                <div class="stat">
                    <span>Worker ID:</span>
                    <span class="stat-value" id="workerId">-</span>
                </div>
                <div class="stat">
                    <span>运行时间:</span>
                    <span class="stat-value" id="uptime">-</span>
                </div>
                <div class="stat">
                    <span>状态:</span>
                    <span class="stat-value status-active" id="status">-</span>
                </div>
                <div class="stat">
                    <span>内存使用:</span>
                    <span class="stat-value" id="memory">-</span>
                </div>
            </div>

            <div class="card">
                <h2>任务统计</h2>
                <div class="stat">
                    <span>活跃任务:</span>
                    <span class="stat-value" id="activeCount">0</span>
                </div>
                <div class="stat">
                    <span>已完成:</span>
                    <span class="stat-value" id="completedCount">0</span>
                </div>
                <div class="stat">
                    <span>失败任务:</span>
                    <span class="stat-value status-error" id="failedCount">0</span>
                </div>
            </div>

            <div class="card">
                <h2>账户信息</h2>
                <div class="stat">
                    <span>已登录账户:</span>
                    <span class="stat-value" id="accountCount">0</span>
                </div>
                <div class="stat">
                    <span>活跃监控:</span>
                    <span class="stat-value" id="monitoringCount">0</span>
                </div>
            </div>
        </div>

        <div style="text-align: center; margin: 20px 0;">
            <button class="btn" onclick="refreshData()">刷新数据</button>
            <button class="btn" onclick="clearLogs()">清除日志</button>
        </div>

        <div class="log-panel">
            <h3 style="margin-bottom: 10px; color: #79c0ff;">实时日志</h3>
            <div id="logs"></div>
        </div>
    </div>

    <script>
        async function refreshData() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();

                document.getElementById('workerId').textContent = data.worker.id;
                document.getElementById('uptime').textContent = formatUptime(data.worker.uptime);
                document.getElementById('status').textContent = data.worker.status;
                document.getElementById('memory').textContent = formatMemory(data.performance.memoryUsage.heapUsed);

                document.getElementById('activeCount').textContent = data.tasks.active.length;
                document.getElementById('completedCount').textContent = data.tasks.completed.length;
                document.getElementById('failedCount').textContent = data.tasks.failed.length;

                document.getElementById('accountCount').textContent = data.accounts.length;
                document.getElementById('monitoringCount').textContent = data.accounts.filter(a => a.monitoring).length;

                // 更新日志
                const logsDiv = document.getElementById('logs');
                logsDiv.innerHTML = data.logs.map(log =>
                    '<div class="log-entry ' + (log.level || 'info') + '">[' + log.time + '] ' + log.message + '</div>'
                ).join('');
                logsDiv.scrollTop = logsDiv.scrollHeight;
            } catch (error) {
                console.error('刷新数据失败:', error);
            }
        }

        function formatUptime(ms) {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            return hours + 'h ' + (minutes % 60) + 'm ' + (seconds % 60) + 's';
        }

        function formatMemory(bytes) {
            return (bytes / 1024 / 1024).toFixed(2) + ' MB';
        }

        function clearLogs() {
            if (confirm('确定要清除日志吗？')) {
                fetch('/api/logs', { method: 'DELETE' });
                refreshData();
            }
        }

        // 每 2 秒自动刷新
        setInterval(refreshData, 2000);
        refreshData();
    </script>
</body>
</html>
    `;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  /**
   * 获取 Worker 状态
   */
  handleStatus(res) {
    this.monitoringData.worker.uptime = Date.now() - this.monitoringData.worker.startTime;
    res.end(JSON.stringify(this.monitoringData));
  }

  /**
   * 获取账户信息
   */
  handleAccounts(res) {
    const accounts = Array.from(this.monitoringData.accounts.values());
    res.end(JSON.stringify({ accounts, count: accounts.length }));
  }

  /**
   * 获取任务信息
   */
  handleTasks(res) {
    res.end(JSON.stringify(this.monitoringData.tasks));
  }

  /**
   * 获取性能信息
   */
  handlePerformance(res) {
    this.monitoringData.performance.memoryUsage = process.memoryUsage();
    res.end(JSON.stringify(this.monitoringData.performance));
  }

  /**
   * 获取日志
   */
  handleLogs(res, params) {
    const level = params.get('level');
    let logs = this.monitoringData.logs;

    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    res.end(JSON.stringify({ logs, count: logs.length }));
  }

  /**
   * 获取 Worker 信息
   */
  handleWorkerInfo(res) {
    res.end(JSON.stringify({
      worker: this.monitoringData.worker,
      uptime: Date.now() - this.monitoringData.worker.startTime,
    }));
  }

  /**
   * 记录账户信息
   */
  logAccount(accountId, accountInfo) {
    this.monitoringData.accounts.set(accountId, {
      id: accountId,
      ...accountInfo,
      timestamp: Date.now(),
    });
  }

  /**
   * 记录任务
   */
  logTask(taskInfo) {
    const task = {
      id: taskInfo.id,
      type: taskInfo.type,
      status: taskInfo.status || 'pending',
      timestamp: Date.now(),
      ...taskInfo,
    };

    if (taskInfo.status === 'active') {
      this.monitoringData.tasks.active.push(task);
    } else if (taskInfo.status === 'completed') {
      this.monitoringData.tasks.completed.push(task);
      // 移除活跃任务
      this.monitoringData.tasks.active = this.monitoringData.tasks.active.filter(t => t.id !== task.id);
    } else if (taskInfo.status === 'failed') {
      this.monitoringData.tasks.failed.push(task);
      this.monitoringData.tasks.active = this.monitoringData.tasks.active.filter(t => t.id !== task.id);
    }
  }

  /**
   * 记录日志
   */
  addLog(message, level = 'info', context = {}) {
    const time = new Date().toLocaleTimeString('zh-CN');
    const log = {
      message,
      level,
      time,
      context,
    };

    this.monitoringData.logs.push(log);

    // 限制日志数量
    if (this.monitoringData.logs.length > this.monitoringData.maxLogs) {
      this.monitoringData.logs.shift();
    }
  }

  /**
   * 关闭服务器
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Chrome DevTools MCP 服务器已关闭');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = ChromeDevToolsMCP;
