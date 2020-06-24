#!/bin/bash

# Download and cache XOS Playlist
python -u -m app.cache

# Start Flask
export FLASK_DEBUG=1
python -u -m app.main
