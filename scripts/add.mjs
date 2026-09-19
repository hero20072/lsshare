#!/usr/bin/env node
/**
 * 收录一个新作品。
 *
 * 用法：
 *   node scripts/add.mjs --id nautilus-60 --title "深海蓝 26 键" --category 26键 \
 *     --author 张三 --tags 竖屏,灵犀 --images 截图1.png,截图2.png --files qwerty.json,haiyan.json
 *
 * 做三件事：建目录、拷图（可选转 webp）、生成 meta.json 草稿。
 * 不修改、不解析被收录的 JSON 文件本身。
 */
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const CATEGORY_ORDER = ['26键', '17键', '14键', '9键', '数字', '编辑器', '计算器', '主题'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    args[key] = next && !next.startsWith('--') ? (i++, next) : true;
  }
  return args;
}

/** 惰性加载 sharp；没装就退化为原样拷贝 */
async function loadSharp() {
  try {
    const mod = await import('sharp');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function fail(msg) {
  console.error(`\n错误：${msg}\n`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.id) {
    console.log(readFileSync(join(ROOT, 'scripts', 'add.usage.txt'), 'utf8'));
    process.exit(args.id ? 0 : 1);
  }

  const id = String(args.id).trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) fail('--id 只能包含字母、数字、下划线、连字符');

  const title = args.title ? String(args.title) : id;
  const category = args.category ? String(args.category) : CATEGORY_ORDER[0];
  if (args.category && !CATEGORY_ORDER.includes(category)) {
    console.warn(`  提示：分类 "${category}" 不在预设列表 ${CATEGORY_ORDER.join(' / ')} 中`);
  }

  const dir = join(DATA_DIR, id);
  if (existsSync(dir)) {
    console.log(`目录已存在，将追加内容：data/${id}/`);
  }
  mkdirSync(dir, { recursive: true });

  const sharp = await loadSharp();
  const splitList = (v) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

  // --- 图片：第一张作封面，其余作截图 ---
  const images = splitList(args.images);
  const shots = [];
  let cover = null;

  for (let i = 0; i < images.length; i++) {
    const src = resolve(images[i]);
    if (!existsSync(src)) {
      console.warn(`  跳过不存在的图片：${images[i]}`);
      continue;
    }
    const isCover = i === 0;
    const targetBase = isCover ? 'cover' : `shot-${i + 1}`;

    if (sharp) {
      const out = `${targetBase}.webp`;
      await sharp(src).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(join(dir, out));
      const kb = (statSync(join(dir, out)).size / 1024).toFixed(0);
      console.log(`  ${isCover ? '封面' : '截图'} → ${out} (${kb} KB)`);
      if (kb > 400) console.warn(`    ! ${out} 超过 400 KB，建议先裁剪或降质`);
      if (isCover) cover = out;
      else shots.push(out);
    } else {
      const ext = extname(src).toLowerCase();
      const out = `${targetBase}${ext}`;
      copyFileSync(src, join(dir, out));
      const kb = (statSync(join(dir, out)).size / 1024).toFixed(0);
      console.log(`  ${isCover ? '封面' : '截图'} → ${out} (${kb} KB，未转 webp)`);
      if (isCover) cover = out;
      else shots.push(out);
    }
  }
  if (images.length && !sharp) {
    console.log('\n  提示：未安装 sharp，图片仅原样拷贝。安装后可用 webp 自动压缩：npm i -D sharp');
  }

  // --- JSON 等附件原样拷贝 ---
  const files = [];
  for (const p of splitList(args.files)) {
    const src = resolve(p);
    if (!existsSync(src)) {
      console.warn(`  跳过不存在的附件：${p}`);
      continue;
    }
    const name = basename(src);
    copyFileSync(src, join(dir, name));
    console.log(`  附件 → ${name} (${(statSync(join(dir, name)).size / 1024).toFixed(1)} KB)`);
    files.push({ label: args.fileLabel ? String(args.fileLabel) : name, url: name });
  }

  // --- 网盘等外链 ---
  if (args.netdisk) {
    const entry = { label: args.netdiskLabel ? String(args.netdiskLabel) : '网盘下载', url: String(args.netdisk) };
    if (args.code) entry.code = String(args.code);
    files.push(entry);
    console.log(`  外链 → ${entry.url}`);
  }

  // --- 生成 meta.json（已存在则保留，避免覆盖人工编辑） ---
  const metaPath = join(dir, 'meta.json');
  if (existsSync(metaPath)) {
    console.log('\n  meta.json 已存在，保持不变。请手动补充 files / tags 等字段。');
  } else {
    const meta = {
      id,
      title,
      author: args.author ? String(args.author) : '匿名',
      date: new Date().toISOString().slice(0, 10),
      category,
      tags: splitList(args.tags),
      cover,
      shots,
      files,
      note: args.note ? String(args.note) : '',
    };
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
    console.log(`\n  已生成 data/${id}/meta.json`);
  }

  console.log(`\n下一步：\n  1) 检查并按需编辑 data/${id}/meta.json\n  2) npm run build\n  3) git add . && git commit -m "add: ${title}" && git push\n`);
}

main().catch((err) => fail(err.message));
