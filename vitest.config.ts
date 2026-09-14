import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Issue #28, AC1: `dist/` is built once here, before any worker starts.
    globalSetup: ['test/global-setup.ts'],
  },
});
