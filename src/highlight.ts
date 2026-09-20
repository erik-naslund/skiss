/**
 * Where the words of a Skiss line are, so an editor can colour them.
 *
 * This is not a parser and holds no language logic (AGENTS.md §2): nothing
 * here decides whether a line is valid, what it means or what it compiles to.
 * It reads the shapes of SPEC §3 and §4 far enough to say "this run of
 * characters is a class name, that one is an operator", and says nothing at
 * all about a run it does not recognise, which is what leaves a half-typed
 * line looking calm instead of wrong. Diagnostics stay the compiler's, and
 * reach the editor through the gutter.
 *
 * Every line is read on its own, as the language is (SPEC §4): no state is
 * carried from one line to the next, so an edit is never more than one line
 * of work.
 *
 * The productions come from `parse.ts` — the name shapes, the primitive
 * table, what a word is and where a trailer starts — so that the colours and
 * the compiler can never disagree about them (ADR 0010).
 */

import {
  CLASS_NAME,
  ENUM_VALUE,
  FIELD_NAME,
  isDoubtMarker,
  isWs,
  primitiveFor,
  SYSTEM_NAME,
  wordAt,
} from './parse.ts';

/** What a run of characters is, as far as colour is concerned. */
export type TokenKind =
  | 'class'
  | 'field'
  | 'system'
  | 'primitive'
  /** A lowercase word after `:` that is no primitive. The compiler warns; the colour does not. */
  | 'type'
  | 'enum'
  /** The operators of SPEC §4, `<` included, and the `.` of a `= Class.field` join. */
  | 'operator'
  /** The `*` that marks the identifier. */
  | 'marker'
  /** A `#` trailer, the `#` included. */
  | 'description'
  /** A `?` trailer, the `?` included. */
  | 'doubt'
  /** A whole `#` line at column 0. */
  | 'comment';

/** A run of one line, from `from` up to but not including `to`. */
export interface Token {
  kind: TokenKind;
  from: number;
  to: number;
}

const TRAILING_WS = /[ \t]+$/;

/**
 * The tokens of one line, in the order they appear, never overlapping. A blank
 * line, and a line of nothing the tokenizer recognises, has none.
 */
export function tokenizeLine(line: string): Token[] {
  // Trailing whitespace is part of no token (SPEC §4).
  const text = line.replace(TRAILING_WS, '');
  const first = text[0];
  if (first === undefined) {
    return [];
  }
  // SPEC §3.1: a `#` at column 0 is a comment line, not a trailer.
  if (first === '#') {
    return [{ kind: 'comment', from: 0, to: text.length }];
  }

  const { head, trailers } = splitTrailer(text);
  return [...headTokens(head, isWs(first)), ...trailers];
}

/**
 * SPEC §3.9, Delimiting: a description starts at the first `#` preceded by
 * whitespace, and a doubt at the first `?` that stands alone. A `?` attached to
 * a word is ordinary text, which is why `# is this seats?` is one trailer.
 */
function splitTrailer(text: string): { head: string; trailers: Token[] } {
  let start = -1;
  for (let i = 1; i < text.length; i++) {
    if (!isWs(text[i - 1])) {
      continue;
    }
    if (text[i] === '#' || isDoubtMarker(text, i)) {
      start = i;
      break;
    }
  }
  if (start < 0) {
    return { head: text, trailers: [] };
  }

  const head = text.slice(0, start);
  if (text[start] === '?') {
    return { head, trailers: [{ kind: 'doubt', from: start, to: text.length }] };
  }

  // The description comes first and the first standalone `?` ends it.
  let doubt = -1;
  for (let i = start + 1; i < text.length; i++) {
    if (isDoubtMarker(text, i)) {
      doubt = i;
      break;
    }
  }
  if (doubt < 0) {
    return { head, trailers: [{ kind: 'description', from: start, to: text.length }] };
  }
  return {
    head,
    trailers: [
      // The whitespace between the two belongs to neither.
      {
        kind: 'description',
        from: start,
        to: text.slice(0, doubt).replace(TRAILING_WS, '').length,
      },
      { kind: 'doubt', from: doubt, to: text.length },
    ],
  };
}

/** A run of the head, before anything is known about what it is. */
interface Raw {
  text: string;
  from: number;
  to: number;
  word: boolean;
}

/**
 * The head split the way the language splits it: whitespace between tokens is
 * not significant and `[]` is one token (SPEC §4).
 */
function scan(head: string): Raw[] {
  const raws: Raw[] = [];
  let i = 0;
  while (i < head.length) {
    const c = head[i] ?? '';
    if (isWs(c)) {
      i += 1;
      continue;
    }
    const word = wordAt(head, i);
    if (word !== undefined) {
      raws.push({ text: word, from: i, to: i + word.length, word: true });
      i += word.length;
      continue;
    }
    if (c === '[' && head[i + 1] === ']') {
      raws.push({ text: '[]', from: i, to: i + 2, word: false });
      i += 2;
      continue;
    }
    // Whole code points, so half an astral character is never coloured.
    const ch = String.fromCodePoint(head.codePointAt(i) ?? 0);
    raws.push({ text: ch, from: i, to: i + ch.length, word: false });
    i += ch.length;
  }
  return raws;
}

