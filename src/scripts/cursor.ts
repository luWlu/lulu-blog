import { followStep, settled } from '../lib/cursor-follow';

// 指针光晕：只给有鼠标的设备；系统要求减弱动态效果时不跟随。
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const interactive = 'a[href], button:not(:disabled), summary, label[for], select, [role="button"], .search-result';
const storageKey = 'lulu-cursor';

if (finePointer.matches && !reducedMotion.matches) {
  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.append(glow);

  let x = 0, y = 0, targetX = 0, targetY = 0, frame = 0, last = 0;
  const place = () => { glow.style.translate = `${x}px ${y}px`; };
  const tick = (now: number) => {
    x = followStep(x, targetX, now - last);
    y = followStep(y, targetY, now - last);
    last = now;
    if (settled(x, y, targetX, targetY)) { x = targetX; y = targetY; frame = 0; }
    else frame = requestAnimationFrame(tick);
    place();
  };
  const show = (atX: number, atY: number) => {
    x = targetX = atX; y = targetY = atY;
    place();
    glow.classList.add('is-visible');
  };

  // 跨页时从上一页的指针位置接着亮，不从角落飞过来。
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (Array.isArray(saved)) show(saved[0], saved[1]);
  } catch {}
  addEventListener('pagehide', () => {
    if (!glow.classList.contains('is-visible')) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify([targetX, targetY])); } catch {}
  });

  document.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    if (!glow.classList.contains('is-visible')) return show(event.clientX, event.clientY);
    targetX = event.clientX; targetY = event.clientY;
    if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
  }, { passive: true });
  document.addEventListener('pointerover', (event) => {
    glow.classList.toggle('is-hot', !!(event.target as Element).closest?.(interactive));
  });
  document.addEventListener('pointerdown', () => glow.classList.add('is-pressed'));
  document.addEventListener('pointerup', () => glow.classList.remove('is-pressed'));
  // 指针离开窗口时熄灭，回来时在新位置重新亮起。
  document.documentElement.addEventListener('pointerleave', () => {
    glow.classList.remove('is-visible', 'is-pressed');
    try { sessionStorage.removeItem(storageKey); } catch {}
  });
}

export {};
