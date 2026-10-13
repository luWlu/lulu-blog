import type { APIRoute } from 'astro';
import { allNotes, allProjects, allExperiments, url } from '../lib/site';
type Searchable = { id: string; data: { title: string; description: string; tags: string[]; sample: boolean } };
export const GET: APIRoute = async () => {
  const [notes, projects, experiments] = await Promise.all([allNotes(), allProjects(), allExperiments()]);
  const from = (entries: Searchable[], kind: string, prefix: string) => entries.map(entry => ({
    title: entry.data.title,
    description: entry.data.description,
    tags: entry.data.tags,
    sample: entry.data.sample,
    kind,
    href: url(`${prefix}/${entry.id}/`),
  }));
  const entries = [
    ...from(notes, '学习记录', 'notes'),
    ...from(projects, '项目展示', 'projects'),
    ...from(experiments, '实验记录', 'experiments'),
  ];
  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
