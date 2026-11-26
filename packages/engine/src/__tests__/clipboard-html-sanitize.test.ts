// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getElementListByHTML, sanitizeClipboardHTML } from '../editor/utils/element';
import { ElementType } from '../editor/dataset/enum/Element';

// Inline handlers run in the DOM realm, so they report through the shared document.
const executed = (): string => document.title;
const resetExecuted = (): void => { document.title = ''; };

const HOSTILE_HTML = [
  '<p>before</p>',
  '<img src="https://example.com/x.png" width="10" height="10" onerror="document.title+=\'[img]\'">',
  '<svg onload="document.title+=\'[svg]\'"><a xlink:href="javascript:document.title+=\'[svg-a]\'"><text>t</text></a>',
  '<animate attributeName="href" to="javascript:document.title+=\'[animate]\'"/></svg>',
  '<a href="javascript:document.title+=\'[href]\'">link</a>',
  '<a href=" java\tscript:document.title+=\'[obfuscated]\'">second</a>',
  '<iframe srcdoc="<script>document.title+=\'[iframe]\'</script>"></iframe>',
  '<script>document.title+=\'[script]\'</script>',
  '<p onclick="document.title+=\'[click]\'">after</p>',
].join('');

// Fires every event an inline handler could be waiting for on the markup that
// was connected to the live document.
function fireEverything(root: ParentNode): void {
  for (const node of Array.from(root.querySelectorAll('*'))) {
    for (const type of ['error', 'load', 'click', 'mouseover', 'focus']) {
      node.dispatchEvent(new Event(type));
    }
  }
}

function captureClipboardRoot(): { root: () => ShadowRoot } {
  let captured: ShadowRoot | undefined;
  const original = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init: ShadowRootInit) {
    captured = original.call(this, init);
    return captured;
  });
  return {
    root: () => {
      if (!captured) throw new Error('getElementListByHTML did not attach a clipboard shadow root');
      return captured;
    },
  };
}

describe('clipboard HTML sanitization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetExecuted();
  });

  it('proves the environment runs inline handlers on unsanitized markup', () => {
    resetExecuted();
    const control = document.createElement('div');
    control.innerHTML = '<img onerror="document.title+=\'[control]\'">';
    document.body.append(control);
    fireEverything(control);
    control.remove();
    expect(executed()).toBe('[control]');
  });

  it('never runs handlers, scripts or javascript: links from pasted HTML without options', () => {
    resetExecuted();
    const clipboard = captureClipboardRoot();
    const elements = getElementListByHTML(HOSTILE_HTML, { innerWidth: 500 });
    const root = clipboard.root();
    fireEverything(root);
    expect(executed()).toBe('');
    expect(root.querySelector('script, iframe, animate')).toBeNull();
    for (const node of Array.from(root.querySelectorAll('*'))) {
      for (const attribute of Array.from(node.attributes)) {
        expect(attribute.name).not.toMatch(/^on/i);
        expect(attribute.value).not.toMatch(/script:/i);
      }
    }
    // jsdom has no innerText, so check the anchors themselves rather than the
    // hyperlink elements built from their text.
    const anchors = Array.from(root.querySelectorAll('a'));
    expect(anchors).toHaveLength(3);
    for (const anchor of anchors) {
      expect(anchor.getAttribute('href') ?? '').toBe('');
      expect(anchor.getAttribute('xlink:href') ?? '').toBe('');
    }
    for (const link of elements.filter(element => element.type === ElementType.HYPERLINK)) {
      expect(link.url ?? '').not.toMatch(/script:/i);
    }
    const text = elements.map(element => element.value).join('');
    expect(text).toContain('before');
    expect(text).toContain('after');
  });

  it('keeps ordinary image sources live unless the client restricts image sources', () => {
    const html = '<img src="https://example.com/a.png" srcset="https://example.com/b.png 2x" width="10" height="10" onerror="x()">';
    const open = document.createElement('div');
    open.append(sanitizeClipboardHTML(html));
    const openImage = open.querySelector('img')!;
    expect(openImage.getAttribute('src')).toBe('https://example.com/a.png');
    expect(openImage.hasAttribute('onerror')).toBe(false);

    const restricted = document.createElement('div');
    restricted.append(sanitizeClipboardHTML(html, { detachImageSources: true }));
    const restrictedImage = restricted.querySelector('img')!;
    expect(restrictedImage.hasAttribute('src')).toBe(false);
    expect(restrictedImage.hasAttribute('srcset')).toBe(false);
    expect(restrictedImage.getAttribute('data-canvas-image-source')).toBe('https://example.com/a.png');
  });

  it('sanitizes setHTML-style input with an image source policy the same way', () => {
    resetExecuted();
    const clipboard = captureClipboardRoot();
    getElementListByHTML(HOSTILE_HTML, { innerWidth: 500, imageSourceAllowed: () => true });
    fireEverything(clipboard.root());
    expect(executed()).toBe('');
  });
});
