import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCampaign } from '../src/lib/iocs/campaigns.ts';
import { defang } from '../src/lib/iocs/defang.ts';
import {
  campaignCsv,
  campaignFiles,
  campaignStixBundle,
  checksumsFile,
  stableUuid,
  stixPattern,
  type ExportContext,
} from '../src/lib/iocs/export.ts';
import type { Campaign } from '../src/lib/iocs/types.ts';
import { isIsoDate, normaliseIoc } from '../src/lib/iocs/validate.ts';

const ctx: ExportContext = {
  siteUrl: 'https://www.datan.com.br',
  authorName: 'Test Author',
  published: new Date('2026-10-04T00:00:00Z'),
};

const validYaml = {
  id: 'test-campaign',
  title: 'Test, "quoted" campaign',
  tlp: 'CLEAR',
  first_seen: '2026-09-01',
  last_seen: '2026-09-28',
  source: 'lab',
  attack: ['T1110', { id: 'T1021.004', name: 'Remote Services: SSH' }],
  post: '/en/research/test/',
  iocs: [
    { type: 'ipv4', value: '203.0.113.10', confidence: 'high', first_seen: '2026-09-02' },
    { type: 'domain', value: 'Evil.Example.', confidence: 'medium', first_seen: '2026-09-03' },
    { type: 'url', value: "http://evil.example/a'b", confidence: 'low', first_seen: '2026-09-03' },
    { type: 'sha256', value: 'A'.repeat(64), confidence: 'high', first_seen: '2026-09-04', source: 'sandbox' },
  ],
};

function parse(overrides: Record<string, unknown> = {}): { campaign: Campaign | null; errors: string[] } {
  const errors: string[] = [];
  const campaign = parseCampaign({ ...validYaml, ...overrides }, 'test-campaign', errors);
  return { campaign, errors };
}

describe('normaliseIoc', () => {
  it('accepts and normalises valid values', () => {
    assert.deepEqual(normaliseIoc('ipv4', ' 198.51.100.7 '), { value: '198.51.100.7' });
    assert.deepEqual(normaliseIoc('domain', 'Sub.Example.COM.'), { value: 'sub.example.com' });
    assert.deepEqual(normaliseIoc('md5', 'D41D8CD98F00B204E9800998ECF8427E'), { value: 'd41d8cd98f00b204e9800998ecf8427e' });
    assert.deepEqual(normaliseIoc('ipv6', '2001:DB8::1'), { value: '2001:db8::1' });
    assert.deepEqual(normaliseIoc('email', 'Bad@Example.org'), { value: 'bad@example.org' });
    assert.ok(normaliseIoc('url', 'https://192.0.2.1:8443/x?y=1').value);
  });

  it('rejects malformed values', () => {
    for (const [type, value] of [
      ['ipv4', '256.1.1.1'],
      ['ipv4', '01.2.3.4'],
      ['domain', 'no-tld'],
      ['domain', '-bad.example'],
      ['url', 'javascript:alert(1)'],
      ['url', 'not a url'],
      ['sha1', 'abc'],
      ['sha256', 'g'.repeat(64)],
      ['email', 'nobody'],
    ] as const) {
      assert.ok(normaliseIoc(type, value).error, `${type} ${value} should fail`);
    }
  });

  it('rejects defanged values in data files', () => {
    assert.match(normaliseIoc('domain', 'evil[.]example').error ?? '', /defanged/);
    assert.match(normaliseIoc('url', 'hxxp://evil.example/').error ?? '', /defanged/);
  });
});

describe('isIsoDate', () => {
  it('validates calendar dates', () => {
    assert.ok(isIsoDate('2026-02-28'));
    assert.ok(!isIsoDate('2026-02-30'));
    assert.ok(!isIsoDate('2026-9-1'));
    assert.ok(!isIsoDate(20260901));
  });
});

describe('defang', () => {
  it('defangs hosts, schemes and e-mails but not hashes', () => {
    assert.equal(defang('203.0.113.10'), '203[.]0[.]113[.]10');
    assert.equal(defang('https://evil.example/path.php'), 'hxxps://evil[.]example/path.php');
    assert.equal(defang('HTTP://Evil.example'), 'HXXP://Evil[.]example');
    assert.equal(defang('bad@evil.example'), 'bad[@]evil[.]example');
    assert.equal(defang('a'.repeat(64), 'sha256'), 'a'.repeat(64));
  });
});

