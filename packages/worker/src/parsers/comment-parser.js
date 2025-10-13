/**
 * Comment Parser
 * T050: 评论解析器
 *
 * Mock 实现: 直接返回爬虫数据(已经是结构化的)
 * 真实实现需要从 HTML/JSON 中提取评论数据
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

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

      return {
        platform_comment_id: item.platform_comment_id || null,
        content: item.content,
        author_name: item.author_name || null,
        author_id: item.author_id || null,
        post_id: item.post_id || null,
        post_title: item.post_title || null,
        detected_at: item.detected_at || Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      logger.error('Failed to parse comment:', error);
      return null;
    }
  }
}

module.exports = CommentParser;
