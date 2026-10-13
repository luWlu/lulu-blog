import type { APIRoute } from 'astro';
import { allNotes, allProjects, url } from '../lib/site';
export const GET: APIRoute = async () => {
  const groups = await Promise.all([allNotes(), allProjects()]);
  const entries = groups.flatMap((group, index) => group.map(entry => ({
    title: entry.data.title,
    description: entry.data.description,
    tags: entry.data.tags,
    sample: entry.data.sample,
    kind: index === 0 ? '学习记录' : '项目展示',
    href: url(`${index === 0 ? 'notes' : 'projects'}/${entry.id}/`),
  })));
  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};