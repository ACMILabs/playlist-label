import {
  STALE_AFTER_MS,
  durationText,
  endsInText,
  loopText,
  minutesText,
  positionAt,
  readPlaybackEvent,
  readRoomEvent,
  restartText,
  startsInText,
  timerAt,
  toTimerDisplay,
} from "../../../app/static/lifelike/timerDisplayStore.mjs";

describe("lifelike time text", () => {
  it("counts whole minutes, never fewer than one", () => {
    expect(minutesText(0)).toBe("1 minute");
    expect(minutesText(59)).toBe("1 minute");
    expect(minutesText(119)).toBe("1 minute");
    expect(minutesText(120)).toBe("2 minutes");
  });

  it("gives a duration only when one is known", () => {
    expect(durationText(720)).toBe("Duration: 12 minutes");
    expect(durationText(0)).toBe("");
    expect(durationText(-5)).toBe("");
    expect(durationText(NaN)).toBe("");
  });

  it("says a work starts soon inside its last minute", () => {
    expect(startsInText(420)).toBe("Starts in 7 minutes");
    expect(startsInText(59)).toBe("Starts soon");
    expect(startsInText(null)).toBe("");
  });

  it("writes the restart, loop and run-end lines", () => {
    expect(restartText(300)).toBe("Starts again in 5 minutes");
    expect(loopText(600)).toBe("This work starts again in 10 minutes");
    expect(endsInText(90)).toBe("Ends in 1 minute");
    expect(restartText(Infinity)).toBe("");
  });
});

describe("readPlaybackEvent", () => {
  const event = (body) => JSON.stringify(body);

  it("reads duration in milliseconds, position and label id", () => {
    expect(
      readPlaybackEvent(
        event({ duration: 60000, playback_position: 0.5, label_id: 44 })
      )
    ).toEqual({ durationMs: 60000, position: 0.5, labelId: 44 });
  });

  it("drops a label id that is not a number", () => {
    expect(
      readPlaybackEvent(
        event({ duration: 60000, playback_position: 0, label_id: "44" })
      )
    ).toEqual({ durationMs: 60000, position: 0, labelId: undefined });
  });

  it.each([
    ["not json", "{"],
    ["not an object", "42"],
    ["null", "null"],
    ["no duration", event({ playback_position: 0.5 })],
    ["zero duration", event({ duration: 0, playback_position: 0.5 })],
    ["no position", event({ duration: 60000 })],
  ])("reads nothing from %s", (_, data) => {
    expect(readPlaybackEvent(data)).toBeUndefined();
  });
});

describe("readRoomEvent", () => {
  it("reads a mode with no run", () => {
    expect(readRoomEvent(JSON.stringify({ mode: "closed" }))).toEqual({
      mode: "closed",
    });
  });

  it("reads a run's clock while running", () => {
    expect(
      readRoomEvent(
        JSON.stringify({
          mode: "running",
          duration: 600000,
          playback_position: 0.1,
        })
      )
    ).toEqual({
      mode: "running",
      durationMs: 600000,
      position: 0.1,
      labelId: undefined,
    });
  });

  it("reads nothing from a run with no clock, or a mode it does not know", () => {
    expect(readRoomEvent(JSON.stringify({ mode: "running" }))).toBeUndefined();
    expect(readRoomEvent(JSON.stringify({ mode: "flooded" }))).toBeUndefined();
    expect(readRoomEvent("{")).toBeUndefined();
  });
});

describe("positionAt", () => {
  const snapshot = { durationMs: 1000, position: 0.5 };

  it("moves on from the snapshot by the time since", () => {
    expect(positionAt(snapshot, 250, true)).toBeCloseTo(0.75);
  });

  it("comes round again when the work loops", () => {
    expect(positionAt(snapshot, 750, true)).toBeCloseTo(0.25);
    expect(
      positionAt({ durationMs: 1000, position: -0.25 }, 0, true)
    ).toBeCloseTo(0.75);
  });

  it("stops at the end when it does not", () => {
    expect(positionAt(snapshot, 750, false)).toBe(1);
  });
});

describe("toTimerDisplay", () => {
  it("shows how far in, and how long is left", () => {
    expect(toTimerDisplay({ durationMs: 600000, position: 0.5 })).toEqual({
      ratio: 0.5,
      elapsed: "5:00",
      restart: "Starts again in 5 minutes",
      remainingSeconds: 300,
    });
  });

  it("pads the seconds and clamps the ratio", () => {
    expect(toTimerDisplay({ durationMs: 600000, position: 0.01 }).elapsed).toBe(
      "0:06"
    );
    expect(toTimerDisplay({ durationMs: 600000, position: 1.5 }).ratio).toBe(1);
  });
});

describe("timerAt", () => {
  const snapshot = { durationMs: 600000, position: 0 };

  it("reads the snapshot forward", () => {
    expect(timerAt(snapshot, 20000, true)?.elapsed).toBe("0:20");
  });

  it("reads nothing with no snapshot, or once the player has gone quiet", () => {
    expect(timerAt(undefined, 0, true)).toBeUndefined();
    expect(timerAt(snapshot, STALE_AFTER_MS, true)).toBeUndefined();
  });
});
