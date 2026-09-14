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
export { type CompileOptions, type CompileResult, compile } from './compile.ts';
export { formatDiagnostic } from './diagnostics.ts';
export { type MermaidOptions, toMermaid } from './generators/mermaid.ts';
export { parse } from './parse.ts';
export { type ResolvedDocument, resolve } from './resolve.ts';

export const VERSION = '0.1.0';
