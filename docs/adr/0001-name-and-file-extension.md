# ADR-0001 — The name is Skiss

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Erik

## Context

The name appears in the npm package, the CLI binary, the code fence, the file extension, the plugin ids of downstream editors, and every document. Changing it after code exists is a find-and-replace with a long tail, so it is decided before any code.

Criteria: short, typeable, usable unchanged as a file extension and a code fence, free on npm, not registered in GitHub Linguist for another language, and saying "sketch" rather than "schema".

## Decision

- The name is **Skiss**, Swedish for sketch. Capitalised in prose, lowercase in code and file names.
- File extension `.skiss`. Code fence language `skiss`.
- npm package `skiss`, unscoped, containing both the library and the CLI.

Checked at decision time: `skiss` free on npm, no `.skiss` entry in GitHub Linguist.

## Consequences

- Non-Swedish speakers will not know the word. It looks like "sketch" to anyone, which is enough.
- It is a notation and a set of tools, and is described as such. Not a framework.

## Alternatives considered

- **A descriptive English name** (sketch, napkin, draft, and the like). Every short one is taken on npm, in Linguist, or by a product in an adjacent space.
- **A scoped npm package** (`@skiss/core`). Rejected: a scope needs an npm organisation and adds nothing while there is one package.
