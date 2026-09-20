# Architecture

How the Skiss code is organised. The language is in [SPEC.md](SPEC.md), the reasoning behind the language in [DESIGN.md](DESIGN.md), and the decisions with trade-offs in [adr/](adr/).

## What this repository is

The language specification, the library that parses and compiles it, and a command-line tool. Published as one npm package, `@eriknaslund/skiss` (ADR 0009); the command it installs is `skiss`.

Anything that renders Skiss live, edits it, or embeds it in another tool is a separate project that depends on this package. This repository does not know about them. Its job is to give them a library they can trust: browser-safe, dependency-light, never throwing on bad input.

## One package, two entry points

```
skiss/
  src/
    index.ts          # public API: parse, resolve, compile, generators, formatDiagnostic
    ast.ts            # Document, ClassNode, FieldNode, Diagnostic
    parse.ts          # per-line parser; the only cross-line state is the current class
    resolve.ts        # cross-line pass: links, duplicates, warnings
    inheritance.ts    # the parent chains a `<` builds, read once and shared
    compile.ts        # source -> { output, diagnostics } in one call
    diagnostics.ts    # formatDiagnostic: the file:line:col text form
    generators/
      mermaid.ts      # Document -> Mermaid classDiagram string
      linkml.ts       # Document -> LinkML schema object (0.2.0)
      skiss.ts        # Document -> canonical Skiss text (0.3.0)
      from-linkml.ts  # LinkML schema object -> Document + what it dropped (0.3.0)
    serialize.ts      # schema object -> YAML / JSON (0.2.0)
    import.ts         # LinkML text -> Skiss text in one call (0.3.0)
    cli.ts            # the `skiss` command (Node only)
  test/
    fixtures/         # golden files, see Testing
  docs/
```

- **`skiss`**, the library entry, is browser-safe: no Node built-ins, no filesystem, no `process`. Its only runtime dependency is a YAML serialiser.
- **`skiss/cli`** is Node-only and is what the `skiss` binary runs. It reads and writes files and nothing else.

See [ADR 0003](adr/0003-one-package-two-entry-points.md). Publishing the package is [RELEASING.md](RELEASING.md).

The commands:

| Command | Writes | Needs |
|---|---|---|
| `skiss diagram <file>` | a Mermaid class diagram | nothing |
| `skiss compile <file>` | a LinkML schema, YAML or JSON | nothing |
| `skiss import <file>` | Skiss, from a LinkML schema | nothing |
| `skiss render <file>` | an SVG or a PNG of the class diagram | `mmdc`, the Mermaid CLI |

Rendering is delegated rather than implemented: Mermaid lays a class diagram out in a real DOM, so a picture needs a browser engine, and neither the library nor the package will carry one (ADR 0003). `skiss render` produces the Mermaid text with the ordinary pipeline, writes it to a temporary file and runs `mmdc` on it — found on `PATH`, else at `node_modules/.bin/mmdc` under the working directory — with `-b transparent`, `-e svg|png` and, for a PNG, `--scale 2`. `mmdc` not being installed is exit 2 with one line saying how to install it; an `mmdc` that ran and failed gives the command its own exit status. There is no `toSvg` in the library, and `@mermaid-js/mermaid-cli` is a devDependency, so the test suite can render one fixture for real.

Exit codes, the same for every command:

| Code | Means |
|---|---|
| 0 | The output was produced. |
| 1 | `--strict` and the input has diagnostics. The output is still written. |
| 2 | A usage error, a file that cannot be read, or an input nothing could be read out of: for `import`, a text that is not YAML or a schema `fromLinkML` could not read, which produces no sketch at all; for `render`, the Mermaid CLI not being installed. |
| 70 | An internal error, which is a bug in skiss. |

A reader that closes the pipe early (`skiss diagram big.skiss | head`) is not an error: the streams carry an `EPIPE` guard and the command exits 0.

`render` is the one command that can exit with something else: when `mmdc` ran and failed, its status is the command's.

## Pipeline

```
source text
   │
   ▼  parse()        one line at a time, never throws
Document (AST) + errors
   │
   ▼  resolve()      cross-line: link references, find duplicates
Document (AST) + warnings
   │
   ├─▶ toLinkML()    → LinkML schema as a plain object
   │      └─▶ serialize()  → YAML or JSON text
   ├─▶ toMermaid()   → Mermaid classDiagram text
   └─▶ toSkiss()     → canonical Skiss text

LinkML schema object
   │
   ▼  fromLinkML()   the inverse of §5.1, plus what it could not carry
{ document, source, dropped }

LinkML text
   │
   ▼  importLinkML() the YAML step, then fromLinkML, then resolve
{ output, dropped, diagnostics }
```

