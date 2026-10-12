---
name: skiss
description: Write, check and draw data-model sketches in Skiss, a text notation for sketching data models during a domain conversation. Use when someone asks to sketch, model, map out or diagram entities, classes, tables, fields or relationships, mentions Skiss or a .skiss file, or wants a class diagram or a LinkML schema from a conversation. Produces valid Skiss, a Mermaid class diagram of it, and LinkML when asked.
license: MIT
---

# Skiss

Skiss is a text notation for sketching a data model as fast as someone can describe it. One line per class, one line per field, seven operators and three markers. It compiles to a Mermaid class diagram and to [LinkML](https://linkml.io). Specification: <https://github.com/erik-naslund/skiss/blob/main/docs/SPEC.md>. Try a sketch live: <https://erik-naslund.github.io/skiss-playground/>.

Your job: turn what people say into a *valid* sketch, keep it small, and show it as a diagram. Never produce a look-alike; the rules below are the whole language.

## Workflow

1. **Write the sketch** in a ```skiss fence. Header comment on line 1 saying what it is about.
2. **Check it** against *The rules* and *Not in the language* below. If a shell is available, run the real compiler instead of checking by hand:
   `npx -y @eriknaslund/skiss compile model.skiss --strict -o /dev/null`
   Exit 1 or any line on standard error means the sketch has a diagnostic; fix it before showing anything. Diagnostics read `file:line:col: severity CODE message` (see `reference/diagnostics.md`).
3. **Draw it.** With a shell: `npx -y @eriknaslund/skiss diagram model.skiss --notes` prints Mermaid (`--notes` turns `?` doubts into notes on the diagram). Without a shell: write the Mermaid yourself by the mapping in `reference/mermaid.md`, which is exactly what the compiler does. Put it in a ```mermaid fence; most chat hosts render it.
4. **Offer the playground** when the person wants to keep editing: paste the sketch at <https://erik-naslund.github.io/skiss-playground/>, which draws it as they type, shares it as a link and exports SVG, PNG and LinkML.
5. **LinkML only when asked.** `npx -y @eriknaslund/skiss compile model.skiss` writes the schema; the mapping is SPEC §5. Do not hand-write LinkML.
6. When the sketch changes, redo steps 2 and 3 and replace both fences. Never edit the Mermaid by hand to say something the sketch does not.

## The language on one screen

```skiss
# Groups and schedules: who sees which content on a given day

Schedule @Content                 # only the differences; the rest is inherited
    id*
    parent: Schedule              # empty for the default schedule
    entries: ScheduleEntry[]

ScheduleEntry @Content
    id*
    targetType: game|level        # later also price, copy, flag
    from: datetime                ? whose day governs, UTC or player-local
    until: datetime

Group @Targeting
    id*
    priority: int                 # lower number wins
    audience: Audience
    percent: int
    salt                          # random, fixed at creation
    schedule: Schedule            # empty means control group

Audience @Targeting
    id*
    rule                          # expression over player attributes

PremiumSchedule < Schedule        # same shape, one extra field
    tier: silver|gold
```

- A line at column 0 starting with an uppercase letter is a **class**. An indented line is a **field** of the class above it. Blank lines are ignored.
- `ClassName` is UpperCamelCase, `fieldName` is lowerCamelCase. Letters and digits are ASCII only: `förnamn` and `Beställning` are not names. The domain's own words go in the `#` description.
- A field with no type is a `string`. Types: `string`, `int`, `float`, `bool`, `date`, `datetime`, `uri`, another class by name, or an inline enum `a|b|c` (two or more values, letters, digits, `-` and `_`, no spaces around `|`).
- `[]` after the whole type means many: `films: Film[]`, `tags: red|green[]`. It is the only cardinality there is.
- `id*` marks the identifier: one `*` per class, on the field that identifies it.
- `@System` on a class or a field names the system that owns it.
- `< Parent` on a class line is single inheritance. The child has the parent's fields; a child field with the same name replaces it.
- `~ OtherClass` on a class line says the two classes describe the same thing in different systems. `= Other.field` on a field joins it to that field.
- `# text` is a description, `? text` is an open question. Both need whitespace before the mark. On one line the description comes first and the `?` ends it. A `?` attached to a word (`seats?`) is ordinary text.
- Order on a class line: name, `< Parent`, `@System`, `~ Class`, then `#` and `?`. On a field line: name, `*`, `: type`, `@System`, `= Class.field`, then `#` and `?`.
- A `#` at column 0 is a comment line.

## Not in the language

These are the mistakes most often made when translating a whiteboard into Skiss.

- **No commas.** `a, b: int` is two field lines. One field per line, always.
- **No optional or required marker.** `parent: Schedule?` is invalid; `required` does not exist. Say it in words: `parent: Schedule   # empty for the default`.
- **No cardinality beyond `[]`.** No `[0..1]`, no `[1..*]`, no "exactly two". That is where a sketch turns into a specification.
- **No list syntax other than `[]`.** Not `[Film]`, not `List<Film>`, not `Film*`.
- **No alternatives with `/`.** `a / b` is two fields or an enum.
- **No composite keys, units, patterns, constraints, defaults, or multiple inheritance.**
- **No referencing a class that is not declared** without a warning. Declare a stub (`Player` with `id*`) rather than leave it dangling.
- **No capitalised primitives.** `Int`, `String`, `Boolean` warn; write `int`, `string`, `bool`.
- A `#` with whitespace before it inside a class or field line is a description, not a comment. Comments start at column 0.

## Style

- Keep the sketch small: only the fields that matter for the conversation. Silence means unknown; that is a feature.
- Align the `#` descriptions in a column; whitespace between tokens is free.
- Put an open question on the thing it is about, as `? ...`, so it shows up on the diagram and in the list of open questions.
- When someone says "a customer can have several orders", that is `orders: Order[]` on `Customer`, nothing more. Do not add the reverse field unless they say it matters.
- Use `@System` as soon as two systems are in the room; it is the cheapest way to make ownership visible.

## Reference files

- `reference/mermaid.md`: the exact Mermaid the compiler writes for each construct, for drawing without a shell.
- `reference/diagnostics.md`: every error and warning code, what triggers it, and the fix.
- `reference/examples.md`: three complete sketches with their diagrams.
