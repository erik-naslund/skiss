import { expect, test } from 'vitest';
import { VERSION } from '../src/index.ts';

test('the library entry exports VERSION matching package.json', () => {
  expect(VERSION).toBe('0.0.0');
});
