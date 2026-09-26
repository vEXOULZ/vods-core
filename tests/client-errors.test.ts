import { describe, expect, it, vi } from 'vitest'
import { ApiError, ArchiveClient } from '../src/api/client'

const client = (status: number, body: unknown) =>
  new ArchiveClient({ apiBase: '', fetch: vi.fn(async () => new Response(JSON.stringify(body), { status })) })

describe('ArchiveClient errors', () => {
  it("reads the legacy routes' msg, not their error flag", async () => {
    const err = await client(500, { error: true, msg: 'Failed to parse cursor' }).commentsAfter('1', 'x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toBe('Failed to parse cursor')
  })

  it('treats "nothing said after this offset" as an empty page', async () => {
    const page = await client(500, { error: true, msg: 'Failed to retrieve comments from offset 18960.0' }).commentsAt('1', 18960)
    expect(page).toEqual({ comments: [] })
    await expect(client(500, { error: true, msg: 'Failed to retrieve vod 1' }).commentsAt('1', 0)).rejects.toThrow('Failed to retrieve vod 1')
  })
})
