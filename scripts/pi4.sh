#!/bin/bash

# Remove the X server lock file so ours starts cleanly
rm /tmp/.X0-lock &>/dev/null || true

# Set the display to use
export DISPLAY=:0

# Set the DBUS address for sending around system messages
export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket

# Set XDG_RUNTIME_DIR
mkdir -pv ~/.cache/xdgr
export XDG_RUNTIME_DIR=$PATH:~/.cache/xdgr

# Create Xauthority
touch /root/.Xauthority

# start desktop manager
echo "STARTING X"
sleep 2
startx &
sleep 20

# Rotate the display if needed
ROTATE_SCREEN="${ROTATE_SCREEN:-false}"
if [ "$ROTATE_SCREEN" == left ]
then
xrandr -o left
# Rotate Raspberry Pi screen touch interface
xinput set-prop "FT5406 memory based driver" --type=float "Coordinate Transformation Matrix" 0 -1 1 1 0 0 0 0 1
# Rotate 12.3" screen touch interface
xinput set-prop "ILITEK ILITEK-TP" --type=float "Coordinate Transformation Matrix" 0 -1 1 1 0 0 0 0 1
fi
if [ "$ROTATE_SCREEN" == right ]
then
xrandr -o right
# Rotate Raspberry Pi screen touch interface
xinput set-prop "FT5406 memory based driver" --type=float "Coordinate Transformation Matrix" 0 1 0 -1 0 1 0 0 1
# Rotate 12.3" screen touch interface
xinput set-prop "ILITEK ILITEK-TP" --type=float "Coordinate Transformation Matrix" 0 1 0 -1 0 1 0 0 1
fi

# Set the screen resolution to 1920x720 if it's a Playlist Label 12.3" screen
PLAYLIST_LABEL_SCREEN="${PLAYLIST_LABEL_SCREEN:-true}"
if [ "$PLAYLIST_LABEL_SCREEN" == true ]
then
xrandr --newmode "1920x720_60.00"  100.98  1920 2008 2052 2200  720 724 729 765  +HSync +Vsync
xrandr --addmode HDMI-1 "1920x720_60.00"
xrandr --output HDMI-1 --mode "1920x720_60.00"
fi

# Hide the cursor
unclutter -display :0 -idle 0.1 &

# Start Flask
python3 -u -m app.main &

sleep 10

# Launch chromium browser in fullscreen on that page
SCREEN_SCALE="${SCREEN_SCALE:-1.0}"
chromium-browser --app=http://localhost:8081 --start-fullscreen --no-sandbox --user-data-dir --kiosk --disable-dev-shm-usage --disable-backing-store-limit --force-device-scale-factor=$SCREEN_SCALE --check-for-update-interval=31449600 --simulate-outdated-no-au='Tue, 31 Dec 2099 23:59:59 GMT'

# For debugging
echo "Chromium browser exited unexpectedly."
free -h

# Restart the container manually
echo "Restarting container..."
curl -H "Content-Type: application/json" -d "{\"serviceName\": \"$BALENA_SERVICE_NAME\"}" "$BALENA_SUPERVISOR_ADDRESS/v2/applications/$BALENA_APP_ID/restart-service?apikey=$BALENA_SUPERVISOR_API_KEY"
echo "End of pi.sh"
