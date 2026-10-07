@.conventions/CLAUDE.md

# vods-core

The engine and the app behind the vods sites (vods.vexoul.net, keekivods.vexoul.net). The root and `vue` entries
are headless: archive API client, part and restricted-chapter time math, YouTube player control, chat replay and
watch progress, with no components or styles. The `app` entry (`src/app/`) is the site itself: its pages, the
Manage dashboard, the router and `createVodsApp()`. Each site repo keeps only its config, branding and `main.ts`,
so anything a site needs that both could use goes here, not in the site. Generic components belong in vexoulz-ui.
The sites install a tag (`github:vEXOULZ/vods-core#vX.Y.Z`), so a change reaches them only when a release is tagged
on `main` and their pins move.

- Time math (parts, restricted chapters, the start delay) gets a test, ideally against a real VOD
  fixture in `tests/fixtures/`. `npm run fixtures` refreshes them from the public archive API, with
  chatters' names replaced by placeholders; keep it that way.
- A change to `src/` adds a changeset (`npm run changeset`). Releases go through a `release/x-y-z`
  branch, and the tag is set on `main` after it merges (README).
- Exports in `package.json` are a contract with the sites; renaming or removing one is a minor bump
  before 1.0.
- Nothing in `src/app/` names a site: per-site values (name, Twitch link, tags, the vexoulz-ui site id)
  come from `createVodsApp()`'s options through `src/app/site.ts`, read when they're used, not when a
  module loads.
- The root and `vue` entries never import from `src/app/`.
