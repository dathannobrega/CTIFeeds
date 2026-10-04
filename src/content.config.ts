import { defineCollection, type SchemaContext } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { LANGS } from './i18n/config.ts';
import { TLP_LEVELS } from './lib/iocs/types.ts';

/**
 * Schema do frontmatter. Post com campo obrigatório faltando ou inválido
 * não compila (RF-01).
 */
const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const tag = z
  .string()
  .regex(kebab, 'tags devem ser kebab-case minúsculo, ex.: "cobalt-strike"');

const attackId = z
  .string()
  .regex(/^T\d{4}(?:\.\d{3})?$/, 'ID ATT&CK inválido, ex.: "T1110" ou "T1021.004"');

const basePost = ({ image }: SchemaContext) =>
  z.object({
    title: z.string().min(1).max(140),
    description: z.string().min(20).max(300),
    lang: z.enum(LANGS),
    /** Liga as versões EN e PT-BR do mesmo post (RF-03). */
    translationKey: z.string().regex(kebab),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(tag).default([]),
    attack: z.array(attackId).default([]),
    /** Só TLP:CLEAR é publicável; qualquer outro valor falha o build. */
    tlp: z
      .enum(TLP_LEVELS)
      .default('CLEAR')
      .refine((v) => v === 'CLEAR', 'Somente material TLP:CLEAR pode ser publicado no site'),
    draft: z.boolean().default(false),
    /** Use só ao republicar conteúdo que já existe em outro lugar (ex.: Medium). */
    canonicalUrl: z.url().optional(),
    image: image().optional(),
    imageAlt: z.string().min(1).optional(),
  });

function withImageAlt<T extends { image?: unknown; imageAlt?: string | undefined }>(
  data: T,
  ctx: z.RefinementCtx,
) {
  if (data.image && !data.imageAlt) {
    ctx.addIssue({ code: 'custom', path: ['imageAlt'], message: 'imageAlt é obrigatório quando há image' });
  }
}

const research = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/research' }),
  schema: ({ image }) =>
    basePost({ image })
      .extend({
        type: z.enum(['campaign', 'research']),
        /** ID do arquivo em data/campaigns/ (obrigatório para type: campaign). */
        campaign: z.string().regex(kebab).optional(),
      })
      .superRefine((data, ctx) => {
        withImageAlt(data, ctx);
        if (data.type === 'campaign' && !data.campaign) {
          ctx.addIssue({ code: 'custom', path: ['campaign'], message: 'post de campanha precisa do campo campaign' });
        }
        if (data.type === 'campaign' && data.attack.length === 0) {
          ctx.addIssue({ code: 'custom', path: ['attack'], message: 'post de campanha precisa do mapeamento ATT&CK' });
        }
      }),
});

const walkthroughs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/walkthroughs' }),
  schema: ({ image }) =>
    basePost({ image })
      .extend({
        /** Plataforma de treino (HTB, THM...). Confira as regras de publicação dela. */
        platform: z.string().optional(),
      })
      .superRefine(withImageAlt),
});

const notes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
  schema: ({ image }) => basePost({ image }).superRefine(withImageAlt),
});

/** Textos longos de páginas fixas (Sobre), editáveis em MDX. */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(20).max(300),
    lang: z.enum(LANGS),
  }),
});

export const collections = { research, walkthroughs, notes, pages };
