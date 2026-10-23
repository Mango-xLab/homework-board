/*
 * 冒烟测试：一次加载页面，十几秒跑完最重要的那些检查。
 * 日常改完代码先跑这个；要细查再用 screenshot.mjs（那个慢但全）。
 *
 *   node scripts/smoke.mjs <房间码>
 *   WIDTH=375 node scripts/smoke.mjs <房间码>
 *
 * 需要先起服务 + 一个带 --remote-debugging-port 的 Chrome。
 */

import { openTab, browserVersion } from './lib/cdp.mjs';

const PORT = process.env.CDP_PORT || '9333';
const BASE = process.env.BASE || 'http://localhost:5199';
const WIDTH = Number(process.env.WIDTH || 400);
const room = (process.argv[2] || '').toUpperCase();

if (!room) { console.error('用法：node scripts/smoke.mjs <房间码>'); process.exit(1); }

let pass = 0, fail = 0;
const ok = function (name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); }
};

/* ---- 连浏览器（CDP 客户端在 scripts/lib/cdp.mjs，和 screenshot 共用） ---- */
console.log('   浏览器：' + await browserVersion(PORT));
const page = await openTab({
  url: BASE + '/?room=' + room,
  port: PORT,
  width: WIDTH,
  height: 900,
  scale: 1,
  mobile: true,
});
const evaluate = page.evaluate;
const sleep = page.sleep;
const click = page.click;

console.log('\n冒烟测试  房间=' + room + '  宽度=' + WIDTH);

/* ---------------------------------------------------------- 一、首页 */
const hero = await evaluate('(function(){return {' +
  ' err: window.__hbError || "",' +
  ' rings: document.querySelectorAll(".hero-right .ring-wrap").length,' +
  ' ringText: [].slice.call(document.querySelectorAll(".hero-right .hero-ring"))' +
  '   .map(function(x){return x.textContent.replace(/\\s+/g," ").trim();}).join(" | "),' +
  ' date: (document.querySelector(".hero-date")||{}).textContent || "",' +
  ' hiLines: Math.round(document.querySelector(".hero-hi").getBoundingClientRect().height /' +
  '   (parseFloat(getComputedStyle(document.querySelector(".hero-hi")).fontSize) * 1.25)),' +
  ' emptyDetails: [].slice.call(document.querySelectorAll(".card-detail"))' +
  '   .filter(function(x){return !x.textContent.trim();}).length,' +
  ' pills: [].slice.call(document.querySelectorAll(".panel-head .pill"))' +
  '   .map(function(x){return x.textContent.trim();}),' +
  ' overflow: (function(){var sc=document.getElementById("scroller");' +
  '   var a=document.documentElement.scrollWidth-document.documentElement.clientWidth;' +
  '   var b=sc?(sc.scrollWidth-sc.clientWidth):0; return Math.max(a,b);})() };})()');

ok('页面没有脚本报错', !hero.err, hero.err);
ok('首页两个圆环（今日小红花 + 完成度）', hero.rings === 2, hero.ringText);
ok('日期是「年月日 星期」', /^\d{4}年\d+月\d+日 星期/.test(String(hero.date)), hero.date);
ok('问候语一行放得下', hero.hiLines === 1, hero.hiLines + ' 行');
ok('没有空白的详细要求行', hero.emptyDetails === 0, String(hero.emptyDetails));
ok('两个清单都有 已完成/总数', hero.pills.length >= 2 && /^\d+\/\d+$/.test(hero.pills[1] || ''),
  JSON.stringify(hero.pills));
ok('没有横向溢出', hero.overflow <= 1, hero.overflow + 'px');

/* ---------------------------------------------------------- 二、家长端 */
for (const v of ['stars', 'week']) {
  await click('#tabbar [data-view="' + v + '"]');
  ok('「' + v + '」页能打开', await evaluate('document.querySelector("#view").children.length > 0'));
}
await click('#tabbar [data-view="parent"]');
for (const k of ['1', '2', '3', '4']) {
  if (await evaluate('Boolean(document.querySelector(\'[data-act="pin-key"]\'))')) {
    await click('[data-act="pin-key"][data-key="' + k + '"]');
  }
}
ok('家长密码能进去', await evaluate('Boolean(document.querySelector(".subtabs"))'));

/* ---------------------------------------------------------- 三、房间 */
await click('[data-act="parent-tab"][data-tab="settings"]');
await sleep(1200);

