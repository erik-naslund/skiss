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

/** Codes from the table in docs/ARCHITECTURE.md. `resolve` adds the `W_` codes. */
export type DiagnosticCode =
  | 'E_UNPARSABLE'
  | 'E_FIELD_WITHOUT_CLASS'
  | 'E_MISSING_TYPE'
  | 'E_UNCLOSED_MANY'
  | 'E_BAD_NAME';

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
}
