// LinkML schema object -> Skiss Document (SPEC §8). The other direction of
// `toLinkML`: every mapping here is the inverse of a §5.1 row, and everything
// LinkML says that §5.1 has no row for is reported rather than lost quietly.
//
// The input is a plain object and not text: the CLI parses the YAML, so the
// library stays browser-safe (ADR 0003). The document is built with zeroed
// positions, printed with `toSkiss`, and parsed again, so the document that
// comes back carries real positions and `source` is the projection itself.
// Never throws: a schema this cannot read at all projects to an empty sketch
// and one report saying why.

import type { ClassNode, Document, FieldNode, Name, Primitive, TypeRef } from '../ast.ts';
import { CLASS_NAME, FIELD_NAME, parse, SYSTEM_OR_VALUE } from '../parse.ts';
import { toSkiss } from './skiss.ts';

/**
 * One thing the projection could not carry. `kind` is the LinkML key, or one
 * of the projection's own kinds: `renamed`, `narrowed`, `inlined`,
 * `enum_detail`, `annotation`, `schema`. `element` names what carried it as
 * the sketch names it — `Class`, `Class.field` — or, for an enum, its LinkML
 * name, which the sketch does not keep.
 */
export interface Dropped {
  kind: string;
  element: string;
  detail?: string;
}

export interface FromLinkMLResult {
  /** The projected sketch, parsed from `source`, so every node has a position. */
  document: Document;
  /** The sketch as canonical Skiss text. */
  source: string;
  /** SPEC §8, in schema order: class by class, then enums, then the schema itself. */
  dropped: Dropped[];
}

/** SPEC §8: the LinkML types that are Skiss primitives. Everything else narrows. */
const PRIMITIVE_RANGE: Record<string, Primitive> = {
  string: 'string',
  integer: 'int',
  float: 'float',
  double: 'float',
  decimal: 'float',
  boolean: 'bool',
  date: 'date',
  datetime: 'datetime',
  uri: 'uri',
  uriorcurie: 'uri',
};

/** The keys of a class §5.1 writes and this reads back. */
const CLASS_KEYS = new Set(['description', 'annotations', 'close_mappings', 'attributes', 'slots']);
/** The keys of a slot §5.1 writes and this reads back. */
const SLOT_KEYS = new Set(['description', 'annotations', 'range', 'multivalued', 'identifier']);
/** The annotation tags §5.1 gives a meaning. `undeclared` marks a stub. */
const CLASS_TAGS = new Set(['system', 'note', 'undeclared']);
const SLOT_TAGS = new Set(['system', 'note', 'joins_to']);
/**
 * Schema-level keys that are never reported: §5.2 boilerplate (issue #46,
 * working default D2) and the three blocks the projection reads.
 */
const QUIET_SCHEMA_KEYS = new Set([
  'id',
  'name',
  'prefixes',
  'imports',
  'default_prefix',
  'default_range',
  'title',
  'license',
  'version',
  'classes',
  'slots',
  'enums',
]);

/** A lowercase word `parse` reads as an unknown type (SPEC §3.2). */
const UNKNOWN_TYPE = /^[a-z][a-z0-9_-]*$/;

