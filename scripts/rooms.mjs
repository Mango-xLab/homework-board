/*
 * 房间清理工具：跑测试、试功能会攒下一堆房间，这个脚本帮你清掉。
 *
 * 默认是"演练"，只打印会删掉哪些，不动手。确认无误再加 --yes。
 *
 *   node scripts/rooms.mjs                          # 只列出来
 *   node scripts/rooms.mjs --keep ABC123            # 列出"除了 ABC123 都会删"（演练）
 *   node scripts/rooms.mjs --keep ABC123 --yes      # 真删
 *   node scripts/rooms.mjs --older-than 7 --yes     # 只删 7 天没动过的
 *   node scripts/rooms.mjs --dry-run                # 明确表示演练（默认就是）
 *
 * 服务器设过房间管理口令的话要带上（否则删不掉）：
 *   node scripts/rooms.mjs --keep ABC123 --yes --key=你的口令
 *   或者先设环境变量 HB_ADMIN_KEY
 *
 * 连别的地址：
 *   BASE=http://homework.jhui.wang node scripts/rooms.mjs
 *
 * 永远不会删"最后一个房间"（服务器会拦），也建议用 --keep 留着自己在用的那个。
 */

const BASE = String(process.env.BASE || 'http://localhost:5199').replace(/\/+$/, '');
const KEY = String(process.env.HB_ADMIN_KEY || '');

/**
 * 读命令行参数。三种写法都认：
 *   --keep=ABC123      --keep ABC123      --keep（当开关用，返回 true）
 */
function arg(name) {
  const i = process.argv.findIndex(function (a) { return a === '--' + name || a.startsWith('--' + name + '='); });
  if (i < 0) return null;
  const hit = process.argv[i];
  if (hit.indexOf('=') >= 0) return hit.slice(hit.indexOf('=') + 1);
  const next = process.argv[i + 1];
  if (next && next.indexOf('--') !== 0) return next;   // --keep ABC123 这种
  return true;
}

const keepArg = arg('keep');
const keep = new Set(
  String(keepArg && keepArg !== true ? keepArg : '')
    .split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean)
);
const olderThan = Number(arg('older-than') === true ? 0 : (arg('older-than') || 0));
const keyArg = arg('key');
const key = (keyArg && keyArg !== true ? String(keyArg) : KEY);
const really = process.argv.indexOf('--yes') >= 0;

async function api(path, options) {
  const res = await fetch(BASE + path, options);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { body = text; }
  return { status: res.status, body: body };
}

function days(ts) {
  if (!ts) return '—';
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return '今天';
  if (d === 1) return '昨天';
  return d + ' 天前';
}

const list = await api('/api/rooms');
if (list.status !== 200) {
  console.error('读房间列表失败：HTTP ' + list.status + '  ' + JSON.stringify(list.body));
  console.error('服务器起来了吗？地址：' + BASE);
  process.exit(1);
}

const rooms = (list.body && list.body.rooms) || [];
const needsKey = Boolean(list.body && list.body.needsKeyToDelete);

console.log('');
console.log('服务器：' + BASE);
console.log('存储：' + (list.body.storage || '?') + '　房间数：' + rooms.length +
  '　删房间要不要口令：' + (needsKey ? '要' : '不要'));
console.log('');

if (!rooms.length) {
  console.log('一个房间都没有。');
  process.exit(0);
}

// 找出要删的
const victims = [];
rooms.forEach(function (r) {
  if (keep.has(r.code)) return;
  if (olderThan > 0) {
    const age = r.updatedAt ? (Date.now() - r.updatedAt) / 86400000 : Infinity;
    if (age < olderThan) return;
  }
  victims.push(r);
});

const width = rooms.reduce(function (w, r) { return Math.max(w, r.code.length); }, 6);
console.log('  ' + '房间码'.padEnd(width) + '  余额      最后动过    房间名');
console.log('  ' + '-'.repeat(width + 34));
rooms.forEach(function (r) {
  const mark = victims.indexOf(r) >= 0 ? '✗ 删' : ' 留 ';
  console.log(mark + ' ' + String(r.code).padEnd(width) + '  ' +
    String(r.balance + '⭐').padEnd(6) + '  ' + String(days(r.updatedAt)).padEnd(10) + '  ' + (r.name || ''));
});

console.log('');
console.log('要保留 ' + (rooms.length - victims.length) + ' 个，要删 ' + victims.length + ' 个。');

// 保护：不能把房间删光
if (victims.length >= rooms.length) {
  console.error('');
  console.error('✗ 这样会把所有房间都删掉，服务器会拒绝（至少要保留一个）。');
  console.error('  用 --keep <房间码> 指出要留下的那个。');
  process.exit(1);
}
if (needsKey && !key) {
  console.error('');
  console.error('✗ 服务器设了房间管理口令，删除需要它。用 --key=口令 或设 HB_ADMIN_KEY 环境变量。');
  process.exit(1);
}

if (!victims.length) {
  console.log('');
  console.log('没有要删的。');
  process.exit(0);
}

if (!really) {
  console.log('');
  console.log('（这是演练，什么都没删。确认上面列出的就是要删的，再加 --yes 真删）');
  process.exit(0);
}

console.log('');
let done = 0, failed = 0;
for (const r of victims) {
  const res = await api('/api/room/' + encodeURIComponent(r.code) + '?key=' + encodeURIComponent(key), {
    method: 'DELETE',
  });
  if (res.status === 200 || res.status === 204) {
    done++;
    console.log('  ✓ 删掉 ' + r.code);
  } else {
    failed++;
    console.log('  ✗ ' + r.code + ' 删不掉：HTTP ' + res.status + ' ' +
      JSON.stringify(res.body && res.body.error ? res.body.error : res.body));
  }
}
console.log('');
console.log('删了 ' + done + ' 个，失败 ' + failed + ' 个。');
process.exit(failed ? 1 : 0);
