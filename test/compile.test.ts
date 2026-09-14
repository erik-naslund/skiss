import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { Diagnostic } from '../src/index.ts';
import { compile, formatDiagnostic, parse, resolve, toMermaid } from '../src/index.ts';

// Issue #6, AC6 and D4: `compile` is the whole path in one call and is what
// the CLI calls; `formatDiagnostic` is the one-line text the CLI prints and
// editors can reuse.

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('compile (AC6)', () => {
  test.each(['basic', 'systems', 'broken'])(
    '%s.skiss: output is the .mmd fixture and diagnostics are the resolved ones',
    (name) => {
      const source = fixture(`${name}.skiss`);
      const result = compile(source, { target: 'mermaid' });
      expect(result.output).toBe(fixture(`${name}.mmd`));
      expect(result.diagnostics).toEqual(resolve(parse(source)).diagnostics);
    },
  );

  test('broken.skiss carries errors and warnings, in line order', () => {
    const { diagnostics } = compile(fixture('broken.skiss'), { target: 'mermaid' });
    const golden = JSON.parse(fixture('broken.diagnostics.json')) as {
      diagnostics: { code: string; severity: string; line: number }[];
    };
    expect(diagnostics.map(({ code, severity, line }) => ({ code, severity, line }))).toEqual(
      golden.diagnostics,
    );
  });

  test('`notes: true` reaches the generator', () => {
    const source = fixture('systems.skiss');
    expect(compile(source, { target: 'mermaid', notes: true }).output).toBe(
      toMermaid(resolve(parse(source)), { notes: true }),
    );
    expect(compile(source, { target: 'mermaid', notes: true }).output).toContain('note for ');
  });

  test('the empty document compiles to `classDiagram` with no diagnostics', () => {
    expect(compile('', { target: 'mermaid' })).toEqual({
      output: 'classDiagram\n',
      diagnostics: [],
    });
  });

  test('the result is plain data', () => {
    const result = compile(fixture('broken.skiss'), { target: 'mermaid' });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe('formatDiagnostic (AC3, D4)', () => {
  const warning: Diagnostic = {
    severity: 'warning',
    code: 'W_UNKNOWN_TYPE',
    message: 'unknown type `itn`, did you mean `int`?',
    line: 12,
    col: 12,
    end: 15,
  };

  test('`<file>:<line>:<col>: <severity> <CODE> <message>`, column 1-based', () => {
    expect(formatDiagnostic(warning, 'model.skiss')).toBe(
      'model.skiss:12:13: warning W_UNKNOWN_TYPE unknown type `itn`, did you mean `int`?',
    );
  });

  test('the column is omitted when the diagnostic has none', () => {
    const { col: _col, end: _end, ...noColumn } = warning;
    expect(formatDiagnostic(noColumn, 'model.skiss')).toBe(
      'model.skiss:12: warning W_UNKNOWN_TYPE unknown type `itn`, did you mean `int`?',
    );
  });

  test('the file is omitted when not given', () => {
    expect(formatDiagnostic(warning)).toBe(
      '12:13: warning W_UNKNOWN_TYPE unknown type `itn`, did you mean `int`?',
    );
  });

  test('an error at column 0 prints as column 1', () => {
    const [error] = parse('  orphan\n').diagnostics;
    expect(error).toBeDefined();
    expect(formatDiagnostic(error as Diagnostic, 'x.skiss')).toBe(
      'x.skiss:1:3: error E_FIELD_WITHOUT_CLASS An indented line is a field, but there is no valid class line above it',
    );
    expect(formatDiagnostic({ ...(error as Diagnostic), col: 0 }, 'x.skiss')).toMatch(
      /^x\.skiss:1:1: error /,
    );
  });

  test('one line, no trailing newline', () => {
    for (const d of compile(fixture('broken.skiss'), { target: 'mermaid' }).diagnostics) {
      const text = formatDiagnostic(d, 'broken.skiss');
      expect(text).not.toContain('\n');
      expect(text).toMatch(/^broken\.skiss:\d+:\d+: (error|warning) [EW]_[A-Z_]+ .+$/);
    }
  });
});
