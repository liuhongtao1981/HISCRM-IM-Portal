/**
 * IM API 响应包装器
 * 将 Master 内部格式转换为原版 IM 格式
 */

class ResponseWrapper {
  /**
   * 成功响应（IM 格式）
   * @param {*} data - 数据
   * @param {Object} meta - 元信息（cursor, has_more 等）
   * @returns {Object} IM 格式响应
   */
  static success(data, meta = {}) {
    const response = {
      data: data,
      status_code: 0, // 0 表示成功
    };

    // 添加元信息
    if (meta.cursor !== undefined) {
      response.cursor = meta.cursor;
    }
    if (meta.has_more !== undefined) {
      response.has_more = meta.has_more;
    }
    if (meta.total !== undefined) {
      response.total = meta.total;
    }

    return response;
  }

  /**
   * 错误响应（IM 格式）
   * @param {string} message - 错误消息
   * @param {number} statusCode - IM 状态码（非 0）
   * @returns {Object} IM 格式错误响应
   */
  static error(message, statusCode = 1) {
    return {
      data: null,
      status_code: statusCode, // 非 0 表示失败
      status_msg: message,
    };
  }

  /**
   * 分页响应（IM 格式）
   * @param {Array} items - 数据项
   * @param {number} cursor - 当前游标
   * @param {boolean} hasMore - 是否有更多数据
   * @returns {Object} IM 格式分页响应
   */
  static paginated(items, cursor = 0, hasMore = false) {
    return this.success(items, {
      cursor,
      has_more: hasMore,
      total: items.length,
    });
  }

  /**
   * 列表响应（IM 格式 - 带 users/messages/conversations 包装）
   * @param {Array} items - 数据项
   * @param {string} key - 数据键名（如 'users', 'messages', 'conversations'）
   * @param {Object} meta - 元信息
   * @returns {Object} IM 格式列表响应
   */
  static list(items, key, meta = {}) {
    const data = {
      [key]: items,
    };

    // 添加分页信息
    if (meta.cursor !== undefined) {
      data.cursor = meta.cursor;
    }
    if (meta.has_more !== undefined) {
      data.has_more = meta.has_more;
    }

    return this.success(data);
  }

  /**
   * Master 错误 → IM 错误码映射
   * @param {Error} error - 错误对象
   * @returns {number} IM 状态码
   */
  static mapErrorCode(error) {
    const errorCodeMap = {
      'NOT_FOUND': 404,
      'UNAUTHORIZED': 401,
      'FORBIDDEN': 403,
      'BAD_REQUEST': 400,
      'INTERNAL_ERROR': 500,
    };

    return errorCodeMap[error.code] || 1;
  }
}

module.exports = ResponseWrapper;
