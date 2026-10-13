# lulu's blog

为 lulu 制作的个人博客。紫色主调搭配青柠绿与珊瑚橙，以电路、实验和笔记为视觉元素。使用 Astro 生成静态网页，文章与项目通过 Markdown 文件维护。

> 日常怎么写内容、怎么发布、出问题怎么排查，见操作手册：`D:\ai_coding\博客操作手册.md`（放在项目上一级目录，不在仓库里）。

## 本地打开

需要 Node.js 22.12.0 或更新版本，推荐 Node.js 24。

在项目目录打开终端：

```powershell
cd D:\ai_coding\lulu-blog
npm install
npm run dev
```

浏览器访问终端输出的本地地址，默认是 `http://127.0.0.1:4321/`。修改 Markdown 后，本地预览会自动更新。

```powershell
npm run check
npm run build
npm run preview
```

`check` 检查类型与 Astro 文件，`build` 输出静态网站到 `dist`，`preview` 查看构建后的版本。

## 目前包含

- 首页、实验记录、学习记录、项目展示、关于我与 404 页面。
- Zynq 实验记录：从点灯入门、继电器控制，到边沿捕获、脉宽测量、PWM 输出，再到模拟量的采集与输出，形成一条按 `order` 排序的学习路径；每页含接线表、关键 Verilog 代码、内联 SVG 时序图与踩坑记录。
- Markdown 文章与项目详情、自动目录、代码高亮。
- 学习记录分类筛选，分类会同步到地址栏。
- 本地全文条目搜索：匹配标题、简介与标签。支持 Ctrl / Command + K，也支持按 `/` 打开。
- 浅色 / 深色模式，自动识别系统偏好并保存手动选择。
- 移动端导航与响应式布局。
- RSS、sitemap、页面元信息与站点图标。
- GitHub Pages 自动构建与部署配置，兼容项目子路径。

搜索不匹配文章正文。页面以中文为主，没有额外的英文翻译版本。

## 新增一篇笔记

1. 把 `templates/note.md` 复制到 `src/content/notes/`，例如 `my-first-note.md`。文件名建议使用小写英文和连字符。
2. 修改文件顶部的标题、简介、日期、分类和标签。
3. 在下方写 Markdown 正文。
4. 准备发布时，把 `draft: true` 改成 `draft: false`。
5. 上传到 GitHub；自动部署完成后，文章会出现在网站上。

文件名（不含 `.md`）决定文章地址。发布后尽量不要修改文件名，以免原来的链接失效。

```yaml
---
title: "我的第一篇硬件学习笔记"
description: "记录一次学习过程，以及当前的理解。"
date: 2026-10-13
category: "硬件基础"
tags: ["电路", "学习记录"]
sample: false
draft: false
---
```

顶部信息叫 frontmatter。它必须放在两行 `---` 之间。日期填写实际写作日期。`draft: true` 的文件不会生成公开页面，也不会进入搜索、RSS 或 sitemap。

## 新增一个项目

把 `templates/project.md` 复制到 `src/content/projects/`。与笔记的写法相同，另外支持：

- `status`：`计划中` / `进行中` / `已完成`。
- `accent`：`purple` / `lime` / `orange`，控制卡片配色。
- `diagram`：`board` / `wave` / `circuit`，控制卡片插画。
- `repository`：可选，真实项目代码链接。
- `demo`：可选，真实演示链接。

代码链接和演示链接不要填占位地址；没有时省略这两项。

## 新增一个实验

把 `templates/experiment.md` 复制到 `src/content/experiments/`。与笔记的写法相同，另外支持：

- `order`：学习路径序号，决定列表排序和卡片上的 `STEP 0x`，接着现有最大值往下排。
- `stage`：`前置` / `基础` / `进阶`，实验列表页按它分组。
- `status`：`计划中` / `进行中` / `已完成`。
- `board`：硬件平台，例如 `"Zynq-7035 核心板 + 自制 AD/DA 底板"`。
- `tools`：用到的工具与仪器，例如 `["Vivado 2020.2", "示波器"]`。
- `accent`：`purple` / `lime` / `orange`，控制详情页顶部插画配色。
- `diagram`：`wave` / `board` / `circuit`，控制详情页顶部插画。

正文推荐结构：这个实验要解决什么 → 硬件连接（接线表）→ 原理与关键代码 → 仿真验证 → 上板步骤 → 踩过的坑 → 下一步。

