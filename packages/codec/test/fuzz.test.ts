// Seeded mutation fuzzing of the untrusted-input boundary. Every input either
// converts or is rejected with WordCodecError; anything else (TypeError, range
// errors, hangs) is a bug. FUZZ_ITERATIONS and FUZZ_SEED widen a local run.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as root from '../src/index.js';
import * as exchange from '../src/exchange/index.js';

const ITERATIONS = Number(process.env.FUZZ_ITERATIONS ?? 150);
const SEED = Number(process.env.FUZZ_SEED ?? 0x5eed);

// mulberry32: small deterministic PRNG so failures reproduce from the seed.
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number) => Math.floor(next() * max);
  return { next, int, pick: <T>(items: readonly T[]) => items[int(items.length)]! };
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const sha256 = createHash('sha256').update(png).digest('hex');
const at = '2026-01-01T00:00:00.000Z';
function corpusDocument(): root.WordDocument {
  return {
    schemaVersion: 1,
    blocks: [
      { type: 'paragraph', id: 'h', style: { heading: 1 }, runs: [{ id: 'h-r', text: 'Heading é 😀', style: { bold: true } }] },
      { type: 'paragraph', id: 'p', style: { list: 'bullet' }, runs: [
        { id: 'old', text: 'Removed ', style: { italic: true }, changeId: 'del' },
        { id: 'new', text: 'Added ', style: { underline: true }, changeId: 'ins' },
        { id: 'link', text: 'link', style: { hyperlink: 'https://example.com/' } },
        { id: 'img', text: '', style: {}, inlineImage: { assetId: 1, sha256, alt: 'Pixel', width: 12, height: 12 } },
      ] },
      { type: 'table', id: 't', widths: [120, 120], rows: [{ id: 'row', cells: [
        { id: 'c1', paragraphs: [{ type: 'paragraph', id: 'c1p', style: {}, runs: [{ id: 'c1r', text: 'Cell one', style: {} }] }] },
        { id: 'c2', paragraphs: [{ type: 'paragraph', id: 'c2p', style: {}, runs: [{ id: 'c2r', text: 'Cell two', style: {} }] }] },
      ] }] },
      { type: 'pageBreak', id: 'break' },
    ],
    changes: [
      { id: 'del', kind: 'deletion', authorName: 'Editor', createdAt: at, status: 'pending', targetRunIds: ['old'] },
      { id: 'ins', kind: 'insertion', authorName: 'Editor', createdAt: at, status: 'pending', targetRunIds: ['new'] },
    ],
    comments: [{ id: 'note', authorName: 'Reviewer', createdAt: at, text: 'Check', anchors: [{ blockId: 'h', runId: 'h-r', start: 0, end: 7, sourceText: 'Heading' }], resolved: false }],
    layout: root.defaultLayout(),
  } as root.WordDocument;
}

const fragments = ['<w:p>', '</w:p>', '<w:r>', '</w:r>', '<w:t>x</w:t>', '<w:t xml:space="preserve"> </w:t>', '<w:hyperlink r:id="rId999">', '</w:hyperlink>',
  '<w:ins w:id="7" w:author="A" w:date="bad">', '</w:ins>', '<w:del w:id="7">', '<w:delText>y</w:delText>', '<w:commentRangeStart w:id="0"/>', '<w:commentRangeEnd w:id="42"/>',
  '<w:rPr><w:b/><w:sz w:val="-4"/></w:rPr>', '<w:pPr><w:numPr><w:ilvl w:val="99"/><w:numId w:val="x"/></w:numPr></w:pPr>', '<w:tbl>', '<w:tr>', '<w:tc>', '</w:tc>',
  '<w:fldChar w:fldCharType="begin"/>', '<w:instrText>PAGE</w:instrText>', '<w:fldChar w:fldCharType="end"/>', '<w:br w:type="page"/>', '<w:sectPr/>', '<w:footnoteReference w:id="1"/>',
  '<w:drawing><wp:inline><a:blip r:embed="rId404"/></wp:inline></w:drawing>', '&amp;', '&#0;', '&#xD800;', '<!--c-->', '<?pi x?>', '<![CDATA[z]]>', '<x:unknown xmlns:x="urn:x"/>', '"', "'", '<', '>', '\u0000', '￿'];

