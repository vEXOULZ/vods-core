---
"@vexoulz/vods-core": patch
---

Less work during playback and sign-in: the watch timeline places its fixed marks once per timeline instead of on
every tick, the emote menu re-renders only when it moves, 7TV's global emotes are fetched once, a synthetic VOD's
segments reuse the emotes they've loaded, and moving progress to the account rewrites local storage once per batch
(`LocalProgressStore.remove` takes several ids). Admin chapter and game checks share one span check.
