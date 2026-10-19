"""
A stand-in for the media player, for trying a label without one.

`MOCK_MEDIA_PLAYER=true` starts it in place of the MQTT connection. It loops
the cached playlist, every labelled item `MOCK_VIDEO_SECONDS` long, and once a
second hands `PlaybackSync` the message the real player would publish.
"""
import json
import threading
import time


class MockMediaPlayer:
    """Plays the cached playlist into a PlaybackSync, as the media player would."""

    def __init__(self, sync, playlist_path, seconds=60):
        self._sync = sync
        self._playlist_path = playlist_path
        self._seconds = seconds

    def start(self):
        """Start playing, from the top of the playlist."""
        threading.Thread(target=self._play, daemon=True).start()

    def _play(self):
        print(f'[mock] Playing {self._playlist_path}, {self._seconds}s an item')
        started = time.monotonic()
        while True:
            message = self.message_at(self.label_ids(), time.monotonic() - started)
            if message:
                self._sync.receive(json.dumps(message).encode())
            time.sleep(1)

    def label_ids(self):
        """The labelled items' ids, in order. Read each time, so a new cache takes effect."""
        try:
            with open(self._playlist_path, encoding='utf-8') as playlist_file:
                items = json.load(playlist_file).get('playlist_labels', [])
        except (FileNotFoundError, json.JSONDecodeError):
            return []
        return [item['label']['id'] for item in items if item.get('label')]

    def message_at(self, label_ids, elapsed):
        """
        What the player would publish `elapsed` seconds in, or None with nothing
        to play: only the fields the playback stream forwards, duration in ms.
        """
        if not label_ids:
            return None
        into_loop = elapsed % (len(label_ids) * self._seconds)
        index, into_item = divmod(into_loop, self._seconds)
        return {
            'label_id': label_ids[int(index)],
            'duration': self._seconds * 1000,
            'playback_position': into_item / self._seconds,
        }
