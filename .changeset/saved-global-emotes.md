---
"@vexoulz/vods-core": minor
---

`loadEmotes` uses the global 7TV / BTTV / FFZ sets the archive now saves with each VOD (`global_emotes`), so old chat shows the globals of that time. Rows saved before globals were kept (or whose 7TV capture failed) still get 7TV's current global set. `RawEmoteSets` gains `global_emotes`, `global_emotes_source` and `global_emotes_at`.
