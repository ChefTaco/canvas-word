// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDomFromElementList, getElementListByHTML, sanitizeClipboardHTML } from '../editor/utils/element';
import { writeClipboardItem } from '../editor/utils/clipboard';
import { ElementType } from '../editor/dataset/enum/Element';
import { TitleLevel } from '../editor/dataset/enum/Title';
import { ListType } from '../editor/dataset/enum/List';

// Markup that is inert as parsed but changes shape when its serialization is
// parsed again (foreign content, raw-text elements, mis-nested forms). Each
// hides an image with an inline handler that only appears after a reparse.
const handler = "document.title+='[x]'";
const REPARSE_PAYLOADS = [
  `<math><mtext><table><mglyph><style><img src=x onerror="${handler}"></style></mglyph></table></mtext></math>`,
  `<math><mtext><table><mglyph><xmp><img src=x onerror="${handler}"></xmp></mglyph></table></mtext></math>`,
  `<math><mtext><table><mglyph><noembed><img src=x onerror="${handler}"></noembed></mglyph></table></mtext></math>`,
  `<math><mtext><table><mglyph><noframes><img src=x onerror="${handler}"></noframes></mglyph></table></mtext></math>`,
  `<math><mtext><table><mglyph><title><img src=x onerror="${handler}"></title></mglyph></table></mtext></math>`,
  `<form><math><mtext></form><form><mglyph><style></math><img src onerror="${handler}"></style></mglyph></form></mtext></math>`,
  `<svg></p><style><a id="</style><img src=1 onerror=${handler}>"></style></svg>`,
  `<math><mi><style><img src=x onerror="${handler}"></style></mi></math>`,
  `<noscript><p title="</noscript><img src=x onerror=${handler}>"></noscript>`,
  `<template><img src=x onerror="${handler}"></template>`,
];

// Places a payload inside every structure the HTML import converts by
// recursing: headings, list items and table cells.
const WRAPPERS: Array<[string, (payload: string) => string]> = [
  ...[1, 2, 3, 4, 5, 6].map(level => [`h${level}`, (p: string) => `<h${level}>${p}</h${level}>`] as [string, (p: string) => string]),
  ['li', p => `<ul><li>${p}</li></ul>`],
  ['nested li', p => `<ol><li>a<ul><li>${p}</li></ul></li></ol>`],
  ['td', p => `<table><tr><td>${p}</td></tr></table>`],
  ['th', p => `<table><tr><th>${p}</th></tr></table>`],
  ['h1 in td', p => `<table><tr><td><h1>${p}</h1></td></tr></table>`],
  ['top level', p => p],
];

const OPTIONS = [
  ['default', { innerWidth: 500 }],
  ['restricted image sources', { innerWidth: 500, imageSourceAllowed: () => true }],
] as const;

const executed = (): string => document.title;

function fireEverything(root: ParentNode): void {
  for (const node of Array.from(root.querySelectorAll('*'))) {
    for (const type of ['error', 'load', 'click', 'mouseover', 'focus']) {
      node.dispatchEvent(new Event(type));
    }
  }
}

function handlerAttributes(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('*')).flatMap(node =>
    Array.from(node.attributes)
      .filter(attribute => /^on/i.test(attribute.name))
      .map(attribute => `${node.nodeName}[${attribute.name}]`)
  );
}

// Records every HTML string parse on a node of the live document. Template
// elements parse into their inert content, so they are allowed.
function watchLiveParsing() {
  const liveParses: string[] = [];
  const record = (target: unknown, how: string) => {
    if (target instanceof HTMLTemplateElement) return;
    liveParses.push(`${how} on ${(target as Node).nodeName}`);
  };
  const innerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!;
  vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(function (this: Element, value: string) {
    record(this, 'innerHTML');
    innerHTML.set!.call(this, value);
  });
  const outerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML')!;
  vi.spyOn(Element.prototype, 'outerHTML', 'set').mockImplementation(function (this: Element, value: string) {
    record(this, 'outerHTML');
    outerHTML.set!.call(this, value);
  });
  const insertAdjacentHTML = Element.prototype.insertAdjacentHTML;
  vi.spyOn(Element.prototype, 'insertAdjacentHTML').mockImplementation(function (this: Element, position, text) {
    record(this, 'insertAdjacentHTML');
    insertAdjacentHTML.call(this, position, text);
  });
  const createContextualFragment = Range.prototype.createContextualFragment;
  vi.spyOn(Range.prototype, 'createContextualFragment').mockImplementation(function (this: Range, text) {
    record(this, 'createContextualFragment');
    return createContextualFragment.call(this, text);
  });
  return liveParses;
}

function captureShadowRoots(): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  const original = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init: ShadowRootInit) {
    const root = original.call(this, init);
    roots.push(root);
    return root;
  });
  return roots;
}

