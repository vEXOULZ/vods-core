---
"@vexoulz/vods-core": minor
---

Admin client: `twitchVideos()` lists the channel's VODs still on Twitch with what the archive has of each, and `importFromTwitch(vodIds, paused?)` queues archive jobs for them, paused before their first step by default (twitch-archive's `/admin/twitch/videos` and `/admin/twitch/import`; the dev mock has both).
