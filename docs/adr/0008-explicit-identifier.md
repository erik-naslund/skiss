# ADR-0008 — `*` is the only identifier marker, one per class

- **Status:** Accepted
- **Date:** 2026-09-13
- **Deciders:** Erik

## Context

LinkML allows at most one slot per class with `identifier: true`. That slot is what makes an instance referenceable by value; a class without one is inlined where it is referenced. A sketch needs a way to say "this thing has an identity of its own" that is visible on the line and cannot be produced by accident.

## Decision

- `*` after a field name marks the identifier. It is the only way to do so; no field name has special meaning.
- One per class. A second `*` produces a warning and is ignored.
- A class with no `*` has no identifier, which is legal and compiles to a class whose references are inlined.

## Consequences

- One rule, visible in the text, no precedence questions.
- `*` becomes the signal that makes `=` meaningful.
- Two `*` in a class is reserved as a possible future composite key (LinkML `unique_keys`). Not implemented.

## Alternatives considered

- **A naming convention** (a field called `id` is the identifier). Rejected: an invisible rule, and it needs a precedence rule the moment a class has both a conventional name and an explicit marker.
- **Requiring every class to have an identifier.** Rejected: value objects without identity are real and common.
