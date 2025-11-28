/**
 * 抖音评论爬虫 - crawl-comments.js
 *
 * 功能：爬取抖音创作者中心的评论数据（包括一级评论和二级/三级讨论）
 * 策略：导航到评论管理页面，点击视频选择器，拦截评论API获取数据
 *
 * 核心技术：
 * - API拦截：监听 /comment.*list/ 和 /comment.*reply/ API获取完整数据
 * - 点击+拦截策略：批量点击视频触发API请求
 * - 分页处理：自动滚动加载 has_more 为 true 的视频评论
 * - 讨论提取：同时提取二级/三级回复（discussions）
 * - 数据去重：通过 platform_comment_id / platform_discussion_id 去重
 *
 * 设计理念：
 * 评论和讨论是一体的，就像私信和会话一样
 * - Comments 是一级评论
 * - Discussions 是二级/三级回复（parent_comment_id 指向父评论）
 * - 一次爬取同时返回两者
 *
 * @module crawl-comments
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { DataSource } = require('../base/data-models');

const logger = createLogger('douyin-crawl-comments');

// ==================== 全局上下文（用于 API 回调）====================
const globalContext = {
  dataManager: null,
  accountId: null,
};

// ==================== API 数据存储（模块级闭包）====================
const apiData = {
  comments: [],      // 一级评论
  discussions: []    // 二级/三级回复（讨论）
};

// ==================== 数据统一转换函数 ====================

/**
 * 统一转换评论数据格式（只处理V2 API格式）
 * @param {Object} comment - V2 API原始评论数据
 * @param {Object} context - 上下文信息（aweme_id等）
 * @returns {Object} 统一格式的评论数据
 */
function normalizeCommentData(comment, context = {}) {
  return {
    // ✅ 评论ID：统一为字符串
    comment_id: String(comment.cid),
    cid: String(comment.cid),

    // ✅ 作品ID：V2自带aweme_id
    aweme_id: comment.aweme_id || context.aweme_id,

    // ✅ 父评论ID：从reply_id获取
    parent_comment_id: context.parent_comment_id || comment.reply_id || null,
    reply_id: comment.reply_id || null,
    reply_to_reply_id: comment.reply_to_reply_id || null,  // ⭐ 被回复的二级评论ID（三级回复时有值）

    // ⭐ 被回复用户信息（通知API提供，用于定位父评论）
    reply_to_username: comment.reply_to_username || null,  // 被回复用户昵称
    reply_to_userid: comment.reply_to_userid || null,  // 被回复用户ID

    // ✅ 评论内容
    text: comment.text,
    content: comment.text,

    // ✅ 时间戳：V2已经是数字
    create_time: comment.create_time,

    // ✅ 统计数据：V2已经是数字
    digg_count: comment.digg_count || 0,
    reply_count: comment.reply_comment_total || 0,

    // ✅ 用户信息：统一为user_info格式
    user_info: {
      user_id: comment.user.uid,
      uid: comment.user.uid,
      sec_uid: comment.user.sec_uid || null,  // ⭐ 加密用户ID，用于评论回复匹配
      screen_name: comment.user.nickname,
      nickname: comment.user.nickname,
      avatar_url: comment.user.avatar_thumb?.url_list?.[0] || null,
    },

    // ✅ 保留原始user对象
    user: comment.user,

    // ✅ 状态字段
    is_author: comment.label_text === '作者',
    user_digg: comment.user_digged === 1,
    user_digged: comment.user_digged,
    level: comment.level,
    status: comment.status,

    // ✅ V2独有字段
    image_list: comment.image_list || null,
    ip_label: comment.ip_label || null,

    // ⚠️ 保留原始数据（便于调试）
    _raw: comment,
    _api_version: 'v2',
  };
}

// ==================== API 回调函数（从 page 对象读取账号上下文）====================

/**
 * API 回调：评论列表
 * 由 platform.js 注册到 APIInterceptorManager
 * 注意：真实 API 返回 comments 字段
 */
