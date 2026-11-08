// Headless render smoke test of the built bundle. Uses an installed Chromium through
// Playwright; the bundle is served from dist/ through request interception, so no server
// or network access is needed. Run `npm run build` first.
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const origin = 'http://canvas-word.test';
const bundle = new URL('../../dist/canvas-word-engine.js', import.meta.url);
const page = `<!doctype html><html><head><meta charset="utf-8"></head>
<body><div id="editor" style="width: 820px"></div>
<script type="module">
  import Editor, { EditorMode, ElementType } from '/canvas-word-engine.js';
  window.canvasWord = { Editor, EditorMode, ElementType };
  window.dispatchEvent(new Event('canvas-word-ready'));
</script></body></html>`;

let browser: Browser;
let tab: Page;
const errors: string[] = [];

beforeAll(async () => {
  if (!existsSync(bundle)) throw new Error('Build the engine first (npm run build).');
  browser = await chromium.launch();
  tab = await browser.newPage();
  tab.on('pageerror', (error) => errors.push(error.message));
  tab.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await tab.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: page });
    if (url.pathname === '/canvas-word-engine.js')
      return route.fulfill({ contentType: 'text/javascript', body: readFileSync(bundle, 'utf8') });
    return route.fulfill({ status: 404, body: '' });
  });
  await tab.goto(`${origin}/`);
  await tab.waitForFunction(() => 'canvasWord' in window);
});

afterAll(async () => {
  await browser?.close();
});

describe('engine render smoke test', () => {
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

  it('raised no page or console errors', () => {
    expect(errors).toEqual([]);
  });
});
