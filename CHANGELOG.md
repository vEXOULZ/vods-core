# @vexoulz/vods-core

## 0.19.1

### Patch Changes

- 010363b: Manage: Start a job on a VOD the archive doesn't have yet says so and links to VODs → Add from Twitch (`/manage/vods?add=<id>`), instead of the worker's bare "no VOD".

## 0.19.0

### Minor Changes

- 2863a29: New `kit` entry: the app's logic without components, styles or vexoulz-ui, and `setupVodsSite()`, for a site that draws its own pages. `VodsSite.id` is now any string. The kit also exports the quiet admin check (`quietLoginUrl`, `recall`, `remember`, `forget`, `answerOf`, `shouldCheck`).

### Patch Changes

- 3f12ba6: The tab's title goes back to the site's name when you leave a VOD, a game page or a Manage page for one without a title of its own.

## 0.18.0

### Minor Changes

- 0a056b0: The vods site moves here from vexoulz-vods, so every vods site shares it: `@vexoulz/vods-core/app` has the pages,
  the Manage dashboard, the router and `createVodsApp()`, which takes the channel config and the site's branding
  (its vexoulz-ui site id, name, Twitch link and tags), the admin API's and vexoulz-auth's URLs and the commit.
  Its styles are `@vexoulz/vods-core/app.css`. `@vexoulz/vods-core/dev` has `adminMock()`, the dev server's admin
  API. The root and `vue` entries are unchanged. `@vexoulz/ui`, `vue-router` and (for `dev`) `vite` are new
  optional peers.

### Patch Changes

- a566618: Depend on `@vexoulz/platform-web` v0.3.0, the version the sites use, instead of v0.1.1.

## 0.17.0

### Minor Changes

- a14813d: VOD lists can filter by tags (`tags`, every one of them) and by when the footage was live (`firstLiveFrom`,
  `firstLiveBefore`, `lastLiveFrom`; the archive's `firstLiveAt`/`lastLiveAt` filters).

## 0.16.0

### Minor Changes

- b5f9fd9: Seek-bar previews: `Upload.preview` (the layout of the archive's preview sheets for an upload, or null) and
  `previewFrame(upload, offset, apiBase)`, the sheet URL and tile position nearest a moment of an upload.

## 0.15.1

### Patch Changes

- b712270: Depend on `@vexoulz/platform-web` v0.1.1, the version the sites use, so they install one copy.

## 0.15.0

### Minor Changes

- 17c2efc: Chat parsing (tokens, emote sets and images, badges, modifiers) moved to `@vexoulz/platform-web`, which doomtp-web
  shares; vods-core depends on it and re-exports the same names, so imports don't change. `ChatMessage` is now
  platform-web's `ChatLine` plus `at` and `source`. Also re-exports `chatName`, `removalNote`, `ChatLine` and `NameMode`.

## 0.14.0

### Minor Changes

- 519d2bf: Synthetic VODs: merges, splits and playthroughs made of windows of other VODs.
  
  - `Vod` gains `tags`, `synthetic` (its segments), `supersededBy` and `appearsIn`; `GameUpload` gains `sourceVodId`.
  - `SegmentTimeline` plays a synthetic VOD from its sources' uploads, each source keeping its own delay and cuts. It
    and `Timeline` share the `PlayableTimeline` interface, which `WatchPlayer` now takes; a part can start and stop
    inside its video (`partStart`, `partEnd`), and back-to-back clips of one video seek instead of reloading.
  - Each `Segment` has a `stream` (0-based): the archive can send it, else a new stream starts where the source VOD
    changes. `SegmentTimeline.streams()` gives each stream's span, and `clipInStream(i)` numbers a clip's video within
    its stream (for "S1-P2" labels), and `jumps()` lists where a stream skips ahead (or back) within its VOD.
  - `useWatch` loads a synthetic VOD's sources too (`sources`, `segments`); its `timeline` is a `PlayableTimeline`.
  - `useChat({ segments })` replays each segment's source chat, limited to the segment's window, and loads that
    source's emotes. It returns `vodId`: whose chat is showing.
  - `supersededTarget(vod, t)`: where a moment of a merged or split VOD plays now; `redirectTarget(vod, t)` also
    covers `mergedInto`. `pickUploadType` takes anything with `uploads`.
  - `vodListQuery({ tag })`: lists leave tagged VODs out unless asked (`compilation`, or `*` for all).
  - `Synthetic` gains `madeAt`, `changedAt` (when what it plays last changed), `firstLiveAt` and `lastLiveAt`.
  - Progress: finished entries are kept instead of removed (only a restart near 0 removes one), so a synthetic VOD
    that grows after someone finished it can resume where the new part starts. `resumeAt(p, { duration })` gives
    that position (the saved one, or the old end of a finished entry when the VOD is now longer), and
    `resumeProgress(p, duration)` the entry with `t` moved there; `isResumable`
    takes the same `duration`, and `useProgress`'s `resume.t` is that position. `isFinished(p)` is exported, and the
    stores' `endMargin` option is deprecated (unused).

## 0.13.0

### Minor Changes

- 587f256: Bot chat from the archive: comments carry their `source` (`replay` or `bot`), and `ChatMessage` gains `login`,
  `source`, `kind`/`noticeType` (subs, raids, redemptions), `action` (/me), `bits`, `reward` and `removed` (deleted or
  timed out, with the reason). `commentsAt` and `ChatReplay` take a `source`; `ChatReplay.sources` and `useChat`'s
  `sources` say how many messages each chat has, and `useChat({ chatSource })` switches chat live (`served` is the one
  shown). `loginOf` derives a username for replay messages.

## 0.12.0

### Minor Changes

- b531498: `AccountProgressStore`: watch progress kept with the viewer's vexoulz account (vexoulz-auth's `/v1/progress`), falling
  back to the browser's `LocalProgressStore` while signed out or offline. `merge()` moves the local entries into the
  account on sign-in, newest winning per VOD, in batches of `MERGE_BATCH`.

## 0.11.0

### Minor Changes

- 41da260: `emotePage()` links a 7TV, BTTV or FFZ emote to its page on the provider's site (null for Twitch emotes). Modifiers
  now carry their emote `id`, for their image or page.

## 0.10.0

### Minor Changes

- 4e5072d: Chat tokens stack zero-width emotes and carry emote modifiers. 7TV zero-width emotes (flag on the saved set entry or
  the emote), BTTV's overlay emotes and emotes after BTTV's `z!` become `overlays` of the emote before them. BTTV modifiers
  (`w! h! v! l! r! c! p! s!`) apply to the emote after them, FFZ's (`ffzW ffzX ffzY ffzCursed`) to the emote before, as
  `modifiers` on that layer. New exports: `EmoteToken`, `EmoteLayer`, `Modifier`, `ModifierEffect`, `modifierOf`,
  `BTTV_MODIFIERS`, `FFZ_MODIFIERS`, `BTTV_OVERLAYS`.

## 0.9.0

### Minor Changes

- 53f3e5c: `youtubeThumb(url, size)`: a YouTube thumbnail at another of YouTube's sizes (`mqdefault` 320×180, `maxresdefault`
  1280×720), for showing a VOD's thumbnail sharp when it's large or on high-density screens.

