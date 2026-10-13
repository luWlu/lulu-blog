---
title: "实验四：模拟量采集（AD 采集 + 滑窗滤波 + 最小二乘校准）"
description: "从信号链和 LTC2328-16 串行时序讲起，用滑窗滤波与最小二乘校准把 FPGA 采到的码值变成可信的电压读数。"
date: 2026-09-28
order: 5
stage: "进阶"
status: "已完成"
board: "Zynq-7035 核心板 + 自制 AD/DA 底板"
tools: [Vivado 2020.2, Icarus Verilog, Node.js, GTKWave]
tags: ["Zynq", "AD采集", "LTC2328", "滑窗滤波", "最小二乘校准"]
accent: "purple"
diagram: "circuit"
draft: false
sample: false
---

## 这个实验要做什么

前面几个实验处理的大多是开关量、脉冲和数字接口，这一次把模拟电压接进 FPGA。

目标很具体：把一路直流或交流模拟电压接到板子的采集通道上，FPGA 内部依次完成四件事——控制 ADC 把数据读出来、对码值做滑动窗口平均、把码值换算成毫伏、再用最小二乘拟合出来的系数做一次校准，最后把结果送到 ILA 和 LED 上读数。

数据通路是这样的：

```text
传感器/信号源 ──▶ 分压 ──▶ AD8421 ──▶ LTC2328-16 ──IL716隔离──▶ FPGA
                                                              │
   ①ADC控制      ②滑窗滤波        ③码值→毫伏      ④LSQ校准   ▼
   ltc2328_master → sliding_avg → code_to_mv → calib_lsq → ILA/LED 读数
```

每一级对应一个 RTL 模块，串起来就是顶层的 `ad_capture_top.v`。四个模块各自都不复杂，难点在于**把模拟侧的物理量、器件手册的时序参数和 RTL 里的计数器对齐**：动一个分频系数、改一个等待拍数，都可能在仿真里通过、在板子上出错。

最终要完成并提交的东西：

| 交付物 | 内容 |
|---|---|
| 代码 | 4 个 RTL 模块 + 顶层 + XDC（工程目录已备好，要求能讲解） |
| 仿真 | 5 个测试平台全部 PASS（含"加噪声后滤波有效"的验证） |
| 上板 | 信号发生器给定电压，ILA 读数与万用表一致（校准后误差 < 0.5%） |
| 校准 | 校准数据表 + 拟合系数（a、b、R²）+ 校准前后误差对比 |
| 报告 | 见文末「实验报告要点」一章 |

实验器材：Zynq-7035 开发板（MZ7XCORE676B 核心板 + SOC 多功能底板）、信号发生器、示波器、万用表、USB 下载线；工具是 Vivado 2020.2、Icarus Verilog（`C:\iverilog\bin`）和 Node.js（跑校准脚本）。

<div class="shot-placeholder"><strong>截图待补</strong>：需要一张实验台全景照片（来源：自己拍摄，含 Zynq-7035 开发板、信号发生器、示波器、万用表与 SCSI2 接线）</div>

## 硬件原理：先看懂信号链

模拟前端在自制底板 `ad&da.SchDoc` 上，从输入端子到 FPGA 一共经过五个环节，两个通道完全对称（A1/A2 → 通道 1/2）。

### 电路组成

| 环节 | 器件 | 作用 |
|---|---|---|
| 衰减网络 | 500k / 150k / 500k | 把大电压衰减到 ADC 量程内 |
| 仪表放大器 | AD8421（G=1） | 高阻缓冲 + 差分转单端 |
| ADC | LTC2328-16 | 16 位、1 Msps、真双极性 ±10.24V 伪差分输入 |
| 数字隔离 | IL716 | 模拟侧与数字侧电气隔离，抑制地环路噪声 |
| 隔离电源 | A1215S → ISO±15V，L78L05 → ISO+5V | 给 AD8421 / LTC2328 供电 |

<figure class="diagram"><svg viewBox="0 0 720 280" role="img" aria-label="模拟量采集信号链框图：输入端子经 500k/150k/500k 衰减、AD8421 仪表放大器、LTC2328-16 ADC、IL716 数字隔离进入 FPGA 数据通路">
  <g stroke="currentColor" stroke-width="3" fill="none">
    <line x1="64" y1="100" x2="92" y2="100" />
    <line x1="168" y1="100" x2="196" y2="100" />
    <line x1="264" y1="100" x2="292" y2="100" />
    <line x1="400" y1="100" x2="428" y2="100" />
    <line x1="524" y1="100" x2="552" y2="100" />
    <line x1="636" y1="100" x2="668" y2="100" />
  </g>
  <text x="56" y="140" font-size="13" fill="currentColor" text-anchor="middle" opacity="0.75">输入端子</text>
  <g stroke="currentColor" stroke-width="2.5" fill="none">
    <rect x="92" y="66" width="72" height="68" rx="8" />
    <rect x="196" y="66" width="64" height="68" rx="8" />
    <rect x="292" y="66" width="104" height="68" rx="8" />
    <rect x="428" y="66" width="92" height="68" rx="8" />
    <rect x="552" y="46" width="116" height="134" rx="8" />
  </g>
  <text x="128" y="150" font-size="12" fill="currentColor" text-anchor="middle" opacity="0.75">500k/150k/500k</text>
  <text x="228" y="150" font-size="12" fill="currentColor" text-anchor="middle" opacity="0.75">AD8421</text>
  <text x="344" y="150" font-size="12" fill="currentColor" text-anchor="middle" opacity="0.75">LTC2328-16</text>
  <text x="474" y="150" font-size="12" fill="currentColor" text-anchor="middle" opacity="0.75">IL716 隔离</text>
  <text x="128" y="96" font-size="13" fill="currentColor" text-anchor="middle">分压</text>
  <text x="128" y="115" font-size="11" fill="currentColor" text-anchor="middle" opacity="0.75">×3/23</text>
  <text x="228" y="96" font-size="13" fill="currentColor" text-anchor="middle">仪表放大</text>
  <text x="228" y="115" font-size="11" fill="currentColor" text-anchor="middle" opacity="0.75">G=1</text>
  <text x="344" y="96" font-size="13" fill="currentColor" text-anchor="middle">16 位 SAR ADC</text>
  <text x="344" y="115" font-size="11" fill="currentColor" text-anchor="middle" opacity="0.75">±10.24V</text>
  <text x="474" y="96" font-size="13" fill="currentColor" text-anchor="middle">数字隔离</text>
  <text x="474" y="115" font-size="11" fill="currentColor" text-anchor="middle" opacity="0.75">CNV/SCK/SDO</text>
  <text x="610" y="100" font-size="13" fill="currentColor" text-anchor="middle">FPGA</text>
  <text x="610" y="120" font-size="11" fill="currentColor" text-anchor="middle" opacity="0.75">Zynq-7035</text>
  <g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.45" stroke-dasharray="6 5">
    <rect x="516" y="196" width="196" height="62" rx="8" />
    <rect x="176" y="196" width="316" height="62" rx="8" />
  </g>
  <text x="614" y="220" font-size="12" fill="currentColor" text-anchor="middle">① ltc2328_master</text>
  <text x="614" y="240" font-size="12" fill="currentColor" text-anchor="middle">② sliding_avg</text>
  <text x="334" y="220" font-size="12" fill="currentColor" text-anchor="middle">③ code_to_mv</text>
  <text x="334" y="240" font-size="12" fill="currentColor" text-anchor="middle">④ calib_lsq</text>
  <g stroke="currentColor" stroke-width="2" fill="none" opacity="0.5">
    <line x1="610" y1="180" x2="610" y2="196" />
  </g>
  </svg>
  <figcaption>图 1：模拟量采集信号链与 FPGA 内部四级处理</figcaption>
</figure>

### 三个必须记住的换算关系

**(1) 输入衰减比**

```text
V(ADC引脚) = V(输入端) × 150 / (500+150+500) = V(输入端) × 3/23
⇒ V(输入端) = V(ADC引脚) × 23/3 ≈ × 7.6667
```

**(2) ADC 量化**

```text
满量程 ±10.24V（20.48V），16 位二的补码
1 LSB = 20480 mV / 65536 = 0.3125 mV（ADC 引脚处）
code = round(V(ADC引脚)[mV] / 0.3125)
```

