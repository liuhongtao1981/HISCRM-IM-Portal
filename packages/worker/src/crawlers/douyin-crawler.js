/**
 * Douyin Crawler - 抖音爬虫
 * 通过模拟真实用户操作来爬取评论和私信
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('douyin-crawler');

/**
 * Douyin Crawler 类
 */
class DouyinCrawler {
  constructor() {
    this.initialized = false;
    this.browserContext = null;
    this.currentPage = null;
  }

  /**
   * 初始化爬虫
   * @param {object} account - 账户对象
   * @param {object} browserContext - Playwright BrowserContext
   */
  async initialize(account, browserContext) {
    logger.info(`Initializing Douyin crawler for account ${account.account_id}`);

    this.browserContext = browserContext;
    this.account = account;
    this.initialized = true;

    logger.info(`Douyin crawler initialized for account ${account.account_id}`);
  }

  /**
   * 爬取评论 - 通过模拟用户点击导航到评论管理页面
   * @param {object} options - 选项
   * @param {string} options.accountId - 账户ID
   * @returns {Promise<Object>} { comments: Array, stats: Object }
   */
  async crawlComments(options) {
    const { accountId } = options;

    try {
      logger.info(`Starting to crawl comments for account ${accountId}`);

      // 1. 获取或创建页面
      const page = await this.getOrCreatePage();

      // 2. 导航到评论管理页面 (互动管理 - 评论管理)
      await this.navigateToCommentManage(page);

      // 3. 等待评论列表加载
      await page.waitForTimeout(3000);

      // 4. 提取评论列表
      const allComments = await this.extractComments(page);

      logger.info(`Total comments found: ${allComments.length}`);

      return {
        comments: allComments,
        stats: {
          recent_comments_count: allComments.length,
          total_works: 0, // 评论管理页面不显示作品数
        },
      };

    } catch (error) {
      logger.error('Failed to crawl comments:', error);
      throw error;
    }
  }

