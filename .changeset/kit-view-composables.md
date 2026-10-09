---
"@vexoulz/vods-core": minor
---

kit: export `useWatchView`, `useTimeline`, `useSplice` and `useChaptersDraft` (the logic of WatchView, WatchTimeline, SplicePanel and ChaptersEditor, which now use them), plus `partOffset`, `streamEntered`, `clamp`, `clampX` and the `Notify` type, so a site with its own UI binds its markup to them instead of copying the scripts. WatchTimeline's `time` prop also takes a getter, and the watch page no longer re-renders on every player tick: only its clock line does.
