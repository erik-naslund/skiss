# Fixtures

Golden files. Each fixture is a `.skiss` input next to the outputs it must
produce, derived by hand from `docs/SPEC.md` and the mapping tables in
`docs/ARCHITECTURE.md`. The code is held to these files, not the other way
round. A fixture change is a language change and is reviewed as one.

**basic** (`basic.skiss`, `basic.ast.json`, `basic.mmd`,
`basic.linkml.yaml`). The example from SPEC §2, verbatim. It uses every
operator and marker at least once in a small model, and its Mermaid output
is the reference for the mapping table with `notes` off. `basic.ast.json`
is the document `parse` returns for it, with every position, and is the
reference for the AST shape. `basic.linkml.yaml` is the schema `toLinkML`
produces from it with the schema name `basic`, and is the reference for the
SPEC §5.1 mapping rows on a model that compiles cleanly.

**systems** (`systems.skiss`, `systems.mmd`, `systems.linkml.yaml`). A
second model, a library lending system across three systems, chosen to
exercise the corners `basic` does not: a field that names its own
`@System`, `~` and `=` together on one class, the same field name
(`status`) with different enum values on two classes, the same field name
(`format`) with identical enum values on two classes, `[]` on an inline
enum, an enum of numeric values (`rating`), which reaches LinkML as quoted
permissible values, a class with no identifier, a description and a doubt on class lines,
a description whose text contains a `?` followed by a real doubt, a field
with only a doubt, the `integer` and `boolean` aliases, and a column-0
comment. Its Mermaid output is derived with `notes` off, so no description
or doubt appears in it. `systems.linkml.yaml` is the schema for the same
model, and is where both enum-naming branches are under the LinkML gate:
`format` shared between two classes, `status` qualified into
`BookStatusEnum` and `LoanStatusEnum`.

**spec-example** (`spec-example.skiss`, `spec-example.linkml.yaml`). The
worked example from SPEC §5.3, both halves copied byte for byte. It covers
the mappings the spec chose to demonstrate: `@System` annotations on a
class and on a field, an inline enum, `~`, `=`, `*`, `: int` and
`: Planet`. The spec's own example is checked by LinkML itself rather than
only read, and the generator produces this YAML from this Skiss, exactly.

**broken** (`broken.skiss`, `broken.mmd`, `broken.diagnostics.json`,
`broken.linkml.yaml`). The mid-typing states. Every diagnostic code in the
ARCHITECTURE.md table appears at least once, on a line preceded by a
column-0 comment naming the code. Valid lines are interleaved so the
partial document still has complete classes and relations.
`broken.diagnostics.json` lists the expected code, severity and 1-based
line for each diagnostic, sorted by line, without messages. `broken.mmd` is
the diagram of the partial document: lines that produce an error are
absent, lines that produce a warning are present, and classes that are
referenced but never declared appear as `<<undeclared>>` placeholders.
`broken.linkml.yaml` is the schema for the same partial document: the
lines that produce an error are absent from it too, and a class that is
referenced but never declared is a stub carrying the `undeclared`
annotation.

**foreign** (`foreign.linkml.yaml`, `foreign.skiss`,
`foreign.dropped.json`). The only fixture that starts as LinkML. A conference
programme written by hand in another author's style, with everything SPEC §8
says does not map: global slots two classes share, `is_a`, a mixin class and
the `mixins` that use it, `slot_usage`, patterns, `required`, `unique_keys`,
`minimum_value`, `comments`, `see_also`, a `time` range, an enum shared by two
differently named attributes, an enum whose permissible values carry
descriptions, snake_case names throughout, a folded multi-line
description, and a description whose text holds a standalone `?` on a slot
that also carries a note, which SPEC §8 rewords rather than let it come back
split. `foreign.skiss` is the sketch `fromLinkML` projects it to and
`foreign.dropped.json` is what it reported dropping, in schema order. It is
also under the LinkML gate, so the input is a schema the real toolchain
accepts rather than one invented to be convenient.

Every `*.linkml.yaml` fixture here is validated in CI by the real LinkML
toolchain — `linkml-lint` and `gen-python`, from the pinned version that
`scripts/linkml-env.sh` installs — never by a hand-written approximation
(ADR 0007).
