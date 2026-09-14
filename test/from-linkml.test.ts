import { describe, expect, test } from 'vitest';
import { parse as parseYaml } from 'yaml';
import type { Dropped, LinkMLSchema } from '../src/index.ts';
import { formatDropped, fromLinkML } from '../src/index.ts';

// Issue #46, AC1 and AC4: the SPEC §8 rules the fixtures express badly, each
// named for the sentence it pins. A schema is written here as the plain object
// `fromLinkML` takes, since the CLI is what parses YAML (issue #47).

type Schema = Record<string, unknown>;

const schema = (parts: Schema): Schema => ({
  id: 'https://example.org/foreign',
  name: 'foreign',
  default_prefix: 'foreign',
  default_range: 'string',
  prefixes: { linkml: 'https://w3id.org/linkml/' },
  imports: ['linkml:types'],
  ...parts,
});

const project = (parts: Schema): ReturnType<typeof fromLinkML> => fromLinkML(schema(parts));
const sketch = (parts: Schema): string => project(parts).source;
const dropped = (parts: Schema): Dropped[] => project(parts).dropped;

describe('SPEC §8, a schema this cannot read', () => {
  test.each([
    ['null', null],
    ['a string', 'classes: {}'],
    ['a list', [{ classes: {} }]],
    ['a number', 7],
  ])('%s is an empty sketch and one report', (_name, input) => {
    const out = fromLinkML(input);
    expect(out.source).toBe('');
    expect(out.document.classes).toEqual([]);
    expect(out.dropped.map((d) => d.kind)).toEqual(['schema']);
  });

  test('a schema with no `classes` is an empty sketch and one report saying why', () => {
    const out = fromLinkML({ name: 'foreign' });
    expect(out.source).toBe('');
    expect(out.dropped).toEqual([
      { kind: 'schema', element: 'foreign', detail: 'the schema has no `classes`' },
    ]);
  });

  test('it never throws on an object that is not a schema at all', () => {
    expect(() => fromLinkML({ classes: { A: 7, B: [1], C: null } })).not.toThrow();
    expect(fromLinkML({ classes: { A: 7, B: [1], C: null } }).source).toBe('C\n');
  });
});

