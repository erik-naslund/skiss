import { describe, expect, it } from 'vitest';
import { tokenizeLine } from '../src/index.ts';

/**
 * A line as the tokenizer reads it: every token as `kind(text)`, in order. The
 * text rather than the offsets, so a case says what it means; `offsets` below
 * is where the numbers themselves are checked.
 */
function reading(line: string): string[] {
  return tokenizeLine(line).map((token) => `${token.kind}(${line.slice(token.from, token.to)})`);
}

describe('the line shapes of the SPEC', () => {
  it.each([
    ['a bare class line', 'Character', ['class(Character)']],
    [
      'a class with a system',
      'Character @Catalog',
      ['class(Character)', 'operator(@)', 'system(Catalog)'],
    ],
    [
      'a class related to another',
      'CharacterPage @Community ~ Character',
      [
        'class(CharacterPage)',
        'operator(@)',
        'system(Community)',
        'operator(~)',
        'class(Character)',
      ],
    ],
    ['a field with no type', '  name', ['field(name)']],
    ['the identifier', '  id*', ['field(id)', 'marker(*)']],
    ['a primitive', '  crewSize: int', ['field(crewSize)', 'operator(:)', 'primitive(int)']],
    [
      'an alias for a primitive',
      '  summary: text',
      ['field(summary)', 'operator(:)', 'primitive(text)'],
    ],
    [
      'a reference to a class',
      '  homeworld: Planet',
      ['field(homeworld)', 'operator(:)', 'class(Planet)'],
    ],
    [
      'many of a class',
      '  films: Film[]',
      ['field(films)', 'operator(:)', 'class(Film)', 'operator([])'],
    ],
    [
      'many of a primitive',
      '  tags: string[]',
      ['field(tags)', 'operator(:)', 'primitive(string)', 'operator([])'],
    ],
    [
      'an inline enum',
      '  climate: arid|temperate|frozen',
      [
        'field(climate)',
        'operator(:)',
        'enum(arid)',
        'operator(|)',
        'enum(temperate)',
        'operator(|)',
        'enum(frozen)',
      ],
    ],
    [
      'an enum of digits, which is not a number',
      '  priority: 1|2|3',
      [
        'field(priority)',
        'operator(:)',
        'enum(1)',
        'operator(|)',
        'enum(2)',
        'operator(|)',
        'enum(3)',
      ],
    ],
    [
      'many of an enum',
      '  tags: red|green|blue[]',
      [
        'field(tags)',
        'operator(:)',
        'enum(red)',
        'operator(|)',
        'enum(green)',
        'operator(|)',
        'enum(blue)',
        'operator([])',
      ],
    ],
    [
      'a field with its own system',
      '  popularityRank: int @Community',
      [
        'field(popularityRank)',
        'operator(:)',
        'primitive(int)',
        'operator(@)',
        'system(Community)',
      ],
    ],
    [
      'a join',
      '  characterId = Character.id',
      ['field(characterId)', 'operator(=)', 'class(Character)', 'operator(.)', 'field(id)'],
    ],
    ['a comment line at column 0', '# a note to a reader', ['comment(# a note to a reader)']],
    [
      'a description',
      '  summary   # free text, written by editors',
      ['field(summary)', 'description(# free text, written by editors)'],
    ],
    [
      'a doubt',
      '  crewSize: int   ? is this seats or minimum crew',
      [
        'field(crewSize)',
        'operator(:)',
        'primitive(int)',
        'doubt(? is this seats or minimum crew)',
      ],
    ],
    [
      'a description and a doubt, the description first',
      '  homeworld: Planet   # where were they born? ? confirm with archivists',
      [
        'field(homeworld)',
        'operator(:)',
        'class(Planet)',
        'description(# where were they born?)',
        'doubt(? confirm with archivists)',
      ],
    ],
    [
      'a `?` attached to a word, which is ordinary text',
      '  crewSize: int   # is this seats?',
      ['field(crewSize)', 'operator(:)', 'primitive(int)', 'description(# is this seats?)'],
    ],
    [
      'whitespace that is not significant',
      '  name : int',
      ['field(name)', 'operator(:)', 'primitive(int)'],
    ],
    ['no whitespace at all', '  name:int', ['field(name)', 'operator(:)', 'primitive(int)']],
    ['a tab for the indentation', '\tname: int', ['field(name)', 'operator(:)', 'primitive(int)']],
  ])('reads %s', (_name, line, expected) => {
    expect(reading(line)).toEqual(expected);
  });

  it.each([
    ['a blank line', ''],
    ['a line of whitespace', '   '],
  ])('has nothing to say about %s', (_name, line) => {
    expect(tokenizeLine(line)).toEqual([]);
  });
});

