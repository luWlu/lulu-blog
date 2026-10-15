---
title: "实验五：模拟量输出（DA 波形发生：固定电压 / 正弦 / 方波 / 三角）"
description: "Zynq 纯 PL 工程驱动 DAC8871，用 DDS 波表输出固定电压、正弦、方波、三角波，含串行时序、仿真参考与实测记录表。"
date: 2026-10-12
order: 6
stage: "进阶"
status: "已完成"
board: "Zynq-7035 核心板 + 自制 AD/DA 底板"
tools: ["Vivado 2020.2", "Icarus Verilog", "Node.js", "示波器", "万用表"]
tags: ["Zynq", "DA输出", "DAC8871", "DDS", "波形发生"]
accent: "lime"
diagram: "wave"
draft: false
sample: false
---

## 这个实验要做什么

前几个实验里，我们一直在跟"数字世界"打交道：LED、按键、PWM、ADC 采样。这个实验要跨过那条界——**让 FPGA 说出一个电压**。

具体做法是：用一块 Zynq-7035 开发板（MZ7XCORE676B 核心板 + SOC 多功能底板），通过一颗 **DAC8871**（16 位、串行输入、双极性电压输出）配合 **IL715 数字隔离器**与 **OPA207 输出缓冲**，把 FPGA 内部算出来的数字码值变成真正的模拟电压，从底板的 SCSI2 端子送出来，用示波器和万用表读数。

实验目的可以拆成三条：

1. 熟悉模拟量输出的电路结构（DAC8871 + 隔离器 + 输出缓冲）与逻辑控制方法（串行时序）；
2. 掌握"码值 → 输出电压"的换算，按数据输出指定固定电压并用示波器 / 万用表验证；
3. 掌握 DDS 思想：把正弦、方波、三角波变成数据序列，按更新节拍送 DA 还原波形，用示波器采集并记录频率 / 幅度 / 形状。

**器材**：Zynq-7035 开发板（MZ7XCORE676B 核心板 + SOC 多功能底板）、示波器、万用表（可选）、USB 下载线。
**工具**：Vivado 2020.2、Icarus Verilog（`iverilog / vvp 已加入 PATH`）、Node.js（重新生成正弦表用）。

这是一个**纯 PL 工程**（无 PS 参与）。这点值得先说明：整条数据通路、节拍发生、波形计算、串行帧控制全部用 Verilog 写在 PL 里，不跑 ARM、不写 SDK 程序。参数调节靠 Vivado 的 **VIO（Virtual I/O）**在 Hardware Manager 里在线改，改完立即生效，**不需要重新综合**。

实验材料按以下几类整理；其中上板量测维度尚未填写，不能视为已完成的测量结果：

| 交付物 | 内容 |
|---|---|
| 代码 | 5 个 RTL 模块 + XDC（本目录已备好，要求能讲解） |
| 仿真 | 3 个测试平台全部 PASS（含 DAC8871 行为模型的时序检查） |
| 上板 | 固定电压 7 个点实测 + 三种波形示波器采集 |
| 记录 | `docs/measure_template.md` 中的测量维度 |
| 报告 | 见后文「报告要点」章节 |

## 最终能输出什么波形

四种输出由 VIO 的 `mode` 选择：**0 = 固定电压（由 `dc_mv` 设定）、1 = 正弦、2 = 方波、3 = 三角波**。频率 `freq_hz`、幅度 `amp_mv`、直流值 `dc_mv` 都在 Hardware Manager 里实时改。

- **固定电压**：`mode=0`，输出一个稳定直流，范围 ±15000 mV，16 位分辨率（1 LSB ≈ 0.4578 mV）。这是用来验证"码值 → 电压"换算是否准确的那一档。
- **正弦**：`mode=1`，4096 点 × 16 位查找表 + 32 位相位累加器，默认 1 kHz / ±10 V。
- **方波**：`mode=2`，直接用相位累加器的最高位，长期平均 50% 占空比，前后半周期分别输出 +32767 / −32767。
- **三角**：`mode=3`，相位高 12 位做折叠（后半周期取反），先升后降，每半周期 2048 级。

默认更新节拍是 `UPDATE_HZ = 100 kSPS`，也就是**每 10 µs 送一个码值**——这个数字后面会反复出现，它既决定了波形的采样点数，也决定了示波器上能看到的"台阶"。1 kHz 时每周期 100 个点，看起来很平滑；把频率调到 10 kHz 就只有 10 个点了，会看到明显的折线——这恰恰是"按数据输出波形"这个本质最直观的证据。

## 硬件原理（先看懂信号链）

### 信号链上的五个环节

整条链子不长，但每一环都有它的理由：FPGA 给出码值和三线时序，隔离器把数字地和模拟地彻底分开，DAC 把码值变成电压，运放跟随器提供驱动能力，最后从底板的 SCSI2 端子引出来给仪器测。

<figure class="diagram"><svg viewBox="0 0 720 320" role="img" aria-label="DA 输出信号链：FPGA 经 IL715 隔离驱动 DAC8871，OPA207 缓冲后由 SCSI2 端子输出">
  <rect x="20" y="70" width="110" height="70" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"></rect>
  <text x="75" y="96" font-size="12" text-anchor="middle" fill="currentColor">FPGA (PL)</text>
  <text x="75" y="112" font-size="11" text-anchor="middle" fill="currentColor">DDS + 串行帧</text>
  <text x="75" y="128" font-size="11" text-anchor="middle" fill="currentColor">da_core</text>
  <rect x="160" y="70" width="110" height="70" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"></rect>
  <text x="215" y="100" font-size="12" text-anchor="middle" fill="currentColor">IL715</text>
  <text x="215" y="118" font-size="11" text-anchor="middle" fill="currentColor">数字隔离</text>
  <rect x="300" y="70" width="110" height="70" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"></rect>
  <text x="355" y="100" font-size="12" text-anchor="middle" fill="currentColor">DAC8871</text>
  <text x="355" y="118" font-size="11" text-anchor="middle" fill="currentColor">16 位串行 DAC</text>
  <rect x="440" y="70" width="110" height="70" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"></rect>
  <text x="495" y="100" font-size="12" text-anchor="middle" fill="currentColor">OPA207</text>
  <text x="495" y="118" font-size="11" text-anchor="middle" fill="currentColor">电压跟随</text>
  <rect x="580" y="70" width="110" height="70" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"></rect>
  <text x="635" y="100" font-size="12" text-anchor="middle" fill="currentColor">SCSI2 端子</text>
  <text x="635" y="118" font-size="11" text-anchor="middle" fill="currentColor">22 / 23 脚</text>
  <line x1="130" y1="105" x2="148" y2="105" stroke="currentColor" stroke-width="2"></line>
  <polygon points="160,105 146,99 146,111" fill="currentColor"></polygon>
  <line x1="270" y1="105" x2="288" y2="105" stroke="currentColor" stroke-width="2"></line>
  <polygon points="300,105 286,99 286,111" fill="currentColor"></polygon>
  <line x1="410" y1="105" x2="428" y2="105" stroke="currentColor" stroke-width="2"></line>
  <polygon points="440,105 426,99 426,111" fill="currentColor"></polygon>
  <line x1="550" y1="105" x2="568" y2="105" stroke="currentColor" stroke-width="2"></line>
  <polygon points="580,105 566,99 566,111" fill="currentColor"></polygon>
  <text x="20" y="185" font-size="11" fill="currentColor" opacity="0.85">VIO 虚拟输入（Hardware Manager）：mode[1:0] / freq_hz / amp_mv / dc_mv</text>
  <text x="20" y="207" font-size="11" fill="currentColor" opacity="0.85">CS_N / SCK / SDI 三线串行（MSB 在前，CS 上升沿把数据打入 DAC）</text>
  <text x="20" y="229" font-size="11" fill="currentColor" opacity="0.85">SCK = 12.5 MHz（SCK_DIV=8），整帧 136 拍 = 1.36 µs，节拍 100 kSPS</text>
  <text x="20" y="251" font-size="11" fill="currentColor" opacity="0.85">DAC 高/低参考直接接 ISO±15V：Vout = −15V + 30V × code / 65536</text>
  <text x="20" y="273" font-size="11" fill="currentColor" opacity="0.85">LDAC_N 接地 → 输出在 CS 上升沿更新；满量程理论 ±15V</text>
  <text x="20" y="295" font-size="11" fill="currentColor" opacity="0.85">输出以 ISO_GND_D1 为参考，与大地隔离</text>
</svg><figcaption>图 1：DA 输出信号链——FPGA → IL715 隔离 → DAC8871 → OPA207 缓冲 → SCSI2 输出端子</figcaption></figure>

从纯 PL 的角度看数据通路也很清楚：

```text
VIO 虚拟输入(Hardware Manager)                     SCSI2 端子（底板）
 mode[1:0]/freq_hz/amp_mv/dc_mv ─┐                 22 脚 +OUT1 ──┬── 示波器/万用表
                                 ▼                 23 脚 −OUT1 ──┘
  tick(100kSPS)→ wave_gen(DDS) → code[15:0] → dac8871_master
                 相位累加器+波形     │    CS_N/SCK/SDI
                 查找表/折叠        │        │
                                   │     IL715 隔离
                                   │        │
                                   │     DAC8871 → OPA207(跟随)
 code_now ◀─────── （VIO 监视）            │
                                        ±15V 满量程输出
```

注意 `code_now` 这个回读探针：它是 VIO 的**输入**通道，把当前正在送出的码值送回 Hardware Manager 显示。排查问题时它是第一手信息——**先看码值变不变，再看输出电压动不动**，能一步把"逻辑问题"和"硬件链路问题"分开。

### 电路组成（底板 `ad&da.SchDoc`，D1 通道）

| 环节 | 器件 | 作用 |
|---|---|---|
| 数字隔离 | IL715 | 数字侧与模拟侧电气隔离（抑制地环路） |
| DAC | **DAC8871** | 16 位串行输入、双极性电压输出 |
| 输出缓冲 | OPA207 | 电压跟随，提供驱动能力（R10=6.2k 反馈） |
| 隔离电源 | A1215S → ISO±15V；L78L05 → ISO+5V | 给 DAC/隔离器独立供电 |

通道 D2 与 D1 完全对称（本实验只用 D1）。输出端子在 **SCSI2 的 22(+OUT1) / 23(−OUT1)**。

### 码值 ↔ 电压：必须记住的换算关系

板上 DAC8871 的高/低参考直接接 ISO±15V，**没有独立精密基准**（这一点后面在精度讨论和"±15V 削顶"里还会提到），所以传递函数就是一条过零的直线：

```text
Vout = VREFL + (VREFH − VREFL) × code/65536 = −15V + 30V × code/65536
1 LSB = 30000mV/65536 ≈ 0.4578 mV
中码 0x8000(32768) → 0V；0xFFFF → +14.9995V；0x0000 → −15V
```

常用电压速查（VIO 里 `dc_mv` 直接填 mV，RTL 自动换算码值；此表用于核对 `code_now`）：

| 目标电压 | dc_mv | code（16 进制 / 10 进制） | 理论输出 |
|---|---|---|---|
| 0 V | 0 | 0x8000 / 32768 | 0.000 V |
| +5 V | 5000 | 0xAAAA / 43690 | +4.9997 V |
| −5 V | −5000 | 0x5555 / 21845 | −5.0002 V |
| +10 V | 10000 | 0xD555 / 54613 | +9.9998 V |
| −10 V | −10000 | 0x2AAA / 10922 | −10.0003 V |
| +15 V | 15000 | 0xFFFF / 65535 | +14.9995 V |
| −15 V | −15000 | 0x0000 / 0 | −15.0000 V |

> RTL 换算：`code = 32768 + ((dc_mv × 143165) >>> 16)`，其中 143165/65536 ≈ 65536/30000（mV→LSB）。±1 LSB 的不对称（如 +4.9997 / −5.0002）来自 floor 取整方向：正侧丢掉小数、负侧多扣一位，恰好差约 1 LSB，**正常现象，不是 bug**。

### DAC8871 串行时序（RTL 的依据）

三线接口：CS_N（低有效）+ SCK + SDI，**MSB 在前、SDI 在 SCK 上升沿被锁存**；16 位移完后 CS 拉高，**CS 的上升沿**把数据打入 DAC 锁存器——板上 LDAC_N 接地，所以输出就在 CS 上升沿更新（数据手册 Figure 1「Case 1—LDAC Tied Low」）。

