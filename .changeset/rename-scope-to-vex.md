---
'@vex/vods-core': minor
---

The package is now `@vex/vods-core`, installed from `github:vexouLuna/vods-core`, on `@vex/ui` 0.25.0 and
`@vex/platform-web` 0.9.0. Sites change their imports from `@vexoulz/vods-core` (and `/vue`, `/app`, `/kit`, the CSS)
to `@vex/vods-core` when they bump, together with `@vex/ui` and `@vex/platform-web`; the build keeps both as externals
under their new names, so a site still gets one copy of each. The quiet admin check sends `X-Vex-CSRF` (vex-auth
accepts both names), and the dev mock's fake auth checks the same header. Docs, the mock's Twitch admin and the
example config use the new names and the `vexouluna` login.
