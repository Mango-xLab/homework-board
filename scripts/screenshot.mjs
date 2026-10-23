/*
 * 用 Chrome 的调试接口把每个页面跑一遍：截图 + 检查脚本报错和横向溢出。
 * 开发自用。
 *
 *   1) 先起服务： node server.js
 *   2) 起 Chrome：
 *      chrome.exe --headless=new --remote-debugging-port=9333 ^
 *                 --user-data-dir=tmp\chrome --hide-scrollbars about:blank
 *   3) node scripts/screenshot.mjs <房间码>
 *
 * 环境变量：
 *   WIDTH=400 HEIGHT=860   视口大小
 *   CHECK_ONLY=1           只检查不存图
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { openTab, browserVersion } from './lib/cdp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tmp', 'shots');

/**
 * 给某个上传入口塞真实文件。
 *
 * 放在**模块顶层**（不是某个 {} 块里）：函数声明在块里是块级作用域的，
 * 别的地方就调不到了（踩过：第 75 轮那段测试报 "pickFiles is not defined"）。
 */
async function pickFiles(selector, files) {
  await page.evaluate('(function(){var i=document.querySelector(' + JSON.stringify(selector) + ');' +
    'if(i) i.scrollIntoView({block:"center"});return 1;})()');
  await sleep(300);
  const doc = await page.send('DOM.getDocument', { depth: -1 });
  const found = await page.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: selector });
  if (!found || !found.nodeId) return false;
  await page.send('DOM.setFileInputFiles', { nodeId: found.nodeId, files: files });
  await sleep(2500);
  return true;
}

/**
 * 造一张"大照片"用来验图片压缩（第 75 轮 2）：
 * 1200×900 的**噪声** PNG —— 噪声 zlib 压不动，文件天然几 MB，
 * 正好模拟手机拍的照片。函数声明会提升，所以放文件开头、后面随时能调。
 */
