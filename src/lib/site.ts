import { getCollection } from 'astro:content';

export const site = {
  name: "lulu's blog",
  author: 'lulu',
  description: '硬件电子方向研究生的学习记录与项目手记。把想法接上线，让知识慢慢发光。',
};

export const url = (path = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
export const dateLabel = (date: Date) => date.toISOString().slice(0, 10).replaceAll('-', '.');
/** 只统计讲解文字的阅读时长：剔除代码块、内联 SVG、HTML 标签、表格与链接地址，按中文技术阅读速度 400 字/分钟估算。 */
export const readingTime = (body = '') => {
  const prose = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\s+/g, '');
  return Math.max(1, Math.ceil(prose.length / 400));
};

export async function allNotes() {
  return (await getCollection('notes', ({ data }) => !data.draft))
    .sort((a, b) => Number(a.data.sample) - Number(b.data.sample) || b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id));
}

export async function allProjects() {
  return (await getCollection('projects', ({ data }) => !data.draft))
    .sort((a, b) => Number(a.data.sample) - Number(b.data.sample) || b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id));
}

/** 实验按「学习路径顺序」排列：order 小的在前，示例内容永远排最后。 */
export async function allExperiments() {
  return (await getCollection('experiments', ({ data }) => !data.draft))
    .sort((a, b) => Number(a.data.sample) - Number(b.data.sample) || a.data.order - b.data.order || a.data.date.getTime() - b.data.date.getTime() || a.id.localeCompare(b.id));
}

export const experimentStages = ['前置', '基础', '进阶'] as const;
export const stepLabel = (order: number) => `STEP ${String(order).padStart(2, '0')}`;