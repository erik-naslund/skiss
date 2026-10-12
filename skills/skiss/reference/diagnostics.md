# Diagnostics

`skiss compile` and `skiss diagram` never fail on bad input: every line that does not parse produces one diagnostic and is skipped, and the rest of the sketch still compiles. `--strict` makes any diagnostic exit 1, which is the setting to use before showing a sketch to anyone.

A diagnostic reads `file:line:col: severity CODE message`. The codes:

| Code | Severity | Trigger | Fix |
|---|---|---|---|
| `E_UNPARSABLE` | error | The line matches no production: an operator in the wrong order, a stray character, a `@System` or enum value spelled wrong. | Read the order rule in SKILL.md; one construct per line. |
| `E_FIELD_WITHOUT_CLASS` | error | An indented line before any class line, or under a class line that failed after its name. | Put a class line above it, or fix the class line. |
| `E_MISSING_TYPE` | error | A colon with nothing after it. | Give the type or drop the colon. |
| `E_UNCLOSED_MANY` | error | `[` without `]`. | Write `[]`. |
| `E_BAD_NAME` | error | A class name not UpperCamelCase or a field name not lowerCamelCase, or a character outside ASCII. The message names the character. | Rename; put the domain word in the `#` description. |
| `E_INHERITANCE_CYCLE` | error | `<` closes a circle. | Remove one `<`. |
| `W_UNKNOWN_TYPE` | warning | A lowercase type that is no primitive and no enum, such as `text2` or `Int` written as `int2`. Falls back to `string`; the message suggests a primitive when one is close. | Use a primitive, a class name, or an enum. |
| `W_UNDECLARED_CLASS` | warning | `: X`, `~ X` or `= X.f` where `X` is not declared. A box marked `<<undeclared>>` is drawn. | Declare `X`, at least with `id*`. |
| `W_UNDECLARED_FIELD` | warning | `= X.f` where `X` has no field `f`. | Fix the field name. |
| `W_DUPLICATE_CLASS` | warning | Two classes with the same name. | Merge or rename. |
| `W_DUPLICATE_FIELD` | warning | Two fields with the same name in one class. | Remove one. |
| `W_DUPLICATE_ENUM_VALUE` | warning | The same value twice in one enum. | Remove one. |
| `W_MULTIPLE_IDENTIFIERS` | warning | More than one `*` in a class, an inherited one included. The first wins. | Keep one `*`. |
| `W_REDUNDANT_OVERRIDE` | warning | A child field identical to the parent's. | Remove it from the child. |

Common first attempts and what the compiler says:

```skiss-invalid
Order
    lines: OrderLine[]
    status: open | paid           # E_UNPARSABLE: no spaces around |
    total: Float                  # W_UNKNOWN_TYPE: write float
    customer: Customer?           # E_UNPARSABLE: no optional marker
    a, b: int                     # E_UNPARSABLE: one field per line
```

Fixed, with the two referenced classes declared so nothing is `W_UNDECLARED_CLASS`:

```skiss
Order
    lines: OrderLine[]
    status: open|paid
    total: float
    customer: Customer            # empty for a guest order
    a: int
    b: int

OrderLine
    id*

Customer
    id*
```
