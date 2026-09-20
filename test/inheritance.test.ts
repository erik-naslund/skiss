import { describe, expect, test } from 'vitest';
import type { Diagnostic, Document } from '../src/index.ts';
import { fromLinkML, parse, resolve, toLinkML, toMermaid, toSkiss } from '../src/index.ts';

// Issue #64, SPEC §3.10. `systems.skiss` and `broken.skiss` are the contract
// for what inheritance produces; these cover what the fixtures express badly:
// the shape of a class line, which line a circle is reported on, what counts
// as an identical field, and the two directions of the LinkML mapping.

const parentOf = (source: string): string | undefined => parse(source).classes[0]?.parent?.text;

const first = (source: string): Diagnostic | undefined => parse(source).diagnostics[0];

const diagnostics = (source: string): [string, number][] =>
  resolve(parse(source)).diagnostics.map((d) => [d.code, d.line]);

const message = (doc: Document, code: string): string | undefined =>
  doc.diagnostics.find((d) => d.code === code)?.message;

describe('SPEC §3.10, the class line', () => {
  test('`Jedi < Character` names the parent, whatever the whitespace', () => {
    expect(parentOf('Jedi < Character\n')).toBe('Character');
    expect(parentOf('Jedi<Character\n')).toBe('Character');
    expect(parentOf('Jedi \t< \tCharacter\n')).toBe('Character');
  });

  test('the parent carries its own column range, for an editor to point at', () => {
    expect(parse('Jedi < Character\n').classes[0]?.parent).toEqual({
      text: 'Character',
      line: 1,
      col: 7,
      end: 16,
    });
  });

  test('`@`, `~`, `#` and `?` follow the parent on the same line', () => {
    const cls = parse('Ebook < Book @Catalog ~ Copy   # a download   ? or a licence\n').classes[0];
    expect([
      cls?.parent?.text,
      cls?.system?.text,
      cls?.similarTo?.text,
      cls?.description,
      cls?.note,
    ]).toEqual(['Book', 'Catalog', 'Copy', 'a download', 'or a licence']);
  });

  test('a class has one parent', () => {
    expect(first('Jedi < Character, Droid\n')).toMatchObject({
      code: 'E_UNPARSABLE',
      message: 'A class has one parent; `<` takes a single class name',
    });
    expect(first('Jedi < Character < Droid\n')?.code).toBe('E_UNPARSABLE');
  });

  test('`<` with no class after it is unparsable', () => {
    expect(first('Jedi <\n')).toMatchObject({
      code: 'E_UNPARSABLE',
      message: 'Expected a class name after `<`, e.g. `Jedi < Character`',
    });
  });

  test('a primitive is not a class, and the error says so', () => {
    expect(first('Jedi < int\n')).toMatchObject({
      code: 'E_BAD_NAME',
      message: '`int` is a primitive, not a class; a parent is a class',
    });
    expect(first('Jedi < padawan\n')).toMatchObject({
      code: 'E_BAD_NAME',
      message: 'The class after `<` must be UpperCamelCase: `padawan`',
    });
  });

  test('`<` after `@` is out of order, and the message gives the order', () => {
    expect(first('Jedi @Temple < Character\n')).toMatchObject({
      code: 'E_UNPARSABLE',
      message:
        '`<` is out of order; a class line reads: name, `< Parent`, `@System`, `~ Class`, then `#` and `?`',
    });
  });

  test('`<` on a field line names the line it belongs on', () => {
    expect(first('Jedi\n  master < Character\n')).toMatchObject({
      code: 'E_UNPARSABLE',
      message: '`<` marks inheritance and belongs on the class line: `Child < Parent`',
      line: 2,
    });
  });
});

describe('SPEC §3.10, what resolve makes of a parent', () => {
  test('a parent that is not declared is a reference like any other', () => {
    const out = resolve(parse('Jedi < Character\n  rank\n'));
    expect(diagnostics('Jedi < Character\n  rank\n')).toEqual([['W_UNDECLARED_CLASS', 1]]);
    expect(out.undeclared.map((n) => n.text)).toEqual(['Character']);
  });

  test('a class that inherits from itself is an error on its own line', () => {
    const out = resolve(parse('Jedi < Jedi\n  rank\n'));
    expect(out.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['error', 'E_INHERITANCE_CYCLE'],
    ]);
    expect(message(out, 'E_INHERITANCE_CYCLE')).toBe(
      'class `Jedi` inherits from itself; this `<` is not carried',
    );
  });

  test('a circle is reported on the line that closes it, and that `<` alone is cut', () => {
    const out = resolve(parse('Jedi < Sith\n  rank\nSith < Jedi\n  order\n'));
    expect(out.diagnostics.map((d) => [d.code, d.line])).toEqual([['E_INHERITANCE_CYCLE', 3]]);
    expect(out.classes.map((c) => c.parent?.text)).toEqual(['Sith', undefined]);
  });

  test('the message names the classes the circle runs through', () => {
    const out = resolve(parse('A < B\nB < C\nC < A\n'));
    expect(message(out, 'E_INHERITANCE_CYCLE')).toBe(
      'class `C` inherits from itself through `A`, `B`; this `<` is not carried',
    );
  });

  test('cutting a circle does not touch the input, and resolving again changes nothing', () => {
    const doc = parse('A < B\nB < A\n');
    const before = JSON.parse(JSON.stringify(doc));
    const out = resolve(doc);
    expect(doc).toEqual(before);
    expect(resolve(out)).toEqual(out);
  });

  test('the identifier inherits, so a child that writes its own gets the §3.8 warning', () => {
    const source = 'Character\n  id*\n  name\nJedi < Character\n  jediId*\n';
    const out = resolve(parse(source));
    expect(out.diagnostics.map((d) => [d.code, d.line])).toEqual([['W_MULTIPLE_IDENTIFIERS', 5]]);
    expect(message(out, 'W_MULTIPLE_IDENTIFIERS')).toBe(
      '`*` on `jediId` is ignored: class `Jedi` inherits the identifier `id` from class `Character`, line 2',
    );
    expect(out.classes[1]?.fields[0]?.identifier).toBe(false);
  });

  test('a field identical to the one it replaces is a warning; a different one is not', () => {
    const parent = 'Character\n  rank: int                             # how senior\n';
    expect(diagnostics(`${parent}Jedi < Character\n  rank: int   # how senior\n`)).toEqual([
      ['W_REDUNDANT_OVERRIDE', 4],
    ]);
    expect(
      diagnostics(`${parent}Jedi < Character\n  rank: int   # how senior in the order\n`),
    ).toEqual([]);
    expect(diagnostics(`${parent}Jedi < Character\n  rank: padawan|knight\n`)).toEqual([]);
  });

  test('identical is what the two fields mean, so an alias is not a difference', () => {
    expect(diagnostics('Character\n  rank: integer\nJedi < Character\n  rank: int\n')).toEqual([
      ['W_REDUNDANT_OVERRIDE', 4],
    ]);
  });

  test('only the parents are searched: a field of the child is not replaced by itself', () => {
    expect(diagnostics('Character\n  rank\n  rank\n')).toEqual([['W_DUPLICATE_FIELD', 3]]);
  });
});

