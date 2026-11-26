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

// Permissions Policy features delegated to iframe blocks when the host sets no
// `iframeAllow`. Fullscreen only: no camera, microphone, geolocation or other
// powerful features.
export const DEFAULT_IFRAME_ALLOW: readonly string[] = Object.freeze([
  'fullscreen'
])

const PERMISSION_FEATURE = /^[a-z][a-z0-9-]*$/

function featureList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return [
    ...new Set(
      value
        .filter((feature): feature is string => typeof feature === 'string')
        .map(feature => feature.trim().toLowerCase())
        .filter(feature => PERMISSION_FEATURE.test(feature))
    )
  ]
}

/**
 * Returns the Permissions Policy features an iframe block may use. The host's
 * `iframeAllow` option is the allowlist (`DEFAULT_IFRAME_ALLOW` when unset or
 * malformed); a document's `iframeBlock.allow` can only narrow it.
 */
export function resolveIframeAllow(
  options: Pick<IEditorOption, 'iframeAllow'> | undefined,
  iframeBlock?: Pick<IIFrameBlock, 'allow'> | null
): string[] {
  const permitted = featureList(options?.iframeAllow) ?? [...DEFAULT_IFRAME_ALLOW]
  const requested = featureList(iframeBlock?.allow)
  if (!requested) return permitted
  return requested.filter(feature => permitted.includes(feature))
}

/**
 * Serializes features as an iframe `allow` attribute (`feature1; feature2`);
 * each feature uses the attribute's default allowlist, the frame's own origin.
 */
export function serializeIframeAllow(features: readonly string[]): string {
  return features.join('; ')
}

/** Sets or removes the `allow` attribute of an iframe block's frame. */
export function applyIframeAllow(
  iframe: HTMLIFrameElement,
  options: Pick<IEditorOption, 'iframeAllow'> | undefined,
  iframeBlock?: Pick<IIFrameBlock, 'allow'> | null
) {
  const allow = serializeIframeAllow(resolveIframeAllow(options, iframeBlock))
  if (allow) iframe.setAttribute('allow', allow)
  else iframe.removeAttribute('allow')
}
