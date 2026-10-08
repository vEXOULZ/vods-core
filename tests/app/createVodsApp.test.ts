// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVodsApp, DEFAULT_TAGS, site } from '../../src/app'
import { admin, adminBase } from '../../src/app/admin/session'
import { platform } from '../../src/app/admin/platform'
import { tagConfig } from '../../src/app/lib/vodTags'
import { vodsConfig } from '../../src/app/site'
import { defineVodsConfig } from '../../src/index'

const config = defineVodsConfig({ channel: 'keeki_dechu', twitchId: '90528258', apiBase: '/api', startDate: '2025-01-01' })

afterEach(() => vi.unstubAllGlobals())

describe('createVodsApp', () => {
  it('configures the site, the admin client and the tags before anything mounts', async () => {
    const fetch = vi.fn(async (_u: string, _i?: RequestInit) => new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    const tags = { new: { label: 'fresh', drawn: false } }
    const { app, router } = createVodsApp({
      config,
      site: { id: 'vods', name: 'keekivods.vexoul.net', twitchUrl: 'https://twitch.tv/keeki_dechu', tags },
      adminBase: '/admin-api/',
    })

    expect(site).toMatchObject({ name: 'keekivods.vexoul.net', twitchUrl: 'https://twitch.tv/keeki_dechu', perPage: 24 })
    expect(site.tags).toBe(tags)
    expect(tagConfig.value).toBe(tags)
    expect(vodsConfig).toBe(config)
    expect(adminBase).toBe('/admin-api')
    expect(admin.base).toBe('/admin-api')
    expect(platform).toBeDefined()
    // The tags are asked of this channel's archive.
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/v1/site/tags', expect.anything()))
    expect(app.config.globalProperties.$router).toBe(router)
    expect(router.resolve('/vods?tab=playthroughs').matched).toHaveLength(1)
    expect(router.resolve('/manage/jobs/12').matched[0]?.path).toBe('/manage/jobs/:id(\\d+)')
  })

  it("puts the site's name back in the tab when a page without a title of its own opens", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const { router } = createVodsApp({ config, site: { id: 'vods', name: 'vods.vexoul.net', twitchUrl: 'https://twitch.tv/vexoulz' } })
    await router.push('/vods/1')
    document.title = 'A VOD · vods.vexoul.net'
    await router.push('/vods/1?t=30s')
    expect(document.title).toBe('A VOD · vods.vexoul.net')
    await router.push('/playthroughs')
    expect(document.title).toBe('vods.vexoul.net')
  })

  it('falls back to the built-in tags and /backend-admin', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    createVodsApp({ config, site: { id: 'vods', name: 'vods.vexoul.net', twitchUrl: 'https://twitch.tv/vexoulz' } })
    expect(site.tags).toBe(DEFAULT_TAGS)
    expect(admin.base).toBe('/backend-admin')
  })
})
