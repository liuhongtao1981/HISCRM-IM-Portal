import React, { useEffect, useState } from 'react';
import {
  Table,
  Tag,
  Space,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  message,
  Card,
  Row,
  Col,
  Statistic,
  Descriptions,
  Badge,
  Tooltip,
  Popconfirm,
  Drawer,
  Tabs,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  SyncOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  ClusterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { workersAPI, proxiesAPI } from '../services/api';
import { useSocket } from '../services/socketContext';

const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

const WorkersPage = () => {
  const [configs, setConfigs] = useState([]);
  const [runtimes, setRuntimes] = useState({});
  const [proxies, setProxies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [logsDrawerVisible, setLogsDrawerVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [selectedLogs, setSelectedLogs] = useState([]);
  const [form] = Form.useForm();
  const socket = useSocket();

  // 加载 Worker 配置列表
  const loadConfigs = async () => {
    setLoading(true);
    try {
      const response = await workersAPI.getWorkerConfigs();
      const configList = response || [];  // axios拦截器已返回response.data
      setConfigs(configList);

      // 加载每个配置的运行时状态 (silent=true 避免显示未启动Worker的错误)
      const runtimePromises = configList.map((config) =>
        workersAPI.getWorkerStatus(config.id, true).catch(() => null)
      );
      const runtimeResults = await Promise.all(runtimePromises);

      const runtimeMap = {};
      configList.forEach((config, index) => {
        if (runtimeResults[index]) {
          runtimeMap[config.id] = runtimeResults[index];  // axios拦截器已返回response.data
        }
      });
      setRuntimes(runtimeMap);
    } catch (error) {
      console.error('Failed to load worker configs:', error);
      message.error('加载 Worker 配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载代理列表
  const loadProxies = async () => {
    try {
      console.log('开始加载代理列表...');
      const response = await proxiesAPI.getProxies();
      console.log('Proxies API response:', response); // 添加调试日志
      
      // 检查响应结构
      if (response && response.data) {
        console.log('设置代理数据:', response.data);
        setProxies(response.data);
      } else {
        console.warn('代理 API 响应格式异常:', response);
        setProxies([]);
      }
    } catch (error) {
      console.error('Failed to load proxies:', error);
      console.error('Error details:', error.response?.data);
      message.error('加载代理列表失败: ' + (error.response?.data?.error || error.message));
      setProxies([]);
    }
  };

  useEffect(() => {
    loadConfigs();
    loadProxies(); // 添加加载代理列表
    // 每 5 秒刷新一次状态
    const interval = setInterval(loadConfigs, 5000);
    return () => clearInterval(interval);
  }, []);

  // 监听 Socket.IO 实时更新
  useEffect(() => {
    if (!socket) return;

    const handleWorkerUpdate = (data) => {
      console.log('Worker update received:', data);
      loadConfigs(); // 收到更新时刷新列表
    };

    socket.on('worker:status_changed', handleWorkerUpdate);
    socket.on('worker:started', handleWorkerUpdate);
    socket.on('worker:stopped', handleWorkerUpdate);

    return () => {
      socket.off('worker:status_changed', handleWorkerUpdate);
      socket.off('worker:started', handleWorkerUpdate);
      socket.off('worker:stopped', handleWorkerUpdate);
    };
  }, [socket]);

  // 打开新建/编辑配置模态框
  const handleOpenConfigModal = async (config = null) => {
    setEditingConfig(config);
    // 每次打开模态框时重新加载代理列表，等待加载完成
    await loadProxies();
    
    if (config) {
      // 编辑模式
      console.log('========== 编辑模式 ==========');
      console.log('原始配置数据:', JSON.stringify(config, null, 2));
      console.log('配置中的 proxy_id:', config.proxy_id);
      console.log('proxy_id 类型:', typeof config.proxy_id);
      
      const formValues = {
        ...config,
        env_variables: config.env_variables ? JSON.stringify(config.env_variables, null, 2) : '{}',
        browser_config: config.browser_config ? JSON.stringify(config.browser_config, null, 2) : '{}',
        docker_volumes: config.docker_volumes ? JSON.stringify(config.docker_volumes, null, 2) : '[]',
      };
      
      console.log('准备设置到表单的值:', JSON.stringify(formValues, null, 2));
      console.log('表单值中的 proxy_id:', formValues.proxy_id);
      form.setFieldsValue(formValues);
      
      // 验证设置后的表单值
      setTimeout(() => {
        const currentValues = form.getFieldsValue();
        console.log('表单设置后的实际值:', JSON.stringify(currentValues, null, 2));
        console.log('表单中的 proxy_id:', form.getFieldValue('proxy_id'));
      }, 100);
    } else {
      // 新建模式
      form.resetFields();
      form.setFieldsValue({
        deployment_type: 'local',
        host: 'localhost',
        port: 4001,
        proxy_id: null, // 显式设置代理为 null
        auto_start: true,
        auto_restart: true,
        restart_delay_ms: 5000,
        max_restart_attempts: 3,
        env_variables: '{}',
        browser_config: '{"headless": true}',
        docker_volumes: '[]',
      });
      console.log('新建模式：表单已初始化，proxy_id 设为 null');
    }
    setConfigModalVisible(true);
  };

  // 保存配置
  const handleSaveConfig = async () => {
    try {
      const values = await form.validateFields();
      
      // 调试日志
      console.log('Form values:', values);
      console.log('Proxy ID from form:', values.proxy_id);

      // 解析 JSON 字段
      const payload = {
        ...values,
        // 特别处理 proxy_id 字段，确保 undefined 被转换为 null
        proxy_id: values.proxy_id === undefined ? null : values.proxy_id,
        env_variables: values.env_variables ? JSON.parse(values.env_variables) : null,
        browser_config: values.browser_config ? JSON.parse(values.browser_config) : null,
        docker_volumes: values.docker_volumes ? JSON.parse(values.docker_volumes) : null,
      };
      
      console.log('Final payload:', payload);
      console.log('Final proxy_id:', payload.proxy_id);

      if (editingConfig) {
        // 更新
        await workersAPI.updateWorkerConfig(editingConfig.id, payload);
        message.success('Worker 配置已更新');
      } else {
        // 创建
        await workersAPI.createWorkerConfig(payload);
        message.success('Worker 配置已创建');
      }

      setConfigModalVisible(false);
      form.resetFields();
      setEditingConfig(null);
      loadConfigs();
    } catch (error) {
      if (error.errorFields) {
        message.error('请检查表单输入');
      } else {
        console.error('Failed to save config:', error);
        message.error('保存配置失败');
      }
    }
  };

  // 删除配置
  const handleDeleteConfig = async (id) => {
    try {
      await workersAPI.deleteWorkerConfig(id);
      message.success('Worker 配置已删除');
      loadConfigs();
    } catch (error) {
      console.error('Failed to delete config:', error);
      message.error('删除配置失败');
    }
  };

  // 启动 Worker
  const handleStartWorker = async (id) => {
    try {
      await workersAPI.startWorker(id);
      message.success('Worker 启动命令已发送');
      setTimeout(loadConfigs, 1000); // 1秒后刷新状态
    } catch (error) {
      console.error('Failed to start worker:', error);
      message.error('启动 Worker 失败');
    }
  };

  // 停止 Worker
  const handleStopWorker = async (id) => {
    try {
      await workersAPI.stopWorker(id);
      message.success('Worker 停止命令已发送');
      setTimeout(loadConfigs, 1000);
    } catch (error) {
      console.error('Failed to stop worker:', error);
      
      // 检查具体的错误类型
      const errorMsg = error.response?.data?.message || error.message || '停止 Worker 失败';
      
      // 如果 Worker 已经停止，这不算真正的错误
      if (errorMsg.includes('is not running') || errorMsg.includes('已经停止')) {
        message.warning('Worker 已经处于停止状态');
        setTimeout(loadConfigs, 500); // 刷新状态
      } else {
        message.error(`停止 Worker 失败: ${errorMsg}`);
      }
    }
  };

  // 重启 Worker
  const handleRestartWorker = async (id) => {
    try {
      await workersAPI.restartWorker(id);
      message.success('Worker 重启命令已发送');
      setTimeout(loadConfigs, 1000);
    } catch (error) {
      console.error('Failed to restart worker:', error);
      message.error('重启 Worker 失败');
    }
  };

  // 查看详情
  const handleViewDetails = async (config) => {
    setSelectedConfig(config);
    setDetailDrawerVisible(true);
  };

  // 查看日志
  const handleViewLogs = async (config) => {
    try {
      const response = await workersAPI.getWorkerLogs(config.id, { limit: 100 });
      setSelectedLogs(response || []);  // axios拦截器已返回response.data
      setSelectedConfig(config);
      setLogsDrawerVisible(true);
    } catch (error) {
      console.error('Failed to load logs:', error);
      message.error('加载日志失败');
    }
  };

  // 获取状态标签
  const getStatusTag = (status) => {
    const statusConfig = {
      running: { color: 'success', icon: <CheckCircleOutlined />, text: '运行中' },
      stopped: { color: 'default', icon: <CloseCircleOutlined />, text: '已停止' },
      starting: { color: 'processing', icon: <SyncOutlined spin />, text: '启动中' },
      stopping: { color: 'warning', icon: <ClockCircleOutlined />, text: '停止中' },
      error: { color: 'error', icon: <WarningOutlined />, text: '错误' },
      failed: { color: 'error', icon: <WarningOutlined />, text: '失败' },
    };

    const config = statusConfig[status] || { color: 'default', icon: null, text: '未知' };
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  // 计算统计数据
  const getStatistics = () => {
    const total = configs.length;
    const running = Object.values(runtimes).filter((r) => r.status === 'running').length;
    const stopped = Object.values(runtimes).filter((r) => r.status === 'stopped').length;
    const error = Object.values(runtimes).filter((r) => r.status === 'error' || r.status === 'failed').length;

    return { total, running, stopped, error };
  };

  const stats = getStatistics();

  // 表格列定义
  const columns = [
    {
      title: 'Worker ID',
      dataIndex: 'worker_id',
      key: 'worker_id',
      width: 200,
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <code style={{ fontSize: '12px' }}>{text}</code>
        </Tooltip>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (_, record) => {
        const runtime = runtimes[record.id];
        return runtime ? getStatusTag(runtime.status) : <Tag>未启动</Tag>;
      },
    },
    {
      title: '部署类型',
      dataIndex: 'deployment_type',
      key: 'deployment_type',
      width: 100,
      render: (type) => {
        const typeConfig = {
          local: { color: 'blue', text: '本地' },
          remote: { color: 'green', text: '远程' },
          docker: { color: 'purple', text: 'Docker' },
          k8s: { color: 'cyan', text: 'K8s' },
        };
        const config = typeConfig[type] || { color: 'default', text: type };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '主机:端口',
      key: 'endpoint',
      width: 180,
      render: (_, record) => (
        <code style={{ fontSize: '12px' }}>
          {record.host}:{record.port}
        </code>
      ),
    },
    {
      title: '代理',
      key: 'proxy',
      width: 150,
      render: (_, record) => {
        if (!record.proxy_id) {
          return <Tag>无代理</Tag>;
        }
        const proxy = proxies.find(p => p.id === record.proxy_id);
        if (!proxy) {
          return <Tag color="red">代理失效</Tag>;
        }
        return (
          <Tooltip title={`${proxy.server} (${proxy.protocol})`}>
            <Tag color="blue">{proxy.name}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'PID',
      key: 'pid',
      width: 80,
      render: (_, record) => {
        const runtime = runtimes[record.id];
        return runtime?.process_id ? <code>{runtime.process_id}</code> : '-';
      },
    },
    {
      title: '重启次数',
      key: 'restart_count',
      width: 100,
      render: (_, record) => {
        const runtime = runtimes[record.id];
        const count = runtime?.restart_count || 0;
        const max = record.max_restart_attempts || 3;
        return count > 0 ? (
          <Badge count={count} style={{ backgroundColor: count >= max ? '#ff4d4f' : '#52c41a' }} />
        ) : (
          '-'
        );
      },
    },
    {
      title: '自动启动',
      dataIndex: 'auto_start',
      key: 'auto_start',
      width: 100,
      render: (autoStart) => (autoStart ? <Tag color="green">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right',
      render: (_, record) => {
        const runtime = runtimes[record.id];
        const isRunning = runtime?.status === 'running';
        const isStarting = runtime?.status === 'starting';
        const isStopping = runtime?.status === 'stopping';

        return (
          <Space size="small">
            {!isRunning && !isStarting && (
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => handleStartWorker(record.id)}
                loading={isStarting}
              >
                启动
              </Button>
            )}
            {isRunning && (
              <Button
                size="small"
                icon={<PauseCircleOutlined />}
                onClick={() => handleStopWorker(record.id)}
                loading={isStopping}
              >
                停止
              </Button>
            )}
            {isRunning && (
              <Button
                size="small"
                icon={<SyncOutlined />}
                onClick={() => handleRestartWorker(record.id)}
              >
                重启
              </Button>
            )}
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetails(record)}
            >
              详情
            </Button>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => handleViewLogs(record)}
            >
              日志
            </Button>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenConfigModal(record)}
            >
              编辑
            </Button>
            <Popconfirm
              title="确定删除此 Worker 配置吗?"
              onConfirm={() => handleDeleteConfig(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* 页面头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>
          <ClusterOutlined /> Worker 生命周期管理
        </h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadConfigs} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenConfigModal()}>
            新建 Worker
          </Button>
        </Space>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="总配置数" value={stats.total} prefix={<ClusterOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="运行中"
              value={stats.running}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已停止"
              value={stats.stopped}
              valueStyle={{ color: '#8c8c8c' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="错误"
              value={stats.error}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Worker 配置表格 */}
      <Table
        columns={columns}
        dataSource={configs}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1500 }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个 Worker 配置`,
        }}
      />

      {/* 新建/编辑配置模态框 */}
      <Modal
        title={editingConfig ? '编辑 Worker 配置' : '新建 Worker 配置'}
        open={configModalVisible}
        onOk={handleSaveConfig}
        onCancel={() => {
          setConfigModalVisible(false);
          form.resetFields();
          setEditingConfig(null);
        }}
        width={800}
        okText="保存"
        cancelText="取消"
      >
        <Form 
          form={form} 
          layout="vertical"
          onValuesChange={(changedValues, allValues) => {
            // 调试：监控表单值变化
            if (changedValues.proxy_id !== undefined) {
              console.log('代理字段变化:', changedValues.proxy_id);
              console.log('所有表单值:', allValues);
            }
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Worker ID"
                name="worker_id"
                rules={[{ required: true, message: '请输入 Worker ID' }]}
              >
                <Input placeholder="worker-1" disabled={!!editingConfig} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="Worker 1" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="部署类型"
                name="deployment_type"
                rules={[{ required: true, message: '请选择部署类型' }]}
              >
                <Select>
                  <Option value="local">本地</Option>
                  <Option value="remote">远程</Option>
                  <Option value="docker">Docker</Option>
                  <Option value="k8s">Kubernetes</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="主机" name="host" rules={[{ required: true, message: '请输入主机' }]}>
                <Input placeholder="localhost" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="端口" name="port" rules={[{ required: true, message: '请输入端口' }]}>
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="自动启动" name="auto_start" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="自动重启" name="auto_restart" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="重启延迟(毫秒)" name="restart_delay_ms">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="最大重启次数" name="max_restart_attempts">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label="代理" name="proxy_id">
                <Select 
                  placeholder={proxies.length === 0 ? "加载代理中..." : "选择代理"} 
                  allowClear
                  loading={proxies.length === 0}
                  optionLabelProp="label"
                  listHeight={400}
                >
                  {/* 无代理选项 */}
                  <Option key="none" value={null} label="无代理">
                    <div style={{ padding: '4px 0' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#999' }}>
                        🚫 无代理
                      </div>
                      <div style={{ fontSize: '12px', color: '#999' }}>
                        直连，不使用代理服务器
                      </div>
                    </div>
                  </Option>
                  
                  {proxies.map(proxy => (
                    <Option 
                      key={proxy.id} 
                      value={proxy.id}
                      label={proxy.name}
                    >
                      <div style={{ padding: '4px 0' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{proxy.name}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {proxy.server} ({proxy.protocol})
                        </div>
                      </div>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              {/* 调试信息 */}
              {process.env.NODE_ENV === 'development' && (
                <div style={{ fontSize: '10px', color: '#999', marginTop: '-16px', marginBottom: '8px' }}>
                  代理数量: {proxies.length} | 当前值: {form.getFieldValue('proxy_id') || 'null'}
                  {proxies.length === 0 && <span style={{ color: 'red' }}> ⚠️ 代理列表为空！</span>}
                </div>
              )}
            </Col>
          </Row>

          <Form.Item label="环境变量 (JSON)" name="env_variables">
            <TextArea rows={4} placeholder='{"KEY": "value"}' />
          </Form.Item>

          <Form.Item label="浏览器配置 (JSON)" name="browser_config">
            <TextArea rows={4} placeholder='{"headless": true}' />
          </Form.Item>

          <Form.Item label="Docker Volumes (JSON Array)" name="docker_volumes">
            <TextArea rows={3} placeholder='["/host/path:/container/path"]' />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情抽屉 */}
      <Drawer
        title={`Worker 详情: ${selectedConfig?.worker_id}`}
        placement="right"
        width={700}
        open={detailDrawerVisible}
        onClose={() => {
          setDetailDrawerVisible(false);
          setSelectedConfig(null);
        }}
      >
        {selectedConfig && (
          <Tabs defaultActiveKey="config">
            <TabPane tab="配置信息" key="config">
              <Descriptions bordered column={1}>
                <Descriptions.Item label="ID">{selectedConfig.id}</Descriptions.Item>
                <Descriptions.Item label="Worker ID">{selectedConfig.worker_id}</Descriptions.Item>
                <Descriptions.Item label="名称">{selectedConfig.name}</Descriptions.Item>
                <Descriptions.Item label="部署类型">{selectedConfig.deployment_type}</Descriptions.Item>
                <Descriptions.Item label="主机">{selectedConfig.host}</Descriptions.Item>
                <Descriptions.Item label="端口">{selectedConfig.port}</Descriptions.Item>
                <Descriptions.Item label="自动启动">
                  {selectedConfig.auto_start ? '是' : '否'}
                </Descriptions.Item>
                <Descriptions.Item label="自动重启">
                  {selectedConfig.auto_restart ? '是' : '否'}
                </Descriptions.Item>
                <Descriptions.Item label="重启延迟">{selectedConfig.restart_delay_ms} ms</Descriptions.Item>
                <Descriptions.Item label="最大重启次数">
                  {selectedConfig.max_restart_attempts}
                </Descriptions.Item>
                <Descriptions.Item label="环境变量">
                  <pre style={{ margin: 0, maxHeight: 200, overflow: 'auto' }}>
                    {JSON.stringify(selectedConfig.env_variables, null, 2)}
                  </pre>
                </Descriptions.Item>
                <Descriptions.Item label="浏览器配置">
                  <pre style={{ margin: 0, maxHeight: 200, overflow: 'auto' }}>
                    {JSON.stringify(selectedConfig.browser_config, null, 2)}
                  </pre>
                </Descriptions.Item>
              </Descriptions>
            </TabPane>
            <TabPane tab="运行时状态" key="runtime">
              {runtimes[selectedConfig.id] ? (
                <Descriptions bordered column={1}>
                  <Descriptions.Item label="状态">
                    {getStatusTag(runtimes[selectedConfig.id].status)}
                  </Descriptions.Item>
                  <Descriptions.Item label="进程 ID">
                    {runtimes[selectedConfig.id].process_id || 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="容器 ID">
                    {runtimes[selectedConfig.id].container_id || 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="启动时间">
                    {runtimes[selectedConfig.id].started_at
                      ? new Date(runtimes[selectedConfig.id].started_at).toLocaleString()
                      : 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="停止时间">
                    {runtimes[selectedConfig.id].stopped_at
                      ? new Date(runtimes[selectedConfig.id].stopped_at).toLocaleString()
                      : 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="重启次数">
                    {runtimes[selectedConfig.id].restart_count || 0}
                  </Descriptions.Item>
                  <Descriptions.Item label="最后重启">
                    {runtimes[selectedConfig.id].last_restart_at
                      ? new Date(runtimes[selectedConfig.id].last_restart_at).toLocaleString()
                      : 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="最后错误">
                    {runtimes[selectedConfig.id].last_error || 'N/A'}
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <p>暂无运行时信息</p>
              )}
            </TabPane>
          </Tabs>
        )}
      </Drawer>

      {/* 日志抽屉 */}
      <Drawer
        title={`Worker 日志: ${selectedConfig?.worker_id}`}
        placement="right"
        width={900}
        open={logsDrawerVisible}
        onClose={() => {
          setLogsDrawerVisible(false);
          setSelectedConfig(null);
          setSelectedLogs([]);
        }}
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => selectedConfig && handleViewLogs(selectedConfig)}
          >
            刷新
          </Button>
        }
      >
        <div
          style={{
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            padding: '16px',
            fontFamily: 'monospace',
            fontSize: '12px',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          {selectedLogs.length > 0 ? (
            selectedLogs.map((log, index) => (
              <div key={index} style={{ marginBottom: '8px' }}>
                <span style={{ color: '#858585' }}>
                  [{new Date(log.timestamp).toLocaleString()}]
                </span>{' '}
                <span style={{ color: log.level === 'error' ? '#f48771' : '#4ec9b0' }}>
                  {log.level.toUpperCase()}
                </span>{' '}
                <span>{log.message}</span>
              </div>
            ))
          ) : (
            <p>暂无日志</p>
          )}
        </div>
      </Drawer>
    </Space>
  );
};

export default WorkersPage;
