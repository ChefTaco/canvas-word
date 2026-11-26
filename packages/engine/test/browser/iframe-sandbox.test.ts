// Iframe blocks from document data in a real Chromium: by default their script
// runs in an opaque origin and cannot reach the host page, in the editor and in
// the print copy. Only the explicit unsafe opt-in restores the old sandbox.
// Run `npm run build` first.
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const origin = 'http://canvas-word.test';
const dist = new URL('../../dist/', import.meta.url);
const bundle = 'canvas-word-engine.js';
const page = `<!doctype html><html><head><meta charset="utf-8"></head>
<body><div id="editor" style="width: 820px"></div>
<script type="module">
  import Editor, { ElementType } from '/${bundle}';
  window.hostSecret = 'host-only';
  window.probes = [];
  window.addEventListener('message', (event) => {
    if (event.data && event.data.probe) window.probes.push(event.data.probe);
  });
  window.canvasWord = { Editor, ElementType };
</script></body></html>`;

// Reports to the host whether it could read or write the host page.
const PROBE = `<!doctype html><html><body><p>embedded</p><script>
  var result = { ran: true };
  try { result.secret = top.hostSecret; top.leaked = (top.leaked || 0) + 1; result.reached = true; }
  catch (error) { result.blocked = error.name; }
  try { result.storage = typeof localStorage.length; } catch (error) { result.storageBlocked = error.name; }
  var policy = document.permissionsPolicy || document.featurePolicy;
  if (policy) result.features = ['camera', 'microphone', 'geolocation', 'fullscreen'].filter(function (f) { return policy.allowsFeature(f); });
  top.postMessage({ probe: result }, '*');
</script></body></html>`;

let browser: Browser;
let tab: Page;
const errors: string[] = [];

beforeAll(async () => {
  if (!existsSync(new URL(bundle, dist))) throw new Error('Build the engine first (npm run build).');
  browser = await chromium.launch();
  tab = await browser.newPage();
  tab.on('pageerror', (error) => errors.push(error.message));
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

type Probe = { ran?: boolean; reached?: boolean; secret?: string; blocked?: string; storageBlocked?: string; features?: string[] };
type Run = { sandbox: (string | null)[]; allow: (string | null)[]; probes: Probe[]; leaked: number; printSandbox?: (string | null)[]; printMs?: number };

async function run(
  sandbox: string[] | undefined,
  options: Record<string, unknown>,
  withPrint = false,
  allow?: string[],
): Promise<Run> {
  return tab.evaluate(
    async ({ probe, sandbox, options, withPrint, allow }) => {
      const w = window as any;
      const { Editor, ElementType } = w.canvasWord;
      w.probes = [];
      w.leaked = 0;
      const container = document.getElementById('editor') as HTMLDivElement;
      const iframeBlock: Record<string, unknown> = { srcdoc: probe };
      if (sandbox) iframeBlock.sandbox = sandbox;
      if (allow) iframeBlock.allow = allow;
      const editor = new Editor(
        container,
        [{ type: ElementType.BLOCK, value: '', width: 300, height: 120, block: { type: 'iframe', iframeBlock } }, { value: '\n' }],
        options,
      );
      const waitFor = async (count: number) => {
        for (let i = 0; i < 100 && w.probes.length < count; i++) await new Promise((resolve) => setTimeout(resolve, 50));
      };
      await waitFor(1);
      const result: any = {
        sandbox: [...container.querySelectorAll('iframe')].map((frame) => frame.getAttribute('sandbox')),
        allow: [...container.querySelectorAll('iframe')].map((frame) => frame.getAttribute('allow')),
      };
      if (withPrint) {
        const before = new Set(document.body.querySelectorAll(':scope > iframe'));
        const started = performance.now();
        await editor.command.executePrint();
        result.printMs = performance.now() - started;
        const printFrame = [...document.body.querySelectorAll(':scope > iframe')].find((frame) => !before.has(frame)) as HTMLIFrameElement;
        result.printSandbox = [...printFrame.contentDocument!.querySelectorAll('iframe')].map((frame) => frame.getAttribute('sandbox'));
        await waitFor(2);
        printFrame.remove();
      }
      editor.destroy();
      result.probes = w.probes;
      result.leaked = w.leaked;
      return result;
    },
    { probe: PROBE, sandbox, options, withPrint, allow },
  );
}

describe('iframe block sandbox in Chromium', () => {
  it('default iframe blocks run script but cannot reach the host page, in the editor or the print copy', async () => {
    const result = await run(undefined, {}, true);
    expect(result.sandbox).toEqual(['allow-scripts']);
    expect(result.printSandbox).toEqual(['allow-scripts']);
    expect(result.probes).toHaveLength(2);
    for (const probe of result.probes) {
      expect(probe).toMatchObject({ ran: true, blocked: 'SecurityError', storageBlocked: 'SecurityError' });
      expect(probe.reached).toBeUndefined();
      expect(probe.secret).toBeUndefined();
    }
    expect(result.leaked).toBe(0);
    // The print copy reported its load through the sandbox instead of timing out.
    expect(result.printMs).toBeLessThan(8000);
  });

  it('document data cannot combine allow-scripts with allow-same-origin', async () => {
    const result = await run(['allow-scripts', 'allow-same-origin'], {});
    expect(result.sandbox).toEqual(['allow-scripts']);
    expect(result.probes[0]).toMatchObject({ ran: true, blocked: 'SecurityError' });
    expect(result.leaked).toBe(0);
  });

  it('unsafeIframeAllowSameOrigin restores the old attribute and its host access', async () => {
    const result = await run(undefined, { unsafeIframeAllowSameOrigin: true });
    expect(result.sandbox).toEqual(['allow-scripts allow-same-origin']);
    expect(result.probes[0]).toMatchObject({ ran: true, reached: true, secret: 'host-only' });
    expect(result.leaked).toBe(1);
  });

  it('a document asking for camera, microphone or geolocation gets none of them', async () => {
    const result = await run(undefined, {}, false, ['camera', 'microphone', 'geolocation', 'fullscreen']);
    expect(result.allow).toEqual(['fullscreen']);
    expect(result.probes[0].features).toEqual(['fullscreen']);
  });

  it('only features in the host iframeAllow list reach the frame', async () => {
    const result = await run(undefined, { iframeAllow: ['camera', 'fullscreen'] }, false, ['camera', 'microphone']);
    expect(result.allow).toEqual(['camera']);
    expect(result.probes[0].features).toEqual(['camera']);
    const none = await run(undefined, { iframeAllow: [] }, false, ['camera']);
    expect(none.allow).toEqual([null]);
    expect(none.probes[0].features).toEqual([]);
  });

  it('raised no page errors', () => {
    expect(errors).toEqual([]);
  });
});
