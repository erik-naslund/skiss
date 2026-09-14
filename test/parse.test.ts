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
