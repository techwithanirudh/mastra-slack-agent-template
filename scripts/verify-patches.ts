import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'node_modules/@mastra/core/dist');
const PATCH_FILE = 'patches/@mastra+core@1.51.0.patch';

const SIGNATURES = [
  'invocation.result && typeof invocation.result === "object" && typeof invocation.result.data === "string" && typeof invocation.result.mediaType === "string"',
  'part.type === "file"',
];

function fail(message: string): never {
  console.error(`\n[verify-patches] ${message}\n`);
  process.exit(1);
}

if (!existsSync(DIST)) {
  fail(
    `${DIST} does not exist. @mastra/core did not install correctly, run bun install again.`
  );
}

const patchedByExtension: Record<'.js' | '.cjs', string[]> = {
  '.js': [],
  '.cjs': [],
};

for (const entry of readdirSync(DIST)) {
  let extension: '.js' | '.cjs' | undefined;
  if (entry.endsWith('.cjs')) {
    extension = '.cjs';
  } else if (entry.endsWith('.js')) {
    extension = '.js';
  }
  if (!extension) {
    continue;
  }
  const source = readFileSync(join(DIST, entry), 'utf8');
  if (SIGNATURES.every((signature) => source.includes(signature))) {
    patchedByExtension[extension].push(entry);
  }
}

if (
  patchedByExtension['.js'].length === 0 ||
  patchedByExtension['.cjs'].length === 0
) {
  fail(
    `@mastra/core patch (${PATCH_FILE}) did not apply. This usually means the installed ` +
      '@mastra/core version no longer matches the patchedDependencies key in package.json. ' +
      `Fix: re-derive ${PATCH_FILE} against the new version, then update patchedDependencies.`
  );
}

console.log(
  '[verify-patches] @mastra/core patch verified OK.',
  patchedByExtension
);
