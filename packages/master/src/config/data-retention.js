/**
 * Data Retention Configuration
 * 数据保留策略配置
 *
 * 说明:
 * - memory: 内存中保留的时间,超过后从 DataStore 删除
 * - database: 数据库中保留的时间,超过后从缓存表删除
 * - cleanupInterval: 清理任务运行频率
 *
 * 时间单位: 毫秒
 */

// 时间常量 (便于配置)
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

module.exports = {
  // ============================================================================
  // 内存保留策略
  // ============================================================================
  // 数据在 DataStore 内存中保留的时间
  // 超过此时间的数据将从内存中删除,但仍保留在数据库中

  memory: {
    // 评论: 保留最近 7 天
    // 原因: 评论一般在发布后 7 天内最活跃,超过 7 天的评论很少再有互动
    comments: 7 * DAY,

    // 私信: 保留最近 30 天
    // 原因: 私信对话可能持续较长时间,30 天的保留期可以覆盖大部分活跃对话
    messages: 30 * DAY,

    // 作品: 保留最近 30 天
    // 原因: 最近发布的作品需要频繁查看数据,30 天后的作品访问频率降低
    contents: 30 * DAY,

    // 会话: 保留最近 30 天
    // 原因: 与私信保留期一致,保持会话和消息的同步
    conversations: 30 * DAY,

    // 通知: 保留最近 3 天
    // 原因: 通知的时效性很强,3 天后的通知基本不再需要
    notifications: 3 * DAY,
  },

  // ============================================================================
  // 数据库保留策略
  // ============================================================================
  // 数据在缓存数据库中保留的时间
  // 超过此时间的数据将从数据库中删除
  // 设置为 0 表示永久保留

  database: {
    // 评论: 保留最近 30 天
    // 原因: 30 天的评论数据足以用于数据分析和历史查询
    comments: 30 * DAY,

    // 私信: 保留最近 90 天
    // 原因: 私信可能包含重要的商务沟通,保留 90 天便于回溯
    messages: 90 * DAY,

    // 作品: 永久保留
    // 原因: 作品数据量相对较小,且可能需要长期的数据分析
    contents: 0,  // 0 = 永久保留

    // 会话: 保留最近 90 天
    // 原因: 与私信保留期一致
    conversations: 90 * DAY,

    // 通知: 保留最近 7 天
    // 原因: 通知数据量大,且时效性强,7 天足够
    notifications: 7 * DAY,
  },

  // ============================================================================
  // 清理任务频率
  // ============================================================================
  // 每种数据类型的清理任务运行频率

  cleanupInterval: {
    // 评论: 每天清理一次
    comments: 1 * DAY,

    // 私信: 每天清理一次
    messages: 1 * DAY,

    // 作品: 每天清理一次 (虽然数据库永久保留,但内存需要清理)
    contents: 1 * DAY,

    // 会话: 每天清理一次
    conversations: 1 * DAY,

    // 通知: 每 6 小时清理一次 (通知数据量大,需要频繁清理)
    notifications: 6 * HOUR,
  },

  // ============================================================================
  // 持久化策略
  // ============================================================================

  persistence: {
    // 定时持久化间隔 (5 分钟)
    interval: 5 * 60 * 1000,

    // 变更数量阈值 (超过此数量立即持久化)
    changeThreshold: 1000,

    // 批量写入大小 (每次最多写入多少条记录)
    batchSize: 500,

    // 是否在启动时加载数据
    loadOnStartup: true,

    // 是否在退出时持久化
    persistOnExit: true,
  },

  // ============================================================================
  // 高级配置
  // ============================================================================

  advanced: {
    // 是否启用增量持久化 (只持久化变更的数据)
    incrementalPersist: true,

    // 是否启用自动清理
    autoCleanup: true,

    // 是否启用性能监控
    enableMonitoring: true,

    // 日志级别 (debug, info, warn, error)
    logLevel: 'info',
  },

  // ============================================================================
  // 环境相关配置
  // ============================================================================

  // 生产环境配置 (更保守的策略)
  production: {
    memory: {
      comments: 3 * DAY,        // 3 天 (减少内存占用)
      messages: 14 * DAY,       // 14 天
      contents: 14 * DAY,       // 14 天
      conversations: 14 * DAY,  // 14 天
      notifications: 1 * DAY,   // 1 天
    },
    database: {
      comments: 30 * DAY,
      messages: 60 * DAY,       // 60 天 (减少数据库大小)
      contents: 0,
      conversations: 60 * DAY,
      notifications: 3 * DAY,   // 3 天
    },
  },

  // 开发环境配置 (更长的保留期,便于调试)
  development: {
    memory: {
      comments: 30 * DAY,
      messages: 60 * DAY,
      contents: 60 * DAY,
      conversations: 60 * DAY,
      notifications: 7 * DAY,
    },
    database: {
      comments: 90 * DAY,
      messages: 180 * DAY,
      contents: 0,
      conversations: 180 * DAY,
      notifications: 30 * DAY,
    },
  },

  // ============================================================================
  // 辅助函数
  // ============================================================================

  /**
   * 获取当前环境的配置
   * @param {string} env - 环境名称 (production, development)
   * @returns {object} 配置对象
   */
  getConfig(env = process.env.NODE_ENV || 'development') {
    if (env === 'production' && this.production) {
      return {
        memory: this.production.memory,
        database: this.production.database,
        cleanupInterval: this.cleanupInterval,
        persistence: this.persistence,
        advanced: this.advanced,
      };
    } else if (env === 'development' && this.development) {
      return {
        memory: this.development.memory,
        database: this.development.database,
        cleanupInterval: this.cleanupInterval,
        persistence: this.persistence,
        advanced: this.advanced,
      };
    } else {
      // 默认配置
      return {
        memory: this.memory,
        database: this.database,
        cleanupInterval: this.cleanupInterval,
        persistence: this.persistence,
        advanced: this.advanced,
      };
    }
  },

  /**
   * 格式化时间
   * @param {number} milliseconds - 毫秒数
   * @returns {string} 格式化后的时间字符串
   */
  formatTime(milliseconds) {
    if (milliseconds === 0) return 'permanent';

    const days = Math.floor(milliseconds / DAY);
    const hours = Math.floor((milliseconds % DAY) / HOUR);

    if (days > 0) {
      return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      const minutes = Math.floor(milliseconds / (60 * 1000));
      return `${minutes}m`;
    }
  },

  /**
   * 打印配置摘要
   */
  printSummary(env = process.env.NODE_ENV || 'development') {
    const config = this.getConfig(env);

    console.log('\n📋 Data Retention Configuration');
    console.log('='.repeat(80));
    console.log(`Environment: ${env}`);
    console.log('');

    console.log('Memory Retention:');
    for (const [type, time] of Object.entries(config.memory)) {
      console.log(`  - ${type.padEnd(15)}: ${this.formatTime(time)}`);
    }

    console.log('\nDatabase Retention:');
    for (const [type, time] of Object.entries(config.database)) {
      console.log(`  - ${type.padEnd(15)}: ${this.formatTime(time)}`);
    }

    console.log('\nCleanup Intervals:');
    for (const [type, time] of Object.entries(config.cleanupInterval)) {
      console.log(`  - ${type.padEnd(15)}: ${this.formatTime(time)}`);
    }

    console.log('\nPersistence Settings:');
    console.log(`  - Interval:         ${this.formatTime(config.persistence.interval)}`);
    console.log(`  - Change Threshold: ${config.persistence.changeThreshold} items`);
    console.log(`  - Batch Size:       ${config.persistence.batchSize} items`);
    console.log(`  - Load on Startup:  ${config.persistence.loadOnStartup ? 'Yes' : 'No'}`);
    console.log(`  - Persist on Exit:  ${config.persistence.persistOnExit ? 'Yes' : 'No'}`);

    console.log('='.repeat(80));
  },
};

// 如果直接运行此脚本,打印配置摘要
if (require.main === module) {
  const config = require('./data-retention');
  const env = process.argv[2] || process.env.NODE_ENV || 'development';
  config.printSummary(env);
}