async function onCommentsListV2API(body, response) {

    const url = response.url();
    const awemeId = extractAwemeId(url);
    const cursor = extractCursor(url);

    const comments = body?.comments;

    if (!body || !comments || !Array.isArray(comments)) {
        logger.warn(`⚠️  [API] 评论列表V2响应无效（无 comments 字段），url: ${url}，body keys: ${body ? Object.keys(body).join(', ') : 'null'}`);
        return;
    }

    logger.warn(`[API V2] 评论列表V2 comments.length: ${comments.length}, awemeId: ${awemeId}`);

    // 📊 V2 API数据样本日志
    if (comments.length > 0) {
        const sample = comments[0];
        logger.info(`📊 [V2 API 数据样本] 评论列表V2`);
        logger.info(`  - cid: ${sample.cid} (${typeof sample.cid})`);
        logger.info(`  - create_time: ${sample.create_time} (${typeof sample.create_time})`);
        logger.info(`  - digg_count: ${sample.digg_count} (${typeof sample.digg_count})`);
        logger.info(`  - reply_comment_total: ${sample.reply_comment_total} (${typeof sample.reply_comment_total})`);
        logger.info(`  - user.uid: ${sample.user?.uid} (${typeof sample.user?.uid})`);
        logger.info(`  - user.sec_uid: ${sample.user?.sec_uid || '❌ 无'}`);  // ⭐ 加密用户ID
        logger.info(`  - user.nickname: ${sample.user?.nickname} (${typeof sample.user?.nickname})`);
        logger.info(`  - aweme_id: ${sample.aweme_id} (${typeof sample.aweme_id})`);
        logger.info(`  - image_list: ${sample.image_list ? `✅ 有 (${sample.image_list.length}张)` : '❌ 无'}`);
        logger.info(`  - ip_label: ${sample.ip_label || '❌ 无'}`);
        logger.info(`  - 完整字段: ${Object.keys(sample).join(', ')}`);
    }

    // ✅ 从 page 对象读取账号上下文（账号级别隔离）
    const page = response.frame().page();
    const { accountId, dataManager } = page._accountContext || {};

    // 使用账号级别隔离的 DataManager
    if (dataManager && comments.length > 0) {
        // ✅ 使用统一转换函数：补充作品ID（V2 API数据中已包含aweme_id）
        const normalizedComments = comments.map(comment =>
            normalizeCommentData(comment, {
                aweme_id: comment.aweme_id || awemeId,  // ✅ 优先使用数据中的aweme_id
            })
        );

        const savedComments = dataManager.batchUpsertComments(
            normalizedComments,
            DataSource.API
        );
        logger.info(`[API] [${accountId}] 评论列表V2: ${savedComments.length} 条`);
    }

    // 保留旧逻辑（向后兼容）
    apiData.comments.push({
        timestamp: Date.now(),
        url: url,
        aweme_id: awemeId,  // ✅ 统一使用 aweme_id 作为作品 ID
        cursor: cursor,
        data: body,
    });
}


/**
 * API 回调：回复列表（讨论）
 * 由 platform.js 注册到 APIInterceptorManager
 * ⚠️  注意：真实 API 返回 comments 字段
 */
async function onDiscussionsListV2API(body, response) {

    const url = response.url();
    const commentId = extractCommentId(url);  // ✅ 从URL提取父评论ID
    const awemeId = extractAwemeId(url);  // ✅ 从URL提取作品ID
    const cursor = extractCursor(url);

    const comments = body?.comments;

    if (!body || !comments || !Array.isArray(comments)) {
        logger.warn(`⚠️  [API] 讨论列表V2响应无效（无 comments 字段），url: ${url}，body keys: ${body ? Object.keys(body).join(', ') : 'null'}`);
        return;
    }

    logger.warn(`[API V2] 讨论列表V2 comments.length: ${comments.length}, commentId: ${commentId?.substring(0, 20)}..., awemeId: ${awemeId}`);

    // 📊 V2 API数据样本日志
    if (comments.length > 0) {
        const sample = comments[0];
        logger.info(`📊 [V2 API 数据样本] 讨论列表V2`);
        logger.info(`  - cid: ${sample.cid} (${typeof sample.cid})`);
        logger.info(`  - create_time: ${sample.create_time} (${typeof sample.create_time})`);
        logger.info(`  - digg_count: ${sample.digg_count} (${typeof sample.digg_count})`);
        logger.info(`  - reply_comment_total: ${sample.reply_comment_total} (${typeof sample.reply_comment_total})`);
        logger.info(`  - user.uid: ${sample.user?.uid} (${typeof sample.user?.uid})`);
        logger.info(`  - user.sec_uid: ${sample.user?.sec_uid || '❌ 无'}`);  // ⭐ 加密用户ID
        logger.info(`  - user.nickname: ${sample.user?.nickname} (${typeof sample.user?.nickname})`);
        logger.info(`  - aweme_id: ${sample.aweme_id} (${typeof sample.aweme_id})`);
        logger.info(`  - reply_id: ${sample.reply_id || '❌ 缺失'}`);
        logger.info(`  - image_list: ${sample.image_list ? `✅ 有 (${sample.image_list.length}张)` : '❌ 无'}`);
        logger.info(`  - ip_label: ${sample.ip_label || '❌ 无'}`);
        logger.info(`  - 完整字段: ${Object.keys(sample).join(', ')}`);
    }



    // ✅ 从 page 对象读取账号上下文（账号级别隔离）
    const page = response.frame().page();
    const { accountId, dataManager } = page._accountContext || {};

    // 使用账号级别隔离的 DataManager
    if (dataManager && comments.length > 0) {
        // ✅ 使用统一转换函数：补充父评论ID和作品ID
        const normalizedComments = comments.map(comment =>
            normalizeCommentData(comment, {
                parent_comment_id: commentId,  // ✅ 补充父评论ID（从URL提取）
                aweme_id: comment.aweme_id || awemeId,  // ✅ 确保有作品ID（优先使用数据中的）
            })
        );

        const discussions = dataManager.batchUpsertComments(
            normalizedComments,
            DataSource.API
        );
        logger.info(`[API] [${accountId}] 讨论列表V2: ${discussions.length} 条`);
    }

    // 保留旧逻辑（向后兼容）
    apiData.discussions.push({
        timestamp: Date.now(),
        url: url,
        comment_id: commentId,  // ✅ V2 API: 父评论 ID，用于分组
        aweme_id: awemeId,      // ✅ V2 API 使用 aweme_id 而不是 comment_id
        cursor: cursor,
        data: body,
    });
}

