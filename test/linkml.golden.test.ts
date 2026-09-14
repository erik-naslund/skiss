import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parse, resolve, serialize, toLinkML } from '../src/index.ts';

// Issue #23, AC6 and AC7: the `.linkml.yaml` fixtures are the contract for
// the mapping in docs/SPEC.md §5, byte for byte.

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('spec-example.skiss (SPEC §5.3)', () => {
  test('serialised as YAML it equals spec-example.linkml.yaml byte for byte (AC6)', () => {
    const doc = parse(fixture('spec-example.skiss'));
    const schema = toLinkML(doc, { schemaName: 'galaxy_catalogue' });
    expect(serialize(schema, 'yaml')).toBe(fixture('spec-example.linkml.yaml'));
  });
});

describe.each(['basic', 'systems', 'broken'])('%s.skiss', (name) => {
  const schema = (): ReturnType<typeof toLinkML> =>
    toLinkML(parse(fixture(`${name}.skiss`)), { schemaName: name });

  test(`toLinkML serialised as YAML equals ${name}.linkml.yaml byte for byte (AC7)`, () => {
    expect(serialize(schema(), 'yaml')).toBe(fixture(`${name}.linkml.yaml`));
  });

  test('an unresolved document is resolved first and gives the same schema (AC1)', () => {
    const fromResolved = toLinkML(resolve(parse(fixture(`${name}.skiss`))), { schemaName: name });
    expect(fromResolved).toEqual(schema());
  });

  test('the schema object is plain data and survives JSON.stringify (ADR 0006)', () => {
    expect(JSON.parse(serialize(schema(), 'json'))).toEqual(schema());
  });
});
