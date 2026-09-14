// LinkML schema object -> text (ADR 0006). The generator returns data; this
// is the only place that knows about YAML, and `yaml` is the library's only
// runtime dependency.
//
// The YAML is held to SPEC §5.3 byte for byte, which means two-space
// indentation, block style, no document markers, and a blank line before
// `classes:`, before `enums:` and before every class.

import { isMap, isScalar, Scalar, visit, Document as YAMLDocument } from 'yaml';
import type { LinkMLSchema } from './generators/linkml.ts';

export type SerializeFormat = 'yaml' | 'json';

export function serialize(schema: LinkMLSchema, format: SerializeFormat): string {
  if (format === 'json') return `${JSON.stringify(schema, null, 2)}\n`;

  // LinkML reads the file with PyYAML, which is YAML 1.1: there `yes`, `no`,
  // `on`, `off`, `y`, `n` and `12:30` are not strings. Building the document
  // in 1.1 makes the writer quote them, so a description stays the text the
  // sketch wrote.
  const doc = new YAMLDocument(schema, { version: '1.1' });
  const root = doc.contents;
  if (isMap(root)) {
    for (const pair of root.items) {
      const key = pair.key;
      if (!isScalar(key)) continue;
      if (key.value !== 'classes' && key.value !== 'enums') continue;
      key.spaceBefore = true;
      // A blank line before every class, the first one included, so the
      // section reads as separated blocks rather than one wall of keys.
      if (key.value === 'classes' && isMap(pair.value)) {
        for (const entry of pair.value.items) {
          if (isScalar(entry.key)) entry.key.spaceBefore = true;
        }
      }
    }
  }

  // A tab or another control character in a plain scalar is either illegal
  // YAML (PyYAML stops at a tab that starts a token) or lost; double quoting
  // escapes it. Tabs reach here because SPEC §4 counts them as whitespace, so
  // they survive into trailer text.
  visit(doc, {
    Scalar(_, node) {
      if (typeof node.value === 'string' && hasControlCharacter(node.value)) {
        node.type = Scalar.QUOTE_DOUBLE;
      }
    },
  });

  const text = doc.toString({
    directives: false,
    indent: 2,
    lineWidth: 0,
    // A permissible value carries no body: `arid:`, not `arid: null`.
    nullStr: '',
  });
  // A blank line before the first entry of a nested map is written at the
  // map's own indentation, so the `spaceBefore` separators above are the only
  // whitespace-only lines here: `lineWidth: 0` never folds a scalar, and a
  // scalar holding a newline is double-quoted by the pass above and stays on
  // one line. Emptying them cannot reach a value.
  return text.replace(/^[ \t]+$/gm, '');
}

/** C0 controls and DEL. Written as codepoints: Biome bans them in a regex. */
function hasControlCharacter(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
