/**
 * 抖音私信回复模块
 *
 * 功能：处理抖音平台的私信回复
 * - 支持通过 conversation_id 定位会话
 * - 支持通过 platform_message_id 精确定位消息
 * - 使用 React Fiber 树提取消息 ID
 * - API 拦截器获取完整 ID 信息
 *
 * Phase 10: 增强 ID 处理 + API 拦截
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('douyin-send-dm-reply');

// ============================================================================
// Phase 11: 简化的辅助工具函数
// ============================================================================

// ============================================================================
// 消息定位函数
// ============================================================================

/**
 * 在完整数据源中查找会话的索引位置和用户名
 * 通过访问 React Fiber 树的更深层数据源(depth 22)获取所有会话数据
 *
 * @param {Page} page - Playwright 页面对象
 * @param {string} targetId - 目标 sec_uid
 * @returns {Promise<{index: number, userName: string}|null>} 会话索引和用户名,如果未找到返回 null
 */
async function findConversationIndexInDataSource(page, targetId) {
    if (!targetId) return null;

    try {
        logger.debug(`[滚动搜索] 在完整数据源中查找 sec_uid: ${targetId}`);

        const result = await page.evaluate((searchId) => {
            // 查找虚拟列表的 React Fiber 根节点
            const container = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
            if (!container) return { found: false, error: 'Container not found' };

            // 获取 Fiber 节点
            const fiberKey = Object.keys(container).find(key => key.startsWith('__reactFiber'));
            if (!fiberKey) return { found: false, error: 'Fiber key not found' };

            let fiber = container[fiberKey];

            // 向上遍历找到包含完整数据源的节点(通常在 depth 20-25)
            let dataSource = null;
            let depth = 0;

            while (fiber && depth < 30) {
                // 查找 memoizedProps 或 memoizedState 中的数据数组
                if (fiber.memoizedProps) {
                    // 查找可能包含会话列表的属性
                    const props = fiber.memoizedProps;

                    // 常见的数据源属性名
                    const possibleKeys = ['data', 'list', 'items', 'conversations', 'dataSource'];
                    for (const key of possibleKeys) {
                        if (Array.isArray(props[key]) && props[key].length > 0) {
                            // 检查第一个元素是否有 participants 或 sec_uid 相关字段
                            const firstItem = props[key][0];
                            if (firstItem && (
                                firstItem.firstPageParticipant ||
                                firstItem.participants ||
                                firstItem.id
                            )) {
                                dataSource = props[key];
                                break;
                            }
                        }
                    }
                }

                if (dataSource) break;
                fiber = fiber.return;
                depth++;
            }

            if (!dataSource) {
                return { found: false, error: 'Data source not found in Fiber tree' };
            }

            // 在数据源中搜索目标 sec_uid
            for (let i = 0; i < dataSource.length; i++) {
                const item = dataSource[i];

                // 提取 participants 中的 sec_uid 和用户名
                const participants = item.firstPageParticipant?.participants ||
                                   item.participants ||
                                   [];

                // 检查是否有匹配的 sec_uid
                for (const participant of participants) {
                    if (participant.sec_uid === searchId) {
                        // ✅ 同时提取用户名 (尝试多个字段)
                        const userName = participant.nick_name ||
                                       participant.nickname ||
                                       participant.name ||
                                       participant.display_name ||
                                       item.title ||
                                       '';

                        return {
                            found: true,
                            index: i,
                            userName: userName,
                            totalCount: dataSource.length,
                            itemId: item.id
                        };
                    }
                }
            }

            return {
                found: false,
                error: 'Target sec_uid not found in data source',
                totalCount: dataSource.length
            };

        }, targetId);

        if (result.found) {
            logger.info(`[滚动搜索] ✅ 在完整数据源中找到目标会话`, {
                targetId,
                index: result.index,
                userName: result.userName,
                totalCount: result.totalCount,
                itemId: result.itemId
            });
            return { index: result.index, userName: result.userName };
        } else {
            logger.warn(`[滚动搜索] ❌ 在完整数据源中未找到目标会话`, {
                targetId,
                error: result.error,
                totalCount: result.totalCount
            });
            return null;
        }

    } catch (error) {
        logger.error(`[滚动搜索] 查找数据源时出错: ${error.message}`);
        return null;
    }
}

