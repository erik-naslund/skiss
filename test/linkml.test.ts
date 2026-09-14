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

  test('a name that starts with a digit takes a `_`; one with no letters or digits becomes `sketch` (AC4, review B4)', () => {
    for (const [given, expected] of [
      ['2024-inventory', '_2024_inventory'],
      ['123', '_123'],
      ['', 'sketch'],
      ['---', 'sketch'],
    ]) {
      const named = schema('', given);
      // LinkML rejects a name that does not match `^[a-zA-Z_][\w.-]*$`, and
      // the schema name is also its prefix, which RDF forbids to be the bare
      // `_` (blank nodes). Decided by the tech lead on PR #30.
      expect(named.name).toBe(expected);
      expect(named.default_prefix).toBe(expected);
      expect(named.id).toBe(`https://example.org/${expected}`);
      expect(named.prefixes[named.default_prefix]).toBe(`https://example.org/${expected}/`);
    }
  });

  test('a name that is a prefix `linkml:types` binds takes a trailing `_` (PR #33 review)', () => {
    // `linkml:types` binds `schema` to schema.org (and `linkml`, `xsd`, `shex`);
    // `gen-python` refuses a schema that binds one of them to anything else.
    const cases: [string, string][] = [
      ['schema', 'schema_'],
      ['Schema', 'schema_'],
      ['xsd', 'xsd_'],
      ['shex', 'shex_'],
      ['linkml', 'linkml_'],
    ];
    for (const [given, expected] of cases) {
      const named = schema('', given);
      expect(named.name).toBe(expected);
      expect(named.default_prefix).toBe(expected);
      expect(named.prefixes[expected]).toBe(`https://example.org/${expected}/`);
    }
    expect(schema('', 'linkml').prefixes.linkml).toBe('https://w3id.org/linkml/');
  });

  test('a system named after a prefix `linkml:types` binds takes a trailing `_` too', () => {
    const named = schema('Ship @Schema\n  id*\n', 'sketch');
    expect(named.prefixes.schema_).toBe('https://example.org/system/schema_/');
    expect(Object.hasOwn(named.prefixes, 'schema')).toBe(false);
  });

  test('a schema name that is an `Object.prototype` key takes a trailing `_` (issue #53, M5)', () => {
    // Review B3 asked that such a name still have a prefix; `__proto__` is the
    // one a plain object swallows on the way in, so all three are spelled out
    // of the way and `default_prefix` is in `prefixes` whatever a consumer of
    // the schema object does with it.
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const named = schema('', key);
      expect(named.default_prefix).toBe(`${key}_`);
      expect(Object.hasOwn(named.prefixes, `${key}_`)).toBe(true);
      expect(named.prefixes[named.default_prefix]).toBe(`https://example.org/${key}_/`);
    }
  });

  test('a system named after an `Object.prototype` key takes one too (issue #53, M5)', () => {
    const named = schema('Ship @Constructor\n  id*\n', 'sketch');
    expect(Object.hasOwn(named.prefixes, 'constructor_')).toBe(true);
    expect(named.prefixes.constructor_).toBe('https://example.org/system/constructor_/');
  });

  test('every name-keyed map survives a `__proto__` key (issue #53, M5)', () => {
    const named = schema('', '__proto__');
    // A plain object literal swallows this write and `gen-python` then refuses
    // the schema: "Default prefix: __proto__ is not defined".
    expect(typeof named.prefixes[named.default_prefix]).toBe('string');
    expect(JSON.parse(JSON.stringify(named)).prefixes[named.default_prefix]).toBe(
      named.prefixes[named.default_prefix],
    );
    expect(serialize(named, 'yaml')).toContain('__proto___: https://example.org/__proto___/');
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
