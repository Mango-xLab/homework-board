/*
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

const __ASSETS = {"/index.html":"<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#ffb703\">\n<meta name=\"description\" content=\"一年级小朋友的作业与每日任务小站，家长在钉钉收到作业后一键同步，孩子在家自己看、自己打勾。\">\n<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n<title>作业小站</title>\n<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%93%9A%3C/text%3E%3C/svg%3E\">\n<link rel=\"stylesheet\" href=\"./style.css\">\n</head>\n<body class=\"big-font\">\n\n<!-- 启动 / 首次进入 -->\n<div id=\"boot\" class=\"boot\">\n  <div class=\"boot-card\">\n    <div class=\"boot-emoji\">📚</div>\n    <h1>作业小站</h1>\n    <p id=\"boot-msg\">正在打开…</p>\n    <div class=\"boot-actions\" id=\"boot-actions\"></div>\n  </div>\n</div>\n\n<!-- 服务器上的文件换了新的，而这一页还是旧的 -->\n<div id=\"updatebar\" class=\"update-bar\" hidden>\n  <span>🔄 有新版本了</span>\n  <button class=\"chip ok\" id=\"btn-update\">点我刷新</button>\n</div>\n\n<!-- 顶栏 -->\n<header id=\"topbar\" class=\"topbar\" hidden>\n  <div class=\"topbar-left\">\n    <span class=\"topbar-emoji\" id=\"top-emoji\">📚</span>\n    <div class=\"topbar-title\">\n      <strong id=\"top-title\">作业小站</strong>\n      <small id=\"top-sub\"></small>\n    </div>\n  </div>\n  <div class=\"topbar-right\">\n    <!--\n      同步状态：是个**状态标签**，不是按钮（所以没有底色/边框/投影，也不是 button）。\n      上一版做成跟「字号」一样的白底圆框，家里人总以为可以点。\n    -->\n    <span class=\"sync-chip\" id=\"sync-dot\" title=\"已同步\"><i aria-hidden=\"true\"></i><em id=\"sync-text\">已同步</em></span>\n    <button class=\"icon-btn\" id=\"btn-sound\" title=\"朗读开关\">🔊</button>\n    <button class=\"icon-btn\" id=\"btn-font\" title=\"字号\">A+</button>\n    <!-- 版本号：点开看这次更新了什么。内容由 public/changelog.json 提供 -->\n    <button class=\"version-chip\" id=\"btn-version\" title=\"查看更新内容\" hidden>v…</button>\n  </div>\n</header>\n\n<!-- 专注时间：整页倒计时（点了「开始专注」才出现） -->\n<div id=\"focusmask\" class=\"focus-mask\" hidden></div>\n\n<!-- 主内容 -->\n<!-- 外面这层是唯一的滚动容器：让「页面本身」不滚动，底栏才能真正钉死在最底下。\n     移动端浏览器地址栏收放时会改变可视视口高度，文档一旦能滚，\n     position:fixed 的底栏就会跟着页面上下漂。 -->\n<div id=\"scroller\" class=\"scroller\">\n  <main id=\"view\" class=\"view\" hidden></main>\n</div>\n\n<!-- 底部导航 -->\n<nav id=\"tabbar\" class=\"tabbar\" hidden>\n  <button class=\"tab\" data-view=\"today\"><span>📚</span><em>今天</em></button>\n  <button class=\"tab\" data-view=\"stars\"><span>⭐</span><em>小红花</em></button>\n  <button class=\"tab\" data-view=\"week\"><span>📈</span><em>这一周</em></button>\n  <button class=\"tab\" data-view=\"parent\"><span>👨‍👩‍👧</span><em>家长</em></button>\n</nav>\n\n<div id=\"modal-root\"></div>\n<div id=\"rest\" class=\"rest-mask\" hidden></div>\n<div id=\"toast-root\" class=\"toast-root\"></div>\n<div id=\"confetti\" class=\"confetti\" aria-hidden=\"true\"></div>\n\n<script type=\"module\" src=\"./app.js\"></script>\n</body>\n</html>\n","/style.css":"/* 作业小站 · 样式\n   设计目标：暖色、圆润、字大、按钮大，一年级小朋友不看字也能认图标。 */\n\n:root {\n  --bg: #fdf4e6;\n  --bg-2: #f6e9d6;\n  --card: #fffdf9;\n  --card-2: #fff7ea;\n  --ink: #3d3226;\n  --ink-2: #8a7a68;\n  --ink-3: #b8a893;\n  --line: #efe2cd;\n  --accent: #ff9f1c;\n  --accent-d: #f08c00;\n  --ok: #21b573;\n  --ok-soft: #e6f8ef;\n  --wait: #f0a202;\n  --wait-soft: #fff5dc;\n  --danger: #e2564a;\n  --blue: #3b7fd4;\n  --r-lg: 1.4rem;\n  --r-md: 1rem;\n  --r-sm: .6rem;\n  --shadow: 0 .12rem .3rem rgba(150, 110, 60, .07), 0 .5rem 1.1rem rgba(150, 110, 60, .10);\n  --shadow-sm: 0 .1rem .25rem rgba(150, 110, 60, .10);\n  --safe-b: env(safe-area-inset-bottom, 0px);\n  --wk-arrow: 2.3rem; /* 「往前/往后翻一周」按钮的尺寸 */\n  --wk-gap: .35rem;\n  --ask-h: 3.5rem;    /* 「去确认」那条横幅的大致高度 */\n}\n\n* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }\n\nhtml {\n  font-size: 16px; /* 大字模式由 JS 调到 18px */\n  -webkit-text-size-adjust: 100%;\n  height: 100%;\n}\n\nbody {\n  margin: 0;\n  padding: 0;\n  font-family: -apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Hiragino Sans GB\",\n               \"Microsoft YaHei UI\", \"Microsoft YaHei\", \"Source Han Sans SC\", \"Noto Sans CJK SC\",\n               \"Segoe UI\", sans-serif;\n  color: var(--ink);\n  background: var(--bg);\n  background-image:\n    radial-gradient(circle at 12% -4%, #ffe9c4 0%, rgba(255, 233, 196, 0) 45%),\n    radial-gradient(circle at 96% 2%, #ffe2e2 0%, rgba(255, 226, 226, 0) 38%),\n    linear-gradient(180deg, var(--bg) 0%, var(--bg-2) 100%);\n  /* 这层背景现在固定不动（页面本身不滚了），不用 background-attachment: fixed ——\n     那个在 iOS 上很拖性能，还会连累 fixed 元素的绘制 */\n  height: 100%;\n  line-height: 1.55;\n  overflow-wrap: break-word;\n\n  /* 整页做成\"应用外壳\"：顶栏 / 滚动区 / 底栏 三段，\n     只有中间那段滚。这样底栏不可能跟着页面跑。 */\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n}\n\n/* 唯一的滚动容器。flex:1 + min-height:0 才能正确收缩，不然内容会把它撑破 */\n.scroller {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow-y: auto;\n  overflow-x: hidden;\n  -webkit-overflow-scrolling: touch;\n  overscroll-behavior-y: contain;   /* 到底了别再带着整页橡皮筋 / 触发下拉刷新 */\n  /*\n   * 关掉 Chrome 的\"滚动锚定\"。\n   *\n   * 打开时，如果视口上方的内容高度变了（比如刚加了一条作业），浏览器会偷偷改\n   * scrollTop 来\"保持视觉位置\"。结果整个列表在按下和抬起之间平移了，\n   * 这一次点击会被派发到共同祖先上而不是按钮上 —— 表现就是\"点了没反应\"。\n   */\n  overflow-anchor: none;\n}\n\n[hidden] { display: none !important; }\nbutton { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }\ninput, textarea, select { font: inherit; color: inherit; }\nh1, h2, h3, p { margin: 0; }\n\n/* ------------------------------------------------------------ 启动界面 */\n\n.boot {\n  position: fixed; inset: 0; z-index: 100;\n  display: flex; align-items: center; justify-content: center;\n  padding: 1.5rem;\n  background: linear-gradient(180deg, var(--bg) 0%, var(--bg-2) 100%);\n}\n.boot-card {\n  width: 100%; max-width: 24rem; text-align: center;\n  background: var(--card); border-radius: var(--r-lg);\n  padding: 2rem 1.5rem; box-shadow: var(--shadow);\n}\n.boot-emoji { font-size: 3.4rem; line-height: 1; margin-bottom: .6rem; animation: float 2.4s ease-in-out infinite; }\n@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-.35rem); } }\n.boot h1 { font-size: 1.6rem; letter-spacing: .06em; }\n.boot p { color: var(--ink-2); margin-top: .5rem; font-size: .95rem; }\n.boot-actions { display: flex; flex-direction: column; gap: .6rem; margin-top: 1.2rem; }\n\n/* -------------------------------------------------------------- 顶栏 */\n\n/* 有新版本时的提示条，点一下就重新加载 */\n.update-bar {\n  position: fixed; left: 50%; transform: translateX(-50%);\n  top: calc(.5rem + env(safe-area-inset-top, 0px));\n  z-index: 95;\n  display: flex; align-items: center; gap: .5rem;\n  max-width: 92vw; padding: .4rem .4rem .4rem .8rem;\n  border-radius: 999px; white-space: nowrap;\n  background: rgba(61, 50, 38, .94); color: #fff;\n  font-size: .82rem; font-weight: 700;\n  box-shadow: 0 .5rem 1.4rem rgba(90, 65, 30, .3);\n  animation: toastIn .3s cubic-bezier(.2,.9,.3,1.3);\n}\n.update-bar .chip { border: 0; }\n\n.topbar {\n  /* 现在页面本身不滚了，顶栏作为外壳的第一段常驻（sticky 留着也无害，不用再单独钉） */\n  position: sticky; top: 0; z-index: 40;\n  flex: none;\n  display: flex; align-items: center; justify-content: space-between; gap: .6rem;\n  padding: .6rem 1rem; padding-top: calc(.6rem + env(safe-area-inset-top, 0px));\n  background: rgba(253, 244, 230, .88);\n  backdrop-filter: saturate(160%) blur(12px);\n  -webkit-backdrop-filter: saturate(160%) blur(12px);\n  border-bottom: .06rem solid var(--line);\n}\n.topbar-left { display: flex; align-items: center; gap: .55rem; min-width: 0; flex: 1 1 auto; }\n.topbar-emoji { font-size: 1.5rem; flex: none; }\n.topbar-title { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }\n/*\n * 这两行**必须 nowrap**：中文是可以逐字换行的，一旦容器被压窄，\n * 「宝贝的作业小站」就会变成一字一行竖排。（真机上踩过。）\n * 挤不下就省略号，绝不换行。\n */\n.topbar-title strong {\n  font-size: 1rem; line-height: 1.2;\n  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;\n}\n.topbar-title small {\n  color: var(--ink-3); font-size: .7rem; line-height: 1.3;\n  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;\n}\n/* 右边这一排**不参与收缩**：它一缩，左边就没救了 */\n.topbar-right { display: flex; align-items: center; gap: .3rem; flex: none; }\n\n.icon-btn {\n  width: 2.3rem; height: 2.3rem; border-radius: 50%;\n  display: grid; place-items: center; font-size: 1rem; color: var(--ink-2);\n  background: #fff; border: .06rem solid var(--line); box-shadow: var(--shadow-sm);\n  transition: transform .12s ease, background .15s ease;\n}\n.icon-btn:active { transform: scale(.9); background: #fff6e5; }\n.icon-btn.off { opacity: .4; }\n\n.sync-dot {\n  width: .6rem; height: .6rem; border-radius: 50%;\n  background: var(--ok); box-shadow: 0 0 0 .2rem rgba(33,181,115,.15);\n  flex: none;\n}\n.sync-dot.off { background: var(--danger); box-shadow: 0 0 0 .2rem rgba(226,86,74,.15); }\n.sync-dot.busy { background: var(--wait); animation: pulse 1s infinite; }\n@keyframes pulse { 50% { opacity: .35; } }\n\n/* -------------------------------------------------------------- 主区 */\n\n.view {\n  max-width: 44rem; margin: 0 auto;\n  /* 底部留出底栏的高度再多一点余量。底栏实测 64px，\n     5rem（大字模式 90px）够用又不至于在手机上白白多滚一屏 */\n  padding: 1rem 1rem calc(5rem + var(--safe-b));\n}\n.page-narrow { max-width: 34rem; margin: 0 auto; }\n\n/* ------------------------------------------------------------ 顶部问候 */\n\n.hero {\n  display: flex; align-items: center; gap: 1rem;\n  background: linear-gradient(135deg, #fff6e2 0%, #ffeccd 100%);\n  border: .06rem solid #ffe2b0;\n  border-radius: var(--r-lg); padding: 1.1rem 1.2rem;\n  box-shadow: var(--shadow);\n}\n.hero { display: flex; align-items: center; gap: .7rem; }\n.hero-main { flex: 1; min-width: 0; }\n/* 右侧还要放「今日小红花 + 进度环」，问候语用 vw 自适应，\n   小屏自动收一点，不会因为某档断点没覆盖到就折成两行 */\n.hero-hi { font-size: clamp(.95rem, 5.9vw, 1.7rem); font-weight: 900; letter-spacing: .01em; line-height: 1.25; }\n/* 跟问候语拉开一点距离 */\n.hero-date { color: var(--ink-2); font-size: .92rem; font-weight: 600; margin-top: .5rem; }\n.hero-welcome {\n  margin-top: .6rem; font-size: .95rem; color: var(--accent-d);\n  background: #fff8e8; border-radius: .7rem; padding: .35rem .6rem; display: inline-block;\n  border: .06rem dashed #ffd88a;\n}\n/* 两个小圆环并排：今日小红花 + 任务进度 */\n.hero-right { flex: none; display: flex; align-items: flex-start; gap: .3rem; }\n.hero-ring { flex: none; text-align: center; }\n.ring-wrap { position: relative; width: 4.3rem; height: 4.3rem; }\n.ring { width: 100%; height: 100%; transform: rotate(-90deg); }\n.ring circle { fill: none; stroke-width: 10; stroke-linecap: round; }\n.ring-bg { stroke: #ffeed0; }\n.ring-fg { stroke: var(--accent); transition: stroke-dashoffset .5s cubic-bezier(.2,.8,.3,1); }\n.ring-fg.gold { stroke: #f2b705; }\n.ring-fg.full { stroke: var(--ok); }\n/* 进度数字和「完成」贴紧一点 */\n.ring-label {\n  position: absolute; inset: 0;\n  display: flex; flex-direction: column; align-items: center; justify-content: center;\n  font-size: .95rem; font-weight: 900; line-height: 1;\n}\n.ring-label small { font-size: .5rem; color: var(--ink-3); font-weight: 700; margin-top: .05rem; }\n.hero-ring .ring-caption { font-size: .62rem; color: var(--ink-2); margin-top: .05rem; line-height: 1.2; white-space: nowrap; }\n\n/* ------------------------------------------------------------ 心情 */\n\n.mood-row {\n  display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;\n  margin-top: .9rem; padding: .6rem .9rem;\n  background: var(--card); border-radius: var(--r-md); box-shadow: var(--shadow-sm);\n}\n.mood-label { font-size: .85rem; color: var(--ink-2); }\n.mood-btn {\n  font-size: 1.3rem; line-height: 1; padding: .25rem .4rem; border-radius: .6rem;\n  transition: transform .12s ease, background .15s ease;\n}\n.mood-btn:active { transform: scale(.85); }\n.mood-btn.on { background: #fff2d6; transform: scale(1.12); }\n/* 换行时把「读给我听」推到右边，不要孤零零留在最左边 */\n.mood-row .chip { margin-left: auto; }\n\n/* ------------------------------------------------------------ 面板 */\n\n.panel { margin-top: 1.1rem; }\n.panel-head {\n  display: flex; align-items: center; flex-wrap: wrap;\n  gap: .4rem .4rem; margin-bottom: .55rem; padding: 0 .2rem;\n}\n.panel-head h2 { font-size: 1.08rem; letter-spacing: .02em; }\n.panel-head .spacer { flex: 1; min-width: 0; }\n/* 窄屏上标题栏的按钮收一档，保证「标题 + 三个按钮」还能排一行 */\n@media (max-width: 26rem) {\n  .panel-head .btn.sm { padding: 0 .28rem; font-size: .74rem; }\n  .panel-head h2 { font-size: 1rem; }\n}\n/* 标题下面那段说明：前面空两个字，别跟图标左对齐；多行也一样缩进 */\n.hint-lead { padding-left: 2em; }\n/* 弹窗里跟着输入框左边对齐的说明（比如新建房间那句\"定了就不能改了\"）：\n   左边距 = .form-row 的 label 宽(3.6rem) + 间距(.5rem) */\n.hint-align { padding-left: 4.1rem; }\n.pill {\n  font-size: .72rem; font-weight: 700; color: var(--ink-2);\n  background: #fff; border-radius: 999px; padding: .15rem .55rem; box-shadow: var(--shadow-sm);\n}\n.pill.ok { color: #fff; background: var(--ok); }\n\n/* ---- 全站统一的按钮家族 ----------------------------------------\n   三档，长度和圆角一致，颜色只有四种语义色：\n     .btn       主要动作（可带 primary / ok / ghost / danger）\n     .chip      次要小动作，带文字的胶囊\n     .act-btn   只放一个符号的圆形小按钮（改 / 删 / 上下移）\n     .icon-btn  顶栏那种工具按钮\n   ---------------------------------------------------------------- */\n\n.chip {\n  flex: none; display: inline-flex; align-items: center; gap: .2rem;\n  padding: .34rem .7rem; border-radius: 999px; white-space: nowrap;\n  font-size: .8rem; font-weight: 600;\n  color: var(--ink-2); background: #fff;\n  border: .06rem solid var(--line); box-shadow: var(--shadow-sm);\n  transition: transform .12s ease, background .15s ease, border-color .15s ease, color .15s ease;\n}\n.chip:active { transform: scale(.94); background: #fff6e5; }\n.chip.info { color: var(--blue); border-color: #d6e4fa; background: #f7faff; }\n.chip.danger { color: var(--danger); border-color: #f7dad6; background: #fff8f7; }\n.chip.ok { color: #fff; background: var(--ok); border-color: var(--ok); box-shadow: 0 .18rem .5rem rgba(33, 181, 115, .28); }\n.chip.ok:active { background: #1aa066; }\n.chip.sm { padding: .14rem .5rem; font-size: .7rem; font-weight: 700; }\n.chip[disabled] { opacity: .32; box-shadow: none; }\n/* 选中的快捷选项（标签预设、长期/指定日期） */\n.chip.on {\n  color: #fff; background: var(--accent); border-color: var(--accent);\n  box-shadow: 0 .18rem .45rem rgba(240, 160, 40, .3);\n}\n.chip.on:active { background: #e09a2a; }\n\n/*\n * 「输入框 + 快捷选项」：默认选项折到输入框下面一行。\n * `.inline` 时**跟输入框并排**（第 66 轮 3：标签输入框和功课/生活/精神同一行）。\n */\n.chip-picks {\n  flex: 1 1 100%; display: flex; flex-wrap: wrap; gap: .35rem;\n  margin: 0 0 .2rem 4.1rem;\n}\n.chip-picks.inline {\n  flex: 0 0 auto; flex-wrap: nowrap;\n  margin: 0; gap: .3rem;\n}\n/* 并排时选项要收窄一点，否则一排挤不下（375px 上可用宽度只有 ~290px）；\n   省下来的宽度留给输入框，家长还要手打自定义标签 */\n.chip-picks.inline .chip {\n  padding: .3rem .4rem; font-size: .72rem; gap: .1rem;\n}\n\n/*\n * 每日任务的「截止」字段：长期 / 指定日期 / 日期框**三个排在同一行**\n * （第 66 轮 4）。它是 formModal 的 type:'node'，直接挂在 .form-row 下面。\n *\n * 第 67 轮 1：两个按钮**各自加宽现有的 1/2**。\n * 两边文字不一样长（2 字 / 4 字），所以用 min-width 各给各的，\n * 按 rem 给宽度，开了大字模式也会跟着一起放大。\n */\n/*\n * 第 81 轮：任务的「有效期」字段（原来的「截止」）。\n * 几排东西：模式 chip / 具体日期（或周几、节假日）/ 区间两个日期框。\n * 竖着排、每排自己换行 —— 塞成一行在 375px 上根本放不下。\n */\n.sched-field { flex: 1 1 0%; min-width: 0; display: flex; flex-direction: column; gap: .3rem; }\n.sched-body { display: flex; flex-direction: column; gap: .35rem; }\n.sched-body .chip-picks.inline { margin: 0; flex-wrap: wrap; }\n.sched-body .chip { padding: .3rem .45rem; font-size: .72rem; flex: none; }\n/* 指定日期：日期框做成一个小方块，选了就自动加进上面的 chip 里 */\n.sched-add { display: inline-flex; align-items: center; gap: .3rem; }\n.sched-date-add { flex: none; width: 6.4rem; padding: .34rem .3rem; font-size: .74rem; }\n/* 区间：两个日期框 + 中间的波浪线 */\n.sched-range { align-items: center; gap: .25rem; }\n.sched-range .field { flex: none; width: 6.4rem; padding: .34rem .3rem; font-size: .74rem; }\n.sched-dash { font-size: .78rem; color: var(--ink-3); }\n.sched-range .hint { flex: 0 0 auto; white-space: nowrap; }\n\n/*\n * 注意这里是 flex: 0 1 auto（**允许收缩**），不是 0 0 auto。\n * 踩过：写成不收缩时，.due-field 会按 max-content 撑开，\n * 里面的日期框就永远没有收缩的压力 —— 弹窗一出现滚动条（少了 ~11px）\n * 整行就横向溢出。允许收缩之后，地方不够会从日期框那里让。\n */\n.due-field { flex: 0 1 auto; min-width: 0; display: flex; flex-wrap: nowrap; align-items: center; gap: .2rem; }\n.due-field .chip { padding: .3rem .4rem; font-size: .72rem; flex: none; justify-content: center; }\n.due-field .chip[data-due=\"long\"] { min-width: 3.5rem; }\n.due-field .chip[data-due=\"date\"] { min-width: 5.7rem; }\n/*\n * 日期框按内容给宽度，并且**允许往下缩**：两个按钮的 min-width 是硬的\n * （要保证各加宽 1/2），地方不够时只能从日期框这里让 —— 不让就整行横向溢出。\n * 5.6rem（约 100px）是能放下 YYYY-MM-DD + 选择器图标的底线。\n */\n.due-field .due-date {\n  flex: 0 1 auto; width: 6rem; min-width: 5.6rem;\n  padding: .34rem .3rem; font-size: .74rem;\n}\n\n/*\n * 全站那一排小动作按钮（↑↓ 排序、停/启、✎ 修改、✕ 删除、☆ 存常用库、📋 复制…）。\n *\n * 圆角方框（不是正圆）：正圆放在方圆的卡片里显得跳，圆角方框和卡片的圆角是\n * 同一套语言；而且按钮里放 1~2 个汉字时（加 / 停 / 启）方框也比圆更好排。\n * 六个模块（作业 / 额外任务 / 每日任务 / 奖励 / 常用库）共用这一条规则。\n */\n.act-btn {\n  flex: none; width: 2.05rem; height: 2.05rem; border-radius: .55rem;\n  display: grid; place-items: center; line-height: 1;\n  font-size: .92rem; color: var(--ink-3); background: #fff;\n  border: .06rem solid var(--line); box-shadow: var(--shadow-sm);\n  transition: transform .12s ease, background .15s ease, border-color .15s ease, color .15s ease;\n}\n.act-btn:active { transform: scale(.88); background: #fff6e5; }\n.act-btn.info { color: var(--blue); border-color: #d6e4fa; background: #f7faff; }\n.act-btn.danger { color: var(--danger); border-color: #f7dad6; background: #fff8f7; }\n.act-btn.on { color: #fff; border-color: transparent; background: var(--ok); }\n.act-btn[disabled] { opacity: .28; box-shadow: none; }\n.act-btn[disabled]:active { transform: none; background: #fff; }\n\n/* ------------------------------------------------------------ 卡片 */\n\n.card-list { display: flex; flex-direction: column; gap: .6rem; }\n\n.card {\n  display: flex; align-items: center; gap: .8rem;\n  background: var(--card); border-radius: var(--r-md);\n  padding: .8rem .85rem; box-shadow: var(--shadow);\n  border: .12rem solid transparent;\n  transition: transform .15s ease, background .2s ease, border-color .2s ease;\n  position: relative; overflow: hidden;\n}\n.card:active { transform: scale(.985); }\n.card .card-emoji {\n  flex: none; width: 2.9rem; height: 2.9rem; border-radius: .9rem;\n  display: grid; place-items: center; font-size: 1.5rem; background: var(--card-2);\n}\n.card-body { flex: 1; min-width: 0; }\n/* 科目和标题同一行：科目是行内的彩色小标签，标题接着排、该换行就换行 */\n.card-title { font-size: 1.02rem; font-weight: 600; line-height: 1.45; word-break: break-word; }\n/* 标题和备注都允许换行：家长写多行时，原样的换行要保住（而不是挤成一行） */\n.card-title-text { white-space: pre-wrap; }\n.card-subject {\n  display: inline; margin-right: .38rem;\n  font-size: .8rem; font-weight: 800; letter-spacing: .04em;\n}\n/* 详细要求；没有的话这一行根本不渲染，卡片自己会矮一点 */\n.card-detail {\n  font-size: .82rem; color: var(--ink-2); line-height: 1.5;\n  word-break: break-word; white-space: pre-wrap;\n}\n.card-tags { display: flex; gap: .35rem; flex-wrap: wrap; align-items: center; margin-top: .35rem; }\n\n.card-actions { flex: none; display: flex; align-items: center; gap: .35rem; }\n.speak-btn, .focus-btn {\n  width: 2.2rem; height: 2.2rem; border-radius: 50%;\n  display: grid; place-items: center; font-size: .95rem;\n  transition: transform .12s ease, background .15s ease, box-shadow .15s ease;\n}\n.speak-btn { background: #fff6e5; }\n.focus-btn { background: #eef4ff; color: #3567c9; box-shadow: inset 0 0 0 .06rem #d6e4fa; }\n.focus-btn.on { background: #ffb03a; color: #fff; box-shadow: 0 .2rem .5rem rgba(255,159,28,.35); animation: pulse 1.4s infinite; }\n.speak-btn:active, .focus-btn:active { transform: scale(.9); }\n\n.check {\n  width: 2.4rem; height: 2.4rem; border-radius: 50%; flex: none;\n  border: .16rem solid #e6d8c2; background: #fff;\n  display: grid; place-items: center; font-size: 1.15rem; color: transparent;\n  transition: all .18s cubic-bezier(.2,.9,.3,1.4);\n}\n.check:active { transform: scale(.9); }\n/* 作业做完之后那个勾只是个状态标记，不能再点 */\n.check.static { cursor: default; }\n.check.static:active { transform: none; }\n\n.card.done { background: var(--ok-soft); border-color: #b9ebd2; }\n.card.done .card-title { color: #14724a; }\n.card.done .check { background: var(--ok); border-color: var(--ok); color: #fff; }\n.card.done .card-emoji { background: #d5f3e4; }\n\n.card.waiting { border-color: #ffe0a3; }\n.card.locked .check { opacity: .55; }\n\n@keyframes pop {\n  0% { transform: scale(1); }\n  45% { transform: scale(1.06); }\n  100% { transform: scale(1); }\n}\n.card.pop { animation: pop .38s ease; }\n\n/* 徽章 */\n.badge {\n  display: inline-flex; align-items: center; gap: .2rem;\n  font-size: .7rem; font-weight: 700; padding: .1rem .5rem; border-radius: 999px;\n}\n.badge.wait { background: var(--wait-soft); color: #a56b00; }\n.badge.ok { background: #d5f3e4; color: #14724a; }\n.badge.pts { background: #fff0d6; color: var(--accent-d); }\n.badge.soft { background: #f2ece1; color: var(--ink-2); }\n.badge.danger { background: #fdeceb; color: var(--danger); }\n\n/* ------------------------------------------------------------ 空状态 */\n\n.empty {\n  text-align: center; padding: 1.6rem 1rem; color: var(--ink-3);\n  background: var(--card); border-radius: var(--r-md); border: .1rem dashed var(--line);\n}\n.empty .empty-emoji { font-size: 2.2rem; display: block; margin-bottom: .3rem; }\n.empty p { font-size: .9rem; }\n\n/* ------------------------------------------------------------ 按钮 */\n\n.btn {\n  display: inline-flex; align-items: center; justify-content: center; gap: .4rem;\n  padding: .7rem 1.1rem; border-radius: 999px; font-weight: 700; font-size: .95rem;\n  background: #fff; box-shadow: var(--shadow-sm); transition: transform .12s ease;\n}\n.btn:active { transform: scale(.96); }\n.btn.primary { background: linear-gradient(180deg, #ffb03a, var(--accent)); color: #fff; box-shadow: 0 .3rem .8rem rgba(255,159,28,.35); }\n.btn.ok { background: linear-gradient(180deg, #35c98a, var(--ok)); color: #fff; box-shadow: 0 .3rem .8rem rgba(33,181,115,.3); }\n.btn.ghost { background: #fff; color: var(--ink-2); }\n.btn.danger { background: #fff; color: var(--danger); }\n.btn.block { width: 100%; }\n.btn.sm { padding: .42rem .8rem; font-size: .84rem; }\n.btn[disabled] { opacity: .45; box-shadow: none; }\n.btn-row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }\n.btn-row.right { justify-content: flex-end; flex-wrap: nowrap; }\n/*\n * 按钮行里也可以放一句说明：说明吃剩下的宽度（靠左），按钮留在右边。\n * flex-basis 必须是 0%：写 auto 的话基准宽度等于整句文字的自然宽度，\n * 配合 .btn-row 的 flex-wrap:wrap 会把按钮整个挤到第二行去\n * （跟图标选择器是同一个坑）。\n */\n.btn-row > .hint { flex: 1 1 0%; min-width: 0; margin: 0; }\n\n/* ------------------------------------------------------------ 小红花页 */\n\n.star-hero {\n  text-align: center; padding: 1.6rem 1rem;\n  background: linear-gradient(135deg, #fff7e0 0%, #ffeec6 100%);\n  border: .06rem solid #ffe2a8; border-radius: var(--r-lg); box-shadow: var(--shadow);\n}\n.star-count { font-size: 3.2rem; font-weight: 900; line-height: 1; color: var(--accent-d); }\n.star-count .star-ico { font-size: 2.2rem; vertical-align: .15rem; }\n.star-hero .star-label { color: var(--ink-2); font-size: .9rem; margin-top: .3rem; }\n.star-stats { display: flex; justify-content: center; gap: 1.6rem; margin-top: .9rem; font-size: .82rem; color: var(--ink-2); }\n.star-stats b { display: block; font-size: 1.1rem; color: var(--ink); }\n\n.reward-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: .6rem; }\n.reward {\n  background: var(--card); border-radius: var(--r-md); padding: .8rem .7rem;\n  box-shadow: var(--shadow); text-align: center; display: flex; flex-direction: column;\n  align-items: center; gap: .3rem; transition: transform .12s ease;\n}\n.reward:active { transform: scale(.97); }\n.reward .r-emoji { font-size: 2rem; }\n.reward .r-title { font-size: .9rem; font-weight: 600; }\n.reward .r-cost { font-size: .78rem; font-weight: 700; color: var(--accent-d); background: #fff5df; border-radius: 999px; padding: .1rem .55rem; }\n.reward[disabled] { opacity: .5; }\n\n.log-item {\n  display: flex; align-items: center; gap: .6rem; padding: .5rem .7rem;\n  background: var(--card); border-radius: var(--r-sm); font-size: .85rem;\n  box-shadow: var(--shadow-sm);\n}\n.log-item .log-time { color: var(--ink-3); font-size: .74rem; flex: none; }\n.log-item .log-reason { flex: 1; min-width: 0; }\n.log-item .log-delta { font-weight: 800; flex: none; }\n.log-delta.plus { color: var(--ok); }\n.log-delta.minus { color: var(--danger); }\n/* 0 分（只留评语）：用中性灰，别让人以为是加了分 */\n.log-delta.zero { color: var(--ink-3); font-weight: 700; }\n.log-why { font-size: .76rem; color: var(--ink-3); margin-top: .1rem; }\n\n/*\n * 小红花记录底下的翻页条（第 94 轮）。\n * 左「上一页」— 中间「第 X / Y 页 · 共 N 条」— 右「下一页」。\n * 窄屏（375px）上两个按钮各约 5.5rem，中间的信息还能放下；\n * 放不下时中间那行会自动换行，按钮不会被挤扁（flex:none）。\n */\n.pager {\n  display: flex; align-items: center; justify-content: space-between;\n  gap: .4rem; margin-top: .55rem; flex-wrap: wrap;\n}\n.pager .btn { flex: none; }\n.pager-info {\n  flex: 1 1 auto; text-align: center; min-width: 0;\n  font-size: .74rem; color: var(--ink-3); font-variant-numeric: tabular-nums;\n}\n/* 只有一页时没有按钮，只剩一行「共 N 条」——让它自己居中 */\n.pager:not(:has(.btn)) { justify-content: center; }\n\n/* ------------------------------------------------------------ 周统计 */\n\n.bars { display: flex; align-items: flex-end; gap: .35rem; height: 9rem; padding: .6rem .4rem 0; }\n.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: .25rem; height: 100%; }\n.bar-track { flex: 1; width: 100%; background: #f4ebdc; border-radius: .5rem; display: flex; align-items: flex-end; overflow: hidden; position: relative; }\n.bar-fill { width: 100%; background: linear-gradient(180deg, #ffc266, var(--accent)); border-radius: .5rem; transition: height .5s cubic-bezier(.2,.8,.3,1); min-height: .15rem; }\n.bar-fill.full { background: linear-gradient(180deg, #5ad9a0, var(--ok)); }\n.bar-col .bar-day { font-size: .7rem; color: var(--ink-2); }\n.bar-col.today .bar-day { color: var(--accent-d); font-weight: 800; }\n.bar-pct { font-size: .64rem; color: var(--ink-3); }\n\n.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(4.9rem, 1fr)); gap: .6rem; }\n.stat {\n  background: var(--card); border-radius: var(--r-md); padding: .8rem .6rem; text-align: center;\n  box-shadow: var(--shadow);\n}\n.stat .stat-num { font-size: 1.5rem; font-weight: 900; color: var(--accent-d); line-height: 1.1; }\n.stat .stat-name { font-size: .76rem; color: var(--ink-2); margin-top: .15rem; }\n\n.task-stat-row { display: flex; align-items: center; gap: .6rem; padding: .45rem .2rem; }\n.task-stat-row .ts-name { flex: 1; font-size: .9rem; }\n.task-stat-row .ts-bar { flex: none; width: 6rem; height: .5rem; background: #f2e8d8; border-radius: 999px; overflow: hidden; }\n.task-stat-row .ts-bar i { display: block; height: 100%; background: var(--ok); border-radius: 999px; }\n.task-stat-row .ts-num { flex: none; font-size: .78rem; color: var(--ink-2); width: 2.6rem; text-align: right; }\n\n/* ------------------------------------------------------------ 家长端 */\n\n.pin-gate { text-align: center; padding: 1.8rem 1rem; background: var(--card); border-radius: var(--r-lg); box-shadow: var(--shadow); }\n.pin-dots { display: flex; justify-content: center; gap: .6rem; margin: 1rem 0 1.2rem; }\n.pin-dots i { width: .8rem; height: .8rem; border-radius: 50%; background: #eee0c9; display: block; }\n.pin-dots i.on { background: var(--accent); }\n.keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: .55rem; max-width: 17rem; margin: 0 auto; }\n.keypad button {\n  padding: .85rem 0; font-size: 1.3rem; font-weight: 700;\n  background: #fff; border-radius: var(--r-md); box-shadow: var(--shadow-sm);\n  color: var(--ink);\n}\n.keypad button:active { transform: scale(.94); background: #fff6e5; }\n/* 清空 / 删除：功能键，比数字小一号、浅一点，一眼能和数字区分开 */\n.keypad button.fn {\n  font-size: .95rem; font-weight: 800; color: var(--ink-2);\n  background: var(--card-2); box-shadow: none;\n}\n.keypad button.fn:active { background: #f0e3cb; }\n\n/* 五个模块按钮一行排开，等宽等大 */\n.subtabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: .25rem; padding: .2rem 0 .6rem; }\n/* 没有「去确认」横幅时，和下面日期条之间留「横幅高度的一半」 */\n.subtabs.no-ask { padding-bottom: calc(var(--ask-h) / 2); }\n.subtab {\n  display: flex; align-items: center; justify-content: center; gap: .18rem;\n  /* 比原来高 1/4（.5rem → .625rem）；圆角比上一版再大一点点 */\n  padding: .625rem .1rem; border-radius: .8rem;\n  font-size: .82rem; font-weight: 700; white-space: nowrap; overflow: hidden;\n  background: #fff; color: var(--ink-2); box-shadow: var(--shadow-sm);\n  border: .06rem solid transparent;\n  transition: background .15s ease, color .15s ease, transform .12s ease;\n}\n.subtab .ico { font-size: .9rem; line-height: 1; }\n.subtab:active { transform: scale(.96); }\n.subtab.on { background: var(--ink); color: #fff; }\n\n/*\n * 「录入作业」那三个页签：贴在下面的白卡上，看着是卡片的一部分，\n * 不是顶部那种导航药丸。所以上面圆角、下面方角，没选中时是透明底。\n */\n.add-tabs {\n  grid-template-columns: repeat(3, 1fr);\n  gap: .2rem; padding: 0; margin-bottom: 0;\n}\n.add-tabs .subtab {\n  border-radius: .8rem .8rem 0 0;\n  /* 未选中的页签原来是透明底，跟页面底色几乎一样、看不出来是能点的。\n     给一个比页面深一点的米色，一眼能看出「这是个没选中的页签」 */\n  background: #f2e7d6; box-shadow: none;\n  border: .06rem solid var(--line); border-bottom: 0;\n  color: var(--ink-2); font-size: .78rem;\n}\n.add-tabs .subtab.on {\n  background: var(--card); color: var(--ink);\n  box-shadow: none;\n}\n/*\n * 紧贴在页签行下面的那张卡片：**上面两个角都必须是直角**，这样它才和页签连成一体\n * （页签的下边也是直角，两者对得上）。\n *\n * 原来是 `0 var(--r-md) var(--r-md) var(--r-md)` —— 四个值依次是\n * 左上 / 右上 / 右下 / 左下，只把**左上**写成了 0，右上还是圆的。\n * 于是同一个卡片左边直角、右边圆角，右边那处还和上面页签的圆角叠成两层弧线，\n * 看着就是\"少处理了一边\"。（踩过：家长截图圈出来说\"参考左边处理\"。）\n */\n.add-tabs + .form-card { border-radius: 0 0 var(--r-md) var(--r-md); }\n\n/*\n * 被家长撤销过时，孩子这边只显示**家长写的那句理由**。\n * 这里原先还有一行加粗的「爸爸妈妈让你再完善一下」，但下面那个徽章\n * （🔁 爸爸妈妈说要再完善一遍）已经把话说清楚了 —— 两处重复，删掉了。\n */\n.card-undo {\n  margin-top: .35rem; padding: .4rem .55rem; border-radius: .5rem;\n  background: #fff4e2; border-left: .18rem solid var(--accent);\n  font-size: .82rem; line-height: 1.5;\n}\n.card-undo span { color: var(--ink-2); white-space: pre-wrap; word-break: break-word; }\n/* 任务取消：整张卡片灰掉、不可点 */\n.card.cancelled { opacity: .62; background: #f7f3ec; }\n.card.cancelled .card-title-text { text-decoration: line-through; }\n\n/* ------------------------------------------------------------ 附件 */\n\n.att-box { display: flex; flex-direction: column; gap: .3rem; }\n/*\n * 附件一行放**两个**（第 6 条）。\n * minmax(0,1fr) 是关键：只写 1fr 的话，长文件名会把格子撑破、整行溢出屏幕。\n */\n.att-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .35rem; }\n.att-group { display: flex; flex-direction: column; gap: .2rem; }\n.att-label { font-size: .66rem; color: var(--ink-3); font-weight: 700; }\n/* 上传进度就写在这儿，不占用「加附件」按钮的字 */\n.att-tip { font-size: .68rem; color: var(--ink-3); }\n\n/* 一条附件：缩略图 + 文件名 + 大小。一格最多占一半行宽，所以内容要能收缩 */\n.att-chip {\n  display: flex; align-items: center; gap: .3rem;\n  min-width: 0; max-width: 100%; padding: .2rem .3rem .2rem .2rem;\n  background: #fff; border: .06rem solid var(--line);\n  border-radius: .5rem; box-shadow: var(--shadow-sm);\n}\n/* 孩子交上来的用淡绿区分，家长传的\"要求\"一眼能分清 */\n.att-chip.work { background: #f4fbf6; border-color: #cdeadb; }\n.att-open {\n  display: flex; align-items: center; gap: .3rem;\n  min-width: 0; flex: 1 1 auto; text-decoration: none; color: inherit;\n}\n.att-thumb {\n  width: 1.9rem; height: 1.9rem; border-radius: .35rem;\n  object-fit: cover; background: #f2e7d6; flex: none;\n}\n.att-icon {\n  width: 1.9rem; height: 1.9rem; border-radius: .35rem; flex: none;\n  display: grid; place-items: center; font-size: .95rem; background: #f6efe3;\n}\n/* 一格只有半行宽，文字要能缩、要能省略 */\n.att-name {\n  font-size: .72rem; color: var(--ink); min-width: 0;\n  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\n}\n.att-size { font-size: .62rem; color: var(--ink-3); white-space: nowrap; }\n/*\n * 一行两个的场合（作业行、弹窗里），格子只有半行宽：\n * 缩略图 + 大小 + 删除按钮一占，文件名就只剩几个像素，会被截成「卷.」这种。\n * **文件名比\"多少 KB\"有用**，所以这里把大小让掉。\n * 专注页那边是一行一个，地方够，大小照常显示。\n */\n.row-att .att-size,\n.form-row > .att-field .att-size { display: none; }\n.att-del {\n  flex: none; width: 1.3rem; height: 1.3rem; border-radius: .3rem;\n  display: grid; place-items: center; font-size: .68rem; line-height: 1;\n  color: var(--danger); background: #fff8f7;\n  border: .06rem solid #f7dad6; cursor: pointer;\n}\n.att-del:active { transform: scale(.9); }\n\n/* 「加附件」那个虚线按钮 */\n.att-add {\n  display: inline-flex; align-items: center; gap: .35rem;\n  align-self: flex-start; padding: .4rem .7rem;\n  font-size: .78rem; font-weight: 700; color: var(--ink-2);\n  background: #fffdf9; border: .1rem dashed var(--line);\n  border-radius: .55rem; cursor: pointer; white-space: nowrap;\n  /*\n   * 弹窗里给它剩下的地方可能不够放下整行「📎 加附件（图片 / 视频 / 文本）」——\n   * 不设上限的话它按内容撑出去，那一行会横向溢出（实测 11px）。\n   * 这里允许它按容器宽度收缩并折行，不许撑破。\n   */\n  max-width: 100%; white-space: normal;\n}\n.att-add:active { background: #fff6e5; }\n.att-hint { margin: .1rem 0 0; font-size: .7rem; }\n\n/* 三个入口（拍照 / 录像、录音、选文件）排一行，窄屏自动换行 */\n.att-add-row { display: flex; flex-wrap: wrap; gap: .35rem; align-self: flex-start; }\n\n/*\n * 弹窗里那一行附件（type:'node' 传进来的 .att-field）：\n * 让它和上面的输入框**同起同宽**。\n *\n * 两个坑：\n *   1) 选错元素没用 —— .att-box 是 .att-field **里面**那层，要选真正的 flex 子项\n *      （.att-field），否则规则根本不生效；\n *   2) basis 必须写 0%，写 auto 的话会按内容撑开，附件一多就换到下一行、\n *      跑到标签左边去了（家长原话：\"和上面的输入框没左对齐\"）。\n */\n.form-row > .att-field { flex: 1 1 0%; min-width: 0; }\n.form-row > .att-field .att-add { align-self: flex-start; }\n/*\n * 「标签」这种并排的字段：输入框吃掉剩下的宽度就行，别把选项挤掉。\n * 手机上宽度很紧，这里允许它缩到很小，实在不够时整行会换行（form-row 是 wrap）。\n */\n.form-row > .chip-picks.inline { margin-left: 0; }\n.form-row:has(.chip-picks.inline) > .field { flex: 1 1 3rem; min-width: 2.6rem; }\n\n.row-att { margin-top: .35rem; }     /* 作业行里的附件区 */\n.card-att { margin-top: .35rem; }    /* 孩子卡片里的 */\n/*\n * 专注页（第 8、9 条）：\n *   .focus-req  —— 爸爸妈妈传的要求，孩子点开就能复核\n *   .focus-work —— 孩子自己交的，**一行一个**（比两列更看得清传了啥）\n * 两块都**一行一个**、都不加小标题，贴在一起更好认。\n */\n.focus-req { width: 100%; margin: .1rem 0 .5rem; text-align: left; }\n.focus-req .att-box { align-items: stretch; }\n.focus-req .att-list { grid-template-columns: minmax(0, 1fr); }\n.focus-work { width: 100%; margin: .1rem 0 .6rem; text-align: left; }\n.focus-work .att-box { align-items: stretch; }\n.focus-work .att-list { grid-template-columns: minmax(0, 1fr); }\n/* 专注页里的上传按钮：**居中**（第 57 轮 6）。\n   只写 justify-content:center 是不够的 —— 基础规则里的 align-self:flex-start\n   会把它压成\"内容宽\"，居中就没有意义了，必须一起改掉。 */\n.focus-work .att-add-row, .focus-req .att-add-row { align-self: center; justify-content: center; }\n/* 专注页里的附件：文件名占满剩余空间，大小靠右（第 57 轮 7） */\n.focus-work .att-name, .focus-req .att-name { flex: 1 1 auto; max-width: none; }\n.focus-work .att-size, .focus-req .att-size { margin-left: auto; }\n\n/* 撤销理由弹窗里的两个快捷选项 */\n.undo-kinds { display: grid; grid-template-columns: 1fr 1fr; gap: .45rem; margin-bottom: .6rem; }\n.undo-pick {\n  display: flex; flex-direction: column; gap: .12rem;\n  padding: .5rem .6rem; border-radius: .55rem; cursor: pointer;\n  background: #fffdf9; border: .1rem solid var(--line);\n  transition: border-color .15s ease, background .15s ease;\n}\n.undo-pick input { position: absolute; opacity: 0; pointer-events: none; }\n.undo-pick b { font-size: .88rem; color: var(--ink); }\n.undo-pick small { font-size: .7rem; color: var(--ink-3); line-height: 1.35; }\n.undo-pick.on { border-color: var(--accent); background: #fff7ea; }\n.undo-pick.on b { color: var(--accent-d); }\n\n/* 刚加进来的那一条闪一下，让家长知道\"加到哪里去了\" */\n.row-item.just-added {\n  animation: justAdded 1.6s ease;\n  border-radius: .8rem;\n}\n@keyframes justAdded {\n  0% { background: #ffe9bd; box-shadow: 0 0 0 .18rem var(--accent); }\n  70% { background: #fff4dd; box-shadow: 0 0 0 .18rem rgba(255, 159, 28, .45); }\n  100% { background: var(--card); box-shadow: none; }\n}\n\n/*\n * 常用作业库的条目：右侧原来挤得慌 —— 行的圆角有 18px，\n * 三个按钮又紧贴着那个圆角，看着像没对齐。右边多留点空，按钮改成\n * 小圆角矩形（跟行的圆角是同一个语言，比正圆贴合）。\n */\n.common-item { border-radius: .8rem; padding-right: 1rem; }\n/* 按钮形状统一在 .act-btn 那边改成圆角方框了，这里不用再单独覆盖 */\n/* 窄屏放不下图标就只留文字，保证五个按钮还是一行 */\n@media (max-width: 21rem) {\n  .subtab .ico { display: none; }\n}\n\n/* 家长端的清单行：跟孩子端「今天的作业」卡片同一套排版\n   [图标块] 科目 + 标题 / 详细要求 / 徽章   +   右边的按钮 */\n.row-item {\n  display: flex; align-items: center; gap: .6rem;\n  padding: .65rem .65rem;\n  background: var(--card); border-radius: var(--r-md);\n  box-shadow: var(--shadow); margin-bottom: .55rem;\n}\n.row-item .ri-face {\n  flex: none; width: 2.3rem; height: 2.3rem; border-radius: .78rem;\n  display: grid; place-items: center; font-size: 1.2rem;\n  background: var(--card-2);\n}\n.row-item .ri-main { flex: 1; min-width: 0; }\n.row-item .ri-title { font-size: .92rem; font-weight: 600; line-height: 1.4; word-break: break-word; white-space: pre-wrap; }\n/* 科目跟标题同一行，带科目自己的颜色 */\n.row-item .ri-subj {\n  margin-right: .35rem; font-size: .78rem; font-weight: 800; letter-spacing: .04em;\n}\n/* 详细要求：单独一行，没有就不渲染 */\n.row-item .ri-note-line {\n  font-size: .82rem; color: var(--ink-2); line-height: 1.5; word-break: break-word; white-space: pre-wrap;\n}\n.row-item .ri-tags { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; margin-top: .3rem; }\n.row-item .ri-tags .badge { font-size: .62rem; padding: .05rem .4rem; }\n.row-item.done .ri-title { color: #14724a; }\n.row-item.done .ri-face { background: #d5f3e4; }\n.row-item.off .ri-title { color: var(--ink-3); }\n.row-item.off .ri-face { opacity: .55; }\n.row-item.ask { background: #fffaf0; border: .06rem solid #ffe0a3; }\n\n/* ---- 设置页的「房间」列表 ---- */\n/* 左边留出一个字的位置，和上面的「房间列表」小标题对齐 */\n.panel-head.indent-1 { padding-left: calc(.2rem + 1em); }\n\n.room-row {\n  display: flex; align-items: center; gap: .55rem;\n  padding: .55rem .65rem; margin-bottom: .4rem;\n  background: var(--card); border-radius: var(--r-md);\n  box-shadow: var(--shadow); border: .06rem solid transparent;\n}\n.room-row.on { background: #f1fbf5; border-color: #b9e8cf; }\n.room-row .rr-main { flex: 1; min-width: 0; }\n.room-row .rr-head { display: flex; align-items: center; gap: .4rem; }\n.room-row .rr-name {\n  flex: 1; min-width: 0;\n  display: flex; flex-wrap: wrap; align-items: center; gap: .35rem;\n  font-size: .9rem; font-weight: 700; line-height: 1.3; word-break: break-word;\n}\n/* 展开后的「其他房间」：左边一条竖线表示它们从属于当前房间 */\n.room-others { padding-left: .5rem; border-left: .12rem solid var(--line); }\n\n/* 正在使用那一行的中间区域：点了展开 / 收起其他房间 */\n.room-row .rr-main.rr-toggle { cursor: pointer; user-select: none; }\n.room-row .rr-text { min-width: 0; }\n.room-row .rr-caret {\n  font-style: normal; font-size: .72rem; color: var(--ink-3);\n  margin-left: .1rem;\n}\n\n/* 折叠时的「一摞」：和正在使用那张一样宽，压在它下面，\n   每张只露出下面 1/3（上层遮住下层 2/3），越往下越淡 */\n.room-stack {\n  --peek-h: 3rem;                                  /* 每张卡片多高 */\n  position: relative;\n  display: flex; flex-direction: column; gap: 0;\n  /* 抵消上一行的 margin-bottom，再往上收 2/3，把第一张塞到当前房间下面 */\n  margin-top: calc(-.4rem - var(--peek-h) * 2 / 3);\n}\n.room-row.on { position: relative; z-index: 6; }    /* 压住第一张 */\n.room-peek {\n  position: relative;\n  /* 内容贴着卡片底边放，这样露出来的那 1/3 里正好是文字 */\n  display: flex; align-items: flex-end; justify-content: center; gap: .5rem;\n  height: var(--peek-h); width: 100%;\n  padding: 0 .7rem .12rem;\n  background: var(--card); border: .06rem solid var(--line);\n  border-radius: var(--r-md); box-shadow: var(--shadow-sm);\n  color: var(--ink-2); font-size: .74rem; font-weight: 700; line-height: 1;\n  cursor: pointer; text-align: center;\n  transition: opacity .15s ease;\n}\n/* 只有「第二张往后」才往上叠 2/3 —— 第一张的上层是当前房间那张卡片，\n   已经由 .room-stack 的 margin-top 处理过了，再叠一次就会被完全盖住 */\n.room-peek + .room-peek { margin-top: calc(var(--peek-h) * -2 / 3); }\n/* 上面的盖住下面的：序号越小越靠上，z-index 越大 */\n.room-peek:nth-child(1) { z-index: 5; opacity: .78; }\n.room-peek:nth-child(2) { z-index: 4; opacity: .64; }\n.room-peek:nth-child(3) { z-index: 3; opacity: .5; }\n.room-peek:active { opacity: .95; }\n.room-peek .rp-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.room-peek code {\n  flex: none;\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: .72rem; letter-spacing: .06em; color: var(--ink-3);\n}\n.room-row .rr-sub {\n  display: flex; flex-wrap: wrap; align-items: center; gap: .4rem;\n  margin-top: .15rem; font-size: .68rem; color: var(--ink-3);\n}\n.room-row .rr-sub code {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: .72rem; font-weight: 700; letter-spacing: .06em;\n  color: var(--ink-2); background: var(--card-2);\n  padding: .05rem .32rem; border-radius: .35rem;\n}\n/* 右侧一排文字按钮：一套样式，靠颜色区分轻重 */\n.room-row .rr-tools {\n  flex: none; display: flex; align-items: center; gap: .22rem;\n}\n.room-act {\n  padding: .28rem .42rem; border-radius: 999px; cursor: pointer;\n  border: .06rem solid var(--line); background: #fff;\n  color: var(--ink-2); font-size: .68rem; font-weight: 700; white-space: nowrap;\n  transition: background .15s ease, color .15s ease, transform .12s ease;\n}\n.room-act:active { transform: scale(.96); }\n.room-act.on { background: var(--ok); border-color: var(--ok); color: #fff; }\n.room-act.danger { color: var(--danger); }\n.room-act[disabled] { opacity: .4; cursor: not-allowed; }\n.room-act[disabled]:active { transform: none; }\n\n/* 「额外的任务」那段说明文字：和下面的卡片拉开一点距离 */\n.extras-tip { margin-bottom: .75rem; }\n\n/* 今日评价的正文：保留家长写的换行 */\n.review-text { font-size: .95rem; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }\n/*\n * 小红花 + 输入框 + 说明 + 保存按钮，四个都挤在同一行（按钮靠右）。\n * 输入框固定一个够写两三位数的宽度，说明吃掉剩下的空间。\n */\n.review-points-row {\n  display: flex; align-items: center; gap: .45rem; margin-top: .5rem;\n  flex-wrap: nowrap;\n}\n.review-points-row > label { flex: none; font-size: .84rem; color: var(--ink-2); }\n.review-points-row > .field { flex: 0 0 4.6rem; width: 4.6rem; min-width: 0; }\n.review-points-row > .hint {\n  flex: 1 1 auto; min-width: 0; margin: 0; font-size: .68rem; line-height: 1.3;\n  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\n}\n.review-points-row > .btn { flex: none; }\n\n/*\n * 图标直接点选，没有输入框。放在「图标」两个字右边同一行，\n * 高度压到原来的一半左右，超出就上下滚。\n */\n.icon-only-picker {\n  display: flex; flex-wrap: wrap; gap: .22rem; align-content: flex-start;\n  /*\n   * flex-basis 必须写 0%：写 auto 的话「基准宽度」是 48 个图标的自然宽度，\n   * 长得超过一整行，配合 .form-row 的 flex-wrap:wrap 就会被整个挤到第二行去\n   * （看着像\"没和「图标」在同一行\"）。\n   */\n  flex: 1 1 0%; min-width: 0;\n  max-height: 5.2rem; overflow-y: auto; overflow-x: hidden;\n  padding: .2rem .25rem; border-radius: .5rem; background: #fffdf9;\n  border: .06rem solid var(--line);\n  -webkit-overflow-scrolling: touch;\n}\n.icon-only-picker .icon-pick { font-size: 1.05rem; padding: .22rem .34rem; }\n.form-row:has(.icon-only-picker) { align-items: flex-start; }\n.form-row:has(.icon-only-picker) > label { padding-top: .45rem; }\n\n/* 右上角的版本号：高度和前面的「字号」圆框一致 */\n.version-chip {\n  flex: none; height: 2.3rem; max-width: 8.5rem;\n  display: inline-flex; align-items: center;\n  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\n  padding: 0 .55rem; border-radius: 999px;\n  background: #fff; border: .06rem solid var(--line);\n  color: var(--ink-3); font-size: .64rem; font-weight: 700; letter-spacing: .01em;\n  font-variant-numeric: tabular-nums; cursor: pointer;\n  box-shadow: var(--shadow-sm); transition: transform .12s ease, background .15s ease;\n}\n.version-chip:active { transform: scale(.96); background: #fff6e5; }\n\n/*\n * 同步状态：做成一个**明显的状态标签**，不是按钮。\n * 上一版给了白底圆框 + 投影，跟旁边的圆按钮长得一模一样，\n * 家里人一直以为它可点。现在：没有底色、没有边框、没有投影、\n * 不可点（cursor:default）、不是 <button>，就一颗小圆点 + 两个字。\n * 高度仍和旁边的圆按钮一致，所以顶栏还是齐的。\n */\n.sync-chip {\n  display: inline-flex; align-items: center; gap: .3rem;\n  height: 2.3rem; padding: 0 .45rem;\n  font-size: .66rem; font-weight: 700; color: var(--ink-3);\n  background: none; border: 0; box-shadow: none;\n  cursor: default; user-select: none;\n}\n.sync-chip i {\n  width: .5rem; height: .5rem; border-radius: 50%; flex: none;\n  background: var(--ok); box-shadow: 0 0 0 .18rem rgba(33, 181, 115, .15);\n  transition: background .2s ease;\n}\n.sync-chip.off { color: var(--danger); }\n.sync-chip.off i { background: var(--danger); box-shadow: 0 0 0 .18rem rgba(226, 86, 74, .15); }\n.sync-chip.busy i { background: var(--wait); box-shadow: 0 0 0 .18rem rgba(240, 173, 78, .18); animation: pulse 1s infinite; }\n\n/*\n * 窄屏（手机）顶栏：一共五个东西（标题 / 同步 / 朗读 / 字号 / 版本号）。\n * 不收一收，右边这排就会把标题挤成**一字一行竖排**（真机上踩过，见 README）。\n * 收完之后三个控件**仍然等高**，顶栏还是齐的。\n *\n * ★ 这段必须放在 .icon-btn / .version-chip / .sync-chip 的**基础规则之后**。\n *   它们的基础规则在下面几百行处（第 777 / 796 行那一带），媒体查询同优先级下\n *   比的是先后，放前面会被整段盖掉 —— 我第一版放错了地方，测出来 icon-btn\n *   还是 41px、版本号还是 140px，媒体查询\"匹配了但没生效\"。\n */\n@media (max-width: 26rem) {\n  .topbar { padding-left: .7rem; padding-right: .7rem; gap: .35rem; }\n  .topbar-emoji { font-size: 1.2rem; }\n  .topbar-title strong { font-size: .9rem; }\n  .topbar-title small { font-size: .64rem; }\n  .sync-chip { height: 2rem; padding: 0 .2rem; }\n  .sync-chip em { display: none; }          /* 只留那颗小圆点，省 30 多像素 */\n  .icon-btn { width: 2rem; height: 2rem; font-size: .92rem; }\n  .version-chip { height: 2rem; max-width: 5.2rem; padding: 0 .38rem; font-size: .6rem; }\n}\n\n/* 更新内容弹窗 */\n.log-list { display: flex; flex-direction: column; gap: .8rem; max-height: 55vh; overflow-y: auto; }\n.log-entry { border-left: .16rem solid var(--line); padding-left: .6rem; }\n.log-entry.cur { border-left-color: var(--accent); }\n.log-entry b { display: block; font-size: .86rem; color: var(--ink); }\n.log-entry time { display: block; font-size: .7rem; color: var(--ink-3); margin-bottom: .25rem; }\n.log-entry ul { margin: 0; padding-left: 1.1rem; }\n.log-entry li { font-size: .84rem; color: var(--ink-2); line-height: 1.5; }\n\n/* 右边那一排动作按钮 */\n.ri-tools { flex: none; display: flex; align-items: center; gap: .22rem; }\n.ri-tools .act-btn { width: 1.6rem; height: 1.6rem; font-size: .76rem; }\n.ri-tools .act-btn.wide {\n  width: auto; min-width: 2.5rem; height: 2rem; padding: 0 .45rem;\n  border-radius: 999px; font-size: .76rem; font-weight: 700; white-space: nowrap;\n}\n.ri-tools .act-btn.on { color: #fff; background: var(--ok); border-color: var(--ok); box-shadow: none; }\n/* 时间和徽章排在同一行 */\n.ri-time { font-size: .64rem; color: var(--ink-3); font-variant-numeric: tabular-nums; white-space: nowrap; }\n\n/*\n * 窄屏上的行：作业行有 6 个按钮（↑↓☆📋✎✕），挤在一行会把标题压成两行。\n * 给标题一个最小宽度，装不下时**按钮整体换到第二行**、靠右。\n * 没有把按钮改小 —— 手机上这些是主要点击目标，不能为了排版牺牲手感。\n * （同样必须放在上面 .ri-tools 基础规则之后，否则被盖掉。）\n */\n@media (max-width: 26rem) {\n  .row-item { flex-wrap: wrap; row-gap: .35rem; }\n  .row-item .ri-main { min-width: 10.5rem; }\n  .row-item .ri-tools { margin-left: auto; }\n}\n\n.form-card { background: var(--card); border-radius: var(--r-md); padding: .9rem; box-shadow: var(--shadow); }\n.form-row { display: flex; gap: .5rem; align-items: center; margin-bottom: .55rem; flex-wrap: wrap; }\n.form-row:last-child { margin-bottom: 0; }\n.form-row label { font-size: .84rem; color: var(--ink-2); flex: none; min-width: 3.6rem; }\n/*\n * 设置页很多行是「标签 + 输入框 + 一句说明」。\n * 说明跟输入框放在**同一行**，输入框按内容给一个合适的宽度（能自适应收缩），\n * 说明吃掉剩下的空间，所以不会再出现输入框被压成一条缝的情况。\n */\n/*\n * 设置页很多行是「标签 + 输入框 + 一句说明」，三者要在**同一行**。\n * 说明吃掉剩下的空间；万一还是放不下，就地省略号，绝不换到第二行\n * （换行会让那一行突然变高、看着像错位）。\n */\n.form-row > .hint {\n  flex: 1 1 0%; min-width: 0; margin: 0; font-size: .72rem; line-height: 1.35;\n  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\n}\n/*\n * 设置页那几行：输入框（连同上下加减）宽度是原来（5.2rem）的 2 倍。\n * 注意要打**外层 .num-wrap**：里面那个 input 已经不是 flex 子项了，\n * 打在内层不管用（踩过：结果外层按 flex:1 被撑成一半宽）。\n * 家长密码是普通单行文本框（口令不需要上下加一），也按同样宽度。\n */\n.form-row.num-fixed > .num-wrap,\n.form-row.num-fixed > .field {\n  flex: 0 1 auto; width: 10.4rem; min-width: 4rem;\n}\n.form-row.num-fixed > .num-wrap > .field { width: 100%; }\n\n/*\n * 弹窗里的小红花 / 需要：宽度对齐「今日学习评价」那一个（窄窄的一条 + 上下加减），\n * 不要跟着整行铺满。设置页那几行不在 .modal 里，不受这条影响。\n */\n.modal .form-row > .num-wrap { flex: 0 0 5.6rem; }\n\n/*\n * 数字框的上下加减。\n *\n * 为什么不用 <input type=\"number\">：Chrome 在 number 框里会把 -1 **渲染**成「1-」\n * （负号跑到数字后面）。试过 7 种字体栈都一样，跟字体无关；DOM 里的 value 还是对的，\n * 所以读代码、读 value 都查不出来，只有截图才看得见。\n * 因此数字框统一用 type=text，然后自己配一对上下按钮。\n */\n.num-wrap { position: relative; display: flex; flex: 1 1 0%; min-width: 0; }\n.num-wrap > .field { flex: 1 1 auto; min-width: 0; padding-right: 2.1rem; }\n.num-steps {\n  position: absolute; right: .12rem; top: 50%; transform: translateY(-50%);\n  display: flex; flex-direction: column; width: 1.55rem;\n  border-radius: .35rem; overflow: hidden; background: #f4ecdd;\n}\n.num-step {\n  height: 1.05rem; line-height: 1; font-size: .58rem;\n  display: grid; place-items: center;\n  color: var(--ink-2); background: #f4ecdd; border: 0;\n  cursor: pointer; padding: 0; transition: background .12s ease;\n}\n.num-step + .num-step { border-top: .05rem solid rgba(0, 0, 0, .07); }\n.num-step:active { background: var(--accent); color: #fff; }\n/* 让「加减」跟着输入框一起变宽的行里，外层容器也要能伸展 */\n.form-row > .num-wrap { flex: 1 1 0%; }\n.review-points-row > .num-wrap { flex: 0 0 5.6rem; }\n.field {\n  /* width:100% 是给「不在 flex 行里」的输入框用的——\n     比如粘贴作业的 textarea，默认只有 cols=20 那么宽，会缩在卡片左边 */\n  flex: 1; width: 100%; min-width: 0; padding: .58rem .75rem; border-radius: var(--r-md);\n  font-size: .95rem; color: var(--ink);\n  border: .1rem solid var(--line); background: #fffdf9; outline: none;\n  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;\n}\n.field::placeholder { color: var(--ink-3); }\n.field:hover { border-color: #e6d5ba; }\n.field:focus {\n  border-color: var(--accent); background: #fff;\n  box-shadow: 0 0 0 .2rem rgba(255, 159, 28, .18);\n}\ntextarea.field { min-height: 8.5rem; resize: vertical; line-height: 1.6; }\nselect.field { appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--ink-3) 50%), linear-gradient(135deg, var(--ink-3) 50%, transparent 50%); background-position: calc(100% - 1.05rem) 52%, calc(100% - .7rem) 52%; background-size: .35rem .35rem, .35rem .35rem; background-repeat: no-repeat; padding-right: 2rem; }\n.field.sm { padding: .38rem .55rem; }\n/*\n * 数字框不再单独收窄（原来是固定 4.2rem，比旁边的「备注」窄一大截）。\n * 这里**故意什么也不写**：直接沿用上面 .field 的 flex/width，\n * 才能和「备注」那种 textarea 一样宽。\n * （踩过：写成 flex:1 1 auto + width:100% 会让基准变成整行宽，\n *   结果数字框比 textarea 宽出 70 多像素，反而更不齐。）\n */\n\n.hint { font-size: .78rem; color: var(--ink-3); line-height: 1.5; }\n.hint code { background: #f4ecdd; padding: .05rem .3rem; border-radius: .3rem; font-size: .9em; }\n\n/* 带勾选框的一行说明，窄屏要能换行，不能把页面撑宽。\n   注意要写得比 `.form-row label` 更具体，否则会被它的 flex:none 顶掉。 */\n.form-row .check-line {\n  flex: 1 1 11rem; min-width: 0;\n  display: flex; align-items: flex-start; gap: .45rem;\n  font-size: .84rem; color: var(--ink-2); line-height: 1.5; cursor: pointer;\n}\n.form-row .check-line input { flex: none; width: 1.2rem; height: 1.2rem; margin: .18rem 0 0; }\n.form-row .check-line span { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }\n\n/* 图标选择器：点一下就填进上面的输入框 */\n.icon-picker {\n  flex: 1 1 100%; display: grid; grid-template-columns: repeat(8, 1fr);\n  gap: .25rem; margin: .1rem 0 .3rem 4.1rem;\n  max-height: 9rem; overflow-y: auto;\n  padding: .35rem; border-radius: var(--r-md);\n  background: #fffaf0; border: .06rem solid var(--line);\n}\n.icon-pick {\n  aspect-ratio: 1; border-radius: .5rem; font-size: 1.02rem; line-height: 1;\n  display: grid; place-items: center;\n  transition: transform .12s ease, background .15s ease;\n}\n.icon-pick:active { transform: scale(.88); }\n.icon-pick.on { background: #fff2d6; box-shadow: inset 0 0 0 .1rem var(--accent); }\n@media (max-width: 24rem) {\n  .icon-picker { margin-left: 0; grid-template-columns: repeat(6, 1fr); }\n}\n\n.preview-item {\n  display: flex; align-items: center; gap: .5rem; padding: .5rem .55rem;\n  background: #fff; border-radius: var(--r-md); border: .1rem solid var(--line); margin-bottom: .45rem;\n  cursor: pointer; transition: background .15s ease, border-color .15s ease;\n}\n.preview-item:active { background: #fffaf0; border-color: #ffd88a; }\n.preview-item .pi-emoji { flex: none; font-size: 1.2rem; width: 1.6rem; text-align: center; }\n.preview-item .pi-title { flex: 1; min-width: 0; font-size: .9rem; }\n/* 备注在改的时候是多行文本框，识别结果里也要照样保住换行，别糊成一行 */\n.preview-item .pi-sub {\n  font-size: .74rem; color: var(--ink-3);\n  white-space: pre-wrap; word-break: break-word;\n}\n.preview-item .ri-tools .act-btn { width: 1.85rem; height: 1.85rem; font-size: .82rem; }\n\n/* 一周七天，点哪天就编哪天的；两边可以翻周 */\n.week-bar { display: flex; align-items: center; gap: var(--wk-gap); margin-bottom: .4rem; }\n.icon-btn.sm { width: var(--wk-arrow); height: var(--wk-arrow); font-size: 1.15rem; font-weight: 700; }\n.week-strip { flex: 1; display: grid; grid-template-columns: repeat(7, 1fr); gap: .2rem; min-width: 0; }\n.wk-cell {\n  display: flex; flex-direction: column; align-items: center; gap: .02rem;\n  padding: .4rem .02rem .42rem; border-radius: .8rem;\n  background: #fff; box-shadow: var(--shadow-sm); border: .1rem solid transparent;\n  position: relative; transition: background .15s ease, border-color .15s ease, transform .12s ease;\n}\n.wk-cell:active { transform: scale(.94); }\n.wk-cell em { font-style: normal; font-size: .6rem; font-weight: 600; color: var(--ink-3); }\n.wk-cell b { font-size: .9rem; font-weight: 800; line-height: 1.15; }\n.wk-cell.on { background: var(--accent); border-color: var(--accent-d); box-shadow: 0 .25rem .6rem rgba(255, 159, 28, .32); }\n.wk-cell.on em, .wk-cell.on b { color: #fff; }\n.wk-cell.today:not(.on) b { color: var(--accent-d); }\n.wk-dot {\n  position: absolute; bottom: .16rem; left: 50%; margin-left: -.11rem;\n  width: .22rem; height: .22rem; border-radius: 50%; background: var(--accent);\n}\n.wk-cell.on .wk-dot { background: #fff; }\n.week-hint { display: flex; align-items: center; gap: .5rem; margin-bottom: .8rem; }\n/* 空出翻周按钮的宽度，让文字和「周一」左对齐 */\n.week-hint .wk-text { flex: 1; min-width: 0; font-size: .82rem; font-weight: 600; color: var(--ink-2); }\n.week-hint { padding-left: calc(var(--wk-arrow) + var(--wk-gap)); }\n\n/* 「有 N 件事等你确认」——按钮一律靠右 */\n.ask-banner { display: flex; align-items: center; gap: .6rem; }\n.ask-banner .ask-text { flex: 1; min-width: 0; }\n\n.share-box {\n  background: #fffaf0; border: .1rem dashed #ffd88a; border-radius: var(--r-md);\n  padding: .8rem; font-size: .82rem; word-break: break-all; line-height: 1.5;\n}\n.share-box b { color: var(--accent-d); }\n\n/* ------------------------------------------------------------ 弹窗 */\n\n#modal-root:empty { display: none; }\n.modal-mask {\n  position: fixed; inset: 0; z-index: 80; background: rgba(61, 50, 38, .38);\n  backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center;\n  padding: 1.2rem; animation: fade .18s ease;\n}\n@keyframes fade { from { opacity: 0; } }\n.modal {\n  width: 100%; max-width: 36rem; max-height: 86vh; overflow: auto;\n  /*\n   * 第 86 轮：能滚，但**不显示滚动条**。\n   * 家长说右边那条滚动条看着碍眼、手机上还容易误触。滚轮 / 触摸 / 拖动照样能滚。\n   *\n   * 注意：既然滚动条不占宽度了，就**不要再留** scrollbar-gutter: stable ——\n   * 那会白白空出 ~11px（第 75 轮加它是因为\"滚动条吃掉宽度导致截止行横向溢出\"，\n   * 现在滚动条 0 宽，那个问题自然没了）。\n   */\n  scrollbar-width: none;              /* Firefox */\n  -ms-overflow-style: none;           /* 老 Edge */\n  background: var(--card); border-radius: var(--r-lg); padding: 1.2rem;\n  box-shadow: 0 1.2rem 2.6rem rgba(90, 65, 30, .28);\n  animation: rise .22s cubic-bezier(.2,.9,.3,1.2);\n}\n/* Chrome / Safari / Edge：那条 11px 的槽彻底隐掉（滚动功能不受影响） */\n.modal::-webkit-scrollbar { width: 0; height: 0; display: none; }\n@keyframes rise { from { transform: translateY(1.2rem) scale(.96); opacity: 0; } }\n.modal h3 { font-size: 1.15rem; margin-bottom: .7rem; }\n/* 确认框里的说明可能带换行（比如\"库里的…/这一条…\"），别让 HTML 折成一行。\n   注意 html 是塞进 .modal-body 里的，不是 .modal 的直接子元素 */\n.modal-body > p { white-space: pre-line; line-height: 1.6; }\n.modal .modal-body { font-size: .92rem; color: var(--ink-2); }\n.modal .modal-actions { display: flex; gap: .5rem; margin-top: 1.1rem; }\n.modal .modal-actions .btn { flex: 1; }\n\n/* ------------------------------------------------------------ 提示条 */\n\n.toast-root {\n  position: fixed; left: 50%; bottom: calc(5.4rem + var(--safe-b)); transform: translateX(-50%);\n  z-index: 90; display: flex; flex-direction: column; gap: .4rem; align-items: center;\n  pointer-events: none; width: max-content; max-width: 92vw;\n}\n.toast {\n  background: rgba(61, 50, 38, .92); color: #fff; font-size: .88rem; font-weight: 600;\n  padding: .55rem 1rem; border-radius: 999px; box-shadow: var(--shadow);\n  animation: toastIn .25s cubic-bezier(.2,.9,.3,1.3);\n}\n.toast.ok { background: rgba(20, 114, 74, .95); }\n.toast.err { background: rgba(178, 55, 45, .95); }\n.toast.warn { background: rgba(196, 132, 26, .95); }\n@keyframes toastIn { from { transform: translateY(.7rem); opacity: 0; } }\n\n/* ------------------------------------------------------------ 撒花 */\n\n.confetti { position: fixed; inset: 0; pointer-events: none; z-index: 200; overflow: hidden; }\n.confetti i {\n  position: absolute; width: .55rem; height: .8rem; border-radius: .12rem;\n  top: -1rem; left: var(--x);\n  background: var(--c);\n  animation: fall var(--dur) linear forwards;\n  animation-delay: var(--delay);\n}\n@keyframes fall {\n  0% { transform: translateY(0) rotate(0deg); opacity: 1; }\n  100% { transform: translateY(105vh) rotate(var(--rot)); opacity: .9; }\n}\n\n/* ------------------------------------------------------------ 底部导航 */\n\n.tabbar {\n  position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;\n  display: flex; align-items: stretch;\n  padding-bottom: var(--safe-b);\n  background: rgba(255, 253, 249, .94);\n  backdrop-filter: saturate(160%) blur(12px);\n  -webkit-backdrop-filter: saturate(160%) blur(12px);\n  border-top: .06rem solid var(--line);\n}\n.tab {\n  flex: 1; display: flex; flex-direction: column; align-items: center; gap: .05rem;\n  padding: .5rem 0 .55rem; color: var(--ink-3); transition: color .15s ease;\n}\n.tab span { font-size: 1.3rem; line-height: 1; filter: grayscale(1) opacity(.55); transition: filter .15s ease; }\n.tab em { font-style: normal; font-size: .7rem; font-weight: 700; }\n.tab.on { color: var(--accent-d); }\n.tab.on span { filter: none; }\n\n/* ------------------------------------------------------------ 专注时间 */\n\n/* 开始专注后盖住整页，屏幕上只剩倒计时和这一项作业 */\n.focus-mask {\n  position: fixed; inset: 0; z-index: 55;\n  display: flex; align-items: center; justify-content: center;\n  padding: 1.5rem 1.25rem calc(1.5rem + var(--safe-b));\n  background:\n    radial-gradient(circle at 50% 10%, #fff8e8 0%, rgba(255, 248, 232, 0) 58%),\n    linear-gradient(180deg, #fdf4e6 0%, #f7e5c8 100%);\n  animation: fade .3s ease;\n  overflow-y: auto;\n}\n.focus-card { width: 100%; max-width: 24rem; text-align: center; }\n.focus-round {\n  display: inline-block; font-size: .74rem; font-weight: 700; letter-spacing: .06em;\n  color: var(--accent-d); background: #fff3da;\n  border: .06rem solid #ffd88a; border-radius: 999px; padding: .18rem .75rem;\n}\n.focus-emoji { margin-top: .75rem; font-size: 3.2rem; line-height: 1.1; animation: float 3s ease-in-out infinite; }\n.focus-subject { margin-top: .2rem; font-size: .82rem; font-weight: 700; letter-spacing: .06em; }\n.focus-name { margin-top: .15rem; font-size: 1.28rem; font-weight: 800; line-height: 1.35; }\n/*\n * 专注页上的备注：**一律**是这张浅色卡片里的一条条文字。\n *\n * 单行的（「家长签字」）和多行的走同一套样式 —— 家长要求统一风格，\n * 不然同一个页面一会儿是居中一句话、一会儿是一张卡片，看着乱。\n *\n * 列表前面**不加小圆点**（家长要求去掉）：靠行距和卡片本身区分就够了。\n */\n.focus-note-list {\n  list-style: none; margin: .55rem auto 0; padding: .55rem .85rem;\n  max-width: 22rem; text-align: left;\n  background: #fffdf7; border: .06rem solid var(--line);\n  border-radius: .65rem;\n  display: flex; flex-direction: column; gap: .38rem;\n}\n.focus-note-list li {\n  font-size: .82rem; color: var(--ink-2); line-height: 1.55;\n  word-break: break-word;\n}\n\n.focus-clock-wrap { position: relative; width: 12.5rem; height: 12.5rem; margin: 1rem auto .2rem; }\n.focus-clock-ring { width: 100%; height: 100%; transform: rotate(-90deg); }\n.focus-clock-ring circle { fill: none; stroke-width: 12; stroke-linecap: round; }\n.focus-clock-bg { stroke: #f3e4c9; }\n.focus-clock-fg {\n  stroke: #ff9f1c;\n  /* dasharray 和 dashoffset 一起过渡，圆弧才是平滑地\"顺时针收口\" */\n  transition: stroke-dasharray .95s linear, stroke-dashoffset .95s linear;\n}\n.focus-clock-text {\n  position: absolute; inset: 0;\n  display: flex; flex-direction: column; align-items: center; justify-content: center;\n}\n.focus-clock-num {\n  font-size: 2.8rem; font-weight: 900; line-height: 1; letter-spacing: .01em;\n  font-variant-numeric: tabular-nums; color: var(--accent-d);\n}\n.focus-clock-cap { margin-top: .35rem; font-size: .72rem; color: var(--ink-3); letter-spacing: .12em; }\n.focus-tip { margin-top: .15rem; font-size: .88rem; color: var(--ink-2); }\n.focus-buttons { margin-top: 1.2rem; display: flex; flex-direction: column; gap: .55rem; }\n.focus-buttons .btn { padding: .85rem 1.1rem; font-size: 1.02rem; }\n\n/* 强制休息时盖住整页 */\n.rest-mask {\n  position: fixed; inset: 0; z-index: 60;\n  display: flex; align-items: center; justify-content: center;\n  padding: 1.5rem 1.25rem calc(1.5rem + var(--safe-b));\n  background:\n    radial-gradient(circle at 50% 12%, #f4fcf8 0%, rgba(244, 252, 248, 0) 60%),\n    linear-gradient(180deg, #e9f8f0 0%, #d2efe1 100%);\n  animation: fade .3s ease;\n  overflow-y: auto;\n}\n.rest-card { width: 100%; max-width: 22rem; text-align: center; }\n.rest-emoji { font-size: 4rem; line-height: 1; animation: float 3.2s ease-in-out infinite; }\n.rest-card h3 { margin-top: .5rem; font-size: 1.22rem; color: #12734b; letter-spacing: .04em; }\n.rest-time {\n  margin: .35rem 0 .2rem; font-size: 3.3rem; font-weight: 900; line-height: 1.1;\n  color: #12a06a; font-variant-numeric: tabular-nums;\n}\n/* 休息页的转圈：跟专注页同一套画法，换成绿色系 */\n.rest-clock-wrap { width: 11rem; height: 11rem; margin: .2rem auto .4rem; }\n.rest-ring-bg { stroke: #d7efe1; }\n.rest-ring-fg { stroke: #21b573; }\n.rest-clock-text .focus-clock-num { color: #12a06a; font-size: 2.5rem; }\n.rest-clock-text .focus-clock-cap { color: #4b8b72; }\n.rest-tip { min-height: 3.2rem; font-size: .95rem; color: #2c6b52; line-height: 1.6; }\n.rest-card .btn { width: 100%; margin-top: 1rem; padding: .85rem 1.1rem; font-size: 1.02rem; }\n\n/* ------------------------------------------------------------ 小屏适配 */\n\n/* 注意：媒体查询里的 rem 按 16px 算，跟页面根字号无关，\n   所以 26rem 其实是 416px 而不是 468px。这里统一用 30rem（480px）。 */\n@media (max-width: 30rem) {\n  .view { padding-left: .7rem; padding-right: .7rem; }\n  .hero { padding: .8rem; gap: .5rem; }\n  .hero-date { font-size: .86rem; }\n  .hero-right { gap: .2rem; }\n  .ring-wrap { width: 3.9rem; height: 3.9rem; }\n  .ring-label { font-size: .88rem; }\n  .ring-label small { font-size: .46rem; }\n  .hero-ring .ring-caption { font-size: .56rem; }\n  .star-count { font-size: 2.6rem; }\n  .card .card-emoji { width: 2.5rem; height: 2.5rem; font-size: 1.3rem; }\n}\n\n/* 小手机（iPhone SE / 8 这一档）：右侧再收一档 */\n@media (max-width: 23rem) {\n  .hero { padding: .7rem; gap: .4rem; }\n  .hero-date { font-size: .8rem; }\n  .hero-right { gap: .1rem; }\n  .ring-wrap { width: 3.3rem; height: 3.3rem; }\n  .ring-label { font-size: .78rem; }\n  .ring-label small { font-size: .4rem; }\n  .hero-ring .ring-caption { font-size: .5rem; }\n}\n\n/* 窄屏上家长端的清单行也收一档，保证「时间」能跟在状态标签同一行 */\n@media (max-width: 26rem) {\n  .row-item { gap: .5rem; padding: .6rem; }\n  .row-item .ri-face { width: 2.1rem; height: 2.1rem; font-size: 1.1rem; }\n  .row-item .ri-tags .badge { font-size: .58rem; padding: .04rem .34rem; }\n  .ri-time { font-size: .58rem; }\n  .ri-tools .act-btn.wide { min-width: 2.2rem; padding: 0 .34rem; font-size: .72rem; }\n}\n\n@media (max-width: 22rem) {\n  .row-item { gap: .4rem; padding: .55rem; }\n  .row-item .ri-face { width: 1.9rem; height: 1.9rem; font-size: 1rem; }\n  .row-item .ri-title { font-size: .88rem; }\n  .row-item .ri-tags .badge { font-size: .52rem; padding: .03rem .28rem; }\n  .ri-time { font-size: .52rem; }\n  .ri-tools .act-btn.wide { min-width: 1.95rem; padding: 0 .26rem; font-size: .66rem; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  * { animation-duration: .01ms !important; transition-duration: .01ms !important; }\n}\n","/app.js":"/*\n * 作业小站 · 前端\n * 四个页面：今天（孩子看）/ 小红花 / 这一周 / 家长\n */\n\nimport * as C from './core.js';\nimport {\n  esc, $, toast, chime, speak, confetti,\n  openModal, closeModal, confirmModal, formModal,\n} from './ui.js';\n\n/* 出错时留个记号，家长截图反馈时能对上（也方便自动化检查） */\nwindow.addEventListener('error', function (e) {\n  window.__hbError = (e.message || '未知错误') + ' @' + (e.filename || '') + ':' + (e.lineno || 0);\n});\nwindow.addEventListener('unhandledrejection', function (e) {\n  const r = e.reason;\n  window.__hbError = 'Promise 未处理：' + ((r && r.message) || r);\n});\n\n/* ============================================================ 全局状态 */\n\nconst S = {\n  mode: 'server',        // 'server' | 'local'\n  room: '',\n  state: null,\n  online: true,\n  view: 'today',\n  date: C.todayKey(),    // 家长端正在编辑的日期\n  renderedDay: '',       // 上一次渲染时\"今天\"是哪天，用来跨零点自动翻页\n  focus: null,           // 正在进行的一次专注（只存在本机，不上传）\n  parentUnlocked: false,\n  parentTab: 'hw',\n  addTab: 'paste',       // 录作业页的「粘贴识别 / 手动加一条」选项卡\n  changelog: null,       // public/changelog.json 的内容（版本号 + 更新历史）\n  preview: [],           // 钉钉文本识别结果\n  prevPercent: {},\n  bootMsg: '正在打开…',\n  bootActions: [],\n  // 服务器说能传多大的附件（0 = 这个部署方式不支持附件，比如 Upstash 模式）\n  maxUpload: 0,\n  attachmentsOn: false,\n  // 「手动加一条」里刚传上去、还没跟作业一起提交的附件\n  draftAttach: [],\n  // 「新增每日任务」里刚传上去、还没跟任务一起提交的附件\n  draftTaskAttach: [],\n  // 「服务器跑的还是旧代码」这个警告只弹一次，别每 8 秒烦人一次\n  staleCodeWarned: false,\n  // 小红花记录的当前页码（0 起）；翻页是纯前端状态，不写进存档（第 94 轮）\n  ledgerPage: 0,\n};\n\nconst LS_ROOM = 'hb_room';\nconst LS_STATE = 'hb_cache_';\nconst LS_PREFS = 'hb_prefs';\n\nlet prefs = { voice: true, big: true };\nlet queue = [];\nlet flushing = false;\nlet flushTimer = null;\n\n/* ============================================================ 小工具 */\n\nfunction store(key, value) {\n  try {\n    if (value === undefined) return localStorage.getItem(key);\n    localStorage.setItem(key, value);\n  } catch (e) { /* 隐私模式下忽略 */ }\n  return null;\n}\n\nfunction loadPrefs() {\n  try {\n    const raw = store(LS_PREFS);\n    if (raw) prefs = Object.assign(prefs, JSON.parse(raw));\n  } catch (e) { /* ignore */ }\n}\nfunction savePrefs() { store(LS_PREFS, JSON.stringify(prefs)); }\n\nfunction applyFontSize() {\n  document.documentElement.style.fontSize = prefs.big ? '18px' : '15.5px';\n  const btn = $('#btn-font');\n  if (btn) btn.textContent = prefs.big ? 'A+' : 'A';\n}\n\nfunction greeting() {\n  const h = new Date().getHours();\n  if (h < 5) return '夜深了';\n  if (h < 11) return '早上好';\n  if (h < 13) return '中午好';\n  if (h < 18) return '下午好';\n  return '晚上好';\n}\n\n/* ============================================================ 弹窗素材 */\n\n/* 给图标输入框准备的一批常用图标，家长点一下就换上 */\nconst COMMON_ICONS = [\n  '📚', '✏️', '📖', '🔢', '🔤', '🎨', '🎵', '🔬',\n  '🏃', '⚽', '🚴', '🏊', '🧘', '🤸', '🛴', '🏀',\n  '🧹', '🧺', '🍽️', '🛏️', '🧼', '🗑️', '👕', '🧦',\n  '🌙', '⏰', '🦷', '🚿', '🍎', '🥛', '👟', '🎒',\n  '⭐', '🌟', '✨', '🏆', '💛', '🎯',\n  '🍦', '🍫', '🍕', '🎮', '📺', '🎬', '🧸', '🎡', '🎁', '🎠',\n];\n\n/* ------------------------------------------------------------ 版本号 */\n\n/*\n * public/changelog.json 是 `node scripts/version-bump.mjs \"改了什么\"` 自动写的：\n * 版本号格式 v1.0.月日时分.四位随机码，内容一变就自动往后编一个。\n * 这里把它显示在右上角，点开能看到最近几次更新了什么。\n */\nfunction applyChangelog(log) {\n  S.changelog = log;\n  const btn = $('#btn-version');\n  if (!btn) return;\n  if (log && log.version) {\n    btn.textContent = log.version;\n    btn.hidden = false;\n  }\n}\n\nasync function loadChangelog() {\n  try {\n    const res = await fetch('./changelog.json', { cache: 'no-cache' });\n    if (!res.ok) return;\n    applyChangelog(await res.json());\n  } catch (e) { /* 没有这个文件就当没有版本号 */ }\n}\n\nfunction openChangelog() {\n  const log = S.changelog;\n  if (!log || !log.history || !log.history.length) {\n    toast('还没有更新记录', 'err');\n    return;\n  }\n  const box = document.createElement('div');\n  box.className = 'log-list';\n  log.history.forEach(function (h) {\n    const div = document.createElement('div');\n    div.className = 'log-entry' + (h.v === log.version ? ' cur' : '');\n    div.innerHTML = '<b>' + esc(h.v) + (h.v === log.version ? ' · 当前' : '') + '</b>' +\n      '<time>' + esc(h.at || '') + '</time>' +\n      '<ul>' + (h.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';\n    box.appendChild(div);\n  });\n  openModal({\n    title: '更新内容',\n    bodyNode: box,\n    actions: [{ label: '知道了', cls: 'primary', onClick: closeModal }],\n  });\n}\n\n/* ------------------------------------------------------------ 数字框的上下加减 */\n\n/*\n * 「给孩子留句话」输入框里的默认文本（placeholder）。\n * 高度（min-height:8rem）要能把这 4 行完整显示出来 —— screenshot.mjs 里有一条\n * 断言会把这段文字填进去、量 scrollHeight 和 clientHeight，装不下就报错。\n */\nconst NOTE_PLACEHOLDER = [\n  '做作业要时刻牢记【三到】：',\n  '1· 一心一意：用心记',\n  '2· 态度端正：坐姿端正、手眼笔姿势端正',\n  '3· 勤于开口：有疑问就问，问题要基于事实',\n].join('\\n');\n\n/*\n * 数字输入框统一用 type=\"text\"（见 style.css 里的说明：Chrome 的 type=number\n * 会把 -1 显示成「1-」），上下加减就自己画一对按钮。\n *\n *   numBox({ id, value, min, max, maxlength, title })\n *\n * 按钮走统一的委托：data-act=\"num-step\" + data-for=输入框 id + data-delta。\n */\nfunction numBox(o) {\n  const id = o.id || '';\n  const attrs = [\n    'class=\"field num\"',\n    'id=\"' + esc(id) + '\"',\n    'type=\"text\"',\n    'inputmode=\"numeric\"',\n    'value=\"' + esc(o.value == null ? '' : o.value) + '\"',\n  ];\n  if (o.min != null) attrs.push('data-min=\"' + o.min + '\"');\n  if (o.max != null) attrs.push('data-max=\"' + o.max + '\"');\n  if (o.maxlength) attrs.push('maxlength=\"' + o.maxlength + '\"');\n  if (o.title) attrs.push('title=\"' + esc(o.title) + '\"');\n  if (o.placeholder) attrs.push('placeholder=\"' + esc(o.placeholder) + '\"');\n  return '<span class=\"num-wrap\">' +\n    '<input ' + attrs.join(' ') + '>' +\n    '<span class=\"num-steps\">' +\n      '<button type=\"button\" class=\"num-step\" data-act=\"num-step\" data-for=\"' + esc(id) + '\"' +\n        ' data-delta=\"1\" title=\"加一\" tabindex=\"-1\">▲</button>' +\n      '<button type=\"button\" class=\"num-step\" data-act=\"num-step\" data-for=\"' + esc(id) + '\"' +\n        ' data-delta=\"-1\" title=\"减一\" tabindex=\"-1\">▼</button>' +\n    '</span>' +\n  '</span>';\n}\n\n/* ------------------------------------------------------- 新加的那一条滚过去闪一下 */\n\n/**\n * 在作业列表里找到刚加的那一条，滚到眼前并闪一下。\n *\n * 为什么需要：家长在「常用作业库」页签点「加进这一天」时，作业列表在屏幕外面，\n * 页面上看不出任何变化 —— 很容易以为没点到，然后再点一次（于是加了两条）。\n * 每次 render() 都会重建列表，所以用 setTimeout 等这一帧渲染完再找。\n */\nfunction flashNewest(kind, title) {\n  setTimeout(function () {\n    const rows = document.querySelectorAll('.row-item');\n    let target = null;\n    for (let i = rows.length - 1; i >= 0; i--) {\n      const t = rows[i].querySelector('.ri-title');\n      if (t && t.textContent.indexOf(title) >= 0) { target = rows[i]; break; }\n    }\n    if (!target) return;\n    /*\n     * 只高亮，**不滚动**。\n     *\n     * 原来这里还 scrollIntoView 把新行滚到眼前，但那会在家长刚点完的地方\n     * 把整页挪一下 —— 手指/鼠标紧接着点的那一下就会落到别的元素上，\n     * 表现成\"点了没反应\"。宁可让家长自己滚，也不要在他们手底下动页面。\n     * （列表标题上有条数「今天的作业（N）」，加成功了一眼能看出来。）\n     */\n    target.classList.add('just-added');\n    setTimeout(function () { target.classList.remove('just-added'); }, 1600);\n  }, 60);\n}\n\n/* ------------------------------------------------------- 撤销并说明理由 */\n\n/**\n * 家长撤销「孩子打了勾、还没确认」的那一项，并说明理由。\n *\n * 理由不只是给家长自己看的 —— 孩子那边会显示出来，而且决定这一项怎么处理：\n *   任务取消 → 这一项不用做了，孩子那边锁住，点不动\n *   再完善   → 孩子要重新做一遍\n * 所以两个快捷选项是\"选一种处理方式\"，下面那个输入框是补充说明。\n */\nfunction openUndoModal(kind, id, title) {\n  const box = document.createElement('div');\n\n  /*\n   * 两个理由是**可选的**（第 57 轮 4）：都不选就是\"直接撤回\"，\n   * 不带\"取消 / 再完善\"的定性 —— 孩子那边只是回到没打勾的状态。\n   * 所以默认不选中任何一个，再点一下已选的那个可以取消选择。\n   */\n  const kinds = C.UNDO_KINDS.map(function (k) {\n    return '<label class=\"undo-pick\">' +\n      '<input type=\"checkbox\" name=\"undo-kind\" value=\"' + k.key + '\">' +\n      '<b>' + k.label + '</b><small>' + k.hint + '</small>' +\n    '</label>';\n  }).join('');\n  box.innerHTML =\n    '<p class=\"hint\" style=\"margin:0 0 .6rem\">撤销「' + esc(title) + '」。' +\n      '<br>不选也行 —— 直接撤回，孩子那边就是回到没做的状态。</p>' +\n    '<div class=\"undo-kinds\">' + kinds + '</div>' +\n    '<textarea class=\"field\" id=\"undo-reason\" rows=\"3\" maxlength=\"200\" ' +\n      'placeholder=\"想交代一句就写在这儿（可留空），例如：这一课老师说不做了 / 生字重写一遍，写工整些\"></textarea>';\n\n  /*\n   * 用 checkbox 而非 radio：radio 点中之后没法再点掉，\"都不选\"就实现不了。\n   * 做成单选的手感 —— 选中一个就把另一个取消（家长不用先取消再选）。\n   */\n  const inputs = Array.prototype.slice.call(box.querySelectorAll('.undo-pick input'));\n  inputs.forEach(function (r) {\n    r.addEventListener('change', function () {\n      if (r.checked) {\n        inputs.forEach(function (o) { if (o !== r) o.checked = false; });\n      }\n      box.querySelectorAll('.undo-pick').forEach(function (l) {\n        l.classList.toggle('on', l.querySelector('input').checked);\n      });\n    });\n  });\n\n  openModal({\n    title: '撤销这一项',\n    bodyNode: box,\n    actions: [\n      { label: '先不撤', cls: 'ghost', onClick: closeModal },\n      {\n        label: '撤销', cls: 'primary', onClick: function () {\n          const picked = box.querySelector('input[name=\"undo-kind\"]:checked');\n          const reasonKind = picked ? picked.value : '';   // 空 = 直接撤回\n          const reason = (box.querySelector('#undo-reason').value || '').trim();\n          dispatch({ t: 'item.undo', date: S.date, kind: kind, id: id, reasonKind: reasonKind, reason: reason });\n          closeModal();\n          toast(reasonKind === 'cancel' ? '已撤销：任务取消，孩子不用做了'\n            : reasonKind === 'redo' ? '已撤销：让孩子再完善一遍'\n            : '已撤销', 'ok');\n        },\n      },\n    ],\n  });\n}\n\n/* ================================================================ 附件 */\n\n/* ---------------------------------------------------------- 图片压缩 */\n\n/*\n * 上传前把图片压小（第 75 轮 2）。\n *\n * 为什么只压图片：**浏览器里没有现成的视频/PDF 转码器**。\n *   · 视频：唯一能想到的办法是 MediaRecorder 重录，但它是**按真实时长**录的 ——\n *     2 分钟的视频要等 2 分钟，家长根本没法接受（而且音画同步还得自己接）。\n *   · PDF：要压里面的图片流得先解析 PDF，那是一个很重的库，和\"零依赖\"冲突；\n *     而且老师发的 PDF 一般已经是压过的。\n * 图片不一样：相机的照片动辄 3~5MB，缩到 1800px 再编码一次通常只剩几百 KB，\n * 手机上看着**没有区别**，这是回报最大的一块。\n */\n\n/** 把 canvas 转成 blob（toBlob 是回调式，包一层 Promise） */\nfunction canvasToBlob(canvas, type, quality) {\n  return new Promise(function (resolve) {\n    try { canvas.toBlob(function (b) { resolve(b); }, type, quality); }\n    catch { resolve(null); }\n  });\n}\n\n/**\n * 压一张图。压不动（解不了 / 压完反而更大 / 不是图片）就返回 null，调用方照原样传。\n *\n * 几个必须注意的点：\n *   · 用 createImageBitmap 的 imageOrientation:'from-image' —— 手机照片带 EXIF 旋转，\n *     不处理的话竖着拍的照片传上去会躺倒。\n *   · GIF / SVG 不碰：前者会把动图压成静态图，后者是矢量图，本来就小。\n *   · HEIC 大多数浏览器解不了（iOS 上 Safari 能解），解不了就原样传。\n */\nasync function compressImage(file, opts) {\n  const o = opts || {};\n  const maxDim = o.maxDim || 1800;\n  const quality = o.quality || 0.82;\n  const name = String(file.name || '');\n  const isPng = /\\.png$/i.test(name) || file.type === 'image/png';\n  // 动图 / 矢量图 / 本来就小的图，不折腾\n  if (/\\.gif$/i.test(name) || file.type === 'image/gif') return null;\n  if (/\\.svg$/i.test(name) || file.type === 'image/svg+xml') return null;\n  if (file.size < (o.minBytes || 200 * 1024)) return null;\n  if (!/^image\\//.test(file.type || '')) return null;\n\n  let bmp = null;\n  try {\n    if (typeof createImageBitmap === 'function') {\n      try {\n        bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });\n      } catch {\n        bmp = await createImageBitmap(file);      // 老浏览器不认这个选项\n      }\n    }\n    if (!bmp) return null;\n    const w0 = bmp.width, h0 = bmp.height;\n    if (!w0 || !h0) return null;\n    const scale = Math.min(1, maxDim / Math.max(w0, h0));\n    const w = Math.max(1, Math.round(w0 * scale));\n    const h = Math.max(1, Math.round(h0 * scale));\n    const canvas = document.createElement('canvas');\n    canvas.width = w;\n    canvas.height = h;\n    const ctx = canvas.getContext('2d');\n    if (!ctx) return null;\n    // 缩小的时候开高质量插值，字才不会糊\n    ctx.imageSmoothingEnabled = true;\n    ctx.imageSmoothingQuality = 'high';\n    ctx.drawImage(bmp, 0, 0, w, h);\n\n    /*\n     * WebP 一般比 JPEG 小 25%~35%，而且支持透明（PNG 截图转过去不会变黑底）；\n     * 浏览器不支持就退回 JPEG。\n     */\n    let blob = await canvasToBlob(canvas, 'image/webp', quality);\n    let type = 'image/webp';\n    if (!blob || blob.type !== 'image/webp') {\n      blob = await canvasToBlob(canvas, 'image/jpeg', quality);\n      type = 'image/jpeg';\n    }\n    if (!blob) return null;\n    // 压完反而更大（小图、已经很省的图）就作罢\n    if (blob.size >= file.size * 0.95) return null;\n\n    const ext = type === 'image/webp' ? 'webp' : 'jpg';\n    const base = name.replace(/\\.[^.]+$/, '') || '图片';\n    return {\n      blob: blob,\n      name: base + '.' + ext,\n      type: type,\n      from: file.size,\n      to: blob.size,\n      w0: w0, h0: h0, w: w, h: h,\n    };\n  } catch {\n    return null;\n  } finally {\n    if (bmp && bmp.close) { try { bmp.close(); } catch { /* 忽略 */ } }\n  }\n}\n\n/**\n * 把选中的文件传上去，返回服务端给的附件记录。\n *\n * 一个个串行传：手机上同时发几个大视频很容易被浏览器/路由器掐断，\n * 而且串行才能给出\"正在传第 2 个，共 3 个\"这种明确的进度。\n */\nasync function uploadFiles(files, onStep) {\n  const list = Array.prototype.slice.call(files || []);\n  const out = [];\n  const saved = { from: 0, to: 0, n: 0 };      // 这次一共省了多少\n  const compress = S.state && S.state.settings.compressImages !== false;\n  for (let i = 0; i < list.length; i++) {\n    let f = list[i];\n    if (onStep) onStep(i + 1, list.length, f);\n    const info = C.checkUpload(f.name, f.type);\n    if (!info.ok) { toast('「' + f.name + '」' + info.reason, 'err'); continue; }\n    if (S.maxUpload && f.size > S.maxUpload) {\n      toast('「' + f.name + '」太大了（' + C.humanSize(f.size) + '），最多 ' +\n        Math.round(S.maxUpload / 1024 / 1024) + 'MB', 'err');\n      continue;\n    }\n    // 图片先压再传；视频 / PDF / 文本原样传（浏览器里没法压，见 compressImage 的注释）\n    if (compress) {\n      if (onStep) onStep(i + 1, list.length, f, '正在压缩…');\n      const small = await compressImage(f);\n      if (small) {\n        saved.from += small.from;\n        saved.to += small.to;\n        saved.n++;\n        f = new File([small.blob], small.name, { type: small.type });\n      }\n    }\n    try {\n      /*\n       * 直接把 File 当 body 发 —— 服务端收的就是原始字节，\n       * 不用 FormData / multipart，两边都省事（见 server.js 顶部注释）。\n       */\n      const res = await fetch('/api/upload/' + encodeURIComponent(S.room) +\n        '?name=' + encodeURIComponent(f.name), { method: 'POST', body: f });\n      const j = await res.json().catch(function () { return null; });\n      if (!res.ok) { toast((j && j.error) || ('上传失败（' + res.status + '）'), 'err'); continue; }\n      out.push(j.file);\n    } catch (e) {\n      toast('「' + f.name + '」没传上去：' + (e && e.message ? e.message : '网络问题'), 'err');\n    }\n  }\n  if (saved.n) {\n    toast('已压缩 ' + saved.n + ' 张图：' + C.humanSize(saved.from) + ' → ' +\n      C.humanSize(saved.to) + '（省了 ' +\n      Math.round((1 - saved.to / saved.from) * 100) + '%）', 'ok', 6000);\n  }\n  return out;\n}\n\n/** 附件在列表里的一行（家长和孩子两边共用同一套外观） */\nfunction attachChip(a, opts) {\n  const o = opts || {};\n  const url = C.fileURL(S.room, a.id);\n  const del = o.removeAct\n    ? '<button class=\"att-del\" data-act=\"' + o.removeAct + '\" data-id=\"' + esc(a.id) + '\"' +\n      ' data-kind=\"' + esc(o.kind || '') + '\" data-itemid=\"' + esc(o.itemId || '') + '\"' +\n      ' data-scope=\"' + esc(o.scope || 'item') + '\" title=\"删掉\">✕</button>'\n    : '';\n  const thumb = a.kind === 'image'\n    ? '<img class=\"att-thumb\" src=\"' + url + '\" alt=\"\" loading=\"lazy\">'\n    : '<span class=\"att-icon\">' + C.fileIcon(a.kind) + '</span>';\n  return '<div class=\"att-chip' + (o.cls ? ' ' + o.cls : '') + '\">' +\n    '<a class=\"att-open\" href=\"' + url + '\" target=\"_blank\" rel=\"noopener\" title=\"打开看看\">' +\n      thumb +\n      '<span class=\"att-name\">' + esc(a.name) + '</span>' +\n      '<span class=\"att-size\">' + C.humanSize(a.size) + '</span>' +\n    '</a>' + del +\n  '</div>';\n}\n\n/**\n * 附件区（可以带上传按钮）；没有附件又不上传就返回空串，不占地方。\n *\n * opts.addFirst  = true → 上传按钮放**最上面**，已传的排在下面\n *                （专注页里要这样：孩子先看到\"上传\"，传完的东西在按钮下面一个个列出来）\n * opts.sources   = true → 给三个入口：拍照 / 录像、录音、选文件\n *                （手机上 `capture` 会直接调起相机 / 录音机，比让家长在文件管理器里翻半天强）\n */\nfunction attachBox(list, opts) {\n  const o = opts || {};\n  const items = C.normalizeAttachments(list);\n  const canAdd = o.canAdd !== false && S.attachmentsOn;\n  if (!items.length && !canAdd) return '';\n\n  const key = esc(o.key || '');\n  const fileInput = function (attr, label) {\n    return '<label class=\"att-add\">' +\n      '<input type=\"file\" multiple ' + attr + ' data-att-input=\"' + key + '\" hidden>' +\n      label + '</label>';\n  };\n  let addHTML = '';\n  if (canAdd) {\n    addHTML = o.sources\n      ? '<div class=\"att-add-row\">' +\n          // capture 让手机直接开相机；桌面上浏览器会忽略它，退化成普通选文件\n          fileInput('accept=\"image/*,video/*\" capture=\"environment\"', '📷 拍照 / 录像') +\n          fileInput('accept=\"audio/*\"', '🎤 录音') +\n          fileInput('accept=\"' + C.UPLOAD_ACCEPT + '\"', '📎 选文件') +\n        '</div>'\n      : fileInput('accept=\"' + C.UPLOAD_ACCEPT + '\"',\n          o.addLabel || '📎 加附件（图片 / 视频 / 文本）');\n  }\n\n  const listHTML = items.length\n    ? '<div class=\"att-list\">' + items.map(function (a) { return attachChip(a, o); }).join('') + '</div>'\n    : '';\n  const hintHTML = (canAdd && !items.length && o.hint)\n    ? '<p class=\"hint att-hint\">' + esc(o.hint) + '</p>' : '';\n  return '<div class=\"att-box\" data-att-for=\"' + key + '\">' +\n    (o.addFirst ? addHTML + listHTML : listHTML + addHTML) +\n    hintHTML +\n  '</div>';\n}\n\n/** 附件区里\"打开看看\"以外的点击：上传按钮和删掉，都走这里 */\nfunction bindAttachBoxes(root) {\n  root.querySelectorAll('[data-att-input]').forEach(function (inp) {\n    /*\n     * 打了标记就别再绑一次。\n     * #view 每次渲染都是新元素，但弹窗挂在 #modal-root 上、不会重建；\n     * 不防重的话每渲染一次就多一个监听，选一个文件会被上传好几遍。\n     */\n    if (inp.dataset.attBound === '1') return;\n    inp.dataset.attBound = '1';\n    inp.addEventListener('change', async function () {\n      const key = inp.dataset.attInput;\n      const files = inp.files;\n      if (!files || !files.length) return;\n      inp.disabled = true;\n      /*\n       * 上传中的提示挂在**这个 input 所在的那一块**上：\n       * 一行可能有两个附件位，用 label.textContent 会把「加附件」按钮的字也擦掉。\n       */\n      const box = inp.closest('.att-box') || inp.closest('.att-add');\n      let tip = box ? box.querySelector('.att-tip') : null;\n      if (box && !tip) {\n        tip = document.createElement('span');\n        tip.className = 'att-tip';\n        box.appendChild(tip);\n      }\n      const say = function (t) { if (tip) tip.textContent = t; };\n      const got = await uploadFiles(files, function (i, n, f, phase) {\n        // phase 有值时是\"正在压缩…\"这种阶段提示，没有就是正常上传\n        say(phase ? '⏳ ' + phase + ' ' + f.name : '⏳ ' + i + '/' + n + '：' + f.name);\n      });\n      say('');\n      if (tip) tip.remove();\n      inp.disabled = false;\n      inp.value = '';\n      if (got.length && typeof pendingAttach[key] === 'function') {\n        pendingAttach[key](got);       // 交给调用方决定是\"先存起来\"还是\"立刻发 op\"\n      }\n    });\n  });\n}\n\n/** key → 收到刚上传完的附件时怎么办（注册在需要的地方） */\nconst pendingAttach = {};\n\n/**\n * 问服务器能传多大的附件。\n * 拿不到就按\"不支持\"处理：宁可少一个按钮，也不要让家长传完才发现存不下。\n */\nasync function loadUploadLimits() {\n  try {\n    const res = await fetch('/api/health', { cache: 'no-store' });\n    const j = await res.json();\n    S.maxUpload = Number(j.maxUploadMB || 0) * 1024 * 1024;\n    S.attachmentsOn = j.attachments === true && S.maxUpload > 0;\n  } catch (e) {\n    S.maxUpload = 0;\n    S.attachmentsOn = false;\n  }\n}\n\n/**\n * 只把某一处附件区换掉，**千万别整个 render()**。\n *\n * 踩过的坑：家长先填好科目 / 标题 / 备注，再点「加附件」——\n * 传完如果 render()，整块 innerHTML 会被重建，刚填的字全没了。\n * 所以这里按 `data-att-for` 找到那一块，原地替换，其它 DOM 一个都不动。\n */\nfunction refreshAttachBox(key, build) {\n  const old = document.querySelector('.att-box[data-att-for=\"' + key + '\"]');\n  if (!old) return false;\n  const tmp = document.createElement('div');\n  tmp.innerHTML = build();\n  const node = tmp.firstElementChild;\n  if (!node) return false;\n  old.replaceWith(node);\n  bindAttachBoxes(document);\n  return true;\n}\n\n/** 「手动加一条」里那一块附件区的 HTML（页面渲染和数据变化后刷新都用这一个） */\nfunction draftAttachHTML() {\n  return attachBox(S.draftAttach, {\n    key: 'hw-add', addLabel: '📎 加附件（图片 / 视频 / 文本）',\n    removeAct: 'draft-att-del',\n  });\n}\n\n/*\n * 「手动加一条」里刚传上来的附件：先攒着，点「添加到这一天」时才跟着作业一起存。\n * 这样家长可以一次选好几个、传完还能检查一遍，不会传了就撤不掉。\n */\npendingAttach['hw-add'] = function (got) {\n  S.draftAttach = C.normalizeAttachments(S.draftAttach.concat(got));\n  refreshAttachBox('hw-add', draftAttachHTML);\n  toast('加了 ' + got.length + ' 个附件', 'ok');\n};\n\n/*\n * 孩子交作业时传的附件：**传完立刻就存**，不等\"我做完了\"。\n * 孩子传完视频随手按返回也不会丢；家长在「待确认」那边马上就能看到。\n */\npendingAttach['focus-work'] = function (got) {\n  const f = S.focus;\n  if (!f) return;\n  got.forEach(function (file) {\n    dispatch({ t: 'attach.add', date: C.todayKey(), kind: f.kind, id: f.id, scope: 'work', file: file });\n  });\n  // 本地先把界面更新掉，不用等服务器回包\n  f.works = C.normalizeAttachments((f.works || []).concat(got));\n  chime(true);\n  toast('交上去了 ' + got.length + ' 个，爸爸妈妈能看到', 'ok');\n  updateFocusUI();\n};\n\n/** 传错了可以删掉重来（孩子这边自己删自己刚交的） */\n/* ============================================================ 与服务器通信 */\n\nasync function api(path, opts) {\n  const res = await fetch(path, opts);\n  let data = null;\n  try { data = await res.json(); } catch (e) { data = null; }\n  if (!res.ok) {\n    const err = new Error((data && data.error) || ('HTTP ' + res.status));\n    err.status = res.status;\n    // 服务器报\"不认识这个操作\"= 它还在跑旧代码，这个标记用来给家长一句人话提示\n    err.staleServer = Boolean(data && data.staleServer);\n    err.unknown = data && data.unknown;\n    throw err;\n  }\n  return data;\n}\n\nfunction saveCache() {\n  try { store(LS_STATE + S.room, JSON.stringify(S.state)); } catch (e) { /* ignore */ }\n}\nfunction loadCache(room) {\n  try {\n    const raw = store(LS_STATE + room);\n    return raw ? C.normalizeState(JSON.parse(raw)) : null;\n  } catch (e) { return null; }\n}\n\n/**\n * 顶栏的同步状态。\n *\n * 它是个**状态标签**，不是按钮 —— 所以没有底色、没有边框、没有投影，\n * 也不是 <button>，点了不会有任何反应（上一版做成了圆按钮的样子，被误认成按钮）。\n * 只留一颗小圆点 + 两个字，高度和旁边两个圆按钮一致，所以顶栏还是齐的。\n */\nfunction setSync(status) {\n  const dot = $('#sync-dot');\n  if (!dot) return;\n  const txt = $('#sync-text');\n  dot.className = 'sync-chip' + (status === 'off' ? ' off' : status === 'busy' ? ' busy' : '');\n  if (txt) txt.textContent = status === 'off' ? '离线' : (status === 'busy' ? '同步中' : '已同步');\n  dot.title = status === 'off' ? '连不上服务器，正在用本机数据'\n    : (status === 'busy' ? '正在同步…' : '已同步');\n}\n\n/* ======================================================== 房间管理 */\n\n/*\n * 两种列表：\n *   knownRooms() —— 这台设备进过的房间，存在本机，断网也能切换\n *   S.roomList   —— 服务器上所有房间，要「房间管理口令」才给看\n * 口令不会泄露出去，因为只有家长在设置里主动填才会请求。\n */\n\nconst LS_ROOMS = 'hb_rooms';\nconst LS_ADMIN = 'hb_admin_key';\n\nfunction knownRooms() {\n  try {\n    const arr = JSON.parse(store(LS_ROOMS) || '[]');\n    return Array.isArray(arr)\n      ? arr.filter(function (r) { return r && C.isValidRoom(r.code); })\n      : [];\n  } catch (e) { return []; }\n}\n\n/** 进过一个房间就记一笔，下回不用重新输房间码 */\nfunction rememberRoom(code, name) {\n  if (!C.isValidRoom(code)) return;\n  const up = String(code).toUpperCase();\n  const all = knownRooms();\n  const prev = all.filter(function (r) { return r.code === up; })[0];\n  const list = all.filter(function (r) { return r.code !== up; });\n  list.unshift({ code: up, name: String(name || (prev && prev.name) || ''), ts: Date.now() });\n  store(LS_ROOMS, JSON.stringify(list.slice(0, 40)));\n}\n\nfunction adminKey() { return String(store(LS_ADMIN) || ''); }\n\n/** 换房间就是换 URL 上的 room 参数，整页重载最干净 */\nfunction switchRoom(code) {\n  const up = String(code || '').toUpperCase();\n  if (!C.isValidRoom(up)) { toast('房间码不对', 'warn'); return; }\n  rememberRoom(up, '');\n  const url = new URL(location.href);\n  url.searchParams.set('room', up);\n  url.hash = '';\n  location.href = url.toString();\n}\n\n/** 拉一次房间列表（接口是开放的，不需要口令） */\nasync function loadRoomList() {\n  S.roomListLoading = true;\n  S.roomListErr = '';\n  render();\n  try {\n    const j = await api('/api/rooms');\n    S.roomList = Array.isArray(j && j.rooms) ? j.rooms : [];\n    S.roomsNeedKey = Boolean(j && j.needsKeyToDelete);\n    S.roomListErr = '';\n  } catch (e) {\n    S.roomList = null;\n    S.roomListErr = (e && e.message) || '连不上服务器';\n  }\n  S.roomListLoading = false;\n  render();\n}\n\n/**\n * 进「房间」时拉一次：口令状态 + 房间列表。\n * 列表是开放的（一台服务器就是一个家庭），口令只管删除。\n */\nasync function loadAdminState() {\n  let admin = null;\n  let rooms = null;\n  try {\n    const res = await Promise.all([\n      api('/api/admin/state').catch(function () { return null; }),\n      api('/api/rooms').catch(function () { return null; }),\n    ]);\n    admin = res[0];\n    rooms = res[1];\n  } catch (e) { /* 下面统一处理 */ }\n\n  S.adminState = admin\n    ? {\n      configured: Boolean(admin.configured),\n      source: admin.source || '',\n      canSetup: admin.canSetup !== false,\n      minLength: admin.minLength || 6,\n      online: true,\n    }\n    : { configured: false, source: '', canSetup: true, minLength: 6, online: false };\n\n  if (rooms) {\n    S.roomList = Array.isArray(rooms.rooms) ? rooms.rooms : [];\n    S.roomsNeedKey = Boolean(rooms.needsKeyToDelete);\n    S.roomListErr = '';\n  } else {\n    S.roomList = null;\n    S.roomListErr = '连不上服务器';\n  }\n  S.adminLoading = false;\n  render();\n}\n\n/** 房间管理口令：只管删除，可有可无 */\nfunction openAdminKeyModal() {\n  const admin = S.adminState || {};\n  const box = document.createElement('div');\n\n  function row(html) {\n    const d = document.createElement('div');\n    d.className = 'form-row';\n    d.innerHTML = html;\n    return d;\n  }\n\n  if (admin.source === 'env') {\n    const p = document.createElement('p');\n    p.className = 'hint';\n    p.innerHTML = '这台部署的口令来自环境变量 <code>HB_ADMIN_KEY</code>，' +\n      '要改得去改部署配置。它只用来确认删除房间，平时用不到。';\n    box.appendChild(p);\n    openModal({ title: '房间管理口令', bodyNode: box, actions: [{ label: '知道了', cls: 'primary', onClick: closeModal }] });\n    return;\n  }\n\n  const tip = document.createElement('p');\n  tip.className = 'hint';\n  tip.style.margin = '0 0 .6rem';\n  tip.innerHTML = '口令<b>只用在删除房间时确认一下</b>，平时浏览、切换、改名都不用。' +\n    '服务器上只存 <b>scrypt 哈希</b>（data/_admin.json），没有明文。';\n  box.appendChild(tip);\n\n  let oldRow = null;\n  let n1Row = null;\n  let n2Row = null;\n  const min = admin.minLength || 6;\n\n  if (admin.configured) {\n    oldRow = row('<label>当前口令</label><input class=\"field\" id=\"ak-old\" type=\"password\" autocomplete=\"current-password\">');\n    box.appendChild(oldRow);\n  }\n  n1Row = row('<label>新口令</label><input class=\"field\" id=\"ak-new\" type=\"password\" ' +\n    'autocomplete=\"new-password\" placeholder=\"至少 ' + min + ' 位\">');\n  n2Row = row('<label>再输一遍</label><input class=\"field\" id=\"ak-again\" type=\"password\" autocomplete=\"new-password\">');\n  box.appendChild(n1Row);\n  box.appendChild(n2Row);\n\n  const actions = [{ label: '取消', cls: 'ghost', onClick: closeModal }];\n  if (admin.configured) {\n    actions.push({\n      label: '取消口令',\n      cls: 'danger',\n      onClick: async function () {\n        const k = oldRow.querySelector('#ak-old').value.trim();\n        if (!k) { toast('先填当前口令', 'warn'); return; }\n        try {\n          await api('/api/admin/clear', {\n            method: 'POST', headers: { 'Content-Type': 'application/json' },\n            body: JSON.stringify({ key: k }),\n          });\n          store(LS_ADMIN, '');\n          closeModal();\n          toast('已取消口令，删房间改为只核对房间码');\n          loadAdminState();\n        } catch (e) { toast((e && e.message) || '取消失败', 'warn'); }\n      },\n    });\n  }\n  actions.push({\n    label: admin.configured ? '改口令' : '保存口令',\n    cls: 'primary',\n    onClick: async function () {\n      const n1 = n1Row.querySelector('#ak-new').value.trim();\n      const n2 = n2Row.querySelector('#ak-again').value.trim();\n      if (n1.length < min) { toast('口令至少 ' + min + ' 位', 'warn'); return; }\n      if (n1 !== n2) { toast('两次输入不一样', 'warn'); return; }\n      try {\n        if (admin.configured) {\n          await api('/api/admin/change', {\n            method: 'POST', headers: { 'Content-Type': 'application/json' },\n            body: JSON.stringify({ key: oldRow.querySelector('#ak-old').value.trim(), newKey: n1 }),\n          });\n        } else {\n          await api('/api/admin/setup', {\n            method: 'POST', headers: { 'Content-Type': 'application/json' },\n            body: JSON.stringify({ key: n1 }),\n          });\n        }\n        store(LS_ADMIN, n1);\n        closeModal();\n        toast(admin.configured ? '口令改好了' : '口令设好了');\n        loadAdminState();\n        // 刚才是点了「删除」被拦下来设口令的，设完接着删\n        if (S.pendingDelete) {\n          const p = S.pendingDelete;\n          S.pendingDelete = null;\n          setTimeout(function () { openRoomDeleteModal(p.code, p.name); }, 700);\n        }\n      } catch (e) { toast((e && e.message) || '保存失败', 'warn'); }\n    },\n  });\n\n  openModal({ title: '房间管理口令', bodyNode: box, actions: actions });\n}\n\n/** 「新建房间」弹窗：房间名 + 随机码 / 自定义码 */\nfunction openNewRoomModal() {\n  const box = document.createElement('div');\n\n  function row(html) {\n    const d = document.createElement('div');\n    d.className = 'form-row';\n    d.innerHTML = html;\n    return d;\n  }\n\n  const nameRow = row('<label>房间名</label>' +\n    '<input class=\"field\" id=\"nr-name\" placeholder=\"例如：朵朵的作业（可留空）\" maxlength=\"24\">');\n  const childRow = row('<label>孩子名字</label>' +\n    '<input class=\"field\" id=\"nr-child\" placeholder=\"朵朵（可留空）\" maxlength=\"12\">');\n  const modeRow = row('<label>房间码</label>' +\n    '<select class=\"field\" id=\"nr-mode\">' +\n      '<option value=\"auto\">随机生成（推荐，猜不到）</option>' +\n      '<option value=\"custom\">我自己定一个</option>' +\n    '</select>');\n  const codeRow = row('<label>自定义码</label>' +\n    '<input class=\"field\" id=\"nr-code\" placeholder=\"字母数字，3～20 位，例如 duoduo\" autocapitalize=\"characters\">');\n  codeRow.hidden = true;\n\n  const tip = document.createElement('p');\n  tip.className = 'hint hint-align';   // 左边和「房间码」的输入框对齐\n  tip.style.margin = '.2rem 0 0';\n  tip.textContent = '定了就不能改了，想换只能新建一个房间。';\n\n  box.appendChild(nameRow);\n  box.appendChild(childRow);\n  box.appendChild(modeRow);\n  box.appendChild(codeRow);\n  box.appendChild(tip);\n\n  const modeSel = modeRow.querySelector('#nr-mode');\n  const codeInput = codeRow.querySelector('#nr-code');\n  modeSel.addEventListener('change', function () {\n    codeRow.hidden = modeSel.value !== 'custom';\n    if (!codeRow.hidden) codeInput.focus();\n  });\n\n  // 输入时实时给个提示：会不会太短、有没有被占用\n  let checkTimer = null;\n  codeInput.addEventListener('input', function () {\n    const c = C.normalizeRoomCode(codeInput.value);\n    if (codeInput.value !== c) codeInput.value = c;\n    const h = C.roomCodeHint(c);\n    tip.textContent = !c ? '字母数字，3～20 位'\n      : (!h.ok ? '⚠️ ' + h.msg\n        : (h.warn ? '⚠️ ' + h.warn : '✓ 「' + c + '」可以用'));\n    clearTimeout(checkTimer);\n    if (!c || !h.ok) return;\n    checkTimer = setTimeout(async function () {\n      try {\n        const j = await api('/api/room/check?code=' + encodeURIComponent(c));\n        if (!j.ok) tip.textContent = '⚠️ ' + (j.reason || '这个码不能用');\n        else if (j.warn) tip.textContent = '⚠️ ' + j.warn;\n        else tip.textContent = '✓ 「' + c + '」可以用';\n      } catch (e) { /* 离线就算了，提交时服务器还会再拦一次 */ }\n    }, 400);\n  });\n\n  openModal({\n    title: '新建房间',\n    bodyNode: box,\n    actions: [\n      { label: '取消', cls: 'ghost', onClick: closeModal },\n      {\n        label: '创建并进入',\n        cls: 'primary',\n        onClick: async function () {\n          const name = nameRow.querySelector('#nr-name').value.trim();\n          const child = childRow.querySelector('#nr-child').value.trim();\n          const custom = modeSel.value === 'custom' ? C.normalizeRoomCode(codeInput.value) : '';\n          if (modeSel.value === 'custom') {\n            const h = C.roomCodeHint(custom);\n            if (!h.ok) { toast('房间码' + h.msg, 'warn'); return; }\n          }\n          try {\n            const j = await api('/api/room', {\n              method: 'POST',\n              headers: { 'Content-Type': 'application/json' },\n              body: JSON.stringify({ code: custom, name: name, childName: child }),\n            });\n            closeModal();\n            rememberRoom(j.room, C.roomNameOf(C.normalizeState(j.state)));\n            toast('房间建好了，正在进入…');\n            setTimeout(function () { switchRoom(j.room); }, 500);\n          } catch (e) {\n            toast((e && e.message) || '建房间失败', 'warn');\n          }\n        },\n      },\n    ],\n  });\n}\n\n/** 所有改动都走这里：本地先变，再排队发给服务器 */\nfunction dispatch(op) {\n  if (!S.state) return;\n  /*\n   * 页面自己认不出这个操作 = 浏览器里跑的是**旧代码**（缓存没刷新）。\n   * 不能默默算进本地状态就算了 —— 那样服务器那边永远不会有这条，\n   * 下次同步又把它盖掉。直接提示刷新。\n   */\n  if (!C.isKnownOp(op.t)) {\n    toast('这个操作当前页面还不认识，刷新一下页面再试', 'err', 5000);\n    return;\n  }\n  C.applyOps(S.state, [op]);\n  saveCache();\n  render();\n  if (S.mode === 'local') return;\n  queue.push(op);\n  clearTimeout(flushTimer);\n  flushTimer = setTimeout(flush, 260);\n}\n\nasync function flush() {\n  if (flushing || !queue.length || S.mode === 'local') return;\n  flushing = true;\n  setSync('busy');\n  const batch = queue.splice(0, queue.length);\n  try {\n    const j = await api('/api/state/' + S.room + '/op', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ ops: batch }),\n    });\n    let next = C.normalizeState(j.state);\n    if (queue.length) C.applyOps(next, queue);\n    S.state = next;\n    S.online = true;\n    saveCache();\n    setSync('ok');\n  } catch (e) {\n    queue.unshift.apply(queue, batch);\n    S.online = false;\n    setSync('off');\n    /*\n     * 服务器还在跑旧代码时会明确回 400。这种\"怎么点都不生效\"最让人抓狂，\n     * 所以每隔一阵子就提醒一句，别让它静悄悄地失败。\n     */\n    if (e && e.staleServer) {\n      const now = Date.now();\n      if (!S.staleWarnedAt || now - S.staleWarnedAt > 60000) {\n        S.staleWarnedAt = now;\n        toast('服务器还是旧版本，刚才的操作没能保存。重启一下服务再试。', 'err', 8000);\n      }\n      return;   // 别急着马上重试，旧服务器重试多少次都一样\n    }\n    clearTimeout(flushTimer);\n    flushTimer = setTimeout(flush, 4000);\n  } finally {\n    flushing = false;\n  }\n}\n\nasync function poll() {\n  if (S.mode === 'local' || !S.state) return;\n  if (queue.length || flushing) { flush(); return; }\n  try {\n    const j = await api('/api/state/' + S.room);\n    const remote = C.normalizeState(j.state);\n    if (remote.rev !== S.state.rev) {\n      S.state = remote;\n      saveCache();\n      render();\n    }\n    S.online = true;\n    setSync('ok');\n  } catch (e) {\n    S.online = false;\n    setSync('off');\n  }\n}\n\n/* ============================================================ 启动 */\n\nfunction roomFromUrl() {\n  const q = new URLSearchParams(location.search).get('room');\n  if (q && C.isValidRoom(q)) return q.toUpperCase();\n  const m = /#\\/r\\/([A-Za-z0-9]{6})/.exec(location.hash || '');\n  if (m && C.isValidRoom(m[1])) return m[1].toUpperCase();\n  return '';\n}\n\nfunction bootUI() {\n  const boot = $('#boot');\n  boot.hidden = false;\n  $('#boot-msg').textContent = S.bootMsg;\n  const box = $('#boot-actions');\n  box.innerHTML = '';\n  S.bootActions.forEach(function (a) {\n    const b = document.createElement('button');\n    b.className = 'btn ' + (a.cls || 'ghost') + ' block';\n    b.textContent = a.label;\n    b.addEventListener('click', a.onClick);\n    box.appendChild(b);\n  });\n}\n\nfunction hideBoot() {\n  $('#boot').hidden = true;\n  $('#topbar').hidden = false;\n  $('#view').hidden = false;\n  $('#tabbar').hidden = false;\n}\n\n/**\n * 回到顶部。\n * 注意：页面本身不滚动了（body 是 overflow:hidden 的应用外壳），\n * 真正滚的是 #scroller，所以不能再调 window.scrollTo。\n */\nfunction scrollToTop(smooth) {\n  const sc = $('#scroller');\n  if (!sc) return;\n  if (smooth && sc.scrollTo) sc.scrollTo({ top: 0, behavior: 'smooth' });\n  else sc.scrollTop = 0;\n}\n\nasync function ensureRoom() {\n  const forced = roomFromUrl();\n  if (forced) { S.room = forced; store(LS_ROOM, forced); return; }\n\n  const saved = store(LS_ROOM);\n  if (saved && C.isValidRoom(saved)) { S.room = saved; return; }\n\n  if (location.protocol === 'file:') {\n    S.mode = 'local';\n    S.room = C.roomCode();\n    store(LS_ROOM, S.room);\n    return;\n  }\n\n  S.bootMsg = '正在为你创建一个专属小站…';\n  bootUI();\n  try {\n    const j = await api('/api/room', { method: 'POST' });\n    S.room = j.room;\n    S.state = C.normalizeState(j.state);\n    store(LS_ROOM, S.room);\n  } catch (e) {\n    S.mode = 'local';\n    S.room = C.roomCode();\n    store(LS_ROOM, S.room);\n  }\n}\n\nasync function boot() {\n  loadPrefs();\n  applyFontSize();\n  S.bootMsg = '正在打开…';\n  bootUI();\n\n  await ensureRoom();\n\n  if (S.mode !== 'local' && !S.state) {\n    try {\n      const j = await api('/api/state/' + S.room);\n      S.state = C.normalizeState(j.state);\n      S.online = true;\n    } catch (e) {\n      if (e.status === 404) {\n        S.bootMsg = '这个房间码（' + S.room + '）在服务器上找不到。';\n        S.bootActions = [\n          { label: '创建一个新的小站', cls: 'primary', onClick: function () { store(LS_ROOM, ''); location.href = location.pathname; } },\n          { label: '重新试一次', onClick: function () { boot(); } },\n        ];\n        bootUI();\n        return;\n      }\n      S.online = false;\n      S.state = loadCache(S.room) || C.defaultState();\n      toast('连不上服务器，暂时用本机数据', 'err');\n    }\n  }\n  if (!S.state) S.state = loadCache(S.room) || C.defaultState();\n\n  // 把房间码写进地址栏，方便直接收藏/分享\n  try {\n    const url = new URL(location.href);\n    if (url.searchParams.get('room') !== S.room) {\n      url.searchParams.set('room', S.room);\n      history.replaceState(null, '', url.pathname + '?' + url.searchParams.toString() + location.hash);\n    }\n  } catch (e) { /* ignore */ }\n\n  setSync(S.mode === 'local' ? 'off' : 'ok');\n  // 记住进过这个房间，以后在「设置 → 房间」里能一键切回来\n  rememberRoom(S.room, C.roomNameOf(S.state));\n  hideBoot();\n  render();\n\n  // 专心计时：每秒走一次，跟连不连服务器无关\n  S.focus = loadFocus();\n  if (S.focus) keepAwake(true);    // 刷新页面时专注还在，别息屏也要接着生效\n  updateFocusUI();\n  setInterval(focusTick, 1000);\n  checkVersion();\n  loadChangelog();   // 右上角的版本号（public/changelog.json）\n  /*\n   * 问一句服务器\"能传多大的附件\"。Upstash 模式没有硬盘，不支持附件，\n   * 这时前端干脆不显示上传按钮，而不是让家长传一半才失败。\n   */\n  loadUploadLimits();\n\n  // 家长密码也支持物理键盘：0-9 输数字，Backspace 退一位，Delete / Esc 清空\n  document.addEventListener('keydown', function (e) {\n    if (S.view !== 'parent' || S.parentUnlocked) return;\n    const tag = (e.target && e.target.tagName) || '';\n    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;\n    if (/^[0-9]$/.test(e.key)) { pinPress(e.key); e.preventDefault(); }\n    else if (e.key === 'Backspace') { pinPress('删除'); e.preventDefault(); }\n    else if (e.key === 'Delete' || e.key === 'Escape') { pinPress('清空'); e.preventDefault(); }\n  });\n\n  // 家长页上任何操作都算\"人还在\"，重新开始 30 秒倒计时。\n  // 用捕获阶段，免得被别处 stopPropagation 拦掉。\n  ['click', 'keydown', 'input', 'touchstart'].forEach(function (ev) {\n    document.addEventListener(ev, function () {\n      if (parentIsActive()) touchParentLock();\n    }, true);\n  });\n\n  /*\n   * 从后台切回来时，浏览器已经把 Wake Lock 自动放掉了（规范行为），\n   * 这里再申请一次 —— 不补的话孩子切出去看一眼再回来就会息屏。\n   */\n  document.addEventListener('visibilitychange', function () {\n    if (!document.hidden && S.focus) keepAwake(true);\n  });\n\n  // 切出网站：隐藏期间什么都不重置，计时照跑，30 秒后自然上锁；\n  // 切回来时人又在家长页，那就重新给 30 秒\n  document.addEventListener('visibilitychange', function () {\n    if (parentIsActive()) touchParentLock();\n  });\n\n  if (S.mode !== 'local') {\n    setInterval(tick, 8000);\n    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });\n    window.addEventListener('focus', poll);\n  }\n}\n\n/**\n * 看看服务器上的前端文件是不是换了新的。\n * 浏览器会一直跑\"打开这一页时\"加载的那份 JS，改了代码不刷新是看不到的，\n * 所以这里主动比对一下，换了就提示刷新。\n */\nasync function checkVersion() {\n  if (S.mode === 'local') return;\n  try {\n    const j = await api('/api/version');\n    if (!j || !j.v) return;\n    /*\n     * ★ 服务器跑的还是旧代码（新的 public/ 传上去了、但容器没重启）。\n     *\n     * 这时候 op 里新加的字段会被旧代码**静默忽略** —— 界面提示\"保存好了\"，\n     * 数据却没变，看着就像\"改了没成功\"。所以一旦发现就明说，别让人白猜。\n     */\n    if (j.staleCode && !S.staleCodeWarned) {\n      S.staleCodeWarned = true;\n      toast('⚠️ 服务器跑的还是旧代码：新的 public/ 传上去了，但服务没重启。' +\n        '现在改的东西（比如任务标签）可能存不进去 —— 重启一下服务就好了。', 'err', 15000);\n    }\n    if (!S.appVersion) {\n      S.appVersion = j.v;\n      // 设置页底部会显示这个指纹。第一次拿到它时如果正开着设置页，补一次渲染，\n      // 不然那里会一直停在「读取中…」。\n      if (S.view === 'parent' && S.parentTab === 'settings') render();\n      return;\n    }\n    if (j.v !== S.appVersion) {\n      const bar = $('#updatebar');\n      if (bar) bar.hidden = false;\n    }\n  } catch (e) { /* 连不上就算了 */ }\n}\n\n/** 每 8 秒做两件事：跨过零点就换一天，然后同步一次 */\nfunction tick() {\n  if (document.hidden || !S.state) return;\n  if (S.view === 'today' && S.renderedDay !== C.todayKey()) render();\n  checkVersion();\n  poll();\n}\n\n/* ============================================================ 专注时间 */\n/*\n * 孩子在一张卡片上点「⏱ 开始专注」就开始倒计时（默认 20 分钟）。\n * 时间到了还没打完勾，就先休息 5 分钟，休息完自动开始下一轮。\n * 计时状态只存在这台设备上（localStorage），不占用云端的同步数据。\n */\n\nconst LS_FOCUS = 'hb_focus_';\nconst REST_TIPS = [\n  '站起来伸个懒腰，动动手脚',\n  '抬头看看窗外远处，让眼睛歇一会儿',\n  '去喝口水，顺便上个厕所',\n  '闭上眼睛，慢慢深呼吸三次',\n  '和爸爸妈妈说一句话吧',\n];\n\nfunction mins(key, fallback) {\n  const v = Number(S.state && S.state.settings && S.state.settings[key]);\n  return v > 0 ? v : fallback;\n}\n\nfunction loadFocus() {\n  try {\n    const raw = store(LS_FOCUS + S.room);\n    if (!raw) return null;\n    const f = JSON.parse(raw);\n    if (!f || !f.endsAt || !f.id) return null;\n    // 关过页面很久了就直接作废，免得一打开就弹「休息」\n    if (f.endsAt < Date.now() - 90000) return null;\n    return f;\n  } catch (e) { return null; }\n}\n\nfunction saveFocus() {\n  try {\n    if (S.focus) store(LS_FOCUS + S.room, JSON.stringify(S.focus));\n    else localStorage.removeItem(LS_FOCUS + S.room);\n  } catch (e) { /* ignore */ }\n}\n\nfunction focusTarget(kind, id) {\n  const st = S.state;\n  const day = C.getDay(st, C.todayKey());\n  if (kind === 'homework') {\n    const h = day.homeworks.filter(function (x) { return x.id === id; })[0];\n    if (!h) return null;\n    const m = C.subjectMeta(h.subject);\n    return { title: h.title, emoji: m.emoji, subject: h.subject, color: m.color,\n      note: h.detail || '', attachments: h.attachments };\n  }\n  if (kind === 'extra') {\n    const e = day.extras.filter(function (x) { return x.id === id; })[0];\n    return e && { title: e.title, emoji: e.emoji, subject: '额外任务', color: '#8a7a68',\n      note: e.note || '', attachments: e.attachments };\n  }\n  if (kind === 'task') {\n    const t = st.dailyTasks.filter(function (x) { return x.id === id; })[0];\n    return t && { title: t.title, emoji: t.emoji, subject: '每天要做的事', color: '#8a7a68',\n      note: t.note || '', attachments: t.attachments };\n  }\n  return null;\n}\n\nfunction startFocus(kind, id, round) {\n  const t = focusTarget(kind, id);\n  if (!t) { toast('这一项找不到了', 'err'); return; }\n  // 已经交过的东西带过来，孩子回来接着传（中途退出也不丢）\n  const rec = findItem(kind, id, C.todayKey());\n  S.focus = {\n    kind: kind, id: id, title: t.title, emoji: t.emoji,\n    subject: t.subject, color: t.color, note: t.note,\n    // 家长传的要求（第 8 条）：孩子在专注页就能点开复核\n    req: C.normalizeAttachments(t.attachments),\n    works: C.normalizeAttachments(rec && rec.works),\n    phase: 'focus', round: round || 1,\n    endsAt: Date.now() + mins('focusMinutes', 20) * 60000,\n  };\n  saveFocus();\n  hideRest();\n  render();\n  updateFocusUI();\n  keepAwake(true);      // 第 10 条：专注期间别息屏\n  chime(true);\n  speak('开始专注，' + t.title, prefs.voice);\n}\n\nfunction stopFocus(msg) {\n  if (!S.focus) return;\n  S.focus = null;\n  saveFocus();\n  hideRest();\n  keepAwake(false);     // 退出专注就把\"别息屏\"放掉，别一直咬着电量\n  if (S.view === 'today') render();\n  updateFocusUI();\n  if (msg) toast(msg);\n}\n\nfunction focusIsOn(kind, id) {\n  return Boolean(S.focus && S.focus.kind === kind && S.focus.id === id);\n}\n\n/** 这一项还在不在（家长可能把它删了） */\nfunction focusItemExists(f) {\n  if (!f || !S.state) return false;\n  const day = C.getDay(S.state, C.todayKey());\n  if (f.kind === 'homework') return day.homeworks.some(function (x) { return x.id === f.id; });\n  if (f.kind === 'extra') return day.extras.some(function (x) { return x.id === f.id; });\n  if (f.kind === 'task') return S.state.dailyTasks.some(function (x) { return x.id === f.id; });\n  return false;\n}\n\n/** 专注时间到了 */\nfunction finishFocusPhase() {\n  const f = S.focus;\n  if (!f) return;\n  // 保险：万一这一项刚好做完了，或者被删了，就不再进休息\n  const rec = findItem(f.kind, f.id, C.todayKey());\n  if ((rec && rec.done) || !focusItemExists(f)) {\n    stopFocus(rec && rec.done ? '这一项完成啦 🎉' : '');\n    if (rec && rec.done) { confetti(45); chime(true); }\n    return;\n  }\n  f.phase = 'break';\n  f.endsAt = Date.now() + mins('breakMinutes', 5) * 60000;\n  saveFocus();\n  showRest();\n  updateFocusUI();\n  chime(false);\n  speak('时间到啦，先休息' + mins('breakMinutes', 5) + '分钟吧', prefs.voice);\n}\n\n/** 休息结束 */\nfunction finishBreakPhase() {\n  const f = S.focus;\n  if (!f) return;\n  hideRest();\n  f.phase = 'focus';\n  f.round = (f.round || 1) + 1;\n  f.endsAt = Date.now() + mins('focusMinutes', 20) * 60000;\n  saveFocus();\n  updateFocusUI();\n  chime(true);\n  toast('休息结束，继续加油！', 'ok');\n  speak('休息结束，继续加油', prefs.voice);\n}\n\nfunction fmtLeft(ms) {\n  const s = Math.max(0, Math.ceil(ms / 1000));\n  return C.pad2(Math.floor(s / 60)) + ':' + C.pad2(s % 60);\n}\n\nfunction showRest() {\n  const box = $('#rest');\n  if (!box || !S.focus) return;\n  if (box.hidden || !box.dataset.built) {\n    box.dataset.built = '1';\n    // 转圈倒计时跟专注页同一个画法（顺时针收口），只是换了一套绿色\n    box.innerHTML =\n      '<div class=\"rest-card\">' +\n        '<div class=\"rest-emoji\">🌿</div>' +\n        '<h3>休息一下吧</h3>' +\n        '<div class=\"focus-clock-wrap rest-clock-wrap\">' +\n          '<svg class=\"focus-clock-ring\" viewBox=\"0 0 200 200\" aria-hidden=\"true\">' +\n            '<circle class=\"focus-clock-bg rest-ring-bg\" cx=\"100\" cy=\"100\" r=\"' + FOCUS_RING_R + '\"></circle>' +\n            '<circle class=\"focus-clock-fg rest-ring-fg\" id=\"rest-ring\" cx=\"100\" cy=\"100\" r=\"' + FOCUS_RING_R + '\" ' +\n              'stroke-dasharray=\"' + FOCUS_RING_CIRC.toFixed(2) + ' ' + FOCUS_RING_CIRC.toFixed(2) + '\" ' +\n              'stroke-dashoffset=\"0\"></circle>' +\n          '</svg>' +\n          '<div class=\"focus-clock-text rest-clock-text\">' +\n            '<div class=\"focus-clock-num\" id=\"rest-time\">--:--</div>' +\n            '<div class=\"focus-clock-cap\">还剩</div>' +\n          '</div>' +\n        '</div>' +\n        '<p class=\"rest-tip\" id=\"rest-tip\"></p>' +\n        '<button class=\"btn primary block\" data-act=\"rest-done\">我休息好啦</button>' +\n      '</div>';\n  }\n  box.hidden = false;\n}\n\nfunction hideRest() {\n  const box = $('#rest');\n  if (!box) return;\n  box.hidden = true;\n  box.innerHTML = '';\n  box.dataset.built = '';\n}\n\nconst FOCUS_RING_R = 88;\nconst FOCUS_RING_CIRC = 2 * Math.PI * FOCUS_RING_R;\n\n/** 专注页里\"孩子交作业\"那一块：上传按钮在上，传完的排在下面（一行一个） */\nfunction focusWorkBox(f) {\n  return attachBox(f.works, {\n    key: 'focus-work', itemId: f.id, kind: f.kind, scope: 'work',\n    // 手机上一键调相机 / 录音机；已传的可以删（传错了不用重来）\n    sources: true, addFirst: true,\n    removeAct: 'focus-att-del',\n  });\n}\n\n/* ------------------------------------------------------------ 别息屏 */\n\n/*\n * 第 10 条：进专注页后屏幕不要自动熄掉，孩子才能随时看到还剩多久。\n *\n * 用 Screen Wake Lock API（Chrome/Edge 84+、Safari 16.4+ 支持）。\n * 两个坑：\n *   1) 页面切到后台时浏览器会**自动释放**锁，回到前台必须重新申请 ——\n *      所以监听 visibilitychange 再要一次；\n *   2) 申请可能被拒（省电模式、不支持），这时静默降级 ——\n *      息屏只是个小遗憾，不能因此报错打扰孩子。\n */\nlet wakeLock = null;\n\nasync function keepAwake(on) {\n  if (!('wakeLock' in navigator)) return;\n  if (!on) {\n    try { if (wakeLock) await wakeLock.release(); } catch (e) { /* 已经放了就算了 */ }\n    wakeLock = null;\n    return;\n  }\n  if (wakeLock && !wakeLock.released) return;\n  try {\n    wakeLock = await navigator.wakeLock.request('screen');\n    wakeLock.addEventListener('release', function () { wakeLock = null; });\n  } catch (e) {\n    wakeLock = null;      // 省电模式 / 用户不允许：照常用，只是会息屏\n  }\n}\n\n/**\n * 专注页上的备注。\n *\n * 家长写要求时常常是**一条一行**：\n *   6 的前面一个数是谁？\n *   6 的后面一个数是谁？\n *   与 6 相邻的数是谁？\n * 直接塞进一个 <p> 里，HTML 会把换行当空白折叠掉 → 糊成一大团（家长的原话）。\n *\n * 所以一律按换行拆开，**一条一行**，装在同一张浅色卡片里。\n * 单行的备注（「家长签字」）也走同一套样式 —— 家长要求\"无论单行多行都用这个风格\"，\n * 好处是不同作业看起来一致，孩子不会一会儿看到居中的一句话、一会儿看到一张卡片。\n */\nfunction focusNoteHTML(text) {\n  const lines = String(text || '').split(/\\r?\\n/)\n    .map(function (t) { return t.trim(); })\n    .filter(function (t) { return t.length; });\n  if (!lines.length) return '';\n  return '<ul class=\"focus-note-list\">' +\n    lines.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +\n  '</ul>';\n}\n\n/** 整页的专注倒计时 */\nfunction showFocusView() {\n  const box = $('#focusmask');\n  const f = S.focus;\n  if (!box || !f) return;\n\n  const key = f.kind + ':' + f.id;\n  /*\n   * 附件开关也要参与\"要不要重建\"的判断。\n   * /api/health 是异步拿的，页面刚打开那一小会儿 S.attachmentsOn 还是 false；\n   * 如果那时候刚好进过专注页，HTML 就按\"没有附件入口\"建好了，\n   * 之后同一个目标再进来（key 没变）就**永远不会重建**，入口一直不出现（踩过）。\n   */\n  const attKey = S.attachmentsOn ? '1' : '0';\n  if (box.dataset.built !== '1' || box.dataset.for !== key || box.dataset.att !== attKey) {\n    box.dataset.built = '1';\n    box.dataset.for = key;\n    box.dataset.att = attKey;\n    box.innerHTML =\n      '<div class=\"focus-card\">' +\n        '<span class=\"focus-round\" id=\"fm-round\"></span>' +\n        '<div class=\"focus-emoji\">' + esc(f.emoji || '📘') + '</div>' +\n        (f.subject ? '<div class=\"focus-subject\" style=\"color:' + esc(f.color || '#6b7280') + '\">' + esc(f.subject) + '</div>' : '') +\n        '<h3 class=\"focus-name\">' + esc(f.title) + '</h3>' +\n        focusNoteHTML(f.note) +\n        /*\n         * 家长传的要求（第 8 条）：孩子做题时能直接点开复核 ——\n         * \"老师发的卷子照片\"就摊在这儿，不用退出去翻作业列表。\n         * 不加标题、一行一个（贴在一起更好认，也不用先读一句说明）。\n         */\n        (S.attachmentsOn && C.normalizeAttachments(f.req).length\n          ? '<div class=\"focus-req\"><div class=\"att-box\"><div class=\"att-list\">' +\n              C.normalizeAttachments(f.req).map(function (a) {\n                return attachChip(a, { cls: 'req' });\n              }).join('') +\n            '</div></div></div>'\n          : '') +\n        '<div class=\"focus-clock-wrap\">' +\n          '<svg class=\"focus-clock-ring\" viewBox=\"0 0 200 200\" aria-hidden=\"true\">' +\n            '<circle class=\"focus-clock-bg\" cx=\"100\" cy=\"100\" r=\"' + FOCUS_RING_R + '\"></circle>' +\n            '<circle class=\"focus-clock-fg\" id=\"fm-ring\" cx=\"100\" cy=\"100\" r=\"' + FOCUS_RING_R + '\" ' +\n              'stroke-dasharray=\"' + FOCUS_RING_CIRC.toFixed(2) + ' ' + FOCUS_RING_CIRC.toFixed(2) + '\" ' +\n              'stroke-dashoffset=\"0\"></circle>' +\n          '</svg>' +\n          '<div class=\"focus-clock-text\">' +\n            '<div class=\"focus-clock-num\" id=\"fm-time\">--:--</div>' +\n            '<div class=\"focus-clock-cap\">还剩</div>' +\n          '</div>' +\n        '</div>' +\n        '<p class=\"focus-tip\">专心做这一件事，做完可拍照或录音，按下面的按钮完成</p>' +\n        /*\n         * 交作业的附件（第 9 条）：上传按钮在**上面**，传完的排在按钮**下面**、一行一个。\n         * 跳绳要传视频、生字要传照片、朗读要传录音，一行一个才看得清传了啥。\n         * 传上去立刻存 —— 孩子可能按完完成就走了，不该等家长再点一次保存。\n         */\n        (S.attachmentsOn\n          ? '<div class=\"focus-work\">' +\n              focusWorkBox(f) +\n            '</div>'\n          : '') +\n        '<div class=\"focus-buttons\">' +\n          '<button class=\"btn ok block\" data-act=\"focus-done\">✓ 我做完了</button>' +\n          '<button class=\"btn ghost block\" data-act=\"focus-stop\">先不专注了</button>' +\n        '</div>' +\n      '</div>';\n  }\n\n  /*\n   * 附件那块每次都要对一遍：\n   *   · 孩子刚传完 → f.works 变了，要立刻显示出来（不然孩子以为没传上）\n   *   · 页面是\"附件功能还没就绪\"时建的 → 这块压根不存在，这里补建\n   * 只改这一小块的内容，不重建整个专注页（重建会让倒计时跳一下）。\n   */\n  if (S.attachmentsOn) {\n    const card = box.querySelector('.focus-card');\n    let att = box.querySelector('.focus-work');\n    if (!att && card) {\n      att = document.createElement('div');\n      att.className = 'focus-work';\n      const btns = card.querySelector('.focus-buttons');\n      if (btns) card.insertBefore(att, btns);\n      else card.appendChild(att);\n    }\n    if (att) {\n      const html = focusWorkBox(f);\n      if (att.innerHTML !== html) {\n        att.innerHTML = html;\n        bindAttachBoxes(att);\n      }\n    }\n  }\n\n  const cap = $('#fm-round');\n  if (cap) cap.textContent = '第 ' + (f.round || 1) + ' 轮 · 专注 ' + mins('focusMinutes', 20) + ' 分钟';\n  box.hidden = false;\n}\n\nfunction hideFocusView() {\n  const box = $('#focusmask');\n  if (!box || box.hidden) return;\n  box.hidden = true;\n  box.innerHTML = '';\n  box.dataset.built = '';\n  box.dataset.for = '';\n}\n\n/** 每秒刷新一次：专注时铺满整页倒计时，休息时换成绿色的休息页 */\nfunction updateFocusUI() {\n  if (!$('#focusmask')) return;\n\n  if (!S.focus) {\n    hideFocusView();\n    hideRest();\n    return;\n  }\n\n  const isBreak = S.focus.phase === 'break';\n  const total = mins(isBreak ? 'breakMinutes' : 'focusMinutes', isBreak ? 5 : 20) * 60000;\n  const left = Math.max(0, S.focus.endsAt - Date.now());\n\n  if (isBreak) {\n    hideFocusView();\n    showRest();\n    const time = $('#rest-time');\n    if (time) time.textContent = fmtLeft(left);\n    const tip = $('#rest-tip');\n    if (tip) {\n      const idx = Math.floor((total - left) / 20000) % REST_TIPS.length;\n      tip.textContent = REST_TIPS[idx];\n    }\n    // 跟专注页同款：剩下的圆弧顺时针收口\n    const rring = $('#rest-ring');\n    if (rring) {\n      const f = Math.max(0, Math.min(1, left / total));\n      rring.setAttribute('stroke-dasharray', (FOCUS_RING_CIRC * f).toFixed(2) + ' ' + FOCUS_RING_CIRC.toFixed(2));\n      rring.setAttribute('stroke-dashoffset', (-FOCUS_RING_CIRC * (1 - f)).toFixed(2));\n    }\n    return;\n  }\n\n  hideRest();\n  showFocusView();\n  const num = $('#fm-time');\n  if (num) num.textContent = fmtLeft(left);\n  const ring = $('#fm-ring');\n  if (ring) {\n    // 剩下的那段圆弧「收口」在 12 点，缺口从 12 点开始按顺时针变大，\n    // 看起来就是指针顺时针走。做法：把实线段放在路径末尾。\n    const f = Math.max(0, Math.min(1, left / total));\n    ring.setAttribute('stroke-dasharray', (FOCUS_RING_CIRC * f).toFixed(2) + ' ' + FOCUS_RING_CIRC.toFixed(2));\n    ring.setAttribute('stroke-dashoffset', (-FOCUS_RING_CIRC * (1 - f)).toFixed(2));\n  }\n}\n\n/** 每秒跑一次：先看这一项是不是已经完成/不在了，再看倒计时有没有到点 */\nfunction focusTick() {\n  if (S.focus) {\n    const rec = findItem(S.focus.kind, S.focus.id, C.todayKey());\n    const done = Boolean(rec && rec.done);\n    if (done || !focusItemExists(S.focus)) {\n      stopFocus(done ? '这一项完成啦，专注结束 🎉' : '这一项不在了，专注结束');\n      if (done) { confetti(45); chime(true); }\n    } else if (S.focus.endsAt - Date.now() <= 0) {\n      if (S.focus.phase === 'break') finishBreakPhase();\n      else finishFocusPhase();\n    }\n  }\n  updateFocusUI();\n}\n\n/* ============================================================ 渲染入口 */\n\nfunction render() {\n  if (!S.state) return;\n  S.renderedDay = C.todayKey();\n  document.querySelectorAll('#tabbar .tab').forEach(function (b) {\n    b.classList.toggle('on', b.dataset.view === S.view);\n  });\n  const view = $('#view');\n  let html = '';\n  if (S.view === 'today') html = viewToday();\n  else if (S.view === 'stars') html = viewStars();\n  else if (S.view === 'week') html = viewWeek();\n  else if (S.view === 'parent') html = viewParent();\n  view.innerHTML = html;\n\n  const emojis = { today: '📚', stars: '⭐', week: '📈', parent: '👨‍👩‍👧' };\n  $('#top-emoji').textContent = emojis[S.view] || '📚';\n  $('#top-title').textContent = C.roomNameOf(S.state);\n\n  let sub;\n  /*\n   * 副标题**每一页都显示房间码**，保持一致。\n   * 「今天」页原来显示的是日期，但日期在首页大卡片里已经有了（那么大的年月日），\n   * 不必在顶栏再占一行 —— 而且挤在手机上正好把标题挤成竖排。\n   */\n  sub = '房间码 ' + S.room;\n  $('#top-sub').textContent = sub;\n\n  const sb = $('#btn-sound');\n  if (sb) sb.classList.toggle('off', !prefs.voice);\n\n  // 每次重渲染后重新挂上传按钮的监听（innerHTML 换掉后旧的监听也没了）。\n  // 弹窗不在 #view 里，所以要连 #modal-root 一起扫。\n  bindAttachBoxes(document);\n}\n\n/* ---------------------------------------------------------- 通用卡片 */\n\nfunction itemCard(o) {\n  const st = S.state;\n  const cls = ['card'];\n  if (o.done) cls.push('done');\n  if (o.done && !o.confirmed && st.settings.requireConfirm) cls.push('waiting');\n  if (o.done && o.confirmed) cls.push('locked');\n  if (o.kind === 'homework') cls.push('is-homework');\n\n  /*\n   * 被家长撤销过的：孩子这边要看到理由，而且三种情况行为不一样 ——\n   *   cancel（任务取消）→ 这一项不用做了，锁住不能再点，也不再显示小红花\n   *   redo（再完善作业）→ 要重新做一遍，照常能点\n   *   ''（两个理由都没选，直接撤回）→ 就是回到没做的状态，照常能点\n   */\n  const undone = !o.done && Boolean(o.undoKind || o.undoReason);\n  const cancelled = undone && o.undoKind === 'cancel';\n  if (cancelled) cls.push('cancelled');\n  if (undone) cls.push('undone');\n\n  /*\n   * 标签栏的**固定顺序**（第 67 轮 2）：\n   *   ① 小红花  ② 截止日期  ③ 状态类（等确认 / 等爸爸妈妈确认 / 再完善一遍 / 已取消 …）\n   * 小红花永远第一、截止紧跟其后，状态往后接 —— 这样同一天的任务卡片\n   * 每一类信息都落在同一个位置上，扫一眼就知道哪张有截止、哪张在等确认。\n   */\n  const shownPoints = (o.done && o.confirmed) ? (o.awardedPoints || 0) : o.points;\n  let tags = '<span class=\"badge ' + (cancelled ? 'soft' : (o.done ? 'ok' : 'pts')) + '\">' +\n    (cancelled ? '完成 +' + shownPoints : (o.done ? '✓ 完成 +' + shownPoints : '完成 +' + shownPoints)) +\n    '⭐</span>';\n  // ② 截止日期（长期 / 实际日期 / 已截止）\n  if (o.dueLabel) {\n    tags += '<span class=\"badge soft\">📅 ' + esc(o.dueLabel) + '</span>';\n  }\n  // ③ 状态类\n  if (cancelled) {\n    tags += '<span class=\"badge soft\">🚫 已取消，这项不做了</span>';\n  } else {\n    if (o.done && !o.confirmed && st.settings.requireConfirm) {\n      tags += '<span class=\"badge wait\">⏳ 等爸爸妈妈确认</span>';\n    }\n    if (o.undoKind === 'redo') {\n      tags += '<span class=\"badge wait\">🔁 爸爸妈妈说要再完善一遍</span>';\n    } else if (undone) {\n      // 家长没选理由、直接撤回：说一句\"再做一次就好\"，不然孩子会以为哪里错了\n      tags += '<span class=\"badge wait\">↩️ 爸爸妈妈撤回了，再做一次就好</span>';\n    }\n  }\n\n  // 作业和每日任务都要经过专注页才能完成，右边放「开始专注」；做完变成已完成的勾\n  const canFocus = st.settings.focusEnabled !== false && !o.done && !cancelled;\n  let right;\n  if (canFocus) {\n    right = '<button class=\"focus-btn' + (focusIsOn(o.kind, o.id) ? ' on' : '') + '\"' +\n      ' data-act=\"focus-start\" data-kind=\"' + o.kind + '\" data-id=\"' + esc(o.id) + '\" title=\"开始专注\">⏱</button>';\n  } else {\n    right = '<div class=\"check static\" title=\"' + (cancelled ? '已取消' : '已完成') + '\">' +\n      (cancelled ? '🚫' : '✓') + '</div>';\n  }\n\n  return '' +\n    '<div class=\"' + cls.join(' ') + '\"' +\n      // 取消掉的这一项不给点（连 data-act 都不放，点了也没人接）\n      (cancelled ? '' : ' data-act=\"toggle\" data-kind=\"' + o.kind + '\" data-id=\"' + esc(o.id) + '\"') + '>' +\n      '<div class=\"card-emoji\">' + (o.emoji || '📘') + '</div>' +\n      '<div class=\"card-body\">' +\n        '<div class=\"card-title\">' +\n          (o.subject ? '<span class=\"card-subject\" style=\"color:' + (o.color || '#6b7280') + '\">' + esc(o.subject) + '</span>' : '') +\n          '<span class=\"card-title-text\">' + esc(o.title) + '</span>' +\n        '</div>' +\n        // 没有详细要求就不占一行\n        (o.detail ? '<div class=\"card-detail\">' + esc(o.detail) + '</div>' : '') +\n        /*\n         * 第 57 轮 5：家长传的附件也显示在孩子的卡片上，就在**备注下面**、一行两个。\n         * 孩子点卡片进专注页之前，先能看到\"今天要用的材料在这儿\"。\n         */\n        (C.normalizeAttachments(o.attachments).length\n          ? '<div class=\"att-box card-att req-att\"><div class=\"att-list\">' +\n              C.normalizeAttachments(o.attachments).map(function (a) {\n                return attachChip(a, { cls: 'req' });\n              }).join('') +\n            '</div></div>'\n          : '') +\n        /*\n         * 被撤销过的话，这里只放**家长写的那句理由**。\n         *\n         * 原来上面还有一行加粗的「爸爸妈妈让你再完善一下 / 取消了这项」，\n         * 但下面那个徽章（🔁 爸爸妈妈说要再完善一遍 / 🚫 已取消，这项不做了）\n         * 已经把话说清楚了 —— 两处一起出现就是重复，看着啰嗦。\n         * 没写理由就整块不出现，别留一个空框。\n         */\n        (undone && o.undoReason\n          ? '<div class=\"card-undo\"><span>' + esc(o.undoReason) + '</span></div>'\n          : '') +\n        /*\n         * 孩子自己交上去的东西列在这儿：传完能看见\"交上去了\"，\n         * 否则孩子会不确定到底传没传成功，反复传好几遍。\n         */\n        (C.normalizeAttachments(o.works).length\n          ? '<div class=\"att-box card-att\"><div class=\"att-list\">' +\n              C.normalizeAttachments(o.works).map(function (a) {\n                return attachChip(a, { cls: 'work' });\n              }).join('') +\n            '</div></div>'\n          : '') +\n        '<div class=\"card-tags\">' + tags + '</div>' +\n      '</div>' +\n      '<div class=\"card-actions\">' +\n        '<button class=\"speak-btn\" data-act=\"speak\" data-text=\"' + esc(o.speakText || o.title) + '\" title=\"读一遍\">🔊</button>' +\n        right +\n      '</div>' +\n    '</div>';\n}\n\n/** 首页那种小圆环：中心一行大字 + 一行小字，下面一行说明 */\nfunction ringHTML(percent, big, small, tone) {\n  const R = 52;\n  const CIRC = 2 * Math.PI * R;\n  const pct = Math.min(100, Math.max(0, percent));\n  const off = CIRC * (1 - pct / 100);\n  return '' +\n    '<div class=\"ring-wrap\">' +\n      '<svg class=\"ring\" viewBox=\"0 0 120 120\" aria-hidden=\"true\">' +\n        '<circle class=\"ring-bg\" cx=\"60\" cy=\"60\" r=\"' + R + '\"></circle>' +\n        '<circle class=\"ring-fg' + (tone ? ' ' + tone : '') + (pct >= 100 ? ' full' : '') + '\" cx=\"60\" cy=\"60\" r=\"' + R + '\" ' +\n          'stroke-dasharray=\"' + CIRC.toFixed(1) + '\" stroke-dashoffset=\"' + off.toFixed(1) + '\"></circle>' +\n      '</svg>' +\n      '<div class=\"ring-label\">' + big + '<small>' + small + '</small></div>' +\n    '</div>';\n}\n\nfunction emptyBox(emoji, text) {\n  return '<div class=\"empty\"><span class=\"empty-emoji\">' + emoji + '</span><p>' + esc(text) + '</p></div>';\n}\n\n/* ---------------------------------------------------------- 今天（孩子） */\n\nfunction viewToday() {\n  const st = S.state;\n  const date = C.todayKey();\n  const day = C.getDay(st, date);\n  const stat = C.countDone(st, date);\n\n  const prev = S.prevPercent[date];\n  S.prevPercent[date] = stat.percent;\n  if (prev !== undefined && prev < 100 && stat.percent === 100 && stat.total > 0) {\n    setTimeout(function () {\n      confetti();\n      chime(true);\n      toast('今天的任务全部完成，太棒了！', 'ok');\n      speak('太棒了！今天的任务全部完成！', prefs.voice);\n    }, 120);\n  }\n\n  const hwCards = day.homeworks.map(function (h) {\n    const m = C.subjectMeta(h.subject);\n    return itemCard({\n      kind: 'homework', id: h.id, emoji: m.emoji, color: m.color,\n      subject: h.subject, title: h.title, detail: h.detail,\n      done: h.done, confirmed: h.confirmed, awardedPoints: h.awardedPoints,\n      undoKind: h.undoKind, undoReason: h.undoReason, works: h.works,\n      attachments: h.attachments,\n      points: h.points != null ? h.points : st.settings.homeworkPoints,\n      speakText: h.subject + '，' + h.title + (h.detail ? '，' + h.detail : ''),\n    });\n  }).join('');\n\n  /*\n   * 过期的任务自动不显示（是**算出来**的，不是去改 active —— 数据一条没删，\n   * 家长改个日期就复活）。\n   */\n  const tasks = st.dailyTasks.filter(function (t) { return C.taskActive(t, C.todayKey(), st.settings.holidays); });\n  const taskCards = tasks.map(function (t) {\n    const r = day.tasks[t.id] || C.emptyRecord();\n    /*\n     * 第 6 条：这一天的记录里有快照就按快照显示 ——\n     * 家长后来改了名字 / 图标 / 分值 / 标签，历史那几天原样不动。\n     */\n    // 传今天：今天的卡片按当前定义显示，家长刚改的标签要立刻看到（第 73 轮）\n    const v = C.taskView(t, r, C.todayKey());\n    const tm = C.taskTagMeta(v.tag);\n    return itemCard({\n      kind: 'task', id: t.id, emoji: v.emoji, title: v.title,\n      // 标签放在和作业科目**同一个位置**，样式也一样（第 2 条）\n      subject: v.tag || '', color: tm.color,\n      detail: t.note || '',\n      // 截止日期进标签栏：长期 / 实际日期 / 已截止\n      // 有效期（第 81 轮 5）：按有效期显示，多个特定日期只显示最近两个 + …\n      dueLabel: C.schedLabel(t, C.todayKey()),\n      done: r.done, confirmed: r.confirmed, awardedPoints: r.awardedPoints,\n      undoKind: r.undoKind, undoReason: r.undoReason, works: r.works,\n      attachments: t.attachments,\n      points: v.points,\n      speakText: v.title + (t.note ? '，' + t.note : ''),\n    });\n  }).join('');\n\n  const extraCards = day.extras.map(function (e) {\n    return itemCard({\n      kind: 'extra', id: e.id, emoji: e.emoji, title: e.title,\n      detail: e.note || '',\n      done: e.done, confirmed: e.confirmed, awardedPoints: e.awardedPoints,\n      undoKind: e.undoKind, undoReason: e.undoReason, works: e.works,\n      attachments: e.attachments,\n      points: e.points,\n      speakText: e.title + (e.note ? '，' + e.note : ''),\n    });\n  }).join('');\n\n  const moodRow = C.MOODS.map(function (m) {\n    return '<button class=\"mood-btn' + (day.mood === m.emoji ? ' on' : '') + '\" data-act=\"mood\" data-emoji=\"' + m.emoji + '\" title=\"' + m.label + '\">' + m.emoji + '</button>';\n  }).join('');\n\n  // 今天所有任务一共值多少小红花 / 已经到账多少\n  let pointTotal = 0, pointEarned = 0;\n  day.homeworks.forEach(function (h) {\n    pointTotal += h.points != null ? h.points : (st.settings.homeworkPoints || 0);\n    if (h.awarded) pointEarned += h.awardedPoints || 0;\n  });\n  // 当天的满分只算\"这一天还有效\"的任务，过期的和已停用的都不计入\n  st.dailyTasks.filter(function (t) { return C.taskActive(t, date, st.settings.holidays); }).forEach(function (t) {\n    pointTotal += t.points || 0;\n    const r = day.tasks[t.id];\n    if (r && r.awarded) pointEarned += r.awardedPoints || 0;\n  });\n  day.extras.forEach(function (e) {\n    pointTotal += e.points || 0;\n    if (e.awarded) pointEarned += e.awardedPoints || 0;\n  });\n  const pointPct = pointTotal ? Math.round(pointEarned / pointTotal * 100) : 0;\n\n  const d = C.parseDateKey(date);\n\n  return '' +\n    '<div class=\"hero\">' +\n      '<div class=\"hero-main\">' +\n        '<div class=\"hero-hi\">' + greeting() + '，' + esc(st.settings.childName || '宝贝') + '！</div>' +\n        '<div class=\"hero-date\">' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + C.weekdayCN(date) + '</div>' +\n        (st.settings.welcome ? '<div class=\"hero-welcome\">' + esc(st.settings.welcome) + '</div>' : '') +\n      '</div>' +\n      '<div class=\"hero-right\">' +\n        '<div class=\"hero-ring\" title=\"今天拿到的小红花\">' +\n          ringHTML(pointPct, '+' + pointEarned, '今日⭐', 'gold') +\n          '<div class=\"ring-caption\">共 ' + pointTotal + '⭐</div>' +\n        '</div>' +\n        '<div class=\"hero-ring\" title=\"今天任务的完成进度\">' +\n          ringHTML(stat.percent, stat.percent + '%', '完成') +\n          '<div class=\"ring-caption\">' + stat.done + '/' + stat.total + ' 项</div>' +\n        '</div>' +\n      '</div>' +\n    '</div>' +\n\n    '<div class=\"mood-row\">' +\n      '<span class=\"mood-label\">今天心情：</span>' + moodRow +\n      '<span class=\"spacer\" style=\"flex:1\"></span>' +\n      '<button class=\"chip\" data-act=\"read-all\">🔊 读给我听</button>' +\n    '</div>' +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\">' +\n        '<h2>📚 今天的作业</h2>' +\n        '<span class=\"pill' + (day.homeworks.length && day.homeworks.every(function (h) { return h.done; }) ? ' ok' : '') + '\">' +\n          day.homeworks.filter(function (h) { return h.done; }).length + '/' + day.homeworks.length +\n        '</span>' +\n        '<span class=\"spacer\"></span>' +\n      '</div>' +\n      '<div class=\"card-list\">' +\n        (day.homeworks.length ? hwCards : emptyBox('📭', '今天的作业还没发过来，等爸爸妈妈在钉钉上收到后发过来～')) +\n      '</div>' +\n    '</section>' +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\">' +\n        '<h2>🌟 每天要做的事</h2>' +\n        '<span class=\"pill' + (tasks.length && tasks.every(function (t) { const r = day.tasks[t.id]; return r && r.done; }) ? ' ok' : '') + '\">' +\n          tasks.filter(function (t) { const r = day.tasks[t.id]; return r && r.done; }).length + '/' + tasks.length +\n        '</span>' +\n        '<span class=\"spacer\"></span>' +\n      '</div>' +\n      '<div class=\"card-list\">' + (taskCards || emptyBox('🌟', '还没有设置每日任务')) + '</div>' +\n    '</section>' +\n\n    (day.extras.length ?\n      '<section class=\"panel\">' +\n        '<div class=\"panel-head\"><h2>✨ 额外的任务</h2><span class=\"spacer\"></span></div>' +\n        '<div class=\"card-list\">' + extraCards + '</div>' +\n      '</section>' : '') +\n\n    '<div style=\"margin-top:1rem\">' +\n      '<button class=\"btn ghost block\" data-act=\"add-extra\">➕ 我还有别的事想做（挣小红花）</button>' +\n    '</div>' +\n\n    (day.note ?\n      '<section class=\"panel\">' +\n        '<div class=\"panel-head\"><h2>💬 爸爸妈妈的留言</h2></div>' +\n        '<div class=\"form-card\"><p style=\"font-size:.95rem;white-space:pre-wrap\">' + esc(day.note) + '</p></div>' +\n      '</section>' : '') +\n\n    (stat.waiting ?\n      '<p class=\"hint\" style=\"text-align:center;margin-top:1rem\">有 ' + stat.waiting + ' 项在等爸爸妈妈确认，确认后小红花就到账啦 ⭐</p>' : '');\n}\n\n/* ---------------------------------------------------------- 小红花 */\n\nfunction viewStars() {\n  const st = S.state;\n  const bal = st.points.balance;\n\n  // 停用的奖励孩子这边不显示（家长那边还能重新启用）\n  const availRewards = st.rewards.filter(function (r) { return r.active !== false; });\n  const rewards = availRewards.map(function (r) {\n    const can = bal >= r.cost;\n    return '<button class=\"reward\" data-act=\"redeem\" data-id=\"' + esc(r.id) + '\"' + (can ? '' : ' disabled') + '>' +\n      '<span class=\"r-emoji\">' + r.emoji + '</span>' +\n      '<span class=\"r-title\">' + esc(r.title) + '</span>' +\n      '<span class=\"r-cost\">' + r.cost + ' ⭐</span>' +\n    '</button>';\n  }).join('');\n\n  const pending = st.redemptions.filter(function (r) { return r.status === 'pending'; });\n  const pendingHTML = pending.map(function (r) {\n    return '<div class=\"log-item\">' +\n      '<span>' + r.emoji + '</span>' +\n      '<span class=\"log-reason\">' + esc(r.title) + '</span>' +\n      '<span class=\"badge wait\">等爸爸妈妈确认</span>' +\n    '</div>';\n  }).join('');\n\n  const rejected = st.redemptions.filter(function (r) { return r.status === 'rejected'; }).slice(0, 5);\n  const rejectedHTML = rejected.map(function (r) {\n    return '<div class=\"log-item\">' +\n      '<span>' + r.emoji + '</span>' +\n      '<span class=\"log-reason\">' + esc(r.title) +\n        (r.reason ? '<div class=\"log-why\">爸爸妈妈说：' + esc(r.reason) + '</div>' : '') +\n      '</span>' +\n      '<span class=\"badge danger\">已驳回</span>' +\n    '</div>';\n  }).join('');\n\n  /*\n   * 已经兑现的：加上**兑现日期**（第 95 轮）。\n   * 原来只有一枚「已兑现」徽章，看不出是哪天换的 ——\n   * 孩子问\"我那个冰淇淋是哪天吃的\"就没法答。\n   * 日期显示成 10/22 这种短格式（孩子页一行要塞下：图标 + 标题 + 徽章 + 日期 + 花掉的分），\n   * 完整时间放在 title 里，鼠标停上去能看到。\n   */\n  const mdOf = function (ts) {\n    const d = new Date(ts);\n    return (d.getMonth() + 1) + '/' + d.getDate();\n  };\n  const doneList = st.redemptions.filter(function (r) { return r.status === 'done'; }).slice(0, 8);\n  const doneHTML = doneList.map(function (r) {\n    const at = r.resolvedAt || r.ts;\n    return '<div class=\"log-item\">' +\n      '<span>' + r.emoji + '</span>' +\n      '<span class=\"log-reason\">' + esc(r.title) + '</span>' +\n      '<span class=\"badge ok\">已兑现</span>' +\n      '<span class=\"log-time\" title=\"' + esc(fullTime(at)) + '\">' + mdOf(at) + '</span>' +\n      '<span class=\"log-time\">-' + r.cost + '⭐</span>' +\n    '</div>';\n  }).join('');\n\n  /*\n   * 第 94 轮：小红花记录支持翻页，能翻到**全部**记录。\n   * 原来只 slice(0, 20) —— 家长想看\"上个月那笔\"根本没门。\n   *\n   * 每页 20 条，页码存在 S.ledgerPage（0 起）。\n   * 页码要夹在合法范围里：记录被撤销/清空之后总页数会变少，\n   * 停在旧页码上会看到一张空白页。\n   */\n  const PER_PAGE = 20;\n  const totalPages = Math.max(1, Math.ceil(st.ledger.length / PER_PAGE));\n  const page = Math.min(Math.max(0, S.ledgerPage || 0), totalPages - 1);\n  S.ledgerPage = page;\n  const pageItems = st.ledger.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);\n\n  const ledger = pageItems.map(function (l) {\n    const d = new Date(l.ts);\n    const t = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + C.pad2(d.getHours()) + ':' + C.pad2(d.getMinutes());\n    /*\n     * 0 分（只留评语、不加不减）不加正负号，写成「0⭐」——\n     * 写成「+0⭐」看着像加了分，其实没动。\n     */\n    const deltaTxt = l.delta === 0 ? '0⭐'\n      : (l.delta > 0 ? '+' + l.delta : String(l.delta)) + '⭐';\n    return '<div class=\"log-item\">' +\n      '<span class=\"log-time\">' + t + '</span>' +\n      '<span class=\"log-reason\">' + esc(l.reason) + '</span>' +\n      '<span class=\"log-delta ' + (l.delta > 0 ? 'plus' : l.delta < 0 ? 'minus' : 'zero') + '\">' +\n        deltaTxt + '</span>' +\n    '</div>';\n  }).join('');\n\n  /* 翻页条：只有一页就不显示（别凭空多一行按钮） */\n  const pager = totalPages > 1\n    ? '<div class=\"pager\">' +\n        '<button class=\"btn ghost sm\" data-act=\"ledger-page\" data-page=\"' + (page - 1) + '\"' +\n          (page <= 0 ? ' disabled' : '') + '>← 上一页</button>' +\n        '<span class=\"pager-info\">第 ' + (page + 1) + ' / ' + totalPages + ' 页' +\n          ' · 共 ' + st.ledger.length + ' 条</span>' +\n        '<button class=\"btn ghost sm\" data-act=\"ledger-page\" data-page=\"' + (page + 1) + '\"' +\n          (page >= totalPages - 1 ? ' disabled' : '') + '>下一页 →</button>' +\n      '</div>'\n    : (st.ledger.length ? '<div class=\"pager\"><span class=\"pager-info\">共 ' +\n        st.ledger.length + ' 条</span></div>' : '');\n\n  return '' +\n    '<div class=\"star-hero\">' +\n      '<div class=\"star-count\"><span class=\"star-ico\">⭐</span>' + bal + '</div>' +\n      '<div class=\"star-label\">我现在有这么多小红花</div>' +\n      '<div class=\"star-stats\">' +\n        '<div><b>' + st.points.earned + '</b>一共赚到</div>' +\n        '<div><b>' + st.points.spent + '</b>一共花掉</div>' +\n        '<div><b>' + C.currentStreak(st) + '</b>连续达标（天）</div>' +\n      '</div>' +\n    '</div>' +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>🎁 可以换什么</h2><span class=\"spacer\"></span>' +\n        '<span class=\"hint\">点一下就兑换</span></div>' +\n      '<div class=\"reward-grid\">' + (rewards || emptyBox('🎁', '还没有设置奖励，让爸爸妈妈加几个吧')) + '</div>' +\n    '</section>' +\n\n    (pending.length ? '<section class=\"panel\"><div class=\"panel-head\"><h2>⏳ 等着爸爸妈妈确认</h2></div>' +\n      '<div class=\"card-list\">' + pendingHTML + '</div></section>' : '') +\n\n    (rejectedHTML ? '<section class=\"panel\"><div class=\"panel-head\"><h2>🙈 这次没有换成</h2></div>' +\n      '<div class=\"card-list\">' + rejectedHTML + '</div></section>' : '') +\n\n    (doneHTML ? '<section class=\"panel\"><div class=\"panel-head\"><h2>✅ 已经兑现</h2></div>' +\n      '<div class=\"card-list\">' + doneHTML + '</div></section>' : '') +\n\n    (ledger ? '<section class=\"panel\" id=\"sec-ledger\"><div class=\"panel-head\"><h2>📜 小红花记录</h2>' +\n        '<span class=\"spacer\"></span>' +\n        '<span class=\"hint\">一共 ' + st.ledger.length + ' 条</span></div>' +\n      '<div class=\"card-list\">' + ledger + '</div>' + pager + '</section>' :\n      '<section class=\"panel\">' + emptyBox('🌱', '还没有小红花记录。完成作业和每日任务就能赚到啦！') + '</section>');\n}\n\n/* ---------------------------------------------------------- 这一周 */\n\nfunction viewWeek() {\n  const st = S.state;\n  const today = C.todayKey();\n  const keys = C.weekKeys(today);\n\n  let weekEarned = 0;\n  st.ledger.forEach(function (l) {\n    if (keys.indexOf(l.date) >= 0 && l.delta > 0) weekEarned += l.delta;\n  });\n\n  const bars = keys.map(function (k) {\n    const c = C.countDone(st, k);\n    const d = C.parseDateKey(k);\n    const cls = 'bar-col' + (k === today ? ' today' : '');\n    return '<div class=\"' + cls + '\">' +\n      '<span class=\"bar-pct\">' + (c.total ? c.percent + '%' : '') + '</span>' +\n      '<div class=\"bar-track\"><div class=\"bar-fill' + (c.percent >= 100 ? ' full' : '') + '\" style=\"height:' + c.percent + '%\"></div></div>' +\n      '<span class=\"bar-day\">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>' +\n    '</div>';\n  }).join('');\n\n  const taskRows = st.dailyTasks.filter(function (t) { return !t.deleted; }).map(function (t) {\n    let hit = 0;\n    keys.forEach(function (k) {\n      const day = C.getDay(st, k);\n      const r = day.tasks[t.id];\n      if (r && r.done && (r.confirmed || !st.settings.requireConfirm)) hit++;\n    });\n    const pct = Math.round(hit / 7 * 100);\n    return '<div class=\"task-stat-row\">' +\n      '<span>' + t.emoji + '</span>' +\n      '<span class=\"ts-name\">' + esc(t.title) + '</span>' +\n      '<span class=\"ts-bar\"><i style=\"width:' + pct + '%\"></i></span>' +\n      '<span class=\"ts-num\">' + hit + '/7</span>' +\n    '</div>';\n  }).join('');\n\n  let hwTotal = 0, hwDone = 0;\n  keys.forEach(function (k) {\n    const day = C.getDay(st, k);\n    day.homeworks.forEach(function (h) {\n      hwTotal++;\n      if (h.done && (h.confirmed || !st.settings.requireConfirm)) hwDone++;\n    });\n  });\n  const hwRate = hwTotal ? Math.round(hwDone / hwTotal * 100) : 0;\n\n  let fullDays = 0;\n  keys.forEach(function (k) {\n    const c = C.countDone(st, k);\n    if (c.total > 0 && c.done === c.total) fullDays++;\n  });\n\n  return '' +\n    '<div class=\"stat-grid\">' +\n      '<div class=\"stat\"><div class=\"stat-num\">' + hwRate + '%</div><div class=\"stat-name\">作业完成率</div></div>' +\n      '<div class=\"stat\"><div class=\"stat-num\">' + hwDone + '/' + hwTotal + '</div><div class=\"stat-name\">作业项</div></div>' +\n      '<div class=\"stat\"><div class=\"stat-num\">' + weekEarned + '</div><div class=\"stat-name\">本周小红花</div></div>' +\n      '<div class=\"stat\"><div class=\"stat-num\">' + fullDays + '</div><div class=\"stat-name\">全勤天数</div></div>' +\n    '</div>' +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>📈 这一周的完成情况</h2></div>' +\n      '<div class=\"form-card\"><div class=\"bars\">' + bars + '</div></div>' +\n    '</section>' +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>🌟 每件事坚持了几天</h2></div>' +\n      '<div class=\"form-card\">' + (taskRows || '<p class=\"hint\">还没有每日任务</p>') + '</div>' +\n    '</section>' +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>🏆 连续全部完成</h2></div>' +\n      '<div class=\"form-card\" style=\"text-align:center\">' +\n        '<div class=\"stat-num\" style=\"font-size:2.4rem\">' + C.currentStreak(st) + '</div>' +\n        '<div class=\"hint\">天连续完成全部任务</div>' +\n      '</div>' +\n    '</section>';\n}\n\n/* ---------------------------------------------------------- 家长端 */\n\n/**\n * 家长端每一行：完全照孩子端「今天的作业」卡片排版 ——\n *   [图标块]  科目 + 标题\n *             详细要求（没有就不占行）\n *             积分 / 状态徽章\n *   [右边的 ↑↓ ✎ ✕ 按钮]\n */\nfunction rowItem(o) {\n  return '<div class=\"row-item' + (o.cls ? ' ' + o.cls : '') + '\">' +\n    '<div class=\"ri-face\">' + (o.face || '📘') + '</div>' +\n    '<div class=\"ri-main\">' +\n      '<div class=\"ri-title\">' +\n        (o.subject ? '<span class=\"ri-subj\"' + (o.color ? ' style=\"color:' + o.color + '\"' : '') + '>' +\n          esc(o.subject) + '</span>' : '') +\n        esc(o.title) +\n      '</div>' +\n      (o.note ? '<div class=\"ri-note-line\">' + o.note + '</div>' : '') +\n      /*\n       * 顺序固定：标题 → 备注 → 附件 → 小红花数。\n       * 附件放在小红花**上面**：家长先看\"要做什么/有什么材料\"，再看\"值几朵花\"。\n       */\n      (o.att || '') +\n      '<div class=\"ri-tags\">' + o.badges + '</div>' +\n    '</div>' +\n    '<div class=\"ri-tools\">' + o.tools + '</div>' +\n  '</div>';\n}\n\n/**\n * 一行下面的附件：家长的\"要求\"和孩子的\"交上来\"合成**一个列表**直接铺开，\n * 不再分组加「📎 要求 / 🙋 交上来的」小标题（家长说标签占地方、看着乱）。\n * 孩子交的仍然用淡绿底区分，需要分辨时一眼还是分得出。\n *\n * 这里**只展示、不带删除按钮** —— 家长要求\"列表里不要直接删附件，\n * 增删都走「修改」\"。所以只读，要改就去点 ✎。\n */\nfunction attachChipsForRow(item, kind, id) {\n  void kind; void id;\n  const mine = C.normalizeAttachments(item.attachments);\n  const works = C.normalizeAttachments(item.works);\n  if (!mine.length && !works.length) return '';\n  return '<div class=\"att-box row-att\"><div class=\"att-list\">' +\n    mine.map(function (a) { return attachChip(a, { cls: 'req' }); }).join('') +\n    works.map(function (a) { return attachChip(a, { cls: 'work' }); }).join('') +\n  '</div></div>';\n}\n\n/**\n * 右边那一排小圆按钮：↑ ↓ [extra] ✎ ✕\n * 全站统一用 act-btn，五个模块大小一致。\n */\nfunction rowTools(list, id, index, total, editAct, delAct, extra) {\n  const upOff = index <= 0 ? ' disabled' : '';\n  const downOff = index >= total - 1 ? ' disabled' : '';\n  const d = ' data-list=\"' + list + '\" data-id=\"' + esc(id) + '\"';\n  return '<button class=\"act-btn\" data-act=\"move\"' + d + ' data-dir=\"-1\"' + upOff + ' title=\"上移\">↑</button>' +\n    '<button class=\"act-btn\" data-act=\"move\"' + d + ' data-dir=\"1\"' + downOff + ' title=\"下移\">↓</button>' +\n    (extra || '') +\n    '<button class=\"act-btn info\" data-act=\"' + editAct + '\" data-id=\"' + esc(id) + '\" title=\"修改\">✎</button>' +\n    '<button class=\"act-btn danger\" data-act=\"' + delAct + '\" data-id=\"' + esc(id) + '\" title=\"删除\">✕</button>';\n}\n\nfunction parentItems(date) {\n  const st = S.state;\n  const day = C.getDay(st, date);\n  const out = [];\n  day.homeworks.forEach(function (h) {\n    const m = C.subjectMeta(h.subject);\n    out.push({ kind: 'homework', id: h.id, emoji: m.emoji, title: h.title, sub: h.subject,\n      color: m.color, rec: h });\n  });\n  st.dailyTasks.forEach(function (t) {\n    const r = day.tasks[t.id];\n    if (!r) return;\n    /*\n     * 第 6 条：这一天有快照就按快照显示（图标 / 名字 / 标签）。\n     * 家长后来改任务只影响以后，翻回历史那一天看到的还是当时的样子。\n     */\n    // 传这一天的日期：只有翻回**过去**的日子才用快照（第 73 轮）\n    const v = C.taskView(t, r, date);\n    out.push({\n      kind: 'task', id: t.id, emoji: v.emoji, title: v.title,\n      sub: v.tag || '任务', color: C.taskTagMeta(v.tag).color, rec: r,\n    });\n  });\n  day.extras.forEach(function (e) {\n    out.push({ kind: 'extra', id: e.id, emoji: e.emoji, title: e.title, sub: '额外',\n      color: '#8a7a68', rec: e });\n  });\n  return out;\n}\n\nfunction viewParent() {\n  if (!S.parentUnlocked) return viewPinGate();\n\n  const tabs = [\n    ['hw', '✏️', '录入作业'],\n    ['confirm', '✅', '待确认'],\n    // 任务和奖励合成一页：任务在上、奖励在下（原来是两个页签）\n    ['tasks', '🌟', '任务奖励'],\n    ['settings', '⚙️', '设置'],\n  ];\n  const sub = tabs.map(function (t) {\n    return '<button class=\"subtab' + (S.parentTab === t[0] ? ' on' : '') + '\" data-act=\"parent-tab\" data-tab=\"' + t[0] + '\">' +\n      '<span class=\"ico\">' + t[1] + '</span>' + t[2] + '</button>';\n  }).join('');\n\n  let body = '';\n  if (S.parentTab === 'hw') body = parentHomework();\n  else if (S.parentTab === 'confirm') body = parentConfirm();\n  // 老版本存过 'rewards' 这个页签，进来也落到「任务奖励」上\n  else if (S.parentTab === 'tasks' || S.parentTab === 'rewards') body = parentTasks() + parentRewards();\n  else body = parentSettings();\n\n  const pending = parentItems(S.date).filter(function (x) {\n    return x.rec.done && !x.rec.confirmed;\n  }).length + S.state.redemptions.filter(function (r) { return r.status === 'pending'; }).length;\n\n  return '<div class=\"subtabs' + (pending ? '' : ' no-ask') + '\">' + sub + '</div>' + askBanner(pending) + body;\n}\n\n/* ------------------------------------------------ 家长模式自动上锁 */\n\n/*\n * 解锁期间**始终**有一个 30 秒的计时器在跑，只有两种情况会重新计时：\n *   1. 家长在家长页上有操作（点击 / 按键 / 输入）\n *   2. 切回家长页，或者页面从后台切回前台\n *\n * 于是三种\"人走开了\"都自然到期上锁，不用各写一套：\n *   · 离开家长页（切到「今天」这些标签）超过 30 秒\n *   · 就在家长页上晾着不动 30 秒\n *   · 切出网站 / 切到别的 App 超过 30 秒（页面隐藏期间不重置，计时照跑）\n *\n * 反过来，30 秒内切回来、或者一直在家长页上操作，都不会被踢出去。\n */\nconst PARENT_LOCK_MS = 30000;\nlet parentLockTimer = null;\n\n/** 重新计时（家长还在，或者刚回来） */\nfunction touchParentLock() {\n  clearTimeout(parentLockTimer);\n  parentLockTimer = null;\n  if (!S.parentUnlocked) return;\n  parentLockTimer = setTimeout(lockParentNow, PARENT_LOCK_MS);\n}\n\n/** 计时到期：上锁 */\nfunction lockParentNow() {\n  parentLockTimer = null;\n  if (!S.parentUnlocked) return;\n  S.parentUnlocked = false;\n  S.pinInput = '';\n  if (S.view === 'parent') render();\n  toast('家长模式已重新上锁', 'warn');\n}\n\n/** 在家长页上、且页面可见时，任何操作都算\"人还在\" */\nfunction parentIsActive() {\n  return S.parentUnlocked && S.view === 'parent' && !document.hidden;\n}\n\n/**\n * 密码键盘：点击和物理键盘都走这里。\n * 支持 0-9、Backspace（删除一位）、Delete / Esc（清空）。\n */\nfunction pinPress(k) {  if (!S.state) return;\n  S.pinInput = S.pinInput || '';\n  if (k === '删除') S.pinInput = S.pinInput.slice(0, -1);\n  else if (k === '清空') S.pinInput = '';\n  else if (/^[0-9]$/.test(String(k)) && S.pinInput.length < 4) S.pinInput += String(k);\n\n  if (S.pinInput.length === 4) {\n    if (S.pinInput === String(S.state.settings.parentPin)) {\n      S.parentUnlocked = true;\n      S.pinInput = '';\n      touchParentLock();          // 解锁后开始 30 秒倒计时\n      toast('欢迎，家长', 'ok');\n    } else {\n      S.pinInput = '';\n      toast('密码不对，再试一次', 'err');\n    }\n  }\n  render();\n}\n\nfunction viewPinGate() {\n  // 3×4 排满：1-9 / 清空 0 删除。用文字而不是「⌫」，\n  // 因为那个字符在很多系统字体里没有字形，会渲染成一个方框。\n  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '清空', 0, '删除'];\n  const pad = keys.map(function (k) {\n    const fn = (k === '清空' || k === '删除');\n    return '<button class=\"' + (fn ? 'fn' : '') + '\" data-act=\"pin-key\" data-key=\"' + k + '\">' + k + '</button>';\n  }).join('');\n  const dots = [0, 1, 2, 3].map(function (i) {\n    return '<i class=\"' + (i < (S.pinInput || '').length ? 'on' : '') + '\"></i>';\n  }).join('');\n\n  // 只有还是初始密码时才提示 1234；改过之后就别再写死这句话了\n  const stillDefault = String((S.state && S.state.settings.parentPin) || '') === '1234';\n\n  return '<div class=\"page-narrow\"><div class=\"pin-gate\">' +\n    '<div class=\"boot-emoji\">🔒</div>' +\n    '<h3>家长模式</h3>' +\n    '<p class=\"hint\">请输入 4 位家长密码</p>' +\n    (stillDefault\n      ? '<p class=\"hint\" style=\"margin:-.3rem 0 0\">初始密码 <b>1234</b>，进来后建议在「基本设置」里改掉</p>'\n      : '') +\n    '<div class=\"pin-dots\">' + dots + '</div>' +\n    '<div class=\"keypad\">' + pad + '</div>' +\n    '<p class=\"hint\" style=\"margin:.8rem 0 0\">电脑上也可以直接敲数字键，' +\n      'Backspace 退一位、Delete 清空</p>' +\n    '</div></div>';\n}\n\n/** 本周七天的日期条，点哪天就编辑哪天；两边可以翻到上一周 / 下一周 */\nfunction weekStrip() {\n  const today = C.todayKey();\n  const keys = C.weekKeys(S.date);\n  const cells = keys.map(function (k) {\n    const d = C.parseDateKey(k);\n    const cn = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];\n    const cls = ['wk-cell'];\n    if (k === S.date) cls.push('on');\n    if (k === today) cls.push('today');\n    return '<button class=\"' + cls.join(' ') + '\" data-act=\"date-set\" data-date=\"' + k + '\">' +\n      '<em>周' + cn + '</em>' +\n      '<b>' + d.getDate() + '</b>' +\n      (k === today ? '<span class=\"wk-dot\"></span>' : '') +\n    '</button>';\n  }).join('');\n\n  return '<div class=\"week-bar\">' +\n      '<button class=\"icon-btn sm\" data-act=\"date-shift\" data-days=\"-7\" title=\"往前翻一周\">‹</button>' +\n      '<div class=\"week-strip\">' + cells + '</div>' +\n      '<button class=\"icon-btn sm\" data-act=\"date-shift\" data-days=\"7\" title=\"往后翻一周\">›</button>' +\n    '</div>' +\n    '<div class=\"week-hint\">' +\n      '<span class=\"wk-text\">' + C.friendlyDate(S.date) + ' · ' + C.weekdayCN(S.date) +\n        (S.date === today ? '' : ' · 不是今天') + '</span>' +\n      (S.date !== today ? '<button class=\"chip\" data-act=\"date-today\">回到今天</button>' : '') +\n    '</div>';\n}\n\n/** 家长端顶部那条「有 N 件事等你确认」，按钮一律靠右 */\nfunction askBanner(count) {\n  if (!count) return '';\n  return '<div class=\"form-card ask-banner\" style=\"margin-bottom:.8rem;background:#fff8e6;border:.1rem solid #ffe0a3\">' +\n    '<span class=\"ask-text\">有 <b>' + count + '</b> 件事等你确认</span>' +\n    '<button class=\"btn primary sm\" data-act=\"' + (S.parentTab === 'confirm' ? 'scroll-waiting' : 'parent-tab') + '\"' +\n      (S.parentTab === 'confirm' ? '' : ' data-tab=\"confirm\"') + '>去确认</button>' +\n  '</div>';\n}\n\nfunction parentHomework() {\n  const st = S.state;\n  const day = C.getDay(st, S.date);\n\n  const subjectOpts = C.SUBJECTS.map(function (s) {\n    return '<option value=\"' + esc(s.name) + '\">' + s.emoji + ' ' + esc(s.name) + '</option>';\n  }).join('');\n\n  const list = day.homeworks.map(function (h, i) {\n    const m = C.subjectMeta(h.subject);\n    const pts = h.points != null ? h.points : (st.settings.homeworkPoints || 0);\n    const badges = '<span class=\"badge ' + (h.done ? 'ok' : 'pts') + '\">' +\n        (h.done ? '✓ 完成' : '完成') + ' +' + pts + '⭐</span>' +\n      (h.done && !h.confirmed ? '<span class=\"badge wait\">⏳ 等确认</span>' : '');\n    // ☆ 把这一条（含备注）存进常用作业库 / 每日任务（第 76 轮：点一下先选存哪儿）\n    const star = '<button class=\"act-btn on\" data-act=\"to-common\" data-kind=\"homework\"' +\n      ' data-id=\"' + esc(h.id) + '\"' +\n      ' title=\"添加到常用\">☆</button>';\n    /*\n     * 「复制到今天」：只有**在看别的日期**时才出现（看今天的时候复制到今天没意义）。\n     * 复制过去是今天新的一条：打勾和确认状态清空、不重复发小红花。\n     */\n    /*\n     * 「复制到今天」：只有**在看别的日期**时才出现（看今天的时候复制到今天没意义）。\n     * 做成和「修改」那排一样的图标按钮 —— 文字按钮（复制到今天 = 5 个字）会把\n     * 标题挤成竖排（一排 6 个控件在 375px 屏幕上放不下）。\n     */\n    const copy = (S.date === C.todayKey())\n      ? ''\n      : '<button class=\"act-btn info\" data-act=\"hw-copy-one\" data-id=\"' + esc(h.id) + '\"' +\n        ' title=\"复制到今天\">📋</button>';\n    return rowItem({\n      cls: h.done ? 'done' : '',\n      face: m.emoji,\n      subject: h.subject, color: m.color, title: h.title,\n      note: h.detail ? esc(h.detail) : '',\n      badges: badges,\n      // 附件直接铺在备注下面（一行两个），不再加「📎 要求」这类小标题\n      att: attachChipsForRow(h, 'homework', h.id),\n      tools: rowTools('homework', h.id, i, day.homeworks.length, 'hw-edit', 'hw-del', star + copy),\n    });\n  }).join('');\n\n  // 常用作业库：按科目分组，点一下「加」就到今天\n  const commonList = (st.commonHomeworks || []).map(function (ch, i) {\n    const m = C.subjectMeta(ch.subject);\n    return rowItem({\n      cls: 'common-item',\n      face: m.emoji,\n      subject: ch.subject, color: m.color,\n      title: ch.title,\n      note: ch.detail ? esc(ch.detail) : '',\n      // 库里存的附件也摆出来（点「加」时会一起带到当天）\n      att: C.normalizeAttachments(ch.attachments).length\n        ? '<div class=\"att-box row-att\"><div class=\"att-list\">' +\n            C.normalizeAttachments(ch.attachments).map(function (a) {\n              return attachChip(a, { cls: 'req' });\n            }).join('') +\n          '</div></div>'\n        : '',\n      badges: '',\n      // 和「任务奖励」「今天的作业」用同一个 rowTools：↑↓ 排序 + ✎ ✕，\n      // 尺寸和配色完全一致，不单独发明一套\n      tools: rowTools('common', ch.id, i, (st.commonHomeworks || []).length,\n        'common-edit', 'common-del',\n        '<button class=\"act-btn on\" data-act=\"common-use\" data-id=\"' + esc(ch.id) + '\"' +\n          ' title=\"加进这一天\">加</button>'),\n    });\n  }).join('');\n\n  const preview = S.preview.map(function (p, i) {\n    const m = C.subjectMeta(p.subject);\n    return '<div class=\"preview-item\" data-act=\"preview-edit\" data-i=\"' + i + '\" title=\"点这一条可以改\">' +\n      '<span class=\"pi-emoji\">' + m.emoji + '</span>' +\n      '<div class=\"pi-title\">' + esc(p.title) +\n        (p.detail ? '<div class=\"pi-sub\">' + esc(p.detail) + '</div>' : '') + '</div>' +\n      '<span class=\"badge soft\">' + esc(p.subject) + '</span>' +\n      '<button class=\"act-btn info\" data-act=\"preview-edit\" data-i=\"' + i + '\" title=\"修改\">✎</button>' +\n      '<button class=\"act-btn danger\" data-act=\"preview-del\" data-i=\"' + i + '\" title=\"不要这一条\">✕</button>' +\n    '</div>';\n  }).join('');\n\n  return '' +\n    weekStrip() +\n\n    '<section class=\"panel\">' +\n      /* 三种录入方式收成页签：一次只看一个，页面短很多。\n         选中的那个记在 S.addTab（默认粘贴，最常用）。\n         页签贴在下面的白卡上（.add-tabs 的样式），不是顶部那种导航药丸。 */\n      '<div class=\"panel-head\"><h2>✏️ 录入作业</h2></div>' +\n      '<div class=\"subtabs add-tabs\">' +\n        '<button class=\"subtab' + (S.addTab === 'manual' || S.addTab === 'common' ? '' : ' on') +\n          '\" data-act=\"add-tab\" data-tab=\"paste\">📋 从钉钉粘贴</button>' +\n        '<button class=\"subtab' + (S.addTab === 'manual' ? ' on' : '') + '\" data-act=\"add-tab\" data-tab=\"manual\">' +\n          '✍️ 手动加一条</button>' +\n        '<button class=\"subtab' + (S.addTab === 'common' ? ' on' : '') + '\" data-act=\"add-tab\" data-tab=\"common\">' +\n          '⭐ 从常用作业库</button>' +\n      '</div>' +\n\n      (S.addTab === 'manual'\n        ? '<div class=\"form-card\">' +\n            '<p class=\"hint hint-lead\" style=\"margin-bottom:.5rem\">' +\n              '临时想起来的一条，直接写在这里；点击作业列表中的 ☆ 也能存进常用库或每日任务；' +\n              '老师发的卷子照片、要跟读的音频作为附件上传。</p>' +\n            '<div class=\"form-row\">' +\n              '<select class=\"field sm\" id=\"add-subject\" style=\"flex:0 0 7rem\">' + subjectOpts + '</select>' +\n              '<input class=\"field\" id=\"add-title\" style=\"min-width:9rem\" placeholder=\"要做什么，例如：背诵第 5 课\">' +\n            '</div>' +\n            '<div class=\"form-row\">' +\n              '<textarea class=\"field\" id=\"add-detail\" rows=\"3\" maxlength=\"500\" placeholder=\"备注（可留空，可以写好几行），例如：&#10;家长签字&#10;明天带红领巾\"></textarea>' +\n            '</div>' +\n            /*\n             * 附件：老师发的卷子照片、要跟读的音频、要看的视频都能挂上来，\n             * 孩子那边点开就能看。文件先传上去，点「添加到这一天」时才跟着作业一起存。\n             * 这里**不再单独写一句提示** —— 上面那句里已经说了\"作为附件上传\"，\n             * 再说一遍是重复（家长要的就是合并成一句）。\n             */\n            draftAttachHTML() +\n            '<div class=\"btn-row right\">' +\n              '<button class=\"btn primary sm\" data-act=\"hw-add\">添加到这一天</button>' +\n              '<button class=\"btn ghost sm\" data-act=\"hw-add-common\">添加并存进常用库</button>' +\n            '</div>' +\n          '</div>'\n        : (S.addTab === 'common'\n          ? '<div class=\"form-card\">' +\n              '<p class=\"hint hint-lead\" style=\"margin-bottom:.5rem\">平时翻来覆去就那几样，先存进库里，以后点「加」就好。<br>' +\n                '想往库里加新的，去「手动加一条」用「添加并存进常用库」。</p>' +\n              (commonList || emptyBox('⭐', '常用作业库还是空的，先去「手动加一条」加几条吧')) +\n            '</div>'\n          : '<div class=\"form-card\">' +\n              '<p class=\"hint hint-lead\" style=\"margin-bottom:.5rem\">在钉钉里长按作业消息 → 复制 → 粘到下面，点「智能识别」。<br>' +\n                '能认出「语文：…」「【数学】…」「1. 英语…」「数学作业：」这些写法。</p>' +\n              '<textarea class=\"field\" id=\"paste-box\" placeholder=\"例如：&#10;语文：背诵《静夜思》，家长签字&#10;数学：口算练习册 P20&#10;英语：跟读 Unit 3，读三遍\"></textarea>' +\n              '<div class=\"btn-row right\" style=\"margin-top:.6rem\">' +\n                '<button class=\"btn primary sm\" data-act=\"parse\">🔍 智能识别</button>' +\n                '<button class=\"btn ghost sm\" data-act=\"parse-add\">⚡ 识别并直接添加</button>' +\n              '</div>' +\n              (S.preview.length ?\n                '<div style=\"margin-top:.8rem\">' +\n                  '<div class=\"panel-head\"><h2 style=\"font-size:.95rem\">识别结果（' + S.preview.length + ' 条）</h2></div>' +\n                  '<p class=\"hint\" style=\"margin-bottom:.4rem\">识别得不对的直接点那一条就能改，不要的点 ✕ 删掉。</p>' +\n                  preview +\n                  '<div class=\"btn-row\" style=\"margin-top:.5rem\">' +\n                    '<button class=\"btn ok sm\" data-act=\"preview-commit\">✓ 全部添加到' + C.friendlyDate(S.date) + '</button>' +\n                    '<button class=\"btn ghost sm\" data-act=\"preview-clear\">清空</button>' +\n                  '</div>' +\n                '</div>' : '') +\n            '</div>')) +\n    '</section>' +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>📚 ' + C.friendlyDate(S.date) + '的作业（' + day.homeworks.length + '）</h2>' +\n      '</div>' +\n      (S.date === C.todayKey()\n        ? ''\n        // 显式断成两行：不依赖屏幕宽度，两行的行首都由 .hint-lead 缩进到同一个位置\n        : '<p class=\"hint hint-lead\" style=\"margin-bottom:.5rem\">这一条想留到今天做？点那一条右边的 📋（复制到今天），<br>' +\n          '会作为今天的新作业加进去（打勾状态清空，不会重复发小红花）。</p>') +\n      (list || emptyBox('📭', '这一天还没有作业')) +\n    '</section>' +\n\n    // 孩子自己加的「额外任务」——家长能调顺序、改内容、删掉\n    (day.extras.length ?\n      '<section class=\"panel\">' +\n        '<div class=\"panel-head\"><h2>✨ 额外的任务（' + day.extras.length + '）</h2></div>' +\n        '<p class=\"hint hint-lead extras-tip\">这些是孩子自己在「今天」页加的。' +\n          '不合适可编辑或删除，或者调一下顺序。</p>' +\n        day.extras.map(function (e, i) {\n          return rowItem({\n            cls: e.done ? 'done' : '',\n            face: e.emoji || '✨',\n            title: e.title,\n            badges: '<span class=\"badge ' + (e.done ? 'ok' : 'pts') + '\">' +\n                (e.done ? '✓ 完成' : '完成') + ' +' + (e.points || 1) + '⭐</span>' +\n              (e.done && !e.confirmed ? '<span class=\"badge wait\">⏳ 等确认</span>' : ''),\n            tools: rowTools('extras', e.id, i, day.extras.length, 'extra-edit', 'extra-del'),\n          });\n        }).join('') +\n      '</section>' : '') +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>💬 给孩子留句话</h2></div>' +\n      '<div class=\"form-card\">' +\n        // 高度要能完整看到 placeholder 里那 4 行（实测需要 ~158px）\n        // maxlength 必须和后端 day.note 的 slice(0, 300) 对齐：\n        // 不加的话靠后端截断，家长写超了**尾巴会静默消失**，界面上没任何提示\n        '<textarea class=\"field\" id=\"note-box\" maxlength=\"300\" style=\"min-height:10rem\" placeholder=\"' + NOTE_PLACEHOLDER + '\">' + esc(day.note) + '</textarea>' +\n        '<div class=\"btn-row\" style=\"margin-top:.5rem\"><button class=\"btn primary sm\" data-act=\"note-save\">保存留言</button></div>' +\n      '</div>' +\n    '</section>';\n}\n\n/** 家长端统一显示完整时间：2026-10-09 11:20:33 */\nfunction fullTime(ts) {\n  if (!ts) return '';\n  const d = new Date(ts);\n  return d.getFullYear() + '-' + C.pad2(d.getMonth() + 1) + '-' + C.pad2(d.getDate()) + ' ' +\n    C.pad2(d.getHours()) + ':' + C.pad2(d.getMinutes()) + ':' + C.pad2(d.getSeconds());\n}\n\nfunction parentConfirm() {\n  const st = S.state;\n  const items = parentItems(S.date);\n  const waiting = items.filter(function (x) { return x.rec.done && !x.rec.confirmed; });\n  const done = items.filter(function (x) { return x.rec.confirmed; });\n  /*\n   * 撤销过的（选了理由、只写了说明、什么都没选直接撤回，或者**打勾被撤回了**）。\n   *\n   * 第 92 轮补上 `undoneAt`：原来只认 `undoKind/undoReason`，\n   * 而「撤回打勾」这条路径只写 `undoneAt` —— 结果那样的记录\n   * 待确认里没有（done=false）、已确认里也没有、已撤销里还是没有，\n   * **三个列表全都不显示**，只有小红花流水里留下 +2 / -2 一对，\n   * 家长看着就是\"这条记录哪来的\"。见 2026-10-19 的「绿豆成长日记」。\n   */\n  const undone = items.filter(function (x) {\n    return !x.rec.done && (x.rec.undoKind || x.rec.undoReason || x.rec.undoneAt);\n  });\n  // 孩子提出的兑换申请也算\"等家长表态\"，和待确认放在一起\n  const asks = st.redemptions.filter(function (r) { return r.status === 'pending'; });\n\n  function row(x, actions) {\n    return rowItem({\n      cls: x.rec.confirmed ? 'done' : '',\n      face: x.emoji,\n      subject: x.sub, color: x.color, title: x.title,\n      /*\n       * 顺序按家长的要求来：标题 → 孩子传的附件 → 等确认状态和日期时间。\n       * 附件放在徽章**上面**，因为\"确认\"之前得先看孩子交了什么。\n       */\n      att: C.normalizeAttachments(x.rec.works).length\n        ? '<div class=\"att-box row-att\"><div class=\"att-list\">' +\n            C.normalizeAttachments(x.rec.works).map(function (a) {\n              return attachChip(a, { cls: 'work', removeAct: 'hw-att-del', itemId: x.id,\n                kind: x.kind, scope: 'work' });\n            }).join('') +\n          '</div></div>'\n        : '',\n      /*\n       * 这一行只有状态 + 时间两种东西，就按原样排。\n       *\n       * 试过在它前面补「小红花」和「📅 长期」，结果这一行放不下、\n       * 时间被挤到第二行去了（待确认行右边还有两个宽按钮）。用户要的是\n       * \"有这几类标签时按 小红花→截止→状态 排\"，这里本来就没有那两类，\n       * 硬加反而把版式弄坏 —— 所以保持原样。\n       */\n      badges: '<span class=\"badge ' + (x.rec.confirmed ? 'ok' : 'wait') + '\">' +\n          (x.rec.confirmed ? '✓ 已确认' : '⏳ 等确认') + '</span>' +\n        '<span class=\"ri-time\">' + fullTime(x.rec.confirmedAt || x.rec.doneAt) + '</span>',\n      tools: actions,\n    });\n  }\n\n  const askHTML = asks.map(function (r) {\n    return rowItem({\n      cls: 'ask',\n      face: r.emoji,\n      subject: '兑换', color: '#c4841a',\n      title: r.title,\n      badges: '<span class=\"badge wait\">想用 ' + r.cost + ' ⭐ 兑换</span>' +\n        '<span class=\"ri-time\">' + fullTime(r.ts) + '</span>',\n      tools: '<button class=\"act-btn wide danger\" data-act=\"redeem-reject\" data-id=\"' + esc(r.id) + '\" title=\"驳回\">驳回</button>' +\n        '<button class=\"act-btn wide on\" data-act=\"redeem-fulfill\" data-id=\"' + esc(r.id) + '\" title=\"兑现\">兑现</button>',\n    });\n  }).join('');\n\n  const waitingHTML = waiting.map(function (x) {\n    return row(x,\n      '<button class=\"act-btn wide\" data-act=\"undo-item\" data-kind=\"' + x.kind + '\" data-id=\"' + esc(x.id) + '\" title=\"撤销\">撤销</button>' +\n      '<button class=\"act-btn wide on\" data-act=\"confirm-item\" data-kind=\"' + x.kind + '\" data-id=\"' + esc(x.id) + '\" title=\"确认\">确认</button>');\n  }).join('');\n\n  const doneHTML = done.map(function (x) {\n    return row(x,\n      '<button class=\"act-btn wide info\" data-act=\"unconfirm-item\" data-kind=\"' + x.kind + '\" data-id=\"' + esc(x.id) + '\" title=\"取消确认\">取消</button>');\n  }).join('');\n\n  /*\n   * 已兑现的兑换也算\"已确认\"，但**只显示当天兑现的那些**（第 92 轮）。\n   * 原来是全部列出来（还只截前 8 条），日子一长就越堆越多，\n   * 家长在\"今天\"这一页看到一堆上个月的兑换，分不清哪些是今天的。\n   * 待处理（pending）的则**一直显示**，直到家长点「兑现 / 驳回」为止。\n   */\n  const dayOf = function (r) { return C.dateKey(new Date(r.resolvedAt || r.ts)); };\n  const doneRedeem = st.redemptions.filter(function (r) {\n    return r.status === 'done' && dayOf(r) === S.date;\n  });\n  const doneRedeemHTML = doneRedeem.map(function (r) {\n    return rowItem({\n      cls: 'done',\n      face: r.emoji,\n      subject: '兑换', color: '#21b573',\n      title: r.title,\n      badges: '<span class=\"badge ok\">✓ 已兑现</span>' +\n        '<span class=\"ri-time\">' + fullTime(r.resolvedAt || r.ts) + '</span>' +\n        '<span class=\"ri-time\">花掉 ' + r.cost + '⭐</span>',\n      tools: '<button class=\"act-btn wide info\" data-act=\"redeem-undo\" data-id=\"' + esc(r.id) + '\" title=\"退回待处理\">取消</button>',\n    });\n  }).join('');\n\n  const doneAll = doneHTML + doneRedeemHTML;\n  const doneCount = done.length + doneRedeem.length;\n\n  // 撤销过的：把理由摆出来，方便家长对照；「任务取消」的还能恢复\n  const undoneHTML = undone.map(function (x) {\n    const isCancel = x.rec.undoKind === 'cancel';\n    const isRedo = x.rec.undoKind === 'redo';\n    // 两个理由都没选 = 直接撤回，没有定性；连理由都没有、只有 undoneAt = 撤销时没写理由\n    const hasKind = Boolean(x.rec.undoKind || x.rec.undoReason);\n    const what = isCancel ? '任务取消' : isRedo ? '再完善作业'\n      : hasKind ? '直接撤回' : '撤回了（没写理由）';\n    return rowItem({\n      cls: 'off',\n      face: x.emoji,\n      subject: x.sub, color: '#b8a893', title: x.title,\n      note: what +\n        (x.rec.undoReason ? '：' + esc(x.rec.undoReason) : '') +\n        '<div class=\"ri-time\">' + fullTime(x.rec.undoneAt) + '</div>',\n      badges: '<span class=\"badge ' + (isCancel ? 'soft' : 'wait') + '\">' +\n        (isCancel ? '🚫 孩子不用再做了' : isRedo ? '🔁 孩子要重新做' : '↩️ 孩子回到没做的状态') + '</span>',\n      tools: '<button class=\"act-btn wide info\" data-act=\"restore-item\" data-kind=\"' + x.kind +\n        '\" data-id=\"' + esc(x.id) + '\" title=\"恢复成普通状态\">恢复</button>',\n    });\n  }).join('');\n\n  // 「有 N 件事等你确认」那条横幅由 viewParent 统一渲染，这里不用再放一遍\n  return weekStrip() +\n    (asks.length ?\n      '<section class=\"panel\">' +\n        '<div class=\"panel-head\"><h2>🎁 孩子想兑换（' + asks.length + '）</h2></div>' +\n        askHTML +\n      '</section>' : '') +\n    '<section class=\"panel\" id=\"sec-waiting\">' +\n      '<div class=\"panel-head\"><h2>⏳ 待确认（' + waiting.length + '）</h2><span class=\"spacer\"></span>' +\n        (waiting.length ? '<button class=\"chip ok\" data-act=\"confirm-all\">✓ 全部确认</button>' : '') +\n      '</div>' +\n      (waitingHTML || emptyBox('👍', '孩子还没有新完成的作业或任务')) +\n    '</section>' +\n    (undone.length ?\n      '<section class=\"panel\" id=\"sec-undone\">' +\n        '<div class=\"panel-head\"><h2>🔄 已撤销（' + undone.length + '）</h2></div>' +\n        '<p class=\"hint hint-lead\" style=\"margin-bottom:.5rem\">理由孩子那边也看得到。' +\n          '「任务取消」的孩子做不了，「再完善」的孩子能重新做。</p>' +\n        undoneHTML +\n      '</section>' : '') +\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>✅ 已确认（' + doneCount + '）</h2></div>' +\n      (doneAll || emptyBox('✅', '还没有已确认的作业或任务')) +\n    '</section>' +\n    // 评价放在最后：先把当天的事确认完，再回过头来写评价\n    reviewPanel();\n}\n\n/**\n * 「今日学习评价」——家长根据当天表现写一段话，顺手奖励或扣除小红花。\n *\n * 分值可以填负数（扣分）。改来改去不会算重复：core 里的 day.review\n * 会先把上一次的加减撤回再应用新的。\n *\n * 显示的加减一律「符号在前」（+2 / -1），不再写成「扣除 -1」——\n * 「扣除 + 负数」看着像绕口令，容易读反。\n */\nfunction reviewPanel() {\n  const day = C.getDay(S.state, S.date);\n  const rv = day.review;\n  const pts = rv ? (Number(rv.points) || 0) : 0;\n  const ptsTxt = pts === 0 ? '不加减' : (pts > 0 ? '+' + pts : String(pts)) + ' ⭐';\n\n  return '<section class=\"panel\">' +\n    '<div class=\"panel-head\"><h2>📝 今日学习评价</h2><span class=\"spacer\"></span>' +\n      (rv && (rv.text || pts)\n        ? '<button class=\"chip info\" data-act=\"review-edit\">修改</button>'\n        : '') +\n    '</div>' +\n    (rv && (rv.text || pts)\n      ? '<div class=\"form-card\">' +\n          '<p class=\"review-text\">' + esc(rv.text || '（没写评语）') + '</p>' +\n          '<div class=\"btn-row\" style=\"margin-top:.5rem\">' +\n            '<span class=\"badge ' + (pts > 0 ? 'ok' : (pts < 0 ? 'wait' : 'soft')) + '\">' + ptsTxt + '</span>' +\n            '<span class=\"ri-time\" style=\"margin-left:auto\">' + fullTime(rv.at) + '</span>' +\n          '</div>' +\n        '</div>'\n      : '<div class=\"form-card\">' +\n          '<p class=\"hint hint-lead\" style=\"margin-bottom:.5rem\">' +\n            '可以从这几方面写：<b>自主性</b>、<b>态度</b>、<b>注意力</b>、<b>易错内容</b>、<b>后续建议</b>。</p>' +\n          // 高度要能完整看到 placeholder 里的那 6 行示例，再加半行\n          // maxlength 对齐后端 day.review 的 slice(0, 300)，别让尾巴被静默切掉\n          '<textarea class=\"field\" id=\"review-box\" maxlength=\"300\" style=\"min-height:10.5rem\" ' +\n            'placeholder=\"例如：&#10;自主性：回家先自己拿出作业本，不用催&#10;态度：写字有点急&#10;注意力：中间起来喝水两次&#10;易错：b / d 又混了&#10;建议：明天先读一遍再写\"></textarea>' +\n          '<div class=\"review-points-row\">' +\n            '<label>小红花</label>' +\n            numBox({ id: 'review-points', value: '0', min: -50, max: 50,\n              title: '正数是奖励，负数是扣除，填 0 就是只写评语' }) +\n            '<span class=\"hint\" title=\"正数是奖励、负数是扣除、填 0 就是只写评语\">正数奖、负数扣、0不变</span>' +\n            '<button class=\"btn primary sm\" data-act=\"review-save\">保存评价</button>' +\n          '</div>' +\n        '</div>') +\n  '</section>';\n}\n\n\nfunction parentTasks() {\n  const st = S.state;\n  const today = C.todayKey();\n  /*\n   * 已软删除的任务不在列表里显示（第 91 轮）。注意**不能先 filter 再 map** ——\n   * ↑↓ 按钮用的是 map 出来的下标 i，过滤掉会让下标错位、点了排错条。\n   * 所以照旧 map（拿到正确的 i），返回 null 标记已删除，最后 filter 掉。\n   */\n  const rows = st.dailyTasks.map(function (t, i) {\n    if (t.deleted) return null;\n    const off = t.active === false;              // 家长手动停用\n    /*\n     * 第 81 轮：**今天在不在有效期内**决定它显不显示给孩子（第 2/3 条）。\n     * 不在有效期 → 显示成「停用」（灰掉），但数据一条都不删。\n     */\n    const inSched = C.taskActiveOn(t, today, st.settings.holidays);\n    const pausedBySched = !off && !inSched;\n    const tm = C.taskTagMeta(t.tag);\n    // 「停用」也是动作按钮之一，跟 ↑↓✎✕ 排在同一行同一尺寸\n    const toggle = '<button class=\"act-btn' + (off ? ' info' : '') + '\" data-act=\"task-toggle\"' +\n      ' data-id=\"' + esc(t.id) + '\" title=\"' + (off ? '点击启用' : '点击停用') + '\">' +\n      (off ? '启' : '停') + '</button>';\n    /*\n     * 标签放在和作业科目**同一个位置**（rowItem 的 subject），样式也一样。\n     * 状态不再顶掉标签，改成标签栏里的一枚小牌子 ——\n     * 这样\"这条是什么类别的\"和\"它现在什么状态\"能同时看到。\n     */\n    let badges = '<span class=\"badge pts\">完成 +' + t.points + '⭐</span>';\n    // 有效期（第 81 轮 5）：按有效期显示，多个特定日期只显示最近两个 + …\n    const schedText = C.schedLabel(t, today);\n    badges += '<span class=\"badge soft\">📅 ' + esc(schedText) + '</span>';\n    if (off) badges += '<span class=\"badge wait\">已停用</span>';\n    else if (pausedBySched) badges += '<span class=\"badge soft\">今天不在有效期</span>';\n    return rowItem({\n      cls: (off || pausedBySched) ? 'off' : '',\n      face: t.emoji,\n      title: t.title,\n      note: t.note ? esc(t.note) : '',\n      subject: t.tag || '', color: tm.color,\n      // 附件铺在备注下面（一行两个），位置和作业行完全一样（第 75 轮 1）\n      att: attachChipsForRow({ attachments: t.attachments, works: [] }, 'task', t.id),\n      badges: badges,\n      tools: rowTools('tasks', t.id, i, st.dailyTasks.length, 'task-edit', 'task-del',\n        // ☆ 添加到常用（第 76 轮 1）：任务列表里也能存 —— 存进常用库，或者再复制一条每日任务\n        '<button class=\"act-btn on\" data-act=\"to-common\" data-kind=\"task\" data-id=\"' +\n          esc(t.id) + '\" title=\"添加到常用\">☆</button>' + toggle),\n    });\n  }).filter(Boolean).join('');\n\n  return '<section class=\"panel\">' +\n    '<div class=\"panel-head\"><h2>🌟 每天的固定任务</h2><span class=\"spacer\"></span>' +\n      '<button class=\"btn primary sm\" data-act=\"task-add\">➕ 新增</button></div>' +\n    '<p class=\"hint hint-lead\" style=\"margin-bottom:.6rem\">这些任务会按这个顺序出现在孩子的页面上：' +\n      '功课 → 生活 → 精神 → 自己加的标签。<br>' +\n      '↑↓ 调顺序，✎ 改内容，✕ 删掉，「停用」是暂时不显示、以后还能用。<br>' +\n      '「有效期」默认长期。可以设成：具体某几天 / 每周几、法定节假日 / 一段日期 —— ' +\n      '不在有效期的那天就自动不显示，<b>历史记录一条都不删</b>，翻回去看还是有的。</p>' +\n    (rows || emptyBox('🌟', '还没有每日任务')) +\n    '</section>';\n}\n\nfunction parentRewards() {\n  const st = S.state;\n  const rows = st.rewards.map(function (r, i) {\n    const off = r.active === false;\n    // 「停用」跟每日任务那边完全一样：同一个 .act-btn、同一个位置、同一套文字\n    const toggle = '<button class=\"act-btn' + (off ? ' info' : '') + '\" data-act=\"reward-toggle\"' +\n      ' data-id=\"' + esc(r.id) + '\" title=\"' + (off ? '点击启用' : '点击停用') + '\">' +\n      (off ? '启' : '停') + '</button>';\n    return rowItem({\n      cls: off ? 'off' : '',\n      face: r.emoji,\n      title: r.title,\n      subject: off ? '已停用' : '', color: '#b8a893',\n      badges: '<span class=\"badge pts\">需要 ' + r.cost + ' ⭐</span>',\n      tools: rowTools('rewards', r.id, i, st.rewards.length, 'reward-edit', 'reward-del', toggle),\n    });\n  }).join('');\n\n  const pending = st.redemptions.filter(function (r) { return r.status === 'pending'; });\n  const pendingHTML = pending.map(function (r) {\n    return rowItem({\n      cls: 'ask',\n      face: r.emoji,\n      subject: '兑换', color: '#c4841a', title: r.title,\n      note: fullTime(r.ts),\n      badges: '<span class=\"badge wait\">孩子想用 ' + r.cost + ' ⭐ 兑换</span>',\n      tools: '<button class=\"act-btn wide danger\" data-act=\"redeem-reject\" data-id=\"' + esc(r.id) + '\" title=\"驳回\">驳回</button>' +\n        '<button class=\"act-btn wide on\" data-act=\"redeem-fulfill\" data-id=\"' + esc(r.id) + '\" title=\"兑现\">兑现</button>',\n    });\n  }).join('');\n\n  const offCount = st.rewards.filter(function (r) { return r.active === false; }).length;\n\n  return '<section class=\"panel\">' +\n      '<div class=\"panel-head\">' +\n        '<h2>🎁 奖励清单</h2>' +\n        '<span class=\"spacer\"></span>' +\n        '<button class=\"btn primary sm\" data-act=\"reward-add\">➕ 新增</button>' +\n      '</div>' +\n      '<p class=\"hint hint-lead\" style=\"margin-bottom:.6rem\">孩子攒够小红花就能自己兑换，你收到通知后兑现。<br>' +\n        '「停用」是暂时不给孩子看到，以后还能启用；' +\n        '<b>已经拿到的小红花和兑奖记录都不受影响</b>。</p>' +\n      (rows || emptyBox('🎁', '还没有奖励')) +\n      (offCount ? '<p class=\"hint\" style=\"margin-top:.5rem\">已停用 ' + offCount + ' 个，孩子那边看不到。</p>' : '') +\n    '</section>' +\n    (pending.length ? '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>⏳ 孩子想兑换（' + pending.length + '）</h2></div>' +\n      pendingHTML + '</section>' : '');\n}\n\n/** 房间列表里的时间：今天只显示时分，别的显示月日 */\nfunction shortTime(ts) {\n  if (!ts) return '';\n  const d = new Date(ts);\n  const now = new Date();\n  const sameDay = d.toDateString() === now.toDateString();\n  const hm = C.pad2(d.getHours()) + ':' + C.pad2(d.getMinutes());\n  return sameDay ? ('今天 ' + hm) : ((d.getMonth() + 1) + '月' + d.getDate() + '日');\n}\n\n/** 设置页最上面那块「🏠 房间」 */\nfunction roomSection() {\n  const st = S.state;\n  const currentName = C.roomNameOf(st);\n  const link = location.origin + location.pathname + '?room=' + S.room;\n\n  /* ---- 房间列表 ---- */\n  let listHTML = '';\n  const local = knownRooms();\n  const admin = S.adminState;\n\n  // 进这个页面就自动拉一次（列表是开放的，不需要任何口令）\n  if (admin == null && !S.adminLoading) {\n    S.adminLoading = true;\n    setTimeout(loadAdminState, 0);\n  }\n\n  if (S.roomListLoading || (admin == null && S.roomList == null)) {\n    listHTML = '<p class=\"hint\">正在读取房间列表…</p>';\n  } else if (S.roomList && S.roomList.length) {\n    const only = S.roomList.length <= 1;\n    const list = currentFirst(S.roomList);\n    const mine = list.filter(function (r) { return r.code === S.room; });\n    const others = list.filter(function (r) { return r.code !== S.room; });\n    const open = Boolean(S.othersOpen);\n\n    // 正在使用的那个永远摊开，它的中间区域就是\"展开 / 收起其他房间\"的开关\n    listHTML = mine.map(function (r) {\n      return roomRow(r, 'server', only, others.length > 0);\n    }).join('');\n\n    if (others.length) {\n      if (open) {\n        // 展开：所有房间都是完整的一行，能改能删能切\n        listHTML += '<div class=\"room-others\">' +\n          others.map(function (r) { return roomRow(r, 'server', only); }).join('') +\n        '</div>';\n      } else {\n        // 折叠：一摞压在正在使用的下面，最多露 3 张，越往下越淡\n        listHTML += '<div class=\"room-stack\">' +\n          others.slice(0, 3).map(function (r) {\n            return '<button class=\"room-peek\" data-act=\"room-switch\" data-code=\"' + esc(r.code) + '\"' +\n              ' title=\"切到「' + esc(r.name || r.code) + '」\">' +\n              '<span class=\"rp-name\">' + esc(r.name || r.code) + '</span>' +\n              '<code>' + esc(r.code) + '</code>' +\n            '</button>';\n          }).join('') +\n        '</div>' +\n        (others.length > 3\n          ? '<p class=\"hint\" style=\"text-align:center;margin:.45rem 0 0\">还有 ' +\n            (others.length - 3) + ' 个房间，点上面那张卡片展开</p>'\n          : '');\n      }\n    }\n  } else if (S.roomList) {\n    listHTML = '<p class=\"hint\">服务器上只有这一个房间。</p>';\n  } else if (local.length) {\n    // 连不上服务器，退回到「这台设备见过的房间」\n    listHTML = currentFirst(local).map(function (r) { return roomRow(r, 'local', true); }).join('') +\n      '<p class=\"hint\">连不上服务器，上面是这台设备进过的房间。</p>';\n  } else {\n    listHTML = '<p class=\"hint\">读不到房间列表：' + esc(S.roomListErr || '未知原因') + '</p>';\n  }\n\n  return '<section class=\"panel\">' +\n    '<div class=\"panel-head\">' +\n      '<h2>🏠 房间</h2>' +\n      '<span class=\"spacer\"></span>' +\n      '<button class=\"btn primary sm\" data-act=\"room-new\" title=\"新建一个房间\">➕ 新建</button>' +\n      '<button class=\"btn ghost sm\" data-act=\"room-refresh\" title=\"刷新房间列表\">↻ 刷新</button>' +\n      '<button class=\"btn ghost sm\" data-act=\"admin-key\" title=\"设置/修改删除房间时的口令\">🔐 口令</button>' +\n    '</div>' +\n    '<p class=\"hint hint-lead\" style=\"margin-bottom:.6rem\">每个房间是一份独立的数据。</p>' +\n\n    '<div class=\"form-card\">' +\n      '<div class=\"form-row\"><label>房间名</label>' +\n        '<input class=\"field\" id=\"set-roomname\" maxlength=\"24\" value=\"' + esc(st.settings.roomName || '') + '\" ' +\n          'placeholder=\"' + esc(currentName) + '\"></div>' +\n      '<div class=\"form-row\"><label>孩子名字</label>' +\n        '<input class=\"field\" id=\"set-childname\" maxlength=\"12\" value=\"' + esc(st.settings.childName || '') + '\">' +\n        '<button class=\"btn primary sm\" data-act=\"room-save-mine\">保存</button></div>' +\n\n      '<div class=\"share-box\" style=\"margin-top:.7rem\"><b>房间码：' + esc(S.room) + '</b><br>' + esc(link) + '</div>' +\n      '<div class=\"btn-row\" style=\"margin-top:.6rem\">' +\n        '<button class=\"btn primary sm\" data-act=\"copy-link\">📋 复制网址</button>' +\n        '<button class=\"btn ghost sm\" data-act=\"copy-room\">复制房间码</button>' +\n      '</div>' +\n    '</div>' +\n\n    '<div class=\"panel-head indent-1\" style=\"margin-top:1rem\">' +\n      '<h2 style=\"font-size:.95rem\">房间列表</h2>' +\n    '</div>' +\n    listHTML +\n  '</section>';\n}\n\n/** 正在使用的那个房间排到最前面（其余保持服务器给的顺序） */\nfunction currentFirst(list) {\n  return (list || []).slice().sort(function (a, b) {\n    if (a.code === S.room) return -1;\n    if (b.code === S.room) return 1;\n    return 0;\n  });\n}\n\n/**\n * 房间列表里的一行。\n *   toggle=true 时，左边的中间区域变成「展开 / 收起其他房间」的开关\n *   （正在使用的那一行才传 true）。\n */\nfunction roomRow(r, src, onlyOne, toggle) {\n  const on = r.code === S.room;\n  const url = location.origin + location.pathname + '?room=' + r.code;\n  const localOnly = src === 'local';\n\n  // 正在使用的 / 只剩一个的都不给删：按钮灰掉，鼠标停上去说明原因\n  let del = '';\n  if (localOnly) {\n    del = '';\n  } else if (on) {\n    del = '<button class=\"room-act danger\" disabled title=\"正在使用的房间不能删除，先切到别的房间\">删除</button>';\n  } else if (onlyOne) {\n    del = '<button class=\"room-act danger\" disabled title=\"至少要保留一个房间\">删除</button>';\n  } else {\n    del = '<button class=\"room-act danger\" data-act=\"room-del\" data-code=\"' + esc(r.code) + '\"' +\n      ' data-name=\"' + esc(r.name || '') + '\">删除</button>';\n  }\n\n  return '<div class=\"room-row' + (on ? ' on' : '') + '\"' +\n      ' data-src=\"' + src + '\" data-code=\"' + esc(r.code) + '\">' +\n\n    '<div class=\"rr-main' + (toggle ? ' rr-toggle' : '') + '\"' +\n      (toggle ? ' data-act=\"room-toggle-others\" title=\"展开 / 收起其他房间\"' : '') + '>' +\n      '<div class=\"rr-head\">' +\n        '<div class=\"rr-name\">' +\n          // caret 跟名字包在同一个 inline 里，不然它会被 flex-wrap 挤到下一行\n          '<span class=\"rr-text\">' + esc(r.name || r.code) +\n            (toggle ? ' <i class=\"rr-caret\">' + (S.othersOpen ? '▴' : '▾') + '</i>' : '') +\n          '</span>' +\n          (on ? '<span class=\"badge ok\">正在使用</span>' : '') +\n        '</div>' +\n      '</div>' +\n      '<div class=\"rr-sub\">' +\n        '<code>' + esc(r.code) + '</code>' +\n        (localOnly\n          ? '<span class=\"ri-time\">本机记过的房间</span>'\n          : '<span class=\"ri-time\">' + esc(shortTime(r.updatedAt) || '还没动过') + '</span>' +\n            '<span class=\"ri-time\">' + (r.balance || 0) + '⭐</span>') +\n      '</div>' +\n    '</div>' +\n\n    '<div class=\"rr-tools\">' +\n      '<button class=\"room-act\" data-act=\"room-copy\" data-url=\"' + esc(url) + '\">复制网址</button>' +\n      (localOnly ? '' :\n        '<button class=\"room-act\" data-act=\"room-edit\" data-code=\"' + esc(r.code) + '\"' +\n          ' data-name=\"' + esc(r.name || '') + '\" data-child=\"' + esc(r.childName || '') + '\">编辑</button>' +\n        del +\n        (on ? '' : '<button class=\"room-act on\" data-act=\"room-switch\" data-code=\"' + esc(r.code) + '\">切换</button>')) +\n    '</div>' +\n  '</div>';\n}\n\n/** 房间列表里点 ✎：改别的房间的房间名 / 孩子名字 */\nfunction openRoomEditModal(code, name, child) {\n  const box = document.createElement('div');\n\n  function row(html) {\n    const d = document.createElement('div');\n    d.className = 'form-row';\n    d.innerHTML = html;\n    return d;\n  }\n\n  const nameRow = row('<label>房间名</label>' +\n    '<input class=\"field\" id=\"re-name\" maxlength=\"24\" placeholder=\"留空就跟着孩子名字走\">');\n  nameRow.querySelector('#re-name').value = name || '';\n  const childRow = row('<label>孩子名字</label>' +\n    '<input class=\"field\" id=\"re-child\" maxlength=\"12\" placeholder=\"宝贝\">');\n  childRow.querySelector('#re-child').value = child || '';\n\n  const tip = document.createElement('p');\n  tip.className = 'hint';\n  tip.textContent = '房间码 ' + code + ' 不能改，想换只能新建一个房间。';\n\n  box.appendChild(nameRow);\n  box.appendChild(childRow);\n  box.appendChild(tip);\n\n  openModal({\n    title: '编辑房间',\n    bodyNode: box,\n    actions: [\n      { label: '取消', cls: 'ghost', onClick: closeModal },\n      {\n        label: '保存',\n        cls: 'primary',\n        onClick: async function () {\n          try {\n            const j = await api('/api/room/' + encodeURIComponent(code) + '/rename?key=' +\n              encodeURIComponent(adminKey()), {\n              method: 'POST',\n              headers: { 'Content-Type': 'application/json' },\n              body: JSON.stringify({\n                name: nameRow.querySelector('#re-name').value.trim(),\n                childName: childRow.querySelector('#re-child').value.trim(),\n              }),\n            });\n            closeModal();\n            // 改的是当前房间就顺手刷一下本地状态，顶栏和列表立刻跟上\n            if (code === S.room) {\n              const n = nameRow.querySelector('#re-name').value.trim();\n              const c = childRow.querySelector('#re-child').value.trim() || '宝贝';\n              S.state.settings.roomName = n;\n              S.state.settings.childName = c;\n              const me = (S.roomList || []).filter(function (r) { return r.code === S.room; })[0];\n              if (me) {\n                me.name = C.roomNameOf({ settings: { roomName: n, childName: c } });\n                me.childName = c;\n              }\n              rememberRoom(S.room, C.roomNameOf({ settings: { roomName: n, childName: c } }));\n            }\n            toast('改好了');\n            loadRoomList();\n          } catch (e) {\n            toast((e && e.message) || '保存失败', 'warn');\n          }\n        },\n      },\n    ],\n  });\n}\n\n/** 删房间：破坏性操作。打一遍房间码；设过管理口令的话还要口令。 */\nfunction openRoomDeleteModal(code, name) {\n  const box = document.createElement('div');\n  const needKey = Boolean(S.adminState && S.adminState.configured && S.adminState.source !== 'env');\n  const envKey = Boolean(S.adminState && S.adminState.source === 'env');\n\n  const p = document.createElement('p');\n  p.className = 'hint';\n  p.style.margin = '0 0 .6rem';\n  p.innerHTML = '会把这个房间的<b>全部数据</b>（作业、小红花、兑换记录）一起删掉，' +\n    '<b>删了就找不回来了</b>。<br>确定的话，把房间码 <code>' + esc(code) + '</code> 打一遍。';\n  box.appendChild(p);\n\n  const row = document.createElement('div');\n  row.className = 'form-row';\n  row.innerHTML = '<input class=\"field\" id=\"rd-code\" placeholder=\"' + esc(code) + '\" autocapitalize=\"characters\">';\n  box.appendChild(row);\n  const input = row.querySelector('#rd-code');\n  input.addEventListener('input', function () {\n    const c = C.normalizeRoomCode(input.value);\n    if (input.value !== c) input.value = c;\n  });\n\n  let keyRow = null;\n  if (needKey || envKey) {\n    keyRow = document.createElement('div');\n    keyRow.className = 'form-row';\n    keyRow.innerHTML = '<label>管理口令</label>' +\n      '<input class=\"field\" id=\"rd-key\" type=\"password\" autocomplete=\"current-password\">';\n    box.appendChild(keyRow);\n  }\n\n  openModal({\n    title: '删除房间' + (name ? '「' + name + '」' : ''),\n    bodyNode: box,\n    actions: [\n      { label: '取消', cls: 'ghost', onClick: closeModal },\n      {\n        label: '确认删除',\n        cls: 'danger',\n        onClick: async function () {\n          if (C.normalizeRoomCode(input.value) !== code) {\n            toast('房间码没打对', 'warn');\n            return;\n          }\n          let key = '';\n          if (keyRow) {\n            key = keyRow.querySelector('#rd-key').value.trim();\n            if (!key) { toast('还要填管理口令', 'warn'); return; }\n          } else if (!envKey) {\n            key = adminKey();   // 没设口令就带空的，服务器也不会要\n          }\n          try {\n            await api('/api/room/' + encodeURIComponent(code) + '?key=' + encodeURIComponent(key), {\n              method: 'DELETE',\n            });\n            closeModal();\n            toast('房间已删除');\n            if (code === S.room) {\n              // 把自己删了就退回「这台设备进过的其他房间」，没有就回首页\n              const rest = knownRooms().filter(function (r) { return r.code !== code; });\n              if (rest.length) {\n                setTimeout(function () { switchRoom(rest[0].code); }, 600);\n              } else {\n                setTimeout(function () { store(LS_ROOM, ''); location.href = location.pathname; }, 600);\n              }\n            } else {\n              loadRoomList();\n            }\n          } catch (e) {\n            toast((e && e.message) || '删除失败', 'warn');\n          }\n        },\n      },\n    ],\n  });\n}\n\nfunction parentSettings() {\n  const st = S.state;\n  const link = location.origin + location.pathname + '?room=' + S.room;\n  return roomSection() + '' +\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>🔗 让孩子看到</h2></div>' +\n      '<div class=\"form-card\">' +\n        '<p class=\"hint hint-lead\" style=\"margin-bottom:.5rem\">把这行网址发到家里的平板/电脑上打开一次，以后直接点书签就行。<br>' +\n          '同一房间码的设备看到的是同一份作业。</p>' +\n        '<div class=\"share-box\"><b>房间码：' + S.room + '</b><br>' + esc(link) + '</div>' +\n        '<div class=\"btn-row\" style=\"margin-top:.6rem\">' +\n          '<button class=\"btn primary sm\" data-act=\"copy-link\">📋 复制网址</button>' +\n          '<button class=\"btn ghost sm\" data-act=\"copy-room\">复制房间码</button>' +\n        '</div>' +\n      '</div>' +\n    '</section>' +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>⚙️ 基本设置</h2></div>' +\n      '<div class=\"form-card\">' +\n        '<div class=\"form-row\"><label>欢迎语</label>' +\n          '<input class=\"field\" id=\"set-welcome\" value=\"' + esc(st.settings.welcome) + '\"></div>' +\n        '<div class=\"form-row num-fixed\"><label>家长密码</label>' +\n          // 口令就用普通单行文本框：4 位数字，加一减一没意义\n          '<input class=\"field\" id=\"set-pin\" type=\"text\" inputmode=\"numeric\" maxlength=\"4\" ' +\n            'value=\"' + esc(st.settings.parentPin) + '\">' +\n          '<span class=\"hint\">4 位数字</span></div>' +\n        '<div class=\"form-row num-fixed\"><label>作业分值</label>' +\n          numBox({ id: 'set-hwpoints', value: st.settings.homeworkPoints, min: 0, max: 20,\n            title: '每项作业得几朵小红花' }) +\n          '<span class=\"hint\">每项得几朵</span></div>' +\n        '<div class=\"form-row\"><label>家长确认</label>' +\n          '<label class=\"check-line\">' +\n            '<input type=\"checkbox\" id=\"set-confirm\"' + (st.settings.requireConfirm ? ' checked' : '') + '>' +\n            '<span>孩子打勾后需要家长确认才算数（关掉就是打勾立刻得分）</span></label></div>' +\n        /*\n         * 第 75 轮 2：上传前压一下图片。\n         * 手机拍的照片动辄 3~5MB，缩到最长边 1800px 再编码一次通常只剩几百 KB，\n         * 手机上看着没区别，但打开快很多。\n         */\n        '<div class=\"form-row\"><label>压缩图片</label>' +\n          '<label class=\"check-line\">' +\n            '<input type=\"checkbox\" id=\"set-compress\"' +\n              (st.settings.compressImages !== false ? ' checked' : '') + '>' +\n            '<span>上传照片前自动缩小（不看原图细节的话建议开着，打开快很多）</span></label></div>' +\n        '<p class=\"hint\" style=\"margin:.1rem 0 .5rem\">' +\n          '📷 <b>图片</b>：自动缩到最长边 1800px，肉眼几乎看不出差别。<br>' +\n          '🎬 <b>视频、PDF、文档</b>：浏览器里没法压缩（转码要按视频时长慢慢跑，' +\n          '家长等不起），会按原样上传 —— 但也支持边下边播，不用整段下完。</p>' +\n        /*\n         * 第 81 轮：法定节假日清单（任务有效期里可以勾「节假日」）。\n         * 春节/清明/端午/中秋是农历的、还有每年调休 —— 那些算不出来，得自己加。\n         */\n        '<div class=\"form-row\" style=\"align-items:flex-start\"><label>法定节假日</label>' +\n          '<textarea class=\"field\" id=\"set-holidays\" rows=\"4\" ' +\n            'style=\"font-size:.78rem;line-height:1.5\" ' +\n            'placeholder=\"一天一行，例如：&#10;2026-10-01&#10;2026-10-02\">' +\n            esc((st.settings.holidays || []).join('\\n')) + '</textarea></div>' +\n        '<p class=\"hint\" style=\"margin:.1rem 0 .5rem\">' +\n          '一天一行（`2026-10-01` 这样）。已经填好了元旦 / 劳动节 / 国庆；<br>' +\n          '春节、清明、端午、中秋是农历的，每年还有调休 —— 这些要你自己加进来，' +\n          '任务有效期里勾「节假日」时才会按这份清单算。</p>' +\n        '<div class=\"btn-row\" style=\"margin-top:.6rem\"><button class=\"btn primary sm\" data-act=\"set-save\">保存设置</button></div>' +\n      '</div>' +\n    '</section>' +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>⏱ 专注时间</h2></div>' +\n      '<div class=\"form-card\">' +\n        '<p class=\"hint hint-lead\" style=\"margin-bottom:.6rem\">孩子在一项作业上点「开始专注」就开始倒计时。<br>' +\n          '时间到了还没做完，会先让孩子休息一会儿，休息完自动开始下一轮。</p>' +\n        '<div class=\"form-row num-fixed\"><label>专注时长</label>' +\n          numBox({ id: 'set-focus', value: st.settings.focusMinutes || 20, min: 5, max: 60,\n            title: '5～60 分钟' }) +\n          '<span class=\"hint\">分钟 5～60</span></div>' +\n        '<div class=\"form-row num-fixed\"><label>休息时长</label>' +\n          numBox({ id: 'set-break', value: st.settings.breakMinutes || 5, min: 1, max: 30,\n            title: '1～30 分钟' }) +\n          '<span class=\"hint\">分钟 1～30</span></div>' +\n        '<div class=\"form-row\"><label>专注按钮</label>' +\n          '<label class=\"check-line\">' +\n            '<input type=\"checkbox\" id=\"set-focus-on\"' + (st.settings.focusEnabled !== false ? ' checked' : '') + '>' +\n            '<span>在没做完的卡片上显示「⏱ 开始专注」</span></label></div>' +\n        '<div class=\"btn-row\" style=\"margin-top:.6rem\"><button class=\"btn primary sm\" data-act=\"set-save\">保存设置</button></div>' +\n      '</div>' +\n    '</section>' +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>💾 备份与重置</h2></div>' +\n      '<div class=\"form-card\">' +\n        '<div class=\"btn-row\">' +\n          '<button class=\"btn sm\" data-act=\"export\">导出备份文件</button>' +\n          '<button class=\"btn sm\" data-act=\"import\">导入备份</button>' +\n        '</div>' +\n        '<p class=\"hint\" style=\"margin:.6rem 0\"></p>' +\n        '<div class=\"btn-row\">' +\n          '<button class=\"btn danger sm\" data-act=\"reset-day\">清空这一天的记录</button>' +\n          '<button class=\"btn danger sm\" data-act=\"reset-points\">清空小红花</button>' +\n          '<button class=\"btn danger sm\" data-act=\"reset-all\">全部重来</button>' +\n        '</div>' +\n      '</div>' +\n    '</section>' +\n\n    '<section class=\"panel\">' +\n      '<div class=\"panel-head\"><h2>📱 这台设备</h2></div>' +\n      '<div class=\"form-card\">' +\n        '<div class=\"form-row\"><label>大字模式</label>' +\n          '<label class=\"check-line\">' +\n            '<input type=\"checkbox\" id=\"pref-big\"' + (prefs.big ? ' checked' : '') + '>' +\n            '<span>字更大、按钮更大，小朋友看得更清楚</span></label></div>' +\n        '<div class=\"form-row\"><label>语音朗读</label>' +\n          '<label class=\"check-line\">' +\n            '<input type=\"checkbox\" id=\"pref-voice\"' + (prefs.voice ? ' checked' : '') + '>' +\n            '<span>显示 🔊 按钮，可以把作业读出来</span></label></div>' +\n        '<p class=\"hint\" style=\"margin-top:.5rem\">存储方式：' + (S.mode === 'local' ? '本机浏览器（未连服务器）' : '云端同步（' + (S.online ? '正常' : '暂时连不上，正在用本机数据') + '）') + '</p>' +\n        '<div class=\"btn-row\" style=\"margin-top:.5rem\"><button class=\"btn primary sm\" data-act=\"retry\">重新连接服务器</button></div>' +\n      '</div>' +\n    '</section>' +\n    /*\n     * 版本指纹：更新过代码之后拿它对一下，就知道服务器上跑的是不是最新那份。\n     * 本机算同一个指纹：node scripts/version.mjs\n     */\n    '<p class=\"hint\" style=\"text-align:center;margin-top:1rem\">前端版本 <code>' +\n      esc(S.appVersion || '读取中…') + '</code></p>' +\n    '<p class=\"hint\" style=\"text-align:center\">作业小站 · 送给一年级的小朋友 💛</p>';\n}\n\n/* ============================================================ 交互 */\n\nfunction findItem(kind, id, date) {\n  const day = C.getDay(S.state, date);\n  if (kind === 'homework') return day.homeworks.filter(function (x) { return x.id === id; })[0] || null;\n  if (kind === 'extra') return day.extras.filter(function (x) { return x.id === id; })[0] || null;\n  if (kind === 'task') {\n    // 每天的任务记录是\"用到才建\"的，还没打过勾的任务这里要给一个空的默认值，\n    // 否则新的一天孩子点每日任务会完全没有反应。\n    const exists = S.state.dailyTasks.some(function (x) { return x.id === id; });\n    if (!exists) return null;\n    return day.tasks[id] || C.emptyRecord();\n  }\n  return null;\n}\n\n/** 开始专注；如果已经有别的一项在专注，先问一句 */\nfunction beginFocus(kind, id) {\n  // 「任务取消」的那一项不能再做：卡片虽然点不动了，这里再兜一道\n  const date = S.view === 'today' ? C.todayKey() : S.date;\n  const rec = findItem(kind, id, date);\n  if (rec && !rec.done && rec.undoKind === 'cancel') {\n    toast('这一项爸爸妈妈取消了，不用做啦');\n    return;\n  }\n  if (S.focus && !focusIsOn(kind, id)) {\n    const on = S.focus.title;\n    confirmModal('换一项专注？', '现在正在专注「' + on + '」，要换成这一项吗？', function () {\n      startFocus(kind, id, 1);\n    }, '换这一项');\n    return;\n  }\n  startFocus(kind, id, 1);\n}\n\n/** 驳回兑换：可以补一句原因，孩子在小红花页会看到 */\nfunction openRejectDialog(rd) {\n  const quick = ['今天已经换过一个啦', '先把作业做完再说', '这个太贵了，再攒几朵吧', '明天再兑现好不好'];\n  const body = document.createElement('div');\n\n  const hint = document.createElement('p');\n  hint.className = 'hint';\n  hint.style.marginBottom = '.5rem';\n  hint.textContent = '写一句原因孩子会看到，也可以直接驳回。小红花会自动退回给他。';\n  body.appendChild(hint);\n\n  const ta = document.createElement('textarea');\n  ta.className = 'field';\n  ta.style.minHeight = '4.2rem';\n  ta.placeholder = '比如：今天已经换过冰淇淋啦，明天再换好不好';\n  body.appendChild(ta);\n\n  const chips = document.createElement('div');\n  chips.className = 'btn-row';\n  chips.style.marginTop = '.5rem';\n  quick.forEach(function (q) {\n    const b = document.createElement('button');\n    b.className = 'chip';\n    b.textContent = q;\n    b.addEventListener('click', function () { ta.value = q; ta.focus(); });\n    chips.appendChild(b);\n  });\n  body.appendChild(chips);\n\n  openModal({\n    title: '驳回「' + rd.title + '」',\n    bodyNode: body,\n    actions: [\n      { label: '再想想', cls: 'ghost', onClick: closeModal },\n      {\n        label: '驳回并退回小红花', cls: 'primary', onClick: function () {\n          dispatch({ t: 'redeem.status', id: rd.id, status: 'rejected', reason: ta.value.trim() });\n          closeModal();\n          toast('已驳回，' + rd.cost + ' 朵小红花退给孩子了');\n        },\n      },\n    ],\n  });\n}\n\nfunction toggleItem(kind, id, date) {\n  const rec = findItem(kind, id, date);\n  if (!rec) return;\n  if (rec.confirmed) { toast('这一项已经确认过啦，要改的话请家长在「待确认」里取消'); return; }\n  const next = !rec.done;\n  dispatch({ t: 'item.done', date: date, kind: kind, id: id, value: next });\n  if (next) {\n    chime(false);\n    // 正在专注的那一项做完了，专注自动结束\n    if (focusIsOn(kind, id)) {\n      stopFocus('这一项完成啦，专注结束 🎉');\n      confetti(45);\n      chime(true);\n    }\n  }\n}\n\nfunction readAll() {\n  const st = S.state;\n  const date = C.todayKey();\n  const day = C.getDay(st, date);\n  const parts = ['今天是' + C.friendlyDate(date) + '，' + C.weekdayCN(date) + '。'];\n  if (day.homeworks.length) {\n    parts.push('今天的作业有' + day.homeworks.length + '项。');\n    day.homeworks.forEach(function (h) {\n      parts.push(h.subject + '，' + h.title + (h.detail ? '，' + h.detail : '') + '。' +\n        (h.done ? '这一项已经完成了。' : ''));\n    });\n  } else {\n    parts.push('今天的作业还没有发过来。');\n  }\n  // 朗读也只念\"这一天还有效\"的任务，过期的不念\n  const tasks = st.dailyTasks.filter(function (t) { return C.taskActive(t, C.todayKey(), st.settings.holidays); });\n  if (tasks.length) {\n    parts.push('每天要做的事有：');\n    tasks.forEach(function (t) {\n      const r = day.tasks[t.id];\n      parts.push(t.title + (r && r.done ? '，已完成。' : '。'));\n    });\n  }\n  const stat = C.countDone(st, date);\n  parts.push('一共' + stat.total + '项，已经完成' + stat.done + '项。' + (stat.total && stat.done === stat.total ? '太棒了！' : '继续加油！'));\n  speak(parts.join(''), prefs.voice);\n}\n\nasync function copyText(text, okMsg) {\n  try {\n    if (navigator.clipboard && window.isSecureContext) {\n      await navigator.clipboard.writeText(text);\n    } else {\n      const ta = document.createElement('textarea');\n      ta.value = text;\n      ta.style.position = 'fixed';\n      ta.style.opacity = '0';\n      document.body.appendChild(ta);\n      ta.select();\n      document.execCommand('copy');\n      ta.remove();\n    }\n    toast(okMsg || '已复制', 'ok');\n  } catch (e) {\n    openModal({\n      title: '手动复制',\n      html: '<p>浏览器不让自动复制，请长按下面的内容复制：</p><div class=\"share-box\" style=\"margin-top:.6rem\">' + esc(text) + '</div>',\n      actions: [{ label: '好', cls: 'primary', onClick: closeModal }],\n    });\n  }\n}\n\nfunction exportBackup() {\n  const blob = new Blob([JSON.stringify({ room: S.room, state: S.state }, null, 2)], { type: 'application/json' });\n  const a = document.createElement('a');\n  a.href = URL.createObjectURL(blob);\n  a.download = '作业小站备份-' + C.todayKey() + '.json';\n  a.click();\n  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);\n  toast('备份文件已下载', 'ok');\n}\n\nfunction importBackup() {\n  const input = document.createElement('input');\n  input.type = 'file';\n  input.accept = '.json,application/json';\n  input.addEventListener('change', function () {\n    const file = input.files && input.files[0];\n    if (!file) return;\n    const reader = new FileReader();\n    reader.onload = function () {\n      try {\n        const parsed = JSON.parse(String(reader.result));\n        const incoming = C.normalizeState(parsed.state || parsed);\n        confirmModal('导入备份', '会用备份里的内容覆盖当前小站，确定吗？', async function () {\n          if (S.mode === 'local') {\n            S.state = incoming;\n            saveCache();\n            render();\n            toast('已导入', 'ok');\n            return;\n          }\n          try {\n            const j = await api('/api/state/' + S.room, {\n              method: 'PUT',\n              headers: { 'Content-Type': 'application/json' },\n              body: JSON.stringify({ state: incoming }),\n            });\n            S.state = C.normalizeState(j.state);\n            saveCache();\n            render();\n            toast('已导入', 'ok');\n          } catch (e) {\n            toast('导入失败：' + e.message, 'err');\n          }\n        }, '导入');\n      } catch (e) {\n        toast('这个文件看不懂', 'err');\n      }\n    };\n    reader.readAsText(file);\n  });\n  input.click();\n}\n\nfunction saveSettings() {\n  const pin = ($('#set-pin').value || '').replace(/\\D/g, '').slice(0, 4);\n  if (pin.length !== 4) { toast('家长密码要 4 位数字', 'err'); return; }\n  dispatch({\n    t: 'settings',\n    patch: {\n      welcome: $('#set-welcome').value.trim(),\n      parentPin: pin,\n      homeworkPoints: Number($('#set-hwpoints').value) || 0,\n      requireConfirm: $('#set-confirm').checked,\n      compressImages: $('#set-compress').checked,\n      // 节假日清单：一天一行，去掉空行和乱写的（core 那边还会再过滤一遍）\n      holidays: ($('#set-holidays').value || '').split(/[\\s,，;；]+/)\n        .map(function (x) { return x.trim(); })\n        .filter(Boolean),\n      focusMinutes: Number($('#set-focus').value) || 20,\n      breakMinutes: Number($('#set-break').value) || 5,\n      focusEnabled: $('#set-focus-on').checked,\n    },\n  });\n  prefs.big = $('#pref-big').checked;\n  prefs.voice = $('#pref-voice').checked;\n  savePrefs();\n  applyFontSize();\n  render();\n  toast('设置已保存', 'ok');\n}\n\n/* ---------------------------------------------------------- 事件分发 */\n\nfunction onViewClick(e) {\n  const el = e.target.closest('[data-act]');\n  if (!el) return;\n  const act = el.dataset.act;\n\n  // 卡片上的按钮不要触发\"打勾\"\n  if (act === 'toggle' && e.target.closest('.speak-btn')) return;\n\n  // 按域分给几个处理函数；每个函数只认自己的动作，认出来就返回 true\n  const handlers = [handleKidAction, handleParentNavAction, handlePasteAction, handleHomeworkAction, handleDayAction, handleConfirmAction, handleTaskRewardAction, handleRoomAction, handleSettingsAction];\n  for (let i = 0; i < handlers.length; i++) {\n    if (handlers[i](act, el, e)) return;\n  }\n}\n\n/* ---- 上面那个 switch 拆出来的处理函数 ---- */\n\n/** handleKidAction：10 个动作 */\nfunction handleKidAction(act, el, e) {\n  switch (act) {\n    case 'toggle': {\n      const kind = el.dataset.kind;\n      const id = el.dataset.id;\n      const date = S.view === 'today' ? C.todayKey() : S.date;\n      // 作业和每日任务都不能直接点完成，必须走专注页\n      if (S.view === 'today') {\n        const rec = findItem(kind, id, date);\n        if (rec && rec.done) { toast('这一项已经完成了，要改请家长在「待确认」里取消'); break; }\n        beginFocus(kind, id);\n        break;\n      }\n      toggleItem(kind, id, date);\n      break;\n    }\n    case 'speak': {\n      e.stopPropagation();\n      speak(el.dataset.text || '', prefs.voice);\n      break;\n    }\n    case 'read-all': readAll(); break;\n    case 'mood': {\n      const day = C.getDay(S.state, C.todayKey());\n      dispatch({ t: 'day.mood', date: C.todayKey(), mood: day.mood === el.dataset.emoji ? '' : el.dataset.emoji });\n      break;\n    }\n    case 'add-extra': {\n      /*\n       * 孩子自己加一件事：可以写备注，但**不给改小红花**（固定 1 朵）——\n       * 不然孩子会自己给自己开高分。家长在「额外的任务」里可以改分值。\n       */\n      formModal('加一件事', [\n        { key: 'emoji', label: '图标', type: 'icon', value: '✨', picks: COMMON_ICONS },\n        { key: 'title', label: '做什么', value: '', maxlength: 60, placeholder: '例如：给奶奶打个电话' },\n        { key: 'note', label: '备注', type: 'textarea', rows: 2, maxlength: 500, value: '',\n          placeholder: '可留空；写清楚做到什么程度算完成' },\n      ], function (v) {\n        if (!v.title.trim()) { toast('写点内容吧', 'err'); return; }\n        dispatch({ t: 'extra.add', date: C.todayKey(), item: { id: C.newId('e'),\n          emoji: v.emoji.trim() || '✨', title: v.title.trim(),\n          note: v.note.trim(), points: 1,\n        } });\n      });\n      break;\n    }\n    case 'redeem': {\n      const r = S.state.rewards.filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!r) break;\n      if (S.state.points.balance < r.cost) { toast('小红花还不够哦', 'err'); break; }\n      confirmModal('兑换奖励', '用 ' + r.cost + ' 朵小红花换「' + r.title + '」？', function () {\n        dispatch({ t: 'redeem', id: r.id, rid: C.newId('rd') });\n        confetti(40);\n        toast('已告诉爸爸妈妈啦，等他们兑现 🎉', 'ok');\n      }, '兑换');\n      break;\n    }\n\n    /* ---- 家长端 ---- */\n    case 'focus-start': {\n      e.stopPropagation();\n      beginFocus(el.dataset.kind, el.dataset.id);\n      break;\n    }\n    /*\n     * 孩子自己删掉刚交上去的附件（传错了、糊了、要重录）。\n     * 只动\"交作业\"那一份，不去碰家长传的要求。\n     */\n    case 'focus-att-del': {\n      const f = S.focus;\n      if (!f) break;\n      const id = el.dataset.id;\n      confirmModal('删掉这个附件？', '删掉之后可以重新传。', function () {\n        f.works = C.normalizeAttachments(f.works).filter(function (a) { return a.id !== id; });\n        dispatch({ t: 'attach.remove', date: C.todayKey(), kind: f.kind, id: f.id, scope: 'work', fileId: id });\n        updateFocusUI();\n        toast('删掉了');\n      }, '删掉');\n      break;\n    }\n    case 'focus-done': {\n      // 在整页专注界面里直接打勾：完成 + 结束专注 + 撒花\n      const f = S.focus;\n      if (!f) break;\n      const rec = findItem(f.kind, f.id, C.todayKey());\n      if (rec && !rec.done) toggleItem(f.kind, f.id, C.todayKey());\n      else stopFocus('');\n      break;\n    }\n    case 'focus-stop':\n      stopFocus('已经结束专注');\n      break;\n    case 'rest-done':\n      finishBreakPhase();\n      break;\n\n    default: return false;   // 不是这一组的动作\n  }\n  return true;\n}\n\n/** handleParentNavAction：6 个动作 */\nfunction handleParentNavAction(act, el, e) {\n  switch (act) {\n    case 'parent-tab': S.parentTab = el.dataset.tab; render(); break;\n    /*\n     * 小红花记录翻页（第 94 轮）。翻到哪一页是纯前端状态，\n     * 不写进存档 —— 换个设备/刷新一下回到第 1 页很正常，\n     * 但绝不能因为\"看了眼第 3 页\"就把 rev 顶上去、还触发同步。\n     * 越界的页码 viewStars 里会夹回来，这里只负责接收。\n     */\n    case 'ledger-page': {\n      const p = Number(el.dataset.page);\n      if (!Number.isFinite(p)) break;\n      S.ledgerPage = p;\n      render();\n      // 翻页之后滚回记录顶部，不然还在页面下面，看不到新内容\n      const box = document.getElementById('sec-ledger');\n      if (box && box.scrollIntoView) box.scrollIntoView({ block: 'start' });\n      break;\n    }\n    case 'pin-key': pinPress(el.dataset.key); break;\n    case 'date-today': S.date = C.todayKey(); S.preview = []; render(); break;\n    case 'date-set': {\n      if (!C.isValidDateKey(el.dataset.date)) break;\n      S.date = el.dataset.date;\n      S.preview = [];\n      render();\n      break;\n    }\n    case 'date-shift': {\n      const days = Number(el.dataset.days) || 0;\n      S.date = C.shiftDate(S.date, days);\n      S.preview = [];\n      render();\n      scrollToTop(true);\n      break;\n    }\n    case 'scroll-waiting': {\n      const sec = document.getElementById('sec-waiting');\n      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });\n      break;\n    }\n\n    default: return false;   // 不是这一组的动作\n  }\n  return true;\n}\n\n/** handleHomeworkAction：12 个动作 */\n/** handlePasteAction：钉钉文本 → 识别 → 预览 → 提交（5 个动作） */\nfunction handlePasteAction(act, el, e) {\n  switch (act) {\n    case 'parse': case 'parse-add': {\n      const box = $('#paste-box');\n      const text = box ? box.value : '';\n      const parsed = C.parseHomeworkText(text);\n      if (!parsed.length) { toast('没认出作业内容，试试一行一条', 'err'); break; }\n      if (act === 'parse') {\n        S.preview = parsed;\n        render();\n        toast('认出了 ' + parsed.length + ' 条，确认一下再添加', 'ok');\n      } else {\n        commitHomework(parsed);\n      }\n      break;\n    }\n    case 'preview-del': S.preview.splice(Number(el.dataset.i), 1); render(); break;\n    case 'preview-edit': {\n      const i = Number(el.dataset.i);\n      const p = S.preview[i];\n      if (!p) break;\n      e.stopPropagation();\n      const fallback = C.SUBJECTS.some(function (s) { return s.name === p.rawSubject; }) ? p.rawSubject : '其他';\n      const current = C.SUBJECTS.some(function (s) { return s.name === p.subject; }) ? p.subject : fallback;\n      /*\n       * 识别出来的这一条也能加附件（老师发的卷子照片常常就是和作业文字一起转过来的）。\n       * 附件挂在这条预览上，点「全部添加」时跟着一起存。\n       */\n      const attNode = document.createElement('div');\n      attNode.className = 'att-field';\n      const renderAtt = function () {\n        attNode.innerHTML = attachBox(p.attachments, {\n          key: 'preview-edit', itemId: 'p' + i, kind: 'preview', scope: 'item',\n          addLabel: '📎 加附件（图片 / 视频 / 文本）',\n          removeAct: 'preview-att-del',\n        });\n        bindAttachBoxes(attNode);\n      };\n      pendingAttach['preview-edit'] = function (got) {\n        p.attachments = C.normalizeAttachments((p.attachments || []).concat(got));\n        renderAtt();\n        toast('加了 ' + got.length + ' 个附件', 'ok');\n      };\n      renderAtt();\n      formModal('修改这一条', [\n        {\n          key: 'subject', label: '科目', type: 'select', value: current,\n          options: C.SUBJECTS.map(function (s) { return { value: s.name, label: s.emoji + ' ' + s.name }; }),\n        },\n        { key: 'title', label: '内容', value: p.title },\n        /*\n         * 备注用多行文本框，和「修改常用作业」「修改作业」保持一致。\n         * 识别出来的备注有时候挺长（好几条要求），单行框根本看不全。\n         */\n        { key: 'detail', label: '备注', type: 'textarea', rows: 3, maxlength: 500,\n          value: p.detail || '', placeholder: '可留空；可以写好几行，例如：家长签字' },\n        { type: 'node', label: '附件', node: attNode },\n      ], function (v) {\n        if (!v.title.trim()) { toast('内容不能空着', 'err'); return; }\n        S.preview[i] = {\n          subject: v.subject, rawSubject: v.subject,\n          title: v.title.trim(), detail: v.detail.trim(),\n          attachments: C.normalizeAttachments(p.attachments),\n        };\n        render();\n        toast('改好了', 'ok');\n      });\n      bindAttachBoxes(document);\n      break;\n    }\n    /* 识别结果里删附件（还没提交，直接从预览里拿掉就行） */\n    case 'preview-att-del': {\n      const i = Number(el.dataset.itemid.replace(/^p/, ''));\n      const p = S.preview[i];\n      if (!p) break;\n      p.attachments = C.normalizeAttachments(p.attachments).filter(function (a) {\n        return a.id !== el.dataset.id;\n      });\n      const node = el.closest('.modal') ? el.closest('.modal').querySelector('.att-field') : null;\n      if (node) {\n        node.innerHTML = attachBox(p.attachments, {\n          key: 'preview-edit', itemId: 'p' + i, kind: 'preview', scope: 'item',\n          addLabel: '📎 加附件（图片 / 视频 / 文本）', removeAct: 'preview-att-del',\n        });\n        bindAttachBoxes(node);\n      }\n      toast('附件删掉了');\n      break;\n    }\n    case 'preview-clear': S.preview = []; render(); break;\n    case 'preview-commit': commitHomework(S.preview); break;\n    default: return false;   // 不是这一组的动作\n  }\n  return true;\n}\n\n/** handleHomeworkAction：作业和额外任务的增删改 + 排序（6 个动作） */\nfunction handleHomeworkAction(act, el, e) {\n  switch (act) {\n    case 'move': {\n      // 自定义排序：往上 / 往下挪一格\n      const list = el.dataset.list;\n      dispatch({\n        t: 'move',\n        list: list,\n        date: (list === 'homework' || list === 'extras') ? S.date : undefined,\n        id: el.dataset.id,\n        dir: Number(el.dataset.dir),\n      });\n      break;\n    }    case 'add-tab': {\n      const t = el.dataset.tab;\n      S.addTab = (t === 'manual' || t === 'common') ? t : 'paste';\n      render();\n      break;\n    }\n    /* ---- 常用作业库 ---- */\n    case 'common-use': {\n      const ch = (S.state.commonHomeworks || []).filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!ch) break;\n      const day = C.getDay(S.state, S.date);\n      const sameTitle = day.homeworks.filter(function (h) { return h.title === ch.title; });\n      /*\n       * 同名的已经在今天了：\n       *   · 标题和备注都一样 → 不加，只提示（避免一天里出现两条一模一样的）\n       *   · 备注不一样     → 问要不要用库里的备注覆盖今天那条（「读课文 2 遍」\n       *                      今天要求\"家长签字\"、明天要求\"读给家长听\"）\n       */\n      if (sameTitle.length) {\n        const exact = sameTitle.filter(function (h) {\n          return (h.detail || '') === (ch.detail || '');\n        })[0];\n        if (exact) {\n          toast('「' + ch.title + '」今天已经有了，没有重复添加');\n          break;\n        }\n        const cur = sameTitle[0];\n        confirmModal('今天的作业里已经有同名的',\n          '「' + ch.title + '」今天已经有了。\\n\\n今天这条：' +\n          (cur.detail ? '备注：' + cur.detail : '没有备注') +\n          '\\n库里这条：' + (ch.detail ? '备注：' + ch.detail : '没有备注') +\n          '\\n\\n要用库里的科目和备注覆盖今天这条吗？',\n          function () {\n            dispatch({ t: 'hw.update', date: S.date, id: cur.id, patch: {\n              subject: ch.subject, detail: ch.detail,\n              // 覆盖时也把库里的附件补上（缺的就补，已有的不重复）\n              attachments: C.normalizeAttachments(\n                (cur.attachments || []).concat(ch.attachments || [])),\n            } });\n            toast('已覆盖今天那一条', 'ok');\n          }, '覆盖');\n        break;\n      }\n      dispatch({ t: 'hw.add', date: S.date, items: [\n        // 库里存的附件一起带过来（老师发的卷子照片不用每天重传）\n        { id: C.newId('h'), subject: ch.subject, title: ch.title, detail: ch.detail, attachments: ch.attachments },\n      ] });\n      chime(true);\n      toast('加好了：' + ch.title, 'ok');\n      // 新加的那条在列表里可能在屏幕外，滚过去闪一下，\n      // 不然家长会以为\"点了没反应\"然后又点一次\n      flashNewest('homework', ch.title);\n      break;\n    }\n    /*\n     * 往库里加新条目的入口只有「手动加一条 → 添加并存进常用库」那一个\n     * （常用库页签里那个一模一样的表单已经删掉了，避免两处重复）。\n     */\n    case 'common-edit': {\n      const ch = (S.state.commonHomeworks || []).filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!ch) break;\n      /*\n       * 常用库也能存附件（第 3 条）：老师每周发的那张卷子照片、要跟读的音频\n       * 存在库里，以后每天点一下「加」就一起带到当天，不用天天重传。\n       */\n      /* 这一层就是 .form-row 的 flex 子项，给它一个类名好在 CSS 里对齐（见 style.css 的 .att-field） */\n      const attNode = document.createElement('div');\n      attNode.className = 'att-field';\n      const renderAtt = function () {\n        attNode.innerHTML = attachBox(ch.attachments, {\n          key: 'common-edit', itemId: ch.id, kind: 'common', scope: 'item',\n          addLabel: '📎 加附件（图片 / 视频 / 文本）',\n          removeAct: 'common-att-del',\n        });\n        bindAttachBoxes(attNode);\n      };\n      pendingAttach['common-edit'] = function (got) {\n        ch.attachments = C.normalizeAttachments((ch.attachments || []).concat(got));\n        dispatch({ t: 'common.update', id: ch.id, patch: { attachments: ch.attachments } });\n        renderAtt();\n        toast('加了 ' + got.length + ' 个附件', 'ok');\n      };\n      renderAtt();\n      formModal('修改常用作业', [\n        {\n          key: 'subject', label: '科目', type: 'select', value: ch.subject,\n          options: C.SUBJECTS.map(function (s) { return { value: s.name, label: s.emoji + ' ' + s.name }; }),\n        },\n        { key: 'title', label: '内容', maxlength: 120, value: ch.title },\n        { key: 'detail', label: '备注', type: 'textarea', rows: 3, maxlength: 500, value: ch.detail },\n        // 附件紧跟备注，和\"修改作业\"保持一致\n        { type: 'node', label: '附件', node: attNode },\n      ], function (v) {\n        if (!v.title.trim()) { toast('内容不能空着', 'err'); return; }\n        dispatch({ t: 'common.update', id: ch.id, patch: {\n          subject: v.subject, title: v.title.trim(), detail: v.detail.trim(),\n          attachments: ch.attachments,\n        } });\n        toast('改好了', 'ok');\n      });\n      bindAttachBoxes(document);\n      break;\n    }\n    /* 常用库弹窗里删附件 */\n    case 'common-att-del': {\n      const ch = (S.state.commonHomeworks || []).filter(function (x) { return x.id === el.dataset.itemid; })[0];\n      if (!ch) break;\n      ch.attachments = C.normalizeAttachments(ch.attachments).filter(function (a) {\n        return a.id !== el.dataset.id;\n      });\n      dispatch({ t: 'common.update', id: ch.id, patch: { attachments: ch.attachments } });\n      toast('附件删掉了');\n      break;\n    }\n    case 'common-del': {\n      const ch = (S.state.commonHomeworks || []).filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!ch) break;\n      confirmModal('从常用库里删掉', '删掉「' + ch.title + '」？今天已经加好的作业不受影响。', function () {\n        dispatch({ t: 'common.remove', id: ch.id });\n      }, '删除');\n      break;\n    }\n    /*\n     * 把这一条（含备注）存进常用作业库。\n     * 库里有同名的话先问一句要不要覆盖 —— 同名但备注不同是很常见的\n     * （「读课文 2 遍」今天要求\"家长签字\"、明天要求\"读给家长听\"）。\n     */\n    /*\n     * ☆ 添加到常用（第 76 轮 1）：先让家长选存到哪儿 ——\n     *   常用作业库：以后点一下就加好\n     *   每日任务：变成天天都要做的一条（标签默认「功课」，弹窗里可以改）\n     */\n    case 'to-common': {\n      const kind = el.dataset.kind || 'homework';\n      const src = kind === 'task'\n        ? (function () {\n            const t = S.state.dailyTasks.filter(function (x) { return x.id === el.dataset.id; })[0];\n            return t && { subject: t.tag || C.TASK_TAGS[0], title: t.title,\n              detail: t.note || '', attachments: t.attachments, emoji: t.emoji, points: t.points };\n          })()\n        : (function () {\n            const h = findItem('homework', el.dataset.id, S.date);\n            return h && { subject: h.subject, title: h.title, detail: h.detail || '',\n              attachments: h.attachments };\n          })();\n      if (!src) break;\n      formModal('添加到常用', [\n        { type: 'note', text: '「' + src.title + '」存起来，以后不用重复写。' },\n        { key: 'dest', label: '存到哪', type: 'select', value: 'common', options: [\n          { value: 'common', label: '⭐ 常用作业库（要用时点一下就加）' },\n          { value: 'task', label: '📅 每日任务（天天都要做）' },\n        ] },\n      ], function (v) {\n        if (v.dest === 'task') {\n          // 从作业转成每日任务：标签默认「功课」，弹窗里能改\n          openTaskForm({\n            emoji: src.emoji || '🌟', title: src.title, note: src.detail,\n            tag: kind === 'task' ? src.subject : C.TASK_TAGS[0],\n            points: src.points != null ? src.points : (S.state.settings.homeworkPoints || 2),\n            attachments: src.attachments,\n          });\n        } else {\n          saveToCommon(src);\n        }\n      });\n      break;\n    }\n    case 'hw-save-common': {\n      // 老按钮保底：万一还有旧 DOM 引用它，行为等于\"存进常用作业库\"\n      const h = findItem('homework', el.dataset.id, S.date);\n      if (h) saveToCommon({ subject: h.subject, title: h.title, detail: h.detail || '',\n        attachments: h.attachments });\n      break;\n    }\n    case 'hw-add-common': {\n      const subject = $('#add-subject').value;\n      const title = ($('#add-title').value || '').trim();\n      const detail = ($('#add-detail').value || '').trim();\n      if (!title) { toast('写点内容吧', 'err'); break; }\n      // 附件两边都要带走：今天的作业一份，常用库一份（以后点「加」直接有）\n      const attach = S.draftAttach;\n      S.draftAttach = [];\n      dispatch({ t: 'hw.add', date: S.date, items: [{ id: C.newId('h'), subject: subject, title: title, detail: detail, attachments: attach }] });\n      dispatch({ t: 'common.add', item: { id: C.newId('ch'), subject: subject, title: title, detail: detail, attachments: attach } });\n      $('#add-title').value = '';\n      $('#add-detail').value = '';\n      chime(true);\n      toast(attach.length ? '加好了，也存进常用库了（带 ' + attach.length + ' 个附件）' : '加好了，也存进常用库了', 'ok');\n      break;\n    }\n    case 'hw-add': {\n      const subject = $('#add-subject').value;\n      const title = $('#add-title').value.trim();\n      const detail = $('#add-detail').value.trim();\n      if (!title) { toast('写点内容吧', 'err'); break; }\n      /*\n       * 草稿附件要在 dispatch **之前**清掉：\n       * dispatch 内部就会 render()，清晚了界面还是重新渲染出旧附件，\n       * 家长会以为\"没加成功\"，再点一次就加了两遍（踩过）。\n       */\n      const attach = S.draftAttach;\n      S.draftAttach = [];\n      dispatch({\n        t: 'hw.add', date: S.date,\n        items: [{ id: C.newId('h'), subject: subject, title: title, detail: detail, attachments: attach }],\n      });\n      $('#add-title').value = '';\n      $('#add-detail').value = '';\n      chime(true);\n      toast(attach.length ? '加好了，带 ' + attach.length + ' 个附件' : '加好了', 'ok');\n      break;\n    }\n    /* 「手动加一条」里把刚传上来的附件去掉（文件先留在服务器上，没人引用就算了） */\n    case 'draft-att-del': {\n      S.draftAttach = S.draftAttach.filter(function (a) { return a.id !== el.dataset.id; });\n      // 同上：只刷新附件那一块，不能 render()，否则家长填的字会被清空\n      refreshAttachBox('hw-add', draftAttachHTML);\n      break;\n    }\n    /* 作业行里删掉一个附件 */\n    case 'hw-att-del': {\n      dispatch({\n        t: 'attach.remove', date: S.date, kind: 'homework', id: el.dataset.itemid,\n        scope: el.dataset.scope || 'item', fileId: el.dataset.id,\n      });\n      toast('附件删掉了');\n      break;\n    }\n    /* 给已有作业补传附件（传完立刻存，不用再点保存） */\n    case 'hw-att-add': {\n      const input = el.querySelector('input[type=\"file\"]');\n      if (input) input.click();\n      break;\n    }\n    case 'hw-edit': {\n      const h = findItem('homework', el.dataset.id, S.date);\n      if (!h) break;\n      // 弹窗里的附件区：上传完立刻存到这条作业上（见 pendingAttach['hw-edit']）\n      /* 这一层就是 .form-row 的 flex 子项，给它一个类名好在 CSS 里对齐（见 style.css 的 .att-field） */\n      const attNode = document.createElement('div');\n      attNode.className = 'att-field';\n      const renderAtt = function () {\n        attNode.innerHTML = attachBox(h.attachments, {\n          key: 'hw-edit', itemId: h.id, kind: 'homework', scope: 'item',\n          addLabel: '📎 加附件（图片 / 视频 / 文本）', removeAct: 'hw-edit-att-del',\n        });\n        bindAttachBoxes(attNode);\n      };\n      pendingAttach['hw-edit'] = function (got) {\n        got.forEach(function (f) {\n          dispatch({ t: 'attach.add', date: S.date, kind: 'homework', id: h.id, scope: 'item', file: f });\n        });\n        h.attachments = C.normalizeAttachments((h.attachments || []).concat(got));\n        renderAtt();\n        toast('加了 ' + got.length + ' 个附件', 'ok');\n      };\n      renderAtt();\n      formModal('修改作业', [\n        {\n          key: 'subject', label: '科目', type: 'select', value: h.subject,\n          options: C.SUBJECTS.map(function (s) { return { value: s.name, label: s.emoji + ' ' + s.name }; }),\n        },\n        { key: 'title', label: '内容', maxlength: 120, value: h.title },\n        { key: 'detail', label: '备注', type: 'textarea', rows: 3, maxlength: 500, value: h.detail, placeholder: '可留空；可以写好几行' },\n        // 附件紧跟备注（第 4 条：所有作业修改都是这个顺序）\n        { type: 'node', label: '附件', node: attNode },\n        {\n          key: 'points', label: '小红花', type: 'number',\n          value: h.points != null ? h.points : (S.state.settings.homeworkPoints || 0),\n        },\n      ], function (v) {\n        dispatch({\n          t: 'hw.update', date: S.date, id: h.id,\n          patch: {\n            subject: v.subject,\n            title: v.title.trim(),\n            detail: v.detail.trim(),\n            points: v.points,\n          },\n        });\n        toast('改好了', 'ok');\n      });\n      bindAttachBoxes(document);\n      break;\n    }\n    /* 修改弹窗里删附件 */\n    case 'hw-edit-att-del': {\n      dispatch({\n        t: 'attach.remove', date: S.date, kind: 'homework', id: el.dataset.itemid,\n        scope: 'item', fileId: el.dataset.id,\n      });\n      toast('附件删掉了');\n      break;\n    }\n    /*\n     * 每日任务的附件（第 75 轮 1，和作业一样）：\n     *   task-edit-att-del  → 任务已经存在，直接删\n     *   task-add-att-del   → 还没保存，从草稿里拿掉就行\n     */\n    case 'task-edit-att-del': {\n      dispatch({\n        t: 'attach.remove', date: S.date, kind: 'task', id: el.dataset.itemid,\n        scope: 'item', fileId: el.dataset.id,\n      });\n      toast('附件删掉了');\n      break;\n    }\n    case 'task-add-att-del': {\n      // 还没保存，从草稿里拿掉就行（和作业的 draft-att-del 一模一样）\n      S.draftTaskAttach = (S.draftTaskAttach || []).filter(function (a) {\n        return a.id !== el.dataset.id;\n      });\n      // 只刷新附件那一块，不能 render()，否则家长填的字会被清空\n      refreshAttachBox('task-add', function () {\n        return attachBox(S.draftTaskAttach, {\n          key: 'task-add', addLabel: '📎 加附件（图片 / 视频 / 文本）',\n          removeAct: 'task-add-att-del',\n        });\n      });\n      break;\n    }\n    case 'hw-del': {\n      const h = findItem('homework', el.dataset.id, S.date);\n      if (!h) break;\n      confirmModal('删除作业', '删掉「' + h.title + '」？', function () {\n        dispatch({ t: 'hw.remove', date: S.date, id: h.id });\n      }, '删除');\n      break;\n    }\n    case 'extra-edit': {\n      const day = C.getDay(S.state, S.date);\n      const e = day.extras.filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!e) break;\n      formModal('修改这条额外任务', [\n        { key: 'emoji', label: '图标', type: 'icon', value: e.emoji || '✨', picks: COMMON_ICONS },\n        { key: 'title', label: '做什么', type: 'textarea', rows: 2, maxlength: 60, value: e.title },\n        { key: 'points', label: '小红花', type: 'number', value: e.points, min: 0, max: 99 },\n      ], function (v) {\n        if (!v.title.trim()) { toast('内容不能空着', 'err'); return; }\n        dispatch({\n          t: 'extra.update', date: S.date, id: e.id,\n          patch: { emoji: v.emoji.trim() || '✨', title: v.title.trim(), points: v.points },\n        });\n        toast('改好了', 'ok');\n      });\n      break;\n    }\n    case 'extra-del': {\n      const day = C.getDay(S.state, S.date);\n      const e = day.extras.filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!e) break;\n      const tip = e.confirmed\n        ? '这条已经确认过、小红花也发了，删掉会把它扣回来。'\n        : (e.done ? '这条孩子已经打勾了。' : '');\n      confirmModal('删掉这条额外任务', '「' + e.title + '」' + (tip ? '　' + tip : ''), function () {\n        dispatch({ t: 'extra.remove', date: S.date, id: e.id });\n        toast('删掉了', 'ok');\n      }, '删除');\n      break;\n    }\n    default: return false;   // 不是这一组的动作\n  }\n  return true;\n}\n\n/** handleDayAction：整天层面：复制昨天的作业、给孩子留言（2 个动作） */\nfunction handleDayAction(act, el, e) {\n  switch (act) {\n    /*\n     * 把这一条复制到今天。\n     * 用 day.copy 的 picks 只挑这一条：新 id、打勾和确认状态清空、\n     * 不重复发小红花（积分只在 done && confirmed 跳变时才结算）。\n     *\n     * 第 80 轮 2：今天**已经有同名同科目**的那条时，先问要不要覆盖 ——\n     * 不覆盖就直接取消，免得同一天出现两条一模一样的作业。\n     */\n    case 'hw-copy-one': {\n      const today = C.todayKey();\n      const h = findItem('homework', el.dataset.id, S.date);\n      if (!h) break;\n      if (S.date === today) { toast('这一条已经在今天了'); break; }\n      const dup = C.getDay(S.state, today).homeworks.filter(function (x) {\n        return x.subject === h.subject && x.title === h.title;\n      })[0];\n      const doCopy = function (overwrite) {\n        dispatch({ t: 'day.copy', from: S.date, to: today,\n          picks: [{ kind: 'homework', id: h.id }], overwrite: overwrite });\n        chime(true);\n        toast(overwrite ? '已用这条覆盖今天的「' + h.title + '」'\n          : '已复制到今天：' + h.title, 'ok');\n      };\n      if (dup) {\n        confirmModal('今天已经有一条一样的了',\n          '今天已经有「' + (dup.subject || '其他') + '：' + dup.title + '」了。\\n\\n' +\n          '要用这一天这条（备注和附件）覆盖它吗？\\n' +\n          '今天那条的打勾和确认状态、已经拿到的小红花都不变。',\n          function () { doCopy(true); }, '覆盖');\n        break;\n      }\n      doCopy(false);\n      break;\n    }\n    case 'note-save': {\n      dispatch({ t: 'day.note', date: S.date, note: $('#note-box').value });\n      toast('留言已保存', 'ok');\n      break;\n    }\n    default: return false;   // 不是这一组的动作\n  }\n  return true;\n}\n\n/** handleConfirmAction：4 个动作 */\nfunction handleConfirmAction(act, el, e) {\n  switch (act) {\n    case 'review-save': {\n      const box = $('#review-box');\n      const ptsEl = $('#review-points');\n      const text = box ? box.value.trim() : '';\n      const pts = Number(ptsEl ? ptsEl.value : 0) || 0;\n      if (!text && !pts) { toast('写一句评语，或者填个小红花数', 'err'); break; }\n      dispatch({ t: 'day.review', date: S.date, text: text, points: pts });\n      toast(pts === 0 ? '评价已保存'\n        : ('评价已保存，' + (pts > 0 ? '奖励 +' + pts : String(pts)) + ' ⭐'), 'ok');\n      break;\n    }\n    case 'review-edit': {\n      const day = C.getDay(S.state, S.date);\n      const rv = day.review || {};\n      formModal('修改今日评价', [\n        { key: 'text', label: '评语', type: 'textarea', rows: 5, maxlength: 300, value: rv.text || '',\n          placeholder: '自主性 / 态度 / 注意力 / 易错内容 / 后续建议' },\n        { key: 'points', label: '小红花', type: 'number', value: rv.points || 0,\n          placeholder: '正数奖励、负数扣除、0 表示不改动' },\n      ], function (v) {\n        const pts = Number(v.points) || 0;\n        dispatch({ t: 'day.review', date: S.date, text: v.text.trim(), points: pts });\n        toast('改好了', 'ok');\n      });\n      break;\n    }\n    case 'confirm-item':\n      dispatch({ t: 'item.confirm', date: S.date, kind: el.dataset.kind, id: el.dataset.id, value: true });\n      chime(true);\n      confetti(18);\n      toast('已确认 +小红花到账 ⭐', 'ok');\n      break;\n    case 'unconfirm-item':\n      dispatch({ t: 'item.confirm', date: S.date, kind: el.dataset.kind, id: el.dataset.id, value: false });\n      break;\n    /*\n     * 撤销：先问理由。理由孩子看得到，而且决定这一项后面怎么处理\n     * （任务取消 = 不用做了；再完善 = 要重做）——见 openUndoModal。\n     */\n    case 'undo-item': {\n      const x = parentItems(S.date).filter(function (it) {\n        return it.kind === el.dataset.kind && it.id === el.dataset.id;\n      })[0];\n      if (!x) break;\n      openUndoModal(x.kind, x.id, x.title);\n      break;\n    }\n    /* 家长反悔了：把撤销取消掉，回到普通状态 */\n    case 'restore-item':\n      dispatch({ t: 'item.restore', date: S.date, kind: el.dataset.kind, id: el.dataset.id });\n      toast('已恢复成普通状态', 'ok');\n      break;\n    case 'confirm-all': {\n      const waiting = parentItems(S.date).filter(function (x) { return x.rec.done && !x.rec.confirmed; });\n      waiting.forEach(function (x) {\n        dispatch({ t: 'item.confirm', date: S.date, kind: x.kind, id: x.id, value: true });\n      });\n      confetti(30);\n      chime(true);\n      toast('全部确认好了', 'ok');\n      break;\n    }\n\n    default: return false;   // 不是这一组的动作\n  }\n  return true;\n}\n\n/**\n * 有效期字段在表单里是以 JSON 字符串传出来的（隐藏 input 只能存字符串），\n * 这里解析一下；解析不了就当长期，别让整个保存失败。\n */\nfunction parseSched(v) {\n  if (v && typeof v === 'object') return v;\n  try {\n    const o = JSON.parse(String(v || ''));\n    return (o && typeof o === 'object') ? o : C.emptySched();\n  } catch {\n    return C.emptySched();\n  }\n}\n\n/**\n * 每日任务的「有效期」字段（第 81 轮：原来的「截止」）。\n *\n * 三种写法，用一排 chip 切：\n *   · 长期            —— 天天有效（默认）\n *   · 指定日期        —— 可以加好几个具体日期，只在这些天有效\n *   · 按周几/节假日   —— 勾周几、勾节假日；再可选填一个区间（从…到…）\n *                        「X月X日到X月X日」就是这个模式不勾周几\n *\n * 真实值是一个 JSON 字符串，放在隐藏 input（`data-key=\"sched\"`）里，\n * 由 formModal 收集、调用方 JSON.parse 一下。\n */\nfunction schedFieldNode(task) {\n  const wrap = document.createElement('div');\n  wrap.className = 'sched-field';\n  let cur = C.taskSched(task || {});\n\n  const hidden = document.createElement('input');\n  hidden.type = 'hidden';\n  hidden.dataset.key = 'sched';\n  wrap.appendChild(hidden);\n\n  const body = document.createElement('div');\n  body.className = 'sched-body';\n  wrap.appendChild(body);\n\n  const sync = function () {\n    /*\n     * 注意：**UI 用 cur，存出去的值用 normalizeSched(cur)**。\n     * 踩过：直接 cur = normalizeSched(cur) 的话，家长把最后一个日期删掉时\n     * 模式会被悄悄规整回「长期」，选日期的界面直接消失 —— 他会以为点坏了。\n     * 所以界面上保持他的选择，只在保存时规整（- 空的话就是长期）。\n     */\n    hidden.value = JSON.stringify(C.normalizeSched(cur));\n    body.innerHTML = '';\n\n    /* ① 三个模式 */\n    const modes = [\n      { key: 'always', label: '长期' },\n      { key: 'dates', label: '指定日期' },\n      { key: 'weekdays', label: '按周几/节假日' },\n    ];\n    const modeRow = document.createElement('div');\n    modeRow.className = 'chip-picks inline sched-modes';\n    modes.forEach(function (m) {\n      const b = document.createElement('button');\n      b.type = 'button';\n      b.className = 'chip' + (cur.mode === m.key ? ' on' : '');\n      b.textContent = m.label;\n      b.addEventListener('click', function () {\n        if (cur.mode === m.key) return;\n        cur.mode = m.key;\n        // 切过去时给个合理默认，别让\"指定日期\"空着（空会被规整回长期）\n        if (m.key === 'dates' && !cur.dates.length) cur.dates = [C.todayKey()];\n        if (m.key === 'weekdays' && !cur.days.length && !cur.from && !cur.to) {\n          // 默认勾**今天这个星期几**：最可能是家长想表达的那个，也不会跟后面点的选项打架\n          cur.days = [C.parseDateKey(C.todayKey()).getDay()];\n        }\n        sync();\n      });\n      modeRow.appendChild(b);\n    });\n    body.appendChild(modeRow);\n\n    /* ② 指定日期：已选的列出来（可删），再加一个 */\n    if (cur.mode === 'dates') {\n      const list = document.createElement('div');\n      list.className = 'chip-picks inline sched-dates';\n      cur.dates.forEach(function (d) {\n        const b = document.createElement('button');\n        b.type = 'button';\n        b.className = 'chip on';\n        b.textContent = d.slice(5) + ' ✕';\n        b.title = d + '（点一下删掉）';\n        b.addEventListener('click', function () {\n          cur.dates = cur.dates.filter(function (x) { return x !== d; });\n          sync();\n        });\n        list.appendChild(b);\n      });\n      if (!cur.dates.length) {\n        const none = document.createElement('span');\n        none.className = 'hint';\n        none.style.margin = '0';\n        none.textContent = '还没选日期 —— 一个都不选的话会当成「长期」';\n        list.appendChild(none);\n      }\n      const adder = document.createElement('input');\n      adder.type = 'date';\n      adder.className = 'field sched-date-add';\n      adder.title = '选一个日期加进去';\n      adder.addEventListener('change', function () {\n        if (!adder.value) return;\n        if (cur.dates.indexOf(adder.value) < 0) cur.dates.push(adder.value);\n        /*\n         * 多个指定日期**从小到大排**（第 82 轮）：不排的话就按\"加的先后\"显示，\n         * 先加 11-01 再加 10-20 就成了「11-01、10-20」，看着很怪。\n         */\n        cur.dates.sort();\n        sync();\n      });\n      const addWrap = document.createElement('span');\n      addWrap.className = 'sched-add';\n      addWrap.appendChild(adder);\n      const tip = document.createElement('span');\n      tip.className = 'att-tip';\n      tip.textContent = '选个日期就加进去（可加多个）';\n      addWrap.appendChild(tip);\n      list.appendChild(addWrap);\n      body.appendChild(list);\n    }\n\n    /* ③ 按周几/节假日：七个周几 + 节假日 + 可选区间 */\n    if (cur.mode === 'weekdays') {\n      const wdRow = document.createElement('div');\n      wdRow.className = 'chip-picks inline sched-days';\n      // 按**周一到周日**排（C.WEEKDAY_NAMES 是 0=周日 起的，这里换个顺序渲染）\n      [1, 2, 3, 4, 5, 6, 0].forEach(function (i) {\n        const b = document.createElement('button');\n        b.type = 'button';\n        b.className = 'chip' + (cur.days.indexOf(i) >= 0 ? ' on' : '');\n        b.textContent = C.WEEKDAY_NAMES[i];\n        b.addEventListener('click', function () {\n          if (cur.days.indexOf(i) >= 0) cur.days = cur.days.filter(function (x) { return x !== i; });\n          else cur.days.push(i);\n          sync();\n        });\n        wdRow.appendChild(b);\n      });\n      const hb = document.createElement('button');\n      hb.type = 'button';\n      hb.className = 'chip' + (cur.days.indexOf(C.HOLIDAY_KEY) >= 0 ? ' on' : '');\n      hb.textContent = '节假日';\n      hb.title = '在「设置 → 法定节假日」里维护的那几天';\n      hb.addEventListener('click', function () {\n        if (cur.days.indexOf(C.HOLIDAY_KEY) >= 0) {\n          cur.days = cur.days.filter(function (x) { return x !== C.HOLIDAY_KEY; });\n        } else cur.days.push(C.HOLIDAY_KEY);\n        sync();\n      });\n      wdRow.appendChild(hb);\n      body.appendChild(wdRow);\n\n      const rangeRow = document.createElement('div');\n      rangeRow.className = 'chip-picks inline sched-range';\n      const from = document.createElement('input');\n      from.type = 'date';\n      from.className = 'field';\n      from.value = cur.from || '';\n      from.title = '从这天开始（可留空）';\n      const to = document.createElement('input');\n      to.type = 'date';\n      to.className = 'field';\n      to.value = cur.to || '';\n      to.title = '到这天为止（可留空）';\n      const dash = document.createElement('span');\n      dash.className = 'sched-dash';\n      dash.textContent = '～';\n      const labels = function () {\n        from.addEventListener('change', function () { cur.from = from.value || ''; sync(); });\n        to.addEventListener('change', function () { cur.to = to.value || ''; sync(); });\n      };\n      labels();\n      const lt = document.createElement('span');\n      lt.className = 'hint';\n      lt.style.margin = '0';\n      lt.textContent = '不限日期就留空';\n      rangeRow.appendChild(from);\n      rangeRow.appendChild(dash);\n      rangeRow.appendChild(to);\n      rangeRow.appendChild(lt);\n      body.appendChild(rangeRow);\n    }\n  };\n\n  sync();\n  return wrap;\n}\n\n/**\n * 「新增每日任务」的弹窗。`pre` 有值时用来预填（第 76 轮：从作业/任务转过来）。\n *\n * 要素顺序（第 66 轮 2 + 第 75 轮）：图标 → 任务 → 标签 → 备注 → 附件 → 截止 → 小红花\n */\nfunction openTaskForm(pre) {\n  const p = pre || {};\n  /*\n   * 附件先攒在草稿里（S.draftTaskAttach），点保存时跟着任务一起存进去。\n   * 放模块级是因为\"删掉一个\"要在别的地方处理（见 task-add-att-del）。\n   */\n  S.draftTaskAttach = C.normalizeAttachments(p.attachments);\n  const addAttNode = document.createElement('div');\n  addAttNode.className = 'att-field';\n  const renderAddAtt = function () {\n    addAttNode.innerHTML = attachBox(S.draftTaskAttach, {\n      key: 'task-add', addLabel: '📎 加附件（图片 / 视频 / 文本）',\n      removeAct: 'task-add-att-del',\n    });\n    bindAttachBoxes(addAttNode);\n  };\n  pendingAttach['task-add'] = function (got) {\n    S.draftTaskAttach = C.normalizeAttachments(S.draftTaskAttach.concat(got));\n    renderAddAtt();\n    toast('加了 ' + got.length + ' 个附件', 'ok');\n  };\n  renderAddAtt();\n  formModal(p.title ? '添加到每日任务' : '新增每日任务', [\n    { key: 'emoji', label: '图标', type: 'icon', value: p.emoji || '🌟', picks: COMMON_ICONS },\n    { key: 'title', label: '任务', maxlength: 60, value: p.title || '', placeholder: '例如：跳绳 200 个' },\n    /*\n     * 从作业转过来的话，标签默认「功课」（第 76 轮 2），\n     * 但这里就是普通的输入框 + 快捷选项，家长想改成「生活 / 精神」随时可以。\n     */\n    { key: 'tag', label: '标签', type: 'chips', inline: true, picks: C.TASK_TAGS,\n      value: p.tag || C.TASK_TAGS[0], maxlength: 8, placeholder: '自己写也行' },\n    { key: 'note', label: '备注', type: 'textarea', rows: 3, maxlength: 500,\n      value: p.note || '', placeholder: '可留空；可以写好几行，比如做到什么程度算完成' },\n    { type: 'node', label: '附件', node: addAttNode },\n    { type: 'node', label: '有效期', node: schedFieldNode(p.sched) },\n    { key: 'points', label: '小红花', type: 'number',\n      value: p.points != null ? p.points : 2, min: 0, max: 99 },\n  ], function (v) {\n    if (!v.title.trim()) return;\n    dispatch({\n      t: 'task.add',\n      item: { id: C.newId('t'), emoji: v.emoji.trim() || '🌟', title: v.title.trim(),\n        tag: v.tag.trim() || C.TASK_TAGS[0], sched: parseSched(v.sched), note: v.note.trim(),\n        attachments: S.draftTaskAttach, points: v.points },\n    });\n    S.draftTaskAttach = [];\n  });\n}\n\n/**\n * 把一条作业/任务存进常用作业库。同名会先问一句要不要覆盖。\n * （原来是 ☆ 直接干的事，第 76 轮抽出来，因为 ☆ 现在要先让家长选存哪儿。）\n */\nfunction saveToCommon(src) {\n  const same = (S.state.commonHomeworks || []).filter(function (x) {\n    return x.title === src.title;\n  })[0];\n  if (same) {\n    const old = '「' + (same.subject || '其他') + '」' +\n      (same.detail ? '备注：' + same.detail : '没有备注');\n    const now = '「' + (src.subject || '其他') + '」' +\n      (src.detail ? '备注：' + src.detail : '没有备注');\n    confirmModal('常用库里已经有同名的',\n      '「' + src.title + '」已经在常用库里了。\\n\\n库里的：' + old + '\\n这一条：' + now +\n      '\\n\\n要用这一条的科目和备注覆盖它吗？',\n      function () {\n        dispatch({ t: 'common.update', id: same.id,\n          patch: { subject: src.subject, detail: src.detail } });\n        toast('已覆盖常用库里的那一条', 'ok');\n      }, '覆盖');\n    return;\n  }\n  dispatch({ t: 'common.add', item: { id: C.newId('ch'), subject: src.subject,\n    title: src.title, detail: src.detail, attachments: src.attachments } });\n  toast('存进常用库了（含备注）☆', 'ok');\n}\n\n/** handleTaskRewardAction：10 个动作 */\nfunction handleTaskRewardAction(act, el, e) {\n  switch (act) {\n    case 'task-add': {\n      openTaskForm(null);\n      break;\n    }\n    case 'task-edit': {\n      const t = S.state.dailyTasks.filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!t) break;\n      /*\n       * 修改时附件是**传完立刻存**的（和「修改作业」一样）——\n       * 任务已经存在，不用等保存。\n       */\n      const attNode = document.createElement('div');\n      attNode.className = 'att-field';\n      const renderAtt = function () {\n        attNode.innerHTML = attachBox(t.attachments, {\n          key: 'task-edit', itemId: t.id, kind: 'task', scope: 'item',\n          addLabel: '📎 加附件（图片 / 视频 / 文本）', removeAct: 'task-edit-att-del',\n        });\n        bindAttachBoxes(attNode);\n      };\n      pendingAttach['task-edit'] = function (got) {\n        got.forEach(function (f) {\n          dispatch({ t: 'attach.add', date: S.date, kind: 'task', id: t.id, scope: 'item', file: f });\n        });\n        t.attachments = C.normalizeAttachments((t.attachments || []).concat(got));\n        renderAtt();\n        toast('加了 ' + got.length + ' 个附件', 'ok');\n      };\n      renderAtt();\n      // 和新增同一个顺序（第 66 轮 2 + 第 75 轮）\n      formModal('修改每日任务', [\n        { key: 'emoji', label: '图标', type: 'icon', value: t.emoji, picks: COMMON_ICONS },\n        { key: 'title', label: '任务', maxlength: 60, value: t.title },\n        { key: 'tag', label: '标签', type: 'chips', inline: true, picks: C.TASK_TAGS,\n          value: t.tag || C.TASK_TAGS[0], maxlength: 8, placeholder: '自己写也行' },\n        { key: 'note', label: '备注', type: 'textarea', rows: 3, maxlength: 500, value: t.note || '', placeholder: '可留空；可以写好几行' },\n        { type: 'node', label: '附件', node: attNode },\n        { type: 'node', label: '有效期', node: schedFieldNode(t) },\n        { key: 'points', label: '小红花', type: 'number', value: t.points, min: 0, max: 99 },\n      ], function (v) {\n        dispatch({\n          t: 'task.update', id: t.id,\n          patch: { emoji: v.emoji.trim() || '🌟', title: v.title.trim(),\n            tag: v.tag.trim() || C.TASK_TAGS[0], sched: parseSched(v.sched),\n            note: v.note.trim(), points: v.points },\n        });\n      });\n      break;\n    }\n    case 'task-toggle': {\n      const t = S.state.dailyTasks.filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!t) break;\n      // 只改启用状态，不碰积分和流水 —— 之前挣到的分照旧\n      dispatch({ t: 'task.update', id: t.id, patch: { active: t.active === false } });\n      break;\n    }\n    case 'reward-toggle': {\n      const r = S.state.rewards.filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!r) break;\n      dispatch({ t: 'reward.update', id: r.id, patch: { active: r.active === false } });\n      break;\n    }\n    case 'task-del': {\n      const t = S.state.dailyTasks.filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!t) break;\n      /*\n       * 第 91 轮：删除改成**软删除**（只打标记），所以历史记录一定还在 ——\n       * 以前完成过的那天翻回去看照样有。这里要带上 date：\n       * deletedAt 由 op 带过去，客户端和服务器重放才一致（不能各自调 todayKey）。\n       */\n      confirmModal('删除每日任务',\n        '删掉「' + t.title + '」？\\n\\n以前完成过的那些天**记录都保留**，' +\n        '翻回去看还在；只是从今天起不再出现在任务里。',\n        function () {\n          dispatch({ t: 'task.remove', id: t.id, date: C.todayKey() });\n        }, '删除');\n      break;\n    }\n\n    case 'reward-add': {\n      formModal('新增奖励', [\n        { key: 'emoji', label: '图标', type: 'icon', value: '🎁', picks: COMMON_ICONS },\n        { key: 'title', label: '奖励', value: '', placeholder: '例如：去公园玩一次' },\n        { key: 'cost', label: '需要', type: 'number', value: 20, min: 0, max: 999 },\n      ], function (v) {\n        if (!v.title.trim()) return;\n        dispatch({ t: 'reward.add', item: { id: C.newId('r'), emoji: v.emoji.trim() || '🎁', title: v.title.trim(), cost: v.cost } });\n      });\n      break;\n    }\n    case 'reward-edit': {\n      const r = S.state.rewards.filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!r) break;\n      formModal('修改奖励', [\n        { key: 'emoji', label: '图标', type: 'icon', value: r.emoji, picks: COMMON_ICONS },\n        { key: 'title', label: '奖励', value: r.title },\n        { key: 'cost', label: '需要', type: 'number', value: r.cost, min: 0, max: 999 },\n      ], function (v) {\n        dispatch({ t: 'reward.update', id: r.id, patch: { emoji: v.emoji.trim() || '🎁', title: v.title.trim(), cost: v.cost } });\n      });\n      break;\n    }\n    case 'reward-del': {\n      const r = S.state.rewards.filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!r) break;\n      confirmModal('删除奖励', '删掉「' + r.title + '」？', function () {\n        dispatch({ t: 'reward.remove', id: r.id });\n      }, '删除');\n      break;\n    }\n    case 'redeem-fulfill':\n      dispatch({ t: 'redeem.status', id: el.dataset.id, status: 'done' });\n      toast('已兑现 🎉', 'ok');\n      break;\n    case 'redeem-reject': {\n      const rd = S.state.redemptions.filter(function (x) { return x.id === el.dataset.id; })[0];\n      if (!rd) break;\n      openRejectDialog(rd);\n      break;\n    }\n    case 'redeem-undo': {\n      // 已兑现的退回\"孩子想兑换\"，让家长重新决定\n      dispatch({ t: 'redeem.status', id: el.dataset.id, status: 'pending' });\n      toast('已退回待处理');\n      break;\n    }\n\n    default: return false;   // 不是这一组的动作\n  }\n  return true;\n}\n\n/** handleRoomAction：11 个动作 */\nfunction handleRoomAction(act, el, e) {\n  switch (act) {\n    case 'copy-link': copyText(location.origin + location.pathname + '?room=' + S.room, '网址已复制，发到家里设备上打开'); break;\n    case 'copy-room': copyText(S.room, '房间码已复制'); break;\n\n    /* ---- 房间管理 ---- */\n    case 'room-save-mine': {\n      const rn = $('#set-roomname');\n      const cn = $('#set-childname');\n      const name = rn ? rn.value.trim() : '';\n      const child = (cn && cn.value.trim()) || '宝贝';\n      dispatch({ t: 'settings', patch: { roomName: name, childName: child } });\n      // 列表里那一行也得跟着变，不然它显示的还是改名之前拉下来的旧名字\n      if (S.roomList) {\n        const me = S.roomList.filter(function (r) { return r.code === S.room; })[0];\n        if (me) {\n          me.name = C.roomNameOf({ settings: { roomName: name, childName: child } });\n          me.childName = child;\n        }\n      }\n      rememberRoom(S.room, C.roomNameOf({ settings: { roomName: name, childName: child } }));\n      toast('改好了');\n      render();\n      break;\n    }\n    case 'room-copy': copyText(el.dataset.url, '这个房间的网址已复制'); break;\n    case 'room-toggle-others':\n      S.othersOpen = !S.othersOpen;\n      render();\n      break;\n    case 'room-edit':\n      openRoomEditModal(el.dataset.code, el.dataset.name, el.dataset.child);\n      break;\n    case 'room-del': {\n      const code = el.dataset.code;\n      // 三道闸：正在用的不能删、最后一个不能删、删之前必须先有口令\n      if (code === S.room) {\n        toast('正在使用的房间不能删除，先切到别的房间', 'warn');\n        break;\n      }\n      if ((S.roomList || []).length <= 1) {\n        toast('至少要保留一个房间', 'warn');\n        break;\n      }\n      if (!(S.adminState && S.adminState.configured)) {\n        S.pendingDelete = { code: code, name: el.dataset.name };\n        toast('删房间要先设一个管理口令');\n        openAdminKeyModal();\n        break;\n      }\n      openRoomDeleteModal(code, el.dataset.name);\n      break;\n    }\n    case 'room-switch': switchRoom(el.dataset.code); break;\n    case 'room-new': openNewRoomModal(); break;\n    case 'room-refresh':\n      if (S.adminState == null) loadAdminState();\n      else loadRoomList();\n      break;\n    case 'admin-key': openAdminKeyModal(); break;\n    default: return false;   // 不是这一组的动作\n  }\n  return true;\n}\n\n/** handleSettingsAction：7 个动作 */\nfunction handleSettingsAction(act, el, e) {\n  switch (act) {\n    case 'set-save': saveSettings(); break;\n    case 'export': exportBackup(); break;\n    case 'import': importBackup(); break;\n    case 'reset-day':\n      confirmModal('清空这一天', '会删掉' + C.friendlyDate(S.date) + '的所有作业、任务和打勾记录，确定吗？', function () {\n        dispatch({ t: 'reset', scope: 'day', date: S.date });\n      }, '清空');\n      break;\n    case 'reset-points':\n      confirmModal('清空小红花', '小红花余额和全部记录都会归零，确定吗？', function () {\n        dispatch({ t: 'reset', scope: 'points' });\n      }, '清空');\n      break;\n    case 'reset-all':\n      confirmModal('全部重来', '作业、任务、小红花全部清空，回到刚建站的样子（设置会保留）。确定吗？', function () {\n        dispatch({ t: 'reset', scope: 'all' });\n      }, '全部重来');\n      break;\n    /*\n     * 数字框的上下加减。夹在 data-min / data-max 之间（有就夹），\n     * 空着当 0 处理，这样从空点一下「加」就是 1。\n     */\n    case 'num-step': {\n      /*\n       * 定位被加减的输入框：设置页那种直接给 id；表单弹窗里的输入框没有 id\n       * （值是按 data-key 收的），所以退一步按 data-key 找。\n       */\n      const key = el.dataset.for;\n      const target = document.getElementById(key) ||\n        document.querySelector('.modal [data-key=\"' + key + '\"]');\n      if (!target) break;\n      const delta = Number(el.dataset.delta) || 0;\n      const raw = String(target.value || '').trim();\n      const cur = raw === '' ? 0 : Number(raw);\n      let next = (isFinite(cur) ? cur : 0) + delta;\n      const min = target.dataset.min === undefined ? -9999 : Number(target.dataset.min);\n      const max = target.dataset.max === undefined ? 9999 : Number(target.dataset.max);\n      if (isFinite(min)) next = Math.max(min, next);\n      if (isFinite(max)) next = Math.min(max, next);\n      let out = String(next);\n      if (target.maxLength > 0 && out.length > target.maxLength) out = out.slice(0, target.maxLength);\n      target.value = out;\n      target.dispatchEvent(new Event('input', { bubbles: true }));\n      break;\n    }\n    case 'retry':\n      S.mode = 'server';\n      poll().then(function () { toast(S.online ? '连上了' : '还是连不上', S.online ? 'ok' : 'err'); });\n      break;\n    default: return false;   // 不是这一组的动作\n  }\n  return true;\n}\n\nfunction commitHomework(items) {\n  if (!items || !items.length) { toast('没有要添加的内容', 'err'); return; }\n  dispatch({\n    t: 'hw.add',\n    date: S.date,\n    items: items.map(function (p) {\n      // id 由客户端先造好塞进 op —— 两边算出来的必须一样，见 core.js 的 useId\n      return { id: C.newId('h'), subject: p.subject, title: p.title, detail: p.detail,\n        attachments: p.attachments };\n    }),\n  });\n  S.preview = [];\n  const box = $('#paste-box');\n  if (box) box.value = '';\n  chime(true);\n  toast('已添加到' + C.friendlyDate(S.date) + ' 🎉', 'ok');\n}\n\nfunction onChange(e) {\n  const id = e.target.id;\n  if (id === 'pref-big') { prefs.big = e.target.checked; savePrefs(); applyFontSize(); }\n  if (id === 'pref-voice') { prefs.voice = e.target.checked; savePrefs(); }\n}\n\n/* ============================================================ 绑定 */\n\n/*\n * 按下时记住手指/鼠标底下的 [data-act] 按钮。\n *\n * 除了元素本身，还记一个**用 data 属性拼出来的选择器** —— 因为 render() 会把\n * 整个列表重建，按下时那个元素会变成\"已分离\"（不在 document 里）的孤儿。\n * 光记元素的话，抬起时 find 回来的是孤儿，只能放弃；有了选择器就能在新 DOM 里\n * 找回\"同一个按钮\"，把这一下补回来。\n */\nlet pressedAct = null;\n\nfunction actSelector(el) {\n  const d = el.dataset || {};\n  let sel = '[data-act=\"' + String(d.act).replace(/\"/g, '\\\\\"') + '\"]';\n  // 只挑能唯一标识\"同一个按钮\"的字段，别把 className 之类算进去\n  ['id', 'list', 'dir', 'kind', 'date', 'tab', 'view', 'i'].forEach(function (k) {\n    if (d[k] !== undefined && d[k] !== '') {\n      sel += '[data-' + k + '=\"' + String(d[k]).replace(/\"/g, '\\\\\"') + '\"]';\n    }\n  });\n  return sel;\n}\n\ndocument.addEventListener('pointerdown', function (e) {\n  const t = e.target;\n  const el = (t && t.closest) ? t.closest('[data-act]') : null;\n  pressedAct = el ? { el: el, sel: actSelector(el), x: e.clientX, y: e.clientY, t: Date.now() } : null;\n}, true);\n\n/**\n * 把\"按下时记住的那个按钮\"的动作补上。\n * 元素还在就直接用；被 render() 换掉了就用选择器在新 DOM 里找同一个按钮。\n */\nfunction runPressedAction(p, x, y) {\n  if (!p) return false;\n  if (Date.now() - p.t > 1500) return false;\n  // 位置差得多说明是在滑动页面，不是在点按钮\n  if (Math.abs(x - p.x) > 14 || Math.abs(y - p.y) > 14) return false;\n  let target = (p.el && document.contains(p.el)) ? p.el : null;\n  if (!target && p.sel) {\n    try { target = document.querySelector(p.sel); } catch (err) { target = null; }\n  }\n  if (!target) return false;\n  onViewClick({ target: target, preventDefault: function () {}, stopPropagation: function () {} });\n  return true;\n}\n\n/*\n * 兜底的触发点：pointerup。\n *\n * 为什么不写在 click 里：**按下时那个元素如果在抬起之前被删掉了，\n * 浏览器干脆不派发 click**（规范行为）。而 render() 会把整个列表重建，\n * 于是\"按下 → 同步完成重渲染 → 抬起\"这条路径上 click 根本不来，\n * 写在 click 里的兜底永远没机会跑。pointerup 是一定会来的。\n *\n * 怕重复触发：click 正常派发时会先把 pressedAct 清掉，\n * 这里等一小会儿再检查，发现已经被清掉就什么都不做。\n */\ndocument.addEventListener('pointerup', function (e) {\n  const p = pressedAct;\n  if (!p) return;\n  const x = e.clientX;\n  const y = e.clientY;\n  setTimeout(function () {\n    if (pressedAct !== p) return;   // click 已经处理过了\n    runPressedAction(p, x, y);\n    pressedAct = null;\n  }, 50);\n}, true);\n\ndocument.addEventListener('click', function (e) {\n  if (e.target.closest('#btn-update')) { location.reload(); return; }\n  if (e.target.closest('#btn-version')) { openChangelog(); return; }\n  const tab = e.target.closest('#tabbar .tab');\n  if (tab) {\n    S.view = tab.dataset.view;\n    if (S.view !== 'parent') S.parentTab = S.parentTab || 'hw';\n    // 切回家长页算\"人回来了\"；离开则不重置，让 30 秒计时自然到期\n    if (S.view === 'parent') touchParentLock();\n    render();\n    scrollToTop(true);\n    return;\n  }\n  if (e.target.closest('#btn-sound')) {\n    prefs.voice = !prefs.voice;\n    savePrefs();\n    render();\n    toast(prefs.voice ? '朗读已打开' : '朗读已关闭');\n    return;\n  }\n  if (e.target.closest('#btn-font')) {\n    prefs.big = !prefs.big;\n    savePrefs();\n    applyFontSize();\n    toast(prefs.big ? '大字模式' : '普通字号');\n    return;\n  }\n  /*\n   * 先看这一下点到的到底是什么。\n   *\n   * 关键：**不能先看区域再找按钮**。按下和抬起之间页面重排时，浏览器把 click\n   * 派发到\"按下点\"和\"抬起点\"的**共同祖先**上 —— 那个祖先通常是 #view 本身，\n   * 区域判断会通过，但里面根本没有 [data-act]，于是什么也不做。\n   * 所以先判断\"有没有点到按钮\"，没点到才走下面的兜底。\n   */\n  const hit = (e.target && e.target.closest) ? e.target.closest('[data-act]') : null;\n  if (hit) {\n    /*\n     * 只在这些区域里才走 onViewClick。\n     * **弹窗一定要算进来**：弹窗是挂在 body 上的兄弟节点，不在 #view 里面。\n     * 漏掉它的话，弹窗里任何靠 data-act 委托的按钮都收不到点击\n     * （踩过：任务/奖励里的上下加减）。\n     */\n    if (e.target.closest('#view') || e.target.closest('#rest') || e.target.closest('#focusmask') ||\n        e.target.closest('.modal')) {\n      onViewClick(e);\n    }\n    pressedAct = null;\n    return;\n  }\n  /*\n   * 兜底（走 click 的这一路）：按下和抬起之间内容动了位置，按钮从手指底下挪走了。\n   * click 会派发到\"按下点\"和\"抬起点\"的共同祖先上（通常是 #view），那里没有\n   * data-act，于是什么也不做 —— 用按下时记下的按钮补一刀。\n   *\n   * \"元素被整个重建\"那条路径 click 根本不来，由上面的 pointerup 兜。\n   */\n  runPressedAction(pressedAct, e.clientX, e.clientY);\n  pressedAct = null;\n});\n\ndocument.addEventListener('change', onChange);\n\ndocument.addEventListener('keydown', function (e) {\n  if (e.key === 'Escape') closeModal();\n});\n\n/* 孩子点卡片时给一点\"反馈感\" */\ndocument.addEventListener('animationend', function (e) {\n  if (e.target.classList && e.target.classList.contains('pop')) e.target.classList.remove('pop');\n});\n\nwindow.addEventListener('online', function () { poll(); });\nwindow.addEventListener('offline', function () { S.online = false; setSync('off'); });\n\nboot().catch(function (err) {\n  S.bootMsg = '打开失败：' + (err && err.message);\n  S.bootActions = [{ label: '重新加载', cls: 'primary', onClick: function () { location.reload(); } }];\n  bootUI();\n});","/ui.js":"/*\n * 纯 UI 原语：转义、选择器、提示条、音效、撒花、弹窗系统。\n *\n * 这里**不碰应用状态**（不认识 S / prefs / 房间）—— 所以谁都能用，也不会跟\n * app.js 互相牵制。唯一需要外部告诉它的是\"朗读开没开\"，\n * 那个走 speak(text, enabled) 的参数，不做隐藏的状态同步，\n * 免得哪天忘了同步导致朗读静默失效。\n *\n * app.js 从这里 import；单文件 Worker 打包时 index.html / app.js / ui.js 都要\n * 作为静态资源带上（见 scripts/build-worker.mjs 的 STATIC_FILES）。\n */\n\nexport function esc(s) {\n  return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) {\n    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c];\n  });\n}\n\nexport function $(sel, root) { return (root || document).querySelector(sel); }\n\n/* ------------------------------------------------------------ 轻提示 */\n\n/** 提示条。ms 是可选的显示时长（很重要的错误可以留久一点） */\nexport function toast(msg, kind, ms) {\n  const root = $('#toast-root');\n  if (!root) return;\n  const el = document.createElement('div');\n  el.className = 'toast ' + (kind || '');\n  el.textContent = msg;\n  root.appendChild(el);\n  setTimeout(function () {\n    el.style.transition = 'opacity .25s ease';\n    el.style.opacity = '0';\n    setTimeout(function () { el.remove(); }, 260);\n  }, Math.max(1000, Number(ms) || 2200));\n}\n\n/* ------------------------------------------------------------ 音效 / 撒花 */\n\nlet audioCtx = null;\nexport function chime(up) {\n  try {\n    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();\n    const now = audioCtx.currentTime;\n    (up ? [660, 880, 1180] : [520, 400]).forEach(function (f, i) {\n      const o = audioCtx.createOscillator();\n      const g = audioCtx.createGain();\n      o.type = 'sine';\n      o.frequency.value = f;\n      g.gain.setValueAtTime(0.0001, now + i * 0.09);\n      g.gain.exponentialRampToValueAtTime(0.16, now + i * 0.09 + 0.02);\n      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.22);\n      o.connect(g); g.connect(audioCtx.destination);\n      o.start(now + i * 0.09); o.stop(now + i * 0.09 + 0.26);\n    });\n  } catch (e) { /* 静音就算了 */ }\n}\n\n/** 朗读。enabled 由调用方传（app.js 传 prefs.voice），不在这里读全局状态 */\nexport function speak(text, enabled) {\n  if (!enabled || !('speechSynthesis' in window)) return;\n  try {\n    window.speechSynthesis.cancel();\n    const u = new SpeechSynthesisUtterance(String(text));\n    u.lang = 'zh-CN';\n    u.rate = 0.92;\n    u.pitch = 1.05;\n    window.speechSynthesis.speak(u);\n  } catch (e) { /* ignore */ }\n}\n\nexport function confetti(n) {\n  const root = $('#confetti');\n  if (!root) return;\n  const colors = ['#ff9f1c', '#21b573', '#3b7fd4', '#e2564a', '#8b5cf6', '#ffd166'];\n  for (let i = 0; i < (n || 70); i++) {\n    const el = document.createElement('i');\n    el.style.setProperty('--x', (Math.random() * 100).toFixed(1) + 'vw');\n    el.style.setProperty('--c', colors[i % colors.length]);\n    el.style.setProperty('--dur', (1.7 + Math.random() * 1.5).toFixed(2) + 's');\n    el.style.setProperty('--delay', (Math.random() * 0.6).toFixed(2) + 's');\n    el.style.setProperty('--rot', (Math.random() * 840 - 420).toFixed(0) + 'deg');\n    root.appendChild(el);\n    setTimeout(function () { el.remove(); }, 4000);\n  }\n}\n\n/* ------------------------------------------------------------ 弹窗 */\n\nlet modalEl = null;\n\nexport function closeModal() {\n  if (modalEl) { modalEl.remove(); modalEl = null; }\n}\n\n/* 第 89 轮：原来的「还能写 N 字」计数已按家长要求去掉，\n   maxlength 本身保留（超了照样写不进去，只是不再显示还剩多少）。 */\n\nexport function openModal(opt) {\n  closeModal();\n  const mask = document.createElement('div');\n  mask.className = 'modal-mask';\n  const box = document.createElement('div');\n  box.className = 'modal' + (opt.cls ? ' ' + opt.cls : '');\n  if (opt.title) {\n    const h = document.createElement('h3');\n    h.textContent = opt.title;\n    box.appendChild(h);\n  }\n  if (opt.bodyNode) box.appendChild(opt.bodyNode);\n  if (opt.html) {\n    const d = document.createElement('div');\n    d.className = 'modal-body';\n    d.innerHTML = opt.html;\n    box.appendChild(d);\n  }\n  const actions = document.createElement('div');\n  actions.className = 'modal-actions';\n  (opt.actions || []).forEach(function (a) {\n    const b = document.createElement('button');\n    b.className = 'btn ' + (a.cls || 'ghost');\n    b.textContent = a.label;\n    b.addEventListener('click', function () { a.onClick && a.onClick(); });\n    actions.appendChild(b);\n  });\n  if (actions.children.length) box.appendChild(actions);\n  mask.appendChild(box);\n  /*\n   * 第 86 轮：**关掉\"轻量关闭\"** —— 点遮罩层不再关弹窗。\n   *\n   * 原来 mask 上挂了 click，点框外面那圈半透明就关掉。家长在编辑时\n   * 鼠标稍微划出弹窗（尤其是拖动选文字、点到边缘）就把整张表单弄没了，\n   * 填的内容全丢。现在只有**明确点「取消 / 关闭 / 确定」**才关。\n   *\n   * 键盘 Esc 也算明确动作，但这里本来就没绑 Esc，所以不用动。\n   */\n  $('#modal-root').appendChild(mask);\n  modalEl = mask;\n  return box;\n}\n\nexport function confirmModal(title, text, onYes, yesLabel) {\n  openModal({\n    title: title,\n    html: '<p>' + esc(text) + '</p>',\n    actions: [\n      { label: '先不要', cls: 'ghost', onClick: closeModal },\n      {\n        label: yesLabel || '确定', cls: 'primary', onClick: function () {\n          closeModal();\n          onYes();\n        }\n      },\n    ],\n  });\n}\n\n/**\n * 一个通用表单弹窗。\n *   fields: [{ key, label, value, type?, rows?, maxlength?, options?, picks?, placeholder? }]\n *   onSubmit(values)  values 按 key 收好；里面可以直接读 .value（都是字符串）\n */\nexport function formModal(title, fields, onSubmit) {\n  const body = document.createElement('div');\n  fields.forEach(function (f) {\n    const row = document.createElement('div');\n    row.className = 'form-row';\n    const lab = document.createElement('label');\n    lab.textContent = f.label;\n    row.appendChild(lab);\n\n    /*\n     * type:'node' —— 调用方自己给一个已经搭好的 DOM（附件上传这种）。\n     * 值由调用方自己塞进一个 <input data-key=... hidden> 里，\n     * 下面收集值的逻辑照样能拿到，ui.js 不用认识\"附件\"是什么概念。\n     */\n    if (f.type === 'node' && f.node) {\n      row.classList.add('form-row-node');\n      if (f.block) row.classList.add('block');\n      row.appendChild(f.node);\n      body.appendChild(row);\n      return;\n    }\n    if (f.type === 'note') {\n      const p = document.createElement('p');\n      p.className = 'hint hint-lead';\n      p.style.margin = '0 0 .5rem';\n      p.textContent = f.text || '';\n      body.appendChild(p);\n      return;\n    }\n\n    // type:'icon' = 不要输入框，直接一排图标点选（值放在隐藏 input 里）\n    const iconOnly = f.type === 'icon';\n\n    let input;\n    if (iconOnly) {\n      input = document.createElement('input');\n      input.type = 'hidden';\n      input.value = f.value || (f.picks || [])[0] || '⭐';\n    } else if (f.type === 'select') {\n      input = document.createElement('select');\n      input.className = 'field';\n      (f.options || []).forEach(function (o) {\n        const op = document.createElement('option');\n        op.value = o.value;\n        op.textContent = o.label;\n        input.appendChild(op);\n      });\n    } else if (f.type === 'chips') {\n      /*\n       * 既能选预设、又能自己填：一个普通文本框 + 一排快捷选项。\n       * 点某个选项就把它填进去（再点一下取消），手打也随时可以 ——\n       * 比下拉框强的地方就是\"支持自定义填写\"。\n       */\n      input = document.createElement('input');\n      input.className = 'field';\n    } else if (f.type === 'textarea') {\n      input = document.createElement('textarea');\n      input.className = 'field';\n      input.rows = f.rows || 3;\n      // 长的标题/备注要能换行；高度跟着行数走，家长还能自己拖大\n      input.style.minHeight = ((f.rows || 3) * 1.6) + 'rem';\n      input.style.resize = 'vertical';\n      input.style.whiteSpace = 'pre-wrap';\n    } else {\n      input = document.createElement('input');\n      input.className = 'field' + (f.type === 'number' ? ' num' : '');\n      /*\n       * 数字一律用 text + inputmode=numeric，**不用 type=\"number\"**。\n       * 踩过：Chrome 在 type=number 的框里配中文字体栈，会把 -1 渲染成「1-」\n       * （负号跑到数字后面）；DOM 里的 value 还是 -1，看代码根本看不出来，\n       * 只有截图才看得见。text + inputmode 照样唤起手机数字键盘，\n       * core 里的 parseNum() 也容错。\n       */\n      input.type = 'text';\n      if (f.type === 'number') {\n        input.inputMode = 'numeric';\n        if (f.min != null) input.dataset.min = String(f.min);\n        if (f.max != null) input.dataset.max = String(f.max);\n      }\n    }\n    if (!iconOnly) input.value = f.value == null ? '' : f.value;\n    input.dataset.key = f.key;\n    if (f.placeholder) input.placeholder = f.placeholder;\n    if (f.maxlength) input.maxLength = f.maxlength;\n\n    if (iconOnly) {\n      const wrap = document.createElement('div');\n      wrap.className = 'icon-only-picker';\n      (f.picks || []).forEach(function (ic) {\n        const b = document.createElement('button');\n        b.type = 'button';\n        b.className = 'icon-pick' + (ic === input.value ? ' on' : '');\n        b.textContent = ic;\n        b.title = '选这个';\n        b.addEventListener('click', function () {\n          input.value = ic;\n          wrap.querySelectorAll('.icon-pick').forEach(function (x) { x.classList.remove('on'); });\n          b.classList.add('on');\n        });\n        wrap.appendChild(b);\n      });\n      row.appendChild(wrap);\n      row.appendChild(input);\n      body.appendChild(row);\n      return;\n    }\n\n    row.appendChild(input);\n    body.appendChild(row);\n\n    /*\n     * 数字字段再配一对上下加减按钮。\n     * 注意：input 已经被 append 进去了，这里只把「按钮壳」套在它外面，\n     * 用 wrap 包住 input 再放回原位，保持 DOM 顺序不乱。\n     */\n    if (f.type === 'number') {\n      const wrap = document.createElement('span');\n      wrap.className = 'num-wrap';\n      row.replaceChild(wrap, input);\n      wrap.appendChild(input);\n      const steps = document.createElement('span');\n      steps.className = 'num-steps';\n      [[1, '▲', '加一'], [-1, '▼', '减一']].forEach(function (s) {\n        const b = document.createElement('button');\n        b.type = 'button';\n        b.className = 'num-step';\n        b.dataset.act = 'num-step';\n        b.dataset.for = f.key;            // 表单里用 key 当定位\n        b.dataset.delta = String(s[0]);\n        b.textContent = s[1];\n        b.title = s[2];\n        b.tabIndex = -1;\n        steps.appendChild(b);\n      });\n      wrap.appendChild(steps);\n    }\n\n    /*\n     * 「既能选预设又能自己填」的字段：一排快捷选项。\n     * 默认挂在输入框下一行；`inline: true` 时**跟输入框同一行**（家长要求：\n     * 标签输入框要和「功课 / 生活 / 精神」并排，不要另起一行）。\n     */\n    if (f.type === 'chips') {\n      const picks = document.createElement('div');\n      picks.className = 'chip-picks' + (f.inline ? ' inline' : '');\n      (f.picks || []).forEach(function (v) {\n        const b = document.createElement('button');\n        b.type = 'button';\n        b.className = 'chip' + (v === input.value ? ' on' : '');\n        b.textContent = v;\n        b.addEventListener('click', function () {\n          // 已经是这个值就取消，方便\"清掉重填\"\n          const same = input.value.trim() === v;\n          input.value = same ? '' : v;\n          picks.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); });\n          if (!same) b.classList.add('on');\n          input.focus();\n        });\n        picks.appendChild(b);\n      });\n      // 手打的值如果正好等于某个预设，把那个选项也点亮\n      input.addEventListener('input', function () {\n        const v = input.value.trim();\n        picks.querySelectorAll('.chip').forEach(function (x) {\n          x.classList.toggle('on', x.textContent === v);\n        });\n      });\n      row.appendChild(picks);\n    }\n\n    /*\n     * 图标选择：点一个就填进上面的输入框。\n     *\n     * 这段是给\"文本输入框 + 一排 emoji 备选\"用的老兜底逻辑：\n     * type:'icon' 在上面就 return 了，type:'chips' 有自己的样式，\n     * 都得排除掉 —— 不排除的话 chips 字段会**多渲染一个图标格子**（踩过）。\n     */\n    if (f.picks && f.picks.length && !iconOnly && f.type !== 'chips') {\n      const picker = document.createElement('div');\n      picker.className = 'icon-picker';\n      f.picks.forEach(function (ic) {\n        const b = document.createElement('button');\n        b.type = 'button';\n        b.className = 'icon-pick';\n        b.textContent = ic;\n        b.addEventListener('click', function () {\n          input.value = ic;\n          picker.querySelectorAll('.icon-pick').forEach(function (x) { x.classList.remove('on'); });\n          b.classList.add('on');\n        });\n        if (ic === input.value) b.classList.add('on');\n        picker.appendChild(b);\n      });\n      body.appendChild(picker);\n    }\n  });\n\n  openModal({\n    title: title,\n    bodyNode: body,\n    actions: [\n      { label: '取消', cls: 'ghost', onClick: closeModal },\n      {\n        label: '保存', cls: 'primary', onClick: function () {\n          const out = {};\n          body.querySelectorAll('[data-key]').forEach(function (el) { out[el.dataset.key] = el.value; });\n          closeModal();\n          onSubmit(out);\n        }\n      },\n    ],\n  });\n}\n","/core.js":"/*\n * 作业小站 · 核心逻辑（浏览器与服务器共用，零依赖）\n *\n * 这里只放\"纯逻辑\"：数据模型、作业文本解析、操作(op)应用、积分结算。\n * 浏览器用它做\"乐观更新\"（点一下就变），服务器用同一份代码做\"最终结算\"，\n * 这样两边永远不会算得不一样。\n *\n * 约定：本文件只能使用 `export function` / `export const` 形式导出，\n * 打包成单文件 Worker 时会用正则去掉行首的 `export `。\n */\n\nconst VERSION = 1;\n\n/* ---------------------------------------------------------------- 附件 */\n\n/*\n * 附件：家长录入作业时可以传要求/资料（比如老师发的卷子照片），\n * 孩子做完也可以传成果（跳绳视频、写完的生字照片）。\n *\n * 上传走\"原始字节\"而不是 multipart —— 零依赖地把 multipart 解析对很难，\n * 而这些要求在浏览器里一行就够：\n *     fetch('/api/upload/' + room + '?name=' + encodeURIComponent(file.name),\n *           { method: 'POST', body: file })\n * 服务端收到的是纯字节，文件名从 query 拿，省掉一整套解析。\n */\n\n/** 允许上传的扩展名 → MIME + 大类。**白名单**，不在表里的一律不收 */\nexport const UPLOAD_EXTS = {\n  '.jpg': { mime: 'image/jpeg', kind: 'image' },\n  '.jpeg': { mime: 'image/jpeg', kind: 'image' },\n  '.png': { mime: 'image/png', kind: 'image' },\n  '.gif': { mime: 'image/gif', kind: 'image' },\n  '.webp': { mime: 'image/webp', kind: 'image' },\n  '.heic': { mime: 'image/heic', kind: 'image' },\n  '.bmp': { mime: 'image/bmp', kind: 'image' },\n  '.mp4': { mime: 'video/mp4', kind: 'video' },\n  '.mov': { mime: 'video/quicktime', kind: 'video' },\n  '.m4v': { mime: 'video/x-m4v', kind: 'video' },\n  '.webm': { mime: 'video/webm', kind: 'video' },\n  '.3gp': { mime: 'video/3gpp', kind: 'video' },\n  '.mp3': { mime: 'audio/mpeg', kind: 'audio' },\n  '.m4a': { mime: 'audio/mp4', kind: 'audio' },\n  '.wav': { mime: 'audio/wav', kind: 'audio' },\n  '.ogg': { mime: 'audio/ogg', kind: 'audio' },\n  '.amr': { mime: 'audio/amr', kind: 'audio' },\n  '.txt': { mime: 'text/plain; charset=utf-8', kind: 'text' },\n  '.md': { mime: 'text/plain; charset=utf-8', kind: 'text' },\n  '.csv': { mime: 'text/csv; charset=utf-8', kind: 'text' },\n  '.pdf': { mime: 'application/pdf', kind: 'file' },\n  '.doc': { mime: 'application/msword', kind: 'file' },\n  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'file' },\n  '.xls': { mime: 'application/vnd.ms-excel', kind: 'file' },\n  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'file' },\n  '.ppt': { mime: 'application/vnd.ms-powerpoint', kind: 'file' },\n  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'file' },\n  '.zip': { mime: 'application/zip', kind: 'file' },\n};\n\n/** 给 <input accept> 用：图片 / 视频 / 文本都能传 */\nexport const UPLOAD_ACCEPT = Object.keys(UPLOAD_EXTS).join(',');\n\n/** 取扩展名（小写，带点）；没有就返回 '' */\nexport function extOf(name) {\n  const m = /(\\.[A-Za-z0-9]{1,8})$/.exec(String(name || '').trim());\n  return m ? m[1].toLowerCase() : '';\n}\n\n/**\n * 看看这个文件能不能收。返回 { ok, ext, mime, kind, reason }。\n * 文件名里没有扩展名时，用浏览器给的 MIME 反推一个。\n */\nexport function checkUpload(name, mime) {\n  // 比 MIME 时只比 \"text/plain\" 这一段，`; charset=utf-8` 之类一律忽略，\n  // 不然表里写了 charset、请求里没写，就会白白认不出来（踩过）\n  const base = function (m) { return String(m || '').split(';')[0].trim().toLowerCase(); };\n  let ext = extOf(name);\n  if (!UPLOAD_EXTS[ext] && mime) {\n    const want = base(mime);\n    const hit = Object.keys(UPLOAD_EXTS).filter(function (e) {\n      return base(UPLOAD_EXTS[e].mime) === want;\n    })[0];\n    if (hit) ext = hit;\n  }\n  const spec = UPLOAD_EXTS[ext];\n  if (!spec) return { ok: false, ext: ext, reason: '不支持这种文件（' + (ext || '没有扩展名') + '）' };\n  return { ok: true, ext: ext, mime: spec.mime, kind: spec.kind };\n}\n\n/** 上传后生成的 id 长这样：<随机串>.<扩展名>，既能当文件名也一眼看得出类型 */\nexport function makeUploadId(ext) {\n  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';\n  let s = '';\n  for (let i = 0; i < 16; i++) s += abc[Math.floor(Math.random() * abc.length)];\n  return s + ext;\n}\n\n/** id 必须是我们自己生成的那种，绝不能让它带路径（防目录穿越） */\nexport function isUploadId(id) {\n  return /^[a-z0-9]{16}\\.[a-z0-9]{1,8}$/.test(String(id || ''));\n}\n\n/** 附件在浏览器里的地址 */\nexport function fileURL(room, id) {\n  return '/api/file/' + encodeURIComponent(room) + '/' + encodeURIComponent(id);\n}\n\n/** 2.4 MB → \"2.4 MB\"；给附件列表显示大小用 */\nexport function humanSize(n) {\n  const b = Number(n) || 0;\n  if (b < 1024) return b + ' B';\n  if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';\n  return (b / 1024 / 1024).toFixed(b < 1024 * 1024 * 10 ? 1 : 0) + ' MB';\n}\n\n/** 附件在列表里的图标 */\nexport function fileIcon(kind) {\n  return kind === 'image' ? '🖼' : kind === 'video' ? '🎬'\n    : kind === 'audio' ? '🎵' : kind === 'text' ? '📄' : '📎';\n}\n\n/* ------------------------------------------------------------------ 常量 */\n\nexport const SUBJECTS = [\n  { name: '语文', emoji: '📕', color: '#e05b5b', keys: ['语文', '背诵', '生字', '拼音', '写字', '课文', '古诗', '朗读', '默写', '听写', '组词', '造句', '看图写话'] },\n  { name: '数学', emoji: '📐', color: '#3b7fd4', keys: ['数学', '口算', '计算', '算术', '应用题', '加减', '乘法', '除法', '数一数', '练一练', '数学书', '数学本'] },\n  { name: '英语', emoji: '🔤', color: '#8b5cf6', keys: ['英语', '单词', '跟读', '拼读', '听力', 'unit', 'listen', 'read'] },\n  { name: '科学', emoji: '🔬', color: '#0f9d76', keys: ['科学', '观察', '实验'] },\n  { name: '美术', emoji: '🎨', color: '#e08a2b', keys: ['美术', '画画', '绘画', '手工', '涂色'] },\n  { name: '音乐', emoji: '🎵', color: '#c4529b', keys: ['音乐', '唱歌', '儿歌'] },\n  { name: '体育', emoji: '⚽', color: '#12a3a3', keys: ['体育', '跳绳', '跑步', '锻炼', '广播操'] },\n  { name: '道法', emoji: '🤝', color: '#a8763b', keys: ['道德', '法治', '道法', '品德'] },\n  { name: '其他', emoji: '📘', color: '#6b7280', keys: [] },\n];\n\nexport const MOODS = [\n  { emoji: '😄', label: '超开心' },\n  { emoji: '🙂', label: '还不错' },\n  { emoji: '😐', label: '一般般' },\n  { emoji: '😔', label: '有点累' },\n];\n\n/*\n * ------------------------------------------------------------ 每日任务的标签\n *\n * 每日任务带一个\"标签\"，位置和样式**跟作业的科目（语文/数学）完全一样**，\n * 列表里就靠它分组、排序。\n *\n * 默认三档：功课 / 生活 / 精神。家长也可以自己填别的（比如\"家务\"\"兴趣\"）。\n */\nexport const TASK_TAGS = ['功课', '生活', '精神'];\n\n/**\n * 没有截止日期的任务用这个哨兵值 —— 界面上显示成「长期」\n * （第 81 轮起改用 sched 有效期模型，这个常量只为迁移老数据保留）\n */\nexport const TASK_LONG_TERM = '9999-99-99';\n\n/* ================================================================\n * 第 81 轮：任务的「有效期」\n *\n * 原来的 `due`（一个截止日期）换成 `sched`，支持四种写法：\n *   ① 长期            mode:'always'\n *   ② 特定日期        mode:'dates'      dates: ['2026-10-20', ...]\n *   ③ 按周几/节假日   mode:'weekdays'   days: [0,6,'holiday']，from/to 可选\n *   ④ 区间 + 周几     mode:'weekdays'   days:[...] + from/to 都填\n *\n * 「周六、周日」= days:[0,6]；「X月X日到X月X日」= mode:'weekdays' + days 空 + from/to\n * （days 空 = 区间里每天都算）。这样四种需求只有三种模式，不用再堆。\n * ================================================================ */\n\nexport const SCHED_MODES = ['always', 'dates', 'weekdays'];\n\n/** 周几的名字，下标就是 Date.getDay()（0 = 周日） */\nexport const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];\n\n/** 「法定节假日」在 days 里的标记（具体哪天是节假日由 settings.holidays 决定） */\nexport const HOLIDAY_KEY = 'holiday';\n\n/** 空的有效期（= 长期） */\nexport function emptySched() {\n  return { mode: 'always', from: '', to: '', days: [], dates: [] };\n}\n\nconst isDateKey = function (v) { return /^\\d{4}-\\d{2}-\\d{2}$/.test(String(v || '')); };\n\n/** 把任何东西规整成一个合法的 sched（容错，不抛） */\nexport function normalizeSched(v) {\n  const s = emptySched();\n  if (!v || typeof v !== 'object') return s;\n  if (SCHED_MODES.indexOf(v.mode) >= 0) s.mode = v.mode;\n  if (isDateKey(v.from)) s.from = v.from;\n  if (isDateKey(v.to)) s.to = v.to;\n  // from 比 to 晚就交换，免得永远不生效\n  if (s.from && s.to && s.from > s.to) { const t = s.from; s.from = s.to; s.to = t; }\n  if (Array.isArray(v.days)) {\n    v.days.forEach(function (d) {\n      if (d === HOLIDAY_KEY) { if (s.days.indexOf(HOLIDAY_KEY) < 0) s.days.push(HOLIDAY_KEY); return; }\n      const n = Number(d);\n      if (Number.isInteger(n) && n >= 0 && n <= 6 && s.days.indexOf(n) < 0) s.days.push(n);\n    });\n    s.days.sort(function (a, b) {\n      if (a === HOLIDAY_KEY) return 1;\n      if (b === HOLIDAY_KEY) return -1;\n      // 从**周一**开始排，这样「周六、周日」读着顺（周日是最後一个）\n      return ((a + 6) % 7) - ((b + 6) % 7);\n    });\n  }\n  if (Array.isArray(v.dates)) {\n    v.dates.forEach(function (d) {\n      if (isDateKey(d) && s.dates.indexOf(d) < 0) s.dates.push(d);\n    });\n    s.dates.sort();\n    s.dates = s.dates.slice(0, 60);\n  }\n  /* 形态自洽：指定日期模式没日期、按周几模式没周几也没区间 → 退回长期 */\n  if (s.mode === 'dates' && !s.dates.length) s.mode = 'always';\n  if (s.mode === 'weekdays' && !s.days.length && !s.from && !s.to) s.mode = 'always';\n  return s;\n}\n\n/** 老数据的 `due`（一个截止日期）迁移成 sched：那天之前都有效 */\nexport function schedFromDue(due) {\n  const d = String(due || '');\n  if (!d || d === TASK_LONG_TERM || !isDateKey(d)) return emptySched();\n  return normalizeSched({ mode: 'weekdays', days: [], from: '', to: d });\n}\n\n/** 这个任务的有效期（老存档只有 due 的话顺手迁移一次） */\nexport function taskSched(task) {\n  if (!task) return emptySched();\n  if (task.sched) return normalizeSched(task.sched);\n  return schedFromDue(task.due);\n}\n\n/** 这一天是不是节假日（家长在设置里维护的清单） */\nexport function isHoliday(dateKey, holidays) {\n  return Array.isArray(holidays) && holidays.indexOf(dateKey) >= 0;\n}\n\n/**\n * 这一天在不在有效期内（**只看有效期本身**，不看手动「停用」）。\n * holidays = settings.holidays（'YYYY-MM-DD' 的数组）\n */\nexport function schedMatches(sched, dateKey, holidays) {\n  const s = normalizeSched(sched);\n  if (!isDateKey(dateKey)) return false;\n  if (s.mode === 'always') return true;\n  if (s.mode === 'dates') return s.dates.indexOf(dateKey) >= 0;\n  // weekdays\n  if (s.from && dateKey < s.from) return false;\n  if (s.to && dateKey > s.to) return false;\n  if (!s.days.length) return true;                 // 只限区间，不限周几\n  const wd = parseDateKey(dateKey).getDay();\n  if (s.days.indexOf(wd) >= 0) return true;\n  if (s.days.indexOf(HOLIDAY_KEY) >= 0 && isHoliday(dateKey, holidays)) return true;\n  return false;\n}\n\n/** 任务这一天算不算启用（手动停用 / 已删除 / 不在有效期 → 都不启用） */\nexport function taskActiveOn(task, dateKey, holidays) {\n  if (!task) return false;\n  if (task.active === false) return false;\n  /*\n   * 第 91 轮：软删除。删除**那一天之前**的历史照常算有效，\n   * 这样\"那天完成了几项\"、完成度百分比都不会因为删任务而缩水；\n   * 删除当天及以后就不再出现。\n   */\n  if (task.deleted) {\n    const from = isValidDateKey(task.deletedAt) ? task.deletedAt : '';\n    if (!from || String(dateKey) >= from) return false;\n  }\n  return schedMatches(taskSched(task), dateKey, holidays);\n}\n\n/** 旧名字保留（很多地方在用）；等价于 taskActiveOn */\nexport function taskActive(task, dateKey, holidays) {\n  return taskActiveOn(task, dateKey, holidays);\n}\n\n/** 这个任务是不是「长期」的（不用标有效期） */\nexport function schedAlways(task) {\n  return taskSched(task).mode === 'always';\n}\n\n/**\n * 有效期在界面上怎么显示（第 81 轮 5）。\n *\n * 返回纯文字，标签栏里再加上 📅 前缀。\n *   · 长期                     → 「长期」\n *   · 按周几                   → 「周六、周日」/「10-01～10-07 的周六」…\n *   · 指定日期（多个）         → **只显示最近两个**，剩下的用「…」\n *     （家长说\"多个特定日期的，显示最近两个有效期，未显示完的用省略号\"）\n */\nexport function schedLabel(task, todayKey) {\n  const s = taskSched(task);\n  if (s.mode === 'always') return '长期';\n  const md = function (d) { return d.slice(5); };   // '2026-10-20' → '10-20'\n  if (s.mode === 'dates') {\n    // 「最近两个」= 从今天起往后的前两个；今天的都过去了就退回最后两个\n    const from = todayKey || '';\n    const future = s.dates.filter(function (d) { return !from || d >= from; });\n    const pick = (future.length ? future : s.dates).slice(0, 2);\n    const rest = s.dates.length - pick.length;\n    return pick.map(md).join('、') + (rest > 0 ? ' …' : '');\n  }\n  // weekdays\n  const parts = [];\n  if (s.from && s.to) parts.push(md(s.from) + '～' + md(s.to));\n  // 单边区间写清楚，别显示成「～10-20」那种半截\n  else if (s.from) parts.push(md(s.from) + ' 起');\n  else if (s.to) parts.push('到 ' + md(s.to) + ' 为止');\n  if (s.days.length) {\n    parts.push(s.days.map(function (d) {\n      return d === HOLIDAY_KEY ? '节假日' : WEEKDAY_NAMES[d];\n    }).join('、'));\n  }\n  return parts.join(' ') || '长期';\n}\n\n/** 把日期字符串当数字比大小 */\nexport function dueAfter(a, b) { return String(a || '') > String(b || ''); }\n\n/** 这个任务在这一天之前就结束了吗（只用于老接口的兼容判断） */\nexport function taskExpired(task, dateKey) {\n  const s = taskSched(task);\n  if (s.mode === 'always') return false;\n  if (s.to) return dueAfter(dateKey, s.to);\n  if (s.mode === 'dates') {\n    return s.dates.length > 0 && s.dates.every(function (d) { return dueAfter(dateKey, d); });\n  }\n  return false;\n}\n\n/** 老接口：标签栏里的那枚牌子（现在直接走 schedLabel） */\nexport function taskDueLabel(task, dateKey) {\n  return schedLabel(task, dateKey);\n}\nexport function taskDueBadge(task, dateKey) {\n  return schedLabel(task, dateKey);\n}\n\n/** 任务标签在列表里的排序：功课 → 生活 → 精神 → 其他自定义（按首次出现的顺序） */\nexport function taskTagRank(tag, allTags) {\n  const i = TASK_TAGS.indexOf(String(tag || ''));\n  if (i >= 0) return i;\n  // 自定义标签排在预设之后，互相之间按\"谁先出现\"排，保证顺序稳定\n  const custom = (allTags || []).filter(function (t) { return t && TASK_TAGS.indexOf(t) < 0; });\n  const j = custom.indexOf(String(tag || ''));\n  return TASK_TAGS.length + (j < 0 ? custom.length : j);\n}\n\n/*\n * 标签的配色。位置和样式跟作业的科目（语文/数学）完全一样，\n * 所以这里也照 subjectMeta 的路子来。\n */\nconst TASK_TAG_COLORS = {\n  功课: '#3b7fd4',   // 蓝：要动脑的\n  生活: '#12a3a5',   // 青：日常事务\n  精神: '#e0872b',   // 橙：运动、精气神\n};\n\n/** 标签的显示信息（自定义标签给个中性色） */\nexport function taskTagMeta(tag) {\n  const t = String(tag || '');\n  return { name: t, color: TASK_TAG_COLORS[t] || '#8a7a68' };\n}\n\n/**\n * 每日任务\"这一天\"该长什么样（第 66 轮 6）。\n *\n * 打勾的时候会在当天记录里拍一张快照（见 item.done），\n * 有快照就按快照显示 —— 家长后来改名字 / 改分值 / 改标签，只影响以后，历史原样保留。\n *\n * ★ 但**今天不算历史**（第 73 轮修）：家长刚把标签从「精神」改成「功课」，\n *   今天这张卡还显示「精神」的话，看起来就是\"改了没成功\"。\n *   所以传进来 dateKey 时，只有**不是今天**的那一天才用快照。\n *   翻回昨天、前天，看到的还是当时的样子。\n */\nexport function taskView(task, rec, dateKey) {\n  const isToday = !dateKey || dateKey === todayKey();\n  const s = (!isToday && rec && rec.snap) ? rec.snap : null;\n  return {\n    emoji: (s && s.emoji) || task.emoji,\n    title: (s && s.title) || task.title,\n    tag: (s && s.tag) || task.tag,\n    points: (s && typeof s.points === 'number') ? s.points : task.points,\n  };\n}\n\n/*\n * 老存档的每日任务没有标签，按标题猜一个。\n * 猜错了家长在「修改」里点一下就能改 —— 比全都塞进同一档强。\n * 顺序有讲究：先看\"精神\"（运动类），再看\"功课\"（学习类），剩下都归\"生活\"。\n */\nconst TAG_WORDS = [\n  ['精神', ['运动', '跳绳', '跑步', '锻炼', '体前屈', '跳远', '打球', '游泳', '骑车', '户外',\n    '散步', '瑜伽', '体操', '眼保健操', '情绪', '心情']],\n  ['功课', ['阅读', '读书', '背诵', '朗读', '跟读', '写字', '生字', '口算', '练习', '复习',\n    '预习', '听写', '默写', '作业', '识字', '古诗', '课文', '日记', '观察', '画画', '绘画',\n    '手工', '实验', '科学']],\n  ['生活', ['书包', '书桌', '整理', '收拾', '家务', '打扫', '扫地', '洗碗', '浇花', '喂',\n    '睡觉', '刷牙', '洗脸', '洗澡', '吃饭', '穿衣', '穿鞋', '喝水', '电话', '袜子', '被子']],\n];\n\n/** 从标题猜一个标签（猜不出来归「生活」—— 日常事务里最常见的就它） */\nexport function tagFromLegacyTitle(title) {\n  const t = String(title || '');\n  for (let i = 0; i < TAG_WORDS.length; i++) {\n    const tag = TAG_WORDS[i][0];\n    const words = TAG_WORDS[i][1];\n    for (let k = 0; k < words.length; k++) {\n      if (t.indexOf(words[k]) >= 0) return tag;\n    }\n  }\n  return '生活';\n}\n\n/**\n * 法定节假日的默认清单（第 81 轮）。\n *\n * 只放**固定公历日期**的那几个（元旦 / 劳动节 / 国庆），今年和明年各一份。\n * 春节、清明、端午、中秋是农历的，还有每年的调休 —— 那些算不出来，\n * 得家长在「设置 → 法定节假日」里自己加（界面里也写明了）。\n */\nexport function defaultHolidays() {\n  const y = new Date().getFullYear();\n  const out = [];\n  [y, y + 1].forEach(function (yy) {\n    out.push(yy + '-01-01');                       // 元旦\n    out.push(yy + '-05-01');                       // 劳动节\n    for (let d = 1; d <= 7; d++) {                 // 国庆\n      out.push(yy + '-10-0' + d);\n    }\n  });\n  return out;\n}\n\n/** 新房间默认带上的每日任务（顺序就是界面上的顺序，家长可以自己调） */\nconst DEFAULT_DAILY_TASKS = [\n  // 顺序按标签来：功课 → 生活 → 精神；有效期默认「长期」\n  { id: 'read', emoji: '📖', title: '亲子阅读 15 分钟', tag: '功课', sched: emptySched(), points: 2, active: true },\n  { id: 'tidy', emoji: '🎒', title: '整理书包和书桌', tag: '生活', sched: emptySched(), points: 1, active: true },\n  { id: 'chore', emoji: '🧹', title: '帮家里做家务', tag: '生活', sched: emptySched(), points: 2, active: true },\n  { id: 'sleep', emoji: '🌙', title: '晚上 9 点前上床睡觉', tag: '生活', sched: emptySched(), points: 1, active: true },\n  { id: 'sport', emoji: '🏃', title: '运动 30 分钟', tag: '精神', sched: emptySched(), points: 2, active: true },\n];\n\nconst DEFAULT_REWARDS = [\n  { id: 'r1', emoji: '🍦', title: '吃一个冰淇淋', cost: 10, active: true },\n  { id: 'r2', emoji: '📺', title: '看动画片 30 分钟', cost: 15, active: true },\n  { id: 'r3', emoji: '📚', title: '买一本新绘本', cost: 30, active: true },\n  { id: 'r4', emoji: '🎡', title: '去游乐场玩一次', cost: 60, active: true },\n];\n\n/*\n * 常用作业库：一年级翻来覆去就那几样，「从常用作业库选择」里点一下就加好了，\n * 不用每天重新打一遍字。家长也能把当天临时加的作业顺手存进来。\n * 备注里写清\"做到什么程度算完成\"，点一下就带过去，省得每天重写。\n */\nconst DEFAULT_COMMON_HOMEWORKS = [\n  { subject: '体育', title: '跳绳3组，每组1分钟',\n    detail: '打卡上传视频到家校本，允许补卡' },\n  { subject: '体育', title: '体前屈3组，每组20个',\n    detail: '打卡上传视频到家校本，允许补卡' },\n  { subject: '语文', title: '亲子阅读 15 分钟',\n    detail: '父母先领读，孩子再复述（主要讲清楚时间、地点、人物、发生了什么、是什么原因导致、怎么解决、学到了什么）' },\n];\n\n/*\n * 历史默认值（只用来识别\"家长一条都没改过\"的老存档，然后整体升级）。\n * 换过两次，所以有两组。\n */\nconst LEGACY_COMMON_SETS = [\n  // 第 1 代：8 条\n  ['背诵古诗一首', '读课文 2 遍', '生字写 2 遍', '口算一页',\n    '数学书做一做', '跟读课文 3 遍', '跳绳 200 个', '亲子阅读 15 分钟'],\n  // 第 2 代：3 条（标题里带着做法）\n  ['每日跳绳', '每日体前屈', '亲子阅读 15 分钟'],\n];\n\n/* ------------------------------------------------------------ 小工具函数 */\n\nfunction uid(prefix) {\n  const rnd = (globalThis.crypto && globalThis.crypto.randomUUID)\n    ? globalThis.crypto.randomUUID().slice(0, 8)\n    : Math.random().toString(36).slice(2, 10);\n  return (prefix || 'x') + '_' + rnd;\n}\n\n/**\n * 外面（界面）要造新 id 时用这个。\n * 生成出来的形状必须能过 isSafeId，否则会被当成\"客户端瞎写的\"而重新生成。\n */\nexport function newId(prefix) { return uid(prefix); }\n\n/** id 的合法形状：`<前缀>_<一串小写字母数字>`，不认别的（防止有人往里塞奇怪东西） */\nexport function isSafeId(id) {\n  return typeof id === 'string' && /^[a-z]{1,4}_[a-z0-9]{4,24}$/.test(id);\n}\n\n/**\n * 由一段文本推出一个**稳定**的 id —— 同一个种子在浏览器和服务器上算出来必须一样。\n *\n * 用在「复制到今天」这类由服务器和客户端各自 applyOp 的地方：\n * 如果两边各自 random 一个 id，客户端乐观更新出来的那条和服务器的就对不上，\n * 同步回来一替换，客户端手里的 id 就成了孤儿。\n */\nexport function derivedId(prefix, seed) {\n  const s = String(seed);\n  let a = 2166136261;\n  for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 16777619); }\n  let b = 2166136261;\n  for (let i = s.length - 1; i >= 0; i--) { b ^= s.charCodeAt(i); b = Math.imul(b, 16777619); }\n  return prefix + '_' + ((a >>> 0).toString(36) + (b >>> 0).toString(36)).slice(0, 12);\n}\n\n/**\n * ★ 新增记录时，**优先用 op 里带过来的 id**。\n *\n * 这是踩出来的坑：`uid()` 两边各自随机，客户端乐观更新用了 id A、\n * 服务器落库用了 id B，同步回来一替换，界面上任何还捏着 A 的按钮\n * （☆ / ✎ / ✕）都会静默失效 —— `findItem` 找不到就 `break`，连报错都没有。\n * 所以新增类的 op 一律由发起方（界面）先造好 id 塞进 op 里。\n *\n * 带了但不合规矩的（有人手改请求）就当没带，服务器自己生成一个。\n */\nfunction useId(given, prefix) {\n  return isSafeId(given) ? given : uid(prefix);\n}\n\nexport function pad2(n) { return n < 10 ? '0' + n : '' + n; }\n\n/**\n * 本地时区的 YYYY-MM-DD。\n * 导出是因为界面上也要判断\"某个时间戳属于哪一天\"（第 92 轮：\n * 已兑现的兑换只显示当天的，就得把 resolvedAt 换算成日期来比）。\n */\nexport function dateKey(d) {\n  const x = d || new Date();\n  return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());\n}\n\nexport function todayKey() { return dateKey(new Date()); }\n\nexport function parseDateKey(key) {\n  const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(key || ''));\n  if (!m) return new Date();\n  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));\n}\n\nexport function shiftDate(key, days) {\n  const d = parseDateKey(key);\n  d.setDate(d.getDate() + days);\n  return dateKey(d);\n}\n\nexport function isValidDateKey(key) {\n  return /^\\d{4}-\\d{2}-\\d{2}$/.test(String(key || ''));\n}\n\n/** 返回以 date 所在周（周一为第一天）为基准的 7 个日期 */\nexport function weekKeys(key) {\n  const d = parseDateKey(key);\n  const dow = (d.getDay() + 6) % 7; // 周一 = 0\n  const start = shiftDate(key, -dow);\n  const out = [];\n  for (let i = 0; i < 7; i++) out.push(shiftDate(start, i));\n  return out;\n}\n\nconst WEEK_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];\nexport function weekdayCN(key) { return WEEK_CN[parseDateKey(key).getDay()]; }\n\nexport function friendlyDate(key) {\n  const d = parseDateKey(key);\n  const t = todayKey();\n  if (key === t) return '今天';\n  if (key === shiftDate(t, -1)) return '昨天';\n  if (key === shiftDate(t, 1)) return '明天';\n  return (d.getMonth() + 1) + '月' + d.getDate() + '日';\n}\n\nexport function subjectMeta(name) {\n  const fallback = SUBJECTS[SUBJECTS.length - 1];\n  if (!name) return fallback;\n  const n = String(name).trim();\n  return SUBJECTS.find(function (s) { return s.name === n; })\n    || SUBJECTS.find(function (s) { return n.indexOf(s.name) >= 0 || s.name.indexOf(n) >= 0; })\n    || fallback;\n}\n\n/* -------------------------------------------------------------- 数据模型 */\n\nfunction emptyDay() {\n  return { homeworks: [], extras: [], tasks: {}, note: '', mood: '', review: null };\n}\n\n/**\n * 家长给这一天的学习情况写的一段评价（可奖可扣小红花）。\n * 跟其它条目一样带 awarded / awardedPoints，这样「清空小红花」时\n * 可以用同一套逻辑把它中性化，不会等到下次改评价时把账算乱。\n */\nexport function emptyReview() {\n  return { text: '', points: 0, at: 0, awarded: false, awardedPoints: 0 };\n}\n\nexport function emptyRecord() {\n  return {\n    done: false, doneAt: null, confirmed: false, confirmedAt: null,\n    awarded: false, awardedPoints: 0,\n    // 家长撤销时填的理由（只有被撤销过才有值）；孩子页面据此决定能不能再做\n    undoKind: '', undoReason: '', undoneAt: null,\n    // 孩子做完后交上来的附件（照片 / 视频 / 文本…）\n    works: [],\n  };\n}\n\n/**\n * 一条附件的标准形状。\n * id 由服务端在上传时生成，name/kind/size/mime 也以服务端返回的为准\n * （客户端只负责把文件传上去，不自己编 id）。\n */\nexport function normalizeAttachment(a) {\n  if (!a || typeof a !== 'object') return null;\n  const id = String(a.id || '');\n  if (!isUploadId(id)) return null;\n  const name = String(a.name || id).slice(0, 120);\n  const spec = checkUpload(name, a.mime);\n  return {\n    id: id,\n    name: name,\n    size: Math.max(0, Number(a.size) || 0),\n    mime: String(a.mime || (spec.ok ? spec.mime : 'application/octet-stream')).slice(0, 100),\n    kind: ['image', 'video', 'audio', 'text'].indexOf(a.kind) >= 0 ? a.kind\n      : (spec.ok ? spec.kind : 'file'),\n    at: Number(a.at) || Date.now(),\n  };\n}\n\n/** 去重 + 丢弃不合法的，最多留 30 条 */\nexport function normalizeAttachments(arr) {\n  if (!Array.isArray(arr)) return [];\n  const out = [];\n  const seen = {};\n  arr.forEach(function (a) {\n    const n = normalizeAttachment(a);\n    if (n && !seen[n.id]) { seen[n.id] = 1; out.push(n); }\n  });\n  return out.slice(0, 30);\n}\n\n/** 附件挂在谁身上：'item' = 这项作业本身（家长传的要求），'work' = 孩子交的成果 */\nexport function attachTarget(state, date, kind, id, scope) {\n  const t = findTarget(state, date, kind, id);\n  if (!t) return null;\n  if (scope === 'work') return t.rec;\n  // 额外任务是\"当天那一份\"，其余是\"长期定义\"，两种情况都在对象本身上挂\n  return t.item || t.rec;\n}\n\n/** 只补上缺的字段，绝不覆盖已有的值 */\nfunction fillRecord(it) {\n  const rec = emptyRecord();\n  Object.keys(rec).forEach(function (k) {\n    if (it[k] === undefined) it[k] = rec[k];\n  });  it.done = !!it.done;\n  it.confirmed = !!it.confirmed;\n  it.awarded = !!it.awarded;\n  it.awardedPoints = Number(it.awardedPoints) || 0;\n  it.doneAt = it.doneAt || null;\n  it.confirmedAt = it.confirmedAt || null;\n  return it;\n}\n\nexport function defaultState() {\n  const now = Date.now();\n  return {\n    v: VERSION,\n    rev: 0,\n    createdAt: now,\n    updatedAt: now,\n    settings: {\n      childName: '宝贝',\n      roomName: '',          // 房间的显示名，留空就跟着孩子名字走\n      parentPin: '1234',\n      requireConfirm: true,\n      homeworkPoints: 2,\n      welcome: '加油鸭！完成后就可以「自由玩耍」了✈️~~~',\n      focusEnabled: true,   // 卡片上显示「⏱ 开始专注」\n      focusMinutes: 20,     // 专注多久\n      breakMinutes: 5,      // 时间到还没做完，先休息多久\n      // 上传前自动压缩图片（手机照片动辄好几 MB，压完打开快很多，肉眼看不出差别）\n      compressImages: true,\n      // 法定节假日清单（'YYYY-MM-DD'）：任务有效期可以勾「节假日」用，家长可自己改\n      holidays: defaultHolidays(),\n    },\n    dailyTasks: DEFAULT_DAILY_TASKS.map(function (x) { return Object.assign({}, x); }),\n    rewards: DEFAULT_REWARDS.map(function (x) { return Object.assign({}, x); }),\n    commonHomeworks: DEFAULT_COMMON_HOMEWORKS.map(function (x) { return Object.assign({ id: uid('ch') }, x); }),\n    days: {},\n    points: { balance: 0, earned: 0, spent: 0 },\n    ledger: [],\n    redemptions: [],\n  };\n}\n\n/** 补齐旧版本/缺失字段，保证前端永远拿到完整结构 */\nexport function normalizeState(raw) {\n  const defaults = defaultState();\n  if (!raw || typeof raw !== 'object') return defaults;\n\n  // 注意：一定要往空对象里合并。直接 Object.assign(defaults, raw) 会把\n  // raw.settings 的引用顶掉 defaults.settings，下一行就变成自己合并自己，\n  // 旧存档里没有的新字段（比如后来的 focusMinutes）就永远补不上。\n  const s = Object.assign({}, defaults, raw);\n  s.settings = Object.assign({}, defaults.settings, raw.settings || {});\n  // 老存档里可能还留着这两个早就没人读的字段，读的时候直接丢掉\n  delete s.settings.bigFont;\n  delete s.settings.voiceOn;\n  /*\n   * 节假日清单（第 81 轮）：老存档没有就给一份默认（固定公历的那几个），\n   * 有就只留合法的 'YYYY-MM-DD'、去重、排好序。\n   */\n  if (!Array.isArray(s.settings.holidays)) s.settings.holidays = defaultHolidays();\n  else {\n    s.settings.holidays = s.settings.holidays\n      .map(function (d) { return String(d || '').trim(); })\n      .filter(function (d) { return /^\\d{4}-\\d{2}-\\d{2}$/.test(d); })\n      .filter(function (d, i, arr) { return arr.indexOf(d) === i; })\n      .sort();\n  }\n  s.points = Object.assign({ balance: 0, earned: 0, spent: 0 }, raw.points || {});\n  s.days = raw.days && typeof raw.days === 'object' ? raw.days : {};\n  s.ledger = Array.isArray(raw.ledger) ? raw.ledger : [];\n  s.redemptions = Array.isArray(raw.redemptions) ? raw.redemptions : [];\n  s.dailyTasks = Array.isArray(raw.dailyTasks)\n    ? raw.dailyTasks\n    : defaults.dailyTasks.map(function (x) { return Object.assign({}, x); });\n  s.rewards = Array.isArray(raw.rewards)\n    ? raw.rewards\n    : defaults.rewards.map(function (x) { return Object.assign({}, x); });\n  // 老存档补字段：任务是后加的「备注」「标签」「有效期」，奖励是后加的「停用」\n  s.dailyTasks.forEach(function (t) {\n    if (typeof t.note !== 'string') t.note = '';\n    t.active = t.active !== false;\n    t.attachments = normalizeAttachments(t.attachments);\n    if (typeof t.tag !== 'string' || !t.tag) t.tag = tagFromLegacyTitle(t.title);\n    /*\n     * 第 81 轮：`due`（一个截止日期）→ `sched`（有效期）。\n     * 老语义是\"到那天为止都有效\"，所以迁移成「区间到 due 为止」。\n     * 迁完就把 due 删掉，避免两份真相。\n     */\n    if (!t.sched) t.sched = schedFromDue(t.due);\n    else t.sched = normalizeSched(t.sched);\n    delete t.due;\n    /*\n     * 第 91 轮：软删除的标记要保住（`deleted` + `deletedAt`）。\n     * 不校验的话老存档里万一有脏值（比如 deletedAt 是 \"明天\"），\n     * taskActiveOn 的日期比较就会乱来。\n     */\n    if (t.deleted !== undefined) t.deleted = Boolean(t.deleted) && t.deleted !== 'false';\n    if (t.deletedAt !== undefined && !isValidDateKey(t.deletedAt)) delete t.deletedAt;\n  });\n  /*\n   * 老存档的任务没有标签，这里按标题猜一个（见 tagFromLegacyTitle），\n   * 猜完顺手按标签排一次序 —— 只在\"刚补上标签\"的时候排，\n   * 之后家长手动 ↑↓ 的次序不会被覆盖。\n   */\n  if (!raw.tasksSortedByTag) {\n    s.dailyTasks.sort(function (a, b) {\n      const all = s.dailyTasks.map(function (x) { return x.tag; });\n      return taskTagRank(a.tag, all) - taskTagRank(b.tag, all);\n    });\n    s.tasksSortedByTag = true;\n  }\n  /*\n   * 每天的作业也按科目次序排一次（第 80 轮 1）：\n   *   语文 → 数学 → 英语 → 科学 → 美术 → 音乐 → 体育 → 道法 → 其他\n   *\n   * 为什么要排：老存档是按\"录入的先后\"堆起来的，科目是乱的；\n   * 而 hw.add / day.copy 的插入位置是**假设列表已经有序**的（见 hwInsertAt），\n   * 列表本身乱的话插进去也不会对。\n   *\n   * 只在**第一次**做（`homeworksSortedByRank` 标记），\n   * 之后家长手动 ↑↓ 的次序不会再被覆盖 —— 和任务那边 `tasksSortedByTag` 一个路子。\n   * Array.sort 在现代引擎里是稳定的，同一科目内部的先后顺序保持不变。\n   */\n  if (!raw.homeworksSortedByRank) {\n    Object.keys(s.days).forEach(function (k) {\n      const list = s.days[k] && s.days[k].homeworks;\n      if (Array.isArray(list)) {\n        list.sort(function (a, b) { return subjectRank(a.subject) - subjectRank(b.subject); });\n      }\n    });\n    s.homeworksSortedByRank = true;\n  }\n  /*\n   * 常用作业库也按科目次序排一次（第 83 轮）：语文 → 数学 → … → 其他。\n   * 同样只在第一次做，之后家长手动 ↑↓ 的次序不会被覆盖。\n   */\n  if (!raw.commonSortedByRank) {\n    if (Array.isArray(s.commonHomeworks)) {\n      s.commonHomeworks.sort(function (a, b) {\n        return subjectRank(a.subject) - subjectRank(b.subject);\n      });\n    }\n    s.commonSortedByRank = true;\n  }\n  /*\n   * 欢迎语：把**恰好等于历史默认值**的那几句升级成现在的默认值。\n   * 只认完全相等的情况，家长自己改过的文案一个字都不动。\n   * （换过两次默认值，所以这里列了两句老的。）\n   */\n  if (s.settings.welcome === '今天也要加油鸭！' ||\n      s.settings.welcome === '今天也要加油鸭！完成后可自由玩耍✈️~~~') {\n    s.settings.welcome = defaults.settings.welcome;\n  }\n\n  s.rewards.forEach(function (r) {\n    r.active = r.active !== false;\n  });\n  // 常用作业库：老存档没有就用默认那几条\n  s.commonHomeworks = Array.isArray(raw.commonHomeworks)\n    ? raw.commonHomeworks\n    : defaults.commonHomeworks.map(function (x) { return Object.assign({}, x); });\n  /*\n   * 定向迁移：如果库里的条目**恰好就是某一代默认值**（标题和顺序都一样，\n   * 一条没改过），就整体换成现在的默认 3 条。家长自己动过任何一条都不迁移。\n   */\n  if (LEGACY_COMMON_SETS.some(function (set) {\n    return s.commonHomeworks.length === set.length &&\n      s.commonHomeworks.every(function (x, i) { return x.title === set[i]; });\n  })) {\n    s.commonHomeworks = defaults.commonHomeworks.map(function (x) { return Object.assign({}, x); });\n  }\n  s.commonHomeworks.forEach(function (c) {\n    if (typeof c.detail !== 'string') c.detail = '';\n    if (!c.subject) c.subject = '其他';\n    c.attachments = normalizeAttachments(c.attachments);\n  });\n  s.rev = Number(s.rev) || 0;\n  Object.keys(s.days).forEach(function (k) {\n    const d = s.days[k] || {};\n    d.homeworks = Array.isArray(d.homeworks) ? d.homeworks : [];\n    d.extras = Array.isArray(d.extras) ? d.extras : [];\n    d.tasks = d.tasks && typeof d.tasks === 'object' ? d.tasks : {};\n    d.note = typeof d.note === 'string' ? d.note : '';\n    d.mood = typeof d.mood === 'string' ? d.mood : '';\n    d.review = d.review && typeof d.review === 'object'\n      ? Object.assign(emptyReview(), d.review)\n      : null;\n    d.homeworks.forEach(function (h) {\n      fillRecord(h);\n      h.attachments = normalizeAttachments(h.attachments);\n    });\n    d.extras.forEach(function (e) {\n      fillRecord(e);\n      // 额外任务的备注是后加的字段，老存档要补上\n      if (typeof e.note !== 'string') e.note = '';\n      e.attachments = normalizeAttachments(e.attachments);\n    });\n    Object.keys(d.tasks).forEach(function (id) {\n      fillRecord(d.tasks[id]);\n      d.tasks[id].works = normalizeAttachments(d.tasks[id].works);\n    });\n    s.days[k] = d;\n  });\n  return s;\n}\n\nfunction ensureDay(state, date) {\n  if (!state.days[date]) state.days[date] = emptyDay();\n  return state.days[date];\n}\n\nexport function getDay(state, date) {\n  return state.days[date] || emptyDay();\n}\n\n/* ------------------------------------------------- 钉钉作业文本智能解析 */\n\n// 整行就是一句开场白，不是作业\nconst NOISE_RE = /^(温馨提示|通知|作业如下|今日作业|今天的作业|家庭作业|作业|如下)[:：，,。!！]?$/;\n// 以这些词开头的整行都是开场白\nconst NOISE_PREFIX_RE = /^(各位家长|家长们|亲爱的家长|@所有人|大家好|各位同学|同学们)/;\n// 提醒类的话，不该被算到上一门科目头上\nconst REMINDER_RE = /^(明天|今天|记得|别忘|不要忘|注意|温馨|提前|请|要带|带上|带好|准备好)/;\nconst STOP_SUBJECT = ['提示', '注意', '温馨', '要求', '家长', '备注', '说明', '明天', '今天', '请', '作业', '时间', '内容', '如下', '通知', '温馨提示'];\n\nfunction isKnownSubjectName(name) {\n  if (!name) return false;\n  return SUBJECTS.some(function (s) { return s.name === name; })\n    || ['语文', '数学', '英语', '科学', '美术', '音乐', '体育', '道法', '道德与法治'].indexOf(name) >= 0;\n}\n\nfunction detectSubjectByKeyword(text) {\n  const t = String(text || '').toLowerCase();\n  let best = null, bestLen = 0;\n  SUBJECTS.forEach(function (s) {\n    s.keys.forEach(function (k) {\n      if (t.indexOf(k.toLowerCase()) >= 0 && k.length > bestLen) { best = s.name; bestLen = k.length; }\n    });\n  });\n  return best || '其他';\n}\n\nfunction splitTitleDetail(text) {\n  let t = String(text || '').replace(/[。．.]\\s*$/, '').trim();\n  let detail = '';\n  const m = t.match(/^(.*?)[，,;；]\\s*((?:家长|父母|请家长)[^，,;；]*)$/);\n  if (m && m[1].trim()) { t = m[1].trim(); detail = m[2].trim(); }\n  else if (t.length > 18) {\n    const i = t.search(/[，,]/);\n    if (i >= 6 && i <= 24) { detail = t.slice(i + 1).trim(); t = t.slice(0, i).trim(); }\n  }\n  return { title: t, detail: detail };\n}\n\n/**\n * 把从钉钉里复制的一段作业文本，拆成 [{subject, title, detail}]\n * 能认出来的写法：\n *   语文：背诵《静夜思》，家长签字\n *   【数学】口算 P20\n *   1. 英语跟读 Unit 3\n *   数学作业：            ← 后面几行都归到数学\n *   请家长陪同完成\n */\nexport function parseHomeworkText(text) {\n  const out = [];\n  if (!text) return out;\n\n  const rawLines = String(text).replace(/\\r/g, '').split('\\n');\n  const lines = [];\n  rawLines.forEach(function (raw) {\n    const line = raw.trim();\n    if (!line) return;\n    // 很长的行里如果用了分号分隔多条，就再拆一层\n    if (line.length > 28 && /[；;]/.test(line)) {\n      line.split(/[；;]/).forEach(function (p) { if (p.trim()) lines.push(p.trim()); });\n    } else {\n      lines.push(line);\n    }\n  });\n\n  let currentSubject = '';\n\n  lines.forEach(function (raw) {\n    let line = raw.trim();\n    if (!line) return;\n\n    // 【语文】xxx  /  [数学] xxx\n    let subject = '';\n    const bracket = line.match(/^[【\\[]([^】\\]]{1,10})[】\\]]\\s*(.*)$/);\n    if (bracket) {\n      subject = bracket[1].replace(/作业$/, '').trim();\n      line = (bracket[2] || '').trim();\n    }\n\n    // 去掉行首的序号 / 项目符号\n    line = line.replace(/^[\\s\\-–—*•·●○]+/, '');\n    line = line.replace(/^\\d+\\s*[.、)）:：]\\s*/, '');\n    line = line.replace(/^[（(]\\s*\\d+\\s*[)）]\\s*/, '');\n    line = line.replace(/^[一二三四五六七八九十]+\\s*[、.)）：:]\\s*/, '');\n    line = line.trim();\n    if (!line) {\n      if (subject) currentSubject = subject;\n      return;\n    }\n\n    if (NOISE_RE.test(line) || NOISE_PREFIX_RE.test(line)) return;\n\n    // 纯科目标题行：“数学作业：”“语文：”\n    const header = line.match(/^(语文|数学|英语|科学|美术|音乐|体育|道法|道德与法治)(?:作业)?\\s*[:：]?\\s*$/);\n    if (header) { currentSubject = header[1]; return; }\n\n    // “科目：内容”\n    if (!subject) {\n      const kv = line.match(/^([^\\s:：]{1,8})\\s*[:：]\\s*(.+)$/);\n      if (kv) {\n        const cand = kv[1].replace(/作业$/, '').trim();\n        const ok = isKnownSubjectName(cand)\n          || (cand.length <= 3 && STOP_SUBJECT.indexOf(cand) < 0 && /^[\\u4e00-\\u9fa5]{2,3}$/.test(cand));\n        if (ok) { subject = cand; line = kv[2].trim(); }\n      }\n    }\n\n    // 没写科目的时候，先看内容里的关键词，再退回上一行的科目块\n    if (!subject) {\n      const byKeyword = detectSubjectByKeyword(line);\n      if (byKeyword !== '其他') subject = byKeyword;\n      else if (REMINDER_RE.test(line)) subject = '其他';\n      else subject = currentSubject || '其他';\n    }\n    if (isKnownSubjectName(subject)) currentSubject = subject;\n\n    const parts = splitTitleDetail(line);\n    if (!parts.title) return;\n\n    out.push({\n      subject: SUBJECTS.some(function (s) { return s.name === subject; }) ? subject : '其他',\n      rawSubject: subject,\n      title: parts.title,\n      detail: parts.detail,\n    });\n  });\n\n  return out;\n}\n\n/* ------------------------------------------------------------ 积分与结算 */\n\nfunction pushLedger(state, entry) {\n  state.ledger.unshift(entry);\n  if (state.ledger.length > 400) state.ledger.length = 400;\n}\n\nfunction clampPoints(v) {\n  if (v === '' || v === null || v === undefined) return null; // 留空 = 跟着全局设置\n  const n = Number(v);\n  if (!isFinite(n)) return null;\n  return Math.max(0, Math.min(20, Math.round(n)));\n}\n\n/**\n * 数字输入的统一解析。以前各处的写法是 `Number(v) || 默认值`，于是：\n *   · 用户明明填了 0，被 `|| ` 当成\"没填\"，悄悄换成默认值\n *   · 同一个 0，新建时变成 10、编辑时变成 1（两处默认值不一样）\n * 现在统一成：留空/非法 → 返回默认值；填了数字 → 按数字走（再交给调用方 clamp）。\n */\nfunction parseNum(v, dflt) {\n  if (v === '' || v === null || v === undefined) return dflt;\n  const n = Number(v);\n  return isFinite(n) ? n : dflt;\n}\n\n/** clamp 到 [lo, hi] 的整数 */\nfunction clampInt(n, lo, hi) {\n  return Math.max(lo, Math.min(hi, Math.round(n)));\n}\n\n/** 各项实际值多少小红花：作业可以单项覆盖全局设置 */\nfunction pointsOfHomework(state, hw) {\n  if (hw && hw.points !== undefined && hw.points !== null) return Number(hw.points) || 0;\n  return Number(state.settings.homeworkPoints) || 0;\n}\n\nfunction findTarget(state, date, kind, id) {\n  const day = ensureDay(state, date);\n\n  if (kind === 'homework') {\n    const it = day.homeworks.filter(function (x) { return x.id === id; })[0];\n    if (!it) return null;\n    // 作业和额外任务是\"当天的那一份\"，item 和 rec 是同一个对象\n    return { rec: it, item: it, points: pointsOfHomework(state, it), label: it.title, kind: 'homework' };\n  }\n  if (kind === 'extra') {\n    const it = day.extras.filter(function (x) { return x.id === id; })[0];\n    if (!it) return null;\n    return { rec: it, item: it, points: Number(it.points) || 0, label: it.title, kind: 'extra' };\n  }\n  if (kind === 'task') {\n    const t = state.dailyTasks.filter(function (x) { return x.id === id; })[0];\n    if (!t) return null;\n    if (!day.tasks[id]) day.tasks[id] = emptyRecord();\n    // 每日任务是\"长期定义\"，附件挂在定义上（每天都能看到这份要求）\n    return { rec: day.tasks[id], item: t, points: Number(t.points) || 0, label: t.title, kind: 'task' };\n  }\n  return null;\n}\n\n/**\n * 根据 done / confirmed 重新决定这朵小红花算不算。\n * 关掉\"家长确认\"时，打勾即得分；开着时，要家长确认才得分。\n */\n/**\n * 把一条记录上已经发出的小红花收回来。\n *\n * 注意：删除一条记录时必须用这个，不能直接调 settle()。\n * settle() 的判断是「该发却没发 / 不该发却发了」，而删除那一刻\n * 记录的 done/confirmed 还是 true，settle() 会认为\"本来就该发\"，直接空转，\n * 结果东西删了、星星还留在账上（这个 bug 之前就在）。\n */\nfunction revokeAward(state, rec, kind, date, label, reasonPrefix) {\n  if (!rec.awarded) return 0;\n  const pts = Number(rec.awardedPoints) || 0;\n  rec.awarded = false;\n  rec.awardedPoints = 0;\n  state.points.balance -= pts;\n  state.points.earned -= pts;\n  pushLedger(state, {\n    ts: Date.now(), date: date, delta: -pts, kind: kind,\n    reason: (reasonPrefix || '撤回：') + (label || ''),\n  });\n  return pts;\n}\n\nfunction settle(state, target, date) {\n  const rec = target.rec;\n  const shouldAward = !!rec.done && (!!rec.confirmed || !state.settings.requireConfirm);\n\n  if (shouldAward && !rec.awarded) {\n    const pts = target.points;\n    rec.awarded = true;\n    rec.awardedPoints = pts;\n    state.points.balance += pts;\n    state.points.earned += pts;\n    pushLedger(state, { ts: Date.now(), date: date, delta: pts, kind: target.kind, reason: target.label });\n  } else if (!shouldAward && rec.awarded) {\n    revokeAward(state, rec, target.kind, date, target.label, '撤回：');\n  }\n}\n\nexport function countDone(state, date) {\n  const day = getDay(state, date);\n  let total = 0, done = 0, waiting = 0;\n  day.homeworks.forEach(function (h) {\n    total++; if (h.done) done++; if (h.done && !h.confirmed) waiting++;\n  });\n  state.dailyTasks.forEach(function (t) {\n    // 停用的、以及过了截止日期的，这一天都不算数\n    if (!taskActive(t, date, state.settings.holidays)) return;\n    total++;\n    const r = day.tasks[t.id];\n    if (r && r.done) done++;\n    if (r && r.done && !r.confirmed) waiting++;\n  });\n  day.extras.forEach(function (h) {\n    total++; if (h.done) done++; if (h.done && !h.confirmed) waiting++;\n  });\n  return { total: total, done: done, waiting: waiting, percent: total ? Math.round(done / total * 100) : 0 };\n}\n\nexport function currentStreak(state) {\n  let streak = 0;\n  let key = todayKey();\n  // 今天还没开始不算断\n  if (countDone(state, key).done === 0) key = shiftDate(key, -1);\n  for (let i = 0; i < 400; i++) {\n    const c = countDone(state, key);\n    if (c.total > 0 && c.done === c.total) { streak++; key = shiftDate(key, -1); }\n    else break;\n  }\n  return streak;\n}\n\n/* -------------------------------------------------------- 操作(op)的应用 */\n\nconst ALLOWED_OPS = {};\n\nfunction defineOp(name, fn) { ALLOWED_OPS[name] = fn; }\n\ndefineOp('settings', function (state, op) {\n  const patch = op.patch || {};\n  const allowed = ['childName', 'parentPin', 'requireConfirm', 'homeworkPoints', 'welcome',\n    'focusEnabled', 'focusMinutes', 'breakMinutes', 'roomName', 'compressImages', 'holidays'];\n  allowed.forEach(function (k) { if (k in patch) state.settings[k] = patch[k]; });\n  // 节假日清单：只留合法的 'YYYY-MM-DD'，去重、排序、最多 200 条\n  {\n    const seen = {};\n    state.settings.holidays = (Array.isArray(state.settings.holidays) ? state.settings.holidays : [])\n      .map(function (d) { return String(d || '').trim(); })\n      .filter(function (d) {\n        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(d) || seen[d]) return false;\n        seen[d] = 1;\n        return true;\n      })\n      .sort()\n      .slice(0, 200);\n  }\n  // 大字/语音是按设备存在 localStorage 的，不跟房间走，\n  // 早年的 settings.bigFont / settings.voiceOn 已经没人读，顺手清掉\n  delete state.settings.bigFont;\n  delete state.settings.voiceOn;\n  state.settings.roomName = String(state.settings.roomName || '').trim().slice(0, 24);\n  state.settings.childName = String(state.settings.childName || '宝贝').trim().slice(0, 12) || '宝贝';\n  state.settings.homeworkPoints = Math.max(0, Math.min(20, Number(state.settings.homeworkPoints) || 0));\n  state.settings.focusMinutes = Math.max(5, Math.min(60, Number(state.settings.focusMinutes) || 20));\n  state.settings.breakMinutes = Math.max(1, Math.min(30, Number(state.settings.breakMinutes) || 5));\n  state.settings.focusEnabled = state.settings.focusEnabled !== false;\n});\n\ndefineOp('hw.add', function (state, op) {\n  const day = ensureDay(state, op.date);\n  (op.items || []).forEach(function (it) {\n    if (!it || !it.title) return;\n    const rec = Object.assign({\n      // ★ 用 op 里带的 id（界面先造好），两边才对得上 —— 见 useId 的注释\n      id: useId(it.id, 'h'),\n      subject: it.subject || '其他',\n      title: String(it.title).slice(0, 120),\n      detail: String(it.detail || '').slice(0, 500),\n      attachments: normalizeAttachments(it.attachments),   // 家长传的要求/资料\n    }, emptyRecord());\n    const pts = clampPoints(it.points);\n    if (pts !== null) rec.points = pts; // 不填就跟着全局设置走\n    day.homeworks.splice(hwInsertAt(day.homeworks, rec.subject), 0, rec);\n  });\n});\n\n/** 科目在预设表里的次序；不在表里（自己填的）排到最后 */\nfunction subjectRank(subject) {\n  const i = SUBJECTS.findIndex(function (s) { return s.name === subject; });\n  return i < 0 ? SUBJECTS.length : i;\n}\n\n/**\n * 新作业插到哪儿：**按科目排**（语文 → 数学 → 英语 → … → 其他），\n * 同一科目的挨着放、追加在本组末尾。\n *\n * 原来只做\"同科目挨着\"，所以先加的数学会一直排在后面加的语文前面 ——\n * 家长要的是\"默认就按语文、数学、英语…这个顺序\"。\n * 手动 ↑↓ 过之后仍以手动为准（这里只在新增时决定位置）。\n */\n/**\n * 「按科目次序插入」的通用版：作业列表和**常用作业库**都用它（第 83 轮）。\n * 传进来的 list 里每一项都有 `subject`。\n */\nfunction bySubjectInsertAt(list, subject) {\n  const r = subjectRank(subject);\n  for (let k = 0; k < list.length; k++) {\n    if (subjectRank(list[k].subject) > r) return k;   // 插到第一个\"科目更靠后\"的前面\n  }\n  return list.length;\n}\n\nfunction hwInsertAt(list, subject) {\n  return bySubjectInsertAt(list, subject);\n}\n\ndefineOp('hw.update', function (state, op) {\n  const day = ensureDay(state, op.date);\n  const it = day.homeworks.filter(function (x) { return x.id === op.id; })[0];\n  if (!it) return;\n  const p = op.patch || {};\n  const oldSubject = it.subject;\n  if ('subject' in p) it.subject = String(p.subject).slice(0, 12);\n  // 改了科目就挪到新科目那一组去，不然列表里会出现\"语文\"夹在数学中间\n  if (it.subject !== oldSubject) {\n    const k = day.homeworks.indexOf(it);\n    if (k >= 0) day.homeworks.splice(k, 1);\n    day.homeworks.splice(hwInsertAt(day.homeworks, it.subject), 0, it);\n  }\n  if ('title' in p) it.title = String(p.title).slice(0, 120);\n  if ('detail' in p) it.detail = String(p.detail || '').slice(0, 500);\n  if ('attachments' in p) it.attachments = normalizeAttachments(p.attachments);\n  if ('points' in p) {\n    const pts = clampPoints(p.points);\n    const before = pointsOfHomework(state, it);\n    if (pts === null) delete it.points;\n    else it.points = pts;\n    // 已经结算过小红花的，改分值要重新算一次，不然账面就对不上了\n    if (it.awarded && pointsOfHomework(state, it) !== before) {\n      revokeAward(state, it, 'homework', op.date, it.title, '改分值：');\n      settle(state, { rec: it, points: pointsOfHomework(state, it), label: it.title, kind: 'homework' }, op.date);\n    }\n  }\n});\n\ndefineOp('hw.remove', function (state, op) {\n  const day = ensureDay(state, op.date);\n  const it = day.homeworks.filter(function (x) { return x.id === op.id; })[0];\n  if (!it) return;\n  revokeAward(state, it, 'homework', op.date, it.title, '删除：');   // 删掉也要把星星收回来\n  day.homeworks = day.homeworks.filter(function (x) { return x.id !== op.id; });\n});\n\ndefineOp('extra.add', function (state, op) {\n  const day = ensureDay(state, op.date);\n  const it = op.item || {};\n  if (!it.title) return;\n  day.extras.push(Object.assign({\n    id: useId(it.id, 'e'),\n    emoji: String(it.emoji || '✨').slice(0, 4),\n    title: String(it.title).slice(0, 60),\n    note: String(it.note || '').slice(0, 500),\n    points: clampInt(parseNum(it.points, 1), 0, 20),\n    attachments: normalizeAttachments(it.attachments),\n  }, emptyRecord()));\n});\n\ndefineOp('extra.remove', function (state, op) {\n  const day = ensureDay(state, op.date);\n  const it = day.extras.filter(function (x) { return x.id === op.id; })[0];\n  if (!it) return;\n  revokeAward(state, it, 'extra', op.date, it.title, '删除：');   // 同上\n  day.extras = day.extras.filter(function (x) { return x.id !== op.id; });\n});\n\n/* 孩子加的额外任务，家长觉得不合适可以直接改（图标 / 内容 / 分值） */\ndefineOp('extra.update', function (state, op) {\n  const day = ensureDay(state, op.date);\n  const it = day.extras.filter(function (x) { return x.id === op.id; })[0];\n  if (!it) return;\n  const p = op.patch || {};\n  if ('emoji' in p) it.emoji = String(p.emoji || '✨').slice(0, 4);\n  if ('title' in p) {\n    const t = String(p.title).slice(0, 60).trim();\n    if (t) it.title = t;          // 不允许改成空标题，不然卡片就没名字了\n  }\n  if ('note' in p) it.note = String(p.note || '').slice(0, 500);\n  if ('points' in p) {\n    const n = parseNum(p.points, null);\n    if (n !== null) {\n      const before = Number(it.points) || 0;\n      it.points = clampInt(n, 0, 20);\n      // 已经结算过的，改了分值要重算一次，不然账面就对不上（跟 hw.update 一个道理）\n      if (it.awarded && it.points !== before) {\n        revokeAward(state, it, 'extra', op.date, it.title, '改分值：');\n        settle(state, { rec: it, points: it.points, label: it.title, kind: 'extra' }, op.date);\n      }\n    }\n  }\n});\n\ndefineOp('item.done', function (state, op) {\n  const t = findTarget(state, op.date, op.kind, op.id);\n  if (!t) return;\n  const value = !!op.value;\n  t.rec.done = value;\n  t.rec.doneAt = value ? Date.now() : null;\n  if (!value) { t.rec.confirmed = false; t.rec.confirmedAt = null; }\n  /*\n   * 每日任务打勾时**拍一张快照**（第 66 轮 6）：把这一刻的图标 / 名字 / 分值 / 标签\n   * 存进当天的记录里。\n   *\n   * 为什么：任务的定义是全局的，家长后来改了名字或分值，\n   * 历史那几天的记录会跟着变 —— \"历史不该被后来的修改改写\"。\n   * 有快照就按快照显示，家长再改也只影响以后。\n   */\n  if (value && op.kind === 'task' && t.item) {\n    t.rec.snap = {\n      emoji: t.item.emoji, title: t.item.title, tag: t.item.tag,\n      points: t.item.points,\n    };\n  }\n  settle(state, t, op.date);\n});\n\n/** 撤销的两种理由：任务取消（不用做了）/ 再完善作业（要重做） */\nexport const UNDO_KINDS = [\n  { key: 'cancel', label: '任务取消', hint: '孩子不用再做了' },\n  { key: 'redo', label: '再完善作业', hint: '孩子需要重新完成' },\n];\n\n/**\n * 家长撤销「孩子已经打勾、但还没确认」的那一项，并记下理由。\n *\n * 和 item.done=false 的区别就是多存了两个字段：\n *   undoKind   'cancel'（任务取消）| 'redo'（再完善作业）\n *   undoReason 家长写的具体说明，孩子那边看得到\n * 孩子页面据此决定：cancel 的锁住不能再做，redo 的要重新做。\n */\ndefineOp('item.undo', function (state, op) {\n  const t = findTarget(state, op.date, op.kind, op.id);\n  if (!t) return;\n  t.rec.done = false;\n  t.rec.doneAt = null;\n  t.rec.confirmed = false;\n  t.rec.confirmedAt = null;\n  settle(state, t, op.date);      // 已经发出去的分要撤回\n  /*\n   * 放在 settle 之后写，免得被它清掉。\n   * reasonKind 为空 = 家长两个理由都没选，就是\"直接撤回\"：\n   * 不带\"任务取消 / 再完善\"的定性，孩子那边只回到没打勾的状态。\n   */\n  t.rec.undoKind = op.reasonKind === 'cancel' ? 'cancel'\n    : op.reasonKind === 'redo' ? 'redo' : '';\n  t.rec.undoReason = String(op.reason || '').slice(0, 200).trim();\n  t.rec.undoneAt = Date.now();\n});\n\n/** 家长反悔了：把撤销取消掉，这一项回到\"没打勾、也没备注\"的普通状态 */\ndefineOp('item.restore', function (state, op) {\n  const t = findTarget(state, op.date, op.kind, op.id);\n  if (!t) return;\n  t.rec.undoKind = '';\n  t.rec.undoReason = '';\n  t.rec.undoneAt = null;\n});\n\n/* ---------------------------------------------------- 附件：加一条 / 删一条 */\n\n/**\n * 给\"这项作业\"或\"孩子交的成果\"挂一个附件。\n * scope: 'item'（家长传的要求/资料）| 'work'（孩子交上来的）\n * 文件本身已经由 /api/upload 存好了，这里只记录元信息。\n */\ndefineOp('attach.add', function (state, op) {\n  const holder = attachTarget(state, op.date, op.kind, op.id, op.scope);\n  if (!holder) return;\n  const att = normalizeAttachment(op.file);\n  if (!att) return;                       // id 不合法就别记，免得界面上一堆点不开的\n  if (op.scope === 'work') {\n    holder.works = normalizeAttachments((holder.works || []).concat([att]));\n  } else {\n    holder.attachments = normalizeAttachments((holder.attachments || []).concat([att]));\n  }\n});\n\n/** 删掉一个附件记录（服务器上的文件先留着，万一别处还引用着） */\ndefineOp('attach.remove', function (state, op) {\n  const holder = attachTarget(state, op.date, op.kind, op.id, op.scope);\n  if (!holder) return;\n  const id = String(op.fileId || '');\n  if (op.scope === 'work') {\n    holder.works = (holder.works || []).filter(function (a) { return a.id !== id; });\n  } else {\n    holder.attachments = (holder.attachments || []).filter(function (a) { return a.id !== id; });\n  }\n});\n\n/** 重命名（孩子传上来文件名常常是 IMG_1234.jpg，家长可以改成看得懂的） */\ndefineOp('attach.rename', function (state, op) {\n  const holder = attachTarget(state, op.date, op.kind, op.id, op.scope);\n  if (!holder) return;\n  const id = String(op.fileId || '');\n  const name = String(op.name || '').trim().slice(0, 120);\n  if (!name) return;\n  const list = op.scope === 'work' ? (holder.works || []) : (holder.attachments || []);\n  list.forEach(function (a) { if (a.id === id) a.name = name; });\n});\n\n/** 自定义排序：把某一项往上/往下挪一格。\n * 数组本身的顺序就是界面上的顺序，所以\"排序\"就是交换相邻两项。\n */\ndefineOp('move', function (state, op) {\n  const dir = Number(op.dir) === -1 ? -1 : 1;\n  let arr = null;\n  if (op.list === 'homework' || op.list === 'extras') {\n    const day = ensureDay(state, op.date);\n    arr = op.list === 'homework' ? day.homeworks : day.extras;\n  } else if (op.list === 'tasks') {\n    arr = state.dailyTasks;\n  } else if (op.list === 'rewards') {\n    arr = state.rewards;\n  } else if (op.list === 'common') {\n    arr = state.commonHomeworks;\n  }\n  if (!arr) return;\n  let i = -1;\n  for (let k = 0; k < arr.length; k++) {\n    if (arr[k].id === op.id) { i = k; break; }\n  }\n  if (i < 0) return;\n  const j = i + dir;\n  if (j < 0 || j >= arr.length) return;\n  const tmp = arr[i];\n  arr[i] = arr[j];\n  arr[j] = tmp;\n});\n\ndefineOp('item.confirm', function (state, op) {\n  const t = findTarget(state, op.date, op.kind, op.id);\n  if (!t) return;\n  const value = !!op.value;\n  t.rec.confirmed = value;\n  t.rec.confirmedAt = value ? Date.now() : null;\n  if (value) t.rec.done = true;\n  settle(state, t, op.date);\n});\n\ndefineOp('day.note', function (state, op) {\n  ensureDay(state, op.date).note = String(op.note || '').slice(0, 300);\n});\n\ndefineOp('day.mood', function (state, op) {\n  ensureDay(state, op.date).mood = String(op.mood || '').slice(0, 4);\n});\n\ndefineOp('day.copy', function (state, op) {\n  if (!isValidDateKey(op.from) || !isValidDateKey(op.to) || op.from === op.to) return;\n  const src = getDay(state, op.from);\n  const dst = ensureDay(state, op.to);\n\n  /*\n   * picks：只复制点名的那些，格式 [{ kind: 'homework' | 'extra', id }]\n   * 不传就整份复制（保持以前\"一键全复制\"的行为）。\n   *\n   * 注意：每日任务不在复制范围内 —— 它是全局的，每天自动出现，\n   * 复制过去没有任何意义（前端那边也把这一类标成\"无需复制\"）。\n   */\n  const picks = Array.isArray(op.picks) ? op.picks : null;\n  const want = function (kind, id) {\n    if (!picks) return true;\n    return picks.some(function (p) { return p && p.kind === kind && p.id === id; });\n  };\n  // 复制过去的是\"新的一条\"：换 id、状态清空、不能把小红花重复发一遍\n  const fresh = function (prefix, it) {\n    return Object.assign({}, it, {\n      /*\n       * id 由「源 id + 目标日期」推出来，**不能随机**：\n       * 这个 op 在客户端和服务器上都会跑一遍，各自 random 的话两边就是两条\n       * 不同 id 的记录，同步回来一替换，客户端手里的 id 全成了孤儿。\n       */\n      id: derivedId(prefix, it.id + '@' + op.date), done: false, doneAt: null,\n      confirmed: false, confirmedAt: null, awarded: false, awardedPoints: 0,\n      works: [],\n    });\n  };\n\n  /*\n   * 复制过来的作业也**按科目次序插**（第 80 轮 1），不能一律 push 到末尾 ——\n   * 不然\"复制到今天\"会把语文排到体育后面，列表看着就乱。\n   *\n   * op.overwrite 为真时：目标日期**已经有同名同科目**的那条，就**覆盖它的内容**\n   * （备注 / 附件 / 分值），不新增一条（第 80 轮 2）。\n   * 打勾、确认、已发的小红花都不动 —— 覆盖的只是\"内容\"。\n   */\n  src.homeworks.forEach(function (h) {\n    if (!want('homework', h.id)) return;\n    if (op.overwrite) {\n      const hit = dst.homeworks.filter(function (x) {\n        return x.subject === h.subject && x.title === h.title;\n      })[0];\n      if (hit) {\n        hit.detail = h.detail;\n        hit.attachments = normalizeAttachments(h.attachments);\n        if (h.points != null) hit.points = h.points;\n        return;\n      }\n    }\n    dst.homeworks.splice(hwInsertAt(dst.homeworks, h.subject), 0, fresh('h', h));\n  });\n  src.extras.forEach(function (e) { if (want('extra', e.id)) dst.extras.push(fresh('e', e)); });\n});\n\n/**\n * 家长给这一天的学习情况写一段评价，可以顺手奖励或扣除小红花。\n *\n * 重复写会先把上一次的加减**撤回**再应用新的 —— 账面永远是\"最后那条评价\"\n * 的净效果，流水里看得到一笔「改评价：撤回」+ 一笔新的。\n */\ndefineOp('day.review', function (state, op) {\n  const day = ensureDay(state, op.date);\n  const prev = day.review;\n\n  if (prev && prev.awarded) {\n    const old = Number(prev.awardedPoints) || 0;\n    prev.awarded = false;\n    prev.awardedPoints = 0;\n    state.points.balance -= old;\n    if (old >= 0) state.points.earned -= old;\n    else state.points.spent -= -old;\n    // 上次是 0 分的话不用留一条\"撤回 0\"的流水，那是噪音\n    if (old) {\n      pushLedger(state, {\n        ts: Date.now(), date: op.date, delta: -old, kind: 'review', reason: '改评价：撤回上一次',\n      });\n    }\n  }\n\n  const text = String(op.text == null ? '' : op.text).slice(0, 300).trim();\n  const pts = clampInt(parseNum(op.points, 0), -50, 50);\n\n  // 文字和分值都空 = 把这条评价删掉\n  if (!text && !pts) { day.review = null; return; }\n\n  const rec = prev || emptyReview();\n  rec.text = text;\n  rec.points = pts;\n  rec.at = Date.now();\n  rec.awarded = false;\n  rec.awardedPoints = 0;\n  day.review = rec;\n\n  /*\n   * 分值可以是 0（只写评语、小红花不加不减）—— 这种情况**也要记一条流水**（第 66 轮 1），\n   * 否则家长在「小红花记录」里根本找不到这条评价。\n   */\n  if (pts) {\n    rec.awarded = true;\n    rec.awardedPoints = pts;\n    state.points.balance += pts;\n    if (pts >= 0) state.points.earned += pts;\n    else state.points.spent += -pts;\n  }\n  pushLedger(state, {\n    ts: Date.now(), date: op.date, delta: pts, kind: 'review',\n    reason: '今日评价：' + (text || (pts > 0 ? '表现不错' : pts < 0 ? '需要加油' : '只留评语')),\n  });\n});\n\ndefineOp('task.add', function (state, op) {\n  const it = op.item || {};\n  if (!it.title) return;\n  const rec = {\n    id: useId(it.id, 't'),\n    emoji: String(it.emoji || '⭐').slice(0, 4),\n    title: String(it.title).slice(0, 60),\n    // 标签：位置和样式跟作业的科目一样，列表也靠它排序分组\n    tag: String(it.tag || TASK_TAGS[0]).slice(0, 8),\n    // 有效期：默认「长期」；可以指定日期 / 周几节假日 / 区间（第 81 轮）\n    sched: it.sched ? normalizeSched(it.sched) : schedFromDue(it.due),\n    note: String(it.note || '').slice(0, 500),\n    // 每日任务也能带附件（和作业完全一样）：说明照片、示范视频、打卡要求…\n    attachments: normalizeAttachments(it.attachments),\n    points: clampInt(parseNum(it.points, 1), 0, 20),\n    active: it.active !== false,\n  };\n  /*\n   * 插到**同一标签那一组的末尾**：这样列表天然是\"功课 → 生活 → 精神 → 自定义\"，\n   * 家长不用每次新增完再手动往上挪。手动 ↑↓ 之后以手动为准。\n   */\n  state.dailyTasks.splice(taskInsertAt(state.dailyTasks, rec.tag), 0, rec);\n});\n\n/** 截止日期只认 YYYY-MM-DD 和哨兵值，别的（空、乱填）一律当长期 */\nexport function normalizeDue(v) {\n  const s = String(v == null ? '' : v).trim();\n  if (!s) return TASK_LONG_TERM;\n  if (s === TASK_LONG_TERM) return TASK_LONG_TERM;\n  return /^\\d{4}-\\d{2}-\\d{2}$/.test(s) ? s : TASK_LONG_TERM;\n}\n\n/** 新任务插到哪儿：按标签排序（功课 → 生活 → 精神 → 其他自定义） */\nfunction taskInsertAt(list, tag) {\n  const allTags = list.map(function (t) { return t.tag; });\n  const r = taskTagRank(tag, allTags);\n  for (let k = 0; k < list.length; k++) {\n    if (taskTagRank(list[k].tag, allTags) > r) return k;\n  }\n  return list.length;\n}\n\ndefineOp('task.update', function (state, op) {\n  const it = state.dailyTasks.filter(function (x) { return x.id === op.id; })[0];\n  if (!it) return;\n  const p = op.patch || {};\n  const oldTag = it.tag;\n  if ('emoji' in p) it.emoji = String(p.emoji).slice(0, 4);\n  if ('title' in p) it.title = String(p.title).slice(0, 60);\n  if ('tag' in p) it.tag = String(p.tag || TASK_TAGS[0]).slice(0, 8);\n  if ('sched' in p) it.sched = normalizeSched(p.sched);\n  // 老接口：还传 due 的话按\"到那天为止\"迁成一个区间有效期\n  else if ('due' in p) it.sched = schedFromDue(p.due);\n  if ('note' in p) it.note = String(p.note || '').slice(0, 500);\n  if ('attachments' in p) it.attachments = normalizeAttachments(p.attachments);\n  // 换了标签就挪到新标签那一组去，不然列表里会乱\n  if (it.tag !== oldTag) {\n    const k = state.dailyTasks.indexOf(it);\n    if (k >= 0) state.dailyTasks.splice(k, 1);\n    state.dailyTasks.splice(taskInsertAt(state.dailyTasks, it.tag), 0, it);\n  }\n  // 数字留空就保留原值，不要偷偷换成 0\n  if ('points' in p) {\n    const n = parseNum(p.points, null);\n    if (n !== null) it.points = clampInt(n, 0, 20);\n  }\n  // 停用/启用只改 active 这一个字段，**不碰任何积分和流水** ——\n  // 之前已经拿到的分照旧，历史记录也照旧（这是第 7 条要求）\n  if ('active' in p) it.active = !!p.active;\n});\n\n/*\n * 第 91 轮：**软删除**。\n *\n * 原来是真的把任务从 dailyTasks 里 filter 掉 —— 结果历史记录成了孤儿：\n * `day.tasks[id]` 那条还在（打勾时间、拿到的红花都在），但家长翻回去看\n * 那天时 `parentItems()` 是遍历 dailyTasks 找的，任务没了就渲染不出来 ✗\n * 家长的要求是「删除任务或改有效期，历史已完成的那天依旧保留展示」。\n *\n * 所以改成只打一个标记：\n *   · `deleted`  + `deletedAt`（从这一天起不再算有效）\n *   · `taskActiveOn()` 遇到「已删除且这天 >= deletedAt」就返回 false\n *     → 今天以后不显示、不计入完成度；**那一天之前照常算**，历史统计不会缩水\n *   · 家长的任务列表过滤掉 deleted，看起来就是\"删掉了\"\n *   · 数据一条不删，随时能从存档里翻回来\n */\ndefineOp('task.remove', function (state, op) {\n  const it = state.dailyTasks.filter(function (x) { return x.id === op.id; })[0];\n  if (!it) return;\n  it.deleted = true;\n  // 日期由客户端带过来（两边重放要一致，不能各自调 todayKey）\n  it.deletedAt = isValidDateKey(op.date) ? op.date : todayKey();\n});\n\n/* ---------------------------------------------------- 常用作业库 */\n\ndefineOp('common.add', function (state, op) {\n  const it = op.item || {};\n  if (!it.title) return;\n  const rec = {\n    id: useId(it.id, 'ch'),\n    subject: String(it.subject || '其他').slice(0, 12),\n    title: String(it.title).slice(0, 120),\n    detail: String(it.detail || '').slice(0, 500),\n    attachments: normalizeAttachments(it.attachments),\n  };\n  /*\n   * 常用库也**按科目次序插**（第 83 轮）：语文、数学、英语…其他。\n   * 原来是一律 push 到末尾，库里就成了\"按录入先后\"排的。\n   */\n  state.commonHomeworks.splice(bySubjectInsertAt(state.commonHomeworks, rec.subject), 0, rec);\n});\n\ndefineOp('common.update', function (state, op) {\n  const it = state.commonHomeworks.filter(function (x) { return x.id === op.id; })[0];\n  if (!it) return;\n  const p = op.patch || {};\n  const oldSubject = it.subject;\n  if ('subject' in p) it.subject = String(p.subject || '其他').slice(0, 12);\n  if ('title' in p) {\n    const t = String(p.title).slice(0, 120).trim();\n    if (t) it.title = t;\n  }\n  if ('detail' in p) it.detail = String(p.detail || '').slice(0, 500);\n  // 常用库里也能存附件，以后点「加」的时候一起带到当天\n  if ('attachments' in p) it.attachments = normalizeAttachments(p.attachments);\n  // 改了科目就挪到新科目那一组去（第 83 轮），不然库里会\"语文\"夹在数学中间\n  if (it.subject !== oldSubject) {\n    const k = state.commonHomeworks.indexOf(it);\n    if (k >= 0) state.commonHomeworks.splice(k, 1);\n    state.commonHomeworks.splice(\n      bySubjectInsertAt(state.commonHomeworks, it.subject), 0, it);\n  }\n});\n\ndefineOp('common.remove', function (state, op) {\n  state.commonHomeworks = state.commonHomeworks.filter(function (x) { return x.id !== op.id; });\n});\n\ndefineOp('reward.add', function (state, op) {\n  const it = op.item || {};\n  if (!it.title) return;\n  state.rewards.push({\n    id: useId(it.id, 'r'),\n    emoji: String(it.emoji || '🎁').slice(0, 4),\n    title: String(it.title).slice(0, 40),\n    cost: clampInt(parseNum(it.cost, 10), 1, 999),\n    active: it.active !== false,\n  });\n});\n\ndefineOp('reward.update', function (state, op) {\n  const it = state.rewards.filter(function (x) { return x.id === op.id; })[0];\n  if (!it) return;\n  const p = op.patch || {};\n  if ('emoji' in p) it.emoji = String(p.emoji).slice(0, 4);\n  if ('title' in p) it.title = String(p.title).slice(0, 40);\n  if ('cost' in p) {\n    const n = parseNum(p.cost, null);\n    if (n !== null) it.cost = clampInt(n, 1, 999);\n  }\n  // 同 task.update：停用/启用不动积分和流水\n  if ('active' in p) it.active = !!p.active;\n});\n\ndefineOp('reward.remove', function (state, op) {\n  state.rewards = state.rewards.filter(function (x) { return x.id !== op.id; });\n});\n\ndefineOp('redeem', function (state, op) {\n  const rw = state.rewards.filter(function (x) { return x.id === op.id; })[0];\n  if (!rw) return { error: '奖励不存在' };\n  // 停用的奖励不给兑换（孩子那边的按钮本来就不显示，这里再兜一道）\n  if (rw.active === false) return { error: '这个奖励暂时停用了' };\n  if (state.points.balance < rw.cost) return { error: '小红花不够啦' };\n  state.points.balance -= rw.cost;\n  state.points.spent += rw.cost;\n  state.redemptions.unshift({\n    // 兑换记录也是\"新增\"，id 一律由发起的界面带过来（见 useId 的注释）\n    id: useId(op.rid, 'rd'), rewardId: rw.id, emoji: rw.emoji, title: rw.title,\n    cost: rw.cost, ts: Date.now(), status: 'pending',\n  });\n  pushLedger(state, { ts: Date.now(), date: todayKey(), delta: -rw.cost, kind: 'redeem', reason: '兑换：' + rw.title });\n});\n\n/* 兑换的四种状态：待处理 / 已兑现 / 已驳回 / 主动取消。后两种要退回小红花 */\nconst REDEEM_REFUNDED = ['rejected', 'cancelled'];\nconst REDEEM_STATUS = ['pending', 'done', 'rejected', 'cancelled'];\n\ndefineOp('redeem.status', function (state, op) {\n  const rd = state.redemptions.filter(function (x) { return x.id === op.id; })[0];\n  if (!rd) return;\n  const status = String(op.status || '');\n  if (REDEEM_STATUS.indexOf(status) < 0) return;\n\n  const wasRefunded = REDEEM_REFUNDED.indexOf(rd.status) >= 0;\n  const willRefund = REDEEM_REFUNDED.indexOf(status) >= 0;\n\n  if (willRefund && !wasRefunded) {\n    state.points.balance += rd.cost;\n    state.points.spent -= rd.cost;\n    pushLedger(state, {\n      ts: Date.now(), date: todayKey(), delta: rd.cost, kind: 'redeem',\n      reason: (status === 'rejected' ? '驳回兑换：' : '取消兑换：') + rd.title,\n    });\n  } else if (!willRefund && wasRefunded) {\n    // 驳回之后家长又改主意要兑现，得重新扣一次\n    state.points.balance -= rd.cost;\n    state.points.spent += rd.cost;\n    pushLedger(state, {\n      ts: Date.now(), date: todayKey(), delta: -rd.cost, kind: 'redeem',\n      reason: '重新兑现：' + rd.title,\n    });\n  }\n\n  rd.status = status;\n  rd.reason = status === 'rejected' ? String(op.reason || '').slice(0, 100) : '';\n  rd.resolvedAt = status === 'pending' ? null : Date.now();\n});\n\ndefineOp('reset', function (state, op) {\n  if (op.scope === 'points') {\n    state.points = { balance: 0, earned: 0, spent: 0 };\n    state.ledger = [];\n    state.redemptions = [];\n    Object.keys(state.days).forEach(function (k) {\n      const d = state.days[k];\n      d.homeworks.concat(d.extras).forEach(function (it) {\n        it.awarded = false; it.awardedPoints = 0;\n      });\n      Object.keys(d.tasks).forEach(function (id) { d.tasks[id].awarded = false; d.tasks[id].awardedPoints = 0; });\n      // 今日评价的加减也得中性化，不然下次改评价时会按老分值去撤回，账就乱了\n      if (d.review) { d.review.awarded = false; d.review.awardedPoints = 0; }\n    });\n  }\n  if (op.scope === 'day' && isValidDateKey(op.date)) {\n    const d = getDay(state, op.date);\n    d.homeworks.concat(d.extras).forEach(function (it) {\n      if (it.awarded) {\n        state.points.balance -= Number(it.awardedPoints) || 0;\n        state.points.earned -= Number(it.awardedPoints) || 0;\n      }\n    });\n    if (d.review && d.review.awarded) {\n      const pts = Number(d.review.awardedPoints) || 0;\n      state.points.balance -= pts;\n      if (pts >= 0) state.points.earned -= pts; else state.points.spent -= -pts;\n    }\n    state.days[op.date] = emptyDay();\n  }\n  if (op.scope === 'all') {\n    const fresh = defaultState();\n    fresh.settings = state.settings;\n    Object.keys(state).forEach(function (k) { delete state[k]; });\n    Object.assign(state, fresh);\n    state.rev = (op.rev0 || 0);\n  }\n});\n\nexport function applyOp(state, op) {\n  if (!op || !op.t) return state;\n  const fn = ALLOWED_OPS[op.t];\n  if (!fn) return state;\n  if (op.date !== undefined && !isValidDateKey(op.date)) return state;\n  fn(state, op);\n  state.rev = (Number(state.rev) || 0) + 1;\n  state.updatedAt = Date.now();\n  return state;\n}\n\nexport function applyOps(state, ops) {\n  (ops || []).slice(0, 200).forEach(function (op) { applyOp(state, op); });\n  return state;\n}\n\n/** 这个操作名认不认识 */\nexport function isKnownOp(t) {\n  return Boolean(t) && Boolean(ALLOWED_OPS[t]);\n}\n\n/**\n * 挑出服务端认不出来的操作名。\n *\n * 为什么要有这个：applyOp 对不认识的 op 是**静默跳过**的（为了向后兼容，\n * 老客户端发来新版才有的字段不能把整个请求弄挂）。\n * 但\"静默跳过\"碰上**前后端版本不一致**就非常坑 —— 页面在服务器上跑的是旧\n * core.js，客户端发来 common.add / common.remove，服务器一声不响地收下、\n * 什么都不做、还回 200 和新状态；客户端以为成功了，下一次同步又把本地的\n * 改动盖回去。表现就是\"点了没反应\"\"删了又回来\"，而且完全没有报错。\n *\n * 所以：真正要写之前先查一遍，有不认识的就明确报错。\n */\nexport function unknownOps(ops) {\n  const out = [];\n  (ops || []).slice(0, 200).forEach(function (op) {\n    const t = op && op.t;\n    if (isKnownOp(t)) return;\n    // 连名字都没有的（null / {}）也拦下来，但别报成 \"null / undefined\" 这种看不懂的话\n    const name = t ? String(t) : '(缺少操作名)';\n    if (out.indexOf(name) < 0) out.push(name);\n  });\n  return out;\n}\n\n/* -------------------------------------------------------------- 二维码/无 */\n\nexport function roomCode() {\n  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';\n  let out = '';\n  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];\n  return out;\n}\n\n/**\n * 把用户输入的房间码收拾干净：去空格、转大写、只留字母数字。\n * 「我的小家」这种输入会被清成空串，界面上应该提示重填。\n */\nexport function normalizeRoomCode(v) {\n  return String(v == null ? '' : v).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');\n}\n\n/**\n * 房间码规则：\n *   * 系统生成的仍是 6 位（去掉了容易看错的 I O 0 1）\n *   * 自己定的放宽到 3～20 位字母数字\n * 只允许 [A-Z0-9] 同时也是文件名的安全边界（没有 / . 之类）\n */\nexport function isValidRoom(code) {\n  return /^[A-Z0-9]{3,20}$/.test(String(code == null ? '' : code).toUpperCase());\n}\n\n/** 房间的显示名：自己起过就用自己起的，否则跟着孩子名字走 → 「XX的作业小站」 */\nexport function roomNameOf(state) {\n  const s = (state && state.settings) || {};\n  const name = String(s.roomName || '').trim();\n  if (name) return name;\n  const child = String(s.childName || '').trim();\n  return child ? child + '的作业小站' : '作业小站';\n}\n\n/** 自定义房间码够不够安全：太短或者纯数字容易被猜到 */\nexport function roomCodeHint(code) {\n  const c = normalizeRoomCode(code);\n  if (!c) return { ok: false, msg: '房间码只能填字母和数字' };\n  if (c.length < 3) return { ok: false, msg: '至少 3 位' };\n  if (c.length > 20) return { ok: false, msg: '最多 20 位' };\n  if (/^\\d+$/.test(c)) return { ok: true, warn: '纯数字比较容易被猜到，建议混几个字母' };\n  if (c.length < 6 && !/\\d/.test(c)) return { ok: true, warn: '短又好念的码容易被别人试出来' };\n  return { ok: true, warn: '' };\n}\n\n/**\n * 房间列表里每一项要露出来的字段。\n * server.js 和 worker/handler.js 共用这一份 —— 以前两边各写一遍，\n * 改一处忘另一处就会出现\"本地能看、云端看不到某个字段\"。\n */\nexport function roomBrief(code, state) {\n  const st = state || {};\n  const settings = st.settings || {};\n  const points = st.points || {};\n  return {\n    code: String(code).toUpperCase(),\n    name: roomNameOf(st),\n    childName: settings.childName || '',\n    balance: Number(points.balance) || 0,\n    createdAt: st.createdAt || 0,\n    updatedAt: st.updatedAt || 0,\n  };\n}\n\n/** 从请求里取房间管理口令：?key= 或 x-hb-key 头 */\nexport function roomKeyFrom(req, url) {\n  let fromQuery = '';\n  try { fromQuery = url && url.searchParams ? String(url.searchParams.get('key') || '') : ''; } catch (e) { fromQuery = ''; }\n  const fromHeader = (req && req.headers && req.headers['x-hb-key']) || '';\n  return String(fromQuery || fromHeader || '');\n}\n\n/** 前端文件里，哪些扩展名算\"要被版本号盯住\"的 */\nexport const ASSET_EXT = ['.html', '.js', '.mjs', '.css'];\n\n/** 这个文件名算不算前端资源 */\nexport function isAssetName(name) {\n  const n = String(name || '').toLowerCase();\n  return ASSET_EXT.some(function (e) { return n.endsWith(e); });\n}\n\n/**\n * 把一组 [文件名, 文件内容] 揉成一个短指纹。\n *\n * 为什么是**内容**指纹而不是文件大小 + 修改时间：\n * 内容指纹在\"你本机\"和\"服务器上\"是**一样**的，所以可以直接对一下就知道\n * 服务器上跑的是不是最新代码 —— 大小/时间在两边永远对不上，比不了。\n *\n * 用 FNV-1a（纯 JS，不用 crypto），因为 core.js 要同时在浏览器和 Node 里跑。\n * 这里只当版本号用，不做安全用途。\n */\nexport function assetHash(pairs) {\n  let h = 0x811c9dc5;\n  const list = (pairs || []).slice().sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });\n  for (const pair of list) {\n    const s = String(pair[0]) + '\\u0000' + String(pair[1]);\n    for (let i = 0; i < s.length; i++) {\n      h ^= s.charCodeAt(i);\n      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;\n    }\n  }\n  return ('0000000' + h.toString(16)).slice(-8);\n}\n","/changelog.json":"{\n  \"version\": \"v1.0.10222312.rnbw\",\n  \"hash\": \"f24c3064\",\n  \"history\": [\n    {\n      \"v\": \"v1.0.10222312.rnbw\",\n      \"at\": \"2026-10-22 23:12\",\n      \"notes\": [\n        \"已兑现的兑换显示兑现日期\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10222239.xp6s\",\n      \"at\": \"2026-10-22 22:39\",\n      \"notes\": [\n        \"小红花记录支持翻页，能翻到全部记录\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10191857.as9b\",\n      \"at\": \"2026-10-19 18:57\",\n      \"notes\": [\n        \"已撤销补上'撤销没写理由'；已兑现兑换只显示当天\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10191854.hhjg\",\n      \"at\": \"2026-10-19 18:54\",\n      \"notes\": [\n        \"已撤销补上'打勾撤回'；已兑现兑换只显示当天\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10191418.5qqa\",\n      \"at\": \"2026-10-19 14:18\",\n      \"notes\": [\n        \"删除每日任务改为软删除，历史记录完整保留\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10181701.qutj\",\n      \"at\": \"2026-10-18 17:01\",\n      \"notes\": [\n        \"去掉剩余字数显示（备注 500 字上限保留）\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10181644.ky2d\",\n      \"at\": \"2026-10-18 16:44\",\n      \"notes\": [\n        \"备注500字 + 剩余字数计数\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10180948.afa5\",\n      \"at\": \"2026-10-18 09:48\",\n      \"notes\": [\n        \"多行文本框补上 maxlength（和后端一致，不再静默丢字）\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10180931.9ye7\",\n      \"at\": \"2026-10-18 09:31\",\n      \"notes\": [\n        \"弹窗关掉轻量关闭；不显示滚动条\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10171454.faxu\",\n      \"at\": \"2026-10-17 14:54\",\n      \"notes\": [\n        \"常用作业库按科目次序排\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10171427.wjb4\",\n      \"at\": \"2026-10-17 14:27\",\n      \"notes\": [\n        \"周几按周一到周日排；测试选择器收窄\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10171420.y4nm\",\n      \"at\": \"2026-10-17 14:20\",\n      \"notes\": [\n        \"多个指定日期按从小到大排；测试更新到有效期模型\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10171350.6mv7\",\n      \"at\": \"2026-10-17 13:50\",\n      \"notes\": [\n        \"任务截止日期改为有效期（日期/周几节假日/区间），历史不受影响\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10171324.3umw\",\n      \"at\": \"2026-10-17 13:24\",\n      \"notes\": [\n        \"老数据的作业也按科目排一次（只排一次）\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10171322.srdh\",\n      \"at\": \"2026-10-17 13:22\",\n      \"notes\": [\n        \"复制到今天按科目插；重复时提示是否覆盖\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10162253.fhs2\",\n      \"at\": \"2026-10-16 22:53\",\n      \"notes\": [\n        \"☆ 添加到常用（可选常用库或每日任务）；作业转任务标签默认功课\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10162246.hn9g\",\n      \"at\": \"2026-10-16 22:46\",\n      \"notes\": [\n        \"修：加附件按钮按内容撑出 11px\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10162238.vp6w\",\n      \"at\": \"2026-10-16 22:38\",\n      \"notes\": [\n        \"修：截止行允许收缩；pickFiles 提到顶层\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10162236.je3k\",\n      \"at\": \"2026-10-16 22:36\",\n      \"notes\": [\n        \"修：弹窗滚动条挤窄导致截止行溢出\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10162226.4qtw\",\n      \"at\": \"2026-10-16 22:26\",\n      \"notes\": [\n        \"每日任务支持附件；上传图片自动压缩\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10162209.yc55\",\n      \"at\": \"2026-10-16 22:09\",\n      \"notes\": [\n        \"修：今天的任务记录不再用历史快照（改标签立即生效）；服务器代码过期会明确报警\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10152230.rr92\",\n      \"at\": \"2026-10-15 22:30\",\n      \"notes\": [\n        \"撤回待确认行的多余徽章（会挤掉时间）\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10152222.jzhd\",\n      \"at\": \"2026-10-15 22:22\",\n      \"notes\": [\n        \"截止按钮各加宽1/2；标签栏固定顺序 小红花→截止→状态\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10152201.43ds\",\n      \"at\": \"2026-10-15 22:01\",\n      \"notes\": [\n        \"修：chips 字段会多渲染一个图标格子\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10152200.pd5g\",\n      \"at\": \"2026-10-15 22:00\",\n      \"notes\": [\n        \"任务表单：标签/日期并排，选项收窄\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10152157.xufe\",\n      \"at\": \"2026-10-15 21:57\",\n      \"notes\": [\n        \"0分评价进流水；任务编辑改版式；已截止替日期；历史快照\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10152113.shpq\",\n      \"at\": \"2026-10-15 21:13\",\n      \"notes\": [\n        \"每日任务加标签/截止日期；任务与作业默认按标签和科目排序\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10131653.ta5r\",\n      \"at\": \"2026-10-13 16:53\",\n      \"notes\": [\n        \"专注页备注：单行也统一成卡片样式\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10131637.v6bs\",\n      \"at\": \"2026-10-13 16:37\",\n      \"notes\": [\n        \"识别结果修改：备注改多行文本框\"\n      ]\n    },\n    {\n      \"v\": \"v1.0.10130839.e6jk\",\n      \"at\": \"2026-10-13 08:39\",\n      \"notes\": [\n        \"专注页备注去掉前面的小圆点\"\n      ]\n    }\n  ],\n  \"updatedAt\": \"2026-10-22 23:12\"\n}\n"};

const __MIME = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};

function __serveStatic(url) {
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

/*
 * 作业小站 · 核心逻辑（浏览器与服务器共用，零依赖）
 *
 * 这里只放"纯逻辑"：数据模型、作业文本解析、操作(op)应用、积分结算。
 * 浏览器用它做"乐观更新"（点一下就变），服务器用同一份代码做"最终结算"，
 * 这样两边永远不会算得不一样。
 *
 * 约定：本文件只能使用 `export function` / `export const` 形式导出，
 * 打包成单文件 Worker 时会用正则去掉行首的 `export `。
 */

const VERSION = 1;

/* ---------------------------------------------------------------- 附件 */

/*
 * 附件：家长录入作业时可以传要求/资料（比如老师发的卷子照片），
 * 孩子做完也可以传成果（跳绳视频、写完的生字照片）。
 *
 * 上传走"原始字节"而不是 multipart —— 零依赖地把 multipart 解析对很难，
 * 而这些要求在浏览器里一行就够：
 *     fetch('/api/upload/' + room + '?name=' + encodeURIComponent(file.name),
 *           { method: 'POST', body: file })
 * 服务端收到的是纯字节，文件名从 query 拿，省掉一整套解析。
 */

/** 允许上传的扩展名 → MIME + 大类。**白名单**，不在表里的一律不收 */
const UPLOAD_EXTS = {
  '.jpg': { mime: 'image/jpeg', kind: 'image' },
  '.jpeg': { mime: 'image/jpeg', kind: 'image' },
  '.png': { mime: 'image/png', kind: 'image' },
  '.gif': { mime: 'image/gif', kind: 'image' },
  '.webp': { mime: 'image/webp', kind: 'image' },
  '.heic': { mime: 'image/heic', kind: 'image' },
  '.bmp': { mime: 'image/bmp', kind: 'image' },
  '.mp4': { mime: 'video/mp4', kind: 'video' },
  '.mov': { mime: 'video/quicktime', kind: 'video' },
  '.m4v': { mime: 'video/x-m4v', kind: 'video' },
  '.webm': { mime: 'video/webm', kind: 'video' },
  '.3gp': { mime: 'video/3gpp', kind: 'video' },
  '.mp3': { mime: 'audio/mpeg', kind: 'audio' },
  '.m4a': { mime: 'audio/mp4', kind: 'audio' },
  '.wav': { mime: 'audio/wav', kind: 'audio' },
  '.ogg': { mime: 'audio/ogg', kind: 'audio' },
  '.amr': { mime: 'audio/amr', kind: 'audio' },
  '.txt': { mime: 'text/plain; charset=utf-8', kind: 'text' },
  '.md': { mime: 'text/plain; charset=utf-8', kind: 'text' },
  '.csv': { mime: 'text/csv; charset=utf-8', kind: 'text' },
  '.pdf': { mime: 'application/pdf', kind: 'file' },
  '.doc': { mime: 'application/msword', kind: 'file' },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'file' },
  '.xls': { mime: 'application/vnd.ms-excel', kind: 'file' },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'file' },
  '.ppt': { mime: 'application/vnd.ms-powerpoint', kind: 'file' },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'file' },
  '.zip': { mime: 'application/zip', kind: 'file' },
};

/** 给 <input accept> 用：图片 / 视频 / 文本都能传 */
const UPLOAD_ACCEPT = Object.keys(UPLOAD_EXTS).join(',');

/** 取扩展名（小写，带点）；没有就返回 '' */
function extOf(name) {
  const m = /(\.[A-Za-z0-9]{1,8})$/.exec(String(name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

/**
 * 看看这个文件能不能收。返回 { ok, ext, mime, kind, reason }。
 * 文件名里没有扩展名时，用浏览器给的 MIME 反推一个。
 */
function checkUpload(name, mime) {
  // 比 MIME 时只比 "text/plain" 这一段，`; charset=utf-8` 之类一律忽略，
  // 不然表里写了 charset、请求里没写，就会白白认不出来（踩过）
  const base = function (m) { return String(m || '').split(';')[0].trim().toLowerCase(); };
  let ext = extOf(name);
  if (!UPLOAD_EXTS[ext] && mime) {
    const want = base(mime);
    const hit = Object.keys(UPLOAD_EXTS).filter(function (e) {
      return base(UPLOAD_EXTS[e].mime) === want;
    })[0];
    if (hit) ext = hit;
  }
  const spec = UPLOAD_EXTS[ext];
  if (!spec) return { ok: false, ext: ext, reason: '不支持这种文件（' + (ext || '没有扩展名') + '）' };
  return { ok: true, ext: ext, mime: spec.mime, kind: spec.kind };
}

/** 上传后生成的 id 长这样：<随机串>.<扩展名>，既能当文件名也一眼看得出类型 */
function makeUploadId(ext) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s + ext;
}

/** id 必须是我们自己生成的那种，绝不能让它带路径（防目录穿越） */
function isUploadId(id) {
  return /^[a-z0-9]{16}\.[a-z0-9]{1,8}$/.test(String(id || ''));
}

/** 附件在浏览器里的地址 */
function fileURL(room, id) {
  return '/api/file/' + encodeURIComponent(room) + '/' + encodeURIComponent(id);
}

/** 2.4 MB → "2.4 MB"；给附件列表显示大小用 */
function humanSize(n) {
  const b = Number(n) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';
  return (b / 1024 / 1024).toFixed(b < 1024 * 1024 * 10 ? 1 : 0) + ' MB';
}

/** 附件在列表里的图标 */
function fileIcon(kind) {
  return kind === 'image' ? '🖼' : kind === 'video' ? '🎬'
    : kind === 'audio' ? '🎵' : kind === 'text' ? '📄' : '📎';
}

/* ------------------------------------------------------------------ 常量 */

const SUBJECTS = [
  { name: '语文', emoji: '📕', color: '#e05b5b', keys: ['语文', '背诵', '生字', '拼音', '写字', '课文', '古诗', '朗读', '默写', '听写', '组词', '造句', '看图写话'] },
  { name: '数学', emoji: '📐', color: '#3b7fd4', keys: ['数学', '口算', '计算', '算术', '应用题', '加减', '乘法', '除法', '数一数', '练一练', '数学书', '数学本'] },
  { name: '英语', emoji: '🔤', color: '#8b5cf6', keys: ['英语', '单词', '跟读', '拼读', '听力', 'unit', 'listen', 'read'] },
  { name: '科学', emoji: '🔬', color: '#0f9d76', keys: ['科学', '观察', '实验'] },
  { name: '美术', emoji: '🎨', color: '#e08a2b', keys: ['美术', '画画', '绘画', '手工', '涂色'] },
  { name: '音乐', emoji: '🎵', color: '#c4529b', keys: ['音乐', '唱歌', '儿歌'] },
  { name: '体育', emoji: '⚽', color: '#12a3a3', keys: ['体育', '跳绳', '跑步', '锻炼', '广播操'] },
  { name: '道法', emoji: '🤝', color: '#a8763b', keys: ['道德', '法治', '道法', '品德'] },
  { name: '其他', emoji: '📘', color: '#6b7280', keys: [] },
];

const MOODS = [
  { emoji: '😄', label: '超开心' },
  { emoji: '🙂', label: '还不错' },
  { emoji: '😐', label: '一般般' },
  { emoji: '😔', label: '有点累' },
];

/*
 * ------------------------------------------------------------ 每日任务的标签
 *
 * 每日任务带一个"标签"，位置和样式**跟作业的科目（语文/数学）完全一样**，
 * 列表里就靠它分组、排序。
 *
 * 默认三档：功课 / 生活 / 精神。家长也可以自己填别的（比如"家务""兴趣"）。
 */
const TASK_TAGS = ['功课', '生活', '精神'];

/**
 * 没有截止日期的任务用这个哨兵值 —— 界面上显示成「长期」
 * （第 81 轮起改用 sched 有效期模型，这个常量只为迁移老数据保留）
 */
const TASK_LONG_TERM = '9999-99-99';

/* ================================================================
 * 第 81 轮：任务的「有效期」
 *
 * 原来的 `due`（一个截止日期）换成 `sched`，支持四种写法：
 *   ① 长期            mode:'always'
 *   ② 特定日期        mode:'dates'      dates: ['2026-10-20', ...]
 *   ③ 按周几/节假日   mode:'weekdays'   days: [0,6,'holiday']，from/to 可选
 *   ④ 区间 + 周几     mode:'weekdays'   days:[...] + from/to 都填
 *
 * 「周六、周日」= days:[0,6]；「X月X日到X月X日」= mode:'weekdays' + days 空 + from/to
 * （days 空 = 区间里每天都算）。这样四种需求只有三种模式，不用再堆。
 * ================================================================ */

const SCHED_MODES = ['always', 'dates', 'weekdays'];

/** 周几的名字，下标就是 Date.getDay()（0 = 周日） */
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 「法定节假日」在 days 里的标记（具体哪天是节假日由 settings.holidays 决定） */
const HOLIDAY_KEY = 'holiday';

/** 空的有效期（= 长期） */
function emptySched() {
  return { mode: 'always', from: '', to: '', days: [], dates: [] };
}

const isDateKey = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); };

/** 把任何东西规整成一个合法的 sched（容错，不抛） */
function normalizeSched(v) {
  const s = emptySched();
  if (!v || typeof v !== 'object') return s;
  if (SCHED_MODES.indexOf(v.mode) >= 0) s.mode = v.mode;
  if (isDateKey(v.from)) s.from = v.from;
  if (isDateKey(v.to)) s.to = v.to;
  // from 比 to 晚就交换，免得永远不生效
  if (s.from && s.to && s.from > s.to) { const t = s.from; s.from = s.to; s.to = t; }
  if (Array.isArray(v.days)) {
    v.days.forEach(function (d) {
      if (d === HOLIDAY_KEY) { if (s.days.indexOf(HOLIDAY_KEY) < 0) s.days.push(HOLIDAY_KEY); return; }
      const n = Number(d);
      if (Number.isInteger(n) && n >= 0 && n <= 6 && s.days.indexOf(n) < 0) s.days.push(n);
    });
    s.days.sort(function (a, b) {
      if (a === HOLIDAY_KEY) return 1;
      if (b === HOLIDAY_KEY) return -1;
      // 从**周一**开始排，这样「周六、周日」读着顺（周日是最後一个）
      return ((a + 6) % 7) - ((b + 6) % 7);
    });
  }
  if (Array.isArray(v.dates)) {
    v.dates.forEach(function (d) {
      if (isDateKey(d) && s.dates.indexOf(d) < 0) s.dates.push(d);
    });
    s.dates.sort();
    s.dates = s.dates.slice(0, 60);
  }
  /* 形态自洽：指定日期模式没日期、按周几模式没周几也没区间 → 退回长期 */
  if (s.mode === 'dates' && !s.dates.length) s.mode = 'always';
  if (s.mode === 'weekdays' && !s.days.length && !s.from && !s.to) s.mode = 'always';
  return s;
}

/** 老数据的 `due`（一个截止日期）迁移成 sched：那天之前都有效 */
function schedFromDue(due) {
  const d = String(due || '');
  if (!d || d === TASK_LONG_TERM || !isDateKey(d)) return emptySched();
  return normalizeSched({ mode: 'weekdays', days: [], from: '', to: d });
}

/** 这个任务的有效期（老存档只有 due 的话顺手迁移一次） */
function taskSched(task) {
  if (!task) return emptySched();
  if (task.sched) return normalizeSched(task.sched);
  return schedFromDue(task.due);
}

/** 这一天是不是节假日（家长在设置里维护的清单） */
function isHoliday(dateKey, holidays) {
  return Array.isArray(holidays) && holidays.indexOf(dateKey) >= 0;
}

/**
 * 这一天在不在有效期内（**只看有效期本身**，不看手动「停用」）。
 * holidays = settings.holidays（'YYYY-MM-DD' 的数组）
 */
function schedMatches(sched, dateKey, holidays) {
  const s = normalizeSched(sched);
  if (!isDateKey(dateKey)) return false;
  if (s.mode === 'always') return true;
  if (s.mode === 'dates') return s.dates.indexOf(dateKey) >= 0;
  // weekdays
  if (s.from && dateKey < s.from) return false;
  if (s.to && dateKey > s.to) return false;
  if (!s.days.length) return true;                 // 只限区间，不限周几
  const wd = parseDateKey(dateKey).getDay();
  if (s.days.indexOf(wd) >= 0) return true;
  if (s.days.indexOf(HOLIDAY_KEY) >= 0 && isHoliday(dateKey, holidays)) return true;
  return false;
}

/** 任务这一天算不算启用（手动停用 / 已删除 / 不在有效期 → 都不启用） */
function taskActiveOn(task, dateKey, holidays) {
  if (!task) return false;
  if (task.active === false) return false;
  /*
   * 第 91 轮：软删除。删除**那一天之前**的历史照常算有效，
   * 这样"那天完成了几项"、完成度百分比都不会因为删任务而缩水；
   * 删除当天及以后就不再出现。
   */
  if (task.deleted) {
    const from = isValidDateKey(task.deletedAt) ? task.deletedAt : '';
    if (!from || String(dateKey) >= from) return false;
  }
  return schedMatches(taskSched(task), dateKey, holidays);
}

/** 旧名字保留（很多地方在用）；等价于 taskActiveOn */
function taskActive(task, dateKey, holidays) {
  return taskActiveOn(task, dateKey, holidays);
}

/** 这个任务是不是「长期」的（不用标有效期） */
function schedAlways(task) {
  return taskSched(task).mode === 'always';
}

/**
 * 有效期在界面上怎么显示（第 81 轮 5）。
 *
 * 返回纯文字，标签栏里再加上 📅 前缀。
 *   · 长期                     → 「长期」
 *   · 按周几                   → 「周六、周日」/「10-01～10-07 的周六」…
 *   · 指定日期（多个）         → **只显示最近两个**，剩下的用「…」
 *     （家长说"多个特定日期的，显示最近两个有效期，未显示完的用省略号"）
 */
function schedLabel(task, todayKey) {
  const s = taskSched(task);
  if (s.mode === 'always') return '长期';
  const md = function (d) { return d.slice(5); };   // '2026-10-20' → '10-20'
  if (s.mode === 'dates') {
    // 「最近两个」= 从今天起往后的前两个；今天的都过去了就退回最后两个
    const from = todayKey || '';
    const future = s.dates.filter(function (d) { return !from || d >= from; });
    const pick = (future.length ? future : s.dates).slice(0, 2);
    const rest = s.dates.length - pick.length;
    return pick.map(md).join('、') + (rest > 0 ? ' …' : '');
  }
  // weekdays
  const parts = [];
  if (s.from && s.to) parts.push(md(s.from) + '～' + md(s.to));
  // 单边区间写清楚，别显示成「～10-20」那种半截
  else if (s.from) parts.push(md(s.from) + ' 起');
  else if (s.to) parts.push('到 ' + md(s.to) + ' 为止');
  if (s.days.length) {
    parts.push(s.days.map(function (d) {
      return d === HOLIDAY_KEY ? '节假日' : WEEKDAY_NAMES[d];
    }).join('、'));
  }
  return parts.join(' ') || '长期';
}

/** 把日期字符串当数字比大小 */
function dueAfter(a, b) { return String(a || '') > String(b || ''); }

/** 这个任务在这一天之前就结束了吗（只用于老接口的兼容判断） */
function taskExpired(task, dateKey) {
  const s = taskSched(task);
  if (s.mode === 'always') return false;
  if (s.to) return dueAfter(dateKey, s.to);
  if (s.mode === 'dates') {
    return s.dates.length > 0 && s.dates.every(function (d) { return dueAfter(dateKey, d); });
  }
  return false;
}

/** 老接口：标签栏里的那枚牌子（现在直接走 schedLabel） */
function taskDueLabel(task, dateKey) {
  return schedLabel(task, dateKey);
}
function taskDueBadge(task, dateKey) {
  return schedLabel(task, dateKey);
}

/** 任务标签在列表里的排序：功课 → 生活 → 精神 → 其他自定义（按首次出现的顺序） */
function taskTagRank(tag, allTags) {
  const i = TASK_TAGS.indexOf(String(tag || ''));
  if (i >= 0) return i;
  // 自定义标签排在预设之后，互相之间按"谁先出现"排，保证顺序稳定
  const custom = (allTags || []).filter(function (t) { return t && TASK_TAGS.indexOf(t) < 0; });
  const j = custom.indexOf(String(tag || ''));
  return TASK_TAGS.length + (j < 0 ? custom.length : j);
}

/*
 * 标签的配色。位置和样式跟作业的科目（语文/数学）完全一样，
 * 所以这里也照 subjectMeta 的路子来。
 */
const TASK_TAG_COLORS = {
  功课: '#3b7fd4',   // 蓝：要动脑的
  生活: '#12a3a5',   // 青：日常事务
  精神: '#e0872b',   // 橙：运动、精气神
};

/** 标签的显示信息（自定义标签给个中性色） */
function taskTagMeta(tag) {
  const t = String(tag || '');
  return { name: t, color: TASK_TAG_COLORS[t] || '#8a7a68' };
}

/**
 * 每日任务"这一天"该长什么样（第 66 轮 6）。
 *
 * 打勾的时候会在当天记录里拍一张快照（见 item.done），
 * 有快照就按快照显示 —— 家长后来改名字 / 改分值 / 改标签，只影响以后，历史原样保留。
 *
 * ★ 但**今天不算历史**（第 73 轮修）：家长刚把标签从「精神」改成「功课」，
 *   今天这张卡还显示「精神」的话，看起来就是"改了没成功"。
 *   所以传进来 dateKey 时，只有**不是今天**的那一天才用快照。
 *   翻回昨天、前天，看到的还是当时的样子。
 */
function taskView(task, rec, dateKey) {
  const isToday = !dateKey || dateKey === todayKey();
  const s = (!isToday && rec && rec.snap) ? rec.snap : null;
  return {
    emoji: (s && s.emoji) || task.emoji,
    title: (s && s.title) || task.title,
    tag: (s && s.tag) || task.tag,
    points: (s && typeof s.points === 'number') ? s.points : task.points,
  };
}

/*
 * 老存档的每日任务没有标签，按标题猜一个。
 * 猜错了家长在「修改」里点一下就能改 —— 比全都塞进同一档强。
 * 顺序有讲究：先看"精神"（运动类），再看"功课"（学习类），剩下都归"生活"。
 */
const TAG_WORDS = [
  ['精神', ['运动', '跳绳', '跑步', '锻炼', '体前屈', '跳远', '打球', '游泳', '骑车', '户外',
    '散步', '瑜伽', '体操', '眼保健操', '情绪', '心情']],
  ['功课', ['阅读', '读书', '背诵', '朗读', '跟读', '写字', '生字', '口算', '练习', '复习',
    '预习', '听写', '默写', '作业', '识字', '古诗', '课文', '日记', '观察', '画画', '绘画',
    '手工', '实验', '科学']],
  ['生活', ['书包', '书桌', '整理', '收拾', '家务', '打扫', '扫地', '洗碗', '浇花', '喂',
    '睡觉', '刷牙', '洗脸', '洗澡', '吃饭', '穿衣', '穿鞋', '喝水', '电话', '袜子', '被子']],
];

/** 从标题猜一个标签（猜不出来归「生活」—— 日常事务里最常见的就它） */
function tagFromLegacyTitle(title) {
  const t = String(title || '');
  for (let i = 0; i < TAG_WORDS.length; i++) {
    const tag = TAG_WORDS[i][0];
    const words = TAG_WORDS[i][1];
    for (let k = 0; k < words.length; k++) {
      if (t.indexOf(words[k]) >= 0) return tag;
    }
  }
  return '生活';
}

/**
 * 法定节假日的默认清单（第 81 轮）。
 *
 * 只放**固定公历日期**的那几个（元旦 / 劳动节 / 国庆），今年和明年各一份。
 * 春节、清明、端午、中秋是农历的，还有每年的调休 —— 那些算不出来，
 * 得家长在「设置 → 法定节假日」里自己加（界面里也写明了）。
 */
function defaultHolidays() {
  const y = new Date().getFullYear();
  const out = [];
  [y, y + 1].forEach(function (yy) {
    out.push(yy + '-01-01');                       // 元旦
    out.push(yy + '-05-01');                       // 劳动节
    for (let d = 1; d <= 7; d++) {                 // 国庆
      out.push(yy + '-10-0' + d);
    }
  });
  return out;
}

/** 新房间默认带上的每日任务（顺序就是界面上的顺序，家长可以自己调） */
const DEFAULT_DAILY_TASKS = [
  // 顺序按标签来：功课 → 生活 → 精神；有效期默认「长期」
  { id: 'read', emoji: '📖', title: '亲子阅读 15 分钟', tag: '功课', sched: emptySched(), points: 2, active: true },
  { id: 'tidy', emoji: '🎒', title: '整理书包和书桌', tag: '生活', sched: emptySched(), points: 1, active: true },
  { id: 'chore', emoji: '🧹', title: '帮家里做家务', tag: '生活', sched: emptySched(), points: 2, active: true },
  { id: 'sleep', emoji: '🌙', title: '晚上 9 点前上床睡觉', tag: '生活', sched: emptySched(), points: 1, active: true },
  { id: 'sport', emoji: '🏃', title: '运动 30 分钟', tag: '精神', sched: emptySched(), points: 2, active: true },
];

const DEFAULT_REWARDS = [
  { id: 'r1', emoji: '🍦', title: '吃一个冰淇淋', cost: 10, active: true },
  { id: 'r2', emoji: '📺', title: '看动画片 30 分钟', cost: 15, active: true },
  { id: 'r3', emoji: '📚', title: '买一本新绘本', cost: 30, active: true },
  { id: 'r4', emoji: '🎡', title: '去游乐场玩一次', cost: 60, active: true },
];

/*
 * 常用作业库：一年级翻来覆去就那几样，「从常用作业库选择」里点一下就加好了，
 * 不用每天重新打一遍字。家长也能把当天临时加的作业顺手存进来。
 * 备注里写清"做到什么程度算完成"，点一下就带过去，省得每天重写。
 */
const DEFAULT_COMMON_HOMEWORKS = [
  { subject: '体育', title: '跳绳3组，每组1分钟',
    detail: '打卡上传视频到家校本，允许补卡' },
  { subject: '体育', title: '体前屈3组，每组20个',
    detail: '打卡上传视频到家校本，允许补卡' },
  { subject: '语文', title: '亲子阅读 15 分钟',
    detail: '父母先领读，孩子再复述（主要讲清楚时间、地点、人物、发生了什么、是什么原因导致、怎么解决、学到了什么）' },
];

/*
 * 历史默认值（只用来识别"家长一条都没改过"的老存档，然后整体升级）。
 * 换过两次，所以有两组。
 */
const LEGACY_COMMON_SETS = [
  // 第 1 代：8 条
  ['背诵古诗一首', '读课文 2 遍', '生字写 2 遍', '口算一页',
    '数学书做一做', '跟读课文 3 遍', '跳绳 200 个', '亲子阅读 15 分钟'],
  // 第 2 代：3 条（标题里带着做法）
  ['每日跳绳', '每日体前屈', '亲子阅读 15 分钟'],
];

/* ------------------------------------------------------------ 小工具函数 */

function uid(prefix) {
  const rnd = (globalThis.crypto && globalThis.crypto.randomUUID)
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return (prefix || 'x') + '_' + rnd;
}

/**
 * 外面（界面）要造新 id 时用这个。
 * 生成出来的形状必须能过 isSafeId，否则会被当成"客户端瞎写的"而重新生成。
 */
function newId(prefix) { return uid(prefix); }

/** id 的合法形状：`<前缀>_<一串小写字母数字>`，不认别的（防止有人往里塞奇怪东西） */
function isSafeId(id) {
  return typeof id === 'string' && /^[a-z]{1,4}_[a-z0-9]{4,24}$/.test(id);
}

/**
 * 由一段文本推出一个**稳定**的 id —— 同一个种子在浏览器和服务器上算出来必须一样。
 *
 * 用在「复制到今天」这类由服务器和客户端各自 applyOp 的地方：
 * 如果两边各自 random 一个 id，客户端乐观更新出来的那条和服务器的就对不上，
 * 同步回来一替换，客户端手里的 id 就成了孤儿。
 */
function derivedId(prefix, seed) {
  const s = String(seed);
  let a = 2166136261;
  for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 16777619); }
  let b = 2166136261;
  for (let i = s.length - 1; i >= 0; i--) { b ^= s.charCodeAt(i); b = Math.imul(b, 16777619); }
  return prefix + '_' + ((a >>> 0).toString(36) + (b >>> 0).toString(36)).slice(0, 12);
}

/**
 * ★ 新增记录时，**优先用 op 里带过来的 id**。
 *
 * 这是踩出来的坑：`uid()` 两边各自随机，客户端乐观更新用了 id A、
 * 服务器落库用了 id B，同步回来一替换，界面上任何还捏着 A 的按钮
 * （☆ / ✎ / ✕）都会静默失效 —— `findItem` 找不到就 `break`，连报错都没有。
 * 所以新增类的 op 一律由发起方（界面）先造好 id 塞进 op 里。
 *
 * 带了但不合规矩的（有人手改请求）就当没带，服务器自己生成一个。
 */
function useId(given, prefix) {
  return isSafeId(given) ? given : uid(prefix);
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

/**
 * 本地时区的 YYYY-MM-DD。
 * 导出是因为界面上也要判断"某个时间戳属于哪一天"（第 92 轮：
 * 已兑现的兑换只显示当天的，就得把 resolvedAt 换算成日期来比）。
 */
function dateKey(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
}

function todayKey() { return dateKey(new Date()); }

function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function shiftDate(key, days) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

function isValidDateKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key || ''));
}

/** 返回以 date 所在周（周一为第一天）为基准的 7 个日期 */
function weekKeys(key) {
  const d = parseDateKey(key);
  const dow = (d.getDay() + 6) % 7; // 周一 = 0
  const start = shiftDate(key, -dow);
  const out = [];
  for (let i = 0; i < 7; i++) out.push(shiftDate(start, i));
  return out;
}

const WEEK_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
function weekdayCN(key) { return WEEK_CN[parseDateKey(key).getDay()]; }

function friendlyDate(key) {
  const d = parseDateKey(key);
  const t = todayKey();
  if (key === t) return '今天';
  if (key === shiftDate(t, -1)) return '昨天';
  if (key === shiftDate(t, 1)) return '明天';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function subjectMeta(name) {
  const fallback = SUBJECTS[SUBJECTS.length - 1];
  if (!name) return fallback;
  const n = String(name).trim();
  return SUBJECTS.find(function (s) { return s.name === n; })
    || SUBJECTS.find(function (s) { return n.indexOf(s.name) >= 0 || s.name.indexOf(n) >= 0; })
    || fallback;
}

/* -------------------------------------------------------------- 数据模型 */

function emptyDay() {
  return { homeworks: [], extras: [], tasks: {}, note: '', mood: '', review: null };
}

/**
 * 家长给这一天的学习情况写的一段评价（可奖可扣小红花）。
 * 跟其它条目一样带 awarded / awardedPoints，这样「清空小红花」时
 * 可以用同一套逻辑把它中性化，不会等到下次改评价时把账算乱。
 */
function emptyReview() {
  return { text: '', points: 0, at: 0, awarded: false, awardedPoints: 0 };
}

function emptyRecord() {
  return {
    done: false, doneAt: null, confirmed: false, confirmedAt: null,
    awarded: false, awardedPoints: 0,
    // 家长撤销时填的理由（只有被撤销过才有值）；孩子页面据此决定能不能再做
    undoKind: '', undoReason: '', undoneAt: null,
    // 孩子做完后交上来的附件（照片 / 视频 / 文本…）
    works: [],
  };
}

/**
 * 一条附件的标准形状。
 * id 由服务端在上传时生成，name/kind/size/mime 也以服务端返回的为准
 * （客户端只负责把文件传上去，不自己编 id）。
 */
function normalizeAttachment(a) {
  if (!a || typeof a !== 'object') return null;
  const id = String(a.id || '');
  if (!isUploadId(id)) return null;
  const name = String(a.name || id).slice(0, 120);
  const spec = checkUpload(name, a.mime);
  return {
    id: id,
    name: name,
    size: Math.max(0, Number(a.size) || 0),
    mime: String(a.mime || (spec.ok ? spec.mime : 'application/octet-stream')).slice(0, 100),
    kind: ['image', 'video', 'audio', 'text'].indexOf(a.kind) >= 0 ? a.kind
      : (spec.ok ? spec.kind : 'file'),
    at: Number(a.at) || Date.now(),
  };
}

/** 去重 + 丢弃不合法的，最多留 30 条 */
function normalizeAttachments(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = {};
  arr.forEach(function (a) {
    const n = normalizeAttachment(a);
    if (n && !seen[n.id]) { seen[n.id] = 1; out.push(n); }
  });
  return out.slice(0, 30);
}

/** 附件挂在谁身上：'item' = 这项作业本身（家长传的要求），'work' = 孩子交的成果 */
function attachTarget(state, date, kind, id, scope) {
  const t = findTarget(state, date, kind, id);
  if (!t) return null;
  if (scope === 'work') return t.rec;
  // 额外任务是"当天那一份"，其余是"长期定义"，两种情况都在对象本身上挂
  return t.item || t.rec;
}

/** 只补上缺的字段，绝不覆盖已有的值 */
function fillRecord(it) {
  const rec = emptyRecord();
  Object.keys(rec).forEach(function (k) {
    if (it[k] === undefined) it[k] = rec[k];
  });  it.done = !!it.done;
  it.confirmed = !!it.confirmed;
  it.awarded = !!it.awarded;
  it.awardedPoints = Number(it.awardedPoints) || 0;
  it.doneAt = it.doneAt || null;
  it.confirmedAt = it.confirmedAt || null;
  return it;
}

function defaultState() {
  const now = Date.now();
  return {
    v: VERSION,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    settings: {
      childName: '宝贝',
      roomName: '',          // 房间的显示名，留空就跟着孩子名字走
      parentPin: '1234',
      requireConfirm: true,
      homeworkPoints: 2,
      welcome: '加油鸭！完成后就可以「自由玩耍」了✈️~~~',
      focusEnabled: true,   // 卡片上显示「⏱ 开始专注」
      focusMinutes: 20,     // 专注多久
      breakMinutes: 5,      // 时间到还没做完，先休息多久
      // 上传前自动压缩图片（手机照片动辄好几 MB，压完打开快很多，肉眼看不出差别）
      compressImages: true,
      // 法定节假日清单（'YYYY-MM-DD'）：任务有效期可以勾「节假日」用，家长可自己改
      holidays: defaultHolidays(),
    },
    dailyTasks: DEFAULT_DAILY_TASKS.map(function (x) { return Object.assign({}, x); }),
    rewards: DEFAULT_REWARDS.map(function (x) { return Object.assign({}, x); }),
    commonHomeworks: DEFAULT_COMMON_HOMEWORKS.map(function (x) { return Object.assign({ id: uid('ch') }, x); }),
    days: {},
    points: { balance: 0, earned: 0, spent: 0 },
    ledger: [],
    redemptions: [],
  };
}

/** 补齐旧版本/缺失字段，保证前端永远拿到完整结构 */
function normalizeState(raw) {
  const defaults = defaultState();
  if (!raw || typeof raw !== 'object') return defaults;

  // 注意：一定要往空对象里合并。直接 Object.assign(defaults, raw) 会把
  // raw.settings 的引用顶掉 defaults.settings，下一行就变成自己合并自己，
  // 旧存档里没有的新字段（比如后来的 focusMinutes）就永远补不上。
  const s = Object.assign({}, defaults, raw);
  s.settings = Object.assign({}, defaults.settings, raw.settings || {});
  // 老存档里可能还留着这两个早就没人读的字段，读的时候直接丢掉
  delete s.settings.bigFont;
  delete s.settings.voiceOn;
  /*
   * 节假日清单（第 81 轮）：老存档没有就给一份默认（固定公历的那几个），
   * 有就只留合法的 'YYYY-MM-DD'、去重、排好序。
   */
  if (!Array.isArray(s.settings.holidays)) s.settings.holidays = defaultHolidays();
  else {
    s.settings.holidays = s.settings.holidays
      .map(function (d) { return String(d || '').trim(); })
      .filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); })
      .filter(function (d, i, arr) { return arr.indexOf(d) === i; })
      .sort();
  }
  s.points = Object.assign({ balance: 0, earned: 0, spent: 0 }, raw.points || {});
  s.days = raw.days && typeof raw.days === 'object' ? raw.days : {};
  s.ledger = Array.isArray(raw.ledger) ? raw.ledger : [];
  s.redemptions = Array.isArray(raw.redemptions) ? raw.redemptions : [];
  s.dailyTasks = Array.isArray(raw.dailyTasks)
    ? raw.dailyTasks
    : defaults.dailyTasks.map(function (x) { return Object.assign({}, x); });
  s.rewards = Array.isArray(raw.rewards)
    ? raw.rewards
    : defaults.rewards.map(function (x) { return Object.assign({}, x); });
  // 老存档补字段：任务是后加的「备注」「标签」「有效期」，奖励是后加的「停用」
  s.dailyTasks.forEach(function (t) {
    if (typeof t.note !== 'string') t.note = '';
    t.active = t.active !== false;
    t.attachments = normalizeAttachments(t.attachments);
    if (typeof t.tag !== 'string' || !t.tag) t.tag = tagFromLegacyTitle(t.title);
    /*
     * 第 81 轮：`due`（一个截止日期）→ `sched`（有效期）。
     * 老语义是"到那天为止都有效"，所以迁移成「区间到 due 为止」。
     * 迁完就把 due 删掉，避免两份真相。
     */
    if (!t.sched) t.sched = schedFromDue(t.due);
    else t.sched = normalizeSched(t.sched);
    delete t.due;
    /*
     * 第 91 轮：软删除的标记要保住（`deleted` + `deletedAt`）。
     * 不校验的话老存档里万一有脏值（比如 deletedAt 是 "明天"），
     * taskActiveOn 的日期比较就会乱来。
     */
    if (t.deleted !== undefined) t.deleted = Boolean(t.deleted) && t.deleted !== 'false';
    if (t.deletedAt !== undefined && !isValidDateKey(t.deletedAt)) delete t.deletedAt;
  });
  /*
   * 老存档的任务没有标签，这里按标题猜一个（见 tagFromLegacyTitle），
   * 猜完顺手按标签排一次序 —— 只在"刚补上标签"的时候排，
   * 之后家长手动 ↑↓ 的次序不会被覆盖。
   */
  if (!raw.tasksSortedByTag) {
    s.dailyTasks.sort(function (a, b) {
      const all = s.dailyTasks.map(function (x) { return x.tag; });
      return taskTagRank(a.tag, all) - taskTagRank(b.tag, all);
    });
    s.tasksSortedByTag = true;
  }
  /*
   * 每天的作业也按科目次序排一次（第 80 轮 1）：
   *   语文 → 数学 → 英语 → 科学 → 美术 → 音乐 → 体育 → 道法 → 其他
   *
   * 为什么要排：老存档是按"录入的先后"堆起来的，科目是乱的；
   * 而 hw.add / day.copy 的插入位置是**假设列表已经有序**的（见 hwInsertAt），
   * 列表本身乱的话插进去也不会对。
   *
   * 只在**第一次**做（`homeworksSortedByRank` 标记），
   * 之后家长手动 ↑↓ 的次序不会再被覆盖 —— 和任务那边 `tasksSortedByTag` 一个路子。
   * Array.sort 在现代引擎里是稳定的，同一科目内部的先后顺序保持不变。
   */
  if (!raw.homeworksSortedByRank) {
    Object.keys(s.days).forEach(function (k) {
      const list = s.days[k] && s.days[k].homeworks;
      if (Array.isArray(list)) {
        list.sort(function (a, b) { return subjectRank(a.subject) - subjectRank(b.subject); });
      }
    });
    s.homeworksSortedByRank = true;
  }
  /*
   * 常用作业库也按科目次序排一次（第 83 轮）：语文 → 数学 → … → 其他。
   * 同样只在第一次做，之后家长手动 ↑↓ 的次序不会被覆盖。
   */
  if (!raw.commonSortedByRank) {
    if (Array.isArray(s.commonHomeworks)) {
      s.commonHomeworks.sort(function (a, b) {
        return subjectRank(a.subject) - subjectRank(b.subject);
      });
    }
    s.commonSortedByRank = true;
  }
  /*
   * 欢迎语：把**恰好等于历史默认值**的那几句升级成现在的默认值。
   * 只认完全相等的情况，家长自己改过的文案一个字都不动。
   * （换过两次默认值，所以这里列了两句老的。）
   */
  if (s.settings.welcome === '今天也要加油鸭！' ||
      s.settings.welcome === '今天也要加油鸭！完成后可自由玩耍✈️~~~') {
    s.settings.welcome = defaults.settings.welcome;
  }

  s.rewards.forEach(function (r) {
    r.active = r.active !== false;
  });
  // 常用作业库：老存档没有就用默认那几条
  s.commonHomeworks = Array.isArray(raw.commonHomeworks)
    ? raw.commonHomeworks
    : defaults.commonHomeworks.map(function (x) { return Object.assign({}, x); });
  /*
   * 定向迁移：如果库里的条目**恰好就是某一代默认值**（标题和顺序都一样，
   * 一条没改过），就整体换成现在的默认 3 条。家长自己动过任何一条都不迁移。
   */
  if (LEGACY_COMMON_SETS.some(function (set) {
    return s.commonHomeworks.length === set.length &&
      s.commonHomeworks.every(function (x, i) { return x.title === set[i]; });
  })) {
    s.commonHomeworks = defaults.commonHomeworks.map(function (x) { return Object.assign({}, x); });
  }
  s.commonHomeworks.forEach(function (c) {
    if (typeof c.detail !== 'string') c.detail = '';
    if (!c.subject) c.subject = '其他';
    c.attachments = normalizeAttachments(c.attachments);
  });
  s.rev = Number(s.rev) || 0;
  Object.keys(s.days).forEach(function (k) {
    const d = s.days[k] || {};
    d.homeworks = Array.isArray(d.homeworks) ? d.homeworks : [];
    d.extras = Array.isArray(d.extras) ? d.extras : [];
    d.tasks = d.tasks && typeof d.tasks === 'object' ? d.tasks : {};
    d.note = typeof d.note === 'string' ? d.note : '';
    d.mood = typeof d.mood === 'string' ? d.mood : '';
    d.review = d.review && typeof d.review === 'object'
      ? Object.assign(emptyReview(), d.review)
      : null;
    d.homeworks.forEach(function (h) {
      fillRecord(h);
      h.attachments = normalizeAttachments(h.attachments);
    });
    d.extras.forEach(function (e) {
      fillRecord(e);
      // 额外任务的备注是后加的字段，老存档要补上
      if (typeof e.note !== 'string') e.note = '';
      e.attachments = normalizeAttachments(e.attachments);
    });
    Object.keys(d.tasks).forEach(function (id) {
      fillRecord(d.tasks[id]);
      d.tasks[id].works = normalizeAttachments(d.tasks[id].works);
    });
    s.days[k] = d;
  });
  return s;
}

function ensureDay(state, date) {
  if (!state.days[date]) state.days[date] = emptyDay();
  return state.days[date];
}

function getDay(state, date) {
  return state.days[date] || emptyDay();
}

/* ------------------------------------------------- 钉钉作业文本智能解析 */

// 整行就是一句开场白，不是作业
const NOISE_RE = /^(温馨提示|通知|作业如下|今日作业|今天的作业|家庭作业|作业|如下)[:：，,。!！]?$/;
// 以这些词开头的整行都是开场白
const NOISE_PREFIX_RE = /^(各位家长|家长们|亲爱的家长|@所有人|大家好|各位同学|同学们)/;
// 提醒类的话，不该被算到上一门科目头上
const REMINDER_RE = /^(明天|今天|记得|别忘|不要忘|注意|温馨|提前|请|要带|带上|带好|准备好)/;
const STOP_SUBJECT = ['提示', '注意', '温馨', '要求', '家长', '备注', '说明', '明天', '今天', '请', '作业', '时间', '内容', '如下', '通知', '温馨提示'];

function isKnownSubjectName(name) {
  if (!name) return false;
  return SUBJECTS.some(function (s) { return s.name === name; })
    || ['语文', '数学', '英语', '科学', '美术', '音乐', '体育', '道法', '道德与法治'].indexOf(name) >= 0;
}

function detectSubjectByKeyword(text) {
  const t = String(text || '').toLowerCase();
  let best = null, bestLen = 0;
  SUBJECTS.forEach(function (s) {
    s.keys.forEach(function (k) {
      if (t.indexOf(k.toLowerCase()) >= 0 && k.length > bestLen) { best = s.name; bestLen = k.length; }
    });
  });
  return best || '其他';
}

function splitTitleDetail(text) {
  let t = String(text || '').replace(/[。．.]\s*$/, '').trim();
  let detail = '';
  const m = t.match(/^(.*?)[，,;；]\s*((?:家长|父母|请家长)[^，,;；]*)$/);
  if (m && m[1].trim()) { t = m[1].trim(); detail = m[2].trim(); }
  else if (t.length > 18) {
    const i = t.search(/[，,]/);
    if (i >= 6 && i <= 24) { detail = t.slice(i + 1).trim(); t = t.slice(0, i).trim(); }
  }
  return { title: t, detail: detail };
}

/**
 * 把从钉钉里复制的一段作业文本，拆成 [{subject, title, detail}]
 * 能认出来的写法：
 *   语文：背诵《静夜思》，家长签字
 *   【数学】口算 P20
 *   1. 英语跟读 Unit 3
 *   数学作业：            ← 后面几行都归到数学
 *   请家长陪同完成
 */
function parseHomeworkText(text) {
  const out = [];
  if (!text) return out;

  const rawLines = String(text).replace(/\r/g, '').split('\n');
  const lines = [];
  rawLines.forEach(function (raw) {
    const line = raw.trim();
    if (!line) return;
    // 很长的行里如果用了分号分隔多条，就再拆一层
    if (line.length > 28 && /[；;]/.test(line)) {
      line.split(/[；;]/).forEach(function (p) { if (p.trim()) lines.push(p.trim()); });
    } else {
      lines.push(line);
    }
  });

  let currentSubject = '';

  lines.forEach(function (raw) {
    let line = raw.trim();
    if (!line) return;

    // 【语文】xxx  /  [数学] xxx
    let subject = '';
    const bracket = line.match(/^[【\[]([^】\]]{1,10})[】\]]\s*(.*)$/);
    if (bracket) {
      subject = bracket[1].replace(/作业$/, '').trim();
      line = (bracket[2] || '').trim();
    }

    // 去掉行首的序号 / 项目符号
    line = line.replace(/^[\s\-–—*•·●○]+/, '');
    line = line.replace(/^\d+\s*[.、)）:：]\s*/, '');
    line = line.replace(/^[（(]\s*\d+\s*[)）]\s*/, '');
    line = line.replace(/^[一二三四五六七八九十]+\s*[、.)）：:]\s*/, '');
    line = line.trim();
    if (!line) {
      if (subject) currentSubject = subject;
      return;
    }

    if (NOISE_RE.test(line) || NOISE_PREFIX_RE.test(line)) return;

    // 纯科目标题行：“数学作业：”“语文：”
    const header = line.match(/^(语文|数学|英语|科学|美术|音乐|体育|道法|道德与法治)(?:作业)?\s*[:：]?\s*$/);
    if (header) { currentSubject = header[1]; return; }

    // “科目：内容”
    if (!subject) {
      const kv = line.match(/^([^\s:：]{1,8})\s*[:：]\s*(.+)$/);
      if (kv) {
        const cand = kv[1].replace(/作业$/, '').trim();
        const ok = isKnownSubjectName(cand)
          || (cand.length <= 3 && STOP_SUBJECT.indexOf(cand) < 0 && /^[\u4e00-\u9fa5]{2,3}$/.test(cand));
        if (ok) { subject = cand; line = kv[2].trim(); }
      }
    }

    // 没写科目的时候，先看内容里的关键词，再退回上一行的科目块
    if (!subject) {
      const byKeyword = detectSubjectByKeyword(line);
      if (byKeyword !== '其他') subject = byKeyword;
      else if (REMINDER_RE.test(line)) subject = '其他';
      else subject = currentSubject || '其他';
    }
    if (isKnownSubjectName(subject)) currentSubject = subject;

    const parts = splitTitleDetail(line);
    if (!parts.title) return;

    out.push({
      subject: SUBJECTS.some(function (s) { return s.name === subject; }) ? subject : '其他',
      rawSubject: subject,
      title: parts.title,
      detail: parts.detail,
    });
  });

  return out;
}

/* ------------------------------------------------------------ 积分与结算 */

function pushLedger(state, entry) {
  state.ledger.unshift(entry);
  if (state.ledger.length > 400) state.ledger.length = 400;
}

function clampPoints(v) {
  if (v === '' || v === null || v === undefined) return null; // 留空 = 跟着全局设置
  const n = Number(v);
  if (!isFinite(n)) return null;
  return Math.max(0, Math.min(20, Math.round(n)));
}

/**
 * 数字输入的统一解析。以前各处的写法是 `Number(v) || 默认值`，于是：
 *   · 用户明明填了 0，被 `|| ` 当成"没填"，悄悄换成默认值
 *   · 同一个 0，新建时变成 10、编辑时变成 1（两处默认值不一样）
 * 现在统一成：留空/非法 → 返回默认值；填了数字 → 按数字走（再交给调用方 clamp）。
 */
function parseNum(v, dflt) {
  if (v === '' || v === null || v === undefined) return dflt;
  const n = Number(v);
  return isFinite(n) ? n : dflt;
}

/** clamp 到 [lo, hi] 的整数 */
function clampInt(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** 各项实际值多少小红花：作业可以单项覆盖全局设置 */
function pointsOfHomework(state, hw) {
  if (hw && hw.points !== undefined && hw.points !== null) return Number(hw.points) || 0;
  return Number(state.settings.homeworkPoints) || 0;
}

function findTarget(state, date, kind, id) {
  const day = ensureDay(state, date);

  if (kind === 'homework') {
    const it = day.homeworks.filter(function (x) { return x.id === id; })[0];
    if (!it) return null;
    // 作业和额外任务是"当天的那一份"，item 和 rec 是同一个对象
    return { rec: it, item: it, points: pointsOfHomework(state, it), label: it.title, kind: 'homework' };
  }
  if (kind === 'extra') {
    const it = day.extras.filter(function (x) { return x.id === id; })[0];
    if (!it) return null;
    return { rec: it, item: it, points: Number(it.points) || 0, label: it.title, kind: 'extra' };
  }
  if (kind === 'task') {
    const t = state.dailyTasks.filter(function (x) { return x.id === id; })[0];
    if (!t) return null;
    if (!day.tasks[id]) day.tasks[id] = emptyRecord();
    // 每日任务是"长期定义"，附件挂在定义上（每天都能看到这份要求）
    return { rec: day.tasks[id], item: t, points: Number(t.points) || 0, label: t.title, kind: 'task' };
  }
  return null;
}

/**
 * 根据 done / confirmed 重新决定这朵小红花算不算。
 * 关掉"家长确认"时，打勾即得分；开着时，要家长确认才得分。
 */
/**
 * 把一条记录上已经发出的小红花收回来。
 *
 * 注意：删除一条记录时必须用这个，不能直接调 settle()。
 * settle() 的判断是「该发却没发 / 不该发却发了」，而删除那一刻
 * 记录的 done/confirmed 还是 true，settle() 会认为"本来就该发"，直接空转，
 * 结果东西删了、星星还留在账上（这个 bug 之前就在）。
 */
function revokeAward(state, rec, kind, date, label, reasonPrefix) {
  if (!rec.awarded) return 0;
  const pts = Number(rec.awardedPoints) || 0;
  rec.awarded = false;
  rec.awardedPoints = 0;
  state.points.balance -= pts;
  state.points.earned -= pts;
  pushLedger(state, {
    ts: Date.now(), date: date, delta: -pts, kind: kind,
    reason: (reasonPrefix || '撤回：') + (label || ''),
  });
  return pts;
}

function settle(state, target, date) {
  const rec = target.rec;
  const shouldAward = !!rec.done && (!!rec.confirmed || !state.settings.requireConfirm);

  if (shouldAward && !rec.awarded) {
    const pts = target.points;
    rec.awarded = true;
    rec.awardedPoints = pts;
    state.points.balance += pts;
    state.points.earned += pts;
    pushLedger(state, { ts: Date.now(), date: date, delta: pts, kind: target.kind, reason: target.label });
  } else if (!shouldAward && rec.awarded) {
    revokeAward(state, rec, target.kind, date, target.label, '撤回：');
  }
}

function countDone(state, date) {
  const day = getDay(state, date);
  let total = 0, done = 0, waiting = 0;
  day.homeworks.forEach(function (h) {
    total++; if (h.done) done++; if (h.done && !h.confirmed) waiting++;
  });
  state.dailyTasks.forEach(function (t) {
    // 停用的、以及过了截止日期的，这一天都不算数
    if (!taskActive(t, date, state.settings.holidays)) return;
    total++;
    const r = day.tasks[t.id];
    if (r && r.done) done++;
    if (r && r.done && !r.confirmed) waiting++;
  });
  day.extras.forEach(function (h) {
    total++; if (h.done) done++; if (h.done && !h.confirmed) waiting++;
  });
  return { total: total, done: done, waiting: waiting, percent: total ? Math.round(done / total * 100) : 0 };
}

function currentStreak(state) {
  let streak = 0;
  let key = todayKey();
  // 今天还没开始不算断
  if (countDone(state, key).done === 0) key = shiftDate(key, -1);
  for (let i = 0; i < 400; i++) {
    const c = countDone(state, key);
    if (c.total > 0 && c.done === c.total) { streak++; key = shiftDate(key, -1); }
    else break;
  }
  return streak;
}

/* -------------------------------------------------------- 操作(op)的应用 */

const ALLOWED_OPS = {};

function defineOp(name, fn) { ALLOWED_OPS[name] = fn; }

defineOp('settings', function (state, op) {
  const patch = op.patch || {};
  const allowed = ['childName', 'parentPin', 'requireConfirm', 'homeworkPoints', 'welcome',
    'focusEnabled', 'focusMinutes', 'breakMinutes', 'roomName', 'compressImages', 'holidays'];
  allowed.forEach(function (k) { if (k in patch) state.settings[k] = patch[k]; });
  // 节假日清单：只留合法的 'YYYY-MM-DD'，去重、排序、最多 200 条
  {
    const seen = {};
    state.settings.holidays = (Array.isArray(state.settings.holidays) ? state.settings.holidays : [])
      .map(function (d) { return String(d || '').trim(); })
      .filter(function (d) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || seen[d]) return false;
        seen[d] = 1;
        return true;
      })
      .sort()
      .slice(0, 200);
  }
  // 大字/语音是按设备存在 localStorage 的，不跟房间走，
  // 早年的 settings.bigFont / settings.voiceOn 已经没人读，顺手清掉
  delete state.settings.bigFont;
  delete state.settings.voiceOn;
  state.settings.roomName = String(state.settings.roomName || '').trim().slice(0, 24);
  state.settings.childName = String(state.settings.childName || '宝贝').trim().slice(0, 12) || '宝贝';
  state.settings.homeworkPoints = Math.max(0, Math.min(20, Number(state.settings.homeworkPoints) || 0));
  state.settings.focusMinutes = Math.max(5, Math.min(60, Number(state.settings.focusMinutes) || 20));
  state.settings.breakMinutes = Math.max(1, Math.min(30, Number(state.settings.breakMinutes) || 5));
  state.settings.focusEnabled = state.settings.focusEnabled !== false;
});

defineOp('hw.add', function (state, op) {
  const day = ensureDay(state, op.date);
  (op.items || []).forEach(function (it) {
    if (!it || !it.title) return;
    const rec = Object.assign({
      // ★ 用 op 里带的 id（界面先造好），两边才对得上 —— 见 useId 的注释
      id: useId(it.id, 'h'),
      subject: it.subject || '其他',
      title: String(it.title).slice(0, 120),
      detail: String(it.detail || '').slice(0, 500),
      attachments: normalizeAttachments(it.attachments),   // 家长传的要求/资料
    }, emptyRecord());
    const pts = clampPoints(it.points);
    if (pts !== null) rec.points = pts; // 不填就跟着全局设置走
    day.homeworks.splice(hwInsertAt(day.homeworks, rec.subject), 0, rec);
  });
});

/** 科目在预设表里的次序；不在表里（自己填的）排到最后 */
function subjectRank(subject) {
  const i = SUBJECTS.findIndex(function (s) { return s.name === subject; });
  return i < 0 ? SUBJECTS.length : i;
}

/**
 * 新作业插到哪儿：**按科目排**（语文 → 数学 → 英语 → … → 其他），
 * 同一科目的挨着放、追加在本组末尾。
 *
 * 原来只做"同科目挨着"，所以先加的数学会一直排在后面加的语文前面 ——
 * 家长要的是"默认就按语文、数学、英语…这个顺序"。
 * 手动 ↑↓ 过之后仍以手动为准（这里只在新增时决定位置）。
 */
/**
 * 「按科目次序插入」的通用版：作业列表和**常用作业库**都用它（第 83 轮）。
 * 传进来的 list 里每一项都有 `subject`。
 */
function bySubjectInsertAt(list, subject) {
  const r = subjectRank(subject);
  for (let k = 0; k < list.length; k++) {
    if (subjectRank(list[k].subject) > r) return k;   // 插到第一个"科目更靠后"的前面
  }
  return list.length;
}

function hwInsertAt(list, subject) {
  return bySubjectInsertAt(list, subject);
}

defineOp('hw.update', function (state, op) {
  const day = ensureDay(state, op.date);
  const it = day.homeworks.filter(function (x) { return x.id === op.id; })[0];
  if (!it) return;
  const p = op.patch || {};
  const oldSubject = it.subject;
  if ('subject' in p) it.subject = String(p.subject).slice(0, 12);
  // 改了科目就挪到新科目那一组去，不然列表里会出现"语文"夹在数学中间
  if (it.subject !== oldSubject) {
    const k = day.homeworks.indexOf(it);
    if (k >= 0) day.homeworks.splice(k, 1);
    day.homeworks.splice(hwInsertAt(day.homeworks, it.subject), 0, it);
  }
  if ('title' in p) it.title = String(p.title).slice(0, 120);
  if ('detail' in p) it.detail = String(p.detail || '').slice(0, 500);
  if ('attachments' in p) it.attachments = normalizeAttachments(p.attachments);
  if ('points' in p) {
    const pts = clampPoints(p.points);
    const before = pointsOfHomework(state, it);
    if (pts === null) delete it.points;
    else it.points = pts;
    // 已经结算过小红花的，改分值要重新算一次，不然账面就对不上了
    if (it.awarded && pointsOfHomework(state, it) !== before) {
      revokeAward(state, it, 'homework', op.date, it.title, '改分值：');
      settle(state, { rec: it, points: pointsOfHomework(state, it), label: it.title, kind: 'homework' }, op.date);
    }
  }
});

defineOp('hw.remove', function (state, op) {
  const day = ensureDay(state, op.date);
  const it = day.homeworks.filter(function (x) { return x.id === op.id; })[0];
  if (!it) return;
  revokeAward(state, it, 'homework', op.date, it.title, '删除：');   // 删掉也要把星星收回来
  day.homeworks = day.homeworks.filter(function (x) { return x.id !== op.id; });
});

defineOp('extra.add', function (state, op) {
  const day = ensureDay(state, op.date);
  const it = op.item || {};
  if (!it.title) return;
  day.extras.push(Object.assign({
    id: useId(it.id, 'e'),
    emoji: String(it.emoji || '✨').slice(0, 4),
    title: String(it.title).slice(0, 60),
    note: String(it.note || '').slice(0, 500),
    points: clampInt(parseNum(it.points, 1), 0, 20),
    attachments: normalizeAttachments(it.attachments),
  }, emptyRecord()));
});

defineOp('extra.remove', function (state, op) {
  const day = ensureDay(state, op.date);
  const it = day.extras.filter(function (x) { return x.id === op.id; })[0];
  if (!it) return;
  revokeAward(state, it, 'extra', op.date, it.title, '删除：');   // 同上
  day.extras = day.extras.filter(function (x) { return x.id !== op.id; });
});

/* 孩子加的额外任务，家长觉得不合适可以直接改（图标 / 内容 / 分值） */
defineOp('extra.update', function (state, op) {
  const day = ensureDay(state, op.date);
  const it = day.extras.filter(function (x) { return x.id === op.id; })[0];
  if (!it) return;
  const p = op.patch || {};
  if ('emoji' in p) it.emoji = String(p.emoji || '✨').slice(0, 4);
  if ('title' in p) {
    const t = String(p.title).slice(0, 60).trim();
    if (t) it.title = t;          // 不允许改成空标题，不然卡片就没名字了
  }
  if ('note' in p) it.note = String(p.note || '').slice(0, 500);
  if ('points' in p) {
    const n = parseNum(p.points, null);
    if (n !== null) {
      const before = Number(it.points) || 0;
      it.points = clampInt(n, 0, 20);
      // 已经结算过的，改了分值要重算一次，不然账面就对不上（跟 hw.update 一个道理）
      if (it.awarded && it.points !== before) {
        revokeAward(state, it, 'extra', op.date, it.title, '改分值：');
        settle(state, { rec: it, points: it.points, label: it.title, kind: 'extra' }, op.date);
      }
    }
  }
});

defineOp('item.done', function (state, op) {
  const t = findTarget(state, op.date, op.kind, op.id);
  if (!t) return;
  const value = !!op.value;
  t.rec.done = value;
  t.rec.doneAt = value ? Date.now() : null;
  if (!value) { t.rec.confirmed = false; t.rec.confirmedAt = null; }
  /*
   * 每日任务打勾时**拍一张快照**（第 66 轮 6）：把这一刻的图标 / 名字 / 分值 / 标签
   * 存进当天的记录里。
   *
   * 为什么：任务的定义是全局的，家长后来改了名字或分值，
   * 历史那几天的记录会跟着变 —— "历史不该被后来的修改改写"。
   * 有快照就按快照显示，家长再改也只影响以后。
   */
  if (value && op.kind === 'task' && t.item) {
    t.rec.snap = {
      emoji: t.item.emoji, title: t.item.title, tag: t.item.tag,
      points: t.item.points,
    };
  }
  settle(state, t, op.date);
});

/** 撤销的两种理由：任务取消（不用做了）/ 再完善作业（要重做） */
const UNDO_KINDS = [
  { key: 'cancel', label: '任务取消', hint: '孩子不用再做了' },
  { key: 'redo', label: '再完善作业', hint: '孩子需要重新完成' },
];

/**
 * 家长撤销「孩子已经打勾、但还没确认」的那一项，并记下理由。
 *
 * 和 item.done=false 的区别就是多存了两个字段：
 *   undoKind   'cancel'（任务取消）| 'redo'（再完善作业）
 *   undoReason 家长写的具体说明，孩子那边看得到
 * 孩子页面据此决定：cancel 的锁住不能再做，redo 的要重新做。
 */
defineOp('item.undo', function (state, op) {
  const t = findTarget(state, op.date, op.kind, op.id);
  if (!t) return;
  t.rec.done = false;
  t.rec.doneAt = null;
  t.rec.confirmed = false;
  t.rec.confirmedAt = null;
  settle(state, t, op.date);      // 已经发出去的分要撤回
  /*
   * 放在 settle 之后写，免得被它清掉。
   * reasonKind 为空 = 家长两个理由都没选，就是"直接撤回"：
   * 不带"任务取消 / 再完善"的定性，孩子那边只回到没打勾的状态。
   */
  t.rec.undoKind = op.reasonKind === 'cancel' ? 'cancel'
    : op.reasonKind === 'redo' ? 'redo' : '';
  t.rec.undoReason = String(op.reason || '').slice(0, 200).trim();
  t.rec.undoneAt = Date.now();
});

/** 家长反悔了：把撤销取消掉，这一项回到"没打勾、也没备注"的普通状态 */
defineOp('item.restore', function (state, op) {
  const t = findTarget(state, op.date, op.kind, op.id);
  if (!t) return;
  t.rec.undoKind = '';
  t.rec.undoReason = '';
  t.rec.undoneAt = null;
});

/* ---------------------------------------------------- 附件：加一条 / 删一条 */

/**
 * 给"这项作业"或"孩子交的成果"挂一个附件。
 * scope: 'item'（家长传的要求/资料）| 'work'（孩子交上来的）
 * 文件本身已经由 /api/upload 存好了，这里只记录元信息。
 */
defineOp('attach.add', function (state, op) {
  const holder = attachTarget(state, op.date, op.kind, op.id, op.scope);
  if (!holder) return;
  const att = normalizeAttachment(op.file);
  if (!att) return;                       // id 不合法就别记，免得界面上一堆点不开的
  if (op.scope === 'work') {
    holder.works = normalizeAttachments((holder.works || []).concat([att]));
  } else {
    holder.attachments = normalizeAttachments((holder.attachments || []).concat([att]));
  }
});

/** 删掉一个附件记录（服务器上的文件先留着，万一别处还引用着） */
defineOp('attach.remove', function (state, op) {
  const holder = attachTarget(state, op.date, op.kind, op.id, op.scope);
  if (!holder) return;
  const id = String(op.fileId || '');
  if (op.scope === 'work') {
    holder.works = (holder.works || []).filter(function (a) { return a.id !== id; });
  } else {
    holder.attachments = (holder.attachments || []).filter(function (a) { return a.id !== id; });
  }
});

/** 重命名（孩子传上来文件名常常是 IMG_1234.jpg，家长可以改成看得懂的） */
defineOp('attach.rename', function (state, op) {
  const holder = attachTarget(state, op.date, op.kind, op.id, op.scope);
  if (!holder) return;
  const id = String(op.fileId || '');
  const name = String(op.name || '').trim().slice(0, 120);
  if (!name) return;
  const list = op.scope === 'work' ? (holder.works || []) : (holder.attachments || []);
  list.forEach(function (a) { if (a.id === id) a.name = name; });
});

/** 自定义排序：把某一项往上/往下挪一格。
 * 数组本身的顺序就是界面上的顺序，所以"排序"就是交换相邻两项。
 */
defineOp('move', function (state, op) {
  const dir = Number(op.dir) === -1 ? -1 : 1;
  let arr = null;
  if (op.list === 'homework' || op.list === 'extras') {
    const day = ensureDay(state, op.date);
    arr = op.list === 'homework' ? day.homeworks : day.extras;
  } else if (op.list === 'tasks') {
    arr = state.dailyTasks;
  } else if (op.list === 'rewards') {
    arr = state.rewards;
  } else if (op.list === 'common') {
    arr = state.commonHomeworks;
  }
  if (!arr) return;
  let i = -1;
  for (let k = 0; k < arr.length; k++) {
    if (arr[k].id === op.id) { i = k; break; }
  }
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
});

defineOp('item.confirm', function (state, op) {
  const t = findTarget(state, op.date, op.kind, op.id);
  if (!t) return;
  const value = !!op.value;
  t.rec.confirmed = value;
  t.rec.confirmedAt = value ? Date.now() : null;
  if (value) t.rec.done = true;
  settle(state, t, op.date);
});

defineOp('day.note', function (state, op) {
  ensureDay(state, op.date).note = String(op.note || '').slice(0, 300);
});

defineOp('day.mood', function (state, op) {
  ensureDay(state, op.date).mood = String(op.mood || '').slice(0, 4);
});

defineOp('day.copy', function (state, op) {
  if (!isValidDateKey(op.from) || !isValidDateKey(op.to) || op.from === op.to) return;
  const src = getDay(state, op.from);
  const dst = ensureDay(state, op.to);

  /*
   * picks：只复制点名的那些，格式 [{ kind: 'homework' | 'extra', id }]
   * 不传就整份复制（保持以前"一键全复制"的行为）。
   *
   * 注意：每日任务不在复制范围内 —— 它是全局的，每天自动出现，
   * 复制过去没有任何意义（前端那边也把这一类标成"无需复制"）。
   */
  const picks = Array.isArray(op.picks) ? op.picks : null;
  const want = function (kind, id) {
    if (!picks) return true;
    return picks.some(function (p) { return p && p.kind === kind && p.id === id; });
  };
  // 复制过去的是"新的一条"：换 id、状态清空、不能把小红花重复发一遍
  const fresh = function (prefix, it) {
    return Object.assign({}, it, {
      /*
       * id 由「源 id + 目标日期」推出来，**不能随机**：
       * 这个 op 在客户端和服务器上都会跑一遍，各自 random 的话两边就是两条
       * 不同 id 的记录，同步回来一替换，客户端手里的 id 全成了孤儿。
       */
      id: derivedId(prefix, it.id + '@' + op.date), done: false, doneAt: null,
      confirmed: false, confirmedAt: null, awarded: false, awardedPoints: 0,
      works: [],
    });
  };

  /*
   * 复制过来的作业也**按科目次序插**（第 80 轮 1），不能一律 push 到末尾 ——
   * 不然"复制到今天"会把语文排到体育后面，列表看着就乱。
   *
   * op.overwrite 为真时：目标日期**已经有同名同科目**的那条，就**覆盖它的内容**
   * （备注 / 附件 / 分值），不新增一条（第 80 轮 2）。
   * 打勾、确认、已发的小红花都不动 —— 覆盖的只是"内容"。
   */
  src.homeworks.forEach(function (h) {
    if (!want('homework', h.id)) return;
    if (op.overwrite) {
      const hit = dst.homeworks.filter(function (x) {
        return x.subject === h.subject && x.title === h.title;
      })[0];
      if (hit) {
        hit.detail = h.detail;
        hit.attachments = normalizeAttachments(h.attachments);
        if (h.points != null) hit.points = h.points;
        return;
      }
    }
    dst.homeworks.splice(hwInsertAt(dst.homeworks, h.subject), 0, fresh('h', h));
  });
  src.extras.forEach(function (e) { if (want('extra', e.id)) dst.extras.push(fresh('e', e)); });
});

/**
 * 家长给这一天的学习情况写一段评价，可以顺手奖励或扣除小红花。
 *
 * 重复写会先把上一次的加减**撤回**再应用新的 —— 账面永远是"最后那条评价"
 * 的净效果，流水里看得到一笔「改评价：撤回」+ 一笔新的。
 */
defineOp('day.review', function (state, op) {
  const day = ensureDay(state, op.date);
  const prev = day.review;

  if (prev && prev.awarded) {
    const old = Number(prev.awardedPoints) || 0;
    prev.awarded = false;
    prev.awardedPoints = 0;
    state.points.balance -= old;
    if (old >= 0) state.points.earned -= old;
    else state.points.spent -= -old;
    // 上次是 0 分的话不用留一条"撤回 0"的流水，那是噪音
    if (old) {
      pushLedger(state, {
        ts: Date.now(), date: op.date, delta: -old, kind: 'review', reason: '改评价：撤回上一次',
      });
    }
  }

  const text = String(op.text == null ? '' : op.text).slice(0, 300).trim();
  const pts = clampInt(parseNum(op.points, 0), -50, 50);

  // 文字和分值都空 = 把这条评价删掉
  if (!text && !pts) { day.review = null; return; }

  const rec = prev || emptyReview();
  rec.text = text;
  rec.points = pts;
  rec.at = Date.now();
  rec.awarded = false;
  rec.awardedPoints = 0;
  day.review = rec;

  /*
   * 分值可以是 0（只写评语、小红花不加不减）—— 这种情况**也要记一条流水**（第 66 轮 1），
   * 否则家长在「小红花记录」里根本找不到这条评价。
   */
  if (pts) {
    rec.awarded = true;
    rec.awardedPoints = pts;
    state.points.balance += pts;
    if (pts >= 0) state.points.earned += pts;
    else state.points.spent += -pts;
  }
  pushLedger(state, {
    ts: Date.now(), date: op.date, delta: pts, kind: 'review',
    reason: '今日评价：' + (text || (pts > 0 ? '表现不错' : pts < 0 ? '需要加油' : '只留评语')),
  });
});

defineOp('task.add', function (state, op) {
  const it = op.item || {};
  if (!it.title) return;
  const rec = {
    id: useId(it.id, 't'),
    emoji: String(it.emoji || '⭐').slice(0, 4),
    title: String(it.title).slice(0, 60),
    // 标签：位置和样式跟作业的科目一样，列表也靠它排序分组
    tag: String(it.tag || TASK_TAGS[0]).slice(0, 8),
    // 有效期：默认「长期」；可以指定日期 / 周几节假日 / 区间（第 81 轮）
    sched: it.sched ? normalizeSched(it.sched) : schedFromDue(it.due),
    note: String(it.note || '').slice(0, 500),
    // 每日任务也能带附件（和作业完全一样）：说明照片、示范视频、打卡要求…
    attachments: normalizeAttachments(it.attachments),
    points: clampInt(parseNum(it.points, 1), 0, 20),
    active: it.active !== false,
  };
  /*
   * 插到**同一标签那一组的末尾**：这样列表天然是"功课 → 生活 → 精神 → 自定义"，
   * 家长不用每次新增完再手动往上挪。手动 ↑↓ 之后以手动为准。
   */
  state.dailyTasks.splice(taskInsertAt(state.dailyTasks, rec.tag), 0, rec);
});

/** 截止日期只认 YYYY-MM-DD 和哨兵值，别的（空、乱填）一律当长期 */
function normalizeDue(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return TASK_LONG_TERM;
  if (s === TASK_LONG_TERM) return TASK_LONG_TERM;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : TASK_LONG_TERM;
}

/** 新任务插到哪儿：按标签排序（功课 → 生活 → 精神 → 其他自定义） */
function taskInsertAt(list, tag) {
  const allTags = list.map(function (t) { return t.tag; });
  const r = taskTagRank(tag, allTags);
  for (let k = 0; k < list.length; k++) {
    if (taskTagRank(list[k].tag, allTags) > r) return k;
  }
  return list.length;
}

defineOp('task.update', function (state, op) {
  const it = state.dailyTasks.filter(function (x) { return x.id === op.id; })[0];
  if (!it) return;
  const p = op.patch || {};
  const oldTag = it.tag;
  if ('emoji' in p) it.emoji = String(p.emoji).slice(0, 4);
  if ('title' in p) it.title = String(p.title).slice(0, 60);
  if ('tag' in p) it.tag = String(p.tag || TASK_TAGS[0]).slice(0, 8);
  if ('sched' in p) it.sched = normalizeSched(p.sched);
  // 老接口：还传 due 的话按"到那天为止"迁成一个区间有效期
  else if ('due' in p) it.sched = schedFromDue(p.due);
  if ('note' in p) it.note = String(p.note || '').slice(0, 500);
  if ('attachments' in p) it.attachments = normalizeAttachments(p.attachments);
  // 换了标签就挪到新标签那一组去，不然列表里会乱
  if (it.tag !== oldTag) {
    const k = state.dailyTasks.indexOf(it);
    if (k >= 0) state.dailyTasks.splice(k, 1);
    state.dailyTasks.splice(taskInsertAt(state.dailyTasks, it.tag), 0, it);
  }
  // 数字留空就保留原值，不要偷偷换成 0
  if ('points' in p) {
    const n = parseNum(p.points, null);
    if (n !== null) it.points = clampInt(n, 0, 20);
  }
  // 停用/启用只改 active 这一个字段，**不碰任何积分和流水** ——
  // 之前已经拿到的分照旧，历史记录也照旧（这是第 7 条要求）
  if ('active' in p) it.active = !!p.active;
});

/*
 * 第 91 轮：**软删除**。
 *
 * 原来是真的把任务从 dailyTasks 里 filter 掉 —— 结果历史记录成了孤儿：
 * `day.tasks[id]` 那条还在（打勾时间、拿到的红花都在），但家长翻回去看
 * 那天时 `parentItems()` 是遍历 dailyTasks 找的，任务没了就渲染不出来 ✗
 * 家长的要求是「删除任务或改有效期，历史已完成的那天依旧保留展示」。
 *
 * 所以改成只打一个标记：
 *   · `deleted`  + `deletedAt`（从这一天起不再算有效）
 *   · `taskActiveOn()` 遇到「已删除且这天 >= deletedAt」就返回 false
 *     → 今天以后不显示、不计入完成度；**那一天之前照常算**，历史统计不会缩水
 *   · 家长的任务列表过滤掉 deleted，看起来就是"删掉了"
 *   · 数据一条不删，随时能从存档里翻回来
 */
defineOp('task.remove', function (state, op) {
  const it = state.dailyTasks.filter(function (x) { return x.id === op.id; })[0];
  if (!it) return;
  it.deleted = true;
  // 日期由客户端带过来（两边重放要一致，不能各自调 todayKey）
  it.deletedAt = isValidDateKey(op.date) ? op.date : todayKey();
});

/* ---------------------------------------------------- 常用作业库 */

defineOp('common.add', function (state, op) {
  const it = op.item || {};
  if (!it.title) return;
  const rec = {
    id: useId(it.id, 'ch'),
    subject: String(it.subject || '其他').slice(0, 12),
    title: String(it.title).slice(0, 120),
    detail: String(it.detail || '').slice(0, 500),
    attachments: normalizeAttachments(it.attachments),
  };
  /*
   * 常用库也**按科目次序插**（第 83 轮）：语文、数学、英语…其他。
   * 原来是一律 push 到末尾，库里就成了"按录入先后"排的。
   */
  state.commonHomeworks.splice(bySubjectInsertAt(state.commonHomeworks, rec.subject), 0, rec);
});

defineOp('common.update', function (state, op) {
  const it = state.commonHomeworks.filter(function (x) { return x.id === op.id; })[0];
  if (!it) return;
  const p = op.patch || {};
  const oldSubject = it.subject;
  if ('subject' in p) it.subject = String(p.subject || '其他').slice(0, 12);
  if ('title' in p) {
    const t = String(p.title).slice(0, 120).trim();
    if (t) it.title = t;
  }
  if ('detail' in p) it.detail = String(p.detail || '').slice(0, 500);
  // 常用库里也能存附件，以后点「加」的时候一起带到当天
  if ('attachments' in p) it.attachments = normalizeAttachments(p.attachments);
  // 改了科目就挪到新科目那一组去（第 83 轮），不然库里会"语文"夹在数学中间
  if (it.subject !== oldSubject) {
    const k = state.commonHomeworks.indexOf(it);
    if (k >= 0) state.commonHomeworks.splice(k, 1);
    state.commonHomeworks.splice(
      bySubjectInsertAt(state.commonHomeworks, it.subject), 0, it);
  }
});

defineOp('common.remove', function (state, op) {
  state.commonHomeworks = state.commonHomeworks.filter(function (x) { return x.id !== op.id; });
});

defineOp('reward.add', function (state, op) {
  const it = op.item || {};
  if (!it.title) return;
  state.rewards.push({
    id: useId(it.id, 'r'),
    emoji: String(it.emoji || '🎁').slice(0, 4),
    title: String(it.title).slice(0, 40),
    cost: clampInt(parseNum(it.cost, 10), 1, 999),
    active: it.active !== false,
  });
});

defineOp('reward.update', function (state, op) {
  const it = state.rewards.filter(function (x) { return x.id === op.id; })[0];
  if (!it) return;
  const p = op.patch || {};
  if ('emoji' in p) it.emoji = String(p.emoji).slice(0, 4);
  if ('title' in p) it.title = String(p.title).slice(0, 40);
  if ('cost' in p) {
    const n = parseNum(p.cost, null);
    if (n !== null) it.cost = clampInt(n, 1, 999);
  }
  // 同 task.update：停用/启用不动积分和流水
  if ('active' in p) it.active = !!p.active;
});

defineOp('reward.remove', function (state, op) {
  state.rewards = state.rewards.filter(function (x) { return x.id !== op.id; });
});

defineOp('redeem', function (state, op) {
  const rw = state.rewards.filter(function (x) { return x.id === op.id; })[0];
  if (!rw) return { error: '奖励不存在' };
  // 停用的奖励不给兑换（孩子那边的按钮本来就不显示，这里再兜一道）
  if (rw.active === false) return { error: '这个奖励暂时停用了' };
  if (state.points.balance < rw.cost) return { error: '小红花不够啦' };
  state.points.balance -= rw.cost;
  state.points.spent += rw.cost;
  state.redemptions.unshift({
    // 兑换记录也是"新增"，id 一律由发起的界面带过来（见 useId 的注释）
    id: useId(op.rid, 'rd'), rewardId: rw.id, emoji: rw.emoji, title: rw.title,
    cost: rw.cost, ts: Date.now(), status: 'pending',
  });
  pushLedger(state, { ts: Date.now(), date: todayKey(), delta: -rw.cost, kind: 'redeem', reason: '兑换：' + rw.title });
});

/* 兑换的四种状态：待处理 / 已兑现 / 已驳回 / 主动取消。后两种要退回小红花 */
const REDEEM_REFUNDED = ['rejected', 'cancelled'];
const REDEEM_STATUS = ['pending', 'done', 'rejected', 'cancelled'];

defineOp('redeem.status', function (state, op) {
  const rd = state.redemptions.filter(function (x) { return x.id === op.id; })[0];
  if (!rd) return;
  const status = String(op.status || '');
  if (REDEEM_STATUS.indexOf(status) < 0) return;

  const wasRefunded = REDEEM_REFUNDED.indexOf(rd.status) >= 0;
  const willRefund = REDEEM_REFUNDED.indexOf(status) >= 0;

  if (willRefund && !wasRefunded) {
    state.points.balance += rd.cost;
    state.points.spent -= rd.cost;
    pushLedger(state, {
      ts: Date.now(), date: todayKey(), delta: rd.cost, kind: 'redeem',
      reason: (status === 'rejected' ? '驳回兑换：' : '取消兑换：') + rd.title,
    });
  } else if (!willRefund && wasRefunded) {
    // 驳回之后家长又改主意要兑现，得重新扣一次
    state.points.balance -= rd.cost;
    state.points.spent += rd.cost;
    pushLedger(state, {
      ts: Date.now(), date: todayKey(), delta: -rd.cost, kind: 'redeem',
      reason: '重新兑现：' + rd.title,
    });
  }

  rd.status = status;
  rd.reason = status === 'rejected' ? String(op.reason || '').slice(0, 100) : '';
  rd.resolvedAt = status === 'pending' ? null : Date.now();
});

defineOp('reset', function (state, op) {
  if (op.scope === 'points') {
    state.points = { balance: 0, earned: 0, spent: 0 };
    state.ledger = [];
    state.redemptions = [];
    Object.keys(state.days).forEach(function (k) {
      const d = state.days[k];
      d.homeworks.concat(d.extras).forEach(function (it) {
        it.awarded = false; it.awardedPoints = 0;
      });
      Object.keys(d.tasks).forEach(function (id) { d.tasks[id].awarded = false; d.tasks[id].awardedPoints = 0; });
      // 今日评价的加减也得中性化，不然下次改评价时会按老分值去撤回，账就乱了
      if (d.review) { d.review.awarded = false; d.review.awardedPoints = 0; }
    });
  }
  if (op.scope === 'day' && isValidDateKey(op.date)) {
    const d = getDay(state, op.date);
    d.homeworks.concat(d.extras).forEach(function (it) {
      if (it.awarded) {
        state.points.balance -= Number(it.awardedPoints) || 0;
        state.points.earned -= Number(it.awardedPoints) || 0;
      }
    });
    if (d.review && d.review.awarded) {
      const pts = Number(d.review.awardedPoints) || 0;
      state.points.balance -= pts;
      if (pts >= 0) state.points.earned -= pts; else state.points.spent -= -pts;
    }
    state.days[op.date] = emptyDay();
  }
  if (op.scope === 'all') {
    const fresh = defaultState();
    fresh.settings = state.settings;
    Object.keys(state).forEach(function (k) { delete state[k]; });
    Object.assign(state, fresh);
    state.rev = (op.rev0 || 0);
  }
});

function applyOp(state, op) {
  if (!op || !op.t) return state;
  const fn = ALLOWED_OPS[op.t];
  if (!fn) return state;
  if (op.date !== undefined && !isValidDateKey(op.date)) return state;
  fn(state, op);
  state.rev = (Number(state.rev) || 0) + 1;
  state.updatedAt = Date.now();
  return state;
}

function applyOps(state, ops) {
  (ops || []).slice(0, 200).forEach(function (op) { applyOp(state, op); });
  return state;
}

/** 这个操作名认不认识 */
function isKnownOp(t) {
  return Boolean(t) && Boolean(ALLOWED_OPS[t]);
}

/**
 * 挑出服务端认不出来的操作名。
 *
 * 为什么要有这个：applyOp 对不认识的 op 是**静默跳过**的（为了向后兼容，
 * 老客户端发来新版才有的字段不能把整个请求弄挂）。
 * 但"静默跳过"碰上**前后端版本不一致**就非常坑 —— 页面在服务器上跑的是旧
 * core.js，客户端发来 common.add / common.remove，服务器一声不响地收下、
 * 什么都不做、还回 200 和新状态；客户端以为成功了，下一次同步又把本地的
 * 改动盖回去。表现就是"点了没反应""删了又回来"，而且完全没有报错。
 *
 * 所以：真正要写之前先查一遍，有不认识的就明确报错。
 */
function unknownOps(ops) {
  const out = [];
  (ops || []).slice(0, 200).forEach(function (op) {
    const t = op && op.t;
    if (isKnownOp(t)) return;
    // 连名字都没有的（null / {}）也拦下来，但别报成 "null / undefined" 这种看不懂的话
    const name = t ? String(t) : '(缺少操作名)';
    if (out.indexOf(name) < 0) out.push(name);
  });
  return out;
}

/* -------------------------------------------------------------- 二维码/无 */

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/**
 * 把用户输入的房间码收拾干净：去空格、转大写、只留字母数字。
 * 「我的小家」这种输入会被清成空串，界面上应该提示重填。
 */
function normalizeRoomCode(v) {
  return String(v == null ? '' : v).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * 房间码规则：
 *   * 系统生成的仍是 6 位（去掉了容易看错的 I O 0 1）
 *   * 自己定的放宽到 3～20 位字母数字
 * 只允许 [A-Z0-9] 同时也是文件名的安全边界（没有 / . 之类）
 */
function isValidRoom(code) {
  return /^[A-Z0-9]{3,20}$/.test(String(code == null ? '' : code).toUpperCase());
}

/** 房间的显示名：自己起过就用自己起的，否则跟着孩子名字走 → 「XX的作业小站」 */
function roomNameOf(state) {
  const s = (state && state.settings) || {};
  const name = String(s.roomName || '').trim();
  if (name) return name;
  const child = String(s.childName || '').trim();
  return child ? child + '的作业小站' : '作业小站';
}

/** 自定义房间码够不够安全：太短或者纯数字容易被猜到 */
function roomCodeHint(code) {
  const c = normalizeRoomCode(code);
  if (!c) return { ok: false, msg: '房间码只能填字母和数字' };
  if (c.length < 3) return { ok: false, msg: '至少 3 位' };
  if (c.length > 20) return { ok: false, msg: '最多 20 位' };
  if (/^\d+$/.test(c)) return { ok: true, warn: '纯数字比较容易被猜到，建议混几个字母' };
  if (c.length < 6 && !/\d/.test(c)) return { ok: true, warn: '短又好念的码容易被别人试出来' };
  return { ok: true, warn: '' };
}

/**
 * 房间列表里每一项要露出来的字段。
 * server.js 和 worker/handler.js 共用这一份 —— 以前两边各写一遍，
 * 改一处忘另一处就会出现"本地能看、云端看不到某个字段"。
 */
function roomBrief(code, state) {
  const st = state || {};
  const settings = st.settings || {};
  const points = st.points || {};
  return {
    code: String(code).toUpperCase(),
    name: roomNameOf(st),
    childName: settings.childName || '',
    balance: Number(points.balance) || 0,
    createdAt: st.createdAt || 0,
    updatedAt: st.updatedAt || 0,
  };
}

/** 从请求里取房间管理口令：?key= 或 x-hb-key 头 */
function roomKeyFrom(req, url) {
  let fromQuery = '';
  try { fromQuery = url && url.searchParams ? String(url.searchParams.get('key') || '') : ''; } catch (e) { fromQuery = ''; }
  const fromHeader = (req && req.headers && req.headers['x-hb-key']) || '';
  return String(fromQuery || fromHeader || '');
}

/** 前端文件里，哪些扩展名算"要被版本号盯住"的 */
const ASSET_EXT = ['.html', '.js', '.mjs', '.css'];

/** 这个文件名算不算前端资源 */
function isAssetName(name) {
  const n = String(name || '').toLowerCase();
  return ASSET_EXT.some(function (e) { return n.endsWith(e); });
}

/**
 * 把一组 [文件名, 文件内容] 揉成一个短指纹。
 *
 * 为什么是**内容**指纹而不是文件大小 + 修改时间：
 * 内容指纹在"你本机"和"服务器上"是**一样**的，所以可以直接对一下就知道
 * 服务器上跑的是不是最新代码 —— 大小/时间在两边永远对不上，比不了。
 *
 * 用 FNV-1a（纯 JS，不用 crypto），因为 core.js 要同时在浏览器和 Node 里跑。
 * 这里只当版本号用，不做安全用途。
 */
function assetHash(pairs) {
  let h = 0x811c9dc5;
  const list = (pairs || []).slice().sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  for (const pair of list) {
    const s = String(pair[0]) + '\u0000' + String(pair[1]);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
  }
  return ('0000000' + h.toString(16)).slice(-8);
}


/*
 * 作业小站 · Cloudflare Worker 的接口层
 *
 * 这个文件被两种部署方式共用：
 *   1) wrangler deploy  —— worker.js 里 import 它，静态文件交给 [assets]
 *   2) 单文件粘贴版      —— scripts/build-worker.mjs 把 core.js 内联进来，
 *                          静态文件以字符串形式一起打进一个 worker.js
 * 所以它不直接 import core.js，而是由调用方把 core 传进来。
 */

function makeWorker(core, serveStatic, appVersion) {
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
const __VERSION = "2026-10-22T15:12:52.881Z";

export default makeWorker(__core, __serveStatic, __VERSION);
