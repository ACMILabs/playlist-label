#!/bin/bash

# Sets up a balena device to reboot itself once a day.
set -eu

SUPERVISOR_CONFIG="/etc/default/balena-supervisor"
REBOOT_SCRIPT="/usr/local/bin/device_reboot.sh"
CRON_FILE="/etc/cron.d/device-reboot"
TIMEZONE="${TZ:-Australia/Melbourne}"

# When to reboot, in local time, as plain numbers (3, not 03).
REBOOT_HOUR="${REBOOT_HOUR:-8}"
REBOOT_MINUTE="${REBOOT_MINUTE:-0}"

REBOOT_TIME="$(printf '%02d:%02d' "$((10#$REBOOT_HOUR))" "$((10#$REBOOT_MINUTE))")"

mkdir -p "$(dirname "$SUPERVISOR_CONFIG")"
cat > "$SUPERVISOR_CONFIG" <<EOF
BALENA_SUPERVISOR_ADDRESS="${BALENA_SUPERVISOR_ADDRESS:-}"
BALENA_SUPERVISOR_API_KEY="${BALENA_SUPERVISOR_API_KEY:-}"
EOF

cat > "$REBOOT_SCRIPT" <<'REBOOT_SCRIPT_EOF'
#!/bin/sh
set -eu
LOG_PREFIX="[reboot]"

# shellcheck disable=SC1091
. /etc/default/balena-supervisor 2>/dev/null || true

if [ -n "${BALENA_SUPERVISOR_ADDRESS:-}" ] && [ -n "${BALENA_SUPERVISOR_API_KEY:-}" ]; then
  URL="${BALENA_SUPERVISOR_ADDRESS}/v1/reboot?apikey=${BALENA_SUPERVISOR_API_KEY}"
  echo "$LOG_PREFIX Requesting device reboot via Supervisor..." >&2

  wget -q --header="Content-Type: application/json" --post-data='{}' "$URL" -O - \
    || echo "$LOG_PREFIX Supervisor request failed" >&2
else
  echo "$LOG_PREFIX Supervisor env not available, skipping." >&2
fi
REBOOT_SCRIPT_EOF

chmod +x "$REBOOT_SCRIPT"

ln -sf "/usr/share/zoneinfo/$TIMEZONE" /etc/localtime
echo "$TIMEZONE" > /etc/timezone

cat > "$CRON_FILE" <<EOF
SHELL=/bin/sh
CRON_TZ=$TIMEZONE
$REBOOT_MINUTE $REBOOT_HOUR * * * root $REBOOT_SCRIPT >> /proc/1/fd/1 2>&1
EOF
chmod 0644 "$CRON_FILE"

/usr/sbin/cron -f &

echo "Cron started (daily reboot at $REBOOT_TIME $TIMEZONE)."

python -u -m app.cache

python -u -m app.main