<figure class="diagram"><svg viewBox="0 0 720 320" role="img" aria-label="DAC8871 串行写时序：CS_N 拉低后 tLead，SCK 上跳沿锁存 16 位 SDI，tLag 后 CS 上升沿更新输出">
  <text x="6" y="26" font-size="11" fill="currentColor" opacity="0.85">一帧 = tLead + 16×SCK + tLag，帧间 CS 高电平为 tTD</text>
  <line x1="120" y1="36" x2="170" y2="36" stroke="currentColor" stroke-width="2"></line>
  <line x1="120" y1="32" x2="120" y2="44" stroke="currentColor" stroke-width="2"></line>
  <line x1="170" y1="32" x2="170" y2="44" stroke="currentColor" stroke-width="2"></line>
  <text x="145" y="30" font-size="11" text-anchor="middle" fill="currentColor">tLead 50ns</text>
  <line x1="530" y1="36" x2="620" y2="36" stroke="currentColor" stroke-width="2"></line>
  <line x1="530" y1="32" x2="530" y2="44" stroke="currentColor" stroke-width="2"></line>
  <line x1="620" y1="32" x2="620" y2="44" stroke="currentColor" stroke-width="2"></line>
  <text x="575" y="30" font-size="11" text-anchor="middle" fill="currentColor">tLag 110ns</text>
  <line x1="626" y1="36" x2="698" y2="36" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4"></line>
  <text x="662" y="30" font-size="11" text-anchor="middle" fill="currentColor">tTD</text>
  <text x="6" y="72" font-size="11" fill="currentColor">CS_N</text>
  <polyline points="70,60 120,60 120,80 620,80 620,60 700,60" fill="none" stroke="currentColor" stroke-width="2"></polyline>
  <text x="126" y="98" font-size="11" fill="currentColor" opacity="0.85">CS↓ 开始一帧</text>
  <text x="624" y="98" font-size="11" fill="currentColor" opacity="0.85">CS↑ 输出更新</text>
  <text x="6" y="140" font-size="11" fill="currentColor">SCK</text>
  <polyline points="70,135 170,135 170,115 185,115 185,135 210,135 210,115 225,115 225,135 250,135 250,115 265,115 265,135 290,135 290,115 305,115 305,135 330,135" fill="none" stroke="currentColor" stroke-width="2"></polyline>
  <line x1="334" y1="125" x2="466" y2="125" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4"></line>
  <text x="400" y="118" font-size="11" text-anchor="middle" fill="currentColor" opacity="0.85">共 16 个上升沿</text>
  <polyline points="466,135 470,135 470,115 485,115 485,135 530,135" fill="none" stroke="currentColor" stroke-width="2"></polyline>
  <line x1="170" y1="106" x2="210" y2="106" stroke="currentColor" stroke-width="2"></line>
  <line x1="170" y1="102" x2="170" y2="110" stroke="currentColor" stroke-width="2"></line>
  <line x1="210" y1="102" x2="210" y2="110" stroke="currentColor" stroke-width="2"></line>
  <text x="190" y="100" font-size="11" text-anchor="middle" fill="currentColor">tSCK 80ns</text>
  <text x="6" y="196" font-size="11" fill="currentColor">SDI</text>
  <polyline points="70,195 170,195 170,180 215,180 215,205 260,205 260,185 305,185 305,195" fill="none" stroke="currentColor" stroke-width="2"></polyline>
  <line x1="305" y1="195" x2="465" y2="195" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4"></line>
  <polyline points="465,195 470,195 470,185 530,185 530,195 620,195" fill="none" stroke="currentColor" stroke-width="2"></polyline>
  <text x="192" y="175" font-size="11" text-anchor="middle" fill="currentColor">D15</text>
  <text x="237" y="220" font-size="11" text-anchor="middle" fill="currentColor">D14</text>
  <text x="282" y="180" font-size="11" text-anchor="middle" fill="currentColor">D13</text>
  <text x="500" y="180" font-size="11" text-anchor="middle" fill="currentColor">D0</text>
  <text x="6" y="266" font-size="11" fill="currentColor">LDAC</text>
  <line x1="70" y1="261" x2="620" y2="261" stroke="currentColor" stroke-width="2"></line>
  <text x="628" y="265" font-size="11" fill="currentColor" opacity="0.85">LDAC_N 接地(=0)</text>
  <text x="6" y="296" font-size="11" fill="currentColor" opacity="0.85">SDI 在 SCK 上升沿被锁存，SCK 下降沿换下一位（MSB 在前，共 16 位）</text>
  <text x="6" y="314" font-size="11" fill="currentColor" opacity="0.85">16 位送完后 CS 拉高，CS 上升沿把数据打入 DAC 锁存器，输出随即更新</text>
</svg><figcaption>图 2：DAC8871 串行写时序——CS_N / SCK / SDI / LDAC_N 与 tLead、tSCK、tLag、tTD 四个关键时间</figcaption></figure>

帧结构与参数（默认配置，SCK_DIV=8 → SCK=12.5 MHz）：

```text
        ┌─ tLead ─┐┌── 16 × SCK 周期 ──┐┌ tLag ┐
 CS_N   ──┐       └────────────────────┘       ┌────   ← CS↑ 输出更新
 SCK     ──┘ ↑每个上升沿锁存 1 位（MSB 先）      ↑
 SDI     ────D15────D14────────────────────D0──      （SCK↓ 换下一位）
```

| 参数 | 手册最小值 | 本设计取值 | 裕量 |
|---|---|---|---|
| tSCK（SCK 周期） | 20 ns | 80 ns | 4× |
| tWSCK（高/低电平宽度） | 10 ns | 40 ns | 4× |
| tSU（SDI 建立） | 10 ns | 40 ns（SCK↓换数，隔离器通道延时近似抵消） | ~4× |
| tLead（CS↓→首个 SCK↑） | 10 ns | 50 ns（5 拍） | 5× |
| tLag（第 16 个 SCK→CS↑） | 10 ns | 110 ns（11 拍） | 11× |
| tTD（帧间 CS 高） | 30 ns | 10000−1360 = 8640 ns | 288× |
| 整帧长度 | — | 4+16×8+4 = **136 拍 = 1.36 µs** | < 10 µs 更新节拍 |

> SCK 只跑 12.5 MHz 的原因与 experiment4 的 ADC 相同：SCK/SDI 都要穿过 IL715（单程延时约 10~20 ns），SCK 与 SDI 两通道延时近似相等，真正的威胁是**时延差**，12.5 MHz 下建立裕量仍有 ~20-30 ns。若实测异常，把 `da_core` 的 `SCK_DIV` 加到 16，核对相位计数位宽与新帧长后重新综合。

### DDS：怎么"按数据输出波形"

以固定节拍（更新率 `UPDATE_HZ = 100 kSPS`，即每 10 µs 送一个码值）刷新 DAC，波形数据来自一个 32 位**相位累加器**：

```text
每 tick：phase += fstep ,  fstep = freq_hz × 42950 (≈ 2^32/100000)
输出频率 = fstep × 100kHz / 2^32 ≈ freq_hz（误差 < 8 ppm）
```

三种波形的"数据"来源不同（`wave_gen.v`）：

| 波形 | 数据来源 | 说明 |
|---|---|---|
| 正弦 | **4096 点×16 位查找表**（phase 高 12 位作地址） | 表由 `scripts/gen_sine_lut.js` 生成：round(32767·sin(2πk/4096)) |
| 方波 | phase 最高位 | 前半周期 +32767，后半周期 −32767（长期平均 50% 占空比） |
| 三角 | phase 高 12 位折叠（后半周期取反） | 先升后降，每半周期 2048 级 |

幅度统一处理：`code = 32768 + ((w × K) >>> 15)`，`K = (amp_mv × 143165)>>>16`（mV→LSB），所以任意幅度（钳位 ±15000 mV）下三种波形共用一条数据通路，只需一个 16×16 乘法器（DSP48）。

<figure class="diagram"><svg viewBox="0 0 720 320" role="img" aria-label="DDS 波形发生原理：节拍驱动 32 位相位累加器，相位截断后查表或折叠得到波形数据，再经幅度偏移换算为 DAC 码值">
  <text x="6" y="30" font-size="11" fill="currentColor" opacity="0.85">VIO 实时参数：mode 选波形 / freq_hz（≤20 kHz）/ amp_mv（钳位 ±15000 mV）</text>
  <rect x="16" y="70" width="128" height="100" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"></rect>
  <text x="80" y="95" font-size="11" text-anchor="middle" fill="currentColor">节拍 tick</text>
  <text x="80" y="113" font-size="11" text-anchor="middle" fill="currentColor">100 kSPS</text>
  <text x="80" y="131" font-size="11" text-anchor="middle" fill="currentColor">每 10 µs 一次</text>
  <rect x="156" y="70" width="128" height="100" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"></rect>
  <text x="220" y="95" font-size="11" text-anchor="middle" fill="currentColor">相位累加器</text>
  <text x="220" y="113" font-size="11" text-anchor="middle" fill="currentColor">32 位</text>
  <text x="220" y="131" font-size="11" text-anchor="middle" fill="currentColor">phase += fstep</text>
  <rect x="296" y="70" width="128" height="100" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"></rect>
  <text x="360" y="95" font-size="11" text-anchor="middle" fill="currentColor">相位截断</text>
  <text x="360" y="113" font-size="11" text-anchor="middle" fill="currentColor">取高 12 位</text>
  <text x="360" y="131" font-size="11" text-anchor="middle" fill="currentColor">地址 0~4095</text>
  <rect x="436" y="70" width="128" height="100" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"></rect>
  <text x="500" y="95" font-size="11" text-anchor="middle" fill="currentColor">波形数据 w</text>
  <text x="500" y="113" font-size="11" text-anchor="middle" fill="currentColor">正弦 LUT 4096</text>
  <text x="500" y="131" font-size="11" text-anchor="middle" fill="currentColor">方波 phase[31]</text>
  <text x="500" y="149" font-size="11" text-anchor="middle" fill="currentColor">三角折叠</text>
  <rect x="576" y="70" width="128" height="100" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"></rect>
  <text x="640" y="95" font-size="11" text-anchor="middle" fill="currentColor">幅度 / 偏移</text>
  <text x="640" y="113" font-size="11" text-anchor="middle" fill="currentColor">code = 32768 +</text>
  <text x="640" y="131" font-size="11" text-anchor="middle" fill="currentColor">(w × K) &gt;&gt;&gt; 15</text>
  <line x1="144" y1="120" x2="148" y2="120" stroke="currentColor" stroke-width="2"></line>
  <polygon points="156,120 142,114 142,126" fill="currentColor"></polygon>
  <line x1="284" y1="120" x2="288" y2="120" stroke="currentColor" stroke-width="2"></line>
  <polygon points="296,120 282,114 282,126" fill="currentColor"></polygon>
  <line x1="424" y1="120" x2="428" y2="120" stroke="currentColor" stroke-width="2"></line>
  <polygon points="436,120 422,114 422,126" fill="currentColor"></polygon>
  <line x1="564" y1="120" x2="568" y2="120" stroke="currentColor" stroke-width="2"></line>
  <polygon points="576,120 562,114 562,126" fill="currentColor"></polygon>
  <text x="6" y="200" font-size="11" fill="currentColor" opacity="0.85">fstep = freq_hz × 42950（≈ 2^32 / 100000）；输出频率 = fstep × 100 kHz / 2^32 ≈ freq_hz</text>
  <text x="6" y="222" font-size="11" fill="currentColor" opacity="0.85">正弦表 round(32767·sin(2πk/4096))，16 位有符号；方波用最高位，长期平均 50% 占空比</text>
  <text x="6" y="244" font-size="11" fill="currentColor" opacity="0.85">三角：高 12 位折叠（后半周期取反），每半周期 2048 级，amp=10000 时峰峰值比正弦小 20 LSB</text>
  <text x="6" y="266" font-size="11" fill="currentColor" opacity="0.85">K = (amp_mv × 143165) &gt;&gt;&gt; 16（mV→LSB），三种波形共用同一乘法通路（DSP48）</text>
  <text x="6" y="288" font-size="11" fill="currentColor" opacity="0.85">采样点数 = 100 kSPS / freq：1 kHz → 100 点/周期（平滑）；10 kHz → 10 点（折线）</text>
  <text x="6" y="310" font-size="11" fill="currentColor" opacity="0.85">最终 code[15:0] 交给 dac8871_master 组装成串行帧送出</text>
</svg><figcaption>图 3：DDS 波形发生原理——相位累加器 → 相位截断 → 查表 / 折叠 → 幅度与偏移 → DAC 码值</figcaption></figure>

采样点数 = 100kSPS / freq：1 kHz → 100 点/周期（平滑）；10 kHz → 10 点（明显折线，正好用来观察"按数据输出"的阶梯本质，见测量表选做 B）。