**(3) 合并：码值 → 输入端电压**

```text
V(输入端)[mV] = code × 0.3125 × (23/3) = code × 115/48 ≈ code × 2.3958 mV
外部差模满量程 = ±32768 × 2.3958 mV ≈ ±78.5 V
```

这三个式子是整篇文章的骨架。后面 `code_to_mv.v` 里除的那个常数 12288，就是从这里来的。举例：ILA 读到 `code = 16000` ⇒ `V = 16000 × 115/48 = 38333 mV ≈ 38.33 V`。

<div class="shot-placeholder"><strong>截图待补</strong>：需要一张底板 `ad&da.SchDoc` 中衰减网络 + AD8421 + LTC2328-16 部分的原理图截图（来源：Altium 打开底板工程后截图）</div>

### LTC2328-16 的接口时序

RTL 里所有计数器的取值，依据都是这张表：

| 参数 | 手册值 | 本实验取值 | 含义 |
|---|---|---|---|
| tCNVH | ≥ 20 ns | 40 ns（4 拍） | CNV 高电平宽度 |
| tCONV | ≤ 527 ns | 600 ns（60 拍） | 转换时间 |
| tCYC | ≥ 1 µs | 10 µs（100 kSPS） | 采样周期 |
| tSCK | ≥ 10 ns | 80 ns（12.5 MHz） | SCK 周期（故意放慢，见下） |
| tDSDO | ≤ 9.5 ns | — | SCK↑ 后 SDO 数据有效的延迟 |

**读出方式**（`RDL/SDI/CHAIN` 接地，非菊花链）：

```text
         ┌──┐   ┌┐┌┐┌┐┌┐ ... ┌┐┌┐      16 个 SCK 上升沿
CNV   ───┘  └───────────────────────
         ←tCONV→
SDO   ──────X D15 X D14 X D13 ... X D0 ──
              ↑转换结束直接给出MSB    每个SCK↑移出下一位
```

<figure class="diagram"><svg viewBox="0 0 720 340" role="img" aria-label="LTC2328-16 串行读出时序图：CNV 高脉冲启动转换，等待 tCONV 后 SDO 输出最高位 D15，随后 16 个 SCK 周期依次移出各位">
  <text x="64" y="30" font-size="13" fill="currentColor">CNV</text>
  <text x="64" y="96" font-size="13" fill="currentColor">SDO</text>
  <text x="64" y="150" font-size="13" fill="currentColor">SCK</text>
  <g stroke="currentColor" stroke-width="2.5" fill="none">
    <path d="M130 60 L170 60 L170 16 L212 16 L212 60 L660 60" />
  </g>
  <text x="191" y="10" font-size="11" fill="currentColor" text-anchor="middle">CNV 高 ≥ 20 ns（本实验 40 ns）</text>
  <g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.45" stroke-dasharray="6 5">
    <line x1="212" y1="16" x2="212" y2="300" />
    <line x1="322" y1="16" x2="322" y2="300" />
  </g>
  <text x="267" y="196" font-size="12" fill="currentColor" text-anchor="middle">tCONV ≤ 527 ns（本实验等 600 ns）</text>
  <g stroke="currentColor" stroke-width="2.5" fill="none">
    <path d="M130 88 L322 88 L322 36 L430 36 L430 88 L660 88" />
  </g>
  <text x="376" y="30" font-size="11" fill="currentColor" text-anchor="middle">D15（MSB）</text>
  <text x="546" y="82" font-size="11" fill="currentColor" text-anchor="middle">D14 … D0</text>
  <g stroke="currentColor" stroke-width="2.5" fill="none">
    <path d="M322 168 L336 168 L336 128 L361 128 L361 168 L386 168 L386 128 L411 128 L411 168 L436 168 L436 128 L461 128 L461 168 L486 168 L486 128 L511 128 L511 168 L536 168 L536 128 L561 128 L561 168 L586 168 L586 128 L611 128 L611 168 L636 168 L636 128 L653 128 L653 168" />
  </g>
  <text x="361" y="218" font-size="12" fill="currentColor" text-anchor="middle">#1</text>
  <text x="411" y="218" font-size="12" fill="currentColor" text-anchor="middle">#2</text>
  <text x="461" y="218" font-size="12" fill="currentColor" text-anchor="middle">#3</text>
  <text x="511" y="218" font-size="12" fill="currentColor" text-anchor="middle">#4</text>
  <text x="561" y="218" font-size="12" fill="currentColor" text-anchor="middle">#5</text>
  <text x="611" y="218" font-size="12" fill="currentColor" text-anchor="middle">#16</text>
  <text x="330" y="254" font-size="12" fill="currentColor">tSCK ≥ 10 ns（本实验 80 ns，12.5 MHz）</text>
  <text x="180" y="282" font-size="12" fill="currentColor">读出方式：RDL / SDI / CHAIN 接地，非菊花链</text>
  <text x="180" y="304" font-size="12" fill="currentColor">SDO 在 SCK 上升沿之后 ≤ tDSDO 变化，MSB 先出，二的补码</text>
  </svg>
  <figcaption>图 2：LTC2328-16 串行读出时序（CNV / SCK / SDO，MSB 先出）</figcaption>
</figure>

三个容易踩的坑（RTL 注释里有详细说明）：

1. **BUSY 没引出到 FPGA**（死端在隔离器上）→ 只能用"固定等待 ≥ 527 ns"判断转换结束；
2. **数据是在 SCK 上升沿之后才改变**（tDSDO）→ 所以"驱动 SCK 变高的同一个时钟沿采样 SDO"是安全的；
3. **SCK/SDO 各要穿过一片 IL716**（单程 10~20 ns，往返最多约 45 ns）→ SCK 周期必须远大于该延迟，故默认 SCK = 12.5 MHz（周期 80 ns，仍有约 35 ns 裕量），**不要**盲目提高到 100 MHz。

源文件里还记了一条本模块没用到、写时序时必须知道的约束：**`tQUIET ≥ 20 ns`——CNV 上升沿之后 SCK 必须保持安静**。`S_WAIT` 的 600 ns 空档同时满足了 tCONV 和 tQUIET。

<div class="shot-placeholder"><strong>截图待补</strong>：需要一张 LTC2328-16 数据手册 Serial Interface Timing 图（来源：LTC2328-16 datasheet，标出 tCNVH / tCONV / tSCK / tDSDO）</div>

### 接线表

模拟端子在 26 针连接器 **SCSI2** 上（详见 `docs/pinmap.md`）：

| SCSI2 脚 | 信号 | 接哪里 |
|---|---|---|
| 24 | +IN1 | 信号发生器输出（红表笔/探头芯线） |
| 25 | −IN1 | 信号发生器的地（黑表笔/探头地） |
| 11 / 12 | +IN2 / −IN2 | 通道 2，同理 |

三条接线纪律：

- **必须接 −IN1**：ADC 输入是**浮地隔离**的伪差分输入，只接 +IN1 会悬空，读数乱跳；
- 万用表**并联**在信号发生器输出两端，用来读真值（校准时以万用表为准）；
- 示波器可并联观测信号发生器实际波形（注意示波器地会把发生器地与大地相连，正常）。

### 安全提示

- 前端**没有 TVS/钳位保护**，只有电阻限流；实验中请把电压控制在 **±20V 以内**；
- 不要把市电、电机驱动等大功率信号直接接入；
- 带电插拔前先把信号发生器输出关掉。

<div class="shot-placeholder"><strong>截图待补</strong>：需要一张 SCSI2 连接器引脚位置特写照片（来源：自己拍摄，标出 24/25 与 11/12 脚，或截取 `docs/pinmap.md` 中的连接器示意图）</div>

## 工程文件与一键仿真

```text
experiment4_ad_capture/
├── rtl/   ltc2328_master.v  sliding_avg.v  code_to_mv.v
│          calib_lsq.v  calib_params.vh  ad_capture_top.v
├── tb/    ltc2328_model.v  tb_*.v（5 个测试平台）
├── constraints/ad_capture_top.xdc
├── scripts/  lsq_calib.js  calib_template.csv
├── sim/      run_sim.ps1  preflight.tcl
└── docs/pinmap.md
```

运行全部仿真（PowerShell）：

```powershell
cd D:\A_DSH\experiment_projects\experiment4_ad_capture\sim
.\run_sim.ps1                 # 全部
.\run_sim.ps1 -Only tb_sliding_avg   # 只跑一个
```

