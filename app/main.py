import datetime
import json
import os
import re
import socket
import time
from threading import Thread

import kombu
import requests
import sentry_sdk
from flask import Flask, Response, jsonify, redirect, render_template, request
from kombu import Connection, Exchange, Queue
from peewee import (CharField, FloatField, IntegerField, Model,
                    OperationalError, SqliteDatabase)
from playhouse.shortcuts import model_to_dict
from segno import make_qr
from sentry_sdk.integrations.flask import FlaskIntegration

from app import dev_env
from app.errors import HTTPError
from app.mock_media_player import MockMediaPlayer
from app.nightmare_room import NightmareRoom
from app.playback_sync import PlaybackSync

# Development only: read config.env here, not in docker. See `app/dev_env.py`.
dev_env.load()
CONFIG_ENV_FILE = os.getenv('CONFIG_ENV_FILE')

XOS_API_ENDPOINT = os.getenv('XOS_API_ENDPOINT')
XOS_TAPS_ENDPOINT = os.getenv('XOS_TAPS_ENDPOINT', f'{XOS_API_ENDPOINT}taps/')
AUTH_TOKEN = os.getenv('AUTH_TOKEN')
XOS_PLAYLIST_ID = os.getenv('XOS_PLAYLIST_ID', '1')
XOS_MEDIA_PLAYER_ID = os.getenv('XOS_MEDIA_PLAYER_ID', None)
PLAYLIST_LABEL_PORT = 8081
RABBITMQ_MQTT_HOST = os.getenv('RABBITMQ_MQTT_HOST')
RABBITMQ_MQTT_PORT = os.getenv('RABBITMQ_MQTT_PORT')
RABBITMQ_MEDIA_PLAYER_USER = os.getenv('RABBITMQ_MEDIA_PLAYER_USER')
RABBITMQ_MEDIA_PLAYER_PASS = os.getenv('RABBITMQ_MEDIA_PLAYER_PASS')
AMQP_PORT = os.getenv('AMQP_PORT')
RABBITMQ_RETRY_SECONDS = int(os.getenv('RABBITMQ_RETRY_SECONDS', '2'))
SENTRY_ID = os.getenv('SENTRY_ID')
PROGRAMMING_MESSAGE = os.getenv('PROGRAMMING_MESSAGE', None)
BALENA_APP_ID = os.getenv('BALENA_APP_ID')
BALENA_SERVICE_NAME = os.getenv('BALENA_SERVICE_NAME')
BALENA_SUPERVISOR_ADDRESS = os.getenv('BALENA_SUPERVISOR_ADDRESS')
BALENA_SUPERVISOR_API_KEY = os.getenv('BALENA_SUPERVISOR_API_KEY')
DEBUG = os.getenv('DEBUG', 'false').lower() == "true"
HIDE_TIMER = os.getenv('HIDE_TIMER', 'false').lower() == 'true'
HIDE_CAPTION = os.getenv('HIDE_CAPTION', 'false').lower() == 'true'
OFFSET_TOP_MARGIN = os.getenv('OFFSET_TOP_MARGIN', '0')
# milliseconds; initialises timer before MQTT arrives
OVERRIDE_DURATION = os.getenv('OVERRIDE_DURATION', '')
OVERRIDE_TITLE = os.getenv('OVERRIDE_TITLE', '')
QR_URL_OVERRIDE = os.getenv('QR_URL_OVERRIDE', '')
# The nightmare room's run length, header text per mode (unset keeps the
# label's own wording) and TouchOSC's UDP port. See `app/nightmare_room.py`.
NIGHTMARE_RUN_MINUTES = float(os.getenv('NIGHTMARE_RUN_MINUTES', '10'))
NIGHTMARE_TEXT = {
    mode: os.getenv(f'NIGHTMARE_{mode.upper()}_TEXT', '')
    for mode in ('waiting', 'running', 'unavailable', 'closed')
}
OSC_PORT = int(os.getenv('OSC_PORT', '8000'))
# A stand-in media player, for testing without one. See `app/mock_media_player.py`.
MOCK_MEDIA_PLAYER = os.getenv('MOCK_MEDIA_PLAYER', 'false').lower() == 'true'
MOCK_VIDEO_SECONDS = int(os.getenv('MOCK_VIDEO_SECONDS', '60'))


