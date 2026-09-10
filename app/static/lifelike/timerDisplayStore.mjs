import { atom, onMount } from "nanostores";

// ---- Playback, as stores ----
/** The event name the stream sends. Comments are invisible to `EventSource`. */
const PLAYBACK_EVENT = "playback";
const MS_PER_MINUTE = 60000;
const MS_PER_SECOND = 1000;
/** How long the label shows the timer after not hearing from the player. */

export const STALE_AFTER_MS = 30000;
/**
 * @typedef {{ durationMs: number, position: number }} PlaybackSnapshot
 * @typedef {{ ratio: number, elapsed: string, restart: string }} TimerDisplay
 */
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

  const { duration_ms: durationMs, position } = parsed;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return undefined;
  if (!Number.isFinite(position)) return undefined;

  return { durationMs, position };
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

  const remainingMs = snapshot.durationMs - elapsedMs;
  const remainingMinutes = Math.max(1, Math.floor(remainingMs / MS_PER_MINUTE));

  return {
    ratio,
    elapsed: `${minutes}:${seconds.toString().padStart(2, "0")}`,
    restart: `Starts again in ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`,
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
