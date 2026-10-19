#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -u)" != 0 ]]; then
  echo 'Run this script as root: bash /opt/min-web-test/app/deploy/install.sh' >&2
  exit 1
fi

app_dir=/opt/min-web-test/app
runtime_dir=/opt/min-web-test/runtime
data_dir=/var/lib/min-web-test
node_version=24.22.0
[[ -f "$app_dir/package-lock.json" && -f "$app_dir/deploy/min-web-test.service" ]] || {
  echo "Extract the deployment archive into $app_dir first." >&2
  exit 1
}
case "$(uname -m)" in
  x86_64) architecture=x64 ;;
  aarch64|arm64) architecture=arm64 ;;
  *) echo 'Supported CPU architectures: x86_64 and arm64.' >&2; exit 1 ;;
esac

apt-get update
apt-get install -y ca-certificates curl xz-utils

if [[ ! -x "$runtime_dir/bin/node" ]] || [[ "$("$runtime_dir/bin/node" --version)" != "v$node_version" ]]; then
  download_dir=$(mktemp -d /tmp/min-web-node.XXXXXXXX)
  trap 'rm -rf -- "$download_dir"' EXIT
  archive="node-v${node_version}-linux-${architecture}.tar.xz"
  curl --fail --show-error --location "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" -o "$download_dir/SHASUMS256.txt"
  curl --fail --show-error --location "https://nodejs.org/dist/v${node_version}/$archive" -o "$download_dir/$archive"
  (cd "$download_dir" && sha256sum --check --ignore-missing SHASUMS256.txt)
  install -d -m 755 "$runtime_dir"
  tar -xJf "$download_dir/$archive" -C "$runtime_dir" --strip-components=1
fi

export PATH="$runtime_dir/bin:$PATH"
if ! id minweb >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$data_dir" --shell /usr/sbin/nologin minweb
fi
install -d -o minweb -g minweb -m 700 "$data_dir"
if systemctl is-active --quiet min-web-test; then
  systemctl stop min-web-test
fi
cd "$app_dir"
npm ci --omit=dev --no-audit --no-fund
install -m 644 "$app_dir/deploy/min-web-test.service" /etc/systemd/system/min-web-test.service
systemctl daemon-reload
systemctl enable min-web-test
systemctl restart min-web-test

for attempt in {1..20}; do
  if curl --silent --fail http://127.0.0.1:3000/api/session >/dev/null; then
    echo 'MIN LAB is running at http://127.0.0.1:3000'
    echo "Database and sessions: $data_dir"
    systemctl --no-pager --full status min-web-test
    exit 0
  fi
  sleep 1
done
journalctl -u min-web-test -n 60 --no-pager
exit 1
