---
'@vexoulz/vods-core': patch
---

Tag colors take any site's theme tokens (`var(--k-accent)`, `oklch(from var(--k-ok) calc(l - 0.1) c h)`), not only `var(--vx-…)`, so keeki's swatches and relative colors validate. The admin mock checks the same.
