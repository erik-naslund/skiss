// The per-line parser: SPEC §3, §4 and §7, ADR 0004.
//
// Each line is read on its own. The one piece of state carried from line to
// line is which class is current, so a field can attach to it and a field
// with no current class can be reported as E_FIELD_WITHOUT_CLASS. No line
// changes how another line is *read*; a line that fails to parse is skipped.
// A class line that failed after its name clears the current class
// (ARCHITECTURE.md, diagnostics table), so the fields under it are reported
// rather than silently attached to the previous class; one that failed *at*
// its name is still a class line above them, and they are dropped with it.
//
// Nothing here throws. A line that does not match the grammar produces exactly
// one diagnostic with severity `error` and is skipped.

import type {
  ClassNode,
  Diagnostic,
  DiagnosticCode,
  Document,
  FieldNode,
  Name,
  Primitive,
  TypeRef,
} from './ast.ts';

// SPEC §4: WS is spaces or tabs. Used for indentation, trailer delimiting and
// working default D5 (trailing whitespace is ignored). Exported because the
// tokeniser (`highlight.ts`) delimits a trailer the same way this does.
export const isWs = (c: string | undefined): boolean => c === ' ' || c === '\t';
const trimWs = (s: string): string => s.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');

// SPEC §4: the name productions. Exported because a projection from LinkML
// has to know what it may write (SPEC §8, Names), and one grammar in one
// place is the point of the parser owning them.
export const CLASS_NAME = /^[A-Z][A-Za-z0-9]*$/;
export const FIELD_NAME = /^[a-z][A-Za-z0-9]*$/;
export const SYSTEM_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
// SPEC §4: a value, unlike a system name, may start with a digit, so
// `priority: 1|2|3` is an enum of three values (SPEC 0.2, issue #57).
export const ENUM_VALUE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// SPEC §4: the letters and digits of those productions are ASCII. The
// characters each one allows anywhere in a name, for the messages below.
const NAME_CHAR = /^[A-Za-z0-9]$/;
const WORD_CHAR = /^[A-Za-z0-9_-]$/;

const CLASS_RULE = 'UpperCamelCase in ASCII letters and digits (A-Z, a-z, 0-9), uppercase first';
const FIELD_RULE = 'lowerCamelCase in ASCII letters and digits (a-z, A-Z, 0-9), lowercase first';

/**
 * The last sentence of a message about a name: the first character outside
 * `allowed`, or, when every character is in it, what the name starts with,
 * which is then the whole fault — each production in SPEC §4 differs from its
 * own character set in the first character alone. Issue #77: `förnamn` is
 * lowercase in Swedish, so a message that names the case rule and stops reads
 * as wrong when the real fault is the `ö`.
 */
function nameFault(text: string, allowed: RegExp): string {
  // Whole code points: `for ... of` walks a surrogate pair as one character,
  // so a message shows an astral character rather than half of it.
  for (const ch of text) {
    if (!allowed.test(ch)) return `\`${ch}\` is not one of them.`;
  }
  const first = text.slice(0, 1);
  const kind = /[A-Z]/.test(first)
    ? 'an uppercase letter'
    : /[a-z]/.test(first)
      ? 'a lowercase letter'
      : /[0-9]/.test(first)
        ? 'a digit'
        : `\`${first}\``;
  return `\`${text}\` starts with ${kind}.`;
}

/** The shape every message about a name has: the rule, the name, the fault. */
function badName(rule: string, text: string, allowed: RegExp = NAME_CHAR): string {
  return `${rule}: \`${text}\`. ${nameFault(text, allowed)}`;
}

/**
 * SPEC §3.2: the primitives and the aliases that name them. The one table;
 * `resolve` reads it for its type suggestions rather than keeping a second.
 */
export const PRIMITIVES: Record<string, Primitive> = {
  string: 'string',
  int: 'int',
  float: 'float',
  bool: 'bool',
  date: 'date',
  datetime: 'datetime',
  uri: 'uri',
  text: 'string',
  integer: 'int',
  boolean: 'bool',
};

