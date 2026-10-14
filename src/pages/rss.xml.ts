import type { APIRoute } from 'astro';
import { allNotes, allProjects, allExperiments, site, url } from '../lib/site';
const xml = (text: string) => text.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]!));
export const GET: APIRoute = async context => {
  const notes = (await allNotes()).filter(note => !note.data.sample).map(note => ({ title: note.data.title, description: note.data.description, date: note.data.date, path: `notes/${note.id}/` }));
  const experiments = (await allExperiments()).filter(experiment => !experiment.data.sample).map(experiment => ({ title: experiment.data.title, description: experiment.data.description, date: experiment.data.date, path: `experiments/${experiment.id}/` }));
  const projects = (await allProjects()).filter(project => !project.data.sample).map(project => ({ title: project.data.title, description: project.data.description, date: project.data.date, path: `projects/${project.id}/` }));
  const feed = [...notes, ...experiments, ...projects].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 30);
  const home = new URL(url(), context.site).href;
  const items = feed.map(entry => {
    const link = new URL(url(entry.path), context.site).href;
    return `<item><title>${xml(entry.title)}</title><link>${xml(link)}</link><guid>${xml(link)}</guid><description>${xml(entry.description)}</description><pubDate>${entry.date.toUTCString()}</pubDate></item>`;
  }).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(site.name)}</title><link>${xml(home)}</link><description>${xml(site.description)}</description><language>zh-CN</language>${items}</channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
