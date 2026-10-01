---
"@vexoulz/vods-core": minor
---

Synthetic VODs: merges, splits and playthroughs made of windows of other VODs.

- `Vod` gains `tags`, `synthetic` (its segments), `supersededBy` and `appearsIn`; `GameUpload` gains `sourceVodId`.
- `SegmentTimeline` plays a synthetic VOD from its sources' uploads, each source keeping its own delay and cuts. It
  and `Timeline` share the `PlayableTimeline` interface, which `WatchPlayer` now takes; a part can start and stop
  inside its video (`partStart`, `partEnd`), and back-to-back clips of one video seek instead of reloading.
- `useWatch` loads a synthetic VOD's sources too (`sources`, `segments`); its `timeline` is a `PlayableTimeline`.
- `useChat({ segments })` replays each segment's source chat, limited to the segment's window, and loads that
  source's emotes.
- `supersededTarget(vod, t)`: where a moment of a merged or split VOD plays now.
- `vodListQuery({ tag })`: lists leave tagged VODs out unless asked (`compilation`, or `*` for all).
