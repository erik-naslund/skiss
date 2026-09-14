// Preloaded with `node --import` by test/cli.test.ts to drive the CLI's
// internal-error path: the first write to stdout throws, so `main` rejects
// with something that is neither a `UsageError` nor a `parseArgs` error.
process.stdout.write = () => {
  throw new Error('stdout is broken');
};
