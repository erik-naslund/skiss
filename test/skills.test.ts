import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse, resolve, toMermaid } from '../src/index.ts';

// The agent skill under skills/ teaches an assistant to write Skiss without the
// compiler at hand, so every sketch it shows must be what the compiler accepts
// and every diagram it shows must be what the compiler writes. A fence tagged
// `skiss-invalid` is one the text explains as a mistake; it must fail.

const root = new URL('../skills/', import.meta.url).pathname;

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

interface Fence {
  lang: string;
  body: string;
  line: number;
}

function fences(text: string): Fence[] {
  const out: Fence[] = [];
  const re = /^```([\w-]+)\n([\s\S]*?)^```$/gm;
  for (const m of text.matchAll(re)) {
    const lang = m[1] ?? '';
    const body = m[2] ?? '';
    out.push({ lang, body, line: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

describe('the skill shows the language as the compiler reads it', () => {
  for (const file of markdownFiles(root)) {
    const text = readFileSync(file, 'utf8');
    const all = fences(text);
    const label = file.slice(root.length);

    for (const fence of all.filter((f) => f.lang === 'skiss')) {
      test(`${label}:${fence.line} compiles without a diagnostic`, () => {
        const resolved = resolve(parse(fence.body));
        expect(resolved.diagnostics.map((d) => `${d.line}: ${d.code} ${d.message}`)).toEqual([]);
      });
    }

    for (const fence of all.filter((f) => f.lang === 'skiss-invalid')) {
      test(`${label}:${fence.line} is the mistake the text says it is`, () => {
        const resolved = resolve(parse(fence.body));
        expect(resolved.diagnostics.length).toBeGreaterThan(0);
      });
    }

    // A mermaid fence belongs to the nearest skiss fence above it, with
    // `--notes`, which is how the skill tells an assistant to draw.
    all.forEach((fence, i) => {
      if (fence.lang !== 'mermaid') return;
      const sketch = all
        .slice(0, i)
        .reverse()
        .find((f) => f.lang === 'skiss');
      if (sketch === undefined) return;
      test(`${label}:${fence.line} is what skiss diagram --notes writes`, () => {
        const mermaid = toMermaid(resolve(parse(sketch.body)), { notes: true });
        expect(fence.body).toBe(mermaid);
      });
    });
  }
});
