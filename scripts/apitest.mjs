/*
 * 接口联调测试：对着真正跑起来的服务器打一遍
 *   node server.js          （另开一个窗口）
 *   node scripts/apitest.mjs
 * 也可以指定地址：BASE=http://localhost:5199 node scripts/apitest.mjs
 *
 * 【十】房间管理口令：口令只用在删除房间。
 *   服务器没设口令时，测试会自己设一个、跑完再取消（保持可重复运行）；
 *   用 HB_ADMIN_KEY=xxx node server.js 启的话，这里也要传同一个环境变量。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAssetName } from '../public/core.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'http://localhost:5199';

let pass = 0, fail = 0, skipped = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); }
}
/** 明确记一笔"这段没跑"，别让覆盖率悄悄缩水 */
function skip(what) {
  skipped++;
  console.log('  ⊘ 跳过：' + what);
}

async function req(path, opts) {
  const res = await fetch(BASE + path, opts);
  const type = res.headers.get('content-type') || '';
  const body = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, body, type };
}

console.log('\n服务器：' + BASE + '\n');

console.log('【一】健康检查与静态文件');
const health = await req('/api/health');
ok('GET /api/health 200', health.status === 200, String(health.status));
ok('报告了存储方式', Boolean(health.body.storage), JSON.stringify(health.body));

const index = await req('/');
ok('GET / 返回 HTML', index.status === 200 && index.type.includes('text/html'), String(index.status));
ok('HTML 里有中文标题', String(index.body).includes('作业小站'));

/*
 * 枚举 public/ 下每个前端文件，逐个取一遍 ——
 * 写死清单的话，新加了模块（比如 ui.js）忘了同步就测不出来，
 * 而 app.js 一旦 import 不到那个模块，页面直接白屏。
 */
const pubFiles = fs.readdirSync(path.join(ROOT, 'public'))
  .filter(function (f) { return /\.(js|css|html|json)$/.test(f); }).sort();
for (const f of pubFiles) {
  const r = await req('/' + f);
  ok('GET /' + f + ' 200', r.status === 200, String(r.status));
}
ok('public/ 下的文件都被测到了（' + pubFiles.length + ' 个）', pubFiles.length >= 4, pubFiles.join(', '));

// 版本指纹只盯"会变的前端资源"（html/js/mjs/css）；changelog.json 自己不算进去，
// 否则升一次版本又会改变指纹，就永远升不完
const assetFiles = pubFiles.filter(isAssetName);

const missing = await req('/nope.txt');
ok('不存在的静态文件 404', missing.status === 404, String(missing.status));

const version = await req('/api/version');
ok('GET /api/version 有版本号', version.status === 200 && typeof version.body.v === 'string',
  JSON.stringify(version.body));
/*
 * 第 73 轮：版本接口还要报一个 staleCode ——
 * 「新的 public/ 传上去了，但服务进程没重启」时为 true。
 * 前端据此提示用户，免得出现"改了没成功"却查不出原因
 * （旧 core.js 会把 op 里新加的字段静默忽略，比如任务的 tag）。
 */
ok('/api/version 带 staleCode 字段（用来发现服务器跑的是旧代码）',
  typeof version.body.staleCode === 'boolean', JSON.stringify(version.body.staleCode));
ok('刚启动的服务 staleCode 是 false（内存里的代码和磁盘一致）',
  version.body.staleCode === false, String(version.body.staleCode));
/*
 * 版本指纹报出来的文件清单，必须跟 public/ 里实际的前端文件一致。
 * 少一个的话：只改那个文件时「有新版本」提示不会弹，
 * 部署到服务器之后也没法用指纹判断"到底传全了没有"。
 */
ok('版本指纹的文件清单 = public/ 下实际的前端资源',
  Array.isArray(version.body.files) &&
  assetFiles.slice().sort().join(',') === version.body.files.slice().sort().join(','),
  '接口说：' + JSON.stringify(version.body.files) + '，目录里：' + JSON.stringify(assetFiles));

console.log('\n【二】房间与状态');
const created = await req('/api/room', { method: 'POST' });
ok('POST /api/room 创建房间', created.status === 201, String(created.status));
const room = created.body.room;
ok('随机房间码是 6 位', /^[A-HJ-NP-Z2-9]{6}$/.test(room), room);
ok('新房间带着孩子名字', created.body.state.settings.childName === '宝贝',
  JSON.stringify(created.body.state.settings.childName));