/**
 * 滚动虚拟列表到指定索引位置 (Phase 11: 多容器验证 + 动态高度计算)
 *
 * @param {Page} page - Playwright 页面对象
 * @param {number} targetIndex - 目标索引
 * @param {number} itemHeight - 每个列表项的高度(可选，如果不提供则动态计算)
 * @returns {Promise<boolean>} 滚动是否成功
 */
async function scrollVirtualListToIndex(page, targetIndex, itemHeight = null) {
    try {
        logger.debug(`[智能滚动] 滚动到索引位置: ${targetIndex}`);

        const scrollResult = await page.evaluate(({ index, height }) => {
            // 查找所有可能的滚动容器
            const containers = document.querySelectorAll('.ReactVirtualized__Grid');

            if (containers.length === 0) {
                return { success: false, error: 'No container found' };
            }

            // 如果没有提供高度，动态计算
            let itemHeight = height;
            if (!itemHeight || itemHeight <= 0) {
                const items = document.querySelectorAll('.ReactVirtualized__Grid__innerScrollContainer > div');
                if (items.length > 0) {
                    const rect = items[0].getBoundingClientRect();
                    itemHeight = rect.height;
                } else {
                    itemHeight = 105;  // 备用默认值
                }
            }

            // 计算目标滚动位置 (向上偏移确保目标项在可视区域中间)
            const targetScrollTop = Math.max(0, index * itemHeight - 200);

            // 尝试滚动每个容器，找到能滚动的那个
            for (let i = 0; i < containers.length; i++) {
                const container = containers[i];
                const beforeScrollTop = container.scrollTop;

                // 尝试滚动
                container.scrollTop = targetScrollTop;

                // 验证是否真正滚动了 (误差 < 10px)
                const afterScrollTop = container.scrollTop;

                if (Math.abs(afterScrollTop - targetScrollTop) < 10) {
                    return {
                        success: true,
                        containerIndex: i,
                        totalContainers: containers.length,
                        beforeScrollTop,
                        afterScrollTop,
                        targetScrollTop
                    };
                }
            }

            return {
                success: false,
                error: 'All containers failed to scroll',
                totalContainers: containers.length
            };
        }, { index: targetIndex, height: itemHeight });

        if (!scrollResult.success) {
            logger.warn(`[智能滚动] ❌ 滚动失败: ${scrollResult.error} (找到 ${scrollResult.totalContainers} 个容器)`);
            return false;
        }

        logger.info(`[智能滚动] ✅ 滚动成功 (容器 ${scrollResult.containerIndex}/${scrollResult.totalContainers})`, {
            beforeScroll: `${scrollResult.beforeScrollTop}px`,
            afterScroll: `${scrollResult.afterScrollTop}px`,
            target: `${scrollResult.targetScrollTop}px`
        });

        // 等待虚拟列表重新渲染
        logger.debug(`[智能滚动] 等待虚拟列表重新渲染 (1500ms)...`);
        await page.waitForTimeout(1500);
        return true;

    } catch (error) {
        logger.error(`[智能滚动] 滚动时出错: ${error.message}`);
        return false;
    }
}

/**
 * 在虚拟列表中查找消息项 (Phase 11: 智能滚动 + DOM文本匹配)
 * 核心流程: 从 Fiber 数据源提取索引和用户名 -> 滚动 -> DOM文本匹配
 *
 * @param {Page} page - Playwright 页面对象
 * @param {string} targetSecUid - 目标 sec_uid
 * @returns {Promise<Locator>} 会话项的 Locator
 */
