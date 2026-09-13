import { describe, expect, test } from 'vitest';
import { parse } from '../src/index.ts';

// SPEC §3.9, Delimiting. A description starts at the first `#` preceded by
// whitespace. A doubt starts at the first `?` with whitespace before it and
// whitespace or end of line after it. A `?` attached to a word is text.

function field(line: string) {
  const doc = parse(`Thing\n  ${line}`);
  expect(doc.diagnostics).toEqual([]);
  const f = doc.classes[0]?.fields[0];
  if (!f) throw new Error('no field parsed');
  return { description: f.description, note: f.note };
}

describe('trailer delimiting (SPEC §3.9)', () => {
  test('`#` starts a description', () => {
    expect(field('summary                # free text, written by editors')).toEqual({
      description: 'free text, written by editors',
      note: undefined,
    });
  });

  test('`?` starts a doubt', () => {
    expect(field('crewSize: int          ? is this seats or minimum crew')).toEqual({
      description: undefined,
      note: 'is this seats or minimum crew',
    });
  });

  test('when both appear, the description comes first and the doubt ends it', () => {
    expect(
      field('climate: arid|frozen   # how habitable it is   ? "temperate" was contested'),
    ).toEqual({ description: 'how habitable it is', note: '"temperate" was contested' });
  });

  test('a `?` attached to a word is text; the standalone one after it is the doubt', () => {
    expect(field('homeworld: Planet   # where were they born? ? confirm with archivists')).toEqual({
      description: 'where were they born?',
      note: 'confirm with archivists',
    });
  });

  test('a description ending in `?` has no doubt', () => {
    expect(field('crewSize: int       # is this seats?')).toEqual({
      description: 'is this seats?',
      note: undefined,
    });
  });

  test('`# see #42 ? really`: a second `#` is text and the doubt still ends the description', () => {
    expect(field('name # see #42 ? really')).toEqual({ description: 'see #42', note: 'really' });
  });

  test('`? see #42`: a `#` after the doubt has started is text', () => {
    expect(field('name ? see #42')).toEqual({ description: undefined, note: 'see #42' });
  });

  test('`name # what?`: a glued `?` is text', () => {
    expect(field('name # what?')).toEqual({ description: 'what?', note: undefined });
  });

  test('the same rule applies to class lines', () => {
    const doc = parse(
      "CharacterPage @Community ~ Character    # the community wiki's version ? sure",
    );
    expect(doc.diagnostics).toEqual([]);
    expect(doc.classes[0]?.description).toBe("the community wiki's version");
    expect(doc.classes[0]?.note).toBe('sure');
  });

  test('tabs count as whitespace around the markers', () => {
    expect(field('name\t#\tdesc\t?\tdoubt')).toEqual({ description: 'desc', note: 'doubt' });
  });

  test('a `#` or `?` glued to the head is not a trailer, so the line is an error', () => {
    expect(parse('Thing\n  name#x').diagnostics.map((d) => d.code)).toEqual(['E_UNPARSABLE']);
    expect(parse('Thing\n  region?').diagnostics.map((d) => d.code)).toEqual(['E_UNPARSABLE']);
  });

  test('a marker with no text after it adds nothing', () => {
    expect(field('name #')).toEqual({ description: undefined, note: undefined });
    expect(field('name ?')).toEqual({ description: undefined, note: undefined });
  });
});
