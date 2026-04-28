/**
 * DigitalLabel — Custom element that displays an ACMI playlist label with
 * real-time MQTT playback updates.
 *
 * This is the main controller for the reverb-digital-label template. It:
 *
 *   1. Reads playlist data from its `data-label-json` attribute
 *   2. Renders the current label's title, author, content, and credit
 *   3. Connects to an MQTT broker to receive playback position updates
 *   4. Feeds elapsed/duration data to a child <acmi-reverb-timer> element
 *
 * Configuration is passed via data attributes set by the Jinja template:
 *
 *   - data-id                   — XOS playlist ID
 *   - data-label-id             — current label ID
 *   - data-label-json           — full playlist JSON (stringified)
 *   - data-mqtt-host            — MQTT broker hostname
 *   - data-mqtt-port            — MQTT broker WebSocket port
 *   - data-mqtt-username        — MQTT credentials
 *   - data-mqtt-password        — MQTT credentials
 *   - data-xos-endpoint         — XOS API base URL
 *   - data-xos-media-player     — media player ID to subscribe to
 *   - data-ignore-media-player  — if present, skip MQTT connection
 *   - data-override-duration    — if present (ms), initialise timer before MQTT arrives
 *   - data-override-title       — if present, display instead of playlist title
 */
import { computed, effect, signal } from "./signals.js";
import "./reverb-timer.js";

/** @type {const} */
const OBSERVED_ATTRIBUTES = [
  "data-label-json",
  "data-id",
  "data-label-id",
  "data-mqtt-host",
  "data-mqtt-port",
  "data-mqtt-username",
  "data-mqtt-password",
  "data-xos-endpoint",
  "data-xos-media-player",
  "data-ignore-media-player",
  "data-override-duration",
  "data-override-title",
];
const SECOND = 1_000;
const MINUTE = 60 * SECOND;
/**
 * milliseconds into a human-readable duration string.
 * @param {number} millis
 * @returns {string} e.g. "Duration: 3 minutes 25 seconds"
 */
function formatDurationText(millis) {
  const seconds = Math.floor((millis % MINUTE) / SECOND);
  const mins = Math.floor(millis / MINUTE);
  const parts = ["Duration:"];
  if (mins > 0) {
    parts.push(`${mins} minute${mins !== 1 ? "s" : ""}`);
  }
  if (seconds > 0 || mins === 0) {
    parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
  }
  return parts.join(" ");
}

class DigitalLabel extends HTMLElement {
  static observedAttributes = OBSERVED_ATTRIBUTES;

  /** @type {Element | null} */
  titleElem = this.querySelector(".title");

  /** @type {Element | null} */
  authorElem = this.querySelector(".author");

  /** @type {Element | null} */
  contentElem = this.querySelector(".content");

  /** @type {Element | null} */
  creditLineElem = this.querySelector(".credit-line");

  /** @type {Element | null} */
  durationLineElem = this.querySelector(".duration");

  /**
   * Reactive state for each observed data attribute.
   * @type {Record<string, import("./signals.js").Signal<string>>}
   */
  dataState = {};

  /** @type {Paho.MQTT.Client | null} */
  client = null;

  constructor() {
    super();
    // Initialise a reactive signal for each observed attribute
    DigitalLabel.observedAttributes.forEach((attr) => {
      this.dataState[attr] = signal(this.getAttribute(attr));
    });

    /** Parsed playlist JSON, recomputed when data-label-json changes */
    this.label = computed(() =>
      JSON.parse(this.dataState["data-label-json"]?.get())
    );

    this.id = signal(this.dataset.labelId);
  }

