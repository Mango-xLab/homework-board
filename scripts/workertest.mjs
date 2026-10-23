/*
 * 验证打包出来的单文件 Worker 真的能跑
 * （用假的 KV 模拟 Cloudflare 环境，不需要联网、不需要账号）
 *
 *   node scripts/build-worker.mjs && node scripts/workertest.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); }
}

// 假的 KV 命名空间
function mockKV() {
  const store = new Map();
  return {
    _store: store,
    async get(key, type) {
      if (!store.has(key)) return null;
      const v = store.get(key);
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key, value) { store.set(key, String(value)); },
    async delete(key) { store.delete(key); },
  };
}

const mod = await import('../dist/worker.js');
const worker = mod.default;
const env = { HB_KV: mockKV() };

function call(path, init) {
  return worker.fetch(new Request('http://example.com' + path, init), env);
}
function post(path, body) {
  return call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

console.log('\n【一】静态页面');
for (const [p, kw] of [['/', '作业小站'], ['/style.css', '--accent'], ['/app.js', 'viewToday'], ['/core.js', 'parseHomeworkText']]) {
  const r = await call(p);
  const t = await r.text();
  ok('GET ' + p + ' → 200 且内容对', r.status === 200 && t.includes(kw), r.status + ' / ' + t.slice(0, 40));
}

/*
 * public/ 下每个前端文件都要能从 Worker 取到。
 * 少打一个进 dist，线上就是 404 + 白屏（app.js import 不到那个模块）。
 */
const pubFiles = fs.readdirSync(path.join(ROOT, 'public'))
  .filter(function (f) { return /\.(js|css|html|json)$/.test(f); }).sort();
for (const f of pubFiles) {
  const r = await call('/' + f);
  ok('Worker 能提供 /' + f, r.status === 200, String(r.status));
}
const css = await call('/style.css');
ok('CSS 的 Content-Type 正确', (css.headers.get('content-type') || '').includes('text/css'), css.headers.get('content-type'));

const nf = await call('/nothing.txt');
ok('不存在的文件 → 404', nf.status === 404, String(nf.status));

console.log('\n【二】接口');
const health = await (await call('/api/health')).json();
ok('健康检查', health.ok === true && health.storage === 'cloudflare-kv', JSON.stringify(health));
ok('响应带 CORS 头', (await call('/api/health')).headers.get('access-control-allow-origin') === '*');

const created = await (await post('/api/room', {})).json();
const room = created.room;
ok('创建房间', /^[A-HJ-NP-Z2-9]{6}$/.test(room), room);
ok('数据真的写进 KV 了', env.HB_KV._store.has('hb:room:' + room), Array.from(env.HB_KV._store.keys()).join(','));

const date = new Date().toISOString().slice(0, 10);
let r = await (await post('/api/state/' + room + '/op', {
  ops: [
    { t: 'hw.add', date, items: [{ subject: '语文', title: '背诵《静夜思》', detail: '家长签字' }] },
    { t: 'settings', patch: { childName: '朵朵' } },
  ],
})).json();
ok('批量操作成功', r.state.days[date].homeworks.length === 1, JSON.stringify(r.state.days[date]));
ok('设置也生效了', r.state.settings.childName === '朵朵');

const hwId = r.state.days[date].homeworks[0].id;
r = await (await post('/api/state/' + room + '/op', { ops: [{ t: 'item.done', date, kind: 'homework', id: hwId, value: true }] })).json();
ok('打勾后还没得分', r.state.points.balance === 0, String(r.state.points.balance));
r = await (await post('/api/state/' + room + '/op', { ops: [{ t: 'item.confirm', date, kind: 'homework', id: hwId, value: true }] })).json();
ok('确认后 +2', r.state.points.balance === 2, String(r.state.points.balance));

const fetched = await (await call('/api/state/' + room)).json();
ok('重新读取，打勾状态还在（KV 往返正常）', fetched.state.days[date].homeworks[0].confirmed === true);
ok('余额也没丢', fetched.state.points.balance === 2, String(fetched.state.points.balance));

const missing = await call('/api/state/ZZZZZZ');
ok('不存在的房间 → 404', missing.status === 404, String(missing.status));

const opt = await call('/api/health', { method: 'OPTIONS' });
ok('OPTIONS 预检 → 204', opt.status === 204, String(opt.status));

