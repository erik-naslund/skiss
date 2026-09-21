import { describe, expect, test } from 'vitest';
import { compile, parse, resolve } from '../src/index.ts';

// Issue #42: the primitive table is a plain object, so a lookup that does not
// guard with `Object.hasOwn` finds `Object.prototype` and reads
// `x: constructor` as a primitive whose name is a function. SPEC §3.2: a
// lowercase word that is not a primitive is an unknown type.

const fieldType = (line: string) => parse(`Thing\n  ${line}\n`).classes[0]?.fields[0]?.type;

const warnings = (source: string) =>
  resolve(parse(source)).diagnostics.filter((d) => d.severity === 'warning');

describe('a type word that is an `Object.prototype` key (SPEC §3.2, issue #42)', () => {
  for (const word of ['constructor', 'toString']) {
    test(`\`x: ${word}\` is an unknown type, not a primitive`, () => {
      expect(fieldType(`x: ${word}`)).toMatchObject({ kind: 'unknown', many: false });
      expect(fieldType(`x: ${word}`)).toMatchObject({ name: { text: word } });
    });

    test(`\`x: ${word}\` warns W_UNKNOWN_TYPE and falls back to \`string\``, () => {
      const [w] = warnings(`Thing\n  x: ${word}\n`);
      expect(w?.code).toBe('W_UNKNOWN_TYPE');
      expect(w?.message).toContain(`unknown type \`${word}\``);
      const { output } = compile(`Thing\n  x: ${word}\n`, {
        target: 'linkml',
        schemaName: 'sketch',
      });
      expect(output).toContain('range: string');
    });
  }
});

// SPEC 0.2, §3.4 and §4 (issue #57, from review finding S7): an enum value may
// start with a digit and may be digits only.
describe('a numeric enum value (SPEC §3.4)', () => {
  test('`priority: 1|2|3` is an enum of three values', () => {
    expect(fieldType('priority: 1|2|3')).toMatchObject({ kind: 'enum', many: false });
    expect(parse('Task\n  priority: 1|2|3\n').diagnostics).toEqual([]);
    const type = fieldType('priority: 1|2|3');
    expect(type?.kind === 'enum' ? type.values.map((v) => v.text) : []).toEqual(['1', '2', '3']);
  });

  test('digits mix with letters, `-` and `_`, and `[]` still attaches', () => {
    expect(fieldType('sizes: 1x|2x|3x[]')).toMatchObject({ kind: 'enum', many: true });
    expect(fieldType('codes: 1-a|2_b')).toMatchObject({ kind: 'enum' });
  });

  test('a value that is still invalid does not say a value starts with a letter', () => {
    const [d] = parse('Task\n  priority: -1|2\n').diagnostics;
    expect(d?.code).toBe('E_UNPARSABLE');
    expect(d?.message).not.toContain('starting with a letter');
    expect(d?.message).toContain('does not start with `-` or `_`');
  });

  test('a system name still starts with a letter', () => {
    const [d] = parse('Task @1Fleet\n').diagnostics;
    expect(d?.code).toBe('E_UNPARSABLE');
    expect(d?.message).toContain('starting with a letter');
  });

  test('a single value without a pipe is not an enum (SPEC §9, open question 4)', () => {
    expect(parse('Task\n  priority: 1\n').diagnostics[0]?.code).toBe('E_UNPARSABLE');
  });
});

// Issue #77: SPEC §4's letters and digits are ASCII. `förnamn` is lowercase in
// Swedish, so a message that names the case rule and stops reads as wrong; and
// one bad class name used to be as many diagnostics as the class had fields.
describe('a name outside ASCII (SPEC §4, issue #77)', () => {
  const first = (source: string) => parse(source).diagnostics[0];
  const codes = (source: string) => parse(source).diagnostics.map((d) => d.code);

  test('a field name is reported with the first character outside the set', () => {
    expect(first('Kund\n  förnamn\n')).toMatchObject({
      code: 'E_BAD_NAME',
      message:
        'Field names are lowerCamelCase in ASCII letters and digits (a-z, A-Z, 0-9), lowercase first: `förnamn`. `ö` is not one of them.',
    });
  });

  test('a class name is reported with the first character outside the set', () => {
    expect(first('Beställning\n  id*\n')).toMatchObject({
      code: 'E_BAD_NAME',
      message:
        'Class names are UpperCamelCase in ASCII letters and digits (A-Z, a-z, 0-9), uppercase first: `Beställning`. `ä` is not one of them.',
    });
  });

  test('a field name of ASCII letters in the wrong case is reported by its first letter', () => {
    expect(first('Kund\n  Fornamn\n')?.message).toBe(
      'Field names are lowerCamelCase in ASCII letters and digits (a-z, A-Z, 0-9), lowercase first: `Fornamn`. `Fornamn` starts with an uppercase letter.',
    );
  });

  test('a class name of ASCII letters in the wrong case is reported by its first letter', () => {
    expect(first('namn\n  id*\n')?.message).toBe(
      'Class names are UpperCamelCase in ASCII letters and digits (A-Z, a-z, 0-9), uppercase first: `namn`. `namn` starts with a lowercase letter.',
    );
  });

  test('a name that is both is reported by its character, which is the rule it breaks first', () => {
    expect(first('Kund\n  Förnamn\n')?.message).toContain('`ö` is not one of them.');
  });

  test('an `@System` name names the character too, and still says it starts with a letter', () => {
    const d = first('Order @Ekonomí\n');
    expect(d?.code).toBe('E_UNPARSABLE');
    expect(d?.message).toBe(
      'A system name is ASCII letters, digits, `-` and `_` (A-Z, a-z, 0-9), starting with a letter: `Ekonomí`. `í` is not one of them.',
    );
  });

  test('an enum value names the character too', () => {
    const d = first('Order\n  status: påbörjad|klar\n');
    expect(d?.code).toBe('E_UNPARSABLE');
    expect(d?.message).toBe(
      'An enum value is ASCII letters, digits, `-` and `_` (A-Z, a-z, 0-9), and does not start with `-` or `_`: `påbörjad`. `å` is not one of them.',
    );
  });

  test('a class with a bad name and three fields yields exactly one diagnostic', () => {
    const doc = parse('Beställning\n  id*\n  belopp: int\n  skapad: date\n');
    expect(doc.diagnostics.map((d) => d.code)).toEqual(['E_BAD_NAME']);
    // The class is not in the document, and its fields went with it.
    expect(doc.classes).toEqual([]);
  });

  test('the class after `~` and the class after `<` stop the cascade as well', () => {
    expect(codes('Kundvy ~ Beställning\n  id*\n')).toEqual(['E_BAD_NAME']);
    expect(codes('Order < Beställning\n  id*\n')).toEqual(['E_BAD_NAME']);
  });

  test('a field under a dropped class is still read, so its own mistakes are reported', () => {
    expect(codes('Beställning\n  Fornamn\n  id*\n')).toEqual(['E_BAD_NAME', 'E_BAD_NAME']);
  });

  test('a class line that fails after its name still reports the fields under it', () => {
    expect(codes('Order @Ekonomí\n  id*\n')).toEqual(['E_UNPARSABLE', 'E_FIELD_WITHOUT_CLASS']);
  });
});
