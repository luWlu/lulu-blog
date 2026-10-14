import test from 'node:test';
import assert from 'node:assert/strict';
import { readingTime } from '../src/lib/reading-time.ts';

const prose = '文'.repeat(401);
test('讲解文字按 400 字/分钟，空内容至少 1 分钟', () => {
  assert.equal(readingTime(''), 1);
  assert.equal(readingTime('文'.repeat(400)), 1);
  assert.equal(readingTime(prose), 2);
});
test('各种围栏和缩进代码块不进入统计', () => {
  for (const fence of ['```', '~~~~', '``````']) {
    assert.equal(readingTime(`${prose}\n\n${fence}text\n${'x'.repeat(6000)}\n${fence}\n`), 2);
  }
  assert.equal(readingTime(`${prose}\n\n    ${'x'.repeat(6000)}\n`), 2);
  assert.equal(readingTime(`> ${prose}\n>\n> ~~~js\n> ${'x'.repeat(6000)}\n> ~~~`), 2);
});
test('行内代码、注释、图片、SVG 与链接地址不计入讲解', () => {
  const extra = '`' + 'x'.repeat(1000) + '` <!-- ' + 'x'.repeat(1000) + ' -->\n\n'
    + '<svg viewBox="0 0 10 10"><text>' + 'x'.repeat(1000) + '</text></svg>\n\n'
    + '![描述](https://example.test/' + 'x'.repeat(1000) + ')\n\n'
    + '[阅读](https://example.test/' + 'x'.repeat(1000) + ')';
  assert.equal(readingTime(`${prose}\n\n${extra}`), 2);
  assert.equal(readingTime('``a ` b`` ' + prose), 2);
});
test('保留 GFM 表格正文，排除其中的行内代码', () => {
  assert.equal(readingTime(`| 项目 | 说明 |\n| --- | --- |\n| ${prose} | ${'文'.repeat(400)} |`), 3);
  assert.equal(readingTime(`| 项目 | 说明 |\n| --- | --- |\n| ${prose} | \`${'x'.repeat(5000)}\` |`), 2);
});
test('未闭合围栏遵循 Markdown 语义，结束围栏必须匹配字符和长度', () => {
  assert.equal(readingTime(`${prose}\n\n~~~~\n${'x'.repeat(6000)}\n~~~\n`), 2);
  assert.equal(readingTime(`${prose}\n\n\`\`\`\`\n${'x'.repeat(6000)}\n\`\`\`\n`), 2);
});
