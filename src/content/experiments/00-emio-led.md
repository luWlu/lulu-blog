---
title: "前置实验：EMIO 点灯，第一次让 PS 控制 PL 引脚"
description: "PS 端使能 EMIO GPIO，用 SCU 私有定时器中断让 PL 侧 LED 每秒亮灭一次，验证 EMIO 通路必须先配置 PL 才能工作。"
date: 2026-09-11
order: 0
stage: "前置"
status: "已完成"
board: "Zynq-7035 核心板 + 自制 AD/DA 底板"
tools: ["Vivado", "Vitis"]
tags: ["Zynq", "EMIO", "GPIO", "点灯"]
accent: "purple"
diagram: "board"
draft: false
sample: false
---

## 为什么第一个实验是点灯

Zynq 和普通单片机的最大区别是：芯片里同时住着**一个 ARM 处理器（PS）和一片可编程逻辑（PL）**。后面所有实验——采数据、出波形、挂总线——本质都是这两半在互相说话。而「说话」这件事得先有一条物理通路，点灯就是验证这条通路的最小实验：把一个 LED 接在 PL 侧的引脚上，让 PS 把它点亮、熄灭、再点亮。

它验证的具体是三件事：

1. **PS 的 GPIO 控制器能不能把信号送过芯片内部那条分界线**——这就是 EMIO；
2. **这个信号能不能顺着 PL 的布线资源走到某个 PL 引脚上**，而且那个引脚**确实**是你在约束文件里指定的那一个；
3. **PS 端的软件能不能真的跑起来**：配置外设、打开中断、按预期翻转电平。

三件事里任何一件不对，现象都是同一个：**LED 不亮**。所以这个实验的价值不在于「会点灯」，而在于它把后面所有实验都要依赖的那条 PS→PL 通路先验证一遍。

本实验的目标就一句话：**PS 端引出 EMIO 接口，在 PS 端编写定时器模块，控制 LED 每秒交替点亮/熄灭**。

## 硬件平台与工具链

### PS 和 PL 各干什么

- **PS（Processing System）**：ARM Cortex-A9 双核，外加一堆硬核外设——DDR 控制器、GPIO 控制器、GIC 中断控制器、SCU 私有定时器、TTC、Global Timer 等。C 代码跑在这里。
- **PL（Programmable Logic）**：可编程逻辑。**本实验在 PL 里一行逻辑都不写**，它只是被「借道」：EMIO 信号进到 PL、走过布线资源、从引脚出去。

源文档在约束文件的说明里专门记了一笔：本设计 EMIO 通路上**没有 PL 时钟域逻辑**，因此 XDC 里**不需要额外的 `create_clock`**，出现 `unconstrained paths` 的 warning 可以忽略。

源 README 的器件说明原文是：

> 目标器件以 `xc7z020clg400-1`（正点原子启明星 / 米联客 MZ702 等常见 7020 板）为例，**引脚号必须按你自己板子的原理图改**。

也就是说，`xc7z020clg400-1` 是这份文档拿来做**通用示例**的器件，配套的引脚号、电平标准都只是示例值。

### 工具链

| 环节 | 工具 | 产物 |
|---|---|---|
| 硬件：Block Design、XDC 约束、综合实现 | Vivado | 比特流（`.bit`）+ 硬件描述（`.xsa`） |
| 软件：Platform/BSP、应用工程、编译 | Vitis | ELF |
| 下载与运行 | Vitis（Program FPGA + Run） | 板上现象 |

源文档的写法是「打开 Vitis（2019.2 及以前是 XSDK，操作类似）」，**没有写死 Vivado / Vitis 的版本号**。

## MIO 和 EMIO 到底差在哪

Zynq 的 PS 里有一个 GPIO 控制器，它管着两段完全不同的引脚：

| 类型 | 数量 | 位置 | 能否自己选引脚 |
|------|------|------|----------------|
| MIO | 54 个（bank0: MIO0~31，bank1: MIO32~53） | 直接连到 PS 的物理引脚 | 不能，出厂固定 |
| EMIO | 64 个（bank2: EMIO0~31，bank3: EMIO32~63） | **信号先进入 PL 逻辑，再由 PL 引脚引出** | 能，取决于你约束到哪个 PL 引脚 |

所以「PS 引出 EMIO 控制 LED」的本质是：

```text
PS GPIO 控制器 ──EMIO信号──> PL 布线资源 ──> PL 的某个 IO 引脚 ──> 板上 LED
```

**关键推论：这条通路必须经过 PL，所以每次运行前都必须先下载 bitstream（配置 PL）。** 只跑 ELF 不配 PL，LED 一定不亮——这是最常见的「代码没错但不亮」的原因。

这也就是为什么「明明 LED 挂在 PL 的引脚上，却不用写 Verilog」：这次的 PL 只提供走线和引脚，逻辑完全在 PS 侧的 C 代码里。

