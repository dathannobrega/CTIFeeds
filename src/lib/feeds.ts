import rss from '@astrojs/rss';
import { HTML_LANG, LANG_NAME, type Lang } from '../i18n/config.ts';
import { routePath } from '../i18n/routes.ts';
import { t } from '../i18n/ui.ts';
import { SITE } from '../site.config.ts';
import { getAllPosts, urlOf } from './content.ts';

const abs = (path: string) => new URL(path, SITE.url).href;
const MAX_ITEMS = 50;

/** RSS 2.0 por idioma (RF-06), com <language> e atom:link self. */
export async function rssFeed(lang: Lang): Promise<Response> {
  const posts = (await getAllPosts(lang)).slice(0, MAX_ITEMS);
  return rss({
    title: `${SITE.author.name} — ${SITE.name} · ${LANG_NAME[lang]}`,
    description: t(lang, 'site.tagline'),
    site: abs(routePath('home', lang)),
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: [
      `<language>${HTML_LANG[lang]}</language>`,
      `<atom:link href="${abs(routePath('rss', lang))}" rel="self" type="application/rss+xml"/>`,
    ].join(''),
    items: posts.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.pubDate,
      link: abs(urlOf(entry)),
      categories: [...entry.data.tags, ...entry.data.attack],
    })),
  });
}

/** JSON Feed 1.1 por idioma (https://www.jsonfeed.org/version/1.1/). */
export async function jsonFeed(lang: Lang): Promise<Response> {
  const posts = (await getAllPosts(lang)).slice(0, MAX_ITEMS);
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${SITE.author.name} — ${SITE.name} · ${LANG_NAME[lang]}`,
    home_page_url: abs(routePath('home', lang)),
    feed_url: abs(routePath('jsonFeed', lang)),
    description: t(lang, 'site.tagline'),
    language: HTML_LANG[lang],
    authors: [{ name: SITE.author.name, url: abs(routePath('about', lang)) }],
    items: posts.map((entry) => ({
      id: abs(urlOf(entry)),
      url: abs(urlOf(entry)),
      title: entry.data.title,
      summary: entry.data.description,
      content_text: entry.data.description,
      date_published: entry.data.pubDate.toISOString(),
      ...(entry.data.updatedDate ? { date_modified: entry.data.updatedDate.toISOString() } : {}),
      tags: [...entry.data.tags, ...entry.data.attack],
    })),
  };
  return new Response(`${JSON.stringify(feed, null, 2)}\n`, {
    headers: { 'Content-Type': 'application/feed+json; charset=utf-8' },
  });
}
