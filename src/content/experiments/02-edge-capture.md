---
title: "实验一：数字 I/O 边沿捕获"
description: "第一个真正的时序逻辑实验：用两级同步器把异步数字输入打拍，在 100 MHz 时钟下捕获外部上升沿并翻转 OC5。"
date: 2026-09-17
order: 2
stage: "基础"
status: "已完成"
board: "Zynq-7035 核心板 + 自制 AD/DA 底板"
tools: ["Vivado", "Icarus Verilog", "信号发生器", "示波器"]
tags: ["Zynq", "数字I/O", "边沿检测", "仿真"]
accent: "purple"
diagram: "wave"
draft: false
sample: false
---

## 这个实验要解决什么问题

前面的点灯与继电器实验先验证输出通路；这个实验开始处理外部异步输入。难点在于——外部输入是**异步**的，你不知道它什么时候跳变，它可能在任何时刻、包括正好在时钟上升沿的那一瞬间到来。

所以这个实验其实要干三件事：

1. 把异步的外部输入**安全地引入 100 MHz 时钟域**（两级同步器打拍）。
2. 用组合逻辑找出"**这一拍和上一拍不一样**"的那个瞬间，并且只保留一个时钟周期。
3. 只对**外部输入意义上的上升沿**做动作：翻转一路数字输出。

还有一层容易栽跟头的细节：这条信号链上前后共反相了两次（输入隔离器一次、输出驱动一次），所以 FPGA 管脚上看到的边沿方向，和你在示波器、信号发生器那一侧说的"上升沿"，是**反的**。

## 硬件通道与适配范围

| 功能 | 底板网络 | 底板到核心板 | FPGA 管脚 | I/O 标准 |
|---|---|---|---|---|
| 100 MHz PL 时钟 | PL_CLK | 核心板板载晶振 | C8 | SSTL135 |
| Input channel 5 | F_IN5 | HT1-B27 | AC16 | LVCMOS33 |
| Output channel 5 | F_OC5 | HT1-A36 | AC24 | LVCMOS33 |

下面保留这份实验工程的引脚与电平约束。C8 在继电器工程里记为 `LVCMOS33`，本工程记为 `SSTL135`；实际使用前须核对核心板版本、Bank 供电和时钟输入电平，不能为消除 DRC 随意替换 IOSTANDARD。Vivado 的实际版本未记录。

时钟周期由约束文件里的 `create_clock -name clk_100m -period 10.000` 定义，也就是 10 ns / 100 MHz——后面"脉冲只有一个时钟周期宽"指的就是 10 ns。

### 50 针 SCSI1 上的相关引脚

| SCSI1 引脚 | 网络 | 本实验里接什么 |
|---|---|---|
| 40 | IN5_P | 信号发生器 OUT |
| 15 | IN5_N | 信号发生器 GND |
| 17 | OC_VCC1 | 与底板 GND 共地的 3.3 V 或 5 V 电源（OC1~OC8 板载 1 kΩ 上拉电源） |
| 22 | OC5 | 示波器探头尖端 |
| 29 | GND | 示波器地夹 |

> 请在实际接线前，根据连接器外壳、丝印或转接板再次确认 pin 1 方向，避免按镜像方向数脚。

## 重要极性：链路上反相了两次

这是整个实验最容易搞错、也最值得先记住的部分：

| 环节 | 器件 | 反相关系 | 在管脚/网络上表现为 |
|---|---|---|---|
| 输入 | ACSL-6400 隔离器 | 反相 | 外部 IN5 **上升沿** → FPGA 的 F_IN5（AC16）**下降沿** |
| 输出 | ULN2803 | 反相 | F_OC5 = 1 → 物理 OC5 **被拉低**；F_OC5 = 0 → OC5 通过板载 1 kΩ 电阻**上拉到 OC_VCC1** |

也就是说，从外部端口这一侧看，输入和输出各被翻了一次：

- 外部 IN5 上升沿 = 管脚 `f_in5_n` 下降沿；
- FPGA 内部 `f_oc5` = 1 的时候，外部量到的 OC5 反而是低电平。

