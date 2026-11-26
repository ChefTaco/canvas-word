import { IIFrameBlock } from '../interface/Block'
import { IEditorOption } from '../interface/Editor'

// Scripts run in an opaque origin: no access to the host page, its storage or cookies.
export const DEFAULT_IFRAME_SANDBOX: readonly string[] = Object.freeze([
  'allow-scripts'
])

// The previous default. Together, these two tokens let same-origin content
// (`srcdoc`, same-origin URLs) script the host page, which removes the sandbox.
export const UNSAFE_LEGACY_IFRAME_SANDBOX: readonly string[] = Object.freeze([
  'allow-scripts',
  'allow-same-origin'
])

const SANDBOX_TOKEN = /^[a-z-]+$/

/**
 * Returns the sandbox tokens for an iframe block from document data. Unless the
 * host opts in with `unsafeIframeAllowSameOrigin`, the default is
 * `allow-scripts` only and a document cannot combine `allow-scripts` with
 * `allow-same-origin`.
 */
export function resolveIframeSandbox(
  options: Pick<IEditorOption, 'unsafeIframeAllowSameOrigin'> | undefined,
  iframeBlock?: Pick<IIFrameBlock, 'sandbox'> | null
): string[] {
  const unsafe = options?.unsafeIframeAllowSameOrigin === true
  const requested = iframeBlock?.sandbox
  if (!Array.isArray(requested)) {
    return [...(unsafe ? UNSAFE_LEGACY_IFRAME_SANDBOX : DEFAULT_IFRAME_SANDBOX)]
  }
  const tokens = [
    ...new Set(
      requested
        .filter((token): token is string => typeof token === 'string')
        .map(token => token.trim().toLowerCase())
        .filter(token => SANDBOX_TOKEN.test(token))
    )
  ]
  if (
    !unsafe &&
    tokens.includes('allow-scripts') &&
    tokens.includes('allow-same-origin')
  ) {
    return tokens.filter(token => token !== 'allow-same-origin')
  }
  return tokens
}
