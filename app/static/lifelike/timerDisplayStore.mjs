import { atom, onMount } from "nanostores";

// ---- Playback, as stores ----
/**
 * `/api/playback-stream/` sends its events unnamed, so `EventSource` hands
 * them over as `message`. Comments are invisible to it.
 */
const PLAYBACK_EVENT = "message";
const MS_PER_MINUTE = 60000;
const MS_PER_SECOND = 1000;
/** How long the label shows the timer after not hearing from the player. */

export const STALE_AFTER_MS = 30000;
/**
 * @typedef {{ durationMs: number, position: number, labelId?: number }} PlaybackSnapshot
 * @typedef {{ ratio: number, elapsed: string, restart: string, remainingSeconds: number }} TimerDisplay
 */

// ---- Time, as text ----

// Every string in the label that names a length of time is written here, so
// they all round the same way and all read the same way. Components take the
// number of seconds and call these; nothing else formats a duration.

/** Whole minutes, never fewer than one. Under a minute still reads "1 minute". */
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
 * When a work further down the playlist comes round. Inside the last minute
 * the number stops being useful, so it stops being given. Nothing at all
 * when no time is known — no stream yet, or the player has gone quiet.
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

/**
 * The same line on a playlist, where "again" means after everything else
 * has played: the rest of this work, then every other work in the loop.
 */
export function loopText(seconds) {
  if (!Number.isFinite(seconds)) return "";
  return `This work starts again in ${minutesText(seconds)}`;
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
  // server forwards the media player's mqtt body as-is. See `server.d.ts`.
  const { duration: durationMs, playback_position: position, label_id: labelId } = parsed;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return undefined;
  if (!Number.isFinite(position)) return undefined;

  return {
    durationMs,
    position,
    labelId: Number.isFinite(labelId) ? labelId : undefined,
  };
}
/** Gets elapsed time since the last snapshot, as a ratio of the duration. */

export function positionAt(snapshot, sinceMs) {
  const { durationMs, position } = snapshot;
  const elapsed = (position * durationMs + sinceMs) % durationMs;
  return (elapsed < 0 ? elapsed + durationMs : elapsed) / durationMs;
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

  // Whole seconds, so this changes once a second rather than once a frame.
  // Everything downstream of it — the stack's start times — is a computed
  // store keyed on this number, and only recomputes when it moves.
  const remainingSeconds = Math.round(
    (snapshot.durationMs - elapsedMs) / MS_PER_SECOND,
  );

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
 * @returns {TimerDisplay | undefined}
 */

export function timerAt(snapshot, sinceMs) {
  if (!snapshot || snapshot.durationMs <= 0) return undefined;
  if (sinceMs >= STALE_AFTER_MS) return undefined;

  return toTimerDisplay({
    durationMs: snapshot.durationMs,
    position: positionAt(snapshot, sinceMs),
  });
}
/**
 * The latest position from the label's playback stream.
 *
 * The store opens the connection when something listens and closes it when
 * the last listener goes, which is how a label with no media player behaves:
 * the server renders no attribute, so nothing here ever opens.
 *
 * @param {import("nanostores").ReadableAtom<string>} $source
 * @returns {import("nanostores").ReadableAtom<PlaybackSnapshot | undefined>}
 */
export function playbackSnapshotStore($source) {
  /** @type {import("nanostores").WritableAtom<PlaybackSnapshot | undefined>} */
  const $snapshot = atom(undefined);

  onMount($snapshot, () => {
    /** @type {EventSource | undefined} */
    let stream;

    const unsubscribe = $source.subscribe((source) => {
      stream?.close();
      stream = undefined;
      // A new source knows nothing yet, and no source knows nothing at all:
      // either way the last snapshot is not this player's.
      $snapshot.set(undefined);
      if (!source) return;

      stream = new EventSource(source);
      stream.addEventListener(PLAYBACK_EVENT, (event) => {
        const next = readPlaybackEvent(
                /** @type {MessageEvent<string>} */(event).data
        );
        if (next) $snapshot.set(next);
      });
    });

    return () => {
      unsubscribe();
      stream?.close();
    };
  });

  return $snapshot;
}
/**
 * The timer, advanced every frame while there is something to draw.
 *
 * The loop stops once the timer reads nothing — no snapshot yet, or the
 * player has gone quiet — and starts again on the next snapshot, so a label
 * without playback costs no frames.
 *
 * @param {import("nanostores").ReadableAtom<PlaybackSnapshot | undefined>} $snapshot
 * @returns {import("nanostores").ReadableAtom<TimerDisplay | undefined>}
 */
export function timerDisplayStore($snapshot) {
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
      const next = timerAt(snapshot, performance.now() - takenAt);

      if (snapshot && !next && !stale) {
        stale = true;
        console.info(
          `[acmi-label] no playback event for ${STALE_AFTER_MS / 1000}s, hiding the timer`
        );
      }

      $display.set(next);
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