export function fromLinkML(schema: unknown): FromLinkMLResult {
  const root = asRecord(schema);
  if (root === undefined) return nothing('schema', 'the schema is not an object');
  const schemaName = schemaElement(root);
  const classBlock = asRecord(get(root, 'classes'));
  if (classBlock === undefined) return nothing(schemaName, 'the schema has no `classes`');
  // Written out with its type: the helpers below are function declarations,
  // and a narrowing does not reach into one.
  const classDefs: Record<string, unknown> = classBlock;

  const dropped: Dropped[] = [];
  const report = (kind: string, element: string, detail?: string): void => {
    dropped.push(detail === undefined ? { kind, element } : { kind, element, detail });
  };

  const slotDefs = asRecord(get(root, 'slots')) ?? {};
  const enumDefs = asRecord(get(root, 'enums')) ?? {};
  const defaultRange = stringOf(get(root, 'default_range')) ?? 'string';

  // Names first, all of them: a reference is written with the name of the
  // element it points at, so no line can be written before every name is
  // known (SPEC §8, Names).
  const classNames = new Map<string, string>();
  const takenClasses = new Set<string>();
  for (const key of Object.keys(classDefs)) {
    classNames.set(key, unique(toClassName(key), takenClasses));
  }
  const fieldNames = new Map<string, Map<string, string>>();
  for (const key of Object.keys(classDefs)) {
    const names = new Map<string, string>();
    const taken = new Set<string>();
    for (const slot of slotKeysOf(asRecord(get(classDefs, key)) ?? {})) {
      names.set(slot, unique(toFieldName(slot), taken));
    }
    fieldNames.set(key, names);
  }
  // SPEC §8, Names: a reference is converted with the name it points at, and
  // every conversion is reported — including a reference out of the schema,
  // which has no declaration here to carry the report. One converted name is
  // reported once per element it appears on.
  const referenced = new Set<string>();
  const reference = (element: string, from: string, to: string): void => {
    if (from === to || referenced.has(`${element}\u0000${to}`)) return;
    referenced.add(`${element}\u0000${to}`);
    report('renamed', element, `\`${to}\` from \`${from}\``);
  };

  const classNameOf = (key: string): string => classNames.get(key) ?? toClassName(key);
  const fieldNameOf = (classKey: string, slot: string): string =>
    fieldNames.get(classKey)?.get(slot) ?? toFieldName(slot);

  // An enum is inlined at every attribute whose range it is, so its values
  // have to be writable as Skiss values before any of them is read.
  const enumValues = new Map<string, string[]>();
  const unwritable = new Map<string, string>();
  for (const key of Object.keys(enumDefs)) {
    const rawValues = get(asRecord(get(enumDefs, key)) ?? {}, 'permissible_values');
    const values = asRecord(rawValues);
    const keys = Object.keys(values ?? {});
    const bad = keys.find((value) => !SYSTEM_OR_VALUE.test(value));
    if (values === undefined && present(rawValues)) {
      // Say what was found rather than a count of values that were not read.
      unwritable.set(key, `${shown(rawValues)} is not a map of permissible values`);
    } else if (keys.length < 2) {
      // SPEC §3.4: a single value without a pipe is an unknown type, not an enum.
      const count = `${keys.length} permissible value${keys.length === 1 ? '' : 's'}`;
      unwritable.set(key, `${count} cannot be an inline enum (§3.4)`);
    } else if (bad !== undefined) {
      unwritable.set(key, `\`${bad}\` is not a value Skiss can write (§4)`);
    } else {
      enumValues.set(key, keys);
    }
  }

  /** Where an enum was inlined, for the sharing test below. */
  const enumUses: { enumName: string; field: string; values: string }[] = [];

  const classes: ClassNode[] = [];
  for (const key of Object.keys(classDefs)) {
    const raw = get(classDefs, key);
    const body = asRecord(raw);
    const name = classNameOf(key);
    if (body === undefined && raw !== null && raw !== undefined) {
      report('class', name, 'is not a class definition');
      continue;
    }
    const def = body ?? {};
    if (name !== key) report('renamed', name, `from \`${key}\``);

    const annotations = annotationsOf(def);
    if (annotations.get('undeclared') === true) {
      // SPEC §5.1: the stub a reference to an undeclared class left behind.
      // It is not a class of the sketch; the reference itself is written.
      for (const other of Object.keys(def)) {
        if (other !== 'annotations') report(other, name);
      }
      continue;
    }

    const node: ClassNode = { name: at0(name), fields: [], line: 0 };
    const description = oneLine(stringOf(get(def, 'description')));
    if (description !== undefined) node.description = description;

    const system = annotations.get('system');
    if (typeof system === 'string' && SYSTEM_OR_VALUE.test(system)) node.system = at0(system);
    else if (system !== undefined) report('annotation', name, '`system` is not a system name');

    const note = oneLine(stringOf(annotations.get('note')));
    if (note !== undefined) node.note = note;

    const mappings = stringList(get(def, 'close_mappings'));
    const first = mappings[0];
    // SPEC §5.1 writes `<prefix>:Other`, but a foreign schema writes a full
    // IRI just as often; neither the prefix nor the IRI survives into a sketch.
    const target = first === undefined ? '' : localName(first);
    if (target !== '') {
      const similar = Object.hasOwn(classDefs, target) ? classNameOf(target) : toClassName(target);
      node.similarTo = at0(similar);
      reference(name, target, similar);
    }

    for (const other of Object.keys(def)) {
      if (CLASS_KEYS.has(other)) {
        if (other === 'annotations') {
          for (const tag of annotations.keys()) {
            if (!CLASS_TAGS.has(tag)) report('annotation', name, `\`${tag}\``);
          }
        }
        if (other === 'close_mappings') {
          if (target === '') report('close_mappings', name, 'no mapping this can read');
          else if (mappings.length > 1) {
            report('close_mappings', name, `${mappings.length - 1} beyond the first`);
          }
        }
        // A block the fields are read out of, written as something they
        // cannot be read out of, loses every field in it.
        const block = get(def, other);
        if (other === 'attributes' && present(block) && asRecord(block) === undefined) {
          report('attributes', name, `${shown(block)} is not a map`);
        }
        if (other === 'slots' && present(block) && !Array.isArray(block)) {
          report('slots', name, `${shown(block)} is not a list`);
        }
        continue;
      }
      if (other === 'slot_usage') {
        // One report per slot the usage block changes, not one per class: it
        // is the slot that reads differently here than where it is defined.
        const usage = asRecord(get(def, other));
        if (usage === undefined) {
          report('slot_usage', name);
          continue;
        }
        for (const slot of Object.keys(usage)) {
          // A slot the sketch does not carry is one `is_a` brought in, and
          // `is_a` is dropped: the class is where a reader can find it.
          if (fieldNames.get(key)?.has(slot) === true) {
            report('slot_usage', `${name}.${fieldNameOf(key, slot)}`);
          } else {
            report('slot_usage', name, `\`${slot}\` is inherited and not in the sketch`);
          }
        }
        continue;
      }
      report(other, name);
    }

    for (const slot of slotKeysOf(def)) {
      const attributes = asRecord(get(def, 'attributes')) ?? {};
      const rawSlot = Object.hasOwn(attributes, slot) ? get(attributes, slot) : get(slotDefs, slot);
      const slotDef = asRecord(rawSlot);
      if (slotDef === undefined && present(rawSlot)) {
        // The same rule as a class whose body is not a class definition.
        report('slot', `${name}.${fieldNameOf(key, slot)}`, 'is not a slot definition');
        continue;
      }
      node.fields.push(buildField(key, name, slot, slotDef ?? {}));
    }

    classes.push(node);
  }

  // The enums, after the classes that used them (working default D1).
  for (const key of Object.keys(enumDefs)) {
    const def = asRecord(get(enumDefs, key)) ?? {};
    const uses = enumUses.filter((use) => use.enumName === key);
    const why = unwritable.get(key);
    if (why !== undefined) report('enum', key, `${why}; those attributes keep no type`);
    else if (uses.length === 0) report('unused_enum', key, 'no attribute has it as its range');
    else if (uses.length > 1 && sharingLost(uses, enumUses)) {
      report('inlined', key, `inlined at ${uses.length} attributes`);
    }

    const detail: string[] = [];
    const values = asRecord(get(def, 'permissible_values')) ?? {};
    const detailed = Object.keys(values).filter((value) => {
      const valueBody = asRecord(get(values, value));
      return valueBody !== undefined && Object.keys(valueBody).length > 0;
    });
    if (detailed.length > 0) {
      const bodies =
        detailed.length === 1 ? 'carries a body of its own' : 'carry bodies of their own';
      detail.push(`${list(detailed)} ${bodies}`);
    }
    const others = Object.keys(def).filter((other) => other !== 'permissible_values');
    if (others.length > 0) detail.push(`the enum carries ${list(others)}`);
    if (detail.length > 0) report('enum_detail', key, detail.join('; '));
  }

  // A global slot no class lists is not flattened anywhere, so it is gone.
  for (const slot of Object.keys(slotDefs)) {
    if (!listedSomewhere(slot)) report('slot', slot, 'no class lists it');
  }

  // One report per key, so the one-line report counts them (`2 schema keys`).
  for (const key of Object.keys(root)) {
    if (!QUIET_SCHEMA_KEYS.has(key)) report('schema', schemaName, `\`${key}\``);
  }

  const source = toSkiss({ classes, diagnostics: [] });
  return { document: parse(source), source, dropped };

  // -------------------------------------------------------------------------

  function buildField(
    classKey: string,
    className: string,
    slot: string,
    def: Record<string, unknown>,
  ): FieldNode {
    const name = fieldNameOf(classKey, slot);
    const element = `${className}.${name}`;
    if (name !== slot) report('renamed', element, `from \`${slot}\``);

    const identifier = get(def, 'identifier');
    if (present(identifier) && typeof identifier !== 'boolean') {
      // SPEC §8, The report: a key the table carries, with a value the reader
      // cannot use, is reported rather than guessed at. `yes` is a boolean in
      // YAML 1.1 and a string in the YAML 1.2 the CLI parses with.
      report('identifier', element, `${shown(identifier)} is not a boolean`);
    }

    const field: FieldNode = {
      name: at0(name),
      identifier: identifier === true,
      line: 0,
    };
    const description = oneLine(stringOf(get(def, 'description')));
    if (description !== undefined) field.description = description;

    const type = typeFor(element, name, def);
    if (type !== undefined) field.type = type;

    const annotations = annotationsOf(def);
    const system = annotations.get('system');
    if (typeof system === 'string' && SYSTEM_OR_VALUE.test(system)) field.system = at0(system);
    else if (system !== undefined) report('annotation', element, '`system` is not a system name');

    const joins = annotations.get('joins_to');
    if (typeof joins === 'string') {
      const dot = joins.indexOf('.');
      const target = joins.slice(0, dot);
      const targetField = joins.slice(dot + 1);
      if (dot > 0 && targetField !== '') {
        const targetClass = classNameOf(target);
        const targetName = fieldNameOf(target, targetField);
        field.joinsTo = { className: at0(targetClass), fieldName: at0(targetName) };
        reference(element, target, targetClass);
        reference(element, targetField, targetName);
      } else report('annotation', element, '`joins_to` is not `Class.field`');
    } else if (joins !== undefined) report('annotation', element, '`joins_to` is not text');

    const note = oneLine(stringOf(annotations.get('note')));
    if (note !== undefined) field.note = note;

    for (const other of Object.keys(def)) {
      if (!SLOT_KEYS.has(other)) {
        report(other, element);
        continue;
      }
      if (other !== 'annotations') continue;
      for (const tag of annotations.keys()) {
        if (!SLOT_TAGS.has(tag)) report('annotation', element, `\`${tag}\``);
      }
    }
    return field;
  }

  /** SPEC §8, the `range` rows. The reported narrowing is the last row. */
  function typeFor(
    element: string,
    field: string,
    def: Record<string, unknown>,
  ): TypeRef | undefined {
    const rawMany = get(def, 'multivalued');
    if (present(rawMany) && typeof rawMany !== 'boolean') {
      report('multivalued', element, `${shown(rawMany)} is not a boolean`);
    }
    const many = rawMany === true;

    const rawRange = get(def, 'range');
    if (present(rawRange) && typeof rawRange !== 'string') {
      report('range', element, `${shown(rawRange)} is not a string`);
    } else if (rawRange === '') report('range', element, 'the range is empty');
    // No `range` means `default_range`, which SPEC §5.2 writes as `string`.
    const range = stringOf(rawRange) ?? defaultRange;

    if (Object.hasOwn(classDefs, range)) {
      const target = classNameOf(range);
      reference(element, range, target);
      return { kind: 'class', name: at0(target), many };
    }
    if (Object.hasOwn(enumDefs, range)) {
      const values = enumValues.get(range);
      // An enum Skiss cannot write leaves the attribute untyped; the enum
      // itself carries the report, once, rather than every use of it.
      if (values === undefined) return many ? stringType(true) : undefined;
      enumUses.push({ enumName: range, field, values: values.join('|') });
      return { kind: 'enum', values: values.map(at0), many };
    }
    if (Object.hasOwn(PRIMITIVE_RANGE, range)) {
      const primitive = PRIMITIVE_RANGE[range] ?? 'string';
      // A plain `string` is what a field without a colon means (SPEC §3.2);
      // `string[]` still needs the colon for `[]` to attach to.
      if (primitive === 'string') return many ? stringType(true) : undefined;
      return { kind: 'primitive', name: primitive, written: at0(primitive), many };
    }
    if (/^[A-Z]/.test(range)) {
      const target = toClassName(range);
      reference(element, range, target);
      return { kind: 'class', name: at0(target), many };
    }

    const word = range.toLowerCase();
    if (!UNKNOWN_TYPE.test(word)) {
      report('narrowed', element, `\`${range}\` is not a type Skiss can write; it reads as string`);
      return many ? stringType(true) : undefined;
    }
    report('narrowed', element, `\`${range}\` is not a Skiss type; it falls back to string`);
    return { kind: 'unknown', name: at0(word), many };
  }

  /** True when a class lists this global slot, so it was flattened into one. */
  function listedSomewhere(slot: string): boolean {
    for (const key of Object.keys(classDefs)) {
      const def = asRecord(get(classDefs, key)) ?? {};
      if (stringList(get(def, 'slots')).includes(slot)) return true;
    }
    return false;
  }
}

