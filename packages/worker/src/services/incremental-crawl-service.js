/**
 * 增量抓取服务
 * 负责区分新旧评论，实现增量抓取和新评论通知
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { v4: uuidv4 } = require('uuid');

const logger = createLogger('incremental-crawl');

class IncrementalCrawlService {
  /**
   * 处理评论增量抓取
   * @param {Array} rawComments - 从API获取的原始评论列表
   * @param {Object} video - 作品对象 { aweme_id, title, cover, last_crawl_time }
   * @param {string} accountId - 账户ID
   * @param {string} platformUserId - 平台用户ID（抖音号或UID）
   * @param {Function} getExistingCommentIds - 获取现有评论ID的函数
   * @param {Object} options - 可选配置
   * @param {boolean} options.useTimeOptimization - 是否使用时间优化（默认true）
   * @returns {Object} { newComments, allComments, stats }
   */
  static async processCommentsIncremental(
    rawComments,
    video,
    accountId,
    platformUserId,
    getExistingCommentIds,
    options = {}
  ) {
    try {
      const { useTimeOptimization = true } = options;

      // 1. 获取该作品的历史评论ID
      // 性能优化：如果定期爬取（如每小时），只需要对比最近时间范围内的评论ID
      let existingIds = [];

      if (useTimeOptimization && video.last_crawl_time) {
        // 从上次爬取时间往前推2倍的时间窗口，确保不漏评论
        // 例如：上次爬取是1小时前，则查询2小时前到现在的评论ID
        const now = Math.floor(Date.now() / 1000);
        const timeSinceLastCrawl = now - video.last_crawl_time;
        const safetyWindow = Math.max(timeSinceLastCrawl * 2, 3600); // 至少查1小时
        const sinceTime = video.last_crawl_time - safetyWindow;

        logger.info(
          `Video ${video.aweme_id}: using time optimization (since_time: ${new Date(sinceTime * 1000).toISOString()})`
        );
        existingIds = await getExistingCommentIds(video.aweme_id, { since_time: sinceTime });
      } else {
        // 首次爬取或不使用优化：查询所有历史评论ID
        existingIds = await getExistingCommentIds(video.aweme_id);
      }

      logger.info(`Video ${video.aweme_id}: found ${existingIds.length} existing comments`);

      // 2. 处理评论数据，添加必要字段
      const now = Math.floor(Date.now() / 1000);
      const allComments = rawComments.map((comment) => {
        // 检查是否为新评论
        const isNew = !existingIds.includes(comment.platform_comment_id);

        return {
          id: uuidv4(),
          account_id: accountId,
          platform_user_id: platformUserId,
          platform_comment_id: comment.platform_comment_id,
          content: comment.content,
          author_name: comment.author_name,
          author_id: comment.author_id,
          post_id: video.aweme_id,
          post_title: video.title || '',
          post_cover: video.cover || '',
          stats_like_count: comment.stats_like_count || 0,
          reply_to_comment_id: comment.reply_to_comment_id || null,
          ip_label: comment.ip_label || '',
          is_new: isNew,
          is_read: false,
          detected_at: comment.create_time || now,
          first_detected_at: now,
          created_at: now,
        };
      });

      // 3. 筛选出新评论
      const newComments = allComments.filter((c) => c.is_new);

      logger.info(
        `Video ${video.aweme_id} (platform_user: ${platformUserId}): ${allComments.length} total, ${newComments.length} new`
      );

      return {
        newComments,
        allComments,
        stats: {
          total: allComments.length,
          new: newComments.length,
          existing: existingIds.length,
        },
      };
    } catch (error) {
      logger.error('Failed to process comments incrementally:', error);
      throw error;
    }
  }

  /**
   * 生成新评论通知
   * @param {Array} newComments - 新评论列表
   * @param {Object} video - 作品对象
   * @param {string} accountId - 账户ID
   * @returns {Array} 通知对象列表
   */
  static generateCommentNotifications(newComments, video, accountId) {
    if (newComments.length === 0) {
      return [];
    }

    const notifications = [];

    // 如果新评论较多，生成汇总通知
    if (newComments.length > 5) {
      notifications.push({
        type: 'comment',
        accountId,
        title: `《${video.title}》收到 ${newComments.length} 条新评论`,
        content: newComments[0].content,
        data: {
          video,
          commentCount: newComments.length,
          firstComment: newComments[0],
        },
        relatedId: video.aweme_id,
        priority: 'normal',
      });
    } else {
      // 如果新评论较少，为每条生成通知
      newComments.forEach((comment) => {
        notifications.push({
          type: 'comment',
          accountId,
          title: `${comment.author_name} 评论了《${video.title}》`,
          content: comment.content,
          data: {
            video,
            comment,
          },
          relatedId: comment.platform_comment_id,
          priority: 'normal',
        });
      });
    }

    return notifications;
  }

  /**
   * 合并作品数据
   * @param {Array} videos - 作品列表
   * @param {Function} getExistingVideos - 获取现有作品的函数
   * @returns {Object} { newVideos, allVideos }
   */
  static async mergeVideos(videos, getExistingVideos) {
    try {
      // 获取现有作品
      const existingVideos = await getExistingVideos();
      const existingAwemeIds = new Set(existingVideos.map((v) => v.aweme_id));

      // 区分新旧作品
      const newVideos = videos.filter((v) => !existingAwemeIds.has(v.aweme_id));

      logger.info(
        `Videos: ${videos.length} total, ${newVideos.length} new, ${existingVideos.length} existing`
      );

      return {
        newVideos,
        allVideos: videos,
      };
    } catch (error) {
      logger.error('Failed to merge videos:', error);
      return { newVideos: videos, allVideos: videos };
    }
  }

  /**
   * 计算爬取统计信息
   * @param {Array} results - 每个作品的爬取结果
   * @returns {Object} 统计信息
   */
  static calculateCrawlStats(results) {
    const stats = {
      total_videos: results.length,
      total_comments: 0,
      new_comments: 0,
      total_notifications: 0,
      videos_with_new_comments: 0,
    };

    results.forEach((result) => {
      stats.total_comments += result.stats.total;
      stats.new_comments += result.stats.new;

      if (result.stats.new > 0) {
        stats.videos_with_new_comments++;
      }

      if (result.notifications) {
        stats.total_notifications += result.notifications.length;
      }
    });

    return stats;
  }
}

module.exports = IncrementalCrawlService;
