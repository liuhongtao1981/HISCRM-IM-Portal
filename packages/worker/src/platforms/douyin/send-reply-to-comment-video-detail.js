/**
 * 抖音视频详情页评论回复模块（新实现 - UI 操作方式）
 *
 * 🎯 实现方式：通过 Playwright 模拟真实用户操作（点击、输入）
 * ✅ 优势：反检测能力强，行为接近真人，平台改版影响小
 *
 * 支持三种评论类型：
 * 1. 一级评论 - 直接评论视频
 * 2. 二级回复 - 回复一级评论
 * 3. 三级回复 - 回复二级回复 ⭐
 *
 * 验证方式：拦截浏览器发出的 API 响应
 * API端点: https://www.douyin.com/aweme/v1/web/comment/publish
 *
 * @created 2025-12-01
 * @based-on 实际API拦截测试数据
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('douyin-reply-video-detail');

/**
 * 发送评论回复（视频详情页方式）
 *
 * @param {Page} page - Playwright页面对象
 * @param {Object} options - 选项对象
 * @param {string} options.accountId - 账户ID
 * @param {string} options.awemeId - 视频ID (必需)
 * @param {string} options.replyContent - 回复内容
 * @param {number} options.commentLevel - 评论层级：1=一级评论，2=二级回复，3=三级回复
 * @param {string} options.replyId - 一级评论ID（二级和三级回复时必需）
 * @param {string} options.replyToReplyId - 二级评论ID（仅三级回复时必需）
 * @param {number} options.oneLevelCommentRank - 一级评论排名（可选，-1表示一级评论）
 * @returns {Promise<Object>} 返回结果 { success, data/error }
 */
