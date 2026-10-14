---
title: "实验三：PWM 生成与示波器验证"
description: "计数器与比较值定出占空比，ULN2803 的反相由 RTL 补偿，示波器在物理 OC5 上量到与参数一致的高电平占空比。"
date: 2026-09-20
order: 4
stage: "基础"
status: "已完成"
board: "Zynq-7035 核心板 + 自制 AD/DA 底板"
tools: ["Vivado", "Icarus Verilog", "示波器", "外部直流电源"]
tags: ["Zynq", "PWM", "占空比", "示波器", "仿真"]
accent: "orange"
diagram: "wave"
draft: false
sample: false
---

## 这个实验要做什么

前两个实验都在"往里看"：让 FPGA 看外部的边沿，再把脉宽、频率、占空比数出来。这个实验换方向，第一次让 FPGA **主动输出一路波形给外部设备看**，而且这路波形的频率和占空比都可以用参数调。

PWM 的用处正在这里——它用一路数字方波等效一个模拟量：高电平占比多少，接在后面的负载（LED、加热丝、电机、RC 滤波器）拿到的就是多少"平均能量"。所以 FPGA 想对外表达一个"幅度"时，第一选择往往不是 DAC，而是 PWM：不用额外芯片，只要一根管脚加一个计数器。下面四份 RTL 就是同一套原理的四种玩法：

| 玩法 | 源文件 | 变化的是什么 |
|---|---|---|
| 固定占空比 | `pwm_generator_top.v` | 频率、占空比都由参数写死 |
| 频率扫描 | `freq_sweep_pwm.v` | 占空比固定 50%，频率从低到高自动循环 |
| 占空比 + 频率扫描 | `duty_freq_sweep_pwm.v` | 先扫占空比，再扫频率，两种模式交替 |
| 呼吸灯 | `breath_pwm.v` | 固定载波频率，占空比三角波式来回渐变 |

## 已确认的硬件通道

| 功能 | 底板网络 | 底板到核心板 | FPGA 管脚 | I/O 标准 |
|---|---|---|---|---|
| 100 MHz PL 时钟 | PL_CLK | 核心板板载晶振 | C8 | SSTL135 |
| 开集电极输出通道5 | F_OC5 | HT1-A36 | AC24 | LVCMOS33 |

SCSI1 外部接口相关引脚：

- 17：OC_VCC1，OC1～OC8 的板载 1 kΩ 上拉电源
- 22：OC5，PWM 物理输出
- 29：GND，输出侧参考地

接线前必须根据连接器外壳、丝印或转接板确认 pin 1 方向，避免按镜像方向数脚。

```tcl
# Zynq-7035 核心板板载 100 MHz PL 时钟：PL_CLK -> FPGA C8
set_property PACKAGE_PIN C8 [get_ports clk_100m]
set_property IOSTANDARD SSTL135 [get_ports clk_100m]
create_clock -name clk_100m -period 10.000 [get_ports clk_100m]

# 数字输出通道5：F_OC5 -> HT1-A36 -> FPGA AC24（管脚后接 ULN2803，外部 OC5 开集电极反相输出）
set_property PACKAGE_PIN AC24 [get_ports f_oc5]
set_property IOSTANDARD LVCMOS33 [get_ports f_oc5]
set_property DRIVE 8 [get_ports f_oc5]
set_property SLEW SLOW [get_ports f_oc5]
```

`create_clock -period 10.000` 就是后面所有频率计算的基准：一个时钟 10 ns、100 MHz。`DRIVE 8` 和 `SLEW SLOW` 是给开集电极这一路降边沿速度用的。

### 输出电路极性：参数写 30%，示波器就该看到 30%

这一条要写在最显眼的位置，因为它是本实验里最容易"看反"的地方。OC5 由 ULN2803 开集电极驱动：

- FPGA `f_oc5=1`：ULN2803 导通，物理 OC5 被拉低；
- FPGA `f_oc5=0`：ULN2803 关断，物理 OC5 通过板载 1 kΩ 电阻上拉到 OC_VCC1。

也就是说**管脚逻辑和外部物理电平是反的**。RTL 已经做了反相补偿，所以参数 `DUTY_PERCENT=30` 时，示波器在物理 OC5 上看到的高电平占空比约为 30%，而不是 70%。反过来，在 ILA 里盯着 `f_oc5` 数高电平会数出 70%——那是管脚上的电平，不是示波器上的电平。

