/*
 * 作业小站 · 前端
 * 四个页面：今天（孩子看）/ 小红花 / 这一周 / 家长
 */

import * as C from './core.js';
import {
  esc, $, toast, chime, speak, confetti,
  openModal, closeModal, confirmModal, formModal,
} from './ui.js';

/* 出错时留个记号，家长截图反馈时能对上（也方便自动化检查） */
window.addEventListener('error', function (e) {
  window.__hbError = (e.message || '未知错误') + ' @' + (e.filename || '') + ':' + (e.lineno || 0);
});
window.addEventListener('unhandledrejection', function (e) {
  const r = e.reason;
  window.__hbError = 'Promise 未处理：' + ((r && r.message) || r);
});

/* ============================================================ 全局状态 */

const S = {
  mode: 'server',        // 'server' | 'local'
  room: '',
  state: null,
  online: true,
  view: 'today',
  date: C.todayKey(),    // 家长端正在编辑的日期
  renderedDay: '',       // 上一次渲染时"今天"是哪天，用来跨零点自动翻页
  focus: null,           // 正在进行的一次专注（只存在本机，不上传）
  parentUnlocked: false,
  parentTab: 'hw',
  addTab: 'paste',       // 录作业页的「粘贴识别 / 手动加一条」选项卡
  changelog: null,       // public/changelog.json 的内容（版本号 + 更新历史）
  preview: [],           // 钉钉文本识别结果
  prevPercent: {},
  bootMsg: '正在打开…',
  bootActions: [],
  // 服务器说能传多大的附件（0 = 这个部署方式不支持附件，比如 Upstash 模式）
  maxUpload: 0,
  attachmentsOn: false,
  // 「手动加一条」里刚传上去、还没跟作业一起提交的附件
  draftAttach: [],
  // 「新增每日任务」里刚传上去、还没跟任务一起提交的附件
  draftTaskAttach: [],
  // 「服务器跑的还是旧代码」这个警告只弹一次，别每 8 秒烦人一次
  staleCodeWarned: false,
  // 小红花记录的当前页码（0 起）；翻页是纯前端状态，不写进存档（第 94 轮）
  ledgerPage: 0,
};

const LS_ROOM = 'hb_room';
const LS_STATE = 'hb_cache_';
const LS_PREFS = 'hb_prefs';

let prefs = { voice: true, big: true };
let queue = [];
let flushing = false;
let flushTimer = null;

/* ============================================================ 小工具 */

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) { /* 隐私模式下忽略 */ }
  return null;
}

function loadPrefs() {
  try {
    const raw = store(LS_PREFS);
    if (raw) prefs = Object.assign(prefs, JSON.parse(raw));
  } catch (e) { /* ignore */ }
}
function savePrefs() { store(LS_PREFS, JSON.stringify(prefs)); }

function applyFontSize() {
  document.documentElement.style.fontSize = prefs.big ? '18px' : '15.5px';
  const btn = $('#btn-font');
  if (btn) btn.textContent = prefs.big ? 'A+' : 'A';
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/* ============================================================ 弹窗素材 */

/* 给图标输入框准备的一批常用图标，家长点一下就换上 */
const COMMON_ICONS = [
  '📚', '✏️', '📖', '🔢', '🔤', '🎨', '🎵', '🔬',
  '🏃', '⚽', '🚴', '🏊', '🧘', '🤸', '🛴', '🏀',
  '🧹', '🧺', '🍽️', '🛏️', '🧼', '🗑️', '👕', '🧦',
  '🌙', '⏰', '🦷', '🚿', '🍎', '🥛', '👟', '🎒',
  '⭐', '🌟', '✨', '🏆', '💛', '🎯',
  '🍦', '🍫', '🍕', '🎮', '📺', '🎬', '🧸', '🎡', '🎁', '🎠',
];

/* ------------------------------------------------------------ 版本号 */

/*
 * public/changelog.json 是 `node scripts/version-bump.mjs "改了什么"` 自动写的：
 * 版本号格式 v1.0.月日时分.四位随机码，内容一变就自动往后编一个。
 * 这里把它显示在右上角，点开能看到最近几次更新了什么。
 */
function applyChangelog(log) {
  S.changelog = log;
  const btn = $('#btn-version');
  if (!btn) return;
  if (log && log.version) {
    btn.textContent = log.version;
    btn.hidden = false;
  }
}

async function loadChangelog() {
  try {
    const res = await fetch('./changelog.json', { cache: 'no-cache' });
    if (!res.ok) return;
    applyChangelog(await res.json());
  } catch (e) { /* 没有这个文件就当没有版本号 */ }
}

function openChangelog() {
  const log = S.changelog;
  if (!log || !log.history || !log.history.length) {
    toast('还没有更新记录', 'err');
    return;
  }
  const box = document.createElement('div');
  box.className = 'log-list';
  log.history.forEach(function (h) {
    const div = document.createElement('div');
    div.className = 'log-entry' + (h.v === log.version ? ' cur' : '');
    div.innerHTML = '<b>' + esc(h.v) + (h.v === log.version ? ' · 当前' : '') + '</b>' +
      '<time>' + esc(h.at || '') + '</time>' +
      '<ul>' + (h.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
    box.appendChild(div);
  });
  openModal({
    title: '更新内容',
    bodyNode: box,
    actions: [{ label: '知道了', cls: 'primary', onClick: closeModal }],
  });
}

/* ------------------------------------------------------------ 数字框的上下加减 */

/*
 * 「给孩子留句话」输入框里的默认文本（placeholder）。
 * 高度（min-height:8rem）要能把这 4 行完整显示出来 —— screenshot.mjs 里有一条
 * 断言会把这段文字填进去、量 scrollHeight 和 clientHeight，装不下就报错。
 */
const NOTE_PLACEHOLDER = [
  '做作业要时刻牢记【三到】：',
  '1· 一心一意：用心记',
  '2· 态度端正：坐姿端正、手眼笔姿势端正',
  '3· 勤于开口：有疑问就问，问题要基于事实',
].join('\n');

/*
 * 数字输入框统一用 type="text"（见 style.css 里的说明：Chrome 的 type=number
 * 会把 -1 显示成「1-」），上下加减就自己画一对按钮。
 *
 *   numBox({ id, value, min, max, maxlength, title })
 *
 * 按钮走统一的委托：data-act="num-step" + data-for=输入框 id + data-delta。
 */
function numBox(o) {
  const id = o.id || '';
  const attrs = [
    'class="field num"',
    'id="' + esc(id) + '"',
    'type="text"',
    'inputmode="numeric"',
    'value="' + esc(o.value == null ? '' : o.value) + '"',
  ];
  if (o.min != null) attrs.push('data-min="' + o.min + '"');
  if (o.max != null) attrs.push('data-max="' + o.max + '"');
  if (o.maxlength) attrs.push('maxlength="' + o.maxlength + '"');
  if (o.title) attrs.push('title="' + esc(o.title) + '"');
  if (o.placeholder) attrs.push('placeholder="' + esc(o.placeholder) + '"');
  return '<span class="num-wrap">' +
    '<input ' + attrs.join(' ') + '>' +
    '<span class="num-steps">' +
      '<button type="button" class="num-step" data-act="num-step" data-for="' + esc(id) + '"' +
        ' data-delta="1" title="加一" tabindex="-1">▲</button>' +
      '<button type="button" class="num-step" data-act="num-step" data-for="' + esc(id) + '"' +
        ' data-delta="-1" title="减一" tabindex="-1">▼</button>' +
    '</span>' +
  '</span>';
}

/* ------------------------------------------------------- 新加的那一条滚过去闪一下 */

/**
 * 在作业列表里找到刚加的那一条，滚到眼前并闪一下。
 *
 * 为什么需要：家长在「常用作业库」页签点「加进这一天」时，作业列表在屏幕外面，
 * 页面上看不出任何变化 —— 很容易以为没点到，然后再点一次（于是加了两条）。
 * 每次 render() 都会重建列表，所以用 setTimeout 等这一帧渲染完再找。
 */
function flashNewest(kind, title) {
  setTimeout(function () {
    const rows = document.querySelectorAll('.row-item');
    let target = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const t = rows[i].querySelector('.ri-title');
      if (t && t.textContent.indexOf(title) >= 0) { target = rows[i]; break; }
    }
    if (!target) return;
    /*
     * 只高亮，**不滚动**。
     *
     * 原来这里还 scrollIntoView 把新行滚到眼前，但那会在家长刚点完的地方
     * 把整页挪一下 —— 手指/鼠标紧接着点的那一下就会落到别的元素上，
     * 表现成"点了没反应"。宁可让家长自己滚，也不要在他们手底下动页面。
     * （列表标题上有条数「今天的作业（N）」，加成功了一眼能看出来。）
     */
    target.classList.add('just-added');
    setTimeout(function () { target.classList.remove('just-added'); }, 1600);
  }, 60);
}

/* ------------------------------------------------------- 撤销并说明理由 */

/**
 * 家长撤销「孩子打了勾、还没确认」的那一项，并说明理由。
 *
 * 理由不只是给家长自己看的 —— 孩子那边会显示出来，而且决定这一项怎么处理：
 *   任务取消 → 这一项不用做了，孩子那边锁住，点不动
 *   再完善   → 孩子要重新做一遍
 * 所以两个快捷选项是"选一种处理方式"，下面那个输入框是补充说明。
 */
function openUndoModal(kind, id, title) {
  const box = document.createElement('div');

  /*
   * 两个理由是**可选的**（第 57 轮 4）：都不选就是"直接撤回"，
   * 不带"取消 / 再完善"的定性 —— 孩子那边只是回到没打勾的状态。
   * 所以默认不选中任何一个，再点一下已选的那个可以取消选择。
   */
  const kinds = C.UNDO_KINDS.map(function (k) {
    return '<label class="undo-pick">' +
      '<input type="checkbox" name="undo-kind" value="' + k.key + '">' +
      '<b>' + k.label + '</b><small>' + k.hint + '</small>' +
    '</label>';
  }).join('');
  box.innerHTML =
    '<p class="hint" style="margin:0 0 .6rem">撤销「' + esc(title) + '」。' +
      '<br>不选也行 —— 直接撤回，孩子那边就是回到没做的状态。</p>' +
    '<div class="undo-kinds">' + kinds + '</div>' +
    '<textarea class="field" id="undo-reason" rows="3" maxlength="200" ' +
      'placeholder="想交代一句就写在这儿（可留空），例如：这一课老师说不做了 / 生字重写一遍，写工整些"></textarea>';

  /*
   * 用 checkbox 而非 radio：radio 点中之后没法再点掉，"都不选"就实现不了。
   * 做成单选的手感 —— 选中一个就把另一个取消（家长不用先取消再选）。
   */
  const inputs = Array.prototype.slice.call(box.querySelectorAll('.undo-pick input'));
  inputs.forEach(function (r) {
    r.addEventListener('change', function () {
      if (r.checked) {
        inputs.forEach(function (o) { if (o !== r) o.checked = false; });
      }
      box.querySelectorAll('.undo-pick').forEach(function (l) {
        l.classList.toggle('on', l.querySelector('input').checked);
      });
    });
  });

  openModal({
    title: '撤销这一项',
    bodyNode: box,
    actions: [
      { label: '先不撤', cls: 'ghost', onClick: closeModal },
      {
        label: '撤销', cls: 'primary', onClick: function () {
          const picked = box.querySelector('input[name="undo-kind"]:checked');
          const reasonKind = picked ? picked.value : '';   // 空 = 直接撤回
          const reason = (box.querySelector('#undo-reason').value || '').trim();
          dispatch({ t: 'item.undo', date: S.date, kind: kind, id: id, reasonKind: reasonKind, reason: reason });
          closeModal();
          toast(reasonKind === 'cancel' ? '已撤销：任务取消，孩子不用做了'
            : reasonKind === 'redo' ? '已撤销：让孩子再完善一遍'
            : '已撤销', 'ok');
        },
      },
    ],
  });
}

/* ================================================================ 附件 */

/* ---------------------------------------------------------- 图片压缩 */

/*
 * 上传前把图片压小（第 75 轮 2）。
 *
 * 为什么只压图片：**浏览器里没有现成的视频/PDF 转码器**。
 *   · 视频：唯一能想到的办法是 MediaRecorder 重录，但它是**按真实时长**录的 ——
 *     2 分钟的视频要等 2 分钟，家长根本没法接受（而且音画同步还得自己接）。
 *   · PDF：要压里面的图片流得先解析 PDF，那是一个很重的库，和"零依赖"冲突；
 *     而且老师发的 PDF 一般已经是压过的。
 * 图片不一样：相机的照片动辄 3~5MB，缩到 1800px 再编码一次通常只剩几百 KB，
 * 手机上看着**没有区别**，这是回报最大的一块。
 */

/** 把 canvas 转成 blob（toBlob 是回调式，包一层 Promise） */
function canvasToBlob(canvas, type, quality) {
  return new Promise(function (resolve) {
    try { canvas.toBlob(function (b) { resolve(b); }, type, quality); }
    catch { resolve(null); }
  });
}

/**
 * 压一张图。压不动（解不了 / 压完反而更大 / 不是图片）就返回 null，调用方照原样传。
 *
 * 几个必须注意的点：
 *   · 用 createImageBitmap 的 imageOrientation:'from-image' —— 手机照片带 EXIF 旋转，
 *     不处理的话竖着拍的照片传上去会躺倒。
 *   · GIF / SVG 不碰：前者会把动图压成静态图，后者是矢量图，本来就小。
 *   · HEIC 大多数浏览器解不了（iOS 上 Safari 能解），解不了就原样传。
 */
async function compressImage(file, opts) {
  const o = opts || {};
  const maxDim = o.maxDim || 1800;
  const quality = o.quality || 0.82;
  const name = String(file.name || '');
  const isPng = /\.png$/i.test(name) || file.type === 'image/png';
  // 动图 / 矢量图 / 本来就小的图，不折腾
  if (/\.gif$/i.test(name) || file.type === 'image/gif') return null;
  if (/\.svg$/i.test(name) || file.type === 'image/svg+xml') return null;
  if (file.size < (o.minBytes || 200 * 1024)) return null;
  if (!/^image\//.test(file.type || '')) return null;

  let bmp = null;
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        bmp = await createImageBitmap(file);      // 老浏览器不认这个选项
      }
    }
    if (!bmp) return null;
    const w0 = bmp.width, h0 = bmp.height;
    if (!w0 || !h0) return null;
    const scale = Math.min(1, maxDim / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // 缩小的时候开高质量插值，字才不会糊
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);

    /*
     * WebP 一般比 JPEG 小 25%~35%，而且支持透明（PNG 截图转过去不会变黑底）；
     * 浏览器不支持就退回 JPEG。
     */
    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    let type = 'image/webp';
    if (!blob || blob.type !== 'image/webp') {
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      type = 'image/jpeg';
    }
    if (!blob) return null;
    // 压完反而更大（小图、已经很省的图）就作罢
    if (blob.size >= file.size * 0.95) return null;

    const ext = type === 'image/webp' ? 'webp' : 'jpg';
    const base = name.replace(/\.[^.]+$/, '') || '图片';
    return {
      blob: blob,
      name: base + '.' + ext,
      type: type,
      from: file.size,
      to: blob.size,
      w0: w0, h0: h0, w: w, h: h,
    };
  } catch {
    return null;
  } finally {
    if (bmp && bmp.close) { try { bmp.close(); } catch { /* 忽略 */ } }
  }
}

/**
 * 把选中的文件传上去，返回服务端给的附件记录。
 *
 * 一个个串行传：手机上同时发几个大视频很容易被浏览器/路由器掐断，
 * 而且串行才能给出"正在传第 2 个，共 3 个"这种明确的进度。
 */
async function uploadFiles(files, onStep) {
  const list = Array.prototype.slice.call(files || []);
  const out = [];
  const saved = { from: 0, to: 0, n: 0 };      // 这次一共省了多少
  const compress = S.state && S.state.settings.compressImages !== false;
  for (let i = 0; i < list.length; i++) {
    let f = list[i];
    if (onStep) onStep(i + 1, list.length, f);
    const info = C.checkUpload(f.name, f.type);
    if (!info.ok) { toast('「' + f.name + '」' + info.reason, 'err'); continue; }
    if (S.maxUpload && f.size > S.maxUpload) {
      toast('「' + f.name + '」太大了（' + C.humanSize(f.size) + '），最多 ' +
        Math.round(S.maxUpload / 1024 / 1024) + 'MB', 'err');
      continue;
    }
    // 图片先压再传；视频 / PDF / 文本原样传（浏览器里没法压，见 compressImage 的注释）
    if (compress) {
      if (onStep) onStep(i + 1, list.length, f, '正在压缩…');
      const small = await compressImage(f);
      if (small) {
        saved.from += small.from;
        saved.to += small.to;
        saved.n++;
        f = new File([small.blob], small.name, { type: small.type });
      }
    }
    try {
      /*
       * 直接把 File 当 body 发 —— 服务端收的就是原始字节，
       * 不用 FormData / multipart，两边都省事（见 server.js 顶部注释）。
       */
      const res = await fetch('/api/upload/' + encodeURIComponent(S.room) +
        '?name=' + encodeURIComponent(f.name), { method: 'POST', body: f });
      const j = await res.json().catch(function () { return null; });
      if (!res.ok) { toast((j && j.error) || ('上传失败（' + res.status + '）'), 'err'); continue; }
      out.push(j.file);
    } catch (e) {
      toast('「' + f.name + '」没传上去：' + (e && e.message ? e.message : '网络问题'), 'err');
    }
  }
  if (saved.n) {
    toast('已压缩 ' + saved.n + ' 张图：' + C.humanSize(saved.from) + ' → ' +
      C.humanSize(saved.to) + '（省了 ' +
      Math.round((1 - saved.to / saved.from) * 100) + '%）', 'ok', 6000);
  }
  return out;
}

/** 附件在列表里的一行（家长和孩子两边共用同一套外观） */
function attachChip(a, opts) {
  const o = opts || {};
  const url = C.fileURL(S.room, a.id);
  const del = o.removeAct
    ? '<button class="att-del" data-act="' + o.removeAct + '" data-id="' + esc(a.id) + '"' +
      ' data-kind="' + esc(o.kind || '') + '" data-itemid="' + esc(o.itemId || '') + '"' +
      ' data-scope="' + esc(o.scope || 'item') + '" title="删掉">✕</button>'
    : '';
  const thumb = a.kind === 'image'
    ? '<img class="att-thumb" src="' + url + '" alt="" loading="lazy">'
    : '<span class="att-icon">' + C.fileIcon(a.kind) + '</span>';
  return '<div class="att-chip' + (o.cls ? ' ' + o.cls : '') + '">' +
    '<a class="att-open" href="' + url + '" target="_blank" rel="noopener" title="打开看看">' +
      thumb +
      '<span class="att-name">' + esc(a.name) + '</span>' +
      '<span class="att-size">' + C.humanSize(a.size) + '</span>' +
    '</a>' + del +
  '</div>';
}

/**
 * 附件区（可以带上传按钮）；没有附件又不上传就返回空串，不占地方。
 *
 * opts.addFirst  = true → 上传按钮放**最上面**，已传的排在下面
 *                （专注页里要这样：孩子先看到"上传"，传完的东西在按钮下面一个个列出来）
 * opts.sources   = true → 给三个入口：拍照 / 录像、录音、选文件
 *                （手机上 `capture` 会直接调起相机 / 录音机，比让家长在文件管理器里翻半天强）
 */
function attachBox(list, opts) {
  const o = opts || {};
  const items = C.normalizeAttachments(list);
  const canAdd = o.canAdd !== false && S.attachmentsOn;
  if (!items.length && !canAdd) return '';

  const key = esc(o.key || '');
  const fileInput = function (attr, label) {
    return '<label class="att-add">' +
      '<input type="file" multiple ' + attr + ' data-att-input="' + key + '" hidden>' +
      label + '</label>';
  };
  let addHTML = '';
  if (canAdd) {
    addHTML = o.sources
      ? '<div class="att-add-row">' +
          // capture 让手机直接开相机；桌面上浏览器会忽略它，退化成普通选文件
          fileInput('accept="image/*,video/*" capture="environment"', '📷 拍照 / 录像') +
          fileInput('accept="audio/*"', '🎤 录音') +
          fileInput('accept="' + C.UPLOAD_ACCEPT + '"', '📎 选文件') +
        '</div>'
      : fileInput('accept="' + C.UPLOAD_ACCEPT + '"',
          o.addLabel || '📎 加附件（图片 / 视频 / 文本）');
  }

  const listHTML = items.length
    ? '<div class="att-list">' + items.map(function (a) { return attachChip(a, o); }).join('') + '</div>'
    : '';
  const hintHTML = (canAdd && !items.length && o.hint)
    ? '<p class="hint att-hint">' + esc(o.hint) + '</p>' : '';
  return '<div class="att-box" data-att-for="' + key + '">' +
    (o.addFirst ? addHTML + listHTML : listHTML + addHTML) +
    hintHTML +
  '</div>';
}

/** 附件区里"打开看看"以外的点击：上传按钮和删掉，都走这里 */
function bindAttachBoxes(root) {
  root.querySelectorAll('[data-att-input]').forEach(function (inp) {
    /*
     * 打了标记就别再绑一次。
     * #view 每次渲染都是新元素，但弹窗挂在 #modal-root 上、不会重建；
     * 不防重的话每渲染一次就多一个监听，选一个文件会被上传好几遍。
     */
    if (inp.dataset.attBound === '1') return;
    inp.dataset.attBound = '1';
    inp.addEventListener('change', async function () {
      const key = inp.dataset.attInput;
      const files = inp.files;
      if (!files || !files.length) return;
      inp.disabled = true;
      /*
       * 上传中的提示挂在**这个 input 所在的那一块**上：
       * 一行可能有两个附件位，用 label.textContent 会把「加附件」按钮的字也擦掉。
       */
      const box = inp.closest('.att-box') || inp.closest('.att-add');
      let tip = box ? box.querySelector('.att-tip') : null;
      if (box && !tip) {
        tip = document.createElement('span');
        tip.className = 'att-tip';
        box.appendChild(tip);
      }
      const say = function (t) { if (tip) tip.textContent = t; };
      const got = await uploadFiles(files, function (i, n, f, phase) {
        // phase 有值时是"正在压缩…"这种阶段提示，没有就是正常上传
        say(phase ? '⏳ ' + phase + ' ' + f.name : '⏳ ' + i + '/' + n + '：' + f.name);
      });
      say('');
      if (tip) tip.remove();
      inp.disabled = false;
      inp.value = '';
      if (got.length && typeof pendingAttach[key] === 'function') {
        pendingAttach[key](got);       // 交给调用方决定是"先存起来"还是"立刻发 op"
      }
    });
  });
}

/** key → 收到刚上传完的附件时怎么办（注册在需要的地方） */
const pendingAttach = {};

/**
 * 问服务器能传多大的附件。
 * 拿不到就按"不支持"处理：宁可少一个按钮，也不要让家长传完才发现存不下。
 */
async function loadUploadLimits() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const j = await res.json();
    S.maxUpload = Number(j.maxUploadMB || 0) * 1024 * 1024;
    S.attachmentsOn = j.attachments === true && S.maxUpload > 0;
  } catch (e) {
    S.maxUpload = 0;
    S.attachmentsOn = false;
  }
}

/**
 * 只把某一处附件区换掉，**千万别整个 render()**。
 *
 * 踩过的坑：家长先填好科目 / 标题 / 备注，再点「加附件」——
 * 传完如果 render()，整块 innerHTML 会被重建，刚填的字全没了。
 * 所以这里按 `data-att-for` 找到那一块，原地替换，其它 DOM 一个都不动。
 */
function refreshAttachBox(key, build) {
  const old = document.querySelector('.att-box[data-att-for="' + key + '"]');
  if (!old) return false;
  const tmp = document.createElement('div');
  tmp.innerHTML = build();
  const node = tmp.firstElementChild;
  if (!node) return false;
  old.replaceWith(node);
  bindAttachBoxes(document);
  return true;
}

/** 「手动加一条」里那一块附件区的 HTML（页面渲染和数据变化后刷新都用这一个） */
function draftAttachHTML() {
  return attachBox(S.draftAttach, {
    key: 'hw-add', addLabel: '📎 加附件（图片 / 视频 / 文本）',
    removeAct: 'draft-att-del',
  });
}

/*
 * 「手动加一条」里刚传上来的附件：先攒着，点「添加到这一天」时才跟着作业一起存。
 * 这样家长可以一次选好几个、传完还能检查一遍，不会传了就撤不掉。
 */
pendingAttach['hw-add'] = function (got) {
  S.draftAttach = C.normalizeAttachments(S.draftAttach.concat(got));
  refreshAttachBox('hw-add', draftAttachHTML);
  toast('加了 ' + got.length + ' 个附件', 'ok');
};

/*
 * 孩子交作业时传的附件：**传完立刻就存**，不等"我做完了"。
 * 孩子传完视频随手按返回也不会丢；家长在「待确认」那边马上就能看到。
 */
pendingAttach['focus-work'] = function (got) {
  const f = S.focus;
  if (!f) return;
  got.forEach(function (file) {
    dispatch({ t: 'attach.add', date: C.todayKey(), kind: f.kind, id: f.id, scope: 'work', file: file });
  });
  // 本地先把界面更新掉，不用等服务器回包
  f.works = C.normalizeAttachments((f.works || []).concat(got));
  chime(true);
  toast('交上去了 ' + got.length + ' 个，爸爸妈妈能看到', 'ok');
  updateFocusUI();
};

/** 传错了可以删掉重来（孩子这边自己删自己刚交的） */
/* ============================================================ 与服务器通信 */

async function api(path, opts) {
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || ('HTTP ' + res.status));
    err.status = res.status;
    // 服务器报"不认识这个操作"= 它还在跑旧代码，这个标记用来给家长一句人话提示
    err.staleServer = Boolean(data && data.staleServer);
    err.unknown = data && data.unknown;
    throw err;
  }
  return data;
}

function saveCache() {
  try { store(LS_STATE + S.room, JSON.stringify(S.state)); } catch (e) { /* ignore */ }
}
function loadCache(room) {
  try {
    const raw = store(LS_STATE + room);
    return raw ? C.normalizeState(JSON.parse(raw)) : null;
  } catch (e) { return null; }
}

/**
 * 顶栏的同步状态。
 *
 * 它是个**状态标签**，不是按钮 —— 所以没有底色、没有边框、没有投影，
 * 也不是 <button>，点了不会有任何反应（上一版做成了圆按钮的样子，被误认成按钮）。
 * 只留一颗小圆点 + 两个字，高度和旁边两个圆按钮一致，所以顶栏还是齐的。
 */
function setSync(status) {
  const dot = $('#sync-dot');
  if (!dot) return;
  const txt = $('#sync-text');
  dot.className = 'sync-chip' + (status === 'off' ? ' off' : status === 'busy' ? ' busy' : '');
  if (txt) txt.textContent = status === 'off' ? '离线' : (status === 'busy' ? '同步中' : '已同步');
  dot.title = status === 'off' ? '连不上服务器，正在用本机数据'
    : (status === 'busy' ? '正在同步…' : '已同步');
}

/* ======================================================== 房间管理 */

/*
 * 两种列表：
 *   knownRooms() —— 这台设备进过的房间，存在本机，断网也能切换
 *   S.roomList   —— 服务器上所有房间，要「房间管理口令」才给看
 * 口令不会泄露出去，因为只有家长在设置里主动填才会请求。
 */

