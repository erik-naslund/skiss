import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { compile, parse, resolve, toGlossary } from '../src/index.ts';

// Issue #90. `glossary.md`, `glossary.terms.md` and `glossary.notes.md` are
// the contract for the three forms; these cover what the fixture expresses
// badly: a class with no fields, a `|` in the text, the heading, and the one
// rule of SPEC §3.9 the generator has to keep — a doubt is never
// documentation, so it appears only when `notes` asks for it.

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const glossary = (source: string, opts?: Parameters<typeof toGlossary>[1]): string =>
  toGlossary(resolve(parse(source)), opts);

describe('the goldens (AC4)', () => {
  const doc = (): ReturnType<typeof resolve> => resolve(parse(fixture('glossary.skiss')));

  test('toGlossary equals glossary.md byte for byte', () => {
    expect(toGlossary(doc(), { name: 'glossary' })).toBe(fixture('glossary.md'));
  });

  test('`classes` equals glossary.terms.md byte for byte', () => {
    expect(toGlossary(doc(), { name: 'glossary', classes: true })).toBe(
      fixture('glossary.terms.md'),
    );
  });

  test('`notes` equals glossary.notes.md byte for byte', () => {
    expect(toGlossary(doc(), { name: 'glossary', notes: true })).toBe(fixture('glossary.notes.md'));
  });

  test('an unresolved document is resolved first and gives the same output', () => {
    expect(toGlossary(parse(fixture('glossary.skiss')) as ReturnType<typeof resolve>)).toBe(
      toGlossary(doc(), { name: 'Glossary' }),
    );
  });
});

describe('the heading and the document description', () => {
  test('`name` is the heading; it defaults to `Glossary`', () => {
    expect(glossary('A\n').split('\n')[0]).toBe('# Glossary');
    expect(glossary('A\n', { name: 'model' }).split('\n')[0]).toBe('# model');
  });

  test('the document description is the paragraph under the heading', () => {
    expect(glossary('# What this is about.\n\nA\n')).toBe(
      '# Glossary\n\nWhat this is about.\n\n## A\n',
    );
  });

  test('a sketch with no classes is the heading alone', () => {
    expect(glossary('')).toBe('# Glossary\n');
  });
});

describe('the paragraph under a class heading', () => {
  test('system, parent, mapping, then the description as a sentence', () => {
    const text = glossary('A @S\n  x\n\nB < A @T ~ A  # what b is\n  y\n');
    expect(text).toContain('## B\n\nSystem: T. Extends A. Similar to A. What b is.\n');
  });

  test('a description that ends in a stop of its own keeps it', () => {
    expect(glossary('A  # a thing!\n')).toContain('A thing!');
    expect(glossary('A  # a thing.\n')).toContain('A thing.');
    expect(glossary('A  # a thing?\n')).toContain('A thing?');
  });

  test('a class with nothing to say gets no paragraph and no table', () => {
    expect(glossary('A\n')).toBe('# Glossary\n\n## A\n');
  });
});

describe('the Type column', () => {
  const type = (line: string): string =>
    (glossary(`A\n  ${line}\n\nOther\n  z\n`).split('\n')[6] ?? '').split('|')[2]?.trim() ?? '';

  test.each([
    ['id*', 'identifier'],
    ['id*: int', 'identifier, int'],
    ['x', ''],
    ['x: int', 'int'],
    ['x: integer', 'integer'],
    ['x: Other', '[Other](#other)'],
    ['x: Missing', 'Missing'],
    ['x: Other[]', 'list of [Other](#other)'],
    ['x: string[]', 'list of string'],
    ['x: a|b|c', 'a / b / c'],
    ['x: a|b[]', 'list of a / b'],
    ['x: itn', 'itn'],
  ])('`%s` reads `%s`', (line, expected) => {
    expect(type(line)).toBe(expected);
  });
});

describe('the Description column', () => {
  const row = (line: string): string => glossary(`A\n  ${line}\n`).split('\n').at(-2) ?? '';

  test('a `@System` and a `= Class.field` are appended as sentences', () => {
    expect(row('x @S')).toBe('| x | | System: S. |');
    expect(row('x = B.y')).toBe('| x | | Joins to B.y. |');
    expect(row('x @S = B.y  # what x is')).toBe('| x | | what x is. System: S. Joins to B.y. |');
  });

  test('a `|` in the text is escaped, so it cannot end the cell', () => {
    expect(row('x  # a | b')).toBe('| x | | a \\| b |');
  });
});

describe('a doubt is never documentation (SPEC §3.9)', () => {
  const source = 'A  ? really\n  x  ? and this\n    ? and that\n';

  test('without `notes` no doubt appears anywhere', () => {
    expect(glossary(source)).not.toContain('really');
    expect(glossary(source, { classes: true })).not.toContain('really');
  });

  test('with `notes` the class doubts come first, then `field: doubt`', () => {
    expect(glossary(source, { notes: true })).toContain(
      '**Open questions**\n\n- really\n- x: and this\n- x: and that\n',
    );
  });

  test('with `notes` the terms table holds the class doubts in a third column', () => {
    expect(glossary(source, { classes: true, notes: true })).toBe(
      [
        '# Glossary',
        '',
        '| Term | Definition | Open questions |',
        '|---|---|---|',
        '| A | | really |',
        '',
      ].join('\n'),
    );
    expect(glossary('A  ? one\n  ? two\n', { classes: true, notes: true })).toContain(
      '| A | | one<br>two |',
    );
  });

  test('a class with no doubt gets no open questions', () => {
    expect(glossary('A\n  x\n', { notes: true })).not.toContain('Open questions');
  });
});

describe('`compile` with the glossary target', () => {
  test('writes the same text and the diagnostics of the sketch', () => {
    const source = fixture('glossary.skiss');
    const out = compile(source, { target: 'glossary', name: 'glossary' });
    expect(out.output).toBe(fixture('glossary.md'));
    expect(out.diagnostics.map((d) => d.code)).toEqual(['W_UNDECLARED_CLASS']);
  });

  test('carries the flags through', () => {
    const source = fixture('glossary.skiss');
    expect(compile(source, { target: 'glossary', name: 'glossary', classes: true }).output).toBe(
      fixture('glossary.terms.md'),
    );
    expect(compile(source, { target: 'glossary', name: 'glossary', notes: true }).output).toBe(
      fixture('glossary.notes.md'),
    );
  });
});
