/**
 * Master API 服务
 * 调用 Master 的 /api/im 接口
 */

import { MASTER_CONFIG } from '@shared/constants'

const BASE_URL = MASTER_CONFIG.API_BASE_URL

/**
 * 通用 API 响应格式（IM 格式）
 */
interface IMResponse<T> {
  data: T
  status_code: number
  status_msg?: string
  cursor?: number
  has_more?: boolean
  total?: number
}

/**
 * IM 用户格式
 */
export interface IMUser {
  user_id: string
  user_name: string
  avatar: string
  signature?: string
  verified?: boolean
  follower_count?: number
  following_count?: number
  status: string
  platform?: string
  created_at?: number
  updated_at?: number
}

/**
 * IM 会话格式
 */
export interface IMConversation {
  conversation_id: string
  conversation_short_id?: string
  conversation_type: string
  participant: {
    user_id: string
    user_name: string
    avatar: string
  }
  last_message?: {
    content: string
    msg_type: string
    create_time: number
  }
  unread_count: number
  create_time: number
  update_time: number
  platform?: string
  status?: string
}

/**
 * IM 消息格式
 */
export interface IMMessage {
  msg_id: string
  conversation_id: string
  sender: {
    user_id: string
    user_name: string
    avatar: string
  }
  receiver: {
    user_id: string
    user_name: string
    avatar: string
  }
  msg_type: string
  content: string
  create_time: number
  status: string
  is_read?: boolean
  platform?: string
}

/**
 * IM 作品格式
 */
export interface IMWork {
  work_id: string
  platform: string
  platform_work_id: string
  work_type: string
  title: string
  description: string
  cover: string
  url: string
  publish_time: number
  stats: {
    total_comments: number
    new_comments: number
    likes: number
    shares: number
    views: number
  }
  is_new: boolean
  crawl_status: string
  created_at: number
  updated_at: number
  last_crawl_time: number
}

/**
 * IM 讨论格式（二级评论）
 */
export interface IMDiscussion {
  discussion_id: string
  platform: string
  platform_discussion_id: string
  parent_comment_id: string
  content: string
  author: {
    author_id: string
    author_name: string
  }
  work_id: string
  post_id: string
  post_title: string
  is_read: boolean
  is_new: boolean
  detected_at: number
  created_at: number
}

/**
 * IM 统一消息格式（包含评论、讨论、私信）
 */
export interface IMUnifiedMessage {
  msg_id: string
  conversation_id: string
  msg_type: string
  business_type: 'comment' | 'discussion' | 'direct_message'
  sender: {
    user_id: string
    user_name: string
    avatar: string
  }
  receiver?: {
    user_id: string
    user_name: string
    avatar: string
  }
  content: string
  work_id?: string
  work_title?: string
  parent_comment_id?: string
  direction?: string
  is_read: boolean
  is_new: boolean
  create_time: number
  detected_at: number
  platform: string
  platform_comment_id?: string
  platform_discussion_id?: string
  platform_message_id?: string
  status?: string
}

/**
 * API 服务类
 */
class APIService {
  /**
   * 通用请求方法
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<IMResponse<T>> {
    const url = `${BASE_URL}${endpoint}`

    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
      },
    }

    try {
      const response = await fetch(url, {
        ...defaultOptions,
        ...options,
        headers: {
          ...defaultOptions.headers,
          ...options.headers,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data as IMResponse<T>
    } catch (error) {
      console.error(`[API] Request failed: ${url}`, error)
      throw error
    }
  }

  // ============================================
  // 账户相关 API
  // ============================================

  /**
   * 获取账户列表
   */
  async getAccounts(params: {
    cursor?: number
    count?: number
    status?: string
    platform?: string
  } = {}): Promise<IMResponse<{ users: IMUser[] }>> {
    const query = new URLSearchParams()
    if (params.cursor !== undefined) query.append('cursor', params.cursor.toString())
    if (params.count !== undefined) query.append('count', params.count.toString())
    if (params.status) query.append('status', params.status)
    if (params.platform) query.append('platform', params.platform)

    return this.request(`/accounts?${query.toString()}`)
  }

  /**
   * 获取单个账户
   */
  async getAccount(userId: string): Promise<IMResponse<IMUser>> {
    return this.request(`/accounts/${userId}`)
  }

  /**
   * 创建账户
   */
  async createAccount(user: Partial<IMUser>): Promise<IMResponse<IMUser>> {
    return this.request(`/accounts`, {
      method: 'POST',
      body: JSON.stringify(user),
    })
  }

