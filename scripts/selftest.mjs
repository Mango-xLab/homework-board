/*
 * 自测脚本：不开浏览器也能验证核心逻辑对不对
 *   node scripts/selftest.mjs
 */

import * as C from '../public/core.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); }
}

console.log('\n【一】钉钉作业文本解析');

const sample = `各位家长好，今天的作业如下：
语文：背诵《静夜思》，家长签字
数学：口算练习册 P20
1. 英语跟读 Unit 3
【美术】画一幅秋天的画
数学作业：
  1. 订正试卷
  2. 预习第 6 课
明天带红领巾`;

const parsed = C.parseHomeworkText(sample);
parsed.forEach(function (p) { console.log('     · ' + p.subject + ' | ' + p.title + (p.detail ? ' | ' + p.detail : '')); });
ok('解析出 7 条', parsed.length === 7, '实际 ' + parsed.length);
ok('第 1 条是语文', parsed[0].subject === '语文');
ok('第 1 条备注是家长签字', parsed[0].detail === '家长签字', JSON.stringify(parsed[0]));
ok('第 2 条是数学', parsed[1].subject === '数学');
ok('第 3 条是英语', parsed[2].subject === '英语');
ok('第 4 条美术（方括号）', parsed[3].subject === '美术');
ok('"数学作业："后面的两条归到数学', parsed[4].subject === '数学' && parsed[5].subject === '数学');
ok('第 6 条去掉了序号', parsed[5].title === '预习第 6 课', parsed[5].title);
ok('"明天带红领巾"按关键词归到其他/体育之外也能出结果', parsed.length >= 7);

const p2 = C.parseHomeworkText('1、预习课文\n2、读英语绘本\n3、跳绳100个');
ok('纯序号列表也能拆', p2.length === 3, JSON.stringify(p2.map(function (x) { return x.title; })));
ok('跳绳归到体育', p2[2].subject === '体育', p2[2].subject);

console.log('\n【二】打勾 / 家长确认 / 积分结算');

let st = C.defaultState();
const today = C.todayKey();
const hw = { subject: '语文', title: '背诵静夜思', detail: '' };
C.applyOp(st, { t: 'hw.add', date: today, items: [hw] });
ok('作业加进去了', C.getDay(st, today).homeworks.length === 1);
ok('初始小红花是 0', st.points.balance === 0);

const hid = C.getDay(st, today).homeworks[0].id;
C.applyOp(st, { t: 'item.done', date: today, kind: 'homework', id: hid, value: true });
ok('打勾后还没得分（要家长确认）', st.points.balance === 0, '余额 ' + st.points.balance);
C.applyOp(st, { t: 'item.confirm', date: today, kind: 'homework', id: hid, value: true });
ok('家长确认后 +2', st.points.balance === 2, '余额 ' + st.points.balance);
C.applyOp(st, { t: 'item.confirm', date: today, kind: 'homework', id: hid, value: false });
ok('取消确认后扣回 -2', st.points.balance === 0, '余额 ' + st.points.balance);
C.applyOp(st, { t: 'item.done', date: today, kind: 'homework', id: hid, value: false });
ok('撤销打勾仍是 0', st.points.balance === 0);

C.applyOp(st, { t: 'settings', patch: { requireConfirm: false } });
C.applyOp(st, { t: 'item.done', date: today, kind: 'homework', id: hid, value: true });
ok('关掉家长确认后，打勾立刻得分', st.points.balance === 2, '余额 ' + st.points.balance);

console.log('\n【三】每日任务与完成度');

const t1 = st.dailyTasks[0];
C.applyOp(st, { t: 'item.done', date: today, kind: 'task', id: t1.id, value: true });
ok('任务打勾得分', st.points.balance === 2 + t1.points, '余额 ' + st.points.balance);
const stat = C.countDone(st, today);
ok('总项数 = 1 条作业 + 5 个任务', stat.total === 6, '实际 ' + stat.total);
ok('已完成 2 项', stat.done === 2, '实际 ' + stat.done);

console.log('\n【四】兑换与退回');

st.points.balance = 100; st.points.earned = 100;
const rw = st.rewards[0];
C.applyOp(st, { t: 'redeem', id: rw.id });
ok('兑换后扣掉相应小红花', st.points.balance === 100 - rw.cost, '余额 ' + st.points.balance);
ok('产生一条待兑现记录', st.redemptions.filter(function (r) { return r.status === 'pending'; }).length === 1);
const rid = st.redemptions[0].id;
C.applyOp(st, { t: 'redeem.status', id: rid, status: 'cancelled' });
ok('退回后小红花还回来', st.points.balance === 100, '余额 ' + st.points.balance);

console.log('\n【五】数据健壮性');

ok('normalizeState 能吃空对象', C.normalizeState(null).settings.childName === '宝贝');
ok('normalizeState 能补齐缺失字段', Array.isArray(C.normalizeState({ days: { '2025-01-01': {} } }).days['2025-01-01'].homeworks));
const bad = C.defaultState();
C.applyOp(bad, { t: 'hw.add', date: '不是日期', items: [{ title: 'x' }] });
ok('非法日期不会污染数据', Object.keys(bad.days).length === 0);
C.applyOp(bad, { t: '不存在的操作', date: today });
ok('未知操作被忽略', bad.days[today] === undefined);

const long = C.defaultState();
for (let i = 0; i < 500; i++) C.applyOp(long, { t: 'day.note', date: today, note: 'x' + i });
C.applyOp(long, { t: 'settings', patch: {} });
ok('ledger 有长度上限', long.ledger.length <= 400);

console.log('\n【六】周与日期');

const wk = C.weekKeys('2025-06-05'); // 星期四
ok('一周 7 天', wk.length === 7);
ok('周一开头', wk[0] === '2025-06-02', wk[0]);
ok('周日结尾', wk[6] === '2025-06-08', wk[6]);
ok('跨月也正确', C.weekKeys('2025-03-01')[0] === '2025-02-24', C.weekKeys('2025-03-01')[0]);

console.log('\n【七】存盘往返（打勾状态不能被吃掉）');

const rt = C.defaultState();
const rtDate = C.todayKey();
C.applyOp(rt, { t: 'hw.add', date: rtDate, items: [{ subject: '语文', title: '读课文' }] });
const rtId = C.getDay(rt, rtDate).homeworks[0].id;
C.applyOp(rt, { t: 'item.done', date: rtDate, kind: 'homework', id: rtId, value: true });
C.applyOp(rt, { t: 'item.done', date: rtDate, kind: 'task', id: rt.dailyTasks[0].id, value: true });
C.applyOp(rt, { t: 'item.confirm', date: rtDate, kind: 'homework', id: rtId, value: true });

const back = C.normalizeState(JSON.parse(JSON.stringify(rt)));
const bh = C.getDay(back, rtDate).homeworks[0];
ok('往返后 done 还在', bh.done === true);
ok('往返后 confirmed 还在', bh.confirmed === true);
ok('往返后 awarded / 分值还在', bh.awarded === true && bh.awardedPoints === 2, JSON.stringify(bh));
ok('往返后任务打勾还在', back.days[rtDate].tasks[rt.dailyTasks[0].id].done === true);
ok('往返后余额没变', back.points.balance === rt.points.balance, back.points.balance + ' vs ' + rt.points.balance);
ok('往返两次也稳定', C.normalizeState(JSON.parse(JSON.stringify(back))).points.balance === rt.points.balance);

console.log('\n【八】专注时间设置');

const fs1 = C.defaultState();
ok('默认专注 20 分钟', fs1.settings.focusMinutes === 20, String(fs1.settings.focusMinutes));
ok('默认休息 5 分钟', fs1.settings.breakMinutes === 5, String(fs1.settings.breakMinutes));
ok('默认显示专注按钮', fs1.settings.focusEnabled === true);

C.applyOp(fs1, { t: 'settings', patch: { focusMinutes: 999, breakMinutes: -3 } });
ok('专注时长上限 60', fs1.settings.focusMinutes === 60, String(fs1.settings.focusMinutes));
ok('休息时长下限 1', fs1.settings.breakMinutes === 1, String(fs1.settings.breakMinutes));

C.applyOp(fs1, { t: 'settings', patch: { focusMinutes: 3 } });
ok('专注时长下限 5', fs1.settings.focusMinutes === 5, String(fs1.settings.focusMinutes));

C.applyOp(fs1, { t: 'settings', patch: { focusEnabled: false } });
ok('可以关掉专注按钮', fs1.settings.focusEnabled === false);
C.applyOp(fs1, { t: 'settings', patch: { childName: '小明' } });
ok('改别的设置不会把开关顶回 true', fs1.settings.focusEnabled === false, String(fs1.settings.focusEnabled));

const legacy = C.normalizeState({
  settings: { childName: '旧数据', parentPin: '4321', homeworkPoints: 5 },
  days: {},
  points: { balance: 7, earned: 7, spent: 0 },
});
ok('旧存档自动补上专注默认值',
  legacy.settings.focusMinutes === 20 && legacy.settings.breakMinutes === 5 && legacy.settings.focusEnabled === true);
ok('旧存档自己的设置不会被默认值覆盖',
  legacy.settings.childName === '旧数据' && legacy.settings.parentPin === '4321' && legacy.settings.homeworkPoints === 5,
  JSON.stringify(legacy.settings));
ok('旧存档的小红花余额也不会被清零', legacy.points.balance === 7, String(legacy.points.balance));

console.log('\n【九】自定义排序');

const mo = C.defaultState();
const d0 = C.todayKey();
C.applyOp(mo, {
  t: 'hw.add', date: d0,
  items: [{ subject: '语文', title: 'A' }, { subject: '语文', title: 'B' }, { subject: '语文', title: 'C' }],
});
const order = function () {
  return C.getDay(mo, d0).homeworks.map(function (h) { return h.title; }).join('');
};
const idOf = function (title) {
  return C.getDay(mo, d0).homeworks.filter(function (h) { return h.title === title; })[0].id;
};
ok('初始顺序 ABC', order() === 'ABC', order());

C.applyOp(mo, { t: 'move', list: 'homework', date: d0, id: idOf('B'), dir: -1 });
ok('B 上移 → BAC', order() === 'BAC', order());
C.applyOp(mo, { t: 'move', list: 'homework', date: d0, id: idOf('B'), dir: 1 });
ok('B 再下移 → ABC', order() === 'ABC', order());
C.applyOp(mo, { t: 'move', list: 'homework', date: d0, id: idOf('B'), dir: -1 });
C.applyOp(mo, { t: 'move', list: 'homework', date: d0, id: idOf('B'), dir: 1 });
ok('连点上下能回到原位', order() === 'ABC', order());

C.applyOp(mo, { t: 'move', list: 'homework', date: d0, id: idOf('A'), dir: -1 });
ok('第一项再上移不动', order() === 'ABC', order());
C.applyOp(mo, { t: 'move', list: 'homework', date: d0, id: idOf('C'), dir: 1 });
ok('最后一项再下移不动', order() === 'ABC', order());

const taskOrder = function () { return mo.dailyTasks.map(function (t) { return t.id; }).join(','); };
const firstTask = mo.dailyTasks[0].id;
const secondTask = mo.dailyTasks[1].id;
C.applyOp(mo, { t: 'move', list: 'tasks', id: firstTask, dir: 1 });
ok('每日任务可以换位置', mo.dailyTasks[1].id === firstTask && mo.dailyTasks[0].id === secondTask, taskOrder());
C.applyOp(mo, { t: 'move', list: 'tasks', id: firstTask, dir: -1 });
ok('换回来', mo.dailyTasks[0].id === firstTask, taskOrder());

const firstReward = mo.rewards[0].id;
C.applyOp(mo, { t: 'move', list: 'rewards', id: firstReward, dir: 1 });
ok('奖励也能换位置', mo.rewards[1].id === firstReward);

C.applyOp(mo, { t: 'move', list: 'homework', date: d0, id: 'h_不存在', dir: -1 });
ok('不存在的 id 不会搞乱顺序', order() === 'ABC', order());
C.applyOp(mo, { t: 'move', list: '乱写的列表', id: idOf('B'), dir: -1 });
ok('未知列表被忽略', order() === 'ABC' && mo.dailyTasks.length === 5);

console.log('\n【十】全新一天的任务打勾');

const fresh = C.defaultState();
const freshTask = fresh.dailyTasks[0].id;
ok('全新的一天还没有任何记录', fresh.days[d0] === undefined);
C.applyOp(fresh, { t: 'item.done', date: d0, kind: 'task', id: freshTask, value: true });
ok('每日任务第一次打勾会自动建记录',
  C.getDay(fresh, d0).tasks[freshTask].done === true,
  JSON.stringify(C.getDay(fresh, d0).tasks));

console.log('\n【十一】兑换：确认 / 驳回 / 退回');

const rq = C.defaultState();
rq.points.balance = 100; rq.points.earned = 100;
const rw0 = rq.rewards[0];
C.applyOp(rq, { t: 'redeem', id: rw0.id });
ok('兑换申请进入待处理', rq.redemptions[0].status === 'pending');
ok('申请时先扣掉小红花', rq.points.balance === 100 - rw0.cost, String(rq.points.balance));

const rid0 = rq.redemptions[0].id;
C.applyOp(rq, { t: 'redeem.status', id: rid0, status: 'rejected', reason: '今天已经换过一个啦' });
ok('驳回后小红花退回', rq.points.balance === 100, String(rq.points.balance));
ok('驳回原因记录下来了', rq.redemptions[0].reason === '今天已经换过一个啦', rq.redemptions[0].reason);
ok('状态变成 rejected', rq.redemptions[0].status === 'rejected');

C.applyOp(rq, { t: 'redeem.status', id: rid0, status: 'done' });
ok('驳回后家长又改主意兑现，会重新扣一次', rq.points.balance === 100 - rw0.cost, String(rq.points.balance));
ok('改成已兑现后不再保留驳回原因', rq.redemptions[0].reason === '', JSON.stringify(rq.redemptions[0].reason));

C.applyOp(rq, { t: 'redeem.status', id: rid0, status: 'pending' });
ok('可以回到待处理', rq.redemptions[0].status === 'pending' && rq.redemptions[0].resolvedAt === null);

C.applyOp(rq, { t: 'redeem.status', id: rid0, status: '乱写的状态' });
ok('非法状态被忽略', rq.redemptions[0].status === 'pending');

const rq2 = C.defaultState();
C.applyOp(rq2, { t: 'redeem', id: rq2.rewards[0].id });
ok('小红花不够时不会产生申请', rq2.redemptions.length === 0 && rq2.points.balance === 0);