预期输出（最后一行）：`全部测试通过 ✔`。



## 阶段一：把原始码值采出来

这一阶段只解决一件事：**让 FPGA 可靠地把 LTC2328-16 的 16 位转换结果读进来**。滤波、换算、校准都还没有，读出来的就是裸码值。

### 要解决的四个问题

1. **什么时候启动转换？** → CNV 产生一个 ≥20 ns 的高脉冲，上升沿启动；
2. **什么时候转换结束？** → 没有 BUSY，就等 600 ns（> 527 ns 上限）；
3. **什么时候采样数据？** → 在"把 SCK 拉高的同一个系统时钟沿"采 SDO；
4. **采多少位？** → 16 个 SCK 上升沿，高位在前，二的补码。

### 状态机

`rtl/ltc2328_master.v` 把一次采样的全过程串成五个状态：

```text
S_IDLE ──(每 SAMPLE_CYC 拍一次)──▶ S_CNV ──▶ S_WAIT ──▶ S_SHIFT ──▶ S_DONE ──┐
  等采样节拍                    CNV 高 40ns   等 600ns   16×8 拍读出   锁存+valid │
  └───────────────────────────────────────────────────────────────────────────┘
```

参数与状态定义：

```verilog
// 端口：clk/rst_n；adc_cnv、adc_sck 出（经 IL716 到 CNV/SCK），adc_sdo 入；
//       code（16 位二的补码）、code_valid（单周期脉冲）、busy
module ltc2328_master #(
    parameter integer CLK_HZ        = 100_000_000, // 系统时钟
    parameter integer SAMPLE_HZ     = 100_000,     // 采样率（默认 100 kSPS）
    parameter integer SCK_DIV       = 8,           // SCK = CLK_HZ / SCK_DIV（≥2 的偶数）
    parameter integer CNV_HIGH_CYC  = 4,           // CNV 高电平周期数（≥20 ns）
    parameter integer CONV_WAIT_CYC = 60           // 转换等待周期数（≥527 ns）
)(
    localparam integer SAMPLE_CYC = CLK_HZ / SAMPLE_HZ;   // 采样周期
    localparam integer HALF_DIV   = SCK_DIV / 2;
    // 状态机：等节拍 / CNV 脉冲 / 等转换 / 16 位读出 / 锁存
    localparam [2:0] S_IDLE = 3'd0, S_CNV = 3'd1, S_WAIT = 3'd2,
                     S_SHIFT = 3'd3, S_DONE = 3'd4;
    reg [31:0] tick_cnt;   reg [31:0] cyc_cnt;   // 采样节拍、帧内计数
    reg [4:0]  bit_cnt;    reg [3:0]  phase;     // 位数（0..16）、SCK 相位
    reg [15:0] shift;                            // 移位寄存器
    assign busy = (state != S_IDLE);
```

四个要点，也是四个容易写错的地方：

- `tick_cnt` **自由运行**计数，保证采样率精确等于 100 kSPS（不是"上一帧结束后再数 10 µs"）；
- `S_SHIFT` 里 `phase` 把每 8 拍切成一个 SCK 周期：`phase==0` 上升沿+采样，`phase==4` 下降沿；
- `bit_cnt` 需要 **5 位**（要数到 16，4 位会回绕成 0 —— 仿真第一轮就查出这个 bug）；
- 帧长 ≈ 200 个周期 < SAMPLE_CYC，因此状态机总是能按时回到 `S_IDLE`。

采样节拍、CNV 脉冲与转换等待：

```verilog
            // 采样节拍：每 SAMPLE_CYC 个周期触发一次（自由运行）
            if (tick_cnt == SAMPLE_CYC - 1) tick_cnt <= 32'd0;
            else                            tick_cnt <= tick_cnt + 32'd1;

            case (state)
                S_IDLE: begin
                    adc_sck <= 1'b0;
                    // 帧长 ≈ 200 个周期 < SAMPLE_CYC，总能按时回到 IDLE
                    if (tick_cnt == 32'd0) state <= S_CNV;
                end

                // CNV 上升沿启动转换；保持高电平 ≥ tCNVH(20ns)
                S_CNV: begin
                    adc_cnv <= 1'b1;
                    if (cyc_cnt >= CNV_HIGH_CYC - 1) begin
                        cyc_cnt <= 32'd0;  adc_cnv <= 1'b0;  state <= S_WAIT;
                    end else cyc_cnt <= cyc_cnt + 32'd1;
                end

                // tCONV(max)=527ns，且需满足 tQUIET；600ns(60 周期) 已含裕量
                S_WAIT: begin
                    if (cyc_cnt >= CONV_WAIT_CYC - 1) begin
                        cyc_cnt <= 32'd0;  bit_cnt <= 5'd0;  phase <= 4'd0;
                        state   <= S_SHIFT;
                    end else cyc_cnt <= cyc_cnt + 32'd1;
                end
```

串行读出是整段代码里最微妙的部分——**采样沿和 SCK 上升沿是同一个时钟沿**：

```verilog
                S_SHIFT: begin
                    if (phase == 4'd0) begin         // SCK 上升沿 + 采样 SDO
                        adc_sck <= 1'b1;
                        shift   <= {shift[14:0], adc_sdo};  // 高位在前
                        bit_cnt <= bit_cnt + 5'd1;
                    end else if (phase == HALF_DIV) adc_sck <= 1'b0;

                    if (phase == SCK_DIV - 1) begin
                        phase <= 4'd0;
                        if (bit_cnt == 5'd16) state <= S_DONE;
                    end else phase <= phase + 4'd1;
                end

                S_DONE: begin                       // 锁存 + 单周期 valid
                    code       <= $signed(shift);
                    code_valid <= 1'b1;
                    cyc_cnt    <= 32'd0;
                    state      <= S_IDLE;
                end
```

### 阶段一与 `ltc2328_master.v` 的关系

独立工程 `experiment4_ad_capture_step1/` 里的是 `rtl/ltc2328_raw_capture.v`，和实验四的 `ltc2328_master.v` 做的是同一件事（LTC2328-16 串行读出），但**时序策略和状态机划分不一样**，可以看成"先跑通、再优化"的两代实现。

| 对比项 | `ltc2328_raw_capture.v`（阶段一） | `ltc2328_master.v`（实验四） |
|---|---|---|
| 状态数 | 7 个（IDLE/CNV/WAIT_CONV/READ_BIT/SCK_HIGH/SCK_LOW/DONE） | 5 个（IDLE/CNV/WAIT/SHIFT/DONE） |
| 采样时刻 | **SCK 低电平期间**先采本位入 `shift_reg`，再拉高 SCK 推进 ADC | 驱动 SCK 变高的**同一个时钟沿**采样 SDO |
| CNV 高电平 | `CNV_HIGH_CYC = 5`（50 ns） | `CNV_HIGH_CYC = 4`（40 ns） |
| 转换等待 | `CONV_WAIT_CYC = 100`（1000 ns） | `CONV_WAIT_CYC = 60`（600 ns） |
| SCK 半周期 | `SCK_HALF_CYC = 8` → 高 80 ns / 低 90 ns，等效约 5.88 MHz | `SCK_DIV = 8` → 周期 80 ns，12.5 MHz |
| SDO 输入 | 两级同步器（`ASYNC_REG`/`SHREG_EXTRACT=NO`）后再采样 | 直接采 `adc_sdo` |
| 调试可观测量 | 导出 `bit_index`、`state`、`sample_count`、`overrun`、`sdo_sync` 等 | 端口只留 `code`/`code_valid`/`busy`，靠 `mark_debug` + ILA |

阶段一的写法更保守（等 1000 ns、SCK 约 5.88 MHz、先采后推），代价是慢；实验四把等待压到 600 ns（仍 > 527 ns）、SCK 提到 12.5 MHz，靠"上升沿同沿采样"把每个 SCK 周期从 3 拍缩到 1 个周期。

阶段一多出来的几个设计都是为了在真板子上"看得见"，包括为每一根串行位留出长稳定窗口的两级同步器、只用于仿真的参数自检，以及"先采后推"的读出顺序：

