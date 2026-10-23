/*
 * 浏览器测试公用的极简 CDP 客户端。
 *
 * smoke.mjs 和 screenshot.mjs 原本各抄了一份一模一样的东西（WebSocket 连接、
 * send/evaluate/sleep、20 秒超时），改一处要改两处。这里收成一份。
 *
 * 用法：
 *   import { openTab } from './lib/cdp.mjs';
 *   const page = await openTab({ url: 'http://localhost:5199/?room=ABC123', width: 400 });
 *   await page.evaluate('document.title');
 *   await page.click('#btn');
 *   page.close();
 *
 * 需要先起一个带 --remote-debugging-port 的 Chrome。
 */

export const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

const DEFAULT_PORT = process.env.CDP_PORT || '9333';

function debuggerBase(port) { return 'http://127.0.0.1:' + port + '/json'; }

/** 问一下浏览器在不在（返回浏览器版本字符串） */
export async function browserVersion(port) {
  const p = port || DEFAULT_PORT;
  try {
    const r = await fetch(debuggerBase(p) + '/version');
    const j = await r.json();
    return j.Browser || '未知版本';
  } catch (e) {
    throw new Error('连不上 Chrome 调试端口 ' + p +
      '。先起一个：chrome --headless=new --remote-debugging-port=' + p + ' about:blank');
  }
}

/**
 * 开一个新标签页，连上去，把常用命令都准备好。
 *
 * 选项（都有默认值）：
 *   url          要打开的地址（必填）
 *   port         调试端口，默认 CDP_PORT 环境变量或 9333
 *   width/height 视口大小；不传 width 就不覆盖视口
 *   scale        设备像素比，默认 1
 *   mobile       是否按移动端渲染，默认 true（width 存在时生效）
 *   noCache      true 时禁用缓存（测"有新版本"提示要用）
 *   settle       打开后等多久再返回，默认 2200ms
 *   timeout      单条 CDP 命令的超时，默认 20s
 *   clickDelay   每次 click() 之后等多久，默认 160ms
 */
export async function openTab(options) {
  const opt = options || {};
  const port = opt.port || DEFAULT_PORT;
  const url = opt.url;
  if (!url) throw new Error('openTab 需要 url');

  let target;
  try {
    const res = await fetch(debuggerBase(port) + '/new?' + encodeURIComponent(url), { method: 'PUT' });
    target = await res.json();
  } catch (e) {
    throw new Error('连不上 Chrome 调试端口 ' + port +
      '。先起一个：chrome --headless=new --remote-debugging-port=' + port + ' about:blank');
  }
  if (!target || !target.webSocketDebuggerUrl) {
    throw new Error('Chrome 没给出调试地址：' + JSON.stringify(target));
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(function (resolve, reject) {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', function () { reject(new Error('连不上 Chrome 调试端口 ' + port)); }, { once: true });
  });

  let nextId = 1;
  const waiting = new Map();
  ws.addEventListener('message', function (ev) {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const w = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) w.reject(new Error(msg.error.message));
      else w.resolve(msg.result);
    }
  });

  function send(method, params) {
    const id = nextId++;
    return new Promise(function (resolve, reject) {
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(function () {
        if (waiting.has(id)) { waiting.delete(id); reject(new Error('CDP 超时：' + method)); }
      }, opt.timeout || 20000);
    });
  }

  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.text + ' ' +
        ((r.exceptionDetails.exception || {}).description || ''));
    }
    return r.result && r.result.value;
  }

  /** 点一个选择器；点不到就抛错（抛比静默失败好查） */
  async function click(sel, delay) {
    const hit = await evaluate('(function(){var el=document.querySelector(' + JSON.stringify(sel) + ');' +
      'if(!el) return false; el.click(); return true;})()');
    if (!hit) throw new Error('点不到 ' + sel);
    await sleep(delay == null ? (opt.clickDelay || 160) : delay);
    return true;
  }

  /**
   * 真·鼠标点击：滚到元素、按坐标发 mousePressed/mouseReleased。
   *
   * 和上面 click() 的区别很重要：el.click() **绕过命中测试**，
   * 元素被别的层盖住、或者根本在屏幕外，它照样"点得到"。
   * 要查"按钮在、点得着、就是没反应"这类遮挡/错位问题，必须用这个。
   *
   * 返回 { x, y, at }：at 是那个坐标上真正接到点击的元素，便于排查。
   */
  async function realClick(sel, delay) {
    const found = await evaluate('(function(){' +
      'var el=document.querySelector(' + JSON.stringify(sel) + ');' +
      'if(!el) return false; el.scrollIntoView({block:"center"}); return true;})()');
    if (!found) throw new Error('点不到 ' + sel);
    await sleep(320);
    const at = await evaluate('(function(){' +
      'var el=document.querySelector(' + JSON.stringify(sel) + ');' +
      'var r=el.getBoundingClientRect(); var x=r.left+r.width/2, y=r.top+r.height/2;' +
      'var top=document.elementFromPoint(x,y);' +
      'return { x:x, y:y, tag: top?top.tagName:"",' +
      '  act: top&&top.dataset?(top.dataset.act||""):"",' +
      '  cls: top?(top.className||""):"" };})()');
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1,
    });
    await sleep(30);
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1,
    });
    await sleep(delay == null ? (opt.clickDelay || 160) : delay);
    return at;
  }

  await send('Page.enable');
  await send('Runtime.enable');

  if (opt.noCache) {
    await send('Network.enable');
    await send('Network.clearBrowserCache');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
  }

  if (opt.width) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: opt.width,
      height: opt.height || 900,
      deviceScaleFactor: opt.scale || 1,
      mobile: opt.mobile !== false,
    });
  }

  await send('Page.navigate', { url: url });
  await sleep(opt.settle == null ? 2200 : opt.settle);

  return {
    send: send,
    evaluate: evaluate,
    click: click,
    realClick: realClick,
    sleep: sleep,
    close: function () { try { ws.close(); } catch (e) { /* 已经关了 */ } },
  };
}
