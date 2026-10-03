<!-- conventions:begin: synced from vEXOULZ/conventions; edit it there, then run `conventions sync` -->
## What changed

## Checklist
- [ ] The branch is named per [Conventional Branch](../CONTRIBUTING.md#branches) (`feature/`, `bugfix/`, `hotfix/`, `release/`, `chore/`).
- [ ] New behaviour has a test, and docs that describe the changed behaviour are updated in this PR.
- [ ] Nothing synced from vEXOULZ/conventions was edited by hand (`.conventions/`, managed blocks).
- [ ] **No private infrastructure**: no machine hostnames, private IPs, server paths, proxy/tunnel config or deploy scripts. Those belong in the private infrastructure repo.
- [ ] No secret values anywhere in the diff, the description or the commit messages.
<!-- conventions:end -->

## vods-core
- [ ] Time math (parts, restricted chapters, delay) has a test, ideally against a real VOD fixture in `tests/fixtures/`.
- [ ] No UI here: components and styles belong in vexoulz-ui or the site.
- [ ] A changeset was added if `src/` changed (`npm run changeset`).
