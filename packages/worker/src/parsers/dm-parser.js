/**
 * Direct Message Parser
 * T051: 私信解析器
 *
 * Mock 实现: 直接返回爬虫数据(已经是结构化的)
 * 真实实现需要从 HTML/JSON 中提取私信数据
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

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

    logger.debug(`Parsing ${rawData.length} direct messages`);

    // Mock: 数据已经是结构化的,直接返回
    // 真实实现需要从 HTML/JSON 提取字段
    const parsedMessages = rawData.map((item) => this.parseMessage(item));

    logger.info(`Successfully parsed ${parsedMessages.length} direct messages`);
    return parsedMessages.filter((message) => message !== null);
  }

  /**
   * 解析单条私信
   * @param {object} item - 原始私信数据
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

      return {
        platform_message_id: item.platform_message_id || null,
        content: item.content,
        sender_name: item.sender_name || null,
        sender_id: item.sender_id || null,
        direction: item.direction,
        detected_at: item.detected_at || Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      logger.error('Failed to parse direct message:', error);
      return null;
    }
  }
}

module.exports = DMParser;
