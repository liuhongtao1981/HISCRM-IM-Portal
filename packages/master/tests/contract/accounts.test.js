/**
 * 账户管理API契约测试
 * T028-T031: 测试所有账户CRUD端点
 */

const request = require('supertest');
const { initDatabase } = require('../../src/database/init');
const express = require('express');

// 测试用Express应用
let app;
let db;

beforeAll(() => {
  // 使用内存数据库进行测试
  db = initDatabase(':memory:');

  // 创建测试Express应用
  app = express();
  app.use(express.json());

  // 导入路由 (这些路由将在实现阶段创建)
  try {
    const accountsRouter = require('../../src/api/routes/accounts');
    app.use('/api/v1/accounts', accountsRouter(db));
  } catch (error) {
    // 路由还未实现，跳过
    console.log('Accounts routes not yet implemented');
  }
});

afterAll(() => {
  if (db) db.close();
});

beforeEach(() => {
  // 清空accounts表
  if (db) {
    db.prepare('DELETE FROM accounts').run();
  }
});

describe('POST /api/v1/accounts', () => {
  test('T028: 应该成功创建账户', async () => {
    const newAccount = {
      platform: 'douyin',
      account_name: '测试抖音账号',
      account_id: 'dy123456',
      credentials: { cookies: 'mock_cookies' },
      monitor_interval: 30,
    };

    const response = await request(app)
      .post('/api/v1/accounts')
      .send(newAccount)
      .expect('Content-Type', /json/)
      .expect(201);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.platform).toBe('douyin');
    expect(response.body.data.account_name).toBe('测试抖音账号');
    expect(response.body.data.status).toBe('active');
    expect(response.body.data.credentials).toBeDefined(); // 应该是加密的
  });

  test('T028: 应该拒绝无效的平台', async () => {
    const invalidAccount = {
      platform: 'invalid_platform',
      account_name: '测试账号',
      account_id: 'test123',
      credentials: { cookies: 'mock' },
    };

    const response = await request(app)
      .post('/api/v1/accounts')
      .send(invalidAccount)
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body.error).toContain('platform');
  });

  test('T028: 应该拒绝缺少必填字段', async () => {
    const incompleteAccount = {
      platform: 'douyin',
      account_name: '测试账号',
      // 缺少 account_id 和 credentials
    };

    const response = await request(app)
      .post('/api/v1/accounts')
      .send(incompleteAccount)
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('success', false);
  });
});

describe('GET /api/v1/accounts', () => {
  test('T029: 应该返回所有账户列表', async () => {
    // 先创建几个账户
    const account1 = {
      platform: 'douyin',
      account_name: '账户1',
      account_id: 'dy001',
      credentials: { cookies: 'mock1' },
    };
    const account2 = {
      platform: 'douyin',
      account_name: '账户2',
      account_id: 'dy002',
      credentials: { cookies: 'mock2' },
    };

    await request(app).post('/api/v1/accounts').send(account1);
    await request(app).post('/api/v1/accounts').send(account2);

    const response = await request(app)
      .get('/api/v1/accounts')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBe(2);
    expect(response.body.data[0]).toHaveProperty('id');
    expect(response.body.data[0]).toHaveProperty('platform');
  });

  test('T029: 应该支持按状态过滤', async () => {
    const response = await request(app)
      .get('/api/v1/accounts?status=active')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toBeInstanceOf(Array);
  });
});

describe('GET /api/v1/accounts/:id', () => {
  test('T029: 应该返回指定账户的详情', async () => {
    // 先创建账户
    const createResponse = await request(app)
      .post('/api/v1/accounts')
      .send({
        platform: 'douyin',
        account_name: '测试账号',
        account_id: 'dy123',
        credentials: { cookies: 'mock' },
      });

    const accountId = createResponse.body.data.id;

    const response = await request(app)
      .get(`/api/v1/accounts/${accountId}`)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data.id).toBe(accountId);
    expect(response.body.data.account_name).toBe('测试账号');
  });

  test('T029: 应该返回404如果账户不存在', async () => {
    const response = await request(app)
      .get('/api/v1/accounts/nonexistent-id')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toHaveProperty('success', false);
  });
});

describe('PATCH /api/v1/accounts/:id', () => {
  test('T030: 应该成功更新账户', async () => {
    // 先创建账户
    const createResponse = await request(app)
      .post('/api/v1/accounts')
      .send({
        platform: 'douyin',
        account_name: '原始名称',
        account_id: 'dy123',
        credentials: { cookies: 'mock' },
      });

    const accountId = createResponse.body.data.id;

    // 更新账户
    const response = await request(app)
      .patch(`/api/v1/accounts/${accountId}`)
      .send({
        account_name: '更新后的名称',
        monitor_interval: 60,
      })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data.account_name).toBe('更新后的名称');
    expect(response.body.data.monitor_interval).toBe(60);
  });

  test('T030: 应该支持暂停账户监控', async () => {
    const createResponse = await request(app)
      .post('/api/v1/accounts')
      .send({
        platform: 'douyin',
        account_name: '测试账号',
        account_id: 'dy123',
        credentials: { cookies: 'mock' },
      });

    const accountId = createResponse.body.data.id;

    const response = await request(app)
      .patch(`/api/v1/accounts/${accountId}`)
      .send({ status: 'paused' })
      .expect(200);

    expect(response.body.data.status).toBe('paused');
  });
});

describe('DELETE /api/v1/accounts/:id', () => {
  test('T031: 应该成功删除账户', async () => {
    // 先创建账户
    const createResponse = await request(app)
      .post('/api/v1/accounts')
      .send({
        platform: 'douyin',
        account_name: '待删除账号',
        account_id: 'dy123',
        credentials: { cookies: 'mock' },
      });

    const accountId = createResponse.body.data.id;

    // 删除账户
    const response = await request(app)
      .delete(`/api/v1/accounts/${accountId}`)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);

    // 验证账户已删除
    await request(app).get(`/api/v1/accounts/${accountId}`).expect(404);
  });

  test('T031: 删除不存在的账户应返回404', async () => {
    const response = await request(app)
      .delete('/api/v1/accounts/nonexistent-id')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toHaveProperty('success', false);
  });
});