<figure class="diagram">
<svg viewBox="0 0 720 320" role="img" aria-label="Zynq PS 到 PL 引脚的 EMIO 信号通路框图：PS 里的 GPIO 控制器管理 MIO 与 EMIO 两段引脚，EMIO 信号进入 PL 的布线资源，再由 PL 的 IO 引脚经芯片封装引脚引出到板上 LED；MIO 则直接连到 PS 的物理引脚且出厂固定">
  <defs>
    <marker id="emio-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>

  <rect x="14" y="18" width="506" height="232" rx="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="7 6" opacity="0.55"/>
  <text x="26" y="40" font-size="12" fill="currentColor" opacity="0.85">Zynq 芯片封装边界（PS 与 PL 同在一颗器件内）</text>

  <rect x="32" y="56" width="170" height="168" rx="8" fill="currentColor" opacity="0.06" stroke="currentColor" stroke-width="2"/>
  <text x="117" y="80" text-anchor="middle" font-size="13" fill="currentColor">PS（处理系统）</text>
  <rect x="44" y="94" width="146" height="36" rx="6" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <text x="117" y="117" text-anchor="middle" font-size="12" fill="currentColor">GPIO 控制器</text>
  <text x="46" y="152" font-size="11" fill="currentColor">bank0/1: MIO0~53</text>
  <text x="46" y="174" font-size="11" fill="currentColor">bank2/3: EMIO0~63</text>
  <text x="46" y="204" font-size="11" fill="currentColor" opacity="0.85">MIO 引脚出厂固定</text>

  <line x1="202" y1="118" x2="294" y2="118" stroke="currentColor" stroke-width="3" marker-end="url(#emio-arrow)"/>
  <text x="248" y="98" text-anchor="middle" font-size="11" fill="currentColor">EMIO 信号</text>
  <text x="248" y="146" text-anchor="middle" font-size="11" fill="currentColor">EMIO0</text>
  <text x="248" y="164" text-anchor="middle" font-size="11" fill="currentColor">= 引脚号 54</text>

  <rect x="302" y="56" width="188" height="168" rx="8" fill="currentColor" opacity="0.06" stroke="currentColor" stroke-width="2"/>
  <text x="396" y="80" text-anchor="middle" font-size="13" fill="currentColor">PL（可编程逻辑）</text>
  <rect x="316" y="94" width="160" height="36" rx="6" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <text x="396" y="117" text-anchor="middle" font-size="12" fill="currentColor">布线资源</text>
  <text x="316" y="154" font-size="11" fill="currentColor">本设计 EMIO 通路</text>
  <text x="316" y="174" font-size="11" fill="currentColor">无 PL 逻辑，仅走线</text>
  <text x="316" y="204" font-size="11" fill="currentColor" opacity="0.85">不需要 create_clock</text>

  <text x="524" y="42" font-size="11" fill="currentColor" opacity="0.85">芯片封装引脚</text>

  <line x1="490" y1="118" x2="566" y2="118" stroke="currentColor" stroke-width="3" marker-end="url(#emio-arrow)"/>
  <rect x="572" y="78" width="128" height="88" rx="8" fill="currentColor" opacity="0.08" stroke="currentColor" stroke-width="2"/>
  <text x="636" y="108" text-anchor="middle" font-size="12" fill="currentColor">板上 LED</text>
  <text x="636" y="130" text-anchor="middle" font-size="11" fill="currentColor">（PL 侧）</text>
  <text x="636" y="154" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">XDC: PACKAGE_PIN</text>

  <text x="360" y="286" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">MIO：出厂固定，直接连到 PS 的物理引脚；EMIO：信号先进 PL，再由 PL 引脚引出</text>
</svg>
<figcaption>图 1：EMIO 通路必须穿过 PL。PS 里的 GPIO 控制器把信号交给 PL 的布线资源，再由一个 PL 的 IO 引脚送出芯片——所以这个引脚必须在 XDC 里被约束，而且每次上电都要先配置 PL。</figcaption>
</figure>

## EMIO 的引脚号：EMIO0 = 54

`XGpioPs` 驱动里，引脚号是**全局连续编号**的，MIO 和 EMIO 共用一套号段：

| 引脚号范围 | 对应 |
|-----------|------|
| 0 ~ 31 | MIO 0 ~ 31（bank0） |
| 32 ~ 53 | MIO 32 ~ 53（bank1） |
| **54 ~ 85** | **EMIO 0 ~ 31（bank2）** |
| 86 ~ 117 | EMIO 32 ~ 63（bank3） |

**EMIO0 = 引脚号 54**，EMIO1 = 55，以此类推。这个 54 是最容易写错的地方——软件里写 55，等于去点 EMIO1，而 EMIO1 在硬件上根本没被引出，现象就是「引脚号写对了但 LED 不动」。