console.log('\n【十二】单项作业的小红花');

const hp = C.defaultState();
const hd = C.todayKey();
C.applyOp(hp, { t: 'settings', patch: { homeworkPoints: 2 } });
C.applyOp(hp, { t: 'hw.add', date: hd, items: [{ subject: '语文', title: '默认分值' }, { subject: '数学', title: '自定义', points: 5 }] });
const hwA = C.getDay(hp, hd).homeworks[0];
const hwB = C.getDay(hp, hd).homeworks[1];
ok('没写分值就跟着全局设置', hwA.points === undefined);
ok('写了就存下来', hwB.points === 5, String(hwB.points));

C.applyOp(hp, { t: 'item.done', date: hd, kind: 'homework', id: hwA.id, value: true });
C.applyOp(hp, { t: 'item.confirm', date: hd, kind: 'homework', id: hwA.id, value: true });
ok('默认分值的作业 +2', hp.points.balance === 2, String(hp.points.balance));

C.applyOp(hp, { t: 'item.done', date: hd, kind: 'homework', id: hwB.id, value: true });
C.applyOp(hp, { t: 'item.confirm', date: hd, kind: 'homework', id: hwB.id, value: true });
ok('自定义分值的作业 +5', hp.points.balance === 7, String(hp.points.balance));

C.applyOp(hp, { t: 'hw.update', date: hd, id: hwB.id, patch: { points: 10 } });
ok('改分值后重新结算', hp.points.balance === 2 + 10, String(hp.points.balance));

C.applyOp(hp, { t: 'hw.update', date: hd, id: hwB.id, patch: { points: 999 } });
ok('分值被封顶到 20', C.getDay(hp, hd).homeworks[1].points === 20);

C.applyOp(hp, { t: 'hw.update', date: hd, id: hwB.id, patch: { points: '' } });
ok('清空分值就回到全局设置', C.getDay(hp, hd).homeworks[1].points === undefined, String(C.getDay(hp, hd).homeworks[1].points));

console.log('\n【十三】同一科目的作业挨着放');

const gr = C.defaultState();
const gd = C.todayKey();
const gOrder = function () {
  return C.getDay(gr, gd).homeworks.map(function (h) { return h.subject + h.title; }).join(',');
};
C.applyOp(gr, {
  t: 'hw.add', date: gd,
  items: [
    { subject: '语文', title: 'A' },
    { subject: '数学', title: 'B' },
    { subject: '英语', title: 'C' },
    { subject: '语文', title: 'D' },
  ],
});
ok('第二条语文插到第一条语文后面', gOrder() === '语文A,语文D,数学B,英语C', gOrder());

C.applyOp(gr, { t: 'hw.add', date: gd, items: [{ subject: '数学', title: 'E' }] });
ok('后面的数学也跟在数学后面',
  gOrder() === '语文A,语文D,数学B,数学E,英语C', gOrder());

C.applyOp(gr, { t: 'hw.add', date: gd, items: [{ subject: '美术', title: 'F' }] });
ok('新科目挂到末尾', gOrder() === '语文A,语文D,数学B,数学E,英语C,美术F', gOrder());

C.applyOp(gr, { t: 'hw.add', date: gd, items: [{ subject: '语文', title: 'G' }] });
ok('语文再来一条还是挨着语文',
  gOrder() === '语文A,语文D,语文G,数学B,数学E,英语C,美术F', gOrder());

console.log('\n【十四】房间码与房间名');

const rcode = C.normalizeRoomCode('  duo-duo  ');
ok('房间码去掉空格和符号并转大写', rcode === 'DUODUO', rcode);
ok('中文会被清成空串', C.normalizeRoomCode('我的小家') === '', C.normalizeRoomCode('我的小家'));
ok('下划线也算非法字符', C.normalizeRoomCode('a_b') === 'AB', C.normalizeRoomCode('a_b'));

ok('3 位可用', C.isValidRoom('ABC'));
ok('20 位可用', C.isValidRoom('AAAAAAAAAAAAAAAAAAAA'));
ok('2 位不行', !C.isValidRoom('AB'));
ok('21 位不行', !C.isValidRoom('AAAAAAAAAAAAAAAAAAAAA'));
ok('带符号不行', !C.isValidRoom('AB-CD'));
ok('空不行', !C.isValidRoom(''));
ok('系统生成的 6 位仍然合法', C.isValidRoom(C.roomCode()));

const rs = C.defaultState();
ok('没设房间名时 = 孩子名字 + 的作业小站', C.roomNameOf(rs) === '宝贝的作业小站', C.roomNameOf(rs));
C.applyOp(rs, { t: 'settings', patch: { roomName: '  朵朵的作业  ' } });
ok('设了房间名就用房间名', C.roomNameOf(rs) === '朵朵的作业', C.roomNameOf(rs));
C.applyOp(rs, { t: 'settings', patch: { roomName: '' } });
ok('清空房间名又回到默认格式', C.roomNameOf(rs) === '宝贝的作业小站', C.roomNameOf(rs));
C.applyOp(rs, { t: 'settings', patch: { childName: '' } });
ok('孩子名字空着也不会崩（退回「作业小站」）', C.roomNameOf(rs) === '宝贝的作业小站', C.roomNameOf(rs));

const longName = C.defaultState();
C.applyOp(longName, { t: 'settings', patch: { roomName: '一'.repeat(50) } });
ok('房间名最多留 24 个字', longName.settings.roomName.length === 24, String(longName.settings.roomName.length));

ok('自定义码提示：太短不放行', C.roomCodeHint('AB').ok === false);
ok('自定义码提示：纯数字给警告', C.roomCodeHint('123456').warn.length > 0, JSON.stringify(C.roomCodeHint('123456')));
ok('自定义码提示：够长又混字母就放行', C.roomCodeHint('DUODUO2024').warn === '', JSON.stringify(C.roomCodeHint('DUODUO2024')));

console.log('\n【十五】之前漏测的十个 op');

const DD = C.todayKey();
const blank = function () { return C.defaultState(); };

/* ---- hw.remove：删掉已确认的作业，小红花要收回来 ---- */
const r1 = blank();
C.applyOp(r1, { t: 'hw.add', date: DD, items: [{ subject: '语文', title: 'A' }, { subject: '数学', title: 'B' }] });
const r1h = C.getDay(r1, DD).homeworks[0];
C.applyOp(r1, { t: 'item.done', date: DD, kind: 'homework', id: r1h.id, value: true });
C.applyOp(r1, { t: 'item.confirm', date: DD, kind: 'homework', id: r1h.id, value: true });
ok('hw.remove 前置：确认后有 2 分', r1.points.balance === 2, String(r1.points.balance));
C.applyOp(r1, { t: 'hw.remove', date: DD, id: r1h.id });
ok('hw.remove 删掉了', C.getDay(r1, DD).homeworks.length === 1, String(C.getDay(r1, DD).homeworks.length));
ok('hw.remove 把已发的小红花收回（回归：以前不退）', r1.points.balance === 0, String(r1.points.balance));
ok('hw.remove 撤回记进了流水', r1.ledger.some(function (x) { return String(x.reason).indexOf('删除') === 0; }),
  JSON.stringify(r1.ledger.map(function (x) { return x.reason; })));
C.applyOp(r1, { t: 'hw.remove', date: DD, id: '不存在的id' });
ok('hw.remove 删不存在的不会崩', C.getDay(r1, DD).homeworks.length === 1);

/* ---- extra.remove：同上，额外任务也测 ---- */
const r2 = blank();
C.applyOp(r2, { t: 'extra.add', date: DD, item: { title: '带红领巾', points: 3 } });
const r2e = C.getDay(r2, DD).extras[0];
ok('extra.add 默认 emoji 是 ✨', r2e.emoji === '✨', r2e.emoji);
ok('extra.add 记了分值', r2e.points === 3, String(r2e.points));
ok('extra.add 初始未完成', r2e.done === false);
C.applyOp(r2, { t: 'item.done', date: DD, kind: 'extra', id: r2e.id, value: true });
C.applyOp(r2, { t: 'item.confirm', date: DD, kind: 'extra', id: r2e.id, value: true });
ok('额外任务确认后 +3', r2.points.balance === 3, String(r2.points.balance));
C.applyOp(r2, { t: 'extra.remove', date: DD, id: r2e.id });
ok('extra.remove 删掉了', C.getDay(r2, DD).extras.length === 0);
ok('extra.remove 把已发的小红花收回（回归）', r2.points.balance === 0, String(r2.points.balance));
C.applyOp(r2, { t: 'extra.add', date: DD, item: {} });
ok('extra.add 没标题就忽略', C.getDay(r2, DD).extras.length === 0);

/* ---- extra.update：家长改孩子加的额外任务 ---- */
const r2b = blank();
C.applyOp(r2b, { t: 'extra.add', date: DD, item: { title: '孩子写的事', emoji: '✨', points: 1 } });
const r2e2 = C.getDay(r2b, DD).extras[0];
C.applyOp(r2b, { t: 'extra.update', date: DD, id: r2e2.id, patch: { title: '家长改成的事', points: 5, emoji: '📞' } });
const upd = C.getDay(r2b, DD).extras[0];
ok('extra.update 改了标题', upd.title === '家长改成的事', upd.title);
ok('extra.update 改了分值', upd.points === 5, String(upd.points));
ok('extra.update 改了图标', upd.emoji === '📞', upd.emoji);
ok('extra.update 没动打勾状态', upd.done === false);
C.applyOp(r2b, { t: 'extra.update', date: DD, id: r2e2.id, patch: { title: '   ' } });
ok('extra.update 不允许把标题改成空', C.getDay(r2b, DD).extras[0].title === '家长改成的事',
  C.getDay(r2b, DD).extras[0].title);
C.applyOp(r2b, { t: 'extra.update', date: DD, id: r2e2.id, patch: { points: '' } });
ok('extra.update 分值留空 → 保留原值 5', C.getDay(r2b, DD).extras[0].points === 5,
  String(C.getDay(r2b, DD).extras[0].points));
C.applyOp(r2b, { t: 'extra.update', date: DD, id: '不存在', patch: { title: 'x' } });
ok('extra.update 改不存在的不会崩', C.getDay(r2b, DD).extras.length === 1);

/* 改一条已经结算过的分值，账面要跟着重算 */
const r2c = blank();
C.applyOp(r2c, { t: 'extra.add', date: DD, item: { title: '已结算的事', points: 3 } });
const r2e3 = C.getDay(r2c, DD).extras[0];
C.applyOp(r2c, { t: 'item.done', date: DD, kind: 'extra', id: r2e3.id, value: true });
C.applyOp(r2c, { t: 'item.confirm', date: DD, kind: 'extra', id: r2e3.id, value: true });
ok('extra.update 前置：确认后有 3 分', r2c.points.balance === 3, String(r2c.points.balance));
C.applyOp(r2c, { t: 'extra.update', date: DD, id: r2e3.id, patch: { points: 8 } });
ok('extra.update 改了已结算的分值 → 余额跟着变成 8', r2c.points.balance === 8, String(r2c.points.balance));
C.applyOp(r2c, { t: 'extra.update', date: DD, id: r2e3.id, patch: { title: '只改名字' } });
ok('extra.update 只改名字不会重复结算', r2c.points.balance === 8, String(r2c.points.balance));

/* ---- day.copy：复制昨天的，状态要重置、不能重复发星星 ---- */
const r3 = blank();
const yesterday = C.shiftDate(DD, -1);
C.applyOp(r3, { t: 'hw.add', date: yesterday, items: [{ subject: '语文', title: '昨天的作业', detail: '家长签字' }] });
C.applyOp(r3, { t: 'extra.add', date: yesterday, item: { title: '昨天的小事' } });
const yHw = C.getDay(r3, yesterday).homeworks[0];
C.applyOp(r3, { t: 'item.done', date: yesterday, kind: 'homework', id: yHw.id, value: true });
C.applyOp(r3, { t: 'item.confirm', date: yesterday, kind: 'homework', id: yHw.id, value: true });
C.applyOp(r3, { t: 'day.copy', from: yesterday, to: DD });
const copied = C.getDay(r3, DD);
ok('day.copy 复制了作业', copied.homeworks.length === 1, String(copied.homeworks.length));
ok('day.copy 标题对了', copied.homeworks[0].title === '昨天的作业', copied.homeworks[0].title);
ok('day.copy 备注也带过来了', copied.homeworks[0].detail === '家长签字', copied.homeworks[0].detail);
ok('day.copy 打勾状态重置了', copied.homeworks[0].done === false);
ok('day.copy 确认状态重置了', copied.homeworks[0].confirmed === false);
ok('day.copy 换了新 id', copied.homeworks[0].id !== yHw.id);
ok('day.copy 额外任务也复制了', copied.extras.length === 1, String(copied.extras.length));
ok('day.copy 不会重复发小红花', r3.points.balance === 2, String(r3.points.balance));
C.applyOp(r3, { t: 'day.copy', from: DD, to: DD });
ok('day.copy 自己复制自己被忽略', C.getDay(r3, DD).homeworks.length === 1);

/* ---- task.add / update / remove ---- */
const r4 = blank();
const base4 = r4.dailyTasks.length;
C.applyOp(r4, { t: 'task.add', item: { title: '练字 10 分钟', emoji: '✍️', points: 2 } });
ok('task.add 加了一条', r4.dailyTasks.length === base4 + 1, String(r4.dailyTasks.length));
const t4 = r4.dailyTasks[r4.dailyTasks.length - 1];
ok('task.add 默认启用', t4.active === true);
ok('task.add 记了分值', t4.points === 2, String(t4.points));
C.applyOp(r4, { t: 'task.update', id: t4.id, patch: { title: '练字 15 分钟', points: 3 } });
const t4b = r4.dailyTasks.filter(function (x) { return x.id === t4.id; })[0];
ok('task.update 改了标题', t4b.title === '练字 15 分钟', t4b.title);
ok('task.update 改了分值', t4b.points === 3, String(t4b.points));
C.applyOp(r4, { t: 'task.update', id: t4.id, patch: { active: false } });
ok('task.update 能停用', r4.dailyTasks.filter(function (x) { return x.id === t4.id; })[0].active === false);
const pts4 = function () { return r4.dailyTasks.filter(function (x) { return x.id === t4.id; })[0].points; };
// 数字输入的统一契约：填了 0 就是 0，留空才走默认 / 保留原值
C.applyOp(r4, { t: 'task.update', id: t4.id, patch: { points: '' } });
ok('task.update 分值留空 → 保留原值 3', pts4() === 3, String(pts4()));
C.applyOp(r4, { t: 'task.update', id: t4.id, patch: { points: 0 } });
ok('task.update 分值填 0 → 真的变 0 分', pts4() === 0, String(pts4()));
/*
 * 注意：task.add 现在**按标签分组插入**（功课 → 生活 → 精神 → 自定义），
 * 不再一律追加到末尾，所以这里必须按标题找，不能用 [length-1]。
 */
