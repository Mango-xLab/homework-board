/*
 * 部署文件体检：systemd 模板、安装脚本结构、Dockerfile / compose、依赖的环境变量。
 * 这些文件没法在没有服务器的环境里真跑一遍，所以至少把能自动查的都查掉。
 *
 *   node scripts/deploytest.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetHash, isAssetName } from '../public/core.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); }
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n【一】systemd 模板');

const tpl = read('deploy/homework-board.service');
const filled = tpl
  .replace(/__USER__/g, 'hb')
  .replace(/__DIR__/g, '/opt/homework-board')
  .replace(/__PORT__/g, '5173')
  .replace(/__NODE__/g, '/usr/bin/node');

const left = filled.match(/__[A-Z]+__/g);
ok('替换后没有残留占位符', !left, (left || []).join(','));
ok('ExecStart 指向 node + server.js', filled.includes('ExecStart=/usr/bin/node /opt/homework-board/server.js'));
ok('WorkingDirectory 正确', filled.includes('WorkingDirectory=/opt/homework-board'));
ok('DATA_DIR 落在数据目录', filled.includes('Environment=DATA_DIR=/opt/homework-board/data'));
ok('服务崩了会自动重启', filled.includes('Restart=always'));
ok('注册了开机自启', filled.includes('WantedBy=multi-user.target'));
ok('日志走 journald', filled.includes('StandardOutput=journal'));

console.log('\n【二】安装脚本结构');

const sh = read('deploy/install.sh');
const lines = sh.split(/\r?\n/);
const count = (re) => lines.filter(function (l) { return re.test(l.trim()); }).length;

ok('有 shebang', sh.startsWith('#!/usr/bin/env bash'));
ok('开了 set -euo pipefail', sh.includes('set -euo pipefail'));
ok('没有 Windows 换行', !sh.includes('\r'));
ok('校验了 root 权限', sh.includes('EUID'));
ok('if/for/while/case 与 fi/done/esac 数量一致',
  count(/^(if|for|while|case)\b/) === count(/^(fi|done|esac)\b/),
  count(/^(if|for|while|case)\b/) + ' vs ' + count(/^(fi|done|esac)\b/));
ok('here-doc 的 <<EOF 与 EOF 数量一致', count(/<<EOF/) === count(/^EOF$/),
  count(/<<EOF/) + ' vs ' + count(/^EOF$/));
ok('同步代码时排除了 data/', sh.includes("--exclude 'data/'"));
ok('复制代码时先备份了 data（cp 兜底分支）', sh.includes('TMP_DATA'));
ok('重新部署会保留 data/', !/rm -rf "\$APP_DIR\/data"\s*$/.test(sh) || sh.includes('TMP_DATA'));
ok('注册并启用了 systemd 服务', sh.includes('systemctl enable homework-board') && sh.includes('systemctl restart homework-board'));
ok('起来之后做了接口自检', sh.includes('/api/health'));
ok('没有 node_modules 之类的多余安装（零依赖）', !sh.includes('npm install'));
ok('支持 PORT / APP_DIR 环境变量', sh.includes('PORT="${PORT:-5173}"') && sh.includes('APP_DIR="${APP_DIR:-'));
ok('给了跳过装 Node 的开关', sh.includes('SKIP_NODE'));

console.log('\n【三】Docker');

const df = read('deploy/Dockerfile');
ok('从 node:20-alpine 起', df.includes('FROM node:20-alpine'));
ok('只拷运行需要的东西', df.includes('COPY public/ ./public/') && df.includes('COPY server.js'));
ok('数据放在卷里', df.includes('VOLUME ["/data"]') && df.includes('DATA_DIR=/data'));
ok('用非 root 用户跑', df.includes('USER node'));
ok('有健康检查', df.includes('HEALTHCHECK'));
ok('暴露 5173', df.includes('EXPOSE 5173'));

const dc = read('deploy/docker-compose.yml');
ok('compose 构建上下文指向上一级', dc.includes('context: ..'));
ok('compose 把 data 挂出来', dc.includes('../data:/data'));
ok('compose 会自动重启', dc.includes('restart: unless-stopped'));

console.log('\n【四】server.js 真的认这些环境变量');

const sv = read('server.js');
ok('读 PORT', sv.includes('process.env.PORT'));
ok('读 HOST', sv.includes('process.env.HOST'));
ok('读 DATA_DIR', sv.includes('process.env.DATA_DIR'));
ok('默认监听 0.0.0.0（容器里要用）', /HOST\s*=\s*process\.env\.HOST\s*\|\|\s*'0\.0\.0\.0'/.test(sv));

console.log('\n【五】nginx 配置');

const ng = read('deploy/nginx.conf');
ok('反代到 127.0.0.1:5173', ng.includes('proxy_pass http://127.0.0.1:5173'));
ok('带上了 Host 头', ng.includes('proxy_set_header Host'));
ok('带上了 X-Forwarded-Proto（HTTPS 提示要用）', ng.includes('X-Forwarded-Proto'));
ok('限制了上传体积', ng.includes('client_max_body_size'));

/**
 * shell 脚本体检：换行符、平衡的 if/fi、here-doc 有没有正确收尾。
 * 用 Node 直接读字节，比在 Windows 上用 Get-Content 数行可靠。
 */
