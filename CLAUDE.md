# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📌 项目规范 (Important Guidelines)

- **请使用中文回答** - Please respond in Chinese
- **所有文档放在 `/docs` 文件夹** - All documentation files go in `/docs` folder
  - 使用中文名称，例如: `01-FEATURE-功能名称.md`
  - 旧的或已完成的文档移到 `/docs/_archived/`
- **所有测试脚本放在 `/tests` 文件夹** - All test scripts go in `/tests` folder
  - 根目录不要创建 .js 测试文件
  - 格式: `test-功能名称.js` 或 `check-功能名称.js`

## Project Overview

HisCrm-IM is a Master-Worker distributed social media monitoring and notification system. It monitors comments and direct messages from social media platforms (currently Douyin/抖音) and provides real-time notifications to desktop and mobile clients.

**Key Architecture**: Master-Worker pattern with Socket.IO communication, SQLite database, Playwright/Puppeteer browser automation.

## Technology Stack

- **Runtime**: Node.js 18.x LTS (unified across all packages)
- **Package Manager**: npm workspaces (pnpm supported)
- **Communication**: Socket.IO 4.x (WebSocket + JSON)
- **Database**: SQLite 3.x (better-sqlite3)
- **Browser Automation**: Playwright (multi-browser architecture)
- **Testing**: Jest 29.x
- **Desktop Client**: Electron 28.x + React 18.x + Ant Design
- **Process Management**: PM2 in production

## Project Structure

```
packages/
├── master/          # Master server (port 3000)
│   ├── src/
│   │   ├── index.js                      # Entry point
│   │   ├── api/routes/                   # HTTP API endpoints
│   │   ├── communication/                # Socket.IO namespaces
│   │   ├── database/                     # SQLite DAOs
│   │   ├── worker_manager/               # Worker lifecycle & assignment
│   │   ├── scheduler/                    # Task scheduling
│   │   ├── monitor/                      # Heartbeat monitoring
│   │   └── login/                        # QR code login coordination
│   └── data/                             # Database (master.db)
│
├── worker/          # Worker process (browser automation)
│   ├── src/
│   │   ├── index.js                      # Entry point
│   │   ├── platforms/                    # Platform-specific scripts
│   │   │   ├── base/                     # Base classes (PlatformBase, WorkerBridge)
│   │   │   └── douyin/                   # Douyin platform implementation
│   │   ├── browser/                      # Browser manager (multi-browser)
│   │   ├── handlers/                     # Task runner, monitor tasks
│   │   ├── communication/                # Socket client, registration
│   │   └── platform-manager.js           # Dynamic platform loader
│   └── data/browser/                     # Per-worker browser data
│
├── admin-web/       # Admin web UI (React + Ant Design, port 3001)
├── desktop-client/  # Electron desktop client
├── mobile-client/   # React Native mobile app
└── shared/          # Shared code
    ├── protocol/                         # Message types, events
    ├── models/                           # Data models
    └── utils/                            # Logger, validators
```

## Common Commands

### Development

```bash
# Install all dependencies
npm install

# Start master server (port 3000)
npm run start:master
# or: cd packages/master && npm start

# Start worker process (connects to master)
npm run start:worker
# or: cd packages/worker && npm start

# Start admin web UI (port 3001)
npm run start:admin
# or: cd packages/admin-web && npm start

# Start desktop client
npm run start:desktop

# Start master + worker concurrently
npm run dev

# Start master + worker + admin concurrently
npm run dev:all
```

### Testing

```bash
# Run all tests
npm test

# Run tests for a specific package
npm run test --workspace=packages/master
npm run test --workspace=packages/worker

# Run tests in watch mode
cd packages/master && npm run test:watch
```

### Database

```bash
# Master database location
packages/master/data/master.db

# View database schema
sqlite3 packages/master/data/master.db ".schema"

# Common tables: accounts, workers, login_sessions, comments, direct_messages, proxies
```

### Production Deployment

```bash
# Using PM2
pm2 start packages/master/src/index.js --name "hiscrm-master"
pm2 start packages/worker/src/index.js --name "hiscrm-worker-1"

# View logs
pm2 logs

# Check status
pm2 list
```

## Architecture Patterns

### 1. Master-Worker Communication

**Socket.IO Namespaces**:
- `/worker` - Master ↔ Worker communication
- `/client` - Master ↔ Desktop/Mobile clients
- `/admin` - Master ↔ Admin web UI

**Message Flow**:
```
Worker Registration:
  Worker → Master: WORKER_REGISTER (capabilities, maxAccounts)
  Master → Worker: WORKER_REGISTERED

Task Assignment:
  Master → Worker: MASTER_TASK_ASSIGN (account info)
  Worker → Master: WORKER_TASK_STATUS (running/completed)

Heartbeat:
  Worker → Master: WORKER_HEARTBEAT (every 10s, with stats)
  Master: Marks worker offline if no heartbeat for 30s

Login Flow:
  Admin UI → Master: admin:login:start
  Master → Worker: master:login:start
  Worker → Master: worker:qrcode (base64 QR code)
  Master → Admin UI: master:qrcode
  Worker detects login → Master: worker:login:success
  Master → Admin UI: master:login:success
```