describe('clipboard HTML import never reparses sanitized markup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.title = '';
  });

  describe.each(OPTIONS)('%s', (_label, options) => {
    it.each(WRAPPERS)('keeps reparse payloads inert inside %s', (_name, wrap) => {
      for (const payload of REPARSE_PAYLOADS) {
        const liveParses = watchLiveParsing();
        const roots = captureShadowRoots();
        getElementListByHTML(`<p>before</p>${wrap(payload)}<p>after</p>`, options);
        vi.restoreAllMocks();
        expect(liveParses, payload).toEqual([]);
        expect(roots.length, payload).toBeGreaterThan(0);
        for (const root of roots) {
          expect(handlerAttributes(root), payload).toEqual([]);
          expect(root.querySelector('math, svg, style style, xmp, noembed, noframes, noscript, template'), payload).toBeNull();
          fireEverything(root);
        }
        expect(executed(), payload).toBe('');
      }
    });
  });

  it('builds copy markup without parsing HTML strings in the live document', () => {
    const liveParses = watchLiveParsing();
    const text = (value: string) => ({ value });
    const dom = createDomFromElementList([
      { type: ElementType.TITLE, value: '', level: TitleLevel.FIRST, valueList: [text('<img src=x onerror=1>')] },
      { type: ElementType.LIST, value: '', listType: ListType.UL, valueList: [text('\n'), text('item')] },
      {
        type: ElementType.TABLE, value: '\n', colgroup: [{ width: 100 }],
        trList: [{ height: 20, tdList: [{ colspan: 1, rowspan: 1, value: [text('cell')] }] }],
      },
      { type: ElementType.CONTROL, value: '', control: { type: 'text', value: [text('control')] } },
    ] as never);
    vi.restoreAllMocks();
    expect(liveParses).toEqual([]);
    // jsdom has no innerText, so check the structure rather than the text.
    expect(dom.querySelector('img')).toBeNull();
    expect(dom.querySelector('h1 > span')).not.toBeNull();
    expect(dom.querySelector('ul > li > span')).not.toBeNull();
    expect(dom.querySelector('table > tbody > tr > td > span')).not.toBeNull();
  });

  it('parses copied HTML inertly in the clipboard fallback', async () => {
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    const liveParses = watchLiveParsing();
    await writeClipboardItem('text', `<h1><p>copied</p>${REPARSE_PAYLOADS[0]}</h1>`, []);
    vi.restoreAllMocks();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(liveParses).toEqual([]);
    expect(executed()).toBe('');
  });

  it('keeps ordinary heading, list and table content', () => {
    const elements = getElementListByHTML(
      '<h2>Heading <b>bold</b></h2><ul><li>item <i>one</i></li></ul><table><tr><td>cell</td></tr></table>',
      { innerWidth: 500 }
    );
    const text = JSON.stringify(elements);
    for (const value of ['Heading ', 'bold', 'item ', 'one', 'cell']) {
      expect(text).toContain(`"${value}"`);
    }
  });

  it('keeps a pasted stylesheet but drops foreign and raw-text content', () => {
    const holder = document.createElement('div');
    holder.append(sanitizeClipboardHTML(
      '<style>.c{font-weight:bold}</style><p class="c">kept</p><svg><text>svg</text></svg><math><mi>x</mi></math><xmp>raw</xmp>'
    ));
    expect(holder.querySelector('style')?.textContent).toBe('.c{font-weight:bold}');
    expect(holder.querySelector('p')?.textContent).toBe('kept');
    expect(holder.querySelector('svg, math, xmp')).toBeNull();
  });
});

// Deterministic generator of hostile, often malformed markup built from the
// pieces mutation XSS relies on.
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAGS = [
  'math', 'mtext', 'mi', 'mo', 'mglyph', 'malignmark', 'annotation-xml', 'svg', 'foreignObject', 'desc', 'title',
  'style', 'xmp', 'noembed', 'noframes', 'noscript', 'iframe', 'textarea', 'plaintext', 'template', 'select',
  'option', 'table', 'tr', 'td', 'form', 'p', 'h1', 'h3', 'ul', 'li', 'a', 'b', 'div', 'span', 'img',
];
const ATTRIBUTES = [
  '', ' id="x"', ` onerror="${handler}"`, ' src=x', ' href="javascript:void(0)"', ' title="</style><img src=x onerror=1>"',
  ' encoding="text/html"', ' style="color:red"', ' srcdoc="<img src=x onerror=1>"',
];

function randomMarkup(random: () => number, depth = 0): string {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  let html = '';
  const parts = 1 + Math.floor(random() * 3);
  for (let i = 0; i < parts; i++) {
    const roll = random();
    if (roll < 0.15) {
      html += pick(['text', '&lt;img&gt;', '<img src=x onerror=1>', '<!-- c -->', '<!--', '-->', '</', '<', '"', "'"]);
    } else if (roll < 0.3) {
      html += `</${pick(TAGS)}>`;
    } else {
      const tag = pick(TAGS);
      const inner = depth < 4 ? randomMarkup(random, depth + 1) : '';
      html += `<${tag}${pick(ATTRIBUTES)}>${inner}${random() < 0.7 ? `</${tag}>` : ''}`;
    }
  }
  return html;
}

function serialize(fragment: DocumentFragment): string {
  const template = document.createElement('template');
  template.content.append(fragment.cloneNode(true));
  return template.innerHTML;
}

// Parses markup without running anything: a document without a browsing
// context never loads resources or runs handlers.
let inert: Document | undefined;
function parseInert(html: string, wrap: (inner: string) => string): Element {
  inert ??= document.implementation.createHTMLDocument('');
  inert.body.innerHTML = wrap(html);
  return inert.body;
}

describe('sanitizeClipboardHTML is a fixed point under serialize and reparse', () => {
  const iterations = Number(process.env.FUZZ_ITERATIONS ?? 300);
  const seed = Number(process.env.FUZZ_SEED ?? 0x5eed);

  it.each(OPTIONS)('%s', (_label, options) => {
    const detach = { detachImageSources: 'imageSourceAllowed' in options };
    const random = createRandom(seed);
    for (let i = 0; i < iterations; i++) {
      const input = randomMarkup(random);
      const once = serialize(sanitizeClipboardHTML(input, detach));
      const twice = serialize(sanitizeClipboardHTML(once, detach));
      expect(twice, input).toBe(once);
      for (const [, wrap] of WRAPPERS) {
        const reparsed = parseInert(once, wrap);
        expect(handlerAttributes(reparsed), input).toEqual([]);
        expect(reparsed.querySelector('script, iframe, math, svg, xmp, noembed, noframes, noscript, plaintext, template'), input).toBeNull();
      }
    }
  }, 60_000);
});
