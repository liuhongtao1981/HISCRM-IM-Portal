/**
 * IM Works API 路由
 * 提供作品相关的 IM 兼容接口
 */

const express = require('express');
const ContentsDAO = require('../../../dao/ContentsDAO');
const WorkTransformer = require('../../transformers/work-transformer');
const ResponseWrapper = require('../../transformers/response-wrapper');

/**
 * 创建 IM 作品路由
 * @param {Database} db - SQLite数据库实例
 * @param {DataStore} dataStore - 内存数据存储（可选，用于高性能查询）
 * @returns {Router}
 */
function createIMWorksRouter(db, dataStore = null) {
  const router = express.Router();
  const contentsDAO = new ContentsDAO(db);

  /**
   * GET /api/im/contents
   * 获取作品列表
   * Query Parameters:
   * - account_id: 账户ID（必需）
   * - cursor: 分页游标
   * - count: 每页数量
   * - platform: 平台
   * - content_type: 作品类型
   * - is_new: 是否新作品
   */
  router.get('/', (req, res) => {
    try {
      const {
        cursor = 0,
        count = 20,
        platform,
        content_type,
        is_new,
        account_id,
      } = req.query;

      if (!account_id) {
        return res.status(400).json(ResponseWrapper.error(400, 'account_id is required'));
      }

      const offset = parseInt(cursor);
      const limit = parseInt(count);

      let contents;

      // ✅ 优先从 DataStore 读取（内存，高性能）
      if (dataStore) {
        const filters = {
          offset,
          limit,
        };

        // 类型过滤
        if (content_type) {
          filters.type = content_type;
        }

        // 状态过滤
        if (is_new !== undefined) {
          filters.status = is_new === 'true' ? 'new' : undefined;
        }

        contents = dataStore.getContents(account_id, filters);

        // 平台过滤（客户端过滤）
        if (platform) {
          contents = contents.filter((c) => c.platform === platform);
        }

        console.log(`[IM Works API] Fetched ${contents.length} contents from DataStore for ${account_id}`);
      } else {
        // ⚠️ 降级到数据库查询（兼容性保留）
        const options = {
          offset,
          limit: limit + 1,
          platform,
          content_type,
          is_new: is_new !== undefined ? is_new === 'true' : undefined,
        };

        contents = contentsDAO.findByAccountId(account_id, options);

        // 判断是否有更多
        const hasMore = contents.length > limit;
        if (hasMore) {
          contents = contents.slice(0, limit);
        }

        console.log(`[IM Works API] Fetched ${contents.length} contents from database for ${account_id}`);
      }

      // 转换为 IM 格式
      const imWorks = WorkTransformer.toIMWorks(contents);

      // 计算分页信息
      const hasMore = contents.length >= limit;

      // 返回响应
      res.json(ResponseWrapper.success(
        { contents: imWorks },
        {
          cursor: offset + contents.length,
          has_more: hasMore,
        }
      ));
    } catch (error) {
      console.error('[IM Works API] 获取作品列表失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * GET /api/im/contents/:workId
   * 获取单个作品
   * Query Parameters:
   * - account_id: 账户ID（如果提供，优先从 DataStore 查询）
   */
  router.get('/:workId', (req, res) => {
    try {
      const { workId } = req.params;
      const { account_id } = req.query;

      let work;

      // ✅ 如果提供了 account_id，尝试从 DataStore 查询
      if (dataStore && account_id) {
        work = dataStore.getContent(account_id, workId);
        console.log(`[IM Works API] Fetched content ${workId} from DataStore`);
      }

      // ⚠️ 降级到数据库查询
      if (!work) {
        work = contentsDAO.findById(workId);
        console.log(`[IM Works API] Fetched content ${workId} from database`);
      }

      if (!work) {
        return res.status(404).json(ResponseWrapper.error(404, '作品不存在'));
      }

      const imWork = WorkTransformer.toIMWork(work);
      res.json(ResponseWrapper.success(imWork));
    } catch (error) {
      console.error('[IM Works API] 获取作品失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * POST /api/im/contents
   * 创建作品
   */
  router.post('/', (req, res) => {
    try {
      const workData = req.body;

      // 转换为 Master 格式
      const masterWork = WorkTransformer.toMasterWork(workData);

      // 创建作品
      const createdWork = contentsDAO.create(masterWork);

      // 转换为 IM 格式
      const imWork = WorkTransformer.toIMWork(createdWork);

      res.json(ResponseWrapper.success(imWork));
    } catch (error) {
      console.error('[IM Works API] 创建作品失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * PUT /api/im/contents/:workId
   * 更新作品
   */
  router.put('/:workId', (req, res) => {
    try {
      const { workId } = req.params;
      const updates = req.body;

      // 检查作品是否存在
      const existingWork = contentsDAO.findById(workId);
      if (!existingWork) {
        return res.status(404).json(ResponseWrapper.error(404, '作品不存在'));
      }

      // 转换更新数据
      const masterUpdates = WorkTransformer.toMasterWork(updates);

      // 更新作品
      const updatedWork = contentsDAO.update(workId, masterUpdates);

      // 转换为 IM 格式
      const imWork = WorkTransformer.toIMWork(updatedWork);

      res.json(ResponseWrapper.success(imWork));
    } catch (error) {
      console.error('[IM Works API] 更新作品失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * PUT /api/im/contents/:workId/read
   * 标记作品为已读
   */
  router.put('/:workId/read', (req, res) => {
    try {
      const { workId } = req.params;

      // 检查作品是否存在
      const existingWork = contentsDAO.findById(workId);
      if (!existingWork) {
        return res.status(404).json(ResponseWrapper.error(404, '作品不存在'));
      }

      // 标记为已读
      const updatedWork = contentsDAO.markAsRead(workId);

      // 转换为 IM 格式
      const imWork = WorkTransformer.toIMWork(updatedWork);

      res.json(ResponseWrapper.success(imWork));
    } catch (error) {
      console.error('[IM Works API] 标记作品失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * DELETE /api/im/contents/:workId
   * 删除作品
   */
  router.delete('/:workId', (req, res) => {
    try {
      const { workId } = req.params;

      // 检查作品是否存在
      const existingWork = contentsDAO.findById(workId);
      if (!existingWork) {
        return res.status(404).json(ResponseWrapper.error(404, '作品不存在'));
      }

      // 删除作品
      const deleted = contentsDAO.delete(workId);

      res.json(ResponseWrapper.success({ deleted }));
    } catch (error) {
      console.error('[IM Works API] 删除作品失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * GET /api/im/contents/:workId/stats
   * 获取作品统计信息
   */
  router.get('/:workId/stats', (req, res) => {
    try {
      const { workId } = req.params;

      const work = contentsDAO.findById(workId);

      if (!work) {
        return res.status(404).json(ResponseWrapper.error(404, '作品不存在'));
      }

      const stats = {
        content_id: work.id,
        total_comments: work.stats_comment_count || 0,
        new_comments: work.stats_new_comment_count || 0,
        likes: work.stats_like_count || 0,
        shares: work.stats_share_count || 0,
        views: work.stats_view_count || 0,
      };

      res.json(ResponseWrapper.success(stats));
    } catch (error) {
      console.error('[IM Works API] 获取统计信息失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  return router;
}

module.exports = createIMWorksRouter;
