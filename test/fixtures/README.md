# Fixtures

Golden files. Each fixture is a `.skiss` input next to the outputs it must
produce, derived by hand from `docs/SPEC.md` and the mapping tables in
`docs/ARCHITECTURE.md`. The code is held to these files, not the other way
round. A fixture change is a language change and is reviewed as one.

**basic** (`basic.skiss`, `basic.ast.json`, `basic.mmd`). The example from
SPEC §2, verbatim. It uses every operator and marker at least once in a small
model, and its Mermaid output is the reference for the mapping table with
`notes` off. `basic.ast.json` is the document `parse` returns for it, with
every position, and is the reference for the AST shape. Its LinkML output
(`basic.linkml.yaml`) is added in Milestone 2; the SPEC §5.3 worked example
is a separate, smaller golden added then as well.

**systems** (`systems.skiss`, `systems.mmd`). A second model, a library
lending system across three systems, chosen to exercise the corners `basic`
does not: a field that names its own `@System`, `~` and `=` together on one
class, the same field name (`status`) with different enum values on two
classes, `[]` on an inline enum, a class with no identifier, a description
and a doubt on class lines, a description whose text contains a `?` followed
by a real doubt, a field with only a doubt, the `integer` and `boolean`
aliases, and a column-0 comment. Its Mermaid output is derived with `notes`
off, so no description or doubt appears in it.

**spec-example** (`spec-example.skiss`, `spec-example.linkml.yaml`). The
worked example from SPEC §5.3, both halves copied byte for byte. It covers
the mappings the spec chose to demonstrate: `@System` annotations on a class
and on a field, an inline enum, `~`, `=`, `*`, `: int` and `: Planet`. It
lands before the generator does, so the spec's own example is checked by
LinkML itself rather than only read. When the generator arrives it must
produce this YAML from this Skiss, exactly.

**broken** (`broken.skiss`, `broken.mmd`, `broken.diagnostics.json`). The
mid-typing states. Every diagnostic code in the ARCHITECTURE.md table
appears at least once, on a line preceded by a column-0 comment naming the
code. Valid lines are interleaved so the partial document still has
complete classes and relations. `broken.diagnostics.json` lists the
expected code, severity and 1-based line for each diagnostic, sorted by
line, without messages. `broken.mmd` is the diagram of the partial
document: lines that produce an error are absent, lines that produce a
warning are present, and classes that are referenced but never declared
appear as `<<undeclared>>` placeholders.

Every `*.linkml.yaml` fixture here is validated in CI by the real LinkML
toolchain — `linkml-lint` and `gen-python`, from the pinned version that
`scripts/linkml-env.sh` installs — never by a hand-written approximation
(ADR 0007).
