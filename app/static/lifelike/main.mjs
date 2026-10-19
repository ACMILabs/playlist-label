/**
 * The lifelike labels, as custom elements.
 *
 * Components are defined in the order they must be: a parent renders its
 * children in `setup`, so a child has to be registered first. That puts
 * `acmi-lifelike-label`, the one element a page mounts, last.
 *
 * The elements render into the light dom: every rule lives in `style.css`.
 *

 *
 * The header is a band of one fixed height on every label, so the work's
 * title starts at the same height on all three.
 */

import { computed } from "nanostores";
import { define } from "nanotags";

import * as icons from "./icons.mjs";
import {
  durationText,
  endsInText,
  loopText,
  playbackSnapshotStore,
  roomSnapshotStore,
  startsInText,
  timerDisplayStore,
} from "./timerDisplayStore.mjs";

// ---- Reading json props ----

/**
 * A standard schema for `f.json()` that never rejects. `parseWithSchema`
 * throws on an issue, and a label that throws shows nothing at all, so data
 * of the wrong shape degrades to the fallback instead. Text that is not json
 * at all still throws, in nanotags.
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
 * The rows below the description: an icon each, and the text beside it.
 *
 * @param {unknown} value
 * @returns {InfoEntry[]}
 */
function toInfoEntries(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry) => typeof entry?.icon === "string" && typeof entry?.text === "string",
  );
}

/**
 * One work, as every label takes it: what `acmi-work-body` shows, how long
 * it runs so a playlist can work out start times, and a key that names it in
 * the rotation's view transition (see Rotating, in `acmi-lifelike-label`).
 *
 * @typedef {{ icon: string, text: string }} InfoEntry
 * @typedef {{
 *   heading: string,
 *   credit: string,
 *   duration: string,
 *   durationSeconds: number,
 *   body: string,
 *   infoEntries: InfoEntry[],
 *   key: number | null,
 * }} Work
 */

/**
 * @param {unknown} value
 * @returns {Work[]}
 */
function toWorks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((work) => typeof work?.heading === "string" && work.heading)
    .map((work) => ({
      heading: work.heading,
      credit: typeof work.credit === "string" ? work.credit : "",
      duration: typeof work.duration === "string" ? work.duration : "",
      durationSeconds: Number.isFinite(work.durationSeconds) ? work.durationSeconds : 0,
      body: typeof work.body === "string" ? work.body : "",
      infoEntries: toInfoEntries(work.infoEntries),
      key: Number.isFinite(work.key) ? work.key : null,
    }));
}

// The schemas only guard the json island and the attribute: setting the
// property skips them, so the components coerce again on the way out.
const InfoEntriesSchema = lenient(toInfoEntries);
const WorksSchema = lenient(toWorks);

// ---- The timer, as attributes ----

/**
 * The timer props every label takes: attributes, not a json island, as they
 * change every frame and a template or devtools can poke at them. A null
 * ratio is "no timer", and the ring hides.
 *
 * ```html
 * <acmi-single-work timer-ratio="0.42" timer-elapsed="5:03"
 *   timer-line="Starts again in 7 minutes">
 * ```
 *
 * @param {Parameters<Parameters<ReturnType<typeof define>["withProps"]>[0]>[0]} f
 */
const timerProps = (f) => ({
  timerRatio: f.number(null),
  timerElapsed: f.string(""),
  timerLine: f.string(""),
});

/**
 * Writes the three timer props to a timer, or hides it when there is no
 * ratio to draw.
 *
 * @param {HTMLElement & { ratio: number, elapsed: string, line: string }} timer
 * @param {number | null} ratio
 * @param {string} elapsed
 * @param {string} line
 */
function setTimer(timer, ratio, elapsed, line) {
  timer.hidden = ratio === null;
  if (ratio === null) return;

  timer.ratio = ratio;
  timer.elapsed = elapsed;
  timer.line = line;
}

/**
 * Wires a label's three timer props straight to one timer element.
 *
 * @param {any} c the setup context
 * @param {HTMLElement} timer an `acmi-timer`
 */
function driveTimer(c, timer) {
  c.effect(
    [c.props.$timerRatio, c.props.$timerElapsed, c.props.$timerLine],
    (ratio, elapsed, line) => setTimer(timer, ratio, elapsed, line),
  );
}

// ---- Small dom helpers ----

/**
 * Writes text only when it changed: the timer redraws every frame, but its
 * text moves about once a second.
 *
 * @param {Element} element
 * @param {string} value
 */
function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

/** What each timer's line was last written as, so `setCaption` can compare. */
const captions = new WeakMap();

/**
 * Writes a timer's line — "Starts in 5 minutes" — with each number in a
 * cell of its own. When only the numbers change, each new one goes in over
 * the old, which fades out as it fades in (see `.acmi-timer__number`); any
 * other change is written straight in. Like `setText`, it writes nothing
 * when nothing has changed.
 *
 * @param {HTMLElement} line
 * @param {string} value
 */
