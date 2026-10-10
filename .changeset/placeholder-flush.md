---
'@vexoulz/vods-core': patch
---

VodCard's missing thumbnail and Most played's missing box art use vexoulz-ui 0.21's `<VxPlaceholder flush>` instead of
restyling `.vx-ph` through `:deep()`. `NoThumbnail` takes `flush`.
