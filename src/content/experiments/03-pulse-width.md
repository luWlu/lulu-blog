---
title: "实验二：脉宽计数、频率与占空比测量"
description: "100 MHz 时钟给外部方波做门控计数，顺序除法器换算出频率与占空比，ILA 里可直接核对 high_count、period_count 与 duty_x100。"
date: 2026-09-19
order: 3
stage: "基础"
status: "已完成"
board: "Zynq-7035 核心板 + 自制 AD/DA 底板"
tools: ["Vivado", "Icarus Verilog", "信号发生器", "示波器"]
tags: ["Zynq", "脉宽测量", "频率计", "计数器", "ILA"]
accent: "lime"
diagram: "wave"
draft: false
sample: false
---

## 这个实验要做什么

上一个实验只关心"边沿来没来"，这一个实验开始关心"边沿之间有多久"。把它做完整，就是一台用 FPGA 搭的简易频率计 / 占空比表：喂一路外部方波进去，它能告诉你这路信号的脉宽、周期、频率和占空比。

要测的量，全都从"数时钟格子"来：

| 要测的量 | 怎么得到 | 单位 / 分辨率 |
|---|---|---|
| 高电平时间（脉宽） | `high_count × 10 ns` | 10 ns |
| 低电平时间 | `low_count × 10 ns` | 10 ns |
| 周期 | `period_count × 10 ns` | 10 ns |
| 频率 | `100000000 / period_count` | Hz（整数） |
| 占空比 | `high_count × 10000 / period_count` | 0.01% |

**精度从哪来。** 测量分辨率就是一个 PL 时钟周期：约束文件里 `create_clock -name clk_100m -period 10.000`，也就是 10 ns / 100 MHz。所以这个仪器给出的所有时间量都是 10 ns 的整数倍——它不是连续测量，而是"数格子"。

源文档对误差的表述是：输入是异步信号，而且隔离器的上升沿、下降沿传播延迟可能不同，所以实际计数允许有少量波动。

## 已确认的硬件连接

| 功能 | 底板网络 | FPGA 管脚 | I/O 标准 |
|---|---|---|---|
| 100 MHz PL 时钟 | PL_CLK | C8 | SSTL135 |
| 数字输入通道5 | F_IN5 | AC16 | LVCMOS33 |

SCSI1 外部接口：

- Pin 40：IN5_P，接信号发生器 OUT；
- Pin 15：IN5_N，接信号发生器 GND/LO。

输入经过 ACSL-6400 后反相，所以 RTL 使用 `in_level = ~in_sync` 恢复外部信号极性。本实验不使用 OC5、OC_VCC1 或其他数字输出通道。

约束文件里还多写了一段注释，把底板到核心板这一跳也标了出来：`F_IN5 -> HT1-B27 -> FPGA AC16`。

```tcl
# Zynq-7035 onboard 100 MHz PL clock: PL_CLK -> FPGA C8
set_property PACKAGE_PIN C8 [get_ports clk_100m]
set_property IOSTANDARD SSTL135 [get_ports clk_100m]
create_clock -name clk_100m -period 10.000 [get_ports clk_100m]

# Digital input channel 5: F_IN5 -> HT1-B27 -> FPGA AC16
# The ACSL-6400 input path is inverting; polarity is restored in RTL.
set_property PACKAGE_PIN AC16 [get_ports f_in5_n]
set_property IOSTANDARD LVCMOS33 [get_ports f_in5_n]
```

注意端口名是 `f_in5_n`：**管脚侧是低有效**，外部 IN5 为高时这个管脚是低。极性还原这一句 `in_level = ~in_sync` 是后面所有计数能对上的前提。

## 测量原理：门控计数 + 顺序除法

整个实验可以拆成两级：

1. **门控计数级**：边沿检测找出"高电平开始"和"高电平结束"，在这两个边沿之间用 100 MHz 时钟数数，得到 `high_count`；低电平区间同样数出 `low_count`；一个完整周期数出 `period_count`，它等于 `high_count + low_count`。
2. **换算级**：拿 `period_count` 当分母、`100000000` 当分子做除法得到频率；拿 `high_count × 10000` 当分子、`period_count` 当分母做除法得到占空比。

三个计数器都在 100 MHz 时钟下工作，所以计数值与时间的换算系数只有一个：**一个计数 = 10 ns**。脉宽和周期是同一个刻度上的两种窗口，占空比则是两者的比值，这就是这一页最核心的一张关系图：

