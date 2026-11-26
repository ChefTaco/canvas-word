// Configurable XML limits on a synthetic book-length manuscript, plus the
// measureDocx preflight. The fixture is generated in code and shaped like Word
// output (paragraph and run properties, proofing marks) rather than this
// codec's own compact export.
import { describe, expect, it } from 'vitest';
import * as root from '../src/index.js';
import * as exchange from '../src/exchange/index.js';

const words = 'the lantern keeper climbed slowly toward a quiet harbour where gulls argued over nets and rope'.split(' ');
const PAGES = 300; const PARAGRAPHS_PER_PAGE = 20; const WORDS_PER_PARAGRAPH = 13;
const PARAGRAPHS = PAGES * PARAGRAPHS_PER_PAGE; // about 78,000 words, a dialogue-heavy novel

const runXml = (text: string, italic = false) =>
  `<w:r w:rsidRPr="00B2"><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/>${italic ? '<w:i/>' : ''}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
function manuscriptXml(): string {
  const paragraphs: string[] = [];
  for (let index = 0; index < PARAGRAPHS; index++) {
    const text = Array.from({ length: WORDS_PER_PARAGRAPH }, (_, offset) => words[(index + offset) % words.length]);
    paragraphs.push(`<w:p w:rsidR="00A1" w:rsidRDefault="00A1"><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/><w:ind w:firstLine="720"/><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="24"/></w:rPr></w:pPr>`
      + runXml(`${index + 1}. ${text.slice(0, 4).join(' ')} `) + '<w:proofErr w:type="spellStart"/>' + runXml(text.slice(4, 7).join(' ') + ' ', true) + '<w:proofErr w:type="spellEnd"/>'
      + runXml(text.slice(7, 10).join(' ') + ' ') + runXml(text.slice(10).join(' ') + '.') + '</w:p>');
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

let manuscript: Buffer | undefined;
async function book(): Promise<Buffer> {
  if (manuscript) return manuscript;
  const shell = await root.exportDocx({ schemaVersion: 1, blocks: [{ type: 'paragraph', id: 'p', style: {}, runs: [{ id: 'r', text: 'x', style: {} }] }], changes: [], comments: [], layout: root.defaultLayout() } as root.WordDocument, 'final');
  const files = await root.validateDocxPackage(shell);
  files.set('word/document.xml', Buffer.from(manuscriptXml()));
  manuscript = await root.createZipBuffer(Array.from(files, ([name, content]) => ({ name, content })));
  return manuscript;
}

describe.each([['root', root], ['exchange', exchange]] as const)('%s API', (_name, api) => {
  it('rejects a 300-page manuscript over the default node limit and imports it with raised limits', async () => {
    const bytes = await book();
    await expect(api.importDocx(bytes)).rejects.toMatchObject({ code: 'DOCUMENT_XML_LIMIT', details: { limit: 'maxNodes', maximum: 200_000 } });
    const result = await api.importDocx(bytes, { limits: { maxNodes: 400_000 } });
    const paragraphs = api.paragraphsOf(result.document as never, false);
    expect(paragraphs).toHaveLength(PARAGRAPHS);
    expect(paragraphs[0]!.runs.map((run) => run.text).join('')).toMatch(/^1\. the lantern keeper climbed /);
    expect(paragraphs.at(-1)!.runs.map((run) => run.text).join('')).toMatch(new RegExp(`^${PARAGRAPHS}\\. `));
    // The rebuilt package passes the codec's own post-export validation and re-imports.
    const exported = await api.exportDocx(result.document as never, 'final', undefined, undefined, result.styleDefinitions as never);
    expect(api.paragraphsOf((await api.importDocx(exported, { limits: { maxNodes: 400_000 } })).document as never, false)).toHaveLength(PARAGRAPHS);
  });

  it('lowers limits too and rejects out-of-range or unknown limits', async () => {
    const small = await api.exportDocx({ schemaVersion: 1, blocks: [{ type: 'paragraph', id: 'p', style: {}, runs: [{ id: 'r', text: 'Short', style: {} }] }], changes: [], comments: [], layout: api.defaultLayout() } as never, 'final');
    await expect(api.importDocx(small, { limits: { maxDepth: 2 } })).rejects.toMatchObject({ code: 'DOCUMENT_XML_LIMIT', details: { limit: 'maxDepth' } });
    await expect(api.importDocx(small, { limits: { maxBytes: 64 } })).rejects.toMatchObject({ code: 'DOCUMENT_XML_LIMIT' });
    for (const limits of [{ maxNodes: 0 }, { maxNodes: -1 }, { maxNodes: 1.5 }, { maxNodes: 1e9 }, { maxDepth: 4096 }, { maxBytes: 128 * 1024 * 1024 }, { nodes: 10 }, null])
      await expect(api.importDocx(small, { limits: limits as never })).rejects.toMatchObject({ code: 'INVALID_XML_LIMITS' });
    expect((await api.importDocx(small, { limits: {} })).document.blocks).toHaveLength(1);
  });
});

describe('measureDocx', () => {
  it('reports part sizes, node counts and the limits a manuscript exceeds without importing it', async () => {
    const bytes = await book();
    const measure = await exchange.measureDocx(bytes);
    const body = measure.parts.find((part) => part.name === 'word/document.xml')!;
    expect(body.xml!.nodes).toBeGreaterThan(200_000);
    expect(measure.totals.xmlNodes).toBeGreaterThanOrEqual(body.xml!.nodes);
    expect(measure.exceeded).toEqual([{ part: 'word/document.xml', limit: 'maxNodes', value: body.xml!.nodes, maximum: 200_000 }]);
    expect(measure.validation).toMatchObject({ ok: false, code: 'DOCUMENT_XML_LIMIT' });
    const raised = await root.measureDocx(bytes, { limits: { maxNodes: body.xml!.nodes } });
    expect(raised.exceeded).toEqual([]);
    expect(raised.validation).toEqual({ ok: true });
  });

  it('predicts feature losses and non-HTTP links the import would report', async () => {
    const shell = await exchange.exportDocx({ schemaVersion: 1, blocks: [{ type: 'paragraph', id: 'p', style: {}, runs: [{ id: 'r', text: 'Mail', style: { hyperlink: 'https://example.com/' } }] }], changes: [], comments: [], layout: exchange.defaultLayout() } as never, 'final');
    const files = await exchange.validateDocxPackage(shell);
    const rels = 'word/_rels/document.xml.rels';
    files.set(rels, Buffer.from(files.get(rels)!.toString().replace('Target="https://example.com/"', 'Target="mailto:user@example.com"')));
    files.set('word/document.xml', Buffer.from(files.get('word/document.xml')!.toString().replace('<w:body>', '<w:body><w:p><w:pPr><w:bidi w:val="0"/></w:pPr><w:r><w:t>Plain</w:t></w:r></w:p><w:sdt><w:sdtContent><w:p><w:pPr><w:bidi/></w:pPr><w:r><w:t>Field</w:t></w:r></w:p></w:sdtContent></w:sdt>')));
    const bytes = await exchange.createZipBuffer(Array.from(files, ([name, content]) => ({ name, content })));
    const measure = await exchange.measureDocx(bytes);
    const imported = await exchange.importDocx(bytes);
    const codes = (losses: Array<{ code: string; count: number }>) => Object.fromEntries(losses.filter((loss) => ['sdt', 'bidi', 'HYPERLINK_SCHEME_UNSUPPORTED'].includes(loss.code)).map((loss) => [loss.code, loss.count]));
    expect(codes(measure.losses)).toEqual({ sdt: 1, bidi: 1, HYPERLINK_SCHEME_UNSUPPORTED: 1 });
    expect(codes(imported.losses)).toEqual(codes(measure.losses));
    expect(measure.validation).toEqual({ ok: true });
  });

  it('still throws on unsafe archives', async () => {
    await expect(exchange.measureDocx(Buffer.from('not a zip'))).rejects.toMatchObject({ code: 'INVALID_DOCUMENT_PACKAGE' });
  });
});