/**
 * The primitive a type word names, or `undefined` for any other word.
 *
 * `Object.hasOwn` and not a plain `PRIMITIVES[word]`: the table is a plain
 * object, so `constructor`, `toString` and the other `Object.prototype` keys
 * would find an inherited property and read as a primitive (issue #42).
 */
export function primitiveFor(word: string): Primitive | undefined {
  return Object.hasOwn(PRIMITIVES, word) ? PRIMITIVES[word] : undefined;
}

// The current class of a class line that failed at a name: not a class in the
// document, and not `undefined` either, so the fields under it stay quiet
// rather than each reporting E_FIELD_WITHOUT_CLASS (issue #77).
const DROPPED = 'dropped-class' as const;

const FIELD_ORDER = 'name, `*`, `: type`, `@System`, `= Class.field`, then `#` and `?`';
const CLASS_ORDER = 'name, `< Parent`, `@System`, `~ Class`, then `#` and `?`';

export function parse(source: string): Document {
  const classes: ClassNode[] = [];
  const diagnostics: Diagnostic[] = [];
  // The class a field attaches to: a class in the document, `DROPPED` for a
  // class line that failed at one of its names, or nothing before the first.
  let current: ClassNode | typeof DROPPED | undefined;

  // A single leading U+FEFF is an editor's byte order mark, not content.
  // Stripping it keeps line 1 a class line and columns equal to what the
  // editor shows, since editors hide the BOM.
  const text0 = source.startsWith('\ufeff') ? source.slice(1) : source;
  const lines = text0.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const text = (lines[i] ?? '').replace(/[ \t]+$/, '');
    const first = text[0];
    if (first === undefined || first === '#') continue; // blank or comment, SPEC §3.1

    if (isWs(first)) {
      const start = text.search(/[^ \t]/);
      if (current === undefined) {
        diagnostics.push({
          severity: 'error',
          code: 'E_FIELD_WITHOUT_CLASS',
          message: 'An indented line is a field, but there is no valid class line above it',
          line,
          col: start,
          end: text.length,
        });
        continue;
      }
      const result = parseFieldLine(text, line);
      // A field under a dropped class is still read on its own, so its own
      // mistakes are still reported; it has nowhere to attach and is dropped.
      if (!result.ok) diagnostics.push(result.diagnostic);
      else if (current !== DROPPED) current.fields.push(result.value);
      continue;
    }

    if (/\p{L}/u.test(first)) {
      const result = parseClassLine(text, line);
      if (result.ok) {
        classes.push(result.value);
        current = result.value;
      } else {
        // A class line that failed at one of its names is still a class line
        // above: the fields under it are dropped with it, silently (issue
        // #77). One that failed elsewhere clears the current class, so its
        // fields report E_FIELD_WITHOUT_CLASS rather than attaching to the
        // class before it.
        diagnostics.push(result.diagnostic);
        current = result.atName ? DROPPED : undefined;
      }
      continue;
    }

    diagnostics.push({
      severity: 'error',
      code: 'E_UNPARSABLE',
      message: 'A line at column 0 must start with a class name or `#` for a comment',
      line,
      col: 0,
      end: text.length,
    });
  }

  return { classes, diagnostics };
}

// ---------------------------------------------------------------------------
// Trailer: SPEC §3.9, Delimiting.

interface Trailer {
  head: string;
  description?: string;
  note?: string;
}

/** True when the `?` at `i` stands alone: whitespace before, whitespace or end after. */
export function isDoubtMarker(text: string, i: number): boolean {
  return text[i] === '?' && isWs(text[i - 1]) && (i + 1 === text.length || isWs(text[i + 1]));
}

