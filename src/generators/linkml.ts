// Document -> LinkML schema as a plain object. SPEC §5 is the contract and
// the `.linkml.yaml` fixtures are its reference output, checked by the real
// LinkML toolchain.
//
// No YAML here: the schema object is the generator's output and `serialize`
// turns it into text (ADR 0006). Fields become class-local `attributes` and
// never top-level `slots` (ADR 0005). Never throws.

import type { ClassNode, Document, FieldNode, Primitive } from '../ast.ts';
import { resolve } from '../resolve.ts';

/** A LinkML `annotations` block in the compact `tag: value` form (SPEC §5.3). */
export interface LinkMLAnnotations {
  [tag: string]: string | boolean;
}

/** One entry under a class's `attributes`. Key order is SPEC §5.3. */
export interface LinkMLAttribute {
  description?: string;
  range?: string;
  multivalued?: boolean;
  identifier?: boolean;
  annotations?: LinkMLAnnotations;
}

/** One entry under `classes`. Key order is SPEC §5.3. */
export interface LinkMLClass {
  description?: string;
  annotations?: LinkMLAnnotations;
  close_mappings?: string[];
  attributes?: Record<string, LinkMLAttribute>;
}

/** One entry under `enums`. A permissible value carries no body, hence `null`. */
export interface LinkMLEnum {
  permissible_values: Record<string, null>;
}

/** The whole schema. Plain data: every value here survives `JSON.stringify`. */
export interface LinkMLSchema {
  id: string;
  name: string;
  default_prefix: string;
  default_range: string;
  prefixes: Record<string, string>;
  imports: string[];
  classes?: Record<string, LinkMLClass>;
  enums?: Record<string, LinkMLEnum>;
}

export interface LinkMLOptions {
  /** Normally the file name. Normalised to a valid LinkML name (SPEC §5.2). */
  schemaName: string;
}

/** SPEC §5.2: the base URI is a placeholder. */
const BASE_URI = 'https://example.org';

/** SPEC §3.2 primitives to the LinkML built-in types `linkml:types` defines. */
const RANGE: Record<Primitive, string> = {
  string: 'string',
  int: 'integer',
  float: 'float',
  bool: 'boolean',
  date: 'date',
  datetime: 'datetime',
  uri: 'uri',
};

export function toLinkML(doc: Document, opts: LinkMLOptions): LinkMLSchema {
  // A document that has not been through `resolve` has no `undeclared` list
  // and may still carry a second `*`. Resolving is idempotent, so a resolved
  // document comes out unchanged and the output is the same either way.
  const resolved = resolve(doc);
  const schemaName = linkmlName(opts.schemaName);

  const classes = emittedClasses(resolved.classes);
  // LinkML keeps classes and enums in one namespace, so the enum names have to
  // avoid every class this schema emits, the undeclared stubs included.
  const classNames = new Set(classes.map((cls) => cls.node.name.text));
  for (const name of resolved.undeclared) classNames.add(name.text);
  const enums = nameEnums(classes, classNames);

  // SPEC §5.2. `linkml` and the schema's own prefix come first; a system
  // prefix that would collide with either is not allowed to overwrite it.
  // `Object.hasOwn`, not `in`: `prefixes` is a plain object, so `in` is true
  // for `constructor` and the other `Object.prototype` keys and a real prefix
  // would be dropped.
  const prefixes: Record<string, string> = { linkml: 'https://w3id.org/linkml/' };
  if (!Object.hasOwn(prefixes, schemaName)) prefixes[schemaName] = `${BASE_URI}/${schemaName}/`;

  // One prefix per distinct `@System`, in the order the systems are written:
  // a class line before its own fields.
  const systemPrefix = new Map<string, string>();
  const addSystem = (system: string): void => {
    const prefix = linkmlName(system);
    if (!systemPrefix.has(system)) systemPrefix.set(system, prefix);
    if (!Object.hasOwn(prefixes, prefix)) prefixes[prefix] = `${BASE_URI}/system/${prefix}/`;
  };
  for (const { node, fields } of classes) {
    if (node.system !== undefined) addSystem(node.system.text);
    for (const field of fields) {
      if (field.system !== undefined) addSystem(field.system.text);
    }
  }

  // SPEC §5.1, mapping prefix: `~ Other` uses the prefix of Other's system
  // when Other is declared with an `@`, otherwise the schema's own prefix.
  const declaredSystem = new Map<string, string | undefined>();
  for (const { node } of classes) {
    if (!declaredSystem.has(node.name.text)) declaredSystem.set(node.name.text, node.system?.text);
  }
  const mappingPrefix = (target: string): string => {
    const system = declaredSystem.get(target);
    if (system === undefined) return schemaName;
    return systemPrefix.get(system) ?? schemaName;
  };

  const schema: LinkMLSchema = {
    id: `${BASE_URI}/${schemaName}`,
    name: schemaName,
    default_prefix: schemaName,
    default_range: 'string',
    prefixes,
    imports: ['linkml:types'],
  };

  const out: Record<string, LinkMLClass> = {};
  for (const cls of classes) {
    out[cls.node.name.text] = buildClass(cls, mappingPrefix, enums);
  }
  // SPEC §5.1: a reference to an undeclared class becomes a stub, after the
  // classes that are declared.
  for (const name of resolved.undeclared) {
    if (!(name.text in out)) out[name.text] = { annotations: { undeclared: true } };
  }
  if (Object.keys(out).length > 0) schema.classes = out;

  const enumBlock = buildEnums(classes, enums);
  if (Object.keys(enumBlock).length > 0) schema.enums = enumBlock;

  return schema;
}

