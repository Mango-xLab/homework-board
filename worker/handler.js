/*
 * 作业小站 · Cloudflare Worker 的接口层
 *
 * 这个文件被两种部署方式共用：
 *   1) wrangler deploy  —— worker.js 里 import 它，静态文件交给 [assets]
 *   2) 单文件粘贴版      —— scripts/build-worker.mjs 把 core.js 内联进来，
 *                          静态文件以字符串形式一起打进一个 worker.js
 * 所以它不直接 import core.js，而是由调用方把 core 传进来。
 */

export function makeWorker(core, serveStatic, appVersion) {
  const { defaultState, applyOps, unknownOps, normalizeState, roomCode, isValidRoom,
    normalizeRoomCode, roomCodeHint, roomNameOf, roomBrief, roomKeyFrom } = core;

  // 没绑 KV 的时候先兜个底，方便第一次打开就能看到界面（重启会丢）
  const memory = new Map();

  function cors() {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    };
  }

  function json(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors()),
    });
  }

  async function readJson(request) {
    const txt = await request.text();
    if (!txt) return {};
    try { return JSON.parse(txt); } catch { throw new Error('JSON 格式不对'); }
  }

  const kvKey = function (room) { return 'hb:room:' + room; };

  async function load(env, room) {
    if (env && env.HB_KV) {
      const raw = await env.HB_KV.get(kvKey(room), 'json');
      return raw ? normalizeState(raw) : null;
    }
    const raw = memory.get(room);
    return raw ? normalizeState(raw) : null;
  }

  async function save(env, room, state) {
    if (env && env.HB_KV) {
      await env.HB_KV.put(kvKey(room), JSON.stringify(state));
      return;
    }
    memory.set(room, JSON.parse(JSON.stringify(state)));
  }

  async function exists(env, room) {
    if (env && env.HB_KV) return (await env.HB_KV.get(kvKey(room))) !== null;
    return memory.has(room);
  }

  /*
   * KV 没有目录可读，所以房间码要另存一份索引。
   * 用一个固定的 key 存数组（量级是「一家人几个房间」，够用）。
   */
  const INDEX_KEY = 'hb:rooms';

  async function listRooms(env) {
    if (env && env.HB_KV) {
      const arr = await env.HB_KV.get(INDEX_KEY, 'json');
      return Array.isArray(arr) ? arr.filter(isValidRoom) : [];
    }
    return Array.from(memory.keys()).filter(isValidRoom);
  }

  async function indexRoom(env, room) {
    if (!(env && env.HB_KV)) return;
    const arr = await listRooms(env);
    if (arr.indexOf(room) >= 0) return;
    arr.push(room);
    await env.HB_KV.put(INDEX_KEY, JSON.stringify(arr));
  }

  async function removeRoom(env, room) {
    if (env && env.HB_KV) {
      await env.HB_KV.delete(kvKey(room));
      // 附件也一起删，别在 KV 里留一堆没人引用的 base64
      const files = await indexOfUploads(env, room);
      for (const id of files) await env.HB_KV.delete(uploadKey(room, id));
      await env.HB_KV.delete(uploadIndexKey(room));
      const arr = (await listRooms(env)).filter(function (c) { return c !== room; });
      await env.HB_KV.put(INDEX_KEY, JSON.stringify(arr));
      return;
    }
    memory.delete(room);
  }

  /** 房间管理口令：Worker 版只能靠环境变量（KV 里存口令没什么意义） */
  function adminKeyOf(env) { return String((env && env.HB_ADMIN_KEY) || '').trim(); }

  /*
   * ---------------------------------------------------------------- 附件
   *
   * 和 server.js 同一套接口（POST /api/upload/<房间>?name=xxx，body 是原始字节），
   * 区别只在存哪儿：Worker 没有磁盘，只能把 base64 塞进 KV。
   * 因此上限小很多（见 MAX_UPLOAD），前端的 /api/health 会拿到这个数字。
   */
  const MAX_UPLOAD = 8 * 1024 * 1024;
  const uploadKey = function (room, id) { return 'hb:file:' + room + ':' + id; };
  const uploadIndexKey = function (room) { return 'hb:files:' + room; };

  async function indexOfUploads(env, room) {
    if (!(env && env.HB_KV)) return [];
    try {
      const arr = await env.HB_KV.get(uploadIndexKey(room), 'json');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function keyOK(request, env, url) {
    const mine = adminKeyOf(env);
    if (!mine) return false;
    const given = roomKeyFrom(request, url).trim();   // 取值逻辑跟 server.js 共用
    if (given.length !== mine.length) return false;
    // 常量时间比较
    let diff = 0;
    for (let i = 0; i < mine.length; i++) diff |= given.charCodeAt(i) ^ mine.charCodeAt(i);
    return diff === 0;
  }

  async function handleApi(request, env, url) {
    const seg = url.pathname.split('/').filter(Boolean);

    if (seg[1] === 'health') {
      return json({
        ok: true,
        storage: (env && env.HB_KV) ? 'cloudflare-kv' : 'memory(临时，请绑定 KV)',
        /*
         * 附件：Worker 版存在 KV 里（base64），所以上限比自建服务器小很多 ——
         * KV 单个值最大 25MB，base64 还要涨三分之一，再加上读写次数有限，
         * 传大视频不现实。照片够用。
         */
        uploads: (env && env.HB_KV) ? MAX_UPLOAD : 0,
        maxUploadMB: (env && env.HB_KV) ? Math.round(MAX_UPLOAD / 1024 / 1024) : 0,
        attachments: Boolean(env && env.HB_KV),
        time: new Date().toISOString(),
      });
    }

    // 前端文件版本：单文件版在打包时写死一个时间戳；wrangler 版给 null（不做检查）
    if (seg[1] === 'version') {
      return json({ v: appVersion || null });
    }

    // 口令配置状态。Worker 没有可写磁盘，所以 canSetup 永远是 false：
    // 口令只能在 Cloudflare 的环境变量里配。
    if (seg[1] === 'admin' && seg[2] === 'state' && request.method === 'GET') {
      const mine = adminKeyOf(env);
      return json({
        configured: Boolean(mine),
        source: mine ? 'env' : '',
        canSetup: false,
        minLength: 6,
        storage: (env && env.HB_KV) ? 'cloudflare-kv' : 'memory(临时，请绑定 KV)',
      });
    }

    // 验证口令：跟 server.js 一样能验证（这个不需要可写磁盘）
    if (seg[1] === 'admin' && seg[2] === 'verify' && request.method === 'POST') {
      const body = await readJson(request);
      const mine = adminKeyOf(env);
      const given = String(body.key == null ? '' : body.key).trim();
      let diff = mine.length === given.length ? 0 : 1;
      for (let i = 0; i < mine.length && i < given.length; i++) {
        diff |= given.charCodeAt(i) ^ mine.charCodeAt(i);
      }
      const okKey = Boolean(mine) && diff === 0;
      return json({ ok: okKey }, okKey ? 200 : 401);
    }

    // 下面三个在 Worker 上做不了（没有可写磁盘），
    // 明确回一句话，别让前端拿到一个没头没尾的 404
    if (seg[1] === 'admin' && ['setup', 'change', 'clear'].indexOf(seg[2]) >= 0 && request.method === 'POST') {
      return json({
        error: 'Cloudflare Worker 版没有可写磁盘，房间管理口令只能在环境变量 HB_ADMIN_KEY 里配：' +
          '去 Cloudflare 控制台改这个变量再重新部署。',
      }, 501);
    }

    // ------------------------------------------------------------ 附件
    // POST /api/upload/<房间>?name=xxx   body = 文件原始字节
    if (seg[1] === 'upload' && seg[2] && request.method === 'POST') {
      const room = normalizeRoomCode(seg[2]);
      if (!isValidRoom(room)) return json({ error: '房间码格式不对' }, 400);
      if (!(env && env.HB_KV)) {
        return json({ error: '这个部署没有绑定 KV，存不了附件' }, 501);
      }
      const name = String(url.searchParams.get('name') || '').slice(0, 120);
      const info = checkUpload(name, request.headers.get('content-type'));
      if (!info.ok) return json({ error: info.reason }, 400);

      const buf = await request.arrayBuffer();
      if (!buf || !buf.byteLength) return json({ error: '收到的是空文件' }, 400);
      if (buf.byteLength > MAX_UPLOAD) {
        return json({ error: '文件太大了，这个部署最多 ' +
          Math.round(MAX_UPLOAD / 1024 / 1024) + 'MB' }, 413);
      }

      const id = makeUploadId(info.ext);
      // KV 存不了二进制，转成 base64
      let b64 = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      b64 = btoa(b64);
      const rec = { name: name || id, size: bytes.length, mime: info.mime, kind: info.kind, at: Date.now() };
      await env.HB_KV.put(uploadKey(room, id), b64);
      const idx = await indexOfUploads(env, room);
      idx.push(id);
      await env.HB_KV.put(uploadIndexKey(room), JSON.stringify(idx));

      return json({ ok: true, file: Object.assign({ id: id }, rec),
        url: '/api/file/' + room + '/' + id });
    }

    // GET /api/file/<房间>/<id>
    if (seg[1] === 'file' && seg[2] && seg[3] && (request.method === 'GET' || request.method === 'HEAD')) {
      const room = normalizeRoomCode(seg[2]);
      const id = String(seg[3]);
      if (!isValidRoom(room) || !isUploadId(id)) return new Response('400', { status: 400 });
      if (!(env && env.HB_KV)) return new Response('404', { status: 404 });
      const b64 = await env.HB_KV.get(uploadKey(room, id));
      if (b64 === null || b64 === undefined) return new Response('404', { status: 404 });
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const info = checkUpload(id, '');
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': info.ok ? info.mime : 'application/octet-stream',
          'Content-Length': String(bytes.length),
          'Cache-Control': 'private, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 所有房间的清单：一个家庭几个房间，直接开放
    if (seg[1] === 'rooms' && request.method === 'GET') {
      const codes = await listRooms(env);
      const rooms = [];
      for (const code of codes) {
        const st = await load(env, code);
        if (st) rooms.push(roomBrief(code, st));
      }
      rooms.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      return json({
        rooms: rooms,
        storage: (env && env.HB_KV) ? 'cloudflare-kv' : 'memory(临时，请绑定 KV)',
        needsKeyToDelete: Boolean(adminKeyOf(env)),
      });
    }

    // 改某个房间的房间名 / 孩子名字（家庭内部日常管理，不要口令）
    if (seg[1] === 'room' && seg[2] && seg[3] === 'rename' && request.method === 'POST') {
      const code = normalizeRoomCode(seg[2]);
      if (!isValidRoom(code)) return json({ error: '房间码格式不对' }, 400);
      const st = await load(env, code);
      if (!st) return json({ error: '没有这个房间', room: code }, 404);
      const body = await readJson(request);
      if ('name' in body) st.settings.roomName = String(body.name || '').trim().slice(0, 24);
      if ('childName' in body) {
        st.settings.childName = String(body.childName || '').trim().slice(0, 12) || '宝贝';
      }
      st.updatedAt = Date.now();
      await save(env, code, st);
      return json({ ok: true, room: roomBrief(code, st) });
    }

    // 删掉一个房间：设了口令就要口令，没设就靠前端核对房间码兜底
    if (seg[1] === 'room' && seg[2] && request.method === 'DELETE' && seg[2] !== 'check') {
      if (adminKeyOf(env) && !keyOK(request, env, url)) {
        return json({ error: '房间管理口令不对' }, 401);
      }
      const code = normalizeRoomCode(seg[2]);
      if (!isValidRoom(code)) return json({ error: '房间码格式不对' }, 400);
      if (!(await exists(env, code))) return json({ error: '没有这个房间', room: code }, 404);
      // 至少要留一个房间
      if ((await listRooms(env)).length <= 1) return json({ error: '至少要保留一个房间' }, 409);
      await removeRoom(env, code);
      return json({ ok: true, room: code });
    }

    // 房间码能不能用
    if (seg[1] === 'room' && seg[2] === 'check' && request.method === 'GET') {
      const want = normalizeRoomCode(url.searchParams.get('code'));
      const hint = roomCodeHint(want);
      if (!hint.ok) return json({ code: want, ok: false, reason: hint.msg });
      const taken = await exists(env, want);
      return json({
        code: want, ok: !taken,
        reason: taken ? '这个房间码已经有人用了' : '',
        warn: hint.warn,
      });
    }

    // 新建房间（可以指定房间码和房间名）
    if (seg[1] === 'room' && request.method === 'POST') {
      const body = await readJson(request);
      const rawCode = String(body.code == null ? '' : body.code).trim();
      const want = normalizeRoomCode(rawCode);
      let code = '';

      if (rawCode && !want) {
        return json({ error: '房间码只能填字母和数字（3～20 位）' }, 400);
      }

      if (want) {
        const hint = roomCodeHint(want);
        if (!hint.ok) return json({ error: '房间码不行：' + hint.msg }, 400);
        if (await exists(env, want)) return json({ error: '房间码「' + want + '」已经有人用了，换一个' }, 409);
        code = want;
      } else {
        for (let i = 0; i < 12; i++) {
          const c = roomCode();
          if (!(await exists(env, c))) { code = c; break; }
        }
        if (!code) return json({ error: '试了好几次都没生成出不重复的房间码，稍后再试' }, 500);
      }

      const state = defaultState();
      if (body.name) state.settings.roomName = String(body.name).trim().slice(0, 24);
      if (body.childName) state.settings.childName = String(body.childName).trim().slice(0, 12) || '宝贝';
      await save(env, code, state);
      await indexRoom(env, code);
      return json({ room: code, state: state }, 201);
    }

    if (seg[1] === 'state' && seg[2]) {
      const room = String(seg[2]).toUpperCase();
      if (!isValidRoom(room)) return json({ error: '房间码格式不对' }, 400);

      if (request.method === 'GET' && !seg[3]) {
        const state = await load(env, room);
        if (!state) return json({ error: '没有这个房间', room }, 404);
        return json({ room, state });
      }

      if (request.method === 'POST' && seg[3] === 'op') {
        const body = await readJson(request);
        const ops = Array.isArray(body.ops) ? body.ops : [];
        if (!ops.length) return json({ error: '没有要执行的操作' }, 400);
        const state = await load(env, room);
        if (!state) return json({ error: '没有这个房间', room }, 404);
        // 同 server.js：认不出来的操作名要明确报错，不能静默吞掉
        const unknown = unknownOps(ops);
        if (unknown.length) {
          return json({
            error: '服务器还是旧版本，不认识这些操作：' + unknown.join('、') + '。请重新部署。',
            unknown,
            staleServer: true,
          }, 400);
        }
        applyOps(state, ops);
        state.updatedAt = Date.now();
        await save(env, room, state);
        return json({ room, state });
      }

      if (request.method === 'PUT' && !seg[3]) {
        const body = await readJson(request);
        const incoming = normalizeState(body.state);
        incoming.updatedAt = Date.now();
        await save(env, room, incoming);
        return json({ room, state: incoming });
      }
    }

    return json({ error: '没有这个接口' }, 404);
  }

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
      try {
        if (url.pathname.startsWith('/api/')) {
          const res = await handleApi(request, env, url);
          const h = new Headers(res.headers);
          Object.keys(cors()).forEach(function (k) { h.set(k, cors()[k]); });
          return new Response(res.body, { status: res.status, headers: h });
        }
        if (serveStatic) return serveStatic(url, request);
        if (env && env.ASSETS) return env.ASSETS.fetch(request);
        return new Response('找不到页面', { status: 404 });
      } catch (err) {
        return json({ error: '服务器开小差了：' + (err && err.message) }, 500);
      }
    },
  };
}