console.log('\n【三】没有绑定 KV 时也不能崩');
const bare = { };
const w2 = mod.default;
const b1 = await w2.fetch(new Request('http://example.com/api/health'), bare);
const b1j = await b1.json();
ok('无 KV 时健康检查仍可用', b1.status === 200 && b1j.storage.includes('memory'), JSON.stringify(b1j));
const b2 = await w2.fetch(new Request('http://example.com/'), bare);
ok('无 KV 时首页照样能打开', b2.status === 200 && (await b2.text()).includes('作业小站'));

console.log('\n【四】房间管理');

const CUSTOM = 'WKTEST' + Date.now().toString(36).toUpperCase().slice(-5);
const madeRoom = await (await post('/api/room', { code: CUSTOM.toLowerCase(), name: '工人测试房' })).json();
ok('支持自定义房间码', madeRoom.room === CUSTOM, madeRoom.room);
ok('房间名写进状态里', madeRoom.state.settings.roomName === '工人测试房', JSON.stringify(madeRoom.state.settings.roomName));

const dupRoom = await post('/api/room', { code: CUSTOM });
ok('重复房间码 409', dupRoom.status === 409, String(dupRoom.status));

const cnRoom = await post('/api/room', { code: '我的小家' });
ok('全中文房间码 400', cnRoom.status === 400, String(cnRoom.status));

const shortRoom = await post('/api/room', { code: 'AB' });
ok('太短房间码 400', shortRoom.status === 400, String(shortRoom.status));

const chkTaken = await (await call('/api/room/check?code=' + CUSTOM)).json();
ok('check 报告已占用', chkTaken.ok === false, JSON.stringify(chkTaken));
const chkFree = await (await call('/api/room/check?code=free' + Date.now().toString(36))).json();
ok('check 报告空闲可用', chkFree.ok === true, JSON.stringify(chkFree));

// 列表是开放的：一台服务器就是一个家庭，不需要口令
const noKeyEnv = await mod.default.fetch(new Request('http://example.com/api/rooms'), env);
const noKeyList = await noKeyEnv.json();
ok('没设口令时房间列表照样能读', noKeyEnv.status === 200 && Array.isArray(noKeyList.rooms),
  String(noKeyEnv.status));
ok('列表里带了"删房间要不要口令"的标记', noKeyList.needsKeyToDelete === false,
  JSON.stringify(noKeyList.needsKeyToDelete));

const keyedEnv = { HB_KV: env.HB_KV, HB_ADMIN_KEY: 'wkkkkkkkkkkk' };
const goodKey = await mod.default.fetch(new Request('http://example.com/api/rooms'), keyedEnv);
const goodList = await goodKey.json();
ok('设了口令也照样能读列表', goodKey.status === 200 && Array.isArray(goodList.rooms), String(goodKey.status));
ok('设了口令后标记变成 true', goodList.needsKeyToDelete === true,
  JSON.stringify(goodList.needsKeyToDelete));
ok('列表里有刚建的自定义房间',
  goodList.rooms.some(function (r) { return r.code === CUSTOM; }),
  goodList.rooms.map(function (r) { return r.code; }).join(','));
ok('列表带房间名', goodList.rooms.some(function (r) { return r.name === '工人测试房'; }));
ok('列表不夹带 days / ledger',
  goodList.rooms.every(function (r) { return !('days' in r) && !('ledger' in r); }));

/* ---- 改名：谁都能改（家庭内部日常管理） ---- */
const wq = '?key=wkkkkkkkkkkk';
const renamed = await mod.default.fetch(new Request('http://example.com/api/room/' + CUSTOM + '/rename', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '工人改的名', childName: '小工' }),
}), keyedEnv);
const renamedBody = await renamed.json();
ok('Worker 版能改房间名（不要口令）', renamed.status === 200 && renamedBody.room.name === '工人改的名',
  JSON.stringify(renamedBody.room));
ok('改名也改了孩子名字', renamedBody.room && renamedBody.room.childName === '小工');

const missingRename = await mod.default.fetch(new Request('http://example.com/api/room/NOSUCH/rename', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x' }),
}), keyedEnv);
ok('改不存在的房间 404', missingRename.status === 404, String(missingRename.status));

/* ---- 删除：设了口令就要口令 ---- */
const noKeyDel = await mod.default.fetch(new Request('http://example.com/api/room/' + CUSTOM, {
  method: 'DELETE',
}), keyedEnv);
ok('设了口令时删除没带口令 401', noKeyDel.status === 401, String(noKeyDel.status));

const wrongDel = await mod.default.fetch(new Request('http://example.com/api/room/' + CUSTOM + '?key=nope', {
  method: 'DELETE',
}), keyedEnv);
ok('口令不对也删不掉 401', wrongDel.status === 401, String(wrongDel.status));

