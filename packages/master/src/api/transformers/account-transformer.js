/**
 * 账户数据转换器
 * Master 格式 ↔ IM 格式
 */

class AccountTransformer {
  /**
   * Master 账户 → IM 用户格式
   * @param {Object} masterAccount - Master 账户对象
   * @returns {Object} IM 用户格式
   */
  static toIMUser(masterAccount) {
    return {
      user_id: masterAccount.account_id || masterAccount.platform_user_id || masterAccount.id,
      user_name: masterAccount.account_name || masterAccount.platform_username || masterAccount.username || '未知用户',
      avatar: masterAccount.avatar || masterAccount.avatar_url || 'https://via.placeholder.com/150',
      signature: masterAccount.signature || '',
      verified: masterAccount.verified === 1 || masterAccount.verified === true,
      follower_count: masterAccount.total_followers || masterAccount.follower_count || 0,
      following_count: masterAccount.total_following || masterAccount.following_count || 0,
      status: this.mapStatus(masterAccount.status),
      platform: masterAccount.platform || 'douyin',
      // 时间戳转换：秒 → 毫秒
      created_at: this.convertTimestamp(masterAccount.created_at),
      updated_at: this.convertTimestamp(masterAccount.updated_at),
    };
  }

  /**
   * IM 用户 → Master 账户格式
   * @param {Object} imUser - IM 用户对象
   * @returns {Object} Master 账户格式
   */
  static fromIMUser(imUser) {
    return {
      account_id: imUser.user_id,
      account_name: imUser.user_name,
      avatar: imUser.avatar,
      signature: imUser.signature,
      verified: imUser.verified ? 1 : 0,
      total_followers: imUser.follower_count,
      total_following: imUser.following_count,
      status: this.mapStatusReverse(imUser.status),
      platform: imUser.platform || 'douyin',
    };
  }

  /**
   * 批量转换 Master 账户 → IM 用户
   * @param {Array} masterAccounts - Master 账户数组
   * @returns {Array} IM 用户数组
   */
  static toIMUserList(masterAccounts) {
    if (!Array.isArray(masterAccounts)) {
      return [];
    }
    return masterAccounts.map(account => this.toIMUser(account));
  }

  /**
   * Master 状态 → IM 状态映射
   * @param {string} masterStatus - Master 状态
   * @returns {string} IM 状态
   */
  static mapStatus(masterStatus) {
    const statusMap = {
      'active': 'active',
      'logged_in': 'active',
      'pending': 'pending',
      'inactive': 'inactive',
      'suspended': 'banned',
      'banned': 'banned',
    };
    return statusMap[masterStatus] || 'inactive';
  }

  /**
   * IM 状态 → Master 状态映射
   * @param {string} imStatus - IM 状态
   * @returns {string} Master 状态
   */
  static mapStatusReverse(imStatus) {
    const statusMap = {
      'active': 'active',
      'pending': 'pending',
      'inactive': 'inactive',
      'banned': 'suspended',
    };
    return statusMap[imStatus] || 'inactive';
  }

  /**
   * 时间戳转换：秒 → 毫秒
   * @param {number} seconds - 秒级时间戳
   * @returns {number} 毫秒级时间戳
   */
  static convertTimestamp(seconds) {
    if (!seconds) return 0;
    // 如果已经是毫秒级（13位），直接返回
    if (seconds > 10000000000) {
      return seconds;
    }
    // 秒级转毫秒级
    return Math.floor(seconds * 1000);
  }

  /**
   * 时间戳转换：毫秒 → 秒
   * @param {number} milliseconds - 毫秒级时间戳
   * @returns {number} 秒级时间戳
   */
  static convertTimestampReverse(milliseconds) {
    if (!milliseconds) return 0;
    // 如果已经是秒级（10位），直接返回
    if (milliseconds < 10000000000) {
      return milliseconds;
    }
    // 毫秒级转秒级
    return Math.floor(milliseconds / 1000);
  }
}

module.exports = AccountTransformer;
