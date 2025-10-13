// Jest setup file
// 可以在这里添加全局测试配置

// 设置测试超时时间
jest.setTimeout(10000);

// 模拟环境变量
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // 测试时只显示错误日志