function splitTrailer(text: string): Trailer {
  let start = -1;
  for (let i = 1; i < text.length; i++) {
    if (!isWs(text[i - 1])) continue;
    if (text[i] === '#' || isDoubtMarker(text, i)) {
      start = i;
      break;
    }
  }
  if (start < 0) return { head: text };

  const trailer: Trailer = { head: text.slice(0, start).replace(/[ \t]+$/, '') };
  if (text[start] === '?') {
    // The doubt runs to the end of the line; a later `#` is text.
    const note = trimWs(text.slice(start + 1));
    if (note !== '') trailer.note = note;
    return trailer;
  }
  // The description comes first and the first standalone `?` ends it.
  let doubt = -1;
  for (let i = start + 1; i < text.length; i++) {
    if (isDoubtMarker(text, i)) {
      doubt = i;
      break;
    }
  }
  const description = trimWs(text.slice(start + 1, doubt < 0 ? text.length : doubt));
  if (description !== '') trailer.description = description;
  if (doubt >= 0) {
    const note = trimWs(text.slice(doubt + 1));
    if (note !== '') trailer.note = note;
  }
  return trailer;
}

// ---------------------------------------------------------------------------
// Tokens. Whitespace between tokens is not significant; `[]` is one token.

type TokenKind =
  | 'word'
  | '*'
  | ':'
  | '@'
  | '~'
  | '='
  | '.'
  | '|'
  | '<'
  | ','
  | '[]'
  | '['
  | 'other';

interface Token {
  kind: TokenKind;
  text: string;
  col: number;
  end: number;
}

const WORD = /[\p{L}\p{N}_-]+/uy;

/**
 * SPEC §4: the word starting at `i`, or `undefined` when nothing there is one.
 * The tokeniser splits a line into the same runs this does, so a shared
 * function rather than a shared sticky regex, whose `lastIndex` is state.
 */
export function wordAt(text: string, i: number): string | undefined {
  WORD.lastIndex = i;
  return WORD.exec(text)?.[0];
}

const OPERATORS: readonly TokenKind[] = ['*', ':', '@', '~', '=', '.', '|', '<', ',', '['];

function tokenize(head: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < head.length) {
    const c = head[i] ?? '';
    if (isWs(c)) {
      i++;
      continue;
    }
    const word = wordAt(head, i);
    if (word !== undefined) {
      tokens.push({ kind: 'word', text: word, col: i, end: i + word.length });
      i += word.length;
      continue;
    }
    if (c === '[' && head[i + 1] === ']') {
      tokens.push({ kind: '[]', text: '[]', col: i, end: i + 2 });
      i += 2;
      continue;
    }
    // Any other character is one token. Whole code points, so a message can
    // show an astral character rather than half of it.
    const ch = String.fromCodePoint(head.codePointAt(i) ?? 0);
    const kind = OPERATORS.find((op) => op === ch) ?? 'other';
    tokens.push({ kind, text: ch, col: i, end: i + ch.length });
    i += ch.length;
  }
  return tokens;
}

interface Cursor {
  tokens: Token[];
  pos: number;
  line: number;
}

const peek = (c: Cursor): Token | undefined => c.tokens[c.pos];

function take(c: Cursor): Token | undefined {
  const t = c.tokens[c.pos];
  if (t !== undefined) c.pos++;
  return t;
}

const name = (t: Token, line: number): Name => ({ text: t.text, line, col: t.col, end: t.end });

// ---------------------------------------------------------------------------
// Results. Errors are values, never exceptions.

type Result<T> =
  | { ok: true; value: T }
  // `atName` marks a line that failed at a name it had to read: the class's
  // own name, the class after `~`, the class after `<`. A class line that
  // failed there still counts as a class line above the fields under it, so
  // they are dropped with it instead of each reporting E_FIELD_WITHOUT_CLASS:
  // one mistake, one diagnostic (issue #77). Ignored on a field line.
  | { ok: false; diagnostic: Diagnostic; atName: boolean };

function fail<T>(
  code: DiagnosticCode,
  message: string,
  line: number,
  span: { col: number; end: number },
  atName = false,
): Result<T> {
  return {
    ok: false,
    diagnostic: { severity: 'error', code, message, line, col: span.col, end: span.end },
    atName,
  };
}

/** The span just after `after`, for "expected something after X" errors. */
const afterSpan = (after: Token) => ({ col: after.end, end: after.end });

