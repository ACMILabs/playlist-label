// @ts-check

const API_URL = "/api/events/";
const LIMIT = 50;

// eslint-disable-next-line no-undef
const CLOSED_TIME = Temporal.Duration.from({ minutes: 30 });
// eslint-disable-next-line no-undef
const DOORS_TIME = Temporal.Duration.from({ minutes: 15 });
// eslint-disable-next-line no-undef
const DURATION = Temporal.Duration.from({ hours: 1 });

/**
 * @param {number} offset
 * @param {number} limit
 * @returns {Promise<{eventCount: number; events: RawEvent[]; numEvents: number} | null>}
 */
const getEventPage = async (offset, limit) => {
  const eventUrl = new URL(API_URL, window.location.href);
  eventUrl.searchParams.set("offset", offset.toString(10));
  eventUrl.searchParams.set("limit", limit.toString(10));
  eventUrl.searchParams.set(
    "fields",
    "_,title,parent,first_performance,id,event_tags"
  );

  return fetch(eventUrl, { method: "GET" })
    .then((r) => r.json())
    .then((o) => ({
      eventCount: o.meta.total_count,
      events: o.items
        .map((v) => {
          try {
            const value = {
              id: v.id ?? -1,
              parentId: v.meta.parent.id ?? -1,
              title: v.title,
              tags: v.event_tags.map((t) => t.slug),
              performanceTime: v.first_performance,
            };
            if (value.id === -1 || value.parentId === -1) return undefined;
            return value;
          } catch (e) {
            console.error(e);
            return undefined;
          }
        })
        .filter((e) => e !== undefined),
      numEvents: o.items.length,
    }))
    .catch((e) => {
      console.error(e);
      return null;
    });
};

/** @returns {Promise<RawEvent[]>} */
const getEvents = async () => {
  let numEvents = Infinity;
  const events = [];
  let offset = 0;

  while (events.length < numEvents && offset < numEvents) {
    const result = await getEventPage(offset, LIMIT);
    if (result == null) {
      throw new Error("could not get events");
    }
    numEvents = result.eventCount;
    offset += LIMIT;
    events.push(...result.events);
  }
  return events;
};

export default class EventTimeManager {
  /** @type {number} */
  eventParentID;

  /** @type {EventEntry[]} */
  events;

  /** @param {number} eventParentID */
  constructor(eventParentID) {
    this.eventParentID = eventParentID;
    this.events = [];
  }

  /** @param {() => Promise<RawEvent[]>} fetchEvents @returns {Promise<void>} */
  async setup(fetchEvents) {
    let relevantEvents = [];
    const allEvents = await fetchEvents().catch(() => null);

    if (allEvents == null) {
      console.log(`Couldn't get events from server, using cache`);
      const eventJSON = window.localStorage.getItem("reverb-events");
      if (eventJSON === null) {
        throw new Error("could not get events");
      }
      relevantEvents = JSON.parse(eventJSON);
    } else {
      relevantEvents = allEvents
        .filter((e) => e.parentId === this.eventParentID)
        .map((e) => ({
          time: e.performanceTime,
          title: e.title,
          tags: e.tags,
        }));
    }

    this.events = relevantEvents.map((re) => ({
      // eslint-disable-next-line no-undef
      time: Temporal.PlainDateTime.from(re.time).toZonedDateTime(
        "Australia/Melbourne"
      ),
      title: re.title,
      tags: re.tags,
    }));
  }

  /**
   * @param {number} eventParentID
   * @param {() => Promise<RawEvent[]>} [fetchEvents]
   * @returns {Promise<EventTimeManager>}
   */
  static async create(eventParentID, fetchEvents = getEvents) {
    const e = new this(eventParentID);
    await e.setup(fetchEvents);
    return e;
  }
}

/**
 * @param {Temporal.InstantLike} now
 * @param {EventEntry[]} events
 * @returns {{ mode: 'normal'|'closed'|'doors'|'eventRunning'; filmed: boolean; title: string | null; doorTime: Temporal.ZonedDateTime | null }}
 */
export function getMode(now, events) {
  /** @type {'normal'|'closed'|'doors'|'eventRunning'} */
  let mode = "normal";
  let title = null;
  let filmed = false;
  /** @type {Temporal.ZonedDateTime | null} */
  let doorTime = null;

  for (const event of events) {
    const doorsOpen = event.time.subtract(DOORS_TIME);
    const soundCheck = doorsOpen.subtract(CLOSED_TIME);
    const endTime = event.time.add(DURATION);

    // eslint-disable-next-line no-undef
    if (Temporal.Instant.compare(now, endTime) === 1) continue;

    // eslint-disable-next-line no-undef
    if (Temporal.Instant.compare(now, soundCheck) === -1) continue;

    title = event.title;
    filmed = event.tags.includes("event_being_filmed");
    doorTime = doorsOpen;

    // eslint-disable-next-line no-undef
    if (Temporal.Instant.compare(now, doorsOpen) === -1) {
      mode = "closed";
      break;
    }
    // eslint-disable-next-line no-undef
    if (Temporal.Instant.compare(now, event.time) === -1) {
      mode = "doors";
      break;
    }
    mode = "eventRunning";
    break;
  }

  return { mode, filmed, title, doorTime };
}

/**
 * @typedef {{ id: number; parentId: number; title: string; tags: string[]; performanceTime: string }} RawEvent
 */

/**
 * @typedef {{ time: Temporal.ZonedDateTime; title: string; tags: string[] }} EventEntry
 */

/**
 * @typedef {Object} EventGet
 * @property {{ total_count: number }} meta
 * @property {{
 *   id: number;
 *   meta: { parent: { id: number; title: string } };
 *   title: string;
 *   first_performance: string;
 *   event_tags: { id: number; slug: string }[];
 *   relevance: null
 * }[]} items
 */

if (import.meta.main) {
  const ev = await EventTimeManager.create(142666);
  const { events } = ev;
  // eslint-disable-next-line no-undef
  const now = Temporal.ZonedDateTime.from({
    year: 2026,
    month: 6,
    day: 7,
    hour: 19,
    minute: 50,
    timeZone: "Australia/Melbourne",
  });
  console.log(getMode(now, events));
}