```verilog
    // These synchronizers are suitable only because this controller gives
    // every serial bit a long stable window. They are not an arbitrary SPI fix.
    (* ASYNC_REG = "TRUE", SHREG_EXTRACT = "NO" *) reg sdo_meta;
    (* ASYNC_REG = "TRUE", SHREG_EXTRACT = "NO" *) reg sdo_sample;
    assign sdo_sync = sdo_sample;
    assign busy = state != IDLE;
```

```verilog
    // Simulation guards; hardware defaults are fixed at 100 MHz.
    // synthesis translate_off
    initial begin
        if (CNV_HIGH_CYC < 2 || CONV_WAIT_CYC < 80 || SCK_HALF_CYC < 8)
            $fatal(1,"Use conservative timing: CNV>=2, WAIT>=80, HALF>=8 cycles at 100 MHz");
        if (SAMPLE_CYC <= FRAME_BOUND)
            $fatal(1,"Sampling period too short for selected serial timing");
    end
    // synthesis translate_on
```

```verilog
                READ_BIT: begin
                    // SCK is already low. Capture BEFORE the next rising edge.
                    shift_reg <= {shift_reg[14:0], sdo_sample};
                    sample_strobe <= 1;
                    wait_count <= 0;
                    state <= SCK_HIGH;
                end
```

阶段一的工程是用 Tcl 脚本一键创建的，只动自己 `vivado/` 目录下的文件，并用 `create_ip` 例化了一个 **13 探针、深度 16384** 的 ILA（`ila_adc_step1`），探针位宽正好对应上面那些调试输出（16 位 code、1 位 valid、4 位 bit_index、3 位 state、32 位 sample_count 等）：

```tcl
create_project adc_step1 $project_dir -part xc7z035ffg676-2
add_files -norecurse [list [file join $root rtl ltc2328_raw_capture.v] \
                           [file join $root rtl ad_capture_step1_top.v]]
set_property top ad_capture_step1_top [get_filesets sources_1]

create_ip -name ila -vendor xilinx.com -library ip -module_name ila_adc_step1
set_property -dict [list \
    CONFIG.C_NUM_OF_PROBES {13} \
    CONFIG.C_DATA_DEPTH {16384} \
    CONFIG.C_EN_STRG_QUAL {1} \
    CONFIG.C_PROBE0_WIDTH {16} \
    ...
] [get_ips ila_adc_step1]
generate_target all [get_ips ila_adc_step1]
```

和阶段三在实验四工程里用 Set Up Debug 手动添加 ILA 相比，阶段一是**脚本化、固定探针**的做法——探针数量和位宽都写死，重建工程时不用再点一遍向导。

### 仿真

```powershell
.\run_sim.ps1 -Only tb_ltc2328_master
```

测试用例（模型 `ltc2328_model.v` 模拟 ADC）：

| 输入 | 期望码值 | 结果 |
|---|---|---|
| +5.000 V（ADC 引脚） | +16000 | PASS |
| −2.500 V | −8000 | PASS |
| 0 V | 0 | PASS |
| +10.24 V | +32767（饱和） | PASS |
| 采样周期 | 10000 ns | PASS |

**看波形**：用 GTKWave 打开 `sim/work/tb_ltc2328_master.vcd`，观察 `adc_cnv / adc_sck / adc_sdo` 的相对位置：CNV 脉冲 → 600 ns 空档 → 16 个 SCK；SDO 位的跳变发生在 SCK 上升沿之后（模型里 `TDO_NS=5`）。

<div class="shot-placeholder"><strong>截图待补</strong>：需要一张 GTKWave 波形截图（来源：打开 `sim/work/tb_ltc2328_master.vcd`，显示 adc_cnv / adc_sck / adc_sdo 与 code 的对应关系）</div>

**动手练习**：把 `SCK_DIV` 从 8 改成 2（50 MHz），重跑仿真——仿真会通过，但上板很可能出错（隔离器往返延时），想一想为什么"仿真能过、板上不行"；再把 `CONV_WAIT_CYC` 改成 20（200 ns < 527 ns），这时仿真就该报错了。

## 阶段二：滑窗滤波与码值转换

读出码值之后遇到两个问题：码值会抖，而且它不是我们要的物理量。

### 为什么要滤波

ADC 有量化噪声、前端电阻有热噪声，直流量读数会在几个 LSB 内跳动（约几 mV）。对直流/缓变信号，滑动平均是最直观有效的方法：

```text
y[n] = (1/N) · Σ x[n-k]        （N = 16，2 的幂便于移位实现）
```

- 噪声标准差约降为 1/√N（N=16 → 1/4）；
- 代价：阶跃响应需要 N 个样本建立，群延迟 (N−1)/2 个样本；
- 幅频是 sinc 形状（矩形窗 FIR），对 50 Hz 工频干扰在 fs/N 及其倍频处有零点。

写成传递函数就是 `H(z) = (1/N) · (1 − z^-N) / (1 − z^-1)`，也就是矩形窗 FIR / CIC 抽取器的第一级。

<figure class="diagram"><svg viewBox="0 0 720 430" role="img" aria-label="滑窗平均原理图：长度为 16 的窗口在样本序列上滑动，累加器每次加新样本减旧样本，再右移 4 位得到平均值">
  <text x="430" y="22" font-size="12" fill="currentColor" text-anchor="middle">窗口长度 N = 16</text>
  <g stroke="currentColor" stroke-width="2.5" fill="none">
    <path d="M40 200 L680 200" />
    <path d="M672 194 L682 200 L672 206" />
  </g>
  <text x="688" y="196" font-size="12" fill="currentColor" text-anchor="end" opacity="0.75">t</text>
  <g stroke="currentColor" stroke-width="2" fill="none" opacity="0.45" stroke-dasharray="6 5">
    <line x1="160" y1="14" x2="160" y2="400" />
    <line x1="480" y1="14" x2="480" y2="400" />
    <line x1="560" y1="14" x2="560" y2="400" />
  </g>
  <g stroke="currentColor" stroke-width="2.5" fill="none">
    <rect x="160" y="32" width="320" height="52" rx="6" />
    <rect x="190" y="90" width="320" height="52" rx="6" />
    <rect x="200" y="148" width="320" height="52" rx="6" />
    <rect x="240" y="206" width="320" height="52" rx="6" />
  </g>
  <text x="320" y="64" font-size="12" fill="currentColor" text-anchor="middle" opacity="0.85">x[n−15] … x[n−8]</text>
  <text x="350" y="122" font-size="12" fill="currentColor" text-anchor="middle" opacity="0.85">x[n−14] …</text>
  <text x="360" y="180" font-size="12" fill="currentColor" text-anchor="middle" opacity="0.85">x[n−13] …</text>
  <text x="400" y="238" font-size="12" fill="currentColor" text-anchor="middle" opacity="0.85">x[n−12] …</text>
  <g stroke="currentColor" stroke-width="2" fill="none" opacity="0.6">
    <line x1="560" y1="22" x2="560" y2="40" />
    <line x1="560" y1="80" x2="560" y2="98" />
    <line x1="560" y1="138" x2="560" y2="156" />
    <line x1="560" y1="196" x2="560" y2="214" />
  </g>
  <g stroke="currentColor" stroke-width="2.5" fill="none">
    <path d="M560 58 L640 58" />
    <path d="M632 52 L642 58 L632 64" />
    <path d="M160 58 L80 58" />
    <path d="M88 52 L78 58 L88 64" />
  </g>
  <text x="646" y="62" font-size="12" fill="currentColor">新样本</text>
  <text x="76" y="62" font-size="12" fill="currentColor" text-anchor="end">滑出</text>
  <g stroke="currentColor" stroke-width="2.5" fill="none">
    <rect x="160" y="300" width="400" height="72" rx="8" />
    <path d="M160 300 L160 264 L572 264" />
    <path d="M560 300 L560 264 L588 264" />
    <path d="M584 264 L600 264" />
    <path d="M592 258 L602 264 L592 270" />
  </g>
  <text x="360" y="330" font-size="13" fill="currentColor" text-anchor="middle">sum ← sum − 最旧 + 最新</text>
  <text x="360" y="356" font-size="12" fill="currentColor" text-anchor="middle" opacity="0.75">不重复求和，只做 1 加 1 减</text>
  <text x="612" y="268" font-size="12" fill="currentColor">÷16</text>
  <text x="130" y="268" font-size="12" fill="currentColor" text-anchor="end">mem[wr]</text>
  </svg>
  <figcaption>图 3：滑窗平均原理——环形缓冲区加新减旧，最后右移 4 位得到 N=16 的均值</figcaption>
