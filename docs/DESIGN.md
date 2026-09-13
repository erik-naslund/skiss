# Design notes

Why the rules in [SPEC.md](SPEC.md) are what they are. The spec says what the language is. This document says why, so the spec can stay short and the reasoning is not lost.

## Principles

1. **Editable at conversation speed.** "No, a Character can appear in several Films" is a two-second edit. Every rule is judged against that.
2. **A strict subset of LinkML.** Nothing in Skiss is outside LinkML. That is what makes "sketch now, graduate later" true instead of a promise.
3. **Absence means "not relevant yet".** Never "unknown", never "none". A sketch that made you say "I don't know" on every line would not be a sketch.
4. **Always renders.** While someone types, the document is invalid somewhere at every moment. One broken line must never blank the picture.

## The rules, one by one

### No colon means string

The colon means "I care about the type here". Leaving it out is the single most important ergonomic decision in the format: it lets you write a field without stopping to think about its type. The type is almost never what the conversation is about at that moment, and `string` is the honest placeholder.

### A class reference is written out, never inferred

There is no shortcut where a capitalised word after the colon is automatically a class. A rule that lives in the first letter of a word is invisible state, and invisible state is what gets lost when the tempo picks up. Saving a few characters is not worth a rule nobody can see.

The same reasoning is why a lowercase unknown word is a warning and not a guess. `crewSize: itn` is a typo. Turning it into a class, an enum, or anything else silently would hide the typo until it reached generated code.

### `[]` is written, never inferred from a plural

English is full of singular nouns that end in s: `progress`, `status`, `metadata`, `bonus`. A rule that guessed "many" from the name would misfire on real vocabulary, and the misfires would be the hardest kind to spot.

### Inline enums earn their surface

`climate: arid|temperate|frozen|unknown` is more syntax than most of the language. It is worth it because enum values are where domain experts disagree. "Temperate? We never say temperate" is exactly the interruption you came for.

An enum needs at least one pipe. A single value is indistinguishable from a typo, and is also what a half-typed enum looks like for the half second before the pipe is typed. Treating it as a warning covers both.

### `@` on a field, not only on a class

A class on a whiteboard is often a view assembled from two or three systems. `popularityRank` may come from the community wiki even though `Character` is the catalogue's. Without field-level `@` you either have to lie about where the field lives, or split the box into two before anyone is ready to. That assembly is usually the architecturally interesting part of the picture, so the notation has to be able to say it.

### `~` and `=` are different statements

`~` says two classes describe the same reality: different fields, usually different id spaces, sometimes subtly different meaning. That is a domain conversation. `=` says how you actually join them: this field holds that field's value. That is an integration conversation. Both are worth drawing, and they must be drawn differently, so they are written differently.

There is no `=` at class level. If two classes are interchangeable they should be one class, and the urge to write `=` between them is itself the finding.

`=` carries no transformation. The real rule is often "our `characterId` is their `id` with a prefix stripped", and that belongs in a comment until a real model forces the question (see the open questions in the spec).

### `*` marks identity

Identifiers earn a place in a sketch because they are what makes `=` possible to discuss at all. A single explicit marker is enough: one per class, visible on the line. A class without one has no identity of its own, which is legal and meaningful. It is how you say "this is a value that lives inside something else".

### `#` and `?` go to different places

A description written during a workshop is real documentation and should reach generated docs for free. A doubt written during a workshop ("is this seats or minimum crew?") is a note to the team and must not. Two markers, two destinations. If there were one marker, generated documentation would fill with "check with the data team".

A note to yourself is a doubt with an addressee, so there is no separate TODO marker.

### Every line parses on its own

The document is always invalid while someone types. A grammar with error recovery could cope with that, at considerable cost. A line-based grammar gets it for free: read each line, mark the broken one, render the rest. See [ADR 0004](adr/0004-line-based-parsing-and-diagnostics.md).

### Class-local attributes, not shared slots

`Character.name` and `Planet.name` are almost never the same concept, so the LinkML style of one global slot shared across classes is the wrong default for a sketch. See [ADR 0005](adr/0005-class-local-attributes.md).

## What is deliberately left out

| Feature | Why not |
|---|---|
| Required / optional | Nobody knows at sketch time. The answer is always "required, obviously", followed by three exceptions. |
| Inheritance | Genuinely useful, genuinely overused. `Foo < Bar` is reserved for when a real model asks for it. |
| Cardinality beyond `[]` | `[0..1]`, `[1..*]` is where a sketch turns into a spec. |
| Composite keys | Two `*` in a class could one day mean a LinkML `unique_keys` entry. Waiting for a real model to need it. |
| Patterns, units, constraints | LinkML's job. |
| Sync direction, freshness, read/write on `@` | This is where a domain picture quietly becomes an integration diagram. Hard line. |
| Transformations on `=` | See above. |
| Other mapping kinds (`broad`, `narrow`, `related`) | `~` covers the case that actually comes up. |
| Layout, colours, positions | Belong to whatever draws the picture. |

## What the example shows

The Star Wars example in the spec is chosen to show three things that come up in almost every real domain:

1. **`Character` and `CharacterPage` are not the same class**, although they describe the same person. Different id spaces (`id` versus `slug`), different fields, different owners. Forcing that conversation early is worth more than the diagram.
2. **`popularityRank` lives somewhere other than its class.** The box is a view, not a table.
3. **`climate` has a contested value list.** That is where a domain expert interrupts.

## Notes for anything that draws Skiss

The notation was shaped by these, and anything that renders it should respect them.

- **Arrows leave from field rows, not box edges.** Otherwise `=` cannot be drawn, and `=` is half the point.
- **`@` is a badge while sketching, a grouping when presenting.** Badges tolerate gaps. Swimlanes force every class into exactly one lane, which you cannot honestly do mid-workshop.
- **An undeclared class is a placeholder, not an error.** A dashed box with the name. The gap is a finding.
- **Show example instances next to the diagram.** People correct data far faster than they correct schemas. Two or three concrete rows surface more errors than the boxes do.
- **Keep it hand-drawn.** A sketch that looks like a spec gets nodded at. A sketch that looks like a sketch gets criticised, which is the goal.
