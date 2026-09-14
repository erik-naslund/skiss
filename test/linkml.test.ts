import { describe, expect, test } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { parse, serialize, toLinkML } from '../src/index.ts';

// Issue #23, AC5 and AC8: the rules the fixtures express badly, each named
// for the SPEC §5 sentence or the acceptance criterion it pins.

const schema = (source: string, schemaName = 'sketch') => toLinkML(parse(source), { schemaName });

describe('SPEC §5.1, enum naming', () => {
  test('an inline enum on field `climate` becomes `ClimateEnum`', () => {
    const out = schema('Planet\n  climate: arid|temperate\n');
    expect(out.classes?.Planet?.attributes?.climate?.range).toBe('ClimateEnum');
    expect(out.enums).toEqual({
      ClimateEnum: { permissible_values: { arid: null, temperate: null } },
    });
  });

  test('fields with the same name and identical value sets share one enum', () => {
    const out = schema('Planet\n  climate: arid|temperate\n\nMoon\n  climate: arid|temperate\n');
    expect(out.classes?.Planet?.attributes?.climate?.range).toBe('ClimateEnum');
    expect(out.classes?.Moon?.attributes?.climate?.range).toBe('ClimateEnum');
    expect(Object.keys(out.enums ?? {})).toEqual(['ClimateEnum']);
  });

  test('fields with the same name and different value sets are each class-qualified', () => {
    const out = schema('Planet\n  climate: arid|temperate\n\nMoon\n  climate: airless|icy\n');
    expect(out.classes?.Planet?.attributes?.climate?.range).toBe('PlanetClimateEnum');
    expect(out.classes?.Moon?.attributes?.climate?.range).toBe('MoonClimateEnum');
    expect(Object.keys(out.enums ?? {})).toEqual(['PlanetClimateEnum', 'MoonClimateEnum']);
  });

  test('an enum never takes the name of a class in the same schema (review B5)', () => {
    const out = schema('ClimateEnum\n  id*\n\nPlanet\n  climate: arid|temperate\n');
    expect(out.classes?.Planet?.attributes?.climate?.range).toBe('ClimateEnum2');
    expect(Object.keys(out.enums ?? {})).toEqual(['ClimateEnum2']);
    expect(Object.keys(out.classes ?? {})).toEqual(['ClimateEnum', 'Planet']);
  });

  test('an enum never takes the name of an undeclared stub either (review B5)', () => {
    const out = schema('Planet ~ ClimateEnum\n  climate: arid|temperate\n');
    expect(out.classes?.ClimateEnum).toEqual({ annotations: { undeclared: true } });
    expect(Object.keys(out.enums ?? {})).toEqual(['ClimateEnum2']);
  });

  test('an enum is emitted once, at its first use, with its values as written', () => {
    const out = schema('Moon\n  climate: frozen|arid\n\nPlanet\n  climate: frozen|arid\n');
    expect(out.enums?.ClimateEnum?.permissible_values).toEqual({ frozen: null, arid: null });
  });
});

describe('SPEC §5.1, mapping prefix', () => {
  test('`~ Other` uses the prefix of Other’s system when Other is declared with an `@`', () => {
    const out = schema(
      'Character @Catalog\n  id*\n\nCharacterPage @Community ~ Character\n  slug*\n',
    );
    expect(out.classes?.CharacterPage?.close_mappings).toEqual(['catalog:Character']);
  });

  test('`~ Other` uses the schema’s own prefix when Other is declared without an `@`', () => {
    const out = schema('Character\n  id*\n\nCharacterPage ~ Character\n  slug*\n', 'galaxy');
    expect(out.classes?.CharacterPage?.close_mappings).toEqual(['galaxy:Character']);
  });

  test('`~ Other` uses the schema’s own prefix when Other is not declared, and Other becomes a stub', () => {
    const out = schema('CharacterPage @Community ~ Ghost\n  slug*\n', 'galaxy');
    expect(out.classes?.CharacterPage?.close_mappings).toEqual(['galaxy:Ghost']);
    expect(out.classes?.Ghost).toEqual({ annotations: { undeclared: true } });
  });
});

describe('SPEC §3.2, primitives and aliases', () => {
  test.each([
    ['string', 'string'],
    ['text', 'string'],
    ['int', 'integer'],
    ['integer', 'integer'],
    ['float', 'float'],
    ['bool', 'boolean'],
    ['boolean', 'boolean'],
    ['date', 'date'],
    ['datetime', 'datetime'],
    ['uri', 'uri'],
  ])('`: %s` compiles to `range: %s`', (written, range) => {
    expect(schema(`Ship\n  f: ${written}\n`).classes?.Ship?.attributes?.f?.range).toBe(range);
  });
});

describe('SPEC §3.2, unknown types', () => {
  test('an unknown type falls back to `string`', () => {
    const out = schema('Ship\n  crewSize: itn\n');
    expect(out.classes?.Ship?.attributes?.crewSize).toEqual({ range: 'string' });
  });

  test('a field with no colon has no `range` and takes `string` from `default_range`', () => {
    const out = schema('Ship\n  name\n');
    expect(out.classes?.Ship?.attributes?.name).toEqual({});
    expect(out.default_range).toBe('string');
  });
});

describe('SPEC §3.8, identifiers', () => {
  test('a class may have no identifier', () => {
    const out = schema('Loan\n  dueOn: date\n');
    expect(out.classes?.Loan?.attributes?.dueOn).toEqual({ range: 'date' });
    expect(serialize(out, 'yaml')).not.toContain('identifier');
  });

  test('a second `*` in the same class is ignored, so one class has one identifier', () => {
    const out = schema('Ship\n  id*\n  registration*\n');
    expect(out.classes?.Ship?.attributes?.id?.identifier).toBe(true);
    expect(out.classes?.Ship?.attributes?.registration).toEqual({});
  });
});