### 接线（重要！）

| SCSI2 脚 | 信号 | 接哪里 |
|---|---|---|
| 22 | +OUT1 | 示波器 CH1 探头芯线 / 万用表红表笔 |
| 23 | −OUT1 | 示波器探头地夹 / 万用表黑表笔 |

- **必须接 −OUT1**：输出是隔离的（ISO_GND_D1 为参考），不接地没有参考点；
- 万用表可与示波器并联同时读数（直流档用）；
- 不要把 +OUT1 与 −OUT1 短路（OPA207 输出无短路保护，虽有限流但不建议）。

### 安全提示

- 输出电压范围理论 ±15V——对人是安全电压，但别去驱动低阻负载（>1 kΩ 为宜）；
- 输出与大地隔离，示波器地夹接 −OUT1 后该点与示波器外壳共地，属正常现象；
- 换接线前先 `mode=0, dc_mv=0` 让输出回 0V 再操作。

## 关键代码（RTL 五个模块）

工程里一共 5 个 RTL 模块，正好对应信号链上的四件事：**算出码值、按时送出、把码值串行化、把三根线接到管脚**。

| 模块 | 职责 | 关键词 |
|---|---|---|
| `dac8871_master.v` | DAC8871 串行帧控制（CS/SCK/SDI 时序） | 四状态机 IDLE→LEAD→SHIFT→LAG |
| `wave_gen.v` | DDS：相位累加 + 正弦表/方波/三角 + 码值换算 | 32 位 phase、`FSTEP_MUL=42950` |
| `sine_lut.v` | 4096×16bit 正弦表（由脚本生成，勿手改） | `round(32767·sin(2πk/4096))` |
| `da_core.v` | 节拍发生 + 例化上面两个 + LED | `UPDATE_CYC = 1000` |
| `da_output_top.v` | 顶层 = `da_core` + `vio_0` | 纯 PL，无 PS |

### 串行写状态机：`dac8871_master.v`

这个模块的全部难点都在**时间**上。头注释已经把手册要求写清楚了：

```verilog
// 数据手册（SBAS396A）关键时序 —— 本模块据此实现：
//   * SDI 数据在 SCLK **上升沿** 被锁存进输入移位寄存器，MSB 在前，共 16 位；
//     主机应在 SCLK 下降沿（或更早）更新 SDI，保证上升沿前数据已稳定。
//   * CS 拉低期间恰好移入 16 位；第 16 个 SCLK 之后必须立刻把 CS 拉高，
//     CS 的上升沿把输入寄存器内容打入 DAC 锁存器 —— 由于板上 LDAC_N 接地，
//     输出电压就在 CS 上升沿更新（Case 1: LDAC Tied Low）。
//   * 时序参数（全部为最小值，VDD=5V）：
//       tSCK   ≥ 20 ns  SCLK 周期        tWSCK ≥ 10 ns  SCLK 高/低电平宽度
//       tLead  ≥ 10 ns  CS↓ 到首个 SCLK↑ tLag  ≥ 10 ns  第 16 个 SCLK 后 CS↑
//       tSU    ≥ 10 ns  SDI 建立时间     tHO   ≥ 0 ns   SDI 保持时间
//       tDSCLK ≥ 10 ns  CS↑ 到下一 SCLK↑ tTD   ≥ 30 ns  两帧之间 CS 高电平时间
```

帧的每一拍怎么排，注释里也逐点标了出来（时刻以 CS↓ 所在拍为 T0）：

```verilog
// 帧结构（SCK_DIV=8，位周期 80 ns；时刻以 CS↓ 所在拍为 T0）：
//   T0   CS↓ 并摆出 MSB（同一拍寄存器输出）
//   T5   第 1 个 SCK↑（tLead = 50 ns）——注意比 LEAD_CYC 多 1 拍：
//        S_LEAD 占 T1..T4 共 4 拍，首个上升沿发生在进入 S_SHIFT 后的第 1 拍
//   T5+8k 每位一个 SCK 周期：↑ 在 phase0，↓ 在 phase4 并换下一位（建立 40 ns）
//   T125 第 16 个 SCK↑；T129 第 16 个 ↓
//   T136 CS↑（tLag = 11 拍 = 110 ns：位槽剩余 4 拍 + 相位收尾 3 拍 + LAG 4 拍）
//   总帧长 = 136 拍 = 1.36 µs，远小于 10 µs 的更新节拍（100 kSPS）。
```

状态机本体（四个状态，`busy = (state != S_IDLE)`）：

```verilog
localparam [1:0] S_IDLE  = 2'd0,   // 等待 load
                 S_LEAD  = 2'd1,   // CS 已拉低，摆出 MSB，等 tLead
                 S_SHIFT = 2'd2,   // 16 个 SCK 周期移出
                 S_LAG   = 2'd3;   // 等 tLag 后 CS 拉高（输出更新）

always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        state    <= S_IDLE;
        phase    <= 4'd0;
        bit_cnt  <= 5'd0;
        cyc_cnt  <= 16'd0;
        shreg    <= 16'd0;
        dac_csn  <= 1'b1;      // 未选中：DAC 忽略 SCK/SDI，输出保持
        dac_sck  <= 1'b0;      // SCK 空闲为低（CS 高期间 SCK 电平无关紧要）
        dac_sdi  <= 1'b0;
        code_now <= 16'h8000;  // 中码 = 0V，与芯片上电复位值一致
    end else begin
        case (state)
            // ------------------------------------------------ 等待装载
            S_IDLE: begin
                dac_sck <= 1'b0;
                if (load) begin
                    shreg    <= data;        // 锁存本帧码值
                    code_now <= data;
                    dac_sdi  <= data[15];    // 先摆出 MSB（tLead 内稳定）
                    dac_csn  <= 1'b0;        // CS 拉低，帧开始
                    cyc_cnt  <= 16'd0;
                    state    <= S_LEAD;
                end
            end

            // ------------------------------------------------ tLead
            // CS 已低、SDI=MSB 已稳定；S_LEAD 占 4 拍，进入 S_SHIFT 后的
            // 第 1 拍（phase==0）才出首个 SCK↑ → tLead 实际 = 5 拍 = 50 ns
            S_LEAD: begin
                if (cyc_cnt >= LEAD_CYC - 1) begin
                    cyc_cnt <= 16'd0;
                    phase   <= 4'd0;
                    bit_cnt <= 5'd0;
                    state   <= S_SHIFT;
                end else begin
                    cyc_cnt <= cyc_cnt + 16'd1;
                end
            end

            // ------------------------------------------------ 移出 16 位
            // phase==0        ：SCK 拉高 —— 上升沿，DAC 在此锁存当前 SDI 位
            // phase==HALF_DIV ：SCK 拉低 —— 下降沿，同时移出下一位（半周期后
            //                   才有下一个上升沿，建立时间 = 40 ns ≥ tSU 10 ns）
            // phase==SCK_DIV-1：一个 SCK 周期结束；16 位发完转 S_LAG
            S_SHIFT: begin
                if (phase == 4'd0) begin
                    dac_sck <= 1'b1;                  // 第 n 个上升沿
                    bit_cnt <= bit_cnt + 5'd1;
                end else if (phase == PHASE_HALF) begin
                    dac_sck <= 1'b0;                  // 下降沿
                    if (bit_cnt < 5'd16) begin        // 16 位移完就不再换数
                        shreg   <= {shreg[14:0], 1'b0};
                        dac_sdi <= shreg[14];
                    end
                end

                if (phase == PHASE_LAST) begin
                    phase <= 4'd0;
                    if (bit_cnt == 5'd16) begin
                        dac_sck <= 1'b0;
                        cyc_cnt <= 16'd0;
                        state   <= S_LAG;
                    end
                end else begin
                    phase <= phase + 4'd1;
                end
            end

            // ------------------------------------------------ tLag + CS↑
            // 第 16 个上升沿在 S_LAG 前的 phase==0 时刻；此后经位槽低电平 4 拍
            // + 相位收尾 3 拍 + 本状态 LAG_CYC=4 拍，共 11 拍（110 ns ≥ tLag
            // 10 ns）才拉高 CS：输出更新
            S_LAG: begin
                if (cyc_cnt >= LAG_CYC - 1) begin
                    dac_csn <= 1'b1;   // CS 上升沿 -> DAC 锁存器更新（LDAC_N=0）
                    dac_sdi <= 1'b0;
                    state   <= S_IDLE;
                end else begin
                    cyc_cnt <= cyc_cnt + 16'd1;
                end
            end

            default: state <= S_IDLE;
        endcase
    end
end
```

模块参数都可以调，这是"实测异常时的后门"：

```verilog
module dac8871_master #(
    parameter integer CLK_HZ   = 100_000_000, // 系统时钟
    parameter integer SCK_DIV  = 8,           // SCK = CLK_HZ / SCK_DIV（≥4 的偶数）
    parameter integer LEAD_CYC = 4,           // CS↓ 到首个 SCLK↑ 的拍数（≥1，即 ≥10 ns）
    parameter integer LAG_CYC  = 4            // 第 16 个 SCLK 到 CS↑ 的拍数（≥1，即 ≥10 ns）
)(
```

> 隔离器延时（与 experiment4 的 ADC 经验一致）：SCK 与 SDI 各穿过 IL715 的一个通道（约 10~20 ns）。本模块让 SDI 在 SCK 下降沿更新（距下一个上升沿半周期 = 40 ns），两个通道延时近似相等、只有时延差（skew）会侵蚀建立裕量，故 SCK=12.5 MHz 时仍有约 20~30 ns 裕量。如实测波形异常，加大 `SCK_DIV`（如 16），并核对相位计数位宽与新帧长。

### 波形发生：`wave_gen.v`

四种模式共用一条数据通路，区别只在 `w_sel` 从哪来：

```verilog
// 四种模式（mode）共用一个 16 位码值输出（code，直接送 DAC8871）：
//   0 DC    ：code = 32768 + dc_mv  x 2.18453   （直流码值，含符号）
//   1 正弦  ：w = LUT[phase[31:20]] = 32767*sin(2πk/4096)
//   2 方波  ：w = ±32767（前半周期 +，后半周期 −）
//   3 三角  ：w = 由相位折叠出的 0..4095 三角波 × 16 − 16376)×2 ≈ ±32752
//   交流模式：code = 32768 + ((w x K) >>> 15) ,  K = amp_mv x 2.18453（LSB）
```

相位累加与三种波形的取数方式，全部在一个 `tick` 上更新：

```verilog
// ---------------------------------------------------------------- 常数
localparam signed [31:0] MV2LSB_MUL = 32'sd143165; // = 65536/30000 × 2^16
localparam [31:0] FSTEP_MUL = 32'd42950;           // = 2^32/100000 取整
localparam [31:0] FREQ_MAX  = 32'd20000;           // 更新率 100kSPS 下的上限

// ---------------------------------------------------------------- 输入整形
wire [31:0] freq_clamped = (freq_hz > FREQ_MAX) ? FREQ_MAX : freq_hz;
wire [31:0] fstep = freq_clamped * FSTEP_MUL;      // 20000x42950 ≈ 8.6e8 < 2^31

wire signed [15:0] amp_c = (amp_mv > 16'sd15000) ? 16'sd15000 :
                           (amp_mv < -16'sd15000) ? -16'sd15000 : amp_mv;
wire signed [15:0] dc_c   = (dc_mv  > 16'sd15000) ? 16'sd15000 :
                           (dc_mv  < -16'sd15000) ? -16'sd15000 : dc_mv;

// 幅度（LSB）：K = (amp_c × 143165) >>> 16，范围 ±32767
wire signed [31:0] k_full = (amp_c * MV2LSB_MUL) >>> 16;
wire signed [15:0] K      = k_full[15:0];

// 直流偏移码：dc_off = (dc_c × 143165) >>> 16
wire signed [31:0] dc_off32 = (dc_c * MV2LSB_MUL) >>> 16;
wire signed [15:0] dc_off   = dc_off32[15:0];

// ---------------------------------------------------------------- 相位与波形
reg [31:0] phase;

// 正弦表实例（组合逻辑）
wire [LUT_AW-1:0] lut_addr = phase[31:32-LUT_AW];
wire signed [15:0] w_sin;
sine_lut #(.AW(LUT_AW)) u_lut (.addr(lut_addr), .dout(w_sin));

// 方波：相位最高位为 1 表示后半周期
wire signed [15:0] w_sq = phase[31] ? -16'sd32767 : 16'sd32767;

// 三角波：后半周期(dir=1)地址取反 → 先升后降；再对齐到 ±32752
wire        tri_dir = phase[31];
wire [10:0] tri_pos = tri_dir ? ~phase[30:20] : phase[30:20];
wire signed [15:0] w_tri = ($signed({1'b0, tri_pos, 4'b0}) - 16'sd16376) <<< 1;

// 模式选择
reg signed [15:0] w_sel;
always @(*) begin
    case (mode)
        2'd1:    w_sel = w_sin;
        2'd2:    w_sel = w_sq;
        2'd3:    w_sel = w_tri;
        default: w_sel = 16'sd0;   // DC 模式不用 w
    endcase
end

// 交流：off = (w_sel × K) >>> 15（范围 ±32767，不溢出：32767²≈2^30）
wire signed [31:0] off32 = (w_sel * K) >>> 15;
wire signed [15:0] off   = off32[15:0];

// ---------------------------------------------------------------- tick 时更新
reg [31:0] phase_next;
always @(*) phase_next = phase + fstep;

always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        phase      <= 32'd0;
        code       <= 16'h8000;   // 上电默认 0V（中码）
        code_valid <= 1'b0;
    end else begin
        code_valid <= 1'b0;
        if (tick) begin
            phase      <= phase_next;
            code       <= (mode == 2'd0) ? (16'sd32768 + dc_off)
                                        : (16'sd32768 + off);
            code_valid <= 1'b1;
        end
    end
end
```

