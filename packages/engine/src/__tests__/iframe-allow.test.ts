// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BlockType } from '../editor/dataset/enum/Block';
import { ElementType } from '../editor/dataset/enum/Element';
import { IFrameBlock } from '../editor/core/draw/particle/block/modules/IFrameBlock';
import type { IRowElement } from '../editor/interface/Row';
import { createDomFromElementList } from '../editor/utils/element';
import { DEFAULT_IFRAME_ALLOW, resolveIframeAllow, serializeIframeAllow } from '../editor/utils/iframeSandbox';
import { mergeOption } from '../editor/utils/option';

const SRCDOC = '<!doctype html><html><body><p>embed</p></body></html>';

function iframeElement(iframeBlock: Record<string, unknown>): IRowElement {
  return {
    id: 'block-1',
    value: '',
    type: ElementType.BLOCK,
    block: { type: BlockType.IFRAME, iframeBlock },
  } as unknown as IRowElement;
}

describe('iframe block permissions policy', () => {
  it('delegates fullscreen only by default', () => {
    expect(DEFAULT_IFRAME_ALLOW).toEqual(['fullscreen']);
    expect(IFrameBlock.allow).toEqual(['fullscreen']);
    expect(mergeOption({}).iframeAllow).toEqual(['fullscreen']);
    expect(resolveIframeAllow(undefined, undefined)).toEqual(['fullscreen']);
    expect(resolveIframeAllow({}, { allow: undefined })).toEqual(['fullscreen']);
  });

  it('gives a document that asks for camera, microphone or geolocation nothing unless the host allows it', () => {
    const asks = { allow: ['camera', 'microphone', 'geolocation', 'fullscreen'] };
    expect(resolveIframeAllow({}, asks)).toEqual(['fullscreen']);
    expect(resolveIframeAllow({ iframeAllow: [] }, asks)).toEqual([]);
    expect(resolveIframeAllow({ iframeAllow: ['camera'] }, asks)).toEqual(['camera']);
    expect(resolveIframeAllow({ iframeAllow: ['camera', 'fullscreen'] }, { allow: ['camera'] })).toEqual(['camera']);
  });

  it('lets document data narrow but never widen the host list', () => {
    expect(resolveIframeAllow({ iframeAllow: ['fullscreen', 'camera'] }, { allow: [] })).toEqual([]);
    expect(resolveIframeAllow({ iframeAllow: ['fullscreen', 'camera'] }, { allow: ['fullscreen'] })).toEqual([
      'fullscreen',
    ]);
    expect(resolveIframeAllow({ iframeAllow: ['fullscreen', 'camera'] }, undefined)).toEqual(['fullscreen', 'camera']);
  });

  it('ignores malformed feature lists and policy syntax smuggled into entries', () => {
    // A string is not a list: no narrowing, and certainly no widening.
    expect(resolveIframeAllow({}, { allow: 'camera; microphone' as unknown as string[] })).toEqual(['fullscreen']);
    expect(
      resolveIframeAllow({ iframeAllow: ['fullscreen', 'camera'] }, {
        allow: ['fullscreen; camera', "camera 'none'", 7, ' FULLSCREEN '] as unknown as string[],
      }),
    ).toEqual(['fullscreen']);
    // A malformed host list falls back to the default; bad entries are dropped.
    expect(resolveIframeAllow({ iframeAllow: 'camera' as unknown as string[] }, undefined)).toEqual(['fullscreen']);
    expect(resolveIframeAllow({ iframeAllow: ['camera; geolocation', 'Camera'] }, { allow: ['camera'] })).toEqual([
      'camera',
    ]);
  });

  it('serializes features with the Permissions Policy separator', () => {
    expect(serializeIframeAllow(['fullscreen', 'camera'])).toBe('fullscreen; camera');
    expect(serializeIframeAllow([])).toBe('');
  });
});

describe('iframe block allow attribute', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function render(iframeBlock: Record<string, unknown>, options?: Record<string, unknown>) {
    const container = document.createElement('div');
    document.body.append(container);
    const block = new IFrameBlock(iframeElement(iframeBlock), options);
    block.render(container);
    return block.getIframe()!;
  }

  it('renders editor frames from the host allowlist only', () => {
    expect(render({ srcdoc: SRCDOC }).getAttribute('allow')).toBe('fullscreen');
    expect(render({ srcdoc: SRCDOC, allow: ['camera', 'microphone'] }).hasAttribute('allow')).toBe(false);
    expect(
      render({ srcdoc: SRCDOC, allow: ['camera', 'fullscreen'] }, { iframeAllow: ['fullscreen', 'camera'] }).getAttribute(
        'allow',
      ),
    ).toBe('camera; fullscreen');
    expect(render({ srcdoc: SRCDOC }, { iframeAllow: [] }).hasAttribute('allow')).toBe(false);
  });

  it('applies the same policy to exported HTML and the clipboard copy', () => {
    const html = (iframeBlock: Record<string, unknown>, options?: Record<string, unknown>) =>
      createDomFromElementList([iframeElement(iframeBlock)], options).querySelector('iframe')!;
    expect(html({ srcdoc: SRCDOC }).getAttribute('allow')).toBe('fullscreen');
    expect(html({ srcdoc: SRCDOC, allow: ['camera', 'fullscreen'] }).getAttribute('allow')).toBe('fullscreen');
    expect(html({ srcdoc: SRCDOC, allow: ['camera'] }, { iframeAllow: ['camera'] }).getAttribute('allow')).toBe('camera');
    expect(html({ srcdoc: SRCDOC, allow: ['geolocation'] }).hasAttribute('allow')).toBe(false);
  });
});
