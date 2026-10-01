import datetime
import json
import os
import time
from unittest.mock import MagicMock, patch

import pytest

from app import cache, dev_env, main
from app.cache import create_cache
from app.main import HasTapped, Message, PlaylistLabel
from app.mock_media_player import MockMediaPlayer
from app.nightmare_room import NightmareRoom
from app.playback_sync import PlaybackSync


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
    request_url = args[0]
    if '/api/taps/' in request_url:
        with open('tests/data/xos_tap.json', 'r') as the_file:
            return MockResponse(the_file.read(), 201)
    if '/api/bad-uri/' in request_url:
        return MockResponse('{}', 404)

    raise Exception("No mocked sample data for request: "+args[0])


@patch('app.cache.XOS_API_ENDPOINT', 'https://xos.acmi.net.au/api/')
@patch('requests.get', MagicMock(side_effect=mocked_requests_get))
def test_create_cache(capsys, tmp_path):
    """Downloads an XOS Playlist and saves it to cache."""
    with patch('app.cache.CACHE_DIR', str(tmp_path) + '/'):
        with capsys.disabled():
            create_cache()
            with open(f'{tmp_path}/playlist_1.json', 'r') as playlist_cache:
                playlist = json.loads(playlist_cache.read())['playlist_labels']
        assert len(playlist) == 3
        assert playlist[0]['label']['title'] == '<p>Test pattern</p>'


@pytest.mark.usefixtures('database')
def test_process_media():
    """process_media creates a valid Message."""

    with open('tests/data/message.json', 'r') as the_file:
        message_broker_json = json.loads(the_file.read())

    message_broker_json['datetime'] = datetime.datetime.now()
    playlistlabel = PlaylistLabel()
    mock = MagicMock()
    playlistlabel.process_media(message_broker_json, mock)
    saved_message = Message.get(Message.datetime == message_broker_json['datetime'])

    mock.ack.assert_called_once()
    assert message_broker_json['label_id'] == saved_message.label_id


@patch('app.main.XOS_MEDIA_PLAYER_ID', '8')
@patch('app.main.RABBITMQ_MQTT_HOST', 'track.acmi.net.au')
def test_route_playlist_label(client, tmp_path):
    """Root route renders expected data."""
    import json as _json
    (tmp_path / 'playlist_1.json').write_text(_json.dumps(
        {"id": 1, "title": "Test", "playlist_labels": []}))
    with patch('app.main.CACHE_DIR', str(tmp_path) + '/'):
        response = client.get('/')

    assert b'"xos_media_player_id": "8"' in response.data
    assert b'"mqtt_host": "track.acmi.net.au"' in response.data
    assert response.status_code == 200


@patch('app.cache.XOS_API_ENDPOINT', 'https://xos.acmi.net.au/api/')
@patch('requests.get', MagicMock(side_effect=mocked_requests_get))
def test_route_playlist_label_with_no_label(client, tmp_path):
    """Playlist items without labels are excluded."""

    cache.XOS_PLAYLIST_ID = 2
    cache_dir = str(tmp_path) + '/'
    with patch('app.cache.CACHE_DIR', cache_dir), patch('app.main.CACHE_DIR', cache_dir):
        create_cache()
        response = client.get('/')
    response_data = response.data.decode('utf-8')

    assert 'resource' not in response_data
    assert response.status_code == 200


@patch('app.cache.XOS_API_ENDPOINT', 'https://xos.acmi.net.au/api/')
@patch('requests.get', MagicMock(side_effect=mocked_requests_get))
def test_route_playlist_json(client, tmp_path):
    """Playlist JSON route returns expected data."""

    cache.XOS_PLAYLIST_ID = 1
    cache_dir = str(tmp_path) + '/'
    with patch('app.cache.CACHE_DIR', cache_dir), patch('app.main.CACHE_DIR', cache_dir):
        create_cache()
        response = client.get('/api/playlist/')

    assert b'Test pattern' in response.data
    assert response.status_code == 200


@pytest.mark.usefixtures('database')
@patch('app.main.AUTH_TOKEN', 'testtoken')
@patch('app.main.XOS_TAPS_ENDPOINT', 'https://xos.acmi.net.au/api/taps/')
@patch('requests.post', MagicMock(side_effect=mocked_requests_post))
def test_route_collect_item(client):
    """Tap route forwards data to XOS."""

    with open('tests/data/lens_tap.json', 'r') as the_file:
        lens_tap_data = the_file.read()

    response = client.post(
        '/api/taps/',
        data=lens_tap_data,
        headers={'Content-Type': 'application/json'}
    )

    assert response.json["nfc_tag"]["short_code"] == "nbadbb"
    assert response.status_code == 201

    has_tapped = HasTapped.get_or_none(tap_processing=1)
    assert has_tapped.has_tapped == 1
    assert has_tapped.tap_successful == 1