<figure class="diagram">
  <svg viewBox="0 0 720 220" role="img" aria-label="OC5 输出通道极性示意图：pwm_level 经过 RTL 取反得到 FPGA 管脚 f_oc5（AC24），再经过 ULN2803 开集电极驱动反相，物理 OC5（SCSI1-22）由 1 kΩ 电阻上拉到 OC_VCC1（SCSI1-17），参考地为 SCSI1-29">
    <g fill="none" stroke="currentColor" stroke-width="2.5">
      <rect x="16" y="70" width="112" height="52" rx="6" /><rect x="140" y="76" width="36" height="40" rx="4" /><rect x="196" y="70" width="150" height="52" rx="6" /><rect x="366" y="70" width="150" height="52" rx="6" /><rect x="536" y="70" width="168" height="52" rx="6" />
      <line x1="128" y1="96" x2="138" y2="96" /><line x1="176" y1="96" x2="194" y2="96" /><line x1="346" y1="96" x2="364" y2="96" /><line x1="516" y1="96" x2="534" y2="96" />
    </g>
    <g fill="none" stroke="currentColor" stroke-width="2" opacity="0.55">
      <line x1="525" y1="96" x2="525" y2="36" /><line x1="620" y1="122" x2="620" y2="150" /><line x1="612" y1="150" x2="628" y2="150" /><line x1="615" y1="156" x2="625" y2="156" /><line x1="617" y1="162" x2="623" y2="162" />
    </g>
    <g fill="currentColor"><polygon points="138,96 130,92 130,100" /><polygon points="194,96 186,92 186,100" /><polygon points="364,96 356,92 356,100" /><polygon points="534,96 526,92 526,100" /><polygon points="525,36 521,46 529,46" /></g>
    <g fill="currentColor" font-size="12" text-anchor="middle">
      <text x="72" y="94">pwm_level</text><text x="158" y="104" font-size="14">~</text><text x="271" y="94">f_oc5</text><text x="441" y="94">ULN2803</text><text x="620" y="94">物理 OC5</text>
      <text x="72" y="111" font-size="11">RTL 期望的波形</text><text x="271" y="111" font-size="11">FPGA AC24</text><text x="441" y="111" font-size="11">开集电极反相</text><text x="620" y="111" font-size="11">SCSI1-22</text>
      <text x="525" y="26" font-size="11">OC_VCC1 + 1 kΩ 上拉（SCSI1-17）</text><text x="620" y="176" font-size="11">GND（SCSI1-29）</text>
    </g>
    <text x="16" y="200" fill="currentColor" font-size="11">f_oc5 = ~pwm_level：f_oc5=1 时 ULN2803 导通、物理 OC5 被拉低；f_oc5=0 时关断、被 1 kΩ 上拉到 OC_VCC1</text>
  </svg>
  <figcaption>图 1：OC5 输出通道的两次反相。RTL 里显式的取反和 ULN2803 开集电极的反相刚好抵消，所以示波器在物理 OC5 上看到的高电平占空比与参数 `DUTY_PERCENT` 一致。图里把"想在物理端看到的波形"（pwm_level）和"管脚上实际写的电平"（f_oc5）分成两个节点，就是为了避免在 ILA 里把两者混起来数。</figcaption>
</figure>

## PWM 生成原理：周期计数 + 比较

PWM 发生器只有两个部件：

1. **周期计数器**：在 100 MHz 时钟下从 0 数到 `PERIOD_COUNT - 1`，然后回零。数满一轮就是一个 PWM 周期，所以 `PERIOD_COUNT` 直接决定输出频率。
2. **比较器**：把当前计数值和比较值 `HIGH_COUNT` 比大小，`计数值 < HIGH_COUNT` 就是高电平。比较值占整个周期的比例，就是占空比。

一个周期里的时钟数只能是整数，所以频率和占空比都落在 100 MHz 的整数分频格子上：

```text
PERIOD_COUNT = 100000000 / PWM_FREQ_HZ
实际频率 = 100000000 / PERIOD_COUNT
```

当 100 MHz 不能被目标频率整除时，实际频率会存在很小的取整误差。注意上面两行的顺序：先由目标频率算出整数 `PERIOD_COUNT`，再用它反算实际频率——**示波器上量到的应该是第二行的结果**。

<figure class="diagram">
  <svg viewBox="0 0 720 320" role="img" aria-label="PWM 生成原理图：上方是一个 PWM 周期内从 0 递增到 PERIOD_COUNT-1 的 pwm_counter 锯齿波，三条虚线分别是 25%、50%、75% 占空比对应的比较值 HIGH_COUNT；下方三行是同一个计数器在三种比较值下得到的 pwm_level 波形，高电平依次变宽">
    <g stroke="currentColor" stroke-width="2" fill="none"><line x1="120" y1="120" x2="105" y2="120" /><line x1="120" y1="34" x2="105" y2="34" /></g>
    <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
      <polyline points="120,120 650,34 650,120 670,115" /><polyline points="110,170 120,170 120,152 253,152 253,170 650,170 650,152 670,152" />
      <polyline points="110,225 120,225 120,207 385,207 385,225 650,225 650,207 670,207" /><polyline points="110,280 120,280 120,262 518,262 518,280 650,280 650,262 670,262" />
    </g>
    <g fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4" opacity="0.45">
      <line x1="120" y1="98" x2="650" y2="98" /><line x1="120" y1="77" x2="650" y2="77" /><line x1="120" y1="56" x2="650" y2="56" />
    </g>
    <g fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 5" opacity="0.2">
      <line x1="253" y1="98" x2="253" y2="170" /><line x1="385" y1="77" x2="385" y2="225" /><line x1="518" y1="56" x2="518" y2="280" />
    </g>
    <g fill="currentColor" font-size="12">
      <text x="8" y="82">pwm_counter</text><text x="8" y="165">占空比 25%</text><text x="8" y="220">占空比 50%</text><text x="8" y="275">占空比 75%</text>
      <text x="104" y="124" font-size="11" text-anchor="end">0</text><text x="104" y="38" font-size="11" text-anchor="end">PERIOD_COUNT-1</text><text x="120" y="20" font-size="11">counter 从 0 数到 PERIOD_COUNT-1；虚线为比较值 HIGH_COUNT</text>
      <text x="654" y="102" font-size="11">H=25%</text><text x="654" y="81" font-size="11">H=50%</text><text x="654" y="60" font-size="11">H=75%</text>
    </g>
  </svg>
  <figcaption>图 2：PWM 生成原理。上面一行是 `pwm_counter` 在一个周期内的锯齿波（数到 `PERIOD_COUNT-1` 后回零），三条虚线是同一个周期下三种占空比各自对应的比较值 `HIGH_COUNT`。下面三行是同一套计数器加比较器在三种比较值下得到的 `pwm_level`：计数器归零的那一刻输出变高，计数器涨到比较值时输出变低，所以**比较值越低，高电平越窄**。三条细竖线把锯齿波与虚线的交点引到对应的输出下降沿上。图里的 `pwm_level` 就是希望在物理 OC5 上看到的波形（管脚 `f_oc5` 与它相反）。</figcaption>
