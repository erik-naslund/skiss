# ADR-0005 — Compile to class-local `attributes`, never global `slots`

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Erik

## Context

LinkML can define a slot once globally and share it across classes, with `slot_usage` to specialise it per class. That is the idiomatic style in mature schemas. It assumes `Character.name` and `Planet.name` are the same property, which at sketch level they almost never are, and specialising them again is exactly the ceremony that makes LinkML too heavy to write mid-conversation.

## Decision

Every Skiss field compiles to an entry under its class's `attributes`. The generator never emits top-level `slots`.

## Consequences

- No reuse: `id` in five classes is five definitions. Promoting a slot to global is a deliberate later refactor in LinkML.
- Compiled output looks unidiomatic to experienced LinkML users. Accepted.
- Inheritance and mixins still work when they arrive.

## Alternatives considered

- **Global slots with `slot_usage` per class.** Rejected: forces a claim of shared meaning the sketch has not made, and doubles the generated output.
- **Global slots only when the name repeats.** Rejected: whether a slot is shared depends on which classes happen to exist, so adding a class would change the compiled shape of another.
