/**
 * Comment Parser
 * T050: 评论解析器
 *
 * Mock 实现: 直接返回爬虫数据(已经是结构化的)
 * 真实实现需要从 HTML/JSON 中提取评论数据
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { parsePlatformTime } = require('@hiscrm-im/shared/utils/time-parser');

const logger = createLogger('comment-parser');

/**
 * Comment Parser 类
 */
class CommentParser {
  /**
   * 解析评论数据
   * @param {Array} rawData - 爬虫返回的原始数据
   * @returns {Array} 解析后的评论对象数组
   */
  parse(rawData) {
    if (!Array.isArray(rawData)) {
      logger.warn('Invalid rawData: expected array');
      return [];
    }

    logger.debug(`Parsing ${rawData.length} comments`);

    // Mock: 数据已经是结构化的,直接返回
    // 真实实现需要从 HTML/JSON 提取字段
    const parsedComments = rawData.map((item) => this.parseComment(item));

    logger.info(`Successfully parsed ${parsedComments.length} comments`);
    return parsedComments.filter((comment) => comment !== null);
  }

  /**
   * 解析单条评论
   * @param {object} item - 原始评论数据
   * @returns {object|null} 解析后的评论对象
   */
  parseComment(item) {
    try {
      // 验证必需字段
      if (!item.content) {
        logger.warn('Comment missing required field: content');
        return null;
      }

      // 检测时间：爬虫抓取评论的时间
      const detectedAt = item.detected_at || Math.floor(Date.now() / 1000);

      // 创建时间：评论在平台上的真实发布时间
      // 优先级：create_time（来自平台API） > item.time（相对时间） > detectedAt（默认值）
      let createdAt = detectedAt;

      if (item.create_time) {
        // 使用平台直接提供的时间戳（推荐，最准确）
        let timeValue = item.create_time;

        // 检查是否为毫秒级（13位数字）并转换为秒级
        if (timeValue > 9999999999) {
          timeValue = Math.floor(timeValue / 1000);
          logger.debug(`Comment: converted milliseconds to seconds: ${item.create_time} → ${timeValue}`);
        }

        createdAt = timeValue;
        logger.debug(`Comment: using platform create_time=${createdAt}, detected_at=${detectedAt}`);
      } else if (item.time) {
        // 如果有相对时间字符串，使用时间解析器转换
        const parsedTime = parsePlatformTime(item.time);
        if (parsedTime && parsedTime > 0) {
          createdAt = parsedTime;
          logger.debug(`Comment: parsed relative time="${item.time}" to created_at=${createdAt}, detected_at=${detectedAt}`);
        } else {
          logger.warn(`Comment: failed to parse relative time="${item.time}", using detected_at as fallback`);
        }
      } else {
        logger.debug(`Comment: no platform time info, using detected_at=${detectedAt} as created_at`);
      }

      return {
        platform_comment_id: item.platform_comment_id || null,
        content: item.content,
        author_name: item.author_name || null,
        author_id: item.author_id || null,
        post_id: item.post_id || null,
        post_title: item.post_title || null,
        detected_at: detectedAt,
        created_at: createdAt, // 平台上的真实发布时间
      };
    } catch (error) {
      logger.error('Failed to parse comment:', error);
      return null;
    }
  }

}

module.exports = CommentParser;