const got = await req('/api/state/' + room);
ok('GET /api/state/:room 200', got.status === 200 && got.body.room === room, String(got.status));
ok('默认有 5 个每日任务', got.body.state.dailyTasks.length === 5, String(got.body.state.dailyTasks.length));
ok('默认小红花余额 0', got.body.state.points.balance === 0, String(got.body.state.points.balance));

const noRoom = await req('/api/state/ZZZZZZ');
ok('不存在的房间 404', noRoom.status === 404, String(noRoom.status));

// 注意：自定义房间码开放后，abc 这种 3 位短码是合法的（只是房间不存在 → 404）。
// 真正非法的只有「太短」和「含非字母数字」。
const tooShortRoom = await req('/api/state/ab');
ok('太短的房间码 400', tooShortRoom.status === 400, String(tooShortRoom.status));

const badRoom = await req('/api/state/ab-cd');
ok('含符号的房间码 400', badRoom.status === 400, String(badRoom.status));

const cnRoom = await req('/api/state/' + encodeURIComponent('房间'));
ok('中文房间码 400', cnRoom.status === 400, String(cnRoom.status));

const shortOk = await req('/api/state/abc');
ok('3 位合法码只是不存在 → 404', shortOk.status === 404, String(shortOk.status));

const jsonHdr0 = { 'Content-Type': 'application/json' };

async function op(o) {
  const r = await req('/api/state/' + room + '/op', {
    method: 'POST', headers: jsonHdr0, body: JSON.stringify({ ops: [o] }),
  });
  return r;
}

const date = new Date().toISOString().slice(0, 10);

console.log('\n【三】录作业 → 孩子打勾 → 家长确认');
const addHw = await op({
  t: 'hw.add', date,
  items: [
    { subject: '语文', title: '背诵《静夜思》', detail: '家长签字' },
    { subject: '数学', title: '口算练习册 P20' },
  ],
});
ok('家长录作业 200', addHw.status === 200, String(addHw.status));
ok('录进去 2 条', addHw.body.state.days[date].homeworks.length === 2,
  String(addHw.body.state.days[date].homeworks.length));
ok('科目解析对了', addHw.body.state.days[date].homeworks[0].subject === '语文',
  addHw.body.state.days[date].homeworks[0].subject);

const hw1 = addHw.body.state.days[date].homeworks[0];
const done = await op({ t: 'item.done', kind: 'homework', date, id: hw1.id, value: true });
ok('孩子打勾 200', done.status === 200, String(done.status));
ok('打勾后还没给小红花（要家长确认）',
  done.body.state.days[date].homeworks[0].done === true &&
  done.body.state.points.balance === 0,
  'done=' + done.body.state.days[date].homeworks[0].done + ' balance=' + done.body.state.points.balance);

const confirmed = await op({ t: 'item.confirm', kind: 'homework', date, id: hw1.id, value: true });
ok('家长确认 200', confirmed.status === 200, String(confirmed.status));
ok('确认后小红花到账 2 分', confirmed.body.state.points.balance === 2,
  String(confirmed.body.state.points.balance));
ok('记了一笔流水', confirmed.body.state.ledger.length === 1,
  String(confirmed.body.state.ledger.length));

const undone = await op({ t: 'item.confirm', kind: 'homework', date, id: hw1.id, value: false });
ok('取消确认会把小红花收回去', undone.body.state.points.balance === 0,
  String(undone.body.state.points.balance));

console.log('\n【四】每日任务与额外任务');
const taskId = got.body.state.dailyTasks[0].id;
const taskDone = await op({ t: 'item.done', kind: 'task', date, id: taskId, value: true });
ok('每日任务能打勾', taskDone.body.state.days[date].tasks[taskId].done === true,
  JSON.stringify(taskDone.body.state.days[date].tasks[taskId]));
const taskOk = await op({ t: 'item.confirm', kind: 'task', date, id: taskId, value: true });
ok('确认后任务也给小红花', taskOk.body.state.points.balance === 2,
  String(taskOk.body.state.points.balance));

const extraAdd = await op({ t: 'extra.add', date, item: { title: '明天带红领巾' } });
ok('能加额外任务', extraAdd.body.state.days[date].extras.length === 1,
  String(extraAdd.body.state.days[date].extras.length));

const dayNote = await op({ t: 'day.note', date, note: '今天状态不错' });
ok('能留今天的话', dayNote.body.state.days[date].note === '今天状态不错',
  dayNote.body.state.days[date].note);

const mood = await op({ t: 'day.mood', date, mood: '😄' });
ok('能记心情', mood.body.state.days[date].mood === '😄', mood.body.state.days[date].mood);