</figure>

## 模块一：固定占空比 pwm_generator_top.v

这是本实验的基准模块，也是唯一有完整约束文件的一个。参数化写在模块声明的参数表里，改参数重新综合就能换波形。

```verilog
// 底板 OC5 使用 ULN2803 开集电极驱动，物理输出与 FPGA 管脚 f_oc5 反相：
//   f_oc5 = 1 -> ULN2803 导通 -> 物理 OC5 为低电平
//   f_oc5 = 0 -> ULN2803 关断 -> 物理 OC5 被 1 kΩ 上拉为高电平
// 因此本模块在输出端进行反相补偿，使示波器上看到的高电平占空比
// 与 DUTY_PERCENT 参数一致。
module pwm_generator_top #(
    parameter integer CLK_FREQ_HZ  = 100_000_000,
    parameter integer PWM_FREQ_HZ  = 1_000,
    parameter integer DUTY_PERCENT = 50
) (
    input  wire clk_100m,
    output wire f_oc5
);

    // 一个 PWM 周期包含的系统时钟数。
    localparam integer PERIOD_COUNT = CLK_FREQ_HZ / PWM_FREQ_HZ;

    // 每个周期内高电平所占的系统时钟数。
    localparam integer HIGH_COUNT =
        (PERIOD_COUNT / 100) * DUTY_PERCENT +
        ((PERIOD_COUNT % 100) * DUTY_PERCENT) / 100;

    localparam integer COUNTER_WIDTH =
        (PERIOD_COUNT <= 1) ? 1 : $clog2(PERIOD_COUNT);

    // Xilinx 7 系列 FPGA 支持寄存器上电初值，因此本实验不额外占用复位引脚。
    (* MARK_DEBUG = "TRUE" *)
    reg [COUNTER_WIDTH-1:0] pwm_counter = {COUNTER_WIDTH{1'b0}};

    always @(posedge clk_100m) begin
        if (pwm_counter >= PERIOD_COUNT - 1)
            pwm_counter <= {COUNTER_WIDTH{1'b0}};
        else
            pwm_counter <= pwm_counter + 1'b1;
    end

    // 这是希望在底板物理 OC5 端观察到的 PWM 逻辑。
    // 对 0% 和 100% 占空比进行单独处理。
    (* KEEP = "TRUE", MARK_DEBUG = "TRUE" *)
    wire pwm_level =
        (DUTY_PERCENT <= 0)   ? 1'b0 :
        (DUTY_PERCENT >= 100) ? 1'b1 :
        (pwm_counter < HIGH_COUNT);

    // 补偿 ULN2803 的反相，使物理 OC5 波形等于 pwm_level。
    assign f_oc5 = ~pwm_level;

endmodule
```

几个值得单独拎出来看的点：

- **`HIGH_COUNT` 用两段乘除写。** 先处理整除 100 的部分、再处理余数部分，避免大整数相乘时中间结果被截断。默认 1 kHz、50% 时 `PERIOD_COUNT = 100000`、`HIGH_COUNT = 50000`、`COUNTER_WIDTH = $clog2(PERIOD_COUNT) = 17`。
- **0% 和 100% 是特判出来的。** `pwm_level` 是个三元表达式：`DUTY_PERCENT <= 0` 直接给 0，`>= 100` 直接给 1，只有中间值才走比较器，意图比"让两端自己退化"明确。
- **计数器位宽跟着 `PERIOD_COUNT` 走，`PERIOD_COUNT = 1` 的退化情况单独保护成 1 位。**
- **没有复位引脚。** 源文件注释说得很清楚：Xilinx 7 系列 FPGA 支持寄存器上电初值，所以 `pwm_counter` 直接在声明处赋 `{COUNTER_WIDTH{1'b0}}`，不额外占用一个复位脚。
- **`pwm_level` 挂了 `KEEP` 和 `MARK_DEBUG`。** `KEEP` 防止综合把它优化掉，`MARK_DEBUG` 让它在 Set Up Debug 里可以被加进 ILA；`pwm_counter` 只挂了 `MARK_DEBUG`。

## 模块二：freq_sweep_pwm.v（频率扫描）

