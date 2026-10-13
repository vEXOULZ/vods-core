---
'@vexoulz/vods-core': minor
---

YouTube upload check on the overview: how much of the archive is on YouTube, and each VOD with a removed, rejected,
cut or blocked upload, a missing part or less than planned there, with Check now. `admin.youtubeVideos()` and
`admin.checkYoutubeVideos()` (twitch-archive's `/admin/youtube/videos`), and `youtubeCheckLine`, `percent`,
`sortedProblems`, `issueWhere`, `issueLink` and `YOUTUBE_ISSUES` in `/kit` for keeki's overview. Needs a worker with
the check; an older one shows no tile.
