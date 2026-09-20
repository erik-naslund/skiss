import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { LinkMLSchema } from '../src/index.ts';
import {
  formatDropped,
  importLinkML,
  parse,
  resolve,
  serialize,
  toMermaid,
  toSkiss,
  VERSION,
} from '../src/index.ts';

// Issue #6, AC7: the built `dist/cli.js` is run with `node` on every fixture.
// stdout must equal the `.mmd` fixture, stderr must match
// `broken.diagnostics.json` line by line, and the exit codes are AC4 and AC5.

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'dist', 'cli.js');
const fixture = (name: string): string =>
  readFileSync(join(root, 'test', 'fixtures', name), 'utf8');

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

// Paths are given relative to the repository root, so `<file>` on stderr is
// exactly what was typed on the command line.
function skiss(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: root, input, encoding: 'utf8' });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

let tmp: string;

beforeAll(() => {
  // Issue #28, AC2: the build belongs to test/global-setup.ts, which runs once
  // before any worker. This test only runs the binary it left behind.
  if (!existsSync(cli)) {
    throw new Error(`${cli} is missing: test/global-setup.ts builds it before any test runs`);
  }
  tmp = mkdtempSync(join(tmpdir(), 'skiss-cli-'));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe.each(['basic', 'systems', 'broken'])('skiss diagram test/fixtures/%s.skiss', (name) => {
  const file = `test/fixtures/${name}.skiss`;
  const golden = JSON.parse(fixture('broken.diagnostics.json')) as {
    diagnostics: { code: string; severity: string; line: number }[];
  };
  const expected = name === 'broken' ? golden.diagnostics : [];

  test(`stdout is ${name}.mmd and the exit code is 0 (AC1, AC4)`, () => {
    const r = skiss(['diagram', file]);
    expect(r.stdout).toBe(fixture(`${name}.mmd`));
    expect(r.status).toBe(0);
  });

  test('stderr is one line per diagnostic in `<file>:<line>:<col>: <severity> <CODE> <message>` form (AC3)', () => {
    const r = skiss(['diagram', file]);
    const lines = r.stderr === '' ? [] : r.stderr.replace(/\n$/, '').split('\n');
    expect(lines).toHaveLength(expected.length);
    lines.forEach((line, i) => {
      const d = expected[i];
      expect(d).toBeDefined();
      expect(line).toMatch(
        new RegExp(
          `^${file.replaceAll('/', '\\/')}:${d?.line}:\\d+: ${d?.severity} ${d?.code} .+$`,
        ),
      );
    });
  });

  test('--strict still prints the diagram and exits 1 only when there are diagnostics (AC4)', () => {
    const r = skiss(['diagram', '--strict', file]);
    expect(r.stdout).toBe(fixture(`${name}.mmd`));
    expect(r.status).toBe(expected.length > 0 ? 1 : 0);
  });

  test('--notes passes `notes: true` to the generator (AC2)', () => {
    const r = skiss(['diagram', '--notes', file]);
    expect(r.stdout).toBe(toMermaid(resolve(parse(fixture(`${name}.skiss`))), { notes: true }));
    expect(r.status).toBe(0);
  });

  test('`-` reads standard input; diagnostics name it <stdin> (AC1)', () => {
    const r = skiss(['diagram', '-'], fixture(`${name}.skiss`));
    expect(r.stdout).toBe(fixture(`${name}.mmd`));
    expect(r.status).toBe(0);
    const lines = r.stderr === '' ? [] : r.stderr.replace(/\n$/, '').split('\n');
    expect(lines).toHaveLength(expected.length);
    for (const line of lines) {
      expect(line).toMatch(/^<stdin>:\d+:\d+: (error|warning) [EW]_[A-Z_]+ .+$/);
    }
  });

  test('-o writes the diagram to the file and nothing to stdout (AC1)', () => {
    const out = join(tmp, `${name}.mmd`);
    const r = skiss(['diagram', file, '-o', out]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(readFileSync(out, 'utf8')).toBe(fixture(`${name}.mmd`));
  });
});

// Issue #24, AC4: the same binary is run on every fixture that has a
// `.linkml.yaml` golden. stdout must equal that golden byte for byte, and the
// `--json` form must round-trip through `serialize` to the same YAML.
//
// `spec-example.linkml.yaml` is written with the schema name the spec's own
// example uses, so it is the fixture that exercises `--name`; the others take
// the default, which is their basename.
const LINKML_FIXTURES = [
  { name: 'basic', schemaName: 'basic', named: false },
  { name: 'systems', schemaName: 'systems', named: false },
  { name: 'broken', schemaName: 'broken', named: false },
  { name: 'spec-example', schemaName: 'galaxy_catalogue', named: true },
];

describe.each(LINKML_FIXTURES)(
  'skiss compile test/fixtures/$name.skiss (AC2, AC4)',
  ({ name, schemaName, named }) => {
    const file = `test/fixtures/${name}.skiss`;
    // `--name` only where the golden's schema name is not the basename, so the
    // default of AC2 is what the other three fixtures check.
    const nameArgs = named ? ['--name', schemaName] : [];
    const golden = JSON.parse(fixture('broken.diagnostics.json')) as {
      diagnostics: { code: string; severity: string; line: number }[];
    };
    const expected = name === 'broken' ? golden.diagnostics : [];

    test(`stdout is ${name}.linkml.yaml and the exit code is 0`, () => {
      const r = skiss(['compile', file, ...nameArgs]);
      expect(r.stdout).toBe(fixture(`${name}.linkml.yaml`));
      expect(r.status).toBe(0);
    });

    test('stderr is one line per diagnostic, as `skiss diagram` prints them', () => {
      const r = skiss(['compile', file, ...nameArgs]);
      const lines = r.stderr === '' ? [] : r.stderr.replace(/\n$/, '').split('\n');
      expect(lines).toHaveLength(expected.length);
      lines.forEach((line, i) => {
        const d = expected[i];
        expect(d).toBeDefined();
        expect(line).toMatch(
          new RegExp(
            `^${file.replaceAll('/', '\\/')}:${d?.line}:\\d+: ${d?.severity} ${d?.code} .+$`,
          ),
        );
      });
    });

    test('--strict still prints the schema and exits 1 only when there are diagnostics', () => {
      const r = skiss(['compile', '--strict', file, ...nameArgs]);
      expect(r.stdout).toBe(fixture(`${name}.linkml.yaml`));
      expect(r.status).toBe(expected.length > 0 ? 1 : 0);
    });

    test('--json round-trips to the same schema object as the YAML golden', () => {
      const r = skiss(['compile', '--json', file, ...nameArgs]);
      expect(r.status).toBe(0);
      const schema = JSON.parse(r.stdout) as LinkMLSchema;
      expect(serialize(schema, 'yaml')).toBe(fixture(`${name}.linkml.yaml`));
    });

    test('`-` reads standard input; diagnostics name it <stdin>', () => {
      // The schema name of a stdin document defaults to `sketch`, so the
      // golden's name has to be given for the output to be comparable.
      const r = skiss(['compile', '-', '--name', schemaName], fixture(`${name}.skiss`));
      expect(r.stdout).toBe(fixture(`${name}.linkml.yaml`));
      expect(r.status).toBe(0);
      const lines = r.stderr === '' ? [] : r.stderr.replace(/\n$/, '').split('\n');
      expect(lines).toHaveLength(expected.length);
      for (const line of lines) {
        expect(line).toMatch(/^<stdin>:\d+:\d+: (error|warning) [EW]_[A-Z_]+ .+$/);
      }
    });

    test('-o writes the schema to the path verbatim and nothing to stdout (D1)', () => {
      const out = join(tmp, `${name}.linkml.yaml`);
      const r = skiss(['compile', file, ...nameArgs, '-o', out]);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
      expect(readFileSync(out, 'utf8')).toBe(fixture(`${name}.linkml.yaml`));
    });
  },
);

describe('skiss compile --name (AC2)', () => {
  test('the schema name defaults to the basename without the extension', () => {
    const r = skiss(['compile', 'test/fixtures/spec-example.skiss']);
    expect(r.status).toBe(0);
    // SPEC §5.2 normalisation turns the `-` into `_`.
    expect(r.stdout).toContain('name: spec_example\n');
  });

  test('the schema name of standard input defaults to `sketch`', () => {
    // Not `schema`: `linkml:types` binds that prefix to schema.org, and LinkML
    // rejects a schema that binds it to anything else.
    const r = skiss(['compile', '-'], fixture('basic.skiss'));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('name: sketch\n');
  });
});

// Issue #47, AC4: the same binary is run on every `.linkml.yaml` fixture, the
// other direction. The three fixtures LinkML carries whole project back to the
// sketch they were compiled from; `broken` does not, because the schema is the
// partial document and not the file (see test/from-linkml.golden.test.ts), and
// `foreign` is the schema Skiss did not write.
describe.each(['basic', 'systems', 'spec-example'])(
  'skiss import test/fixtures/%s.linkml.yaml (AC2, AC4)',
  (name) => {
    const file = `test/fixtures/${name}.linkml.yaml`;
    const projection = (): string => toSkiss(parse(fixture(`${name}.skiss`)));

    test(`stdout is toSkiss(parse(${name}.skiss)), stderr is empty and the exit code is 0`, () => {
      const r = skiss(['import', file]);
      expect(r.stdout).toBe(projection());
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
    });

    test('`-` reads standard input', () => {
      const r = skiss(['import', '-'], fixture(`${name}.linkml.yaml`));
      expect(r.stdout).toBe(projection());
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
    });

    test('-o writes the sketch to the path verbatim and nothing to stdout (D1)', () => {
      const out = join(tmp, `${name}.skiss`);
      const r = skiss(['import', file, '-o', out]);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
      expect(readFileSync(out, 'utf8')).toBe(projection());
    });

    test('--strict exits 0 when nothing was dropped and there are no diagnostics', () => {
      const r = skiss(['import', '--strict', file]);
      expect(r.stdout).toBe(projection());
      expect(r.status).toBe(0);
    });
  },
);

describe('skiss import test/fixtures/broken.linkml.yaml (AC4)', () => {
  const file = 'test/fixtures/broken.linkml.yaml';

  test('stdout is the sketch the library projects, and it is canonical Skiss', () => {
    const r = skiss(['import', file]);
    expect(r.stdout).toBe(importLinkML(fixture('broken.linkml.yaml')).output);
    expect(toSkiss(parse(r.stdout))).toBe(r.stdout);
    expect(r.status).toBe(0);
  });

  test('nothing is dropped, and the warnings of the projected sketch are on stderr', () => {
    const r = skiss(['import', file]);
    // The sketch still references the classes that were never declared, so
    // reading it back warns where `broken.skiss` warns.
    const lines = r.stderr.replace(/\n$/, '').split('\n');
    expect(lines).toEqual([
      `${file}:13:20: warning W_UNDECLARED_CLASS class \`Ghost\` is not declared`,
      `${file}:16:24: warning W_UNDECLARED_FIELD class \`Person\` has no field \`fullName\``,
      `${file}:22:10: warning W_UNDECLARED_CLASS class \`Phantom\` is not declared`,
      `${file}:26:3: warning W_REDUNDANT_OVERRIDE field \`name\` is identical to the one inherited from class \`Ship\` on line 3`,
    ]);
  });

  test('--strict exits 1 on the diagnostics alone', () => {
    expect(skiss(['import', '--strict', file]).status).toBe(1);
  });
});

describe('skiss import test/fixtures/foreign.linkml.yaml (AC2, AC4)', () => {
  const file = 'test/fixtures/foreign.linkml.yaml';
  const dropped = (): string => formatDropped(JSON.parse(fixture('foreign.dropped.json')));

  test('stdout is foreign.skiss and the exit code is 0', () => {
    const r = skiss(['import', file]);
    expect(r.stdout).toBe(fixture('foreign.skiss'));
    expect(r.status).toBe(0);
  });

  test('stderr is the SPEC §8 report first, then the diagnostics (D2)', () => {
    const r = skiss(['import', file]);
    expect(r.stderr).toBe(
      `${dropped()}\n${file}:5:13: warning W_UNKNOWN_TYPE unknown type \`time\`, treated as \`string\`\n`,
    );
  });

  test('--strict exits 1 when anything was dropped', () => {
    const r = skiss(['import', '--strict', file]);
    expect(r.stdout).toBe(fixture('foreign.skiss'));
    expect(r.status).toBe(1);
  });

  test('`-` reads standard input; the report and the diagnostics are unchanged', () => {
    const r = skiss(['import', '-'], fixture('foreign.linkml.yaml'));
    expect(r.stdout).toBe(fixture('foreign.skiss'));
    expect(r.stderr).toBe(
      `${dropped()}\n<stdin>:5:13: warning W_UNKNOWN_TYPE unknown type \`time\`, treated as \`string\`\n`,
    );
    expect(r.status).toBe(0);
  });
});

describe('skiss import of input that is not a schema (AC1, AC2; issue #53, S6)', () => {
  test('a text that is not YAML writes one E_NOT_YAML error, no output, and exits 2', () => {
    const r = skiss(['import', '-'], 'classes: [\n  unterminated\n');
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^<stdin>:1: error E_NOT_YAML the input is not YAML: .+\n$/);
    // Nothing was produced at all, so this is unreadable input and not a
    // sketch with diagnostics in it.
    expect(r.status).toBe(2);
  });

  test('--strict does not change that: unreadable input is 2 either way', () => {
    expect(skiss(['import', '--strict', '-'], 'classes: [\n').status).toBe(2);
  });

  test('a schema this cannot read says why on stderr and exits 2', () => {
    const r = skiss(['import', '-'], 'foo: bar\nbaz: 1\n');
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('Not read: the schema has no `classes`.\n');
    expect(r.status).toBe(2);
  });

  test('a YAML text that is not a mapping at all says why and exits 2', () => {
    const r = skiss(['import', '-'], '42\n');
    expect(r.stderr).toBe('Not read: the schema is not an object.\n');
    expect(r.status).toBe(2);
  });

  test('a schema with an empty `classes` block was read: an empty sketch and 0', () => {
    const r = skiss(['import', '-'], 'name: x\nclasses: {}\n');
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

describe('a reader that closes the pipe early (issue #53, M2)', () => {
  // `skiss diagram big.skiss | head` is ordinary use. The output has to be
  // bigger than the pipe buffer for the write to still be going when the
  // reader leaves, so the sketch here is generated rather than a fixture.
  const big = (): string => {
    let text = '';
    for (let c = 0; c < 2000; c++) {
      text += `Class${c}\n`;
      for (let f = 0; f < 10; f++) text += `  field${f}: int\n`;
    }
    return text;
  };

  test.each(['diagram', 'compile'])('`skiss %s - | head -2` exits 0 with no stack trace', (cmd) => {
    const file = join(tmp, 'big.skiss');
    writeFileSync(file, big());
    const r = spawnSync(
      '/bin/sh',
      ['-c', `"$1" "$2" ${cmd} "$3" | head -2`, 'sh', process.execPath, cli, file],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    if (r.error) throw r.error;
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

// Issue #63: `skiss render` is `diagram` plus the Mermaid CLI. The usage
// rules below hold everywhere; the tests that produce a real picture need a
// working browser engine, so they run only where `mmdc` can launch one.
describe('skiss render (issue #63)', () => {
  const file = join(root, 'test', 'fixtures', 'basic.skiss');
  const mmdc = join(root, 'node_modules', '.bin', 'mmdc');
  let mmdcRuns = false;

  // `@mermaid-js/mermaid-cli` is a devDependency, but its Chromium download
  // can be skipped (PUPPETEER_SKIP_DOWNLOAD=1) and a container running as
  // root cannot launch the browser at all. Neither is a fault of `render`, so
  // the picture tests skip instead of failing when this probe does not pass.
  beforeAll(() => {
    if (!existsSync(mmdc)) return;
    const probe = join(tmp, 'probe.mmd');
    writeFileSync(probe, 'classDiagram\n  class Probe\n');
    const r = spawnSync(mmdc, ['-i', probe, '-o', join(tmp, 'probe.svg')], {
      cwd: root,
      encoding: 'utf8',
    });
    mmdcRuns = r.status === 0;
  }, 180_000);

  const skipWithoutMmdc = (ctx: { skip: (note?: string) => void }): void => {
    if (!mmdcRuns) ctx.skip('mmdc is not installed here, or cannot launch a browser');
  };

  test('-o out.svg writes an SVG and exits 0', (ctx) => {
    skipWithoutMmdc(ctx);
    const out = join(tmp, 'basic.svg');
    const r = skiss(['render', file, '-o', out]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(readFileSync(out, 'utf8')).toContain('<svg');
  }, 180_000);

  test('-o out.png writes a PNG at the default scale of 2 and exits 0', (ctx) => {
    skipWithoutMmdc(ctx);
    const out = join(tmp, 'basic.png');
    const r = skiss(['render', file, '-o', out]);
    expect(r.status).toBe(0);
    const bytes = readFileSync(out);
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const small = join(tmp, 'basic-scale-1.png');
    expect(skiss(['render', file, '-o', small, '--scale', '1']).status).toBe(0);
    expect(readFileSync(small).length).toBeLessThan(bytes.length);
  }, 180_000);

  test('with no -o the SVG goes to standard output, and nothing else does', (ctx) => {
    skipWithoutMmdc(ctx);
    const r = skiss(['render', file]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^<svg/);
  }, 180_000);

  test('mmdc not installed exits 2 with the one line that says how to get it', () => {
    // An empty PATH and a working directory with no `node_modules/.bin` is
    // the not-installed state, whether or not this machine has mmdc.
    const r = spawnSync(process.execPath, [cli, 'render', file, '-o', join(tmp, 'none.svg')], {
      cwd: tmp,
      env: { ...process.env, PATH: '' },
      encoding: 'utf8',
    });
    if (r.error) throw r.error;
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'skiss render needs the Mermaid CLI: npm install -g @mermaid-js/mermaid-cli\n',
    );
  });

  test('a format it cannot tell, or cannot write, exits 2 before mmdc is looked for', () => {
    for (const args of [
      ['render', file, '--format', 'pdf', '-o', join(tmp, 'x.pdf')],
      ['render', file, '--format', 'png'],
      ['render', file, '-o', join(tmp, 'x.txt')],
      ['render', file, '--scale', 'large', '-o', join(tmp, 'x.png')],
    ]) {
      const r = skiss(args);
      expect(r.status).toBe(2);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain("Try 'skiss --help'");
    }
  });

  test('`render` without a file, or with an option it does not take, exits 2', () => {
    expect(skiss(['render']).status).toBe(2);
    expect(skiss(['render', '--json', file]).status).toBe(2);
  });

  test('`skiss --help` documents render and its options', () => {
    const r = skiss(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('render <file>');
    expect(r.stdout).toContain('--format');
    expect(r.stdout).toContain('--scale');
  });

  test('diagnostics reach standard error and --strict exits 1 without touching mmdc', () => {
    // `broken.skiss` has diagnostics; with no mmdc reachable the exit code is
    // the missing-CLI 2, so this checks the diagnostics alone.
    const r = spawnSync(
      process.execPath,
      [
        cli,
        'render',
        '--strict',
        join(root, 'test', 'fixtures', 'broken.skiss'),
        '-o',
        join(tmp, 'b.svg'),
      ],
      { cwd: tmp, env: { ...process.env, PATH: '' }, encoding: 'utf8' },
    );
    if (r.error) throw r.error;
    expect(r.stderr).toMatch(/^[^\n]*broken\.skiss:\d+:\d+: (error|warning) [EW]_[A-Z_]+ /);
    expect(r.status).toBe(2);
  });
});

describe('help, version and usage errors (AC5)', () => {
  test('`skiss --help` prints help to stdout and exits 0', () => {
    const r = skiss(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^Usage: skiss /);
    expect(r.stdout).toContain('diagram <file>');
    expect(r.stderr).toBe('');
  });

  test('`skiss --version` prints VERSION and exits 0', () => {
    const r = skiss(['--version']);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`${VERSION}\n`);
    expect(r.stderr).toBe('');
  });

  test('`skiss` with no arguments prints help to stderr and exits 2', () => {
    const r = skiss([]);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^Usage: skiss /);
  });

  test('an unknown subcommand exits 2', () => {
    const r = skiss(['frobnicate', 'test/fixtures/basic.skiss']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('frobnicate');
  });

  test('`diagram` without a file exits 2', () => {
    expect(skiss(['diagram']).status).toBe(2);
  });

  test('`skiss --help` documents the compile subcommand and its flags (issue #24, AC3)', () => {
    const r = skiss(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('compile <file>');
    expect(r.stdout).toContain('--json');
    expect(r.stdout).toContain('--name');
  });

  test('`compile` without a file exits 2 (issue #24, AC2)', () => {
    expect(skiss(['compile']).status).toBe(2);
  });

  test('`skiss --help` documents the import subcommand (issue #47, AC3)', () => {
    const r = skiss(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('import <file>');
  });

  test('`import` without a file exits 2, and an option it does not take exits 2 (AC2)', () => {
    expect(skiss(['import']).status).toBe(2);
    const r = skiss(['import', '--json', 'test/fixtures/basic.linkml.yaml']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain("Try 'skiss --help'");
  });

  test('an option the command does not take exits 2', () => {
    for (const args of [
      ['diagram', '--json', 'test/fixtures/basic.skiss'],
      ['compile', '--notes', 'test/fixtures/basic.skiss'],
    ]) {
      const r = skiss(args);
      expect(r.status).toBe(2);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain("Try 'skiss --help'");
    }
  });

  test('an unknown option exits 2 with the `--help` hint', () => {
    const r = skiss(['diagram', '--colour', 'test/fixtures/basic.skiss']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Try 'skiss --help'");
  });
});

describe('internal errors', () => {
  // `compile` never throws, so the only way to reach the handler's other
  // branch through the real binary is to make a step after it fail: a
  // preloaded module makes `process.stdout.write` throw.
  test('an unexpected exception exits 70 with its stack on stderr and no `--help` hint', () => {
    const preload = join(root, 'test', 'throw-on-stdout.mjs');
    const r = spawnSync(
      process.execPath,
      ['--import', preload, cli, 'diagram', 'test/fixtures/basic.skiss'],
      { cwd: root, encoding: 'utf8' },
    );
    if (r.error) throw r.error;
    expect(r.status).toBe(70);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^skiss: internal error: Error: stdout is broken\n\s+at /);
    expect(r.stderr).not.toContain("Try 'skiss --help'");
  });
});

describe('missing or unreadable input (AC4)', () => {
  test('a missing file exits 2 with the path on stderr and nothing on stdout', () => {
    const r = skiss(['diagram', 'test/fixtures/does-not-exist.skiss']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('does-not-exist.skiss');
  });

  test('a directory is unreadable input and exits 2', () => {
    const r = skiss(['diagram', 'test/fixtures']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
  });
});

describe('boundaries (AC9)', () => {
  test('src/cli.ts is the only file under src/ that imports a Node built-in', () => {
    const src = join(root, 'src');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name));
        else if (entry.name.endsWith('.ts')) files.push(join(dir, entry.name));
      }
    };
    walk(src);
    const importing = files.filter((f) => /from\s+['"]node:/.test(readFileSync(f, 'utf8')));
    expect(importing).toEqual([join(src, 'cli.ts')]);
  });

  test('the built library entry does not import a Node built-in', () => {
    expect(readFileSync(join(root, 'dist', 'index.js'), 'utf8')).not.toMatch(/['"]node:/);
  });
});
