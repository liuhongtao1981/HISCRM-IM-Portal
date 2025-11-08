/**
 * Direct Message Parser
 * T051: 私信解析器
 *
 * Mock 实现: 直接返回爬虫数据(已经是结构化的)
 * 真实实现需要从 HTML/JSON 中提取私信数据
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { parsePlatformTime } = require('@hiscrm-im/shared/utils/time-parser');

const logger = createLogger('dm-parser');

/**
 * Direct Message Parser 类
 */
class DMParser {
  /**
   * 解析私信数据
   * @param {Array} rawData - 爬虫返回的原始数据
   * @returns {Array} 解析后的私信对象数组
   */
  parse(rawData) {
    if (!Array.isArray(rawData)) {
      logger.warn('Invalid rawData: expected array');
      return [];
    }
    // Mock: 数据已经是结构化的,直接返回
    // 真实实现需要从 HTML/JSON 提取字段
    const parsedMessages = rawData.map((item) => this.parseMessage(item));

    logger.info(`Successfully parsed ${parsedMessages.length} direct messages`);
    return parsedMessages.filter((message) => message !== null);
  }

  /**
   * 解析单条私信
   * @param {object} item - 原始私信数据（来自爬虫）
   * @returns {object|null} 解析后的私信对象
   */
  parseMessage(item) {
    try {
      // 验证必需字段
      if (!item.content) {
        logger.warn('Direct message missing required field: content');
        return null;
      }

      if (!item.direction || !['inbound', 'outbound'].includes(item.direction)) {
        logger.warn('Direct message missing or invalid direction');
        return null;
      }

      const detectedAt = item.detected_at || Math.floor(Date.now() / 1000);

      // 新版爬虫直接提供真实的created_at时间戳
      // 无需再进行复杂的时间转换
      let createdAt = item.created_at || detectedAt;

      // 验证created_at是否合理（不是未来时间，不是太远的过去）
      const now = Math.floor(Date.now() / 1000);
      const dayInSeconds = 86400;
      const maxAgeSeconds = 365 * dayInSeconds; // 最多一年前

      if (createdAt > now) {
        // 如果是未来时间，可能是数据错误，使用detected_at
        logger.warn(`DM created_at is in future: ${createdAt} > ${now}, using detected_at`);
        createdAt = detectedAt;
      } else if (createdAt < (now - maxAgeSeconds)) {
        // 如果超过一年前，可能是数据错误
        logger.warn(`DM created_at is too old: ${createdAt}, using detected_at`);
        createdAt = detectedAt;
      }
      return {
        platform_message_id: item.platform_message_id || null,
        content: item.content,
        sender_name: item.sender_name || null,
        sender_id: item.sender_id || null,
        direction: item.direction,
        detected_at: detectedAt,
        created_at: createdAt, // 平台上的真实消息时间（来自item.createdTime）
        sec_uid: item.sec_uid || null,
        is_group_chat: item.is_group_chat || false,
      };
    } catch (error) {
      logger.error('Failed to parse direct message:', error);
      return null;
    }
  }

}

module.exports = DMParser;
