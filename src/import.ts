// LinkML text -> Skiss text (SPEC §8), the whole path in one call, as
// `compile` is the whole path the other way. `fromLinkML` takes a schema
// object, so this is where the YAML is read; `yaml` is already the library's
// one runtime dependency, and it needs nothing from Node, so this file stays
// browser-safe (ADR 0003).
//
// Never throws. YAML that cannot be read at all is one `E_NOT_YAML`
// diagnostic and no output; a schema `fromLinkML` cannot read is an empty
// sketch and a report saying why (SPEC §8).

import { parse as parseYAML } from 'yaml';
import type { Diagnostic } from './ast.ts';
import { type Dropped, fromLinkML } from './generators/from-linkml.ts';
import { resolve } from './resolve.ts';

export interface ImportResult {
  /** The projected sketch as canonical Skiss text, `\n`-terminated. */
  output: string;
  /** SPEC §8, in schema order: what the projection could not carry. */
  dropped: Dropped[];
  /** The diagnostics of the projected sketch. Their lines are lines of `output`. */
  diagnostics: Diagnostic[];
}

export function importLinkML(text: string): ImportResult {
  let schema: unknown;
  try {
    // JSON is YAML, so one parser reads both forms of a LinkML schema.
    schema = parseYAML(text);
  } catch (error) {
    return { output: '', dropped: [], diagnostics: [notYAML(error)] };
  }

  const { document, source, dropped } = fromLinkML(schema);
  // `document` is `parse(source)`, so `resolve` adds the warnings the sketch
  // would get if somebody opened the projection and read it.
  return { output: source, dropped, diagnostics: resolve(document).diagnostics };
}

/**
 * The one diagnostic of a text that is not YAML, on line 1: the reader never
 * got far enough to have a line of its own to point at. A `YAMLParseError`
 * message carries the offending source under its first line, introduced by a
 * colon; a diagnostic is one line, so the first line without that colon is
 * what is kept.
 */
function notYAML(error: unknown): Diagnostic {
  const first = error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);
  const detail = first.replace(/:$/, '');
  return {
    severity: 'error',
    code: 'E_NOT_YAML',
    message: `the input is not YAML: ${detail}`,
    line: 1,
  };
}
