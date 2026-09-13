# Skiss

**Specification, version 0.1**

A notation for sketching data models. It compiles to LinkML. The reasoning behind the rules is in [DESIGN.md](DESIGN.md); this document only says what the language is.

---

## 1. Scope

Skiss describes classes, their fields, the systems that own them, and how classes relate. It is a strict subset of LinkML: everything expressible in Skiss is expressible in LinkML.

Skiss does not describe layout, integration behaviour (sync direction, freshness, read/write), or constraints beyond what is listed in this document.

---

## 2. The whole language on one page

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

Film @Catalog
  id*
  title
  releasedOn: date
  characters: Character[]

Starship @Catalog
  id*
  name
  crewSize: int                         ? is this seats or minimum crew
  pilots: Character[]

CharacterPage @Community ~ Character    # the community wiki's version
  slug*
  characterId = Character.id
  summary                               # free text, written by editors
  editCount: int
```

Classes at column 0, fields indented under them. Six operators (`:` `[]` `|` `@` `~` `=`) and three markers (`*` `#` `?`).

---

## 3. Rules

### 3.1 Structure

- A line at column 0 that starts with an uppercase letter declares a **class**.
- A line with any leading whitespace declares a **field** of the most recent class. Indentation depth is not significant.
- A line at column 0 that starts with `#` is a **comment**. Generators ignore it.
- Blank lines are ignored.
- Class names are `UpperCamelCase`. Field names are `lowerCamelCase`.

### 3.2 Types

A colon gives a field a type.

```
crewSize: int
releasedOn: date
homeworld: Planet
```

A field without a colon has the type `string`.

**Primitives:** `string` `int` `float` `bool` `date` `datetime` `uri`. The aliases `text`, `integer` and `boolean` are accepted.

**A class name after the colon is a reference** to that class. A class is referenced by its full name; there is no shortcut form.

**Any other lowercase word after the colon is an unknown type.** It produces a warning, and the field is treated as `string`.

**A reference to a class that is not declared** produces a warning. The reference is kept, and the LinkML output contains a stub for the class (§5.1).

### 3.3 `[]` means many

```
films: Film[]
tags: string[]
```

`[]` follows the whole type, including an enum: `tags: red|green|blue[]`. It is never inferred from the field name.

### 3.4 Inline enums

```
climate: arid|temperate|frozen|unknown
```

Two or more values separated by `|`. A single value without a pipe is an unknown type (§3.2).

### 3.5 `@` marks the owning system

Valid on a class line and on a field line.

```
Character @Catalog
  id*
  popularityRank: int @Community
```

A field belongs to its class's system unless it names its own.

### 3.6 `~` relates two classes that describe the same thing

```
CharacterPage @Community ~ Character
```

Class level only. Compiles to `close_mappings`. There is no `=` at class level.

### 3.7 `=` joins a field to a field

```
characterId = Character.id
```

Field level only. The right-hand side is a class name and a field name in that class. `=` carries no transformation.

### 3.8 `*` marks the identifier

```
Character @Catalog
  id*
```

At most one field per class. A second `*` in the same class produces a warning and is ignored. A class may have no identifier.

### 3.9 `#` describes, `?` doubts

```
summary                # free text, written by editors
crewSize: int          ? is this seats or minimum crew
climate: arid|frozen   # how habitable it is   ? "temperate" was contested
```

- `#` starts a **description**. It compiles to `description`.
- `?` starts a **doubt**. It compiles to an annotation and never to documentation.

Both are valid on class lines and field lines. If both appear, the description comes first and the doubt ends it.

**Delimiting.** A description starts at the first `#` preceded by whitespace. A doubt starts at the first `?` that stands alone: whitespace before it, and whitespace or end of line after it. A `?` attached to a word is ordinary text.

```
homeworld: Planet   # where were they born? ? confirm with archivists
crewSize: int       # is this seats?
```

