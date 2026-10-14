/**
 * @jest-environment jsdom
 */
import playlistJson from "../../data/playlist.json";
import "../../../app/static/lifelike/main.mjs";

/** An `EventSource` the test speaks through, as the player would. */
class FakeEventSource {
  static CLOSED = 2;

  static last;

  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.target = new EventTarget();
    FakeEventSource.last = this;
  }

  addEventListener(type, listener) {
    this.target.addEventListener(type, listener);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  send(body) {
    this.target.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(body) })
    );
  }
}

/** Mounts the label the page mounts, with a playlist as its json island. */
function mount(attributes, playlist = playlistJson) {
  const label = document.createElement("acmi-lifelike-label");
  for (const [name, value] of Object.entries(attributes))
    label.setAttribute(name, value);
  const island = document.createElement("script");
  island.type = "application/json";
  island.dataset.prop = "playlist";
  island.textContent = JSON.stringify(playlist);
  label.append(island);
  document.body.append(label);
  return label;
}

/** The fixture with its first item's description swapped for `html`. */
function withDescription(html) {
  const playlist = JSON.parse(JSON.stringify(playlistJson));
  playlist.playlist_labels[0].label.columns = [
    { content: html, style: "standard" },
  ];
  return playlist;
}

const text = (root, selector) =>
  root.querySelector(selector)?.textContent.trim();
const texts = (root, selector) =>
  [...root.querySelectorAll(selector)].map((element) =>
    element.textContent.trim()
  );

beforeEach(() => {
  global.EventSource = FakeEventSource;
  FakeEventSource.last = undefined;
});

afterEach(() => {
  document.body.replaceChildren();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("acmi-lifelike-label, normal", () => {
  it("shows the first item in full", () => {
    const label = mount({ variant: "normal" });

    expect(label.querySelector("acmi-single-work")).not.toBeNull();
    const heading = label.querySelector(".acmi-title__heading");
    expect(heading.innerHTML).toBe("Test pattern");
    expect(heading.dataset.text).toBe("Test pattern");
    expect(text(label, ".acmi-tombstone__credit")).toContain("Daniel Bronsema");
    expect(text(label, ".acmi-tombstone__duration")).toBe("Duration: 1 minute");
    expect(text(label, "acmi-description")).toContain(
      "Music video uses video effect"
    );
    expect(label.querySelector("acmi-error-screen").hidden).toBe(true);
  });

  it("hides the timer with no playback source", () => {
    const label = mount({ variant: "normal" });

    expect(label.querySelector(".acmi-header__timer").hidden).toBe(true);
    expect(FakeEventSource.last).toBeUndefined();
  });

  it("lifts warnings out of the description into info rows", () => {
    const label = mount(
      { variant: "normal" },
      withDescription(
        "<p>The work.</p><p><acmi-warning>Contains strobe lighting</acmi-warning></p>"
      )
    );

    expect(label.querySelector("acmi-description").innerHTML).toBe(
      "<p>The work.</p>"
    );
    const row = label.querySelector("acmi-info-entry");
    expect(row.icon).toBe("caution");
    expect(text(row, ".acmi-info-entry__text")).toBe(
      "Contains strobe lighting"
    );
    expect(label.querySelector("acmi-info-block").hidden).toBe(false);
  });

  it("shows the error screen when no item has a label", () => {
    const label = mount(
      { variant: "normal" },
      { ...playlistJson, playlist_labels: [{ label: null }] }
    );

    expect(label.querySelector("acmi-error-screen").hidden).toBe(false);
    expect(text(label, ".acmi-error-screen__message")).toBe(
      "This label is temporarily unavailable."
    );
    expect(label.querySelector(".acmi-label__content").hidden).toBe(true);
  });

  it("draws a single work for a variant it does not know", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const label = mount({ variant: "reverb" });

    expect(label.querySelector("acmi-single-work")).not.toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('no variant "reverb"')
    );
  });

  it("runs the timer from the player's stream", () => {
    jest.useFakeTimers();
    const label = mount({
      variant: "normal",
      "playback-source": "/api/playback-stream/",
    });

    expect(FakeEventSource.last.url).toBe("/api/playback-stream/");
    FakeEventSource.last.send({
      duration: 600000,
      playback_position: 0.5,
      label_id: 51517,
    });
    jest.advanceTimersByTime(20);

    const timer = label.querySelector(".acmi-header__timer");
    expect(timer.hidden).toBe(false);
    expect(text(timer, ".acmi-timer__elapsed")).toBe("5:00");
    expect(text(timer, ".acmi-timer__line")).toBe("Starts again in 5 minutes");
  });
});

