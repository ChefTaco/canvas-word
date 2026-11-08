import type { IElement } from '../interface/Element'
import { ElementType } from '../dataset/enum/Element'
/** Rendering may precede an application's schema validation (for example paste).
 * Only navigation schemes with inert URL parsing may enter native link actions. */
export function safeHyperlink(value: string | undefined, base = globalThis.location?.href ?? 'https://example.invalid/'): string | undefined {
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return undefined
  try {
    const url = new URL(value, base)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : undefined
  } catch { return undefined }
}

export function isElementUnderlined(element: IElement): boolean {
  return Boolean((element.underline ?? (element.type === ElementType.HYPERLINK)) || element.control?.underline)
}
