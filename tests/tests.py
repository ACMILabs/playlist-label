import datetime
import json
from unittest.mock import MagicMock, patch

import pytest
from peewee import SqliteDatabase

from app import main
from app.main import Message, PlaylistLabel


@pytest.fixture
def database():
    """
    Setup the test database.
    """
    test_db = SqliteDatabase(':memory:')
    test_db.bind([Message], bind_refs=False, bind_backrefs=False)
    test_db.connect()
    test_db.create_tables([Message])

class MockResponse:
    def __init__(self, json_data, status_code):
        self.content = json.loads(json_data)
        self.status_code = status_code

    def json(self):
        return self.content

    def raise_for_status(self):
        return None


def mocked_requests_get(*args, **kwargs):
    if args[0] == 'https://xos.acmi.net.au/api/playlists/1/':
        with open('tests/data/playlist.json', 'r') as f:
            return MockResponse(f.read(), 200)

    raise Exception("No mocked sample data for request: "+args[0])


def mocked_requests_post(*args, **kwargs):
    if args[0] == 'https://xos.acmi.net.au/api/taps/':
        with open('tests/data/xos_tap.json', 'r') as f:
            return MockResponse(f.read(), 201)

    raise Exception("No mocked sample data for request: "+args[0])


def test_message(database):
    """
    Test the Message class initialises.
    """

    timestamp = datetime.datetime.now().timestamp()

    message = Message.create(
        datetime=timestamp,
        playlist_id=1,
        media_player_id=1,
        label_id=1,
        playback_position=0,
        audio_buffer=0,
        video_buffer=0,
    )
    assert message
    assert message.datetime is timestamp


@patch('requests.get', side_effect=mocked_requests_get)
def test_download_playlist_label(mocked_requests_get):
    """
    Test that downloading the playlist from XOS
    successfully saves it to the filesystem.
    """

    playlistlabel = PlaylistLabel()
    playlistlabel.download_playlist_label()

    with open('playlist_1.json', 'r') as f:
        playlist = json.loads(f.read())['playlist_labels']

    assert len(playlist) == 3
    assert playlist[0]['label']['title'] == 'Dracula'


def test_process_media(database):
    """
    Test the process_media function creates a valid Message.
    """

    DATETIME_OF_MESSAGE = datetime.datetime.now()

    with open('tests/data/message.json', 'r') as f:
        message_broker_json = json.loads(f.read())

    message_broker_json['datetime'] = DATETIME_OF_MESSAGE
    playlistlabel = PlaylistLabel()
    mock = MagicMock()
    playlistlabel.process_media(message_broker_json, mock)
    saved_message = Message.get(Message.datetime == message_broker_json['datetime'])

    mock.ack.assert_called_once()
    assert message_broker_json['label_id'] == saved_message.label_id


def test_route_playlist_label(client):
    """
    Test that the root route renders the expected data.
    """

    response = client.get('/')

    assert b'"xos_media_player_id": "%s"' % main.XOS_MEDIA_PLAYER_ID.encode() in response.data
    assert b'"mqtt_host": "track.acmi.net.au"' in response.data
    assert response.status_code == 200


def test_route_playlist_json(client):
    """
    Test that the playlist route returns the expected data.
    """

    response = client.get('/api/playlist/')

    assert b'Dracula' in response.data
    assert response.status_code == 200


@patch('requests.post', side_effect=mocked_requests_post)
def test_route_collect_item(mocked_requests_post, client):
    """
    Test that the collect a tap route forwards the expected data to XOS.
    """

    with open('tests/data/lens_tap.json', 'r') as f:
        lens_tap_data = f.read()

    response = client.post('/api/taps/', data=lens_tap_data, headers={'Content-Type': 'application/json'})

    assert response.json["nfc_tag"]["short_code"] == "nbadbb"
    assert response.status_code == 201
