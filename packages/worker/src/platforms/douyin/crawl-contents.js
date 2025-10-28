/**
 * 抖音作品爬虫
 *
 * 功能:
 * 1. 访问创作者中心作品列表页
 * 2. 虚拟列表滚动加载所有作品
 * 3. 提取作品详细信息 (标题、封面、统计数据等)
 * 4. API 拦截获取完整数据
 * 5. 支持多种作品类型 (video/image/article)
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { v4: uuidv4 } = require('uuid');

const logger = createLogger('crawl-contents', './logs');

// ==================== API 数据存储（模块级闭包）====================
const apiData = {
  worksList: [],      // 作品列表 API 响应
  workDetail: [],     // 作品详情 API 响应
  cache: new Set()    // URL 去重缓存
};

/**
 * 爬取抖音作品列表
 * @param {Object} page - Playwright Page 实例
 * @param {Object} account - 账户信息
 * @param {Object} options - 爬取选项
 * @returns {Promise<Object>} { contents, stats }
 */
async function crawlContents(page, account, options = {}) {
  const {
    maxWorks = 100,           // 最大作品数量
    includeTypes = ['video', 'image', 'article'],  // 包含的作品类型
  } = options;

  logger.info(`Starting contents crawl for account ${account.id}`);

  try {
    // 清空之前的 API 数据
    apiData.worksList = [];
    apiData.workDetail = [];
    apiData.cache.clear();
    logger.debug('已清空 API 数据存储');

    // 第 2 步: 导航到作品管理页面
    logger.debug('Step 2: Navigating to contents page');
    await page.goto('https://creator.douyin.com/creator-micro/content/manage', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    await page.waitForTimeout(2000);
    logger.info('Navigated to contents page');

    // 第 3 步: 点击"全部"标签，确保显示所有类型的作品
    await clickAllWorksTab(page);

    // 第 4 步: 滚动加载所有作品
    logger.debug('Step 4: Loading all contents via virtual list scrolling');
    const contents = await loadAllWorks(page, account, maxWorks);
    logger.info(`Loaded ${contents.length} contents from virtual list`);

    // 第 5 步: 从 API 响应中增强数据
    logger.debug('Step 5: Enhancing contents data from API responses');
    const enhancedWorks = enhanceWorksWithAPIData(contents, {
      worksList: apiData.worksList,
      workDetail: apiData.workDetail
    });
    logger.info(`Enhanced ${enhancedWorks.length} contents with API data`);

    // 第 6 步: 标准化数据格式
    logger.debug('Step 6: Standardizing contents data');
    const standardizedWorks = enhancedWorks.map(work => standardizeWorkData(work, account));

    // 第 7 步: 统计信息
    const stats = {
      totalWorks: standardizedWorks.length,
      byType: countWorksByType(standardizedWorks),
      crawlTime: Math.floor(Date.now() / 1000),
      apiResponseCounts: {
        worksList: apiData.worksList.length,
        workDetail: apiData.workDetail.length,
      }
    };

    logger.info('✅ Works crawl completed', stats);

    return {
      contents: standardizedWorks,
      stats
    };

  } catch (error) {
    logger.error('❌ FATAL ERROR in contents crawl:', error);
    throw error;
  }
}

// ==================== API 回调函数 ====================

/**
 * API 回调：作品列表
 * 由 platform.js 注册到 APIInterceptorManager
 */
async function onWorksListAPI(body, route) {
  if (!body || !body.aweme_list) return;

  const url = route.request().url();

  // URL 去重
  if (apiData.cache.has(url)) {
    return;
  }

  apiData.cache.add(url);
  apiData.worksList.push(body);

  logger.debug(`收集到作品列表: ${body.aweme_list.length} 个`);
}

/**
 * API 回调：作品详情
 * 由 platform.js 注册到 APIInterceptorManager
 */
async function onWorkDetailAPI(body) {
  if (!body) return;

  apiData.workDetail.push(body);
  logger.debug('收集到作品详情');
}

/**
 * 点击"全部"标签
 */
async function clickAllWorksTab(page) {
  try {
    logger.debug('Clicking "全部" tab');

    // 尝试点击"全部"标签
    const allTab = await page.locator('text=全部').first();
    const isVisible = await allTab.isVisible().catch(() => false);

    if (isVisible) {
      await allTab.click();
      await page.waitForTimeout(1000);
      logger.info('✅ Clicked "全部" tab');
      return true;
    }

    logger.debug('No "全部" tab found, might already be selected');
    return false;
  } catch (error) {
    logger.debug('Failed to click "全部" tab:', error.message);
    return false;
  }
}

/**
 * 通过虚拟列表滚动加载所有作品
 */
async function loadAllWorks(page, account, maxWorks) {
  logger.debug('Starting virtual list scrolling to load all contents');

  const contents = [];
  const MAX_ATTEMPTS = 50;
  const SCROLL_WAIT_TIME = 500;
  const CONVERGENCE_CHECK = 3;

  let previousCount = 0;
  let convergenceCounter = 0;
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS && contents.length < maxWorks) {
    try {
      // 第 1 步: 向下滚动虚拟列表
      logger.debug(`Attempt ${attempts + 1}: Scrolling to load more contents`);

      const scrollResult = await page.evaluate(() => {
        // 查找作品列表容器
        const container = document.querySelector('[class*="content-list"]') ||
                         document.querySelector('[class*="table"]') ||
                         document.querySelector('[role="table"]') ||
                         document.querySelector('.semi-table-body');

        if (container) {
          const previousScroll = container.scrollTop;
          container.scrollTop = container.scrollHeight;
          return { success: true, scrolled: container.scrollTop > previousScroll };
        }

        return { success: false };
      });

      if (!scrollResult.success) {
        logger.warn('Could not find contents list container');
      }

      // 第 2 步: 等待新作品加载
      await page.waitForTimeout(SCROLL_WAIT_TIME);

      // 第 3 步: 提取当前所有作品
      const currentWorks = await extractWorksFromPage(page, account);
      const currentCount = currentWorks.length;

      logger.debug(`Attempt ${attempts + 1}: Found ${currentCount} contents (previous: ${previousCount})`);

      // 第 4 步: 检查是否收敛
      if (currentCount === previousCount) {
        convergenceCounter++;
        logger.debug(`No new contents detected (${convergenceCounter}/${CONVERGENCE_CHECK})`);

        if (convergenceCounter >= CONVERGENCE_CHECK) {
          logger.info(`✅ Reached convergence. Total contents: ${currentCount}`);
          return currentWorks.slice(0, maxWorks);
        }
      } else {
        // 重置收敛计数器
        convergenceCounter = 0;
        previousCount = currentCount;
      }

      attempts++;
      await page.waitForTimeout(200);

    } catch (error) {
      logger.error(`Error during scrolling at attempt ${attempts}:`, error.message);
      attempts++;
      await page.waitForTimeout(500);
    }
  }

  // 获取最终作品列表
  const finalWorks = await extractWorksFromPage(page, account);
  logger.info(`✅ Scroll completed: ${finalWorks.length} contents loaded`);

  return finalWorks.slice(0, maxWorks);
}

