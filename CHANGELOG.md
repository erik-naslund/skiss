# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **A message about a name says that names are ASCII and points at the
  character that is not.** `förnamn` is lowercase in Swedish, so
  "Field names are lowerCamelCase" and nothing else read as wrong. The
  message now names the first character outside `A`–`Z`, `a`–`z`, `0`–`9`,
  and for a name that is all ASCII says what the name starts with instead.
  Every name the language has: a class, a field, the class after `~`, `<`
  and `=`, a referenced class, an `@System` name and an enum value. The rule
  itself is unchanged.
- **A bad class name is one diagnostic, not one per field.** A class line
  that fails at a name — its own, the one after `~`, the one after `<` — is
  still a class line above the fields under it: they are dropped with the
  class and no longer report `E_FIELD_WITHOUT_CLASS` each. A class line that
  fails elsewhere clears the current class as before. A field under a dropped
  class is still read on its own, so its own mistakes are still reported.
- **The specification is at 0.3.1**, a wording change and no language change:
  §4 now writes out what `letter` and `digit` always meant — ASCII — and says
  why, which is that a name becomes an identifier and a URI downstream, while
  the words of the domain belong in the `#` description.

## [0.6.0] - 2026-09-20

The line tokeniser is in the library, so every editor colours Skiss the same way.

### Added

- `tokenizeLine` in the library, with `Token` and `TokenKind`: the tokens of
  one Skiss line, `{ kind, from, to }` each, for an editor that colours it.
  Line-based and stateless, silent about what it does not recognise, and it
  reads its name productions and its primitive table out of the parser, so the
  colours cannot disagree with the compiler. It is not a parser and reports
  nothing; diagnostics stay `parse` and `resolve`'s. The Obsidian plugin and
  the playground import it instead of keeping a copy each
  ([ADR 0010](docs/adr/0010-tokeniser-in-the-package.md)). No new dependency.

## [0.5.0] - 2026-09-20

Specification 0.3: inheritance. `Child < Parent` is in the language, compiles
to `is_a` and comes back from LinkML. And `skiss render` writes a picture.

### Changed

- The specification is at **0.3**: inheritance with `<`. `Child < Parent` on
  a class line, before `@` and `~`, gives the child every field the parent
  has, the identifier included. One parent; a second, or a `<` on a field
  line, is `E_UNPARSABLE`, and a primitive as a parent is `E_BAD_NAME`. A
  field written on the child with the name of an inherited one replaces it,
  and is `W_REDUNDANT_OVERRIDE` when it says nothing the parent does not. A
  parent that is not declared is `W_UNDECLARED_CLASS` and a stub, as any
  reference is; a circle of `<` is `E_INHERITANCE_CYCLE` on the line that
  closes it, and that one `<` is not carried. It compiles to `is_a`, with a
  replacing field as an attribute of the child, and draws as
  `Parent <|-- Child`. `skiss import` reads both back, so `is_a` is no
  longer dropped, and a `slot_usage` entry is still read as the field that
  replaces one.

### Added

- `skiss render <file>` writes a picture: `-o model.svg` or `-o model.png`,
  `--format svg|png` when the path does not say, the SVG on standard output
  when there is no `-o`, and `--scale` for the PNG, which defaults to 2.
  `--notes`, `--strict` and the diagnostics are `diagram`'s. It renders
  through the Mermaid CLI (`mmdc`), which you install yourself; the library
  gains no rendering function and the package gains no browser. With no
  `mmdc` on `PATH` or in `node_modules/.bin`, it exits 2 with one line
  saying how to install it.

## [0.4.0] - 2026-09-15

Specification 0.2, and the fixes from the deep review at 0.3.0 (#52).
Numeric enum values, a round trip that keeps a description's `?` out of the
doubt, and a CLI that behaves in a pipe.

### Changed

- The specification is at **0.2**. An inline enum value may start with a digit
  and may be digits only, so `priority: 1|2|3` is an enum of three values where
  it used to be `E_UNPARSABLE` and lose the whole field. The permissible values
  reach LinkML quoted (SPEC §3.4 and §4).
- A description the LinkML projection writes no longer comes back split. Where
  its text holds a standalone `?`, `toSkiss` attaches the `?` to the word before
  it, which is ordinary text, instead of leaving it to read as the start of a
  doubt and take any doubt already on the element with it. Every description
  reworded that way is reported: `1 description reworded` (SPEC §8).

### Fixed

- `skiss diagram model.skiss | head` no longer dies with a Node stack trace and
  exit 1 when the reader closes the pipe. A closed pipe is not a failure of the
  command: it exits 0.
- `skiss import` of a file that is not a schema says what it could not read
  ("Not read: the schema has no `classes`.") instead of reporting it as one
  dropped schema key, and exits 2 rather than 0, since it produced no sketch.
- `fromLinkML` no longer stringifies an annotation value it cannot read: a tag
  written with no value, a number or a list becomes a report saying what was
  found, where it used to become the system `@null` or the doubt `? undefined`.
- A schema named `__proto__` compiled to LinkML whose `default_prefix` was
  missing from `prefixes`, which LinkML refuses. The name-keyed maps of the
  LinkML generator hold such a key, and a schema or system name that is one of
  `__proto__`, `constructor` or `prototype` takes a trailing `_` as the names
  `linkml:types` binds already do.
- The one-line import report no longer prints the projection's own vocabulary:
  `1 narrowed range` and `1 enum detail`, not `narrowed on 1 slot` and
  `enum_detail on 1 enum`.

### Added

- `W_DUPLICATE_ENUM_VALUE`: a value written twice in one inline enum is a
  warning. The line is kept as written and the enum carries the value once.

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

[Unreleased]: https://github.com/erik-naslund/skiss/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/erik-naslund/skiss/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/erik-naslund/skiss/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/erik-naslund/skiss/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/erik-naslund/skiss/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/erik-naslund/skiss/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/erik-naslund/skiss/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/erik-naslund/skiss/releases/tag/v0.1.0
