import { playbackSignal } from "./context.js";

const RECONNECT_AFTER_MS = 5000;

class MQTTSync extends HTMLElement {
  static observedAttributes = ["data-override-duration"];

  /** @type {EventSource | null} */
  eventSource = null;

  /** @type {number | undefined} */
  reconnectHandle = undefined;

  connectedCallback() {
    this.#overrideDuration(this.getAttribute("data-override-duration"));
    if (this.getAttribute("data-xos-media-player")) {
      this.connectSSE();
    }
  }

  disconnectedCallback() {
    window.clearTimeout(this.reconnectHandle);
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  attributeChangedCallback(name, _, newValue) {
    if (name === "data-override-duration") this.#overrideDuration(newValue);
  }

  /** @param {string | null} value */
  #overrideDuration(value) {
    const duration = parseFloat(value);
    if (!Number.isNaN(duration)) {
      playbackSignal.value = { duration, startTime: Date.now() };
    }
  }

  connectSSE() {
    window.clearTimeout(this.reconnectHandle);
    if (this.eventSource) {
      this.eventSource.close();
    }

    const source = new EventSource("/api/playback-stream/");
    this.eventSource = source;

    source.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      // Without a duration and a position the timer would read NaN.
      const { duration, playback_position: playbackPosition } = data ?? {};
      if (!(duration > 0) || !Number.isFinite(playbackPosition)) return;
      const startTime = Date.now() - duration * playbackPosition;
      playbackSignal.value = { duration, startTime };
    };

    // The browser reopens a dropped stream by itself, but gives up for good
    // on an error response (a 500 while the server restarts, say). The kiosk
    // is never reloaded, so open it again here.
    source.onerror = () => {
      if (this.eventSource !== source) return;
      if (source.readyState !== EventSource.CLOSED) return;
      this.reconnectHandle = window.setTimeout(
        () => this.connectSSE(),
        RECONNECT_AFTER_MS
      );
    };
  }
}

customElements.define("acmi-mqtt-sync", MQTTSync);
