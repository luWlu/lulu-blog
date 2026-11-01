/** 光晕跟随：按帧间隔做指数平滑，帧率不同时跟随手感一致。 */
export const followStep = (current: number, target: number, elapsedMs: number, halfLifeMs = 70) =>
  target + (current - target) * 2 ** (-Math.max(elapsedMs, 0) / halfLifeMs);

/** 和目标足够接近时直接贴上，停止动画循环。 */
export const settled = (x: number, y: number, targetX: number, targetY: number, epsilon = 0.3) =>
  Math.abs(x - targetX) < epsilon && Math.abs(y - targetY) < epsilon;
