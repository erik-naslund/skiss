// The `skiss` command. Node-only, and the only file in the package that
// touches files or `process` (ADR 0003). A thin layer: read, call the
// library, write. Anything that looks like logic belongs in the library.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { compile, formatDiagnostic, VERSION } from './index.ts';

const HELP = `Usage: skiss <command> [options]

Commands:
  diagram <file>       Write a Mermaid class diagram for a .skiss file.
                       <file> may be - to read standard input.

Options:
  -o, --output <path>  Write the diagram to <path> instead of standard output
      --notes          Emit \`? text\` doubts as Mermaid notes
      --strict         Exit 1 when the input has any diagnostic
  -h, --help           Show this help and exit
      --version        Print the version and exit

Diagnostics go to standard error, one per line:
  <file>:<line>:<col>: <severity> <CODE> <message>

Exit codes:
  0  a diagram was produced
  1  --strict and the input has diagnostics (the diagram is still written)
  2  usage error, missing file or unreadable input
`;

/** Issue #6, AC4 and AC5. */
const EXIT_OK = 0;
const EXIT_STRICT = 1;
const EXIT_USAGE = 2;

/** Thrown for anything that ends the run with exit code 2. */
class UsageError extends Error {}

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
  if (command !== 'diagram') throw new UsageError(`unknown command \`${command}\``);
  if (file === undefined) throw new UsageError('diagram needs a <file>, or - for standard input');
  if (extra.length > 0) throw new UsageError(`unexpected argument \`${extra[0]}\``);

  const source = file === '-' ? await readStdin() : await readSource(file);
  const { output, diagnostics } = compile(source, { target: 'mermaid', notes: values.notes });

  const label = file === '-' ? '<stdin>' : file;
  for (const d of diagnostics) process.stderr.write(`${formatDiagnostic(d, label)}\n`);

  if (values.output === undefined) process.stdout.write(output);
  else await writeOutput(values.output, output);

  return values.strict === true && diagnostics.length > 0 ? EXIT_STRICT : EXIT_OK;
}

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
    // A `parseArgs` rejection (unknown option, `-o` with no path) is a usage
    // error like our own; both carry a one-line message.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`skiss: ${message}\nTry 'skiss --help' for more information.\n`);
    process.exitCode = EXIT_USAGE;
  },
);