// ---------------------------------------------------------------------------
// Class line: ClassName [ "@" System ] [ "~" ClassName ] [ trailer ]

function parseClassLine(text: string, line: number): Result<ClassNode> {
  const trailer = splitTrailer(text);
  const c: Cursor = { tokens: tokenize(trailer.head), pos: 0, line };

  const head = take(c);
  if (head === undefined || head.kind !== 'word') {
    return fail(
      'E_UNPARSABLE',
      'A class line must start with a class name',
      line,
      { col: 0, end: Math.max(1, trailer.head.length) },
      true,
    );
  }
  if (!CLASS_NAME.test(head.text)) {
    return fail(
      'E_BAD_NAME',
      badName(`Class names are ${CLASS_RULE}`, head.text),
      line,
      head,
      true,
    );
  }
  const node: Omit<ClassNode, 'fields'> = { name: name(head, line), line };

  // SPEC §3.10: `< Parent`, before `@` and `~`.
  const lt = peek(c);
  if (lt?.kind === '<') {
    take(c);
    const parent = parseParent(c, lt);
    if (!parent.ok) return parent;
    node.parent = parent.value;
  }

  const at = peek(c);
  if (at?.kind === '@') {
    take(c);
    const system = parseSystem(c, at);
    if (!system.ok) return system;
    node.system = system.value;
  }

  const tilde = peek(c);
  if (tilde?.kind === '~') {
    take(c);
    const target = take(c);
    if (target === undefined || target.kind !== 'word') {
      return fail(
        'E_UNPARSABLE',
        'Expected a class name after `~`, e.g. `CharacterPage @Community ~ Character`',
        line,
        target ?? afterSpan(tilde),
      );
    }
    if (!CLASS_NAME.test(target.text)) {
      return fail(
        'E_BAD_NAME',
        badName(`The class after \`~\` must be ${CLASS_RULE}`, target.text),
        line,
        target,
        true,
      );
    }
    node.similarTo = name(target, line);
  }

  const rest = peek(c);
  if (rest !== undefined) return unexpected(rest, line, 'class', CLASS_ORDER);

  if (trailer.description !== undefined) node.description = trailer.description;
  if (trailer.note !== undefined) node.note = trailer.note;
  return { ok: true, value: { ...node, fields: [] } };
}

// ---------------------------------------------------------------------------
// Field line: WS field-name [ "*" ] [ ":" type ] [ "@" System ]
//                           [ "=" ClassName "." field-name ] [ trailer ]