@patch('sentry_sdk.capture_exception', side_effect=MagicMock())
def test_send_error_sends_on_repetition_and_repeat_every(capture_exception):
    """Sends on repetition 5, then every 20 instances."""
    playlist_label = PlaylistLabel()

    for _ in range(4):
        playlist_label.send_error('rmq_conn', None, on_rep=5, every=20, units='instances')
    assert capture_exception.call_count == 0

    playlist_label.send_error('rmq_conn', None, on_rep=5, every=20, units='instances')
    assert capture_exception.call_count == 1

    for _ in range(19):
        playlist_label.send_error('rmq_conn', None, on_rep=5, every=20, units='instances')
    assert capture_exception.call_count == 1

    playlist_label.send_error('rmq_conn', None, on_rep=5, every=20, units='instances')
    assert capture_exception.call_count == 2


@patch('sentry_sdk.capture_exception', side_effect=MagicMock())
def test_send_error_sends_on_repetition_and_repeat_every_1_second(capture_exception):
    """Sends on repetition 5, then every 1 second."""
    playlist_label = PlaylistLabel()

    for _ in range(4):
        playlist_label.send_error('rmq_conn', None, on_rep=5, every=1, units='seconds')
    assert capture_exception.call_count == 0

    playlist_label.send_error('rmq_conn', None, on_rep=5, every=1, units='seconds')
    assert capture_exception.call_count == 1

    for _ in range(10):
        playlist_label.send_error('rmq_conn', None, on_rep=5, every=1, units='seconds')
    assert capture_exception.call_count == 1

    time.sleep(1.5)

    playlist_label.send_error('rmq_conn', None, on_rep=5, every=1, units='seconds')
    assert capture_exception.call_count == 2


@pytest.mark.usefixtures('database')
@patch('app.main.AUTH_TOKEN', 'testtoken')
@patch('app.main.XOS_TAPS_ENDPOINT', 'https://xos.acmi.net.au/api/bad-uri/')
@patch('requests.post', MagicMock(side_effect=mocked_requests_post))
def test_tap_received_xos_error(client):
    """Tap fails correctly on XOS error."""
    with open('tests/data/lens_tap.json', 'r') as the_file:
        lens_tap_data = the_file.read()

    response = client.post(
        '/api/taps/',
        data=lens_tap_data,
        headers={'Content-Type': 'application/json'}
    )

    assert response.status_code == 400

    has_tapped = HasTapped.get_or_none(tap_processing=1)
    assert has_tapped.has_tapped == 1
    assert has_tapped.tap_successful == 0


@pytest.mark.usefixtures('database')
@patch('app.main.AUTH_TOKEN', 'testtoken')
@patch('app.main.XOS_TAPS_ENDPOINT', 'https://xos.acmi.net.au/api/taps/')
@patch('requests.post', MagicMock(side_effect=mocked_requests_post))
def test_tap_received_while_processing_still_creates(client):
    """New taps still created while old tap is processing."""
    has_tapped = HasTapped.get_or_none(tap_processing=0)
    has_tapped.tap_processing = 1
    has_tapped.save()

    with open('tests/data/lens_tap.json', 'r') as the_file:
        lens_tap_data = the_file.read()

    response = client.post(
        '/api/taps/',
        data=lens_tap_data,
        headers={'Content-Type': 'application/json'}
    )

    assert response.status_code == 201


REVERB_TEST_PLAYLIST = {
    "id": 1,
    "title": "Test playlist",
    "playlist_labels": [
        {
            "label": {
                "id": 1,
                "columns": [{"content": "<p>Body text</p>", "style": "standard"}],
                "work": {
                    "id": 1,
                    "title": "Test work",
                    "creator_credit_for_label": "<p>Test Artist, 2023</p>",
                    "headline_credit_for_label": "<p>Courtesy of the artist</p>",
                },
            }
        }
    ],
}