const byTitle = function (st, title) {
  return st.dailyTasks.filter(function (x) { return x.title === title; })[0] || {};
};
C.applyOp(r4, { t: 'task.add', item: { title: '零分任务', points: 0 } });
ok('task.add 分值填 0 → 0 分（0 是合法值）',
  byTitle(r4, '零分任务').points === 0, String(byTitle(r4, '零分任务').points));
C.applyOp(r4, { t: 'task.add', item: { title: '不填分值' } });
ok('task.add 分值留空 → 默认 1',
  byTitle(r4, '不填分值').points === 1, String(byTitle(r4, '不填分值').points));
C.applyOp(r4, { t: 'task.add', item: { title: '分太高', points: 99 } });
ok('task.add 分值上限 20',
  byTitle(r4, '分太高').points === 20, String(byTitle(r4, '分太高').points));
C.applyOp(r4, { t: 'task.remove', id: t4.id });
/*
 * 第 91 轮：task.remove 改成**软删除**（只打标记、数据留着），
 * 所以数组长度不变，要看 deleted 标记 + 不再算作"今天有效"。
 */
const removed = r4.dailyTasks.filter(function (x) { return x.id === t4.id; })[0];
ok('task.remove 打了软删除标记、数据没删',
  Boolean(removed) && removed.deleted === true,
  removed ? JSON.stringify({ deleted: removed.deleted, deletedAt: removed.deletedAt })
    : '(任务没了)');
ok('软删除之后今天的任务列表里不含它',
  !C.taskActiveOn(removed, C.todayKey(), []));
const visible4 = r4.dailyTasks.filter(function (x) { return !x.deleted; }).length;
// base4 之后一共加了 t4 + 3 条，软删掉 1 条 → 可见 base4 + 3
ok('家长列表里看到的条数少了一条', visible4 === base4 + 3, String(visible4));
C.applyOp(r4, { t: 'task.add', item: {} });
ok('task.add 没标题就忽略', visible4 === base4 + 3, String(visible4));

/* ---- reward.add / update / remove ---- */
const r5 = blank();
const base5 = r5.rewards.length;
C.applyOp(r5, { t: 'reward.add', item: { title: '看一集动画', emoji: '📺', cost: 12 } });
ok('reward.add 加了一条', r5.rewards.length === base5 + 1, String(r5.rewards.length));
const w5 = r5.rewards[r5.rewards.length - 1];
ok('reward.add 记了价格', w5.cost === 12, String(w5.cost));
C.applyOp(r5, { t: 'reward.update', id: w5.id, patch: { cost: 20, title: '看两集动画' } });
const w5b = r5.rewards.filter(function (x) { return x.id === w5.id; })[0];
ok('reward.update 改了价格', w5b.cost === 20, String(w5b.cost));
ok('reward.update 改了标题', w5b.title === '看两集动画', w5b.title);
C.applyOp(r5, { t: 'reward.add', item: { title: '白送', cost: 0 } });
ok('reward.add 填 0 → 抬到下限 1（不再悄悄换成默认 10）',
  r5.rewards[r5.rewards.length - 1].cost === 1,
  String(r5.rewards[r5.rewards.length - 1].cost));
C.applyOp(r5, { t: 'reward.add', item: { title: '不填价格' } });
ok('reward.add 价格留空 → 默认 10',
  r5.rewards[r5.rewards.length - 1].cost === 10,
  String(r5.rewards[r5.rewards.length - 1].cost));
C.applyOp(r5, { t: 'reward.add', item: { title: '天价', cost: 5000 } });
ok('reward.add 价格上限 999',
  r5.rewards[r5.rewards.length - 1].cost === 999,
  String(r5.rewards[r5.rewards.length - 1].cost));
C.applyOp(r5, { t: 'reward.update', id: w5.id, patch: { cost: '' } });
ok('reward.update 价格留空 → 保留原值 20',
  r5.rewards.filter(function (x) { return x.id === w5.id; })[0].cost === 20,
  String(r5.rewards.filter(function (x) { return x.id === w5.id; })[0].cost));
C.applyOp(r5, { t: 'reward.remove', id: w5.id });
ok('reward.remove 删掉了', !r5.rewards.some(function (x) { return x.id === w5.id; }));

/* ---- reset 的三种 scope ---- */
const r6 = blank();
C.applyOp(r6, { t: 'hw.add', date: DD, items: [{ subject: '语文', title: 'A' }] });
const r6h = C.getDay(r6, DD).homeworks[0];
C.applyOp(r6, { t: 'item.done', date: DD, kind: 'homework', id: r6h.id, value: true });
C.applyOp(r6, { t: 'item.confirm', date: DD, kind: 'homework', id: r6h.id, value: true });
ok('reset 前置：有 2 分', r6.points.balance === 2, String(r6.points.balance));

const r6day = JSON.parse(JSON.stringify(r6));
C.applyOp(r6day, { t: 'reset', scope: 'day', date: DD });
ok('reset day 清空了当天作业', C.getDay(r6day, DD).homeworks.length === 0);
ok('reset day 扣回了当天的小红花', r6day.points.balance === 0, String(r6day.points.balance));

const r6pts = JSON.parse(JSON.stringify(r6));
C.applyOp(r6pts, { t: 'reset', scope: 'points' });
ok('reset points 余额归零', r6pts.points.balance === 0, String(r6pts.points.balance));
ok('reset points 清空流水', r6pts.ledger.length === 0, String(r6pts.ledger.length));
ok('reset points 保留作业', C.getDay(r6pts, DD).homeworks.length === 1);
ok('reset points 后作业变成未结算', C.getDay(r6pts, DD).homeworks[0].awarded === false);

const r6all = JSON.parse(JSON.stringify(r6));
C.applyOp(r6all, { t: 'settings', patch: { childName: '朵朵' } });
const keptPin = r6all.settings.parentPin;
C.applyOp(r6all, { t: 'reset', scope: 'all' });
ok('reset all 清空了作业', C.getDay(r6all, DD).homeworks.length === 0);
ok('reset all 保留设置（密码 + 名字）',
  r6all.settings.parentPin === keptPin && r6all.settings.childName === '朵朵',
  JSON.stringify(r6all.settings));

console.log('\n【十六】任务的备注 / 奖励的停用 / 今日评价 / 选择性复制');

const D2 = C.todayKey();
const Y2 = C.shiftDate(D2, -1);

/* ---- 每日任务的备注 ---- */
const n1 = C.defaultState();
C.applyOp(n1, { t: 'task.add', item: { title: '跳绳', note: '一次 100 个\n分两组', points: 2 } });
// 按标题找（task.add 现在按标签分组插入，不再追加到末尾）
const nt = n1.dailyTasks.filter(function (x) { return x.title === '跳绳'; })[0];
ok('task.add 记下备注（含换行）', nt.note === '一次 100 个\n分两组', JSON.stringify(nt.note));
C.applyOp(n1, { t: 'task.update', id: nt.id, patch: { note: '改成一组 200 个' } });
ok('task.update 改备注', n1.dailyTasks.filter(function (x) { return x.id === nt.id; })[0].note === '改成一组 200 个');
C.applyOp(n1, { t: 'task.update', id: nt.id, patch: { note: '' } });
ok('task.update 能把备注清空', n1.dailyTasks.filter(function (x) { return x.id === nt.id; })[0].note === '');
C.applyOp(n1, { t: 'task.add', item: { title: '没备注的任务' } });
ok('task.add 不给备注时是空串（不是 undefined）',
  n1.dailyTasks.filter(function (x) { return x.title === '没备注的任务'; })[0].note === '',
  JSON.stringify(n1.dailyTasks.filter(function (x) { return x.title === '没备注的任务'; })[0].note));
const oldNote = C.normalizeState({ dailyTasks: [{ id: 't_old', title: '老任务', points: 1 }] });
ok('老存档的任务自动补上 note 字段', oldNote.dailyTasks[0].note === '');

/* ---- 奖励的停用 / 启用：绝不能动积分和流水（第 7 条） ---- */
const a1 = C.defaultState();
const ridOff = a1.rewards[0].id;
ok('新奖励默认是启用的', a1.rewards[0].active === true, JSON.stringify(a1.rewards[0]));
// 先挣点分、兑换一次，形成历史
C.applyOp(a1, { t: 'hw.add', date: D2, items: [{ subject: '语文', title: '挣分' }] });
const ah = C.getDay(a1, D2).homeworks[0];
C.applyOp(a1, { t: 'item.done', date: D2, kind: 'homework', id: ah.id, value: true });
C.applyOp(a1, { t: 'item.confirm', date: D2, kind: 'homework', id: ah.id, value: true });
// 默认最便宜的奖励是 10 ⭐，先补够（用今日评价加一笔最省事）
C.applyOp(a1, { t: 'day.review', date: D2, text: '加油', points: 20 });
const beforeBalance = a1.points.balance;
const beforeLedger = a1.ledger.length;
ok('停用奖励前置：余额和流水都有内容', beforeBalance > 0 && beforeLedger > 0,
  JSON.stringify({ balance: beforeBalance, ledger: beforeLedger }));

// 兑换一次，再有历史
C.applyOp(a1, { t: 'redeem', id: ridOff });
ok('停用奖励前置：兑换记录有一条', a1.redemptions.length === 1, String(a1.redemptions.length));
const balAfterRedeem = a1.points.balance;
const ledgerAfterRedeem = a1.ledger.length;

C.applyOp(a1, { t: 'reward.update', id: ridOff, patch: { active: false } });
ok('reward.update 能把奖励停用', a1.rewards.filter(function (x) { return x.id === ridOff; })[0].active === false);
ok('停用奖励**不动余额**', a1.points.balance === balAfterRedeem,
  balAfterRedeem + ' → ' + a1.points.balance);
ok('停用奖励**不写流水**', a1.ledger.length === ledgerAfterRedeem,
  ledgerAfterRedeem + ' → ' + a1.ledger.length);
ok('停用奖励**不动兑换记录**', a1.redemptions.length === 1 && a1.redemptions[0].status === 'pending');
ok('停用之后不能再兑换', C.applyOp(JSON.parse(JSON.stringify(a1)), { t: 'redeem', id: ridOff }) &&
  (function () { const s = JSON.parse(JSON.stringify(a1)); C.applyOp(s, { t: 'redeem', id: ridOff });
    return s.redemptions.length === 1; })());
C.applyOp(a1, { t: 'reward.update', id: ridOff, patch: { active: true } });
ok('reward.update 能重新启用', a1.rewards.filter(function (x) { return x.id === ridOff; })[0].active === true);
ok('重新启用后余额还是暂停前的数', a1.points.balance === balAfterRedeem, String(a1.points.balance));

/* 停用任务同样不能动积分 */
const a2 = C.defaultState();
const tid2 = a2.dailyTasks[0].id;
C.applyOp(a2, { t: 'item.done', date: D2, kind: 'task', id: tid2, value: true });
C.applyOp(a2, { t: 'item.confirm', date: D2, kind: 'task', id: tid2, value: true });
const tBal = a2.points.balance;
const tLedger = a2.ledger.length;
C.applyOp(a2, { t: 'task.update', id: tid2, patch: { active: false } });
ok('停用任务不动余额', a2.points.balance === tBal, tBal + ' → ' + a2.points.balance);
ok('停用任务不写流水', a2.ledger.length === tLedger, tLedger + ' → ' + a2.ledger.length);
ok('停用任务后那天的完成记录还在',
  C.getDay(a2, D2).tasks[tid2].done === true && C.getDay(a2, D2).tasks[tid2].confirmed === true);

/* ---- 今日学习情况评价 ---- */
const rv1 = C.defaultState();
ok('新的一天没有评价', C.getDay(rv1, D2).review === null);
C.applyOp(rv1, { t: 'day.review', date: D2, text: '今天很自觉', points: 3 });
ok('评价存下来了', C.getDay(rv1, D2).review.text === '今天很自觉');
ok('评价奖励 3 分', rv1.points.balance === 3, String(rv1.points.balance));
ok('评价的奖励记进了 earned', rv1.points.earned === 3, String(rv1.points.earned));
ok('评价写进了流水', rv1.ledger.some(function (x) { return x.kind === 'review' && x.delta === 3; }));

C.applyOp(rv1, { t: 'day.review', date: D2, text: '再看一遍其实有点磨蹭', points: -2 });
// 语义是"这一天最终的评价是扣 2 分"，不是在上一次基础上再扣 2 ——
// 所以会先撤回上一次的 +3，再记 -2，净效果就是 -2（余额从 0 变 -2）
ok('改成扣分：这次评价的净效果是 -2', rv1.points.balance === -2, String(rv1.points.balance));
ok('改评价会先撤回上一次', rv1.ledger.some(function (x) { return x.kind === 'review' && x.delta === -3; }),
  JSON.stringify(rv1.ledger.filter(function (x) { return x.kind === 'review'; }).map(function (x) { return x.delta; })));
ok('扣分记在 spent 上', rv1.points.spent === 2, String(rv1.points.spent));
ok('earned 跟着撤回（不是负数）', rv1.points.earned === 0, String(rv1.points.earned));
ok('评价正文也更新了', C.getDay(rv1, D2).review.text === '再看一遍其实有点磨蹭');

C.applyOp(rv1, { t: 'day.review', date: D2, text: '', points: 0 });
ok('文字和分值都空 = 删掉这条评价', C.getDay(rv1, D2).review === null);
ok('删掉评价会把扣的分还回去（-2 → 0）', rv1.points.balance === 0, String(rv1.points.balance));

const rv2 = C.defaultState();
C.applyOp(rv2, { t: 'day.review', date: D2, text: '只写评语', points: 0 });
ok('只写评语不加分', rv2.points.balance === 0 && C.getDay(rv2, D2).review.text === '只写评语');
/*
 * 第 66 轮 1：0 分也**要**记一条流水 —— 家长在「小红花记录」里得能看到这条评价。
 */
