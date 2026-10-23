"""
Commands over OSC, from TouchOSC or anything else that sends it, for a label
that takes commands. See `app/nightmare_room.py` for one.
"""
import threading

from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import ThreadingOSCUDPServer
from pythonosc.udp_client import SimpleUDPClient

DEFAULT_PORT = 9000


def on_press(prefix, commands):
    """
    A handler for messages to `prefix` + a name in `commands`, which calls that
    name's function. A TouchOSC button sends 1 on press and 0 on release; only
    the press counts.
    """
    def handle(address, *args):
        if args and not args[0]:
            return
        commands[address[len(prefix):]]()
        print(f'[osc] {address}')
    return handle


def listen(port, prefix, commands):
    """Hears `prefix` + each name in `commands` on UDP `port`, in a thread of its own."""
    dispatcher = Dispatcher()
    handle = on_press(prefix, commands)
    for name in commands:
        dispatcher.map(prefix + name, handle)

    def on_other(address, *_):
        # TouchOSC sends its other controls too: only mention ours.
        if address.startswith(prefix):
            print(f'[osc] {address}: no such command')

    dispatcher.set_default_handler(on_other)
    server = ThreadingOSCUDPServer(('0.0.0.0', port), dispatcher)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f'[osc] Listening for {prefix}* on UDP {port}')
    return server


def send(port, address, value=1):
    """Sends `value` to `address` on this machine's UDP `port`, as a button press does."""
    SimpleUDPClient('127.0.0.1', port).send_message(address, value)
