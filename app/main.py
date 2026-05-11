import datetime
import json
import os
import random
from statistics import median
import time
from threading import Thread

import paho.mqtt.client as mqtt
import requests
import sentry_sdk
from flask import Flask, Response, jsonify, render_template, request
from peewee import (CharField, FloatField, IntegerField, Model,
                    OperationalError, SqliteDatabase)
from playhouse.shortcuts import model_to_dict
from sentry_sdk.integrations.flask import FlaskIntegration
from segno import make_qr
from app.errors import HTTPError

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
RABBITMQ_RETRY_SECONDS = int(os.getenv('RABBITMQ_RETRY_SECONDS', '2'))
SENTRY_ID = os.getenv('SENTRY_ID')

BALENA_APP_ID = os.getenv('BALENA_APP_ID')
BALENA_SERVICE_NAME = os.getenv('BALENA_SERVICE_NAME')
BALENA_SUPERVISOR_ADDRESS = os.getenv('BALENA_SUPERVISOR_ADDRESS')
BALENA_SUPERVISOR_API_KEY = os.getenv('BALENA_SUPERVISOR_API_KEY')
DEBUG = os.getenv('DEBUG', 'false').lower() == "true"
HIDE_TIMER = os.getenv('HIDE_TIMER', 'false').lower() == 'true'
SHOW_CAPTION_ICON = os.getenv('SHOW_CAPTION_ICON', 'false').lower() == 'true'
OVERRIDE_DURATION = os.getenv('OVERRIDE_DURATION', '')  # milliseconds; initialises timer before MQTT arrives
OVERRIDE_TITLE = os.getenv('OVERRIDE_TITLE', '')
QR_URL_OVERRIDE = os.getenv('QR_URL_OVERRIDE', '')
CACHE_DIR = os.getenv('CACHE_DIR', '/data/')

LABEL_TEMPLATE = os.getenv('LABEL_TEMPLATE', 'playlist.html')
COLLECT_POSITION = os.getenv('COLLECT_POSITION', None)

# Setup Sentry
sentry_sdk.init(
    dsn=SENTRY_ID,
    integrations=[FlaskIntegration()]
)
MQTT_TOPIC: str | None = None

if XOS_MEDIA_PLAYER_ID:
    MQTT_TOPIC = f'mediaplayer.{XOS_MEDIA_PLAYER_ID}'
    print(f'[config] MQTT: {RABBITMQ_MQTT_HOST}:{RABBITMQ_MQTT_PORT} user={RABBITMQ_MEDIA_PLAYER_USER}')
    print(f'[config] Topic: {MQTT_TOPIC}')
show_qr_code = QR_URL_OVERRIDE != '' or XOS_MEDIA_PLAYER_ID is not None or XOS_PLAYLIST_ID != '1'

QR_CODE_MEDIA_PLAYER = f'https://www.acmi.net.au/media-player/{XOS_MEDIA_PLAYER_ID}/'

QR_CODE_LABEL_ONLY = f'https://www.acmi.net.au/media-player/{XOS_PLAYLIST_ID}/?type=label&playlist={XOS_PLAYLIST_ID}'
QR_CODE_URL = QR_CODE_MEDIA_PLAYER if XOS_MEDIA_PLAYER_ID is not None else QR_CODE_LABEL_ONLY if XOS_PLAYLIST_ID != '1' else QR_URL_OVERRIDE
app = Flask(__name__)  # pylint: disable=C0103
CACHED_PLAYLIST_JSON = f'playlist_{XOS_PLAYLIST_ID}.json'
# instantiate the peewee database
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


def store_playback_message(body):
    """Store a parsed MQTT playback message in the database."""
    try:
        key = datetime.datetime.now().isoformat() + str(random.randint(0, 65536))
        Message.create(
            datetime=key,
            playlist_id=body.get('playlist_id', 0),
            media_player_id=body.get('media_player_id', 0),
            label_id=body.get('label_id', 0),
            duration=body.get('duration', 0),
            playback_position=body.get('playback_position', 0),
            audio_buffer=body.get('audio_buffer', 0),
            video_buffer=body.get('video_buffer', 0),
        )
        # keep only the last 5 messages
        Message.delete().where(
            Message.datetime.not_in(
                Message.select(Message.datetime).order_by(Message.datetime.desc()).limit(5)
            )
        ).execute()
    except Exception as exc:  # pylint: disable=broad-except
        print(f'[mqtt] Error storing message: {exc}')
        sentry_sdk.capture_exception(exc)


def on_mqtt_connect(client, userdata, flags, rc):  # pylint: disable=unused-argument
    if rc == 0:
        print(f'[mqtt] Connected to {RABBITMQ_MQTT_HOST}:{RABBITMQ_MQTT_PORT}')
        client.subscribe(MQTT_TOPIC)
        print(f'[mqtt] Subscribed to {MQTT_TOPIC}')
    else:
        print(f'[mqtt] Connection refused (rc={rc}) — check credentials and host')


def on_mqtt_disconnect(client, userdata, rc):  # pylint: disable=unused-argument
    if rc != 0:
        print(f'[mqtt] Unexpected disconnect (rc={rc}), will auto-reconnect')