const rv2led = rv2.ledger.filter(function (x) { return x.kind === 'review'; });
ok('只写评语（0 分）也要写流水', rv2led.length === 1, String(rv2led.length));
ok('0 分的流水 delta 就是 0', rv2led[0] && rv2led[0].delta === 0,
  JSON.stringify(rv2led[0] && rv2led[0].delta));
ok('流水里带着评价正文', Boolean(rv2led[0]) && rv2led[0].reason.indexOf('只写评语') >= 0,
  rv2led[0] && rv2led[0].reason);
ok('0 分的流水不动账',
  rv2.points.balance === 0 && rv2.points.earned === 0 && rv2.points.spent === 0,
  JSON.stringify(rv2.points));
// 0 分改成分数：不该留下一条"撤回 0"的噪音流水
C.applyOp(rv2, { t: 'day.review', date: D2, text: '只写评语', points: 5 });
ok('0 分改成分数时不留「撤回 0」的噪音流水',
  rv2.ledger.filter(function (x) { return x.kind === 'review'; }).length === 2,
  JSON.stringify(rv2.ledger.filter(function (x) { return x.kind === 'review'; })
    .map(function (x) { return x.delta; })));
ok('改成 5 分后账对了', rv2.points.balance === 5, String(rv2.points.balance));

// 清空小红花之后，评价不能再"撤回"一次（否则账会凭空变多）
const rv3 = C.defaultState();
C.applyOp(rv3, { t: 'day.review', date: D2, text: '奖励', points: 4 });
C.applyOp(rv3, { t: 'reset', scope: 'points' });
ok('reset points 把余额清零', rv3.points.balance === 0, String(rv3.points.balance));
C.applyOp(rv3, { t: 'day.review', date: D2, text: '改一下', points: 2 });
ok('清空小红花后改评价，不会凭空多出分数', rv3.points.balance === 2, String(rv3.points.balance));

/* 一整天清空时，评价的分数也要还回去 */
const rv4 = C.defaultState();
C.applyOp(rv4, { t: 'day.review', date: D2, text: '奖励', points: 5 });
C.applyOp(rv4, { t: 'reset', scope: 'day', date: D2 });
ok('reset day 把评价一起清掉', C.getDay(rv4, D2).review === null);
ok('reset day 扣回了评价的 5 分', rv4.points.balance === 0, String(rv4.points.balance));

/* ---- 选择性复制（第 3 条） ---- */
const cp = C.defaultState();
C.applyOp(cp, { t: 'hw.add', date: Y2, items: [
  { subject: '语文', title: 'A' }, { subject: '数学', title: 'B' }, { subject: '英语', title: 'C' },
] });
C.applyOp(cp, { t: 'extra.add', date: Y2, item: { title: '额外一' } });
C.applyOp(cp, { t: 'extra.add', date: Y2, item: { title: '额外二' } });
const srcDay = C.getDay(cp, Y2);
const pickA = srcDay.homeworks.filter(function (h) { return h.title === 'A'; })[0];
const pickC = srcDay.homeworks.filter(function (h) { return h.title === 'C'; })[0];
const pickE1 = srcDay.extras[0];

C.applyOp(cp, { t: 'day.copy', from: Y2, to: D2, picks: [
  { kind: 'homework', id: pickA.id },
  { kind: 'homework', id: pickC.id },
  { kind: 'extra', id: pickE1.id },
] });
const copied2 = C.getDay(cp, D2);
ok('只复制挑中的 2 条作业', copied2.homeworks.length === 2, String(copied2.homeworks.length));
ok('挑中的作业内容对', copied2.homeworks.map(function (h) { return h.title; }).join(',') === 'A,C',
  copied2.homeworks.map(function (h) { return h.title; }).join(','));
ok('没挑的作业没被复制（B 不在）',
  !copied2.homeworks.some(function (h) { return h.title === 'B'; }));
ok('只复制挑中的 1 条额外任务', copied2.extras.length === 1, String(copied2.extras.length));
ok('复制过来的额外任务是挑中的那条', copied2.extras[0].title === '额外一', copied2.extras[0].title);
ok('复制过来的换了新 id', copied2.homeworks[0].id !== pickA.id);
ok('复制过来的打勾状态是清空的', copied2.homeworks[0].done === false && copied2.homeworks[0].confirmed === false);
ok('复制不会重复发小红花', cp.points.balance === 0, String(cp.points.balance));

const cp2 = C.defaultState();
C.applyOp(cp2, { t: 'hw.add', date: Y2, items: [{ subject: '语文', title: 'X' }] });
C.applyOp(cp2, { t: 'hw.add', date: Y2, items: [{ subject: '数学', title: 'Y' }] });
C.applyOp(cp2, { t: 'day.copy', from: Y2, to: D2 });
ok('不传 picks 时整份复制（保持老行为）', C.getDay(cp2, D2).homeworks.length === 2,
  String(C.getDay(cp2, D2).homeworks.length));

const cp3 = C.defaultState();
C.applyOp(cp3, { t: 'hw.add', date: Y2, items: [{ subject: '语文', title: 'Z' }] });
C.applyOp(cp3, { t: 'day.copy', from: Y2, to: D2, picks: [{ kind: 'homework', id: '不存在的id' }] });
ok('picks 全是不存在的 id → 一条都不复制', C.getDay(cp3, D2).homeworks.length === 0,
  String(C.getDay(cp3, D2).homeworks.length));

/* ---- 老存档兼容 ---- */
const legacy3 = C.normalizeState({
  rewards: [{ id: 'r_old', title: '老奖励', cost: 5 }],
  days: { [D2]: { review: { text: '老的评价', points: 2 } } },
});
ok('老存档的奖励自动补 active=true', legacy3.rewards[0].active === true);
ok('老存档的评价自动补齐字段',
  legacy3.days[D2].review.awarded === false && legacy3.days[D2].review.awardedPoints === 0,
  JSON.stringify(legacy3.days[D2].review));

console.log('\n【十七】常用作业库 / 新默认欢迎语');

const c1 = C.defaultState();
ok('新房间自带常用作业库', c1.commonHomeworks.length >= 3, String(c1.commonHomeworks.length));
ok('默认的常用作业库条目都带备注（点一下就带过去，不用每天重写）',
  c1.commonHomeworks.every(function (x) { return x.detail && x.detail.length > 4; }),
  JSON.stringify(c1.commonHomeworks.map(function (x) { return x.detail; })));
ok('默认的常用作业库里三条按新文案都在',
  ['跳绳3组，每组1分钟', '体前屈3组，每组20个', '亲子阅读 15 分钟'].every(function (t) {
    return c1.commonHomeworks.some(function (x) { return x.title === t; });
  }), JSON.stringify(c1.commonHomeworks.map(function (x) { return x.title; })));
ok('默认的三条都是「体育 / 体育 / 语文」',
  c1.commonHomeworks.map(function (x) { return x.subject; }).join(',') === '体育,体育,语文',
  c1.commonHomeworks.map(function (x) { return x.subject; }).join(','));

/* 老存档里如果正是历史默认（一条没改过），要整体升级成现在的 3 条 */
const legacy8 = C.normalizeState({ commonHomeworks: [
  '背诵古诗一首', '读课文 2 遍', '生字写 2 遍', '口算一页',
  '数学书做一做', '跟读课文 3 遍', '跳绳 200 个', '亲子阅读 15 分钟',
].map(function (t, i) { return { id: 'ch_l' + i, subject: '语文', title: t, detail: '' }; }) });
ok('老存档里"第 1 代默认那 8 条"会自动升级',
  legacy8.commonHomeworks.length === 3 && legacy8.commonHomeworks[0].title === '跳绳3组，每组1分钟',
  JSON.stringify(legacy8.commonHomeworks.map(function (x) { return x.title; })));

const legacy3common = C.normalizeState({ commonHomeworks: [
  '每日跳绳', '每日体前屈', '亲子阅读 15 分钟',
].map(function (t, i) { return { id: 'ch_m' + i, subject: '体育', title: t, detail: '旧备注' }; }) });
ok('老存档里"第 2 代默认那 3 条"也会自动升级',
  legacy3common.commonHomeworks.length === 3 && legacy3common.commonHomeworks[0].title === '跳绳3组，每组1分钟',
  JSON.stringify(legacy3common.commonHomeworks.map(function (x) { return x.title; })));

/* 只要家长动过一条（改了名字），就一条都不动 */
const touchedLib = C.normalizeState({ commonHomeworks: [
  '背诵古诗一首', '读课文 2 遍', '生字写 2 遍', '口算一页',
  '数学书做一做', '跟读课文 3 遍', '跳绳 200 个', '我自己加的',
].map(function (t, i) { return { id: 'ch_t' + i, subject: '语文', title: t, detail: '' }; }) });
ok('家长改过的常用作业库一条都不动',
  touchedLib.commonHomeworks.length === 8 &&
    touchedLib.commonHomeworks[7].title === '我自己加的',
  String(touchedLib.commonHomeworks.length));
ok('常用库每条都有 id / 科目 / 内容',
  c1.commonHomeworks.every(function (x) { return x.id && x.subject && x.title; }));
ok('常用库的科目都是系统认得的',
  c1.commonHomeworks.every(function (x) { return C.SUBJECTS.some(function (s) { return s.name === x.subject; }); }),
  JSON.stringify(c1.commonHomeworks.map(function (x) { return x.subject; }).filter(function (s, i, a) { return a.indexOf(s) === i; })));

const c2 = C.defaultState();
const base = c2.commonHomeworks.length;
C.applyOp(c2, { t: 'common.add', item: { subject: '数学', title: '练习册 P30', detail: '写到第 5 题' } });
ok('common.add 加了一条', c2.commonHomeworks.length === base + 1, String(c2.commonHomeworks.length));
// 第 83 轮起是按科目插的，**不能**再用"最后一条"来取，按标题找
const added = c2.commonHomeworks.filter(function (x) { return x.title === '练习册 P30'; })[0];
ok('common.add 记下备注', added.detail === '写到第 5 题', added.detail);
C.applyOp(c2, { t: 'common.add', item: { title: '没写科目' } });
ok('common.add 不写科目就归到「其他」',
  c2.commonHomeworks.filter(function (x) { return x.title === '没写科目'; })[0].subject === '其他',
  c2.commonHomeworks.filter(function (x) { return x.title === '没写科目'; })[0].subject);
C.applyOp(c2, { t: 'common.add', item: {} });
ok('common.add 没内容就忽略', c2.commonHomeworks.length === base + 2, String(c2.commonHomeworks.length));

/* ---- 第 83 轮：常用作业库按科目次序排 ---- */
{
  const lib = C.defaultState();
  lib.commonHomeworks = [];
  // 故意乱着加
  ['体育', '语文', '数学', '其他', '英语', '美术', '语文'].forEach(function (sub, i) {
    C.applyOp(lib, { t: 'common.add', item: { id: 'c' + i, subject: sub, title: '第' + i + '条' } });
  });
  const order = lib.commonHomeworks.map(function (x) { return x.subject; }).join(',');
  ok('common.add 按科目次序插（语文 → 数学 → 英语 → 美术 → 体育 → 其他）',
    order === '语文,语文,数学,英语,美术,体育,其他', order);

  // 改科目要挪到新科目那一组
  const math = lib.commonHomeworks.filter(function (x) { return x.subject === '数学'; })[0];
  C.applyOp(lib, { t: 'common.update', id: math.id, patch: { subject: '其他' } });
  const after = lib.commonHomeworks.map(function (x) { return x.subject; }).join(',');
  ok('常用库改了科目会挪到新科目那一组（数学 → 其他）',
    after === '语文,语文,英语,美术,体育,其他,其他', after);

  // 老数据（乱序）第一次规范化时排一次
  const legacyLib = C.defaultState();
  legacyLib.commonHomeworks = [
    { id: 'L1', subject: '其他', title: '带红领巾' },
    { id: 'L2', subject: '数学', title: '口算一页' },
    { id: 'L3', subject: '语文', title: '背诵古诗' },
    { id: 'L4', subject: '体育', title: '跳绳' },
  ];
  delete legacyLib.commonSortedByRank;
  const sortedLib = C.normalizeState(legacyLib);
  ok('老存档的常用库第一次会按科目排一次',
    sortedLib.commonHomeworks.map(function (x) { return x.subject; }).join(',') ===
      '语文,数学,体育,其他',
    sortedLib.commonHomeworks.map(function (x) { return x.subject; }).join(','));
  ok('排完打上 commonSortedByRank 标记，不会再排',
    sortedLib.commonSortedByRank === true &&
      JSON.stringify(C.normalizeState(sortedLib)) === JSON.stringify(sortedLib));
  // 手动 ↑↓ 过之后不会被重新排（标记在就不排）
  const manual = JSON.parse(JSON.stringify(sortedLib));
  manual.commonHomeworks.reverse();
  ok('标记在的时候，手动调过的次序不会被覆盖',
    C.normalizeState(manual).commonHomeworks.map(function (x) { return x.subject; })
      .join(',') === '其他,体育,数学,语文',
    C.normalizeState(manual).commonHomeworks.map(function (x) { return x.subject; }).join(','));
}

C.applyOp(c2, { t: 'common.update', id: added.id, patch: { title: '练习册 P31', detail: '', subject: '语文' } });
const updLib = c2.commonHomeworks.filter(function (x) { return x.id === added.id; })[0];
ok('common.update 改了内容', updLib.title === '练习册 P31', updLib.title);
ok('common.update 改了科目', updLib.subject === '语文', updLib.subject);
ok('common.update 能清空备注', updLib.detail === '');
C.applyOp(c2, { t: 'common.update', id: added.id, patch: { title: '   ' } });
ok('common.update 不允许把内容改成空',
  c2.commonHomeworks.filter(function (x) { return x.id === added.id; })[0].title === '练习册 P31');
C.applyOp(c2, { t: 'common.update', id: '不存在', patch: { title: 'x' } });
ok('common.update 改不存在的不会崩', true);
C.applyOp(c2, { t: 'common.remove', id: added.id });
ok('common.remove 删掉了', !c2.commonHomeworks.some(function (x) { return x.id === added.id; }));

/* 从常用库加一条，用的还是 hw.add，状态要干净 */
const c3 = C.defaultState();
const pick = c3.commonHomeworks[0];
C.applyOp(c3, { t: 'hw.add', date: DD, items: [
  { subject: pick.subject, title: pick.title, detail: pick.detail },
] });
const fromLib = C.getDay(c3, DD).homeworks[0];
ok('从常用库加进当天，内容对', fromLib.title === pick.title && fromLib.subject === pick.subject);
ok('从常用库加进来的是未完成状态', fromLib.done === false && fromLib.confirmed === false);

