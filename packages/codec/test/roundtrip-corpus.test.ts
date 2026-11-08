// Round-trip corpus of small synthetic documents built in code (no external fixtures).
// Each case is exported to DOCX, imported back, and compared on a projection that ignores
// identities (the importer assigns fresh IDs) and the resolved default font/size.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  CODEC_VERSION,
  defaultLayout,
  exportDocx,
  exportDocxSections,
  importDocx,
  paragraphsOf,
  validateDocument,
  validateDocxPackage,
  type DocumentBlock,
  type DocumentParagraph,
  type DocxAsset,
  type TextStyle,
  type WordDocument,
} from '../src/index.js';

let next = 0;
const id = (prefix: string) => `${prefix}-${++next}`;
const run = (text: string, style: TextStyle = {}) => ({ id: id('r'), text, style });
const paragraph = (
  runs: DocumentParagraph['runs'],
  style: DocumentParagraph['style'] = {},
): DocumentParagraph => ({ type: 'paragraph', id: id('p'), style, runs });
const document = (blocks: DocumentBlock[], extra: Partial<WordDocument> = {}): WordDocument => ({
  schemaVersion: 1,
  blocks,
  changes: [],
  comments: [],
  layout: defaultLayout(),
  ...extra,
});

/** Minimal valid 2x2 RGBA PNG, generated so no binary fixture is committed. */
function png(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const pixels = Buffer.from([0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Identity-free projection used to compare documents across a round trip. */
function project(source: WordDocument) {
  const { font, fontSize } = source.layout;
  const style = (value: TextStyle) => {
    const { font: runFont, size, ...rest } = value;
    return {
      ...rest,
      ...(runFont && runFont !== font ? { font: runFont } : {}),
      ...(size && size !== fontSize ? { size } : {}),
    };
  };
  const para = (block: DocumentParagraph) => ({
    style: block.style,
    runs: block.runs.map((item) => ({
      text: item.text,
      style: style(item.style),
      ...(item.inlineImage ? { image: item.inlineImage.sha256 } : {}),
    })),
  });
  const blocks = source.blocks.map((block) =>
    block.type === 'paragraph'
      ? para(block)
      : block.type === 'table'
        ? { table: block.widths.length, rows: block.rows.map((row) => row.cells.map((cell) => cell.paragraphs.map(para))) }
        : block.type === 'image'
          ? { image: block.sha256 }
          : { pageBreak: true },
  );
  const { header, footer, ...page } = source.layout;
  return { blocks, page, header: header.map(para), footer: footer.map(para) };
}

const image = png();
const imageSha = createHash('sha256').update(image).digest('hex');
const assets = new Map<number, DocxAsset>([[1, { bytes: image, mediaType: 'image/png' }]]);

const corpus: Array<[string, () => WordDocument]> = [
  [
    'headings, emphasis, colors and hyperlinks',
    () =>
      document([
        paragraph([run('Synthetic report title')], { heading: 1 }),
        paragraph([run('Section heading')], { heading: 2 }),
        paragraph([
          run('Plain, '),
          run('bold', { bold: true }),
          run(', '),
          run('italic', { italic: true }),
          run(', '),
          run('underlined', { underline: true }),
          run(', '),
          run('struck', { strikeout: true }),
          run(' and '),
          run('colored', { color: '#AA2244', highlight: '#FFFF00' }),
          run(' text with '),
          run('a link', { hyperlink: 'https://example.com/docs', underline: true, color: '#0000FF' }),
          run('.'),
        ]),
      ]),
  ],
  [
    'paragraph layout and lists',
    () =>
      document([
        paragraph([run('Centered')], { alignment: 'center' }),
        paragraph([run('Justified with spacing and indents')], {
          alignment: 'justify',
          before: 6,
          after: 12,
          indent: 24,
          firstLineIndent: 12,
          lineSpacing: 1.5,
          keepWithNext: true,
        }),
        paragraph([run('First bullet')], { list: 'bullet' }),
        paragraph([run('Second bullet')], { list: 'bullet' }),
        paragraph([run('First numbered')], { list: 'number' }),
        paragraph([run('Second numbered')], { list: 'number' }),
      ]),
  ],
  [
    'tables and page breaks',
    () =>
      document([
        paragraph([run('Before the table')]),
        {
          type: 'table',
          id: id('t'),
          widths: [120, 200],
          rows: [0, 1].map((row) => ({
            id: id('row'),
            cells: [0, 1].map((cell) => ({
              id: id('cell'),
              paragraphs: [paragraph([run(`Cell ${row}.${cell}`, cell ? { bold: true } : {})])],
            })),
          })),
        },
        { type: 'pageBreak', id: id('break') },
        paragraph([run('After the break')]),
      ]),
  ],
  [
    'Unicode text',
    () =>
      document([
        paragraph([run('Emoji 😀 and combining é and precomposed é')]),
        paragraph([run('CJK 文字 and Greek αβγ, tab\tinside')]),
        paragraph([run('Zero​width space stays literal')]),
      ]),
  ],
  [
    'inline images',
    () =>
      document([
        paragraph([
          run('Image: '),
          { id: id('r'), text: '', style: {}, inlineImage: { assetId: 1, sha256: imageSha, alt: 'Two by two pixels', width: 40, height: 40 } },
          run(' after.'),
        ]),
      ]),
  ],
];

describe('round-trip corpus', () => {
  it('reports the package version', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(CODEC_VERSION).toBe(manifest.version);
  });

  for (const [name, build] of corpus) {
    it(`${name}: export -> import preserves content and formatting`, async () => {
      const source = validateDocument(build());
      const bytes = await exportDocx(source, 'final', assets);
      await validateDocxPackage(bytes);
      const imported = await importDocx(bytes);
      const expected = project(source);
      const actual = project(imported.document);
      expect(actual.blocks).toEqual(expected.blocks);
      expect(actual.page).toEqual({ ...expected.page, preset: actual.page.preset });
      expect(actual.footer).toEqual([]);
      validateDocument(imported.document);
    });

    it(`${name}: a second round trip is a fixed point`, async () => {
      const first = (await importDocx(await exportDocx(build(), 'final', assets))).document;
      const again = (await importDocx(await exportDocx(first, 'final', assets))).document;
      expect(project(again)).toEqual(project(first));
      const third = (await importDocx(await exportDocx(again, 'final', assets))).document;
      expect(project(third)).toEqual(project(first));
    });
  }

  it('returns embedded image bytes with matching digests', async () => {
    const source = corpus.find(([name]) => name === 'inline images')![1]();
    const imported = await importDocx(await exportDocx(source, 'final', assets));
    expect(imported.assets).toHaveLength(1);
    const [asset] = imported.assets;
    expect(asset!.sha256).toBe(imageSha);
    expect(Buffer.from(asset!.bytesBase64, 'base64').equals(image)).toBe(true);
  });

  it('preserves tracked changes, comments and their anchors in retain-review mode', async () => {
    const deleted = run('old wording');
    const inserted = run('new wording');
    const commented = run('needs a source');
    const target = paragraph([run('Keep '), { ...deleted, changeId: 'change-del' }, { ...inserted, changeId: 'change-ins' }, run(' and '), commented]);
    const source = document([target], {
      changes: [
        { id: 'change-del', kind: 'deletion', authorName: 'Reviewer A', createdAt: '2026-01-02T03:04:05.000Z', status: 'pending', targetRunIds: [deleted.id] },
        { id: 'change-ins', kind: 'insertion', authorName: 'Reviewer B', createdAt: '2026-01-02T03:04:06.000Z', status: 'pending', targetRunIds: [inserted.id] },
      ],
      comments: [
        {
          id: 'comment-1',
          authorName: 'Reviewer A',
          createdAt: '2026-01-02T03:04:07.000Z',
          text: 'Please cite this.',
          anchors: [{ blockId: target.id, runId: commented.id, start: 0, end: commented.text.length, sourceText: commented.text }],
          resolved: false,
        },
      ],
    });
    const imported = (await importDocx(await exportDocx(source, 'retain-review'))).document;
    expect(imported.changes.map((change) => [change.kind, change.importedAuthor])).toEqual([
      ['deletion', 'Reviewer A'],
      ['insertion', 'Reviewer B'],
    ]);
    const [comment] = imported.comments;
    expect(comment).toMatchObject({ text: 'Please cite this.', importedAuthor: 'Reviewer A' });
    expect(comment!.anchors.map((anchor) => anchor.sourceText).join('')).toBe('needs a source');
    const runs = new Map(paragraphsOf(imported).flatMap((block) => block.runs.map((item) => [item.id, item.text])));
    expect(comment!.anchors.every((anchor) => runs.has(anchor.runId))).toBe(true);

    const final = (await importDocx(await exportDocx(source, 'final'))).document;
    expect(paragraphsOf(final).map((block) => block.runs.map((item) => item.text).join('')).join('')).toBe(
      'Keep new wording and needs a source',
    );
    const original = (await importDocx(await exportDocx(source, 'original'))).document;
    expect(paragraphsOf(original).map((block) => block.runs.map((item) => item.text).join('')).join('')).toBe(
      'Keep old wording and needs a source',
    );
  });

  it('round-trips page layout, header and footer stories', async () => {
    const source = document([paragraph([run('Body text')])]);
    source.layout = {
      ...source.layout,
      margins: [60, 70, 80, 90],
      font: 'Liberation Serif',
      fontSize: 14,
      header: [paragraph([run('Header line')], { alignment: 'right' })],
      footer: [paragraph([run('Footer line')])],
    };
    const imported = (await importDocx(await exportDocx(source, 'final'))).document;
    expect(imported.layout.margins).toEqual([60, 70, 80, 90]);
    expect(imported.layout.font).toBe('Liberation Serif');
    expect(imported.layout.fontSize).toBe(14);
    expect(imported.layout.header.map((block) => block.runs.map((item) => item.text).join(''))).toEqual(['Header line']);
    expect(imported.layout.footer.some((block) => block.runs.some((item) => item.text === 'Footer line'))).toBe(true);
  });

  it('header and footer stories do not grow across repeated round trips', async () => {
    for (const pageNumbers of [true, false]) {
      let current = document([paragraph([run('Body')])]);
      current.layout = { ...current.layout, pageNumbers, footer: [paragraph([run('Owned footer')])] };
      const shapes: string[] = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        current = (await importDocx(await exportDocx(current, 'final'))).document;
        expect(current.layout.pageNumbers).toBe(pageNumbers);
        shapes.push(JSON.stringify([project(current).header, project(current).footer]));
      }
      expect(new Set(shapes).size).toBe(1);
      expect(current.layout.footer.map((block) => block.runs.map((item) => item.text).join(''))).toContain('Owned footer');
    }
  });

  it('multi-section packages insert section titles unless suppressed', async () => {
    const section = (title: string, text: string, suppressTitle = false) => ({
      title,
      startsSection: true,
      suppressTitle,
      document: document([paragraph([run(text)])]),
    });
    const bytes = await exportDocxSections(
      { sections: [section('Generated title', 'First body'), section('Hidden title', 'Second body', true)], assets: new Map() },
      'final',
    );
    const imported = await importDocx(bytes);
    const text = paragraphsOf(imported.document).map((block) => block.runs.map((item) => item.text).join(''));
    expect(text).toContain('Generated title');
    expect(text).not.toContain('Hidden title');
    expect(text).toEqual(expect.arrayContaining(['First body', 'Second body']));
    expect(imported.sections).toHaveLength(2);
  });

  it('rejects invalid exchange documents before writing', async () => {
    const invalid = document([paragraph([run('x', { hyperlink: 'javascript:alert(1)' })])]);
    expect(() => validateDocument(invalid)).toThrow();
    await expect(exportDocx(invalid, 'final')).rejects.toThrow();
  });
});