/**
 * SPEC §8, Enums: sharing is lost unless §5.1 would rebuild one enum from the
 * inlined copies, which it does for one field name carrying one value set.
 */
function sharingLost(
  uses: { field: string; values: string }[],
  all: { field: string; values: string }[],
): boolean {
  const first = uses[0];
  if (first === undefined) return false;
  if (uses.some((use) => use.field !== first.field)) return true;
  return all.some((use) => use.field === first.field && use.values !== first.values);
}

// ---------------------------------------------------------------------------
// The report as one line, SPEC §8.

/** Kinds that name a countable thing rather than a key on one. */
const COUNTED: Record<string, [string, string]> = {
  renamed: ['name', 'names'],
  inlined: ['enum', 'enums'],
  enum: ['unwritable enum', 'unwritable enums'],
  unused_enum: ['unused enum', 'unused enums'],
  class: ['class', 'classes'],
  slot: ['slot', 'slots'],
  schema: ['schema key', 'schema keys'],
  // `mixin: true` marks the class; `mixins: [M]` points at another one.
  mixin: ['mixin class', 'mixin classes'],
  mixins: ['mixin', 'mixins'],
  pattern: ['pattern', 'patterns'],
  unit: ['unit', 'units'],
};

/** Kinds whose element is an enum. Everything else is a class or a slot. */
const ENUM_KINDS = new Set(['enum_detail']);