## 定时器选哪一只

PS 端可用的定时器有三种，本任务用第一种就够了：

| 定时器 | 位置与特点 | 适用场景 |
|---|---|---|
| **SCU 私有定时器（`XScuTimer`）** | Cortex-A9 内部自带，每个 CPU 一个，32 位递减计数，**时钟 = CPU 时钟 / 2**（7020 常用 667 MHz CPU → 333 MHz 计时时钟），带自动重装载和中断 | 本教程**主方案** |
| Global Timer（全局定时器） | 64 位，`sleep()` / `usleep()` 底层就用它 | 做「软件延时轮询」最省事 |
| TTC（Triple Timer Counter） | PS 外设，可以输出 PWM 或做计数 | 需要 PWM / 计数的场合 |

源文档对方案选择的说法很明确：`usleep(500000)` / `sleep(1)` 也能实现 1 秒翻转（见 `src/led_poll.c`），但题目要求「编写定时器模块」，所以推荐用**私有定时器 + 中断**（见 `src/led_timer_intr.c`）——这才是真正的「定时器模块」，也更能体现 PS 端编程能力。

## Vivado 侧：把 EMIO 引到 PL 引脚

这一段是硬件工程的全部工作，目标只有一个：**让 PS 的 EMIO 出现在 PL 的一个引脚上**。

### 建工程

1. Vivado → Create Project → RTL Project → 勾选 **Do not specify sources at this time**。
2. Parts 选你的器件。源文档给的示例是 7020 常见的 `xc7z020clg400-1`（400 脚）或 `xc7z020clg484-1`（484 脚），**按开发板选**。
3. （可选）Boards 页选对应开发板，这样 DDR / 时钟等预设会自动带上。

### 搭 Block Design

1. Flow Navigator → IP INTEGRATOR → **Create Block Design**，名字默认 `design_1`。
2. 点 `+` → 搜索 `ZYNQ7 Processing System` → 双击添加。
3. 出现绿色横幅 **Run Block Automation** → 点它 → OK（自动接好 DDR 和 FIXED_IO，并按板卡预设配好 DDR 型号和时钟）。

### 打开 EMIO GPIO（本任务的核心）

1. 双击 `processing_system7_0` 这个块。
2. 左侧选 **Peripheral I/O Pins**。
3. 在 **GPIO** 分组里：
   - 勾选 **EMIO**（GPIO EMIO 前的复选框）；
   - 下方 **GPIO EMIO Width** 填 `1`（控制 1 个 LED）或 `4`（控制 4 个 LED）。本教程用 1。
4. 如果板上 LED 是 PL 侧的，**不要**去动 MIO 那 54 个引脚的勾选，我们用不到 MIO。
5. 点 OK。

### 也可以用 Tcl 一键开 EMIO

Vivado 下方的 Tcl Console 直接粘贴即可：

```tcl
set_property -dict [list \
  CONFIG.PCW_GPIO_EMIO_GPIO_ENABLE {1} \
  CONFIG.PCW_GPIO_EMIO_GPIO_IO {1} \
] [get_bd_cells processing_system7_0]
```

`tcl/emio_ps_config.tcl` 就是这个脚本的完整版，多了两句自检与提示：

```tcl
# 使能 EMIO GPIO，位宽 1（控制 1 个 LED）
set_property -dict [list \
    CONFIG.PCW_GPIO_EMIO_GPIO_ENABLE {1} \
    CONFIG.PCW_GPIO_EMIO_GPIO_IO     {1} \
] [get_bd_cells processing_system7_0]

# 确认配置是否生效（会打印 GPIO_EMIO 相关参数）
report_property [get_bd_cells processing_system7_0] -filter {NAME =~ *GPIO*}

puts "==> EMIO GPIO 已使能，位宽 1。请对 GPIO_0 端口执行 Make External。"
```

脚本自己的注意事项写在头部：**Make External 这一步推荐手动点**（用 Tcl 做容易踩坑）；如果 Tcl 报「`CONFIG.PCW_GPIO_EMIO_GPIO_IO` 不是有效属性」，说明版本属性名不同，改回 GUI 操作即可。

### Make External：把 EMIO 交到 PL 引脚上

1. 这时 `processing_system7_0` 块上会多出一个端口 **`GPIO_0`**。
2. 右键它 → **Make External**（快捷键 Ctrl+T），Vivado 会生成一个顶层端口。
3. 建议把端口改个名方便识别：选中该端口 → 在 External Port Properties 里把 Name 改成 `led`（或保留默认）。
4. **记下这个端口的确切名字**，写约束要用。导出后常见形如：
   - `GPIO_0_0[0:0]`（1 位时也可能写成 `GPIO_0_0[0]`）
   - 或你改名后的 `led[0]`

不同 Vivado 版本命名有差异，源文档强调**别猜**，用下面任一方法确认：

