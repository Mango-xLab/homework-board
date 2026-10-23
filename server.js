/*
 * 作业小站 · 服务器（零依赖，Node.js 18+）
 *
 * 启动：node server.js
 * 端口：环境变量 PORT（默认 5173）
 *
 * 两种存储，按环境变量自动选择：
 *   1) 什么都不配      → 存在本机 data/*.json 文件里（本机运行 / 有硬盘的服务器）
 *   2) 配了 Upstash    → 存在 Upstash Redis（免费版即可，适合 Render 这类
 *                        重启会清空硬盘的免费托管）
 *        UPSTASH_REDIS_REST_URL=...
 *        UPSTASH_REDIS_REST_TOKEN=...
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { defaultState, applyOps, unknownOps, normalizeState, roomCode, isValidRoom,
  normalizeRoomCode, roomCodeHint, roomNameOf, roomBrief, roomKeyFrom,
  assetHash, isAssetName, checkUpload, makeUploadId, isUploadId, fileIcon } from './public/core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '0.0.0.0';
const ALLOW_CREATE = process.env.HB_ALLOW_CREATE !== 'false';

/*
 * ★ 启动时把**已经加载进内存**的 core.js 内容指纹记下来。
 *
 * 为什么需要它：appVersion() 是**现读磁盘**算指纹的，所以
 * 「把新的 public/ 传上去了，但容器没重启」这种情况，两边算出来都是新指纹、
 * 对不上号 —— 服务器跑的还是内存里那份旧 core.js。而 op 里新加的字段
 * （比如任务的 tag / due）会被旧代码**静默忽略**：界面提示保存成功，
 * 数据却没变，看着就像"改了没成功"（真事，见第 73 轮）。
 *
 * 这里额外比一次"内存里那份"和"磁盘上那份"，不一样就说明该重启了。
 */
let coreHashAtBoot = '';
try {
  coreHashAtBoot = assetHash([['core.js', await fsp.readFile(path.join(PUBLIC_DIR, 'core.js'), 'utf8')]]);
} catch { /* 读不到就算了，不影响启动 */ }

const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const USE_UPSTASH = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

const MAX_BODY = 1024 * 512; // 512KB，一家人用绰绰有余

/*
 * ---------------------------------------------------------------- 附件
 *
 * 上传走**原始字节**，不是 multipart：
 *     POST /api/upload/<房间码>?name=<编码过的文件名>
 *     body = 文件本身的字节
 * 浏览器的 fetch 直接把 File 当 body 发就行，服务端也不用写一套 multipart 解析
 * （零依赖把 multipart 解析写对并不轻松，而且很容易被畸形边界串搞出问题）。
 *
 * 附件按房间分开存在 data/uploads/<房间码>/<id> 里，
 * 元信息（原始文件名、大小）存在 state 里，所以这里的 id 只要够随机就行。
 */
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const MAX_UPLOAD = Math.max(1, Number(process.env.HB_MAX_UPLOAD_MB) || 25) * 1024 * 1024;

function uploadDirOf(room) { return path.join(UPLOAD_DIR, room); }

/** 收原始字节。超过上限就中断并报错，不要让服务器被一个大文件拖死 */
function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        const e = new Error('文件太大了，最多 ' + Math.round(limit / 1024 / 1024) + 'MB');
        e.tooBig = true;
        reject(e);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* --------------------------------------------------------------- 存储层 */

const fileStore = {
  async read(room) {
    const file = path.join(DATA_DIR, room + '.json');
    try {
      const txt = await fsp.readFile(file, 'utf8');
      return JSON.parse(txt);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  },
  async write(room, state) {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, room + '.json');
    const tmp = file + '.' + process.pid + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(state), 'utf8');
    await fsp.rename(tmp, file);
  },
  async exists(room) {
    return fs.existsSync(path.join(DATA_DIR, room + '.json'));
  },
  /** 列出所有房间（只认文件名，房间名要读文件才知道） */
  async list() {
    try {
      const names = await fsp.readdir(DATA_DIR);
      return names
        .filter(function (n) { return n.endsWith('.json') && !n.startsWith('_'); })
        .map(function (n) { return n.slice(0, -5); })
        .filter(isValidRoom);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  },
  async index() { /* 文件存储靠 readdir，不需要索引 */ },
  /** 删掉一个房间的数据文件 */
  async remove(room) {
    await fsp.unlink(path.join(DATA_DIR, room + '.json'));
  },
};

