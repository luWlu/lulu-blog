import type { APIRoute } from 'astro';
import { url } from '../lib/site';
export const GET: APIRoute = context => new Response(`User-agent: *\nAllow: /\nSitemap: ${new URL(url('sitemap.xml'), context.site).href}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });