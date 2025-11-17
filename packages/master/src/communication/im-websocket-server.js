/**
 * IM WebSocket 服务器
 * 实现 CRM IM Server 的 WebSocket 协议
 * 数据源: DataStore (Worker 推送的内存数据)
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('im-websocket');

class IMWebSocketServer {
    constructor(io, dataStore, cacheDAO = null, accountDAO = null, workerRegistry = null, replyDAO = null) {
        this.io = io;
        this.dataStore = dataStore;
        this.cacheDAO = cacheDAO;
        this.accountDAO = accountDAO;
        this.workerRegistry = workerRegistry;  // ✅ 新增: Worker 注册表
        this.replyDAO = replyDAO;  // ✅ 新增: 回复数据访问层

        // 在线客户端管理
        this.monitorClients = new Map(); // clientId -> socketId
        this.adminClients = new Map();   // adminId -> socketId
        this.socketToClientId = new Map(); // socketId -> clientId

        // 待确认的回复消息存储 (replyId -> message)
        this.pendingReplies = new Map();

        // ✅ 发送队列管理 (按照 topicId 分组)
        this.sendingQueues = new Map(); // topicId -> Array<SendingMessage>

        logger.info('IM WebSocket Server initialized with CacheDAO, AccountDAO, WorkerRegistry and ReplyDAO support');
    }

    /**
     * 设置 Socket.IO 命名空间和事件处理
     */
    setupHandlers() {
        // 使用根命名空间 (兼容 CRM IM Server)
        this.io.on('connection', (socket) => {
            logger.info(`[IM WS] New client connected: ${socket.id}`);

            // 监控客户端注册
            socket.on('monitor:register', (data) => {
                this.handleMonitorRegister(socket, data);
            });

            // 请求频道列表
            socket.on('monitor:request_channels', () => {
                this.handleRequestChannels(socket);
            });

            // 请求主题列表
            socket.on('monitor:request_topics', (data) => {
                this.handleRequestTopics(socket, data);
            });

            // 请求消息列表
            socket.on('monitor:request_messages', (data) => {
                this.handleRequestMessages(socket, data);
            });

            // 发送回复
            socket.on('monitor:reply', (data) => {
                this.handleMonitorReply(socket, data);
            });

            // ============ 已读状态处理事件 ============

            // 标记单条消息已读
            socket.on('monitor:mark_as_read', (data) => {
                this.handleMarkAsRead(socket, data);
            });

            // 批量标记已读
            socket.on('monitor:mark_batch_as_read', (data) => {
                this.handleMarkBatchAsRead(socket, data);
            });

            // 按作品标记所有评论已读
            socket.on('monitor:mark_topic_as_read', (data) => {
                this.handleMarkTopicAsRead(socket, data);
            });

            // 按会话标记所有私信已读
            socket.on('monitor:mark_conversation_as_read', (data) => {
                this.handleMarkConversationAsRead(socket, data);
            });

            // 获取未读计数
            socket.on('monitor:get_unread_count', (data) => {
                this.handleGetUnreadCount(socket, data);
            });

            // 断开连接
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });
        });

        // ✅ 监听 Worker 命名空间的回复结果
        const workerNamespace = this.io.of('/worker');
        workerNamespace.on('connection', (socket) => {
            // 监听 Worker 发送的回复结果
            socket.on('worker:reply:result', (data) => {
                this.handleWorkerReplyResult(socket, data);
            });
        });

        logger.info('IM WebSocket handlers setup complete');
    }

    /**
     * 处理监控客户端注册
     */
    handleMonitorRegister(socket, data) {
        try {
            const clientId = data.clientId || socket.id;
            const clientType = data.clientType || 'monitor';

            // 保存客户端映射
            if (clientType === 'admin') {
                this.adminClients.set(clientId, socket.id);
                logger.info(`[IM WS] Admin registered: ${clientId}`);
            } else {
                this.monitorClients.set(clientId, socket.id);
                logger.info(`[IM WS] Monitor client registered: ${clientId}`);
            }

            this.socketToClientId.set(socket.id, clientId);

            // 发送频道列表
            const channels = this.getChannelsFromDataStore();
            socket.emit('monitor:channels', { channels });

            // 注册确认
            socket.emit('monitor:registered', {
                success: true,
                channelCount: channels.length,
                clientId: clientId,
                clientType: clientType
            });

            logger.info(`[IM WS] Client registered: ${clientId}, type: ${clientType}, channels: ${channels.length}`);
        } catch (error) {
            logger.error('[IM WS] Monitor register error:', error);
            logger.error('[IM WS] Error stack:', error.stack);
            logger.error('[IM WS] accountDAO status:', this.accountDAO ? 'initialized' : 'NOT initialized');
            socket.emit('error', { message: '监控注册失败', details: error.message });
        }
    }

    /**
     * 处理请求频道列表
     */
    handleRequestChannels(socket) {
        try {
            const channels = this.getChannelsFromDataStore();
            socket.emit('monitor:channels', { channels });
            logger.info(`[IM WS] Sent ${channels.length} channels to ${socket.id}`);
        } catch (error) {
            logger.error('[IM WS] Request channels error:', error);
        }
    }

    /**
     * 处理请求主题列表
     */
    handleRequestTopics(socket, data) {
        try {
            const { channelId } = data;
            logger.info(`[IM WS] Request topics for channel: ${channelId}`);

            const topics = this.getTopicsFromDataStore(channelId);
            socket.emit('monitor:topics', { channelId, topics });

            logger.info(`[IM WS] Sent ${topics.length} topics for channel ${channelId}`);
        } catch (error) {
            logger.error('[IM WS] Request topics error:', error);
        }
    }

    /**
     * 处理请求消息列表
     */
    handleRequestMessages(socket, data) {
        try {
            const { topicId } = data;
            logger.info(`[IM WS] Request messages for topic: ${topicId}`);

            const messages = this.getMessagesFromDataStore(topicId);
            socket.emit('monitor:messages', { topicId, messages });

            // ✅ 同时发送该主题的发送队列
            const sendingMessages = this.sendingQueues.get(topicId) || [];
            socket.emit('monitor:sending_queue', {
                topicId,
                sendingMessages
            });

            logger.info(`[IM WS] Sent ${messages.length} messages and ${sendingMessages.length} sending messages for topic ${topicId}`);
        } catch (error) {
            logger.error('[IM WS] Request messages error:', error);
        }
    }

    /**
     * 处理监控客户端回复
     */
    async handleMonitorReply(socket, data) {
        try {
            const { channelId, topicId, content, replyToId, replyToContent, messageCategory, fromName, fromId, authorAvatar: clientAuthorAvatar } = data;
            logger.info(`[IM WS] Monitor reply:`, { channelId, topicId, content, messageCategory, fromName, fromId, clientAuthorAvatar });

            // 🔍 DEBUG: 打印完整的接收数据
            logger.warn(`[DEBUG] handleMonitorReply 完整接收数据:`);
            logger.warn(`  channelId: ${data.channelId}`);
            logger.warn(`  topicId: ${data.topicId}`);
            logger.warn(`  content: ${data.content}`);
            logger.warn(`  replyToId: ${data.replyToId}`);
            logger.warn(`  replyToContent: ${data.replyToContent}`);
            logger.warn(`  messageCategory: ${data.messageCategory}`);
            logger.warn(`  fromName: ${data.fromName}`);
            logger.warn(`  fromId: ${data.fromId}`);
            logger.warn(`  所有字段: ${Object.keys(data).join(', ')}`);

            // 🔍 智能判断消息类型：如果 messageCategory 未定义，通过数据推断
            let finalMessageCategory = messageCategory;
            if (!messageCategory || messageCategory === 'undefined') {
                // 通过 DataStore 查找 topicId 是否为私信会话
                const accountData = this.dataStore.accounts.get(channelId);
                if (accountData && accountData.data && accountData.data.conversations) {
                    const conversationsList = accountData.data.conversations instanceof Map ?
                        Array.from(accountData.data.conversations.values()) : accountData.data.conversations;
                    const isPrivateConversation = conversationsList.some(conv => conv.conversationId === topicId);
                    finalMessageCategory = isPrivateConversation ? 'private' : 'comment';
                    logger.warn(`[DEBUG] messageCategory 未定义，通过数据推断为: "${finalMessageCategory}" (topicId: ${topicId})`);
                } else {
                    finalMessageCategory = 'comment'; // 默认为评论
                    logger.warn(`[DEBUG] messageCategory 未定义且无法推断，默认为: "comment"`);
                }
            }

            // 根据消息分类确定消息类型和目标类型
            const messageType = finalMessageCategory === 'private' ? 'text' : 'comment';

            // 🔍 区分作品评论和评论回复
            // - 如果是私信 → direct_message
            // - 如果是评论 + replyToId存在 → comment (回复某条评论)
            // - 如果是评论 + replyToId为空 → work (给作品发一级评论)
            let targetType;
            if (finalMessageCategory === 'private') {
                targetType = 'direct_message';
            } else if (replyToId) {
                targetType = 'comment';  // 回复某条评论
            } else {
                targetType = 'work';  // 给作品发一级评论
            }

            // 🔍 DEBUG: 打印判断结果
            logger.warn(`[DEBUG] messageCategory: "${messageCategory}" -> finalMessageCategory: "${finalMessageCategory}" -> messageType: "${messageType}", targetType: "${targetType}"`);
            logger.warn(`[DEBUG] replyToId: ${replyToId} (${replyToId ? '回复评论' : '回复作品'})`);

            if (finalMessageCategory === 'private') {
                logger.warn(`[DEBUG] 这是私信回复，应该调用 replyToDirectMessage`);
            } else if (targetType === 'comment') {
                logger.warn(`[DEBUG] 这是评论回复（二级回复），应该调用 replyToComment with commentId: ${replyToId}`);
            } else {
                logger.warn(`[DEBUG] 这是作品评论（一级评论），应该调用 replyToComment with commentId: null`);
            }

            // 创建回复消息ID（用于客户端展示和结果追踪）
            const replyId = `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // ✅ 优先使用前端传来的头像，如果没有则根据 fromId 查找
            let finalAuthorAvatar = clientAuthorAvatar || null;

            // 如果前端没有提供头像，且是私信回复，则根据 senderId 查找头像
            if (!finalAuthorAvatar && messageCategory === 'private' && this.dataStore) {
                const accountData = this.dataStore.accounts.get(channelId);
                const senderId = fromId || 'monitor_client';

                // ✅ 构建 userId -> userAvatar 映射表（包含对方用户和账户自己）
                const userAvatarMap = new Map();

                // 1. 添加对方用户的头像（从 conversations）
                if (accountData && accountData.conversations) {
                    const conversationsList = accountData.conversations instanceof Map ?
                        Array.from(accountData.conversations.values()) : accountData.conversations;
                    conversationsList.forEach(conv => {
                        if (conv.userId && (conv.platform_user_avatar || conv.userAvatar)) {
                            userAvatarMap.set(conv.userId, conv.platform_user_avatar || conv.userAvatar);
                        }
                    });
                }

                // 2. 添加账户自己的头像（从 accounts 表）
                // senderId 可能等于 channelId（账户自己发送的消息）
                if (this.accountDAO) {
                    try {
                        const accountInfo = this.accountDAO.findById(channelId);
                        if (accountInfo && accountInfo.avatar) {
                            userAvatarMap.set(channelId, accountInfo.avatar);
                            // 也可能需要添加其他可能的 ID 格式
                            if (accountInfo.account_id) {
                                userAvatarMap.set(accountInfo.account_id, accountInfo.avatar);
                            }
                        }
                    } catch (error) {
                        logger.warn(`[IM WS] Failed to get account avatar for ${channelId}:`, error.message);
                    }
                }

                // ✅ 根据消息发送者ID查找头像
                finalAuthorAvatar = userAvatarMap.get(senderId) || null;

                logger.debug(`[IM WS] Customer service reply avatar lookup:`, {
                    channelId,
                    senderId,
                    userAvatarMapSize: userAvatarMap.size,
                    foundAvatar: !!finalAuthorAvatar,
                    avatarUrl: finalAuthorAvatar
                });
            }

            // 创建回复消息（立即广播给所有监控客户端，显示"发送中"状态）
            const replyMessage = {
                id: replyId,
                channelId,
                topicId,
                fromName: fromName || '客服',  // ✅ 使用前端传来的真实用户名
                fromId: fromId || 'monitor_client',  // ✅ 使用前端传来的真实用户ID
                authorAvatar: finalAuthorAvatar,  // ✅ 优先使用前端传来的头像，fallback 到 conversations 查找
                content,
                type: messageType,
                messageCategory: finalMessageCategory,
                direction: 'outbound',  // ✅ 标记为客服发送的消息
                timestamp: Date.now(),
                serverTimestamp: Date.now(),
                replyToId,
                replyToContent,
                isRead: true,  // ✅ 修复: 客服发送的消息应该标记为已读，不计入未读计数
                status: 'sending'
            };

            // ✅ 保存到待确认存储，等Worker完成处理后再广播给前端
            this.pendingReplies.set(replyId, replyMessage);

            // ✅ 添加到发送队列
            const sendingMessage = {
                id: replyId,
                topicId,
                channelId,
                content,
                fromName: fromName || '客服',
                fromId: fromId || 'monitor_client',
                authorAvatar: finalAuthorAvatar,
                messageCategory: finalMessageCategory,
                status: 'sending',
                timestamp: Date.now(),
                replyToId,
                replyToContent
            };

            if (!this.sendingQueues.has(topicId)) {
                this.sendingQueues.set(topicId, []);
            }
            this.sendingQueues.get(topicId).push(sendingMessage);

            logger.info(`[IM WS] Added to sending queue: ${replyId} for topic ${topicId}`);

            // ✅ 立即广播队列更新给所有监控客户端
            this.broadcastSendingQueue(topicId);

            // ✅ 查找负责该账户的 Worker 并发送回复任务
            if (this.workerRegistry && this.accountDAO) {
                try {
                    // 查询账户信息，获取 assigned_worker_id 和 platform
                    const accountInfo = this.accountDAO.findById(channelId);
                    if (!accountInfo) {
                        throw new Error(`Account not found: ${channelId}`);
                    }

                    const { assigned_worker_id, platform } = accountInfo;
                    if (!assigned_worker_id) {
                        throw new Error(`No worker assigned to account: ${channelId}`);
                    }

                    // 获取 Worker socket
                    const workerSocket = this.workerRegistry.getWorkerSocket(assigned_worker_id);
                    if (!workerSocket || !workerSocket.connected) {
                        throw new Error(`Worker not connected: ${assigned_worker_id}`);
                    }

                    // ✅ 在发送给 Worker 之前，先在数据库中创建回复记录
                    if (this.replyDAO) {
                        try {
                            this.replyDAO.createReply({
                                id: replyId,  // 使用 monitor 生成的 replyId
                                requestId: requestId,
                                platform: platform,
                                accountId: channelId,
                                targetType: targetType,
                                targetId: replyToId || topicId,
                                replyContent: content,
                                videoId: targetType === 'comment' ? topicId : null,
                                userId: targetType === 'direct_message' ? (replyToId || topicId) : null,
                                platformTargetId: replyToId || topicId,
                                assignedWorkerId: assigned_worker_id,
                            });
                            logger.info(`[IM WS] Reply record created in DB: ${replyId}`);
                        } catch (dbError) {
                            logger.error(`[IM WS] Failed to create reply record in DB: ${dbError.message}`);
                            // 继续执行，不因为 DB 错误而阻止回复发送
                        }
                    }

                    // ✅ 如果是评论回复,从DataStore中获取视频标题和父评论ID
                    let videoTitle = null;
                    let parentCommentId = null;
                    // ✅ 修复: 作品评论和评论回复都需要查找视频标题
                    if ((targetType === 'comment' || targetType === 'work') && this.dataStore) {
                        try {
                            const accountData = this.dataStore.accounts.get(channelId);
                            if (accountData && accountData.data && accountData.data.contents) {
                                const contentsList = accountData.data.contents instanceof Map ?
                                    Array.from(accountData.data.contents.values()) : accountData.data.contents;
                                const videoContent = contentsList.find(c => c.contentId === topicId || c.id === topicId);
                                if (videoContent) {
                                    videoTitle = videoContent.title || null;
                                    logger.info(`[IM WS] Found video title for ${topicId}: "${videoTitle?.substring(0, 50)}..." (targetType: ${targetType})`);
                                } else {
                                    logger.warn(`[IM WS] ⚠️ Video not found for topicId: ${topicId}`);
                                }
                            }

                            // ✅ 如果replyToId存在(回复某条评论),从conversations中查找parent_comment_id
                            if (replyToId && accountData && accountData.data && accountData.data.comments) {
                                const commentsList = accountData.data.comments instanceof Map
                                    ? Array.from(accountData.data.comments.values())
                                    : accountData.data.comments;
                                const targetComment = commentsList.find(c => c.id === replyToId);
                                if (targetComment && targetComment.parent_comment_id) {
                                    parentCommentId = targetComment.parent_comment_id;
                                    logger.info(`[IM WS] Found parent comment ID for ${replyToId}: ${parentCommentId} (二级回复)`);
                                } else {
                                    logger.info(`[IM WS] No parent comment ID for ${replyToId} (一级评论回复)`);
                                }
                            }
                        } catch (err) {
                            logger.warn(`[IM WS] Failed to get video title or parent comment: ${err.message}`);
                        }
                    }

                    // 构造回复任务（包含完整的执行信息，Worker 无需查询数据库）
                    const replyTask = {
                        // 基本执行信息
                        reply_id: replyId,
                        request_id: requestId,
                        platform: platform,
                        account_id: channelId,
                        target_type: targetType,  // 'comment'、'work' 或 'direct_message'
                        // ✅ 修复: 作品评论时 target_id 应为 null，而不是 topicId
                        target_id: targetType === 'direct_message' ? (replyToId || topicId) :
                                   targetType === 'work' ? null :
                                   replyToId,  // comment 类型使用 replyToId
                        conversation_id: targetType === 'direct_message' ? topicId : null,  // 私信会话ID
                        platform_message_id: targetType === 'direct_message' ? replyToId : null,  // 私信消息ID（可选）
                        reply_content: content,

                        // 扩展执行信息（Worker 离线操作需要的数据）
                        assigned_worker_id: assigned_worker_id,
                        created_at: Date.now(),
                        submit_time: Date.now(),

                        // 执行上下文
                        context: {
                            reply_to_content: replyToContent,
                            monitor_client_id: socket.id,
                            channel_name: accountInfo.account_name || channelId,
                            video_id: targetType === 'comment' ? topicId : null,
                            video_title: videoTitle,  // ✅ 视频标题用于匹配
                            parent_comment_id: parentCommentId,  // ✅ 新增: 父评论ID,用于定位二级回复
                            user_id: targetType === 'direct_message' ? (replyToId || topicId) : null
                        }
                    };

                    // ✅ 在发送给 Worker 之前，更新状态为 executing
                    if (this.replyDAO) {
                        try {
                            this.replyDAO.updateReplyStatusToExecuting(replyId);
                            logger.info(`[IM WS] Reply status updated to executing: ${replyId}`);
                        } catch (statusError) {
                            logger.error(`[IM WS] Failed to update reply status to executing: ${statusError.message}`);
                        }
                    }

                    // 🔍 DEBUG: 打印发送给 Worker 的完整任务数据
                    logger.warn(`[DEBUG] 发送给 Worker 的完整 replyTask:`, JSON.stringify(replyTask, null, 2));

                    // 发送给 Worker
                    workerSocket.emit('master:reply:request', replyTask);

                    logger.info(`[IM WS] Reply task sent to worker ${assigned_worker_id}`, {
                        replyId,
                        requestId,
                        platform,
                        targetType
                    });

                    // 确认回复任务已提交
                    socket.emit('reply:success', {
                        messageId: replyId,
                        requestId: requestId,
                        status: 'submitted'
                    });

                } catch (error) {
                    logger.error('[IM WS] Failed to send reply task to worker:', error);

                    // 更新回复状态为失败
                    this.broadcastToMonitors('channel:message:status', {
                        messageId: replyId,
                        status: 'failed',
                        error: error.message
                    });

                    // 返回错误给客户端
                    socket.emit('reply:error', {
                        messageId: replyId,
                        error: error.message
                    });
                }
            } else {
                // 没有 workerRegistry，只做客户端广播（向后兼容）
                logger.warn('[IM WS] WorkerRegistry not available, reply will not be sent to platform');
                socket.emit('reply:success', {
                    messageId: replyId,
                    status: 'local_only',
                    warning: 'Reply not sent to platform (WorkerRegistry not available)'
                });
            }

        } catch (error) {
            logger.error('[IM WS] Monitor reply error:', error);
            socket.emit('reply:error', { error: error.message });
        }
    }

    /**
     * 处理 Worker 回复结果
     * Worker 执行回复后，返回结果（成功/失败）
     */
    handleWorkerReplyResult(socket, data) {
        try {
            const { reply_id, request_id, status, error_message, platform_reply_id } = data;

            logger.info(`[IM WS] Worker reply result received:`, {
                replyId: reply_id,
                requestId: request_id,
                status,
                workerId: socket.workerId
            });

            // ✅ 方案2实现：先让 Master 主流程处理数据库更新
            if (this.replyDAO) {
                try {
                    // 调用 Master 主流程的处理逻辑
                    this.handleReplyResultDatabase(data);
                } catch (dbError) {
                    logger.error(`[IM WS] Database update failed for reply ${reply_id}:`, dbError.message);
                }
            }

            // ✅ 从待确认存储中获取原始消息
            const originalMessage = this.pendingReplies.get(reply_id);

            // ✅ 在外部定义 messageStatus，避免作用域问题
            let messageStatus = 'sent';
            if (status === 'failed' || status === 'blocked' || status === 'error') {
                messageStatus = 'failed';
            } else if (status === 'success') {
                messageStatus = 'sent';
            }

            if (originalMessage) {
                // 更新消息状态和平台回复ID
                const finalMessage = {
                    ...originalMessage,
                    status: messageStatus,
                    platformReplyId: platform_reply_id,
                    errorMessage: error_message,
                    serverTimestamp: Date.now()
                };

                // ✅ 从发送队列中移除该消息
                const topicId = originalMessage.topicId;
                if (this.sendingQueues.has(topicId)) {
                    const queue = this.sendingQueues.get(topicId);
                    const messageIndex = queue.findIndex(msg => msg.id === reply_id);
                    if (messageIndex >= 0) {
                        queue.splice(messageIndex, 1);
                        logger.info(`[IM WS] Removed from sending queue: ${reply_id}`);

                        // 如果队列为空，移除整个队列
                        if (queue.length === 0) {
                            this.sendingQueues.delete(topicId);
                        }
                    }
                }

                // ✅ 广播队列更新给所有监控客户端（无论成功还是失败）
                this.broadcastSendingQueue(topicId);

                if (status === 'success') {
                    logger.info(`[IM WS] Reply success: ${reply_id}`);
                } else {
                    logger.warn(`[IM WS] Reply failed: ${reply_id} - ${error_message}`);
                }

                // 清理待确认存储
                this.pendingReplies.delete(reply_id);
            } else {
                logger.warn(`[IM WS] Original message not found for reply: ${reply_id}`);
            }

            logger.info(`[IM WS] Reply result processed and broadcasted: ${reply_id} -> ${messageStatus}`);
        } catch (error) {
            logger.error('[IM WS] Handle worker reply result error:', error);
        }
    }

    /**
     * 处理回复结果的数据库更新部分 (从 Master index.js 抽取)
     */
    handleReplyResultDatabase(data) {
        const { reply_id, request_id, status, platform_reply_id, error_code, error_message } = data;

        logger.info(`[IM WS] Processing reply result database update: ${reply_id}`, {
            requestId: request_id,
            status,
        });

        // 获取回复记录
        const reply = this.replyDAO.getReplyById(reply_id);
        if (!reply) {
            logger.warn(`[IM WS] Reply not found in database: ${reply_id}`);
            return;
        }

        // 检查是否已经处理过（防止重复处理）
        if (reply.reply_status !== 'executing' && reply.reply_status !== 'pending') {
            logger.warn(`[IM WS] Reply already processed: ${reply_id}, status: ${reply.reply_status}`);
            return;
        }

        // 如果状态还是 pending，先更新为 executing（兼容性处理）
        if (reply.reply_status === 'pending') {
            logger.info(`[IM WS] Reply status was pending, updating to executing: ${reply_id}`);
            this.replyDAO.updateReplyStatusToExecuting(reply_id);
        }

        // 根据状态处理回复
        if (status === 'success') {
            // 成功：保存到数据库
            this.replyDAO.updateReplySuccess(reply_id, platform_reply_id, data.data);
            logger.info(`[IM WS] Reply success updated in database: ${reply_id}`, { platformReplyId: platform_reply_id });
        } else if (status === 'failed' || status === 'blocked' || status === 'error') {
            // 失败：更新失败状态
            this.replyDAO.updateReplyFailed(reply_id, error_code || 'UNKNOWN_ERROR', error_message || 'Unknown error');
            logger.info(`[IM WS] Reply failure updated in database: ${reply_id}`, { errorCode: error_code, errorMessage: error_message });
        }
    }

    /**
     * 处理断开连接
     */
    handleDisconnect(socket) {
        const clientId = this.socketToClientId.get(socket.id);
        if (clientId) {
            this.socketToClientId.delete(socket.id);

            if (this.adminClients.has(clientId)) {
                logger.info(`[IM WS] Admin disconnected: ${clientId}`);
            } else if (this.monitorClients.has(clientId)) {
                logger.info(`[IM WS] Monitor client disconnected: ${clientId}`);
            }
        }
        logger.info(`[IM WS] Client disconnected: ${socket.id}`);
    }

    /**
     * 从 DataStore 获取频道列表
     * 频道 = 账户
     */
    getChannelsFromDataStore() {
        const channels = [];

        // 遍历 DataStore 中的所有账户
        for (const [accountId, accountData] of this.dataStore.accounts) {
            // DataStore 数据结构是 {accountId, platform, lastUpdate, data}
            const dataObj = accountData.data || accountData;

            // ✅ 从数据库查询账户信息（获取平台昵称和用户信息）
            let accountInfo = null;
            if (this.accountDAO) {
                try {
                    accountInfo = this.accountDAO.findById(accountId);  // ✅ 正确的方法名

                    // ✅ 修复：如果数据库中不存在该账户，跳过它（过滤已删除的账户）
                    if (!accountInfo) {
                        logger.info(`[IM WS] Account ${accountId} not found in database, skipping (already deleted)`);
                        continue;  // 跳过这个账户，不加入channels列表
                    }
                } catch (error) {
                    logger.warn(`[IM WS] Failed to get account info for ${accountId}:`, error.message);
                    continue;  // 查询失败也跳过
                }
            } else {
                logger.warn('[IM WS] accountDAO is not initialized, using default values');
            }
            const accountName = accountInfo?.account_name || accountId;
            const avatar = accountInfo?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`;
            const userInfo = accountInfo?.user_info || null;  // ✅ 获取用户信息字段
            const platform = accountData.platform || accountInfo?.platform || '';

            // 计算未读消息数
            const unreadCount = this.calculateUnreadCount(dataObj);

            // 查找最新消息
            const lastMessage = this.findLastMessage(dataObj);

            // 🔍 DEBUG: 打印 lastMessage 的内容
            if (lastMessage) {
                logger.info(`[DEBUG] lastMessage 对象:`);
                logger.info(`  content: ${lastMessage.content}`);
                logger.info(`  timestamp: ${lastMessage.timestamp}`);
                logger.info(`  typeof timestamp: ${typeof lastMessage.timestamp}`);
                logger.info(`  转换为日期: ${new Date(lastMessage.timestamp).toLocaleString('zh-CN')}`);
            }

            const channel = {
                id: accountId,
                name: accountName,  // ✅ 使用数据库中的平台昵称
                avatar: avatar,     // ✅ 使用数据库中的头像
                userInfo: userInfo, // ✅ 包含详细的用户信息（nickname, douyin_id等）
                platform: platform, // ✅ 平台标识
                description: accountData.platform || '',
                lastMessage: lastMessage?.content || '',
                lastMessageTime: lastMessage?.timestamp || accountData.lastUpdate || Date.now(),
                unreadCount: unreadCount,
                messageCount: dataObj.messages?.length || 0,
                isPinned: false,
                enabled: true
            };

            // 🔍 DEBUG: 打印 channel 对象
            logger.info(`[DEBUG] Channel 对象:`);
            logger.info(`  id: ${channel.id}`);
            logger.info(`  name: ${channel.name}`);  // ✅ DEBUG: 打印账户名称
            logger.info(`  avatar: ${channel.avatar?.substring(0, 60)}...`);
            logger.info(`  userInfo: ${channel.userInfo ? '存在' : '不存在'}`);
            if (channel.userInfo) {
                try {
                    const parsed = JSON.parse(channel.userInfo);
                    logger.info(`  userInfo.nickname: ${parsed.nickname}`);
                    logger.info(`  userInfo.douyin_id: ${parsed.douyin_id || parsed.platformUserId}`);
                } catch (e) {
                    logger.error(`  ❌ userInfo 解析失败: ${e.message}`);
                }
            }
            logger.info(`  platform: ${channel.platform}`);
            logger.info(`  lastMessageTime: ${channel.lastMessageTime}`);
            logger.info(`  typeof lastMessageTime: ${typeof channel.lastMessageTime}`);
            logger.info(`  转换为日期: ${new Date(channel.lastMessageTime).toLocaleString('zh-CN')}`);

            channels.push(channel);
        }

        // 按最后消息时间排序
        channels.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

        return channels;
    }

    /**
     * 从 DataStore 获取主题列表
     * 主题 = 作品/会话
     */
    getTopicsFromDataStore(channelId) {
        // ✅ 辅助函数: 归一化时间戳到毫秒级 (13位)
        const normalizeTimestamp = (timestamp) => {
            if (!timestamp) return Date.now();

            // 🔧 处理字符串类型的时间戳
            if (typeof timestamp === 'string') {
                // ✅ 优先尝试解析 ISO 8601 格式 (YYYY-MM-DDTHH:mm:ss.sssZ)
                if (timestamp.includes('T') || timestamp.includes('-')) {
                    const isoDate = new Date(timestamp);
                    if (!isNaN(isoDate.getTime())) {
                        return isoDate.getTime();  // 返回毫秒级时间戳
                    }
                }

                // 尝试解析中文日期字符串 "发布于2025年11月02日 09:00"
                const match = timestamp.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
                if (match) {
                    const [, year, month, day, hour, minute] = match;
                    const date = new Date(
                        parseInt(year),
                        parseInt(month) - 1,  // 月份从 0 开始
                        parseInt(day),
                        parseInt(hour),
                        parseInt(minute)
                    );
                    logger.debug(`[DEBUG] 解析中文日期字符串: ${timestamp} → ${date.getTime()}`);
                    return date.getTime();  // 返回毫秒级时间戳
                }

                // 如果是纯数字字符串，转换为数字
                const numericTimestamp = parseInt(timestamp);
                if (!isNaN(numericTimestamp)) {
                    timestamp = numericTimestamp;
                } else {
                    // 无法解析，返回当前时间
                    logger.warn(`[DEBUG] 无法解析时间戳字符串: ${timestamp}`);
                    return Date.now();
                }
            }

            // 处理数字类型的时间戳
            // 如果是秒级 (10位),转换为毫秒
            if (timestamp < 10000000000) {
                return timestamp * 1000;
            }
            // 如果已经是毫秒级 (13位),直接返回
            return timestamp;
        };

        const accountData = this.dataStore.accounts.get(channelId);

        // 详细的调试日志
        logger.info(`[DEBUG] getTopicsFromDataStore called for channel: ${channelId}`);
        logger.info(`[DEBUG] accountData exists: ${!!accountData}`);

        if (!accountData) {
            logger.warn(`[DEBUG] No accountData found for channel: ${channelId}`);
            return [];
        }

        // 输出 accountData 的所有字段名
        const fields = Object.keys(accountData);
        logger.info(`[DEBUG] accountData fields: ${fields.join(', ')}`);

        // DataStore 数据结构是 {accountId, platform, lastUpdate, data}
        // 实际数据在 data 字段中
        const dataObj = accountData.data || accountData;

        // 检查各个字段的值（DataStore 使用 Map 存储，需要用 .size）
        const contentsSize = dataObj.contents instanceof Map ? dataObj.contents.size : (dataObj.contents?.length || 0);
        const conversationsSize = dataObj.conversations instanceof Map ? dataObj.conversations.size : (dataObj.conversations?.length || 0);
        const commentsSize = dataObj.comments instanceof Map ? dataObj.comments.size : (dataObj.comments?.length || 0);
        const messagesSize = dataObj.messages instanceof Map ? dataObj.messages.size : (dataObj.messages?.length || 0);

        logger.info(`[DEBUG] dataObj.contents exists: ${!!dataObj.contents}, size: ${contentsSize}`);
        logger.info(`[DEBUG] dataObj.conversations exists: ${!!dataObj.conversations}, size: ${conversationsSize}`);
        logger.info(`[DEBUG] dataObj.comments exists: ${!!dataObj.comments}, size: ${commentsSize}`);
        logger.info(`[DEBUG] dataObj.messages exists: ${!!dataObj.messages}, size: ${messagesSize}`);

        const topics = [];

        // 从作品创建主题
        if (contentsSize > 0) {
            logger.info(`[DEBUG] Processing ${contentsSize} contents`);
            const contentsList = dataObj.contents instanceof Map ? Array.from(dataObj.contents.values()) : dataObj.contents;
            const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : (dataObj.comments || []);

            // 调试：输出所有评论的 contentId
            const commentContentIds = commentsList.map(c => c.contentId);
            logger.warn(`[DEBUG] 评论的 contentId 列表: ${JSON.stringify(commentContentIds)}`);

            // 调试：输出所有作品的 contentId
            const contentIds = contentsList.map(c => c.contentId);
            logger.warn(`[DEBUG] 作品的 contentId 列表: ${JSON.stringify(contentIds)}`);

            let topicsWithComments = 0;

            for (const content of contentsList) {
                // 计算该作品的评论数（使用 camelCase: contentId）
                const contentComments = commentsList.filter(c => c.contentId === content.contentId);

                if (contentComments.length > 0) {
                    topicsWithComments++;
                    logger.warn(`[DEBUG] 作品 "${content.title}" (contentId: ${content.contentId}) 有 ${contentComments.length} 条评论`);
                }

                // ✅ 修复: 计算该作品的最新评论时间（从评论列表中获取，而不是 lastCrawlTime）
                let actualLastCommentTime = content.lastCrawlTime;
                let latestComment = null;
                if (contentComments.length > 0) {
                    const sortedComments = [...contentComments].sort((a, b) => {
                        const aTime = a.createdAt || a.timestamp || 0;
                        const bTime = b.createdAt || b.timestamp || 0;
                        return bTime - aTime;
                    });
                    latestComment = sortedComments[0];
                    actualLastCommentTime = latestComment.createdAt || latestComment.timestamp || content.lastCrawlTime;
                }

                const topic = {
                    id: content.contentId,
                    channelId: channelId,
                    title: content.title || '无标题作品',
                    avatar: content.coverUrl || null,  // ✅ 新增: 作品封面图作为头像
                    description: content.description || '',
                    createdTime: normalizeTimestamp(content.publishTime),  // ✅ 归一化时间戳
                    lastMessageTime: normalizeTimestamp(actualLastCommentTime),  // ✅ 修复: 使用评论列表中的实际最新时间
                    lastMessageContent: latestComment?.content || '',  // ✅ 新增: 最后评论的内容
                    lastMessageFromName: latestComment?.fromName || latestComment?.authorName || '',  // ✅ 新增: 最后评论的发送者
                    messageCount: contentComments.length,
                    // ✅ 修复: 排除客服发送的消息 (direction='outbound') 和已读消息 (isRead=true)
                    unreadCount: contentComments.filter(c => {
                        // 1. 如果是客服发送的，不计入未读
                        if (c.direction === 'outbound') return false;
                        // 2. 如果已标记为已读，不计入未读
                        if (c.isRead) return false;
                        // 3. 其他情况算作未读
                        return true;
                    }).length,
                    isPinned: false,
                    isPrivate: false  // ✅ 标记为评论主题（非私信）
                };

                // 🔍 DEBUG: 打印前3个作品的时间戳原始值和转换结果
                if (topics.length < 3) {
                    logger.info(`[DEBUG] 作品 #${topics.length + 1} 时间戳:`);
                    logger.info(`  content.publishTime (原始): ${content.publishTime}`);
                    logger.info(`  content.lastCrawlTime (原始): ${content.lastCrawlTime}`);
                    logger.info(`  topic.createdTime (归一化后): ${topic.createdTime} → ${new Date(topic.createdTime).toLocaleString('zh-CN')}`);
                    logger.info(`  topic.lastMessageTime (归一化后): ${topic.lastMessageTime} → ${new Date(topic.lastMessageTime).toLocaleString('zh-CN')}`);
                }

                topics.push(topic);
            }
            logger.info(`[DEBUG] Created ${topics.length} topics from contents`);
            logger.warn(`[DEBUG] 其中有评论的主题数: ${topicsWithComments}`);
        } else {
            logger.warn(`[DEBUG] No contents found or contents is empty`);
        }

        // 从会话创建主题
        if (conversationsSize > 0) {
            logger.info(`[DEBUG] Processing ${conversationsSize} conversations`);
            const beforeCount = topics.length;
            const conversationsList = dataObj.conversations instanceof Map ? Array.from(dataObj.conversations.values()) : dataObj.conversations;
            const messagesList = dataObj.messages instanceof Map ? Array.from(dataObj.messages.values()) : (dataObj.messages || []);

            // 🔍 打印第一个 conversation 对象的完整结构
            if (conversationsList.length > 0) {
                const sampleConv = conversationsList[0];
                logger.info(`[DEBUG] 第一个 conversation 对象:`);
                logger.info(`  conversationId: ${sampleConv.conversationId}`);
                logger.info(`  userName: ${sampleConv.userName}`);
                logger.info(`  createdAt: ${sampleConv.createdAt} (${sampleConv.createdAt ? new Date(sampleConv.createdAt).toLocaleString('zh-CN') : 'N/A'})`);
                logger.info(`  updatedAt: ${sampleConv.updatedAt} (${sampleConv.updatedAt ? new Date(sampleConv.updatedAt).toLocaleString('zh-CN') : 'N/A'})`);
                logger.info(`  lastMessageTime: ${sampleConv.lastMessageTime} (${sampleConv.lastMessageTime ? new Date(sampleConv.lastMessageTime).toLocaleString('zh-CN') : 'N/A'})`);
                logger.info(`  所有字段: ${Object.keys(sampleConv).join(', ')}`);
            }

            for (const conversation of conversationsList) {
                // 计算该会话的消息数（使用 camelCase: conversationId）
                const conversationMessages = messagesList.filter(m => m.conversationId === conversation.conversationId);

                // ✅ 服务端过滤：跳过无消息的会话，不推送给 IM 客户端
                if (conversationMessages.length === 0) {
                    logger.debug(`[FILTER] 跳过无消息的会话: ${conversation.userName || conversation.conversationId}`);
                    continue;  // 跳过此会话，不添加到 topics 列表
                }

                // ✅ 实时计算未读消息数量（不使用数据库的 unreadCount）
                // 统一标准：排除客服发送的消息 (direction='outbound') 和已读消息 (isRead=true)
                const unreadMessages = conversationMessages.filter(m => {
                    // 1. 如果是客服发送的消息，不计入未读
                    if (m.direction === 'outbound') return false;
                    // 2. 如果已标记为已读，不计入未读
                    if (m.isRead) return false;
                    // 3. 其他情况算作未读
                    return true;
                });

                // ✅ 计算该会话的最新消息时间（从消息列表中获取，而不是数据库的 lastMessageTime）
                const sortedMessages = [...conversationMessages].sort((a, b) => {
                    const aTime = a.createdAt || a.timestamp || 0;
                    const bTime = b.createdAt || b.timestamp || 0;
                    return bTime - aTime;  // 降序排序，最新的在前
                });
                const latestMessage = sortedMessages[0];
                const actualLastMessageTime = latestMessage ? (latestMessage.createdAt || latestMessage.timestamp) : conversation.lastMessageTime;

                // ✅ 只推送有消息的会话
                const topic = {
                    id: conversation.conversationId,
                    channelId: channelId,
                    title: conversation.userName || '未知用户',
                    avatar: conversation.platform_user_avatar || conversation.userAvatar || null,  // ✅ 新增: 对方用户头像 (优先使用 platform_user_avatar)
                    description: `私信会话 (${conversationMessages.length}条消息)`,
                    createdTime: normalizeTimestamp(conversation.createdAt),  // ✅ 修复: 归一化时间戳
                    lastMessageTime: normalizeTimestamp(actualLastMessageTime),  // ✅ 修复: 使用消息列表中的实际最新时间
                    lastMessageContent: latestMessage?.content || '',  // ✅ 新增: 最后消息的内容
                    lastMessageFromName: latestMessage?.fromName || latestMessage?.senderName || '',  // ✅ 新增: 最后消息的发送者
                    messageCount: conversationMessages.length,
                    unreadCount: unreadMessages.length,  // ✅ 实时计算: 从内存中的消息列表计算未读数量
                    isPinned: false,
                    isPrivate: true  // ✅ 新增: 标记为私信主题
                };

                // 🔍 调试: 打印前3个会话的头像数据
                if (topics.length < 3) {
                    logger.debug(`[IM-WS] Conversation topic avatar debug:`, {
                        conversationId: conversation.conversationId,
                        userName: conversation.userName,
                        platform_user_avatar: conversation.platform_user_avatar,
                        userAvatar: conversation.userAvatar,
                        finalAvatar: topic.avatar
                    });
                }

                topics.push(topic);

                // 🔍 调试日志：打印未读消息计算结果
                if (unreadMessages.length > 0) {
                    logger.info(`[UNREAD] 会话 "${conversation.userName}" 有 ${unreadMessages.length} 条未读消息 (总消息数: ${conversationMessages.length})`);
                }
            }

            // 🔍 打印第一个 topic 对象
            if (topics.length > beforeCount) {
                const sampleTopic = topics[beforeCount];
                logger.info(`[DEBUG] 第一个 topic 对象:`);
                logger.info(`  id: ${sampleTopic.id}`);
                logger.info(`  title: ${sampleTopic.title}`);
                logger.info(`  createdTime: ${sampleTopic.createdTime} (${new Date(sampleTopic.createdTime).toLocaleString('zh-CN')})`);
                logger.info(`  lastMessageTime: ${sampleTopic.lastMessageTime} (${new Date(sampleTopic.lastMessageTime).toLocaleString('zh-CN')})`);
            }

            logger.info(`[DEBUG] Created ${topics.length - beforeCount} topics from conversations`);
        } else {
            logger.warn(`[DEBUG] No conversations found or conversations is empty`);
        }

        // ✅ 问题2修复: 排序逻辑 - 优先显示有未读消息的会话，然后按最后消息时间排序
        topics.sort((a, b) => {
            // 1. 优先比较未读数（未读数多的在前）
            if (a.unreadCount !== b.unreadCount) {
                return b.unreadCount - a.unreadCount;
            }
            // 2. 未读数相同，按最后消息时间排序（新的在前）
            return b.lastMessageTime - a.lastMessageTime;
        });

        logger.info(`[DEBUG] Total topics created: ${topics.length}`);

        return topics;
    }

    /**
     * 从 DataStore 获取消息列表
     */
    getMessagesFromDataStore(topicId) {
        const messages = [];

        // ✅ 辅助函数: 归一化时间戳到毫秒级 (13位)
        const normalizeTimestamp = (timestamp) => {
            if (!timestamp) return Date.now();

            // 🔧 处理字符串类型的时间戳
            if (typeof timestamp === 'string') {
                // ✅ 优先尝试解析 ISO 8601 格式 (YYYY-MM-DDTHH:mm:ss.sssZ)
                if (timestamp.includes('T') || timestamp.includes('-')) {
                    const isoDate = new Date(timestamp);
                    if (!isNaN(isoDate.getTime())) {
                        return isoDate.getTime();  // 返回毫秒级时间戳
                    }
                }

                // 尝试解析中文日期字符串 "发布于2025年11月02日 09:00"
                const match = timestamp.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
                if (match) {
                    const [, year, month, day, hour, minute] = match;
                    const date = new Date(
                        parseInt(year),
                        parseInt(month) - 1,  // 月份从 0 开始
                        parseInt(day),
                        parseInt(hour),
                        parseInt(minute)
                    );
                    logger.debug(`[DEBUG] 解析中文日期字符串: ${timestamp} → ${date.getTime()}`);
                    return date.getTime();  // 返回毫秒级时间戳
                }

                // 如果是纯数字字符串，转换为数字
                const numericTimestamp = parseInt(timestamp);
                if (!isNaN(numericTimestamp)) {
                    timestamp = numericTimestamp;
                } else {
                    // 无法解析，返回当前时间
                    logger.warn(`[DEBUG] 无法解析时间戳字符串: ${timestamp}`);
                    return Date.now();
                }
            }

            // 处理数字类型的时间戳
            // 如果是秒级 (10位),转换为毫秒
            if (timestamp < 10000000000) {
                return timestamp * 1000;
            }
            // 如果已经是毫秒级 (13位),直接返回
            return timestamp;
        };

        // 遍历所有账户查找该主题的消息
        for (const [accountId, accountData] of this.dataStore.accounts) {
            // DataStore 数据结构是 {accountId, platform, lastUpdate, data}
            const dataObj = accountData.data || accountData;

            // 查找评论消息 (topicId = contentId，使用 camelCase)
            if (dataObj.comments) {
                const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : dataObj.comments;
                const comments = commentsList.filter(c => c.contentId === topicId);
                for (const comment of comments) {
                    // 如果是作者回复，fromId 设置为 'monitor_client'，fromName 设置为 '客服'
                    const isAuthorReply = comment.isAuthorReply || false;
                    // 处理 parentCommentId: "0" 表示顶级评论(没有父评论)
                    const parentId = comment.parentCommentId;
                    // 将 "0", 0, null, undefined, "" 都转换为 null
                    const replyToId = (!parentId || parentId === '0' || parentId === 0) ? null : parentId;

                    // DEBUG: 输出转换结果
                    if (comment.commentId === '7566864433692459826') {
                        logger.info(`[DEBUG] parentId="${parentId}", type=${typeof parentId}, replyToId=${replyToId}`);
                    }

                    messages.push({
                        id: comment.commentId,
                        channelId: accountId,
                        topicId: topicId,
                        fromName: isAuthorReply ? '客服' : (comment.authorName || '未知用户'),
                        fromId: isAuthorReply ? 'monitor_client' : (comment.authorId || ''),
                        authorAvatar: comment.authorAvatar || null,  // ✅ 新增: 评论人头像
                        content: comment.content || '',
                        type: 'comment',  // ✅ 修改: 评论消息类型为 'comment'
                        messageCategory: 'comment',  // ✅ 新增: 消息分类为 'comment'
                        timestamp: normalizeTimestamp(comment.createdAt),  // ✅ 修复: 归一化时间戳
                        serverTimestamp: normalizeTimestamp(comment.detectedAt),  // ✅ 修复: 归一化时间戳
                        replyToId: replyToId,  // ✅ 修复: "0" 转换为 null
                        replyToContent: null,
                        direction: isAuthorReply ? 'outgoing' : 'incoming',  // 作者回复为outgoing，其他为incoming
                        isAuthorReply: isAuthorReply,
                        isRead: comment.isRead || false  // ✅ 统一标准: 使用 isRead 字段
                    });
                }
            }

            // 查找私信消息 (topicId = conversationId，使用 camelCase)
            if (dataObj.messages) {
                const messagesList = dataObj.messages instanceof Map ? Array.from(dataObj.messages.values()) : dataObj.messages;

                // ✅ 构建 userId -> userAvatar 映射表（包含对方用户和账户自己）
                const userAvatarMap = new Map();

                // 1. 添加对方用户的头像（从 conversations）
                if (dataObj.conversations) {
                    const conversationsList = dataObj.conversations instanceof Map ? Array.from(dataObj.conversations.values()) : dataObj.conversations;
                    conversationsList.forEach(conv => {
                        if (conv.userId && (conv.platform_user_avatar || conv.userAvatar)) {
                            userAvatarMap.set(conv.userId, conv.platform_user_avatar || conv.userAvatar);
                        }
                    });
                }

                // 2. 添加账户自己的头像（从 accounts 表）
                if (this.accountDAO) {
                    try {
                        const accountInfo = this.accountDAO.findById(accountId);
                        if (accountInfo && accountInfo.avatar) {
                            userAvatarMap.set(accountId, accountInfo.avatar);
                            if (accountInfo.account_id) {
                                userAvatarMap.set(accountInfo.account_id, accountInfo.avatar);
                            }
                        }
                    } catch (error) {
                        logger.warn(`[IM WS] Failed to get account avatar for ${accountId}:`, error.message);
                    }
                }

                const msgs = messagesList.filter(m => m.conversationId === topicId);
                for (const msg of msgs) {
                    const isOutbound = msg.direction === 'outbound';

                    // ✅ 统一逻辑: 根据消息的 senderId 查找头像（无论是对方还是账户自己）
                    let authorAvatar = null;
                    if (msg.senderId) {
                        authorAvatar = userAvatarMap.get(msg.senderId) || msg.senderAvatar || null;
                    }

                    // 🔍 调试: 打印私信消息的头像逻辑
                    if (msgs.indexOf(msg) < 3) {  // 只打印前3条消息
                        logger.debug(`[IM-WS] Private message avatar debug (fixed logic):`, {
                            messageId: msg.messageId,
                            direction: msg.direction,
                            isOutbound,
                            senderId: msg.senderId,
                            userAvatarFromMap: userAvatarMap.get(msg.senderId),
                            msgSenderAvatar: msg.senderAvatar,
                            finalAuthorAvatar: authorAvatar,
                            senderName: msg.senderName
                        });
                    }

                    messages.push({
                        id: msg.messageId,
                        channelId: accountId,
                        topicId: topicId,
                        fromName: isOutbound ? '客服' : (msg.senderName || '未知用户'),
                        fromId: isOutbound ? 'monitor_client' : (msg.senderId || ''),
                        authorAvatar: authorAvatar,  // ✅ 修复: 根据 senderId 从 conversations 查找头像
                        content: msg.content || '',
                        type: msg.messageType || 'text',
                        messageCategory: 'private',  // ✅ 新增: 消息分类为 'private'
                        timestamp: normalizeTimestamp(msg.createdAt),  // ✅ 修复: 归一化时间戳
                        serverTimestamp: normalizeTimestamp(msg.detectedAt),  // ✅ 修复: 归一化时间戳
                        replyToId: null,
                        replyToContent: null,
                        direction: msg.direction || 'inbound',  // ✅ 消息方向：inbound(用户发的)/outbound(客服发的)
                        recipientId: msg.recipientId || '',
                        recipientName: msg.recipientName || '',
                        isRead: msg.isRead || false  // ✅ 统一标准: 使用 isRead 字段
                    });
                }
            }
        }

        // 按时间排序
        messages.sort((a, b) => a.timestamp - b.timestamp);

        return messages;
    }

    /**
     * 计算未读消息数（使用 camelCase 字段名）
     */
    calculateUnreadCount(dataObj) {
        let unreadCount = 0;

        // 处理 Map 或 Array
        const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : (dataObj.comments || []);
        const messagesList = dataObj.messages instanceof Map ? Array.from(dataObj.messages.values()) : (dataObj.messages || []);

        // ✅ 计算未读评论数：排除客服发送的消息和已读消息
        if (commentsList.length > 0) {
            unreadCount += commentsList.filter(c => {
                // 1. 如果是客服发送的，不计入未读
                if (c.direction === 'outbound') return false;
                // 2. 如果已标记为已读，不计入未读
                if (c.isRead) return false;
                // 3. 其他情况算作未读
                return true;
            }).length;
        }

        // ✅ 计算未读私信数：从消息列表中实时计算，排除客服发送的消息和已读消息
        if (messagesList.length > 0) {
            unreadCount += messagesList.filter(m => {
                // 1. 如果是客服发送的消息，不计入未读
                if (m.direction === 'outbound') return false;
                // 2. 如果已标记为已读，不计入未读
                if (m.isRead) return false;
                // 3. 其他情况算作未读
                return true;
            }).length;
        }

        return unreadCount;
    }

    /**
     * 查找最新消息（使用 camelCase 字段名）
     */
    findLastMessage(dataObj) {
        let lastMessage = null;
        let latestTime = 0;

        // 处理 Map 或 Array
        const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : (dataObj.comments || []);
        const messagesList = dataObj.messages instanceof Map ? Array.from(dataObj.messages.values()) : (dataObj.messages || []);

        // 辅助函数：统一时间戳为毫秒级 (13位)
        const normalizeTimestamp = (timestamp) => {
            if (!timestamp) return Date.now();

            // 🔧 处理字符串类型的时间戳
            if (typeof timestamp === 'string') {
                // ✅ 优先尝试解析 ISO 8601 格式 (YYYY-MM-DDTHH:mm:ss.sssZ)
                if (timestamp.includes('T') || timestamp.includes('-')) {
                    const isoDate = new Date(timestamp);
                    if (!isNaN(isoDate.getTime())) {
                        return isoDate.getTime();  // 返回毫秒级时间戳
                    }
                }

                // 尝试解析中文日期字符串 "发布于2025年11月02日 09:00"
                const match = timestamp.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
                if (match) {
                    const [, year, month, day, hour, minute] = match;
                    const date = new Date(
                        parseInt(year),
                        parseInt(month) - 1,  // 月份从 0 开始
                        parseInt(day),
                        parseInt(hour),
                        parseInt(minute)
                    );
                    logger.debug(`[DEBUG] 解析中文日期字符串: ${timestamp} → ${date.getTime()}`);
                    return date.getTime();  // 返回毫秒级时间戳
                }

                // 如果是纯数字字符串，转换为数字
                const numericTimestamp = parseInt(timestamp);
                if (!isNaN(numericTimestamp)) {
                    timestamp = numericTimestamp;
                } else {
                    // 无法解析，返回当前时间
                    logger.warn(`[DEBUG] 无法解析时间戳字符串: ${timestamp}`);
                    return Date.now();
                }
            }

            // 处理数字类型的时间戳
            // 如果是秒级 (10位)，转换为毫秒级
            if (timestamp < 10000000000) {
                return timestamp * 1000;
            }
            // 如果已经是毫秒级 (13位)，直接返回
            return timestamp;
        };

        // 检查评论（使用 camelCase: createdAt）
        if (commentsList.length > 0) {
            const latestComment = commentsList.reduce((latest, current) => {
                // ✅ 修复: 使用归一化后的时间戳进行比较
                const currentTime = normalizeTimestamp(current.createdAt);
                const latestTime = normalizeTimestamp(latest.createdAt);
                return (currentTime > latestTime) ? current : latest;
            });
            const normalizedTime = normalizeTimestamp(latestComment.createdAt);
            if (normalizedTime > latestTime) {
                latestTime = normalizedTime;
                lastMessage = {
                    content: latestComment.content,
                    timestamp: normalizedTime  // ✅ 使用标准化后的毫秒级时间戳
                };
            }
        }

        // 检查私信（使用 camelCase: createdAt）
        if (messagesList.length > 0) {
            const latestMsg = messagesList.reduce((latest, current) => {
                // ✅ 修复: 使用归一化后的时间戳进行比较
                const currentTime = normalizeTimestamp(current.createdAt);
                const latestTime = normalizeTimestamp(latest.createdAt);
                return (currentTime > latestTime) ? current : latest;
            });
            const normalizedTime = normalizeTimestamp(latestMsg.createdAt);
            if (normalizedTime > latestTime) {
                latestTime = normalizedTime;
                lastMessage = {
                    content: latestMsg.content,
                    timestamp: normalizedTime  // ✅ 使用标准化后的毫秒级时间戳
                };
            }
        }

        return lastMessage;
    }

    /**
     * 广播消息给所有监控客户端
     */
    broadcastToMonitors(event, data) {
        const monitorCount = this.monitorClients.size;
        const adminCount = this.adminClients.size;
        const totalClients = monitorCount + adminCount;

        logger.info(`[Broadcast] 📡 广播事件: ${event}, 客户端数: ${totalClients} (monitor: ${monitorCount}, admin: ${adminCount})`);

        if (totalClients === 0) {
            logger.warn(`[Broadcast] ⚠️ 没有连接的客户端，事件 ${event} 未能广播`);
            return;
        }

        // 发送给监控客户端
        this.monitorClients.forEach((socketId, clientId) => {
            this.io.to(socketId).emit(event, data);
            logger.debug(`[Broadcast] → 发送给 monitor 客户端 ${clientId} (socket: ${socketId})`);
        });

        // 发送给管理页面
        this.adminClients.forEach((socketId, clientId) => {
            this.io.to(socketId).emit(event, data);
            logger.debug(`[Broadcast] → 发送给 admin 客户端 ${clientId} (socket: ${socketId})`);
        });

        logger.info(`[Broadcast] ✅ 事件 ${event} 已广播给 ${totalClients} 个客户端`);
    }

    /**
     * 当 Worker 推送新数据到 DataStore 时调用
     * 通知所有连接的客户端
     */
    onDataStoreUpdate(accountId) {
        logger.info(`[IM WS] DataStore updated for account: ${accountId}`);

        // 通知客户端刷新频道列表
        const channels = this.getChannelsFromDataStore();
        this.broadcastToMonitors('monitor:channels', { channels });
    }

    /**
     * 当收到新消息时通知客户端
     */
    onNewMessage(accountId, message) {
        logger.info(`[IM WS] New message for account: ${accountId}`, {
            messageId: message.id || message.messageId,
            direction: message.direction,
            fromName: message.fromName,
            fromId: message.fromId
        });

        // 广播新消息
        this.broadcastToMonitors('channel:message', {
            ...message,
            channelId: accountId
        });
    }

    // ============================================================================
    // 已读状态处理方法
    // ============================================================================

    /**
     * 处理单条消息标记已读
     */
    handleMarkAsRead(socket, data) {
        try {
            const { type, id, channelId } = data;

            if (!type || !id) {
                socket.emit('error', { message: '缺少必要参数: type 和 id' });
                return;
            }

            if (!this.cacheDAO) {
                socket.emit('error', { message: '已读功能未启用（缺少 CacheDAO）' });
                return;
            }

            let success = false;
            const readAt = Math.floor(Date.now() / 1000);

            if (type === 'comment') {
                success = this.cacheDAO.markCommentAsRead(id, readAt);

                // ✅ 同步更新内存对象
                if (success && channelId) {
                    const accountData = this.dataStore.accounts.get(channelId);
                    if (accountData && accountData.data.comments.has(id)) {
                        const comment = accountData.data.comments.get(id);
                        comment.isRead = true;
                        logger.debug(`[IM WS] Memory object updated: comment/${id} isRead=true`);
                    }
                }
            } else if (type === 'message') {
                success = this.cacheDAO.markMessageAsRead(id, readAt);

                // ✅ 同步更新内存对象
                if (success && channelId) {
                    const accountData = this.dataStore.accounts.get(channelId);
                    if (accountData && accountData.data.messages.has(id)) {
                        const message = accountData.data.messages.get(id);
                        message.isRead = true;
                        logger.debug(`[IM WS] Memory object updated: message/${id} isRead=true`);
                    }
                }
            } else {
                socket.emit('error', { message: `不支持的消息类型: ${type}` });
                return;
            }

            if (success) {
                // 响应客户端
                socket.emit('monitor:mark_as_read_response', {
                    success: true,
                    id,
                    type,
                    read_at: readAt
                });

                // 广播给所有客户端
                this.broadcastToMonitors('monitor:message_read', {
                    type,
                    id,
                    channelId,
                    read_at: readAt
                });

                logger.info(`[IM WS] Message marked as read: ${type}/${id}`);
            } else {
                socket.emit('error', { message: '标记失败：消息不存在' });
            }

        } catch (error) {
            logger.error('[IM WS] Mark as read error:', error);
            socket.emit('error', { message: '标记已读失败' });
        }
    }

    /**
     * 处理批量标记已读
     */
    handleMarkBatchAsRead(socket, data) {
        try {
            const { type, ids, channelId } = data;

            if (!type || !ids || !Array.isArray(ids)) {
                socket.emit('error', { message: '缺少必要参数: type 和 ids 数组' });
                return;
            }

            if (!this.cacheDAO) {
                socket.emit('error', { message: '已读功能未启用（缺少 CacheDAO）' });
                return;
            }

            let count = 0;
            const readAt = Math.floor(Date.now() / 1000);

            if (type === 'comment') {
                count = this.cacheDAO.markCommentsAsRead(ids, readAt);

                // ✅ 同步更新内存对象
                if (count > 0 && channelId) {
                    const accountData = this.dataStore.accounts.get(channelId);
                    if (accountData) {
                        ids.forEach(id => {
                            if (accountData.data.comments.has(id)) {
                                const comment = accountData.data.comments.get(id);
                                comment.isRead = true;
                            }
                        });
                        logger.debug(`[IM WS] Memory objects updated: ${count} comments isRead=true`);
                    }
                }
            } else if (type === 'message') {
                count = this.cacheDAO.markMessagesAsRead(ids, readAt);

                // ✅ 同步更新内存对象
                if (count > 0 && channelId) {
                    const accountData = this.dataStore.accounts.get(channelId);
                    if (accountData) {
                        ids.forEach(id => {
                            if (accountData.data.messages.has(id)) {
                                const message = accountData.data.messages.get(id);
                                message.isRead = true;
                            }
                        });
                        logger.debug(`[IM WS] Memory objects updated: ${count} messages isRead=true`);
                    }
                }
            } else {
                socket.emit('error', { message: `不支持的消息类型: ${type}` });
                return;
            }

            // 响应客户端
            socket.emit('monitor:mark_batch_as_read_response', {
                success: true,
                count,
                type,
                read_at: readAt
            });

            // 广播给所有客户端
            this.broadcastToMonitors('monitor:messages_read', {
                type,
                ids,
                channelId,
                count,
                read_at: readAt
            });

            logger.info(`[IM WS] ${count} messages marked as read: ${type}`);

        } catch (error) {
            logger.error('[IM WS] Batch mark as read error:', error);
            socket.emit('error', { message: '批量标记已读失败' });
        }
    }

    /**
     * 处理按作品标记所有评论已读
     */
    handleMarkTopicAsRead(socket, data) {
        try {
            const { channelId, topicId } = data;

            if (!channelId || !topicId) {
                socket.emit('error', { message: '缺少必要参数: channelId 和 topicId' });
                return;
            }

            const readAt = Math.floor(Date.now() / 1000);
            let count = 0;

            // ✅ 直接更新 DataStore 内存中的评论（不依赖 CacheDAO）
            const accountData = this.dataStore.accounts.get(channelId);
            if (accountData) {
                // 遍历所有评论，找到属于该作品的未读评论并标记为已读
                for (const comment of accountData.data.comments.values()) {
                    if (comment.contentId === topicId && !comment.isRead) {
                        comment.isRead = true;
                        count++;
                    }
                }
                logger.info(`[IM WS] ✅ Marked ${count} comments in topic ${topicId} as read in memory`);
            } else {
                logger.warn(`[IM WS] ⚠️ No account data found for channelId: ${channelId}`);
            }

            // 响应客户端
            socket.emit('monitor:mark_topic_as_read_response', {
                success: true,
                count,
                topicId,
                channelId,
                read_at: readAt
            });

            // 广播给所有客户端
            this.broadcastToMonitors('monitor:topic_read', {
                topicId,
                channelId,
                count,
                read_at: readAt
            });

            // ✅ 重新推送更新后的 topics（包含新的未读数）
            const updatedTopics = this.getTopicsFromDataStore(channelId);
            logger.info(`[IM WS] 📊 重新计算 topics，准备广播`);
            this.broadcastToMonitors('monitor:topics', {
                channelId,
                topics: updatedTopics
            });

            // ✅ 同时推送更新后的 channels（更新左侧账户列表的最后消息）
            const updatedChannels = this.getChannelsFromDataStore();
            logger.info(`[IM WS] 📊 重新计算 channels，准备广播`);
            this.broadcastToMonitors('monitor:channels', {
                channels: updatedChannels
            });

            logger.info(`[IM WS] ${count} comments in topic ${topicId} marked as read`);

        } catch (error) {
            logger.error('[IM WS] Mark topic as read error:', error);
            socket.emit('error', { message: '按作品标记已读失败' });
        }
    }

    /**
     * 处理按会话标记所有私信已读
     */
    handleMarkConversationAsRead(socket, data) {
        try {
            const { channelId, conversationId } = data;

            if (!channelId || !conversationId) {
                socket.emit('error', { message: '缺少必要参数: channelId 和 conversationId' });
                return;
            }

            const readAt = Math.floor(Date.now() / 1000);
            let count = 0;

            // ✅ 直接更新 DataStore 内存中的消息（不依赖 CacheDAO）
            const accountData = this.dataStore.accounts.get(channelId);
            if (accountData) {
                // 遍历所有私信，找到属于该会话的未读消息并标记为已读
                for (const message of accountData.data.messages.values()) {
                    if (message.conversationId === conversationId && !message.isRead) {
                        message.isRead = true;
                        count++;
                    }
                }
                logger.info(`[IM WS] ✅ Marked ${count} messages in conversation ${conversationId} as read in memory`);
            } else {
                logger.warn(`[IM WS] ⚠️ No account data found for channelId: ${channelId}`);
            }

            // 响应客户端
            socket.emit('monitor:mark_conversation_as_read_response', {
                success: true,
                count,
                conversationId,
                channelId,
                read_at: readAt
            });

            // 广播给所有客户端
            this.broadcastToMonitors('monitor:conversation_read', {
                conversationId,
                channelId,
                count,
                read_at: readAt
            });

            // ✅ 重新推送更新后的 topics（包含新的未读数）
            const updatedTopics = this.getTopicsFromDataStore(channelId);
            logger.info(`[IM WS] 📊 重新计算 topics，准备广播`);
            this.broadcastToMonitors('monitor:topics', {
                channelId,
                topics: updatedTopics
            });

            // ✅ 同时推送更新后的 channels（更新左侧账户列表的最后消息）
            const updatedChannels = this.getChannelsFromDataStore();
            logger.info(`[IM WS] 📊 重新计算 channels，准备广播`);
            this.broadcastToMonitors('monitor:channels', {
                channels: updatedChannels
            });

            logger.info(`[IM WS] ${count} messages in conversation ${conversationId} marked as read`);

        } catch (error) {
            logger.error('[IM WS] Mark conversation as read error:', error);
            socket.emit('error', { message: '按会话标记已读失败' });
        }
    }

    /**
     * 处理获取未读计数
     */
    handleGetUnreadCount(socket, data) {
        try {
            const { channelId } = data || {};

            if (!this.cacheDAO) {
                socket.emit('error', { message: '未读计数功能未启用（缺少 CacheDAO）' });
                return;
            }

            let unreadCounts = {
                comments: 0,
                messages: 0,
                total: 0
            };

            if (channelId) {
                // 查询特定频道的未读数
                unreadCounts.comments = this.cacheDAO.countUnreadComments(channelId);
                unreadCounts.messages = this.cacheDAO.countUnreadMessages(channelId);
                unreadCounts.total = unreadCounts.comments + unreadCounts.messages;

                socket.emit('monitor:unread_count_response', {
                    success: true,
                    channelId,
                    unread: unreadCounts
                });
            } else {
                // 查询所有频道的未读数（按频道分组）
                const byChannel = {};

                const commentsByAccount = this.cacheDAO.countUnreadCommentsByAccount();
                for (const [accountId, count] of Object.entries(commentsByAccount)) {
                    if (!byChannel[accountId]) {
                        byChannel[accountId] = { comments: 0, messages: 0, total: 0 };
                    }
                    byChannel[accountId].comments = count;
                    byChannel[accountId].total += count;
                    unreadCounts.comments += count;
                }

                const messagesByAccount = this.cacheDAO.countUnreadMessagesByAccount();
                for (const [accountId, count] of Object.entries(messagesByAccount)) {
                    if (!byChannel[accountId]) {
                        byChannel[accountId] = { comments: 0, messages: 0, total: 0 };
                    }
                    byChannel[accountId].messages = count;
                    byChannel[accountId].total += count;
                    unreadCounts.messages += count;
                }

                unreadCounts.total = unreadCounts.comments + unreadCounts.messages;

                socket.emit('monitor:unread_count_response', {
                    success: true,
                    unread: unreadCounts,
                    byChannel
                });
            }

            logger.debug(`[IM WS] Unread count: ${unreadCounts.total} (comments: ${unreadCounts.comments}, messages: ${unreadCounts.messages})`);

        } catch (error) {
            logger.error('[IM WS] Get unread count error:', error);
            socket.emit('error', { message: '获取未读计数失败' });
        }
    }

    /**
     * 启动未读消息定期推送
     * @param {number} interval - 轮询间隔（毫秒），默认 5000ms
     */
    startUnreadNotificationPolling(interval = 5000) {
        // 如果已经有定时器在运行，先停止
        if (this.unreadPollingTimer) {
            clearInterval(this.unreadPollingTimer);
        }

        // 存储上一次的未读数，用于检测变化
        this.lastUnreadCounts = new Map(); // accountId -> { comments, messages, total }

        this.unreadPollingTimer = setInterval(() => {
            this.checkAndPushUnreadNotifications();
        }, interval);

        logger.info(`[IM WS] Unread notification polling started (interval: ${interval}ms)`);
    }

    /**
     * 停止未读消息定期推送
     */
    stopUnreadNotificationPolling() {
        if (this.unreadPollingTimer) {
            clearInterval(this.unreadPollingTimer);
            this.unreadPollingTimer = null;
            logger.info('[IM WS] Unread notification polling stopped');
        }
    }

    /**
     * 检测并推送未读消息通知
     */
    checkAndPushUnreadNotifications() {
        try {
            // 如果没有连接的客户端，跳过
            if (this.monitorClients.size === 0 && this.adminClients.size === 0) {
                return;
            }

            // 遍历所有账户，检测未读数变化
            const accounts = this.dataStore.accounts; // Map<accountId, AccountData>

            for (const [accountId, accountData] of accounts) {
                if (!accountData || !accountData.data) continue;

                // 计算当前未读数
                const currentUnread = {
                    comments: this.calculateUnreadComments(accountData.data),
                    messages: this.calculateUnreadMessages(accountData.data),
                    total: 0
                };
                currentUnread.total = currentUnread.comments + currentUnread.messages;

                // 获取上一次的未读数
                const lastUnread = this.lastUnreadCounts.get(accountId) || { comments: 0, messages: 0, total: 0 };

                // 检测是否有新的未读消息
                if (currentUnread.total > lastUnread.total) {
                    const newComments = currentUnread.comments - lastUnread.comments;
                    const newMessages = currentUnread.messages - lastUnread.messages;

                    logger.info(`[IM WS] New unread detected for ${accountId}: +${newComments} comments, +${newMessages} messages`);

                    // 广播未读数更新
                    this.broadcastToMonitors('monitor:unread_update', {
                        channelId: accountId,
                        unread: currentUnread,
                        delta: {
                            comments: newComments,
                            messages: newMessages,
                            total: currentUnread.total - lastUnread.total
                        }
                    });

                    // 更新缓存
                    this.lastUnreadCounts.set(accountId, currentUnread);
                } else if (currentUnread.total < lastUnread.total) {
                    // 未读数减少（用户标记已读）
                    logger.debug(`[IM WS] Unread decreased for ${accountId}: ${lastUnread.total} -> ${currentUnread.total}`);
                    this.lastUnreadCounts.set(accountId, currentUnread);
                }
            }
        } catch (error) {
            logger.error('[IM WS] Check unread notifications error:', error);
        }
    }

    /**
     * 计算未读评论数
     * ✅ 统一使用 isRead 字段并排除客服发送的消息
     */
    calculateUnreadComments(dataObj) {
        const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : (dataObj.comments || []);
        return commentsList.filter(c => {
            // 1. 如果是客服发送的，不计入未读
            if (c.direction === 'outbound') return false;
            // 2. 如果已标记为已读，不计入未读
            if (c.isRead) return false;
            // 3. 其他情况算作未读
            return true;
        }).length;
    }

    /**
     * 计算未读私信数
     * ✅ 从消息列表实时计算，排除客服发送的消息
     */
    calculateUnreadMessages(dataObj) {
        const messagesList = dataObj.messages instanceof Map ? Array.from(dataObj.messages.values()) : (dataObj.messages || []);
        return messagesList.filter(m => {
            // 1. 如果是客服发送的消息，不计入未读
            if (m.direction === 'outbound') return false;
            // 2. 如果已标记为已读，不计入未读
            if (m.isRead) return false;
            // 3. 其他情况算作未读
            return true;
        }).length;
    }

    /**
     * 广播指定主题的发送队列给所有监控客户端
     */
    broadcastSendingQueue(topicId) {
        const sendingMessages = this.sendingQueues.get(topicId) || [];
        this.broadcastToMonitors('monitor:sending_queue', {
            topicId,
            sendingMessages
        });
        logger.debug(`[IM WS] Broadcasting sending queue for topic ${topicId}, ${sendingMessages.length} messages`);
    }

    /**
     * 清理DataStore中已删除账户的数据
     * 检查DataStore中的所有账户，如果数据库中不存在，则从DataStore中删除
     */
    cleanupDeletedAccounts() {
        if (!this.accountDAO) {
            logger.warn('[IM WS] accountDAO not initialized, cannot cleanup deleted accounts');
            return;
        }

        let removedCount = 0;
        const accountsToRemove = [];

        // 检查DataStore中的所有账户
        for (const [accountId] of this.dataStore.accounts) {
            try {
                const accountInfo = this.accountDAO.findById(accountId);
                if (!accountInfo) {
                    // 数据库中不存在，标记为待删除
                    accountsToRemove.push(accountId);
                }
            } catch (error) {
                logger.warn(`[IM WS] Error checking account ${accountId}:`, error.message);
            }
        }

        // 从DataStore中删除
        accountsToRemove.forEach(accountId => {
            this.dataStore.accounts.delete(accountId);
            removedCount++;
            logger.info(`[IM WS] Removed deleted account from DataStore: ${accountId}`);
        });

        if (removedCount > 0) {
            logger.info(`[IM WS] Cleanup completed: removed ${removedCount} deleted accounts from DataStore`);

            // 通知客户端刷新频道列表
            const channels = this.getChannelsFromDataStore();
            this.broadcastToMonitors('monitor:channels', { channels });
        } else {
            logger.info('[IM WS] No deleted accounts found in DataStore');
        }

        return removedCount;
    }
}

module.exports = IMWebSocketServer;
