/**
 * Discussion Transformer - 讨论数据转换器
 * 转换 Master 讨论格式 ↔ IM 讨论格式
 */

class DiscussionTransformer {
  /**
   * 转换为 IM 讨论格式
   */
  static toIMDiscussion(masterDiscussion) {
    if (!masterDiscussion) return null;

    return {
      discussion_id: masterDiscussion.id,
      platform: masterDiscussion.platform,
      platform_discussion_id: masterDiscussion.platform_discussion_id,

      // 父评论引用
      parent_comment_id: masterDiscussion.parent_comment_id,

      // 讨论内容
      content: masterDiscussion.content || '',
      author: {
        author_id: masterDiscussion.author_id || '',
        author_name: masterDiscussion.author_name || '未知用户',
      },

      // 关联作品信息
      work_id: masterDiscussion.work_id,
      post_id: masterDiscussion.post_id,
      post_title: masterDiscussion.post_title,

      // 状态
      is_read: masterDiscussion.is_read === 1,
      is_new: masterDiscussion.is_new === 1,

      // 时间戳
      detected_at: this.convertTimestamp(masterDiscussion.detected_at),
      created_at: this.convertTimestamp(masterDiscussion.created_at),
    };
  }

  /**
   * 转换为 Master 讨论格式
   */
  static toMasterDiscussion(imDiscussion) {
    if (!imDiscussion) return null;

    return {
      id: imDiscussion.discussion_id,
      platform: imDiscussion.platform,
      platform_user_id: imDiscussion.platform_user_id,
      platform_discussion_id: imDiscussion.platform_discussion_id,

      parent_comment_id: imDiscussion.parent_comment_id,

      content: imDiscussion.content,
      author_name: imDiscussion.author?.author_name,
      author_id: imDiscussion.author?.author_id,

      work_id: imDiscussion.work_id,
      post_id: imDiscussion.post_id,
      post_title: imDiscussion.post_title,

      is_read: imDiscussion.is_read ? 1 : 0,
      is_new: imDiscussion.is_new ? 1 : 0,

      detected_at: this.convertTimestampToSeconds(imDiscussion.detected_at),
      created_at: this.convertTimestampToSeconds(imDiscussion.created_at),
    };
  }

  /**
   * 转换时间戳：秒 → 毫秒
   */
  static convertTimestamp(timestamp) {
    if (!timestamp) return null;
    if (timestamp > 10000000000) return timestamp;
    return timestamp * 1000;
  }

  /**
   * 转换时间戳：毫秒 → 秒
   */
  static convertTimestampToSeconds(timestamp) {
    if (!timestamp) return null;
    if (timestamp < 10000000000) return timestamp;
    return Math.floor(timestamp / 1000);
  }

  /**
   * 批量转换为 IM 格式
   */
  static toIMDiscussions(masterDiscussions) {
    if (!Array.isArray(masterDiscussions)) return [];
    return masterDiscussions.map(discussion => this.toIMDiscussion(discussion));
  }
}

module.exports = DiscussionTransformer;
