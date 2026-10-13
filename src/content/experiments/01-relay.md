---
title: "前置实验：继电器控制，从引脚到负载的第一次隔离"
description: "第一次用 FPGA 引脚驱动真实外部器件：把 3.3V 逻辑经 ULN2003 送到继电器线圈，验证极性、上电默认态与整条输出链路的通断。"
date: 2026-09-15
order: 1
stage: "前置"
status: "已完成"
board: "Zynq-7035 核心板 + 自制 AD/DA 底板"
tools: ["Vivado 2020.2"]
tags: ["Zynq", "继电器", "GPIO", "隔离"]
accent: "orange"
diagram: "circuit"
draft: false
sample: false
---

前面的实验都停留在「引脚电平」这个层面：逻辑在 PL 里跑，输出只是一根线上的高低。这次不一样——要第一次让一个 3.3V 的 FPGA 管脚去**驱动一个真实存在的外部器件**：继电器。

用继电器的理由很朴素，就两条。第一是**弱电控强电**：FPGA 的 I/O 只能给出几毫安、3.3V 的驱动能力，而继电器线圈要的是 5V、单只约 28 mA（四只同时吸合约 110 mA），中间必须有驱动级。第二是**隔离**：继电器线圈侧和触点侧在电气上是分开的，FPGA 和 PL 逻辑永远只跟线圈这一侧打交道，触点侧接什么负载都跟它没有电气连接。

这个实验的定位是「前置」：不涉及 PS、不涉及 Block Design、不涉及 Vitis，整条链路是纯粹的 PL 输出。目标也很简单——**四只继电器 H1~H4 每 3 秒同时翻转一次状态**，用来一次性验证 `PL 逻辑 → ULN2003 → 继电器` 这条输出链路。

<!-- TODO(lulu): 源文档没有说明本实验最终的通过/失败结论、也没有记录四只继电器是否都正常动作（relay_multimeter_test.md 只给的是"假定不响时"的排查方法）。这里只写了目标，没有替源材料下结论。如果你手上已有实测结论，补在这一段。 -->

## 为什么要继电器，以及这条链路上有什么

先说清楚链路，后面所有现象都挂在它上面：

```text
FPGA 球 ──> 底板连接器 ──> ULN2003 输入 ──> ULN2003 输出 ──> 继电器线圈 ──> 继电器触点
```

这条链一共五级，任何一级断开，现象都是同一个：**LED 在闪，但继电器不响**。所以排查永远是沿着这条链一级一级往下量，而不是回头怀疑逻辑。

补两个关键事实：

- **ULN2003 的续流二极管是芯片内置的**（位号 UL3）。COM 脚 (pin10) 接 VCC5V、GND 脚 (pin9) 接地，符合标准接法，**无需外接续流二极管**。线圈断电瞬间的反向电动势由芯片内部二极管吸收掉。
- **线圈供电是 VCC5V**，单只约 28 mA @5V，四只同时吸合约 110 mA。

> **绝不接市电。** HFD4/5 是信号继电器，触点容量很小。若只测通断（万用表 / 指示灯）可以直接做；若切真实负载，先确认触点额定值；**在没有确认绝缘间距之前，不要接市电**。

## 硬件连接与引脚分配

本实验用到 6 个球号，全部对照 Vivado 2020.2 器件库
`D:\Xilinx\Vivado\2020.2\data\ip\xilinx\mig_7series_v4_2\data\fpga_tlib\zynq\7z\xc7z035ffg676_pkg.xml`
逐条核验过（球号 ↔ 网络名 ↔ Bank 全部一致），不是推测值。

| 功能 | 网络名 | 球号 | Bank | Bank 类型 | IOSTANDARD | 备注 |
|---|---|---|---|---|---|---|
| **PL 时钟 100 MHz** | `IO_L13P_T2_MRCC_34` | **C8** | 34 | HD | LVCMOS33 | **MRCC**，时钟专用脚 |
| **继电器 H1** | `B12_L2_N` | **AC11** | 12 | HD | LVCMOS33 | `IO_L2N_T0_12` |
| **继电器 H2** | `B12_L2_P` | **AB12** | 12 | HD | LVCMOS33 | `IO_L2P_T0_12` |
| **继电器 H3** | `B12_L15_N` | **AD15** | 12 | HD | LVCMOS33 | `IO_L15N_T2_DQS_12` |
| **继电器 H4** | `B12_L15_P` | **AD16** | 12 | HD | LVCMOS33 | `IO_L15P_T2_DQS_12` |
| **心跳灯** | `IO_25_13` | **V18** | 13 | HD | LVCMOS33 | 普通单端 I/O |

球号到驱动器、到继电器的对应关系（四路结构完全相同）：

| 信号 | 连接器脚 | FPGA 球号 | ULN2003 输入 | ULN2003 输出 | 继电器 | 线圈脚 |
|---|---|---|---|---|---|---|
| F_RC1 | B23 | **AC11** | pin1 (1B) | pin18 (1C) | **H1** | pin1(+) / pin8(−) |
| F_RC2 | B24 | **AB12** | pin2 (2B) | pin17 (2C) | **H2** | pin1(+) / pin8(−) |
| F_RC3 | B25 | **AD15** | pin3 (3B) | pin16 (3C) | **H3** | pin1(+) / pin8(−) |
| F_RC4 | B26 | **AD16** | pin4 (4B) | pin15 (4C) | **H4** | pin1(+) / pin8(−) |

**4 路信号各自独立**，分别来自 ULN2003 的 pin1/2/3/4，不是差分对的两端。

硬件参数：

- 继电器：**HFD4/5**（5V 信号继电器）× 4，位号 H1~H4，各自独立器件
- 驱动：**ULN2003**（位号 UL3）；线圈供电 VCC5V，单只约 28 mA @5V，四只同时吸合约 110 mA
- 触点侧：`R_COM1~4` / `R_NO1~4` 引出；**NC 触点疑似悬空**，待 PCB 版图核实

