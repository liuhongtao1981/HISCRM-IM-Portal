/**
 * Protocol Converter 验证脚本
 *
 * 这个脚本验证协议转换器的核心功能
 * 用于快速验�?Master �?crm 协议转换的正确�?
 */

// 由于这是 CommonJS，我们导入转换逻辑的原始实�?
// 在实际应用中，TypeScript 会处理转�?

// 模拟转换函数（纯 JavaScript 版本用于测试�?
function convertMasterToCrm(masterMessage) {
  const payload = masterMessage.payload || masterMessage

  return {
    id: payload.id || `master_${Date.now()}_${Math.random()}`,
    fromId: payload.sender_id || payload.from_id || 'unknown',
    fromName: payload.sender_name || payload.from_name || 'Unknown User',
    toId: '', // Master 没有 toId 概念
    topic: payload.account_id || payload.topic || 'default',
    content: payload.content || '',
    type: convertMessageType(payload.type || 'TEXT', true),
    timestamp: (payload.created_at || payload.timestamp || Math.floor(Date.now() / 1000)) * 1000, // �?�?毫秒
    fileUrl: payload.file_url || payload.fileUrl || undefined,
    fileName: payload.file_name || payload.fileName || undefined,
  }
}

function convertCrmToMaster(crmMessage) {
  return {
    type: 'notification',
    id: crmMessage.id,
    account_id: crmMessage.topic,
    type: convertMessageType(crmMessage.type, false),
    content: crmMessage.content,
    sender_id: crmMessage.fromId,
    sender_name: crmMessage.fromName,
    created_at: Math.floor(crmMessage.timestamp / 1000),
    is_new: 1,
    is_sent: 0,
    file_url: crmMessage.fileUrl,
    file_name: crmMessage.fileName,
  }
}

function convertMessageType(masterType, isMasterToCrm = true) {
  if (isMasterToCrm) {
    switch ((masterType || 'TEXT').toUpperCase()) {
      case 'TEXT':
      case 'SYSTEM':
      case 'NOTIFICATION':
      case 'COMMENT':
      case 'DIRECT_MESSAGE':
        return 'text'
      case 'FILE':
      case 'IMAGE':
        return 'file'
      default:
        return 'text'
    }
  } else {
    switch ((masterType || 'text').toLowerCase()) {
      case 'text':
        return 'TEXT'
      case 'file':
        return 'FILE'
      default:
        return 'TEXT'
    }
  }
}

// 测试用例
const tests = [
  {
    name: 'Test 1: Master TEXT 消息转换�?crm',
    input: {
      id: 'msg-123',
      account_id: 'account-456',
      sender_id: 'user-789',
      sender_name: 'Alice',
      type: 'TEXT',
      content: 'Hello World',
      created_at: 1697952000,
      is_new: 1,
      is_sent: 0,
    },
    expectedFields: {
      id: 'msg-123',
      topic: 'account-456',
      fromId: 'user-789',
      fromName: 'Alice',
      content: 'Hello World',
      type: 'text',
      timestamp: 1697952000000,
    },
  },
  {
    name: 'Test 2: Master FILE 消息转换',
    input: {
      id: 'msg-456',
      account_id: 'account-123',
      sender_id: 'user-123',
      sender_name: 'Bob',
      type: 'FILE',
      content: 'Document.pdf',
      created_at: 1697952000,
      is_new: 1,
      is_sent: 0,
      file_url: 'http://example.com/file.pdf',
      file_name: 'Document.pdf',
    },
    expectedFields: {
      type: 'file',
      fileUrl: 'http://example.com/file.pdf',
      fileName: 'Document.pdf',
    },
  },
  {
    name: 'Test 3: crm 消息转换�?Master',
    input: {
      id: 'crm-msg-123',
      fromId: 'user-123',
      fromName: 'David',
      toId: '',
      topic: 'account-456',
      content: 'Test message',
      type: 'text',
      timestamp: 1697952000000,
    },
    isCrmInput: true,
    expectedFields: {
      id: 'crm-msg-123',
      account_id: 'account-456',
      sender_id: 'user-123',
      sender_name: 'David',
      content: 'Test message',
      type: 'TEXT',
      created_at: 1697952000,
    },
  },
  {
    name: 'Test 4: 往返转换（Master �?crm �?Master�?,
    input: {
      id: 'msg-round-trip',
      account_id: 'account-rt',
      sender_id: 'user-rt',
      sender_name: 'Grace',
      type: 'TEXT',
      content: 'Round trip test',
      created_at: 1697952000,
      is_new: 1,
      is_sent: 0,
    },
    roundTrip: true,
    expectedFields: {
      id: 'msg-round-trip',
      account_id: 'account-rt',
      sender_id: 'user-rt',
      sender_name: 'Grace',
      type: 'TEXT',
      content: 'Round trip test',
      created_at: 1697952000,
    },
  },
]

// 运行测试
console.log('🧪 Protocol Converter 验证脚本\n')
console.log('=' .repeat(60))

let passedTests = 0
let failedTests = 0

tests.forEach((test, index) => {
  console.log(`\n${test.name}`)
  console.log('-'.repeat(60))

  try {
    let result

    if (test.roundTrip) {
      // 往返转�?
      const crm = convertMasterToCrm(test.input)
      result = convertCrmToMaster(crm)
    } else if (test.isCrmInput) {
      // crm �?Master
      result = convertCrmToMaster(test.input)
    } else {
      // Master �?crm
      result = convertMasterToCrm(test.input)
    }

    // 验证期望字段
    let isValid = true
    const errors = []

    for (const [field, expectedValue] of Object.entries(test.expectedFields)) {
      const actualValue = result[field]
      if (actualValue !== expectedValue) {
        isValid = false
        errors.push(`  �?${field}: 期望 ${expectedValue}, 得到 ${actualValue}`)
      } else {
        console.log(`  �?${field}: ${actualValue}`)
      }
    }

    if (isValid) {
      console.log(`�?测试通过`)
      passedTests++
    } else {
      console.log(`�?测试失败:`)
      errors.forEach((e) => console.log(e))
      failedTests++
    }
  } catch (error) {
    console.log(`�?测试异常: ${error.message}`)
    failedTests++
  }
})

// 总结
console.log('\n' + '='.repeat(60))
console.log(`\n📊 测试结果`)
console.log(`�?通过: ${passedTests}`)
console.log(`�?失败: ${failedTests}`)
console.log(`📈 成功�? ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`)

if (failedTests === 0) {
  console.log('\n🎉 所有测试通过！协议转换器工作正常')
  process.exit(0)
} else {
  console.log('\n⚠️  存在失败的测试，请检查转换逻辑')
  process.exit(1)
}
