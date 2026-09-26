// Chat replay: feed it the chat clock (VOD seconds) and it hands back the comments that are now due.
// It pages through the archive's 200-comment pages with the cursor, prefetching the next page before it's needed,
// and starts over at the new position when the clock jumps (a seek, a part change, a delay change).
import type { RawComment, RawCommentPage } from '../api/types'

export interface CommentSource {
  commentsAt(vodId: string, offset: number, signal?: AbortSignal): Promise<RawCommentPage>
  commentsAfter(vodId: string, cursor: string, signal?: AbortSignal): Promise<RawCommentPage>
}

export interface ReplayOptions {
  /** How far the clock may move backwards before it counts as a seek (seconds). */
  backTolerance?: number
  /** How far the clock may jump forwards before it counts as a seek (seconds). */
  jumpTolerance?: number
  /** On a seek, how many comments from just before the new position to show as backlog. */
  backlog?: number
  /** Start fetching the next page when this many comments are left in the current one. */
  prefetchAt?: number
}

export interface ReplayUpdate {
  /** True when the clock jumped: throw away what's shown and show `comments` instead. */
  reset: boolean
  /** Comments now due, oldest first. */
  comments: RawComment[]
}

export class ChatReplay {
  private buffer: RawComment[] = []
  private index = 0
  private cursor: string | undefined
  private next: Promise<RawCommentPage | null> | null = null
  private last: number | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private ctrl = new AbortController()
  private readonly opts: Required<ReplayOptions>

  constructor(
    private readonly source: CommentSource,
    readonly vodId: string,
    opts: ReplayOptions = {},
  ) {
    this.opts = { backTolerance: 1.5, jumpTolerance: 10, backlog: 50, prefetchAt: 40, ...opts }
  }

  /** Comments due at `t`. Calls are queued, so a slow page load never interleaves with the next tick. */
  update(t: number): Promise<ReplayUpdate> {
    const run = this.chain.then(() => this.step(t))
    this.chain = run.catch(() => undefined)
    return run
  }

  /** Forget the position; the next update fetches fresh. */
  reset(): void {
    this.ctrl.abort()
    this.ctrl = new AbortController()
    this.buffer = []
    this.index = 0
    this.cursor = undefined
    this.next = null
    this.last = null
  }

  /** Stop any fetches (unmount). */
  dispose(): void {
    this.reset()
  }

  private get signal() {
    return this.ctrl.signal
  }

  private isSeek(t: number): boolean {
    if (this.last === null) return true
    return t < this.last - this.opts.backTolerance || t > this.last + this.opts.jumpTolerance
  }

  private async step(t: number): Promise<ReplayUpdate> {
    if (this.isSeek(t)) return this.seek(t)
    this.last = t
    const due: RawComment[] = []
    for (;;) {
      while (this.index < this.buffer.length && this.buffer[this.index]!.content_offset_seconds <= t) {
        due.push(this.buffer[this.index++]!)
      }
      this.prefetch()
      if (this.index < this.buffer.length || !this.next) break
      // Ran off the end of the page: wait for the next one and keep going.
      const page = await this.next
      this.next = null
      if (!page) break
      this.adopt(page, false)
    }
    return { reset: false, comments: due }
  }

  private async seek(t: number): Promise<ReplayUpdate> {
    this.reset()
    const signal = this.signal
    const page = await this.source.commentsAt(this.vodId, t, signal)
    if (signal.aborted) return { reset: true, comments: [] }
    this.last = t
    this.adopt(page, true)
    let i = 0
    while (i < this.buffer.length && this.buffer[i]!.content_offset_seconds <= t) i++
    this.index = i
    this.prefetch()
    return { reset: true, comments: this.buffer.slice(Math.max(0, i - this.opts.backlog), i) }
  }

  private adopt(page: RawCommentPage, replace: boolean): void {
    const comments = (page.comments ?? []).filter((c) => c.message && c.message.length > 0)
    // When appending, drop what was already shown so the buffer doesn't grow for the whole VOD.
    this.buffer = replace ? comments : this.buffer.slice(this.index).concat(comments)
    this.index = 0
    this.cursor = page.cursor || undefined
  }

  private prefetch(): void {
    if (this.next || !this.cursor) return
    if (this.buffer.length - this.index > this.opts.prefetchAt) return
    const cursor = this.cursor
    const signal = this.signal
    this.cursor = undefined
    this.next = this.source.commentsAfter(this.vodId, cursor, signal).catch((e: unknown) => {
      if (signal.aborted) return null
      // Put the cursor back so the next tick retries.
      this.cursor = cursor
      this.next = null
      throw e
    })
    // Handled by whoever awaits it; don't report it as unhandled in between.
    this.next.catch(() => undefined)
  }
}