export function formatDropped(dropped: Dropped[]): string {
  const groups = new Map<string, Dropped[]>();
  for (const entry of dropped) {
    const group = groups.get(entry.kind);
    if (group === undefined) groups.set(entry.kind, [entry]);
    else group.push(entry);
  }

  const drops: string[] = [];
  let renamed = '';
  let inlined = '';
  for (const [kind, entries] of groups) {
    const phrase = phraseFor(kind, entries);
    if (kind === 'renamed') renamed = phrase;
    else if (kind === 'inlined') inlined = phrase;
    else drops.push(phrase);
  }

  const sentences: string[] = [];
  if (drops.length > 0) sentences.push(`Dropped: ${drops.join(', ')}.`);
  if (renamed !== '') sentences.push(`Renamed: ${renamed}.`);
  if (inlined !== '') sentences.push(`Inlined: ${inlined}.`);
  return sentences.join(' ');
}

function phraseFor(kind: string, entries: Dropped[]): string {
  const n = entries.length;
  const counted = Object.hasOwn(COUNTED, kind) ? COUNTED[kind] : undefined;
  if (counted !== undefined) return `${n} ${n === 1 ? counted[0] : counted[1]}`;
  return `${kind} on ${n} ${nounFor(kind, entries)}`;
}

function nounFor(kind: string, entries: Dropped[]): string {
  const one = entries.length === 1;
  if (ENUM_KINDS.has(kind)) return one ? 'enum' : 'enums';
  const slots = entries.filter((entry) => entry.element.includes('.')).length;
  if (slots === entries.length) return one ? 'slot' : 'slots';
  if (slots === 0) return one ? 'class' : 'classes';
  return one ? 'element' : 'elements';
}

