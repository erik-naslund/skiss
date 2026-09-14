import { build } from 'tsup';
import { entries } from '../tsup.config.ts';

// Issue #28, AC1: `dist/` is built exactly once per test run, before any worker
// starts, by calling tsup's API directly. No test shells out to `pnpm build`
// while other workers run.
export async function setup(): Promise<void> {
  // Sequential, because the first entry cleans `dist/`.
  for (const options of entries) {
    try {
      // `config: false`: build exactly these options; do not re-read
      // tsup.config.ts and merge it on top of them.
      await build({ ...options, config: false });
    } catch (cause) {
      throw new Error('test/global-setup.ts: the tsup build failed, so dist/ is missing or stale', {
        cause,
      });
    }
  }
}