<div class="shot-placeholder"><strong>截图待补</strong>：这里需要一张底板接线照片（来源：继电器模块接线照片），能看清 UL3 的 pin1~pin4 输入侧、pin10 的 COM 接 VCC5V、pin9 接地，以及 H1~H4 线圈的 pin1/pin8。</div>

<div class="shot-placeholder"><strong>截图待补</strong>：这里需要一张万用表测 H1 线圈电阻的读数照片（来源：万用表实测），正常应在 150~200 Ω 区间。</div>

## 信号链框图

<figure class="diagram">
<svg viewBox="0 0 720 320" role="img" aria-label="继电器控制信号链框图：FPGA 球经板对板连接器到 ULN2003 输入，ULN2003 输出把继电器线圈另一端拉到地，线圈另一端接 VCC5V；触点侧 COM 与 NO 经隔离边界接负载">
  <defs>
    <marker id="rl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>

  <rect x="14" y="94" width="116" height="132" rx="8" fill="currentColor" opacity="0.06" stroke="currentColor" stroke-width="2"/>
  <text x="72" y="116" text-anchor="middle" font-size="13" fill="currentColor">FPGA（PL）</text>
  <text x="26" y="144" font-size="11" fill="currentColor">AC11 relay1</text>
  <text x="26" y="170" font-size="11" fill="currentColor">AB12 relay2</text>
  <text x="26" y="196" font-size="11" fill="currentColor">AD15 relay3</text>
  <text x="26" y="222" font-size="11" fill="currentColor">AD16 relay4</text>
  <line x1="130" y1="176" x2="162" y2="176" stroke="currentColor" stroke-width="3" marker-end="url(#rl-arrow)"/>
  <text x="146" y="160" text-anchor="middle" font-size="11" fill="currentColor">4 路</text>
  <rect x="164" y="94" width="132" height="132" rx="8" fill="currentColor" opacity="0.06" stroke="currentColor" stroke-width="2"/>
  <text x="230" y="118" text-anchor="middle" font-size="12" fill="currentColor">板对板连接器</text>
  <text x="176" y="146" font-size="11" fill="currentColor">B23 / B24</text>
  <text x="176" y="172" font-size="11" fill="currentColor">B25 / B26</text>
  <line x1="296" y1="176" x2="328" y2="176" stroke="currentColor" stroke-width="3" marker-end="url(#rl-arrow)"/>
  <rect x="330" y="94" width="122" height="132" rx="8" fill="currentColor" opacity="0.06" stroke="currentColor" stroke-width="2"/>
  <text x="391" y="118" text-anchor="middle" font-size="13" fill="currentColor">ULN2003 UL3</text>
  <text x="342" y="148" font-size="11" fill="currentColor">pin1~4 (1B~4B)</text>
  <text x="342" y="178" font-size="11" fill="currentColor">pin18~15 (1C~4C)</text>
  <text x="342" y="208" font-size="11" fill="currentColor">pin9 GND</text>
  <line x1="452" y1="176" x2="484" y2="176" stroke="currentColor" stroke-width="3" marker-end="url(#rl-arrow)"/>
  <rect x="486" y="94" width="116" height="132" rx="8" fill="currentColor" opacity="0.06" stroke="currentColor" stroke-width="2"/>
  <text x="544" y="116" text-anchor="middle" font-size="13" fill="currentColor">继电器 H1~H4</text>
  <circle cx="506" cy="152" r="4" fill="currentColor"/>
  <circle cx="506" cy="182" r="4" fill="currentColor"/>
  <line x1="506" y1="152" x2="514" y2="144" stroke="currentColor" stroke-width="2"/>
  <text x="492" y="146" text-anchor="end" font-size="11" fill="currentColor">COM</text>
  <text x="492" y="190" text-anchor="end" font-size="11" fill="currentColor">NO</text>
  <rect x="500" y="194" width="34" height="26" rx="3" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <text x="546" y="212" font-size="11" fill="currentColor">线圈</text>
  <text x="540" y="220" text-anchor="end" font-size="11" fill="currentColor">pin1 + / pin8 −</text>
  <line x1="538" y1="207" x2="562" y2="207" stroke="currentColor" stroke-width="2"/>
  <line x1="562" y1="207" x2="562" y2="82" stroke="currentColor" stroke-width="2"/>
  <line x1="562" y1="82" x2="540" y2="82" stroke="currentColor" stroke-width="2" marker-end="url(#rl-arrow)"/>
  <text x="530" y="78" text-anchor="end" font-size="11" fill="currentColor">VCC5V</text>

  <line x1="548" y1="20" x2="548" y2="88" stroke="currentColor" stroke-width="2" stroke-dasharray="7 6" opacity="0.75"/>
  <line x1="548" y1="232" x2="548" y2="300" stroke="currentColor" stroke-width="2" stroke-dasharray="7 6" opacity="0.75"/>
  <text x="556" y="26" font-size="11" fill="currentColor" opacity="0.85">隔离边界</text>

  <line x1="602" y1="152" x2="614" y2="152" stroke="currentColor" stroke-width="3" marker-end="url(#rl-arrow)"/>
  <line x1="602" y1="182" x2="614" y2="182" stroke="currentColor" stroke-width="3" marker-end="url(#rl-arrow)"/>
  <line x1="634" y1="152" x2="634" y2="182" stroke="currentColor" stroke-width="2"/>
  <text x="642" y="170" font-size="11" fill="currentColor">负载</text>
</svg>
<figcaption>图 1：从 FPGA 引脚到负载的隔离信号链。继电器线圈一端固定接 VCC5V，另一端由 ULN2003 的输出脚拉低才导通；触点侧 COM/NO 与线圈侧之间是隔离边界。</figcaption>
</figure>

## 驱动极性：这一段要读三遍

这是整个实验最容易搞反的地方。ULN2003 是**反相灌电流（开集电极）输出**——它只能把输出**拉到地**，不能输出高电平：

- 输入**高** → 达林顿管导通 → **输出拉到地** → 线圈得电 → **继电器吸合**
- 输入**低** → 达林顿管截止 → **输出高阻（悬空）** → 线圈失电 → **继电器释放**

于是有两个反直觉的结论：

