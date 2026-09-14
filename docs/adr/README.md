# Architecture decision records

One file per decision, [MADR](https://adr.github.io/madr/) format: context, decision, consequences, alternatives considered. Numbered in the order they were made and append-only. Replacing a decision means writing a new record and flipping the old one's status to `Superseded by ADR-NNNN`, never editing the old one's content.

| # | Decision | Status |
|---|---|---|
| [0001](0001-name-and-file-extension.md) | The name is Skiss; files are `.skiss`; the code fence is `skiss` | Accepted |
| [0002](0002-license.md) | MIT license | Accepted |
| [0003](0003-one-package-two-entry-points.md) | One npm package with a browser-safe library entry and a Node CLI entry | Accepted |
| [0004](0004-line-based-parsing-and-diagnostics.md) | Line-based parsing, a separate resolve pass, diagnostics instead of exceptions | Accepted |
| [0005](0005-class-local-attributes.md) | Compile to class-local `attributes`, never global `slots` | Accepted |
| [0006](0006-generators-return-data.md) | Generators return data; serialisation is a separate step | Accepted |
| [0007](0007-testing-strategy.md) | Golden fixtures, plus LinkML validation with the real toolchain in CI | Accepted |
| [0008](0008-explicit-identifier.md) | `*` is the only identifier marker, one per class | Accepted |
| [0009](0009-scoped-npm-package.md) | The npm package is `@eriknaslund/skiss`; the command stays `skiss` | Accepted |