def css_colour(name):
    """
    A CSS colour from the environment for the lifelike label, or '' for its own.

    Only rejects characters that could escape the CSS value. An invalid colour
    falls back in the browser (see `@property` in `app/static/lifelike/tokens.css`).
    """
    value = os.getenv(name, '').strip()
    if value and not re.fullmatch(r'[#\w\s(),.%/+-]+', value):
        print(f'[config] {name}={value!r} is not a colour, ignoring it')
        return ''
    return value


LABEL_FG_COLOUR = css_colour('LABEL_FG_COLOUR')
LABEL_BG_COLOUR = css_colour('LABEL_BG_COLOUR')

# Rotates the lifelike label in the page itself (`left`, `right` or
# `inverted`), for use with the browser's ROTATE_DISPLAY=normal: on a Pi 5 at
# 4K, X rotating the screen halves the frame rate of any animation.
LABEL_ROTATE = os.getenv('LABEL_ROTATE', 'normal').strip().lower()
if LABEL_ROTATE not in ('normal', 'left', 'right', 'inverted'):
    print(f'[config] LABEL_ROTATE={LABEL_ROTATE!r} is not a rotation, ignoring it')
    LABEL_ROTATE = 'normal'
LISTENING_ROOM_QR_CODE = "https://risingmelbourne.fillout.com/t/4qKipy8T3rus"
CACHE_DIR = os.getenv('CACHE_DIR', '/data/')

LABEL_TEMPLATE = os.getenv('LABEL_TEMPLATE', 'playlist.html')
COLLECT_POSITION = os.getenv('COLLECT_POSITION', None)
LABEL_MODE = os.getenv('LABEL_MODE', 'normal')
LISTENING_ROOM_MODE_OVERRIDE = os.getenv('LISTENING_ROOM_MODE_OVERRIDE', None)
LISTENING_ROOM_TIME_OVERRIDE = os.getenv('LISTENING_ROOM_TIME_OVERRIDE', None)
LISTENING_ROOM_CUSTOM_EVENT_START_TIME = os.getenv('LISTENING_ROOM_CUSTOM_EVENT_START_TIME')
LISTENING_ROOM_PARENT_ID = os.getenv('LISTENING_ROOM_PARENT_ID', None)
LISTENING_ROOM_EVENTS_API = os.getenv(
    'LISTENING_ROOM_EVENTS_API',
    'https://admin.acmi.net.au/api/v2/events/',
)
sentry_sdk.init(
    dsn=SENTRY_ID,
    integrations=[FlaskIntegration()]
)
AMQP_URL = f'amqp://{RABBITMQ_MEDIA_PLAYER_USER}:{RABBITMQ_MEDIA_PLAYER_PASS}'\
           f'@{RABBITMQ_MQTT_HOST}:{AMQP_PORT}//'
QUEUE_NAME = f'mqtt-subscription-playback_{XOS_MEDIA_PLAYER_ID}'
ROUTING_KEY = f'mediaplayer.{XOS_MEDIA_PLAYER_ID}'

MEDIA_PLAYER_EXCHANGE = Exchange('amq.topic', 'direct', durable=True)
PLAYBACK_QUEUE = Queue(QUEUE_NAME, exchange=MEDIA_PLAYER_EXCHANGE, routing_key=ROUTING_KEY)

MQTT_TOPIC: str | None = None
if XOS_MEDIA_PLAYER_ID:
    MQTT_TOPIC = f'mediaplayer.{XOS_MEDIA_PLAYER_ID}'
    print(
        f'[config] MQTT: {RABBITMQ_MQTT_HOST}:{RABBITMQ_MQTT_PORT} '
        f'user={RABBITMQ_MEDIA_PLAYER_USER}')
    print(f'[config] Topic: {MQTT_TOPIC}')
show_qr_code = QR_URL_OVERRIDE != '' or XOS_MEDIA_PLAYER_ID is not None or XOS_PLAYLIST_ID != '1'
PLAYLIST_QR_CODES = {
    lang_code: (
        f'https://www.acmi.net.au{"" if lang_code == "en" else f"/{lang_code}"}'
        f'/access-guide/?scannedplaylist={XOS_PLAYLIST_ID}'
    )
    for lang_code in ["en", "zh-hans", "hi", "pa"]
}

app = Flask(__name__)  # pylint: disable=C0103
CACHED_PLAYLIST_JSON = f'playlist_{XOS_PLAYLIST_ID}.json'
db = SqliteDatabase('message.db')  # pylint: disable=C0103


