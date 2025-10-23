/**
 * 会话数据转换器
 * Master 格式 ↔ IM 格式
 */

class ConversationTransformer {
  /**
   * Master 会话 → IM 会话格式
   * @param {Object} masterConversation - Master 会话对象（来自 conversations 表）
   * @returns {Object} IM 会话格式
   */
  static toIMConversation(masterConversation) {
    return {
      conversation_id: masterConversation.conversation_id || masterConversation.id,
      conversation_short_id: masterConversation.conversation_short_id || '0',
      conversation_type: this.mapConversationType(masterConversation.conversation_type || (masterConversation.is_group ? 'group' : 'direct')),

      // 对方用户信息
      participant: {
        user_id: masterConversation.participant_id || masterConversation.platform_user_id,
        user_name: masterConversation.participant_name || masterConversation.platform_user_name || '未知用户',
        avatar: masterConversation.participant_avatar || masterConversation.platform_user_avatar || 'https://via.placeholder.com/150',
      },

      // 最后一条消息
      last_message: masterConversation.last_message_content ? {
        content: masterConversation.last_message_content,
        msg_type: masterConversation.last_message_type || 'text',
        create_time: this.convertTimestamp(masterConversation.last_message_time),
      } : null,

      // 未读数
      unread_count: masterConversation.unread_count || 0,

      // 会话管理字段（新增）
      is_pinned: masterConversation.is_pinned === 1 || masterConversation.is_pinned === true,
      is_muted: masterConversation.is_muted === 1 || masterConversation.is_muted === true,
      last_message_type: masterConversation.last_message_type || 'text',

      // 时间戳转换：秒 → 毫秒
      create_time: this.convertTimestamp(masterConversation.created_at),
      update_time: this.convertTimestamp(masterConversation.updated_at),

      // 额外字段
      platform: masterConversation.platform || 'douyin',
      status: masterConversation.status || 'active',
    };
  }

  /**
   * IM 会话 → Master 会话格式
   * @param {Object} imConversation - IM 会话对象
   * @returns {Object} Master 会话格式
   */
  static fromIMConversation(imConversation) {
    return {
      conversation_id: imConversation.conversation_id,
      conversation_short_id: imConversation.conversation_short_id,
      conversation_type: this.mapConversationTypeReverse(imConversation.conversation_type),

      platform_user_id: imConversation.participant?.user_id,
      platform_user_name: imConversation.participant?.user_name,
      platform_user_avatar: imConversation.participant?.avatar,

      last_message_content: imConversation.last_message?.content,
      last_message_type: imConversation.last_message_type || imConversation.last_message?.msg_type || 'text',
      last_message_time: this.convertTimestampReverse(imConversation.last_message?.create_time),

      unread_count: imConversation.unread_count || 0,

      // 会话管理字段（新增）
      is_pinned: imConversation.is_pinned ? 1 : 0,
      is_muted: imConversation.is_muted ? 1 : 0,

      created_at: this.convertTimestampReverse(imConversation.create_time),
      updated_at: this.convertTimestampReverse(imConversation.update_time),

      platform: imConversation.platform || 'douyin',
      status: imConversation.status || 'active',
    };
  }

  /**
   * 批量转换 Master 会话 → IM 会话
   * @param {Array} masterConversations - Master 会话数组
   * @returns {Array} IM 会话数组
   */
  static toIMConversationList(masterConversations) {
    if (!Array.isArray(masterConversations)) {
      return [];
    }
    return masterConversations.map(conv => this.toIMConversation(conv));
  }

  /**
   * Master 会话类型 → IM 会话类型映射
   * @param {string} masterType - Master 会话类型
   * @returns {string} IM 会话类型
   */
  static mapConversationType(masterType) {
    const typeMap = {
      'direct': 'one_on_one',
      'one_on_one': 'one_on_one',
      'group': 'group',
    };
    return typeMap[masterType] || 'one_on_one';
  }

  /**
   * IM 会话类型 → Master 会话类型映射
   * @param {string} imType - IM 会话类型
   * @returns {string} Master 会话类型
   */
  static mapConversationTypeReverse(imType) {
    const typeMap = {
      'one_on_one': 'direct',
      'group': 'group',
    };
    return typeMap[imType] || 'direct';
  }

  /**
   * 时间戳转换：秒 → 毫秒
   * @param {number} seconds - 秒级时间戳
   * @returns {number} 毫秒级时间戳
   */
  static convertTimestamp(seconds) {
    if (!seconds) return 0;
    if (seconds > 10000000000) return seconds;
    return Math.floor(seconds * 1000);
  }

  /**
   * 时间戳转换：毫秒 → 秒
   * @param {number} milliseconds - 毫秒级时间戳
   * @returns {number} 秒级时间戳
   */
  static convertTimestampReverse(milliseconds) {
    if (!milliseconds) return 0;
    if (milliseconds < 10000000000) return milliseconds;
    return Math.floor(milliseconds / 1000);
  }
}

module.exports = ConversationTransformer;
