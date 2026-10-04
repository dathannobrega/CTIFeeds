import type { APIRoute } from 'astro';
import { jsonFeed } from '../../lib/feeds.ts';

export const GET: APIRoute = () => jsonFeed('en');