describe('a line that is still being typed', () => {
  it.each([
    ['a colon with nothing after it', '  name:', ['field(name)', 'operator(:)']],
    ['half a field name', '  na', ['field(na)']],
    ['an unclosed `[`', '  films: Film[', ['field(films)', 'operator(:)', 'class(Film)']],
    [
      'an enum with its second value still to come',
      '  climate: arid|',
      ['field(climate)', 'operator(:)', 'enum(arid)', 'operator(|)'],
    ],
    ['an `@` with nothing after it', 'Character @', ['class(Character)', 'operator(@)']],
    ['a `~` with nothing after it', 'Character ~', ['class(Character)', 'operator(~)']],
    [
      'half a join',
      '  characterId = Character.',
      ['field(characterId)', 'operator(=)', 'class(Character)', 'operator(.)'],
    ],
  ])('colours what is there and no more: %s', (_name, line, expected) => {
    expect(reading(line)).toEqual(expected);
  });

  it.each([
    ['a lowercase word at column 0', 'character'],
    ['a capitalised field name', '  Name'],
    ['a line of punctuation', '  ---'],
  ])('leaves %s alone for the compiler to report', (_name, line) => {
    expect(tokenizeLine(line)).toEqual([]);
  });

  it('is generous about the order of the modifiers, which the compiler is not', () => {
    // SPEC §4 fixes the order; a colour that moved while the rest of the line
    // was typed would be worse than one that is early.
    expect(reading('  name @Catalog: int')).toEqual([
      'field(name)',
      'operator(@)',
      'system(Catalog)',
      'operator(:)',
      'primitive(int)',
    ]);
  });

  it('says nothing about a name that is spelled wrong', () => {
    // `Int` is a primitive written with a capital: the compiler says which one
    // was meant, and the tokenizer reads it as the class reference it is.
    expect(reading('  crewSize: Int')).toEqual(['field(crewSize)', 'operator(:)', 'class(Int)']);
    expect(reading('  crewSize: crewsize')).toEqual([
      'field(crewSize)',
      'operator(:)',
      'type(crewsize)',
    ]);
  });
});

describe('offsets', () => {
  it('counts from the start of the line, with the indentation in', () => {
    expect(tokenizeLine('    id*')).toEqual([
      { kind: 'field', from: 4, to: 6 },
      { kind: 'marker', from: 6, to: 7 },
    ]);
  });

  it('leaves trailing whitespace out of the last token', () => {
    expect(tokenizeLine('Character   ')).toEqual([{ kind: 'class', from: 0, to: 9 }]);
    expect(tokenizeLine('Character  # a droid   ')).toEqual([
      { kind: 'class', from: 0, to: 9 },
      { kind: 'description', from: 11, to: 20 },
    ]);
  });

  it('never overlaps, and only ever moves forward', () => {
    const line = '  characterId = Character.id   # the join   ? is it the right one';
    let previous = 0;
    for (const token of tokenizeLine(line)) {
      expect(token.from).toBeGreaterThanOrEqual(previous);
      expect(token.to).toBeGreaterThan(token.from);
      previous = token.to;
    }
  });
});