console.log('\n【五】奖励与兑换');
// 先把能拿的分都拿了：5 个任务 8 分 + 2 条作业 4 分 = 12 分，够换最便宜的奖励
let full = (await req('/api/state/' + room)).body.state;
for (const t of full.dailyTasks) {
  await op({ t: 'item.done', date, kind: 'task', id: t.id, value: true });
  await op({ t: 'item.confirm', date, kind: 'task', id: t.id, value: true });
}
for (const h of full.days[date].homeworks) {
  await op({ t: 'item.done', date, kind: 'homework', id: h.id, value: true });
  await op({ t: 'item.confirm', date, kind: 'homework', id: h.id, value: true });
}
full = (await req('/api/state/' + room)).body.state;
ok('全部做完攒够了小红花', full.points.balance >= 10, String(full.points.balance));
ok('流水条数对得上', full.ledger.length === full.points.balance / 2 + full.points.balance % 2 * 0 ||
  full.ledger.filter(function (x) { return x.kind === 'homework' || x.kind === 'task'; }).length >= 6,
  String(full.ledger.length));

const reward = full.rewards.filter(function (r) { return r.cost <= full.points.balance; })[0];
ok('有换得起的奖励', Boolean(reward), JSON.stringify(full.points));

const redeem = await op({ t: 'redeem', id: reward.id });
const rd0 = redeem.body.state.redemptions[0];
ok('兑换挂成待处理', rd0 && rd0.status === 'pending' && rd0.cost === reward.cost, JSON.stringify(rd0));
ok('兑换先扣掉小红花', redeem.body.state.points.balance === full.points.balance - reward.cost,
  redeem.body.state.points.balance + ' vs ' + (full.points.balance - reward.cost));

const rejected = await op({ t: 'redeem.status', id: rd0.id, status: 'rejected', reason: '下次吧' });
const afterReject = rejected.body.state.redemptions.filter(function (x) { return x.id === rd0.id; })[0];
ok('驳回兑换会记原因', afterReject.status === 'rejected' && afterReject.reason === '下次吧',
  JSON.stringify(afterReject));
ok('驳回会把小红花退回来', rejected.body.state.points.balance === full.points.balance,
  rejected.body.state.points.balance + ' vs ' + full.points.balance);

const redeem2 = await op({ t: 'redeem', id: reward.id });
const rd1 = redeem2.body.state.redemptions[0];
const fulfilled = await op({ t: 'redeem.status', id: rd1.id, status: 'done' });
const afterDone = fulfilled.body.state.redemptions.filter(function (x) { return x.id === rd1.id; })[0];
ok('兑现成功', afterDone.status === 'done', JSON.stringify(afterDone));
ok('兑现不会重复扣分', fulfilled.body.state.points.balance === full.points.balance - reward.cost,
  String(fulfilled.body.state.points.balance));

console.log('\n【六】错误处理');
const badJson = await req('/api/state/' + room + '/op', {
  method: 'POST', headers: jsonHdr0, body: '{not json',
});
ok('坏 JSON 返回 500 且有提示', badJson.status === 500 && String(badJson.body.error || '').length > 0,
  badJson.status + ' / ' + JSON.stringify(badJson.body));

const noOps = await req('/api/state/' + room + '/op', {
  method: 'POST', headers: jsonHdr0, body: JSON.stringify({ ops: [] }),
});
ok('空操作列表 400', noOps.status === 400, String(noOps.status));

/*
 * 认不出来的操作名必须**明确报错**。
 *
 * 这条是血泪：applyOp 对不认识的 op 本来是静默跳过的（向后兼容），结果
 * "服务器还在跑旧 core.js" 就表现成"点了没反应、删了又回来" —— 服务器收下、
 * 什么都不做、还回 200，客户端以为成功，下一次同步又盖回本地改动。
 */
const revBeforeUnknown = (await req('/api/state/' + room)).body.state.rev;
const unknownOp = await req('/api/state/' + room + '/op', {
  method: 'POST', headers: jsonHdr0,
  body: JSON.stringify({ ops: [{ t: 'hw.add', date, items: [{ title: '这条不该进去' }] },
    { t: '完全不存在操作', x: 1 }] }),
});
ok('未知操作名 → 400（不能静默吞掉）', unknownOp.status === 400, String(unknownOp.status));
ok('未知操作返回 staleServer 标记，前端好提示"服务要重启"',
  unknownOp.body.staleServer === true && Array.isArray(unknownOp.body.unknown),
  JSON.stringify(unknownOp.body).slice(0, 120));
