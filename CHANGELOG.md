# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `compile(source, { target: 'linkml', schemaName, format })`: the LinkML
  schema as text in one call, YAML by default.
- The `skiss compile` command:
  `skiss compile <file> [-o path] [--json] [--name schemaName] [--strict]`,
  `-` for standard input, diagnostics on standard error. `--name` defaults to
  the file's basename without its extension, or `schema` for standard input.

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
