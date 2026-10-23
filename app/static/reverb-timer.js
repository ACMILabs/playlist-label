import { computed, signal } from "./signals.js";

/**
 * @param {number} millis
 * @return {string}
 */
function formatRemainingText(millis) {
  const mins = Math.ceil(millis / 1000 / 60);

  return `Starts again in <br>${mins} ${mins > 1 ? "minutes" : "minute"}`;
}

/**
 * Ring timer for a looping video. `data-video-duration` (ms) and
 * `data-video-start-time` (ms since epoch) drive it; `data-hidden` hides it.
 * The template supplies the svg, `.countdown` and `.next-start-time`.
 */
class ReverbTimer extends HTMLElement {
  static observedAttributes =
    /** @type {const} */
    (["data-video-duration", "data-video-start-time", "data-hidden"]);

  duration = signal(60 * 1_000);

  startTime = signal(Date.now());

  remainingHtml = "";

  elapsed = signal(0);

  elapsedData = computed(() => {
    const d = this.elapsed.value;
    const mins = Math.floor(d / 1_000 / 60);
    const seconds = Math.floor((d / 1_000) % 60);
    return { mins, seconds };
  }, [this.elapsed]);

  ratio = computed(
    () => this.elapsed.value / this.duration.value,
    [this.elapsed, this.duration]
  );

  strokeDashes = computed(() => {
    const t = this.ratio.value;
    const positiveLength = (t * 100).toFixed(2);
    const negativeLength = ((1 - t) * 100).toFixed(2);
    return `${positiveLength} ${negativeLength}`;
  }, [this.ratio]);

  connectedCallback() {
    this.elapsedElem = this.querySelector(".countdown");
    this.remainingElem = this.querySelector(".next-start-time");

    const update = () => {
      // The next frame first, so one that throws does not stop the clock.
      this.animationHandler = requestAnimationFrame(update);

      // Until the player says how long and from when, it would read "NaN:NaN".
      const duration = this.duration.value;
      if (!(duration > 0) || !Number.isFinite(this.startTime.value)) return;

      const elapsed = (Date.now() - this.startTime.value) % duration;
      this.elapsed.value = elapsed;

      this.style.setProperty("--disk-ratio", this.strokeDashes.value);

      // Both lines change once a second at most, so are written only then.
      const remaining = formatRemainingText(Math.max(duration - elapsed, 1));
      if (remaining !== this.remainingHtml) {
        this.remainingHtml = remaining;
        this.remainingElem.innerHTML = remaining;
      }

      const elap = this.elapsedData.value;
      const ticker = `${elap.mins}:${elap.seconds
        .toString(10)
        .padStart(2, "0")}`;
      if (this.elapsedElem.textContent !== ticker) {
        this.elapsedElem.textContent = ticker;
      }
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