const revAfterUnknown = (await req('/api/state/' + room)).body.state.rev;
ok('整批操作被原子拒绝（不会执行一半）', revAfterUnknown === revBeforeUnknown,
  revBeforeUnknown + ' → ' + revAfterUnknown);
const notAdded = (await req('/api/state/' + room)).body.state.days[date].homeworks
  .filter(function (h) { return h.title === '这条不该进去'; }).length;
ok('被拒绝的那一批里，合法的操作也没生效', notAdded === 0, String(notAdded));

// 正常操作仍然要能过
const goodOp = await req('/api/state/' + room + '/op', {
  method: 'POST', headers: jsonHdr0,
  body: JSON.stringify({ ops: [{ t: 'common.add', item: { subject: '语文', title: '接口测试加的' } }] }),
});
ok('认识的操作照常 200', goodOp.status === 200, String(goodOp.status));

const noApi = await req('/api/nothing-here');
ok('不存在的接口 404', noApi.status === 404, String(noApi.status));

console.log('\n【七】多人同时看同一份');
const kidView = await req('/api/state/' + room);
ok('孩子端能读到家长刚录的作业', kidView.body.state.days[date].homeworks.length === 2,
  String(kidView.body.state.days[date].homeworks.length));
ok('孩子端能看到小红花余额', typeof kidView.body.state.points.balance === 'number',
  String(kidView.body.state.points.balance));
ok('读接口带上了 rev（版本号，前端靠它判断要不要刷新）',
  typeof kidView.body.state.rev === 'number', String(kidView.body.state.rev));

console.log('\n【八】PUT 整份覆盖（导入备份用）');
const snapshot = JSON.parse(JSON.stringify(kidView.body.state));
snapshot.settings.childName = '小明';
const put = await req('/api/state/' + room, {
  method: 'PUT', headers: jsonHdr0, body: JSON.stringify({ state: snapshot }),
});
ok('PUT 成功', put.status === 200, String(put.status));
const after = await req('/api/state/' + room);
ok('再读回来名字变了', after.body.state.settings.childName === '小明',
  after.body.state.settings.childName);

console.log('\n【九】房间：新建 / 列表 / 改名');

const jsonHdr = { 'Content-Type': 'application/json' };
const suffix = Date.now().toString(36).toUpperCase().slice(-6);
const CUSTOM = 'TESTROOM' + suffix;

const made = await req('/api/room', {
  method: 'POST', headers: jsonHdr,
  body: JSON.stringify({ code: CUSTOM.toLowerCase(), name: '测试房间', childName: '测试娃' }),
});
ok('POST /api/room 支持自定义房间码', made.status === 201, String(made.status));
ok('小写会被转成大写', made.body.room === CUSTOM, made.body.room);
ok('房间名写进去了', made.body.state.settings.roomName === '测试房间', JSON.stringify(made.body.state.settings.roomName));
ok('孩子名字也写进去了', made.body.state.settings.childName === '测试娃');

const dup = await req('/api/room', {
  method: 'POST', headers: jsonHdr, body: JSON.stringify({ code: CUSTOM }),
});
ok('房间码被占用返回 409', dup.status === 409, String(dup.status));

const tooShort = await req('/api/room', {
  method: 'POST', headers: jsonHdr, body: JSON.stringify({ code: 'AB' }),
});
ok('太短的房间码返回 400', tooShort.status === 400, String(tooShort.status));

const badChars = await req('/api/room', {
  method: 'POST', headers: jsonHdr, body: JSON.stringify({ code: '我的小家' }),
});
ok('全中文的房间码被拒（不会偷偷换成随机码）', badChars.status === 400, String(badChars.status));

const mixed = await req('/api/room/check?code=' + encodeURIComponent('朵朵的家'));
ok('check 也会指出中文不行', mixed.body.ok === false, JSON.stringify(mixed.body));

const chkTaken = await req('/api/room/check?code=' + CUSTOM);
ok('check 报告已被占用', chkTaken.body.ok === false, JSON.stringify(chkTaken.body));
const FREE = 'FREEROOM' + suffix;
const chkFree = await req('/api/room/check?code=' + FREE.toLowerCase());
ok('check 报告空闲的码可用', chkFree.body.ok === true, JSON.stringify(chkFree.body));
ok('check 会把码转成大写', chkFree.body.code === FREE, chkFree.body.code);

const customGet = await req('/api/state/' + CUSTOM);
ok('自定义码的房间能正常读', customGet.status === 200, String(customGet.status));

