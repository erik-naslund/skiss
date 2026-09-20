// The parent chain a `<` builds (SPEC §3.10), walked in one place.
//
// Inheritance is the one relation in the language that needs more than two
// lines to understand: which fields a class has depends on its parent, whose
// parent may be declared anywhere in the document, and a chain may close on
// itself. `resolve` needs that view for its diagnostics — an identifier a
// class inherits, a field identical to the one it replaces, a chain that
// closes on itself — so the walk lives here rather than inside `resolve`.
//
// Plain functions over the AST: nothing is stored on a node, nothing is
// mutated, and a chain is always walked with a `seen` set, so this terminates
// on a document nobody has resolved yet. Never throws.

import type { ClassNode, FieldNode } from './ast.ts';

export interface InheritedField {
  field: FieldNode;
  /** The class the field is written on, which is what a diagnostic names. */
  from: ClassNode;
}

export interface Inheritance {
  /**
   * The classes above this one, nearest first. Empty when it has no parent,
   * when the parent is not declared, or when its `<` closes a circle.
   */
  ancestors(cls: ClassNode): ClassNode[];
  /** The nearest inherited field with this name, if the parents have one. */
  inherited(cls: ClassNode, fieldName: string): InheritedField | undefined;
  /** The nearest inherited identifier, if the parents have one. */
  inheritedIdentifier(cls: ClassNode): InheritedField | undefined;
  /**
   * The circle this class's `<` closes, starting at the class itself and
   * running through the classes between it and itself; `undefined` when its
   * `<` closes none. The class that carries it is the last of the circle to
   * be declared, which is the line that closed it (SPEC §3.10).
   */
  circle(cls: ClassNode): ClassNode[] | undefined;
}

export function inheritance(classes: readonly ClassNode[]): Inheritance {
  // A duplicated class name is one class to everything that reads a chain:
  // the first declaration is the one LinkML emits (issue #17), so it is also
  // the one a child inherits from.
  const declared = new Map<string, ClassNode>();
  for (const cls of classes) {
    if (!declared.has(cls.name.text)) declared.set(cls.name.text, cls);
  }

  const circles = new Map<ClassNode, ClassNode[]>();
  const parentOf = (cls: ClassNode): ClassNode | undefined => {
    if (cls.parent === undefined || circles.has(cls)) return undefined;
    return declared.get(cls.parent.text);
  };

  // One walk per class, in document order. Marking the closer of a circle
  // cuts that edge, so every later walk ends.
  for (const cls of declared.values()) {
    const path: ClassNode[] = [cls];
    const seen = new Set<ClassNode>(path);
    for (let next = parentOf(cls); next !== undefined; next = parentOf(next)) {
      if (seen.has(next)) {
        // The circle is the tail of the path from where it comes back. The
        // line that closes it is the last of those declarations to be written.
        // `circle` runs parent-wards, so rotating it to start at the closer
        // is the circle as the message reads it: this class, then the classes
        // it inherits from on the way back to itself.
        const circle = path.slice(path.indexOf(next));
        let closer = circle[0] as ClassNode;
        for (const member of circle) {
          if (member.line > closer.line) closer = member;
        }
        const at = circle.indexOf(closer);
        circles.set(closer, [...circle.slice(at), ...circle.slice(0, at)]);
        break;
      }
      path.push(next);
      seen.add(next);
    }
  }

  const ancestors = (cls: ClassNode): ClassNode[] => {
    const out: ClassNode[] = [];
    const seen = new Set<ClassNode>([cls]);
    for (let next = parentOf(cls); next !== undefined; next = parentOf(next)) {
      if (seen.has(next)) break;
      out.push(next);
      seen.add(next);
    }
    return out;
  };

  const find = (
    cls: ClassNode,
    matches: (field: FieldNode) => boolean,
  ): InheritedField | undefined => {
    for (const from of ancestors(cls)) {
      // The first declaration of a field name is the one that class has
      // (issue #17), so the search stops at the first match in each class.
      const field = from.fields.find(matches);
      if (field !== undefined) return { field, from };
    }
    return undefined;
  };

  return {
    ancestors,
    inherited: (cls, fieldName) => find(cls, (field) => field.name.text === fieldName),
    inheritedIdentifier: (cls) => find(cls, (field) => field.identifier),
    circle: (cls) => circles.get(cls),
  };
}

/**
 * True when a child field says nothing the field it replaces does not
 * (SPEC §3.10). What is compared is what the two fields mean, not how they
 * were typed: positions are not part of it, and neither is the alias a
 * primitive was written as, since `integer` and `int` are one type.
 */
export function sameField(child: FieldNode, inheritedField: FieldNode): boolean {
  return meaning(child) === meaning(inheritedField);
}

const meaning = (field: FieldNode): string =>
  JSON.stringify([
    field.name.text,
    field.identifier,
    typeMeaning(field),
    field.system?.text,
    field.joinsTo === undefined
      ? undefined
      : [field.joinsTo.className.text, field.joinsTo.fieldName.text],
    field.description,
    field.note,
  ]);

function typeMeaning(field: FieldNode): unknown {
  const type = field.type;
  if (type === undefined) return undefined;
  switch (type.kind) {
    case 'primitive':
      return [type.kind, type.name, type.many];
    case 'class':
    case 'unknown':
      return [type.kind, type.name.text, type.many];
    case 'enum':
      return [type.kind, type.values.map((v) => v.text), type.many];
  }
}
