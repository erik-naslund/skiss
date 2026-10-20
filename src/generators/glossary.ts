// Document -> a Markdown glossary (issue #90). A sketch is also where each
// thing is defined, so the terminology page is written out of the sketch
// rather than kept beside it and allowed to drift.
//
// A string builder and nothing more, as the Mermaid generator is: Markdown is
// a reading format, not a structure this package models. Never throws.
//
// SPEC §3.9 decides the one rule worth stating here: a doubt is never
// documentation, so no `? text` appears anywhere unless `notes` asks for it.

import type { ClassNode, FieldNode, TypeRef } from '../ast.ts';
import { type ResolvedDocument, resolve } from '../resolve.ts';

export interface GlossaryOptions {
  /** The `#` heading. Normally the file name; defaults to `Glossary`. */
  name?: string;
  /** Write the terms alone: one row per class, no fields. Off by default. */
  classes?: boolean;
  /** Add the `? text` doubts as open questions. Off by default. */
  notes?: boolean;
}

const DEFAULT_NAME = 'Glossary';

export function toGlossary(doc: ResolvedDocument, opts?: GlossaryOptions): string {
  // A document that has not been through `resolve` has no `undeclared` list
  // and may still carry a second `*`. Resolving is idempotent, so a resolved
  // document comes out unchanged and the output is the same either way.
  const resolved = resolve(doc);
  const notes = opts?.notes === true;
  // A class reference links to the section of the class it names, which only
  // a declared class has (SPEC §3.2).
  const declared = new Set(resolved.classes.map((cls) => cls.name.text));

  const blocks: string[] = [`# ${opts?.name ?? DEFAULT_NAME}`];
  // SPEC §3.1: the document description describes the whole sketch, so it is
  // the first thing under the heading.
  const description = resolved.description;
  if (description !== undefined && description !== '') blocks.push(description);

  if (opts?.classes === true) blocks.push(termTable(resolved.classes, notes));
  else for (const cls of resolved.classes) blocks.push(...section(cls, declared, notes));

  return `${blocks.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------
// The full form: one section per class, in sketch order.

function section(cls: ClassNode, declared: ReadonlySet<string>, notes: boolean): string[] {
  const out: string[] = [`## ${cls.name.text}`];

  const paragraph = sentencesOf(cls).join(' ');
  if (paragraph !== '') out.push(paragraph);

  // A class with no fields of its own gets no table: a header row over
  // nothing says less than leaving it out. An inherited field is not
  // repeated; `Extends Parent.` above says where to read it.
  if (cls.fields.length > 0) out.push(fieldTable(cls, declared));

  if (notes) {
    const questions = openQuestions(cls);
    if (questions.length > 0) out.push('**Open questions**', questions.join('\n'));
  }
  return out;
}

const FIELD_COLUMNS = ['Field', 'Type', 'Description'];

function fieldTable(cls: ClassNode, declared: ReadonlySet<string>): string {
  const rows = [row(FIELD_COLUMNS), divider(FIELD_COLUMNS.length)];
  for (const field of cls.fields) {
    rows.push(row([field.name.text, typeCell(field, declared), descriptionCell(field)]));
  }
  return rows.join('\n');
}

/**
 * `identifier` for `*`, whatever the type it also carries; a class reference
 * as a link to its section; `X[]` as `list of X`; an enum as its values. A
 * field with no type at all has an empty cell, which is what the sketch said.
 */
function typeCell(field: FieldNode, declared: ReadonlySet<string>): string {
  const parts: string[] = [];
  if (field.identifier) parts.push('identifier');
  const type = typeText(field.type, declared);
  if (type !== undefined) parts.push(type);
  return parts.join(', ');
}

