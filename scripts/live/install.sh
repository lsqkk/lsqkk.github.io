#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "$0")"
archive=${1:?provide the MediaMTX v1.21.3 linux amd64 archive}
checksum=0a2ea7eba96023631efa1bea7804823a9145b043b6646a8a05798d4ac24ed635
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status

stage=$(mktemp -d /tmp/quark-live-install.XXXXXX)
trap 'rm -f -- "$stage/mediamtx" "$stage/mediamtx.yml" "$stage/live.caddy"; rmdir -- "$stage"' EXIT
tar -xzf "$archive" -C "$stage" mediamtx

install -d -m 0755 /opt/quark-live /var/www/quark-live
install -d -m 0700 /etc/quark-live
if [[ ! -s /etc/quark-live/srt-passphrase ]]; then
    (umask 077; openssl rand -hex 16 > /etc/quark-live/srt-passphrase)
fi
read -r passphrase < /etc/quark-live/srt-passphrase
[[ "$passphrase" =~ ^[a-f0-9]{32}$ ]]
template=$(<mediamtx.yml)
(umask 077; printf '%s\n' "${template/__SRT_PASSPHRASE__/$passphrase}" > "$stage/mediamtx.yml")
"$stage/mediamtx" --validate-conf "$stage/mediamtx.yml"
install -m 0600 "$stage/mediamtx.yml" /etc/quark-live/mediamtx.yml
(umask 077; printf 'srt://live.130923.xyz:8890?streamid=publish:quark&pkt_size=1316&passphrase=%s\n' "$passphrase" > /etc/quark-live/obs-url)
unset passphrase

install -m 0755 "$stage/mediamtx" /opt/quark-live/mediamtx
install -m 0644 room-server.py /opt/quark-live/room-server.py
install -m 0644 quark-mediamtx.service quark-live-room.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable quark-mediamtx.service quark-live-room.service
systemctl restart quark-mediamtx.service quark-live-room.service

site=/etc/caddy/sites/quark-live.caddy
if [[ -f "$site" ]]; then cp -- "$site" "$stage/live.caddy"; fi
install -m 0644 live.caddy "$site"
if ! caddy validate --config /etc/caddy/Caddyfile || ! systemctl reload caddy; then
    if [[ -f "$stage/live.caddy" ]]; then
        install -m 0644 "$stage/live.caddy" "$site"
    else
        rm -f -- "$site"
    fi
    exit 1
fi

systemctl is-active quark-mediamtx.service quark-live-room.service caddy.service