占空比固定约 50%，让**周期值**从 `PERIOD_MAX` 一步一步减到 `PERIOD_MIN`，频率就自动从低到高爬升；爬到顶再跳回起点重新扫。关键在最后那句 `assign f_oc1 = ~(pwm_cnt < (period >> 1));`：比较值不是常量，而是当前周期值的一半，所以周期怎么变，占空比都锁在 50% 附近。

```verilog
module freq_sweep_pwm
#(
    // ----- 可配置参数 -----
    parameter CLK_FREQ   = 100_000_000,   // 系统时钟频率 (Hz)
    parameter F_MIN      = 1_000,         // 起始(最低)输出频率 (Hz)
    parameter F_MAX      = 10_000,        // 结束(最高)输出频率 (Hz)
    parameter SWEEP_MS   = 2000           // 一次"低 -> 高"扫描的时长 (ms)
)
(
    input  wire clk,        // 系统时钟
    output wire f_oc1       // 扫频输出
);

    // 由频率算周期：period = CLK_FREQ / 频率
    localparam PERIOD_MAX  = CLK_FREQ / F_MIN;   // 最低频对应的周期
    localparam PERIOD_MIN  = CLK_FREQ / F_MAX;   // 最高频对应的周期
    localparam PERIOD_W    = $clog2(PERIOD_MAX); // 周期计数器位宽

    // 每走完 STEP_CLKS 个时钟，period 减 1 => 频率升高一点
    localparam TOTAL_STEPS = PERIOD_MAX - PERIOD_MIN;                 // 扫描总步数
    localparam STEP_CLKS   = (CLK_FREQ / 1000 * SWEEP_MS) / TOTAL_STEPS;
    localparam STEP_CNT_W  = $clog2(STEP_CLKS);

    reg [PERIOD_W-1:0]  pwm_cnt;    // 当前周期内的位置计数
    reg [PERIOD_W-1:0]  period;     // 当前 PWM 周期（决定输出频率）
    reg [STEP_CNT_W-1:0] step_cnt;  // 步进计时器

    // PWM 周期计数器 - 模值 period 可变，这就是"变频"的关键
    always @(posedge clk) begin
        if (pwm_cnt >= period - 1)
            pwm_cnt <= 0;
        else
            pwm_cnt <= pwm_cnt + 1'b1;
    end

    // 步进计时器（此处省略实现）：每 STEP_CLKS 个时钟产生一次 step_tick。
    // 频率扫描 - period 从 PERIOD_MAX 递减到 PERIOD_MIN（频率从低到高）
    // 到达 F_MAX 后回到 F_MIN，开始下一轮扫描
    // 若想"高->低->高"往返扫描，参照 breath_pwm.v 里 dir 标志的写法即可
    initial period = PERIOD_MAX;    // 上电从最低频开始
    always @(posedge clk) begin
        if (step_tick) begin
            if (period > PERIOD_MIN)
                period <= period - 1'b1;
            else
                period <= PERIOD_MAX;
        end
    end

    // PWM 输出 - 占空比固定约 50%：前半周期高，后半周期低
    // （保留原代码的取反，即 1=灭/低有效；不需要就去掉 ~）
    assign f_oc1 = ~(pwm_cnt < (period >> 1));

endmodule
```

默认参数下：`PERIOD_MAX = CLK_FREQ / F_MIN = 100000`、`PERIOD_MIN = CLK_FREQ / F_MAX = 10000`、`PERIOD_W = $clog2(PERIOD_MAX) = 17`、`TOTAL_STEPS = PERIOD_MAX - PERIOD_MIN = 90000`、`STEP_CLKS = (CLK_FREQ / 1000 * SWEEP_MS) / TOTAL_STEPS = 2222`。

扫频方向只有"低 → 高"一种，扫到 `F_MAX` 就跳回 `F_MIN`。源文件注释给了改法：想做成"高 → 低 → 高"的往返扫描，照 `breath_pwm.v` 里 `dir` 标志的写法加一个方向位即可——这句话把两个模块的设计套路串起来了。

## 模块三：duty_freq_sweep_pwm.v（占空比 + 频率扫描）

这个模块把前两种玩法合起来，按时分复用：先跑 `MODE_MS` 毫秒的占空比循环（0% → 约 100% → 0%），再跑 `MODE_MS` 毫秒的频率扫描（`F_MIN` → `F_MAX`，固定约 50% 占空比），两种模式不断交替。模式计时器数到 `MODE_CLKS - 1` 就把 `mode` 取反（这段代码下面没有重复贴出）；上电初值是 `MODE_DUTY`，所以先跑占空比。

占空比那一半和前两个模块都不一样：它不用固定的 `HIGH_COUNT`，而是让 `duty` 自己在 `0 ~ PWM_MAX` 之间来回爬，载波频率固定不动（`CLK_FREQ / 2^PWM_WIDTH`，默认约 97.656 kHz）。

