/* ============================================================
   老实输入法 键盘布局与配色 — 前端
   零依赖。只读取 data/index.json，不解析任何作品 JSON 内容。
   ============================================================ */

const INDEX_URL = 'data/index.json';
const IMPORT_PATHS = {
  layout: 'Android/data/com.vyv.qlinput/files/layouts/',
  theme: 'Android/data/com.vyv.qlinput/files/themes/',
};

const ICONS = {
  download: '<svg viewBox="0 0 20 20"><path d="M10 3.5v8.5"/><path d="m6.6 8.6 3.4 3.4 3.4-3.4"/><path d="M4 16h12"/></svg>',
  external: '<svg viewBox="0 0 20 20"><path d="M11 4h5v5"/><path d="M16 4 8.6 11.4"/><path d="M14 12v3.4A1.6 1.6 0 0 1 12.4 17H4.6A1.6 1.6 0 0 1 3 15.4V7.6A1.6 1.6 0 0 1 4.6 6H8"/></svg>',
  keyboard: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="13" width="38" height="22" rx="5"/><path d="M12.5 21h3M20 21h3M27.5 21h3M35 21h1.5M12.5 28h13M29.5 28h6"/></svg>',
  down: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9v8"/><path d="m3.5 5.5 3.5-3 3.5 3"/><path d="M17 11V3"/><path d="m13.5 6.5 3.5 3 3.5-3"/></svg>',
};

let INDEX = null;

/** 记住最近一次首页的筛选参数，供详情页「返回列表」还原筛选条件 */
let lastHomeQuery = '';

const appEl = document.getElementById('app');
const lightboxEl = document.getElementById('lightbox');

/* ---------------- 工具函数 ---------------- */

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 由字符串派生一个稳定的色相，用于无截图时的占位底色 */
function hueOf(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

/* ---------------- 路由 ---------------- */

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const qi = raw.indexOf('?');
  const path = qi === -1 ? raw : raw.slice(0, qi);
  return { path: path || '/', params: new URLSearchParams(qi === -1 ? '' : raw.slice(qi + 1)) };
}

function setParams(patch, { replace = false } = {}) {
  const { path, params } = parseHash();
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '' || v === 'all') params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  const next = `#${path}${qs ? `?${qs}` : ''}`;
  if (next === location.hash) return;
  if (replace) location.replace(next);
  else location.hash = next;
}

/* ---------------- 首页 ---------------- */

function filterItems(params) {
  const cat = params.get('cat') ?? 'all';
  const orient = params.get('orient') ?? '';
  return INDEX.items.filter(
    (i) => (cat === 'all' || i.category === cat) && (!orient || i.orientation === orient)
  );
}

/** 卡片上的下载入口：只显示一个图标，文件名与提取码放在悬停提示里 */
function downloadBtn(file) {
  const isExternal = file.external;
  const attrs = isExternal
    ? `href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer" data-ext="1"`
    : `href="${escapeHtml(file.url)}" download`;
  const tip = file.code ? `${file.label}（提取码 ${file.code}）` : file.label;

  return `<a class="card-dl" ${attrs} title="${escapeHtml(tip)}" aria-label="下载 ${escapeHtml(tip)}"
    >${isExternal ? ICONS.external : ICONS.download}</a>`;
}

