/**
 * 错误处理工具模块
 * 提供统一的错误类型定义、分类和处理策略
 */

/**
 * 登录错误类
 */
class LoginError extends Error {
  constructor(type, message, details = {}) {
    super(message);
    this.name = 'LoginError';
    this.type = type;
    this.details = details;
    this.timestamp = Date.now();
    this.retriable = false;
  }

  /**
   * 标记错误为可重试
   */
  setRetriable(retriable = true) {
    this.retriable = retriable;
    return this;
  }

  /**
   * 转换为JSON对象
   */
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      retriable: this.retriable,
    };
  }
}

/**
 * 错误类型常量
 */
const ErrorTypes = {
  // 网络相关
  NETWORK_ERROR: 'network_error',           // 网络连接问题
  NETWORK_TIMEOUT: 'network_timeout',       // 网络超时
  DNS_ERROR: 'dns_error',                   // DNS 解析失败

  // 代理相关
  PROXY_ERROR: 'proxy_error',               // 代理连接失败
  PROXY_AUTH_ERROR: 'proxy_auth_error',     // 代理认证失败
  PROXY_TIMEOUT: 'proxy_timeout',           // 代理超时

  // 超时相关
  TIMEOUT_ERROR: 'timeout_error',           // 一般超时
  PAGE_LOAD_TIMEOUT: 'page_load_timeout',   // 页面加载超时
  NAVIGATION_TIMEOUT: 'navigation_timeout', // 导航超时

  // 二维码相关
  QR_CODE_ERROR: 'qr_code_error',          // 二维码相关错误
  QR_CODE_NOT_FOUND: 'qr_code_not_found',  // 找不到二维码
  QR_CODE_EXPIRED: 'qr_code_expired',      // 二维码过期
  QR_CODE_EXTRACT_FAILED: 'qr_code_extract_failed', // 二维码提取失败

  // 页面相关
  PAGE_ERROR: 'page_error',                 // 页面加载错误
  PAGE_CRASHED: 'page_crashed',             // 页面崩溃
  NAVIGATION_ERROR: 'navigation_error',     // 导航错误

  // 浏览器相关
  BROWSER_ERROR: 'browser_error',           // 浏览器错误
  BROWSER_CRASHED: 'browser_crashed',       // 浏览器崩溃
  BROWSER_DISCONNECTED: 'browser_disconnected', // 浏览器断开连接
  CONTEXT_ERROR: 'context_error',           // 上下文错误

  // 登录流程相关
  LOGIN_TIMEOUT: 'login_timeout',           // 登录超时
  LOGIN_CANCELLED: 'login_cancelled',       // 登录取消
  LOGIN_FAILED: 'login_failed',             // 登录失败

  // 其他
  UNKNOWN_ERROR: 'unknown_error',           // 未知错误
  VALIDATION_ERROR: 'validation_error',     // 验证错误
};

/**
 * 错误分类器
 * 根据错误消息判断错误类型
 */
