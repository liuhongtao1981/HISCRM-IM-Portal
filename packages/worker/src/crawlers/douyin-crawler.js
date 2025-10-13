/**
 * Douyin Crawler (Mock Implementation)
 * T049: 抖音爬虫 - Mock 版本用于架构验证
 *
 * 注意: 这是 Mock 实现，用于验证系统架构
 * 生产环境需要实现真实的 Puppeteer 爬虫
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('douyin-crawler');

/**
 * Douyin Crawler 类
 */
class DouyinCrawler {
  constructor() {
    this.mockCommentCounter = 0;
    this.mockDMCounter = 0;
  }

  /**
   * 初始化爬虫
   * @param {object} account - 账户对象
   */
  async initialize(account) {
    logger.info(`[MOCK] Initializing Douyin crawler for account ${account.account_id}`);

    // Mock: 模拟初始化延迟
    await this.delay(100);

    logger.info(`[MOCK] Douyin crawler initialized`);
  }

  /**
   * 爬取评论
   * @param {object} account - 账户对象
   * @returns {Promise<Array>} 评论原始数据
   */
  async crawlComments(account) {
    logger.info(`[MOCK] Crawling comments for account ${account.account_id}`);

    // Mock: 模拟网络延迟
    await this.delay(500 + Math.random() * 1000);

    // Mock: 随机生成0-2条评论
    const commentCount = Math.floor(Math.random() * 3);
    const comments = [];

    for (let i = 0; i < commentCount; i++) {
      this.mockCommentCounter++;

      comments.push({
        platform_comment_id: `mock-comment-${Date.now()}-${this.mockCommentCounter}`,
        content: this.generateMockCommentContent(),
        author_name: this.generateMockUserName(),
        author_id: `mock-user-${Math.floor(Math.random() * 10000)}`,
        post_id: `mock-post-${Math.floor(Math.random() * 100)}`,
        post_title: this.generateMockPostTitle(),
        detected_at: Math.floor(Date.now() / 1000),
      });
    }

    logger.info(`[MOCK] Found ${comments.length} new comments`);
    return comments;
  }

  /**
   * 爬取私信
   * @param {object} account - 账户对象
   * @returns {Promise<Array>} 私信原始数据
   */
  async crawlDirectMessages(account) {
    logger.info(`[MOCK] Crawling direct messages for account ${account.account_id}`);

    // Mock: 模拟网络延迟
    await this.delay(500 + Math.random() * 1000);

    // Mock: 随机生成0-1条私信
    const dmCount = Math.random() > 0.7 ? 1 : 0;
    const messages = [];

    for (let i = 0; i < dmCount; i++) {
      this.mockDMCounter++;

      messages.push({
        platform_message_id: `mock-dm-${Date.now()}-${this.mockDMCounter}`,
        content: this.generateMockDMContent(),
        sender_name: this.generateMockUserName(),
        sender_id: `mock-sender-${Math.floor(Math.random() * 10000)}`,
        direction: 'inbound',
        detected_at: Math.floor(Date.now() / 1000),
      });
    }

    logger.info(`[MOCK] Found ${messages.length} new direct messages`);
    return messages;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    logger.info(`[MOCK] Cleaning up Douyin crawler`);
    // Mock: 无需清理
  }

  // ==================== Mock 数据生成器 ====================

  /**
   * 生成模拟评论内容
   * @returns {string}
   */
  generateMockCommentContent() {
    const comments = [
      '这个视频太棒了！',
      '支持支持！👍',
      '学到了，感谢分享',
      '太有用了，收藏了',
      '请问在哪里可以买到？',
      '这个音乐是什么名字？',
      '求教程！',
      '太好笑了哈哈哈',
      '已关注，期待更新',
      '拍得真好！',
    ];

    return comments[Math.floor(Math.random() * comments.length)];
  }

  /**
   * 生成模拟私信内容
   * @returns {string}
   */
  generateMockDMContent() {
    const messages = [
      '你好，请问有合作意向吗？',
      '想咨询一下产品信息',
      '感谢关注！',
      '你的视频太棒了',
      '可以加个好友吗？',
      '请问如何联系您？',
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * 生成模拟用户名
   * @returns {string}
   */
  generateMockUserName() {
    const names = [
      '热心网友',
      '抖音用户',
      '路过的观众',
      '新粉丝',
      '老粉丝',
      '好奇宝宝',
      '学习中',
    ];

    const suffix = Math.floor(Math.random() * 1000);
    return `${names[Math.floor(Math.random() * names.length)]}${suffix}`;
  }

  /**
   * 生成模拟视频标题
   * @returns {string}
   */
  generateMockPostTitle() {
    const titles = [
      '每日分享',
      '实用教程',
      '生活小技巧',
      '今天的日常',
      '推荐好物',
      '美食制作',
    ];

    return titles[Math.floor(Math.random() * titles.length)];
  }

  /**
   * 延迟工具函数
   * @param {number} ms - 毫秒数
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = DouyinCrawler;