function cardHtml(item) {
  const hue = hueOf(item.id);
  const images = item.images ?? [];

  // 多张图全部渲染并叠放，默认只显示第一张，鼠标悬停时由轮播逻辑切换
  const imgs = images
    .map(
      (src, i) =>
        `<img class="thumb-img" src="${escapeHtml(src)}" alt="${escapeHtml(item.title)} 截图 ${i + 1}" ${i > 0 ? 'loading="lazy"' : ''} decoding="async">`
    )
    .join('');

  // 占位块始终垫在底层：有截图时被图片盖住，无截图或图片加载失败时自然露出
  return `
    <div class="card${images.length ? ' is-clickable' : ''}">
      <div class="thumb${images.length ? ' has-shots' : ''}" style="--h:${hue}" data-id="${escapeHtml(item.id)}">
        <div class="thumb-placeholder">${ICONS.keyboard}<span>暂无截图</span></div>
        ${imgs}
        <span class="badge">${escapeHtml(item.category)}</span>
      </div>
      <div class="card-body">
        <div class="card-head">
          <div class="card-title">${escapeHtml(item.title)}</div>
          ${item.tags.length ? `<div class="card-tags">${item.tags.slice(0, 3).map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="card-foot">
          <div class="card-meta">
            <span class="author">${escapeHtml(item.author)}</span>
            <span class="dot-sep">${escapeHtml(item.date)}</span>
          </div>
          ${item.files.length ? `<div class="card-downloads">${item.files.map(downloadBtn).join('')}</div>` : ''}
        </div>
      </div>
    </div>`;
}

function renderHome(params) {
  lastHomeQuery = params.toString();
  const cat = params.get('cat') ?? 'all';
  const orient = params.get('orient') ?? '';
  const items = filterItems(params);

  // 两组筛选的计数互相联动：分类计数跟随方向筛选，方向计数跟随分类筛选
  const byOrientation = orient ? INDEX.items.filter((i) => i.orientation === orient) : INDEX.items;
  const byCategory = cat === 'all' ? INDEX.items : INDEX.items.filter((i) => i.category === cat);
  const catCount = (name) =>
    name === 'all' ? byOrientation.length : byOrientation.filter((i) => i.category === name).length;
  const orientCount = (o) => byCategory.filter((i) => i.orientation === o).length;

  const chips = [
    { name: 'all', label: '全部', count: byOrientation.length },
    ...INDEX.categories.map((c) => ({ name: c.name, label: c.name, count: catCount(c.name) })),
  ];
  const orientations = [
    { name: 'portrait', label: '竖屏', count: orientCount('portrait') },
    { name: 'wide', label: '宽屏', count: orientCount('wide') },
  ];

  appEl.innerHTML = `
    <div class="filters" role="group" aria-label="按分类与屏幕方向筛选">
      <div class="seg" role="group" aria-label="按屏幕方向筛选">
        ${orientations.map((o) => `<button class="seg-btn" type="button" data-orient="${o.name}" aria-pressed="${o.name === orient}">
            ${escapeHtml(o.label)}<span class="n">${o.count}</span>
          </button>`).join('')}
      </div>

      <span class="chip-divider" aria-hidden="true"></span>

      ${chips.map((c) => {
        const isActive = c.name === cat;
        return `<button class="chip" type="button" data-cat="${escapeHtml(c.name)}" aria-pressed="${isActive}">
          ${escapeHtml(c.label)}<span class="n">${c.count}</span>
        </button>`;
      }).join('')}

      <span class="filter-sep"></span>
      <span class="filter-count" role="status">${items.length} 个作品</span>
    </div>

    ${items.length
      ? `<div class="grid">${items.map(cardHtml).join('')}</div>`
      : `<div class="empty"><strong>没有匹配的作品</strong><p>换个分类或方向试试。</p></div>`}
  `;

  appEl.querySelectorAll('.chip[data-cat]').forEach((btn) => {
    btn.addEventListener('click', () => setParams({ cat: btn.dataset.cat }));
  });

  appEl.querySelectorAll('.seg-btn[data-orient]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const o = btn.dataset.orient;
      setParams({ orient: o === orient ? '' : o });
    });
  });
}

/* ---------------- 详情页 ---------------- */

function fileHtml(file, isPrimary) {
  const kind = isPrimary ? 'primary' : 'normal';
  const isExternal = file.external;
  const icon = isExternal ? ICONS.external : ICONS.download;
  const sub = isExternal ? '外部链接' : file.size ?? '';
  const attrs = isExternal
    ? `href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer"`
    : `href="${escapeHtml(file.url)}" download`;

  return `
    <a class="dl" data-kind="${kind}" ${attrs}>
      <span class="dl-icon">${icon}</span>
      <span class="dl-text">
        <span class="dl-label">${escapeHtml(file.label)}</span>
        <span class="dl-sub">${escapeHtml(sub)}</span>
      </span>
      ${file.code ? `<span class="dl-code">${escapeHtml(file.code)}</span>` : ''}
    </a>`;
}

function renderDetail(id) {
  // 带着首页的筛选条件返回，避免用户筛完进详情再回来时丢失筛选结果
  const backHref = lastHomeQuery ? `#/?${lastHomeQuery}` : '#/';
  const item = INDEX.items.find((i) => i.id === id);
  if (!item) {
    appEl.innerHTML = `<div class="detail-head"><a class="back-link" href="${backHref}">返回</a></div>
      <div class="empty"><strong>找不到该作品</strong><p>它可能已被移除或链接有误。</p></div>`;
    return;
  }

  const hue = hueOf(item.id);
  const images = item.images ?? [];
  const isTheme = item.category === '主题';
  const targetPath = isTheme ? IMPORT_PATHS.theme : IMPORT_PATHS.layout;

  const gallery = images.length
    ? images.map((src, i) => `
        <div class="shot" data-index="${i}" style="--h:${hue}">
          <img class="shot-img" src="${escapeHtml(src)}" alt="${escapeHtml(item.title)} 截图 ${i + 1}" ${i > 0 ? 'loading="lazy"' : ''} decoding="async">
        </div>`).join('')
    : `<div class="shot"><div class="shot-placeholder" style="--h:${hue}">${ICONS.keyboard}<p>暂无截图</p></div></div>`;

  const related = INDEX.items.filter((i) => i.category === item.category && i.id !== item.id).slice(0, 4);

  appEl.innerHTML = `
    <div class="detail-head">
      <a class="back-link" href="${backHref}">
        <svg viewBox="0 0 20 20"><path d="M12 5 7 10l5 5"/></svg>
        返回列表
      </a>
    </div>

    <div class="detail">
      <div class="gallery">${gallery}</div>

      <div class="side">
        <h1>${escapeHtml(item.title)}</h1>

        <div class="side-meta">
          <span class="pill accent">${escapeHtml(item.category)}</span>
          <span>${escapeHtml(item.author)}</span>
          <span>${escapeHtml(item.date)}</span>
          ${item.tags.map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join('')}
        </div>

        ${item.note ? `<p class="note">${escapeHtml(item.note)}</p>` : ''}

        <div class="panel">
          <h2>下载</h2>
          ${item.files.length
            ? `<div class="downloads">${item.files.map((f, i) => fileHtml(f, i === 0 && !f.external)).join('')}</div>`
            : `<p class="no-file">这个作品暂未提供下载文件。</p>`}
        </div>

        <div class="panel">
          <h2>安装到输入法</h2>
          <div class="paths">
            <div class="path-item">
              <span class="path-label">${isTheme ? '主题文件放入' : '布局文件放入'}</span>
              <span class="path-code">${escapeHtml(targetPath)}<button class="copy-btn" type="button" data-copy="${escapeHtml(targetPath)}">复制</button></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    ${related.length ? `
    <section class="related">
      <h2>同类作品</h2>
      <div class="grid">${related.map(cardHtml).join('')}</div>
    </section>` : ''}
  `;

  appEl.querySelectorAll('.shot').forEach((el) => {
    if (!images.length) return;
    el.addEventListener('click', () => openLightbox(images, Number(el.dataset.index), item.title));
  });

  appEl.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await copyText(btn.dataset.copy);
      btn.textContent = ok ? '已复制' : '复制失败';
      btn.classList.toggle('done', ok);
      setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('done'); }, 1600);
    });
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/* ---------------- 灯箱 ---------------- */