- 打开 `sources_1/bd/design_1/hdl/design_1_wrapper.v`，看 `input/output/inout` 那一行；
- 或在 Tcl Console 执行：

  ```tcl
  get_ports *
  ```

  然后在里面找带 `GPIO` 或 `led` 的那个。

另外一个容易让人犹豫的点，源文档也解释了：**EMIO GPIO 导出后是 inout（带三态），这是正常的**。PS 内部把三态控制线 T 拉低（= 输出），所以直接约束到 LED 引脚即可，**不需要额外加 IOBUF**。

### 收尾 + 出 bitstream

1. 工具栏 **Validate Design**（F6），必须 0 error。
2. Sources 窗口右键 `design_1.bd` → **Create HDL Wrapper** → 选 **Let Vivado manage wrapper and auto-update**。
3. 右键 `design_1.bd` → **Generate Output Products** → Global。
4. 添加约束文件：Add Sources → Add or create constraints → Create File → 名字如 `led_emio.xdc`，内容见下一节。
5. **Generate Bitstream**（会先跑综合+实现，几分钟）。

### 导出硬件

- File → **Export → Export Hardware** → 勾选 **Include bitstream** → 输出 `design_1_wrapper.xsa`。
- 这个 `.xsa` 是给 Vitis 用的，里面同时包含硬件描述和 bit 流。

## XDC 约束：两行，但最容易出错

核心真的只有两行——把一个端口绑到球号、再声明电平标准：

```tcl
set_property PACKAGE_PIN <你板子LED对应的PL引脚> [get_ports {GPIO_0_0[0]}]
set_property IOSTANDARD LVCMOS33               [get_ports {GPIO_0_0[0]}]
```

`constrs/led_emio.xdc` 是一份**模板**，全文（含注释）如下，可以看到所有具体球号都被注释掉了。（文件头那行 `Zynq-7020` 同样是这份通用模板的示例标题，不是本板器件的断言。）

```tcl
# =============================================================================
# led_emio.xdc  --  Zynq-7020 PS EMIO GPIO -> PL 引脚(LED) 约束模板
#
# 使用前必须做两件事：
#   1) 确认 EMIO 导出后的顶层端口名。
#      方法A：打开 sources_1/bd/design_1/hdl/design_1_wrapper.v 看端口声明
#      方法B：Vivado Tcl Console 执行   get_ports *
#      常见形式：GPIO_0_0[0]  /  GPIO_0_0[0:0]  /  led[0]（若你改过名）
#   2) 打开开发板原理图，找到 PL 侧 LED 对应的 FPGA 引脚号 和 该 Bank 的电平标准。
#      !! 不要照抄下面示例里的引脚号，不同开发板完全不同 !!
# =============================================================================

# ---------------------------------------------------------------------------
# 示例（请按你的板子修改）——下面以端口名 GPIO_0_0[0] 为例
# ---------------------------------------------------------------------------
# set_property PACKAGE_PIN Y9        [get_ports {GPIO_0_0[0]}]
# set_property IOSTANDARD  LVCMOS33  [get_ports {GPIO_0_0[0]}]

# ---------------------------------------------------------------------------
# 如果你在 Block Design 里把外部端口改名成了 led，则用下面两行
# ---------------------------------------------------------------------------
# set_property PACKAGE_PIN Y9        [get_ports {led[0]}]
# set_property IOSTANDARD  LVCMOS33  [get_ports {led[0]}]

# ---------------------------------------------------------------------------
# 如果是 4 位 EMIO 控制 4 个 LED（EMIO0~EMIO3 -> 引脚 54~57）
# ---------------------------------------------------------------------------
# set_property PACKAGE_PIN Y9  [get_ports {GPIO_0_0[0]}]
# set_property PACKAGE_PIN W9  [get_ports {GPIO_0_0[1]}]
# set_property PACKAGE_PIN V9  [get_ports {GPIO_0_0[2]}]
# set_property PACKAGE_PIN U9  [get_ports {GPIO_0_0[3]}]
# set_property IOSTANDARD LVCMOS33 [get_ports {GPIO_0_0[*]}]

# ---------------------------------------------------------------------------
# 说明：
#  * EMIO 导出后是 inout（含三态），属正常现象；PS 内部将 T 拉低以驱动输出，
#    无需额外添加 IOBUF。
#  * IOSTANDARD 必须与该引脚所在 Bank 的 VCCO 电压一致，否则实现阶段报
#    DRC 错误（如 Bank 34/35 多为 3.3V -> LVCMOS33，部分板为 1.8V）。
#  * 本设计 EMIO 通路上没有 PL 时钟域逻辑，因此不需要额外的 create_clock；
#    出现 "unconstrained paths" 的 warning 可忽略。
# =============================================================================
```

### 三个字段怎么填