def reverb_client_get(client, tmp_path, extra_patches=None):
    """Write test playlist to cache and GET '/'."""
    import json as _json
    cache_file = tmp_path / 'playlist_1.json'
    cache_file.write_text(_json.dumps(REVERB_TEST_PLAYLIST))
    patches = {'app.main.CACHE_DIR': str(tmp_path) + '/'}
    if extra_patches:
        patches.update(extra_patches)
    with MagicMock():
        ctx_managers = [patch(k, v) for k, v in patches.items()]
        for cm in ctx_managers:
            cm.start()
        try:
            response = client.get('/')
        finally:
            for cm in ctx_managers:
                cm.stop()
    return response


@patch('app.main.LABEL_TEMPLATE', 'reverb-digital-label.html')
def test_reverb_label_content_mapping(client, tmp_path):
    """Credits are rendered in the reverb template."""
    response = reverb_client_get(client, tmp_path)
    data = response.data.decode('utf-8')

    assert response.status_code == 200
    assert 'Test Artist, 2023' in data          # creator_credit_for_label, tags stripped
    assert 'Courtesy of the artist' in data     # headline_credit_for_label
    assert 'Test playlist' in data              # playlist title


@patch('app.main.LABEL_TEMPLATE', 'reverb-digital-label.html')
@patch('app.main.HIDE_TIMER', True)
def test_reverb_label_hide_timer(client, tmp_path):
    """HIDE_TIMER hides the timer."""
    response = reverb_client_get(client, tmp_path)
    data = response.data.decode('utf-8')

    assert response.status_code == 200
    assert 'visibility:hidden' in data
    assert 'data-ignore-media-player' in data


@patch('app.main.LABEL_TEMPLATE', 'reverb-digital-label.html')
@patch('app.main.OVERRIDE_TITLE', 'My Override Title')
def test_reverb_label_override_title(client, tmp_path):
    """OVERRIDE_TITLE replaces the playlist title."""
    response = reverb_client_get(client, tmp_path)
    data = response.data.decode('utf-8')

    assert response.status_code == 200
    assert 'My Override Title' in data
    assert 'data-override-title="My Override Title"' in data
    assert 'Test work' in data                  # work title prepended to credit-line


@patch('app.main.LABEL_TEMPLATE', 'reverb-digital-label.html')
@patch('app.main.OVERRIDE_DURATION', '21600000')
def test_reverb_label_override_duration(client, tmp_path):
    """OVERRIDE_DURATION sets the data attribute."""
    response = reverb_client_get(client, tmp_path)
    data = response.data.decode('utf-8')

    assert response.status_code == 200
    assert 'data-override-duration="21600000"' in data
    assert 'data-ignore-media-player' not in data


@patch('app.main.LABEL_TEMPLATE', 'reverb-digital-label.html')
@patch('app.main.show_qr_code', True)
@patch('app.main.QR_CODE_URL', 'https://example.com/work/123/')
def test_reverb_label_qr_url(client, tmp_path):
    """QR URL generates a QR code."""
    response = reverb_client_get(client, tmp_path)
    data = response.data.decode('utf-8')

    assert response.status_code == 200
    assert 'qr-block' in data
    assert 'data-qr-svg' in data


def make_sync():
    return PlaybackSync(host='x', port=1883, user='u', password='p', topic='t')


def test_playback_sync_wait_returns_body_after_receive():
    """receive() then wait() returns the parsed body."""
    sync = make_sync()
    sync.receive(b'{"duration": 100, "playback_position": 42}')
    body = sync.wait(last_body=None, timeout=1)
    assert body['duration'] == 100
    assert body['playback_position'] == 42


def test_playback_sync_wait_returns_none_on_timeout():
    """wait() returns None on timeout."""
    sync = make_sync()
    body = sync.wait(last_body=None, timeout=0.05)
    assert body is None


def test_playback_sync_wait_skips_already_seen_body():
    """wait() returns None when body hasn't changed."""
    sync = make_sync()
    sync.receive(b'{"duration": 100, "playback_position": 0}')
    first = sync.wait(last_body=None, timeout=1)
    assert first is not None
    second = sync.wait(last_body=first, timeout=0.05)
    assert second is None


def test_playback_sync_wait_returns_new_body_after_update():
    """New receive() unblocks wait() with updated body."""
    sync = make_sync()
    sync.receive(b'{"duration": 100, "playback_position": 0}')
    first = sync.wait(last_body=None, timeout=1)
    sync.receive(b'{"duration": 100, "playback_position": 10}')
    second = sync.wait(last_body=first, timeout=1)
    assert second['playback_position'] == 10


