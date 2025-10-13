import axios from 'axios';
import { message } from 'antd';

// 创建 axios 实例
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api/v1',
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
    const errorMessage = error.response?.data?.error || error.message || '请求失败';
    message.error(errorMessage);
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
  updateAccount: (id, data) => api.put(`/accounts/${id}`, data),

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
  updateProxy: (id, data) => api.put(`/proxies/${id}`, data),

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

export default api;
