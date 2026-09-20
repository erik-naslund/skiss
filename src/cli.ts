// The `skiss` command. Node-only, and the only file in the package that
// touches files or `process` (ADR 0003). A thin layer: read, call the
// library, write. Anything that looks like logic belongs in the library.

import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Diagnostic, Dropped } from './index.ts';
import { compile, formatDiagnostic, formatDropped, importLinkML, VERSION } from './index.ts';

const HELP = `Usage: skiss <command> [options]

Commands:
  diagram <file>       Write a Mermaid class diagram for a .skiss file.
  compile <file>       Write a LinkML schema for a .skiss file.
  import <file>        Write Skiss for a LinkML schema file, YAML or JSON.
  render <file>        Write an SVG or a PNG of the class diagram, through
                       the Mermaid CLI (mmdc), which must be installed.
                       <file> may be - to read standard input.

Options:
  -o, --output <path>  Write the output to <path> instead of standard output
      --notes          diagram, render: emit \`? text\` doubts as Mermaid notes
      --json           compile: write the schema as JSON instead of YAML
      --name <name>    compile: the schema name. Defaults to the file's
                       basename without its extension, or \`sketch\` for
                       standard input.
      --format <fmt>   render: svg or png. Defaults to the extension of
                       -o, and to svg when there is no -o. png needs an -o:
                       only the SVG can go to standard output.
      --scale <n>      render: the scale mmdc rasterises at. Defaults to 2
                       for png, and to mmdc's own default for svg.
      --strict         Exit 1 when the input has any diagnostic; for import,
                       also when the projection dropped anything
  -h, --help           Show this help and exit
      --version        Print the version and exit

Diagnostics go to standard error, one per line:
  <file>:<line>:<col>: <severity> <CODE> <message>

import writes what the projection could not carry to standard error too, as
one line before the diagnostics. Its diagnostics are the ones the sketch it
wrote has, so their line numbers are lines of that sketch.

Exit codes:
  0  the output was produced
  1  --strict and the input has diagnostics (the output is still written)
  2  usage error, missing file, or unreadable input: for import, a text no
     schema could be read out of, which produces no sketch at all; for
     render, the Mermaid CLI not being installed
  70 internal error, a bug in skiss

render exits with mmdc's own status when mmdc ran and failed.
`;

/** Issue #6, AC4 and AC5. 70 is `EX_SOFTWARE` from `sysexits.h`. */
const EXIT_OK = 0;
const EXIT_STRICT = 1;
const EXIT_USAGE = 2;
const EXIT_INTERNAL = 70;

/**
 * Which options each command takes. `--help` and `--version` are answered
 * before a command is read and are not listed. An option that belongs to the
 * other command is a usage error rather than something silently ignored.
 */
const COMMANDS = {
  diagram: ['output', 'notes', 'strict'],
  compile: ['output', 'json', 'name', 'strict'],
  import: ['output', 'strict'],
  render: ['output', 'notes', 'format', 'scale', 'strict'],
} as const;

type Command = keyof typeof COMMANDS;

const isCommand = (text: string): text is Command => Object.hasOwn(COMMANDS, text);

/** Thrown for anything that ends the run with exit code 2. */
class UsageError extends Error {}

/**
 * Our own `UsageError`, or a `parseArgs` rejection (unknown option, `-o`
 * with no path), whose `code` is one of the `ERR_PARSE_ARGS_*` family.
 */
function isUsageError(error: unknown): boolean {
  if (error instanceof UsageError) return true;
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return typeof error.code === 'string' && error.code.startsWith('ERR_PARSE_ARGS');
}

