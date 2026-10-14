import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Nodes } from 'mdast';

const markdown = unified().use(remarkParse).use(remarkGfm);
const cache = new Map<string, number>();
type HtmlContext = { excluded: string[] };

// SVG / HTML 代码可能被拆成多条 mdast 节点，跨节点保留排除状态。
function htmlText(value: string, context: HtmlContext): string {
  const html = value.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  let result = '';
  let cursor = 0;
  for (const match of html.matchAll(/<[^>]+>/g)) {
    if (!context.excluded.length) result += html.slice(cursor, match.index);
    const tag = match[0].match(/^<\s*(\/?)\s*(svg|pre|code|script|style)\b/i);
    if (tag) {
      const name = tag[2].toLowerCase();
      if (tag[1]) {
        const index = context.excluded.lastIndexOf(name);
        if (index !== -1) context.excluded.splice(index);
      } else if (!/\/\s*>$/.test(match[0])) context.excluded.push(name);
    }
    cursor = match.index + match[0].length;
  }
  if (!context.excluded.length) result += html.slice(cursor);
  return result.replace(/&(?:[\w]+|#\d+|#x[\da-f]+);/gi, ' ');
}

function proseText(node: Nodes, context: HtmlContext): string {
  // 代码、图片和引用定义不算讲解文字；表格按单元格正文计入。
  if (['code', 'inlineCode', 'image', 'imageReference', 'definition', 'yaml'].includes(node.type)) return '';
  if (node.type === 'html') return htmlText(node.value, context);
  if (node.type === 'text') return context.excluded.length ? '' : node.value;
  if ('children' in node) return node.children.map(child => proseText(child, context)).join(' ');
  return '';
}

/** 中文技术讲解按 400 字/分钟估算；任意围栏、缩进和行内代码不计，保留表格文字。 */
export function readingTime(body = ''): number {
  const saved = cache.get(body);
  if (saved !== undefined) return saved;
  const characters = Array.from(proseText(markdown.parse(body), { excluded: [] }).replace(/\s+/g, '')).length;
  const minutes = Math.max(1, Math.ceil(characters / 400));
  cache.set(body, minutes);
  return minutes;
}