let lb = { images: [], index: 0 };

function openLightbox(images, index, title) {
  // 弹窗打开后卡片轮播已无意义，停掉省资源
  stopSlideshow();
  lb = { images, index };
  const img = lightboxEl.querySelector('.lb-image');
  const counter = lightboxEl.querySelector('.lb-counter');
  const multi = images.length > 1;

  lightboxEl.hidden = false;
  document.body.style.overflow = 'hidden';
  img.src = images[index];
  img.alt = `${title} 截图 ${index + 1}`;
  counter.textContent = multi ? `${index + 1} / ${images.length}` : '';
  lightboxEl.querySelector('.lb-prev').hidden = !multi;
  lightboxEl.querySelector('.lb-next').hidden = !multi;
}

function stepLightbox(delta) {
  if (lb.images.length < 2) return;
  lb.index = (lb.index + delta + lb.images.length) % lb.images.length;
  const img = lightboxEl.querySelector('.lb-image');
  img.src = lb.images[lb.index];
  lightboxEl.querySelector('.lb-counter').textContent = `${lb.index + 1} / ${lb.images.length}`;
}

function closeLightbox() {
  lightboxEl.hidden = true;
  // 用 removeAttribute 而非 src=''：空字符串会被解析成当前文档地址并发起一次无谓请求
  lightboxEl.querySelector('.lb-image').removeAttribute('src');
  document.body.style.overflow = '';
}

lightboxEl.addEventListener('click', (e) => {
  if (e.target === lightboxEl || e.target.closest('.lb-close')) closeLightbox();
  else if (e.target.closest('.lb-prev')) stepLightbox(-1);
  else if (e.target.closest('.lb-next')) stepLightbox(1);
});

window.addEventListener('keydown', (e) => {
  if (lightboxEl.hidden) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') stepLightbox(-1);
  else if (e.key === 'ArrowRight') stepLightbox(1);
});

/* ---------------- 卡片交互：悬停轮播 + 点击看大图 ---------------- */

/** 鼠标悬停时，依次切换卡片内的多张截图 */
let slideTimer = null;
let slideCard = null;