async function sendReplyToCommentVideoDetail(page, options) {
    const {
        accountId,
        awemeId,
        replyContent,
        commentLevel = 1,
        replyId = null,
        replyToReplyId = null,
        oneLevelCommentRank = -1,
        skipVerificationCheck = false,  // 🔥 新增：是否跳过验证检测（用于重试时避免重复弹窗）
    } = options;

    logger.info('[视频详情页回复] 开始处理', {
        accountId,
        awemeId: awemeId?.substring(0, 20),
        commentLevel,
        contentLength: replyContent?.length,
        hasReplyId: !!replyId,
        hasReplyToReplyId: !!replyToReplyId,
    });

    try {
        // 参数验证
        if (!awemeId) {
            throw new Error('缺少必需参数: awemeId');
        }
        if (!replyContent) {
            throw new Error('缺少必需参数: replyContent');
        }
        if (commentLevel === 2 && !replyId) {
            throw new Error('二级回复缺少 replyId');
        }
        if (commentLevel === 3 && (!replyId || !replyToReplyId)) {
            throw new Error('三级回复缺少 replyId 或 replyToReplyId');
        }

        // 1. 导航到视频详情页
        logger.info('📍 [步骤1] 导航到视频详情页...');
        await navigateToVideoDetail(page, awemeId);
        logger.info('📍 [步骤1] ✅ 页面加载完成');

        // 2. API 拦截器由 platform.js 统一管理，无需单独设置
        // onCommentPublishAPI 已在 platform.js 中通过 APIInterceptorManager 注册
        logger.info('📍 [步骤2] API拦截器已由平台统一管理');

        // 3. 根据评论层级查找并点击回复按钮
        if (commentLevel > 1) {
            logger.info(`📍 [步骤3] 查找并点击回复按钮（${commentLevel}级回复）...`);
            await clickReplyButton(page, { commentLevel, replyId, replyToReplyId });
            logger.info('📍 [步骤3] ✅ 回复按钮已点击');
        }

        // 4. 输入评论内容
        logger.info('📍 [步骤4] 输入评论内容...');
        await typeReplyContent(page, replyContent, commentLevel);
        logger.info('📍 [步骤4] ✅ 内容已输入');

        // 5. ✅ 在点击发送按钮之前，先设置 API 响应监听器
        // 这样可以确保捕获到点击后立即发送的 API 请求
        logger.info('📍 [步骤5] 设置 API 响应监听并点击发送按钮...');

        // 创建 API 响应 Promise（在点击之前）
        const responsePromise = page.waitForResponse(
            (resp) => resp.url().includes('/comment/publish') && resp.request().method() === 'POST',
            { timeout: 15000 }  // 15秒超时
        ).catch(err => {
            logger.warn('⚠️ waitForResponse 超时或出错:', err.message);
            return null;  // 超时返回 null，不抛出错误
        });

        // 点击发送按钮
        await clickSendButton(page, commentLevel);
        logger.info('📍 [步骤5] ✅ 发送按钮已点击，等待 API 响应...');

        // 5.5. 检测验证弹窗（在等待 API 响应之前）
        // 🔥 如果是验证成功后的重试，跳过验证检测（避免重复弹窗）
        if (!skipVerificationCheck) {
            logger.info('📍 [步骤5.5] 检测验证弹窗...');
            const verificationResult = await detectVerification(page);

            if (verificationResult.detected) {
                logger.warn('⚠️ 检测到验证弹窗，需要人工处理', {
                    type: verificationResult.type,
                    message: verificationResult.message
                });

                // 创建验证错误对象，包含验证信息
                const verificationError = new Error('VERIFICATION_REQUIRED');
                verificationError.code = 'VERIFICATION_REQUIRED';
                verificationError.verificationInfo = {
                    source: 'douyin_comment_reply',  // 验证来源：抖音评论回复
                    platform: 'douyin',              // 平台标识
                    type: verificationResult.type,
                    phoneNumber: verificationResult.phoneNumber,
                    message: verificationResult.message,
                    hasSendSMSButton: verificationResult.hasSendSMSButton,
                    hasQRCodeOption: verificationResult.hasQRCodeOption,
                    accountId,
                    awemeId,
                    commentLevel,
                    replyContent
                };

                throw verificationError;
            }

            logger.info('📍 [步骤5.5] ✅ 未检测到验证弹窗，继续执行');
        } else {
            logger.info('📍 [步骤5.5] ⏭️ 跳过验证检测（验证已完成，避免重复弹窗）');
        }

        // 6. 等待并验证API响应
        logger.info('📍 [步骤6] 等待API响应（已在步骤5设置监听器）...');
        const response = await responsePromise;

        // 如果 waitForResponse 超时返回 null，解析响应
        let apiResult;
        if (!response) {
            logger.warn('⚠️ 未捕获到 API 响应（可能被 API 拦截器处理）');
            apiResult = { success: false, error: '未捕获到 API 响应' };
        } else {
            apiResult = await parseAPIResponse(response);
        }

        if (!apiResult || !apiResult.success) {
            throw new Error(`API响应失败: ${apiResult?.error || '未收到响应'}`);
        }

        logger.info('✅ 评论发送成功', {
            commentId: apiResult.data.commentId,
            level: commentLevel,
        });

        return {
            success: true,
            data: {
                commentId: apiResult.data.commentId,
                commentLevel,
                replyContent,
                awemeId,
                createTime: apiResult.data.createTime,
                timestamp: new Date().toISOString(),
            }
        };

    } catch (error) {
        // ⭐ 特殊处理：验证错误需要重新抛出，让上层处理
        if (error.code === 'VERIFICATION_REQUIRED') {
            logger.warn('⚠️ 检测到验证需求，重新抛出异常以便上层处理');
            throw error;  // 重新抛出，让 platform.js 的 catch 块处理
        }

        // 其他错误正常记录并返回
        logger.error('评论发送失败', {
            accountId,
            awemeId,
            commentLevel,
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
// 核心功能函数
// ============================================================================

/**
 * 导航到视频详情页
 */
async function navigateToVideoDetail(page, awemeId) {
    const url = `https://www.douyin.com/video/${awemeId}`;

    try {
        const currentUrl = page.url();
        if (currentUrl && currentUrl.includes(`/video/${awemeId}`)) {
            logger.info('已在目标视频详情页');
            await page.waitForTimeout(500);
            return;
        }

        // ⚠️ 改用 domcontentloaded 替代 networkidle（抖音页面资源加载慢）
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        logger.info('DOM内容已加载，等待评论区...');

        // 等待页面稳定
        await page.waitForTimeout(2000);

        // 等待评论区加载（增加超时时间）
        try {
            await page.waitForSelector('[id*="comment"], [class*="comment"]', {
                timeout: 10000,  // 增加到 10 秒
                state: 'visible'
            });
            logger.info('✅ 评论区已可见');
        } catch (e) {
            logger.warn('评论区加载超时，尝试滚动触发加载');
        }

        // 滚动到评论区确保评论列表渲染
        try {
            await page.evaluate(() => {
                const commentSection = document.querySelector('[id*="comment"], [class*="comment"]');
                if (commentSection) {
                    commentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
            await page.waitForTimeout(1500);
            logger.info('✅ 已滚动到评论区');
        } catch (e) {
            logger.warn('滚动到评论区失败');
        }

        logger.info('✅ 视频详情页加载完成');
    } catch (e) {
        logger.warn('页面导航可能未完成，继续执行', { error: e.message });
        await page.waitForTimeout(2000);
    }
}

// ============================================================================
// setupAPIInterceptor 函数已删除
// API 拦截现在由 platform.js 中的 onCommentPublishAPI 统一管理
// 通过 APIInterceptorManager 注册：manager.register('**/aweme/v1/web/comment/publish**', onCommentPublishAPI)
// ============================================================================

/**
 * 点击回复按钮（仅用于二级和三级回复）
 *
 * @param {Page} page - Playwright页面对象
 * @param {Object} options - 选项
 * @param {number} options.commentLevel - 评论层级
 * @param {string} options.replyId - 一级评论ID
 * @param {string} options.replyToReplyId - 二级评论ID
 */
async function clickReplyButton(page, options) {
    const { commentLevel, replyId, replyToReplyId } = options;

    // 如果是二级回复，查找一级评论的回复按钮
    if (commentLevel === 2) {
        logger.info(`查找一级评论 ${replyId} 的回复按钮...`);

        // 尝试多次查找评论（包含滚动）
        let commentContainer = null;
        const maxRetries = 3;

        for (let i = 0; i < maxRetries; i++) {
            if (i > 0) {
                logger.info(`第 ${i + 1} 次尝试查找评论...`);
                // 滚动页面触发更多评论加载
                await page.evaluate(() => {
                    window.scrollBy(0, 300);
                });
                await page.waitForTimeout(1000);
            }

            // 通过React Fiber或DOM查找评论容器
            commentContainer = await findCommentByFiber(page, replyId);
            if (commentContainer) break;
        }

        if (!commentContainer) {
            throw new Error(`未找到一级评论 ${replyId}（已尝试 ${maxRetries} 次，包含滚动）`);
        }

        // 滚动到评论容器，确保回复按钮可见
        await commentContainer.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);

        // 在评论容器内查找回复按钮（精确匹配，避免匹配到父级元素）
        const replyButtonHandle = await page.evaluateHandle((container) => {
            const allElements = container.querySelectorAll('*');

            for (const el of allElements) {
                // 只检查文本恰好是"回复"的元素
                if (el.textContent.trim() === '回复') {
                    // 确保这是最内层的"回复"元素（没有子元素的 textContent 也是"回复"）
                    const hasReplyChild = Array.from(el.children).some(child =>
                        child.textContent.trim() === '回复'
                    );

                    if (!hasReplyChild) {
                        return el;
                    }
                }
            }
            return null;
        }, commentContainer);

        const replyButton = replyButtonHandle.asElement();
        if (!replyButton) {
            throw new Error('未找到回复按钮');
        }

        // 使用 Playwright 的 click 方法（更可靠）
        await replyButton.click();
        logger.info('✅ 已点击回复按钮');

        // 等待输入框出现
        try {
            await page.waitForSelector('div[contenteditable="true"]', {
                state: 'visible',
                timeout: 3000
            });
            await page.waitForTimeout(300);  // 额外等待确保完全渲染
            logger.info('✅ 已点击二级回复按钮');
        } catch (e) {
            throw new Error('点击回复按钮后，输入框未出现');
        }
    }

    // 如果是三级回复，需要先展开二级评论，然后点击二级评论的回复按钮
    if (commentLevel === 3) {
        logger.info(`查找二级评论 ${replyToReplyId} 的回复按钮...`);

        // 1. 先查找并展开一级评论的回复列表（带重试）
        let rootContainer = null;
        const maxRetries = 3;

        for (let i = 0; i < maxRetries; i++) {
            if (i > 0) {
                logger.info(`第 ${i + 1} 次尝试查找一级评论...`);
                await page.evaluate(() => window.scrollBy(0, 300));
                await page.waitForTimeout(1000);
            }

            rootContainer = await findCommentByFiber(page, replyId);
            if (rootContainer) break;
        }

        if (!rootContainer) {
            throw new Error(`未找到一级评论 ${replyId}（已尝试 ${maxRetries} 次）`);
        }

        // 展开一级评论的回复列表
        await page.evaluate((container) => {
            const expandButtons = container.querySelectorAll('div, span');
            for (const btn of expandButtons) {
                const text = (btn.textContent || '').trim();
                if (text.match(/^查看\d+条回复$/)) {
                    btn.click();
                    return;
                }
            }
        }, rootContainer);

        await page.waitForTimeout(1500);
        logger.info('✅ 已展开一级评论的回复列表');

        // 2. 查找二级评论并点击回复按钮（带重试）
        let replyContainer = null;

        for (let i = 0; i < maxRetries; i++) {
            if (i > 0) {
                logger.info(`第 ${i + 1} 次尝试查找二级评论...`);
                await page.evaluate(() => window.scrollBy(0, 200));
                await page.waitForTimeout(1000);
            }

            replyContainer = await findCommentByFiber(page, replyToReplyId);
            if (replyContainer) break;
        }

        if (!replyContainer) {
            throw new Error(`未找到二级评论 ${replyToReplyId}（已尝试 ${maxRetries} 次）`);
        }

        // 查找并点击回复按钮（精确匹配，避免匹配到父级元素）
        const replyButtonHandle = await page.evaluateHandle((container) => {
            const allElements = container.querySelectorAll('*');

            for (const el of allElements) {
                // 只检查文本恰好是"回复"的元素
                if (el.textContent.trim() === '回复') {
                    // 确保这是最内层的"回复"元素
                    const hasReplyChild = Array.from(el.children).some(child =>
                        child.textContent.trim() === '回复'
                    );

                    if (!hasReplyChild) {
                        return el;
                    }
                }
            }
            return null;
        }, replyContainer);

        const replyButton = replyButtonHandle.asElement();
        if (!replyButton) {
            throw new Error('未找到二级评论的回复按钮');
        }

        // 使用 Playwright 的 click 方法
        await replyButton.click();

        // 等待输入框出现
        try {
            await page.waitForSelector('div[contenteditable="true"]', {
                state: 'visible',
                timeout: 3000
            });
            await page.waitForTimeout(300);  // 额外等待确保完全渲染
            logger.info('✅ 已点击三级回复按钮');
        } catch (e) {
            throw new Error('点击回复按钮后，输入框未出现');
        }
    }
}

/**
 * 通过多种方式查找评论容器（增强版）
 *
 * @param {Page} page - Playwright页面对象
 * @param {string} commentId - 评论ID (cid)
 * @returns {Promise<ElementHandle|null>}
 */
async function findCommentByFiber(page, commentId) {
    logger.info(`开始查找评论容器: ${commentId}`);

    // 方法1: React Fiber（主要方法）
    let container = await page.evaluateHandle((cid) => {
        const allElements = document.querySelectorAll('div, li, span, article, section');

        for (const el of allElements) {
            try {
                // 尝试多种 React 内部字段名
                const possibleKeys = [
                    '__reactFiber$',
                    '__reactFiber',
                    '__reactInternalInstance$',
                    '__reactInternalInstance',
                    '__reactProps$'
                ];

                let fiberKey = null;
                for (const prefix of possibleKeys) {
                    const key = Object.keys(el).find(k => k.startsWith(prefix));
                    if (key) {
                        fiberKey = key;
                        break;
                    }
                }

                if (!fiberKey) continue;

                let fiber = el[fiberKey];
                let depth = 0;

                // 增加遍历深度到50层
                while (fiber && depth < 50) {
                    const props = fiber.memoizedProps || fiber.pendingProps || fiber.props;

                    if (props) {
                        // ⭐ 优先检查 commentInfo 对象（抖音标准字段）
                        if (props.commentInfo && props.commentInfo.cid) {
                            if (String(props.commentInfo.cid) === String(cid)) {
                                console.log(`✅ [React Fiber commentInfo] 找到评论: ${cid} (depth=${depth})`);
                                return el;
                            }
                        }

                        // ⭐ 遍历所有对象类型的字段，查找包含 cid 的嵌套对象
                        for (const [key, value] of Object.entries(props)) {
                            if (value && typeof value === 'object' && !Array.isArray(value)) {
                                // 检查是否是评论对象（包含 cid 字段）
                                if (value.cid && String(value.cid) === String(cid)) {
                                    console.log(`✅ [React Fiber ${key}] 找到评论: ${cid} (depth=${depth})`);
                                    return el;
                                }
                            }
                        }

                        // 保留原有的直接字段检查（向后兼容）
                        const cidValue = props.cid || props.commentId ||
                                       props.id || props.comment_id ||
                                       props['data-cid'];

                        if (cidValue && String(cidValue) === String(cid)) {
                            console.log(`✅ [React Fiber direct] 找到评论: ${cid} (depth=${depth})`);
                            return el;
                        }
                    }

                    fiber = fiber.return;
                    depth++;
                }
            } catch (e) {
                // 继续
            }
        }

        console.log(`❌ [React Fiber] 未找到评论: ${cid}`);
        return null;
    }, commentId);

    let element = container ? container.asElement() : null;

    if (element) {
        logger.info(`✅ [方法1-Fiber] 找到评论容器: ${commentId}`);
        return element;
    }

    // 方法2: 通过 data-* 属性查找
    logger.info(`[方法1失败] 尝试方法2: data-cid 属性查找`);
    try {
        element = await page.$(`[data-cid="${commentId}"]`);
        if (element) {
            logger.info(`✅ [方法2-data-cid] 找到评论容器: ${commentId}`);
            return element;
        }
    } catch (e) {
        logger.debug(`方法2失败: ${e.message}`);
    }

    // 方法3: 通过 id 属性查找
    logger.info(`[方法2失败] 尝试方法3: id 属性查找`);
    try {
        element = await page.$(`#comment-${commentId}`);
        if (element) {
            logger.info(`✅ [方法3-id] 找到评论容器: ${commentId}`);
            return element;
        }
    } catch (e) {
        logger.debug(`方法3失败: ${e.message}`);
    }

    // 方法4: 深度 DOM 遍历查找（包含commentId的文本或属性）
    logger.info(`[方法3失败] 尝试方法4: 深度DOM遍历`);
    container = await page.evaluateHandle((cid) => {
        const allElements = document.querySelectorAll('*');

        for (const el of allElements) {
            try {
                // 检查所有属性
                for (const attr of el.attributes || []) {
                    if (attr.value && String(attr.value) === String(cid)) {
                        console.log(`✅ [DOM遍历] 通过属性 ${attr.name} 找到: ${cid}`);
                        return el;
                    }
                }

                // 检查 dataset
                if (el.dataset) {
                    for (const [key, value] of Object.entries(el.dataset)) {
                        if (String(value) === String(cid)) {
                            console.log(`✅ [DOM遍历] 通过 dataset.${key} 找到: ${cid}`);
                            return el;
                        }
                    }
                }
            } catch (e) {
                // 继续
            }
        }

        console.log(`❌ [DOM遍历] 未找到: ${cid}`);
        return null;
    }, commentId);

    element = container ? container.asElement() : null;

    if (element) {
        logger.info(`✅ [方法4-DOM遍历] 找到评论容器: ${commentId}`);
        return element;
    }

    // 所有方法都失败
    logger.error(`❌ 所有方法均失败，无法找到评论容器: ${commentId}`);

    // 记录调试信息
    await page.evaluate(() => {
        const firstComment = document.querySelector('[class*="comment"]');
        if (firstComment) {
            console.log('=== 调试信息：第一个评论元素 ===');
            console.log('标签:', firstComment.tagName);
            console.log('类名:', firstComment.className);
            console.log('属性:', Array.from(firstComment.attributes).map(a => `${a.name}="${a.value}"`));

            const reactKeys = Object.keys(firstComment).filter(k => k.includes('react'));
            console.log('React keys:', reactKeys);

            if (reactKeys.length > 0) {
                const key = reactKeys[0];
                const fiber = firstComment[key];
                if (fiber && fiber.memoizedProps) {
                    console.log('React props:', Object.keys(fiber.memoizedProps));
                }
            }
        }
    });

    return null;
}

/**
 * 输入评论内容
 *
 * @param {Page} page - Playwright页面对象
 * @param {string} content - 评论内容
 * @param {number} commentLevel - 评论层级
 */
async function typeReplyContent(page, content, commentLevel) {
    logger.info(`准备输入内容: "${content.substring(0, 30)}..."`);

    // 查找输入框
    let inputElement = null;

    if (commentLevel === 1) {
        // 一级评论：需要先点击评论区来激活输入框
        logger.info('查找并点击评论输入区域...');

        // 查找评论输入区域（"留下你的精彩评论吧"）
        const commentInputArea = await page.evaluateHandle(() => {
            // ⭐ 方法1：精确查找叶子节点（避免匹配到包含整个页面文本的父div）
            const allElements = Array.from(document.querySelectorAll('*'));
            for (const el of allElements) {
                const text = el.textContent?.trim() || '';
                // 必须是叶子节点且文本精确匹配
                if (text === '留下你的精彩评论吧' && el.children.length === 0) {
                    // 返回可点击的父元素
                    return el.parentElement || el;
                }
            }

            // 方法2：通过类名查找（抖音可能使用特定类名）
            const spans = Array.from(document.querySelectorAll('span'));
            for (const span of spans) {
                if (span.textContent?.trim() === '留下你的精彩评论吧') {
                    return span.parentElement || span;
                }
            }

            // 方法3：查找评论区容器
            const commentContainer = document.querySelector('[data-e2e="comment-list"]');
            if (commentContainer) {
                const parent = commentContainer.parentElement;
                if (parent) {
                    // 查找包含输入提示的元素
                    const inputHint = parent.querySelector('div');
                    if (inputHint && inputHint.textContent?.includes('精彩评论')) {
                        return inputHint;
                    }
                }
            }

            return null;
        });

        const inputArea = commentInputArea.asElement();
        if (inputArea) {
            await inputArea.click();
            logger.info('✅ 已点击评论输入区域');

            // ⭐ 使用 waitForSelector 等待输入框出现（而不是固定延时）
            try {
                await page.waitForSelector('div[contenteditable="true"]', {
                    state: 'visible',
                    timeout: 3000
                });
                logger.info('✅ 输入框已出现');
            } catch (err) {
                logger.error(`⚠️ 等待输入框超时: ${err.message}`);
            }
        } else {
            logger.warn('⚠️ 未找到评论输入区域，尝试直接查找输入框');
        }

        // 查找主输入框
        inputElement = await page.$('div[contenteditable="true"]');

        if (!inputElement) {
            // 备用查找：查找任意contenteditable输入框
            const allInputs = await page.$$('div[contenteditable="true"]');
            if (allInputs.length > 0) {
                inputElement = allInputs[0];
            }
        }
    } else {
        // 二级和三级回复：查找回复输入框
        // 策略：查找最后一个可见的 contenteditable 输入框（刚点击回复按钮后出现的）
        const inputs = await page.$$('div[contenteditable="true"]');

        // 过滤可见的输入框
        const visibleInputs = [];
        for (const input of inputs) {
            const isVisible = await page.evaluate(el => {
                return el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0;
            }, input);

            if (isVisible) {
                visibleInputs.push(input);
            }
        }

        // 使用最后一个可见的输入框（最新出现的回复输入框）
        if (visibleInputs.length > 0) {
            inputElement = visibleInputs[visibleInputs.length - 1];
        }
    }

    if (!inputElement) {
        throw new Error('未找到输入框');
    }

    const placeholder = await page.evaluate(el =>
        el.getAttribute('placeholder') || '(无placeholder)', inputElement
    );
    logger.info(`✅ 找到输入框 (placeholder: "${placeholder}")`);

    // 聚焦并清空
    await inputElement.click();
    await page.waitForTimeout(300);

    // 清空内容
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    // 逐字输入内容
    for (const char of content) {
        await page.keyboard.type(char, { delay: 50 });
        await page.waitForTimeout(30);
    }

    await page.waitForTimeout(500);
    logger.info('✅ 内容已输入');
}

/**
 * 点击发送按钮
 *
 * @param {Page} page - Playwright页面对象
 * @param {number} commentLevel - 评论层级
 */
async function clickSendButton(page, commentLevel) {
    logger.info('查找发送按钮...');

    // 方法1：视频详情页专用方法 - 查找输入框容器内的SVG发送按钮
    let sendButton = await page.evaluateHandle(() => {
        // 查找所有可见的输入框
        const inputs = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
        const visibleInputs = inputs.filter(el =>
            el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0
        );

        if (visibleInputs.length > 0) {
            // 使用最后一个可见输入框（最新的回复输入框）
            const lastInput = visibleInputs[visibleInputs.length - 1];

            // 向上查找包含按钮的容器
            let parent = lastInput.parentElement;
            while (parent && parent !== document.body) {
                // 查找 class 包含 zoGB2SZP 的容器（按钮容器）
                const buttonContainer = parent.querySelector('.zoGB2SZP');
                if (buttonContainer) {
                    // 查找 class 为 "WFB7wUOX NUzvFSPe" 的 SPAN（发送按钮）
                    const sendBtn = buttonContainer.querySelector('span.WFB7wUOX.NUzvFSPe');
                    if (sendBtn && sendBtn.offsetParent !== null) {
                        console.log('✅ [方法1-SVG按钮] 找到发送按钮');
                        return sendBtn;
                    }

                    // 备用：查找容器内最后一个可见的SPAN（包含SVG）
                    const spans = Array.from(buttonContainer.querySelectorAll('span'));
                    const visibleSpans = spans.filter(s =>
                        s.offsetParent !== null &&
                        s.querySelector('svg') &&
                        window.getComputedStyle(s).cursor === 'pointer'
                    );
                    if (visibleSpans.length > 0) {
                        console.log('✅ [方法1-最后SPAN] 找到发送按钮');
                        return visibleSpans[visibleSpans.length - 1];
                    }
                }
                parent = parent.parentElement;
            }
        }

        console.log('❌ [方法1] 未找到SVG发送按钮');
        return null;
    });

    let btnElement = sendButton ? sendButton.asElement() : null;

    // 方法2：创作者中心样式按钮
    if (!btnElement) {
        logger.info('SVG按钮未找到，尝试创作者中心样式...');
        sendButton = await page.evaluateHandle(() => {
            const sendBtnSelector = 'button.douyin-creator-interactive-button';
            const btns = Array.from(document.querySelectorAll(sendBtnSelector));

            for (const btn of btns) {
                const span = btn.querySelector('.douyin-creator-interactive-button-content');
                const text = (span && span.innerText) || btn.innerText || '';
                if ((text || '').trim() === '发送') {
                    console.log('✅ [方法2] 找到创作者中心按钮');
                    return btn;
                }
            }
            return null;
        });

        btnElement = sendButton ? sendButton.asElement() : null;
    }

    // 方法3：通用文本查找
    if (!btnElement) {
        logger.info('创作者中心按钮未找到，尝试通用文本查找...');
        sendButton = await page.evaluateHandle(() => {
            // 查找所有button标签
            const btns = Array.from(document.querySelectorAll('button'));
            for (const btn of btns) {
                const text = (btn.innerText || '').trim();
                if (text === '发送' && btn.offsetParent !== null) {
                    console.log('✅ [方法3-button] 找到发送按钮');
                    return btn;
                }
            }

            // 查找 div/span 发送按钮
            const els = Array.from(document.querySelectorAll('div, span'));
            for (const el of els) {
                const text = (el.innerText || '').trim();
                if (text === '发送' && el.offsetParent !== null) {
                    console.log('✅ [方法3-text] 找到发送按钮');
                    return el;
                }
            }

            console.log('❌ [方法3] 未找到文本发送按钮');
            return null;
        });

        btnElement = sendButton ? sendButton.asElement() : null;
    }

    if (!btnElement) {
        logger.error('❌ 所有方法均未找到发送按钮');
        throw new Error('未找到可用的发送按钮');
    }

    // 检查按钮状态
    const btnInfo = await page.evaluate((btn) => {
        return {
            disabled: btn.disabled,
            ariaDisabled: btn.getAttribute('aria-disabled'),
            tagName: btn.tagName,
            className: btn.className,
            text: btn.innerText?.trim()
        };
    }, btnElement);

    logger.info(`✅ 找到发送按钮: ${JSON.stringify(btnInfo)}`);

    // 滚动到可见区域
    await btnElement.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // 点击按钮
    try {
        await btnElement.click({ force: false });
        logger.info('✅ 已点击发送按钮（Playwright）');
    } catch (clickErr) {
        // 备用方案：JavaScript点击
        logger.warn(`⚠️ Playwright点击失败: ${clickErr.message}，尝试JavaScript点击`);
        const jsClicked = await page.evaluate((btn) => {
            try {
                btn.click();
                return true;
            } catch (e) {
                return false;
            }
        }, btnElement);

        if (jsClicked) {
            logger.info('✅ 已点击发送按钮（JavaScript）');
        } else {
            throw new Error('发送按钮点击失败');
        }
    }

    await page.waitForTimeout(300);
}

/**
 * 解析评论发布 API 响应
 * @param {Response} response - Playwright Response 对象
 * @returns {Promise<Object>} 返回 { success, data/error }
 */
async function parseAPIResponse(response) {
    const status = response.status();
    logger.info('✅ 收到API响应', { status, url: response.url() });

    // 获取响应体
    let responseBody;
    try {
        responseBody = await response.json();
    } catch (jsonError) {
        logger.error('解析响应失败', { error: jsonError.message });
        return {
            success: false,
            error: `解析响应失败: ${jsonError.message}`
        };
    }

    // 验证响应
    if (status === 200 && responseBody.status_code === 0) {
        const comment = responseBody.comment;

        if (comment && comment.status === 7) {
            logger.info('✅ API响应验证成功', {
                commentId: comment.cid,
                createTime: comment.create_time
            });

            return {
                success: true,
                data: {
                    commentId: comment.cid,
                    createTime: comment.create_time,
                    text: comment.text,
                    replyId: comment.reply_id,
                    replyToReplyId: comment.reply_to_reply_id,
                    responseBody: responseBody
                }
            };
        } else {
            logger.warn('评论状态异常', { status: comment?.status });
            return {
                success: false,
                error: `评论状态异常: ${comment?.status}`
            };
        }
    } else {
        logger.warn('API返回错误', {
            statusCode: responseBody.status_code,
            statusMsg: responseBody.status_msg
        });

        return {
            success: false,
            error: responseBody.status_msg || `API错误: ${responseBody.status_code}`
        };
    }
}

// ============================================================================
// API 拦截器 - 供 platform.js 注册使用
// ============================================================================

/**
 * API 拦截器：捕获视频详情页评论发布的 API 响应
 *
 * API 端点: https://www.douyin.com/aweme/v1/web/comment/publish
 *
 * 响应格式:
 * {
 *   "status_code": 0,
 *   "comment": {
 *     "cid": "7578755020364956451",
 *     "status": 7,
 *     "text": "测试API拦截-三级回复",
 *     "reply_id": "7545801600418300735",
 *     "reply_to_reply_id": "7546608049843897130",
 *     ...
 *   }
 * }
 *
 * @param {Object} body - 解析后的响应体
 * @param {Response} response - Playwright Response 对象
 */
async function onCommentPublishAPI(body, response) {
    const url = response.url();

    // 只处理评论发布接口
    if (!url.includes('/comment/publish')) {
        return;
    }

    // ✅ 从 page 对象读取账号上下文（账号级别隔离）
    const page = response.frame().page();
    const { accountId, dataManager } = page._accountContext || {};

    logger.info(`🔍 [API拦截器-视频详情页] 捕获到评论发布请求: ${url}, 账户: ${accountId || 'unknown'}`);

    // 检查响应结构
    if (!body || body.status_code === undefined) {
        logger.warn(`⚠️  [API] 评论发布响应无效，body keys: ${body ? Object.keys(body).join(', ') : 'null'}`);
        return;
    }

    const statusCode = body.status_code;
    const statusMsg = body.status_msg || '';
    const comment = body.comment;

    if (statusCode === 0 && comment) {
        // 成功发布
        const isSuccess = comment.status === 7; // status=7 表示已发布

        if (isSuccess) {
            logger.info(`✅ [API] 评论发布成功: cid=${comment.cid}, level=${getCommentLevel(comment)}`);
        } else {
            logger.warn(`⚠️  [API] 评论状态异常: cid=${comment.cid}, status=${comment.status}`);
        }

        // 记录评论数据（供 DataManager 或其他模块使用）
        const commentData = {
            timestamp: Date.now(),
            url,
            success: isSuccess,
            statusCode,
            statusMsg,
            commentId: comment.cid,
            commentLevel: getCommentLevel(comment),
            replyId: comment.reply_id,
            replyToReplyId: comment.reply_to_reply_id,
            text: comment.text,
            createTime: comment.create_time,
            data: body
        };

        // 可以在这里添加到全局存储或触发事件
        logger.debug(`[API] 评论数据:`, commentData);

        // ✅ 新增：同步新评论数据到 Master（通过 DataManager）
        if (isSuccess && dataManager) {
            try {
                // 提取请求参数（从 URL 或请求体）
                const request = response.request();
                const postData = request.postDataJSON();

                // ✅ 使用 dataManager 实例方法标准化数据
                // API 响应的 comment 对象中已包含完整的楼层关系（reply_id、reply_to_reply_id）
                // normalizeComment 会自动从中推断 parent_comment_id
                const newCommentData = dataManager.normalizePublishResponse(body, {
                    accountUserId: page._accountContext?.accountId,  // 传入账户 ID 用于验证
                    awemeId: postData?.aweme_id,  // 从请求参数中获取作品 ID
                });

                if (!newCommentData) {
                    logger.error(`❌ [API] [${accountId}] 标准化评论数据失败`);
                    return;
                }

                logger.info(`📤 [API] [${accountId}] 同步新评论到 Master: cid=${newCommentData.cid}, aweme_id=${newCommentData.aweme_id}`);

                // 使用 batchUpsertComments 同步到 Master
                await dataManager.batchUpsertComments([newCommentData]);

                logger.info(`✅ [API] [${accountId}] 新评论已同步到 Master`);
            } catch (syncError) {
                logger.error(`❌ [API] [${accountId}] 同步新评论失败:`, syncError);
            }
        } else if (!dataManager) {
            logger.warn(`⚠️  [API] [${accountId}] DataManager not available, skipping comment sync`);
        }

    } else if (statusCode !== 0) {
        // 发布失败
        logger.warn(`❌ [API] 评论发布失败: ${statusMsg} (status_code=${statusCode})`);
    }
}

/**
 * 辅助函数：根据 reply_id 和 reply_to_reply_id 判断评论层级
 */
function getCommentLevel(comment) {
    if (!comment.reply_id || comment.reply_id === '0') {
        return 1; // 一级评论
    }
    if (!comment.reply_to_reply_id || comment.reply_to_reply_id === '0') {
        return 2; // 二级回复
    }
    return 3; // 三级回复
}

/**
 * 检测是否出现验证弹窗
 *
 * @param {Page} page - Playwright页面对象
 * @returns {Promise<Object>} 返回 { detected: boolean, type: string, phoneNumber: string, message: string }
 */
async function detectVerification(page) {
    logger.info('🔍 检测验证弹窗...');

    try {
        // 等待一小段时间让弹窗出现
        await page.waitForTimeout(1500);

        // 检测验证弹窗
        const verificationInfo = await page.evaluate(() => {
            const bodyText = document.body.textContent || '';

            // 检测短信验证码弹窗
            const hasSMSVerification = bodyText.includes('接收短信验证码') ||
                                      bodyText.includes('为确保是本人操作抖音账号');

            // 检测扫码验证弹窗
            const hasQRVerification = bodyText.includes('使用原设备扫码');

            if (!hasSMSVerification && !hasQRVerification) {
                return { detected: false };
            }

            // 提取验证信息
            let phoneNumber = '';
            let message = '';

            // 提取手机号（格式：198******35）
            const phoneMatch = bodyText.match(/(\d{3}\*{6}\d{2})/);
            if (phoneMatch) {
                phoneNumber = phoneMatch[1];
            }

            // 提取完整的验证消息
            const allDivs = Array.from(document.querySelectorAll('div'));
            for (const div of allDivs) {
                const text = div.textContent?.trim() || '';
                if (text.includes('为确保是本人操作抖音账号')) {
                    message = text;
                    break;
                }
            }

            // 如果没有提取到消息，使用默认消息
            if (!message && hasSMSVerification) {
                message = phoneNumber
                    ? `为确保是本人操作抖音账号，请输入当前手机号${phoneNumber}收到的短信验证码`
                    : '为确保是本人操作抖音账号，请输入收到的短信验证码';
            }

            return {
                detected: true,
                type: hasSMSVerification ? 'sms' : 'qrcode',
                phoneNumber,
                message,
                hasSendSMSButton: bodyText.includes('获取验证码') || bodyText.includes('发送验证码'),
                hasQRCodeOption: hasQRVerification
            };
        });

        if (verificationInfo.detected) {
            logger.warn('⚠️ 检测到验证弹窗', {
                type: verificationInfo.type,
                phoneNumber: verificationInfo.phoneNumber,
                hasSendSMSButton: verificationInfo.hasSendSMSButton,
                hasQRCodeOption: verificationInfo.hasQRCodeOption
            });

            return verificationInfo;
        } else {
            logger.info('✅ 未检测到验证弹窗');
            return { detected: false };
        }

    } catch (error) {
        logger.error('验证检测失败', { error: error.message });
        return { detected: false, error: error.message };
    }
}

/**
 * 处理短信验证码流程
 * @param {Page} page - Playwright Page对象
 * @param {Function} requestSMSCodeCallback - 请求IM端输入验证码的回调函数
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function handleSMSVerification(page, requestSMSCodeCallback) {
    logger.info('📱 开始处理短信验证码流程...');

    try {
        // 先检查页面状态，输出调试信息
        const pageInfo = await page.evaluate(() => {
            const bodyText = document.body.textContent || '';
            const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], span'));
            const buttonTexts = allButtons.map(btn => btn.textContent?.trim()).filter(Boolean);

            return {
                hasVerificationText: bodyText.includes('为确保是本人操作') || bodyText.includes('验证'),
                hasSMSButton: buttonTexts.some(text => text.includes('获取验证码') || text.includes('发送验证码')),
                allButtonTexts: buttonTexts,
                bodyTextPreview: bodyText.substring(0, 300)
            };
        });

        logger.info('📋 当前页面状态检测:', {
            hasVerificationText: pageInfo.hasVerificationText,
            hasSMSButton: pageInfo.hasSMSButton,
            buttonCount: pageInfo.allButtonTexts.length,
            allButtons: pageInfo.allButtonTexts,
            bodyPreview: pageInfo.bodyTextPreview
        });

        // 0. 检查是否需要切换验证模式（从扫码模式切换到短信模式）
        logger.info('📍 [步骤0] 检查验证模式...');

        // 📸 截图1：验证弹窗初始状态
        const screenshotPath1 = `./debug_screenshots/verification_step0_${Date.now()}.png`;
        try {
            await page.screenshot({ path: screenshotPath1, fullPage: false });
            logger.info(`📸 截图已保存: ${screenshotPath1}`);
        } catch (screenshotErr) {
            logger.warn('截图失败:', screenshotErr.message);
        }

        // 先检测是否需要切换模式
        const modeSwitchInfo = await page.evaluate(() => {
            // 扩大查找范围：包括链接、按钮、span等所有可点击元素
            const elements = Array.from(document.querySelectorAll('a, button, div[role="button"], span, div'));

            // 检查是否有"接收短信验证码"相关文本的元素（表示当前在扫码模式）
            for (let i = 0; i < elements.length; i++) {
                const elem = elements[i];

                // 只获取当前元素的直接文本内容，避免包含子元素的文本
                let text = '';
                for (const node of elem.childNodes) {
                    if (node.nodeType === 3) { // TEXT_NODE = 3
                        text += node.textContent || '';
                    }
                }
                text = text.trim();

                // 如果文本完全匹配或包含"接收短信验证码"
                if (text === '接收短信验证码' || text.includes('接收短信验证') || text === '短信验证') {
                    // 检查元素是否可见和可点击
                    const rect = elem.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        // 返回元素信息（不要点击，留给Playwright原生点击）
                        return {
                            needSwitch: true,
                            buttonText: text,
                            tagName: elem.tagName,
                            className: elem.className,
                            elementIndex: i  // 记录元素索引
                        };
                    }
                }
            }

            return { needSwitch: false, buttonText: null };
        });

        logger.info('📋 模式切换检测结果:', modeSwitchInfo);

        if (modeSwitchInfo.needSwitch) {
            logger.info('🔄 检测到扫码模式，准备切换到短信验证模式...');
            logger.info(`📍 目标元素: <${modeSwitchInfo.tagName}>${modeSwitchInfo.buttonText}</${modeSwitchInfo.tagName}>`);

            // 使用 Playwright 原生点击（更接近真实用户行为）
            try {
                // 方法1: 尝试通过文本定位并点击
                const clickSuccess = await page.evaluate((buttonText) => {
                    const elements = Array.from(document.querySelectorAll('a, button, div[role="button"], span, div'));

                    for (const elem of elements) {
                        // 获取直接文本
                        let text = '';
                        for (const node of elem.childNodes) {
                            if (node.nodeType === 3) {
                                text += node.textContent || '';
                            }
                        }
                        text = text.trim();

                        if (text === buttonText || text.includes('接收短信验证')) {
                            const rect = elem.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                // 使用更真实的点击方式
                                const clickEvent = new MouseEvent('click', {
                                    view: window,
                                    bubbles: true,
                                    cancelable: true,
                                    clientX: rect.left + rect.width / 2,
                                    clientY: rect.top + rect.height / 2
                                });

                                // 先触发 mousedown
                                elem.dispatchEvent(new MouseEvent('mousedown', {
                                    view: window,
                                    bubbles: true,
                                    cancelable: true,
                                    clientX: rect.left + rect.width / 2,
                                    clientY: rect.top + rect.height / 2
                                }));

                                // 再触发 click
                                elem.dispatchEvent(clickEvent);

                                // 最后触发 mouseup
                                elem.dispatchEvent(new MouseEvent('mouseup', {
                                    view: window,
                                    bubbles: true,
                                    cancelable: true,
                                    clientX: rect.left + rect.width / 2,
                                    clientY: rect.top + rect.height / 2
                                }));

                                return true;
                            }
                        }
                    }
                    return false;
                }, modeSwitchInfo.buttonText);

                if (clickSuccess) {
                    logger.info('✅ 已触发点击事件');
                } else {
                    logger.warn('⚠️ 未能触发点击事件');
                }

                // 📸 截图2：点击后立即截图
                const screenshotPath2 = `./debug_screenshots/verification_step0_after_click_${Date.now()}.png`;
                try {
                    await page.waitForTimeout(200); // 等待200ms让页面更新
                    await page.screenshot({ path: screenshotPath2, fullPage: false });
                    logger.info(`📸 点击后截图已保存: ${screenshotPath2}`);
                } catch (screenshotErr) {
                    logger.warn('截图失败:', screenshotErr.message);
                }

                // 等待短信验证界面加载（增加等待时间到5秒，并等待特定元素出现）
                logger.info('⏳ 等待短信验证界面加载...');

                // 等待验证码输入框或发送按钮出现（最多等待5秒）
                let smsInterfaceAppeared = false;
                for (let i = 0; i < 10; i++) {
                    await page.waitForTimeout(500);

                    const hasInterface = await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span'));
                        const inputs = Array.from(document.querySelectorAll('input'));

                        // 检查是否有"获取验证码"或"发送验证码"按钮
                        const hasSendButton = buttons.some(btn => {
                            const text = btn.textContent?.trim() || '';
                            return text.includes('获取验证码') || text.includes('发送验证码') || text === '发送';
                        });

                        // 检查是否有验证码输入框（placeholder包含"验证码"）
                        const hasCodeInput = inputs.some(input => {
                            const placeholder = input.placeholder || '';
                            return placeholder.includes('验证码');
                        });

                        return hasSendButton || hasCodeInput;
                    });

                    if (hasInterface) {
                        smsInterfaceAppeared = true;
                        logger.info(`✅ 短信验证界面已加载 (耗时: ${(i + 1) * 500}ms)`);
                        break;
                    }
                }

                if (!smsInterfaceAppeared) {
                    logger.warn('⚠️ 等待超时，短信验证界面可能未加载成功');
                }

                // 📸 截图3：等待结束后的最终状态
                const screenshotPath3 = `./debug_screenshots/verification_step0_final_${Date.now()}.png`;
                try {
                    await page.screenshot({ path: screenshotPath3, fullPage: false });
                    logger.info(`📸 最终状态截图已保存: ${screenshotPath3}`);
                } catch (screenshotErr) {
                    logger.warn('截图失败:', screenshotErr.message);
                }

                // 检查页面状态
                const afterSwitchInfo = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span'));
                    const buttonTexts = buttons.map(btn => btn.textContent?.trim()).filter(Boolean);
                    const inputs = Array.from(document.querySelectorAll('input'));
                    const inputPlaceholders = inputs.map(input => input.placeholder || '').filter(Boolean);

                    return {
                        hasSendButton: buttonTexts.some(text => text.includes('获取验证码') || text.includes('发送验证码')),
                        hasCodeInput: inputPlaceholders.some(ph => ph.includes('验证码')),
                        allButtonTexts: buttonTexts.slice(0, 20),  // 只取前20个，避免日志过长
                        inputPlaceholders: inputPlaceholders
                    };
                });

                logger.info('📋 模式切换后的页面状态:', {
                    hasSendButton: afterSwitchInfo.hasSendButton,
                    hasCodeInput: afterSwitchInfo.hasCodeInput,
                    buttonCount: afterSwitchInfo.allButtonTexts.length,
                    inputCount: afterSwitchInfo.inputPlaceholders.length
                });

            } catch (clickError) {
                logger.error('❌ 点击"接收短信验证码"失败:', clickError.message);
                throw new Error(`模式切换失败: ${clickError.message}`);
            }
        } else {
            logger.info('✅ 已经是短信验证模式，无需切换');
        }

        // 1. 查找并点击"获取验证码"或"发送验证码"按钮
        logger.info('📍 [步骤1] 查找发送验证码按钮...');

        // 根据识别报告，按钮是 <p class="uc-ui-typography_description">获取验证码</p>
        // 位于 .uc-ui-input_right 容器内
        const sendButtonClicked = await page.evaluate(() => {
            // 查找所有可能的元素（p, div, span, button）
            const allElements = Array.from(document.querySelectorAll('p, div, span, button'));

            for (const elem of allElements) {
                // 只获取直接文本节点（避免获取到父元素的所有文本）
                let text = '';
                for (const node of elem.childNodes) {
                    if (node.nodeType === 3) { // Text node
                        text += node.textContent || '';
                    }
                }
                text = text.trim();

                // 精确匹配"获取验证码"
                if (text === '获取验证码' || text === '发送验证码') {
                    const rect = elem.getBoundingClientRect();

                    // 确保元素可见且在弹窗内（y坐标在200-500之间）
                    if (rect.width > 0 && rect.height > 0 && rect.y > 200 && rect.y < 500) {
                        // 使用完整的鼠标事件序列点击
                        const centerX = rect.left + rect.width / 2;
                        const centerY = rect.top + rect.height / 2;

                        elem.dispatchEvent(new MouseEvent('mousedown', {
                            view: window,
                            bubbles: true,
                            cancelable: true,
                            clientX: centerX,
                            clientY: centerY
                        }));

                        elem.dispatchEvent(new MouseEvent('click', {
                            view: window,
                            bubbles: true,
                            cancelable: true,
                            clientX: centerX,
                            clientY: centerY
                        }));

                        elem.dispatchEvent(new MouseEvent('mouseup', {
                            view: window,
                            bubbles: true,
                            cancelable: true,
                            clientX: centerX,
                            clientY: centerY
                        }));

                        return { success: true, buttonText: text, tagName: elem.tagName };
                    }
                }
            }

            return { success: false };
        });

        if (!sendButtonClicked.success) {
            logger.error('❌ 未找到发送验证码按钮！');
            logger.error('💡 失败原因: 未找到发送验证码按钮，可能不是短信验证');
            return { success: false, message: '未找到发送验证码按钮，可能不是短信验证' };
        }

        logger.info(`✅ 已点击发送验证码按钮 (${sendButtonClicked.tagName}: "${sendButtonClicked.buttonText}")`);
        await page.waitForTimeout(2000); // 等待短信发送

        // 2. 请求IM端用户输入验证码
        logger.info('📍 [步骤2] 请求IM端输入验证码...');
        const smsCode = await requestSMSCodeCallback();

        if (!smsCode || smsCode.length === 0) {
            logger.warn('⚠️ 用户未输入验证码或取消');
            return { success: false, message: '用户未输入验证码' };
        }

        logger.info('✅ 收到验证码', { codeLength: smsCode.length });

        // 3. 查找验证码输入框并填写
        logger.info('📍 [步骤3] 查找验证码输入框...');

        // 根据识别报告：<input type="number" placeholder="请输入验证码" maxlength="6">
        // 🔥 使用 Playwright 的 fill() 方法，自动处理 React 输入框
        try {
            // 先清空输入框
            await page.fill('input[placeholder*="验证码"]', '');

            // 使用 Playwright 的 type() 方法逐字符输入（模拟真实用户输入）
            await page.type('input[placeholder*="验证码"]', smsCode, { delay: 100 });

            logger.info(`✅ 验证码已填写 (使用 Playwright type 方法, code="${smsCode}")`);

            // 等待 React 状态更新
            await page.waitForTimeout(1000);

        } catch (fillError) {
            logger.error('❌ Playwright fill 失败，尝试手动方法:', fillError.message);

            // 回退方案：使用手动方法
            const inputFilled = await page.evaluate((code) => {
                const inputs = Array.from(document.querySelectorAll('input'));

                for (const input of inputs) {
                    const placeholder = input.getAttribute('placeholder') || '';
                    const rect = input.getBoundingClientRect();

                    if (placeholder.includes('验证码') &&
                        rect.width > 0 && rect.height > 0 &&
                        rect.y > 200 && rect.y < 500) {

                        // 使用原生 setter
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLInputElement.prototype,
                            'value'
                        ).set;

                        nativeInputValueSetter.call(input, code);

                        // 触发所有必要的事件
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        input.dispatchEvent(new Event('blur', { bubbles: true }));
                        input.focus();

                        return {
                            success: true,
                            type: input.getAttribute('type'),
                            valueAfterSet: input.value
                        };
                    }
                }

                return { success: false };
            }, smsCode);

            if (!inputFilled.success) {
                logger.error('❌ 未找到验证码输入框');
                return { success: false, message: '未找到验证码输入框' };
            }

            logger.info(`✅ 验证码已填写 (手动方法, value="${inputFilled.valueAfterSet}")`);
            await page.waitForTimeout(1000);
        }

        // 4. 查找并点击"验证"按钮（需要等待按钮从disabled变为enabled）
        logger.info('📍 [步骤4] 查找验证按钮并等待其变为可点击...');

        // 根据识别报告：
        // <div class="uc-ui-verify_sms-verify_button primary default uc-ui-button disabled">验证</div>
        // 初始状态是 disabled，cursor: not-allowed
        // 输入验证码后会变为 enabled，cursor: pointer

        // 主动等待按钮变为可点击状态（最多等待15秒）
        let buttonEnabled = false;
        for (let i = 0; i < 30; i++) {
            await page.waitForTimeout(500);

            const checkResult = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('div, button'));

                for (const btn of buttons) {
                    // 只获取直接文本节点
                    let text = '';
                    for (const node of btn.childNodes) {
                        if (node.nodeType === 3) {
                            text += node.textContent || '';
                        }
                    }
                    text = text.trim();

                    // 匹配"验证"按钮
                    if (text === '验证' || text === '确认' || text === '提交') {
                        const rect = btn.getBoundingClientRect();

                        // 确保在弹窗内可见
                        if (rect.width > 0 && rect.height > 0 && rect.y > 200 && rect.y < 500) {
                            const isDisabled = btn.classList.contains('disabled');
                            const cursor = window.getComputedStyle(btn).cursor;

                            return {
                                found: true,
                                text: text,
                                isDisabled: isDisabled,
                                cursor: cursor,
                                className: btn.className,
                                enabled: !isDisabled && cursor === 'pointer'
                            };
                        }
                    }
                }

                return { found: false };
            });

            if (checkResult.found) {
                if (checkResult.enabled) {
                    buttonEnabled = true;
                    logger.info(`✅ 验证按钮已变为可点击状态 (等待: ${(i + 1) * 500}ms)`);
                    break;
                } else if (i === 0) {
                    logger.info(`⏳ 验证按钮还是禁用状态，等待变为可点击...`);
                }
            } else if (i === 0) {
                logger.warn('⚠️ 未找到验证按钮');
                break;
            }
        }

        if (!buttonEnabled) {
            logger.error('❌ 验证按钮未变为可点击状态（超时15秒）');
            return { success: false, message: '验证按钮未变为可点击状态' };
        }

        // 点击验证按钮
        const verifyClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('div, button'));

            for (const btn of buttons) {
                let text = '';
                for (const node of btn.childNodes) {
                    if (node.nodeType === 3) {
                        text += node.textContent || '';
                    }
                }
                text = text.trim();

                if (text === '验证' || text === '确认' || text === '提交') {
                    const rect = btn.getBoundingClientRect();

                    if (rect.width > 0 && rect.height > 0 && rect.y > 200 && rect.y < 500) {
                        const isDisabled = btn.classList.contains('disabled');
                        const cursor = window.getComputedStyle(btn).cursor;

                        if (!isDisabled && cursor === 'pointer') {
                            btn.click();
                            return { success: true, text: text };
                        }
                    }
                }
            }

            return { success: false };
        });

        if (!verifyClicked.success) {
            logger.error('❌ 点击验证按钮失败');
            return { success: false, message: '点击验证按钮失败' };
        }

        logger.info(`✅ 已点击验证按钮 ("${verifyClicked.text}")`);
        await page.waitForTimeout(3000); // 等待验证处理

        // 5. 检查验证是否成功
        logger.info('📍 [步骤5] 检查验证结果...');
        const stillHasVerification = await page.evaluate(() => {
            const bodyText = document.body.textContent || '';
            return bodyText.includes('接收短信验证码') ||
                   bodyText.includes('为确保是本人操作抖音账号') ||
                   bodyText.includes('验证码错误') ||
                   bodyText.includes('验证失败');
        });

        if (stillHasVerification) {
            logger.warn('⚠️ 验证可能失败，弹窗仍然存在');
            return { success: false, message: '验证失败或验证码错误' };
        }

        logger.info('✅ 短信验证成功！');
        return { success: true };

    } catch (error) {
        logger.error('❌ 短信验证处理失败', { error: error.message });
        return { success: false, message: error.message };
    }
}

module.exports = {
    sendReplyToCommentVideoDetail,      // 主方法：UI 操作方式发送评论
    onCommentPublishAPI,                // API 拦截器，供 platform.js 注册
    detectVerification,                 // 验证检测函数，供外部调用
    handleSMSVerification,              // 短信验证码处理函数，供外部调用
};
