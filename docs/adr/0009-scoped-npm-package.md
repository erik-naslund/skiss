# ADR-0009 — The npm package is `@eriknaslund/skiss`; the command stays `skiss`

- **Status:** Accepted
- **Date:** 2026-09-14
- **Deciders:** Erik

## Context

ADR-0001 chose the unscoped npm name `skiss`, checked only for being unused. npm also refuses new unscoped names that look like typos of popular packages, and rejected `skiss` at the first publish as too similar to `scss`, `sass` and `sails`. That rule cannot be appealed for a new package.

ADR-0001 also stated that a scope needs an npm organisation. It does not: every npm user has a scope under their username at no cost.

## Decision

- The npm package is `@eriknaslund/skiss`, published with public access.
- Everything else named in ADR-0001 is unchanged: the repository, the code fence `skiss`, the extension `.skiss`, and the installed command `skiss`.
- Install is `npm install -g @eriknaslund/skiss`; one-off runs are `npx @eriknaslund/skiss diagram model.skiss`.
- Downstream editors depend on `@eriknaslund/skiss`.

## Consequences

- The package name carries a person's name. If the project later moves under an organisation, npm allows the package to move to that scope with the old name deprecated as a pointer.
- Publishing a scoped package requires `--access public`; the release workflow already passes it.

## Alternatives considered

- **Another unscoped name.** Rejected: it renames the project for the sake of a registry rule, and the next candidate may hit the same rule.
- **A scope for a future organisation.** Rejected for now: the organisation does not exist, and the move is cheap when it does.
