// The cross-line pass: SPEC §3.2, §3.8 and §7, ADR 0004.
//
// `parse` reads every line on its own, so anything that needs two lines to
// know is established here: whether a referenced class or field exists,
// whether a name is duplicated, whether a class has more than one `*`, what a
// class inherits. It produces warnings and the one error no single line can
// see — a circle of `<` (SPEC §7, §3.10) — never removes a node or a
// diagnostic, never throws, and never touches its input.

import type {
  ClassNode,
  Diagnostic,
  DiagnosticCode,
  Document,
  FieldNode,
  JoinRef,
  Name,
  TypeRef,
} from './ast.ts';
import { inheritance, sameField } from './inheritance.ts';
import { PRIMITIVES } from './parse.ts';

/** What `resolve` returns: a `Document` whose `undeclared` list is always present. */
export interface ResolvedDocument extends Document {
  undeclared: Name[];
}

export function resolve(doc: Document): ResolvedDocument {
  // A deep copy, so nothing in the output is shared with the input and the
  // identifier flags below can be cleared without mutating it (AC1).
  const out: ResolvedDocument = {
    ...doc,
    classes: doc.classes.map(copyClass),
    diagnostics: doc.diagnostics.map((d) => ({ ...d })),
    undeclared: [],
  };
  const classes = out.classes;

  const declared = new Set(classes.map((c) => c.name.text));
  const found: Diagnostic[] = [];
  const undeclared = new Map<string, Name>();
  // The parent chains of the copy, so clearing a `<` below cannot change them.
  const tree = inheritance(classes);

  const warn = (code: DiagnosticCode, message: string, at: Name): void => {
    found.push({ severity: 'warning', code, message, line: at.line, col: at.col, end: at.end });
  };

  const error = (code: DiagnosticCode, message: string, at: Name): void => {
    found.push({ severity: 'error', code, message, line: at.line, col: at.col, end: at.end });
  };

  // `: X`, `~ X` or `= X.f` with X not declared (SPEC §3.2). The reference is
  // kept; the name goes on the list a generator draws placeholders from.
  const reference = (name: Name): boolean => {
    if (declared.has(name.text)) return true;
    if (!undeclared.has(name.text)) undeclared.set(name.text, name);
    // A capitalised primitive (`players: Int`) is read as a class by SPEC
    // §3.2, so the warning names the primitive the reader meant. The
    // reference itself is untouched: the fallback is still a placeholder.
    // `Object.hasOwn` and not a plain lookup: `Constructor` would otherwise
    // find `Object.prototype.constructor` and be hinted.
    const lower = name.text.toLowerCase();
    const hint = Object.hasOwn(PRIMITIVES, lower) ? `. Did you mean \`${lower}\`?` : '';
    warn('W_UNDECLARED_CLASS', `class \`${name.text}\` is not declared${hint}`, name);
    return false;
  };

  // One walk in document order keeps the warnings in line order, and on one
  // line in the order the tokens are written.
  const firstClass = new Map<string, ClassNode>();
  for (const cls of classes) {
    const earlier = firstClass.get(cls.name.text);
    if (earlier === undefined) firstClass.set(cls.name.text, cls);
    else {
      // Working default D1: both are kept, the later one carries the warning.
      warn(
        'W_DUPLICATE_CLASS',
        `class \`${cls.name.text}\` is already declared on line ${earlier.line}`,
        cls.name,
      );
    }

    // SPEC §3.10. The parent is read before `~` on the line, so its warning
    // comes first. An undeclared parent is a reference like any other: the
    // `<` is kept and LinkML gets a stub for the class.
    const parent = cls.parent;
    if (parent !== undefined) {
      reference(parent);
      const circle = tree.circle(cls);
      if (circle !== undefined) {
        const through = circle.slice(1).map((member) => `\`${member.name.text}\``);
        const path = through.length === 0 ? '' : ` through ${through.join(', ')}`;
        error(
          'E_INHERITANCE_CYCLE',
          `class \`${cls.name.text}\` inherits from itself${path}; this \`<\` is not carried`,
          parent,
        );
        // The circle is cut where it closed, as a second `*` is cleared: the
        // node is kept, and no generator has to know about circles.
        cls.parent = undefined;
      }
    }

    // Working default D3: `~` to the class itself is not a warning in 0.1.0.
    if (cls.similarTo !== undefined) reference(cls.similarTo);

    const firstField = new Map<string, FieldNode>();
    const inheritedIdentifier = tree.inheritedIdentifier(cls);
    let identifier: FieldNode | undefined = inheritedIdentifier?.field;
    for (const field of cls.fields) {
      const earlierField = firstField.get(field.name.text);
      if (earlierField === undefined) firstField.set(field.name.text, field);
      else {
        warn(
          'W_DUPLICATE_FIELD',
          `field \`${field.name.text}\` is already declared on line ${earlierField.line} in class \`${cls.name.text}\``,
          field.name,
        );
      }

      // SPEC §3.8: at most one identifier per class, the first wins. The
      // range is the `*` the warning is about (issue #16); a field carrying
      // `identifier` without a recorded position falls back to its name.
      if (field.identifier) {
        if (identifier === undefined) identifier = field;
        else {
          // SPEC §3.10: an inherited identifier counts, and the warning says
          // which class it was inherited from.
          const from =
            identifier === inheritedIdentifier?.field
              ? ` inherits the identifier \`${identifier.name.text}\` from class \`${inheritedIdentifier.from.name.text}\`, line`
              : ` already has the identifier \`${identifier.name.text}\` on line`;
          warn(
            'W_MULTIPLE_IDENTIFIERS',
            `\`*\` on \`${field.name.text}\` is ignored: class \`${cls.name.text}\`${from} ${identifier.line}`,
            field.identifierAt ?? field.name,
          );
          field.identifier = false;
        }
      }

      // SPEC §3.10: a field that replaces an inherited one says nothing the
      // parent does not when the two mean the same.
      const replaced = tree.inherited(cls, field.name.text);
      if (replaced !== undefined && sameField(field, replaced.field)) {
        warn(
          'W_REDUNDANT_OVERRIDE',
          `field \`${field.name.text}\` is identical to the one inherited from class \`${replaced.from.name.text}\` on line ${replaced.field.line}`,
          field.name,
        );
      }

      if (field.type?.kind === 'unknown') {
        // SPEC §3.2: any other lowercase word is an unknown type; generators
        // treat it as `string`. The node stays as written.
        const word = field.type.name.text;
        const suggestion = closestTypeWord(word);
        warn(
          'W_UNKNOWN_TYPE',
          suggestion === undefined
            ? `unknown type \`${word}\`, treated as \`string\``
            : `unknown type \`${word}\`, did you mean \`${suggestion}\`?`,
          field.type.name,
        );
      } else if (field.type?.kind === 'class') {
        reference(field.type.name);
      } else if (field.type?.kind === 'enum') {
        // SPEC §3.4: the values of one inline enum are a set. Both generators
        // already keep the first of a repeated value — LinkML keys its
        // permissible values by the value — so the second is nothing the
        // sketch can mean, and it is the only fact about one line that needs
        // a second token to see. The node stays as written, as it does for a
        // duplicated class.
        const seen = new Set<string>();
        for (const value of field.type.values) {
          if (seen.has(value.text)) {
            warn(
              'W_DUPLICATE_ENUM_VALUE',
              `value \`${value.text}\` is already in this enum; it is carried once`,
              value,
            );
          }
          seen.add(value.text);
        }
      }

      if (field.joinsTo !== undefined) {
        const { className, fieldName } = field.joinsTo;
        // Working default D2: an undeclared class is one warning, not two.
        // Any declaration of a duplicated class may carry the field.
        const hasField = (c: ClassNode): boolean =>
          c.name.text === className.text && c.fields.some((f) => f.name.text === fieldName.text);
        if (reference(className) && !classes.some(hasField)) {
          warn(
            'W_UNDECLARED_FIELD',
            `class \`${className.text}\` has no field \`${fieldName.text}\``,
            fieldName,
          );
        }
      }
    }
  }

  // Idempotence (AC1): a warning the document already carries is not added
  // again, so resolving a resolved document changes nothing.
  const present = new Set(out.diagnostics.map(key));
  for (const d of found) {
    if (!present.has(key(d))) out.diagnostics.push(d);
  }
  // Errors are in line order from `parse`; a stable sort slots the warnings
  // in and keeps errors before warnings on the same line.
  out.diagnostics.sort((a, b) => a.line - b.line);

  out.undeclared = [...undeclared.values()].map((n) => ({ ...n }));
  return out;
}