RTL 已经对输入的反相做了补偿：`rise_pulse` / `fall_pulse` 表示的是**外部输入意义上的**上升沿和下降沿，不是管脚上的边沿方向。看 ILA 波形的时候要一直记着这句话，否则会以为边沿检测没工作。

## 边沿检测原理：两级同步 + 打一拍比较

异步输入不能直接进时序逻辑，第一步先打两拍：

- `in_meta <= f_in5_n`，第一级；`in_sync <= in_meta`，第二级。两级都标了 `ASYNC_REG`。
- `in_level = ~in_sync`，把"板内低有效"还原成"外部输入逻辑"：外部 IN5 有效/高电平 → `f_in5_n` 为低 → `in_level` 为高。
- `in_level_d` 把 `in_level` 再打一拍，于是"当前电平"和"上一拍电平"可以在同一个时钟沿上比较。

边沿就藏在两者的差里，而且是组合逻辑写完立刻被时钟采走，所以脉冲宽度天然就是一个时钟周期：

- 上升沿：`rise_pulse <= in_level & ~in_level_d`
- 下降沿：`fall_pulse <= ~in_level & in_level_d`

代价是延迟：管脚上的边沿要经过 3 个时钟沿才会变成脉冲——第 1 个沿进 `in_meta`、第 2 个沿进 `in_sync`、第 3 个沿产生脉冲，也就是 20~30 ns 的固有延迟（取决于边沿落在两个时钟沿之间的什么位置）。

<figure class="diagram">
  <svg viewBox="0 0 720 320" role="img" aria-label="边沿检测时序图：clk_100m、管脚 f_in5_n、两级同步寄存器 in_meta 与 in_sync、延迟电平 in_level_d、单周期 rise_pulse 与 fall_pulse、以及 out_state 的翻转关系">
    <g stroke="currentColor" stroke-width="2" opacity="0.18" stroke-dasharray="4 6" fill="none">
      <line x1="480" y1="16" x2="480" y2="308" />
      <line x1="620" y1="16" x2="620" y2="308" />
    </g>
    <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
      <polyline points="130,24 165,24 165,36 200,36 200,24 235,24 235,36 270,36 270,24 305,24 305,36 340,36 340,24 375,24 375,36 410,36 410,24 445,24 445,36 480,36 480,24 515,24 515,36 550,36 550,24 585,24 585,36 620,36 620,24 655,24 655,36 690,36" />
      <polyline points="130,62 298,62 298,74 430,74 430,62 690,62" />
      <polyline points="130,100 340,100 340,112 480,112 480,100 690,100" />
      <polyline points="130,138 410,138 410,150 550,150 550,138 690,138" />
      <polyline points="130,188 480,188 480,176 620,176 620,188 690,188" />
      <polyline points="130,226 480,226 480,214 550,214 550,226 690,226" />
      <polyline points="130,264 620,264 620,252 690,252 690,264" />
      <polyline points="130,302 480,302 480,290 690,290" />
    </g>
    <g fill="currentColor" font-size="12">
      <text x="8" y="40">clk_100m</text>
      <text x="8" y="78">f_in5_n</text>
      <text x="8" y="116">in_meta</text>
      <text x="8" y="154">in_sync</text>
      <text x="8" y="192">in_level_d</text>
      <text x="8" y="230">rise_pulse</text>
      <text x="8" y="268">fall_pulse</text>
      <text x="8" y="306">f_oc5</text>
    </g>
    <g fill="currentColor" font-size="11" opacity="0.85">
      <text x="302" y="58">外部 IN5 上升沿</text>
      <text x="440" y="58">外部 IN5 下降沿</text>
      <text x="486" y="210">rise_pulse：1 个时钟周期</text>
      <text x="498" y="248">fall_pulse：1 个时钟周期</text>
      <text x="500" y="284">out_state 在此翻转</text>
    </g>
  </svg>
  <figcaption>图 1：边沿检测时序。100 MHz 时钟下，异步管脚 f_in5_n 先经 in_meta、in_sync 两级打拍，再由 in_level = ~in_sync 还原成外部极性；in_level 与它的延迟版本 in_level_d 比较出只保持 1 个时钟周期（10 ns）的 rise_pulse / fall_pulse，out_state 只在上升沿脉冲出现的那个时钟沿翻转。图中这一刻外部上升沿（在管脚 f_in5_n 上表现为下降沿）落在两个时钟沿之间，对应的延迟约 2.6 个时钟周期（约 26 ns），是“20~30 ns 固有延迟”里的一个取值。</figcaption>
