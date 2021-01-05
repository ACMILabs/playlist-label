#!/bin/bash

# run tests
make linttestjs

# prevent exiting so tests can be re-run
while true; do sleep 1000; done