The first line has a description ending in a question mark, then a doubt. The second has a description and no doubt.

### 3.10 Reserved

- A trailing `?` on a field name (`region?`) is not optional-marking and never will be.
- `<` after a class name is reserved for inheritance (`Foo < Bar`).

---

## 4. Grammar

```ebnf
document     = { line } ;
line         = class-line | field-line | comment-line | blank ;

comment-line = "#" text ;                                  (* at column 0 *)
class-line   = ClassName [ "@" System ] [ "~" ClassName ] [ trailer ] ;
field-line   = WS field-name [ "*" ]
                            [ ":" type ]
                            [ "@" System ]
                            [ "=" ClassName "." field-name ]
                            [ trailer ] ;

trailer      = [ "#" text ] [ "?" text ] ;                 (* delimited per §3.9 *)
type         = ( primitive | ClassName | enum ) [ "[]" ] ;
primitive    = "string" | "int" | "float" | "bool"
             | "date" | "datetime" | "uri"
             | "text" | "integer" | "boolean" ;
enum         = value "|" value { "|" value } ;

ClassName    = uppercase-letter { letter | digit } ;
field-name   = lowercase-letter { letter | digit } ;
System       = letter { letter | digit | "-" | "_" } ;
value        = letter { letter | digit | "-" | "_" } ;
WS           = one or more spaces or tabs ;
```

Modifier order on a field line is fixed as written.

Every line parses independently of every other line. Facts that involve more than one line (a referenced class exists, a name is duplicated) are established afterwards and produce warnings only (§7).

File extension: `.skiss`. Code fence language: `skiss`.

---

## 5. Compiling to LinkML

### 5.1 Element mapping

| Skiss | LinkML |
|---|---|
| class line | entry under `classes:` |
| field line | entry under that class's `attributes:` |
| `: int` | `range: integer` |
| no colon | `range: string` (via `default_range`) |
| `: Planet` | `range: Planet` |
| `[]` | `multivalued: true` |
| `a\|b\|c` | generated enum + `range: <Field>Enum` |
| `*` | `identifier: true` |
| `@System` | `annotations: {system: System}` |
| `~ Other` | `close_mappings: [<prefix>:Other]` |
| `= Other.field` | `annotations: {joins_to: "Other.field"}` |
| `# text` | `description: text` |
| `? text` | `annotations: {note: text}` |
| reference to an undeclared class | a stub class with `annotations: {undeclared: true}` |

Fields compile to class-local `attributes`, never to top-level `slots` ([ADR 0005](adr/0005-class-local-attributes.md)).

**Enum naming.** An inline enum on field `climate` becomes `ClimateEnum`. Fields with the same name and identical value sets share one enum. Fields with the same name and different value sets are each class-qualified: `PlanetClimateEnum`, `MoonClimateEnum`.

**Mapping prefix.** `~ Other` uses the prefix of Other's system when Other is declared with an `@`; otherwise the schema's own prefix.

### 5.2 Generated boilerplate

```yaml
id: https://example.org/<schema-name>
name: <schema-name>
default_prefix: <schema-name>
default_range: string
prefixes:
  linkml: https://w3id.org/linkml/
  <schema-name>: https://example.org/<schema-name>/
  catalog: https://example.org/system/catalog/     # one per @System seen
  community: https://example.org/system/community/
imports:
  - linkml:types
```

The base URI is a placeholder. The schema name is taken from the file name and normalised to a valid LinkML name (lowercase, underscores).

### 5.3 Worked example

Skiss:

```
Character @Catalog                      # a person or droid in the archive
  id*
  name
  homeworld: Planet
  popularityRank: int @Community        ? do we actually want this here

Planet @Catalog
  id*
  name
  climate: arid|temperate|frozen|unknown

CharacterPage @Community ~ Character    # the community wiki's version
  slug*
  characterId = Character.id
  editCount: int
```

LinkML:

