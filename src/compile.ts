// The whole path in one call, for callers that want one (ADR 0006): parse,
// resolve, generate. Never throws, because nothing it calls does; bad input
// produces diagnostics and the output of the partial document.

import type { Diagnostic } from './ast.ts';
import { toLinkML } from './generators/linkml.ts';
import { type MermaidOptions, toMermaid } from './generators/mermaid.ts';
import { parse } from './parse.ts';
import { resolve } from './resolve.ts';
import { type SerializeFormat, serialize } from './serialize.ts';

/** `toMermaid` text from the source. */
export interface MermaidCompileOptions extends MermaidOptions {
  target: 'mermaid';
}

/** `toLinkML` put through `serialize` (ADR 0006). */
export interface LinkMLCompileOptions {
  target: 'linkml';
  /** Normally the file name. Normalised to a valid LinkML name (SPEC §5.2). */
  schemaName: string;
  /** Defaults to `yaml`, the form LinkML itself reads. */
  format?: SerializeFormat;
}

/**
 * A union rather than one shape with optional keys, so `schemaName` is
 * required exactly when it is used and a `mermaid` call cannot carry a
 * `format` that would be ignored.
 */
export type CompileOptions = MermaidCompileOptions | LinkMLCompileOptions;

export interface CompileResult {
  /** The generated text, `\n`-terminated, whatever the platform. */
  output: string;
  /** Errors from `parse` and warnings from `resolve`, in line order. */
  diagnostics: Diagnostic[];
}

export function compile(source: string, opts: CompileOptions): CompileResult {
  const doc = resolve(parse(source));
  const output =
    opts.target === 'linkml'
      ? serialize(toLinkML(doc, { schemaName: opts.schemaName }), opts.format ?? 'yaml')
      : toMermaid(doc, { notes: opts.notes });
  return { output, diagnostics: doc.diagnostics };
}