### 2. Multi-Browser Architecture

**Key Concept**: Each account gets its own independent Browser process (not just context).

```javascript
// packages/worker/src/browser/browser-manager-v2.js
class BrowserManagerV2 {
  // Each account = 1 Browser process
  async launchBrowserForAccount(accountId, proxyConfig) {
    const browser = await chromium.launch({
      args: [
        `--user-data-dir=${this.dataDir}/browser_${accountId}`,  // Isolated data
        '--disable-blink-features=AutomationControlled',
        // Proxy config if provided
      ]
    });
  }

  // Fingerprint isolation per account
  async getOrCreateFingerprint(accountId) {
    // Load or generate unique fingerprint: WebGL, Canvas, AudioContext, etc.
  }
}
```

**Data Isolation**:
```
data/browser/
├── worker-1/                           # Per-worker directory
│   ├── browser_account-123/            # Account 123's Browser data
│   │   ├── Cache/
│   │   ├── Cookies
│   │   └── Local Storage/
│   ├── browser_account-456/            # Account 456's Browser data
│   ├── fingerprints/
│   │   ├── account-123_fingerprint.json
│   │   └── account-456_fingerprint.json
│   └── screenshots/                    # Debug screenshots
```

**Why Multi-Browser?**
- 100% fingerprint isolation (no correlation between accounts)
- Process isolation (one crash doesn't affect others)
- Stable fingerprints (persisted, consistent across restarts)
- ~200MB per account, recommend ≤10 accounts per worker

### 3. Platform Plugin System

**Dynamic Platform Loading**:
```javascript
// packages/worker/src/platform-manager.js
class PlatformManager {
  async loadPlatforms() {
    // Auto-discovers platforms in platforms/ directory
    // Each platform: config.json + platform.js
  }

  getPlatform(platformName) {
    return this.platforms.get(platformName);  // e.g., 'douyin'
  }
}

// packages/worker/src/platforms/douyin/platform.js
class DouyinPlatform extends PlatformBase {
  async startLogin(accountId, sessionId, proxyConfig) {
    // 1. Create account-specific browser context
    // 2. Load fingerprint & cookies
    // 3. Navigate to login page
    // 4. Extract QR code
    // 5. Send QR code to Master via WorkerBridge
    // 6. Poll for login status
  }

  async crawlComments(account) { /* ... */ }
  async crawlDirectMessages(account) { /* ... */ }
}
```

**Adding New Platforms**:
1. Create `packages/worker/src/platforms/<platform-name>/`
2. Add `config.json` (URLs, selectors, timeouts)
3. Add `platform.js` extending `PlatformBase`
4. PlatformManager auto-discovers on startup

### 4. Database Schema

**Master Database** (`packages/master/data/master.db`):

Key tables:
- `accounts` - Social media accounts to monitor
- `workers` - Registered worker nodes
- `worker_configs` - Worker configuration
- `worker_runtime` - Worker runtime state
- `login_sessions` - Active login sessions (QR code flow)
- `comments` - Monitored comments
- `direct_messages` - Monitored DMs
- `notifications` - Notification queue
- `proxies` - Proxy server configs

**Important Fields**:
- `accounts.login_status`: 'not_logged_in', 'logging_in', 'logged_in', 'login_failed'
- `accounts.status`: 'active', 'inactive', 'error'
- `workers.status`: 'connected', 'disconnected', 'offline'

Refer to [docs/数据库字典.md](docs/数据库字典.md) for full schema (1200+ lines).

## Code Conventions

### Logging

```javascript
// Always use shared logger
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('component-name', './logs');

logger.info('Message', { context });
logger.warn('Warning', { details });
logger.error('Error occurred', { error });
```

### Error Handling

```javascript
// Worker tasks have retry logic
class MonitorTask {
  async run() {
    try {
      await this.executeMonitoring();
    } catch (error) {
      if (this.shouldRetry(error)) {
        await this.retry();
      } else {
        await this.handleFailure(error);
      }
    }
  }
}
```

### Socket.IO Messages

```javascript
// Use protocol constants from shared
const { WORKER_REGISTER, MASTER_TASK_ASSIGN } = require('@hiscrm-im/shared/protocol/messages');

// Emit with consistent structure
socket.emit(WORKER_REGISTER, {
  workerId: 'worker-123',
  capabilities: ['douyin', 'xiaohongshu'],
  timestamp: Date.now()
});
```

## Important Implementation Details

### Worker Lifecycle

1. **Startup**: Connect to Master, initialize browser manager, load platforms
2. **Registration**: Send capabilities (supported platforms) to Master
3. **Heartbeat**: Send every 10s with stats (active accounts, memory usage)
4. **Task Assignment**: Master assigns accounts based on capabilities
5. **Monitoring**: Random 15-30s intervals per account (anti-bot)
6. **Shutdown**: Graceful cleanup (close browsers, disconnect socket)

### Login Flow (QR Code)

1. Admin UI requests login for account
2. Master creates `login_session` record
3. Master sends `master:login:start` to assigned Worker
4. Worker launches browser, navigates to login page
5. Worker extracts QR code image (base64)
6. Worker sends QR code back to Master via `worker:qrcode`
7. Master forwards to Admin UI
8. Worker polls login status every 2s
9. On success: Save cookies, send `worker:login:success`
10. Master updates account status, notifies Admin UI

### Monitoring Tasks

```javascript
// packages/worker/src/handlers/monitor-task.js
class MonitorTask {
  constructor(account, platform) {
    this.account = account;
    this.platform = platform;  // Platform-specific implementation
    this.interval = this.calculateRandomInterval();  // 15-30s random
  }

  async run() {
    // 1. Check if account is still assigned
    // 2. Crawl comments via platform.crawlComments(account)
    // 3. Crawl DMs via platform.crawlDirectMessages(account)
    // 4. Send results to Master
    // 5. Schedule next run with new random interval
  }
}
```

## Testing Approach

### Unit Tests
```bash
# Test individual components
cd packages/master && npm test
cd packages/worker && npm test
```

### Integration Tests
- Test Master-Worker communication
- Test login flows end-to-end
- Test task assignment and execution

### Manual Testing
```bash
# Test douyin login interactively
cd packages/worker
node test-douyin-login-interactive.js

# Test platform system
node test-platform-system.js
```

## Common Development Scenarios

### Adding a New Platform

1. Create directory structure:
   ```bash
   mkdir -p packages/worker/src/platforms/xiaohongshu
   ```

2. Create `config.json`:
   ```json
   {
     "platform": "xiaohongshu",
     "displayName": "小红书",
     "urls": {
       "login": "https://www.xiaohongshu.com/login",
       "home": "https://www.xiaohongshu.com/"
     },
     "selectors": {
       "qrCode": ".qr-code-img",
       "comments": ".comment-item"
     }
   }
   ```

3. Create `platform.js` extending `PlatformBase`
4. Implement required methods: `initialize()`, `startLogin()`, `crawlComments()`, `crawlDirectMessages()`
5. Test with platform-specific test script
6. PlatformManager will auto-discover on next Worker restart

### Debugging Worker Issues

```bash
# Check Worker logs
tail -f packages/worker/logs/worker.log

# Check browser data
ls -la packages/worker/data/browser/worker-1/

# Take debug screenshot
# In platform code:
await this.takeScreenshot(accountId, 'debug.png');

# View screenshot
open packages/worker/data/browser/worker-1/screenshots/
```

### Modifying Database Schema

1. Edit schema in `packages/master/src/database/init.js`
2. Create migration script
3. Test migration with backup
4. Update DAOs in `packages/master/src/database/`
5. Update documentation in `docs/数据库字典.md`

## Documentation Conventions

- **All generated documentation must be in Chinese**
- **Save documentation to `docs/` directory**
- Reference key docs:
  - [docs/README.md](docs/README.md) - Documentation hub
  - [docs/系统使用指南.md](docs/系统使用指南.md) - System usage guide
  - [docs/worker-通用平台脚本系统设计方案.md](docs/worker-通用平台脚本系统设计方案.md) - Platform system design
  - [docs/worker-平台系统快速参考.md](docs/worker-平台系统快速参考.md) - Quick reference

## Key Files to Know

### Master
- `packages/master/src/index.js` - Entry point, initializes all services
- `packages/master/src/communication/socket-server.js` - Socket.IO server setup
- `packages/master/src/worker_manager/lifecycle-manager.js` - Worker lifecycle (start/stop/restart)
- `packages/master/src/scheduler/task-scheduler.js` - Task assignment logic
- `packages/master/src/login/login-handler.js` - Login session coordination

### Worker
- `packages/worker/src/index.js` - Entry point, connects to Master
- `packages/worker/src/platform-manager.js` - Loads platform plugins
- `packages/worker/src/browser/browser-manager-v2.js` - Multi-browser management
- `packages/worker/src/handlers/task-runner.js` - Task execution
- `packages/worker/src/platforms/base/platform-base.js` - Base class for platforms

### Shared
- `packages/shared/protocol/messages.js` - Message type constants
- `packages/shared/protocol/events.js` - Event type constants
- `packages/shared/utils/logger.js` - Winston logger factory
- `packages/shared/models/Account.js` - Account model

## Performance Considerations

- **Memory**: ~200MB per account (Browser process)
- **Recommended**: Max 10 accounts per Worker
- **Monitoring Interval**: 15-30s random (anti-bot, configurable per account)
- **Browser Startup**: ~5s per Browser, stagger launches
- **Database**: SQLite with WAL mode for concurrent reads
- **Socket.IO**: Binary mode disabled for JSON compatibility

## Security Notes

- Account credentials encrypted with AES-256 (master DB)
- Browser fingerprints randomized per account (anti-tracking)
- Proxy support for IP rotation
- Random monitoring intervals (anti-bot detection)
- Each account isolated in separate Browser process (no data leakage)
