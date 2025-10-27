/**
 * IM Works API 路由
 * 提供作品相关的 IM 兼容接口
 */

const express = require('express');
const ContentsDAO = require('../../../dao/ContentsDAO');
const WorkTransformer = require('../../transformers/work-transformer');
const ResponseWrapper = require('../../transformers/response-wrapper');

function createIMWorksRouter(db) {
  const router = express.Router();
  const contentsDAO = new ContentsDAO(db);

  /**
   * GET /api/im/contents
   * 获取作品列表
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

      const offset = parseInt(cursor);
      const limit = parseInt(count);

      // 查询条件
      const options = {
        offset,
        limit: limit + 1, // 多查询一条用于判断 has_more
        platform,
        content_type,
        is_new: is_new !== undefined ? is_new === 'true' : undefined,
      };

      // 查询作品
      let contents;
      if (account_id) {
        contents = contentsDAO.findByAccountId(account_id, options);
      } else {
        contents = contentsDAO.findAll(options);
      }

      // 判断是否有更多
      const hasMore = contents.length > limit;
      if (hasMore) {
        contents = contents.slice(0, limit);
      }

      // 转换为 IM 格式
      const imWorks = WorkTransformer.toIMWorks(contents);

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
   */
  router.get('/:workId', (req, res) => {
    try {
      const { workId } = req.params;

      const work = contentsDAO.findById(workId);

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
