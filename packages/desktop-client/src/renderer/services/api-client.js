/**
 * API Client
 * T045: HTTP API 调用服务
 */

const MASTER_API_URL = process.env.REACT_APP_MASTER_URL || 'http://localhost:3000';

/**
 * API Client 类
 */
class ApiClient {
  constructor(baseUrl = MASTER_API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 通用请求方法
   * @param {string} endpoint - API 端点
   * @param {object} options - fetch 选项
   * @returns {Promise<object>} API 响应
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const response = await fetch(url, { ...defaultOptions, ...options });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ==================== 账户管理 API ====================

  /**
   * 获取账户列表
   * @param {object} filters - 过滤条件 { status?, platform? }
   * @returns {Promise<Array>} 账户列表
   */
  async getAccounts(filters = {}) {
    const queryParams = new URLSearchParams(filters);
    const endpoint = `/api/v1/accounts${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await this.request(endpoint);
    return response.data;
  }

  /**
   * 获取单个账户
   * @param {string} accountId - 账户ID
   * @returns {Promise<object>} 账户对象
   */
  async getAccount(accountId) {
    const response = await this.request(`/api/v1/accounts/${accountId}`);
    return response.data;
  }

  /**
   * 创建账户
   * @param {object} accountData - 账户数据
   * @returns {Promise<object>} 创建的账户
   */
  async createAccount(accountData) {
    const response = await this.request('/api/v1/accounts', {
      method: 'POST',
      body: JSON.stringify(accountData),
    });
    return response.data;
  }

  /**
   * 更新账户
   * @param {string} accountId - 账户ID
   * @param {object} updates - 更新数据
   * @returns {Promise<object>} 更新后的账户
   */
  async updateAccount(accountId, updates) {
    const response = await this.request(`/api/v1/accounts/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return response.data;
  }

  /**
   * 删除账户
   * @param {string} accountId - 账户ID
   * @returns {Promise<object>} 删除结果
   */
  async deleteAccount(accountId) {
    return this.request(`/api/v1/accounts/${accountId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 暂停账户监控
   * @param {string} accountId - 账户ID
   * @returns {Promise<object>} 更新后的账户
   */
  async pauseAccount(accountId) {
    return this.updateAccount(accountId, { status: 'paused' });
  }

  /**
   * 恢复账户监控
   * @param {string} accountId - 账户ID
   * @returns {Promise<object>} 更新后的账户
   */
  async resumeAccount(accountId) {
    return this.updateAccount(accountId, { status: 'active' });
  }

  // ==================== 系统状态 API ====================

  /**
   * 获取系统状态
   * @returns {Promise<object>} 系统状态
   */
  async getSystemStatus() {
    const response = await this.request('/api/v1/status');
    return response.data;
  }
}

// 导出单例实例
export default new ApiClient();
