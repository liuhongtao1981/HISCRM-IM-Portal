/**
 * 账户管理集成测试
 * T032: 测试完整的账户CRUD流程
 */

const request = require('supertest');
const { initDatabase } = require('../../src/database/init');
const express = require('express');

let app;
let db;

beforeAll(() => {
  db = initDatabase(':memory:');

  app = express();
  app.use(express.json());

  try {
    const accountsRouter = require('../../src/api/routes/accounts');
    app.use('/api/v1/accounts', accountsRouter(db));
  } catch (error) {
    console.log('Accounts routes not yet implemented');
  }
});

afterAll(() => {
  if (db) db.close();
});

describe('T032: 完整账户CRUD流程', () => {
  test('应该完成完整的账户生命周期', async () => {
    // 1. 创建账户
    const createResponse = await request(app)
      .post('/api/v1/accounts')
      .send({
        platform: 'douyin',
        account_name: '我的抖音账号',
        account_id: 'dy123456',
        credentials: {
          cookies: 'session_id=abc123; user_id=456',
          token: 'mock_token',
        },
        monitor_interval: 30,
      })
      .expect(201);

    expect(createResponse.body.success).toBe(true);
    const accountId = createResponse.body.data.id;
    expect(accountId).toBeDefined();

    // 2. 读取账户列表
    const listResponse = await request(app).get('/api/v1/accounts').expect(200);

    expect(listResponse.body.data).toBeInstanceOf(Array);
    expect(listResponse.body.data.length).toBe(1);
    expect(listResponse.body.data[0].id).toBe(accountId);

    // 3. 读取单个账户
    const getResponse = await request(app).get(`/api/v1/accounts/${accountId}`).expect(200);

    expect(getResponse.body.data.account_name).toBe('我的抖音账号');
    expect(getResponse.body.data.status).toBe('active');

    // 4. 更新账户
    const updateResponse = await request(app)
      .patch(`/api/v1/accounts/${accountId}`)
      .send({
        account_name: '更新后的账号名',
        monitor_interval: 60,
      })
      .expect(200);

    expect(updateResponse.body.data.account_name).toBe('更新后的账号名');
    expect(updateResponse.body.data.monitor_interval).toBe(60);

    // 5. 暂停账户
    const pauseResponse = await request(app)
      .patch(`/api/v1/accounts/${accountId}`)
      .send({ status: 'paused' })
      .expect(200);

    expect(pauseResponse.body.data.status).toBe('paused');

    // 6. 恢复账户
    const resumeResponse = await request(app)
      .patch(`/api/v1/accounts/${accountId}`)
      .send({ status: 'active' })
      .expect(200);

    expect(resumeResponse.body.data.status).toBe('active');

    // 7. 删除账户
    await request(app).delete(`/api/v1/accounts/${accountId}`).expect(200);

    // 8. 验证账户已删除
    await request(app).get(`/api/v1/accounts/${accountId}`).expect(404);

    // 9. 验证列表为空
    const emptyListResponse = await request(app).get('/api/v1/accounts').expect(200);
    expect(emptyListResponse.body.data.length).toBe(0);
  });

  test('应该支持多账户管理', async () => {
    // 创建3个账户
    const accounts = [
      { platform: 'douyin', account_name: '账户1', account_id: 'dy001', credentials: { c: '1' } },
      { platform: 'douyin', account_name: '账户2', account_id: 'dy002', credentials: { c: '2' } },
      { platform: 'douyin', account_name: '账户3', account_id: 'dy003', credentials: { c: '3' } },
    ];

    const createdIds = [];
    for (const account of accounts) {
      const response = await request(app).post('/api/v1/accounts').send(account).expect(201);
      createdIds.push(response.body.data.id);
    }

    // 验证列表包含所有账户
    const listResponse = await request(app).get('/api/v1/accounts').expect(200);
    expect(listResponse.body.data.length).toBe(3);

    // 删除第二个账户
    await request(app).delete(`/api/v1/accounts/${createdIds[1]}`).expect(200);

    // 验证剩余2个账户
    const updatedListResponse = await request(app).get('/api/v1/accounts').expect(200);
    expect(updatedListResponse.body.data.length).toBe(2);
  });

  test('应该验证账户唯一性约束', async () => {
    // 创建第一个账户
    await request(app)
      .post('/api/v1/accounts')
      .send({
        platform: 'douyin',
        account_name: '账户1',
        account_id: 'dy_unique',
        credentials: { c: '1' },
      })
      .expect(201);

    // 尝试创建相同platform+account_id的账户
    const duplicateResponse = await request(app)
      .post('/api/v1/accounts')
      .send({
        platform: 'douyin',
        account_name: '账户2',
        account_id: 'dy_unique', // 相同
        credentials: { c: '2' },
      })
      .expect(400);

    expect(duplicateResponse.body.success).toBe(false);
    expect(duplicateResponse.body.error).toContain('already exists');
  });
});
