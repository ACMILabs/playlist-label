import datetime
import json
from unittest.mock import MagicMock, patch

import pytest

from app import main
from app.main import Message, PlaylistLabel


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
        with open('tests/data/playlist.json', 'r') as the_file:
            return MockResponse(the_file.read(), 200)
    if args[0] == 'https://xos.acmi.net.au/api/playlists/2/':
        with open('tests/data/playlist_no_label.json', 'r') as the_file:
            return MockResponse(the_file.read(), 200)

    raise Exception("No mocked sample data for request: "+args[0])


def mocked_requests_post(*args, **kwargs):
    if args[0] == 'https://xos.acmi.net.au/api/taps/':
        with open('tests/data/xos_tap.json', 'r') as the_file:
            return MockResponse(the_file.read(), 201)

    raise Exception("No mocked sample data for request: "+args[0])


@pytest.mark.usefixtures('database')
def test_message():
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


@patch('requests.get', MagicMock(side_effect=mocked_requests_get))
def test_download_playlist_label():
    """
    Test that downloading the playlist from XOS
    successfully saves it to the filesystem.
    """

    playlistlabel = PlaylistLabel()
    playlistlabel.download_playlist_label()

    with open('playlist_1.json', 'r') as the_file:
        playlist = json.loads(the_file.read())['playlist_labels']

    assert len(playlist) == 3
    assert playlist[0]['label']['title'] == 'Dracula'


@pytest.mark.usefixtures('database')
def test_process_media():
    """
    Test the process_media function creates a valid Message.
    """

    with open('tests/data/message.json', 'r') as the_file:
        message_broker_json = json.loads(the_file.read())

    message_broker_json['datetime'] = datetime.datetime.now()
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


@patch('requests.get', MagicMock(side_effect=mocked_requests_get))
def test_route_playlist_label_with_no_label(client):
    """
    Test that the playlist route returns the expected data
    when a playlist item doesn't have a label.
    """

    main.XOS_PLAYLIST_ID = 2
    playlistlabel = PlaylistLabel()
    playlistlabel.download_playlist_label()
    response = client.get('/')
    response_data = response.data.decode('utf-8')

    assert 'resource' not in response_data
    assert response.status_code == 200


@patch('requests.get', MagicMock(side_effect=mocked_requests_get))
def test_route_playlist_json(client):
    """
    Test that the playlist route returns the expected data.
    """

    main.XOS_PLAYLIST_ID = 1
    playlistlabel = PlaylistLabel()
    playlistlabel.download_playlist_label()
    response = client.get('/api/playlist/')

    assert b'Dracula' in response.data
    assert response.status_code == 200


@patch('requests.post', MagicMock(side_effect=mocked_requests_post))
def test_route_collect_item(client):
    """
    Test that the collect a tap route forwards the expected data to XOS.
    """

    with open('tests/data/lens_tap.json', 'r') as the_file:
        lens_tap_data = the_file.read()

    response = client.post(
        '/api/taps/',
        data=lens_tap_data,
        headers={'Content-Type': 'application/json'}
    )

    assert response.json["nfc_tag"]["short_code"] == "nbadbb"
    assert response.status_code == 201
