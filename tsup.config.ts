import { defineConfig, type Options } from 'tsup';

// Two entry points, one package. See docs/adr/0003-one-package-two-entry-points.md.
const shared: Options = {
  format: ['esm'],
  dts: true,
  sourcemap: true,
  target: 'es2022',
};

// Named and typed so test/global-setup.ts builds exactly these options through
// tsup's `build()` API instead of duplicating them (issue #28, AC1).
export const entries: Options[] = [
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    clean: true,
  },
  {
    ...shared,
    entry: { cli: 'src/cli.ts' },
    // The `skiss` binary must be directly executable (issue #1, AC3).
    banner: { js: '#!/usr/bin/env node' },
  },
];

export default defineConfig(entries);
