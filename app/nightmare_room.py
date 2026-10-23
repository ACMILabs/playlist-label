"""The nightmare room, which TouchOSC controls over OSC: see `app/osc.py`."""
import functools
import os
import sys
import threading
import time

from app import osc

DEFAULT_OSC_ADDRESS_PREFIX = '/nightmare/'

# Each command, after the address prefix, and the mode it puts the room in:
# - waiting: between runs, with no timer. The room starts here, and a run ends here.
# - running: a run of NIGHTMARE_RUN_MINUTES. `start` during a run starts it over.
# - unavailable: off for now, not broken.
# - closed: no more runs today.
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
        """
        The mode, and while a run is on, its length and how far through, in the
        shape of the media player's playback events, so the label times a run
        as it times a video.
        """
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

    def listen(self, port, prefix=DEFAULT_OSC_ADDRESS_PREFIX):
        """Hears the room's commands over OSC on UDP `port`, in a thread of its own."""
        return osc.listen(port, prefix, {
            name: functools.partial(self.command, name) for name in COMMANDS
        })


# Sends a command without TouchOSC, from the machine the label runs on:
#
#     python -m app.nightmare_room start
if __name__ == '__main__':
    from app import dev_env

    dev_env.load()
    PORT = int(os.getenv('OSC_PORT', str(osc.DEFAULT_PORT)))
    ADDRESS = os.getenv('OSC_ADDRESS_PREFIX', DEFAULT_OSC_ADDRESS_PREFIX) + sys.argv[1]
    osc.send(PORT, ADDRESS)
    print(f'Sent {ADDRESS} to UDP {PORT}')