三个设计细节值得单独点出来：

- **方波不用查表**：`phase[31]` 划分两个等长相位区间，长期平均占空比为 50%；边沿仍量化到 10 µs 更新网格，单个周期的高低拍数可能不同；
- **三角波每半周期 2048 级**：`tri_pos` 只有 11 位（`phase[30:20]`），所以原始幅度是 ±32752 而不是 ±32767，这正是"amp=10000 时三角波峰峰值比正弦/方波小 20 LSB"的来源；
- **交流波形共用幅度乘法通路**：`K = (amp_mv × 143165) >>> 16` 把 mV 变成 LSB，三种波形共用 `(w × K) >>> 15`。还需计入幅度与直流换算的乘法，后面的综合记录为共 3 个 DSP48，不能把整机说成只有一个乘法器。

### 查表：`sine_lut.v`

表本身没有逻辑，它是脚本生成的：

```verilog
// =============================================================================
// sine_lut.v — 正弦查找表（本文件由 scripts/gen_sine_lut.js 生成，勿手改）
// -----------------------------------------------------------------------------
// lut[k] = round(32767 * sin(2*pi*k/4096))，k=0..4095，一个整周期，MSB 对齐。
// 相位累加器高 12 位作地址；输出有符号 16 位，0 对应 0V（码值换算在上级模块）。
// =============================================================================

module sine_lut #(
    parameter integer AW = 12          // 地址位数（默认 4096 点）
)(
    input  wire [AW-1:0] addr,
    output reg  signed [15:0] dout
);

    always @(*) begin
        case (addr)
            12'd0: dout = 16'sh0000;
            12'd1: dout = 16'sh0032;
            12'd2: dout = 16'sh0065;
            12'd3: dout = 16'sh0097;
            // …… 共 4096 项，此处省略 ……
```

起始几项正好可以当正确性自检：`sin(2π/4096) × 32767 ≈ 50.27 → 0x32 = 50`，`k=2` 时约 100.5 → 0x65 = 101，和文件里一致。整个文件 4118 行，4096 项加注释——**所以"勿手改"不是客套话**，要改就用脚本重新生成。

### 数据通路：`da_core.v` 与 `da_output_top.v`

`da_core` 负责三件事：产生精确的 100 kSPS 节拍、把 `wave_gen` 和 `dac8871_master` 接起来、点灯。

```verilog
localparam integer UPDATE_CYC = CLK_HZ / UPDATE_HZ;   // 1000

// ---------------------------------------------------------------- 上电复位
// 无外部复位按键：用自由运行计数器产生 ~2.55 µs 的上电复位
reg [7:0] por_cnt = 8'd0;
always @(posedge clk) begin
    if (por_cnt != 8'hFF) por_cnt <= por_cnt + 8'd1;
end
wire rst_n = (por_cnt == 8'hFF);

// ---------------------------------------------------------------- 更新节拍
// 自由运行计数（不依赖上一帧是否完成），保证更新率精确等于 UPDATE_HZ
reg [9:0] tick_cnt = 10'd0;
always @(posedge clk or negedge rst_n) begin
    if (!rst_n) tick_cnt <= 10'd0;
    else if (tick_cnt == UPDATE_CYC - 1) tick_cnt <= 10'd0;
    else tick_cnt <= tick_cnt + 10'd1;
end
wire tick = (tick_cnt == 10'd0) & rst_n;   // 每 UPDATE_CYC 拍一拍
```

注意这里是**自由运行计数**，不等上一帧结束——因为帧长 136 拍远小于 1000 拍，这样做能让更新率严格等于 100 kSPS，不引入抖动。

两个模块的连接（`code_valid` 就是 `load`，同拍 `code` 有效）：

```verilog
wave_gen #(
    .CLK_HZ    (CLK_HZ),
    .UPDATE_HZ (UPDATE_HZ),
    .LUT_AW    (12)
) u_wave (
    .clk        (clk),
    .rst_n      (rst_n),
    .tick       (tick),
    .mode       (mode),
    .freq_hz    (freq_hz),
    .amp_mv     (amp_mv),
    .dc_mv      (dc_mv),
    .code       (code),
    .code_valid (code_valid)
);

dac8871_master #(
    .CLK_HZ   (CLK_HZ),
    .SCK_DIV  (SCK_DIV),
    .LEAD_CYC (4),
    .LAG_CYC  (4)
) u_dac (
    .clk      (clk),
    .rst_n    (rst_n),
    .load     (code_valid),   // tick 拍产生，code 同拍有效
    .data     (code),
    .dac_csn  (dac1_csn),
    .dac_sck  (dac1_sck),
    .dac_sdi  (dac1_sdi),
    .code_now (code_now),
    .busy     ()
);
```

LED 既是"活着"的证据，也是模式的第二指示（低电平点亮）：

```verilog
// 心跳：bit26 翻转周期 1.34 s → ~0.75 Hz 方波
// 模式灯：DC 灭；正弦/方波/三角用不同闪烁频率区分
case (mode)
    2'd1:    mode_led = led_cnt[26];  // ~0.75 Hz
    2'd2:    mode_led = led_cnt[25];  // ~1.5  Hz
    2'd3:    mode_led = led_cnt[24];  // ~3    Hz
    default: mode_led = 1'b0;         // DC：灭
endcase
```

顶层就是 `vio_0` 加 `da_core`，没有别的东西——纯 PL 工程的简洁之处：

```verilog
// 上电后 VIO 输出为初始值（mode=DC、dc_mv=+5000mV → 输出 +5.000V），
// 打开 Hardware Manager -> VIO 窗口即可实时修改。

vio_0 u_vio (
    .clk        (clk),
    .probe_out0 (mode),
    .probe_out1 (freq_hz),
    .probe_out2 (amp_mv),
    .probe_out3 (dc_mv),
    .probe_in0  (code_now)
);

da_core #(
    .CLK_HZ    (100_000_000),
    .UPDATE_HZ (100_000),
    .SCK_DIV   (8)
) u_core (
    .clk      (clk),
    .mode     (mode),
    .freq_hz  (freq_hz),
    .amp_mv   (amp_mv),
    .dc_mv    (dc_mv),
    .dac1_csn (dac1_csn),
    .dac1_sck (dac1_sck),
    .dac1_sdi (dac1_sdi),
    .code_now (code_now),
    .led_heart(led_heart),
    .led_mode (led_mode)
);
```

## 管脚分配与电平约束

### 本实验用到的引脚

本实验只用 DAC 通道 1（D1）。球号推导沿用 experiment4_ad_capture 的三方核对结论（底板连接器 ↔ 核心板 PIHT10 ↔ Vivado 器件库），不重复推导：

| 功能 | 底板信号 | HT1 脚 | Zynq 球号 | IOType（Vivado） | IOSTANDARD |
|---|---|---|---|---|---|
| PL 时钟 100 MHz | — | — | **C8** | IO_L13P_T2_MRCC_34 | SSTL135 |
| DAC1 片选 | DA_CSN1 | A53 | **AE25** | IO_L3P_T0_DQS_13 | LVCMOS33 |
| DAC1 串行时钟 | DA_SCK1 | A52 | **AE26** | IO_L3N_T0_DQS_13 | LVCMOS33 |
| DAC1 串行数据 | DA_SDI1 | A51 | **AF24** | IO_L5P_T0_13 | LVCMOS33 |
| 心跳灯 | TEST_LED1 | A45 | **AC22** | IO_L14N_T2_SRCC_13 | LVCMOS33 |
| 模式灯 | TEST_LED2 | A46 | **AC21** | IO_L14P_T2_SRCC_13 | LVCMOS33 |

> DA_CSN2/DA_SCK2/DA_SDI2（AF25/AD23/AD24）本实验不使用：不约束、不出现在端口里。这一点是有意为之——**未约束的端口会触发 NSTD-1/UCIO-1 DRC**，不把它们写进顶层端口就干净了（与 relay 实验同一原则）。

信息源有三个，缺一不可：

1. **底板原理图** `SOCdata\ad&da.SchDoc`（DAC 部分）+ `connector.SchDoc`；
2. **核心板原理图** `MZ7XCORE676B_0303545核心板.pdf`（PIHT10 ↔ Zynq 球号）；
3. **Vivado 器件库** `xc7z035ffg676_pkg.xml`（球号 ↔ IOType）。

### XDC 约束

```tcl
# =============================================================================
# da_output_top.xdc — 模拟量输出实验约束（Zynq-7035 / xc7z035ffg676-2）
# -----------------------------------------------------------------------------
# 球号沿用 experiment4_ad_capture/docs/pinmap.md 的三方核对结果
# （底板连接器 ↔ 核心板 PIHT10 ↔ Vivado 器件库，全部已验证）。
# =============================================================================

# ------------------------------------------------------------------ 系统时钟
set_property -dict {PACKAGE_PIN C8 IOSTANDARD SSTL135} [get_ports clk]
create_clock -name sys_clk -period 10.000 [get_ports clk]

# ------------------------------------------------------- DAC 通道 1（D1）
# DA_CSN1 -> HT1-A53 -> 核心板 B53 -> Zynq AE25 (IO_L3P_T0_DQS_13)
# DA_SCK1 -> HT1-A52 -> 核心板 B52 -> Zynq AE26 (IO_L3N_T0_DQS_13)
# DA_SDI1 -> HT1-A51 -> 核心板 B51 -> Zynq AF24 (IO_L5P_T0_13)
set_property -dict {PACKAGE_PIN AE25 IOSTANDARD LVCMOS33} [get_ports dac1_csn]
set_property -dict {PACKAGE_PIN AE26 IOSTANDARD LVCMOS33} [get_ports dac1_sck]
set_property -dict {PACKAGE_PIN AF24 IOSTANDARD LVCMOS33} [get_ports dac1_sdi]

# ------------------------------------------------------------------ LED
# TEST_LED1 -> HT1-A45 -> Zynq AC22 -> 底板 ILD1（低电平点亮）
# TEST_LED2 -> HT1-A46 -> Zynq AC21 -> 底板 ILD2（低电平点亮）
set_property -dict {PACKAGE_PIN AC22 IOSTANDARD LVCMOS33} [get_ports led_heart]
set_property -dict {PACKAGE_PIN AC21 IOSTANDARD LVCMOS33} [get_ports led_mode]

# ---------------------------------------------------- 未使用的 DAC 通道 2
# DA_CSN2/DA_SCK2/DA_SDI2（AF25/AD23/AD24）本实验不用：不约束、不出现在端口里，
# 避免 NSTD-1/UCIO-1 报错（与 relay 实验同一原则）。
```

### 电平标准的依据

- Bank 13（DAC/LED）：VADJ 默认 3.3V → `LVCMOS33`；
- C8（Bank 34 MRCC）：本工程记录使用 `SSTL135`。继电器工程对 C8 使用了 `LVCMOS33`，实际标准需按核心板版本、Bank 供电、VREF 要求与时钟电平核对，不能仅为消除 DRC 改标准。

### 输出链路与物理端子

```text
FPGA(AE25/AE26/AF24) ──> IL715 数字隔离器 ──> DAC8871 ──> OPA207(跟随) ──> +OUT1 / −OUT1
                                                                   (R10=6.2k 反馈)
```