  /**
   * 爬取私信 - 通过模拟用户点击导航到私信页面
   * @param {object} options - 选项
   * @param {string} options.accountId - 账户ID
   * @returns {Promise<Object>} { directMessages: Array, stats: Object }
   */
  async crawlDirectMessages(options) {
    const { accountId } = options;

    try {
      logger.info(`Starting to crawl direct messages for account ${accountId}`);

      // 1. 获取或创建页面
      const page = await this.getOrCreatePage();

      // 2. 导航到私信页面 (模拟点击导航)
      await this.navigateToMessages(page);

      // 3. 等待私信列表加载
      await page.waitForTimeout(3000);

      // 4. 提取私信列表
      const messages = await this.extractDirectMessages(page);

      logger.info(`Found ${messages.length} direct messages`);

      return {
        directMessages: messages,
        stats: {
          total_messages: messages.length,
        },
      };

    } catch (error) {
      logger.error('Failed to crawl direct messages:', error);
      throw error;
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    logger.info(`Cleaning up Douyin crawler`);
    if (this.currentPage) {
      try {
        await this.currentPage.close();
        this.currentPage = null;
      } catch (error) {
        logger.error('Failed to close page:', error);
      }
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取或创建页面
   * @returns {Promise<Page>}
   */
  async getOrCreatePage() {
    if (this.currentPage && !this.currentPage.isClosed()) {
      return this.currentPage;
    }

    if (!this.browserContext) {
      throw new Error('Browser context not initialized');
    }

    this.currentPage = await this.browserContext.newPage();
    logger.info('Created new page for crawling');

    return this.currentPage;
  }

  /**
   * 导航到作品管理页面
   * @param {Page} page
   */
  async navigateToContentManage(page) {
    logger.info('Navigating to content manage page');

    const currentUrl = page.url();

    // 如果已经在作品管理页面，直接返回
    if (currentUrl.includes('/content/manage')) {
      logger.info('Already on content manage page');
      return;
    }

    // 导航到创作者中心首页
    if (!currentUrl.includes('creator.douyin.com')) {
      await page.goto('https://creator.douyin.com/', { waitUntil: 'networkidle', timeout: 30000 });
      await this.randomDelay(1000, 2000);
    }

    // 点击"内容管理"导航链接 (模拟真实用户点击)
    try {
      await page.goto('https://creator.douyin.com/creator-micro/content/manage', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      await this.randomDelay(2000, 3000);
      logger.info('Navigated to content manage page');
    } catch (error) {
      logger.error('Failed to navigate to content manage page:', error);
      throw error;
    }
  }

  /**
   * 获取作品列表
   * @param {Page} page
   * @returns {Promise<Array>}
   */
  async getVideoList(page) {
    logger.info('Getting video list from page');

    try {
      // 等待作品列表加载
      await page.waitForTimeout(3000);

      // 从页面提取作品列表 (使用 evaluate 在浏览器上下文中执行)
      const videos = await page.evaluate(() => {
        const videoElements = document.querySelectorAll('[class*="content-item"], [class*="video-item"], .semi-table-row');
        const videoList = [];

        videoElements.forEach((el, index) => {
          // 提取作品标题
          const titleEl = el.querySelector('[class*="title"], [class*="content-title"]');
          const title = titleEl ? titleEl.textContent.trim() : `作品${index + 1}`;

          // 提取作品ID (从链接或数据属性中)
          const linkEl = el.querySelector('a');
          let videoId = '';
          if (linkEl) {
            const href = linkEl.href || '';
            const match = href.match(/item_id=([^&]+)/);
            if (match) {
              videoId = match[1];
            }
          }

          // 提取评论数
          const commentEl = el.querySelector('[class*="comment"]');
          const commentCount = commentEl ? commentEl.textContent.trim() : '0';

          videoList.push({
            title,
            videoId: videoId || `video-${Date.now()}-${index}`,
            commentCount,
            index,
          });
        });

        return videoList;
      });

      logger.info(`Extracted ${videos.length} videos from page`);
      return videos;

    } catch (error) {
      logger.error('Failed to get video list:', error);
      return [];
    }
  }

  /**
   * 获取单个作品的评论
   * @param {Page} page
   * @param {Object} video - 作品对象
   * @param {number} videoIndex - 作品索引
   * @returns {Promise<Array>}
   */
  async getVideoComments(page, video, videoIndex) {
    logger.info(`Getting comments for video: ${video.title}`);

    try {
      // 点击作品进入详情/评论页面
      await page.evaluate((index) => {
        const videoElements = document.querySelectorAll('[class*="content-item"], [class*="video-item"], .semi-table-row');
        if (videoElements[index]) {
          const link = videoElements[index].querySelector('a');
          if (link) {
            link.click();
          }
        }
      }, videoIndex);

      // 等待页面跳转和加载
      await page.waitForTimeout(2000);

      // 等待评论区加载
      await page.waitForTimeout(3000);

      // 提取评论数据
      const comments = await page.evaluate((videoTitle) => {
        const commentElements = document.querySelectorAll('[class*="comment-item"], [class*="comment-list"] > div');
        const commentList = [];

        commentElements.forEach((el) => {
          // 提取评论者昵称
          const authorEl = el.querySelector('[class*="nickname"], [class*="author"], [class*="username"]');
          const authorName = authorEl ? authorEl.textContent.trim() : '匿名用户';

          // 提取评论内容
          const contentEl = el.querySelector('[class*="comment-content"], [class*="text-content"], [class*="content-text"]');
          const content = contentEl ? contentEl.textContent.trim() : '';

          // 提取评论时间
          const timeEl = el.querySelector('[class*="time"], [class*="date"]');
          const timeText = timeEl ? timeEl.textContent.trim() : '';

          // 只添加有内容的评论
          if (content) {
            commentList.push({
              platform_comment_id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              content,
              author_name: authorName,
              author_id: `user-${Math.random().toString(36).substr(2, 9)}`,
              post_title: videoTitle,
              post_id: '',
              detected_at: Math.floor(Date.now() / 1000),
              time: timeText,
            });
          }
        });

        return commentList;
      }, video.title);

      // 返回上一页 (回到作品列表)
      await page.goBack({ waitUntil: 'networkidle' });
      await this.randomDelay(1000, 2000);

      return comments;

    } catch (error) {
      logger.error(`Failed to get comments for video ${video.title}:`, error);
      // 尝试返回作品列表页面
      try {
        await page.goBack();
      } catch (e) {
        // 忽略返回失败
      }
      return [];
    }
  }

  /**
   * 导航到私信页面
   * @param {Page} page
   */
  async navigateToMessages(page) {
    logger.info('Navigating to messages page');

    const currentUrl = page.url();

    // 如果已经在私信页面，直接返回
    if (currentUrl.includes('/message')) {
      logger.info('Already on messages page');
      return;
    }

    // 导航到私信页面
    try {
      await page.goto('https://creator.douyin.com/creator-micro/message', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      await this.randomDelay(2000, 3000);
      logger.info('Navigated to messages page');
    } catch (error) {
      logger.error('Failed to navigate to messages page:', error);
      throw error;
    }
  }

  /**
   * 提取私信列表
   * @param {Page} page
   * @returns {Promise<Array>}
   */
  async extractDirectMessages(page) {
    logger.info('Extracting direct messages from page');

    try {
      // 从页面提取私信列表
      const messages = await page.evaluate(() => {
        const messageElements = document.querySelectorAll('[class*="conversation-item"], [class*="message-item"], [class*="chat-item"]');
        const messageList = [];

        messageElements.forEach((el) => {
          // 提取发送者昵称
          const senderEl = el.querySelector('[class*="nickname"], [class*="sender"], [class*="username"]');
          const senderName = senderEl ? senderEl.textContent.trim() : '未知用户';

          // 提取消息内容
          const contentEl = el.querySelector('[class*="message-content"], [class*="text-content"], [class*="content"]');
          const content = contentEl ? contentEl.textContent.trim() : '';

          // 提取时间
          const timeEl = el.querySelector('[class*="time"], [class*="date"]');
          const timeText = timeEl ? timeEl.textContent.trim() : '';

          // 只添加有内容的消息
          if (content) {
            messageList.push({
              platform_message_id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              content,
              sender_name: senderName,
              sender_id: `user-${Math.random().toString(36).substr(2, 9)}`,
              direction: 'inbound',
              detected_at: Math.floor(Date.now() / 1000),
              time: timeText,
            });
          }
        });

        return messageList;
      });

      logger.info(`Extracted ${messages.length} direct messages`);
      return messages;

    } catch (error) {
      logger.error('Failed to extract direct messages:', error);
      return [];
    }
  }

  /**
   * 随机延迟 (模拟人类操作)
   * @param {number} min - 最小延迟(ms)
   * @param {number} max - 最大延迟(ms)
   */
  async randomDelay(min, max) {
    const delay = min + Math.random() * (max - min);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

module.exports = DouyinCrawler;