1. **FPGA 输出 1 = 继电器吸合。** 源文档反复强调的极性就是这个：`relay_state = 1'b1` 时四只继电器同时吸合，不是释放。
2. **ULN 输出脚的对地电压与直觉相反——吸合时电压低，释放时电压高。** 吸合时输出被拉到地（达林顿管有饱和压降，实际是约 0.9~1.2V，不是严格 0V，**别误判成"没导通"**）；释放时输出脚被线圈"提"到约 5V。

<!-- TODO(lulu): 早期版本的文档把这里写成"0V ←→ 5V"，容易让人以为恒 5V 是正常的，从而把"通道坏了"误判成"电路正常"。relay_multimeter_test.md 明确说以该文件的极性说明（约 1V ←→ 约 5V）为准。 -->

### 安全默认态

上电时 `relay_state` 初值是 `1'b0` → FPGA 输出低 → ULN 输出高阻 → 四只继电器**全部释放**，第一次吸合要等上电后 3 秒。

更底层的一层保障是 **ULN2003 输入级内置 2.7k 下拉**：FPGA 未配置 / 未驱动时输入为低，线圈**不会**误吸合。这就是本设计的安全默认态——所以「断开 FPGA、只给底板 5V 上电，四只继电器应该是安静的，不该有'嗒'声」。只有底板在 ULN 输入端**额外加了上拉**才会误吸合；若真有，去掉上拉即可。

<figure class="diagram">
<svg viewBox="0 0 720 200" role="img" aria-label="四路继电器输出波形：每 3 秒翻转一次，高 3 秒低 3 秒，完整周期 6 秒">
  <line x1="70" y1="150" x2="660" y2="150" stroke="currentColor" stroke-width="2" opacity="0.5"/>
  <line x1="70" y1="150" x2="70" y2="46" stroke="currentColor" stroke-width="2" opacity="0.5"/>
  <polyline points="70,80 210,80 210,150 350,150 350,80 490,80 490,150 630,150"
            fill="none" stroke="currentColor" stroke-width="3"/>
  <line x1="70" y1="70" x2="70" y2="90" stroke="currentColor" stroke-width="2" opacity="0.5"/>
  <line x1="210" y1="142" x2="210" y2="158" stroke="currentColor" stroke-width="2" opacity="0.6"/>
  <line x1="350" y1="142" x2="350" y2="158" stroke="currentColor" stroke-width="2" opacity="0.6"/>
  <line x1="490" y1="142" x2="490" y2="158" stroke="currentColor" stroke-width="2" opacity="0.6"/>
  <text x="62" y="76" text-anchor="end" font-size="11" fill="currentColor">3.3V</text>
  <text x="62" y="156" text-anchor="end" font-size="11" fill="currentColor">0V</text>
  <text x="46" y="115" font-size="11" fill="currentColor" opacity="0.85">AC11</text>
  <text x="210" y="176" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">3s</text>
  <text x="350" y="176" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">6s</text>
  <text x="490" y="176" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">9s</text>
  <text x="560" y="176" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">时间轴</text>
</svg>
<figcaption>图 2：AC11（relay1）上的实测应看到的波形：高 3 秒 / 低 3 秒，完整周期 6 秒。relay2~relay4 与它完全同相位；UL3 的 pin18 与它相位相反。</figcaption>
</figure>

### 想改周期就改一个参数

无需动逻辑：

```verilog
relay_top #(
    .CLK_HZ     (100_000_000),
    .TOGGLE_SEC (3)           // 当前默认值；想改成 2 秒就写 2
) u_top ( ... );
```

或者直接改模块内 `TOGGLE_SEC` 的默认值。注意 **`TOGGLE_SEC` 是半周期**：`TOGGLE_SEC=3` → 吸合 3 秒 + 释放 3 秒 = 完整周期 **6 秒**。

## Verilog 控制模块

`relay_ctrl.v`（含单一模块 `relay_top`）全文如下，注释与源文件保持一致：

```verilog
module relay_top #(
    parameter integer CLK_HZ     = 100_000_000,  // 输入时钟频率 100 MHz
    parameter integer TOGGLE_SEC = 3              // 继电器翻转周期（秒）
)(
    input  wire clk,        // 100 MHz @ C8
    output wire relay1,     // -> UL3 pin1 (1B) -> H1  
    output wire relay2,     // -> UL3 pin2 (2B) -> H2  
    output wire relay3,     // -> UL3 pin3 (3B) -> H3  
    output wire relay4,     // -> UL3 pin4 (4B) -> H4  
    output wire led_heart   // 工作指示灯 @ V18
);


    // 1. 分频计数器，100Mhz

    localparam integer HALF_CYCLES = CLK_HZ * TOGGLE_SEC;   // 3 秒 = 3×10^8

    (* KEEP = "TRUE" *) reg [31:0] div_cnt = 32'd0;
    reg relay_state = 1'b0;

    always @(posedge clk) begin
        if (div_cnt >= HALF_CYCLES - 1) begin
            div_cnt     <= 32'd0;
            relay_state <= ~relay_state;   // 每 3 秒翻转一次
        end else begin
            div_cnt <= div_cnt + 1'b1;
        end
    end

    // 2. 四路输出：全部由同一个 relay_state 驱动

    assign relay1 = relay_state;
    assign relay2 = relay_state;
    assign relay3 = relay_state;
    assign relay4 = relay_state;


    // 3. 工作指示灯：证明 PL 在跑

    reg [26:0] heart = 27'd0;
    always @(posedge clk) begin
        heart <= heart + 1'b1;
    end
    assign led_heart = heart[26];

endmodule
```

四个实现要点，都是源文档明确记下来的：

| 要点 | 说明 |
|---|---|
| **纯计数分频** | `100 MHz × 3 s = 3×10⁸` 个周期（约 28.2 位），故 `div_cnt` 用 `[31:0]` 有充足余量 |
| **`(* KEEP = "TRUE" *)`** | 防止综合器把 `div_cnt` 优化掉导致翻转周期不对 |
| **无输入信号** | 不依赖任何按键/外部输入，**没有亚稳态、没有抖动问题**，逻辑最简 |
| **参数化周期** | `CLK_HZ` 与 `TOGGLE_SEC` 两个 parameter，换时钟或换周期不用改逻辑 |

