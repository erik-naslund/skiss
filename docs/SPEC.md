# Skiss

**Specification, version 0.3.1**

*Applies to skiss 0.5.0.* The specification and the package carry separate version numbers: this document describes the language, and it moves when the language does.

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

Classes at column 0, fields indented under them. Seven operators (`:` `[]` `|` `@` `~` `=` `<`) and three markers (`*` `#` `?`). The example above uses every one of them but `<`, which is inheritance (§3.10).

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

**A reference to a class that is not declared** produces a warning. The reference is kept, and the LinkML output contains a stub for the class (§5.1). When the name is a primitive written with a capital, such as `Int` or `Boolean`, the warning says which primitive was meant; the name is still read as a class.

### 3.3 `[]` means many

```
films: Film[]
tags: string[]
```

`[]` follows the whole type, including an enum: `tags: red|green|blue[]`. It is never inferred from the field name.

### 3.4 Inline enums

```
climate: arid|temperate|frozen|unknown
priority: 1|2|3
```

Two or more values separated by `|`. A single value without a pipe is an unknown type (§3.2).

A value may start with a digit and may be digits only, so `1|2|3` is three values and not a number. It compiles to the permissible values `"1"`, `"2"` and `"3"`, quoted, because LinkML reads the file as YAML.

The values are a set: a value written twice in one enum is a warning (`W_DUPLICATE_ENUM_VALUE`, listed with the other codes in [ARCHITECTURE.md](ARCHITECTURE.md)), the line is kept as written, and the enum carries the value once.

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

### 3.10 `<` inherits

```
Jedi < Character
  rank: padawan|knight|master
```

Class level only, and directly after the class name: `@`, `~`, `#` and `?` follow the parent. Whitespace around `<` is not significant.

`Jedi` has every field `Character` has, and then its own. **One parent:** `Jedi < Character, Droid` is unparsable, and so is `<` on a field line. The identifier inherits like any other field, so a class that inherits one and writes its own `*` gets the warning of §3.8: the inherited identifier is the one that stands.

A field written on the child with the name of a field it inherits **replaces** it. The whole field is replaced, not the parts the child writes. A child field that is identical to the field it replaces is a warning: it says nothing the parent does not.

**A parent that is not a declared class** is a warning and leaves a stub, as a reference does (§3.2); the child inherits nothing, because nothing here says what the parent has. A parent that is a primitive is an error: a primitive is not a class.

**A class that inherits from itself**, directly or through its parents, is an error on the line that closes the circle. Every class is kept and so is every other `<`; the one that closes the circle is not carried into the output.

### 3.11 Reserved

- A trailing `?` on a field name (`region?`) is not optional-marking and never will be.

---

## 4. Grammar

```ebnf
document     = { line } ;
line         = class-line | field-line | comment-line | blank ;

comment-line = "#" text ;                                  (* at column 0 *)
class-line   = ClassName [ "<" ClassName ] [ "@" System ]
                         [ "~" ClassName ] [ trailer ] ;
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
value        = ( letter | digit ) { letter | digit | "-" | "_" } ;
WS           = one or more spaces or tabs ;

uppercase-letter = "A" … "Z" ;                             (* ASCII *)
lowercase-letter = "a" … "z" ;                             (* ASCII *)
letter       = uppercase-letter | lowercase-letter ;
digit        = "0" … "9" ;
```

**Names are ASCII.** A letter is an ASCII letter and a digit an ASCII digit, in every name the language has: a class name, a field name, a system name and an enum value. A name is an identifier everywhere it goes — a LinkML class or slot, part of the schema's URI, a generated Python class, a node in a diagram — and those do not take the rest of the alphabet, so `Beställning` is not a class name and `förnamn` is not a field name. The words of the domain, in whatever alphabet they are spoken, go in the `#` description of the thing they name (§3.9).

Modifier order is fixed as written, on a class line and on a field line alike.

**Whitespace.** A space and a tab are the same character to the grammar. Between tokens it is not significant and any amount of it is allowed: `name : int`, `name:int` and `films: Film []` all read as the same line. `[]` is one token, so `Person[ ]` is an unclosed `[`. What is significant is the whitespace at the start of a line, which is what makes the line a field of the class above it; one or more spaces or tabs, and no further meaning is given to how many. Trailing whitespace is not part of a name, a type or a trailer text. A line that is empty or holds only whitespace is a blank line and is skipped.

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
| `< Parent` | `is_a: Parent` |
| a field replacing an inherited one | an attribute of the child with the same name; the parent's attribute is not repeated for any other field |
| `~ Other` | `close_mappings: [<prefix>:Other]` |
| `= Other.field` | `annotations: {joins_to: "Other.field"}` |
| `# text` | `description: text` |
| `? text` | `annotations: {note: text}` |
| reference to an undeclared class | a stub class with `annotations: {undeclared: true}` |