describe('SPEC §8, the element mapping', () => {
  test('attributes become fields, in order', () => {
    expect(sketch({ classes: { Book: { attributes: { isbn: {}, title: {} } } } })).toBe(
      'Book\n  isbn\n  title\n',
    );
  });

  test('`identifier: true` is `*`, `multivalued: true` is `[]`', () => {
    const out = sketch({
      classes: {
        Book: { attributes: { isbn: { identifier: true }, tags: { multivalued: true } } },
      },
    });
    expect(out).toBe('Book\n  isbn*\n  tags: string[]\n');
  });

  test.each([
    ['integer', 'int'],
    ['float', 'float'],
    ['double', 'float'],
    ['decimal', 'float'],
    ['boolean', 'bool'],
    ['date', 'date'],
    ['datetime', 'datetime'],
    ['uri', 'uri'],
    ['uriorcurie', 'uri'],
  ])('`range: %s` is `: %s`', (range, written) => {
    expect(sketch({ classes: { Book: { attributes: { x: { range } } } } })).toBe(
      `Book\n  x: ${written}\n`,
    );
  });

  test('`range: string` and no range at all are both a field without a colon', () => {
    expect(sketch({ classes: { Book: { attributes: { a: { range: 'string' }, b: {} } } } })).toBe(
      'Book\n  a\n  b\n',
    );
  });

  test('no range with a `default_range` that is not string takes the default range', () => {
    expect(
      sketch({ default_range: 'integer', classes: { Book: { attributes: { pages: {} } } } }),
    ).toBe('Book\n  pages: int\n');
  });

  test('a range naming a class of the schema is a class reference', () => {
    expect(
      sketch({ classes: { Book: { attributes: { author: { range: 'Author' } } }, Author: {} } }),
    ).toBe('Book\n  author: Author\n\nAuthor\n');
  });

  test('any other capitalised range is a class reference too', () => {
    expect(sketch({ classes: { Book: { attributes: { author: { range: 'Author' } } } } })).toBe(
      'Book\n  author: Author\n',
    );
  });

  test('any other LinkML type is the word as written, and is reported as narrowed', () => {
    const parts = { classes: { Book: { attributes: { at: { range: 'time' } } } } };
    expect(sketch(parts)).toBe('Book\n  at: time\n');
    expect(dropped(parts)).toEqual([
      {
        kind: 'narrowed',
        element: 'Book.at',
        detail: '`time` is not a Skiss type; it falls back to string',
      },
    ]);
  });

  test('description, system, note, joins_to and close_mappings come back as written', () => {
    expect(
      sketch({
        classes: {
          Book: {},
          Listing: {
            description: 'what the site shows',
            annotations: { system: 'Website', note: 'ask the desk' },
            close_mappings: ['catalog:Book'],
            attributes: {
              isbn: { annotations: { joins_to: 'Book.isbn' } },
              blurb: { description: 'editorial\nsummary' },
            },
          },
        },
      }),
    ).toBe(
      'Book\n\n' +
        'Listing @Website ~ Book                 # what the site shows ? ask the desk\n' +
        '  isbn = Book.isbn\n' +
        '  blurb                                 # editorial summary\n',
    );
  });

  test('an annotation in the long form is read like the compact one', () => {
    expect(
      sketch({
        classes: {
          Book: { annotations: { system: { tag: 'system', value: 'Catalog' } }, attributes: {} },
        },
      }),
    ).toBe('Book @Catalog\n');
  });

  test('a stub from a reference is not a class of the sketch (SPEC §5.1)', () => {
    const parts = {
      classes: {
        Book: { attributes: { ghost: { range: 'Ghost' } } },
        Ghost: { annotations: { undeclared: true } },
      },
    };
    expect(sketch(parts)).toBe('Book\n  ghost: Ghost\n');
    expect(dropped(parts)).toEqual([]);
  });

  test('the schema `slots` a class lists follow its attributes, in that order', () => {
    const parts = {
      slots: { record_id: { identifier: true }, updated_at: { range: 'datetime' } },
      classes: { Book: { slots: ['record_id', 'updated_at'], attributes: { title: {} } } },
    };
    expect(sketch(parts)).toBe('Book\n  title\n  recordId*\n  updatedAt: datetime\n');
  });

  test('a global slot no class lists is reported', () => {
    expect(dropped({ slots: { shelf: {} }, classes: { Book: {} } })).toEqual([
      { kind: 'slot', element: 'shelf', detail: 'no class lists it' },
    ]);
  });
});

