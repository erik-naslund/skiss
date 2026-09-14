import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { parse, resolve, toMermaid, VERSION } from '../src/index.ts';

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
  // The test builds, so `pnpm verify` needs nothing before `pnpm test`.
  execSync('pnpm build', { cwd: root, stdio: 'pipe' });
  tmp = mkdtempSync(join(tmpdir(), 'skiss-cli-'));
}, 60_000);

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
