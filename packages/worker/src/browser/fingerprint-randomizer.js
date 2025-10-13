/**
 * Fingerprint Randomizer - 浏览器指纹随机化
 * 为每个BrowserContext注入不同的指纹特征
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('fingerprint-randomizer');

class FingerprintRandomizer {
  /**
   * 为Context应用随机化的指纹
   * @param {BrowserContext} context - Playwright BrowserContext
   * @param {string} accountId - 账户ID (用于生成一致的指纹)
   */
  static async applyRandomFingerprint(context, accountId) {
    try {
      // 生成基于accountId的一致性随机种子
      const seed = this.hashString(accountId);
      const random = this.seededRandom(seed);

      logger.info(`Applying fingerprint randomization for account ${accountId}`);

      // 1. 为每个新页面注入指纹脚本
      await context.addInitScript((fpData) => {
        // Canvas指纹随机化
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
          const dataURL = originalToDataURL.apply(this, args);
          // 轻微扰动Base64数据
          if (dataURL && fpData.canvasNoise) {
            return dataURL.slice(0, -3) + fpData.canvasNoise;
          }
          return dataURL;
        };

        // WebGL指纹随机化
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          // UNMASKED_VENDOR_WEBGL (0x9245)
          if (parameter === 37445) {
            return fpData.webglVendor;
          }
          // UNMASKED_RENDERER_WEBGL (0x9246)
          if (parameter === 37446) {
            return fpData.webglRenderer;
          }
          return getParameter.call(this, parameter);
        };

        // AudioContext指纹随机化
        const originalCreateOscillator = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function() {
          const oscillator = originalCreateOscillator.call(this);
          const originalStart = oscillator.start;
          oscillator.start = function(...args) {
            // 添加微小的频率偏移
            if (fpData.audioNoise) {
              this.frequency.value += fpData.audioNoise;
            }
            return originalStart.apply(this, args);
          };
          return oscillator;
        };

        // 硬件并发数随机化
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => fpData.hardwareConcurrency,
        });

        // 内存信息随机化
        if (navigator.deviceMemory) {
          Object.defineProperty(navigator, 'deviceMemory', {
            get: () => fpData.deviceMemory,
          });
        }

        // 屏幕分辨率轻微随机化
        Object.defineProperty(screen, 'width', {
          get: () => fpData.screenWidth,
        });
        Object.defineProperty(screen, 'height', {
          get: () => fpData.screenHeight,
        });
        Object.defineProperty(screen, 'availWidth', {
          get: () => fpData.screenWidth,
        });
        Object.defineProperty(screen, 'availHeight', {
          get: () => fpData.screenHeight - 40, // 任务栏高度
        });

        // 电池API随机化(如果存在)
        if (navigator.getBattery) {
          const originalGetBattery = navigator.getBattery;
          navigator.getBattery = async function() {
            const battery = await originalGetBattery.call(this);
            Object.defineProperty(battery, 'level', {
              get: () => fpData.batteryLevel,
            });
            Object.defineProperty(battery, 'charging', {
              get: () => fpData.batteryCharging,
            });
            return battery;
          };
        }

        logger.debug(`Fingerprint applied for account: ${fpData.accountId}`);
      }, {
        accountId,
        canvasNoise: this.generateCanvasNoise(random),
        webglVendor: this.randomWebGLVendor(random),
        webglRenderer: this.randomWebGLRenderer(random),
        audioNoise: (random() - 0.5) * 0.001, // ±0.0005Hz
        hardwareConcurrency: this.randomCPUCores(random),
        deviceMemory: this.randomDeviceMemory(random),
        screenWidth: this.randomScreenWidth(random),
        screenHeight: this.randomScreenHeight(random),
        batteryLevel: 0.5 + (random() - 0.5) * 0.5, // 0.25-0.75
        batteryCharging: random() > 0.5,
      });

      logger.info(`Fingerprint randomization applied successfully for account ${accountId}`);

    } catch (error) {
      logger.error(`Failed to apply fingerprint randomization:`, error);
    }
  }

  /**
   * 字符串哈希函数(生成一致性随机种子)
   */
  static hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * 基于种子的随机数生成器(确保同一账户每次生成相同指纹)
   */
  static seededRandom(seed) {
    let current = seed;
    return function() {
      current = (current * 9301 + 49297) % 233280;
      return current / 233280;
    };
  }

  /**
   * 生成Canvas噪声
   */
  static generateCanvasNoise(random) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let noise = '';
    for (let i = 0; i < 3; i++) {
      noise += chars[Math.floor(random() * chars.length)];
    }
    return noise;
  }

  /**
   * 随机WebGL供应商
   */
  static randomWebGLVendor(random) {
    const vendors = [
      'Google Inc.',
      'Intel Inc.',
      'NVIDIA Corporation',
      'AMD',
    ];
    return vendors[Math.floor(random() * vendors.length)];
  }

  /**
   * 随机WebGL渲染器
   */
  static randomWebGLRenderer(random) {
    const renderers = [
      'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2))',
      'ANGLE (NVIDIA GeForce RTX 3060 Ti Direct3D11 vs_5_0 ps_5_0)',
    ];
    return renderers[Math.floor(random() * renderers.length)];
  }

  /**
   * 随机CPU核心数
   */
  static randomCPUCores(random) {
    const cores = [4, 6, 8, 12, 16];
    return cores[Math.floor(random() * cores.length)];
  }

  /**
   * 随机设备内存
   */
  static randomDeviceMemory(random) {
    const memories = [4, 8, 16, 32];
    return memories[Math.floor(random() * memories.length)];
  }

  /**
   * 随机屏幕宽度
   */
  static randomScreenWidth(random) {
    const widths = [1920, 2560, 3840, 1680, 1440];
    return widths[Math.floor(random() * widths.length)];
  }

  /**
   * 随机屏幕高度
   */
  static randomScreenHeight(random) {
    const heights = [1080, 1440, 2160, 1050, 900];
    return heights[Math.floor(random() * heights.length)];
  }
}

module.exports = FingerprintRandomizer;