</figure>

## RTL 代码讲解

顶层很小，但它把整个实验的四件事都放进去了：同步、极性还原、边沿提取、输出翻转。

```verilog
`timescale 1ns / 1ps

// 实验1：数字输入边沿捕获，并在外部输入上升沿到来时翻转数字输出状态。
//
// 硬件对应：
//   f_in5_n : Baseboard F_IN5 (IC2/IG2 channel 1), FPGA pin AC16.
//             输入隔离器 ACSL-6400 会反相，因此外部 IN5 上升沿表现为该管脚下降沿。
//   f_oc5   : Baseboard F_OC5, FPGA pin AC24.
//             ULN2803 also inverts: f_oc5=1 pulls physical OC5 low;
//             f_oc5=0 lets physical OC5 be pulled up through the board resistor.
module edge_capture_top (
    input  wire clk_100m,
    input  wire f_in5_n,
    output wire f_oc5
);

    // 两级同步器：异步外部输入不能直接用于时序逻辑。
    // IN5 未加有效电压时，隔离器输出通常为高，因此初始化为 1。
    (* ASYNC_REG = "TRUE" *) reg in_meta = 1'b1;
    (* ASYNC_REG = "TRUE" *) reg in_sync = 1'b1;

    // 将板内低有效信号还原成“外部输入逻辑”：
    // 外部 IN5 有效/高电平 -> f_in5_n 低 -> in_level 高。
    (* MARK_DEBUG = "TRUE" *) wire in_level = ~in_sync;

    reg in_level_d = 1'b0;
    (* MARK_DEBUG = "TRUE" *) reg out_state = 1'b0;

    // 保留这两个寄存器，后续接 ILA 时可直接观察。
    (* KEEP = "TRUE", MARK_DEBUG = "TRUE" *) reg rise_pulse = 1'b0;
    (* KEEP = "TRUE", MARK_DEBUG = "TRUE" *) reg fall_pulse = 1'b0;
```

下面这一段是核心，四行非阻塞赋值加一个 `if`：

```verilog
    always @(posedge clk_100m) begin
        in_meta <= f_in5_n;
        in_sync <= in_meta;

        // 每个事件脉冲仅保持一个 100 MHz 时钟周期（10 ns）。
        rise_pulse <=  in_level & ~in_level_d;
        fall_pulse <= ~in_level &  in_level_d;
        in_level_d <= in_level;

        // 接收到外部数字输入上升沿后，翻转输出状态。
        if (in_level & ~in_level_d)
            out_state <= ~out_state;
    end

    assign f_oc5 = out_state;

