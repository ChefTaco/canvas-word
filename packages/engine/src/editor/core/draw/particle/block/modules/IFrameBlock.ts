import { IEditorOption } from '../../../../../interface/Editor'
import { IRowElement } from '../../../../../interface/Row'
import {
  DEFAULT_IFRAME_SANDBOX,
  resolveIframeSandbox
} from '../../../../../utils/iframeSandbox'

export class IFrameBlock {
  public static readonly sandbox = [...DEFAULT_IFRAME_SANDBOX]
  public static readonly allow = ['fullscreen']

  private element: IRowElement
  private options: Pick<IEditorOption, 'unsafeIframeAllowSameOrigin'>
  private iframe: HTMLIFrameElement | null = null
  private isReadonly: boolean

  constructor(
    element: IRowElement,
    options: Pick<IEditorOption, 'unsafeIframeAllowSameOrigin'> = {}
  ) {
    this.element = element
    this.options = options
    this.isReadonly = false
  }

  public getIframe(): HTMLIFrameElement | null {
    return this.iframe
  }

  private _defineIframeProperties(iframeWindow: Window | null) {
    // A sandboxed frame without allow-same-origin is cross-origin; its window
    // cannot be redefined (and its content cannot reach the host anyway).
    try {
      if (!iframeWindow) return
      Object.defineProperties(iframeWindow, {
        // 禁止获取parent避免安全漏洞
        parent: {
          get: () => null
        },
        // 用于区分上下文
        __POWERED_BY_CANVAS_EDITOR__: {
          get: () => true
        }
      })
    } catch {
      // cross-origin frame
    }
  }

  public render(blockItemContainer: HTMLDivElement) {
    const { iframeBlock } = this.element.block || {}
    const iframe = document.createElement('iframe')
    iframe.setAttribute('data-id', this.element.id!)
    iframe.setAttribute(
      'sandbox',
      resolveIframeSandbox(this.options, iframeBlock).join(' ')
    )
    iframe.setAttribute(
      'allow',
      [iframeBlock?.allow || IFrameBlock.allow].join(' ')
    )
    iframe.style.border = 'none'
    iframe.style.width = '100%'
    iframe.style.height = '100%'
    if (iframeBlock?.src) {
      iframe.src = iframeBlock.src
    } else if (iframeBlock?.srcdoc) {
      iframe.srcdoc = iframeBlock.srcdoc
    }
    blockItemContainer.append(iframe)
    // 重新定义iframe上属性
    this._defineIframeProperties(iframe.contentWindow)
    this.iframe = iframe
  }

  public setReadonly(readonly: boolean) {
    if (!this.iframe || this.isReadonly === readonly) return
    this.isReadonly = readonly
    if (readonly) {
      this.iframe.style.pointerEvents = 'none'
      this.iframe.setAttribute('tabindex', '-1')
    } else {
      this.iframe.style.pointerEvents = ''
      this.iframe.removeAttribute('tabindex')
    }
  }
}