- **DAC8871**（U5_D1）：16 位串行 DAC，VREFHF/VREFHS=ISO+15V，VREFLF/VREFLH=ISO−15V → 输出满量程理论 ±15V；RSTSEL/RST_N 拉高（上电复位到中码 0V）；LDAC_N 接地（CS 上升沿立即更新输出）。
- **IL715**（U6_D1）：数字隔离。⚠ 原理图 Comment=IL715、LibReference=IL716 存在**器件信息冲突**，实际贴片型号仍待核对。按 PCB 网络设计意图为四通道同向（系统侧→隔离侧）传输，本实验按此使用；若上板后发现"码值在变、输出完全不动"，优先排查该隔离器实际贴片型号 / 方向（见「常见问题排查」）。
- **隔离电源**：A1215S 从 VCC12V 产生 ISO±15V（本通道隔离地 ISO_GND_D1，与其它通道、数字地均隔离）→ 输出电压以 −OUT1（隔离地）为参考。

模拟输出物理端子在 **SCSI2（26 针）**：

| SCSI2 脚号 | 信号 | 说明 |
|---|---|---|
| **22** | **+OUT1** | DAC 通道 1 输出（示波器探头芯线接这里） |
| **23** | **−OUT1** | 通道 1 隔离地（探头地夹接这里） |
| 9 / 10 | +OUT2 / −OUT2 | 通道 2（本实验不用） |
| 26 / 13 | GND_OUT1 / VCC_OUT1 | 通道 1 侧电源参考（不用接） |

> −OUT1 就是 D1 通道的 ISO_GND_D1，**必须接示波器地**，输出才是有效电压。

时钟与更新率的三级关系：系统时钟 100 MHz（C8，XDC `create_clock` 10 ns）→ `UPDATE_CYC=1000` 分频得 100 kSPS 更新节拍 → `SCK_DIV=8` 分频得 SPI SCK = 12.5 MHz。

## 工程文件与一键仿真

```text
experiment5_da_output/
├── rtl/
│   ├── dac8871_master.v    # ①DAC8871 串行帧控制（CS/SCK/SDI 时序）
│   ├── wave_gen.v          # ②DDS：相位累加 + 正弦表/方波/三角 + 码值换算
│   ├── sine_lut.v          # 4096×16bit 正弦表（由脚本生成，勿手改）
│   ├── da_core.v           # ③节拍发生 + 例化①② + LED（心跳/模式）
│   └── da_output_top.v     # 顶层 = da_core + vio_0
├── tb/
│   ├── dac8871_model.v     # DAC8871 行为模型（含 6 项时序检查）
│   ├── vio_0_sim.v         # VIO 仿真替身（测试平台用）
│   ├── tb_dac8871_master.v # 帧结构/码值/电压换算/时序测试
│   ├── tb_wave_gen.v       # 四种波形数据逐点 + 周期/钳位测试
│   └── tb_da_output_top.v  # 整板联仿（模拟 VIO 操作全流程）
├── constraints/da_output_top.xdc
├── scripts/
│   ├── gen_sine_lut.js     # 正弦表生成器（node scripts/gen_sine_lut.js）
│   ├── create_project.tcl  # 建 Vivado 工程（含 VIO IP）
│   └── build_bitstream.tcl # 综合→实现→比特流
├── sim/run_sim.ps1         # 一键 iverilog 仿真
├── docs/
│   ├── pinmap.md           # 管脚推导记录（沿用 experiment4 三方核对结论）
│   └── measure_template.md # ★ 测量记录表（上板后填）
└── README.md               # 原实验工程说明
```

一键仿真（**全部 PASS 才继续上板**）：

```powershell
# 从模拟量输出工程根目录运行
cd sim
.\run_sim.ps1              # 或 .\run_sim.ps1 -Only tb_wave_gen 只跑单个
```

三个测试平台各自验证什么，下面这张表可以直接引用到报告的"仿真证据"一节：

| 测试 | 验证点 | 既有仿真记录 |
|---|---|---|
| tb_dac8871_master | 每帧恰好 16 个 SCK 上升沿；码值无差错；vout=−15000+30000×code/65536 精确换算；tLead/tLag/tTD/tSU/tSCK/tWSCK 全部 0 违例 | **PASS**（6 帧） |
| tb_wave_gen | DC 换算 9 点精确（含 ±15000 钳位）；正弦 300 点 vs 独立数学模型 ±2LSB；方波/三角逐点一致；周期 100±1 拍；三角峰峰值 43669 LSB（理论值精确命中：顶 54602/底 10933）；freq>20000 钳位 | **PASS** |
| tb_da_output_top | 上电默认 +5V；直流 5 点 ±2mV；三种波形 Vmax/Vmin≈±10V、周期 1000000ns=1ms、方波占空比 250/250 帧；更新率 500 帧/5ms；全程 0 时序违例 | **PASS**（1516 帧） |

## Vivado 构建与下载

### 命令行（推荐，约 10~15 分钟）

```powershell
# 从模拟量输出工程根目录运行
vivado -mode batch -source scripts\create_project.tcl
vivado -mode batch -source scripts\build_bitstream.tcl
```

生成 `vivado\da_output.runs\impl_1\da_output_top.bit`；构建日志报告在 `vivado\timing_summary.rpt / drc.rpt / util.rpt / io.rpt`（要求 **timing 0 违例、DRC 0 error**）。

### GUI 方式

打开 `vivado\da_output.xpr` → Generate Bitstream → Open Hardware Manager → Open Target → Program Device（选 `da_output_top.bit`）。

## 上板操作（按顺序做）

1. **接线**：SCSI2-22 → 示波器 CH1，SCSI2-23 → 探头地；垂直档位 ±15V 起。
2. **下载 bit** 后：ILD1 心跳灯 ~0.75 Hz 闪烁（逻辑在跑）；ILD2 灭（mode=DC）。
3. 打开 **Hardware Manager → 应能看到 `u_vio`**，双击打开 VIO 窗口：

| VIO 探针 | 宽度 | 含义 | 默认值 | 取值范围 |
|---|---|---|---|---|
| probe_out0 | 2 | **mode** | 0 | 0=DC 1=正弦 2=方波 3=三角 |
| probe_out1 | 32 | **freq_hz** | 1000 | 0~20000（超过自动钳到 20000） |
| probe_out2 | 16 | **amp_mv** | 10000 | ±15000（交流峰值，负值=反相） |
| probe_out3 | 16 | **dc_mv** | 5000 | ±15000（仅 mode=0 有效） |
| probe_in0 | 16 | **code_now**（只读） | — | 当前正在输出的码值 |

4. **固定电压**：保持 mode=0，依次把 dc_mv 改成 0 / 5000 / −5000 / 10000 / −10000 / 15000 / −15000，每点读示波器（并核对 code_now 与前面「码值 ↔ 电压」速查表），填测量表 1。
5. **正弦**：mode=1（freq=1000、amp=10000 默认即 1 kHz/±10V）→ 示波器应显示 1 kHz 正弦，Vpp≈20V；把时基放大到 µs 级能看到 10 µs 台阶（测量表 2 + 选做）。
6. **方波**：mode=2 → 记录电平/周期/占空比/上升时间（测量表 3）。
7. **三角**：mode=3 → 记录 Vpp/周期/斜率/台阶（测量表 4）。
8. 选做：改 freq_hz=100/10000、amp_mv=5000/12000 观察变化（测量表选做栏）。

> VIO 改值方法：在值上双击输入新值（freq_hz 选十进制显示更方便），回车立即生效。
> mode 变化时 LED2 会以不同频率闪烁（DC 灭 / 正弦 0.75Hz / 方波 1.5Hz / 三角 3Hz）。

## 期望值汇总（实测对照）

下表列出理论与仿真参考值。本文未记录对应的上板实测读数，不能将这些数值视为实际输出结果。

| 项目 | 理论值（仿真已验证） | 实测值 |
|---|---|---|
| 上电默认输出 | +5.000 V（若 VIO 初始值未生效则为 0V——两种都正常，进 VIO 设置即可） | 未记录 |
| DC 七点 | 见前文码值速查表（±1 LSB ≈ ±0.5 mV 取整不对称） | 未记录 |
| 正弦/方波/三角 Vpp | 20.0 V（amp=10000 时） | 未记录 |
| 三角波峰峰值 | 比正弦/方波小 20 LSB ≈ 9 mV（折叠式三角原始幅度 ±32752、正弦/方波 ±32767，经 K=21845 缩放后每边差 10） | 未记录 |
| 周期 | 1 kHz → 1.000 ms（±8 ppm） | 未记录 |
| 方波占空比 | 长期平均 50%，单周期受更新网格量化 | 未记录 |
| DAC 更新率 | 100 kSPS（台阶间隔 10 µs） | 未记录 |
| 满码 ±15V | 理论 +14.9995/−15.0000 V；**实际可能削顶**（见下文 6.4） | 未记录 |

## 常见问题排查

### 6.1 输出一直是 0V / 不动

- VIO 里看 **code_now** 是否随设置变化：
  - code_now 不变 → VIO/逻辑问题：确认 bit 是本工程的、VIO 窗口连的是 u_vio；
  - code_now 变但输出不变 → 硬件链路问题，按 6.2 查。

### 6.2 码值在变、输出完全不动（隔离器方向风险）

原理图上 D1 通道隔离器存在 **IL715/IL716 标识冲突**：LibReference 是 IL716（双向型），设计意图按 PCB 网络是 IL715（同向）。若本板实际贴的是 IL716 且方向不符，SCK/SDI 无法从 FPGA 侧送达 DAC——现象就是"code_now 在变、输出纹丝不动"。

排查：示波器看 AE26(SCK)/AF24(SDI) 有无波形；有波形而 DAC 不响应则方向不符，属硬件问题（可换用 D2 通道验证：把顶层/XDC 换成 DA_CSN2/DA_SCK2/DA_SDI2 = AF25/AD23/AD24，端子 SCSI2 9/10）。

### 6.3 波形有台阶 / 折线

不是故障：DAC 每 10 µs 更新一次（100 kSPS），1 kHz 时每周期 100 拍、10 kHz 时 10 拍。这本身就是"按数据输出波形"的直接证据，记录进报告（讨论重建滤波）。

### 6.4 ±15V 两端削顶

DAC8871 的参考就是隔离电源 ISO±15V，且 OPA207 输出摆幅到不了电源轨：满码时输出停在约 ±13.5~14.5V 属正常。把实测最大摆幅记入测量表 1 并讨论（精密输出需要把参考误差与输出摆幅分别计入）。

### 6.5 Vivado 报 IOSTANDARD DRC

先核对核心板版本、Bank 34 的 VCCO/VREF 和时钟幅度，再选择与硬件匹配的 IOSTANDARD；DRC 通过不代替电气兼容验证。

## 报告要点

1. **信号链与数学**：码值→电压公式推导、1 LSB 多少 mV、DDS 频率公式（f = fstep×100k/2^32）；
2. **时序设计**：SDI 为何在 SCK 下降沿换数？CS 上升沿起了什么作用（LDAC_N=0）？SCK 为什么只跑 12.5 MHz（隔离器延时）？
3. **RTL 结构**：帧状态机图（IDLE→LEAD→SHIFT→LAG）、相位累加器、三种波形的数据来源差异、幅度归一化的乘法通路；
4. **仿真证据**：三个 TB 的 PASS 输出（尤其时序 0 违例、逐点对比）；
5. **实测数据**：测量条件与读数；未提供的结果应与理论参考明确区分；
6. **误差分析**：满量程削顶、±1 LSB 取整不对称、隔离电源波动、示波器精度；
7. **思考题**（任选二）：
   - 想把输出频率提高到 100 kHz 需要改什么？瓶颈依次是什么（SPI 帧长 1.36 µs、DAC 建立时间 ~1 µs、每周期点数）？
   - 为什么方波的相位区间能均分为两半，而不用查表？
   - 若要输出任意波形（如心电波形），本框架怎么扩展？

## 参数速查表

| 参数 | 值 | 在哪改 |
|---|---|---|
| 系统时钟 | 100 MHz | XDC `create_clock` |
| DAC 更新率 | 100 kSPS | `da_core` 参数 `UPDATE_HZ` |
| SPI SCK | 12.5 MHz | `da_core` 参数 `SCK_DIV`（8） |
| 正弦表 | 4096 点 | `scripts/gen_sine_lut.js` 重新生成 |
| 频率上限 | 20 kHz | `wave_gen` 的 `FREQ_MAX` |
| 幅度/直流钳位 | ±15000 mV | `wave_gen` 钳位逻辑 |
| mV→码值 | ×143165>>>16 | `wave_gen` 常数 `MV2LSB_MUL` |
| VIO 默认 | DC +5V / 1kHz / 10V | `create_project.tcl` INIT_VAL |
| LED 极性 | 低电平亮 | `da_core` 参数 `LED_ACTIVE_LOW` |

