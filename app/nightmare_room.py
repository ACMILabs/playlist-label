"""
The nightmare room's mode, set from TouchOSC over OSC.

The room is always in one of four modes, and its label shows which:

- `waiting`: between runs, visitors queueing. No timer. The mode the room
  starts in, and the one a run ends in.
- `running`: a run is on, NIGHTMARE_RUN_MINUTES long, timed from `start`.
  When it ends, the room goes back to waiting by itself.
- `unavailable`: off for now. Not broken, just not running.
- `closed`: no more runs today.

TouchOSC sends a command as a message to an address under /nightmare/:
`start` (sent again during a run, it starts the run over), `wait`,
`unavailable` and `close`. A button sends 1 when it is pressed and 0 when it
is let go; only the press is a command.

`/api/room-stream/` hands the mode on to the label, and while a run is on,
its length and how far through it is, in the same shape as the media
player's playback events: the label times a run as it times a video.

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

# Each command, and the mode it puts the room in.
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
                # The run is over: the room waits for the next.
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
        # A button's release is a 0: only the press is a command.
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
    from app import dev_env  # pylint: disable=import-outside-toplevel

    dev_env.load()
    PORT = int(os.getenv('OSC_PORT', '8000'))
    SimpleUDPClient('127.0.0.1', PORT).send_message(ADDRESS + sys.argv[1], 1)
    print(f'Sent {ADDRESS}{sys.argv[1]} to UDP {PORT}')
