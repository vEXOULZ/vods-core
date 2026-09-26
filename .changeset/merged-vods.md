---
"@vexoulz/vods-core": minor
---

VOD merges and splits: chapters carry `kind` (`"gap"` for the cut a merge puts between two VODs of one broadcast,
always restricted, left out of `gamesOf`), and `Vod.mergedInto` (`{id, offset}`, from the archive's `merged_into`)
says where a merged-away VOD's footage lives now.
