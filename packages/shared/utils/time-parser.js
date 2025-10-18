/**
 * Time Parser Utility
 * 时间解析工具 - 将平台相对时间格式转换为 Unix 时间戳
 *
 * Supports formats:
 * - "刚刚" (just now)
 * - "1分钟前" (1 minute ago)
 * - "2小时前" (2 hours ago)
 * - "昨天 14:30" (yesterday at 14:30)
 * - "2024-10-10 14:30" (absolute date and time)
 */

const { createLogger } = require('./logger');
const logger = createLogger('time-parser');

/**
 * Parse platform relative time text to Unix timestamp
 * 将平台相对时间文本转换为 Unix 时间戳
 *
 * @param {string} timeText - Platform time text (platform time format)
 * @returns {number|null} Unix timestamp (seconds), or null if cannot parse
 */
function parseRelativeTime(timeText) {
  if (!timeText) return null;

  const now = new Date();
  const nowTs = Math.floor(now.getTime() / 1000);
  const timeStr = timeText.toLowerCase().trim();

  // 刚刚 (just now)
  if (timeStr === '刚刚' || timeStr.includes('now')) {
    return nowTs;
  }

  // 分钟前 (X minutes ago)
  const minuteMatch = timeStr.match(/(\d+)分钟前/);
  if (minuteMatch) {
    return nowTs - parseInt(minuteMatch[1], 10) * 60;
  }

  // 小时前 (X hours ago)
  const hourMatch = timeStr.match(/(\d+)小时前/);
  if (hourMatch) {
    return nowTs - parseInt(hourMatch[1], 10) * 3600;
  }

  // 昨天 (yesterday) - if time specified in format "昨天 HH:MM", parse that; otherwise use 12 hours ago
  if (timeStr.includes('昨天')) {
    // Try to extract time from "昨天 HH:MM" format
    const timeMatch = timeStr.match(/昨天\s+(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const [, hour, minute] = timeMatch;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
      return Math.floor(yesterday.getTime() / 1000);
    }
    // If no time specified, return 24 hours ago
    return nowTs - 86400;
  }

  // 星期X格式 (Weekday format): 星期一、星期二...星期日
  // 计算该星期几距离现在有多远
  const weekDayMatch = timeStr.match(/星期([一二三四五六日])/);
  if (weekDayMatch) {
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const targetDay = weekDayMatch[1];
    const targetDayNum = weekDays.indexOf(targetDay);
    const currentDayNum = now.getDay();

    let daysAgo = (currentDayNum - targetDayNum + 7) % 7;
    if (daysAgo === 0) daysAgo = 7; // 如果是今天的星期几，则认为是上周的那天

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);
    targetDate.setHours(12, 0, 0, 0); // 设置为中午12点（一个合理的默认值）

    return Math.floor(targetDate.getTime() / 1000);
  }

  // MM-DD 格式 (Month-Day format): 10-14、10-12等
  const mdMatch = timeStr.match(/(\d{2})-(\d{2})/);
  if (mdMatch) {
    const [, month, day] = mdMatch;
    const targetDate = new Date(now.getFullYear(), parseInt(month, 10) - 1, parseInt(day, 10));

    // 如果目标日期在未来，则是去年的
    if (targetDate > now) {
      targetDate.setFullYear(targetDate.getFullYear() - 1);
    }

    targetDate.setHours(12, 0, 0, 0); // 设置为中午12点

    return Math.floor(targetDate.getTime() / 1000);
  }

  // 日期格式 (absolute date format): YYYY-MM-DD HH:MM or YYYY-MM-DD HH:MM:SS
  const dateMatch = timeStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (dateMatch) {
    const [, year, month, day, hour, minute, second] = dateMatch;
    const date = new Date(year, month - 1, day, hour, minute, second || 0);
    return Math.floor(date.getTime() / 1000);
  }

  // 如果无法解析，返回 null
  logger.debug(`Failed to parse relative time: ${timeText}`);
  return null;
}

/**
 * Parse any platform time format to Unix timestamp
 * 解析任何平台时间格式为 Unix 时间戳
 *
 * @param {string} timeText - Time text from platform
 * @param {number} fallbackTime - Fallback timestamp if parsing fails (optional)
 * @returns {number} Unix timestamp
 */
function parsePlatformTime(timeText, fallbackTime = null) {
  const parsed = parseRelativeTime(timeText);

  if (parsed !== null) {
    return parsed;
  }

  // Use fallback if provided, otherwise use current time
  if (fallbackTime !== null) {
    return fallbackTime;
  }

  return Math.floor(Date.now() / 1000);
}

module.exports = {
  parseRelativeTime,
  parsePlatformTime,
};