/**
 * 从页面提取作品列表
 */
async function extractWorksFromPage(page, account) {
  logger.debug('Extracting contents from page');

  return await page.evaluate((accountInfo) => {
    const contents = [];

    // 方法 1: 尝试从 React Fiber 提取
    const allElements = document.querySelectorAll('[class*="content-item"], [role="row"], tr');

    allElements.forEach((element, index) => {
      try {
        // 从 React Fiber 提取数据
        const fiberKey = Object.keys(element).find(key => key.startsWith('__react'));
        if (!fiberKey) return;

        let current = element[fiberKey];
        let depth = 0;
        let found = false;

        // 递归查找作品数据
        while (current && depth < 15 && !found) {
          if (current.memoizedProps) {
            const props = current.memoizedProps;

            // 检查是否包含作品数据
            if (props.aweme_id || props.awemeId || props.item_id || props.video) {
              const workData = props.item || props.video || props.data || props;

              // 提取作品 ID
              const workId = workData.aweme_id || workData.awemeId || workData.item_id || `work_${index}`;

              if (workId && workId !== `work_${index}`) {
                const work = {
                  index,
                  platform_content_id: String(workId),
                  title: workData.title || workData.desc || '',
                  description: workData.description || workData.desc || '',
                  cover: workData.cover || workData.video?.cover?.url_list?.[0] || '',
                  url: workData.share_url || `https://www.douyin.com/video/${workId}`,
                  publish_time: workData.create_time || workData.createTime,

                  // 统计数据
                  stats_comment_count: workData.statistics?.comment_count || 0,
                  stats_like_count: workData.statistics?.digg_count || 0,
                  stats_share_count: workData.statistics?.stats_share_count || 0,
                  stats_view_count: workData.statistics?.play_count || 0,

                  // 作品类型
                  content_type: detectWorkType(workData),

                  // 来源标记
                  source: 'fiber',
                };

                contents.push(work);
                found = true;
              }
            }
          }

          current = current.child;
          depth++;
        }

        // 方法 2: 如果 Fiber 提取失败，尝试从 DOM 提取
        if (!found) {
          const domWork = extractFromDOM(element, index);
          if (domWork) {
            contents.push(domWork);
          }
        }

      } catch (e) {
        console.debug('Error extracting work from element:', e.message);
      }
    });

    // 去重
    const deduped = [];
    const seen = new Set();

    contents.forEach(work => {
      if (!seen.has(work.platform_content_id)) {
        seen.add(work.platform_content_id);
        deduped.push(work);
      }
    });

    console.debug(`Extracted ${deduped.length} contents from page`);
    return deduped;

    /**
     * 检测作品类型
     */
    function detectWorkType(workData) {
      if (workData.images && workData.images.length > 0) {
        return 'image';  // 图文作品
      } else if (workData.video || workData.aweme_type === 0) {
        return 'video';  // 视频作品
      } else if (workData.article_id) {
        return 'article';  // 文章作品
      }
      return 'video';  // 默认为视频
    }

    /**
     * 从 DOM 元素提取作品信息 (备用方案)
     */
    function extractFromDOM(element, index) {
      const text = element.textContent || '';
      if (text.length < 5) return null;

      // 尝试提取作品 ID (从 URL 或属性)
      const links = element.querySelectorAll('a[href*="/video/"]');
      let workId = null;

      for (const link of links) {
        const match = link.href.match(/\/video\/(\d+)/);
        if (match) {
          workId = match[1];
          break;
        }
      }

      if (!workId) return null;

      // 提取标题
      const titleElement = element.querySelector('[class*="title"]') || element.querySelector('span');
      const title = titleElement?.textContent?.trim() || '';

      // 提取封面
      const imgElement = element.querySelector('img');
      const cover = imgElement?.src || '';

      return {
        index,
        platform_content_id: workId,
        title,
        description: '',
        cover,
        url: `https://www.douyin.com/video/${workId}`,
        publish_time: null,
        stats_comment_count: 0,
        stats_like_count: 0,
        stats_share_count: 0,
        stats_view_count: 0,
        content_type: 'video',
        source: 'dom',
      };
    }

  }, { id: account.id });
}

