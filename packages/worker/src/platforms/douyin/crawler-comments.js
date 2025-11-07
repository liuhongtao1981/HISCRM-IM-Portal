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

// ==================== API 回调函数 ====================

/**
 * API 回调：评论列表
 * 由 platform.js 注册到 APIInterceptorManager
 * 注意：真实 API 返回 comments 字段，不是 comment_info_list
 */
async function onCommentsListAPI(body, response) {
  // ✅ 修正：检查 comments 字段（真实 API 数据结构）
  if (!body || !body.comments || !Array.isArray(body.comments)) {
    logger.warn(`⚠️  [API] 评论列表响应无效（无 comments 字段），body keys: ${body ? Object.keys(body).join(', ') : 'null'}`);
    return;
  }

  const url = response.url();
  const itemId = extractItemId(url);
  const cursor = extractCursor(url);

  logger.info(`🎯 [API] 评论列表 API 触发：${body.comments.length} 条评论`);

  // ✅ 使用 DataManager（新架构）
  if (globalContext.dataManager && body.comments.length > 0) {
    const comments = globalContext.dataManager.batchUpsertComments(
      body.comments,
      DataSource.API
    );
    logger.info(`✅ [API] 评论列表 -> DataManager: ${comments.length} 条评论`);
  }

  // 保留旧逻辑（向后兼容）
  apiData.comments.push({
    timestamp: Date.now(),
    url: url,
    item_id: itemId,
    cursor: cursor,
    data: body,
  });

  logger.debug(`收集到评论: cursor=${cursor}, count=${body.comments.length}, has_more=${body.has_more}`);
}

/**
 * API 回调：回复列表（讨论）
 * 由 platform.js 注册到 APIInterceptorManager
 * 注意：真实 API 返回 comments 字段，不是 comment_info_list
 */
