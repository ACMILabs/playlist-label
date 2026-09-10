/**
 * Everything the Flask server hands the browser.
 *
 * The xos shapes are already generated from the openapi schema in
 * `./playlisttypes.d.ts` — use those. This file covers only the layer Flask
 * adds on top, which the schema cannot know about: the keys `app/main.py`
 * merges into the playlist before rendering, the two event streams, the lens
 * tap endpoint, and the globals the templates write.
 *
 * Derived from the server, not guessed at:
 *
 * - `app/main.py` — the routes and the merged-in keys.
 * - `app/playback_sync.py` — the mqtt body the playback stream forwards.
 * - `app/static/mqtt-sync.js`, `app/static/playlist.js` — how the current
 *   client reads the streams, which is where the units come from.
 * - `app/templates/_base.html`, `reverb-digital-label.html` — the globals.
 */

import type { Playlist, PlaylistCollectible } from "./playlisttypes";

export type * from "./playlisttypes";

// ---- Locales ----

/** The three translations xos carries beside every english field. */
export type LabelLocale = "zh_hans" | "pa" | "hi";

/** The same three, hyphenated, as caption tracks and qr codes spell them. */
export type CaptionLocale = "zh-hans" | "pa" | "hi";

/** Every locale the access-guide qr codes are generated for. */
export type QrLocale = "en" | CaptionLocale;

// ---- The playlist, as Flask serves it ----

/**
 * The cached playlist with the keys `app/main.py` adds before rendering.
 *
 * It reaches the browser three ways, all the same object:
 * - `GET /api/playlist/` — the raw cached file, **without** `qr_text`
 * - `window.STATIC_VARS.playlist_json` (`_base.html`)
 * - the `data-label-json` attribute, json-encoded (`reverb-digital-label.html`)
 */
export interface ServedPlaylist extends Playlist {
  /**
   * Inline qr svg per locale, **json-encoded a second time** — parse it:
   *
   * ```js
   * const qr = playlist.qr_text ? JSON.parse(playlist.qr_text) : {}
   * ```
   *
   * Added only on the rendered page, and only when a media player or a
   * non-default playlist is configured. Never present on `/api/playlist/`.
   * Each svg has its colours swapped for `var(--figure, black)` and
   * `var(--ground, white)` so css can drive them.
   */
  qr_text?: string;
}

/** What `JSON.parse(playlist.qr_text)` gives you. */
export type QrCodes = Partial<Record<QrLocale, string>>;

/**
 * The extra keys merged in when `LABEL_MODE=listening-room`, and absent in
 * every other mode. Narrow with `'qr_lr' in playlist`.
 */
export interface ListeningRoomPlaylist extends ServedPlaylist {
  /** Inline qr svg for the listening room feedback form. */
  qr_lr: string;
  LISTENING_ROOM_MODE_OVERRIDE: string | null;
  LISTENING_ROOM_TIME_OVERRIDE: string | null;
  LISTENING_ROOM_CUSTOM_EVENT_START_TIME: string | null;
  LISTENING_ROOM_PARENT_ID: string | null;
}

/**
 * A playlist item that definitely has a label.
 *
 * `GET /` strips the label-less items before rendering, so everything in the
 * embedded copy is one of these. `/api/playlist/` does **not** strip them —
 * if you fetch, you get the raw `PlaylistLabel` union and have to narrow:
 *
 * ```js
 * const items = playlist.playlist_labels.filter((item) => item.label)
 * ```
 */
export type LabelledItem = PlaylistCollectible;

// ---- The event streams ----

/**
 * `GET /api/playback-stream/` — where the media player is up to.
 *
 * Server-sent events with **no event name**, so listen for `message` (or set
 * `onmessage`), not for a named event. One message per distinct mqtt body.
 *
 * This does not match what `main.mjs` currently reads: it listens for a named
 * `playback` event carrying `duration_ms` and `position`. One of the two has
 * to move before the live timer will run.
 */
