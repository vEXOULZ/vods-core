---
"@vexoulz/vods-core": minor
---

Manage: a DTP bot tile on the overview (whether the worker reaches doomtp-bot and the bot is in chat, from `Health.doomtp`),
and the overview's YouTube uploads list only VODs from the last 14 days; the rest are on the new `/manage/youtube` page
(`YoutubeProblems`, linked from the Manage bar). `VodsPages.manage` takes a `youtube` page. The kit adds `DoomtpStatus`,
`doomtpLine`, `splitProblems` and `RECENT_PROBLEM_DAYS`, and `YoutubeVodReport.createdAt`.
