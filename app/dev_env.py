"""
Development only: the label reads its settings from `config.env` itself.

Docker reads an `env_file` only when it creates the container. Instead, the
development compose file names the file in `CONFIG_ENV_FILE`, each process
reads it at start-up, and Flask's reloader restarts the server when it is saved.

Balena never sets `CONFIG_ENV_FILE`, so a device needs no python-dotenv.
"""
import os

# The keys the file set last time. Each reloaded server inherits the watcher's
# environment, so a key since taken out of the file must be taken out here too.
LOADED_KEYS = 'CONFIG_ENV_LOADED_KEYS'


def load():
    """Copies the settings in `CONFIG_ENV_FILE` into the environment."""
    path = os.getenv('CONFIG_ENV_FILE')
    if not path:
        return

    from dotenv import dotenv_values  # pylint: disable=import-outside-toplevel

    values = {
        key: value for key, value in dotenv_values(path).items() if value is not None
    }
    for key in os.getenv(LOADED_KEYS, '').split(','):
        if key and key not in values:
            os.environ.pop(key, None)
    os.environ.update(values)
    os.environ[LOADED_KEYS] = ','.join(values)