function parseFieldLine(text: string, line: number): Result<FieldNode> {
  const trailer = splitTrailer(text);
  const c: Cursor = { tokens: tokenize(trailer.head), pos: 0, line };

  const head = take(c);
  if (head === undefined) {
    // Nothing before the trailer. SPEC §3.1 defines comments at column 0
    // only, so an indented `#` line is a field line without a name.
    const col = text.search(/[^ \t]/);
    const message =
      text[col] === '#'
        ? 'A `#` comment must start at column 0; an indented line is a field and needs a name'
        : 'A field line needs a field name before its trailer';
    return fail('E_UNPARSABLE', message, line, { col, end: Math.max(col + 1, text.length) });
  }
  if (head.kind !== 'word') return unexpected(head, line, 'field', FIELD_ORDER);
  if (!FIELD_NAME.test(head.text)) {
    return fail('E_BAD_NAME', badName(`Field names are ${FIELD_RULE}`, head.text), line, head);
  }
  const node: FieldNode = { name: name(head, line), line, identifier: false };

  const star = peek(c);
  if (star?.kind === '*') {
    take(c);
    node.identifier = true;
    node.identifierAt = name(star, line);
  }

  const colon = peek(c);
  if (colon?.kind === ':') {
    take(c);
    const type = parseType(c, colon);
    if (!type.ok) return type;
    node.type = type.value;
  }

  const at = peek(c);
  if (at?.kind === '@') {
    take(c);
    const system = parseSystem(c, at);
    if (!system.ok) return system;
    node.system = system.value;
  }

  const equals = peek(c);
  if (equals?.kind === '=') {
    take(c);
    const example = 'e.g. `characterId = Character.id`';
    const className = take(c);
    if (className === undefined || className.kind !== 'word') {
      return fail(
        'E_UNPARSABLE',
        `Expected \`Class.field\` after \`=\`, ${example}`,
        line,
        className ?? afterSpan(equals),
      );
    }
    if (!CLASS_NAME.test(className.text)) {
      return fail(
        'E_BAD_NAME',
        badName(`The class after \`=\` must be ${CLASS_RULE}`, className.text),
        line,
        className,
      );
    }
    const dot = take(c);
    if (dot === undefined || dot.kind !== '.') {
      return fail(
        'E_UNPARSABLE',
        `Expected \`.\` and a field name after \`= ${className.text}\`, ${example}`,
        line,
        dot ?? afterSpan(className),
      );
    }
    const fieldName = take(c);
    if (fieldName === undefined || fieldName.kind !== 'word') {
      return fail(
        'E_UNPARSABLE',
        `Expected a field name after \`= ${className.text}.\`, ${example}`,
        line,
        fieldName ?? afterSpan(dot),
      );
    }
    if (!FIELD_NAME.test(fieldName.text)) {
      return fail(
        'E_BAD_NAME',
        badName(`The field after \`= ${className.text}.\` must be ${FIELD_RULE}`, fieldName.text),
        line,
        fieldName,
      );
    }
    node.joinsTo = { className: name(className, line), fieldName: name(fieldName, line) };
  }

  const rest = peek(c);
  if (rest !== undefined) return unexpected(rest, line, 'field', FIELD_ORDER);

  if (trailer.description !== undefined) node.description = trailer.description;
  if (trailer.note !== undefined) node.note = trailer.note;
  return { ok: true, value: node };
}

// "<" ClassName on a class line. SPEC §3.10. `lt` is already consumed.
function parseParent(c: Cursor, lt: Token): Result<Name> {
  const parent = take(c);
  if (parent === undefined || parent.kind !== 'word') {
    return fail(
      'E_UNPARSABLE',
      'Expected a class name after `<`, e.g. `Jedi < Character`',
      c.line,
      parent ?? afterSpan(lt),
    );
  }
  if (!CLASS_NAME.test(parent.text)) {
    // A primitive is not a class (SPEC §3.10), and it is the one wrong parent
    // worth naming: `Jedi < int` is a type where a class has to be.
    const message = Object.hasOwn(PRIMITIVES, parent.text)
      ? `\`${parent.text}\` is a primitive, not a class; a parent is a class`
      : badName(`The class after \`<\` must be ${CLASS_RULE}`, parent.text);
    return fail('E_BAD_NAME', message, c.line, parent, true);
  }
  // SPEC §3.10: one parent. `A < B, C` is a list, and there is no list here.
  const next = peek(c);
  if (next?.kind === ',' || next?.kind === '<') {
    return fail(
      'E_UNPARSABLE',
      'A class has one parent; `<` takes a single class name',
      c.line,
      next,
    );
  }
  return { ok: true, value: name(parent, c.line) };
}

// "@" System, shared by class and field lines. SPEC §3.5. `at` is already consumed.
function parseSystem(c: Cursor, at: Token): Result<Name> {
  const system = take(c);
  if (system === undefined || system.kind !== 'word') {
    return fail(
      'E_UNPARSABLE',
      'Expected a system name after `@`, e.g. `@Catalog`',
      c.line,
      system ?? afterSpan(at),
    );
  }
  if (!SYSTEM_NAME.test(system.text)) {
    return fail(
      'E_UNPARSABLE',
      badName(
        'A system name is ASCII letters, digits, `-` and `_` (A-Z, a-z, 0-9), starting with a letter',
        system.text,
        WORD_CHAR,
      ),
      c.line,
      system,
    );
  }
  return { ok: true, value: name(system, c.line) };
}

