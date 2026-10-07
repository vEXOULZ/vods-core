---
"@vexoulz/vods-core": minor
---

The vods site moves here from vexoulz-vods, so every vods site shares it: `@vexoulz/vods-core/app` has the pages,
the Manage dashboard, the router and `createVodsApp()`, which takes the channel config and the site's branding
(its vexoulz-ui site id, name, Twitch link and tags), the admin API's and vexoulz-auth's URLs and the commit.
Its styles are `@vexoulz/vods-core/app.css`. `@vexoulz/vods-core/dev` has `adminMock()`, the dev server's admin
API. The root and `vue` entries are unchanged. `@vexoulz/ui`, `vue-router` and (for `dev`) `vite` are new
optional peers.
