#!/usr/bin/env bash
set -euo pipefail

image=${1:?usage: switch-image.sh app-image@sha256:digest mocks-image@sha256:digest}
[[ "$image" =~ @sha256:[a-f0-9]{64}$ ]] || { echo "image must use an immutable sha256 digest" >&2; exit 2; }
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required; refusing deployment before pulling the image or changing the container" >&2
  exit 1
fi
mock_image=${2:?usage: switch-image.sh app-image@sha256:digest mocks-image@sha256:digest}
[[ "$mock_image" =~ @sha256:[a-f0-9]{64}$ ]] || { echo "mock image must use an immutable sha256 digest" >&2; exit 2; }
cd "${MEHAY_DEPLOY_ROOT:-/opt/mehay}"
containers=$(docker container ls -a --format '{{.Names}}') || { echo "cannot inspect existing containers; refusing image switch" >&2; exit 1; }
previous=""
previous_mocks=""
previous_toir=""
previous_mount=""
previous_knowledge=""
if printf '%s\n' "$containers" | grep -Fqx mehay; then
  previous=$(docker inspect --format '{{.Config.Image}}' mehay) || { echo "cannot inspect current app image; refusing image switch" >&2; exit 1; }
  previous_mount=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/private-source"}}{{.Source}}{{end}}{{end}}' mehay) || { echo "cannot inspect current private source mount; refusing image switch" >&2; exit 1; }
  previous_knowledge=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/knowledge"}}{{.Source}}{{end}}{{end}}' mehay) || { echo "cannot inspect current knowledge mount; refusing image switch" >&2; exit 1; }
fi
if printf '%s\n' "$containers" | grep -Fqx mehay-mock-ml; then
  previous_mocks=$(docker inspect --format '{{.Config.Image}}' mehay-mock-ml) || { echo "cannot inspect current mock image; refusing image switch" >&2; exit 1; }
fi
if printf '%s\n' "$containers" | grep -Fqx mehay-mock-toir; then
  previous_toir=$(docker inspect --format '{{.Config.Image}}' mehay-mock-toir) || { echo "cannot inspect current TOIR mock image; refusing image switch" >&2; exit 1; }
fi
if [[ -n "$previous_mocks" || -n "$previous_toir" ]]; then
  [[ -n "$previous_mocks" && -n "$previous_toir" ]] || { echo "cannot inspect both existing mock containers; refusing image switch" >&2; exit 1; }
  [[ "$previous_mocks" =~ @sha256:[a-f0-9]{64}$ && "$previous_toir" =~ @sha256:[a-f0-9]{64}$ ]] || { echo "existing mock containers do not use immutable images; refusing image switch" >&2; exit 1; }
fi
[[ "$previous_knowledge" == /* ]] || previous_knowledge="${MEHAY_KB_DIR:-/opt/mehay/knowledge}"
previous_release=${previous_mount##*/}
previous_source_root=""
if [[ "$previous_release" =~ ^[a-f0-9]{64}$ && "$(basename "$(dirname "$previous_mount")")" == releases ]]; then
  previous_source_root=$(dirname "$(dirname "$previous_mount")")
else
  previous_release=""
fi
rollback() {
  echo "candidate failed health check; restoring ${previous:-no previous image}" >&2
  rollback_mocks=0
  if [[ "$previous" =~ @sha256:[a-f0-9]{64}$ ]]; then
    if [[ -n "$previous_release" ]]; then
      MEHAY_IMAGE="$previous" MEHAY_MOCK_ML_IMAGE="$previous_mocks" MEHAY_MOCK_TOIR_IMAGE="$previous_toir" MEHAY_PRIVATE_SOURCE_DIR="$previous_source_root" MEHAY_PRIVATE_RELEASE="$previous_release" MEHAY_KB_DIR="$previous_knowledge" docker compose --env-file /etc/mehay/mehay.env -f deploy/compose.yaml up -d --no-build --pull never
      rollback_mocks=1
    elif [[ "$previous_mocks" =~ @sha256:[a-f0-9]{64}$ ]]; then
      MEHAY_IMAGE="$previous" MEHAY_MOCK_ML_IMAGE="$previous_mocks" MEHAY_MOCK_TOIR_IMAGE="$previous_toir" MEHAY_KB_DIR="$previous_knowledge" docker compose --env-file /etc/mehay/mehay.env -f deploy/compose.legacy.yaml up -d --no-build --pull never
      rollback_mocks=1
    else
      MEHAY_IMAGE="$previous" MEHAY_MOCK_IMAGE="$mock_image" MEHAY_KB_DIR="$previous_knowledge" docker compose --env-file /etc/mehay/mehay.env -f deploy/compose.legacy.yaml up -d --no-build --pull never --no-deps mehay
      MEHAY_IMAGE="$previous" MEHAY_MOCK_IMAGE="$mock_image" docker compose --env-file /etc/mehay/mehay.env -f deploy/compose.legacy.yaml rm -sf mock-ml mock-toir
    fi
    for _ in {1..24}; do
      if [[ "$(docker inspect --format '{{.State.Health.Status}}' mehay 2>/dev/null || true)" == healthy \
        && ( "$rollback_mocks" == 0 || ( "$(docker inspect --format '{{.State.Health.Status}}' mehay-mock-ml 2>/dev/null || true)" == healthy \
          && "$(docker inspect --format '{{.State.Health.Status}}' mehay-mock-toir 2>/dev/null || true)" == healthy ) ) ]]; then
        return 0
      fi
      sleep 5
    done
    echo "restored app did not become healthy" >&2
    return 1
  else
    for container in mehay mehay-mock-ml mehay-mock-toir; do
      if docker container inspect "$container" >/dev/null 2>&1; then
        docker container rm --force "$container"
      fi
    done
  fi
}
docker pull "$image"
docker pull "$mock_image"
if ! MEHAY_IMAGE="$image" MEHAY_MOCK_IMAGE="$mock_image" MEHAY_PRIVATE_RELEASE="$MEHAY_PRIVATE_RELEASE" docker compose --env-file /etc/mehay/mehay.env -f deploy/compose.yaml up -d --no-build --pull never; then
  rollback
  exit 1
fi

for _ in {1..24}; do
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' mehay 2>/dev/null || true)" == healthy \
    && "$(docker inspect --format '{{.State.Health.Status}}' mehay-mock-ml 2>/dev/null || true)" == healthy \
    && "$(docker inspect --format '{{.State.Health.Status}}' mehay-mock-toir 2>/dev/null || true)" == healthy ]]; then
    echo "running $image with private NeuroDVS mocks"
    exit 0
  fi
  sleep 5
done

rollback
exit 1
