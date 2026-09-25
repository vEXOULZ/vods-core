---
'@vexoulz/vods-core': minor
---

Uses the archive API's new endpoints.

- `ArchiveClient.gamesPlayed()` reads `/v1/games-played` (every game with VOD and chapter counts, latest box art).
- The game filter is exact (`chapters[name][$eq]`); `NO_CATEGORY` finds uncategorised chapters (`chapters[gameId]=null`).
- `loadEmotes` takes the VOD's saved sets, then the archive-cached 7TV / BTTV / FFZ sets (`/v1/emotes/third-party`,
  new `ArchiveClient.thirdPartyEmotes()`), so browsers never call the providers' APIs. **Breaking:** its `twitchId` and
  `fetch` options and the `EMOTE_API` export are gone.
- Emote images load from each provider's official CDN (`cdn.7tv.app`, `cdn.betterttv.net`, `cdn.frankerfacez.com`,
  `static-cdn.jtvnw.net`), which fixes 7TV emotes whose ids were migrated.
- Chapters use the archive's `length` and `imageTemplate` when present; VODs use `duration_seconds`. Chapters with no
  Twitch category are named `NO_CATEGORY` instead of crashing name-based code.
