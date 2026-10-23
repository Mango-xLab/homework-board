/*
 * 纯 UI 原语：转义、选择器、提示条、音效、撒花、弹窗系统。
 *
 * 这里**不碰应用状态**（不认识 S / prefs / 房间）—— 所以谁都能用，也不会跟
 * app.js 互相牵制。唯一需要外部告诉它的是"朗读开没开"，
 * 那个走 speak(text, enabled) 的参数，不做隐藏的状态同步，
 * 免得哪天忘了同步导致朗读静默失效。
 *
 * app.js 从这里 import；单文件 Worker 打包时 index.html / app.js / ui.js 都要
 * 作为静态资源带上（见 scripts/build-worker.mjs 的 STATIC_FILES）。
 */

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export function $(sel, root) { return (root || document).querySelector(sel); }

/* ------------------------------------------------------------ 轻提示 */

/** 提示条。ms 是可选的显示时长（很重要的错误可以留久一点） */
export function toast(msg, kind, ms) {
  const root = $('#toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(function () {
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    setTimeout(function () { el.remove(); }, 260);
  }, Math.max(1000, Number(ms) || 2200));
}

/* ------------------------------------------------------------ 音效 / 撒花 */

let audioCtx = null;
export function chime(up) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    (up ? [660, 880, 1180] : [520, 400]).forEach(function (f, i) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.16, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.22);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(now + i * 0.09); o.stop(now + i * 0.09 + 0.26);
    });
  } catch (e) { /* 静音就算了 */ }
}

/** 朗读。enabled 由调用方传（app.js 传 prefs.voice），不在这里读全局状态 */
export function speak(text, enabled) {
  if (!enabled || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = 'zh-CN';
    u.rate = 0.92;
    u.pitch = 1.05;
    window.speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}

export function confetti(n) {
  const root = $('#confetti');
  if (!root) return;
  const colors = ['#ff9f1c', '#21b573', '#3b7fd4', '#e2564a', '#8b5cf6', '#ffd166'];
  for (let i = 0; i < (n || 70); i++) {
    const el = document.createElement('i');
    el.style.setProperty('--x', (Math.random() * 100).toFixed(1) + 'vw');
    el.style.setProperty('--c', colors[i % colors.length]);
    el.style.setProperty('--dur', (1.7 + Math.random() * 1.5).toFixed(2) + 's');
    el.style.setProperty('--delay', (Math.random() * 0.6).toFixed(2) + 's');
    el.style.setProperty('--rot', (Math.random() * 840 - 420).toFixed(0) + 'deg');
    root.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }
}

/* ------------------------------------------------------------ 弹窗 */

let modalEl = null;

export function closeModal() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
}

/* 第 89 轮：原来的「还能写 N 字」计数已按家长要求去掉，
   maxlength 本身保留（超了照样写不进去，只是不再显示还剩多少）。 */

export function openModal(opt) {
  closeModal();
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  const box = document.createElement('div');
  box.className = 'modal' + (opt.cls ? ' ' + opt.cls : '');
  if (opt.title) {
    const h = document.createElement('h3');
    h.textContent = opt.title;
    box.appendChild(h);
  }
  if (opt.bodyNode) box.appendChild(opt.bodyNode);
  if (opt.html) {
    const d = document.createElement('div');
    d.className = 'modal-body';
    d.innerHTML = opt.html;
    box.appendChild(d);
  }
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  (opt.actions || []).forEach(function (a) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || 'ghost');
    b.textContent = a.label;
    b.addEventListener('click', function () { a.onClick && a.onClick(); });
    actions.appendChild(b);
  });
  if (actions.children.length) box.appendChild(actions);
  mask.appendChild(box);
  /*
   * 第 86 轮：**关掉"轻量关闭"** —— 点遮罩层不再关弹窗。
   *
   * 原来 mask 上挂了 click，点框外面那圈半透明就关掉。家长在编辑时
   * 鼠标稍微划出弹窗（尤其是拖动选文字、点到边缘）就把整张表单弄没了，
   * 填的内容全丢。现在只有**明确点「取消 / 关闭 / 确定」**才关。
   *
   * 键盘 Esc 也算明确动作，但这里本来就没绑 Esc，所以不用动。
   */
  $('#modal-root').appendChild(mask);
  modalEl = mask;
  return box;
}

