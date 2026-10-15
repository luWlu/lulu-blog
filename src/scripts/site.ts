const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle');
function syncThemeLabel() {
  toggle?.setAttribute(
    'aria-label',
    document.documentElement.dataset.theme === 'dark'
      ? '切换浅色模式'
      : '切换深色模式',
  );
}
syncThemeLabel();
toggle?.addEventListener('click', () => {
  const theme =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('lulu-theme', theme);
  } catch {}
  syncThemeLabel();
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

export {};
