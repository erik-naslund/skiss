# Releasing

1. Bump the version in `package.json` and the `VERSION` constant in `src/index.ts` (and its test).
2. Move the `Unreleased` entries in `CHANGELOG.md` under a new `X.Y.Z` heading with today's date, and add the link references at the foot of the file: point `[Unreleased]` at `compare/vX.Y.Z...HEAD` and add `[X.Y.Z]` as the compare view against the version before it.
3. Commit on a branch and merge it to `main` through a pull request with green CI.
4. The tech lead tags the merge commit `vX.Y.Z` and pushes the tag (`git fetch origin main && git tag vX.Y.Z FETCH_HEAD && git push origin vX.Y.Z`); the Release workflow verifies, builds and publishes to npm. The product owner is told when the run is green ([ADR-0011](adr/0011-tech-lead-tags-releases.md)); holding a release means not merging the release PR.
   The workflow authenticates with npm trusted publishing (a GitHub OIDC token, no stored npm token); the publisher is configured on npmjs.com for this repository and `release.yml`.