const LS_ROOMS = 'hb_rooms';
const LS_ADMIN = 'hb_admin_key';

function knownRooms() {
  try {
    const arr = JSON.parse(store(LS_ROOMS) || '[]');
    return Array.isArray(arr)
      ? arr.filter(function (r) { return r && C.isValidRoom(r.code); })
      : [];
  } catch (e) { return []; }
}

/** 进过一个房间就记一笔，下回不用重新输房间码 */
function rememberRoom(code, name) {
  if (!C.isValidRoom(code)) return;
  const up = String(code).toUpperCase();
  const all = knownRooms();
  const prev = all.filter(function (r) { return r.code === up; })[0];
  const list = all.filter(function (r) { return r.code !== up; });
  list.unshift({ code: up, name: String(name || (prev && prev.name) || ''), ts: Date.now() });
  store(LS_ROOMS, JSON.stringify(list.slice(0, 40)));
}

function adminKey() { return String(store(LS_ADMIN) || ''); }

/** 换房间就是换 URL 上的 room 参数，整页重载最干净 */
function switchRoom(code) {
  const up = String(code || '').toUpperCase();
  if (!C.isValidRoom(up)) { toast('房间码不对', 'warn'); return; }
  rememberRoom(up, '');
  const url = new URL(location.href);
  url.searchParams.set('room', up);
  url.hash = '';
  location.href = url.toString();
}

/** 拉一次房间列表（接口是开放的，不需要口令） */
async function loadRoomList() {
  S.roomListLoading = true;
  S.roomListErr = '';
  render();
  try {
    const j = await api('/api/rooms');
    S.roomList = Array.isArray(j && j.rooms) ? j.rooms : [];
    S.roomsNeedKey = Boolean(j && j.needsKeyToDelete);
    S.roomListErr = '';
  } catch (e) {
    S.roomList = null;
    S.roomListErr = (e && e.message) || '连不上服务器';
  }
  S.roomListLoading = false;
  render();
}

/**
 * 进「房间」时拉一次：口令状态 + 房间列表。
 * 列表是开放的（一台服务器就是一个家庭），口令只管删除。
 */
async function loadAdminState() {
  let admin = null;
  let rooms = null;
  try {
    const res = await Promise.all([
      api('/api/admin/state').catch(function () { return null; }),
      api('/api/rooms').catch(function () { return null; }),
    ]);
    admin = res[0];
    rooms = res[1];
  } catch (e) { /* 下面统一处理 */ }

  S.adminState = admin
    ? {
      configured: Boolean(admin.configured),
      source: admin.source || '',
      canSetup: admin.canSetup !== false,
      minLength: admin.minLength || 6,
      online: true,
    }
    : { configured: false, source: '', canSetup: true, minLength: 6, online: false };

  if (rooms) {
    S.roomList = Array.isArray(rooms.rooms) ? rooms.rooms : [];
    S.roomsNeedKey = Boolean(rooms.needsKeyToDelete);
    S.roomListErr = '';
  } else {
    S.roomList = null;
    S.roomListErr = '连不上服务器';
  }
  S.adminLoading = false;
  render();
}

/** 房间管理口令：只管删除，可有可无 */
function openAdminKeyModal() {
  const admin = S.adminState || {};
  const box = document.createElement('div');

  function row(html) {
    const d = document.createElement('div');
    d.className = 'form-row';
    d.innerHTML = html;
    return d;
  }

  if (admin.source === 'env') {
    const p = document.createElement('p');
    p.className = 'hint';
    p.innerHTML = '这台部署的口令来自环境变量 <code>HB_ADMIN_KEY</code>，' +
      '要改得去改部署配置。它只用来确认删除房间，平时用不到。';
    box.appendChild(p);
    openModal({ title: '房间管理口令', bodyNode: box, actions: [{ label: '知道了', cls: 'primary', onClick: closeModal }] });
    return;
  }

  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.style.margin = '0 0 .6rem';
  tip.innerHTML = '口令<b>只用在删除房间时确认一下</b>，平时浏览、切换、改名都不用。' +
    '服务器上只存 <b>scrypt 哈希</b>（data/_admin.json），没有明文。';
  box.appendChild(tip);

  let oldRow = null;
  let n1Row = null;
  let n2Row = null;
  const min = admin.minLength || 6;

  if (admin.configured) {
    oldRow = row('<label>当前口令</label><input class="field" id="ak-old" type="password" autocomplete="current-password">');
    box.appendChild(oldRow);
  }
  n1Row = row('<label>新口令</label><input class="field" id="ak-new" type="password" ' +
    'autocomplete="new-password" placeholder="至少 ' + min + ' 位">');
  n2Row = row('<label>再输一遍</label><input class="field" id="ak-again" type="password" autocomplete="new-password">');
  box.appendChild(n1Row);
  box.appendChild(n2Row);

  const actions = [{ label: '取消', cls: 'ghost', onClick: closeModal }];
  if (admin.configured) {
    actions.push({
      label: '取消口令',
      cls: 'danger',
      onClick: async function () {
        const k = oldRow.querySelector('#ak-old').value.trim();
        if (!k) { toast('先填当前口令', 'warn'); return; }
        try {
          await api('/api/admin/clear', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: k }),
          });
          store(LS_ADMIN, '');
          closeModal();
          toast('已取消口令，删房间改为只核对房间码');
          loadAdminState();
        } catch (e) { toast((e && e.message) || '取消失败', 'warn'); }
      },
    });
  }
  actions.push({
    label: admin.configured ? '改口令' : '保存口令',
    cls: 'primary',
    onClick: async function () {
      const n1 = n1Row.querySelector('#ak-new').value.trim();
      const n2 = n2Row.querySelector('#ak-again').value.trim();
      if (n1.length < min) { toast('口令至少 ' + min + ' 位', 'warn'); return; }
      if (n1 !== n2) { toast('两次输入不一样', 'warn'); return; }
      try {
        if (admin.configured) {
          await api('/api/admin/change', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: oldRow.querySelector('#ak-old').value.trim(), newKey: n1 }),
          });
        } else {
          await api('/api/admin/setup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: n1 }),
          });
        }
        store(LS_ADMIN, n1);
        closeModal();
        toast(admin.configured ? '口令改好了' : '口令设好了');
        loadAdminState();
        // 刚才是点了「删除」被拦下来设口令的，设完接着删
        if (S.pendingDelete) {
          const p = S.pendingDelete;
          S.pendingDelete = null;
          setTimeout(function () { openRoomDeleteModal(p.code, p.name); }, 700);
        }
      } catch (e) { toast((e && e.message) || '保存失败', 'warn'); }
    },
  });

  openModal({ title: '房间管理口令', bodyNode: box, actions: actions });
}

/** 「新建房间」弹窗：房间名 + 随机码 / 自定义码 */
function openNewRoomModal() {
  const box = document.createElement('div');

  function row(html) {
    const d = document.createElement('div');
    d.className = 'form-row';
    d.innerHTML = html;
    return d;
  }

  const nameRow = row('<label>房间名</label>' +
    '<input class="field" id="nr-name" placeholder="例如：朵朵的作业（可留空）" maxlength="24">');
  const childRow = row('<label>孩子名字</label>' +
    '<input class="field" id="nr-child" placeholder="朵朵（可留空）" maxlength="12">');
  const modeRow = row('<label>房间码</label>' +
    '<select class="field" id="nr-mode">' +
      '<option value="auto">随机生成（推荐，猜不到）</option>' +
      '<option value="custom">我自己定一个</option>' +
    '</select>');
  const codeRow = row('<label>自定义码</label>' +
    '<input class="field" id="nr-code" placeholder="字母数字，3～20 位，例如 duoduo" autocapitalize="characters">');
  codeRow.hidden = true;

  const tip = document.createElement('p');
  tip.className = 'hint hint-align';   // 左边和「房间码」的输入框对齐
  tip.style.margin = '.2rem 0 0';
  tip.textContent = '定了就不能改了，想换只能新建一个房间。';

  box.appendChild(nameRow);
  box.appendChild(childRow);
  box.appendChild(modeRow);
  box.appendChild(codeRow);
  box.appendChild(tip);

  const modeSel = modeRow.querySelector('#nr-mode');
  const codeInput = codeRow.querySelector('#nr-code');
  modeSel.addEventListener('change', function () {
    codeRow.hidden = modeSel.value !== 'custom';
    if (!codeRow.hidden) codeInput.focus();
  });

  // 输入时实时给个提示：会不会太短、有没有被占用
  let checkTimer = null;
  codeInput.addEventListener('input', function () {
    const c = C.normalizeRoomCode(codeInput.value);
    if (codeInput.value !== c) codeInput.value = c;
    const h = C.roomCodeHint(c);
    tip.textContent = !c ? '字母数字，3～20 位'
      : (!h.ok ? '⚠️ ' + h.msg
        : (h.warn ? '⚠️ ' + h.warn : '✓ 「' + c + '」可以用'));
    clearTimeout(checkTimer);
    if (!c || !h.ok) return;
    checkTimer = setTimeout(async function () {
      try {
        const j = await api('/api/room/check?code=' + encodeURIComponent(c));
        if (!j.ok) tip.textContent = '⚠️ ' + (j.reason || '这个码不能用');
        else if (j.warn) tip.textContent = '⚠️ ' + j.warn;
        else tip.textContent = '✓ 「' + c + '」可以用';
      } catch (e) { /* 离线就算了，提交时服务器还会再拦一次 */ }
    }, 400);
  });

  openModal({
    title: '新建房间',
    bodyNode: box,
    actions: [
      { label: '取消', cls: 'ghost', onClick: closeModal },
      {
        label: '创建并进入',
        cls: 'primary',
        onClick: async function () {
          const name = nameRow.querySelector('#nr-name').value.trim();
          const child = childRow.querySelector('#nr-child').value.trim();
          const custom = modeSel.value === 'custom' ? C.normalizeRoomCode(codeInput.value) : '';
          if (modeSel.value === 'custom') {
            const h = C.roomCodeHint(custom);
            if (!h.ok) { toast('房间码' + h.msg, 'warn'); return; }
          }
          try {
            const j = await api('/api/room', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: custom, name: name, childName: child }),
            });
            closeModal();
            rememberRoom(j.room, C.roomNameOf(C.normalizeState(j.state)));
            toast('房间建好了，正在进入…');
            setTimeout(function () { switchRoom(j.room); }, 500);
          } catch (e) {
            toast((e && e.message) || '建房间失败', 'warn');
          }
        },
      },
    ],
  });
}

/** 所有改动都走这里：本地先变，再排队发给服务器 */
function dispatch(op) {
  if (!S.state) return;
  /*
   * 页面自己认不出这个操作 = 浏览器里跑的是**旧代码**（缓存没刷新）。
   * 不能默默算进本地状态就算了 —— 那样服务器那边永远不会有这条，
   * 下次同步又把它盖掉。直接提示刷新。
   */
  if (!C.isKnownOp(op.t)) {
    toast('这个操作当前页面还不认识，刷新一下页面再试', 'err', 5000);
    return;
  }
  C.applyOps(S.state, [op]);
  saveCache();
  render();
  if (S.mode === 'local') return;
  queue.push(op);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 260);
}

async function flush() {
  if (flushing || !queue.length || S.mode === 'local') return;
  flushing = true;
  setSync('busy');
  const batch = queue.splice(0, queue.length);
  try {
    const j = await api('/api/state/' + S.room + '/op', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: batch }),
    });
    let next = C.normalizeState(j.state);
    if (queue.length) C.applyOps(next, queue);
    S.state = next;
    S.online = true;
    saveCache();
    setSync('ok');
  } catch (e) {
    queue.unshift.apply(queue, batch);
    S.online = false;
    setSync('off');
    /*
     * 服务器还在跑旧代码时会明确回 400。这种"怎么点都不生效"最让人抓狂，
     * 所以每隔一阵子就提醒一句，别让它静悄悄地失败。
     */
    if (e && e.staleServer) {
      const now = Date.now();
      if (!S.staleWarnedAt || now - S.staleWarnedAt > 60000) {
        S.staleWarnedAt = now;
        toast('服务器还是旧版本，刚才的操作没能保存。重启一下服务再试。', 'err', 8000);
      }
      return;   // 别急着马上重试，旧服务器重试多少次都一样
    }
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 4000);
  } finally {
    flushing = false;
  }
}

async function poll() {
  if (S.mode === 'local' || !S.state) return;
  if (queue.length || flushing) { flush(); return; }
  try {
    const j = await api('/api/state/' + S.room);
    const remote = C.normalizeState(j.state);
    if (remote.rev !== S.state.rev) {
      S.state = remote;
      saveCache();
      render();
    }
    S.online = true;
    setSync('ok');
  } catch (e) {
    S.online = false;
    setSync('off');
  }
}

/* ============================================================ 启动 */

function roomFromUrl() {
  const q = new URLSearchParams(location.search).get('room');
  if (q && C.isValidRoom(q)) return q.toUpperCase();
  const m = /#\/r\/([A-Za-z0-9]{6})/.exec(location.hash || '');
  if (m && C.isValidRoom(m[1])) return m[1].toUpperCase();
  return '';
}

function bootUI() {
  const boot = $('#boot');
  boot.hidden = false;
  $('#boot-msg').textContent = S.bootMsg;
  const box = $('#boot-actions');
  box.innerHTML = '';
  S.bootActions.forEach(function (a) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || 'ghost') + ' block';
    b.textContent = a.label;
    b.addEventListener('click', a.onClick);
    box.appendChild(b);
  });
}

function hideBoot() {
  $('#boot').hidden = true;
  $('#topbar').hidden = false;
  $('#view').hidden = false;
  $('#tabbar').hidden = false;
}

/**
 * 回到顶部。
 * 注意：页面本身不滚动了（body 是 overflow:hidden 的应用外壳），
 * 真正滚的是 #scroller，所以不能再调 window.scrollTo。
 */
function scrollToTop(smooth) {
  const sc = $('#scroller');
  if (!sc) return;
  if (smooth && sc.scrollTo) sc.scrollTo({ top: 0, behavior: 'smooth' });
  else sc.scrollTop = 0;
}

async function ensureRoom() {
  const forced = roomFromUrl();
  if (forced) { S.room = forced; store(LS_ROOM, forced); return; }

  const saved = store(LS_ROOM);
  if (saved && C.isValidRoom(saved)) { S.room = saved; return; }

  if (location.protocol === 'file:') {
    S.mode = 'local';
    S.room = C.roomCode();
    store(LS_ROOM, S.room);
    return;
  }

  S.bootMsg = '正在为你创建一个专属小站…';
  bootUI();
  try {
    const j = await api('/api/room', { method: 'POST' });
    S.room = j.room;
    S.state = C.normalizeState(j.state);
    store(LS_ROOM, S.room);
  } catch (e) {
    S.mode = 'local';
    S.room = C.roomCode();
    store(LS_ROOM, S.room);
  }
}

async function boot() {
  loadPrefs();
  applyFontSize();
  S.bootMsg = '正在打开…';
  bootUI();

  await ensureRoom();

  if (S.mode !== 'local' && !S.state) {
    try {
      const j = await api('/api/state/' + S.room);
      S.state = C.normalizeState(j.state);
      S.online = true;
    } catch (e) {
      if (e.status === 404) {
        S.bootMsg = '这个房间码（' + S.room + '）在服务器上找不到。';
        S.bootActions = [
          { label: '创建一个新的小站', cls: 'primary', onClick: function () { store(LS_ROOM, ''); location.href = location.pathname; } },
          { label: '重新试一次', onClick: function () { boot(); } },
        ];
        bootUI();
        return;
      }
      S.online = false;
      S.state = loadCache(S.room) || C.defaultState();
      toast('连不上服务器，暂时用本机数据', 'err');
    }
  }
  if (!S.state) S.state = loadCache(S.room) || C.defaultState();

  // 把房间码写进地址栏，方便直接收藏/分享
  try {
    const url = new URL(location.href);
    if (url.searchParams.get('room') !== S.room) {
      url.searchParams.set('room', S.room);
      history.replaceState(null, '', url.pathname + '?' + url.searchParams.toString() + location.hash);
    }
  } catch (e) { /* ignore */ }

  setSync(S.mode === 'local' ? 'off' : 'ok');
  // 记住进过这个房间，以后在「设置 → 房间」里能一键切回来
  rememberRoom(S.room, C.roomNameOf(S.state));
  hideBoot();
  render();

  // 专心计时：每秒走一次，跟连不连服务器无关
  S.focus = loadFocus();
  if (S.focus) keepAwake(true);    // 刷新页面时专注还在，别息屏也要接着生效
  updateFocusUI();
  setInterval(focusTick, 1000);
  checkVersion();
  loadChangelog();   // 右上角的版本号（public/changelog.json）
  /*
   * 问一句服务器"能传多大的附件"。Upstash 模式没有硬盘，不支持附件，
   * 这时前端干脆不显示上传按钮，而不是让家长传一半才失败。
   */
  loadUploadLimits();

  // 家长密码也支持物理键盘：0-9 输数字，Backspace 退一位，Delete / Esc 清空
  document.addEventListener('keydown', function (e) {
    if (S.view !== 'parent' || S.parentUnlocked) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (/^[0-9]$/.test(e.key)) { pinPress(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { pinPress('删除'); e.preventDefault(); }
    else if (e.key === 'Delete' || e.key === 'Escape') { pinPress('清空'); e.preventDefault(); }
  });

  // 家长页上任何操作都算"人还在"，重新开始 30 秒倒计时。
  // 用捕获阶段，免得被别处 stopPropagation 拦掉。
  ['click', 'keydown', 'input', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (parentIsActive()) touchParentLock();
    }, true);
  });

  /*
   * 从后台切回来时，浏览器已经把 Wake Lock 自动放掉了（规范行为），
   * 这里再申请一次 —— 不补的话孩子切出去看一眼再回来就会息屏。
   */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && S.focus) keepAwake(true);
  });

  // 切出网站：隐藏期间什么都不重置，计时照跑，30 秒后自然上锁；
  // 切回来时人又在家长页，那就重新给 30 秒
  document.addEventListener('visibilitychange', function () {
    if (parentIsActive()) touchParentLock();
  });

  if (S.mode !== 'local') {
    setInterval(tick, 8000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
    window.addEventListener('focus', poll);
  }
}

/**
 * 看看服务器上的前端文件是不是换了新的。
 * 浏览器会一直跑"打开这一页时"加载的那份 JS，改了代码不刷新是看不到的，
 * 所以这里主动比对一下，换了就提示刷新。
 */
async function checkVersion() {
  if (S.mode === 'local') return;
  try {
    const j = await api('/api/version');
    if (!j || !j.v) return;
    /*
     * ★ 服务器跑的还是旧代码（新的 public/ 传上去了、但容器没重启）。
     *
     * 这时候 op 里新加的字段会被旧代码**静默忽略** —— 界面提示"保存好了"，
     * 数据却没变，看着就像"改了没成功"。所以一旦发现就明说，别让人白猜。
     */
    if (j.staleCode && !S.staleCodeWarned) {
      S.staleCodeWarned = true;
      toast('⚠️ 服务器跑的还是旧代码：新的 public/ 传上去了，但服务没重启。' +
        '现在改的东西（比如任务标签）可能存不进去 —— 重启一下服务就好了。', 'err', 15000);
    }
    if (!S.appVersion) {
      S.appVersion = j.v;
      // 设置页底部会显示这个指纹。第一次拿到它时如果正开着设置页，补一次渲染，
      // 不然那里会一直停在「读取中…」。
      if (S.view === 'parent' && S.parentTab === 'settings') render();
      return;
    }
    if (j.v !== S.appVersion) {
      const bar = $('#updatebar');
      if (bar) bar.hidden = false;
    }
  } catch (e) { /* 连不上就算了 */ }
}

/** 每 8 秒做两件事：跨过零点就换一天，然后同步一次 */
function tick() {
  if (document.hidden || !S.state) return;
  if (S.view === 'today' && S.renderedDay !== C.todayKey()) render();
  checkVersion();
  poll();
}

/* ============================================================ 专注时间 */
/*
 * 孩子在一张卡片上点「⏱ 开始专注」就开始倒计时（默认 20 分钟）。
 * 时间到了还没打完勾，就先休息 5 分钟，休息完自动开始下一轮。
 * 计时状态只存在这台设备上（localStorage），不占用云端的同步数据。
 */

const LS_FOCUS = 'hb_focus_';
const REST_TIPS = [
  '站起来伸个懒腰，动动手脚',
  '抬头看看窗外远处，让眼睛歇一会儿',
  '去喝口水，顺便上个厕所',
  '闭上眼睛，慢慢深呼吸三次',
  '和爸爸妈妈说一句话吧',
];

function mins(key, fallback) {
  const v = Number(S.state && S.state.settings && S.state.settings[key]);
  return v > 0 ? v : fallback;
}

function loadFocus() {
  try {
    const raw = store(LS_FOCUS + S.room);
    if (!raw) return null;
    const f = JSON.parse(raw);
    if (!f || !f.endsAt || !f.id) return null;
    // 关过页面很久了就直接作废，免得一打开就弹「休息」
    if (f.endsAt < Date.now() - 90000) return null;
    return f;
  } catch (e) { return null; }
}

function saveFocus() {
  try {
    if (S.focus) store(LS_FOCUS + S.room, JSON.stringify(S.focus));
    else localStorage.removeItem(LS_FOCUS + S.room);
  } catch (e) { /* ignore */ }
}

function focusTarget(kind, id) {
  const st = S.state;
  const day = C.getDay(st, C.todayKey());
  if (kind === 'homework') {
    const h = day.homeworks.filter(function (x) { return x.id === id; })[0];
    if (!h) return null;
    const m = C.subjectMeta(h.subject);
    return { title: h.title, emoji: m.emoji, subject: h.subject, color: m.color,
      note: h.detail || '', attachments: h.attachments };
  }
  if (kind === 'extra') {
    const e = day.extras.filter(function (x) { return x.id === id; })[0];
    return e && { title: e.title, emoji: e.emoji, subject: '额外任务', color: '#8a7a68',
      note: e.note || '', attachments: e.attachments };
  }
  if (kind === 'task') {
    const t = st.dailyTasks.filter(function (x) { return x.id === id; })[0];
    return t && { title: t.title, emoji: t.emoji, subject: '每天要做的事', color: '#8a7a68',
      note: t.note || '', attachments: t.attachments };
  }
  return null;
}

function startFocus(kind, id, round) {
  const t = focusTarget(kind, id);
  if (!t) { toast('这一项找不到了', 'err'); return; }
  // 已经交过的东西带过来，孩子回来接着传（中途退出也不丢）
  const rec = findItem(kind, id, C.todayKey());
  S.focus = {
    kind: kind, id: id, title: t.title, emoji: t.emoji,
    subject: t.subject, color: t.color, note: t.note,
    // 家长传的要求（第 8 条）：孩子在专注页就能点开复核
    req: C.normalizeAttachments(t.attachments),
    works: C.normalizeAttachments(rec && rec.works),
    phase: 'focus', round: round || 1,
    endsAt: Date.now() + mins('focusMinutes', 20) * 60000,
  };
  saveFocus();
  hideRest();
  render();
  updateFocusUI();
  keepAwake(true);      // 第 10 条：专注期间别息屏
  chime(true);
  speak('开始专注，' + t.title, prefs.voice);
}

function stopFocus(msg) {
  if (!S.focus) return;
  S.focus = null;
  saveFocus();
  hideRest();
  keepAwake(false);     // 退出专注就把"别息屏"放掉，别一直咬着电量
  if (S.view === 'today') render();
  updateFocusUI();
  if (msg) toast(msg);
}

function focusIsOn(kind, id) {
  return Boolean(S.focus && S.focus.kind === kind && S.focus.id === id);
}

/** 这一项还在不在（家长可能把它删了） */
function focusItemExists(f) {
  if (!f || !S.state) return false;
  const day = C.getDay(S.state, C.todayKey());
  if (f.kind === 'homework') return day.homeworks.some(function (x) { return x.id === f.id; });
  if (f.kind === 'extra') return day.extras.some(function (x) { return x.id === f.id; });
  if (f.kind === 'task') return S.state.dailyTasks.some(function (x) { return x.id === f.id; });
  return false;
}

/** 专注时间到了 */
function finishFocusPhase() {
  const f = S.focus;
  if (!f) return;
  // 保险：万一这一项刚好做完了，或者被删了，就不再进休息
  const rec = findItem(f.kind, f.id, C.todayKey());
  if ((rec && rec.done) || !focusItemExists(f)) {
    stopFocus(rec && rec.done ? '这一项完成啦 🎉' : '');
    if (rec && rec.done) { confetti(45); chime(true); }
    return;
  }
  f.phase = 'break';
  f.endsAt = Date.now() + mins('breakMinutes', 5) * 60000;
  saveFocus();
  showRest();
  updateFocusUI();
  chime(false);
  speak('时间到啦，先休息' + mins('breakMinutes', 5) + '分钟吧', prefs.voice);
}

/** 休息结束 */
function finishBreakPhase() {
  const f = S.focus;
  if (!f) return;
  hideRest();
  f.phase = 'focus';
  f.round = (f.round || 1) + 1;
  f.endsAt = Date.now() + mins('focusMinutes', 20) * 60000;
  saveFocus();
  updateFocusUI();
  chime(true);
  toast('休息结束，继续加油！', 'ok');
  speak('休息结束，继续加油', prefs.voice);
}

function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return C.pad2(Math.floor(s / 60)) + ':' + C.pad2(s % 60);
}

function showRest() {
  const box = $('#rest');
  if (!box || !S.focus) return;
  if (box.hidden || !box.dataset.built) {
    box.dataset.built = '1';
    // 转圈倒计时跟专注页同一个画法（顺时针收口），只是换了一套绿色
    box.innerHTML =
      '<div class="rest-card">' +
        '<div class="rest-emoji">🌿</div>' +
        '<h3>休息一下吧</h3>' +
        '<div class="focus-clock-wrap rest-clock-wrap">' +
          '<svg class="focus-clock-ring" viewBox="0 0 200 200" aria-hidden="true">' +
            '<circle class="focus-clock-bg rest-ring-bg" cx="100" cy="100" r="' + FOCUS_RING_R + '"></circle>' +
            '<circle class="focus-clock-fg rest-ring-fg" id="rest-ring" cx="100" cy="100" r="' + FOCUS_RING_R + '" ' +
              'stroke-dasharray="' + FOCUS_RING_CIRC.toFixed(2) + ' ' + FOCUS_RING_CIRC.toFixed(2) + '" ' +
              'stroke-dashoffset="0"></circle>' +
          '</svg>' +
          '<div class="focus-clock-text rest-clock-text">' +
            '<div class="focus-clock-num" id="rest-time">--:--</div>' +
            '<div class="focus-clock-cap">还剩</div>' +
          '</div>' +
        '</div>' +
        '<p class="rest-tip" id="rest-tip"></p>' +
        '<button class="btn primary block" data-act="rest-done">我休息好啦</button>' +
      '</div>';
  }
  box.hidden = false;
}

function hideRest() {
  const box = $('#rest');
  if (!box) return;
  box.hidden = true;
  box.innerHTML = '';
  box.dataset.built = '';
}

const FOCUS_RING_R = 88;
const FOCUS_RING_CIRC = 2 * Math.PI * FOCUS_RING_R;

