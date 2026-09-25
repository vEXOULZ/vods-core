# vods-core

The headless engine behind vods.vexoulz.net. It holds the logic the old React site had spread across its components,
with types and tests, and **no UI**. Components and styles live in [vexoulz-ui](https://github.com/vEXOULZ/vexoulz-ui);
the site puts the two together.

```bash
npm install
npm test            # vitest, against real VOD fixtures
npm run typecheck   # tsc
npm run build       # → dist/ (index.js, vue.js, types/)
npm run fixtures    # refresh tests/fixtures from the public archive API
git config core.hooksPath .githooks   # once per clone: branch-name rules, see CONTRIBUTING.md
```

`main` is merge-only and branches follow [Conventional Branch](https://conventional-branch.github.io/)
(`feature/…`, `bugfix/…`, `hotfix/…`, `release/…`, `chore/…`). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Using it

```bash
npm install github:vEXOULZ/vods-core#v0.1.0
```

```ts
// main.ts
import { defineVodsConfig } from '@vexoulz/vods-core'
import { createVods } from '@vexoulz/vods-core/vue'

const config = defineVodsConfig({
  channel: 'vEXOULZ',
  twitchId: '38656648',
  apiBase: 'https://vods.example.net/backend',
  startDate: '2024-09-16',
  defaultPartDuration: 10800, // optional; strings like "10800" are parsed
})
app.use(createVods(config))
```

```ts
// a watch page
const { vod, timeline } = useWatch(() => route.params.id as string)
const time = ref(0), playing = ref(false)
const watch = new WatchPlayer(timeline.value!)            // once the timeline exists
watch.on('time', (t) => (time.value = t))
watch.on('playing', (p) => (playing.value = p))
await mountYouTube(el, watch, { start: timeline.value!.resolveStart({ t: parseTimestamp(route.query.t as string) }) })
const { messages } = useChat({ vodId, time, playing, offset: chatOffset })
const { resume } = useProgress({ vodId, duration: () => vod.value?.duration ?? 0, time, playing })
```

## Modules

| module | what |
|---|---|
| `config` | `defineVodsConfig`: validates the channel settings and parses numbers (the old `REACT_APP_DEFAULT_DELAY` was a string and got concatenated). |
| `api` | `ArchiveClient`: `listVods` (title / exact game / date filters, combinable), `getVod`, `gamesPlayed`, `liveStream`, `vodEmotes`, `thirdPartyEmotes`, `badges`, `commentsAt` / `commentsAfter`. Normalizes VODs: chapter `end` becomes an absolute time (the API's `length`, or its older length-as-`end`), `duration` becomes seconds, box art prefers the `{width}x{height}` template, and chapters without a Twitch category are named `NO_CATEGORY`. |
| `time` | `parseTimestamp` (`1h2m3s`, `1:02:03`, seconds), `toHMS`, `toClock`, `toSeconds`. |
| `timeline` | `Timeline`: VOD time ↔ YouTube part + offset, restricted (cut) chapters, the start delay, chapter at a time, part spans, `?t=` / `?part=` resolution. |
| `player` | `WatchPlayer`: drives the YouTube IFrame player across parts: seeks, auto-advance, part errors (`missing` / `blocked` / `processing`), VOD-time ticks. `mountYouTube` wires the real player. |
| `chat` | `ChatReplay` (paged, prefetching, seek-aware), `loadEmotes` (the sets the archive saved for the VOD plus 7TV globals; for VODs without saved sets, the channel's current sets, which the archive caches), `tokenize` / `resolveBadges` / `toChatMessage` (render-ready tokens, never HTML). |
| `progress` | `LocalProgressStore` (browser storage) behind a `ProgressStore` interface an account-backed store can implement later. |
| `vue` | `createVods`, `useVods`, `useWatch`, `useChat`, `useProgress`. Import from `@vexoulz/vods-core/vue`. |

## The time model

A VOD is uploaded to YouTube as several parts. Restricted chapters (copyright) are cut out of the uploads, so the
parts laid end to end are the VOD with those spans removed. When the parts are shorter than the VOD minus the cuts,
the missing footage is at the start: the **delay**.

```
VOD time    0 ──── part 1 ──── part 2 ─┤ restricted ├─ part 3 ──── part 4 ─── end
upload time 0 ──── part 1 ──── part 2 ─┤─ part 3 ──── part 4 ─── end
```

- `?t=` is **VOD time**, the same clock as chapters, chat and Twitch's own VOD links. A time inside a cut starts at
  the end of the cut.
- The chat clock is VOD time minus the viewer's chat offset.
- Upload durations are fractional (8771.99 s); boundaries allow half a second of slack so a seek never lands a few
  milliseconds before the end of the previous part.

Twitch name colours (defaults and the readable mode) are in vexoulz-ui (`twitchColor`); messages carry the user's
own colour or `null`.

## Infrastructure

This repo is host-agnostic: it's a library, nothing more. Details about where or how the sites or the archive are
hosted (machines, addresses, proxy or tunnel config, server paths, deploy scripts) belong in the private
`homelab-docs` repo and must never be committed here. `.gitignore` blocks `.env*` (except `.env.example`),
`*.local.*` and `/deploy.local/` so local host files can't slip in. Test fixtures come from the public API, with
chatters' names replaced by placeholders.