async function findMessageItemInVirtualList(page, targetSecUid) {
    logger.info(`[查找会话] sec_uid: ${targetSecUid}`);

    // 步骤1: 在 Fiber 数据源中查找目标索引和用户名
    const result = await findConversationIndexInDataSource(page, targetSecUid);
    if (result === null) {
        throw new Error(`未找到会话 (sec_uid: ${targetSecUid})`);
    }

    const { index: targetIndex, userName: targetUserName } = result;
    logger.info(`[查找会话] 找到索引: ${targetIndex}, 用户名: ${targetUserName || '(空)'}`);

    // 步骤2: 滚动到目标位置
    await scrollVirtualListToIndex(page, targetIndex);

    // 步骤3: 双路径策略 - 根据是否有用户名选择匹配方式
    let finalIndex = -1;
    let matchedUserName = '';

    if (targetUserName && targetUserName.trim()) {
        // 路径A: 用户名可用 - 使用 DOM 文本匹配
        logger.info(`[查找会话] 使用 DOM 文本匹配，用户名: "${targetUserName}"`);

        const domSearchResult = await page.evaluate((userName) => {
            const items = document.querySelectorAll('.ReactVirtualized__Grid__innerScrollContainer > div');
            const visibleItems = [];
            let targetIndex = -1;

            for (let i = 0; i < items.length; i++) {
                const text = items[i].textContent || '';
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const firstLine = lines[0] || '';
                const containsUserName = text.includes(userName);

                visibleItems.push({ index: i, firstLine, containsUserName });
                if (containsUserName && targetIndex === -1) {
                    targetIndex = i;
                }
            }

            return { targetIndex, visibleItems };
        }, targetUserName);

        logger.debug(`[查找会话] 可见会话 (${domSearchResult.visibleItems.length}个):`,
            domSearchResult.visibleItems.map(item =>
                `${item.containsUserName ? '🎯' : '  '} [${item.index}] ${item.firstLine}`
            ).join('\n')
        );

        if (domSearchResult.targetIndex === -1) {
            throw new Error(`DOM中未找到用户"${targetUserName}"的会话`);
        }

        finalIndex = domSearchResult.targetIndex;
        matchedUserName = domSearchResult.visibleItems[finalIndex].firstLine;
        logger.info(`[查找会话] ✅ DOM文本匹配: [${finalIndex}] ${matchedUserName}`);

    } else {
        // 路径B: 用户名为空 - 使用最后消息内容匹配（从原始result中获取）
        logger.info(`[查找会话] 用户名为空，使用最后消息内容匹配`);

        // 从原始result中获取最后消息内容
        const lastMessageText = await page.evaluate((searchId) => {
            const container = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
            if (!container) return null;

            const fiberKey = Object.keys(container).find(key => key.startsWith('__reactFiber'));
            if (!fiberKey) return null;

            let fiber = container[fiberKey];
            let dataSource = null;
            let depth = 0;

            while (fiber && depth < 30) {
                if (fiber.memoizedProps) {
                    const props = fiber.memoizedProps;
                    const possibleKeys = ['data', 'list', 'items', 'conversations', 'dataSource'];
                    for (const key of possibleKeys) {
                        if (Array.isArray(props[key]) && props[key].length > 0) {
                            const firstItem = props[key][0];
                            if (firstItem && (firstItem.firstPageParticipant || firstItem.participants || firstItem.id)) {
                                dataSource = props[key];
                                break;
                            }
                        }
                    }
                }
                if (dataSource) break;
                fiber = fiber.return;
                depth++;
            }

            if (!dataSource) return null;

            for (let i = 0; i < dataSource.length; i++) {
                const item = dataSource[i];
                const participants = item.firstPageParticipant?.participants || item.participants || [];
                for (const participant of participants) {
                    if (participant.sec_uid === searchId) {
                        return item.content?.text || '';
                    }
                }
            }
            return null;
        }, targetSecUid);

        logger.info(`[查找会话] 最后消息: "${lastMessageText}"`);

        // 在DOM中匹配最后消息内容
        const domSearchResult = await page.evaluate((msgText) => {
            const items = document.querySelectorAll('.ReactVirtualized__Grid__innerScrollContainer > div');
            const visibleItems = [];
            let targetIndex = -1;

            for (let i = 0; i < items.length; i++) {
                const text = items[i].textContent || '';
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const firstLine = lines[0] || '';

                // 匹配最后消息内容
                const containsMessage = msgText && text.includes(msgText);

                visibleItems.push({ index: i, firstLine, containsMessage });
                if (containsMessage && targetIndex === -1) {
                    targetIndex = i;
                }
            }

            return { targetIndex, visibleItems };
        }, lastMessageText);

        logger.debug(`[查找会话] 可见会话 (${domSearchResult.visibleItems.length}个):`,
            domSearchResult.visibleItems.map(item =>
                `${item.containsMessage ? '🎯' : '  '} [${item.index}] ${item.firstLine}`
            ).join('\n')
        );

        if (domSearchResult.targetIndex === -1) {
            throw new Error(`DOM中未找到包含消息"${lastMessageText}"的会话`);
        }

        finalIndex = domSearchResult.targetIndex;
        matchedUserName = domSearchResult.visibleItems[finalIndex].firstLine;
        logger.info(`[查找会话] ✅ 消息内容匹配: [${finalIndex}] ${matchedUserName}`);
    }

    // 步骤4: 从DOM中提取完整的用户名（用于后续验证）
    const extractedUserName = await page.evaluate((idx) => {
        const items = document.querySelectorAll('.ReactVirtualized__Grid__innerScrollContainer > div');
        if (idx < 0 || idx >= items.length) return null;

        const targetItem = items[idx];

        // 尝试从会话列表项中提取用户名
        const nameElement = targetItem.querySelector('[class*="item-header-name"]');
        if (nameElement) {
            const name = nameElement.textContent.trim();
            if (name && name.length >= 2 && name.length < 50) {
                return name;
            }
        }

        // 备选：从第一行文本提取
        const text = targetItem.textContent || '';
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) {
            const firstLine = lines[0];
            // 去掉日期和其他后缀
            const cleanName = firstLine.replace(/\d{2}-\d{2}.*$/, '').trim();
            if (cleanName.length >= 2 && cleanName.length < 50) {
                return cleanName;
            }
        }

        return null;
    }, finalIndex);

    logger.info(`[查找会话] 从DOM提取的用户名: "${extractedUserName}"`);

    // 步骤5: 使用 Playwright Locator API 返回点击目标和用户名
    const items = await page.locator('.ReactVirtualized__Grid__innerScrollContainer > div').all();
    return { locator: items[finalIndex], userName: extractedUserName };
}