endmodule
```

有两点值得单独说：

- `if (in_level & ~in_level_d)` 和 `rise_pulse <= in_level & ~in_level_d` 是同一个条件，所以 `out_state` 的翻转和 `rise_pulse` 的拉高发生在**同一个时钟沿**上；这也正是图 1 里两根波形同时动的原因。
- 脉冲只维持一拍，是因为它在时钟沿上被赋值、下一个时钟沿就被新的比较结果覆盖掉了。`KEEP` 用于保留中间网络便于观察，`MARK_DEBUG` 标记后续要接入 ILA 的信号；脉冲一拍宽是 RTL 更新条件决定的，不是由这些属性保证的。

### 复位初值不是随手写的

`in_meta` / `in_sync` 初始化为 1，`in_level_d` 初始化为 0，`out_state` 初始化为 0，`rise_pulse` / `fall_pulse` 初始化为 0。这几个初值之间是配套的：

- IN5 未加有效电压时，隔离器输出通常为高，所以同步器初值取 1；
- `in_level = ~in_sync` 的初值因此是 0，和 `in_level_d` 的初值 0 一致，上电瞬间 `in_level & ~in_level_d` 不成立，不会凭空产生一次 `rise_pulse`，也就不会白白翻转一次输出；
- `out_state` 初值 0，经 ULN2803 反相后，外部 OC5 在刚上电时是被 1 kΩ 上拉到高电平的。

## Testbench 与仿真结果

测试平台用 Icarus Verilog 编译运行，思路是"只造外部意义上的边沿，剩下交给 DUT"：

```verilog
`timescale 1ns / 1ps

module tb_edge_capture_top;
    reg  clk_100m = 1'b0;
    reg  f_in5_n  = 1'b1; // 外部输入低/无效时，隔离器输出为高
    wire f_oc5;

    integer rise_count = 0;
    integer fall_count = 0;

    edge_capture_top dut (
        .clk_100m(clk_100m),
        .f_in5_n (f_in5_n),
        .f_oc5   (f_oc5)
    );

    always #5 clk_100m = ~clk_100m;

    always @(posedge clk_100m) begin
        if (dut.rise_pulse) rise_count <= rise_count + 1;
        if (dut.fall_pulse) fall_count <= fall_count + 1;
    end

    task external_rising_edge;
        begin
            // 外部上升沿经过反相隔离器后，FPGA 管脚变为低。
            #37 f_in5_n = 1'b0;
        end
    endtask

    task external_falling_edge;
        begin
            // 外部下降沿经过反相隔离器后，FPGA 管脚恢复为高。
            #43 f_in5_n = 1'b1;
        end
    endtask
```

激励和判定：

```verilog
    initial begin
        $dumpfile("edge_capture_top.vcd");
        $dumpvars(0, tb_edge_capture_top);

        #100;
        external_rising_edge();  // 第1个外部上升沿：输出翻转为1
        #100;
        external_falling_edge(); // 外部下降沿：输出不翻转
        #100;
        external_rising_edge();  // 第2个外部上升沿：输出翻转为0
        #100;
        external_falling_edge();
        #100;

        if (rise_count !== 2 || fall_count !== 2) begin
            $display("FAIL: rise_count=%0d, fall_count=%0d", rise_count, fall_count);
            $finish_and_return(1);
        end

        if (f_oc5 !== 1'b0) begin
            $display("FAIL: f_oc5=%b, expected 0", f_oc5);
            $finish_and_return(1);
        end

        $display("PASS: captured 2 rising edges and 2 falling edges; output toggled on rising edges only.");
        $finish;
    end
endmodule
```

### 关键设计：37 / 43 ns 这两个数

`#37` 和 `#43` 都不是随便写的，也不是 50 的整数倍——目的就是让管脚上的边沿**落在两个时钟沿之间**，模拟真实世界里异步信号到来的样子。`always #5 clk_100m = ~clk_100m` 给出的是一半 5 ns、周期 10 ns 的 100 MHz 仿真时钟。

按 tb 的延时推一下，外部边沿出现在这些时刻（时钟上升沿每 10 ns 一个）：

| 时刻 | 事件 | 是否落在时钟沿上 |
|---|---|---|
| 137 ns | 第 1 个外部上升沿（`f_in5_n` 拉低） | 否，在两个上升沿 135 与 145 ns 之间 |
| 280 ns | 第 1 个外部下降沿（`f_in5_n` 拉高） | 在时钟下降沿，不在采样上升沿 |
| 417 ns | 第 2 个外部上升沿 | 否 |
| 560 ns | 第 2 个外部下降沿 | 在时钟下降沿，不在采样上升沿 |
| 660 ns | 检查计数与最终输出 | — |

`clk_100m` 初值为 0，每 5 ns 翻转，所以采样上升沿位于 5、15、25…ns；两次输入下降沿落在时钟下降沿。上述时间由激励推算，不能当作实测日志；数字 RTL 仿真也不会自动模拟真实亚稳态。

### 仿真输出里能直接读到什么

