#!/usr/bin/env bash
#
# Debug startup script for the balena browser container.
#
# The balena browser base image starts Chromium with remote debugging on an
# internal-only port (controlled by REMOTE_DEBUG_PORT, set to 35173 in
# docker-compose.yml). This script runs alongside the normal browser startup
# and proxies that internal port to 0.0.0.0:9222 so that Chrome DevTools or
# other CDP clients on the host machine can connect from outside the container.
#
# Usage: set DEBUG=true in the environment (via Balena dashboard or .env file);
#        the Dockerfile's CMD will call this script automatically.

# Start the normal balena browser startup script in the background so Chromium
# launches as usual (kiosk mode, GPU acceleration, etc.).
bash /usr/src/app/start.sh &
sleep 10;
# Forward any TCP connection on the external port 9222 to the internal Chrome
# DevTools Protocol port (35173).  The `fork` flag allows multiple simultaneous
# CDP clients (e.g. DevTools + Playwright) to connect at the same time.
socat TCP-LISTEN:9222,fork,bind=0.0.0.0 TCP:127.0.0.1:35173