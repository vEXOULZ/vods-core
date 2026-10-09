---
"@vexoulz/vods-core": minor
---

The kit exports the wiring `createVodsApp()` uses around its router, so a site with its own UI stops copying it:
`vodsRoutes(pages)` (the route table, with the site's own pages) and `installVodsSession(router, account, { manageLogin })`
(the Manage guard, the expired-session handler, the tab title, the quiet admin check, and watch progress that follows
the account; it returns the `progress` store for `createVods`). The Manage guard now matches only `/manage` and the
pages under it (`isManagePath`), not `/managefoo`.
