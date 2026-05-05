#!/bin/bash

# Download and cache XOS Playlist
python -u -m app.cache

# Start Flask
python -u -m app.main
