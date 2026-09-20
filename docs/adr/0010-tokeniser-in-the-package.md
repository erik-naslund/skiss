# ADR-0010 — The line tokeniser lives in the package, not in each editor

- **Status:** Accepted
- **Date:** 2026-09-20
- **Deciders:** Erik

## Context

An editor that shows Skiss colours it, and colouring needs to know where the words of a line are: which run is a class name, which is an operator, which is a `#` trailer. The Obsidian plugin wrote that for itself, and the web playground needs the same thing. Two copies of the same reading of SPEC §3 and §4 drift the first time the specification moves, and they drift quietly: nothing fails, the colours are simply wrong in one editor.

The reading is small and it is the language's, not any editor's. It is also not a parser: it names runs of characters and says nothing about a run it does not recognise, so a half-typed line looks calm rather than wrong. Diagnostics are the compiler's and reach an editor through its gutter.

## Decision

- The tokeniser lives in this package, as `src/highlight.ts`, and is exported from the library entry as `tokenizeLine`, `Token` and `TokenKind`.
- It is line-based and stateless, as the language is (SPEC §4): one line in, its tokens out, no state carried between lines.
- It takes its name productions, its primitive table, its word shape and its trailer delimiting from `src/parse.ts`, so the tokeniser and the compiler cannot disagree about what a primitive or a class name is.
- It knows nothing about any editor. No CodeMirror, no Obsidian, no DOM; the package's runtime dependencies are unchanged.

## Consequences

- The Obsidian plugin and the playground import one tokeniser instead of keeping one each.
- A change to the SPEC names is made once, here, next to the grammar it belongs to, and reaches both editors through a package bump.
- The package gains no editor dependency: `tokenizeLine` returns plain data — offsets and a kind — and each editor maps a kind to its own colours and its own decoration API.
- The library entry grows an export that has nothing to do with compiling. It stays browser-safe, and the cost is one small file.

## Alternatives considered

- **Leave a copy in every editor.** Rejected: that is the drift this record exists to stop, and the second copy already existed.
- **A separate package, `skiss-highlight`.** Rejected: it reads the same grammar as the parser and would have to be released in step with it, which is what one package already gives (ADR 0003).
- **Export the parser's tokens instead and let editors colour those.** Rejected: the parser reads a line to decide whether it is valid and stops at the first thing that is not, so a half-typed line would lose its colours exactly while it is being typed.
