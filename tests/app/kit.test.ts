// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { admin, adminBase, setupVodsSite, site, tagConfig, vodsConfig } from '../../src/app/kit'
import { defineVodsConfig } from '../../src/index'

afterEach(() => vi.unstubAllGlobals())

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src')

/** Every module the kit entry reaches through relative imports, and the packages it names. */
function reach(file: string, seen = new Set<string>(), packages = new Set<string>()) {
  if (seen.has(file)) return { seen, packages }
  seen.add(file)
  for (const [, spec] of readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)) {
    if (!spec!.startsWith('.')) packages.add(spec!)
    else reach(resolve(dirname(file), spec!.endsWith('.ts') ? spec! : `${spec}.ts`).replace(/(\/index)?\.ts\.ts$/, '.ts'), seen, packages)
  }
  return { seen, packages }
}

describe('kit entry', () => {
  it('sets up the site, the admin client and the tags', async () => {
    const fetch = vi.fn(async (_u: string, _i?: RequestInit) => new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    const config = defineVodsConfig({ channel: 'keeki_dechu', twitchId: '90528258', apiBase: '/api', startDate: '2025-01-01' })
    const tags = { new: { label: 'fresh', drawn: false } }
    setupVodsSite({ config, site: { id: 'keekivods', name: 'keekivods.vexoul.net', twitchUrl: 'https://twitch.tv/keeki_dechu', tags }, adminBase: '/admin-api' })

    expect(site).toMatchObject({ id: 'keekivods', name: 'keekivods.vexoul.net', perPage: 24 })
    expect(tagConfig.value).toBe(tags)
    expect(vodsConfig).toBe(config)
    expect(adminBase).toBe('/admin-api')
    expect(admin.base).toBe('/admin-api')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/v1/site/tags', expect.anything()))
  })

  it('never reaches vexoulz-ui, components or styles', () => {
    const { seen, packages } = reach(resolve(SRC, 'app/kit.ts'))
    expect([...packages].filter((p) => p.startsWith('@vexoulz/ui'))).toEqual([])
    expect([...seen].filter((f) => !f.endsWith('.ts'))).toEqual([])
    expect(seen.size).toBeGreaterThan(20)
  })
})
