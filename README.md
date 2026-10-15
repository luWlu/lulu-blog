# lulu's blog

为 lulu 制作的个人博客。紫色主调搭配青柠绿与珊瑚橙，以电路、实验和笔记为视觉元素。使用 Astro 生成静态网页，文章与项目通过 Markdown 文件维护。

> 写作、发布和排查流程见本文；本地私人操作手册放在项目上一级目录，不属于公开仓库。

## 本地打开

需要 Node.js 22.12.0 或更新版本，推荐 Node.js 24。

在项目目录打开终端：

```powershell
git clone https://github.com/luWlu/lulu-blog.git
cd lulu-blog
npm ci
npm run dev
```

浏览器访问终端输出的本地地址，默认是 `http://127.0.0.1:4321/`。修改 Markdown 后，本地预览会自动更新。

```powershell
npm run check
npm test
npm run build
npm run verify:build
npm run preview
```

`check` 检查类型与 Astro 文件，`test` 检查 Markdown 统计、编辑注释过滤及部署路径，`build` 输出静态网站到 `dist`，`verify:build` 检查产物中的路径、锚点、元信息和收录范围，`preview` 查看构建后的版本。

## 目前包含

- 首页、实验记录、学习记录、项目展示、关于我与 404 页面。
- Zynq 实验记录：从点灯入门、继电器控制，到边沿捕获、脉宽测量、PWM 输出，再到模拟量的采集与输出，形成一条按 `order` 排序的学习路径；每页含接线表、关键 Verilog 代码、内联 SVG 时序图与踩坑记录。
- Markdown 文章与项目详情、双主题代码高亮、代码一键复制（复制失败时会提示手动选择）。
- 文章页桌面目录随滚动高亮，手机和平板提供可折叠目录，并显示文章阅读进度。
- 学习记录分类筛选，分类会同步到地址栏。
- 本地条目搜索：匹配标题、简介与标签；支持 Ctrl / Command + K、`/` 打开，`↑` / `↓` 选择，`Enter` 跳转，`Esc` 关闭。按钮提示随平台显示 Ctrl 或 ⌘。
- 浅色 / 深色模式，自动识别系统偏好并保存手动选择；代码块背景和语法高亮跟随主题。
- 移动端导航与响应式布局。
- RSS、sitemap、PNG 社交分享图、文章级 Open Graph / BlogPosting 元信息与站点图标。
- 一篇正式的 [Verilog 基础手记](src/content/notes/verilog-basics.md)，由个人 HDLBits 笔记整理；五篇版式示例保留为草稿。
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

顶部信息叫 frontmatter。它必须放在两行 `---` 之间。日期填写实际写作或整理发布日期；不要为整理旧资料伪造实验完成日期。页面日期按 `Asia/Shanghai`（北京时间）显示：只写 `YYYY-MM-DD` 时保持该日期，带时区的时间戳则换算为北京时间；RSS / 机器可读元信息保留标准时间格式。`draft: true` 的文件不会生成公开页面，也不会进入搜索、RSS 或 sitemap。

## 新增一个项目

把 `templates/project.md` 复制到 `src/content/projects/`。与笔记的写法相同，另外支持：

- `status`：`计划中` / `进行中` / `已完成`；未填写时默认为 `计划中`。
- `accent`：`purple` / `lime` / `orange`，控制卡片配色。
- `diagram`：`board` / `wave` / `circuit`，控制卡片插画。
- `repository`：可选，真实项目代码链接。
- `demo`：可选，真实演示链接。

代码链接和演示链接不要填占位地址；没有时省略这两项。

## 新增一个实验

把 `templates/experiment.md` 复制到 `src/content/experiments/`。与笔记的写法相同，另外支持：

- `order`：学习路径序号，决定列表排序和卡片上的 `STEP 0x`，接着现有最大值往下排。
- `stage`：`前置` / `基础` / `进阶`，实验列表页按它分组。
- `status`：`计划中` / `进行中` / `已完成`；未填写时默认为 `计划中`。
- `board`：硬件平台，默认是本站实际使用的 `"Zynq-7035 核心板 + 自制 AD/DA 底板"`。
- `tools`：用到的工具与仪器，名称写成双引号字符串，例如 `["Vivado 2020.2", "示波器"]`；版本未知时只写 `"Vivado"`，不推测补齐。
- `accent`：`purple` / `lime` / `orange`，控制详情页顶部插画配色。
- `diagram`：`wave` / `board` / `circuit`，控制详情页顶部插画。

正文推荐结构：这个实验要解决什么 → 硬件连接（接线表）→ 原理与关键代码 → 仿真验证 → 上板步骤 → 踩过的坑 → 下一步。