def test_playback_sync_receive_ignores_invalid_json():
    """Bad JSON doesn't raise."""
    sync = make_sync()
    sync.receive(b'not json')
    assert sync.wait(last_body=None, timeout=0.05) is None


def test_playback_sync_client_context_tracks_ip():
    """client() tracks IP on enter, removes on exit."""
    sync = make_sync()
    with sync.client('1.2.3.4'):
        assert '1.2.3.4' in sync._clients
    assert '1.2.3.4' not in sync._clients


def test_mock_media_player_plays_each_item_for_its_seconds():
    """The mock plays each item for its seconds, in order, then loops."""
    player = MockMediaPlayer(sync=None, playlist_path=None, seconds=60)

    message = player.message_at([11, 22, 33], 125)
    assert message['label_id'] == 33
    assert message['duration'] == 60000
    assert message['playback_position'] == pytest.approx(5 / 60)

    assert player.message_at([11, 22, 33], 0)['label_id'] == 11
    assert player.message_at([11, 22, 33], 185)['label_id'] == 11
    assert player.message_at([], 10) is None


def test_mock_media_player_plays_only_labelled_items(tmp_path):
    """The mock skips items without a label, and plays nothing with no playlist."""
    playlist_path = tmp_path / 'playlist_1.json'
    playlist_path.write_text(json.dumps({'playlist_labels': [
        {'label': {'id': 44}},
        {'label': None},
        {'label': {'id': 45}},
    ]}))

    assert MockMediaPlayer(None, str(playlist_path)).label_ids() == [44, 45]
    assert MockMediaPlayer(None, str(tmp_path / 'missing.json')).label_ids() == []


def test_mock_media_player_feeds_playback_sync():
    """What the mock publishes arrives at the playback stream as MQTT would."""
    sync = make_sync()
    player = MockMediaPlayer(sync, playlist_path=None, seconds=60)
    sync.receive(json.dumps(player.message_at([11, 22], 90)).encode())

    body = sync.wait(last_body=None, timeout=1)
    assert body['label_id'] == 22
    assert body['playback_position'] == pytest.approx(0.5)


@patch('app.main.LABEL_TEMPLATE', 'lifelike.html')
@patch('app.main.XOS_MEDIA_PLAYER_ID', None)
@patch('app.main.MOCK_MEDIA_PLAYER', True)
@patch('app.main.MOCK_VIDEO_SECONDS', 60)
def test_lifelike_label_with_mock_media_player(client, tmp_path):
    """A mocked player connects the label, and every video runs its seconds."""
    with open('tests/data/playlist.json', 'r') as the_file:
        (tmp_path / 'playlist_1.json').write_text(the_file.read())
    with patch('app.main.CACHE_DIR', str(tmp_path) + '/'):
        response = client.get('/')
    data = response.data.decode('utf-8')

    assert response.status_code == 200
    assert 'playback-source="/api/playback-stream/"' in data
    assert '"duration_secs": 60.058' not in data
    assert '"duration_secs": 110.052' not in data


@patch('app.main.LABEL_TEMPLATE', 'lifelike.html')
@patch('app.main.LABEL_FG_COLOUR', '#000')
@patch('app.main.LABEL_BG_COLOUR', 'oklch(90% 0.05 90)')
def test_lifelike_label_colours(client, tmp_path):
    """LABEL_FG_COLOUR and LABEL_BG_COLOUR set the label's colour tokens."""
    (tmp_path / 'playlist_1.json').write_text(json.dumps(
        {"id": 1, "title": "Test", "playlist_labels": []}))
    with patch('app.main.CACHE_DIR', str(tmp_path) + '/'):
        response = client.get('/')
    data = response.data.decode('utf-8')

    assert '--acmi-fg: #000;' in data
    assert '--acmi-bg: oklch(90% 0.05 90);' in data


def test_css_colour_refuses_what_could_escape_the_value(monkeypatch):
    """A colour is passed through; anything that could end the value is not."""
    monkeypatch.setenv('TEST_COLOUR', ' rgb(0 0 0 / 50%) ')
    assert main.css_colour('TEST_COLOUR') == 'rgb(0 0 0 / 50%)'

    monkeypatch.setenv('TEST_COLOUR', 'red; display: none')
    assert main.css_colour('TEST_COLOUR') == ''

    monkeypatch.delenv('TEST_COLOUR')
    assert main.css_colour('TEST_COLOUR') == ''