describe('SPEC §5.1, what inheritance compiles to', () => {
  const source =
    'Book\n  isbn*\n  status: open|lost\nEbook < Book\n  fileSize: int\n  status: open|licensed\n';

  test('`< Parent` is `is_a`, and a field that replaces an inherited one is `slot_usage`', () => {
    const ebook = toLinkML(parse(source), { schemaName: 'library' }).classes?.Ebook;
    expect(ebook?.is_a).toBe('Book');
    expect(Object.keys(ebook?.slot_usage ?? {})).toEqual(['status']);
    expect(Object.keys(ebook?.attributes ?? {})).toEqual(['fileSize']);
    // SPEC §5.1: the key order of a class.
    expect(Object.keys(ebook ?? {})).toEqual(['is_a', 'slot_usage', 'attributes']);
  });

  test('a parent that is not declared is the stub the reference leaves behind', () => {
    const schema = toLinkML(parse('Ebook < Book\n  fileSize: int\n'), { schemaName: 'library' });
    expect(schema.classes?.Ebook?.is_a).toBe('Book');
    expect(schema.classes?.Book).toEqual({ annotations: { undeclared: true } });
  });

  test('the `<` that closes a circle is not written', () => {
    const schema = toLinkML(parse('A < B\nB < A\n'), { schemaName: 'library' });
    expect(schema.classes?.A?.is_a).toBe('B');
    expect(schema.classes?.B?.is_a).toBeUndefined();
  });

  test('Mermaid draws the parent first, and the child box keeps its own fields', () => {
    const lines = toMermaid(resolve(parse(source))).split('\n');
    expect(lines).toContain('  Book <|-- Ebook');
    expect(
      lines.slice(lines.indexOf('  class Ebook {') + 1, lines.indexOf('  Book <|-- Ebook')),
    ).toEqual(['    +int fileSize', '    +open|licensed status', '  }']);
  });

  test('the printer writes `Child < Parent` before `@` and `~`', () => {
    expect(toSkiss(parse('Ebook<Book@Catalog~Copy\n  fileSize: int\n'))).toBe(
      'Ebook < Book @Catalog ~ Copy\n  fileSize: int\n',
    );
  });
});

describe('SPEC §8, reading inheritance back', () => {
  const schema = {
    classes: {
      Book: { attributes: { isbn: { identifier: true }, title: {} } },
      Ebook: {
        is_a: 'Book',
        slot_usage: { title: { description: 'as the shop lists it', pattern: '^.' } },
        attributes: { fileSize: { range: 'integer' } },
      },
    },
  };

  test('`is_a` is `<`, and a `slot_usage` entry for an inherited slot is a field', () => {
    expect(fromLinkML(schema).source).toBe(
      'Book\n  isbn*\n  title\n\nEbook < Book\n  fileSize: int\n  title                                 # as the shop lists it\n',
    );
  });

  test('the entry is read alone, so only what it holds beyond a field is reported', () => {
    expect(fromLinkML(schema).dropped).toEqual([{ kind: 'pattern', element: 'Ebook.title' }]);
  });

  test('a parent the schema does not define is an undeclared class in the sketch', () => {
    const out = fromLinkML({ classes: { Ebook: { is_a: 'book_record', attributes: { x: {} } } } });
    expect(out.source).toBe('Ebook < BookRecord\n  x\n');
    expect(out.dropped).toEqual([
      { kind: 'renamed', element: 'Ebook', detail: '`BookRecord` from `book_record`' },
    ]);
    expect(resolve(out.document).diagnostics.map((d) => d.code)).toEqual(['W_UNDECLARED_CLASS']);
  });

  test('an `is_a` that is not a class name is reported under its own key', () => {
    expect(fromLinkML({ classes: { A: { is_a: ['B'], attributes: { x: {} } } } }).dropped).toEqual([
      { kind: 'is_a', element: 'A', detail: 'a list is not a class name' },
    ]);
  });
});
