import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { VERSION } from '../src/index.ts';

// Issue #6, D2: `skiss --version` prints `VERSION` from the library, so the
// constant in src/index.ts must be the version package.json publishes.
test('the library entry exports VERSION matching package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  expect(VERSION).toBe(pkg.version);
});
