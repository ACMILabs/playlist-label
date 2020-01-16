#!/bin/bash

rm /tmp/.X0-lock &>/dev/null || true

echo "Starting X in 2 seconds"
sleep 2
startx &
sleep 20

# Hide the cursor
unclutter -display :0 -idle 0.1 &

# Start Flask
python -u -m app.main &

sleep 10

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

# Launch chromium browser in fullscreen on that page
SCREEN_SCALE="${SCREEN_SCALE:-1.0}"
chromium-browser --app=http://localhost:8081 --start-fullscreen --no-sandbox --user-data-dir --kiosk --force-device-scale-factor=$SCREEN_SCALE

# For debugging
echo "Chromium browser exited unexpectedly."
free -h
echo "End of pi.sh ..."