def on_mqtt_message(client, userdata, msg):  # pylint: disable=unused-argument
    try:
        body = json.loads(msg.payload.decode())
        print(f'[mqtt] Message received on {msg.topic}: duration={body.get("duration")} '
              f'playback_position={body.get("playback_position")}')
        store_playback_message(body)
    except Exception as exc:  # pylint: disable=broad-except
        print(f'[mqtt] Error parsing message: {exc}')


def start_mqtt():
    """Connect to the MQTT broker via TCP and subscribe to the playback topic."""
    client = mqtt.Client()
    client.username_pw_set(RABBITMQ_MEDIA_PLAYER_USER, RABBITMQ_MEDIA_PLAYER_PASS)
    client.on_connect = on_mqtt_connect
    client.on_disconnect = on_mqtt_disconnect
    client.on_message = on_mqtt_message
    client.reconnect_delay_set(min_delay=RABBITMQ_RETRY_SECONDS, max_delay=60)

    print(f'[mqtt] Connecting to {RABBITMQ_MQTT_HOST}:{RABBITMQ_MQTT_PORT}...')
    client.connect_async(RABBITMQ_MQTT_HOST, int(RABBITMQ_MQTT_PORT))
    client.loop_forever()


@app.errorhandler(HTTPError)
def handle_http_error(error):
    """
    Format error for response.
    """
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


@app.route('/')
def playlist_label():
    # Read in the cached JSON
    json_data = {}
    try:
        with open(f'{CACHE_DIR}{CACHED_PLAYLIST_JSON}', encoding='utf-8') as json_file:
            json_data = json.load(json_file)
        
        if show_qr_code:
            qrcode = make_qr(QR_CODE_URL, error="L")
            text = qrcode.svg_inline(dark="#aaa", light="#bbb", border=0, draw_transparent=True, omitsize=True)
            text = text.replace('#aaa', "var(--figure, black)")
            text = text.replace('#bbb', "var(--ground, white)")
            json_data['qr_text'] = text
        # Remove playlist items that don't have a label
        for item in list(json_data['playlist_labels']):
            if item['label'] is None:
                json_data['playlist_labels'].remove(item)

        # Calculate classnames
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
            override_duration=OVERRIDE_DURATION,
            show_caption_icon=XOS_MEDIA_PLAYER_ID is not None,
            override_title=OVERRIDE_TITLE,
            ignore_media_player=HIDE_TIMER,
            is_preview='false',
            collect_classname=collect_classname
        )
    except FileNotFoundError:
        print(f'Couldn\'t open cached playlist JSON: {CACHE_DIR}{CACHED_PLAYLIST_JSON}')
        return render_template('no_playlist.html')


@app.route('/api/playlist/')
def playlist_json():
    # Read in the cached JSON
    json_data = {}
    try:
        with open(f'{CACHE_DIR}{CACHED_PLAYLIST_JSON}', encoding='utf-8') as json_file:
            json_data = json.load(json_file)
    except FileNotFoundError:
        pass

    return jsonify(json_data)


@app.route('/api/taps/', methods=['POST'])
def collect_item():
    """
    Collect a tap and forward it on to XOS with the label ID.
    """
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


def playback_stream(client_ip):
    """
    SSE generator that streams the latest playback message to the browser.
    Yields immediately if a message already exists, then polls for changes.
    Replaces direct browser WebSocket MQTT connection.
    """
    print(f'[sse] Client connected: {client_ip}')
    last_datetime = None
    while True:
        try:
            msg = Message.select().order_by(Message.datetime.desc()).first()
            if msg and msg.datetime != last_datetime:
                last_datetime = msg.datetime
                data = json.dumps({
                    'duration': msg.duration,
                    'playback_position': msg.playback_position,
                })
                print(f'[sse] Sending to {client_ip}: duration={msg.duration} '
                      f'playback_position={msg.playback_position}')
                yield f'data: {data}\n\n'
        except OperationalError as exception:
            template = 'An exception of type {0} {1!r} occurred in playback_stream.'
            message = template.format(type(exception).__name__, exception.args)
            if DEBUG:
                print(message)
        time.sleep(0.5)


@app.route('/api/playback-stream/')
def playback_source():
    return Response(playback_stream(request.remote_addr), mimetype="text/event-stream")


if __name__ == '__main__':
    db.create_tables([Message, HasTapped])
    # Add duration column to existing databases that predate this field.
    try:
        db.execute_sql('ALTER TABLE message ADD COLUMN duration INTEGER DEFAULT 0')
    except Exception:  # pylint: disable=broad-except
        pass  # column already exists
    HasTapped.create(has_tapped=0, tap_successful=0, tap_processing=0)
    if XOS_MEDIA_PLAYER_ID:
        Thread(target=start_mqtt, daemon=True).start()
    else:
        print('[mqtt] XOS_MEDIA_PLAYER_ID not set — skipping MQTT connection')
    app.run(host='0.0.0.0', port=PLAYLIST_LABEL_PORT, threaded=True)