class ErrorClassifier {
  /**
   * 分类错误
   * @param {Error} error - 错误对象
   * @returns {string} 错误类型
   */
  static classify(error) {
    if (!error) return ErrorTypes.UNKNOWN_ERROR;

    const message = error.message || error.toString() || '';
    const stack = error.stack || '';
    const combined = `${message} ${stack}`.toLowerCase();

    // 网络错误
    if (this._isNetworkError(combined)) {
      if (combined.includes('timeout')) {
        return ErrorTypes.NETWORK_TIMEOUT;
      }
      if (combined.includes('dns') || combined.includes('getaddrinfo')) {
        return ErrorTypes.DNS_ERROR;
      }
      return ErrorTypes.NETWORK_ERROR;
    }

    // 代理错误
    if (this._isProxyError(combined)) {
      if (combined.includes('auth') || combined.includes('407')) {
        return ErrorTypes.PROXY_AUTH_ERROR;
      }
      if (combined.includes('timeout')) {
        return ErrorTypes.PROXY_TIMEOUT;
      }
      return ErrorTypes.PROXY_ERROR;
    }

    // 超时错误
    if (this._isTimeoutError(combined)) {
      if (combined.includes('navigation')) {
        return ErrorTypes.NAVIGATION_TIMEOUT;
      }
      if (combined.includes('page') || combined.includes('load')) {
        return ErrorTypes.PAGE_LOAD_TIMEOUT;
      }
      return ErrorTypes.TIMEOUT_ERROR;
    }

    // 二维码错误
    if (this._isQRCodeError(combined)) {
      if (combined.includes('not found') || combined.includes('找不到')) {
        return ErrorTypes.QR_CODE_NOT_FOUND;
      }
      if (combined.includes('expired') || combined.includes('过期')) {
        return ErrorTypes.QR_CODE_EXPIRED;
      }
      if (combined.includes('extract') || combined.includes('提取')) {
        return ErrorTypes.QR_CODE_EXTRACT_FAILED;
      }
      return ErrorTypes.QR_CODE_ERROR;
    }

    // 页面错误
    if (this._isPageError(combined)) {
      if (combined.includes('crashed') || combined.includes('崩溃')) {
        return ErrorTypes.PAGE_CRASHED;
      }
      if (combined.includes('navigation')) {
        return ErrorTypes.NAVIGATION_ERROR;
      }
      return ErrorTypes.PAGE_ERROR;
    }

    // 浏览器错误
    if (this._isBrowserError(combined)) {
      if (combined.includes('crashed')) {
        return ErrorTypes.BROWSER_CRASHED;
      }
      if (combined.includes('disconnected') || combined.includes('closed')) {
        return ErrorTypes.BROWSER_DISCONNECTED;
      }
      if (combined.includes('context')) {
        return ErrorTypes.CONTEXT_ERROR;
      }
      return ErrorTypes.BROWSER_ERROR;
    }

    // 登录流程错误
    if (this._isLoginError(combined)) {
      if (combined.includes('timeout')) {
        return ErrorTypes.LOGIN_TIMEOUT;
      }
      if (combined.includes('cancel')) {
        return ErrorTypes.LOGIN_CANCELLED;
      }
      return ErrorTypes.LOGIN_FAILED;
    }

    return ErrorTypes.UNKNOWN_ERROR;
  }

  /**
   * 判断是否为可重试错误
   * @param {string} errorType - 错误类型
   * @returns {boolean}
   */
  static isRetriable(errorType) {
    const retriableErrors = [
      ErrorTypes.NETWORK_ERROR,
      ErrorTypes.NETWORK_TIMEOUT,
      ErrorTypes.DNS_ERROR,
      ErrorTypes.PROXY_TIMEOUT,
      ErrorTypes.TIMEOUT_ERROR,
      ErrorTypes.PAGE_LOAD_TIMEOUT,
      ErrorTypes.NAVIGATION_TIMEOUT,
      ErrorTypes.QR_CODE_NOT_FOUND,
      ErrorTypes.PAGE_ERROR,
      ErrorTypes.NAVIGATION_ERROR,
    ];

    return retriableErrors.includes(errorType);
  }

  // 私有辅助方法
  static _isNetworkError(msg) {
    const patterns = [
      'net::err',
      'econnrefused',
      'econnreset',
      'etimedout',
      'enetunreach',
      'enotfound',
      'network error',
      'failed to fetch',
    ];
    return patterns.some(p => msg.includes(p));
  }

  static _isProxyError(msg) {
    const patterns = [
      'proxy',
      'err_proxy_connection_failed',
      'err_tunnel_connection_failed',
    ];
    return patterns.some(p => msg.includes(p));
  }

  static _isTimeoutError(msg) {
    const patterns = [
      'timeout',
      'timed out',
      '超时',
    ];
    return patterns.some(p => msg.includes(p));
  }