function shellLint(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = text.split('\n');
  const name = rel.replace('deploy/', '');

  ok(name + '：没有 Windows 换行', !text.includes('\r'));
  ok(name + '：有 shebang', lines[0] === '#!/usr/bin/env bash');
  // 至少要防未定义变量（-u）。诊断类脚本故意不加 -e，免得某条命令失败就中断整份报告。
  const setLine = lines.find(function (l) { return l.startsWith('set -'); }) || '';
  ok(name + '：有 set -u', /set -[a-z]*u/.test(setLine), setLine);

  const trimmed = lines.map(function (l) { return l.trim(); });
  const opens = trimmed.filter(function (l) { return /^(if|for|while|case)\b/.test(l); }).length;
  const closes = trimmed.filter(function (l) { return /^(fi|done|esac)\b/.test(l); }).length;
  ok(name + '：if/for/while/case 与 fi/done/esac 配平', opens === closes, opens + ' vs ' + closes);

  // here-doc：<<'XX' 起、行首 XX 收
  const pending = [];
  let unclosed = null;
  lines.forEach(function (l, i) {
    const m = l.match(/<<-?'?([A-Za-z_][A-Za-z0-9_]*)'?/);
    if (m && pending.length === 0) { pending.push({ tag: m[1], line: i + 1 }); return; }
    if (pending.length && l === pending[0].tag) pending.pop();
  });
  ok(name + '：here-doc 都收尾了', pending.length === 0,
    pending.length ? ('第 ' + pending[0].line + " 行的 <<'" + pending[0].tag + "' 没找到结束标记") : '');
}

console.log('\n【六】shell 脚本体检');
shellLint('deploy/install.sh');
shellLint('deploy/disk-check.sh');
shellLint('deploy/1panel-check.sh');

console.log('\n【七】1Panel 编排');

const c1 = read('deploy/1panel-compose.yml');
ok('1Panel 编排里没有 build（粘贴即可用）', !/^\s*build:/m.test(c1));
ok('用的是官方 node 镜像', /image:\s*node:20-alpine/.test(c1));
ok('代码用宿主机绝对路径挂载', /-\s*\/opt\/homework-board:\/app/.test(c1));
ok('数据落在宿主机目录里', /DATA_DIR:\s*"\/app\/data"/.test(c1));
ok('容器崩了会自动重启', /restart:\s*unless-stopped/.test(c1));
ok('映射了 5199 端口', /-\s*"5199:5173"/.test(c1));
ok('有健康检查', c1.includes('healthcheck'));
ok('不用 version 字段（Compose V2 已废弃）', !/^version:/m.test(c1));

