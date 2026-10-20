import { describe, expect, test } from 'vitest';
import { parse, resolve, toLinkML, toMermaid, toSkiss } from '../src/index.ts';

// SPEC §3.1 and §3.9, issue #90. A trailer may stand on indented lines of its
// own under the class or field it belongs to, and the comment block at the
// top of a file describes the document.

// The example of issue #90, verbatim.
const PLAYER = [
  'Player @Game',
  '  # The person holding the controller ? or should it be joystick?',
  '  # even when the same human plays two seats. ? how does that work? Same human in two places?',
  '  name',
  '  score: int',
  '    # as shown on the scoreboard, after penalties',
  '',
].join('\n');

const first = (source: string) => parse(source).classes[0];

describe('continuation lines (SPEC §3.9, AC1)', () => {
  const doc = parse(PLAYER);
  const player = doc.classes[0];

  test('the example parses with no diagnostics', () => {
    expect(doc.diagnostics).toEqual([]);
    expect(resolve(doc).diagnostics).toEqual([]);
  });

  test('the descriptions of one element join with a single space, in source order', () => {
    expect(player?.description).toBe(
      'The person holding the controller even when the same human plays two seats.',
    );
  });

  test('the doubts of one element are kept apart, one line each', () => {
    expect(player?.note).toBe(
      'or should it be joystick?\nhow does that work? Same human in two places?',
    );
  });

  test('a continuation line under a field continues the field, not the class', () => {
    expect(player?.fields[1]?.description).toBe('as shown on the scoreboard, after penalties');
    expect(player?.fields[0]?.description).toBeUndefined();
  });

  test('the description on the element line comes first', () => {
    expect(first('A  # one\n  # two\n')?.description).toBe('one two');
    expect(first('A\n  x  # one\n    # two\n')?.fields[0]?.description).toBe('one two');
  });

  test('a continuation line is delimited as a trailer is (SPEC §3.9)', () => {
    expect(first('A\n  ? a doubt\n')).toMatchObject({ note: 'a doubt' });
    expect(first('A\n  # text ? doubt\n')).toMatchObject({ description: 'text', note: 'doubt' });
    // A `?` attached to a word is ordinary text, and a `#` after the doubt
    // started is text too.
    expect(first('A\n  # really?\n')).toMatchObject({ description: 'really?' });
    expect(first('A\n  ? see #42\n')).toMatchObject({ note: 'see #42' });
  });

  test('a bare marker adds nothing, as it does on the element line', () => {
    const cls = first('A\n  #\n  ?\n');
    expect(cls?.description).toBeUndefined();
    expect(cls?.note).toBeUndefined();
    expect(parse('A\n  #\n  ?\n').diagnostics).toEqual([]);
  });

  test('a `?` attached to a word is a field line, with the message it always had', () => {
    const [d] = parse('A\n  ?doubt\n').diagnostics;
    expect(d?.code).toBe('E_UNPARSABLE');
    expect(d?.message).toContain('a doubt needs whitespace before `?` and after it');
  });

  test('a column-0 comment between does not break the attachment', () => {
    expect(first('A\n  x\n# a comment\n    # the description of x\n')?.fields[0]?.description).toBe(
      'the description of x',
    );
  });

  test('`--notes` draws one note per doubt line (AC1)', () => {
    const mermaid = toMermaid(resolve(parse(PLAYER)), { notes: true });
    expect(mermaid.split('\n').filter((line) => line.includes('note for Player'))).toEqual([
      '  note for Player "or should it be joystick?"',
      '  note for Player "how does that work? Same human in two places?"',
    ]);
  });

  test('the doubts of one element are one `note` annotation of two lines', () => {
    const schema = toLinkML(parse(PLAYER), { schemaName: 'player' });
    expect(schema.classes?.Player?.annotations?.note).toBe(
      'or should it be joystick?\nhow does that work? Same human in two places?',
    );
  });
});

describe('a continuation line with nothing above it (AC3)', () => {
  test('is one E_UNPARSABLE with the message of issue #90, and nothing else', () => {
    const doc = parse('  # a description that belongs to nothing\n');
    expect(doc.classes).toEqual([]);
    expect(doc.diagnostics).toEqual([
      {
        severity: 'error',
        code: 'E_UNPARSABLE',
        message: 'A description line needs a class or a field above it',
        line: 1,
        col: 2,
        end: 41,
      },
    ]);
  });

  test('a comment at column 0 is not something to continue', () => {
    const doc = parse('# a comment\n\n# another\n  # a description\n');
    expect(doc.diagnostics.map((d) => [d.code, d.line])).toEqual([['E_UNPARSABLE', 4]]);
  });

  test('under a class line that failed at its name it is dropped in silence', () => {
    // One bad name is one diagnostic (issue #77): the fields under it are
    // dropped with it, and so is a continuation line.
    expect(parse('port @Registry\n  # a description\n  x\n').diagnostics).toHaveLength(1);
  });

  test('after a class line that failed elsewhere there is nothing to continue', () => {
    const codes = parse('A ~\n  # a description\n').diagnostics.map((d) => d.code);
    expect(codes).toEqual(['E_UNPARSABLE', 'E_UNPARSABLE']);
  });
});

describe('the document description (SPEC §3.1, AC2)', () => {
  const source = '# What this sketch is about,\n# in two lines.\n\nA\n  x\n';

  test('the run of comment lines at the top joins with a single space', () => {
    expect(parse(source).description).toBe('What this sketch is about, in two lines.');
  });

  test('the run ends at the first line that is not a comment', () => {
    expect(parse('# one\n\n# two\nA\n').description).toBe('one');
    expect(parse('# one\nA  # two\n# three\n').description).toBe('one');
  });

  test('a file that does not start with a comment line has none', () => {
    expect(parse('\n# not the first line\nA\n').description).toBeUndefined();
    expect(parse('A\n# a comment\n').description).toBeUndefined();
  });

  test('a `#` with nothing after it adds nothing', () => {
    expect(parse('#\n#\nA\n').description).toBeUndefined();
    expect(parse('# one\n#\n# two\nA\n').description).toBe('one two');
  });

  test('it compiles to the schema `description`, directly after `name`', () => {
    const schema = toLinkML(parse(source), { schemaName: 'sketch' });
    expect(schema.description).toBe('What this sketch is about, in two lines.');
    expect(Object.keys(schema).slice(0, 3)).toEqual(['id', 'name', 'description']);
  });

  test('a sketch without one writes no `description` key at all', () => {
    expect(toLinkML(parse('A\n  x\n'), { schemaName: 'sketch' }).description).toBeUndefined();
  });

  test('`toSkiss` writes it back as one `#` line at the top (AC2)', () => {
    expect(toSkiss(parse(source))).toBe('# What this sketch is about, in two lines.\n\nA\n  x\n');
  });
});
