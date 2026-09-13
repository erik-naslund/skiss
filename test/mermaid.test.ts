import { describe, expect, test } from 'vitest';
import { parse, resolve, toMermaid } from '../src/index.ts';

// Issue #5. The fixtures cover the mapping table with `notes` off; these
// cover what they express badly: the `notes: true` lines and their place in
// the output (AC4), determinism (AC6), the empty document, and that
// `toMermaid` never throws.

const mmd = (source: string, notes = false): string[] =>
  toMermaid(resolve(parse(source)), { notes }).split('\n');

describe('`notes: true` (AC4)', () => {
  const source = [
    'Loan @Circulation                       ? should this live in Catalog instead',
    '  book: Book',
    '  status: open|returned                 # is this the loan or the book? ? ask the desk staff',
    'Book',
    '  isbn*',
    '',
  ].join('\n');

  test('a class doubt is `note for Class "text"`, a field doubt `note for Class "field: text"`', () => {
    expect(mmd(source, true)).toContain('  note for Loan "should this live in Catalog instead"');
    expect(mmd(source, true)).toContain('  note for Loan "status: ask the desk staff"');
  });

  test('descriptions are omitted whether notes are on or off', () => {
    for (const notes of [false, true]) {
      expect(mmd(source, notes).join('\n')).not.toContain('is this the loan or the book');
    }
  });

  test('notes come after the last class body and before the first relation', () => {
    const lines = mmd(source, true);
    const lastBrace = lines.lastIndexOf('  }');
    const firstNote = lines.findIndex((l) => l.startsWith('  note for '));
    const firstRelation = lines.findIndex((l) => l.includes(' --> ') || l.includes(' ..> '));
    expect(firstNote).toBeGreaterThan(lastBrace);
    expect(firstRelation).toBeGreaterThan(firstNote);
  });

  test('notes are placed after undeclared placeholders', () => {
    const lines = mmd('A ~ Ghost ? really\n', true);
    expect(lines).toEqual([
      'classDiagram',
      '  class A {',
      '  }',
      '  class Ghost {',
      '    <<undeclared>>',
      '  }',
      '  note for A "really"',
      '  A ..> Ghost : similar',
      '',
    ]);
  });

  test('double quotes inside a doubt become single quotes', () => {
    expect(mmd('Planet\n  climate: arid|frozen ? "temperate" was contested\n', true)).toContain(
      '  note for Planet "climate: \'temperate\' was contested"',
    );
  });

  test('with notes off, no `note for` line is emitted', () => {
    expect(mmd(source).some((l) => l.includes('note for'))).toBe(false);
  });
});

describe('relations', () => {
  test('a field with both `: Class` and `= Class.field` draws both, `:` first', () => {
    const lines = mmd('A\n  ref: B = B.id\nB\n  id*\n');
    expect(lines.filter((l) => l.startsWith('  A '))).toEqual([
      '  A --> B : ref',
      '  A ..> B : ref = id',
    ]);
  });

  test('D6: a self-reference is a normal relation', () => {
    expect(mmd('Node\n  parent: Node\n  children: Node[]\n')).toEqual([
      'classDiagram',
      '  class Node {',
      '    +Node parent',
      '    +Node[] children',
      '  }',
      '  Node --> Node : parent',
      '  Node "1" --> "*" Node : children',
      '',
    ]);
  });
});

describe('shape of the output (AC3, AC6)', () => {
  test('the empty document is `classDiagram` and one newline', () => {
    expect(toMermaid(parse(''))).toBe('classDiagram\n');
    expect(toMermaid(resolve(parse('')))).toBe('classDiagram\n');
  });

  test('the same document produces the same string, resolved or not', () => {
    const source = 'A @S ~ B ? hm\n  id*\n  b: B[]\n  x = B.id ? why\nB\n  id*\n';
    const a = toMermaid(parse(source), { notes: true });
    const b = toMermaid(resolve(parse(source)), { notes: true });
    const c = toMermaid(resolve(resolve(parse(source))), { notes: true });
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(toMermaid(parse(source), { notes: true })).toBe(a);
  });

  test('does not mutate its input', () => {
    const doc = parse('A\n  id*\n  code*\n  b: Ghost\n');
    const before = JSON.parse(JSON.stringify(doc));
    toMermaid(doc, { notes: true });
    expect(doc).toEqual(before);
  });
});

describe('never throws', () => {
  test('random documents from the parser produce a string', () => {
    // The same seeded generator as never-throws.test.ts, so the corpus is stable.
    let a = 20260915 >>> 0;
    const random = (): number => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const alphabet = [...' \t\n#?*:@~=[]|.<>"\'\\-_0123456789abcXYZäé😀'];
    for (let i = 0; i < 500; i++) {
      let s = '';
      const length = Math.floor(random() * 200);
      for (let j = 0; j < length; j++) s += alphabet[Math.floor(random() * alphabet.length)];
      const doc = parse(s);
      for (const notes of [false, true]) {
        const out = toMermaid(doc, { notes });
        expect(out.startsWith('classDiagram\n')).toBe(true);
        expect(out.endsWith('\n')).toBe(true);
        expect(out.endsWith('\n\n')).toBe(false);
        for (const line of out.split('\n')) expect(line).toBe(line.trimEnd());
      }
    }
  });
});
