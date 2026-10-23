/*
 * 把整个网站打包成一个 worker.js，方便直接在 Cloudflare 网页版
 * 控制台的 "Quick Edit" 里粘贴，不需要 wrangler、不需要 Git。
 *
 * 用法：  node scripts/build-worker.mjs
 * 产物：  dist/worker.js   （单文件，含页面 + 接口 + KV 逻辑）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'worker.js');

/*
 * 要把 public/ 下所有前端文件都列进来。
 * 漏一个 → 单文件 Worker 上那个文件 404 → 页面整个打不开
 * （因为 app.js 会 import 它）。deploytest.mjs 里有检查专门盯这个清单。
 */
const STATIC_FILES = ['index.html', 'style.css', 'app.js', 'ui.js', 'core.js', 'changelog.json'];

const assets = {};
STATIC_FILES.forEach(function (name) {
  assets['/' + name] = fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf8');
});

// 去掉行首的 export，让 core.js 和 handler.js 能在同一个作用域里拼接
function stripExports(src) {
  return src.replace(/^export /gm, '');
}

const coreSrc = stripExports(fs.readFileSync(path.join(PUBLIC_DIR, 'core.js'), 'utf8'));
const handlerSrc = stripExports(fs.readFileSync(path.join(ROOT, 'worker', 'handler.js'), 'utf8'));

const header = `/*
 * 作业小站 · 单文件 Cloudflare Worker（自动生成，别直接改这个文件）
 *
 * 生成命令：node scripts/build-worker.mjs
 *
 * 部署方法：
 *   1. Cloudflare 控制台 → 计算(Workers) → 创建 → 从 Hello World 开始
 *   2. 进入「编辑代码」，把本文件全部内容粘进去，部署
 *   3. 存储和数据库 → KV → 创建命名空间，名字随意（比如 HB_KV）
 *   4. 回到 Worker → 设置 → 绑定 → 添加 → KV 命名空间
 *        变量名称填：HB_KV      选择刚建的命名空间
 *   5. 重新部署一次即可
 *
 * 没绑 KV 也能打开界面，只是数据不持久（刷新可能丢），一定记得绑。
 */

`;

const staticBlock = 'const __ASSETS = ' + JSON.stringify(assets, null, 0) + ';\n\n' +
  'const __MIME = ' + JSON.stringify({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  }) + ';\n\n' +
  `function __serveStatic(url) {
  let p = url.pathname;
  if (p === '/' || p === '') p = '/index.html';
  const body = __ASSETS[p];
  if (body === undefined) {
    return new Response('404 找不到这个文件', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const dot = p.lastIndexOf('.');
  const ext = dot >= 0 ? p.slice(dot) : '';
  const revalidate = ext === '.html' || ext === '.js' || ext === '.css';
  return new Response(body, {
    headers: {
      'Content-Type': __MIME[ext] || 'application/octet-stream',
      'Cache-Control': revalidate ? 'no-cache' : 'public, max-age=600',
    },
  });
}

`;

const footer = `
/*
 * 这里必须把 handler 需要的 core 导出全部列出来。
 * 漏一个，打包出来的 worker.js 里那个名字就是 undefined —— 之前踩过一次
 * （加了新函数忘了同步，Worker 版建房直接 500）。
 * deploytest.mjs 里有一条检查专门盯这个。
 */
const __core = {
  defaultState, applyOps, unknownOps, isKnownOp, normalizeState, roomCode, isValidRoom,
  normalizeRoomCode, roomCodeHint, roomNameOf, roomBrief, roomKeyFrom,
  // 附件相关的（Worker 版的 /api/upload 和 /api/file 要用）
  checkUpload, makeUploadId, isUploadId, isSafeId, derivedId,
};

// 打包时间就是这一版的"前端版本号"：浏览器里跑的还是旧版时会提示刷新
const __VERSION = ${JSON.stringify(new Date().toISOString())};

export default makeWorker(__core, __serveStatic, __VERSION);
`;

const out = header + staticBlock + coreSrc + '\n\n' + handlerSrc + footer;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, out, 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log('');
console.log('  ✅ 打包完成：' + path.relative(ROOT, OUT_FILE) + '（' + kb + ' KB）');
console.log('     把这个文件的全部内容粘到 Cloudflare 控制台即可。');
console.log('');