## 0.8.0

### Minor Changes

- 1dfad80: `WatchPlayer` reports playback speed: a `rate` event, fed by YouTube's `onPlaybackRateChange` through `mountYouTube`
  (or `handleRate` for other players).

## 0.7.0

### Minor Changes

- 103d131: Add `boxArt(url, width)` next to `vodThumbnail`, so every site sizes Twitch box art the same way. Chat replay does less
  work per tick: each comment is converted to a message once (not all 200 on screen on every update), badges are looked
  up in a per-payload index, and the badges payload is fetched once per client instead of on every VOD.
  
  `useVods` takes `{ append: true }` for "load more" lists and returns the last `page` loaded.

## 0.6.1

### Patch Changes

- c05bf2c: Chat: seeking past the last message is an empty chat instead of an error, and legacy-route errors show their
  `msg` (it said "true").

## 0.6.0

### Minor Changes

- 4dfe149: VOD merges and splits: chapters carry `kind` (`"gap"` for the cut a merge puts between two VODs of one broadcast,
  always restricted, left out of `gamesOf`), and `Vod.mergedInto` (`{id, offset}`, from the archive's `merged_into`)
  says where a merged-away VOD's footage lives now.

## 0.5.0

### Minor Changes

- c03996a: `vodThumbnail(vod)` and `watchPath(vod, t?)`: the thumbnail and watch-page path the vods site shows for a VOD, so
  other sites linking to a VOD (the stream card on vexoulz.net) pick the same ones.

## 0.4.0

### Minor Changes

- c7e6b41: `GamePlayed` gains `seconds` and `watchableSeconds`: how long each game was streamed in total, and how much of that
  can still be watched (without chapters cut from the uploads). Both are null when the archive doesn't send them.

## 0.3.0

### Minor Changes

- ea51b48: `loadEmotes` uses the global 7TV / BTTV / FFZ sets the archive now saves with each VOD (`global_emotes`), so old chat shows the globals of that time. Rows saved before globals were kept (or whose 7TV capture failed) still get 7TV's current global set. `RawEmoteSets` gains `global_emotes`, `global_emotes_source` and `global_emotes_at`.

## 0.2.0

### Minor Changes

- ffa7254: Uses the archive API's new endpoints.
  
  - `ArchiveClient.gamesPlayed()` reads `/v1/games-played` (every game with VOD and chapter counts, latest box art).
  - The game filter is exact (`chapters[name][$eq]`); `NO_CATEGORY` finds uncategorised chapters (`chapters[gameId]=null`).
  - `loadEmotes` keeps a VOD with saved sets to those (plus 7TV's global set, from `SEVENTV_GLOBAL`), so old chat shows
    what was an emote back then. VODs without saved sets use the archive-cached current sets (`/v1/emotes/third-party`,
    new `ArchiveClient.thirdPartyEmotes()`) instead of calling BTTV / FFZ / 7TV from the browser. **Breaking:** its
    `twitchId` option and the `EMOTE_API` export are gone.
  - Emote images load from each provider's official CDN (`cdn.7tv.app`, `cdn.betterttv.net`, `cdn.frankerfacez.com`,
    `static-cdn.jtvnw.net`), which fixes 7TV emotes whose ids were migrated.
  - Chapters use the archive's `length` and `imageTemplate` when present; VODs use `duration_seconds`. Chapters with no
    Twitch category are named `NO_CATEGORY` instead of crashing name-based code.
  - `useChat` renders the messages on screen again once emotes or badges finish loading, so comments that arrive first
    (e.g. right after a seek) no longer stay plain text.

## 0.1.0

### Minor Changes

- 8324817: First release: archive API client, timeline (parts, restricted chapters, delay), YouTube player control, chat replay with emotes and badges, local watch progress, and Vue composables.
