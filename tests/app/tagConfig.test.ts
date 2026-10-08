import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminClient } from '../../src/app/admin/api'
import { blankDraft, draftOf, draftsOf, previewOf, rawOf, tagChanges } from '../../src/app/admin/tags'
import { fromRaw, isTagColor, loadTagConfig, tagConfig, type RawTag } from '../../src/app/lib/vodTags'
import { site } from '../../src/app/site'

const raw = (o: Partial<RawTag> = {}): RawTag => ({ name: 'new', label: 'new', drawn: true, color: null, shape: null, width: null, height: null, ...NO_TEXT, ...NO_PATTERN, ...o })
const NO_TEXT = { text: null, textColor: null, textSize: null, textX: null, textY: null, textRotate: null }
const NO_PATTERN = { pattern: null, patternColor: null, patternSize: null }
const json = (status: number, body: unknown) => vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify(body), { status }))

afterEach(() => {
  tagConfig.value = site.tags
})

describe('fromRaw', () => {
  it('resolves shapes against the API and keeps only safe values', () => {
    const out = fromRaw(
      [
        raw({ color: 'var(--vx-ok)', shape: 'v1/site/tags/new.svg?v=ab12', width: 80, height: 300 }),
        raw({ name: 'x', label: '', color: 'red;background:url(//evil)', shape: 'https://evil/x.svg' }),
        raw({ name: 'Bad Name' }),
      ],
      '/backend/',
    )
    expect(out.new).toEqual({ label: 'new', drawn: true, color: 'var(--vx-ok)', shape: '/backend/v1/site/tags/new.svg?v=ab12', width: 80, height: undefined })
    expect(out.x).toEqual({ label: 'x', drawn: true, color: undefined, shape: null, width: undefined, height: undefined })
    expect(Object.keys(out)).toEqual(['new', 'x'])
  })
  it('takes the text on a tag, within its limits', () => {
    const out = fromRaw(
      [
        raw({ text: '  100%  ', textColor: 'var(--vx-ink)', textSize: 12, textX: -3, textY: 2, textRotate: -15 }),
        raw({ name: 'x', text: 'y'.repeat(30), textColor: 'url(x)', textSize: 99, textX: 1.5, textY: 500, textRotate: 181 }),
      ],
      '',
    )
    expect(out.new).toMatchObject({ text: '100%', textColor: 'var(--vx-ink)', textSize: 12, textX: -3, textY: 2, textRotate: -15 })
    expect(out.x).toMatchObject({ text: 'y'.repeat(24), textColor: undefined, textSize: undefined, textX: undefined, textY: undefined, textRotate: undefined })
  })
})

describe('isTagColor', () => {
  it('takes plain colors, theme tokens and color functions', () => {
    for (const c of [
      '#abc', '#a1b2c3d4', 'rebeccapurple', 'var(--vx-accent)', 'rgb(255 0 0 / 50%)', 'hsl(120, 50%, 40%)',
      'oklch(from var(--vx-accent) calc(l - 0.15) c h)', 'color-mix(in oklch, var(--vx-ok) 60%, white)',
      'rgb(from var(--vx-bad) r g b / 0.5)', 'oklch(from #f00 clamp(0.2, l * 0.8, 0.9) c calc(h + 30))',
      'color-mix(in srgb, oklch(from var(--vx-info) l c h) 50%, transparent)',
      // Any site's theme tokens, not only @vexoulz/ui's.
      'var(--k-accent)', 'oklch(from var(--k-ok) calc(l - 0.1) c h)', 'color-mix(in oklch, var(--k-bad) 60%, var(--accent-2))',
    ]) expect(isTagColor(c), c).toBe(true)
  })
  it('refuses anything that could do more than color', () => {
    for (const c of [
      'oklch(var(--vx-accent) calc(l - 0.15) c h', 'url(//evil/x.png)', 'oklch(from url(x) l c h)', 'var(--)',
      'var(--1x)', 'var(-- x)', 'var(--k-a,red)', 'rgb(var(--x) --y)',
      'var(--vx-a, url(x))', 'image-set(x)', 'red;background:url(x)', 'rgb(0 0 0) url(x)', 'calc(1 + 1)',
      'rgb(1 2 3))', 'oklch(\\75 rl c h)', 'rgb(0 0 0) rgb(0 0 0)', `rgb(${'1 '.repeat(90)})`,
      'rgb(calc(calc(calc(calc(1)))))', 'expression(alert(1))', '#ab',
    ]) expect(isTagColor(c), c).toBe(false)
  })
})

