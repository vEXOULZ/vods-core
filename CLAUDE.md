@.conventions/CLAUDE.md

# vods-core

The headless engine behind the vods site: archive API client, part and restricted-chapter time math,
YouTube player control, chat replay and watch progress. A library with no UI: components and styles
belong in vexoulz-ui or the site. The site installs a tag (`github:vEXOULZ/vods-core#vX.Y.Z`), so a
change reaches it only when a release is tagged on `main` and the site's pin moves.

- Time math (parts, restricted chapters, the start delay) gets a test, ideally against a real VOD
  fixture in `tests/fixtures/`. `npm run fixtures` refreshes them from the public archive API, with
  chatters' names replaced by placeholders; keep it that way.
- A change to `src/` adds a changeset (`npm run changeset`). Releases go through a `release/x-y-z`
  branch, and the tag is set on `main` after it merges (README).
- Exports in `package.json` are a contract with the site; renaming or removing one is a minor bump
  before 1.0.
