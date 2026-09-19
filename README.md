# 老实输入法 键盘布局与配色陈列

展示社区自制的 老实输入法 键盘布局与配色主题。每个作品提供截图预览，并支持下发布局 / 主题 JSON 文件。

页面为**纯静态站点**，零依赖、零后端：所有内容都是仓库里的普通文件，`git clone` 下来就是完整站点。

---

## 目录结构

```
.
├─ index.html               单页入口
├─ assets/
│  ├─ app.js                分类筛选 / 图片轮播 / 灯箱 / 下载
│  ├─ styles.css
│  └─ favicon.svg
├─ data/
│  ├─ index.json            构建产物（前端唯一数据源，勿手改）
│  └─ <id>/                 一个作品一个目录
│     ├─ meta.json          元信息
│     ├─ cover.webp         键盘截图（可选，建议提供）
│     ├─ shot-2.webp        更多截图（可选）
│     └─ *.json             布局 / 主题文件（原样存放，原样下载）
└─ scripts/
   ├─ build.mjs             汇总 meta.json → index.json
   ├─ add.mjs               收录新作品
   └─ dev.mjs               本地预览服务器
```

---

## 本地预览

```bash
npm run build     # 生成 data/index.json
npm run dev       # 打开 http://localhost:5173
```

> 必须通过 HTTP 访问。直接双击 `index.html` 会被浏览器的 `file://` 跨域策略拦截，导致 `index.json` 读取失败。

---

## 收录一个作品

一条命令完成：建目录、拷图、生成元信息草稿。

```bash
npm run add -- --id nautilus-60 \
  --title "深海蓝 26 键" \
  --category 26键 \
  --author 张三 \
  --tags 竖屏,灵犀 \
  --images ~/shots/1.png,~/shots/2.png \
  --files ~/out/qwerty.json

npm run build
git add . && git commit -m "add: 深海蓝 26 键" && git push
```

完整参数说明：

```bash
node scripts/add.mjs --help
```

**也可以完全手工操作**，只需三步：

1. 新建目录 `data/<id>/`，把布局 / 主题 JSON 和截图放进去；
2. 照抄一份现有 `meta.json` 并改成你的内容；
3. `npm run build` 后提交。

### 截图

把图片丢进作品目录就行，**脚本会自动扫描目录里的所有图片**，不需要手工维护文件列表：

- 叫 `cover.*` 的那张作为封面，没有就取排在最前的一张；
- 其余的自动成为附带截图（点击卡片时可在弹窗里翻看）；
- 卡片默认显示第一张，**鼠标悬停时自动轮播**切换；
- **点击卡片任意位置弹出大图预览**（多图可左右翻页、Esc 关闭），不会跳转到其他页面；
- 每张卡片上直接带下载按钮，点击即可下载对应 JSON；
- 一张图都没有时，卡片显示按 id 生成的渐变占位块，站点不会出错。

建议宽度 1200~1600px、单张 400 KB 以内。安装 `sharp` 后 `add.mjs` 会自动转 webp 并压缩（可选）：

```bash
npm i -D sharp
```

### 网盘等外部链接

大文件（含背景图、字体、音效的整合包）可用网盘分发，提取码会直接显示在按钮上：

```bash
npm run add -- --id my-pack --title "整合包" --category 主题 \
  --files ~/out/haiyan.json \
  --netdisk https://pan.baidu.com/s/xxxx \
  --netdiskLabel "网盘打包（含背景图）" \
  --code abcd
```

---

## meta.json 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识，需与目录名一致 |
| `title` | 是 | 展示标题 |
| `author` | 否 | 作者，默认「匿名」 |
| `date` | 否 | 日期，格式 `YYYY-MM-DD`，用于排序 |
| `category` | 是 | 一级分类，见下表 |
| `tags` | 否 | 标签数组，展示在卡片上 |
| `cover` | 否 | 封面文件名。留空会自动选择（优先 `cover.*`） |
| `shots` | 否 | 仅用于调整附图顺序。留空即自动收录目录内全部图片 |
| `files` | 否 | 下载项数组 |
| `note` | 否 | 一句话说明 |

`files` 每一项：

| 字段 | 说明 |
|---|---|
| `label` | 按钮文字 |
| `url` | 相对文件名（同目录）→ 直接下载；`http(s)://` 开头 → 新窗口打开 |
| `code` | 提取码，仅外部链接需要，会显示在按钮右侧 |

文件体积由 `build.mjs` 自动读取并展示，无需手填。

---

## 分类

| 分类 | 收录内容 |
|---|---|
| `26键` | QWERTY 全键盘 |
| `17键` | 17 键拼音布局 |
| `14键` | 14 键拼音布局 |
| `9键` | 9 键拼音布局，含 T9 拼音条 |
| `数字` | 数字键盘，含横屏版 |
| `编辑器` | 文本编辑工具栏 |
| `计算器` | 函数计算器键盘 |
| `主题` | 纯配色主题文件 |

只有**收录了作品**的分类才会出现在页面筛选栏中。预设了分类但暂时没有作品时（如当前的 `17键`、`14键`），该分类不会显示，也不会报错。

如果用了 `CATEGORY_ORDER` 之外的分类，**不会报错也不会丢失**：构建时会自动追加到筛选项末尾，保证任何分类都能被筛选出来。若希望它固定排在靠前的位置，在 `scripts/build.mjs` 与 `scripts/add.mjs` 的 `CATEGORY_ORDER` 中补上即可。

---

## 安装到输入法

下载后的文件按类型放入对应目录：

| 类型 | 路径 |
|---|---|
| 布局 | `Android/data/com.vyv.qlinput/files/layouts/` |
| 主题 | `Android/data/com.vyv.qlinput/files/themes/` |

也可以使用 老实输入法 应用内的数据导入功能直接选择文件。

---

## 部署

推送到 `main` 分支后由 GitHub Actions 自动构建并发布。

仓库首次使用时需要手动开启一次：

**Settings → Pages → Source 选择 `GitHub Actions`**

---

## 版权

所有作品版权归原作者所有。布局与主题 JSON 由作者自愿提交，原样分发，仅供导入 老实输入法 使用。
