import { PaperDirection } from '../dataset/enum/Editor'
import { IIframeInfo } from '../interface/Block'
import { DEFAULT_IFRAME_SANDBOX } from './iframeSandbox'

const IFRAME_LOADED_MESSAGE = '__LOADED_TO_CANVAS_EDITOR__'
// Tells the print document that a srcdoc frame finished loading. Content that
// sets __CUSTOM_CANVAS_EDITOR_LOAD_HOOK__ posts the message to itself when it is
// ready; it is relayed to the parent, which also works across a sandbox.
const IFRAME_LOAD_SCRIPT = `
        <script>
          (function () {
            var done = function () {
              try {
                window.parent.postMessage({ type: '${IFRAME_LOADED_MESSAGE}' }, '*')
              } catch (error) {}
            }
            if (!window.__CUSTOM_CANVAS_EDITOR_LOAD_HOOK__) {
              done()
              return
            }
            window.addEventListener('message', function (event) {
              if (
                event.source === window &&
                event.data &&
                event.data.type === '${IFRAME_LOADED_MESSAGE}'
              ) {
                done()
              }
            })
          })()
        </script>`

function convertPxToPaperSize(width: number, height: number) {
  if (width === 1125 && height === 1593) {
    return {
      size: 'a3',
      width: '297mm',
      height: '420mm'
    }
  }
  if (width === 794 && height === 1123) {
    return {
      size: 'a4',
      width: '210mm',
      height: '297mm'
    }
  }
  if (width === 565 && height === 796) {
    return {
      size: 'a5',
      width: '148mm',
      height: '210mm'
    }
  }
  // 其他默认不转换
  return {
    size: '',
    width: `${width}px`,
    height: `${height}px`
  }
}

interface IPrintOption {
  width: number
  height: number
  direction?: PaperDirection
  // 混排横竖版：各页纸张方向（缺省页回退到 direction）
  pageDirections?: PaperDirection[]
  iframeInfoList?: IIframeInfo[][]
}

async function printPages(
  pageCount: number,
  options: IPrintOption,
  appendPageContent: (pageWrapper: HTMLDivElement, pageIndex: number) => void
) {
  const {
    width,
    height,
    direction = PaperDirection.VERTICAL,
    pageDirections,
    iframeInfoList = []
  } = options
  const iframe = document.createElement('iframe')
  // 离屏渲染
  iframe.style.visibility = 'hidden'
  iframe.style.position = 'absolute'
  iframe.style.left = '0'
  iframe.style.top = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  document.body.append(iframe)
  const contentWindow = iframe.contentWindow!
  const doc = contentWindow.document
  doc.open()
  const container = document.createElement('div')
  const paperSize = convertPxToPaperSize(width, height)
  const getPageDirection = (pageIndex: number) =>
    pageDirections?.[pageIndex] || direction
  const firstPageDirection = getPageDirection(0)
  const lastPageDirection = getPageDirection(pageCount - 1)
  const isMixedDirection = Array.from({ length: pageCount }).some(
    (_, pageIndex) => getPageDirection(pageIndex) !== firstPageDirection
  )
  Array.from({ length: pageCount }).forEach((_, pageIndex) => {
    const pageDirection = getPageDirection(pageIndex)
    const pageWrapper = document.createElement('div')
    pageWrapper.style.position = 'relative'
    pageWrapper.style.width =
      pageDirection === PaperDirection.HORIZONTAL
        ? paperSize.height
        : paperSize.width
    pageWrapper.style.height =
      pageDirection === PaperDirection.HORIZONTAL
        ? paperSize.width
        : paperSize.height
    // 混排时为前 N-1 页指定命名页；最后一页沿用匿名 @page，避免命名页与匿名页
    // 在文档末尾发生 name 切换而触发额外的 forced break（多出一页空白页）
    if (isMixedDirection && pageIndex < pageCount - 1) {
      pageWrapper.style.setProperty(
        'page',
        pageDirection === PaperDirection.HORIZONTAL
          ? 'canvas-editor-landscape'
          : 'canvas-editor-portrait'
      )
    }
    appendPageContent(pageWrapper, pageIndex)
    // 叠加 iframe
    const pageIframes = iframeInfoList[pageIndex] || []
    pageIframes.forEach(iframeInfo => {
      const iframeEl = document.createElement('iframe')
      iframeEl.style.position = 'absolute'
      iframeEl.style.left = `${iframeInfo.x}px`
      iframeEl.style.top = `${iframeInfo.y}px`
      iframeEl.style.width = `${iframeInfo.width}px`
      iframeEl.style.height = `${iframeInfo.height}px`
      iframeEl.style.border = 'none'
      // Print copies are always sandboxed, like the editor's own frames.
      iframeEl.setAttribute(
        'sandbox',
        (Array.isArray(iframeInfo.sandbox)
          ? iframeInfo.sandbox
          : DEFAULT_IFRAME_SANDBOX
        ).join(' ')
      )
      if (iframeInfo.src) {
        iframeEl.src = iframeInfo.src
      } else if (iframeInfo.srcdoc) {
        // 注入脚本到 body 最后
        const script = IFRAME_LOAD_SCRIPT
        const srcdoc = iframeInfo.srcdoc
        if (srcdoc.includes('</body>')) {
          iframeEl.srcdoc = srcdoc.replace('</body>', `${script}</body>`)
        } else {
          iframeEl.srcdoc = srcdoc + script
        }
      }
      pageWrapper.append(iframeEl)
    })
    container.append(pageWrapper)
  })
  const style = document.createElement('style')
  const pageRule = isMixedDirection
    ? `
  @page {
    margin: 0;
    size: ${paperSize.size} ${
      lastPageDirection === PaperDirection.HORIZONTAL ? 'landscape' : 'portrait'
    };
  }
  @page canvas-editor-portrait {
    margin: 0;
    size: ${paperSize.size} portrait;
  }
  @page canvas-editor-landscape {
    margin: 0;
    size: ${paperSize.size} landscape;
  }`
    : `
  @page {
    margin: 0;
    size: ${paperSize.size} ${
      firstPageDirection === PaperDirection.HORIZONTAL
        ? 'landscape'
        : 'portrait'
    };
  }`
  const stylesheet = `
  * {
    margin: 0;
    padding: 0;
  }${pageRule}`
  style.append(document.createTextNode(stylesheet))
  const documentStyles = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]')
  )
    .map(element => element.outerHTML)
    .join('')
  doc.write(`${documentStyles}${style.outerHTML}${container.innerHTML}`)

  const resourcePromise = waitForPrintResources(doc)
  // 等待iframe加载完成
  if (iframeInfoList.length) {
    await waitIframeLoad(doc)
  }
  await resourcePromise

  setTimeout(async () => {
    contentWindow.print()
    doc.close()
    // 移除iframe
    window.addEventListener(
      'mouseover',
      () => {
        iframe?.remove()
      },
      {
        once: true
      }
    )
  })
}

