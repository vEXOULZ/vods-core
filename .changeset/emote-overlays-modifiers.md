---
'@vexoulz/vods-core': minor
---

Chat tokens stack zero-width emotes and carry emote modifiers. 7TV zero-width emotes (flag on the saved set entry or
the emote), BTTV's overlay emotes and emotes after BTTV's `z!` become `overlays` of the emote before them. BTTV modifiers
(`w! h! v! l! r! c! p! s!`) apply to the emote after them, FFZ's (`ffzW ffzX ffzY ffzCursed`) to the emote before, as
`modifiers` on that layer. New exports: `EmoteToken`, `EmoteLayer`, `Modifier`, `ModifierEffect`, `modifierOf`,
`BTTV_MODIFIERS`, `FFZ_MODIFIERS`, `BTTV_OVERLAYS`.