describe('SPEC §8, Names', () => {
  test('a class name that is not UpperCamelCase is converted and reported', () => {
    const parts = { classes: { library_book: { attributes: { 'Page-Count': {} } } } };
    expect(sketch(parts)).toBe('LibraryBook\n  pageCount\n');
    expect(dropped(parts)).toEqual([
      { kind: 'renamed', element: 'LibraryBook', detail: 'from `library_book`' },
      { kind: 'renamed', element: 'LibraryBook.pageCount', detail: 'from `Page-Count`' },
    ]);
  });

  test('two names that converge take a number', () => {
    const parts = {
      classes: {
        page_count: {},
        'Page-Count': { attributes: { page_count: {}, 'page count': {} } },
      },
    };
    expect(sketch(parts)).toBe('PageCount\n\nPageCount2\n  pageCount\n  pageCount2\n');
  });

  test('a reference is converted with the name it points at', () => {
    const parts = {
      classes: {
        library_book: { attributes: { written_by: { range: 'author_record' } } },
        author_record: {
          close_mappings: ['catalog:library_book'],
          attributes: { same_as: { annotations: { joins_to: 'library_book.page_count' } } },
        },
      },
    };
    expect(sketch(parts)).toBe(
      'LibraryBook\n  writtenBy: AuthorRecord\n\n' +
        'AuthorRecord ~ LibraryBook\n  sameAs = LibraryBook.pageCount\n',
    );
  });

  test('every converted reference is reported where it appears, once per name', () => {
    const parts = {
      classes: {
        library_book: { attributes: { written_by: { range: 'author_record' } } },
        author_record: {
          close_mappings: ['catalog:library_book'],
          attributes: { same_as: { annotations: { joins_to: 'library_book.page_count' } } },
        },
      },
    };
    expect(dropped(parts)).toEqual([
      { kind: 'renamed', element: 'LibraryBook', detail: 'from `library_book`' },
      { kind: 'renamed', element: 'LibraryBook.writtenBy', detail: 'from `written_by`' },
      {
        kind: 'renamed',
        element: 'LibraryBook.writtenBy',
        detail: '`AuthorRecord` from `author_record`',
      },
      { kind: 'renamed', element: 'AuthorRecord', detail: 'from `author_record`' },
      { kind: 'renamed', element: 'AuthorRecord', detail: '`LibraryBook` from `library_book`' },
      { kind: 'renamed', element: 'AuthorRecord.sameAs', detail: 'from `same_as`' },
      {
        kind: 'renamed',
        element: 'AuthorRecord.sameAs',
        detail: '`LibraryBook` from `library_book`',
      },
      { kind: 'renamed', element: 'AuthorRecord.sameAs', detail: '`pageCount` from `page_count`' },
    ]);
  });

  test('a reference out of the schema is reported too: it has no declaration here', () => {
    const parts = { classes: { Book: { attributes: { by: { range: 'Author_Record' } } } } };
    expect(sketch(parts)).toBe('Book\n  by: AuthorRecord\n');
    expect(dropped(parts)).toEqual([
      { kind: 'renamed', element: 'Book.by', detail: '`AuthorRecord` from `Author_Record`' },
    ]);
  });

  test('one converted name on one element is reported once, however often it appears', () => {
    const parts = {
      classes: {
        Book: {
          close_mappings: ['catalog:author_record', 'catalog:other'],
          attributes: { by: { range: 'author_record' } },
        },
      },
    };
    expect(dropped(parts).filter((d) => d.element === 'Book')).toEqual([
      { kind: 'renamed', element: 'Book', detail: '`AuthorRecord` from `author_record`' },
      { kind: 'close_mappings', element: 'Book', detail: '1 beyond the first' },
    ]);
  });
});

describe('SPEC §8, close_mappings', () => {
  test('a full IRI takes the name after the last `/`, `#` or `:`', () => {
    expect(sketch({ classes: { Listing: { close_mappings: ['https://schema.org/Book'] } } })).toBe(
      'Listing ~ Book\n',
    );
    expect(
      sketch({ classes: { Listing: { close_mappings: ['https://schema.org/x#Book'] } } }),
    ).toBe('Listing ~ Book\n');
  });

  test('an entry with no name in it is reported as one this cannot read', () => {
    const parts = { classes: { Listing: { close_mappings: ['https://schema.org/'] } } };
    expect(sketch(parts)).toBe('Listing\n');
    expect(dropped(parts)).toEqual([
      { kind: 'close_mappings', element: 'Listing', detail: 'no mapping this can read' },
    ]);
  });
});