function yamlLint(text, label) {
  const lines = text.split('\n');
  const tabbed = lines.filter(function (l) { return l.includes('\t'); });
  ok(label + '：没有用 Tab 缩进', tabbed.length === 0, tabbed.length + ' 行');
  const bad = lines.filter(function (l) {
    const t = l.trim();
    if (!t || t.startsWith('#')) return false;
    // 允许 "key:"、"key: value"、"- value"、"- key: value"、"[...]" 这类
    return !/^(-|)?\s*[^:]+:(\s.*)?$/.test(t) && !/^-\s/.test(t);
  });
  ok(label + '：每行都是 key: value 或列表项', bad.length === 0, bad.slice(0, 2).join(' / '));
  ok(label + '：顶层有 services:', /^services:\s*$/m.test(text));
}
yamlLint(c1, '1panel-compose');
yamlLint(read('deploy/docker-compose.yml'), 'docker-compose');

console.log('\n【八】单文件 Worker 的 __core 有没有漏函数');

/*
 * worker/handler.js 是从传入的 core 对象上解构函数的，
 * 而 build-worker.mjs 里那份 __core 是手写清单。
 * 漏一个 → 打包出来的 worker.js 里那个名字就是 undefined（踩过一次：建房直接 500）。
 */
const handlerSrc = read('worker/handler.js');
const buildSrc = read('scripts/build-worker.mjs');

const destructure = handlerSrc.match(/const\s*\{([^}]+)\}\s*=\s*core\s*;/);
const needs = destructure
  ? destructure[1].split(',').map(function (s) { return s.trim().split(':').pop().trim(); }).filter(Boolean)
  : [];
ok('从 handler.js 解析出了它需要的 core 函数', needs.length >= 5, needs.join(','));

const coreBlock = buildSrc.match(/const __core = \{([\s\S]*?)\};/);
const provides = coreBlock
  ? coreBlock[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean)
  : [];
ok('从 build-worker.mjs 解析出了 __core 清单', provides.length >= 5, provides.join(','));

const missing = needs.filter(function (n) { return provides.indexOf(n) < 0; });
ok('__core 覆盖了 handler 需要的每一个函数', missing.length === 0,
  missing.length ? '漏了：' + missing.join(', ') : '');

const extra = provides.filter(function (n) { return needs.indexOf(n) < 0; });
if (extra.length) console.log('  · 提示：__core 里多给了（无害）：' + extra.join(', '));

const coreSrc = read('public/core.js');
const coreExports = [...coreSrc.matchAll(/^export\s+(?:function|const)\s+([A-Za-z_$][\w$]*)/gm)]
  .map(function (m) { return m[1]; });
const notExported = needs.filter(function (n) { return coreExports.indexOf(n) < 0; });
ok('handler 需要的函数 core.js 都导出了', notExported.length === 0,
  notExported.length ? '没导出：' + notExported.join(', ') : '');

console.log('\n【九】dist/worker.js 有没有跟源码脱节');

/*
 * dist/worker.js 是提交进仓库的构建产物（README 让用户直接复制粘贴到 Cloudflare），
 * 好处是省事，坏处是改了 core.js / handler.js 忘了重新打包就会悄悄漂移。
 * 这里做内容级校验：打包时是把这两份源码去 export 后原样拼进去的，
 * 所以"dist 里能不能找到当前源码"就等价于"有没有重新打包过"。
 * （不能用文件时间比，git checkout 会把时间全打乱。）
 */
