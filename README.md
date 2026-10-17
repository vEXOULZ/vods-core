# vods-core

The engine and the app behind the vods sites: [vods.vexoul.net](https://github.com/vexouLuna/vex-vods) and
[keekivods.vexoul.net](https://github.com/vexouLuna/keeki-vods). Four parts:

- **the root entry and `vue`**: headless. The logic the old React site had spread across its components, with types
  and tests, and no UI.
- **`app`**: the site itself, its pages, the Manage dashboard (the archive's admin pages) and the router, built from
  the headless parts and [vex-ui](https://github.com/vexouLuna/vex-ui). A site calls `createVodsApp()` with its
  channel and branding, and that's all it holds.
- **`kit`**: the app without its look, for a site that draws its own pages (keekivods.vexoul.net): the pages' and
  Manage's logic (list filters, tags, most played, chat settings, the admin API and its editors' drafts) and
  `setupVodsSite()`. Nothing in it imports vex-ui.
- **`dev`**: `adminMock()`, a vite plugin that serves an in-memory admin API, for working on the Manage pages
  without a worker.

```bash
npm install
npm test            # vitest, against real VOD fixtures
npm run typecheck   # vue-tsc
npm run build       # → dist/ (index.js, vue.js, app.js, app.css, dev.js, types/)
npm run fixtures    # refresh tests/fixtures from the public archive API
git config core.hooksPath .conventions/githooks   # once per clone: branch-name rules, see CONTRIBUTING.md
```

`main` is merge-only and branches follow [Conventional Branch](https://conventional-branch.github.io/)
(`feature/…`, `bugfix/…`, `hotfix/…`, `release/…`, `chore/…`). See [CONTRIBUTING.md](CONTRIBUTING.md).

## A site

A vods site is `index.html`, its assets, and a `main.ts`:

```bash
npm install github:vexouLuna/vods-core#vX.Y.Z github:vexouLuna/vex-ui#vX.Y.Z github:vexouLuna/vex-platform-web#vX.Y.Z vue vue-router
```

```ts
// main.ts
import '@vex/ui/fonts.css'
import '@vex/ui/style.css'
import '@vex/platform-web/style.css'
import '@vex/vods-core/app.css'

import { defineVodsConfig } from '@vex/vods-core'
import { createVodsApp } from '@vex/vods-core/app'
import { VxNoThumbnail, VxTwitchGlyph } from '@vex/ui'

const { app } = createVodsApp({
  config: defineVodsConfig({ channel: 'vexouLuna', twitchId: '38656648', apiBase: '/backend', startDate: '2024-09-16' }),
  site: { id: 'vods', name: 'vods.vexoul.net', twitchUrl: 'https://twitch.tv/vexouluna' },
  adminBase: '/backend-admin',          // the worker's admin API (the default)
  authBase: 'https://auth.vexoul.net',  // vex-auth; empty (the default) turns sign-in off
  adminClientId: 'vods-admin',          // the archive's client id at vex-auth (the default)
  commit: __COMMIT__,                   // shown in the footer
  art: { noThumbnail: VxNoThumbnail, twitchGlyph: VxTwitchGlyph }, // the site's own art; placeholders without
})
app.mount('#app')
```

| option | what |
|---|---|
| `config` | The channel and its archive API (`defineVodsConfig`, below). |
| `site.id` | The site's entry in vex-ui's `SITES`: its accent, sky, switcher entry and repo links. A new site is added there first. |
| `site.name` | Its host, in page titles and on the Manage sign-in page. |
| `site.twitchUrl` | The channel's Twitch page: the nav's "Live" and the watch page's link. |
| `site.perPage` | VOD cards per page (24). |
| `site.tags` | How VOD tags show until the archive has its own (edited on /manage/tags); `DEFAULT_TAGS` otherwise. |
| `adminClientId` | The archive's client id at vex-auth (the worker's `ARCHIVE_ADMIN_AUTH_CLIENT_ID`), for the quiet admin check that shows an admin Manage without a reload (docs/admin-api.md, 1c). Default `vods-admin`. |
| `art.noThumbnail` | A component for a VOD with no thumbnail (fills a 16:9 box). Default: a plain placeholder. |
| `art.twitchGlyph` | Twitch's mark on the Manage button and "Sign in with Twitch" (16 px). Default: a placeholder. |

The `/backend` and `/backend-admin` paths are the archive's API and the worker's admin API on the site's own origin;
the server in front of the site forwards them. In dev, the site's `vite.config.ts` proxies `/backend` to the public
API and serves `/backend-admin` with the mock:

```ts
import { adminMock } from '@vex/vods-core/dev'
plugins: [vue(), adminMock('/backend-admin', 'https://vods.vexoul.net/backend')]
```

The mock also serves a fake vex-auth at `/auth-mock`: with `VITE_AUTH_BASE=/auth-mock`, "Sign in" signs in the
fake admin (`?as=viewer` on its `/login`, or `MOCK_ACCOUNT=viewer`, signs in a plain viewer), and the quiet admin check
runs against it. `MOCK_AUTH_CODES=<status>` and `MOCK_ADMIN_CODE=<status>` make the code mint or its hand-off fail.

## Using the engine on its own

```ts
// main.ts
import { defineVodsConfig } from '@vex/vods-core'
import { createVods } from '@vex/vods-core/vue'

const config = defineVodsConfig({
  channel: 'vexouLuna',
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
const { messages, sources, served } = useChat({ vodId, time, playing, offset: chatOffset, chatSource })  // chatSource: 'auto' | 'replay' | 'bot'
const { resume } = useProgress({ vodId, duration: () => vod.value?.duration ?? 0, time, playing })
```

## Modules

| module | what |
|---|---|
| `config` | `defineVodsConfig`: validates the channel settings and parses numbers (the old `REACT_APP_DEFAULT_DELAY` was a string and got concatenated). |
| `api` | `ArchiveClient`: `listVods` (title / exact game / date filters, combinable), `getVod`, `gamesPlayed`, `liveStream`, `vodEmotes`, `thirdPartyEmotes`, `badges`, `commentsAt` / `commentsAfter`. Normalizes VODs: chapter `end` becomes an absolute time (the API's `length`, or its older length-as-`end`), `duration` becomes seconds, box art prefers the `{width}x{height}` template, and chapters without a Twitch category are named `NO_CATEGORY`. |
| `time` | `parseTimestamp` (`1h2m3s`, `1:02:03`, seconds), `toHMS`, `toClock`, `toSeconds`. |
| `timeline` | `Timeline`: VOD time ↔ YouTube part + offset, restricted (cut) chapters, a live recording's gaps (`missing`), the start delay, chapter at a time, part spans, `?t=` / `?part=` resolution. |
| `composite` | `SegmentTimeline`: a synthetic VOD (a merge, a split, a playthrough) played from windows of other VODs, with the same surface as `Timeline` (`PlayableTimeline`) plus `segmentAt` for chat; `supersededTarget` for links to a VOD a merge or split replaced. |
| `player` | `WatchPlayer`: drives the YouTube IFrame player across parts: seeks, auto-advance, part errors (`missing` / `blocked` / `processing`), VOD-time ticks, playback speed. `mountYouTube` wires the real player. |
| `chat` | `ChatReplay` (paged, prefetching, seek-aware), `loadEmotes` (the channel and global sets the archive saved for the VOD, with today's 7TV globals only for rows saved before globals were kept; for VODs without saved sets, the channel's current sets, which the archive caches), `tokenize` / `resolveBadges` / `toChatMessage` (render-ready tokens, never HTML; zero-width emotes come as overlays of the emote they cover, BTTV / FFZ modifiers as effects on the emote they apply to). Chat has two sources: Twitch's replay of the VOD (`replay`) and doomtp-bot's live log (`bot`, with notices, redeems, cheers and removed messages, all on `ChatMessage`); `ChatReplay`'s `source` option picks one, and `sources` has how many messages each has. `loginOf` gives a username (the bot's, or a plain-ASCII display name in lower case). |
| `progress` | `LocalProgressStore` (browser storage) behind a `ProgressStore` interface. `AccountProgressStore` keeps it with the viewer's vexoul.net account instead (see below). |
| `vue` | `createVods`, `useVods`, `useWatch`, `useChat`, `useProgress`. Import from `@vex/vods-core/vue`. |
| `app` | `createVodsApp` and the site (`src/app/`): pages, components, the Manage dashboard, the router. Import from `@vex/vods-core/app`, with its styles from `@vex/vods-core/app.css`. |
| `kit` | `setupVodsSite`, `vodsRoutes` and `installVodsSession` (the route table and the router's account and Manage wiring, with the site's own pages and account), and the app's logic without components or styles (`src/app/kit.ts`): `lib/`, `composables/`, the admin API (`AdminClient`, `admin`, `session`, `platform`) and the Manage editors' drafts, and the logic of the watch page, its timeline, merge and split, and the chapter editor (`useWatchView`, `useTimeline`, `useSplice`, `useChaptersDraft`) for a site to bind its own markup to. Import from `@vex/vods-core/kit`, alongside `vue`. Needs `@vex/platform-web`, never `@vex/ui`. |
| `dev` | `adminMock`, the dev server's admin API. Import from `@vex/vods-core/dev` in a vite config. |

## Progress with an account

`AccountProgressStore` keeps where the viewer left off in their vexoul.net account (vex-auth's `/v1/progress`),
so it follows them to another browser. It takes the account from `@vex/ui/account` (anything with `signedIn()`
and `request()`); while signed out, or when the service can't be reached, it uses the browser's
`LocalProgressStore`. Call `merge()` on sign-in to move the local entries into the account (newest wins per VOD).

```ts
const account = createAccount({ authBase: import.meta.env.VITE_AUTH_BASE })
const progress = new AccountProgressStore({ signedIn: () => !!account.user.value, request: account.request })
app.use(account).use(createVods(config, { progress }))
watch(account.user, (u, before) => u && !before && progress.merge())
```

## The time model

A VOD is uploaded to YouTube as several parts. Restricted chapters (copyright) are cut out of the uploads, so the
parts laid end to end are the VOD with those spans removed. A live recording also misses the ads Twitch stitches into
the stream: each upload's `gaps` (from the archive's `youtube[].gaps`) say where in that upload, and for how long, the
VOD skips ahead. They hold for that upload set only (the `vod` uploads have the whole VOD), and the timeline lists them
as `missing` spans, hatched on the bar. Whatever else the parts are short of the VOD is missing at the start: the
**delay** (`duration − parts − gaps − cuts`).

```
VOD time    0 ──── part 1 ──── part 2 ─┤ restricted ├─ part 3 ──── part 4 ─── end
upload time 0 ──── part 1 ──── part 2 ─┤─ part 3 ──── part 4 ─── end
```

- `?t=` is **VOD time**, the same clock as chapters, chat and Twitch's own VOD links. A time inside a cut or a gap
  starts at its end.
- The chat clock is VOD time minus the viewer's chat offset.
- Upload durations are fractional (8771.99 s); boundaries allow half a second of slack so a seek never lands a few
  milliseconds before the end of the previous part.

Twitch name colours (defaults and the readable mode) are in vex-ui (`twitchColor`); messages carry the user's
own colour or `null`.

## Infrastructure

This repo is host-agnostic: it's a library, and the sites built on it are static files. Details about where or how the sites or the archive are
hosted (machines, addresses, proxy or tunnel config, server paths, deploy scripts) belong in the private
`homelab-docs` repo and must never be committed here. `.gitignore` blocks `.env*` (except `.env.example`),
`*.local.*` and `/deploy.local/` so local host files can't slip in. Test fixtures come from the public API, with
chatters' names replaced by placeholders.
