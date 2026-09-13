# ADR-0004 — Line-based parsing, a separate resolve pass, diagnostics instead of exceptions

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Erik

## Context

While someone types, the document is always invalid: there is a half-finished line at the cursor at every moment, and a live preview has to render anyway. Some facts need two lines: whether a referenced class exists, whether a field name is duplicated. Forward references are normal in a sketch, so a missing class cannot be an error.

## Decision

- **Parse** reads each line independently. Nothing on one line changes how the next is read. A line that does not parse produces an *error* attached to its line number and is skipped.
- **Resolve** is a separate pass over the parsed document. It links references and finds duplicates, unknown types and undeclared classes. It produces *warnings* and never removes anything.
- Neither pass throws. Both return whatever they understood plus a list of diagnostics with a stable code, a severity, a line, and where possible a column range.
- A lowercase word that is neither a primitive nor an enum is a warning and falls back to string.

## Consequences

- The grammar has no error recovery and needs none.
- Modifier order on a line is fixed, which keeps per-line parsing simple and messages precise.
- Every AST node carries its position, including column ranges.
- Anything that renders Skiss must be able to draw an undeclared class as a placeholder.

## Alternatives considered

- **A conventional grammar with error recovery.** Rejected: expensive to write, easy to get wrong, and unnecessary when lines are independent.
- **Treating an unknown lowercase type as a class reference.** Rejected: it would break the rule that class names start uppercase, which is what lets a line be read without looking at any other line.
- **Treating a single lowercase value as a one-value enum.** Rejected: it hides typos in primitive names until they reach generated code.