// type = ( primitive | ClassName | enum ) [ "[]" ]. SPEC §3.2 to §3.4. `colon` is already consumed.
function parseType(c: Cursor, colon: Token): Result<TypeRef> {
  const first = peek(c);
  // Working default D3: nothing type-like after the colon.
  if (first === undefined || first.kind === '*' || first.kind === '@' || first.kind === '=') {
    return fail(
      'E_MISSING_TYPE',
      'A colon needs a type after it, e.g. `crewSize: int`',
      c.line,
      colon,
    );
  }
  if (first.kind !== 'word') {
    return fail(
      'E_UNPARSABLE',
      `Expected a type after \`:\`, found \`${first.text}\``,
      c.line,
      first,
    );
  }
  take(c);

  const words: Token[] = [first];
  for (let pipe = peek(c); pipe?.kind === '|'; pipe = peek(c)) {
    take(c);
    const value = take(c);
    if (value === undefined || value.kind !== 'word') {
      return fail(
        'E_UNPARSABLE',
        'Expected an enum value after `|`, e.g. `climate: arid|temperate|frozen`',
        c.line,
        value ?? afterSpan(pipe),
      );
    }
    words.push(value);
  }

  let many = false;
  const bracket = peek(c);
  if (bracket?.kind === '[]') {
    take(c);
    many = true;
  } else if (bracket?.kind === '[') {
    return fail(
      'E_UNCLOSED_MANY',
      '`[` must be closed: `[]` marks a many-valued field',
      c.line,
      bracket,
    );
  }

  if (words.length > 1) {
    for (const w of words) {
      if (!ENUM_VALUE.test(w.text)) {
        return fail(
          'E_UNPARSABLE',
          badName(
            'An enum value is ASCII letters, digits, `-` and `_` (A-Z, a-z, 0-9), and does not start with `-` or `_`',
            w.text,
            WORD_CHAR,
          ),
          c.line,
          w,
        );
      }
    }
    return { ok: true, value: { kind: 'enum', values: words.map((w) => name(w, c.line)), many } };
  }

  const word = first.text;
  const primitive = primitiveFor(word);
  if (primitive !== undefined) {
    return {
      ok: true,
      value: { kind: 'primitive', name: primitive, written: name(first, c.line), many },
    };
  }
  if (/^[A-Z]/.test(word)) {
    if (!CLASS_NAME.test(word)) {
      return fail(
        'E_BAD_NAME',
        badName(`A referenced class must be ${CLASS_RULE}`, word),
        c.line,
        first,
      );
    }
    return { ok: true, value: { kind: 'class', name: name(first, c.line), many } };
  }
  if (/^[a-z]/.test(word)) {
    // SPEC §3.2: any other lowercase word is an unknown type; `resolve` warns.
    return { ok: true, value: { kind: 'unknown', name: name(first, c.line), many } };
  }
  return fail(
    'E_UNPARSABLE',
    `A type is a primitive, a class name or an enum, not \`${word}\``,
    c.line,
    first,
  );
}

// A token left over once the fixed modifier sequence has been consumed.
function unexpected<T>(
  token: Token,
  line: number,
  kind: 'class' | 'field',
  order: string,
): Result<T> {
  const modifiers: TokenKind[] = kind === 'field' ? ['*', ':', '@', '='] : ['<', '@', '~'];
  if (modifiers.includes(token.kind)) {
    return fail(
      'E_UNPARSABLE',
      `\`${token.text}\` is out of order; a ${kind} line reads: ${order}`,
      line,
      token,
    );
  }
  if (token.kind === '<') {
    // SPEC §3.10: class level only.
    return fail(
      'E_UNPARSABLE',
      '`<` marks inheritance and belongs on the class line: `Child < Parent`',
      line,
      token,
    );
  }
  if (token.text === '?') {
    return fail(
      'E_UNPARSABLE',
      '`?` attached to a word is not a marker; a doubt needs whitespace before `?` and after it',
      line,
      token,
    );
  }
  if (token.text === '#') {
    return fail('E_UNPARSABLE', 'A description needs whitespace before `#`', line, token);
  }
  return fail('E_UNPARSABLE', `Unexpected \`${token.text}\` on a ${kind} line`, line, token);
}
