import test from 'node:test';
import assert from 'node:assert/strict';
import { shortTitle } from '../src/lib/short-title.ts';

test('学习路径短标题去掉实验编号前缀与补充说明', () => {
  assert.equal(shortTitle('前置实验：EMIO 点灯，第一次让 PS 控制 PL 引脚'), 'EMIO 点灯');
  assert.equal(shortTitle('实验一：数字 I/O 边沿捕获'), '数字 I/O 边沿捕获');
  assert.equal(shortTitle('实验四：模拟量采集（AD 采集 + 滑窗滤波 + 最小二乘校准）'), '模拟量采集');
  assert.equal(shortTitle('实验二：脉宽计数、频率与占空比测量'), '脉宽计数、频率与占空比测量');
});

test('没有前缀的标题保持原样', () => {
  assert.equal(shortTitle('PWM 生成与示波器验证'), 'PWM 生成与示波器验证');
});
