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
 *
 * The three labels, and what each is built from:
 *
 * ```
 * acmi-single-work            acmi-playlist-work           acmi-nightmare-room
 *   header                      header                       header
 *     acmi-timer                  acmi-playlist-title          acmi-nightmare-info
 *   body-block                    acmi-timer                     text
 *     acmi-work-body            acmi-playlist-entries            acmi-timer
 *     acmi-qr-block               acmi-playlist-entry ×n     acmi-work-body
 *                                   status
 *                                   acmi-work-body
 *                                   acmi-timer (not yet playing)
 *                               acmi-qr-block
 * ```
 *
 * The header is a band of one fixed height on every label, so the work's
 * title starts at the same height on all three. The timer of the work playing
 * now sits in it, top right, wherever the label has one; only the playlist
 * has its own title there, top left. `acmi-work-body` is the title, the
 * tombstone, the description and the info rows; a playlist entry that is not
 * playing yet shows only the first two.
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
 * of the wrong shape degrades to the fallback instead: the error screen is
 * how this label says it has nothing to show. It only sees json that
 * parsed — text that is not json at all still throws, in nanotags.
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
    (entry) =>
      typeof entry?.icon === "string" && typeof entry?.text === "string",
  );
}

/**
 * One work, as every label takes it: the four things `acmi-work-body`
 * shows, plus how long it runs so a playlist can work out when the ones
 * after it start, and a key that names it in the view transition when the
 * playlist rotates (see `acmi-lifelike-label`).
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
      durationSeconds: Number.isFinite(work.durationSeconds)
        ? work.durationSeconds
        : 0,
      body: typeof work.body === "string" ? work.body : "",
      infoEntries: toInfoEntries(work.infoEntries),
      key: Number.isFinite(work.key) ? work.key : null,
    }));
}

// The schemas only guard the json island and the attribute. Setting the
// property writes to the store untouched, so the components coerce again on
// the way out — the two together are what make every path safe.
const InfoEntriesSchema = lenient(toInfoEntries);
const WorksSchema = lenient(toWorks);

// ---- The timer, as attributes ----

/**
 * What every label takes to draw its timer: three attributes, not a json
 * island, because these change every frame and an attribute is what a
 * template or a devtools panel can poke at. A null ratio is "no timer" —
 * the attribute is absent, no duration is known, or the player has gone
 * quiet — and the ring hides.
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
 * ratio to draw. Every label ends its timer wiring here.
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
 * Hands a label's three timer props down, unchanged, to a child that takes
 * the same three — the nightmare room's info band. The child decides
 * whether its timer shows.
 *
 * @param {any} c the setup context
 * @param {HTMLElement} child
 */