| 字段 | 怎么确定 |
|---|---|
| **`PACKAGE_PIN`** | 打开开发板原理图，搜板上 PL 侧 LED（通常叫 `PL_LED0` / `LED0` / `DS0`），顺着网络找到 FPGA 的管脚号（源文档示例给的是 `Y9`、`M14`、`T22` 这类）。⚠️ **千万不要照抄别人板子的引脚号**，不同板子差异极大。 |
| **`IOSTANDARD`** | 看该引脚属于哪个 Bank，以及 Bank 的 VCCO 电压。Bank 34/35 常见 `LVCMOS33`（3.3V），有些板是 `LVCMOS18`（1.8V）。填错会在实现阶段报 DRC 错误（Bank 电压冲突）。 |
| **端口名** | 必须和 `get_ports` 的结果完全一致。写错的话综合不会报错，但实现时会出现「get_ports 未匹配到对象」的 critical warning，**引脚就是随机分配的，表现为 LED 完全不动**。 |

如果板上没有 PL 侧 LED，只有一个空闲扩展口，源文档给的做法是：把 LED 正极（长脚）串一个 **330Ω~1kΩ 电阻**接到该 IO，负极接 GND，同样能验证——注意别超过 IO 的驱动电流（约 **8~16mA**）。

## Vitis 侧：PS 端的定时器模块

### 建 platform 和 application

1. 打开 Vitis（2019.2 及以前是 XSDK，操作类似）。
2. File → New → **Platform Project** → 名字如 `led_platform` → 选 **Create from XSA** → 选上一步导出硬件得到的那个 `.xsa` → Finish。
3. 右键 platform → **Build**（生成 BSP，`xgpiops`、`xscutimer`、`xscugic` 驱动都在里面）。
4. File → New → **Application Project** → 选刚才的 platform → 选 **Hello World** 模板（只是为了快速生成一个能跑的空壳）→ Finish。
5. 把自动生成的 `helloworld.c` 内容整个替换成 `src/led_timer_intr.c` 的内容（或直接把该文件拷进 `src/`，删除 `helloworld.c`）。
6. Build（Ctrl+B），0 error。

### 主方案：SCU 私有定时器 + 中断

配置的顺序可以压缩成三句话：**先配 GPIO，再配中断控制器，最后配定时器**。

```c
#define LED_PIN  54        /* EMIO0 = 引脚号 54 */

/* 1. 配 GPIO：EMIO 必须同时设方向 + 输出使能 */
XGpioPs_SetDirectionPin(&Gpio, LED_PIN, 1);
XGpioPs_SetOutputEnablePin(&Gpio, LED_PIN, 1);

/* 2. 配 GIC 中断控制器：注册 IRQ 异常处理 + 连接定时器中断 */
Xil_ExceptionRegisterHandler(XIL_EXCEPTION_ID_IRQ_INT,
                             (Xil_ExceptionHandler)XScuGic_InterruptHandler, &Intc);
Xil_ExceptionEnable();
XScuGic_Connect(&Intc, TIMER_INT_ID, (Xil_ExceptionHandler)TimerIntrHandler, &Timer);
XScuGic_Enable(&Intc, TIMER_INT_ID);

/* 3. 配私有定时器：装载值 = 计时时钟频率 - 1 => 1 秒 */
XScuTimer_LoadTimer(&Timer, TIMER_LOAD_VALUE);   /* CPU_CLK/2 - 1 */
XScuTimer_EnableAutoReload(&Timer);              /* 到点自动重装，周期性 */
XScuTimer_EnableInterrupt(&Timer);               /* 允许产生中断（漏了这句就永远不进ISR）*/
XScuTimer_Start(&Timer);
```

中断服务函数里只做翻转（源文档的告诫：**不要在 ISR 里加延时，也不要用 printf**）。`led_timer_intr.c` 里的原文：

```c
/******************************************************************************
 * 定时器中断服务函数：每 1 秒把 LED 电平翻转一次
 * 注意：ISR 里不要加延时、不要用 printf
 *****************************************************************************/
static void TimerIntrHandler(void *CallBackRef)
{
    XScuTimer *TimerInstancePtr = (XScuTimer *)CallBackRef;
    static u32 LedState = 0;

    if (XScuTimer_IsExpired(TimerInstancePtr)) {
        /* 必须清中断标志，否则只会进一次中断 */
        XScuTimer_ClearInterruptStatus(TimerInstancePtr);

        LedState = (LedState == 0) ? 1 : 0;
        XGpioPs_WritePin(&Gpio, LED_PIN, LedState ? LED_ON : LED_OFF);
    }
}
```

**装载值怎么算：**

| 项 | 值 |
|----|----|
| CPU 时钟（7020 常见） | 666,666,687 Hz |
| SCU 定时器时钟 | CPU/2 = 333,333,343 Hz |
| 1 秒装载值 | 333,333,343 → 实际填 `TIMER_FREQ_HZ - 1` |
| 0.5 秒 | `TIMER_FREQ_HZ / 2 - 1` |