// ---------------------------------------------------------------------------
// Names, SPEC §8.

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const decapitalise = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** The parts of a LinkML name: anything that is not a letter or a digit separates. */
const parts = (text: string): string[] => text.split(/[^A-Za-z0-9]+/).filter((part) => part !== '');

/**
 * `page_count` and `Page-Count` become `PageCount`. A name with nothing to
 * make a class name of is `Class`, and one that would start with a digit
 * takes an `X`: SPEC §4 has no other way to start a class name.
 */
function toClassName(text: string): string {
  if (CLASS_NAME.test(text)) return text;
  const name = parts(text).map(capitalise).join('');
  if (name === '') return 'Class';
  return CLASS_NAME.test(name) ? name : `X${name}`;
}

/** `page_count` and `Page-Count` become `pageCount`, by the same rule. */
function toFieldName(text: string): string {
  if (FIELD_NAME.test(text)) return text;
  const name = parts(text)
    .map((part, i) => (i === 0 ? decapitalise(part) : capitalise(part)))
    .join('');
  if (name === '') return 'field';
  return FIELD_NAME.test(name) ? name : `x${capitalise(name)}`;
}

/** Two names that converge take a number: `PageCount`, `PageCount2`. */
function unique(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}${n}`;
  taken.add(name);
  return name;
}

// ---------------------------------------------------------------------------
// Reading a plain object that came from somebody else's YAML.

/**
 * `Object.hasOwn` and never a plain lookup: the input is a plain object, so
 * `constructor` and the other `Object.prototype` keys would otherwise be read
 * as content (issue #42).
 */
const get = (record: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/** A key written with no value at all is not a key written with a bad one. */
const present = (value: unknown): boolean => value !== undefined && value !== null;

/**
 * A value from somebody else's YAML, short enough to name in a report. A
 * scalar is quoted as it was written; a block is named by its shape.
 */
function shown(value: unknown): string {
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object' && value !== null) return 'a map';
  return `\`${String(value)}\``;
}

