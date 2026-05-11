// @ts-check
import { effect, signal } from "./signals.js";
import { labelSignal, playbackSignal } from "./context.js";
import "./reverb-timer.js";
import "./interactive-icon.js";

class DigitalLabel extends HTMLElement {
  static observedAttributes = ["data-label-json", "data-override-title"];

  /** @type {Array<() => void>} */
  #cleanups = [];

  // Starts empty; attributeChangedCallback sets the real value before connectedCallback's effect fires.
  // Cannot call this.getAttribute here — HTMLElement internals not ready during class-field init.
  /** @type {import('./signals.js').Signal<string>} */
  #overrideTitle = signal("");

  connectedCallback() {
    this.titleElem = this.querySelector(".title");
    this.authorElem = this.querySelector(".author");
    this.contentElem = this.querySelector(".content");
    this.creditLineElem = this.querySelector(".credit-line");
    this.timer = this.querySelector("acmi-reverb-timer");
    this.qrBlock = this.querySelector("acmi-qr-block");

    const mqttSync = this.closest("acmi-mqtt-sync");
    if (!mqttSync?.hasAttribute("data-xos-media-player")) {
      this.timer?.setAttribute("data-hidden", "");
    }

    this.#cleanups.push(
      effect([labelSignal, this.#overrideTitle], () => {
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

        if (this.qrBlock) {
          const qrSvg = label.qr_text ?? "";
          if (qrSvg) {
            this.qrBlock.setAttribute("data-qr-svg", qrSvg);
          } else {
            this.qrBlock.removeAttribute("data-qr-svg");
          }
        }
      })
    );

    this.#cleanups.push(
      effect([playbackSignal], () => {
        const playback = playbackSignal.value;
        if (!playback || !this.timer) return;
        this.timer.setAttribute(
          "data-video-duration",
          String(playback.duration)
        );
        this.timer.setAttribute(
          "data-video-start-time",
          String(playback.startTime)
        );
      })
    );
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
}

customElements.define("acmi-digital-label", DigitalLabel);
