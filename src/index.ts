export type {
  ClassNode,
  Diagnostic,
  DiagnosticCode,
  Document,
  FieldNode,
  JoinRef,
  Name,
  Primitive,
  Severity,
  TypeRef,
} from './ast.ts';
export { parse } from './parse.ts';
export { type ResolvedDocument, resolve } from './resolve.ts';

export const VERSION = '0.0.0';