### 为什么四路故意同相位

`relay1~4` 接在**同一个 `relay_state`** 上，所以 H1~H4 是**同相位、同时吸合、同时释放**的。这是**故意**的：一次上板就能通过「哪只不响」定位到具体某一只继电器或某一路 ULN 通道。

- **四只都响** → 硬件链路完好
- **三只响、一只不响** → 不响的那只或其 ULN 通道有问题
- **都不响** → **共性问题**，优先怀疑：**5V 供电**、**UL3 pin9 的 GND**、**板对板连接器**

> 早期的按键方案已经废弃：原方案用的输入源 K1 按键**硬件已损坏**，改为自由运行。这样反而更干净——排除了按键这个人因变量，纯粹验证输出链路。相比按键方案，本方案**去掉了两级同步器和消抖逻辑**，因为没有任何异步输入，这两个机制失去意义。
>
> 注意源文档之间有一处遗留矛盾：`relay_pinmap.md` 第一节的标题写「已移除：按键 K1」，但它后面又有一张标题为「备用：其余 3 路继电器（本实验**不使用**）」的表，把 H2/H3/H4 **又列成了不使用**。这与当前代码（4 路全部驱动）和 XDC（AC11/AB12/AD15/AD16 全部约束）冲突。
>
> <!-- TODO(lulu): 上面这处 H2~H4「不使用」的表述与现版本代码/XDC 矛盾，本次按「4 路全部启用」写；请确认 pinmap 那一段是否属于未清理干净的旧版本残留。 -->

## 约束文件

`relay_top.xdc` 全文：

```tcl
# =============================================================================
# 继电器实验约束文件 —— 4 路全部驱动
# 器件：xc7z035ffg676-2  （Zynq-7035, 676 脚封装）
# 功能：不使用按键，H1~H4 每 3 秒同时翻转一次状态
#
# 球号来源：Vivado 2020.2 器件库
#   D:\Xilinx\Vivado\2020.2\data\ip\xilinx\mig_7series_v4_2\
#       data\fpga_tlib\zynq\7z\xc7z035ffg676_pkg.xml
# =============================================================================

# -----------------------------------------------------------------------------
# 时钟：100 MHz
#   C8 = IO_L13P_T2_MRCC_34  (Bank 34, MRCC 时钟专用脚)
# -----------------------------------------------------------------------------
set_property -dict {PACKAGE_PIN C8 IOSTANDARD LVCMOS33} [get_ports clk]
create_clock -name sys_clk -period 10.000 [get_ports clk]

# -----------------------------------------------------------------------------
# 四路继电器输出 —— 全部位于 Bank 12 (HD, VCCIO 3.3V)
#
#   球号   网络名                  ULN2003 输入   输出      继电器   连接器脚
#   AC11   IO_L2N_T0_12            pin1  (1B)    pin18(1C)   H1      B23
#   AB12   IO_L2P_T0_12            pin2  (2B)    pin17(2C)   H2      B24
#   AD15   IO_L15N_T2_DQS_12       pin3  (3B)    pin16(3C)   H3      B25
#   AD16   IO_L15P_T2_DQS_12       pin4  (4B)    pin15(4C)   H4      B26
#
#   ⚠️ 1. 这 4 个球都"具备差分能力"，但本设计按【单端】使用。
#         若工程里已有针对 L2 / L15 差分对的约束，必须先删除，否则 DRC 冲突。
#   ⚠️ 2. 它们分属两对差分对（AC11/AB12 为 L2 对，AD15/AD16 为 L15 对），
#         现在被当作 4 个独立单端 IO 使用，这是合法的。
# -----------------------------------------------------------------------------
set_property -dict {PACKAGE_PIN AC11 IOSTANDARD LVCMOS33} [get_ports relay1]
set_property -dict {PACKAGE_PIN AB12 IOSTANDARD LVCMOS33} [get_ports relay2]
set_property -dict {PACKAGE_PIN AD15 IOSTANDARD LVCMOS33} [get_ports relay3]
set_property -dict {PACKAGE_PIN AD16 IOSTANDARD LVCMOS33} [get_ports relay4]

# -----------------------------------------------------------------------------
# 心跳灯
#   V18 = IO_25_13  (Bank 13, 普通单端 I/O)
#   约 0.37 Hz：亮 1.34s / 灭 1.34s
# -----------------------------------------------------------------------------
set_property -dict {PACKAGE_PIN V18 IOSTANDARD LVCMOS33} [get_ports led_heart]

# -----------------------------------------------------------------------------
# 已移除：按键 K1 (H7)
#   按键硬件损坏，本测试不依赖任何按键输入，因此不写 H7 的任何约束。
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# 可选：把"存在未约束端口"从 Error 降为 Warning（调试期用，定稿后建议还原）
# -----------------------------------------------------------------------------
# set_property SEVERITY {Warning} [get_drc_checks NSTD-1]
# set_property SEVERITY {Warning} [get_drc_checks UCIO-1]
```

读这份 XDC 要留意三点：

1. **时钟约束**：`create_clock -period 10.000` 对应 100 MHz，源文档记为「正确」。
2. **文件里的注释是错的**：XDC 里写「心跳灯 约 0.37 Hz：亮 1.34s / 灭 1.34s」。这个数是**算错了**——忘了 `heart[26]` 一翻转只是半个周期。实际是每 **0.67 秒**翻转一次、约 **0.75 Hz**。以 workflow 文档的更正为准。
   <!-- TODO(lulu): relay_top.xdc 第 40 行的 0.37 Hz 注释与 relay_workflow.md 的更正（0.67s 一翻转 / 约 0.75 Hz）矛盾，属于源文件内部的旧注释。本次只更正正文说明，未改动该行原文以保持代码块与源文件一致。 -->
3. **最后两行是注释掉的**：把 NSTD-1 / UCIO-1 从 Error 降为 Warning 是调试期的临时手段，定稿后应还原。

约束检查清单（别直接跑综合）：

