const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle');
function syncThemeLabel() {
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', document.documentElement.dataset.theme === 'dark' ? '#19171f' : '#fbfaf7',
  );
  toggle?.setAttribute(
    'aria-label',
    document.documentElement.dataset.theme === 'dark'
      ? '切换浅色模式'
      : '切换深色模式',
  );
}
syncThemeLabel();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function applyTheme(theme: string) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themeAnimated = '';
  try {
    localStorage.setItem('lulu-theme', theme);
  } catch {}
  syncThemeLabel();
}
toggle?.addEventListener('click', () => {
  const root = document.documentElement;
  const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  if (!document.startViewTransition || reducedMotion.matches) {
    applyTheme(theme);
    return;
  }
  // 以按钮中心为圆心，半径取到视口最远角，新主题从按钮处扩散铺满。
  const bounds = toggle!.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  root.style.setProperty('--theme-x', `${x}px`);
  root.style.setProperty('--theme-y', `${y}px`);
  root.style.setProperty('--theme-r', `${radius}px`);
  root.classList.add('theme-switching');
  const transition = document.startViewTransition(() => applyTheme(theme));
  transition.finished.finally(() => root.classList.remove('theme-switching'));
});
matchMedia('(prefers-color-scheme: dark)').addEventListener(
  'change',
  (event) => {
    try {
      if (localStorage.getItem('lulu-theme')) return;
    } catch {
      return;
    }
    document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
    syncThemeLabel();
  },
);

const menu = document.querySelector<HTMLButtonElement>('#menu-toggle');
const mobileNav = document.querySelector<HTMLElement>('#mobile-nav');
function closeMenu() {
  menu?.setAttribute('aria-expanded', 'false');
  menu?.setAttribute('aria-label', '展开导航');
  if (mobileNav) mobileNav.hidden = true;
}
menu?.addEventListener('click', () => {
  if (!mobileNav) return;
  const expanded = menu.getAttribute('aria-expanded') === 'true';
  menu.setAttribute('aria-expanded', String(!expanded));
  menu.setAttribute('aria-label', expanded ? '展开导航' : '收起导航');
  mobileNav.hidden = expanded;
});

mobileNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
matchMedia('(min-width: 801px)').addEventListener('change', (event) => {
  if (event.matches) closeMenu();
});

const isApple = /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(
  navigator.userAgent,
);
document.querySelectorAll('.search-shortcut').forEach((label) => {
  label.textContent = isApple ? '⌘ K' : 'Ctrl K';
});
document
  .querySelectorAll('.search-trigger')
  .forEach((button) =>
    button.setAttribute('title', `搜索（${isApple ? '⌘' : 'Ctrl'} + K）`),
  );

const dialog = document.querySelector<HTMLDialogElement>('#search-dialog');
const input = document.querySelector<HTMLInputElement>('#search-input');
const results = document.querySelector<HTMLElement>('#search-results');
const status = document.querySelector<HTMLElement>('#search-status');
type SearchEntry = {
  title: string;
  description: string;
  tags: string[];
  kind: string;
  href: string;
  sample: boolean;
};
let entries: SearchEntry[] | null = null;
let loading: Promise<void> | undefined;
let loadFailed = false;
let resultLinks: HTMLAnchorElement[] = [];
let selected = -1;

function selectResult(index: number) {
  selected = index;
  resultLinks.forEach((link, position) =>
    link.classList.toggle('is-selected', position === selected),
  );
}
function renderResults() {
  if (!input || !results || !status) return;
  const query = input.value.trim().toLocaleLowerCase();
  resultLinks = [];
  selectResult(-1);
  results.replaceChildren();
  if (loadFailed) {
    status.textContent = '暂时无法加载搜索，请稍后重新打开，或前往各栏目浏览。';
    return;
  }
  if (!entries) {
    status.textContent = '正在加载搜索…';
    return;
  }
  if (!query) {
    status.textContent = '输入关键词，开始探索。';
    return;
  }
  const matches = entries.filter((entry) =>
    `${entry.title} ${entry.description} ${entry.tags.join(' ')}`
      .toLocaleLowerCase()
      .includes(query),
  );
  status.textContent = matches.length
    ? `找到 ${matches.length} 个相关内容`
    : '还没有找到相关内容，换个关键词试试。';
  const fragment = document.createDocumentFragment();
  for (const entry of matches) {
    const link = document.createElement('a');
    link.href = entry.href;
    link.className = 'search-result';
    const kind = document.createElement('span');
    kind.className = 'search-result-kind';
    kind.textContent = `${entry.kind}${entry.sample ? ' · 示例' : ''}`;
    const title = document.createElement('strong');
    title.textContent = entry.title;
    const description = document.createElement('p');
    description.textContent = entry.description;
    link.append(kind, title, description);
    const index = resultLinks.length;
    link.style.setProperty('--i', String(Math.min(index, 8)));
    link.addEventListener('focus', () => selectResult(index));
    resultLinks.push(link);
    fragment.append(link);
  }
  results.append(fragment);
}
async function openSearch() {
  if (!dialog || !input) return;
  if (!dialog.open) dialog.showModal();
  input.focus();
  if (!entries && !loading) {
    loadFailed = false;
    loading = (async () => {
      try {
        const response = await fetch(dialog.dataset.index!);
        if (!response.ok) throw new Error('Search unavailable');
        entries = await response.json();
      } catch {
        loadFailed = true;
      }
    })().finally(() => {
      loading = undefined;
      renderResults();
    });
  }
  renderResults();
  await loading;
}
document
  .querySelectorAll('.search-trigger')
  .forEach((button) =>
    button.addEventListener('click', () => void openSearch()),
  );
