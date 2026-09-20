#!/usr/bin/env node
// Regenerates the golden files under test/fixtures/ from the fixtures'
// inputs, with the library itself: the goldens are what the code produces,
// and the diff is the review (ADR 0007). Run it after a change that moves a
// generator on purpose, never to make a red test green:
//
//   pnpm build && node scripts/regenerate-fixtures.mjs
//
// It writes only the derived files. The `.skiss` inputs and
// `foreign.linkml.yaml` are written by hand.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { fromLinkML, parse, resolve, serialize, toLinkML, toMermaid } from '../dist/index.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
const read = (name) => readFileSync(join(fixtures, name), 'utf8');

function write(name, text) {
  writeFileSync(join(fixtures, name), text);
  console.log(`regenerate-fixtures: ${name}`);
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

for (const name of ['basic', 'systems', 'broken']) {
  const doc = parse(read(`${name}.skiss`));
  write(`${name}.mmd`, toMermaid(doc));
  write(`${name}.linkml.yaml`, serialize(toLinkML(doc, { schemaName: name }), 'yaml'));
}

write(
  'spec-example.linkml.yaml',
  serialize(
    toLinkML(parse(read('spec-example.skiss')), { schemaName: 'galaxy_catalogue' }),
    'yaml',
  ),
);

// The AST of `basic.skiss`, with every position (fixtures/README.md).
write('basic.ast.json', json(parse(read('basic.skiss'))));

// The codes `broken.skiss` produces, in line order, without messages.
const broken = resolve(parse(read('broken.skiss')));
const entries = broken.diagnostics
  .map((d) => `    { "code": "${d.code}", "severity": "${d.severity}", "line": ${d.line} }`)
  .join(',\n');
write('broken.diagnostics.json', `{\n  "diagnostics": [\n${entries}\n  ]\n}\n`);

// The projection of the one fixture that starts as LinkML (SPEC §8).
const projection = fromLinkML(parseYaml(read('foreign.linkml.yaml')));
write('foreign.skiss', projection.source);
write('foreign.dropped.json', json(projection.dropped));
