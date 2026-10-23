#!/bin/bash

# Sets up a balena device to reboot itself once a day.
set -eu

SUPERVISOR_CONFIG="/etc/default/balena-supervisor"
REBOOT_SCRIPT="/usr/local/bin/device_reboot.sh"
CRON_FILE="/etc/cron.d/device-reboot"
TIMEZONE="${TZ:-Australia/Melbourne}"

# When to reboot, in local time. Override via env vars, e.g. REBOOT_HOUR=3.
# Set these as plain numbers (3, not 03).
REBOOT_HOUR="${REBOOT_HOUR:-8}"
REBOOT_MINUTE="${REBOOT_MINUTE:-0}"

# Human-readable HH:MM for the log line below. 
REBOOT_TIME="$(printf '%02d:%02d' "$((10#$REBOOT_HOUR))" "$((10#$REBOOT_MINUTE))")"

# Supervisor connection details 

mkdir -p "$(dirname "$SUPERVISOR_CONFIG")"
cat > "$SUPERVISOR_CONFIG" <<EOF
BALENA_SUPERVISOR_ADDRESS="${BALENA_SUPERVISOR_ADDRESS:-}"
BALENA_SUPERVISOR_API_KEY="${BALENA_SUPERVISOR_API_KEY:-}"
EOF

# Reboot script 

cat > "$REBOOT_SCRIPT" <<'REBOOT_SCRIPT_EOF'
#!/bin/sh
set -eu
LOG_PREFIX="[reboot]"

# Load the Supervisor address and API key (ignore errors if the file is missing)
# shellcheck disable=SC1091
. /etc/default/balena-supervisor 2>/dev/null || true

# Only attempt a reboot if we actually have both values
if [ -n "${BALENA_SUPERVISOR_ADDRESS:-}" ] && [ -n "${BALENA_SUPERVISOR_API_KEY:-}" ]; then
  URL="${BALENA_SUPERVISOR_ADDRESS}/v1/reboot?apikey=${BALENA_SUPERVISOR_API_KEY}"
  echo "$LOG_PREFIX Requesting device reboot via Supervisor..." >&2

  # POST to the Supervisor's reboot endpoint
  wget -q --header="Content-Type: application/json" --post-data='{}' "$URL" -O - \
    || echo "$LOG_PREFIX Supervisor request failed" >&2
else
  echo "$LOG_PREFIX Supervisor env not available, skipping." >&2
fi
REBOOT_SCRIPT_EOF

chmod +x "$REBOOT_SCRIPT"

# Timezone + daily cron job 

ln -sf "/usr/share/zoneinfo/$TIMEZONE" /etc/localtime
echo "$TIMEZONE" > /etc/timezone

# the timezone, schedule, and script path are substituted
cat > "$CRON_FILE" <<EOF
SHELL=/bin/sh
CRON_TZ=$TIMEZONE
# Reboot daily at the configured local time
$REBOOT_MINUTE $REBOOT_HOUR * * * root $REBOOT_SCRIPT >> /proc/1/fd/1 2>&1
EOF
chmod 0644 "$CRON_FILE"

/usr/sbin/cron -f &

echo "Cron started (daily reboot at $REBOOT_TIME $TIMEZONE)."

# Download and cache XOS Playlist
python -u -m app.cache

# Start Flask
python -u -m app.main