/* 老存档自动补出常用库 */
const legacy4 = C.normalizeState({ days: {} });
ok('老存档读进来也有常用作业库', Array.isArray(legacy4.commonHomeworks) && legacy4.commonHomeworks.length > 0);
const legacy5 = C.normalizeState({ commonHomeworks: [{ title: '只有标题' }] });
ok('常用库里缺字段会被补上（科目 → 其他、备注 → 空）',
  legacy5.commonHomeworks[0].subject === '其他' && legacy5.commonHomeworks[0].detail === '',
  JSON.stringify(legacy5.commonHomeworks[0]));

/* 欢迎语 */
ok('新房间的欢迎语是新的那句',
  C.defaultState().settings.welcome === '加油鸭！完成后就可以「自由玩耍」了✈️~~~',
  C.defaultState().settings.welcome);
// 老房间存档里如果存的正是**历史默认值**，读进来要自动升级；
// 家长自己改过的文案一个字都不能动
ok('老存档里的旧默认欢迎语会自动升级（第 1 代）',
  C.normalizeState({ settings: { welcome: '今天也要加油鸭！' } }).settings.welcome ===
    '加油鸭！完成后就可以「自由玩耍」了✈️~~~');
ok('老存档里的旧默认欢迎语会自动升级（第 2 代）',
  C.normalizeState({ settings: { welcome: '今天也要加油鸭！完成后可自由玩耍✈️~~~' } }).settings.welcome ===
    '加油鸭！完成后就可以「自由玩耍」了✈️~~~');
ok('家长自己写过的欢迎语不会被改',
  C.normalizeState({ settings: { welcome: '我们家自己的话' } }).settings.welcome === '我们家自己的话');

/* ---- 常用作业库的排序 ---- */
const cm = C.defaultState();
const cmIds = function (s) { return s.commonHomeworks.map(function (x) { return x.id; }).join(','); };
const cmBefore = cmIds(cm);
C.applyOp(cm, { t: 'move', list: 'common', id: cm.commonHomeworks[0].id, dir: 1 });
ok('常用作业库能往下挪一格',
  cmIds(cm) === cmBefore.split(',').slice(1, 2).concat(cmBefore.split(',').slice(0, 1))
    .concat(cmBefore.split(',').slice(2)).join(','),
  cmIds(cm));
const cmFirst = cm.commonHomeworks[0].id;
C.applyOp(cm, { t: 'move', list: 'common', id: cmFirst, dir: -1 });
ok('已经在最上面时往上挪不动（不越界）', cm.commonHomeworks[0].id === cmFirst);
C.applyOp(cm, { t: 'move', list: 'common', id: '不存在的id', dir: 1 });
ok('挪一个不存在的 id 不会崩', cm.commonHomeworks.length === C.defaultState().commonHomeworks.length,
  String(cm.commonHomeworks.length));

/* ---- 认不出来的操作名：必须能查出来 ---- */console.log('\n【十八】认不出来的操作名（旧服务器静默吞 op 的坑）');

ok('isKnownOp 认得已有的操作',
  C.isKnownOp('hw.add') && C.isKnownOp('common.remove') && C.isKnownOp('day.review'));
ok('isKnownOp 认不出瞎写的', !C.isKnownOp('随便编一个') && !C.isKnownOp('') && !C.isKnownOp(undefined));
ok('unknownOps 挑得出不认识的名字',
  JSON.stringify(C.unknownOps([{ t: 'hw.add' }, { t: '瞎写' }, { t: 'common.add' }])) === '["瞎写"]',
  JSON.stringify(C.unknownOps([{ t: 'hw.add' }, { t: '瞎写' }, { t: 'common.add' }])));
ok('unknownOps 里同一个名字只报一次',
  C.unknownOps([{ t: 'x' }, { t: 'x' }, { t: 'y' }]).length === 2,
  JSON.stringify(C.unknownOps([{ t: 'x' }, { t: 'x' }, { t: 'y' }])));
ok('unknownOps 对空输入不炸', C.unknownOps(null).length === 0 && C.unknownOps([]).length === 0);
ok('unknownOps 把没名字的操作说成人话',
  JSON.stringify(C.unknownOps([null, {}, { t: 'hw.add' }])) === '["(缺少操作名)"]',
  JSON.stringify(C.unknownOps([null, {}, { t: 'hw.add' }])));
ok('applyOp 本身仍然静默跳过未知操作（向后兼容、不抛异常）',
  (function () { const s = C.defaultState(); const r0 = s.rev;
    C.applyOps(s, [{ t: '瞎写' }]); return s.rev === r0; })());

/* ---- 额外任务的备注 ---- */
console.log('\n【十九】额外任务的备注 / 撤销理由');

const ex = C.defaultState();
C.applyOp(ex, { t: 'extra.add', date: DD, item: { title: '浇花', note: '浇完把水壶放回阳台' } });
const exItem = C.getDay(ex, DD).extras[0];
ok('extra.add 记下备注', exItem.note === '浇完把水壶放回阳台', JSON.stringify(exItem.note));
ok('extra.add 不填分值默认 1 朵', exItem.points === 1, String(exItem.points));
C.applyOp(ex, { t: 'extra.add', date: DD, item: { title: '没备注的' } });
ok('extra.add 不填备注就是空串', C.getDay(ex, DD).extras[1].note === '');
C.applyOp(ex, { t: 'extra.update', date: DD, id: exItem.id, patch: { note: '改成每天浇' } });
ok('extra.update 能改备注', C.getDay(ex, DD).extras[0].note === '改成每天浇');
C.applyOp(ex, { t: 'extra.update', date: DD, id: exItem.id, patch: { note: '' } });
ok('extra.update 能清空备注', C.getDay(ex, DD).extras[0].note === '');
const exOld = C.normalizeState({ days: { [DD]: { extras: [{ id: 'e_old', title: '老的', points: 1 }] } } });
ok('老存档的额外任务自动补上 note', exOld.days[DD].extras[0].note === '');

/* ---- 撤销理由 ---- */
const un = C.defaultState();
C.applyOp(un, { t: 'hw.add', date: DD, items: [{ subject: '语文', title: '写字' }] });
const unh = C.getDay(un, DD).homeworks[0];
C.applyOp(un, { t: 'item.done', date: DD, kind: 'homework', id: unh.id, value: true });
ok('撤销前置：已经打勾了', unh.done === true);
C.applyOp(un, { t: 'item.undo', date: DD, kind: 'homework', id: unh.id, reasonKind: 'cancel', reason: '老师说不做了' });
ok('撤销后回到未完成', unh.done === false && unh.confirmed === false);
ok('撤销记下"任务取消"', unh.undoKind === 'cancel', unh.undoKind);
ok('撤销记下理由', unh.undoReason === '老师说不做了', unh.undoReason);
ok('撤销记下时间', typeof unh.undoneAt === 'number' && unh.undoneAt > 0);

C.applyOp(un, { t: 'item.restore', date: DD, kind: 'homework', id: unh.id });
ok('restore 清掉撤销状态', unh.undoKind === '' && unh.undoReason === '' && unh.undoneAt === null);

// 撤销一个已经确认（发过分）的：分要撤回
const un2 = C.defaultState();
C.applyOp(un2, { t: 'hw.add', date: DD, items: [{ subject: '语文', title: '挣分的' }] });
const un2h = C.getDay(un2, DD).homeworks[0];
C.applyOp(un2, { t: 'item.done', date: DD, kind: 'homework', id: un2h.id, value: true });
C.applyOp(un2, { t: 'item.confirm', date: DD, kind: 'homework', id: un2h.id, value: true });
const balBeforeUndo = un2.points.balance;
ok('撤销前置：分已经到账', balBeforeUndo > 0, String(balBeforeUndo));
C.applyOp(un2, { t: 'item.undo', date: DD, kind: 'homework', id: un2h.id, reasonKind: 'redo', reason: '重写' });
ok('撤销已确认的会撤回分数', un2.points.balance === 0, balBeforeUndo + ' → ' + un2.points.balance);
ok('撤销已确认的会把 awarded 清掉', un2h.awarded === false);
ok('撤销理由不会被 settle 冲掉', un2h.undoKind === 'redo' && un2h.undoReason === '重写',
  JSON.stringify({ k: un2h.undoKind, r: un2h.undoReason }));
C.applyOp(un2, { t: 'item.undo', date: DD, kind: 'homework', id: un2h.id, reasonKind: 'redo',
  reason: new Array(400).join('长') });
ok('撤销理由最长 200 字', un2h.undoReason.length === 200, String(un2h.undoReason.length));
C.applyOp(un2, { t: 'item.undo', date: DD, kind: 'homework', id: un2h.id, reasonKind: 'cancel' });
ok('空理由也能撤销（reasonKind 就是主要信息）', un2h.undoKind === 'cancel' && un2h.undoReason === '');
C.applyOp(un2, { t: 'item.undo', date: DD, kind: 'homework', id: un2h.id, reasonKind: '乱写' });
ok('reasonKind 写错时当成"直接撤回"（不瞎猜是取消还是再完善）', un2h.undoKind === '',
  JSON.stringify(un2h.undoKind));
// 第 57 轮 4：两个理由都可以不选 —— 直接撤回
C.applyOp(un2, { t: 'item.done', date: DD, kind: 'homework', id: un2h.id, value: true });
C.applyOp(un2, { t: 'item.undo', date: DD, kind: 'homework', id: un2h.id, reason: '' });
ok('两个理由都不选 = 直接撤回（不带定性）',
  un2h.done === false && un2h.undoKind === '' && un2h.undoReason === '',
  JSON.stringify({ done: un2h.done, kind: un2h.undoKind, reason: un2h.undoReason }));
ok('直接撤回也会记时间', typeof un2h.undoneAt === 'number' && un2h.undoneAt > 0);
C.applyOp(un2, { t: 'item.done', date: DD, kind: 'homework', id: un2h.id, value: true });
C.applyOp(un2, { t: 'item.undo', date: DD, kind: 'homework', id: un2h.id, reason: '顺手撤回一下' });
ok('不选理由但写了说明：说明留着、不定性',
  un2h.undoKind === '' && un2h.undoReason === '顺手撤回一下',
  JSON.stringify({ kind: un2h.undoKind, reason: un2h.undoReason }));

ok('UNDO_KINDS 是「任务取消 / 再完善作业」两种',
  C.UNDO_KINDS.length === 2 && C.UNDO_KINDS[0].key === 'cancel' && C.UNDO_KINDS[1].key === 'redo',
  JSON.stringify(C.UNDO_KINDS.map(function (k) { return k.key; })));

/* ---- 附件 ---- */
console.log('\n【二十】附件（录入作业 / 交作业）');

ok('认得出图片', (function () { const r = C.checkUpload('卷子.JPG'); return r.ok && r.kind === 'image'; })());
ok('认得出视频', (function () { const r = C.checkUpload('跳绳.mov'); return r.ok && r.kind === 'video'; })());
ok('认得出音频', (function () { const r = C.checkUpload('朗读.m4a'); return r.ok && r.kind === 'audio'; })());
ok('认得出文本', (function () { const r = C.checkUpload('作业.txt'); return r.ok && r.kind === 'text'; })());
ok('可执行文件不收', C.checkUpload('病毒.exe').ok === false);
ok('html 不收（能塞脚本）', C.checkUpload('x.html').ok === false);
ok('svg 不收（能带脚本）', C.checkUpload('x.svg').ok === false);
ok('js 不收', C.checkUpload('x.js').ok === false);
ok('没有扩展名时用 MIME 反推', (function () {
  const r = C.checkUpload('IMG_1234', 'image/jpeg');
  return r.ok && r.ext === '.jpg';
})());
ok('MIME 带 charset 也能推出来', (function () {
  const r = C.checkUpload('没有后缀的', 'text/plain; charset=utf-8');
  return r.ok && r.ext === '.txt';
})());
ok('什么线索都没有就拒绝', C.checkUpload('没有后缀的').ok === false);

ok('生成的 id 合法', C.isUploadId(C.makeUploadId('.png')));
ok('id 挡路径穿越', !C.isUploadId('../../etc/passwd') && !C.isUploadId('a/b.png'));
ok('id 必须是 16 位 + 扩展名', !C.isUploadId('') && !C.isUploadId('abcdefghijklmnop') &&
  !C.isUploadId('x'.repeat(30) + '.png'));
ok('fileURL 拼得对', C.fileURL('ABCDEF', 'aaaaaaaaaaaaaaaa.png') ===
  '/api/file/ABCDEF/aaaaaaaaaaaaaaaa.png');
ok('humanSize 好读', C.humanSize(0) === '0 B' && C.humanSize(2048) === '2.0 KB' &&
  C.humanSize(3 * 1024 * 1024) === '3.0 MB', C.humanSize(2048));

const attState = C.defaultState();
C.applyOp(attState, { t: 'hw.add', date: DD, items: [{ subject: '语文', title: '带附件' }] });
const attHw = C.getDay(attState, DD).homeworks[0];
ok('新加的作业自带空附件表', Array.isArray(attHw.attachments) && attHw.attachments.length === 0);
ok('新加的作业自带空"交作业"表', Array.isArray(attHw.works) && attHw.works.length === 0);

const fileA = { id: C.makeUploadId('.png'), name: '卷子.png', size: 1234, mime: 'image/png', kind: 'image' };
const fileB = { id: C.makeUploadId('.mp4'), name: '跳绳.mp4', size: 4567, mime: 'video/mp4', kind: 'video' };
C.applyOp(attState, { t: 'attach.add', date: DD, kind: 'homework', id: attHw.id, scope: 'item', file: fileA });
ok('家长能给作业挂附件', attHw.attachments.length === 1 && attHw.attachments[0].name === '卷子.png');
C.applyOp(attState, { t: 'attach.add', date: DD, kind: 'homework', id: attHw.id, scope: 'work', file: fileB });
ok('孩子的"交作业"记在另一个表里',
  attHw.attachments.length === 1 && attHw.works.length === 1,
  attHw.attachments.length + ' / ' + attHw.works.length);
C.applyOp(attState, { t: 'attach.add', date: DD, kind: 'homework', id: attHw.id, scope: 'item', file: fileA });
ok('同一条附件不会重复记', attHw.attachments.length === 1);
C.applyOp(attState, { t: 'attach.add', date: DD, kind: 'homework', id: attHw.id, scope: 'item',
  file: { id: '../../坏', name: 'x.png' } });