const roomUI = await evaluate('(function(){' +
  'var hs=[].slice.call(document.querySelectorAll(".panel-head h2"));' +
  'var h=hs.filter(function(x){return x.textContent.indexOf("🏠")>=0;})[0];' +
  'if(!h) return null;' +
  'var head=h.parentNode;' +
  'var btns=[].slice.call(head.querySelectorAll(".btn"));' +
  'var c=document.getElementById("set-childname");' +
  'var saveBtn=c ? c.closest(".form-row").querySelector(".btn") : null;' +
  'var rows=[].slice.call(document.querySelectorAll(".room-row"));' +
  'var first=rows[0];' +
  'var myCode=(document.body.textContent.match(/房间码：([A-Z0-9]{3,20})/)||[])[1]||"";' +
  'var tools=first ? [].slice.call(first.querySelectorAll(".rr-tools .room-act"))' +
  '   .map(function(b){return b.textContent.trim();}) : [];' +
  'var other=rows.filter(function(r){return !r.classList.contains("on");})[0];' +
  'var otherTools=other ? [].slice.call(other.querySelectorAll(".rr-tools .room-act"))' +
  '   .map(function(b){return b.textContent.trim();}) : [];' +
  // 折叠时其他房间是一摞半透明卡片；当前房间的中间区域是展开开关
  'var peeks=[].slice.call(document.querySelectorAll(".room-peek"));' +
  'var toggle=document.querySelector(\'.room-row.on [data-act="room-toggle-others"]\');' +
  'var others=document.querySelector(".room-others");' +
  'var peekBottom=peeks.length ? peeks[peeks.length-1].getBoundingClientRect().bottom : 0;' +
  'var overlap=peeks.length>1 ? (function(){' +
  '  var a=peeks[0].getBoundingClientRect(),b=peeks[1].getBoundingClientRect();' +
  // 算的是"下面那张露出多少"：从上面那张的底边，到自己底边
  '  var vis=Math.max(0, b.bottom-Math.max(a.bottom,b.top));' +
  '  return b.height ? Number((vis/b.height).toFixed(2)) : 0;})() : null;' +
  'var delDisabled=[].slice.call(document.querySelectorAll(".room-act.danger[disabled]")).length;' +
  // 四个按钮应该在行内、内容右侧（右对齐），不是另起一行
  'var align=(function(){var t=document.querySelector(".room-row .rr-tools");' +
  '  var m=document.querySelector(".room-row .rr-main");var row=document.querySelector(".room-row");' +
  '  if(!t||!m||!row) return null;' +
  '  var tr=t.getBoundingClientRect(),mr=m.getBoundingClientRect(),rr=row.getBoundingClientRect();' +
  '  return { toTheRight: tr.left >= mr.right - 2,' +
  '    sameLine: tr.top < mr.bottom - 2,' +
  '    rightAligned: Math.abs(tr.right - (rr.right - 11)) < 8 };})();' +   // 这个分号不能少：少了 })()

  'return { headBtns: btns.map(function(b){return b.textContent.trim();}),' +
  '  inTitleRow: btns.every(function(b){return Math.abs(b.getBoundingClientRect().top - h.getBoundingClientRect().top)<24;}),' +
  '  saveInChildRow: Boolean(saveBtn),' +
  '  firstIsMine: Boolean(first && first.dataset.code===myCode),' +
  '  tools: tools, otherTools: otherTools, rows: rows.length, align: align,' +
  '  hasToggle: Boolean(toggle),' +
  '  peekCount: peeks.length,' +
  '  peekSameWidth: Boolean(first && peeks.length &&' +
  '    Math.abs(peeks[0].getBoundingClientRect().width - first.getBoundingClientRect().width) <= 2),' +
  '  overlapRatio: overlap,' +
  '  othersHiddenByDefault: !others,' +
  '  delDisabled: delDisabled,' +
  '  noJoin: !document.querySelector(\'[data-act="room-join"]\') };})()');

ok('房间标题栏有三个按钮', roomUI && roomUI.headBtns.length === 3, JSON.stringify(roomUI && roomUI.headBtns));
ok('三个按钮和标题同一行', roomUI && roomUI.inTitleRow);
ok('保存按钮和孩子名字同一行', roomUI && roomUI.saveInChildRow);
ok('正在使用的房间置顶', roomUI && roomUI.firstIsMine);
ok('当前房间的动作是文字按钮（无「切换」）',
  roomUI && roomUI.tools.indexOf('复制网址') >= 0 && roomUI.tools.indexOf('编辑') >= 0 &&
  roomUI.tools.indexOf('删除') >= 0 && roomUI.tools.indexOf('切换') < 0,
  JSON.stringify(roomUI && roomUI.tools));
ok('按钮在行内、内容右侧、右对齐',
  roomUI && roomUI.align && roomUI.align.toTheRight && roomUI.align.sameLine && roomUI.align.rightAligned,
  JSON.stringify(roomUI && roomUI.align));