原实验工程中的 `edge_capture_tb.out` 是 vvp 的编译产物（文件头是 `:ivl_version "12.0"`），不是仿真运行日志，但它能佐证 tb 的时序意图：

```text
:ivl_version "12.0 (devel)" "(s20150603-1539-g2693dd32b)";
...
S_... .scope task, "external_rising_edge" ...;
    %delay 37000, 0;
    %pushi/vec4 0, 0, 1;
S_... .scope task, "external_falling_edge" ...;
    %delay 43000, 0;
    %pushi/vec4 1, 0, 1;
...
%vpi_call/w ... "$display", "PASS: captured 2 rising edges and 2 falling edges; output toggled on rising edges only."
```

- `%delay 37000` / `%delay 43000` 对应 tb 里的 `#37` / `#43`；
- 时钟线程里是 `%delay 5000` 翻转一次，即 100 MHz；
- 编译进去的 PASS 字符串就是上面那句。

已有工程测试说明记载：捕获 2 次外部上升沿、2 次外部下降沿，输出只在上升沿翻转。本文保留的是编译产物片段，未附完整运行日志，不能仅凭其中的 PASS 字符串认定本次运行通过；下表列出 testbench 的预期判定：

| 检查项 | testbench 期望值 | 依据 |
|---|---|---|
| `rise_count` | 2 | tb 里调用了两次 `external_rising_edge()` |
| `fall_count` | 2 | tb 里调用了两次 `external_falling_edge()` |
| `f_oc5`（结束时） | 0 | 输出只在上升沿翻转，翻转两次后回到 0 |
| 退出状态 | 0 | 任一检查失败走 `$finish_and_return(1)` |

## Vivado 操作步骤

1. 新建 RTL Project，器件选择开发板实际使用的 XC7Z035 FFG676（原理图对应 -2 速度等级）。
2. 添加 `edge_capture_top.v` 为 Design Source，并设为顶层。
3. 添加 `edge_capture_top.xdc` 为 Constraints。
4. 依次运行 Synthesis、Implementation、Generate Bitstream。
5. 连接 JTAG，在 Hardware Manager 中下载 bit 文件。
6. 若要直接观察上升沿和下降沿脉冲：综合后执行 Set Up Debug，把已标记的 `in_level`、`rise_pulse`、`fall_pulse` 接入 ILA，采样时钟选 `clk_100m`。

第 3 步使用的约束：

```tcl
# Zynq-7035 onboard 100 MHz PL clock: PL_CLK -> FPGA C8
set_property PACKAGE_PIN C8 [get_ports clk_100m]
set_property IOSTANDARD SSTL135 [get_ports clk_100m]
create_clock -name clk_100m -period 10.000 [get_ports clk_100m]

# Digital input channel 5: F_IN5 -> HT1-B27 -> FPGA AC16
set_property PACKAGE_PIN AC16 [get_ports f_in5_n]
set_property IOSTANDARD LVCMOS33 [get_ports f_in5_n]

# Open-collector output channel 5: F_OC5 -> HT1-A36 -> FPGA AC24
set_property PACKAGE_PIN AC24 [get_ports f_oc5]
set_property IOSTANDARD LVCMOS33 [get_ports f_oc5]
set_property DRIVE 8 [get_ports f_oc5]
set_property SLEW SLOW [get_ports f_oc5]
```

输出侧除了电平标准和管脚，还限定了驱动能力 `DRIVE 8` 和压摆率 `SLEW SLOW`。

第 6 步接好 ILA 后，可对照图 1 核对同步延迟和单周期脉冲。

## 信号发生器设置与 OC5 示波器接法

信号发生器的推荐参数：

| 项目 | 设置值 |
|---|---|
| 波形 | 方波 |
| 频率 | 1 kHz |
| 占空比 | 50% |
| 负载设置 | High-Z |
| 起始电平 | 0~5 V（5 Vpp，Offset=+2.5 V） |
| OUT | 接 SCSI1-40（IN5_P） |
| GND | 接 SCSI1-15（IN5_N） |

