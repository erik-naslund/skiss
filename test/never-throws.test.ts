import { describe, expect, test } from 'vitest';
import { parse } from '../src/index.ts';

// SPEC §7 and ADR 0004: `parse` never throws and never returns nothing.
// A seeded generator keeps the 1000 inputs reproducible.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weighted towards the characters Skiss cares about, with enough noise to
// reach the odd corners: other Unicode, a lone surrogate, NUL, NBSP, a BOM.
const ALPHABET = [
  ...' \t\t\n\n\r#?*:@~=[]|.<>()\'"\\/-_0123456789',
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'Ääöé€中😀',
  '\0',
  '\u00a0',
  '\ud800',
  '\ufeff',
];

const CODES = new Set([
  'E_UNPARSABLE',
  'E_FIELD_WITHOUT_CLASS',
  'E_MISSING_TYPE',
  'E_UNCLOSED_MANY',
  'E_BAD_NAME',
]);

describe('parse never throws (SPEC §7, ADR 0004)', () => {
  test('empty, whitespace-only, CRLF, tabs and binary garbage all return a document', () => {
    for (const s of [
      '',
      ' ',
      '\n\n',
      ' \t \n\t',
      'A\r\n  b\r\n',
      '\tx',
      '\0\ud800',
      '\ufeffA\n  b',
    ]) {
      const doc = parse(s);
      expect(Array.isArray(doc.classes)).toBe(true);
      expect(Array.isArray(doc.diagnostics)).toBe(true);
    }
    expect(parse('').diagnostics).toEqual([]);
    expect(parse(' \t \n\t').diagnostics).toEqual([]);
    expect(parse('A\r\n  b\r\n').classes[0]?.fields[0]?.name.text).toBe('b');
    expect(parse('A\n\tb').classes[0]?.fields[0]?.name.text).toBe('b');
    // A leading BOM is stripped: one class, one field, no diagnostics.
    const bom = parse('\ufeffA\n  b');
    expect(bom.diagnostics).toEqual([]);
    expect(bom.classes.map((c) => [c.name.text, c.fields.map((f) => f.name.text)])).toEqual([
      ['A', ['b']],
    ]);
  });

  test('1000 random strings: no throw, only error diagnostics with known codes, plain data', () => {
    const random = mulberry32(20260913);
    const pick = (n: number) => Math.floor(random() * n);
    for (let i = 0; i < 1000; i++) {
      const length = pick(240);
      let s = '';
      for (let j = 0; j < length; j++) s += ALPHABET[pick(ALPHABET.length)];
      const doc = parse(s);
      const lineCount = s.split(/\r\n|\n|\r/).length;
      for (const d of doc.diagnostics) {
        expect(d.severity).toBe('error');
        expect(CODES.has(d.code)).toBe(true);
        expect(d.line).toBeGreaterThanOrEqual(1);
        expect(d.line).toBeLessThanOrEqual(lineCount);
        if (d.col !== undefined && d.end !== undefined) expect(d.col).toBeLessThanOrEqual(d.end);
      }
      for (const c of doc.classes) {
        expect(c.line).toBeGreaterThanOrEqual(1);
        for (const f of c.fields) expect(f.line).toBeGreaterThan(c.line);
      }
      expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
    }
  });
});