export interface PlaybackStreamEvent {
  /**
   * Total length in **milliseconds**.
   *
   * `mqtt-sync.js` computes `Date.now() - duration * playback_position`, so
   * the unit is milliseconds even though `Video.duration_secs` is seconds.
   *
   * Null when the mqtt body carried no duration.
   */
  duration: number | null;
  /** How far through, 0 to 1. Null when the mqtt body carried none. */
  playback_position: number | null;
}

/**
 * `GET /api/tap-source/` — the result of a lens tap, once the server has
 * forwarded it to xos.
 *
 * Also unnamed events. The server polls every 100ms but only sends when a tap
 * has been processed.
 */
export interface TapStreamEvent {
  /** 1 if xos accepted the tap, 0 if it did not. */
  tap_successful: 0 | 1;
}

/**
 * What the media player publishes over mqtt. You never see this in the
 * browser — the server keeps the last one and forwards two of its fields as
 * `PlaybackStreamEvent` — but it is what those two fields mean.
 */
export interface PlaybackMessage {
  datetime: string;
  playlist_id: number;
  media_player_id: number;
  /** Which `Collectible.id` is playing now. */
  label_id: number;
  /** Milliseconds. */
  duration: number;
  /** 0 to 1. */
  playback_position: number;
  audio_buffer: number | null;
  video_buffer: number | null;
}

// ---- Lens taps ----

/** `POST /api/taps/` — what the label sends when a lens is tapped. */
export interface TapRequest {
  nfc_tag: { uid: string };
  /** Iso 8601 with offset. */
  tap_datetime: string;
  data?: {
    nfc_reader?: {
      mac_address: string;
      reader_ip: string;
      reader_model: string;
      reader_name: string;
    };
  };
}

/**
 * The server fills in `label` and `data.playlist_info` from the last mqtt
 * message before forwarding to xos, then returns xos's reply as-is. A failure
 * comes back as `ErrorResponse` with a 4xx or 5xx.
 */
export interface TapResponse {
  id: number;
  nfc_tag: { uid: string; atr: string; short_code: string };
  tap_datetime: string;
  created_at: string;
  experience_id: number | null;
  data: Record<string, unknown>;
}

/** `app/errors.py`, and the 502 from `/api/events/`. */
export interface ErrorResponse {
  error?: string;
  message?: string;
}

// ---- The page the server renders ----

/**
 * `window.STATIC_VARS`, written into `_base.html`.
 *
 * Everything here is interpolated into a json literal by jinja, so the values
 * that look like they should be numbers or booleans are strings — except the
 * three the template writes bare, noted below.
 */
export interface StaticVars {
  mqtt_host: string;
  mqtt_port: string;
  mqtt_username: string;
  mqtt_password: string;
  xos_playlist_endpoint: string;
  /** `'None'` — the literal string — when no media player is configured. */
  xos_media_player_id: string;
  /** Written bare, so a real boolean. */
  ignore_tap_reader: boolean;
  /** Written bare, so a real boolean. Set from `HIDE_TIMER`. */
  ignore_media_player: boolean;
  /** Written bare, so a real boolean. */
  is_preview: boolean;
  playlist_json: ServedPlaylist;
  collect_classname: string;
}

declare global {
  interface Window {
    STATIC_VARS?: StaticVars;
  }
}

// ---- Endpoints, in one place ----

/** Every route the label can call, and what comes back. */
export interface Api {
  /** The raw cached file: no `qr_text`, and label-less items not stripped. */
  "GET /api/playlist/": Playlist;
  /** Server-sent `message` events. */
  "GET /api/playback-stream/": PlaybackStreamEvent;
  /** Server-sent `message` events. */
  "GET /api/tap-source/": TapStreamEvent;
  "POST /api/taps/": TapResponse;
  /** Proxy to the acmi events api. Passed through untouched. */
  "GET /api/events/": unknown;
}