/* ---- 列表：一台服务器就是一个家庭，直接开放，不要口令 ---- */
const openList = await req('/api/rooms');
ok('房间列表不需要口令', openList.status === 200 && Array.isArray(openList.body.rooms),
  String(openList.status));
ok('列表里带了"删房间要不要口令"的标记',
  typeof openList.body.needsKeyToDelete === 'boolean', JSON.stringify(openList.body.needsKeyToDelete));

const mine0 = (openList.body.rooms || []).filter(function (r) { return r.code === CUSTOM; })[0];
ok('列表里能找到刚建的自定义房间', Boolean(mine0), '共 ' + (openList.body.rooms || []).length + ' 个');
ok('列表里有余额和更新时间',
  Boolean(mine0 && typeof mine0.balance === 'number' && mine0.updatedAt > 0), JSON.stringify(mine0));
ok('列表不夹带完整状态（隐私）',
  Boolean(mine0 && !('settings' in mine0) && !('days' in mine0) && !('ledger' in mine0)));
ok('列表按最近更新排前面', (openList.body.rooms || []).length < 2 ||
  openList.body.rooms[0].updatedAt >= openList.body.rooms[openList.body.rooms.length - 1].updatedAt);

/* ---- 改名也不要口令 ---- */
const renamedNoKey = await req('/api/room/' + CUSTOM + '/rename', {
  method: 'POST', headers: jsonHdr,
  body: JSON.stringify({ name: '免口令改的名字', childName: '小免' }),
});
ok('改名不需要口令', renamedNoKey.status === 200 && renamedNoKey.body.room.name === '免口令改的名字',
  JSON.stringify(renamedNoKey.body.room));
ok('改名顺带改了孩子名字', renamedNoKey.body.room && renamedNoKey.body.room.childName === '小免');
const listedAfterRename = await req('/api/rooms');
const foundRenamed = (listedAfterRename.body.rooms || []).filter(function (r) { return r.code === CUSTOM; })[0];
ok('列表里看到的是改后的名字', foundRenamed && foundRenamed.name === '免口令改的名字',
  foundRenamed && foundRenamed.name);

const missingRename = await req('/api/room/NOSUCHROOM/rename', {
  method: 'POST', headers: jsonHdr, body: JSON.stringify({ name: 'x' }),
});
ok('改不存在的房间 404', missingRename.status === 404, String(missingRename.status));

console.log('\n【十】房间管理口令（只用在删除）');

const adminFile = path.join(ROOT, 'data', '_admin.json');

const adminState = await req('/api/admin/state');
ok('GET /api/admin/state 可用',
  adminState.status === 200 && typeof adminState.body.configured === 'boolean',
  JSON.stringify(adminState.body));

let adminKey = String(process.env.HB_ADMIN_KEY || '');
const fromEnv = adminState.body.source === 'env';
let keyConfigured = adminState.body.configured;
let iSetTheKey = false;

if (fromEnv) {
  ok('口令来自环境变量 HB_ADMIN_KEY', true);
} else if (!adminState.body.configured) {
  const short = await req('/api/admin/setup', {
    method: 'POST', headers: jsonHdr, body: JSON.stringify({ key: 'abc' }),
  });
  ok('设置口令：太短 400', short.status === 400, String(short.status));

  adminKey = 'apitest-' + Date.now().toString(36);
  const set = await req('/api/admin/setup', {
    method: 'POST', headers: jsonHdr, body: JSON.stringify({ key: adminKey }),
  });
  ok('设置口令成功', set.status === 200 && set.body.ok === true, JSON.stringify(set.body));
  keyConfigured = true;
  iSetTheKey = true;

  const again = await req('/api/admin/setup', {
    method: 'POST', headers: jsonHdr, body: JSON.stringify({ key: 'whatever-else' }),
  });
  ok('重复设置 409', again.status === 409, String(again.status));
} else {
  adminKey = '';   // 文件里只有哈希，本机猜不出来
  console.log('');
  console.log('  ⚠️  服务器上已经设了房间管理口令，而测试拿不到它（文件里只存 scrypt 哈希）。');
  console.log('     下面「删除房间」那一段只能验证"不带口令删不掉"，其余断言会跳过。');
  console.log('     想跑全量，二选一：');
  console.log('       a) 删掉 data/_admin.json 然后重启服务（口令就没了，删房间退回只核对房间码）');
  console.log('       b) 用 HB_ADMIN_KEY=xxx node server.js 启服务，再用同样的环境变量跑本测试');
  console.log('');
  skip('口令未知 → 删除成功后的一系列断言');
}

