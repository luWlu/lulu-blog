import test from 'node:test';
import assert from 'node:assert/strict';
import { followStep, settled } from '../src/lib/cursor-follow.ts';

test('经过一个半衰期，距离缩短一半', () => {
  assert.equal(followStep(0, 100, 70), 50);
  assert.equal(followStep(100, 0, 140), 25);
});

test('两帧 8ms 与一帧 16ms 结果一致，和帧率无关', () => {
  const twice = followStep(followStep(0, 100, 8), 100, 8);
  assert.ok(Math.abs(twice - followStep(0, 100, 16)) < 1e-9);
});

test('时间为 0 或负数时不移动', () => {
  assert.equal(followStep(10, 100, 0), 10);
  assert.equal(followStep(10, 100, -5), 10);
});

test('接近目标后判定为停稳', () => {
  assert.ok(settled(100.1, 50.2, 100, 50));
  assert.ok(!settled(99, 50, 100, 50));
});
