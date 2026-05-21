// @ts-check
import { effect, signal, computed } from "./signals.js";
import {
  labelSignal,
  playbackSignal,
  lrMode,
  isFilming,
  doorTime,
} from "./context.js";
import "./reverb-timer.js";
import "./interactive-icon.js";
import "./listening-bottom.js";
import "./listening-top.js";

const LR_POLL_INTERVAL_MS = 60_000;

class DigitalLabel extends HTMLElement {
  static observedAttributes = ["data-label-json", "data-override-title"];

  /** @type {Array<() => void>} */
  #cleanups = [];

  /** @type {import('./signals.js').Signal<string>} */
  #overrideTitle = signal("");

  connectedCallback() {
    this.titleElem = this.querySelector(".title");
    this.authorElem = this.querySelector(".author");
    this.contentElem = this.querySelector(".body-copy");
    this.creditLineElem = this.querySelector(".credit-line");
    this.timer = this.querySelector("acmi-reverb-timer");
    this.qrBlock = this.querySelector("acmi-qr-block");
    this.lrBottomBlock = this.querySelector("acmi-listening-room-bottom");

    const mqttSync = this.closest("acmi-mqtt-sync");
    if (!mqttSync?.hasAttribute("data-xos-media-player")) {
      this.timer?.setAttribute("data-hidden", "");
    }

    this.#cleanups.push(this.#wireLabelContent());
    this.#cleanups.push(this.#wirePlayback());

    if (this.getAttribute("data-label-mode") === "listening-room") {
      this.#setupListeningRoom();
    }
  }

  disconnectedCallback() {
    this.#cleanups.forEach((cleanup) => cleanup());
    this.#cleanups = [];
  }

  attributeChangedCallback(name, _, newValue) {
    if (name === "data-label-json") {
      try {
        labelSignal.value = JSON.parse(newValue);
      } catch {
        // malformed JSON — do not throw
      }
    }
    if (name === "data-override-title") {
      this.#overrideTitle.value = newValue ?? "";
    }
  }

  /** @returns {() => void} */
  #wireLabelContent() {
    return effect([labelSignal, this.#overrideTitle], () => {
      const label = labelSignal.value;
      if (!label?.playlist_labels?.[0]) return;

      const firstItem = label.playlist_labels[0];
      const { work } = firstItem.label;
      const overrideTitle = this.#overrideTitle.value;

      if (this.titleElem) {
        this.titleElem.textContent = overrideTitle || label.title;
      }

      if (this.authorElem) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = work.creator_credit_for_label ?? "";
        this.authorElem.textContent = tempDiv.textContent;
      }

      if (this.contentElem) {
        this.contentElem.innerHTML = firstItem.label.columns[0].content;
      }

      if (this.creditLineElem) {
        const workTitleHtml = overrideTitle ? `<p>${work.title}</p>` : "";
        this.creditLineElem.innerHTML =
          workTitleHtml + (work.headline_credit_for_label ?? "");
      }

      if (this.lrBottomBlock && label.qr_lr) {
        this.lrBottomBlock.setSVGText(label.qr_lr);
      }

      if (this.qrBlock) {
        const qrSvg = label.qr_text ?? "";
        if (qrSvg) {
          this.qrBlock.setAttribute("data-qr-svg", qrSvg);
        } else {
          this.qrBlock.removeAttribute("data-qr-svg");
        }
      }
    });
  }

  /** @returns {() => void} */
  #wirePlayback() {
    return effect([playbackSignal], () => {
      const playback = playbackSignal.value;
      if (!playback || !this.timer) return;
      this.timer.setAttribute("data-video-duration", String(playback.duration));
      this.timer.setAttribute(
        "data-video-start-time",
        String(playback.startTime)
      );
    });
  }

  #setupListeningRoom() {
    const parentId = computed(
      () => labelSignal.value?.LISTENING_ROOM_PARENT_ID ?? null,
      [labelSignal]
    );

    // Keep as string, not boolean — assigned directly to lrMode.
    const modeOverride = computed(
      () => labelSignal.value?.LISTENING_ROOM_MODE_OVERRIDE ?? null,
      [labelSignal]
    );

    this.#cleanups.push(
      effect([lrMode], () => {
        this.setAttribute("data-lr-mode", lrMode.value);
      })
    );
    this.#cleanups.push(
      effect([isFilming], () => {
        if (isFilming.value) {
          this.setAttribute("data-is-filming", "");
        } else {
          this.removeAttribute("data-is-filming");
        }
      })
    );

    /** @type {number | null} */
    let pollHandle = null;
    /** @type {boolean} */
    let cancelled = false;

    const clearPoll = () => {
      cancelled = true;
      if (pollHandle !== null) {
        window.clearInterval(pollHandle);
        pollHandle = null;
      }
    };

    this.#cleanups.push(
      effect([parentId], () => {
        clearPoll();
        cancelled = false;
        const pid = parentId.value;
        if (!pid) return;

        import("./eventTimeManager.mjs").then(async (evd) => {
          if (cancelled) return;

          const manager = await evd.default.create(pid);
          if (cancelled) return;

          /** @type {import('./eventTimeManager.mjs').EventEntry[]} */
          const {events} = manager;

          const customStart =
            labelSignal.value?.LISTENING_ROOM_CUSTOM_EVENT_START_TIME;
          if (customStart) {
            events.push({
              tags: [],
              // eslint-disable-next-line no-undef
              time: Temporal.Instant.from(customStart).toZonedDateTimeISO(
                "Australia/Melbourne"
              ),
              title: "CustomEvent",
            });
          }

          const tick = () => {
            const timeOverride =
              labelSignal.value?.LISTENING_ROOM_TIME_OVERRIDE;
            // eslint-disable-next-line no-undef
            const now = timeOverride
              ? Temporal.Instant.from(timeOverride)
              : Temporal.Now.instant();

            const data = evd.getMode(now, events);

            if (data.mode !== "normal") {
              console.log(
                `it's ${now.toLocaleString()}, currently in mode: ${
                  data.mode
                } for event ${data.title}${
                  data.filmed ? " which is being filmed" : ""
                }`
              );
            } else {
              console.log(
                `it's ${now.toLocaleString()}, currently in mode: ${data.mode}`
              );
            }

            lrMode.value = modeOverride.value ?? data.mode;
            isFilming.value = data.filmed;
            doorTime.value = data.doorTime;
          };

          tick();
          pollHandle = window.setInterval(tick, LR_POLL_INTERVAL_MS);
        });

        return clearPoll;
      })
    );
  }
}

customElements.define("acmi-digital-label", DigitalLabel);