/** 专注页里"孩子交作业"那一块：上传按钮在上，传完的排在下面（一行一个） */
function focusWorkBox(f) {
  return attachBox(f.works, {
    key: 'focus-work', itemId: f.id, kind: f.kind, scope: 'work',
    // 手机上一键调相机 / 录音机；已传的可以删（传错了不用重来）
    sources: true, addFirst: true,
    removeAct: 'focus-att-del',
  });
}

/* ------------------------------------------------------------ 别息屏 */

/*
 * 第 10 条：进专注页后屏幕不要自动熄掉，孩子才能随时看到还剩多久。
 *
 * 用 Screen Wake Lock API（Chrome/Edge 84+、Safari 16.4+ 支持）。
 * 两个坑：
 *   1) 页面切到后台时浏览器会**自动释放**锁，回到前台必须重新申请 ——
 *      所以监听 visibilitychange 再要一次；
 *   2) 申请可能被拒（省电模式、不支持），这时静默降级 ——
 *      息屏只是个小遗憾，不能因此报错打扰孩子。
 */
let wakeLock = null;

async function keepAwake(on) {
  if (!('wakeLock' in navigator)) return;
  if (!on) {
    try { if (wakeLock) await wakeLock.release(); } catch (e) { /* 已经放了就算了 */ }
    wakeLock = null;
    return;
  }
  if (wakeLock && !wakeLock.released) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', function () { wakeLock = null; });
  } catch (e) {
    wakeLock = null;      // 省电模式 / 用户不允许：照常用，只是会息屏
  }
}

/**
 * 专注页上的备注。
 *
 * 家长写要求时常常是**一条一行**：
 *   6 的前面一个数是谁？
 *   6 的后面一个数是谁？
 *   与 6 相邻的数是谁？
 * 直接塞进一个 <p> 里，HTML 会把换行当空白折叠掉 → 糊成一大团（家长的原话）。
 *
 * 所以一律按换行拆开，**一条一行**，装在同一张浅色卡片里。
 * 单行的备注（「家长签字」）也走同一套样式 —— 家长要求"无论单行多行都用这个风格"，
 * 好处是不同作业看起来一致，孩子不会一会儿看到居中的一句话、一会儿看到一张卡片。
 */
function focusNoteHTML(text) {
  const lines = String(text || '').split(/\r?\n/)
    .map(function (t) { return t.trim(); })
    .filter(function (t) { return t.length; });
  if (!lines.length) return '';
  return '<ul class="focus-note-list">' +
    lines.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
  '</ul>';
}

/** 整页的专注倒计时 */
function showFocusView() {
  const box = $('#focusmask');
  const f = S.focus;
  if (!box || !f) return;

  const key = f.kind + ':' + f.id;
  /*
   * 附件开关也要参与"要不要重建"的判断。
   * /api/health 是异步拿的，页面刚打开那一小会儿 S.attachmentsOn 还是 false；
   * 如果那时候刚好进过专注页，HTML 就按"没有附件入口"建好了，
   * 之后同一个目标再进来（key 没变）就**永远不会重建**，入口一直不出现（踩过）。
   */
  const attKey = S.attachmentsOn ? '1' : '0';
  if (box.dataset.built !== '1' || box.dataset.for !== key || box.dataset.att !== attKey) {
    box.dataset.built = '1';
    box.dataset.for = key;
    box.dataset.att = attKey;
    box.innerHTML =
      '<div class="focus-card">' +
        '<span class="focus-round" id="fm-round"></span>' +
        '<div class="focus-emoji">' + esc(f.emoji || '📘') + '</div>' +
        (f.subject ? '<div class="focus-subject" style="color:' + esc(f.color || '#6b7280') + '">' + esc(f.subject) + '</div>' : '') +
        '<h3 class="focus-name">' + esc(f.title) + '</h3>' +
        focusNoteHTML(f.note) +
        /*
         * 家长传的要求（第 8 条）：孩子做题时能直接点开复核 ——
         * "老师发的卷子照片"就摊在这儿，不用退出去翻作业列表。
         * 不加标题、一行一个（贴在一起更好认，也不用先读一句说明）。
         */
        (S.attachmentsOn && C.normalizeAttachments(f.req).length
          ? '<div class="focus-req"><div class="att-box"><div class="att-list">' +
              C.normalizeAttachments(f.req).map(function (a) {
                return attachChip(a, { cls: 'req' });
              }).join('') +
            '</div></div></div>'
          : '') +
        '<div class="focus-clock-wrap">' +
          '<svg class="focus-clock-ring" viewBox="0 0 200 200" aria-hidden="true">' +
            '<circle class="focus-clock-bg" cx="100" cy="100" r="' + FOCUS_RING_R + '"></circle>' +
            '<circle class="focus-clock-fg" id="fm-ring" cx="100" cy="100" r="' + FOCUS_RING_R + '" ' +
              'stroke-dasharray="' + FOCUS_RING_CIRC.toFixed(2) + ' ' + FOCUS_RING_CIRC.toFixed(2) + '" ' +
              'stroke-dashoffset="0"></circle>' +
          '</svg>' +
          '<div class="focus-clock-text">' +
            '<div class="focus-clock-num" id="fm-time">--:--</div>' +
            '<div class="focus-clock-cap">还剩</div>' +
          '</div>' +
        '</div>' +
        '<p class="focus-tip">专心做这一件事，做完可拍照或录音，按下面的按钮完成</p>' +
        /*
         * 交作业的附件（第 9 条）：上传按钮在**上面**，传完的排在按钮**下面**、一行一个。
         * 跳绳要传视频、生字要传照片、朗读要传录音，一行一个才看得清传了啥。
         * 传上去立刻存 —— 孩子可能按完完成就走了，不该等家长再点一次保存。
         */
        (S.attachmentsOn
          ? '<div class="focus-work">' +
              focusWorkBox(f) +
            '</div>'
          : '') +
        '<div class="focus-buttons">' +
          '<button class="btn ok block" data-act="focus-done">✓ 我做完了</button>' +
          '<button class="btn ghost block" data-act="focus-stop">先不专注了</button>' +
        '</div>' +
      '</div>';
  }

  /*
   * 附件那块每次都要对一遍：
   *   · 孩子刚传完 → f.works 变了，要立刻显示出来（不然孩子以为没传上）
   *   · 页面是"附件功能还没就绪"时建的 → 这块压根不存在，这里补建
   * 只改这一小块的内容，不重建整个专注页（重建会让倒计时跳一下）。
   */
  if (S.attachmentsOn) {
    const card = box.querySelector('.focus-card');
    let att = box.querySelector('.focus-work');
    if (!att && card) {
      att = document.createElement('div');
      att.className = 'focus-work';
      const btns = card.querySelector('.focus-buttons');
      if (btns) card.insertBefore(att, btns);
      else card.appendChild(att);
    }
    if (att) {
      const html = focusWorkBox(f);
      if (att.innerHTML !== html) {
        att.innerHTML = html;
        bindAttachBoxes(att);
      }
    }
  }

  const cap = $('#fm-round');
  if (cap) cap.textContent = '第 ' + (f.round || 1) + ' 轮 · 专注 ' + mins('focusMinutes', 20) + ' 分钟';
  box.hidden = false;
}

function hideFocusView() {
  const box = $('#focusmask');
  if (!box || box.hidden) return;
  box.hidden = true;
  box.innerHTML = '';
  box.dataset.built = '';
  box.dataset.for = '';
}

/** 每秒刷新一次：专注时铺满整页倒计时，休息时换成绿色的休息页 */
function updateFocusUI() {
  if (!$('#focusmask')) return;

  if (!S.focus) {
    hideFocusView();
    hideRest();
    return;
  }

  const isBreak = S.focus.phase === 'break';
  const total = mins(isBreak ? 'breakMinutes' : 'focusMinutes', isBreak ? 5 : 20) * 60000;
  const left = Math.max(0, S.focus.endsAt - Date.now());

  if (isBreak) {
    hideFocusView();
    showRest();
    const time = $('#rest-time');
    if (time) time.textContent = fmtLeft(left);
    const tip = $('#rest-tip');
    if (tip) {
      const idx = Math.floor((total - left) / 20000) % REST_TIPS.length;
      tip.textContent = REST_TIPS[idx];
    }
    // 跟专注页同款：剩下的圆弧顺时针收口
    const rring = $('#rest-ring');
    if (rring) {
      const f = Math.max(0, Math.min(1, left / total));
      rring.setAttribute('stroke-dasharray', (FOCUS_RING_CIRC * f).toFixed(2) + ' ' + FOCUS_RING_CIRC.toFixed(2));
      rring.setAttribute('stroke-dashoffset', (-FOCUS_RING_CIRC * (1 - f)).toFixed(2));
    }
    return;
  }

  hideRest();
  showFocusView();
  const num = $('#fm-time');
  if (num) num.textContent = fmtLeft(left);
  const ring = $('#fm-ring');
  if (ring) {
    // 剩下的那段圆弧「收口」在 12 点，缺口从 12 点开始按顺时针变大，
    // 看起来就是指针顺时针走。做法：把实线段放在路径末尾。
    const f = Math.max(0, Math.min(1, left / total));
    ring.setAttribute('stroke-dasharray', (FOCUS_RING_CIRC * f).toFixed(2) + ' ' + FOCUS_RING_CIRC.toFixed(2));
    ring.setAttribute('stroke-dashoffset', (-FOCUS_RING_CIRC * (1 - f)).toFixed(2));
  }
}

/** 每秒跑一次：先看这一项是不是已经完成/不在了，再看倒计时有没有到点 */
function focusTick() {
  if (S.focus) {
    const rec = findItem(S.focus.kind, S.focus.id, C.todayKey());
    const done = Boolean(rec && rec.done);
    if (done || !focusItemExists(S.focus)) {
      stopFocus(done ? '这一项完成啦，专注结束 🎉' : '这一项不在了，专注结束');
      if (done) { confetti(45); chime(true); }
    } else if (S.focus.endsAt - Date.now() <= 0) {
      if (S.focus.phase === 'break') finishBreakPhase();
      else finishFocusPhase();
    }
  }
  updateFocusUI();
}

/* ============================================================ 渲染入口 */

function render() {
  if (!S.state) return;
  S.renderedDay = C.todayKey();
  document.querySelectorAll('#tabbar .tab').forEach(function (b) {
    b.classList.toggle('on', b.dataset.view === S.view);
  });
  const view = $('#view');
  let html = '';
  if (S.view === 'today') html = viewToday();
  else if (S.view === 'stars') html = viewStars();
  else if (S.view === 'week') html = viewWeek();
  else if (S.view === 'parent') html = viewParent();
  view.innerHTML = html;

  const emojis = { today: '📚', stars: '⭐', week: '📈', parent: '👨‍👩‍👧' };
  $('#top-emoji').textContent = emojis[S.view] || '📚';
  $('#top-title').textContent = C.roomNameOf(S.state);

  let sub;
  /*
   * 副标题**每一页都显示房间码**，保持一致。
   * 「今天」页原来显示的是日期，但日期在首页大卡片里已经有了（那么大的年月日），
   * 不必在顶栏再占一行 —— 而且挤在手机上正好把标题挤成竖排。
   */
  sub = '房间码 ' + S.room;
  $('#top-sub').textContent = sub;

  const sb = $('#btn-sound');
  if (sb) sb.classList.toggle('off', !prefs.voice);

  // 每次重渲染后重新挂上传按钮的监听（innerHTML 换掉后旧的监听也没了）。
  // 弹窗不在 #view 里，所以要连 #modal-root 一起扫。
  bindAttachBoxes(document);
}

/* ---------------------------------------------------------- 通用卡片 */

function itemCard(o) {
  const st = S.state;
  const cls = ['card'];
  if (o.done) cls.push('done');
  if (o.done && !o.confirmed && st.settings.requireConfirm) cls.push('waiting');
  if (o.done && o.confirmed) cls.push('locked');
  if (o.kind === 'homework') cls.push('is-homework');

  /*
   * 被家长撤销过的：孩子这边要看到理由，而且三种情况行为不一样 ——
   *   cancel（任务取消）→ 这一项不用做了，锁住不能再点，也不再显示小红花
   *   redo（再完善作业）→ 要重新做一遍，照常能点
   *   ''（两个理由都没选，直接撤回）→ 就是回到没做的状态，照常能点
   */
  const undone = !o.done && Boolean(o.undoKind || o.undoReason);
  const cancelled = undone && o.undoKind === 'cancel';
  if (cancelled) cls.push('cancelled');
  if (undone) cls.push('undone');

  /*
   * 标签栏的**固定顺序**（第 67 轮 2）：
   *   ① 小红花  ② 截止日期  ③ 状态类（等确认 / 等爸爸妈妈确认 / 再完善一遍 / 已取消 …）
   * 小红花永远第一、截止紧跟其后，状态往后接 —— 这样同一天的任务卡片
   * 每一类信息都落在同一个位置上，扫一眼就知道哪张有截止、哪张在等确认。
   */
  const shownPoints = (o.done && o.confirmed) ? (o.awardedPoints || 0) : o.points;
  let tags = '<span class="badge ' + (cancelled ? 'soft' : (o.done ? 'ok' : 'pts')) + '">' +
    (cancelled ? '完成 +' + shownPoints : (o.done ? '✓ 完成 +' + shownPoints : '完成 +' + shownPoints)) +
    '⭐</span>';
  // ② 截止日期（长期 / 实际日期 / 已截止）
  if (o.dueLabel) {
    tags += '<span class="badge soft">📅 ' + esc(o.dueLabel) + '</span>';
  }
  // ③ 状态类
  if (cancelled) {
    tags += '<span class="badge soft">🚫 已取消，这项不做了</span>';
  } else {
    if (o.done && !o.confirmed && st.settings.requireConfirm) {
      tags += '<span class="badge wait">⏳ 等爸爸妈妈确认</span>';
    }
    if (o.undoKind === 'redo') {
      tags += '<span class="badge wait">🔁 爸爸妈妈说要再完善一遍</span>';
    } else if (undone) {
      // 家长没选理由、直接撤回：说一句"再做一次就好"，不然孩子会以为哪里错了
      tags += '<span class="badge wait">↩️ 爸爸妈妈撤回了，再做一次就好</span>';
    }
  }

  // 作业和每日任务都要经过专注页才能完成，右边放「开始专注」；做完变成已完成的勾
  const canFocus = st.settings.focusEnabled !== false && !o.done && !cancelled;
  let right;
  if (canFocus) {
    right = '<button class="focus-btn' + (focusIsOn(o.kind, o.id) ? ' on' : '') + '"' +
      ' data-act="focus-start" data-kind="' + o.kind + '" data-id="' + esc(o.id) + '" title="开始专注">⏱</button>';
  } else {
    right = '<div class="check static" title="' + (cancelled ? '已取消' : '已完成') + '">' +
      (cancelled ? '🚫' : '✓') + '</div>';
  }

  return '' +
    '<div class="' + cls.join(' ') + '"' +
      // 取消掉的这一项不给点（连 data-act 都不放，点了也没人接）
      (cancelled ? '' : ' data-act="toggle" data-kind="' + o.kind + '" data-id="' + esc(o.id) + '"') + '>' +
      '<div class="card-emoji">' + (o.emoji || '📘') + '</div>' +
      '<div class="card-body">' +
        '<div class="card-title">' +
          (o.subject ? '<span class="card-subject" style="color:' + (o.color || '#6b7280') + '">' + esc(o.subject) + '</span>' : '') +
          '<span class="card-title-text">' + esc(o.title) + '</span>' +
        '</div>' +
        // 没有详细要求就不占一行
        (o.detail ? '<div class="card-detail">' + esc(o.detail) + '</div>' : '') +
        /*
         * 第 57 轮 5：家长传的附件也显示在孩子的卡片上，就在**备注下面**、一行两个。
         * 孩子点卡片进专注页之前，先能看到"今天要用的材料在这儿"。
         */
        (C.normalizeAttachments(o.attachments).length
          ? '<div class="att-box card-att req-att"><div class="att-list">' +
              C.normalizeAttachments(o.attachments).map(function (a) {
                return attachChip(a, { cls: 'req' });
              }).join('') +
            '</div></div>'
          : '') +
        /*
         * 被撤销过的话，这里只放**家长写的那句理由**。
         *
         * 原来上面还有一行加粗的「爸爸妈妈让你再完善一下 / 取消了这项」，
         * 但下面那个徽章（🔁 爸爸妈妈说要再完善一遍 / 🚫 已取消，这项不做了）
         * 已经把话说清楚了 —— 两处一起出现就是重复，看着啰嗦。
         * 没写理由就整块不出现，别留一个空框。
         */
        (undone && o.undoReason
          ? '<div class="card-undo"><span>' + esc(o.undoReason) + '</span></div>'
          : '') +
        /*
         * 孩子自己交上去的东西列在这儿：传完能看见"交上去了"，
         * 否则孩子会不确定到底传没传成功，反复传好几遍。
         */
        (C.normalizeAttachments(o.works).length
          ? '<div class="att-box card-att"><div class="att-list">' +
              C.normalizeAttachments(o.works).map(function (a) {
                return attachChip(a, { cls: 'work' });
              }).join('') +
            '</div></div>'
          : '') +
        '<div class="card-tags">' + tags + '</div>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button class="speak-btn" data-act="speak" data-text="' + esc(o.speakText || o.title) + '" title="读一遍">🔊</button>' +
        right +
      '</div>' +
    '</div>';
}

/** 首页那种小圆环：中心一行大字 + 一行小字，下面一行说明 */
function ringHTML(percent, big, small, tone) {
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const pct = Math.min(100, Math.max(0, percent));
  const off = CIRC * (1 - pct / 100);
  return '' +
    '<div class="ring-wrap">' +
      '<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">' +
        '<circle class="ring-bg" cx="60" cy="60" r="' + R + '"></circle>' +
        '<circle class="ring-fg' + (tone ? ' ' + tone : '') + (pct >= 100 ? ' full' : '') + '" cx="60" cy="60" r="' + R + '" ' +
          'stroke-dasharray="' + CIRC.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"></circle>' +
      '</svg>' +
      '<div class="ring-label">' + big + '<small>' + small + '</small></div>' +
    '</div>';
}

function emptyBox(emoji, text) {
  return '<div class="empty"><span class="empty-emoji">' + emoji + '</span><p>' + esc(text) + '</p></div>';
}

/* ---------------------------------------------------------- 今天（孩子） */

function viewToday() {
  const st = S.state;
  const date = C.todayKey();
  const day = C.getDay(st, date);
  const stat = C.countDone(st, date);

  const prev = S.prevPercent[date];
  S.prevPercent[date] = stat.percent;
  if (prev !== undefined && prev < 100 && stat.percent === 100 && stat.total > 0) {
    setTimeout(function () {
      confetti();
      chime(true);
      toast('今天的任务全部完成，太棒了！', 'ok');
      speak('太棒了！今天的任务全部完成！', prefs.voice);
    }, 120);
  }

  const hwCards = day.homeworks.map(function (h) {
    const m = C.subjectMeta(h.subject);
    return itemCard({
      kind: 'homework', id: h.id, emoji: m.emoji, color: m.color,
      subject: h.subject, title: h.title, detail: h.detail,
      done: h.done, confirmed: h.confirmed, awardedPoints: h.awardedPoints,
      undoKind: h.undoKind, undoReason: h.undoReason, works: h.works,
      attachments: h.attachments,
      points: h.points != null ? h.points : st.settings.homeworkPoints,
      speakText: h.subject + '，' + h.title + (h.detail ? '，' + h.detail : ''),
    });
  }).join('');

  /*
   * 过期的任务自动不显示（是**算出来**的，不是去改 active —— 数据一条没删，
   * 家长改个日期就复活）。
   */
  const tasks = st.dailyTasks.filter(function (t) { return C.taskActive(t, C.todayKey(), st.settings.holidays); });
  const taskCards = tasks.map(function (t) {
    const r = day.tasks[t.id] || C.emptyRecord();
    /*
     * 第 6 条：这一天的记录里有快照就按快照显示 ——
     * 家长后来改了名字 / 图标 / 分值 / 标签，历史那几天原样不动。
     */
    // 传今天：今天的卡片按当前定义显示，家长刚改的标签要立刻看到（第 73 轮）
    const v = C.taskView(t, r, C.todayKey());
    const tm = C.taskTagMeta(v.tag);
    return itemCard({
      kind: 'task', id: t.id, emoji: v.emoji, title: v.title,
      // 标签放在和作业科目**同一个位置**，样式也一样（第 2 条）
      subject: v.tag || '', color: tm.color,
      detail: t.note || '',
      // 截止日期进标签栏：长期 / 实际日期 / 已截止
      // 有效期（第 81 轮 5）：按有效期显示，多个特定日期只显示最近两个 + …
      dueLabel: C.schedLabel(t, C.todayKey()),
      done: r.done, confirmed: r.confirmed, awardedPoints: r.awardedPoints,
      undoKind: r.undoKind, undoReason: r.undoReason, works: r.works,
      attachments: t.attachments,
      points: v.points,
      speakText: v.title + (t.note ? '，' + t.note : ''),
    });
  }).join('');

  const extraCards = day.extras.map(function (e) {
    return itemCard({
      kind: 'extra', id: e.id, emoji: e.emoji, title: e.title,
      detail: e.note || '',
      done: e.done, confirmed: e.confirmed, awardedPoints: e.awardedPoints,
      undoKind: e.undoKind, undoReason: e.undoReason, works: e.works,
      attachments: e.attachments,
      points: e.points,
      speakText: e.title + (e.note ? '，' + e.note : ''),
    });
  }).join('');

  const moodRow = C.MOODS.map(function (m) {
    return '<button class="mood-btn' + (day.mood === m.emoji ? ' on' : '') + '" data-act="mood" data-emoji="' + m.emoji + '" title="' + m.label + '">' + m.emoji + '</button>';
  }).join('');

  // 今天所有任务一共值多少小红花 / 已经到账多少
  let pointTotal = 0, pointEarned = 0;
  day.homeworks.forEach(function (h) {
    pointTotal += h.points != null ? h.points : (st.settings.homeworkPoints || 0);
    if (h.awarded) pointEarned += h.awardedPoints || 0;
  });
  // 当天的满分只算"这一天还有效"的任务，过期的和已停用的都不计入
  st.dailyTasks.filter(function (t) { return C.taskActive(t, date, st.settings.holidays); }).forEach(function (t) {
    pointTotal += t.points || 0;
    const r = day.tasks[t.id];
    if (r && r.awarded) pointEarned += r.awardedPoints || 0;
  });
  day.extras.forEach(function (e) {
    pointTotal += e.points || 0;
    if (e.awarded) pointEarned += e.awardedPoints || 0;
  });
  const pointPct = pointTotal ? Math.round(pointEarned / pointTotal * 100) : 0;

  const d = C.parseDateKey(date);

  return '' +
    '<div class="hero">' +
      '<div class="hero-main">' +
        '<div class="hero-hi">' + greeting() + '，' + esc(st.settings.childName || '宝贝') + '！</div>' +
        '<div class="hero-date">' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + C.weekdayCN(date) + '</div>' +
        (st.settings.welcome ? '<div class="hero-welcome">' + esc(st.settings.welcome) + '</div>' : '') +
      '</div>' +
      '<div class="hero-right">' +
        '<div class="hero-ring" title="今天拿到的小红花">' +
          ringHTML(pointPct, '+' + pointEarned, '今日⭐', 'gold') +
          '<div class="ring-caption">共 ' + pointTotal + '⭐</div>' +
        '</div>' +
        '<div class="hero-ring" title="今天任务的完成进度">' +
          ringHTML(stat.percent, stat.percent + '%', '完成') +
          '<div class="ring-caption">' + stat.done + '/' + stat.total + ' 项</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="mood-row">' +
      '<span class="mood-label">今天心情：</span>' + moodRow +
      '<span class="spacer" style="flex:1"></span>' +
      '<button class="chip" data-act="read-all">🔊 读给我听</button>' +
    '</div>' +

    '<section class="panel">' +
      '<div class="panel-head">' +
        '<h2>📚 今天的作业</h2>' +
        '<span class="pill' + (day.homeworks.length && day.homeworks.every(function (h) { return h.done; }) ? ' ok' : '') + '">' +
          day.homeworks.filter(function (h) { return h.done; }).length + '/' + day.homeworks.length +
        '</span>' +
        '<span class="spacer"></span>' +
      '</div>' +
      '<div class="card-list">' +
        (day.homeworks.length ? hwCards : emptyBox('📭', '今天的作业还没发过来，等爸爸妈妈在钉钉上收到后发过来～')) +
      '</div>' +
    '</section>' +

    '<section class="panel">' +
      '<div class="panel-head">' +
        '<h2>🌟 每天要做的事</h2>' +
        '<span class="pill' + (tasks.length && tasks.every(function (t) { const r = day.tasks[t.id]; return r && r.done; }) ? ' ok' : '') + '">' +
          tasks.filter(function (t) { const r = day.tasks[t.id]; return r && r.done; }).length + '/' + tasks.length +
        '</span>' +
        '<span class="spacer"></span>' +
      '</div>' +
      '<div class="card-list">' + (taskCards || emptyBox('🌟', '还没有设置每日任务')) + '</div>' +
    '</section>' +

    (day.extras.length ?
      '<section class="panel">' +
        '<div class="panel-head"><h2>✨ 额外的任务</h2><span class="spacer"></span></div>' +
        '<div class="card-list">' + extraCards + '</div>' +
      '</section>' : '') +

    '<div style="margin-top:1rem">' +
      '<button class="btn ghost block" data-act="add-extra">➕ 我还有别的事想做（挣小红花）</button>' +
    '</div>' +

    (day.note ?
      '<section class="panel">' +
        '<div class="panel-head"><h2>💬 爸爸妈妈的留言</h2></div>' +
        '<div class="form-card"><p style="font-size:.95rem;white-space:pre-wrap">' + esc(day.note) + '</p></div>' +
      '</section>' : '') +

    (stat.waiting ?
      '<p class="hint" style="text-align:center;margin-top:1rem">有 ' + stat.waiting + ' 项在等爸爸妈妈确认，确认后小红花就到账啦 ⭐</p>' : '');
}

/* ---------------------------------------------------------- 小红花 */

