// One diagnostic as one line of text, in the `file:line:col: severity CODE
// message` shape compilers print and editors and terminals know how to
// jump to. Shared by the CLI and any editor that wants the same text
// (issue #6, working default D4).

import type { Diagnostic } from './ast.ts';

/**
 * `<file>:<line>:<col>: <severity> <CODE> <message>`, without a trailing
 * newline. The `<file>:` prefix is omitted when `file` is not given, and
 * `<col>` when the diagnostic has no column. Columns are printed 1-based, as
 * the `file:line:col` convention expects, while `Diagnostic.col` stays
 * 0-based for editors.
 */
export function formatDiagnostic(d: Diagnostic, file?: string): string {
  const where = [file, d.line, d.col === undefined ? undefined : d.col + 1]
    .filter((part) => part !== undefined)
    .join(':');
  return `${where}: ${d.severity} ${d.code} ${d.message}`;
}
