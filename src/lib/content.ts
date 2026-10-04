import { getCollection, type CollectionEntry } from 'astro:content';
import { isLang, type Lang } from '../i18n/config.ts';
import { POST_COLLECTIONS, postPath, type PostCollection } from '../i18n/routes.ts';

export type PostEntry =
  | CollectionEntry<'research'>
  | CollectionEntry<'walkthroughs'>
  | CollectionEntry<'notes'>;

export type PostKind = 'campaign' | 'research' | 'walkthrough' | 'note';

/**
 * Rascunhos (`draft: true`) ficam fora do build de produção (RF-09).
 * Em `astro dev`, ou com SHOW_DRAFTS=true (ex.: build de prévia), aparecem
 * com aviso e `noindex`.
 */
export const SHOW_DRAFTS = import.meta.env.DEV || process.env.SHOW_DRAFTS === 'true';

/** `en/meu-post` → `meu-post` */
export function slugOf(entry: PostEntry): string {
  return entry.id.split('/').slice(1).join('/');
}

/** Idioma vem da pasta e precisa bater com o frontmatter. */
export function langOf(entry: PostEntry): Lang {
  const folder = entry.id.split('/')[0];
  if (!isLang(folder) || folder !== entry.data.lang) {
    throw new Error(
      `${entry.collection}/${entry.id}: o arquivo deve ficar em src/content/${entry.collection}/${entry.data.lang}/ ` +
        `(lang no frontmatter: ${entry.data.lang})`,
    );
  }
  return folder;
}

export function kindOf(entry: PostEntry): PostKind {
  if (entry.collection === 'research') return entry.data.type;
  return entry.collection === 'walkthroughs' ? 'walkthrough' : 'note';
}

export function urlOf(entry: PostEntry): string {
  return postPath(entry.collection, langOf(entry), slugOf(entry));
}

function byDateDesc(a: PostEntry, b: PostEntry): number {
  return b.data.pubDate.getTime() - a.data.pubDate.getTime();
}

export async function getPosts(collection: PostCollection, lang?: Lang): Promise<PostEntry[]> {
  const entries = (await getCollection(collection)) as PostEntry[];
  return entries
    .filter((e) => (SHOW_DRAFTS || !e.data.draft) && (!lang || langOf(e) === lang))
    .sort(byDateDesc);
}

export async function getAllPosts(lang?: Lang): Promise<PostEntry[]> {
  const lists = await Promise.all(POST_COLLECTIONS.map((c) => getPosts(c, lang)));
  return lists.flat().sort(byDateDesc);
}

/** Versão do mesmo post no outro idioma (mesma translationKey), se publicada. */
export async function findTranslation(entry: PostEntry): Promise<PostEntry | undefined> {
  const lang = langOf(entry);
  const all = await getPosts(entry.collection);
  return all.find((e) => e.data.translationKey === entry.data.translationKey && langOf(e) !== lang);
}

/** Posts publicados só no outro idioma, para listar com aviso de idioma. */
export async function getUntranslated(collection: PostCollection | 'all', lang: Lang): Promise<PostEntry[]> {
  const all = collection === 'all' ? await getAllPosts() : await getPosts(collection);
  const keysHere = new Set(
    all.filter((e) => langOf(e) === lang).map((e) => `${e.collection}:${e.data.translationKey}`),
  );
  return all.filter((e) => langOf(e) !== lang && !keysHere.has(`${e.collection}:${e.data.translationKey}`));
}

export async function getPostPaths(collection: PostCollection, lang: Lang) {
  const posts = await getPosts(collection, lang);
  return posts.map((entry) => ({ params: { slug: slugOf(entry) }, props: { entry } }));
}

/** Tags e técnicas ATT&CK de um post, para as páginas de taxonomia (RF-08). */
export function tagsOf(entry: PostEntry): string[] {
  return [...entry.data.tags, ...entry.data.attack];
}
