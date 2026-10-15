import test from 'node:test';
import assert from 'node:assert/strict';
import { dateLabel } from '../src/lib/date.ts';

const cases = [
  ['2026-10-13', '2026.10.13'],
  ['2024-02-29', '2024.02.29'],
  ['2026-10-13T00:00:00+08:00', '2026.10.13'],
  ['2026-01-01T00:00:00+08:00', '2026.01.01'],
  ['2026-10-12T15:59:59.999Z', '2026.10.12'],
  ['2026-10-12T16:00:00.000Z', '2026.10.13'],
  ['2026-12-31T16:00:00Z', '2027.01.01'],
  ['2026-10-13T00:00:00+09:00', '2026.10.12'],
  ['2026-10-12T12:00:00-04:00', '2026.10.13'],
  ['2026-10-13T00:00:00+14:00', '2026.10.12'],
  ['2026-10-12T04:00:00-12:00', '2026.10.13'],
];

test('纯日期沿用原日，上海午夜不会显示为前一天', () => {
  for (const [input, expected] of cases.slice(0, 4)) {
    assert.equal(dateLabel(new Date(input)), expected, input);
  }
});

test('不同时区的同一时刻统一按上海日历跨日、跨年', () => {
  for (const [input, expected] of cases.slice(4)) {
    assert.equal(dateLabel(new Date(input)), expected, input);
  }
});

test('显示日期不依赖部署机器时区', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = zone;
      for (const [input, expected] of cases) {
        assert.equal(dateLabel(new Date(input)), expected, `${zone}: ${input}`);
      }
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('格式化不修改原始时间戳或实际时间顺序', () => {
  const dates = [
    new Date('2026-10-13T00:00:00+08:00'),
    new Date('2026-10-12T08:00:00-04:00'),
    new Date('2026-10-13T00:00:00Z'),
  ];
  const timestamps = dates.map(date => date.getTime());
  const sorted = [...dates].sort((a, b) => b.getTime() - a.getTime());
  dates.forEach(dateLabel);
  assert.deepEqual(dates.map(date => date.getTime()), timestamps);
  assert.deepEqual([...dates].sort((a, b) => b.getTime() - a.getTime()), sorted);
});
