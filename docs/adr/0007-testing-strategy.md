# ADR-0007 — Golden fixtures, plus LinkML validation with the real toolchain in CI

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Erik

## Context

The library is a compiler. Its correctness is "this input produces this output", which unit tests of internals express badly and golden files express well. The claim that output is valid LinkML can only be proven by LinkML itself, which is a Python toolchain.

## Decision

- Tests are fixture pairs under `test/fixtures`: a `.skiss` input next to its expected LinkML, Mermaid, and diagnostics output. A change in output is reviewed as a diff.
- `broken.skiss` covers every mid-typing state in the diagnostics table in ARCHITECTURE.md, and must produce both the expected diagnostics and a usable partial document.
- CI has a second job that installs `linkml` and validates every generated LinkML fixture with the real toolchain.

## Consequences

- Python appears in CI but never in the library or its dependencies.
- Adding a language feature means adding a fixture, which doubles as documentation.
- A fixture change in a PR is a language change and is reviewed as one.

## Alternatives considered

- **Unit tests of parser internals.** Rejected as the primary strategy: they test the shape of the code, not the language, and break on every refactor.
- **A TypeScript reimplementation of LinkML validation.** Rejected: it would drift from the real thing and prove nothing.
