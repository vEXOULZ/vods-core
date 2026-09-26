# @vexoulz/vods-core

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