async function upstashCommand(command, key, value) {
  const url = UPSTASH_URL + '/' + command + '/' + encodeURIComponent(key);
  const init = { headers: { Authorization: 'Bearer ' + UPSTASH_TOKEN } };
  if (value !== undefined) {
    init.method = 'POST';
    init.body = value;
    init.headers['Content-Type'] = 'text/plain';
  }
  const res = await fetch(url, init);
  if (!res.ok) throw new Error('Upstash ' + command + ' 失败：HTTP ' + res.status);
  return res.json();
}

const redisStore = {
  key(room) { return 'hb:room:' + room; },
  async read(room) {
    const j = await upstashCommand('get', this.key(room));
    if (!j || j.result == null) return null;
    try { return JSON.parse(j.result); } catch { return null; }
  },
  async write(room, state) {
    await upstashCommand('set', this.key(room), JSON.stringify(state));
  },
  async exists(room) {
    const j = await upstashCommand('exists', this.key(room));
    return Boolean(j && j.result);
  },
  /** Upstash 这边没有目录可读，靠一个集合索引房间码 */
  async list() {
    const j = await upstashCommand('smembers', 'hb:rooms');
    const arr = Array.isArray(j && j.result) ? j.result : [];
    return arr.map(function (c) { return String(c).toUpperCase(); }).filter(isValidRoom);
  },
  /** 新建房间时把码记进索引 */
  async index(room) {
    await upstashCommand('sadd', 'hb:rooms', room);
  },
  /** 删房间：数据和索引一起清 */
  async remove(room) {
    await upstashCommand('del', this.key(room));
    await upstashCommand('srem', 'hb:rooms', room);
  },
};

const store = USE_UPSTASH ? redisStore : fileStore;

/* ---------------------------------------------------------- 房间管理口令 */

/*
 * 「列出所有房间」等于把每个家的钥匙摆在门口 —— 谁知道域名谁就能看到
 * 别人家孩子的名字和作业。所以这个接口必须带口令。
 *
 * 口令从哪来：
 *   1. 环境变量 HB_ADMIN_KEY（部署时设，容器/K8s 场景最省事）
 *   2. data/_admin.json —— 首次使用时由家长在网页上自己设，**只存 scrypt 哈希**
 *
 * 为什么是哈希不是「加密」：可逆加密的密钥也得放在这台服务器上，等于把钥匙
 * 和锁放一起；口令只需要"验证对不对"，不需要还原，所以单向哈希才是对的。
 * 落盘结构：
 *   { v:2, algo:'scrypt', N, r, p, salt, hash, createdAt, updatedAt }
 */
const ADMIN_FILE = path.join(DATA_DIR, '_admin.json');
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const ADMIN_MIN_LEN = 6;

/** ADMIN.configured / source('env'|'file') / salt / hash / envKey */
let ADMIN = { configured: false, source: '', salt: '', hash: '', envKey: '' };

function scryptHash(key, salt) {
  return new Promise(function (resolve, reject) {
    crypto.scrypt(String(key), salt, SCRYPT.keylen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p },
      function (err, dk) { return err ? reject(err) : resolve(dk); });
  });
}

/** 定长比较，别让响应时间泄露"错了几个字符" */
function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  try { return crypto.timingSafeEqual(x, y); } catch (e) { return false; }
}