/**
 * API 回调：通知详情（评论通知）
 * 由 platform.js 注册到 APIInterceptorManager
 * API: /aweme/v1/web/notice/detail/
 */
async function onNoticeDetailAPI(body, response) {
  if (!body || !body.notice_list_v2 || !Array.isArray(body.notice_list_v2)) {
    logger.warn(`⚠️  [API] 通知详情响应无效（无 notice_list_v2 字段），body keys: ${body ? Object.keys(body).join(', ') : 'null'}`);
    return;
  }

  const url = response.url();
  const notices = body.notice_list_v2;

  // 过滤评论类型的通知 (type === 31)
  const commentNotices = notices.filter(notice => notice.type === 31 && notice.comment);

  logger.info(`[API] 通知详情: 共 ${notices.length} 条通知，其中评论通知 ${commentNotices.length} 条`);

  if (commentNotices.length === 0) {
    return;
  }

  // 📊 V2 API数据样本日志
  if (commentNotices.length > 0) {
    const sample = commentNotices[0].comment?.comment;
    if (sample) {
      logger.info(`📊 [V2 API 数据样本] 通知详情`);
      logger.info(`  - cid: ${sample.cid} (${typeof sample.cid})`);
      logger.info(`  - text: ${sample.text?.substring(0, 30)}...`);
      logger.info(`  - user.uid: ${sample.user?.uid} (${typeof sample.user?.uid})`);
      logger.info(`  - user.sec_uid: ${sample.user?.sec_uid || '❌ 无'}`);  // ⭐ 加密用户ID
      logger.info(`  - user.nickname: ${sample.user?.nickname}`);
    }
  }

  // ✅ 从 page 对象读取账号上下文（账号级别隔离）
  const page = response.frame().page();
  const { accountId, dataManager } = page._accountContext || {};

  // 提取评论数据和作品数据
  const comments = [];
  const contents = [];

  for (const notice of commentNotices) {
    try {
      const commentData = notice.comment?.comment;
      const awemeData = notice.comment?.aweme;

      if (commentData) {
        // ✅ 使用统一转换函数：补充作品ID（从通知中提取）
        const normalizedComment = normalizeCommentData(commentData, {
          aweme_id: awemeData?.aweme_id,  // ✅ 从通知关联的作品中获取ID
        });
        comments.push(normalizedComment);
      }

      if (awemeData) {
        contents.push(awemeData);
      }
    } catch (error) {
      logger.error(`[API] 处理通知数据时出错：${error.message}`);
    }
  }

  // 使用账号级别隔离的 DataManager
  if (dataManager) {
    if (comments.length > 0) {
      const savedComments = dataManager.batchUpsertComments(
        comments,
        DataSource.API
      );
      logger.info(`[API] [${accountId}] 通知详情: ${savedComments.length} 条评论, ${contents.length} 条作品`);
    }

    if (contents.length > 0) {
      dataManager.batchUpsertContents(
        contents,
        DataSource.API
      );
    }
  }

  // 保留旧逻辑（向后兼容）
  apiData.comments.push({
    timestamp: Date.now(),
    url: url,
    source: 'notice_detail',
    data: body,
  });
}

/**
 * 爬取评论和讨论 - 使用"点击+拦截"策略
 * @param {Page} page - Playwright 页面对象
 * @param {Object} account - 账户对象
 * @param {Object} options - 爬取选项
 * @param {number} [options.maxVideos] - 最多爬取的作品数量（默认全部）
 * @param {boolean} [options.includeDiscussions=true] - 是否同时爬取讨论（二级/三级回复）
 * @param {Object} dataManager - DataManager 实例（可选，用于新架构）
 * @returns {Promise<Object>} { comments: Array, discussions: Array, contents: Array, stats: Object }
 */
