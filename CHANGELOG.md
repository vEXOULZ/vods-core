# @vexoulz/vods-core

## 0.31.0

### Minor Changes

- 4344b00: Manage: censor ranges per VOD (blur, black out or mute stretches of the YouTube uploads), deleting uploads from YouTube, and re-archiving a VOD or one part so its old uploads are replaced. The admin client gains `saveCensor`, `deleteUploads` and `rearchive`, `AdminVod.censor`, and the censor draft helpers in `/kit`; the dev mock serves the three routes.

## 0.30.0

### Minor Changes

- ddcb477: Batch actions on /manage/vods: tick VODs to queue them to archive, refetch their chapters, chat or emotes, hide or show
  them, or add or take off a tag (`useVodBatch`, `vodBatchTargets` and `VOD_BATCH` in `/kit`, on the new
  `admin.patchVod`). An Upload filter (All, Archived, Details only, Stuck) uses the worker's new `uploaded` and `busy`
  list filters. The overview gains tiles for the YouTube quota spent today (`Health.youtube.quota`), the stuck VODs and
  the disk, with their words in `/kit` (`quotaLine`, `stuckLine`, `diskLine`, `stuckVods`) for other sites' overviews.
  Needs twitch-archive with the quota count and the list filters.
- 705818b: YouTube upload check on the overview: how much of the archive is on YouTube, and each VOD with a removed, rejected,
  cut or blocked upload, a missing part or less than planned there, with Check now. `admin.youtubeVideos()` and
  `admin.checkYoutubeVideos()` (twitch-archive's `/admin/youtube/videos`), and `youtubeCheckLine`, `percent`,
  `sortedProblems`, `issueWhere`, `issueLink` and `YOUTUBE_ISSUES` in `/kit` for keeki's overview. Needs a worker with
  the check; an older one shows no tile.

## 0.29.0

### Minor Changes

- df7efbc: Admin VODs table gets a Status column (uploaded, details only, and each VOD's queued, running or paused jobs, linked to the job) and a "Find on Twitch" button; `/kit` exports `uploadStatus` and `jobStatus` so sites word statuses the same way.

## 0.28.0

### Minor Changes

- 64c6007: Admin client: `twitchVideos()` lists the channel's VODs still on Twitch with what the archive has of each, and `importFromTwitch(vodIds, paused?)` queues archive jobs for them, paused before their first step by default (twitch-archive's `/admin/twitch/videos` and `/admin/twitch/import`; the dev mock has both).

## 0.27.2

### Patch Changes

- 54448fe: The `app` entry imports `@vexoulz/ui/platform.css` instead of keeping its own copy of the `--vxp-*` mapping, so a
  site on the `app` entry needs `@vexoulz/ui` v0.23.0 or later. Inside the site shell, platform-web's accent (Manage's
  primary buttons, accent chips, chat tags and notices) is now the site's accent instead of the neutral one.

## 0.27.1

### Patch Changes

- 9eaf492: Watch timeline and chapters editor hatch with `@vexoulz/ui`'s `--vx-hatch*` tokens (ui v0.22.0, platform-web v0.5.0). Cuts are a little brighter, and restricted chapters in the editor use the finer -45° stripe.

## 0.27.0

### Minor Changes

- 15da5ef: The quiet admin check no longer leaves the page. `installVodsSession` mints a one-time code at vexoulz-auth
  (`POST /v1/codes`, vexoulz-auth ≥ v0.3.0) and hands it to the worker (`POST /admin/session {code}`, twitch-archive
  ≥ v0.14.0), so an admin signed in to the account gets the dashboard session, and Manage, without a reload; a viewer,
  someone signed out, or an answer it can't read shows nothing and isn't asked again until the next page load. Nothing
  is kept in localStorage or sessionStorage, and the `?admin=` answer is gone from URLs. The archive's client id is a
  new option, `adminClientId` on `createVodsApp()` and `installVodsSession()` (default `vods-admin`). New in the `kit`
  entry: `quietAdminCheck`, `signInWithCode`, `ADMIN_CLIENT_ID`, `AdminCheck` and `AuthRequests`.
  
  **Breaking (kit):** `answerOf`, `recall`, `remember`, `forget`, `shouldCheck`, the `Answer` type and `quietLoginUrl`
  are removed. A site that wired the check itself calls `installVodsSession(router, account)` instead, and drops
  `forget()` from its sign-out. The dev mock serves a fake vexoulz-auth at `/auth-mock` and the worker's code hand-off;
  `MOCK_ADMIN_QUIET` is gone (sign in with `?as=viewer` or `MOCK_ACCOUNT=viewer` instead).

## 0.26.0

### Minor Changes

- 5f4bf4c: The kit exports `viewerTile` and `linkTwitch`, so a site with its own Manage screens can show the ad-free Twitch account tile.

## 0.25.0

### Minor Changes

- cd5f120: Manage's Overview gains a "Twitch (ad-free)" tile: the broadcaster links the Twitch account live recordings are asked
  for as (one with no ads on the channel, so the recording has no ad gaps) with Twitch's device flow, or by pasting a
  token, and can switch or unlink it. `Health.twitchViewer` and the `AdminClient.twitchViewer*` methods talk to the
  worker's `/admin/twitch/viewer` routes; a worker without them hides the tile.