function viewStars() {
  const st = S.state;
  const bal = st.points.balance;

  // 停用的奖励孩子这边不显示（家长那边还能重新启用）
  const availRewards = st.rewards.filter(function (r) { return r.active !== false; });
  const rewards = availRewards.map(function (r) {
    const can = bal >= r.cost;
    return '<button class="reward" data-act="redeem" data-id="' + esc(r.id) + '"' + (can ? '' : ' disabled') + '>' +
      '<span class="r-emoji">' + r.emoji + '</span>' +
      '<span class="r-title">' + esc(r.title) + '</span>' +
      '<span class="r-cost">' + r.cost + ' ⭐</span>' +
    '</button>';
  }).join('');

  const pending = st.redemptions.filter(function (r) { return r.status === 'pending'; });
  const pendingHTML = pending.map(function (r) {
    return '<div class="log-item">' +
      '<span>' + r.emoji + '</span>' +
      '<span class="log-reason">' + esc(r.title) + '</span>' +
      '<span class="badge wait">等爸爸妈妈确认</span>' +
    '</div>';
  }).join('');

  const rejected = st.redemptions.filter(function (r) { return r.status === 'rejected'; }).slice(0, 5);
  const rejectedHTML = rejected.map(function (r) {
    return '<div class="log-item">' +
      '<span>' + r.emoji + '</span>' +
      '<span class="log-reason">' + esc(r.title) +
        (r.reason ? '<div class="log-why">爸爸妈妈说：' + esc(r.reason) + '</div>' : '') +
      '</span>' +
      '<span class="badge danger">已驳回</span>' +
    '</div>';
  }).join('');

  /*
   * 已经兑现的：加上**兑现日期**（第 95 轮）。
   * 原来只有一枚「已兑现」徽章，看不出是哪天换的 ——
   * 孩子问"我那个冰淇淋是哪天吃的"就没法答。
   * 日期显示成 10/22 这种短格式（孩子页一行要塞下：图标 + 标题 + 徽章 + 日期 + 花掉的分），
   * 完整时间放在 title 里，鼠标停上去能看到。
   */
  const mdOf = function (ts) {
    const d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  };
  const doneList = st.redemptions.filter(function (r) { return r.status === 'done'; }).slice(0, 8);
  const doneHTML = doneList.map(function (r) {
    const at = r.resolvedAt || r.ts;
    return '<div class="log-item">' +
      '<span>' + r.emoji + '</span>' +
      '<span class="log-reason">' + esc(r.title) + '</span>' +
      '<span class="badge ok">已兑现</span>' +
      '<span class="log-time" title="' + esc(fullTime(at)) + '">' + mdOf(at) + '</span>' +
      '<span class="log-time">-' + r.cost + '⭐</span>' +
    '</div>';
  }).join('');

  /*
   * 第 94 轮：小红花记录支持翻页，能翻到**全部**记录。
   * 原来只 slice(0, 20) —— 家长想看"上个月那笔"根本没门。
   *
   * 每页 20 条，页码存在 S.ledgerPage（0 起）。
   * 页码要夹在合法范围里：记录被撤销/清空之后总页数会变少，
   * 停在旧页码上会看到一张空白页。
   */
  const PER_PAGE = 20;
  const totalPages = Math.max(1, Math.ceil(st.ledger.length / PER_PAGE));
  const page = Math.min(Math.max(0, S.ledgerPage || 0), totalPages - 1);
  S.ledgerPage = page;
  const pageItems = st.ledger.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  const ledger = pageItems.map(function (l) {
    const d = new Date(l.ts);
    const t = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + C.pad2(d.getHours()) + ':' + C.pad2(d.getMinutes());
    /*
     * 0 分（只留评语、不加不减）不加正负号，写成「0⭐」——
     * 写成「+0⭐」看着像加了分，其实没动。
     */
    const deltaTxt = l.delta === 0 ? '0⭐'
      : (l.delta > 0 ? '+' + l.delta : String(l.delta)) + '⭐';
    return '<div class="log-item">' +
      '<span class="log-time">' + t + '</span>' +
      '<span class="log-reason">' + esc(l.reason) + '</span>' +
      '<span class="log-delta ' + (l.delta > 0 ? 'plus' : l.delta < 0 ? 'minus' : 'zero') + '">' +
        deltaTxt + '</span>' +
    '</div>';
  }).join('');

  /* 翻页条：只有一页就不显示（别凭空多一行按钮） */
  const pager = totalPages > 1
    ? '<div class="pager">' +
        '<button class="btn ghost sm" data-act="ledger-page" data-page="' + (page - 1) + '"' +
          (page <= 0 ? ' disabled' : '') + '>← 上一页</button>' +
        '<span class="pager-info">第 ' + (page + 1) + ' / ' + totalPages + ' 页' +
          ' · 共 ' + st.ledger.length + ' 条</span>' +
        '<button class="btn ghost sm" data-act="ledger-page" data-page="' + (page + 1) + '"' +
          (page >= totalPages - 1 ? ' disabled' : '') + '>下一页 →</button>' +
      '</div>'
    : (st.ledger.length ? '<div class="pager"><span class="pager-info">共 ' +
        st.ledger.length + ' 条</span></div>' : '');

  return '' +
    '<div class="star-hero">' +
      '<div class="star-count"><span class="star-ico">⭐</span>' + bal + '</div>' +
      '<div class="star-label">我现在有这么多小红花</div>' +
      '<div class="star-stats">' +
        '<div><b>' + st.points.earned + '</b>一共赚到</div>' +
        '<div><b>' + st.points.spent + '</b>一共花掉</div>' +
        '<div><b>' + C.currentStreak(st) + '</b>连续达标（天）</div>' +
      '</div>' +
    '</div>' +

    '<section class="panel">' +
      '<div class="panel-head"><h2>🎁 可以换什么</h2><span class="spacer"></span>' +
        '<span class="hint">点一下就兑换</span></div>' +
      '<div class="reward-grid">' + (rewards || emptyBox('🎁', '还没有设置奖励，让爸爸妈妈加几个吧')) + '</div>' +
    '</section>' +

    (pending.length ? '<section class="panel"><div class="panel-head"><h2>⏳ 等着爸爸妈妈确认</h2></div>' +
      '<div class="card-list">' + pendingHTML + '</div></section>' : '') +

    (rejectedHTML ? '<section class="panel"><div class="panel-head"><h2>🙈 这次没有换成</h2></div>' +
      '<div class="card-list">' + rejectedHTML + '</div></section>' : '') +

    (doneHTML ? '<section class="panel"><div class="panel-head"><h2>✅ 已经兑现</h2></div>' +
      '<div class="card-list">' + doneHTML + '</div></section>' : '') +

    (ledger ? '<section class="panel" id="sec-ledger"><div class="panel-head"><h2>📜 小红花记录</h2>' +
        '<span class="spacer"></span>' +
        '<span class="hint">一共 ' + st.ledger.length + ' 条</span></div>' +
      '<div class="card-list">' + ledger + '</div>' + pager + '</section>' :
      '<section class="panel">' + emptyBox('🌱', '还没有小红花记录。完成作业和每日任务就能赚到啦！') + '</section>');
}

/* ---------------------------------------------------------- 这一周 */

function viewWeek() {
  const st = S.state;
  const today = C.todayKey();
  const keys = C.weekKeys(today);

  let weekEarned = 0;
  st.ledger.forEach(function (l) {
    if (keys.indexOf(l.date) >= 0 && l.delta > 0) weekEarned += l.delta;
  });

  const bars = keys.map(function (k) {
    const c = C.countDone(st, k);
    const d = C.parseDateKey(k);
    const cls = 'bar-col' + (k === today ? ' today' : '');
    return '<div class="' + cls + '">' +
      '<span class="bar-pct">' + (c.total ? c.percent + '%' : '') + '</span>' +
      '<div class="bar-track"><div class="bar-fill' + (c.percent >= 100 ? ' full' : '') + '" style="height:' + c.percent + '%"></div></div>' +
      '<span class="bar-day">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>' +
    '</div>';
  }).join('');

  const taskRows = st.dailyTasks.filter(function (t) { return !t.deleted; }).map(function (t) {
    let hit = 0;
    keys.forEach(function (k) {
      const day = C.getDay(st, k);
      const r = day.tasks[t.id];
      if (r && r.done && (r.confirmed || !st.settings.requireConfirm)) hit++;
    });
    const pct = Math.round(hit / 7 * 100);
    return '<div class="task-stat-row">' +
      '<span>' + t.emoji + '</span>' +
      '<span class="ts-name">' + esc(t.title) + '</span>' +
      '<span class="ts-bar"><i style="width:' + pct + '%"></i></span>' +
      '<span class="ts-num">' + hit + '/7</span>' +
    '</div>';
  }).join('');

  let hwTotal = 0, hwDone = 0;
  keys.forEach(function (k) {
    const day = C.getDay(st, k);
    day.homeworks.forEach(function (h) {
      hwTotal++;
      if (h.done && (h.confirmed || !st.settings.requireConfirm)) hwDone++;
    });
  });
  const hwRate = hwTotal ? Math.round(hwDone / hwTotal * 100) : 0;

  let fullDays = 0;
  keys.forEach(function (k) {
    const c = C.countDone(st, k);
    if (c.total > 0 && c.done === c.total) fullDays++;
  });

  return '' +
    '<div class="stat-grid">' +
      '<div class="stat"><div class="stat-num">' + hwRate + '%</div><div class="stat-name">作业完成率</div></div>' +
      '<div class="stat"><div class="stat-num">' + hwDone + '/' + hwTotal + '</div><div class="stat-name">作业项</div></div>' +
      '<div class="stat"><div class="stat-num">' + weekEarned + '</div><div class="stat-name">本周小红花</div></div>' +
      '<div class="stat"><div class="stat-num">' + fullDays + '</div><div class="stat-name">全勤天数</div></div>' +
    '</div>' +

    '<section class="panel">' +
      '<div class="panel-head"><h2>📈 这一周的完成情况</h2></div>' +
      '<div class="form-card"><div class="bars">' + bars + '</div></div>' +
    '</section>' +

    '<section class="panel">' +
      '<div class="panel-head"><h2>🌟 每件事坚持了几天</h2></div>' +
      '<div class="form-card">' + (taskRows || '<p class="hint">还没有每日任务</p>') + '</div>' +
    '</section>' +

    '<section class="panel">' +
      '<div class="panel-head"><h2>🏆 连续全部完成</h2></div>' +
      '<div class="form-card" style="text-align:center">' +
        '<div class="stat-num" style="font-size:2.4rem">' + C.currentStreak(st) + '</div>' +
        '<div class="hint">天连续完成全部任务</div>' +
      '</div>' +
    '</section>';
}

/* ---------------------------------------------------------- 家长端 */

/**
 * 家长端每一行：完全照孩子端「今天的作业」卡片排版 ——
 *   [图标块]  科目 + 标题
 *             详细要求（没有就不占行）
 *             积分 / 状态徽章
 *   [右边的 ↑↓ ✎ ✕ 按钮]
 */
function rowItem(o) {
  return '<div class="row-item' + (o.cls ? ' ' + o.cls : '') + '">' +
    '<div class="ri-face">' + (o.face || '📘') + '</div>' +
    '<div class="ri-main">' +
      '<div class="ri-title">' +
        (o.subject ? '<span class="ri-subj"' + (o.color ? ' style="color:' + o.color + '"' : '') + '>' +
          esc(o.subject) + '</span>' : '') +
        esc(o.title) +
      '</div>' +
      (o.note ? '<div class="ri-note-line">' + o.note + '</div>' : '') +
      /*
       * 顺序固定：标题 → 备注 → 附件 → 小红花数。
       * 附件放在小红花**上面**：家长先看"要做什么/有什么材料"，再看"值几朵花"。
       */
      (o.att || '') +
      '<div class="ri-tags">' + o.badges + '</div>' +
    '</div>' +
    '<div class="ri-tools">' + o.tools + '</div>' +
  '</div>';
}

/**
 * 一行下面的附件：家长的"要求"和孩子的"交上来"合成**一个列表**直接铺开，
 * 不再分组加「📎 要求 / 🙋 交上来的」小标题（家长说标签占地方、看着乱）。
 * 孩子交的仍然用淡绿底区分，需要分辨时一眼还是分得出。
 *
 * 这里**只展示、不带删除按钮** —— 家长要求"列表里不要直接删附件，
 * 增删都走「修改」"。所以只读，要改就去点 ✎。
 */
function attachChipsForRow(item, kind, id) {
  void kind; void id;
  const mine = C.normalizeAttachments(item.attachments);
  const works = C.normalizeAttachments(item.works);
  if (!mine.length && !works.length) return '';
  return '<div class="att-box row-att"><div class="att-list">' +
    mine.map(function (a) { return attachChip(a, { cls: 'req' }); }).join('') +
    works.map(function (a) { return attachChip(a, { cls: 'work' }); }).join('') +
  '</div></div>';
}

/**
 * 右边那一排小圆按钮：↑ ↓ [extra] ✎ ✕
 * 全站统一用 act-btn，五个模块大小一致。
 */
function rowTools(list, id, index, total, editAct, delAct, extra) {
  const upOff = index <= 0 ? ' disabled' : '';
  const downOff = index >= total - 1 ? ' disabled' : '';
  const d = ' data-list="' + list + '" data-id="' + esc(id) + '"';
  return '<button class="act-btn" data-act="move"' + d + ' data-dir="-1"' + upOff + ' title="上移">↑</button>' +
    '<button class="act-btn" data-act="move"' + d + ' data-dir="1"' + downOff + ' title="下移">↓</button>' +
    (extra || '') +
    '<button class="act-btn info" data-act="' + editAct + '" data-id="' + esc(id) + '" title="修改">✎</button>' +
    '<button class="act-btn danger" data-act="' + delAct + '" data-id="' + esc(id) + '" title="删除">✕</button>';
}

function parentItems(date) {
  const st = S.state;
  const day = C.getDay(st, date);
  const out = [];
  day.homeworks.forEach(function (h) {
    const m = C.subjectMeta(h.subject);
    out.push({ kind: 'homework', id: h.id, emoji: m.emoji, title: h.title, sub: h.subject,
      color: m.color, rec: h });
  });
  st.dailyTasks.forEach(function (t) {
    const r = day.tasks[t.id];
    if (!r) return;
    /*
     * 第 6 条：这一天有快照就按快照显示（图标 / 名字 / 标签）。
     * 家长后来改任务只影响以后，翻回历史那一天看到的还是当时的样子。
     */
    // 传这一天的日期：只有翻回**过去**的日子才用快照（第 73 轮）
    const v = C.taskView(t, r, date);
    out.push({
      kind: 'task', id: t.id, emoji: v.emoji, title: v.title,
      sub: v.tag || '任务', color: C.taskTagMeta(v.tag).color, rec: r,
    });
  });
  day.extras.forEach(function (e) {
    out.push({ kind: 'extra', id: e.id, emoji: e.emoji, title: e.title, sub: '额外',
      color: '#8a7a68', rec: e });
  });
  return out;
}

function viewParent() {
  if (!S.parentUnlocked) return viewPinGate();

  const tabs = [
    ['hw', '✏️', '录入作业'],
    ['confirm', '✅', '待确认'],
    // 任务和奖励合成一页：任务在上、奖励在下（原来是两个页签）
    ['tasks', '🌟', '任务奖励'],
    ['settings', '⚙️', '设置'],
  ];
  const sub = tabs.map(function (t) {
    return '<button class="subtab' + (S.parentTab === t[0] ? ' on' : '') + '" data-act="parent-tab" data-tab="' + t[0] + '">' +
      '<span class="ico">' + t[1] + '</span>' + t[2] + '</button>';
  }).join('');

  let body = '';
  if (S.parentTab === 'hw') body = parentHomework();
  else if (S.parentTab === 'confirm') body = parentConfirm();
  // 老版本存过 'rewards' 这个页签，进来也落到「任务奖励」上
  else if (S.parentTab === 'tasks' || S.parentTab === 'rewards') body = parentTasks() + parentRewards();
  else body = parentSettings();

  const pending = parentItems(S.date).filter(function (x) {
    return x.rec.done && !x.rec.confirmed;
  }).length + S.state.redemptions.filter(function (r) { return r.status === 'pending'; }).length;

  return '<div class="subtabs' + (pending ? '' : ' no-ask') + '">' + sub + '</div>' + askBanner(pending) + body;
}

/* ------------------------------------------------ 家长模式自动上锁 */

/*
 * 解锁期间**始终**有一个 30 秒的计时器在跑，只有两种情况会重新计时：
 *   1. 家长在家长页上有操作（点击 / 按键 / 输入）
 *   2. 切回家长页，或者页面从后台切回前台
 *
 * 于是三种"人走开了"都自然到期上锁，不用各写一套：
 *   · 离开家长页（切到「今天」这些标签）超过 30 秒
 *   · 就在家长页上晾着不动 30 秒
 *   · 切出网站 / 切到别的 App 超过 30 秒（页面隐藏期间不重置，计时照跑）
 *
 * 反过来，30 秒内切回来、或者一直在家长页上操作，都不会被踢出去。
 */
const PARENT_LOCK_MS = 30000;
let parentLockTimer = null;

/** 重新计时（家长还在，或者刚回来） */
function touchParentLock() {
  clearTimeout(parentLockTimer);
  parentLockTimer = null;
  if (!S.parentUnlocked) return;
  parentLockTimer = setTimeout(lockParentNow, PARENT_LOCK_MS);
}

/** 计时到期：上锁 */
function lockParentNow() {
  parentLockTimer = null;
  if (!S.parentUnlocked) return;
  S.parentUnlocked = false;
  S.pinInput = '';
  if (S.view === 'parent') render();
  toast('家长模式已重新上锁', 'warn');
}

/** 在家长页上、且页面可见时，任何操作都算"人还在" */
function parentIsActive() {
  return S.parentUnlocked && S.view === 'parent' && !document.hidden;
}

/**
 * 密码键盘：点击和物理键盘都走这里。
 * 支持 0-9、Backspace（删除一位）、Delete / Esc（清空）。
 */
function pinPress(k) {  if (!S.state) return;
  S.pinInput = S.pinInput || '';
  if (k === '删除') S.pinInput = S.pinInput.slice(0, -1);
  else if (k === '清空') S.pinInput = '';
  else if (/^[0-9]$/.test(String(k)) && S.pinInput.length < 4) S.pinInput += String(k);

  if (S.pinInput.length === 4) {
    if (S.pinInput === String(S.state.settings.parentPin)) {
      S.parentUnlocked = true;
      S.pinInput = '';
      touchParentLock();          // 解锁后开始 30 秒倒计时
      toast('欢迎，家长', 'ok');
    } else {
      S.pinInput = '';
      toast('密码不对，再试一次', 'err');
    }
  }
  render();
}

function viewPinGate() {
  // 3×4 排满：1-9 / 清空 0 删除。用文字而不是「⌫」，
  // 因为那个字符在很多系统字体里没有字形，会渲染成一个方框。
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '清空', 0, '删除'];
  const pad = keys.map(function (k) {
    const fn = (k === '清空' || k === '删除');
    return '<button class="' + (fn ? 'fn' : '') + '" data-act="pin-key" data-key="' + k + '">' + k + '</button>';
  }).join('');
  const dots = [0, 1, 2, 3].map(function (i) {
    return '<i class="' + (i < (S.pinInput || '').length ? 'on' : '') + '"></i>';
  }).join('');

  // 只有还是初始密码时才提示 1234；改过之后就别再写死这句话了
  const stillDefault = String((S.state && S.state.settings.parentPin) || '') === '1234';

  return '<div class="page-narrow"><div class="pin-gate">' +
    '<div class="boot-emoji">🔒</div>' +
    '<h3>家长模式</h3>' +
    '<p class="hint">请输入 4 位家长密码</p>' +
    (stillDefault
      ? '<p class="hint" style="margin:-.3rem 0 0">初始密码 <b>1234</b>，进来后建议在「基本设置」里改掉</p>'
      : '') +
    '<div class="pin-dots">' + dots + '</div>' +
    '<div class="keypad">' + pad + '</div>' +
    '<p class="hint" style="margin:.8rem 0 0">电脑上也可以直接敲数字键，' +
      'Backspace 退一位、Delete 清空</p>' +
    '</div></div>';
}

/** 本周七天的日期条，点哪天就编辑哪天；两边可以翻到上一周 / 下一周 */
function weekStrip() {
  const today = C.todayKey();
  const keys = C.weekKeys(S.date);
  const cells = keys.map(function (k) {
    const d = C.parseDateKey(k);
    const cn = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    const cls = ['wk-cell'];
    if (k === S.date) cls.push('on');
    if (k === today) cls.push('today');
    return '<button class="' + cls.join(' ') + '" data-act="date-set" data-date="' + k + '">' +
      '<em>周' + cn + '</em>' +
      '<b>' + d.getDate() + '</b>' +
      (k === today ? '<span class="wk-dot"></span>' : '') +
    '</button>';
  }).join('');

  return '<div class="week-bar">' +
      '<button class="icon-btn sm" data-act="date-shift" data-days="-7" title="往前翻一周">‹</button>' +
      '<div class="week-strip">' + cells + '</div>' +
      '<button class="icon-btn sm" data-act="date-shift" data-days="7" title="往后翻一周">›</button>' +
    '</div>' +
    '<div class="week-hint">' +
      '<span class="wk-text">' + C.friendlyDate(S.date) + ' · ' + C.weekdayCN(S.date) +
        (S.date === today ? '' : ' · 不是今天') + '</span>' +
      (S.date !== today ? '<button class="chip" data-act="date-today">回到今天</button>' : '') +
    '</div>';
}

/** 家长端顶部那条「有 N 件事等你确认」，按钮一律靠右 */
function askBanner(count) {
  if (!count) return '';
  return '<div class="form-card ask-banner" style="margin-bottom:.8rem;background:#fff8e6;border:.1rem solid #ffe0a3">' +
    '<span class="ask-text">有 <b>' + count + '</b> 件事等你确认</span>' +
    '<button class="btn primary sm" data-act="' + (S.parentTab === 'confirm' ? 'scroll-waiting' : 'parent-tab') + '"' +
      (S.parentTab === 'confirm' ? '' : ' data-tab="confirm"') + '>去确认</button>' +
  '</div>';
}

function parentHomework() {
  const st = S.state;
  const day = C.getDay(st, S.date);

  const subjectOpts = C.SUBJECTS.map(function (s) {
    return '<option value="' + esc(s.name) + '">' + s.emoji + ' ' + esc(s.name) + '</option>';
  }).join('');

  const list = day.homeworks.map(function (h, i) {
    const m = C.subjectMeta(h.subject);
    const pts = h.points != null ? h.points : (st.settings.homeworkPoints || 0);
    const badges = '<span class="badge ' + (h.done ? 'ok' : 'pts') + '">' +
        (h.done ? '✓ 完成' : '完成') + ' +' + pts + '⭐</span>' +
      (h.done && !h.confirmed ? '<span class="badge wait">⏳ 等确认</span>' : '');
    // ☆ 把这一条（含备注）存进常用作业库 / 每日任务（第 76 轮：点一下先选存哪儿）
    const star = '<button class="act-btn on" data-act="to-common" data-kind="homework"' +
      ' data-id="' + esc(h.id) + '"' +
      ' title="添加到常用">☆</button>';
    /*
     * 「复制到今天」：只有**在看别的日期**时才出现（看今天的时候复制到今天没意义）。
     * 复制过去是今天新的一条：打勾和确认状态清空、不重复发小红花。
     */
    /*
     * 「复制到今天」：只有**在看别的日期**时才出现（看今天的时候复制到今天没意义）。
     * 做成和「修改」那排一样的图标按钮 —— 文字按钮（复制到今天 = 5 个字）会把
     * 标题挤成竖排（一排 6 个控件在 375px 屏幕上放不下）。
     */
    const copy = (S.date === C.todayKey())
      ? ''
      : '<button class="act-btn info" data-act="hw-copy-one" data-id="' + esc(h.id) + '"' +
        ' title="复制到今天">📋</button>';
    return rowItem({
      cls: h.done ? 'done' : '',
      face: m.emoji,
      subject: h.subject, color: m.color, title: h.title,
      note: h.detail ? esc(h.detail) : '',
      badges: badges,
      // 附件直接铺在备注下面（一行两个），不再加「📎 要求」这类小标题
      att: attachChipsForRow(h, 'homework', h.id),
      tools: rowTools('homework', h.id, i, day.homeworks.length, 'hw-edit', 'hw-del', star + copy),
    });
  }).join('');

  // 常用作业库：按科目分组，点一下「加」就到今天
  const commonList = (st.commonHomeworks || []).map(function (ch, i) {
    const m = C.subjectMeta(ch.subject);
    return rowItem({
      cls: 'common-item',
      face: m.emoji,
      subject: ch.subject, color: m.color,
      title: ch.title,
      note: ch.detail ? esc(ch.detail) : '',
      // 库里存的附件也摆出来（点「加」时会一起带到当天）
      att: C.normalizeAttachments(ch.attachments).length
        ? '<div class="att-box row-att"><div class="att-list">' +
            C.normalizeAttachments(ch.attachments).map(function (a) {
              return attachChip(a, { cls: 'req' });
            }).join('') +
          '</div></div>'
        : '',
      badges: '',
      // 和「任务奖励」「今天的作业」用同一个 rowTools：↑↓ 排序 + ✎ ✕，
      // 尺寸和配色完全一致，不单独发明一套
      tools: rowTools('common', ch.id, i, (st.commonHomeworks || []).length,
        'common-edit', 'common-del',
        '<button class="act-btn on" data-act="common-use" data-id="' + esc(ch.id) + '"' +
          ' title="加进这一天">加</button>'),
    });
  }).join('');

  const preview = S.preview.map(function (p, i) {
    const m = C.subjectMeta(p.subject);
    return '<div class="preview-item" data-act="preview-edit" data-i="' + i + '" title="点这一条可以改">' +
      '<span class="pi-emoji">' + m.emoji + '</span>' +
      '<div class="pi-title">' + esc(p.title) +
        (p.detail ? '<div class="pi-sub">' + esc(p.detail) + '</div>' : '') + '</div>' +
      '<span class="badge soft">' + esc(p.subject) + '</span>' +
      '<button class="act-btn info" data-act="preview-edit" data-i="' + i + '" title="修改">✎</button>' +
      '<button class="act-btn danger" data-act="preview-del" data-i="' + i + '" title="不要这一条">✕</button>' +
    '</div>';
  }).join('');

  return '' +
    weekStrip() +

    '<section class="panel">' +
      /* 三种录入方式收成页签：一次只看一个，页面短很多。
         选中的那个记在 S.addTab（默认粘贴，最常用）。
         页签贴在下面的白卡上（.add-tabs 的样式），不是顶部那种导航药丸。 */
      '<div class="panel-head"><h2>✏️ 录入作业</h2></div>' +
      '<div class="subtabs add-tabs">' +
        '<button class="subtab' + (S.addTab === 'manual' || S.addTab === 'common' ? '' : ' on') +
          '" data-act="add-tab" data-tab="paste">📋 从钉钉粘贴</button>' +
        '<button class="subtab' + (S.addTab === 'manual' ? ' on' : '') + '" data-act="add-tab" data-tab="manual">' +
          '✍️ 手动加一条</button>' +
        '<button class="subtab' + (S.addTab === 'common' ? ' on' : '') + '" data-act="add-tab" data-tab="common">' +
          '⭐ 从常用作业库</button>' +
      '</div>' +

      (S.addTab === 'manual'
        ? '<div class="form-card">' +
            '<p class="hint hint-lead" style="margin-bottom:.5rem">' +
              '临时想起来的一条，直接写在这里；点击作业列表中的 ☆ 也能存进常用库或每日任务；' +
              '老师发的卷子照片、要跟读的音频作为附件上传。</p>' +
            '<div class="form-row">' +
              '<select class="field sm" id="add-subject" style="flex:0 0 7rem">' + subjectOpts + '</select>' +
              '<input class="field" id="add-title" style="min-width:9rem" placeholder="要做什么，例如：背诵第 5 课">' +
            '</div>' +
            '<div class="form-row">' +
              '<textarea class="field" id="add-detail" rows="3" maxlength="500" placeholder="备注（可留空，可以写好几行），例如：&#10;家长签字&#10;明天带红领巾"></textarea>' +
            '</div>' +
            /*
             * 附件：老师发的卷子照片、要跟读的音频、要看的视频都能挂上来，
             * 孩子那边点开就能看。文件先传上去，点「添加到这一天」时才跟着作业一起存。
             * 这里**不再单独写一句提示** —— 上面那句里已经说了"作为附件上传"，
             * 再说一遍是重复（家长要的就是合并成一句）。
             */
            draftAttachHTML() +
            '<div class="btn-row right">' +
              '<button class="btn primary sm" data-act="hw-add">添加到这一天</button>' +
              '<button class="btn ghost sm" data-act="hw-add-common">添加并存进常用库</button>' +
            '</div>' +
          '</div>'
        : (S.addTab === 'common'
          ? '<div class="form-card">' +
              '<p class="hint hint-lead" style="margin-bottom:.5rem">平时翻来覆去就那几样，先存进库里，以后点「加」就好。<br>' +
                '想往库里加新的，去「手动加一条」用「添加并存进常用库」。</p>' +
              (commonList || emptyBox('⭐', '常用作业库还是空的，先去「手动加一条」加几条吧')) +
            '</div>'
          : '<div class="form-card">' +
              '<p class="hint hint-lead" style="margin-bottom:.5rem">在钉钉里长按作业消息 → 复制 → 粘到下面，点「智能识别」。<br>' +
                '能认出「语文：…」「【数学】…」「1. 英语…」「数学作业：」这些写法。</p>' +
              '<textarea class="field" id="paste-box" placeholder="例如：&#10;语文：背诵《静夜思》，家长签字&#10;数学：口算练习册 P20&#10;英语：跟读 Unit 3，读三遍"></textarea>' +
              '<div class="btn-row right" style="margin-top:.6rem">' +
                '<button class="btn primary sm" data-act="parse">🔍 智能识别</button>' +
                '<button class="btn ghost sm" data-act="parse-add">⚡ 识别并直接添加</button>' +
              '</div>' +
              (S.preview.length ?
                '<div style="margin-top:.8rem">' +
                  '<div class="panel-head"><h2 style="font-size:.95rem">识别结果（' + S.preview.length + ' 条）</h2></div>' +
                  '<p class="hint" style="margin-bottom:.4rem">识别得不对的直接点那一条就能改，不要的点 ✕ 删掉。</p>' +
                  preview +
                  '<div class="btn-row" style="margin-top:.5rem">' +
                    '<button class="btn ok sm" data-act="preview-commit">✓ 全部添加到' + C.friendlyDate(S.date) + '</button>' +
                    '<button class="btn ghost sm" data-act="preview-clear">清空</button>' +
                  '</div>' +
                '</div>' : '') +
            '</div>')) +
    '</section>' +

    '<section class="panel">' +
      '<div class="panel-head"><h2>📚 ' + C.friendlyDate(S.date) + '的作业（' + day.homeworks.length + '）</h2>' +
      '</div>' +
      (S.date === C.todayKey()
        ? ''
        // 显式断成两行：不依赖屏幕宽度，两行的行首都由 .hint-lead 缩进到同一个位置
        : '<p class="hint hint-lead" style="margin-bottom:.5rem">这一条想留到今天做？点那一条右边的 📋（复制到今天），<br>' +
          '会作为今天的新作业加进去（打勾状态清空，不会重复发小红花）。</p>') +
      (list || emptyBox('📭', '这一天还没有作业')) +
    '</section>' +

    // 孩子自己加的「额外任务」——家长能调顺序、改内容、删掉
    (day.extras.length ?
      '<section class="panel">' +
        '<div class="panel-head"><h2>✨ 额外的任务（' + day.extras.length + '）</h2></div>' +
        '<p class="hint hint-lead extras-tip">这些是孩子自己在「今天」页加的。' +
          '不合适可编辑或删除，或者调一下顺序。</p>' +
        day.extras.map(function (e, i) {
          return rowItem({
            cls: e.done ? 'done' : '',
            face: e.emoji || '✨',
            title: e.title,
            badges: '<span class="badge ' + (e.done ? 'ok' : 'pts') + '">' +
                (e.done ? '✓ 完成' : '完成') + ' +' + (e.points || 1) + '⭐</span>' +
              (e.done && !e.confirmed ? '<span class="badge wait">⏳ 等确认</span>' : ''),
            tools: rowTools('extras', e.id, i, day.extras.length, 'extra-edit', 'extra-del'),
          });
        }).join('') +
      '</section>' : '') +

    '<section class="panel">' +
      '<div class="panel-head"><h2>💬 给孩子留句话</h2></div>' +
      '<div class="form-card">' +
        // 高度要能完整看到 placeholder 里那 4 行（实测需要 ~158px）
        // maxlength 必须和后端 day.note 的 slice(0, 300) 对齐：
        // 不加的话靠后端截断，家长写超了**尾巴会静默消失**，界面上没任何提示
        '<textarea class="field" id="note-box" maxlength="300" style="min-height:10rem" placeholder="' + NOTE_PLACEHOLDER + '">' + esc(day.note) + '</textarea>' +
        '<div class="btn-row" style="margin-top:.5rem"><button class="btn primary sm" data-act="note-save">保存留言</button></div>' +
      '</div>' +
    '</section>';
}

