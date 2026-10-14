/** 根域名默认发布到根路径，GitHub 项目站默认使用仓库子路径。 */
export function resolveSiteConfig(env = process.env) {
  const [owner, repository] = (env.GITHUB_REPOSITORY || '').trim().split('/');
  const configuredSite = (env.SITE_URL || '').trim();
  const githubOrigin = owner ? `https://${owner.toLowerCase()}.github.io` : '';
  const resolvedSite = new URL(configuredSite || githubOrigin || 'http://localhost:4321');
  if (!['https:', 'http:'].includes(resolvedSite.protocol)) throw new Error('SITE_URL 必须是 HTTP 或 HTTPS 网址。');
  const configuredBase = (env.BASE_PATH || '').trim();
  const usesProjectPath = repository && !repository.toLowerCase().endsWith('.github.io')
    && resolvedSite.origin === githubOrigin && resolvedSite.pathname === '/';
  const inferredBase = resolvedSite.pathname !== '/' ? resolvedSite.pathname : usesProjectPath ? `/${repository}/` : '/';
  const base = configuredBase || inferredBase;
  if (!base.startsWith('/') || base.startsWith('//') || /[?#\\\s]/.test(base) || base.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('BASE_PATH 必须是以 / 开头的站内路径。');
  }
  return { site: resolvedSite.origin, base: `${base.replace(/\/+$/, '')}/` };
}