```verilog
    localparam integer MODE_CLKS  = (CLK_FREQ / 1000) * MODE_MS;
    localparam integer MODE_CNT_W = (MODE_CLKS <= 1) ? 1 : $clog2(MODE_CLKS);
    localparam integer ACC_W      = MODE_CNT_W + 1;

    // 使用累加器把 DUTY_STEPS 次变化均匀分布在完整的 MODE_MS 时间内。
    // 相比直接使用整数 STEP_CLKS，可避免整数除法余数造成扫描时间偏差。
    always @(posedge clk) begin
        if (mode != MODE_DUTY) begin
            duty_step_acc <= {ACC_W{1'b0}};
            duty          <= {PWM_WIDTH{1'b0}};
            duty_dir      <= 1'b0;
        end
        else begin
            if (duty_step_acc >= MODE_CLKS - DUTY_STEPS) begin
                duty_step_acc <= duty_step_acc + DUTY_STEPS - MODE_CLKS;

                if (!duty_dir) begin
                    if (duty < PWM_MAX)
                        duty <= duty + 1'b1;
                    else begin
                        duty_dir <= 1'b1;
                        duty     <= duty - 1'b1;
                    end
                end
                else begin
                    if (duty > 0)
                        duty <= duty - 1'b1;
                    else begin
                        duty_dir <= 1'b0;
                        duty     <= duty + 1'b1;
                    end
                end
            end
            else begin
                duty_step_acc <= duty_step_acc + DUTY_STEPS;
            end
        end
    end
```

**那个累加器是这一节最值得抄的写法。** `duty_step_acc` 每个时钟加 `DUTY_STEPS`，一旦越过 `MODE_CLKS` 就减掉 `MODE_CLKS` 并推进一步占空比。这就是"用宽累加器做分频"的标准做法，把 `DUTY_STEPS` 次变化均匀撒在 `MODE_CLKS` 个时钟里。源文件注释把理由写得很直白：相比直接把 `MODE_CLKS / DUTY_STEPS` 取整得到一个 `STEP_CLKS`，这样可以避免整数除法余数造成的扫描时间偏差——正好补上了 `freq_sweep_pwm.v` 里那个 2222 的截断。

频率那一半是同样的累加器思路，只是推进的对象换成了 `period`：`freq_step_acc` 越过 `MODE_CLKS` 时让 `period` 减一，减到 `PERIOD_MIN` 就停住；退出频率模式时把 `period` 复位回 `PERIOD_MAX`、累加器清零。输出选择就是把两路合到一根管脚上：

```verilog
    assign duty_pwm_value = (duty_pwm_cnt < duty);
    assign freq_pwm_value = (freq_pwm_cnt < (period >> 1));

    assign f_oc1 = (mode == MODE_DUTY) ? ~duty_pwm_value : ~freq_pwm_value;
```

默认参数下：`MODE_CLKS = (CLK_FREQ / 1000) * MODE_MS = 200000000`，`MODE_CNT_W = $clog2(MODE_CLKS) = 28`、`ACC_W = 29`，`PWM_MAX = (1 << PWM_WIDTH) - 1 = 1023`、`DUTY_STEPS = 2 * PWM_MAX = 2046`，`FREQ_STEPS = PERIOD_MAX - PERIOD_MIN = 90000`。

模块末尾有一个完整的 `initial` 块，把 `mode`、`mode_cnt`、`duty_pwm_cnt`、`duty`、`duty_dir`、`duty_step_acc`、`period`、`freq_pwm_cnt`、`freq_step_acc` 全部初始化。源文件注释同样说明：本模块没有复位端口，使用 `initial` 设置 FPGA 上电初值，Vivado 可综合该写法。

## 模块四：breath_pwm.v（呼吸灯）

呼吸灯的思路是：**载波频率完全不动**，只让占空比缓慢地由小到大再由大到小，看上去就是亮度在"呼吸"。所以载波计数器是一个自由运行的 10 位计数器，模值固定 `PWM_MAX + 1 = 1024`。

```verilog
module breath_pwm
#(
    // ----- 可配置参数 -----
    parameter CLK_FREQ      = 100_000_000,   // 系统时钟频率 (Hz)
    parameter PWM_WIDTH     = 10,           // PWM 分辨率位数 (10位 = 1024级占空比调节)
    parameter BREATH_MS     = 2000          // 一次完整呼吸周期 (ms)，2秒吸+呼
)
(
    input  wire clk,        // 系统时钟
    output wire f_oc1          // f_oc1 输出 (1=亮, 0=灭)
);

    localparam PWM_MAX = (1 << PWM_WIDTH) - 1;              // PWM 最大计数值

    // 计算每一步占空比变化的时钟周期数
    // 总步数 = 2 * (PWM_MAX+1)  （上升 + 下降）
    // 每步时间 = BREATH_MS / 总步数 (ms)
    // 每步时钟 = 每步时间 * CLK_FREQ / 1000
    localparam TOTAL_STEPS   = 2 * (PWM_MAX + 1);            // 上升+下降总步数
    localparam STEP_CLKS     = (CLK_FREQ / 1000 * BREATH_MS) / TOTAL_STEPS;
    localparam STEP_CNT_W    = $clog2(STEP_CLKS);            // 步进计数器位宽

    reg [PWM_WIDTH-1:0] pwm_cnt;        // PWM 自由运行计数器
    reg [PWM_WIDTH-1:0] duty;           // 当前占空比 (0 ~ PWM_MAX)
    reg [STEP_CNT_W-1:0] step_cnt;      // 步进定时器
    reg                  dir;           // 占空比变化方向: 0=增亮, 1=变暗

    // PWM 计数器 - 自由运行，决定 PWM 频率
    // PWM 频率 = CLK_FREQ / (PWM_MAX + 1)
    // 例: 100MHz / 1024 ≈ 97.66 kHz (远超人眼闪烁感知)
    always @(posedge clk ) begin
            pwm_cnt <= pwm_cnt + 1'b1;
    end

    // 占空比控制 - 三角波：0 → PWM_MAX → 0 → PWM_MAX → ...
    // （step_tick 由步进定时器产生：每 STEP_CLKS 个时钟拉高一拍）
    always @(posedge clk ) begin

        if (step_tick) begin
            if (!dir) begin
                // 增亮阶段
                if (duty == PWM_MAX) begin
                    dir  <= 1'b1;
                    duty <= duty - 1'b1;
                end else begin
                    duty <= duty + 1'b1;
                end
            end
            else begin
                // 变暗阶段
                if (duty == 0) begin
                    dir  <= 1'b0;
                    duty <= duty + 1'b1;
                end
                else begin
                    duty <= duty - 1'b1;
                end
            end
        end
    end

    // PWM 输出 - 比较器
    // pwm_cnt < duty 时 f_oc1 亮，否则灭
    assign f_oc1 = ~(pwm_cnt < duty);
```

