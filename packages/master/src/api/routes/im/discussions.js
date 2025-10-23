/**
 * IM Discussions API 路由
 * 提供讨论（二级评论）相关的 IM 兼容接口
 */

const express = require('express');
const DiscussionsDAO = require('../../../dao/DiscussionsDAO');
const DiscussionTransformer = require('../../transformers/discussion-transformer');
const ResponseWrapper = require('../../transformers/response-wrapper');

function createIMDiscussionsRouter(db) {
  const router = express.Router();
  const discussionsDAO = new DiscussionsDAO(db);

  /**
   * GET /api/im/discussions
   * 获取讨论列表
   */
  router.get('/', (req, res) => {
    try {
      const {
        cursor = 0,
        count = 20,
        platform,
        is_read,
        is_new,
        account_id,
        parent_comment_id,
        work_id,
      } = req.query;

      const offset = parseInt(cursor);
      const limit = parseInt(count);

      // 查询条件
      const options = {
        offset,
        limit: limit + 1, // 多查询一条用于判断 has_more
        platform,
        is_read: is_read !== undefined ? is_read === 'true' : undefined,
        is_new: is_new !== undefined ? is_new === 'true' : undefined,
      };

      // 查询讨论
      let discussions;
      if (parent_comment_id) {
        discussions = discussionsDAO.findByParentCommentId(parent_comment_id, options);
      } else if (work_id) {
        discussions = discussionsDAO.findByWorkId(work_id, options);
      } else if (account_id) {
        discussions = discussionsDAO.findByAccountId(account_id, options);
      } else {
        discussions = discussionsDAO.findAll(options);
      }

      // 判断是否有更多
      const hasMore = discussions.length > limit;
      if (hasMore) {
        discussions = discussions.slice(0, limit);
      }

      // 转换为 IM 格式
      const imDiscussions = DiscussionTransformer.toIMDiscussions(discussions);

      // 返回响应
      res.json(ResponseWrapper.success(
        { discussions: imDiscussions },
        {
          cursor: offset + discussions.length,
          has_more: hasMore,
        }
      ));
    } catch (error) {
      console.error('[IM Discussions API] 获取讨论列表失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * GET /api/im/discussions/:discussionId
   * 获取单个讨论
   */
  router.get('/:discussionId', (req, res) => {
    try {
      const { discussionId } = req.params;

      const discussion = discussionsDAO.findById(discussionId);

      if (!discussion) {
        return res.status(404).json(ResponseWrapper.error(404, '讨论不存在'));
      }

      const imDiscussion = DiscussionTransformer.toIMDiscussion(discussion);
      res.json(ResponseWrapper.success(imDiscussion));
    } catch (error) {
      console.error('[IM Discussions API] 获取讨论失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * POST /api/im/discussions
   * 创建讨论
   */
  router.post('/', (req, res) => {
    try {
      const discussionData = req.body;

      // 转换为 Master 格式
      const masterDiscussion = DiscussionTransformer.toMasterDiscussion(discussionData);

      // 创建讨论
      const createdDiscussion = discussionsDAO.create(masterDiscussion);

      // 转换为 IM 格式
      const imDiscussion = DiscussionTransformer.toIMDiscussion(createdDiscussion);

      res.json(ResponseWrapper.success(imDiscussion));
    } catch (error) {
      console.error('[IM Discussions API] 创建讨论失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * PUT /api/im/discussions/:discussionId
   * 更新讨论
   */
  router.put('/:discussionId', (req, res) => {
    try {
      const { discussionId } = req.params;
      const updates = req.body;

      // 检查讨论是否存在
      const existingDiscussion = discussionsDAO.findById(discussionId);
      if (!existingDiscussion) {
        return res.status(404).json(ResponseWrapper.error(404, '讨论不存在'));
      }

      // 转换更新数据
      const masterUpdates = DiscussionTransformer.toMasterDiscussion(updates);

      // 更新讨论
      const updatedDiscussion = discussionsDAO.update(discussionId, masterUpdates);

      // 转换为 IM 格式
      const imDiscussion = DiscussionTransformer.toIMDiscussion(updatedDiscussion);

      res.json(ResponseWrapper.success(imDiscussion));
    } catch (error) {
      console.error('[IM Discussions API] 更新讨论失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * PUT /api/im/discussions/:discussionId/read
   * 标记讨论为已读
   */
  router.put('/:discussionId/read', (req, res) => {
    try {
      const { discussionId } = req.params;

      // 检查讨论是否存在
      const existingDiscussion = discussionsDAO.findById(discussionId);
      if (!existingDiscussion) {
        return res.status(404).json(ResponseWrapper.error(404, '讨论不存在'));
      }

      // 标记为已读
      const updatedDiscussion = discussionsDAO.markAsRead(discussionId);

      // 转换为 IM 格式
      const imDiscussion = DiscussionTransformer.toIMDiscussion(updatedDiscussion);

      res.json(ResponseWrapper.success(imDiscussion));
    } catch (error) {
      console.error('[IM Discussions API] 标记讨论失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * DELETE /api/im/discussions/:discussionId
   * 删除讨论
   */
  router.delete('/:discussionId', (req, res) => {
    try {
      const { discussionId } = req.params;

      // 检查讨论是否存在
      const existingDiscussion = discussionsDAO.findById(discussionId);
      if (!existingDiscussion) {
        return res.status(404).json(ResponseWrapper.error(404, '讨论不存在'));
      }

      // 删除讨论
      const deleted = discussionsDAO.delete(discussionId);

      res.json(ResponseWrapper.success({ deleted }));
    } catch (error) {
      console.error('[IM Discussions API] 删除讨论失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * GET /api/im/comments/:commentId/discussions
   * 获取评论的所有讨论
   */
  router.get('/comments/:commentId/discussions', (req, res) => {
    try {
      const { commentId } = req.params;
      const {
        cursor = 0,
        count = 20,
        is_read,
        is_new,
      } = req.query;

      const offset = parseInt(cursor);
      const limit = parseInt(count);

      const options = {
        offset,
        limit: limit + 1,
        is_read: is_read !== undefined ? is_read === 'true' : undefined,
        is_new: is_new !== undefined ? is_new === 'true' : undefined,
      };

      // 查询评论的讨论
      const discussions = discussionsDAO.findByParentCommentId(commentId, options);

      // 判断是否有更多
      const hasMore = discussions.length > limit;
      if (hasMore) {
        discussions = discussions.slice(0, limit);
      }

      // 转换为 IM 格式
      const imDiscussions = DiscussionTransformer.toIMDiscussions(discussions);

      // 获取统计信息
      const stats = discussionsDAO.getCommentDiscussionStats(commentId);

      // 返回响应
      res.json(ResponseWrapper.success(
        {
          discussions: imDiscussions,
          stats: {
            total: stats.total || 0,
            new_count: stats.new_count || 0,
            unread_count: stats.unread_count || 0,
          },
        },
        {
          cursor: offset + discussions.length,
          has_more: hasMore,
        }
      ));
    } catch (error) {
      console.error('[IM Discussions API] 获取评论讨论失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  return router;
}

module.exports = createIMDiscussionsRouter;