/** 家长端统一显示完整时间：2026-10-09 11:20:33 */
function fullTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.getFullYear() + '-' + C.pad2(d.getMonth() + 1) + '-' + C.pad2(d.getDate()) + ' ' +
    C.pad2(d.getHours()) + ':' + C.pad2(d.getMinutes()) + ':' + C.pad2(d.getSeconds());
}

function parentConfirm() {
  const st = S.state;
  const items = parentItems(S.date);
  const waiting = items.filter(function (x) { return x.rec.done && !x.rec.confirmed; });
  const done = items.filter(function (x) { return x.rec.confirmed; });
  /*
   * 撤销过的（选了理由、只写了说明、什么都没选直接撤回，或者**打勾被撤回了**）。
   *
   * 第 92 轮补上 `undoneAt`：原来只认 `undoKind/undoReason`，
   * 而「撤回打勾」这条路径只写 `undoneAt` —— 结果那样的记录
   * 待确认里没有（done=false）、已确认里也没有、已撤销里还是没有，
   * **三个列表全都不显示**，只有小红花流水里留下 +2 / -2 一对，
   * 家长看着就是"这条记录哪来的"。见 2026-10-19 的「绿豆成长日记」。
   */
  const undone = items.filter(function (x) {
    return !x.rec.done && (x.rec.undoKind || x.rec.undoReason || x.rec.undoneAt);
  });
  // 孩子提出的兑换申请也算"等家长表态"，和待确认放在一起
  const asks = st.redemptions.filter(function (r) { return r.status === 'pending'; });

  function row(x, actions) {
    return rowItem({
      cls: x.rec.confirmed ? 'done' : '',
      face: x.emoji,
      subject: x.sub, color: x.color, title: x.title,
      /*
       * 顺序按家长的要求来：标题 → 孩子传的附件 → 等确认状态和日期时间。
       * 附件放在徽章**上面**，因为"确认"之前得先看孩子交了什么。
       */
      att: C.normalizeAttachments(x.rec.works).length
        ? '<div class="att-box row-att"><div class="att-list">' +
            C.normalizeAttachments(x.rec.works).map(function (a) {
              return attachChip(a, { cls: 'work', removeAct: 'hw-att-del', itemId: x.id,
                kind: x.kind, scope: 'work' });
            }).join('') +
          '</div></div>'
        : '',
      /*
       * 这一行只有状态 + 时间两种东西，就按原样排。
       *
       * 试过在它前面补「小红花」和「📅 长期」，结果这一行放不下、
       * 时间被挤到第二行去了（待确认行右边还有两个宽按钮）。用户要的是
       * "有这几类标签时按 小红花→截止→状态 排"，这里本来就没有那两类，
       * 硬加反而把版式弄坏 —— 所以保持原样。
       */
      badges: '<span class="badge ' + (x.rec.confirmed ? 'ok' : 'wait') + '">' +
          (x.rec.confirmed ? '✓ 已确认' : '⏳ 等确认') + '</span>' +
        '<span class="ri-time">' + fullTime(x.rec.confirmedAt || x.rec.doneAt) + '</span>',
      tools: actions,
    });
  }

  const askHTML = asks.map(function (r) {
    return rowItem({
      cls: 'ask',
      face: r.emoji,
      subject: '兑换', color: '#c4841a',
      title: r.title,
      badges: '<span class="badge wait">想用 ' + r.cost + ' ⭐ 兑换</span>' +
        '<span class="ri-time">' + fullTime(r.ts) + '</span>',
      tools: '<button class="act-btn wide danger" data-act="redeem-reject" data-id="' + esc(r.id) + '" title="驳回">驳回</button>' +
        '<button class="act-btn wide on" data-act="redeem-fulfill" data-id="' + esc(r.id) + '" title="兑现">兑现</button>',
    });
  }).join('');

  const waitingHTML = waiting.map(function (x) {
    return row(x,
      '<button class="act-btn wide" data-act="undo-item" data-kind="' + x.kind + '" data-id="' + esc(x.id) + '" title="撤销">撤销</button>' +
      '<button class="act-btn wide on" data-act="confirm-item" data-kind="' + x.kind + '" data-id="' + esc(x.id) + '" title="确认">确认</button>');
  }).join('');

  const doneHTML = done.map(function (x) {
    return row(x,
      '<button class="act-btn wide info" data-act="unconfirm-item" data-kind="' + x.kind + '" data-id="' + esc(x.id) + '" title="取消确认">取消</button>');
  }).join('');

  /*
   * 已兑现的兑换也算"已确认"，但**只显示当天兑现的那些**（第 92 轮）。
   * 原来是全部列出来（还只截前 8 条），日子一长就越堆越多，
   * 家长在"今天"这一页看到一堆上个月的兑换，分不清哪些是今天的。
   * 待处理（pending）的则**一直显示**，直到家长点「兑现 / 驳回」为止。
   */
  const dayOf = function (r) { return C.dateKey(new Date(r.resolvedAt || r.ts)); };
  const doneRedeem = st.redemptions.filter(function (r) {
    return r.status === 'done' && dayOf(r) === S.date;
  });
  const doneRedeemHTML = doneRedeem.map(function (r) {
    return rowItem({
      cls: 'done',
      face: r.emoji,
      subject: '兑换', color: '#21b573',
      title: r.title,
      badges: '<span class="badge ok">✓ 已兑现</span>' +
        '<span class="ri-time">' + fullTime(r.resolvedAt || r.ts) + '</span>' +
        '<span class="ri-time">花掉 ' + r.cost + '⭐</span>',
      tools: '<button class="act-btn wide info" data-act="redeem-undo" data-id="' + esc(r.id) + '" title="退回待处理">取消</button>',
    });
  }).join('');

  const doneAll = doneHTML + doneRedeemHTML;
  const doneCount = done.length + doneRedeem.length;

  // 撤销过的：把理由摆出来，方便家长对照；「任务取消」的还能恢复
  const undoneHTML = undone.map(function (x) {
    const isCancel = x.rec.undoKind === 'cancel';
    const isRedo = x.rec.undoKind === 'redo';
    // 两个理由都没选 = 直接撤回，没有定性；连理由都没有、只有 undoneAt = 撤销时没写理由
    const hasKind = Boolean(x.rec.undoKind || x.rec.undoReason);
    const what = isCancel ? '任务取消' : isRedo ? '再完善作业'
      : hasKind ? '直接撤回' : '撤回了（没写理由）';
    return rowItem({
      cls: 'off',
      face: x.emoji,
      subject: x.sub, color: '#b8a893', title: x.title,
      note: what +
        (x.rec.undoReason ? '：' + esc(x.rec.undoReason) : '') +
        '<div class="ri-time">' + fullTime(x.rec.undoneAt) + '</div>',
      badges: '<span class="badge ' + (isCancel ? 'soft' : 'wait') + '">' +
        (isCancel ? '🚫 孩子不用再做了' : isRedo ? '🔁 孩子要重新做' : '↩️ 孩子回到没做的状态') + '</span>',
      tools: '<button class="act-btn wide info" data-act="restore-item" data-kind="' + x.kind +
        '" data-id="' + esc(x.id) + '" title="恢复成普通状态">恢复</button>',
    });
  }).join('');

  // 「有 N 件事等你确认」那条横幅由 viewParent 统一渲染，这里不用再放一遍
  return weekStrip() +
    (asks.length ?
      '<section class="panel">' +
        '<div class="panel-head"><h2>🎁 孩子想兑换（' + asks.length + '）</h2></div>' +
        askHTML +
      '</section>' : '') +
    '<section class="panel" id="sec-waiting">' +
      '<div class="panel-head"><h2>⏳ 待确认（' + waiting.length + '）</h2><span class="spacer"></span>' +
        (waiting.length ? '<button class="chip ok" data-act="confirm-all">✓ 全部确认</button>' : '') +
      '</div>' +
      (waitingHTML || emptyBox('👍', '孩子还没有新完成的作业或任务')) +
    '</section>' +
    (undone.length ?
      '<section class="panel" id="sec-undone">' +
        '<div class="panel-head"><h2>🔄 已撤销（' + undone.length + '）</h2></div>' +
        '<p class="hint hint-lead" style="margin-bottom:.5rem">理由孩子那边也看得到。' +
          '「任务取消」的孩子做不了，「再完善」的孩子能重新做。</p>' +
        undoneHTML +
      '</section>' : '') +
    '<section class="panel">' +
      '<div class="panel-head"><h2>✅ 已确认（' + doneCount + '）</h2></div>' +
      (doneAll || emptyBox('✅', '还没有已确认的作业或任务')) +
    '</section>' +
    // 评价放在最后：先把当天的事确认完，再回过头来写评价
    reviewPanel();
}

/**
 * 「今日学习评价」——家长根据当天表现写一段话，顺手奖励或扣除小红花。
 *
 * 分值可以填负数（扣分）。改来改去不会算重复：core 里的 day.review
 * 会先把上一次的加减撤回再应用新的。
 *
 * 显示的加减一律「符号在前」（+2 / -1），不再写成「扣除 -1」——
 * 「扣除 + 负数」看着像绕口令，容易读反。
 */
function reviewPanel() {
  const day = C.getDay(S.state, S.date);
  const rv = day.review;
  const pts = rv ? (Number(rv.points) || 0) : 0;
  const ptsTxt = pts === 0 ? '不加减' : (pts > 0 ? '+' + pts : String(pts)) + ' ⭐';

  return '<section class="panel">' +
    '<div class="panel-head"><h2>📝 今日学习评价</h2><span class="spacer"></span>' +
      (rv && (rv.text || pts)
        ? '<button class="chip info" data-act="review-edit">修改</button>'
        : '') +
    '</div>' +
    (rv && (rv.text || pts)
      ? '<div class="form-card">' +
          '<p class="review-text">' + esc(rv.text || '（没写评语）') + '</p>' +
          '<div class="btn-row" style="margin-top:.5rem">' +
            '<span class="badge ' + (pts > 0 ? 'ok' : (pts < 0 ? 'wait' : 'soft')) + '">' + ptsTxt + '</span>' +
            '<span class="ri-time" style="margin-left:auto">' + fullTime(rv.at) + '</span>' +
          '</div>' +
        '</div>'
      : '<div class="form-card">' +
          '<p class="hint hint-lead" style="margin-bottom:.5rem">' +
            '可以从这几方面写：<b>自主性</b>、<b>态度</b>、<b>注意力</b>、<b>易错内容</b>、<b>后续建议</b>。</p>' +
          // 高度要能完整看到 placeholder 里的那 6 行示例，再加半行
          // maxlength 对齐后端 day.review 的 slice(0, 300)，别让尾巴被静默切掉
          '<textarea class="field" id="review-box" maxlength="300" style="min-height:10.5rem" ' +
            'placeholder="例如：&#10;自主性：回家先自己拿出作业本，不用催&#10;态度：写字有点急&#10;注意力：中间起来喝水两次&#10;易错：b / d 又混了&#10;建议：明天先读一遍再写"></textarea>' +
          '<div class="review-points-row">' +
            '<label>小红花</label>' +
            numBox({ id: 'review-points', value: '0', min: -50, max: 50,
              title: '正数是奖励，负数是扣除，填 0 就是只写评语' }) +
            '<span class="hint" title="正数是奖励、负数是扣除、填 0 就是只写评语">正数奖、负数扣、0不变</span>' +
            '<button class="btn primary sm" data-act="review-save">保存评价</button>' +
          '</div>' +
        '</div>') +
  '</section>';
}


function parentTasks() {
  const st = S.state;
  const today = C.todayKey();
  /*
   * 已软删除的任务不在列表里显示（第 91 轮）。注意**不能先 filter 再 map** ——
   * ↑↓ 按钮用的是 map 出来的下标 i，过滤掉会让下标错位、点了排错条。
   * 所以照旧 map（拿到正确的 i），返回 null 标记已删除，最后 filter 掉。
   */
  const rows = st.dailyTasks.map(function (t, i) {
    if (t.deleted) return null;
    const off = t.active === false;              // 家长手动停用
    /*
     * 第 81 轮：**今天在不在有效期内**决定它显不显示给孩子（第 2/3 条）。
     * 不在有效期 → 显示成「停用」（灰掉），但数据一条都不删。
     */
    const inSched = C.taskActiveOn(t, today, st.settings.holidays);
    const pausedBySched = !off && !inSched;
    const tm = C.taskTagMeta(t.tag);
    // 「停用」也是动作按钮之一，跟 ↑↓✎✕ 排在同一行同一尺寸
    const toggle = '<button class="act-btn' + (off ? ' info' : '') + '" data-act="task-toggle"' +
      ' data-id="' + esc(t.id) + '" title="' + (off ? '点击启用' : '点击停用') + '">' +
      (off ? '启' : '停') + '</button>';
    /*
     * 标签放在和作业科目**同一个位置**（rowItem 的 subject），样式也一样。
     * 状态不再顶掉标签，改成标签栏里的一枚小牌子 ——
     * 这样"这条是什么类别的"和"它现在什么状态"能同时看到。
     */
    let badges = '<span class="badge pts">完成 +' + t.points + '⭐</span>';
    // 有效期（第 81 轮 5）：按有效期显示，多个特定日期只显示最近两个 + …
    const schedText = C.schedLabel(t, today);
    badges += '<span class="badge soft">📅 ' + esc(schedText) + '</span>';
    if (off) badges += '<span class="badge wait">已停用</span>';
    else if (pausedBySched) badges += '<span class="badge soft">今天不在有效期</span>';
    return rowItem({
      cls: (off || pausedBySched) ? 'off' : '',
      face: t.emoji,
      title: t.title,
      note: t.note ? esc(t.note) : '',
      subject: t.tag || '', color: tm.color,
      // 附件铺在备注下面（一行两个），位置和作业行完全一样（第 75 轮 1）
      att: attachChipsForRow({ attachments: t.attachments, works: [] }, 'task', t.id),
      badges: badges,
      tools: rowTools('tasks', t.id, i, st.dailyTasks.length, 'task-edit', 'task-del',
        // ☆ 添加到常用（第 76 轮 1）：任务列表里也能存 —— 存进常用库，或者再复制一条每日任务
        '<button class="act-btn on" data-act="to-common" data-kind="task" data-id="' +
          esc(t.id) + '" title="添加到常用">☆</button>' + toggle),
    });
  }).filter(Boolean).join('');

  return '<section class="panel">' +
    '<div class="panel-head"><h2>🌟 每天的固定任务</h2><span class="spacer"></span>' +
      '<button class="btn primary sm" data-act="task-add">➕ 新增</button></div>' +
    '<p class="hint hint-lead" style="margin-bottom:.6rem">这些任务会按这个顺序出现在孩子的页面上：' +
      '功课 → 生活 → 精神 → 自己加的标签。<br>' +
      '↑↓ 调顺序，✎ 改内容，✕ 删掉，「停用」是暂时不显示、以后还能用。<br>' +
      '「有效期」默认长期。可以设成：具体某几天 / 每周几、法定节假日 / 一段日期 —— ' +
      '不在有效期的那天就自动不显示，<b>历史记录一条都不删</b>，翻回去看还是有的。</p>' +
    (rows || emptyBox('🌟', '还没有每日任务')) +
    '</section>';
}

function parentRewards() {
  const st = S.state;
  const rows = st.rewards.map(function (r, i) {
    const off = r.active === false;
    // 「停用」跟每日任务那边完全一样：同一个 .act-btn、同一个位置、同一套文字
    const toggle = '<button class="act-btn' + (off ? ' info' : '') + '" data-act="reward-toggle"' +
      ' data-id="' + esc(r.id) + '" title="' + (off ? '点击启用' : '点击停用') + '">' +
      (off ? '启' : '停') + '</button>';
    return rowItem({
      cls: off ? 'off' : '',
      face: r.emoji,
      title: r.title,
      subject: off ? '已停用' : '', color: '#b8a893',
      badges: '<span class="badge pts">需要 ' + r.cost + ' ⭐</span>',
      tools: rowTools('rewards', r.id, i, st.rewards.length, 'reward-edit', 'reward-del', toggle),
    });
  }).join('');

  const pending = st.redemptions.filter(function (r) { return r.status === 'pending'; });
  const pendingHTML = pending.map(function (r) {
    return rowItem({
      cls: 'ask',
      face: r.emoji,
      subject: '兑换', color: '#c4841a', title: r.title,
      note: fullTime(r.ts),
      badges: '<span class="badge wait">孩子想用 ' + r.cost + ' ⭐ 兑换</span>',
      tools: '<button class="act-btn wide danger" data-act="redeem-reject" data-id="' + esc(r.id) + '" title="驳回">驳回</button>' +
        '<button class="act-btn wide on" data-act="redeem-fulfill" data-id="' + esc(r.id) + '" title="兑现">兑现</button>',
    });
  }).join('');

  const offCount = st.rewards.filter(function (r) { return r.active === false; }).length;

  return '<section class="panel">' +
      '<div class="panel-head">' +
        '<h2>🎁 奖励清单</h2>' +
        '<span class="spacer"></span>' +
        '<button class="btn primary sm" data-act="reward-add">➕ 新增</button>' +
      '</div>' +
      '<p class="hint hint-lead" style="margin-bottom:.6rem">孩子攒够小红花就能自己兑换，你收到通知后兑现。<br>' +
        '「停用」是暂时不给孩子看到，以后还能启用；' +
        '<b>已经拿到的小红花和兑奖记录都不受影响</b>。</p>' +
      (rows || emptyBox('🎁', '还没有奖励')) +
      (offCount ? '<p class="hint" style="margin-top:.5rem">已停用 ' + offCount + ' 个，孩子那边看不到。</p>' : '') +
    '</section>' +
    (pending.length ? '<section class="panel">' +
      '<div class="panel-head"><h2>⏳ 孩子想兑换（' + pending.length + '）</h2></div>' +
      pendingHTML + '</section>' : '');
}

/** 房间列表里的时间：今天只显示时分，别的显示月日 */
function shortTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = C.pad2(d.getHours()) + ':' + C.pad2(d.getMinutes());
  return sameDay ? ('今天 ' + hm) : ((d.getMonth() + 1) + '月' + d.getDate() + '日');
}

/** 设置页最上面那块「🏠 房间」 */
function roomSection() {
  const st = S.state;
  const currentName = C.roomNameOf(st);
  const link = location.origin + location.pathname + '?room=' + S.room;

  /* ---- 房间列表 ---- */
  let listHTML = '';
  const local = knownRooms();
  const admin = S.adminState;

  // 进这个页面就自动拉一次（列表是开放的，不需要任何口令）
  if (admin == null && !S.adminLoading) {
    S.adminLoading = true;
    setTimeout(loadAdminState, 0);
  }

  if (S.roomListLoading || (admin == null && S.roomList == null)) {
    listHTML = '<p class="hint">正在读取房间列表…</p>';
  } else if (S.roomList && S.roomList.length) {
    const only = S.roomList.length <= 1;
    const list = currentFirst(S.roomList);
    const mine = list.filter(function (r) { return r.code === S.room; });
    const others = list.filter(function (r) { return r.code !== S.room; });
    const open = Boolean(S.othersOpen);

    // 正在使用的那个永远摊开，它的中间区域就是"展开 / 收起其他房间"的开关
    listHTML = mine.map(function (r) {
      return roomRow(r, 'server', only, others.length > 0);
    }).join('');

    if (others.length) {
      if (open) {
        // 展开：所有房间都是完整的一行，能改能删能切
        listHTML += '<div class="room-others">' +
          others.map(function (r) { return roomRow(r, 'server', only); }).join('') +
        '</div>';
      } else {
        // 折叠：一摞压在正在使用的下面，最多露 3 张，越往下越淡
        listHTML += '<div class="room-stack">' +
          others.slice(0, 3).map(function (r) {
            return '<button class="room-peek" data-act="room-switch" data-code="' + esc(r.code) + '"' +
              ' title="切到「' + esc(r.name || r.code) + '」">' +
              '<span class="rp-name">' + esc(r.name || r.code) + '</span>' +
              '<code>' + esc(r.code) + '</code>' +
            '</button>';
          }).join('') +
        '</div>' +
        (others.length > 3
          ? '<p class="hint" style="text-align:center;margin:.45rem 0 0">还有 ' +
            (others.length - 3) + ' 个房间，点上面那张卡片展开</p>'
          : '');
      }
    }
  } else if (S.roomList) {
    listHTML = '<p class="hint">服务器上只有这一个房间。</p>';
  } else if (local.length) {
    // 连不上服务器，退回到「这台设备见过的房间」
    listHTML = currentFirst(local).map(function (r) { return roomRow(r, 'local', true); }).join('') +
      '<p class="hint">连不上服务器，上面是这台设备进过的房间。</p>';
  } else {
    listHTML = '<p class="hint">读不到房间列表：' + esc(S.roomListErr || '未知原因') + '</p>';
  }

  return '<section class="panel">' +
    '<div class="panel-head">' +
      '<h2>🏠 房间</h2>' +
      '<span class="spacer"></span>' +
      '<button class="btn primary sm" data-act="room-new" title="新建一个房间">➕ 新建</button>' +
      '<button class="btn ghost sm" data-act="room-refresh" title="刷新房间列表">↻ 刷新</button>' +
      '<button class="btn ghost sm" data-act="admin-key" title="设置/修改删除房间时的口令">🔐 口令</button>' +
    '</div>' +
    '<p class="hint hint-lead" style="margin-bottom:.6rem">每个房间是一份独立的数据。</p>' +

    '<div class="form-card">' +
      '<div class="form-row"><label>房间名</label>' +
        '<input class="field" id="set-roomname" maxlength="24" value="' + esc(st.settings.roomName || '') + '" ' +
          'placeholder="' + esc(currentName) + '"></div>' +
      '<div class="form-row"><label>孩子名字</label>' +
        '<input class="field" id="set-childname" maxlength="12" value="' + esc(st.settings.childName || '') + '">' +
        '<button class="btn primary sm" data-act="room-save-mine">保存</button></div>' +

      '<div class="share-box" style="margin-top:.7rem"><b>房间码：' + esc(S.room) + '</b><br>' + esc(link) + '</div>' +
      '<div class="btn-row" style="margin-top:.6rem">' +
        '<button class="btn primary sm" data-act="copy-link">📋 复制网址</button>' +
        '<button class="btn ghost sm" data-act="copy-room">复制房间码</button>' +
      '</div>' +
    '</div>' +

    '<div class="panel-head indent-1" style="margin-top:1rem">' +
      '<h2 style="font-size:.95rem">房间列表</h2>' +
    '</div>' +
    listHTML +
  '</section>';
}

/** 正在使用的那个房间排到最前面（其余保持服务器给的顺序） */
function currentFirst(list) {
  return (list || []).slice().sort(function (a, b) {
    if (a.code === S.room) return -1;
    if (b.code === S.room) return 1;
    return 0;
  });
}

/**
 * 房间列表里的一行。
 *   toggle=true 时，左边的中间区域变成「展开 / 收起其他房间」的开关
 *   （正在使用的那一行才传 true）。
 */