`parse` and `resolve` are separate on purpose. Parsing is line-local and always succeeds for the lines it can read. The one piece of state `parse` carries between lines is which class is current, so a field can attach to it and a field before any class can be reported; no line changes how another line is *read*. Resolving is where anything that needs two lines happens, and it only ever adds warnings ([ADR 0004](adr/0004-line-based-parsing-and-diagnostics.md)).

Generators return data where the target is structured. `toLinkML` returns a plain object; YAML is a separate step ([ADR 0006](adr/0006-generators-return-data.md)).

`toSkiss` is the printer: it writes a Document back out as the notation itself, in one canonical layout, which makes it the second half of a projection from LinkML and, later, a formatter.

## Public API

```ts
export function parse(source: string): Document;
export function resolve(doc: Document): ResolvedDocument;   // adds links and warnings, never removes
export function toMermaid(doc: Document, opts?: { notes?: boolean }): string;
export function compile(source: string, opts: CompileOptions): { output: string; diagnostics: Diagnostic[] };
export function formatDiagnostic(d: Diagnostic, file?: string): string;   // file:line:col: severity CODE message
export const VERSION: string;

// 0.2.0
export function toLinkML(doc: Document, opts: { schemaName: string }): LinkMLSchema;
export function serialize(schema: LinkMLSchema, format: 'yaml' | 'json'): string;

// 0.3.0
export function toSkiss(doc: Document): string;
export function fromLinkML(schema: unknown): { document: Document; source: string; dropped: Dropped[] };
export function formatDropped(dropped: Dropped[]): string;   // the SPEC §8 one-line report
export function importLinkML(text: string): { output: string; dropped: Dropped[]; diagnostics: Diagnostic[] };
```

`parse` never throws and never returns null. It returns whatever it could read plus diagnostics.

## AST

Every node carries its source position: a line number, and a column range for each token. Line numbers drive error lists. Column ranges are what an editor needs for highlighting and squiggles, and they cost nothing to record now.

```ts
interface Document  { classes: ClassNode[]; diagnostics: Diagnostic[]; undeclared?: Name[] }
interface ClassNode { name: Name; parent?: Name; system?: Name; similarTo?: Name; description?: string; note?: string; fields: FieldNode[]; line: number }
interface FieldNode { name: Name; identifier: boolean; identifierAt?: Name; type?: TypeRef; system?: Name; joinsTo?: { className: Name; fieldName: Name }; description?: string; note?: string; line: number }
type TypeRef = { kind: 'primitive'; name: Primitive; written: Name; many: boolean }
             | { kind: 'class';     name: Name;                     many: boolean }
             | { kind: 'enum';      values: Name[];                 many: boolean }
             | { kind: 'unknown';   name: Name;                     many: boolean }
interface Name { text: string; line: number; col: number; end: number }
interface Diagnostic { severity: 'error' | 'warning'; code: string; message: string; line: number; col?: number; end?: number }
```

`undeclared` is absent until `resolve` has run and is the list a generator draws placeholders from. `parent` is the class after `<` (SPEC §3.10); `resolve` clears it on the class whose `<` closes a circle, as it clears `identifier` on a second `*`, so a generator never has to know a circle from a chain. Which fields a class inherits along that chain is `inheritance.ts`, which `resolve` and `toLinkML` both read rather than keeping a chain each. `written` is the type word as it was typed, so the alias `integer` survives a round trip through the AST. `unknown` is a whole arm of the union and not a detail: it is what SPEC §3.2's unknown-type rule produces, and a consumer switching on `kind` has to handle it. `identifierAt` is where the `*` is, which is where `W_MULTIPLE_IDENTIFIERS` points.

Exact shapes are decided in code. What must be present is the position on every node and the diagnostic list on the document.

## Diagnostics

Errors come from `parse` and mean "this line could not be read and was skipped". Warnings come from `resolve` and mean "this line was read but says something questionable". The one exception is `E_INHERITANCE_CYCLE`, an error `resolve` produces because no single line can see a circle of `<` (SPEC §7). Every diagnostic carries a stable code.