async function main(argv: string[]): Promise<number> {
  if (argv.length === 0) {
    process.stderr.write(HELP);
    return EXIT_USAGE;
  }

  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      output: { type: 'string', short: 'o' },
      notes: { type: 'boolean' },
      json: { type: 'boolean' },
      name: { type: 'string' },
      format: { type: 'string' },
      scale: { type: 'string' },
      strict: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help === true) {
    process.stdout.write(HELP);
    return EXIT_OK;
  }
  if (values.version === true) {
    process.stdout.write(`${VERSION}\n`);
    return EXIT_OK;
  }

  const [command, file, ...extra] = positionals;
  if (command === undefined) throw new UsageError('missing command');
  if (!isCommand(command)) throw new UsageError(`unknown command \`${command}\``);
  if (file === undefined)
    throw new UsageError(`${command} needs a <file>, or - for standard input`);
  if (extra.length > 0) throw new UsageError(`unexpected argument \`${extra[0]}\``);

  // `parseArgs` leaves an option out of `values` when it was not given, so
  // the keys here are exactly what was typed.
  const accepted: readonly string[] = COMMANDS[command];
  for (const option of Object.keys(values)) {
    if (!accepted.includes(option)) {
      throw new UsageError(`\`${command}\` does not take \`--${option}\``);
    }
  }

  const source = file === '-' ? await readStdin() : await readSource(file);
  const label = file === '-' ? '<stdin>' : file;

  // Issue #63: `render` is `diagram` plus mmdc, so it shares the diagnostics
  // and `--strict`, and nothing else. Its output is a picture, which does not
  // go through `writeOutput`.
  if (command === 'render') {
    const picture = compile(source, { target: 'mermaid', notes: values.notes });
    for (const d of picture.diagnostics) process.stderr.write(`${formatDiagnostic(d, label)}\n`);
    const status = await render(picture.output, values);
    if (status !== EXIT_OK) return status;
    return values.strict === true && picture.diagnostics.length > 0 ? EXIT_STRICT : EXIT_OK;
  }

  // `import` reads LinkML rather than Skiss, and is the one command whose
  // result carries a SPEC §8 report of what the projection could not carry.
  const { output, diagnostics, dropped } = runCommand(command, source, file, values);

  // Issue #47, D2: the report is information and not an error, so it is
  // written whether or not `--strict` was given, and before the diagnostics.
  const report = formatDropped(dropped);
  if (report !== '') process.stderr.write(`${report}\n`);
  for (const d of diagnostics) process.stderr.write(`${formatDiagnostic(d, label)}\n`);

  if (values.output === undefined) process.stdout.write(output);
  else await writeOutput(values.output, output);

  // Issue #53, S6. `import` of a text no schema can be read out of writes
  // nothing at all, which is a different situation from a sketch with some
  // broken lines: it is unreadable input, the exit code `diagram` and
  // `compile` already use for one. The report and the empty output are
  // written either way, so only the code says so.
  if (unreadableInput(command, diagnostics, dropped)) return EXIT_USAGE;

  const strict = values.strict === true && (diagnostics.length > 0 || dropped.length > 0);
  return strict ? EXIT_STRICT : EXIT_OK;
}

/**
 * True when `import` read no schema at all: a text that is not YAML, or one
 * `fromLinkML` reported as unreadable (SPEC §8). A schema with no classes in
 * it is read and projects to an empty sketch, which is not this.
 */
function unreadableInput(command: Command, diagnostics: Diagnostic[], dropped: Dropped[]): boolean {
  if (command !== 'import') return false;
  if (dropped.some((entry) => entry.kind === 'unreadable')) return true;
  return diagnostics.some((d) => d.code === 'E_NOT_YAML');
}

/** What every command produces. `dropped` is empty for all but `import`. */
interface CommandResult {
  output: string;
  diagnostics: Diagnostic[];
  dropped: Dropped[];
}

function runCommand(
  command: Command,
  source: string,
  file: string,
  values: { name?: string; json?: boolean; notes?: boolean },
): CommandResult {
  if (command === 'import') return importLinkML(source);
  if (command === 'compile') {
    return {
      ...compile(source, {
        target: 'linkml',
        schemaName: values.name ?? defaultSchemaName(file),
        format: values.json === true ? 'json' : 'yaml',
      }),
      dropped: [],
    };
  }
  return { ...compile(source, { target: 'mermaid', notes: values.notes }), dropped: [] };
}

/**
 * Issue #24, AC2. `toLinkML` normalises this to a valid LinkML name
 * (SPEC §5.2), so a basename with a dot or a dash in it needs nothing here.
 */
const defaultSchemaName = (file: string): string =>
  file === '-' ? 'sketch' : basename(file, extname(file));

async function readSource(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    throw new UsageError(`cannot read \`${file}\`: ${reason(error)}`);
  }
}

async function readStdin(): Promise<string> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  } catch (error) {
    throw new UsageError(`cannot read standard input: ${reason(error)}`);
  }
}

/** D1: the path is written verbatim; no extension is inferred from the target. */
async function writeOutput(path: string, text: string): Promise<void> {
  try {
    await writeFile(path, text, 'utf8');
  } catch (error) {
    throw new UsageError(`cannot write \`${path}\`: ${reason(error)}`);
  }
}

/** Issue #63: the one message the not-installed path prints, and all it prints. */
const MMDC_MISSING = 'skiss render needs the Mermaid CLI: npm install -g @mermaid-js/mermaid-cli';

type Format = 'svg' | 'png';

const isFormat = (text: string): text is Format => text === 'svg' || text === 'png';

/** The options `render` reads. `output` and `notes` it shares with `diagram`. */
interface RenderOptions {
  output?: string;
  format?: string;
  scale?: string;
}

/**
 * Issue #63. Mermaid lays a class diagram out in a real DOM, so a picture
 * needs a browser engine. Rendering is delegated to the Mermaid CLI rather
 * than pulling one into this package (ADR 0003): the Mermaid text goes to a
 * temporary file, `mmdc` turns it into the picture, and its exit status is
 * this command's. Returns the exit code.
 */