describe('SPEC §8, Enums', () => {
  const status = { permissible_values: { open: {}, closed: {} } };

  test('an enum used by exactly one attribute is inlined and nothing is reported', () => {
    const parts = {
      enums: { status },
      classes: { Loan: { attributes: { s: { range: 'status' } } } },
    };
    expect(sketch(parts)).toBe('Loan\n  s: open|closed\n');
    expect(dropped(parts)).toEqual([]);
  });

  test('an enum shared by attributes of one name is rebuilt by §5.1 and is not reported', () => {
    const parts = {
      enums: { status },
      classes: {
        Loan: { attributes: { status: { range: 'status' } } },
        Hold: { attributes: { status: { range: 'status' } } },
      },
    };
    expect(sketch(parts)).toBe('Loan\n  status: open|closed\n\nHold\n  status: open|closed\n');
    expect(dropped(parts)).toEqual([]);
  });

  test('an enum shared by attributes of different names loses the sharing and is reported', () => {
    const parts = {
      enums: { status },
      classes: {
        Loan: { attributes: { status: { range: 'status' } } },
        Hold: { attributes: { state: { range: 'status' } } },
      },
    };
    expect(dropped(parts)).toEqual([
      { kind: 'inlined', element: 'status', detail: 'inlined at 2 attributes' },
    ]);
  });

  test('one name carrying two value sets loses the sharing as well (SPEC §5.1)', () => {
    const parts = {
      enums: { status, other: { permissible_values: { red: {}, green: {} } } },
      classes: {
        Loan: { attributes: { status: { range: 'status' } } },
        Hold: { attributes: { status: { range: 'status' } } },
        Wish: { attributes: { status: { range: 'other' } } },
      },
    };
    expect(dropped(parts).map((d) => d.element)).toEqual(['status']);
  });

  test('an enum with fewer than two values is not an inline enum (SPEC §3.4)', () => {
    const parts = {
      enums: { only: { permissible_values: { one: {} } } },
      classes: {
        Loan: { attributes: { s: { range: 'only' }, t: { range: 'only', multivalued: true } } },
      },
    };
    expect(sketch(parts)).toBe('Loan\n  s\n  t: string[]\n');
    expect(dropped(parts)).toEqual([
      {
        kind: 'enum',
        element: 'only',
        detail:
          '1 permissible value cannot be an inline enum (§3.4); those attributes keep no type',
      },
    ]);
  });

  test('`permissible_values` that is not a map is reported as what it is', () => {
    const parts = {
      enums: { status: { permissible_values: [{ open: {} }, { closed: {} }] } },
      classes: { Loan: { attributes: { s: { range: 'status' } } } },
    };
    expect(sketch(parts)).toBe('Loan\n  s\n');
    expect(dropped(parts)).toEqual([
      {
        kind: 'enum',
        element: 'status',
        detail: 'a list is not a map of permissible values; those attributes keep no type',
      },
    ]);
  });

  test('an enum no attribute has as its range is reported as unused', () => {
    const parts = {
      enums: { status: { permissible_values: { open: {}, closed: {} } } },
      classes: { Loan: {} },
    };
    expect(dropped(parts)).toEqual([
      { kind: 'unused_enum', element: 'status', detail: 'no attribute has it as its range' },
    ]);
    expect(formatDropped(dropped(parts))).toBe('Dropped: 1 unused enum.');
  });

  test('a permissible value with a body of its own is inlined by its key and reported', () => {
    const parts = {
      enums: {
        status: {
          description: 'how the loan stands',
          permissible_values: { open: { description: 'out on loan' }, closed: {} },
        },
      },
      classes: { Loan: { attributes: { status: { range: 'status' } } } },
    };
    expect(sketch(parts)).toBe('Loan\n  status: open|closed\n');
    expect(dropped(parts)).toEqual([
      {
        kind: 'enum_detail',
        element: 'status',
        detail: '`open` carries a body of its own; the enum carries `description`',
      },
    ]);
  });
});

