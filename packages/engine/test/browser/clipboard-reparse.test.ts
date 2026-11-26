// HTML import of the built bundle in a real Chromium: markup that only becomes
// live when its serialization is parsed again must never run, whether it sits
// in a heading, a list item or a table cell. Run `npm run build` first.
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const origin = 'http://canvas-word.test';
const dist = new URL('../../dist/', import.meta.url);
const bundle = 'canvas-word-engine.js';
const page = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script type="module">
  import { getElementListByHTML } from '/${bundle}';
  window.canvasWord = { getElementListByHTML };
</script></body></html>`;

const handler = 'top.__reparsed=(top.__reparsed||0)+1';
const PAYLOADS = [
  `<math><mtext><table><mglyph><style><img src=x onerror=${handler}></style></mglyph></table></mtext></math>`,
  `<math><mtext><table><mglyph><xmp><img src=x onerror=${handler}></xmp></mglyph></table></mtext></math>`,
  `<math><mtext><table><mglyph><noembed><img src=x onerror=${handler}></noembed></mglyph></table></mtext></math>`,
  `<form><math><mtext></form><form><mglyph><style></math><img src=x onerror=${handler}></style></mglyph></form></mtext></math>`,
  `<math><mi><style><img src=x onerror=${handler}></style></mi></math>`,
  `<noscript><p title="</noscript><img src=x onerror=${handler}>"></noscript>`,
];
const WRAPPERS = [
  ...[1, 2, 3, 4, 5, 6].map((level) => `<h${level}>%</h${level}>`),
  '<ul><li>%</li></ul>',
  '<table><tr><td>%</td></tr></table>',
  '<table><tr><td><h2>%</h2></td></tr></table>',
  '%',
];

let browser: Browser;
let tab: Page;

beforeAll(async () => {
  if (!existsSync(new URL(bundle, dist))) throw new Error('Build the engine first (npm run build).');
  browser = await chromium.launch();
  tab = await browser.newPage();
  await tab.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: page });
    if (url.pathname === `/${bundle}`)
      return route.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL(bundle, dist), 'utf8') });
    return route.fulfill({ status: 404, body: '' });
  });
  await tab.goto(`${origin}/`);
  await tab.waitForFunction(() => 'canvasWord' in window);
});

afterAll(async () => {
  await browser?.close();
});

describe('HTML import against reparse (mutation) XSS in Chromium', () => {
  it('the payloads run when their inert parse is serialized and parsed in the live document', async () => {
    const fired = await tab.evaluate(async (payloads) => {
      (window as any).__reparsed = 0;
      for (const payload of payloads) {
        const template = document.createElement('template');
        template.innerHTML = `<h1>${payload}</h1>`;
        const live = document.createElement('div');
        live.innerHTML = (template.content.firstElementChild as HTMLElement).innerHTML;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      return (window as any).__reparsed;
    }, PAYLOADS);
    expect(fired).toBeGreaterThan(0);
  });

  it('never runs them through getElementListByHTML, with or without an image source policy', async () => {
    const result = await tab.evaluate(
      async ({ payloads, wrappers }) => {
        const { getElementListByHTML } = (window as any).canvasWord;
        (window as any).__reparsed = 0;
        let converted = 0;
        for (const wrapper of wrappers)
          for (const payload of payloads) {
            const html = `<p>before</p>${wrapper.replace('%', payload)}<p>after</p>`;
            converted += getElementListByHTML(html, { innerWidth: 500 }).length;
            converted += getElementListByHTML(html, { innerWidth: 500, imageSourceAllowed: () => true }).length;
          }
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { fired: (window as any).__reparsed, converted };
      },
      { payloads: PAYLOADS, wrappers: WRAPPERS },
    );
    expect(result.converted).toBeGreaterThan(0);
    expect(result.fired).toBe(0);
  });
});
