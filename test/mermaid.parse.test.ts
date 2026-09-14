// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mermaid from 'mermaid';
import { describe, expect, test } from 'vitest';
import { parse, resolve, toMermaid } from '../src/index.ts';

// Issue #5, AC5: every `.mmd` fixture, and the `notes: true` output of every
// `.skiss` fixture, is accepted by Mermaid's own parser. `mermaid.parse`
// needs a DOM at import time, which jsdom provides; nothing is rendered.

// jsdom replaces the global `URL` class, and Node's `fs` does not read a
// file URL of that class correctly, so the fixture path is built as a string.
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string): string => readFileSync(join(fixtures, name), 'utf8');

const FIXTURES = ['basic', 'systems', 'broken'];

test('mermaid.parse rejects a malformed class diagram, so a pass below means something', async () => {
  await expect(mermaid.parse('classDiagram\n  class {\n')).rejects.toThrow();
});

// Pins a known limitation, not a requirement: `toMermaid(parse(''))` is
// `classDiagram` alone, and Mermaid 12 refuses every zero-statement class
// diagram, so a renderer must special-case an empty buffer. If a Mermaid
// upgrade starts accepting it, this test fails and the limitation can go.
test('the empty document is rejected by Mermaid 12', async () => {
  await expect(mermaid.parse(toMermaid(parse('')))).rejects.toThrow();
});

describe.each(FIXTURES)('%s', (name) => {
  test(`${name}.mmd parses with Mermaid`, async () => {
    const result = await mermaid.parse(fixture(`${name}.mmd`));
    expect(result).toMatchObject({ diagramType: 'classDiagram' });
  });

  test(`toMermaid(${name}.skiss, { notes: true }) parses with Mermaid`, async () => {
    const text = toMermaid(resolve(parse(fixture(`${name}.skiss`))), { notes: true });
    const result = await mermaid.parse(text);
    expect(result).toMatchObject({ diagramType: 'classDiagram' });
  });
});
