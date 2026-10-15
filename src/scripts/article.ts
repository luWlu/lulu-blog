const article = document.querySelector<HTMLElement>('[data-article-content]');
const progress = document.querySelector<HTMLElement>(
  '.article-reading-progress',
);
const links = Array.from(
  document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'),
);
const headingIds = new Set(links.map((link) => link.dataset.tocLink));
const headings = Array.from(
  article?.querySelectorAll<HTMLElement>('h2[id], h3[id]') ?? [],
).filter((heading) => headingIds.has(heading.id));
const mobileToc = document.querySelector<HTMLDetailsElement>('.mobile-toc');

article?.querySelectorAll<HTMLPreElement>('pre').forEach((pre, index) => {
  const code = pre.querySelector('code');
  if (!code) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'code-block';
  const toolbar = document.createElement('div');
  toolbar.className = 'code-toolbar';
  const language = document.createElement('span');
  language.className = 'code-language';
  language.textContent = pre.dataset.language || '代码';
  const feedback = document.createElement('span');
  feedback.className = 'sr-only';
  feedback.id = `code-copy-status-${index}`;
  feedback.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.className = 'code-copy';
  button.type = 'button';
  button.textContent = '复制代码';
  button.setAttribute('aria-label', `复制${language.textContent}代码`);
  button.setAttribute('aria-describedby', feedback.id);
  let reset: ReturnType<typeof setTimeout> | undefined;
  button.addEventListener('click', async () => {
    clearTimeout(reset);
    button.disabled = true;
    feedback.textContent = '';
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(code.textContent ?? '');
      button.textContent = '已复制 ✓';
      feedback.textContent = '代码已复制到剪贴板。';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      button.textContent = '请手动复制';
      feedback.textContent = '未能访问剪贴板，代码已选中，请手动复制。';
    } finally {
      button.disabled = false;
      reset = setTimeout(() => {
        button.textContent = '复制代码';
      }, 2400);
    }
  });
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', `${language.textContent}代码，可横向滚动`);
  toolbar.append(language, feedback, button);
  pre.before(wrapper);
  wrapper.append(toolbar, pre);
});

mobileToc?.querySelectorAll('a').forEach((link) =>
  link.addEventListener('click', () => {
    mobileToc.open = false;
  }),
);
let frame = 0;
let activeId = '';
function updateReading() {
  frame = 0;
  if (!article || document.hidden) return;
  const bounds = article.getBoundingClientRect();
  const distance = bounds.height - window.innerHeight;
  const fraction =
    distance > 0
      ? Math.min(1, Math.max(0, -bounds.top / distance))
      : bounds.bottom <= window.innerHeight
        ? 1
        : 0;
  if (progress) progress.style.transform = `scaleX(${fraction})`;
  let current = headings[0]?.id ?? '';
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top > 128) break;
    current = heading.id;
  }
  if (bounds.bottom <= window.innerHeight && headings.length)
    current = headings[headings.length - 1].id;
  if (current === activeId) return;
  activeId = current;
  for (const link of links) {
    const active = link.dataset.tocLink === activeId;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  const activeLink = links.find(
    (link) => link.dataset.tocLink === activeId && link.closest('.article-toc'),
  );
  const sidebar = activeLink?.closest<HTMLElement>('.article-toc');
  if (sidebar && activeLink) {
    const outer = sidebar.getBoundingClientRect();
    const inner = activeLink.getBoundingClientRect();
    if (inner.bottom > outer.bottom - 20)
      sidebar.scrollTop += inner.bottom - outer.bottom + 20;
    else if (inner.top < outer.top + 20)
      sidebar.scrollTop -= outer.top - inner.top + 20;
  }
}
function scheduleReading() {
  if (!frame) frame = requestAnimationFrame(updateReading);
}
window.addEventListener('scroll', scheduleReading, { passive: true });
window.addEventListener('resize', scheduleReading, { passive: true });
window.addEventListener('hashchange', scheduleReading);
window.addEventListener('pageshow', scheduleReading);
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(frame);
  frame = 0;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
  } else scheduleReading();
});
article
  ?.querySelectorAll('img')
  .forEach((image) =>
    image.addEventListener('load', scheduleReading, { once: true }),
  );
scheduleReading();

export {};