| Code | Severity | Trigger |
|---|---|---|
| `E_UNPARSABLE` | error | The line matches no production. |
| `E_FIELD_WITHOUT_CLASS` | error | An indented line with no current class: before any class line, or after a class line that failed to parse. A failed class line clears the current class so its fields are not silently attached to the previous one. |
| `E_MISSING_TYPE` | error | A colon with nothing after it. |
| `E_UNCLOSED_MANY` | error | `[` without `]`. |
| `E_BAD_NAME` | error | A class name not in UpperCamelCase, or a field name not in lowerCamelCase. A parent that is a primitive is this too, with a message naming it. |
| `E_INHERITANCE_CYCLE` | error | A `<` that closes a circle, on the last of the circle's classes to be declared. From `resolve`; the `<` is cleared and nothing else changes. |
| `W_UNKNOWN_TYPE` | warning | Lowercase type that is not a primitive and has no `\|`. Falls back to string. Suggests a primitive when the edit distance is small. |
| `W_UNDECLARED_CLASS` | warning | `: X`, `~ X` or `= X.f` where X is not declared. Suggests the primitive when X is one written with a capital. |
| `W_UNDECLARED_FIELD` | warning | `= X.f` where X exists but has no field f. |
| `W_DUPLICATE_CLASS` | warning | Two classes with the same name. |
| `W_DUPLICATE_FIELD` | warning | Two fields with the same name in one class. |
| `W_DUPLICATE_ENUM_VALUE` | warning | The same value twice in one inline enum. First wins; the line is kept as written. |
| `W_MULTIPLE_IDENTIFIERS` | warning | More than one `*` in a class, an inherited one included. First wins, and an inherited one is first. |
| `W_REDUNDANT_OVERRIDE` | warning | A field identical to the one it replaces in a parent. Identical is what the two mean, so an alias is not a difference. |

This table is the contract for `broken.skiss` in the fixtures.

One code is not in it, because no Skiss line can produce it: `importLinkML` reports `E_NOT_YAML` on line 1 for a text no schema can be read out of. See LinkML import.

## Mermaid mapping

Mermaid is the first generator because it validates the parser cheaply. It binds relations to classes, not fields, so it cannot draw `=` as a row-level arrow. Do not build abstractions on top of it.

Checked against a real Mermaid parser. The three surprises are marked.

| Skiss | Mermaid |
|---|---|
| class | `class Name { ... }`, in source order |
| `@System` on a class | `<<System>>` as the first line of the class body (Mermaid displays it lowercased in guillemets) |
| field without a type | `+name` |
| field with a type | `+int name`, `+Planet homeworld`, `+Film[] films`, `+arid\|temperate climate`, `+red\|green[] tags`. The Skiss type text is used verbatim, unknown types included. |
| `*` | `*` replaces the `+` visibility marker: `*id` for an untyped identifier, `*int code` for a typed one. **A trailing `*` is Mermaid's abstract-member marker and disappears.** |
| `@System` on a field | appended to the member: `+int popularityRank @Community` |
| `< Parent` | `Parent <\|-- Child`, unlabelled and parent first. The parent's fields are not repeated in the child's box. |
| `: OtherClass` | `A --> B : fieldName` |
| `: OtherClass[]` | `A "1" --> "*" B : fieldName` |
| `~ Other` | `A ..> B : similar`. **`~` is Mermaid's generic-type delimiter and vanishes from labels.** |
| `= Other.field` | `A ..> B : fieldName = field` |
| undeclared class | `class Name { <<undeclared>> }`, after the declared classes |
| `# text` | omitted |
| `? text` | omitted by default. With `notes: true`, `note for Class "text"` for a class doubt and `note for Class "field: text"` for a field doubt. **Note lines are emitted before any relation line; Mermaid fails to parse a note that follows a `..>` relation.** |

Output order: classes, undeclared placeholders, notes, relations. A class's relations are its `<` first, then `~`, then its fields in order. Two-space indentation, no trailing whitespace, one trailing newline.

**Empty document.** A document with no classes produces the single line `classDiagram`. Mermaid refuses to parse a class diagram with no statements, and nothing in scope can be added to make it parse (a `direction` hint is layout). Anything that renders live must special-case an empty buffer: show nothing, not a Mermaid error.

## LinkML mapping

SPEC §5. The worked example in §5.3 is a golden test.

## LinkML import

SPEC §8, the other direction. `fromLinkML` takes the parsed schema as a plain object — the CLI parses the YAML, the library stays browser-safe — builds a Document with zeroed positions, prints it with `toSkiss`, and parses that text back, so the document it returns carries real positions and `source` is the projection itself. It never throws: a schema it cannot read is an empty sketch and one report saying why.

Every mapping is the inverse of a §5.1 row. Everything LinkML says that §5.1 has no row for is reported as a `Dropped`, never lost quietly.

