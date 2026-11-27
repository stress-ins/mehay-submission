#!/usr/bin/env bash
set -euo pipefail

for path in /opt /etc /opt/mehay /etc/mehay /opt/mehay/private-source /opt/mehay/private-source/releases /opt/mehay/data /opt/mehay/knowledge; do
  [[ ! -L "$path" ]] || { echo "unsafe symlink in host data path: $path" >&2; exit 1; }
  [[ ! -e "$path" || -d "$path" ]] || { echo "host data path is not a directory: $path" >&2; exit 1; }
done
for path in /opt /opt/mehay /opt/mehay/private-source /opt/mehay/private-source/releases; do
  if [[ -d "$path" ]]; then
    owner=$(stat -c '%u:%g:%a' "$path")
    [[ "$owner" =~ ^0:([0-9]+):([0-7]{3})$ ]] || { echo "unsafe ownership on private source path: $path" >&2; exit 1; }
    group=${BASH_REMATCH[1]}
    mode=${BASH_REMATCH[2]}
    if [[ "$path" == /opt/mehay/private-source* ]]; then
      [[ "$group" == 1000 ]] || { echo "unsafe ownership on private source path: $path" >&2; exit 1; }
      (( (8#$mode & 0027) == 0 && (8#$mode & 0050) == 0050 )) || { echo "unsafe permissions on private source path: $path" >&2; exit 1; }
    else
      (( (8#$mode & 0022) == 0 )) || { echo "unsafe writable ancestor for private source: $path" >&2; exit 1; }
    fi
  fi
done
if [[ ! -d /opt/mehay ]]; then
  install -d -o root -g root -m 0750 /opt/mehay
fi
if [[ ! -d /etc/mehay ]]; then
  install -d -o root -g root -m 0750 /etc/mehay
fi
if [[ ! -d /opt/mehay/private-source ]]; then
  install -d -o root -g 1000 -m 0750 /opt/mehay/private-source
fi
if [[ ! -d /opt/mehay/private-source/releases ]]; then
  install -d -o root -g 1000 -m 0750 /opt/mehay/private-source/releases
fi
if [[ ! -d /opt/mehay/data ]]; then
  install -d -o 1000 -g 1000 -m 0700 /opt/mehay/data
fi
if [[ ! -d /opt/mehay/knowledge ]]; then
  install -d -o root -g 1000 -m 0750 /opt/mehay/knowledge
fi
if [[ ! -e /etc/mehay/mehay.env ]]; then
  install -o root -g root -m 0600 /dev/null /etc/mehay/mehay.env
fi
