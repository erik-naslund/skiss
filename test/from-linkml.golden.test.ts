import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { formatDropped, fromLinkML, parse, resolve, toLinkML, toSkiss } from '../src/index.ts';

// Issue #46, AC2 and AC3. The fixtures are the contract for SPEC §8: the
// projection of a schema Skiss wrote is the sketch it came from, and the
// projection of a schema somebody else wrote is `foreign.skiss` with
// `foreign.dropped.json` beside it.

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const SCHEMA_NAME: Record<string, string> = { 'spec-example': 'galaxy_catalogue' };
const schemaFor = (name: string): ReturnType<typeof toLinkML> =>
  toLinkML(parse(fixture(`${name}.skiss`)), { schemaName: SCHEMA_NAME[name] ?? name });

describe.each(['basic', 'systems', 'spec-example'])('%s.skiss (AC2)', (name) => {
  test('fromLinkML(toLinkML(parse(x))).source equals toSkiss(parse(x))', () => {
    expect(fromLinkML(schemaFor(name)).source).toBe(toSkiss(parse(fixture(`${name}.skiss`))));
  });

  test('nothing is dropped projecting a schema Skiss wrote', () => {
    expect(fromLinkML(schemaFor(name)).dropped).toEqual([]);
  });
});

describe('broken.skiss (AC2)', () => {
  // The one fixture `toLinkML` does not carry whole, and every loss is its
  // own: an unknown type compiles to `range: string` (SPEC §3.2), a second `*`
  // is cleared, and a duplicate class or field is not emitted at all. So the
  // projection is not `broken.skiss`; it is everything the schema held, and
  // projecting it again changes nothing.
  const source = (): string => fromLinkML(schemaFor('broken')).source;

  test('nothing is dropped projecting the schema back', () => {
    expect(fromLinkML(schemaFor('broken')).dropped).toEqual([]);
  });

  test('the projection is canonical Skiss and projecting it again is identity', () => {
    expect(toSkiss(parse(source()))).toBe(source());
    const again = toLinkML(parse(source()), { schemaName: 'broken' });
    expect(fromLinkML(again).source).toBe(source());
  });
});

describe.each(['basic', 'systems', 'spec-example'])('%s.skiss (AC2)', (name) => {
  test('the projected document re-compiles to the schema it came from', () => {
    const schema = schemaFor(name);
    const schemaName = SCHEMA_NAME[name] ?? name;
    expect(toLinkML(fromLinkML(schema).document, { schemaName })).toEqual(schema);
  });
});

describe('foreign.linkml.yaml (AC3)', () => {
  const projection = (): ReturnType<typeof fromLinkML> =>
    fromLinkML(parseYaml(fixture('foreign.linkml.yaml')));

  test('the projection equals foreign.skiss byte for byte', () => {
    expect(projection().source).toBe(fixture('foreign.skiss'));
  });

  test('what it dropped equals foreign.dropped.json', () => {
    expect(projection().dropped).toEqual(JSON.parse(fixture('foreign.dropped.json')));
  });

  test('formatDropped reports the schema in one line', () => {
    expect(formatDropped(projection().dropped)).toBe(
      'Dropped: 1 mixin class, minimum_value on 1 slot, unique_keys on 1 class, ' +
        '1 narrowed range, required on 3 slots, is_a on 1 class, 1 mixin, ' +
        'slot_usage on 1 class, 2 patterns, comments on 1 slot, see_also on 1 class, ' +
        '1 description reworded, 1 enum detail, 1 schema key. ' +
        'Renamed: 18 names. Inlined: 1 enum.',
    );
  });

  test('the projected sketch parses, and the narrowed `time` is its only warning', () => {
    const document = projection().document;
    expect(document.diagnostics).toEqual([]);
    expect(resolve(document).diagnostics.map((d) => d.code)).toEqual(['W_UNKNOWN_TYPE']);
  });
});