const token = (kind: TokenKind, raw: Raw): Token => ({ kind, from: raw.from, to: raw.to });

/**
 * The head of a line: a class line when it starts at column 0, a field line
 * when it is indented (SPEC §3.1).
 *
 * The fixed modifier order of SPEC §4 is the compiler's to enforce. Here each
 * operator is read wherever it is found, because a line is half-typed far more
 * often than it is wrong, and a colour that moves while the user is still
 * typing the line is worse than a colour that is generous about the order.
 */
function headTokens(head: string, field: boolean): Token[] {
  const raws = scan(head);
  const tokens: Token[] = [];

  let i = 0;
  const name = raws[0];
  if (name?.word === true && (field ? FIELD_NAME : CLASS_NAME).test(name.text)) {
    tokens.push(token(field ? 'field' : 'class', name));
    i = 1;
  }

  while (i < raws.length) {
    const raw = raws[i];
    i += 1;
    if (raw === undefined || raw.word) {
      continue;
    }
    switch (raw.text) {
      case '*':
        tokens.push(token('marker', raw));
        break;
      case ':':
        tokens.push(token('operator', raw));
        i = typeTokens(raws, i, tokens);
        break;
      case '@':
        tokens.push(token('operator', raw));
        i = nameToken(raws, i, tokens, 'system', SYSTEM_NAME);
        break;
      case '~':
      case '<':
        tokens.push(token('operator', raw));
        i = nameToken(raws, i, tokens, 'class', CLASS_NAME);
        break;
      case '=':
        tokens.push(token('operator', raw));
        i = joinTokens(raws, i, tokens);
        break;
      case '|':
      case '[]':
        tokens.push(token('operator', raw));
        break;
      default:
        // Anything else is left uncoloured: the compiler has a diagnostic for it.
        break;
    }
  }

  return tokens;
}

/** The word at `i`, when it is one and it is spelled the way `shape` asks. */
function nameToken(
  raws: Raw[],
  i: number,
  tokens: Token[],
  kind: TokenKind,
  shape: RegExp,
): number {
  const raw = raws[i];
  if (raw === undefined || !raw.word) {
    return i;
  }
  if (shape.test(raw.text)) {
    tokens.push(token(kind, raw));
  }
  return i + 1;
}

/** `= Class.field` (SPEC §3.7), as far as it has been typed. */
function joinTokens(raws: Raw[], start: number, tokens: Token[]): number {
  let i = nameToken(raws, start, tokens, 'class', CLASS_NAME);
  const dot = raws[i];
  if (dot === undefined || dot.text !== '.' || dot.word) {
    return i;
  }
  tokens.push(token('operator', dot));
  i += 1;
  return nameToken(raws, i, tokens, 'field', FIELD_NAME);
}

/** `( primitive | ClassName | enum ) [ "[]" ]` (SPEC §3.2 to §3.4). */
function typeTokens(raws: Raw[], start: number, tokens: Token[]): number {
  const first = raws[start];
  if (first === undefined || !first.word) {
    return start;
  }

  const words = [first];
  const operators: Raw[] = [];
  let pipes = 0;
  let i = start + 1;
  while (raws[i]?.text === '|') {
    const pipe = raws[i];
    if (pipe === undefined) {
      break;
    }
    operators.push(pipe);
    pipes += 1;
    i += 1;
    const value = raws[i];
    if (value === undefined || !value.word) {
      break;
    }
    words.push(value);
    i += 1;
  }

  const many = raws[i];
  if (many !== undefined && many.text === '[]' && !many.word) {
    operators.push(many);
    i += 1;
  }

  // Values separated by `|` are an enum; one word on its own is a type name.
  // A single value and a trailing `|` is an enum half typed, and stays one, so
  // that the first value does not change colour as the second is written.
  const typed: Token[] =
    pipes > 0
      ? words.filter((word) => ENUM_VALUE.test(word.text)).map((word) => token('enum', word))
      : nameTypeTokens(first);
  tokens.push(
    ...[...typed, ...operators.map((raw) => token('operator', raw))].sort(
      (a, b) => a.from - b.from,
    ),
  );
  return i;
}

/** A single word after `:`: a primitive, a class it refers to, or neither. */
function nameTypeTokens(word: Raw): Token[] {
  if (primitiveFor(word.text) !== undefined) {
    return [token('primitive', word)];
  }
  if (CLASS_NAME.test(word.text)) {
    return [token('class', word)];
  }
  if (/^[a-z]/.test(word.text)) {
    // SPEC §3.2: any other lowercase word is an unknown type. It compiles, with
    // a warning, so it is coloured as the type it stands in for.
    return [token('type', word)];
  }
  return [];
}