function typeText(type: TypeRef | undefined, declared: ReadonlySet<string>): string | undefined {
  if (type === undefined) return undefined;
  let text: string;
  switch (type.kind) {
    case 'primitive':
      // The word as it was typed, so the alias `integer` reads as written.
      text = type.written.text;
      break;
    case 'unknown':
      text = type.name.text;
      break;
    case 'class':
      // An undeclared class has no section to point at, so it is plain text.
      text = declared.has(type.name.text) ? link(type.name.text) : type.name.text;
      break;
    case 'enum':
      text = type.values.map((value) => value.text).join(' / ');
      break;
  }
  return type.many ? `list of ${text}` : text;
}

/** The anchor GitHub generates for `## ClassName`: the name, lowercased. */
const link = (name: string): string => `[${name}](#${name.toLowerCase()})`;

/**
 * The description as it was written, then what the markers on the line say
 * about where the field lives and what it joins to. The `#` text is not
 * capitalised here — a field description is a note in a cell, not the
 * definition of a term — but it is given a full stop when one of those
 * sentences follows it, so the two do not read as one.
 */
function descriptionCell(field: FieldNode): string {
  const sentences: string[] = [];
  if (field.system !== undefined) sentences.push(`System: ${field.system.text}.`);
  if (field.joinsTo !== undefined) {
    sentences.push(`Joins to ${field.joinsTo.className.text}.${field.joinsTo.fieldName.text}.`);
  }

  const description = field.description;
  if (description === undefined || description === '') return sentences.join(' ');
  if (sentences.length === 0) return description;
  return [stopped(description), ...sentences].join(' ');
}

// ---------------------------------------------------------------------------
// `--classes`: the terms alone.

function termTable(classes: ClassNode[], notes: boolean): string {
  const columns = notes ? ['Term', 'Definition', 'Open questions'] : ['Term', 'Definition'];
  const rows = [row(columns), divider(columns.length)];
  for (const cls of classes) {
    const cells = [cls.name.text, sentencesOf(cls).join(' ')];
    // A class with no definition keeps its row with an empty cell, so the
    // gap is visible: a glossary is read for the words that are missing too.
    if (notes) cells.push(doubtsOf(cls.note).join('<br>'));
    rows.push(row(cells));
  }
  return rows.join('\n');
}

// ---------------------------------------------------------------------------

/**
 * What a class is, as sentences: the system that owns it, what it extends,
 * what it is similar to, and then its own description, which is a definition
 * and so is capitalised and given a full stop.
 */
function sentencesOf(cls: ClassNode): string[] {
  const out: string[] = [];
  if (cls.system !== undefined) out.push(`System: ${cls.system.text}.`);
  if (cls.parent !== undefined) out.push(`Extends ${cls.parent.text}.`);
  if (cls.similarTo !== undefined) out.push(`Similar to ${cls.similarTo.text}.`);
  if (cls.description !== undefined && cls.description !== '') out.push(sentence(cls.description));
  return out;
}

/** A definition reads as a sentence: a capital at the front, a stop at the end. */
const sentence = (text: string): string => stopped(text.charAt(0).toUpperCase() + text.slice(1));

/** The text with a full stop, unless it already ends in one of its own. */
const stopped = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/** SPEC §3.9: the doubts of one element, one open question per line. */
const doubtsOf = (note: string | undefined): string[] =>
  note === undefined ? [] : note.split('\n').filter((doubt) => doubt !== '');

/** The class's own doubts first, bare, then one line per field doubt. */
function openQuestions(cls: ClassNode): string[] {
  const out = doubtsOf(cls.note).map((doubt) => `- ${doubt}`);
  for (const field of cls.fields) {
    for (const doubt of doubtsOf(field.note)) out.push(`- ${field.name.text}: ${doubt}`);
  }
  return out;
}

/**
 * One row. A cell is written with a space on each side, so an empty one is
 * `| |`, and a `|` in the text is escaped: it would otherwise end the cell.
 * A cell never contains a newline, because a Markdown table row is one line.
 */
const row = (cells: string[]): string =>
  `|${cells.map((cell) => (cell === '' ? ' ' : ` ${cellText(cell)} `)).join('|')}|`;

const divider = (columns: number): string => `|${'---|'.repeat(columns)}`;

const cellText = (text: string): string => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