function roomRow(r, src, onlyOne, toggle) {
  const on = r.code === S.room;
  const url = location.origin + location.pathname + '?room=' + r.code;
  const localOnly = src === 'local';

  // 正在使用的 / 只剩一个的都不给删：按钮灰掉，鼠标停上去说明原因
  let del = '';
  if (localOnly) {
    del = '';
  } else if (on) {
    del = '<button class="room-act danger" disabled title="正在使用的房间不能删除，先切到别的房间">删除</button>';
  } else if (onlyOne) {
    del = '<button class="room-act danger" disabled title="至少要保留一个房间">删除</button>';
  } else {
    del = '<button class="room-act danger" data-act="room-del" data-code="' + esc(r.code) + '"' +
      ' data-name="' + esc(r.name || '') + '">删除</button>';
  }

  return '<div class="room-row' + (on ? ' on' : '') + '"' +
      ' data-src="' + src + '" data-code="' + esc(r.code) + '">' +

    '<div class="rr-main' + (toggle ? ' rr-toggle' : '') + '"' +
      (toggle ? ' data-act="room-toggle-others" title="展开 / 收起其他房间"' : '') + '>' +
      '<div class="rr-head">' +
        '<div class="rr-name">' +
          // caret 跟名字包在同一个 inline 里，不然它会被 flex-wrap 挤到下一行
          '<span class="rr-text">' + esc(r.name || r.code) +
            (toggle ? ' <i class="rr-caret">' + (S.othersOpen ? '▴' : '▾') + '</i>' : '') +
          '</span>' +
          (on ? '<span class="badge ok">正在使用</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="rr-sub">' +
        '<code>' + esc(r.code) + '</code>' +
        (localOnly
          ? '<span class="ri-time">本机记过的房间</span>'
          : '<span class="ri-time">' + esc(shortTime(r.updatedAt) || '还没动过') + '</span>' +
            '<span class="ri-time">' + (r.balance || 0) + '⭐</span>') +
      '</div>' +
    '</div>' +

    '<div class="rr-tools">' +
      '<button class="room-act" data-act="room-copy" data-url="' + esc(url) + '">复制网址</button>' +
      (localOnly ? '' :
        '<button class="room-act" data-act="room-edit" data-code="' + esc(r.code) + '"' +
          ' data-name="' + esc(r.name || '') + '" data-child="' + esc(r.childName || '') + '">编辑</button>' +
        del +
        (on ? '' : '<button class="room-act on" data-act="room-switch" data-code="' + esc(r.code) + '">切换</button>')) +
    '</div>' +
  '</div>';
}

/** 房间列表里点 ✎：改别的房间的房间名 / 孩子名字 */
function openRoomEditModal(code, name, child) {
  const box = document.createElement('div');

  function row(html) {
    const d = document.createElement('div');
    d.className = 'form-row';
    d.innerHTML = html;
    return d;
  }

  const nameRow = row('<label>房间名</label>' +
    '<input class="field" id="re-name" maxlength="24" placeholder="留空就跟着孩子名字走">');
  nameRow.querySelector('#re-name').value = name || '';
  const childRow = row('<label>孩子名字</label>' +
    '<input class="field" id="re-child" maxlength="12" placeholder="宝贝">');
  childRow.querySelector('#re-child').value = child || '';

  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.textContent = '房间码 ' + code + ' 不能改，想换只能新建一个房间。';

  box.appendChild(nameRow);
  box.appendChild(childRow);
  box.appendChild(tip);

  openModal({
    title: '编辑房间',
    bodyNode: box,
    actions: [
      { label: '取消', cls: 'ghost', onClick: closeModal },
      {
        label: '保存',
        cls: 'primary',
        onClick: async function () {
          try {
            const j = await api('/api/room/' + encodeURIComponent(code) + '/rename?key=' +
              encodeURIComponent(adminKey()), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: nameRow.querySelector('#re-name').value.trim(),
                childName: childRow.querySelector('#re-child').value.trim(),
              }),
            });
            closeModal();
            // 改的是当前房间就顺手刷一下本地状态，顶栏和列表立刻跟上
            if (code === S.room) {
              const n = nameRow.querySelector('#re-name').value.trim();
              const c = childRow.querySelector('#re-child').value.trim() || '宝贝';
              S.state.settings.roomName = n;
              S.state.settings.childName = c;
              const me = (S.roomList || []).filter(function (r) { return r.code === S.room; })[0];
              if (me) {
                me.name = C.roomNameOf({ settings: { roomName: n, childName: c } });
                me.childName = c;
              }
              rememberRoom(S.room, C.roomNameOf({ settings: { roomName: n, childName: c } }));
            }
            toast('改好了');
            loadRoomList();
          } catch (e) {
            toast((e && e.message) || '保存失败', 'warn');
          }
        },
      },
    ],
  });
}

/** 删房间：破坏性操作。打一遍房间码；设过管理口令的话还要口令。 */
function openRoomDeleteModal(code, name) {
  const box = document.createElement('div');
  const needKey = Boolean(S.adminState && S.adminState.configured && S.adminState.source !== 'env');
  const envKey = Boolean(S.adminState && S.adminState.source === 'env');

  const p = document.createElement('p');
  p.className = 'hint';
  p.style.margin = '0 0 .6rem';
  p.innerHTML = '会把这个房间的<b>全部数据</b>（作业、小红花、兑换记录）一起删掉，' +
    '<b>删了就找不回来了</b>。<br>确定的话，把房间码 <code>' + esc(code) + '</code> 打一遍。';
  box.appendChild(p);

  const row = document.createElement('div');
  row.className = 'form-row';
  row.innerHTML = '<input class="field" id="rd-code" placeholder="' + esc(code) + '" autocapitalize="characters">';
  box.appendChild(row);
  const input = row.querySelector('#rd-code');
  input.addEventListener('input', function () {
    const c = C.normalizeRoomCode(input.value);
    if (input.value !== c) input.value = c;
  });

  let keyRow = null;
  if (needKey || envKey) {
    keyRow = document.createElement('div');
    keyRow.className = 'form-row';
    keyRow.innerHTML = '<label>管理口令</label>' +
      '<input class="field" id="rd-key" type="password" autocomplete="current-password">';
    box.appendChild(keyRow);
  }

  openModal({
    title: '删除房间' + (name ? '「' + name + '」' : ''),
    bodyNode: box,
    actions: [
      { label: '取消', cls: 'ghost', onClick: closeModal },
      {
        label: '确认删除',
        cls: 'danger',
        onClick: async function () {
          if (C.normalizeRoomCode(input.value) !== code) {
            toast('房间码没打对', 'warn');
            return;
          }
          let key = '';
          if (keyRow) {
            key = keyRow.querySelector('#rd-key').value.trim();
            if (!key) { toast('还要填管理口令', 'warn'); return; }
          } else if (!envKey) {
            key = adminKey();   // 没设口令就带空的，服务器也不会要
          }
          try {
            await api('/api/room/' + encodeURIComponent(code) + '?key=' + encodeURIComponent(key), {
              method: 'DELETE',
            });
            closeModal();
            toast('房间已删除');
            if (code === S.room) {
              // 把自己删了就退回「这台设备进过的其他房间」，没有就回首页
              const rest = knownRooms().filter(function (r) { return r.code !== code; });
              if (rest.length) {
                setTimeout(function () { switchRoom(rest[0].code); }, 600);
              } else {
                setTimeout(function () { store(LS_ROOM, ''); location.href = location.pathname; }, 600);
              }
            } else {
              loadRoomList();
            }
          } catch (e) {
            toast((e && e.message) || '删除失败', 'warn');
          }
        },
      },
    ],
  });
}

function parentSettings() {
  const st = S.state;
  const link = location.origin + location.pathname + '?room=' + S.room;
  return roomSection() + '' +
    '<section class="panel">' +
      '<div class="panel-head"><h2>🔗 让孩子看到</h2></div>' +
      '<div class="form-card">' +
        '<p class="hint hint-lead" style="margin-bottom:.5rem">把这行网址发到家里的平板/电脑上打开一次，以后直接点书签就行。<br>' +
          '同一房间码的设备看到的是同一份作业。</p>' +
        '<div class="share-box"><b>房间码：' + S.room + '</b><br>' + esc(link) + '</div>' +
        '<div class="btn-row" style="margin-top:.6rem">' +
          '<button class="btn primary sm" data-act="copy-link">📋 复制网址</button>' +
          '<button class="btn ghost sm" data-act="copy-room">复制房间码</button>' +
        '</div>' +
      '</div>' +
    '</section>' +

    '<section class="panel">' +
      '<div class="panel-head"><h2>⚙️ 基本设置</h2></div>' +
      '<div class="form-card">' +
        '<div class="form-row"><label>欢迎语</label>' +
          '<input class="field" id="set-welcome" value="' + esc(st.settings.welcome) + '"></div>' +
        '<div class="form-row num-fixed"><label>家长密码</label>' +
          // 口令就用普通单行文本框：4 位数字，加一减一没意义
          '<input class="field" id="set-pin" type="text" inputmode="numeric" maxlength="4" ' +
            'value="' + esc(st.settings.parentPin) + '">' +
          '<span class="hint">4 位数字</span></div>' +
        '<div class="form-row num-fixed"><label>作业分值</label>' +
          numBox({ id: 'set-hwpoints', value: st.settings.homeworkPoints, min: 0, max: 20,
            title: '每项作业得几朵小红花' }) +
          '<span class="hint">每项得几朵</span></div>' +
        '<div class="form-row"><label>家长确认</label>' +
          '<label class="check-line">' +
            '<input type="checkbox" id="set-confirm"' + (st.settings.requireConfirm ? ' checked' : '') + '>' +
            '<span>孩子打勾后需要家长确认才算数（关掉就是打勾立刻得分）</span></label></div>' +
        /*
         * 第 75 轮 2：上传前压一下图片。
         * 手机拍的照片动辄 3~5MB，缩到最长边 1800px 再编码一次通常只剩几百 KB，
         * 手机上看着没区别，但打开快很多。
         */
        '<div class="form-row"><label>压缩图片</label>' +
          '<label class="check-line">' +
            '<input type="checkbox" id="set-compress"' +
              (st.settings.compressImages !== false ? ' checked' : '') + '>' +
            '<span>上传照片前自动缩小（不看原图细节的话建议开着，打开快很多）</span></label></div>' +
        '<p class="hint" style="margin:.1rem 0 .5rem">' +
          '📷 <b>图片</b>：自动缩到最长边 1800px，肉眼几乎看不出差别。<br>' +
          '🎬 <b>视频、PDF、文档</b>：浏览器里没法压缩（转码要按视频时长慢慢跑，' +
          '家长等不起），会按原样上传 —— 但也支持边下边播，不用整段下完。</p>' +
        /*
         * 第 81 轮：法定节假日清单（任务有效期里可以勾「节假日」）。
         * 春节/清明/端午/中秋是农历的、还有每年调休 —— 那些算不出来，得自己加。
         */
        '<div class="form-row" style="align-items:flex-start"><label>法定节假日</label>' +
          '<textarea class="field" id="set-holidays" rows="4" ' +
            'style="font-size:.78rem;line-height:1.5" ' +
            'placeholder="一天一行，例如：&#10;2026-10-01&#10;2026-10-02">' +
            esc((st.settings.holidays || []).join('\n')) + '</textarea></div>' +
        '<p class="hint" style="margin:.1rem 0 .5rem">' +
          '一天一行（`2026-10-01` 这样）。已经填好了元旦 / 劳动节 / 国庆；<br>' +
          '春节、清明、端午、中秋是农历的，每年还有调休 —— 这些要你自己加进来，' +
          '任务有效期里勾「节假日」时才会按这份清单算。</p>' +
        '<div class="btn-row" style="margin-top:.6rem"><button class="btn primary sm" data-act="set-save">保存设置</button></div>' +
      '</div>' +
    '</section>' +

    '<section class="panel">' +
      '<div class="panel-head"><h2>⏱ 专注时间</h2></div>' +
      '<div class="form-card">' +
        '<p class="hint hint-lead" style="margin-bottom:.6rem">孩子在一项作业上点「开始专注」就开始倒计时。<br>' +
          '时间到了还没做完，会先让孩子休息一会儿，休息完自动开始下一轮。</p>' +
        '<div class="form-row num-fixed"><label>专注时长</label>' +
          numBox({ id: 'set-focus', value: st.settings.focusMinutes || 20, min: 5, max: 60,
            title: '5～60 分钟' }) +
          '<span class="hint">分钟 5～60</span></div>' +
        '<div class="form-row num-fixed"><label>休息时长</label>' +
          numBox({ id: 'set-break', value: st.settings.breakMinutes || 5, min: 1, max: 30,
            title: '1～30 分钟' }) +
          '<span class="hint">分钟 1～30</span></div>' +
        '<div class="form-row"><label>专注按钮</label>' +
          '<label class="check-line">' +
            '<input type="checkbox" id="set-focus-on"' + (st.settings.focusEnabled !== false ? ' checked' : '') + '>' +
            '<span>在没做完的卡片上显示「⏱ 开始专注」</span></label></div>' +
        '<div class="btn-row" style="margin-top:.6rem"><button class="btn primary sm" data-act="set-save">保存设置</button></div>' +
      '</div>' +
    '</section>' +

    '<section class="panel">' +
      '<div class="panel-head"><h2>💾 备份与重置</h2></div>' +
      '<div class="form-card">' +
        '<div class="btn-row">' +
          '<button class="btn sm" data-act="export">导出备份文件</button>' +
          '<button class="btn sm" data-act="import">导入备份</button>' +
        '</div>' +
        '<p class="hint" style="margin:.6rem 0"></p>' +
        '<div class="btn-row">' +
          '<button class="btn danger sm" data-act="reset-day">清空这一天的记录</button>' +
          '<button class="btn danger sm" data-act="reset-points">清空小红花</button>' +
          '<button class="btn danger sm" data-act="reset-all">全部重来</button>' +
        '</div>' +
      '</div>' +
    '</section>' +

    '<section class="panel">' +
      '<div class="panel-head"><h2>📱 这台设备</h2></div>' +
      '<div class="form-card">' +
        '<div class="form-row"><label>大字模式</label>' +
          '<label class="check-line">' +
            '<input type="checkbox" id="pref-big"' + (prefs.big ? ' checked' : '') + '>' +
            '<span>字更大、按钮更大，小朋友看得更清楚</span></label></div>' +
        '<div class="form-row"><label>语音朗读</label>' +
          '<label class="check-line">' +
            '<input type="checkbox" id="pref-voice"' + (prefs.voice ? ' checked' : '') + '>' +
            '<span>显示 🔊 按钮，可以把作业读出来</span></label></div>' +
        '<p class="hint" style="margin-top:.5rem">存储方式：' + (S.mode === 'local' ? '本机浏览器（未连服务器）' : '云端同步（' + (S.online ? '正常' : '暂时连不上，正在用本机数据') + '）') + '</p>' +
        '<div class="btn-row" style="margin-top:.5rem"><button class="btn primary sm" data-act="retry">重新连接服务器</button></div>' +
      '</div>' +
    '</section>' +
    /*
     * 版本指纹：更新过代码之后拿它对一下，就知道服务器上跑的是不是最新那份。
     * 本机算同一个指纹：node scripts/version.mjs
     */
    '<p class="hint" style="text-align:center;margin-top:1rem">前端版本 <code>' +
      esc(S.appVersion || '读取中…') + '</code></p>' +
    '<p class="hint" style="text-align:center">作业小站 · 送给一年级的小朋友 💛</p>';
}

/* ============================================================ 交互 */

function findItem(kind, id, date) {
  const day = C.getDay(S.state, date);
  if (kind === 'homework') return day.homeworks.filter(function (x) { return x.id === id; })[0] || null;
  if (kind === 'extra') return day.extras.filter(function (x) { return x.id === id; })[0] || null;
  if (kind === 'task') {
    // 每天的任务记录是"用到才建"的，还没打过勾的任务这里要给一个空的默认值，
    // 否则新的一天孩子点每日任务会完全没有反应。
    const exists = S.state.dailyTasks.some(function (x) { return x.id === id; });
    if (!exists) return null;
    return day.tasks[id] || C.emptyRecord();
  }
  return null;
}

/** 开始专注；如果已经有别的一项在专注，先问一句 */
function beginFocus(kind, id) {
  // 「任务取消」的那一项不能再做：卡片虽然点不动了，这里再兜一道
  const date = S.view === 'today' ? C.todayKey() : S.date;
  const rec = findItem(kind, id, date);
  if (rec && !rec.done && rec.undoKind === 'cancel') {
    toast('这一项爸爸妈妈取消了，不用做啦');
    return;
  }
  if (S.focus && !focusIsOn(kind, id)) {
    const on = S.focus.title;
    confirmModal('换一项专注？', '现在正在专注「' + on + '」，要换成这一项吗？', function () {
      startFocus(kind, id, 1);
    }, '换这一项');
    return;
  }
  startFocus(kind, id, 1);
}

/** 驳回兑换：可以补一句原因，孩子在小红花页会看到 */
function openRejectDialog(rd) {
  const quick = ['今天已经换过一个啦', '先把作业做完再说', '这个太贵了，再攒几朵吧', '明天再兑现好不好'];
  const body = document.createElement('div');

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.style.marginBottom = '.5rem';
  hint.textContent = '写一句原因孩子会看到，也可以直接驳回。小红花会自动退回给他。';
  body.appendChild(hint);

  const ta = document.createElement('textarea');
  ta.className = 'field';
  ta.style.minHeight = '4.2rem';
  ta.placeholder = '比如：今天已经换过冰淇淋啦，明天再换好不好';
  body.appendChild(ta);

  const chips = document.createElement('div');
  chips.className = 'btn-row';
  chips.style.marginTop = '.5rem';
  quick.forEach(function (q) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = q;
    b.addEventListener('click', function () { ta.value = q; ta.focus(); });
    chips.appendChild(b);
  });
  body.appendChild(chips);

  openModal({
    title: '驳回「' + rd.title + '」',
    bodyNode: body,
    actions: [
      { label: '再想想', cls: 'ghost', onClick: closeModal },
      {
        label: '驳回并退回小红花', cls: 'primary', onClick: function () {
          dispatch({ t: 'redeem.status', id: rd.id, status: 'rejected', reason: ta.value.trim() });
          closeModal();
          toast('已驳回，' + rd.cost + ' 朵小红花退给孩子了');
        },
      },
    ],
  });
}

function toggleItem(kind, id, date) {
  const rec = findItem(kind, id, date);
  if (!rec) return;
  if (rec.confirmed) { toast('这一项已经确认过啦，要改的话请家长在「待确认」里取消'); return; }
  const next = !rec.done;
  dispatch({ t: 'item.done', date: date, kind: kind, id: id, value: next });
  if (next) {
    chime(false);
    // 正在专注的那一项做完了，专注自动结束
    if (focusIsOn(kind, id)) {
      stopFocus('这一项完成啦，专注结束 🎉');
      confetti(45);
      chime(true);
    }
  }
}

function readAll() {
  const st = S.state;
  const date = C.todayKey();
  const day = C.getDay(st, date);
  const parts = ['今天是' + C.friendlyDate(date) + '，' + C.weekdayCN(date) + '。'];
  if (day.homeworks.length) {
    parts.push('今天的作业有' + day.homeworks.length + '项。');
    day.homeworks.forEach(function (h) {
      parts.push(h.subject + '，' + h.title + (h.detail ? '，' + h.detail : '') + '。' +
        (h.done ? '这一项已经完成了。' : ''));
    });
  } else {
    parts.push('今天的作业还没有发过来。');
  }
  // 朗读也只念"这一天还有效"的任务，过期的不念
  const tasks = st.dailyTasks.filter(function (t) { return C.taskActive(t, C.todayKey(), st.settings.holidays); });
  if (tasks.length) {
    parts.push('每天要做的事有：');
    tasks.forEach(function (t) {
      const r = day.tasks[t.id];
      parts.push(t.title + (r && r.done ? '，已完成。' : '。'));
    });
  }
  const stat = C.countDone(st, date);
  parts.push('一共' + stat.total + '项，已经完成' + stat.done + '项。' + (stat.total && stat.done === stat.total ? '太棒了！' : '继续加油！'));
  speak(parts.join(''), prefs.voice);
}

async function copyText(text, okMsg) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(okMsg || '已复制', 'ok');
  } catch (e) {
    openModal({
      title: '手动复制',
      html: '<p>浏览器不让自动复制，请长按下面的内容复制：</p><div class="share-box" style="margin-top:.6rem">' + esc(text) + '</div>',
      actions: [{ label: '好', cls: 'primary', onClick: closeModal }],
    });
  }
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ room: S.room, state: S.state }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '作业小站备份-' + C.todayKey() + '.json';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  toast('备份文件已下载', 'ok');
}

function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', function () {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        const incoming = C.normalizeState(parsed.state || parsed);
        confirmModal('导入备份', '会用备份里的内容覆盖当前小站，确定吗？', async function () {
          if (S.mode === 'local') {
            S.state = incoming;
            saveCache();
            render();
            toast('已导入', 'ok');
            return;
          }
          try {
            const j = await api('/api/state/' + S.room, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ state: incoming }),
            });
            S.state = C.normalizeState(j.state);
            saveCache();
            render();
            toast('已导入', 'ok');
          } catch (e) {
            toast('导入失败：' + e.message, 'err');
          }
        }, '导入');
      } catch (e) {
        toast('这个文件看不懂', 'err');
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

function saveSettings() {
  const pin = ($('#set-pin').value || '').replace(/\D/g, '').slice(0, 4);
  if (pin.length !== 4) { toast('家长密码要 4 位数字', 'err'); return; }
  dispatch({
    t: 'settings',
    patch: {
      welcome: $('#set-welcome').value.trim(),
      parentPin: pin,
      homeworkPoints: Number($('#set-hwpoints').value) || 0,
      requireConfirm: $('#set-confirm').checked,
      compressImages: $('#set-compress').checked,
      // 节假日清单：一天一行，去掉空行和乱写的（core 那边还会再过滤一遍）
      holidays: ($('#set-holidays').value || '').split(/[\s,，;；]+/)
        .map(function (x) { return x.trim(); })
        .filter(Boolean),
      focusMinutes: Number($('#set-focus').value) || 20,
      breakMinutes: Number($('#set-break').value) || 5,
      focusEnabled: $('#set-focus-on').checked,
    },
  });
  prefs.big = $('#pref-big').checked;
  prefs.voice = $('#pref-voice').checked;
  savePrefs();
  applyFontSize();
  render();
  toast('设置已保存', 'ok');
}

/* ---------------------------------------------------------- 事件分发 */

function onViewClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  // 卡片上的按钮不要触发"打勾"
  if (act === 'toggle' && e.target.closest('.speak-btn')) return;

  // 按域分给几个处理函数；每个函数只认自己的动作，认出来就返回 true
  const handlers = [handleKidAction, handleParentNavAction, handlePasteAction, handleHomeworkAction, handleDayAction, handleConfirmAction, handleTaskRewardAction, handleRoomAction, handleSettingsAction];
  for (let i = 0; i < handlers.length; i++) {
    if (handlers[i](act, el, e)) return;
  }
}

/* ---- 上面那个 switch 拆出来的处理函数 ---- */

/** handleKidAction：10 个动作 */
function handleKidAction(act, el, e) {
  switch (act) {
    case 'toggle': {
      const kind = el.dataset.kind;
      const id = el.dataset.id;
      const date = S.view === 'today' ? C.todayKey() : S.date;
      // 作业和每日任务都不能直接点完成，必须走专注页
      if (S.view === 'today') {
        const rec = findItem(kind, id, date);
        if (rec && rec.done) { toast('这一项已经完成了，要改请家长在「待确认」里取消'); break; }
        beginFocus(kind, id);
        break;
      }
      toggleItem(kind, id, date);
      break;
    }
    case 'speak': {
      e.stopPropagation();
      speak(el.dataset.text || '', prefs.voice);
      break;
    }
    case 'read-all': readAll(); break;
    case 'mood': {
      const day = C.getDay(S.state, C.todayKey());
      dispatch({ t: 'day.mood', date: C.todayKey(), mood: day.mood === el.dataset.emoji ? '' : el.dataset.emoji });
      break;
    }
    case 'add-extra': {
      /*
       * 孩子自己加一件事：可以写备注，但**不给改小红花**（固定 1 朵）——
       * 不然孩子会自己给自己开高分。家长在「额外的任务」里可以改分值。
       */
      formModal('加一件事', [
        { key: 'emoji', label: '图标', type: 'icon', value: '✨', picks: COMMON_ICONS },
        { key: 'title', label: '做什么', value: '', maxlength: 60, placeholder: '例如：给奶奶打个电话' },
        { key: 'note', label: '备注', type: 'textarea', rows: 2, maxlength: 500, value: '',
          placeholder: '可留空；写清楚做到什么程度算完成' },
      ], function (v) {
        if (!v.title.trim()) { toast('写点内容吧', 'err'); return; }
        dispatch({ t: 'extra.add', date: C.todayKey(), item: { id: C.newId('e'),
          emoji: v.emoji.trim() || '✨', title: v.title.trim(),
          note: v.note.trim(), points: 1,
        } });
      });
      break;
    }
    case 'redeem': {
      const r = S.state.rewards.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!r) break;
      if (S.state.points.balance < r.cost) { toast('小红花还不够哦', 'err'); break; }
      confirmModal('兑换奖励', '用 ' + r.cost + ' 朵小红花换「' + r.title + '」？', function () {
        dispatch({ t: 'redeem', id: r.id, rid: C.newId('rd') });
        confetti(40);
        toast('已告诉爸爸妈妈啦，等他们兑现 🎉', 'ok');
      }, '兑换');
      break;
    }

    /* ---- 家长端 ---- */
    case 'focus-start': {
      e.stopPropagation();
      beginFocus(el.dataset.kind, el.dataset.id);
      break;
    }
    /*
     * 孩子自己删掉刚交上去的附件（传错了、糊了、要重录）。
     * 只动"交作业"那一份，不去碰家长传的要求。
     */
    case 'focus-att-del': {
      const f = S.focus;
      if (!f) break;
      const id = el.dataset.id;
      confirmModal('删掉这个附件？', '删掉之后可以重新传。', function () {
        f.works = C.normalizeAttachments(f.works).filter(function (a) { return a.id !== id; });
        dispatch({ t: 'attach.remove', date: C.todayKey(), kind: f.kind, id: f.id, scope: 'work', fileId: id });
        updateFocusUI();
        toast('删掉了');
      }, '删掉');
      break;
    }
    case 'focus-done': {
      // 在整页专注界面里直接打勾：完成 + 结束专注 + 撒花
      const f = S.focus;
      if (!f) break;
      const rec = findItem(f.kind, f.id, C.todayKey());
      if (rec && !rec.done) toggleItem(f.kind, f.id, C.todayKey());
      else stopFocus('');
      break;
    }
    case 'focus-stop':
      stopFocus('已经结束专注');
      break;
    case 'rest-done':
      finishBreakPhase();
      break;

    default: return false;   // 不是这一组的动作
  }
  return true;
}

