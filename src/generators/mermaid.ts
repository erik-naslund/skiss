// Document -> Mermaid classDiagram text. The mapping table in
// docs/ARCHITECTURE.md (Mermaid mapping) is the contract; the `.mmd`
// fixtures are its reference output.
//
// A string builder and nothing more: Mermaid is a validation aid, not a
// rendering layer, so no abstraction is built on top of it. Never throws.

import type { Document, FieldNode, TypeRef } from '../ast.ts';
import { resolve } from '../resolve.ts';

export interface MermaidOptions {
  /** Emit `? text` doubts as `note for` lines. Off by default. */
  notes?: boolean;
}

export function toMermaid(doc: Document, opts?: MermaidOptions): string {
  // A document that has not been through `resolve` has no `undeclared`
  // list and may still carry a second `*`. Resolving is idempotent, so a
  // resolved document comes out unchanged and the output is the same either way.
  const resolved = resolve(doc);
  const notes = opts?.notes === true;

  // Output order per the table: classes, undeclared placeholders, notes,
  // relations. Notes must precede every relation line; Mermaid fails to
  // parse a note that follows a `..>` relation.
  const lines: string[] = ['classDiagram'];

  for (const cls of resolved.classes) {
    lines.push(`  class ${cls.name.text} {`);
    if (cls.system !== undefined) lines.push(`    <<${cls.system.text}>>`);
    for (const field of cls.fields) lines.push(`    ${member(field)}`);
    lines.push('  }');
  }

  for (const name of resolved.undeclared) {
    lines.push(`  class ${name.text} {`, '    <<undeclared>>', '  }');
  }

  if (notes) {
    for (const cls of resolved.classes) {
      if (cls.note !== undefined) lines.push(`  note for ${cls.name.text} ${quote(cls.note)}`);
      for (const field of cls.fields) {
        if (field.note !== undefined) {
          lines.push(`  note for ${cls.name.text} ${quote(`${field.name.text}: ${field.note}`)}`);
        }
      }
    }
  }

  for (const cls of resolved.classes) {
    const from = cls.name.text;
    // SPEC §3.10. Mermaid draws inheritance parent-first and unlabelled; the
    // parent's fields are not repeated in the child's box. `resolve` has
    // already cleared the `<` that closes a circle.
    if (cls.parent !== undefined) lines.push(`  ${cls.parent.text} <|-- ${from}`);
    // `~` is Mermaid's generic-type delimiter and vanishes from labels, so
    // the label is the word `similar`.
    if (cls.similarTo !== undefined) lines.push(`  ${from} ..> ${cls.similarTo.text} : similar`);
    for (const field of cls.fields) {
      const type = field.type;
      if (type?.kind === 'class') {
        lines.push(
          type.many
            ? `  ${from} "1" --> "*" ${type.name.text} : ${field.name.text}`
            : `  ${from} --> ${type.name.text} : ${field.name.text}`,
        );
      }
      if (field.joinsTo !== undefined) {
        const { className, fieldName } = field.joinsTo;
        lines.push(`  ${from} ..> ${className.text} : ${field.name.text} = ${fieldName.text}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

// `*` replaces the `+` visibility marker for an identifier; a trailing `*`
// would be Mermaid's abstract-member marker and disappear.
function member(field: FieldNode): string {
  const marker = field.identifier ? '*' : '+';
  const type = field.type === undefined ? '' : `${typeText(field.type)} `;
  const system = field.system === undefined ? '' : ` @${field.system.text}`;
  return `${marker}${type}${field.name.text}${system}`;
}

// The Skiss type text verbatim: an alias such as `integer` and an unknown
// type such as `itn` are written as typed, enum values joined with `|`,
// `[]` appended for many.
function typeText(type: TypeRef): string {
  let text: string;
  switch (type.kind) {
    case 'primitive':
      text = type.written.text;
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

// A note is a double-quoted Mermaid string, so a double quote inside the
// doubt becomes a single quote (issue #5, AC4).
const quote = (text: string): string => `"${text.replaceAll('"', "'")}"`;
