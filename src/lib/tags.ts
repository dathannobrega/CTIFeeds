import { LANGS, type Lang } from '../i18n/config.ts';
import { tagPath, tagSlug } from '../i18n/routes.ts';
import { getAllPosts, type PostEntry } from './content.ts';

const ATTACK = /^T\d{4}/;

export interface TagCount {
  tag: string;
  count: number;
}

/** Tags por idioma: cada página de tag lista só posts daquele idioma (RF-08). */
export async function postsByTag(lang: Lang): Promise<Map<string, { tag: string; posts: PostEntry[] }>> {
  const map = new Map<string, { tag: string; posts: PostEntry[] }>();
  for (const entry of await getAllPosts(lang)) {
    for (const tag of [...entry.data.tags, ...entry.data.attack]) {
      const slug = tagSlug(tag);
      const item = map.get(slug) ?? { tag, posts: [] };
      item.posts.push(entry);
      map.set(slug, item);
    }
  }
  return map;
}

export async function collectTags(lang: Lang): Promise<{ topics: TagCount[]; attack: TagCount[] }> {
  const counts = [...(await postsByTag(lang)).values()].map(({ tag, posts }) => ({ tag, count: posts.length }));
  const sort = (a: TagCount, b: TagCount) => b.count - a.count || a.tag.localeCompare(b.tag);
  return {
    topics: counts.filter((c) => !ATTACK.test(c.tag)).sort(sort),
    attack: counts.filter((c) => ATTACK.test(c.tag)).sort((a, b) => a.tag.localeCompare(b.tag)),
  };
}

export async function getTagPaths(lang: Lang) {
  return [...(await postsByTag(lang)).entries()].map(([slug, { tag, posts }]) => ({
    params: { tag: slug },
    props: { tag, posts },
  }));
}

/** hreflang só quando a mesma tag existe nos dois idiomas. */
export async function tagAlternates(tag: string): Promise<{ lang: Lang; path: string }[]> {
  const slug = tagSlug(tag);
  const result: { lang: Lang; path: string }[] = [];
  for (const lang of LANGS) {
    if ((await postsByTag(lang)).has(slug)) result.push({ lang, path: tagPath(lang, tag) });
  }
  return result;
}
