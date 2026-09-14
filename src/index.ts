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
export {
  type CompileOptions,
  type CompileResult,
  compile,
  type LinkMLCompileOptions,
  type MermaidCompileOptions,
} from './compile.ts';
export { formatDiagnostic } from './diagnostics.ts';
export {
  type LinkMLAnnotations,
  type LinkMLAttribute,
  type LinkMLClass,
  type LinkMLEnum,
  type LinkMLOptions,
  type LinkMLSchema,
  toLinkML,
} from './generators/linkml.ts';
export { type MermaidOptions, toMermaid } from './generators/mermaid.ts';
export { parse } from './parse.ts';
export { type ResolvedDocument, resolve } from './resolve.ts';
export { type SerializeFormat, serialize } from './serialize.ts';

export const VERSION = '0.1.0';