export async function print(base64List: string[], options: IPrintOption) {
  return printPages(base64List.length, options, (pageWrapper, pageIndex) => {
    const image = document.createElement('img')
    image.style.width = '100%'
    image.style.height = '100%'
    image.style.position = 'absolute'
    image.style.left = '0'
    image.style.top = '0'
    image.src = base64List[pageIndex]
    pageWrapper.append(image)
  })
}

export async function printSvg(
  pageList: SVGSVGElement[],
  options: IPrintOption
) {
  return printPages(pageList.length, options, (pageWrapper, pageIndex) => {
    const svg = pageList[pageIndex]
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.position = 'absolute'
    svg.style.left = '0'
    svg.style.top = '0'
    svg.style.margin = '0'
    svg.style.cursor = 'auto'
    svg.style.userSelect = 'text'
    pageWrapper.append(svg)
  })
}

const PRINT_RESOURCE_TIMEOUT = 10000

function waitForPrintResource(element: Element): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    element.addEventListener('load', done, { once: true })
    element.addEventListener('error', done, { once: true })
    const timer = setTimeout(done, PRINT_RESOURCE_TIMEOUT)
  })
}

async function waitForPrintResources(doc: Document): Promise<void> {
  const resources = Array.from(
    doc.querySelectorAll('image, link[rel="stylesheet"]')
  ).filter(element => {
    if (element.tagName.toLowerCase() === 'link') {
      return element.hasAttribute('href')
    }
    return element.hasAttribute('href') || element.hasAttribute('xlink:href')
  })
  await Promise.all(resources.map(waitForPrintResource))
  await doc.fonts?.ready
}

async function waitIframeLoad(doc: Document) {
  const iframeList = Array.from(doc.querySelectorAll('iframe'))
  const printWindow = doc.defaultView

  const iframePromises = iframeList.map(iframe => {
    const iframePromise = new Promise<void>(resolve => {
      // srcdoc需要等待事件（优先使用自定义事件，否则使用注入的脚本事件）
      if (!iframe.srcdoc || !printWindow) {
        // url不等待直接返回
        resolve()
        return
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      const done = () => {
        clearTimeout(timer)
        printWindow.removeEventListener('message', onMessage)
        resolve()
      }
      const onMessage = (event: MessageEvent) => {
        if (
          event.source === iframe.contentWindow &&
          event.data?.type === IFRAME_LOADED_MESSAGE
        ) {
          done()
        }
      }
      timer = setTimeout(done, PRINT_RESOURCE_TIMEOUT)
      printWindow.addEventListener('message', onMessage)
      // Without allow-scripts the injected script never runs.
      const sandbox = (iframe.getAttribute('sandbox') || '').split(/\s+/)
      if (
        iframe.hasAttribute('sandbox') &&
        !sandbox.includes('allow-scripts')
      ) {
        iframe.addEventListener('load', done, { once: true })
      }
    })
    return iframePromise
  })

  await Promise.allSettled(iframePromises)
}