async function crawlComments(page, account, options = {}, dataManager = null) {
  const { includeDiscussions = true } = options;
  const { maxVideos = null } = options;

  // 设置全局上下文
  if (dataManager) {
    globalContext.dataManager = dataManager;
    globalContext.accountId = account.id;
  }

  try {
    logger.info(`开始爬取评论 (账号 ${account.id})`);

    // 确保账号有 platform_user_id
    if (!account.platform_user_id) {
      throw new Error('Account missing platform_user_id - please login first to obtain douyin_id');
    }

    // 清空之前的 API 数据
    apiData.comments = [];
    apiData.discussions = [];

    // 导航到评论管理页面
    await navigateToCommentManage(page);
    await page.waitForTimeout(3000);

    // 点击"选择作品"按钮打开模态框
    try {
      await page.click('span:has-text("选择作品")', { timeout: 5000 });
      logger.info('✅ 已点击"选择作品"按钮，等待弹窗加载...');

      // 等待弹窗出现和视频容器加载
      try {
        await page.waitForSelector('.container-Lkxos9', { timeout: 5000, state: 'visible' });
        logger.info('✅ 视频容器已加载');
      } catch (waitError) {
        logger.warn(`⚠️  等待视频容器超时: ${waitError.message}`);
      }

      // 额外等待弹窗动画和内容渲染完成
      await page.waitForTimeout(2000);
    } catch (error) {
      logger.warn(`⚠️  无法打开作品选择器: ${error.message}`);
    }

    // ✅ 滚动加载所有作品
    logger.info('🔄 开始滚动加载作品列表...');
    const MAX_SCROLL_ATTEMPTS = 30;
    const SCROLL_WAIT_TIME = 500;
    const CONVERGENCE_CHECK = 3;
    let previousVideoCount = 0;
    let convergenceCounter = 0;
    let scrollAttempts = 0;

    while (scrollAttempts < MAX_SCROLL_ATTEMPTS) {
      // 滚动弹窗中的作品列表
      const scrollResult = await page.evaluate(() => {
        // 尝试查找包含视频列表的滚动容器
        // 方法1: 通过视频元素向上查找滚动容器（推荐）
        const firstVideo = document.querySelector('.container-Lkxos9');
        let scrollContainer = null;
        let containerInfo = null;

        if (firstVideo) {
          let parent = firstVideo.parentElement;
          let depth = 0;
          // 向上遍历10层，查找可滚动的容器
          while (parent && depth < 10) {
            const overflow = window.getComputedStyle(parent).overflow;
            const overflowY = window.getComputedStyle(parent).overflowY;
            if (overflow === 'auto' || overflow === 'scroll' || overflowY === 'auto' || overflowY === 'scroll') {
              scrollContainer = parent;
              containerInfo = {
                depth,
                className: parent.className,
                scrollHeight: parent.scrollHeight,
                clientHeight: parent.clientHeight
              };
              break;
            }
            parent = parent.parentElement;
            depth++;
          }
        }

        // 方法2: 备用选择器（如果方法1失败）
        if (!scrollContainer) {
          scrollContainer = document.querySelector('.semi-modal-content') ||
                          document.querySelector('.semi-modal-body') ||
                          document.querySelector('[role="dialog"]') ||
                          document.querySelector('[class*="Modal"]') ||
                          document.querySelector('[class*="modal"]');
          if (scrollContainer) {
            containerInfo = {
              method: 'fallback-selector',
              className: scrollContainer.className,
              scrollHeight: scrollContainer.scrollHeight,
              clientHeight: scrollContainer.clientHeight
            };
          }
        }

        if (!scrollContainer) {
          return { success: false, message: '未找到滚动容器' };
        }

        const container = scrollContainer;
        const previousScroll = container.scrollTop;
        container.scrollTop = container.scrollHeight;
        const videoCount = document.querySelectorAll('.container-Lkxos9').length;

        return {
          success: true,
          scrolled: container.scrollTop > previousScroll,
          videoCount: videoCount,
          containerInfo: containerInfo
        };
      });

      if (!scrollResult.success) {
        logger.warn(`⚠️  滚动失败: ${scrollResult.message}`);
        break;
      }

      // 首次找到容器时输出详细信息
      if (scrollAttempts === 0 && scrollResult.containerInfo) {
        const info = scrollResult.containerInfo;
        if (info.depth !== undefined) {
          logger.info(`✅ 找到滚动容器: ${info.className.substring(0, 50)} (深度: ${info.depth}, 高度: ${info.scrollHeight}px/${info.clientHeight}px)`);
        } else {
          logger.info(`✅ 找到滚动容器 (备用方法): ${info.className.substring(0, 50)}`);
        }
      }

      logger.debug(`📊 尝试 ${scrollAttempts + 1}: 发现 ${scrollResult.videoCount} 个作品 (上次: ${previousVideoCount})`);
      await page.waitForTimeout(SCROLL_WAIT_TIME);

      if (scrollResult.videoCount === previousVideoCount) {
        convergenceCounter++;
        if (convergenceCounter >= CONVERGENCE_CHECK) {
          logger.info(`✅ 滚动完成，共加载 ${scrollResult.videoCount} 个作品`);
          break;
        }
      } else {
        convergenceCounter = 0;
        previousVideoCount = scrollResult.videoCount;
      }

      scrollAttempts++;
      await page.waitForTimeout(200);
    }

    // 获取所有视频元素
    const videoElements = await page.evaluate(() => {
      const containers = document.querySelectorAll('.container-Lkxos9');
      const videos = [];

      containers.forEach((container, idx) => {
        const titleEl = container.querySelector('.title-LUOP3b');
        const commentCountEl = container.querySelector('.right-os7ZB9 > div:last-child');

        if (titleEl) {
          videos.push({
            index: idx,
            title: titleEl.innerText?.trim() || '',
            commentCountText: commentCountEl?.innerText?.trim() || '0',
          });
        }
      });

      return videos;
    });

    // 筛选有评论的视频
    const videosToClick = videoElements.filter(v => parseInt(v.commentCountText) > 0);
    logger.info(`找到 ${videosToClick.length}/${videoElements.length} 个有评论的作品`);

    if (videosToClick.length === 0) {
      logger.warn('No videos with comments found');
      return {
        comments: [],
        videos: [],
        stats: { recent_comments_count: 0, total_videos: 0, new_comments_count: 0 },
      };
    }

    // 限制处理的视频数量
    const maxToProcess = maxVideos ? Math.min(maxVideos, videosToClick.length) : videosToClick.length;

    // 建立视频索引与 item_id 的映射
    const videoIndexToItemId = {};

    // 逐个完整处理每个视频
    logger.info(`开始处理 ${maxToProcess} 个作品`);
    for (let i = 0; i < maxToProcess; i++) {
      const video = videosToClick[i];

      try {
        // 点击视频
        await page.evaluate((idx) => {
          const containers = document.querySelectorAll('.container-Lkxos9');
          if (idx < containers.length) {
            containers[idx].click();
          }
        }, video.index);

        await page.waitForTimeout(3000);

        // 建立映射
        if (apiData.comments.length > i && apiData.comments[i].aweme_id) {
          const awemeId = apiData.comments[i].aweme_id;
          videoIndexToItemId[video.index] = awemeId;
        }

        // 滚动加载所有评论
        const scrollResult = await loadAllComments(page);

        // 点击所有"查看X条回复"按钮
        const clickResult = await clickAllReplyButtons(page);

        // 等待讨论API响应
        await page.waitForTimeout(2000);

        // 重新打开模态框以便处理下一个视频
        if (i < maxToProcess - 1) {
          await page.click('span:has-text("选择作品")', { timeout: 5000 });
          await page.waitForTimeout(1000);
        }
      } catch (error) {
        logger.error(`处理第 ${i + 1} 个作品失败: ${error.message}`);
      }
    }

    await page.waitForTimeout(2000);

    // 按item_id分组当前已拦截的响应
    let currentResponsesByItemId = groupResponsesByItemId(apiData.comments);

    // 检查哪些视频需要加载更多
    const videosNeedMore = [];
    for (const [itemId, responses] of Object.entries(currentResponsesByItemId)) {
      const latestResponse = responses[responses.length - 1];
      if (latestResponse.data.has_more) {
        const totalCount = latestResponse.data.total_count || 0;
        // ✅ 修正：使用 comments 字段而不是 comment_info_list
        const loadedCount = responses.reduce((sum, r) => {
          const commentList = r.data.comments || r.data.comment_info_list || [];
          return sum + commentList.length;
        }, 0);
        videosNeedMore.push({
          itemId,
          totalCount,
          loadedCount,
          nextCursor: latestResponse.data.cursor,
        });
      }
    }

    if (videosNeedMore.length > 0) {
      logger.info(`需要分页处理 ${videosNeedMore.length} 个作品`);

      // 对于需要分页的视频，尝试加载更多评论
      for (const videoInfo of videosNeedMore) {

        // 查找对应的视频元素
        const videoElement = videosToClick.find(v => {
          // 通过评论数量匹配（不完美，但可用）
          return parseInt(v.commentCountText) === videoInfo.totalCount;
        });

        if (!videoElement) {
          continue;
        }

        try {
          // 重新打开模态框
          await page.click('span:has-text("选择作品")', { timeout: 5000 });
          await page.waitForTimeout(1000);

          // 点击该视频
          await page.evaluate((idx) => {
            const containers = document.querySelectorAll('.container-Lkxos9');
            if (idx < containers.length) {
              containers[idx].click();
            }
          }, videoElement.index);

          await page.waitForTimeout(2000);

          // 尝试滚动加载更多评论
          const beforeCount = apiData.comments.length;
          let scrollAttempts = 0;
          const maxScrolls = 10;

          while (scrollAttempts < maxScrolls) {
            // 查找并点击"加载更多"按钮或滚动到底部
            const hasLoadMore = await page.evaluate(() => {
              // 查找包含"加载更多"、"查看更多"等文本的按钮
              const buttons = Array.from(document.querySelectorAll('button, div[class*="load"], div[class*="more"]'));
              for (const btn of buttons) {
                const text = btn.innerText || '';
                if (text.includes('更多') || text.includes('加载')) {
                  btn.click();
                  return true;
                }
              }

              // 或者滚动评论列表到底部
              const commentContainer = document.querySelector('[class*="comment"]');
              if (commentContainer) {
                commentContainer.scrollTo(0, commentContainer.scrollHeight);
                return true;
              }

              return false;
            });

            if (hasLoadMore) {
              await page.waitForTimeout(2000);
              scrollAttempts++;

              // 检查是否有新的API响应
              if (apiData.comments.length > beforeCount) {
                logger.debug(`  Loaded more comments (attempt ${scrollAttempts}/${maxScrolls})`);
              }
            } else {
              logger.debug(`  No "load more" button found or unable to scroll`);
              break;
            }

            // 检查当前视频是否已加载完成
            const updatedResponses = groupResponsesByItemId(apiData.comments)[videoInfo.itemId] || [];
            // ✅ 修正：使用 comments 字段而不是 comment_info_list
            const currentLoaded = updatedResponses.reduce((sum, r) => {
              const commentList = r.data.comments || r.data.comment_info_list || [];
              return sum + commentList.length;
            }, 0);

            // 检查最新响应是否 has_more = false
            const latestResp = updatedResponses[updatedResponses.length - 1];
            if (!latestResp.data.has_more || currentLoaded >= videoInfo.totalCount) {
              logger.info(`  Finished loading all comments (${currentLoaded}/${videoInfo.totalCount})`);
              break;
            }
          }

        } catch (error) {
          logger.error(`  Failed to load more comments: ${error.message}`);
        }
      }

      logger.info('Pagination round completed, waiting for final API responses');
      await page.waitForTimeout(2000);
    } else {
      logger.info('No videos need pagination (all have has_more: false or ≤10 comments)');
    }

    // 8. 解析所有拦截到的评论和讨论
    logger.info(`Processing ${apiData.comments.length} comment APIs, ${apiData.discussions.length} discussion APIs`);

    // 按item_id分组评论响应
    const responsesByItemId = groupResponsesByItemId(apiData.comments);

    const allComments = [];
    const videosWithComments = [];

    for (const [itemId, responses] of Object.entries(responsesByItemId)) {
      const totalCount = responses[0].data.total_count || 0;
      const comments = [];

      // 合并所有分页的评论
      responses.forEach((resp, respIdx) => {
        // ✅ 修正：使用 comments 字段而不是 comment_info_list
        const commentList = resp.data.comments || resp.data.comment_info_list || [];
        commentList.forEach((c, cIdx) => {
          // 获取原始 create_time 值（可能是秒级或毫秒级）
          const rawCreateTime = c.create_time;
          let createTimeSeconds = parseInt(rawCreateTime);

          // 检查是否为毫秒级（13位数字）
          if (createTimeSeconds > 9999999999) {
            createTimeSeconds = Math.floor(createTimeSeconds / 1000);
          }

          // 时区修正: 抖音API返回的时间戳是UTC+8时区的
          const TIMEZONE_OFFSET = 8 * 3600;
          const utcTimestamp = createTimeSeconds - TIMEZONE_OFFSET;

          comments.push({
            platform_comment_id: c.comment_id,
            content: c.text,
            author_name: c.user_info?.screen_name || '匿名',
            author_id: c.user_info?.user_id || '',
            author_avatar: c.user_info?.avatar_url || '',
            create_time: utcTimestamp, // 使用修正后的UTC时间戳
            create_time_formatted: new Date(utcTimestamp * 1000).toLocaleString('zh-CN'),
            stats_like_count: parseInt(c.digg_count) || 0,
            reply_count: parseInt(c.reply_count) || 0,
            detected_at: Math.floor(Date.now() / 1000),
          });
        });
      });

      // 去重 (通过platform_comment_id)
      const uniqueComments = Array.from(
        new Map(comments.map(c => [c.platform_comment_id, c])).values()
      );

      // 匹配视频信息
      // 方案 1: 通过 videoIndexToItemId 映射查找（最可靠）
      let videoInfo = null;
      const videoIndex = Object.keys(videoIndexToItemId).find(
        idx => videoIndexToItemId[idx] === itemId
      );

      if (videoIndex !== undefined) {
        videoInfo = videosToClick.find(v => v.index === parseInt(videoIndex));
        if (videoInfo) {
          logger.info(`   ✅ Method 1 (Index Mapping): Found video[${videoIndex}] -> "${videoInfo.title}"`);
        }
      }

      // 方案 2: 如果映射失败，尝试通过评论数匹配（不可靠，作为备用）
      if (!videoInfo) {
        logger.info(`   ⚠️  Method 1 failed, trying Method 2 (Comment Count Matching)...`);
        videoInfo = videosToClick.find(v => {
          const match = v.commentCountText == totalCount.toString();
          logger.info(`   - "${v.title.substring(0, 30)}..." (count: "${v.commentCountText}") -> ${match ? '✅ MATCH' : '❌'}`);
          return match;
        });

        if (videoInfo) {
          logger.warn(`   ⚠️  Method 2 succeeded (but unreliable): "${videoInfo.title}"`);
        }
      }

      // 方案 3: 都失败了，使用默认值
      if (!videoInfo) {
        logger.warn(`   ❌ All methods failed! Using fallback: "未知作品"`);
        videoInfo = {
          title: '未知作品',
          index: -1,
        };
      }

      // 为评论添加视频信息
      uniqueComments.forEach(comment => {
        comment.post_title = videoInfo.title;
        comment.post_id = itemId; // 使用item_id作为post_id
      });

      allComments.push(...uniqueComments);

      videosWithComments.push({
        aweme_id: itemId,  // ✅ 统一使用 aweme_id 作为作品 ID
        title: videoInfo.title,
        total_count: totalCount,
        actual_count: uniqueComments.length,
        comment_count: uniqueComments.length,
      });

      logger.info(`Video "${videoInfo.title.substring(0, 30)}...": ${uniqueComments.length}/${totalCount} comments`);
    }

    logger.info(`Total: ${allComments.length} comments from ${videosWithComments.length} videos`);

    // 9. 解析讨论数据（二级/三级回复）
    const allDiscussions = [];
    if (includeDiscussions && apiData.discussions.length > 0) {
      logger.info(`Processing ${apiData.discussions.length} discussion API responses`);

      // 按 comment_id 分组讨论响应
      const discussionsByCommentId = groupDiscussionsByCommentId(apiData.discussions);

      for (const [parentCommentId, responses] of Object.entries(discussionsByCommentId)) {
        const discussions = [];

        // 合并所有分页的讨论
        responses.forEach((resp) => {
          // ✅ 修正：使用 comments 字段而不是 comment_info_list
          const replies = resp.data.comments || resp.data.comment_info_list || [];

          replies.forEach((reply) => {
            // 检查是否为毫秒级时间戳并转换
            let createTimeSeconds = parseInt(reply.create_time || reply.created_at);
            if (createTimeSeconds > 9999999999) {
              createTimeSeconds = Math.floor(createTimeSeconds / 1000);
            }

            // 🔧 时区修正: 抖音API返回的时间戳是UTC+8时区的
            const TIMEZONE_OFFSET = 8 * 3600; // 8小时 = 28800秒
            const utcTimestamp = createTimeSeconds - TIMEZONE_OFFSET;

            discussions.push({
              platform_discussion_id: reply.comment_id,  // 修正: 使用 comment_id
              parent_comment_id: parentCommentId,  // 父评论 ID
              content_id: reply.aweme_id || null,     // 作品 ID（如果有）
              content: reply.text || reply.content,
              author_name: reply.user_info?.screen_name || '匿名',
              author_id: reply.user_info?.user_id || '',
              author_avatar: reply.user_info?.avatar_url || '',
              create_time: utcTimestamp, // 使用修正后的UTC时间戳
              create_time_formatted: new Date(utcTimestamp * 1000).toLocaleString('zh-CN'),
              stats_like_count: parseInt(reply.digg_count) || 0,
              reply_count: parseInt(reply.reply_count) || 0,  // 三级回复数量
              detected_at: Math.floor(Date.now() / 1000),
            });
          });
        });

        // 去重 (通过platform_discussion_id)
        const uniqueDiscussions = Array.from(
          new Map(discussions.map(d => [d.platform_discussion_id, d])).values()
        );

        allDiscussions.push(...uniqueDiscussions);

        logger.debug(`Comment ${parentCommentId}: ${uniqueDiscussions.length} discussions`);
      }

      logger.info(`Total: ${allDiscussions.length} discussions for ${Object.keys(discussionsByCommentId).length} comments`);
    } else {
      logger.info('Discussions crawl disabled or no discussions found');
    }

    // 10. 构建统计数据
    const stats = {
      recent_comments_count: allComments.length,
      recent_discussions_count: allDiscussions.length,
      new_comments_count: allComments.length, // TODO: 实现增量更新
      total_videos: videoElements.length,
      processed_videos: videosWithComments.length,
      crawl_time: Math.floor(Date.now() / 1000),
    };

    // 添加 DataManager 统计
    if (dataManager) {
      const dmStats = dataManager.getStats();
      stats.dataManager = dmStats;
      logger.info(`✅ [DataManager] 统计:`, JSON.stringify(dmStats));
    }

    return {
      comments: allComments,
      discussions: allDiscussions,
      contents: videosWithComments,  // 重命名为 contents 以保持一致性
      stats,
    };
  } catch (error) {
    logger.error(`Failed to crawl comments for account ${account.id}:`, error);
    throw error;
  } finally {
    // 清理全局上下文
    globalContext.dataManager = null;
    globalContext.accountId = null;
    logger.debug('已清理全局 DataManager 上下文');
  }
}

