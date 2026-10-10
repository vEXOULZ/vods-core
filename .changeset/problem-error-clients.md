---
'@vexoulz/vods-core': minor
---

The archive and admin clients throw `@vexoulz/platform-web`'s `ProblemError` (platform-web 0.4.0), which the root entry
re-exports. `ApiError`, `AdminApiError` and the kit's `errorMessage` are gone: use `ProblemError`, `errorText()` and, for
a rate-limited login, `retryAfterText()`. A 409's split points and later edits come from `validPoints(e)` and
`editedSince(e)`.
