/**
 * IsNewPushTask - 新数据推送任务
 *
 * 功能：每分钟扫描一次 is_new=true 的数据，推送到 Master
 * 规则：
 *   - 仅在内存中维护 push_count 计数
 *   - 第1次：push_count=0 → 推送 → push_count=1
 *   - 第2次：push_count=1 → 推送 → push_count=2
 *   - 第3次：push_count=2 → 推送 → push_count=3，is_new=false
 *   - 第4次及以后：不推送
 *
 * 所有数据库验证工作由 Master 负责
 */

const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('is-new-push-task');

class IsNewPushTask {
  constructor(cacheManager, bridge) {
    this.cacheManager = cacheManager;
    this.bridge = bridge;
    this.maxPushTimes = parseInt(process.env.IS_NEW_PUSH_MAX_TIMES || '3', 10);
    this.interval = parseInt(process.env.IS_NEW_PUSH_INTERVAL || '60000', 10);
    this.isRunning = false;
    this.intervalHandle = null;

    // 在内存中维护推送计数和状态
    // 结构: { 'accountId|dataType|dataId': { push_count, is_new } }
    this.pushState = new Map();
  }

  /**
   * 启动定时任务
   */
  start() {
    if (this.isRunning) {
      logger.warn('IsNewPushTask already running');
      return;
    }

    this.isRunning = true;
    logger.info(`IsNewPushTask started with interval: ${this.interval}ms, max push times: ${this.maxPushTimes}`);

    // 首次执行前等待一些时间，确保 Worker 已连接
    setTimeout(() => {
      this.scanAndPush();
      this.intervalHandle = setInterval(() => this.scanAndPush(), this.interval);
    }, 5000);
  }

