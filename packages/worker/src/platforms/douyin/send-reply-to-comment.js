/**
 * 抖音评论回复模块
 *
 * 两种回复模式（完全分离）：
 * 1. replyToWork - 给作品发一级评论
 * 2. replyToComment - 回复某条评论（二级回复）
 *
 * 参考 tests/replyToCommentById.js 的成功逻辑
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('douyin-send-reply');

// 全局 API 拦截器数据存储
const apiData = {
    replyResults: []
};

/**
 * API 拦截器：捕获评论回复的 API 响应
 */
async function onCommentReplyAPI(body, response) {
    const url = response.url();

    // 🔍 调试：记录所有匹配的 URL
    logger.info(`🔍 [API拦截器] 捕获到评论回复相关请求: ${url}`);

    // 排除列表接口（reply/list 是查询回复列表的接口，不是发送回复的接口）
    if (url.includes('/comment/reply/list')) {
        logger.debug(`[API拦截器] 排除列表接口: ${url}`);
        return;
    }

    // 检查响应结构
    if (!body || body.status_code === undefined) {
        logger.warn(`⚠️  [API] 评论回复响应无效，body keys: ${body ? Object.keys(body).join(', ') : 'null'}`);
        return;
    }

    const statusCode = body.status_code;
    const statusMsg = body.status_msg || '';
    const commentInfo = body.comment_info;

    if (statusCode === 0 && commentInfo) {
        // 成功
        logger.info(`✅ [API] 评论回复成功: comment_id=${commentInfo.comment_id}`);

        apiData.replyResults.push({
            timestamp: Date.now(),
            url,
            success: true,
            statusCode,
            statusMsg,
            commentId: commentInfo.comment_id,
            data: body
        });
    } else if (statusCode !== 0) {
        // 失败
        logger.warn(`❌ [API] 评论回复失败: ${statusMsg} (status_code=${statusCode})`);

        apiData.replyResults.push({
            timestamp: Date.now(),
            url,
            success: false,
            statusCode,
            statusMsg,
            errorMsg: statusMsg || '未知错误',
            data: body
        });
    }
}

/**
 * 主入口：评论回复
 * @param {Page} page - Playwright页面对象
 * @param {Object} options - 选项对象
 * @param {string} options.accountId - 账户ID
 * @param {string} options.videoTitle - 视频标题
 * @param {string} options.replyContent - 回复内容
 * @param {string} options.commentId - 评论ID（可选，如果提供则回复该评论，否则回复作品）
 * @param {string} options.commentContent - 评论内容（用于匹配，当ID匹配失败时使用）
 * @param {string} options.authorName - 评论作者昵称（用于匹配，当ID匹配失败时使用）
 * @param {number} options.level - 评论层级（1=一级评论，2=二级评论，默认1）
 * @param {string} options.parentCommentId - 父评论ID（当回复二级评论时需要）
 * @param {string} options.parentAuthorName - 父评论作者昵称（用于定位父评论）
 * @param {string} options.parentCommentContent - 父评论内容（用于定位父评论）
 * @param {string} options.replyToUsername - 被回复用户昵称（通知API提供，可用于定位父评论）
 * @param {string} options.replyToUserid - 被回复用户ID
 */
