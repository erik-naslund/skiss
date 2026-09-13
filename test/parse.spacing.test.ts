import { describe, expect, test } from 'vitest';
import { parse } from '../src/index.ts';

// Whitespace between tokens is not significant (PR #13, working default:
// SPEC §4 writes WS only at the start of a field line, but its examples put
// spaces after `:`, `=` and `~`). `[]` is one token, so a space inside it is
// an unclosed `[`. These pin the current behaviour so it cannot drift.

function field(line: string) {
  const doc = parse(`Thing\n  ${line}`);
  return { field: doc.classes[0]?.fields[0], codes: doc.diagnostics.map((d) => d.code) };
}

describe('whitespace between tokens (SPEC §4, working default)', () => {
  test('`films: Film []` is a many-valued class reference', () => {
    const { field: f, codes } = field('films: Film []');
    expect(codes).toEqual([]);
    expect(f?.type).toMatchObject({ kind: 'class', many: true });
    expect(f?.type?.kind === 'class' && f.type.name.text).toBe('Film');
  });

  test('`name:int` with no space after the colon is a typed field', () => {
    const { field: f, codes } = field('name:int');
    expect(codes).toEqual([]);
    expect(f?.type).toMatchObject({ kind: 'primitive', name: 'int', many: false });
  });

  test('`name : int` with a space before the colon is the same typed field', () => {
    const { field: f, codes } = field('name : int');
    expect(codes).toEqual([]);
    expect(f?.type).toMatchObject({ kind: 'primitive', name: 'int', many: false });
  });

  test('`pilots: Person[ ]` is E_UNCLOSED_MANY: `[]` is one token', () => {
    const { field: f, codes } = field('pilots: Person[ ]');
    expect(codes).toEqual(['E_UNCLOSED_MANY']);
    expect(f).toBeUndefined();
  });
});