  /**
   * Connect (or reconnect) to the MQTT broker and subscribe to the
   * media player's playback topic.
   */
  connectToMQTT() {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        // Already disconnected — ignore
      }
    }

    // eslint-disable-next-line no-undef
    this.client = new Paho.MQTT.Client(
      this.dataState["data-mqtt-host"].get(),
      parseInt(this.dataState["data-mqtt-port"].get(), 10),
      "/ws",
      ""
    );

    this.client.onConnectionLost = (responseObject) => {
      if (responseObject.errorCode !== 0) {
        console.error(`MQTT connection lost: ${responseObject.errorMessage}`); // eslint-disable-line no-console
      }
      this.connectToMQTT();
    };

    this.client.onMessageArrived = (message) => {
      this.receivedMessage(message);
    };

    this.client.connect({
      userName: this.dataState["data-mqtt-username"].get(),
      password: this.dataState["data-mqtt-password"].get(),
      onSuccess: () => {
        const channel = `mediaplayer.${this.dataState[
          "data-xos-media-player"
        ].get()}`;
        this.client.subscribe(channel);
      },
      onFailure: () => {
        this.connectToMQTT();
      },
    });
  }

  connectedCallback() {
    this.timer = this.querySelector("acmi-reverb-timer");

    // Update DOM when label data changes
    effect(() => {
      const label = this.label.get();
      const firstItem = label.playlist_labels[0];
      const { work } = firstItem.label;

      // Title: use override if set, else playlist title
      const overrideTitle = this.dataState["data-override-title"].get();
      this.titleElem.textContent = overrideTitle || label.title;

      // Author: creator_credit_for_label is trusted HTML (e.g. "<p>Name, Year</p>")
      // Extract text since authorElem is a <p> and nesting <p> is invalid
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = work.creator_credit_for_label ?? "";
      this.authorElem.textContent = tempDiv.textContent;


      this.contentElem.innerHTML = firstItem.label.columns[0].content;

      // Credit line: headline_credit_for_label, optionally preceded by work title
      const workTitleHtml = overrideTitle ? `<p>${work.title}</p>` : "";
      this.creditLineElem.innerHTML =
        workTitleHtml + (work.headline_credit_for_label ?? "");
    });

    // Initialise timer from override-duration if set (MQTT may later override)
    effect(() => {
      const overrideDuration = parseFloat(
        this.dataState["data-override-duration"].get()
      );
      if (overrideDuration && this.timer) {
        this.timer.dataset.videoDuration = overrideDuration;
        this.timer.dataset.videoStartTime = Date.now();
        this.durationLineElem.textContent = formatDurationText(overrideDuration);
      }
    });

    // Connect to MQTT if media player is not being ignored
    effect(() => {
      if (!this.dataState["data-ignore-media-player"].get()) {
        this.connectToMQTT();
      }
    });
  }

  /**
   * Sync reactive signal state when attributes are set externally.
   */
  attributeChangedCallback(attributeName, _, newValue) {
    if (attributeName in this.dataState) {
      /** @type {ReturnType<typeof signal>} */ (
        this.dataState[attributeName]
      ).set(newValue);
    }
  }

  /**
   * Handle an incoming MQTT playback message. Extracts duration and
   * playback_position to compute a synthetic start time for the timer.
   *
   * @param {Paho.MQTT.Message} message — MQTT message with JSON payload
   *   containing `duration` (ms) and `playback_position` (0–1 float)
   */
  receivedMessage(message) {
    const data = JSON.parse(message.payloadString);
    const { duration } = data;
    const elapsedDuration = duration * data.playback_position;
    const startTime = Date.now() - elapsedDuration;

    if (this.durationLineElem) {
      this.durationLineElem.textContent = formatDurationText(duration);
    }

    if (this.timer) {
      this.timer.dataset.videoDuration = duration;
      this.timer.dataset.videoStartTime = startTime;
    }
  }
}

customElements.define("acmi-digital-label", DigitalLabel);

