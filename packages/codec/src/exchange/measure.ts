import { SaxesParser } from 'saxes'
import { WordCodecError } from './errors.js'
import { UNSUPPORTED_WORD_FEATURES } from './import.js'
import { DEFAULT_XML_LIMITS, isWebHyperlink, readDocumentPackage, resolveXmlLimits, validateDocxPackage, type ResolvedXmlLimits, type XmlLimits } from './packageValidation.js'

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const pr = 'http://schemas.openxmlformats.org/package/2006/relationships'
const toggles = new Set(['bidi', 'rtl', 'titlePg', 'evenAndOddHeaders'])

export interface DocxXmlMeasure { nodes: number; elements: number; depth: number; attributes: number }
export interface DocxPartMeasure { name: string; bytes: number; xml?: DocxXmlMeasure }
export interface DocxMeasure {
  /** Size of the DOCX file itself. */
  bytes: number
  parts: DocxPartMeasure[]
  totals: { parts: number; uncompressedBytes: number; xmlNodes: number }
  /** The limits the measurement was checked against. */
  limits: ResolvedXmlLimits
  /** Every per-part XML limit the package exceeds, with the value that would pass. */
  exceeded: Array<{ part: string; limit: keyof XmlLimits; value: number; maximum: number }>
  /** Feature-based losses a full import would report (an estimate; `importDocx` stays authoritative). */
  losses: Array<{ code: string; count: number; message: string }>
  /** Whether `validateDocxPackage` accepts the package with these limits, and why not. */
  validation: { ok: true } | { ok: false; code: string; message: string }
}

/**
 * Preflight a DOCX without converting it: part sizes, XML node counts, the
 * limits a part exceeds and the feature losses an import would report. Unsafe
 * or malformed ZIP archives still throw `WordCodecError`, as in `importDocx`.
 * XML parts are streamed, never built into a DOM, so oversize parts can be
 * measured; each is still bounded by the 64 MiB ZIP entry limit.
 */
export async function measureDocx(bytes: Buffer, options: { limits?: XmlLimits } = {}): Promise<DocxMeasure> {
  const limits = resolveXmlLimits(options.limits, DEFAULT_XML_LIMITS)
  const files = await readDocumentPackage(bytes)
  const parts: DocxPartMeasure[] = []
  const exceeded: DocxMeasure['exceeded'] = []
  const features = new Map<string, number>()
  let hyperlinkLosses = 0
  let uncompressedBytes = 0; let xmlNodes = 0
  for (const [name, content] of files) {
    uncompressedBytes += content.length
    const part: DocxPartMeasure = { name, bytes: content.length }
    parts.push(part)
    if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue
    if (content.length > limits.maxBytes) exceeded.push({ part: name, limit: 'maxBytes', value: content.length, maximum: limits.maxBytes })
    const xml = measureXml(content, name.startsWith('word/') && name.endsWith('.xml') ? features : undefined)
    if (!xml) continue
    if (name.endsWith('.rels')) hyperlinkLosses += xml.unsupportedHyperlinks
    part.xml = { nodes: xml.nodes, elements: xml.elements, depth: xml.depth, attributes: xml.attributes }
    xmlNodes += xml.nodes
    for (const [limit, value] of [['maxNodes', xml.nodes], ['maxDepth', xml.depth], ['maxAttributes', xml.attributes]] as const)
      if (value > limits[limit]) exceeded.push({ part: name, limit, value, maximum: limits[limit] })
  }
  const losses: DocxMeasure['losses'] = []
  for (const [code, message] of Object.entries(UNSUPPORTED_WORD_FEATURES)) {
    const count = features.get(code)
    if (count) losses.push({ code, count, message })
  }
  if (hyperlinkLosses) losses.push({ code: 'HYPERLINK_SCHEME_UNSUPPORTED', count: hyperlinkLosses, message: 'Links that are not HTTP(S), such as mailto: links, are dropped; their text is kept and the link remains only in the original.' })
  let validation: DocxMeasure['validation'] = { ok: true }
  try { await validateDocxPackage(bytes, false, limits) }
  catch (error) {
    if (!(error instanceof WordCodecError)) throw error
    validation = { ok: false, code: error.code, message: error.message }
  }
  return { bytes: bytes.byteLength, parts, totals: { parts: parts.length, uncompressedBytes, xmlNodes }, limits, exceeded, losses, validation }
}

/** Stream one part; `undefined` when it is not well-formed UTF-8 XML (validation reports why). */
function measureXml(content: Buffer, features?: Map<string, number>) {
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(content) } catch { return undefined }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) return undefined
  let nodes = 0; let elements = 0; let depth = 0; let maxDepth = 0; let attributes = 0; let unsupportedHyperlinks = 0
  const parser = new SaxesParser({ xmlns: true, defaultXMLVersion: '1.0', forceXMLVersion: true })
  const node = () => { nodes++ }
  parser.on('opentag', (tag) => {
    nodes++; elements++
    maxDepth = Math.max(maxDepth, ++depth)
    const attributeCount = Object.keys(tag.attributes).length
    attributes = Math.max(attributes, attributeCount)
    if (features && tag.uri === w && tag.local in UNSUPPORTED_WORD_FEATURES) {
      const value = Object.values(tag.attributes).find((attribute) => typeof attribute === 'object' && attribute.uri === w && attribute.local === 'val')
      const off = toggles.has(tag.local) && typeof value === 'object' && ['0', 'false', 'off'].includes(value.value)
      if (!off) features.set(tag.local, (features.get(tag.local) ?? 0) + 1)
    }
    if (tag.uri === pr && tag.local === 'Relationship') {
      const attribute = (key: string) => { const value = tag.attributes[key]; return typeof value === 'object' ? value.value : value }
      if (attribute('TargetMode') === 'External' && attribute('Type')?.endsWith('/hyperlink') && !isWebHyperlink(attribute('Target') ?? '')) unsupportedHyperlinks++
    }
  })
  parser.on('closetag', () => { depth-- })
  parser.on('text', node); parser.on('cdata', node); parser.on('comment', node); parser.on('processinginstruction', node)
  try {
    for (let offset = 0; offset < text.length; offset += 8192) parser.write(text.slice(offset, offset + 8192))
    parser.close()
  } catch { return undefined }
  return { nodes, elements, depth: maxDepth, attributes, unsupportedHyperlinks }
}

