---
"@vexoulz/vods-core": minor
---

Remove `AdminClient.vods()` (GET /admin/vods) and its `AdminVodRow` type from the `kit` and `app` entries: nothing used them since Manage's list moved to `vodList()` (/api/v2/vods), which returns `VodListRow`s.