function setCaption(line, value) {
  const was = captions.get(line) ?? "";
  if (value === was) return;
  captions.set(line, value);

  // Words at the even places, numbers at the odd.
  const parts = value.split(/(\d+)/);
  const wasParts = was.split(/(\d+)/);
  const cells = line.querySelectorAll(".acmi-timer__number");
  const sameWords =
    parts.length === wasParts.length &&
    parts.every((part, i) => i % 2 === 1 || part === wasParts[i]);

  if (!sameWords || cells.length !== (parts.length - 1) / 2) {
    line.replaceChildren(
      ...parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const cell = document.createElement("span");
        cell.className = "acmi-timer__number";
        cell.append(Object.assign(document.createElement("span"), { textContent: part }));
        return cell;
      }),
    );
    return;
  }

  parts.forEach((part, i) => {
    if (i % 2 === 0 || part === wasParts[i]) return;
    const cell = cells[(i - 1) / 2];
    for (const old of [...cell.children]) {
      old.dataset.leaving = "";
      // Gone once it has faded — at once, if nothing fades, as when the
      // line is hidden.
      Promise.allSettled(old.getAnimations().map((a) => a.finished)).then(() => old.remove());
    }
    const next = document.createElement("span");
    next.dataset.arriving = "";
    next.textContent = part;
    cell.append(next);
  });
}

/**
 * Fills the element with the cms's markup, or hides it when there is none.
 *
 * Where the browser has the sanitizer, `setHTML` (Chromium 146 on), the
 * markup goes through it, which drops scripts, event handlers and any element
 * it does not know, with what is inside it. Elsewhere it goes in as it is:
 * the cms is ours.
 *
 * @param {HTMLElement} element
 * @param {string} html
 */
function setHtml(element, html) {
  element.hidden = !html;
  if ("setHTML" in element) element.setHTML(html);
  else element.innerHTML = html;
}

/**
 * How each LABEL_ROTATE turns the label (see lifelike.html): the side of the
 * screen its foot faces, and `down`, which takes a box's rectangle on the
 * screen to how far down the label the box starts and ends.
 */
const TURNS = {
  normal: { foot: "bottom", down: (r) => ({ top: r.top, bottom: r.bottom }) },
  right: {
    foot: "left",
    down: (r) => ({ top: window.innerWidth - r.right, bottom: window.innerWidth - r.left }),
  },
  left: { foot: "right", down: (r) => ({ top: r.left, bottom: r.right }) },
  inverted: {
    foot: "top",
    down: (r) => ({ top: window.innerHeight - r.bottom, bottom: window.innerHeight - r.top }),
  },
};

/** How the page is turned. */
function pageTurn() {
  return TURNS[document.documentElement.dataset.rotate] ?? TURNS.normal;
}

/**
 * How far an element's children run past its foot, in pixels, or nothing
 * when they fit.
 *
 * @param {Element} element
 */
function overflowOf(element) {
  const { down } = pageTurn();
  const foot = down(element.getBoundingClientRect()).bottom;
  let over = 0;
  for (const child of element.children) {
    over = Math.max(over, down(child.getBoundingClientRect()).bottom - foot);
  }
  return over;
}

/**
 * Copies a work's fields onto an `acmi-work-body`.
 *
 * @param {HTMLElement} body
 * @param {Work} work
 */
function setWork(body, work) {
  body.heading = work.heading;
  body.credit = work.credit;
  body.duration = work.duration;
  body.body = work.body;
  body.infoEntries = work.infoEntries;
}

// ---- The blocks ----

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
 * The work's title. The prop is `heading` because `title` is a global
 * attribute — the tooltip. The words go in `data-text` too, for the
 * nightmare room's glow, which draws them again.
 */
define("acmi-title")
  .withProps((f) => ({
    heading: f.string(""),
  }))
  .setup((c) => {
    c.host.innerHTML = `<h1 class="acmi-title__heading"></h1>`;
    const heading = c.getElement("h1");

    c.effect(c.props.$heading, (value) => {
      setHtml(heading, value);
      heading.dataset.text = heading.textContent;
      c.host.hidden = !value;
    });
  });

/** The tombstone: who made the work, then how long it runs. */
define("acmi-tombstone")
  .withProps((f) => ({
    credit: f.string(""),
    duration: f.string(""),
  }))
  .setup((c) => {
    // The credit is the cms's markup, paragraphs and all, so it goes in a
    // div: a paragraph cannot hold another.
    c.host.innerHTML = `
      <div class="acmi-tombstone__credit"></div>
      <p class="acmi-tombstone__duration"></p>
    `;

    const credit = c.getElement(".acmi-tombstone__credit");
    const duration = c.getElement(".acmi-tombstone__duration");

    c.effect(c.props.$credit, (value) => setHtml(credit, value));
    c.effect(c.props.$duration, (value) => {
      setText(duration, value);
      duration.hidden = !value;
    });
    c.effect([c.props.$credit, c.props.$duration], (creditValue, durationValue) => {
      c.host.hidden = !creditValue && !durationValue;
    });
  });

/** The description, as the markup the cms holds. */
define("acmi-description")
  .withProps((f) => ({
    html: f.string(""),
  }))
  .setup((c) => {
    c.effect(c.props.$html, (value) => setHtml(c.host, value));
  });

/**
 * One row of additional info: an icon, and the text beside it.
 * `splitWarnings` lifts the text out of the cms's markup as text, so it goes
 * in as text.
 */
define("acmi-info-entry")
  .withProps((f) => ({
    icon: f.string(""),
    text: f.string(""),
  }))
  .setup((c) => {
    c.host.setAttribute("role", "listitem");
    c.host.innerHTML = `
      <acmi-icon class="acmi-info-entry__icon"></acmi-icon>
      <span class="acmi-info-entry__text"></span>
    `;

    const icon = c.getElement("acmi-icon");
    const text = c.getElement("span");

    c.effect(c.props.$icon, (value) => {
      icon.name = value;
    });
    c.effect(c.props.$text, (value) => setText(text, value));
  });