function makeBigPng(file) {
  let seed = 12345;
  const rnd = function () {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) & 255;
  };
  const W = 1200, H = 900;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;                                   // 每行 filter = none
    for (let x = 0; x < W; x++) { raw[o++] = rnd(); raw[o++] = rnd(); raw[o++] = rnd(); }
  }
  const table = (function () {
    const t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = function (buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = function (type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

const PORT = process.env.CDP_PORT || '9333';
const BASE = process.env.BASE || 'http://localhost:5199';
const WIDTH = Number(process.env.WIDTH) || 400;
const HEIGHT = Number(process.env.HEIGHT) || 860;
const CHECK_ONLY = process.env.CHECK_ONLY === '1';
// 宽度扫描那种要跑很多遍的场景，跳过几段 30 秒的计时测试
const SKIP_SLOW = process.env.SKIP_SLOW === '1';
const room = (process.argv[2] || '').toUpperCase();

if (!room) { console.error('用法：node scripts/screenshot.mjs <房间码>'); process.exit(1); }

let problems = 0;

async function shot(name) {
  if (!CHECK_ONLY) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  } else {
    await sleep(80);
  }

  /*
   * 页面本身不滚了（body 是 overflow:hidden 的应用外壳），真正滚的是 #scroller，
   * 而它 overflow-x:hidden 会把横向溢出裁掉。所以两个都量一遍 ——
   * 只量 documentElement 的话这里永远是 0，横向溢出检查就静默失效了。
   */
  const overflow = await evaluate('(function(){' +
    'var sc=document.getElementById("scroller");' +
    'var a=document.documentElement.scrollWidth-document.documentElement.clientWidth;' +
    'var b=sc?(sc.scrollWidth-sc.clientWidth):0;' +
    'return Math.max(a,b);})()');
  const err = await evaluate('window.__hbError || ""');
  let flag = '';
  if (overflow > 1) {
    const who = await evaluate('(function(){' +
      'var sc=document.getElementById("scroller");' +
      'var w=sc?sc.clientWidth:document.documentElement.clientWidth;' +
      'var root=sc||document.body; var out=[];' +
      'root.querySelectorAll("*").forEach(function(el){var r=el.getBoundingClientRect();' +
      'if(r.width>0&&r.right>w+1){out.push((el.tagName.toLowerCase())+"."+(el.className||"")+"#"+(el.id||"")+"→"+Math.round(r.right));}});' +
      'return out.slice(0,5).join(" | ");})()');
    flag = '  ⚠️ 横向溢出 ' + overflow + 'px  ← ' + who;
    problems++;
  } else if (err) {
    flag = '  ⚠️ 脚本错误：' + err;
    problems++;
  }
  console.log('   📸 ' + name + (CHECK_ONLY ? '' : '.png') + flag);
  return overflow;
}

/**
 * 点一个选择器。这里**不抛错**，只记一笔问题然后继续 ——
 * 这个脚本要一口气跑完整个流程并出报告，中途抛错就什么都看不到了。
 */
async function mustClick(sel, what) {
  try {
    await page.click(sel, 320);
    return true;
  } catch (e) {
    console.log('   ⚠️ ' + (what || sel) + '：' + e.message);
    problems++;
    return false;
  }
}

/** 当前小红花余额：家长页上不显示余额，所以直接问接口 */
async function balance() {
  return await evaluate('fetch("/api/state/' + room + '")' +
    '.then(function(r){return r.json();})' +
    '.then(function(j){return j.state.points.balance;})');
}

/** 今天有几条作业（直接问接口，不受当前看的是哪一天影响） */
async function todayHomeworkCount() {
  return await evaluate('(function(){var d=new Date();' +
    'var k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");' +
    'return fetch("/api/state/' + room + '").then(function(r){return r.json();})' +
    '.then(function(j){var day=j.state.days[k]||{};return (day.homeworks||[]).length;});})()');
}

/* ------------------------------------------------------------- 开始 */

fs.mkdirSync(OUT, { recursive: true });

/* CDP 客户端在 scripts/lib/cdp.mjs，和 smoke.mjs 共用一份 */
console.log('   浏览器：' + await browserVersion(PORT));
const page = await openTab({
  url: BASE + '/?room=' + room,
  port: PORT,
  width: WIDTH,
  height: HEIGHT,
  scale: 2,
  mobile: true,
  noCache: true,       // 测「有新版本」提示条，不能吃缓存
});
const send = page.send;
const evaluate = page.evaluate;
const sleep = page.sleep;

console.log('   页面已加载：' + await evaluate('document.querySelector("#top-sub").textContent'));
console.log('   ' + await evaluate('window.__hbError || "(没有脚本错误)"'));

/* ---- 孩子端 ---- */
const heroDate = await evaluate('(document.querySelector(".hero-date")||{}).textContent');
const hiSize = await evaluate('Math.round(parseFloat(getComputedStyle(document.querySelector(".hero-hi")).fontSize))');
const hiLines = await evaluate('(function(){var e=document.querySelector(".hero-hi");' +
  'return Math.round(e.getBoundingClientRect().height / (parseFloat(getComputedStyle(e).fontSize) * 1.25));})()');
const ringCount = await evaluate('document.querySelectorAll(".hero-right .ring-wrap").length');
const ringTexts = await evaluate('[].slice.call(document.querySelectorAll(".hero-right .hero-ring"))' +
  '.map(function(x){return x.textContent.replace(/\\s+/g," ").trim();})');
const ringsOrdered = await evaluate('(function(){var rs=document.querySelectorAll(".hero-right .ring-wrap");' +
  'if(rs.length<2) return false;' +
  'return rs[0].getBoundingClientRect().left < rs[1].getBoundingClientRect().left;})()');
console.log('   问候语 %dpx（%d 行），日期行「%s」', hiSize, hiLines, heroDate);
console.log('   右侧圆环 %d 个：%s（小红花在左：%s）', ringCount, JSON.stringify(ringTexts), ringsOrdered ? '是' : '否');
const heroFit = await evaluate('(function(){var m=document.querySelector(".hero-main");' +
  'var h=document.querySelector(".hero-hi");var old=h.style.whiteSpace;h.style.whiteSpace="nowrap";' +
  'var need=h.scrollWidth;h.style.whiteSpace=old;' +
  'return "可用 " + Math.round(m.getBoundingClientRect().width) + "px / 需要 " + need + "px";})()');
console.log('   问候语一行放得下吗：' + heroFit);
if (hiLines > 1) { console.log('   ⚠️ 问候语折行了（' + heroFit + '）'); problems++; }
if (!/^\d{4}年\d+月\d+日 星期/.test(String(heroDate))) {
  console.log('   ⚠️ 日期不是「年月日 星期」格式：' + heroDate); problems++;
}
if (ringCount !== 2) { console.log('   ⚠️ 右侧应该有「今日小红花 + 任务进度」两个圆环'); problems++; }
if (!/^\+\d+/.test(String(ringTexts[0] || ''))) { console.log('   ⚠️ 小红花圆环中间不是 +数字'); problems++; }
if (!/%/.test(String(ringTexts[1] || ''))) { console.log('   ⚠️ 进度圆环中间不是百分比'); problems++; }
if (!ringsOrdered) { console.log('   ⚠️ 小红花圆环不在进度环左边'); problems++; }

/* ---- 顶栏：同步状态是「状态标签」不是按钮；版本号与圆按钮等高 ---- */
const barStyle = await evaluate('(function(){' +
  'function box(el){ if(!el) return null; var r=el.getBoundingClientRect(); var cs=getComputedStyle(el);' +
  '  return { tag:el.tagName, w:Math.round(r.width), h:Math.round(r.height), bg:cs.backgroundColor,' +
  '    radius:cs.borderRadius, border:cs.borderTopWidth, shadow:cs.boxShadow, cursor:cs.cursor,' +
  '    text:(el.textContent||"").trim() }; }' +
  'return { sync: box(document.getElementById("sync-dot")),' +
  '  font: box(document.getElementById("btn-font")),' +
  '  ver: box(document.getElementById("btn-version")) };})()');
console.log('   顶栏三件套：' + JSON.stringify(barStyle));
if (!barStyle.sync) { console.log('   ⚠️ 右上角没有同步状态'); problems++; }
else {
  /*
   * 同步状态被误认成按钮过两次，所以这几条要一直盯着：
   * 不能是 button、不能有底色/边框/投影、鼠标不能是手型。
   */
  if (barStyle.sync.tag === 'BUTTON') { console.log('   ⚠️ 同步状态是 <button>，会被当成可点的按钮'); problems++; }
  if (barStyle.sync.bg !== 'rgba(0, 0, 0, 0)') { console.log('   ⚠️ 同步状态有底色：' + barStyle.sync.bg); problems++; }
  if (parseFloat(barStyle.sync.border) > 0) { console.log('   ⚠️ 同步状态有边框'); problems++; }
  if (barStyle.sync.shadow && barStyle.sync.shadow !== 'none') { console.log('   ⚠️ 同步状态有投影'); problems++; }
  if (barStyle.sync.cursor === 'pointer') { console.log('   ⚠️ 同步状态用了手型光标，看着像按钮'); problems++; }
  if (!barStyle.sync.text) { console.log('   ⚠️ 同步状态没有文字说明'); problems++; }
  // 高度仍要和圆按钮一致，顶栏才齐
  if (barStyle.sync.h !== barStyle.font.h) {
    console.log('   ⚠️「同步状态」和「字号」不等高：' + barStyle.sync.h + ' vs ' + barStyle.font.h); problems++;
  }
}
if (barStyle.ver && barStyle.font && barStyle.ver.h !== barStyle.font.h) {
  console.log('   ⚠️ 版本号边框高度和「字号」不等高：' + barStyle.ver.h + ' vs ' + barStyle.font.h); problems++;
}

/* ---- 任何输入框都不能用 type=number（这个坑很隐蔽，见下） ---- */
const numberInputs = await evaluate('[].slice.call(document.querySelectorAll(\'input[type="number"]\'))' +
  '.map(function(x){return x.id||x.className||x.name;})');
console.log('   type=number 的输入框：' + JSON.stringify(numberInputs));
if (numberInputs.length) {
  /*
   * Chrome 在 type=number 的框里配中文字体栈，会把 -1 **渲染**成「1-」
   * （负号跑到数字后面）。DOM 里的 value 还是 -1，读代码、读 value 都查不出来，
   * 只有截图才看得见。所以这里一刀切：数字一律用 text + inputmode=numeric。
   */
  console.log('   ⚠️ 有输入框用了 type=number：' + JSON.stringify(numberInputs) +
    '（中文环境下负数会显示成「1-」，改成 type=text + inputmode=numeric）');
  problems++;
}

/* ---- 右上角的版本号：要有、格式对、点开能看到更新内容 ---- */
const ver = await evaluate('(function(){' +
  'var b=document.getElementById("btn-version");' +
  'if(!b) return {has:false};' +
  'var r=b.getBoundingClientRect(); var tb=document.getElementById("topbar").getBoundingClientRect();' +
  'return { has:true, hidden:b.hidden, text:b.textContent.trim(),' +
  '  inTopbar: r.top >= tb.top - 2 && r.bottom <= tb.bottom + 2,' +
  '  atRight: r.right > window.innerWidth * 0.6 };})()');
console.log('   右上角版本号：' + JSON.stringify(ver));
if (!ver.has || ver.hidden) { console.log('   ⚠️ 右上角没有版本号'); problems++; }
else {
  if (!/^v\d+\.\d+\.\d{8}\.[a-z0-9]{4}$/.test(ver.text)) {
    console.log('   ⚠️ 版本号格式不对（要是 v1.0.月日时分.四位随机码）：' + ver.text); problems++;
  }
  if (!ver.inTopbar || !ver.atRight) { console.log('   ⚠️ 版本号没在顶栏右上角'); problems++; }
  await mustClick('#btn-version', '版本号');
  await sleep(400);
  const logModal = await evaluate('(function(){' +
    'var m=document.querySelector(".modal"); if(!m) return {open:false};' +
    'return { open:true, title:(m.querySelector("h3")||{}).textContent||"",' +
    '  entries:m.querySelectorAll(".log-entry").length,' +
    '  notes:m.querySelectorAll(".log-entry li").length };})()');
  console.log('   点开版本号：' + JSON.stringify(logModal));
  if (!logModal.open) { console.log('   ⚠️ 点版本号没弹出更新内容'); problems++; }
  if (logModal.notes < 1) { console.log('   ⚠️ 更新内容里一条说明都没有'); problems++; }
  await shot('39-changelog');
  await mustClick('.modal .btn.primary', '关掉更新内容');
  await sleep(300);
}

/* 没有详细要求的卡片不该留空行 */
const emptyDetails = await evaluate('[].slice.call(document.querySelectorAll(".card-detail"))' +
  '.filter(function(x){return !x.textContent.trim();}).length');
console.log('   空白的「详细要求」行：' + emptyDetails + ' 个（期望 0）');
if (emptyDetails > 0) { console.log('   ⚠️ 还有空白的详细要求行'); problems++; }

/* 「每天要做的事」也要有 已完成/总数 */
const pills = await evaluate('[].slice.call(document.querySelectorAll(".panel-head .pill"))' +
  '.map(function(x){return x.textContent.trim();})');
console.log('   两个清单的计数：' + JSON.stringify(pills));
if (pills.length < 2 || !/^\d+\/\d+$/.test(pills[1])) {
  console.log('   ⚠️ 「每天要做的事」没有 已完成/总数'); problems++;
}
await shot('1-today');
await mustClick('#tabbar [data-view="stars"]', '小红花标签');
await shot('2-stars');

/*
 * ★ 第 94 轮：小红花记录要能翻页，翻到**全部**记录。
 *   演示房间的流水不多，所以这里只验结构性：
 *     · 面板标题、总条数对得上
 *     · 有翻页条时页码格式对、「上一页 / 下一页」的禁用状态对
 *     · 只有一页时不出按钮、只写「共 N 条」
 *   多页翻动靠专门的 _r94 探针验过（45 条 → 3 页）。
 */
{
  const led = await evaluate('(function(){' +
    'var sec=document.getElementById("sec-ledger");' +
    'if(!sec) return { noPanel:true };' +
    'var p=sec.querySelector(".pager");' +
    'var btns=p?[].slice.call(p.querySelectorAll(".btn")).map(function(b){' +
    '  return { label:b.textContent.trim(), page:b.dataset.page, disabled:b.disabled }; }):[];' +
    'return { noPanel:false,' +
    '  title:(sec.querySelector("h2")||{}).textContent||"",' +
    '  hint:(sec.querySelector(".hint")||{}).textContent||"",' +
    '  items:sec.querySelectorAll(".log-item").length,' +
    '  pagerText:p?p.textContent.replace(/\\s+/g," ").trim():"(没有翻页条)",' +
    '  btns:btns,' +
    '  overflow:Math.round(sec.scrollWidth-sec.clientWidth) };})()');
  console.log('   小红花记录面板：' + JSON.stringify(led));
  if (led.noPanel) {
    console.log('   ⚠️ 找不到小红花记录面板'); problems++;
  } else {
    if (led.title.indexOf('小红花记录') < 0) {
      console.log('   ⚠️ 面板标题不对：' + led.title); problems++;
    }
    if (!/一共 \d+ 条/.test(led.hint)) {
      console.log('   ⚠️ 面板标题上没写「一共 N 条」：' + led.hint); problems++;
    }
    if (led.items > 20) {
      console.log('   ⚠️ 一页显示了 ' + led.items + ' 条（超过每页 20）'); problems++;
    }
    if (led.btns.length === 2) {
      // 多页：页码格式 + 第一页时「上一页」必须禁用
      if (!/第 1 \/ \d+ 页/.test(led.pagerText)) {
        console.log('   ⚠️ 翻页条页码格式不对：' + led.pagerText); problems++;
      }
      if (led.btns[0].disabled !== true) {
        console.log('   ⚠️ 第 1 页的「上一页」应该是禁用的'); problems++;
      }
    } else if (led.btns.length === 0) {
      // 只有一页：不该有按钮，只写「共 N 条」
      if (!/^共 \d+ 条$/.test(led.pagerText)) {
        console.log('   ⚠️ 只有一页时应该只写「共 N 条」：' + led.pagerText); problems++;
      }
    } else {
      console.log('   ⚠️ 翻页条的按钮数不对：' + JSON.stringify(led.btns)); problems++;
    }
    if (led.overflow > 1) {
      console.log('   ⚠️ 小红花记录面板横向溢出了 ' + led.overflow + 'px'); problems++;
    }
  }
  /*
   * ★ 第 95 轮：已兑现的兑换要显示**兑现日期**。
   *   演示房间不一定有已兑现的兑换，有就验、没有就跳过（不硬造数据）。
   */
  {
    const doneRow = await evaluate('(function(){' +
      'var secs=[].slice.call(document.querySelectorAll("section.panel"));' +
      'var sec=secs.filter(function(s){' +
      '  return /已经兑现/.test((s.querySelector("h2")||{}).textContent||"");})[0];' +
      'if(!sec) return { none:true };' +
      'var r=sec.querySelector(".log-item");' +
      'if(!r) return { none:true };' +
      'return { none:false,' +
      '  text:r.textContent.replace(/\\s+/g," ").trim(),' +
      '  title:(r.querySelector(".log-time[title]")||{}).title||"" };})()');
    if (doneRow.none) {
      console.log('   已兑现的兑换：（演示房间里没有，跳过）');
    } else {
      console.log('   已兑现那一行：' + JSON.stringify(doneRow));
      if (!/\d{1,2}\/\d{1,2}/.test(doneRow.text)) {
        console.log('   ⚠️ 已兑现的那行没有兑现日期：' + doneRow.text); problems++;
      }
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(doneRow.title)) {
        console.log('   ⚠️ 兑现日期没有完整时间放在 title 里：' + JSON.stringify(doneRow.title));
        problems++;
      }
    }
  }
}

await mustClick('#tabbar [data-view="week"]', '周标签');
await shot('3-week');

/* ---- 家长端：密码键盘应该是 3×4 排满的 ---- */
await mustClick('#tabbar [data-view="parent"]', '家长标签');
await shot('4-parent-pin');

const pad = await evaluate('(function(){' +
  'var bs=[].slice.call(document.querySelectorAll(".keypad button"));' +
  'if(!bs.length) return null;' +
  'var rows={};' +
  'bs.forEach(function(b){var t=Math.round(b.getBoundingClientRect().top);' +
  '  rows[t]=rows[t]||[]; rows[t].push(b.textContent.trim());});' +
  'var keys=bs.map(function(b){return b.textContent.trim();});' +
  'var hint=(document.querySelector(".pin-gate .hint")||{}).textContent||"";' +
  'var rects=bs.map(function(b){return b.getBoundingClientRect();});' +
  'var lastTop=Math.max.apply(null,rects.map(function(r){return r.top;}));' +
  'var lastRow=bs.filter(function(b){return Math.abs(b.getBoundingClientRect().top-lastTop)<2;});' +
  'return { n:bs.length, keys:keys, rows:Object.keys(rows).length,' +
  '   lastRow:lastRow.map(function(b){return b.textContent.trim();}),' +
  '   fnCount:document.querySelectorAll(".keypad button.fn").length,' +
  '   hint:hint.trim(), hasBackspaceChar: keys.indexOf("⌫")>=0 };})()');
console.log('   密码键盘：' + JSON.stringify(pad));
if (!pad) { console.log('   ⚠️ 找不到密码键盘'); problems++; }
else {
  if (pad.n !== 12) { console.log('   ⚠️ 键盘应该是 12 个键（3×4 排满），实际 ' + pad.n); problems++; }
  if (pad.rows !== 4) { console.log('   ⚠️ 键盘应该是 4 行，实际 ' + pad.rows); problems++; }
  if (pad.lastRow.length !== 3) {
    console.log('   ⚠️ 最后一行应该排满 3 个，实际 ' + pad.lastRow.length + '：' + pad.lastRow.join(','));
    problems++;
  }
  if (pad.lastRow.join(',') !== '清空,0,删除') {
    console.log('   ⚠️ 最后一行应该是「清空 0 删除」，实际 ' + pad.lastRow.join(' ')); problems++;
  }
  if (pad.fnCount !== 2) { console.log('   ⚠️ 「清空 / 删除」没被标成功能键'); problems++; }
  if (pad.hasBackspaceChar) { console.log('   ⚠️ 还在用 ⌫ 字符（字体缺字形会渲染成方框）'); problems++; }
}

/* 「默认 1234」这句只在还是初始密码时才该出现 */
const defaultHint = await evaluate('(function(){' +
  'var t=document.querySelector(".pin-gate").textContent;' +
  'var pin=(window.__hbPin===undefined)?"":window.__hbPin;' +
  'return { saysDefault: /默认\\s*1234/.test(t), saysInitial: /初始密码/.test(t) };})()');
const realPin = await evaluate('fetch("/api/state/" + new URLSearchParams(location.search).get("room"))' +
  '.then(function(r){return r.json();}).then(function(j){return j.state.settings.parentPin;})');
console.log('   提示文案：' + JSON.stringify(defaultHint) + '，房间里的密码=' + realPin);
if (realPin === '1234' && !defaultHint.saysInitial) {
  console.log('   ⚠️ 还是初始密码却没提示 1234'); problems++;
}
if (realPin !== '1234' && defaultHint.saysDefault) {
  console.log('   ⚠️ 密码已经不是 1234 了，界面还在写「默认 1234」'); problems++;
}

/* 「清空」和「删除」得真的能用 */
await mustClick('[data-act="pin-key"][data-key="1"]', '数字 1');
await mustClick('[data-act="pin-key"][data-key="2"]', '数字 2');
const dotsAfter2 = await evaluate('document.querySelectorAll(".pin-dots i.on").length');
await mustClick('[data-act="pin-key"][data-key="删除"]', '删除键');
const dotsAfterDel = await evaluate('document.querySelectorAll(".pin-dots i.on").length');
await mustClick('[data-act="pin-key"][data-key="3"]', '数字 3');
await mustClick('[data-act="pin-key"][data-key="清空"]', '清空键');
const dotsAfterClear = await evaluate('document.querySelectorAll(".pin-dots i.on").length');
console.log('   删除/清空：按 2 个=' + dotsAfter2 + ' → 删除后=' + dotsAfterDel + ' → 清空后=' + dotsAfterClear);
if (dotsAfter2 !== 2 || dotsAfterDel !== 1) { console.log('   ⚠️ 「删除」没按预期减少一位'); problems++; }
if (dotsAfterClear !== 0) { console.log('   ⚠️ 「清空」没清干净'); problems++; }

/* ---- 物理键盘也要能敲密码（顺便就用它解锁） ---- */
async function pressKey(key, vk) {
  const base = { key: key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, base));
  await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
  await sleep(90);
}

await pressKey('1', 49);
await pressKey('2', 50);
const kbDots2 = await evaluate('document.querySelectorAll(".pin-dots i.on").length');
await pressKey('Backspace', 8);
const kbDots1 = await evaluate('document.querySelectorAll(".pin-dots i.on").length');
await pressKey('3', 51);
const kbDots2b = await evaluate('document.querySelectorAll(".pin-dots i.on").length');
console.log('   键盘输入：敲 1,2 → ' + kbDots2 + ' 位 → Backspace → ' + kbDots1 +
  ' 位 → 再敲 3 → ' + kbDots2b + ' 位');
if (kbDots2 !== 2) { console.log('   ⚠️ 键盘敲数字没反应'); problems++; }
if (kbDots1 !== 1) { console.log('   ⚠️ 键盘 Backspace 没退位'); problems++; }
if (kbDots2b !== 2) { console.log('   ⚠️ 键盘继续输入不对（期望 2 位，实际 ' + kbDots2b + '）'); problems++; }

// Delete 清空
await pressKey('Delete', 46);
const kbCleared = await evaluate('document.querySelectorAll(".pin-dots i.on").length');
if (kbCleared !== 0) { console.log('   ⚠️ 键盘 Delete 没清空'); problems++; }

// 用键盘输完整密码解锁
for (const [k, vk] of [['1', 49], ['2', 50], ['3', 51], ['4', 52]]) await pressKey(k, vk);
await sleep(400);
const kbUnlocked = await evaluate('Boolean(document.querySelector(\'[data-act="parent-tab"]\'))');
console.log('   用键盘输 1234 解锁：' + (kbUnlocked ? '成功 ✓' : '失败 ✗'));
if (!kbUnlocked) { console.log('   ⚠️ 键盘输完密码没解锁'); problems++; }

/* 粘贴一段真实的钉钉作业，检查输入框宽度和识别结果 */
await evaluate('(function(){var b=document.querySelector("#paste-box");' +
  'b.value="各位家长好，今天的作业如下：\\n语文：背诵《静夜思》，家长签字\\n数学：口算练习册 P20\\n1. 英语跟读 Unit 3\\n【美术】画一幅秋天的画\\n明天带红领巾";' +
  'document.querySelector(\'[data-act="parse"]\').click();})()');
await sleep(700);
const previewCount = await evaluate('document.querySelectorAll(".preview-item").length');
console.log('   识别出 ' + previewCount + ' 条');
if (previewCount !== 5) { console.log('   ⚠️ 预期 5 条（开场白要丢掉，剩下 5 行作业）'); problems++; }
await shot('5-parent-homework');

/* 点一条识别结果，应该弹出修改框 */
await mustClick('.preview-item[data-i="1"]', '识别结果第 2 条');const modalOpen = await evaluate('Boolean(document.querySelector(".modal"))');
if (!modalOpen) { console.log('   ⚠️ 识别结果点不开修改框'); problems++; }

/* 第 63 轮：备注要是**多行文本框**，和「修改常用作业」一个样子 */
{
  const fields = await evaluate('(function(){' +
    'var m=document.querySelector(".modal"); if(!m) return null;' +
    'var out=[].slice.call(m.querySelectorAll(".form-row")).map(function(r){' +
    '  var lab=(r.querySelector("label")||{}).textContent||"";' +
    /*
     * 判断顺序有讲究：附件区的文件 input 是 type="file" + hidden 属性，
     * 先找 input 的话会把它当成普通输入框。所以 .att-field 要先判。
     */
    '  var f=r.querySelector(".att-field")?"att-field":' +
    '    (r.querySelector("textarea")?"textarea":' +
    '    (r.querySelector("select")?"select":' +
    '    (r.querySelector("input:not([type=hidden])")?"input":"?")));' +
    '  return lab+":"+f; });' +
    'var ta=m.querySelector(\'textarea[data-key="detail"]\');' +
    'return { fields:out, tag:ta?ta.tagName:"(没有)", rows:ta?ta.rows:0,' +
    '  h:ta?Math.round(ta.getBoundingClientRect().height):0 };})()');
  console.log('   识别结果的修改弹窗：' + JSON.stringify(fields));
  if (!fields) {
    console.log('   ⚠️ 量不到识别结果的修改弹窗'); problems++;
  } else {
    if (fields.tag !== 'TEXTAREA') {
      console.log('   ⚠️ 备注不是多行文本框：' + fields.tag); problems++;
    }
    if (fields.rows !== 3) {
      console.log('   ⚠️ 备注文本框不是 3 行：' + fields.rows); problems++;
    }
    if (fields.h < 60) {
      console.log('   ⚠️ 备注框太矮（' + fields.h + 'px），装不下多行'); problems++;
    }
    if (fields.fields.join(',') !== '科目:select,内容:input,备注:textarea,附件:att-field') {
      console.log('   ⚠️ 字段顺序/类型和「修改常用作业」不一致：' + fields.fields.join(',')); problems++;
    }
  }
}
await shot('6-preview-edit');
/* 改科目再保存 */
await evaluate('(function(){var s=document.querySelector(\'.modal [data-key="subject"]\'); s.value="科学";' +
  'document.querySelector(".modal .btn.primary").click();})()');
await sleep(500);
const changed = await evaluate('document.querySelector(\'.preview-item[data-i="1"] .badge\').textContent');
console.log('   改完科目是：' + changed);
if (changed !== '科学') { console.log('   ⚠️ 修改没生效'); problems++; }
await shot('7-preview-edited');

/* ---- 周日期条：7 天，点一下切换，两边能翻周 ---- */
const wkCells = await evaluate('document.querySelectorAll(".wk-cell").length');
console.log('   周日期条格子数：' + wkCells);
if (wkCells !== 7) { console.log('   ⚠️ 周日期条不是 7 天'); problems++; }

const arrowBox = await evaluate('(function(){var r=document.querySelector(".icon-btn.sm").getBoundingClientRect();' +
  'return Math.round(r.width) + "x" + Math.round(r.height);})()');
const hintAlign = await evaluate('(function(){var t=document.querySelector(".wk-text").getBoundingClientRect();' +
  'var s=document.querySelector(".wk-cell").getBoundingClientRect();return Math.round(t.left - s.left);})()');
console.log('   翻周按钮：' + arrowBox + 'px，「今天·星期」与周一左对齐偏差：' + hintAlign + 'px');
if (parseFloat(arrowBox) < 40) { console.log('   ⚠️ 翻周按钮太小'); problems++; }
if (Math.abs(hintAlign) > 2) { console.log('   ⚠️ 下面的日期文字没和周一左对齐'); problems++; }

/* ---- 「识别」两个按钮：靠右、同一行 ---- */
const parseBtns = await evaluate('(function(){var b=document.querySelector(".btn-row.right");' +
  'if(!b) return null;var bs=b.querySelectorAll(".btn");' +
  'var r1=bs[0].getBoundingClientRect(),r2=bs[1].getBoundingClientRect(),br=b.getBoundingClientRect();' +
  'return { sameLine: Math.abs(r1.top-r2.top) < 2, rightAligned: r2.right >= br.right - 2, n: bs.length };})()');
console.log('   识别按钮：' + JSON.stringify(parseBtns));
if (!parseBtns || !parseBtns.sameLine || !parseBtns.rightAligned) {
  console.log('   ⚠️ 「智能识别 / 识别并直接添加」没有靠右且同一行'); problems++;
}

/* ---- 「✨ 额外的任务」：孩子自己加的，家长要能编辑 / 删除 / 调顺序 ---- */
/* （这里本来就已经是"今天"了，「回到今天」那个按钮只有切到别的日期才出现） */
const extrasUI = await evaluate('(function(){' +
  'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
  'var h=hs.filter(function(x){return x.textContent.indexOf("额外的任务")>=0;})[0];' +
  'if(!h) return {found:false};' +
  'var sec=h.closest(".panel");' +
  'var rows=[].slice.call(sec.querySelectorAll(".row-item, .card"));' +
  'var first=rows[0];' +
  'var btnTexts=first?[].slice.call(first.querySelectorAll(".act-btn"))' +
  '  .map(function(b){return b.getAttribute("data-act");}):[];' +
  'var tip=sec.querySelector(".extras-tip");' +
  'var tipR=tip?tip.getBoundingClientRect():null;' +
  'var firstR=first?first.getBoundingClientRect():null;' +
  'return { found:true, title:h.textContent.trim(), rows:rows.length,' +
  '  btnActs:btnTexts,' +
  '  tipText:tip?tip.textContent.trim():"",' +
  '  提示到卡片间距: (tipR&&firstR)?Math.round(firstR.top-tipR.bottom):null };})()');

console.log('   额外任务区块：' + JSON.stringify(extrasUI));
if (!extrasUI.found) {
  console.log('   ⚠️ 家长端没有「✨ 额外的任务」区块（演示数据里应当有两条）'); problems++;
} else {
  if (extrasUI.btnActs.indexOf('extra-edit') < 0) {
    console.log('   ⚠️ 额外任务没有「编辑」按钮：' + JSON.stringify(extrasUI.btnActs)); problems++;
  }
  if (extrasUI.btnActs.indexOf('extra-del') < 0) {
    console.log('   ⚠️ 额外任务没有「删除」按钮'); problems++;
  }
  if (extrasUI.btnActs.indexOf('move') < 0) {
    console.log('   ⚠️ 额外任务没有排序按钮'); problems++;
  }
  if (extrasUI.tipText.indexOf('不合适可编辑或删除') < 0) {
    console.log('   ⚠️ 说明文字不对：' + extrasUI.tipText); problems++;
  }
  if (!(extrasUI['提示到卡片间距'] >= 8)) {
    console.log('   ⚠️ 说明文字和卡片挨太紧，间距只有 ' + extrasUI['提示到卡片间距'] + 'px'); problems++;
  }
}
/* 滚到这一块再拍，不然截到的是页面顶部 */
await evaluate('(function(){' +
  'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
  'var h=hs.filter(function(x){return x.textContent.indexOf("额外的任务")>=0;})[0];' +
  'if(h) h.scrollIntoView({block:"start"});' +
  'var sc=document.getElementById("scroller"); if(sc) sc.scrollTop = Math.max(0, sc.scrollTop - 70);' +
  'return 1;})()');
await sleep(600);
await shot('35-parent-extras');

/* 点一下「编辑」，改标题和分值，确认真的存下来了 */
if (extrasUI.found && extrasUI.btnActs.indexOf('extra-edit') >= 0) {
  const beforeTitle = await evaluate('(function(){' +
    'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
    'var h=hs.filter(function(x){return x.textContent.indexOf("额外的任务")>=0;})[0];' +
    'var sec=h.closest(".panel"); var row=sec.querySelector(".row-item, .card");' +
    'return row?(row.querySelector(".ri-title")||row).textContent.trim():"";})()');
  await mustClick('[data-act="extra-edit"]', '额外任务的编辑按钮');
  await sleep(500);
  const modal = await evaluate('(function(){' +
    'var m=document.querySelector(".modal"); if(!m) return {open:false};' +
    'var ins=[].slice.call(m.querySelectorAll("input, textarea, select"));' +
    'return { open:true, title:(m.querySelector("h2,h3")||{}).textContent||"",' +
    '  fields:ins.map(function(i){return i.dataset.key||i.type;}) };})()');
  console.log('   点编辑弹出来的框：' + JSON.stringify(modal));
  if (!modal.open) { console.log('   ⚠️ 点了编辑没弹框'); problems++; }
  else {
    if (modal.fields.indexOf('emoji') < 0 || modal.fields.indexOf('title') < 0 ||
        modal.fields.indexOf('points') < 0) {
      console.log('   ⚠️ 编辑框缺字段（要有 图标/内容/小红花）：' + JSON.stringify(modal.fields)); problems++;
    }
    // 按 data-key 精确填，别靠"第一个非数字输入框"猜（图标那个也是 text）
    await evaluate('(function(){' +
      'var m=document.querySelector(".modal");' +
      'var t=m.querySelector(\'[data-key="title"]\');' +
      'var n=m.querySelector(\'[data-key="points"]\');' +
      'var e=m.querySelector(\'[data-key="emoji"]\');' +
      'if(t) t.value="家长改过的额外任务";' +
      'if(n) n.value="7";' +
      'if(e) e.value="📘";' +
      'return 1;})()');
    await mustClick('.modal .btn.primary', '保存');
    await sleep(1200);
    const after = await evaluate('(function(){' +
      'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
      'var h=hs.filter(function(x){return x.textContent.indexOf("额外的任务")>=0;})[0];' +
      'var sec=h.closest(".panel"); var row=sec.querySelector(".row-item, .card");' +
      'return { text: row?row.textContent.replace(/\\s+/g," ").trim():"" };})()');
    console.log('   改之前：' + beforeTitle);
    console.log('   改之后：' + after.text);
    if (after.text.indexOf('家长改过的额外任务') < 0) {
      console.log('   ⚠️ 改了标题但卡片上没变'); problems++;
    }
    if (after.text.indexOf('+7⭐') < 0) {
      console.log('   ⚠️ 改了分值但卡片上没变'); problems++;
    }
    if (after.text.indexOf('📘') < 0) {
      console.log('   ⚠️ 改了图标但卡片上没变'); problems++;
    }
  }
  await shot('36-parent-extras-edited');
}

/* ---- 「录入作业」三种方式收成三个页签 ---- */
const tabs = await evaluate('(function(){' +
  'var t=[].slice.call(document.querySelectorAll(".add-tabs .subtab"));' +
  'return { n:t.length, on:t.filter(function(x){return x.classList.contains("on");})' +
  '    .map(function(x){return x.dataset.tab;}),' +
  '  pasteVisible: Boolean(document.getElementById("paste-box")),' +
  '  manualVisible: Boolean(document.getElementById("add-detail")) };})()');
console.log('   录作业页的选项卡：' + JSON.stringify(tabs));
if (tabs.n !== 3) { console.log('   ⚠️ 应该是三个页签（粘贴 / 手动 / 常用库），实际 ' + tabs.n + ' 个'); problems++; }
if (tabs.pasteVisible && tabs.manualVisible) {
  console.log('   ⚠️ 多个页签的内容同时显示，没起到省空间的作用'); problems++;
}
if (!tabs.pasteVisible) { console.log('   ⚠️ 默认应该显示「从钉钉粘贴」'); problems++; }
await shot('37-add-tabs');

// 切到「手动加一条」，备注必须是多行输入
await mustClick('[data-act="add-tab"][data-tab="manual"]', '手动加一条页签');
await sleep(400);
const afterTab = await evaluate('(function(){' +
  'return { pasteVisible: Boolean(document.getElementById("paste-box")),' +
  '  manualVisible: Boolean(document.getElementById("add-detail")),' +
  '  detailTag: (document.getElementById("add-detail")||{}).tagName||"" };})()');
console.log('   切到手动页签：' + JSON.stringify(afterTab));
if (!afterTab.manualVisible || afterTab.pasteVisible) { console.log('   ⚠️ 切页签没换内容'); problems++; }
if (afterTab.detailTag !== 'TEXTAREA') { console.log('   ⚠️ 备注还是单行输入框'); problems++; }
await shot('38-add-tab-manual');

/* ---- 「录入作业」要有和别的面板一样的标题，页签贴在白卡上 ---- */
const addHead = await evaluate('(function(){' +
  'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
  'var h=hs.filter(function(x){return x.textContent.indexOf("录入作业")>=0;})[0];' +
  'if(!h) return {found:false};' +
  'var other=hs.filter(function(x){return x.textContent.indexOf("录入作业")<0;})[0];' +
  'var tabs=document.querySelector(".add-tabs");' +
  'var card=document.querySelector(".add-tabs + .form-card");' +
  'return { found:true,' +
  '  sameHeadSize: other ? Math.round(parseFloat(getComputedStyle(h).fontSize)) ===' +
  '    Math.round(parseFloat(getComputedStyle(other).fontSize)) : null,' +
  '  tabsTop: tabs?Math.round(tabs.getBoundingClientRect().top):0,' +
  '  cardTop: card?Math.round(card.getBoundingClientRect().top):0,' +
  '  cardLeft: card?Math.round(card.getBoundingClientRect().left):0,' +
  '  tabsLeft: tabs?Math.round(tabs.getBoundingClientRect().left):0 };})()');
console.log('   录入作业标题：' + JSON.stringify(addHead));
if (!addHead.found) { console.log('   ⚠️ 没有「录入作业」标题'); problems++; }
if (addHead.sameHeadSize === false) { console.log('   ⚠️ 「录入作业」标题字号和别的面板不一致'); problems++; }

/* ---- 第三个页签：从常用作业库选择 ---- */
await mustClick('[data-act="add-tab"][data-tab="common"]', '常用作业库页签');
await sleep(400);
const commonUI = await evaluate('(function(){' +
  'var rows=[].slice.call(document.querySelectorAll(".common-item"));' +
  'return { rows:rows.length,' +
  // 「往库里加一条」的表单和「手动加一条」的「添加并存进常用库」重复，已经删掉了
  '  hasOldForm:Boolean(document.getElementById("common-title")),' +
  '  hasOldBtn:Boolean(document.querySelector(\'[data-act="common-add"]\')),' +
  '  addTitle:(rows[0]?rows[0].querySelector(".ri-title").textContent.trim():"") };})()');
console.log('   常用作业库：' + JSON.stringify(commonUI));
if (commonUI.rows < 1) { console.log('   ⚠️ 常用作业库是空的（应该有默认几条）'); problems++; }
if (commonUI.hasOldForm || commonUI.hasOldBtn) {
  console.log('   ⚠️ 常用库页签里还留着「往库里加一条」的表单（和「添加并存进常用库」重复）'); problems++;
}

/*
 * ★ 第 83 轮：常用作业库要按科目次序排 —— 语文、数学、英语、科学、美术、
 *   音乐、体育、道法、其他，同一科目内部保持原顺序。
 */
{
  const RANK = ['语文', '数学', '英语', '科学', '美术', '音乐', '体育', '道法'];
  const rk = function (s) { const i = RANK.indexOf(s); return i < 0 ? RANK.length : i; };
  const libOrder = await evaluate('[].slice.call(document.querySelectorAll(".common-item .ri-subj"))' +
    '.map(function(x){return x.textContent.trim();})');
  console.log('   常用库里的科目顺序：' + JSON.stringify(libOrder));
  if (!libOrder.length) {
    console.log('   ⚠️ 常用库里读不到科目（排序断言跳过）'); problems++;
  } else if (!libOrder.every(function (s, i) { return i === 0 || rk(libOrder[i - 1]) <= rk(s); })) {
    console.log('   ⚠️ 常用库没有按科目次序排：' + JSON.stringify(libOrder)); problems++;
  }
}

/* ---- 「加进这一天」：重复的在今天要不重复加 / 同名不同备注要问覆盖 ---- */
const libTitlesNow = await evaluate('[].slice.call(document.querySelectorAll(".common-item .ri-title"))' +
  '.map(function(x){return x.textContent.trim();})');

// 先记下今天已有一条的标题（第一条库条目可能今天还没有）
const firstLib = await evaluate('(function(){' +
  'var b=document.querySelector(\'.common-item [data-act="common-use"]\');' +
  'if(!b) return null;' +
  'var row=b.closest(".common-item");' +
  'return { id:b.dataset.id, title:row.querySelector(".ri-title").textContent.trim(),' +
  '  detail:(row.querySelector(".ri-note-line")||{}).textContent||"" };})()');
if (firstLib) {
  const hwCount = () => todayHomeworkCount();
  const n0 = await hwCount();
  await mustClick('.common-item [data-act="common-use"]', '加进这一天（第一次）');
  await sleep(1300);
  const n1 = await hwCount();
  console.log('   加进这一天：' + n0 + ' → ' + n1);
  if (n1 !== n0 + 1) { console.log('   ⚠️ 加进这一天没生效（' + n0 + ' → ' + n1 + '）'); problems++; }

  // 再点同一条：标题和备注都一样 → 不该重复添加
  await mustClick('.common-item [data-act="common-use"]', '加同一条（第二次）');
  await sleep(1300);
  const n2 = await hwCount();
  console.log('   同样的一条再点一次：' + n1 + ' → ' + n2 + '（应该不变）');
  if (n2 !== n1) {
    console.log('   ⚠️ 标题和备注都一样的作业被重复添加了（' + n1 + ' → ' + n2 + '）'); problems++;
  }
}

/*
 * 加完之后**立刻**用真鼠标点 ☆ / 📋。
 *
 * 这一步是专门为"点没反应"准备的：mustClick 用的是 el.click()，会绕过命中测试，
 * 元素被盖住或在屏幕外它照样"点得到"。realClick 走真正的鼠标事件。
 */
await mustClick('[data-act="add-tab"][data-tab="paste"]', '粘贴页签');
await sleep(300);
{
  const libBefore = await evaluate('document.querySelectorAll(".common-item").length');
  const hit = await page.realClick('.row-item [data-act="to-common"]', 900);
  console.log('   真鼠标点 ☆，落点上是：' + hit.tag + '.' + hit.cls + '|' + hit.act);
  if (hit.act !== 'to-common') {
    console.log('   ⚠️ 真鼠标点 ☆ 时落点被别人接走了：' + hit.act); problems++;
  }
  /*
   * ★ 第 76 轮：☆ 不再直接存，而是先问「存到哪」——
   *   常用作业库 / 每日任务。
   */
  const chooser = await evaluate('(function(){' +
    'var m=document.querySelector(".modal"); if(!m) return null;' +
    'var sel=m.querySelector(\'[data-key="dest"]\');' +
    'return { title:(m.querySelector("h3")||{}).textContent||"",' +
    '  options: sel?[].slice.call(sel.options).map(function(o){return o.value;}):[] };})()');
  console.log('   点 ☆ 之后：' + JSON.stringify(chooser));
  if (!chooser || chooser.options.join(',') !== 'common,task') {
    console.log('   ⚠️ ☆ 应该让选「常用作业库 / 每日任务」：' + JSON.stringify(chooser)); problems++;
  } else {
    // 选「常用作业库」→ 真的存进去
    await mustClick('.modal .btn.primary', '存进常用库');
    await sleep(1500);
    const libAfter = await evaluate('document.querySelectorAll(".common-item").length');
    console.log('   常用库条数：' + libBefore + ' → ' + libAfter);
    if (!(libAfter >= libBefore)) {
      console.log('   ⚠️ 选「常用作业库」之后库里没多出来：' + libBefore + ' → ' + libAfter); problems++;
    }
    // 同名的时候会先弹覆盖确认，关掉
    if (await evaluate('Boolean(document.querySelector(".modal"))')) {
      await mustClick('.modal .btn.primary', '确定');
      await sleep(700);
    }
  }
}

/*
 * ★ 第 76 轮 2：从作业转成每日任务时，标签默认「功课」，而且能改。
 */
{
  await mustClick('[data-act="parent-tab"][data-tab="hw"]', '录入作业标签');
  await sleep(800);
  await mustClick('.row-item [data-act="to-common"]', '☆ 添加到常用');
  await sleep(800);
  await evaluate('(function(){' +
    'var sel=document.querySelector(\'.modal [data-key="dest"]\');' +
    'sel.value="task"; document.querySelector(".modal .btn.primary").click(); return 1;})()');
  await sleep(1100);
  const pre = await evaluate('(function(){' +
    'var m=document.querySelector(".modal"); if(!m) return null;' +
    'var tag=m.querySelector(\'input[data-key="tag"]\');' +
    'var on=[].slice.call(m.querySelectorAll(".chip-picks.inline .chip"))' +
    '  .filter(function(c){return !c.closest(".sched-field");})' +
    '  .filter(function(c){return c.classList.contains("on");}).map(function(c){return c.textContent;});' +
    'return { title:(m.querySelector("h3")||{}).textContent||"",' +
    '  name:(m.querySelector(\'input[data-key="title"]\')||{}).value||"",' +
    '  tag:tag?tag.value:"", lit:on,' +
    '  labels:[].slice.call(m.querySelectorAll(".form-row > label")).map(function(l){' +
    '    return l.textContent;}) };})()');
  console.log('   作业 → 每日任务：' + JSON.stringify(pre));
  if (!pre || pre.title !== '添加到每日任务') {
    console.log('   ⚠️ 选「每日任务」应该打开预填的「添加到每日任务」：' + JSON.stringify(pre)); problems++;
  } else {
    if (!pre.name) { console.log('   ⚠️ 任务名没带过来'); problems++; }
    if (pre.tag !== '功课') {
      console.log('   ⚠️ 标签默认不是「功课」：' + pre.tag); problems++;
    }
    if (pre.lit.join(',') !== '功课') {
      console.log('   ⚠️「功课」这个快捷选项没亮着：' + pre.lit.join(',')); problems++;
    }
    if (pre.labels.join(',') !== '图标,任务,标签,备注,附件,有效期,小红花') {
      console.log('   ⚠️ 表单字段顺序不对：' + pre.labels.join(',')); problems++;
    }
    // 改成「生活」应该能存成「生活」
    await evaluate('(function(){' +
      'var m=document.querySelector(".modal");' +
      'var c=[].slice.call(m.querySelectorAll(".chip-picks.inline .chip"))' +
      '  .filter(function(x){return x.textContent==="生活";})[0];' +
      'c.click(); m.querySelector(".btn.primary").click(); return 1;})()');
    await sleep(1700);
    const task = await evaluate('fetch("/api/state/' + room + '").then(function(r){' +
      'return r.json();}).then(function(j){' +
      'var t=j.state.dailyTasks.filter(function(x){' +
      '  return x.title===' + JSON.stringify(pre.name) + ';})[0];' +
      'return t?t.tag:null;})');
    console.log('   改成「生活」之后存下来的标签：' + JSON.stringify(task));
    if (task !== '生活') {
      console.log('   ⚠️ 标签没按家长改的存下来（应该是生活）：' + task); problems++;
    }
  }
}

/* ---- 排序按钮：三个列表（今天的作业 / 任务奖励 / 常用库）要长一个样 ---- */
const moveStyle = async (scope) => await evaluate(`(function(){
  var b=document.querySelector(${JSON.stringify(scope)});
  if(!b) return null;
  var cs=getComputedStyle(b), r=b.getBoundingClientRect();
  return { cls:b.className, w:Math.round(r.width), h:Math.round(r.height),
    color:cs.color, bg:cs.backgroundColor, text:b.textContent.trim(),
    list:b.dataset.list||'', dir:b.dataset.dir||'' };
})()`);
const hwMove = await moveStyle('.panel [data-act="move"]');
console.log('   今天的作业里的排序按钮：' + JSON.stringify(hwMove));
if (!hwMove) { console.log('   ⚠️ 今天的作业列表里没有排序按钮'); problems++; }
else if (hwMove.text !== '↑') { console.log('   ⚠️ 排序按钮文字不对：' + hwMove.text); problems++; }

/* ---- 常用的排序按钮要在常用库页签里看（第 2 条） ---- */
await mustClick('[data-act="add-tab"][data-tab="common"]', '常用库页签');
await sleep(600);
const commonMove = await evaluate(`(function(){
  var rows=[].slice.call(document.querySelectorAll('.common-item'));
  var out=[];
  rows.slice(0,2).forEach(function(row){
    var ups=[].slice.call(row.querySelectorAll('[data-act="move"]'));
    out.push({ n:ups.length, lists:ups.map(function(b){return b.dataset.list;}) });
  });
  return out;
})()`);
console.log('   常用库条目里的排序按钮：' + JSON.stringify(commonMove));
if (!commonMove.length || commonMove[0].n !== 2) {
  console.log('   ⚠️ 常用作业库没有排序按钮（每条要有 ↑↓）'); problems++;
} else if (commonMove[0].lists.some(function (l) { return l !== 'common'; })) {
  console.log('   ⚠️ 常用库排序按钮的 data-list 不是 common：' + JSON.stringify(commonMove[0].lists)); problems++;
}
// 和「今天的作业」里的排序按钮必须是同一套（同 class、同尺寸、同配色）
const libMove = await moveStyle('.common-item [data-act="move"]');
console.log('   常用库里的排序按钮：' + JSON.stringify(libMove));
if (hwMove && libMove) {
  if (libMove.cls !== hwMove.cls) {
    console.log('   ⚠️ 常用库排序按钮 class 和作业列表不一致：' + libMove.cls + ' vs ' + hwMove.cls); problems++;
  }
  if (libMove.w !== hwMove.w || libMove.h !== hwMove.h) {
    console.log('   ⚠️ 常用库排序按钮尺寸和作业列表不一致：' +
      libMove.w + 'x' + libMove.h + ' vs ' + hwMove.w + 'x' + hwMove.h); problems++;
  }
  if (libMove.color !== hwMove.color || libMove.bg !== hwMove.bg) {
    console.log('   ⚠️ 常用库排序按钮配色和作业列表不一致'); problems++;
  }
}
await mustClick('[data-act="add-tab"][data-tab="paste"]', '粘贴页签');
await sleep(400);

/*
 * 「按下 → 列表重排 → 抬起」这一下点击不能丢。
 *
 * 机制：按下和抬起落在不同元素上时，浏览器把 click 派发到两者的**共同祖先**
 * （通常是 #view），祖先没有 data-act，于是什么也不做 —— 用户看到的就是
 * "按钮明明在那、点了没反应"。加进这一天之后列表多一行、滚动锚定微调，
 * 都会造成这种重排。app.js 里按下时记下按钮、落空时补一刀。
 */
{
  const pt = await evaluate('(function(){' +
    'var b=document.querySelector(\'.row-item [data-act="to-common"]\');' +
    'if(!b) return null; b.scrollIntoView({block:"center"}); return 1;})()');
  if (!pt) { console.log('   ⚠️ 找不到 ☆（重排测试跳过）'); problems++; }
  else {
    await sleep(400);
    const pt2 = await evaluate('(function(){' +
      'var b=document.querySelector(\'.row-item [data-act="to-common"]\');' +
      'var r=b.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 };})()');
    await page.send('Input.dispatchMouseEvent',
      { type: 'mousePressed', x: pt2.x, y: pt2.y, button: 'left', clickCount: 1 });
    await sleep(40);
    // 趁按住不放，把列表顶下去 160px —— 模拟"刚加了一条作业"的重排
    await page.evaluate('(function(){var v=document.getElementById("view");' +
      'var d=document.createElement("div"); d.id="__reflow"; d.style.height="160px";' +
      'v.insertBefore(d, v.firstChild); return 1;})()');
    await sleep(120);
    await page.send('Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: pt2.x, y: pt2.y, button: 'left', clickCount: 1 });
    await sleep(1000);
    const modalAfterReflow = await evaluate('(function(){' +
      'var m=document.querySelector(".modal");' +
      'return m?((m.querySelector("h3")||{}).textContent||"有弹窗"):"";})()');
    console.log('   按下后重排再抬起：处理结果=' + JSON.stringify(modalAfterReflow));
    if (!modalAfterReflow) {
      console.log('   ⚠️ 按下和抬起之间内容重排时，这一下点击丢了（点 ☆ 应该有反应）'); problems++;
    } else {
      await mustClick('.modal .btn.ghost', '关掉弹窗');
      await sleep(500);
    }
    await page.evaluate('(function(){var d=document.getElementById("__reflow"); if(d) d.remove(); return 1;})()');
    await sleep(400);
  }
}

/*
 * 「按下 → 整块重渲染 → 抬起」这一下也不能丢。
 *
 * 和上面那个"重排"是两个不同的成因：同步完成后 poll() 会 render() 把
 * innerHTML 整块换掉，按下时那个按钮就变成"已分离"的孤儿（不在 document 里）。
 * 只判断 document.contains(旧元素) 会直接放弃 → 点了没反应。
 * 正确做法是用 data 属性拼出的选择器在新 DOM 里找回同一个按钮。
 */
{
  const ok1 = await evaluate('(function(){' +
    'var b=document.querySelector(\'.row-item [data-act="hw-edit"]\');' +
    'if(!b) return false; b.scrollIntoView({block:"center"}); return true;})()');
  if (!ok1) { console.log('   ⚠️ 找不到 ✎（重渲染测试跳过）'); problems++; }
  else {
    await sleep(400);
    const pt = await evaluate('(function(){' +
      'var b=document.querySelector(\'.row-item [data-act="hw-edit"]\');' +
      'var r=b.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 };})()');
    await page.send('Input.dispatchMouseEvent',
      { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(40);
    // 按住不放，强制整块重渲染（等价于 poll() 回来后 render()）
    const gone = await page.evaluate('(function(){' +
      'var old=document.querySelector(\'.row-item [data-act="hw-edit"]\');' +
      'var root=document.getElementById("view");' +
      'var keep=root.innerHTML; root.innerHTML=""; root.innerHTML=keep;' +
      'var now=document.querySelector(\'.row-item [data-act="hw-edit"]\');' +
      'return { replaced: old !== now, oldInDoc: document.contains(old) };})()');
    console.log('   重渲染：' + JSON.stringify(gone));
    await sleep(120);
    await page.send('Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(1000);
    const m2 = await evaluate('(function(){var m=document.querySelector(".modal");' +
      'return m?((m.querySelector("h3")||{}).textContent||"有弹窗"):"";})()');
    console.log('   按下后被整块重渲染，再抬起：' + JSON.stringify(m2));
    if (!m2) {
      console.log('   ⚠️ 按下和抬起之间整块重渲染时，这一下点击丢了（点 ✎ 应该弹出修改框）'); problems++;
    } else {
      await mustClick('.modal .btn.ghost', '关掉弹窗');
      await sleep(500);
    }
  }
}

// 上面几段末尾切到了粘贴页签，这儿要先回常用库页签才能量到常用库的按钮
await mustClick('[data-act="add-tab"][data-tab="common"]', '常用库页签');
await sleep(600);
const libBtns = await evaluate('(function(){' +
  'var row=document.querySelector(".common-item");' +
  'if(!row) return [];' +
  'return [].slice.call(row.querySelectorAll(".ri-tools .act-btn")).map(function(b){' +
  '  var r=b.getBoundingClientRect();' +
  '  return { act:b.dataset.act, cls:b.className, w:Math.round(r.width), h:Math.round(r.height) }; });})()');
console.log('   常用库行的按钮：' + JSON.stringify(libBtns));
{
  const addBtn = libBtns.filter(function (b) { return b.act === 'common-use'; })[0];
  const sibs = libBtns.filter(function (b) { return b.act === 'common-edit' || b.act === 'common-del'; });
  if (addBtn && sibs.length) {
    if (sibs.some(function (s) { return s.w !== addBtn.w || s.h !== addBtn.h; })) {
      console.log('   ⚠️「加」和旁边的 ✎ ✕ 尺寸不一致：' +
        addBtn.w + 'x' + addBtn.h + ' vs ' + JSON.stringify(sibs.map(function (s) { return s.w + 'x' + s.h; }))); problems++;
    }
    if (addBtn.cls.indexOf('wide') >= 0) {
      console.log('   ⚠️「加」还是加宽的，和旁边按钮不一致：' + addBtn.cls); problems++;
    }
  }
}

/* ---- 全站的行内小按钮都要是「圆角方框」，而且各模块长得一样（第 3 条） ---- */
{
  const shapes = await evaluate(`(function(){
    var picks = [
      ['作业-排序', '.panel [data-act="move"]'],
      ['常用库-修改', '.common-item [data-act="common-edit"]'],
      ['常用库-加', '.common-item [data-act="common-use"]'],
      ['常用库-删', '.common-item [data-act="common-del"]'],
      ['作业-添加到常用', '.row-item [data-act="to-common"]']
    ];
    return picks.map(function(p){
      var b=document.querySelector(p[1]);
      if(!b) return { name:p[0], missing:true };
      var cs=getComputedStyle(b), r=b.getBoundingClientRect();
      return { name:p[0], radius:cs.borderRadius, w:Math.round(r.width), h:Math.round(r.height),
        isCircle: cs.borderRadius === '50%' || parseFloat(cs.borderRadius) >= r.width/2 };
    });
  })()`);
  console.log('   行内按钮的形状：' + JSON.stringify(shapes));
  const circles = shapes.filter(function (s) { return s.isCircle; });
  if (circles.length) {
    console.log('   ⚠️ 还有按钮是正圆，应该统一成圆角方框：' +
      JSON.stringify(circles.map(function (c) { return c.name + '=' + c.radius; }))); problems++;
  }
  const radii = shapes.filter(function (s) { return !s.missing; }).map(function (s) { return s.radius; });
  if (radii.length > 1 && new Set(radii).size > 1) {
    console.log('   ⚠️ 各模块按钮的圆角不一致：' + JSON.stringify(radii)); problems++;
  }
}
await shot('44-common-library');

// 「往库里加一条」的表单已经删掉了，加新条目走「手动加一条 → 添加并存进常用库」
if (commonUI.hasOldForm || commonUI.hasOldBtn) {
  console.log('   ⚠️ 常用库页签里还留着「往库里加一条」'); problems++;
}
await sleep(200);

/* ---- 「手动加一条」：☆ 说明 + 两个按钮（样式要和「智能识别」一致） ---- */
// 先切到粘贴页签，把「智能识别」那对按钮的 class 记下来（切走就没有了）
await mustClick('[data-act="add-tab"][data-tab="paste"]', '粘贴页签');
await sleep(500);
const pasteCls = await evaluate('(function(){' +
  'var p=document.querySelector(\'[data-act="parse"]\');' +
  'var a=document.querySelector(\'[data-act="parse-add"]\');' +
  'return { parse: p?p.className:"", add: a?a.className:"" };})()');
console.log('   「智能识别」那对按钮：' + JSON.stringify(pasteCls));

await mustClick('[data-act="add-tab"][data-tab="manual"]', '手动加一条页签');
await sleep(500);
const manualTab = await evaluate(`(function(){
  var card=document.querySelector('.add-tabs + .form-card');
  var addBtn=document.querySelector('[data-act="hw-add"]');
  var saveBtn=document.querySelector('[data-act="hw-add-common"]');
  var row=addBtn?addBtn.closest('.btn-row'):null;
  /*
   * 说明现在是**一整句**（临时想起来 / ☆ / 附件三件事用分号连起来），
   * 所以按 .hint-lead 取正文那句，别再去找单独的"☆ 说明"。
   */
  var hints=card?[].slice.call(card.querySelectorAll('.hint-lead')):[];
  var intro=hints[0];
  var text=intro?intro.textContent.trim():'';
  function mid(el){ if(!el) return 0; var r=el.getBoundingClientRect(); return Math.round(r.top + r.height/2); }
  return { hasHint: Boolean(intro), hintText: text,
    hintCount: hints.length,
    // 一整句里三件事都要有，而且用分号连起来
    oneSentence: hints.length === 1 && text.indexOf('；') >= 0,
    btnSameLine: Boolean(addBtn && saveBtn) && Math.abs(mid(addBtn)-mid(saveBtn)) <= 6,
    hintAbove: Boolean(intro && addBtn) && mid(intro) < mid(addBtn),
    addCls: addBtn?addBtn.className:'', saveCls: saveBtn?saveBtn.className:'',
    overflow: row ? Math.max(0, row.scrollWidth - row.clientWidth) : -1,
    rowW: row?Math.round(row.clientWidth):0 };
})()`);
console.log('   手动加一条那一块：' + JSON.stringify(manualTab));
if (!manualTab.hasHint) { console.log('   ⚠️「手动加一条」没有说明文字'); problems++; }
else if (manualTab.hintText.indexOf('☆') < 0 ||
         manualTab.hintText.indexOf('常用库或每日任务') < 0 ||
         manualTab.hintText.indexOf('附件') < 0) {
  console.log('   ⚠️ 说明文字没把三件事都说全：' + manualTab.hintText); problems++;
}
// 第 1 条：三件事合成一句，不能还是两段
if (!manualTab.oneSentence) {
  console.log('   ⚠️ 说明应该是合并成的一句（现在是 ' + manualTab.hintCount + ' 段）：' +
    manualTab.hintText); problems++;
}
// 第 76 轮：☆ 现在会先问存到哪儿，文案跟着改
if (manualTab.hintText !== '临时想起来的一条，直接写在这里；点击作业列表中的 ☆ 也能存进常用库或每日任务；' +
    '老师发的卷子照片、要跟读的音频作为附件上传。') {
  console.log('   ⚠️ 说明文字和需求原文不一致：' + manualTab.hintText); problems++;
}
if (!manualTab.btnSameLine) { console.log('   ⚠️ 两个按钮不在同一行'); problems++; }
if (!manualTab.hintAbove) { console.log('   ⚠️ 说明应该在按钮上面一行'); problems++; }
if (manualTab.overflow > 1) {
  console.log('   ⚠️ 按钮那一行溢出了 ' + manualTab.overflow + 'px'); problems++;
}

/*
 * ★ 第 87 轮：多行文本框的 maxlength **必须**和后端存的上限一致。
 *   没设 maxlength 的话，超出的部分会被后端 slice() 静默切掉 ——
 *   家长写了两百多字，存下来尾巴没了，界面上却不提示。
 *
 * 这里只验当前页签上能看到的「备注」框（别的框在别的页签，
 * 用 selftest 里的静态检查兜住）。注意：**不能用 `el.value = 长文本` 来测** ——
 * maxlength 只拦"用户输入"，程序赋值是绕过它的，测出来永远是"没拦住"。
 * 得走真实的输入通道（Input.insertText）。
 */
{
  const maxAttr = await evaluate('(function(){' +
    'var e=document.querySelector("#add-detail");' +
    'return e?(e.getAttribute("maxlength")||null):"(没有这个框)";})()');
  console.log('   「手动加一条」备注框的 maxlength：' + JSON.stringify(maxAttr));
  if (maxAttr !== '500') {
    console.log('   ⚠️ add-detail 的 maxlength 应该是 500（后端按这个截断），现在是 ' + maxAttr);
    problems++;
  } else {
    /*
     * 第 88/89 轮：备注 500 字；「还能写 N 字」的计数加了又按家长要求去掉了，
     * 所以这里反过来验 —— 框下面**不该**再出现计数那行。
     */
    const cnt0 = await evaluate('(function(){' +
      'var e=document.querySelector("#add-detail"); if(!e) return null;' +
      'var n=e.nextElementSibling;' +
      'return { hasCount:Boolean(n&&n.classList.contains("char-count")),' +
      '  text:n?n.textContent.slice(0,30):"" };})()');
    console.log('   备注框下面：' + JSON.stringify(cnt0));
    if (cnt0 && cnt0.hasCount) {
      console.log('   ⚠️ 备注框下面还有「还能写 N 字」的计数（第 89 轮已经去掉了）：' +
        cnt0.text); problems++;
    }
    // 走真实输入：敲到上限，应该只进 500（上限本身还在）
    await evaluate('(function(){var e=document.querySelector("#add-detail");' +
      'if(e){e.value="";e.focus();} return 1;})()');
    await sleep(200);
    await page.send('Input.insertText', { text: new Array(601).join('字') });
    await sleep(400);
    const full = await evaluate('(function(){' +
      'var e=document.querySelector("#add-detail"); if(!e) return null;' +
      'var r={ value:e.value.length }; e.value=""; return r;})()');
    console.log('   敲到 600 个字：' + JSON.stringify(full));
    if (full.value !== 500) {
      console.log('   ⚠️ 备注框没被 maxlength 挡住（进得去 ' + full.value + ' 个字，后端只存 500）');
      problems++;
    }
  }
}

/*
 * 第 58 轮 1：三个按钮同一行的做法**已撤回**，恢复成
 * 「附件区（自带加附件按钮）」在上面 + 「两个提交按钮」在下面一行。
 */
{
  const layout = await evaluate('(function(){' +
    'var card=document.querySelector(".add-tabs + .form-card");' +
    'if(!card) return null;' +
    'var box=card.querySelector(\'.att-box[data-att-for="hw-add"]\');' +
    'if(!box) return { noBox:true };' +
    'var pick=box.querySelector(".att-add");' +
    'var row=card.querySelector(".btn-row");' +
    'var btns=[].slice.call(card.querySelectorAll(".btn-row > .btn")).map(function(b){' +
    '  return b.textContent.trim(); });' +
    'var y=function(el){ return el?Math.round(el.getBoundingClientRect().top):null; };' +
    'return { hasPick:Boolean(pick), btnRowHasPick:Boolean(row && row.querySelector(".att-add")),' +
    '  pickTop:y(pick), rowTop:y(row), btns:btns,' +
    '  boxTop:y(box), overflow:row?Math.round(row.scrollWidth-row.clientWidth):-1 };})()');
  console.log('   手动加一条的布局：' + JSON.stringify(layout));
  if (!layout || layout.noBox) {
    console.log('   ⚠️ 找不到「手动加一条」的附件区'); problems++;
  } else {
    if (!layout.hasPick) {
      console.log('   ⚠️ 附件区里没有「加附件」按钮'); problems++;
    }
    if (layout.btnRowHasPick) {
      console.log('   ⚠️ 加附件按钮又跑到提交按钮那一行里去了（第 58 轮已撤回这个做法）'); problems++;
    }
    if (!(layout.pickTop < layout.rowTop)) {
      console.log('   ⚠️ 附件区应该排在提交按钮那一行上面：' +
        JSON.stringify({ pick: layout.pickTop, row: layout.rowTop })); problems++;
    }
    if (layout.btns.join(',') !== '添加到这一天,添加并存进常用库') {
      console.log('   ⚠️ 提交按钮那一行不对：' + layout.btns.join(',')); problems++;
    }
    if (layout.overflow > 1) {
      console.log('   ⚠️ 提交按钮那一行溢出了 ' + layout.overflow + 'px'); problems++;
    }
  }
}
/* 两个按钮的样式要和「智能识别 / 识别并直接添加」完全一致 */
if (manualTab.addCls !== pasteCls.parse) {
  console.log('   ⚠️「添加到这一天」按钮样式和「智能识别」不一致：' +
    manualTab.addCls + ' vs ' + pasteCls.parse); problems++;
}
if (manualTab.saveCls !== pasteCls.add) {
  console.log('   ⚠️「添加并存进常用库」样式和「识别并直接添加」不一致：' +
    manualTab.saveCls + ' vs ' + pasteCls.add); problems++;
}
await shot('45-add-tab-manual');

/*
 * 页签下面那张卡片：**上面两个角必须都是直角**，才能和页签连成一体。
 *
 * 原来是 `0 var(--r-md) var(--r-md) var(--r-md)` —— 四个值依次是
 * 左上/右上/右下/左下，只把左上写成 0，右上还是圆的：
 * 同一个卡片左边直角、右边圆角，右边还和页签的圆角叠成两层弧线。
 * 家长截图圈出来说"参考左边处理"，就是这儿。
 */
{
  const corners = await evaluate(`(function(){
    var cs=function(sel){ var e=document.querySelector(sel); return e?getComputedStyle(e):null; };
    var card=cs('.add-tabs + .form-card');
    var tab=cs('.add-tabs .subtab.on');
    if(!card) return { missing:true };
    return { cardRadius: card.borderRadius,
      cardTL: card.borderTopLeftRadius, cardTR: card.borderTopRightRadius,
      cardBL: card.borderBottomLeftRadius, cardBR: card.borderBottomRightRadius,
      tabRadius: tab ? tab.borderRadius : '',
      tabBL: tab ? tab.borderBottomLeftRadius : '',
      tabBR: tab ? tab.borderBottomRightRadius : '' };
  })()`);
  console.log('   页签下面的卡片圆角：' + JSON.stringify(corners));
  if (corners.missing) { console.log('   ⚠️ 找不到页签下面的卡片'); problems++; }
  else {
    if (corners.cardTL !== corners.cardTR) {
      console.log('   ⚠️ 卡片上面两个角不一致：左 ' + corners.cardTL + ' / 右 ' + corners.cardTR +
        '（右边没跟着处理成直角）'); problems++;
    }
    if (corners.cardBL !== corners.cardBR) {
      console.log('   ⚠️ 卡片下面两个角不一致：左 ' + corners.cardBL + ' / 右 ' + corners.cardBR); problems++;
    }
    if (parseFloat(corners.cardTL) !== 0) {
      console.log('   ⚠️ 卡片左上角不是直角（' + corners.cardTL + '），和页签接不上'); problems++;
    }
    // 页签的下边也得是直角，不然和卡片之间会有缝
    if (parseFloat(corners.tabBL) !== 0 || parseFloat(corners.tabBR) !== 0) {
      console.log('   ⚠️ 选中的页签下边不是直角：' + corners.tabBL + ' / ' + corners.tabBR); problems++;
    }
  }
}
await mustClick('[data-act="add-tab"][data-tab="paste"]', '粘贴页签');
await sleep(400);

const dayBefore = await evaluate('(document.querySelector(".week-hint .wk-text")||{}).textContent');
await mustClick('.wk-cell:not(.on)', '周日期条里的另一天');
const dayAfter = await evaluate('(document.querySelector(".week-hint .wk-text")||{}).textContent');
console.log('   点另一天：' + dayBefore + ' → ' + dayAfter);
if (dayBefore === dayAfter) { console.log('   ⚠️ 点周日期条没切换'); problems++; }
await shot('21-week-strip');
await mustClick('[data-act="date-today"]', '回到今天');

const wkBefore = await evaluate('(document.querySelector(".wk-cell b")||{}).textContent');
await mustClick('[data-act="date-shift"][data-days="-7"]', '往前翻一周');
const wkAfter = await evaluate('(document.querySelector(".wk-cell b")||{}).textContent');
console.log('   往前翻一周：' + wkBefore + ' → ' + wkAfter);
if (wkBefore === wkAfter) { console.log('   ⚠️ 翻周按钮没生效'); problems++; }
await shot('25-week-prev');
await mustClick('[data-act="date-today"]', '回到今天');

/* ---- 修改作业时能改小红花 ---- */
await mustClick('.row-item [data-act="hw-edit"]', '修改作业');
const hasPointsField = await evaluate('Boolean(document.querySelector(\'.modal [data-key="points"]\'))');
console.log('   修改框里有小红花输入框：' + (hasPointsField ? '有' : '没有'));
if (!hasPointsField) { console.log('   ⚠️ 修改作业的弹窗里没有小红花输入框'); problems++; }
await shot('22-hw-edit-points');
await evaluate('(function(){var i=document.querySelector(\'.modal [data-key="points"]\'); i.value="7";' +
  'document.querySelector(".modal .btn.primary").click();})()');
let hwSub = '';
// 保存要经过 260ms 的合并 + 一次网络往返，再叠上重渲染，轮询给宽一点（偶发过一次）
for (let i = 0; i < 14 && String(hwSub).indexOf('+7⭐') < 0; i++) {
  await sleep(400);
  hwSub = await evaluate('(document.querySelector(".row-item .ri-tags")||{}).textContent || ""');
}
console.log('   改完后列表显示：' + hwSub);
if (String(hwSub).indexOf('+7⭐') < 0) { console.log('   ⚠️ 单项小红花没改成 7'); problems++; }
await shot('23-hw-points-changed');

await mustClick('[data-act="parent-tab"][data-tab="confirm"]', '待确认标签');
await shot('8-parent-confirm');
await mustClick('[data-act="parent-tab"][data-tab="tasks"]', '每日任务标签');
await shot('9-parent-tasks');

/* ---- 图标选择器 ---- */
await mustClick('[data-act="task-add"]', '新增任务');
const iconPicks = await evaluate('document.querySelectorAll(".modal .icon-pick").length');
console.log('   图标选择器里可选图标：' + iconPicks + ' 个');
if (iconPicks < 20) { console.log('   ⚠️ 图标选择器图标太少'); problems++; }
await shot('24-icon-picker');
const picked = await evaluate('(function(){var ps=document.querySelectorAll(".modal .icon-pick");' +
  'ps[5].click();return document.querySelector(\'.modal [data-key="emoji"]\').value;})()');
console.log('   点了第 6 个图标后输入框变成：' + picked);
if (!picked || picked.length > 4) { console.log('   ⚠️ 点图标没填进输入框'); problems++; }
await mustClick('.modal .btn.ghost', '取消');

/* ---- 家长页签：四个，文案按新命名 ---- */
const parentTabs = await evaluate('(function(){' +
  'return [].slice.call(document.querySelectorAll(".subtabs .subtab"))' +
  '  .map(function(x){return x.textContent.replace(/\\s+/g,"").trim();});})()');
console.log('   家长页签：' + JSON.stringify(parentTabs));
for (const want of ['录入作业', '待确认', '任务奖励', '设置']) {
  if (parentTabs.join('|').indexOf(want) < 0) { console.log('   ⚠️ 家长页签里没有「' + want + '」'); problems++; }
}
if (parentTabs.length !== 4) { console.log('   ⚠️ 家长页签应该合并成 4 个，实际 ' + parentTabs.length + ' 个'); problems++; }

/* ---- 任务和奖励在同一页：任务在上、奖励在下 ---- */
await mustClick('[data-act="parent-tab"][data-tab="tasks"]', '任务奖励标签');
await sleep(500);
const mergedUI = await evaluate('(function(){' +
  'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"))' +
  '  .map(function(x){return x.textContent.trim();});' +
  'var t=hs.findIndex(function(x){return x.indexOf("每天的固定任务")>=0;});' +
  'var r=hs.findIndex(function(x){return x.indexOf("奖励清单")>=0;});' +
  'return { titles:hs, taskIdx:t, rewardIdx:r };})()');
console.log('   任务奖励页：' + JSON.stringify(mergedUI));
if (mergedUI.taskIdx < 0) { console.log('   ⚠️ 任务奖励页里没有任务清单'); problems++; }
if (mergedUI.rewardIdx < 0) { console.log('   ⚠️ 任务奖励页里没有奖励清单'); problems++; }
if (mergedUI.taskIdx >= 0 && mergedUI.rewardIdx >= 0 && mergedUI.taskIdx > mergedUI.rewardIdx) {
  console.log('   ⚠️ 任务应该在奖励上面'); problems++;
}

/* ---- 「给孩子留句话」：默认文本要能完整看见（这一块在「录入作业」页上） ---- */
await mustClick('[data-act="parent-tab"][data-tab="hw"]', '录入作业标签');
await sleep(600);
await evaluate('(function(){var el=document.getElementById("note-box");' +
  'if(el) el.scrollIntoView({block:"center"}); return 1;})()');
await sleep(300);
const noteBox = await evaluate('(function(){' +
  'var el=document.getElementById("note-box"); if(!el) return {found:false};' +
  'var ph=el.placeholder||"";' +
  // 把默认文本真填进去量一次：装不下就说明高度不够
  'var keep=el.value; el.value=ph;' +
  'var need=el.scrollHeight, have=el.clientHeight;' +
  'var fits = need <= have + 2;' +
  'el.value=keep;' +
  'return { found:true, lines:ph.split("\\n").length, ph:ph,' +
  '  fits:fits, need:need, have:have, h:Math.round(el.getBoundingClientRect().height) };})()');
console.log('   留句话输入框：' + JSON.stringify(noteBox).slice(0, 220));
if (!noteBox.found) { console.log('   ⚠️ 找不到「给孩子留句话」输入框'); problems++; }
else {
  if (noteBox.lines < 4) { console.log('   ⚠️ 默认文本不是 4 行：' + noteBox.lines); problems++; }
  if (noteBox.ph.indexOf('三到') < 0) { console.log('   ⚠️ 默认文本不是「三到」那段'); problems++; }
  if (!noteBox.fits) {
    console.log('   ⚠️ 输入框高度装不下默认文本：需要 ' + noteBox.need + 'px，只有 ' + noteBox.have + 'px'); problems++;
  }
}
await shot('11-note-box');

/* ---- 手机端顶栏：不能被挤成竖排，副标题要是房间码（第 1 条） ---- */
{
  const bar = await evaluate(`(function(){
    var strong=document.getElementById('top-title');
    var sub=document.getElementById('top-sub');
    var bar=document.getElementById('topbar');
    function lines(el){
      var lh=parseFloat(getComputedStyle(el).lineHeight) || 16;
      return Math.round(el.getBoundingClientRect().height / lh);
    }
    return { barH: Math.round(bar.getBoundingClientRect().height),
      titleLines: lines(strong), subLines: lines(sub),
      titleClipped: strong.scrollWidth > strong.clientWidth + 1,
      sub: sub.textContent.trim(),
      strongW: Math.round(strong.getBoundingClientRect().width) };
  })()`);
  console.log('   顶栏：' + JSON.stringify(bar));
  // 中文可以逐字换行，一旦容器被压窄就变成"一字一行"竖排
  if (bar.titleLines > 1 || bar.subLines > 1) {
    console.log('   ⚠️ 顶栏文字换行了（手机上会变成竖排）：' +
      bar.titleLines + ' 行 / ' + bar.subLines + ' 行'); problems++;
  }
  if (bar.barH > 90) {
    console.log('   ⚠️ 顶栏太高（' + bar.barH + 'px），说明里面换行了'); problems++;
  }
  if (bar.titleClipped) {
    console.log('   ⚠️ 顶栏标题被省略号截掉了（只有 ' + bar.strongW + 'px）'); problems++;
  }
  if (bar.sub.indexOf('房间码') < 0) {
    console.log('   ⚠️ 副标题不是房间码：' + bar.sub); problems++;
  }
  const overflow = await evaluate(`(function(){
    var out=[];
    [].slice.call(document.querySelectorAll('*')).forEach(function(el){
      var r=el.getBoundingClientRect();
      if(r.width>0 && r.right > window.innerWidth + 1) out.push(el.tagName+'.'+(el.className||''));
    });
    return out.slice(0,6);
  })()`);
  if (overflow.length) {
    console.log('   ⚠️ 有元素横向溢出屏幕：' + JSON.stringify(overflow)); problems++;
  }
  /*
   * 窄屏那几条规则有没有真的生效。
   * 媒体查询和基础规则同优先级，比的是先后 —— 放前面会被整段盖掉。
   * 我第一版就放错了位置：matchMedia 是 true，但 .icon-btn 还是 41px。
   */
  const mq = await evaluate(`(function(){
    var cs=function(sel){ var e=document.querySelector(sel); return e?getComputedStyle(e):null; };
    var ib=cs('.icon-btn'), sc=cs('.sync-chip'), em=cs('.sync-chip em');
    return { iconW: ib?ib.width:'', syncH: sc?sc.height:'', iconH: ib?ib.height:'',
      syncTextHidden: em ? em.display === 'none' : null };
  })()`);
  console.log('   窄屏规则：' + JSON.stringify(mq));
  if (parseFloat(mq.iconW) > 40) {
    console.log('   ⚠️ 窄屏下 .icon-btn 没收窄（' + mq.iconW + 'px）——媒体查询被基础规则盖掉了'); problems++;
  }
  if (mq.syncTextHidden !== true) {
    console.log('   ⚠️ 窄屏下「已同步」三个字没有隐藏'); problems++;
  }
  if (parseFloat(mq.syncH) !== parseFloat(mq.iconH)) {
    console.log('   ⚠️ 顶栏控件不等高：同步 ' + mq.syncH + ' vs 按钮 ' + mq.iconH); problems++;
  }
}

/* ---- 设置页：输入框和说明文字要在同一行，宽度自适应 ---- */
await mustClick('[data-act="parent-tab"][data-tab="settings"]', '设置标签');
await sleep(500);
await shot('10-parent-settings');
const setWidths = await evaluate('(function(){' +
  'var ids=["set-pin","set-hwpoints","set-focus","set-break"];' +
  'var out={rows:{}};' +
  /*
   * 判断"同一行"要比**垂直中线**，不能比 top：
   * 输入框比标签文字高得多，居中对齐时两者的 top 本来就差十几个像素。
   */
  'function mid(el){ if(!el) return null; var r=el.getBoundingClientRect();' +
  '  return Math.round(r.top + r.height/2); }' +
  'ids.forEach(function(id){ var el=document.getElementById(id);' +
  '  out[id]= el ? Math.round(el.getBoundingClientRect().width) : null;' +
  '  if (el) {' +
  '    var row=el.closest(".form-row"); var lab=row.querySelector("label");' +
  '    var hint=row.querySelector(".hint");' +
  /* 数字框外面套了 .num-wrap（里面还有一对上下加减按钮），
     量"这个框多宽"要量外层壳，不能量里面的 input */
  '    var shell=el.closest(".num-wrap") || el;' +
  '    out.rows[id]={ labelMid: mid(lab), inputMid: mid(shell), hintMid: mid(hint),' +
  '      shellW: Math.round(shell.getBoundingClientRect().width),' +
  '      rawW: Math.round(el.getBoundingClientRect().width),' +
  '      hasSteps: Boolean(row.querySelector(\'.num-step[data-for="\' + id + \'"]\')),' +
  '      hintW: hint?Math.round(hint.getBoundingClientRect().width):0,' +
  '      type: el.type, inputMode: el.inputMode };' +
  '  } });' +
  'var panel=document.querySelector(".panel .form-card");' +
  'out.panelWidth = panel ? Math.round(panel.getBoundingClientRect().width) : 0;' +
  'return out;})()');
console.log('   设置页输入框：' + JSON.stringify(setWidths));
for (const id of ['set-pin', 'set-hwpoints', 'set-focus', 'set-break']) {
  const r = setWidths.rows[id];
  if (!r) { console.log('   ⚠️ 设置页找不到 ' + id); problems++; continue; }
  // 标签 / 输入框 / 说明三者的垂直中线要基本重合（= 同一行）
  if (Math.abs(r.labelMid - r.inputMid) > 8 || Math.abs(r.hintMid - r.inputMid) > 8) {
    console.log('   ⚠️ ' + id + ' 的标签/输入框/说明不在同一行：' + JSON.stringify(r)); problems++;
  }
  if (r.hintW < 20) { console.log('   ⚠️ ' + id + ' 的说明文字被挤没了'); problems++; }
  if (r.shellW >= setWidths.panelWidth) {
    console.log('   ⚠️ ' + id + ' 占满了整行，说明文字没地方放'); problems++;
  }
  // 宽度是上一版（94px）的 2 倍左右
  if (r.shellW < 170) { console.log('   ⚠️ ' + id + ' 还是太窄：' + r.shellW + 'px（应该 ~188px）'); problems++; }
  // 家长密码是普通单行文本框（口令不需要上下加一），另外三个要有上下加减
  if (id === 'set-pin') {
    if (r.hasSteps) { console.log('   ⚠️ 家长密码不该有上下加减按钮'); problems++; }
  } else if (!r.hasSteps) {
    console.log('   ⚠️ ' + id + ' 没有上下加减按钮'); problems++;
  }
  // 数字框一律不能是 type=number（中文环境下负数会显示成「1-」）
  if (r.type === 'number') { console.log('   ⚠️ ' + id + ' 是 type=number，负数会显示成「1-」'); problems++; }
}
await shot('10-parent-settings');

  /* ---- 撤销要填理由（第 4 条）：两种理由 + 说明，孩子那边能看到 ---- */
  {
    /*
     * 先自己造一条「待确认」出来：去孩子页点一张卡片 → 专注页 → 我做完了。
     * （不能指望前面剩下什么，这样这段测试自己就能跑。）
     */
    await mustClick('#tabbar [data-view="today"]', '今天标签');
    await sleep(700);
    const startedForUndo = await evaluate('(function(){' +
      'var b=document.querySelector(\'.card:not(.done) [data-act="focus-start"]\');' +
      'if(!b) return false; b.click(); return true;})()');
    if (startedForUndo) {
      await sleep(900);
      await mustClick('[data-act="focus-done"]', '我做完了（造一条待确认）');
      await sleep(1400);
    }
    await mustClick('#tabbar [data-view="parent"]', '家长标签');
    await sleep(700);
    await mustClick('[data-act="parent-tab"][data-tab="confirm"]', '待确认标签');
    await sleep(800);

    const canUndo = await evaluate('Boolean(document.querySelector(\'#sec-waiting [data-act="undo-item"]\'))');
    /*
     * 第 67 轮 2：标签栏顺序「小红花 → 截止日期 → 状态」。
     *
     * 待确认这一行**只有**状态 + 时间两种东西（试过补小红花/截止，
     * 那一行放不下、时间会被挤到第二行），所以这里只验"状态在、时间在"，
     * 顺序规则由孩子卡片和家长任务行那两处断言盯着。
     */
    const waitBadges = await evaluate('(function(){' +
      'var sec=document.getElementById("sec-waiting"); if(!sec) return null;' +
      'var rows=[].slice.call(sec.querySelectorAll(".row-item"));' +
      'return rows.map(function(r){' +
      '  var b=r.querySelector(".ri-badges")||r.querySelector(".ri-tags");' +
      '  return { sub:(r.querySelector(".ri-subj")||{}).textContent||"",' +
      '    badges:[].slice.call(b.querySelectorAll(".badge")).map(function(x){' +
      '      return x.textContent.replace(/\\s+/g," ").trim();}),' +
      '    time:(b.querySelector(".ri-time")||{}).textContent||"" }; });})()');
    console.log('   待确认行：' + JSON.stringify(waitBadges));
    (waitBadges || []).forEach(function (r) {
      const state = r.badges.filter(function (s) { return /等确认|已确认/.test(s); });
      if (!state.length) {
        console.log('   ⚠️ 待确认行没有状态标签：' + JSON.stringify(r)); problems++;
      }
      if (!r.time || r.time.length < 8) {
        console.log('   ⚠️ 待确认行没有日期时间：' + JSON.stringify(r)); problems++;
      }
    });
    if (!canUndo) {
      console.log('   ⚠️ 待确认里没有「撤销」按钮（撤销测试跳过）'); problems++;
    } else {
      await mustClick('#sec-waiting [data-act="undo-item"]', '撤销');
      await sleep(600);
      const undoUI = await evaluate(`(function(){
        var m=document.querySelector('.modal'); if(!m) return {open:false};
        var picks=[].slice.call(m.querySelectorAll('.undo-pick'));
        return { open:true, title:(m.querySelector('h3')||{}).textContent||'',
          picks:picks.map(function(l){ return l.querySelector('b').textContent.trim(); }),
          hints:picks.map(function(l){ return l.querySelector('small').textContent.trim(); }),
          type: picks[0] ? picks[0].querySelector('input').type : '',
          checked: picks.filter(function(l){ return l.querySelector('input').checked; }).length,
          text: m.textContent.replace(/\s+/g,' '),
          defaultKind:(m.querySelector('input[name="undo-kind"]:checked')||{}).value||'',
          hasReasonBox:Boolean(m.querySelector('#undo-reason')) };})()`);
      console.log('   撤销弹窗：' + JSON.stringify(undoUI));
      if (!undoUI.open) { console.log('   ⚠️ 点撤销没有弹出填理由的框'); problems++; }
      else {
        if (undoUI.picks.join(',') !== '任务取消,再完善作业') {
          console.log('   ⚠️ 两个理由选项不对：' + JSON.stringify(undoUI.picks)); problems++;
        }
        // 第 57 轮 4：两个理由可以都不选 —— 默认就是都不选
        if (undoUI.checked !== 0) {
          console.log('   ⚠️ 撤销弹窗默认选中了理由（应该是都不选）：' + undoUI.checked); problems++;
        }
        if (undoUI.type !== 'checkbox') {
          console.log('   ⚠️ 理由选项应该是 checkbox（radio 点中之后没法取消）：' + undoUI.type); problems++;
        }
        if (undoUI.text.indexOf('不选也行') < 0) {
          console.log('   ⚠️ 撤销弹窗没说明"不选也行"：' + undoUI.text.slice(0, 80)); problems++;
        }
        if (!undoUI.hasReasonBox) { console.log('   ⚠️ 撤销弹窗里没有填写说明的输入框'); problems++; }
        await shot('47-undo-modal');
        // 选「再完善作业」，写一句说明，确认
        await evaluate('(function(){' +
          'var r=document.querySelector(\'.modal input[value="redo"]\'); r.checked=true;' +
          'r.dispatchEvent(new Event("change",{bubbles:true}));' +
          'document.querySelector(".modal #undo-reason").value="生字重写一遍，写工整些"; return 1;})()');
        await sleep(250);
        await mustClick('.modal .btn.primary', '撤销');
        await sleep(1200);
        const afterUndo = await evaluate(`(function(){
          var sec=document.getElementById('sec-undone');
          if(!sec) return { shown:false };
          return { shown:true, text:sec.textContent.replace(/\\s+/g,' ').slice(0,200),
            hasRestore:Boolean(sec.querySelector('[data-act="restore-item"]')) };})()`);
        console.log('   撤销之后：' + JSON.stringify(afterUndo));
        if (!afterUndo.shown) { console.log('   ⚠️ 撤销后没有出现「已撤销」区块'); problems++; }
        else {
          if (afterUndo.text.indexOf('再完善') < 0) { console.log('   ⚠️ 已撤销区块没写清是"再完善"'); problems++; }
          if (afterUndo.text.indexOf('生字重写一遍') < 0) { console.log('   ⚠️ 已撤销区块里看不到家长写的理由'); problems++; }
          if (!afterUndo.hasRestore) { console.log('   ⚠️ 已撤销的项没有「恢复」按钮'); problems++; }
        }
        await shot('48-undone');

        /* 孩子那边：要看到理由 */
        await mustClick('#tabbar [data-view="today"]', '今天标签');
        await sleep(800);
        const kidView = await evaluate(`(function(){
          var cards=[].slice.call(document.querySelectorAll('.card'));
          var c=cards.filter(function(x){return x.querySelector('.card-undo');})[0];
          if(!c) return { found:false };
          var undo=c.querySelector('.card-undo');
          return { found:true, undoText:undo.textContent.replace(/\\s+/g,' '),
            undoBold:undo.querySelectorAll('b').length,
            badge:(c.querySelector('.badge')||{}).textContent||'',
            badges:[].slice.call(c.querySelectorAll('.badge')).map(function(b){return b.textContent;}) };})()`);
        console.log('   孩子那边看到的：' + JSON.stringify(kidView));
        if (!kidView.found) { console.log('   ⚠️ 孩子那边看不到撤销理由'); problems++; }
        else {
          if (kidView.undoText.indexOf('生字重写一遍') < 0) {
            console.log('   ⚠️ 孩子那边的理由文字不对：' + kidView.undoText); problems++;
          }
          /*
           * 家长的要求：理由框里**只放他写的那句话**。
           * 原来上面还有一行加粗的「爸爸妈妈让你再完善一下」，
           * 和下面那个徽章重复，已经删掉 —— 这里盯着别再长回来。
           */
          if (kidView.undoBold !== 0 || /让你再完善|取消了这项/.test(kidView.undoText)) {
            console.log('   ⚠️ 撤销理由框里又出现了和徽章重复的那句话：' + kidView.undoText); problems++;
          }
          if (kidView.badges.join('|').indexOf('再完善一遍') < 0) {
            console.log('   ⚠️ 徽章里应该保留「爸爸妈妈说要再完善一遍」：' + kidView.badges.join('|')); problems++;
          }
        }
        await shot('49-kid-undo');
        await mustClick('#tabbar [data-view="parent"]', '家长标签');
        await sleep(700);
        await mustClick('[data-act="parent-tab"][data-tab="confirm"]', '待确认标签');
        await sleep(600);
        // 恢复掉，别影响后面的用例
        if (await evaluate('Boolean(document.querySelector(\'[data-act="restore-item"]\'))')) {
          await mustClick('[data-act="restore-item"]', '恢复');
          await sleep(800);
        }
      }
    }
  }

  /* ---- 「加一件事」要带备注、且孩子改不了小红花（第 2、3 条） ---- */
  {
    await mustClick('#tabbar [data-view="today"]', '今天标签');
    await sleep(700);
    const addBtnText = await evaluate('(function(){' +
      'var b=document.querySelector(\'[data-act="add-extra"]\');' +
      'return b?b.textContent.trim():"";})()');
    console.log('   「加一件事」按钮文字：' + JSON.stringify(addBtnText));
    if (addBtnText.indexOf('挣小红花') < 0) {
      console.log('   ⚠️ 按钮文字里没有「挣小红花」：' + addBtnText); problems++;
    }
    await mustClick('[data-act="add-extra"]', '加一件事');
    await sleep(600);
    const extraForm = await evaluate(`(function(){
      var m=document.querySelector('.modal'); if(!m) return {open:false};
      return { open:true,
        hasNote: Boolean(m.querySelector('[data-key="note"]')),
        hasPoints: Boolean(m.querySelector('[data-key="points"]')),
        labels:[].slice.call(m.querySelectorAll('label')).map(function(x){return x.textContent.trim();}) };})()`);
    console.log('   加一件事的表单：' + JSON.stringify(extraForm));
    if (!extraForm.hasNote) { console.log('   ⚠️「加一件事」没有备注栏'); problems++; }
    if (extraForm.hasPoints) {
      console.log('   ⚠️「加一件事」还让孩子自己改小红花（应该固定 1 朵）'); problems++;
    }
    await shot('50-add-extra');
    // 填一条，确认小红花真的是 1
    await evaluate('(function(){' +
      'document.querySelector(\'.modal [data-key="title"]\').value="给奶奶打电话";' +
      'document.querySelector(\'.modal [data-key="note"]\').value="问奶奶这周身体怎么样";' +
      'document.querySelector(".modal .btn.primary").click(); return 1;})()');
    await sleep(1300);
    const extraSaved = await evaluate('fetch("/api/state/' + room + '")' +
      '.then(function(r){return r.json();}).then(function(j){' +
      'var d=new Date();var k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");' +
      'var e=(j.state.days[k]||{}).extras||[];' +
      'var x=e.filter(function(y){return y.title==="给奶奶打电话";})[0];' +
      'return x?{ points:x.points, note:x.note }:{ missing:true };})');
    console.log('   存下来的那一件事：' + JSON.stringify(extraSaved));
    if (extraSaved.missing) { console.log('   ⚠️「加一件事」没存上'); problems++; }
    else {
      if (Number(extraSaved.points) !== 1) { console.log('   ⚠️ 小红花不是 1：' + extraSaved.points); problems++; }
      if (extraSaved.note !== '问奶奶这周身体怎么样') {
        console.log('   ⚠️ 备注没存上：' + JSON.stringify(extraSaved.note)); problems++;
      }
    }
    await shot('51-extra-note');
    // 这一块是从孩子页开始的，收尾要切回家长页，后面的用例都在家长页上
    await mustClick('#tabbar [data-view="parent"]', '家长标签');
    await sleep(700);
  }

/* ---- 房间管理 ---- */
await mustClick('[data-act="parent-tab"][data-tab="settings"]', '设置标签');

const roomUI = await evaluate('(function(){' +
  'var sec=document.querySelector(".panel");' +
  'return { hasHeading: document.body.textContent.indexOf("🏠 房间") >= 0,' +
  '  hasNameInput: Boolean(document.getElementById("set-roomname")),' +
  '  hasCode: document.body.textContent.indexOf("房间码：" + (window.__hbRoom||"")) >= 0 || /房间码：[A-Z0-9]{3,20}/.test(document.body.textContent),' +
  '  hasNewBtn: Boolean(document.querySelector(\'[data-act="room-new"]\')),' +
  '  hasJoinBtn: Boolean(document.querySelector(\'[data-act="room-join"]\')) };})()');
console.log('   房间区块：' + JSON.stringify(roomUI));
if (!roomUI.hasHeading || !roomUI.hasNameInput || !roomUI.hasNewBtn) {
  console.log('   ⚠️ 设置页里的「房间」区块不完整'); problems++;
}

/* 导航菜单字号应该比正文大一档 */
const tabFont = await evaluate('Math.round(parseFloat(getComputedStyle(document.querySelector(".subtab")).fontSize))');
console.log('   导航菜单字号：' + tabFont + 'px');
if (tabFont < 15) { console.log('   ⚠️ 导航菜单字号没调大（现在 ' + tabFont + 'px）'); problems++; }

/* 「每个房间是一份独立的数据。」应该在【房间】标题正下方 */
const hintUnder = await evaluate('(function(){' +
  'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
  'var h=hs.filter(function(x){return x.textContent.indexOf("房间")>=0;})[0];' +
  'if(!h) return null;var p=h.parentNode.nextElementSibling;' +
  'return { tag:p?p.tagName:"", text:(p?p.textContent:"").trim() };})()');
console.log('   房间标题下面：' + JSON.stringify(hintUnder));
if (!hintUnder || String(hintUnder.text).indexOf('每个房间是一份独立的数据') < 0) {
  console.log('   ⚠️ 「每个房间是一份独立的数据」没放在房间标题下面'); problems++;
}
if (hintUnder && /切换房间/.test(String(hintUnder.text))) {
  console.log('   ⚠️ 还留着「切换房间 ——」这个前缀'); problems++;
}

/* ---- 房间列表：开放式接口，进这个页面就应该自动加载，不要口令 ---- */
const adminInfo = await evaluate('fetch("/api/admin/state").then(function(r){return r.json();})' +
  '.catch(function(){return null;})');
const listInfo = await evaluate('fetch("/api/rooms").then(function(r){return r.json();})' +
  '.catch(function(){return null;})');
console.log('   服务器口令状态：' + JSON.stringify(adminInfo));
console.log('   列表接口：' + (listInfo
  ? (listInfo.rooms || []).length + ' 个房间，删房间要不要口令=' + listInfo.needsKeyToDelete
  : '拿不到'));
if (!listInfo || !Array.isArray(listInfo.rooms)) { console.log('   ⚠️ /api/rooms 读不到'); problems++; }
if (listInfo && typeof listInfo.needsKeyToDelete !== 'boolean') {
  console.log('   ⚠️ 列表没告诉前端删房间要不要口令'); problems++;
}

await sleep(1200);
const listUI = await evaluate('(function(){return {' +
  ' serverRows: document.querySelectorAll(\'.room-row[data-src="server"]\').length,' +
  ' keyForm: Boolean(document.getElementById("admin-key")) || Boolean(document.getElementById("admin-key1")),' +
  ' hasJoinBtn: Boolean(document.querySelector(\'[data-act="room-join"]\')),' +
  ' hasKeyChip: Boolean(document.querySelector(\'[data-act="admin-key"]\')) };})()');
console.log('   房间列表界面：' + JSON.stringify(listUI));
if (listUI.serverRows < 1) { console.log('   ⚠️ 进页面没有自动加载房间列表'); problems++; }
if (listUI.keyForm) { console.log('   ⚠️ 列出房间居然还要口令'); problems++; }
if (listUI.hasJoinBtn) { console.log('   ⚠️ 「输入房间码」按钮还在，应该拿掉'); problems++; }
if (!listUI.hasKeyChip) { console.log('   ⚠️ 缺少「管理口令」入口'); problems++; }
await shot('31-room-list');

/* 改房间名（和孩子名字一起在「房间」模块里） → 顶栏标题跟着变 */
await evaluate('(function(){var i=document.getElementById("set-roomname");i.value="浏览器测试房";' +
  'var c=document.getElementById("set-childname");if(c)c.value="小测";return 1;})()');
await mustClick('[data-act="room-save-mine"]', '保存房间信息');
await sleep(400);
const renamed = await evaluate('document.getElementById("top-title").textContent');
console.log('   改完房间名后顶栏：' + renamed);
if (renamed !== '浏览器测试房') { console.log('   ⚠️ 房间名没生效'); problems++; }

/* 「孩子名字」应该搬到了房间模块，基本设置里不该再有 */
const childMoved = await evaluate('(function(){' +
  'var inRoom = Boolean(document.getElementById("set-childname"));' +
  'var basics = [].slice.call(document.querySelectorAll(".panel-head h2"))' +
  '  .filter(function(h){return h.textContent.indexOf("基本设置")>=0;})[0];' +
  'var inBasics = false;' +
  'if (basics) { var sec = basics.closest(".panel"); inBasics = /孩子名字/.test(sec.textContent); }' +
  'return { inRoom: inRoom, inBasics: inBasics };})()');
console.log('   孩子名字位置：' + JSON.stringify(childMoved));
if (!childMoved.inRoom) { console.log('   ⚠️ 房间模块里没有孩子名字'); problems++; }
if (childMoved.inBasics) { console.log('   ⚠️ 基本设置里还留着孩子名字'); problems++; }

/* 「新建房间 / 刷新 / 口令」三个按钮应该在【房间】标题后面，风格一致 */
const headBtns = await evaluate('(function(){' +
  'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
  'var h=hs.filter(function(x){return x.textContent.indexOf("🏠")>=0;})[0];' +
  'if(!h) return null; var head=h.parentNode;' +
  'var arr=[].slice.call(head.querySelectorAll(".btn"));' +
  'return { n:arr.length, labels:arr.map(function(b){return b.textContent.trim();}),' +
  '  inHead: arr.every(function(b){return b.closest(".panel-head")===head;}),' +
  '  inTitleRow: arr.every(function(b){return Math.abs(b.getBoundingClientRect().top - h.getBoundingClientRect().top)<24;}),' +
  '  styled: arr.every(function(b){return b.className.indexOf("btn")>=0;}),' +
  '  hasNew: arr.some(function(b){return /新建/.test(b.textContent);}),' +
  '  hasRefresh: arr.some(function(b){return /刷新/.test(b.textContent);}),' +
  '  hasKey: arr.some(function(b){return /口令/.test(b.textContent);}) };})()');
console.log('   房间标题后的按钮：' + JSON.stringify(headBtns));
if (!headBtns || headBtns.n < 3 || !headBtns.inHead) {
  console.log('   ⚠️ 三个按钮没放在「房间」标题后面'); problems++;
}
if (headBtns && !headBtns.inTitleRow) { console.log('   ⚠️ 按钮和标题不在同一行'); problems++; }
if (headBtns && (!headBtns.hasNew || !headBtns.hasRefresh || !headBtns.hasKey)) {
  console.log('   ⚠️ 三个按钮不齐（新建/刷新/口令）'); problems++;
}

/* 保存按钮应该和「孩子名字」输入框同一行 */
const saveRow = await evaluate('(function(){' +
  'var c=document.getElementById("set-childname");if(!c) return null;' +
  'var row=c.closest(".form-row");var b=row?row.querySelector(".btn"):null;' +
  'if(!b) return { hasBtn:false };' +
  'return { hasBtn:true, sameRow:true,' +
  '  dy: Math.abs(b.getBoundingClientRect().top - c.getBoundingClientRect().top) };})()');
console.log('   保存按钮位置：' + JSON.stringify(saveRow));
if (!saveRow || !saveRow.hasBtn) { console.log('   ⚠️ 保存按钮没和孩子名字在同一行'); problems++; }
else if (saveRow.dy > 10) { console.log('   ⚠️ 保存按钮和孩子名字不在同一水平线（差 ' + saveRow.dy + 'px）'); problems++; }

/* 那句「房间名留空就按…」的说明应该删掉了 */
const leftoverHint = await evaluate('document.body.textContent.indexOf("房间名留空就按")>=0');
console.log('   还留着「房间名留空就按…」说明吗：' + (leftoverHint ? '是' : '否'));
if (leftoverHint) { console.log('   ⚠️ 「房间名留空就按…」没删掉'); problems++; }

/* 正在使用的房间应该在列表第一个 */
const firstRow = await evaluate('(function(){var r=document.querySelector(".room-row");' +
  'return r ? { code:r.dataset.code, on:r.classList.contains("on") } : null;})()');
const myCode = await evaluate('(function(){var m=document.body.textContent.match(/房间码：([A-Z0-9]{3,20})/);return m?m[1]:"";})()');
console.log('   列表第一行：' + JSON.stringify(firstRow) + '，当前房间=' + myCode);
if (firstRow && myCode && firstRow.code !== myCode) {
  console.log('   ⚠️ 正在使用的房间没置顶'); problems++;
}

/* 房间列表：当前房间置顶 + 其他房间折叠成一摞半透明的卡片 */
const rowToolsCheck = await evaluate('(function(){' +
  'var rows=[].slice.call(document.querySelectorAll(\'.room-row[data-src="server"]\'));' +
  'if(!rows.length) return null;' +
  'var mine=rows.filter(function(r){return r.classList.contains("on");})[0];' +
  'var other=rows.filter(function(r){return !r.classList.contains("on");})[0];' +
  'function acts(r){return r ? [].slice.call(r.querySelectorAll(".rr-tools .room-act"))' +
  '  .map(function(b){return {t:b.textContent.trim(), cls:b.className, dis:b.disabled};}) : [];}' +
  'var a=acts(mine), b=acts(other);' +
  'var all=[].concat(a,b);' +
  'var peeks=[].slice.call(document.querySelectorAll(".room-peek"));' +
  'var mineR=mine?mine.getBoundingClientRect():null;' +
  // 每张卡片：和上一张（第一张就是当前房间）重叠了多少 → 露出比例
  'var cover=peeks.map(function(p,i){' +
  '  var r=p.getBoundingClientRect();' +
  '  var prev=i===0?mineR:peeks[i-1].getBoundingClientRect();' +
  '  var visible=Math.max(0, r.bottom-Math.max(prev.bottom, r.top));' +
  '  return { visibleRatio: r.height?visible/r.height:0,' +
  '           width:Math.round(r.width), overlap:Math.round(prev.bottom-r.top) }; });' +
  'return { mine:a.map(function(x){return x.t;}), other:b.map(function(x){return x.t;}),' +
  '  allTextBtn: all.every(function(x){return x.cls.indexOf("room-act")>=0;}),' +
  '  hasToggle: Boolean(mine && mine.querySelector(\'[data-act="room-toggle-others"]\')),' +
  '  peekCount: peeks.length,' +
  '  mineWidth: mineR?Math.round(mineR.width):0,' +
  '  peekWide: cover.map(function(c){return c.width;}),' +
  '  peekCover: cover,' +
  '  peeksOpacity: peeks.map(function(p){return Number(getComputedStyle(p).opacity);}),' +
  '  othersOpen: Boolean(document.querySelector(".room-others")),' +
  '  mineDelDisabled: a.filter(function(x){return x.t==="删除" && x.dis;}).length,' +
  '  mineSwitch: a.filter(function(x){return x.t==="切换";}).length,' +
  '  otherSwitch: b.filter(function(x){return x.t==="切换";}).length };})()');
if (!rowToolsCheck) {
  console.log('   房间行的按钮：拿不到房间行（服务器没数据？跳过）');
} else {
  console.log('   房间行的按钮：' + JSON.stringify(rowToolsCheck));
  if (!rowToolsCheck.allTextBtn) { console.log('   ⚠️ 房间行的按钮不是统一的文字按钮'); problems++; }
  if (rowToolsCheck.mine.indexOf('复制网址') < 0 || rowToolsCheck.mine.indexOf('编辑') < 0) {
    console.log('   ⚠️ 当前房间缺「复制网址 / 编辑」'); problems++;
  }
  if (rowToolsCheck.mineSwitch > 0) { console.log('   ⚠️ 当前房间不该有「切换」'); problems++; }
  if (rowToolsCheck.mineDelDisabled < 1) { console.log('   ⚠️ 当前房间的「删除」没禁用'); problems++; }
  if (!rowToolsCheck.hasToggle) { console.log('   ⚠️ 当前房间的中间区域不是展开/收起开关'); problems++; }
  if (rowToolsCheck.othersOpen) { console.log('   ⚠️ 其他房间默认应该是折叠的'); problems++; }
  if (rowToolsCheck.peekCount < 1 || rowToolsCheck.peekCount > 3) {
    console.log('   ⚠️ 折叠时应该露 1～3 张卡片，实际 ' + rowToolsCheck.peekCount); problems++;
  }
  // 和当前房间那张一样宽
  if (rowToolsCheck.peekWide.length && rowToolsCheck.mineWidth &&
      rowToolsCheck.peekWide.some(function (w) { return Math.abs(w - rowToolsCheck.mineWidth) > 2; })) {
    console.log('   ⚠️ 折叠卡片没有和当前房间一样宽：' +
      rowToolsCheck.mineWidth + ' vs ' + rowToolsCheck.peekWide.join(',')); problems++;
  }
  // 层叠：每张都被上一张盖住约 2/3（露出来的高度 ≈ 卡片高度的 1/3）
  const cov = rowToolsCheck.peekCover;
  cov.forEach(function (c, i) {
    if (c.visibleRatio < 0.25 || c.visibleRatio > 0.42) {
      console.log('   ⚠️ 第 ' + (i + 1) + ' 张露出的比例是 ' +
        c.visibleRatio.toFixed(2) + '，期望约 0.33（被上层遮住 2/3）'); problems++;
    }
  });
  // 越往下越淡
  const ops = rowToolsCheck.peeksOpacity;
  for (let i = 1; i < ops.length; i++) {
    if (ops[i] >= ops[i - 1]) { console.log('   ⚠️ 第 ' + (i + 1) + ' 张没有更淡：' + ops.join(' > ')); problems++; break; }
  }
  if (ops.length && ops[0] >= 1) { console.log('   ⚠️ 折叠的卡片没有降低透明度'); problems++; }
}
await shot('27-room-name');

/* ---- 点当前房间的中间区域：展开 → 收起 ---- */
if (rowToolsCheck && rowToolsCheck.hasToggle) {
  await mustClick('.room-row.on .rr-main[data-act="room-toggle-others"]', '当前房间的中间区域');
  await sleep(500);
  const afterOpen = await evaluate('(function(){return {' +
    ' peeks: document.querySelectorAll(".room-peek").length,' +
    ' others: document.querySelectorAll(".room-others .room-row").length,' +
    ' caret: (document.querySelector(".rr-caret")||{}).textContent||"" ,' +
    // 箭头必须包在名字那个 inline 容器里，否则会被 flex-wrap 挤成单独一行
    ' caretInline: (function(){var c=document.querySelector(".rr-caret");' +
    '   return c ? Boolean(c.closest(".rr-text")) : null;})() };})()');
  console.log('   点一下展开：' + JSON.stringify(afterOpen));
  if (afterOpen.others < 1) { console.log('   ⚠️ 点了没展开'); problems++; }
  if (afterOpen.peeks !== 0) { console.log('   ⚠️ 展开后还留着折叠卡片'); problems++; }
  if (afterOpen.caretInline === false) { console.log('   ⚠️ 展开箭头被挤到名字下面另起一行了'); problems++; }
  await shot('34-room-others-open');

  await mustClick('.room-row.on .rr-main[data-act="room-toggle-others"]', '再点一次收起');
  await sleep(500);
  const afterClose = await evaluate('(function(){return {' +
    ' peeks: document.querySelectorAll(".room-peek").length,' +
    ' others: document.querySelectorAll(".room-others").length };})()');
  console.log('   再点一下收起：' + JSON.stringify(afterClose));
  if (afterClose.others !== 0 || afterClose.peeks < 1) { console.log('   ⚠️ 再点没有收起来'); problems++; }
}

/* ---- 列表里点 ✎ 编辑别的房间 ---- */
const EDITROOM = 'EDIT' + Date.now().toString(36).toUpperCase().slice(-5);
await evaluate('fetch("/api/room",{method:"POST",headers:{"Content-Type":"application/json"},' +
  'body:JSON.stringify({code:"' + EDITROOM + '",name:"待编辑房间"})}).then(function(r){return r.json();})');
await mustClick('[data-act="room-refresh"]', '刷新列表');
await sleep(1600);
// 新建的房间收在「其他房间」那一摞里，先展开
if (await evaluate('!document.querySelector(\'.room-row[data-code="' + EDITROOM + '"]\') &&' +
  ' Boolean(document.querySelector(\'[data-act="room-toggle-others"]\'))')) {
  await mustClick('.room-row.on .rr-main[data-act="room-toggle-others"]', '展开其他房间');
  await sleep(500);
}
await shot('34-room-others-open');

await mustClick('.room-row[data-code="' + EDITROOM + '"] [data-act="room-edit"]', '编辑房间');
await sleep(400);
await evaluate('(function(){var i=document.getElementById("re-name");' +
  'if(i)i.value="编辑后的名字";return 1;})()');
await mustClick('.modal .btn.primary', '保存');
await sleep(1600);
const renamedRow = await evaluate('(function(){var r=document.querySelector(\'.room-row[data-code="' + EDITROOM + '"]\');' +
  'return r ? r.querySelector(".rr-name").textContent.trim() : "(行没了)";})()');
console.log('   编辑别的房间后那一行：' + renamedRow);
if (renamedRow.indexOf('编辑后的名字') < 0) { console.log('   ⚠️ 编辑别的房间没生效'); problems++; }

/* ---- 删除房间 ----
 * 新流程：没设管理口令时点「删除」会先弹设口令，设完自动接着弹删除框。
 */
const envKey = String(process.env.HB_ADMIN_KEY || '');
let testKey = envKey;
const alreadyConfigured = Boolean(listInfo && listInfo.needsKeyToDelete);

await mustClick('.room-row[data-code="' + EDITROOM + '"] [data-act="room-del"]', '删除房间');
await sleep(700);

if (!alreadyConfigured) {
  const setupFirst = await evaluate('Boolean(document.getElementById("ak-new")) && Boolean(document.getElementById("ak-again"))');
  console.log('   没设口令时点删除：' + (setupFirst ? '先要求设口令 ✓' : '直接进了删除框 ✗'));
  if (!setupFirst) { console.log('   ⚠️ 删房间前没有要求先设口令'); problems++; }

  testKey = 'browserkey' + Date.now().toString(36).slice(-4);
  await evaluate('(function(){document.getElementById("ak-new").value=' + JSON.stringify(testKey) + ';' +
    'document.getElementById("ak-again").value=' + JSON.stringify(testKey) + ';return 1;})()');
  await mustClick('.modal .btn.primary', '保存口令');
  await sleep(2000);   // 设完会自动弹出删除框
}

await shot('32-room-delete');

const delModal = await evaluate('(function(){return {' +
  ' hasCode: Boolean(document.getElementById("rd-code")),' +
  ' hasKey: Boolean(document.getElementById("rd-key")) };})()');
console.log('   删除框字段：' + JSON.stringify(delModal));
if (!delModal.hasCode) { console.log('   ⚠️ 删除框里没有房间码确认'); problems++; }
if (!delModal.hasKey) { console.log('   ⚠️ 有口令时删除框应该也要口令'); problems++; }

const canDelete = !delModal.hasKey || Boolean(testKey);
if (delModal.hasKey && testKey) {
  await evaluate('(function(){var i=document.getElementById("rd-key");' +
    'if(i)i.value=' + JSON.stringify(testKey) + ';return 1;})()');
}
if (!canDelete) {
  console.log('  · 服务器已有口令但测试不知道，这一轮只验证「要填口令」，不真删');
}

await evaluate('(function(){var i=document.getElementById("rd-code");if(i)i.value="WRONG";return 1;})()');
await mustClick('.modal .btn.danger', '确认删除');
await sleep(600);
const stillOpen = await evaluate('Boolean(document.querySelector(".modal"))');
console.log('   房间码打错时：' + (stillOpen ? '被拦住了 ✓' : '居然删了 ✗'));
if (!stillOpen) { console.log('   ⚠️ 房间码打错也把房间删了'); problems++; }

if (!canDelete) {
  await mustClick('.modal .btn.ghost', '取消');
  await sleep(400);
} else {
  await evaluate('(function(){var i=document.getElementById("rd-code");if(i)i.value="' + EDITROOM + '";return 1;})()');
  await mustClick('.modal .btn.danger', '确认删除');
  await sleep(1800);
  const goneNow = await evaluate('!document.querySelector(\'.room-row[data-code="' + EDITROOM + '"]\')');
  console.log('   打对房间码之后：' + (goneNow ? '列表里没了 ✓' : '还在 ✗'));
  if (!goneNow) { console.log('   ⚠️ 房间没删掉'); problems++; }

  const goneOnServer = await evaluate('fetch("/api/state/' + EDITROOM + '").then(function(r){return r.status;})');
  console.log('   服务器上再读这个房间：HTTP ' + goneOnServer);
  if (goneOnServer !== 404) { console.log('   ⚠️ 服务器上还有残留'); problems++; }
}

/* 测试自己设的口令，跑完取消掉，免得影响下一次 */
if (!alreadyConfigured && testKey) {
  const cleared = await evaluate('fetch("/api/admin/clear",{method:"POST",' +
    'headers:{"Content-Type":"application/json"},body:JSON.stringify({key:' + JSON.stringify(testKey) + '})})' +
    '.then(function(r){return r.status;})');
  console.log('   跑完取消测试口令：HTTP ' + cleared);
  if (cleared !== 200) { console.log('   ⚠️ 取消口令失败，下次跑会不一样'); problems++; }
}

/* 新建房间弹窗（不真建，只看界面） */
await mustClick('[data-act="room-new"]', '新建房间');
await sleep(300);
const newModal = await evaluate('(function(){var m=document.querySelector(".modal");if(!m)return null;' +
  'return { hasName: Boolean(document.getElementById("nr-name")),' +
  '   hasMode: Boolean(document.getElementById("nr-mode")),' +
  '   codeHidden: document.getElementById("nr-code") ? document.getElementById("nr-code").closest(".form-row").hidden : true };})()');
console.log('   新建房间弹窗：' + JSON.stringify(newModal));
if (!newModal || !newModal.hasName || !newModal.hasMode) { console.log('   ⚠️ 新建房间弹窗缺字段'); problems++; }

/* 切到「自定义码」应该露出输入框，并且中文会被清掉 */
await evaluate('(function(){var s=document.getElementById("nr-mode");s.value="custom";' +
  's.dispatchEvent(new Event("change"));return 1;})()');
await sleep(200);
await evaluate('(function(){var i=document.getElementById("nr-code");i.value="我的小家";' +
  'i.dispatchEvent(new Event("input"));return 1;})()');
await sleep(200);
const customState = await evaluate('(function(){var i=document.getElementById("nr-code");' +
  'return { hidden: i.closest(".form-row").hidden, value: i.value,' +
  '  tip: (document.querySelector(".modal .hint")||{}).textContent || "" };})()');
console.log('   自定义码输入：' + JSON.stringify(customState));
if (customState.hidden) { console.log('   ⚠️ 选「自定义」没露出输入框'); problems++; }
if (customState.value !== '') { console.log('   ⚠️ 中文没被清掉：' + customState.value); problems++; }
await shot('28-room-new');
await mustClick('.modal .btn.ghost', '取消');
await sleep(200);

/* ---- 作业不能直接点完成，点一下应该进专注页 ---- */
await mustClick('#tabbar [data-view="today"]', '今天标签');
const hwId = await evaluate('(function(){var c=document.querySelector(\'.card[data-kind="homework"]:not(.done)\');' +
  'return c ? c.dataset.id : "";})()');
if (!hwId) {
  console.log('   ⚠️ 找不到还没完成的作业，跳过「作业不能直接点完成」检查');
} else {
  await mustClick('.card[data-kind="homework"][data-id="' + hwId + '"]', '作业卡片');
  await sleep(900);
  const intoFocus = await evaluate('!document.querySelector("#focusmask").hidden');
  const stillUndone = await evaluate('!document.querySelector(\'.card[data-kind="homework"][data-id="' + hwId + '"]\').classList.contains("done")');
  console.log('   点作业卡片：' + (intoFocus ? '进了专注页' : '没反应') +
    '，作业' + (stillUndone ? '仍未完成 ✓' : '被直接完成了 ✗'));
  if (!intoFocus || !stillUndone) problems++;
  await mustClick('[data-act="focus-stop"]', '先不专注了');
  await sleep(500);
}

/* ---- 每日任务也要走专注页（顺便验证新一天的任务能建记录） ---- */
const freshTask = await evaluate('(function(){var c=document.querySelector(\'.card[data-kind="task"]:not(.done)\');' +
  'return c ? c.dataset.id : "";})()');
if (!freshTask) {
  console.log('   ⚠️ 找不到还没打勾的每日任务，跳过这项检查');
} else {
  await mustClick('.card[data-kind="task"][data-id="' + freshTask + '"]', '每日任务卡片');
  await sleep(900);
  const intoFocus2 = await evaluate('!document.querySelector("#focusmask").hidden');
  const taskStill = await evaluate('!document.querySelector(\'.card[data-kind="task"][data-id="' + freshTask + '"]\').classList.contains("done")');
  console.log('   点每日任务卡片：' + (intoFocus2 ? '进了专注页' : '没反应') +
    '，任务' + (taskStill ? '仍未完成 ✓' : '被直接完成了 ✗'));
  if (!intoFocus2 || !taskStill) problems++;
  await mustClick('[data-act="focus-done"]', '我做完了');
  let taskDone = false;
  for (let i = 0; i < 8 && !taskDone; i++) {
    await sleep(300);
    taskDone = await evaluate('document.querySelector(\'.card[data-kind="task"][data-id="' + freshTask + '"]\').classList.contains("done")');
  }
  console.log('   专注页打勾后任务完成：' + (taskDone ? '成功' : '没反应'));
  if (!taskDone) problems++;
}

await mustClick('#tabbar [data-view="parent"]', '家长标签');
await mustClick('[data-act="parent-tab"][data-tab="tasks"]', '每日任务标签');
await shot('14-parent-tasks-new');

/* ---- 孩子申请兑换 → 家长在「待确认」里驳回并写原因 ---- */
await mustClick('#tabbar [data-view="stars"]', '小红花标签');
const canRedeem = await evaluate('(function(){var b=document.querySelector(".reward:not([disabled])");' +
  'return b ? b.dataset.id : "";})()');
if (!canRedeem) {
  console.log('   ⚠️ 小红花不够，跳过兑换/驳回检查');
} else {
  await mustClick('.reward[data-id="' + canRedeem + '"]', '兑换奖励');
  await mustClick('.modal .btn.primary', '确认兑换');
  await sleep(700);

  await mustClick('#tabbar [data-view="parent"]', '家长标签');
  await mustClick('[data-act="parent-tab"][data-tab="confirm"]', '待确认标签');
  const askCount = await evaluate('document.querySelectorAll(".row-item.ask").length');
  console.log('   待确认里的兑换申请：' + askCount + ' 条');
  if (askCount < 1) { console.log('   ⚠️ 兑换申请没进待确认'); problems++; }
  await shot('17-parent-asks');

  await mustClick('.row-item.ask [data-act="redeem-reject"]', '驳回按钮');
  const rejectOpen = await evaluate('Boolean(document.querySelector(".modal textarea"))');
  if (!rejectOpen) { console.log('   ⚠️ 驳回弹窗没出来'); problems++; }
  await shot('18-reject-dialog');
  await evaluate('(function(){var t=document.querySelector(".modal textarea"); t.value="今天已经换过啦";' +
    'document.querySelector(".modal .btn.primary").click();})()');
  await sleep(800);
  const askGone = await evaluate('document.querySelectorAll(".row-item.ask").length === 0');
  console.log('   驳回后从待确认消失：' + (askGone ? '是' : '否'));
  if (!askGone) problems++;
  await shot('19-after-reject');

  await mustClick('#tabbar [data-view="stars"]', '小红花标签');
  const why = await evaluate('(document.querySelector(".log-why")||{}).textContent || ""');
  console.log('   孩子在「小红花」页看到：' + (why || '（没有）'));
  if (String(why).indexOf('今天已经换过啦') < 0) { console.log('   ⚠️ 驳回原因没传到孩子端'); problems++; }
  await shot('20-kid-rejected');

  /* ---- 再兑换一次并兑现：应该出现在「已确认」清单里 ---- */
  const canRedeem2 = await evaluate('(function(){var b=document.querySelector(".reward:not([disabled])");' +
    'return b ? b.dataset.id : "";})()');
  if (canRedeem2) {
    await mustClick('.reward[data-id="' + canRedeem2 + '"]', '再兑换一次');
    await mustClick('.modal .btn.primary', '确认兑换');
    await sleep(700);
    await mustClick('#tabbar [data-view="parent"]', '家长标签');
    await mustClick('[data-act="parent-tab"][data-tab="confirm"]', '待确认标签');
    await mustClick('.row-item.ask [data-act="redeem-fulfill"]', '兑现');
    await sleep(800);
    const inDone = await evaluate('Boolean(document.querySelector(\'[data-act="redeem-undo"]\'))');
    console.log('   已兑现的兑换出现在「已确认」：' + (inDone ? '是' : '否'));
    if (!inDone) problems++;
    await shot('26-redeem-done');
  }

  const headingText = await evaluate('(document.querySelector("#sec-waiting h2")||{}).textContent');
  console.log('   待确认区标题：' + headingText);
  if (String(headingText).indexOf('待确认') < 0) {
    console.log('   ⚠️ 标题里没有「待确认」'); problems++;
  }
  if (String(headingText).indexOf('作业/任务') >= 0) {
    console.log('   ⚠️ 标题还带着「作业/任务」，应该简化成「待确认」'); problems++;
  }

  /* ---- 今日学习评价：写一条、能加分、能改、能删 ---- */
  const rvUI = await evaluate('(function(){' +
    'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
    'var h=hs.filter(function(x){return x.textContent.indexOf("今日学习评价")>=0;})[0];' +
    'if(!h) return {found:false};' +
    'var sec=h.closest(".panel");' +
    'var box=sec.querySelector("#review-box");' +
    'var pts=sec.querySelector("#review-points");' +
    'var row=sec.querySelector(".review-points-row");' +
    'var kids=row?[].slice.call(row.children).map(function(x){' +
    '  var r=x.getBoundingClientRect();' +
    '  return { tag:x.tagName, cls:x.className, text:x.textContent.trim().slice(0,12),' +
    '    mid:Math.round(r.top + r.height/2), w:Math.round(r.width) };' +
    '}):[];' +
    'return { found:true, hasBox: Boolean(box), hasPoints: Boolean(pts),' +
    // 输入框高度要能完整放下 placeholder 的 6 行示例 + 半行
    '  boxH: box?Math.round(box.getBoundingClientRect().height):0,' +
    '  boxScrollH: box?box.scrollHeight:0,' +
    '  ptsType: pts?pts.type:"",' +
    '  ptsShell: pts&&pts.closest(".num-wrap")?' +
    '    Math.round(pts.closest(".num-wrap").getBoundingClientRect().width):0,' +
    '  ptsSteps: Boolean(sec.querySelector(\'.num-step[data-for="review-points"]\')),' +
    '  kids: kids,' +
    '  sameLine: kids.length>1 ? (Math.max.apply(null,kids.map(function(k){return k.mid;}))' +
    '    - Math.min.apply(null,kids.map(function(k){return k.mid;})) <= 10) : false };})()');
  console.log('   今日评价区块：' + JSON.stringify(rvUI));
  if (!rvUI.found || !rvUI.hasBox || !rvUI.hasPoints) {
    console.log('   ⚠️ 待确认里没有「今日学习评价」的输入框'); problems++;
  } else {
    // 小红花 / 输入框 / 说明 / 保存按钮：四样都要在同一行
    if (rvUI.kids.length !== 4) {
      console.log('   ⚠️ 小红花那一行应该有 4 样东西，实际 ' + rvUI.kids.length + '：' + JSON.stringify(rvUI.kids)); problems++;
    }
    if (!rvUI.sameLine) {
      console.log('   ⚠️ 小红花 / 输入框 / 说明 / 按钮不在同一行：' + JSON.stringify(rvUI.kids)); problems++;
    }
    if (rvUI.kids.length && !rvUI.kids.some(function (k) { return k.tag === 'SPAN' && k.cls.indexOf('hint') >= 0; })) {
      console.log('   ⚠️ 说明文字没有和输入框在同一行'); problems++;
    }
    // 说明占位要合理（不能被挤成 0 宽）
    const hintKid = rvUI.kids.filter(function (k) { return k.cls.indexOf('hint') >= 0; })[0];
    if (hintKid && hintKid.w < 30) { console.log('   ⚠️ 说明文字被挤没了：' + hintKid.w + 'px'); problems++; }
    // 输入框高度：要能看见 placeholder 的所有行（+半行）
    if (rvUI.boxH < rvUI.boxScrollH - 2) {
      console.log('   ⚠️ 评价输入框太矮，placeholder 看不全：' + rvUI.boxH + ' < ' + rvUI.boxScrollH); problems++;
    }
    // 不能是 type=number
    if (rvUI.ptsType === 'number') { console.log('   ⚠️ 小红花是 type=number，负数会显示成「1-」'); problems++; }
    // 这就是其他「小红花」输入框要对齐的基准：窄条 + 上下加减
    if (!rvUI.ptsSteps) { console.log('   ⚠️ 评价里的小红花没有上下加减'); problems++; }
    if (rvUI.ptsShell < 60 || rvUI.ptsShell > 140) {
      console.log('   ⚠️ 评价里的小红花宽度不是窄条：' + rvUI.ptsShell + 'px'); problems++;
    }
    // 输入框高度：note-box 那边另测

    const balBefore = await balance();
    await evaluate('(function(){' +
      'document.getElementById("review-box").value="今天自己安排得很好\\n就是写字再慢一点";' +
      'document.getElementById("review-points").value="3";return 1;})()');
    await mustClick('[data-act="review-save"]', '保存评价');
    await sleep(1200);
    const rvAfter = await evaluate('(function(){' +
      'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
      'var h=hs.filter(function(x){return x.textContent.indexOf("今日学习评价")>=0;})[0];' +
      'var sec=h.closest(".panel");' +
      'var txt=sec.querySelector(".review-text");' +
      'return { text: txt?txt.textContent:"",' +
      '  wrapped: txt?getComputedStyle(txt).whiteSpace:"",' +
      '  badge: (sec.querySelector(".badge")||{}).textContent||"",' +
      '  hasEdit: Boolean(sec.querySelector(\'[data-act="review-edit"]\')) };})()');
    console.log('   保存后：' + JSON.stringify(rvAfter));
    if (rvAfter.text.indexOf('今天自己安排得很好') < 0) { console.log('   ⚠️ 评价没保存上'); problems++; }
    if (rvAfter.wrapped !== 'pre-wrap') { console.log('   ⚠️ 评价正文没保留换行（white-space=' + rvAfter.wrapped + '）'); problems++; }
    // 加减一律「符号在前」：奖励是 +3，扣分是 -1（不再写成「奖励 +3」）
    if (!/^\+3/.test(String(rvAfter.badge).trim())) {
      console.log('   ⚠️ 奖励的徽章不是「+3」这种写法：' + JSON.stringify(rvAfter.badge)); problems++;
    }
    if (!rvAfter.hasEdit) { console.log('   ⚠️ 评价存下来之后没有「修改」按钮'); problems++; }
    await shot('40-review');
  }


  /* 时间和徽章同一行 + 按钮放大 */
  const confirmRow = await evaluate('(function(){var row=document.querySelector("#sec-waiting .row-item");' +
    'if(!row) return null;var tags=row.querySelector(".ri-tags");var btn=row.querySelector(".act-btn.wide");' +
    'var t=tags && tags.querySelector(".ri-time");' +
    'return { timeInTags: Boolean(t), noteLines: row.querySelectorAll(".ri-note-line").length,' +
    ' tagTop: t ? Math.round(t.getBoundingClientRect().top) : 0,' +
    ' badgeTop: Math.round(tags.querySelector(".badge").getBoundingClientRect().top),' +
    ' btnH: btn ? Math.round(btn.getBoundingClientRect().height) : 0 };})()');
  console.log('   待确认行：' + JSON.stringify(confirmRow));
  if (!confirmRow || !confirmRow.timeInTags || confirmRow.noteLines !== 0) {
    console.log('   ⚠️ 时间没有和状态标签同一行'); problems++;
  }
  if (confirmRow && Math.abs(confirmRow.tagTop - confirmRow.badgeTop) > 2) {
    console.log('   ⚠️ 时间和标签不在同一行'); problems++;
  }
  if (confirmRow && confirmRow.btnH < 34) { console.log('   ⚠️ 撤销/确认按钮还是太小'); problems++; }
  await mustClick('#tabbar [data-view="parent"]', '家长标签');
}

/* ---- 自定义排序：点一次下移，顺序应该变 ---- */
await mustClick('[data-act="parent-tab"][data-tab="tasks"]', '每日任务标签');
const rowOrder = 'function(){return [].slice.call(document.querySelectorAll(".ri-title")).map(function(x){return x.textContent.trim();}).join("|");}';
const orderBefore = await evaluate('(' + rowOrder + ')()');
const moved = await mustClick('[data-act="move"][data-list="tasks"][data-dir="1"]:not([disabled])', '下移按钮');
await sleep(700);
const orderAfter = await evaluate('(' + rowOrder + ')()');
console.log('   每日任务排序：' + (orderBefore !== orderAfter ? '生效' : '没有变化'));
if (!moved || orderBefore === orderAfter) { console.log('   ⚠️ 排序没生效'); problems++; }
await shot('15-parent-sorted');

/* ---- 每日任务：备注 + 停用（停用不能动积分） ---- */
await mustClick('[data-act="parent-tab"][data-tab="tasks"]', '每日任务标签');
const noteUI = await evaluate('(function(){' +
  'var row=document.querySelector(".row-item");' +
  'if(!row) return {has:false};' +
  'var btn=row.querySelector(\'[data-act="task-toggle"]\');' +
  'return { has:true, hasToggle:Boolean(btn), toggleText: btn?btn.textContent.trim():"",' +
  '  noteLines: row.querySelectorAll(".ri-note-line").length,' +
  '  off: row.classList.contains("off") };})()');
console.log('   每日任务行：' + JSON.stringify(noteUI));
if (!noteUI.hasToggle) { console.log('   ⚠️ 每日任务没有「停用」按钮'); problems++; }

// 用编辑框给第一条加个多行备注，列表上要能看到
await mustClick('.row-item [data-act="task-edit"]', '修改任务');
await sleep(500);
const noteField = await evaluate('(function(){' +
  'var m=document.querySelector(".modal"); if(!m) return {open:false};' +
  'var t=m.querySelector(\'[data-key="title"]\'); var n=m.querySelector(\'[data-key="note"]\');' +
  'var ic=m.querySelector(\'[data-key="emoji"]\');' +
  'var picks=m.querySelectorAll(".icon-only-picker .icon-pick");' +
  'var pw=m.querySelector(\'[data-key="points"]\');' +
  'var pwShell=pw?(pw.closest(".num-wrap")||pw):null;' +
  'var box=m.querySelector(".icon-only-picker");' +
  'var lab=box?box.closest(".form-row").querySelector("label"):null;' +
  'var cs=box?getComputedStyle(box):null;' +
  'return { open:true, titleTag:t?t.tagName:"", noteTag:n?n.tagName:"",' +
  '  noteW: n?Math.round(n.getBoundingClientRect().width):0,' +
  '  pointsW: pwShell?Math.round(pwShell.getBoundingClientRect().width):0,' +
  '  hasSteps: Boolean(m.querySelector(\'.num-step[data-for="points"]\')),' +
  '  pickerW: box?Math.round(box.getBoundingClientRect().width):0,' +
  '  titleW: t?Math.round(t.getBoundingClientRect().width):0,' +
  '  pickerLeft: box?Math.round(box.getBoundingClientRect().left):0,' +
  '  titleLeft: t?Math.round(t.getBoundingClientRect().left):0,' +
  '  iconTag: ic?ic.type:"", iconPicks: picks.length,' +
  '  boxH: box?Math.round(box.getBoundingClientRect().height):0,' +
  '  boxW: box?Math.round(box.getBoundingClientRect().width):0,' +
  '  overflowY: cs?cs.overflowY:"",' +
  '  scrollable: box?box.scrollHeight > box.clientHeight + 1:false,' +
  '  labelTop: lab?Math.round(lab.getBoundingClientRect().top):0,' +
  '  boxTop: box?Math.round(box.getBoundingClientRect().top):0,' +
  '  hasIconInput: Boolean(m.querySelector(\'input.field[data-key="emoji"]\')) };})()');
console.log('   修改任务弹窗：' + JSON.stringify(noteField));
if (!noteField.open) { console.log('   ⚠️ 修改任务没弹出框'); problems++; }
else {
  // 「任务」和「备注」现在是单行/多行两种；任务只要不是 textarea 就行（第 9 条要单行）
  if (noteField.titleTag !== 'INPUT') { console.log('   ⚠️ 「任务」应该改回单行输入：' + noteField.titleTag); problems++; }
  if (noteField.noteTag !== 'TEXTAREA') { console.log('   ⚠️ 「备注」不是多行输入（或没有这一栏）'); problems++; }
  // 「小红花」用「今日学习评价」那一个的样式：窄窄的一条 + 上下加减，
  // 不跟着整行铺满（也不能和「备注」一样宽）
  if (!noteField.hasSteps) { console.log('   ⚠️「小红花」没有上下加减按钮'); problems++; }
  /*
   * 光有按钮不算数，**点下去要真的有效**。
   * 踩过：onViewClick 只在 #view / #rest / #focusmask 里被调用，而弹窗挂在
   * body 上，于是弹窗里所有靠 data-act 委托的按钮都是"看得见、点得着、没反应"。
   */
  const stepBefore = await evaluate('(document.querySelector(\'.modal [data-key="points"]\')||{}).value');
  await mustClick('.modal .num-step[data-delta="1"]', '小红花加一');
  await sleep(250);
  const stepUp = await evaluate('(document.querySelector(\'.modal [data-key="points"]\')||{}).value');
  await mustClick('.modal .num-step[data-delta="-1"]', '小红花减一');
  await sleep(250);
  const stepDown = await evaluate('(document.querySelector(\'.modal [data-key="points"]\')||{}).value');
  console.log('   弹窗里点加减：' + stepBefore + ' → ' + stepUp + ' → ' + stepDown);
  if (Number(stepUp) !== Number(stepBefore) + 1) {
    console.log('   ⚠️ 弹窗里的「加」没生效（' + stepBefore + ' → ' + stepUp + '）'); problems++;
  }
  if (Number(stepDown) !== Number(stepBefore)) {
    console.log('   ⚠️ 弹窗里的「减」没生效（' + stepUp + ' → ' + stepDown + '）'); problems++;
  }
  /* 任务/奖励的小红花最小是 0：连点「减」也不该变成负数 */
  await evaluate('(function(){' +
    'var i=document.querySelector(\'.modal [data-key="points"]\'); if(i) i.value="1"; return 1;})()');
  await sleep(150);
  for (let i = 0; i < 4; i++) {
    await mustClick('.modal .num-step[data-delta="-1"]', '一直减');
    await sleep(120);
  }
  const floor = await evaluate('(document.querySelector(\'.modal [data-key="points"]\')||{}).value');
  console.log('   从 1 连点 4 次「减」之后：' + floor + '（最小应该是 0）');
  if (Number(floor) < 0) { console.log('   ⚠️ 小红花被减成负数了：' + floor); problems++; }
  if (noteField.pointsW >= noteField.noteW - 20) {
    console.log('   ⚠️「小红花」太宽了，应该像评价里那样窄一些：' + noteField.pointsW + ' vs 备注 ' + noteField.noteW); problems++;
  }
  if (noteField.pointsW < 60) { console.log('   ⚠️「小红花」太窄：' + noteField.pointsW + 'px'); problems++; }
  // 图标选择框要和「任务」输入框等宽、左边缘对齐（第 4 条）
  if (Math.abs(noteField.pickerW - noteField.titleW) > 2) {
    console.log('   ⚠️ 图标选择框和「任务」输入框不等宽：' + noteField.pickerW + ' vs ' + noteField.titleW); problems++;
  }
  if (Math.abs(noteField.pickerLeft - noteField.titleLeft) > 2) {
    console.log('   ⚠️ 图标选择框和「任务」输入框没左对齐：' + noteField.pickerLeft + ' vs ' + noteField.titleLeft); problems++;
  }
  // 数字框不能是 type=number
  if (noteField.iconTag !== 'hidden') {
    console.log('   ⚠️ 图标值不是隐藏域：' + noteField.iconTag); problems++;
  }
  // 图标选择器：和「图标」两字同一行、限高、能上下滚
  if (noteField.iconPicks < 5) { console.log('   ⚠️ 图标可选项太少：' + noteField.iconPicks + ' 个'); problems++; }
  if (Math.abs(noteField.labelTop - noteField.boxTop) > 8) {
    console.log('   ⚠️ 图标选择器没和「图标」在同一行：label ' + noteField.labelTop + ' / box ' + noteField.boxTop); problems++;
  }
  if (noteField.overflowY !== 'auto' && noteField.overflowY !== 'scroll') {
    console.log('   ⚠️ 图标选择器没有做垂直滚动：overflow-y=' + noteField.overflowY); problems++;
  }
  if (noteField.boxH > 120) {
    console.log('   ⚠️ 图标选择器还是太高：' + noteField.boxH + 'px'); problems++;
  }
  if (noteField.boxW <= 0) { console.log('   ⚠️ 图标选择器没有宽度'); problems++; }
  if (!noteField.scrollable) {
    console.log('   ⚠️ 图标没装满、滚不动（可能是没限高或图标太少）');
  }
  // 图标改成直接点选：不能有可见的输入框
  if (noteField.hasIconInput) { console.log('   ⚠️ 图标还是用输入框，应该直接点选'); problems++; }
  if (noteField.iconPicks < 5) { console.log('   ⚠️ 图标可选项太少：' + noteField.iconPicks + ' 个'); problems++; }
  // 点一个图标，保存后列表上应该是它
  await mustClick('.modal .icon-only-picker .icon-pick', '选一个图标');
  await sleep(200);
  await evaluate('(function(){' +
    'var m=document.querySelector(".modal");' +
    'm.querySelector(\'[data-key="note"]\').value="写到本子上\\n写完自己检查一遍";return 1;})()');
  await mustClick('.modal .btn.primary', '保存');
  await sleep(1000);
  const noteShown = await evaluate('(function(){' +
    'var r=document.querySelector(".row-item"); var n=r.querySelector(".ri-note-line");' +
    'return { text: n?n.textContent:"", ws: n?getComputedStyle(n).whiteSpace:"" };})()');
  console.log('   列表上的备注：' + JSON.stringify(noteShown));
  if (noteShown.text.indexOf('写到本子上') < 0) { console.log('   ⚠️ 备注没显示在列表上'); problems++; }
  if (noteShown.ws !== 'pre-wrap') { console.log('   ⚠️ 列表上的备注没保留换行'); problems++; }
  await shot('41-task-note');
}

/* ---- 停用 / 启用不能影响积分（第 7 条） ---- */
const ptsBeforeToggle = await balance();
await mustClick('[data-act="task-toggle"]', '停用任务');
await sleep(900);
const offState = await evaluate('(function(){' +
  'var row=document.querySelector(".row-item");' +
  'return { off: row.classList.contains("off"),' +
  '  label: row.querySelector(".ri-subj") ? row.querySelector(".ri-subj").textContent : "",' +
  // 第 65 轮之后：状态不再顶掉标签，改成标签栏里的一枚小牌子
  '  badges: (row.querySelector(".ri-badges")||row.querySelector(".ri-tags")||{}).textContent||"",' +
  '  toggleText: (row.querySelector(\'[data-act="task-toggle"]\')||{}).textContent||"" };})()');
offState.points = await balance();
console.log('   停用之后：' + JSON.stringify(offState) + '（停用前小红花 ' + ptsBeforeToggle + '）');
if (!offState.off) { console.log('   ⚠️ 点停用没变成已停用'); problems++; }
// 标签还是那个标签，状态单独一枚牌子 —— 两者能同时看到
if (['功课', '生活', '精神'].indexOf(offState.label) < 0) {
  console.log('   ⚠️ 停用后标签丢了：' + JSON.stringify(offState.label)); problems++;
}
if (offState.badges.indexOf('已停用') < 0) {
  console.log('   ⚠️ 停用的任务没在标签栏标出「已停用」：' + offState.badges); problems++;
}
if (offState.toggleText !== '启') { console.log('   ⚠️ 停用后按钮应变成「启」'); problems++; }
if (ptsBeforeToggle !== null && offState.points !== null && offState.points !== ptsBeforeToggle) {
  console.log('   ⚠️ 停用任务居然改变了小红花：' + ptsBeforeToggle + ' → ' + offState.points); problems++;
}
await mustClick('[data-act="task-toggle"]', '启用任务');
await sleep(900);
const onAgain = await evaluate('(function(){' +
  'var row=document.querySelector(".row-item");' +
  'return { off: row.classList.contains("off") };})()');
onAgain.points = await balance();
console.log('   再启用：' + JSON.stringify(onAgain));
if (onAgain.off) { console.log('   ⚠️ 重新启用没生效'); problems++; }
if (ptsBeforeToggle !== null && onAgain.points !== null && onAgain.points !== ptsBeforeToggle) {
  console.log('   ⚠️ 启用任务改变了小红花'); problems++;
}

/* ---- 奖励清单的停用 / 启用（样式要和任务那边一致） ---- */
await mustClick('[data-act="parent-tab"][data-tab="tasks"]', '任务奖励标签');
await sleep(500);

/* ================================================================
 * 第 65 轮：每日任务的标签 / 截止日期 / 默认排序
 * ================================================================ */
{
  const taskTag = await evaluate('(function(){' +
    'var rows=[].slice.call(document.querySelectorAll(".row-item")).filter(function(r){' +
    '  return r.querySelector(\'[data-act="task-edit"]\');});' +
    'return rows.map(function(r){' +
    '  var sub=r.querySelector(".ri-subj"), titleEl=r.querySelector(".ri-title");' +
    '  var cs=sub?getComputedStyle(sub):null;' +
    '  var badges=r.querySelector(".ri-badges")||r.querySelector(".ri-tags");' +
    '  return { tag:sub?sub.textContent.trim():"(没有)",' +
    '    subjFirst:Boolean(sub&&titleEl.firstElementChild===sub),' +
    '    size:cs?cs.fontSize:"", weight:cs?cs.fontWeight:"", cls:sub?sub.className:"",' +
    '    badges:badges?badges.textContent.replace(/\\s+/g," "):"" }; });})()');
  console.log('   任务行的标签：' + JSON.stringify(taskTag.map(function (r) {
    return r.tag + '|' + r.badges;
  })));
  if (!taskTag.length) {
    console.log('   ⚠️ 任务页里一行都没有'); problems++;
  } else {
    if (!taskTag.every(function (r) { return r.tag !== '(没有)'; })) {
      console.log('   ⚠️ 有任务没有标签：' + JSON.stringify(taskTag.map(function (r) { return r.tag; }))); problems++;
    }
    /*
     * 第 3 条：默认排序 功课 → 生活 → 精神 → 其他。**这里只记录，不断言** ——
     * 这个房间上面的用例点过 ↓（第 1959 行）手动调过顺序，
     * 而"手动优先"是设计如此。默认分组顺序由 selftest【二十二】确定性地盯着。
     */
    const seen = [];
    taskTag.forEach(function (r) { if (seen[seen.length - 1] !== r.tag) seen.push(r.tag); });
    console.log('   标签出现次序（仅参考，这个房间手动 ↓ 过）：' + JSON.stringify(seen));
    // 第 2 条：标签的位置和样式要和作业科目**完全一致**
    if (!taskTag.every(function (r) { return r.subjFirst; })) {
      console.log('   ⚠️ 任务标签不在标题前面（位置和作业科目不一致）'); problems++;
    }
    if (!taskTag.every(function (r) { return r.cls === 'ri-subj'; })) {
      console.log('   ⚠️ 任务标签用的不是 .ri-subj（样式和作业科目不一致）：' +
        JSON.stringify(taskTag.map(function (r) { return r.cls; }))); problems++;
    }
    // 第 6 条：截止日期进标签栏，默认是「长期」
    if (!taskTag.every(function (r) { return r.badges.indexOf('长期') >= 0; })) {
      console.log('   ⚠️ 标签栏里没有「长期」：' + JSON.stringify(taskTag.map(function (r) {
        return r.badges; }))); problems++;
    }
    /*
     * 第 67 轮 2：标签栏的固定顺序 —— ① 小红花 ② 截止日期 ③ 状态类。
     * 这里逐行取徽章文字来验。
     */
    const badgeOrder = await evaluate('(function(){' +
      'var rows=[].slice.call(document.querySelectorAll(".row-item")).filter(function(r){' +
      '  return r.querySelector(\'[data-act="task-edit"]\');});' +
      'return rows.map(function(r){' +
      '  var b=r.querySelector(".ri-badges")||r.querySelector(".ri-tags");' +
      '  return [].slice.call(b.querySelectorAll(".badge")).map(function(x){' +
      '    return x.textContent.replace(/\\s+/g," ").trim(); }); });})()');
    console.log('   任务行的徽章顺序：' + JSON.stringify(badgeOrder));
    const isPts = function (s) { return /完成/.test(s || ''); };
    const isDue = function (s) { return /长期|周[一二三四五六日]|节假日|\d{2}-\d{2}/.test(s || ''); };
    badgeOrder.forEach(function (bs, i) {
      if (!isPts(bs[0])) {
        console.log('   ⚠️ 第 ' + (i + 1) + ' 行的小红花不在最前：' + JSON.stringify(bs)); problems++;
      }
      if (!isDue(bs[1])) {
        console.log('   ⚠️ 第 ' + (i + 1) + ' 行的截止不在第二位：' + JSON.stringify(bs)); problems++;
      }
      // 第三位往后只能是状态类，不能再冒出小红花或截止
      bs.slice(2).forEach(function (s) {
        if (isPts(s) || isDue(s)) {
          console.log('   ⚠️ 第 ' + (i + 1) + ' 行的 ' + JSON.stringify(s) +
            ' 排到状态标签后面去了：' + JSON.stringify(bs)); problems++;
        }
      });
    });
  }

  /* 新增任务弹窗：标签（预设 + 可自定义）和截止日期 */
  await mustClick('[data-act="task-add"]', '新增每日任务');
  await sleep(700);
  const taskForm = await evaluate('(function(){' +
    'var m=document.querySelector(".modal"); if(!m) return null;' +
    'function band(el){var b=el.getBoundingClientRect();' +
    '  return {top:Math.round(b.top),bottom:Math.round(b.bottom),' +
    '    cy:Math.round(b.top+b.height/2),left:Math.round(b.left),right:Math.round(b.right),' +
    '    w:Math.round(b.width)};}' +
    'var tag=m.querySelector(\'input[data-key="tag"]\');' +
    'var tagPicks=m.querySelector(".chip-picks.inline");' +
    // 只取标签那一排的 chips：有效期里也有 .chip-picks.inline，不加限定会把它算进来
    'var chips=[].slice.call(m.querySelectorAll(".chip-picks.inline .chip"))' +
    '  .filter(function(c){return !c.closest(".sched-field");})' +
    '  .map(function(c){return {txt:c.textContent, band:band(c)};});' +
    'var sched=m.querySelector(\'input[data-key="sched"]\');' +
    'return { labels:[].slice.call(m.querySelectorAll(".form-row > label")).map(function(l){' +
    '    return l.textContent;}),' +
    '  tagTag:tag?tag.tagName:"(没有)", tagBand:tag?band(tag):null,' +
    '  picksBand:tagPicks?band(tagPicks):null, chips:chips,' +
    '  sched:sched?sched.value:"(没有)",' +
    // 第 65 轮踩过的坑：chips 字段千万别再多渲染一个图标格子
    '  strayPicker:m.querySelectorAll(".icon-picker").length };})()');
  console.log('   新增任务弹窗：' + JSON.stringify({ labels: taskForm && taskForm.labels,
    chips: taskForm && taskForm.chips.map(function (c) { return c.txt; }),
    sched: taskForm && taskForm.sched, stray: taskForm && taskForm.strayPicker }));
  if (!taskForm) {
    console.log('   ⚠️ 新增任务的弹窗没打开'); problems++;
  } else {
    // 第 66 轮 2：要素顺序
    if (taskForm.labels.join(',') !== '图标,任务,标签,备注,附件,有效期,小红花') {
      console.log('   ⚠️ 表单字段顺序不对：' + taskForm.labels.join(',')); problems++;
    }
    // 第 1 条：预设三个 + 能自己填（所以是文本框不是下拉框）
    if (taskForm.chips.map(function (c) { return c.txt; }).join(',') !== '功课,生活,精神') {
      console.log('   ⚠️ 标签预设不对：' + JSON.stringify(taskForm.chips)); problems++;
    }
    if (taskForm.tagTag !== 'INPUT') {
      console.log('   ⚠️ 标签不是可自由填写的输入框：' + taskForm.tagTag); problems++;
    }
    // 第 66 轮 3：标签输入框和三个预设必须在同一行（竖直范围要有重叠）
    const ov = function (a, b) { return a && b && a.top < b.bottom && b.top < a.bottom; };
    if (!ov(taskForm.tagBand, taskForm.picksBand)) {
      console.log('   ⚠️ 标签输入框和三个预设不在同一行：' +
        JSON.stringify({ input: taskForm.tagBand, picks: taskForm.picksBand })); problems++;
    }
    if (!taskForm.tagBand || taskForm.tagBand.right > taskForm.picksBand.left + 2) {
      console.log('   ⚠️ 标签输入框不在预设左边'); problems++;
    }
    if (!taskForm.chips.every(function (c) { return ov(c.band, taskForm.chips[0].band); })) {
      console.log('   ⚠️ 三个标签预设没排在同一行：' +
        JSON.stringify(taskForm.chips.map(function (c) { return c.band.top; }))); problems++;
    }
    if (!taskForm.tagBand || taskForm.tagBand.w < 50) {
      console.log('   ⚠️ 标签输入框太窄，没法打字：' + (taskForm.tagBand && taskForm.tagBand.w)); problems++;
    }
    // 第 65 轮的坑：chips 字段不能多渲染一个图标格子
    if (taskForm.strayPicker !== 0) {
      console.log('   ⚠️ 弹窗里多渲染了 ' + taskForm.strayPicker + ' 个图标格子'); problems++;
    }    /*
     * ★ 第 81/82 轮：「截止」换成了「有效期」，三种模式：
     *   长期 / 指定日期 / 按周几·节假日
     */
    const sched0 = await evaluate('(function(){' +
      'var m=document.querySelector(".modal");' +
      'var f=m.querySelector(".sched-field"); if(!f) return null;' +
      'return { modes:[].slice.call(m.querySelectorAll(".sched-modes .chip")).map(function(c){' +
      '    return c.textContent+(c.classList.contains("on")?"*":"");}),' +
      '  value:JSON.parse(m.querySelector(\'input[data-key="sched"]\').value) };})()');
    console.log('   有效期字段：' + JSON.stringify(sched0));
    if (!sched0) {
      console.log('   ⚠️ 任务表单里没有「有效期」字段'); problems++;
    } else {
      if (sched0.modes.join(',') !== '长期*,指定日期,按周几/节假日') {
        console.log('   ⚠️ 有效期的三种模式不对：' + sched0.modes.join(',')); problems++;
      }
      if (sched0.value.mode !== 'always') {
        console.log('   ⚠️ 有效期默认不是「长期」：' + sched0.value.mode); problems++;
      }
    }

    /*
     * 第 82 轮：多个指定日期要**从小到大**排（故意倒着加）。
     */
    await evaluate('(function(){' +
      'var m=document.querySelector(".modal");' +
      '[].slice.call(m.querySelectorAll(".sched-modes .chip")).filter(function(c){' +
      '  return c.textContent==="指定日期";})[0].click(); return 1;})()');
    await sleep(500);
    // 先删掉自动带上的那个日期
    await evaluate('(function(){' +
      'var c=document.querySelector(".modal .sched-dates .chip"); if(c) c.click(); return 1;})()');
    await sleep(400);
    const addDate = async function (v) {
      await evaluate('(function(){var a=document.querySelector(\'.modal .sched-date-add\');' +
        'if(!a) return 0; a.value=' + JSON.stringify(v) + ';' +
        'a.dispatchEvent(new Event("change",{bubbles:true})); return 1;})()');
      await sleep(320);
    };
    for (const d of ['2030-11-01', '2030-10-20', '2030-12-25', '2030-09-09']) await addDate(d);
    const dateOrder = await evaluate('(function(){' +
      'var m=document.querySelector(".modal");' +
      'return { chips:[].slice.call(m.querySelectorAll(".sched-dates .chip")).map(function(c){' +
      '    return c.textContent.replace(" ✕","");}),' +
      '  dates:JSON.parse(m.querySelector(\'input[data-key="sched"]\').value).dates };})()');
    console.log('   倒着加 11-01/10-20/12-25/09-09 之后：' + JSON.stringify(dateOrder));
    if (dateOrder.chips.join(',') !== '09-09,10-20,11-01,12-25') {
      console.log('   ⚠️ 多个指定日期没从小到大排：' + dateOrder.chips.join(',')); problems++;
    }

    /* 每一行都不能横向溢出（踩过「加附件」按钮撑出 11px） */
    const anyOver = await evaluate('(function(){' +
      'var m=document.querySelector(".modal");' +
      'return [].slice.call(m.querySelectorAll(".form-row")).map(function(r){' +
      '  var lab=(r.querySelector("label")||{}).textContent||"";' +
      '  return { label:lab, over:Math.round(r.scrollWidth-r.clientWidth) }; })' +
      '.filter(function(x){return x.over>1;});})()');
    if (anyOver.length) {
      console.log('   ⚠️ 弹窗里有行横向溢出了：' + JSON.stringify(anyOver)); problems++;
    }

    /* 切到「按周几/节假日」：七个周几 + 节假日都在 */
    await evaluate('(function(){' +
      'var m=document.querySelector(".modal");' +
      '[].slice.call(m.querySelectorAll(".sched-modes .chip")).filter(function(c){' +
      '  return c.textContent==="按周几/节假日";})[0].click(); return 1;})()');
    await sleep(500);
    const wdUI = await evaluate('(function(){' +
      'var m=document.querySelector(".modal");' +
      'return { days:[].slice.call(m.querySelectorAll(".sched-days .chip")).map(function(c){' +
      '    return c.textContent+(c.classList.contains("on")?"*":"");}) };})()');
    const wdNames = wdUI.days.map(function (x) { return String(x).replace('*', ''); });
    console.log('   按周几模式：' + JSON.stringify(wdUI) + '  → ' + wdNames.join(','));
    // 顺序是周一到周日（不是从周日开始），最后一个是「节假日」
    if (wdNames.join(',') !== '周一,周二,周三,周四,周五,周六,周日,节假日') {
      console.log('   ⚠️ 周几的选项不对：' + wdNames.join(',')); problems++;
    }
    // 切过来时应该默认勾上"今天"那一个（这里看带 * 的正好一个）
    if (wdUI.days.filter(function (x) { return String(x).indexOf('*') >= 0; }).length !== 1) {
      console.log('   ⚠️ 切到按周几时应该默认勾上今天：' + wdUI.days.join(',')); problems++;
    }
  }
  /*
   * ★ 第 86 轮：弹窗的两条
   *   ① 关掉"轻量关闭"—— 点遮罩层（框外面那圈）不再关掉弹窗，填的内容不会丢
   *   ② 能垂直滚动，但右边**不显示滚动条**（滚动条 0 宽，不占位置）
   */
  {
    // 先填点东西，模拟"正在编辑"
    await evaluate('(function(){var i=document.querySelector(\'.modal input[data-key="title"]\');' +
      'if(i) i.value="填了一半的内容"; return 1;})()');
    await sleep(200);
    // 用真鼠标点遮罩左上角（框外面）
    const mpt = await evaluate('(function(){' +
      'var m=document.querySelector(".modal-mask"); if(!m) return null;' +
      'var r=m.getBoundingClientRect();' +
      'return { x:Math.round(r.left+8), y:Math.round(r.top+8) };})()');
    if (!mpt) {
      console.log('   ⚠️ 找不到遮罩层'); problems++;
    } else {
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed',
        x: mpt.x, y: mpt.y, button: 'left', clickCount: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
        x: mpt.x, y: mpt.y, button: 'left', clickCount: 1 });
      await sleep(700);
      const afterMask = await evaluate('(function(){' +
        'var i=document.querySelector(\'.modal input[data-key="title"]\');' +
        'return { open:Boolean(document.querySelector(".modal")),' +
        '  text:i?i.value:null };})()');
      console.log('   点遮罩层之后：' + JSON.stringify(afterMask));
      if (!afterMask.open) {
        console.log('   ⚠️ ① 点遮罩层把弹窗关掉了（家长编辑时误点会丢内容）'); problems++;
      }
      if (afterMask.text !== '填了一半的内容') {
        console.log('   ⚠️ ① 点遮罩层之后已经填的内容没了：' + JSON.stringify(afterMask.text)); problems++;
      }
    }
    // 滚动条：正在打开的这个弹窗内容够长
    const scr = await evaluate('(function(){' +
      'var m=document.querySelector(".modal"); if(!m) return null;' +
      'var cs=getComputedStyle(m); var before=m.scrollTop;' +
      'm.scrollTop=99999; var after=m.scrollTop; m.scrollTop=before;' +
      'return { canScroll:m.scrollHeight>m.clientHeight+2, didScroll:after>0,' +
      '  scrollbarWidth:cs.scrollbarWidth, msOverflow:cs.msOverflowStyle,' +
      // 有滚动条时 offsetWidth-clientWidth>0；0 说明滚动条不占位（=看不见）
      '  gutter:m.offsetWidth-m.clientWidth };})()');
    console.log('   弹窗滚动：' + JSON.stringify(scr));
    if (!scr || !scr.canScroll) {
      console.log('   ⚠️ ② 这个弹窗内容不够长，测不了滚动（可能表单变短了）'); problems++;
    } else {
      if (!scr.didScroll) { console.log('   ⚠️ ② 弹窗滚不动了'); problems++; }
      if (scr.scrollbarWidth !== 'none') {
        console.log('   ⚠️ ② scrollbar-width 不是 none：' + scr.scrollbarWidth); problems++;
      }
      if (scr.gutter !== 0) {
        console.log('   ⚠️ ② 滚动条还占着 ' + scr.gutter + 'px 宽度（说明没藏干净）'); problems++;
      }
    }
  }
  // 先把刚才那个弹窗关掉，再开一个新的来测附件 + 压缩
  await mustClick('.modal .btn.ghost', '取消新增任务');
  await sleep(600);
  /*
   * ★ 第 75 轮：每日任务也能带附件（和作业一样）+ 上传前压缩图片
   */
  {
    await mustClick('[data-act="task-add"]', '新增任务（带附件）');
    await sleep(800);
    const attField = await evaluate('(function(){' +
      'var m=document.querySelector(".modal"); if(!m) return null;' +
      'var labels=[].slice.call(m.querySelectorAll(".form-row > label")).map(function(l){' +
      '  return l.textContent;});' +
      'return { labels:labels,' +
      '  hasBox:Boolean(m.querySelector(\'.att-box[data-att-for="task-add"]\')),' +
      '  hasInput:Boolean(m.querySelector(\'[data-att-input="task-add"]\')),' +
      '  attIdx:labels.indexOf("附件"), noteIdx:labels.indexOf("备注") };})()');
    console.log('   新增任务表单：' + JSON.stringify(attField));
    if (!attField || !attField.hasBox || !attField.hasInput) {
      console.log('   ⚠️ 每日任务的表单里没有附件区'); problems++;
    }
    if (attField && attField.attIdx !== attField.noteIdx + 1) {
      console.log('   ⚠️ 附件不在备注后面：' + JSON.stringify(attField.labels)); problems++;
    }

    // 传一张大图，看压缩
    const bigFile = path.join(ROOT, 'tmp', 'att-test', '大照片.png');
    if (!fs.existsSync(bigFile)) makeBigPng(bigFile);
    const bigBytes = fs.statSync(bigFile).size;
    await pickFiles('[data-att-input="task-add"]', [bigFile]);
    // 压缩 + 上传要等一会儿
    let chips = 0;
    for (let k = 0; k < 40; k++) {
      chips = await evaluate('document.querySelectorAll(\'.att-box[data-att-for="task-add"] .att-chip\').length');
      if (chips >= 1) break;
      await sleep(800);
    }
    const bigChip = await evaluate('(function(){' +
      'var c=document.querySelector(\'.att-box[data-att-for="task-add"] .att-chip\');' +
      'if(!c) return null;' +
      'return { name:(c.querySelector(".att-name")||{}).textContent,' +
      '  size:(c.querySelector(".att-size")||{}).textContent,' +
      '  thumb:Boolean(c.querySelector(".att-thumb")) };})()');
    console.log('   大图 ' + (bigBytes / 1048576).toFixed(2) + ' MB 传上去变成：' + JSON.stringify(bigChip));
    if (!bigChip) {
      console.log('   ⚠️ 大图没传上去'); problems++;
    } else {
      if (!/\.(webp|jpg)$/i.test(bigChip.name)) {
        console.log('   ⚠️ 图片没被压成 webp/jpg：' + bigChip.name); problems++;
      }
      const shown = await evaluate('(function(){' +
        'var c=document.querySelector(\'.att-box[data-att-for="task-add"] .att-chip\');' +
        'var t=(c.querySelector(".att-size")||{}).textContent||"";' +
        'var m=t.match(/([\\d.]+)\\s*(KB|MB)/); if(!m) return 0;' +
        'return Math.round(parseFloat(m[1]) * (m[2]==="MB"?1048576:1024));})()');
      console.log('   压缩后 ' + Math.round(shown / 1024) + ' KB（省了 ' +
        Math.round((1 - shown / bigBytes) * 100) + '%）');
      if (!(shown > 0 && shown < bigBytes * 0.3)) {
        console.log('   ⚠️ 图片没被压小（原 ' + bigBytes + ' → ' + shown + '）'); problems++;
      }
      if (!bigChip.thumb) {
        console.log('   ⚠️ 压缩后的图显示不出缩略图'); problems++;
      }
    }

    // 存下来，确认附件跟着任务走
    await evaluate('(function(){' +
      'var m=document.querySelector(".modal");' +
      'm.querySelector(\'input[data-key="title"]\').value="带附件的新任务";' +
      'm.querySelector(".btn.primary").click(); return 1;})()');
    await sleep(1800);
    const savedTask = await evaluate('fetch("/api/state/' + room + '").then(function(r){' +
      'return r.json();}).then(function(j){' +
      'var t=j.state.dailyTasks.filter(function(x){return x.title==="带附件的新任务";})[0];' +
      'return t?{ n:(t.attachments||[]).length,' +
      '  name:t.attachments[0] && t.attachments[0].name,' +
      '  size:t.attachments[0] && t.attachments[0].size }:{missing:true};})');
    console.log('   存到服务器上：' + JSON.stringify(savedTask));
    if (savedTask.missing || savedTask.n !== 1) {
      console.log('   ⚠️ 附件没跟着任务一起存下来'); problems++;
    }
    // 任务行里要能看到，而且列表里不带删除按钮
    await sleep(600);
    const rowAtt = await evaluate('(function(){' +
      'var r=[].slice.call(document.querySelectorAll(".row-item")).filter(function(x){' +
      '  return x.textContent.indexOf("带附件的新任务")>=0;})[0];' +
      'if(!r) return null;' +
      'return { chips:r.querySelectorAll(".att-chip").length,' +
      '  dels:r.querySelectorAll(".att-del").length };})()');
    console.log('   任务行：' + JSON.stringify(rowAtt));
    if (!rowAtt || rowAtt.chips !== 1) {
      console.log('   ⚠️ 任务行里没显示附件'); problems++;
    } else if (rowAtt.dels !== 0) {
      console.log('   ⚠️ 任务行里出现了删除按钮（应该只在修改弹窗里删）'); problems++;
    }
    // 清理：把这条测试任务删掉
    await evaluate('(function(){' +
      'var r=[].slice.call(document.querySelectorAll(".row-item")).filter(function(x){' +
      '  return x.textContent.indexOf("带附件的新任务")>=0;})[0];' +
      'if(r) r.querySelector(\'[data-act="task-del"]\').click(); return 1;})()');
    await sleep(700);
    await mustClick('.modal .btn.danger, .modal .btn.primary', '确认删除');
    await sleep(900);
  }

  /*
   * ★ 第 73 轮回归：任务**今天已经打过勾**（当天记录里有历史快照）时，
   *   把标签从「精神」改成「功课」——
   *   家长列表、待确认那一行、孩子卡片**三处都要立刻变成「功课」**。
   *   踩过：今天那条记录也走了快照，孩子页和待确认还显示旧标签，
   *   看起来就是"改了没成功"（真事）。
   */
  {
    const today = await evaluate('(function(){var d=new Date();' +
      'return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"' +
      '+String(d.getDate()).padStart(2,"0");})()');
    const target = await evaluate('(function(){' +
      'var rows=[].slice.call(document.querySelectorAll(".row-item")).filter(function(r){' +
      '  return r.querySelector(\'[data-act="task-edit"]\');});' +
      'var r=rows[0]; if(!r) return null;' +
      /*
       * 注意：标签（.ri-subj）就嵌在 .ri-title 里面，直接读 .ri-title 的
       * textContent 会把标签文字也算进去（"生活整理书包和书桌"）。
       * 找卡片 / 找待确认行的时候要用**纯标题**，所以这里把标签前缀切掉。
       */
      'var sub=(r.querySelector(".ri-subj")||{}).textContent||"";' +
      'var full=(r.querySelector(".ri-title")||{}).textContent.replace(/\\s+/g," ").trim();' +
      'return { id:r.querySelector(\'[data-act="task-edit"]\').dataset.id, sub:sub,' +
      '  title:(full.indexOf(sub)===0?full.slice(sub.length):full).trim() };})()');
    console.log('   要改标签的任务：' + JSON.stringify(target) + '（今天 ' + today + '）');
    if (target) {
      // 用接口直接打勾（等价于孩子在专注页点了「我做完了」），这样今天就有快照了
      await evaluate('fetch("/api/state/' + room + '/op",{method:"POST",' +
        'headers:{"Content-Type":"application/json"},' +
        'body:JSON.stringify({ops:[{t:"item.done",date:' + JSON.stringify(today) +
        ',kind:"task",id:' + JSON.stringify(target.id) + ',value:true}]})})' +
        '.then(function(){return 1;})');
      await sleep(1300);
      const snap = await evaluate('fetch("/api/state/' + room + '").then(function(r){' +
        'return r.json();}).then(function(j){' +
        'var r=j.state.days[' + JSON.stringify(today) + '].tasks[' +
        JSON.stringify(target.id) + ']; return r?r.snap:null;})');
      console.log('   今天这条记录的快照：' + JSON.stringify(snap));

      // 把标签改成「功课」
      await mustClick('[data-act="task-edit"]', '改标签');
      await sleep(700);
      await evaluate('(function(){' +
        'var m=document.querySelector(".modal");' +
        'var c=[].slice.call(m.querySelectorAll(".chip-picks .chip"))' +
        '  .filter(function(x){return !x.closest(".sched-field") && x.textContent==="功课";})[0];' +
        'c.click(); m.querySelector(".btn.primary").click(); return 1;})()');
      await sleep(1700);

      const inList = await evaluate('(function(){' +
        'var r=[].slice.call(document.querySelectorAll(".row-item")).filter(function(x){' +
        '  return x.querySelector(\'[data-act="task-edit"]\');})[0];' +
        'return r?(r.querySelector(".ri-subj")||{}).textContent:"(没了)";})()');
      console.log('   家长列表：' + inList);
      if (inList !== '功课') {
        console.log('   ⚠️ 家长列表里的标签没改成「功课」：' + inList); problems++;
      }

      await mustClick('[data-act="parent-tab"][data-tab="confirm"]', '待确认标签');
      await sleep(900);
      const inConfirm = await evaluate('(function(){' +
        'var sec=document.getElementById("sec-waiting"); if(!sec) return "(没有待确认区块)";' +
        'var r=[].slice.call(sec.querySelectorAll(".row-item")).filter(function(x){' +
        '  return x.textContent.indexOf(' + JSON.stringify(target.title) + ')>=0;})[0];' +
        'if(!r) return "(待确认里没有这一条)";' +
        'return (r.querySelector(".ri-subj")||{}).textContent;})()');
      console.log('   待确认那一行：' + inConfirm);
      if (inConfirm !== '功课') {
        console.log('   ⚠️ 待确认那一行还显示旧标签（应该按今天的定义显示「功课」）：' + inConfirm); problems++;
      }

      await mustClick('#tabbar [data-view="today"]', '今天标签');
      await sleep(1100);
      const onCard = await evaluate('(function(){' +
        'var c=[].slice.call(document.querySelectorAll(".card")).filter(function(x){' +
        '  return x.textContent.indexOf(' + JSON.stringify(target.title) + ')>=0;})[0];' +
        'return c?(c.querySelector(".card-subject")||{}).textContent:"(找不到这张卡)";})()');
      console.log('   孩子卡片：' + onCard);
      if (onCard !== '功课') {
        console.log('   ⚠️ 孩子卡片还显示旧标签（快照把今天也冻住了）：' + onCard); problems++;
      }

      await mustClick('#tabbar [data-view="parent"]', '回家长页');
      await sleep(700);
      await mustClick('[data-act="parent-tab"][data-tab="tasks"]', '任务页');
      await sleep(700);
    }
  }
}

/*
 * 任务和奖励现在同一页，奖励在下面。先找到「奖励清单」那一块，
 * 再在它里面找停用按钮 —— 直接 querySelector('.row-item') 会拿到第一条任务。
 */
const rewardScope = 'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
  'var h=hs.filter(function(x){return x.textContent.indexOf("奖励清单")>=0;})[0];' +
  'var sec=h?h.closest(".panel"):null;';
const rwToggle = await evaluate('(function(){' + rewardScope +
  'if(!sec) return {has:false};' +
  'var row=sec.querySelector(".row-item");' +
  'if(!row) return {has:false};' +
  'var t=row.querySelector(\'[data-act="reward-toggle"]\');' +
  'return { has:Boolean(t), text: t?t.textContent.trim():"",' +
  '  cls: t?t.className:"", r: t?Math.round(t.getBoundingClientRect().width):0,' +
  '  h: t?Math.round(t.getBoundingClientRect().height):0 };})()');
console.log('   奖励行的停用按钮：' + JSON.stringify(rwToggle));
if (!rwToggle.has) { console.log('   ⚠️ 奖励清单没有「停用」按钮'); problems++; }
else {
  const ptsB2 = await balance();
  await mustClick('[data-act="reward-toggle"]', '停用奖励');
  await sleep(900);
  const rwOff = await evaluate('(function(){' + rewardScope +
    'if(!sec) return {off:false,label:"",toggleText:""};' +
    'var row=sec.querySelector(".row-item");' +
    'return { off: row.classList.contains("off"),' +
    '  label: row.querySelector(".ri-subj")?row.querySelector(".ri-subj").textContent:"",' +
    '  toggleText: (row.querySelector(\'[data-act="reward-toggle"]\')||{}).textContent||"" };})()');
  rwOff.points = await balance();
  console.log('   停用奖励之后：' + JSON.stringify(rwOff) + '（停用前小红花 ' + ptsB2 + '）');
  if (!rwOff.off || rwOff.label.indexOf('已停用') < 0 || rwOff.toggleText !== '启') {
    console.log('   ⚠️ 奖励的停用样式跟任务不一致'); problems++;
  }
  if (ptsB2 !== null && rwOff.points !== null && rwOff.points !== ptsB2) {
    console.log('   ⚠️ 停用奖励改变了小红花：' + ptsB2 + ' → ' + rwOff.points); problems++;
  }
  await shot('42-reward-off');
  // 孩子的「小红花」页不该再看到它
  await mustClick('#tabbar [data-view="stars"]', '小红花标签');
  await sleep(600);
  const kidRewards = await evaluate('document.querySelectorAll(".reward").length');
  await mustClick('#tabbar [data-view="parent"]', '家长标签');
  await sleep(500);
  await mustClick('[data-act="parent-tab"][data-tab="tasks"]', '任务奖励标签');
  await sleep(400);
  const rewardTotal = await evaluate('(function(){' + rewardScope +
    'return sec ? sec.querySelectorAll(".row-item").length : 0;})()');
  console.log('   孩子端看得到的奖励 ' + kidRewards + ' 个 / 家长端奖励总数 ' + rewardTotal + ' 个');
  if (kidRewards >= rewardTotal) { console.log('   ⚠️ 停用的奖励孩子那边还能看到'); problems++; }
  // 启用回来，别影响后面的步骤
  await mustClick('[data-act="reward-toggle"]', '启用奖励');
  await sleep(800);
}

/* ---- 「复制到今天」：只看别的日期时出现，点一下就复制这一条 ---- */
await mustClick('[data-act="parent-tab"][data-tab="hw"]', '录作业标签');
await sleep(500);

// 看今天的时候不该有这个按钮（复制到今天没意义）
const copyOnToday = await evaluate('document.querySelectorAll(\'[data-act="hw-copy-one"]\').length');
console.log('   看今天时的「复制到今天」按钮数：' + copyOnToday + '（期望 0）');
if (copyOnToday !== 0) { console.log('   ⚠️ 看今天的时候不该出现「复制到今天」'); problems++; }
if (await evaluate('Boolean(document.querySelector(\'[data-act="hw-copy"]\'))')) {
  console.log('   ⚠️ 旧的整批「复制昨天的…」按钮还在，应该已经删掉了'); problems++;
}

// 切到昨天（必须挑一条**确实有作业**的日子，否则那一行根本不存在）
const yKey = await evaluate('(function(){var d=new Date();d.setDate(d.getDate()-1);' +
  'return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");})()');
const hasYCell = await evaluate('Boolean(document.querySelector(\'[data-act="date-set"][data-date="' + yKey + '"]\'))');
if (!hasYCell) {
  // 昨天不在这一周（今天是周一），先往前翻一周
  await mustClick('[data-act="date-shift"][data-days="-7"]', '往前翻一周');
  await sleep(800);
}
await mustClick('[data-act="date-set"][data-date="' + yKey + '"]', '昨天');
await sleep(900);

/* ---- 那段「复制到今天」的说明：断成两行，两行行首要对齐 ---- */
const hintLines = await evaluate('(function(){' +
  'var ps=[].slice.call(document.querySelectorAll("p.hint"));' +
  'var p=ps.filter(function(x){return x.textContent.indexOf("这一条想留到今天做")>=0;})[0];' +
  'if(!p) return {found:false};' +
  'var range=document.createRange(); range.selectNodeContents(p);' +
  /*
   * getClientRects() 会把 <br> 自己也报一个零宽矩形出来，
   * 所以要按宽度过滤，再按 top 归组成"视觉行"，取每行最左的 x。
   */
  'var rects=[].slice.call(range.getClientRects()).filter(function(r){return r.width>2;});' +
  'var byTop={};' +
  'rects.forEach(function(r){ var k=Math.round(r.top);' +
  '  byTop[k]=Math.min(byTop[k]===undefined?9999:byTop[k], Math.round(r.left)); });' +
  'var lefts=Object.keys(byTop).sort(function(a,b){return a-b;}).map(function(k){return byTop[k];});' +
  'return { found:true, lines:lefts.length, lefts:lefts,' +
  '  aligned: lefts.length>1 ? (Math.max.apply(null,lefts)-Math.min.apply(null,lefts) <= 1) : true,' +
  '  indent: Math.round(parseFloat(getComputedStyle(p).paddingLeft)) };})()');
console.log('   复制说明的行首：' + JSON.stringify(hintLines));
if (!hintLines.found) { console.log('   ⚠️ 找不到「复制到今天」那段说明'); problems++; }
else {
  if (hintLines.lines < 2) { console.log('   ⚠️ 说明没有断成两行'); problems++; }
  if (!hintLines.aligned) {
    console.log('   ⚠️ 说明换行后行首没对齐：' + JSON.stringify(hintLines.lefts)); problems++;
  }
  if (hintLines.indent < 10) { console.log('   ⚠️ 说明没有行首缩进'); problems++; }
}
const copyUI = await evaluate('(function(){' +
  'var rows=[].slice.call(document.querySelectorAll(".row-item"));' +
  'var btns=[].slice.call(document.querySelectorAll(\'[data-act="hw-copy-one"]\'));' +
  'var b=btns[0];' +
  'var r=b?b.getBoundingClientRect():null;' +
  'var edit=document.querySelector(\'.row-item [data-act="hw-edit"]\');' +
  'return { rows:rows.length, btns:btns.length,' +
  '  title: b?b.title:"", label: b?b.textContent.trim():"",' +
  '  cls: b?b.className:"",' +
  '  w: r?Math.round(r.width):0, h: r?Math.round(r.height):0,' +
  '  editW: edit?Math.round(edit.getBoundingClientRect().width):0,' +
  '  editH: edit?Math.round(edit.getBoundingClientRect().height):0,' +
  '  editCls: edit?edit.className:"",' +
  '  inRow: b?Boolean(b.closest(".row-item")):false };})()');
console.log('   别的日期上的复制按钮：' + JSON.stringify(copyUI));
if (copyUI.btns < 1) { console.log('   ⚠️ 别的日期上看不到「复制到今天」按钮'); problems++; }
else {
  if (String(copyUI.title).indexOf('复制到今天') < 0) {
    console.log('   ⚠️ 按钮提示不是「复制到今天」：' + copyUI.title); problems++;
  }
  if (!copyUI.inRow) { console.log('   ⚠️ 按钮不在作业那一行里'); problems++; }
  /*
   * 和「修改」(✎) 是同一套 act-btn 风格：同尺寸、同 info 配色。
   * 这个按钮踩过两次：先是忘了 wide，5 个字被塞进 29px 方块里竖着排；
   * 改成 wide 文字按钮之后，一排 6 个控件又把标题挤成了竖排。
   * 所以最终做成和 ✎ 一样的图标按钮。
   */
  if (copyUI.cls.indexOf('act-btn') < 0 || copyUI.editCls.indexOf('act-btn') < 0) {
    console.log('   ⚠️「复制到今天」和「修改」不是同一套按钮风格：' + copyUI.cls + ' / ' + copyUI.editCls); problems++;
  }
  if (copyUI.cls.indexOf('info') < 0) {
    console.log('   ⚠️「复制到今天」配色和「修改」不一致：' + copyUI.cls); problems++;
  }
  if (Math.abs(copyUI.w - copyUI.editW) > 2 || Math.abs(copyUI.h - copyUI.editH) > 2) {
    console.log('   ⚠️「复制到今天」和「修改」尺寸不一致：' +
      copyUI.w + '×' + copyUI.h + ' vs ' + copyUI.editW + '×' + copyUI.editH); problems++;
  }
  // 标题不能被这一排按钮挤成竖排
  const titleW = await evaluate('(function(){' +
    'var t=document.querySelector(".row-item .ri-title");' +
    'return t?Math.round(t.getBoundingClientRect().width):0;})()');
  console.log('   作业标题可用宽度：' + titleW + 'px');
  if (titleW < 80) { console.log('   ⚠️ 标题被按钮挤得太窄了：' + titleW + 'px'); problems++; }

  /* ---- 作业行里每个按钮都要是"同一套"：同尺寸，而且不能看着像禁用 ---- */
  const rowBtns = await evaluate('(function(){' +
    'var row=document.querySelector(".row-item");' +
    'var btns=[].slice.call(row.querySelectorAll(".ri-tools .act-btn"));' +
    'return btns.map(function(b){ var cs=getComputedStyle(b); var r=b.getBoundingClientRect();' +
    '  return { act:b.dataset.act, cls:b.className, w:Math.round(r.width), h:Math.round(r.height),' +
    '    color:cs.color, bg:cs.backgroundColor }; });})()');
  console.log('   作业行的按钮：' + JSON.stringify(rowBtns));
  const sizes = rowBtns.map(function (b) { return b.w + 'x' + b.h; });
  if (new Set(sizes).size > 1) {
    console.log('   ⚠️ 作业行里的按钮尺寸不一致：' + JSON.stringify(sizes)); problems++;
  }
  const starBtn = rowBtns.filter(function (b) { return b.act === 'to-common'; })[0];
  if (!starBtn) { console.log('   ⚠️ 作业行里没有「添加到常用」按钮'); problems++; }
  else {
    // 不能是那个灰扑扑的默认色（和 ↑↓ 一样，看着像禁用了）
    const muted = rowBtns.filter(function (b) { return b.act === 'move'; })[0];
    if (muted && starBtn.color === muted.color) {
      console.log('   ⚠️「添加到常用」和 ↑↓ 同色，看着像禁用：' + starBtn.color); problems++;
    }
    const colored = rowBtns.filter(function (b) { return b.act === 'hw-edit' || b.act === 'hw-del'; });
    if (colored.length && starBtn.cls.indexOf('act-btn') < 0) {
      console.log('   ⚠️「添加到常用」不是 act-btn 家族：' + starBtn.cls); problems++;
    }
  }

  /* ---- ☆ 存进常用库：要带上备注；同名要问要不要覆盖 ---- */
  const libTitles = () => evaluate('(function(){' +
    'return [].slice.call(document.querySelectorAll(".common-item .ri-title"))' +
    '  .map(function(x){return x.textContent.trim();});})()');
  const libCount = () => evaluate('document.querySelectorAll(".common-item").length');

  // 先切到常用库数一下，再切回来
  const countBefore = async () => {
    await mustClick('[data-act="add-tab"][data-tab="common"]', '常用库页签');
    await sleep(500);
    const n = await libCount();
    await mustClick('[data-act="add-tab"][data-tab="paste"]', '粘贴页签');
    await sleep(300);
    return n;
  };

  /*
   * 第 76 轮：☆ 先弹「存到哪」，选「常用作业库」之后再走原来的逻辑。
   * 下面这个 helper 把这一步包起来。
   */
  const starToCommon = async function (what) {
    await mustClick('.row-item [data-act="to-common"]', what);
    await sleep(700);
    await evaluate('(function(){' +
      'var s=document.querySelector(\'.modal [data-key="dest"]\');' +
      'if(s) s.value="common"; return 1;})()');
    await sleep(200);
    await mustClick('.modal .btn.primary', '存进常用库');
    await sleep(1000);
  };

  const n0 = await countBefore();
  await starToCommon('☆ 添加到常用');
  await sleep(400);
  const n1 = await countBefore();
  console.log('   存进常用库：' + n0 + ' → ' + n1);
  if (n1 !== n0 + 1) { console.log('   ⚠️ 点 ☆ 没有存进常用库（' + n0 + ' → ' + n1 + '）'); problems++; }

  // 再点一次同一条：同名，应该弹确认框问要不要覆盖
  await starToCommon('再存一次（同名）');
  await sleep(500);
  const dupAsk = await evaluate('(function(){' +
    'var m=document.querySelector(".modal"); if(!m) return {open:false};' +
    'var txt=m.textContent;' +
    'return { open:true, title:(m.querySelector("h3")||{}).textContent||"",' +
    '  saysSame: txt.indexOf("已经在常用库里") >= 0,' +
    '  asksOverwrite: txt.indexOf("覆盖") >= 0,' +
    '  hasOverwriteBtn: [].slice.call(m.querySelectorAll("button"))' +
    '    .some(function(b){return b.textContent.indexOf("覆盖")>=0;}) };})()');
  console.log('   同名时的提示：' + JSON.stringify(dupAsk));
  if (!dupAsk.open) { console.log('   ⚠️ 同名再存一次没有提示'); problems++; }
  else {
    if (!dupAsk.saysSame) { console.log('   ⚠️ 提示里没说"已经在常用库里"'); problems++; }
    if (!dupAsk.asksOverwrite || !dupAsk.hasOverwriteBtn) {
      console.log('   ⚠️ 没有问"要不要覆盖"'); problems++;
    }
    await shot('46-save-common-dup');
    await mustClick('.modal .btn.primary', '覆盖');
    await sleep(1000);
    const n2 = await countBefore();
    console.log('   覆盖之后库里条数：' + n2 + '（应该不变）');
    if (n2 !== n1) { console.log('   ⚠️ 覆盖不该新增条目：' + n1 + ' → ' + n2); problems++; }
  }

  const beforeCopy = await balance();
  const todayBefore = await todayHomeworkCount();
  await mustClick('[data-act="hw-copy-one"]', '复制到今天');
  await sleep(1500);
  const todayAfter = await todayHomeworkCount();
  console.log('   今天作业数：' + todayBefore + ' → ' + todayAfter);
  if (todayAfter !== todayBefore + 1) {
    console.log('   ⚠️「复制到今天」没有把作业加到今天（' + todayBefore + ' → ' + todayAfter + '）'); problems++;
  }
  /*
   * ★ 第 80 轮 1：复制过来的那条也要**按科目次序**插，不能一律跑到末尾。
   */
  {
    const order = await evaluate('(function(){' +
      'var d=new Date();var k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+' +
      '"-"+String(d.getDate()).padStart(2,"0");' +
      'return fetch("/api/state/' + room + '").then(function(r){return r.json();})' +
      '.then(function(j){ var list=j.state.days[k].homeworks||[];' +
      '  return list.map(function(h){return h.subject;}); });})()');
    const RANK = ['语文', '数学', '英语', '科学', '美术', '音乐', '体育', '道法'];
    const rk = function (s) { const i = RANK.indexOf(s); return i < 0 ? RANK.length : i; };
    console.log('   复制之后今天的科目顺序：' + JSON.stringify(order));
    if (!order.every(function (s, i) { return i === 0 || rk(order[i - 1]) <= rk(s); })) {
      console.log('   ⚠️ 复制过来的作业没有按科目次序插：' + JSON.stringify(order)); problems++;
    }
  }
  if (await balance() !== beforeCopy) {
    console.log('   ⚠️  复制不该改变小红花：' + beforeCopy + ' → ' + await balance()); problems++;
  }

  /*
   * ★ 第 80 轮 2：把同一条**再复制一次** —— 今天已经有同名同科目的，
   *   要先问「是否覆盖」，而且「先不要」不能改任何东西。
   */
  {
    const nBefore = await evaluate('fetch("/api/state/' + room + '").then(function(r){' +
      'return r.json();}).then(function(j){' +
      'var d=new Date();var k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+' +
      '"-"+String(d.getDate()).padStart(2,"0");' +
      'return (j.state.days[k].homeworks||[]).length;})');
    await mustClick('[data-act="hw-copy-one"]', '再复制一次（制造重复）');
    await sleep(1100);
    const dupBox = await evaluate('(function(){' +
      'var m=document.querySelector(".modal"); if(!m) return {open:false};' +
      'var txt=m.textContent.replace(/\\s+/g," ");' +
      'return { open:true, title:(m.querySelector("h3")||{}).textContent||"",' +
      '  mentionsDup: txt.indexOf("已经有一条一样的")>=0,' +
      '  mentionsContent: txt.indexOf("备注和附件")>=0,' +
      '  saysStateKept: txt.indexOf("打勾和确认状态")>=0,' +
      '  btns:[].slice.call(m.querySelectorAll(".btn")).map(function(b){' +
      '    return b.textContent.trim();}) };})()');
    console.log('   重复时的提示：' + JSON.stringify(dupBox));
    if (!dupBox.open) {
      console.log('   ⚠️ 复制重复的一条时没有提示是否覆盖'); problems++;
    } else {
      if (!dupBox.mentionsDup) {
        console.log('   ⚠️ 提示里没说「已经有一条一样的」：' + dupBox.title); problems++;
      }
      if (!dupBox.mentionsContent) {
        console.log('   ⚠️ 提示里没说覆盖的是备注和附件'); problems++;
      }
      if (!dupBox.saysStateKept) {
        console.log('   ⚠️ 提示里没说明打勾状态不变（家长会担心重复发小红花）'); problems++;
      }
      if (dupBox.btns.join(',').indexOf('覆盖') < 0) {
        console.log('   ⚠️ 提示框里没有「覆盖」按钮：' + dupBox.btns.join(',')); problems++;
      }
      // 点「先不要」→ 一条都不能多、也不能改
      await mustClick('.modal .btn.ghost', '先不要');
      await sleep(900);
      const nAfter = await evaluate('fetch("/api/state/' + room + '").then(function(r){' +
        'return r.json();}).then(function(j){' +
        'var d=new Date();var k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+' +
        '"-"+String(d.getDate()).padStart(2,"0");' +
        'return (j.state.days[k].homeworks||[]).length;})');
      console.log('   点「先不要」之后条数：' + nBefore + ' → ' + nAfter);
      if (nAfter !== nBefore) {
        console.log('   ⚠️ 点「先不要」之后作业条数变了：' + nBefore + ' → ' + nAfter); problems++;
      }
    }
  }
  // 复制过去的那条必须是没打勾的
  await mustClick('[data-act="date-today"]', '回到今天');
  await sleep(900);
  const freshCopied = await evaluate('(function(){' +
    'var rows=[].slice.call(document.querySelectorAll(".row-item"));' +
    'var undone=rows.filter(function(r){return !r.classList.contains("done");});' +
    'return undone.length;})()');
  console.log('   今天的作业里还没打勾的：' + freshCopied + ' 条');
  await shot('43-copy-one');
}

/* ---- 专注时间：整页倒计时 ---- */
await mustClick('#tabbar [data-view="today"]', '今天标签');
// 上一次跑可能留下还没结束的专注，先清掉，保证卡片上有「开始专注」按钮
await evaluate('localStorage.removeItem("hb_focus_' + room + '")');
await send('Page.reload');
await sleep(2000);
const started = await evaluate('(function(){var b=document.querySelector(\'.card [data-act="focus-start"]\');' +
  'if(!b) return "没有可以开始的卡片";b.click();return "ok";})()');
if (started !== 'ok') { console.log('   ⚠️ 开始专注失败：' + started); problems++; }
await sleep(1200);
const maskOn = await evaluate('!document.querySelector("#focusmask").hidden');
const maskTime = await evaluate('(document.querySelector("#fm-time")||{}).textContent');
const ringOffset = await evaluate('Number(document.querySelector("#fm-ring").getAttribute("stroke-dashoffset"))');
const ringDash = await evaluate('document.querySelector("#fm-ring").getAttribute("stroke-dasharray")');
const maskFull = await evaluate('(function(){var m=document.querySelector("#focusmask");' +
  'return m.getBoundingClientRect().width >= window.innerWidth - 1 && m.getBoundingClientRect().height >= window.innerHeight - 1;})()');
const tabbarCovered = await evaluate('(function(){var t=document.querySelector("#tabbar").getBoundingClientRect();' +
  'var el=document.elementFromPoint(t.left+t.width/2, t.top+t.height/2);' +
  'return !el || !el.closest("#tabbar");})()');
console.log('   专注整页：' + (maskOn ? '已铺满（' + maskTime + '）' : '没出现') +
  '，盖住底栏：' + (tabbarCovered ? '是' : '否'));
// 顺时针版本把实线段放在路径末尾，dashoffset 一定是负的
console.log('   圆弧方向：dashoffset=' + ringOffset + '（负=顺时针收口），dasharray=' + ringDash);
if (!maskOn || !maskFull || !tabbarCovered || !/^(19|20):/.test(String(maskTime))) {
  console.log('   ⚠️ 专注整页不对');
  problems++;
}
if (!(ringOffset <= 0)) { console.log('   ⚠️ 圆弧不是顺时针的'); problems++; }
await shot('11-focus');

/* ---- 在专注页上直接打勾 ---- */
const focusTitle = await evaluate('(document.querySelector("#focusmask .focus-name")||{}).textContent');
await mustClick('[data-act="focus-done"]', '我做完了');
await sleep(900);
const focusGone = await evaluate('document.querySelector("#focusmask").hidden');
console.log('   专注页打勾后：' + (focusGone ? '专注结束，回到列表' : '还停在专注页'));
if (!focusGone) { console.log('   ⚠️「我做完了」没生效'); problems++; }
await shot('16-after-focus-done');

/* ---- 专注时间：把倒计时拨到 0，应该进入 5 分钟休息 ---- */
await evaluate('(function(){var c=[].slice.call(document.querySelectorAll(\'.card[data-kind="homework"]\'))' +
  '.filter(function(x){return !x.classList.contains("done");})[0];' +
  'if(!c) c=document.querySelector(".card");' +
  'localStorage.setItem("hb_focus_' + room + '", JSON.stringify({kind:c.dataset.kind, id:c.dataset.id,' +
  'title:c.querySelector(".card-title").textContent, emoji:"📕", phase:"focus", round:1, endsAt: Date.now()-2000}));' +
  'return "ok";})()');
await send('Page.reload');
await sleep(2600);
const restOn = await evaluate('!document.querySelector("#rest").hidden');
const restTime = await evaluate('(document.querySelector("#rest-time")||{}).textContent');
const restTip = await evaluate('(document.querySelector("#rest-tip")||{}).textContent');
console.log('   休息界面：' + (restOn ? '已出现，剩余 ' + restTime + ' · ' + restTip : '没出现'));
if (!restOn || !/^0[0-5]:/.test(String(restTime))) { console.log('   ⚠️ 休息界面不对'); problems++; }

/* 休息页也要有转圈倒计时（跟专注页同一套画法，顺时针收口） */
const restRing = await evaluate('(function(){' +
  'var g=document.getElementById("rest-ring");' +
  'if(!g) return {has:false};' +
  'var wrap=g.closest(".focus-clock-wrap");' +
  'var cs=getComputedStyle(g);' +
  'var svg=g.closest("svg");' +
  'var r=wrap?wrap.getBoundingClientRect():null;' +
  'return { has:true,' +
  '  dash: g.getAttribute("stroke-dasharray"),' +
  '  offset: g.getAttribute("stroke-dashoffset"),' +
  '  stroke: cs.stroke,' +
  '  rotated: svg ? getComputedStyle(svg).transform : "",' +
  '  size: r ? Math.round(r.width) + "x" + Math.round(r.height) : "" };})()');
console.log('   休息页转圈：' + JSON.stringify(restRing));
if (!restRing.has) { console.log('   ⚠️ 休息页没有转圈倒计时'); problems++; }
else {
  if (restRing.dash === '0 0' || !restRing.dash) { console.log('   ⚠️ 转圈的圆弧没设 dasharray'); problems++; }
  if (restRing.offset === null) { console.log('   ⚠️ 转圈没有 dashoffset，收口方向不对'); problems++; }
  // 跟专注页一样要 rotate(-90deg)：从 12 点开始、顺时针走
  if (!/matrix|rotate/.test(restRing.rotated)) { console.log('   ⚠️ 转圈没有旋转起始角（应和专注页一致）'); problems++; }
  if (/^0pxx?0px$|^$/.test(restRing.size)) { console.log('   ⚠️ 转圈没有尺寸'); problems++; }
}

// 再等一秒，圆弧要往前走（不往前走就是没在动）
// 等一秒再看：转圈是每秒走一次的，不等的话两次读数必然一样（我一开始就踩了这个）
await sleep(1100);
const restRing2 = await evaluate('(document.getElementById("rest-ring")||{getAttribute:function(){return null;}})'
  + '.getAttribute("stroke-dasharray")');
console.log('   一秒后圆弧：' + restRing.dash + ' → ' + restRing2);
if (restRing.dash === restRing2) { console.log('   ⚠️ 转圈没在走（dasharray 一秒都没变）'); problems++; }
await shot('12-rest');

/* ---- 休息结束后应该回到专注 ---- */
await mustClick('[data-act="rest-done"]', '我休息好啦');
await sleep(500);
const backToFocus = await evaluate('!document.querySelector("#focusmask").hidden && document.querySelector("#rest").hidden');
console.log('   休息结束后回到专注：' + (backToFocus ? '是' : '否'));
if (!backToFocus) { console.log('   ⚠️ 没有回到专注'); problems++; }
await shot('13-focus-again');

/* ------------------------------------------------------------------
 * 放最后：切换房间会整页跳转，后面的检查都得重来，所以留到最后一步。
 * ------------------------------------------------------------------ */
console.log('\n【房间切换】');

/** 进家长 → 输密码（如果锁着）→ 设置页 */
async function goParentSettings() {
  await mustClick('#tabbar [data-view="parent"]', '家长标签');
  await sleep(250);
  if (await evaluate('Boolean(document.querySelector(\'[data-act="pin-key"]\'))')) {
    for (const k of ['1', '2', '3', '4']) await mustClick('[data-act="pin-key"][data-key="' + k + '"]');
    await sleep(250);
  }
  await mustClick('[data-act="parent-tab"][data-tab="settings"]', '设置标签');
}

/** 刷新列表 → 展开「其他房间」→ 点「切换」跳到指定房间 */
async function joinRoom(code) {
  await mustClick('[data-act="room-refresh"]', '刷新房间列表');
  await sleep(1400);
  if (await evaluate('!document.querySelector(\'.room-row[data-code="' + code + '"]\') &&' +
    ' Boolean(document.querySelector(\'[data-act="room-toggle-others"]\'))')) {
    await mustClick('.room-row.on .rr-main[data-act="room-toggle-others"]', '展开其他房间');
    await sleep(500);
  }
  await mustClick('.room-row[data-code="' + code + '"] [data-act="room-switch"]', '切换房间');
  await sleep(2200);
}

const SWITCH = 'SWITCH' + Date.now().toString(36).toUpperCase().slice(-5);
const madeRoom = await evaluate('fetch("/api/room",{method:"POST",headers:{"Content-Type":"application/json"},' +
  'body:JSON.stringify({code:"' + SWITCH + '",name:"切换测试房"})}).then(r=>r.json()).then(function(j){return j.room||"";})');
if (madeRoom !== SWITCH) {
  console.log('   ⚠️ 建不出用于切换测试的房间：' + madeRoom);
  problems++;
} else {
  await goParentSettings();
  await joinRoom(SWITCH);

  const after = await evaluate('(function(){return { search: location.search,' +
    ' title: document.getElementById("top-title").textContent,' +
    ' hw: document.querySelectorAll(\'.card[data-kind="homework"]\').length };})()');
  console.log('   切到 ' + SWITCH + ' 之后：' + JSON.stringify(after));
  if (String(after.search).indexOf(SWITCH) < 0) { console.log('   ⚠️ 切换房间没改 URL'); problems++; }
  if (after.title !== '切换测试房') { console.log('   ⚠️ 新房间的标题不对：' + after.title); problems++; }
  if (after.hw !== 0) { console.log('   ⚠️ 新房间是空的，却读到 ' + after.hw + ' 条作业'); problems++; }
  await shot('29-room-switched');

  /* 空房间正好能验：「待确认」和「已确认」为空时风格要一致 */
  await mustClick('#tabbar [data-view="parent"]', '家长标签');
  await sleep(250);
  if (await evaluate('Boolean(document.querySelector(\'[data-act="pin-key"]\'))')) {
    for (const k of ['1', '2', '3', '4']) await mustClick('[data-act="pin-key"][data-key="' + k + '"]');
    await sleep(250);
  }
  await mustClick('[data-act="parent-tab"][data-tab="confirm"]', '待确认标签');
  await sleep(900);
  const emptyStates = await evaluate('(function(){' +
    'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
    'function secOf(kw){var h=hs.filter(function(x){return x.textContent.indexOf(kw)>=0;})[0];' +
    '  return h ? h.closest(".panel") : null;}' +
    'function info(sec){if(!sec) return null;var e=sec.querySelector(".empty");' +
    '  if(e) return { kind:"empty", emoji:(e.querySelector(".empty-emoji")||{}).textContent||"",' +
    '    text:(e.querySelector("p")||{}).textContent||"" };' +
    '  var h=sec.querySelector("p.hint");' +
    '  return h ? { kind:"hint", text:h.textContent } : { kind:"none" };}' +
    'return { waiting: info(secOf("待确认")), done: info(secOf("已确认")) };})()');
  console.log('   两个空状态：' + JSON.stringify(emptyStates));
  if (!emptyStates || !emptyStates.waiting || !emptyStates.done) {
    console.log('   ⚠️ 找不到待确认/已确认区块'); problems++;
  } else {
    if (emptyStates.waiting.kind !== 'empty') { console.log('   ⚠️ 待确认为空时不是 empty 块'); problems++; }
    if (emptyStates.done.kind !== 'empty') {
      console.log('   ⚠️ 已确认为空时风格和待确认不一致（是 ' + emptyStates.done.kind + '）'); problems++;
    }
  }
  await shot('33-empty-states');
  await mustClick('[data-act="parent-tab"][data-tab="settings"]', '设置标签');

  /* 再切回去，验证原来的数据还在 */
  await goParentSettings();
  await joinRoom(room);
  const back = await evaluate('(function(){return { search: location.search,' +
    ' hw: document.querySelectorAll(\'.card[data-kind="homework"]\').length,' +
    ' title: document.getElementById("top-title").textContent };})()');
  console.log('   切回 ' + room + ' 之后：' + JSON.stringify(back));
  if (back.hw < 1) { console.log('   ⚠️ 切回来原来的数据没了'); problems++; }
}

/* ------------------------------------------------------------------
 * 附件：录入作业能传（第 1 条），交作业也能传（第 2 条）
 *
 * 用 CDP 的 DOM.setFileInputFiles 给 <input type=file> 塞真文件 ——
 * 走的是浏览器自己的上传路径（不是伪造一个 fetch），
 * 所以 flaky 的 FormData / MIME / 缩略图这些问题都能一起测到。
 * ------------------------------------------------------------------ */
console.log('\n【附件：录入作业 / 交作业】');
{
  const attDir = path.join(ROOT, 'tmp', 'att-test');
  fs.mkdirSync(attDir, { recursive: true });
  const pngPath = path.join(attDir, '老师的卷子.png');
  const txtPath = path.join(attDir, '要背的课文.txt');
  // 最小的合法 PNG（1x1），保证 <img> 真能解出来，不是碎图
  fs.writeFileSync(pngPath, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'));
  fs.writeFileSync(txtPath, Buffer.from('静夜思\n床前明月光，疑是地上霜。', 'utf8'));
  /*
   * 再造一张**大图**用来验压缩（第 75 轮 2）：
   * 1200×900 的噪声 PNG —— 噪声 zlib 压不动，文件天然是几 MB，
   * 正好模拟"手机拍的照片"。压完应该小很多、尺寸也会降到 1800px 以内。
   */
  const bigPath = path.join(attDir, '大照片.png');
  if (!fs.existsSync(bigPath)) makeBigPng(bigPath);

  const supportsAtt = await evaluate('Boolean(window.__hbAttOn) || true');
  void supportsAtt;

  /*
   * 先确保家长页是开着的：家长页 30 秒没操作会自动上锁，
   * 而这个测试套件跑一趟好几分钟，走到这里多半已经锁了。
   * （unlockParent 定义在下面，函数声明会提升，这里能直接用。）
   */
  await unlockParent();
  await sleep(600);
  await mustClick('[data-act="parent-tab"][data-tab="hw"]', '录入作业标签');
  await sleep(600);
  await mustClick('[data-act="add-tab"][data-tab="manual"]', '手动加一条');
  await sleep(700);

  const hasEntry = await evaluate('Boolean(document.querySelector(\'[data-att-input="hw-add"]\'))');
  console.log('   手动加一条里有「加附件」入口：' + hasEntry);
  if (!hasEntry) {
    console.log('   ⚠️ 手动加一条里没有「加附件」入口（附件功能没生效？）'); problems++;
  } else {
    /*
     * 第 58 轮 2：**先填字，再传附件**，填好的三样不能被清空。
     *
     * 踩过的坑：传完附件调了 render()，整块 innerHTML 重建，
     * 家长刚填的科目 / 标题 / 备注全没了（家长报的 bug）。
     */
    await evaluate('(function(){' +
      'var s=document.querySelector("#add-subject");' +
      'for (var i=0;i<s.options.length;i++){ if(s.options[i].value==="语文") s.selectedIndex=i; }' +
      'document.querySelector("#add-title").value="传附件前的标题";' +
      'document.querySelector("#add-detail").value="传附件前的备注"; return 1;})()');
    await sleep(300);
    const filled = await evaluate('(function(){' +
      'var s=document.querySelector("#add-subject");' +
      'return { subject:s.options[s.selectedIndex].value,' +
      '  title:document.querySelector("#add-title").value,' +
      '  detail:document.querySelector("#add-detail").value };})()');
    console.log('   传附件之前填的：' + JSON.stringify(filled));

    await pickFiles('[data-att-input="hw-add"]', [pngPath, txtPath]);
    await sleep(700);
    const kept = await evaluate('(function(){' +
      'var s=document.querySelector("#add-subject");' +
      'var t=document.querySelector("#add-title"), d=document.querySelector("#add-detail");' +
      'if(!s||!t||!d) return { gone:true };' +
      'return { subject:s.options[s.selectedIndex].value, title:t.value, detail:d.value };})()');
    console.log('   传完附件之后：' + JSON.stringify(kept));
    if (kept.gone || kept.title !== filled.title || kept.detail !== filled.detail ||
        kept.subject !== filled.subject) {
      console.log('   ⚠️ 传附件把已经填好的科目/标题/备注清空了：' +
        JSON.stringify(kept) + ' vs ' + JSON.stringify(filled)); problems++;
    }
    // 顺手验一下删附件也不会清空（同一个坑）。
    // 删**第二个**（文本那个），把图片留着 —— 下面的缩略图断言要用它。
    await mustClick('.att-box[data-att-for="hw-add"] .att-chip:nth-child(2) .att-del',
      '删掉草稿里的文本附件');
    await sleep(800);
    const kept2 = await evaluate('(function(){' +
      'var t=document.querySelector("#add-title");' +
      'return t?{ title:t.value, n:document.querySelectorAll(\'.att-box[data-att-for="hw-add"] .att-chip\').length }' +
      ':{ gone:true };})()');
    if (kept2.gone || kept2.title !== filled.title || kept2.n !== 1) {
      console.log('   ⚠️ 删附件之后输入框或列表不对：' + JSON.stringify(kept2)); problems++;
    } else {
      console.log('   删掉一个附件之后标题还在、还剩 ' + kept2.n + ' 个 ✓');
    }

    const draft = await evaluate('(function(){' +
      'var box=document.querySelector(\'.att-box[data-att-for="hw-add"]\');' +
      'return { n:box.querySelectorAll(".att-chip").length,' +
      ' text:box.textContent.replace(/\\s+/g," ").trim() };})()');
    console.log('   传完两个、又删掉一个：' + JSON.stringify(draft));
    // 传了 2 个、上面删掉 1 个，所以这里剩 1 个
    if (draft.n !== 1) { console.log('   ⚠️ 附件数量不对（' + draft.n + ' 个，应该 1 个）'); problems++; }
    if (draft.text.indexOf('老师的卷子.png') < 0) { console.log('   ⚠️ 看不到附件名'); problems++; }

    // 缩略图真的能显示 → 说明 /api/file 回来的字节是对的
    const thumb = await evaluate('(function(){' +
      'var im=document.querySelector(\'.att-box[data-att-for="hw-add"] .att-thumb\');' +
      'if(!im) return { found:false };' +
      'return { found:true, complete:im.complete, w:im.naturalWidth };})()');
    if (!thumb.found || !thumb.complete || !(thumb.w > 0)) {
      console.log('   ⚠️ 图片缩略图没显示出来：' + JSON.stringify(thumb)); problems++;
    }
    await shot('52-att-draft');

    /*
     * 第 2 条：附件区里不该再有「📎 要求 / 🙋 交上来的」分组标签
     * 第 6 条：一行两个。**必须在提交之前量** —— 提交后草稿就清空了。
     */
    const layout = await evaluate('(function(){' +
      'var box=document.querySelector(\'.att-box[data-att-for="hw-add"]\');' +
      'if(!box) return { err:"没有附件区" };' +
      'var l=box.querySelector(".att-list"); if(!l) return { err:"没有列表" };' +
      'var g=getComputedStyle(l);' +
      'var cs=[].slice.call(l.querySelectorAll(".att-chip"));' +
      'return { display:g.display, cols:g.gridTemplateColumns.split(" ").length, n:cs.length,' +
      ' ys:cs.map(function(c){return Math.round(c.getBoundingClientRect().top);}),' +
      ' labels:box.querySelectorAll(".att-label").length };})()');
    console.log('   附件排版：' + JSON.stringify(layout));
    if (layout.err) {
      console.log('   ⚠️ 附件排版没测到：' + layout.err); problems++;
    } else {
      if (layout.display !== 'grid' || layout.cols !== 2) {
        console.log('   ⚠️ 附件不是一行两个：' + JSON.stringify(layout)); problems++;
      }
      if (layout.n >= 2 && layout.ys[0] !== layout.ys[1]) {
        console.log('   ⚠️ 前两个附件没排在同一行：' + JSON.stringify(layout.ys)); problems++;
      }
      if (layout.labels !== 0) {
        console.log('   ⚠️ 附件区里还留着分组标签'); problems++;
      }
    }

    const hwTitle = '带附件的作业_' + Date.now().toString().slice(-5);
    /*
     * 备注故意写成**多行**：专注页要按录入的分段一条条显示，
     * 不能糊成一大团（第 61 轮）。下面进专注页时会断言这一点。
     */
    const hwNote = '第一条要求：读一遍\n第二条要求：写一遍\n第三条要求：背下来';
    await evaluate('(function(t,d){' +
      'document.querySelector("#add-title").value=t;' +
      'document.querySelector("#add-detail").value=d; return 1;})(' +
      JSON.stringify(hwTitle) + ',' + JSON.stringify(hwNote) + ')');
    await sleep(250);
    await mustClick('[data-act="hw-add"]', '添加到这一天');
    await sleep(1600);

    const saved = await evaluate('fetch("/api/state/' + room + '").then(r=>r.json()).then(function(j){' +
      'var d=new Date();var k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+' +
      'String(d.getDate()).padStart(2,"0");' +
      'var h=(j.state.days[k]||{}).homeworks.filter(function(x){return x.title===' +
      JSON.stringify(hwTitle) + ';})[0];' +
      'return h?{ n:(h.attachments||[]).length, kinds:(h.attachments||[]).map(function(a){return a.kind;}) }' +
      ':{ missing:true };})');
    console.log('   存到服务器上：' + JSON.stringify(saved));
    if (saved.missing || saved.n !== 1) {
      console.log('   ⚠️ 附件没跟着作业一起存下来：' + JSON.stringify(saved)); problems++;
    } else if (saved.kinds.indexOf('image') < 0) {
      console.log('   ⚠️ 附件类型认错了：' + JSON.stringify(saved.kinds)); problems++;
    }

    // 提交后草稿要清空（不清的话会误挂到下一条作业上）
    const left = await evaluate('document.querySelectorAll(\'.att-box[data-att-for="hw-add"] .att-chip\').length');
    if (left !== 0) { console.log('   ⚠️ 加完之后附件区没清空（还剩 ' + left + ' 个）'); problems++; }

    const rowAtt = await evaluate('(function(){' +
      'var rows=[].slice.call(document.querySelectorAll(".row-item"));' +
      'var r=rows.filter(function(x){return x.textContent.indexOf(' + JSON.stringify(hwTitle) + ')>=0;})[0];' +
      'if(!r) return { found:false };' +
      'return { found:true, chips:r.querySelectorAll(".att-chip").length,' +
      ' labels:r.querySelectorAll(".att-label").length,' +
      ' dels:r.querySelectorAll(".att-del").length };})()');
    console.log('   作业行里：' + JSON.stringify(rowAtt));
    if (!rowAtt.found || rowAtt.chips !== 1) {
      console.log('   ⚠️ 作业行里没列出附件：' + JSON.stringify(rowAtt)); problems++;
    }
    // 附件直接铺出来，不该再有「📎 要求」这类分组标签
    if (rowAtt.labels !== 0) {
      console.log('   ⚠️ 作业行里还留着附件分组标签（' + rowAtt.labels + ' 个）'); problems++;
    }
    // 第 57 轮 2：列表里不直接删附件，增删都走「修改」
    if (rowAtt.dels !== undefined && rowAtt.dels !== 0) {
      console.log('   ⚠️ 作业行里出现了删除附件的按钮（' + rowAtt.dels + ' 个），应该只在「修改」里删'); problems++;
    }

    /* 行内顺序：标题 → 备注 → 附件 → 小红花 */
    const rowTops = await evaluate('(function(){' +
      'var rows=[].slice.call(document.querySelectorAll(".row-item"));' +
      'var r=rows.filter(function(x){return x.textContent.indexOf(' + JSON.stringify(hwTitle) + ')>=0;})[0];' +
      'if(!r) return [];' +
      'return [].slice.call(r.querySelector(".ri-main").children).map(function(el){' +
      '  return { cls:el.className, y:Math.round(el.getBoundingClientRect().top) }; });})()');
    const order = rowTops.map(function (t) { return t.cls.split(' ')[0]; }).join('>');
    console.log('   行内顺序：' + order);
    if (order !== 'ri-title>ri-note-line>att-box>ri-tags') {
      console.log('   ⚠️ 行内顺序不对（应该 标题→备注→附件→小红花）：' + order); problems++;
    }

    /*
     * 第 2 条：附件区里不该再有「📎 要求 / 🙋 交上来的」分组标签
     * 第 6 条：一行两个
     */
    await shot('53-att-homework');

    /* 「加进这一天」之后，拿这个新 id 去点 ☆ / ✎ / ✕ 必须都还有反应 ——
       id 两边不一致的话这里会静默失败（老 bug 的守卫） */
    const staleCheck = await evaluate('(function(){' +
      'var rows=[].slice.call(document.querySelectorAll(".row-item"));' +
      'var r=rows.filter(function(x){return x.textContent.indexOf(' + JSON.stringify(hwTitle) + ')>=0;})[0];' +
      'if(!r) return { found:false };' +
      'var b=r.querySelector(\'[data-act="hw-edit"]\');' +
      'if(b) b.click();' +
      'return { found:true, id:b?b.dataset.id:"" };})()');
    await sleep(900);
    const editOpen = await evaluate('(function(){' +
      'var m=document.querySelector(".modal"); if(!m) return null;' +
      'return [].slice.call(m.querySelectorAll(".form-row > label"))' +
      '.map(function(l){return l.textContent.trim();})' +
      '.filter(function(t){return t && t.indexOf("加附件")<0;});})()');
    console.log('   新加的作业点 ✎：' + JSON.stringify(editOpen));
    if (!editOpen) {
      console.log('   ⚠️ 新加的作业点「修改」打不开（多半是 id 两边不一致）'); problems++;
    } else if (editOpen.join(',') !== '科目,内容,备注,附件,小红花') {
      console.log('   ⚠️ 修改弹窗字段顺序不对：' + editOpen.join(',')); problems++;
    }
    /*
     * 第 56 轮 4：弹窗里附件要和上面的输入框**同起同宽**。
     * 踩过：.att-field 选错元素（选成里面那层 .att-box）规则不生效，
     * 附件一多就换到下一行、跑到标签左边去。
     */
    const editAlign = await evaluate('(function(){' +
      'var m=document.querySelector(".modal"); if(!m) return null;' +
      'var rows=[].slice.call(m.querySelectorAll(".form-row"));' +
      'function box(r){ var f=r.querySelector(".field")||r.querySelector(".num-wrap")||r.querySelector(".att-field");' +
      '  if(!f) return null; var b=f.getBoundingClientRect();' +
      '  return { label:(r.querySelector("label")||{}).textContent||"",' +
      '    left:Math.round(b.left), w:Math.round(b.width) }; }' +
      'var fs=rows.map(box).filter(Boolean);' +
      'var input=fs.filter(function(f){return f.label==="内容";})[0];' +
      'var att=fs.filter(function(f){return f.label==="附件";})[0];' +
      'return att&&input ? { sameLeft:att.left===input.left,' +
      '  dw:Math.abs(att.w-input.w), labels:fs.map(function(f){return f.label;}) } : null;})()');
    console.log('   弹窗对齐：' + JSON.stringify(editAlign));
    if (!editAlign) {
      console.log('   ⚠️ 修改弹窗里量不到附件那一行'); problems++;
    } else {
      if (!editAlign.sameLeft) { console.log('   ⚠️ 附件和输入框没左对齐'); problems++; }
      if (editAlign.dw > 2) {
        console.log('   ⚠️ 附件和输入框宽度差 ' + editAlign.dw + 'px（应该一样宽）'); problems++;
      }
      if (editAlign.labels.join(',') !== '科目,内容,备注,附件,小红花') {
        console.log('   ⚠️ 附件被挤到了别的位置：' + editAlign.labels.join(',')); problems++;
      }
    }
    if (editOpen) { await mustClick('.modal .btn.ghost', '关掉修改弹窗'); await sleep(500); }
    void staleCheck;

    /* ---------------- 第 2 条：交作业时传附件 ---------------- */
    await mustClick('#tabbar [data-view="today"]', '今天标签');
    await sleep(800);
    const started = await evaluate('(function(){' +
      'var cards=[].slice.call(document.querySelectorAll(".card"));' +
      // 优先挑刚加的那条（它身上有家长传的附件，才能验第 8 条）
      'var mine=cards.filter(function(x){return x.textContent.indexOf(' + JSON.stringify(hwTitle) + ')>=0 &&' +
      ' !x.classList.contains("done") && x.querySelector(\'[data-act="focus-start"]\');})[0];' +
      'var c=mine || cards.filter(function(x){return !x.classList.contains("done") &&' +
      ' x.querySelector(\'[data-act="focus-start"]\');})[0];' +
      'if(!c) return { ok:false };' +
      'var name=(c.querySelector(".card-title-text")||{}).textContent||"";' +
      'var id=c.dataset.id;' +
      'c.querySelector(\'[data-act="focus-start"]\').click();' +
      'return { ok:true, picked:name, pickedId:id, wasMine:Boolean(mine),' +
      ' allTitles:cards.map(function(x){return (x.querySelector(".card-title-text")||{}).textContent||"";}) };})()');
    console.log('   挑中的卡片：' + JSON.stringify(started));
    // 这条作业在服务器上到底有没有附件？
    const pickedServer = await evaluate('fetch("/api/state/' + room + '").then(r=>r.json()).then(function(j){' +
      'var d=new Date();var k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+' +
      'String(d.getDate()).padStart(2,"0");' +
      'var h=(j.state.days[k].homeworks||[]).filter(function(x){return x.id===' +
      JSON.stringify(started && started.pickedId) + ';})[0];' +
      'return h?{ id:h.id, title:h.title, n:(h.attachments||[]).length }:{ missing:true };})');
    console.log('   服务器上这条：' + JSON.stringify(pickedServer));
    if (!started || !started.ok) {
      console.log('   ⚠️ 没有可以开始专注的卡片（交作业测试跳过）'); problems++;
    } else {
      await sleep(1100);
    /*
     * 如果已经有别的在专注，点新的会先弹「换一项专注？」——
     * 这是刻意的（不能默默放弃孩子正在做的那一项）。测试要把这个确认点掉，
     * 不然专注的还是上一条，后面的断言就全对错人了。
     */
    if (await evaluate('Boolean(document.querySelector(".modal"))')) {
      await mustClick('.modal .btn.primary', '换这一项');
      await sleep(1100);
    }
    if (await evaluate('document.getElementById("focusmask").hidden')) {
      console.log('   ⚠️ 专注页没打开'); problems++;
    }

      /*
       * 第 8 条：专注页要能看到爸爸妈妈传的要求（做题时能随手复核）。
       * 第 9 条：上传按钮在上面，孩子传的东西在**下面**、一行一个。
       * 第 56 轮：两块都**不加小标题**，要求那块也一行一个；上传要有
       *          拍照 / 录像、录音、选文件三个入口（手机上靠 capture 直接调起来）。
       */
      const focusReq = await evaluate('(function(){' +
        'var m=document.getElementById("focusmask");' +
        'var req=m.querySelector(".focus-req");' +
        'var add=m.querySelector(".focus-work .att-add");' +
        'var list=m.querySelector(".focus-work .att-list");' +
        'var tip=m.querySelector(".focus-tip");' +
        'var srcs=[].slice.call(m.querySelectorAll(\'[data-att-input="focus-work"]\')).map(function(i){' +
        '  return { accept:i.getAttribute("accept")||"", capture:i.getAttribute("capture")||"" }; });' +
        'return { supported:"wakeLock" in navigator,' +
        ' tip: tip?tip.textContent.trim():"",' +
        ' labels:m.querySelectorAll(".att-label").length,' +
        ' reqCols: req&&req.querySelector(".att-list")' +
        '   ? getComputedStyle(req.querySelector(".att-list")).gridTemplateColumns.split(" ").length : 0,' +
        ' reqChips: req?req.querySelectorAll(".att-chip").length:0,' +
        ' sources: srcs,' +
        ' addTop: add?Math.round(add.getBoundingClientRect().top):null,' +
        ' listTop: list?Math.round(list.getBoundingClientRect().top):null };})()');
      console.log('   专注页：' + JSON.stringify(focusReq));
      // S.focus 会写进 localStorage，正好用来确认 req（家长附件）到底有没有带进来
      const focusStored = await evaluate('(function(){' +
        'var raw=localStorage.getItem("hb_focus_' + room + '");' +
        'if(!raw) return { noFocus:true };' +
        'var f=JSON.parse(raw);' +
        'return { id:f.id, title:f.title, reqN:(f.req||[]).length, worksN:(f.works||[]).length };})()');
      console.log('   S.focus 里带的：' + JSON.stringify(focusStored));
      // 第 56 轮 2：不再有「📎 爸爸妈妈传的要求（点开看）」那个小标题
      if (focusReq.labels !== 0) {
        console.log('   ⚠️ 专注页里还有附件分组标题（' + focusReq.labels + ' 个）'); problems++;
      }
      // 第 56 轮 3：提示语
      if (focusReq.tip !== '专心做这一件事，做完可拍照或录音，按下面的按钮完成') {
        console.log('   ⚠️ 专注页提示语不对：' + focusReq.tip); problems++;
      }
      // 第 56 轮 1：手机上一键调相机 / 录音机
      const hasCamera = focusReq.sources.some(function (s) {
        return s.capture === 'environment' && s.accept.indexOf('image/*') >= 0;
      });
      const hasRec = focusReq.sources.some(function (s) { return s.accept.indexOf('audio/*') >= 0; });
      const hasFile = focusReq.sources.some(function (s) { return s.accept.indexOf('.png') >= 0; });
      if (!hasCamera || !hasRec || !hasFile) {
        console.log('   ⚠️ 专注页的上传入口不全（要拍照/录像、录音、选文件三个）：' +
          JSON.stringify(focusReq.sources)); problems++;
      }
      if (focusReq.reqChips < 1) {
        console.log('   ⚠️ 专注页里看不到爸爸妈妈传的要求（孩子没法复核）'); problems++;
      } else if (focusReq.reqCols !== 1) {
        console.log('   ⚠️ 专注页里家长传的附件不是一行一个（' + focusReq.reqCols + ' 列）'); problems++;
      }
      // 第 10 条：别息屏
      if (!focusReq.supported) {
        console.log('   ⚠️ 这个浏览器没有 Screen Wake Lock（专注时会息屏）'); problems++;
      }

      /* 第 57 轮 6/7：三个按钮整体居中；已传附件的大小靠右（紧挨删除按钮） */
      const focusLayout = await evaluate('(function(){' +
        'var m=document.getElementById("focusmask");' +
        'var card=m.querySelector(".focus-card");' +
        'var row=m.querySelector(".focus-work .att-add-row");' +
        'if(!row) return null;' +
        'var b=function(el){var r=el.getBoundingClientRect();return {c:Math.round(r.left+r.width/2),' +
        '  l:Math.round(r.left), r:Math.round(r.right)};};' +
        'return { rowMid:b(row).c, cardMid:b(card).c, alignSelf:getComputedStyle(row).alignSelf };})()');
      console.log('   专注页按钮行：' + JSON.stringify(focusLayout));
      if (!focusLayout) {
        console.log('   ⚠️ 专注页里找不到上传按钮行'); problems++;
      } else if (Math.abs(focusLayout.rowMid - focusLayout.cardMid) > 4) {
        console.log('   ⚠️ 上传按钮没居中（行中心 ' + focusLayout.rowMid +
          ' vs 卡片中心 ' + focusLayout.cardMid + '）'); problems++;
      }

      /*
       * 第 61 轮：专注页的备注要**按录入的分段**显示。
       * 上面那条作业的备注写了三行，这里必须渲染成三条、每条一行。
       */
      const noteUI = await evaluate('(function(){' +
        'var m=document.getElementById("focusmask");' +
        'var ul=m.querySelector(".focus-note-list");' +
        'var p=m.querySelector(".focus-note");' +
        'if(ul){ var lis=[].slice.call(ul.querySelectorAll("li"));' +
        '  var cs=lis.length?getComputedStyle(lis[0]):null;' +
        '  return { kind:"list", n:lis.length,' +
        '    texts:lis.map(function(x){return x.textContent;}),' +
        '    tops:lis.map(function(x){return Math.round(x.getBoundingClientRect().top);}),' +
        '    dotContent:cs?getComputedStyle(lis[0],"::before").content:"none",' +
        '    padLeft:cs?cs.paddingLeft:"0px",' +
        '    listStyle:cs?cs.listStyleType:"none" }; }' +
        // 第 64 轮：不再有"居中一句话"的老样式，单行也必须走列表
        'return { kind:"none", legacyP:Boolean(p) };})()');
      console.log('   专注页的备注：' + JSON.stringify(noteUI));
      if (noteUI.kind !== 'list' || noteUI.n !== 3) {
        console.log('   ⚠️ 多行备注没有按分段显示（应该是 3 条列表）：' + JSON.stringify(noteUI)); problems++;
      } else {
        if (new Set(noteUI.tops).size !== 3) {
          console.log('   ⚠️ 备注的几段挤在同一行：' + JSON.stringify(noteUI.tops)); problems++;
        }
        if (noteUI.texts.join('|') !== hwNote.split('\n').join('|')) {
          console.log('   ⚠️ 备注文字和录入的不一致：' + noteUI.texts.join('|')); problems++;
        }
        // 家长要求：前面**不要**小圆点
        const hasDot = noteUI.dotContent && noteUI.dotContent !== 'none' && noteUI.dotContent !== 'normal';
        if (hasDot || parseFloat(noteUI.padLeft) > 0 || noteUI.listStyle !== 'none') {
          console.log('   ⚠️ 备注前面又出现小圆点了：' + JSON.stringify(noteUI)); problems++;
        }
      }

      /*
       * 第 64 轮：**单行**备注也要用同一套列表样式（家长要求统一风格）。
       * 找一条只有一行备注的卡片进去看看。
       */
      await mustClick('[data-act="focus-stop"]', '先退出专注');
      await sleep(800);
      const oneLineNote = await evaluate('(function(){' +
        'var cards=[].slice.call(document.querySelectorAll(".card"));' +
        'var c=cards.filter(function(x){' +
        '  var d=x.querySelector(".card-detail");' +
        '  return d && d.textContent.trim() && d.textContent.indexOf("\\n") < 0 &&' +
        '    !x.classList.contains("done") && x.querySelector(\'[data-act="focus-start"]\');})[0];' +
        'if(!c) return null;' +
        'var t=c.querySelector(".card-detail").textContent.trim();' +
        'c.querySelector(\'[data-act="focus-start"]\').click();' +
        'return t;})()');
      await sleep(1200);
      if (await evaluate('Boolean(document.querySelector(".modal"))')) {
        await mustClick('.modal .btn.primary', '换这一项');
        await sleep(1100);
      }
      const oneUI = await evaluate('(function(){' +
        'var m=document.getElementById("focusmask");' +
        'if(m.hidden) return { hidden:true };' +
        'var ul=m.querySelector(".focus-note-list");' +
        'var lis=ul?[].slice.call(ul.querySelectorAll("li")):[];' +
        'return { hidden:false, kind:ul?"list":"none", n:lis.length,' +
        '  text:lis.length?lis[0].textContent:"",' +
        '  legacyP:Boolean(m.querySelector(".focus-note")) };})()');
      console.log('   单行备注「' + oneLineNote + '」在专注页里：' + JSON.stringify(oneUI));
      if (!oneLineNote) {
        console.log('   ⚠️ 找不到只有单行备注的卡片（单行样式没测到）'); problems++;
      } else if (oneUI.hidden) {
        console.log('   ⚠️ 单行备注那条没进专注页'); problems++;
      } else {
        if (oneUI.kind !== 'list' || oneUI.n !== 1) {
          console.log('   ⚠️ 单行备注没有用列表样式（应该是 1 条的列表）：' + JSON.stringify(oneUI)); problems++;
        }
        if (oneUI.legacyP) {
          console.log('   ⚠️ 单行备注还在用旧的居中样式'); problems++;
        }
        if (oneUI.text !== oneLineNote) {
          console.log('   ⚠️ 单行备注文字不一致：' + JSON.stringify(oneUI.text)); problems++;
        }
      }
      // 回到原来那条，接着测附件
      if (!oneUI.hidden) {
        await mustClick('[data-act="focus-stop"]', '退出单行备注那条');
        await sleep(800);
      }
      await evaluate('(function(t){' +
        'var cards=[].slice.call(document.querySelectorAll(".card"));' +
        'var c=cards.filter(function(x){return x.textContent.indexOf(t)>=0;})[0];' +
        'if(c){ var b=c.querySelector(\'[data-act="focus-start"]\'); if(b) b.click(); } return 1;})(' +
        JSON.stringify(hwTitle) + ')');
      await sleep(1200);
      if (await evaluate('Boolean(document.querySelector(".modal"))')) {
        await mustClick('.modal .btn.primary', '换这一项');
        await sleep(1100);
      }

      const focusEntry = await evaluate('Boolean(document.querySelector(\'[data-att-input="focus-work"]\'))');
      if (!focusEntry) {
        console.log('   ⚠️ 专注页里没有「传照片 / 视频 / 录音」入口'); problems++;
      } else {
        await pickFiles('[data-att-input="focus-work"]', [pngPath, txtPath]);
        await sleep(1000);
        const workBox = await evaluate('(function(){' +
          'var box=document.querySelector(".focus-work");' +
          'var list=box.querySelector(".att-list");' +
          'var cs=[].slice.call(box.querySelectorAll(".att-chip")).map(function(c){' +
          '  return { y:Math.round(c.getBoundingClientRect().top), w:Math.round(c.getBoundingClientRect().width) }; });' +
          'var add=box.querySelector(".att-add");' +
          'return { n:cs.length, ys:cs.map(function(c){return c.y;}), ws:cs.map(function(c){return c.w;}),' +
          ' addTop: add?Math.round(add.getBoundingClientRect().top):null,' +
          ' listTop: list?Math.round(list.getBoundingClientRect().top):null,' +
          ' cols: list?getComputedStyle(list).gridTemplateColumns.split(" ").length:0 };})()');
        console.log('   专注页里孩子传的：' + JSON.stringify(workBox));
        if (workBox.n !== 2) {
          console.log('   ⚠️ 专注页里没显示已交的附件（' + workBox.n + ' 个）'); problems++;
        } else {
          if (workBox.cols !== 1 || workBox.ys[0] === workBox.ys[1]) {
            console.log('   ⚠️ 孩子传的附件不是一行一个：' + JSON.stringify(workBox)); problems++;
          }
          if (!(workBox.addTop < workBox.listTop)) {
            console.log('   ⚠️ 上传按钮不在附件上面：' + JSON.stringify(workBox)); problems++;
          }
          // 第 57 轮 7：文件大小靠右（紧挨删除按钮，不是紧贴整个框）
          const sizeRow = await evaluate('(function(){' +
            'var box=document.querySelector(".focus-work");' +
            'var s=box.querySelector(".att-size"), d=box.querySelector(".att-del");' +
            'var n=box.querySelector(".att-name");' +
            'if(!s||!d||!n) return null;' +
            'var r=function(el){var b=el.getBoundingClientRect();' +
            '  return {l:Math.round(b.left), r:Math.round(b.right)};};' +
            'return { size:r(s), del:r(d), name:r(n) };})()');
          console.log('   专注页附件内部：' + JSON.stringify(sizeRow));
          if (!sizeRow) {
            console.log('   ⚠️ 量不到专注页里附件的大小/删除按钮'); problems++;
          } else {
            if (sizeRow.del.l - sizeRow.size.r > 12) {
              console.log('   ⚠️ 文件大小没有靠右（和删除按钮隔了 ' +
                (sizeRow.del.l - sizeRow.size.r) + 'px）'); problems++;
            }
            if (!(sizeRow.name.l < sizeRow.size.l)) {
              console.log('   ⚠️ 文件名的位置不对（应该在大小左边）'); problems++;
            }
          }
        }
        await shot('54-att-focus');

        // 传完立刻就要进服务器（孩子可能直接退出）
        const onServer = await evaluate('fetch("/api/state/' + room + '").then(r=>r.json()).then(function(j){' +
          'var d=new Date();var k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+' +
          'String(d.getDate()).padStart(2,"0");var day=j.state.days[k]||{};var all=[];' +
          '(day.homeworks||[]).forEach(function(h){all=all.concat(h.works||[]);});' +
          '(day.extras||[]).forEach(function(e){all=all.concat(e.works||[]);});' +
          'Object.keys(day.tasks||{}).forEach(function(t){all=all.concat(day.tasks[t].works||[]);});' +
          'return all.length;})');
        if (onServer < 1) { console.log('   ⚠️ 传完没有立刻存进服务器'); problems++; }

        await mustClick('[data-act="focus-done"]', '我做完了');
        await sleep(1500);

        const kidCard = await evaluate('(function(){' +
          'var cards=[].slice.call(document.querySelectorAll(".card"));' +
          'var c=cards.filter(function(x){return x.querySelector(".card-att .att-chip");})[0];' +
          'return c ? c.querySelectorAll(".card-att .att-chip").length : 0;})()');
        if (kidCard < 1) { console.log('   ⚠️ 孩子卡片上看不到自己交的东西'); problems++; }
        await shot('55-att-kid');

        // 家长「待确认」里要能看到
        await mustClick('#tabbar [data-view="parent"]', '家长标签');
        await sleep(800);
        await mustClick('[data-act="parent-tab"][data-tab="confirm"]', '待确认标签');
        await sleep(900);
        const parentSee = await evaluate('(function(){' +
          'var sec=document.getElementById("sec-waiting"); if(!sec) return { found:false };' +
          'var rows=[].slice.call(sec.querySelectorAll(".row-item"));' +
          'var r=rows.filter(function(x){return x.querySelector(".att-chip");})[0];' +
          'if(!r) return { found:true, chips:0 };' +
          'var main=r.querySelector(".ri-main");' +
          'var order=[].slice.call(main.children).map(function(el){' +
          '  return el.className.split(" ")[0]; }).join(">");' +
          'return { found:true, chips:sec.querySelectorAll(".att-chip").length, order:order,' +
          ' labels:r.querySelectorAll(".att-label").length,' +
          ' badge:(r.querySelector(".badge")||{}).textContent||"",' +
          ' time:(r.querySelector(".ri-time")||{}).textContent||"" };})()');
        console.log('   家长待确认里：' + JSON.stringify(parentSee));
        if (!parentSee.found || !parentSee.chips) {
          console.log('   ⚠️ 家长在「待确认」里看不到孩子交的附件'); problems++;
        } else {
          // 第 7 条：标题 → 孩子传的附件 → 等确认状态及日期时间
          if (parentSee.order !== 'ri-title>att-box>ri-tags') {
            console.log('   ⚠️ 待确认行顺序不对（应该 标题→附件→状态/时间）：' + parentSee.order); problems++;
          }
          if (parentSee.labels !== 0) {
            console.log('   ⚠️ 待确认行里还留着附件分组标签'); problems++;
          }
          if (parentSee.badge.indexOf('确认') < 0 || parentSee.time.length < 8) {
            console.log('   ⚠️ 待确认行里缺少状态或日期时间：' + parentSee.badge + ' | ' + parentSee.time); problems++;
          }
        }
        await shot('56-att-parent');

        // 家长能删掉
        if (parentSee.chips) {
          await mustClick('#sec-waiting .att-del', '删掉孩子的附件');
          await sleep(1200);
          const afterDel = await evaluate('document.querySelectorAll("#sec-waiting .att-chip").length');
          if (afterDel !== parentSee.chips - 1) {
            console.log('   ⚠️ 家长删附件没生效：' + parentSee.chips + ' → ' + afterDel); problems++;
          }
        }
      }
    }
  }
}

/* ------------------------------------------------------------------
 * 家长模式自动上锁：三种「人走开了」都要在 30 秒后锁上
 *   1) 就在家长页上不动
 *   2) 切出网站（页面隐藏），隐藏期间的操作不算数
 *   3) 离开家长页（切到「今天」等标签）
 * 这里真等 30 秒 —— 不想为了跑测试在生产代码里留个"能改锁定时间"的后门。
 * 宽度扫描那种跑很多遍的场景可以 SKIP_SLOW=1 跳过这几段。
 * ------------------------------------------------------------------ */
console.log('\n【家长模式自动上锁】');

/** 进家长页，返回 true=解锁状态（看到模块标签） false=被锁（看到密码键盘） */
async function parentState() {
  await mustClick('#tabbar [data-view="parent"]', '家长标签');
  await sleep(350);
  const r = await evaluate('(function(){return {' +
    ' unlocked: Boolean(document.querySelector(\'[data-act="parent-tab"]\')),' +
    ' locked: Boolean(document.querySelector(\'[data-act="pin-key"]\')) };})()');
  return r;
}

/** 切到家长页；锁着就用密码进去 */
async function unlockParent() {
  await mustClick('#tabbar [data-view="parent"]', '家长标签');
  await sleep(450);
  if (await evaluate('Boolean(document.querySelector(\'[data-act="pin-key"]\'))')) {
    for (const k of ['1', '2', '3', '4']) await mustClick('[data-act="pin-key"][data-key="' + k + '"]');
    await sleep(450);
  }
}

const isLocked = () => evaluate('Boolean(document.querySelector(\'[data-act="pin-key"]\'))');

if (SKIP_SLOW) {
  console.log('  ⊘ SKIP_SLOW=1，跳过三段 30 秒计时测试');
} else {
  const vis = await evaluate('(function(){return {hidden:document.hidden, state:document.visibilityState};})()');
  console.log('   页面可见性（无头浏览器里应当 visible）：' + JSON.stringify(vis));
  if (vis.hidden) { console.log('   ⚠️ 页面一开始就是隐藏的，下面的计时测试不可靠'); problems++; }

  /* ---- 1) 在家长页上晾着不动 ---- */
  await unlockParent();
  console.log('   [1/3] 家长页上不动：先等 22 秒…');
  await sleep(22000);
  await mustClick('[data-act="parent-tab"][data-tab="tasks"]', '家长页上点一下');
  console.log('        点一下就重新计时，再等 12 秒（总共 34 秒，但只有 12 秒没操作）…');
  await sleep(12000);
  const stillAfterTouch = await evaluate('Boolean(document.querySelector(\'[data-act="parent-tab"]\'))');
  console.log('        有操作就重置了：' + (stillAfterTouch ? '仍然解锁 ✓' : '被锁了 ✗'));
  if (!stillAfterTouch) { console.log('   ⚠️ 家长页上刚操作过还是被锁了，说明计时没重置'); problems++; }

  console.log('        然后真的不动，再等 20 秒（距上次操作 32 秒）…');
  await sleep(20000);
  const locked1 = await isLocked();
  console.log('        家长页上无操作 30 秒：' + (locked1 ? '已上锁 ✓' : '还没锁 ✗'));
  if (!locked1) { console.log('   ⚠️ 家长页上无操作 30 秒没有上锁'); problems++; }

  /* ---- 2) 切出网站（页面隐藏） ---- */
  await unlockParent();
  console.log('   [2/3] 切出网站：先等 22 秒，然后模拟页面切到后台并点一下…');
  await sleep(22000);
  await evaluate('(function(){' +
    'Object.defineProperty(document,"hidden",{configurable:true,get:function(){return true;}});' +
    'Object.defineProperty(document,"visibilityState",{configurable:true,get:function(){return "hidden";}});' +
    'document.dispatchEvent(new Event("visibilitychange"));' +
    'document.body.click();return 1;})()');
  console.log('        藏着又过了 11 秒（距解锁 33 秒），隐藏期间的点击不该重置…');
  await sleep(11000);
  const locked2 = await isLocked();
  console.log('        切出网站 30 秒：' + (locked2 ? '已上锁 ✓' : '还没锁 ✗'));
  if (!locked2) { console.log('   ⚠️ 切出网站（页面隐藏）30 秒没有上锁'); problems++; }
  // 恢复可见性，别影响后面的检查
  await evaluate('(function(){' +
    'Object.defineProperty(document,"hidden",{configurable:true,get:function(){return false;}});' +
    'Object.defineProperty(document,"visibilityState",{configurable:true,get:function(){return "visible";}});' +
    'document.dispatchEvent(new Event("visibilitychange"));return 1;})()');
  await sleep(300);

  /* ---- 3) 离开家长页 ---- */
  await unlockParent();
  await mustClick('#tabbar [data-view="today"]', '今天标签');
  await sleep(1500);
  const quickBack = await parentState();
  console.log('   [3/3] 离开家长页 1.5 秒后回来：' + (quickBack.unlocked ? '仍然解锁 ✓' : '被锁了 ✗'));
  if (!quickBack.unlocked) { console.log('   ⚠️ 30 秒内回来就被锁了，窗口太短'); problems++; }

  await mustClick('#tabbar [data-view="today"]', '今天标签');
  console.log('        再离开，等 31 秒…');
  await sleep(31000);
  const afterLeave = await parentState();
  console.log('        离开家长页 31 秒：' + (afterLeave.locked ? '已上锁 ✓' : '还是解锁的 ✗'));
  if (!afterLeave.locked) { console.log('   ⚠️ 离开家长页超过 30 秒没有上锁'); problems++; }

  // 锁上之后，用密码还能正常进去
  for (const [k, vk] of [['1', 49], ['2', 50], ['3', 51], ['4', 52]]) await pressKey(k, vk);
  await sleep(400);
  const relock = await evaluate('Boolean(document.querySelector(\'[data-act="parent-tab"]\'))');
  console.log('        锁上后重新输密码：' + (relock ? '能进去 ✓' : '进不去 ✗'));
  if (!relock) { console.log('   ⚠️ 自动上锁后密码进不去了'); problems++; }
}

/* ------------------------------------------------------------------
 * 改过家长密码的房间，界面不该再写「默认 1234 / 初始密码 1234」
 * ------------------------------------------------------------------ */
console.log('\n【改过家长密码之后】');

const PINROOM = 'PINROOM' + Date.now().toString(36).toUpperCase().slice(-5);
const madePin = await evaluate('fetch("/api/room",{method:"POST",headers:{"Content-Type":"application/json"},' +
  'body:JSON.stringify({code:"' + PINROOM + '",name:"改过密码的房间"})})' +
  '.then(function(r){return r.json();}).then(function(j){return j.room||"";})');
if (madePin !== PINROOM) {
  console.log('   ⚠️ 建不出用于改密码测试的房间：' + madePin);
  problems++;
} else {
  await evaluate('fetch("/api/state/' + PINROOM + '/op",{method:"POST",' +
    'headers:{"Content-Type":"application/json"},' +
    'body:JSON.stringify({ops:[{t:"settings",patch:{parentPin:"9876"}}]})})');
  await sleep(500);
  await evaluate('location.href = location.pathname + "?room=' + PINROOM + '"');
  await sleep(2800);
  await mustClick('#tabbar [data-view="parent"]', '家长标签');
  await sleep(400);

  const pinUI = await evaluate('(function(){var g=document.querySelector(".pin-gate");' +
    'return g ? g.textContent.replace(/\\s+/g," ").trim() : "";})()');
  console.log('   改过密码后的提示：' + JSON.stringify(pinUI));
  if (/默认\s*1234/.test(pinUI)) { console.log('   ⚠️ 密码已改，界面还在写「默认 1234」'); problems++; }
  if (/初始密码/.test(pinUI)) { console.log('   ⚠️ 密码已改，界面还在写「初始密码」'); problems++; }

  // 顺便确认改过的密码真的能开门
  for (const k of ['9', '8', '7', '6']) await mustClick('[data-act="pin-key"][data-key="' + k + '"]', '新密码 ' + k);
  await sleep(400);
  const opened = await evaluate('Boolean(document.querySelector(\'[data-act="parent-tab"]\'))');
  console.log('   用新密码 9876 开门：' + (opened ? '成功 ✓' : '失败 ✗'));
  if (!opened) { console.log('   ⚠️ 改过的密码登不进去'); problems++; }
  await shot('34-pin-changed');

  // 清理
  await evaluate('fetch("/api/room/' + PINROOM + '",{method:"DELETE"})');
}

console.log('\n   ' + (problems ? '⚠️ 有 ' + problems + ' 个问题' : '✅ 全部正常') + '，截图在 ' + path.relative(ROOT, OUT) + '\n');
page.close();
process.exit(problems ? 1 : 0);
