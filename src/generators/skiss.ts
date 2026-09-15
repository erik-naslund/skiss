// Document -> canonical Skiss text (issue #45). The other half of a
// projection: `toLinkML` writes a schema out, this writes a Document back as
// the notation itself.
//
// Canonical, not faithful: the AST holds what a line means, not how it was
// typed, so the printer picks one layout for every document. Positions and
// diagnostics are ignored, which is why the output of a document that came
// from `parse` is byte-identical to a source file already written this way.
// Never throws.

import type { ClassNode, Document, FieldNode, TypeRef } from '../ast.ts';

/**
 * Where a `#` description or `?` doubt starts, 0-based. A constant and not an
 * option (issue #45, working default D1): this is the column `basic.skiss`
 * and `systems.skiss` are written at.
 */
const TRAILER_COLUMN = 40;

export function toSkiss(doc: Document): string {
  // A document with no classes is the empty string, not a blank line: the
  // format has no leading or trailing blank lines, so there is nothing left.
  if (doc.classes.length === 0) return '';
  return `${doc.classes.map(classBlock).join('\n\n')}\n`;
}

// SPEC §2: the class line, then its fields at a two-space indent.
function classBlock(cls: ClassNode): string {
  const head =
    cls.name.text +
    (cls.system === undefined ? '' : ` @${cls.system.text}`) +
    (cls.similarTo === undefined ? '' : ` ~ ${cls.similarTo.text}`);
  return [withTrailer(head, cls), ...cls.fields.map(fieldLine)].join('\n');
}

// SPEC §4: the modifier order is fixed, so the printer has no choices to make.
function fieldLine(field: FieldNode): string {
  const type = typeText(field.type);
  const head =
    `  ${field.name.text}` +
    (field.identifier ? '*' : '') +
    (type === undefined ? '' : `: ${type}`) +
    (field.system === undefined ? '' : ` @${field.system.text}`) +
    (field.joinsTo === undefined
      ? ''
      : ` = ${field.joinsTo.className.text}.${field.joinsTo.fieldName.text}`);
  return withTrailer(head, field);
}

/**
 * The type as written after the colon, or `undefined` for a field that needs
 * no colon at all: a plain `string` is what a field without one means
 * (SPEC §3.2), so printing it would be noise. `string[]` still needs the
 * colon, because `[]` has nothing to attach to without it.
 *
 * A primitive prints its canonical name, so `integer` comes back as `int`. An
 * unknown type prints the word as written, so it survives a round trip
 * (issue #45, working default D2).
 */
function typeText(type: TypeRef | undefined): string | undefined {
  if (type === undefined) return undefined;
  let text: string;
  switch (type.kind) {
    case 'primitive':
      if (type.name === 'string' && !type.many) return undefined;
      text = type.name;
      break;
    case 'class':
    case 'unknown':
      text = type.name.text;
      break;
    case 'enum':
      text = type.values.map((v) => v.text).join('|');
      break;
  }
  return type.many ? `${text}[]` : text;
}

/**
 * The `#` marker and a description as this printer writes them, SPEC §8.
 *
 * A standalone `?` in the text — whitespace before it, whitespace or the end
 * of the line after it — would start a doubt when the line is parsed again
 * (SPEC §3.9), splitting the sentence and taking any doubt already on the
 * element with it. Attaching it to the word before it, by dropping the
 * whitespace between them, is ordinary text by the same rule. A `?` with no
 * word before it has only the marker to attach to, so the marker keeps no
 * space: `#? confirm`.
 */
export function writeDescription(text: string): string {
  const attached = text.replace(/[ \t]+\?(?=[ \t]|$)/g, '?');
  return /^\?([ \t]|$)/.test(attached) ? `#${attached}` : `# ${attached}`;
}

/**
 * True when `writeDescription` had to reword the text. SPEC §8 reports every
 * description it changes, and the projection reads the rule from here rather
 * than keeping a second copy of it.
 */
export const rewordsDescription = (text: string): boolean => writeDescription(text) !== `# ${text}`;

/**
 * SPEC §3.9: the description comes first and the doubt ends it. The trailer
 * starts at `TRAILER_COLUMN`, or two spaces after the line when the line is
 * already that long, so there is always whitespace before the marker for
 * `parse` to delimit on.
 */
function withTrailer(head: string, node: { description?: string; note?: string }): string {
  const parts: string[] = [];
  // An empty description or doubt is dropped rather than printed as a bare
  // marker: `parse` never produces one, and a trailing `# ` would not survive
  // a round trip.
  if (node.description !== undefined && node.description !== '')
    parts.push(writeDescription(node.description));
  if (node.note !== undefined && node.note !== '') parts.push(`? ${node.note}`);
  if (parts.length === 0) return head;
  const gap = head.length < TRAILER_COLUMN - 1 ? ' '.repeat(TRAILER_COLUMN - head.length) : '  ';
  return head + gap + parts.join(' ');
}