const distSrc = read('dist/worker.js');
const stripExports = function (s) { return s.replace(/^export /gm, ''); };
if (!distSrc) {
  console.log('  · dist/worker.js 不存在（没跑过 build-worker），跳过');
} else {
  const coreNow = stripExports(read('public/core.js'));
  const handlerNow = stripExports(read('worker/handler.js'));

  ok('dist/worker.js 里有当前版本的 core.js', distSrc.indexOf(coreNow) >= 0,
    distSrc.indexOf(coreNow) >= 0 ? '' : '改过 public/core.js 但没跑 node scripts/build-worker.mjs');
  ok('dist/worker.js 里有当前版本的 worker/handler.js', distSrc.indexOf(handlerNow) >= 0,
    distSrc.indexOf(handlerNow) >= 0 ? '' : '改过 worker/handler.js 但没跑 node scripts/build-worker.mjs');

  const appNow = read('public/app.js');
  const cssNow = read('public/style.css');
  ok('dist 里打进的前端 app.js 是当前版本',
    distSrc.indexOf(JSON.stringify(appNow).slice(1, -1)) >= 0,
    '改过 public/app.js 但没重新打包');
  ok('dist 里打进的前端 style.css 是当前版本',
    distSrc.indexOf(JSON.stringify(cssNow).slice(1, -1)) >= 0,
    '改过 public/style.css 但没重新打包');

  /* public/ 下的每一个前端文件都必须打进 dist，否则线上 404 */
  const publicFiles = fs.readdirSync(path.join(ROOT, 'public'))
    .filter(function (f) { return /\.(js|css|html|json)$/.test(f); }).sort();
  const notInDist = publicFiles.filter(function (f) {
    return distSrc.indexOf(JSON.stringify(read('public/' + f)).slice(1, -1)) < 0;
  });
  ok('dist 里打进了 public/ 下每一个前端文件（' + publicFiles.join(', ') + '）',
    notInDist.length === 0,
    notInDist.length ? '少了：' + notInDist.join(', ') : '');
}

console.log('\n【十】前端文件清单：public/ 和 STATIC_FILES 对不对得上');

/*
 * build-worker.mjs 里的 STATIC_FILES 是手写清单。
 * 加了新的前端模块（比如 ui.js）忘了写进去，单文件 Worker 上就会 404 ——
 * 而 app.js 一旦 import 不到，整个页面白屏。这里静态比一遍。
 */
const pubJs = fs.readdirSync(path.join(ROOT, 'public'))
  .filter(function (f) { return /\.(js|css|html|json)$/.test(f); }).sort();