describe('SPEC §8, the report', () => {
  test('every key the mapping does not carry is reported, once, on its element', () => {
    expect(
      dropped({
        classes: {
          Book: {
            is_a: 'Item',
            mixins: ['Trackable'],
            unique_keys: { k: { unique_key_slots: ['isbn'] } },
            slot_usage: { isbn: { pattern: '^9' }, title: {} },
            attributes: { isbn: { required: true, pattern: '^9', unit: { symbol: 'm' } } },
          },
        },
      }),
    ).toEqual([
      { kind: 'is_a', element: 'Book' },
      { kind: 'mixins', element: 'Book' },
      { kind: 'unique_keys', element: 'Book' },
      { kind: 'slot_usage', element: 'Book.isbn' },
      { kind: 'slot_usage', element: 'Book', detail: '`title` is inherited and not in the sketch' },
      { kind: 'required', element: 'Book.isbn' },
      { kind: 'pattern', element: 'Book.isbn' },
      { kind: 'unit', element: 'Book.isbn' },
    ]);
  });

  test('an annotation the mapping has no meaning for is reported by its tag', () => {
    expect(
      dropped({
        classes: {
          Book: {
            annotations: { owner: 'ops' },
            attributes: { isbn: { annotations: { pii: 'no' } } },
          },
        },
      }),
    ).toEqual([
      { kind: 'annotation', element: 'Book', detail: '`owner`' },
      { kind: 'annotation', element: 'Book.isbn', detail: '`pii`' },
    ]);
  });

  test('schema-level boilerplate is not reported; every other key at that level is', () => {
    expect(dropped({ classes: {}, settings: {}, subsets: {} })).toEqual([
      { kind: 'schema', element: 'foreign', detail: '`settings`' },
      { kind: 'schema', element: 'foreign', detail: '`subsets`' },
    ]);
    expect(formatDropped(dropped({ classes: {}, settings: {}, subsets: {} }))).toBe(
      'Dropped: 2 schema keys.',
    );
  });

  test('the reports are in schema order (working default D1)', () => {
    expect(
      dropped({
        enums: { e: { permissible_values: { a: { meaning: 'X:1' }, b: {} } } },
        classes: {
          Second: { is_a: 'First', attributes: { x: { range: 'e' } } },
          First: { mixins: ['M'] },
        },
        settings: {},
      }).map((d) => `${d.kind} ${d.element}`),
    ).toEqual(['is_a Second', 'mixins First', 'enum_detail e', 'schema foreign']);
  });
});

describe('SPEC §8, a key the table carries with a value the reader cannot use', () => {
  test('`identifier: yes` and `multivalued: yes` are reported, not read as booleans', () => {
    // `yes` is a boolean in YAML 1.1 and a string in the YAML 1.2 the `yaml`
    // package reads, so this reaches the projection from an ordinary schema.
    const schema = parseYaml(
      [
        'classes:',
        '  Book:',
        '    attributes:',
        '      isbn:',
        '        identifier: yes',
        '      subjects:',
        '        multivalued: yes',
        '',
      ].join('\n'),
    );
    const out = fromLinkML(schema);
    expect(out.source).toBe('Book\n  isbn\n  subjects\n');
    expect(out.dropped).toEqual([
      { kind: 'identifier', element: 'Book.isbn', detail: '`yes` is not a boolean' },
      { kind: 'multivalued', element: 'Book.subjects', detail: '`yes` is not a boolean' },
    ]);
  });

  test('`identifier: false` and `multivalued: false` are booleans and are not reported', () => {
    const parts = {
      classes: { Book: { attributes: { isbn: { identifier: false, multivalued: false } } } },
    };
    expect(sketch(parts)).toBe('Book\n  isbn\n');
    expect(dropped(parts)).toEqual([]);
  });

  test('a `range` that is not a string is reported and the field keeps no type', () => {
    const parts = { classes: { Book: { attributes: { pages: { range: 7 } } } } };
    expect(sketch(parts)).toBe('Book\n  pages\n');
    expect(dropped(parts)).toEqual([
      { kind: 'range', element: 'Book.pages', detail: '`7` is not a string' },
    ]);
  });

  test('an attribute whose body is not a slot definition is reported, like a class', () => {
    const parts = { classes: { Book: { attributes: { x: 7, title: {} } } } };
    expect(sketch(parts)).toBe('Book\n  title\n');
    expect(dropped(parts)).toEqual([
      { kind: 'slot', element: 'Book.x', detail: 'is not a slot definition' },
    ]);
  });

  test('a global slot whose body is not a slot definition is reported where it is listed', () => {
    const parts = { slots: { shelf: [1] }, classes: { Book: { slots: ['shelf'] } } };
    expect(sketch(parts)).toBe('Book\n');
    expect(dropped(parts)).toEqual([
      { kind: 'slot', element: 'Book.shelf', detail: 'is not a slot definition' },
    ]);
  });

  test('an attribute written with no body at all is a bare field, not a report', () => {
    const parts = { classes: { Book: { attributes: { isbn: null } } } };
    expect(sketch(parts)).toBe('Book\n  isbn\n');
    expect(dropped(parts)).toEqual([]);
  });

  test('`attributes` that is not a map and `slots` that is not a list are reported', () => {
    const parts = {
      classes: { A: { slots: 'not a list', attributes: null }, B: { attributes: 7 } },
    };
    expect(sketch(parts)).toBe('A\n\nB\n');
    expect(dropped(parts)).toEqual([
      { kind: 'slots', element: 'A', detail: '`not a list` is not a list' },
      { kind: 'attributes', element: 'B', detail: '`7` is not a map' },
    ]);
  });
});