Fields compile to class-local `attributes`, never to top-level `slots` ([ADR 0005](adr/0005-class-local-attributes.md)).

**Inheritance.** `is_a` carries it; the parent's attributes are not repeated in the child. A field that replaces an inherited one (§3.10) is an entry of the child's own `attributes`, like any other field: LinkML induces it over the attribute of that name the child would otherwise inherit. The `<` that closes a circle is not written at all. The keys of a class are written in the order `description`, `is_a`, `annotations`, `close_mappings`, `attributes`.

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

Required/optional, multiple inheritance, cardinality beyond `[]`, composite keys, patterns, units, constraints, sync direction or freshness on `@`, transformations on `=`, mapping kinds other than `~`, and layout. See [DESIGN.md](DESIGN.md) for why.

---

## 7. Parsing contract

1. **Parse** reads each line on its own. A line that does not match the grammar produces an *error* attached to that line and is skipped. Nothing on one line affects how another is read.
2. **Resolve** runs over the parsed document and links references, finds duplicates, unknown types and undeclared classes. It produces *warnings*, and one *error* no single line can see: a circle of `<` (§3.10). It never removes anything.

A parser never throws and never returns nothing. It returns whatever it could read plus a list of diagnostics, each with a severity, a stable code, a line, and where possible a column range. The codes are listed in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 8. Reading LinkML into Skiss

A LinkML schema can be projected into Skiss so it can be read and discussed as a sketch. The projection is the inverse of §5.1 wherever §5.1 has an inverse, and a report of what it could not carry everywhere else. It never fails: a schema it cannot read at all projects to an empty sketch and a report that says why.

### Element mapping

| LinkML | Skiss |
|---|---|
| a class | a class line |
| a class annotated `undeclared: true` | nothing: it is the stub a reference left behind (§5.1) |
| the class's `attributes`, then the schema `slots` the class lists, in that order | fields; an attribute that shadows a slot the class inherits is a field like any other, and is the field that replaces it (§3.10) |
| `identifier: true` | `*` |
| `is_a` | `< Parent`; a parent the schema does not define is an undeclared class, as a reference to one is |
| an entry under `slot_usage` naming a slot the class inherits | a field on the child, read from that entry alone |
| `range` naming a class of the schema, or any other capitalised name | a class reference |
| `range` naming an enum of the schema | an inline enum, its `permissible_values` keys in order |
| `integer`; `float`, `double`, `decimal`; `boolean`; `date`; `datetime`; `uri`, `uriorcurie` | `int`, `float`, `bool`, `date`, `datetime`, `uri` |
| `string`, or no `range` where `default_range` is `string` | no type |
| no `range`, where `default_range` is not `string` | whatever the rows above give that type |
| any other LinkML type (`time`, `curie`, `ncname`, …) | the word as written, lowercase, which reads as an unknown type (§3.2) and falls back to `string` |
| `multivalued: true` | `[]` |
| `description` | `#`, its newlines replaced by spaces |
| `annotations: {system: S}` | `@S` |
| `annotations: {note: text}` | `? text` |
| `annotations: {joins_to: Class.field}` | `= Class.field` |
| `close_mappings: [prefix:Class]`, or a full IRI | `~ Class`, from the first entry: the name after its last `:`, `/` or `#` |

**Names.** Skiss cannot read a class name that is not `UpperCamelCase` or a field name that is not `lowerCamelCase`, so `page_count` and `Page-Count` are converted rather than kept, and every conversion is reported. A reference is converted with the name it points at, and is reported where it appears, since a reference out of the schema has no declaration here to carry the report. Two names that converge take a number: `PageCount`, `PageCount2`. A name with nothing in it to convert becomes `Class` or `field`, and one that would start with a digit takes a leading `X` or `x`: §4 has no other way to start a name.

**Multivalued.** `multivalued: true` is `[]`, and `[]` has to attach to a type. Where a row above writes no type — `string`, an enum Skiss cannot write, a range it cannot write — a multivalued slot is written `string[]` rather than untyped.

