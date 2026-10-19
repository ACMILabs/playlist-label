FROM bh.cr/balenasolutions/browser-raspberrypi5/2.12.2

COPY ./run_debug.sh /usr/source/app/

# socat exposes the Chrome DevTools Protocol on an external port in debug mode.
RUN apt-get update && apt-get install -y socat && rm -rf /var/cache/apt/archives/* /var/lib/apt/lists/*

# DEBUG=true starts the browser and the CDP proxy; otherwise balena's own start script.
CMD ["bash", "-c", "[[ $DEBUG == true ]] && bash /usr/source/app/run_debug.sh || bash /usr/src/app/start.sh"]