## 正弦波表是怎么生成的

`sine_lut.v` 有 4118 行，手写是不可能的——它由 `scripts/gen_sine_lut.js` 生成。脚本的设计目标里有一条很实用：**输出自包含的 Verilog（组合逻辑 case）**，不依赖 `$readmemh` 的文件路径，这样 iverilog 仿真和 Vivado 综合都直接推断出 ROM/查找表，工程目录搬来搬去也不会断。

```javascript
#!/usr/bin/env node
// =============================================================================
// gen_sine_lut.js — 生成 rtl/sine_lut.v（4096 点 × 16 位有符号正弦查找表）
// -----------------------------------------------------------------------------
// 表项：lut[k] = round(32767 * sin(2*pi*k/4096))，k = 0..4095（覆盖一个整周期）
// 输出为自包含的 Verilog 模块（组合逻辑 case），iverilog 仿真和 Vivado 综合
// 都直接推断出 ROM/查找表，不依赖 $readmemh 的文件路径，工程搬动更稳。
//
// 用法：node scripts/gen_sine_lut.js   （在工程根目录运行，重写 rtl/sine_lut.v）
// =============================================================================
const AW = 12;                 // 地址位数
const N = 1 << AW;             // 4096 点
const AMP = 32767;             // 满幅（有符号 16 位）
const out = path.join(__dirname, '..', 'rtl', 'sine_lut.v');

for (let k = 0; k < N; k++) {
    // JS Math.round 为四舍五入（.5 进位），与 RTL/TB 中 floor(x+0.5) 一致
    const v = Math.round(AMP * Math.sin(2 * Math.PI * k / N));
    // 负数取 16 位二的补码后输出 4 位十六进制，避免超宽字面量
    const hex = (v & 0xffff).toString(16).padStart(4, '0');
    lines.push(`            ${AW}'d${k}: dout = 16'sh${hex};`);
}
```

用法（在工程根目录运行，会重写 `rtl/sine_lut.v`）：

```powershell
node scripts/gen_sine_lut.js
```

两个值得记下的点：

- **负数必须转补码再输出**：JS 里 `(-50).toString(16)` 会得到 `"-32"`，不是合法的 Verilog 字面量。所以脚本先 `v & 0xffff` 取 16 位补码，再 `padStart(4,'0')`——这是**踩过的坑**之一（见文末）。
- **综合结果是一张分布式 ROM**：整张表落在 LUT 资源里，本工程 BRAM = 0。要转为 BRAM，应采用目标器件支持的同步 ROM 读出模板，并调整流水线与有效信号；仅给当前组合 `case` 加属性，不能保证推断为块 RAM。容量上约需两块 36 Kb BRAM。

表项的精度也值得算一笔：相位截断（floor 取地址）误差最多 1 个表项 = 2π/4096 rad，在最陡处折成幅度误差 ≤ 32767×2π/4096 ≈ **50 LSB ≈ 23 mV（−56 dB 最坏瞬时）**——远小于隔离电源本身的噪声，所以 4096 点 / 16 位的组合是够用的。

## 测量维度与理论参考

下面的表格列出 `docs/measure_template.md` 中的测量维度，空白实测栏表示本文没有对应数据。

> 示波器设置提醒：探头衰减挡与示波器探头设置一致（×1/×10）；垂直档位先用 ±15V 量程（输出最高可达 ±15V），再逐档放大读数；用「测量」功能读 Vpp/周期。

### 表 0：实验条件

| 项目 | 记录 |
|---|---|
| 日期 / 环境 | |
| bit 文件 | da_output_top.bit（构建时间：___） |
| 示波器型号 / 探头衰减 | |
| 接线 | CH1 探头 → SCSI2-22(+OUT1)，探头地 → SCSI2-23(−OUT1) |

### 表 1：固定电压（mode=0）

VIO：`mode=0`，`dc_mv` 按第 1 列设置。理论值按 Vout = −15V + 30V×code/65536 计算（code 即 VIO 里 `code_now` 读数；表中已给出理论电压，上板后可自己用码值复算验证）。

| dc_mv 设置 | code_now（读 VIO） | 理论电压 (V) | 示波器实测 (V) | 万用表实测 (V) | 误差 (mV) | 备注 |
|---|---|---|---|---|---|---|
| 0 | | 0.000 | | | | |
| +5000 | | +5.000 | | | | |
| −5000 | | −5.000 | | | | |
| +10000 | | +10.000 | | | | |
| −10000 | | −10.000 | | | | |
| +15000 | | +14.9995 | | | | 观察是否削顶（记录实际峰值） |
| −15000 | | −15.000 | | | | 同上 |

**结论记录**：满量程两端是否达到 ±15V？若削顶，实际可达 ±____V。
原因分析（隔离电源实际电压 / 输出放大器摆幅限制）：________________

### 表 2：正弦波（mode=1）

VIO：`mode=1`，`freq_hz=1000`，`amp_mv=10000`（默认 1 kHz / ±10V）。

| 观测量 | 理论值 | 实测值 | 备注 |
|---|---|---|---|
| 峰峰值 Vpp (V) | 20.0 | | |
| Vmax / Vmin (V) | +10.0 / −10.0 | | |
| 周期 T (ms) | 1.000 | | |
| 频率 f (kHz) | 1.000 | | |

**选做 A（改变幅度）**：amp_mv 依次 5000 / 2000 / 12000，记录 Vpp：

| amp_mv | 理论 Vpp | 实测 Vpp |
|---|---|---|
| 5000 | 10.0 | |
| 2000 | 4.0 | |
| 12000 | 24.0 | |

**选做 B（改变频率）**：freq_hz 依次 100 / 10000，记录周期（注意 10kHz 时每周期仅 10 个采样点，正弦呈明显折线）：

| freq_hz | 理论 T | 实测 T | 波形是否平滑 |
|---|---|---|---|
| 100 | 10 ms | | |
| 10000 | 100 µs | | |

### 表 3：方波（mode=2）

VIO：`mode=2`，`freq_hz=1000`，`amp_mv=10000`。

| 观测量 | 理论值 | 实测值 | 备注 |
|---|---|---|---|
| 高电平 (V) | +10.0 | | |
| 低电平 (V) | −10.0 | | |
| 周期 T (ms) | 1.000 | | |
| 占空比 (%) | 50 | | |
| 上升时间 | — | | 10~90%，记录示波器读数 |

**观察记录**：DAC 每隔 10 µs 更新一次，边沿发生时刻只能落在 10 µs 更新网格上；**模拟上升时间不等于 10 µs**，还取决于 DAC 建立、运放压摆率、带宽与负载。记录 10%→90% 上升时间：____ µs。

### 表 4：三角波（mode=3）

VIO：`mode=3`，`freq_hz=1000`，`amp_mv=10000`。

| 观测量 | 理论值 | 实测值 | 备注 |
|---|---|---|---|
| 峰峰值 Vpp (V) | 20.0 | | |
| Vmax / Vmin (V) | +10.0 / −10.0 | | |
| 周期 T (ms) | 1.000 | | |
| 上升段斜率 (V/ms) | 40 | | 理论 = 20V / 0.5ms |

**观察记录**：放大时间轴可见三角波由 10 µs 小台阶组成（每周期 100 拍），台阶高度 ≈ ____ mV（理论：一拍 10 µs 对应 20V×10/500 ≈ 400 mV/拍附近，按过零区与峰顶区不同略有差异，记录你看到的现象）。

### 表 5：更新率验证（选做）

把示波器时基打到 2~5 µs/div，观察任一波形的台阶间隔：

| 项目 | 理论 | 实测 |
|---|---|---|
| DAC 更新间隔 | 10 µs | |
| 对应更新率 | 100 kSPS | |

### 结果讨论要点（写报告时用）

1. 实测电压与理论值的偏差来源：隔离电源 ISO±15V 的实际值（可用万用表在 +OUT1 与 −OUT1 间测满码输出反推）、DAC 满量程误差、示波器精度；
2. 直流档实测 vs 万用表实测的差异说明了什么（两种仪器的精度/负载效应）；
3. 区分 10 µs 更新间隔、边沿时刻量化与模拟上升时间；分别讨论提高更新率和改善输出级带宽能解决哪类限制；
4. 正弦 10 kHz 时的折线现象（每周期 10 点）与奈奎斯特/重建滤波的关系。

## 附：DAC 输出级电路原理

> 依据：TI DAC8871 数据手册 SBAS396A、底板原理图 `ad&da.SchDoc` 解析结果（`ad_da_analysis.md`）、experiment4 已核对管脚表。

### 信号链与输出级拓扑

```text
FPGA AE25/AE26/AF24 ──DA_CSN1/DA_SCK1/DA_SDI1──► IL715 ──► DAC8871 CS/SCK/SDI
VCC12V ──► A1215S（隔离 DC/DC）──► ISO+15V / ISO−15V ──► DAC8871 VREFHF/S、VREFLF/S
                                  └──► L78L05 ──► ISO+5V ── R9=10Ω ──► ISO+5V1（DAC VDD、隔离器隔离侧）
DAC8871 VOUT ──► OPA207 跟随器（R10=6.2k 在反馈路径）──► +OUT1（SCSI2-22）/ −OUT1（SCSI2-23 = ISO_GND_D1）
```

一句话：**FPGA 出 3 根数字线 → IL715 过隔离 → DAC8871 按码值分配参考电压 → OPA207 缓冲 → 端子输出。**模拟侧为通道独立隔离地 ISO_GND_D1；RSTSEL/RST 为高，LDAC = 低（透传）。

### 码值 → 电压

```text
VOUT = VREFL + (VREFH − VREFL) × Code / 65536     （DAC8871 手册公式 1）
```

本板 VREFH/VREFL = 隔离电源 ISO±15V：0x0000 → **−15.0000 V**，0x8000 → **0.0000 V**，0xFFFF → **+14.9995 V**；**1 LSB = 30000 mV/65536 = 0.4578 mV**（手册 ±10V 量程举例为 305 µV，同比例）；例 0x9FFF（40959）→ **+3.7495 V**。满码 0xFFFF 到不了 +15V：台阶共 65536 个间隔，最大码只走完 65535/65536。

DAC8871 的码值是**偏移二进制**（0 在中码 0x8000），experiment4 里 LTC2328 输出的是**二补码**（0 在 0x0000）：最负 0x0000 / 0x8000，零点 0x8000 / 0x0000，最正 0xFFFF / 0x7FFF。换算只需**取反最高位**：`偏移二进制 = 二补码 ^ 0x8000`；DAC 天生偏移二进制，因为 R-2R 本质是"无符号比例分配器"，0V 自然落在中码。

### 内部结构：高 4 位分段 + 低 12 位 R-2R

- 纯等值电阻串实现 16 位通常需要约 65536 个单元与相应抽头，面积和开关网络代价很高；它并不要求电阻阻值跨度为 65536:1。R-2R 只用 **R 和 2R 两种阻值** 实现二进制加权，每个节点向右看的等效电阻都是 2R，权重逐级减半——**拓扑自己实现了二进制，与阻值绝对精度无关**，只要求 R 和 2R 匹配。
- 手册 Figure 38：**高 4 位译码驱动 15 个开关（E1~E15），每个开关把 15 个匹配电阻之一接到 VREFH 或 VREFL；低 12 位驱动 12 位电压模式 R-2R 梯形（S0~S11）**。不全用 R-2R 的原因：16 位纯 R-2R 里 MSB 支臂电流是 LSB 的 32768 倍，匹配要求极高（INL/DNL 恶化）；高位改成 15 个等值电阻段后最易做准，且开关动作分散、glitch 更小、单调性更好。

### 三个容易踩的坑

