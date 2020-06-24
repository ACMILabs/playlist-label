import json.decoder
import os

import requests
import sentry_sdk

XOS_API_ENDPOINT = os.getenv('XOS_API_ENDPOINT')
XOS_PLAYLIST_ID = os.getenv('XOS_PLAYLIST_ID', '1')
SENTRY_ID = os.getenv('SENTRY_ID')
CACHE_DIR = os.getenv('CACHE_DIR', '/data/')
CACHED_PLAYLIST_JSON = f'playlist_{XOS_PLAYLIST_ID}.json'

sentry_sdk.init(dsn=SENTRY_ID)


def create_cache():
    """
    Fetches a Playlist from XOS and saves it to the CACHE_DIR.
    """
    try:
        playlist_label_json = requests.get(
            f'{XOS_API_ENDPOINT}playlists/{XOS_PLAYLIST_ID}/',
            timeout=5,
        ).json()

        if CACHE_DIR:
            for old_file in os.listdir(CACHE_DIR):
                os.remove(CACHE_DIR + old_file)

        with open(f'{CACHE_DIR}{CACHED_PLAYLIST_JSON}', 'w') as outfile:
            json.dump(playlist_label_json, outfile)

    except (requests.exceptions.HTTPError, requests.exceptions.ConnectionError) as exception:
        sentry_sdk.capture_exception(exception)
        print(f'Error downloading playlist JSON from XOS: {exception}')


if __name__ == '__main__':
    create_cache()
