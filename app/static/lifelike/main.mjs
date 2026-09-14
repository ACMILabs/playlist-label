/**
 * The lifelike labels, as custom elements.
 *
 * Every component is here, in the order they must be defined: a parent
 * renders its children in `setup`, so a child has to be a registered element
 * before the parent ever runs. The labels come after their blocks, and
 * `acmi-lifelike-label` — the one element a page mounts, which picks a label
 * and does all the talking to the server — is therefore last.
 *
 * The elements render into the light dom. No shadow roots, no adopted
 * stylesheets: every rule lives in `style.css`, which the page links once.
 */

import { computed } from "nanostores";
import { define } from "nanotags";

import * as icons from "./icons.mjs";
import {
  durationText,
  loopText,
  playbackSnapshotStore,
  startsInText,
  timerDisplayStore,
} from "./timerDisplayStore.mjs";

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

// The schema only guards the json island and the attribute. Setting the
// property writes to the store untouched, so the components coerce again on
// the way out — the two together are what make every path safe.
const InfoBlocksSchema = lenient(toInfoBlocks);

// ---- The timer, as attributes ----

/**
 * What every label takes to draw its timer: three attributes, not a json
 * island, because these change every frame and an attribute is what a
 * template or a devtools panel can poke at. A null ratio is "no timer" —
 * the attribute is absent, no duration is known, or the player has gone
 * quiet — and the ring hides.
 *
 * ```html
 * <acmi-playlist-label timer-ratio="0.42" timer-elapsed="5:03"
 *   timer-restart="Starts again in 7 minutes">
 * ```
 *
 * @param {Parameters<Parameters<ReturnType<typeof define>["withProps"]>[0]>[0]} f
 */
const timerProps = (f) => ({
  timerRatio: f.number(null),
  timerElapsed: f.string(""),
  timerRestart: f.string(""),
});

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

/**
 * Writes the three timer props to a ring, or hides the ring when there is
 * no ratio to draw. Every label ends its timer wiring here.
 *
 * @param {HTMLElement & { ratio: number, elapsed: string, restart: string }} ring
 * @param {number | null} ratio
 * @param {string} elapsed
 * @param {string} restart
 */