// ---------------------------------------------------------------------------
// Which nodes are emitted at all.

interface EmittedClass {
  node: ClassNode;
  /** The class's fields with duplicate names dropped, first declaration first. */
  fields: FieldNode[];
}

/**
 * Issue #17: `resolve` keeps both nodes of a duplicated class, which is what a
 * live preview should show, but LinkML classes are keyed by name and two nodes
 * with `*` would give one class two identifiers. The first declaration wins and
 * the later ones are not emitted; the `W_DUPLICATE_CLASS` warning already says
 * so. The same applies to a duplicate field inside one class.
 */
function emittedClasses(classes: ClassNode[]): EmittedClass[] {
  const out: EmittedClass[] = [];
  const seen = new Set<string>();
  for (const node of classes) {
    if (seen.has(node.name.text)) continue;
    seen.add(node.name.text);
    const fields: FieldNode[] = [];
    const seenField = new Set<string>();
    for (const field of node.fields) {
      if (seenField.has(field.name.text)) continue;
      seenField.add(field.name.text);
      fields.push(field);
    }
    out.push({ node, fields });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Enum naming, SPEC §5.1.

/** The key an enum's name is looked up by: one attribute of one class. */
const useKey = (className: string, fieldName: string): string => `${className}\u0000${fieldName}`;

/**
 * An inline enum on field `climate` becomes `ClimateEnum`. Fields with the same
 * name and identical value sets share one enum; fields with the same name and
 * different value sets are each class-qualified (`PlanetClimateEnum`).
 *
 * Working default: "identical" is the values in the order written, and one
 * differing value set qualifies every field of that name, including the ones
 * that agree with each other.
 */
function nameEnums(classes: EmittedClass[], classNames: ReadonlySet<string>): Map<string, string> {
  const uses: { className: string; fieldName: string; values: string }[] = [];
  for (const { node, fields } of classes) {
    for (const field of fields) {
      if (field.type?.kind !== 'enum') continue;
      uses.push({
        className: node.name.text,
        fieldName: field.name.text,
        values: field.type.values.map((v) => v.text).join('|'),
      });
    }
  }

  const valueSets = new Map<string, Set<string>>();
  for (const use of uses) {
    const seen = valueSets.get(use.fieldName) ?? new Set<string>();
    seen.add(use.values);
    valueSets.set(use.fieldName, seen);
  }

  // Working default: two value sets that still collide after qualification
  // (field `bookStatus` against `status` on class `Book`) keep separate enums,
  // the later one numbered. SPEC §5.1 does not cover the case. A name a class
  // already holds is numbered the same way: `gen-python` refuses a schema with
  // overlapping enum and class names.
  const taken = new Map<string, string>();
  const names = new Map<string, string>();
  for (const use of uses) {
    const shared = (valueSets.get(use.fieldName)?.size ?? 0) <= 1;
    const base = shared
      ? `${capitalise(use.fieldName)}Enum`
      : `${capitalise(use.className)}${capitalise(use.fieldName)}Enum`;
    let name = base;
    for (
      let n = 2;
      classNames.has(name) || (taken.has(name) && taken.get(name) !== use.values);
      n++
    ) {
      name = `${base}${n}`;
    }
    taken.set(name, use.values);
    names.set(useKey(use.className, use.fieldName), name);
  }
  return names;
}

/** The `enums` block, each enum at its first use and its values as written. */
function buildEnums(
  classes: EmittedClass[],
  enums: Map<string, string>,
): Record<string, LinkMLEnum> {
  const out: Record<string, LinkMLEnum> = {};
  for (const { node, fields } of classes) {
    for (const field of fields) {
      if (field.type?.kind !== 'enum') continue;
      const name = enums.get(useKey(node.name.text, field.name.text));
      if (name === undefined || name in out) continue;
      const values: Record<string, null> = {};
      for (const value of field.type.values) values[value.text] = null;
      out[name] = { permissible_values: values };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classes and attributes. Key order is working default D1 of issue #23,
// matching SPEC §5.3.

function buildClass(
  cls: EmittedClass,
  mappingPrefix: (target: string) => string,
  enums: Map<string, string>,
): LinkMLClass {
  const { node, fields } = cls;
  const out: LinkMLClass = {};

  if (node.description !== undefined) out.description = node.description;

  const annotations: LinkMLAnnotations = {};
  if (node.system !== undefined) annotations.system = node.system.text;
  if (node.note !== undefined) annotations.note = node.note;
  if (Object.keys(annotations).length > 0) out.annotations = annotations;

  if (node.similarTo !== undefined) {
    const target = node.similarTo.text;
    out.close_mappings = [`${mappingPrefix(target)}:${target}`];
  }

  const attributes: Record<string, LinkMLAttribute> = {};
  for (const field of fields) {
    attributes[field.name.text] = buildAttribute(field, node.name.text, enums);
  }
  if (Object.keys(attributes).length > 0) out.attributes = attributes;

  return out;
}

function buildAttribute(
  field: FieldNode,
  className: string,
  enums: Map<string, string>,
): LinkMLAttribute {
  const out: LinkMLAttribute = {};

  if (field.description !== undefined) out.description = field.description;

  const range = rangeOf(field, className, enums);
  if (range !== undefined) out.range = range;
  if (field.type?.many === true) out.multivalued = true;
  if (field.identifier) out.identifier = true;

  // Annotation order is the order the markers are written on the line
  // (SPEC §4): `@System`, then `= Class.field`, then `?`.
  const annotations: LinkMLAnnotations = {};
  if (field.system !== undefined) annotations.system = field.system.text;
  if (field.joinsTo !== undefined) {
    annotations.joins_to = `${field.joinsTo.className.text}.${field.joinsTo.fieldName.text}`;
  }
  if (field.note !== undefined) annotations.note = field.note;
  if (Object.keys(annotations).length > 0) out.annotations = annotations;

  return out;
}

/**
 * SPEC §5.1. A field with no colon has no `range` at all and takes `string`
 * from `default_range`; an unknown type is a warning at resolve time and
 * compiles to `string` here (SPEC §3.2).
 */
function rangeOf(
  field: FieldNode,
  className: string,
  enums: Map<string, string>,
): string | undefined {
  const type = field.type;
  if (type === undefined) return undefined;
  switch (type.kind) {
    case 'primitive':
      return RANGE[type.name];
    case 'class':
      return type.name.text;
    case 'unknown':
      return 'string';
    case 'enum':
      return enums.get(useKey(className, field.name.text));
  }
}

// ---------------------------------------------------------------------------

/**
 * SPEC §5.2: lowercase, every non-alphanumeric an underscore. A LinkML name
 * must match `^[a-zA-Z_][\w.-]*$`, so a result that is empty or starts with a
 * digit (`2024-inventory.skiss`, `123.skiss`) takes a leading underscore.
 */
// A valid LinkML name matches `^[a-zA-Z_][\w.-]*$`, and a schema name is
// also its prefix, which RDF forbids to be the bare `_` (blank nodes). So a
// name with no letters or digits at all becomes `schema`, and one that starts
// with a digit gets a `_` in front.
const linkmlName = (text: string): string => {
  const name = text.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (!/[a-z0-9]/.test(name)) return 'schema';
  return /^[0-9]/.test(name) ? `_${name}` : name;
};

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
