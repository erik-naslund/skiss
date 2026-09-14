// The abstract syntax tree `parse` produces and the rest of the library
// consumes. Plain data only: every value here can be JSON.stringify'd and
// compared structurally. See docs/ARCHITECTURE.md (AST) and ADR 0004.

/** Lines are 1-based. Columns are 0-based UTF-16 code units, `end` exclusive. */
export interface Name {
  text: string;
  line: number;
  col: number;
  end: number;
}

/** SPEC §3.2. The aliases `text`, `integer` and `boolean` are normalised to these. */
export type Primitive = 'string' | 'int' | 'float' | 'bool' | 'date' | 'datetime' | 'uri';

/**
 * The type after a colon (SPEC §3.2 to §3.4). `many` is the trailing `[]`
 * and applies to the whole type. `unknown` is a lowercase word that is not a
 * primitive: `resolve` turns it into a warning and generators treat it as
 * `string`.
 */
export type TypeRef =
  | {
      kind: 'primitive';
      name: Primitive;
      /** The token as written, so an alias such as `integer` survives verbatim. */
      written: Name;
      many: boolean;
    }
  | { kind: 'class'; name: Name; many: boolean }
  | { kind: 'enum'; values: Name[]; many: boolean }
  | { kind: 'unknown'; name: Name; many: boolean };

export interface JoinRef {
  className: Name;
  fieldName: Name;
}

export interface FieldNode {
  name: Name;
  identifier: boolean;
  /**
   * Where the `*` is written, set by `parse` whenever one is present.
   * Whitespace before `*` is allowed, so the position cannot be derived from
   * the field name, and `resolve` points W_MULTIPLE_IDENTIFIERS at it. It
   * stays as written when `resolve` clears `identifier` on a second `*`.
   */
  identifierAt?: Name;
  type?: TypeRef;
  system?: Name;
  joinsTo?: JoinRef;
  description?: string;
  note?: string;
  line: number;
}

export interface ClassNode {
  name: Name;
  system?: Name;
  similarTo?: Name;
  description?: string;
  note?: string;
  fields: FieldNode[];
  line: number;
}

export type Severity = 'error' | 'warning';

/**
 * Codes from the tables in docs/ARCHITECTURE.md. `parse` adds the `E_` codes,
 * `resolve` the `W_` codes, and `importLinkML` the one code of its own,
 * `E_NOT_YAML`, for a text no schema can be read out of.
 */
export type DiagnosticCode =
  | 'E_UNPARSABLE'
  | 'E_FIELD_WITHOUT_CLASS'
  | 'E_MISSING_TYPE'
  | 'E_UNCLOSED_MANY'
  | 'E_BAD_NAME'
  | 'W_UNKNOWN_TYPE'
  | 'W_UNDECLARED_CLASS'
  | 'W_UNDECLARED_FIELD'
  | 'W_DUPLICATE_CLASS'
  | 'W_DUPLICATE_FIELD'
  | 'W_DUPLICATE_ENUM_VALUE'
  | 'W_MULTIPLE_IDENTIFIERS'
  | 'E_NOT_YAML';

export interface Diagnostic {
  severity: Severity;
  code: DiagnosticCode;
  message: string;
  line: number;
  col?: number;
  end?: number;
}

export interface Document {
  classes: ClassNode[];
  diagnostics: Diagnostic[];
  /**
   * Class names referenced by `:`, `~` or `=` but never declared, each once,
   * in first-reference order and at its first reference's position. Absent
   * until `resolve` has run; a generator draws these as placeholders.
   */
  undeclared?: Name[];
}
