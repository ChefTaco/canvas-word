// Headless render smoke test of the built bundle. Uses an installed Chromium through
// Playwright; the bundle is served from dist/ through request interception, so no server
// or network access is needed. Run `npm run build` first. The readable and the minified
// bundle run the same checks; `./testing` must use the main bundle instance, and the main
// entry no longer exports its hooks.
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const origin = 'http://canvas-word.test';
const dist = new URL('../../dist/', import.meta.url);
const bundles = ['canvas-word-engine.js', 'canvas-word-engine.min.js'] as const;
const page = (bundle: string) => `<!doctype html><html><head><meta charset="utf-8"></head>
<body><div id="editor" style="width: 820px"></div>
<script type="module">
  import * as main from '/${bundle}';
  const { default: Editor, EditorMode, ElementType } = main;
  // Patching a ./testing class must reach the editor the main bundle creates.
  let sharedTesting = true;
  if (${bundle === 'canvas-word-engine.js'}) {
    const { Draw } = await import('/testing.js');
    const compute = Draw.prototype.computeRowList;
    let calls = 0;
    Draw.prototype.computeRowList = function (...args) { calls++; return compute.apply(this, args); };
    const probe = document.createElement('div');
    document.body.append(probe);
    new Editor(probe, [{ value: 'probe' }]).destroy();
    probe.remove();
    Draw.prototype.computeRowList = compute;
    sharedTesting = calls > 0;
  }
  const hooks = ['Draw', 'Previewer', 'HyperlinkParticle', 'mergeOption'];
  window.canvasWord = { Editor, EditorMode, ElementType, sharedTesting, mainHooks: hooks.filter((name) => name in main) };
  window.dispatchEvent(new Event('canvas-word-ready'));
</script></body></html>`;

let browser: Browser;
let tab: Page;
const errors: string[] = [];

async function open(bundle: string) {
  await tab?.close();
  tab = await browser.newPage();
  tab.on('pageerror', (error) => errors.push(error.message));
  tab.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await tab.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: page(bundle) });
    const file = url.pathname.slice(1);
    if ([...bundles, 'testing.js'].includes(file))
      return route.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL(file, dist), 'utf8') });
    return route.fulfill({ status: 404, body: '' });
  });
  await tab.goto(`${origin}/`);
  await tab.waitForFunction(() => 'canvasWord' in window);
}

