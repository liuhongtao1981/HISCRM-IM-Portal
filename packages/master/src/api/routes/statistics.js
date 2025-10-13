/**
 * Statistics API Routes
 * T082: 统计数据查询端点
 */

const express = require('express');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const StatisticsService = require('../../services/statistics-service');

const logger = createLogger('statistics-api');

/**
 * 创建统计路由
 * @param {Database} db - SQLite 数据库实例
 * @returns {express.Router}
 */
function createStatisticsRouter(db) {
  const router = express.Router();
  const statisticsService = new StatisticsService(db);

  /**
   * GET /api/v1/statistics
   * 获取详细统计信息
   *
   * Query Parameters:
   * - account_id: 账户ID筛选
   * - start_time: 开始时间（Unix时间戳）
   * - end_time: 结束时间（Unix时间戳）
   * - group_by: 分组方式 (day | hour)
   * - days: 统计天数（用于group_by=day，默认7）
   * - include_hourly: 是否包含每小时统计（true | false）
   */
  router.get('/', async (req, res) => {
    try {
      const {
        account_id,
        start_time,
        end_time,
        group_by,
        days,
        include_hourly,
      } = req.query;

      const filters = {};
      if (account_id) filters.account_id = account_id;
      if (start_time) filters.start_time = parseInt(start_time, 10);
      if (end_time) filters.end_time = parseInt(end_time, 10);

      // 获取总体统计
      const overallStats = statisticsService.getOverallStatistics(filters);

      const result = {
        ...overallStats,
      };

      // 根据 group_by 添加分组统计
      if (group_by === 'day') {
        const daysNum = days ? parseInt(days, 10) : 7;
        result.daily_stats = statisticsService.getDailyStatistics({
          ...filters,
          days: daysNum,
        });
      }

      if (include_hourly === 'true') {
        result.hourly_stats = statisticsService.getHourlyStatistics(filters);
      }

      res.json({
        success: true,
        data: result,
      });

      logger.info('Statistics queried successfully');
    } catch (error) {
      logger.error('Failed to query statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to query statistics',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/statistics/summary
   * 获取简要统计信息
   */
  router.get('/summary', async (req, res) => {
    try {
      const summary = statisticsService.getSummary();

      res.json({
        success: true,
        data: summary,
      });

      logger.info('Summary statistics queried successfully');
    } catch (error) {
      logger.error('Failed to query summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to query summary',
        message: error.message,
      });
    }
  });

  return router;
}

module.exports = createStatisticsRouter;