// ---------------------------------------------------------------------------
// The copy is written out for the known AST shape rather than done with
// `structuredClone`: that throws on a document an editor has wrapped in a
// Proxy (a reactive store) or on a node carrying a function, and `resolve`
// must never throw. Spreads read through a Proxy's traps and off a frozen
// object alike.

const copyName = (n: Name): Name => ({ ...n });

function copyType(t: TypeRef): TypeRef {
  switch (t.kind) {
    case 'primitive':
      return { ...t, written: copyName(t.written) };
    case 'class':
    case 'unknown':
      return { ...t, name: copyName(t.name) };
    case 'enum':
      return { ...t, values: t.values.map(copyName) };
  }
}

const copyJoin = (j: JoinRef): JoinRef => ({
  className: copyName(j.className),
  fieldName: copyName(j.fieldName),
});

function copyField(f: FieldNode): FieldNode {
  const out: FieldNode = { ...f, name: copyName(f.name) };
  if (f.identifierAt !== undefined) out.identifierAt = copyName(f.identifierAt);
  if (f.type !== undefined) out.type = copyType(f.type);
  if (f.joinsTo !== undefined) out.joinsTo = copyJoin(f.joinsTo);
  return out;
}

function copyClass(c: ClassNode): ClassNode {
  const out: ClassNode = { ...c, name: copyName(c.name), fields: c.fields.map(copyField) };
  if (c.parent !== undefined) out.parent = copyName(c.parent);
  if (c.system !== undefined) out.system = copyName(c.system);
  if (c.similarTo !== undefined) out.similarTo = copyName(c.similarTo);
  return out;
}