- **输出不缓冲，阻抗 6.2 kΩ**。按 DAC8871 手册，输出未缓冲、输出阻抗约 6.2 kΩ。 按分压 V_负载 = V × RL/(6.2kΩ+RL)：1 kΩ → 1/7.2 ≈ **13.9%**（损失 86%，完全不可用）；1 MΩ（×1 探头/万用表）→ ≈99.38%，误差 ≈**185 mV ≈ 403 LSB**；10 MΩ（×10 探头）→ ≈99.94%，误差 ≈**18.6 mV ≈ 41 LSB**。连 10 MΩ 探头都带来 41 LSB 增益误差，16 位系统必须缓冲；手册 Figure 39 推荐 OPA277/OPA211，本板用同家族 OPA207。
- **参考误差直接影响输出**。输出按码值对高低参考加权，参考噪声与偏差都会耦合到结果，本板参考就是 A1215S 隔离电源的输出：偏 1%（150 mV）→ 满码偏 ≈150 mV ≈ **328 LSB**；纹波/噪声 20 mV → 输出叠 20 mV ≈ **44 LSB**；温漂 100 ppm/℃ → 30 V 摆幅漂 3 mV/℃ ≈ **6.6 LSB/℃**。号称 16 位（65536 级），**系统有效精度需要根据实际噪声与误差测量，不能直接等同于标称 16 位**——不是 DAC8871 的错（芯片本身 INL 很小），是"参考无独立基准"的系统取舍；标准做法是独立 ±10V 精密基准（REF01/ADR 系列）或至少二次稳压。
- **Force/Sense 布线待核对**。原理图中 Force 与 Sense 同属 ISO±15V 网络，单凭网络名不能判断 PCB 是否采用开尔文走线；应结合版图上的实际分支和连接点评估走线压降。

### 数字接口：四条铁律、三级结构、上电安全态

- **CS 高电平期间，SCLK/SDI 全部被忽略**；SDI 在 **SCLK 上升沿** 锁存、**MSB first**（主机应在下降沿换数）；CS 低期间**恰好 16 个上升沿**（多于 16 个则"最后 16 位有效"，少于 16 个则数据作废、必须重发）；**CS 上升沿** 把移位寄存器推入输入寄存器。本板 LDAC_N 接地（透传），同一瞬间输入寄存器 → DAC 锁存器 → **输出更新**。
- 对应标准 SPI：SCK 空闲低 + 上升沿采样 = **SPI Mode 0**，但"恰好 16 拍 + CS 上升沿提交"是 DAC 特有语义，普通 SPI 外设不能直接替代。tLead ≥10 ns、tLag ≥10 ns、SCK 周期 ≥20 ns。
- 三级结构：`SDI → 移位寄存器 16bit ──CS↑→ 输入寄存器 16bit ──LDAC↓→ DAC 锁存器 → 梯形网络`。双缓冲的意义：**串行传输过程不打扰当前输出**，全部到齐后一次性切换（毛刺最小、多片可同步）；LDAC 就是"多片同步触发"引脚，本板单通道用不到，直接接地，所以"CS↑ 即更新"。
- **上电安全态**（这解释了 RTL 为什么这么设计）：**RSTSEL 拉高（本板 ISO+5V）→ 上电/复位后 DAC 锁存器 = 中码、输出 0V**（若接 DGND 则复位到负满码 −15V，更危险）；RST_N 拉高不复位（上电自动 POR 一次）；**R1=1 kΩ 把 CS_N 上拉到 ISO+5V**，保证隔离器上电未就绪那段时间 DAC 处于"未选中"，不被垃圾时钟误写入。RTL 与之呼应：POR 2.55 µs 后才发第一帧，`code_now` 初值 0x8000 = 0V——**两级保险**。
- 一帧的时序量级（以输出 +4.9997 V，即 0xAAAA=43690 为例）：CS↓ 后 tLead = 50 ns → 第 1 个 SCK↑ → 16 位按 80 ns/位 移完 → 第 16 个 SCK↑ → CS↑（tLag = 110 ns，输入寄存器→DAC 锁存器）→ 梯形网络建立 ~1 µs 量级 → OPA207 跟随器建立，合计 ~2.5 µs；经 IL715 每根线另有 10~20 ns 固定延时，不影响逻辑。

### 隔离、电源与输出缓冲

- 四个模拟通道（A1/A2/D1/D2）不仅与数字侧隔离，**彼此之间也隔离**（各自的 ISO_GND 互不相连）：掐断工业现场的共模电压/地环流，也避免通道间串扰；代价是每通道一套独立隔离电源 + 隔离器，成本高、精度受限。
- **A1215S**：输入系统 VCC12V，输出**通道独立**的 ISO+15V/ISO−15V/ISO_GND。它身兼两职：给 DAC 梯形供电的 ±15V 模拟电源 + **被直接当作参考电压**（后者是精度短板）。
- **L78L05**：从 ISO+15V 线性降压出 ISO+5V，给 DAC 的数字部分（VDD）和隔离器隔离侧供电；不用 DC/DC 直接出 5V，因为线性稳压纹波小。**R9=10Ω + 本地电容** 串在 ISO+5V → ISO+5V1 之间构成低通，隔离器的开关瞬态尖峰被电阻"消化"，不倒灌进 DAC 数字电源。
- **IL715 数字隔离器**：输入信号先编码，经片内耦合元件跨过绝缘势垒再解码还原；相比光耦速度快（10~50 Mbps vs 1 Mbps）、寿命长（无光衰）、功耗低。选型四要素：**通道数、方向组合、速率、耐压**。DAC 通道需 3 根同向线 → 全同向的 IL715；ADC 通道 2 去 2 回 → 双向组合的 IL716。⚠ 原理图上 U6_D1 的 Comment=IL715 但 LibReference=IL716（符号引脚按双向画），实际贴片型号与方向仍待核对；若实物是 IL716 且方向装反，SCK/SDI 到不了 DAC（"码值变、输出不动"的排查预案即源于此）。
- **OPA207 跟随器**：DAC 输出不缓冲，跟随器输入阻抗极高（几乎不分走电压）、输出阻抗极低，**增益严格为 1**。**R10=6.2k 在反馈路径上不改变增益**（虚短虚断，闭环增益仍是 1），作用是隔离输出与反相输入节点、改善容性负载稳定性，兼有限流保护意义；数值恰与 DAC 输出阻抗相同（与手册 Figure 39 推荐电路同款，那里用 OPA277/OPA211）。手册对外部运放的要求：低失调（1 LSB=305 µV@±10V 量程）、低偏置电流（Ib×6.25 kΩ 直接加到零码误差）、轨到轨输出、带宽 ≥1 MHz、压摆率不能拖慢建立时间。**摆幅限制**：±15V 供电下输出典型只到 ±13.5~14.5V（到不了电源轨），这是"±15V 满码会削顶"的直接原因。

### 工程弱点清单与易错点

1. 参考无独立基准：精度/噪声被 A1215S 限制（系统有效位数未实测）；
2. Force/Sense 是否采用开尔文布线：需结合 PCB 版图确认；
3. IL715/IL716 器件标识冲突：贴片方向/型号存疑，需上板验证；
4. 无输出保护：无串联限流、无 TVS，短路/静电有风险；
5. 满码 ±15V 削顶：受 OPA207 摆幅与电源限制，约 ±13.5~14.5V 仅为摆幅量级参考，实际值未记录。

易错点：把 LDAC_N 从接地改为 FPGA 控制，即可让多片 DAC 各自 CS↑ 装好数据后共用一根 LDAC↓ 同时跳变，实现同步输出；R-2R 的终端电阻若开路，节点阻抗匹配被破坏，低位权重不再是严格的二进制（原 2 位例子的 LSB 不再是 VREF/4）；输出 20 mV@100 kHz 纹波最可能来自隔离电源纹波直接进参考 → 输出，可在 ISO±15V 上直接探测、或断开负载/换通道对比验证；做"ADC 采到什么 DAC 就输出什么"的直通系统，码值需 `code_dac = code_adc ^ 0x8000`。

## 附：DAC8871 串行时序精读

> 依据 `rtl/dac8871_master.v` 逐拍推演 + 手册（SBAS396A）+ 仿真（tb_dac8871_master 6 帧 PASS，时序检查 0 违例）。拍数/纳秒数均手工推演并与仿真一致。

**负载分压复核**：6.2 kΩ 输出阻抗接 1 kΩ 负载，分压为 V×RL/(6.2k+RL)=1/7.2≈**13.9%**（损失 86%）；连 10MΩ 的 ×10 探头都引入 30V×6.2/10006.2≈18.6mV≈**41 LSB** 误差——16 位输出必须缓冲。按下文边沿时间线计算：**tLead=50ns、tLag=110ns、tTD=8640ns**。

**四条铁律 → 设计决策**

| 芯片铁律（手册） | 本模块的设计决策 |
|---|---|
| ① CS 高时忽略 SCK/SDI | 复位后 csn=1；SCK 只在 S_SHIFT 翻转（门控时钟） |
| ② SDI 在 SCK↑ 锁存，MSB first | load 当拍摆出 data[15]；之后每次 SCK↓ 左移一位、摆出下一位（建立时间=半个位周期 40ns） |
| ③ CS 低期间恰好 16 个 SCK↑ | bit_cnt 数上升沿，第 16 个后封门（`<16` 保护） |
| ④ CS↑ 提交并更新输出 | 专门 S_LAG 状态：等足 tLag 后 `csn<=1`，这一拍即输出更新时刻 |

**接口与参数**：`load`（单拍脉冲）+ `data[15:0]` → `dac_csn`/`dac_sck`/`dac_sdi`，另有 `busy`、`code_now[15:0]`。参数 CLK_HZ=100MHz、SCK_DIV=8（SCK=12.5MHz）、LEAD_CYC=4、LAG_CYC=4。

**参数范围：当前 4 位 phase 对应 SCK_DIV 为 4~16 的偶数，更大分频须扩展位宽**——SCK_DIV=2 时 PHASE_HALF=1 与 PHASE_LAST=1 撞在同一拍（SCK 又拉高又拉低，后者覆盖前者，波形直接坏）；奇数分频则高低电平不对称。

```text
 S_IDLE ─load─► S_LEAD ─4拍─► S_SHIFT ─16位×8拍─► S_LAG ─4拍─► 回 S_IDLE
  等请求      满足tLead      逐位产生SCK/SDI      满足tLag后CS↑
```

计数器：`phase`(4 位) = SCK 分频相位 0..7（0→↑、4→↓+换数、7→收尾）；`bit_cnt`(5 位) 数 SCK↑ 0..16，**5 位不是浪费**，要数到 16，4 位会回绕成 0；`cyc_cnt`(16 位) 供 LEAD/LAG 复用；`shreg`(16 位) MSB 在前左移，`shreg[14]` 是"下一位"。

### 容易踩的坑

1. **状态时长 ≠ 信号间隔（最常踩）**：S_LEAD 占 4 拍，但 tLead（CS↓→首个 SCK↑）= **5 拍 = 50ns**，因为进 S_SHIFT 后还要 1 拍才执行 `phase==0` 的 `sck<=1`；不要直接把状态占用的 4 拍当作该信号间隔。同理 S_LAG 占 4 拍，tLag（第 16 个 SCK↑→CS↑）= 位槽剩余 4 + 相位收尾 3 + LAG 4 = **11 拍 = 110ns**。画边沿图是唯一可靠的核对办法。
2. **半周期换数**：SDI 在 SCK↓（phase 4）换，下个 SCK↑ 在 4 拍 = 40ns 之后。若上升沿同拍换数，FPGA 侧建立≈0，SCK 与 SDI 两路 IL715 的延时差（skew 5~10ns）直接吃掉裕量；半周期换数扣掉 skew 后净裕量仍有 ~30ns ≥ tSU 10ns。
3. **NBA 读旧值**：`dac_sdi <= shreg[14]` 与 `shreg <= {shreg[14:0],1'b0}` 同拍时右侧读移位前的值，摆出的正是"下一位"；改阻塞赋值且顺序写反就差一位，整帧错乱。
4. **`bit_cnt < 16` 封门**：第 16 个↑ 后还有一次↓，无保护会做第 17 次移位、把垃圾摆上 SDI。
5. **忙时 load 被丢弃**：load 只在 S_IDLE 被采样；一般化结论——丢弃策略只在"生产率 < 消费率且丢得起"时可用。
6. **只能寄存器输出**：组合输出（如 `assign sck = (state==S_SHIFT) & phase[2]`）在 state/phase 翻转瞬间有窄毛刺，被 DAC 当沿锁存错位。复位安全态：`state<=S_IDLE; dac_csn<=1; dac_sck<=0; dac_sdi<=0; code_now<=16'h8000;` → 未选中、空闲电平明确、中码 0V（与 DAC8871 的 RSTSEL 上电值一致）。

### 边沿级时间线（0xAAAA = +4.9997V，本帧 136 拍）

