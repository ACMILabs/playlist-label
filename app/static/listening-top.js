// @ts-check
import { effect } from "./signals.js";
import { lrMode, isFilming, doorTime } from "./context.js";

const RECORDING_NOTICE = "Please be aware this session is audio recorded";
const FILMING_NOTICE = "Please be aware this session is being filmed";
const lastminuteChange =
  "Please be aware this session will be photographed and filmed";

class ListeningRoomTop extends HTMLElement {
  /** @type {Array<() => void>} */
  #cleanups = [];

  connectedCallback() {
    this.#cleanups.push(
      effect([lrMode, isFilming, doorTime], () =>
        document.startViewTransition(() => this.#render())
      )
    );
  }

  disconnectedCallback() {
    this.#cleanups.forEach((c) => c());
    this.#cleanups = [];
  }

  #render() {
    const mode = lrMode.value;
    const filmed = isFilming.value;
    const door = doorTime.value;

    switch (mode) {
      case "closed":
        this.setHTMLUnsafe(
          this.#renderWithSubtitles({
            title: "LISTENING ROOM CLOSED",
            doorTimeText: this.#formatDoorTime(door),
            recordingNotice: Temporal.PlainDate.from("2026-05-22").equals(
              Temporal.Now.plainDateISO()
            )
              ? lastminuteChange
              : filmed
              ? FILMING_NOTICE
              : RECORDING_NOTICE,
          })
        );
        break;

      case "doors":
        this.setHTMLUnsafe(
          this.#renderWithSubtitles({
            title: "SESSION WILL BEGIN SOON",
            doorTimeText: this.#formatDoorTime(door),
            recordingNotice: Temporal.PlainDate.from("2026-05-22").equals(
              Temporal.Now.plainDateISO()
            )
              ? lastminuteChange
              : filmed
              ? FILMING_NOTICE
              : RECORDING_NOTICE,
            doors: true,
          })
        );
        break;

      case "eventRunning":
        this.setHTMLUnsafe(`
          <div class="lr-top">
            <h2 class="lr-top-title">SESSION IS IN PROGRESS</h2>
            <p class="lr-top-recording no-entry">Please do not enter</p>
          </div>
        `);
        break;

      case "normal":
      default:
        this.setHTMLUnsafe(`<acmi-interactive-icon></acmi-interactive-icon>`);
        break;
    }
  }

  /** @param {{ title: string; doorTimeText: string; recordingNotice: string }} props @returns {string} */
  #renderWithSubtitles({
    title,
    doorTimeText,
    recordingNotice,
    doors = false,
  }) {
    return `
      <div class="lr-top">
        <h2 class="lr-top-title">${title}</h2>
        ${
          doors
            ? ``
            : `<p class="lr-top-doors">We are preparing for a session</p><p class="lr-top-doors">Doors will open for ticket holders at ${doorTimeText}
        </p>`
        }
        <p class="lr-top-recording">${recordingNotice}</p>
      </div>
    `;
  }

  /** @param {Temporal.ZonedDateTime | null} dt @returns {string} */
  #formatDoorTime(dt) {
    if (!dt) return "—";
    try {
      return `${dt.hour % 12}.${dt.minute}${dt.hour >= 12 ? "pm" : "am"}`;
    } catch {
      return "—";
    }
  }
}

customElements.define("acmi-listening-room-top", ListeningRoomTop);
