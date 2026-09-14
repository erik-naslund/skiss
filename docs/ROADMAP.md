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

## Later, unscheduled

- **Export to a drawing format.** A generator that produces a file a drawing tool can open, with layout. Which format is a decision for when it is built.
- **Editing a projected schema** (SPEC §8.1): stable identity, merge-back, the two modes.
- **Inheritance, transformations on `=`, composite keys.** Each waits for a real model to demand it.

## Not in this repository

Live editors and plugins that render Skiss while you type are separate projects built on the `skiss` package. They have their own roadmaps.