describe('loadTagConfig', () => {
  it('takes the archive’s tags', async () => {
    const f = json(200, { tags: [raw({ name: 'speedrun', label: 'speedrun', color: '#ff0' })] })
    await loadTagConfig(f as unknown as typeof fetch, '/backend')
    expect(f.mock.calls[0]![0]).toBe('/backend/v1/site/tags')
    expect(Object.keys(tagConfig.value)).toEqual(['speedrun'])
  })
  it('keeps the built-in tags when the archive has none', async () => {
    await loadTagConfig(json(404, { message: 'No record found' }) as unknown as typeof fetch, '/backend')
    expect(tagConfig.value).toBe(site.tags)
    await loadTagConfig((async () => { throw new Error('offline') }) as unknown as typeof fetch, '/backend')
    expect(tagConfig.value).toBe(site.tags)
  })
})

describe('tagChanges', () => {
  const saved = [raw({ color: 'var(--vx-accent)' }), raw({ name: 'compilation', label: 'playthrough', drawn: false })]
  it('sees no change in what was loaded', () => {
    const r = tagChanges(saved, saved.map((t) => draftOf(t)))
    expect(r.changed).toBe(false)
    expect(r.errors.size).toBe(0)
  })
  it('builds the list to save, sizes as numbers and empty as null', () => {
    const drafts = saved.map((t) => draftOf(t))
    drafts[0]!.width = '70'
    drafts[1]!.color = ' #abcdef '
    const r = tagChanges(saved, drafts)
    expect(r.changed).toBe(true)
    expect(r.body).toEqual([
      { name: 'new', label: 'new', drawn: true, color: 'var(--vx-accent)', width: 70, height: null, ...NO_TEXT, ...NO_PATTERN },
      { name: 'compilation', label: 'playthrough', drawn: false, color: '#abcdef', width: null, height: null, ...NO_TEXT, ...NO_PATTERN },
    ])
  })
  it('takes sizes as the number inputs give them', () => {
    const drafts = saved.map((t) => draftOf(t))
    drafts[0]!.height = 32
    drafts[1]!.width = 7
    const r = tagChanges(saved, drafts)
    expect(r.body[0]!.height).toBe(32)
    expect(r.errors.get(drafts[1]!.key)).toEqual({ width: expect.any(String) })
    expect(previewOf(drafts[0]!, '/backend').height).toBe(32)
  })
  it('flags bad fields by draft', () => {
    const a = blankDraft()
    const b = Object.assign(blankDraft(), { name: 'new', label: 'x', color: 'url(x)', width: '7', height: '20.5' })
    const r = tagChanges(saved, [draftOf(saved[0]!), a, b])
    expect(r.errors.get(a.key)).toEqual({ name: expect.any(String), label: 'Needs a label' })
    expect(Object.keys(r.errors.get(b.key)!)).toEqual(['name', 'color', 'width', 'height'])
    expect(r.errors.get(b.key)!.name).toBe('Another tag has this name')
  })
  it('saves text only while it is on', () => {
    const drafts = saved.map((t) => draftOf(t))
    Object.assign(drafts[0]!, { textOn: true, text: ' 100% ', textColor: 'var(--vx-ink)', textSize: 12, textX: '-4', textY: '', textRotate: '30' })
    Object.assign(drafts[1]!, { textOn: false, text: 'kept', textSize: '999' })
    const r = tagChanges(saved, drafts)
    expect(r.errors.size).toBe(0)
    expect(r.body[0]).toMatchObject({ text: '100%', textColor: 'var(--vx-ink)', textSize: 12, textX: -4, textY: null, textRotate: 30 })
    expect(r.body[1]).toMatchObject(NO_TEXT)
    expect(previewOf(drafts[0]!, '').text).toBe('100%')
    expect(previewOf(drafts[1]!, '').text).toBeUndefined()
    // Loaded back, the text is on again.
    expect(draftOf({ ...saved[0]!, ...r.body[0]!, shape: null })).toMatchObject({ textOn: true, text: '100%', textX: '-4' })
  })
  it('saves a pattern only while one is picked', () => {
    const drafts = saved.map((t) => draftOf(t))
    Object.assign(drafts[0]!, { pattern: 'checks', patternColor: ' #fff ', patternSize: 6 })
    Object.assign(drafts[1]!, { pattern: '', patternColor: '#fff', patternSize: '99' })
    const r = tagChanges(saved, drafts)
    expect(r.errors.size).toBe(0)
    expect(r.body[0]).toMatchObject({ pattern: 'checks', patternColor: '#fff', patternSize: 6 })
    expect(r.body[1]).toMatchObject(NO_PATTERN)
    expect(Object.keys(r.body[0]!)).toEqual(Object.keys(r.body[1]!))
    expect(previewOf(drafts[0]!, '')).toMatchObject({ pattern: 'checks', patternColor: '#fff', patternSize: 6 })
    expect(previewOf(drafts[1]!, '').pattern).toBeUndefined()
    const bad = Object.assign(draftOf(saved[0]!), { pattern: 'stripes', patternColor: 'url(x)', patternSize: 1 })
    expect(Object.keys(tagChanges(saved, [bad, drafts[1]!]).errors.get(bad.key)!)).toEqual(['patternColor', 'patternSize'])
    const out = fromRaw([raw({ pattern: 'stripes', patternSize: 3 }), raw({ name: 'x', pattern: 'dots' as never, patternSize: 3 })], '')
    expect(out.new).toMatchObject({ pattern: 'stripes', patternSize: 3 })
    expect([out.x!.pattern, out.x!.patternSize]).toEqual([undefined, undefined])
  })
  it('flags bad text fields', () => {
    const d = Object.assign(draftOf(saved[0]!), { textOn: true, text: ' ', textColor: 'url(x)', textSize: 5, textX: 101, textY: '1.5', textRotate: -181 })
    const r = tagChanges(saved, [d, draftOf(saved[1]!)])
    expect(Object.keys(r.errors.get(d.key)!)).toEqual(['text', 'textColor', 'textSize', 'textX', 'textY', 'textRotate'])
  })
  it('starts from site.tags and previews a draft', () => {
    const list = rawOf(site.tags)
    expect(list.map((t) => t.name)).toEqual(['new', 'updated', 'complete', 'compilation'])
    const d = draftOf(raw({ shape: 'v1/site/tags/new.svg?v=1', width: '' as never, color: 'nope(' }))
    expect(previewOf(d, '/backend')).toMatchObject({ shape: '/backend/v1/site/tags/new.svg?v=1', color: undefined, width: undefined })
  })
})

