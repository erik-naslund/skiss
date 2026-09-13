# ADR-0003 — One npm package with a browser-safe library entry and a Node CLI entry

- **Status:** Accepted
- **Date:** 2026-09-13
- **Deciders:** Erik

## Context

The library has to run wherever an editor runs: a browser, an Electron renderer, a Node process. The CLI has to read and write files. Downstream editors and plugins live in their own repositories and depend on this package; they must be able to trust that importing it pulls in nothing they cannot run.

## Decision

- This repository is one npm package, `skiss`, with two entry points.
- `skiss` is the library. It uses no Node built-ins, no filesystem, no `process`, and its only runtime dependency is a YAML serialiser.
- `skiss/cli` is the command. It is Node-only and is the only place that touches files.
- The library never depends on any editor or host application. Enforced by not listing one as a dependency.

## Consequences

- Any editor can embed the library without a bundler workaround.
- One version number, one publish step.
- The CLI cannot grow features that belong in the library; if it needs logic, the logic moves to the library first.

## Alternatives considered

- **A monorepo with separate packages** for library and CLI. Rejected: two packages to version and publish for one small library, and the workspace tooling to go with it.
- **Editors in this repository.** Rejected: each editor host has its own release mechanics and review process, and this library should not carry them.