class Message(Model):  # pylint: disable=R0903
    datetime = CharField(primary_key=True)
    label_id = IntegerField()
    playlist_id = IntegerField()
    media_player_id = IntegerField()
    duration = IntegerField(default=0)
    playback_position = FloatField()
    audio_buffer = FloatField(null=True)
    video_buffer = FloatField(null=True)

    class Meta:  # pylint: disable=R0903
        database = db


class PlaylistLabel():
    """Playlist label: downloads labels from XOS and forwards lens taps."""

    def __init__(self):
        self.playlist = None
        self.errors_history = {}

    @staticmethod
    def process_media(body, message):
        """Store the message received from RabbitMQ."""
        try:
            message.ack()

            Message.create(
                datetime=body['datetime'],
                playlist_id=body.get('playlist_id', 0),
                media_player_id=body.get('media_player_id', 0),
                label_id=body.get('label_id', 0),
                playback_position=body.get('playback_position', 0),
                audio_buffer=body.get('audio_buffer', 0),
                video_buffer=body.get('video_buffer', 0),
            )
            # pylint misreads peewee 4.5's `delete` descriptor as needing an instance.
            delete_records = Message.delete().where(  # pylint: disable=no-value-for-parameter
                Message.datetime.not_in(
                    Message.select(Message.datetime).order_by(Message.datetime.desc()).limit(5)
                )
            )
            delete_records.execute()

        except TimeoutError as exception:
            template = 'An exception of type {0} occurred. Arguments:\n{1!r}'
            message = template.format(type(exception).__name__, exception.args)
            print(message)
            sentry_sdk.capture_exception(exception)

    def consume(self, conn):
        """Consume from the RabbitMQ queue."""
        connection_errors = conn.connection_errors + (kombu.exceptions.OperationalError,)
        try:
            conn.ensure_connection(max_retries=3)
            with conn.Consumer(PLAYBACK_QUEUE, callbacks=[self.process_media]):
                while True:
                    try:
                        conn.drain_events(timeout=2)
                        resolved_timeout = self.clear_error_history('media_player_timeout')
                        if resolved_timeout:
                            print(f'Automatically resolved: {resolved_timeout}. '
                                  'Now receiving messages.')
                        resolved_conn = self.clear_error_history('rabbitmq_conn_error')
                        if resolved_conn:
                            print(f'Automatically resolved: {resolved_conn}. '
                                  'Connection reestablished.')
                    except socket.timeout as exception:
                        print(f'Stopped receiving messages from media player {XOS_MEDIA_PLAYER_ID}')
                        self.send_error('media_player_timeout', exception, every=3600)
                        conn.heartbeat_check()
        except connection_errors as conn_error:
            print(f'Error connecting to RabbitMQ server: {conn_error}')
            self.send_error('rabbitmq_conn_error', conn_error, on_rep=3, every=3600)
            print(f'Retrying in {RABBITMQ_RETRY_SECONDS} seconds')
            time.sleep(RABBITMQ_RETRY_SECONDS)

    def get_events(self):
        """Connect to RabbitMQ and consume."""
        while True:
            with Connection(AMQP_URL, heartbeat=5, connect_timeout=5) as conn:
                self.consume(conn)

    def send_error(self, error_name, error, on_rep=5, every=100, units='seconds'):
        # pylint: disable=too-many-arguments
        """
        Sends `error` to Sentry on its `on_rep`th report, then every `every`
        `units` ('seconds' or 'instances') until `clear_error_history`, so
        brief blips go unreported and a lasting fault does not flood Sentry.
        """
        try:
            error_history = self.errors_history[error_name]
        except KeyError:
            error_history = {
                'error': error,
                'consecutive_instances': 0,
                'last_sent_time': None
            }
            self.errors_history[error_name] = error_history

        error_history['consecutive_instances'] += 1

        # send for the first time on the `on_rep`th time
        if error_history['consecutive_instances'] == on_rep:
            sentry_sdk.capture_exception(error)
            error_history['last_sent_time'] = datetime.datetime.now()
            return
        if error_history['consecutive_instances'] < on_rep:
            return

        # subsequent sendings go every `every` `units`
        if units == 'seconds':
            time_since_last = datetime.datetime.now() - error_history['last_sent_time']
            if time_since_last.seconds >= every:
                sentry_sdk.capture_exception(error)
                error_history['last_sent_time'] = datetime.datetime.now()
        elif units == 'instances':
            if (error_history['consecutive_instances'] - on_rep) % every == 0:
                sentry_sdk.capture_exception(error)
                error_history['last_sent_time'] = datetime.datetime.now()
        else:
            print('Invalid units')

    def clear_error_history(self, error_name):
        """Remove the history of an error when it resolves."""
        try:
            return self.errors_history.pop(error_name)['error']
        except KeyError:
            return None


