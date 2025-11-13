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

    // 排除列表接口（reply/list 是查询回复列表的接口，不是发送回复的接口）
    if (url.includes('/comment/reply/list')) {
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
 */
async function sendReplyToComment(page, options) {
    const { accountId, videoTitle, replyContent, commentId = null } = options;

    logger.info('[Douyin] 开始评论回复', {
        accountId,
        commentId: commentId || 'work',
        videoTitle: videoTitle?.substring(0, 50),
        contentLength: replyContent.length
    });

    try {
        // 清空之前的 API 数据
        apiData.replyResults = [];

        // 设置超时
        page.setDefaultTimeout(30000);

        // 1. 导航到评论管理页面
        await navigateToCommentPage(page);

        // 2. 选择视频（如果提供了标题）
        if (videoTitle) {
            await selectVideoByTitle(page, videoTitle);
        }

        // 3. 根据是否有 commentId 分别处理（完全分离两种场景）
        if (commentId) {
            // 场景A：回复某条评论（二级回复）
            await replyToComment(page, commentId, replyContent);
        } else {
            // 场景B：给作品发一级评论
            await replyToWork(page, replyContent);
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
// 场景A：回复某条评论（二级回复）
// 参考 tests/replyToCommentById.js 的 commentId 分支
// ============================================================================

/**
 * 回复某条评论（二级回复）
 * 参考测试脚本逻辑：找到容器 → 点击回复按钮 → 在容器内输入并发送
 */
async function replyToComment(page, commentId, text) {
    logger.info(`[回复评论] 开始回复评论 ${commentId}`);

    // 1. 找到评论容器
    let container = await findCommentContainerByDataAttrs(page, commentId);
    if (!container) {
        container = await findCommentContainerByReactFiber(page, commentId);
    }

    if (!container) {
        throw new Error(`未找到评论: ${commentId}`);
    }

    logger.info(`✅ 找到评论容器`);

    // 2. 点击容器内的回复按钮
    const clicked = await clickReplyInContainer(page, container);
    if (!clicked) {
        throw new Error('点击回复按钮失败');
    }

    logger.info('✅ 回复按钮已点击');

    // 3. 等待输入框出现
    await page.waitForTimeout(800);

    // 4. 在容器内输入并发送
    await typeAndSendInContainer(page, container, text);

    logger.info('✅ 评论回复发送成功');
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
    logger.debug('通过 React Fiber 查找评论');

    const container = await page.evaluateHandle((id) => {
        const candidates = document.querySelectorAll('div, li, span');
        const propsNames = ['cid', 'commentId', 'comment_id', 'platform_comment_id', 'id'];

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
                                if (props.comment && (props.comment.commentId || props.comment.id)) {
                                    if (String(props.comment.commentId || props.comment.id) === String(id)) {
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

    if (container && container.asElement) {
        logger.debug('通过 React Fiber 找到');
        return container.asElement();
    }

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
 */
async function typeAndSendInContainer(page, container, text) {
    logger.info(`⌨️  准备在容器内输入: "${text}"`);

    // 1. 在容器内找到输入框
    const inputHandle = await page.evaluateHandle((c) => {
        return c.querySelector('div[contenteditable="true"]') ||
               c.querySelector('.input-d24X73') ||
               c.querySelector('.input');
    }, container);

    const input = inputHandle && inputHandle.asElement ? inputHandle.asElement() : null;
    if (!input) {
        throw new Error('在容器内未找到输入框');
    }

    logger.info('✅ 在容器内找到输入框');

    // 2. 聚焦并输入
    await input.focus();
    await page.evaluate(el => { el.innerText = ''; }, input);
    await page.keyboard.type(text, { delay: 40 });

    logger.info('✅ 已输入内容');

    // 3. 等待发送按钮可用
    await page.waitForTimeout(500);

    // 4. 在容器内查找并点击发送按钮
    const sendSuccess = await clickSendInContainer(page, container);
    if (!sendSuccess) {
        throw new Error('点击发送按钮失败');
    }

    logger.info('✅ 发送按钮已点击');
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

            // 等待按钮可用
            const enabled = await page.waitForFunction((b) => {
                try {
                    if (!b) return false;
                    if (b.disabled) return false;
                    const ad = b.getAttribute && b.getAttribute('aria-disabled');
                    if (ad === 'true') return false;
                    const span = b.querySelector && b.querySelector('.douyin-creator-interactive-button-content');
                    const t = (span && span.innerText) || b.innerText || '';
                    return (t || '').trim() === '发送';
                } catch(e) { return false; }
            }, btnEl, { timeout: 8000 }).catch(() => false);

            if (enabled) {
                await btnEl.scrollIntoViewIfNeeded();
                await btnEl.click({ force: false });
                logger.info('✅ [Playwright] 点击了平台发送按钮');
                return true;
            }
        }
    } catch (e) {
        logger.debug('平台发送按钮查找失败，尝试通用方法');
    }

    // 2. Fallback: 等待并查找通用发送按钮
    const ok = await page.waitForFunction((c) => {
        const els = Array.from(c.querySelectorAll('button, div, span'));
        for (const e of els) {
            try {
                const t = (e.innerText || '').trim();
                if (t === '发送') {
                    if (e.disabled) continue;
                    if (e.getAttribute && e.getAttribute('aria-disabled') === 'true') continue;
                    return true;
                }
            } catch (err) {}
        }
        return false;
    }, container, { timeout: 8000 }).catch(() => false);

    if (ok) {
        const sendHandle = await page.evaluateHandle((c) => {
            const btns = Array.from(c.querySelectorAll('button'));
            for (const e of btns) {
                try {
                    const t = (e.innerText || '').trim();
                    if (t === '发送') {
                        if (e.disabled) continue;
                        if (e.getAttribute && e.getAttribute('aria-disabled') === 'true') continue;
                        return e;
                    }
                } catch (err) {}
            }
            const els = Array.from(c.querySelectorAll('div, span'));
            for (const e of els) {
                try {
                    const t = (e.innerText || '').trim();
                    if (t === '发送') {
                        if (e.getAttribute && e.getAttribute('aria-disabled') === 'true') continue;
                        return e;
                    }
                } catch (err) {}
            }
            return null;
        }, container);

        if (sendHandle) {
            const el = sendHandle.asElement();
            if (el) {
                try {
                    await el.scrollIntoViewIfNeeded();
                    await el.click({ force: false });
                    logger.info('✅ [Playwright] 点击了通用发送按钮');
                    return true;
                } catch(e) {
                    logger.debug('Playwright 点击失败，尝试 JS 点击');
                }
            }
        }
    }

    // 3. 最后的Fallback: Enter 键
    logger.warn('未找到发送按钮，尝试 Enter 键');
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
    const topInput = await findTopLevelWorkInput(page);
    if (!topInput) {
        throw new Error('未找到作品评论输入框');
    }

    logger.info('✅ 找到作品评论输入框');

    // 2. 聚焦并输入
    await topInput.focus();
    await page.evaluate(el => { el.innerText = ''; }, topInput);
    await page.keyboard.type(text, { delay: 40 });

    logger.info('✅ 已输入内容');

    // 3. 等待输入完成
    await page.waitForTimeout(500);

    // 4. 查找并点击全局发送按钮
    const sendSuccess = await clickGlobalSendButton(page);
    if (!sendSuccess) {
        throw new Error('点击发送按钮失败');
    }

    logger.info('✅ 作品评论发送成功');
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
        logger.info('🔍 开始查找全局发送按钮...');

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

            // 🔍 DEBUG: 查看页面上有哪些发送按钮
            const debugInfo = await page.evaluate(() => {
                const allButtons = Array.from(document.querySelectorAll('button'));
                const sendButtons = allButtons.filter(b => {
                    const text = (b.innerText || '').trim();
                    return text === '发送' || text.includes('发送');
                });

                return sendButtons.map(b => ({
                    text: b.innerText.trim(),
                    disabled: b.disabled,
                    ariaDisabled: b.getAttribute('aria-disabled'),
                    className: b.className
                }));
            });

            logger.warn('📋 页面上的发送按钮:', debugInfo);
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