function setTimer(ring, ratio, elapsed, restart) {
  ring.hidden = ratio === null;
  if (ratio === null) return;

  ring.ratio = ratio;
  ring.elapsed = elapsed;
  ring.restart = restart;
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
 * The work's title, who made it, and how long it runs — three lines, the
 * last two in the same voice. Named `heading` because `title` is a built-in
 * global attribute — the tooltip — and custom element attributes share that
 * namespace.
 */
define("acmi-title-block")
  .withProps((f) => ({
    heading: f.string(""),
    credit: f.string(""),
    duration: f.string(""),
  }))
  .setup((c) => {
    c.host.innerHTML = `
    <h1 class="acmi-title-block__heading"></h1>
    <p class="acmi-title-block__credit"></p>
    <p class="acmi-title-block__duration"></p>
    `;

    const heading = c.getElement("h1");
    const credit = c.getElement(".acmi-title-block__credit");
    const duration = c.getElement(".acmi-title-block__duration");

    c.effect(c.props.$credit, (value) => setHtml(credit, value));
    c.effect(c.props.$duration, (value) => {
      setText(duration, value);
      duration.hidden = !value;
    });
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
 * A single work: the label as gallery 2 shows it. Composes the blocks above.
 *
 * Presentation only — the timer arrives as attributes (see `timerProps`),
 * and whatever advances them lives in `acmi-lifelike-label`, so this element
 * never opens a connection of its own. With no heading and no body there is
 * nothing to read, so the label says so instead. There are no placeholder
 * defaults: absent props stay absent, and that is the only way to reach the
 * error screen.
 */
define("acmi-gallery-2-label")
  .withProps((f) => ({
    heading: f.string(""),
    credit: f.string(""),
    duration: f.string(""),
    dateText: f.string(""),
    billing: f.string(""),
    body: f.string(""),
    errorMessage: f.string(""),
    infoBlocks: f.json(InfoBlocksSchema, []),
    ...timerProps(f),
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
    c.effect(c.props.$duration, (value) => {
      titleBlock.duration = value;
    });
    c.effect(c.props.$body, (value) => {
      bodyCopy.html = value;
    });
    c.effect(c.props.$infoBlocks, (value) => {
      infoBlocks.blocks = value;
    });

    c.effect(
      [c.props.$timerRatio, c.props.$timerElapsed, c.props.$timerRestart],
      (ratio, elapsed, restart) => setTimer(timerRing, ratio, elapsed, restart),
    );
  });

// ---- Playlist labels ----

/**
 * One of the works that has not started yet: enough to recognise it, and how
 * long it runs. No start time — that is a number the stack spreads down the
 * list as the clock moves, and it would be stale the moment it was written
 * into a static list like this one.
 *
 * @param {unknown} value
 * @returns {{ heading: string, credit: string, durationSeconds: number }[]}
 */
function toWorks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((work) => typeof work?.heading === "string" && work.heading)
    .map((work) => ({
      heading: work.heading,
      credit: typeof work?.credit === "string" ? work.credit : "",
      durationSeconds: Number.isFinite(work?.durationSeconds)
        ? work.durationSeconds
        : 0,
    }));
}

const WorksSchema = lenient(toWorks);

/**
 * The current work, in full: everything a single-work label shows below its
 * header. Split out of the label itself because both playlist labels put the
 * same thing above their stack.
 */
define("acmi-work-detail")
  .withProps((f) => ({
    heading: f.string(""),
    credit: f.string(""),
    duration: f.string(""),
    dateText: f.string(""),
    billing: f.string(""),
    body: f.string(""),
    infoBlocks: f.json(InfoBlocksSchema, []),
  }))
  .setup((c) => {
    c.host.innerHTML = `
      <acmi-title-block></acmi-title-block>
      <acmi-dates-block></acmi-dates-block>
      <acmi-body-copy></acmi-body-copy>
      <acmi-info-blocks></acmi-info-blocks>
    `;

    const titleBlock = c.getElement("acmi-title-block");
    const datesBlock = c.getElement("acmi-dates-block");
    const bodyCopy = c.getElement("acmi-body-copy");
    const infoBlocks = c.getElement("acmi-info-blocks");

    c.effect(c.props.$heading, (value) => {
      titleBlock.heading = value;
    });
    c.effect(c.props.$credit, (value) => {
      titleBlock.credit = value;
    });
    c.effect(c.props.$duration, (value) => {
      titleBlock.duration = value;
    });
    c.effect(c.props.$dateText, (value) => {
      datesBlock.dates = value;
    });
    c.effect(c.props.$billing, (value) => {
      datesBlock.billing = value;
    });
    c.effect(c.props.$body, (value) => {
      bodyCopy.html = value;
    });
    c.effect(c.props.$infoBlocks, (value) => {
      infoBlocks.blocks = value;
    });

    // Same rule the label uses to reach its error screen: a work with no
    // heading and no body is not a work anyone can read.
    c.effect([c.props.$heading, c.props.$body], (heading, body) => {
      c.host.hidden = !heading && !body;
    });
  });

/** What the line above a preview says, by where it sits in the stack. */
const PREVIEW_EYEBROWS = {
  next: "Up next",
  later: "Later",
};

/**
 * One work further down the playlist: what it is, and when it starts. No
 * body, no info blocks — the visitor only needs to decide whether to wait.
 *
 * The one directly after the current work is `next` and reads in full; the
 * rest are `later` and lose the credit, because by then the visitor is only
 * scanning for a time.
 */
define("acmi-work-preview")
  .withProps((f) => ({
    kind: f.oneOf(["next", "later"], "later"),
    heading: f.string(""),
    credit: f.string(""),
    /** How long this work runs. The stack adds it on for the one below. */
    durationSeconds: f.number(0),
    /** Seconds until it starts, or null when no clock is running. */
    startsInSeconds: f.number(null),
  }))
  .setup((c) => {
    c.host.setAttribute("role", "listitem");
    c.host.innerHTML = `
      <p class="acmi-work-preview__eyebrow"></p>
      <h2 class="acmi-work-preview__heading"></h2>
      <p class="acmi-work-preview__credit"></p>
      <p class="acmi-work-preview__starts-in"></p>
    `;

    const eyebrow = c.getElement(".acmi-work-preview__eyebrow");
    const heading = c.getElement(".acmi-work-preview__heading");
    const credit = c.getElement(".acmi-work-preview__credit");
    const startsIn = c.getElement(".acmi-work-preview__starts-in");

    c.effect(c.props.$kind, (kind) => {
      c.host.dataset.kind = kind;
      setText(eyebrow, PREVIEW_EYEBROWS[kind]);
    });

    c.effect(c.props.$startsInSeconds, (seconds) => {
      const text = seconds === null ? "" : startsInText(seconds);
      setText(startsIn, text);
      startsIn.hidden = !text;
    });
    c.effect([c.props.$kind, c.props.$credit], (kind, value) => {
      setHtml(credit, kind === "next" ? value : "");
    });
    c.effect(c.props.$heading, (value) => {
      setHtml(heading, value);
      c.host.hidden = !value;
    });
  });

/**
 * Adds or removes previews until there are `count` of them. The ones that
 * stay are the same elements as before — when the playlist rotates, a work
 * moves up a slot into the element that was holding the work above it,
 * which is the movement a view transition has to animate. Rebuilding the
 * list would leave it nothing to animate between.
 *
 * @param {Element} list
 * @param {number} count
 */
function fitPreviews(list, count) {
  while (list.children.length > count) list.lastElementChild.remove();
  while (list.children.length < count) {
    list.append(document.createElement("acmi-work-preview"));
  }
}

/**
 * Walks the clock down the list. The first preview starts when the work
 * playing now ends; each one after that waits out everything above it.
 *
 * @param {Element} list
 * @param {number | null} secondsUntilNext
 */
function spreadStartTimes(list, secondsUntilNext) {
  let starts = secondsUntilNext;
  for (const preview of list.children) {
    preview.startsInSeconds = starts;
    if (starts !== null) starts += preview.durationSeconds;
  }
}

/**
 * The rest of the playlist, stacked under the current work. Pass the works
 * as a json island, in playing order, current work already removed:
 *
 * ```html
 * <acmi-work-stack seconds-until-next="420">
 *   <script type="application/json" data-prop="works">
 *     [{ "heading": "Nightmare", "credit": "Dir. Someone", "durationSeconds": 540 }]
 *   </script>
 * </acmi-work-stack>
 * ```
 *
 * The works change when the playlist rotates; `seconds-until-next` changes
 * every second. They are separate props because they move at such different
 * rates — the clock ticking must not touch the list.
 *
 * Each preview says where it sits — "Up next", then "Later" — so the stack
 * has no heading of its own. Empty is the single-work playlist, and it
 * hides itself, which is what lets one label serve a playlist that shrinks
 * to one item.
 */
define("acmi-work-stack")
  .withProps((f) => ({
    works: f.json(WorksSchema, []),
    secondsUntilNext: f.number(null),
  }))
  .setup((c) => {
    c.host.setAttribute("role", "list");
    const list = c.host;

    c.effect(c.props.$works, (value) => {
      const works = toWorks(value);
      c.host.hidden = works.length === 0;

      fitPreviews(list, works.length);
      works.forEach((work, index) => {
        Object.assign(list.children[index], work, {
          kind: index === 0 ? "next" : "later",
        });
      });
      // A preview that just arrived carries no time, and one that moved up
      // is still holding the time of the slot below it.
      spreadStartTimes(list, c.props.$secondsUntilNext.get());
    });

    c.effect(c.props.$secondsUntilNext, (seconds) => {
      spreadStartTimes(list, seconds);
    });
  });

/**
 * The panel beside the timer: a heading, and whatever markup the cms holds.
 * Only the nightmare room draws one — everywhere else that half of the
 * header band is empty.
 */
define("acmi-aside-panel")
  .withProps((f) => ({
    heading: f.string(""),
    html: f.string(""),
  }))
  .setup((c) => {
    c.host.innerHTML = `
      <p class="acmi-aside-panel__heading"></p>
      <div class="acmi-aside-panel__body"></div>
    `;

    const heading = c.getElement(".acmi-aside-panel__heading");
    const body = c.getElement(".acmi-aside-panel__body");

    c.effect(c.props.$heading, (value) => {
      setText(heading, value);
      heading.hidden = !value;
    });
    c.effect(c.props.$html, (value) => setHtml(body, value));

    c.effect([c.props.$heading, c.props.$html], (title, markup) => {
      c.host.hidden = !title && !markup;
    });
  });

/**
 * Everything the two playlist labels share: the markup, the error screen,
 * the current work, the stack, and the timer.
 *
 * The label's own props describe the work playing now — the same attribute
 * names `acmi-gallery-2-label` takes — and `upcoming` holds the others. So
 * the server renders one item's fields plus a json island of the rest, and
 * the same template serves a playlist of one, three, or ten.
 *
 * Presentation only, like the gallery 2 label: the timer is attributes in,
 * and nothing here opens a stream.
 *
 * @param {any} c the setup context
 * @param {{ aside: boolean }} options whether to leave room beside the timer
 */
function setupPlaylistLabel(c, { aside }) {
  c.host.innerHTML = `
    <div class="acmi-label">
      <acmi-error-screen hidden></acmi-error-screen>
      <div class="acmi-label__content">
        <header>
          ${aside ? '<acmi-aside-panel class="acmi-label__aside" hidden></acmi-aside-panel>' : ""}
          <acmi-timer-ring class="acmi-label__timer" hidden></acmi-timer-ring>
        </header>
        <acmi-work-detail class="acmi-label__current"></acmi-work-detail>
        <acmi-work-stack class="acmi-label__stack"></acmi-work-stack>
      </div>
    </div>
  `;

  const errorScreen = c.getElement("acmi-error-screen");
  const content = c.getElement(".acmi-label__content");
  const timerRing = c.getElement("acmi-timer-ring");
  const current = c.getElement("acmi-work-detail");
  const stack = c.getElement("acmi-work-stack");

  c.effect([c.props.$heading, c.props.$body], (heading, body) => {
    const hasContent = Boolean(heading) || Boolean(body);
    content.hidden = !hasContent;
    errorScreen.hidden = hasContent;
  });

  c.effect(c.props.$errorMessage, (value) => {
    errorScreen.message = value;
  });
  c.effect(c.props.$heading, (value) => {
    current.heading = value;
  });
  c.effect(c.props.$credit, (value) => {
    current.credit = value;
  });
  c.effect(c.props.$duration, (value) => {
    current.duration = value;
  });
  c.effect(c.props.$dateText, (value) => {
    current.dateText = value;
  });
  c.effect(c.props.$billing, (value) => {
    current.billing = value;
  });
  c.effect(c.props.$body, (value) => {
    current.body = value;
  });
  c.effect(c.props.$infoBlocks, (value) => {
    current.infoBlocks = value;
  });
  c.effect(c.props.$upcoming, (value) => {
    stack.works = value;
  });
  c.effect(c.props.$secondsUntilNext, (value) => {
    stack.secondsUntilNext = value;
  });

  c.effect(
    [c.props.$timerRatio, c.props.$timerElapsed, c.props.$timerRestart],
    (ratio, elapsed, restart) => setTimer(timerRing, ratio, elapsed, restart),
  );

  return { errorScreen, content, timerRing, current, stack };
}

/** The props both playlist labels take. */
const playlistLabelProps = (f) => ({
  heading: f.string(""),
  credit: f.string(""),
  duration: f.string(""),
  dateText: f.string(""),
  billing: f.string(""),
  body: f.string(""),
  errorMessage: f.string(""),
  secondsUntilNext: f.number(null),
  infoBlocks: f.json(InfoBlocksSchema, []),
  upcoming: f.json(WorksSchema, []),
  ...timerProps(f),
});

/**
 * A playlist of more than one work: the work playing now in full, then the
 * others stacked below it with when each starts.
 */
define("acmi-playlist-label")
  .withProps(playlistLabelProps)
  .setup((c) => {
    setupPlaylistLabel(c, { aside: false });
  });

/**
 * The nightmare room. The playlist label, plus a panel of extra content in
 * the half of the header band the timer leaves empty.
 */
define("acmi-nightmare-room-label")
  .withProps((f) => ({
    ...playlistLabelProps(f),
    asideHeading: f.string(""),
    asideBody: f.string(""),
  }))
  .setup((c) => {
    setupPlaylistLabel(c, { aside: true });

    const aside = c.getElement("acmi-aside-panel");

    c.effect(c.props.$asideHeading, (value) => {
      aside.heading = value;
    });
    c.effect(c.props.$asideBody, (value) => {
      aside.html = value;
    });
  });

// ---- Reading the playlist ----

// The xos shape turns into label props here and nowhere else, so this is
// the section to edit when a field should read from somewhere different.

/**
 * The playlist as the server hands it over: `window.STATIC_VARS.playlist_json`,
 * or the page's json island. Only the one thing the wrapper walks is checked;
 * everything else rides along and is read leniently below.
 *
 * @param {unknown} value
 * @returns {import("./server").ServedPlaylist | null}
 */
function toPlaylist(value) {
  if (typeof value !== "object" || value === null) return null;
  if (!Array.isArray(/** @type {any} */ (value).playlist_labels)) return null;
  return /** @type {any} */ (value);
}

const PlaylistSchema = lenient(toPlaylist);

/**
 * The items that have a label, in playing order. `GET /` strips the others
 * before rendering; `/api/playlist/` does not, so this strips them again.
 *
 * @param {import("./server").ServedPlaylist | null} playlist
 * @returns {import("./server").LabelledItem[]}
 */
function labelledItems(playlist) {
  return /** @type {any[]} */ (playlist?.playlist_labels ?? []).filter(
    (item) => item?.label,
  );
}

/** Where the playing item sits. The first, until the stream has said. */
function currentIndex(items, labelId) {
  const index = items.findIndex((item) => item.label.id === labelId);
  return index === -1 ? 0 : index;
}

/**
 * The items after `index`, wrapping round: the playlist loops, so the last
 * item in the file is followed by the first.
 */
function itemsAfter(items, index) {
  return [...items.slice(index + 1), ...items.slice(0, index)];
}

/** Strips the one paragraph xos wraps a title in, so it can sit in an `h1`. */
function unwrapParagraph(html) {
  const match = /^\s*<p>([\s\S]*?)<\/p>\s*$/.exec(html);
  return match ? match[1] : html;
}

/** How long an item runs, in seconds. Zero when it has no video. */
function itemSeconds(item) {
  const seconds = item.video?.duration_secs;
  return typeof seconds === "number" && seconds > 0 ? seconds : 0;
}

/** What the label shows when the playlist has no item to show. */
const EMPTY_WORK = {
  heading: "",
  credit: "",
  duration: "",
  dateText: "",
  billing: "",
  body: "",
  infoBlocks: [],
};

/**
 * The current work, as the label's props. Two fields have no source in the
 * playlist yet and stay empty: `dateText` and `billing`. The info rows are
 * empty too — the duration is a line under the credit now, and content
 * warnings would go there once the playlist carries them.
 *
 * @param {import("./server").LabelledItem} item
 */
function toWorkContent(item) {
  const { label } = item;
  return {
    heading: unwrapParagraph(label.title ?? ""),
    credit: label.subtitles ?? "",
    duration: durationText(itemSeconds(item)),
    dateText: "",
    billing: "",
    body: (label.columns ?? []).map((column) => column.content ?? "").join(""),
    infoBlocks: [],
  };
}

/**
 * One item as the stack takes it: what it is, and how long it runs. When it
 * starts is not here — the stack works that out from the clock.
 *
 * @param {import("./server").LabelledItem} item
 */
function toWorkPreview(item) {
  return {
    heading: unwrapParagraph(item.label.title ?? ""),
    credit: item.label.subtitles ?? "",
    durationSeconds: itemSeconds(item),
  };
}

/**
 * The line under the ring. The single label loops one work, so the timer's
 * own `restart` is right there. A playlist comes round again only after
 * every other work has played: what is left of this one, then all of them.
 *
 * @param {keyof typeof VARIANTS} variant
 * @param {TimerDisplay | undefined} timer
 * @param {{ durationSeconds: number }[]} upcoming
 */
function restartLine(variant, timer, upcoming) {
  if (!timer) return "";
  if (variant === "single") return timer.restart;
  return loopText(
    upcoming.reduce((total, work) => total + work.durationSeconds, timer.remainingSeconds),
  );
}

// ---- The label the page mounts ----

/** Each variant, and the element that draws it. */
const VARIANTS = {
  single: "acmi-gallery-2-label",
  playlist: "acmi-playlist-label",
  "nightmare-room": "acmi-nightmare-room-label",
};

/**
 * The one element a page mounts. Three inputs — which label to draw, where
 * the player reports to, and the playlist — and it derives everything the
 * label shows from those, so the labels above stay presentation: content
 * attributes in, timer attributes in, nothing opened.
 *
 * ```html
 * <acmi-lifelike-label variant="nightmare-room" playback-source="/api/playback-stream/">
 *   <script type="application/json" data-prop="playlist">{{ playlist_json | tojson }}</script>
 * </acmi-lifelike-label>
 * ```
 *
 * The variant is read once, at mount: a label is built for the room it hangs
 * in, and changing it later is not something the gallery does.
 *
 * The stream drives two things: the timer, every frame; and which item is
 * current, when its `label_id` changes. The stack's start times come off the
 * same clock. Without a stream the first item shows in full, the rest stack
 * under it with no times, and there is no timer.
 *
 * Anything else that connects — the tap stream, a playlist refetch, a
 * language toggle — belongs in this setup too, as its own section: a store,
 * then the effect that writes what it derives down to the label.
 */
define("acmi-lifelike-label")
  .withProps((f) => ({
    variant: f.oneOf(["single", "playlist", "nightmare-room"], "playlist"),
    playbackSource: f.string(""),
    playlist: f.json(PlaylistSchema, null),
  }))
  .setup((c) => {
    const variant = c.props.$variant.get();
    c.host.innerHTML = `<${VARIANTS[variant]}></${VARIANTS[variant]}>`;

    const label = c.getElement(VARIANTS[variant]);

    // ---- Playback ----

    // Listening is what opens the stream, so a label with no source never
    // connects and never asks for a frame.
    const $snapshot = playbackSnapshotStore(c.props.$playbackSource);
    const $timer = timerDisplayStore($snapshot);

    // ---- What is playing ----

    // Each of these recomputes only when its own inputs change, and a
    // computed store holds its last value: the stream reports every second,
    // but `$index` is a number and only notifies when the item really moves,
    // so `$content` and `$upcoming` stay put between rotations.
    const $items = computed(c.props.$playlist, labelledItems);
    const $index = computed([$items, $snapshot], (items, snapshot) =>
      currentIndex(items, snapshot?.labelId),
    );
    const $content = computed([$items, $index], (items, index) =>
      items[index] ? toWorkContent(items[index]) : EMPTY_WORK,
    );
    const $upcoming = computed([$items, $index], (items, index) =>
      itemsAfter(items, index).map(toWorkPreview),
    );

    // Block body, not a concise arrow: `c.effect` takes a returned value as
    // a cleanup function, and `Object.assign` returns the element.
    c.effect($content, (content) => {
      Object.assign(label, content);
    });

    c.effect($upcoming, (upcoming) => {
      label.upcoming = upcoming;
    });

    c.effect(c.props.$playlist, (playlist) => {
      label.asideHeading = playlist?.introduction_title ?? "";
      label.asideBody = playlist?.introduction_content ?? "";
    });

    // ---- The clock ----

    // One effect feeds the ring, the stack's start times, and the line under
    // the ring, all from the one `timer` value, so they can never disagree
    // about how much of the current work is left.
    c.effect([$timer, $upcoming], (timer, upcoming) => {
      label.timerRatio = timer?.ratio ?? null;
      label.timerElapsed = timer?.elapsed ?? "";
      label.timerRestart = restartLine(variant, timer, upcoming);
      label.secondsUntilNext = timer?.remainingSeconds ?? null;
    });
  });