/** handleParentNavAction：6 个动作 */
function handleParentNavAction(act, el, e) {
  switch (act) {
    case 'parent-tab': S.parentTab = el.dataset.tab; render(); break;
    /*
     * 小红花记录翻页（第 94 轮）。翻到哪一页是纯前端状态，
     * 不写进存档 —— 换个设备/刷新一下回到第 1 页很正常，
     * 但绝不能因为"看了眼第 3 页"就把 rev 顶上去、还触发同步。
     * 越界的页码 viewStars 里会夹回来，这里只负责接收。
     */
    case 'ledger-page': {
      const p = Number(el.dataset.page);
      if (!Number.isFinite(p)) break;
      S.ledgerPage = p;
      render();
      // 翻页之后滚回记录顶部，不然还在页面下面，看不到新内容
      const box = document.getElementById('sec-ledger');
      if (box && box.scrollIntoView) box.scrollIntoView({ block: 'start' });
      break;
    }
    case 'pin-key': pinPress(el.dataset.key); break;
    case 'date-today': S.date = C.todayKey(); S.preview = []; render(); break;
    case 'date-set': {
      if (!C.isValidDateKey(el.dataset.date)) break;
      S.date = el.dataset.date;
      S.preview = [];
      render();
      break;
    }
    case 'date-shift': {
      const days = Number(el.dataset.days) || 0;
      S.date = C.shiftDate(S.date, days);
      S.preview = [];
      render();
      scrollToTop(true);
      break;
    }
    case 'scroll-waiting': {
      const sec = document.getElementById('sec-waiting');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }

    default: return false;   // 不是这一组的动作
  }
  return true;
}

/** handleHomeworkAction：12 个动作 */
/** handlePasteAction：钉钉文本 → 识别 → 预览 → 提交（5 个动作） */
function handlePasteAction(act, el, e) {
  switch (act) {
    case 'parse': case 'parse-add': {
      const box = $('#paste-box');
      const text = box ? box.value : '';
      const parsed = C.parseHomeworkText(text);
      if (!parsed.length) { toast('没认出作业内容，试试一行一条', 'err'); break; }
      if (act === 'parse') {
        S.preview = parsed;
        render();
        toast('认出了 ' + parsed.length + ' 条，确认一下再添加', 'ok');
      } else {
        commitHomework(parsed);
      }
      break;
    }
    case 'preview-del': S.preview.splice(Number(el.dataset.i), 1); render(); break;
    case 'preview-edit': {
      const i = Number(el.dataset.i);
      const p = S.preview[i];
      if (!p) break;
      e.stopPropagation();
      const fallback = C.SUBJECTS.some(function (s) { return s.name === p.rawSubject; }) ? p.rawSubject : '其他';
      const current = C.SUBJECTS.some(function (s) { return s.name === p.subject; }) ? p.subject : fallback;
      /*
       * 识别出来的这一条也能加附件（老师发的卷子照片常常就是和作业文字一起转过来的）。
       * 附件挂在这条预览上，点「全部添加」时跟着一起存。
       */
      const attNode = document.createElement('div');
      attNode.className = 'att-field';
      const renderAtt = function () {
        attNode.innerHTML = attachBox(p.attachments, {
          key: 'preview-edit', itemId: 'p' + i, kind: 'preview', scope: 'item',
          addLabel: '📎 加附件（图片 / 视频 / 文本）',
          removeAct: 'preview-att-del',
        });
        bindAttachBoxes(attNode);
      };
      pendingAttach['preview-edit'] = function (got) {
        p.attachments = C.normalizeAttachments((p.attachments || []).concat(got));
        renderAtt();
        toast('加了 ' + got.length + ' 个附件', 'ok');
      };
      renderAtt();
      formModal('修改这一条', [
        {
          key: 'subject', label: '科目', type: 'select', value: current,
          options: C.SUBJECTS.map(function (s) { return { value: s.name, label: s.emoji + ' ' + s.name }; }),
        },
        { key: 'title', label: '内容', value: p.title },
        /*
         * 备注用多行文本框，和「修改常用作业」「修改作业」保持一致。
         * 识别出来的备注有时候挺长（好几条要求），单行框根本看不全。
         */
        { key: 'detail', label: '备注', type: 'textarea', rows: 3, maxlength: 500,
          value: p.detail || '', placeholder: '可留空；可以写好几行，例如：家长签字' },
        { type: 'node', label: '附件', node: attNode },
      ], function (v) {
        if (!v.title.trim()) { toast('内容不能空着', 'err'); return; }
        S.preview[i] = {
          subject: v.subject, rawSubject: v.subject,
          title: v.title.trim(), detail: v.detail.trim(),
          attachments: C.normalizeAttachments(p.attachments),
        };
        render();
        toast('改好了', 'ok');
      });
      bindAttachBoxes(document);
      break;
    }
    /* 识别结果里删附件（还没提交，直接从预览里拿掉就行） */
    case 'preview-att-del': {
      const i = Number(el.dataset.itemid.replace(/^p/, ''));
      const p = S.preview[i];
      if (!p) break;
      p.attachments = C.normalizeAttachments(p.attachments).filter(function (a) {
        return a.id !== el.dataset.id;
      });
      const node = el.closest('.modal') ? el.closest('.modal').querySelector('.att-field') : null;
      if (node) {
        node.innerHTML = attachBox(p.attachments, {
          key: 'preview-edit', itemId: 'p' + i, kind: 'preview', scope: 'item',
          addLabel: '📎 加附件（图片 / 视频 / 文本）', removeAct: 'preview-att-del',
        });
        bindAttachBoxes(node);
      }
      toast('附件删掉了');
      break;
    }
    case 'preview-clear': S.preview = []; render(); break;
    case 'preview-commit': commitHomework(S.preview); break;
    default: return false;   // 不是这一组的动作
  }
  return true;
}

/** handleHomeworkAction：作业和额外任务的增删改 + 排序（6 个动作） */
function handleHomeworkAction(act, el, e) {
  switch (act) {
    case 'move': {
      // 自定义排序：往上 / 往下挪一格
      const list = el.dataset.list;
      dispatch({
        t: 'move',
        list: list,
        date: (list === 'homework' || list === 'extras') ? S.date : undefined,
        id: el.dataset.id,
        dir: Number(el.dataset.dir),
      });
      break;
    }    case 'add-tab': {
      const t = el.dataset.tab;
      S.addTab = (t === 'manual' || t === 'common') ? t : 'paste';
      render();
      break;
    }
    /* ---- 常用作业库 ---- */
    case 'common-use': {
      const ch = (S.state.commonHomeworks || []).filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!ch) break;
      const day = C.getDay(S.state, S.date);
      const sameTitle = day.homeworks.filter(function (h) { return h.title === ch.title; });
      /*
       * 同名的已经在今天了：
       *   · 标题和备注都一样 → 不加，只提示（避免一天里出现两条一模一样的）
       *   · 备注不一样     → 问要不要用库里的备注覆盖今天那条（「读课文 2 遍」
       *                      今天要求"家长签字"、明天要求"读给家长听"）
       */
      if (sameTitle.length) {
        const exact = sameTitle.filter(function (h) {
          return (h.detail || '') === (ch.detail || '');
        })[0];
        if (exact) {
          toast('「' + ch.title + '」今天已经有了，没有重复添加');
          break;
        }
        const cur = sameTitle[0];
        confirmModal('今天的作业里已经有同名的',
          '「' + ch.title + '」今天已经有了。\n\n今天这条：' +
          (cur.detail ? '备注：' + cur.detail : '没有备注') +
          '\n库里这条：' + (ch.detail ? '备注：' + ch.detail : '没有备注') +
          '\n\n要用库里的科目和备注覆盖今天这条吗？',
          function () {
            dispatch({ t: 'hw.update', date: S.date, id: cur.id, patch: {
              subject: ch.subject, detail: ch.detail,
              // 覆盖时也把库里的附件补上（缺的就补，已有的不重复）
              attachments: C.normalizeAttachments(
                (cur.attachments || []).concat(ch.attachments || [])),
            } });
            toast('已覆盖今天那一条', 'ok');
          }, '覆盖');
        break;
      }
      dispatch({ t: 'hw.add', date: S.date, items: [
        // 库里存的附件一起带过来（老师发的卷子照片不用每天重传）
        { id: C.newId('h'), subject: ch.subject, title: ch.title, detail: ch.detail, attachments: ch.attachments },
      ] });
      chime(true);
      toast('加好了：' + ch.title, 'ok');
      // 新加的那条在列表里可能在屏幕外，滚过去闪一下，
      // 不然家长会以为"点了没反应"然后又点一次
      flashNewest('homework', ch.title);
      break;
    }
    /*
     * 往库里加新条目的入口只有「手动加一条 → 添加并存进常用库」那一个
     * （常用库页签里那个一模一样的表单已经删掉了，避免两处重复）。
     */
    case 'common-edit': {
      const ch = (S.state.commonHomeworks || []).filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!ch) break;
      /*
       * 常用库也能存附件（第 3 条）：老师每周发的那张卷子照片、要跟读的音频
       * 存在库里，以后每天点一下「加」就一起带到当天，不用天天重传。
       */
      /* 这一层就是 .form-row 的 flex 子项，给它一个类名好在 CSS 里对齐（见 style.css 的 .att-field） */
      const attNode = document.createElement('div');
      attNode.className = 'att-field';
      const renderAtt = function () {
        attNode.innerHTML = attachBox(ch.attachments, {
          key: 'common-edit', itemId: ch.id, kind: 'common', scope: 'item',
          addLabel: '📎 加附件（图片 / 视频 / 文本）',
          removeAct: 'common-att-del',
        });
        bindAttachBoxes(attNode);
      };
      pendingAttach['common-edit'] = function (got) {
        ch.attachments = C.normalizeAttachments((ch.attachments || []).concat(got));
        dispatch({ t: 'common.update', id: ch.id, patch: { attachments: ch.attachments } });
        renderAtt();
        toast('加了 ' + got.length + ' 个附件', 'ok');
      };
      renderAtt();
      formModal('修改常用作业', [
        {
          key: 'subject', label: '科目', type: 'select', value: ch.subject,
          options: C.SUBJECTS.map(function (s) { return { value: s.name, label: s.emoji + ' ' + s.name }; }),
        },
        { key: 'title', label: '内容', maxlength: 120, value: ch.title },
        { key: 'detail', label: '备注', type: 'textarea', rows: 3, maxlength: 500, value: ch.detail },
        // 附件紧跟备注，和"修改作业"保持一致
        { type: 'node', label: '附件', node: attNode },
      ], function (v) {
        if (!v.title.trim()) { toast('内容不能空着', 'err'); return; }
        dispatch({ t: 'common.update', id: ch.id, patch: {
          subject: v.subject, title: v.title.trim(), detail: v.detail.trim(),
          attachments: ch.attachments,
        } });
        toast('改好了', 'ok');
      });
      bindAttachBoxes(document);
      break;
    }
    /* 常用库弹窗里删附件 */
    case 'common-att-del': {
      const ch = (S.state.commonHomeworks || []).filter(function (x) { return x.id === el.dataset.itemid; })[0];
      if (!ch) break;
      ch.attachments = C.normalizeAttachments(ch.attachments).filter(function (a) {
        return a.id !== el.dataset.id;
      });
      dispatch({ t: 'common.update', id: ch.id, patch: { attachments: ch.attachments } });
      toast('附件删掉了');
      break;
    }
    case 'common-del': {
      const ch = (S.state.commonHomeworks || []).filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!ch) break;
      confirmModal('从常用库里删掉', '删掉「' + ch.title + '」？今天已经加好的作业不受影响。', function () {
        dispatch({ t: 'common.remove', id: ch.id });
      }, '删除');
      break;
    }
    /*
     * 把这一条（含备注）存进常用作业库。
     * 库里有同名的话先问一句要不要覆盖 —— 同名但备注不同是很常见的
     * （「读课文 2 遍」今天要求"家长签字"、明天要求"读给家长听"）。
     */
    /*
     * ☆ 添加到常用（第 76 轮 1）：先让家长选存到哪儿 ——
     *   常用作业库：以后点一下就加好
     *   每日任务：变成天天都要做的一条（标签默认「功课」，弹窗里可以改）
     */
    case 'to-common': {
      const kind = el.dataset.kind || 'homework';
      const src = kind === 'task'
        ? (function () {
            const t = S.state.dailyTasks.filter(function (x) { return x.id === el.dataset.id; })[0];
            return t && { subject: t.tag || C.TASK_TAGS[0], title: t.title,
              detail: t.note || '', attachments: t.attachments, emoji: t.emoji, points: t.points };
          })()
        : (function () {
            const h = findItem('homework', el.dataset.id, S.date);
            return h && { subject: h.subject, title: h.title, detail: h.detail || '',
              attachments: h.attachments };
          })();
      if (!src) break;
      formModal('添加到常用', [
        { type: 'note', text: '「' + src.title + '」存起来，以后不用重复写。' },
        { key: 'dest', label: '存到哪', type: 'select', value: 'common', options: [
          { value: 'common', label: '⭐ 常用作业库（要用时点一下就加）' },
          { value: 'task', label: '📅 每日任务（天天都要做）' },
        ] },
      ], function (v) {
        if (v.dest === 'task') {
          // 从作业转成每日任务：标签默认「功课」，弹窗里能改
          openTaskForm({
            emoji: src.emoji || '🌟', title: src.title, note: src.detail,
            tag: kind === 'task' ? src.subject : C.TASK_TAGS[0],
            points: src.points != null ? src.points : (S.state.settings.homeworkPoints || 2),
            attachments: src.attachments,
          });
        } else {
          saveToCommon(src);
        }
      });
      break;
    }
    case 'hw-save-common': {
      // 老按钮保底：万一还有旧 DOM 引用它，行为等于"存进常用作业库"
      const h = findItem('homework', el.dataset.id, S.date);
      if (h) saveToCommon({ subject: h.subject, title: h.title, detail: h.detail || '',
        attachments: h.attachments });
      break;
    }
    case 'hw-add-common': {
      const subject = $('#add-subject').value;
      const title = ($('#add-title').value || '').trim();
      const detail = ($('#add-detail').value || '').trim();
      if (!title) { toast('写点内容吧', 'err'); break; }
      // 附件两边都要带走：今天的作业一份，常用库一份（以后点「加」直接有）
      const attach = S.draftAttach;
      S.draftAttach = [];
      dispatch({ t: 'hw.add', date: S.date, items: [{ id: C.newId('h'), subject: subject, title: title, detail: detail, attachments: attach }] });
      dispatch({ t: 'common.add', item: { id: C.newId('ch'), subject: subject, title: title, detail: detail, attachments: attach } });
      $('#add-title').value = '';
      $('#add-detail').value = '';
      chime(true);
      toast(attach.length ? '加好了，也存进常用库了（带 ' + attach.length + ' 个附件）' : '加好了，也存进常用库了', 'ok');
      break;
    }
    case 'hw-add': {
      const subject = $('#add-subject').value;
      const title = $('#add-title').value.trim();
      const detail = $('#add-detail').value.trim();
      if (!title) { toast('写点内容吧', 'err'); break; }
      /*
       * 草稿附件要在 dispatch **之前**清掉：
       * dispatch 内部就会 render()，清晚了界面还是重新渲染出旧附件，
       * 家长会以为"没加成功"，再点一次就加了两遍（踩过）。
       */
      const attach = S.draftAttach;
      S.draftAttach = [];
      dispatch({
        t: 'hw.add', date: S.date,
        items: [{ id: C.newId('h'), subject: subject, title: title, detail: detail, attachments: attach }],
      });
      $('#add-title').value = '';
      $('#add-detail').value = '';
      chime(true);
      toast(attach.length ? '加好了，带 ' + attach.length + ' 个附件' : '加好了', 'ok');
      break;
    }
    /* 「手动加一条」里把刚传上来的附件去掉（文件先留在服务器上，没人引用就算了） */
    case 'draft-att-del': {
      S.draftAttach = S.draftAttach.filter(function (a) { return a.id !== el.dataset.id; });
      // 同上：只刷新附件那一块，不能 render()，否则家长填的字会被清空
      refreshAttachBox('hw-add', draftAttachHTML);
      break;
    }
    /* 作业行里删掉一个附件 */
    case 'hw-att-del': {
      dispatch({
        t: 'attach.remove', date: S.date, kind: 'homework', id: el.dataset.itemid,
        scope: el.dataset.scope || 'item', fileId: el.dataset.id,
      });
      toast('附件删掉了');
      break;
    }
    /* 给已有作业补传附件（传完立刻存，不用再点保存） */
    case 'hw-att-add': {
      const input = el.querySelector('input[type="file"]');
      if (input) input.click();
      break;
    }
    case 'hw-edit': {
      const h = findItem('homework', el.dataset.id, S.date);
      if (!h) break;
      // 弹窗里的附件区：上传完立刻存到这条作业上（见 pendingAttach['hw-edit']）
      /* 这一层就是 .form-row 的 flex 子项，给它一个类名好在 CSS 里对齐（见 style.css 的 .att-field） */
      const attNode = document.createElement('div');
      attNode.className = 'att-field';
      const renderAtt = function () {
        attNode.innerHTML = attachBox(h.attachments, {
          key: 'hw-edit', itemId: h.id, kind: 'homework', scope: 'item',
          addLabel: '📎 加附件（图片 / 视频 / 文本）', removeAct: 'hw-edit-att-del',
        });
        bindAttachBoxes(attNode);
      };
      pendingAttach['hw-edit'] = function (got) {
        got.forEach(function (f) {
          dispatch({ t: 'attach.add', date: S.date, kind: 'homework', id: h.id, scope: 'item', file: f });
        });
        h.attachments = C.normalizeAttachments((h.attachments || []).concat(got));
        renderAtt();
        toast('加了 ' + got.length + ' 个附件', 'ok');
      };
      renderAtt();
      formModal('修改作业', [
        {
          key: 'subject', label: '科目', type: 'select', value: h.subject,
          options: C.SUBJECTS.map(function (s) { return { value: s.name, label: s.emoji + ' ' + s.name }; }),
        },
        { key: 'title', label: '内容', maxlength: 120, value: h.title },
        { key: 'detail', label: '备注', type: 'textarea', rows: 3, maxlength: 500, value: h.detail, placeholder: '可留空；可以写好几行' },
        // 附件紧跟备注（第 4 条：所有作业修改都是这个顺序）
        { type: 'node', label: '附件', node: attNode },
        {
          key: 'points', label: '小红花', type: 'number',
          value: h.points != null ? h.points : (S.state.settings.homeworkPoints || 0),
        },
      ], function (v) {
        dispatch({
          t: 'hw.update', date: S.date, id: h.id,
          patch: {
            subject: v.subject,
            title: v.title.trim(),
            detail: v.detail.trim(),
            points: v.points,
          },
        });
        toast('改好了', 'ok');
      });
      bindAttachBoxes(document);
      break;
    }
    /* 修改弹窗里删附件 */
    case 'hw-edit-att-del': {
      dispatch({
        t: 'attach.remove', date: S.date, kind: 'homework', id: el.dataset.itemid,
        scope: 'item', fileId: el.dataset.id,
      });
      toast('附件删掉了');
      break;
    }
    /*
     * 每日任务的附件（第 75 轮 1，和作业一样）：
     *   task-edit-att-del  → 任务已经存在，直接删
     *   task-add-att-del   → 还没保存，从草稿里拿掉就行
     */
    case 'task-edit-att-del': {
      dispatch({
        t: 'attach.remove', date: S.date, kind: 'task', id: el.dataset.itemid,
        scope: 'item', fileId: el.dataset.id,
      });
      toast('附件删掉了');
      break;
    }
    case 'task-add-att-del': {
      // 还没保存，从草稿里拿掉就行（和作业的 draft-att-del 一模一样）
      S.draftTaskAttach = (S.draftTaskAttach || []).filter(function (a) {
        return a.id !== el.dataset.id;
      });
      // 只刷新附件那一块，不能 render()，否则家长填的字会被清空
      refreshAttachBox('task-add', function () {
        return attachBox(S.draftTaskAttach, {
          key: 'task-add', addLabel: '📎 加附件（图片 / 视频 / 文本）',
          removeAct: 'task-add-att-del',
        });
      });
      break;
    }
    case 'hw-del': {
      const h = findItem('homework', el.dataset.id, S.date);
      if (!h) break;
      confirmModal('删除作业', '删掉「' + h.title + '」？', function () {
        dispatch({ t: 'hw.remove', date: S.date, id: h.id });
      }, '删除');
      break;
    }
    case 'extra-edit': {
      const day = C.getDay(S.state, S.date);
      const e = day.extras.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!e) break;
      formModal('修改这条额外任务', [
        { key: 'emoji', label: '图标', type: 'icon', value: e.emoji || '✨', picks: COMMON_ICONS },
        { key: 'title', label: '做什么', type: 'textarea', rows: 2, maxlength: 60, value: e.title },
        { key: 'points', label: '小红花', type: 'number', value: e.points, min: 0, max: 99 },
      ], function (v) {
        if (!v.title.trim()) { toast('内容不能空着', 'err'); return; }
        dispatch({
          t: 'extra.update', date: S.date, id: e.id,
          patch: { emoji: v.emoji.trim() || '✨', title: v.title.trim(), points: v.points },
        });
        toast('改好了', 'ok');
      });
      break;
    }
    case 'extra-del': {
      const day = C.getDay(S.state, S.date);
      const e = day.extras.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!e) break;
      const tip = e.confirmed
        ? '这条已经确认过、小红花也发了，删掉会把它扣回来。'
        : (e.done ? '这条孩子已经打勾了。' : '');
      confirmModal('删掉这条额外任务', '「' + e.title + '」' + (tip ? '　' + tip : ''), function () {
        dispatch({ t: 'extra.remove', date: S.date, id: e.id });
        toast('删掉了', 'ok');
      }, '删除');
      break;
    }
    default: return false;   // 不是这一组的动作
  }
  return true;
}

/** handleDayAction：整天层面：复制昨天的作业、给孩子留言（2 个动作） */
function handleDayAction(act, el, e) {
  switch (act) {
    /*
     * 把这一条复制到今天。
     * 用 day.copy 的 picks 只挑这一条：新 id、打勾和确认状态清空、
     * 不重复发小红花（积分只在 done && confirmed 跳变时才结算）。
     *
     * 第 80 轮 2：今天**已经有同名同科目**的那条时，先问要不要覆盖 ——
     * 不覆盖就直接取消，免得同一天出现两条一模一样的作业。
     */
    case 'hw-copy-one': {
      const today = C.todayKey();
      const h = findItem('homework', el.dataset.id, S.date);
      if (!h) break;
      if (S.date === today) { toast('这一条已经在今天了'); break; }
      const dup = C.getDay(S.state, today).homeworks.filter(function (x) {
        return x.subject === h.subject && x.title === h.title;
      })[0];
      const doCopy = function (overwrite) {
        dispatch({ t: 'day.copy', from: S.date, to: today,
          picks: [{ kind: 'homework', id: h.id }], overwrite: overwrite });
        chime(true);
        toast(overwrite ? '已用这条覆盖今天的「' + h.title + '」'
          : '已复制到今天：' + h.title, 'ok');
      };
      if (dup) {
        confirmModal('今天已经有一条一样的了',
          '今天已经有「' + (dup.subject || '其他') + '：' + dup.title + '」了。\n\n' +
          '要用这一天这条（备注和附件）覆盖它吗？\n' +
          '今天那条的打勾和确认状态、已经拿到的小红花都不变。',
          function () { doCopy(true); }, '覆盖');
        break;
      }
      doCopy(false);
      break;
    }
    case 'note-save': {
      dispatch({ t: 'day.note', date: S.date, note: $('#note-box').value });
      toast('留言已保存', 'ok');
      break;
    }
    default: return false;   // 不是这一组的动作
  }
  return true;
}

/** handleConfirmAction：4 个动作 */
function handleConfirmAction(act, el, e) {
  switch (act) {
    case 'review-save': {
      const box = $('#review-box');
      const ptsEl = $('#review-points');
      const text = box ? box.value.trim() : '';
      const pts = Number(ptsEl ? ptsEl.value : 0) || 0;
      if (!text && !pts) { toast('写一句评语，或者填个小红花数', 'err'); break; }
      dispatch({ t: 'day.review', date: S.date, text: text, points: pts });
      toast(pts === 0 ? '评价已保存'
        : ('评价已保存，' + (pts > 0 ? '奖励 +' + pts : String(pts)) + ' ⭐'), 'ok');
      break;
    }
    case 'review-edit': {
      const day = C.getDay(S.state, S.date);
      const rv = day.review || {};
      formModal('修改今日评价', [
        { key: 'text', label: '评语', type: 'textarea', rows: 5, maxlength: 300, value: rv.text || '',
          placeholder: '自主性 / 态度 / 注意力 / 易错内容 / 后续建议' },
        { key: 'points', label: '小红花', type: 'number', value: rv.points || 0,
          placeholder: '正数奖励、负数扣除、0 表示不改动' },
      ], function (v) {
        const pts = Number(v.points) || 0;
        dispatch({ t: 'day.review', date: S.date, text: v.text.trim(), points: pts });
        toast('改好了', 'ok');
      });
      break;
    }
    case 'confirm-item':
      dispatch({ t: 'item.confirm', date: S.date, kind: el.dataset.kind, id: el.dataset.id, value: true });
      chime(true);
      confetti(18);
      toast('已确认 +小红花到账 ⭐', 'ok');
      break;
    case 'unconfirm-item':
      dispatch({ t: 'item.confirm', date: S.date, kind: el.dataset.kind, id: el.dataset.id, value: false });
      break;
    /*
     * 撤销：先问理由。理由孩子看得到，而且决定这一项后面怎么处理
     * （任务取消 = 不用做了；再完善 = 要重做）——见 openUndoModal。
     */
    case 'undo-item': {
      const x = parentItems(S.date).filter(function (it) {
        return it.kind === el.dataset.kind && it.id === el.dataset.id;
      })[0];
      if (!x) break;
      openUndoModal(x.kind, x.id, x.title);
      break;
    }
    /* 家长反悔了：把撤销取消掉，回到普通状态 */
    case 'restore-item':
      dispatch({ t: 'item.restore', date: S.date, kind: el.dataset.kind, id: el.dataset.id });
      toast('已恢复成普通状态', 'ok');
      break;
    case 'confirm-all': {
      const waiting = parentItems(S.date).filter(function (x) { return x.rec.done && !x.rec.confirmed; });
      waiting.forEach(function (x) {
        dispatch({ t: 'item.confirm', date: S.date, kind: x.kind, id: x.id, value: true });
      });
      confetti(30);
      chime(true);
      toast('全部确认好了', 'ok');
      break;
    }

    default: return false;   // 不是这一组的动作
  }
  return true;
}

/**
 * 有效期字段在表单里是以 JSON 字符串传出来的（隐藏 input 只能存字符串），
 * 这里解析一下；解析不了就当长期，别让整个保存失败。
 */
function parseSched(v) {
  if (v && typeof v === 'object') return v;
  try {
    const o = JSON.parse(String(v || ''));
    return (o && typeof o === 'object') ? o : C.emptySched();
  } catch {
    return C.emptySched();
  }
}

/**
 * 每日任务的「有效期」字段（第 81 轮：原来的「截止」）。
 *
 * 三种写法，用一排 chip 切：
 *   · 长期            —— 天天有效（默认）
 *   · 指定日期        —— 可以加好几个具体日期，只在这些天有效
 *   · 按周几/节假日   —— 勾周几、勾节假日；再可选填一个区间（从…到…）
 *                        「X月X日到X月X日」就是这个模式不勾周几
 *
 * 真实值是一个 JSON 字符串，放在隐藏 input（`data-key="sched"`）里，
 * 由 formModal 收集、调用方 JSON.parse 一下。
 */
