import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'deploy', 'switch-image.sh');
const image = `ghcr.io/example/mehay@sha256:${'a'.repeat(64)}`;
const mocksImage = `ghcr.io/example/mehay-mocks@sha256:${'b'.repeat(64)}`;

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

test('failed inspection of an existing app refuses the switch before pulling the candidate', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'mehay-switch-inspect-'));
  const binDir = path.join(tempDir, 'bin');
  const deployDir = path.join(tempDir, 'deploy');
  const callsFile = path.join(tempDir, 'docker-calls');
  const dockerPath = path.join(binDir, 'docker');
  try {
    await mkdir(binDir);
    await mkdir(deployDir);
    await writeFile(dockerPath, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_CALLS"
if [[ "$1 $2" == 'compose version' ]]; then exit 0; fi
if [[ "$1 $2 $3" == 'container ls -a' ]]; then echo mehay; exit 0; fi
if [[ "$1" == inspect ]]; then exit 2; fi
exit 0
`);
    await chmod(dockerPath, 0o755);
    const result = spawnSync('bash', [scriptPath, image, mocksImage], {
      encoding: 'utf8', env: { ...process.env, DOCKER_CALLS: callsFile, MEHAY_DEPLOY_ROOT: deployDir, PATH: `${binDir}:/usr/bin:/bin` },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot inspect current app image; refusing image switch/);
    assert.doesNotMatch(await readFile(callsFile, 'utf8'), /pull|compose .* up/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('failed inspection of the TOIR mock refuses the switch before pulling the candidate', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'mehay-switch-toir-inspect-'));
  const binDir = path.join(tempDir, 'bin');
  const deployDir = path.join(tempDir, 'deploy');
  const callsFile = path.join(tempDir, 'docker-calls');
  const dockerPath = path.join(binDir, 'docker');
  try {
    await mkdir(binDir);
    await mkdir(deployDir);
    await writeFile(dockerPath, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_CALLS"
if [[ "$1 $2" == 'compose version' ]]; then exit 0; fi
if [[ "$1 $2 $3" == 'container ls -a' ]]; then printf 'mehay-mock-ml\\nmehay-mock-toir\\n'; exit 0; fi
if [[ "$1" == inspect ]]; then
  if [[ "${'${*: -1}'}" == mehay-mock-toir ]]; then exit 2; fi
  echo 'ghcr.io/example/mehay-mocks@sha256:${'b'.repeat(64)}'
  exit 0
fi
exit 0
`);
    await chmod(dockerPath, 0o755);
    const result = spawnSync('bash', [scriptPath, image, mocksImage], {
      encoding: 'utf8', env: { ...process.env, DOCKER_CALLS: callsFile, MEHAY_DEPLOY_ROOT: deployDir, PATH: `${binDir}:/usr/bin:/bin` },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot inspect current TOIR mock image; refusing image switch/);
    assert.doesNotMatch(await readFile(callsFile, 'utf8'), /pull|compose .* up/);
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
  const toirStateFile = path.join(tempDir, 'toir-state');
  const dockerPath = path.join(binDir, 'docker');
  const sleepPath = path.join(binDir, 'sleep');
  const previousImage = `ghcr.io/example/mehay@sha256:${'c'.repeat(64)}`;

  try {
    await mkdir(binDir);
    await mkdir(deployDir);
    await writeFile(dockerPath, `#!/usr/bin/env bash
printf '%s|%s|%s|%s|%s\\n' "$*" "${'${MEHAY_IMAGE:-}'}" "${'${MEHAY_MOCK_IMAGE:-}'}" "${'${MEHAY_MOCK_ML_IMAGE:-}'}" "${'${MEHAY_MOCK_TOIR_IMAGE:-}'}" >> "$DOCKER_CALLS"
if [[ "$1 $2" == 'compose version' ]]; then exit 0; fi
if [[ "$1 $2 $3" == 'container ls -a' ]]; then printf 'mehay\\nmehay-mock-ml\\nmehay-mock-toir\\n'; exit 0; fi
if [[ "$1" == inspect && "$*" == *"{{.Config.Image}}"* ]]; then
  case "${'${*: -1}'}" in
    mehay) echo "$PREVIOUS_IMAGE" ;;
    mehay-mock-ml) [[ -f "$MOCKS_STATE" ]] && echo "$MOCK_IMAGE" ;;
    mehay-mock-toir) [[ -f "$TOIR_STATE" ]] && echo "$TOIR_IMAGE" ;;
  esac
  exit 0
fi
if [[ "$1" == inspect && "$*" == *"{{.State.Health.Status}}"* ]]; then
  if [[ "$*" == *"mehay-mock-ml"* ]]; then echo unhealthy; else echo healthy; fi
  exit 0
fi
if [[ "$1" == pull ]]; then exit 0; fi
if [[ "$1" == compose && "$*" == *' rm -sf mock-ml mock-toir'* ]]; then
  rm -f "$MOCKS_STATE"
  exit 0
fi
if [[ "$1" == compose && "$*" == *' up '* ]]; then
  count=0; [[ -f "$UP_COUNT" ]] && count=$(cat "$UP_COUNT")
  count=$((count + 1)); printf '%s' "$count" > "$UP_COUNT"
  if [[ "$*" != *'--no-deps mehay'* ]]; then
    printf '%s' "${'${MEHAY_MOCK_ML_IMAGE:-$MOCK_IMAGE}'}" > "$MOCKS_STATE"
    printf '%s' "${'${MEHAY_MOCK_TOIR_IMAGE:-$MOCK_IMAGE}'}" > "$TOIR_STATE"
  fi
  exit 0
fi
exit 0
`);
    await chmod(dockerPath, 0o755);
    await writeFile(sleepPath, '#!/usr/bin/env bash\nexit 0\n');
    await chmod(sleepPath, 0o755);
    await writeFile(mocksStateFile, mocksImage);
    await writeFile(toirStateFile, `ghcr.io/example/mehay-mock-toir@sha256:${'d'.repeat(64)}`);

    const result = spawnSync('bash', [scriptPath, image, mocksImage], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DOCKER_CALLS: callsFile,
        UP_COUNT: upCountFile,
        MOCKS_STATE: mocksStateFile,
        TOIR_STATE: toirStateFile,
        PREVIOUS_IMAGE: previousImage,
        MOCK_IMAGE: mocksImage,
        TOIR_IMAGE: `ghcr.io/example/mehay-mock-toir@sha256:${'d'.repeat(64)}`,
        MEHAY_PRIVATE_RELEASE: 'a'.repeat(64),
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
        TOIR_STATE: toirStateFile,
        PREVIOUS_IMAGE: previousImage,
        MOCK_IMAGE: mocksImage,
        TOIR_IMAGE: `ghcr.io/example/mehay-mock-toir@sha256:${'d'.repeat(64)}`,
        MEHAY_PRIVATE_RELEASE: 'a'.repeat(64),
        MEHAY_DEPLOY_ROOT: deployDir,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    });
    assert.equal(second.status, 1);

    const calls = await readFile(callsFile, 'utf8');
    const restores = calls.match(new RegExp(`compose --env-file /etc/mehay/mehay\\.env -f deploy/compose\\.legacy\\.yaml up -d --no-build --pull never\\|${previousImage.replaceAll(':', '\\:')}\\|\\|${mocksImage.replaceAll(':', '\\:')}\\|ghcr\\.io/example/mehay-mock-toir@sha256:${'d'.repeat(64)}`, 'g')) ?? [];
    assert.equal(restores.length, 2);
    assert.equal((calls.split('compose --env-file /etc/mehay/mehay.env -f deploy/compose.legacy.yaml rm -sf mock-ml mock-toir').length - 1), 0);
    assert.equal(await readFile(upCountFile, 'utf8'), '4');
    assert.equal(await readFile(mocksStateFile, 'utf8'), mocksImage);
    assert.equal(await readFile(toirStateFile, 'utf8'), `ghcr.io/example/mehay-mock-toir@sha256:${'d'.repeat(64)}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