默认参数下：`PWM_MAX = 1023`、`TOTAL_STEPS = 2 * (PWM_MAX + 1) = 2048`、`STEP_CLKS = (CLK_FREQ / 1000 * BREATH_MS) / TOTAL_STEPS = 97656`、`STEP_CNT_W = $clog2(STEP_CLKS) = 17`，载波频率 `CLK_FREQ / (PWM_MAX + 1)` 约 97.66 kHz。

源文件注释里那句"远超人眼闪烁感知"解释了为什么载波要走这么快：人眼看到的是 97.66 kHz 方波的平均值，也就是占空比对应的亮度；载波本身快到看不出来，只有占空比的缓慢变化才表现为"呼吸"。

### 四个模块的默认参数一览

| 模块 | 输出端口 | 频率 | 占空比 | 关键参数 |
|---|---|---|---|---|
| `pwm_generator_top.v` | `f_oc5` | 1 kHz（参数） | 50%（参数） | `PWM_FREQ_HZ`、`DUTY_PERCENT` |
| `freq_sweep_pwm.v` | `f_oc1` | 1 kHz → 10 kHz 循环 | 固定约 50% | `F_MIN`、`F_MAX`、`SWEEP_MS` |
| `duty_freq_sweep_pwm.v` | `f_oc1` | 扫频模式 1 kHz → 10 kHz；占空比模式载波约 97.656 kHz | 0% → 约 100% → 0% 循环 | `F_MIN`、`F_MAX`、`MODE_MS`、`PWM_WIDTH` |
| `breath_pwm.v` | `f_oc1` | 固定约 97.66 kHz | 0 → `PWM_MAX` → 0 三角波 | `PWM_WIDTH`、`BREATH_MS` |

四份代码共用的骨架就是图 2 那两行：一个计数器加一次比较。区别只在"谁在变"——变比较值就是调占空比，变计数器的模值就是调频率，让比较值自己缓慢漂移就是呼吸灯。

## 怎么修改输出频率和占空比

在 `pwm_generator_top.v` 模块参数中修改：

```verilog
parameter integer PWM_FREQ_HZ  = 1_000,
parameter integer DUTY_PERCENT = 50
```

示例：

| 目标波形 | `PWM_FREQ_HZ` | `DUTY_PERCENT` |
|---|---:|---:|
| 1 kHz、50% | 1_000 | 50 |
| 10 kHz、25% | 10_000 | 25 |
| 100 kHz、75% | 100_000 | 75 |

每次修改参数后，需要重新运行综合、实现并生成 bitstream。

实际频率由整数分频决定：

```text
PERIOD_COUNT = 100000000 / PWM_FREQ_HZ
实际频率 = 100000000 / PERIOD_COUNT
```

当 100 MHz 不能被目标频率整除时，实际频率会存在很小的取整误差。上表三个目标频率都能整除（100000、10000、1000），属于"整除档"；换一个除不尽的频率，示波器上量到的就是"实际频率"那一行算出来的值。

## Vivado 操作

1. 新建 RTL Project，器件选择开发板实际使用的 XC7Z035 FFG676、-2 速度等级；
2. 添加 `pwm_generator_top.v` 为 Design Source，并设为顶层；
3. 添加 `pwm_generator_top.xdc` 为 Constraints；
4. 运行 Synthesis；
5. 运行 Implementation；
6. 运行 Generate Bitstream；
7. 开发板上电并连接 JTAG；
8. 在 Hardware Manager 中下载 bitstream。

若使用 ILA，可观察 `pwm_counter` 和 `pwm_level`。其中 `pwm_level` 表示预期在物理 OC5 上看到的波形。`pwm_counter` 用来核对周期有没有数对（每周期数到 `PERIOD_COUNT - 1`），`pwm_level` 用来直接看"示波器应该看到的那个波形"对不对；因为 `pwm_level` 挂了 `KEEP`，它不会被综合优化掉，Set Up Debug 里能直接加进 ILA。

## 外部接口接线

本实验不需要信号发生器。OC5 是开集电极输出，**必须给 OC_VCC1 提供上拉电源**，否则 OC5 不能形成正常高电平。

建议第一次使用 3.3 V：

