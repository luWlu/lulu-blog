import test from 'node:test';
import assert from 'node:assert/strict';
import stripHtmlComments from '../scripts/strip-html-comments.mjs';
import { unified } from '@astrojs/markdown-remark';

test('嵌套节点和混合 HTML 的编辑注释被移除，正常 HTML 和代码注释保留', () => {
  const tree = {type:'root',children:[
    {type:'html', value:'<!-- private -->'},
    {type:'html', value:'<div>visible<!-- private --> text</div>'},
    {type:'blockquote',children:[{type:'html',value:'<!-- private -->'},{type:'text',value:'kept'}]},
    {type:'code',value:'// public code comment'},
  ]};
  stripHtmlComments()(tree);
  assert.equal(tree.children.length, 3);
  assert.equal(tree.children[0].value, '<div>visible text</div>');
  assert.equal(tree.children[1].children.length, 1);
  assert.equal(tree.children[2].value, '// public code comment');
});
test('实际 Markdown 渲染不会发布编辑批注，仍生成目录、表格和双主题代码', async () => {
  const renderer = await unified({remarkPlugins:[stripHtmlComments]}).createRenderer({
    shikiConfig:{themes:{light:'github-light',dark:'github-dark-default'},defaultColor:false},
  });
  const {code,metadata} = await renderer.render('<!-- private-marker -->\n\n## 中文标题\n\n<div>visible<!-- private-marker --></div>\n\n| 项目 | 说明 |\n| --- | --- |\n| x | y |\n\n```js\nconst value = 42; // keep-code-comment\n```');
  assert.ok(!code.includes('private-marker'));
  assert.ok(code.includes('visible'));
  assert.ok(code.includes('keep-code-comment'));
  assert.ok(code.includes('<table>'));
  assert.ok(code.includes('--shiki-light:'));
  assert.ok(code.includes('--shiki-dark:'));
  assert.ok(!/<pre[^>]*style="[^"\n]*background-color:/i.test(code));
  assert.ok(metadata.headings.some(heading => heading.text === '中文标题'));
});
