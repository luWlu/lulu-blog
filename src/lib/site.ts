import { getCollection } from 'astro:content';

export const site = {
  name: "lulu's blog",
  author: 'lulu',
  description: '硬件电子方向研究生的学习记录与项目手记。把想法接上线，让知识慢慢发光。',
};

export const url = (path = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
export const dateLabel = (date: Date) => date.toISOString().slice(0, 10).replaceAll('-', '.');
export const readingTime = (body = '') => Math.max(1, Math.ceil(body.replace(/\s/g, '').length / 450));

export async function allNotes() {
  return (await getCollection('notes', ({ data }) => !data.draft))
    .sort((a, b) => Number(a.data.sample) - Number(b.data.sample) || b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id));
}

export async function allProjects() {
  return (await getCollection('projects', ({ data }) => !data.draft))
    .sort((a, b) => Number(a.data.sample) - Number(b.data.sample) || b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id));
}