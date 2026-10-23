/*
 * 验证"有新版本"提示条：改了前端文件之后，已经打开的页面应该自己发现并提示刷新。
 * 需要先起服务和一个带 --remote-debugging-port 的 Chrome。
 *
 *   node scripts/updatetest.mjs <房间码>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.CDP_PORT || '9333';
const BASE = process.env.BASE || 'http://localhost:5199';
const room = (process.argv[2] || '').toUpperCase();

if (!room) { console.error('用法：node scripts/updatetest.mjs <房间码>'); process.exit(1); }

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); }
}

/* -------------------------------------------------- 极简 CDP 客户端 */
let ws = null, nextId = 1;
const waiting = new Map();

function send(method, params) {
  const id = nextId++;
  return new Promise(function (resolve, reject) {
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    setTimeout(function () {
      if (waiting.has(id)) { waiting.delete(id); reject(new Error('超时：' + method)); }
    }, 20000);
  });
}

async function connect(url) {
  ws = new WebSocket(url);
  await new Promise(function (resolve, reject) {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', function () { reject(new Error('连不上 Chrome')); }, { once: true });
  });
  ws.addEventListener('message', function (ev) {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const w = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) w.reject(new Error(msg.error.message));
      else w.resolve(msg.result);
    }
  });
}

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result && r.result.value;
}

/* ------------------------------------------------------------- 开始 */

console.log('\n【版本提示】');

const v1 = (await (await fetch(BASE + '/api/version')).json()).v;
ok('接口返回了版本号', Boolean(v1) && v1.length >= 6, JSON.stringify(v1));

const target = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(BASE + '/?room=' + room), { method: 'PUT' })).json();
await connect(target.webSocketDebuggerUrl);
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 860, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE + '/?room=' + room });
await sleep(2500);

ok('刚打开时没有提示条', (await evaluate('document.querySelector("#updatebar").hidden')) === true);

// 动一下前端文件（改 mtime），版本号应该跟着变
const appFile = path.join(ROOT, 'public', 'app.js');
const now = new Date();
fs.utimesSync(appFile, now, now);
await sleep(2500);

const v2 = (await (await fetch(BASE + '/api/version')).json()).v;
ok('改了文件之后版本号变了', v2 !== v1, v1 + ' → ' + v2);

// 客户端每 8 秒查一次，等它自己发现
let shown = false;
for (let i = 0; i < 16 && !shown; i++) {
  await sleep(1000);
  shown = await evaluate('document.querySelector("#updatebar").hidden === false');
}
ok('页面自己弹出了「有新版本」提示', shown);

const btnText = await evaluate('(document.querySelector("#btn-update")||{}).textContent || ""');
ok('提示条上有刷新按钮', btnText.indexOf('刷新') >= 0, btnText);

if (process.env.SHOT === '1') {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const out = path.join(ROOT, 'tmp', 'shots', 'update-bar.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('  📸 ' + path.relative(ROOT, out));
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败\n');
process.exit(fail ? 1 : 0);
