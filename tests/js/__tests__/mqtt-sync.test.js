/**
 * @jest-environment jsdom
 */
import { playbackSignal } from "../../../app/static/context.js";
import "../../../app/static/mqtt-sync.js";

beforeEach(() => {
  playbackSignal.value = null;
  document.body.innerHTML = "";
  global.EventSource.mockClear();
});

function makeSync(attrs = {}) {
  const elem = document.createElement("acmi-mqtt-sync");
  Object.entries(attrs).forEach(([k, v]) => elem.setAttribute(k, v));
  document.body.appendChild(elem);
  return elem;
}

/** Returns the EventSource instance created by the last makeSync call. */
function lastEventSource() {
  return global.EventSource.mock.results.at(-1).value;
}

describe("acmi-mqtt-sync", () => {
  describe("Opens SSE connection when data-xos-media-player is set", () => {
    it("creates EventSource to /api/playback-stream/", () => {
      makeSync({ "data-xos-media-player": "123" });

      expect(global.EventSource).toHaveBeenCalledWith("/api/playback-stream/");
    });
  });

  describe("SSE message updates playbackSignal", () => {
    it("parses message and writes duration/startTime to playbackSignal", () => {
      makeSync({ "data-xos-media-player": "123" });

      const es = lastEventSource();
      const before = Date.now();
      es.onmessage({
        data: JSON.stringify({ duration: 60000, playback_position: 0.5 }),
      });
      const after = Date.now();

      expect(playbackSignal.value.duration).toBe(60000);
      expect(playbackSignal.value.startTime).toBeGreaterThanOrEqual(
        before - 30000
      );
      expect(playbackSignal.value.startTime).toBeLessThanOrEqual(after - 30000);
    });
  });

  describe("SSE message without a duration or position", () => {
    it("leaves playbackSignal as it was", () => {
      makeSync({ "data-xos-media-player": "123" });

      const es = lastEventSource();
      es.onmessage({
        data: JSON.stringify({ duration: null, playback_position: 0.5 }),
      });
      es.onmessage({ data: JSON.stringify({ duration: 60000 }) });
      es.onmessage({ data: "not json" });

      expect(playbackSignal.value).toBeNull();
    });
  });

  describe("SSE closed by an error response", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      global.EventSource.CLOSED = 2;
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("opens the stream again after 5 seconds", () => {
      makeSync({ "data-xos-media-player": "123" });
      const es = lastEventSource();

      es.readyState = 2;
      es.onerror();
      expect(global.EventSource).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5000);
      expect(global.EventSource).toHaveBeenCalledTimes(2);
      expect(es.close).toHaveBeenCalled();
    });

    it("leaves a stream the browser is reconnecting itself", () => {
      makeSync({ "data-xos-media-player": "123" });
      const es = lastEventSource();

      es.readyState = 0;
      es.onerror();
      jest.advanceTimersByTime(5000);

      expect(global.EventSource).toHaveBeenCalledTimes(1);
    });

    it("does not open it again once the element is removed", () => {
      const elem = makeSync({ "data-xos-media-player": "123" });
      const es = lastEventSource();

      es.readyState = 2;
      es.onerror();
      document.body.removeChild(elem);
      jest.advanceTimersByTime(5000);

      expect(global.EventSource).toHaveBeenCalledTimes(1);
    });
  });

  describe("Override duration sets playbackSignal without SSE", () => {
    it("writes playbackSignal from data-override-duration when no media player set", () => {
      makeSync({ "data-override-duration": "60000" });

      expect(playbackSignal.value.duration).toBe(60000);
      expect(global.EventSource).not.toHaveBeenCalled();
    });
  });

  describe("EventSource closed on disconnect", () => {
    it("closes the EventSource when element is removed", () => {
      const elem = makeSync({ "data-xos-media-player": "123" });
      const es = lastEventSource();

      document.body.removeChild(elem);

      expect(es.close).toHaveBeenCalled();
    });
  });

  describe("No connection when data-xos-media-player absent", () => {
    it("does not create EventSource when data-xos-media-player is not set", () => {
      makeSync({});

      expect(global.EventSource).not.toHaveBeenCalled();
    });
  });
});
