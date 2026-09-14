# Releasing

1. Bump the version in `package.json` and the `VERSION` constant in `src/index.ts` (and its test).
2. Move the `Unreleased` entries in `CHANGELOG.md` under a new `X.Y.Z` heading with today's date.
3. Commit on a branch and merge it to `main` through a pull request with green CI.
4. Tag the merge commit `vX.Y.Z` (`git tag vX.Y.Z main`).
5. Push the tag (`git push origin vX.Y.Z`); the Release workflow verifies, builds and publishes to npm.
   The workflow authenticates with npm trusted publishing (a GitHub OIDC token, no stored npm token); the publisher is configured on npmjs.com for this repository and `release.yml`.