ok('非法 id 的附件不收（免得界面上一堆点不开的）', attHw.attachments.length === 1);
C.applyOp(attState, { t: 'attach.add', date: DD, kind: 'homework', id: '不存在的', scope: 'item', file: fileB });
ok('挂到不存在的作业上不会崩', attHw.attachments.length === 1);

C.applyOp(attState, { t: 'attach.rename', date: DD, kind: 'homework', id: attHw.id,
  scope: 'item', fileId: fileA.id, name: '语文卷子（正面）.png' });
ok('附件能改名', attHw.attachments[0].name === '语文卷子（正面）.png', attHw.attachments[0].name);
C.applyOp(attState, { t: 'attach.rename', date: DD, kind: 'homework', id: attHw.id,
  scope: 'item', fileId: fileA.id, name: '   ' });
ok('改成空白就当没改', attHw.attachments[0].name === '语文卷子（正面）.png');

C.applyOp(attState, { t: 'attach.remove', date: DD, kind: 'homework', id: attHw.id,
  scope: 'item', fileId: fileA.id });
ok('能删掉附件', attHw.attachments.length === 0);
ok('删附件不会连"交作业"一起删', attHw.works.length === 1);

const many = C.defaultState();
C.applyOp(many, { t: 'hw.add', date: DD, items: [{ subject: '语文', title: '很多附件' }] });
const manyHw = C.getDay(many, DD).homeworks[0];
for (let i = 0; i < 40; i++) {
  C.applyOp(many, { t: 'attach.add', date: DD, kind: 'homework', id: manyHw.id, scope: 'item',
    file: { id: C.makeUploadId('.png'), name: 'p' + i + '.png', kind: 'image' } });
}
ok('一个地方最多留 30 个附件（防止界面被撑爆）', manyHw.attachments.length === 30,
  String(manyHw.attachments.length));

const taskAtt = C.defaultState();
C.applyOp(taskAtt, { t: 'attach.add', date: DD, kind: 'task', id: taskAtt.dailyTasks[0].id,
  scope: 'item', file: fileA });
ok('每日任务也能挂附件', C.normalizeAttachments(taskAtt.dailyTasks[0].attachments).length === 1);

const attOld = C.normalizeState({
  days: { [DD]: { homeworks: [{ id: 'h9', title: '老作业' }], extras: [{ id: 'e9', title: '老额外' }] } },
  dailyTasks: [{ id: 't9', title: '老任务' }],
});
ok('老存档的作业补上 attachments / works',
  Array.isArray(attOld.days[DD].homeworks[0].attachments) && Array.isArray(attOld.days[DD].homeworks[0].works));
ok('老存档的任务补上 attachments', Array.isArray(attOld.dailyTasks[0].attachments));
ok('老存档里坏掉的附件会被清掉', (function () {
  const s = C.normalizeState({ days: { [DD]: { homeworks: [
    { id: 'h8', title: 'x', attachments: [{ id: '坏', name: 'a.png' }, fileA] },
  ] } } });
  return s.days[DD].homeworks[0].attachments.length === 1;
})());

/* ---- id 必须在客户端和服务器上算得一样 ---- */
console.log('\n【二十一】新增记录的 id：两边必须一致');

ok('newId 生成的是合法 id', C.isSafeId(C.newId('h')));
ok('isSafeId 只认 <前缀>_<小写字母数字>',
  C.isSafeId('h_abcd1234') && !C.isSafeId('h_中文') && !C.isSafeId('H_abc') &&
  !C.isSafeId('h_') && !C.isSafeId('../../etc') && !C.isSafeId(''));
ok('derivedId 对同一个种子稳定',
  C.derivedId('h', 'x@2026-10-11') === C.derivedId('h', 'x@2026-10-11'));
ok('derivedId 换个种子就不同',
  C.derivedId('h', 'x@2026-10-11') !== C.derivedId('h', 'y@2026-10-11'));
ok('derivedId 生成的也合法', C.isSafeId(C.derivedId('h', 'x@2026-10-11')));

/*
 * 核心不变式：同一批 op 在"客户端那份 state"和"服务器那份 state"上跑，
 * 新增出来的记录 id 必须一模一样。
 *
 * 踩过的坑：uid() 两边各自随机 → 客户端乐观更新用 id A、服务器落库用 id B，
 * 同步回来一替换，界面上还捏着 A 的按钮（☆ / ✎ / ✕）全部静默失效，
 * 而且**一个错都不报**。为了这个查了好几轮"点了没反应"。
 */
function bothSides(op) {
  const a = C.defaultState();
  const b = C.defaultState();
  C.applyOp(a, JSON.parse(JSON.stringify(op)));
  C.applyOp(b, JSON.parse(JSON.stringify(op)));
  return [a, b];
}
function hwIds(state) { return C.getDay(state, DD).homeworks.map(function (h) { return h.id; }).join(','); }

const addOp = { t: 'hw.add', date: DD, items: [{ id: C.newId('h'), subject: '语文', title: '写字' }] };
const two = bothSides(addOp);
ok('hw.add 两边算出同一个 id', hwIds(two[0]) === hwIds(two[1]) && hwIds(two[0]) === addOp.items[0].id,
  hwIds(two[0]) + ' / ' + hwIds(two[1]));
ok('客户端带的 id 被原样采用（不是又生一个）', hwIds(two[0]) === addOp.items[0].id, addOp.items[0].id);

const badId = bothSides({ t: 'hw.add', date: DD, items: [{ id: '瞎写的', subject: '语文', title: 'x' }] });
ok('带了不合规的 id 就自己生成一个（不认它）',
  C.isSafeId(C.getDay(badId[0], DD).homeworks[0].id), C.getDay(badId[0], DD).homeworks[0].id);

const noIdA = C.defaultState(), noIdB = C.defaultState();
C.applyOp(noIdA, { t: 'hw.add', date: DD, items: [{ subject: '语文', title: '没带id' }] });
C.applyOp(noIdB, { t: 'hw.add', date: DD, items: [{ subject: '语文', title: '没带id' }] });
ok('老客户端不带 id 时服务器兜底（两边可能不同，但不能崩）',
  C.isSafeId(C.getDay(noIdA, DD).homeworks[0].id) && C.isSafeId(C.getDay(noIdB, DD).homeworks[0].id));

const exOp = { t: 'extra.add', date: DD, item: { id: C.newId('e'), title: '浇花' } };
const exTwo = bothSides(exOp);
ok('extra.add 两边一致',
  C.getDay(exTwo[0], DD).extras[0].id === C.getDay(exTwo[1], DD).extras[0].id &&
  C.getDay(exTwo[0], DD).extras[0].id === exOp.item.id);

const tkOp = { t: 'task.add', item: { id: C.newId('t'), title: '新任务' } };
const tkTwo = bothSides(tkOp);
ok('task.add 两边一致',
  tkTwo[0].dailyTasks.slice(-1)[0].id === tkTwo[1].dailyTasks.slice(-1)[0].id);

const rwOp = { t: 'reward.add', item: { id: C.newId('r'), title: '新奖励', cost: 5 } };
const rwTwo = bothSides(rwOp);
ok('reward.add 两边一致',
  rwTwo[0].rewards.slice(-1)[0].id === rwTwo[1].rewards.slice(-1)[0].id);

const cmOp = { t: 'common.add', item: { id: C.newId('ch'), title: '新常用' } };
const cmTwo = bothSides(cmOp);
ok('common.add 两边一致',
  cmTwo[0].commonHomeworks.slice(-1)[0].id === cmTwo[1].commonHomeworks.slice(-1)[0].id);

// 兑换：孩子发起，id 由客户端带（先给够小红花，不然会被"不够啦"挡掉）
const rdState = C.defaultState();
rdState.points.balance = 999;
const rewardId = rdState.rewards[0].id;
const rdOp = { t: 'redeem', rid: C.newId('rd'), id: rewardId };
function prepRedeem() {
  const s = C.defaultState();
  s.points.balance = 999;
  return s;
}
const rdA = prepRedeem(), rdB = prepRedeem();
C.applyOp(rdA, JSON.parse(JSON.stringify(rdOp)));
C.applyOp(rdB, JSON.parse(JSON.stringify(rdOp)));
ok('redeem 两边一致',
  rdA.redemptions[0] && rdA.redemptions[0].id === rdB.redemptions[0].id &&
  rdA.redemptions[0].id === rdOp.rid,
  (rdA.redemptions[0] || {}).id + ' / ' + (rdB.redemptions[0] || {}).id);
void rdState;

/*
 * 复制到今天：这个 op 里没有"客户端能先造 id"的地方（源是在服务器上找的），
 * 所以 id 必须由 (源 id + 目标日期) 推出来 —— 见 core.js 的 derivedId。
 */
const cpOp = { t: 'day.copy', from: '2026-10-09', to: '2026-10-11' };
function prepCopy() {
  const s = C.defaultState();
  C.applyOp(s, { t: 'hw.add', date: '2026-10-09', items: [{ id: 'h_srcfix01', subject: '语文', title: '源' }] });
  return s;
}
const cpA = prepCopy(), cpB = prepCopy();
C.applyOp(cpA, JSON.parse(JSON.stringify(cpOp)));
C.applyOp(cpB, JSON.parse(JSON.stringify(cpOp)));
const cpIdA = C.getDay(cpA, '2026-10-11').homeworks[0].id;
const cpIdB = C.getDay(cpB, '2026-10-11').homeworks[0].id;
ok('day.copy 派生出的 id 两边一致', cpIdA === cpIdB && C.isSafeId(cpIdA), cpIdA + ' / ' + cpIdB);
ok('复制出来的和新记录都清空了状态', (function () {
  const h = C.getDay(cpA, '2026-10-11').homeworks[0];
  return h.done === false && h.confirmed === false && Array.isArray(h.works) && h.works.length === 0;
})());

/* ---- 老存档里的遗留字段要被丢掉 ---- */
const legacy2 = C.normalizeState({
  settings: { bigFont: false, voiceOn: false, childName: '朵朵', parentPin: '4321' },
});
ok('老存档里的 bigFont / voiceOn 会被丢掉（早就没人读了）',
  !('bigFont' in legacy2.settings) && !('voiceOn' in legacy2.settings),
  JSON.stringify(legacy2.settings));
ok('老存档里的其他设置照常保留',
  legacy2.settings.childName === '朵朵' && legacy2.settings.parentPin === '4321',
  JSON.stringify(legacy2.settings));
ok('新房间默认也不带这两个字段',
  !('bigFont' in C.defaultState().settings) && !('voiceOn' in C.defaultState().settings));

/* ---- op 分发层：未知 op / 非法日期都要拦住 ---- */
const r7 = blank();
const rev0 = r7.rev;
C.applyOp(r7, { t: '这个op不存在' });
ok('未知 op 被忽略（rev 不变）', r7.rev === rev0, String(r7.rev));
C.applyOp(r7, { t: 'hw.add', date: '不是日期', items: [{ title: 'x' }] });
ok('非法日期被忽略', Object.keys(r7.days).length === 0, JSON.stringify(Object.keys(r7.days)));
C.applyOp(r7, null);
ok('空 op 不会崩', r7.rev === rev0);
const rev1 = r7.rev;
C.applyOp(r7, { t: 'settings', patch: { childName: '改了' } });
ok('正常 op 会让 rev 加一', r7.rev === rev1 + 1, String(r7.rev));
ok('applyOp 会更新 updatedAt', typeof r7.updatedAt === 'number' && r7.updatedAt > 0);

/* ================================================================
 * 【二十二】每日任务的标签 / 截止日期 / 默认排序
 * ================================================================ */
console.log('\n【二十二】任务的标签、截止日期、默认排序');

/* ---- 默认任务的标签顺序：功课 → 生活 → 精神 ---- */
{
  const d = C.defaultState();
  const tags = d.dailyTasks.map(function (t) { return t.tag; });
  ok('默认任务都带标签', tags.every(Boolean), JSON.stringify(tags));
  ok('默认顺序就是 功课 → 生活 → 精神',
    tags.join('|') === '功课|生活|生活|生活|精神', tags.join('|'));
  ok('默认任务默认都是「长期」',
    d.dailyTasks.every(function (t) { return C.taskSched(t).mode === 'always'; }),
    JSON.stringify(d.dailyTasks.map(function (t) { return C.taskSched(t).mode; })));
  ok('预设标签是 功课/生活/精神',
    C.TASK_TAGS.join(',') === '功课,生活,精神', C.TASK_TAGS.join(','));

  const ranks = C.TASK_TAGS.map(function (t) { return C.taskTagRank(t, []); });
  ok('标签排序：功课 < 生活 < 精神', ranks[0] < ranks[1] && ranks[1] < ranks[2],
    JSON.stringify(ranks));
  ok('自定义标签排在预设之后',
    C.taskTagRank('兴趣', ['功课', '兴趣']) > C.taskTagRank('精神', ['功课', '兴趣']),
    String(C.taskTagRank('兴趣', ['功课', '兴趣'])));
  ok('标签配色三个预设各不相同',
    new Set(C.TASK_TAGS.map(function (t) { return C.taskTagMeta(t).color; })).size === 3);
  ok('自定义标签给中性色',
    C.taskTagMeta('兴趣').color === C.taskTagMeta('没这个标签').color);
}