代码里用 `XPAR_CPU_CORTEXA9_CORE_CLOCK_FREQ_HZ / 2` 自动取频率，避免手写死数。如果编译报「宏未定义」，打开 BSP 的 `include/xparameters.h`，搜 `CPU_CLK_FREQ`，把宏名换成你 BSP 里实际的那个——源文档列了常见的几个：`XPAR_CPU_CORTEXA9_0_CPU_CLK_FREQ_HZ`、`XPAR_PS7_CORTEXA9_0_CPU_CLK_FREQ_HZ`。

`led_timer_intr.c` 把这种版本差异用条件编译兜住了，值得抄：

```c
/* 注意：Vitis 不同版本的 BSP 里宏名不一样，例如
 *   旧: XPAR_XSCUGIC_0_DEVICE_ID    新: XPAR_SCUGIC_0_DEVICE_ID
 *   旧: XPAR_XSCUTIMER_0_INTR       新: XPAR_SCUTIMER_INTR
 * 下面用条件编译自动适配，新旧 BSP 都能直接编译通过。
 * 若仍报未定义，请打开 BSP 的 ps7_cortexa9_0/include/xparameters.h，
 * 搜 SCUGIC / SCUTIMER / GPIOPS 关键字，用实际存在的宏名替换即可。 */

#if defined(XPAR_XSCUTIMER_0_INTR)
  #define TIMER_INT_ID      XPAR_XSCUTIMER_0_INTR
#elif defined(XPAR_SCUTIMER_INTR)
  #define TIMER_INT_ID      XPAR_SCUTIMER_INTR
#else
  #define TIMER_INT_ID      29      /* CPU0 的 SCU 私有定时器固定为中断 ID 29 */
#endif

/* 同理，CPU 频率宏名也随 BSP 版本变化，依次尝试；全落空时按 667MHz 兜底 */
#if defined(XPAR_CPU_CORTEXA9_CORE_CLOCK_FREQ_HZ)
  #define CPU_CLK_FREQ_HZ   XPAR_CPU_CORTEXA9_CORE_CLOCK_FREQ_HZ
#elif defined(XPAR_CPU_CORTEXA9_0_CPU_CLK_FREQ_HZ)
  #define CPU_CLK_FREQ_HZ   XPAR_CPU_CORTEXA9_0_CPU_CLK_FREQ_HZ
#elif defined(XPAR_PS7_CORTEXA9_0_CPU_CLK_FREQ_HZ)
  #define CPU_CLK_FREQ_HZ   XPAR_PS7_CORTEXA9_0_CPU_CLK_FREQ_HZ
#else
  #define CPU_CLK_FREQ_HZ   666666687UL   /* 按你 PS 的实际频率修改 */
#endif

/* SCU 私有定时器的计数时钟是 CPU 时钟的 1/2 */
#define TIMER_FREQ_HZ       (CPU_CLK_FREQ_HZ / 2)

/* 定时周期：1 秒。要 0.5 秒改成 (TIMER_FREQ_HZ / 2 - 1) */
#define TIMER_LOAD_VALUE    (TIMER_FREQ_HZ - 1)
```

还有个小坑源文档顺手记了：`xil_printf` **不支持 `%lu`**，打印装载值要用 `%d` 或 `%x`：

```c
/* 注意：xil_printf 不支持 %lu，这里用 %d / %x */
xil_printf("SCU timer clk = %d Hz, load = 0x%x\r\n",
           (int)TIMER_FREQ_HZ, (unsigned)TIMER_LOAD_VALUE);
```

### 备选方案：软件延时轮询

不用中断、不配任何定时器，代码最短，适合先把 EMIO 通路验通。见 `src/led_poll.c`：

```c
while (1) {
    XGpioPs_WritePin(&Gpio, LED_PIN, 1);
    sleep(1);                       /* standalone BSP 用 Global Timer 实现，精度足够 */
    XGpioPs_WritePin(&Gpio, LED_PIN, 0);
    sleep(1);
}
```

答辩 / 验收时源文档建议交上面那个中断版，并说明「定时器模块」的配置过程。

#### 关于 `src/` 目录：其实是两套近乎等价的实现

源 README 的「文件清单」一节只列了 `src/led_timer_intr.c` 和 `src/led_poll.c` 两个文件，但目录里实际还有 `src/emio_led_1s.c` 和 `src/emio_led_poll.c`——同一套逻辑的另一版写法。实质差别只有这几处：

