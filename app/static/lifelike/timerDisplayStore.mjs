import { atom, onMount } from "nanostores";

// ---- Playback, and the nightmare room, as stores ----

/**
 * `/api/playback-stream/` and `/api/room-stream/` send their events
 * unnamed, so `EventSource` hands them over as `message`. The room stream's
 * keep-alive comments never reach it.
 */
const PLAYBACK_EVENT = "message";
const MS_PER_MINUTE = 60000;
const MS_PER_SECOND = 1000;

/** How long the label shows the timer after not hearing from the player. */
export const STALE_AFTER_MS = 30000;

/** How long to wait before opening the stream again, once it has closed. */
const RECONNECT_AFTER_MS = 5000;

/**
 * The smallest move of the ring worth drawing: a two-thousandth of a turn,
 * about a third of a design pixel round a ring 260 across.
 */
const RING_STEP = 1 / 2000;

/**
 * @typedef {{ durationMs: number, position: number, labelId?: number }} PlaybackSnapshot
 * @typedef {{ ratio: number, elapsed: string, restart: string, remainingSeconds: number }} TimerDisplay
 */

// ---- Time, as text ----

// Every length of time the label shows is written here, so they all round
// and read the same way.

/** Whole minutes, never fewer than one. */
export function minutesText(seconds) {
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** The line under the credit: "Duration: 12 minutes". Nothing when unknown. */
export function durationText(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return `Duration: ${minutesText(seconds)}`;
}

/**
 * When a work further down the playlist comes round: "Starts soon" inside
 * the last minute, and nothing when no time is known.
 */
export function startsInText(seconds) {
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "Starts soon";
  return `Starts in ${minutesText(seconds)}`;
}

/** When the work playing now comes round again, on a label that loops it alone. */
export function restartText(seconds) {
  if (!Number.isFinite(seconds)) return "";
  return `Starts again in ${minutesText(seconds)}`;
}

/** The same line on a playlist, where "again" means after every other work. */
export function loopText(seconds) {
  if (!Number.isFinite(seconds)) return "";
  return `This work starts again in ${minutesText(seconds)}`;
}

/** When a run in the nightmare room ends. */
export function endsInText(seconds) {
  if (!Number.isFinite(seconds)) return "";
  return `Ends in ${minutesText(seconds)}`;
}

/**
 * Reads one event's data into a snapshot, or nothing.
 *
 * @param {string} data
 * @returns {PlaybackSnapshot | undefined}
 */
export function readPlaybackEvent(data) {
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) return undefined;

  // `duration` is milliseconds, whatever `Video.duration_secs` says: the
  // server forwards the media player's mqtt body as-is. See `playback_stream`
  // in `app/main.py`.
  const { duration: durationMs, playback_position: position, label_id: labelId } = parsed;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return undefined;
  if (!Number.isFinite(position)) return undefined;

  return {
    durationMs,
    position,
    labelId: Number.isFinite(labelId) ? labelId : undefined,
  };
}

/** The nightmare room's modes. See `app/nightmare_room.py`. */
const ROOM_MODES = ["waiting", "running", "unavailable", "closed"];

/**
 * @typedef {{ mode: string, durationMs?: number, position?: number }} RoomSnapshot
 */

/**
 * Reads one event from the room stream: the room's mode, and while a run is
 * on, its clock, as a playback event carries it. Nothing for an event it
 * cannot read.
 *
 * @param {string} data
 * @returns {RoomSnapshot | undefined}
 */
export function readRoomEvent(data) {
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (!ROOM_MODES.includes(parsed?.mode)) return undefined;
  if (parsed.mode !== "running") return { mode: parsed.mode };

  const run = readPlaybackEvent(data);
  return run ? { mode: "running", ...run } : undefined;
}

/**
 * How far through the work, as a ratio of its duration, `sinceMs` after the
 * snapshot. A work that loops comes round again; one that does not stops at
 * the end.
 *
 * @param {PlaybackSnapshot} snapshot
 * @param {number} sinceMs
 * @param {boolean} loops
 */
export function positionAt(snapshot, sinceMs, loops) {
  const { durationMs, position } = snapshot;
  const elapsed = position * durationMs + sinceMs;
  if (!loops) return Math.min(Math.max(elapsed / durationMs, 0), 1);

  const wrapped = elapsed % durationMs;
  return (wrapped < 0 ? wrapped + durationMs : wrapped) / durationMs;
}

/**
 * Turns a snapshot into display text.
 *
 * @param {PlaybackSnapshot} snapshot
 * @returns {TimerDisplay}
 */
export function toTimerDisplay(snapshot) {
  const ratio = Math.min(Math.max(snapshot.position, 0), 1);
  const elapsedMs = ratio * snapshot.durationMs;

  const minutes = Math.floor(elapsedMs / MS_PER_MINUTE);
  const seconds = Math.floor(elapsedMs / MS_PER_SECOND) % 60;

  const remainingSeconds = Math.round((snapshot.durationMs - elapsedMs) / MS_PER_SECOND);

  return {
    ratio,
    elapsed: `${minutes}:${seconds.toString().padStart(2, "0")}`,
    restart: restartText(remainingSeconds),
    remainingSeconds,
  };
}

/**
 * What the timer should read, given a snapshot and how long ago it arrived.
 * Nothing, once the player has been quiet for `STALE_AFTER_MS`.
 *
 * @param {PlaybackSnapshot | undefined} snapshot
 * @param {number} sinceMs
 * @param {boolean} loops whether the work comes round again by itself
 * @returns {TimerDisplay | undefined}
 */
