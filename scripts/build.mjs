#!/usr/bin/env node
/**
 * 扫描 data/<id>/meta.json，汇总为 data/index.json（前端唯一数据源）。
 *
 * 只做汇总与轻量校验，不解析作品本身的布局 / 主题 JSON —— 那些文件一律
 * 原样存放、原样下载，网页不读取其内容。
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const OUT_FILE = join(DATA_DIR, 'index.json');

/** 一级分类的展示顺序，未列出的分类会被归到末尾并告警 */
const CATEGORY_ORDER = ['26键', '17键', '14键', '9键', '数字', '编辑器', '计算器', '主题'];

const warnings = [];
/** 还没有任何截图的作品，最后统一提示，避免刷屏 */
const noCover = [];

function warn(msg) {
  warnings.push(msg);
  console.warn(`  ! ${msg}`);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 把 data 目录下的相对文件名转成前端可直接使用的 URL */
function toUrl(id, file) {
  return `data/${encodeURIComponent(id)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * 从图片文件头读出宽高，用于判断作品属于竖屏还是宽屏。
 * 只解析 JPEG / PNG 头部（覆盖绝大多数截图），读不出来返回 null，
 * 这样即便遇到不支持的格式也只是退化成「竖屏」而不会报错。
 */
function imageSize(file) {
  const buf = readFileSync(file);

  // PNG：固定 8 字节签名，IHDR 里的宽高位于偏移 16 / 20
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG：逐段扫描，找到 SOF 段（FFC0~FFCF，排除 DHT/DAC 等非图像段）
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }

  return null;
}

function readMeta(id) {
  const file = join(DATA_DIR, id, 'meta.json');
  let meta;
  try {
    meta = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    warn(`${id}/meta.json 解析失败，已跳过：${err.message}`);
    return null;
  }

  if (!meta.title) {
    warn(`${id}/meta.json 缺少 title 字段，已跳过`);
    return null;
  }
  if (!CATEGORY_ORDER.includes(meta.category)) {
    warn(`${id} 的分类 "${meta.category}" 不在预设列表中，请在 CATEGORY_ORDER 里补充`);
  }

  const IMAGE_RE = /\.(webp|png|jpe?g|gif|avif)$/i;
  const found = readdirSync(join(DATA_DIR, id)).filter((f) => IMAGE_RE.test(f));

  // 自动收录目录里的全部图片：只要把图丢进目录就生效，不存在漏图的可能。
  // meta.shots 仅用于调整先后顺序（列在前面的优先），不限制收录范围。
  const ordered = meta.shots?.length
    ? [...meta.shots.filter((f) => found.includes(f)), ...found.filter((f) => !meta.shots.includes(f))]
    : [...found].sort((a, b) => a.localeCompare(b, 'en'));

  // 封面优先级：meta.cover > cover.* > 第一张
  let cover = meta.cover ?? null;
  if (cover && !existsSync(join(DATA_DIR, id, cover))) {
    warn(`${id} 声明的封面 ${cover} 不存在，改为自动选择`);
    cover = null;
  }
  if (!cover) cover = ordered.find((f) => /^cover\./i.test(f)) ?? ordered[0] ?? null;

  const images = [cover, ...ordered.filter((f) => f !== cover)].filter(Boolean);
  if (!images.length) noCover.push(id);

  // 屏幕方向：以封面图的宽高比判断，明显宽扁（> 2.5:1）的算宽屏，其余算竖屏
  let orientation = 'portrait';
  if (cover) {
    const size = imageSize(join(DATA_DIR, id, cover));
    if (size && size.height > 0 && size.width / size.height > 2.5) orientation = 'wide';
  }

  // 下载项：自动补齐真实文件体积
  const files = (meta.files ?? []).map((f) => {
    const entry = { label: f.label ?? '下载', url: f.url ?? '' };
    if (f.code) entry.code = f.code;
    const local = toLocalPath(id, f.url);
    if (local) {
      entry.url = toUrl(id, f.url);
      entry.size = formatSize(statSync(local).size);
      entry.external = false;
    } else {
      entry.external = true;
      if (!/^https?:\/\//i.test(f.url ?? '')) warn(`${id} 的下载项 "${f.label}" 既不是本地文件也不是 http(s) 链接`);
    }
    return entry;
  });

  return {
    id,
    title: meta.title,
    author: meta.author ?? '匿名',
    date: meta.date ?? '',
    category: meta.category ?? '未分类',
    tags: meta.tags ?? [],
    cover: cover ? toUrl(id, cover) : null,
    /** 卡片轮播与弹窗图集共用的顺序，封面在最前 */
    images: images.map((f) => toUrl(id, f)),
    /** 'wide' = 封面是超宽横图，'portrait' = 其余 */
    orientation,
    files,
    note: meta.note ?? '',
  };
}

/** 相对路径 → 磁盘绝对路径；外部链接返回 null */
function toLocalPath(id, url) {
  if (!url || /^https?:\/\//i.test(url) || url.startsWith('//')) return null;
  const abs = join(DATA_DIR, id, url);
  return existsSync(abs) ? abs : null;
}

function main() {
  console.log('扫描 data/ ...\n');

  const ids = readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const items = ids.map(readMeta).filter(Boolean);

  const rank = (c) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };

  items.sort((a, b) => {
    if (rank(a.category) !== rank(b.category)) return rank(a.category) - rank(b.category);
    if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
    return a.title.localeCompare(b.title, 'zh-Hans-CN');
  });

  const used = [...new Set(items.map((i) => i.category))];
  // 预设顺序优先；未在预设中的分类追加到末尾，保证任何分类都能被筛选出来
  const ordered = [
    ...CATEGORY_ORDER.filter((c) => used.includes(c)),
    ...used.filter((c) => !CATEGORY_ORDER.includes(c)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
  ];
  const categories = ordered.map((c) => ({
    name: c,
    count: items.filter((i) => i.category === c).length,
  }));

  const index = {
    generatedAt: new Date().toISOString(),
    categories,
    tags: [...new Set(items.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    count: items.length,
    items,
  };

  // 内容实质未变时不重写文件，避免 generatedAt 每次都制造无意义 diff
  let prev = null;
  try {
    prev = JSON.parse(readFileSync(OUT_FILE, 'utf8'));
  } catch {
    // 首次生成或旧文件损坏，正常写入即可
  }
  const unchanged =
    prev && JSON.stringify({ ...prev, generatedAt: null }) === JSON.stringify({ ...index, generatedAt: null });

  console.log();
  if (unchanged) {
    console.log('data/index.json 内容无变化，跳过写入');
  } else {
    writeFileSync(OUT_FILE, JSON.stringify(index, null, 2) + '\n', 'utf8');
    console.log('data/index.json 已更新');
  }
  console.log(`  作品 ${index.count} 条，分类 ${categories.length} 个，标签 ${index.tags.length} 个`);
  for (const c of categories) console.log(`    · ${c.name} (${c.count})`);

  if (noCover.length) {
    console.log(`\n${noCover.length} 个作品还没有截图，卡片会显示占位块。`);
    console.log('把图片命名为 cover.webp 放入对应目录即可；放多张会按文件名顺序自动轮播。');
    console.log(`  ${noCover.join('、')}`);
  }
  if (warnings.length) console.log(`\n共 ${warnings.length} 条提示，建议逐条处理。`);
}

main();
