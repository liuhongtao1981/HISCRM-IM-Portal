/**
 * IM Discussions API 路由
 * 提供讨论（二级评论）相关的 IM 兼容接口
 */

const express = require('express');
const DiscussionsDAO = require('../../../dao/DiscussionsDAO');
const DiscussionTransformer = require('../../transformers/discussion-transformer');
const ResponseWrapper = require('../../transformers/response-wrapper');

/**
 * 创建 IM 讨论路由
 * @param {Database} db - SQLite数据库实例
 * @param {DataStore} dataStore - 内存数据存储（可选，用于高性能查询）
 * @returns {Router}
 */
function createIMDiscussionsRouter(db, dataStore = null) {
  const router = express.Router();
  const discussionsDAO = new DiscussionsDAO(db);

  /**
   * GET /api/im/discussions
   * 获取讨论列表（评论）
   * Query Parameters:
   * - account_id: 账户ID（必需）
   * - cursor: 分页游标
   * - count: 每页数量
   * - platform: 平台
   * - is_read: 是否已读
   * - is_new: 是否新评论
   * - parent_comment_id: 父评论ID（二级评论）
   * - content_id: 作品ID
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
        content_id,
      } = req.query;

      if (!account_id) {
        return res.status(400).json(ResponseWrapper.error(400, 'account_id is required'));
      }

      const offset = parseInt(cursor);
      const limit = parseInt(count);

      let discussions;

      // ✅ 优先从 DataStore 读取（内存，高性能）
      if (dataStore) {
        const filters = {
          offset,
          limit,
        };

        // 状态过滤
        if (is_new !== undefined) {
          filters.status = is_new === 'true' ? 'new' : 'read';
        }

        // 从 DataStore 获取评论（按 content_id 过滤）
        discussions = dataStore.getComments(account_id, content_id, filters);

        // 客户端过滤（DataStore 不支持的条件）
        if (platform) {
          discussions = discussions.filter((d) => d.platform === platform);
        }
        if (is_read !== undefined) {
          discussions = discussions.filter((d) => d.is_read === (is_read === 'true'));
        }
        if (parent_comment_id) {
          discussions = discussions.filter((d) => d.parent_comment_id === parent_comment_id);
        }

        console.log(`[IM Discussions API] Fetched ${discussions.length} discussions from DataStore for ${account_id}`);
      } else {
        // ⚠️ 降级到数据库查询（兼容性保留）
        const options = {
          offset,
          limit: limit + 1,
          platform,
          is_read: is_read !== undefined ? is_read === 'true' : undefined,
          is_new: is_new !== undefined ? is_new === 'true' : undefined,
        };

        if (parent_comment_id) {
          discussions = discussionsDAO.findByParentCommentId(parent_comment_id, options);
        } else if (content_id) {
          discussions = discussionsDAO.findByWorkId(content_id, options);
        } else {
          discussions = discussionsDAO.findByAccountId(account_id, options);
        }

        // 判断是否有更多
        const hasMore = discussions.length > limit;
        if (hasMore) {
          discussions = discussions.slice(0, limit);
        }

        console.log(`[IM Discussions API] Fetched ${discussions.length} discussions from database for ${account_id}`);
      }

      // 转换为 IM 格式
      const imDiscussions = DiscussionTransformer.toIMDiscussions(discussions);

      // 计算分页信息
      const hasMore = discussions.length >= limit;

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
   * Query Parameters:
   * - account_id: 账户ID（如果提供，优先从 DataStore 查询）
   */
  router.get('/:discussionId', (req, res) => {
    try {
      const { discussionId } = req.params;
      const { account_id } = req.query;

      let discussion;

      // ✅ 如果提供了 account_id，尝试从 DataStore 查询
      if (dataStore && account_id) {
        const accountData = dataStore.accounts.get(account_id);
        if (accountData) {
          discussion = accountData.data.comments.get(discussionId);
          console.log(`[IM Discussions API] Fetched discussion ${discussionId} from DataStore`);
        }
      }

      // ⚠️ 降级到数据库查询
      if (!discussion) {
        discussion = discussionsDAO.findById(discussionId);
        console.log(`[IM Discussions API] Fetched discussion ${discussionId} from database`);
      }

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
