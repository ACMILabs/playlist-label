#!/usr/bin/env bash
#
# DEBUG=true startup for the browser container: starts the browser as usual,
# then exposes Chromium's DevTools port (REMOTE_DEBUG_PORT, 35173, internal
# only) on 0.0.0.0:9222 so DevTools on another machine can connect.

bash /usr/src/app/start.sh &
sleep 10
# `fork` lets several CDP clients connect at once.
socat TCP-LISTEN:9222,fork,bind=0.0.0.0 TCP:127.0.0.1:35173
