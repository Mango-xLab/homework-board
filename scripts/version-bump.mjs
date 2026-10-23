/*
 * 版本号自动编排。
 *
 *   node scripts/version-bump.mjs "休息页加了转圈倒计时" "每日任务支持备注"
 *
 * 做的事：
 *   1. 算一遍 public/ 下前端文件的内容指纹（跟 /api/version 用的是同一套算法）
 *   2. 跟 public/changelog.json 里记的上一次指纹比：
 *        · 一样   → 代码没动，什么都不做
 *        · 不一样 → 生成一个新版本号，把这次改了什么记进历史
 *
 * 版本号格式：v1.0.月日时分.四位随机码   例：v1.0.10102311.a3f9
 *   时间那一段保证越改越大（递增）；四位随机码避免同分钟内重复。
 *
 * 注意：changelog.json 自己**不算**进指纹，所以升版本这个动作
 * 不会反过来又触发一次新版本（否则就永远升不完了）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetHash, isAssetName } from '../public/core.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC = path.join(ROOT, 'public');
const FILE = path.join(PUBLIC, 'changelog.json');

const VERSION_RE = /^v(\d+)\.(\d+)\./;

function contentHash() {
  const names = fs.readdirSync(PUBLIC).filter(isAssetName).sort();
  const pairs = names.map(function (n) { return [n, fs.readFileSync(path.join(PUBLIC, n), 'utf8')]; });
  return { hash: assetHash(pairs), names: names };
}

function readLog() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!j || typeof j !== 'object') throw new Error('不是对象');
    if (!Array.isArray(j.history)) j.history = [];
    return j;
  } catch (e) {
    return { version: '', hash: '', history: [] };
  }
}

// 四位随机码（小写字母 + 数字，去掉容易看混的）
function rand4() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

// v1.0.月日时分.XXXX
function makeVersion(prefix, when) {
  const d = when || new Date();
  const p2 = function (n) { return String(n).padStart(2, '0'); };
  return prefix + '.' + p2(d.getMonth() + 1) + p2(d.getDate()) + p2(d.getHours()) + p2(d.getMinutes()) +
    '.' + rand4();
}

const { hash, names } = contentHash();
const log = readLog();
const notes = process.argv.slice(2).filter(function (a) { return a.indexOf('--') !== 0; });

// 主版本号沿用上一次的（比如一直是 v1.0.xxx），也可以用 --v1.2 覆盖
const minorArg = process.argv.find(function (a) { return /^--v\d+\.\d+$/.test(a); });
let prefix = 'v1.0';
if (minorArg) prefix = minorArg;
else if (log.version) {
  const m = VERSION_RE.exec(log.version);
  if (m) prefix = 'v' + m[1] + '.' + m[2];
}

if (log.hash === hash && log.version) {
  console.log('');
  console.log('  代码没有变化，不用升版本。');
  console.log('  当前版本：' + log.version);
  console.log('  内容指纹：' + hash + '（' + names.join(', ') + '）');
  console.log('');
  process.exit(0);
}

const now = new Date();
const version = makeVersion(prefix, now);
const at = now.getFullYear() + '-' +
  String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' +
  String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

log.version = version;
log.hash = hash;
log.updatedAt = at;
log.history.unshift({
  v: version,
  at: at,
  notes: notes.length ? notes : ['更新了内容（没写具体说明）'],
});

// 历史只留最近 30 条，免得这个文件越滚越大
if (log.history.length > 30) log.history.length = 30;

fs.writeFileSync(FILE, JSON.stringify(log, null, 2) + '\n');
console.log('');
console.log('  ✅ 新版本：' + version);
console.log('     时间：' + at);
console.log('     说明：' + log.history[0].notes.join('；'));
console.log('     指纹：' + hash + '（' + names.join(', ') + '）');
console.log('     历史共 ' + log.history.length + ' 条');
console.log('');
console.log('  记得重新打包并传上去：npm run build:worker');
console.log('');