// ============================================================================
// API 拦截器
// ============================================================================

/**
 * 设置私信 API 拦截器以获取完整 ID 信息 (Phase 10)
 *
 * @param {Page} page - Playwright 页面对象
 * @param {Object} apiResponses - API 响应缓存对象
 */
async function setupDMAPIInterceptors(page, apiResponses) {
    const requestCache = {
        conversations: new Set(),
        history: new Set()
    };

    const interceptAPI = async (route, apiType, cacheSet) => {
        const request = route.request();
        const method = request.method();
        const url = request.url();

        try {
            const response = await route.fetch();
            let body;

            const contentType = response.headers()['content-type'] || '';

            if (contentType.includes('application/json') || contentType.includes('json')) {
                body = await response.json();
            } else {
                try {
                    const text = await response.text();
                    body = JSON.parse(text);
                } catch (parseError) {
                    logger.debug(`[${apiType}] Response is not JSON, skipping interception`);
                    await route.fulfill({ response });
                    return;
                }
            }

            // 验证响应
            if (!body || typeof body !== 'object') {
                await route.fulfill({ response });
                return;
            }

            // 生成请求签名用于去重 (使用简单的哈希替代)
            const bodyStr = JSON.stringify(body);
            const simpleHash = bodyStr.length + '_' + bodyStr.substring(0, 50);
            const signature = JSON.stringify({ method, url, dataHash: simpleHash });

            if (cacheSet.has(signature)) {
                logger.debug(`[${apiType}] Duplicate request detected`);
            } else {
                cacheSet.add(signature);
                apiResponses[apiType].push(body);
                logger.debug(`[${apiType}] Intercepted response`);
            }

            await route.fulfill({ response });

        } catch (error) {
            logger.debug(`[${apiType}] Interception error: ${error.message}`);
            try {
                await route.continue();
            } catch (continueError) {
                logger.debug(`[${apiType}] Failed to continue request`);
                await route.abort('failed');
            }
        }
    };

    // 配置 DM 相关 API 端点
    const apiConfigs = [
        {
            pattern: '**/v1/stranger/get_conversation_list**',
            type: 'conversations',
            description: '会话列表 API'
        },
        {
            pattern: '**/v1/im/message/history**',
            type: 'history',
            description: '消息历史 API'
        }
    ];

    for (const config of apiConfigs) {
        try {
            await page.route(config.pattern, async (route) => {
                await interceptAPI(route, config.type, requestCache[config.type] || new Set());
            });
            logger.debug(`[DM API] Registered interceptor for: ${config.description}`);
        } catch (error) {
            logger.warn(`[DM API] Failed to register interceptor: ${error.message}`);
        }
    }

    logger.debug(`✅ DM API interceptors configured`);
}