- b6e3418: Uploads carry the archive's `gaps` (a live recording's ad breaks, `Upload.gaps`), and `Timeline` places each upload's
  footage where it was recorded: the delay is only what is missing before the first frame, and the gaps are skipped like
  cuts. `PlayableTimeline` gains `missing` and `missingAt()`; the watch timeline hatches the missing spans and names them
  on hover. Without gaps nothing changes.

## 0.24.0

### Minor Changes

- eb2690f: The archive and admin clients throw `@vexoulz/platform-web`'s `ProblemError` (platform-web 0.4.0), which the root entry
  re-exports. `ApiError`, `AdminApiError` and the kit's `errorMessage` are gone: use `ProblemError`, `errorText()` and, for
  a rate-limited login, `retryAfterText()`. A 409's split points and later edits come from `validPoints(e)` and
  `editedSince(e)`.

### Patch Changes

- 86ee049: VodCard's missing thumbnail and Most played's missing box art use vexoulz-ui 0.21's `<VxPlaceholder flush>` instead of
  restyling `.vx-ph` through `:deep()`. `NoThumbnail` takes `flush`.

## 0.23.0

### Minor Changes

- a61be88: The kit exports the wiring `createVodsApp()` uses around its router, so a site with its own UI stops copying it:
  `vodsRoutes(pages)` (the route table, with the site's own pages) and `installVodsSession(router, account, { manageLogin })`
  (the Manage guard, the expired-session handler, the tab title, the quiet admin check, and watch progress that follows
  the account; it returns the `progress` store for `createVods`). The Manage guard now matches only `/manage` and the
  pages under it (`isManagePath`), not `/managefoo`.
- 1a46fb8: kit: export `useWatchView`, `useTimeline`, `useSplice` and `useChaptersDraft` (the logic of WatchView, WatchTimeline, SplicePanel and ChaptersEditor, which now use them), plus `partOffset`, `streamEntered`, `clamp`, `clampX` and the `Notify` type, so a site with its own UI binds its markup to them instead of copying the scripts. WatchTimeline's `time` prop also takes a getter, and the watch page no longer re-renders on every player tick: only its clock line does.
- a1e5827: The built-in tags (`DEFAULT_TAGS`) are colored with `var(--vods-tag-new)`, `var(--vods-tag-updated)` and `var(--vods-tag-complete)` instead of Deep Field's `--vx-accent`, `--vx-info` and `--vx-ok`. `createVodsApp()` maps them to those, so a vexoulz-ui site looks the same. A site with its own UI (the `kit` entry) now defines `--vods-tag-*` itself and no longer needs to alias `--vx-*`.
- ce6872b: Remove `AdminClient.vods()` (GET /admin/vods) and its `AdminVodRow` type from the `kit` and `app` entries: nothing used them since Manage's list moved to `vodList()` (/api/v2/vods), which returns `VodListRow`s.

### Patch Changes

- 7b350db: The dev entry's mock archive checks tag names and colors with the site's own rules (`isTagColor`, `TAG_NAME`, now in an import-free `lib/tagRules.ts` that `vodTags` re-exports) instead of a copy.
- a851f48: `SegmentTimeline.locate` finds the clip by binary search instead of scanning every clip, with the same results.

## 0.22.1

### Patch Changes

- Depends on `@vexoulz/platform-web` v0.3.1 (emote image URLs built once, `usePoll` idle on hidden tabs).
- ef4dacf: Less work during playback and sign-in: the watch timeline places its fixed marks once per timeline instead of on
  every tick, the emote menu re-renders only when it moves, 7TV's global emotes are fetched once, a synthetic VOD's
  segments reuse the emotes they've loaded, and moving progress to the account rewrites local storage once per batch
  (`LocalProgressStore.remove` takes several ids). Admin chapter and game checks share one span check.

## 0.22.0

### Minor Changes

- 48f3b92: `createVodsApp()` takes the site's own art (`art.noThumbnail`, `art.twitchGlyph`) for a VOD with no thumbnail and the Twitch mark on Manage and "Sign in with Twitch"; without it the app draws plain placeholders.

## 0.21.0

### Minor Changes

- 816147c: The admin health's `youtube` carries `connectedAt` and `refreshTokenExpiresAt`. The overview's YouTube tile shows how long the token has left ("token ends in 5 days", in the warning colour under two days), or when it was connected if Google gave no end.

## 0.20.0

### Minor Changes

- 26f15f0: The admin health's `youtube` carries the `channel` uploads go to. The overview's YouTube tile links it, says "No channel" when the connected account has none, and offers "Switch account" while connected.

## 0.19.2

### Patch Changes

- c1b7f5e: Tag colors take any site's theme tokens (`var(--k-accent)`, `oklch(from var(--k-ok) calc(l - 0.1) c h)`), not only `var(--vx-…)`, so keeki's swatches and relative colors validate. The admin mock checks the same.

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
