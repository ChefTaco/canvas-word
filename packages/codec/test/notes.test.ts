// Footnotes and endnotes in the ./exchange model: import, export, section
// merging and validation. Documents are synthetic and built in code.
import { describe, expect, it } from 'vitest';
import {
  createZipBuffer, defaultLayout, exportDocx, exportDocxSections, importDocx, paragraphsOf, validateDocument, validateDocxPackage,
  type DocumentNote, type DocumentRun, type WordDocument,
} from '../src/exchange/index.js';

const at = '2026-01-01T00:00:00.000Z';
const footnote: DocumentNote = { kind: 'footnote', paragraphs: [
  { type: 'paragraph', id: 'fn-p1', style: {}, runs: [{ id: 'fn-r1', text: 'See the ', style: {} }, { id: 'fn-r2', text: 'harbour log', style: { italic: true } }, { id: 'fn-r3', text: ', 1887.', style: {} }] },
  { type: 'paragraph', id: 'fn-p2', style: {}, runs: [{ id: 'fn-r4', text: 'Second note paragraph.', style: { bold: true } }] },
] };
const endnote: DocumentNote = { kind: 'endnote', paragraphs: [{ type: 'paragraph', id: 'en-p1', style: {}, runs: [{ id: 'en-r1', text: 'An endnote.', style: {} }] }] };

function documentWithNotes(prefix = ''): WordDocument {
  return {
    schemaVersion: 1,
    blocks: [
      { type: 'paragraph', id: `${prefix}p1`, style: {}, runs: [
        { id: `${prefix}r1`, text: 'The keeper climbed the tower', style: {} },
        { id: `${prefix}ref1`, text: '', style: {}, note: structuredClone(footnote) },
        { id: `${prefix}r2`, text: ' at dusk.', style: {} },
      ] },
      { type: 'paragraph', id: `${prefix}p2`, style: {}, runs: [
        { id: `${prefix}r3`, text: 'Gulls argued', style: {} },
        { id: `${prefix}ref2`, text: '', style: {}, note: structuredClone(endnote) },
      ] },
    ],
    changes: [], comments: [], layout: defaultLayout(),
  } as WordDocument;
}
const notesOf = (document: WordDocument) => paragraphsOf(document, false).flatMap((paragraph) => paragraph.runs).filter((run): run is DocumentRun & { note: DocumentNote } => Boolean(run.note));
const shape = (note: DocumentNote) => ({ kind: note.kind, paragraphs: note.paragraphs.map((paragraph) => paragraph.runs.map((run) => [run.text, run.style])) });