def qr_svg(url, error='M'):
    """An inline SVG QR code for `url`, drawn in the page's --figure and --ground."""
    text = make_qr(url, error=error).svg_inline(dark="#aaa", light="#bbb", border=1,
                                                draw_transparent=False, omitsize=True)
    text = text.replace('#aaa', "var(--figure, black)")
    return text.replace('#bbb', "var(--ground, white)")


def listening_room_json_additions(qr_code_url, mode_override, time_override,
                                  custom_event_start_time, parent_id):
    return {
        'qr_lr': qr_svg(qr_code_url, error='L'),
        'LISTENING_ROOM_MODE_OVERRIDE': mode_override,
        'LISTENING_ROOM_TIME_OVERRIDE': time_override,
        'LISTENING_ROOM_CUSTOM_EVENT_START_TIME': custom_event_start_time,
        'LISTENING_ROOM_PARENT_ID': parent_id,
    }


@app.errorhandler(HTTPError)
def handle_http_error(error):
    response = jsonify(error.to_dict())
    response.status_code = error.status_code
    sentry_sdk.capture_exception(error)
    return response


class HasTapped(Model):  # pylint: disable=R0903
    has_tapped = IntegerField()
    tap_successful = IntegerField()
    tap_processing = IntegerField()

    class Meta:  # pylint: disable=R0903
        database = db


# How often the "Playlist not found" page reloads, and so asks XOS again.
PLAYLIST_RETRY_SECONDS = 60
last_playlist_fetch = None  # pylint: disable=invalid-name


def fetch_missing_playlist():
    """
    Fetches the playlist, at most once every PLAYLIST_RETRY_SECONDS, so a label
    that started while XOS was out of reach catches up without a reboot.
    """
    global last_playlist_fetch  # pylint: disable=global-statement
    now = time.monotonic()
    if last_playlist_fetch is not None and now - last_playlist_fetch < PLAYLIST_RETRY_SECONDS:
        return
    last_playlist_fetch = now
    from app import cache as playlist_cache  # pylint: disable=import-outside-toplevel
    playlist_cache.create_cache()


@app.route('/')
def playlist_label():
    json_data = {}
    try:
        with open(f'{CACHE_DIR}{CACHED_PLAYLIST_JSON}', encoding='utf-8') as json_file:
            json_data = json.load(json_file)
        if LABEL_MODE == 'listening-room':
            json_data.update(listening_room_json_additions(
                qr_code_url=LISTENING_ROOM_QR_CODE,
                mode_override=LISTENING_ROOM_MODE_OVERRIDE,
                time_override=LISTENING_ROOM_TIME_OVERRIDE,
                custom_event_start_time=LISTENING_ROOM_CUSTOM_EVENT_START_TIME,
                parent_id=LISTENING_ROOM_PARENT_ID,
            ))

        if show_qr_code:
            json_data['qr_text'] = json.dumps(
                {lang: qr_svg(url) for lang, url in PLAYLIST_QR_CODES.items()})

        # The lifelike label's one code, if any.
        if QR_URL_OVERRIDE:
            json_data['qr_svg'] = qr_svg(QR_URL_OVERRIDE)

        # Only the modes given text; the label has its own words for the rest.
        if LABEL_MODE == 'nightmare-room':
            json_data['nightmare_text'] = {
                mode: text for mode, text in NIGHTMARE_TEXT.items() if text
            }

        for item in list(json_data['playlist_labels']):
            if item['label'] is None:
                json_data['playlist_labels'].remove(item)

        if MOCK_MEDIA_PLAYER:
            # Match the mock's video length, so the label's timings agree with its timer.
            for item in json_data['playlist_labels']:
                item['video'] = {**(item.get('video') or {}), 'duration_secs': MOCK_VIDEO_SECONDS}

        collect_classname = f'collect {COLLECT_POSITION}' if COLLECT_POSITION else 'collect'

        return render_template(
            LABEL_TEMPLATE,
            playlist_json=json_data,
            playlist_json_rendered=json.dumps(json_data),
            mqtt={
                'host': RABBITMQ_MQTT_HOST,
                'port': RABBITMQ_MQTT_PORT,
                'username': RABBITMQ_MEDIA_PLAYER_USER,
                'password': RABBITMQ_MEDIA_PLAYER_PASS
            },
            xos={
                'playlist_endpoint': f'{XOS_API_ENDPOINT}playlists/',
                'media_player_id': XOS_MEDIA_PLAYER_ID
            },
            hide_timer=HIDE_TIMER,
            mock_media_player=MOCK_MEDIA_PLAYER,
            fg_colour=LABEL_FG_COLOUR,
            bg_colour=LABEL_BG_COLOUR,
            label_rotate=LABEL_ROTATE,
            override_duration=OVERRIDE_DURATION,
            show_caption_icon=XOS_MEDIA_PLAYER_ID is not None and HIDE_CAPTION is False,
            override_title=OVERRIDE_TITLE,
            ignore_media_player=HIDE_TIMER,
            is_preview='false',
            collect_classname=collect_classname,
            label_mode=LABEL_MODE,
            programming_message=PROGRAMMING_MESSAGE,
            offset_top_margin=OFFSET_TOP_MARGIN
        )
    except FileNotFoundError:
        print(f'Couldn\'t open cached playlist JSON: {CACHE_DIR}{CACHED_PLAYLIST_JSON}')
        fetch_missing_playlist()
        if os.path.exists(f'{CACHE_DIR}{CACHED_PLAYLIST_JSON}'):
            return redirect(request.path)
        return render_template('no_playlist.html', retry_seconds=PLAYLIST_RETRY_SECONDS)


