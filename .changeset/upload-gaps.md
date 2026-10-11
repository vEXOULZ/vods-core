---
'@vexoulz/vods-core': minor
---

Uploads carry the archive's `gaps` (a live recording's ad breaks, `Upload.gaps`), and `Timeline` places each upload's
footage where it was recorded: the delay is only what is missing before the first frame, and the gaps are skipped like
cuts. `PlayableTimeline` gains `missing` and `missingAt()`; the watch timeline hatches the missing spans and names them
on hover. Without gaps nothing changes.