async function writeAdminFile(key) {
  const salt = crypto.randomBytes(16).toString('hex');
  const dk = await scryptHash(key, salt);
  const rec = {
    v: 2,
    algo: 'scrypt',
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p,
    salt: salt,
    hash: dk.toString('hex'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await fsp.mkdir(DATA_DIR, { recursive: true });
  // 0600：只有跑服务的那个用户能读
  await fsp.writeFile(ADMIN_FILE, JSON.stringify(rec, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { await fsp.chmod(ADMIN_FILE, 0o600); } catch (e) { /* Windows 上没这回事 */ }
  ADMIN = { configured: true, source: 'file', salt: salt, hash: rec.hash, envKey: '' };
  return rec;
}

async function loadAdmin() {
  const envKey = String(process.env.HB_ADMIN_KEY || '').trim();
  if (envKey) {
    ADMIN = { configured: true, source: 'env', salt: '', hash: '', envKey: envKey };
    return;
  }
  try {
    const j = JSON.parse(await fsp.readFile(ADMIN_FILE, 'utf8'));
    if (j && j.hash && j.salt) {
      ADMIN = { configured: true, source: 'file', salt: String(j.salt), hash: String(j.hash), envKey: '' };
      return;
    }
    // 老版本存的是明文 {key:"..."}，读到就顺手升级成哈希
    if (j && j.key) {
      await writeAdminFile(String(j.key));
      console.log('  🔐 检测到明文口令，已升级为 scrypt 哈希存储');
      return;
    }
  } catch (e) { /* 没配过，等首次设置 */ }
  ADMIN = { configured: false, source: '', salt: '', hash: '', envKey: '' };
}

/** 校验用户给的口令 */
async function checkAdminKey(given) {
  if (!ADMIN.configured) return false;
  const v = String(given == null ? '' : given).trim();
  if (!v) return false;
  if (ADMIN.source === 'env') return sameSecret(v, ADMIN.envKey);
  const dk = await scryptHash(v, ADMIN.salt);
  const want = Buffer.from(ADMIN.hash, 'hex');
  if (dk.length !== want.length) return false;
  try { return crypto.timingSafeEqual(dk, want); } catch (e) { return false; }
}

/** 请求里带的口令对不对（?key= 或 x-hb-key 头；取值逻辑跟 Worker 版共用） */
async function keyOK(req, url) {
  return checkAdminKey(roomKeyFrom(req, url));
}

/* ---------------------------------------------------------------- 工具 */

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('请求太大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const txt = Buffer.concat(chunks).toString('utf8');
      if (!txt) return resolve({});
      try { resolve(JSON.parse(txt)); } catch { reject(new Error('JSON 格式不对')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('403'); return; }
  try {
    const stat = await fsp.stat(full);
    if (stat.isDirectory()) { res.writeHead(403); res.end('403'); return; }
    const ext = path.extname(full).toLowerCase();
    // 页面和脚本每次都要问一下服务器，免得改了没生效
    const revalidate = ['.html', '.js', '.mjs', '.css'];
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': revalidate.indexOf(ext) >= 0 ? 'no-cache' : 'public, max-age=600',
      'Content-Length': stat.size,
    });
    fs.createReadStream(full).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 找不到这个文件');
  }
}

/* ------------------------------------------------------------ API 路由 */

/**
 * 前端文件的"版本号"：把 public/ 下**每个前端文件的内容**揉成一个短指纹。
 *
 * 两个用途：
 *   1. 页面加载时记下来，之后每 8 秒问一次；不一样就弹「有新版本」提示
 *   2. 跟本机 `node scripts/version.mjs` 的输出对一下，就知道服务器上跑的
 *      是不是最新代码 —— 指纹只跟**内容**有关，跟文件时间无关，两边可以直接比
 *
 * 文件清单是**扫目录**扫出来的，不是写死的。
 * （这里写死过一份 ['index.html','style.css','app.js','core.js']，
 *   后来加了 public/ui.js 没同步 → 只改 ui.js 时"有新版本"提示不会弹。）
 */
let versionCache = { v: '', files: [], at: 0 };
const VERSION_TTL_MS = 2000;

async function appVersion() {
  if (Date.now() - versionCache.at < VERSION_TTL_MS) return versionCache;
  let names = [];
  try {
    names = (await fsp.readdir(PUBLIC_DIR)).filter(isAssetName).sort();
  } catch { names = []; }
  const pairs = [];
  for (const n of names) {
    try {
      pairs.push([n, await fsp.readFile(path.join(PUBLIC_DIR, n), 'utf8')]);
    } catch { /* 读不到就跳过 */ }
  }
  /*
   * 磁盘上的 core.js 和启动时加载的那份不一样 → 服务端跑的是旧代码，该重启了。
   * 前端看到 staleCode 会直接提示，免得像第 73 轮那样"改了没成功"却查不出原因。
   */
  let staleCode = false;
  try {
    const onDisk = assetHash([['core.js',
      await fsp.readFile(path.join(PUBLIC_DIR, 'core.js'), 'utf8')]]);
    staleCode = Boolean(coreHashAtBoot) && onDisk !== coreHashAtBoot;
  } catch { /* 读不到就不判断 */ }
  versionCache = { v: assetHash(pairs), files: names, staleCode: staleCode, at: Date.now() };
  return versionCache;
}

async function loadState(room) {
  const raw = await store.read(room);
  if (!raw) return null;
  return normalizeState(raw);
}

async function handleApi(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api','state','ABCDEF',...]

  // GET /api/health
  if (seg[1] === 'health') {
    return sendJSON(res, 200, {
      ok: true,
      storage: USE_UPSTASH ? 'upstash-redis' : 'local-file',
      // 前端据此显示"最大能传多大"，也用来判断这个部署到底支不支持附件
      uploads: USE_UPSTASH ? 0 : MAX_UPLOAD,
      maxUploadMB: USE_UPSTASH ? 0 : Math.round(MAX_UPLOAD / 1024 / 1024),
      attachments: !USE_UPSTASH,
      time: new Date().toISOString(),
    });
  }

  // GET /api/version → 前端文件版本，用来判断浏览器里那份是不是旧的
  // files 是给你排查用的：对一下就知道服务器上到底有哪些前端文件
  if (seg[1] === 'version') {
    const info = await appVersion();
    return sendJSON(res, 200, {
      v: info.v, files: info.files,
      // true = 磁盘上的 core.js 已经换了，但服务进程还是启动时那份旧代码 → 得重启
      staleCode: info.staleCode,
    });
  }

  // GET /api/admin/state → 口令配了没有（前端靠这个决定是"设置"还是"输入"）
  if (seg[1] === 'admin' && seg[2] === 'state' && req.method === 'GET') {
    return sendJSON(res, 200, {
      configured: ADMIN.configured,
      source: ADMIN.source,                 // 'env' | 'file' | ''
      canSetup: !ADMIN.configured,          // 环境变量已经给了就不能再设
      minLength: ADMIN_MIN_LEN,
      storage: USE_UPSTASH ? 'upstash-redis' : 'local-file',
    });
  }

  // POST /api/admin/setup → 首次设置口令（只在没配过的时候能用）
  if (seg[1] === 'admin' && seg[2] === 'setup' && req.method === 'POST') {
    if (ADMIN.configured) {
      return sendJSON(res, 409, { error: '口令已经设过了，想换请用「修改口令」' });
    }
    const body = await readBody(req);
    const key = String(body.key == null ? '' : body.key).trim();
    if (key.length < ADMIN_MIN_LEN) {
      return sendJSON(res, 400, { error: '口令至少 ' + ADMIN_MIN_LEN + ' 位' });
    }
    if (key.length > 128) return sendJSON(res, 400, { error: '口令太长了（最多 128 位）' });
    await writeAdminFile(key);
    console.log('  🔐 房间管理口令已设置（scrypt 哈希存到 ' + ADMIN_FILE + '）');
    return sendJSON(res, 200, { ok: true, configured: true, source: 'file' });
  }

  // POST /api/admin/verify → 光验证不办事，前端用来给个即时反馈
  if (seg[1] === 'admin' && seg[2] === 'verify' && req.method === 'POST') {
    const body = await readBody(req);
    const ok = await checkAdminKey(body.key);
    return sendJSON(res, ok ? 200 : 401, { ok: ok });
  }

  // POST /api/admin/change → 改口令（要带旧的）
  if (seg[1] === 'admin' && seg[2] === 'change' && req.method === 'POST') {
    if (ADMIN.source === 'env') {
      return sendJSON(res, 400, { error: '口令来自环境变量 HB_ADMIN_KEY，改它得改部署配置' });
    }
    const body = await readBody(req);
    if (!(await checkAdminKey(body.key))) return sendJSON(res, 401, { error: '原口令不对' });
    const next = String(body.newKey == null ? '' : body.newKey).trim();
    if (next.length < ADMIN_MIN_LEN) {
      return sendJSON(res, 400, { error: '新口令至少 ' + ADMIN_MIN_LEN + ' 位' });
    }
    await writeAdminFile(next);
    return sendJSON(res, 200, { ok: true, source: 'file' });
  }

  // POST /api/admin/clear → 不要口令了（要带当前的；以后删房间只靠"打一遍房间码"）
  if (seg[1] === 'admin' && seg[2] === 'clear' && req.method === 'POST') {
    if (ADMIN.source === 'env') {
      return sendJSON(res, 400, { error: '口令来自环境变量 HB_ADMIN_KEY，得改部署配置才能去掉' });
    }
    if (!ADMIN.configured) return sendJSON(res, 200, { ok: true, configured: false });
    const body = await readBody(req);
    if (!(await checkAdminKey(body.key))) return sendJSON(res, 401, { error: '口令不对' });
    try { await fsp.unlink(ADMIN_FILE); } catch (e) { /* 本来就没有就算了 */ }
    ADMIN = { configured: false, source: '', salt: '', hash: '', envKey: '' };
    console.log('  🔓 房间管理口令已取消（删房间改为只靠核对房间码）');
    return sendJSON(res, 200, { ok: true, configured: false });
  }

  // ------------------------------------------------------------ 附件
  /*
   * POST /api/upload/<房间码>?name=xxx   body = 文件原始字节
   * 返回 { file: { id, name, size, mime, kind, url } }
   */
  if (seg[1] === 'upload' && seg[2] && req.method === 'POST') {
    const room = normalizeRoomCode(seg[2]);
    if (!isValidRoom(room)) return sendJSON(res, 400, { error: '房间码格式不对' });
    const name = String(url.searchParams.get('name') || '').slice(0, 120);
    const info = checkUpload(name, req.headers['content-type']);
    if (!info.ok) return sendJSON(res, 400, { error: info.reason });

    let buf;
    try {
      buf = await readRawBody(req, MAX_UPLOAD);
    } catch (err) {
      return sendJSON(res, 413, { error: err && err.message ? err.message : '文件太大' });
    }
    if (!buf || !buf.length) return sendJSON(res, 400, { error: '收到的是空文件' });

    const id = makeUploadId(info.ext);
    const dir = uploadDirOf(room);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, id), buf);

    const file = {
      id: id,
      name: name || id,
      size: buf.length,
      mime: info.mime,
      kind: info.kind,
      at: Date.now(),
    };
    console.log('  📎 ' + room + ' 收到附件：' + file.name + '（' + buf.length + ' 字节）');
    return sendJSON(res, 200, { ok: true, file: file, url: '/api/file/' + room + '/' + id });
  }

  /*
   * GET /api/file/<房间码>/<id>  → 把附件发回去
   *
   * 支持 Range：手机上看视频时浏览器会先问一段（尤其想拖进度条的时候），
   * 不支持 Range 的话 Safari 经常干脆不播。
   */
  if (seg[1] === 'file' && seg[2] && seg[3] && (req.method === 'GET' || req.method === 'HEAD')) {
    const room = normalizeRoomCode(seg[2]);
    const id = String(seg[3]);
    if (!isValidRoom(room) || !isUploadId(id)) { res.writeHead(400); res.end('400'); return; }
    const full = path.join(uploadDirOf(room), id);
    let stat;
    try { stat = await fsp.stat(full); } catch (e) { res.writeHead(404); res.end('404'); return; }
    if (!stat.isFile()) { res.writeHead(404); res.end('404'); return; }

    const info = checkUpload(id, '');
    const type = info.ok ? info.mime : 'application/octet-stream';
    const head = {
      'Content-Type': type,
      // 附件内容不会变（id 是一次性的），可以放心让浏览器缓存
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    if (range) {
      let start = range[1] === '' ? null : Number(range[1]);
      let end = range[2] === '' ? null : Number(range[2]);
      if (start === null && end === null) { /* 畸形 Range，当整份发 */ }
      else {
        if (start === null) { start = Math.max(0, stat.size - end); end = stat.size - 1; }
        if (end === null || end >= stat.size) end = stat.size - 1;
        if (start > end || start >= stat.size) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size });
          res.end();
          return;
        }
        res.writeHead(206, Object.assign({}, head, {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
          'Content-Length': end - start + 1,
        }));
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(full, { start: start, end: end }).pipe(res);
      }
    }
    res.writeHead(200, Object.assign({}, head, { 'Content-Length': stat.size }));
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(full).pipe(res);
  }

  // GET /api/rooms → 所有房间的清单
  // 使用场景是「一台服务器 = 一个家庭 = 几个孩子的房间」，房间之间不需要权限隔离，
  // 所以列表直接开放。真正危险的是删除，那个才要口令。
  if (seg[1] === 'rooms' && req.method === 'GET') {
    const codes = await store.list();
    const rooms = [];
    for (const code of codes) {
      const st = await loadState(code);
      if (st) rooms.push(roomBrief(code, st));
    }
    rooms.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return sendJSON(res, 200, {
      rooms: rooms,
      storage: USE_UPSTASH ? 'upstash-redis' : 'local-file',
      needsKeyToDelete: ADMIN.configured,
    });
  }

  // POST /api/room/:code/rename → 改某个房间的房间名 / 孩子名字（列表里点 ✎）
  // 同一个家庭内部的日常管理，也不要口令
  if (seg[1] === 'room' && seg[2] && seg[3] === 'rename' && req.method === 'POST') {
    const code = normalizeRoomCode(seg[2]);
    if (!isValidRoom(code)) return sendJSON(res, 400, { error: '房间码格式不对' });
    const st = await loadState(code);
    if (!st) return sendJSON(res, 404, { error: '没有这个房间', room: code });
    const body = await readBody(req);
    if ('name' in body) st.settings.roomName = String(body.name || '').trim().slice(0, 24);
    if ('childName' in body) {
      st.settings.childName = String(body.childName || '').trim().slice(0, 12) || '宝贝';
    }
    st.updatedAt = Date.now();
    await store.write(code, st);
    return sendJSON(res, 200, { ok: true, room: roomBrief(code, st) });
  }

  // DELETE /api/room/:code → 删掉一个房间（连同它的全部数据，不可恢复）
  // 唯一一个危险操作：设了口令就要口令；没设就靠前端「把房间码打一遍」兜底。
  if (seg[1] === 'room' && seg[2] && req.method === 'DELETE' && seg[2] !== 'check') {
    if (ADMIN.configured && !(await keyOK(req, url))) {
      return sendJSON(res, 401, { error: '房间管理口令不对' });
    }
    const code = normalizeRoomCode(seg[2]);
    if (!isValidRoom(code)) return sendJSON(res, 400, { error: '房间码格式不对' });
    if (!(await store.exists(code))) return sendJSON(res, 404, { error: '没有这个房间', room: code });
    // 至少要留一个房间，别把自己删到没地方去
    const all = await store.list();
    if (all.length <= 1) return sendJSON(res, 409, { error: '至少要保留一个房间' });
    await store.remove(code);
    // 附件也要一起清掉，不然磁盘上会留一堆没人引用的文件
    try { await fsp.rm(uploadDirOf(code), { recursive: true, force: true }); }
    catch (e) { console.warn('  ⚠️ 附件目录没删掉：' + (e && e.message)); }
    console.log('  🗑  房间已删除：' + code);
    return sendJSON(res, 200, { ok: true, room: code });
  }

  // GET /api/room/check?code=xxx → 这个房间码能不能用（新建前先问一句）
  if (seg[1] === 'room' && seg[2] === 'check' && req.method === 'GET') {
    const want = normalizeRoomCode(url.searchParams.get('code'));
    const hint = roomCodeHint(want);
    if (!hint.ok) return sendJSON(res, 200, { code: want, ok: false, reason: hint.msg });
    const taken = await store.exists(want);
    return sendJSON(res, 200, {
      code: want, ok: !taken,
      reason: taken ? '这个房间码已经有人用了' : '',
      warn: hint.warn,
    });
  }

  // POST /api/room  → 新建一个房间（可以指定房间码和房间名）
  if (seg[1] === 'room' && req.method === 'POST') {
    if (!ALLOW_CREATE) return sendJSON(res, 403, { error: '此服务器已关闭新建房间' });
    const body = await readBody(req);
    const rawCode = String(body.code == null ? '' : body.code).trim();
    const want = normalizeRoomCode(rawCode);
    let code = '';

    // 填了码但里面一个字母数字都没有（比如全是中文/符号）→ 明确报错，
    // 别悄悄给人家换成一个随机码
    if (rawCode && !want) {
      return sendJSON(res, 400, { error: '房间码只能填字母和数字（3～20 位）' });
    }

    if (want) {
      const hint = roomCodeHint(want);
      if (!hint.ok) return sendJSON(res, 400, { error: '房间码不行：' + hint.msg });
      if (await store.exists(want)) return sendJSON(res, 409, { error: '房间码「' + want + '」已经有人用了，换一个' });
      code = want;
    } else {
      for (let i = 0; i < 12; i++) {
        const c = roomCode();
        if (!(await store.exists(c))) { code = c; break; }
      }
      if (!code) return sendJSON(res, 500, { error: '试了好几次都没生成出不重复的房间码，稍后再试' });
    }

    const state = defaultState();
    if (body.name) state.settings.roomName = String(body.name).trim().slice(0, 24);
    if (body.childName) state.settings.childName = String(body.childName).trim().slice(0, 12) || '宝贝';
    await store.write(code, state);
    await store.index(code);
    return sendJSON(res, 201, { room: code, state: state });
  }

  // /api/state/:room 以及 /api/state/:room/op
  if (seg[1] === 'state' && seg[2]) {
    const room = String(seg[2]).toUpperCase();
    if (!isValidRoom(room)) return sendJSON(res, 400, { error: '房间码格式不对' });

    if (req.method === 'GET' && !seg[3]) {
      const state = await loadState(room);
      if (!state) return sendJSON(res, 404, { error: '没有这个房间', room });
      return sendJSON(res, 200, { room, state });
    }

    if (req.method === 'POST' && seg[3] === 'op') {
      const body = await readBody(req);
      const ops = Array.isArray(body.ops) ? body.ops : [];
      if (!ops.length) return sendJSON(res, 400, { error: '没有要执行的操作' });

      const state = await loadState(room);
      if (!state) return sendJSON(res, 404, { error: '没有这个房间', room });

      // 认不出来的操作名 → 明确报错，不要静默吞掉
      // （静默吞掉会让"服务器还在跑旧代码"表现成"点了没反应、删了又回来"）
      const unknown = unknownOps(ops);
      if (unknown.length) {
        return sendJSON(res, 400, {
          error: '服务器还是旧版本，不认识这些操作：' + unknown.join('、') + '。请重启一下服务再试。',
          unknown,
          staleServer: true,
        });
      }

      applyOps(state, ops);
      state.updatedAt = Date.now();
      await store.write(room, state);
      return sendJSON(res, 200, { room, state });
    }

    // 家长端"整份覆盖"（导入备份时用）
    if (req.method === 'PUT' && !seg[3]) {
      const body = await readBody(req);
      const incoming = normalizeState(body.state);
      incoming.rev = Number(incoming.rev) || 0;
      incoming.updatedAt = Date.now();
      await store.write(room, incoming);
      return sendJSON(res, 200, { room, state: incoming });
    }
  }

  return sendJSON(res, 404, { error: '没有这个接口' });
}

