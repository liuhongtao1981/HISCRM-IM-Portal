#!/usr/bin/env node

/**
 * HisCRM-IM 配置生成脚本
 * 用于快速生成 .env 和 config.json 配置文件
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * 提问函数
 */
function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        HisCRM-IM 配置生成向导 (Node.js)                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 检查必要的文件
  const configDir = path.join(__dirname, '..');
  const envExample = path.join(configDir, '.env.example');
  const configExample = path.join(configDir, 'config.example.json');

  if (!fs.existsSync(envExample)) {
    console.error('❌ 错误: 找不到 .env.example');
    process.exit(1);
  }

  // 获取部署环境
  console.log('选择部署环境:');
  console.log('  1) 开发环境 (development)');
  console.log('  2) 测试环境 (staging)');
  console.log('  3) 生产环境 (production)\n');

  const envChoice = await question('请输入选择 (1-3): ');

  let config = {};

  switch (envChoice) {
    case '1':
      config = {
        environment: 'development',
        appRoot: './',
        masterHost: '0.0.0.0',
        masterPort: 3000,
        workerMasterHost: 'localhost',
        workerMasterPort: 3000,
        logLevel: 'debug'
      };
      break;
    case '2':
      const stagingRoot = await question('应用根目录 (默认: /opt/hiscrm-im): ');
      config = {
        environment: 'staging',
        appRoot: stagingRoot || '/opt/hiscrm-im',
        masterHost: '0.0.0.0',
        masterPort: 3000,
        workerMasterHost: await question('Master 主机名 (默认: localhost): ') || 'localhost',
        workerMasterPort: 3000,
        logLevel: 'info'
      };
      break;
    case '3':
      const prodRoot = await question('应用根目录 (默认: /opt/hiscrm-im): ');
      config = {
        environment: 'production',
        appRoot: prodRoot || '/opt/hiscrm-im',
        masterHost: await question('Master 绑定地址 (默认: 0.0.0.0): ') || '0.0.0.0',
        masterPort: 3000,
        workerMasterHost: await question('Master 主机名 (默认: master): ') || 'master',
        workerMasterPort: 3000,
        logLevel: 'info'
      };
      break;
    default:
      console.error('❌ 无效的选择');
      process.exit(1);
  }

  // Worker 配置
  config.workerId = await question('Worker ID (默认: worker-1): ') || 'worker-1';
  config.maxAccounts = await question('Worker 最大账户数 (默认: 10): ') || '10';

  // 生成 .env 文件
  console.log('\n📝 生成 .env 文件...');
  const envPath = path.join(process.cwd(), '.env');
  const envContent = `NODE_ENV=${config.environment}
APP_ROOT=${config.appRoot}
MASTER_HOST=${config.masterHost}
MASTER_PORT=${config.masterPort}
WORKER_ID=${config.workerId}
WORKER_MAX_ACCOUNTS=${config.maxAccounts}
WORKER_MASTER_HOST=${config.workerMasterHost}
WORKER_MASTER_PORT=${config.workerMasterPort}
LOG_LEVEL=${config.logLevel}
`;

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ .env 文件已生成');

  // 生成 config.json 文件
  console.log('📝 生成 config.json 文件...');
  const configPath = path.join(process.cwd(), 'config.json');
  const configObj = {
    environment: config.environment,
    paths: {
      projectRoot: config.appRoot,
      master: {
        data: `${config.appRoot}/data/master`,
        logs: `${config.appRoot}/logs/master`
      },
      worker: {
        data: `${config.appRoot}/data/worker`,
        platforms: `${config.appRoot}/packages/worker/src/platforms`,
        logs: `${config.appRoot}/logs/worker`
      }
    },
    server: {
      master: {
        host: config.masterHost,
        port: config.masterPort
      }
    },
    worker: {
      id: config.workerId,
      maxAccounts: parseInt(config.maxAccounts),
      masterHost: config.workerMasterHost,
      masterPort: config.workerMasterPort
    },
    logging: {
      level: config.logLevel,
      format: config.environment === 'production' ? 'json' : 'text'
    }
  };

  fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2), 'utf8');
  console.log('✅ config.json 文件已生成');

  // 显示配置摘要
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                     配置完成！                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('📋 配置信息摘要:');
  console.log(`  环境: ${config.environment}`);
  console.log(`  应用根目录: ${config.appRoot}`);
  console.log(`  Master: ${config.masterHost}:${config.masterPort}`);
  console.log(`  Worker: ${config.workerId} → ${config.workerMasterHost}:${config.workerMasterPort}`);
  console.log(`  日志级别: ${config.logLevel}\n`);

  console.log('📁 生成的文件:');
  console.log(`  • ${envPath}`);
  console.log(`  • ${configPath}\n`);

  console.log('🚀 后续步骤:');
  console.log('  1. 审查生成的配置文件');
  console.log('  2. 根据需要进行调整');
  console.log('  3. 启动应用: npm run start:master && npm run start:worker\n');

  rl.close();
}

// 运行
main().catch(error => {
  console.error('❌ 错误:', error.message);
  process.exit(1);
});
