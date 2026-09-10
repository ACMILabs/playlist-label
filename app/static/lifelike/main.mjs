/**
 * The gallery 2 label, as custom elements.
 *
 * Every component the vue build had is here, in the order they must be
 * defined: a parent renders its children in `setup`, so a child has to be a
 * registered element before the parent ever runs. `acmi-gallery-2-label` is
 * therefore last.
 *
 * The elements render into the light dom. No shadow roots, no adopted
 * stylesheets: every rule lives in `style.css`, which the page links once.
 */

import { define } from "nanotags";

import * as icons from "./icons.mjs";
import { timerDisplayStore, playbackSnapshotStore } from "./timerDisplayStore.mjs";

// ---- Reading json props ----

/**
 * A standard schema for `f.json()` that never rejects. `parseWithSchema`
 * throws on an issue, and a label that throws shows nothing at all, so bad
 * data degrades to the fallback instead: the error screen is how this label
 * says it has nothing to show.
 *
 * @template T
 * @param {(value: unknown) => T} coerce
 * @returns {import("@standard-schema/spec").StandardSchemaV1<unknown, T>}
 */
function lenient(coerce) {
  return {
    "~standard": {
      version: 1,
      vendor: "acmi",
      validate: (value) => ({ value: coerce(value) }),
    },
  };
}

/**
 * The rows below the body copy: an icon each, and the text beside it.
 *
 * @param {unknown} value
 * @returns {{ icon: string, text: string }[]}
 */
function toInfoBlocks(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (block) =>
      typeof block?.icon === "string" && typeof block?.text === "string",
  );
}

/**
 * Everything the timer draws. All strings, all ready to render.
 *
 * @param {unknown} value
 * @returns {TimerDisplay | null}
 */
function toTimer(value) {
  if (typeof value !== "object" || value === null) return null;
  const { ratio, elapsed, restart } = /** @type {Record<string, any>} */ (value);
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return null;
  return {
    ratio,
    elapsed: String(elapsed ?? ""),
    restart: String(restart ?? ""),
  };
}

// The schema only guards the json island and the attribute. Setting the
// property writes to the store untouched, so the components coerce again on
// the way out — the two together are what make every path safe.
const InfoBlocksSchema = lenient(toInfoBlocks);
const TimerSchema = lenient(toTimer);

// ---- Small dom helpers ----

/**
 * Writes text only when it changed. The timer runs at sixty frames a second
 * and its two lines change about once a second, so this keeps the frames the
 * ring needs from rewriting text that has not moved.
 *
 * @param {Element} element
 * @param {string} value
 */
function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

/**
 * Shows the element and fills it with `html`, or hides it when there is
 * nothing to show. The markup comes from the cms, which is why it goes in as
 * html — the same call the vue components made with `v-html`.
 *
 * @param {HTMLElement} element
 * @param {string} html
 */
function setHtml(element, html) {
  element.hidden = !html;
  element.innerHTML = html;
}

// ---- The components ----

/**
 * One icon from the set, drawn as inline svg so it takes the colour and the
 * size around it. Decorative: whatever it means is in the text beside it.
 */
define("acmi-icon")
  .withProps((f) => ({
    name: f.string(""),
  }))
  .setup((c) => {
    c.host.setAttribute("aria-hidden", "true");

    c.effect(c.props.$name, (name) => {
      const markup = Object.hasOwn(icons, name) ? icons[name] : undefined;
      if (name && !markup) console.error(`[acmi-label] no icon named "${name}"`);

      c.host.hidden = !markup;
      c.host.innerHTML = markup ?? "";
    });
  });

/**
 * The work's title, and who made it. Named `heading` because `title` is a
 * built-in global attribute — the tooltip — and custom element attributes
 * share that namespace.
 */
define("acmi-title-block")
  .withProps((f) => ({
    heading: f.string(""),
    credit: f.string(""),
  }))
  .setup((c) => {
    c.host.innerHTML = `
    <h1 class="acmi-title-block__heading"></h1>
    <p class="acmi-title-block__credit"></p>
    `;

    const credit = c.getElement("p");
    const heading = c.getElement("h1");

    c.effect(c.props.$credit, (value) => setHtml(credit, value));
    c.effect(c.props.$heading, (value) => {
      setHtml(heading, value);
      c.host.hidden = !value;
    });
  });

/** When the work shows, and the line under it. */
define("acmi-dates-block")
  .withProps((f) => ({
    dates: f.string(""),
    billing: f.string(""),
  }))
  .setup((c) => {
    c.host.innerHTML = `
      <p class="acmi-dates-block__dates"></p>
      <p class="acmi-dates-block__billing"></p>
    `;

    const dates = c.getElement(".acmi-dates-block__dates");
    const billing = c.getElement(".acmi-dates-block__billing");

    c.effect(c.props.$dates, (value) => {
      setText(dates, value);
      c.host.hidden = !value;
    });
    c.effect(c.props.$billing, (value) => {
      setText(billing, value);
      billing.hidden = !value;
    });
  });

/** One column of body copy, as the markup the cms holds. */
define("acmi-body-copy")
  .withProps((f) => ({
    html: f.string(""),
  }))
  .setup((c) => {
    c.effect(c.props.$html, (value) => setHtml(c.host, value));
  });

/** One row below the body copy: an icon, and the text beside it. */
define("acmi-info-block")
  .withProps((f) => ({
    icon: f.string(""),
    text: f.string(""),
  }))
  .setup((c) => {
    c.host.setAttribute("role", "listitem");
    c.host.innerHTML = `
      <acmi-icon class="acmi-info-block__icon"></acmi-icon>
      <span class="acmi-info-block__text"></span>
    `;

    const icon = c.getElement("acmi-icon");
    const text = c.getElement("span");

    c.effect(c.props.$icon, (value) => {
      icon.name = value;
    });
    c.effect(c.props.$text, (value) => {
      text.innerHTML = value;
    });
  });

