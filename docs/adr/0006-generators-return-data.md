# ADR-0006 — Generators return data; serialisation is a separate step

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Erik

## Context

The LinkML generator's output is structured. Tests want to compare structure, the CI validator wants to receive it, and more than one text format may be wanted.

## Decision

- A generator whose target is structured returns a plain object. `toLinkML` returns a LinkML schema object.
- `serialize` turns that object into YAML or JSON.
- A generator whose target is text by nature, such as Mermaid, returns a string.
- A `compile` convenience function does the whole path for callers that want one call.

## Consequences

- Golden tests compare objects and show structural diffs.
- The Python-side validator receives JSON without a YAML round trip.
- JSON output for LinkML costs nothing.
- The YAML serialiser is the library's only runtime dependency.

## Alternatives considered

- **Generators return text.** Rejected: string diffs hide structure, and every consumer that wants to inspect the output has to parse it back.
