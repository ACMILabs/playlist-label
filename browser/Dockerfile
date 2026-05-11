FROM bh.cr/balenalabs/browser-aarch64

COPY ./run_debug.sh /usr/source/app/

# Install socat for TCP port proxying — used in debug mode to expose the
# Chrome DevTools Protocol (CDP) on an external port so a host machine can
# connect to it with Chrome DevTools.
RUN apt-get update && apt-get install -y socat && rm -rf /var/cache/apt/archives/* /var/lib/apt/lists/*

# When DEBUG=true, run the debug startup script (which starts the browser AND
# opens the CDP proxy).  Otherwise fall back to the standard balena start script.
CMD ["bash", "-c", "[[ $DEBUG == true ]] && bash /usr/source/app/run_debug.sh || bash /usr/src/app/start.sh"]