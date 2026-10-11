---
'@vexoulz/vods-core': minor
---

Manage's Overview gains a "Twitch (ad-free)" tile: the broadcaster links the Twitch account live recordings are asked
for as (one with no ads on the channel, so the recording has no ad gaps) with Twitch's device flow, or by pasting a
token, and can switch or unlink it. `Health.twitchViewer` and the `AdminClient.twitchViewer*` methods talk to the
worker's `/admin/twitch/viewer` routes; a worker without them hides the tile.