export function confirmModal(title, text, onYes, yesLabel) {
  openModal({
    title: title,
    html: '<p>' + esc(text) + '</p>',
    actions: [
      { label: '先不要', cls: 'ghost', onClick: closeModal },
      {
        label: yesLabel || '确定', cls: 'primary', onClick: function () {
          closeModal();
          onYes();
        }
      },
    ],
  });
}

/**
 * 一个通用表单弹窗。
 *   fields: [{ key, label, value, type?, rows?, maxlength?, options?, picks?, placeholder? }]
 *   onSubmit(values)  values 按 key 收好；里面可以直接读 .value（都是字符串）
 */
export function formModal(title, fields, onSubmit) {
  const body = document.createElement('div');
  fields.forEach(function (f) {
    const row = document.createElement('div');
    row.className = 'form-row';
    const lab = document.createElement('label');
    lab.textContent = f.label;
    row.appendChild(lab);

    /*
     * type:'node' —— 调用方自己给一个已经搭好的 DOM（附件上传这种）。
     * 值由调用方自己塞进一个 <input data-key=... hidden> 里，
     * 下面收集值的逻辑照样能拿到，ui.js 不用认识"附件"是什么概念。
     */
    if (f.type === 'node' && f.node) {
      row.classList.add('form-row-node');
      if (f.block) row.classList.add('block');
      row.appendChild(f.node);
      body.appendChild(row);
      return;
    }
    if (f.type === 'note') {
      const p = document.createElement('p');
      p.className = 'hint hint-lead';
      p.style.margin = '0 0 .5rem';
      p.textContent = f.text || '';
      body.appendChild(p);
      return;
    }

    // type:'icon' = 不要输入框，直接一排图标点选（值放在隐藏 input 里）
    const iconOnly = f.type === 'icon';

    let input;
    if (iconOnly) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.value = f.value || (f.picks || [])[0] || '⭐';
    } else if (f.type === 'select') {
      input = document.createElement('select');
      input.className = 'field';
      (f.options || []).forEach(function (o) {
        const op = document.createElement('option');
        op.value = o.value;
        op.textContent = o.label;
        input.appendChild(op);
      });
    } else if (f.type === 'chips') {
      /*
       * 既能选预设、又能自己填：一个普通文本框 + 一排快捷选项。
       * 点某个选项就把它填进去（再点一下取消），手打也随时可以 ——
       * 比下拉框强的地方就是"支持自定义填写"。
       */
      input = document.createElement('input');
      input.className = 'field';
    } else if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.className = 'field';
      input.rows = f.rows || 3;
      // 长的标题/备注要能换行；高度跟着行数走，家长还能自己拖大
      input.style.minHeight = ((f.rows || 3) * 1.6) + 'rem';
      input.style.resize = 'vertical';
      input.style.whiteSpace = 'pre-wrap';
    } else {
      input = document.createElement('input');
      input.className = 'field' + (f.type === 'number' ? ' num' : '');
      /*
       * 数字一律用 text + inputmode=numeric，**不用 type="number"**。
       * 踩过：Chrome 在 type=number 的框里配中文字体栈，会把 -1 渲染成「1-」
       * （负号跑到数字后面）；DOM 里的 value 还是 -1，看代码根本看不出来，
       * 只有截图才看得见。text + inputmode 照样唤起手机数字键盘，
       * core 里的 parseNum() 也容错。
       */
      input.type = 'text';
      if (f.type === 'number') {
        input.inputMode = 'numeric';
        if (f.min != null) input.dataset.min = String(f.min);
        if (f.max != null) input.dataset.max = String(f.max);
      }
    }
    if (!iconOnly) input.value = f.value == null ? '' : f.value;
    input.dataset.key = f.key;
    if (f.placeholder) input.placeholder = f.placeholder;
    if (f.maxlength) input.maxLength = f.maxlength;

    if (iconOnly) {
      const wrap = document.createElement('div');
      wrap.className = 'icon-only-picker';
      (f.picks || []).forEach(function (ic) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'icon-pick' + (ic === input.value ? ' on' : '');
        b.textContent = ic;
        b.title = '选这个';
        b.addEventListener('click', function () {
          input.value = ic;
          wrap.querySelectorAll('.icon-pick').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        });
        wrap.appendChild(b);
      });
      row.appendChild(wrap);
      row.appendChild(input);
      body.appendChild(row);
      return;
    }

    row.appendChild(input);
    body.appendChild(row);

    /*
     * 数字字段再配一对上下加减按钮。
     * 注意：input 已经被 append 进去了，这里只把「按钮壳」套在它外面，
     * 用 wrap 包住 input 再放回原位，保持 DOM 顺序不乱。
     */
    if (f.type === 'number') {
      const wrap = document.createElement('span');
      wrap.className = 'num-wrap';
      row.replaceChild(wrap, input);
      wrap.appendChild(input);
      const steps = document.createElement('span');
      steps.className = 'num-steps';
      [[1, '▲', '加一'], [-1, '▼', '减一']].forEach(function (s) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'num-step';
        b.dataset.act = 'num-step';
        b.dataset.for = f.key;            // 表单里用 key 当定位
        b.dataset.delta = String(s[0]);
        b.textContent = s[1];
        b.title = s[2];
        b.tabIndex = -1;
        steps.appendChild(b);
      });
      wrap.appendChild(steps);
    }

    /*
     * 「既能选预设又能自己填」的字段：一排快捷选项。
     * 默认挂在输入框下一行；`inline: true` 时**跟输入框同一行**（家长要求：
     * 标签输入框要和「功课 / 生活 / 精神」并排，不要另起一行）。
     */
    if (f.type === 'chips') {
      const picks = document.createElement('div');
      picks.className = 'chip-picks' + (f.inline ? ' inline' : '');
      (f.picks || []).forEach(function (v) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (v === input.value ? ' on' : '');
        b.textContent = v;
        b.addEventListener('click', function () {
          // 已经是这个值就取消，方便"清掉重填"
          const same = input.value.trim() === v;
          input.value = same ? '' : v;
          picks.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); });
          if (!same) b.classList.add('on');
          input.focus();
        });
        picks.appendChild(b);
      });
      // 手打的值如果正好等于某个预设，把那个选项也点亮
      input.addEventListener('input', function () {
        const v = input.value.trim();
        picks.querySelectorAll('.chip').forEach(function (x) {
          x.classList.toggle('on', x.textContent === v);
        });
      });
      row.appendChild(picks);
    }

    /*
     * 图标选择：点一个就填进上面的输入框。
     *
     * 这段是给"文本输入框 + 一排 emoji 备选"用的老兜底逻辑：
     * type:'icon' 在上面就 return 了，type:'chips' 有自己的样式，
     * 都得排除掉 —— 不排除的话 chips 字段会**多渲染一个图标格子**（踩过）。
     */
    if (f.picks && f.picks.length && !iconOnly && f.type !== 'chips') {
      const picker = document.createElement('div');
      picker.className = 'icon-picker';
      f.picks.forEach(function (ic) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'icon-pick';
        b.textContent = ic;
        b.addEventListener('click', function () {
          input.value = ic;
          picker.querySelectorAll('.icon-pick').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        });
        if (ic === input.value) b.classList.add('on');
        picker.appendChild(b);
      });
      body.appendChild(picker);
    }
  });

  openModal({
    title: title,
    bodyNode: body,
    actions: [
      { label: '取消', cls: 'ghost', onClick: closeModal },
      {
        label: '保存', cls: 'primary', onClick: function () {
          const out = {};
          body.querySelectorAll('[data-key]').forEach(function (el) { out[el.dataset.key] = el.value; });
          closeModal();
          onSubmit(out);
        }
      },
    ],
  });
}