/**
 * The additional info block: the rows under the description, warnings
 * mostly. Pass them as a json island:
 *
 * ```html
 * <acmi-info-block>
 *   <script type="application/json" data-prop="entries">
 *     [{ "icon": "caution", "text": "Contains strobe lighting" }]
 *   </script>
 * </acmi-info-block>
 * ```
 */
define("acmi-info-block")
  .withProps((f) => ({
    entries: f.json(InfoEntriesSchema, []),
  }))
  .setup((c) => {
    c.host.setAttribute("role", "list");

    c.effect(c.props.$entries, (value) => {
      const entries = toInfoEntries(value);
      c.host.hidden = entries.length === 0;
      c.host.replaceChildren(
        ...entries.map((entry) => {
          const row = document.createElement("acmi-info-entry");
          row.icon = entry.icon;
          row.text = entry.text;
          return row;
        }),
      );
    });
  });

/**
 * The timer: a ring, the time inside it, and a line under it. For the work
 * playing now the ring fills as it plays and the line is when it comes round
 * again; for one not yet started, the ring is empty and the line is when it
 * starts.
 */
define("acmi-timer")
  .withProps((f) => ({
    ratio: f.number(0),
    elapsed: f.string(""),
    line: f.string(""),
  }))
  .setup((c) => {
    c.host.innerHTML = `
      <svg class="acmi-timer__ring" viewBox="-4 -4 108 108" aria-hidden="true" focusable="false">
        <circle class="acmi-timer__track" cx="50" cy="50" r="46" fill="none" />
        <circle class="acmi-timer__progress" cx="50" cy="50" r="46" fill="none" pathLength="1" />
      </svg>
      <p class="acmi-timer__elapsed"></p>
      <p class="acmi-timer__line"></p>
    `;

    const elapsed = c.getElement(".acmi-timer__elapsed");
    const line = c.getElement(".acmi-timer__line");

    c.effect(c.props.$ratio, (value) => {
      c.host.style.setProperty("--acmi-timer-ratio", String(value));
    });
    c.effect(c.props.$elapsed, (value) => {
      setText(elapsed, value);
      elapsed.hidden = !value;
    });
    c.effect(c.props.$line, (value) => {
      setCaption(line, value);
      line.hidden = !value;
    });
  });

/**
 * The qr block: the code, and beside it the captions icon and one line. The
 * svg's colours are left as `var(--figure)` / `var(--ground)` for the
 * stylesheet to fill. No svg, no block.
 */