不要先使用带负半周的双极性波形。如果 0~5 V 不能可靠触发，应先测量 IN5 前端响应或进一步核对输入门限，不要盲目提高电压。

OC5 这边的接法（前 3 条是接线，后 2 条是预期现象）：

1. 给 SCSI1-17（OC_VCC1）接一个与底板 GND 共地的 3.3 V 或 5 V 电源。
2. 示波器探头尖端接 SCSI1-22（OC5）。
3. 示波器地夹接 SCSI1-29（GND）。
4. 输入为 1 kHz 时，每个外部上升沿使 OC5 翻转一次，因此 OC5 预计为约 500 Hz。
5. 上电下载后的初始状态通常为 OC5 高电平；第一个输入上升沿后变低，第二个输入上升沿后恢复为高。

第 1 步不能省，原因在信号链里：OC5 是开集输出，高电平靠 OC_VCC1 经板载 1 kΩ 上拉得到。

<figure class="diagram">
  <svg viewBox="0 0 720 320" role="img" aria-label="OC5 示波器接法信号链框图：FPGA 的 F_OC5 管脚 AC24 经 ULN2803 反相驱动开集输出 OC5，OC_VCC1 经板载 1 kΩ 上拉给 OC5 提供高电平，示波器探头接 OC5、地夹接 GND">
    <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
      <rect x="20" y="88" width="130" height="56" rx="7" />
      <rect x="210" y="88" width="150" height="56" rx="7" />
      <rect x="490" y="88" width="210" height="56" rx="7" />
      <rect x="245" y="24" width="230" height="52" rx="7" />
      <rect x="430" y="200" width="260" height="52" rx="7" />
      <rect x="422" y="88" width="16" height="20" rx="2" />
      <line x1="150" y1="116" x2="206" y2="116" />
      <line x1="360" y1="116" x2="424" y2="116" />
      <line x1="438" y1="116" x2="486" y2="116" />
      <line x1="430" y1="76" x2="430" y2="88" />
      <line x1="430" y1="108" x2="430" y2="116" />
      <line x1="430" y1="132" x2="430" y2="200" stroke-dasharray="6 6" opacity="0.5" />
      <circle cx="430" cy="116" r="4" fill="currentColor" stroke="none" />
    </g>
    <g fill="currentColor">
      <polygon points="206,116 196,111 196,121" />
      <polygon points="486,116 476,111 476,121" />
    </g>
    <g fill="currentColor" font-size="12" text-anchor="middle">
      <text x="85" y="112">FPGA F_OC5</text>
      <text x="85" y="130">AC24</text>
      <text x="285" y="112">ULN2803</text>
      <text x="285" y="130">反相开集驱动</text>
      <text x="595" y="112">示波器探头尖端</text>
      <text x="595" y="130">接 SCSI1-22</text>
      <text x="360" y="46">OC_VCC1（SCSI1-17）</text>
      <text x="360" y="64">与底板 GND 共地的 3.3 V 或 5 V</text>
      <text x="560" y="222">示波器地夹</text>
      <text x="560" y="240">接 SCSI1-29（GND）</text>
    </g>
    <g fill="currentColor" font-size="11">
      <text x="405" y="99" text-anchor="end">1 kΩ</text>
      <text x="446" y="164">物理 OC5（SCSI1-22）</text>
      <text x="20" y="286">F_OC5 = 1 → 物理 OC5 被 ULN2803 拉低；F_OC5 = 0 → OC5 经板载 1 kΩ 上拉到 OC_VCC1。</text>
    </g>
  </svg>
  <figcaption>图 2：OC5 示波器接法的信号链。FPGA 的 F_OC5（AC24）经 ULN2803 反相驱动开集输出；OC5 的高电平由 SCSI1-17（OC_VCC1）经板载 1 kΩ 上拉提供，所以要测 OC5 就必须先给 OC_VCC1 供电，探头接 OC5、地夹接 GND。</figcaption>
</figure>

## 预期现象

