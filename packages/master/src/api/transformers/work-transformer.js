/**
 * Work Transformer - 作品数据转换器
 * 转换 Master 作品格式 ↔ IM 作品格式
 */

class WorkTransformer {
  /**
   * 转换为 IM 作品格式
   */
  static toIMWork(masterWork) {
    if (!masterWork) return null;

    return {
      work_id: masterWork.id,
      platform: masterWork.platform,
      platform_work_id: masterWork.platform_work_id,
      work_type: masterWork.work_type,

      // 作品信息
      title: masterWork.title || '',
      description: masterWork.description || '',
      cover: masterWork.cover || '',
      url: masterWork.url || '',
      publish_time: this.convertTimestamp(masterWork.publish_time),

      // 统计信息
      stats: {
        total_comments: masterWork.total_comment_count || 0,
        new_comments: masterWork.new_comment_count || 0,
        likes: masterWork.like_count || 0,
        shares: masterWork.share_count || 0,
        views: masterWork.view_count || 0,
      },

      // 状态
      is_new: masterWork.is_new === 1,
      crawl_status: masterWork.crawl_status || 'pending',

      // 时间戳
      created_at: this.convertTimestamp(masterWork.created_at),
      updated_at: this.convertTimestamp(masterWork.updated_at),
      last_crawl_time: this.convertTimestamp(masterWork.last_crawl_time),
    };
  }

  /**
   * 转换为 Master 作品格式
   */
  static toMasterWork(imWork) {
    if (!imWork) return null;

    return {
      id: imWork.work_id,
      platform: imWork.platform,
      platform_work_id: imWork.platform_work_id,
      platform_user_id: imWork.platform_user_id,
      work_type: imWork.work_type,

      title: imWork.title,
      description: imWork.description,
      cover: imWork.cover,
      url: imWork.url,
      publish_time: this.convertTimestampToSeconds(imWork.publish_time),

      total_comment_count: imWork.stats?.total_comments || 0,
      new_comment_count: imWork.stats?.new_comments || 0,
      like_count: imWork.stats?.likes || 0,
      share_count: imWork.stats?.shares || 0,
      view_count: imWork.stats?.views || 0,

      is_new: imWork.is_new ? 1 : 0,
      crawl_status: imWork.crawl_status || 'pending',

      created_at: this.convertTimestampToSeconds(imWork.created_at),
      updated_at: this.convertTimestampToSeconds(imWork.updated_at),
    };
  }

  /**
   * 转换时间戳：秒 → 毫秒
   */
  static convertTimestamp(timestamp) {
    if (!timestamp) return null;
    // 如果已经是毫秒级，直接返回
    if (timestamp > 10000000000) return timestamp;
    // 否则转换为毫秒
    return timestamp * 1000;
  }

  /**
   * 转换时间戳：毫秒 → 秒
   */
  static convertTimestampToSeconds(timestamp) {
    if (!timestamp) return null;
    // 如果已经是秒级，直接返回
    if (timestamp < 10000000000) return timestamp;
    // 否则转换为秒
    return Math.floor(timestamp / 1000);
  }

  /**
   * 批量转换为 IM 格式
   */
  static toIMWorks(masterWorks) {
    if (!Array.isArray(masterWorks)) return [];
    return masterWorks.map(work => this.toIMWork(work));
  }
}

module.exports = WorkTransformer;