async function onDiscussionsListAPI(body, response) {
  // ✅ 修正：检查 comments 字段（真实 API 数据结构）
  if (!body || !body.comments || !Array.isArray(body.comments)) {
    logger.warn(`⚠️  [API] 讨论列表响应无效（无 comments 字段），body keys: ${body ? Object.keys(body).join(', ') : 'null'}`);
    return;
  }

  const url = response.url();
  const commentId = extractCommentId(url);
  const cursor = extractCursor(url);

  logger.info(`🎯 [API] 讨论列表 API 触发：${body.comments.length} 条讨论`);

  // ✅ 使用 DataManager（新架构）
  // 注意：讨论也作为评论存储，只是有 parent_comment_id 字段
  if (globalContext.dataManager && body.comments.length > 0) {
    const discussions = globalContext.dataManager.batchUpsertComments(
      body.comments,
      DataSource.API
    );
    logger.info(`✅ [API] 讨论列表 -> DataManager: ${discussions.length} 条讨论`);
  }

  // 保留旧逻辑（向后兼容）
  apiData.discussions.push({
    timestamp: Date.now(),
    url: url,
    comment_id: commentId,  // 父评论 ID
    cursor: cursor,
    data: body,
  });

  logger.debug(`收集到讨论: comment_id=${commentId}, count=${body.comments.length}, has_more=${body.has_more}`);
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
  // 注意：globalContext 已在 platform.initialize() 中统一设置
  // 这里再次设置是为了向后兼容（如果直接调用此函数而不通过 platform）
  if (dataManager) {
    globalContext.dataManager = dataManager;
    globalContext.accountId = account.id;
    logger.info(`✅ [DataManager] 已启用统一数据管理架构`);
  }

  try {
    logger.info(`Crawling comments for account ${account.id} (platform_user_id: ${account.platform_user_id})`);

    // 确保账号有 platform_user_id
    if (!account.platform_user_id) {
      throw new Error('Account missing platform_user_id - please login first to obtain douyin_id');
    }

    // 清空之前的 API 数据
    apiData.comments = [];
    apiData.discussions = [];
    logger.debug('已清空 API 数据存储');

    // API 拦截器已由 platform.js 在 initialize() 时统一注册
    // 不再需要在此处设置 page.on('response') 监听器
    logger.info('API 拦截器已全局启用（由 platform.js 管理）');

    // 🔍 临时诊断：监控所有网络请求（查找 item/list 或 work 相关请求）
    page.on('request', request => {
      const url = request.url();
      if (url.includes('item/list') || url.includes('work_list') || url.includes('/work')) {
        logger.info(`📡 [Network Request] ${request.method()} ${url}`);
        console.log(`[DEBUG Network] Request: ${url}`);
      }
    });

    page.on('response', async response => {
      const url = response.url();
      if (url.includes('item/list') || url.includes('work_list') || url.includes('/work')) {
        logger.info(`📥 [Network Response] ${response.status()} ${url}`);
        console.log(`[DEBUG Network] Response: ${response.status()} ${url}`);
      }
    });

    logger.info('🔍 网络请求监控已启用（监控 item/list 和 work 相关请求）');

    // 导航到评论管理页面
    await navigateToCommentManage(page);
    await page.waitForTimeout(3000);

    // 点击"选择作品"按钮打开模态框
    logger.info('Opening video selector modal');
    try {
      await page.click('span:has-text("选择作品")', { timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch (error) {
      logger.warn('Failed to open video selector, videos may already be visible');
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

    logger.info(`Found ${videoElements.length} video elements`);

    // 5. 筛选有评论的视频
    const videosToClick = videoElements.filter(v => parseInt(v.commentCountText) > 0);
    logger.info(`Videos with comments: ${videosToClick.length}`);

    // 🔍 DEBUG: 输出 videosToClick 数组的完整内容
    logger.info('\n🎬 Videos to Click (with comment counts):');
    videosToClick.forEach((v, i) => {
      logger.info(`   [${i}] Title: "${v.title.substring(0, 50)}${v.title.length > 50 ? '...' : ''}"`);
      logger.info(`       Comment Count Text: "${v.commentCountText}"`);
      logger.info(`       Index: ${v.index}\n`);
    });

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

    // 🔍 建立视频索引与 item_id 的映射
    // 策略：在点击每个视频时，记录新增的 API 响应的 item_id
    const videoIndexToItemId = {};  // { videoIndex: item_id }

    // 6. 逐个完整处理每个视频 (新策略)
    logger.info(`Processing ${maxToProcess} videos one by one (with scroll & reply buttons)`);
    for (let i = 0; i < maxToProcess; i++) {
      const video = videosToClick[i];
      logger.info(`[${i + 1}/${maxToProcess}] Processing: ${video.title.substring(0, 50)}...`);

      try {
        // 记录点击前的 API 响应数量
        const apiResponsesBeforeClick = apiData.comments.length;

        // 6.1 点击视频
        await page.evaluate((idx) => {
          const containers = document.querySelectorAll('.container-Lkxos9');
          if (idx < containers.length) {
            containers[idx].click();
          }
        }, video.index);

        logger.info(`  ✅ Video clicked, waiting for comments to load...`);
        await page.waitForTimeout(3000);

        // 🔍 新策略：API 请求在打开模态框时就已经发生了（点击之前）
        // 所以我们需要在这里建立映射：将当前视频索引与对应的 API 响应关联
        //
        // 关键观察：
        // - videosToClick 数组按照 DOM 顺序排列（index: 0, 1, 2...）
        // - apiData.comments 数组按照 API 请求顺序排列
        // - 假设：DOM 顺序 = API 请求顺序（需验证）
        //
        // 简单策略（适用于单视频场景）：
        // - 如果只有一个视频，直接将第一个 API 响应关联到第一个视频
        // - 如果有多个视频，按照索引顺序一一对应

        if (apiData.comments.length > i && apiData.comments[i].item_id) {
          const itemId = apiData.comments[i].item_id;
          videoIndexToItemId[video.index] = itemId;
          logger.info(`  📝 Mapped: video[${video.index}] "${video.title.substring(0, 30)}..." -> item_id: ${itemId.substring(0, 30)}...`);
        } else {
          logger.warn(`  ⚠️  No API response found for video[${i}]!`);
        }

        // 6.2 滚动加载所有评论
        logger.info(`  📜 Scrolling to load all comments...`);
        const scrollResult = await loadAllComments(page);
        logger.info(`  ✅ Scrolling complete (${scrollResult.scrollAttempts} attempts)`);

        // 6.3 点击所有"查看X条回复"按钮
        logger.info(`  🖱️  Clicking all reply buttons...`);
        const clickResult = await clickAllReplyButtons(page);
        logger.info(`  ✅ Clicked ${clickResult.clickedCount} reply buttons`);

        // 6.4 等待讨论API响应
        await page.waitForTimeout(2000);

        logger.info(`  ✅ Video processing complete\n`);

        // 重新打开模态框以便处理下一个视频
        if (i < maxToProcess - 1) {
          await page.click('span:has-text("选择作品")', { timeout: 5000 });
          await page.waitForTimeout(1000);
        }
      } catch (error) {
        logger.error(`Failed to process video ${i}: ${error.message}`);
      }
    }

    logger.info('Finished processing all videos, waiting for final API responses');
    await page.waitForTimeout(2000);

    // 7. 第二轮: 处理需要分页的视频 (has_more: true)
    logger.info('Checking for videos that need pagination...');

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
      logger.info(`Found ${videosNeedMore.length} videos that need pagination`);
      videosNeedMore.forEach(v => {
        logger.debug(`  - item_id: ${v.itemId.substring(0, 30)}... (loaded ${v.loadedCount}/${v.totalCount})`);
      });

      // 对于需要分页的视频，尝试加载更多评论
      for (const videoInfo of videosNeedMore) {
        logger.info(`Processing pagination for item_id: ${videoInfo.itemId.substring(0, 30)}...`);

        // 查找对应的视频元素
        const videoElement = videosToClick.find(v => {
          // 通过评论数量匹配（不完美，但可用）
          return parseInt(v.commentCountText) === videoInfo.totalCount;
        });

        if (!videoElement) {
          logger.warn(`  Could not find matching video element, skipping pagination`);
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

          logger.info(`  Clicked video, attempting to load more comments`);
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
          // DEBUG: 记录第一条评论的完整对象结构，找到真实的时间字段
          if (respIdx === 0 && cIdx === 0) {
            logger.info('\n╔════════════════════════════════════════════════════════════╗');
            logger.info('║  🔍 API Response Comment Object Diagnosis (First Comment)  ║');
            logger.info('╚════════════════════════════════════════════════════════════╝\n');

            logger.info(`📋 All keys (${Object.keys(c).length}):`, Object.keys(c).sort().join(', '));

            // 列出所有可能的时间相关字段
            logger.info('\n⏰ Time-related fields:');
            for (const [key, value] of Object.entries(c)) {
              if (key.toLowerCase().includes('time') ||
                  key.toLowerCase().includes('date') ||
                  key.toLowerCase().includes('create') ||
                  key.toLowerCase().includes('publish')) {
                const valueStr = String(value);
                const valueType = typeof value;
                logger.info(`   ${key}:`);
                logger.info(`      Type: ${valueType}`);
                logger.info(`      Value: ${valueStr}`);
                logger.info(`      Value length: ${valueStr.length}`);
                if (valueType === 'number') {
                  const asDate = new Date(value * 1000);
                  const asDateMs = new Date(value);
                  logger.info(`      As seconds (×1000): ${asDate.toLocaleString('zh-CN')}`);
                  logger.info(`      As milliseconds: ${asDateMs.toLocaleString('zh-CN')}`);
                }
                logger.info('');
              }
            }

            // 输出完整的第一条评论对象（前3000字符）
            logger.info('\n📝 Full comment object (first 3000 chars):');
            logger.info(JSON.stringify(c, null, 2).substring(0, 3000));
            logger.info('\n');
          }

          // 获取原始 create_time 值（可能是秒级或毫秒级）
          const rawCreateTime = c.create_time;
          let createTimeSeconds = parseInt(rawCreateTime);

          // 诊断: 打印原始值
          if (respIdx === 0 && cIdx === 0) {
            logger.info(`🔍 Create time debug:`);
            logger.info(`   Raw value: ${rawCreateTime} (type: ${typeof rawCreateTime})`);
            logger.info(`   As seconds: ${createTimeSeconds}`);
            logger.info(`   Formatted (as seconds): ${new Date(createTimeSeconds * 1000).toLocaleString('zh-CN')}`);

            // 检查是否为毫秒级（13位数字）
            if (createTimeSeconds > 9999999999) {
              logger.info(`   ⚠️  Detected milliseconds format, converting to seconds`);
              createTimeSeconds = Math.floor(createTimeSeconds / 1000);
              logger.info(`   After conversion: ${createTimeSeconds}`);
              logger.info(`   Formatted (corrected): ${new Date(createTimeSeconds * 1000).toLocaleString('zh-CN')}`);
            }
          }

          // 🔧 时区修正: 抖音API返回的时间戳是UTC+8时区的
          // 需要减去8小时（28800秒）转换为标准UTC时间戳
          const TIMEZONE_OFFSET = 8 * 3600; // 8小时 = 28800秒
          const utcTimestamp = createTimeSeconds - TIMEZONE_OFFSET;

          if (respIdx === 0 && cIdx === 0) {
            logger.info(`   🌐 Timezone correction:`);
            logger.info(`      Original (UTC+8): ${new Date(createTimeSeconds * 1000).toUTCString()}`);
            logger.info(`      Corrected (UTC): ${new Date(utcTimestamp * 1000).toUTCString()}`);
            logger.info(`      Display (UTC+8): ${new Date(utcTimestamp * 1000).toLocaleString('zh-CN')}`);
          }

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
      // 🔍 DEBUG: 输出匹配过程
      logger.info(`\n🔍 Matching video for item_id: ${itemId.substring(0, 30)}...`);
      logger.info(`   Total count from API: ${totalCount}`);

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
        aweme_id: itemId,  // 修正: 使用 aweme_id 而不是 item_id
        item_id: itemId,   // 保留 item_id 作为兼容字段
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
 * 按item_id分组API响应
 * @param {Array} responses - API响应数组
 * @returns {Object} 按item_id分组的响应
 */
function groupResponsesByItemId(responses) {
  const grouped = {};
  responses.forEach(resp => {
    if (resp.item_id) {
      if (!grouped[resp.item_id]) {
        grouped[resp.item_id] = [];
      }
      grouped[resp.item_id].push(resp);
    }
  });

  // 按cursor排序
  for (const itemId in grouped) {
    grouped[itemId].sort((a, b) => a.cursor - b.cursor);
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
  // API 回调函数（由 platform.js 注册）
  onCommentsListAPI,
  onDiscussionsListAPI,

  // 爬取函数
  crawlComments,

  // 全局上下文（供 platform.js 初始化时访问）
  globalContext,

  // 工具函数（保留用于测试）
  navigateToCommentManage,
  extractItemId,
  extractCursor,
  extractCommentId,
  groupResponsesByItemId,
  groupDiscussionsByCommentId,
  loadAllComments,
  clickAllReplyButtons,
};