</figure>

### `rtl/sliding_avg.v` 的三个设计点

1. **环形缓冲区** `mem[0:N-1]` + 写指针，保存最近 N 个样本；
2. **加新减旧**：`sum <= sum - mem[wr] + din`，避免每拍重新求和（省 N 个加法器）；
3. **输出 Q8 定点**（`均值 × 256`）：保留 8 位小数，避免"先除后乘"的截断损失。

累加逻辑与参数定义：

```verilog
module sliding_avg #(
    parameter integer N_LOG2 = 4,       // 窗口长度 N = 2**N_LOG2（默认 16）
    parameter integer IN_W   = 16,      // 输入位宽（有符号）
    parameter integer FRAC   = 8        // 输出小数位宽
)(
    input  wire                        clk,   input wire rst_n,
    input  wire signed [IN_W-1:0]      din,   input wire din_valid,
    output reg  signed [IN_W+FRAC-1:0] dout,  // Q(IN_W).FRAC 平均值
    output reg                         dout_valid,   output wire filled
);
    localparam integer N     = 1 << N_LOG2;
    localparam integer SUM_W = IN_W + N_LOG2;       // 累加器位宽
    localparam integer OUT_W = IN_W + FRAC;

    reg signed [IN_W-1:0]   mem [0:N-1];            // 环形缓冲区
    reg        [N_LOG2-1:0] wr_ptr;
    reg        [N_LOG2:0]   cnt;                    // 已填样本数（0..N）
    reg signed [SUM_W-1:0]  sum;
    assign filled = (cnt == N);

    // 组合：本次更新后的累加值（满窗加新减旧，未满只累加）
    always @(*) begin
        sum_next = (cnt == N) ? (sum - mem[wr_ptr] + din) : (sum + din);
    end
```

累加器位宽取 `SUM_W = IN_W + N_LOG2`：16 个 16 位数相加最多长 4 位，`16+4` 刚好不溢出。窗口没填满时只累加不减，`filled` 用来告诉下游"数据还没到 N 个"。

除以 N 用移位实现，并且**对绝对值取整后还原符号**；乘法（`<< FRAC`）与除法（`>> N_LOG2`）拆成两级流水，第一级锁存窗口和，第二级做除法输出：

```verilog
    // 四舍五入除以 N（对绝对值取整后还原符号）
    function signed [OUT_W-1:0] div_round;
        input signed [SUM_W-1:0] s;
        reg is_neg;  reg [SUM_W-1:0] a;
        reg [SUM_W+FRAC:0] scaled, q;
        begin
            is_neg = s[SUM_W-1];
            a      = is_neg ? -s : s;
            scaled = {1'b0, a} << FRAC;
            q      = (scaled + (1 << (N_LOG2 - 1))) >> N_LOG2;
            div_round = is_neg ? -$signed(q[OUT_W-1:0]) : $signed(q[OUT_W-1:0]);
        end
    endfunction

    // 流水线：第 1 级锁存"本次窗口和"，第 2 级做除法输出（切分组合路径）
    reg signed [SUM_W-1:0] sum_q;
    reg                    v1;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            wr_ptr <= {N_LOG2{1'b0}};   cnt <= {(N_LOG2+1){1'b0}};
            sum    <= {SUM_W{1'b0}};    sum_q <= {SUM_W{1'b0}};
            v1     <= 1'b0;             dout <= {OUT_W{1'b0}};
        end else begin
            v1 <= 1'b0;   dout_valid <= 1'b0;
            if (din_valid) begin
                mem[wr_ptr] <= din;   wr_ptr <= wr_ptr + 1'b1;
                sum <= sum_next;
                if (cnt != N) cnt <= cnt + 1'b1;
                sum_q <= sum_next;    v1 <= (cnt >= N - 1);  // 窗口已满
            end
            if (v1) begin dout <= div_round(sum_q); dout_valid <= 1'b1; end
        end
    end
```

### `rtl/code_to_mv.v`

滤波后的平均值是 Q8 格式的码值，还要换成毫伏。从换算关系第 (3) 式出发，把 Q8 带进去：

```text
V[mV] = code_q8 × 115 / (48 × 256) = code_q8 × 115 / 12288
```

也就是常数乘 + 常数除 + 四舍五入（对绝对值取整后还原符号）。模块参数 `NUM=115`、`DEN=12288`（= 48 × 2^8）就是这两个常数：

```verilog
module code_to_mv #(
    parameter integer IN_W  = 24,        // 输入位宽（Q8 有符号）
    parameter integer OUT_W = 20,        // 输出位宽（有符号，单位 mV）
    parameter integer NUM   = 115,       // 分子
    parameter integer DEN   = 12288      // 分母 = 48 * 2^8
)(
    input  wire                   clk,       input  wire rst_n,
    input  wire signed [IN_W-1:0] code_q8,   input  wire din_valid,
    output reg  signed [OUT_W-1:0] mv,       output reg  dout_valid
);
    localparam integer MUL_W = IN_W + 8;
    reg signed [MUL_W-1:0] prod_r;
    reg                    v1;
    // 第 1 级：常数乘法（v1 为流水线 valid，总延迟 2 拍）
    if (din_valid) prod_r <= code_q8 * NUM;
    wire                    is_neg   = prod_r[MUL_W-1];
    wire [MUL_W-1:0]        prod_abs = is_neg ? -prod_r : prod_r;
    wire [MUL_W-1:0]        quot     = (prod_abs + DEN / 2) / DEN;
    wire signed [OUT_W-1:0] mv_next  = is_neg ? -$signed(quot[OUT_W-1:0])
                                              :  $signed(quot[OUT_W-1:0]);
```

`(prod_abs + DEN / 2) / DEN` 就是四舍五入：先加半个分母再整除；先取绝对值则保证负数也按"四舍五入"而不是"向零截断"来算。源文件里还记了一条时序上的取舍：乘法（DSP）与常数除法（LUT+进位链）都比较长，合并在一拍里在 100 MHz 下时序紧张（**实测 WNS = −0.32 ns**），故拆成两级——第 1 级乘法、第 2 级除法+符号还原。

参数速查：1 LSB = 20480 mV / 65536 = 5/16 mV = 0.3125 mV；衰减比 3/23；合并后 `code × 115/48 ≈ code × 2.3958333 mV`，外部差模满量程 `±32768 × 115/48 ≈ ±78500 mV ≈ ±78.5V`。

### 第四级：最小二乘校准模块 `rtl/calib_lsq.v`

数据通路的最后一级在 FPGA 里做一次有理数形式的仿射变换 `y = (K * x + B) / D`（四舍五入）。参数含义是：`K` 是增益分子（`D=4096` 时，`1.000` 对应 `K=4096`）、`B` 是偏置分子（单位 `mV * D`）、`D` 是分母（默认 4096，兼顾精度与位宽）。系数由 PC 上的脚本拟合后写进 `calib_params.vh`，RTL 只负责算：

```verilog
module calib_lsq #(
    parameter signed [31:0] K    = 32'sd4096,   // 增益分子
    parameter signed [31:0] B    = 32'sd0,      // 偏置分子
    parameter signed [31:0] D    = 32'sd4096,   // 分母
    parameter integer       IN_W = 20,          // 输入（mV）
    parameter integer       OUT_W = 24          // 输出（mV）
)(
    input  wire                   clk,        input  wire rst_n,
    input  wire signed [IN_W-1:0] mv,         input  wire din_valid,
    output reg  signed [OUT_W-1:0] mv_cal,    output reg  dout_valid
);
    localparam integer PROD_W = IN_W + 32;
    // 第 1 级：乘加
    if (din_valid) sum_r <= mv * K + B;
    wire                    is_neg = sum_r[PROD_W-1];
    wire [PROD_W-1:0]       abs_s  = is_neg ? -sum_r : sum_r;
    wire [PROD_W-1:0]       quot   = (abs_s + D / 2) / D;
    wire signed [OUT_W-1:0] y_next = is_neg ? -$signed(quot[OUT_W-1:0])
                                            :  $signed(quot[OUT_W-1:0]);
```

和 `code_to_mv` 一样是"先绝对值、四舍五入、再还原符号"的三段式，总延迟 2 拍。

