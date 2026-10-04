import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePostPath, postPath, tagSlug } from '../src/i18n/routes.ts';
import { proseLines } from '../scripts/lib/files.ts';
import { compileTerm, findTerms, parseList } from '../scripts/lib/forbidden.ts';
import { imageMetadata } from '../scripts/lib/image-metadata.ts';

describe('routes', () => {
  it('round-trips localized post paths', () => {
    assert.equal(postPath('research', 'pt-br', 'abc'), '/pt-br/pesquisa/abc/');
    assert.deepEqual(parsePostPath('/pt-br/pesquisa/abc/'), { collection: 'research', lang: 'pt-br', slug: 'abc' });
    assert.deepEqual(parsePostPath('/en/notes/x-1/'), { collection: 'notes', lang: 'en', slug: 'x-1' });
    assert.equal(parsePostPath('/en/about/'), null);
  });

  it('makes URL-safe tag slugs', () => {
    assert.equal(tagSlug('T1021.004'), 't1021-004');
    assert.equal(tagSlug('Detecção'), 'deteccao');
  });
});

describe('forbidden terms', () => {
  const compiled = ['Acme Corp', 'TLP:AMBER'].map((term) => ({ term, re: compileTerm(term) }));

  it('matches whole words ignoring case and accents', () => {
    assert.deepEqual(findTerms('worked at ACME corp.', compiled), ['Acme Corp']);
    assert.deepEqual(findTerms('marked tlp:amber+strict', compiled), ['TLP:AMBER']);
    assert.deepEqual(findTerms('acmecorporation', compiled), []);
  });

  it('parses lists with comments; commas only split env values', () => {
    assert.deepEqual(parseList('# a, b\nfoo\n\nbar, baz'), ['foo', 'bar, baz']);
    assert.deepEqual(parseList('foo, bar\nbaz', { commas: true }), ['foo', 'bar', 'baz']);
  });
});

describe('proseLines', () => {
  it('skips fenced code blocks', () => {
    const lines = proseLines('## A\n```\n## not a heading\n```\n## B').map((l) => l.text);
    assert.deepEqual(lines, ['## A', '## B']);
  });
});

describe('imageMetadata', () => {
  const jpeg = (segment: Buffer) =>
    Buffer.concat([Buffer.from([0xff, 0xd8]), segment, Buffer.from([0xff, 0xda, 0x00, 0x02, 0xff, 0xd9])]);
  const app1 = (payload: Buffer) => {
    const header = Buffer.from([0xff, 0xe1, 0, 0]);
    header.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([header, payload]);
  };

  it('detects EXIF and XMP in JPEG', () => {
    assert.deepEqual(imageMetadata('a.jpg', jpeg(app1(Buffer.from('Exif\0\0rest', 'binary')))), ['EXIF']);
    assert.deepEqual(imageMetadata('a.jpg', jpeg(app1(Buffer.from('http://ns.adobe.com/xap/1.0/\0<x/>')))), ['XMP']);
  });

  it('passes a clean JPEG and flags unknown formats', () => {
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x07, 0x4a, 0x46, 0x49, 0x46, 0x00]);
    assert.deepEqual(imageMetadata('a.jpg', jpeg(app0)), []);
    assert.deepEqual(imageMetadata('a.heic', Buffer.from('....ftypheic')), ['unsupported-format']);
  });

  it('detects eXIf chunks in PNG', () => {
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
    };
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const png = Buffer.concat([sig, chunk('IHDR', Buffer.alloc(13)), chunk('eXIf', Buffer.from('MM')), chunk('IEND', Buffer.alloc(0))]);
    assert.deepEqual(imageMetadata('a.png', png), ['EXIF']);
  });
});
