import { computed, signal } from "./signals.js";
/**
 * ReverbTimer — Custom element that displays an SVG ring countdown timer.
 *
 * Renders a circular progress indicator with elapsed time (MM:SS) and a
 * duration subtitle. Driven by two data attributes:
 *
 *   - `data-video-duration`   — total duration in milliseconds
 *   - `data-video-start-time` — timestamp (ms since epoch) when playback started
 *   - `data-hidden`           — when present, hides the timer (sets visibility: hidden)
 *
 * Elapsed time is calculated as `(Date.now() - startTime) % duration` so the
 * timer loops automatically. The SVG ring progress and text are updated every
 * frame via requestAnimationFrame.
 *
 * Expects this internal DOM structure (provided by the parent template):
 *
 *   <acmi-reverb-timer>
 *     <div class="timer">
 *       <svg>…</svg>
 *       <pre class="ticker">00:00</pre>
 *       <p class="subtitle">Duration</p>
 *     </div>
 *   </acmi-reverb-timer>
 *
 * The SVG foreground circle's stroke-dasharray is set via the `--disk-ratio`
 * CSS custom property on the host element.
 */

/**
 * Format minutes and seconds into a human-readable duration string.
 * @param {number} mins
 * @param {number} seconds
 * @returns {string} e.g. "Duration: 3 minutes 25 seconds"
 */
function formatDurationText(mins, seconds) {
  const parts = ["Duration:"];
  if (mins > 0) {
    parts.push(`${mins} minute${mins !== 1 ? "s" : ""}`);
  }
  if (seconds > 0 || mins === 0) {
    parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
  }
  return parts.join(" ");
}
/**
 * Returns milliseconds formatted as remaining minutes
 *
 * @param {number} millis
 * @return {string}
 */
function formatRemainingText(millis) {
  const mins = Math.ceil(millis / 1000 / 60);

  return `Starts again in <br>${mins} ${mins > 1 ? "minutes" : "minute"}`;
}

class ReverbTimer extends HTMLElement {
  static observedAttributes =
    /** @type {const} */
    (["data-video-duration", "data-video-start-time", "data-hidden"]);

  /** Total video duration in milliseconds */
  duration = signal(60 * 1_000);

  /** Playback start timestamp (ms since epoch) */
  startTime = signal(Date.now());

  /** Duration broken into minutes and seconds for display */
  durationData = computed(() => {
    const d = this.duration.value;
    const mins = Math.floor(d / 1_000 / 60);
    const seconds = Math.floor((d % 60_000) / 1_000);
    return { mins, seconds };
  }, [this.duration]);

  /** Current elapsed time in milliseconds (loops at duration) */
  elapsed = signal(0);

  /** Elapsed time broken into minutes and seconds for display */
  elapsedData = computed(() => {
    const d = this.elapsed.value;
    const mins = Math.floor(d / 1_000 / 60);
    const seconds = Math.floor((d / 1_000) % 60);
    return { mins, seconds };
  }, [this.elapsed]);

  /** Progress ratio (0–1) of elapsed / duration */
  ratio = computed(
    () => this.elapsed.value / this.duration.value,
    [this.elapsed, this.duration]
  );

  /** SVG stroke-dasharray value string derived from progress ratio */
  strokeDashes = computed(() => {
    const t = this.ratio.value;
    const positiveLength = (t * 100).toFixed(2);
    const negativeLength = ((1 - t) * 100).toFixed(2);
    return `${positiveLength} ${negativeLength}`;
  }, [this.ratio]);

  connectedCallback() {
    this.elapsedElem = this.querySelector(".ticker");
    this.remainingElem = this.querySelector(".subtitle");

    const update = () => {
      const elapsed = (Date.now() - this.startTime.value) % this.duration.value;
      this.elapsed.value = elapsed;

      // Update SVG ring progress via CSS custom property
      this.style.setProperty("--disk-ratio", this.strokeDashes.value);

      // Update duration text
      const durat = this.durationData.value;
      this.remainingElem.textContent = formatDurationText(
        durat.mins,
        durat.seconds
      );
      this.remainingElem.innerHTML = formatRemainingText(
        Math.max(this.duration.value - elapsed, 1)
      );

      // Update elapsed ticker (MM:SS)
      const elap = this.elapsedData.value;
      this.elapsedElem.textContent = `${elap.mins}:${elap.seconds
        .toString(10)
        .padStart(2, "0")}`;

      this.animationHandler = requestAnimationFrame(update);
    };

    this.animationHandler = requestAnimationFrame(update);
  }

  disconnectedCallback() {
    if (this.animationHandler) {
      cancelAnimationFrame(this.animationHandler);
    }
  }

  attributeChangedCallback(attributeName, _, newValue) {
    if (attributeName === "data-video-duration") {
      this.duration.value = parseFloat(newValue);
    }
    if (attributeName === "data-video-start-time") {
      this.startTime.value = parseFloat(newValue);
    }
    if (attributeName === "data-hidden") {
      this.style.visibility = newValue !== null ? "hidden" : "visible";
    }
  }
}

customElements.define("acmi-reverb-timer", ReverbTimer);