define("acmi-qr-block")
  .withProps((f) => ({
    svg: f.string(""),
    text: f.string("Scan here for captions"),
  }))
  .setup((c) => {
    c.host.innerHTML = `
      <div class="acmi-qr-block__code" aria-hidden="true"></div>
      <p class="acmi-qr-block__info">
        <acmi-icon class="acmi-qr-block__icon" name="captions"></acmi-icon>
        <span class="acmi-qr-block__text"></span>
      </p>
    `;

    const code = c.getElement(".acmi-qr-block__code");
    const info = c.getElement(".acmi-qr-block__text");

    // The server draws the code, not the cms, so it skips the sanitizer,
    // which could drop what draws it.
    c.effect(c.props.$svg, (value) => {
      code.innerHTML = value;
      c.host.hidden = !value;
    });
    c.effect(c.props.$text, (value) => setText(info, value));
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

/** The playlist's own title — "Screening Room", say. The works rotate under it. */
define("acmi-playlist-title")
  .withProps((f) => ({
    heading: f.string(""),
  }))
  .setup((c) => {
    c.host.innerHTML = `<div class="acmi-playlist-title__text"></div>`;
    const text = c.getElement(".acmi-playlist-title__text");

    c.effect(c.props.$heading, (value) => {
      setHtml(text, value);
      c.host.hidden = !value;
    });
  });

/**
 * One work, in full: title, tombstone, description, additional info. A
 * playlist entry that is not playing yet leaves the last two empty.
 */
define("acmi-work-body")
  .withProps((f) => ({
    heading: f.string(""),
    credit: f.string(""),
    duration: f.string(""),
    body: f.string(""),
    infoEntries: f.json(InfoEntriesSchema, []),
  }))
  .setup((c) => {
    c.host.innerHTML = `
      <acmi-title></acmi-title>
      <acmi-tombstone></acmi-tombstone>
      <acmi-description></acmi-description>
      <acmi-info-block></acmi-info-block>
    `;

    const title = c.getElement("acmi-title");
    const tombstone = c.getElement("acmi-tombstone");
    const description = c.getElement("acmi-description");
    const infoBlock = c.getElement("acmi-info-block");

    c.effect(c.props.$heading, (value) => {
      title.heading = value;
    });
    c.effect(c.props.$credit, (value) => {
      tombstone.credit = value;
    });
    c.effect(c.props.$duration, (value) => {
      tombstone.duration = value;
    });
    c.effect(c.props.$body, (value) => {
      description.html = value;
    });
    c.effect(c.props.$infoEntries, (value) => {
      infoBlock.entries = value;
    });
  });

// ---- Playlist entries ----

/** What the status line says, by where the entry sits in the playlist. */
const ENTRY_STATUS = {
  current: "Now playing",
  next: "Up next",
  later: "Later",
};

/**
 * How many slots down the list the rotation staggers. `style.css` has a
 * rule for each; slots further down move with the last.
 */
const STAGGERED_SLOTS = 8;

/**
 * One work in the playlist: its status, its body, and its timer. `current`
 * shows everything but the timer, which the label draws in its header;
 * `next` and `later` show the title and tombstone, with an empty ring and
 * when they start. The title and tombstone look the same in every kind, so
 * they can move up the list unchanged when the playlist rotates.
 *
 * `place` is the entry's slot in the list; not `slot`, a global attribute.
 */
define("acmi-playlist-entry")
  .withProps((f) => ({
    kind: f.oneOf(["current", "next", "later"], "later"),
    place: f.number(0),
    key: f.number(null),
    heading: f.string(""),
    credit: f.string(""),
    duration: f.string(""),
    body: f.string(""),
    infoEntries: f.json(InfoEntriesSchema, []),
    ...timerProps(f),
  }))
  .setup((c) => {
    c.host.setAttribute("role", "listitem");
    c.host.innerHTML = `
      <p class="acmi-playlist-entry__status"></p>
      <acmi-work-body class="acmi-playlist-entry__body"></acmi-work-body>
      <acmi-timer class="acmi-playlist-entry__timer" hidden></acmi-timer>
    `;

    const status = c.getElement(".acmi-playlist-entry__status");
    const body = c.getElement("acmi-work-body");
    const timer = c.getElement("acmi-timer");

    c.effect(c.props.$kind, (kind) => {
      c.host.dataset.kind = kind;
      setText(status, ENTRY_STATUS[kind]);
    });

    c.effect(c.props.$heading, (value) => {
      body.heading = value;
      c.host.hidden = !value;
    });
    c.effect(c.props.$credit, (value) => {
      body.credit = value;
    });
    c.effect(c.props.$duration, (value) => {
      body.duration = value;
    });
    c.effect([c.props.$kind, c.props.$body], (kind, value) => {
      body.body = kind === "current" ? value : "";
    });
    c.effect([c.props.$kind, c.props.$infoEntries], (kind, value) => {
      body.infoEntries = kind === "current" ? value : [];
    });

    // The current work's timer is the label's, in the header.
    c.effect(
      [c.props.$kind, c.props.$timerRatio, c.props.$timerElapsed, c.props.$timerLine],
      (kind, ratio, elapsed, line) =>
        setTimer(timer, kind === "current" ? null : ratio, elapsed, line),
    );

    // Names for the rotation's view transition (see Rotating in style.css).
    // The title, tombstone and timer are named by the work's key, so they
    // move up the list with it; the timer's name is the one the header's
    // timer takes when this work plays, so the ring carries on up into it.
    // The status and the rest of the entry are named by key and slot, so
    // they fade rather than move; the status apart, as it goes first and
    // comes back last. The slot class staggers it all down the list.
    const title = c.getElement(body, "acmi-title");
    const tombstone = c.getElement(body, "acmi-tombstone");
    c.effect([c.props.$key, c.props.$kind, c.props.$place], (key, kind, place) => {
      const named = key !== null;
      c.host.style.viewTransitionName = named ? `acmi-entry-${key}-${place}` : "";
      status.style.viewTransitionName = named ? `acmi-status-${key}-${place}` : "";
      title.style.viewTransitionName = named ? `acmi-title-${key}` : "";
      tombstone.style.viewTransitionName = named ? `acmi-tombstone-${key}` : "";
      timer.style.viewTransitionName = named && kind !== "current" ? `acmi-timer-${key}` : "";

      const stagger = named ? `acmi-slot-${Math.min(place, STAGGERED_SLOTS - 1)}` : "";
      for (const part of [c.host, title, tombstone, timer]) {
        part.style.viewTransitionClass = stagger;
      }
      status.style.viewTransitionClass = named ? `${stagger} acmi-status` : "";
    });
  });

/**
 * Adds or removes entries until there are `count` of them. The rest are
 * kept, each taking the work from the one below it on a rotation; the view
 * transition pairs parts by name, not element, so this only saves rebuilding.
 *
 * @param {Element} list
 * @param {number} count
 */
function fitEntries(list, count) {
  while (list.children.length > count) list.lastElementChild.remove();
  while (list.children.length < count) {
    list.append(document.createElement("acmi-playlist-entry"));
  }
}

/** Where an entry sits, by its index in the list. */
function entryKind(index) {
  if (index === 0) return "current";
  return index === 1 ? "next" : "later";
}

/**
 * The works in the playlist as a json island, in playing order, the one
 * playing now first:
 *
 * ```html
 * <acmi-playlist-entries seconds-until-next="420">
 *   <script type="application/json" data-prop="works">
 *     [{ "heading": "Signs of Life", "credit": "…", "durationSeconds": 720, … }]
 *   </script>
 * </acmi-playlist-entries>
 * ```
 *
 * `seconds-until-next` is a prop of its own so the clock, ticking every
 * second, never touches the list. The second entry starts when the first
 * ends, and each one after waits out everything above it.
 */
define("acmi-playlist-entries")
  .withProps((f) => ({
    works: f.json(WorksSchema, []),
    secondsUntilNext: f.number(null),
  }))
  .setup((c) => {
    c.host.setAttribute("role", "list");
    const list = c.host;

    /** @param {number | null} secondsUntilNext */
    function spreadStartTimes(secondsUntilNext) {
      let starts = secondsUntilNext;
      for (const entry of Array.from(list.children).slice(1)) {
        Object.assign(entry, {
          timerRatio: starts === null ? null : 0,
          timerElapsed: "",
          timerLine: starts === null ? "" : startsInText(starts),
        });
        if (starts !== null) starts += entry.durationSeconds;
      }
    }

    c.effect(c.props.$works, (value) => {
      const works = toWorks(value);
      c.host.hidden = works.length === 0;

      fitEntries(list, works.length);
      works.forEach((work, index) => {
        Object.assign(list.children[index], work, { kind: entryKind(index), place: index });
      });
      // An entry that just arrived carries no time, and one that moved up
      // is still holding the time of the slot below it.
      spreadStartTimes(c.props.$secondsUntilNext.get());
    });

    c.effect(c.props.$secondsUntilNext, spreadStartTimes);
  });

// ---- The nightmare room's info ----

/**
 * What the nightmare room says under its title in each mode, unless the
 * server gives it other words — NIGHTMARE_WAITING_TEXT and the like.
 */
const NIGHTMARE_TEXT = {
  waiting: "Please wait here. The next run starts soon.",
  running: "A run is in progress. The next one starts when it ends.",
  unavailable: "The Nightmare Room is not running at the moment.",
  closed: "The Nightmare Room is closed for today.",
};

/** The room's word on its mode, in a box under its title. */
define("acmi-nightmare-info")
  .withProps((f) => ({
    text: f.string(""),
  }))
  .setup((c) => {
    c.host.innerHTML = `<div class="acmi-nightmare-info__text"></div>`;
    const text = c.getElement(".acmi-nightmare-info__text");

    c.effect(c.props.$text, (value) => setHtml(text, value));
  });

// ---- The labels ----

/**
 * The props every label takes: the works, the timer, and what to say when
 * there is nothing to show.
 */
const labelProps = (f) => ({
  works: f.json(WorksSchema, []),
  errorMessage: f.string(""),
  ...timerProps(f),
});

/**
 * Writes a label's shell — the error screen, and beside it the content: the
 * header band, then the body — and wires what every label shares. Each block
 * inside hides itself when it has nothing, so the label only decides between
 * the content and the error screen: no works, no label.
 *
 * @param {any} c the setup context
 * @param {{ header?: string, body: string }} markup what goes in the header
 *   band, and what goes below it
 * @returns {{ works: import("nanostores").ReadableAtom<Work[]> }}
 */
function labelShell(c, { header = "", body }) {
  c.host.innerHTML = `
    <div class="acmi-label">
      <acmi-error-screen hidden></acmi-error-screen>
      <div class="acmi-label__content">
        <header class="acmi-header">${header}</header>
        ${body}
      </div>
    </div>
  `;

  const errorScreen = c.getElement("acmi-error-screen");
  const content = c.getElement(".acmi-label__content");
  const $works = computed(c.props.$works, toWorks);

  c.effect($works, (works) => {
    const hasContent = works.length > 0;
    content.hidden = !hasContent;
    errorScreen.hidden = hasContent;
  });
  c.effect(c.props.$errorMessage, (value) => {
    errorScreen.message = value;
  });

  // Copy that does not fit runs on from the `.acmi-label__fill` block over
  // the qr code, and is cut off at the foot of the content (see style.css).
  // Say so when it starts and stops, so whoever checks the label hears.
  const clips = [content, ...content.querySelectorAll(".acmi-label__fill")];
  let overflowing = false;
  const fit = new ResizeObserver(() => {
    const over = Math.max(...clips.map(overflowOf));
    if (over > 1 && !overflowing) {
      console.warn(`[acmi-label] content runs ${Math.round(over)}px past the room it has`);
    }
    if (over <= 1 && overflowing) console.info("[acmi-label] content fits the label again");
    overflowing = over > 1;
  });
  // Watch what is inside each, again whenever the works change: a
  // playlist's entries come and go.
  const watch = () => {
    for (const clip of clips) {
      for (const child of clip.children) fit.observe(child);
    }
  };
  watch();
  c.effect($works, () => {
    requestAnimationFrame(watch);
  });
  c.onCleanup(() => fit.disconnect());

  return { works: $works };
}

/** A work with nothing in it: what a label shows while it has no works. */
const EMPTY_WORK = {
  heading: "",
  credit: "",
  duration: "",
  durationSeconds: 0,
  body: "",
  infoEntries: [],
  key: null,
};

/**
 * A single work: the timer in the header band, then the body with the qr
 * code at its foot. Shows the first work it is given.
 */
define("acmi-single-work")
  .withProps((f) => ({
    ...labelProps(f),
    qrSvg: f.string(""),
  }))
  .setup((c) => {
    const { works } = labelShell(c, {
      header: `<acmi-timer class="acmi-header__timer" hidden></acmi-timer>`,
      body: `
        <div class="acmi-body-block">
          <acmi-work-body class="acmi-label__fill"></acmi-work-body>
          <acmi-qr-block hidden></acmi-qr-block>
        </div>
      `,
    });

    const timer = c.getElement("acmi-timer");
    const body = c.getElement("acmi-work-body");
    const qrBlock = c.getElement("acmi-qr-block");

    c.effect(works, (value) => setWork(body, value[0] ?? EMPTY_WORK));
    c.effect(c.props.$qrSvg, (value) => {
      qrBlock.svg = value;
    });
    driveTimer(c, timer);
  });

/**
 * A playlist of works: the one playing now in full, then the others with
 * when each starts, and the qr code at the foot. The header has the
 * playlist's title top left and the playing work's timer top right, so its
 * description takes the full width.
 */
define("acmi-playlist-work")
  .withProps((f) => ({
    ...labelProps(f),
    playlistTitle: f.string(""),
    qrSvg: f.string(""),
    secondsUntilNext: f.number(null),
  }))
  .setup((c) => {
    const { works } = labelShell(c, {
      header: `
        <acmi-playlist-title hidden></acmi-playlist-title>
        <acmi-timer class="acmi-header__timer" hidden></acmi-timer>
      `,
      body: `
        <acmi-playlist-entries class="acmi-label__fill"></acmi-playlist-entries>
        <acmi-qr-block hidden></acmi-qr-block>
      `,
    });

    const playlistTitle = c.getElement("acmi-playlist-title");
    const timer = c.getElement(".acmi-header__timer");
    const entries = c.getElement("acmi-playlist-entries");
    const qrBlock = c.getElement("acmi-qr-block");

    c.effect(c.props.$playlistTitle, (value) => {
      playlistTitle.heading = value;
    });
    c.effect(c.props.$works, (value) => {
      entries.works = value;
    });
    // Named as the playing work's timer was in the list, so the rotation
    // slides it up from there, in the first slot's turn.
    timer.style.viewTransitionClass = "acmi-slot-0";
    c.effect(works, (value) => {
      const key = value[0]?.key ?? null;
      timer.style.viewTransitionName = key === null ? "" : `acmi-timer-${key}`;
    });
    c.effect(c.props.$secondsUntilNext, (value) => {
      entries.secondsUntilNext = value;
    });
    c.effect(c.props.$qrSvg, (value) => {
      qrBlock.svg = value;
    });
    driveTimer(c, timer);
  });

/**
 * The server's words for the nightmare room's modes: strings only, for the
 * modes there are.
 *
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
function toNightmareText(value) {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([mode, text]) => Object.hasOwn(NIGHTMARE_TEXT, mode) && typeof text === "string",
    ),
  );
}

const NightmareTextSchema = lenient(toNightmareText);

/**
 * The nightmare room: the work's title, the room's info under it, then the
 * rest of the work, with the timer in the header while a run is on. No qr
 * code, no duration — the room times its own runs — and no upcoming works.
 *
 * Its mode, set from TouchOSC (see `app/nightmare_room.py`), is carried as
 * `data-state` for the stylesheet; only `running` has a timer. Each mode's
 * text is the server's when it has some, the label's own when not.
 */
define("acmi-nightmare-room")
  .withProps((f) => ({
    ...labelProps(f),
    state: f.oneOf(["waiting", "running", "unavailable", "closed"], "waiting"),
    texts: f.json(NightmareTextSchema, {}),
  }))
  .setup((c) => {
    const { works } = labelShell(c, {
      header: `<acmi-timer class="acmi-header__timer" hidden></acmi-timer>`,
      body: `
        <acmi-title class="acmi-nightmare-room__title"></acmi-title>
        <acmi-nightmare-info></acmi-nightmare-info>
        <acmi-work-body></acmi-work-body>
      `,
    });

    const timer = c.getElement("acmi-timer");
    const title = c.getElement(".acmi-nightmare-room__title");
    const info = c.getElement("acmi-nightmare-info");
    const body = c.getElement("acmi-work-body");

    // The title sits above the info, so the body leaves its own out.
    c.effect(works, (value) => {
      const work = value[0] ?? EMPTY_WORK;
      title.heading = work.heading;
      setWork(body, { ...work, heading: "", duration: "" });
    });
    c.effect(c.props.$state, (state) => {
      c.host.dataset.state = state;
    });
    c.effect([c.props.$state, c.props.$texts], (state, texts) => {
      info.text = toNightmareText(texts)[state] || NIGHTMARE_TEXT[state];
    });
    c.effect(
      [c.props.$state, c.props.$timerRatio, c.props.$timerElapsed, c.props.$timerLine],
      (state, ratio, elapsed, line) =>
        setTimer(timer, state === "running" ? ratio : null, elapsed, line),
    );
  });

// ---- Reading the playlist ----

// The xos shape turns into label props here and nowhere else.

/**
 * The xos playlist, as far as this label reads it, with the keys
 * `app/main.py` merges in: the qr code, and the nightmare room's words.
 *
 * @typedef {{
 *   id: number,
 *   title?: string,
 *   subtitles?: string,
 *   columns?: { content?: string }[],
 * }} ItemLabel
 * @typedef {{ label: ItemLabel | null, video?: { duration_secs?: number } | null }} PlaylistItem
 * @typedef {PlaylistItem & { label: ItemLabel }} LabelledItem
 * @typedef {{
 *   title?: string,
 *   playlist_labels: PlaylistItem[],
 *   qr_svg?: string,
 *   nightmare_text?: Record<string, string>,
 * }} ServedPlaylist
 */

/**
 * The playlist from the page's json island. Only `playlist_labels` is
 * checked; everything else is read leniently below.
 *
 * @param {unknown} value
 * @returns {ServedPlaylist | null}
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
 * @param {ServedPlaylist | null} playlist
 * @returns {LabelledItem[]}
 */
function labelledItems(playlist) {
  return /** @type {any[]} */ (playlist?.playlist_labels ?? []).filter((item) => item?.label);
}

/**
 * Where the item the player names sits among the labelled items, or -1: no
 * report yet, or an item without a label.
 */
function playingIndex(items, labelId) {
  return items.findIndex((item) => item.label.id === labelId);
}

/** The items from `index` on, wrapping round, as the playlist loops. */
function itemsFrom(items, index) {
  return [...items.slice(index), ...items.slice(0, index)];
}

/** Strips the one paragraph xos wraps a title in, so it can sit in an `h1`. */
function unwrapParagraph(html) {
  const match = /^\s*<p>([\s\S]*?)<\/p>\s*$/.exec(html);
  return match ? match[1] : html;
}

/**
 * The custom elements an editor can write into a description in xos, and
 * the icon each one's row takes. Anything not listed stays in the copy.
 */
const WARNING_ICONS = {
  "acmi-warning": "caution",
};

/**
 * Splits a description into the copy and the warnings written into it, so a
 * warning shows as a row with an icon rather than mid-copy, where it is easy
 * to miss. A paragraph the warning leaves empty goes too.
 *
 * @param {string} html
 * @returns {{ html: string, warnings: InfoEntry[] }}
 */
function splitWarnings(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const warnings = [];

  for (const element of doc.body.querySelectorAll(Object.keys(WARNING_ICONS).join(","))) {
    const text = element.textContent.trim();
    if (text) warnings.push({ icon: WARNING_ICONS[element.localName], text });

    const parent = element.parentElement;
    element.remove();
    if (parent !== doc.body && !parent.textContent.trim() && !parent.children.length) {
      parent.remove();
    }
  }

  return { html: doc.body.innerHTML, warnings };
}

/** How long an item runs, in seconds. Zero when it has no video. */
function itemSeconds(item) {
  const seconds = item.video?.duration_secs;
  return typeof seconds === "number" && seconds > 0 ? seconds : 0;
}

/**
 * One item as a work.
 *
 * @param {LabelledItem} item
 * @returns {Work}
 */
function toWork(item) {
  const { label } = item;
  const { html, warnings } = splitWarnings(
    (label.columns ?? []).map((column) => column.content ?? "").join(""),
  );
  const durationSeconds = itemSeconds(item);
  return {
    heading: unwrapParagraph(label.title ?? ""),
    credit: label.subtitles ?? "",
    duration: durationText(durationSeconds),
    durationSeconds,
    body: html,
    infoEntries: warnings,
    key: null,
  };
}

/**
 * The line under the ring. A single work loops alone, so it is the timer's
 * own `restart`; a playlist's work comes round again only after every other
 * work has played; a run in the nightmare room just ends.
 *
 * @param {keyof typeof VARIANTS} variant
 * @param {import("./timerDisplayStore.mjs").TimerDisplay | undefined} timer
 * @param {Work[]} works
 */
function timerLine(variant, timer, works) {
  if (!timer) return "";
  if (variant === "nightmare-room") return endsInText(timer.remainingSeconds);
  if (variant !== "playlist") return timer.restart;
  return loopText(
    works.slice(1).reduce((total, work) => total + work.durationSeconds, timer.remainingSeconds),
  );
}

/**
 * Readies a label for a rotation's view transition. The moving parts are
 * drawn over the page, out of reach of the label's own clip, so
 * --acmi-transition-clip cuts them off at the foot of the content instead
 * (see Rotating in style.css), on whichever side LABEL_ROTATE turned it to.
 * A part that starts below the foot loses its name: it is cut off anyway,
 * and named it would cost a picture of its own, drawn whole as it moved.
 *
 * Called before the transition for the label as it was, and inside it for
 * the label as it is.
 *
 * @param {Element} label
 */
function fitTransitionToLabel(label) {
  const content = label.querySelector(".acmi-label__content");
  if (!content) return;

  const { foot: side, down } = pageTurn();
  const foot = down(content.getBoundingClientRect()).bottom;
  const screenFoot = down(new DOMRect(0, 0, window.innerWidth, window.innerHeight)).bottom;
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  inset[side] = Math.max(0, screenFoot - foot);
  document.documentElement.style.setProperty(
    "--acmi-transition-clip",
    `inset(${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px)`,
  );
  for (const part of label.querySelectorAll("[style*='view-transition-name']")) {
    if (down(part.getBoundingClientRect()).top >= foot) part.style.viewTransitionName = "";
  }
}

// ---- The label the page mounts ----

/** Each variant, and the element that draws it. */
const VARIANTS = {
  normal: "acmi-single-work",
  playlist: "acmi-playlist-work",
  "nightmare-room": "acmi-nightmare-room",
};

/**
 * The one element a page mounts. It takes which label to draw, the stream to
 * follow and the playlist, and derives everything the label shows, so the
 * labels above stay presentation only and never open a connection.
 *
 * ```html
 * <acmi-lifelike-label variant="playlist" playback-source="/api/playback-stream/">
 *   <script type="application/json" data-prop="playlist">{{ playlist_json | tojson }}</script>
 * </acmi-lifelike-label>
 * ```
 *
 * The variant is read once, at mount; one it does not know draws a single
 * work.
 *
 * The player's stream drives the timer every frame, and moves the label on,
 * inside a view transition, when its `label_id` changes. Without a stream
 * the first item shows in full, the rest with no times, and there is no
 * timer. The nightmare room follows `room-source` instead: its mode, and
 * while a run is on, the run's clock.
 *
 * Anything else that connects — the tap stream, a playlist refetch — belongs
 * in this setup too, as its own section: a store, then the effect that
 * writes what it derives down to the label.
 */
define("acmi-lifelike-label")
  .withProps((f) => ({
    // A string, not `f.oneOf`: that throws on a value it does not know, and a
    // label that throws never draws. LABEL_MODE is shared with the other
    // templates, so it can hold one of theirs.
    variant: f.string("normal"),
    playbackSource: f.string(""),
    roomSource: f.string(""),
    playlist: f.json(PlaylistSchema, null),
  }))
  .setup((c) => {
    const asked = c.props.$variant.get();
    const variant = Object.hasOwn(VARIANTS, asked) ? asked : "normal";
    if (variant !== asked) console.error(`[acmi-label] no variant "${asked}", drawing "normal"`);
    c.host.innerHTML = `<${VARIANTS[variant]}></${VARIANTS[variant]}>`;

    const label = c.getElement(VARIANTS[variant]);

    // ---- Playback ----

    // A single work's ring comes straight round again; a playlist's stops
    // full at the end of a work, until the player says which comes next. The
    // nightmare room's ring times its run, and stops full when it ends.
    const $snapshot = playbackSnapshotStore(c.props.$playbackSource);
    const $room = roomSnapshotStore(c.props.$roomSource);
    const $run = computed($room, (room) => (room?.mode === "running" ? room : undefined));
    const $timer =
      variant === "nightmare-room"
        ? timerDisplayStore($run, { loops: false })
        : timerDisplayStore($snapshot, { loops: variant !== "playlist" });

    // ---- What is playing ----

    // The stream reports every second, but `$index` is a number and only
    // notifies when the item really moves, so `$works` stays put between
    // rotations.
    const $items = computed(c.props.$playlist, labelledItems);
    const $playing = computed([$items, $snapshot], (items, snapshot) =>
      playingIndex(items, snapshot?.labelId),
    );
    // The last item the player named that the label lists, or none until it
    // names one (the label shows the first meanwhile). On an item without a
    // label, the label stays where it was and hides the timer (see The clock).
    let lastIndex = null;
    const $index = computed([$items, $playing], (items, playing) => {
      if (playing !== -1) lastIndex = playing;
      return lastIndex === null ? null : Math.min(lastIndex, Math.max(items.length - 1, 0));
    });
    const $works = computed([$items, $index], (items, index) =>
      itemsFrom(items, index ?? 0).map(toWork),
    );

    // ---- Rotating ----

    // When the player moves on, the label changes inside a view transition.
    // Each work's key is its place in the playing order, counted from the
    // first work this label showed. A work keeps its key as it moves up, and
    // the one that comes round to the end gets a new one — so the list slides
    // up and the finished work leaves, rather than sweeping down past them.
    let played = 0;
    let shownIndex = null;
    // The clock holds still while a transition takes its picture of the old
    // label, so the old picture is all the old work's.
    let holding = false;
    // The room's mode as the label shows it, or none until the room says.
    // Declared before any effect runs: the one below calls `writeClock`,
    // which sets it.
    let shownMode = null;

    c.effect($works, (works) => {
      // Only a move between two works the player named is a rotation. Its
      // first report only says where it already was, so that moves the label
      // without a transition.
      const index = $index.get();
      const rotated =
        shownIndex !== null && index !== null && index !== shownIndex && works.length > 0;
      if (rotated) played += (index - shownIndex + works.length) % works.length;
      shownIndex = index;
      const keyed = works.map((work, place) => ({ ...work, key: played + place }));

      if (!rotated || !document.startViewTransition) {
        label.works = keyed;
        return;
      }
      holding = true;
      fitTransitionToLabel(label);
      document.startViewTransition(() => {
        // Whatever happens drawing the new works, the clock must not stay
        // held: it would stop for the rest of the label's days.
        try {
          label.works = keyed;
          fitTransitionToLabel(label);
        } finally {
          holding = false;
          writeClock();
        }
      });
    });

    c.effect(c.props.$playlist, (playlist) => {
      if (variant === "nightmare-room") {
        label.texts = playlist?.nightmare_text ?? {};
        return;
      }
      if (variant === "playlist") label.playlistTitle = playlist?.title ?? "";
      // One code, for `QR_URL_OVERRIDE`, or none. The per-language set in
      // `qr_text` is the reverb label's and this label ignores it.
      label.qrSvg = playlist?.qr_svg ?? "";
    });

    // ---- The clock ----

    // One write feeds the ring, its line, the start times and the nightmare
    // room's mode from the one `timer` value, so they never disagree.
    function writeClock() {
      // On an item the label does not list, the ring would count down
      // something the label is not showing.
      const offList = $playing.get() === -1 && $snapshot.get()?.labelId !== undefined;
      const timer = offList ? undefined : $timer.get();
      label.timerRatio = timer?.ratio ?? null;
      label.timerElapsed = timer?.elapsed ?? "";
      label.timerLine = timerLine(variant, timer, $works.get());
      if (variant === "playlist") label.secondsUntilNext = timer?.remainingSeconds ?? null;
      if (variant === "nightmare-room") {
        // Until the room says otherwise, it is waiting, as it starts.
        shownMode = $room.get()?.mode ?? null;
        label.state = shownMode ?? "waiting";
      }
    }

    // Held while a transition waits: it writes the clock itself once it has
    // its old picture. A change of the nightmare room's mode crossfades the
    // whole label this way, though not the room's first report.
    c.effect([$timer, $works, $playing, $room], () => {
      if (holding) return;
      const mode = $room.get()?.mode ?? null;
      const modeChanged = variant === "nightmare-room" && shownMode !== null && mode !== shownMode;
      if (!modeChanged || !document.startViewTransition) {
        writeClock();
        return;
      }
      holding = true;
      document.startViewTransition(() => {
        try {
          writeClock();
        } finally {
          holding = false;
        }
      });
    });
  });
