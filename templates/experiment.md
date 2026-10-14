---
title: "实验六：把标题改成这个实验的名字"
description: "用一句话说清这个实验做了什么、验证了什么，40~60 字。这段文字会出现在卡片、搜索结果和 RSS 里。"
date: 2026-10-20
order: 7
stage: "基础"
status: "计划中"
board: "Zynq-7035 核心板 + 自制 AD/DA 底板"
tools: ["Vivado 2020.2", "示波器"]
tags: ["Zynq", "关键词一", "关键词二"]
accent: "purple"
diagram: "wave"
draft: true
sample: false
---

<!--
使用说明（构建时自动移除，不显示在文章中）：
1. 把本文件复制到 src/content/experiments/ 下，文件名用小写英文 + 连字符，例如 07-uart-loopback.md
   文件名（不含 .md）就是网址：/experiments/07-uart-loopback/
2. order 决定「学习路径」里的 STEP 编号和排序，接着现有的往下排即可。
3. stage 只能是：前置 / 基础 / 进阶
4. accent 只能是：purple / lime / orange    diagram 只能是：wave / board / circuit
5. 写完后把 draft 改成 false，并在本地 npm run dev 看一眼版式。
6. 正文从下面的 ## 开始写，不要写 # 一级标题。
-->

## 这个实验要解决什么

先写清楚问题，再写怎么做。读者需要知道：为什么做它、做完能验证什么。

## 硬件连接

| 信号 | FPGA 引脚 | 外部接口 | 说明 |
| --- | --- | --- | --- |
| clk_100m | C8 | 板载晶振 | 100 MHz PL 时钟 |
|  |  |  |  |

## 原理

把推导过程写下来。下面的内联示意图可按内容调整；文字、接线表和参数也可以独立说明原理：

<figure class="diagram"><svg viewBox="0 0 720 240" role="img" aria-label="信号链框图"><rect x="40" y="90" width="140" height="60" rx="8" fill="currentColor" opacity=".12" stroke="currentColor" stroke-width="2"/><text x="66" y="126" fill="currentColor" font-size="13" font-family="monospace">FPGA</text><path d="M180 120h120" stroke="currentColor" stroke-width="3"/><rect x="300" y="90" width="140" height="60" rx="8" fill="currentColor" opacity=".12" stroke="currentColor" stroke-width="2"/><text x="330" y="126" fill="currentColor" font-size="13" font-family="monospace">外部器件</text></svg><figcaption>图 1：信号链示意</figcaption></figure>

## 关键代码

```verilog
// 只贴关键模块，保留注释
module example (
    input  wire clk,
    output reg  led
);
endmodule
```

## 仿真验证

## 上板步骤

1. 建工程、选器件、加约束
2. 综合、实现、生成 bitstream
3. 下载、观察现象

## 踩过的坑

## 下一步

- [ ] 还没做完的事
