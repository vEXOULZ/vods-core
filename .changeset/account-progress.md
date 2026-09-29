---
"@vexoulz/vods-core": minor
---

`AccountProgressStore`: watch progress kept with the viewer's vexoulz account (vexoulz-auth's `/v1/progress`), falling
back to the browser's `LocalProgressStore` while signed out or offline. `merge()` moves the local entries into the
account on sign-in, newest winning per VOD, in batches of `MERGE_BATCH`.
