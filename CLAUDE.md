# lulu's blog：AI 协作手册

给在本仓库里工作的 AI 看。目标：新增或修改内容时，和现有风格、事实标准、发布流程保持一致。动手前先读相关的现有文件，照着已有写法做，不要另起一套。

## 项目速览

- Astro 7 静态站，内容是 `src/content/` 下的 Markdown，推送 `main` 后由 `.github/workflows/deploy.yml` 发布到 GitHub Pages（https://luwlu.github.io/lulu-blog/）。
- 三个内容集合，字段规则在 `src/content.config.ts`：
  - `experiments/`：Zynq 实验长文，按 `order` 组成学习路径（STEP 00 起），按 `stage` 分组。
  - `notes/`：学习笔记，按 `category` 生成筛选按钮。
  - `projects/`：项目展示，目前没有正式条目，只有 `draft: true` 的示例。
- 样式是原生 CSS：`global.css`（主题变量 + 大部分组件）、`home.css`（首页）、`article.css`（正文）、`motion.css`（全站动效）、`backdrop.css`（背景贴纸）、`cover.css`（封面、实验列表）。
- 交互是少量原生 TS：`src/scripts/site.ts`（主题、搜索、滚动浮现、封面描线）、`src/scripts/article.ts`（目录、代码复制、表格）。不引入 React/Vue 等框架、外部字体或 CDN。

## 命令

```bash
npm run dev            # 本地预览 http://127.0.0.1:4321/
npm test               # 单元测试（tests/*.test.mjs）
npm run check          # astro check，必须 0 errors
npm run build          # 构建到 dist/
npm run verify:build   # 检查产物链接、锚点、元信息、收录范围
```

改完代码或内容后，四项都要通过才算完成。改了视觉的，还要在浅色和深色、1440 和 390 宽度下各看一眼（截图之类的临时文件放 `.preview/`，它已被 git 忽略）。

## 新增内容

1. 复制 `templates/experiment.md`、`templates/note.md` 或 `templates/project.md` 到对应集合目录。
2. 文件名用小写英文加连字符，实验加两位序号前缀，比如 `07-uart-loopback.md`。文件名就是网址，发布后不要改。
3. frontmatter 的规则：
   - 字符串一律加双引号，`date` 不加引号（`2026-10-15`），`order` 是数字。
   - `tags` 和 `tools` 写成数组，比如 `["Zynq", "PWM"]`。
   - 枚举字段只能用 schema 里的值：`stage` 只有 前置/基础/进阶，`status` 只有 计划中/进行中/已完成，`accent` 只有 purple/lime/orange，`diagram` 只有 wave/board/circuit。
   - 实验的 `order` 接着现有的最大值往下排；`board` 默认 `"Zynq-7035 核心板 + 自制 AD/DA 底板"`。
   - `accent` 尽量和相邻的实验错开，让列表页颜色交替。
   - 正式内容写 `sample: false`。还没写完就保持 `draft: true`，用户确认发布时再改成 `false`。
4. 实验和笔记都必须用 `cover` 配一张专属封面（规则见下文「封面」）。现有封面都不合适时，按规则新画一张，不要直接套一张不相关的。
5. 不需要手动登记任何地方：首页、列表、学习路径、上一篇/下一篇、搜索、RSS、sitemap、目录、阅读时长都会自动生成。

## 正文写法

- 不写 `#` 一级标题，正文从 `##` 开始，目录取 `##` 和 `###`。
- 实验文章的章节顺序：这个实验要解决什么 → 硬件连接（接线表）→ 原理 → 关键代码讲解 → Testbench 与仿真 → Vivado/上板步骤 → 预期现象 → 踩过的坑 → 下一步。笔记的章节顺序：想弄清楚什么 → 理解与尝试 → 小结与下一步。
- 语气：第一人称学习记录，具体、平实。先讲"为什么"，再讲"怎么做"。关键结论用 `**加粗**`，安全和极性警告用 `> **…**` 引用块。中文引号用「」，正文里不写感叹号和"超强""完美"这类词。
- 表格用于接线、引脚、参数、对照。代码块要标语言（`verilog`、`tcl`、`c`、`powershell`），只放关键片段并配讲解，不整份粘贴。
- 示意图用内联 SVG，写法照抄 `templates/experiment.md`：
  - 用 `<figure class="diagram"><svg viewBox=… role="img" aria-label="…">…</svg><figcaption>图 N：…</figcaption></figure>` 包起来。
  - 颜色只用 `currentColor` 配合 `opacity`，不要写死 `#000` 之类的色值。
  - 字号不小于 11，`font-family="monospace"`。
  - **SVG 内部不能有空行**，否则 Markdown 会把它拆开，`verify:build` 会报错。
