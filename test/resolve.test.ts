import { describe, expect, test } from 'vitest';
import type { Diagnostic, Document, ResolvedDocument } from '../src/index.ts';
import { parse, resolve } from '../src/index.ts';

// Issue #4: the cross-line pass. SPEC §3.2, §3.8, §7 and ADR 0004. The
// fixtures cover which line each warning lands on; these cover the rules the
// fixtures express badly: purity, idempotence, column ranges, messages, the
// working defaults D1 to D5 and the `undeclared` list.

const warnings = (doc: Document): Diagnostic[] =>
  doc.diagnostics.filter((d) => d.severity === 'warning');

const codes = (doc: Document): string[] => warnings(doc).map((d) => d.code);

describe('resolve is pure and idempotent (AC1)', () => {
  const source = 'Ship\n  id*\n  code*\n  crew: Person\n  size: itn\nShip\n  id*\n';

  test('does not mutate its input and returns a new document', () => {
    const doc = parse(source);
    const before = JSON.parse(JSON.stringify(doc));
    const out = resolve(doc);
    expect(out).not.toBe(doc);
    expect(doc).toEqual(before);
    // Nothing in the output is shared with the input.
    expect(out.classes[0]).not.toBe(doc.classes[0]);
    expect(out.classes[0]?.fields[0]).not.toBe(doc.classes[0]?.fields[0]);
    expect(out.diagnostics).not.toBe(doc.diagnostics);
  });

  test('resolve(resolve(d)) deep-equals resolve(d)', () => {
    const once = resolve(parse(source));
    const twice = resolve(once);
    expect(twice).toEqual(once);
    expect(codes(once)).toEqual([
      'W_MULTIPLE_IDENTIFIERS',
      'W_UNDECLARED_CLASS',
      'W_UNKNOWN_TYPE',
      'W_DUPLICATE_CLASS',
    ]);
  });

  test('never removes a node or an existing diagnostic', () => {
    const doc = parse('  orphan\nShip\n  crew:\n  x: y\n');
    const out = resolve(doc);
    expect(out.classes.map((c) => c.name.text)).toEqual(['Ship']);
    expect(out.diagnostics.slice(0, 2)).toEqual(doc.diagnostics);
    expect(codes(out)).toEqual(['W_UNKNOWN_TYPE']);
  });

  test('the resolved document is plain data', () => {
    const out = resolve(parse(source));
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  test('a deep-frozen input resolves without throwing, to a new, correct document', () => {
    const doc = deepFreeze(parse(source));
    const expected = resolve(parse(source));
    let out: ResolvedDocument | undefined;
    expect(() => {
      out = resolve(doc);
    }).not.toThrow();
    expect(out).not.toBe(doc);
    expect(out).toEqual(expected);
    expect(doc.classes[0]?.fields[1]?.identifier).toBe(true);
    expect(out?.classes[0]?.fields[1]?.identifier).toBe(false);
  });

  test('an input wrapped in a Proxy with a get trap resolves without throwing', () => {
    const doc = deepProxy(parse(source));
    const expected = resolve(parse(source));
    let out: ResolvedDocument | undefined;
    expect(() => {
      out = resolve(doc);
    }).not.toThrow();
    expect(out).not.toBe(doc);
    expect(out).toEqual(expected);
    // The output is plain: nothing in it is the wrapper or read through it.
    expect(JSON.parse(JSON.stringify(out))).toEqual(expected);
  });
});

function deepFreeze<T extends object>(value: T): T {
  for (const v of Object.values(value)) {
    if (typeof v === 'object' && v !== null) deepFreeze(v);
  }
  return Object.freeze(value);
}

// The shape an editor's reactive store gives a document: every object read
// through the wrapper is itself wrapped. `structuredClone` throws on it.
function deepProxy<T extends object>(value: T): T {
  return new Proxy(value, {
    get(target, property, receiver) {
      const v: unknown = Reflect.get(target, property, receiver);
      return typeof v === 'object' && v !== null ? deepProxy(v) : v;
    },
  });
}

describe('an empty document', () => {
  test('zero classes resolves to zero diagnostics and an empty `undeclared`', () => {
    expect(resolve(parse(''))).toEqual({ classes: [], diagnostics: [], undeclared: [] });
    expect(resolve(parse('# only a comment\n\n'))).toEqual({
      classes: [],
      diagnostics: [],
      undeclared: [],
    });
  });
});

describe('W_UNKNOWN_TYPE (SPEC §3.2, AC3)', () => {
  test('suggests a primitive within Levenshtein distance 2', () => {
    const out = resolve(parse('Ship\n  crewSize: itn'));
    expect(warnings(out)).toEqual([
      {
        severity: 'warning',
        code: 'W_UNKNOWN_TYPE',
        message: 'unknown type `itn`, did you mean `int`?',
        line: 2,
        col: 12,
        end: 15,
      },
    ]);
  });

  test('suggests an accepted alias when it is the closest word', () => {
    expect(warnings(resolve(parse('Ship\n  n: intger')))[0]?.message).toBe(
      'unknown type `intger`, did you mean `integer`?',
    );
    expect(warnings(resolve(parse('Ship\n  n: strin')))[0]?.message).toBe(
      'unknown type `strin`, did you mean `string`?',
    );
  });

  test('on equal distance the candidate sharing the longest prefix wins', () => {
    // `flt` is two edits from both `int` and `float`; the shared `fl` decides.
    expect(warnings(resolve(parse('Ship\n  mass: flt')))[0]?.message).toBe(
      'unknown type `flt`, did you mean `float`?',
    );
    expect(warnings(resolve(parse('Ship\n  mass: flot')))[0]?.message).toBe(
      'unknown type `flot`, did you mean `float`?',
    );
    // `booln` is one edit from `bool` and two from `boolean`: distance wins.
    expect(warnings(resolve(parse('Ship\n  ok: booln')))[0]?.message).toBe(
      'unknown type `booln`, did you mean `bool`?',
    );
  });

  test('says the field is treated as string when nothing is close', () => {
    expect(warnings(resolve(parse('Ship\n  n: kilograms')))[0]?.message).toBe(
      'unknown type `kilograms`, treated as `string`',
    );
    // `xyz` is three edits from `int` and `uri`: outside the limit, no suggestion.
    expect(warnings(resolve(parse('Ship\n  n: xyz')))[0]?.message).toBe(
      'unknown type `xyz`, treated as `string`',
    );
    expect(warnings(resolve(parse('Ship\n  n: inte')))[0]?.message).toBe(
      'unknown type `inte`, did you mean `int`?',
    );
  });

  test('the column range is the type word, not the `[]`', () => {
    const [w] = warnings(resolve(parse('Ship\n  tags: lable[]')));
    expect(w).toMatchObject({ code: 'W_UNKNOWN_TYPE', col: 8, end: 13 });
  });

  test('leaves the unknown type node in place', () => {
    const out = resolve(parse('Ship\n  crewSize: itn'));
    expect(out.classes[0]?.fields[0]?.type).toMatchObject({ kind: 'unknown', many: false });
  });
});

describe('W_UNDECLARED_CLASS and `undeclared` (SPEC §3.2, AC4)', () => {
  test('`: X`, `~ X` and `= X.f` each warn on the class name token', () => {
    const out = resolve(parse('Page ~ Ghost\n  owner: Person\n  ref = Thing.id\n'));
    expect(warnings(out)).toEqual([
      {
        severity: 'warning',
        code: 'W_UNDECLARED_CLASS',
        message: 'class `Ghost` is not declared',
        line: 1,
        col: 7,
        end: 12,
      },
      {
        severity: 'warning',
        code: 'W_UNDECLARED_CLASS',
        message: 'class `Person` is not declared',
        line: 2,
        col: 9,
        end: 15,
      },
      {
        severity: 'warning',
        code: 'W_UNDECLARED_CLASS',
        message: 'class `Thing` is not declared',
        line: 3,
        col: 8,
        end: 13,
      },
    ]);
  });

  test('`undeclared` lists each name once, in first-reference order, with its first position', () => {
    const out = resolve(parse('A\n  x: Ghost[]\n  y = Thing.id\n  z: Ghost\nB ~ Thing\n'));
    expect(out.undeclared).toEqual([
      { text: 'Ghost', line: 2, col: 5, end: 10 },
      { text: 'Thing', line: 3, col: 6, end: 11 },
    ]);
    expect(codes(out)).toEqual([
      'W_UNDECLARED_CLASS',
      'W_UNDECLARED_CLASS',
      'W_UNDECLARED_CLASS',
      'W_UNDECLARED_CLASS',
    ]);
  });

  test('a forward reference is declared', () => {
    const out = resolve(parse('A\n  b: B\nB\n  a: A\n'));
    expect(out.diagnostics).toEqual([]);
    expect(out.undeclared).toEqual([]);
  });

  test('a capitalised primitive is hinted: `: Int` suggests `int` (issue #40)', () => {
    const [w] = warnings(resolve(parse('Team\n  players: Int\n')));
    expect(w).toEqual({
      severity: 'warning',
      code: 'W_UNDECLARED_CLASS',
      message: 'class `Int` is not declared. Did you mean `int`?',
      line: 2,
      col: 11,
      end: 14,
    });
  });

  test('the hint names the alias as written: `: Boolean` suggests `boolean` (issue #40)', () => {
    const [w] = warnings(resolve(parse('Team\n  active: Boolean\n')));
    expect(w).toMatchObject({
      code: 'W_UNDECLARED_CLASS',
      message: 'class `Boolean` is not declared. Did you mean `boolean`?',
    });
  });

  test('a class name that is not a primitive keeps the plain message (issue #40)', () => {
    const [w] = warnings(resolve(parse('Ship\n  homeworld: Planet\n')));
    expect(w).toMatchObject({
      code: 'W_UNDECLARED_CLASS',
      message: 'class `Planet` is not declared',
    });
  });

  test('a name that only inherits from Object keeps the plain message (issue #40)', () => {
    const [w] = warnings(resolve(parse('Ship\n  builder: Constructor\n')));
    expect(w).toMatchObject({
      code: 'W_UNDECLARED_CLASS',
      message: 'class `Constructor` is not declared',
    });
  });

  test('a hinted reference still falls back to a placeholder class (issue #40)', () => {
    const out = resolve(parse('Team\n  players: Int\n'));
    expect(out.undeclared).toEqual([{ text: 'Int', line: 2, col: 11, end: 14 }]);
    expect(out.classes[0]?.fields[0]?.type).toMatchObject({ kind: 'class', many: false });
  });

  test('D2: `= X.f` with X undeclared is W_UNDECLARED_CLASS only', () => {
    expect(codes(resolve(parse('A\n  x = Ghost.id\n')))).toEqual(['W_UNDECLARED_CLASS']);
  });

  test('D3: `~` to the class itself is not a warning', () => {
    const out = resolve(parse('A ~ A\n  id*\n'));
    expect(out.diagnostics).toEqual([]);
    expect(out.undeclared).toEqual([]);
  });

  test('`: Self` and `= Self.x` on the class itself are declared references', () => {
    const out = resolve(
      parse('Node\n  id*\n  parent: Node\n  children: Node[]\n  root = Node.id\n'),
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.undeclared).toEqual([]);
  });

  test('`= Self.x` where the class itself has no x is W_UNDECLARED_FIELD only', () => {
    expect(codes(resolve(parse('Node\n  id*\n  root = Node.key\n')))).toEqual([
      'W_UNDECLARED_FIELD',
    ]);
  });
});

describe('W_UNDECLARED_FIELD (AC2)', () => {
  test('`= X.f` where X exists but has no f warns on the field name token', () => {
    const out = resolve(parse('Person\n  id*\nPage\n  ref = Person.fullName\n'));
    expect(warnings(out)).toEqual([
      {
        severity: 'warning',
        code: 'W_UNDECLARED_FIELD',
        message: 'class `Person` has no field `fullName`',
        line: 4,
        col: 15,
        end: 23,
      },
    ]);
  });

  test('a field on any declaration of a duplicated class counts', () => {
    const out = resolve(parse('Person\n  id*\nPage\n  ref = Person.email\nPerson\n  email\n'));
    expect(codes(out)).toEqual(['W_DUPLICATE_CLASS']);
  });
});

describe('W_DUPLICATE_CLASS and W_DUPLICATE_FIELD (D1)', () => {
  test('the later class is kept and carries the warning on its name', () => {
    const out = resolve(parse('Person\n  id*\nPerson\n  email\nPerson\n'));
    expect(out.classes.map((c) => c.line)).toEqual([1, 3, 5]);
    expect(warnings(out)).toEqual([
      {
        severity: 'warning',
        code: 'W_DUPLICATE_CLASS',
        message: 'class `Person` is already declared on line 1',
        line: 3,
        col: 0,
        end: 6,
      },
      {
        severity: 'warning',
        code: 'W_DUPLICATE_CLASS',
        message: 'class `Person` is already declared on line 1',
        line: 5,
        col: 0,
        end: 6,
      },
    ]);
  });

  test('the later field is kept and carries the warning on its name', () => {
    const out = resolve(parse('Ship\n  name\n  crew: int\n  name: string\n'));
    expect(out.classes[0]?.fields.map((f) => f.line)).toEqual([2, 3, 4]);
    expect(warnings(out)).toEqual([
      {
        severity: 'warning',
        code: 'W_DUPLICATE_FIELD',
        message: 'field `name` is already declared on line 2 in class `Ship`',
        line: 4,
        col: 2,
        end: 6,
      },
    ]);
  });

  test('the same field name in two classes is not a duplicate', () => {
    expect(resolve(parse('A\n  name\nB\n  name\n')).diagnostics).toEqual([]);
  });
});

describe('W_MULTIPLE_IDENTIFIERS (SPEC §3.8, AC5)', () => {
  test('every `*` after the first is reported on the `*` and its flag cleared', () => {
    const doc = parse('Ship\n  id*\n  name\n  code*\n  serial*\n');
    const out = resolve(doc);
    expect(warnings(out)).toEqual([
      {
        severity: 'warning',
        code: 'W_MULTIPLE_IDENTIFIERS',
        message: '`*` on `code` is ignored: class `Ship` already has the identifier `id` on line 2',
        line: 4,
        col: 6,
        end: 7,
      },
      {
        severity: 'warning',
        code: 'W_MULTIPLE_IDENTIFIERS',
        message:
          '`*` on `serial` is ignored: class `Ship` already has the identifier `id` on line 2',
        line: 5,
        col: 8,
        end: 9,
      },
    ]);
    expect(out.classes[0]?.fields.map((f) => f.identifier)).toEqual([true, false, false, false]);
    // The input keeps its flags: resolve is pure.
    expect(doc.classes[0]?.fields.map((f) => f.identifier)).toEqual([true, false, true, true]);
  });

  test('one identifier per class node: a duplicated class may have its own', () => {
    const out = resolve(parse('A\n  id*\nA\n  key*\n'));
    expect(codes(out)).toEqual(['W_DUPLICATE_CLASS']);
    expect(out.classes.map((c) => c.fields[0]?.identifier)).toEqual([true, true]);
  });
});

describe('diagnostic order (AC6)', () => {
  test('warnings are merged into line order; on one line, errors come first', () => {
    const out = resolve(parse('  orphan\nA\n  x: y\n  y:\nB\n  z: y\n'));
    expect(out.diagnostics.map((d) => [d.line, d.code])).toEqual([
      [1, 'E_FIELD_WITHOUT_CLASS'],
      [3, 'W_UNKNOWN_TYPE'],
      [4, 'E_MISSING_TYPE'],
      [6, 'W_UNKNOWN_TYPE'],
    ]);
  });

  test('two warnings on one line keep field order: name, `*`, type, `=`', () => {
    const out = resolve(parse('A\n  id*\n  id*: itn = Ghost.x\n'));
    expect(out.diagnostics.map((d) => d.code)).toEqual([
      'W_DUPLICATE_FIELD',
      'W_MULTIPLE_IDENTIFIERS',
      'W_UNKNOWN_TYPE',
      'W_UNDECLARED_CLASS',
    ]);
  });
});
