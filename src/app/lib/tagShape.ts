// A drawn tag's SVG (TagMark), in its own colors except one: the parts drawn in `currentColor` take the tag's color,
// or, in an SVG that never uses currentColor, the black parts (explicit, or the default fill) do. It's shown as an
// <img> from a data: URL, so nothing in the file can run, and only the parts meant to follow the tag change color.

const PAINT = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color']
const BLACK = /^(#000|#000f|#000000|#000000ff|black|rgba?\(\s*0[\s,]+0[\s,]+0\s*(?:[,/]\s*(?:1|100%)\s*)?\))$/i
const SVG_NS = 'http://www.w3.org/2000/svg'
const PATTERN_ID = 'vx-tag-pattern'
const CURRENT_IN_CSS = /((?:^|[;{\s])(?:fill|stroke)\s*:\s*)currentColor(?=\s*(?:;|}|!|$))/gi
const BLACK_IN_CSS = /((?:^|[;{\s])(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*:\s*)(#000000ff|#000000|#000f|#000|black|rgba?\(\s*0[\s,]+0[\s,]+0\s*(?:[,/]\s*(?:1|100%)\s*)?\))(?=\s*(?:;|}|!|$))/gi

/** A pattern over the tag-colored parts: its second color (resolved), one stripe or square in px, and the size the
 * SVG is drawn at (to turn px into the file's own units). */
export interface ShapePattern {
  kind: 'stripes' | 'checks'
  color: string
  size: number
  box: { w: number; h: number }
}

/** The SVG with its tag-colored parts in `color` (a resolved CSS color; var() doesn't reach inside an <img>), or in
 * `pattern` of `color` and its second color. */
export function tintSvg(svg: string, color: string, pattern?: ShapePattern): string | null {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null
  if (!/currentcolor/i.test(svg)) {
    for (const el of [root, ...Array.from(root.getElementsByTagName('*'))]) {
      for (const a of PAINT) {
        const v = el.getAttribute(a)
        if (v && BLACK.test(v.trim())) el.setAttribute(a, 'currentColor')
      }
      const style = el.getAttribute('style')
      if (style) el.setAttribute('style', style.replace(BLACK_IN_CSS, '$1currentColor'))
      if (el.localName === 'style' && el.textContent) el.textContent = el.textContent.replace(BLACK_IN_CSS, '$1currentColor')
    }
    // Shapes with no fill of their own are black by default: they follow the tag too.
    if (!root.hasAttribute('fill')) root.setAttribute('fill', 'currentColor')
  }
  root.setAttribute('color', color)
  // Scale to the tag's box: a viewBox from the file's own size, if it only has width and height.
  const w = parseFloat(root.getAttribute('width') ?? '')
  const h = parseFloat(root.getAttribute('height') ?? '')
  if (!root.hasAttribute('viewBox') && w > 0 && h > 0) root.setAttribute('viewBox', `0 0 ${w} ${h}`)
  root.removeAttribute('width')
  root.removeAttribute('height')
  if (pattern) addPattern(doc, root, color, pattern)
  return new XMLSerializer().serializeToString(doc)
}

/** Fills and strokes in currentColor become the pattern; other currentColor uses (gradient stops, …) stay plain. */
function addPattern(doc: Document, root: Element, color: string, p: ShapePattern) {
  const vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  // Drawn contained in its box: one px is this many of the file's units.
  const unit = vb.length === 4 && vb[2]! > 0 && vb[3]! > 0 ? Math.max(vb[2]! / p.box.w, vb[3]! / p.box.h) : 1
  const s = p.size * unit
  const el = (name: string, attrs: Record<string, string | number>) => {
    const e = doc.createElementNS(SVG_NS, name)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
    return e
  }
  const pat = el('pattern', { id: PATTERN_ID, patternUnits: 'userSpaceOnUse', width: 2 * s, height: 2 * s })
  pat.append(el('rect', { width: 2 * s, height: 2 * s, fill: color }))
  if (p.kind === 'stripes') {
    pat.setAttribute('patternTransform', 'rotate(45)')
    pat.append(el('rect', { width: s, height: 2 * s, fill: p.color }))
  } else {
    pat.append(el('rect', { width: s, height: s, fill: p.color }), el('rect', { x: s, y: s, width: s, height: s, fill: p.color }))
  }
  const defs = el('defs', {})
  defs.append(pat)
  const url = `url(#${PATTERN_ID})`
  for (const e of [root, ...Array.from(root.getElementsByTagName('*'))]) {
    for (const a of ['fill', 'stroke']) if (/^currentcolor$/i.test(e.getAttribute(a)?.trim() ?? '')) e.setAttribute(a, url)
    const style = e.getAttribute('style')
    if (style) e.setAttribute('style', style.replace(CURRENT_IN_CSS, `$1${url}`))
    if (e.localName === 'style' && e.textContent) e.textContent = e.textContent.replace(CURRENT_IN_CSS, `$1${url}`)
  }
  root.prepend(defs)
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

const files = new Map<string, Promise<string | null>>()
/** The SVG's text, fetched once per URL (shape URLs are versioned); null if it can't be had. */
export function shapeText(url: string, fetcher: typeof fetch = (...a) => fetch(...a)): Promise<string | null> {
  let p = files.get(url)
  if (!p) {
    p = fetcher(url)
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
    p.then((t) => t === null && files.delete(url))
    files.set(url, p)
  }
  return p
}