**Descriptions.** A `description` is written as it stands, its newlines replaced by spaces, except for a standalone `?` in its text. Written as it stands, such a `?` would read as the start of a doubt when the sketch is parsed again (§3.9): the sentence would come back split across `#` and `?`, and a doubt already on the element would be appended to the half that was split off. So the `?` is attached to the word before it — the whitespace between them is dropped — which §3.9 reads as ordinary text. A `?` with no word before it attaches to the `#` that starts the description, as `#? confirm`. Nothing else in the text changes, and every description reworded this way is reported, counted as `1 description reworded`. A doubt is not touched: a `?` anywhere in it is ordinary text, because a doubt runs to the end of the line.

**Enums.** Skiss has no named enums, so an enum is inlined at every attribute whose range it is and its name is not carried. An enum used by exactly one attribute is inlined and nothing is reported. An enum used by several is inlined in each of them, and is reported when the inlining loses the sharing: when §5.1 would not rebuild one enum from the result, because the attributes do not all have one name, or because another attribute of that name carries different values. A permissible value with a body of its own — a `description`, a `meaning`, anything else — is inlined by its key and its body is reported, as is any key on the enum other than `permissible_values`. An enum Skiss cannot write, one with fewer than two values (§3.4) or with a value that is not a Skiss value (§4), is not inlined at all: the attribute keeps no type, and the enum is reported. A value of digits is a Skiss value, so an enum of `1`, `2` and `3` is inlined like any other.

### The report

Everything the table does not carry is reported, never dropped silently: `mixins`, `slot_usage` the table has no field for, `required`, `key`, `pattern`, `unit`, `minimum_value` and `maximum_value`, `unique_keys`, mapping kinds other than `close_mappings`, `comments`, `see_also`, and every other key on a class, a slot or an enum. A key the table does carry, written with a value it cannot be read from — an `identifier` or a `multivalued` that is not a boolean, a `range` that is not a name, an `attributes` block that is not a map, a `slots` block that is not a list, an attribute whose body is not a slot definition — is reported under that key too, with what was found there. It is never guessed at: which YAML dialect wrote `yes` is the reader's question, not the sketch's. A report names the LinkML key, the element it was on — a class, a `Class.field`, or an enum, named as it appears in the sketch — and, where that helps, what was on it. `slot_usage` naming a slot the sketch cannot find — the class has no parent the schema defines, or no parent of it declares the slot — is reported on the class instead, naming the slot. Schema-level boilerplate (`id`, `name`, `prefixes`, `imports`, `default_prefix`, `default_range`, `title`, `license`, `version`) is not reported; every other key at schema level is reported, one report each.

The reports are counted, grouped by kind, and written as one line in schema order:

```
Dropped: required on 4 slots, 3 patterns, 2 mixins, slot_usage on 7 slots.
```

Converted names and inlined enums are further sentences of the same line:

```
Dropped: pattern on 1 slot. Renamed: 6 names. Inlined: 1 enum.
```

A projection that dropped nothing reports an empty line, not a line saying that nothing was dropped.

**Round-tripping is asymmetric.** Skiss → LinkML → Skiss is identity up to canonical form for every document LinkML carries whole: what comes back is the same document in the one layout `toSkiss` writes, so an alias normalises to the primitive it names (`integer` comes back as `int`) and a column-0 comment, which no document node holds, does not survive. LinkML → Skiss → LinkML is lossy unless the original is retained; the report says by how much.

### 8.1 Editing a projected schema

*Designed, not built.*

An editor may present a LinkML schema as Skiss, accept edits, and merge them back so that everything Skiss cannot express survives untouched. This requires:

- **Stable identity** for every class and slot, so that a rename is a rename and not a delete plus a create. Either an annotation in the LinkML file or a sidecar mapping.
- **Three edit outcomes.** A clean merge (the edit only touches what Skiss can express) is silent. An orphaned detail (a deleted slot carried hidden LinkML) is reported. A conflict (the edit contradicts hidden LinkML) must be put to the user.
- **Two explicit modes, never mixed.** In a sketch, absence means "not relevant yet". In a projection, absence means "there are things you cannot see". A projected document may be detached into a plain sketch only as a deliberate act, with a list of what is discarded.

---

## 9. Open questions

1. **Does `=` ever carry a transformation?** Often the real join rule is "their `id` with a prefix stripped". A comment for now; the first thing likely to force a 0.2.
2. ~~**Inheritance.** Reserved as `<`, not defined.~~ Settled in 0.3 (§3.10): one parent, on a class line only, and the identifier inherits. Mixins, abstract classes and interfaces are not part of it.
3. **What breaks first against a real model?**
4. **Is a single value after the colon that is not a word a type at all?** `priority: 1` is neither an enum (§3.4 needs a pipe) nor an unknown type (§3.2 reads a lowercase word), so it is unparsable, while `priority: 1|2` is an enum. Settled the other way it would need a rule for what a one-value type means.
