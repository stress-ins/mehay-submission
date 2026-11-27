#!/usr/bin/env bash
set -euo pipefail

image=${1:?usage: switch-image.sh app-image@sha256:digest mocks-image@sha256:digest}
[[ "$image" =~ @sha256:[a-f0-9]{64}$ ]] || { echo "image must use an immutable sha256 digest" >&2; exit 2; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required; refusing image switch" >&2; exit 1; }
mock_image=${2:?usage: switch-image.sh app-image@sha256:digest mocks-image@sha256:digest}
[[ "$mock_image" =~ @sha256:[a-f0-9]{64}$ ]] || { echo "mock image must use an immutable sha256 digest" >&2; exit 2; }
cd "${MEHAY_DEPLOY_ROOT:-/opt/mehay}"
containers=$(docker container ls -a --format '{{.Names}}') || { echo "cannot inspect existing containers; refusing image switch" >&2; exit 1; }
has_app=0; has_ml=0; has_toir=0
printf '%s\n' "$containers" | grep -Fqx mehay && has_app=1 || true
printf '%s\n' "$containers" | grep -Fqx mehay-mock-ml && has_ml=1 || true
printf '%s\n' "$containers" | grep -Fqx mehay-mock-toir && has_toir=1 || true
count=$((has_app + has_ml + has_toir))
(( count == 0 || count == 3 )) || { echo "existing deployment is incomplete; refusing image switch" >&2; exit 1; }
kind=empty
previous=""; previous_mocks=""; previous_toir=""; previous_mount=""; previous_knowledge=""; previous_release=""; previous_source_root=""
if (( count == 3 )); then
  inspect() { docker inspect --format "$1" "$2"; }
  previous=$(inspect '{{.Config.Image}}' mehay) || { echo "cannot inspect current app image; refusing image switch" >&2; exit 1; }
  previous_mocks=$(inspect '{{.Config.Image}}' mehay-mock-ml) || { echo "cannot inspect current mock image; refusing image switch" >&2; exit 1; }
  previous_toir=$(inspect '{{.Config.Image}}' mehay-mock-toir) || { echo "cannot inspect current TOIR mock image; refusing image switch" >&2; exit 1; }
  previous_mount=$(inspect '{{range .Mounts}}{{if eq .Destination "/private-source"}}{{.Source}}{{end}}{{end}}' mehay) || { echo "cannot inspect current app source mount; refusing image switch" >&2; exit 1; }
  previous_ml_mount=$(inspect '{{range .Mounts}}{{if eq .Destination "/private-source"}}{{.Source}}{{end}}{{end}}' mehay-mock-ml) || { echo "cannot inspect current ML source mount; refusing image switch" >&2; exit 1; }
  previous_toir_mount=$(inspect '{{range .Mounts}}{{if eq .Destination "/private-source"}}{{.Source}}{{end}}{{end}}' mehay-mock-toir) || { echo "cannot inspect current TOIR source mount; refusing image switch" >&2; exit 1; }
  previous_knowledge=$(inspect '{{range .Mounts}}{{if eq .Destination "/knowledge"}}{{.Source}}{{end}}{{end}}' mehay) || { echo "cannot inspect current knowledge mount; refusing image switch" >&2; exit 1; }
  app_source_rw=$(inspect '{{range .Mounts}}{{if eq .Destination "/private-source"}}{{.RW}}{{end}}{{end}}' mehay) || { echo "cannot inspect current app source mount mode; refusing image switch" >&2; exit 1; }
  ml_source_rw=$(inspect '{{range .Mounts}}{{if eq .Destination "/private-source"}}{{.RW}}{{end}}{{end}}' mehay-mock-ml) || { echo "cannot inspect ML source mount mode; refusing image switch" >&2; exit 1; }
  toir_source_rw=$(inspect '{{range .Mounts}}{{if eq .Destination "/private-source"}}{{.RW}}{{end}}{{end}}' mehay-mock-toir) || { echo "cannot inspect TOIR source mount mode; refusing image switch" >&2; exit 1; }
  knowledge_rw=$(inspect '{{range .Mounts}}{{if eq .Destination "/knowledge"}}{{.RW}}{{end}}{{end}}' mehay) || { echo "cannot inspect current knowledge mount mode; refusing image switch" >&2; exit 1; }
  [[ "$previous" =~ @sha256:[a-f0-9]{64}$ && "$previous_mocks" =~ @sha256:[a-f0-9]{64}$ && "$previous_toir" =~ @sha256:[a-f0-9]{64}$ ]] || { echo "existing deployment uses mutable images; refusing image switch" >&2; exit 1; }
  if [[ -z "$previous_mount" && -z "$previous_ml_mount" && -z "$previous_toir_mount" ]]; then
    kind=legacy
  elif [[ -n "$previous_mount" && "$previous_mount" == "$previous_ml_mount" && "$previous_mount" == "$previous_toir_mount" ]]; then
    previous_release=${previous_mount##*/}
    [[ "$previous_release" =~ ^[a-f0-9]{64}$ && "$(basename "$(dirname "$previous_mount")")" == releases && -d "$previous_mount" && ! -L "$previous_mount" && "$(cd "$previous_mount" && pwd -P)" == "$previous_mount" ]] || { echo "existing source mounts do not identify one immutable release; refusing image switch" >&2; exit 1; }
    [[ "$app_source_rw" == false && "$ml_source_rw" == false && "$toir_source_rw" == false ]] || { echo "existing private source mounts are not read-only; refusing image switch" >&2; exit 1; }
    previous_source_root=$(dirname "$(dirname "$previous_mount")")
    kind=modern
  else
    echo "existing private source mounts differ; refusing image switch" >&2
    exit 1
  fi
  [[ -z "$previous_knowledge" || ( "$previous_knowledge" == /* && -d "$previous_knowledge" && ! -L "$previous_knowledge" ) ]] || { echo "existing knowledge mount is unsafe; refusing image switch" >&2; exit 1; }
  if [[ -n "$previous_knowledge" ]]; then
    [[ "$knowledge_rw" == false && "$(cd "$previous_knowledge" && pwd -P)" == "$previous_knowledge" ]] || { echo "existing knowledge mount is not canonical and read-only; refusing image switch" >&2; exit 1; }
  fi
fi
[[ -n "$previous_knowledge" ]] || previous_knowledge="${MEHAY_KB_DIR:-/opt/mehay/knowledge}"

rollback() {
  echo "candidate failed health check; restoring prior deployment" >&2
  if [[ "$kind" == modern ]]; then
    MEHAY_IMAGE="$previous" MEHAY_MOCK_ML_IMAGE="$previous_mocks" MEHAY_MOCK_TOIR_IMAGE="$previous_toir" MEHAY_PRIVATE_SOURCE_DIR="$previous_source_root" MEHAY_PRIVATE_RELEASE="$previous_release" MEHAY_KB_DIR="$previous_knowledge" docker compose --env-file /etc/mehay/mehay.env -f deploy/compose.yaml up -d --no-build --pull never || return 1
  elif [[ "$kind" == legacy ]]; then
    MEHAY_IMAGE="$previous" MEHAY_MOCK_ML_IMAGE="$previous_mocks" MEHAY_MOCK_TOIR_IMAGE="$previous_toir" MEHAY_KB_DIR="$previous_knowledge" docker compose --env-file /etc/mehay/mehay.env -f deploy/compose.legacy.yaml up -d --no-build --pull never || return 1
  else
    echo "no exact rollback target exists; refusing destructive cleanup" >&2
    return 1
  fi
  for _ in {1..24}; do
    if [[ "$(docker inspect --format '{{.State.Health.Status}}' mehay 2>/dev/null || true)" == healthy \
      && "$(docker inspect --format '{{.State.Health.Status}}' mehay-mock-ml 2>/dev/null || true)" == healthy \
      && "$(docker inspect --format '{{.State.Health.Status}}' mehay-mock-toir 2>/dev/null || true)" == healthy ]]; then return 0; fi
    sleep 5
  done
  echo "restored deployment did not become healthy" >&2
  return 1
}

docker pull "$image"
docker pull "$mock_image"
if ! MEHAY_IMAGE="$image" MEHAY_MOCK_IMAGE="$mock_image" MEHAY_MOCK_ML_IMAGE="$mock_image" MEHAY_MOCK_TOIR_IMAGE="$mock_image" MEHAY_PRIVATE_RELEASE="${MEHAY_PRIVATE_RELEASE:-}" docker compose --env-file /etc/mehay/mehay.env -f deploy/compose.yaml up -d --no-build --pull never; then
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