function passTimer(c, child) {
  c.effect(
    [c.props.$timerRatio, c.props.$timerElapsed, c.props.$timerLine],
    (ratio, elapsed, line) => {
      Object.assign(child, { timerRatio: ratio, timerElapsed: elapsed, timerLine: line });
    },
  );
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

/** What each timer's line was last written as, so `setCaption` can compare. */
const captions = new WeakMap();

/**
 * Writes a timer's line — "Starts in 5 minutes" — with each number in a
 * cell of its own. When only the numbers have changed, a minute gone by,
 * each new number is written into its cell over the old one, which fades
 * out as the new one fades in (see `.acmi-timer__number`); any other change
 * is written straight in. Like `setText`, it writes nothing when nothing
 * has changed: the clock asks every frame.
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
 * How far an element's children run past its foot, in pixels, or nothing
 * when they fit.
 *
 * @param {Element} element
 */
function overflowOf(element) {
  const foot = element.getBoundingClientRect().bottom;
  let over = 0;
  for (const child of element.children) {
    over = Math.max(over, child.getBoundingClientRect().bottom - foot);
  }
  return over;
}

/**
 * Copies a work's fields onto an `acmi-work-body`. Every label does this
 * for the work it shows in full.
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
 * The work's title. The prop is `heading` because `title` is a built-in
 * global attribute — the tooltip — and custom element attributes share that
 * namespace.
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
      c.host.hidden = !value;
    });
  });

/**
 * The tombstone: who made the work, then how long it runs. Two lines in
 * the same voice.
 */
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
    c.effect([c.props.$credit, c.props.$duration], (credit, duration) => {
      c.host.hidden = !credit && !duration;
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
 * One row of additional info: an icon, and the text beside it. The text is
 * text — `splitWarnings` takes it out of the cms's markup as such — so it
 * goes in as text, and nothing in it is read as markup again.
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
 *
 * Empty, it hides: the block is always in the markup and only shows when a
 * work has something to say.
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
 * The timer: a ring, the time inside it, and a line under it. The same
 * element everywhere a label needs one. For the work playing now the ring
 * fills as it plays, the time is how far in, and the line is when it comes
 * round again. For a work that has not started, the ring is empty and the
 * line is when it starts.
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
 * The qr block: the code, and beside it what scanning it gets you — the
 * captions icon, then one line. The svg comes from the server already
 * drawn, its colours left as `var(--figure)` / `var(--ground)` for the
 * stylesheet to fill. No svg, no block — which is how a label with no
 * access guide leaves it out.
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

    c.effect(c.props.$svg, (value) => {
      setHtml(code, value);
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

/**
 * The playlist's own title — "Screening Room", say — across the top of
 * every label. It never changes while the label hangs: the works rotate
 * under it.
 */
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
 * One work, in full: title, tombstone, description, additional info. The
 * body of the single-work label, of the nightmare room, and of every
 * playlist entry — an entry that is not playing yet just leaves the last two
 * empty.
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
 * How many slots down the list the rotation staggers, one after another.
 * `style.css` has a rule for each; slots further down move with the last.
 */
const STAGGERED_SLOTS = 8;

/**
 * One work in the playlist: its status, its body, and its timer. The one
 * playing now is `current` and shows everything but the timer, which the
 * label draws in its header; `next` and `later` show the title and
 * tombstone only, with an empty ring and when they start. The title and
 * tombstone look the same in every kind, so they can move up the list
 * unchanged when the playlist rotates. `place` is where the entry sits —
 * its slot in the list; not `slot`, which is a global attribute.
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

    // The work playing now has its timer in the label's header, where the
    // single work has it, so its description takes the full width.
    c.effect(
      [c.props.$kind, c.props.$timerRatio, c.props.$timerElapsed, c.props.$timerLine],
      (kind, ratio, elapsed, line) =>
        setTimer(timer, kind === "current" ? null : ratio, elapsed, line),
    );

    // Named for the view transition when the playlist rotates (see Rotating
    // in style.css). The title, tombstone and timer are named by the work's
    // key, so they move up the list with their work; the timer's name is the
    // one the header's timer takes when this work is playing, so the ring
    // carries on up into the header. The status, and the rest of the entry
    // — its rule, its description — are named by key and slot, which no
    // other state shares, so they fade out and back in rather than moving;
    // the status on its own, as it goes first and comes back last. The slot
    // class staggers it all down the list.
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
 * Adds or removes entries until there are `count` of them. The ones that
 * stay are the same elements as before: when the playlist rotates, each
 * takes the work from the one below it. The view transition pairs a work's
 * parts by the names its key gives them, not by element, so this only saves
 * rebuilding them.
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
 * The works in the playlist, the one playing now first. Pass them as a json
 * island, in playing order:
 *
 * ```html
 * <acmi-playlist-entries seconds-until-next="420">
 *   <script type="application/json" data-prop="works">
 *     [{ "heading": "Signs of Life", "credit": "…", "durationSeconds": 720, … }]
 *   </script>
 * </acmi-playlist-entries>
 * ```
 *
 * The works change when the playlist rotates; `seconds-until-next` changes
 * every second. They are separate props because they move at such different
 * rates — the clock ticking must not touch the list.
 *
 * The first entry has no timer: the label draws it in its header. The clock
 * walks down the rest: the second entry starts when the first ends, and each
 * one after that waits out everything above it.
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

// ---- The nightmare room's header ----

/**
 * What the nightmare room's header says in each mode, unless the server
 * gives it other words — NIGHTMARE_WAITING_TEXT and the like.
 */
const NIGHTMARE_TEXT = {
  waiting: "Please wait here. The next run starts soon.",
  running: "A run is in progress. The next one starts when it ends.",
  unavailable: "The Nightmare Room is not running at the moment.",
  closed: "The Nightmare Room is closed for today.",
};

/**
 * The band across the top of the nightmare room: the mode's text, and the
 * timer while a run is on. The room says which mode it is in (see
 * `acmi-nightmare-room`); only `running` has a timer.
 */
define("acmi-nightmare-info")
  .withProps((f) => ({
    state: f.oneOf(["waiting", "running", "unavailable", "closed"], "waiting"),
    text: f.string(""),
    ...timerProps(f),
  }))
  .setup((c) => {
    c.host.innerHTML = `
      <div class="acmi-nightmare-info__text"></div>
      <acmi-timer class="acmi-nightmare-info__timer" hidden></acmi-timer>
    `;

    const text = c.getElement(".acmi-nightmare-info__text");
    const timer = c.getElement("acmi-timer");

    c.effect(c.props.$text, (value) => setHtml(text, value));
    c.effect(
      [c.props.$state, c.props.$timerRatio, c.props.$timerElapsed, c.props.$timerLine],
      (state, ratio, elapsed, line) =>
        setTimer(timer, state === "running" ? ratio : null, elapsed, line),
    );
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
 * Writes a label's shell and wires what every label shares.
 *
 * The shell is the error screen, and beside it the content: a header band
 * of fixed height, then the body. The band is the same height on every
 * label, whatever it holds — the playlist's title, the timer of the work
 * playing now, the nightmare room's info — so the work's title starts at
 * the same height on all three.
 *
 * Each block inside hides itself when it has nothing, so the label only
 * decides between all of them and the error screen: no works, no label.
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

  // Copy that does not fit its room runs on over the qr code, from the
  // block that fills the room above it, and is cut off at the foot of the
  // content (see style.css). Say so when it starts and when it stops, as
  // the timer does when the player goes quiet, so whoever checks the label
  // hears.
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
  // What is clipped is what is inside each, so watch that: the entries of a
  // playlist come and go, so look again whenever the works change.
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
 *
 * Presentation only — the timer arrives as attributes (see `timerProps`),
 * and whatever advances them lives in `acmi-lifelike-label`, so this element
 * never opens a connection of its own.
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
 * A playlist of works: the one playing now in full, then the others under
 * it with when each starts, and the qr code at the foot. The playlist's own
 * title is top left in the header — only the playlist has one — and the
 * timer of the work playing now top right, as on a single work, so its
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
    // The header's timer is the playing work's, named as that work's timer
    // was in the list, so the view transition slides it up from there, in
    // the first slot's turn.
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
 * The words the server has for the nightmare room's modes, by mode: only
 * strings, for the modes there are.
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
 * The nightmare room: the info band across the top, then the work below
 * it. No qr code, no duration — the room times its own runs — and no
 * upcoming works: the room runs one.
 *
 * The room is in one of four modes, set from TouchOSC (see
 * `app/nightmare_room.py`), and carries it as `data-state` for the
 * stylesheet: `waiting`, `running` — the only one with a timer —
 * `unavailable` and `closed`. Each has its text in the header, the
 * server's when it has some, the label's own when not.
 */
define("acmi-nightmare-room")
  .withProps((f) => ({
    ...labelProps(f),
    state: f.oneOf(["waiting", "running", "unavailable", "closed"], "waiting"),
    texts: f.json(NightmareTextSchema, {}),
  }))
  .setup((c) => {
    const { works } = labelShell(c, {
      header: `<acmi-nightmare-info class="acmi-header__info"></acmi-nightmare-info>`,
      body: `<acmi-work-body></acmi-work-body>`,
    });

    const info = c.getElement("acmi-nightmare-info");
    const body = c.getElement("acmi-work-body");

    c.effect(works, (value) => setWork(body, { ...(value[0] ?? EMPTY_WORK), duration: "" }));
    c.effect(c.props.$state, (state) => {
      c.host.dataset.state = state;
      info.state = state;
    });
    c.effect([c.props.$state, c.props.$texts], (state, texts) => {
      info.text = toNightmareText(texts)[state] || NIGHTMARE_TEXT[state];
    });
    passTimer(c, info);
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

/**
 * Where the item the player names sits among the labelled items, or -1: no
 * report yet, or an item without a label, which the label leaves out.
 */
function playingIndex(items, labelId) {
  return items.findIndex((item) => item.label.id === labelId);
}

/**
 * The items from `index` on, wrapping round: the playlist loops, so the
 * last item in the file is followed by the first.
 */
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
 * Splits a description into the copy and the warnings written into it.
 * A warning in the middle of the body is easy to miss; as a row under it,
 * with an icon, it is not. The paragraph the editor wrapped it in goes too,
 * once it has nothing else in it.
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
 * One item as a work. The info rows are the warnings lifted out of the
 * description; the duration is the tombstone's second line.
 *
 * @param {import("./server").LabelledItem} item
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
 * The line under the ring. A single work loops alone, so the timer's own
 * `restart` is right there. A playlist comes round again only after every
 * other work has played: what is left of this one, then all of them. A run
 * in the nightmare room just ends.
 *
 * @param {keyof typeof VARIANTS} variant
 * @param {TimerDisplay | undefined} timer
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
 * drawn over the page, where the label's own clip does not reach them, so
 * the transition is cut off where the label cuts its copy off — the foot
 * of its content — through --acmi-transition-foot (see Rotating in
 * style.css). And a part that starts below that foot loses its name: it is
 * cut off anyway, and named it would cost a picture of its own, drawn
 * whole as it moved.
 *
 * Called before the transition, for the label as it was, and again inside
 * it, once the works have changed, for the label as it is.
 *
 * @param {Element} label
 */
function fitTransitionToLabel(label) {
  const content = label.querySelector(".acmi-label__content");
  if (!content) return;

  const foot = content.getBoundingClientRect().bottom;
  document.documentElement.style.setProperty(
    "--acmi-transition-foot",
    `${Math.max(0, innerHeight - foot)}px`,
  );
  for (const part of label.querySelectorAll("[style*='view-transition-name']")) {
    if (part.getBoundingClientRect().top >= foot) part.style.viewTransitionName = "";
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
 * The one element a page mounts. Its inputs — which label to draw, where
 * the player reports to (or the nightmare room's mode), and the playlist —
 * and it derives everything the label shows from those, so the labels above
 * stay presentation: content attributes in, timer attributes in, nothing
 * opened.
 *
 * ```html
 * <acmi-lifelike-label variant="playlist" playback-source="/api/playback-stream/">
 *   <script type="application/json" data-prop="playlist">{{ playlist_json | tojson }}</script>
 * </acmi-lifelike-label>
 * ```
 *
 * The variant is read once, at mount: a label is built for the room it hangs
 * in, and changing it later is not something the gallery does. One it does
 * not know draws a single work.
 *
 * The player's stream drives two things: the timer, every frame; and which
 * item is current, when its `label_id` changes — the label moves on to it
 * inside a view transition. The playlist's start times come off the same
 * clock. Without a stream the first item shows in full, the rest stack under
 * it with no times, and there is no timer.
 *
 * The nightmare room follows the room's stream instead, `room-source`: its
 * mode, set from TouchOSC, and while a run is on, the run's clock, which
 * drives its timer as the player's drives the others.
 *
 * Anything else that connects — the tap stream, a playlist refetch, a
 * language toggle — belongs in this setup too, as its own section: a store,
 * then the effect that writes what it derives down to the label.
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

    // Listening is what opens a stream, so a label with no source never
    // connects and never asks for a frame. A single work loops alone, so
    // its ring comes straight round again; a playlist's stops full at the
    // end of a work, until the player says which comes next. The nightmare
    // room's ring times its run instead, and stops full when the run ends,
    // as the room goes back to waiting.
    const $snapshot = playbackSnapshotStore(c.props.$playbackSource);
    const $room = roomSnapshotStore(c.props.$roomSource);
    const $run = computed($room, (room) => (room?.mode === "running" ? room : undefined));
    const $timer =
      variant === "nightmare-room"
        ? timerDisplayStore($run, { loops: false })
        : timerDisplayStore($snapshot, { loops: variant !== "playlist" });

    // ---- What is playing ----

    // Each of these recomputes only when its own inputs change, and a
    // computed store holds its last value: the stream reports every second,
    // but `$index` is a number and only notifies when the item really moves,
    // so `$works` stays put between rotations.
    const $items = computed(c.props.$playlist, labelledItems);
    const $playing = computed([$items, $snapshot], (items, snapshot) =>
      playingIndex(items, snapshot?.labelId),
    );
    // The work shown as playing: the last one the player named that the
    // label lists, or the first until it names one. While the player is on
    // an item without a label, the label stays where it was, and hides the
    // timer (see The clock).
    let lastIndex = 0;
    const $index = computed([$items, $playing], (items, playing) => {
      if (playing !== -1) lastIndex = playing;
      return Math.min(lastIndex, Math.max(items.length - 1, 0));
    });
    const $works = computed([$items, $index], (items, index) =>
      itemsFrom(items, index).map(toWork),
    );

    // ---- Rotating ----

    // When the player moves on, the label changes inside a view transition.
    // Each work carries a key to be named by: its place in the order the
    // room plays them, counted from the first work this label showed. A work
    // keeps its key as it moves up the list, and the one that comes round to
    // the end again gets a new one — so the list slides up a place and the
    // finished work leaves, rather than sweeping down past the others.
    let played = 0;
    let shownIndex = null;
    let playerHadReported = false;
    // While a transition waits to take its picture of the label as it was,
    // the clock holds still, so the old picture is all the old work's.
    let holding = false;

    c.effect($works, (works) => {
      const index = $index.get();
      const rotated = shownIndex !== null && index !== shownIndex && works.length > 0;
      if (rotated) played += (index - shownIndex + works.length) % works.length;
      shownIndex = index;
      const keyed = works.map((work, place) => ({ ...work, key: played + place }));

      // The player's first report only says where it already was: that
      // moves the label, but it is not the room moving on.
      const playerReported = $snapshot.get()?.labelId !== undefined;
      const animate = rotated && playerHadReported && playerReported;
      playerHadReported = playerReported;

      if (!animate || !document.startViewTransition) {
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
        // What the room says in each mode, where the server has words.
        label.texts = playlist?.nightmare_text ?? {};
        return;
      }
      if (variant === "playlist") label.playlistTitle = playlist?.title ?? "";
      // One code, for `QR_URL_OVERRIDE`, or none. The per-language set in
      // `qr_text` is the reverb label's and this label ignores it.
      label.qrSvg = playlist?.qr_svg ?? "";
    });

    // ---- The clock ----

    // One write feeds the ring, the start times, the line under the ring
    // and the nightmare room's mode, all from the one `timer` value, so
    // they can never disagree about how much of the current work is left.
    function writeClock() {
      // On an item the label does not list, the ring would count down
      // something the label is not showing.
      const offList = $playing.get() === -1 && $snapshot.get()?.labelId !== undefined;
      const timer = offList ? undefined : $timer.get();
      label.timerRatio = timer?.ratio ?? null;
      label.timerElapsed = timer?.elapsed ?? "";
      label.timerLine = timerLine(variant, timer, $works.get());
      if (variant === "playlist") label.secondsUntilNext = timer?.remainingSeconds ?? null;
      // Until the room says otherwise, it is waiting, as it starts.
      if (variant === "nightmare-room") label.state = $room.get()?.mode ?? "waiting";
    }

    // Held while a rotation's transition is waiting: the transition writes
    // the clock itself, with the new works, once it has its old picture.
    c.effect([$timer, $works, $playing, $room], () => {
      if (!holding) writeClock();
    });
  });
