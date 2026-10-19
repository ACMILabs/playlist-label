"""
The nightmare room's mode, set from TouchOSC over OSC.

The room is in one of four modes, shown on its label:

- `waiting`: between runs; no timer. The room starts here, and a run ends here.
- `running`: a run of NIGHTMARE_RUN_MINUTES, timed from `start`.
- `unavailable`: off for now, not broken.
- `closed`: no more runs today.

Commands are OSC messages to /nightmare/<command>: `start` (during a run, it
starts the run over), `wait`, `unavailable` and `close`. A TouchOSC button
sends 1 on press and 0 on release; only the press counts.

`/api/room-stream/` sends the mode to the label and, during a run, its length
and position in the shape of the media player's playback events, so the label
times a run as it times a video.

To send a command without TouchOSC, from the machine the label runs on:

    python -m app.nightmare_room start
"""
import os
import sys
import threading
import time

from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import ThreadingOSCUDPServer
from pythonosc.udp_client import SimpleUDPClient

ADDRESS = '/nightmare/'

COMMANDS = {
    'start': 'running',
    'wait': 'waiting',
    'unavailable': 'unavailable',
    'close': 'closed',
}


class NightmareRoom:
    """The room's mode, and the run's clock while one is on."""

    def __init__(self, run_seconds, clock=time.monotonic):
        self._run_seconds = run_seconds
        self._clock = clock
        self._mode = 'waiting'
        self._started = 0.0
        self._changed = threading.Condition()

    def command(self, name):
        """Puts the room in the mode `name` sets. False if it sets none."""
        mode = COMMANDS.get(name)
        if mode is None:
            return False
        with self._changed:
            self._mode = mode
            self._started = self._clock()
            self._changed.notify_all()
        return True

    def snapshot(self):
        """The mode, and while a run is on, its length and how far through."""
        with self._changed:
            if self._mode == 'running':
                elapsed = self._clock() - self._started
                if elapsed < self._run_seconds:
                    return {
                        'mode': 'running',
                        'duration': self._run_seconds * 1000,
                        'playback_position': elapsed / self._run_seconds,
                    }
                self._mode = 'waiting'
            return {'mode': self._mode}

    def wait_for_change(self, timeout):
        """Blocks until a command arrives, or `timeout` seconds pass."""
        with self._changed:
            self._changed.wait(timeout)

    def listen(self, port):
        """Hears commands over OSC on UDP `port`, in a thread of its own."""
        dispatcher = Dispatcher()
        for name in COMMANDS:
            dispatcher.map(ADDRESS + name, self._on_command)
        dispatcher.set_default_handler(self._on_other)
        server = ThreadingOSCUDPServer(('0.0.0.0', port), dispatcher)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        print(f'[osc] Listening for {ADDRESS}* on UDP {port}')
        return server

    def _on_command(self, address, *args):
        # Ignore a button's release (0).
        if args and not args[0]:
            return
        self.command(address[len(ADDRESS):])
        print(f'[osc] {address}: {self.snapshot()["mode"]}')

    @staticmethod
    def _on_other(address, *_):
        # TouchOSC sends its other controls too; only say so for ours.
        if address.startswith(ADDRESS):
            print(f'[osc] {address}: no such command')


if __name__ == '__main__':
    from app import dev_env

    dev_env.load()
    PORT = int(os.getenv('OSC_PORT', '8000'))
    SimpleUDPClient('127.0.0.1', PORT).send_message(ADDRESS + sys.argv[1], 1)
    print(f'Sent {ADDRESS}{sys.argv[1]} to UDP {PORT}')
