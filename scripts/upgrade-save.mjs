/*
 * 存档体检 + 升级（常驻工具，以后有文件都走它）。
 *
 *   node scripts/upgrade-save.mjs "<输入.json>"             只看不写
 *   node scripts/upgrade-save.mjs "<输入.json>" --write     备份原件后写回
 *   node scripts/upgrade-save.mjs "<输入.json>" "<输出.json>"  写到指定文件
 *
 * 四组校验：① 原有数据保全 ② 幂等 ③ 新字段补全 ④ 关键数据对账。
 * 升级用的是**服务器读存档时的同一个函数** normalizeState()，
 * 所以"升级后的文件"和"服务器加载后的状态"逐字节一致。
 */
import fs from 'node:fs';
import path from 'node:path';
import * as C from '../public/core.js';

const SRC = process.argv[2];
const arg2 = process.argv[3];
const WRITE_IN_PLACE = arg2 === '--write';
const OUT = WRITE_IN_PLACE ? SRC : arg2;

if (!SRC) {
  console.error('用法：node scripts/upgrade-save.mjs "<输入.json>" [--write | "<输出.json>"]');
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const up = C.normalizeState(JSON.parse(JSON.stringify(raw)));

let bad = 0;
const ok = function (label, cond, extra) {
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + label +
    (extra === undefined ? '' : '  → ' + extra));
  if (!cond) bad++;
};

/* ============ 0. 结构差异：和"一份全新的当前版本存档"比 ============ */
{
  const fresh = C.normalizeState(C.defaultState());
  const want = Object.keys(fresh);
  const have = Object.keys(raw);
  console.log('=== 0. 结构差异 ===');
  console.log('  当前版本顶层字段：' + want.join(', '));
  console.log('  这个文件有：     ' + have.join(', '));
  const missTop = want.filter(function (k) { return have.indexOf(k) < 0; });
  const extraTop = have.filter(function (k) { return want.indexOf(k) < 0; });
  console.log('  缺：' + (missTop.length ? missTop.join(', ') : '（无）'));
  console.log('  多出来（当前版本不认）：' + (extraTop.length ? extraTop.join(', ') : '（无）'));

  // 逐字段找缺的（只看形状，深度 2 层）
  const missing = [];
  (function walk(cur, old, prefix, depth) {
    if (!cur || typeof cur !== 'object' || depth > 2) return;
    Object.keys(cur).forEach(function (k) {
      const p = prefix ? prefix + '.' + k : k;
      if (!old || typeof old !== 'object' || !(k in old)) { missing.push(p); return; }
      const cv = cur[k], ov = old[k];
      if (Array.isArray(cv) && cv.length && typeof cv[0] === 'object') {
        if (Array.isArray(ov) && ov.length) walk(cv[0], ov[0], p + '[]', depth + 1);
      } else if (cv && typeof cv === 'object' && !Array.isArray(cv)) {
        walk(cv, ov, p, depth + 1);
      }
    });
  })(up, raw, '', 0);
  const uniq = [];
  missing.forEach(function (m) { if (uniq.indexOf(m) < 0) uniq.push(m); });
  console.log('  缺的字段（升级会补上）：' +
    (uniq.length ? uniq.join(', ') : '（一个都不缺 —— 已经是当前结构）'));
  if (extraTop.length) {
    console.log('  注：多出来的字段会在升级后丢掉 —— 升级走的是 normalizeState，' +
      '它只认当前版本的字段。');
  }
}

