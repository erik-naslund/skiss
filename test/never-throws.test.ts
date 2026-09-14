import { describe, expect, test } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { parse, resolve, serialize, toLinkML } from '../src/index.ts';
import { mulberry32 } from './mulberry32.ts';

// SPEC §7 and ADR 0004: `parse` and `resolve` never throw and never return
// nothing.
// A seeded generator keeps the 1000 inputs reproducible.

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

const WARNING_CODES = new Set([
  'W_UNKNOWN_TYPE',
  'W_UNDECLARED_CLASS',
  'W_UNDECLARED_FIELD',
  'W_DUPLICATE_CLASS',
  'W_DUPLICATE_FIELD',
  'W_MULTIPLE_IDENTIFIERS',
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

describe('resolve never throws (SPEC §7, ADR 0004)', () => {
  test('1000 random parses: no throw, errors kept, warnings with known codes, idempotent', () => {
    const random = mulberry32(20260914);
    const pick = (n: number) => Math.floor(random() * n);
    for (let i = 0; i < 1000; i++) {
      const length = pick(240);
      let s = '';
      for (let j = 0; j < length; j++) s += ALPHABET[pick(ALPHABET.length)];
      const doc = parse(s);
      const snapshot = JSON.parse(JSON.stringify(doc));
      const out = resolve(doc);
      expect(doc).toEqual(snapshot);
      expect(out.diagnostics.filter((d) => d.severity === 'error')).toEqual(doc.diagnostics);
      expect(out.classes.length).toBe(doc.classes.length);
      let previous = 0;
      for (const d of out.diagnostics) {
        expect(d.severity === 'error' ? CODES.has(d.code) : WARNING_CODES.has(d.code)).toBe(true);
        expect(d.line).toBeGreaterThanOrEqual(previous);
        previous = d.line;
      }
      expect(Array.isArray(out.undeclared)).toBe(true);
      expect(JSON.parse(JSON.stringify(out))).toEqual(out);
      expect(resolve(out)).toEqual(out);
      // `toLinkML` and `serialize` carry the same claim, and the YAML they
      // write has to come back through YAML 1.1, which is what LinkML reads
      // it with.
      const yaml = serialize(toLinkML(doc, { schemaName: 'fuzz' }), 'yaml');
      expect(parseYaml(yaml, { version: '1.1' })).toBeTypeOf('object');
    }
  });
});