function schedFieldNode(task) {
  const wrap = document.createElement('div');
  wrap.className = 'sched-field';
  let cur = C.taskSched(task || {});

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.dataset.key = 'sched';
  wrap.appendChild(hidden);

  const body = document.createElement('div');
  body.className = 'sched-body';
  wrap.appendChild(body);

  const sync = function () {
    /*
     * 注意：**UI 用 cur，存出去的值用 normalizeSched(cur)**。
     * 踩过：直接 cur = normalizeSched(cur) 的话，家长把最后一个日期删掉时
     * 模式会被悄悄规整回「长期」，选日期的界面直接消失 —— 他会以为点坏了。
     * 所以界面上保持他的选择，只在保存时规整（- 空的话就是长期）。
     */
    hidden.value = JSON.stringify(C.normalizeSched(cur));
    body.innerHTML = '';

    /* ① 三个模式 */
    const modes = [
      { key: 'always', label: '长期' },
      { key: 'dates', label: '指定日期' },
      { key: 'weekdays', label: '按周几/节假日' },
    ];
    const modeRow = document.createElement('div');
    modeRow.className = 'chip-picks inline sched-modes';
    modes.forEach(function (m) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (cur.mode === m.key ? ' on' : '');
      b.textContent = m.label;
      b.addEventListener('click', function () {
        if (cur.mode === m.key) return;
        cur.mode = m.key;
        // 切过去时给个合理默认，别让"指定日期"空着（空会被规整回长期）
        if (m.key === 'dates' && !cur.dates.length) cur.dates = [C.todayKey()];
        if (m.key === 'weekdays' && !cur.days.length && !cur.from && !cur.to) {
          // 默认勾**今天这个星期几**：最可能是家长想表达的那个，也不会跟后面点的选项打架
          cur.days = [C.parseDateKey(C.todayKey()).getDay()];
        }
        sync();
      });
      modeRow.appendChild(b);
    });
    body.appendChild(modeRow);

    /* ② 指定日期：已选的列出来（可删），再加一个 */
    if (cur.mode === 'dates') {
      const list = document.createElement('div');
      list.className = 'chip-picks inline sched-dates';
      cur.dates.forEach(function (d) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip on';
        b.textContent = d.slice(5) + ' ✕';
        b.title = d + '（点一下删掉）';
        b.addEventListener('click', function () {
          cur.dates = cur.dates.filter(function (x) { return x !== d; });
          sync();
        });
        list.appendChild(b);
      });
      if (!cur.dates.length) {
        const none = document.createElement('span');
        none.className = 'hint';
        none.style.margin = '0';
        none.textContent = '还没选日期 —— 一个都不选的话会当成「长期」';
        list.appendChild(none);
      }
      const adder = document.createElement('input');
      adder.type = 'date';
      adder.className = 'field sched-date-add';
      adder.title = '选一个日期加进去';
      adder.addEventListener('change', function () {
        if (!adder.value) return;
        if (cur.dates.indexOf(adder.value) < 0) cur.dates.push(adder.value);
        /*
         * 多个指定日期**从小到大排**（第 82 轮）：不排的话就按"加的先后"显示，
         * 先加 11-01 再加 10-20 就成了「11-01、10-20」，看着很怪。
         */
        cur.dates.sort();
        sync();
      });
      const addWrap = document.createElement('span');
      addWrap.className = 'sched-add';
      addWrap.appendChild(adder);
      const tip = document.createElement('span');
      tip.className = 'att-tip';
      tip.textContent = '选个日期就加进去（可加多个）';
      addWrap.appendChild(tip);
      list.appendChild(addWrap);
      body.appendChild(list);
    }

    /* ③ 按周几/节假日：七个周几 + 节假日 + 可选区间 */
    if (cur.mode === 'weekdays') {
      const wdRow = document.createElement('div');
      wdRow.className = 'chip-picks inline sched-days';
      // 按**周一到周日**排（C.WEEKDAY_NAMES 是 0=周日 起的，这里换个顺序渲染）
      [1, 2, 3, 4, 5, 6, 0].forEach(function (i) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (cur.days.indexOf(i) >= 0 ? ' on' : '');
        b.textContent = C.WEEKDAY_NAMES[i];
        b.addEventListener('click', function () {
          if (cur.days.indexOf(i) >= 0) cur.days = cur.days.filter(function (x) { return x !== i; });
          else cur.days.push(i);
          sync();
        });
        wdRow.appendChild(b);
      });
      const hb = document.createElement('button');
      hb.type = 'button';
      hb.className = 'chip' + (cur.days.indexOf(C.HOLIDAY_KEY) >= 0 ? ' on' : '');
      hb.textContent = '节假日';
      hb.title = '在「设置 → 法定节假日」里维护的那几天';
      hb.addEventListener('click', function () {
        if (cur.days.indexOf(C.HOLIDAY_KEY) >= 0) {
          cur.days = cur.days.filter(function (x) { return x !== C.HOLIDAY_KEY; });
        } else cur.days.push(C.HOLIDAY_KEY);
        sync();
      });
      wdRow.appendChild(hb);
      body.appendChild(wdRow);

      const rangeRow = document.createElement('div');
      rangeRow.className = 'chip-picks inline sched-range';
      const from = document.createElement('input');
      from.type = 'date';
      from.className = 'field';
      from.value = cur.from || '';
      from.title = '从这天开始（可留空）';
      const to = document.createElement('input');
      to.type = 'date';
      to.className = 'field';
      to.value = cur.to || '';
      to.title = '到这天为止（可留空）';
      const dash = document.createElement('span');
      dash.className = 'sched-dash';
      dash.textContent = '～';
      const labels = function () {
        from.addEventListener('change', function () { cur.from = from.value || ''; sync(); });
        to.addEventListener('change', function () { cur.to = to.value || ''; sync(); });
      };
      labels();
      const lt = document.createElement('span');
      lt.className = 'hint';
      lt.style.margin = '0';
      lt.textContent = '不限日期就留空';
      rangeRow.appendChild(from);
      rangeRow.appendChild(dash);
      rangeRow.appendChild(to);
      rangeRow.appendChild(lt);
      body.appendChild(rangeRow);
    }
  };

  sync();
  return wrap;
}

/**
 * 「新增每日任务」的弹窗。`pre` 有值时用来预填（第 76 轮：从作业/任务转过来）。
 *
 * 要素顺序（第 66 轮 2 + 第 75 轮）：图标 → 任务 → 标签 → 备注 → 附件 → 截止 → 小红花
 */
function openTaskForm(pre) {
  const p = pre || {};
  /*
   * 附件先攒在草稿里（S.draftTaskAttach），点保存时跟着任务一起存进去。
   * 放模块级是因为"删掉一个"要在别的地方处理（见 task-add-att-del）。
   */
  S.draftTaskAttach = C.normalizeAttachments(p.attachments);
  const addAttNode = document.createElement('div');
  addAttNode.className = 'att-field';
  const renderAddAtt = function () {
    addAttNode.innerHTML = attachBox(S.draftTaskAttach, {
      key: 'task-add', addLabel: '📎 加附件（图片 / 视频 / 文本）',
      removeAct: 'task-add-att-del',
    });
    bindAttachBoxes(addAttNode);
  };
  pendingAttach['task-add'] = function (got) {
    S.draftTaskAttach = C.normalizeAttachments(S.draftTaskAttach.concat(got));
    renderAddAtt();
    toast('加了 ' + got.length + ' 个附件', 'ok');
  };
  renderAddAtt();
  formModal(p.title ? '添加到每日任务' : '新增每日任务', [
    { key: 'emoji', label: '图标', type: 'icon', value: p.emoji || '🌟', picks: COMMON_ICONS },
    { key: 'title', label: '任务', maxlength: 60, value: p.title || '', placeholder: '例如：跳绳 200 个' },
    /*
     * 从作业转过来的话，标签默认「功课」（第 76 轮 2），
     * 但这里就是普通的输入框 + 快捷选项，家长想改成「生活 / 精神」随时可以。
     */
    { key: 'tag', label: '标签', type: 'chips', inline: true, picks: C.TASK_TAGS,
      value: p.tag || C.TASK_TAGS[0], maxlength: 8, placeholder: '自己写也行' },
    { key: 'note', label: '备注', type: 'textarea', rows: 3, maxlength: 500,
      value: p.note || '', placeholder: '可留空；可以写好几行，比如做到什么程度算完成' },
    { type: 'node', label: '附件', node: addAttNode },
    { type: 'node', label: '有效期', node: schedFieldNode(p.sched) },
    { key: 'points', label: '小红花', type: 'number',
      value: p.points != null ? p.points : 2, min: 0, max: 99 },
  ], function (v) {
    if (!v.title.trim()) return;
    dispatch({
      t: 'task.add',
      item: { id: C.newId('t'), emoji: v.emoji.trim() || '🌟', title: v.title.trim(),
        tag: v.tag.trim() || C.TASK_TAGS[0], sched: parseSched(v.sched), note: v.note.trim(),
        attachments: S.draftTaskAttach, points: v.points },
    });
    S.draftTaskAttach = [];
  });
}

/**
 * 把一条作业/任务存进常用作业库。同名会先问一句要不要覆盖。
 * （原来是 ☆ 直接干的事，第 76 轮抽出来，因为 ☆ 现在要先让家长选存哪儿。）
 */
function saveToCommon(src) {
  const same = (S.state.commonHomeworks || []).filter(function (x) {
    return x.title === src.title;
  })[0];
  if (same) {
    const old = '「' + (same.subject || '其他') + '」' +
      (same.detail ? '备注：' + same.detail : '没有备注');
    const now = '「' + (src.subject || '其他') + '」' +
      (src.detail ? '备注：' + src.detail : '没有备注');
    confirmModal('常用库里已经有同名的',
      '「' + src.title + '」已经在常用库里了。\n\n库里的：' + old + '\n这一条：' + now +
      '\n\n要用这一条的科目和备注覆盖它吗？',
      function () {
        dispatch({ t: 'common.update', id: same.id,
          patch: { subject: src.subject, detail: src.detail } });
        toast('已覆盖常用库里的那一条', 'ok');
      }, '覆盖');
    return;
  }
  dispatch({ t: 'common.add', item: { id: C.newId('ch'), subject: src.subject,
    title: src.title, detail: src.detail, attachments: src.attachments } });
  toast('存进常用库了（含备注）☆', 'ok');
}

/** handleTaskRewardAction：10 个动作 */
function handleTaskRewardAction(act, el, e) {
  switch (act) {
    case 'task-add': {
      openTaskForm(null);
      break;
    }
    case 'task-edit': {
      const t = S.state.dailyTasks.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!t) break;
      /*
       * 修改时附件是**传完立刻存**的（和「修改作业」一样）——
       * 任务已经存在，不用等保存。
       */
      const attNode = document.createElement('div');
      attNode.className = 'att-field';
      const renderAtt = function () {
        attNode.innerHTML = attachBox(t.attachments, {
          key: 'task-edit', itemId: t.id, kind: 'task', scope: 'item',
          addLabel: '📎 加附件（图片 / 视频 / 文本）', removeAct: 'task-edit-att-del',
        });
        bindAttachBoxes(attNode);
      };
      pendingAttach['task-edit'] = function (got) {
        got.forEach(function (f) {
          dispatch({ t: 'attach.add', date: S.date, kind: 'task', id: t.id, scope: 'item', file: f });
        });
        t.attachments = C.normalizeAttachments((t.attachments || []).concat(got));
        renderAtt();
        toast('加了 ' + got.length + ' 个附件', 'ok');
      };
      renderAtt();
      // 和新增同一个顺序（第 66 轮 2 + 第 75 轮）
      formModal('修改每日任务', [
        { key: 'emoji', label: '图标', type: 'icon', value: t.emoji, picks: COMMON_ICONS },
        { key: 'title', label: '任务', maxlength: 60, value: t.title },
        { key: 'tag', label: '标签', type: 'chips', inline: true, picks: C.TASK_TAGS,
          value: t.tag || C.TASK_TAGS[0], maxlength: 8, placeholder: '自己写也行' },
        { key: 'note', label: '备注', type: 'textarea', rows: 3, maxlength: 500, value: t.note || '', placeholder: '可留空；可以写好几行' },
        { type: 'node', label: '附件', node: attNode },
        { type: 'node', label: '有效期', node: schedFieldNode(t) },
        { key: 'points', label: '小红花', type: 'number', value: t.points, min: 0, max: 99 },
      ], function (v) {
        dispatch({
          t: 'task.update', id: t.id,
          patch: { emoji: v.emoji.trim() || '🌟', title: v.title.trim(),
            tag: v.tag.trim() || C.TASK_TAGS[0], sched: parseSched(v.sched),
            note: v.note.trim(), points: v.points },
        });
      });
      break;
    }
    case 'task-toggle': {
      const t = S.state.dailyTasks.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!t) break;
      // 只改启用状态，不碰积分和流水 —— 之前挣到的分照旧
      dispatch({ t: 'task.update', id: t.id, patch: { active: t.active === false } });
      break;
    }
    case 'reward-toggle': {
      const r = S.state.rewards.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!r) break;
      dispatch({ t: 'reward.update', id: r.id, patch: { active: r.active === false } });
      break;
    }
    case 'task-del': {
      const t = S.state.dailyTasks.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!t) break;
      /*
       * 第 91 轮：删除改成**软删除**（只打标记），所以历史记录一定还在 ——
       * 以前完成过的那天翻回去看照样有。这里要带上 date：
       * deletedAt 由 op 带过去，客户端和服务器重放才一致（不能各自调 todayKey）。
       */
      confirmModal('删除每日任务',
        '删掉「' + t.title + '」？\n\n以前完成过的那些天**记录都保留**，' +
        '翻回去看还在；只是从今天起不再出现在任务里。',
        function () {
          dispatch({ t: 'task.remove', id: t.id, date: C.todayKey() });
        }, '删除');
      break;
    }

    case 'reward-add': {
      formModal('新增奖励', [
        { key: 'emoji', label: '图标', type: 'icon', value: '🎁', picks: COMMON_ICONS },
        { key: 'title', label: '奖励', value: '', placeholder: '例如：去公园玩一次' },
        { key: 'cost', label: '需要', type: 'number', value: 20, min: 0, max: 999 },
      ], function (v) {
        if (!v.title.trim()) return;
        dispatch({ t: 'reward.add', item: { id: C.newId('r'), emoji: v.emoji.trim() || '🎁', title: v.title.trim(), cost: v.cost } });
      });
      break;
    }
    case 'reward-edit': {
      const r = S.state.rewards.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!r) break;
      formModal('修改奖励', [
        { key: 'emoji', label: '图标', type: 'icon', value: r.emoji, picks: COMMON_ICONS },
        { key: 'title', label: '奖励', value: r.title },
        { key: 'cost', label: '需要', type: 'number', value: r.cost, min: 0, max: 999 },
      ], function (v) {
        dispatch({ t: 'reward.update', id: r.id, patch: { emoji: v.emoji.trim() || '🎁', title: v.title.trim(), cost: v.cost } });
      });
      break;
    }
    case 'reward-del': {
      const r = S.state.rewards.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!r) break;
      confirmModal('删除奖励', '删掉「' + r.title + '」？', function () {
        dispatch({ t: 'reward.remove', id: r.id });
      }, '删除');
      break;
    }
    case 'redeem-fulfill':
      dispatch({ t: 'redeem.status', id: el.dataset.id, status: 'done' });
      toast('已兑现 🎉', 'ok');
      break;
    case 'redeem-reject': {
      const rd = S.state.redemptions.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!rd) break;
      openRejectDialog(rd);
      break;
    }
    case 'redeem-undo': {
      // 已兑现的退回"孩子想兑换"，让家长重新决定
      dispatch({ t: 'redeem.status', id: el.dataset.id, status: 'pending' });
      toast('已退回待处理');
      break;
    }

    default: return false;   // 不是这一组的动作
  }
  return true;
}

/** handleRoomAction：11 个动作 */
function handleRoomAction(act, el, e) {
  switch (act) {
    case 'copy-link': copyText(location.origin + location.pathname + '?room=' + S.room, '网址已复制，发到家里设备上打开'); break;
    case 'copy-room': copyText(S.room, '房间码已复制'); break;

    /* ---- 房间管理 ---- */
    case 'room-save-mine': {
      const rn = $('#set-roomname');
      const cn = $('#set-childname');
      const name = rn ? rn.value.trim() : '';
      const child = (cn && cn.value.trim()) || '宝贝';
      dispatch({ t: 'settings', patch: { roomName: name, childName: child } });
      // 列表里那一行也得跟着变，不然它显示的还是改名之前拉下来的旧名字
      if (S.roomList) {
        const me = S.roomList.filter(function (r) { return r.code === S.room; })[0];
        if (me) {
          me.name = C.roomNameOf({ settings: { roomName: name, childName: child } });
          me.childName = child;
        }
      }
      rememberRoom(S.room, C.roomNameOf({ settings: { roomName: name, childName: child } }));
      toast('改好了');
      render();
      break;
    }
    case 'room-copy': copyText(el.dataset.url, '这个房间的网址已复制'); break;
    case 'room-toggle-others':
      S.othersOpen = !S.othersOpen;
      render();
      break;
    case 'room-edit':
      openRoomEditModal(el.dataset.code, el.dataset.name, el.dataset.child);
      break;
    case 'room-del': {
      const code = el.dataset.code;
      // 三道闸：正在用的不能删、最后一个不能删、删之前必须先有口令
      if (code === S.room) {
        toast('正在使用的房间不能删除，先切到别的房间', 'warn');
        break;
      }
      if ((S.roomList || []).length <= 1) {
        toast('至少要保留一个房间', 'warn');
        break;
      }
      if (!(S.adminState && S.adminState.configured)) {
        S.pendingDelete = { code: code, name: el.dataset.name };
        toast('删房间要先设一个管理口令');
        openAdminKeyModal();
        break;
      }
      openRoomDeleteModal(code, el.dataset.name);
      break;
    }
    case 'room-switch': switchRoom(el.dataset.code); break;
    case 'room-new': openNewRoomModal(); break;
    case 'room-refresh':
      if (S.adminState == null) loadAdminState();
      else loadRoomList();
      break;
    case 'admin-key': openAdminKeyModal(); break;
    default: return false;   // 不是这一组的动作
  }
  return true;
}

/** handleSettingsAction：7 个动作 */
function handleSettingsAction(act, el, e) {
  switch (act) {
    case 'set-save': saveSettings(); break;
    case 'export': exportBackup(); break;
    case 'import': importBackup(); break;
    case 'reset-day':
      confirmModal('清空这一天', '会删掉' + C.friendlyDate(S.date) + '的所有作业、任务和打勾记录，确定吗？', function () {
        dispatch({ t: 'reset', scope: 'day', date: S.date });
      }, '清空');
      break;
    case 'reset-points':
      confirmModal('清空小红花', '小红花余额和全部记录都会归零，确定吗？', function () {
        dispatch({ t: 'reset', scope: 'points' });
      }, '清空');
      break;
    case 'reset-all':
      confirmModal('全部重来', '作业、任务、小红花全部清空，回到刚建站的样子（设置会保留）。确定吗？', function () {
        dispatch({ t: 'reset', scope: 'all' });
      }, '全部重来');
      break;
    /*
     * 数字框的上下加减。夹在 data-min / data-max 之间（有就夹），
     * 空着当 0 处理，这样从空点一下「加」就是 1。
     */
    case 'num-step': {
      /*
       * 定位被加减的输入框：设置页那种直接给 id；表单弹窗里的输入框没有 id
       * （值是按 data-key 收的），所以退一步按 data-key 找。
       */
      const key = el.dataset.for;
      const target = document.getElementById(key) ||
        document.querySelector('.modal [data-key="' + key + '"]');
      if (!target) break;
      const delta = Number(el.dataset.delta) || 0;
      const raw = String(target.value || '').trim();
      const cur = raw === '' ? 0 : Number(raw);
      let next = (isFinite(cur) ? cur : 0) + delta;
      const min = target.dataset.min === undefined ? -9999 : Number(target.dataset.min);
      const max = target.dataset.max === undefined ? 9999 : Number(target.dataset.max);
      if (isFinite(min)) next = Math.max(min, next);
      if (isFinite(max)) next = Math.min(max, next);
      let out = String(next);
      if (target.maxLength > 0 && out.length > target.maxLength) out = out.slice(0, target.maxLength);
      target.value = out;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      break;
    }
    case 'retry':
      S.mode = 'server';
      poll().then(function () { toast(S.online ? '连上了' : '还是连不上', S.online ? 'ok' : 'err'); });
      break;
    default: return false;   // 不是这一组的动作
  }
  return true;
}

function commitHomework(items) {
  if (!items || !items.length) { toast('没有要添加的内容', 'err'); return; }
  dispatch({
    t: 'hw.add',
    date: S.date,
    items: items.map(function (p) {
      // id 由客户端先造好塞进 op —— 两边算出来的必须一样，见 core.js 的 useId
      return { id: C.newId('h'), subject: p.subject, title: p.title, detail: p.detail,
        attachments: p.attachments };
    }),
  });
  S.preview = [];
  const box = $('#paste-box');
  if (box) box.value = '';
  chime(true);
  toast('已添加到' + C.friendlyDate(S.date) + ' 🎉', 'ok');
}

function onChange(e) {
  const id = e.target.id;
  if (id === 'pref-big') { prefs.big = e.target.checked; savePrefs(); applyFontSize(); }
  if (id === 'pref-voice') { prefs.voice = e.target.checked; savePrefs(); }
}

/* ============================================================ 绑定 */

/*
 * 按下时记住手指/鼠标底下的 [data-act] 按钮。
 *
 * 除了元素本身，还记一个**用 data 属性拼出来的选择器** —— 因为 render() 会把
 * 整个列表重建，按下时那个元素会变成"已分离"（不在 document 里）的孤儿。
 * 光记元素的话，抬起时 find 回来的是孤儿，只能放弃；有了选择器就能在新 DOM 里
 * 找回"同一个按钮"，把这一下补回来。
 */
let pressedAct = null;

function actSelector(el) {
  const d = el.dataset || {};
  let sel = '[data-act="' + String(d.act).replace(/"/g, '\\"') + '"]';
  // 只挑能唯一标识"同一个按钮"的字段，别把 className 之类算进去
  ['id', 'list', 'dir', 'kind', 'date', 'tab', 'view', 'i'].forEach(function (k) {
    if (d[k] !== undefined && d[k] !== '') {
      sel += '[data-' + k + '="' + String(d[k]).replace(/"/g, '\\"') + '"]';
    }
  });
  return sel;
}

document.addEventListener('pointerdown', function (e) {
  const t = e.target;
  const el = (t && t.closest) ? t.closest('[data-act]') : null;
  pressedAct = el ? { el: el, sel: actSelector(el), x: e.clientX, y: e.clientY, t: Date.now() } : null;
}, true);

/**
 * 把"按下时记住的那个按钮"的动作补上。
 * 元素还在就直接用；被 render() 换掉了就用选择器在新 DOM 里找同一个按钮。
 */
function runPressedAction(p, x, y) {
  if (!p) return false;
  if (Date.now() - p.t > 1500) return false;
  // 位置差得多说明是在滑动页面，不是在点按钮
  if (Math.abs(x - p.x) > 14 || Math.abs(y - p.y) > 14) return false;
  let target = (p.el && document.contains(p.el)) ? p.el : null;
  if (!target && p.sel) {
    try { target = document.querySelector(p.sel); } catch (err) { target = null; }
  }
  if (!target) return false;
  onViewClick({ target: target, preventDefault: function () {}, stopPropagation: function () {} });
  return true;
}

/*
 * 兜底的触发点：pointerup。
 *
 * 为什么不写在 click 里：**按下时那个元素如果在抬起之前被删掉了，
 * 浏览器干脆不派发 click**（规范行为）。而 render() 会把整个列表重建，
 * 于是"按下 → 同步完成重渲染 → 抬起"这条路径上 click 根本不来，
 * 写在 click 里的兜底永远没机会跑。pointerup 是一定会来的。
 *
 * 怕重复触发：click 正常派发时会先把 pressedAct 清掉，
 * 这里等一小会儿再检查，发现已经被清掉就什么都不做。
 */
document.addEventListener('pointerup', function (e) {
  const p = pressedAct;
  if (!p) return;
  const x = e.clientX;
  const y = e.clientY;
  setTimeout(function () {
    if (pressedAct !== p) return;   // click 已经处理过了
    runPressedAction(p, x, y);
    pressedAct = null;
  }, 50);
}, true);

document.addEventListener('click', function (e) {
  if (e.target.closest('#btn-update')) { location.reload(); return; }
  if (e.target.closest('#btn-version')) { openChangelog(); return; }
  const tab = e.target.closest('#tabbar .tab');
  if (tab) {
    S.view = tab.dataset.view;
    if (S.view !== 'parent') S.parentTab = S.parentTab || 'hw';
    // 切回家长页算"人回来了"；离开则不重置，让 30 秒计时自然到期
    if (S.view === 'parent') touchParentLock();
    render();
    scrollToTop(true);
    return;
  }
  if (e.target.closest('#btn-sound')) {
    prefs.voice = !prefs.voice;
    savePrefs();
    render();
    toast(prefs.voice ? '朗读已打开' : '朗读已关闭');
    return;
  }
  if (e.target.closest('#btn-font')) {
    prefs.big = !prefs.big;
    savePrefs();
    applyFontSize();
    toast(prefs.big ? '大字模式' : '普通字号');
    return;
  }
  /*
   * 先看这一下点到的到底是什么。
   *
   * 关键：**不能先看区域再找按钮**。按下和抬起之间页面重排时，浏览器把 click
   * 派发到"按下点"和"抬起点"的**共同祖先**上 —— 那个祖先通常是 #view 本身，
   * 区域判断会通过，但里面根本没有 [data-act]，于是什么也不做。
   * 所以先判断"有没有点到按钮"，没点到才走下面的兜底。
   */
  const hit = (e.target && e.target.closest) ? e.target.closest('[data-act]') : null;
  if (hit) {
    /*
     * 只在这些区域里才走 onViewClick。
     * **弹窗一定要算进来**：弹窗是挂在 body 上的兄弟节点，不在 #view 里面。
     * 漏掉它的话，弹窗里任何靠 data-act 委托的按钮都收不到点击
     * （踩过：任务/奖励里的上下加减）。
     */
    if (e.target.closest('#view') || e.target.closest('#rest') || e.target.closest('#focusmask') ||
        e.target.closest('.modal')) {
      onViewClick(e);
    }
    pressedAct = null;
    return;
  }
  /*
   * 兜底（走 click 的这一路）：按下和抬起之间内容动了位置，按钮从手指底下挪走了。
   * click 会派发到"按下点"和"抬起点"的共同祖先上（通常是 #view），那里没有
   * data-act，于是什么也不做 —— 用按下时记下的按钮补一刀。
   *
   * "元素被整个重建"那条路径 click 根本不来，由上面的 pointerup 兜。
   */
  runPressedAction(pressedAct, e.clientX, e.clientY);
  pressedAct = null;
});

document.addEventListener('change', onChange);

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});

/* 孩子点卡片时给一点"反馈感" */
document.addEventListener('animationend', function (e) {
  if (e.target.classList && e.target.classList.contains('pop')) e.target.classList.remove('pop');
});

window.addEventListener('online', function () { poll(); });
window.addEventListener('offline', function () { S.online = false; setSync('off'); });

boot().catch(function (err) {
  S.bootMsg = '打开失败：' + (err && err.message);
  S.bootActions = [{ label: '重新加载', cls: 'primary', onClick: function () { location.reload(); } }];
  bootUI();
});