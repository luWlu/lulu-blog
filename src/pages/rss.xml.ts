import type { APIRoute } from 'astro';
import { allNotes, site, url } from '../lib/site';
const xml = (text: string) => text.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]!));
export const GET: APIRoute = async context => {
  const notes = (await allNotes()).filter(note => !note.data.sample);
  const home = new URL(url(), context.site).href;
  const items = notes.map(note => {
    const link = new URL(url(`notes/${note.id}/`), context.site).href;
    return `<item><title>${xml(note.data.title)}</title><link>${xml(link)}</link><guid>${xml(link)}</guid><description>${xml(note.data.description)}</description><pubDate>${note.data.date.toUTCString()}</pubDate></item>`;
  }).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(site.name)}</title><link>${xml(home)}</link><description>${xml(site.description)}</description><language>zh-cn</language>${items}</channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};