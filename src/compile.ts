// The whole path in one call, for callers that want one (ADR 0006): parse,
// resolve, generate. Never throws, because nothing it calls does; bad input
// produces diagnostics and the output of the partial document.

import type { Diagnostic } from './ast.ts';
import { type MermaidOptions, toMermaid } from './generators/mermaid.ts';
import { parse } from './parse.ts';
import { resolve } from './resolve.ts';

export interface CompileOptions extends MermaidOptions {
  /** What to produce. Only `mermaid` exists in 0.1.0; `linkml` arrives with `skiss compile`. */
  target: 'mermaid';
}

export interface CompileResult {
  /** The generated text, `\n`-terminated, whatever the platform. */
  output: string;
  /** Errors from `parse` and warnings from `resolve`, in line order. */
  diagnostics: Diagnostic[];
}

export function compile(source: string, opts: CompileOptions): CompileResult {
  const doc = resolve(parse(source));
  return { output: toMermaid(doc, { notes: opts.notes }), diagnostics: doc.diagnostics };
}
