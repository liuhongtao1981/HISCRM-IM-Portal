/**
 * Protocol Converter
 *
 * 负责在 Master 协议和 crm 协议之间转换
 *
 * Master 格式: {
 *   id,
 *   account_id,      // 账户 ID
 *   type,            // 消息类型（comment, direct_message 等）
 *   content,         // 消息内容
 *   sender_id,       // 发送者 ID
 *   sender_name,     // 发送者名称
 *   created_at,      // 创建时间（Unix timestamp, 秒）
 *   is_sent,         // 是否已发送
 *   is_new,          // 是否为新消息
 *   related_id,      // 相关 ID
 *   data,            // 额外数据 (JSON)
 *   ...
 * }
 *
 * crm 格式: {
 *   id,
 *   fromId,          // 来自 sender_id
 *   fromName,        // 来自 sender_name
 *   toId,            // 目标 ID（crm 没有）
 *   topic,           // 来自 account_id
 *   content,         // 消息内容
 *   type,            // 消息类型（text, file）
 *   timestamp,       // 时间戳（毫秒）
 *   fileUrl,         // 文件 URL
 *   fileName,        // 文件名
 * }
 */

import type { Message } from '@shared/types'

/**
 * Master 协议消息结构
 */
export interface MasterMessage {
  id: string
  account_id: string
  sender_id: string
  sender_name?: string
  platform_name?: string
  type: string
  content: string
  created_at: number // Unix timestamp (seconds)
  is_new: number
  is_sent: number
  related_id?: string
  data?: string | Record<string, any>
  payload?: Record<string, any>
  [key: string]: any
}

/**
 * 将 Master 格式消息转换为 crm 格式
 *
 * @param masterMessage Master 协议消息
 * @returns crm 格式的 Message 对象
 */
export function convertMasterToCrm(masterMessage: MasterMessage): Message {
  // 处理 payload 嵌套结构（某些情况下 Master 会将消息包装在 payload 中）
  const payload = masterMessage.payload || masterMessage

  return {
    id: payload.id || `master_${Date.now()}_${Math.random()}`,
    fromId: payload.sender_id || payload.from_id || 'unknown',
    fromName: payload.sender_name || payload.from_name || 'Unknown User',
    toId: '', // Master 没有 toId 概念，留空（由 topic 识别）
    topic: payload.account_id || payload.topic || 'default', // account_id 映射到 topic
    content: payload.content || '',
    type: convertMessageType(payload.type || 'TEXT', true),
    timestamp: (payload.created_at || payload.timestamp || Math.floor(Date.now() / 1000)) * 1000, // 秒 → 毫秒
    fileUrl: payload.file_url || payload.fileUrl || undefined,
    fileName: payload.file_name || payload.fileName || undefined,
  }
}

/**
 * 将 crm 格式消息转换为 Master 格式
 *
 * @param crmMessage crm 格式的 Message 对象
 * @returns Master 协议消息
 */
export function convertCrmToMaster(crmMessage: Message): MasterMessage {
  return {
    type: 'notification',
    id: crmMessage.id,
    account_id: crmMessage.topic, // topic 映射回 account_id
    type: convertMessageType(crmMessage.type, false),
    content: crmMessage.content,
    sender_id: crmMessage.fromId,
    sender_name: crmMessage.fromName,
    created_at: Math.floor(crmMessage.timestamp / 1000), // 毫秒 → 秒
    is_new: 1,
    is_sent: 0,
    file_url: crmMessage.fileUrl,
    file_name: crmMessage.fileName,
  }
}

/**
 * 转换消息类型
 *
 * Master 支持: TEXT, FILE, IMAGE, SYSTEM, NOTIFICATION, comment, direct_message
 * crm 支持:    text, file
 */
function convertMessageType(
  masterType: string | undefined,
  isMasterToCrm: boolean = true
): string {
  if (isMasterToCrm) {
    // Master → crm
    switch ((masterType || 'TEXT').toUpperCase()) {
      case 'TEXT':
      case 'SYSTEM':
      case 'NOTIFICATION':
      case 'COMMENT':
      case 'DIRECT_MESSAGE':
        return 'text'
      case 'FILE':
      case 'IMAGE':
        return 'file'
      default:
        return 'text'
    }
  } else {
    // crm → Master
    switch ((masterType || 'text').toLowerCase()) {
      case 'text':
        return 'TEXT'
      case 'file':
        return 'FILE'
      default:
        return 'TEXT'
    }
  }
}

/**
 * 判断消息是否为 Master 格式
 */
export function isMasterMessage(msg: any): msg is MasterMessage {
  return msg && (msg.account_id !== undefined || msg.sender_id !== undefined)
}

/**
 * 判断消息是否为 crm 格式
 */
export function isCrmMessage(msg: any): msg is Message {
  return msg && msg.fromId !== undefined && msg.topic !== undefined
}

/**
 * 生成客户端 ID（用于注册）
 */
export function generateClientId(): string {
  return `crm-pc-im_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 提取 Master 消息中的关键信息用于日志
 */
export function formatMasterMessageForLog(msg: MasterMessage): string {
  const payload = msg.payload || msg
  const content = typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content)
  return `[Master] ${payload.sender_name || 'Unknown'} → ${payload.account_id}: ${content.substring(0, 50)}`
}

/**
 * 提取 crm 消息中的关键信息用于日志
 */
export function formatCrmMessageForLog(msg: Message): string {
  return `[crm] ${msg.fromName} → ${msg.topic}: ${msg.content.substring(0, 50)}`
}

/**
 * 验证消息字段完整性
 */
export function validateCrmMessage(msg: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!msg.id) errors.push('Missing required field: id')
  if (!msg.fromId) errors.push('Missing required field: fromId')
  if (!msg.topic) errors.push('Missing required field: topic')
  if (msg.content === undefined) errors.push('Missing required field: content')
  if (!msg.type) errors.push('Missing required field: type')
  if (!msg.timestamp) errors.push('Missing required field: timestamp')

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 验证 Master 消息字段完整性
 */
export function validateMasterMessage(msg: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const payload = msg.payload || msg

  if (!payload.id) errors.push('Missing required field: id')
  if (!payload.account_id) errors.push('Missing required field: account_id')
  if (!payload.sender_id) errors.push('Missing required field: sender_id')
  if (payload.content === undefined) errors.push('Missing required field: content')
  if (!payload.type) errors.push('Missing required field: type')
  if (payload.created_at === undefined) errors.push('Missing required field: created_at')

  return {
    valid: errors.length === 0,
    errors,
  }
}