/**
 * The name at the end of a CURIE or an IRI: `catalog:Book` and
 * `https://schema.org/Book` are both `Book`. Empty when there is no name in it.
 */
function localName(mapping: string): string {
  let cut = -1;
  for (const mark of [':', '/', '#']) cut = Math.max(cut, mapping.lastIndexOf(mark));
  return mapping.slice(cut + 1);
}

const stringOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

/**
 * The annotations of a class or a slot, compact (`system: Catalog`, what §5.1
 * writes) or in the long form LinkML also accepts (`system: {tag: system,
 * value: Catalog}`).
 */
function annotationsOf(def: Record<string, unknown>): Map<string, string | boolean> {
  const out = new Map<string, string | boolean>();
  const annotations = asRecord(get(def, 'annotations'));
  if (annotations === undefined) return out;
  for (const tag of Object.keys(annotations)) {
    const raw = get(annotations, tag);
    const value = asRecord(raw) === undefined ? raw : get(asRecord(raw) ?? {}, 'value');
    if (typeof value === 'string' || typeof value === 'boolean') out.set(tag, value);
    else out.set(tag, String(value));
  }
  return out;
}

/** The class's `attributes`, then the schema `slots` it lists, in that order. */
function slotKeysOf(def: Record<string, unknown>): string[] {
  const keys = Object.keys(asRecord(get(def, 'attributes')) ?? {});
  for (const slot of stringList(get(def, 'slots'))) {
    if (!keys.includes(slot)) keys.push(slot);
  }
  return keys;
}

/** A description is one line in Skiss, so its newlines become spaces. */
function oneLine(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const line = text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  return line === '' ? undefined : line;
}

const list = (items: string[]): string => items.map((item) => `\`${item}\``).join(', ');

const at0 = (text: string): Name => ({ text, line: 0, col: 0, end: 0 });

const stringType = (many: boolean): TypeRef => ({
  kind: 'primitive',
  name: 'string',
  written: at0('string'),
  many,
});

const schemaElement = (root: Record<string, unknown>): string =>
  stringOf(get(root, 'name')) ?? 'schema';

/** A schema this cannot read at all: an empty sketch and one report saying why. */
const nothing = (element: string, detail: string): FromLinkMLResult => ({
  document: parse(''),
  source: '',
  dropped: [{ kind: 'schema', element, detail }],
});
