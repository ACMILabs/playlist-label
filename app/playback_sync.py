import json
import threading
import time

import paho.mqtt.client as mqtt


class PlaybackSync:
    """
    Owns the MQTT connection, playback state, and SSE client tracking.
    Callers use wait() to block until a new playback message arrives.
    """

    def __init__(self, host, port, user, password, topic, retry_seconds=2):
        self._host = host
        self._port = int(port)
        self._user = user
        self._password = password
        self._topic = topic
        self._retry_seconds = retry_seconds

        self._last_body = None
        self._event = threading.Event()
        self._lock = threading.Lock()
        self._clients = set()
        self._clients_lock = threading.Lock()
        self._count = 0
        self._sse_count = 0

    def start(self):
        """Start the MQTT and log threads."""
        threading.Thread(target=self._mqtt_thread, daemon=True).start()
        threading.Thread(target=self._log_thread, daemon=True).start()

    def receive(self, payload: bytes):
        """Handle a raw MQTT payload. Public seam for tests."""
        try:
            body = json.loads(payload.decode())
            with self._lock:
                self._count += 1
                self._last_body = body
            self._event.set()
        except Exception as exc:  # pylint: disable=broad-except
            print(f'[mqtt] Error parsing message: {exc}')

    def wait(self, last_body, timeout=1.0):
        """
        Block until a body different from last_body arrives (or timeout).
        Returns the new body, or None on timeout.
        """
        body = self._last_body
        if body is not None and body is not last_body:
            with self._lock:
                self._sse_count += 1
            return body
        self._event.wait(timeout=timeout)
        self._event.clear()
        body = self._last_body
        if body is not None and body is not last_body:
            with self._lock:
                self._sse_count += 1
            return body
        return None

    def client(self, client_ip):
        """Context manager — registers a client on enter, removes on exit."""
        return _ClientContext(self, client_ip)

    def _mqtt_thread(self):
        client = mqtt.Client()
        client.username_pw_set(self._user, self._password)
        client.on_connect = self._on_connect
        client.on_disconnect = self._on_disconnect
        client.on_message = self._on_mqtt_message
        client.reconnect_delay_set(min_delay=self._retry_seconds, max_delay=60)
        print(f'[mqtt] Connecting to {self._host}:{self._port}...')
        client.connect_async(self._host, self._port)
        client.loop_forever()

    def _on_connect(self, client, userdata, flags, rc):  # pylint: disable=unused-argument
        if rc == 0:
            print(f'[mqtt] Connected to {self._host}:{self._port}')
            client.subscribe(self._topic)
            print(f'[mqtt] Subscribed to {self._topic}')
        else:
            print(f'[mqtt] Connection refused (rc={rc}) — check credentials and host')

    def _on_disconnect(self, client, userdata, rc):  # pylint: disable=unused-argument
        if rc != 0:
            print(f'[mqtt] Unexpected disconnect (rc={rc}), will auto-reconnect')

    def _on_mqtt_message(self, client, userdata, msg):  # pylint: disable=unused-argument
        self.receive(msg.payload)

    def _log_thread(self):
        while True:
            time.sleep(5)
            with self._lock:
                count = self._count
                sse_count = self._sse_count
                body = self._last_body
                self._count = 0
                self._sse_count = 0
            with self._clients_lock:
                clients = sorted(self._clients)
            if count:
                print(
                    f'[mqtt] {count} message(s), {sse_count} SSE send(s) to {clients} '
                    f'| duration={body.get("duration")} '
                    f'| playback_position={body.get("playback_position")}'
                )
            else:
                print('[mqtt] No messages received')


class _ClientContext:
    def __init__(self, sync: PlaybackSync, client_ip: str):
        self._sync = sync
        self._ip = client_ip

    def __enter__(self):
        print(f'[sse] Client connected: {self._ip}')
        with self._sync._clients_lock:
            self._sync._clients.add(self._ip)
        return self

    def __exit__(self, *_):
        with self._sync._clients_lock:
            self._sync._clients.discard(self._ip)
