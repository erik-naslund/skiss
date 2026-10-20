import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { Document, TypeRef } from '../src/index.ts';
import { parse, toSkiss } from '../src/index.ts';

// Issue #45, AC2 and AC3. `spec-example.skiss` is written in the canonical
// format, so the printer must reproduce it byte for byte. The other three
// cannot be: `basic.skiss` writes one description on a continuation line,
// which the printer writes back on the element's own line (issue #90);
// `systems.skiss` has a column-0 comment that is not the document
// description; `broken.skiss` has lines that fail to parse. For those the
// document is the contract.

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const ALL = ['basic', 'spec-example', 'systems', 'broken', 'glossary'];

/**
 * A document with everything that is a source position removed: line numbers,
 * columns, the `Name` wrappers around them, the `written` alias a primitive
 * was typed as, and the diagnostic list. What is left is what the document
 * means, which is all a canonical printer can carry.
 */
function meaning(doc: Document) {
  return {
    description: doc.description,
    classes: classMeaning(doc),
  };
}

function classMeaning(doc: Document) {
  return doc.classes.map((cls) => ({
    name: cls.name.text,
    parent: cls.parent?.text,
    system: cls.system?.text,
    similarTo: cls.similarTo?.text,
    description: cls.description,
    note: cls.note,
    fields: cls.fields.map((field) => ({
      name: field.name.text,
      identifier: field.identifier,
      type: field.type === undefined ? undefined : typeMeaning(field.type),
      system: field.system?.text,
      joinsTo:
        field.joinsTo === undefined
          ? undefined
          : { className: field.joinsTo.className.text, fieldName: field.joinsTo.fieldName.text },
      description: field.description,
      note: field.note,
    })),
  }));
}

function typeMeaning(type: TypeRef) {
  switch (type.kind) {
    case 'primitive':
      return { kind: type.kind, name: type.name, many: type.many };
    case 'class':
    case 'unknown':
      return { kind: type.kind, name: type.name.text, many: type.many };
    case 'enum':
      return { kind: type.kind, values: type.values.map((v) => v.text), many: type.many };
  }
}

describe.each(['spec-example'])('%s.skiss (AC2)', (name) => {
  test(`toSkiss(parse(${name}.skiss)) equals ${name}.skiss byte for byte`, () => {
    expect(toSkiss(parse(fixture(`${name}.skiss`)))).toBe(fixture(`${name}.skiss`));
  });
});

describe.each(['basic', 'systems', 'broken', 'glossary'])('%s.skiss (AC2)', (name) => {
  test('parse(toSkiss(parse(x))) is parse(x) without positions and diagnostics', () => {
    const doc = parse(fixture(`${name}.skiss`));
    expect(meaning(parse(toSkiss(doc)))).toEqual(meaning(doc));
  });

  test('the reprinted document parses without errors', () => {
    expect(parse(toSkiss(parse(fixture(`${name}.skiss`)))).diagnostics).toEqual([]);
  });
});

describe.each(ALL)('%s.skiss (AC3)', (name) => {
  test('toSkiss(parse(toSkiss(doc))) equals toSkiss(doc)', () => {
    const once = toSkiss(parse(fixture(`${name}.skiss`)));
    expect(toSkiss(parse(once))).toBe(once);
  });
});
