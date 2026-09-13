import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parse, resolve, toMermaid } from '../src/index.ts';

// Issue #5, AC2 and AC3: the `.mmd` fixtures are the contract for the
// Mermaid mapping table in docs/ARCHITECTURE.md, byte for byte.

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe.each(['basic', 'systems', 'broken'])('%s.skiss', (name) => {
  test(`toMermaid(resolve(parse(${name}.skiss))) equals ${name}.mmd byte for byte`, () => {
    const doc = resolve(parse(fixture(`${name}.skiss`)));
    expect(toMermaid(doc)).toBe(fixture(`${name}.mmd`));
  });

  test('an unresolved document is resolved first and gives the same output (AC1)', () => {
    const doc = parse(fixture(`${name}.skiss`));
    expect(toMermaid(doc)).toBe(fixture(`${name}.mmd`));
  });

  test('`notes: false` is the default', () => {
    const doc = resolve(parse(fixture(`${name}.skiss`)));
    expect(toMermaid(doc, { notes: false })).toBe(fixture(`${name}.mmd`));
    expect(toMermaid(doc, {})).toBe(fixture(`${name}.mmd`));
  });
});