```text
T0    │ CS↓ + SDI=bit15(=1)     ← 同拍寄存器输出
T1~T4 │ S_LEAD 计数（4 拍）
T5    │ SCK↑ #1   ← tLead = 50ns，DAC 锁存 bit15
T9    │ SCK↓ #1   + SDI→bit14
T13   │ SCK↑ #2                 ← 建立时间 = 40ns
 ...  │ 每 8 拍一位，↑在 T5+8k，↓+换数在 T9+8k
T121  │ SCK↓ #15  + SDI→bit0
T125  │ SCK↑ #16  （bit_cnt=16，此后封门不再换数）
T129  │ SCK↓ #16
T132  │ phase=7 → 进 S_LAG
T136  │ CS↑ —— DAC 输出更新为 +4.9997V   ← tLag = 110ns
      │ 帧长 = 136 拍 = 1.36µs；帧间空闲 = 10000−1360 = 8640ns（tTD ≥30ns ✓）
```

| 参数 | 手册 min | 实际 | 裕量 |
|---|---|---|---|
| tSCK | 20 ns | 80 ns | 4× |
| tWSCK 高/低宽 | 10 ns | 40 ns | 4× |
| tSU（SDI 建立） | 10 ns | 40 ns（再扣 skew 5~10ns） | ≥3× |
| tLead | 10 ns | 50 ns | 5× |
| tLag | 10 ns | 110 ns | 11× |
| tTD（帧间 CS 高） | 30 ns | 8640 ns | 288× |

**与 da_core 的配合比**：tick 自由运行（每 1000 拍 = 10µs 一拍），不从属于帧完成，更新率才精确等于 100 kSPS，f=fstep×100k/2³² 才成立。帧长 136 拍 << 1000 拍，下一拍 load 时帧早已发完（空闲 8640ns），"忙时装载被丢弃"在这组参数下永不发生；若 UPDATE_HZ 提到 500 kSPS（周期 200 拍 > 136 拍仍勉强），必须"忙时缓存一帧"（一级 skid buffer）或让 load 等 busy 释放。

**验证的可追溯性**：`tb/dac8871_model.v` 的 8 个错误码逐条对应手册参数（仿真不是"看起来对"，而是每项规格有独立断言）——① 帧间 CS 高 <30ns = tTD；② CS↓ 距上次 SCK 活动太近 = tDelay；③ CS↑ 时锁存位数 ≠16 = 铁律③；④ 第 16 个 SCK↑→CS↑ <10ns = tLag；⑤ 帧内 SCK 周期 <20ns = tSCK；⑥ SCK↑ 前 SDI 稳定 <10ns = tSU；⑦ SCK 高电平 <10ns = tWSCK；⑧ CS↓→首个 SCK↑ <10ns = tLead。tb_dac8871_master 另独立数每帧 SCK↑ 个数（=16）、核对码值与 vout=−15000+30000×code/65536 换算。

## 附：DDS 与波表是怎么算出来的

> 依据 `rtl/wave_gen.v` 实际代码 + 仿真逐点验证（tb_wave_gen PASS）。数值均手工核算并与仿真打印对账。

### DDS 核心与输出频率

维护一个 **32 位相位累加器**，每 tick 加恒定步长 fstep，转一圈 = 一个周期；相位满 2^32 天然回绕（mod 2^32），不需要任何边界处理。频率只由 fstep 决定，三种波形共用同一累加器，只是「相位→幅度」映射不同。tick = 10µs（**100 kSPS**）：

```text
f_out = fstep × 100000 / 2^32    →   fstep = f_out × 2^32 / 100000
```

- 2^32/100000 = 42949.67296，RTL 取 **42950**（`FSTEP_MUL`），频率误差 **+7.6 ppm**（1 kHz 设定 → 1000.0076 Hz）；32 位累加器理论分辨率 100000/2^32 = **23.3 µHz**，但 freq_hz 是整数，实际分辨率 1 Hz；
- 上限 `FREQ_MAX = 20000`：奈奎斯特 50k 只是理论下限；每周期 ≥5 点（100k/5）波形才像样；fstep 最大 20000×42950 = 859,000,000 < 2^31，留符号位余量防溢出判错。

### 相位 → 幅度：三条路

**① 正弦：查找表（`sine_lut.v`，JS 脚本生成）**

```text
addr = phase[31:20]        // 高 12 位做地址：4096 点/周期
w    = LUT[addr]           // = round(32767·sin(2π·addr/4096))，16 位有符号
```

- 表 4096×16bit = 64Kbit；相位截断（floor 取地址）误差最多 1 个表项 = 2π/4096 rad，最陡处折成幅度误差 ≤ 32767×2π/4096 ≈ **50 LSB ≈ 23 mV**（−56 dB 最坏瞬时）；
- 生成脚本 `scripts/gen_sine_lut.js`：`Math.round(32767*Math.sin(2πk/4096))`，负数用 `(v&0xffff).toString(16)` 转补码十六进制；综合后整张表进分布式 ROM，本工程 **BRAM=0**，要转为 BRAM 需改成支持的同步读出模板，并相应调整延迟；不能只靠属性强制当前组合 `case` 进 BRAM（容量约两块 36 Kb）。

**② 方波：最高位** — `w_sq = phase[31] ? -16'sd32767 : 16'sd32767`。phase[31]=1 覆盖相位区间的一半，因此长期平均占空比为 50%；单周期高低拍数仍受离散更新影响，边沿时刻量化到 10µs 网格。

**③ 三角波：折叠**

```verilog
wire        tri_dir = phase[31];
wire [10:0] tri_pos = tri_dir ? ~phase[30:20] : phase[30:20];
wire signed [15:0] w_tri = ($signed({1'b0, tri_pos, 4'b0}) - 16'sd16376) <<< 1;
```

`phase[30:20]` 是前半周期单调上升的 11 位（0..2047），后半周期按位取反（2047−x）把下降沿折回，再线性映射到 **±32752**。写成 ×16 再 `<<1` 而非直接 pos×32−32752，是为了全程 16 位（pos×16 最大 32752 恰好塞进 16 位有符号）。

### 幅度与码值：全部定点乘法

- `fstep = freq×42950`：精确 ×42949.673，误差 +7.6 ppm；`dc_off = (dc_mv×143165)>>>16` 做 mV→LSB，精确 ×2.184533，RTL 用 ×143165/65536 = 2.184524，误差 −4.0 ppm；`143165` 来自 2^32/30000 = 143165.58 → 取 143165，验证误差 **−4.03 ppm**（满幅 15000 mV 时差 0.06 mV = 0.13 LSB，无感）；
- `off = (w×K)>>>15`：`w>>>15` 把满幅 ±32767 ≈ ±2^15 归一化成 ±1，再乘 K（amp 的 LSB 数）得偏移，取整 ±1 LSB；溢出核算 32767×21845 = 715,795,115 < 2^30 ✓；
- 输出 `code <= (mode == 2'd0) ? (16'sd32768 + dc_off) : (16'sd32768 + off)`：`16'sd32768` 位型是 0x8000，加法按 mod 2^16 进行，`0x8000 + off` 恰好就是偏移二进制编码。

### 峰值核算（amp=10000 mV，K=21845，1 LSB=0.4577637 mV）

- 正弦/方波：w 原始幅度 = ±32767，off 顶/底（floor）= +21844 / −21845 → code **54612 / 10923**，Vpp **43689 LSB = 19.999 V**；
- 三角：w 原始幅度 = ±32752，off = +21834 / −21835 → code **54602 / 10933**，Vpp **43669 LSB**。±32752 = 2047×32−32752 是折叠结构的自然满幅，比正弦/方波矮 15 LSB，输出端每边差 10 LSB、Vpp 差 20 LSB ≈ 9 mV。

### 容易踩的坑

- **数字必须过两遍：手算一遍、和仿真打印对一遍**。三角波理论峰峰值是 **43669 LSB，不是 43683**；`0xAAAA`（43690）实际是 **+4.9997 V，不是 +5.0001 V**（30000×43690/65536 = 19999.695 mV）；−10 V 行应为 −10.0003 V；
- **floor 对正负不对称**：+21844.33 取 21844、−21844.33 取 −21845，中码两侧差 1 LSB，这正是 DC 表 +4.9997 / −5.0002 不对称的来源；
- **JS 负数 `toString(16)` 会输出 "-xxx"**，生成脚本必须先用 `(v&0xffff)` 转补码；
- **DC 模式下相位照样累计**（`phase_next` 无条件执行），换到交流模式时波形从当前相位对应的点开始、初相任意；要「每次都从 0 相位开始」得加 mode 变更检测清零（本工程没加，TB 按连续相位建模）；
- **参考模型必须复现实现的全部行为**：第一版 TB 每个测试把相位模型清零、而 RTL 相位跨测试连续累计 → 全线 FAIL，实际 RTL 是对的。先读实现的行为语义，再写模型；
- **独立实现才叫验证**：TB 正弦模型用实数 `$sin` 现算、方波/三角用另一套表达式推导，两套独立推导对上 ±2 LSB 才算数；把 DUT 代码抄进 TB 当期望值是自欺欺人。

### 采样效应与时序

- **ZOH 阶梯与镜像**：DAC 每 10µs 保持一个值，1 kHz 每周期 100 个台阶，10 kHz 只剩 10 个；镜像在 n×100kHz±f_out，1 kHz 第一镜像在 99 kHz，幅度 ≈ **−40 dBc**；
- **sinc 衰落与量化**：1 kHz → 0.99984（−0.0014 dB，无感）；**20 kHz → 0.9355（−0.58 dB，低 6.5%）**——高频段幅度「不够」多半是这个，不是 bug；方波边沿/过零点只落在 10µs 网格，测周期用示波器「平均」档；
- **时序/资源**：code 用 tick 前的（旧）相位计算、phase 同拍前进，与 TB「先算期望再进拍」严格对应；组合链（LUT + 两个乘法器 + 选择器）100 MHz 下 **WNS = +1.4~1.6 ns**，不需要流水化；三个乘法综合用 **3 个 DSP48**（k_full / dc_off32 / off32）。

## 踩过的坑

这个实验的电路不算复杂，坑几乎全在**数字的精确性**上。下面这些是真实记录下来的：

1. **心算近似没和仿真对账**：三角波峰峰值先写成 43683 LSB，实际是 **43669**（顶 54602 / 底 10933）；0xAAAA 的输出先写成 +5.0001V，实际是 **+4.9997V**；−10V 行写成 −10.0000V，实际是 **−10.0003V**。教训是"数字必须过两遍：手算一遍、和仿真打印对一遍"。
2. **"状态时长"和"信号间隔"差 1 拍**：`S_LEAD` 状态只占 4 拍，但从 CS↓ 到首个 SCK↑ 是 **5 拍 = 50ns**（进 S_SHIFT 后还要 1 拍才拉高 SCK）；`S_LAG` 同理占 4 拍，tLag 却是 **11 拍 = 110ns**。文档里一度写成 40ns，逐拍推演才订正——**画边沿图是唯一可靠的核对办法**。
3. **6.2kΩ 输出阻抗那道账方向说反了**：不是"接 1kΩ 负载还剩 86%"，而是 V_负载 = V×RL/(6.2k+RL) = 1/7.2 ≈ **13.9%**（损失 86%）。订正后的结论反而更有说服力：连 10MΩ 的 ×10 探头都会带来 41 LSB 的增益误差。
4. **参考模型漏了"看起来无关紧要"的行为**：第一版 tb_wave_gen 每个测试都把相位模型清零，而 RTL 的相位是跨测试连续累计的（DC 模式下相位照样在走）→ 全线 FAIL，一度怀疑 RTL 写错了。**先读实现的行为语义，再写模型。**
5. **JS 负数转十六进制**：`(-50).toString(16)` 得到的是 `"-32"`，不是合法 Verilog 字面量。生成脚本里必须 `(v & 0xffff).toString(16).padStart(4,'0')`。
6. **别拿 DUT 代码当期望值**：正弦的 TB 模型用实数 `$sin` 现算（而不是把 LUT 抄一遍），方波/三角用另一套表达式推导——两套独立推导对上 ±2 LSB，才算真验证。
7. **"忙时丢弃 load"是设计约束，不是碰巧**：帧长 136 拍、节拍 1000 拍，空闲 8640ns，所以丢弃策略在本参数组下永远不会触发。这个约束写在参数里，改 UPDATE_HZ 之前必须先算配合比。

### 下一步可以做的

- 把 `UPDATE_HZ` 往上提（先算帧长与节拍的配合比，必要时给 `dac8871_master` 加一级 skid buffer）；
- 在输出端加**重建滤波器**（抑制 99 kHz 等采样镜像；通带衰落需另外评估是否补偿）；
- 换成**独立精密基准**，降低系统增益误差和参考噪声，并通过测量评估有效精度；
- 把 `sine_lut` 换成双口 RAM + VIO 写端口，升级成**任意波形发生器**（DDS 部分一行都不用改）；
- 把 LDAC_N 从接地改成 FPGA 控制，做**双通道同步输出**。
