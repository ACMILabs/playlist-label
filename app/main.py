import json
import os
import time
import socket
from threading import Thread

import requests
import sentry_sdk
from flask import Flask, Response, jsonify, render_template, request
from kombu import Connection, Exchange, Queue
from peewee import CharField, FloatField, IntegerField, Model, SqliteDatabase
from playhouse.shortcuts import model_to_dict
from sentry_sdk.integrations.flask import FlaskIntegration

from app.errors import HTTPError

XOS_API_ENDPOINT = os.getenv('XOS_API_ENDPOINT')
XOS_TAPS_ENDPOINT = os.getenv('XOS_TAPS_ENDPOINT', f'{XOS_API_ENDPOINT}taps/')
AUTH_TOKEN = os.getenv('AUTH_TOKEN')
XOS_PLAYLIST_ID = os.getenv('XOS_PLAYLIST_ID', '1')
XOS_MEDIA_PLAYER_ID = os.getenv('XOS_MEDIA_PLAYER_ID', '1')
PLAYLIST_LABEL_PORT = 8081
RABBITMQ_MQTT_HOST = os.getenv('RABBITMQ_MQTT_HOST')
RABBITMQ_MQTT_PORT = os.getenv('RABBITMQ_MQTT_PORT')
RABBITMQ_MEDIA_PLAYER_USER = os.getenv('RABBITMQ_MEDIA_PLAYER_USER')
RABBITMQ_MEDIA_PLAYER_PASS = os.getenv('RABBITMQ_MEDIA_PLAYER_PASS')
AMQP_PORT = os.getenv('AMQP_PORT')
SENTRY_ID = os.getenv('SENTRY_ID')

BALENA_APP_ID = os.getenv('BALENA_APP_ID')
BALENA_SERVICE_NAME = os.getenv('BALENA_SERVICE_NAME')
BALENA_SUPERVISOR_ADDRESS = os.getenv('BALENA_SUPERVISOR_ADDRESS')
BALENA_SUPERVISOR_API_KEY = os.getenv('BALENA_SUPERVISOR_API_KEY')

# Setup Sentry
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

app = Flask(__name__)  # pylint: disable=C0103
CACHED_PLAYLIST_JSON = f'playlist_{XOS_PLAYLIST_ID}.json'
# instantiate the peewee database
db = SqliteDatabase('message.db')  # pylint: disable=C0103


class Message(Model):
    datetime = CharField(primary_key=True)
    label_id = IntegerField()
    playlist_id = IntegerField()
    media_player_id = IntegerField()
    playback_position = FloatField()
    audio_buffer = FloatField(null=True)
    video_buffer = FloatField(null=True)

    class Meta:  # pylint: disable=R0903
        database = db


class PlaylistLabel():
    """
    A playlist label that communicates with XOS to download labels,
    and sends lens taps back to XOS with the label tapped.
    """

    def __init__(self):
        self.playlist = None

    @staticmethod
    def download_playlist_label():
        # Download Playlist JSON from XOS
        try:
            playlist_label_json = requests.get(
                f'{XOS_API_ENDPOINT}playlists/{XOS_PLAYLIST_ID}/'
            ).json()

            # Write it to the file system
            with open(CACHED_PLAYLIST_JSON, 'w') as outfile:
                json.dump(playlist_label_json, outfile)

        except (requests.exceptions.HTTPError, requests.exceptions.ConnectionError) as exception:
            print(f'Error downloading playlist JSON from XOS: {exception}')
            sentry_sdk.capture_exception(exception)

    @staticmethod
    def process_media(body, message):
        Message.create(
            datetime=body['datetime'],
            playlist_id=body.get('playlist_id', 0),
            media_player_id=body.get('media_player_id', 0),
            label_id=body.get('label_id', 0),
            playback_position=body.get('playback_position', 0),
            audio_buffer=body.get('audio_buffer', 0),
            video_buffer=body.get('video_buffer', 0),
        )
        # clear out other messages beyond the last 5
        delete_records = Message.delete().where(
            Message.datetime.not_in(
                Message.select(Message.datetime).order_by(Message.datetime.desc()).limit(5)
            )
        )
        delete_records.execute()

        try:
            message.ack()

        except TimeoutError as exception:
            template = 'An exception of type {0} occurred. Arguments:\n{1!r}'
            message = template.format(type(exception).__name__, exception.args)
            print(message)
            sentry_sdk.capture_exception(exception)

            # TODO: Do we need to restart the container?  # pylint: disable=W0511
            # self.restart_app_container()

    @staticmethod
    def restart_app_container():
        try:
            balena_api_url = f'{BALENA_SUPERVISOR_ADDRESS}/v2/applications/{BALENA_APP_ID}'\
                            f'/restart-service?apikey={BALENA_SUPERVISOR_API_KEY}'
            post_data = {
                "serviceName": BALENA_SERVICE_NAME
            }
            response = requests.post(balena_api_url, json=post_data)
            response.raise_for_status()
        except (requests.exceptions.HTTPError, requests.exceptions.ConnectionError) as exception:
            message = f'Failed to restart the Media Player container with error: {exception}'
            print(message)
            sentry_sdk.capture_exception(exception)

    def get_events(self):
        # connections
        with Connection(AMQP_URL) as conn:
            # consume
            with conn.Consumer(PLAYBACK_QUEUE, callbacks=[self.process_media]):
                # Process messages and handle events on all channels
                while True:
                    try:
                        conn.drain_events(timeout=2)
                    except (socket.timeout, TimeoutError) as exception:
                        # TODO: make robust  # pylint: disable=W0511
                        sentry_sdk.capture_exception(exception)