/* ------------------------------------------------------------ HTTP 服务 */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error('[error]', req.method, url.pathname, err && err.message);
    if (!res.headersSent) sendJSON(res, 500, { error: '服务器开小差了：' + (err && err.message) });
    else res.end();
  }
});

server.listen(PORT, HOST, async () => {
  await loadAdmin();
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log('');
  console.log('  📚 作业小站已经启动');
  console.log('  ------------------------------------------');
  console.log('  打开网址：  http://' + shown + ':' + PORT);
  console.log('  存储方式：  ' + (USE_UPSTASH ? 'Upstash Redis（云端）' : '本地文件 ' + DATA_DIR));
  console.log('  停止服务：  Ctrl + C');
  console.log('');
  if (!ADMIN.configured) {
    console.log('  🔑 房间管理口令：未设置（可选）');
    console.log('     它只用在删除房间时确认一下，浏览列表 / 切换 / 改名都不需要。');
    console.log('     想设：家长 → 设置 → 🏠 房间 → 标题栏的「🔐 口令」；');
    console.log('     设完只存 scrypt 哈希在 ' + ADMIN_FILE + '（里面没有明文）。');
  } else if (ADMIN.source === 'env') {
    console.log('  🔑 房间管理口令：来自环境变量 HB_ADMIN_KEY（删除房间时要用）');
  } else {
    console.log('  🔑 房间管理口令：已设置（scrypt 哈希存在 ' + ADMIN_FILE + '，删除房间时要用）');
    console.log('     忘了的话删掉这个文件重启，就退回"只核对房间码"了。');
  }
  console.log('');
});
