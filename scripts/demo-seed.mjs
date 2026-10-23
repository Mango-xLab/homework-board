/*
 * 造一份演示数据，方便看效果 / 截图 / 试功能
 *   node scripts/demo-seed.mjs            （新建一个演示房间）
 *   node scripts/demo-seed.mjs 8ABC23     （往已有房间灌数据）
 */

const BASE = process.env.BASE || 'http://localhost:5199';

async function api(path, opts) {
  const res = await fetch(BASE + path, opts);
  const body = await res.json().catch(function () { return null; });
  if (!res.ok) throw new Error((body && body.error) || ('HTTP ' + res.status));
  return body;
}

function dk(offset) {
  const d = new Date();
  d.setDate(d.getDate() + (offset || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const room = (process.argv[2] || '').toUpperCase()
  || (await api('/api/room', { method: 'POST' })).room;

const today = dk(0);

async function op(ops) {
  const r = await api('/api/state/' + room + '/op', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ops: Array.isArray(ops) ? ops : [ops] }),
  });
  return r.state;
}

// 1. 基本设置
let st = await op({ t: 'settings', patch: { childName: '朵朵', welcome: '今天也要加油鸭！', requireConfirm: true, homeworkPoints: 2, parentPin: '1234' } });

// 2. 今天的作业
st = await op({
  t: 'hw.add', date: today,
  items: [
    { subject: '语文', title: '背诵《静夜思》', detail: '家长签字' },
    { subject: '数学', title: '口算练习册 P20', detail: '' },
    { subject: '英语', title: '跟读 Unit 3 三遍', detail: '' },
    { subject: '其他', title: '明天带红领巾', detail: '' },
  ],
});

const hws = st.days[today].homeworks;
const byTitle = function (kw) { return hws.filter(function (h) { return h.title.indexOf(kw) >= 0; })[0]; };

// 3. 前两天的作业，让周统计有内容
for (let i = 1; i <= 3; i++) {
  const d = dk(-i);
  await op({ t: 'hw.add', date: d, items: [{ subject: '语文', title: '第 ' + (5 - i) + ' 课生字' }, { subject: '数学', title: '口算一页' }] });
  const day = (await api('/api/state/' + room)).state.days[d];
  for (const h of day.homeworks) {
    await op({ t: 'item.done', date: d, kind: 'homework', id: h.id, value: true });
    await op({ t: 'item.confirm', date: d, kind: 'homework', id: h.id, value: true });
  }
  for (const id of ['sport', 'read', 'tidy']) {
    await op({ t: 'item.done', date: d, kind: 'task', id, value: true });
    await op({ t: 'item.confirm', date: d, kind: 'task', id, value: true });
  }
}

// 4. 今天：语文已完成并确认，数学打勾等确认，英语还没做
st = await op({ t: 'item.done', date: today, kind: 'homework', id: byTitle('静夜思').id, value: true });
st = await op({ t: 'item.confirm', date: today, kind: 'homework', id: byTitle('静夜思').id, value: true });
st = await op({ t: 'item.done', date: today, kind: 'homework', id: byTitle('口算').id, value: true });
st = await op([
  { t: 'item.done', date: today, kind: 'task', id: 'sport', value: true },
  { t: 'item.confirm', date: today, kind: 'task', id: 'sport', value: true },
  { t: 'item.done', date: today, kind: 'task', id: 'read', value: true },
]);

// 5. 孩子自己加的额外任务（家长那边能编辑 / 删除 / 调顺序）
st = await op([
  { t: 'extra.add', date: today, item: { emoji: '📞', title: '给奶奶打个电话', points: 2 } },
  { t: 'extra.add', date: today, item: { emoji: '🧦', title: '自己收拾袜子', points: 1 } },
]);
const extras = st.days[today].extras;
// 第一条打勾，让家长端能看到「等确认」的样子
st = await op({ t: 'item.done', date: today, kind: 'extra', id: extras[0].id, value: true });

// 6. 家长留言 + 心情
st = await op({ t: 'day.note', date: today, note: '朵朵今天自己收拾了书包，特别棒！' });
st = await op({ t: 'day.mood', date: today, mood: '😄' });

console.log('');
console.log('  演示房间已就绪：' + room);
console.log('  打开：' + BASE + '/?room=' + room);
console.log('  家长密码：1234');
console.log('  当前小红花：' + st.points.balance);
console.log('');
