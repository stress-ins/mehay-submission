import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, name), 'utf8');

test('default and CI app builds select the Node app; mock image is a separate target', async () => {
  const [dockerfile, workflow, compose] = await Promise.all([read('Dockerfile'), read('.github/workflows/ci.yml'), read('deploy/compose.yaml')]);
  const stages = [...dockerfile.matchAll(/^FROM\s+\S+(?:\s+AS\s+(\S+))?/gmi)].map((match) => match[1] ?? null);

  assert.deepEqual(stages, ['build', 'neurodvs-mocks', 'app']);
  assert.match(workflow, /docker build --target app\b/);
  assert.match(workflow, /docker build --target neurodvs-mocks\b/);
  assert.match(workflow, /target:\s*app\b/);
  assert.match(workflow, /target:\s*neurodvs-mocks\b/);
  assert.match(dockerfile, /^CMD \["sh", "-c", "node scripts\/validate-knowledge\.mjs/m);
  assert.equal([...dockerfile.matchAll(/^CMD\s/mg)].length, 1);
  assert.doesNotMatch(compose.split('\n  mock-ml:')[0], /^    command:/m);
  for (const name of ['MECHANIC_DB', 'MEHAY_ACOUSTIC_DEMO', 'MEHAY_ACOUSTIC_INDEX', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL']) {
    assert.match(compose, new RegExp(`^      ${name}:`, 'm'));
  }
  assert.doesNotMatch(compose, /^\s+env_file:/m);
  assert.doesNotMatch(compose, /MEHAY_PRIVATE_SOURCE:/);
});

test('Docker build context excludes manual KB and demo media', async () => {
  const dockerignore = await read('.dockerignore');
  for (const pattern of ['materials', 'resources/manuals', 'knowledge', '**/*.pdf', '*.mp4', '*.webm', '**/guidance.json']) {
    assert.ok(dockerignore.split(/\r?\n/).includes(pattern), `missing dockerignore entry: ${pattern}`);
  }
});