@app.route('/api/playlist/')
def playlist_json():
    json_data = {}
    try:
        with open(f'{CACHE_DIR}{CACHED_PLAYLIST_JSON}', encoding='utf-8') as json_file:
            json_data = json.load(json_file)
    except FileNotFoundError:
        pass

    return jsonify(json_data)


@app.route('/api/taps/', methods=['POST'])
def collect_item():
    """Forward a lens tap to XOS."""
    tap_to_process = HasTapped.get_or_none(tap_processing=0)
    if tap_to_process:
        tap_to_process.tap_processing = 1
        tap_to_process.save()

    xos_tap = dict(request.get_json())
    record = model_to_dict(Message.select().order_by(Message.datetime.desc()).get())
    xos_tap['label'] = record.pop('label_id', None)
    xos_tap.setdefault('data', {})['playlist_info'] = record
    headers = {'Authorization': 'Token ' + AUTH_TOKEN}
    response = requests.post(XOS_TAPS_ENDPOINT, json=xos_tap, headers=headers)

    if response.status_code != requests.codes['created']:
        if tap_to_process:
            tap_to_process.tap_successful = 0
            tap_to_process.has_tapped = 1
            tap_to_process.save()
        raise HTTPError('Could not save tap to XOS.')

    if tap_to_process:
        tap_to_process.tap_successful = 1
        tap_to_process.has_tapped = 1
        tap_to_process.save()

    return response.json(), response.status_code


def event_stream():
    while True:
        time.sleep(0.1)
        try:
            has_tapped = HasTapped.get_or_none(tap_processing=1, has_tapped=1)
            if has_tapped:
                tap_event_message = f'data: {{ "tap_successful": {has_tapped.tap_successful} }}\n\n'
                has_tapped.has_tapped = 0
                has_tapped.tap_processing = 0
                has_tapped.tap_successful = 0
                has_tapped.save()
                yield tap_event_message
        except OperationalError as exception:
            template = 'An exception of type {0} {1!r} occurred in event_stream '\
                       'trying to update HasTapped.'
            message = template.format(type(exception).__name__, exception.args)
            if DEBUG:
                print(message)


@app.route('/api/tap-source/')
def tap_source():
    return Response(event_stream(), mimetype="text/event-stream")


# Set at start-up for templates that read the playback stream. See `app/playback_sync.py`.
sync = None  # pylint: disable=invalid-name


def playback_stream(client_ip):
    last_body = None
    with sync.client(client_ip):
        while True:
            body = sync.wait(last_body)
            if body is not None:
                last_body = body
                data = json.dumps({
                    'duration': body.get('duration'),
                    'playback_position': body.get('playback_position'),
                    'label_id': body.get('label_id'),
                })
                yield f'data: {data}\n\n'