describe('issue #17, duplicate class names', () => {
  test('the first declared class wins and the later ones are not emitted (AC5)', () => {
    const out = schema('Person @Crew\n  id*\n  name\n\nPerson @Registry\n  email\n');
    expect(Object.keys(out.classes ?? {})).toEqual(['Person']);
    expect(out.classes?.Person?.annotations).toEqual({ system: 'Crew' });
    expect(Object.keys(out.classes?.Person?.attributes ?? {})).toEqual(['id', 'name']);
  });

  test('the first declaration of a duplicated field in one class wins', () => {
    const out = schema('Ship\n  name: int\n  name: date\n');
    expect(out.classes?.Ship?.attributes?.name).toEqual({ range: 'integer' });
  });
});

describe('SPEC §5.2, an empty document', () => {
  const out = schema('', 'my sketch-1');

  test('is a valid schema with no classes', () => {
    expect(out.classes).toBeUndefined();
    expect(out.enums).toBeUndefined();
    expect(out.imports).toEqual(['linkml:types']);
  });

  test('`schemaName` is normalised to lowercase with non-alphanumerics as underscores (AC4)', () => {
    expect(out.name).toBe('my_sketch_1');
    expect(out.id).toBe('https://example.org/my_sketch_1');
    expect(out.default_prefix).toBe('my_sketch_1');
    expect(out.prefixes).toEqual({
      linkml: 'https://w3id.org/linkml/',
      my_sketch_1: 'https://example.org/my_sketch_1/',
    });
  });

  test('a normalised name that is empty or starts with a digit takes a `_` (AC4, review B4)', () => {
    for (const [given, expected] of [
      ['2024-inventory', '_2024_inventory'],
      ['123', '_123'],
      ['', '_'],
    ]) {
      const named = schema('', given);
      // LinkML rejects a name that does not match `^[a-zA-Z_][\w.-]*$`. The
      // empty name normalises to the bare `_`, which is a valid name but not
      // a usable prefix: RDF reserves `_` for blank nodes, so `gen-python`
      // rejects `default_prefix: _`. Reported on PR #30, not decided here.
      expect(named.name).toBe(expected);
      expect(named.default_prefix).toBe(expected);
      expect(named.id).toBe(`https://example.org/${expected}`);
      expect(named.prefixes[named.default_prefix]).toBe(`https://example.org/${expected}/`);
    }
  });

  test('a schema name that is an `Object.prototype` key still has a prefix (review B3)', () => {
    const named = schema('', 'constructor');
    expect(named.default_prefix).toBe('constructor');
    expect(Object.hasOwn(named.prefixes, 'constructor')).toBe(true);
    expect(named.prefixes[named.default_prefix]).toBe('https://example.org/constructor/');
  });

  test('a system named after an `Object.prototype` key still has a prefix (review B3)', () => {
    const named = schema('Ship @Constructor\n  id*\n', 'sketch');
    expect(Object.hasOwn(named.prefixes, 'constructor')).toBe(true);
    expect(named.prefixes.constructor).toBe('https://example.org/system/constructor/');
  });

  test('serialises to YAML with no `classes` or `enums` section', () => {
    expect(serialize(out, 'yaml')).toBe(
      [
        'id: https://example.org/my_sketch_1',
        'name: my_sketch_1',
        'default_prefix: my_sketch_1',
        'default_range: string',
        'prefixes:',
        '  linkml: https://w3id.org/linkml/',
        '  my_sketch_1: https://example.org/my_sketch_1/',
        'imports:',
        '  - linkml:types',
        '',
      ].join('\n'),
    );
  });
});

describe('issue #23, AC2: LinkML reads the file as YAML 1.1 (review B1, B2)', () => {
  // PyYAML, which LinkML parses with, is YAML 1.1: `yes`, `null`, `1.0`,
  // `12:30` and `on` are not strings there unless they are quoted.
  const roundTrip = (description: string): unknown => {
    const out = schema(`Ship\n  d # ${description}\n`);
    expect(out.classes?.Ship?.attributes?.d?.description).toBe(description);
    const back = parseYaml(serialize(out, 'yaml'), { version: '1.1' }) as {
      classes: { Ship: { attributes: { d: { description: unknown } } } };
    };
    return back.classes.Ship.attributes.d.description;
  };

  test.each(['yes', 'null', '1.0', '12:30', 'on'])(
    'a description of `%s` parses back as the string it was written as',
    (description) => {
      expect(roundTrip(description)).toBe(description);
    },
  );

  test('a description with a tab is double-quoted, which PyYAML can read', () => {
    const out = schema('Ship\n  d # tab\there\n');
    expect(serialize(out, 'yaml')).toContain('description: "tab\\there"');
    expect(roundTrip('tab\there')).toBe('tab\there');
  });
});

describe('issue #23, AC2: serialize', () => {
  const out = schema('Ship\n  id*\n');

  test('JSON output is pretty-printed with two spaces and parses back to the schema', () => {
    const json = serialize(out, 'json');
    expect(json).toContain('\n  "name": "sketch",');
    expect(JSON.parse(json)).toEqual(out);
  });

  test('YAML output has no document markers and no trailing whitespace', () => {
    const yaml = serialize(out, 'yaml');
    expect(yaml).not.toContain('---');
    expect(yaml.split('\n').every((line) => line === line.replace(/[ \t]+$/, ''))).toBe(true);
  });
});
