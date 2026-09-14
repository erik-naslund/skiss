// The `skiss` command. Node-only, and the only file in the package that
// touches files or `process` (ADR 0003). A thin layer: read, call the
// library, write. Anything that looks like logic belongs in the library.

import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { compile, formatDiagnostic, VERSION } from './index.ts';

const HELP = `Usage: skiss <command> [options]

Commands:
  diagram <file>       Write a Mermaid class diagram for a .skiss file.
  compile <file>       Write a LinkML schema for a .skiss file.
                       <file> may be - to read standard input.

Options:
  -o, --output <path>  Write the output to <path> instead of standard output
      --notes          diagram: emit \`? text\` doubts as Mermaid notes
      --json           compile: write the schema as JSON instead of YAML
      --name <name>    compile: the schema name. Defaults to the file's
                       basename without its extension, or \`sketch\` for
                       standard input.
      --strict         Exit 1 when the input has any diagnostic
  -h, --help           Show this help and exit
      --version        Print the version and exit

Diagnostics go to standard error, one per line:
  <file>:<line>:<col>: <severity> <CODE> <message>

Exit codes:
  0  the output was produced
  1  --strict and the input has diagnostics (the output is still written)
  2  usage error, missing file or unreadable input
  70 internal error, a bug in skiss
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
  const { output, diagnostics } =
    command === 'compile'
      ? compile(source, {
          target: 'linkml',
          schemaName: values.name ?? defaultSchemaName(file),
          format: values.json === true ? 'json' : 'yaml',
        })
      : compile(source, { target: 'mermaid', notes: values.notes });

  const label = file === '-' ? '<stdin>' : file;
  for (const d of diagnostics) process.stderr.write(`${formatDiagnostic(d, label)}\n`);

  if (values.output === undefined) process.stdout.write(output);
  else await writeOutput(values.output, output);

  return values.strict === true && diagnostics.length > 0 ? EXIT_STRICT : EXIT_OK;
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

/** The OS error code when there is one (`ENOENT`), else the message. */
function reason(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code ?? error.message;
  }
  return String(error);
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