```yaml
id: https://example.org/galaxy_catalogue
name: galaxy_catalogue
default_prefix: galaxy_catalogue
default_range: string
prefixes:
  linkml: https://w3id.org/linkml/
  galaxy_catalogue: https://example.org/galaxy_catalogue/
  catalog: https://example.org/system/catalog/
  community: https://example.org/system/community/
imports:
  - linkml:types

classes:

  Character:
    description: a person or droid in the archive
    annotations:
      system: Catalog
    attributes:
      id:
        identifier: true
      name: {}
      homeworld:
        range: Planet
      popularityRank:
        range: integer
        annotations:
          system: Community
          note: do we actually want this here

  Planet:
    annotations:
      system: Catalog
    attributes:
      id:
        identifier: true
      name: {}
      climate:
        range: ClimateEnum

  CharacterPage:
    description: the community wiki's version
    annotations:
      system: Community
    close_mappings:
      - catalog:Character
    attributes:
      slug:
        identifier: true
      characterId:
        annotations:
          joins_to: Character.id
      editCount:
        range: integer

enums:
  ClimateEnum:
    permissible_values:
      arid:
      temperate:
      frozen:
      unknown:
```

This pair is a golden test: the Skiss input must produce exactly this YAML.

---

## 6. Not in the language

Required/optional, inheritance, cardinality beyond `[]`, composite keys, patterns, units, constraints, sync direction or freshness on `@`, transformations on `=`, mapping kinds other than `~`, and layout. See [DESIGN.md](DESIGN.md) for why.

---

## 7. Parsing contract

1. **Parse** reads each line on its own. A line that does not match the grammar produces an *error* attached to that line and is skipped. Nothing on one line affects how another is read.
2. **Resolve** runs over the parsed document and links references, finds duplicates, unknown types and undeclared classes. It produces *warnings* only and never removes anything.

A parser never throws and never returns nothing. It returns whatever it could read plus a list of diagnostics, each with a severity, a stable code, a line, and where possible a column range. The codes are listed in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 8. Reading LinkML into Skiss

*Designed, not built.*

A LinkML schema can be projected into Skiss so it can be read and discussed as a sketch.

**Maps cleanly:** classes, attributes, `range`, `multivalued`, `identifier`, `description`, `close_mappings`, and Skiss's own annotations. Global slots are flattened into the classes that use them. Enums are inlined when used in exactly one place.

**Does not map:** `slot_usage`, patterns, units, constraints, mixins, `unique_keys`, `is_a`.

The projection reports what it dropped, never silently:

```
Dropped: is_a on 4 classes, 3 patterns, 2 mixins, slot_usage on 7 slots.
```

Round-tripping is asymmetric: Skiss → LinkML → Skiss is identity; LinkML → Skiss → LinkML is lossy unless the original is retained.

### 8.1 Editing a projected schema

An editor may present a LinkML schema as Skiss, accept edits, and merge them back so that everything Skiss cannot express survives untouched. This requires:

- **Stable identity** for every class and slot, so that a rename is a rename and not a delete plus a create. Either an annotation in the LinkML file or a sidecar mapping.
- **Three edit outcomes.** A clean merge (the edit only touches what Skiss can express) is silent. An orphaned detail (a deleted slot carried hidden LinkML) is reported. A conflict (the edit contradicts hidden LinkML) must be put to the user.
- **Two explicit modes, never mixed.** In a sketch, absence means "not relevant yet". In a projection, absence means "there are things you cannot see". A projected document may be detached into a plain sketch only as a deliberate act, with a list of what is discarded.

---

## 9. Open questions

1. **Does `=` ever carry a transformation?** Often the real join rule is "their `id` with a prefix stripped". A comment for now; the first thing likely to force a 0.2.
2. **Inheritance.** Reserved as `<`, not defined. The most likely first thing to be missed.
3. **What breaks first against a real model?**
