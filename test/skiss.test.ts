import { describe, expect, test } from 'vitest';
import { parse, resolve, toSkiss } from '../src/index.ts';
import { mulberry32 } from './mulberry32.ts';

// Issue #45. The fixtures are the contract for the canonical format; these
// cover what they express badly: the trailer column when the line is already
// long, the `string` type that prints no colon, the primitive aliases, and
// the empty document.

const print = (source: string): string[] => toSkiss(parse(source)).split('\n');

const column = (line: string, marker: '#' | '?'): number => line.indexOf(marker);

describe('the trailer column (working default D1)', () => {
  test('a short line puts the trailer at column 40', () => {
    expect(print('Ship @Fleet  # a vessel')[0]).toBe(`Ship @Fleet${' '.repeat(29)}# a vessel`);
    expect(column(print('Ship\n  id*  ? really')[1] ?? '', '?')).toBe(40);
  });

  test('a line 38 characters long still reaches column 40, with two spaces', () => {
    const name = `Ship @${'F'.repeat(32)}`;
    expect(name).toHaveLength(38);
    const line = print(`${name}  # x`)[0] ?? '';
    expect(column(line, '#')).toBe(40);
    expect(line).toBe(`${name}  # x`);
  });

  test('a line 39 characters or longer gets two spaces instead', () => {
    for (const length of [33, 34, 40]) {
      const name = `Ship @${'F'.repeat(length)}`;
      const line = print(`${name}  # x`)[0] ?? '';
      expect(line).toBe(`${name}  # x`);
      expect(column(line, '#')).toBe(name.length + 2);
    }
  });

  test('a description and a doubt are separated by one space, description first', () => {
    expect(print('Ship  # a vessel  ? or a boat')[0]).toBe(
      `Ship${' '.repeat(36)}# a vessel ? or a boat`,
    );
  });
});

describe('types (SPEC §3.2 to §3.4)', () => {
  test('a plain `string` prints no colon, because a field without one is a string', () => {
    expect(print('Ship\n  name: string')[1]).toBe('  name');
    expect(print('Ship\n  name: text')[1]).toBe('  name');
  });

  test('`string[]` keeps its colon: `[]` has nothing to attach to without it', () => {
    expect(print('Ship\n  tags: string[]')[1]).toBe('  tags: string[]');
  });

  test('a primitive prints its canonical name, so an alias is normalised', () => {
    expect(print('Ship\n  pageCount: integer\n  overdue: boolean')).toEqual([
      'Ship',
      '  pageCount: int',
      '  overdue: bool',
      '',
    ]);
  });

  test('an unknown type prints the word as written (working default D2)', () => {
    expect(print('Ship\n  crewSize: itn')[1]).toBe('  crewSize: itn');
  });

  test('an enum joins its values with `|`, and `[]` follows the whole type', () => {
    expect(print('Ship\n  kind: sail|steam[]')[1]).toBe('  kind: sail|steam[]');
  });
});

describe('the document as a whole', () => {
  test('a document with no classes is the empty string', () => {
    expect(toSkiss(parse(''))).toBe('');
    expect(toSkiss(parse('# just a comment\n'))).toBe('');
    expect(toSkiss({ classes: [], diagnostics: [] })).toBe('');
  });

  test('classes are separated by one blank line, with a final newline and no trailing blank', () => {
    expect(toSkiss(parse('A\n  x\nB\n  y\n'))).toBe('A\n  x\n\nB\n  y\n');
  });

  test('no line has trailing whitespace', () => {
    const text = toSkiss(parse('A @S ~ B  # d\n  x*: int @T = B.y  ? n\n  z\nB\n  y*\n'));
    for (const line of text.split('\n')) expect(line).toBe(line.replace(/[ \t]+$/, ''));
  });

  test('positions and diagnostics are ignored: a broken line is simply absent', () => {
    expect(toSkiss(parse('A\n  crew:\n  ok\n'))).toBe('A\n  ok\n');
  });

  test('a second `*` is printed, because the printer does not resolve', () => {
    expect(print('A\n  id*\n  code*')).toEqual(['A', '  id*', '  code*', '']);
    // `resolve` clears the second one, and then it is not printed.
    expect(toSkiss(resolve(parse('A\n  id*\n  code*\n')))).toBe('A\n  id*\n  code\n');
  });
});

// SPEC 0.2, §8, Descriptions (issue #57, from review finding D7): a standalone
// `?` in a description would start a doubt when the line is parsed again, so
// the printer attaches it to the word before it.
describe('a `?` inside a description (SPEC §8)', () => {
  const at = (text: string) => ({ text, line: 0, col: 0, end: text.length });

  const printed = (node: { description?: string; note?: string }): string =>
    toSkiss({ classes: [{ name: at('Ship'), fields: [], line: 0, ...node }], diagnostics: [] });

  const reparsed = (node: { description?: string; note?: string }) =>
    parse(printed(node)).classes[0];

  test('the `?` is attached to the word before it and the whitespace is dropped', () => {
    expect(printed({ description: 'born here ? confirm later' })).toContain(
      '# born here? confirm later',
    );
    expect(reparsed({ description: 'born here ? confirm later' })?.description).toBe(
      'born here? confirm later',
    );
  });

  test('a doubt on the same element keeps its own text', () => {
    const node = { description: 'born here ? confirm later', note: '7' };
    expect(reparsed(node)?.description).toBe('born here? confirm later');
    expect(reparsed(node)?.note).toBe('7');
  });

  test('a `?` at the end of the description is attached too', () => {
    expect(reparsed({ description: 'seats or crew ?', note: 'ask' })?.description).toBe(
      'seats or crew?',
    );
  });

  test('a description that is only `?`, or starts with one, attaches to the marker', () => {
    expect(printed({ description: '?' })).toContain('#?');
    expect(reparsed({ description: '?' })?.description).toBe('?');
    expect(reparsed({ description: '? confirm', note: '7' })?.description).toBe('? confirm');
    expect(reparsed({ description: '? confirm', note: '7' })?.note).toBe('7');
  });

  test('a `?` already attached to a word is left as it is', () => {
    expect(printed({ description: 'where were they born? here' })).toContain(
      '# where were they born? here',
    );
  });

  test('a source file round-trips: `parse` never puts a standalone `?` in a description', () => {
    const source = 'Ship                                    # born here ? confirm later\n';
    expect(toSkiss(parse(source))).toBe(source);
  });
});

describe('the round trip is stable on arbitrary input (AC3)', () => {
  // The same alphabet as never-throws.test.ts, weighted towards the
  // characters Skiss cares about. A seeded generator keeps it reproducible.
  const ALPHABET = [
    ...' \t\t\n\n\r#?*:@~=[]|.<>()\'"\\/-_0123456789',
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    ...'Ääöé€中😀',
  ];

  test('500 random documents: toSkiss never throws and printing twice changes nothing', () => {
    const random = mulberry32(20260914);
    const pick = (n: number) => Math.floor(random() * n);
    for (let i = 0; i < 500; i++) {
      let source = '';
      for (let j = 0; j < pick(240); j++) source += ALPHABET[pick(ALPHABET.length)];
      const once = toSkiss(parse(source));
      expect(toSkiss(parse(once))).toBe(once);
      expect(parse(once).diagnostics).toEqual([]);
    }
  });
});