const interactiveIconText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -37 256 256">
  <path fill="currentColor" d="M158.23 0c-38.72 0-71.8 24.22-85.11 58.28q-2.03.5-3.9 1.69l-3.97 2.83a12.8 12.8 0 0 0-3.2-7.48c-4.28-4.78-11.8-5.6-17.54-1.85-1.39.99-34.07 24.3-37.71 27.66C2.78 84.83.36 93.35.1 94.31a2.68 2.68 0 1 0 5.18 1.42c.56-2.05 2.7-8.4 5.16-10.65 2.82-2.6 27.8-20.54 37.1-27.17 3.46-2.26 7.98-1.82 10.52 1 1.86 2.08 2.35 5.26 1.3 8.09L38.02 82.05a2.67 2.67 0 0 0 .42 4.63c.83.39 1.86.33 2.67-.25l22-15.51 9.14-6.52c3-1.98 7-1.43 9.27 1.26a7.1 7.1 0 0 1 .15 8.83L49.06 97.81a2.68 2.68 0 1 0 3.12 4.37L85.17 78.6q.02 0 .04-.03t.05-.03l5.12-4a7.94 7.94 0 0 1 9.53 2.26c2.37 3.17 1.78 7.9-1.3 10.59l-38.47 26.14a2.7 2.7 0 0 0 3.02 4.44l37.98-25.8a7.9 7.9 0 0 1 6.94 3.96c1.6 2.88.71 5.86.23 7.04L64 134.68a2.7 2.7 0 0 0 3.11 4.38l9.43-6.7a91 91 0 0 0 6.62 11.1l-7.81 5.47-.11.09c-2.57 2-8 5.46-15.5 6.02a28.7 28.7 0 0 1-14.97-2.97 2.6 2.6 0 0 0-2.73.19l-19.03 13.13a2.68 2.68 0 1 0 3.05 4.42l17.76-12.25a34 34 0 0 0 16.32 2.83 34.5 34.5 0 0 0 18.34-7.1l7.86-5.5a91.2 91.2 0 0 0 71.88 35.07c50.41 0 91.43-41.01 91.43-91.42S208.64 0 158.23 0M93.1 68.45c-1.54.07-3.09.42-4.56 1.03q-.09-1.2-.4-2.37c10.11-29.02 37.66-49.93 70.09-49.93 40.94 0 74.25 33.3 74.25 74.26s-33.31 74.25-74.25 74.25c-29.95 0-55.76-17.84-67.5-43.42l6.9-4.92c10.1 23.52 33.41 40.09 60.6 40.09 36.39 0 66-29.61 66-66s-29.61-66.01-66-66.01c-28.31 0-52.46 17.93-61.81 43.02zm9.02 2.96-1.62-1.04c8.62-23.56 31.22-40.45 57.73-40.45 33.91 0 61.5 27.6 61.5 61.52s-27.59 61.5-61.5 61.5c-25.68 0-47.64-15.86-56.82-38.27l6.89-4.9a53.3 53.3 0 0 0 49.93 34.92c29.36 0 53.26-23.89 53.26-53.25s-23.9-53.26-53.26-53.26c-25.06 0-46.06 17.41-51.7 40.76a12.7 12.7 0 0 0-4.41-7.53m10.65 22.11a13 13 0 0 0-3.21-3.8 48.8 48.8 0 0 1 48.67-47.05c26.88 0 48.75 21.88 48.75 48.77s-21.87 48.75-48.75 48.75a48.8 48.8 0 0 1-46.14-33.16q.46-.34.73-.83c.35-.66 3.32-6.64-.05-12.68m45.46 85c-34.25 0-63.87-19.9-78.09-48.72l4.38-3.12 2.52-1.78c12.6 26.72 39.73 45.29 71.19 45.29 43.42 0 78.75-35.33 78.75-78.75s-35.33-78.77-78.75-78.77c-32.97 0-61.17 20.43-72.88 49.24a12.2 12.2 0 0 0-7.44-3.94c13.15-31.44 44.16-53.63 80.32-53.63 48.02 0 87.08 39.07 87.08 87.1s-39.06 87.08-87.08 87.08"/>
</svg>
`

class InteractiveIcon extends HTMLElement {
  connectedCallback() {
    this.setHTMLUnsafe(interactiveIconText)
  }
}

customElements.define('acmi-interactive-icon',InteractiveIcon)