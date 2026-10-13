import type { APIRoute } from 'astro';
import { allNotes, allProjects, url } from '../lib/site';
export const GET: APIRoute = async context => {
  const paths = ['', 'notes/', 'projects/', 'about/'];
  for (const note of await allNotes()) if (!note.data.sample) paths.push(`notes/${note.id}/`);
  for (const project of await allProjects()) if (!project.data.sample) paths.push(`projects/${project.id}/`);
  const entries = paths.map(path => `<url><loc>${new URL(url(path), context.site).href.replaceAll('&', '&amp;')}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};