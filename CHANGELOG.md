# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-09-14

LinkML to Skiss. An existing schema becomes a sketch you can put in front of
people, and the projection says what it could not carry.

### Added

- `toSkiss(document)` prints a `Document` as canonical Skiss text: the notation
  itself in one layout, which is the second half of a projection from LinkML.
- `fromLinkML(schema)` projects a LinkML schema object into a Skiss `Document`,
  the canonical Skiss text it printed, and a `Dropped[]` report of everything
  the projection could not carry (SPEC §8). `formatDropped` writes that report
  as the §8 one-line summary.
- `importLinkML(text)` is the whole path from LinkML text to Skiss text in one
  call: it reads the YAML (JSON is YAML), projects the schema, and returns the
  sketch, the report and the diagnostics the sketch it wrote has. A text that
  is not YAML is one `E_NOT_YAML` error and no output; it never throws.
- The `skiss import` command: `skiss import <file> [-o path] [--strict]`, `-`
  for standard input. The SPEC §8 report goes to standard error before the
  diagnostics, whether or not `--strict` was given, and `--strict` also exits 1
  when anything was dropped.

## [0.2.1] - 2026-09-14

### Added

- `W_UNDECLARED_CLASS` says which primitive was meant when the name is one
  written with a capital: "class `Int` is not declared. Did you mean `int`?"

### Changed

- `W_MULTIPLE_IDENTIFIERS` points at the second `*` rather than the field
  name; `FieldNode` records the marker's position as `identifierAt`.

### Fixed

- `x: constructor` and the other `Object.prototype` keys are unknown types
  with the `string` fallback, not primitives.

## [0.2.0] - 2026-09-14

Skiss to LinkML from the command line. The `0.1.0` tarball on npm was built
from a commit that already carried these changes; `0.2.0` is the version that
names them.

### Added

- `compile(source, { target: 'linkml', schemaName, format })`: the LinkML
  schema as text in one call, YAML by default.
- The `skiss compile` command:
  `skiss compile <file> [-o path] [--json] [--name schemaName] [--strict]`,
  `-` for standard input, diagnostics on standard error. `--name` defaults to
  the file's basename without its extension, or `sketch` for standard input.

### Changed

- Releases publish to npm with trusted publishing; no token is stored.
- CI: the Node job no longer builds a LinkML environment, and the CLI tests
  build `dist/` once in a vitest global setup.

## [0.1.0] - 2026-09-14

First release. Skiss to Mermaid. Published as `@eriknaslund/skiss`; the command is `skiss`.

### Added

- The Skiss notation, specification 0.1: classes, fields, types, `[]`, inline
  enums, `@` owning system, `~` similar-to, `=` joins, `*` identifier, `#`
  description and `?` doubt.
- `parse`: a line-based parser that never throws. A broken line yields one
  error diagnostic and is skipped; the rest of the document still parses.
- `resolve`: the cross-line pass that links references and reports unknown
  types (with a "did you mean" suggestion), undeclared classes and fields,
  duplicates and a second `*`.
- `toMermaid`: a Mermaid class diagram from any document, undeclared classes
  drawn as placeholders, doubts as notes with `notes: true`.
- `compile` and `formatDiagnostic` for editors and tools.
- `toLinkML` and `serialize` in the library, ahead of the `skiss compile`
  command that arrives in 0.2.0.
- The `skiss` command: `skiss diagram <file> [-o path] [--notes] [--strict]`,
  `-` for standard input, diagnostics on standard error.

[Unreleased]: https://github.com/erik-naslund/skiss/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/erik-naslund/skiss/releases/tag/v0.1.0