| | `led_timer_intr.c` / `led_poll.c` | `emio_led_1s.c` / `emio_led_poll.c` |
|---|---|---|
| 打印 | `xil_printf` | `printf`（多了 `#include "stdio.h"`） |
| 周期参数 | 宏直接给装载值：`TIMER_LOAD_VALUE (TIMER_FREQ_HZ - 1)` | 毫秒参数化：`PERIOD_MS 1000U` → `TIMER_LOAD_VAL (((TIMER_CLK_HZ / 1000U) * PERIOD_MS) - 1U)` |
| 轮询版延时 | `sleep(1)` | `HALF_PERIOD_US 1000000U` + `usleep()` |
| 额外提醒 | —— | 注释里特别写了一句「该引脚确实接 LED（**不是按键**）」 |

### 下载运行

1. 开发板拨到 **JTAG 启动模式**，插好下载器和串口（波特率 **115200**）。
2. Vitis 工具栏 → **Program FPGA**（或在 Run/Debug Configuration 里勾选 Program FPGA），选 `design_1_wrapper.bit`。
   ⚠️ **这一步不能省，EMIO 通路依赖 PL。**
3. 右键应用工程 → Run As → **Launch on Hardware (Single Application Debug)**。
4. 观察 LED 是否 1 秒亮、1 秒灭。

## 上板现象与验证

### 预期现象

下载并运行后应该看到：

| 观察点 | 预期 |
|---|---|
| 串口（115200） | 程序启动时打印版本行与定时器参数（`led_timer_intr.c` 打印 `SCU timer clk = ... Hz, load = 0x...`，`emio_led_1s.c` 还多打印 CPU 频率与 `Timer started, LED toggles every ... ms`） |
| LED | **1 秒亮、1 秒灭**，完整明暗周期 2 秒 |

<figure class="diagram">
<svg viewBox="0 0 720 200" role="img" aria-label="LED 引脚上的预期波形：中断每 1 秒翻转一次电平，因此亮 1 秒、灭 1 秒，完整明暗周期 2 秒">
  <line x1="70" y1="150" x2="660" y2="150" stroke="currentColor" stroke-width="2" opacity="0.5"/>
  <line x1="70" y1="150" x2="70" y2="46" stroke="currentColor" stroke-width="2" opacity="0.5"/>
  <polyline points="70,80 210,80 210,150 350,150 350,80 490,80 490,150 630,150"
            fill="none" stroke="currentColor" stroke-width="3"/>
  <line x1="210" y1="142" x2="210" y2="158" stroke="currentColor" stroke-width="2" opacity="0.6"/>
  <line x1="350" y1="142" x2="350" y2="158" stroke="currentColor" stroke-width="2" opacity="0.6"/>
  <line x1="490" y1="142" x2="490" y2="158" stroke="currentColor" stroke-width="2" opacity="0.6"/>
  <text x="62" y="76" text-anchor="end" font-size="11" fill="currentColor">亮</text>
  <text x="62" y="156" text-anchor="end" font-size="11" fill="currentColor">灭</text>
  <text x="70" y="176" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">0s</text>
  <text x="210" y="176" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">1s</text>
  <text x="350" y="176" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">2s</text>
  <text x="490" y="176" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">3s</text>
  <text x="630" y="176" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">4s</text>
  <text x="70" y="196" font-size="11" fill="currentColor" opacity="0.8">翻转只在定时器到点（每 1 秒）时发生，ISR 里不做任何延时</text>
</svg>
<figcaption>图 2：LED 引脚上的预期波形——中断每 1 秒翻转一次电平，所以亮 1 秒、灭 1 秒，一个完整明暗周期 2 秒。（源文档没有附实测波形，这里画的是设计与装载值推出的预期。）</figcaption>
</figure>

### 一个必须记住的前提

EMIO 通路依赖 PL。**每次运行前都必须先 Program FPGA（下载 bitstream）**，否则只跑 ELF 一定不亮。这条不是什么操作习惯问题，而是这个实验的物理前提。

## 排错清单

按源文档给出的出现频率排序：

| 现象 | 原因 | 处理 |
|------|------|------|
| 完全不亮 | 没下载 bitstream / PL 未配置 | 先 Program FPGA 再跑 ELF |
| 完全不亮（换了引脚也一样） | XDC 端口名写错，综合时 `get_ports` 没匹配上 | 看 implementation 的 critical warning，用 `get_ports *` 确认名字 |
| 常亮或常灭，不闪 | LED 低电平点亮（共阳） | 把代码里 `led = !led` 改成初值取反，或交换 ON/OFF 电平 |
| 一直亮着不灭 | 没调 `XGpioPs_SetOutputEnablePin` | EMIO 必须使能输出，MIO 才可省略 |
| 只闪一下就停 | ISR 里没清中断状态 | 加 `XScuTimer_ClearInterruptStatus()` |
| 中断完全不进 | 忘了 `XScuTimer_EnableInterrupt()`，或 GIC 没 `Xil_ExceptionEnable()` | 补上；确认中断号是 `XPAR_XSCUTIMER_0_INTR` |
| 闪烁明显快/慢一倍以上 | 装载值用了 CPU 频率没除以 2 | SCU 定时器时钟 = CPU/2 |
| 引脚号写对了但 LED 不动 | EMIO 位宽设成了 1，软件里却写引脚 55 | EMIO0 = 54，EMIO1 = 55 |
| 实现报 DRC Bank 电压冲突 | IOSTANDARD 与 Bank VCCO 不符 | 按原理图改 LVCMOS33 / LVCMOS18 |
| 编译报 `XPAR_...` 未定义 | BSP 宏名随版本变化 | 打开 `xparameters.h` 搜实际宏名 |