// ============================================================================
// 主入口函数
// ============================================================================

/**
 * 发送私信回复
 *
 * @param {Page} page - Playwright 页面对象
 * @param {Object} options - 回复选项
 * @param {string} options.accountId - 账户 ID
 * @param {string} options.target_id - 向后兼容的目标 ID
 * @param {string} options.conversation_id - 会话 ID (Phase 9 新增，优先使用)
 * @param {string} options.platform_message_id - 平台消息 ID (Phase 9 新增，可选)
 * @param {string} options.reply_content - 回复内容
 * @param {Object} options.context - 上下文信息
 * @param {Function} options.takeScreenshot - 截图函数 (可选)
 * @returns {Promise<{success: boolean, platform_reply_id?: string, data?: Object, reason?: string}>}
 */
async function sendReplyToDirectMessage(page, options) {
    const {
        accountId,
        target_id,
        conversation_id,
        platform_message_id,
        reply_content,
        context = {},
        takeScreenshot = null
    } = options;

    const apiResponses = { conversationMessages: [] };

    try {
        logger.info(`[私信回复] 开始`, {
            accountId,
            target_id,
            conversation_id,
            reply_content: reply_content.substring(0, 30)
        });

        page.setDefaultTimeout(30000);
        await setupDMAPIInterceptors(page, apiResponses);

        // 2. 导航到私信页面
        const dmUrl = 'https://creator.douyin.com/creator-micro/data/following/chat';
        try {
            await page.goto(dmUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(2000);
        } catch (navError) {
            throw new Error(`导航失败: ${navError.message}`);
        }

        // 3. Phase 11: 智能滚动 + DOM文本匹配定位会话
        // 🔒 Phase 12优化：从DOM提取用户名用于验证
        const findResult = await findMessageItemInVirtualList(page, target_id);
        const targetMessageItem = findResult.locator;
        const expectedUserName = findResult.userName;  // 从DOM中提取的用户名

        logger.info(`[私信回复] 期望用户名（从DOM提取）: "${expectedUserName}"`);

        // 4. 点击会话项打开对话
        await targetMessageItem.click();
        await page.waitForTimeout(1500);

        // 🔒 Phase 12: 验证当前打开的会话是否正确 (防止发送给错误的人)
        const currentUserName = await page.evaluate(() => {
            // 尝试多种选择器提取对话窗口顶部的用户名（右侧区域，不是左侧会话列表）
            const selectors = [
                '[class*="box-header-name"]',  // 对话窗口顶部用户名 ⭐ 主要选择器
                '.box-header-name',
                '[class*="conversation-header"] [class*="title"]',
                '[class*="chat-header"] [class*="name"]',
                'header [class*="name"]'
            ];

            // 策略1：使用选择器查找，并确保在右侧区域（x > 400）
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const rect = element.getBoundingClientRect();
                    // 确保在右侧区域（排除左侧会话列表）且在顶部
                    if (rect.x > 400 && rect.y < 200) {
                        const text = element.textContent.trim();
                        if (text && text.length >= 2 && text.length < 50) {
                            return text;
                        }
                    }
                }
            }

            // 策略2：查找右侧header区域的第一行文本
            const rightHeaders = document.querySelectorAll('header, [role="banner"]');
            for (const header of rightHeaders) {
                const rect = header.getBoundingClientRect();
                if (rect.x > 400 && rect.y < 200) {
                    const text = header.textContent.trim();
                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    if (lines.length > 0) {
                        const firstLine = lines[0];
                        if (firstLine.length >= 2 && firstLine.length < 50) {
                            return firstLine;
                        }
                    }
                }
            }

            return null;
        });

        logger.info(`[私信回复] 当前会话用户名: "${currentUserName}"`);

        // ✅ 严格验证：当前用户名必须与期望用户名匹配
        if (!currentUserName) {
            throw new Error('无法获取当前会话的用户名，可能页面结构已变化');
        }

        if (!expectedUserName) {
            // 如果无法从DOM提取期望用户名，则无法进行安全验证
            logger.warn(`[私信回复] ⚠️  无法从DOM提取用户名，跳过验证（存在误发风险！）`);
            logger.warn(`[私信回复] 当前打开的会话: "${currentUserName}"`);
        } else if (currentUserName !== expectedUserName) {
            // 用户名不匹配，拒绝发送
            logger.error(`[私信回复] ❌ 会话用户名不匹配！`, {
                expected: expectedUserName,
                actual: currentUserName
            });
            throw new Error(`会话用户名不匹配：期望"${expectedUserName}"，实际"${currentUserName}"，拒绝发送以防止误发`);
        } else {
            // 验证通过
            logger.info(`[私信回复] ✅ 会话验证通过: "${currentUserName}"`);
        }

        // 5. 定位输入框
        const dmInput = await page.$('div[contenteditable="true"]');
        if (!dmInput) {
            throw new Error('输入框未找到');
        }

        // 6. 输入回复内容
        await dmInput.click();
        await page.waitForTimeout(500);
        await dmInput.evaluate(el => el.textContent = '');
        await dmInput.fill(reply_content);
        await dmInput.evaluate(el => {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForTimeout(800);

        // 7. 点击发送按钮
        const sendBtn = await page.locator('button').filter({ hasText: '发送' }).first();
        if (await sendBtn.isVisible({ timeout: 3000 })) {
            await sendBtn.click();
        } else {
            // 备选: 按 Enter 键
            await dmInput.press('Enter');
        }

        // 8. 等待发送完成
        try {
            await page.waitForLoadState('networkidle', { timeout: 10000 });
        } catch {
            await page.waitForTimeout(2000);
        }

        // 9. 检查错误提示
        const dmReplyStatus = await page.evaluate(() => {
            const errorSelectors = ['[class*="error"]', '[class*="alert"]', '[role="alert"]'];
            for (const selector of errorSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const text = el.textContent.trim();
                    if (text && (text.includes('无法') || text.includes('失败') || text.includes('限制'))) {
                        return { hasError: true, errorMessage: text };
                    }
                }
            }
            return { hasError: false };
        });

        if (dmReplyStatus.hasError) {
            logger.warn(`[私信回复] 被阻止: ${dmReplyStatus.errorMessage}`);
            if (takeScreenshot) {
                await takeScreenshot(accountId, `dm_reply_blocked_${Date.now()}.png`);
            }
            return {
                success: false,
                status: 'blocked',
                reason: dmReplyStatus.errorMessage,
                data: {
                    message_id: target_id,
                    reply_content,
                    error_message: dmReplyStatus.errorMessage,
                    timestamp: new Date().toISOString()
                }
            };
        }

        // 10. 返回成功
        logger.info(`[私信回复] ✅ 成功`);
        return {
            success: true,
            platform_reply_id: `dm_${target_id}_${Date.now()}`,
            data: {
                message_id: target_id,
                reply_content,
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        logger.error(`[私信回复] ❌ 失败: ${error.message}`);
        if (takeScreenshot) {
            await takeScreenshot(accountId, `dm_reply_error_${Date.now()}.png`);
        }
        return {
            success: false,
            status: 'error',
            reason: error.message,
            data: {
                message_id: target_id,
                reply_content,
                error_message: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
    sendReplyToDirectMessage,
    // Phase 11: 导出智能滚动相关函数 (供测试使用)
    findMessageItemInVirtualList,
    findConversationIndexInDataSource,
    scrollVirtualListToIndex,
    // API 拦截器
    setupDMAPIInterceptors
};
