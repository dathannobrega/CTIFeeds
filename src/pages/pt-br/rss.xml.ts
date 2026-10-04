import type { APIRoute } from 'astro';
import { rssFeed } from '../../lib/feeds.ts';

export const GET: APIRoute = () => rssFeed('pt-br');
