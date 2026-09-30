---
'@vexoulz/vods-core': minor
---

Bot chat from the archive: comments carry their `source` (`replay` or `bot`), and `ChatMessage` gains `login`,
`source`, `kind`/`noticeType` (subs, raids, redemptions), `action` (/me), `bits`, `reward` and `removed` (deleted or
timed out, with the reason). `commentsAt` and `ChatReplay` take a `source`; `ChatReplay.sources` and `useChat`'s
`sources` say how many messages each chat has, and `useChat({ chatSource })` switches chat live (`served` is the one
shown). `loginOf` derives a username for replay messages.