export function timerAt(snapshot, sinceMs, loops) {
  if (!snapshot || snapshot.durationMs <= 0) return undefined;
  if (sinceMs >= STALE_AFTER_MS) return undefined;

  return toTimerDisplay({
    durationMs: snapshot.durationMs,
    position: positionAt(snapshot, sinceMs, loops),
  });
}

/**
 * The latest position from the label's playback stream. See `streamStore`.
 *
 * @param {import("nanostores").ReadableAtom<string>} $source
 * @returns {import("nanostores").ReadableAtom<PlaybackSnapshot | undefined>}
 */
export function playbackSnapshotStore($source) {
  return streamStore($source, readPlaybackEvent);
}

/**
 * The nightmare room's latest mode, from the room stream. See `streamStore`.
 *
 * @param {import("nanostores").ReadableAtom<string>} $source
 * @returns {import("nanostores").ReadableAtom<RoomSnapshot | undefined>}
 */
export function roomSnapshotStore($source) {
  return streamStore($source, readRoomEvent);
}

/**
 * The latest event from a server-sent event stream, as `read` reads it. The
 * connection is open only while something listens and there is a source, so
 * a label with no media player never connects.
 *
 * `EventSource` reconnects by itself after a dropped connection, but gives up
 * for good on an error response — a 500 while the server restarts, say. A
 * kiosk is never reloaded, so this opens it again instead.
 *
 * @template T
 * @param {import("nanostores").ReadableAtom<string>} $source
 * @param {(data: string) => T | undefined} read
 * @returns {import("nanostores").ReadableAtom<T | undefined>}
 */
function streamStore($source, read) {
  /** @type {import("nanostores").WritableAtom<T | undefined>} */
  const $snapshot = atom(undefined);

  onMount($snapshot, () => {
    /** @type {EventSource | undefined} */
    let stream;
    let reconnect = 0;
    let failing = false;

    /** @param {string} source */
    function connect(source) {
      const opened = new EventSource(source);
      stream = opened;

      opened.addEventListener(PLAYBACK_EVENT, (event) => {
        if (failing) console.info(`[acmi-label] ${source} open again`);
        failing = false;
        const next = read(/** @type {MessageEvent<string>} */ (event).data);
        if (next) $snapshot.set(next);
      });
      opened.addEventListener("error", () => {
        if (stream !== opened || opened.readyState !== EventSource.CLOSED) return;
        if (!failing) {
          console.warn(
            `[acmi-label] ${source} closed, opening it again every ${RECONNECT_AFTER_MS / 1000}s`,
          );
        }
        failing = true;
        reconnect = setTimeout(() => connect(source), RECONNECT_AFTER_MS);
      });
    }

    const unsubscribe = $source.subscribe((source) => {
      clearTimeout(reconnect);
      stream?.close();
      stream = undefined;
      // New source or none, the last snapshot is not this player's.
      $snapshot.set(undefined);
      if (source) connect(source);
    });

    return () => {
      unsubscribe();
      clearTimeout(reconnect);
      stream?.close();
    };
  });

  return $snapshot;
}

/**
 * Whether two readings of the timer would draw the same: the same text, and
 * the ring less than `RING_STEP` apart.
 *
 * @param {TimerDisplay} a
 * @param {TimerDisplay} b
 */
function looksTheSame(a, b) {
  return (
    a.elapsed === b.elapsed &&
    a.remainingSeconds === b.remainingSeconds &&
    Math.abs(a.ratio - b.ratio) < RING_STEP
  );
}

/**
 * The timer, worked out every frame while there is something to draw, but
 * only passed on when it would draw differently: the ring moves about a
 * design pixel a second, so most frames would redraw it for a fraction of
 * one. The loop stops once the timer reads nothing and starts again on the
 * next snapshot, so a label without playback costs no frames.
 *
 * @param {import("nanostores").ReadableAtom<PlaybackSnapshot | undefined>} $snapshot
 * @param {{ loops?: boolean }} [options] whether the work comes round again
 *   by itself
 * @returns {import("nanostores").ReadableAtom<TimerDisplay | undefined>}
 */
export function timerDisplayStore($snapshot, { loops = true } = {}) {
  /** @type {import("nanostores").WritableAtom<TimerDisplay | undefined>} */
  const $display = atom(undefined);

  onMount($display, () => {
    /** @type {PlaybackSnapshot | undefined} */
    let snapshot;
    let takenAt = 0;
    let frame = 0;
    let stale = false;

    function schedule() {
      if (!frame) frame = requestAnimationFrame(tick);
    }

    function tick() {
      frame = 0;
      const next = timerAt(snapshot, performance.now() - takenAt, loops);

      if (snapshot && !next && !stale) {
        stale = true;
        console.info(
          `[acmi-label] no playback event for ${STALE_AFTER_MS / 1000}s, hiding the timer`,
        );
      }

      const shown = $display.get();
      if (!next || !shown || !looksTheSame(shown, next)) $display.set(next);
      if (next) schedule();
    }

    const unsubscribe = $snapshot.subscribe((next) => {
      if (stale && next) console.info("[acmi-label] playback resumed, showing the timer");
      stale = false;
      snapshot = next;
      takenAt = performance.now();
      schedule();
    });

    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
    };
  });

  return $display;
}
