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
