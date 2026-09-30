"""
Development only: the label reads its settings from `config.env` itself.

Docker reads an `env_file` once, when it creates the container, so an edit
means recreating it. Instead, the development compose file names the file in
`CONFIG_ENV_FILE`, every process reads it when it starts, and Flask's reloader
watches it: save the file and the server restarts with what it now says.

Nothing sets `CONFIG_ENV_FILE` on balena, so a device never reads a file, and
never needs python-dotenv installed.
"""
import os

# The keys the file set last time. The reloader starts each new server with
# the environment of the process that watches the file, which still has every
# key it read at first; a line since taken out of the file has to be taken
# out of the environment too.
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
