import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSiteConfig } from '../scripts/site-config.mjs';

test('本地和 GitHub 默认项目站', () => {
  assert.deepEqual(resolveSiteConfig({}), {site: 'http://localhost:4321', base: '/'});
  assert.deepEqual(resolveSiteConfig({GITHUB_REPOSITORY: 'luWlu/lulu-blog'}), {site:'https://luwlu.github.io', base:'/lulu-blog/'});
  assert.deepEqual(resolveSiteConfig({GITHUB_REPOSITORY:'luWlu/luWlu.github.io'}), {site:'https://luwlu.github.io', base:'/'});
});
test('自定义域名 + 空 BASE_PATH 推导根路径，不继承仓库名', () => {
  assert.deepEqual(resolveSiteConfig({GITHUB_REPOSITORY:'luWlu/lulu-blog',SITE_URL:'https://example.com',BASE_PATH:''}), {site:'https://example.com',base:'/'});
  assert.deepEqual(resolveSiteConfig({GITHUB_REPOSITORY:'luWlu/lulu-blog',SITE_URL:' https://example.com ',BASE_PATH:'  '}), {site:'https://example.com',base:'/'});
});
test('GitHub 原域名保持项目路径，显式 BASE_PATH 优先', () => {
  assert.deepEqual(resolveSiteConfig({GITHUB_REPOSITORY:'luWlu/lulu-blog',SITE_URL:'https://luWlu.github.io',BASE_PATH:''}), {site:'https://luwlu.github.io',base:'/lulu-blog/'});
  assert.deepEqual(resolveSiteConfig({GITHUB_REPOSITORY:'luWlu/lulu-blog',SITE_URL:'https://example.com',BASE_PATH:'/journal'}), {site:'https://example.com',base:'/journal/'});
  assert.deepEqual(resolveSiteConfig({GITHUB_REPOSITORY:'luWlu/lulu-blog',BASE_PATH:'/'}), {site:'https://luwlu.github.io',base:'/'});
  assert.deepEqual(resolveSiteConfig({SITE_URL:'https://example.com/journal/'}), {site:'https://example.com',base:'/journal/'});
});
test('非法路径和协议在构建前报错', () => {
  for (const base of ['journal','//example.test','/../','/blog?x=1','/blog#top','/bad path']) {
    assert.throws(() => resolveSiteConfig({BASE_PATH:base}), /BASE_PATH/);
  }
  assert.throws(() => resolveSiteConfig({SITE_URL:'file:///tmp'}), /SITE_URL/);
});