function mutateText(text: string, rng: ReturnType<typeof random>): string {
  let value = text;
  for (let step = 1 + rng.int(4); step > 0; step--) {
    const position = rng.int(value.length + 1);
    switch (rng.int(5)) {
      case 0: value = value.slice(0, position) + rng.pick(fragments) + value.slice(position); break;
      case 1: value = value.slice(0, position) + value.slice(position + 1 + rng.int(64)); break;
      case 2: { const start = rng.int(value.length); const piece = value.slice(start, start + 1 + rng.int(200)); value = value.slice(0, position) + piece + value.slice(position); break; }
      case 3: value = value.replace(/w:val="[^"]*"/, () => `w:val="${rng.pick(['-1', '0', '99999999999', 'NaN', '', 'auto', '1e309'])}"`); break;
      default: value = value.replace(/Id="rId\d+"|r:id="rId\d+"|r:embed="rId\d+"/, (match) => match.replace(/\d+/, String(rng.int(20)))); break;
    }
  }
  return value;
}
function mutateBytes(bytes: Buffer, rng: ReturnType<typeof random>): Buffer {
  const copy = Buffer.from(bytes);
  switch (rng.int(3)) {
    case 0: for (let flips = 1 + rng.int(8); flips > 0; flips--) copy[rng.int(copy.length)] ^= 1 << rng.int(8); return copy;
    case 1: return copy.subarray(0, rng.int(copy.length));
    default: { const position = rng.int(copy.length); return Buffer.concat([copy.subarray(0, position), Buffer.from(Array.from({ length: 1 + rng.int(32) }, () => rng.int(256))), copy.subarray(position)]); }
  }
}

async function outcome(run: () => Promise<unknown>, input: string) {
  try { await run(); }
  catch (error) {
    if (!(error instanceof root.WordCodecError)) throw new Error(`${input}: ${error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error)}`);
  }
}

describe.each([['root', root], ['exchange', exchange]] as const)('%s API fuzzing', (name, api) => {
  it('XML part mutations only convert or raise WordCodecError', async () => {
    const assets = new Map([[1, { bytes: png, mediaType: 'image/png' as const }]]);
    const base = await api.validateDocxPackage(await api.exportDocx(corpusDocument() as never, 'retain-review', assets as never));
    const xmlParts = [...base.keys()].filter((part) => part.endsWith('.xml') || part.endsWith('.rels'));
    const rng = random(SEED ^ (name === 'root' ? 1 : 2));
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const files = new Map(base);
      const part = iteration % 3 === 0 ? 'word/document.xml' : rng.pick(xmlParts);
      files.set(part, Buffer.from(mutateText(files.get(part)!.toString(), rng)));
      const bytes = await api.createZipBuffer(Array.from(files, ([entry, content]) => ({ name: entry, content })));
      await outcome(() => api.importDocx(bytes), `seed ${SEED} iteration ${iteration} part ${part}`);
    }
  });

  it('ZIP byte mutations only convert or raise WordCodecError', async () => {
    const bytes = await api.exportDocx(corpusDocument() as never, 'final', new Map([[1, { bytes: png, mediaType: 'image/png' }]]) as never);
    const rng = random(SEED ^ (name === 'root' ? 3 : 4));
    for (let iteration = 0; iteration < ITERATIONS; iteration++)
      await outcome(() => api.importDocx(mutateBytes(bytes, rng)), `seed ${SEED} iteration ${iteration}`);
  });

  it('parseDocumentXml rejects malformed XML only with WordCodecError', async () => {
    const rng = random(SEED ^ (name === 'root' ? 5 : 6));
    for (let iteration = 0; iteration < ITERATIONS * 4; iteration++) {
      const text = Array.from({ length: 1 + rng.int(12) }, () => rng.pick(fragments)).join('');
      await outcome(async () => api.parseDocumentXml(Buffer.from(rng.int(2) ? `<w:document xmlns:w="urn:w">${text}</w:document>` : text)), `seed ${SEED} iteration ${iteration}`);
    }
  });
});