<figure class="diagram">
  <svg viewBox="0 0 720 320" role="img" aria-label="脉宽测量原理时序图：100 MHz 时钟、被测方波 in_level、上升沿与下降沿的单周期脉冲、高电平期间的 high_count 门控、低电平期间的 low_count 门控，以及 period_count 跨越一个完整周期，底部给出脉宽、周期、频率与占空比的换算公式">
    <g stroke="currentColor" stroke-width="2" opacity="0.18" stroke-dasharray="4 6" fill="none">
      <line x1="190" y1="14" x2="190" y2="222" />
      <line x1="430" y1="14" x2="430" y2="222" />
      <line x1="670" y1="14" x2="670" y2="222" />
    </g>
    <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
      <polyline points="130,34 150,34 150,18 170,18 170,34 190,34 190,18 210,18 210,34 230,34 230,18 250,18 250,34 270,34 270,18 290,18 290,34 310,34 310,18 330,18 330,34 350,34 350,18 370,18 370,34 390,34 390,18 410,18 410,34 430,34 430,18 450,18 450,34 470,34 470,18 490,18 490,34 510,34 510,18 530,18 530,34 550,34 550,18 570,18 570,34 590,34 590,18 610,18 610,34 630,34 630,18 650,18 650,34 670,34 670,18 690,18 690,34" />
      <polyline points="130,76 190,76 190,60 430,60 430,76 670,76 670,60 690,60" />
      <polyline points="130,104 190,104 190,92 230,92 230,104 670,104 670,92 690,92" />
      <polyline points="130,132 430,132 430,120 470,120 470,132 690,132" />
    </g>
    <g fill="currentColor" opacity="0.16">
      <rect x="190" y="146" width="240" height="14" />
      <rect x="430" y="172" width="240" height="14" />
    </g>
    <g fill="none" stroke="currentColor" stroke-width="2" opacity="0.55">
      <rect x="190" y="146" width="240" height="14" />
      <rect x="430" y="172" width="240" height="14" />
    </g>
    <g stroke="currentColor" stroke-width="2" fill="none">
      <line x1="194" y1="214" x2="666" y2="214" />
    </g>
    <g fill="currentColor">
      <polygon points="190,214 200,209 200,219" />
      <polygon points="670,214 660,209 660,219" />
    </g>
    <g fill="currentColor" font-size="12">
      <text x="8" y="30">clk_100m</text>
      <text x="8" y="72">in_level</text>
      <text x="8" y="100">rise_pulse</text>
      <text x="8" y="128">fall_pulse</text>
      <text x="8" y="156">high_count</text>
      <text x="8" y="182">low_count</text>
      <text x="8" y="218">period_count</text>
    </g>
    <g fill="currentColor" font-size="11" text-anchor="middle">
      <text x="310" y="157">高电平期间计数：high_count 个 10 ns</text>
      <text x="550" y="183">低电平期间计数：low_count 个 10 ns</text>
      <text x="430" y="204">period_count = high_count + low_count（一个完整周期）</text>
      <text x="190" y="54">① 开始计数</text>
      <text x="670" y="54">② 发布计数</text>
    </g>
    <g fill="currentColor" font-size="12">
      <text x="20" y="250">高电平时间 = high_count × 10 ns；低电平时间 = low_count × 10 ns</text>
      <text x="20" y="272">周期 = period_count × 10 ns，period_count = high_count + low_count</text>
      <text x="20" y="294">频率 = 100000000 / period_count</text>
      <text x="20" y="314">占空比 = high_count × 10000 / period_count（单位 0.01%，5000 即 50.00%）</text>
    </g>
  </svg>
  <figcaption>图 1：测量原理。100 MHz 时钟在每个高电平区间累计出 high_count、在每个低电平区间累计出 low_count，两者相加就是跨一个完整周期的 period_count；脉宽与周期只差一个"乘 10 ns"，频率和占空比则分别用 period_count 做分母、100000000 和 high_count × 10000 做分子换算。图中 ① 是第一个上升沿，只启动计数；② 是第二个上升沿，此时一段高电平和一段低电平都已量完，三个计数才一起发布（对应 ILA 里的 measurement_valid）。为便于对照，图中把被测方波的边沿画在时钟沿上；实际输入是异步的，边沿落在两个时钟沿之间的任何位置都可能。</figcaption>
</figure>

### 换算公式（与源文档逐字一致）

- 高电平时间：`high_count × 10 ns`；
- 低电平时间：`low_count × 10 ns`；
- 周期：`period_count × 10 ns`；
- 频率：`100000000 / period_count`；
- 占空比：`high_count × 10000 / period_count`，结果单位为 0.01%。

顺序除法需要 64 个系统时钟，约 640 ns。它避免了单周期组合除法器造成的较大时序压力。

### ILA 里要看的标记信号与含义

| 信号 | 含义 |
|---|---|
| `in_level` | 恢复外部极性后的输入方波 |
| `rise_pulse` | 上升沿检测脉冲，宽度为一个 100 MHz 时钟周期 |
| `fall_pulse` | 下降沿检测脉冲，宽度为一个 100 MHz 时钟周期 |
| `high_count` | 高电平持续的 10 ns 时钟周期数 |
| `low_count` | 低电平持续的 10 ns 时钟周期数 |
| `period_count` | 完整周期计数，等于 high_count + low_count |
| `measurement_valid` | 新的原始计数结果已更新 |
| `frequency_hz` | 整数频率，单位 Hz，小数部分舍去 |
| `duty_x100` | 占空比放大 100 倍，例如 5000 表示 50.00% |
| `result_valid` | 新的频率和占空比结果已更新 |
| `calculation_busy` | 两个顺序除法器正在工作 |

`measurement_valid` 在第二个有效上升沿到来时更新原始计数；约 640 ns 后，`result_valid` 更新计算结果。

## 模块一：pulse_width_measure.v

这个模块负责全部"数格子"的活：边沿检测、高/低电平计数、周期拼装、结果发布。

```verilog
`timescale 1ns / 1ps

