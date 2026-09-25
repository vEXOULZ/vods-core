---
'@vexoulz/vods-core': patch
---

Emotes load from each provider's official CDN (`cdn.7tv.app`, `cdn.betterttv.net`, `cdn.frankerfacez.com`,
`static-cdn.jtvnw.net`) instead of a third-party mirror, which fixes 7TV emotes whose ids were migrated.
New `ArchiveClient.gamesPlayed()` and `aggregateGames()` list every game in the archive (most played first, with
VOD counts and latest box art). Chapters without a Twitch category (stored as `null`) are named `NO_CATEGORY`.
