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
];

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

  /**
   * Reactive state for each observed data attribute.
   * @type {Record<string, import("./signals.js").Signal<string>>}
   */
  dataState = {};

  /** Timer parameters derived from MQTT playback messages */
  timerParams = signal({
    videoStartTime: Date.now(),
    videoDuration: 60 * 1_000,
  });

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

      this.titleElem.textContent = label.title;

      const authorParts = [work.creator_credit, work.headline_credit].filter(
        Boolean
      );
      this.authorElem.textContent = authorParts.join(", ");

      this.contentElem.innerHTML = firstItem.label.columns[0].content;
      this.creditLineElem.innerHTML = work.credit_line;
    });

    // Connect to MQTT if media player is not being ignored
    effect(() => {
      if (!this.dataState["data-ignore-media-player"].get()) {
        this.connectToMQTT();
      }
    });

    // Forward timer parameters to the child timer element
    effect(() => {
      if (this.timer) {
        const { videoDuration, videoStartTime } = this.timerParams.get();
        this.timer.dataset.videoDuration = videoDuration;
        this.timer.dataset.videoStartTime = videoStartTime;
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
    this.timerParams.set({
      videoStartTime: startTime,
      videoDuration: duration,
    });
  }
}

customElements.define("acmi-digital-label", DigitalLabel);
