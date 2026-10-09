---
"@vexoulz/vods-core": minor
---

The built-in tags (`DEFAULT_TAGS`) are colored with `var(--vods-tag-new)`, `var(--vods-tag-updated)` and `var(--vods-tag-complete)` instead of Deep Field's `--vx-accent`, `--vx-info` and `--vx-ok`. `createVodsApp()` maps them to those, so a vexoulz-ui site looks the same. A site with its own UI (the `kit` entry) now defines `--vods-tag-*` itself and no longer needs to alias `--vx-*`.
