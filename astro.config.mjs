import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import { resolveSiteConfig } from './scripts/site-config.mjs';
import stripHtmlComments from './scripts/strip-html-comments.mjs';

export default defineConfig({
  ...resolveSiteConfig(),
  output: 'static',
  devToolbar: { enabled: false },
  trailingSlash: 'always',
  markdown: {
    processor: unified({ remarkPlugins: [stripHtmlComments] }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark-default' },
      defaultColor: false,
    },
  },
});