### 顶层怎么把这四级串起来

`rtl/ad_capture_top.v` 是双通道的顶层。每个通道的链路完全一致，只是模块实例和信号名带 1/2 的区别；各级之间用 `*_valid` 单周期脉冲握手：

```verilog
//   LTC2328-16 ──code──▶ 滑窗平均 ──code_q8──▶ 码值→毫伏 ──mv──▶ 最小二乘校准 ──▶ mv_cal
//   u_adc1  .code(code1) → u_avg1 .dout(avg1) → u_mv1 .mv(mv1) → u_cal1 .mv_cal(mv1_cal)
//   通道 2 完全同构：u_adc2 → u_avg2 → u_mv2 → u_cal2
    (* DONT_TOUCH = "true" *)
    calib_lsq #(.K(`CAL1_K), .B(`CAL1_B), .D(`CAL1_D), .IN_W(20), .OUT_W(24)) u_cal1 (
        .clk(clk), .rst_n(rst_n), .mv(mv1), .din_valid(mv1_valid),
        .mv_cal(mv1_cal), .dout_valid(mv1_cal_valid)
    );
```

顶层还有三处值得单独讲。一是**上电复位是软件做的**，没有外部复位引脚：

```verilog
    // ------------------------------------------------------------ 上电复位
    reg [15:0] por_cnt = 16'd0;
    wire rst_n = por_cnt[15];
    always @(posedge clk) begin
        if (!por_cnt[15]) por_cnt <= por_cnt + 16'd1;
    end
```

二是**待观测信号都加了 `mark_debug`**，Vivado 的 Set Up Debug 才能自动把它们收进 ILA：

```verilog
    (* mark_debug = "true" *) wire signed [15:0] code1;
    (* mark_debug = "true" *) wire               code1_valid;
    (* mark_debug = "true" *) wire signed [23:0] avg1;
    (* mark_debug = "true" *) wire signed [19:0] mv1;
    (* mark_debug = "true" *) wire signed [23:0] mv1_cal;
