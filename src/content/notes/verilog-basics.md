---
title: "Verilog 基础手记：触发器、边沿检测与计数器"
description: "整理 HDLBits 练习中的触发器、边沿检测、BCD 级联、特殊循环计数与赋值语义，区分题目逻辑模型和 FPGA 实现边界。"
date: 2026-10-15
category: "Verilog"
tags: ["Verilog", "HDLBits", "时序逻辑", "计数器"]
sample: false
draft: false
---

<a id="quick-index"></a>

这篇笔记于 **2026 年 10 月 15 日整理发布**，来自我在 [HDLBits](https://hdlbits.01xz.net/wiki/Main_Page) 做题时积累的 Verilog 记录。日期表示这次整理发布日期，不表示下面所有知识点都在当天首次学习或已上板验证。

我把常见写法、容易混淆的地方和关联题目放在一起，便于之后回看。代码以 Verilog 的练习模型为主，双边沿采样等写法会单独说明实际 FPGA 的限制。

<a id="ff-summary"></a>

## 常见触发器写法汇总

以下以时钟上升沿采样为主；其中异步复位会在复位边沿立即生效，不能与同步复位混为一谈。各模块是独立写法示例，不表示已在开发板验证。

---

<a id="dff"></a>

### D 触发器

**最基本也最常用的触发器**，输出 q 在有效时钟沿采样输入 d，沿之间保持。

| 变体 | 写法 |
|:---|:---|
| **基本 DFF** | `always @(posedge clk) q <= d;` |
| **同步复位** | `always @(posedge clk) if (reset) q <= 0; else q <= d;` |
| **异步复位** | `always @(posedge clk or posedge reset) if (reset) q <= 0; else q <= d;` |
| **同步复位 + 复位值** | `always @(posedge clk) if (reset) q <= 4'b0110; else q <= d;` |
| **同步使能** | `always @(posedge clk) if (ena) q <= d;` |

```verilog
// 基本 DFF
module dff (
    input clk, d,
    output reg q
);
    always @(posedge clk) q <= d;
endmodule

// 带同步复位
module dff_sync_reset (
    input clk, reset, d,
    output reg q
);
    always @(posedge clk)
        if (reset) q <= 1'b0;
        else       q <= d;
endmodule

// 带异步复位
module dff_async_reset (
    input clk, reset, d,
    output reg q
);
    always @(posedge clk or posedge reset)
        if (reset) q <= 1'b0;
        else       q <= d;
endmodule
```


---

<a id="tff"></a>

### T 触发器

| t | 下一个 q |
|:---:|:---:|
| 0 | **保持** |
| 1 | **翻转**（取反） |

```verilog
// 方式一：if-else
module tff (
    input clk, reset, t,
    output reg q
);
    always @(posedge clk) begin
        if (reset)   q <= 1'b0;
        else if (t)  q <= ~q;
    end
endmodule

// 方式二（更简洁）：用异或
module tff_xor (
    input clk, reset, t,
    output reg q
);
    always @(posedge clk) begin
        if (reset) q <= 1'b0;
        else       q <= q ^ t;
    end
endmodule
```

**为什么 `q <= q ^ t` 等价于 T 触发器？**

| t | q ^ t | 含义 |
|:---:|:---:|:---:|
| 0 | q ^ 0 = q | 保持 |
| 1 | q ^ 1 = ~q | 翻转 |


---

<a id="jkff"></a>

### JK 触发器

| J | K | 下一个 Q |
|:---:|:---:|:---:|
| 0 | 0 | **保持** Qold |
| 0 | 1 | **复位** 0 |
| 1 | 0 | **置位** 1 |
| 1 | 1 | **翻转** ~Qold |

```verilog
// 方式一：case 语句
module jkff (
    input clk, j, k,
    output reg Q
);
    always @(posedge clk) begin
        case ({j, k})
            2'b00: Q <= Q;
            2'b01: Q <= 1'b0;
            2'b10: Q <= 1'b1;
            2'b11: Q <= ~Q;
        endcase
    end
endmodule

// 方式二：用表达式（等价于 DFF + 组合逻辑）
// 推导：Q_next = (J & ~Q) | (~K & Q)
module jkff_expr (
    input clk, j, k,
    output reg Q
);
    always @(posedge clk)
        Q <= (j & ~Q) | (~k & Q);
endmodule
```

**JK → D 的表达式推导**（用 DFF 实现 JK）：
```
Q_next = J·~Q + ~K·Q
```


---

<a id="srff"></a>

### SR 触发器

| S | R | 下一个 Q |
|:---:|:---:|:---:|
| 0 | 0 | **保持** |
| 0 | 1 | **复位** 0 |
| 1 | 0 | **置位** 1 |
| 1 | 1 | 通常定义为非法输入；本例选择保持 |

```verilog
module srff (
    input clk, s, r,
    output reg Q
);
    always @(posedge clk) begin
        case ({s, r})
            2'b00: Q <= Q;
            2'b01: Q <= 1'b0;
            2'b10: Q <= 1'b1;
            2'b11: Q <= Q;  // 本例将 s=r=1 定义为保持；真实设计应明确非法输入策略
        endcase
    end
endmodule
```


---

<a id="ff-compare"></a>

### 四种触发器对比

| 类型 | 输入 | 保持条件 | 置位条件 | 复位条件 | 翻转条件 |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **D** | d | — | d=1 | d=0 | — |
| **T** | t | t=0 | — | — | t=1 |
| **JK** | j, k | j=0,k=0 | j=1,k=0 | j=0,k=1 | j=1,k=1 |
| **SR** | s, r | s=0,r=0；本例 s=r=1 也保持 | s=1,r=0 | s=0,r=1 | 不定义翻转输入 |


---

<a id="edge-posedge"></a>

## 边沿检测：上升沿

**关联题目**：[Edgedetect](https://hdlbits.01xz.net/wiki/Edgedetect)（HDLBits）

**核心思想**：把同步输入打一拍，再比较当前值和上一拍的值。以下按 HDLBits 的同步采样模型讨论；外部异步引脚应先同步，再做边沿检测，窄于采样间隔的脉冲也可能漏掉。

**检测上升沿（0→1 跳变）**：
```verilog
pedge = in & ~in_prev;
```

**为什么只输出一个周期的脉冲？**

- D 触发器每个时钟上升沿才更新一次值
- 跳变发生后的那一个周期，`in=1` 且 `in_prev=0` → 条件成立，输出 1
- 下一个周期 `in_prev` 也变成 1 → 条件不再成立 → 输出回到 0
- 因此刚好只得到一个周期宽度的脉冲

**波形理解**：
```
clk      : ╷╵╷╵╷╵╷╵╷╵╷╵
in       : 0 0 1 1 0 0
in_prev  : 0 0 0 1 1 0    ← 比 in 晚一个周期
pedge    : 0 0 1 0 0 0    ← 只在 0→1 跳变后出现一个周期的高电平
```

**扩展 — 下降沿检测**：
```verilog
nedge = ~in & in_prev;   // 当前是0，之前是1 → 检测下降沿
```

**扩展 — 双边沿检测**：
```verilog
anyedge = in ^ in_prev;   // 当前和之前不一样 → 检测任何边沿
```


---

<a id="edge-both"></a>

## 边沿检测：任意边沿

**关联题目**：[Edgedetect2](https://hdlbits.01xz.net/wiki/Edgedetect2)（HDLBits）

**核心要求**：检测 8 位输入信号每一位的**任意边沿**（0→1 或 1→0），发生变化时输出一个周期的高电平。

**实现逻辑**：
```verilog
anyedge = in ^ in_prev;
```

**为什么用异或？**

| in | in_prev | in ^ in_prev | 含义 |
|:--:|:-------:|:------------:|:----:|
| 0 | 0 | 0 | 没变 |
| 0 | 1 | 1 | 1→0 下降沿 |
| 1 | 0 | 1 | 0→1 上升沿 |
| 1 | 1 | 0 | 没变 |

异或的本质就是"不相同"，只要信号的两个值不一样，就说明发生了边沿跳变。

**三种边沿检测对比**：

| 检测类型 | 逻辑表达式 | 检测条件 |
|:--------|:----------|:---------|
| 上升沿 | `in & ~in_prev` | 0→1 |
| 下降沿 | `~in & in_prev` | 1→0 |
| **双边沿** | `in ^ in_prev` | **0→1 或 1→0** |


---

<a id="edge-capture"></a>

## 下降沿捕获并保持

**关联题目**：[Edgecapture](https://hdlbits.01xz.net/wiki/Edgecapture)（HDLBits）

**核心要求**：检测 32 位输入信号的**下降沿（1→0）**，一旦检测到，对应的输出位**置 1 并一直保持**，直到同步复位信号到来才清零。

**行为总结**：

| 事件 | 行为 |
|:---|:---|
| 检测到 1→0 下降沿 | 对应 `out` 位置 1，并保持 |
| `reset` 为高电平 | 下一个时钟上升沿，`out` 清零（同步复位） |
| 复位和下降沿同时发生 | **复位优先** |

**核心代码**（`in_prev` 记录上一拍输入）：

```verilog
always @(posedge clk) in_prev <= in;

always @(posedge clk) begin
    if (reset)
        out <= 32'd0;
    else
        out <= (~in & in_prev) | out;
end
```

**关键写法解析 — 自锁（保持）原理**：

`out <= (~in & in_prev) | out;`

- `~in & in_prev`：下降沿检测（当前=0，上一周期=1）
- `| out`：**或上自己原来的值** — 一旦被置1，即使下降沿条件消失，仍通过或门维持为1
- 只有 reset 才能将其清零，实现了"捕获并保持"的效果

**和普通边沿检测的区别**：

| 特性 | 普通边沿检测 | 捕获保持 |
|:---|:---|:---|
| 检测到边沿后 | 输出 1 个周期脉冲 | **一直保持为 1** |
| 如何清零 | 自动归零 | 需要 **reset** |
| 典型应用 | 边沿触发事件通知 | **中断信号、错误标志** |


---

<a id="dualedge"></a>

## 双边沿采样的逻辑模型

**关联题目**：[Dualedge](https://hdlbits.01xz.net/wiki/Dualedge)（HDLBits）

**核心要求**：实现一个功能上类似于双边沿触发器的电路，即时钟的**上升沿和下降沿都能采样 d**。

### 练习中的逻辑模型

普通 FPGA 逻辑寄存器通常按单个时钟边沿综合，`always @(posedge clk or negedge clk)` 不是可移植的普通触发器模板。HDLBits 这题用两个单边沿采样结果加选择器，构造功能上的双边沿模型：

```verilog
reg q_pos, q_neg;

always @(posedge clk) q_pos <= d;
always @(negedge clk) q_neg <= d;
assign q = clk ? q_pos : q_neg;
```

| 时刻 | q_pos | q_neg | q 在寄存器更新稳定后 |
| --- | --- | --- | --- |
| 上升沿 | 采样新的 d | 保持 | clk=1，选择 q_pos |
| 高电平期间 | 保持 | 保持 | 选择 q_pos |
| 下降沿 | 保持 | 采样新的 d | clk=0，选择 q_neg |
| 低电平期间 | 保持 | 保持 | 选择 q_neg |

这里的时钟直接作为组合选择信号，时钟翻转和寄存器更新之间可能产生瞬态；它适合解释题目逻辑，不能直接当作无毛刺的 FPGA DDR 接口实现。

### 实际 FPGA 中的 DDR

FPGA 并非没有 DDR 硬件。实际双边沿输入/输出应优先使用器件提供的 IDDR / ODDR 或相应系列的专用原语、IP，并按接口规范约束时钟与数据。

把 `wire k = ~clk;` 再写进 `always @(posedge clk or posedge k)`，仍然是在要求同一寄存器响应两个时钟事件，不能绕过普通触发器综合模板的限制。组合逻辑产生的派生时钟还需专门处理布线、偏斜和约束；练习中应采用题目规定的模型，硬件中应采用受支持的时钟资源。

<a id="if-operators"></a>

## if 判断中常用运算符

### 关系运算符

| 运算符 | 含义 | 示例 |
|:---:|:---|:---|
| `==` | **等于** | `if (a == 5)` |
| `!=` | **不等于** | `if (a != 5)` |
| `>` | **大于** | `if (a > 5)` |
| `<` | **小于** | `if (a < 5)` |
| `>=` | **大于等于** | `if (a >= 5)` |
| `<=` | **小于等于** | `if (a <= 5)` |

> ⚠️ `<=` 在 if 中是"小于等于"，在 `q <= d;` 中是"非阻塞赋值"，编译器根据上下文区分。

### 逻辑运算符

| 运算符 | 含义 | 示例 |
|:---:|:---|:---|
| `&&` | **逻辑与**（and） | `if (a > 0 && b > 0)` |
| `\|\|` | **逻辑或**（or） | `if (a > 0 \|\| b > 0)` |
| `!` | **逻辑非**（not） | `if (!reset)` |

### 按位运算符

| 运算符 | 含义 | 示例 |
|:---:|:---|:---|
| `&` | 按位与 | `if (a & 8'h80)` |
| `\|` | 按位或 | `if (a \| b)` |
| `^` | 按位异或 | `if (a ^ b)` |
| `~` | 按位取反 | `if (~a)` |

### 归约运算符（if 中特别常用）

| 运算符 | 含义 | 示例 |
|:---:|:---|:---|
| `&a` | **所有位都为 1？** | `if (&q[2:0])` 等价于 `q[2]==1 && q[1]==1 && q[0]==1` |
| `\|a` | **有任一 bit 为 1？** | `if (\|a)` |
| `^a` | **有奇数个 bit 为 1？** | `if (^a)` |

### 条件运算符（三目）

```verilog
// a ? b : c  — 如果 a 为真，结果为 b，否则为 c
q[1] <= q[0] ? ~q[1] : q[1];
```

### 常用组合举例

```verilog
if (reset)                     // reset 为 1
if (!reset)                    // reset 为 0
if (a == 1'b1)                 // a 等于 1
if (&q[2:0])                   // q[2:0] 全为 1
if (cnt == 4'd9)               // cnt 等于 9
if (a > 0 && a < 10)           // a 在 0~10 之间
```


---

<a id="counter-cascade"></a>

## 多位 BCD 计数器级联与使能

**关联题目**：[count_clock](https://hdlbits.01xz.net/wiki/Count_clock) / [ECE241 2014 q7b](https://hdlbits.01xz.net/wiki/Exams/ece241_2014_q7b)（HDLBits）

**核心思想**：多个十进制计数器级联时，**所有计数器共用同一个 `clk`**，高位是否加一由 `enable` 决定，而不是把低位的进位条件直接当作时钟。

**典型结构**：

- 个位：每拍都计数
- 十位：当个位等于 9 时计数
- 百位：当个位和十位都等于 9 时计数
- 千位：当前三位都等于 9 时计数

```verilog
assign ena[1] = (q[3:0] == 4'd9);
assign ena[2] = (q[3:0] == 4'd9) && (q[7:4] == 4'd9);
assign ena[3] = (q[3:0] == 4'd9) && (q[7:4] == 4'd9) && (q[11:8] == 4'd9);

decade d1(clk, 1'b1,   reset, q[3:0]);
decade d2(clk, ena[1], reset, q[7:4]);
decade d3(clk, ena[2], reset, q[11:8]);
decade d4(clk, ena[3], reset, q[15:12]);
```

**为什么不能把 `ena` 当作时钟？**

- `ena` 是组合逻辑条件，不是干净的时钟信号
- 组合逻辑可能产生毛刺（glitch），拿来当时钟不可靠
- 这类题目要练的是**同步设计**：统一时钟 + 条件使能

**带使能的十进制计数器模板**：
```verilog
module decade (
    input clk,
    input enable,
    input reset,
    output reg [3:0] q
);
    always @(posedge clk) begin
        if (reset)
            q <= 4'd0;
        else if (enable) begin
            if (q == 4'd9)
                q <= 4'd0;
            else
                q <= q + 4'd1;
        end
    end
endmodule
```

**易错点总结**：
1. `q` 如果在 `always` 块里赋值，必须声明成 `output reg`
2. 上层模块的 `q` 如果只是接子模块输出，一般写成普通 `output` 即可
3. 条件判断里更推荐用 `&&` 表示逻辑与，而不是用 `&` 凑条件
4. 级联计数器时，**低位每拍计数，高位按条件使能**


---

<a id="counter-load-wrap"></a>

## 用 load/enable 实现特殊循环计数

**关联题目**：[ECE241 2014 q7a](https://hdlbits.01xz.net/wiki/Exams/ece241_2014_q7a)（HDLBits）

**核心要求**：题目给了一个现成的 4 位计数器 `count4`，它支持：

- `load=1`：下一个时钟把 `d` 装入 `Q`
- `load=0 && enable=1`：正常加一
- `load=0 && enable=0`：保持不变

题目的目标不是普通 `0~15` 计数，而是实现：

```text
1 -> 2 -> 3 -> ... -> 12 -> 1 -> ...
```

**关键思路**：

当当前值已经是 `12`，并且还允许继续计数时，**不要让它加到 13**，而是直接令 `load=1`，把 `1` 装回去。

**控制信号设计**：
```verilog
assign c_d      = 4'd1;
assign c_load   = reset || (enable && Q == 4'd12);
assign c_enable = enable && !c_load;
```

**为什么 `c_d` 固定为 1？**

- `reset` 时要回到 1
- 从 `12` 回卷时也要回到 1
- 所以装载值可以一直固定为 `4'd1`

**为什么 `Q==12` 时还要再判断 `enable`？**

- 如果 `Q==12` 但 `enable=0`，题意应该是“停在 12”
- 只有在“允许继续计数”时，才应该从 `12` 跳回 `1`

**状态理解**：

| 当前条件 | 下一拍动作 |
|:---|:---|
| `reset=1` | 装载 `1` |
| `reset=0 && enable=0` | 保持 |
| `reset=0 && enable=1 && Q!=12` | 加一 |
| `reset=0 && enable=1 && Q==12` | 装载 `1` |

**这类题的通用翻译方式**：
1. 先判断有没有同步复位
2. 再判断是否需要“特殊回卷”
3. 其余情况才交给计数器正常自增

**一句话总结**：

遇到“不是自然二进制顺序”的计数题，优先想能不能利用现成计数器的 `load` 输入，把“特殊跳转”翻译成“在某些状态直接装载目标值”。


---

<a id="blocking-nonblocking"></a>

## 阻塞赋值与非阻塞赋值

### 核心区别

| 写法 | 当前过程中的行为 | 常见用途 |
| --- | --- | --- |
| 阻塞赋值 `=` | 执行到该语句时立即更新，后面的语句会读到新值 | 组合计算、测试激励中的顺序操作 |
| 非阻塞赋值 `<=` | 执行到语句时计算右值，把更新安排到当前时刻的 NBA 更新阶段 | 描述时钟寄存器 |

“非阻塞像并行更新”是便于理解的说法：在只用非阻塞赋值的普通时钟块中，右侧读取本次更新前的寄存器值；它不表示仿真器把所有语句同时执行。

### 三个变量的直观对比

假设初始 `a=1, b=2, c=3`，下列是两段独立的示例：

```verilog
// 阻塞赋值：语句顺序会影响后续读取的值
always @(posedge clk) begin
    a = b;      // a 立即变成 2
    b = c;      // b 立即变成 3
    c = a;      // 读到刚更新的 a，得到 2
end
// 本过程执行后：a=2, b=3, c=2
```

```verilog
// 非阻塞赋值：右值先各自求出，再在 NBA 阶段更新
always @(posedge clk) begin
    a <= b;     // 记下旧 b=2
    b <= c;     // 记下旧 c=3
    c <= a;     // 记下旧 a=1
end
// NBA 更新后：a=2, b=3, c=1
```

可以把阻塞理解为“前一个人做完，后一个人继续”；把这类纯非阻塞写法理解为“先记下要拿的旧值，再统一交换”。

### 组合逻辑也要讲顺序

组合块通常使用阻塞赋值，并在所有路径给输出和临时变量赋值。**阻塞语句的先后顺序会影响结果**，应先计算依赖项再使用：

```verilog
always @(*) begin
    temp = a & b;
    y = temp | c;
end
```

交换这两句会先读取旧 `temp`，不能笼统说“组合逻辑里的顺序不影响结果”。遗漏分支赋值还可能推断锁存器。

### 使用约定与混用边界

| 场景 | 建议写法 | 需要注意 |
| --- | --- | --- |
| 组合逻辑 `always @(*)` | 阻塞 `=` | 按依赖顺序计算，覆盖所有输出路径 |
| 时序逻辑 `always @(posedge clk)` | 寄存器状态用非阻塞 `<=` | 避免跨过程读写竞争，明确复位与使能优先级 |
| 连续赋值 | `assign y = expression;` | 语法中有 `=`，但它不是过程阻塞赋值 |
| 测试激励 `initial` | 顺序激励常用阻塞 `=` | 还要避免与 DUT 在同一采样沿竞争 |

不建议对同一个变量混用两类赋值。例如：

```verilog
always @(posedge clk) begin
    q = 0;
    q <= data;
end
```

在只有这一段驱动的简单仿真中，`q` 会先变成 0，再在 NBA 阶段更新为求值时的 `data`；**并非一混用就必然不确定**。问题在于其他过程可能观察到中间值，综合规则和设计意图也容易不一致。时钟块中用阻塞赋值计算独立临时量、再用非阻塞更新状态可以有明确语义，但应确保没有跨过程依赖或对同一状态变量混用。

我的默认习惯是：组合计算用 `=`，时钟寄存器用 `<=`，先把依赖关系与更新时刻想清楚。
