/**
 * 调试私信消息提取问题
 *
 * 问题:extractMessagesFromVirtualList() 找到了 React Fiber props,
 * 但是返回的 messages 数组为空
 */

const fs = require('fs');
const path = require('path');

console.log('=' .repeat(80));
console.log('私信消息提取问题诊断脚本');
console.log('=' .repeat(80));

// 从日志中提取 props 对象示例
const samplePropsJSON = `{
  "isFromMe": false,
  "serverId": "7559458816048368438",
  "type": 7,
  "conversationId": "0:1:69723801181:3607962860399156",
  "content": {},
  "sender": "69723801181",
  "createdAt": {},
  "serverStatus": 2,
  "secSender": "MS4wLjABAAAA...",
  "nickname": "测试用户",
  "avatar": "https://..."
}`;

const props = JSON.parse(samplePropsJSON);

console.log('\n1. 检查 props 对象的关键字段:');
console.log('-----------------------------------');
console.log(`  serverId: ${props.serverId} (${typeof props.serverId})`);
console.log(`  content: ${JSON.stringify(props.content)} (${typeof props.content})`);
console.log(`  sender: ${props.sender} (${typeof props.sender})`);
console.log(`  conversationId: ${props.conversationId} (${typeof props.conversationId})`);

console.log('\n2. 检查提取条件 (第1367行):');
console.log('-----------------------------------');
const condition1367 = props.serverId && props.content && props.sender && props.conversationId;
console.log(`  条件: props.serverId && props.content && props.sender && props.conversationId`);
console.log(`  结果: ${condition1367}`);
console.log(`  分析:`);
console.log(`    - props.serverId = ${!!props.serverId} (${props.serverId})`);
console.log(`    - props.content = ${!!props.content} (${JSON.stringify(props.content)})`);
console.log(`    - props.sender = ${!!props.sender} (${props.sender})`);
console.log(`    - props.conversationId = ${!!props.conversationId} (${props.conversationId})`);

// 关键问题: content 对象为空 {}
if (Object.keys(props.content).length === 0) {
  console.log(`\n  ⚠️  警告: props.content 是空对象 {}`);
  console.log(`      但是 !!props.content 为 true (因为 {} 不是 null/undefined)`);
}

console.log('\n3. 检查消息内容提取逻辑 (第1416-1417行):');
console.log('-----------------------------------');
const msgContent = props.content || {};
const textContent = msgContent.text || props.text || '';
console.log(`  msgContent = props.content || {} = ${JSON.stringify(msgContent)}`);
console.log(`  textContent = msgContent.text || props.text || '' = "${textContent}"`);
console.log(`  textContent.length = ${textContent.length}`);

console.log('\n4. 检查添加消息的条件 (第1432行):');
console.log('-----------------------------------');
const condition1432 = textContent || props.serverId;
console.log(`  条件: textContent || props.serverId`);
console.log(`  结果: ${condition1432}`);
console.log(`  分析:`);
console.log(`    - textContent = ${!!textContent} ("${textContent}")`);
console.log(`    - props.serverId = ${!!props.serverId} (${props.serverId})`);

if (condition1432) {
  console.log('\n  ✅ 应该能添加消息到 messages 数组');
} else {
  console.log('\n  ❌ 不会添加消息到 messages 数组');
}

console.log('\n5. 可能的问题原因:');
console.log('-----------------------------------');
console.log('  假设1: content 对象不是真的空对象，而是没有 text 属性');
console.log('  假设2: content 对象在日志中被截断，实际有内容');
console.log('  假设3: deepSearchMessage 没有返回 props (不满足第1367行条件)');
console.log('  假设4: React Fiber 树中没有找到消息元素');

console.log('\n6. 从日志证据分析:');
console.log('-----------------------------------');
console.log('  证据1: 日志显示 "所有键 (27个)" - 说明找到了 props');
console.log('  证据2: 日志显示 "Props 对象预览" - 说明 debugInfo 被设置');
console.log('  证据3: 日志显示 serverId, conversationId 等字段 - 数据完整');
console.log('  证据4: 日志显示 "extractMessagesFromVirtualList() 返回了无效数据 []"');
console.log('');
console.log('  结论: props 被找到并记录了 debugInfo,');
console.log('        但是没有执行到 messages.push(message) (第1623行)');
console.log('');
console.log('  最可能原因: content 对象的结构问题');
console.log('              - content.text 不存在');
console.log('              - props.text 也不存在');
console.log('              - textContent 为空字符串');
console.log('              - 但 props.serverId 存在，应该通过第1432行检查');

console.log('\n7. 需要添加的调试日志:');
console.log('-----------------------------------');
console.log('  位置1: 第1367行之前');
console.log('    console.log("🔍 deepSearchMessage 找到 props:", !!props);');
console.log('    console.log("🔍 props.serverId:", props.serverId);');
console.log('    console.log("🔍 props.content:", JSON.stringify(props.content).substring(0, 100));');
console.log('    console.log("🔍 props.sender:", props.sender);');
console.log('    console.log("🔍 props.conversationId:", props.conversationId);');
console.log('');
console.log('  位置2: 第1432行之前');
console.log('    console.log("🔍 textContent:", textContent);');
console.log('    console.log("🔍 条件检查:", !!(textContent || props.serverId));');
console.log('');
console.log('  位置3: 第1623行之后');
console.log('    console.log("✅ 已添加消息:", message.platform_message_id);');

console.log('\n' + '='.repeat(80));
console.log('诊断完成');
console.log('='.repeat(80));
