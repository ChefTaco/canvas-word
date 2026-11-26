// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockType } from '../editor/dataset/enum/Block';
import { ElementType } from '../editor/dataset/enum/Element';
import { IFrameBlock } from '../editor/core/draw/particle/block/modules/IFrameBlock';
import type { IRowElement } from '../editor/interface/Row';
import { createDomFromElementList } from '../editor/utils/element';
import {
  DEFAULT_IFRAME_SANDBOX,
  resolveIframeSandbox,
  UNSAFE_LEGACY_IFRAME_SANDBOX,
} from '../editor/utils/iframeSandbox';
import { mergeOption } from '../editor/utils/option';
import { print } from '../editor/utils/print';

const SRCDOC = '<!doctype html><html><body><p>chart</p></body></html>';
const UNSAFE = { unsafeIframeAllowSameOrigin: true };

function iframeElement(iframeBlock: Record<string, unknown>): IRowElement {
  return {
    id: 'block-1',
    value: '',
    type: ElementType.BLOCK,
    block: { type: BlockType.IFRAME, iframeBlock },
  } as unknown as IRowElement;
}

describe('iframe block sandbox policy', () => {
  it('defaults to scripts in an opaque origin', () => {
    expect(DEFAULT_IFRAME_SANDBOX).toEqual(['allow-scripts']);
    expect(IFrameBlock.sandbox).toEqual(['allow-scripts']);
    expect(mergeOption({}).unsafeIframeAllowSameOrigin).toBe(false);
    expect(resolveIframeSandbox(undefined, undefined)).toEqual(['allow-scripts']);
    expect(resolveIframeSandbox({}, { sandbox: undefined })).toEqual(['allow-scripts']);
  });

  it('never lets document data combine allow-scripts with allow-same-origin', () => {
    expect(resolveIframeSandbox({}, { sandbox: ['allow-scripts', 'allow-same-origin', 'allow-forms'] })).toEqual([
      'allow-scripts',
      'allow-forms',
    ]);
    expect(resolveIframeSandbox({}, { sandbox: ['ALLOW-SAME-ORIGIN', ' allow-scripts '] })).toEqual(['allow-scripts']);
    // Without scripts the frame cannot act on its origin, so the token is kept.
    expect(resolveIframeSandbox({}, { sandbox: ['allow-same-origin'] })).toEqual(['allow-same-origin']);
    // An empty list is the strictest sandbox, not "no sandbox".
    expect(resolveIframeSandbox({}, { sandbox: [] })).toEqual([]);
  });

  it('ignores malformed sandbox values from document data', () => {
    expect(
      resolveIframeSandbox({}, { sandbox: 'allow-scripts allow-same-origin' as unknown as string[] }),
    ).toEqual(['allow-scripts']);
    expect(
      resolveIframeSandbox({}, { sandbox: ['allow-scripts', 7, 'allow same-origin', 'allow-scripts'] as unknown as string[] }),
    ).toEqual(['allow-scripts']);
  });

  it('restores the previous attribute only when the host opts in', () => {
    expect(UNSAFE_LEGACY_IFRAME_SANDBOX).toEqual(['allow-scripts', 'allow-same-origin']);
    expect(resolveIframeSandbox(UNSAFE, undefined)).toEqual(['allow-scripts', 'allow-same-origin']);
    expect(resolveIframeSandbox(UNSAFE, { sandbox: ['allow-scripts', 'allow-same-origin'] })).toEqual([
      'allow-scripts',
      'allow-same-origin',
    ]);
    expect(resolveIframeSandbox({ unsafeIframeAllowSameOrigin: 'yes' as unknown as boolean }, undefined)).toEqual([
      'allow-scripts',
    ]);
  });
});

describe('iframe block rendering', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders editor frames with the safe sandbox, or the old one when opted in', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const element = iframeElement({ srcdoc: SRCDOC, sandbox: ['allow-scripts', 'allow-same-origin'] });

    const safe = new IFrameBlock(element);
    safe.render(container);
    expect(safe.getIframe()!.getAttribute('sandbox')).toBe('allow-scripts');

    const legacy = new IFrameBlock(iframeElement({ srcdoc: SRCDOC }), UNSAFE);
    legacy.render(container);
    expect(legacy.getIframe()!.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
  });

  it('sandboxes iframes in exported HTML and the clipboard copy', () => {
    const html = (options?: Record<string, unknown>) =>
      createDomFromElementList(
        [iframeElement({ srcdoc: SRCDOC, sandbox: ['allow-scripts', 'allow-same-origin'] })],
        options,
      ).querySelector('iframe')!;
    expect(html().getAttribute('sandbox')).toBe('allow-scripts');
    expect(createDomFromElementList([iframeElement({ srcdoc: SRCDOC, sandbox: [] })]).querySelector('iframe')!.hasAttribute('sandbox')).toBe(true);
    expect(html(UNSAFE).getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
  });

  it('sandboxes print copies of iframe blocks', async () => {
    const printPromise = print(['data:image/png;base64,page'], {
      width: 794,
      height: 1123,
      iframeInfoList: [
        [
          { x: 0, y: 0, width: 100, height: 100, srcdoc: SRCDOC },
          { x: 0, y: 0, width: 100, height: 100, src: 'https://example.com/embed', sandbox: [] },
          { x: 0, y: 0, width: 100, height: 100, srcdoc: SRCDOC, sandbox: ['allow-scripts', 'allow-same-origin'] },
        ],
      ],
    });
    const printFrame = document.body.querySelector('iframe')!;
    const printWindow = printFrame.contentWindow!;
    printWindow.print = vi.fn();
    const frames = [...printWindow.document.querySelectorAll('iframe')];
    expect(frames.map((frame) => frame.getAttribute('sandbox'))).toEqual([
      'allow-scripts',
      '',
      'allow-scripts allow-same-origin',
    ]);
    // The load signal reaches the print document from the framed content.
    for (const frame of frames.filter((candidate) => candidate.srcdoc)) {
      expect(frame.srcdoc).toContain('window.parent.postMessage');
      printWindow.dispatchEvent(
        new MessageEvent('message', { data: { type: '__LOADED_TO_CANVAS_EDITOR__' }, source: frame.contentWindow }),
      );
    }
    printWindow.document.querySelector('img')!.dispatchEvent(new Event('load'));
    await printPromise;
    await new Promise((resolve) => setTimeout(resolve));
    expect(printWindow.print).toHaveBeenCalledOnce();
  });
});
