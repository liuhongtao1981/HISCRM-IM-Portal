const data = require('./config/topics.json');

const user1Topics = data.topics.filter(t => t.channelId === 'user_0001');

console.log(`用户1总主题数: ${user1Topics.length}`);
console.log('\n前100个主题中的私信:');
user1Topics.slice(0, 100).forEach((t, i) => {
  if (t.isPrivate) {
    console.log(`  位置 ${i}: ${t.id}`);
  }
});

console.log('\n后面的主题 (100+):');
user1Topics.slice(100).forEach((t, i) => {
  const index = 100 + i;
  console.log(`  位置 ${index}: ${t.id}${t.isPrivate ? ' [私信]' : ''}`);
});