- 图片放在集合目录下的 `images/` 里，用 `./images/xxx.png` 引用。图片必须真实存在，不能先写引用、后补文件。不写"截图待补"之类的占位块。
- `verify:build` 会拦截产物里出现的 `TODO(lulu)`、`shot-placeholder`、`截图待补`，以及 `D:\` 这类本机绝对路径。HTML 注释 `<!-- -->` 在构建时会被删掉，可以拿来给编辑留言。

## 事实边界（最重要）

- 理论推算、仿真结果、上板实测要分别标注。代码里有 PASS 字符串不等于跑过，预期表也不等于实测。
- 不编造实测数据、版本号、引脚、器件型号或日期。没有记录的版本只写 `"Vivado"`；拿不准的硬件细节要保留适配说明，不能润色成确定结论。
- `date` 写实际写作或整理发布的日期，不要推测实验当时的完成日期。页面按北京时间显示。
- 素材里有前后矛盾的地方，问用户，不要自己挑一个。

## 视觉风格

整体是"硬件手账"风：紫色主调，青柠绿和珊瑚橙作辅色，网格纸底纹，配手绘线稿和电子元件元素，英文小标签用等宽大写字母。

- **颜色**只用 `global.css` 顶部的变量，比如 `--purple`、`--lime`、`--orange`、`--text`、`--muted`、`--line`、`--surface`、`--art-bg`。新增颜色时，要在 `:root` 和 `:root[data-theme='dark']` 里各写一份。组件里不写裸色值。
- **字体**：中文用系统字体，署名衬线用 `var(--serif)`，标签和代码用 `var(--mono)`。小标签用 `var(--text-label)` 或 `var(--text-meta)`，字号不低于 11px。
- **栏目标题**的格式：等宽小字 kicker（`01 / THE ZYNQ LAB`）+ 中文 h2 + 一个彩色圆点。文案短、温和，比如"记录每一次「原来如此」。"
- **圆角和阴影**用 `--radius-lg/md/sm` 和 `--shadow`。卡片的统一样式是 1px `--line` 边框，悬停时上移 4px，边框混入一些紫色。
- **图标**统一放在 `src/components/Icon.astro`：24×24 网格，`stroke-width 1.7`，圆头圆角，`fill="none"`。新图标加到这里，不要另外引入图标库，也不要用 transform 缩放来凑尺寸。
- 品牌标志是页头的四色方块，`public/favicon.svg` 和它保持一致。

## 封面

- 封面定义在 `src/lib/covers.ts`（名字 → 左上角说明文字）和 `src/components/Cover.astro`（每个名字一段 SVG）。现有封面：`led`、`relay`、`edge`、`pulse`、`pwm`、`adc`、`dac`、`verilog`、`uart`。
- 在 frontmatter 里写 `cover: "adc"` 就会启用，卡片、首页、文章头图共用同一张。
- 没写 `cover` 时：实验和项目回落到 `diagram` 对应的通用插图；**笔记没有 `diagram` 字段，文章页不会有头图，首页主推位只显示一个书本图标**。
- **每篇新实验、新笔记都要有专属封面。** 现有封面能准确表达主题就复用（比如另一篇 Verilog 时序笔记可以用 `verilog`）；不能的话就新画一张，不要借用不相关的。
  - 实验封面画实验本身：器件、信号链、波形。
  - 笔记封面画这篇笔记的核心概念：一个关键电路、时序或状态图，比如状态机笔记画状态转移图，Datasheet 笔记画带标注的引脚图或时序图。说明文字概括主题，比如 `FSM · STATE TRANSITION`。
  - 笔记没有 `accent`，封面固定用紫色底，画完只需检查浅色和深色两种主题。笔记列表页的卡片不显示封面，封面只出现在文章头图和首页主推位。
- 新画一张封面的步骤：在 `covers.ts` 里加名字和说明（英文大写，用 `→` 或 `·` 连接），然后在 `Cover.astro` 里加一段 `{name === 'xxx' && <>…</>}`。规则如下：
  - 画布 `viewBox 0 0 520 200`，左上角大约 (22, 28) 的位置留给说明文字。主体画在 x 60–490 之间。
  - 主线条用 `currentColor`，加上 `class="cover-trace" pathLength="1"`，进入视口时会被"描"出来。
  - 画面里最关键的一条信号用 `cover-hot`（填充用 `cover-hot-fill`，浅底框用 `cover-hot-soft`）。悬停时会流动的虚线用 `cover-flow`，会闪烁的光晕用 `cover-glow`。
  - 文字用 `cover-label`（14px 粗体）或 `cover-small`（11px）。
  - 波形尽量用文件里的 `wave()` 辅助函数生成。不要用 `Math.random`，噪声用固定序列，保证每次构建结果一样。
  - 画的内容要和文章主题直接对应（实验画实验本身，笔记画核心概念），不要放泛泛的装饰。
- 画完要在浅色和深色下检查对比度（实验和项目还要看三种 accent），看说明文字有没有被遮挡。检查位置：实验看列表卡片、首页和文章头图；笔记看文章头图和首页主推位。

## 动效

- 所有动画都要放在 `@media (prefers-reduced-motion: no-preference)` 里面，悬停效果再加上 `(hover: hover) and (pointer: fine)` 条件。
- 没有 JS 的时候内容也必须可见：先由脚本加上 pending 状态，再触发动画，不能用 CSS 默认隐藏内容。
- 缓动曲线用 `var(--ease-out)` 或 `var(--ease-spring)`，时长一般在 160–600ms，动效要克制。
- 跨页过渡用 View Transitions。`view-transition-name` 在同一个页面里必须唯一（封面用的是 `cover-<id>`），重名会导致整页过渡失效。

## 改代码

- 照着周边代码的写法来：中文注释，注释简短，只说"为什么"。Astro 组件的模板写得比较紧凑。
- 新的纯逻辑放在 `src/lib/` 下的独立文件里（不要 import `astro:content`），并在 `tests/` 里加 `node:test` 测试。可以参考 `short-title.ts`。
- 新增 frontmatter 字段时，要同步更新 `content.config.ts`、对应模板里的说明，以及 `README.md`。
- 不引入新依赖。确实需要时先问用户，版本要锁定。

## 发布

- 只有用户明确说"发布"或"提交"时才 commit 和 push。用户确认过的流程是直接推送到 `main`。
- 发布前跑完上面的四项检查。只 `git add` 本次改动的文件，不要提交 `.preview/`、`dist/`。commit 信息用中文，格式是 `feat:` / `fix:` / `style:` / `docs:` 加一句摘要。
- 推送后打开线上页面，确认新内容已经出现（一般 1–2 分钟）。
