const API_URL = "https://admin.acmi.net.au/api/v2/events/";
const LIMIT = 20;
/**
 * @param {number} offset
 * @param {number} limit
 * @returns {Promise<{ eventCount: number; events: { id: number; parentId: number; title: string; performanceTime: string; tags: string[]; }[]; numEvents: number; } | null>}
 */
const getEventPage = async (offset, limit) => {
  const eventUrl = new URL(API_URL);
  eventUrl.searchParams.set("offset", offset.toString(10));
  eventUrl.searchParams.set("limit", limit.toString(10));
  eventUrl.searchParams.set(
    "fields",
    "_,title,parent,first_performance,id,event_tags"
  );
  console.log(eventUrl.toString());
  return fetch(eventUrl, {
    method: "GET",
  })
    .then((r) => r.json())
    .then((o) => {
      return {
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
      };
    })
    .catch((e) => {
      console.error(e);
      return null;
    });
};
/**
 * @returns {Promise<{ id: number; parentId: number; title: string; performanceTime: string; }[]>}
 */
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
    if (result.events.length === 0) break;
    offset += events.length;
    events.push(...result.events);
  }
  return events;
};
export default class EventTimeManager {
  eventParentID;

  events;

  /**
   * @private
   * @param {number} eventParentID
   */
  constructor(eventParentID) {
    this.eventParentID = eventParentID;
  }

  /**
   * @private
   * @returns {Promise<void>}
   */
  async setup() {
    let relevantEvents = [];
    const allEvents = await getEvents().catch((e) => null);
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
        .map((e) => ({ time: e.performanceTime, title: e.title }));
    }
    this.events = relevantEvents.map((re) => {
      return {
        time: Temporal.ZonedDateTime.from(re.time),
        title: re.title,
      };
    });
  }

  /**
   * @static
   * @param {number} eventParentID
   * @returns {Promise<EventTimeManager>}
   */
  static async create(eventParentID) {
    const e = new this(eventParentID);
    await e.setup();
    return e;
  }
}
/**
 * @typedef {Object} EventGet
 * @property {Object} "meta"
 * @property {number} "meta"."total_count"
 * @property {{    "id": number,    "meta": {      "parent": {        "id": number,        "title": string      }1    }    "title": string    "first_performance": string, event_tags: {id:number,slug:string}[]    "relevance": null  }[]} items
 */