// Measure the high time, low time, and period of an asynchronous square wave.
// All results are expressed in clk cycles.
module pulse_width_measure #(
    parameter COUNTER_WIDTH = 32
) (
    input  wire                     clk,
    input  wire                     signal_in,
    output reg  [COUNTER_WIDTH-1:0] high_count   = {COUNTER_WIDTH{1'b0}},
    output reg  [COUNTER_WIDTH-1:0] low_count    = {COUNTER_WIDTH{1'b0}},
    output reg  [COUNTER_WIDTH:0]   period_count = {(COUNTER_WIDTH+1){1'b0}},
    output reg                      data_valid   = 1'b0,
    output wire                     rise_pulse,
    output wire                     fall_pulse
);

    reg signal_d = 1'b0;
    assign rise_pulse =  signal_in & ~signal_d;
    assign fall_pulse = ~signal_in &  signal_d;

    reg measure_started = 1'b0;
    reg phase_high      = 1'b0;
    reg have_high       = 1'b0;

    reg [COUNTER_WIDTH-1:0] high_work    = {COUNTER_WIDTH{1'b0}};
    reg [COUNTER_WIDTH-1:0] low_work     = {COUNTER_WIDTH{1'b0}};
    reg [COUNTER_WIDTH-1:0] high_pending = {COUNTER_WIDTH{1'b0}};

    wire [COUNTER_WIDTH-1:0] high_finished =
        (high_work == {COUNTER_WIDTH{1'b1}}) ? high_work : high_work + {{(COUNTER_WIDTH-1){1'b0}}, 1'b1};

    wire [COUNTER_WIDTH-1:0] low_finished =
        (low_work == {COUNTER_WIDTH{1'b1}}) ? low_work : low_work + {{(COUNTER_WIDTH-1){1'b0}}, 1'b1};

    wire [COUNTER_WIDTH:0] finished_period =
        {1'b0, high_pending} + {1'b0, low_finished};

    always @(posedge clk) begin
        signal_d  <= signal_in;
        data_valid <= 1'b0;

        // A rising edge starts a new high interval. If a high and a low
        // interval have already been measured, publish one complete sample.
        if (rise_pulse) begin
            if (measure_started && !phase_high && have_high) begin
                high_count   <= high_pending;
                low_count    <= low_finished;
                period_count <= finished_period;
                data_valid   <= 1'b1;
            end

            measure_started <= 1'b1;
            phase_high      <= 1'b1;
            have_high       <= 1'b0;
            high_work       <= {COUNTER_WIDTH{1'b0}};
            low_work        <= {COUNTER_WIDTH{1'b0}};
        end
        // A falling edge ends the high interval and starts the low interval.
        else if (fall_pulse && measure_started && phase_high) begin
            high_pending <= high_finished;
            phase_high   <= 1'b0;
            have_high    <= 1'b1;
            low_work     <= {COUNTER_WIDTH{1'b0}};
        end
        // Count full clock intervals between detected edges.
        else if (measure_started) begin
            if (phase_high) begin
                if (high_work != {COUNTER_WIDTH{1'b1}})
                    high_work <= high_work + {{(COUNTER_WIDTH-1){1'b0}}, 1'b1};
            end
            else if (have_high) begin
                if (low_work != {COUNTER_WIDTH{1'b1}})
                    low_work <= low_work + {{(COUNTER_WIDTH-1){1'b0}}, 1'b1};
            end
        end
    end

endmodule
```

几个值得盯着看的点：

- **边沿检测就是打一拍再比较。** `signal_d` 是 `signal_in` 的一拍延迟版本，`rise_pulse = signal_in & ~signal_d`、`fall_pulse = ~signal_in & signal_d` 就是组合逻辑写出来的差分。这里两个脉冲是 `assign` 出来的线，不是寄存器；README 把它们的宽度记作"一个 100 MHz 时钟周期"。
- **三段状态决定在数谁。** `measure_started` 表示已经见过第一个上升沿；`phase_high` 表示当前处在高电平区间；`have_high` 表示这一轮的高电平已经量完、可以开始量低电平了。低电平只在 `have_high` 成立后才计数，所以"还没见过完整高电平"的那一段不会污染 `low_count`。
- **计数是饱和的。** 两个 `if (… != {COUNTER_WIDTH{1'b1}})` 让计数器加满就停住，不会回绕成一个看起来很正常的小数字。
- **`+1` 是刻意的补偿。** `high_finished` / `low_finished` 都在工作计数上加一，`finished_period` 又是 `high_pending + low_finished`，也就是把边沿落在的那个时钟间隔补进去。testbench 期望的 `high=50 / low=50 / period=100` 正是这套语义的结果：驱动 50 个高电平时钟、50 个低电平时钟，量出来就是一个 100 的周期。
- **发布时机在第二个上升沿。** `if (measure_started && !phase_high && have_high)` 要求"这一轮之前已经完整量过一段高电平和一段低电平"，所以在第二个有效上升沿到来时才把三个计数一起推出去，同时把 `data_valid` 拉高一个时钟周期。这就是 ILA 上 `measurement_valid` 更新原始计数的那一刻。

## 模块二：divider_u64_u33.v

频率和占空比都要除以 `period_count`，所以这个除法器的分母位宽必须跟着计数宽度走：`high_count` 和 `low_count` 各是 32 位，两者相加得到的 `period_count` 是 33 位，多出来的那一位正好接住进位。与其写一个单周期组合除法器去压时序，不如写一个慢一点但老实的顺序除法器。

```verilog
`timescale 1ns / 1ps

// Unsigned 64-bit numerator / 33-bit denominator restoring divider.
// One division takes 64 clk cycles. The divider contains no large
// single-cycle combinational division path.
module divider_u64_u33 (
    input  wire        clk,
    input  wire        start,
    input  wire [63:0] numerator,
    input  wire [32:0] denominator,
    output reg         busy           = 1'b0,
    output reg         done           = 1'b0,
    output reg         divide_by_zero = 1'b0,
    output reg  [63:0] quotient       = 64'd0
);

    reg [32:0] divisor       = 33'd0;
    reg [63:0] dividend_shift = 64'd0;
    reg [63:0] quotient_work  = 64'd0;
    reg [33:0] remainder      = 34'd0;
    reg [6:0]  iterations     = 7'd0;

    wire [33:0] shifted_remainder = {remainder[32:0], dividend_shift[63]};
    wire        subtract_enable   = shifted_remainder >= {1'b0, divisor};
    wire [33:0] remainder_next    = subtract_enable
                                     ? shifted_remainder - {1'b0, divisor}
                                     : shifted_remainder;
    wire [63:0] quotient_next     = {quotient_work[62:0], subtract_enable};

    always @(posedge clk) begin
        done <= 1'b0;

        if (start && !busy) begin
            divide_by_zero <= (denominator == 33'd0);

            if (denominator == 33'd0) begin
                quotient <= 64'hFFFF_FFFF_FFFF_FFFF;
                busy     <= 1'b0;
                done     <= 1'b1;
            end
            else begin
                divisor        <= denominator;
                dividend_shift <= numerator;
                quotient_work  <= 64'd0;
                remainder      <= 34'd0;
                iterations     <= 7'd64;
                busy           <= 1'b1;
            end
        end
        else if (busy) begin
            remainder      <= remainder_next;
            dividend_shift <= {dividend_shift[62:0], 1'b0};
            quotient_work  <= quotient_next;
            iterations     <= iterations - 1'b1;

            if (iterations == 7'd1) begin
                quotient <= quotient_next;
                busy     <= 1'b0;
                done     <= 1'b1;
            end
        end
    end

endmodule
```

- **位宽是被分母撑出来的。** 分子 64 位、分母 33 位、余数 34 位（多留一位给加减），商 64 位。这一组位宽和顶层 `period_count` 是 33 位这件事是配套的。
- **一次除法 = 64 次迭代。** `iterations` 初值 `7'd64`，每个 `clk` 减一，减到 1 时把 `quotient` 推出去、`busy` 落下、`done` 拉高。README 记录的耗时就是"64 个系统时钟，约 640 ns"。
- **它不占组合时序。** 每个周期只做一次"移位 + 比较 + 可能减一次"，没有一条贯穿 64 位的单周期组合除法路径——模块注释里的 `The divider contains no large single-cycle combinational division path` 说的就是这件事。
- **除零是一条单独的路。** 分母为 0 时直接给出 `quotient = 64'hFFFF_FFFF_FFFF_FFFF`、`divide_by_zero` 置位、`done` 立刻拉高，不进 64 拍的流程。**这个全 1 不是结果**，顶层的处理才是最终行为：`freq_divide_by_zero || duty_divide_by_zero` 成立时，把 `frequency_hz` 和 `duty_x100` 都写成 0。

## 模块三：pulse_width_top.v

顶层把四件事串起来：同步异步输入、恢复极性、调度测量与换算、保存结果。

```verilog
`timescale 1ns / 1ps

// Experiment 2 top level:
//   1. Synchronize the isolated digital input.
//   2. Restore its external polarity (the ACSL-6400 path is inverting).
//   3. Measure high/low/period counts with the 100 MHz PL clock.
//   4. Calculate frequency in Hz and duty cycle x100 using sequential dividers.
//
// Physical ports:
//   clk_100m : PL_CLK, FPGA C8
//   f_in5_n  : baseboard F_IN5, FPGA AC16, active-low relative to external IN5
module pulse_width_top (
    input wire clk_100m,
    input wire f_in5_n
);

    localparam [63:0] CLK_FREQ_HZ = 64'd100_000_000;

    // Two-stage synchronizer for the asynchronous input.
    // The isolated input is normally high on the FPGA side when external IN5
    // is inactive, so both registers initialize to 1.
    (* ASYNC_REG = "TRUE" *) reg in_meta = 1'b1;
    (* ASYNC_REG = "TRUE" *) reg in_sync = 1'b1;

    always @(posedge clk_100m) begin
        in_meta <= f_in5_n;
        in_sync <= in_meta;
    end

    // Restore external signal polarity: external high -> FPGA-side F_IN5 low.
    (* MARK_DEBUG = "TRUE" *) wire in_level = ~in_sync;

    (* MARK_DEBUG = "TRUE" *) wire [31:0] high_count;
    (* MARK_DEBUG = "TRUE" *) wire [31:0] low_count;
    (* MARK_DEBUG = "TRUE" *) wire [32:0] period_count;
    (* MARK_DEBUG = "TRUE" *) wire measurement_valid;
    (* MARK_DEBUG = "TRUE" *) wire rise_pulse;
    (* MARK_DEBUG = "TRUE" *) wire fall_pulse;

    pulse_width_measure #(
        .COUNTER_WIDTH(32)
    ) u_measure (
        .clk          (clk_100m),
        .signal_in    (in_level),
        .high_count   (high_count),
        .low_count    (low_count),
        .period_count (period_count),
        .data_valid   (measurement_valid),
        .rise_pulse   (rise_pulse),
        .fall_pulse   (fall_pulse)
    );

    // If a new measurement arrives while calculation is busy, keep one
    // pending request. The calculation starts from the latest stable counts.
    reg calculation_pending = 1'b0;
    reg divider_start       = 1'b0;

    wire freq_busy;
    wire duty_busy;
    wire dividers_busy = freq_busy | duty_busy;

    always @(posedge clk_100m) begin
        divider_start <= 1'b0;

        if (measurement_valid)
            calculation_pending <= 1'b1;

        if (calculation_pending && !dividers_busy) begin
            divider_start       <= 1'b1;
            calculation_pending <= 1'b0;
        end
    end
```

到这里是"测量 → 请求换算"的调度部分。接下来是换算：

```verilog
    // high_count * 10000, implemented as constant shifts/adds.
    wire [63:0] high_count_u64 = {32'd0, high_count};
    wire [63:0] duty_numerator =
          (high_count_u64 << 13)  // x8192
        + (high_count_u64 << 10)  // x1024
        + (high_count_u64 << 9)   // x512
        + (high_count_u64 << 8)   // x256
        + (high_count_u64 << 4);  // x16; total x10000

    wire [63:0] frequency_quotient;
    wire [63:0] duty_quotient;
    wire freq_done;
    wire duty_done;
    wire freq_divide_by_zero;
    wire duty_divide_by_zero;

    divider_u64_u33 u_frequency_divider (
        .clk            (clk_100m),
        .start          (divider_start),
        .numerator      (CLK_FREQ_HZ),
        .denominator    (period_count),
        .busy           (freq_busy),
        .done           (freq_done),
        .divide_by_zero (freq_divide_by_zero),
        .quotient       (frequency_quotient)
    );

    divider_u64_u33 u_duty_divider (
        .clk            (clk_100m),
        .start          (divider_start),
        .numerator      (duty_numerator),
        .denominator    (period_count),
        .busy           (duty_busy),
        .done           (duty_done),
        .divide_by_zero (duty_divide_by_zero),
        .quotient       (duty_quotient)
    );

    (* MARK_DEBUG = "TRUE" *) reg [31:0] frequency_hz = 32'd0;
    (* MARK_DEBUG = "TRUE" *) reg [31:0] duty_x100    = 32'd0;
    (* MARK_DEBUG = "TRUE" *) reg        result_valid = 1'b0;
    (* MARK_DEBUG = "TRUE" *) wire       calculation_busy = dividers_busy;

    always @(posedge clk_100m) begin
        result_valid <= 1'b0;

        if (freq_done && duty_done) begin
            if (freq_divide_by_zero || duty_divide_by_zero) begin
                frequency_hz <= 32'd0;
                duty_x100    <= 32'd0;
            end
            else begin
                frequency_hz <= frequency_quotient[31:0];
                duty_x100    <= duty_quotient[31:0];
            end
            result_valid <= 1'b1;
        end
    end

endmodule
```

关键点：

- **同步器初值是 1，有原因。** 注释写得很清楚：外部 IN5 无效时，隔离器在 FPGA 这一侧通常是高电平，所以 `in_meta` / `in_sync` 都初始化为 1；这样上电时 `in_level = ~in_sync` 为 0，不会凭空造出一个"上升沿"。两级都标了 `ASYNC_REG`。
- **`CLK_FREQ_HZ = 64'd100_000_000` 是写死的。** 频率换算全靠这个常量，换板子或换 PL 时钟就必须改它，它不会自动跟着 XDC 走。
- **所有要看的信号都挂了 `MARK_DEBUG`。** `in_level`、`high_count`、`low_count`、`period_count`、`measurement_valid`、`rise_pulse`、`fall_pulse`、`frequency_hz`、`duty_x100`、`result_valid`、`calculation_busy`——后面 Set Up Debug 时"带 MARK_DEBUG 的信号全部加入 ILA"指的就是这些。
- **两个除法器共用一个 start。** `divider_start` 只拉高一个时钟周期，两个 `divider_u64_u33` 同拍启动，分母都是当前的 `period_count`；`dividers_busy = freq_busy | duty_busy` 就是 ILA 里的 `calculation_busy`。
- **忙的时候只留一个待办。** 测量比 640 ns 的除法快得多，所以 `calculation_pending` 只保留"有新结果要算"这一个标志位，等两个除法器都空闲了再启动下一次；注释里那句 `The calculation starts from the latest stable counts` 说的就是它会用最新的一组计数去算。这意味着**中间的测量结果可能被跳过**，ILA 上看计数和看结果是两种节奏。
- **×10000 用移位加法，不用乘法器。** 8192 + 1024 + 512 + 256 + 16 = 10000，源文件把每一项都注释成了 `x8192` / `x1024` / `x512` / `x256` / `x16`，对着看一眼就能核出系数。
- **结果截断到 32 位。** `frequency_quotient[31:0]` / `duty_quotient[31:0]` 写进 `frequency_hz` / `duty_x100`，除法器本身是 64 位商。

## 本地仿真：run_sim.ps1

从脉宽测量工程根目录，在 PowerShell 中执行：

```powershell
.\run_sim.ps1
```

脚本本身很短，用 Icarus Verilog 编译再交给 vvp 执行：

```powershell
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

& iverilog -g2012 -Wall -s tb_pulse_width_top `
    -o (Join-Path $dir 'pulse_width_tb.out') `
    (Join-Path $dir 'divider_u64_u33.v') `
    (Join-Path $dir 'pulse_width_measure.v') `
    (Join-Path $dir 'pulse_width_top.v') `
    (Join-Path $dir 'tb_pulse_width_top.v')

Push-Location $dir
try {
    & vvp .\pulse_width_tb.out
}
finally {
    Pop-Location
}
```

`-s tb_pulse_width_top` 指定仿真顶层，四个 `.v` 文件一起编译进 `pulse_width_tb.out`；因为脚本先 `Push-Location` 到脚本所在目录再运行，testbench 里 `$dumpfile("pulse_width_top.vcd")` 生成的波形也落在同一个目录。

测试平台的驱动方式很直接：用 `negedge` 时刻改 `f_in5_n`，再数固定个数的 `posedge`，就造出一段指定长度的高电平和低电平——注意 `f_in5_n = 1'b0` 对应的是**外部高电平**，因为这一路上有反相器。

```verilog
    // Drive one external high/low period. f_in5_n is the inverted FPGA-side
    // signal, matching the real ACSL-6400 input path.
    task drive_period;
        input integer high_cycles;
        input integer low_cycles;
        begin
            @(negedge clk_100m);
            f_in5_n = 1'b0; // External high.
            repeat (high_cycles) @(posedge clk_100m);

            @(negedge clk_100m);
            f_in5_n = 1'b1; // External low.
            repeat (low_cycles) @(posedge clk_100m);
        end
    endtask
```

三个用例连在一起跑，每个用例都是"开一个进程造波形、另一个进程等结果"的 `fork...join`：

```verilog
    initial begin
        $dumpfile("pulse_width_top.vcd");
        $dumpvars(0, tb_pulse_width_top);

        // Allow initialization and the two-stage input synchronizer to settle.
        repeat (10) @(posedge clk_100m);

        // Case 1: 50 high + 50 low = 100 clocks.
        // 100 MHz / 100 = 1 MHz; duty = 50.00%.
        fork
            begin
                repeat (4) drive_period(50, 50);
            end
            begin
                wait_and_check_measurement(32'd50, 32'd50, 33'd100);
                wait_and_check_result(32'd1_000_000, 32'd5000);
            end
        join

        // Case 2: 75 high + 175 low = 250 clocks.
        // 100 MHz / 250 = 400 kHz; duty = 30.00%.
        // The first result after changing settings may finish the preceding
        // waveform, so the monitor waits for the first exact new sample.
        fork
            begin
                repeat (4) drive_period(75, 175);
            end
            begin
                wait_and_check_measurement(32'd75, 32'd175, 33'd250);
                wait_and_check_result(32'd400_000, 32'd3000);
            end
        join

        // Case 3: 90 high + 30 low = 120 clocks.
        // Integer frequency result is floor(100 MHz / 120) = 833333 Hz.
        fork
            begin
                repeat (4) drive_period(90, 30);
            end
            begin
                wait_and_check_measurement(32'd90, 32'd30, 33'd120);
                wait_and_check_result(32'd833_333, 32'd7500);
            end
        join

        repeat (20) @(posedge clk_100m);

        if (errors == 0)
            $display("ALL TESTS PASSED");
        else
            $display("TESTS FAILED: %0d error(s)", errors);

        $finish;
    end
```

两个检查任务（源文件里完整实现，这里只说它们判什么）：`wait_and_check_measurement` 一直等到 `measurement_valid` 且 `high_count` / `low_count` / `period_count` 三项都等于期望值，才打印 `MEASURE PASS`；`wait_and_check_result` 等 `result_valid` 的上升沿，逐一比对 `frequency_hz` 和 `duty_x100`，不一致就累加 `errors`。所以最后一个用例里的 `ALL TESTS PASSED` 是三个用例的计数和结果全部对上的意思。

测试平台自动验证的三组值，和 README 第 4 节完全对应：

| 用例 | 驱动的高/低电平时钟数 | `period_count` | `frequency_hz` | `duty_x100` | 依据 |
|---|---|---|---|---|---|
| 1 | 50 / 50 | 100 | 1 000 000 Hz（1 MHz） | 5000（50.00%） | README 第 4 节第 1 条 |
| 2 | 75 / 175 | 250 | 400 000 Hz（400 kHz） | 3000（30.00%） | README 第 4 节第 2 条 |
| 3 | 90 / 30 | 120 | 833 333 Hz | 7500（75.00%） | README 第 4 节第 3 条 |

第 3 个用例还顺带说明了"整数频率"的含义：`floor(100 MHz / 120) = 833333`，小数部分舍去，正好呼应 `frequency_hz` 的含义表。

### 仿真输出里能读到什么

源目录里的 `pulse_width_tb.out` 是 Icarus 的 vvp 编译产物（文件头是 `:ivl_version "12.0"`），不是仿真运行日志；它能佐证的是 tb 里编译进去的判定字符串，例如 `ALL TESTS PASSED`、`TESTS FAILED: %0d error(s)` 和 `TIMEOUT`。

```text
:ivl_version "12.0 (devel)" "(s20150603-1539-g2693dd32b)";
...
%vpi_call/w ... "$display", "MEASURE PASS: high=%0d low=%0d period=%0d at %0t", ...
%vpi_call/w ... "$display", "RESULT PASS: frequency=%0d Hz duty=%0d.%02d%% at %0t", ...
%vpi_call/w ... "$display", "ALL TESTS PASSED"
```

## Vivado 建工程

1. 打开 Vivado，选择 **Create Project**；
2. 建立 RTL Project，不勾选"不指定源文件"；
3. 器件选择实际核心板的 XC7Z035 FFG676，速度等级 `-2`；
4. 将以下文件加入 **Design Sources**：
   - `pulse_width_measure.v`
   - `divider_u64_u33.v`
   - `pulse_width_top.v`
5. 将 `pulse_width_top.xdc` 加入 **Constraints**；
6. 将 `tb_pulse_width_top.v` 只加入 **Simulation Sources**；
7. 把 `pulse_width_top` 设为 Design Top；
8. 把 `tb_pulse_width_top` 设为 Simulation Top；
9. 运行 Behavioral Simulation，应看到 `ALL TESTS PASSED`；
10. 运行 Synthesis。

第 3 步的器件在 Vivado 里的完整写法是 `xc7z035ffg676-2`（源 README 写作 XC7Z035 FFG676 + 速度等级 `-2`），和约束文件头部注释里的 "Zynq-7035 onboard 100 MHz PL clock" 是同一块板子，也就是本页 frontmatter 里的 Zynq-7035 核心板。

第 6 步容易搞错：testbench 只能进 **Simulation Sources**，一旦混进 Design Sources，综合会把它当成一个多余的顶层候选。

## 添加 ILA

综合完成后：

1. 选择 **Open Synthesized Design**；
2. 选择 **Set Up Debug**；
3. 将带 `MARK_DEBUG` 的信号全部加入 ILA；
4. ILA 采样时钟选择 `clk_100m`；
5. 建议采样深度先选 4096；
6. 运行 Implementation 和 Generate Bitstream；
7. 下载 bit 文件后打开 ILA；
8. 将总线显示进制设为 Unsigned Decimal；
9. 第一次可以使用 `result_valid == 1` 作为触发条件；
10. 也可使用 `rise_pulse == 1` 观察输入边沿和计数过程。

第 8 步看着像小事，其实很关键：`high_count` / `low_count` / `period_count` 在 ILA 默认的十六进制下几乎没法读，切成无符号十进制才能直接和"约 50000 / 约 100000"对上。

采样深度 4096 够不够，取决于你想看多久：一个 1 kHz 周期就是 100000 个 10 ns 时钟，在 4096 的深度里连半个周期都装不下——所以第一次上板建议用 `rise_pulse` 或 `result_valid` 做触发，只看触发点附近那一段。

## 信号发生器与示波器接线

信号发生器初始设置：

| 项目 | 设置值 |
|---|---|
| 波形 | 方波 |
| 频率 | 1 kHz |
| 占空比 | 50% |
| 负载模式 | High-Z |
| 电平 | 低电平 0 V、高电平 5 V（5 Vpp、Offset +2.5 V） |

接线：

```text
信号发生器 OUT/G+  -> SCSI1 Pin 40，IN5_P
信号发生器 GND/LO  -> SCSI1 Pin 15，IN5_N
```

如果用示波器确认信号源波形：

```text
示波器探头尖端 -> IN5_P
示波器地夹     -> IN5_N
```

> 不要把示波器地夹接到 IN5_P。信号发生器和示波器通常通过保护地相连，接线前先关闭信号发生器输出。

## 1 kHz、50% 时的预期结果

| 观测点 | 预期值 | 按源文档公式核对 |
|---|---|---|
| `high_count` | 约为 50000 | 50000 × 10 ns = 500 µs 高电平 |
| `low_count` | 约为 50000 | 50000 × 10 ns = 500 µs 低电平 |
| `period_count` | 约为 100000 | 100000 × 10 ns = 1 ms 周期 |
| `frequency_hz` | 约为 1000 | 100000000 / 100000 = 1000 Hz |
| `duty_x100` | 约为 5000，即 50.00% | 50000 × 10000 / 100000 = 5000 |

输入是异步信号，而且隔离器的上升沿、下降沿传播延迟可能不同，所以实际计数允许有少量波动。

## 建议的上板测试顺序

1. 1 kHz、50%；
2. 2 kHz、25%；
3. 10 kHz、30%；
4. 100 kHz、50%。

每次先用示波器确认信号发生器的实际频率、占空比和 0～5 V 电平，再查看 ILA。不要一开始使用带负电压的双极性方波，也不要在不能触发时盲目提高输入电压。

这四组值按公式先算一遍，上板时就有一张对照表可用（分母仍是 `period_count`，也就是 100 MHz 除以频率后的时钟数）：

| 步骤 | 输入 | 预期 `period_count` | 预期 `frequency_hz` | 预期 `duty_x100` |
|---|---|---|---|---|
| 1 | 1 kHz、50% | 约 100000 | 约 1000 | 约 5000（50.00%） |
| 2 | 2 kHz、25% | 约 50000 | 约 2000 | 约 2500（25.00%） |
| 3 | 10 kHz、30% | 约 10000 | 约 10000 | 约 3000（30.00%） |
| 4 | 100 kHz、50% | 约 1000 | 约 100000 | 约 5000（50.00%） |

第 4 组是这几步里最"紧"的：100 kHz 对应 `period_count` 约 1000，也就是一个周期只有 1000 个计数、高电平约 500 个，此时 4096 的采样深度才终于能装下几个完整周期。

## 踩过的坑

**1. 极性反相一次，但只反在管脚上。**

外部 IN5 为高时，FPGA 侧 `f_in5_n` 是低（ACSL-6400 反相）。RTL 用 `in_level = ~in_sync` 把极性还原回来，所以 **ILA 里的 `rise_pulse` 指的是外部输入意义上的上升沿**，不是管脚 AC16 上的上升沿。看波形时如果先盯着 `f_in5_n` 想，很容易得出"边沿检测反了"的结论。

**2. 上电就去找输出，什么也找不到。**

没有输入信号时 `period_count` 是 0，除法器走的是除零那条路，顶层把 `frequency_hz` 和 `duty_x100` 都写成 0。这是代码行为，不是坏了——先接上信号源再谈读数。

**3. 两个"valid"的节奏不一样，第一次抓波形会以为没结果。**

`measurement_valid` 在**第二个有效上升沿**才更新原始计数（要凑齐一段高电平加一段低电平）；`result_valid` 还要再等两个除法器跑完，约 640 ns。所以触发条件别一上来就用 `result_valid`，先用 `rise_pulse` 看清输入和计数过程，再切到 `result_valid` 看结果。

**4. 测量比换算快，中间的计数被跳过了。**

`calculation_pending` 只保留一个待办标志位：除法器忙的时候再来新测量，只会把"有结果要算"记住，而不会排队。所以 ILA 上 `measurement_valid` 可能连着出现好几次，`result_valid` 才来一次。这不是丢数据，是刻意不让换算追着测量跑。

**5. 采样深度不够，一个完整周期都装不下。**

1 kHz 的一个周期是 100000 个 10 ns 时钟，4096 的深度连零头都不够。要么用边沿/`result_valid` 做触发只看局部，要么按需求加大深度——这也是为什么第 8 步把总线切成无符号十进制很重要：你只能看到触发点附近那一小段，最好一眼就能读懂。

**6. 示波器地夹接错位置。**

源文档写得很明确：示波器地夹接 IN5_N，**不要接 IN5_P**；信号发生器和示波器通常通过保护地相连，接线前先关闭信号发生器输出。这一条弄错，代价可能是把信号源或探头搭进去。

**7. 触发不了就加电压。**

源文档的态度很直接：不要一开始使用带负电压的双极性方波，也不要在不能触发时盲目提高输入电压。先用示波器确认信号发生器的实际频率、占空比和 0～5 V 电平，再怀疑 FPGA 那一侧。

**8. 分不清哪一份文件该进哪个 Sources。**

`tb_pulse_width_top.v` 只能进 **Simulation Sources**。源文件清单里它和三个设计文件是分开列的，建工程时按 README 第 5 步的第 4、6 条分开放，综合才不会多出一个顶层候选。

**9. 排查清单。**

| 现象 | 先查什么 |
|---|---|
| `high_count` / `low_count` 一直是 0 | 先看 ILA 里的 `in_level` 有没有跟着外部输入翻转；不翻转就回到极性、接线和信号源电平 |
| 有 `measurement_valid` 但没有 `result_valid` | 等够约 640 ns（64 个系统时钟）的除法时间，或把 `calculation_busy` 一起加进 ILA 看 |
| `frequency_hz` / `duty_x100` 是 0 | 可能是 `period_count` = 0 走了除零分支；确认输入确实在动 |
| 读数与信号发生器对不上 | 先把信号发生器自己接到示波器上核对频率、占空比和 0～5 V 电平 |
| ILA 抓不到完整的计数 | 采样深度不足（1 kHz 一个周期就是 100000 个时钟），换触发条件或加深采样 |
| 计数是一堆看不懂的大数 | 第 8 步：把总线进制设成 Unsigned Decimal |
| 换了板子频率就不对 | 检查 RTL 里写死的 `CLK_FREQ_HZ = 64'd100_000_000` |

## 下一步

- 把 `iverilog` / `vvp` 运行时的完整终端输出（那几行 `MEASURE PASS` / `RESULT PASS` / `ALL TESTS PASSED`）保存下来，替换掉目前只能佐证编译产物的 `pulse_width_tb.out` 片段。
- 器件型号在正文里统一写成 `xc7z035ffg676-2`，本页 frontmatter 的 board 统一写"Zynq-7035 核心板 + 自制 AD/DA 底板"，避免以后再串出 Zynq-7020 这类写法。
- 把写死的 `CLK_FREQ_HZ` 改成参数（或与 `create_clock` 的 10 ns 一起维护），否则换 PL 时钟频率时频率读数会静默地错掉。
- 拿双极性方波做一次对照实验，把源文档"不要一开始使用带负电压的双极性方波"这句话变成有波形的结论。