describe('draftsOf', () => {
  it('always lists the auto tags, and only those are auto', () => {
    const drafts = draftsOf([raw({ name: 'complete', label: 'complete' }), raw({ name: 'updated', label: 'fresh' })])
    expect(drafts.map((d) => [d.name, d.auto, d.saved])).toEqual([
      ['complete', false, true],
      ['updated', true, true],
      ['new', true, false],
      ['compilation', true, false],
    ])
    expect(drafts[1]!.label).toBe('fresh')
    expect(blankDraft().auto).toBe(false)
  })
  it('makes a list missing an auto tag a change to save', () => {
    const saved = [raw({ name: 'complete', label: 'complete' })]
    expect(tagChanges(saved, draftsOf(saved)).changed).toBe(true)
  })
})

describe('AdminClient site tags', () => {
  it('sends an SVG as itself, with CSRF', async () => {
    const f = json(200, { tags: [], updatedAt: null, updatedBy: null })
    const c = new AdminClient({ base: '', fetch: f })
    c.csrf = 't'
    await c.uploadTagShape('new tag', new Blob(['<svg/>'], { type: 'image/svg+xml' }))
    await c.uploadTagShape('new', new Blob(['<svg/>']))
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe('/admin/site/tags/new%20tag/shape')
    expect(init!.method).toBe('PUT')
    expect(init!.body).toBeInstanceOf(Blob)
    expect((init!.headers as Record<string, string>)['content-type']).toBe('image/svg+xml')
    expect((init!.headers as Record<string, string>)['x-csrf-token']).toBe('t')
    expect((f.mock.calls[1]![1]!.headers as Record<string, string>)['content-type']).toBe('image/svg+xml')
  })
})