function stopSlideshow() {
  if (slideTimer) clearInterval(slideTimer);
  slideTimer = null;
  if (slideCard) {
    slideCard.classList.remove('is-playing');
    slideCard.querySelectorAll('.thumb-img').forEach((el, i) => el.classList.toggle('is-active', i === 0));
    slideCard = null;
  }
}

function startSlideshow(thumb) {
  const imgs = thumb.querySelectorAll('.thumb-img');
  if (imgs.length < 2) return;

  stopSlideshow();
  slideCard = thumb;
  thumb.classList.add('is-playing');

  let i = 0;
  imgs[0].classList.add('is-active');
  slideTimer = setInterval(() => {
    imgs[i].classList.remove('is-active');
    i = (i + 1) % imgs.length;
    imgs[i].classList.add('is-active');
  }, 1100);
}

appEl.addEventListener('mouseover', (e) => {
  const thumb = e.target.closest('.thumb');
  if (!thumb || thumb === slideCard) return;
  startSlideshow(thumb);
});

appEl.addEventListener('mouseout', (e) => {
  const thumb = e.target.closest('.thumb');
  if (!thumb) return;
  // 在卡片内部移动不算离开
  if (e.relatedTarget && thumb.contains(e.relatedTarget)) return;
  stopSlideshow();
});

/** 点击整张卡片（含图片）打开大图预览；卡片上的下载按钮不触发弹窗 */
appEl.addEventListener('click', (e) => {
  if (e.target.closest('.card-dl')) return;

  const card = e.target.closest('.card');
  const thumb = card?.querySelector('.thumb[data-id]');
  if (!thumb) return;

  const item = INDEX.items.find((i) => i.id === thumb.dataset.id);
  const images = item?.images ?? [];
  if (!images.length) return;

  e.preventDefault();
  openLightbox(images, 0, item.title);
});

/* ---------------- 图片比例自适应 ---------------- */

/** 超宽图片（如横屏键盘截图）按原始比例展示，否则会被裁掉大半 */
appEl.addEventListener('load', (evt) => {
  const el = evt.target;
  if (!(el instanceof HTMLImageElement) || !el.classList.contains('thumb-img')) return;
  const thumb = el.closest('.thumb');
  thumb?.classList.add('has-image'); // 图片就位后收起底层占位块

  const ratio = el.naturalWidth / el.naturalHeight;
  if (ratio > 2 || ratio < 0.8) thumb?.classList.add('is-wide');
}, true);

/* ---------------- 图片加载失败兜底 ---------------- */

/**
 * error 事件不冒泡，只能在捕获阶段拦截。
 * 卡片图失败 → 隐藏图片，露出底层的占位块；
 * 详情图失败 → 直接替换成占位块。
 */
appEl.addEventListener('error', (evt) => {
  const el = evt.target;
  if (!(el instanceof HTMLImageElement)) return;

  if (el.classList.contains('thumb-img')) {
    el.classList.add('is-broken');
  } else if (el.classList.contains('shot-img')) {
    const ph = document.createElement('div');
    ph.className = 'shot-placeholder';
    ph.innerHTML = `${ICONS.keyboard}<p>截图加载失败</p>`;
    el.replaceWith(ph);
  }
}, true);

/* ---------------- 启动 ---------------- */

/** 记录当前视图，用于区分"切换页面"与"原地筛选"，只在切换时回到顶部 */
let lastScrollKey = null;

function render() {
  const { path, params } = parseHash();
  const m = path.match(/^\/item\/(.+)$/);

  if (m) {
    renderDetail(decodeURIComponent(m[1]));
  } else {
    renderHome(params);
  }

  const scrollKey = m ? `item:${decodeURIComponent(m[1])}` : 'home';
  if (scrollKey !== lastScrollKey) {
    window.scrollTo(0, 0);
    lastScrollKey = scrollKey;
  }
}

async function boot() {
  appEl.innerHTML = `<div class="empty">正在加载…</div>`;
  try {
    const res = await fetch(INDEX_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    INDEX = await res.json();
  } catch (err) {
    appEl.innerHTML = `<div class="empty">
      <strong>数据加载失败</strong>
      <p>无法读取 <code>data/index.json</code>（${escapeHtml(err.message)}）。<br>
      请先运行 <code>npm run build</code> 生成索引，并通过 <code>npm run dev</code> 以 HTTP 方式访问（直接双击打开 HTML 会被浏览器拦截）。</p>
    </div>`;
    return;
  }

  if (!INDEX.count) {
    appEl.innerHTML = `<div class="empty"><strong>还没有作品</strong><p>运行 <code>npm run add</code> 收录第一个条目。</p></div>`;
    return;
  }

  window.addEventListener('hashchange', render);
  render();
}

boot();