beforeAll(async () => {
  for (const bundle of [...bundles, 'testing.js'])
    if (!existsSync(new URL(bundle, dist))) throw new Error('Build the engine first (npm run build).');
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

describe.each(bundles)('engine render smoke test (%s)', (bundle) => {
  beforeAll(async () => {
    errors.length = 0;
    await open(bundle);
  });

  it('serves ./testing from the main bundle instance', async () => {
    expect(await tab.evaluate(() => (window as any).canvasWord.sharedTesting)).toBe(true);
  });

  it('no longer exports the diagnostic hooks from the main entry', async () => {
    expect(await tab.evaluate(() => (window as any).canvasWord.mainHooks)).toEqual([]);
  });

  it('renders paginated canvas pages with visible content in read-only mode', async () => {
    const result = await tab.evaluate(async () => {
      const { Editor, EditorMode } = (window as any).canvasWord;
      const container = document.getElementById('editor') as HTMLDivElement;
      const main = [
        { id: 'run-1', externalId: 'run-1', value: 'Canvas word smoke test ', extension: { paragraphId: 'p1' } },
        { id: 'run-2', externalId: 'run-2', value: 'bold text', bold: true, extension: { paragraphId: 'p1' } },
        { id: 'p1-mark', value: '\n', extension: { paragraphId: 'p1' } },
        ...Array.from({ length: 60 }, (_, index) => ({
          id: `run-${index + 3}`,
          externalId: `run-${index + 3}`,
          value: `Paragraph ${index} with enough words to wrap across the page width 😀 é.\n`,
          extension: { paragraphId: `p${index + 2}` },
        })),
      ];
      const editor = new Editor(container, main, { mode: EditorMode.READONLY });
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50)));
      const canvases = [...container.querySelectorAll('canvas')];
      const inked = canvases.map((canvas) => {
        const context = canvas.getContext('2d')!;
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let dark = 0;
        for (let index = 0; index < data.length; index += 4)
          if (data[index + 3]! > 0 && data[index]! < 128 && data[index + 1]! < 128 && data[index + 2]! < 128) dark++;
        return dark;
      });
      const saved = editor.command.getValue({ extraPickAttrs: ['id'] }).data.main;
      editor.destroy();
      return { pages: canvases.length, inked, saved };
    });
    expect(result.pages).toBeGreaterThanOrEqual(2);
    expect(result.inked[0]).toBeGreaterThan(500);
    expect(result.saved.find((element: { id?: string }) => element.id === 'run-2')).toMatchObject({
      value: 'bold text',
      bold: true,
      externalId: 'run-2',
    });
  });

  it('keeps element IDs stable across getValue -> new Editor -> getValue', async () => {
    const result = await tab.evaluate(async () => {
      const { Editor } = (window as any).canvasWord;
      const container = document.getElementById('editor') as HTMLDivElement;
      const main = [
        { id: 'a', externalId: 'a', value: 'First run, ', extension: { paragraphId: 'p1' } },
        { id: 'b', externalId: 'b', value: 'second run', italic: true, extension: { paragraphId: 'p1' } },
        { id: 'p1-mark', value: '\n', extension: { paragraphId: 'p1' } },
        { id: 'c', externalId: 'c', value: 'Another paragraph', extension: { paragraphId: 'p2' } },
      ];
      const first = new Editor(container, main);
      const once = first.command.getValue({ extraPickAttrs: ['id'] }).data;
      first.destroy();
      const second = new Editor(container, once);
      const twice = second.command.getValue({ extraPickAttrs: ['id'] }).data;
      second.destroy();
      return { once: once.main, twice: twice.main };
    });
    expect(result.twice).toEqual(result.once);
    const ids = result.once.map((element: { id?: string }) => element.id);
    expect(ids).toEqual(expect.arrayContaining(['a', 'b', 'p1-mark', 'c']));
  });

  it('mirrors headings, paragraphs, lists and tables off-screen and marks the caret paragraph', async () => {
    const result = await tab.evaluate(async () => {
      const { Editor, ElementType } = (window as any).canvasWord;
      const container = document.getElementById('editor') as HTMLDivElement;
      const main = [
        { type: ElementType.TITLE, level: 'first', valueList: [{ value: 'Chapter One' }] },
        { value: '\nThe keeper climbed the tower.' },
        { value: '\nGulls argued over nets.' },
        { type: ElementType.LIST, listType: 'ol', valueList: [{ value: 'first step\nsecond step' }] },
        { type: ElementType.TABLE, value: '', colgroup: [{ width: 200 }, { width: 200 }], trList: [{ height: 40, tdList: [
          { colspan: 1, rowspan: 1, value: [{ value: 'Cell A' }] }, { colspan: 1, rowspan: 1, value: [{ value: 'Cell B' }] },
        ] }] },
      ];
      const editor = new Editor(container, main, { locale: 'en', accessibility: { disabled: false, textMirror: true } });
      const wait = () => new Promise((resolve) => setTimeout(resolve, 150));
      await wait();
      const mirror = container.querySelector('[role="document"]')!;
      const outline = [...mirror.children].map((child) => child.tagName.toLowerCase() + ':' + (child.tagName === 'OL' ? [...child.children].map((item) => item.textContent).join('|') : child.tagName === 'TABLE' ? [...child.querySelectorAll('td')].map((cell) => cell.textContent).join('|') : child.textContent));
      // Put the caret inside the first body paragraph.
      editor.command.executeSetRange(14, 14);
      await wait();
      const current = mirror.querySelector('[aria-current="true"]')?.textContent;
      editor.command.executeInsertElementList([{ value: ' Added' }]);
      await wait();
      const updated = mirror.textContent;
      const hidden = getComputedStyle(mirror.parentElement!).clip;
      editor.destroy();
      return { outline, current, updated, hidden, label: mirror.getAttribute('aria-label') };
    });
    expect(result.outline).toEqual(['h1:Chapter One', 'p:The keeper climbed the tower.', 'p:Gulls argued over nets.', 'ol:first step|second step', 'table:Cell A|Cell B']);
    expect(result.current).toBe('The keeper climbed the tower.');
    expect(result.updated).toContain('Added');
    expect(result.label).toBe('Document text');
    expect(result.hidden).toBe('rect(0px, 0px, 0px, 0px)');
  });

  it('raised no page or console errors', () => {
    expect(errors).toEqual([]);
  });
});