```

三是两个 LED：`led_heart` 是 1 Hz 方波，`led_data` 反映通道 1 校准后电压的极性。注意 `mv1_cal[23]` 就是有符号数的符号位，极性判断没有任何额外运算：

```verilog
    always @(posedge clk) begin
        if (heart_cnt == CLK_HZ / 2 - 1) begin   // 1 Hz 方波
            heart_cnt <= 26'd0;  heart_r <= ~heart_r;
        end else heart_cnt <= heart_cnt + 26'd1;
    end

    wire data_pos = (mv1_cal[23] == 1'b0);       // 校准后电压 ≥ 0
    assign led_heart = LED_ACTIVE_LOW ? ~heart_r :  heart_r;
    assign led_data  = LED_ACTIVE_LOW ? ~data_pos : data_pos;
```

各实例上都加了 `(* DONT_TOUCH = "true" *)`，避免综合工具把中间级合并/优化掉——调试阶段链路中间的信号要能在 ILA 里看到，这一步不能省。

### 仿真

```powershell
.\run_sim.ps1 -Only tb_sliding_avg     # 均值/滑动更新/负数/四舍五入
.\run_sim.ps1 -Only tb_code_to_mv      # 16000→38333 mV 等 6 个点
.\run_sim.ps1 -Only tb_ad_capture_top  # 全链路 + 噪声测试
```

`tb_ad_capture_top` 的两阶段设计（**这是本实验最有价值的一个测试**）：

- **阶段 A（无噪声）**：通道 1 输入 +38.333 V、通道 2 输入 −19.167 V，检查全链路输出 38333 mV / −19167 mV（换算精确）；
- **阶段 B（±4 LSB 噪声）**：检查原始码值确实在抖（波动 ≥ 4 LSB，证明噪声真加上了）、滤波后波动 < 30 mV（原始波动的 1/8 以下）、均值仍贴近真值（滤波没有引入偏置）。

实测输出示例：

```text
噪声测试：原始码值范围 [15996, 16004]（波动 8 LSB），滤波后电压范围 [38331, 38336] mV
PASS: 滑窗滤波有效，均值 = 38332 mV
```

这段输出把"滤波确实有效"变成了可核对的数据：原始波动 8 LSB，滤波后电压波动只有 5 mV。

<div class="shot-placeholder"><strong>截图待补</strong>：需要一张 `tb_ad_capture_top` 仿真日志截图（来源：Vivado 仿真或 `.\run_sim.ps1 -Only tb_ad_capture_top` 的终端输出，包含噪声测试与 PASS 行）</div>

## 阶段三：上板联调

仿真全过只说明逻辑自洽，接下来要在真板子上把链路跑通。

### 建 Vivado 工程

1. Vivado 2020.2 → **Create Project** → RTL Project；
2. 器件选 **`xc7z035ffg676-2`**（不要选 7z035 的其他封装）；
3. **Add Sources** → 加入 `rtl/` 下 5 个 `.v`（`calib_params.vh` 会随 `include` 找到，不用单独加）；
4. **Add Constraints** → `constraints/ad_capture_top.xdc`；
5. 顶层设为 `ad_capture_top`。这是**纯 PL 工程**：不需要 Block Design、不需要 PS/SDK。

### 综合与 ILA 调试核

1. **Run Synthesis**；
2. 综合完成后：**Tools → Set Up Debug** → Next → 把已标记（`mark_debug`）的信号全部加入，时钟选 `clk`，深度 4096/8192，完成；建议至少抓 `code1`、`avg1`、`mv1`、`mv1_cal`（以及各 `*_valid`）；
3. **Run Implementation → Generate Bitstream**；
4. 打开 Hardware Manager → Auto Connect → Program Device。

也可先用预检脚本验证约束合法性（约 2~3 分钟）：

```powershell
D:\Xilinx\Vivado\2020.2\bin\vivado.bat -mode batch -source sim\preflight.tcl
```

看到 `PREFLIGHT DONE` 且 `sim/work/drc.rpt` 无 Critical Warning 即可放心上板。预检在本机的实测结果：**DRC 0 error、布线 0 failed nets、时序收敛（WNS ≈ +1.5 ns，100 MHz）**。报告里出现下列 4 条 Warning 属正常现象，可忽略：`DPIP-1 / DPOP-2`（DSP 未加流水的建议）、`RTSTAT-10`（仅被 ILA 使用的调试网暂无负载，加入 ILA 后消失）、`ZPS7-1`（Zynq 纯 PL 设计未实例化 PS7 的提示）。

<div class="shot-placeholder"><strong>截图待补</strong>：需要一张 Set Up Debug 中加入 mark_debug 信号后的列表截图（来源：Vivado 2020.2 Tools → Set Up Debug 向导界面）</div>

### 上电检查（先别接信号）

| 观察 | 含义 |
|---|---|
| LED1（心跳，1 Hz 闪） | 比特流下载成功 + 100 MHz 时钟正常 |
| LED2 灭/亮 | 通道 1 读数极性（输入 ≥ 0 亮） |
| ILA 里 `code1` 有值且在小范围抖动 | ADC 通信正常 |

如果 LED1 不闪：查 C8 时钟约束/晶振；如果 `code1` 全 0 或乱码：查 `AD_CNVST1/AD_SCLK1/AD_SDOUT1` 三根线的方向与球号（见 `docs/pinmap.md`）。

### 加信号测量

1. 信号发生器 **DC 模式输出 5.00 V**：发生器输出接 SCSI2-24(+IN1)、地接 SCSI2-25(−IN1)；
2. 万用表并联在发生器输出上，记下真值（如 `5.003 V`）；
3. ILA 设置触发 `code1_valid` 上升沿，触发后读 `code1`（原始码值，十进制）、`avg1`（Q8 平均码值，除以 256 即可）、`mv1_cal`（校准后的毫伏数，直接就是读数）；
4. 理论上的反向关系是：

   ```text
   code = V(输入)[mV] / 2.3958  ≈ 5003 / 2.3958 ≈ 2088
   ```

   若 ILA 读数在 2088 ± 20 内，链路正确。

### 换波形观察（体会滤波）

| 信号发生器 | 现象 |
|---|---|
| DC +5V | `mv1_cal` 稳定在 5000 mV 附近，末位跳动几个 mV |
| DC +5V 上叠加 50 mVpp、1 kHz 正弦 | 读数在 ±10 mV 内抖动（滤波把纹波压掉了） |
| 1 Hz、0→5V 方波 | 读数约 160 µs（N=16 @100kSPS）后跟随到位，滤波边缘有小台阶 |
| DC −5V | 读数为负，LED2 灭 |

<div class="shot-placeholder"><strong>截图待补</strong>：需要一张 ILA 抓到的波形截图（来源：Vivado Hardware Manager ILA 窗口，含 code1 / avg1 / mv1_cal 及 code1_valid 触发位置）</div>

## 阶段四：最小二乘校准

### 为什么需要校准

前端 500k/150k/500k 是普通 1% 电阻，衰减比的**实际值**与理论 3/23 会有 1~2% 的偏差；AD8421 的增益误差、ADC 基准误差也会叠加。表现为：读数 = 真值 × (1+ε) + δ。校准就是用实验数据把 ε、δ 求出来：

```text
y(真值) = a · x(未校准读数) + b        —— 一元线性最小二乘拟合
a = Σ(x-x̄)(y-ȳ) / Σ(x-x̄)² ,  b = ȳ - a·x̄
```

这里 x 是"按理论换算算出来的未校准读数"（mV），y 是万用表给出的真值（mV）。

### 采集校准数据

1. 建议点位：`0, ±2 V, ±4 V, ±6 V, ±8 V, ±10 V`（量程内均匀、正负都有），共 10~15 点；
2. 每个点：先读万用表真值 → 再记 ILA 的 `code1`（或 `mv1`）；
3. 填入 `scripts/my_data.csv`（照 `calib_template.csv` 格式）：

```csv
ch,code,mv_true
1,2088,5003.0
1,8352,20010.0
...
```

CSV 三列的含义：`ch` 是通道号（1 或 2）、`code` 是 ILA 上读到的 ADC 原始码值（滑窗平均后的十进制，可为负）、`mv_true` 是万用表/信号源给出的真值（毫伏，可为负）。

> 技巧：ILA 的 `avg1/256` 比 `code1` 稳，推荐记录滤波后的值（单位仍是码值）。

### 用 `lsq_calib.js` 求系数

```powershell
node scripts\lsq_calib.js scripts\my_data.csv
```

脚本做的事分三步：按理论换算 `x = code * 115 / 48`（mV，未校准读数，和 `code_to_mv.v` 里除的常数同源）；对每个通道做一元线性最小二乘拟合 `y = a*x + b`，并算决定系数 R² 与最大残差；按 `D = 4096` 量化成有理数 `a ≈ K/D`、`b ≈ B/D`，写入 `rtl/calib_params.vh`。

拟合部分：

```javascript
const D = 4096;

function fit(pts) {
  const n = pts.length;
  if (n < 2) throw new Error('每个通道至少需要 2 个校准点');
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  const xb = sx / n, yb = sy / n;
  let sxy = 0, sxx = 0;
  for (const p of pts) { sxy += (p.x - xb) * (p.y - yb); sxx += (p.x - xb) * (p.x - xb); }
  if (sxx === 0) throw new Error('所有校准点 x 相同，无法拟合');
  const a = sxy / sxx;          // a = Σ(x-x̄)(y-ȳ) / Σ(x-x̄)²
  const b = yb - a * xb;        // b = ȳ - a·x̄
  return { a, b, r2, maxRes, n };
}
```

量化成 FPGA 能用的整数系数，是"PC 上的数学"落到"FPGA 里的定点"的关键一步：

```javascript
      coef[ch] = {
        K: Math.round(f.a * D),     // a ≈ K / D
        B: Math.round(f.b * D),     // b ≈ B / D
        D,
        a: f.a, b: f.b, r2: f.r2, maxRes: f.maxRes, n: f.n
      };
      console.log(`通道 ${ch}：${f.n} 个点  a=${f.a.toFixed(6)}  b=${f.b.toFixed(2)} mV  ` +
                  `R²=${f.r2.toFixed(6)}  最大残差=${f.maxRes.toFixed(2)} mV`);
      console.log(`          K=${coef[ch].K}  B=${coef[ch].B}  D=${D}`);
```

生成的 `calib_params.vh` 里，常量是 `32'sd` 形式的有符号十进制（脚本里的 `sgn()` 负责给负数加上前缀），RTL 用宏取用：

```verilog
// 数值含义：y(mV) = (K * x(mV) + B) / D
//   通道1：a=1.012871  b=-12.43 mV  R²=0.999999
`define CAL1_K  32'sd4149
`define CAL1_B  -32'sd50906
`define CAL1_D  32'sd4096
```

脚本运行时会打印两个通道的 `a`、`b`、`R²`、最大残差以及量化后的 `K`、`B`、`D`（示例：`通道 1：12 个点  a=1.012871  b=-12.43 mV  R²=0.999999  最大残差=8.31 mV`，随后一行是 `K=4149  B=-50906  D=4096`，最后打印 `已生成：...\rtl\calib_params.vh`）。

脚本还会打印一句提醒：**重新综合实现后，新的校准系数即生效**（因为系数是 RTL 的编译期常量，不是运行时可写的寄存器）。如果某个通道的数据点少于 2 个，脚本不会报错，而是保持该通道"不校准"（`y = x`）：

```text
通道 2：数据不足（1 点），保持不校准（y=x）
```

### 回写并验证

1. 重新 **Run Synthesis → Implementation → Bitstream**（系数在 RTL 里）；
2. 重复阶段三的测量：此时 `mv1_cal` 应直接显示万用表的读数；
3. 换几个没参与拟合的点复测，记录残差，画"校准前/后误差对比"曲线；
4. 报告里给出：a、b、R²、最大残差、复测最大误差。

<div class="shot-placeholder"><strong>截图待补</strong>：需要一张 `node scripts\lsq_calib.js` 的运行输出截图（来源：PowerShell 终端，含两个通道的 a/b/R²/K/B/D 与"已生成"提示）</div>

### 误差分析（报告素材）

| 来源 | 量级 | 是否被校准吸收 |
|---|---|---|
| 电阻公差（1%）导致衰减比偏差 | ±1~2% | ✅（进入 a） |
| 基准/增益误差 | ±0.1% 量级 | ✅（进入 a、b） |
| ADC INL/DNL | ±2 LSB（≈5 mV） | ❌（非线性） |
| 噪声（滤波后） | 1~3 mV | 部分（平均后下降） |
| 万用表自身误差 | 依表而定 | ❌（真值本身的不确定度） |

所以**校准后误差不会为 0**，一般残余 < 0.2%；报告要区分"增益/偏置误差"与"非线性+噪声"。前两类是仿射误差，一次线性拟合就能吸收；后两类不是，无论多少校准点都消不掉。

## 阶段五（选做）

1. **滤波长度对比**：把顶层参数 `N_LOG2` 从 4 改成 2/5/6，重跑 `tb_ad_capture_top`，比较噪声抑制与阶跃建立时间，把结论写进报告（可画表）。
2. **双通道对比**：同一信号同时接 +IN1/+IN2，比较两通道读数差异（通道间增益一致性）。
3. **DA 回放**：`constraints` 里已备好 DAC8871 的 6 根线（AE25/AE26/AF24/AF25/AD23/AD24）。DAC8871 是 16 位、三线制 SPI（CS_N/SCK/SDI，SCLK 最高 50 MHz），自己写一个 SPI 主控把 `mv1_cal` 回放出去（帧格式与时钟沿以 DAC8871 数据手册为准），用万用表在 `+OUT1/−OUT1` 上验证。
4. **PS 串口输出**：板上 `UART_TXD/RXD` 是 PS 的 MIO49/MIO48，纯 PL 用不了；若想做，需要建 Zynq Processing System + AXI GPIO 读取 `mv1_cal`，由 ARM 打印（属 PS 实验范畴）。

第 4 点值得单独说明：核心板图上 `UART_RXD/UART_TXD` 对应 **PS_MIO48/PS_MIO49**（球 B21 / A18），经底板连接到 CP210x USB-UART 芯片。它们是 **PS 侧专用管脚**，纯 PL 工程无法驱动；因此本实验的读数以 **ILA + LED** 为准。

## 常见问题排查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| LED1 不闪 | 时钟/比特流问题 | 查 C8 约束、重新 Program |
| `code1` 恒为 0 | CNV/SCK 没出去或 SDO 方向错 | 核对 `docs/pinmap.md` 三根线；用示波器看 CNV/SCK 有无波形 |
| `code1` 乱码但有变化 | SCK 太快（隔离器延时）| 把 `SCK_DIV` 改大（16、32）再试 |
| 读数随输入变化但比例差很多 | 衰减比代错/单位错 | 检查 115/48 的由来；核对是"码值"还是"Q8" |
| 输入 0V 但读数漂几百 mV | −IN 没接地、输入悬空 | 把信号源地接 −IN1 |
| 读数跳动大 | 噪声、滤波未生效 | 看 `avg1` 是否在变；增大 `N_LOG2` |
| Vivado 报 IOSTANDARD/Bank DRC | C8 电平标准与实际供电不符 | 把 XDC 中 C8 改成 `LVCMOS33` |
| 校准后仍有固定偏差 | 校准点太少/没含 0 附近 | 补点重测；检查 CSV 单位（mV） |

## 实验报告要点

1. **信号链与数学**：衰减比、LSB、`code→mV` 公式推导（硬件原理一章的内容要自己复述）；
2. **时序设计**：为什么等 600 ns？为什么 SCK 只跑 12.5 MHz？BUSY 缺失怎么处理？
3. **RTL 结构**：状态机图、滑窗"加新减旧"结构、Q8 定点选择；
4. **仿真证据**：贴测试结果（特别是噪声测试的前后对比数据）；
5. **实测数据**：校准数据表（ch/code/mv_true）、拟合结果（a、b、R²、最大残差）；
6. **校准前后误差对比**（表格或折线）；
7. **误差分析与改进**：非线性、噪声、万用表不确定度；如果换成 24 位 ADC 或 4 线电阻会怎样；
8. **思考题**（任选二）：
   - 滑窗平均对 50 Hz 干扰的抑制与采样率/N 的关系？
   - 为什么用最小二乘而不是直接取两个点算斜率？
   - 若输入是 50 Hz 交流，本系统应该如何测其有效值？

## 参数速查表

| 参数 | 值 | 在哪改 |
|---|---|---|
| 系统时钟 | 100 MHz | XDC `create_clock` |
| 采样率 | 100 kSPS（10 µs） | `SAMPLE_HZ`（`ad_capture_top` 参数） |
| SCK 频率 | 12.5 MHz | `SCK_DIV`（默认 8） |
| 转换等待 | 600 ns | `CONV_WAIT_CYC`（默认 60） |
| 滑窗长度 | 16 | `N_LOG2`（默认 4） |
| 码值→毫伏 | ×115/48 | `code_to_mv` 参数 `NUM/DEN` |
| 校准系数 | `calib_params.vh` | `node scripts\lsq_calib.js <csv>` |
| LED 极性 | 低电平亮 | `LED_ACTIVE_LOW` |

### 管脚速查

AD/DA 相关管脚经过三方核对（底板原理图 `connector.SchDoc`、核心板 `MZ7XCORE676B_0303545核心板.pdf`、Vivado 器件库 `xc7z035ffg676_pkg.xml`），12 个 AD/DA 球号的 IOType 与核心板网络名逐一吻合：

| 底板信号 | HT1 脚 | 核心板 PIHT10 脚 | Zynq 球号 | IOType（Vivado） | 核心板网络名 |
|---|---|---|---|---|---|
| AD_CNVST1 | A60 | B60 | **W17** | IO_25_12 | B12_W17 |
| AD_SCLK1  | A59 | B59 | **V19** | IO_0_13  | B13_V19 |
| AD_SDOUT1 | A57 | B57 | **AB26**| IO_L2P_T0_13 | B13_L2_P |
| AD_CNVST2 | A56 | B56 | **AC26**| IO_L2N_T0_13 | B13_L2_N |
| AD_SCLK2  | A55 | B55 | **AD25**| IO_L4P_T0_13 | B13_L4_P |
| AD_SDOUT2 | A54 | B54 | **AD26**| IO_L4N_T0_13 | B13_L4_N |
| DA_CSN1   | A53 | B53 | **AE25**| IO_L3P_T0_DQS_13 | B13_L3_P |
| DA_SCK1   | A52 | B52 | **AE26**| IO_L3N_T0_DQS_13 | B13_L3_N |
| DA_SDI1   | A51 | B51 | **AF24**| IO_L5P_T0_13 | B13_L5_P |
| DA_CSN2   | A50 | B50 | **AF25**| IO_L5N_T0_13 | B13_L5_N |
| DA_SCK2   | A48 | B48 | **AD23**| IO_L11P_T1_SRCC_13 | B13_L11_P |
| DA_SDI2   | A47 | B47 | **AD24**| IO_L11N_T1_SRCC_13 | B13_L11_N |
| PL_CLK 100MHz | — | — | **C8** | IO_L13P_T2_MRCC_34 | PL 时钟（Bank 34） |
| TEST_LED1 | A45 | B45 | **AC22**| IO_L14N_T2_SRCC_13 | B13_L14_N |
| TEST_LED2 | A46 | B46 | **AC21**| IO_L14P_T2_SRCC_13 | B13_L14_P |

电平标准的依据：Bank 12/13（AD/DA/LED）由 VADJ 供电，默认 3.3V，用 `LVCMOS33`；Bank 34 的 C8（PL 时钟）核心板标注 1.35V/1.5V，用 `SSTL135`。SSTL135 的判决门限（≈0.675V）在 3.3V 供电下同样能识别 3.3V 时钟电平，所以两种供电情形都能工作；若 Vivado 报 IOSTANDARD 相关 DRC，改成 `LVCMOS33` 即可。

<div class="shot-placeholder"><strong>截图待补</strong>：需要一张 XDC 约束文件截图（来源：`constraints/ad_capture_top.xdc`，含 C8 时钟约束与 6 根 AD 线的 PACKAGE_PIN/IOSTANDARD）</div>

## 踩过的坑

四条都是这次实验里真正花掉时间的：

1. **`bit_cnt` 位宽不够。** `bit_cnt` 要数到 16，写成 4 位时最高位回绕，状态机永远等不到 `bit_cnt == 16`，仿真第一轮就查出来了。位宽这类错误在综合里通常不会报错，只能靠仿真波形定位。

2. **仿真能过、板上不行——SCK 太快。** 把 `SCK_DIV` 改成 2（50 MHz）后仿真照样 PASS，因为 `ltc2328_model.v` 没有建模 IL716 的传播延迟。真实情况下 SCK/SDO 各要穿过一片隔离器，往返最多约 45 ns，所以 12.5 MHz（周期 80 ns，约 35 ns 裕量）是留了余地的选择；现场信号完整性差时还可以继续加大 `SCK_DIV`。这条也是"仿真模型要覆盖真实约束"这个道理的实例。

3. **换算里"码值"和"Q8"混用。** 滑窗滤波器输出的是 Q8（`均值 × 256`），`code_to_mv` 的分母因此必须是 `48 × 256 = 12288` 而不是 48。一旦代错，读数会差 256 倍——排查表里"读数随输入变化但比例差很多"说的就是这种情况。

4. **乘法与除法挤在一拍，时序不够。** `code_to_mv` 里常数乘法（DSP）和常数除法（LUT+进位链）合在一拍，实测 WNS = −0.32 ns（100 MHz）。拆成"第 1 级乘法、第 2 级除法+符号还原"的两级流水后时序才收敛；整个通路的延迟因此是每级 2 拍，链路末端 `mv1_cal` 相对 `code1` 有固定的流水线延迟——ILA 采样时要注意对齐。

## 下一步

实验四走完，模拟采集这条链路就算打通了：从 SCSI2 端子的电压，到 ILA 里一个可信的毫伏读数，中间每一步都能说清楚为什么这么做。

往下可以接的方向，阶段五里已经列了四个，其中最有延续性的是**把数据送出去**——本实验受限于纯 PL 工程，读数只能靠 ILA 和两个 LED；一旦建起 Zynq Processing System，用 AXI GPIO 读走 `mv1_cal`，采样率不受 ILA 深度限制，就能做真正的连续记录和上位机曲线。另一个方向是**换更精密的器件**：24 位 ADC 能把 LSB 拉低两个数量级，配合 4 线电阻和更高精度的基准，误差分析里那两项"吸收不掉"的项才会真正下降。


