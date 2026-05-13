import { playbackSignal } from "./context.js";

class MQTTSync extends HTMLElement {
  static observedAttributes = [
    "data-xos-media-player",
    "data-override-duration",
  ];

  /** @type {EventSource | null} */
  eventSource = null;

  connectedCallback() {
    const overrideDuration = parseFloat(
      this.getAttribute("data-override-duration")
    );
    if (!Number.isNaN(overrideDuration)) {
      playbackSignal.value = {
        duration: overrideDuration,
        startTime: Date.now(),
      };
    }

    if (this.getAttribute("data-xos-media-player")) {
      this.connectSSE();
    }
  }

  disconnectedCallback() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  attributeChangedCallback(name, _, newValue) {
    // data-xos-media-player is only read at connectedCallback time; runtime changes are not supported.
    if (name === "data-override-duration") {
      const d = parseFloat(newValue);
      if (!Number.isNaN(d)) {
        playbackSignal.value = { duration: d, startTime: Date.now() };
      }
    }
  }

  connectSSE() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource("/api/playback-stream/");

    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const { duration, playback_position: playbackPosition } = data;
      const startTime = Date.now() - duration * playbackPosition;
      playbackSignal.value = { duration, startTime };
    };

    this.eventSource.onerror = (e) => {
      // EventSource automatically reconnects after errors — no manual retry needed.
    };
  }
}

customElements.define("acmi-mqtt-sync", MQTTSync);
