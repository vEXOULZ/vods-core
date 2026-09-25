# Changesets

Every PR that changes the library (`src/`) adds a changeset: `npm run changeset`, pick patch / minor / major,
write one line for the changelog. Test-only or docs-only changes don't need one.

Releasing: `npm run release` (bumps the version and writes CHANGELOG.md), commit, then tag `vX.Y.Z` and push the tag.