- [ ] `create_clock -period 10.000` 对应 100 MHz → 正确
- [ ] 6 个 `PACKAGE_PIN`：C8 / AC11 / AB12 / AD15 / AD16 / V18
- [ ] 全部 `IOSTANDARD` 为 `LVCMOS33`（Bank 12/13/34 都是 HD Bank，VCCIO 应为 3.3V）
- [ ] 工程里**没有**针对 AC11/AB12/AD15/AD16/C8 的旧差分对约束（有则删除）
- [ ] Verilog 顶层端口有 6 个：`clk` / `relay1`~`relay4` / `led_heart`（不留未约束端口）
- [ ] **确认已删除 `btn_k1` 端口和 H7 约束**（按键方案已废弃）

### Bank 与电平注意事项

1. **Bank 12 和 Bank 34 都是 HD Bank**（High Density），最高支持 3.3V → `LVCMOS33` 合法。若落在 HP Bank（最高 1.8V）就无法直接驱动 5V 侧的 ULN2003。
2. **差分球当单端用**：AC11/AB12 是 `L2` 差分对，AD15/AD16 是 `L15` 差分对，时钟 C8 也是差分对的 P 端。全部按**单端**使用，XDC 里显式写单端 `IOSTANDARD` 即可；**工程中不能有残留的差分对约束**，否则 DRC 冲突。
3. **AD16 带 `DQS` 标记**（`IO_L15P_T2_DQS_12`）：该类球设计上可作数据选通，同时也能当普通 I/O。当前用途无冲突，日后复用需留意。
4. **`PUDC_B` 影响配置期间的内部上拉**：若被拉低，配置期间 PL 的 I/O 无内部上拉。本方案没有输入信号，此项**不再影响功能**。

### 复位已有按键方案的痕迹

源文档特别标了一笔：早期版本描述的是「只驱动 H1、每 10 秒翻转、顶层 3 个端口」，与当前的 `relay_ctrl.v` / `relay_top.xdc`（**4 路、每 3 秒、6 个端口**）不一致。若照旧版本操作会漏约束 relay2/3/4，导致比特流生成失败（NSTD-1 / UCIO-1）。

## tcl 脚本

### 引脚反查：`pin_lookup.tcl`

用途是**只读地**打开器件库、反查 Zynq-7000 的引脚名对应哪个封装球。它查的目标是两个备用引脚（`IO_L4P_T0_34` / `IO_L4N_T0_34`），并对三个 part 变体逐个尝试：

```tcl
# Look up the package ball for Zynq-7000 pin names on xc7z035 packages.
# Run:  vivado -mode batch -source pin_lookup.tcl
# Read-only: loads the part database, links the part, prints package pins.

set targets {IO_L4P_T0_34 IO_L4N_T0_34}

foreach part {xc7z035ffg676-2 xc7z035ffg900-2 xc7z035fbg676-2} {
    puts "=============================================="
    puts "PART: $part"
    puts "=============================================="
    if {[catch {link_design -part $part -name probe_$part} err]} {
        puts "  link_design failed: $err"
        continue
    }

    # Overall sanity + bank info for every pin we care about
    foreach nm $targets {
        set hit 0
        foreach p [get_package_pins -quiet *] {
```

完整脚本末尾还有 I/O site 数量统计（`get_sites -filter {SITE_TYPE =~ "IO_*"}`）和 `puts "DONE"`，这里只截了前面的引脚匹配部分。脚本自己也强调是 read-only：**加载器件数据库、link part、打印封装引脚，不改任何设计文件**。

### 一键自检：`relay_selfcheck.tcl`

这个脚本解决的是一个具体的分流问题：**「继电器没反应」时，先把「设计/约束有问题」和「板上硬件有问题」分开。** 它会真的跑一遍综合 + 实现 + 生成比特流，并打印引脚、时钟、时序余量、以及 NSTD-1 / UCIO-1 这类"端口未约束"DRC。

跑法：

```text
cd /d D:\A_DSH\relay
vivado -mode batch -source relay_selfcheck.tcl
```

结果怎么判读，脚本头部写得很直白：

```tcl
# =============================================================================
# 一键自检脚本 —— 确认"这份 RTL + XDC 到底能不能生成比特流"
#
# 用途：当"继电器没反应"时，先把"设计/约束问题"和"板上硬件问题"分开。
#       本脚本会真的跑一遍综合+实现+生成比特流，并打印引脚、时钟、
#       时序余量、以及 NSTD-1 / UCIO-1 这类"端口未约束"DRC。
#
# 运行：
#   cd /d D:\A_DSH\relay
#   vivado -mode batch -source relay_selfcheck.tcl
#
# 结果判读：
#   * 最后打印 "BITSTREAM GENERATED OK"  -> 设计侧没问题，故障在板上硬件链路
#     请直接改看 relay_multimeter_test.md（重点量 5V 供电和 UL3 pin9 的 GND）
#   * 报 NSTD-1 / UCIO-1                -> 有端口没约束，比特流根本没生成成功
#   * 综合/实现直接 FAILED              -> 看具体报错
#
# 产物全部落在本目录的 _selfcheck_build\ 下，不会碰你现有的 Vivado 工程。
# =============================================================================
```

脚本主体分四段，每段的判读标准都写在输出里：

