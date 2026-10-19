import glob
import json
import os

import requests
import sentry_sdk

from app import dev_env

dev_env.load()

XOS_API_ENDPOINT = os.getenv('XOS_API_ENDPOINT')
XOS_PLAYLIST_ID = os.getenv('XOS_PLAYLIST_ID', '1')
SENTRY_ID = os.getenv('SENTRY_ID')
CACHE_DIR = os.getenv('CACHE_DIR', '/data/')
CACHED_PLAYLIST_JSON = f'playlist_{XOS_PLAYLIST_ID}.json'

sentry_sdk.init(dsn=SENTRY_ID)


def create_cache():
    """
    Fetches a Playlist from XOS and saves it to the CACHE_DIR.

    An XOS error, a timeout or a reply that is not a playlist keeps the cached one.
    """
    try:
        response = requests.get(
            f'{XOS_API_ENDPOINT}playlists/{XOS_PLAYLIST_ID}/',
            timeout=5,
        )
        response.raise_for_status()
        playlist_label_json = response.json()
        if not isinstance(playlist_label_json, dict) or \
                not isinstance(playlist_label_json.get('playlist_labels'), list):
            raise ValueError(f'not a playlist: {str(playlist_label_json)[:200]}')
    except (requests.exceptions.RequestException, ValueError) as exception:
        sentry_sdk.capture_exception(exception)
        print(f'Error downloading playlist JSON from XOS: {exception}')
        return

    # Written whole, then moved into place, so the label never reads half a
    # file, even if the power goes mid-write.
    cache_path = f'{CACHE_DIR}{CACHED_PLAYLIST_JSON}'
    with open(f'{cache_path}.tmp', 'w', encoding='utf-8') as outfile:
        json.dump(playlist_label_json, outfile)
    os.replace(f'{cache_path}.tmp', cache_path)

    # Playlists cached under an earlier XOS_PLAYLIST_ID.
    for old_file in glob.glob(f'{CACHE_DIR}playlist_*.json'):
        if old_file != cache_path:
            os.remove(old_file)


if __name__ == '__main__':
    create_cache()
