---
"@vexoulz/vods-core": minor
---

Add `boxArt(url, width)` next to `vodThumbnail`, so every site sizes Twitch box art the same way. Chat replay does less
work per tick: each comment is converted to a message once (not all 200 on screen on every update), badges are looked
up in a per-payload index, and the badges payload is fetched once per client instead of on every VOD.

`useVods` takes `{ append: true }` for "load more" lists and returns the last `page` loaded.