```tcl
puts "==================== 端口与约束 ===================="
set nports [llength [get_ports *]]
puts "顶层端口数: $nports  （应为 6：clk / relay1~4 / led_heart）"
foreach p [lsort [get_ports *]] {
    set pin  [get_property PACKAGE_PIN [get_ports $p]]
    set iost [get_property IOSTANDARD [get_ports $p]]
    if {$pin eq ""} { set pin "<未约束!>" }
    if {$iost eq ""} { set iost "<未约束!>" }
    puts [format "  %-10s PACKAGE_PIN=%-9s IOSTANDARD=%s" $p $pin $iost]
}

puts "==================== 时钟 ===================="
foreach c [get_clocks -quiet *] {
    puts "  [get_property NAME $c]  period=[get_property PERIOD $c] ns"
}

puts "---- 关键寄存器是否被优化掉 ----"
foreach r {div_cnt_reg relay_state_reg heart_reg} {
    if {[llength [get_cells -quiet -hier -filter "NAME =~ *$r*"]]} {
        puts "  存在   $r"
    } else {
        puts "  丢失   $r   <-- 被综合器优化掉了，翻转周期会不对"
    }
}

puts "==================== 约束 DRC ===================="
foreach v [get_drc_violations -quiet -name *] {
    set sev  [get_property SEVERITY $v]
    set rule [get_property RULE $v]
    puts "  \[$sev\] $rule"
    puts "        [get_property DESCRIPTION $v]"
}

puts "==================== 时序 ===================="
puts "  最差建立余量 WNS = [get_property SLACK [get_timing_paths -delay_type max -max_paths 1]] ns"

puts "==================== 比特流 ===================="
set bitfile [file join $workdir relay_top.bit]
if {[catch {write_bitstream -force $bitfile} err]} {
    puts "!!! 生成比特流失败: $err"; exit 1
}
puts "BITSTREAM GENERATED OK"
puts "  -> $bitfile"
puts "  文件大小: [file size $bitfile] 字节"
```