理论推算、仿真运行结果、上板量测分别标注。代码或编译产物中包含 PASS 字符串不等于运行通过，表中的预期值不等于实测。硬件版本、引脚、电平或器件型号有疑问时保留适配说明；本文实验中尚未核定的 UL3 型号、C8 电平配置等不能靠润色补成结论。

文章以文字、接线表、参数和关键代码说明实验过程。现有内联 SVG 示意图会保留，新增图片完全可选；不使用等待补图的占位块。内联 SVG 的图形标签之间不要留空行，保持连续的 HTML 块；构建产物检查会拦截被 Markdown 拆开的图形。Markdown 中的 HTML 编辑注释会在构建时移除，真实代码片段中的注释仍保留。

阅读时长按讲解文字每分钟 400 字估算：忽略围栏代码、缩进代码、行内代码、编辑注释和 SVG，保留表格单元格文字以及链接的可见文字。它是篇幅估算，不代表完成实验或阅读代码所需时间。

## 添加图片

如需添加已有图片，可将图片放在文章所在文件夹，并使用相对地址。Astro 会处理 Markdown 中引用的本地图片，并适配部署的路径。

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

3 篇示例笔记和 2 个示例项目现在均为 `sample: true`、`draft: true`，仅保留源码供参考，不生成公开页面，也不进入搜索、RSS 或 sitemap。正式学习笔记使用 `sample: false`。

目前项目展示没有正式条目，会显示空状态；不需要为保持页面完整而编造项目。若临时在本地恢复示例预览，可改为 `draft: false`，但发布前应检查该状态。

上传真实内容时，使用 `sample: false`。真实内容会优先于示例显示。

收录范围：RSS 和 sitemap 包含已发布的真实笔记、实验和项目；搜索索引包含三类已发布内容及带标记的示例。RSS 按日期发布最近 30 条，草稿在三者中都排除。

## 修改个人资料和外观

- 网站名称、作者、简介：`src/lib/site.ts`。
- 首页文案与插画：`src/pages/index.astro`。
- 个人介绍：`src/pages/about/index.astro`。
- 实验列表页导语、分组说明与学习路径：`src/pages/experiments/index.astro`。
- 实验详情页信息栏（平台/状态/工具）：`src/components/ExperimentMeta.astro`。
- 实验卡片：`src/components/ExperimentCard.astro`；实验相关样式在 `src/styles/global.css` 末尾「实验记录」一段。
- 配色、字体与文章布局：`src/styles/global.css`；首页布局：`src/styles/home.css`。字体使用系统字体，不请求第三方字体服务。
- 站点图标：`public/favicon.svg`。
- 社交分享图：[public/social-card.png](public/social-card.png)，1200 × 630；[SVG 原稿](public/social-card.svg) 保留用于编辑。修改图稿后需同步导出 PNG。
- 导航、页脚与页面元信息：`src/layouts/Layout.astro`。

目前没有公开邮箱和个人 GitHub 联系入口，因为尚未提供具体信息。历史预览截图与旧构建已归档到项目外，不进入仓库；本轮临时预览仍由忽略规则排除。

## 免费部署到 GitHub Pages

项目已准备好 `.github/workflows/deploy.yml`。完成下面的账号设置后即可部署：

1. 在自己的 GitHub 账号下创建一个公开仓库，例如 `lulu-blog`。
2. 将本项目文件上传到该仓库的 `main` 或 `master` 分支。保留 `.github` 文件夹和 `package-lock.json`；不要上传 `node_modules`、`.astro` 和 `dist`。
3. 打开仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
4. 在 **Actions** 页面运行 `Deploy lulu's blog`，或者再次推送一次修改。
5. 部署成功后，在 Pages 页面查看公开网址。

默认项目仓库的网址类似 `https://你的用户名.github.io/lulu-blog/`。如果仓库名为 `你的用户名.github.io`，网站发布在根路径。

构建配置会读取 GitHub Actions 提供的仓库名称，自动设置网址与子路径，不需要在代码里填写 GitHub 用户名。

本站已通过 GitHub Actions 部署到 https://luwlu.github.io/lulu-blog/。推送到 `main` 或 `master` 会触发检查、构建和 Pages 发布。

### 自定义域名（以后可选）

如果以后绑定域名，在仓库 **Settings → Secrets and variables → Actions → Variables** 添加：

```text
SITE_URL = https://你的域名
BASE_PATH = /
```

自定义域名只设置 `SITE_URL` 时，默认发布在根路径；显式 `BASE_PATH` 优先。默认 GitHub 项目站仍自动使用仓库子路径。

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