def test_dev_env_load_follows_the_file(monkeypatch, tmp_path):
    """load() copies the file in, and drops a key taken out of it."""
    monkeypatch.setenv('DEV_ENV_TEST_KEPT', 'old')
    monkeypatch.setenv('DEV_ENV_TEST_DROPPED', 'old')
    monkeypatch.delenv(dev_env.LOADED_KEYS, raising=False)
    config = tmp_path / 'config.env'
    monkeypatch.setenv('CONFIG_ENV_FILE', str(config))

    config.write_text('DEV_ENV_TEST_KEPT=first\nDEV_ENV_TEST_DROPPED=first\n')
    dev_env.load()
    assert os.environ['DEV_ENV_TEST_KEPT'] == 'first'
    assert os.environ['DEV_ENV_TEST_DROPPED'] == 'first'

    config.write_text('DEV_ENV_TEST_KEPT="second"\n# DEV_ENV_TEST_DROPPED=first\n')
    dev_env.load()
    assert os.environ['DEV_ENV_TEST_KEPT'] == 'second'
    assert 'DEV_ENV_TEST_DROPPED' not in os.environ


def test_dev_env_load_does_nothing_without_a_file(monkeypatch):
    """Without CONFIG_ENV_FILE — on a device — load() reads nothing."""
    monkeypatch.delenv('CONFIG_ENV_FILE', raising=False)
    monkeypatch.delenv(dev_env.LOADED_KEYS, raising=False)
    dev_env.load()
    assert dev_env.LOADED_KEYS not in os.environ


class FakeClock:
    """A clock the test moves by hand."""

    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now


def test_nightmare_room_starts_waiting_and_follows_commands():
    """The room waits, then takes the mode each command sets."""
    room = NightmareRoom(run_seconds=600, clock=FakeClock())
    assert room.snapshot() == {'mode': 'waiting'}

    for command, mode in [('unavailable', 'unavailable'), ('close', 'closed'), ('wait', 'waiting')]:
        assert room.command(command)
        assert room.snapshot() == {'mode': mode}

    assert not room.command('dance')
    assert room.snapshot() == {'mode': 'waiting'}


def test_nightmare_room_runs_then_waits():
    """A run counts from start, starts over when sent again, and ends in waiting."""
    clock = FakeClock()
    room = NightmareRoom(run_seconds=600, clock=clock)

    room.command('start')
    clock.now += 150
    assert room.snapshot() == {'mode': 'running', 'duration': 600000, 'playback_position': 0.25}

    room.command('start')
    clock.now += 60
    assert room.snapshot()['playback_position'] == pytest.approx(0.1)

    clock.now += 540
    assert room.snapshot() == {'mode': 'waiting'}


def test_nightmare_room_acts_on_a_press_not_a_release():
    """A TouchOSC button sends 1 on press and 0 on release: only the press counts."""
    room = NightmareRoom(run_seconds=600, clock=FakeClock())

    room._on_command('/nightmare/close', 0.0)
    assert room.snapshot() == {'mode': 'waiting'}

    room._on_command('/nightmare/close', 1.0)
    assert room.snapshot() == {'mode': 'closed'}

    room._on_command('/nightmare/unavailable')
    assert room.snapshot() == {'mode': 'unavailable'}


@patch('app.main.LABEL_TEMPLATE', 'lifelike.html')
@patch('app.main.LABEL_MODE', 'nightmare-room')
@patch('app.main.XOS_MEDIA_PLAYER_ID', '8')
@patch('app.main.NIGHTMARE_TEXT', {'waiting': 'In a moment.', 'running': '', 'unavailable': '', 'closed': ''})
def test_lifelike_nightmare_room_follows_the_room(client, tmp_path):
    """The nightmare room reads the room stream, not the player's, and gets its words."""
    (tmp_path / 'playlist_1.json').write_text(json.dumps(
        {"id": 1, "title": "Test", "playlist_labels": []}))
    with patch('app.main.CACHE_DIR', str(tmp_path) + '/'):
        response = client.get('/')
    data = response.data.decode('utf-8')

    assert 'room-source="/api/room-stream/"' in data
    assert 'playback-source' not in data
    assert '"nightmare_text": {"waiting": "In a moment."}' in data


def test_room_stream_is_missing_when_the_label_is_no_room(client):
    """Only a nightmare room has a room stream."""
    with patch('app.main.room', None):
        response = client.get('/api/room-stream/')
    assert response.status_code == 404