/**
 * 导航到评论管理页面 (互动管理 - 评论管理)
 * @param {Page} page - Playwright页面对象
 */
async function navigateToCommentManage(page) {
  logger.info('Navigating to comment management page (互动管理 - 评论管理)');

  const currentUrl = page.url();

  // ⚠️ 强制刷新页面以清除缓存，确保 API 拦截器能捕获数据
  // 即使已经在评论管理页面，也要重新导航
  const needsRefresh = currentUrl.includes('/interactive/comment');
  if (needsRefresh) {
    logger.info('Already on comment management page, forcing refresh to clear cache');
    // 先跳转到空白页，清空缓存
    await page.goto('about:blank');
    await page.waitForTimeout(500);
  }

  // 如果不在创作者中心，先跳转
  if (!currentUrl.includes('creator.douyin.com')) {
    logger.info('Not on creator center, navigating first');
    await page.goto('https://creator.douyin.com/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(1000, 2000);
  }

  // 导航到评论管理页面
  // 路径: 互动管理 - 评论管理
  // URL: https://creator.douyin.com/creator-micro/interactive/comment
  try {
    await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    logger.info('Successfully navigated to comment management page');
    await page.waitForTimeout(2000);

    // 验证页面已加载
    const isCommentPage = page.url().includes('/interactive/comment');
    if (!isCommentPage) {
      throw new Error('Failed to navigate to comment management page');
    }
  } catch (error) {
    logger.error('Failed to navigate to comment management page:', error);
    throw error;
  }
}

/**
 * 从URL提取item_id参数
 * @param {string} url - API URL
 * @returns {string|null} item_id
 */
function extractItemId(url) {
  const match = url.match(/item_id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * 从URL提取cursor参数
 * @param {string} url - API URL
 * @returns {number} cursor值
 */
function extractCursor(url) {
  const match = url.match(/cursor=(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * 按aweme_id分组API响应
 * @param {Array} responses - API响应数组
 * @returns {Object} 按aweme_id分组的响应
 */
function groupResponsesByItemId(responses) {
  const grouped = {};
  responses.forEach(resp => {
    if (resp.aweme_id) {
      if (!grouped[resp.aweme_id]) {
        grouped[resp.aweme_id] = [];
      }
      grouped[resp.aweme_id].push(resp);
    }
  });

  // 按cursor排序
  for (const awemeId in grouped) {
    grouped[awemeId].sort((a, b) => a.cursor - b.cursor);
  }

  return grouped;
}

/**
 * 从URL提取comment_id参数（父评论ID）
 * @param {string} url - API URL
 * @returns {string|null} comment_id
 */
function extractCommentId(url) {
  const match = url.match(/comment_id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * 从 URL 中提取 aweme_id (作品ID)
 * @param {string} url - API URL
 * @returns {string|null} - aweme_id
 */
function extractAwemeId(url) {
  const match = url.match(/aweme_id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * 按comment_id分组讨论API响应
 * @param {Array} responses - 讨论API响应数组
 * @returns {Object} 按comment_id分组的响应
 */
function groupDiscussionsByCommentId(responses) {
  const grouped = {};
  responses.forEach(resp => {
    if (resp.comment_id) {
      if (!grouped[resp.comment_id]) {
        grouped[resp.comment_id] = [];
      }
      grouped[resp.comment_id].push(resp);
    }
  });

  // 按cursor排序
  for (const commentId in grouped) {
    grouped[commentId].sort((a, b) => a.cursor - b.cursor);
  }

  return grouped;
}

/**
 * 滚动加载所有评论
 * @param {Page} page - Playwright页面对象
 * @returns {Promise<Object>} { scrollAttempts: number }
 */
async function loadAllComments(page) {
  let scrollAttempts = 0;
  const maxScrolls = 10;

  while (scrollAttempts < maxScrolls) {
    // 滚动到底部
    const scrollResult = await page.evaluate(() => {
      // 优先使用 [role="tabpanel"] 选择器
      const tabpanel = document.querySelector('[role="tabpanel"]');

      if (tabpanel) {
        const beforeScroll = tabpanel.scrollTop;
        // 滚动到最底部
        tabpanel.scrollTop = tabpanel.scrollHeight;
        const afterScroll = tabpanel.scrollTop;

        return {
          scrolled: afterScroll > beforeScroll,
          scrollTop: afterScroll,
          scrollHeight: tabpanel.scrollHeight,
        };
      }

      return { scrolled: false };
    });

    logger.debug(`    Scroll attempt ${scrollAttempts + 1}: scrollTop=${scrollResult.scrollTop}, scrollHeight=${scrollResult.scrollHeight}`);

    // 检查是否出现"没有更多评论"
    const hasNoMoreText = await page.evaluate(() => {
      const allText = document.body.innerText;
      return allText.includes('没有更多评论');
    });

    if (hasNoMoreText) {
      logger.debug(`    ✅ Reached bottom: "没有更多评论" found`);
      break;
    }

    if (!scrollResult.scrolled) {
      // 无法继续滚动,可能已经到底
      logger.debug(`    ℹ️  Cannot scroll further, assuming reached bottom`);
      break;
    }

    await page.waitForTimeout(1500);
    scrollAttempts++;
  }

  return { scrollAttempts };
}

/**
 * 点击所有"查看X条回复"按钮
 * @param {Page} page - Playwright页面对象
 * @returns {Promise<Object>} { clickedCount: number, buttons: Array }
 */
async function clickAllReplyButtons(page) {
  // 查找所有回复按钮
  // 使用部分匹配选择器: [class*='load-more']
  const buttonTexts = await page.evaluate(() => {
    const results = [];

    // 使用部分匹配选择器 (更灵活)
    const loadMoreButtons = document.querySelectorAll('[class*="load-more"]');

    loadMoreButtons.forEach(el => {
      const text = (el.textContent || '').trim();
      const match = text.match(/^查看(\d+)条回复$/);

      if (match && el.offsetParent !== null) {
        results.push({
          text,
          replyCount: parseInt(match[1]),
        });
      }
    });

    return results;
  });

  logger.debug(`    Found ${buttonTexts.length} reply buttons`);

  let clickedCount = 0;

  // 依次点击每个按钮
  for (let i = 0; i < buttonTexts.length; i++) {
    const btnInfo = buttonTexts[i];

    try {
      // 使用部分匹配选择器+索引定位元素
      const clicked = await page.evaluate((index) => {
        const buttons = document.querySelectorAll('[class*="load-more"]');
        const target = buttons[index];

        if (target && target.offsetParent !== null) {
          target.click();
          return true;
        }
        return false;
      }, i);

      if (clicked) {
        clickedCount++;
        logger.debug(`      [${clickedCount}/${buttonTexts.length}] Clicked "${btnInfo.text}"`);
        await page.waitForTimeout(1500); // 等待展开动画
      }
    } catch (error) {
      logger.warn(`      Failed to click button "${btnInfo.text}": ${error.message}`);
    }
  }

  return {
    clickedCount,
    buttons: buttonTexts,
  };
}

module.exports = {
  // API 回调函数（只使用V2 API）
  onCommentsListV2API,
  onDiscussionsListV2API,
  onNoticeDetailAPI,

  // 爬取函数
  crawlComments,

  // 全局上下文（供 platform.js 初始化时访问，已废弃，保留向后兼容）
  globalContext,

  // 工具函数（保留用于测试）
  navigateToCommentManage,
  extractItemId,
  extractCursor,
  extractCommentId,
  extractAwemeId,  // ✅ 新增：提取作品ID
  groupResponsesByItemId,
  groupDiscussionsByCommentId,
  loadAllComments,
  clickAllReplyButtons,
};
