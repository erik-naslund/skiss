# Skiss

Sketch a data model as fast as someone can describe it. Compile it to [LinkML](https://linkml.io) when it becomes real.

*Skiss* is Swedish for sketch.

```
Character @Catalog                      # a person or droid in the archive
  id*
  name
  homeworld: Planet
  films: Film[]
  popularityRank: int @Community

Planet @Catalog
  id*
  name
  climate: arid|temperate|frozen|unknown

CharacterPage @Community ~ Character    # the community wiki's version
  slug*
  characterId = Character.id
  summary                               # free text, written by editors
```

That is the whole language. Classes at column 0, fields indented under them, a handful of punctuation marks.

## Why

You sit down with someone who knows the domain. Within the hour you want a shared picture of it: what the things are, what they are called, which system owns them, how they hang together.

The whiteboard is the best tool we have for that hour, and it is still not good enough. Redrawing an arrow is slow when the other person is mid-sentence. Half of what gets said never reaches the board. And when the hour is over, the picture stays on the wall, or in a photo nobody opens again.

The tools that outlive the hour are worse at the hour itself. A schema language (LinkML, JSON Schema, SQL) wants answers you do not have yet: required or optional, which pattern, what base URI. A diagram tool wants you to drag boxes. Both make you stop talking to operate the tool.

Skiss is text you can type while someone talks. A field is one line. A change is one edit. A diagram renders live from the text, so the picture on the screen is always the current picture, and when the hour is over you have a file, not a photo. When the model is real, it compiles to LinkML and you carry on there.

## The rules that make it fast

- **A colon means "the type matters here".** No colon means no type yet; it compiles to `string` and you fix it later. This is what lets you write a field without stopping to think.
- **What you leave out means "not yet".** Never "unknown", never "none". A sketch is silent about what you do not know.
- **`@Catalog` says which system owns a thing.** On a class, or on a single field when the box is really a view over two systems.
- **`~` and `=` are two different statements.** `~` says two classes are about the same thing. `=` says which field joins to which. The first is a domain conversation, the second an integration conversation.
- **`<` inherits, once.** `Jedi < Character` on the class line: the child has everything the parent has and adds its own. One parent, no mixins; it compiles to `is_a`.
- **`#` describes, `?` doubts.** A description ends up in generated documentation. A doubt never does.
- **Every line stands on its own.** A half-typed line breaks that line and nothing else, so the diagram keeps rendering while you type.
- **Everything you can write compiles to valid LinkML.** Skiss is a strict subset. Nothing is lost on the way up.

## What it is not

- Not a schema language. No required/optional, no cardinality beyond `[]`, no constraints. LinkML has all of that, and that is where you go when you need it.
- Not an integration diagram. It says where things live, not how they sync.
- Not a layout format. Positions belong to whatever draws the picture, never to the text.

## Using it

```
npm install -g @eriknaslund/skiss
skiss diagram model.skiss
```

Or without installing: `npx @eriknaslund/skiss diagram model.skiss`.

`skiss diagram` writes a Mermaid class diagram to standard output; `-o diagram.mmd` writes it to a file, `--notes` includes the `?` doubts as notes, and `-` reads standard input. Anything the file gets wrong is reported on standard error, one line each, and the diagram is still drawn from the lines that parse. `--strict` makes that a non-zero exit. `skiss --help` lists the rest.

`skiss render model.skiss -o model.svg` writes a picture rather than the Mermaid text. A class diagram is laid out in a browser, so this one command needs a browser: it delegates to the official [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli), which you install yourself with `npm install -g @mermaid-js/mermaid-cli`. Nothing in the package or the library depends on it, and `skiss render` says that line and exits 2 when it is not there. The format is the extension of `-o` — `.svg` or `.png` — and `--format svg|png` overrides it; with no `-o` the SVG goes to standard output, and a PNG always needs an `-o`. `--scale` is what the PNG is rasterised at and defaults to 2; `--notes`, `--strict` and the diagnostics work as they do for `diagram`. When `mmdc` itself fails, its exit status is the command's.

`skiss compile model.skiss` writes a LinkML schema instead, as YAML on standard output. `--json` writes the same schema as JSON, `--name` sets the schema name (it defaults to the file name without its extension, and to `sketch` when reading standard input), and `-o`, `-`, `--strict` and the diagnostics work exactly as they do for `diagram`.

`skiss import schema.linkml.yaml` goes the other way: it reads a LinkML schema, YAML or JSON, and writes Skiss. What the projection could not carry — patterns, `required`, `mixins`, the names it had to convert — is one line on standard error before the diagnostics, because a sketch is a smaller language than LinkML and that line says by how much. `-o`, `-` and the diagnostics work as they do for `compile`; `--strict` exits 1 when the projected sketch has a diagnostic, and also when anything was dropped. An input that is not a schema at all — not YAML, or YAML no schema can be read out of — produces no sketch, says why on standard error, and exits 2, the code every command uses for unreadable input.

`npm install @eriknaslund/skiss` also gives you the library: `compile`, `formatDiagnostic`, `parse`, `resolve`, `toLinkML`, `serialize`, `toMermaid`, `toSkiss`, `fromLinkML`, `formatDropped`, `importLinkML` and `VERSION`, browser-safe.

Editors that render Skiss live are separate projects built on this package. This repository is the language, the library and the command line.

## Where to look

| | |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | The language, its grammar, and the LinkML mapping. Start here. |
| [docs/DESIGN.md](docs/DESIGN.md) | Why the rules are what they are. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is organised. |
| [docs/adr/](docs/adr/) | Architecture decision records. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What comes next. |
| [docs/RELEASING.md](docs/RELEASING.md) | How a version reaches npm. |
| [AGENTS.md](AGENTS.md) | How this repository is built. |

## Status

0.5.0, published on npm as [`@eriknaslund/skiss`](https://www.npmjs.com/package/@eriknaslund/skiss). The language parses, resolves and diagnoses; `skiss diagram` draws it, `skiss compile` writes LinkML that the real LinkML toolchain validates in CI, and `skiss import` reads a LinkML schema back into a sketch. The library exports the same in both directions and is browser-safe.

The [specification](docs/SPEC.md) is at 0.3 and moves when the language does, which is not with every release. Not built: editing a projected schema so that what Skiss cannot express survives the edit (SPEC §8.1). [CHANGELOG.md](CHANGELOG.md) is what changed when.

## License

[MIT](LICENSE).
