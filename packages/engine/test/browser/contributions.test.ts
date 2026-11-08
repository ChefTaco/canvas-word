import { build } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';

it('retains the paragraph, padded-table and flow PR browser regressions on both backends', async () => {
  const built = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [cssInjectedByJsPlugin()],
    build: {
      write: false,
      lib: {
        entry: new URL('./contributions-entry.ts', import.meta.url).pathname,
        formats: ['es'],
      },
    },
  });
  const outputs = (Array.isArray(built) ? built : [built]).flatMap(result => {
    if (!('output' in result)) throw new Error('Unexpected browser build result');
    return result.output;
  });
  const chunks = outputs.filter(output => output.type === 'chunk');
  if (chunks.length !== 1) throw new Error('Expected a self-contained browser fixture');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://canvas-word.test/**', route => route.fulfill(
      new URL(route.request().url()).pathname === '/fixture.js'
        ? { contentType: 'text/javascript', body: chunks[0].code }
        : { contentType: 'text/html', body: '<div></div><script type="module">import { runContributionChecks } from "/fixture.js"; window.runContributionChecks=runContributionChecks;</script>' },
    ));
    await page.goto('http://canvas-word.test/');
    await page.waitForFunction(() => 'runContributionChecks' in window);
    const count = await page.evaluate(() => {
      const run = Reflect.get(window, 'runContributionChecks') as () => number;
      return run();
    });
    expect(count).toBeGreaterThan(150);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