@app.errorhandler(HTTPError)
def handle_http_error(error):
    """
    Format error for response.
    """
    response = jsonify(error.to_dict())
    response.status_code = error.status_code
    sentry_sdk.capture_exception(error)
    return response


class HasTapped(Model):
    has_tapped = IntegerField()

    class Meta:  # pylint: disable=R0903
        database = db


@app.route('/')
def playlist_label():
    # Read in the cached JSON
    with open(CACHED_PLAYLIST_JSON, encoding='utf-8') as json_file:
        json_data = json.load(json_file)

    # Remove playlist items that don't have a label
    for item in list(json_data['playlist_labels']):
        if item['label'] is None:
            json_data['playlist_labels'].remove(item)

    return render_template(
        'playlist.html',
        playlist_json=json_data,
        mqtt={
            'host': RABBITMQ_MQTT_HOST,
            'port': RABBITMQ_MQTT_PORT,
            'username': RABBITMQ_MEDIA_PLAYER_USER,
            'password': RABBITMQ_MEDIA_PLAYER_PASS
        },
        xos={
            'playlist_endpoint': f'{XOS_API_ENDPOINT}playlists/',
            'media_player_id': XOS_MEDIA_PLAYER_ID
        }
    )


@app.route('/api/playlist/')
def playlist_json():
    # Read in the cached JSON
    with open(CACHED_PLAYLIST_JSON, encoding='utf-8') as json_file:
        json_data = json.load(json_file)

    return jsonify(json_data)


@app.route('/api/taps/', methods=['POST'])
def collect_item():
    """
    Collect a tap and forward it on to XOS with the label ID.
    """
    has_tapped = HasTapped.get_or_none(has_tapped=0)
    has_tapped.has_tapped = 1
    has_tapped.save()
    xos_tap = dict(request.get_json())
    record = model_to_dict(Message.select().order_by(Message.datetime.desc()).get())
    xos_tap['label'] = record.pop('label_id', None)
    xos_tap.setdefault('data', {})['playlist_info'] = record
    headers = {'Authorization': 'Token ' + AUTH_TOKEN}
    response = requests.post(XOS_TAPS_ENDPOINT, json=xos_tap, headers=headers)
    if response.status_code != requests.codes['created']:
        raise HTTPError('Could not save tap to XOS.')
    return jsonify(response.content), response.status_code


def event_stream():
    while True:
        time.sleep(0.1)
        has_tapped = HasTapped.get_or_none(has_tapped=1)
        if has_tapped:
            has_tapped.has_tapped = 0
            has_tapped.save()
            yield 'data: {}\n\n'


@app.route('/api/tap-source/')
def tap_source():
    return Response(event_stream(), mimetype="text/event-stream")


if __name__ == '__main__':
    db.create_tables([Message, HasTapped])
    HasTapped.create(has_tapped=0)
    playlistlabel = PlaylistLabel()  # pylint: disable=C0103
    playlistlabel.download_playlist_label()
    Thread(target=playlistlabel.get_events).start()
    app.run(host='0.0.0.0', port=PLAYLIST_LABEL_PORT)
