# ADR-0002 — MIT license

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Erik

## Context

Skiss is meant to be used by anyone, embedded in other tools and plugins, and contributed to. The license should get out of the way.

## Decision

MIT.

## Consequences

- The simplest widely understood terms, compatible with every plugin ecosystem this is likely to be embedded in.
- Relicensing later needs every contributor's agreement. Trivial while there is one author. Once outside contributions arrive we accept that the license is effectively fixed.

## Alternatives considered

- **Apache-2.0.** Adds an explicit patent grant at the cost of more ceremony. Nothing here needs it.
- **CC0.** Unusual for code and flagged by some corporate policies.