/**
 * 使用 API 数据增强作品信息
 */
function enhanceWorksWithAPIData(contents, apiResponses) {
  logger.debug('Enhancing contents with API data');

  // 创建 API 数据映射 (按 aweme_id)
  const apiWorkMap = new Map();

  // 处理作品列表 API 响应
  apiResponses.worksList.forEach(response => {
    if (response.aweme_list && Array.isArray(response.aweme_list)) {
      response.aweme_list.forEach(aweme => {
        const id = aweme.aweme_id || aweme.item_id;
        if (id) {
          apiWorkMap.set(String(id), aweme);
        }
      });
    }
  });

  // 处理作品详情 API 响应
  apiResponses.workDetail.forEach(response => {
    if (response.aweme_detail) {
      const aweme = response.aweme_detail;
      const id = aweme.aweme_id || aweme.item_id;
      if (id) {
        apiWorkMap.set(String(id), aweme);
      }
    }
  });

  logger.debug(`API work map contains ${apiWorkMap.size} contents`);

  // 增强每个作品的数据
  const enhanced = contents.map(work => {
    const apiData = apiWorkMap.get(work.platform_content_id);

    if (apiData) {
      // 合并 API 数据 (API 优先)
      return {
        ...work,
        title: apiData.desc || work.title,
        description: apiData.desc || work.description,
        cover: apiData.video?.cover?.url_list?.[0] || work.cover,
        url: apiData.share_url || work.url,
        publish_time: apiData.create_time || work.publish_time,

        stats_comment_count: apiData.statistics?.comment_count || work.stats_comment_count,
        stats_like_count: apiData.statistics?.digg_count || work.stats_like_count,
        stats_share_count: apiData.statistics?.stats_share_count || work.stats_share_count,
        stats_view_count: apiData.statistics?.play_count || work.stats_view_count,

        content_type: detectWorkTypeFromAPI(apiData),
        source: 'api_enhanced',
      };
    }

    return work;
  });

  logger.info(`Enhanced ${enhanced.length} contents with API data`);
  return enhanced;

  /**
   * 从 API 数据检测作品类型
   */
  function detectWorkTypeFromAPI(apiData) {
    if (apiData.images && apiData.images.length > 0) {
      return 'image';
    } else if (apiData.video) {
      return 'video';
    } else if (apiData.article_id) {
      return 'article';
    }
    return 'video';
  }
}