  /**
   * 停止定时任务
   */
  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    logger.info('IsNewPushTask stopped');
  }

  /**
   * 扫描所有账户的新数据并推送
   */
  async scanAndPush() {
    try {
      // 获取所有有数据的账户
      const accountIds = this.cacheManager.getAllAccounts();

      if (!accountIds || accountIds.length === 0) {
        // 没有数据，静默返回
        return;
      }

      for (const accountId of accountIds) {
        // 构造最小账户对象（只需要 id）
        const account = { id: accountId };

        // 扫描并推送评论
        await this.scanAndPushComments(account);

        // 扫描并推送私信
        await this.scanAndPushMessages(account);

        // 扫描并推送视频
        await this.scanAndPushVideos(account);
      }
    } catch (error) {
      logger.error('Error in scanAndPush:', error);
    }
  }

  /**
   * 扫描并推送新评论
   */
  async scanAndPushComments(account) {
    try {
      const comments = this.cacheManager.getCommentsWithIsNew(account.id);

      if (!comments || comments.length === 0) {
        return;
      }

      const commentsToProcess = [];

      for (const comment of comments) {
        const stateKey = `${account.id}|comment|${comment.id}`;
        let state = this.pushState.get(stateKey) || { push_count: 0, is_new: true };

        if (state.push_count >= this.maxPushTimes) {
          // 已推送达到最大次数，标记为完成，下次不再推送
          logger.debug(`[IsNew] Comment ${comment.id} finished pushing (${state.push_count}/${this.maxPushTimes} times)`);
          continue;
        }

        // 准备推送
        commentsToProcess.push(comment);
      }

      if (commentsToProcess.length === 0) {
        return;
      }

      // 发送推送请求
      const requestId = uuidv4();
      logger.info(`[IsNew] Pushing ${commentsToProcess.length} comments (request #${requestId})`);

      this.bridge.socket.emit('worker:push_new_comments', {
        request_id: requestId,
        account_id: account.id,
        platform_user_id: account.platform_user_id,
        comments: commentsToProcess
      });

      // 更新内存中的 push_count
      commentsToProcess.forEach((comment) => {
        const stateKey = `${account.id}|comment|${comment.id}`;
        const state = this.pushState.get(stateKey) || { push_count: 0, is_new: true };
        state.push_count += 1;
        this.pushState.set(stateKey, state);
        logger.debug(`[IsNew] Updated comment ${comment.id} push_count to ${state.push_count}`);
      });

      // 监听反馈（可选）
      this.setupAckListener(requestId, 'comments', commentsToProcess);
    } catch (error) {
      logger.error('Error in scanAndPushComments:', error);
    }
  }

  /**
   * 扫描并推送新私信
   */
  async scanAndPushMessages(account) {
    try {
      const messages = this.cacheManager.getMessagesWithIsNew(account.id);

      if (!messages || messages.length === 0) {
        return;
      }

      const messagesToProcess = [];

      for (const message of messages) {
        const stateKey = `${account.id}|message|${message.id}`;
        let state = this.pushState.get(stateKey) || { push_count: 0, is_new: true };

        if (state.push_count >= this.maxPushTimes) {
          logger.debug(`[IsNew] Message ${message.id} finished pushing (${state.push_count}/${this.maxPushTimes} times)`);
          continue;
        }

        // 准备推送
        messagesToProcess.push(message);
      }

      if (messagesToProcess.length === 0) {
        return;
      }

      // 发送推送请求
      const requestId = uuidv4();
      logger.info(`[IsNew] Pushing ${messagesToProcess.length} messages (request #${requestId})`);

      this.bridge.socket.emit('worker:push_new_messages', {
        request_id: requestId,
        account_id: account.id,
        platform_user_id: account.platform_user_id,
        messages: messagesToProcess
      });

      // 更新内存中的 push_count
      messagesToProcess.forEach((message) => {
        const stateKey = `${account.id}|message|${message.id}`;
        const state = this.pushState.get(stateKey) || { push_count: 0, is_new: true };
        state.push_count += 1;
        this.pushState.set(stateKey, state);
        logger.debug(`[IsNew] Updated message ${message.id} push_count to ${state.push_count}`);
      });

      // 监听反馈（可选）
      this.setupAckListener(requestId, 'messages', messagesToProcess);
    } catch (error) {
      logger.error('Error in scanAndPushMessages:', error);
    }
  }

  /**
   * 扫描并推送新视频
   */
  async scanAndPushVideos(account) {
    try {
      const videos = this.cacheManager.getVideosWithIsNew(account.id);

      if (!videos || videos.length === 0) {
        return;
      }

      const videosToProcess = [];

      for (const video of videos) {
        const stateKey = `${account.id}|video|${video.id}`;
        let state = this.pushState.get(stateKey) || { push_count: 0, is_new: true };

        if (state.push_count >= this.maxPushTimes) {
          logger.debug(`[IsNew] Video ${video.id} finished pushing (${state.push_count}/${this.maxPushTimes} times)`);
          continue;
        }

        // 准备推送
        videosToProcess.push(video);
      }

      if (videosToProcess.length === 0) {
        return;
      }

      // 发送推送请求
      const requestId = uuidv4();
      logger.info(`[IsNew] Pushing ${videosToProcess.length} videos (request #${requestId})`);

      this.bridge.socket.emit('worker:push_new_videos', {
        request_id: requestId,
        account_id: account.id,
        platform_user_id: account.platform_user_id,
        videos: videosToProcess
      });

      // 更新内存中的 push_count
      videosToProcess.forEach((video) => {
        const stateKey = `${account.id}|video|${video.id}`;
        const state = this.pushState.get(stateKey) || { push_count: 0, is_new: true };
        state.push_count += 1;
        this.pushState.set(stateKey, state);
        logger.debug(`[IsNew] Updated video ${video.id} push_count to ${state.push_count}`);
      });

      // 监听反馈（可选）
      this.setupAckListener(requestId, 'videos', videosToProcess);
    } catch (error) {
      logger.error('Error in scanAndPushVideos:', error);
    }
  }

  /**
   * 设置 ACK 监听器（用于接收 Master 的推送反馈）
   */
  setupAckListener(requestId, dataType, data) {
    const ackEventName = `master:push_new_${dataType}_ack_${requestId}`;

    // 设置一次性监听器
    this.bridge.socket.once(ackEventName, (ack) => {
      if (ack.success) {
        logger.info(`[IsNew] ✅ Request #${requestId} acknowledged: ${ack.inserted} new, ${ack.skipped} history`);
      } else {
        logger.error(`[IsNew] ❌ Request #${requestId} failed: ${ack.error}`);
      }
    });

    // 设置超时处理
    setTimeout(() => {
      if (this.bridge.socket.hasListeners(ackEventName)) {
        this.bridge.socket.removeAllListeners(ackEventName);
        logger.warn(`[IsNew] ⏱️ Request #${requestId} timeout (no ack received within 30s)`);
      }
    }, 30000);
  }
}

module.exports = IsNewPushTask;