describe('SPEC §8, the report as one line', () => {
  test('nothing dropped is an empty line', () => {
    expect(formatDropped([])).toBe('');
  });

  test('the counts are grouped by kind, in the order the kinds first appear', () => {
    const dropped: Dropped[] = [
      ...Array.from({ length: 4 }, (_, i) => ({ kind: 'is_a', element: `C${i}` })),
      ...Array.from({ length: 3 }, (_, i) => ({ kind: 'pattern', element: `C.f${i}` })),
      ...Array.from({ length: 2 }, (_, i) => ({ kind: 'mixins', element: `D${i}` })),
      ...Array.from({ length: 7 }, (_, i) => ({ kind: 'slot_usage', element: `E.f${i}` })),
    ];
    expect(formatDropped(dropped)).toBe(
      'Dropped: is_a on 4 classes, 3 patterns, 2 mixins, slot_usage on 7 slots.',
    );
  });

  test('a mixin class and a `mixins` reference are counted apart', () => {
    expect(
      formatDropped([
        { kind: 'mixin', element: 'Trackable' },
        { kind: 'mixins', element: 'Talk' },
      ]),
    ).toBe('Dropped: 1 mixin class, 1 mixin.');
  });

  test('an enum Skiss cannot write and one nothing uses are counted apart', () => {
    expect(
      formatDropped([
        { kind: 'enum', element: 'a' },
        { kind: 'unused_enum', element: 'b' },
        { kind: 'inlined', element: 'c' },
      ]),
    ).toBe('Dropped: 1 unwritable enum, 1 unused enum. Inlined: 1 enum.');
  });

  test('conversions and inlined enums are further sentences', () => {
    expect(
      formatDropped([
        { kind: 'renamed', element: 'Book' },
        { kind: 'pattern', element: 'Book.isbn' },
        { kind: 'inlined', element: 'status' },
        { kind: 'renamed', element: 'Book.pageCount' },
      ]),
    ).toBe('Dropped: 1 pattern. Renamed: 2 names. Inlined: 1 enum.');
  });
});

describe('AC1, the public API', () => {
  test('a projection is plain data and survives JSON.stringify', () => {
    const out = fromLinkML(schema({ classes: { Book: { attributes: { isbn: {} } } } }));
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  test('the schema `toLinkML` returns is what `fromLinkML` takes', () => {
    const typed: LinkMLSchema = {
      id: 'https://example.org/x',
      name: 'x',
      default_prefix: 'x',
      default_range: 'string',
      prefixes: {},
      imports: [],
      classes: { Book: { attributes: { isbn: { identifier: true } } } },
    };
    expect(fromLinkML(typed).source).toBe('Book\n  isbn*\n');
  });
});