const workerSrc2 = read('scripts/build-worker.mjs');
const staticMatch = workerSrc2.match(/const STATIC_FILES = \[([^\]]+)\]/);
const staticList = staticMatch
  ? staticMatch[1].split(',').map(function (s) { return s.trim().replace(/['"]/g, ''); }).filter(Boolean).sort()
  : [];
ok('能解析出 STATIC_FILES', staticList.length >= 3, staticList.join(', '));
const missingStatic = pubJs.filter(function (f) { return staticList.indexOf(f) < 0; });
ok('STATIC_FILES 覆盖 public/ 下每个前端文件', missingStatic.length === 0,
  missingStatic.length ? '漏了：' + missingStatic.join(', ') + '（单文件 Worker 会 404）' : '');
const extraStatic = staticList.filter(function (f) { return pubJs.indexOf(f) < 0; });
ok('STATIC_FILES 里没有多余的文件', extraStatic.length === 0,
  extraStatic.length ? '多了：' + extraStatic.join(', ') : '');

console.log('\n【十一】前端模块之间的 import 都能解析');

/*
 * 这是"白屏"这类事故的根因层守卫。
 * 改了模块名、挪了文件、忘了同步某个清单，都会先在这里露出来 ——
 * 比任何部署检查都早，比用户打开页面白屏更早。
 */
const jsFiles = [];
for (const dir of ['public', 'worker', 'scripts/lib']) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) {
    if (f.endsWith('.js') || f.endsWith('.mjs')) jsFiles.push(dir + '/' + f);
  }
}
jsFiles.push('server.js', 'worker.js');

const brokenImports = [];
for (const f of jsFiles) {
  // 先去掉注释，不然会把文档里 `import ... from './xxx.js'` 的**示例**也当成真代码
  const src = read(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(function (l) { return !/^\s*(\/\/|\*)/.test(l); }).join('\n');
  for (const m of src.matchAll(/from\s+'(\.\.?\/[^']+)'/g)) {
    const target = path.normalize(path.join(path.dirname(f), m[1]));
    if (!fs.existsSync(path.join(ROOT, target))) brokenImports.push(f + ' → ' + m[1]);
  }
}
ok('所有相对 import 都能找到文件（查了 ' + jsFiles.length + ' 个文件）',
  brokenImports.length === 0,
  brokenImports.length ? '断了的：' + brokenImports.join('；') : '');

/* app.js 依赖的每个模块都要进 STATIC_FILES（否则单文件 Worker 上是个 404） */
const appNoComment = read('public/app.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(function (l) { return !/^\s*(\/\/|\*)/.test(l); }).join('\n');
const appImports = [...appNoComment.matchAll(/from\s+'\.\/([^']+)'/g)].map(function (m) { return m[1]; });
const notStatic = appImports.filter(function (m) { return staticList.indexOf(m) < 0; });
ok('app.js 依赖的模块都在 STATIC_FILES 里（' + appImports.join(', ') + '）',
  notStatic.length === 0,
  notStatic.length ? '漏了：' + notStatic.join(', ') : '');

/* 部署自检脚本里那份"文件齐不齐"的清单，不能再写死 —— 它踩过同一个坑 */
const check1panel = read('deploy/1panel-check.sh');
ok('1panel-check.sh 从 app.js 的 import 推导依赖，而不是写死清单',
  /sed -n/.test(check1panel) && /app\.js/.test(check1panel),
  '它以前写死了一份清单，加了 ui.js 没同步，自检全绿但用户打开是白屏');

/* ---------------------------------------------------------------- 版本号 */

console.log('\n【十二】版本号（public/changelog.json）');

/*
 * 版本号是 scripts/version-bump.mjs 按 public/ 的**内容指纹**自动往下编的。
 * 改了代码却没升版本 → 这里会红，提示你跑一下 bump（这就是"根据修改内容自动递增"）。
 * 注意：指纹只算 html/js/mjs/css，changelog.json 自己不算进去，
 * 否则升一次版本又会改变指纹，就永远升不完了。
 */
const cl = JSON.parse(read('public/changelog.json') || '{}');
const assetNames = fs.readdirSync(path.join(ROOT, 'public')).filter(isAssetName).sort();
const nowHash = assetHash(assetNames.map(function (n) { return [n, read('public/' + n)]; }));

ok('版本号和当前内容同步', cl.hash === nowHash && Boolean(cl.version),
  cl.hash === nowHash ? '' : '代码改过但没升版本 —— 跑一下：node scripts/version-bump.mjs "你改了什么"');
ok('版本号格式是 v主.次.月日时分.四位随机码',
  /^v\d+\.\d+\.\d{8}\.[a-z0-9]{4}$/.test(String(cl.version)), String(cl.version));
ok('更新历史里至少有一条带说明的记录',
  Array.isArray(cl.history) && cl.history.length > 0 && (cl.history[0].notes || []).length > 0,
  JSON.stringify(cl.history && cl.history[0]));
ok('更新历史不超过 30 条（不会越滚越大）',
  Array.isArray(cl.history) && cl.history.length <= 30, String((cl.history || []).length));

console.log('\n【十三】没有文件被写上 UTF-8 BOM');

/*
 * Windows 上 `Set-Content -Encoding UTF8`（PowerShell 5.1）会给文件加 BOM。
 * 后果很实在：
 *   · .sh 开头带 BOM → Linux 上 shebang 失效，报 "bad interpreter"
 *   · index.html 的 BOM 出现在 <!DOCTYPE> 之前 → 某些浏览器进怪异模式
 *   · 任何文件带 BOM 就等于"内容变了"，dist 的内容级校验会莫名其妙地红
 * 这个坑我一轮里踩过一次（4 个文件），所以留个守卫。
 */
const bomExts = ['.js', '.mjs', '.jsx', '.json', '.css', '.html', '.sh', '.bat', '.toml', '.yaml', '.yml', '.md'];
function walkAll(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'tmp', 'data'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkAll(p, out);
    else if (bomExts.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}
const allFiles = walkAll(ROOT, []);
const bomFiles = allFiles.filter(function (f) {
  const b = fs.readFileSync(f);
  return b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
}).map(function (f) { return path.relative(ROOT, f); });
ok('没有文件带 BOM（查了 ' + allFiles.length + ' 个）', bomFiles.length === 0,
  bomFiles.length ? '带 BOM 的：' + bomFiles.join(', ') + '（.sh 带 BOM 在 Linux 上跑不起来）' : '');

/* shell 脚本的 shebang 必须在第一行第一个字节 */
const shFiles = allFiles.filter(function (f) { return f.endsWith('.sh'); });
const badShebang = shFiles.filter(function (f) { return !fs.readFileSync(f, 'utf8').startsWith('#!'); });
ok('每个 .sh 的第一行都是 #!（' + shFiles.length + ' 个）', badShebang.length === 0,
  badShebang.map(function (f) { return path.relative(ROOT, f); }).join(', '));

/* 版本指纹的文件清单必须是"扫目录"扫出来的，不能写死 —— 这个坑踩过 4 次了 */
const serverSrc = read('server.js');
ok('server.js 的版本指纹是扫 public/ 目录算的（不是写死清单）',
  /readdir\(PUBLIC_DIR\)/.test(serverSrc) && !/names = \['index\.html'/.test(serverSrc),
  '写死清单的话，只改新加的文件（比如 ui.js）时"有新版本"提示不会弹');
ok('server.js 的版本指纹用的是内容（不是文件时间）',
  /assetHash\(/.test(serverSrc) && !/mtimeMs/.test(serverSrc),
  '用文件时间算的话，本机和服务器上永远对不上，没法拿来查部署');
ok('有 scripts/version.mjs 能算出同一份指纹',
  fs.existsSync(path.join(ROOT, 'scripts/version.mjs')) && /assetHash/.test(read('scripts/version.mjs')));

console.log('\n【十四】文件都在 + 文档索引');

const files = [
  'DEPLOY.md',
  'DEPLOY-1PANEL.md',
  'deploy/install.sh',
  'deploy/disk-check.sh',
  'deploy/1panel-check.sh',
  'deploy/nginx.conf',
  'deploy/Dockerfile',
  'deploy/docker-compose.yml',
  'deploy/1panel-compose.yml',
  'deploy/homework-board.service',
  'scripts/smoke.mjs',
  'scripts/screenshot.mjs',
  'README.md',
];
files.forEach(function (f) { ok('存在 ' + f, fs.existsSync(path.join(ROOT, f))); });

const readme = read('README.md');
ok('README 指向了 DEPLOY.md', readme.includes('DEPLOY.md'));
const deployDoc = read('DEPLOY.md');
ok('DEPLOY.md 覆盖了三种方案', ['一键装好', 'Docker', 'HTTPS'].every(function (k) { return deployDoc.includes(k); }));
ok('DEPLOY.md 提到了安全组放行端口', deployDoc.includes('安全组'));
ok('DEPLOY.md 提到了大陆服务器要备案', deployDoc.includes('备案'));
ok('DEPLOY.md 指向了 1Panel 专页', deployDoc.includes('DEPLOY-1PANEL.md'));

const c1doc = read('DEPLOY-1PANEL.md');
ok('1Panel 文档讲了编排这条路', c1doc.includes('编排'));
ok('1Panel 文档讲了反向代理', c1doc.includes('反向代理'));
ok('1Panel 文档讲了申请证书', c1doc.includes('SSL 证书'));
ok('1Panel 文档讲了日常更新', c1doc.includes('重启'));
ok('1Panel 文档提醒了防火墙只留必要端口', c1doc.includes('防火墙'));
ok('1Panel 文档覆盖了 upstream 那个报错', c1doc.includes('invalid port in upstream'));
ok('1Panel 文档覆盖了磁盘满的报错', c1doc.includes('no space left on device'));

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败\n');
process.exit(fail ? 1 : 0);
