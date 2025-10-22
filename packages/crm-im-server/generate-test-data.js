/**
 * 生成测试数据 - 200个频道,每个频道100个主题
 */

const fs = require('fs')
const path = require('path')

// 生成随机头像URL
function generateAvatar(index) {
  const colors = ['blue', 'green', 'red', 'purple', 'orange', 'pink', 'yellow', 'teal']
  const color = colors[index % colors.length]
  return `https://ui-avatars.com/api/?name=User${index}&background=${color}&color=fff&size=128`
}

// 生成频道数据
function generateChannels(count) {
  const channels = []
  const baseTime = Date.now()

  for (let i = 1; i <= count; i++) {
    const channel = {
      id: `user_${String(i).padStart(4, '0')}`,
      name: `用户${i}`,
      avatar: generateAvatar(i),
      description: `这是第${i}号用户`,
      isPinned: false, // 不置顶
      enabled: true,
      createdTime: baseTime - (count - i) * 60000, // 按顺序创建
      lastMessageTime: null,
      messageCount: 0
    }
    channels.push(channel)
  }

  return channels
}

// 生成主题数据
function generateTopics(channelCount, topicsPerChannel) {
  const topics = []
  const baseTime = Date.now()

  for (let c = 1; c <= channelCount; c++) {
    const channelId = `user_${String(c).padStart(4, '0')}`

    for (let t = 1; t <= topicsPerChannel; t++) {
      const topicId = `topic_${String(c).padStart(4, '0')}_${String(t).padStart(3, '0')}`
      const topic = {
        id: topicId,
        channelId: channelId,
        title: `主题${t}`,
        description: `用户${c}的第${t}个主题`,
        createdTime: baseTime - (channelCount * topicsPerChannel - (c - 1) * topicsPerChannel - t) * 1000,
        lastMessageTime: null,
        messageCount: 0,
        isPinned: false // 不置顶
      }
      topics.push(topic)
    }
  }

  return topics
}

// 主函数
function main() {
  console.log('开始生成测试数据...')

  const channelCount = 200
  const topicsPerChannel = 100

  console.log(`生成 ${channelCount} 个频道...`)
  const channels = generateChannels(channelCount)

  console.log(`为每个频道生成 ${topicsPerChannel} 个主题 (总计 ${channelCount * topicsPerChannel} 个主题)...`)
  const topics = generateTopics(channelCount, topicsPerChannel)

  // 保存频道配置
  const channelsPath = path.join(__dirname, 'config', 'channels.json')
  const channelsData = {
    channels: channels
  }
  fs.writeFileSync(channelsPath, JSON.stringify(channelsData, null, 2), 'utf8')
  console.log(`✅ 频道配置已保存到: ${channelsPath}`)
  console.log(`   - 总计: ${channels.length} 个频道`)
  console.log(`   - 置顶: ${channels.filter(c => c.isPinned).length} 个`)

  // 保存主题配置
  const topicsPath = path.join(__dirname, 'config', 'topics.json')
  const topicsData = {
    topics: topics
  }
  fs.writeFileSync(topicsPath, JSON.stringify(topicsData, null, 2), 'utf8')
  console.log(`✅ 主题配置已保存到: ${topicsPath}`)
  console.log(`   - 总计: ${topics.length} 个主题`)
  console.log(`   - 置顶: ${topics.filter(t => t.isPinned).length} 个`)

  // 清空消息存储
  const messagesPath = path.join(__dirname, 'config', 'messages.json')
  const messagesData = {
    messages: []
  }
  fs.writeFileSync(messagesPath, JSON.stringify(messagesData, null, 2), 'utf8')
  console.log(`✅ 消息存储已清空: ${messagesPath}`)

  console.log('\n🎉 测试数据生成完成!')
  console.log(`📊 数据统计:`)
  console.log(`   - 频道数: ${channels.length}`)
  console.log(`   - 主题数: ${topics.length}`)
  console.log(`   - 平均每个频道: ${topicsPerChannel} 个主题`)
  console.log('\n⚠️  请重启服务器以加载新数据!')
}

// 执行
main()