describe("acmi-lifelike-label, in a browser with a sanitizer", () => {
  // jsdom has no `setHTML`: stand one in that inserts what it is given.
  const setHTML = jest.fn(function setHTML(html) {
    this.innerHTML = html;
  });

  beforeEach(() => {
    setHTML.mockClear();
    Element.prototype.setHTML = setHTML;
  });

  afterEach(() => {
    delete Element.prototype.setHTML;
  });

  it("puts the cms's markup through it", () => {
    const label = mount(
      { variant: "normal" },
      withDescription("<p>The work.</p>")
    );

    expect(setHTML).toHaveBeenCalledWith("<p>The work.</p>");
    expect(label.querySelector("acmi-description").innerHTML).toBe(
      "<p>The work.</p>"
    );
  });

  it("draws the server's qr code as it is", () => {
    const svg = "<svg><rect></rect></svg>";
    const label = mount(
      { variant: "normal" },
      { ...playlistJson, qr_svg: svg }
    );

    expect(label.querySelector(".acmi-qr-block__code").innerHTML).toBe(svg);
    expect(setHTML).not.toHaveBeenCalledWith(svg);
    expect(label.querySelector("acmi-qr-block").hidden).toBe(false);
  });
});

describe("acmi-lifelike-label, playlist", () => {
  it("lists every labelled item under the playlist's title", () => {
    const label = mount({ variant: "playlist" });

    expect(text(label, ".acmi-playlist-title__text")).toBe("Default playlist");
    expect(texts(label, ".acmi-playlist-entry__status")).toEqual([
      "Now playing",
      "Up next",
      "Later",
    ]);
    expect(texts(label, ".acmi-title__heading")).toEqual([
      "Test pattern",
      "Placeholder video 1",
      "Placeholder video 2",
    ]);
  });

  it("shows the description of the work playing now only", () => {
    const label = mount({ variant: "playlist" });
    const descriptions = [...label.querySelectorAll("acmi-description")];

    expect(descriptions.map((description) => description.hidden)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("moves on to the work the player names, and times the ones after it", () => {
    jest.useFakeTimers();
    const label = mount({
      variant: "playlist",
      "playback-source": "/api/playback-stream/",
    });

    FakeEventSource.last.send({
      duration: 60000,
      playback_position: 0,
      label_id: 51517,
    });
    FakeEventSource.last.send({
      duration: 60058,
      playback_position: 0,
      label_id: 44,
    });
    jest.advanceTimersByTime(20);

    expect(texts(label, ".acmi-title__heading")).toEqual([
      "Placeholder video 1",
      "Placeholder video 2",
      "Test pattern",
    ]);
    expect(
      texts(label, ".acmi-playlist-entry__timer .acmi-timer__line")
    ).toEqual(["", "Starts in 1 minute", "Starts in 2 minutes"]);
    expect(text(label, ".acmi-header__timer .acmi-timer__line")).toBe(
      "This work starts again in 3 minutes"
    );
  });
});

describe("acmi-lifelike-label, nightmare room", () => {
  it("waits, with its own words, until the room says otherwise", () => {
    const label = mount({ variant: "nightmare-room" });
    const room = label.querySelector("acmi-nightmare-room");

    expect(room.dataset.state).toBe("waiting");
    expect(text(label, ".acmi-nightmare-info__text")).toBe(
      "Please wait here. The next run starts soon."
    );
    expect(label.querySelector(".acmi-tombstone__duration").hidden).toBe(true);
  });

  it("takes the server's words for a mode", () => {
    const label = mount(
      { variant: "nightmare-room" },
      { ...playlistJson, nightmare_text: { waiting: "Wait by the door." } }
    );

    expect(text(label, ".acmi-nightmare-info__text")).toBe("Wait by the door.");
  });

  it("follows the room's mode from its stream", () => {
    const label = mount({
      variant: "nightmare-room",
      "room-source": "/api/room-stream/",
    });

    FakeEventSource.last.send({ mode: "closed" });

    expect(label.querySelector("acmi-nightmare-room").dataset.state).toBe(
      "closed"
    );
    expect(text(label, ".acmi-nightmare-info__text")).toBe(
      "The Nightmare Room is closed for today."
    );
  });
});