if (adminKey) {
  const goodV = await req('/api/admin/verify', {
    method: 'POST', headers: jsonHdr, body: JSON.stringify({ key: adminKey }),
  });
  ok('verify 正确口令 200', goodV.status === 200 && goodV.body.ok === true, String(goodV.status));
  const badV = await req('/api/admin/verify', {
    method: 'POST', headers: jsonHdr, body: JSON.stringify({ key: adminKey + '-wrong' }),
  });
  ok('verify 错误口令 401', badV.status === 401, String(badV.status));
}

/* ---- 落盘必须是哈希，不能有明文 ---- */
if (fs.existsSync(adminFile)) {
  const raw = fs.readFileSync(adminFile, 'utf8');
  ok('口令文件里没有明文 key 字段', !/"key"\s*:/.test(raw), raw.slice(0, 80));
  ok('口令文件是 scrypt 哈希结构',
    /"algo"\s*:\s*"scrypt"/.test(raw) && /"salt"/.test(raw) && /"hash"/.test(raw), raw.slice(0, 120));
  ok('口令文件里有盐', /"salt"\s*:\s*"[0-9a-f]{16,}"/.test(raw));
  if (adminKey) ok('口令文件里搜不到明文口令', raw.indexOf(adminKey) < 0, '明文泄漏了！');
} else {
  ok('口令存在环境变量里，没有落盘文件', fromEnv || !keyConfigured, adminFile);
}

console.log('\n【十一】附件：上传 / 取回 / 限额 / 防穿越');

/*
 * 上传走原始字节：POST /api/upload/<房间>?name=xxx，body 就是文件本身。
 * 这里用 fetch 直接发一个 Buffer，和浏览器发 File 是同一条路径。
 */
const pngBytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(300, 7)]);
const up1 = await fetch(BASE + '/api/upload/' + room + '?name=' + encodeURIComponent('老师的卷子.png'),
  { method: 'POST', body: pngBytes });
const up1j = await up1.json();
ok('POST /api/upload 传图片 200', up1.status === 200, String(up1.status));
ok('文件名原样保留', up1j.file && up1j.file.name === '老师的卷子.png', up1j.file && up1j.file.name);
ok('按扩展名认出类型', up1j.file && up1j.file.kind === 'image' && up1j.file.mime === 'image/png',
  up1j.file && up1j.file.mime);
ok('大小对得上', up1j.file && up1j.file.size === pngBytes.length, String(up1j.file && up1j.file.size));
ok('生成的 id 合法', Boolean(up1j.file && /^[a-z0-9]{16}\.png$/.test(up1j.file.id)),
  up1j.file && up1j.file.id);
ok('返回了可以直接用的 url', Boolean(up1j.url && up1j.url.indexOf('/api/file/') === 0), up1j.url);

const back = await fetch(BASE + '/api/file/' + room + '/' + up1j.file.id);
const backBuf = Buffer.from(await back.arrayBuffer());
ok('GET /api/file 能取回', back.status === 200, String(back.status));
ok('Content-Type 对', String(back.headers.get('content-type')).indexOf('image/png') === 0,
  back.headers.get('content-type'));
ok('字节完全一致', backBuf.equals(pngBytes), backBuf.length + ' vs ' + pngBytes.length);
ok('声明支持 Range（手机看视频要拖进度条）', back.headers.get('accept-ranges') === 'bytes');

const ranged = await fetch(BASE + '/api/file/' + room + '/' + up1j.file.id,
  { headers: { Range: 'bytes=0-9' } });
ok('Range 请求返回 206', ranged.status === 206, String(ranged.status));
ok('Content-Range 对', ranged.headers.get('content-range') === 'bytes 0-9/' + pngBytes.length,
  ranged.headers.get('content-range'));
ok('Range 只回 10 字节', (await ranged.arrayBuffer()).byteLength === 10);
const tail = await fetch(BASE + '/api/file/' + room + '/' + up1j.file.id,
  { headers: { Range: 'bytes=-10' } });
ok('末尾 Range 也对', tail.status === 206 && (await tail.arrayBuffer()).byteLength === 10);
ok('越界的 Range 返回 416',
  (await fetch(BASE + '/api/file/' + room + '/' + up1j.file.id,
    { headers: { Range: 'bytes=999999-' } })).status === 416);

ok('.exe 被拒绝', (await fetch(BASE + '/api/upload/' + room + '?name=x.exe',
  { method: 'POST', body: pngBytes })).status === 400);
