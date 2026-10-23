/*
 * 作业小站 · Cloudflare Worker 入口（wrangler 部署方式）
 *
 *   npx wrangler deploy
 *
 * 静态文件（index.html / style.css / app.js / core.js）由 wrangler.toml 里的
 * [assets] 直接提供，这个 worker 只负责 /api/*。
 */

import * as core from './public/core.js';
import { makeWorker } from './worker/handler.js';

// 第三个参数是前端文件版本；wrangler 每次部署都会换新文件，
// 这里不传（null）就不做"该刷新了"的提示。
export default makeWorker(core, null, null);