| 观测点 | 预期 | 依据 |
|---|---|---|
| 外部输入 IN5 | 1 kHz、50%、0~5 V 方波（5 Vpp，Offset=+2.5 V） | 信号发生器设置 |
| 管脚 `f_in5_n` | 与外部 IN5 反相，即外部上升沿对应管脚下降沿 | ACSL-6400 反相 |
| ILA：`in_level` | 跟随外部输入的有效电平（外部高 → `in_level` 高） | RTL 里的 `in_level = ~in_sync` |
| ILA：`rise_pulse` / `fall_pulse` | 单周期脉冲，脉宽 10 ns，两个信号各自只在外部上升沿、外部下降沿出现 | RTL 注释与 100 MHz 时钟 |
| `f_oc5` / 物理 OC5 | 每个外部上升沿翻转一次，1 kHz 输入对应 OC5 约 500 Hz | 见上方 OC5 接法说明第 4 条 |
| 上电初始状态 | 通常为 OC5 高电平；第 1 个输入上升沿后变低，第 2 个后恢复为高 | 见上方 OC5 接法说明第 5 条 |

## 踩过的坑

**1. 极性反了两次，第一次看波形很容易怀疑自己。**

外部 IN5 上升沿在管脚 `f_in5_n` 上是下降沿（ACSL-6400 反相）；`f_oc5 = 1` 时外部 OC5 反而是低（ULN2803 反相）。记住 RTL 已经补偿了输入侧，所以 ILA 里的 `rise_pulse` 指的是外部上升沿，而不是管脚上的上升沿。

**2. 想靠加电压解决触发问题。**

切记：不要先使用带负半周的双极性波形；如果 0~5 V 不能可靠触发，应先测量 IN5 前端响应或进一步核对输入门限，不要盲目提高电压。

**3. 忘了给 OC_VCC1 供电，然后觉得输出坏了。**

OC5 是开集输出，高电平是 OC_VCC1 经板载 1 kΩ 上拉出来的。不接 SCSI1-17 上那路与底板 GND 共地的 3.3 V 或 5 V，示波器上就没有高电平可看。

**4. 50 针连接器按镜像方向数脚。**

SCSI1 的 pin 1 方向必须按连接器外壳、丝印或转接板再确认一次。40/15/17/22/29 这几个脚数错，后面所有现象都是错的。

**5. 同步器初值取 1 是有原因的。**

如果 `in_meta` / `in_sync` 初值取 0，而 `in_level = ~in_sync`、`in_level_d` 初值为 0，上电时会凭空出现一次上升沿条件，输出会被多翻转一次。现在的初值组合（1、1、0、0）就是为了让上电那一刻没有边沿。

**6. 两个脉冲只有 10 ns 宽。**

`rise_pulse` / `fall_pulse` 只保持一个 100 MHz 时钟周期，所以必须按操作步骤第 6 步把采样时钟选成 `clk_100m`，用别的慢时钟去采，很可能一个都抓不到。

**7. 排查顺序参考。**

| 现象 | 先查什么 |
|---|---|
| 示波器上 OC5 一直是低 | 先确认 SCSI1-17（OC_VCC1）是否已接上与底板 GND 共地的 3.3 V 或 5 V |
| OC5 不翻转 | Set Up Debug 接 ILA，先看 `in_level` 有没有跟着外部输入变化，再看 `rise_pulse` |
| 0~5 V 输入触发不可靠 | 测量 IN5 前端响应、核对输入门限，不要先提高电压 |
| 怀疑接错脚 | 按外壳/丝印/转接板重新确认 SCSI1 的 pin 1 方向 |
| ILA 里抓不到脉冲 | 采样时钟必须是 `clk_100m`；脉冲只有 10 ns 宽 |

## 下一步

- 核对板子的实际器件型号与速度等级（`xc7z035ffg676-2`），确保 Vivado 工程、约束文件与板卡一致。
- 把运行 `iverilog` / `vvp` 的完整终端输出保存下来，对照 `edge_capture_tb.out` 中的断言。
- 在核定前端允许输入范围后，研究不同偏置下的触发门限；先沿用文中的单极性设置，不把负电压对照作为默认上板步骤。
