// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { shapeText, svgDataUrl, tintSvg } from '../../src/app/lib/tagShape'

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
const RED = 'rgb(255, 0, 0)'

describe('tintSvg', () => {
  it('colors only the currentColor parts when the SVG has some', () => {
    const out = tintSvg('<svg xmlns="http://www.w3.org/2000/svg"><path fill="currentColor"/><path fill="#000"/><path fill="#123456"/></svg>', RED)!
    const root = parse(out)
    expect(root.getAttribute('color')).toBe(RED)
    expect(root.hasAttribute('fill')).toBe(false)
    expect([...root.querySelectorAll('path')].map((p) => p.getAttribute('fill'))).toEqual(['currentColor', '#000', '#123456'])
  })
  it('colors the black parts when it has none', () => {
    const out = tintSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><style>.a{fill:#000000}.b{fill:#fff}</style>'
        + '<path fill="black"/><path stroke="rgb(0, 0, 0)" fill="#f00"/><path style="fill: #000; stroke: #fff"/><path class="a"/></svg>',
      RED,
    )!
    const root = parse(out)
    expect(root.getAttribute('fill')).toBe('currentColor')
    expect(root.getAttribute('viewBox')).toBe('0 0 40 20')
    expect(root.hasAttribute('width')).toBe(false)
    const paths = [...root.querySelectorAll('path')]
    expect(paths[0]!.getAttribute('fill')).toBe('currentColor')
    expect(paths[1]!.getAttribute('stroke')).toBe('currentColor')
    expect(paths[1]!.getAttribute('fill')).toBe('#f00')
    expect(paths[2]!.getAttribute('style')).toBe('fill: currentColor; stroke: #fff')
    expect(root.querySelector('style')!.textContent).toBe('.a{fill:currentColor}.b{fill:#fff}')
  })
  it('keeps a root fill that is not black', () => {
    const root = parse(tintSvg('<svg xmlns="http://www.w3.org/2000/svg" fill="#0f0"><path/></svg>', RED)!)
    expect(root.getAttribute('fill')).toBe('#0f0')
  })
  it('fills the tag-colored parts with a pattern, sized in px', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 124 44"><path fill="currentColor"/><path style="stroke:currentColor"/><stop stop-color="currentColor"/></svg>'
    const root = parse(tintSvg(svg, RED, { kind: 'checks', color: '#fff', size: 4, box: { w: 62, h: 22 } })!)
    const pat = root.querySelector('defs > pattern#vx-tag-pattern')!
    expect(pat.getAttribute('width')).toBe('16') // 2 squares of 4px, at 2 units per px
    expect([...pat.querySelectorAll('rect')].map((r) => r.getAttribute('fill'))).toEqual([RED, '#fff', '#fff'])
    expect(root.querySelector('path')!.getAttribute('fill')).toBe('url(#vx-tag-pattern)')
    expect(root.querySelectorAll('path')[1]!.getAttribute('style')).toBe('stroke:url(#vx-tag-pattern)')
    expect(root.querySelector('stop')!.getAttribute('stop-color')).toBe('currentColor')
    const striped = parse(tintSvg('<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>', RED, { kind: 'stripes', color: '#fff', size: 3, box: { w: 62, h: 22 } })!)
    expect(striped.getAttribute('fill')).toBe('url(#vx-tag-pattern)')
    expect(striped.querySelector('pattern')!.getAttribute('patternTransform')).toBe('rotate(45)')
  })
  it('refuses what is not an SVG', () => {
    expect(tintSvg('<html/>', RED)).toBeNull()
    expect(tintSvg('<svg', RED)).toBeNull()
  })
  it('makes a data URL', () => {
    expect(svgDataUrl('<svg a="#"/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%20a%3D%22%23%22%2F%3E')
  })
})

describe('shapeText', () => {
  it('fetches a URL once, and again after a failure', async () => {
    const ok = vi.fn(async () => new Response('<svg/>'))
    expect(await shapeText('/a.svg?v=1', ok)).toBe('<svg/>')
    expect(await shapeText('/a.svg?v=1', ok)).toBe('<svg/>')
    expect(ok).toHaveBeenCalledTimes(1)
    const bad = vi.fn(async () => new Response('', { status: 404 }))
    expect(await shapeText('/b.svg', bad)).toBeNull()
    await Promise.resolve()
    expect(await shapeText('/b.svg', ok)).toBe('<svg/>')
  })
})