document
  .querySelector('#search-close')
  ?.addEventListener('click', () => dialog?.close());
input?.addEventListener('input', renderResults);
input?.addEventListener('focus', () => selectResult(-1));
dialog?.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    dialog.close();
});
dialog?.addEventListener('keydown', (event) => {
  if (
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    !resultLinks.length
  )
    return;
  const onInput = event.target === input;
  const onResult = resultLinks.includes(event.target as HTMLAnchorElement);
  if (!onInput && !onResult) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const next =
      selected < 0
        ? direction > 0
          ? 0
          : resultLinks.length - 1
        : (selected + direction + resultLinks.length) % resultLinks.length;
    selectResult(next);
    resultLinks[next].focus({ preventScroll: true });
    resultLinks[next].scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter' && onInput) {
    event.preventDefault();
    resultLinks[0].click();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if (event.key === 'Escape') {
    if (dialog?.open) {
      event.preventDefault();
      dialog.close();
    } else if (menu?.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      menu.focus();
    }
    return;
  }
  const typing =
    event.target instanceof HTMLElement &&
    (event.target.matches('input, textarea, select') ||
      event.target.isContentEditable);
  if (
    (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) ||
    (event.key === '/' && !typing)
  ) {
    event.preventDefault();
    void openSearch();
  }
});

// 滚动浮现：列表卡片、栏目标题等在进入视口时淡入上移。
// 只处理首屏以下的元素，首屏内容不会闪烁；首页有自己的 HomeMotion。
const revealSelector = [
  '.listing-grid > *',
  '.experiments-grid > *',
  '.projects-grid > *',
  '.experiment-group-title',
  '.workshop-note',
  '.listing-end',
  '.about-grid > *',
  '.about-topics',
  '.prose > :is(h2, figure, .code-block, .table-scroll, p:has(> img))',
  '.article-end',
].join(', ');
if (
  !reducedMotion.matches &&
  'IntersectionObserver' in window &&
  !document.querySelector('[data-home]')
) {
  const revealObserver = new IntersectionObserver(
    (observed) => {
      for (const entry of observed) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-shown');
        revealObserver.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.01 },
  );
  // 同一行的兄弟元素依次错开出现。
  const rowDelay = new Map<Element, number>();
  document.querySelectorAll<HTMLElement>(revealSelector).forEach((element) => {
    if (element.hidden) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;
    const parent = element.parentElement;
    const top = Math.round(element.offsetTop);
    const key = parent ?? element;
    const step = rowDelay.get(key) ?? 0;
    const previous = element.previousElementSibling as HTMLElement | null;
    const sameRow = previous && Math.round(previous.offsetTop) === top;
    const delay = sameRow ? Math.min(step + 1, 4) : 0;
    rowDelay.set(key, delay);
    element.style.setProperty('--reveal-delay', `${delay * 70}ms`);
    element.dataset.pending = '';
    revealObserver.observe(element);
  });
  // 从目录或锚点跳到下方时，避免目标还处于透明状态。
  window.addEventListener('hashchange', () => {
    document
      .querySelectorAll('[data-pending]:not(.is-shown)')
      .forEach((element) => {
        if (element.getBoundingClientRect().top < window.innerHeight)
          element.classList.add('is-shown');
      });
  });
}

// 回到顶部：滚过一屏半后出现。
const backToTop = document.querySelector<HTMLButtonElement>('.back-to-top');
if (backToTop) {
  let backFrame = 0;
  const updateBackToTop = () => {
    backFrame = 0;
    const visible = window.scrollY > window.innerHeight * 1.5;
    backToTop.classList.toggle('is-visible', visible);
    backToTop.tabIndex = visible ? 0 : -1;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!backFrame) backFrame = requestAnimationFrame(updateBackToTop);
    },
    { passive: true },
  );
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    document.querySelector<HTMLElement>('#main')?.focus({ preventScroll: true });
  });
  updateBackToTop();
}

export {};