async function sendReplyToComment(page, options) {
    const {
        accountId,
        videoTitle,
        replyContent,
        commentId = null,
        commentContent = null,
        authorName = null,
        level = 1,  // ⭐ 评论层级，默认一级评论
        parentCommentId = null,  // ⭐ 父评论ID（二级评论时需要）
        parentAuthorName = null,  // ⭐ 父评论作者昵称
        parentCommentContent = null,  // ⭐ 父评论内容
        replyToUsername = null,  // ⭐ 被回复用户昵称（通知API提供，可用于定位父评论）
        replyToUserid = null,  // ⭐ 被回复用户ID
    } = options;

    logger.info('[Douyin] 开始评论回复', {
        accountId,
        commentId: commentId || 'work',
        videoTitle: videoTitle?.substring(0, 50),
        contentLength: replyContent.length,
        level,  // ⭐ 评论层级
        parentCommentId: parentCommentId || '无',  // ⭐ 父评论ID
        replyToUsername: replyToUsername || '无',  // ⭐ 被回复用户昵称
    });

    try {
        // 清空之前的 API 数据
        apiData.replyResults = [];

        // 设置超时
        page.setDefaultTimeout(30000);

        // 1. 导航到评论管理页面
        logger.info('📍 [步骤1] 开始导航到评论管理页面...');
        await navigateToCommentPage(page);
        logger.info('📍 [步骤1] ✅ 导航完成');

        // 2. 选择视频（如果提供了标题）
        if (videoTitle) {
            logger.info('📍 [步骤2] 开始选择视频...');
            await selectVideoByTitle(page, videoTitle);
            logger.info('📍 [步骤2] ✅ 视频选择完成');
        } else {
            logger.info('📍 [步骤2] 跳过视频选择（未提供标题）');
        }

        // 3. 根据是否有 commentId 分别处理（完全分离两种场景）
        if (commentId || (commentContent && authorName)) {
            // 场景A：回复某条评论
            // ⭐ 支持两种匹配方式：
            // 1. commentId 匹配（数字或加密格式）
            // 2. commentContent + authorName 匹配（当ID匹配失败时使用）
            logger.info(`📍 [步骤3] 开始回复评论...`, {
                commentId: commentId || '无',
                commentContent: commentContent ? commentContent.substring(0, 30) + '...' : '无',
                authorName: authorName || '无',
                level,
                parentCommentId: parentCommentId || '无',
            });

            // ⭐ 如果是二级评论（level === 2），需要先展开父评论的回复列表
            if (level === 2) {
                // 确定用于定位父评论的信息
                // 优先级：parentAuthorName > replyToUsername（通知API提供的被回复用户）
                const effectiveParentAuthor = parentAuthorName || replyToUsername;

                if (parentCommentId || effectiveParentAuthor || parentCommentContent) {
                    logger.info('📍 [步骤3a] 目标是二级评论，先展开父评论的回复列表...', {
                        parentCommentId: parentCommentId || '无',
                        effectiveParentAuthor: effectiveParentAuthor || '无',
                        parentCommentContent: parentCommentContent ? parentCommentContent.substring(0, 20) + '...' : '无',
                    });
                    await expandParentCommentReplies(page, {
                        parentCommentId,
                        parentAuthorName: effectiveParentAuthor,  // 使用有效的父评论作者
                        parentCommentContent,
                    });
                    logger.info('📍 [步骤3a] ✅ 父评论回复列表已展开');
                } else {
                    // 没有任何父评论信息，使用暴力展开策略
                    logger.info('📍 [步骤3a] 目标是二级评论但无父评论信息，使用暴力展开策略...');
                    await expandAllCommentReplies(page);
                    logger.info('📍 [步骤3a] ✅ 暴力展开完成');
                }
            }

            // ⭐ 传递 secUid 用于精确匹配（防止同名用户）
            const secUid = options.secUid || options.sec_uid || null;
            await replyToComment(page, commentId, replyContent, { commentContent, authorName, secUid });
            logger.info('📍 [步骤3] ✅ 评论回复完成');
        } else {
            // 场景B：给作品发一级评论
            logger.info('📍 [步骤3] 开始给作品发评论...');
            await replyToWork(page, replyContent);
            logger.info('📍 [步骤3] ✅ 作品评论完成');
        }

        logger.info('✅ 评论回复成功', { accountId, commentId: commentId || 'work' });

        return {
            success: true,
            data: {
                commentId,
                replyContent,
                replyType: commentId ? '评论回复' : '作品评论',
                timestamp: new Date().toISOString(),
                apiResult: apiData.replyResults.length > 0 ? apiData.replyResults[0] : null
            }
        };

    } catch (error) {
        logger.error('评论回复失败', {
            accountId,
            commentId: commentId || 'work',
            error: error.message,
            stack: error.stack
        });

        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================================================
// 辅助函数：展开父评论的回复列表（用于回复二级评论）
// ============================================================================

/**
 * ⭐ 展开父评论的回复列表
 * 当目标是二级评论时，需要先找到父评论并点击"查看X条回复"
 * @param {Page} page - Playwright页面对象
 * @param {Object} options - 选项
 * @param {string} options.parentCommentId - 父评论ID
 * @param {string} options.parentAuthorName - 父评论作者昵称
 * @param {string} options.parentCommentContent - 父评论内容
 */
async function expandParentCommentReplies(page, options) {
    const { parentCommentId, parentAuthorName, parentCommentContent } = options;

    logger.info('🔍 [展开回复] 开始查找父评论...', {
        parentCommentId: parentCommentId || '无',
        parentAuthorName: parentAuthorName || '无',
        parentCommentContent: parentCommentContent ? parentCommentContent.substring(0, 30) + '...' : '无',
    });

    // 1. 先找到父评论容器（使用多种查找策略）
    let parentContainer = null;

    // 策略1: 内容+昵称匹配（最精确）
    if (parentCommentContent && parentAuthorName) {
        logger.info('🔍 [展开回复] 尝试策略1: 内容+昵称匹配...');
        parentContainer = await findCommentContainerByContentAndAuthor(page, parentCommentContent, parentAuthorName);
    }

    // 策略2: 仅作者昵称匹配（当只有 replyToUsername 时使用）
    if (!parentContainer && parentAuthorName && !parentCommentContent) {
        logger.info('🔍 [展开回复] 尝试策略2: 仅作者昵称匹配...');
        parentContainer = await findCommentContainerByAuthorName(page, parentAuthorName);
    }

    // 策略3: ID匹配（数字ID或加密ID）
    if (!parentContainer && parentCommentId) {
        logger.info('🔍 [展开回复] 尝试策略3: ID匹配...');
        parentContainer = await findCommentContainerByDataAttrs(page, parentCommentId);
        if (!parentContainer) {
            parentContainer = await findCommentContainerByReactFiber(page, parentCommentId);
        }
    }

    if (!parentContainer) {
        logger.warn('⚠️ [展开回复] 未找到父评论，尝试直接查找目标评论...');
        return;  // 不抛错，让后续逻辑尝试直接查找
    }

    logger.info('✅ [展开回复] 找到父评论容器');

    // 2. 在父评论容器内查找"查看X条回复"按钮并点击
    try {
        // 滚动父评论到可见区域
        await parentContainer.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);

        // ⭐ 根据MCP验证结果，按钮文字格式为 "查看X条回复"
        // 使用文本匹配而不是class选择器
        const clicked = await page.evaluate((container) => {
            // 在父评论容器内查找所有可点击元素
            const allElements = container.querySelectorAll('div, span, a, button');

            for (const el of allElements) {
                const text = (el.textContent || '').trim();
                // 匹配 "查看X条回复" 格式
                if (text.match(/^查看\d+条回复$/)) {
                    el.click();
                    return { success: true, text };
                }
            }

            return { success: false };
        }, parentContainer);

        if (clicked.success) {
            logger.info(`✅ [展开回复] 找到并点击了展开按钮: "${clicked.text}"`);
            // 等待回复列表加载
            await page.waitForTimeout(2000);
        } else {
            // 尝试在整个页面中查找与父评论相关的展开按钮
            const pageClicked = await page.evaluate((containerText) => {
                // 查找所有包含"查看X条回复"文字的元素
                const allElements = document.querySelectorAll('div, span, a, button');

                for (const el of allElements) {
                    const text = (el.textContent || '').trim();
                    if (text.match(/^查看\d+条回复$/)) {
                        // 检查按钮是否在父评论附近
                        const parent = el.closest('[class*="content-"], [class*="comment"], [class*="item"]');
                        if (parent && containerText && parent.textContent?.includes(containerText.substring(0, 20))) {
                            el.click();
                            return { success: true, text };
                        }
                    }
                }

                // 如果没找到精确匹配，点击第一个展开按钮
                for (const el of allElements) {
                    const text = (el.textContent || '').trim();
                    if (text.match(/^查看\d+条回复$/)) {
                        el.click();
                        return { success: true, text, fallback: true };
                    }
                }

                return { success: false };
            }, parentCommentContent || parentAuthorName);

            if (pageClicked.success) {
                if (pageClicked.fallback) {
                    logger.info(`✅ [展开回复] 通过页面搜索找到展开按钮(fallback): "${pageClicked.text}"`);
                } else {
                    logger.info(`✅ [展开回复] 通过页面搜索找到展开按钮: "${pageClicked.text}"`);
                }
                await page.waitForTimeout(2000);
            } else {
                logger.warn('⚠️ [展开回复] 未找到"查看X条回复"按钮，回复列表可能已展开或不存在');
            }
        }
    } catch (error) {
        logger.warn(`⚠️ [展开回复] 展开回复列表时出错: ${error.message}`);
        // 不抛错，继续尝试查找目标评论
    }
}

/**
 * ⭐ 暴力展开所有"查看X条回复"按钮
 * 当二级评论没有父评论信息时，无法精确定位父评论
 * 此时需要展开所有回复列表，然后用"内容+作者"匹配目标评论
 * @param {Page} page - Playwright页面对象
 */
async function expandAllCommentReplies(page) {
    logger.info('🔄 [暴力展开] 开始展开所有"查看X条回复"按钮...');

    let expandedCount = 0;
    const MAX_EXPAND_ATTEMPTS = 20;  // 最多展开20个回复列表

    for (let attempt = 0; attempt < MAX_EXPAND_ATTEMPTS; attempt++) {
        // 查找所有未展开的"查看X条回复"按钮
        const result = await page.evaluate(() => {
            const allElements = document.querySelectorAll('div, span');
            for (const el of allElements) {
                const text = (el.textContent || '').trim();
                // 匹配 "查看X条回复" 格式（未展开状态）
                // 已展开的会变成"收起"
                if (text.match(/^查看\d+条回复$/)) {
                    el.click();
                    return { found: true, text };
                }
            }
            return { found: false };
        });

        if (result.found) {
            expandedCount++;
            logger.info(`✅ [暴力展开] 展开了: "${result.text}" (第${expandedCount}个)`);
            // 等待回复列表加载
            await page.waitForTimeout(1500);
        } else {
            // 没有更多可展开的了
            break;
        }
    }

    if (expandedCount > 0) {
        logger.info(`✅ [暴力展开] 完成，共展开 ${expandedCount} 个回复列表`);
    } else {
        logger.info('ℹ️ [暴力展开] 没有找到可展开的回复列表');
    }

    return expandedCount;
}

// ============================================================================
// 场景A：回复某条评论（二级回复）
// 参考 tests/replyToCommentById.js 的 commentId 分支
// ============================================================================

/**
 * 回复某条评论（二级回复）
 * 参考测试脚本逻辑：找到容器 → 点击回复按钮 → 在容器内输入并发送
 * @param {Page} page - Playwright页面对象
 * @param {string} commentId - 评论ID（可为null，此时使用内容+昵称匹配）
 * @param {string} text - 回复内容
 * @param {Object} matchOptions - 匹配选项
 * @param {string} matchOptions.commentContent - 评论内容（用于匹配）
 * @param {string} matchOptions.authorName - 评论作者昵称（用于匹配）
 * @param {string} matchOptions.secUid - 评论作者sec_uid（用于精确匹配，防止同名）
 */
async function replyToComment(page, commentId, text, matchOptions = {}) {
    const { commentContent, authorName, secUid } = matchOptions;
    logger.info(`[回复评论] 开始回复评论`, {
        commentId: commentId || '无',
        commentContent: commentContent ? commentContent.substring(0, 30) : '无',
        authorName: authorName || '无',
        secUid: secUid || '无'  // ⭐ sec_uid 用于精确匹配
    });

    // ⭐ 等待评论列表加载（等待评论元素出现）
    logger.info('🔍 [二级回复-1] 等待评论列表加载...');

    // 先尝试等待评论元素出现（最多等5秒）
    try {
        await page.waitForSelector(
            '.comment-content-text-JvmAKq, .content-JvmAKq, [class*="comment-content"], [class*="CommentItem"]',
            { timeout: 5000, state: 'visible' }
        );
        logger.info('🔍 [二级回复-1] ✅ 检测到评论元素');
    } catch (e) {
        logger.warn('🔍 [二级回复-1] ⚠️ 未检测到评论元素，继续尝试...');
    }

    // 额外等待确保评论数据加载完成
    await page.waitForTimeout(1500);
    logger.info('🔍 [二级回复-1] ✅ 评论列表等待完成');

    // 1. 找到评论容器（带滚动加载）
    // ⭐ 支持两种匹配方式：ID匹配 或 内容+昵称匹配
    logger.info(`🔍 [二级回复-2] 开始查找评论容器...`, {
        commentId: commentId || '无',
        commentContent: commentContent ? commentContent.substring(0, 30) : '无',
        authorName: authorName || '无',
        secUid: secUid || '无'
    });
    const container = await findCommentWithScroll(page, commentId, { commentContent, authorName, secUid });

    if (!container) {
        const matchInfo = commentId || `内容="${commentContent?.substring(0, 20)}..." 作者="${authorName}"`;
        logger.error(`❌ [二级回复-2] 未找到评论容器: ${matchInfo}`);
        throw new Error(`未找到评论: ${matchInfo}`);
    }

    logger.info(`🔍 [二级回复-2] ✅ 找到评论容器`);

    // 2. 点击容器内的回复按钮
    logger.info('🔍 [二级回复-3] 开始点击回复按钮...');
    const clicked = await clickReplyInContainer(page, container);
    if (!clicked) {
        logger.error('❌ [二级回复-3] 点击回复按钮失败');
        throw new Error('点击回复按钮失败');
    }

    logger.info('🔍 [二级回复-3] ✅ 回复按钮已点击');

    // 3. 等待输入框出现
    logger.info('🔍 [二级回复-4] 等待输入框出现...');
    await page.waitForTimeout(800);
    logger.info('🔍 [二级回复-4] ✅ 输入框等待完成');

    // 4. 在容器内输入并发送
    logger.info(`🔍 [二级回复-5] 开始输入并发送: "${text.substring(0, 20)}..."`);
    await typeAndSendInContainer(page, container, text);

    logger.info('🔍 [二级回复-5] ✅ 评论回复发送成功');
}

/**
 * ⭐ 带滚动加载的评论查找（核心方法）
 * 评论列表使用虚拟列表，目标评论可能不在当前视口，需要滚动加载
 * @param {Page} page - Playwright页面对象
 * @param {string} commentId - 评论ID（可为null）
 * @param {Object} matchOptions - 匹配选项
 * @param {string} matchOptions.commentContent - 评论内容（用于匹配）
 * @param {string} matchOptions.authorName - 评论作者昵称（用于匹配）
 * @param {string} matchOptions.secUid - 评论作者sec_uid（用于精确匹配）
 */
async function findCommentWithScroll(page, commentId, matchOptions = {}) {
    const { commentContent, authorName, secUid } = matchOptions;
    const MAX_SCROLL_ATTEMPTS = 50;  // 最多滚动50次
    const CONVERGENCE_CHECK = 3;     // 连续3次没有新内容则停止
    let convergenceCounter = 0;
    let lastCommentCount = 0;

    const matchInfo = commentId || `内容+昵称匹配`;
    logger.info(`🔍 开始滚动查找评论 ${matchInfo}...`);

    for (let attempt = 0; attempt < MAX_SCROLL_ATTEMPTS; attempt++) {
        // 1. 先尝试查找评论（不滚动）
        let container = null;

        // ⭐ 优先使用内容+昵称+secUid匹配（更可靠）
        if (commentContent && authorName) {
            container = await findCommentContainerByContentAndAuthor(page, commentContent, authorName, secUid);
        }

        // 如果内容+昵称匹配失败，尝试ID匹配
        if (!container && commentId) {
            container = await findCommentContainerByDataAttrs(page, commentId);
            if (!container) {
                container = await findCommentContainerByReactFiber(page, commentId);
            }
        }

        if (container) {
            logger.info(`✅ 在第 ${attempt + 1} 次尝试时找到评论`);
            // 滚动评论到可见区域
            try {
                await container.scrollIntoViewIfNeeded();
                await page.waitForTimeout(300);
            } catch (e) {
                // 忽略滚动错误
            }
            return container;
        }

        // 2. 滚动评论列表加载更多
        const scrollResult = await page.evaluate(() => {
            // 查找评论列表的滚动容器
            // 抖音创作中心评论列表通常在 .comment-list 或带 overflow 的容器中
            const possibleContainers = [
                document.querySelector('.comment-list'),
                document.querySelector('[class*="comment-list"]'),
                document.querySelector('[class*="CommentList"]'),
                document.querySelector('.list-container'),
                document.querySelector('[class*="list-container"]'),
                // ⭐ 增加更多可能的选择器
                document.querySelector('[class*="rightContent"]'),
                document.querySelector('[class*="right-content"]'),
                document.querySelector('[class*="commentArea"]'),
                document.querySelector('[class*="comment-area"]'),
            ].filter(Boolean);

            let scrollContainer = null;

            // 找到第一个可滚动的容器
            for (const container of possibleContainers) {
                const style = window.getComputedStyle(container);
                if (style.overflow === 'auto' || style.overflow === 'scroll' ||
                    style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    scrollContainer = container;
                    break;
                }
            }

            // 如果没找到，尝试从评论元素向上查找
            if (!scrollContainer) {
                const commentEl = document.querySelector('[class*="comment-content"]') ||
                                  document.querySelector('[class*="CommentItem"]') ||
                                  document.querySelector('[class*="comment-item"]');
                if (commentEl) {
                    let parent = commentEl.parentElement;
                    let depth = 0;
                    while (parent && depth < 15) {
                        const style = window.getComputedStyle(parent);
                        if ((style.overflow === 'auto' || style.overflow === 'scroll' ||
                             style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                            parent.scrollHeight > parent.clientHeight) {
                            scrollContainer = parent;
                            break;
                        }
                        parent = parent.parentElement;
                        depth++;
                    }
                }
            }

            // 如果还没找到，使用 document.body 或主内容区域
            if (!scrollContainer) {
                scrollContainer = document.querySelector('main') ||
                                  document.querySelector('[class*="content"]') ||
                                  document.documentElement;
            }

            // 统计当前评论数量
            const commentElements = document.querySelectorAll(
                '[class*="comment-content"], [class*="CommentItem"], [class*="comment-item"], [class*="content-"]'
            );
            const commentCount = commentElements.length;

            // 滚动
            const prevScrollTop = scrollContainer.scrollTop;
            scrollContainer.scrollTop += 500;  // 每次滚动500px

            return {
                scrolled: scrollContainer.scrollTop > prevScrollTop,
                commentCount,
                containerFound: !!scrollContainer,
                scrollTop: scrollContainer.scrollTop,
                scrollHeight: scrollContainer.scrollHeight,
                containerClass: scrollContainer.className || scrollContainer.tagName,
            };
        });

        // ⭐ 首次滚动时输出容器信息
        if (attempt === 0) {
            logger.info(`📜 滚动容器信息:`, {
                containerFound: scrollResult.containerFound,
                containerClass: scrollResult.containerClass?.substring(0, 50),
                scrollHeight: scrollResult.scrollHeight,
                commentCount: scrollResult.commentCount,
            });
        }

        if (!scrollResult.scrolled && scrollResult.commentCount === lastCommentCount) {
            convergenceCounter++;
            if (convergenceCounter >= CONVERGENCE_CHECK) {
                logger.warn(`⚠️ 滚动到底部仍未找到评论 ${matchInfo}，共检查 ${scrollResult.commentCount} 条评论`);
                break;
            }
        } else {
            convergenceCounter = 0;
        }

        lastCommentCount = scrollResult.commentCount;

        // 等待新内容加载
        await page.waitForTimeout(300);

        if (attempt % 10 === 0 && attempt > 0) {
            logger.debug(`🔄 已滚动 ${attempt} 次，当前评论数: ${scrollResult.commentCount}`);
        }
    }

    logger.warn(`❌ 滚动 ${MAX_SCROLL_ATTEMPTS} 次后仍未找到评论 ${matchInfo}`);
    return null;
}

/**
 * ⭐ 通过作者昵称查找一级评论容器
 * 当只有 replyToUsername 时使用此方法
 * @param {Page} page - Playwright页面对象
 * @param {string} authorName - 评论作者昵称
 */
async function findCommentContainerByAuthorName(page, authorName) {
    logger.info(`🔍 [作者昵称匹配] 查找评论: 作者="${authorName}"`);

    const container = await page.evaluateHandle((searchAuthor) => {
        // 标准化文本用于比较
        function normalizeText(text) {
            return (text || '').replace(/\s+/g, '').trim();
        }

        const normalizedAuthor = normalizeText(searchAuthor);

        // 查找所有可能的评论容器
        const candidates = document.querySelectorAll('div, li');

        for (const node of candidates) {
            try {
                // 检查是否包含作者名称
                const userNode = node.querySelector('[class*="username"], [class*="user"], [class*="name"], [class*="author"]');
                if (!userNode) continue;

                const domAuthor = normalizeText(userNode.innerText);
                if (!domAuthor || !domAuthor.includes(normalizedAuthor)) continue;

                // 检查是否是一级评论（有"查看X条回复"按钮的是一级评论）
                const hasReplyButton = node.textContent?.match(/查看\d+条回复/);

                // 通过 React Fiber 确认是评论组件
                const keys = Object.getOwnPropertyNames(node);
                for (const k of keys) {
                    if (k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')) {
                        let fiber = node[k];
                        for (let up = 0; up < 30 && fiber; up++) {
                            const props = fiber.memoizedProps || fiber.pendingProps;
                            if (props && props.cid && String(props.cid).startsWith('@i/')) {
                                // 确认是评论组件
                                // 优先返回有"查看回复"按钮的（一级评论）
                                if (hasReplyButton) {
                                    return node;
                                }
                            }
                            fiber = fiber.return;
                        }
                        break;
                    }
                }

                // 如果没有 React Fiber，但DOM结构匹配也可以
                if (hasReplyButton && domAuthor.includes(normalizedAuthor)) {
                    return node;
                }
            } catch (e) {
                // 继续
            }
        }
        return null;
    }, authorName);

    const element = container ? container.asElement() : null;
    if (element) {
        logger.info(`✅ [作者昵称匹配] 找到评论容器`);
        return element;
    }

    logger.warn(`❌ [作者昵称匹配] 未找到作者为 "${authorName}" 的一级评论`);
    return null;
}

/**
 * ⭐ 通过评论内容和作者昵称查找评论容器（新方法）
 * 由于抖音评论ID已改为加密格式，API返回的数字ID无法直接匹配页面上的加密ID
 * 因此使用评论内容+作者昵称进行匹配
 * @param {Page} page - Playwright页面对象
 * @param {string} commentContent - 评论内容
 * @param {string} authorName - 评论作者昵称
 * @param {string} secUid - 评论作者sec_uid（可选，用于精确匹配防止同名）
 */
async function findCommentContainerByContentAndAuthor(page, commentContent, authorName, secUid = null) {
    logger.info(`🔍 [内容+昵称匹配] 查找评论: 作者="${authorName}", 内容="${commentContent.substring(0, 30)}...", secUid=${secUid || '无'}`);

    // ⭐ Playwright evaluateHandle 只接受 1 个额外参数，需要包装成对象
    const result = await page.evaluate(({ searchContent, searchAuthor, searchSecUid }) => {
        // 标准化文本用于比较（去除空格和换行）
        function normalizeText(text) {
            return (text || '').replace(/\s+/g, '').trim();
        }

        // ⭐ 移除表情符号标记 [xxx] 进行匹配（因为DOM中表情可能显示为图片）
        function removeEmojiTags(text) {
            return (text || '').replace(/\[[\u4e00-\u9fa5a-zA-Z]+\]/g, '').trim();
        }

        const normalizedContent = normalizeText(searchContent);
        const normalizedAuthor = normalizeText(searchAuthor);
        const contentWithoutEmoji = removeEmojiTags(normalizedContent);

        const candidates = document.querySelectorAll('div, li, span');
        const debugInfo = [];  // 收集调试信息

        for (const node of candidates) {
            try {
                const keys = Object.getOwnPropertyNames(node);
                for (const k of keys) {
                    if (k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')) {
                        let fiber = node[k];
                        for (let up = 0; up < 30 && fiber; up++) {
                            const props = fiber.memoizedProps || fiber.pendingProps;
                            // ⚠️ 修复：支持数字ID和加密ID两种格式
                            // 原条件 String(props.cid).startsWith('@i/') 会跳过数字ID
                            if (props && props.cid) {
                                // 找到评论组件，检查内容和作者
                                // ⭐ 方式1：直接从 props 获取（修正字段名）
                                const propsText = normalizeText(props.text || props.content);
                                // ⭐ 修正：作者昵称在 props.user?.nickname 中
                                const propsAuthor = normalizeText(
                                    props.user?.nickname ||
                                    props.userName ||
                                    props.replyToUserName ||
                                    props.nickname
                                );

                                // 方式2：从 DOM 获取
                                const textNode = node.querySelector('[class*="comment-content"], [class*="text"], [class*="content-"]');
                                const domText = normalizeText(textNode?.innerText);
                                const domTextWithoutEmoji = removeEmojiTags(domText);

                                const userNode = node.querySelector('[class*="user"], [class*="name"], [class*="author"]');
                                const domAuthor = normalizeText(userNode?.innerText);

                                // 收集前3条评论的调试信息
                                if (debugInfo.length < 3) {
                                    debugInfo.push({
                                        cid: props.cid,
                                        propsText: propsText?.substring(0, 30),
                                        propsAuthor,
                                        domText: domText?.substring(0, 30),
                                        domAuthor,
                                        userNickname: props.user?.nickname,
                                    });
                                }

                                // ⭐ 增强匹配逻辑：支持表情符号匹配
                                // 内容匹配：考虑表情符号的情况
                                const contentMatch =
                                    // 完全匹配
                                    (propsText && propsText.includes(normalizedContent)) ||
                                    (domText && domText.includes(normalizedContent)) ||
                                    (normalizedContent && propsText && normalizedContent.includes(propsText)) ||
                                    (normalizedContent && domText && normalizedContent.includes(domText)) ||
                                    // ⭐ 移除表情后匹配（处理纯表情评论）
                                    (contentWithoutEmoji === '' && propsText === '') ||
                                    (contentWithoutEmoji === '' && domTextWithoutEmoji === '') ||
                                    // ⭐ 部分匹配（移除表情后）
                                    (contentWithoutEmoji && propsText && propsText.includes(contentWithoutEmoji)) ||
                                    (contentWithoutEmoji && domTextWithoutEmoji && domTextWithoutEmoji.includes(contentWithoutEmoji));

                                // 作者匹配
                                const authorMatch =
                                    (propsAuthor && propsAuthor.includes(normalizedAuthor)) ||
                                    (domAuthor && domAuthor.includes(normalizedAuthor)) ||
                                    (normalizedAuthor && propsAuthor && normalizedAuthor.includes(propsAuthor)) ||
                                    (normalizedAuthor && domAuthor && normalizedAuthor.includes(domAuthor));

                                // ⭐ 如果提供了 secUid，额外检查用户ID匹配（防止同名用户）
                                let secUidMatch = true;  // 默认通过
                                if (searchSecUid) {
                                    const propsSecUid = props.user?.sec_uid || props.secUid || props.sec_uid;
                                    secUidMatch = propsSecUid && propsSecUid === searchSecUid;
                                }

                                if (contentMatch && authorMatch && secUidMatch) {
                                    return { found: true, debugInfo };
                                }
                            }
                            fiber = fiber.return;
                        }
                        break;
                    }
                }
            } catch (e) {
                // 继续
            }
        }
        return { found: false, debugInfo };
    }, { searchContent: commentContent, searchAuthor: authorName, searchSecUid: secUid });

    // ⭐ 输出调试信息
    if (result.debugInfo && result.debugInfo.length > 0) {
        logger.info(`📊 [内容+昵称匹配] 页面评论样本:`, {
            samples: result.debugInfo.map(d => ({
                author: d.propsAuthor || d.domAuthor || d.userNickname,
                content: d.propsText || d.domText
            }))
        });
    }

    if (result.found) {
        // 需要重新获取元素句柄
        const container = await page.evaluateHandle(({ searchContent, searchAuthor, searchSecUid }) => {
            function normalizeText(text) {
                return (text || '').replace(/\s+/g, '').trim();
            }
            function removeEmojiTags(text) {
                return (text || '').replace(/\[[\u4e00-\u9fa5a-zA-Z]+\]/g, '').trim();
            }

            const normalizedContent = normalizeText(searchContent);
            const normalizedAuthor = normalizeText(searchAuthor);
            const contentWithoutEmoji = removeEmojiTags(normalizedContent);

            const candidates = document.querySelectorAll('div, li, span');

            for (const node of candidates) {
                try {
                    const keys = Object.getOwnPropertyNames(node);
                    for (const k of keys) {
                        if (k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')) {
                            let fiber = node[k];
                            for (let up = 0; up < 30 && fiber; up++) {
                                const props = fiber.memoizedProps || fiber.pendingProps;
                                // ⚠️ 修复：支持数字ID和加密ID两种格式
                                if (props && props.cid) {
                                    const propsText = normalizeText(props.text || props.content);
                                    const propsAuthor = normalizeText(
                                        props.user?.nickname || props.userName || props.replyToUserName || props.nickname
                                    );

                                    const textNode = node.querySelector('[class*="comment-content"], [class*="text"], [class*="content-"]');
                                    const domText = normalizeText(textNode?.innerText);
                                    const domTextWithoutEmoji = removeEmojiTags(domText);

                                    const userNode = node.querySelector('[class*="user"], [class*="name"], [class*="author"]');
                                    const domAuthor = normalizeText(userNode?.innerText);

                                    const contentMatch =
                                        (propsText && propsText.includes(normalizedContent)) ||
                                        (domText && domText.includes(normalizedContent)) ||
                                        (normalizedContent && propsText && normalizedContent.includes(propsText)) ||
                                        (normalizedContent && domText && normalizedContent.includes(domText)) ||
                                        (contentWithoutEmoji === '' && propsText === '') ||
                                        (contentWithoutEmoji === '' && domTextWithoutEmoji === '') ||
                                        (contentWithoutEmoji && propsText && propsText.includes(contentWithoutEmoji)) ||
                                        (contentWithoutEmoji && domTextWithoutEmoji && domTextWithoutEmoji.includes(contentWithoutEmoji));

                                    const authorMatch =
                                        (propsAuthor && propsAuthor.includes(normalizedAuthor)) ||
                                        (domAuthor && domAuthor.includes(normalizedAuthor)) ||
                                        (normalizedAuthor && propsAuthor && normalizedAuthor.includes(propsAuthor)) ||
                                        (normalizedAuthor && domAuthor && normalizedAuthor.includes(domAuthor));

                                    let secUidMatch = true;
                                    if (searchSecUid) {
                                        const propsSecUid = props.user?.sec_uid || props.secUid || props.sec_uid;
                                        secUidMatch = propsSecUid && propsSecUid === searchSecUid;
                                    }

                                    if (contentMatch && authorMatch && secUidMatch) {
                                        return node;
                                    }
                                }
                                fiber = fiber.return;
                            }
                            break;
                        }
                    }
                } catch (e) {
                    // 继续
                }
            }
            return null;
        }, { searchContent: commentContent, searchAuthor: authorName, searchSecUid: secUid });

        const element = container ? container.asElement() : null;
        if (element) {
            logger.info(`✅ [内容+昵称匹配] 找到评论容器`);
            return element;
        }
    }

    logger.warn(`❌ [内容+昵称匹配] 未找到匹配的评论`);
    return null;
}

/**
 * 通过 data 属性查找评论容器
 */
async function findCommentContainerByDataAttrs(page, commentId) {
    const selectors = [
        `[data-comment-id="${commentId}"]`,
        `[data-cid="${commentId}"]`,
        `[data-id="${commentId}"]`,
        `[data-commentid="${commentId}"]`,
        `[data-rid="${commentId}"]`
    ];

    for (const selector of selectors) {
        try {
            const el = await page.$(selector);
            if (el) {
                logger.debug(`通过 data 属性找到: ${selector}`);
                return el;
            }
        } catch (e) {
            // 继续
        }
    }

    return null;
}

/**
 * 通过 React Fiber 查找评论容器
 */
async function findCommentContainerByReactFiber(page, commentId) {
    // ⭐ 先获取页面上的评论信息用于调试
    const debugInfo = await page.evaluate((targetId) => {
        const result = {
            targetId,
            foundCommentIds: [],
            totalCandidates: 0,
            hasReactFiber: false,
        };

        const candidates = document.querySelectorAll('div, li, span');
        result.totalCandidates = candidates.length;

        // 只收集评论相关的属性（不包含通用的 id，避免收集到页面元素ID）
        // ⭐ 增加 levelOneCid - 抖音新版评论ID存储位置
        const commentPropsNames = ['cid', 'commentId', 'comment_id', 'platform_comment_id', 'levelOneCid'];
        const foundIds = new Set();

        // 判断是否像评论ID
        // ⭐ 支持两种格式：
        // 1. 数字格式：7576872839296697140（10位以上纯数字）
        // 2. 加密格式：@i/Fs6L9ITkf8t...（Base64加密字符串）
        function isLikeCommentId(val) {
            const str = String(val);
            // 数字格式（10位以上）
            if (/^\d{10,}$/.test(str)) return true;
            // 加密格式（@i/ 开头）
            if (str.startsWith('@i/') && str.length > 10) return true;
            return false;
        }

        for (const node of candidates) {
            try {
                const keys = Object.getOwnPropertyNames(node);
                for (const k of keys) {
                    if (k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')) {
                        result.hasReactFiber = true;
                        let fiber = node[k];
                        for (let up = 0; up < 20 && fiber; up++) {
                            const props = fiber.memoizedProps || fiber.pendingProps;
                            if (props) {
                                // 收集评论相关属性
                                for (const n of commentPropsNames) {
                                    if (props[n] && isLikeCommentId(props[n])) {
                                        foundIds.add(String(props[n]));
                                    }
                                }
                                // 也检查通用 id，但必须像评论ID
                                if (props.id && isLikeCommentId(props.id)) {
                                    foundIds.add(String(props.id));
                                }
                                // 检查嵌套的 comment 对象
                                if (props.comment) {
                                    if (props.comment.commentId) foundIds.add(String(props.comment.commentId));
                                    if (props.comment.id && isLikeCommentId(props.comment.id)) foundIds.add(String(props.comment.id));
                                    if (props.comment.cid) foundIds.add(String(props.comment.cid));
                                }
                            }
                            fiber = fiber.return;
                        }
                        break; // 每个节点只检查一次
                    }
                }
            } catch (e) {
                // 继续
            }
        }

        result.foundCommentIds = Array.from(foundIds).slice(0, 20); // 只取前20个
        return result;
    }, commentId);

    logger.info(`🔍 [React Fiber] 查找评论 ${commentId}`, {
        totalCandidates: debugInfo.totalCandidates,
        hasReactFiber: debugInfo.hasReactFiber,
        foundCommentIds: debugInfo.foundCommentIds.length,
        sampleIds: debugInfo.foundCommentIds.slice(0, 5).join(', '),
    });

    // 现在执行实际查找
    const container = await page.evaluateHandle((id) => {
        const candidates = document.querySelectorAll('div, li, span');
        // ⭐ 增加 levelOneCid - 抖音新版评论ID存储位置
        const propsNames = ['cid', 'commentId', 'comment_id', 'platform_comment_id', 'id', 'levelOneCid'];

        for (const node of candidates) {
            try {
                const keys = Object.getOwnPropertyNames(node);
                for (const k of keys) {
                    if (k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')) {
                        let fiber = node[k];
                        for (let up = 0; up < 20 && fiber; up++) {
                            const props = fiber.memoizedProps || fiber.pendingProps;
                            if (props) {
                                for (const n of propsNames) {
                                    if (props[n] && String(props[n]) === String(id)) {
                                        return node;
                                    }
                                }
                                // 检查嵌套的 comment 对象
                                if (props.comment && (props.comment.commentId || props.comment.id || props.comment.cid)) {
                                    const cid = props.comment.commentId || props.comment.id || props.comment.cid;
                                    if (String(cid) === String(id)) {
                                        return node;
                                    }
                                }
                            }
                            fiber = fiber.return;
                        }
                    }
                }
            } catch (e) {
                // 继续
            }
        }
        return null;
    }, commentId);

    // ⚠️ 注意：evaluateHandle 即使返回 null 也会返回 JSHandle 对象
    // 必须先调用 asElement() 获取实际元素再判断
    const element = container ? container.asElement() : null;
    if (element) {
        logger.info(`✅ [React Fiber] 找到评论容器 ${commentId}`);
        return element;
    }

    logger.warn(`❌ [React Fiber] 未找到评论 ${commentId}，页面上的评论ID: ${debugInfo.foundCommentIds.slice(0, 10).join(', ')}`);
    return null;
}

/**
 * 在容器内点击回复按钮
 * 参考测试脚本的 clickReplyInContainer
 */
async function clickReplyInContainer(page, container) {
    try {
        const clicked = await page.evaluate((c) => {
            try {
                const ops = c.querySelector('.operations-WFV7Am') || c.querySelector('.operations') || c;
                const divs = Array.from(ops.querySelectorAll('div, button, a, span'));

                // 找到文本为"回复"的按钮（但不包含"查看"）
                let btn = divs.find(e => {
                    const t = (e.innerText || '').trim();
                    if (!t) return false;
                    if (t === '回复') return true;
                    if (t.includes('回复') && !t.includes('查看')) return true;
                    return false;
                });

                if (!btn) return false;

                try { btn.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch(e) {}
                try { btn.click(); } catch(e) {
                    try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch(e) {}
                }
                return true;
            } catch (e) {
                return false;
            }
        }, container);

        return clicked;
    } catch (e) {
        logger.error('点击回复按钮失败', { error: e.message });
        return false;
    }
}

/**
 * 在容器内输入文本并发送
 * 参考测试脚本的 typeAndSendInContainer
 * ⭐ 根据MCP验证结果，通过 placeholder 属性区分输入框：
 * - 顶部一级评论框 placeholder: "有爱评论，说点好听的~"
 * - 二级回复框 placeholder: "回复 {用户名}："
 */
async function typeAndSendInContainer(page, container, text) {
    logger.info(`⌨️  [输入发送] 准备在容器内输入: "${text.substring(0, 30)}..."`);

    // 1. 在容器内找到回复输入框（通过 placeholder 区分）
    logger.info('⌨️  [输入发送-1] 开始查找容器内的回复输入框...');
    const inputHandle = await page.evaluateHandle((c) => {
        // ⭐ 优先查找带有 "回复 XXX：" placeholder 的输入框（二级评论回复框）
        const allInputs = c.querySelectorAll('div[contenteditable="true"], .input-d24X73, .input');

        for (const input of allInputs) {
            const placeholder = input.getAttribute('placeholder') || '';
            // 二级评论回复框的 placeholder 格式: "回复 {用户名}："
            if (placeholder.startsWith('回复 ') && placeholder.endsWith('：')) {
                return input;
            }
        }

        // 如果没找到特定的回复框，返回第一个输入框
        return c.querySelector('div[contenteditable="true"]') ||
               c.querySelector('.input-d24X73') ||
               c.querySelector('.input');
    }, container);

    let input = inputHandle && inputHandle.asElement ? inputHandle.asElement() : null;

    // ⭐ 备用方案：如果在容器内未找到，则在整个页面中查找回复输入框
    if (!input) {
        logger.info('⌨️  [输入发送-1] 在容器内未找到，尝试在页面中查找回复输入框...');
        const pageInputHandle = await page.evaluateHandle(() => {
            const allInputs = document.querySelectorAll('div[contenteditable="true"]');
            for (const inp of allInputs) {
                const placeholder = inp.getAttribute('placeholder') || '';
                // 二级评论回复框的 placeholder 格式: "回复 {用户名}："
                if (placeholder.startsWith('回复 ') && placeholder.endsWith('：')) {
                    return inp;
                }
            }
            return null;
        });
        input = pageInputHandle && pageInputHandle.asElement ? pageInputHandle.asElement() : null;
    }

    if (!input) {
        logger.error('❌ [输入发送-1] 在容器和页面中均未找到输入框');
        throw new Error('在容器和页面中均未找到输入框');
    }

    // 获取 placeholder 用于日志
    const placeholder = await page.evaluate(el => el.getAttribute('placeholder') || '', input);
    logger.info(`⌨️  [输入发送-1] ✅ 找到输入框 (placeholder: "${placeholder}")`);

    // 2. 聚焦并输入（针对 contenteditable 的 React 组件）
    logger.info('⌨️  [输入发送-2] 开始聚焦并输入文本...');

    // ⭐ 使用 Playwright 的 fill() 方法（会自动触发正确的事件序列）
    try {
        await input.click();
        await page.waitForTimeout(300);  // 等待聚焦完成
        await input.fill(text);
        await page.waitForTimeout(500);  // 等待 React 状态更新
        logger.info('⌨️  [输入发送-2] ✅ 已输入内容（使用 fill 方法）');
    } catch (fillError) {
        // ⭐ 备用方案：使用 keyboard.type 逐字输入
        logger.warn(`⌨️  [输入发送-2] fill 方法失败: ${fillError.message}，使用逐字输入`);
        await input.click();
        await page.waitForTimeout(200);

        // 清空
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        // 逐字输入
        for (const char of text) {
            await page.keyboard.type(char, { delay: 50 });
            await page.waitForTimeout(30);
        }
        await page.waitForTimeout(300);
        logger.info('⌨️  [输入发送-2] ✅ 已输入内容（使用逐字输入）');
    }

    // 3. 等待发送按钮激活
    // fill() 方法已经触发了完整的 React 事件序列，500ms 足够让按钮激活
    logger.info('⌨️  [输入发送-3] ✅ 文本已输入，发送按钮应已激活');

    // 4. 在容器内查找并点击发送按钮
    logger.info('⌨️  [输入发送-4] 开始查找并点击发送按钮...');
    const sendSuccess = await clickSendInContainer(page, container);
    if (!sendSuccess) {
        logger.error('❌ [输入发送-4] 点击发送按钮失败');
        throw new Error('点击发送按钮失败');
    }

    logger.info('⌨️  [输入发送-4] ✅ 发送按钮已点击');

    // ⭐ 等待 API 请求完成（防止 Tab 关闭过早导致请求中断）
    logger.info('⌨️  [输入发送-5] ⏳ 等待 API 响应...');

    // 记录点击前的结果数量
    const beforeCount = apiData.replyResults.length;

    // 最多等待 10 秒，检查是否有新的 API 响应
    const maxWaitTime = 10000;
    const startTime = Date.now();
    let apiResponse = null;

    while (Date.now() - startTime < maxWaitTime) {
        await page.waitForTimeout(500);

        // 检查是否有新的响应
        if (apiData.replyResults.length > beforeCount) {
            apiResponse = apiData.replyResults[apiData.replyResults.length - 1];
            logger.info(`⌨️  [输入发送-5] ✅ 收到 API 响应: ${apiResponse.success ? '成功' : '失败'} (${apiResponse.statusMsg || ''})`);
            break;
        }
    }

    if (!apiResponse) {
        logger.warn('⚠️  [输入发送-5] 等待超时，未收到 API 响应（可能发送成功但未拦截到响应）');
    }

    logger.info('⌨️  [输入发送-5] ✅ 发送流程完成');
}

/**
 * 在容器内点击发送按钮
 * 参考测试脚本逻辑，优先使用平台特定按钮
 */
async function clickSendInContainer(page, container) {
    const sendBtnSelector = 'button.douyin-creator-interactive-button';

    try {
        // 1. 优先查找平台特定的发送按钮
        const foundBtn = await page.evaluateHandle((c, selector) => {
            try {
                const btns = Array.from(c.querySelectorAll(selector));
                for (const b of btns) {
                    const span = b.querySelector('.douyin-creator-interactive-button-content');
                    const t = (span && span.innerText) || b.innerText || '';
                    if ((t || '').trim() === '发送') {
                        return b;
                    }
                }
            } catch (e) {}
            return null;
        }, container, sendBtnSelector);

        if (foundBtn && foundBtn.asElement && foundBtn.asElement()) {
            const btnEl = foundBtn.asElement();

            // ⭐ fill() 已触发 React 事件，按钮应已激活，直接点击
            try {
                await btnEl.scrollIntoViewIfNeeded();
                await btnEl.click({ force: false });
                logger.info('✅ [Playwright] 点击了平台发送按钮');
                return true;
            } catch (clickErr) {
                // 如果 Playwright 点击失败，尝试 JavaScript 强制点击
                logger.warn(`⚠️  Playwright 点击失败: ${clickErr.message}，尝试 JS 强制点击`);
                const jsClicked = await page.evaluate((btn) => {
                    try {
                        btn.click();
                        return true;
                    } catch (e) {
                        return false;
                    }
                }, btnEl);

                if (jsClicked) {
                    logger.info('✅ [JavaScript] 强制点击了平台发送按钮');
                    return true;
                }
            }
        }
    } catch (e) {
        logger.debug(`平台发送按钮查找失败: ${e.message}，尝试通用方法`);
    }

    // 2. Fallback: 查找通用发送按钮（放宽条件，允许禁用状态）
    logger.debug('尝试通用发送按钮方法');

    const sendHandle = await page.evaluateHandle((c) => {
        // 优先查找已激活的按钮
        const btns = Array.from(c.querySelectorAll('button'));
        for (const e of btns) {
            try {
                const t = (e.innerText || '').trim();
                if (t === '发送') {
                    if (!e.disabled && e.getAttribute('aria-disabled') !== 'true') {
                        return e;  // 返回已激活的按钮
                    }
                }
            } catch (err) {}
        }

        // ⭐ 如果没有已激活的，返回禁用的发送按钮（稍后强制点击）
        for (const e of btns) {
            try {
                const t = (e.innerText || '').trim();
                if (t === '发送') {
                    return e;  // 返回禁用的按钮
                }
            } catch (err) {}
        }

        // 查找 div/span 发送按钮
        const els = Array.from(c.querySelectorAll('div, span'));
        for (const e of els) {
            try {
                const t = (e.innerText || '').trim();
                if (t === '发送') {
                    return e;
                }
            } catch (err) {}
        }
        return null;
    }, container);

    if (sendHandle && sendHandle.asElement) {
        const el = sendHandle.asElement();
        if (el) {
            // 检查按钮状态
            const btnInfo = await page.evaluate((btn) => {
                return {
                    disabled: btn.disabled,
                    ariaDisabled: btn.getAttribute('aria-disabled'),
                    tagName: btn.tagName
                };
            }, el);

            logger.debug(`找到通用发送按钮: ${JSON.stringify(btnInfo)}`);

            try {
                // 先尝试正常点击
                await el.scrollIntoViewIfNeeded();
                await el.click({ force: false });
                logger.info('✅ [Playwright] 点击了通用发送按钮');
                return true;
            } catch (e) {
                // ⭐ 正常点击失败，尝试 JavaScript 强制点击
                logger.warn(`⚠️  Playwright 点击失败: ${e.message}，尝试 JS 强制点击`);
                const jsClicked = await page.evaluate((btn) => {
                    try {
                        btn.click();
                        return true;
                    } catch (err) {
                        return false;
                    }
                }, el);

                if (jsClicked) {
                    logger.info('✅ [JavaScript] 强制点击了通用发送按钮');
                    return true;
                }
            }
        }
    }

    // 3. 最后的Fallback: Enter 键
    logger.warn('⚠️  未找到可点击的发送按钮，尝试 Enter 键');
    try {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        // Ctrl+Enter (有些编辑器使用这个)
        await page.keyboard.down('Control');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Control');
        return true;
    } catch (e) {
        return false;
    }
}

// ============================================================================
// 场景B：给作品发一级评论
// 参考 tests/replyToCommentById.js 的 else 分支
// ============================================================================

/**
 * 给作品发一级评论
 * 参考测试脚本的 work-level reply 逻辑
 */
async function replyToWork(page, text) {
    logger.info('[回复作品] 开始给作品发评论');

    // 1. 查找顶层输入框（不在评论容器内的）
    logger.info('🔍 [一级评论-1] 开始查找顶层输入框...');
    const topInput = await findTopLevelWorkInput(page);
    if (!topInput) {
        logger.error('❌ [一级评论-1] 未找到作品评论输入框');
        throw new Error('未找到作品评论输入框');
    }

    logger.info('🔍 [一级评论-1] ✅ 找到作品评论输入框');

    // 2. 聚焦并输入
    logger.info(`🔍 [一级评论-2] 开始聚焦并输入: "${text.substring(0, 20)}..."`);
    await topInput.focus();
    await page.evaluate(el => { el.innerText = ''; }, topInput);
    await page.keyboard.type(text, { delay: 40 });

    logger.info('🔍 [一级评论-2] ✅ 已输入内容');

    // 3. 等待输入完成
    logger.info('🔍 [一级评论-3] 等待输入完成...');
    await page.waitForTimeout(500);
    logger.info('🔍 [一级评论-3] ✅ 输入等待完成');

    // 4. 查找并点击全局发送按钮
    logger.info('🔍 [一级评论-4] 开始查找并点击发送按钮...');
    const sendSuccess = await clickGlobalSendButton(page);
    if (!sendSuccess) {
        logger.error('❌ [一级评论-4] 点击发送按钮失败');
        throw new Error('点击发送按钮失败');
    }

    logger.info('🔍 [一级评论-4] ✅ 发送按钮已点击');

    // ⭐ 等待 API 请求完成（防止 Tab 关闭过早导致请求中断）
    logger.info('🔍 [一级评论-5] ⏳ 等待 API 响应...');

    // 记录点击前的结果数量
    const beforeCount = apiData.replyResults.length;

    // 最多等待 10 秒，检查是否有新的 API 响应
    const maxWaitTime = 10000;
    const startTime = Date.now();
    let apiResponse = null;

    while (Date.now() - startTime < maxWaitTime) {
        await page.waitForTimeout(500);

        // 检查是否有新的响应
        if (apiData.replyResults.length > beforeCount) {
            apiResponse = apiData.replyResults[apiData.replyResults.length - 1];
            logger.info(`🔍 [一级评论-5] ✅ 收到 API 响应: ${apiResponse.success ? '成功' : '失败'} (${apiResponse.statusMsg || ''})`);
            break;
        }
    }

    if (!apiResponse) {
        logger.warn('⚠️  [一级评论-5] 等待超时，未收到 API 响应（可能发送成功但未拦截到响应）');
    }

    logger.info('🔍 [一级评论-5] ✅ 作品评论发送流程完成');
}

/**
 * 查找顶层输入框（不在评论容器内的）
 * 参考测试脚本的 findTopLevelWorkInput
 */
async function findTopLevelWorkInput(page) {
    const handle = await page.evaluateHandle(() => {
        const nodes = Array.from(document.querySelectorAll('div[contenteditable="true"], .input-d24X73, .input'));

        function isInsideComment(node) {
            let cur = node;
            while (cur && cur !== document.body) {
                try {
                    const cls = cur.className || '';
                    if (typeof cls === 'string' && /content-|comment|reply|container|reply-list/i.test(cls)) {
                        return true;
                    }
                    if (cur.querySelector && (
                        cur.querySelector('.comment-content-text-JvmAKq') ||
                        cur.querySelector('.operations-WFV7Am')
                    )) {
                        return true;
                    }
                } catch(e) {}
                cur = cur.parentElement;
            }
            return false;
        }

        for (const n of nodes) {
            try {
                if (!isInsideComment(n)) {
                    return n;
                }
            } catch(e) {}
        }

        // Fallback: 第一个输入框
        return nodes[0] || null;
    });

    return handle && handle.asElement ? handle.asElement() : null;
}

/**
 * 点击全局发送按钮
 * 参考测试脚本逻辑 (tests/replyToCommentById.js 第432-467行)
 */
async function clickGlobalSendButton(page) {
    try {
        // 优先查找平台特定按钮
        const sendButton = await page.evaluateHandle(() => {
            const btns = Array.from(document.querySelectorAll('button.douyin-creator-interactive-button'));
            for (const btn of btns) {
                const span = btn.querySelector('.douyin-creator-interactive-button-content');
                const t = (span && span.innerText || btn.innerText || '').trim();
                if (t === '发送' && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
                    return btn;
                }
            }

            // Fallback: 通用查找（仅查找 BUTTON 标签）
            const els = Array.from(document.querySelectorAll('button, div, span'));
            for (const e of els) {
                const t = (e.innerText || '').trim();
                if (t === '发送') {
                    if (e.tagName === 'BUTTON' && !e.disabled && e.getAttribute('aria-disabled') !== 'true') {
                        return e;
                    }
                }
            }
            return null;
        });

        const btnElement = sendButton && sendButton.asElement ? sendButton.asElement() : null;
        if (btnElement) {
            logger.info('✅ 找到发送按钮，准备点击');

            // 确保按钮可见
            await btnElement.scrollIntoViewIfNeeded();

            // ✅ 使用 Playwright 原生点击（与测试脚本一致）
            await btnElement.click({ force: false });

            logger.info('✅ [Playwright] 点击了全局发送按钮');
            return true;
        } else {
            logger.warn('❌ 未找到可用的全局发送按钮');
            return false;
        }
    } catch (e) {
        logger.error('❌ 点击发送按钮失败', { error: e.message, stack: e.stack });
        return false;
    }
}

// ============================================================================
// 公共辅助函数
// ============================================================================

/**
 * 导航到评论管理页面
 */
async function navigateToCommentPage(page) {
    logger.info('导航到评论管理页面');
    const url = 'https://creator.douyin.com/creator-micro/interactive/comment';

    try {
        // 检查当前URL
        const currentUrl = page.url();
        if (currentUrl && currentUrl.includes('creator.douyin.com/creator-micro/interactive/comment')) {
            logger.info('已在评论管理页面');
            await page.waitForTimeout(500);
            return;
        }

        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        logger.info('✅ 页面加载完成');
    } catch (e) {
        logger.warn('页面导航可能未完成，继续执行', { error: e.message });
        await page.waitForTimeout(2000);
    }
}

/**
 * 根据标题选择视频
 */
async function selectVideoByTitle(page, videoTitle) {
    logger.info(`选择视频: ${videoTitle.substring(0, 50)}...`);

    try {
        // 1. 尝试点击"选择作品"按钮
        const selectSelectors = [
            'button:has-text("选择作品")',
            'span:has-text("选择作品")',
        ];

        for (const selector of selectSelectors) {
            try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    await page.click(selector, { timeout: 3000 });
                    await page.waitForTimeout(1500);
                    logger.debug('点击了选择作品按钮');
                    break;
                }
            } catch (e) {
                // 继续尝试下一个
            }
        }

        // 等待视频容器加载
        try {
            await page.waitForSelector('.container-Lkxos9', { timeout: 5000, state: 'visible' });
            await page.waitForTimeout(500);
        } catch (waitError) {
            logger.warn(`⚠️ 等待视频容器超时: ${waitError.message}`);
        }

        // ✅ 滚动加载所有作品（确保能找到目标视频）
        logger.debug('🔄 开始滚动加载作品列表...');
        const MAX_SCROLL_ATTEMPTS = 30;
        const CONVERGENCE_CHECK = 3;
        let previousVideoCount = 0;
        let convergenceCounter = 0;
        let scrollAttempts = 0;

        while (scrollAttempts < MAX_SCROLL_ATTEMPTS) {
            const scrollResult = await page.evaluate(() => {
                // 通过视频元素向上查找滚动容器
                const firstVideo = document.querySelector('.container-Lkxos9');
                let scrollContainer = null;

                if (firstVideo) {
                    let parent = firstVideo.parentElement;
                    let depth = 0;
                    while (parent && depth < 10) {
                        const overflow = window.getComputedStyle(parent).overflow;
                        const overflowY = window.getComputedStyle(parent).overflowY;
                        if (overflow === 'auto' || overflow === 'scroll' || overflowY === 'auto' || overflowY === 'scroll') {
                            scrollContainer = parent;
                            break;
                        }
                        parent = parent.parentElement;
                        depth++;
                    }
                }

                if (!scrollContainer) {
                    return { success: false, message: '未找到滚动容器' };
                }

                const previousScroll = scrollContainer.scrollTop;
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
                const videoCount = document.querySelectorAll('.container-Lkxos9').length;

                return {
                    success: true,
                    scrolled: scrollContainer.scrollTop > previousScroll,
                    videoCount: videoCount
                };
            });

            if (!scrollResult.success) {
                logger.debug(`滚动失败: ${scrollResult.message}`);
                break;
            }

            if (scrollResult.videoCount === previousVideoCount) {
                convergenceCounter++;
                if (convergenceCounter >= CONVERGENCE_CHECK) {
                    logger.debug(`✅ 滚动完成，共加载 ${scrollResult.videoCount} 个作品`);
                    break;
                }
            } else {
                convergenceCounter = 0;
                previousVideoCount = scrollResult.videoCount;
            }

            scrollAttempts++;
            await page.waitForTimeout(300);
        }

        // 2. 在浏览器中查找匹配的视频
        const result = await page.evaluate((titleToMatch) => {
            const containers = document.querySelectorAll('.container-Lkxos9') ||
                             document.querySelectorAll('[class*="container"]');

            for (let i = 0; i < containers.length; i++) {
                const container = containers[i];
                const titleEl = container.querySelector('.title-LUOP3b');
                const browserTitle = titleEl?.innerText?.trim() || '';

                // 精确匹配标题
                if (browserTitle === titleToMatch.trim()) {
                    return { found: true, index: i, title: browserTitle };
                }
            }

            // 未找到，使用第一个作为 fallback
            if (containers.length > 0) {
                const titleEl = containers[0].querySelector('.title-LUOP3b');
                const title = titleEl?.innerText?.trim() || '';
                return { found: true, index: 0, title, fallback: true };
            }

            return { found: false };
        }, videoTitle);

        if (result.found) {
            if (result.fallback) {
                logger.warn(`⚠️ 未找到匹配视频，使用第一个: ${result.title.substring(0, 50)}`);
            } else {
                logger.info(`✅ 找到匹配视频: ${result.title.substring(0, 50)}`);
            }

            // 点击选中的视频
            await page.evaluate((idx) => {
                const containers = document.querySelectorAll('.container-Lkxos9') ||
                                 document.querySelectorAll('[class*="container"]');
                if (idx < containers.length) {
                    containers[idx].click();
                }
            }, result.index);

            await page.waitForTimeout(2000);
            logger.info('✅ 视频已选择');

            // ⭐ 等待评论列表刷新加载
            logger.info('⏳ 等待评论列表刷新...');
            try {
                await page.waitForSelector(
                    '.comment-content-text-JvmAKq, .content-JvmAKq, [class*="comment-content"], [class*="CommentItem"]',
                    { timeout: 5000, state: 'visible' }
                );
                logger.info('✅ 评论列表已刷新');
            } catch (e) {
                logger.warn('⚠️ 未检测到评论列表刷新，继续执行...');
            }
        } else {
            logger.warn('⚠️ 未找到任何视频');
        }

    } catch (error) {
        logger.warn(`视频选择失败: ${error.message}，继续使用当前视频`);
    }
}

module.exports = {
    sendReplyToComment,
    onCommentReplyAPI,  // API 拦截器
    apiData  // 导出用于API拦截器
};