示意图优先用内联 SVG，颜色写 `currentColor`（深色模式下才看得见）。暂时没有截图的位置用占位块：

```html
<div class="shot-placeholder"><strong>截图待补</strong>：这里需要一张 XXX 截图（写清来源）</div>
```

拿到截图后放进 `src/content/experiments/images/`，再用相对路径引用：`![说明](./images/文件名.png)`。注意**图片必须先存在再引用**，引用了不存在的图片会让构建直接失败（`[ImageNotFound]`）。

## 添加图片

推荐将图片放在文章所在文件夹，并使用相对地址。Astro 会处理 Markdown 中引用的本地图片，并适配部署的路径。

```text
src/content/notes/
  my-first-note.md
  images/
    circuit.png
```

在 `my-first-note.md` 中写：

```markdown
![原理图说明](./images/circuit.png)
```

无需上传 `node_modules` 或 `dist`。

## 处理当前示例

现在有 3 篇示例笔记、2 个示例项目，均带有 `sample: true`。它们只用于预览版式，网站不会把它们计入正式成果，也不会把它们加入 RSS 和 sitemap，详情页设置为不索引。

正式使用前，可以删除这些示例 `.md` 文件，或者把它们设置为 `draft: true`。没有内容时，网站会显示空状态；不需要为保持页面完整而编造文章或项目。

上传真实内容时，使用 `sample: false`。真实内容会优先于示例显示。

## 修改个人资料和外观

- 网站名称、作者、简介：`src/lib/site.ts`。
- 首页文案与插画：`src/pages/index.astro`。
- 个人介绍：`src/pages/about/index.astro`。
- 实验列表页导语、分组说明与学习路径：`src/pages/experiments/index.astro`。
- 实验详情页信息栏（平台/状态/工具）：`src/components/ExperimentMeta.astro`。
- 实验卡片：`src/components/ExperimentCard.astro`；实验相关样式在 `src/styles/global.css` 末尾「实验记录」一段。
- 配色、字体与布局：`src/styles/global.css`。
- 站点图标：`public/favicon.svg`。
- 社交分享图：`public/social-card.svg`。SVG 分享图的预览支持取决于目标平台；如需稳定的社交卡片预览，可换成 PNG 并更新 Layout。
- 导航、页脚与页面元信息：`src/layouts/Layout.astro`。

目前没有公开邮箱和个人 GitHub 链接，因为尚未提供具体信息。

## 免费部署到 GitHub Pages

项目已准备好 `.github/workflows/deploy.yml`。完成下面的账号设置后即可部署：

1. 在自己的 GitHub 账号下创建一个公开仓库，例如 `lulu-blog`。
2. 将本项目文件上传到该仓库的 `main` 或 `master` 分支。保留 `.github` 文件夹和 `package-lock.json`；不要上传 `node_modules`、`.astro` 和 `dist`。
3. 打开仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
4. 在 **Actions** 页面运行 `Deploy lulu's blog`，或者再次推送一次修改。
5. 部署成功后，在 Pages 页面查看公开网址。

默认项目仓库的网址类似 `https://你的用户名.github.io/lulu-blog/`。如果仓库名为 `你的用户名.github.io`，网站发布在根路径。

构建配置会读取 GitHub Actions 提供的仓库名称，自动设置网址与子路径，不需要在代码里填写 GitHub 用户名。

目前只准备了部署文件，尚未连接账号或向 GitHub 发布。

### 自定义域名（以后可选）

如果以后绑定域名，在仓库 **Settings → Secrets and variables → Actions → Variables** 添加：

```text
SITE_URL = https://你的域名
BASE_PATH = /
```

同时在 GitHub Pages 的 Custom domain 中设置域名，并按 GitHub 的说明配置 DNS。重新运行部署后，canonical、RSS 和 sitemap 会使用新网址。

### 本地模拟项目仓库路径

```powershell
$env:GITHUB_REPOSITORY = 'example/lulu-blog'
npm run build
npm run preview
```

此时预览地址带 `/lulu-blog/` 路径。测试结束后：

```powershell
Remove-Item Env:GITHUB_REPOSITORY
```

## 维护费用

这套方案不需要独立服务器或数据库。使用公开仓库和 GitHub Pages 默认域名可以免费开始。主要读者包含中国大陆时，建议正式上线后实测访问速度，再决定是否增加其他部署渠道。