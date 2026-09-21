# Roadmap

Milestones in order. Each is usable on its own. Work items are GitHub issues and name the milestone they belong to.

## Milestone 0: Decide

Done when the specification, design notes, architecture and ADRs are reviewed and merged, and one real data model has been written in Skiss by hand to find what breaks before any code exists.

## Milestone 1: Skiss to Mermaid (0.1.0)

Done when `skiss diagram model.skiss` turns a `.skiss` file into a Mermaid class diagram, every mid-typing state in `broken.skiss` still produces a diagram plus diagnostics, and `0.1.0` is on npm.

In order:

1. Bootstrap: tooling, `pnpm verify`, CI.
2. The fixture set, written from the spec before any code.
3. `parse` and the AST, with `broken.skiss` passing first. The parser is the whole project; everything else is formatting.
4. `resolve` and the warning diagnostics.
5. `toMermaid`, every fixture checked by Mermaid itself.
6. The `skiss` command.
7. Release workflow and `0.1.0`.

Stop after 7 and use it before going further.

## Milestone 2: Skiss to LinkML (0.2.0)

`toLinkML` with SPEC §5.3 as the golden file, `skiss compile`, and the Python job in CI that validates every generated fixture with the real LinkML toolchain.

## Milestone 3: LinkML to Skiss (0.3.0)

Read an existing LinkML schema and project it into Skiss (SPEC §8), reporting what was dropped. This is how a data model that already exists becomes something you can put in front of people and discuss.

Done: `toSkiss`, `fromLinkML`, `importLinkML` and the `skiss import` command. The release itself is its own PR.

## Milestone 4: Pictures, then inheritance — done, 0.5.0

What workshop use asked for first. In order:

1. ~~**`skiss render`** ([#63](https://github.com/erik-naslund/skiss/issues/63)): an SVG or a PNG from a sketch, through the Mermaid CLI when it is installed. The library stays browser-safe; the command delegates.~~
2. ~~**Inheritance with `<`** ([#64](https://github.com/erik-naslund/skiss/issues/64)): a SPEC 0.3 decision first, then the parser, both generators, the import (`is_a`) and the printer. The most common thing the LinkML import drops today.~~

## Milestone 5: One highlighter — done, 0.6.0

~~**`tokenizeLine` in the library** ([#73](https://github.com/erik-naslund/skiss/issues/73), [ADR 0010](adr/0010-tokeniser-in-the-package.md)): the line tokeniser the Obsidian plugin wrote for itself moves into the package, so the plugin and the playground colour a sketch the same way and a SPEC change reaches both through one bump.~~

## Later, unscheduled

- **Editing a projected schema** (SPEC §8.1): stable identity, merge-back, the two modes.
- **Transformations on `=`, composite keys, mixins.** Each waits for a real model to demand it.
- **Export to a drawing format** is no longer planned here: Mermaid text pastes into Excalidraw and converts, which covers the need. A drawing renderer with remembered positions belongs to the web editor below.

## Not in this repository

Live editors and plugins that render Skiss while you type are separate projects built on the `skiss` package.

- **The Obsidian plugin**: [obsidian-skiss](https://github.com/erik-naslund/obsidian-skiss), in the community directory, with its own roadmap.
- **The playground**: [skiss-playground](https://github.com/erik-naslund/skiss-playground), live at <https://erik-naslund.github.io/skiss-playground/>. Version one ([#65](https://github.com/erik-naslund/skiss/issues/65)) is done: an editor with the same colours as the plugin, the diagram drawn as you type with pan and zoom, share links that carry the sketch in the URL and nowhere else, copy as Mermaid or LinkML, SVG and PNG downloads, and files opened and saved, a LinkML schema included. Its roadmap lives here:
  1. **A title for the sketch**, in the header, the link and the file names ([skiss-playground #9](https://github.com/erik-naslund/skiss-playground/issues/9)).
  2. **Excalidraw as the renderer**, on the same principles as Mermaid today: the text is the source, the drawing follows it, and box positions are remembered so a moved box stays where it was put.
  3. **Live collaboration**: several people editing one sketch at once in the playground, which is the first thing that would need something other than a static page. Unscheduled until a workshop asks for it.