  /**
   * 更新账户
   */
  async updateAccount(userId: string, user: Partial<IMUser>): Promise<IMResponse<IMUser>> {
    return this.request(`/accounts/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    })
  }

  /**
   * 删除账户
   */
  async deleteAccount(userId: string): Promise<IMResponse<{ deleted: boolean }>> {
    return this.request(`/accounts/${userId}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // 会话相关 API
  // ============================================

  /**
   * 获取会话列表
   */
  async getConversations(params: {
    cursor?: number
    count?: number
    account_id?: string
    status?: string
  } = {}): Promise<IMResponse<{ conversations: IMConversation[] }>> {
    const query = new URLSearchParams()
    if (params.cursor !== undefined) query.append('cursor', params.cursor.toString())
    if (params.count !== undefined) query.append('count', params.count.toString())
    if (params.account_id) query.append('account_id', params.account_id)
    if (params.status) query.append('status', params.status)

    return this.request(`/conversations?${query.toString()}`)
  }

  /**
   * 获取单个会话
   */
  async getConversation(conversationId: string): Promise<IMResponse<IMConversation>> {
    return this.request(`/conversations/${conversationId}`)
  }

  /**
   * 创建会话
   */
  async createConversation(conversation: Partial<IMConversation>): Promise<IMResponse<IMConversation>> {
    return this.request(`/conversations`, {
      method: 'POST',
      body: JSON.stringify(conversation),
    })
  }

  /**
   * 标记会话为已读
   */
  async markConversationAsRead(conversationId: string): Promise<IMResponse<IMConversation>> {
    return this.request(`/conversations/${conversationId}/read`, {
      method: 'PUT',
    })
  }

  /**
   * 删除会话
   */
  async deleteConversation(conversationId: string): Promise<IMResponse<{ deleted: boolean }>> {
    return this.request(`/conversations/${conversationId}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // 消息相关 API
  // ============================================

  /**
   * 获取消息列表
   */
  async getMessages(params: {
    cursor?: number
    count?: number
    conversation_id?: string
    sender_id?: string
    receiver_id?: string
    since_time?: number
  } = {}): Promise<IMResponse<{ messages: IMMessage[] }>> {
    const query = new URLSearchParams()
    if (params.cursor !== undefined) query.append('cursor', params.cursor.toString())
    if (params.count !== undefined) query.append('count', params.count.toString())
    if (params.conversation_id) query.append('conversation_id', params.conversation_id)
    if (params.sender_id) query.append('sender_id', params.sender_id)
    if (params.receiver_id) query.append('receiver_id', params.receiver_id)
    if (params.since_time !== undefined) query.append('since_time', params.since_time.toString())

    return this.request(`/messages?${query.toString()}`)
  }

  /**
   * 获取会话的消息列表
   */
  async getConversationMessages(
    conversationId: string,
    params: {
      cursor?: number
      count?: number
      since_time?: number
    } = {}
  ): Promise<IMResponse<{ messages: IMMessage[] }>> {
    const query = new URLSearchParams()
    if (params.cursor !== undefined) query.append('cursor', params.cursor.toString())
    if (params.count !== undefined) query.append('count', params.count.toString())
    if (params.since_time !== undefined) query.append('since_time', params.since_time.toString())

    return this.request(`/conversations/${conversationId}/messages?${query.toString()}`)
  }

  /**
   * 获取单条消息
   */
  async getMessage(messageId: string): Promise<IMResponse<IMMessage>> {
    return this.request(`/messages/${messageId}`)
  }

  /**
   * 发送消息
   */
  async sendMessage(message: Partial<IMMessage>): Promise<IMResponse<IMMessage>> {
    return this.request(`/messages`, {
      method: 'POST',
      body: JSON.stringify(message),
    })
  }

  /**
   * 标记消息为已读
   */
  async markMessageAsRead(messageId: string): Promise<IMResponse<IMMessage>> {
    return this.request(`/messages/${messageId}/read`, {
      method: 'PUT',
    })
  }

  /**
   * 删除消息
   */
  async deleteMessage(messageId: string): Promise<IMResponse<{ deleted: boolean }>> {
    return this.request(`/messages/${messageId}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // 健康检查
  // ============================================

  /**
   * 健康检查
   */
  async health(): Promise<IMResponse<{ status: string; version: string; timestamp: number }>> {
    return this.request(`/health`)
  }

  /**
   * 获取版本信息
   */
  async version(): Promise<IMResponse<{
    api_version: string
    compatibility: string
    supported_platforms: string[]
  }>> {
    return this.request(`/version`)
  }

  // ============================================
  // 作品相关 API
  // ============================================

  /**
   * 获取作品列表
   */
  async getWorks(params: {
    cursor?: number
    count?: number
    platform?: string
    work_type?: string
    is_new?: boolean
    account_id?: string
  } = {}): Promise<IMResponse<{ works: IMWork[] }>> {
    const query = new URLSearchParams()
    if (params.cursor !== undefined) query.append('cursor', params.cursor.toString())
    if (params.count !== undefined) query.append('count', params.count.toString())
    if (params.platform) query.append('platform', params.platform)
    if (params.work_type) query.append('work_type', params.work_type)
    if (params.is_new !== undefined) query.append('is_new', params.is_new.toString())
    if (params.account_id) query.append('account_id', params.account_id)

    return this.request(`/works?${query.toString()}`)
  }

  /**
   * 获取单个作品
   */
  async getWork(workId: string): Promise<IMResponse<IMWork>> {
    return this.request(`/works/${workId}`)
  }

  /**
   * 标记作品为已读
   */
  async markWorkAsRead(workId: string): Promise<IMResponse<IMWork>> {
    return this.request(`/works/${workId}/read`, {
      method: 'PUT',
    })
  }

  // ============================================
  // 讨论相关 API
  // ============================================

  /**
   * 获取讨论列表
   */
  async getDiscussions(params: {
    cursor?: number
    count?: number
    platform?: string
    is_read?: boolean
    is_new?: boolean
    account_id?: string
    parent_comment_id?: string
    work_id?: string
  } = {}): Promise<IMResponse<{ discussions: IMDiscussion[] }>> {
    const query = new URLSearchParams()
    if (params.cursor !== undefined) query.append('cursor', params.cursor.toString())
    if (params.count !== undefined) query.append('count', params.count.toString())
    if (params.platform) query.append('platform', params.platform)
    if (params.is_read !== undefined) query.append('is_read', params.is_read.toString())
    if (params.is_new !== undefined) query.append('is_new', params.is_new.toString())
    if (params.account_id) query.append('account_id', params.account_id)
    if (params.parent_comment_id) query.append('parent_comment_id', params.parent_comment_id)
    if (params.work_id) query.append('work_id', params.work_id)

    return this.request(`/discussions?${query.toString()}`)
  }

  /**
   * 获取单个讨论
   */
  async getDiscussion(discussionId: string): Promise<IMResponse<IMDiscussion>> {
    return this.request(`/discussions/${discussionId}`)
  }

  /**
   * 标记讨论为已读
   */
  async markDiscussionAsRead(discussionId: string): Promise<IMResponse<IMDiscussion>> {
    return this.request(`/discussions/${discussionId}/read`, {
      method: 'PUT',
    })
  }

  // ============================================
  // 统一消息 API
  // ============================================

  /**
   * 获取统一消息列表（包含评论、讨论、私信）
   */
  async getUnifiedMessages(params: {
    cursor?: number
    count?: number
    account_id?: string
    types?: string
    is_new?: boolean
    is_read?: boolean
  } = {}): Promise<IMResponse<{ messages: IMUnifiedMessage[] }>> {
    const query = new URLSearchParams()
    if (params.cursor !== undefined) query.append('cursor', params.cursor.toString())
    if (params.count !== undefined) query.append('count', params.count.toString())
    if (params.account_id) query.append('account_id', params.account_id)
    if (params.types) query.append('types', params.types)
    if (params.is_new !== undefined) query.append('is_new', params.is_new.toString())
    if (params.is_read !== undefined) query.append('is_read', params.is_read.toString())

    return this.request(`/unified-messages?${query.toString()}`)
  }

  /**
   * 获取未读消息统计
   */
  async getUnreadStats(accountId: string): Promise<IMResponse<{
    total_unread: number
    comment_unread: number
    discussion_unread: number
    direct_message_unread: number
  }>> {
    return this.request(`/unified-messages/stats?account_id=${accountId}`)
  }

  /**
   * 标记统一消息为已读
   */
  async markUnifiedMessageAsRead(messageId: string, businessType: string): Promise<IMResponse<{ marked: boolean }>> {
    return this.request(`/unified-messages/${messageId}/read`, {
      method: 'PUT',
      body: JSON.stringify({ business_type: businessType }),
    })
  }
}

// 导出单例
export const apiService = new APIService()
export default apiService
