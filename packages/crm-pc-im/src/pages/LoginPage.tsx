import { useState } from 'react'
import { Card, Form, Input, Button, message, Select } from 'antd'
import { UserOutlined, LockOutlined, LinkOutlined } from '@ant-design/icons'
import { useDispatch } from 'react-redux'
import { setUser, setWebSocketUrl } from '../store/userSlice'
import { getAllMockUsers, getMockUserById } from '../services/mock'
import './LoginPage.css'

interface LoginPageProps {
  onLoginSuccess: () => void
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const dispatch = useDispatch()

  const handleLogin = async (values: any) => {
    try {
      setLoading(true)
      await new Promise(resolve => setTimeout(resolve, 500))

      const { userId } = values
      const user = getMockUserById(userId)

      if (!user) {
        message.error('用户不存在')
        return
      }

      dispatch(setUser(user))

      message.success(`登录成功！欢迎 ${user.name}`)
      onLoginSuccess()
    } catch (error) {
      message.error('登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleSettingsSubmit = async (values: any) => {
    const { websocketUrl } = values
    dispatch(setWebSocketUrl(websocketUrl))

    if (window.electron) {
      await window.electron.setWebSocketUrl(websocketUrl)
    }

    message.success('WebSocket 地址已设置')
    setShowSettings(false)
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <Card className="login-card" title="CRM PC IM - 登录">
          {!showSettings ? (
            <>
              <Form form={form} layout="vertical" onFinish={handleLogin}>
                <Form.Item
                  name="userId"
                  label="选择用户"
                  initialValue="user_001"
                  rules={[{ required: true, message: '请选择用户' }]}
                >
                  <Select size="large" placeholder="选择要登录的用户">
                    {getAllMockUsers().map(user => (
                      <Select.Option key={user.id} value={user.id}>
                        <UserOutlined /> {user.name} ({user.id})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={loading} block size="large">
                    登 录
                  </Button>
                </Form.Item>

                <div style={{ marginTop: 16, padding: 12, background: '#f0f5ff', borderRadius: 8 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
                    💡 提示: 可以打开多个浏览器窗口,选择不同用户登录,测试实时通讯功能
                  </p>
                </div>
              </Form>

              <div className="login-footer">
                <Button
                  type="text"
                  icon={<LinkOutlined />}
                  onClick={() => setShowSettings(true)}
                >
                  连接设置
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="settings-description">
                设置 WebSocket 服务器地址以连接到后端服务
              </p>
              <Form layout="vertical" onFinish={handleSettingsSubmit}>
                <Form.Item
                  name="websocketUrl"
                  label="WebSocket 地址"
                  initialValue="ws://localhost:8080"
                  rules={[
                    { required: true, message: '请输入 WebSocket 地址' },
                    { pattern: /^ws(s)?:\/\/.+/, message: '请输入有效的 WebSocket 地址' }
                  ]}
                >
                  <Input
                    prefix={<LinkOutlined />}
                    placeholder="例如: ws://localhost:8080"
                    size="large"
                  />
                </Form.Item>

                <Form.Item>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button type="primary" htmlType="submit" style={{ flex: 1 }}>
                      保 存
                    </Button>
                    <Button onClick={() => setShowSettings(false)} style={{ flex: 1 }}>
                      取 消
                    </Button>
                  </div>
                </Form.Item>
              </Form>
            </>
          )}
        </Card>

        <div className="login-version">
          <p>CRM PC IM v0.0.1</p>
        </div>
      </div>
    </div>
  )
}