describe('footnotes and endnotes', () => {
  it('round-trip through native Word parts', async () => {
    const bytes = await exportDocx(documentWithNotes(), 'final');
    const files = await validateDocxPackage(bytes);
    expect(files.get('word/footnotes.xml')!.toString()).toContain('w:type="separator"');
    expect(files.get('word/document.xml')!.toString()).toContain('<w:footnoteReference w:id="1"/>');
    expect(files.get('word/document.xml')!.toString()).toContain('<w:endnoteReference w:id="1"/>');
    expect(files.get('[Content_Types].xml')!.toString()).toContain('wordprocessingml.footnotes+xml');
    expect(files.get('word/settings.xml')!.toString()).toContain('<w:footnotePr><w:footnote w:id="-1"/>');
    expect(files.get('word/_rels/document.xml.rels')!.toString()).toMatch(/relationships\/endnotes" Target="endnotes.xml"/);
    const first = await importDocx(bytes);
    const imported = notesOf(first.document);
    expect(imported.map((run) => shape(run.note))).toEqual([shape(footnote), shape(endnote)]);
    expect(imported[0]!.style.verticalAlignment).toBe('superscript');
    expect(first.losses.map((loss) => loss.code)).not.toContain('footnoteReference');
    // Stable on a second cycle.
    const second = await importDocx(await exportDocx(first.document, 'final', undefined, undefined, first.styleDefinitions));
    expect(notesOf(second.document).map((run) => shape(run.note))).toEqual(imported.map((run) => shape(run.note)));
    expect(paragraphsOf(second.document, false)[0]!.runs.map((run) => run.text).join('')).toBe('The keeper climbed the tower at dusk.');
  });

  it('imports Word-shaped notes: note mark, separating space, links dropped with a loss', async () => {
    const files = await validateDocxPackage(await exportDocx(documentWithNotes(), 'final'));
    const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    files.set('word/footnotes.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:footnotes xmlns:w="${w}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>`
      + '<w:footnote w:id="1"><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Word note with </w:t></w:r><w:hyperlink r:id="rNoteLink"><w:r><w:t>a link</w:t></w:r></w:hyperlink></w:p></w:footnote></w:footnotes>'));
    files.set('word/_rels/footnotes.xml.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rNoteLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/" TargetMode="External"/></Relationships>'));
    const result = await importDocx(await createZipBuffer(Array.from(files, ([name, content]) => ({ name, content }))));
    const note = notesOf(result.document)[0]!.note;
    expect(note.paragraphs[0]!.runs.map((run) => run.text).join('')).toBe('Word note with a link');
    expect(note.paragraphs[0]!.runs.some((run) => run.style.hyperlink)).toBe(false);
    expect(note.paragraphs[0]!.style.list).toBeUndefined();
    expect(result.losses.map((loss) => loss.code)).toEqual(expect.arrayContaining(['NOTE_HYPERLINK']));
  });

  it('drops notes it cannot represent, with a loss, and keeps the document', async () => {
    const files = await validateDocxPackage(await exportDocx(documentWithNotes(), 'final'));
    files.set('word/footnotes.xml', Buffer.from(files.get('word/footnotes.xml')!.toString().replace('<w:t xml:space="preserve">See the </w:t>', '<w:t xml:space="preserve">See the </w:t></w:r><w:ins w:id="9" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:t>new</w:t></w:r></w:ins><w:r><w:t/>')));
    const result = await importDocx(await createZipBuffer(Array.from(files, ([name, content]) => ({ name, content }))));
    expect(notesOf(result.document).map((run) => run.note.kind)).toEqual(['endnote']);
    expect(result.losses.find((loss) => loss.code === 'NOTE_CONTENT_UNSUPPORTED')?.count).toBe(1);
    expect(paragraphsOf(result.document, false)[0]!.runs.map((run) => run.text).join('')).toBe('The keeper climbed the tower at dusk.');
  });

  it('merges and renumbers notes across sections', async () => {
    const bytes = await exportDocxSections({ sections: [
      { title: 'One', suppressTitle: true, document: documentWithNotes('a-') },
      { title: 'Two', suppressTitle: true, startsSection: true, document: documentWithNotes('b-') },
    ], assets: new Map() }, 'final');
    const files = await validateDocxPackage(bytes);
    const body = files.get('word/document.xml')!.toString();
    expect([...body.matchAll(/<w:footnoteReference w:id="(\d+)"\/>/g)].map((match) => match[1])).toEqual(['1', '2']);
    expect([...body.matchAll(/<w:endnoteReference w:id="(\d+)"\/>/g)].map((match) => match[1])).toEqual(['1', '2']);
    expect([...files.keys()].filter((name) => /notes\.xml$/.test(name)).sort()).toEqual(['word/endnotes.xml', 'word/footnotes.xml']);
    expect(files.get('word/settings.xml')!.toString()).toContain('<w:endnotePr>');
    const result = await importDocx(bytes);
    const all = result.sections.flatMap((section) => notesOf(section.document));
    expect(all.map((run) => run.note.kind)).toEqual(['footnote', 'endnote', 'footnote', 'endnote']);
    expect(shape(all[2]!.note)).toEqual(shape(footnote));
  });

  it('keeps a note whose reference is a tracked insertion', async () => {
    const document = documentWithNotes();
    const reference = document.blocks[0]!.type === 'paragraph' ? document.blocks[0]!.runs[1]! : undefined;
    reference!.changeId = 'added';
    document.changes.push({ id: 'added', kind: 'insertion', authorName: 'Editor', createdAt: at, status: 'pending', targetRunIds: [reference!.id] });
    const result = await importDocx(await exportDocx(document, 'retain-review'));
    const imported = notesOf(result.document)[0]!;
    expect(imported.changeId).toBeDefined();
    expect(result.document.changes.find((change) => change.id === imported.changeId)?.kind).toBe('insertion');
    // The original view leaves out the inserted reference and its note.
    const original = await validateDocxPackage(await exportDocx(document, 'original'));
    expect(original.has('word/footnotes.xml')).toBe(false);
  });

  it('validates note placement and content', () => {
    const valid = documentWithNotes();
    expect(() => validateDocument(valid)).not.toThrow();
    const cases: Array<(document: WordDocument) => void> = [
      (document) => { (document.blocks[0] as { runs: DocumentRun[] }).runs[1]!.text = 'x'; },
      (document) => { (document.blocks[0] as { runs: DocumentRun[] }).runs[1]!.note!.paragraphs[0]!.style.list = 'bullet'; },
      (document) => { (document.blocks[0] as { runs: DocumentRun[] }).runs[1]!.note!.paragraphs[0]!.runs[0]!.style.hyperlink = 'https://example.com/'; },
      (document) => { (document.blocks[0] as { runs: DocumentRun[] }).runs[1]!.note!.paragraphs[0]!.id = 'p2'; },
      (document) => { document.layout.header = [{ type: 'paragraph', id: 'h', style: {}, runs: [{ id: 'h-ref', text: '', style: {}, note: { kind: 'footnote', paragraphs: [{ type: 'paragraph', id: 'hn-p', style: {}, runs: [{ id: 'hn-r', text: 'Header note', style: {} }] }] } }] }]; },
    ];
    for (const [index, mutate] of cases.entries()) {
      const document = documentWithNotes();
      mutate(document);
      expect(() => validateDocument(document), `case ${index}`).toThrow(index === 4 ? /Headers and footers/ : undefined);
    }
  });
});
