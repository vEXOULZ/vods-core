---
"@vexoulz/vods-core": minor
---

Batch actions on /manage/vods: tick VODs to queue them to archive, refetch their chapters, chat or emotes, hide or show
them, or add or take off a tag (`useVodBatch`, `vodBatchTargets` and `VOD_BATCH` in `/kit`, on the new
`admin.patchVod`). An Upload filter (All, Archived, Details only, Stuck) uses the worker's new `uploaded` and `busy`
list filters. The overview gains tiles for the YouTube quota spent today (`Health.youtube.quota`), the stuck VODs and
the disk, with their words in `/kit` (`quotaLine`, `stuckLine`, `diskLine`, `stuckVods`) for other sites' overviews.
Needs twitch-archive with the quota count and the list filters.