```text
外部直流电源 +3.3 V  → SCSI1-17（OC_VCC1）
外部直流电源 GND     → SCSI1-29（GND）
示波器探头尖端       → SCSI1-22（OC5）
示波器地夹           → SCSI1-29（GND）
```

也可以按原实验1方案使用 5 V 上拉，但第一次测试推荐 3.3 V。不要把电源正负极接反，也不要把示波器地夹接到 OC5：不给上拉，开集电极只有"拉低"能力，量不到正常高电平；电源接反会直接顶到板上器件；地夹接到 OC5 等于把输出短到地。

上拉电压还决定了输出高电平的幅度：`OC_VCC1` 给多少伏，物理 OC5 的高电平就接近多少伏。所以下面的验证条目里写的是"高电平接近 OC_VCC1"，而不是写死某个电压值。

## 示波器验证要点

建议依次测试：

1. 1 kHz、50%；
2. 10 kHz、25%；
3. 10 kHz、75%；
4. 100 kHz、50%。

示波器应测得：

```text
频率 ≈ PWM_FREQ_HZ
高电平占空比 ≈ DUTY_PERCENT
幅度：低电平接近 0 V，高电平接近 OC_VCC1
```

例如 1 kHz、25%：

```text
周期 = 1 ms
高电平宽度 ≈ 250 us
低电平宽度 ≈ 750 us
```

第 4 步是这几组里最"紧"的：周期只有 10 us。源文档对高频下的现象说得很明确——由于 ULN2803、上拉电阻、负载电容和示波器探头会影响上升/下降时间，高频时边沿会比 RTL 仿真更缓慢，占空比也可能出现小幅偏差。所以前几步对不上，先怀疑接线、上拉电源和参数；第 4 步的偏差先看边沿是不是已经被拖成梯形，再决定要不要动 RTL。

## 仿真结果

测试平台使用 100 MHz 时钟生成 100 kHz、30% PWM，验证的是"物理 OC5 端的高电平占空比"，而不是管脚 `f_oc5` 上的占空比——testbench 专门为这件事加了一个反相节点：

```verilog
    // 为缩短仿真时间，测试时使用 100 kHz、30% 占空比。
    // 100 MHz / 100 kHz = 1000 个时钟/周期，其中 300 个时钟为物理高电平。
    localparam integer TEST_PERIOD_COUNT = 1000;
    localparam integer EXPECT_HIGH_COUNT = 300;
    localparam integer EXPECT_LOW_COUNT  = 700;

    pwm_generator_top #(
        .CLK_FREQ_HZ  (100_000_000),
        .PWM_FREQ_HZ  (100_000),
        .DUTY_PERCENT (30)
    ) dut (
        .clk_100m (clk_100m),
        .f_oc5    (f_oc5)
    );

    // 物理 OC5 经过 ULN2803 后再次反相，因此等效为 ~f_oc5。
    wire physical_oc5 = ~f_oc5;
```

判定分三层：先在一个完整周期里数高低电平的个数有没有 X/Z，再比 300 / 700，最后用两个物理上升沿量周期和高电平宽度（期望分别是 10000 ns 和 3000 ns）。README 第 8 节记录的期望值是：周期 10 us、物理高电平宽度 3 us、每周期物理高电平 300 个时钟、每周期物理低电平 700 个时钟。这四行彼此自洽：`100 MHz / 100 kHz = 1000` 个时钟一个周期；30% × 1000 = 300 个时钟高电平、700 个低电平；300 个 10 ns 就是 3 us。

源目录里的 `pwm_tb.out` 是 Icarus Verilog 的 vvp 编译产物（文件头是 `:ivl_version "12.0"`），不是运行日志。它能佐证的是编译进去的常量和判定字符串：

```text
:ivl_version "12.0 (devel)" "(s20150603-1539-g2693dd32b)";
P_... .param/l "CLK_FREQ_HZ"   0 4 14, +C4<00000101111101011110000100000000>;   # 100000000
P_... .param/l "PWM_FREQ_HZ"   0 4 15, +C4<00000000000000011000011010100000>;   # 100000
P_... .param/l "DUTY_PERCENT"  0 4 16, +C4<00000000000000000000000000011110>;   # 30
P_... .param/l "PERIOD_COUNT"  1 4 23, +C4<00000000000000000000001111101000>;   # 1000
P_... .param/l "HIGH_COUNT"    1 4 26, +C4<00000000000000000000000100101100>;   # 300
P_... .param/l "COUNTER_WIDTH" 1 4 30, +C4<00000000000000000000000000001010>;   # 10
...
%vpi_call/w ... "$display", "FAIL: physical_oc5 contains X/Z at time %0t", ...
%vpi_call/w ... "$display", "FAIL: high cycles=%0d, expected=%0d", ...
%vpi_call/w ... "$display", "FAIL: period=%0d ns, expected=10000 ns", ...
%vpi_call/w ... "$display", "PASS: PWM frequency=100 kHz, duty=30%%"
%vpi_call/w ... "$display", "PASS: period=%0d ns, high width=%0d ns", ...
```

这几行参数常量本身就是一次核对：`PERIOD_COUNT = 1000`、`HIGH_COUNT = 300`、`COUNTER_WIDTH = 10`，正好等于 `100 MHz / 100 kHz`、30% × 1000 和 `$clog2(1000)`。**但这些只是编译进产物的常量，不等于仿真真的跑出了 PASS。** README 第 8 节的结论是"已使用 Icarus Verilog 编译运行并通过检查"。