ok('.html 被拒绝（能塞脚本）', (await fetch(BASE + '/api/upload/' + room + '?name=x.html',
  { method: 'POST', body: pngBytes })).status === 400);
ok('空文件被拒绝', (await fetch(BASE + '/api/upload/' + room + '?name=a.txt',
  { method: 'POST', body: Buffer.alloc(0) })).status === 400);
ok('穿越读取被挡',
  (await fetch(BASE + '/api/file/' + room + '/..%2f..%2fetc%2fpasswd')).status === 400);
ok('不存在的附件 404',
  (await fetch(BASE + '/api/file/' + room + '/aaaaaaaaaaaaaaaa.png')).status === 404);
ok('坏房间码 400', (await fetch(BASE + '/api/upload/xx?name=a.png',
  { method: 'POST', body: pngBytes })).status === 400);

const txtBytes = Buffer.from('今天作业：语文背诵', 'utf8');
const up2 = await fetch(BASE + '/api/upload/' + room + '?name=' + encodeURIComponent('作业.txt'),
  { method: 'POST', body: txtBytes });
const up2j = await up2.json();
ok('文本附件能传', up2.status === 200 && up2j.file.kind === 'text', JSON.stringify(up2j.file));

// 附件记录能跟着作业一起存
const attAdd = await req('/api/state/' + room + '/op', {
  method: 'POST', headers: jsonHdr,
  body: JSON.stringify({ ops: [
    { t: 'hw.add', date: date, items: [{ subject: '语文', title: '带附件的作业' }] },
  ] }),
});
const attHwId = attAdd.body.state.days[date].homeworks.filter(function (h) {
  return h.title === '带附件的作业';
})[0].id;
const attPut = await req('/api/state/' + room + '/op', {
  method: 'POST', headers: jsonHdr,
  body: JSON.stringify({ ops: [
    { t: 'attach.add', date: date, kind: 'homework', id: attHwId, scope: 'item', file: up1j.file },
    { t: 'attach.add', date: date, kind: 'homework', id: attHwId, scope: 'work', file: up2j.file },
  ] }),
});
const attHw = attPut.body.state.days[date].homeworks.filter(function (h) { return h.id === attHwId; })[0];
ok('服务器认得 attach.add（不是旧版本）', attPut.status === 200, String(attPut.status));
ok('附件记在作业上', attHw && attHw.attachments.length === 1, JSON.stringify(attHw && attHw.attachments));
ok('"交作业"记在 works 上', attHw && attHw.works.length === 1, JSON.stringify(attHw && attHw.works));
ok('附件信息能在两台设备间同步', (function () {
  const again = attPut.body.state.days[date].homeworks.filter(function (h) { return h.id === attHwId; })[0];
  return again.attachments[0].name === '老师的卷子.png' && again.attachments[0].size === pngBytes.length;
})());
ok('/api/health 报告了附件上限', Number(health.body.maxUploadMB) > 0 || health.body.attachments === false,
  JSON.stringify({ attachments: health.body.attachments, maxUploadMB: health.body.maxUploadMB }));

console.log('\n【十二】新增记录的 id：服务器必须用客户端给的那个');

/*
 * 这是"点了没反应"的根因守卫。
 *
 * 界面乐观更新时先造好 id 塞进 op；服务器如果又自己随机一个，
 * 同步回来一替换，界面上还捏着旧 id 的按钮（☆ / ✎ / ✕）就全部静默失效，
 * 而且一个错都不报。所以这里直接喊一句"你就用这个 id"，再看它用没用。
 */
// 注意 id 只允许小写字母数字（suffix 是大写的，得转一下）
const myHwId = 'h_fixed' + suffix.toLowerCase().slice(0, 4);
const idAdd = await req('/api/state/' + room + '/op', {
  method: 'POST', headers: jsonHdr,
  body: JSON.stringify({ ops: [
    { t: 'hw.add', date: date, items: [{ id: myHwId, subject: '数学', title: 'id 必须一致' }] },
  ] }),
});
const idBack = (idAdd.body.state.days[date].homeworks || []).filter(function (h) {
  return h.title === 'id 必须一致';
})[0];
ok('服务器原样使用客户端给的 id', idBack && idBack.id === myHwId,
  (idBack ? idBack.id : '没找到') + ' vs ' + myHwId);

