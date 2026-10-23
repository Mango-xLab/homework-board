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
export const UPLOAD_EXTS = {
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
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_EXTS).join(',');

/** 取扩展名（小写，带点）；没有就返回 '' */
export function extOf(name) {
  const m = /(\.[A-Za-z0-9]{1,8})$/.exec(String(name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

/**
 * 看看这个文件能不能收。返回 { ok, ext, mime, kind, reason }。
 * 文件名里没有扩展名时，用浏览器给的 MIME 反推一个。
 */
export function checkUpload(name, mime) {
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
export function makeUploadId(ext) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s + ext;
}

/** id 必须是我们自己生成的那种，绝不能让它带路径（防目录穿越） */
export function isUploadId(id) {
  return /^[a-z0-9]{16}\.[a-z0-9]{1,8}$/.test(String(id || ''));
}

/** 附件在浏览器里的地址 */
export function fileURL(room, id) {
  return '/api/file/' + encodeURIComponent(room) + '/' + encodeURIComponent(id);
}

/** 2.4 MB → "2.4 MB"；给附件列表显示大小用 */
export function humanSize(n) {
  const b = Number(n) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';
  return (b / 1024 / 1024).toFixed(b < 1024 * 1024 * 10 ? 1 : 0) + ' MB';
}

/** 附件在列表里的图标 */
export function fileIcon(kind) {
  return kind === 'image' ? '🖼' : kind === 'video' ? '🎬'
    : kind === 'audio' ? '🎵' : kind === 'text' ? '📄' : '📎';
}

/* ------------------------------------------------------------------ 常量 */

export const SUBJECTS = [
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

export const MOODS = [
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
export const TASK_TAGS = ['功课', '生活', '精神'];

/**
 * 没有截止日期的任务用这个哨兵值 —— 界面上显示成「长期」
 * （第 81 轮起改用 sched 有效期模型，这个常量只为迁移老数据保留）
 */
export const TASK_LONG_TERM = '9999-99-99';

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

export const SCHED_MODES = ['always', 'dates', 'weekdays'];

/** 周几的名字，下标就是 Date.getDay()（0 = 周日） */
export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 「法定节假日」在 days 里的标记（具体哪天是节假日由 settings.holidays 决定） */
export const HOLIDAY_KEY = 'holiday';

/** 空的有效期（= 长期） */
export function emptySched() {
  return { mode: 'always', from: '', to: '', days: [], dates: [] };
}

const isDateKey = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); };

/** 把任何东西规整成一个合法的 sched（容错，不抛） */
export function normalizeSched(v) {
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
export function schedFromDue(due) {
  const d = String(due || '');
  if (!d || d === TASK_LONG_TERM || !isDateKey(d)) return emptySched();
  return normalizeSched({ mode: 'weekdays', days: [], from: '', to: d });
}

/** 这个任务的有效期（老存档只有 due 的话顺手迁移一次） */
export function taskSched(task) {
  if (!task) return emptySched();
  if (task.sched) return normalizeSched(task.sched);
  return schedFromDue(task.due);
}

/** 这一天是不是节假日（家长在设置里维护的清单） */
export function isHoliday(dateKey, holidays) {
  return Array.isArray(holidays) && holidays.indexOf(dateKey) >= 0;
}

/**
 * 这一天在不在有效期内（**只看有效期本身**，不看手动「停用」）。
 * holidays = settings.holidays（'YYYY-MM-DD' 的数组）
 */
export function schedMatches(sched, dateKey, holidays) {
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
export function taskActiveOn(task, dateKey, holidays) {
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
export function taskActive(task, dateKey, holidays) {
  return taskActiveOn(task, dateKey, holidays);
}

/** 这个任务是不是「长期」的（不用标有效期） */
export function schedAlways(task) {
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
export function schedLabel(task, todayKey) {
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
export function dueAfter(a, b) { return String(a || '') > String(b || ''); }

/** 这个任务在这一天之前就结束了吗（只用于老接口的兼容判断） */
export function taskExpired(task, dateKey) {
  const s = taskSched(task);
  if (s.mode === 'always') return false;
  if (s.to) return dueAfter(dateKey, s.to);
  if (s.mode === 'dates') {
    return s.dates.length > 0 && s.dates.every(function (d) { return dueAfter(dateKey, d); });
  }
  return false;
}

/** 老接口：标签栏里的那枚牌子（现在直接走 schedLabel） */
export function taskDueLabel(task, dateKey) {
  return schedLabel(task, dateKey);
}
export function taskDueBadge(task, dateKey) {
  return schedLabel(task, dateKey);
}

/** 任务标签在列表里的排序：功课 → 生活 → 精神 → 其他自定义（按首次出现的顺序） */
export function taskTagRank(tag, allTags) {
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
export function taskTagMeta(tag) {
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
export function taskView(task, rec, dateKey) {
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
export function tagFromLegacyTitle(title) {
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
export function defaultHolidays() {
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
export function newId(prefix) { return uid(prefix); }

/** id 的合法形状：`<前缀>_<一串小写字母数字>`，不认别的（防止有人往里塞奇怪东西） */
export function isSafeId(id) {
  return typeof id === 'string' && /^[a-z]{1,4}_[a-z0-9]{4,24}$/.test(id);
}

/**
 * 由一段文本推出一个**稳定**的 id —— 同一个种子在浏览器和服务器上算出来必须一样。
 *
 * 用在「复制到今天」这类由服务器和客户端各自 applyOp 的地方：
 * 如果两边各自 random 一个 id，客户端乐观更新出来的那条和服务器的就对不上，
 * 同步回来一替换，客户端手里的 id 就成了孤儿。
 */
export function derivedId(prefix, seed) {
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

export function pad2(n) { return n < 10 ? '0' + n : '' + n; }

/**
 * 本地时区的 YYYY-MM-DD。
 * 导出是因为界面上也要判断"某个时间戳属于哪一天"（第 92 轮：
 * 已兑现的兑换只显示当天的，就得把 resolvedAt 换算成日期来比）。
 */
export function dateKey(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
}

export function todayKey() { return dateKey(new Date()); }

export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function shiftDate(key, days) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function isValidDateKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key || ''));
}

/** 返回以 date 所在周（周一为第一天）为基准的 7 个日期 */
export function weekKeys(key) {
  const d = parseDateKey(key);
  const dow = (d.getDay() + 6) % 7; // 周一 = 0
  const start = shiftDate(key, -dow);
  const out = [];
  for (let i = 0; i < 7; i++) out.push(shiftDate(start, i));
  return out;
}

const WEEK_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
export function weekdayCN(key) { return WEEK_CN[parseDateKey(key).getDay()]; }

export function friendlyDate(key) {
  const d = parseDateKey(key);
  const t = todayKey();
  if (key === t) return '今天';
  if (key === shiftDate(t, -1)) return '昨天';
  if (key === shiftDate(t, 1)) return '明天';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

export function subjectMeta(name) {
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
export function emptyReview() {
  return { text: '', points: 0, at: 0, awarded: false, awardedPoints: 0 };
}

export function emptyRecord() {
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
export function normalizeAttachment(a) {
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
export function normalizeAttachments(arr) {
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
export function attachTarget(state, date, kind, id, scope) {
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

export function defaultState() {
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
export function normalizeState(raw) {
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

export function getDay(state, date) {
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
export function parseHomeworkText(text) {
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

export function countDone(state, date) {
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

export function currentStreak(state) {
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
export const UNDO_KINDS = [
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
export function normalizeDue(v) {
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

export function applyOp(state, op) {
  if (!op || !op.t) return state;
  const fn = ALLOWED_OPS[op.t];
  if (!fn) return state;
  if (op.date !== undefined && !isValidDateKey(op.date)) return state;
  fn(state, op);
  state.rev = (Number(state.rev) || 0) + 1;
  state.updatedAt = Date.now();
  return state;
}

export function applyOps(state, ops) {
  (ops || []).slice(0, 200).forEach(function (op) { applyOp(state, op); });
  return state;
}

/** 这个操作名认不认识 */
export function isKnownOp(t) {
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
export function unknownOps(ops) {
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

export function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/**
 * 把用户输入的房间码收拾干净：去空格、转大写、只留字母数字。
 * 「我的小家」这种输入会被清成空串，界面上应该提示重填。
 */
export function normalizeRoomCode(v) {
  return String(v == null ? '' : v).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * 房间码规则：
 *   * 系统生成的仍是 6 位（去掉了容易看错的 I O 0 1）
 *   * 自己定的放宽到 3～20 位字母数字
 * 只允许 [A-Z0-9] 同时也是文件名的安全边界（没有 / . 之类）
 */
export function isValidRoom(code) {
  return /^[A-Z0-9]{3,20}$/.test(String(code == null ? '' : code).toUpperCase());
}

/** 房间的显示名：自己起过就用自己起的，否则跟着孩子名字走 → 「XX的作业小站」 */
export function roomNameOf(state) {
  const s = (state && state.settings) || {};
  const name = String(s.roomName || '').trim();
  if (name) return name;
  const child = String(s.childName || '').trim();
  return child ? child + '的作业小站' : '作业小站';
}

/** 自定义房间码够不够安全：太短或者纯数字容易被猜到 */
export function roomCodeHint(code) {
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
export function roomBrief(code, state) {
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
export function roomKeyFrom(req, url) {
  let fromQuery = '';
  try { fromQuery = url && url.searchParams ? String(url.searchParams.get('key') || '') : ''; } catch (e) { fromQuery = ''; }
  const fromHeader = (req && req.headers && req.headers['x-hb-key']) || '';
  return String(fromQuery || fromHeader || '');
}

/** 前端文件里，哪些扩展名算"要被版本号盯住"的 */
export const ASSET_EXT = ['.html', '.js', '.mjs', '.css'];

/** 这个文件名算不算前端资源 */
export function isAssetName(name) {
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
export function assetHash(pairs) {
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
