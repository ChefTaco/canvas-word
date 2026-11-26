// Relationship policy shared by the root API and ./exchange: which external
// targets a package may carry, and how internal targets resolve to parts.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as root from '../src/index.js';
import * as exchange from '../src/exchange/index.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const sha256 = createHash('sha256').update(png).digest('hex');
const relsPart = 'word/_rels/document.xml.rels';

function linkedDocument(): root.WordDocument {
  return {
    schemaVersion: 1,
    blocks: [{
      type: 'paragraph', id: 'p', style: {},
      runs: [
        { id: 'web', text: 'Website', style: { hyperlink: 'https://example.com/' } },
        { id: 'gap', text: ' and ', style: {} },
        { id: 'mail', text: 'Email us', style: { hyperlink: 'https://example.com/contact' } },
        { id: 'image', text: '', style: {}, inlineImage: { assetId: 1, sha256, alt: 'Pixel', width: 12, height: 12 } },
      ],
    }],
    changes: [], comments: [], layout: root.defaultLayout(),
  } as root.WordDocument;
}

async function exported(): Promise<Map<string, Buffer>> {
  const bytes = await root.exportDocx(linkedDocument(), 'final', new Map([[1, { bytes: png, mediaType: 'image/png' }]]));
  return root.validateDocxPackage(bytes);
}
const repack = (files: Map<string, Buffer>) => root.createZipBuffer(Array.from(files, ([name, content]) => ({ name, content })));
const editRels = (files: Map<string, Buffer>, edit: (xml: string) => string) => {
  files.set(relsPart, Buffer.from(edit(files.get(relsPart)!.toString())));
  return files;
};
const runs = (document: root.WordDocument) => root.paragraphsOf(document, true).flatMap((paragraph) => paragraph.runs);

describe.each([['root', root], ['exchange', exchange]] as const)('%s API', (_name, api) => {
  it('keeps the text of a mailto: link, drops the link and reports a loss', async () => {
    const files = editRels(await exported(), (xml) => xml.replace('Target="https://example.com/contact"', 'Target="mailto:user@example.com"'));
    const result = await api.importDocx(await repack(files));
    const imported = runs(result.document as root.WordDocument);
    expect(imported.find((run) => run.text === 'Email us')?.style.hyperlink).toBeUndefined();
    expect(imported.find((run) => run.text === 'Website')?.style.hyperlink).toBe('https://example.com/');
    expect(result.losses.find((loss) => loss.code === 'HYPERLINK_SCHEME_UNSUPPORTED')?.count).toBe(1);
  });

  it('rejects external relationships that are not hyperlinks', async () => {
    const files = editRels(await exported(), (xml) => xml.replace('</Relationships>',
      '<Relationship Id="rTemplate" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="https://example.com/template.dotm" TargetMode="External"/></Relationships>'));
    await expect(api.importDocx(await repack(files))).rejects.toMatchObject({ code: 'UNSAFE_DOCUMENT_RELATIONSHIP' });
  });

  it('resolves percent-encoded relationship targets to their parts', async () => {
    const files = await exported();
    const media = [...files.keys()].find((name) => name.startsWith('word/media/'))!;
    const renamed = 'word/media/pixel image é.png';
    files.set(renamed, files.get(media)!); files.delete(media);
    editRels(files, (xml) => xml.replace(`Target="${media.slice('word/'.length)}"`, `Target="media/pixel%20image%20%C3%A9.png"`));
    const result = await api.importDocx(await repack(files));
    expect(runs(result.document as root.WordDocument).find((run) => run.inlineImage)?.inlineImage?.sha256).toBe(sha256);
    expect(result.assets[0]?.sha256).toBe(sha256);
  });

  it('still rejects missing, malformed and escaping internal targets', async () => {
    for (const target of ['media/missing.png', 'media/bad%zz.png', '%2E%2E/%2E%2E/%2E%2E/escape.png']) {
      const files = await exported();
      const media = [...files.keys()].find((name) => name.startsWith('word/media/'))!;
      editRels(files, (xml) => xml.replace(`Target="${media.slice('word/'.length)}"`, `Target="${target}"`));
      await expect(api.validateDocxPackage(await repack(files))).rejects.toMatchObject({ code: 'INVALID_DOCX_RELATIONSHIP' });
    }
  });
});

it('the root and exchange entry points share one error class', () => {
  expect(root.WordCodecError).toBe(exchange.WordCodecError);
});
