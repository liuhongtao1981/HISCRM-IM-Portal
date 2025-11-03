import axios from 'axios';
import { message } from 'antd';

// 创建 axios 实例
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || `${process.env.REACT_APP_MASTER_URL || 'http://localhost:3000'}/api/v1`,
  timeout: 10000,
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 可以在这里添加 token 等认证信息
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    // 如果请求配置中设置了 silent: true，则不显示错误消息
    if (!error.config?.silent) {
      const errorMessage = error.response?.data?.error || error.message || '请求失败';
      message.error(errorMessage);
    }
    return Promise.reject(error);
  }
);

// =========================
// 账户相关 API
// =========================

export const accountsAPI = {
  // 获取账户列表
  getAccounts: () => api.get('/accounts'),

  // 创建账户
  createAccount: (data) => api.post('/accounts', data),

  // 更新账户
  updateAccount: (id, data) => api.patch(`/accounts/${id}`, data),

  // 删除账户
  deleteAccount: (id) => api.delete(`/accounts/${id}`),
};

// =========================
// Worker 相关 API
// =========================

export const workersAPI = {
  // 获取 Worker 列表
  getWorkers: () => api.get('/workers'),

  // 获取 Worker 详情
  getWorker: (id) => api.get(`/workers/${id}`),

  // Worker 配置管理
  getWorkerConfigs: () => api.get('/worker-configs'),
  createWorkerConfig: (data) => api.post('/worker-configs', data),
  updateWorkerConfig: (id, data) => api.patch(`/worker-configs/${id}`, data),
  deleteWorkerConfig: (id) => api.delete(`/worker-configs/${id}`),

  // Worker 生命周期控制
  startWorker: (id) => api.post(`/worker-lifecycle/${id}/start`),
  stopWorker: (id) => api.post(`/worker-lifecycle/${id}/stop`),
  restartWorker: (id) => api.post(`/worker-lifecycle/${id}/restart`),
  getWorkerStatus: (id, silent = false) => api.get(`/worker-lifecycle/${id}/status`, { silent }),
  getWorkerLogs: (id, params) => api.get(`/worker-lifecycle/${id}/logs`, { params }),
  getWorkerHealth: (id) => api.get(`/worker-lifecycle/${id}/health`),
  batchStartWorkers: (ids) => api.post('/worker-lifecycle/batch', { action: 'start', worker_ids: ids }),
  batchStopWorkers: (ids) => api.post('/worker-lifecycle/batch', { action: 'stop', worker_ids: ids }),
};

// =========================
// 代理相关 API
// =========================

export const proxiesAPI = {
  // 获取代理列表
  getProxies: () => api.get('/proxies'),

  // 创建代理
  createProxy: (data) => api.post('/proxies', data),

  // 更新代理
  updateProxy: (id, data) => api.patch(`/proxies/${id}`, data),

  // 删除代理
  deleteProxy: (id) => api.delete(`/proxies/${id}`),

  // 测试代理
  testProxy: (id) => api.post(`/proxies/${id}/test`),
};

// =========================
// 统计相关 API
// =========================

export const statisticsAPI = {
  // 获取统计数据
  getStatistics: () => api.get('/statistics'),

  // 获取消息历史
  getMessages: (params) => api.get('/messages', { params }),
};

// =========================
// 消息相关 API
// =========================

export const messagesAPI = {
  // 获取评论列表
  getComments: (params) => api.get('/comments', { params }),

  // 获取私信列表
  getDirectMessages: (params) => api.get('/direct-messages', { params }),

  // 获取消息统计
  getMessageStats: () => api.get('/messages/stats'),
};

// =========================
// 平台相关 API
// =========================

export const platformsAPI = {
  // 获取系统支持的所有平台
  getPlatforms: () => api.get('/platforms'),

  // 获取特定平台的详细信息
  getPlatform: (platform) => api.get(`/platforms/${platform}`),

  // 获取所有平台的统计汇总
  getPlatformsStats: () => api.get('/platforms/stats/summary'),
};

export default api;