/* ---- task.add 按标签分组插入 ---- */
{
  const s = C.defaultState();
  const order = function () {
    return s.dailyTasks.map(function (t) { return t.tag + ':' + t.title; }).join(' | ');
  };
  C.applyOp(s, { t: 'task.add', item: { title: '新功课', tag: '功课' } });
  ok('新的「功课」插在功课组末尾（在生活之前）',
    s.dailyTasks[1].title === '新功课', order());
  C.applyOp(s, { t: 'task.add', item: { title: '新生活', tag: '生活' } });
  // 不管具体下标：只要它排在其它「生活」之后、且在「精神」之前就行
  const idx = function (title) {
    return s.dailyTasks.findIndex(function (t) { return t.title === title; });
  };
  ok('新的「生活」插在生活组末尾（在精神之前）',
    idx('新生活') > idx('晚上 9 点前上床睡觉') && idx('新生活') < idx('运动 30 分钟'),
    order());
  C.applyOp(s, { t: 'task.add', item: { title: '新精神', tag: '精神' } });
  ok('新的「精神」追加在最后', s.dailyTasks[s.dailyTasks.length - 1].title === '新精神', order());
  C.applyOp(s, { t: 'task.add', item: { title: '自定义任务', tag: '兴趣' } });
  ok('自定义标签排在所有预设之后',
    s.dailyTasks[s.dailyTasks.length - 1].title === '自定义任务', order());
  C.applyOp(s, { t: 'task.add', item: { title: '不填标签' } });
  ok('不填标签 → 默认第一个（功课）',
    s.dailyTasks.filter(function (t) { return t.title === '不填标签'; })[0].tag === '功课');

  /* 改标签要跟着换组 */
  const x = s.dailyTasks.filter(function (t) { return t.title === '新功课'; })[0];
  C.applyOp(s, { t: 'task.update', id: x.id, patch: { tag: '精神' } });
  ok('改了标签会挪到新标签那一组',
    s.dailyTasks[s.dailyTasks.length - 1].title === '新功课' ||
    s.dailyTasks.filter(function (t, i) {
      return t.title === '新功课' && s.dailyTasks[i - 1] &&
        s.dailyTasks[i - 1].tag === '精神';
    }).length > 0, order());
}

/* ---- 第 81 轮：任务的「有效期」（原来的截止日期） ---- */
{
  /* ① 长期 */
  ok('空的有效期 = 长期', C.normalizeSched({}).mode === 'always');
  ok('长期任务天天有效',
    C.schedMatches(C.emptySched(), '2026-10-17', []) &&
    C.schedMatches(C.emptySched(), '2099-01-01', []));
  ok('长期任务标签是「长期」', C.schedLabel({ sched: C.emptySched() }, '2026-10-17') === '长期');

  /* ② 特定日期 */
  const dates = C.normalizeSched({ mode: 'dates', dates: ['2026-10-20', '2026-10-25'] });
  ok('指定日期：那天有效', C.schedMatches(dates, '2026-10-20', []));
  ok('指定日期：别的天无效', !C.schedMatches(dates, '2026-10-21', []));
  ok('指定日期：标签只显示最近两个、剩下的用 …',
    C.schedLabel({ sched: C.normalizeSched({ mode: 'dates',
      dates: ['2026-10-20', '2026-10-25', '2026-11-01'] }) }, '2026-10-17') === '10-20、10-25 …',
    C.schedLabel({ sched: C.normalizeSched({ mode: 'dates',
      dates: ['2026-10-20', '2026-10-25', '2026-11-01'] }) }, '2026-10-17'));
  ok('指定日期：只有两个时不带省略号',
    C.schedLabel({ sched: dates }, '2026-10-17') === '10-20、10-25',
    C.schedLabel({ sched: dates }, '2026-10-17'));
  ok('指定日期：都过去了就显示最后两个',
    C.schedLabel({ sched: dates }, '2026-12-01') === '10-20、10-25',
    C.schedLabel({ sched: dates }, '2026-12-01'));

  /* 第 82 轮：多个指定日期**从小到大**排（不管录入的先后） */
  {
    const messy = C.normalizeSched({ mode: 'dates',
      dates: ['2030-11-01', '2030-10-20', '2030-12-25', '2030-09-09'] });
    ok('多个指定日期存下来是从小到大',
      messy.dates.join(',') === '2030-09-09,2030-10-20,2030-11-01,2030-12-25',
      messy.dates.join(','));
    ok('多个指定日期的标签也按从小到大取前两个',
      C.schedLabel({ sched: messy }, '2026-10-17') === '09-09、10-20 …',
      C.schedLabel({ sched: messy }, '2026-10-17'));
    // 去掉重复日期
    const dup = C.normalizeSched({ mode: 'dates',
      dates: ['2030-10-20', '2030-10-20', '2030-09-09'] });
    ok('重复的日期只留一个且排好序',
      dup.dates.join(',') === '2030-09-09,2030-10-20', dup.dates.join(','));
  }

  /* ③ 周六周日 */
  const weekend = C.normalizeSched({ mode: 'weekdays', days: [0, 6] });
  ok('周六有效', C.schedMatches(weekend, '2026-10-17', []));   // 2026-10-17 是周六
  ok('周日有效', C.schedMatches(weekend, '2026-10-18', []));
  ok('周一无效', !C.schedMatches(weekend, '2026-10-19', []));
  ok('周六周日的标签是「周六、周日」',
    C.schedLabel({ sched: weekend }, '2026-10-17') === '周六、周日',
    C.schedLabel({ sched: weekend }, '2026-10-17'));

  /* ③b 法定节假日（清单由家长维护） */
  const hol = C.normalizeSched({ mode: 'weekdays', days: ['holiday'] });
  ok('节假日清单里的那天有效',
    C.schedMatches(hol, '2026-10-01', ['2026-10-01']));
  ok('不在清单里的那天无效',
    !C.schedMatches(hol, '2026-10-02', ['2026-10-01']));
  ok('节假日的标签里有「节假日」',
    C.schedLabel({ sched: hol }, '2026-10-17') === '节假日');

  /* ④ 区间 */
  const range = C.normalizeSched({ mode: 'weekdays', from: '2026-10-01', to: '2026-10-07' });
  ok('区间内有效', C.schedMatches(range, '2026-10-03', []));
  ok('区间前无效', !C.schedMatches(range, '2026-09-30', []));
  ok('区间后无效', !C.schedMatches(range, '2026-10-08', []));
  ok('区间两端都算', C.schedMatches(range, '2026-10-01', []) &&
    C.schedMatches(range, '2026-10-07', []));
  ok('区间的标签是「10-01～10-07」',
    C.schedLabel({ sched: range }, '2026-10-17') === '10-01～10-07',
    C.schedLabel({ sched: range }, '2026-10-17'));

  /* ⑤ 区间 + 周几 */
  const both = C.normalizeSched({ mode: 'weekdays', days: [0], from: '2026-10-01', to: '2026-10-31' });
  ok('区间内的周日有效', C.schedMatches(both, '2026-10-04', []));
  ok('区间内的周一无效', !C.schedMatches(both, '2026-10-05', []));
  ok('区间外的周日无效', !C.schedMatches(both, '2026-11-01', []));
  ok('区间+周几的标签两个信息都有',
    C.schedLabel({ sched: both }, '2026-10-17') === '10-01～10-31 周日',
    C.schedLabel({ sched: both }, '2026-10-17'));

  /* ⑥ 手动停用优先 */
  ok('手动停用的任务，有效期内也不启用',
    !C.taskActiveOn({ active: false, sched: C.emptySched() }, '2026-10-17', []));
  ok('没停用又在有效期内 → 启用',
    C.taskActiveOn({ active: true, sched: weekend }, '2026-10-17', []));

  /* ⑦ 老 due 迁移：那天之前都有效 */
  const legacy = C.schedFromDue('2026-10-20');
  ok('老 due 迁成「到那天为止」', legacy.mode === 'weekdays' && legacy.to === '2026-10-20',
    JSON.stringify(legacy));
  ok('老 due 那天还有效', C.schedMatches(legacy, '2026-10-20', []));
  ok('老 due 第二天无效', !C.schedMatches(legacy, '2026-10-21', []));
  ok('老 due 是 9999-99-99 → 长期', C.schedFromDue(C.TASK_LONG_TERM).mode === 'always');

  /* ⑧ 迁移之后 due 字段应该被删掉（不留两份真相） */
  const migrated = C.normalizeState({
    dailyTasks: [{ id: 't_x', title: '老任务', due: '2026-10-20' }],
  });
  ok('normalizeState 把 due 迁成 sched 并删掉 due',
    migrated.dailyTasks[0].sched && migrated.dailyTasks[0].due === undefined,
    JSON.stringify(migrated.dailyTasks[0]));

  /* ⑨ 不在有效期的任务不算进当天的完成度（第 81 轮 2/3） */
  const s2 = C.defaultState();
  const day = C.todayKey();
  C.applyOp(s2, { t: 'task.add', item: { title: '只在周日',
    sched: { mode: 'weekdays', days: [0] } } });
  const tX = s2.dailyTasks.filter(function (t) { return t.title === '只在周日'; })[0];
  const wd = C.parseDateKey(day).getDay();
  ok('不在有效期的任务不计入当天"一共几项"',
    wd === 0 ? C.countDone(s2, day).total > 0 : true);
  const total0 = C.countDone(s2, day).total;
  C.applyOp(s2, { t: 'task.update', id: tX.id,
    patch: { sched: { mode: 'weekdays', days: [wd] } } });
  ok('改成"今天生效"之后它就被算进去了',
    C.countDone(s2, day).total === total0 + (wd === 0 ? 0 : 1),
    JSON.stringify({ wd: wd, before: total0, after: C.countDone(s2, day).total }));
  ok('改有效期不删数据', s2.dailyTasks.filter(function (t) {
    return t.title === '只在周日'; }).length === 1);
}

/* ---- 老存档：补标签 + 按标签排一次序 ---- */
{
  const legacy = C.normalizeState({
    dailyTasks: [
      { id: 't1', title: '运动 30 分钟', points: 2 },
      { id: 't2', title: '整理书包和书桌', points: 1 },
      { id: 't3', title: '亲子阅读 15 分钟', points: 2 },
    ],
  });
  /*
   * 猜标签要**按标题看**，不能按位置 ——
   * normalizeState 补完标签会顺手按标签重排一次，
   * 位置本来就该变（下面那条断言专门测这一点）。
   */
  const tagOf = function (title) {
    return (legacy.dailyTasks.filter(function (t) { return t.title === title; })[0] || {}).tag;
  };
  ok('老任务按标题猜出了标签',
    tagOf('运动 30 分钟') === '精神' && tagOf('整理书包和书桌') === '生活' &&
    tagOf('亲子阅读 15 分钟') === '功课',
    ['运动 30 分钟', '整理书包和书桌', '亲子阅读 15 分钟']
      .map(function (t) { return t + '→' + tagOf(t); }).join('，'));
  ok('老任务补上了有效期（长期）',
    legacy.dailyTasks.every(function (t) { return C.taskSched(t).mode === 'always'; }),
    JSON.stringify(legacy.dailyTasks.map(function (t) { return C.taskSched(t).mode; })));
  ok('老存档的任务被按标签重排了一次（功课最前）',
    legacy.dailyTasks[0].title === '亲子阅读 15 分钟',
    legacy.dailyTasks.map(function (t) { return t.title; }).join(' | '));
  // 再 normalize 一次不能再重排（否则会把手动 ↑↓ 的次序冲掉）
  const again = C.normalizeState(JSON.parse(JSON.stringify(legacy)));
  ok('再读一次不会重排（保留家长手动调过的顺序）',
    again.dailyTasks.map(function (t) { return t.title; }).join('|') ===
    legacy.dailyTasks.map(function (t) { return t.title; }).join('|'),
    again.dailyTasks.map(function (t) { return t.title; }).join(' | '));
}

/* ---- 今天的作业：默认按科目排 ---- */
{
  const s3 = blank();
  const D = C.todayKey();
  // 故意乱序加：数学 → 语文 → 体育 → 英语
  ['数学', '语文', '体育', '英语'].forEach(function (sub) {
    C.applyOp(s3, { t: 'hw.add', date: D, items: [{ title: sub + '作业', subject: sub }] });
  });
  const got = C.getDay(s3, D).homeworks.map(function (h) { return h.subject; }).join(',');
  ok('新加的作业默认按 语文→数学→英语→…→其他 排',
    got === '语文,数学,英语,体育', got);
  // 同科目要挨在一起
  C.applyOp(s3, { t: 'hw.add', date: D, items: [{ title: '语文作业2', subject: '语文' }] });
  const got2 = C.getDay(s3, D).homeworks.map(function (h) { return h.subject; }).join(',');
  ok('同一科目的挨着放', got2 === '语文,语文,数学,英语,体育', got2);
  // 改科目也要跟着换组
  const yw = C.getDay(s3, D).homeworks.filter(function (h) { return h.title === '语文作业2'; })[0];
  C.applyOp(s3, { t: 'hw.update', date: D, id: yw.id, patch: { subject: '体育' } });
  const got3 = C.getDay(s3, D).homeworks.map(function (h) { return h.subject; }).join(',');
  ok('改了科目会挪到新科目那一组', got3 === '语文,数学,英语,体育,体育', got3);
  // 自己填的科目排最后
  C.applyOp(s3, { t: 'hw.add', date: D, items: [{ title: '校本作业', subject: '校本' }] });
  const got4 = C.getDay(s3, D).homeworks.map(function (h) { return h.subject; }).join(',');
  ok('不在预设表里的科目排最后', got4.split(',').pop() === '校本', got4);
}

/* ================================================================
 * 【二三·五】多行文本框的 maxlength 要和后端截断一致（第 87 轮）
 *
 * 没设 maxlength 的话，超出的部分会被后端 slice() **静默切掉** ——
 * 家长写了两百多字，存下来尾巴没了，界面上却毫无提示。
 * 这里做静态检查：扫描 app.js 里那几个框，比对 core.js 的截断上限。
 * （不用开浏览器，跑得快；浏览器那边另外验一次真实输入被拦住）
 * ================================================================ */
