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
const { DataSource } = require('../base/data-models');

const logger = createLogger('crawl-contents', './logs');

// ==================== 全局状态（用于 API 回调）====================
// 由 platform.js initialize() 时设置
const globalContext = {
  dataManager: null,  // 当前活动的 DataManager
  accountId: null,    // 当前账户 ID
};

// 保留 apiData 用于向后兼容和调试
const apiData = {
  worksList: [],      // 作品列表 API 响应
  workDetail: [],     // 作品详情 API 响应
  cache: new Set()    // URL 去重缓存
};


// ==================== API 回调函数（从 page 对象读取账号上下文）====================

/**
 * ✨ API 回调：作品统计 API（推荐使用）
 * 由 platform.js 注册到 APIInterceptorManager
 * API: /janus/douyin/creator/pc/work_list
 * 返回格式: { aweme_list: [...], has_more, cursor, status_code }
 * 优势：数据更完整，一次性获取所有作品
 */
async function onWorksStatsAPI(body, response) {
  const url = response.url();

  // ✅ API 返回格式：aweme_list（作品信息） + items（统计信息含metrics）
  const awemeList = body?.aweme_list;
  const itemsList = body?.items;

  if (!body || !awemeList) {
    logger.warn(`⚠️ [作品统计API] body 或 aweme_list 不存在`);
    return;
  }

  logger.info(`📥 [作品统计API] 接收到 ${awemeList.length} 个作品信息${itemsList ? ` + ${itemsList.length} 个统计信息` : ''}`);

  // URL 去重
  if (apiData.cache.has(url)) {
    logger.debug(`🔄 [作品统计API] URL 已处理，跳过: ${url}`);
    return;
  }

  apiData.cache.add(url);

  // ✅ 从 page 对象读取账号上下文（账号级别隔离）
  const page = response.frame().page();
  const { accountId, dataManager } = page._accountContext || {};

  logger.debug(`🔍 [作品统计API] accountId=${accountId}, dataManager=${!!dataManager}, aweme_list=${awemeList.length}, items=${itemsList?.length || 0}`);

  // ✅ 如果有 items 统计数据，直接赋值 metrics 到 aweme_list 中
  // ⚠️ aweme_list 和 items 的顺序是一致的，直接用索引匹配
  if (itemsList && itemsList.length > 0) {
    let matchedCount = 0;
    const minLength = Math.min(awemeList.length, itemsList.length);

    for (let i = 0; i < minLength; i++) {
      const aweme = awemeList[i];
      const item = itemsList[i];

      if (item && item.metrics) {
        aweme.metrics = item.metrics;
        matchedCount++;
      }
    }

    logger.info(`✅ [作品统计API] 成功合并 ${matchedCount}/${awemeList.length} 个作品的统计信息（metrics）`);
  }

  // 使用账号级别隔离的 DataManager
  if (dataManager && awemeList.length > 0) {
    try {
      logger.debug(`⚙️ [作品统计API] 开始处理 ${awemeList.length} 个作品（含统计信息）`);
      const contents = dataManager.batchUpsertContents(
        awemeList,
        DataSource.API
      );
      logger.info(`✅ [API] [${accountId}] 作品统计: ${contents.length} 个 (原始: ${awemeList.length})`);
    } catch (error) {
      logger.error(`❌ [API] [${accountId}] 作品统计处理失败: ${error.message}`, error.stack);
    }
  } else {
    if (!dataManager) {
      logger.warn(`⚠️ [作品统计API] DataManager 不存在，无法处理作品`);
    }
    if (awemeList.length === 0) {
      logger.warn(`⚠️ [作品统计API] 作品数据为空`);
    }
  }

  // 保留旧逻辑用于调试
  apiData.worksList.push(body);
}

/**
 * API 回调：作品列表
 * 由 platform.js 注册到 APIInterceptorManager
 * API 返回格式: { item_info_list: [...], cursor, has_more, total_count, status_code }
 */
async function onWorksListAPI(body, response) {
  const url = response.url();

  // 检查 item_info_list
  if (!body || !body.item_info_list) {
    logger.warn(`⚠️ [作品API] body 或 item_info_list 不存在`);
    return;
  }

  logger.info(`📥 [作品API] 接收到 ${body.item_info_list.length} 个作品`);

  // URL 去重
  if (apiData.cache.has(url)) {
    logger.debug(`🔄 [作品API] URL 已处理，跳过: ${url}`);
    return;
  }

  apiData.cache.add(url);

  // ✅ 从 page 对象读取账号上下文（账号级别隔离）
  const page = response.frame().page();
  const { accountId, dataManager } = page._accountContext || {};

  logger.debug(`🔍 [作品API] accountId=${accountId}, dataManager=${!!dataManager}, count=${body.item_info_list.length}`);

  // 使用账号级别隔离的 DataManager
  if (dataManager && body.item_info_list.length > 0) {
    try {
      logger.debug(`⚙️ [作品API] 开始处理 ${body.item_info_list.length} 个作品`);
      const contents = dataManager.batchUpsertContents(
        body.item_info_list,
        DataSource.API
      );
      logger.info(`✅ [API] [${accountId}] 作品列表: ${contents.length} 个 (原始: ${body.item_info_list.length})`);
    } catch (error) {
      logger.error(`❌ [API] [${accountId}] 作品列表处理失败: ${error.message}`, error.stack);
    }
  } else {
    if (!dataManager) {
      logger.warn(`⚠️ [作品API] DataManager 不存在，无法处理作品`);
    }
    if (body.item_info_list.length === 0) {
      logger.warn(`⚠️ [作品API] item_info_list 为空数组`);
    }
  }

  // 保留旧逻辑用于调试
  apiData.worksList.push(body);
}

/**
 * API 回调：作品详情
 * 由 platform.js 注册到 APIInterceptorManager
 */
async function onWorkDetailAPI(body, response) {
  if (!body) return;

  // ✅ 从 page 对象读取账号上下文（账号级别隔离）
  const page = response.frame().page();
  const { accountId, dataManager } = page._accountContext || {};

  // 📊 作品ID日志（加密ID和数字ID对照）
  if (body.aweme_detail) {
    const aweme = body.aweme_detail;
    logger.info(`📊 [作品API] ID对照:`);
    logger.info(`  - 加密ID (item_id): ${aweme.item_id?.substring(0, 60)}...`);
    logger.info(`  - 数字ID (item_id_plain): ${aweme.item_id_plain}`);
    logger.info(`  - 数字ID (aweme_id): ${aweme.aweme_id}`);
    logger.info(`  - 标题: ${aweme.desc?.substring(0, 30)}...`);
  }

  // 使用账号级别隔离的 DataManager
  if (dataManager && body.aweme_detail) {
    try {
      const content = dataManager.upsertContent(
        body.aweme_detail,
        DataSource.API
      );
      logger.info(`✅ [API] [${accountId}] 作品详情 -> DataManager: ${content.contentId}`);
    } catch (error) {
      logger.error(`[API] [${accountId}] 作品详情处理失败:`, error);
    }
  }

  // 保留旧逻辑用于调试
  apiData.workDetail.push(body);
  logger.debug(`[${accountId || '?'}] 收集到作品详情`);
}



module.exports = {
  // API 回调函数（从 page._accountContext 读取账号信息）
  onWorksStatsAPI,    // ✨ 作品统计 API（推荐，数据最完整）
  onWorksListAPI,     // 作品列表 API
  onWorkDetailAPI,    // 作品详情 API（已废弃）
  // 全局上下文（供 platform.js 初始化时访问，已废弃，保留向后兼容）
  globalContext,
};
