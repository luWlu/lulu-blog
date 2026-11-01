import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import { resolveSiteConfig } from './scripts/site-config.mjs';
import stripHtmlComments from './scripts/strip-html-comments.mjs';

export default defineConfig({
  ...resolveSiteConfig(),
  output: 'static',
  devToolbar: { enabled: false },
  trailingSlash: 'always',
  // 悬停/触摸链接时预取下一页，配合跨页面过渡让切换几乎无等待。
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  markdown: {
    processor: unified({ remarkPlugins: [stripHtmlComments] }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark-default' },
      defaultColor: false,
    },
  },
});