  static _isQRCodeError(msg) {
    const patterns = [
      'qr code',
      'qrcode',
      '二维码',
    ];
    return patterns.some(p => msg.includes(p));
  }

  static _isPageError(msg) {
    const patterns = [
      'page',
      'navigation',
      'frame',
      '页面',
    ];
    return patterns.some(p => msg.includes(p));
  }

  static _isBrowserError(msg) {
    const patterns = [
      'browser',
      'context',
      'playwright',
      '浏览器',
    ];
    return patterns.some(p => msg.includes(p));
  }

  static _isLoginError(msg) {
    const patterns = [
      'login',
      '登录',
    ];
    return patterns.some(p => msg.includes(p));
  }
}

/**
 * 错误处理策略
 */
class ErrorStrategy {
  /**
   * 获取错误处理策略
   * @param {string} errorType - 错误类型
   * @returns {Object} 处理策略
   */
  static getStrategy(errorType) {
    const strategies = {
      [ErrorTypes.NETWORK_ERROR]: {
        shouldRetry: true,
        maxRetries: 3,
        baseDelay: 2000,
        action: 'retry',
        message: '网络错误，正在重试...',
      },
      [ErrorTypes.NETWORK_TIMEOUT]: {
        shouldRetry: true,
        maxRetries: 3,
        baseDelay: 3000,
        increaseTimeout: true,
        action: 'retry_with_longer_timeout',
        message: '网络超时，正在重试（增加超时时间）...',
      },
      [ErrorTypes.PROXY_ERROR]: {
        shouldRetry: true,
        maxRetries: 2,
        baseDelay: 1000,
        useFallbackProxy: true,
        action: 'try_fallback_proxy',
        message: '代理连接失败，尝试备用代理...',
      },
      [ErrorTypes.PROXY_TIMEOUT]: {
        shouldRetry: true,
        maxRetries: 2,
        baseDelay: 2000,
        useFallbackProxy: true,
        action: 'try_fallback_proxy',
        message: '代理超时，尝试备用代理...',
      },
      [ErrorTypes.PAGE_LOAD_TIMEOUT]: {
        shouldRetry: true,
        maxRetries: 3,
        baseDelay: 2000,
        increaseTimeout: true,
        action: 'retry_with_longer_timeout',
        message: '页面加载超时，正在重试...',
      },
      [ErrorTypes.QR_CODE_NOT_FOUND]: {
        shouldRetry: true,
        maxRetries: 3,
        baseDelay: 3000,
        reloadPage: true,
        action: 'reload_page',
        message: '未找到二维码，重新加载页面...',
      },
      [ErrorTypes.QR_CODE_EXPIRED]: {
        shouldRetry: true,
        maxRetries: 5,
        baseDelay: 1000,
        refreshQRCode: true,
        action: 'refresh_qrcode',
        message: '二维码已过期，正在刷新...',
      },
      [ErrorTypes.PAGE_CRASHED]: {
        shouldRetry: true,
        maxRetries: 2,
        baseDelay: 3000,
        reloadPage: true,
        action: 'reload_page',
        message: '页面崩溃，正在重新加载...',
      },
      [ErrorTypes.BROWSER_CRASHED]: {
        shouldRetry: false,
        restartBrowser: true,
        action: 'restart_browser',
        message: '浏览器崩溃，需要重启浏览器',
      },
      [ErrorTypes.LOGIN_TIMEOUT]: {
        shouldRetry: false,
        action: 'notify_user',
        message: '登录超时，请重新扫码',
      },
      [ErrorTypes.UNKNOWN_ERROR]: {
        shouldRetry: false,
        action: 'log_and_fail',
        message: '未知错误，登录失败',
      },
    };

    return strategies[errorType] || strategies[ErrorTypes.UNKNOWN_ERROR];
  }
}

module.exports = {
  LoginError,
  ErrorTypes,
  ErrorClassifier,
  ErrorStrategy,
};