## 踩过的坑

**1. 只跑 ELF、不配 PL。**
这是本实验的头号坑，没有之一。EMIO 信号要穿 PL 才能到引脚，PL 没配置，通路根本不存在，代码再对也不亮。养成「先 Program FPGA，再 Run」的固定顺序。

**2. 把 EMIO0 的引脚号写成 55。**
`XGpioPs` 里 MIO 占了 0~53，EMIO 从 54 才开始。写 55 就是去操作 EMIO1——而 EMIO1 在硬件上压根没被引出，现象是「什么都对但灯不动」。

**3. 只设了方向，忘了输出使能。**
`XGpioPs_SetDirectionPin` 和 `XGpioPs_SetOutputEnablePin` 对 EMIO **两个都要调**。MIO 可以省掉输出使能，EMIO 不行——这是 MIO / EMIO 在软件层面的一个实质差异。漏了它的现象就是「一直亮着不灭」。

**4. ISR 里忘了清中断标志。**
`XScuTimer_ClearInterruptStatus()` 漏掉，中断只会进一次，LED 只闪一下就永远停住。

**5. 中断配置缺一环，中断完全不进。**
三个地方任何一个漏了都不进中断：定时器的 `XScuTimer_EnableInterrupt()`、GIC 的 `XScuGic_Connect()` / `XScuGic_Enable()`、以及 CPU 侧的 `Xil_ExceptionEnable()`。

**6. 装载值忘了除以 2。**
SCU 私有定时器的计数时钟是 **CPU 时钟 / 2**。直接拿 CPU 频率去装载，闪的就是半秒而不是一秒（快一倍）。

**7. XDC 里的端口名和 `get_ports` 的结果不一致。**
综合阶段不报错，**实现阶段只给一个 critical warning**，然后引脚被随机分配——现象是 LED 完全不动，而且换个引脚号也一样。用 `get_ports *` 或 `design_1_wrapper.v` 把名字核实一遍，别猜。

**8. IOSTANDARD 和 Bank 电压对不上。**
填错会在实现阶段报 DRC（Bank 电压冲突）。Bank 34/35 常见 `LVCMOS33`，但有些板是 `LVCMOS18`，必须按原理图。

**9. 被 `XPAR_...` 宏名绊住。**
同一个驱动在不同 Vitis 版本的 BSP 里宏名会变（`XPAR_XSCUGIC_0_DEVICE_ID` vs `XPAR_SCUGIC_0_DEVICE_ID`）。别硬记，打开 BSP 的 `xparameters.h` 搜关键字，或者直接用 `led_timer_intr.c` 里那套条件编译。

**10. 用 `xil_printf` 打 `%lu`。**
它不支持，打印 32 位装载值用 `%d` / `%x` 就好。

**11. 目标引脚上挂的可能不是 LED。**
`emio_led_1s.c` 的注释里特意写了一条前提：「该引脚确实接 LED（**不是按键**）」。约束到哪个球之前，先在原理图上确认那颗球外面接的是灯，不然你会对一个按键输出电平、然后纳闷灯为什么不亮。

## 下一步

这个实验打通的是「PS 能不能够到 PL 引脚」这一件事，后面的实验全都建在它上面：

- **把 EMIO 位宽从 1 改成 4**，一次点 4 个 LED。硬件侧只改 `GPIO EMIO Width`，软件侧引脚号依次是 54/55/56/57——XDC 模板里已经给了 4 位的写法（`GPIO_0_0[0]` ~ `GPIO_0_0[3]`）。
- **换定时器做对比**：把 SCU 私有定时器换成 TTC，或者直接用 Global Timer（`sleep()` / `usleep()` 的底层），看三种定时器在精度、代码量和中断结构上的差别。轮询版（`emio_led_poll.c`）是最快的起步方式。
- **改周期**：中断版把 `TIMER_LOAD_VALUE` 改成 `TIMER_FREQ_HZ / 2 - 1` 就是 0.5 秒；`emio_led_1s.c` 那版更省事，直接改 `PERIOD_MS`。
- **把这条通路接到真实外设上**：本实验的 PL 引脚上挂的是灯，换成继电器、驱动芯片、AD/DA 的控制脚，就是后面几个实验在做的事。