/* ============ 1. 原有数据保全 ============ */
console.log('');
console.log('=== 1. 历史数据保全 ===');
const miss = [];
const chg = [];
const dueGone = [];
(function walk(oldV, newV, p) {
  if (oldV === null || oldV === undefined) return;
  if (Array.isArray(oldV)) {
    if (!Array.isArray(newV)) { chg.push(p + '：数组没了'); return; }
    if (newV.length !== oldV.length) chg.push(p + '：条数 ' + oldV.length + ' → ' + newV.length);
    // 任务可能按标签重排、常用库/作业可能按科目重排、日期可能排序 —— 按 id 配对
    const byId = (p === '.dailyTasks' || p === '.commonHomeworks' || /\.homeworks$/.test(p));
    if (byId) {
      oldV.forEach(function (v) {
        const m = newV.filter(function (x) { return x && x.id === v.id; })[0];
        if (!m) { miss.push(p + ' 里少了 ' + v.id); return; }
        walk(v, m, p + '[id=' + v.id + ']');
      });
      return;
    }
    oldV.forEach(function (v, i) { walk(v, newV[i], p + '[' + i + ']'); });
    return;
  }
  if (typeof oldV === 'object') {
    if (!newV || typeof newV !== 'object') { chg.push(p + '：对象没了'); return; }
    Object.keys(oldV).forEach(function (k) { walk(oldV[k], newV[k], p + '.' + k); });
    return;
  }
  /*
   * 任务的 `due`（一个截止日期）在第 81 轮迁进了 `sched`（有效期模型），
   * 迁完按设计删掉旧字段 —— 这不算"丢数据"，单独归到 dueGone 里报。
   */
  if (/\.due$/.test(p)) { dueGone.push(p + ' = ' + JSON.stringify(oldV)); return; }
  if (newV === undefined) { miss.push(p + ' = ' + JSON.stringify(oldV)); return; }
  if (newV !== oldV) chg.push(p + '：' + JSON.stringify(oldV) + ' → ' + JSON.stringify(newV));
})(raw, up, '');

if (dueGone.length) {
  console.log('  说明：' + dueGone.length + ' 个任务的 .due 迁成了 .sched（有效期模型），' +
    '旧字段按设计删掉 —— 不是丢数据');
}
ok('旧文件里每一个值都还在', miss.length === 0,
  miss.length ? miss.slice(0, 6).join('；') : '全部在');
ok('除字段迁移外，已有的值一个都没被改写', chg.length === 0,
  chg.length ? chg.slice(0, 6).join('；') : '全部原样');

/* ============ 2. 幂等 ============ */
console.log('');
console.log('=== 2. 幂等 ===');
ok('再跑一次 normalizeState 结果完全一样',
  JSON.stringify(C.normalizeState(JSON.parse(JSON.stringify(up)))) === JSON.stringify(up));

/* ============ 3. 新字段 ============ */
console.log('');
console.log('=== 3. 新字段补全 ===');
ok('settings.compressImages 有值（图片压缩开关）',
  typeof up.settings.compressImages === 'boolean', String(up.settings.compressImages));
ok('settings.holidays 是数组（法定节假日清单）',
  Array.isArray(up.settings.holidays) && up.settings.holidays.length > 0,
  (up.settings.holidays || []).length + ' 条');
ok('顶层 tasksSortedByTag 在', up.tasksSortedByTag === true, String(up.tasksSortedByTag));
ok('顶层 homeworksSortedByRank 在', up.homeworksSortedByRank === true,
  String(up.homeworksSortedByRank));
ok('顶层 commonSortedByRank 在', up.commonSortedByRank === true, String(up.commonSortedByRank));
ok('每个任务都有 tag', up.dailyTasks.every(function (t) { return Boolean(t.tag); }));
ok('每个任务都有 sched（有效期）',
  up.dailyTasks.every(function (t) { return t.sched && t.sched.mode; }),
  up.dailyTasks.map(function (t) { return t.sched.mode; }).join(','));
ok('任务身上没有残留的 due', up.dailyTasks.every(function (t) { return t.due === undefined; }));

