/*
 * 算一下「前端文件的版本指纹」，跟服务器上 /api/version 的输出对一下，
 * 就知道服务器上跑的是不是最新代码。
 *
 *   node scripts/version.mjs                    # 用本机 public/ 算
 *   node scripts/version.mjs /opt/homework-board # 用别的目录算（比如服务器上那份）
 *   BASE=https://homework.jhui.wang node scripts/version.mjs --online   # 直接问服务器
 *
 * 指纹只跟**文件内容**有关，不掺文件时间，所以两边可以直接比。
 * 对不上就说明：那份代码不是你手上这份 —— 某个文件没传上去，或者传的是旧的。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetHash, isAssetName } from '../public/core.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readPublic(dir) {
  const names = fs.readdirSync(dir).filter(isAssetName).sort();
  const pairs = names.map(function (n) { return [n, fs.readFileSync(path.join(dir, n), 'utf8')]; });
  return { names: names, hash: assetHash(pairs) };
}

function report(label, dir) {
  if (!fs.existsSync(dir)) {
    console.log('  ✗ ' + label + '：目录不存在（' + dir + '）');
    return null;
  }
  const r = readPublic(dir);
  console.log('  ' + label);
  console.log('    目录：' + dir);
  console.log('    指纹：' + r.hash);
  console.log('    文件：' + r.names.join(', '));
  return r;
}

if (process.argv.indexOf('--online') >= 0) {
  const BASE = String(process.env.BASE || 'http://localhost:5199').replace(/\/+$/, '');
  console.log('');
  console.log('本机（' + path.join(ROOT, 'public') + '）');
  const local = report('本机 public/', path.join(ROOT, 'public'));
  console.log('');
  try {
    const res = await fetch(BASE + '/api/version');
    const j = await res.json();
    console.log('  服务器 ' + BASE);
    console.log('    指纹：' + j.v);
    console.log('    文件：' + ((j.files || []).join(', ') || '（老版本没有 files 字段）'));
    console.log('');
    if (!local) {
      console.log('  本机目录读不到，没法比。');
    } else if (j.v === local.hash) {
      console.log('  ✅ 两边指纹一致 —— 服务器上跑的就是你手上这份代码。');
    } else {
      console.log('  ❌ 指纹不一样 —— 服务器上的前端文件不是你手上这份。');
      console.log('     缺的文件：' + (local.names.filter(function (n) { return (j.files || []).indexOf(n) < 0; }).join(', ') || '（文件都在，但内容不一样）'));
      console.log('     把整个 public/ 重新传一遍（包括新加的文件），再重启服务。');
    }
  } catch (e) {
    console.log('  ✗ 连不上 ' + BASE + '：' + e.message);
  }
  console.log('');
} else {
  const dir = process.argv[2] ? path.resolve(process.argv[2], 'public') : path.join(ROOT, 'public');
  console.log('');
  report('前端文件指纹', dir);
  console.log('');
  console.log('  拿这个指纹跟服务器上 https://你的域名/api/version 里的 v 对一下：');
  console.log('    一样 → 服务器上跑的就是这份代码');
  console.log('    不一样 → 有文件没传上去，或者传的是旧的');
  console.log('');
  console.log('  也可以直接： BASE=https://你的域名 node scripts/version.mjs --online');
  console.log('');
}
