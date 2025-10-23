/**
 * 消息数据转换器
 * Master 格式 ↔ IM 格式
 */

class MessageTransformer {
  /**
   * Master 消息 → IM 消息格式
   * @param {Object} masterMessage - Master 消息对象（来自 direct_messages 表）
   * @returns {Object} IM 消息格式
   */
  static toIMMessage(masterMessage) {
    return {
      msg_id: masterMessage.message_id || masterMessage.id,
      conversation_id: masterMessage.conversation_id,
      sender: {
        user_id: masterMessage.sender_id || masterMessage.platform_sender_id,
        user_name: masterMessage.sender_name || masterMessage.platform_sender_name || '未知用户',
        avatar: masterMessage.sender_avatar || 'https://via.placeholder.com/150',
      },
      receiver: {
        user_id: masterMessage.receiver_id || masterMessage.platform_receiver_id,
        user_name: masterMessage.receiver_name || masterMessage.platform_receiver_name || '未知用户',
        avatar: masterMessage.receiver_avatar || 'https://via.placeholder.com/150',
      },
      msg_type: this.mapMessageType(masterMessage.message_type),
      content: masterMessage.content,
      // 时间戳转换：秒 → 毫秒
      create_time: this.convertTimestamp(masterMessage.created_at || masterMessage.timestamp),
      status: this.mapStatus(masterMessage.status),

      // 状态字段
      is_read: masterMessage.is_read === 1 || masterMessage.is_read === true,
      is_deleted: masterMessage.is_deleted === 1 || masterMessage.is_deleted === true,
      is_recalled: masterMessage.is_recalled === 1 || masterMessage.is_recalled === true,

      // 引用回复
      reply_to_message_id: masterMessage.reply_to_message_id || null,

      // 媒体文件字段
      media_url: masterMessage.media_url || null,
      media_thumbnail: masterMessage.media_thumbnail || null,
      file_size: masterMessage.file_size || null,
      file_name: masterMessage.file_name || null,
      duration: masterMessage.duration || null,

      // 撤回时间
      recalled_at: this.convertTimestamp(masterMessage.recalled_at),

      // 其他字段
      direction: masterMessage.direction || null,
      platform: masterMessage.platform || 'douyin',
    };
  }

  /**
   * IM 消息 → Master 消息格式
   * @param {Object} imMessage - IM 消息对象
   * @returns {Object} Master 消息格式
   */
  static fromIMMessage(imMessage) {
    return {
      message_id: imMessage.msg_id,
      conversation_id: imMessage.conversation_id,
      platform_sender_id: imMessage.sender?.user_id,
      platform_sender_name: imMessage.sender?.user_name,
      sender_name: imMessage.sender?.user_name,
      platform_receiver_id: imMessage.receiver?.user_id,
      platform_receiver_name: imMessage.receiver?.user_name,
      message_type: this.mapMessageTypeReverse(imMessage.msg_type),
      content: imMessage.content,
      created_at: this.convertTimestampReverse(imMessage.create_time),

      // 状态字段
      status: this.mapStatusReverse(imMessage.status),
      is_read: imMessage.is_read ? 1 : 0,
      is_deleted: imMessage.is_deleted ? 1 : 0,
      is_recalled: imMessage.is_recalled ? 1 : 0,

      // 引用回复
      reply_to_message_id: imMessage.reply_to_message_id || null,

      // 媒体文件字段
      media_url: imMessage.media_url || null,
      media_thumbnail: imMessage.media_thumbnail || null,
      file_size: imMessage.file_size || null,
      file_name: imMessage.file_name || null,
      duration: imMessage.duration || null,

      // 撤回时间
      recalled_at: this.convertTimestampReverse(imMessage.recalled_at),

      // 其他字段
      direction: imMessage.direction || 'inbound',
      platform: imMessage.platform || 'douyin',
    };
  }

  /**
   * 批量转换 Master 消息 → IM 消息
   * @param {Array} masterMessages - Master 消息数组
   * @returns {Array} IM 消息数组
   */
  static toIMMessageList(masterMessages) {
    if (!Array.isArray(masterMessages)) {
      return [];
    }
    return masterMessages.map(msg => this.toIMMessage(msg));
  }

  /**
   * Master 消息类型 → IM 消息类型映射
   * @param {string} masterType - Master 消息类型
   * @returns {string} IM 消息类型
   */
  static mapMessageType(masterType) {
    const typeMap = {
      'text': 'text',
      'image': 'image',
      'file': 'file',
      'video': 'video',
      'audio': 'audio',
      'link': 'link',
    };
    return typeMap[masterType] || 'text';
  }

  /**
   * IM 消息类型 → Master 消息类型映射
   * @param {string} imType - IM 消息类型
   * @returns {string} Master 消息类型
   */
  static mapMessageTypeReverse(imType) {
    const typeMap = {
      'text': 'text',
      'image': 'image',
      'file': 'file',
      'video': 'video',
      'audio': 'audio',
      'link': 'link',
    };
    return typeMap[imType] || 'text';
  }

  /**
   * Master 消息状态 → IM 消息状态映射
   * @param {string} masterStatus - Master 状态
   * @returns {string} IM 状态
   */
  static mapStatus(masterStatus) {
    const statusMap = {
      'sent': 'sent',
      'delivered': 'delivered',
      'read': 'read',
      'failed': 'failed',
      'pending': 'sending',
    };
    return statusMap[masterStatus] || 'sent';
  }

  /**
   * IM 消息状态 → Master 消息状态映射
   * @param {string} imStatus - IM 状态
   * @returns {string} Master 状态
   */
  static mapStatusReverse(imStatus) {
    const statusMap = {
      'sent': 'sent',
      'delivered': 'delivered',
      'read': 'read',
      'failed': 'failed',
      'sending': 'pending',
    };
    return statusMap[imStatus] || 'sent';
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

module.exports = MessageTransformer;