/* ============ 4. 关键数据对账 ============ */
console.log('');
console.log('=== 4. 关键数据对账 ===');
function tally(s) {
  const o = { days: Object.keys(s.days || {}).length, hw: 0, ex: 0, tk: 0, att: 0, reviews: 0 };
  Object.keys(s.days || {}).forEach(function (k) {
    const d = s.days[k];
    o.hw += (d.homeworks || []).length;
    o.ex += (d.extras || []).length;
    o.tk += Object.keys(d.tasks || {}).length;
    if (d.review) o.reviews++;
    (d.homeworks || []).forEach(function (h) {
      o.att += (h.attachments || []).length + (h.works || []).length;
    });
    (d.extras || []).forEach(function (e) {
      o.att += (e.attachments || []).length + (e.works || []).length;
    });
    Object.keys(d.tasks || {}).forEach(function (id) {
      o.att += (d.tasks[id].works || []).length;
    });
  });
  return o;
}
const a = tally(raw), b = tally(up);
console.log('  旧：' + JSON.stringify(a));
console.log('  新：' + JSON.stringify(b));
['days', 'hw', 'ex', 'tk', 'att', 'reviews'].forEach(function (k) {
  ok(k + ' 一样', a[k] === b[k], a[k] + ' → ' + b[k]);
});
ok('小红花账本一样', JSON.stringify(raw.points) === JSON.stringify(up.points),
  JSON.stringify(up.points));
ok('流水条数一样', (raw.ledger || []).length === (up.ledger || []).length,
  (raw.ledger || []).length + ' → ' + (up.ledger || []).length);
ok('任务条数一样', (raw.dailyTasks || []).length === up.dailyTasks.length,
  (raw.dailyTasks || []).length + ' → ' + up.dailyTasks.length);
ok('常用库条数一样', (raw.commonHomeworks || []).length === up.commonHomeworks.length,
  (raw.commonHomeworks || []).length + ' → ' + up.commonHomeworks.length);
ok('孩子名字一样', up.settings.childName === raw.settings.childName, up.settings.childName);
ok('家长密码一样', up.settings.parentPin === raw.settings.parentPin, up.settings.parentPin);
ok('rev / createdAt 保留', up.rev === raw.rev && up.createdAt === raw.createdAt,
  'rev ' + up.rev + ' / createdAt ' + up.createdAt);

/* ============ 5. 顺带报一下排序结果 ============ */
console.log('');
console.log('=== 5. 升级后各列表的顺序 ===');
console.log('  常用库：' + up.commonHomeworks.map(function (x) { return x.subject; }).join(', '));
const firstDay = Object.keys(up.days).sort()[0];
if (firstDay) {
  console.log('  最早那天（' + firstDay + '）的作业：' +
    (up.days[firstDay].homeworks || []).map(function (x) { return x.subject; }).join(', '));
}
console.log('  每日任务：' + up.dailyTasks.map(function (t) {
  return t.tag + '/' + C.schedLabel(t, C.todayKey());
}).join('，'));

/* ============ 落盘 ============ */
if (OUT) {
  let bak = null;
  if (WRITE_IN_PLACE) {
    const dot = SRC.lastIndexOf('.');
    bak = SRC.slice(0, dot) + '.升级前备份' + SRC.slice(dot);
    // 已有备份就不覆盖（保住最早的那份原件）
    let n = 2;
    while (fs.existsSync(bak)) {
      bak = SRC.slice(0, dot) + '.升级前备份' + n + SRC.slice(dot);
      n++;
    }
    fs.copyFileSync(SRC, bak);
    console.log('');
    console.log('  已备份原件 → ' + path.basename(bak) + '（' + fs.statSync(bak).size + ' 字节）');
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(up), 'utf8');
  console.log('  已写出 → ' + path.basename(OUT) + '（' + fs.statSync(OUT).size + ' 字节）');
} else {
  console.log('');
  console.log('  （只看不写。要写回就加 --write，或指定输出文件）');
}

console.log('');
console.log(bad ? '  ❌ 有 ' + bad + ' 项不对' : '  ✅ 体检通过，历史数据一条没丢');
process.exit(bad ? 1 : 0);