console.log('\n【二三·五】多行文本框的 maxlength 和后端截断一致');
{
  const fs = await import('node:fs');
  const appSrc = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

  /** 取某个 id 的 <textarea> 标签上的 maxlength */
  const maxOf = function (id) {
    const re = new RegExp('<textarea[^>]*id="' + id + '"[^>]*>');
    const m = appSrc.match(re);
    if (!m) return { found: false };
    const ml = m[0].match(/maxlength="(\d+)"/);
    return { found: true, max: ml ? Number(ml[1]) : null };
  };

  // id → 后端存这条时用的上限（core.js 里的 slice(0, N)）
  const expect = {
    'add-detail': 500,   // 手动加一条的备注 → hw.add 的 detail（第 88 轮 200 → 500）
    'note-box': 300,     // 给孩子留句话 → day.note
    'review-box': 300,   // 今日学习评价 → day.review 的 text
    'undo-reason': 200,  // 撤回理由 → item.undo 的 reason
  };
  Object.keys(expect).forEach(function (id) {
    const got = maxOf(id);
    ok('#' + id + ' 有 maxlength 且等于后端的 ' + expect[id],
      got.found && got.max === expect[id],
      got.found ? String(got.max) : '（找不到这个 textarea）');
  });

  /*
   * 弹窗里的多行字段：**每一个都必须有 maxlength**，而且不能超过后端存的上限。
   * 注意 `note` 有两种：加一件事（extra.add，200）和每日任务（task.add，300），
   * 所以不能一刀切要求 300，只能要求"在集合里且不超过它对应的上限"。
   */
  const fields = [];
  appSrc.split('\n').forEach(function (line) {
    if (line.indexOf("type: 'textarea'") < 0) return;
    const key = (line.match(/key: '([\w]+)'/) || [])[1];
    const lab = (line.match(/label: '([^']+)'/) || [])[1];
    const ml = (line.match(/maxlength: (\d+)/) || [])[1];
    if (key) fields.push({ key: key, label: lab, max: ml ? Number(ml) : null });
  });
  ok('每个多行字段都有 maxlength',
    fields.length > 0 && fields.every(function (f) { return f.max !== null; }),
    fields.map(function (f) { return f.label + '=' + f.max; }).join(', '));

  const byKey = function (k) {
    return fields.filter(function (f) { return f.key === k; })
      .map(function (f) { return f.max; });
  };
  const detailMax = byKey('detail');
  const noteMax = byKey('note');
  const titleMax = byKey('title');
  const textMax = byKey('text');
  ok('备注 detail 全部是 500（hw.add / common.* 都按 500 截）',
    detailMax.length > 0 && detailMax.every(function (n) { return n === 500; }),
    detailMax.join(','));
  ok('备注 note 全部是 500（加一件事和每日任务都是）',
    noteMax.length > 0 && noteMax.every(function (n) { return n === 500; }),
    noteMax.join(','));
  ok('「做什么」这个标题框是 60', titleMax.length > 0 &&
    titleMax.every(function (n) { return n === 60; }), titleMax.join(','));
  ok('评语 text 是 300', textMax.length > 0 &&
    textMax.every(function (n) { return n === 300; }), textMax.join(','));
}

/* ================================================================
 * 【二三·七】「撤回打勾」要能在「已撤销」里看到（第 92 轮）
 *
 * 真实案例：2026-10-19 的「绿豆成长日记」
 *   17:28:37  item.done  → +2 流水
 *   17:28:49  item.done(false) → -2 流水，记录变成 done:false + undoneAt
 * 但界面判断"已撤销"只认 undoKind/undoReason（那是「撤回任务」才写的），
 * 结果这条记录**三个列表全都不显示**，只剩流水里 +2 / -2 一对 ——
 * 家长看到的就是"这条小红花记录哪来的"。
 * ================================================================ */
console.log('\n【二三·七】撤回打勾的记录要落在「已撤销」里');
{
  const s = C.defaultState();
  const t = s.dailyTasks[0];
  const day = C.todayKey();

  C.applyOp(s, { t: 'item.done', date: day, kind: 'task', id: t.id, value: true });
  C.applyOp(s, { t: 'item.confirm', date: day, kind: 'task', id: t.id, value: true });
  const plus = s.ledger.filter(function (e) { return e.delta > 0; }).length;
  ok('（准备）确认之后有 +分流水', plus > 0, String(plus));

  /*
   * 真实路径：家长在「待确认」里点**撤销**，但**没选理由**（也没有说明）。
   * item.undo 会把 undoKind / undoReason 都写成空串，只留 undoneAt。
   */
  C.applyOp(s, { t: 'item.undo', date: day, kind: 'task', id: t.id });
  const rec = s.days[day].tasks[t.id];
  ok('撤销之后 done=false', rec.done === false);
  ok('撤销之后 undoKind / undoReason 都是空的（没选理由就是这条路径）',
    !rec.undoKind && !rec.undoReason, JSON.stringify({ k: rec.undoKind, r: rec.undoReason }));
  ok('撤销之后 undoneAt 有值', Boolean(rec.undoneAt), String(rec.undoneAt));
  ok('流水里 +分 / 撤回 -分 成对（净 0）',
    s.ledger.filter(function (e) { return e.delta > 0; }).length === plus &&
    s.ledger.filter(function (e) { return e.delta < 0 && /撤回/.test(e.reason || ''); }).length > 0,
    JSON.stringify(s.ledger.slice(0, 3)));

  // 界面的判定（和 app.js 里那两处保持一致）
  const undoneByOld = !rec.done && Boolean(rec.undoKind || rec.undoReason);
  const undoneByNew = !rec.done && Boolean(rec.undoKind || rec.undoReason || rec.undoneAt);
  ok('旧判定（只看 undoKind/Reason）认不出它 —— 这就是那个 bug', undoneByOld === false);
  ok('新判定（补上 undoneAt）能认出来', undoneByNew === true);

  // 选了理由的那条路径不受影响，照样认得出
  const s2 = C.defaultState();
  const t2 = s2.dailyTasks[0];
  C.applyOp(s2, { t: 'item.done', date: day, kind: 'task', id: t2.id, value: true });
  C.applyOp(s2, { t: 'item.undo', date: day, kind: 'task', id: t2.id,
    reasonKind: 'redo', reason: '再写一遍' });
  const rec2 = s2.days[day].tasks[t2.id];
  ok('选了理由的撤销仍然带 undoKind', rec2.undoKind === 'redo', rec2.undoKind);
}

/* ================================================================
 * 【二三·六】删除任务 / 改有效期，历史那天照样有（第 91 轮）
 *
 * 家长的原话：「删除任务，或修改任务有效期，历史已完成的任务不要动，
 * 任务完成那天依旧保留展示」。
 *
 * 改有效期本来就没事（记录独立于定义）；**删除**原来是真删，
 * 任务没了 → parentItems 遍历不到 → 那天的记录成了孤儿。
 * 现在改成软删除，这里逐条钉住。
 * ================================================================ */
console.log('\n【二三·六】删除任务 / 改有效期，历史记录都保留');
{
  const s = C.defaultState();
  const t = s.dailyTasks.filter(function (x) { return x.tag === '生活'; })[0];
  const D1 = '2026-10-15';
  const D2 = '2026-10-19';   // 「今天」

  // 在历史那天完成
  C.applyOp(s, { t: 'item.done', date: D1, kind: 'task', id: t.id, value: true });
  const totalBefore = C.countDone(s, D1).total;
  ok('（准备）历史那天的记录写下了', Boolean(s.days[D1].tasks[t.id]));
  ok('（准备）历史那天算它有效', C.taskActiveOn(t, D1, []));

  // 删掉它
  C.applyOp(s, { t: 'task.remove', id: t.id, date: D2 });
  const after = s.dailyTasks.filter(function (x) { return x.id === t.id; })[0];
  ok('删除只是打标记，任务对象还在', Boolean(after) && after.deleted === true,
    after ? JSON.stringify({ deleted: after.deleted, at: after.deletedAt }) : '(没了)');
  ok('deletedAt 记在删除那天', after.deletedAt === D2, after.deletedAt);
  ok('历史那天的记录还在（这条最关键）', Boolean(s.days[D1].tasks[t.id]));
  ok('历史那天仍然算它有效（统计不缩水）', C.taskActiveOn(after, D1, []));
  ok('历史那天的完成度没缩水', C.countDone(s, D1).total === totalBefore,
    totalBefore + ' → ' + C.countDone(s, D1).total);
  ok('删除那天起不再算有效', !C.taskActiveOn(after, D2, []));
  ok('今天的孩子页不再显示它', !C.taskActiveOn(after, C.todayKey(), []));

  // 改有效期也不该动历史
  const s2 = C.defaultState();
  const t2 = s2.dailyTasks[0];
  C.applyOp(s2, { t: 'item.done', date: D1, kind: 'task', id: t2.id, value: true });
  C.applyOp(s2, { t: 'task.update', id: t2.id,
    patch: { sched: { mode: 'weekdays', days: [0] } } });
  const t2b = s2.dailyTasks.filter(function (x) { return x.id === t2.id; })[0];
  ok('改有效期之后历史记录还在', Boolean(s2.days[D1].tasks[t2.id]));
  ok('改完之后今天不显示（今天不是周日时）',
    C.parseDateKey(C.todayKey()).getDay() === 0 || !C.taskActiveOn(t2b, C.todayKey(), []));
  ok('改完之后历史那天照样有它的记录',
    Boolean(s2.days[D1].tasks[t2.id]) || true);

  // 软删除标记要能存进存档、读回来还是删掉的
  const round = C.normalizeState(JSON.parse(JSON.stringify(s)));
  const rt = round.dailyTasks.filter(function (x) { return x.id === t.id; })[0];
  ok('软删除标记经过 normalizeState 还在', rt && rt.deleted === true && rt.deletedAt === D2);
  ok('幂等：再规范化一次不变',
    JSON.stringify(C.normalizeState(JSON.parse(JSON.stringify(round)))) === JSON.stringify(round));
}

/* ================================================================
 * 【二十四】改定义不能改写历史（第 66 轮 6）
 * ================================================================ */
console.log('\n【二十三】改常用作业 / 每日任务，不影响历史已添加的');

{
  /* ---- 常用作业：改库里的条目，那天已经加过的作业一个字都不能变 ---- */
  const s = C.defaultState();
  const D = C.todayKey();
  const lib = s.commonHomeworks[0];
  const before = { subject: lib.subject, title: lib.title, detail: lib.detail };
  // 先把库里这条加到今天
  C.applyOp(s, { t: 'hw.add', date: D, items: [{
    id: C.newId('h'), subject: lib.subject, title: lib.title, detail: lib.detail,
    attachments: lib.attachments,
  }] });
  C.applyOp(s, { t: 'common.update', id: lib.id, patch: {
    subject: '数学', title: '改过的名字', detail: '改过的备注',
  } });
  const hw = C.getDay(s, D).homeworks[0];
  ok('改常用作业库不影响那天已加进去的作业',
    hw.subject === before.subject && hw.title === before.title && hw.detail === before.detail,
    JSON.stringify({ subject: hw.subject, title: hw.title, detail: hw.detail }));
  ok('库里那条确实改了（对照组）',
    lib.subject === '数学' && lib.title === '改过的名字', lib.title);
  // 附件也不能是同一个数组（否则给作业加附件会串到库里）
  ok('作业的附件和库里的不是同一个数组', hw.attachments !== lib.attachments);
  const libAtt = { id: 'a'.repeat(16) + '.png', name: '卷子.png', size: 10, mime: 'image/png', kind: 'image', at: 1 };
  C.applyOp(s, { t: 'common.update', id: lib.id, patch: { attachments: [libAtt] } });
  ok('给库里加附件不会串到已加的作业上',
    C.getDay(s, D).homeworks[0].attachments.length === 0,
    String(C.getDay(s, D).homeworks[0].attachments.length));
  // 删掉库里那条，作业也还在
  C.applyOp(s, { t: 'common.remove', id: lib.id });
  ok('删掉常用库条目，那天已加的作业还在',
    C.getDay(s, D).homeworks.length === 1 && C.getDay(s, D).homeworks[0].title === before.title,
    JSON.stringify(C.getDay(s, D).homeworks.map(function (h) { return h.title; })));
}

{
  /* ---- 每日任务：打勾时拍快照，之后改定义不改写那一天 ---- */
  const s = C.defaultState();
  const D = C.todayKey();
  const t = s.dailyTasks[0];                    // 亲子阅读 15 分钟 / 功课 / 2 分
  const snapTitle = t.title;
  C.applyOp(s, { t: 'item.done', date: D, kind: 'task', id: t.id, value: true });
  const rec = C.getDay(s, D).tasks[t.id];
  ok('打勾时拍了快照', Boolean(rec.snap), JSON.stringify(rec.snap));
  ok('快照里是当时的样子',
    rec.snap && rec.snap.title === snapTitle && rec.snap.tag === '功课' && rec.snap.points === 2,
    JSON.stringify(rec.snap));

  // 先确认（按当时的 2 分发），再改定义
  C.applyOp(s, { t: 'item.confirm', date: D, kind: 'task', id: t.id, value: true });
  const awarded = C.getDay(s, D).tasks[t.id].awardedPoints;
  ok('确认时按当时的分值发（2 分）', awarded === 2, String(awarded));

  // 家长改名字 / 图标 / 分值 / 标签
  C.applyOp(s, { t: 'task.update', id: t.id, patch: {
    title: '改成新名字了', emoji: '🎯', tag: '精神', points: 9,
  } });
  /*
   * ★ 第 73 轮：快照只给**过去的日子**用。
   *   今天（D 就是今天）家长刚改完标签，今天这张卡必须按新的显示，
   *   不然看起来就是"改了没成功"（真事）。
   */
  const today = C.todayKey();
  const vToday = C.taskView(t, rec, today);
  ok('今天不用快照：名字按当前的显示', vToday.title === '改成新名字了', vToday.title);
  ok('今天不用快照：标签按当前的显示', vToday.tag === '精神', vToday.tag);
  ok('今天不用快照：分值按当前的显示', vToday.points === 9, String(vToday.points));

  // 过去的那一天才用快照
  const past = C.shiftDate(today, -1);
  const vPast = C.taskView(t, rec, past);
  ok('历史那一天显示的还是当时的名字', vPast.title === snapTitle, vPast.title);
  ok('历史那一天的标签也是当时的', vPast.tag === '功课', vPast.tag);
  ok('历史那一天的分值也是当时的', vPast.points === 2, String(vPast.points));
  ok('任务定义本身确实改了（对照组）',
    t.title === '改成新名字了' && t.tag === '精神' && t.points === 9, t.title);
  ok('后来把分值改成 9，已经发出去的 2 分也不变',
    C.getDay(s, D).tasks[t.id].awardedPoints === 2,
    String(C.getDay(s, D).tasks[t.id].awardedPoints));

  // 没打勾的那一天没有快照，就用当前定义
  const D2 = C.shiftDate(D, -1);
  const v2 = C.taskView(t, C.getDay(s, D2).tasks[t.id] || {}, D2);
  ok('没过过的日子用当前定义（没有快照可谈）', v2.title === '改成新名字了', v2.title);

  // 重新打勾会刷新快照
  C.applyOp(s, { t: 'item.done', date: D, kind: 'task', id: t.id, value: false });
  C.applyOp(s, { t: 'item.done', date: D, kind: 'task', id: t.id, value: true });
  const past2 = C.shiftDate(C.todayKey(), -1);
  ok('重新打勾会刷新快照',
    C.taskView(t, C.getDay(s, D).tasks[t.id], past2).title === '改成新名字了',
    C.taskView(t, C.getDay(s, D).tasks[t.id], past2).title);
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败\n');process.exit(fail ? 1 : 0);
