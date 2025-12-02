/**
 * 验证对话框服务
 * 用于显示来自Worker的验证请求（短信验证码、扫码验证等）
 */

import { Modal } from 'antd'
import websocketService from './websocket'

export interface VerificationRequestData {
  request_id: string
  account_id: string
  source: string
  platform: string
  verification_type: 'sms' | 'qrcode'
  message: string
  phone_number: string
  has_sms_button: boolean
  has_qrcode_option: boolean
  context: any
  timestamp: number
}

/**
 * 根据验证来源获取对话框标题
 */
function getVerificationTitle(source: string, platform: string): string {
  const titles: Record<string, string> = {
    'douyin_comment_reply': '🎵 抖音评论验证',
    'douyin_dm_send': '🎵 抖音私信验证',
    'douyin_login': '🎵 抖音登录验证',
    'xiaohongshu_comment_reply': '📕 小红书评论验证',
    'xiaohongshu_note_publish': '📕 小红书发布验证',
    'weibo_comment_reply': '📰 微博评论验证',
    'weibo_dm_send': '📰 微博私信验证',
  }

  const key = `${platform}_${source.split('_').slice(1).join('_')}`
  return titles[source] || titles[key] || '⚠️ 验证提示'
}

/**
 * 根据平台获取图标emoji
 */
function getPlatformIcon(platform: string): string {
  const icons: Record<string, string> = {
    'douyin': '🎵',
    'xiaohongshu': '📕',
    'weibo': '📰',
    'wechat': '💬',
  }
  return icons[platform] || '⚠️'
}

/**
 * 根据来源获取操作提示
 */
function getVerificationTip(source: string): string {
  const tips: Record<string, string> = {
    'douyin_comment_reply': '频繁评论可能触发验证，建议适当降低评论频率',
    'douyin_dm_send': '批量发送私信可能触发验证，建议分批发送',
    'douyin_login': '登录验证是正常的安全措施，请完成验证',
    'xiaohongshu_comment_reply': '频繁评论可能触发验证',
    'xiaohongshu_note_publish': '发布笔记需要完成验证',
  }
  return tips[source] || '请完成验证以继续操作'
}

/**
 * 显示验证对话框
 */
export function showVerificationDialog(data: VerificationRequestData): void {
  const { request_id, source, platform, message, phone_number, verification_type } = data

  const title = getVerificationTitle(source, platform)
  const icon = getPlatformIcon(platform)
  const tip = getVerificationTip(source)

  // 构建对话框内容
  let content = `${icon} ${message}\n\n`

  if (phone_number) {
    content += `📱 手机号: ${phone_number}\n`
  }

  if (verification_type === 'sms') {
    content += `📲 验证方式: 短信验证码\n`
  } else if (verification_type === 'qrcode') {
    content += `📲 验证方式: 扫码验证\n`
  }

  content += `\n💡 提示: ${tip}\n`
  content += `\n⚠️ 点击「是」将发送验证码，点击「否」将取消本次操作。`

  Modal.confirm({
    title,
    content: (
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
        {content}
      </div>
    ),
    okText: '是 - 继续验证',
    cancelText: '否 - 取消操作',
    width: 500,
    centered: true,
    onOk: () => {
      console.log(`[VerificationDialog] 用户选择: 继续验证, request_id: ${request_id}`)
      websocketService.sendVerificationResponse(request_id, 'yes')
    },
    onCancel: () => {
      console.log(`[VerificationDialog] 用户选择: 取消操作, request_id: ${request_id}`)
      websocketService.sendVerificationResponse(request_id, 'no')
    }
  })

  console.log(`[VerificationDialog] 显示验证对话框`, {
    requestId: request_id,
    source,
    platform,
    verificationType: verification_type
  })
}

/**
 * 显示短信验证码输入对话框
 */
export function showSMSCodeInputDialog(data: {
  request_id: string
  account_id: string
  phone_number: string
  message: string
  timestamp: number
}): void {
  const { request_id, phone_number, message } = data

  let smsCodeInput = ''

  const modal = Modal.confirm({
    title: '📱 输入短信验证码',
    content: (
      <div style={{ marginTop: '16px' }}>
        <div style={{ marginBottom: '12px', lineHeight: '1.6' }}>
          {message}
        </div>
        <div style={{ marginBottom: '8px', fontSize: '13px', color: '#666' }}>
          手机号: {phone_number}
        </div>
        <input
          type="text"
          placeholder="请输入6位验证码"
          maxLength={6}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '16px',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            outline: 'none',
            letterSpacing: '2px'
          }}
          onChange={(e) => {
            smsCodeInput = e.target.value
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && smsCodeInput.length > 0) {
              modal.destroy()
              websocketService.sendSMSCodeResponse(request_id, smsCodeInput)
            }
          }}
          autoFocus
        />
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
          提示: 输入完成后点击「确定」或按回车键
        </div>
      </div>
    ),
    okText: '确定',
    cancelText: '取消',
    width: 450,
    centered: true,
    onOk: () => {
      if (!smsCodeInput || smsCodeInput.length === 0) {
        Modal.warning({
          title: '提示',
          content: '请输入验证码',
          centered: true
        })
        return Promise.reject()
      }
      console.log(`[SMSCodeDialog] 用户输入验证码, request_id: ${request_id}, length: ${smsCodeInput.length}`)
      websocketService.sendSMSCodeResponse(request_id, smsCodeInput)
      return Promise.resolve()
    },
    onCancel: () => {
      console.log(`[SMSCodeDialog] 用户取消输入验证码, request_id: ${request_id}`)
      websocketService.sendSMSCodeResponse(request_id, '')
    }
  })

  console.log(`[SMSCodeDialog] 显示短信验证码输入对话框`, {
    requestId: request_id,
    phoneNumber: phone_number
  })
}

/**
 * 初始化验证对话框监听器
 * 应在应用启动时调用一次
 */
export function initVerificationDialogListener(): void {
  console.log('[VerificationDialog] 初始化验证对话框监听器')

  // 监听验证请求
  websocketService.onVerificationRequest((data) => {
    console.log('[VerificationDialog] 收到验证请求:', {
      requestId: data.request_id,
      source: data.source,
      platform: data.platform,
      verificationType: data.verification_type,
      accountId: data.account_id
    })

    showVerificationDialog(data)
  })

  // 监听短信验证码输入请求
  websocketService.onSMSCodeRequest((data) => {
    console.log('[SMSCodeDialog] 收到短信验证码输入请求:', {
      requestId: data.request_id,
      accountId: data.account_id,
      phoneNumber: data.phone_number
    })

    showSMSCodeInputDialog(data)
  })
}