| `kind` | What it reports |
|---|---|
| the LinkML key (`mixins`, `pattern`, `required`, `slot_usage`, …) | that key was on the element and is not carried |
| a key the mapping does carry (`identifier`, `multivalued`, `range`, `attributes`, `slots`) | the key was there with a value the reader cannot use; `detail` says what was found, and nothing is coerced |
| `renamed` | a name that is not `UpperCamelCase` or `lowerCamelCase` was converted; `detail` says from what |
| `is_a` | an `is_a` written with something that is not a class name; `< Parent` itself is carried (SPEC §8) |
| `narrowed` | a `range` no Skiss primitive covers; the word survives as an unknown type and falls back to `string` |
| `inlined` | an enum used by several attributes, where inlining it loses the sharing |
| `enum_detail` | a permissible value with a body of its own, or a key on the enum other than `permissible_values` |
| `annotation` | an annotation tag §5.1 gives no meaning, or one whose value is not text §5.3 could have written; nothing is stringified into a system or a doubt |
| `reworded` | a `description` holding a standalone `?`, which `toSkiss` writes attached to the word before it so it does not read as a doubt (SPEC §8) |
| `class`, `slot` | a class or an attribute whose body is not a definition, or a global slot no class lists |
| `enum` | an enum Skiss cannot write, so the attributes that had it as their range keep no type |
| `unused_enum` | an enum no attribute has as its range, so it reaches the sketch nowhere |
| `schema` | a key at schema level that is not §5.2 boilerplate |
| `unreadable` | the schema could not be read at all: its `detail` is the whole report, and the sketch is empty |

`element` names the element as the sketch names it, `Class` or `Class.field`; an enum is named as LinkML named it, since the sketch does not keep enum names. `formatDropped` counts the reports by kind into the §8 one-line report. Every kind the projection invents has a phrase of its own there — `1 narrowed range`, not `narrowed on 1 slot` — so the line reads in LinkML's vocabulary and the reader's, never in the code's; `unreadable` is not counted at all but written as its own sentence: "Not read: the schema has no `classes`."

`test/fixtures/foreign.linkml.yaml` is a schema Skiss did not write, and `foreign.skiss` and `foreign.dropped.json` beside it are what it projects to. For every fixture LinkML carries whole, Skiss → LinkML → Skiss is identity up to canonical form, as SPEC §8 puts it.

`importLinkML(text)` is the whole path in one call, as `compile` is the whole path the other way: it reads the YAML — JSON is YAML, so one parser reads both forms — hands the object to `fromLinkML`, and returns its `source` as `output`, its `dropped`, and the diagnostics of `resolve` on the document it built, whose lines are lines of `output`. It is where the YAML is read because `fromLinkML` takes an object; `yaml` needs nothing from Node, so the library stays browser-safe. It never throws: a text that is not YAML is empty output and one `E_NOT_YAML` error on line 1, since the reader never got as far as a line of its own to point at.

`skiss import <file> [-o path] [--strict]` is that call from the command line, with the conventions of `diagram` and `compile`: `-` for standard input, the sketch on standard output or to `-o` verbatim, and the exit codes above. The SPEC §8 report is written to standard error first, as one line, whether or not `--strict` was given — it is information, not an error — and the diagnostics follow it in the usual `file:line:col:` form. `--strict` exits 1 when there are diagnostics, and also when anything was dropped. An input no schema could be read out of exits 2 rather than 1: nothing was produced, which is unreadable input and not a sketch with broken lines in it.

## Testing

Fixture pairs, not unit tests of internals:

```
test/fixtures/
  basic.skiss     basic.linkml.yaml     basic.mmd
  systems.skiss   systems.linkml.yaml   systems.mmd
  broken.skiss    broken.diagnostics.json
  foreign.linkml.yaml   foreign.skiss   foreign.dropped.json
```

Golden-file comparison. When output changes on purpose, the diff is the review ([ADR 0007](adr/0007-testing-strategy.md)). The derived files are rewritten by the library itself, never by hand: `pnpm build && node scripts/regenerate-fixtures.mjs` writes every `.mmd`, `.linkml.yaml`, `basic.ast.json`, `broken.diagnostics.json` and the `foreign` projection from the `.skiss` inputs and `foreign.linkml.yaml`.

`broken.skiss` is the important one. It holds the mid-typing states: a trailing colon with no type, an unclosed `[`, a field indented under nothing, a `~` to a class that does not exist, a misspelled primitive. Each must produce the diagnostic from the table above *and* a usable partial document.

CI runs two jobs:

1. **Node**: lint, typecheck, unit and golden tests.
2. **LinkML**: installs `linkml` and validates every generated `*.linkml.yaml` fixture with the real LinkML toolchain. This is the only proof that "compiles to valid LinkML" is true.

The split is exact: the Node job runs `pnpm verify` with `SKISS_SKIP_LINKML=1`, so it never builds a Python environment, and the `LinkML` job is the only place CI validates the fixtures. Locally, and in the release workflow, `pnpm verify` runs all four gates.

## Toolchain

| Area | Choice |
|---|---|
| Language | TypeScript, strict |
| Package manager | pnpm |
| Build | tsup, both entry points |
| Tests | vitest |
| Lint and format | Biome, one config file |
| Runtime dependency | `yaml`, and nothing else in the library |
| CI | GitHub Actions |