/**
 * The rows below the body: the work's duration, then the content warnings.
 * Pass them as a json island:
 *
 * ```html
 * <acmi-info-blocks>
 *   <script type="application/json" data-prop="blocks">
 *     [{ "icon": "duration", "text": "12 minutes" }]
 *   </script>
 * </acmi-info-blocks>
 * ```
 */
define("acmi-info-blocks")
  .withProps((f) => ({
    blocks: f.json(InfoBlocksSchema, []),
  }))
  .setup((c) => {
    c.host.setAttribute("role", "list");

    c.effect(c.props.$blocks, (value) => {
      const blocks = toInfoBlocks(value);
      c.host.hidden = blocks.length === 0;
      c.host.replaceChildren(
        ...blocks.map((block) => {
          const row = document.createElement("acmi-info-block");
          row.icon = block.icon;
          row.text = block.text;
          return row;
        }),
      );
    });
  });

/** Progress through the work: a ring, the time inside it, the line under it. */
define("acmi-timer-ring")
  .withProps((f) => ({
    ratio: f.number(0),
    elapsed: f.string(""),
    restart: f.string(""),
  }))
  .setup((c) => {
    c.host.innerHTML = `
      <svg class="acmi-timer__ring" viewBox="-4 -4 108 108" aria-hidden="true" focusable="false">
        <circle class="acmi-timer__track" cx="50" cy="50" r="46" fill="none" />
        <circle class="acmi-timer__progress" cx="50" cy="50" r="46" fill="none" />
      </svg>
      <p class="acmi-timer__elapsed"></p>
      <p class="acmi-timer__restart"></p>
    `;

    const elapsed = c.getElement(".acmi-timer__elapsed");
    const restart = c.getElement(".acmi-timer__restart");

    c.effect(c.props.$ratio, (value) => {
      c.host.style.setProperty("--acmi-timer-ratio", String(value));
    });
    c.effect(c.props.$elapsed, (value) => setText(elapsed, value));
    c.effect(c.props.$restart, (value) => setText(restart, value));
  });

/** What the visitor sees when the label has no content to show. */
define("acmi-error-screen")
  .withProps((f) => ({
    message: f.string(""),
  }))
  .setup((c) => {
    c.host.setAttribute("role", "status");
    c.host.innerHTML = `<p class="acmi-error-screen__message"></p>`;

    const message = c.getElement("p");

    c.effect(c.props.$message, (value) => {
      setText(message, value || "This label is temporarily unavailable.");
    });
  });

/**
 * The whole label. Composes the blocks above and decides what the timer
 * reads:
 *
 * - `playback-source` opens the stream and advances the ring every frame.
 * - a `timer` json island holds the ring still, for a presentation or a
 *   screenshot.
 *
 * With neither, there is no timer, which is what happens when no duration is
 * known. With no heading and no body there is nothing to read, so the label
 * says so instead. There are no placeholder defaults: absent props stay
 * absent, and that is the only way to reach the error screen.
 */
define("acmi-gallery-2-label")
  .withProps((f) => ({
    heading: f.string(""),
    credit: f.string(""),
    dateText: f.string(""),
    billing: f.string(""),
    body: f.string(""),
    errorMessage: f.string(""),
    playbackSource: f.string(""),
    infoBlocks: f.json(InfoBlocksSchema, []),
    timer: f.json(TimerSchema, null),
  }))
  .setup((c) => {
    c.host.innerHTML = `
      <div class="acmi-label">
        <acmi-error-screen hidden></acmi-error-screen>
        <div class="acmi-label__content">
          <header>
            <acmi-timer-ring class="acmi-label__timer" hidden></acmi-timer-ring>
          </header>
          <acmi-title-block></acmi-title-block>
          <acmi-body-copy></acmi-body-copy>
          <acmi-info-blocks></acmi-info-blocks>
        </div>
      </div>
    `;

    const errorScreen = c.getElement("acmi-error-screen");
    const content = c.getElement(".acmi-label__content");
    const timerRing = c.getElement("acmi-timer-ring");
    const titleBlock = c.getElement("acmi-title-block");
    const bodyCopy = c.getElement("acmi-body-copy");
    const infoBlocks = c.getElement("acmi-info-blocks");

    // Each block hides itself when it has nothing, so the label only decides
    // between all of them and the error screen.
    c.effect([c.props.$heading, c.props.$body], (heading, body) => {
      const hasContent = Boolean(heading) || Boolean(body);
      content.hidden = !hasContent;
      errorScreen.hidden = hasContent;
    });

    c.effect(c.props.$errorMessage, (value) => {
      errorScreen.message = value;
    });
    c.effect(c.props.$heading, (value) => {
      titleBlock.heading = value;
    });
    c.effect(c.props.$credit, (value) => {
      titleBlock.credit = value;
    });
    c.effect(c.props.$body, (value) => {
      bodyCopy.html = value;
    });
    c.effect(c.props.$infoBlocks, (value) => {
      infoBlocks.blocks = value;
    });

    // Listening is what opens the stream, so a label with no source never
    // connects and never asks for a frame.
    const $live = timerDisplayStore(playbackSnapshotStore(c.props.$playbackSource));

    c.effect([$live, c.props.$timer], (live, held) => {
      const timer = live ?? toTimer(held);
      timerRing.hidden = !timer;
      if (!timer) return;

      timerRing.ratio = timer.ratio;
      timerRing.elapsed = timer.elapsed;
      timerRing.restart = timer.restart;
    });
  });
