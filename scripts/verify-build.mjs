import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 可对默认产物及不同部署路径的独立构建运行同一套发布检查。
const root = path.resolve(process.argv[2] || 'dist');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const canonicalHref = home.match(
  /<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/,
);
assert.ok(canonicalHref, '首页必须有 canonical');
const origin = new URL(canonicalHref[1]).origin;
const base = new URL(canonicalHref[1]).pathname;
const decode = (text) => text.replaceAll('&amp;', '&').replaceAll('&#38;', '&');
const htmlFiles = fs
  .readdirSync(root, { recursive: true })
  .filter((file) => file.endsWith('.html'));
const pages = new Map();
const socialCard = fs.readFileSync(path.join(root, 'social-card.png'));
assert.equal(
  socialCard.subarray(0, 8).toString('hex'),
  '89504e470d0a1a0a',
  '分享图必须为 PNG',
);
assert.equal(socialCard.readUInt32BE(16), 1200, '分享图宽度必须为 1200');
assert.equal(socialCard.readUInt32BE(20), 630, '分享图高度必须为 630');
let checkedLinks = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${file}: 重复 HTML id`);
  const outsideSvg = html.replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
  assert.ok(
    !/<(?:rect|circle|ellipse|path|polygon|polyline|line|text|defs|marker)\b/i.test(outsideSvg),
    `${file}: SVG 图形被拆开；请移除内联 SVG 内部的空行，保持连续 HTML 块`,
  );
  assert.ok(
    !/TODO\(lulu\)|shot-placeholder|截图待补|\b[A-Za-z]:\\/.test(html),
    `${file}: 内部批注、本机路径或补图占位被输出`,
  );
  const canonical = html.match(
    /<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/,
  );
  const image = html.match(
    /<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/,
  );
  assert.equal(
    decode(image?.[1] || ''),
    `${origin}${base}social-card.png`,
    `${file}: 分享图地址错误`,
  );
  assert.ok(
    html.includes('name="twitter:card" content="summary_large_image"'),
    `${file}: 缺少分享卡片类型`,
  );
  if (file === '404.html') {
    assert.ok(!canonical, '404 不应输出 canonical');
    assert.ok(
      !/<meta\b[^>]*property="og:url"/.test(html),
      '404 不应输出 og:url',
    );
    assert.ok(html.includes('noindex, follow'));
  } else {
    const expectedPath =
      base + file.replaceAll('\\', '/').replace(/index\.html$/, '');
    assert.equal(
      decode(canonical?.[1] || ''),
      origin + expectedPath,
      `${file}: canonical 错误`,
    );
    if (html.includes('class="article-header"')) {
      const date = html.match(/<time\b[^>]*datetime="([^"]+)"/);
      const published = html.match(
        /<meta\b[^>]*property="article:published_time"[^>]*content="([^"]+)"/,
      );
      assert.ok(
        html.includes('property="og:type" content="article"'),
        `${file}: 文章缺少 article 类型`,
      );
      assert.equal(published?.[1], date?.[1], `${file}: 文章发布时间不一致`);
      const structured = html.match(
        /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
      );
      assert.ok(structured, `${file}: 缺少文章结构化数据`);
      const schema = JSON.parse(structured[1]);
      assert.equal(
        schema['@type'],
        'BlogPosting',
        `${file}: 结构化数据类型错误`,
      );
      assert.equal(
        schema.datePublished,
        date?.[1],
        `${file}: 结构化数据日期错误`,
      );
      assert.equal(
        schema.mainEntityOfPage,
        origin + expectedPath,
        `${file}: 结构化数据网址错误`,
      );
      assert.equal(
        schema.image,
        `${origin}${base}social-card.png`,
        `${file}: 结构化数据分享图错误`,
      );
      assert.ok(schema.author?.name, `${file}: 缺少文章作者`);
      pages.set(origin + expectedPath, {
        sample: html.includes('noindex, follow'),
        date: date?.[1],
      });
    }
  }
  if (html.includes('<pre class="astro-code')) {
    assert.ok(
      html.includes('--shiki-light:') && html.includes('--shiki-dark:'),
      `${file}: 缺少双主题语法色`,
    );
    assert.ok(
      !/<pre\b[^>]*style="[^"\n]*(?:background-color|color):#[\da-f]/i.test(
        html,
      ),
      `${file}: 代码背景/字体被内联写死`,
    );
  }
  for (const [, raw] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const href = decode(raw);
    if (/^(?:data:|mailto:|tel:)/.test(href)) continue;
    const targetUrl = new URL(href, origin + base + file.replaceAll('\\', '/'));
    if (targetUrl.origin !== origin) continue;
    assert.ok(
      targetUrl.pathname.startsWith(base),
      `${file}: 路径缺少 base ${href}`,
    );
    let target = path.join(
      root,
      decodeURIComponent(targetUrl.pathname.slice(base.length)),
    );
    if (fs.existsSync(target) && fs.statSync(target).isDirectory())
      target = path.join(target, 'index.html');
    assert.ok(fs.existsSync(target), `${file}: 资源不存在 ${href}`);
    if (targetUrl.hash && target.endsWith('.html')) {
      const targetHtml = fs.readFileSync(target, 'utf8');
      const id = decodeURIComponent(targetUrl.hash.slice(1));
      assert.ok(targetHtml.includes(`id="${id}"`), `${file}: 无效锚点 ${href}`);
    }
    checkedLinks++;
  }
}
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const rss = fs.readFileSync(path.join(root, 'rss.xml'), 'utf8');
const search = JSON.parse(
  fs.readFileSync(path.join(root, 'search-index.json'), 'utf8'),
);
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) =>
  decode(match[1]),
);
const feedUrls = [
  ...rss.matchAll(/<item>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g),
].map((match) => decode(match[1]));
assert.ok(rss.includes('<language>zh-CN</language>'));
const realArticles = [...pages.entries()].filter(([, entry]) => !entry.sample);
assert.equal(
  feedUrls.length,
  Math.min(30, realArticles.length),
  'RSS 应涵盖三类真实文章',
);
for (const [href, { sample }] of pages) {
  assert.equal(
    sitemapUrls.includes(href),
    !sample,
    `${href}: sitemap 样例过滤错误`,
  );
  if (sample) assert.ok(!feedUrls.includes(href), `${href}: 样例进入 RSS`);
  assert.ok(
    search.some((entry) => origin + entry.href === href),
    `${href}: 搜索索引缺少内容`,
  );
}
for (const url of feedUrls)
  assert.ok(
    realArticles.some(([href]) => href === url),
    `${url}: RSS 收录非法条目`,
  );
for (const entry of search) {
  assert.ok(entry.href.startsWith(base), `${entry.href}: 搜索路径错误`);
  const info = pages.get(origin + entry.href);
  assert.ok(
    info && info.sample === entry.sample,
    `${entry.href}: 搜索样例标记错误`,
  );
}
if (
  [...pages].some(
    ([href, entry]) => entry.sample && href.includes(`${base}notes/`),
  )
)
  assert.ok(home.includes('标有「示例内容」的笔记'), '首页缺少示例笔记提示');
if (
  [...pages].some(
    ([href, entry]) => entry.sample && href.includes(`${base}projects/`),
  )
)
  assert.ok(home.includes('标有「示例项目」的内容'), '首页缺少示例项目提示');
const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
assert.ok(
  robots.includes(`Sitemap: ${origin}${base}sitemap.xml`),
  'robots 站点地址错误',
);
console.log(
  JSON.stringify(
    {
      root,
      origin,
      base,
      pages: htmlFiles.length,
      checkedLinks,
      realArticles: realArticles.length,
      searchEntries: search.length,
      result: 'passed',
    },
    null,
    2,
  ),
);