async function render(mermaid: string, values: RenderOptions): Promise<number> {
  const format = renderFormat(values);
  const scale = renderScale(values.scale, format);

  const mmdc = await findMmdc();
  if (mmdc === undefined) {
    process.stderr.write(`${MMDC_MISSING}\n`);
    return EXIT_USAGE;
  }

  const dir = await mkdtemp(join(tmpdir(), 'skiss-render-'));
  try {
    const input = join(dir, 'diagram.mmd');
    await writeFile(input, mermaid, 'utf8');
    // With no `-o` the picture is still a file to mmdc; it is read back and
    // written to standard output afterwards.
    const target = values.output ?? join(dir, `diagram.${format}`);
    // `-e` rather than the extension of `-o`, so `--format` decides even when
    // the path says something else. `-b transparent` because a diagram is
    // pasted onto a slide or a page that has its own background.
    const args = ['-i', input, '-o', target, '-e', format, '-b', 'transparent'];
    if (scale !== undefined) args.push('--scale', scale);

    // mmdc writes its progress to its own standard output, which here may be
    // carrying the SVG; it is forwarded to standard error instead.
    const run = spawnSync(mmdc, args, {
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf8',
    });
    if (run.error !== undefined)
      throw new UsageError(`cannot run \`${mmdc}\`: ${reason(run.error)}`);
    if (run.stdout !== '') process.stderr.write(run.stdout);
    // A signal leaves no status; that is a failed render either way.
    if (run.status !== EXIT_OK) return run.status ?? EXIT_INTERNAL;

    if (values.output === undefined) process.stdout.write(await readFile(target, 'utf8'));
    return EXIT_OK;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * `--format` decides; otherwise the extension of `-o` does; otherwise it is
 * an SVG on standard output. A PNG is bytes, so it always needs an `-o`.
 */
function renderFormat(values: RenderOptions): Format {
  if (values.format !== undefined) {
    if (!isFormat(values.format)) {
      throw new UsageError(`unknown \`--format ${values.format}\`: svg or png`);
    }
    if (values.format === 'png' && values.output === undefined) {
      throw new UsageError(
        'render --format png needs -o <path>: a PNG cannot go to standard output',
      );
    }
    return values.format;
  }
  if (values.output === undefined) return 'svg';
  const extension = extname(values.output).slice(1).toLowerCase();
  if (isFormat(extension)) return extension;
  throw new UsageError(
    `cannot tell the format of \`${values.output}\`: give --format svg or --format png`,
  );
}

/** A PNG at the scale mmdc defaults to is too small to read; issue #63 says 2. */
function renderScale(scale: string | undefined, format: Format): string | undefined {
  if (scale === undefined) return format === 'png' ? '2' : undefined;
  const value = Number(scale);
  if (!Number.isFinite(value) || value <= 0) {
    throw new UsageError(`\`--scale ${scale}\` is not a positive number`);
  }
  return scale;
}

/**
 * On `PATH` first, then the `node_modules/.bin/mmdc` a local install leaves
 * behind, relative to the current directory.
 */
async function findMmdc(): Promise<string | undefined> {
  const onPath = (process.env.PATH ?? '')
    .split(delimiter)
    .filter((dir) => dir !== '')
    .map((dir) => join(dir, 'mmdc'));
  for (const candidate of [...onPath, join(process.cwd(), 'node_modules', '.bin', 'mmdc')]) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not there, or not executable: keep looking.
    }
  }
  return undefined;
}

/** The OS error code when there is one (`ENOENT`), else the message. */
function reason(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code ?? error.message;
  }
  return String(error);
}

// `skiss diagram big.skiss | head` closes the pipe while the write is still
// going. Node raises that on the stream itself, asynchronously, where the
// handler below cannot see it, so the process died on an unhandled `error`
// event: a Node stack trace on stderr and exit 1, the code `--strict` means.
// A reader that stopped reading is not a failure of the command (issue #53,
// M2). Anything else on these streams is still a bug and is rethrown.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') process.exit(EXIT_OK);
    throw error;
  });
}

// `process.exitCode` rather than `process.exit()`, so a piped stdout is
// flushed before the process ends.
main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (isUsageError(error)) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`skiss: ${message}\nTry 'skiss --help' for more information.\n`);
      process.exitCode = EXIT_USAGE;
      return;
    }
    // Anything else is a bug (`compile` never throws by contract), so the
    // stack is the useful output and the `--help` hint would mislead.
    const detail =
      error instanceof Error && error.stack !== undefined ? error.stack : String(error);
    process.stderr.write(`skiss: internal error: ${detail}\n`);
    process.exitCode = EXIT_INTERNAL;
  },
);