@app.route('/api/playback-stream/')
def playback_source():
    if sync is None:
        return jsonify({'error': 'This label has no media player to follow.'}), 404
    return Response(playback_stream(request.remote_addr), mimetype="text/event-stream")


# The nightmare room, when this label is one. See `app/nightmare_room.py`.
room = None  # pylint: disable=invalid-name

# A quiet room stream sends an SSE comment this often, so a closed client is noticed.
ROOM_KEEPALIVE_SECONDS = 15


def room_stream():
    """The room's mode as server-sent events: see `NightmareRoom.snapshot`."""
    last = None
    quiet = 0
    while True:
        snapshot = room.snapshot()
        # Every second while a run is on, so the label's clock keeps time;
        # otherwise only when the mode changes.
        if snapshot != last or snapshot['mode'] == 'running':
            last = snapshot
            quiet = 0
            yield f'data: {json.dumps(snapshot)}\n\n'
        elif quiet >= ROOM_KEEPALIVE_SECONDS:
            quiet = 0
            yield ':\n\n'
        room.wait_for_change(timeout=1.0)
        quiet += 1


@app.route('/api/room-stream/')
def room_source():
    if room is None:
        return jsonify({'error': 'This label is not a nightmare room.'}), 404
    return Response(room_stream(), mimetype="text/event-stream")


@app.route('/api/events/')
def events():
    """Proxy for the ACMI events API."""
    try:
        response = requests.get(LISTENING_ROOM_EVENTS_API, params=request.args, timeout=10)
        return Response(
            response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json'),
        )
    except requests.exceptions.RequestException as exc:
        return jsonify({'error': str(exc)}), 502


if __name__ == '__main__':
    db.create_tables([Message, HasTapped])
    try:
        db.execute_sql('ALTER TABLE message ADD COLUMN duration INTEGER DEFAULT 0')
    except Exception:  # pylint: disable=broad-except
        pass  # column already exists
    HasTapped.create(has_tapped=0, tap_successful=0, tap_processing=0)
    # Under the reloader, the first process only watches files and the server
    # runs in the process it starts.
    serving = not app.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
    if serving and CONFIG_ENV_FILE and not os.path.exists(f'{CACHE_DIR}{CACHED_PLAYLIST_JSON}'):
        # config.env names a playlist that is not cached yet.
        from app.cache import create_cache
        create_cache()
    if serving and LABEL_TEMPLATE == 'lifelike.html' and LABEL_MODE == 'nightmare-room':
        # The room's mode comes from TouchOSC, not the media player.
        room = NightmareRoom(NIGHTMARE_RUN_MINUTES * 60)
        try:
            room.listen(OSC_PORT)
        except OSError as error:
            print(f'[osc] Could not listen on UDP {OSC_PORT}: {error}')
    if XOS_MEDIA_PLAYER_ID or MOCK_MEDIA_PLAYER:
        if serving:
            # These templates read `/api/playback-stream/`; the rest consume over AMQP.
            if LABEL_TEMPLATE in ('reverb-digital-label.html', 'lifelike.html'):
                sync = PlaybackSync(
                    host=RABBITMQ_MQTT_HOST,
                    port=RABBITMQ_MQTT_PORT,
                    user=RABBITMQ_MEDIA_PLAYER_USER,
                    password=RABBITMQ_MEDIA_PLAYER_PASS,
                    topic=MQTT_TOPIC,
                    retry_seconds=RABBITMQ_RETRY_SECONDS,
                )
                if MOCK_MEDIA_PLAYER:
                    sync.start(mqtt=False)
                    MockMediaPlayer(
                        sync, f'{CACHE_DIR}{CACHED_PLAYLIST_JSON}', MOCK_VIDEO_SECONDS,
                    ).start()
                else:
                    sync.start()
            elif XOS_MEDIA_PLAYER_ID:
                playlistlabel = PlaylistLabel()
                Thread(target=playlistlabel.get_events).start()
            else:
                print(f'[mock] MOCK_MEDIA_PLAYER does nothing for {LABEL_TEMPLATE}: '
                      'it only feeds /api/playback-stream/')
    else:
        print('[mqtt] XOS_MEDIA_PLAYER_ID not set — skipping MQTT connection')
    app.run(
        host='0.0.0.0',
        port=PLAYLIST_LABEL_PORT,
        threaded=True,
        # Restart the server when config.env is saved, as for a code change.
        extra_files=[CONFIG_ENV_FILE] if CONFIG_ENV_FILE else None,
    )
