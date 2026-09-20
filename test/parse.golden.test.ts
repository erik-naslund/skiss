import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parse, resolve } from '../src/index.ts';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('basic.skiss (SPEC §2)', () => {
  const doc = parse(fixture('basic.skiss'));

  test('parses to basic.ast.json with zero diagnostics', () => {
    expect(doc.diagnostics).toEqual([]);
    const golden = JSON.parse(fixture('basic.ast.json'));
    expect(JSON.parse(JSON.stringify(doc))).toEqual(golden);
  });

  test('resolves with zero warnings and no undeclared classes', () => {
    const resolved = resolve(doc);
    expect(resolved.diagnostics).toEqual([]);
    expect(resolved.undeclared).toEqual([]);
  });
});

describe('systems.skiss (fixtures/README.md)', () => {
  const doc = parse(fixture('systems.skiss'));

  test('parses with zero diagnostics and resolves with zero warnings', () => {
    expect(doc.diagnostics).toEqual([]);
    const resolved = resolve(doc);
    expect(resolved.diagnostics).toEqual([]);
    expect(resolved.undeclared).toEqual([]);
  });
});

describe('broken.skiss (ARCHITECTURE.md diagnostics table)', () => {
  const doc = parse(fixture('broken.skiss'));

  test('yields exactly the error entries of broken.diagnostics.json, in line order', () => {
    const golden = JSON.parse(fixture('broken.diagnostics.json')) as {
      diagnostics: { code: string; severity: string; line: number }[];
    };
    // Every error but one comes from `parse`: a circle of `<` needs more
    // than one line to see, so `resolve` is where it is found (SPEC §7).
    const expected = golden.diagnostics.filter(
      (d) => d.severity === 'error' && d.code !== 'E_INHERITANCE_CYCLE',
    );
    const actual = doc.diagnostics.map(({ code, severity, line }) => ({ code, severity, line }));
    expect(actual).toEqual(expected);
  });

  test('resolve yields exactly broken.diagnostics.json: errors and warnings, in line order', () => {
    const golden = JSON.parse(fixture('broken.diagnostics.json')) as {
      diagnostics: { code: string; severity: string; line: number }[];
    };
    const resolved = resolve(doc);
    const actual = resolved.diagnostics.map(({ code, severity, line }) => ({
      code,
      severity,
      line,
    }));
    expect(actual).toEqual(golden.diagnostics);
  });

  test('every diagnostic, resolved included, carries a message and a column range', () => {
    for (const d of resolve(doc).diagnostics) {
      expect(d.message).not.toBe('');
      expect(d.col).toBeTypeOf('number');
      expect(d.end).toBeTypeOf('number');
    }
  });

  test('W_MULTIPLE_IDENTIFIERS on `registration*` spans the `*`, not the name (issue #16)', () => {
    const [warning] = resolve(doc).diagnostics.filter((d) => d.code === 'W_MULTIPLE_IDENTIFIERS');
    expect(warning).toMatchObject({ line: 14, col: 14, end: 15 });
    const source = fixture('broken.skiss').split('\n')[(warning?.line ?? 0) - 1] ?? '';
    expect(source).toBe('  registration*');
    expect(source.slice(warning?.col, warning?.end)).toBe('*');
  });

  test('the partial document contains every class and field that broken.mmd shows', () => {
    // Read the class bodies out of the Mermaid golden: `class X {` opens one,
    // `<<...>>` is its stereotype, and each member line is `*name` or
    // `+[type ]name[ @System]`.
    const expected: { name: string; undeclared: boolean; fields: string[] }[] = [];
    for (const raw of fixture('broken.mmd').split('\n')) {
      const line = raw.trim();
      const open = /^class (\w+) \{$/.exec(line);
      if (open?.[1]) {
        expected.push({ name: open[1], undeclared: false, fields: [] });
        continue;
      }
      const last = expected[expected.length - 1];
      if (last === undefined) continue;
      if (line === '<<undeclared>>') last.undeclared = true;
      const member = /^[*+](?:\S+ )?(\w+)(?: @\w+)?$/.exec(line);
      if (member?.[1]) last.fields.push(member[1]);
    }
    // A `<<undeclared>>` placeholder is drawn by resolve, not parsed.
    const declared = expected
      .filter((c) => !c.undeclared)
      .map(({ name, fields }) => ({ name, fields }));
    const actual = doc.classes.map((c) => ({
      name: c.name.text,
      fields: c.fields.map((f) => f.name.text),
    }));
    expect(actual).toEqual(declared);

    // The `<<undeclared>>` placeholders are exactly `undeclared` after resolve.
    const placeholders = expected.filter((c) => c.undeclared).map((c) => c.name);
    expect(resolve(doc).undeclared?.map((n) => n.text)).toEqual(placeholders);
  });
});