ok('正在使用的房间不给删（按钮禁用）', roomUI && roomUI.delDisabled >= 1, String(roomUI && roomUI.delDisabled));
ok('当前房间中间是展开/收起开关', roomUI && roomUI.hasToggle);
ok('其他房间默认折叠成一摞（最多 3 张）',
  roomUI && (roomUI.rows <= 1 || (roomUI.othersHiddenByDefault && roomUI.peekCount >= 1 && roomUI.peekCount <= 3)),
  JSON.stringify({ rows: roomUI && roomUI.rows, peeks: roomUI && roomUI.peekCount }));
ok('折叠卡片和当前房间一样宽', roomUI && (roomUI.rows <= 1 || roomUI.peekSameWidth));
ok('折叠卡片互相遮挡约 2/3（露出约 1/3）',
  roomUI && (roomUI.overlapRatio === null || (roomUI.overlapRatio >= 0.25 && roomUI.overlapRatio <= 0.42)),
  String(roomUI && roomUI.overlapRatio));
ok('「输入房间码」已经拿掉', roomUI && roomUI.noJoin);

/* 折叠的那一摞能展开再收起 */
if (roomUI && roomUI.hasToggle) {
  await click('.room-row.on [data-act="room-toggle-others"]');
  const shown = await evaluate('Boolean(document.querySelector(".room-others")) &&' +
    ' document.querySelectorAll(".room-others .room-row").length > 0');
  ok('点当前房间中间能展开', shown);
  ok('展开后能看到「切换」',
    await evaluate('Boolean(document.querySelector(\'.room-others [data-act="room-switch"]\'))'));
  ok('展开后折叠卡片消失', await evaluate('document.querySelectorAll(".room-peek").length === 0'));
  await click('.room-row.on [data-act="room-toggle-others"]');
  ok('再点能收回去',
    await evaluate('!document.querySelector(".room-others") &&' +
      ' document.querySelectorAll(".room-peek").length > 0'));
}

/* 窄屏再确认没有溢出（页面本身不滚，要量 #scroller） */
const over2 = await evaluate('(function(){var sc=document.getElementById("scroller");' +
  'var a=document.documentElement.scrollWidth-document.documentElement.clientWidth;' +
  'var b=sc?(sc.scrollWidth-sc.clientWidth):0;return Math.max(a,b);})()');
ok('家长页也没有横向溢出', over2 <= 1, over2 + 'px');

/* 底栏必须钉在最底下：页面本身不能能滚（能滚的话移动端会跟着地址栏漂） */
const pinned = await evaluate('(function(){' +
  'var sc=document.getElementById("scroller"); var tb=document.getElementById("tabbar");' +
  'if(!sc||!tb) return {err:"缺元素"};' +
  'var b=tb.getBoundingClientRect();' +
  'return { docCanScroll: document.documentElement.scrollHeight-document.documentElement.clientHeight,' +
  '   scrollerCanScroll: sc.scrollHeight-sc.clientHeight,' +
  '   tabbarPos: getComputedStyle(tb).position,' +
  '   距视口底: Math.round(window.innerHeight-b.bottom) };})()');
ok('页面本身不滚动（只有 #scroller 滚）', pinned.docCanScroll <= 1,
  'documentElement 还能滚 ' + pinned.docCanScroll + 'px');
ok('底栏 position:fixed 且贴在最底侧', pinned.tabbarPos === 'fixed' && pinned['距视口底'] === 0,
  JSON.stringify(pinned));
ok('内容区确实在滚（说明外壳生效了）', pinned.scrollerCanScroll > 0,
  '#scroller 可滚 ' + pinned.scrollerCanScroll + 'px');

/* 滚动内容区，底栏不能跟着动 */
if (pinned.scrollerCanScroll > 0) {
  const drift = await evaluate('(function(){' +
    'var sc=document.getElementById("scroller"), tb=document.getElementById("tabbar");' +
    'var before=Math.round(tb.getBoundingClientRect().bottom);' +
    'sc.scrollTop=sc.scrollHeight;' +
    'var after=Math.round(tb.getBoundingClientRect().bottom);' +
    'var top=Math.round(tb.getBoundingClientRect().top);' +
    'sc.scrollTop=0;' +
    'return { before:before, after:after, top:top, innerH:window.innerHeight };})()');
  ok('滚到底时底栏纹丝不动', drift.before === drift.after && drift.after === drift.innerH,
    JSON.stringify(drift));
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败\n');
page.close();
process.exit(fail ? 1 : 0);
