---
'@vexoulz/vods-core': minor
---

`GamePlayed` gains `seconds` and `watchableSeconds`: how long each game was streamed in total, and how much of that
can still be watched (without chapters cut from the uploads). Both are null when the archive doesn't send them.
