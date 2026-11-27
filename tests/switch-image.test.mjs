import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'deploy', 'switch-image.sh');
const image = `ghcr.io/stress-ins/mehay@sha256:${'a'.repeat(64)}`;
const mocksImage = `ghcr.io/stress-ins/mehay-mocks@sha256:${'b'.repeat(64)}`;

test('missing Docker Compose fails before image pull or container changes', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'mehay-switch-image-'));
  const binDir = path.join(tempDir, 'bin');
  const callsFile = path.join(tempDir, 'docker-calls');
  const dockerPath = path.join(binDir, 'docker');

  try {
    await mkdir(binDir);
    await writeFile(dockerPath, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_CALLS"
echo 'docker: unknown command: docker compose' >&2
exit 1
`);
    await chmod(dockerPath, 0o755);

    const result = spawnSync('bash', [scriptPath, image], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DOCKER_CALLS: callsFile,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Docker Compose v2 is required/);
    assert.doesNotMatch(result.stderr, /candidate failed health check/);
    assert.equal(await readFile(callsFile, 'utf8'), 'compose version\n');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('failed first mock rollouts remove the candidate pair before the next rollout', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'mehay-switch-first-mocks-'));
  const binDir = path.join(tempDir, 'bin');
  const deployDir = path.join(tempDir, 'deploy');
  const callsFile = path.join(tempDir, 'docker-calls');
  const upCountFile = path.join(tempDir, 'up-count');
  const mocksStateFile = path.join(tempDir, 'mocks-state');
  const dockerPath = path.join(binDir, 'docker');
  const sleepPath = path.join(binDir, 'sleep');
  const previousImage = `ghcr.io/stress-ins/mehay@sha256:${'c'.repeat(64)}`;

  try {
    await mkdir(binDir);
    await mkdir(deployDir);
    await writeFile(dockerPath, `#!/usr/bin/env bash
printf '%s|%s|%s\\n' "$*" "${'${MEHAY_IMAGE:-}'}" "${'${MEHAY_MOCK_IMAGE:-}'}" >> "$DOCKER_CALLS"
if [[ "$1 $2" == 'compose version' ]]; then exit 0; fi
if [[ "$1" == inspect && "$*" == *"{{.Config.Image}}"* ]]; then
  case "${'${*: -1}'}" in
    mehay) echo "$PREVIOUS_IMAGE" ;;
    mehay-mock-ml) [[ -f "$MOCKS_STATE" ]] && echo "$MOCK_IMAGE" ;;
  esac
  exit 0
fi
if [[ "$1" == inspect && "$*" == *"{{.State.Health.Status}}"* ]]; then
  if [[ "$*" == *"mehay-mock-ml"* ]]; then echo unhealthy; else echo healthy; fi
  exit 0
fi
if [[ "$1" == pull ]]; then exit 0; fi
if [[ "$1 $2" == 'compose -f' && "$*" == *' rm -sf mock-ml mock-toir'* ]]; then
  rm -f "$MOCKS_STATE"
  exit 0
fi
if [[ "$1 $2" == 'compose -f' && "$*" == *' up '* ]]; then
  count=0; [[ -f "$UP_COUNT" ]] && count=$(cat "$UP_COUNT")
  count=$((count + 1)); printf '%s' "$count" > "$UP_COUNT"
  if [[ "$*" != *'--no-deps mehay'* ]]; then printf '%s' "$MOCK_IMAGE" > "$MOCKS_STATE"; fi
  exit 0
fi
exit 0
`);
    await chmod(dockerPath, 0o755);
    await writeFile(sleepPath, '#!/usr/bin/env bash\nexit 0\n');
    await chmod(sleepPath, 0o755);

    const result = spawnSync('bash', [scriptPath, image, mocksImage], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DOCKER_CALLS: callsFile,
        UP_COUNT: upCountFile,
        MOCKS_STATE: mocksStateFile,
        PREVIOUS_IMAGE: previousImage,
        MOCK_IMAGE: mocksImage,
        MEHAY_DEPLOY_ROOT: deployDir,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /candidate failed health check/);
    const second = spawnSync('bash', [scriptPath, image, mocksImage], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DOCKER_CALLS: callsFile,
        UP_COUNT: upCountFile,
        MOCKS_STATE: mocksStateFile,
        PREVIOUS_IMAGE: previousImage,
        MOCK_IMAGE: mocksImage,
        MEHAY_DEPLOY_ROOT: deployDir,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    });
    assert.equal(second.status, 1);

    const calls = await readFile(callsFile, 'utf8');
    const restores = calls.match(new RegExp(`compose -f deploy/compose\\.yaml up -d --no-build --pull never --no-deps mehay\\|${previousImage.replaceAll(':', '\\:')}\\|${mocksImage.replaceAll(':', '\\:')}`, 'g')) ?? [];
    assert.equal(restores.length, 2);
    assert.equal((calls.split('compose -f deploy/compose.yaml rm -sf mock-ml mock-toir').length - 1), 2);
    assert.equal(await readFile(upCountFile, 'utf8'), '4');
    await assert.rejects(readFile(mocksStateFile, 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