const key = (d: Diagnostic): string =>
  [d.severity, d.code, d.line, d.col, d.end, d.message].join(' ');

// ---------------------------------------------------------------------------
// Suggestions for unknown types (AC3): the closest accepted type word within
// Levenshtein distance 2. On equal distance the candidate sharing the longest
// prefix with the typed word wins (`flt` is `float`, not `int`); sharing the
// first letter is the prefix rule at length one, so it needs no extra step.
// Primitives come before the aliases in the parser's table so a tie that
// survives goes to the canonical name. Working default D4: inline, no
// dependency.

const TYPE_WORDS = Object.keys(PRIMITIVES);

const MAX_DISTANCE = 2;

function closestTypeWord(word: string): string | undefined {
  let best: string | undefined;
  let bestDistance = MAX_DISTANCE + 1;
  let bestPrefix = -1;
  for (const candidate of TYPE_WORDS) {
    const distance = levenshtein(word, candidate);
    if (distance > MAX_DISTANCE || distance > bestDistance) continue;
    const prefix = commonPrefixLength(word, candidate);
    if (distance < bestDistance || prefix > bestPrefix) {
      best = candidate;
      bestDistance = distance;
      bestPrefix = prefix;
    }
  }
  return best;
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Edit distance with unit insert, delete and substitute costs. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