const deleted = await mod.default.fetch(new Request('http://example.com/api/room/' + CUSTOM + wq, {
  method: 'DELETE',
}), keyedEnv);
ok('Worker 版带口令能删房间', deleted.status === 200, String(deleted.status));

const gone = await mod.default.fetch(new Request('http://example.com/api/state/' + CUSTOM), keyedEnv);
ok('删完读不到了 404', gone.status === 404, String(gone.status));

const listAfter = await (await mod.default.fetch(new Request('http://example.com/api/rooms'), keyedEnv)).json();
ok('删完索引里也没有它', !listAfter.rooms.some(function (r) { return r.code === CUSTOM; }),
  listAfter.rooms.map(function (r) { return r.code; }).join(','));

const delAgain = await mod.default.fetch(new Request('http://example.com/api/room/' + CUSTOM + wq, {
  method: 'DELETE',
}), keyedEnv);
ok('重复删 404', delAgain.status === 404, String(delAgain.status));

/* ---- 没设口令时，删房间不需要口令（靠前端核对房间码兜底） ---- */
const OPENROOM = 'OPEN' + Date.now().toString(36).toUpperCase().slice(-5);
const mkOpen = await mod.default.fetch(new Request('http://example.com/api/room', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: OPENROOM, name: '没口令也能删' }),
}), env);
ok('建一个用于"无口令删除"的房间', mkOpen.status === 201, String(mkOpen.status));

const delNoKey = await mod.default.fetch(new Request('http://example.com/api/room/' + OPENROOM, {
  method: 'DELETE',
}), env);
ok('没设口令时直接就能删', delNoKey.status === 200, String(delNoKey.status));

const goneOpen = await mod.default.fetch(new Request('http://example.com/api/state/' + OPENROOM), env);
ok('删完也读不到了', goneOpen.status === 404, String(goneOpen.status));

/* ---- 至少保留一个房间：用一个全新的 KV，里面只放一个房间 ---- */
const soloEnv = { HB_KV: mockKV() };
await mod.default.fetch(new Request('http://example.com/api/room', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: 'ONLYONE', name: '唯一的一个' }),
}), soloEnv);
const soloList = await (await mod.default.fetch(new Request('http://example.com/api/rooms'), soloEnv)).json();
ok('新环境里只有一个房间', soloList.rooms.length === 1, String(soloList.rooms.length));
const delLast = await mod.default.fetch(new Request('http://example.com/api/room/ONLYONE', {
  method: 'DELETE',
}), soloEnv);
ok('最后一个房间不给删（409）', delLast.status === 409, String(delLast.status));
const stillThere = await mod.default.fetch(new Request('http://example.com/api/state/ONLYONE'), soloEnv);
ok('拦下来之后房间还在', stillThere.status === 200, String(stillThere.status));

/* ---- Worker 版的口令端点：能做的做，做不了的要说清楚（不能没头没尾 404） ---- */
const stNo = await (await mod.default.fetch(new Request('http://example.com/api/admin/state'), env)).json();
ok('没设 HB_ADMIN_KEY 时 state 说没配、也不能现设',
  stNo.configured === false && stNo.canSetup === false, JSON.stringify(stNo));
const stYes = await (await mod.default.fetch(new Request('http://example.com/api/admin/state'), keyedEnv)).json();
ok('设了 HB_ADMIN_KEY 时 state 说配了、来源 env',
  stYes.configured === true && stYes.source === 'env', JSON.stringify(stYes));

const vOk = await mod.default.fetch(new Request('http://example.com/api/admin/verify', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'wkkkkkkkkkkk' }),
}), keyedEnv);
const vOkBody = await vOk.json();
ok('Worker 版能验口令（对的 → 200 ok:true）', vOk.status === 200 && vOkBody.ok === true,
  vOk.status + ' ' + JSON.stringify(vOkBody));
const vBad = await mod.default.fetch(new Request('http://example.com/api/admin/verify', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'nope' }),
}), keyedEnv);
ok('Worker 版验口令（错的 → 401）', vBad.status === 401, String(vBad.status));

for (const m of ['setup', 'change', 'clear']) {
  const r = await mod.default.fetch(new Request('http://example.com/api/admin/' + m, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'x' }),
  }), keyedEnv);
  const b = await r.json();
  ok('/admin/' + m + ' 明确回 501 并说清去改 HB_ADMIN_KEY',
    r.status === 501 && String(b.error).indexOf('HB_ADMIN_KEY') >= 0,
    r.status + ' / ' + String(b.error).slice(0, 50));
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败\n');
process.exit(fail ? 1 : 0);
