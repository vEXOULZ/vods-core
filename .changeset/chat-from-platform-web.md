---
"@vexoulz/vods-core": minor
---

Chat parsing (tokens, emote sets and images, badges, modifiers) moved to `@vexoulz/platform-web`, which doomtp-web
shares; vods-core depends on it and re-exports the same names, so imports don't change. `ChatMessage` is now
platform-web's `ChatLine` plus `at` and `source`. Also re-exports `chatName`, `removalNote`, `ChatLine` and `NameMode`.