/**
 * 标准化作品数据格式 (符合 contents 表结构)
 */
function standardizeWorkData(work, account) {
  // 处理 publish_time：确保转换为秒级时间戳
  let publishTime = work.publish_time || null;
  if (publishTime) {
    // 如果是 13 位毫秒级时间戳，转换为 10 位秒级
    if (String(publishTime).length === 13) {
      publishTime = Math.floor(publishTime / 1000);
      logger.debug(`Converted publish_time from milliseconds to seconds: ${work.publish_time} -> ${publishTime}`);
    }
  }

  return {
    id: uuidv4(),
    account_id: account.id,
    platform: 'douyin',
    platform_content_id: work.platform_content_id,
    platform_user_id: account.platform_user_id,

    content_type: work.content_type || 'video',
    title: work.title || '',
    description: work.description || '',
    cover: work.cover || '',
    url: work.url || '',
    publish_time: publishTime,

    stats_comment_count: work.stats_comment_count || 0,
    stats_new_comment_count: 0,
    stats_like_count: work.stats_like_count || 0,
    stats_share_count: work.stats_share_count || 0,
    stats_view_count: work.stats_view_count || 0,

    last_crawl_time: Math.floor(Date.now() / 1000),
    crawl_status: 'success',
    crawl_error: null,

    is_new: true,
    push_count: 0,

    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * 统计作品类型分布
 */
function countWorksByType(contents) {
  const counts = {
    video: 0,
    image: 0,
    article: 0,
    other: 0,
  };

  contents.forEach(work => {
    const type = work.content_type;
    if (counts.hasOwnProperty(type)) {
      counts[type]++;
    } else {
      counts.other++;
    }
  });

  return counts;
}

module.exports = {
  // API 回调函数（由 platform.js 注册）
  onWorksListAPI,
  onWorkDetailAPI,

  // 爬取函数
  crawlContents,

  // 工具函数（保留用于测试）
  extractWorksFromPage,
  enhanceWorksWithAPIData,
  standardizeWorkData,
};