两点注意：中间还有 `synth_design -top relay_top -part xc7z035ffg676-2`，以及 `foreach step {opt_design place_design route_design}` 这一步一步的实现流程；产物全部落在 `_selfcheck_build\` 下，不碰现有工程。

## 上板验证

### 第 1 步：先看心跳灯

下载比特流后，第一件事不是听继电器，而是看板上 LED（V18）。

`led_heart = heart[26]`，即每 **0.67 秒**翻转一次 → 表现为**约 0.75 Hz 的闪烁**（亮 0.67s / 灭 0.67s，一个完整明暗周期约 1.34 秒）。

- **不闪** → 时钟有问题（C8 没接对 / 晶振没起振 / LED 球号错），**先解决这个，别往下走**
- **闪** → PL 配置成功、100 MHz 时钟正常、V18 引脚正确

这一步同时验证三件事：比特流下载成功、100 MHz 时钟在跑、LED 球号正确。有了它，后面「继电器不动」就能立刻排除时钟和配置问题，直接锁定输出链路。

> ⚠️ **闪 ≠ 你的设计在跑！** 只看 LED 无法区分「当前这份新比特流」和「上一次的旧比特流」。请务必核对 Vivado 日志里下载的 `.bit` 文件路径与时间戳，确认它就是刚生成的那一个。

### 第 2 步：观察四只继电器

下载完成后**立即开始自动翻转**，无需任何操作。三种观察方式，源文档建议**至少用第二种**：

**方式 a：听声音（最直接）**

- 应该听到规律节奏：四只**同时**「嗒」…（静 3 秒）…「嗒」…（静 3 秒）…「嗒」
- 每 3 秒翻转一次，一个完整通断周期 6 秒
- ⚠️ 信号继电器（HFD4/5）的「嗒」声**很轻**，环境稍吵就可能听不见 —— **听不到不等于没动作**

**方式 b：万用表测触点（最可靠，推荐）**

- 万用表打到**通断档（蜂鸣）**或**电阻档**，表笔接 H1 的 `R_COM1` 和 `R_NO1`
- 应观察到：导通约 3 秒 → 断开约 3 秒 → 导通约 3 秒 …… 循环
- 用电阻档能同时看出阻值：导通时接近 0 Ω，断开时开路
- 同样方法测 H2/H3/H4（`R_COM2↔R_NO2` 等），四路应完全同步

**方式 c：示波器（最直观）**

- 探针接 **AC11 对应的连接器脚 B23**，或 UL3 的 **pin1 (1B)**：应看到**周期 6 秒的方波**（高 3 秒 / 低 3 秒）
- 再探 UL3 的 **pin18 (1C)**：与 B23 **相位相反**（ULN2003 是反相驱动）

## 万用表实测记录

当「LED 正常闪烁，但继电器不响」时，就用这一节。LED 闪 = PL 配置成功 + 100 MHz 时钟正常 → 问题一定在**输出链路**上，沿着链一级一级往下量，哪一级断了立刻定位。

### 安全前提与档位

| 测量内容 | 档位 |
|---|---|
| 控制信号电平 | **直流电压档 (V⎓)**，量程 20V 或自动 |
| `R_COM ↔ R_NO` 触点 | **通断档（蜂鸣）** 或 **电阻档 200Ω~2k** |
| 继电器线圈 | **电阻档 200Ω 或 2kΩ** |
| 5V 供电 | **直流电压档**，量程 20V |

- 本流程**只在触点侧空载时进行**（不接任何外部负载）
- 如果触点接了负载，**先断开**再测
- 表笔不要同时碰 GND 和 VCC5V，避免短路
- 测电阻（线圈）时**必须断电**再测

<div class="shot-placeholder"><strong>截图待补</strong>：这里需要一张万用表直流电压档测 B23 控制信号的照片（来源：万用表实测），读数应在 0V ←→ 3.3V 之间每 3 秒切换。</div>

### 断电测（先做，最容易发现问题）

**1.1 目视 + 通断检查焊接**：H1~H4 四个继电器、UL3 的引脚有没有明显虚焊、连锡、翘脚。

**1.2 测继电器线圈电阻（关键一步，断电做）**：红黑表笔分别接继电器**线圈的两个引脚**（HFD4/5 是 pin1 与 pin8）。

| 读数 | 判断 |
|---|---|
| **约 150~200 Ω** | 线圈完好 ✅ 继续往下 |
| **几十 Ω** | 异常，可能不是 5V 型或已损坏 |
| **开路（OL / 1）** | **线圈断线或虚焊** ❌ 这只继电器坏了，或该脚没焊上 |
| **接近 0 Ω** | 线圈短路 ❌ 坏了 |

先把 4 只都测一遍，**如果有某一只是开路，基本就是它了**。这一步在断电时做，不依赖 FPGA，能最快排除硬件损坏。

**1.3 测连接器到 ULN 输入的通路（断电做）**：

- 一支表笔按在**核心板连接器的 B23 脚**，另一支按 **UL3 的 pin1 (1B)** → 应蜂鸣（导通）
- B24→pin2、B25→pin3、B26→pin4 同理
- 不导通 → 底板走线断/虚焊，信号根本到不了 ULN

### 上电测（下载比特流后，四路每 3 秒同时翻转）

四路是**同相位**的，波形应该完全一致。**哪一路读数与其他三路不一样，哪一路就有问题。**

**2.1 先确认 5V 供电**（继电器线圈的能量来源）：黑表笔接 **GND**，红表笔接 **UL3 的 pin10 (COM)** 或**继电器线圈的 + 端**，应读到 **5V 左右（4.75~5.25V）**。

> **如果读到 0V** → 底板 5V 没供电 / 保险丝断 / 电源开关没开 → **继电器永远不会响**，这是首要怀疑对象。

**2.2 量 FPGA 控制信号**（判断 FPGA 有没有真的输出）：黑表笔接 **GND**，红表笔接**核心板连接器的 B23 脚**（对应 H1），应观察到**约 3.3V ←→ 约 0V，每 3 秒切换一次**。

| 读数 | 判断 |
|---|---|
| 0V ←→ 3.3V 交替 | ✅ FPGA 正常输出，继续往下 |
| 恒 0V 或恒 3.3V | ❌ FPGA 没输出 / 引脚错 / 该球被别的东西占用 |
| 中间值（1~2V） | 异常，可能是引脚冲突或驱动不足 |

同样方法量 **B24、B25、B26**（对应 H2/H3/H4）。四路都应该一模一样地翻转；有某一路不动，问题在 FPGA 侧或连接器。

**2.3 量 ULN2003 的输入脚**（确认信号进了芯片）：红表笔接 **UL3 的 pin1 (1B)**、黑表笔接 GND，应同样看到 0V ←→ 3.3V，每 3 秒切换；pin2/3/4 同理。

| 对比 | 判断 |
|---|---|
| 与 2.2 读数一致 | ✅ 信号正常进芯片 |
| 2.2 有翻转但这里没有 | ❌ 连接器到 ULN 之间的走线断（回到 1.3 复查） |

**2.4 量 ULN2003 的输出脚（最关键的一步）**：黑表笔接 **GND**，红表笔接 **UL3 的 pin18 (1C)**，应看到**低 ←→ 高**交替，每 3 秒一次。

| pin18 读数 | pin1 (输入) 读数 | 判断 |
|---|---|---|
| **约 1V ←→ 约 5V 交替** | 0V ←→ 3.3V 交替 | ✅ 芯片工作正常，问题在继电器或线圈 → 回到 1.2 |
| 约 1V ←→ 约 5V 交替 | **不翻转** | ❌ 输入侧没信号，回 2.3 |
| **恒 5V 不变** | 0V ←→ 3.3V 交替 | ❌ **该通道没导通**（输出一直悬空）：芯片坏 / 该通道坏 / **pin9 GND 没接好** |
| **恒低（≈0~1V）不变** | — | ❌ 输出被持续拉低（管子击穿短路），或该路被别的东西一直驱动 |

读数解读要点：

- **吸合时**输出被拉到地，但达林顿管有饱和压降，所以是**约 0.9~1.2V 而不是严格 0V**，这是正常的，不要误判成「没导通」
- **释放时**由于线圈另一端接 5V、且线圈无电流，输出脚被线圈「提」到**约 5V**
- 所以「**在 1V 和 5V 之间来回跳**」才是健康波形
- 前提是**线圈接着且没断线**；如果线圈开路，输出脚悬空，读数会漂、不可信

同样量 **pin17 (2C)、pin16 (3C)、pin15 (4C)**。**四路对比**：3 路在跳、1 路恒 5V 不变 → **那一通道坏了**；**四路全部恒 5V 不变** → 几乎可以断定是**共性原因**：**UL3 的 pin9 (GND) 没接好**（芯片没有参考地，四个通道一起失效），或 5V 供电缺失。

**2.5 量线圈两端的电压**（直接看继电器有没有得电）：红表笔接线圈 **+ 端（pin1）**、黑表笔接线圈 **− 端（pin8）**，继电器吸合时应读到**约 5V**，断开时约 0V，每 3 秒切换。

| 读数 | 判断 |
|---|---|
| 0V ←→ 5V 交替 | ✅ 线圈有电但还不响 → **继电器本体机械故障**，需更换 |
| 恒 0V | ❌ 线圈没得电，回到 2.1（5V 供电）和 2.4（ULN 输出） |
| 恒 5V | ❌ ULN 没把另一端拉低 |

### 测触点（判断继电器是否真的切换）

- 万用表打**通断档（蜂鸣）**，表笔接 H1 的 **`R_COM1`** 和 **`R_NO1`**（或直接接继电器对应触点引脚）
- 应观察到：**导通约 3 秒 → 断开约 3 秒 → 导通约 3 秒**，循环

| 现象 | 判断 |
|---|---|
| 通断交替 | ✅ 继电器正常工作（那你之前是没听到声音而已，可能环境吵） |
| **恒断开（一直不通）** | 两种可能：① 线圈没得电（吸合不了）② 触点坏了 |
| **恒导通（一直通）** | 触点粘连 ❌ 换继电器 |

用**电阻档**代替通断档能看到具体阻值：导通时应接近 0Ω，断开时开路。触点粘连时电阻档会显示一个小的恒定阻值。

### 结论对照表（按量测结果直接定位）

| FPGA (B23) | ULN 输入 | ULN 输出 | 线圈电压 | 触点 | 结论 |
|---|---|---|---|---|---|
| 翻转 | 翻转 | 翻转 | 翻转 | 通断交替 | **全都正常**，可能只是没听见声音 |
| 翻转 | 翻转 | 翻转 | 翻转 | **恒断开** | **继电器本体坏**（更换 H1） |
| 翻转 | 翻转 | 翻转 | 翻转 | 恒导通 | 触点粘连（更换） |
| 翻转 | 翻转 | **恒 5V** | 恒 0V | 恒断开 | **ULN2003 该通道坏**（更换 UL3） |
| 翻转 | 翻转 | 翻转 | 恒 0V | 恒断开 | **5V 供电异常**（查电源/保险） |
| 翻转 | **不翻转** | — | — | — | **连接器到 ULN 走线断** |
| **不翻转** | 不翻转 | — | — | — | FPGA 侧问题（引脚/约束/冲突） |

### 四只同时驱动带来的排查便利

- **四只都响** → 硬件都好，之前可能是环境噪音盖过了声音
- **三只响、一只不响** → 不响的那只（或其 ULN 通道）有问题，用它对应的那一路做 2.4/2.5 定位
- **都不响** → 大概率是**共性问题**：5V 供电、ULN 的 GND(pin9) 没接、或底板连接器没插紧

**常见根因排序**（源文档按经验概率给出的顺序）：

1. **5V 电源没上 / 底板没供电** —— 最容易被忽略，先量 2.1
2. **UL3 的 pin9 (GND) 虚焊** —— 芯片没参考地，输出拉不低，所有通道一起失效
3. **继电器线圈虚焊 / 某只线圈断** —— 用 1.2 断电测电阻最快定位
4. **ULN2003 单通道损坏** —— 只影响一路，其余正常
5. **连接器没插紧 / 某脚虚接** —— 影响某一路或全部
6. **继电器本体机械卡死** —— 线圈有电但不动，需更换

## 踩过的坑

**1. 顶层 6 个端口只约束了 3 个 → LED 在闪、继电器毫无反应。**
这是最容易踩的一个。综合能过，**但 `Generate Bitstream` 会被 NSTD-1 / UCIO-1 拦住**。如果你在 DRC 弹窗上点了 "Cancel"，就会继续用上一次的旧比特流做实验 —— 现象正好是 LED 在闪、继电器毫无反应。遇到这个现象请先回查约束。

**2. 把「心跳灯闪」当成了「我的新设计在跑」。**
闪只能证明 PL 在跑，区分不了新旧比特流。必须核对 Vivado 日志里 `.bit` 的路径与时间戳。

**3. 把心跳灯频率算错了，差点以为时钟慢了一半。**
早期文档写「0.37 Hz、亮 1.34s / 灭 1.34s」，是忘了 `heart[26]` 一翻转只是半个周期。实际是 0.67s 一翻转。这次连 XDC 里的旧注释也还留着这个错数，要以上面的更正为准。

**4. 看到 ULN2003 输出脚恒 5V，误判成「电路正常」。**
恰恰相反——恒 5V 意味着该通道一直悬空、根本没导通。健康的波形是 **1V ←→ 5V 来回跳**。早期文档写成「0V ←→ 5V」加剧了这个误判。

**5. 忘记 ULN2003 是反相的，把极性搞反了。**
FPGA 输出 1 = 吸合；输出脚电压低 = 吸合。两个都跟直觉相反。这一条如果搞反，后面所有排查的推理都会反过来。

**6. 以为需要外接续流二极管。**
不需要。ULN2003 的续流二极管是芯片内置的，COM (pin10) 接 VCC5V、GND (pin9) 接地即符合标准接法。

**7. 听不到「嗒」声就以为继电器没动作。**
HFD4/5 是信号继电器，声音很轻，环境稍吵就听不见。听不到必须用万用表通断档确认，别停在「听」这一步。

**8. 残留的差分对约束。**
AC11/AB12 是 `L2` 差分对、AD15/AD16 是 `L15` 差分对，现在当 4 个独立单端 IO 用。工程里若有针对这两对的旧约束，必须先删除，否则 DRC 冲突。

**9. 差点照着旧版本的端口清单去约束。**
旧版本是「只驱动 H1、每 10 秒翻转、顶层 3 个端口」，照着做会漏约束 relay2/3/4，直接触发 NSTD-1 / UCIO-1。

## 下一步

- **把「设计侧」和「硬件侧」彻底分开**：先跑一遍 `relay_selfcheck.tcl`。打印出 `BITSTREAM GENERATED OK` 就说明设计没问题，故障在板上硬件链路，直接改看万用表流程（重点量 5V 供电和 UL3 pin9 的 GND）。
- **确认触点侧要接什么负载**：这决定是否需要 RC 吸收 / 保护。若切真实负载，先查 HFD4/5 的触点额定值——它是信号继电器，容量很小。
- **查清 NC 触点的走线**：源文档记录「NC 触点疑似悬空（待 PCB 版图核实）」，这是一个还没闭合的硬件疑问。
- **确认器件型号与速度等级**：`xc7z035ffg676-2`，速度等级如果是 `-1` 或 `-3` 要改过来（选错不影响球号，但影响时序）。这一条与 frontmatter 里写的板型对不上，见文首的待办。
- **可选：固化到板子独立运行**。只有需要「脱离 JTAG 上电即跑」时才做 `Create Boot Image`（FSBL + bitstream）→ 需要 Vitis 编译一次 FSBL，但**仍然不需要写任何 C 应用代码**。如果只要求「下载看现象」，这一步可以完全跳过。

## 上板前待确认清单

- [ ] 器件型号确认为 `xc7z035ffg676-2`
- [ ] 继电器触点侧负载确认（安全前提）
- [ ] XDC 中 **6 个**球号（C8/AC11/AB12/AD15/AD16/V18）与引脚表逐条核对
- [ ] 工程中无残留差分对约束
- [ ] 顶层端口共 **6 个**（`clk`/`relay1`~`relay4`/`led_heart`），**无未约束端口**
- [ ] 已删除 `btn_k1` 端口与 H7 约束
- [ ] `Generate Bitstream` 日志里**没有** NSTD-1 / UCIO-1 报错
- [ ] 下载的 `.bit` 时间戳 = 刚生成的那一个（不是上一次的旧比特流）
- [ ] 已量过 **VCC5V**（UL3 pin10 / 线圈+端 ≈ 5V），以及 **UL3 pin9 的 GND** 是否导通
- [ ] H1~H4 的 NC 触点是否悬空（查 PCB 版图走线）
- [ ] 观察手段准备好（万用表 / 耳朵 / 示波器）
