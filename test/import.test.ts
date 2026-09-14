import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { formatDiagnostic, fromLinkML, importLinkML, parse, resolve } from '../src/index.ts';

// Issue #47, AC1: `importLinkML` is the whole path from LinkML text to Skiss
// text, as `compile` is the whole path the other way. The projection itself is
// `fromLinkML` and is pinned by test/from-linkml.golden.test.ts; what is
// verified here is the YAML step, the diagnostics and the never-throws rule.

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('importLinkML (AC1)', () => {
  test('foreign.linkml.yaml: output is foreign.skiss and dropped is foreign.dropped.json', () => {
    const result = importLinkML(fixture('foreign.linkml.yaml'));
    expect(result.output).toBe(fixture('foreign.skiss'));
    expect(result.dropped).toEqual(JSON.parse(fixture('foreign.dropped.json')));
  });

  test('the diagnostics are the ones of the sketch it wrote', () => {
    const result = importLinkML(fixture('foreign.linkml.yaml'));
    expect(result.diagnostics).toEqual(resolve(parse(result.output)).diagnostics);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['W_UNKNOWN_TYPE']);
  });

  test.each(['basic', 'systems', 'spec-example'])(
    '%s.linkml.yaml: the output is the source `fromLinkML` projected, and nothing is dropped',
    (name) => {
      const text = fixture(`${name}.linkml.yaml`);
      const result = importLinkML(text);
      expect(result.output).toBe(fromLinkML(parseYaml(text)).source);
      expect(result.dropped).toEqual([]);
      expect(result.diagnostics).toEqual([]);
    },
  );

  test('JSON is YAML: the same schema written as JSON imports to the same sketch', () => {
    const text = fixture('systems.linkml.yaml');
    const json = JSON.stringify(parseYaml(text), null, 2);
    expect(importLinkML(json)).toEqual(importLinkML(text));
  });

  test('a text that is not YAML is one E_NOT_YAML error on line 1 and no output', () => {
    const result = importLinkML('classes: [\n  unterminated\n');
    expect(result.output).toBe('');
    expect(result.dropped).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    const [error] = result.diagnostics;
    expect(error?.severity).toBe('error');
    expect(error?.code).toBe('E_NOT_YAML');
    expect(error?.line).toBe(1);
    // The CLI prints one diagnostic per line, so the message stays one line.
    expect(formatDiagnostic(error as NonNullable<typeof error>, 'x.yaml')).not.toContain('\n');
  });

  test('a schema that is not a schema projects to an empty sketch and says why', () => {
    const result = importLinkML('a list, not a schema\n');
    expect(result.output).toBe('');
    expect(result.diagnostics).toEqual([]);
    expect(result.dropped).toEqual([
      { kind: 'schema', element: 'schema', detail: 'the schema is not an object' },
    ]);
  });

  test('it never throws, whatever the text is', () => {
    for (const text of ['', '\n', 'null\n', '- a\n- b\n', '{}', 'a: *undefined\n', '\t\t{']) {
      expect(() => importLinkML(text)).not.toThrow();
    }
  });

  test('the result is plain data', () => {
    const result = importLinkML(fixture('foreign.linkml.yaml'));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