## 踩过的坑

**1. 极性反相一次，但只在管脚上反。**

`f_oc5 = ~pwm_level`，而 ULN2803 又是一级反相，两次反相抵消，所以示波器上量到的占空比与 `DUTY_PERCENT` 一致。这个结论只在"底板确实用 ULN2803 开集电极驱动"时成立——换个驱动电路就得重新算一遍。在 ILA 里对着 `f_oc5` 数高电平会得到 100 − `DUTY_PERCENT`，这不是参数写错了。

**2. 不给 OC_VCC1 上拉，就什么波形都没有；地夹再接错，就是短路。**

OC5 是开集电极：FPGA 侧只能把线拉低，"高"必须靠外部上拉产生。所以接线表里第一行不是信号线，而是上拉电源。源文档把这句话放在接线一节的第一句：必须给 OC_VCC1 提供上拉电源，否则 OC5 不能形成正常高电平。另外两个"不要"（不要把电源正负极接反，也不要把示波器地夹接到 OC5）也是同一节的原文：地夹应该接 SCSI1-29（GND），探头尖端接 SCSI1-22（OC5）。

**3. 参数改完没重新综合。**

`PWM_FREQ_HZ` 和 `DUTY_PERCENT` 是**综合期**的模块参数（`parameter integer`），不是运行时寄存器。改完必须重新综合、实现、Generate Bitstream 再下载——只重新下载 bit 文件是没用的。同理，`PERIOD_COUNT`、`HIGH_COUNT`、`COUNTER_WIDTH` 都是 `localparam`，由参数在综合时算出来。

**4. 数出来的频率"差一点"，或者拿 `period` 去解释 50% 占空比。**

`PERIOD_COUNT = 100000000 / PWM_FREQ_HZ` 是整数除法，除不尽时实际频率会存在很小的取整误差，示波器上量到的是 `100000000 / PERIOD_COUNT`：这不是仪器不准，是分频格子只有 10 ns 一格。扫频模块的占空比也不是常量比较值，而是 `period >> 1`——`period` 每变一步比较值跟着变，`period` 是奇数时还会有半拍取整。

**5. 三个模块的输出端口是 f_oc1，不是 f_oc5。**

`pwm_generator_top.v` 的输出是 `f_oc5`（AC24），而 `freq_sweep_pwm.v`、`duty_freq_sweep_pwm.v`、`breath_pwm.v` 的输出都是 `f_oc1`。源目录里只有 `pwm_generator_top.xdc` 这一份约束。把后三个模块直接拿来上板，需要在约束里补上 OC1 那一跳的管脚，或者把输出改到已约束的 `f_oc5`。

**6. 用管脚输出直接点灯，亮度可能是反的。**

三个扫描模块的输出都带取反（`~`），而 `breath_pwm.v` 的端口注释写"1=亮, 0=灭"，`freq_sweep_pwm.v` 的注释却写"1=灭/低有效"。两者字面相反，源文件里唯一确定的是表达式里的那个 `~`。接 LED 之前先用示波器确认有效电平，别凭注释接线。

**7. 排查清单。**

| 现象 | 先查什么 |
|---|---|
| 示波器上是一条直线 | 先看 OC_VCC1（SCSI1-17）有没有给上拉电源，再看参数是否被写成了 0% / 100%、下载的还是不是上一次的 bit |
| 频率对，占空比是 100 − 参数值 | 大概率在数管脚 `f_oc5` 而不是物理 OC5；物理端已被 ULN2803 反相补偿过 |
| 频率差一点点 | 目标频率除不尽 100 MHz，用 `实际频率 = 100000000 / PERIOD_COUNT` 重算 |
| 改了参数波形没变 | 参数是综合期的，重新综合 + 实现 + Generate Bitstream + 下载 |
| 高频时占空比有偏差、边沿变缓 | ULN2803、上拉电阻、负载电容、探头共同作用，属源文档已说明的现象 |
| ILA 里找不到想看的信号 | `pwm_counter` 和 `pwm_level` 才有 `MARK_DEBUG`；`pwm_level` 另有 `KEEP` |
| `f_oc1` 上没有波形 | 后三个模块的输出端口是 `f_oc1`，而源目录只给了 `f_oc5`(AC24) 的约束 |

## 下一步

- 把这四份 RTL 里"低有效/高有效"的说法统一一次：目前 `breath_pwm.v` 的端口注释写"1=亮, 0=灭"，`freq_sweep_pwm.v` 写"1=灭/低有效"，而两者代码都是 `~`。先定下物理语义，再改注释。
- 给 `f_oc1` 这一路补约束（管脚 + IOSTANDARD + DRIVE/SLEW），或者把三个扫描模块的输出统一改到已约束的 `f_oc5`，否则后三种玩法只能靠默认管脚上板。
- 把 `freq_sweep_pwm.v` 里 `STEP_CLKS` 的整数截断换成 `duty_freq_sweep_pwm.v` 那个累加器写法，让两个模块的扫描时长口径一致。
- 给 `breath_pwm.v` 补一个 `initial` 块（或声明处初值），把上电起点从"器件默认值"变成"代码里写明的东西"。
