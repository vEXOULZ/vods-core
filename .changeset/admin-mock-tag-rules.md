---
"@vexoulz/vods-core": patch
---

The dev entry's mock archive checks tag names and colors with the site's own rules (`isTagColor`, `TAG_NAME`, now in an import-free `lib/tagRules.ts` that `vodTags` re-exports) instead of a copy.