describe('parseCampaign', () => {
  it('parses a valid campaign and inherits the source', () => {
    const { campaign, errors } = parse();
    assert.deepEqual(errors, []);
    assert.equal(campaign?.iocs[1]?.value, 'evil.example');
    assert.equal(campaign?.iocs[0]?.source, 'lab');
    assert.equal(campaign?.iocs[3]?.source, 'sandbox');
    assert.deepEqual(campaign?.attack[0], { id: 'T1110' });
  });

  it('only accepts TLP:CLEAR', () => {
    assert.match(parse({ tlp: 'AMBER' }).errors.join(), /tlp deve ser CLEAR/);
  });

  it('flags duplicates, dates outside the campaign and unknown keys', () => {
    const iocs = [
      ...validYaml.iocs,
      { type: 'ipv4', value: '203.0.113.10', confidence: 'high', first_seen: '2026-09-02' },
      { type: 'ipv4', value: '192.0.2.1', confidence: 'high', first_seen: '2026-10-15' },
      { type: 'ipv4', value: '192.0.2.2', confidence: 'sure', first_seen: '2026-09-02', firstseen: 'x' },
    ];
    const text = parse({ iocs }).errors.join('\n');
    assert.match(text, /duplicado ipv4:203\.0\.113\.10/);
    assert.match(text, /fora do período/);
    assert.match(text, /confidence/);
    assert.match(text, /campo desconhecido "firstseen"/);
  });

  it('requires quoted values (YAML numbers lose data)', () => {
    const iocs = [{ type: 'md5', value: 0, confidence: 'low', first_seen: '2026-09-02' }];
    assert.match(parse({ iocs }).errors.join(), /entre aspas/);
  });

  it('requires id to match the file name and a valid post path', () => {
    assert.match(parse({ id: 'other' }).errors.join(), /nome do arquivo/);
    assert.match(parse({ post: '/en/unknown/x/' }).errors.join(), /caminho do post/);
  });
});

describe('exports', () => {
  const campaign = parse().campaign!;

  it('writes RFC 4180 CSV with the fixed column set', () => {
    const csv = campaignCsv({ ...campaign, iocs: [{ ...campaign.iocs[0]!, source: 'lab, "home"' }] }, ctx);
    const [header, row] = csv.trim().split('\n');
    assert.equal(header, 'type,value,first_seen,last_seen,confidence,tlp,campaign,post_url,source');
    assert.equal(
      row,
      'ipv4,203.0.113.10,2026-09-02,,high,TLP:CLEAR,test-campaign,https://www.datan.com.br/en/research/test/,"lab, ""home"""',
    );
  });

  it('builds STIX patterns with escaping', () => {
    assert.equal(stixPattern({ type: 'url', value: "http://x.example/a'b\\c" }), "[url:value = 'http://x.example/a\\'b\\\\c']");
    assert.equal(stixPattern({ type: 'sha256', value: 'ab' }), "[file:hashes.'SHA-256' = 'ab']");
  });

  it('produces a deterministic STIX bundle with UUIDv4-shaped ids', () => {
    const a = JSON.stringify(campaignStixBundle(campaign, ctx));
    const b = JSON.stringify(campaignStixBundle(campaign, ctx));
    assert.equal(a, b);
    const bundle = JSON.parse(a) as { objects: { type: string; id: string }[] };
    const types = bundle.objects.map((o) => o.type);
    assert.equal(types.filter((t) => t === 'indicator').length, 4);
    assert.equal(types.filter((t) => t === 'attack-pattern').length, 2);
    assert.equal(types.filter((t) => t === 'relationship').length, 6);
    for (const o of bundle.objects) {
      if (o.type !== 'marking-definition') {
        assert.match(o.id, /^[a-z-]+--[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      }
    }
    assert.notEqual(stableUuid('a'), stableUuid('b'));
  });

  it('lists every generated file in the checksum file', () => {
    const files = campaignFiles(campaign, ctx);
    assert.deepEqual(
      files.map((f) => f.path).sort(),
      ['test-campaign.csv', 'test-campaign.stix.json', 'test-campaign/domain.txt', 'test-campaign/ipv4.txt', 'test-campaign/sha256.txt', 'test-campaign/url.txt'],
    );
    const sums = checksumsFile(files).trim().split('\n');
    assert.equal(sums.length, files.length);
    assert.match(sums[0]!, /^[0-9a-f]{64} {2}test-campaign\.csv$/);
  });
});
