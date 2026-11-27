import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, name), 'utf8');

test('default and CI app builds select the Node app; mock image is a separate target', async () => {
  const [dockerfile, workflow] = await Promise.all([read('Dockerfile'), read('.github/workflows/ci.yml')]);
  const stages = [...dockerfile.matchAll(/^FROM\s+\S+(?:\s+AS\s+(\S+))?/gmi)].map((match) => match[1] ?? null);

  assert.deepEqual(stages, ['build', 'neurodvs-mocks', 'app']);
  assert.match(workflow, /docker build --target app\b/);
  assert.match(workflow, /docker build --target neurodvs-mocks\b/);
  assert.match(workflow, /target:\s*app\b/);
  assert.match(workflow, /target:\s*neurodvs-mocks\b/);
});

test('Docker build context excludes manual KB and demo media', async () => {
  const dockerignore = await read('.dockerignore');
  for (const pattern of ['materials', 'resources/manuals', 'knowledge', '**/*.pdf', '*.mp4', '*.webm', '**/guidance.json']) {
    assert.ok(dockerignore.split(/\r?\n/).includes(pattern), `missing dockerignore entry: ${pattern}`);
  }
});