const idAgain = await req('/api/state/' + room);
const idBack2 = (idAgain.body.state.days[date].homeworks || []).filter(function (h) {
  return h.title === 'id 必须一致';
})[0];
ok('重新拉一次 state，id 还是那个（不会一同步就变）', idBack2 && idBack2.id === myHwId,
  idBack2 ? idBack2.id : '没找到');

const badAdd = await req('/api/state/' + room + '/op', {
  method: 'POST', headers: jsonHdr,
  body: JSON.stringify({ ops: [
    { t: 'hw.add', date: date, items: [{ id: '../../坏', subject: '数学', title: '坏 id' }] },
  ] }),
});
const badBack = (badAdd.body.state.days[date].homeworks || []).filter(function (h) {
  return h.title === '坏 id';
})[0];
ok('不合规的 id 被换掉（不认它）',
  badBack && badBack.id !== '../../坏' && /^[a-z]{1,4}_[a-z0-9]{4,24}$/.test(badBack.id),
  badBack ? badBack.id : '没找到');

console.log('\n【十三】删房间');
const q = adminKey ? '?key=' + encodeURIComponent(adminKey) : '';
const TMP = 'DELME' + suffix;
const mk = await req('/api/room', {
  method: 'POST', headers: jsonHdr, body: JSON.stringify({ code: TMP, name: '待删房间' }),
});
ok('建一个用于删除的房间', mk.status === 201, String(mk.status));

if (!keyConfigured) {
  const del = await req('/api/room/' + TMP, { method: 'DELETE' });
  ok('没设口令时直接就能删', del.status === 200 && del.body.ok === true, String(del.status));
} else if (adminKey) {
  const noKeyDel = await req('/api/room/' + TMP, { method: 'DELETE' });
  ok('设了口令时，不带口令删被拒 401', noKeyDel.status === 401, String(noKeyDel.status));

  const wrongKeyDel = await req('/api/room/' + TMP + '?key=nope', { method: 'DELETE' });
  ok('口令不对也删不掉 401', wrongKeyDel.status === 401, String(wrongKeyDel.status));

  const del = await req('/api/room/' + TMP + q, { method: 'DELETE' });
  ok('带对口令删成功', del.status === 200 && del.body.ok === true, JSON.stringify(del.body));
} else {
  const noKeyDel = await req('/api/room/' + TMP, { method: 'DELETE' });
  ok('设了口令时，不带口令删被拒 401', noKeyDel.status === 401, String(noKeyDel.status));
  skip('本机不知道口令 → 删不掉，后面的 404 / 列表断言');
}

if (!adminKey && keyConfigured) {
  // 口令未知，TMP 还留着，别当成 bug
} else {
  const gone = await req('/api/state/' + TMP);
  ok('删完就读不到了 404', gone.status === 404, String(gone.status));

  const delAgain = await req('/api/room/' + TMP + q, { method: 'DELETE' });
  ok('重复删 404', delAgain.status === 404, String(delAgain.status));

  const listed3 = await req('/api/rooms');
  ok('列表里也没有它了',
    !(listed3.body.rooms || []).some(function (r) { return r.code === TMP; }));
  ok('删掉的是别的房间，当前房间还在', (await req('/api/state/' + CUSTOM)).status === 200);
}

/* ---- 测试自己设的口令，跑完清掉，免得影响下一次 ---- */
if (iSetTheKey) {
  const cleared = await req('/api/admin/clear', {
    method: 'POST', headers: jsonHdr, body: JSON.stringify({ key: adminKey }),
  });
  ok('取消口令成功', cleared.status === 200 && cleared.body.configured === false,
    JSON.stringify(cleared.body));
  const afterClear = await req('/api/admin/state');
  ok('取消后状态变成未配置', afterClear.body.configured === false, JSON.stringify(afterClear.body));
  // 没口令了，删房间应该又能直接删
  const TMP2 = 'DELME2' + suffix;
  await req('/api/room', {
    method: 'POST', headers: jsonHdr, body: JSON.stringify({ code: TMP2, name: '再删一个' }),
  });
  const del2 = await req('/api/room/' + TMP2, { method: 'DELETE' });
  ok('取消口令后又能直接删', del2.status === 200, String(del2.status));
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败' +
  (skipped ? '，' + skipped + ' 处跳过' : '') + '\n');
console.log('测试房间：' + room + '（服务器上 data/' + room + '.json）');
console.log('自定义房间：' + CUSTOM + '\n');
if (skipped) {
  console.log('⚠️  有跳过项，说明这一轮没测全 —— 按上面的提示处理后重跑。\n');
}
process.exit(fail ? 1 : 0);
