/**
 * @jest-environment jsdom
 */
import { labelSignal, playbackSignal } from "../../../app/static/context.js";
import "../../../app/static/digital-label.js";
import playlistJson from "../../data/playlist.json";

function makeElement(wrapInMqttSync = false, mqttSyncAttrs = {}) {
  const inner = document.createElement("acmi-digital-label");
  inner.innerHTML = `
    <h1 class="title"></h1>
    <p class="author"></p>
    <div class="content"></div>
    <acmi-reverb-timer></acmi-reverb-timer>
    <acmi-qr-block></acmi-qr-block>
    <div class="credit-line"></div>
  `;

  if (wrapInMqttSync) {
    const wrapper = document.createElement("acmi-mqtt-sync");
    Object.entries(mqttSyncAttrs).forEach(([k, v]) =>
      wrapper.setAttribute(k, v)
    );
    wrapper.appendChild(inner);
    document.body.appendChild(wrapper);
    return inner;
  }

  document.body.appendChild(inner);
  return inner;
}

beforeEach(() => {
  labelSignal.value = null;
  playbackSignal.value = null;
  document.body.innerHTML = "";
});

describe("acmi-digital-label", () => {
  describe("Label data drives display", () => {
    it("populates title, author, content, and credit-line from data-label-json", () => {
      const elem = makeElement();
      elem.setAttribute("data-label-json", JSON.stringify(playlistJson));

      expect(elem.querySelector(".title").textContent).toBe("Default playlist");
      expect(elem.querySelector(".author").textContent).toContain(
        "Daniel Bronsema"
      );
      expect(elem.querySelector(".content").innerHTML).toContain("Music video");
      expect(elem.querySelector(".credit-line").innerHTML).toContain(
        "Courtesy of the artists"
      );
    });
  });

  describe("Override title", () => {
    it("renders override title and original work title in credit-line", () => {
      const elem = makeElement();
      elem.setAttribute("data-override-title", "Custom Title");
      elem.setAttribute("data-label-json", JSON.stringify(playlistJson));

      expect(elem.querySelector(".title").textContent).toBe("Custom Title");
      expect(elem.querySelector(".credit-line").innerHTML).toContain(
        "Test pattern"
      );
    });
  });

  describe("Reactive re-render on attribute update", () => {
    it("re-renders when data-label-json is updated", () => {
      const elem = makeElement();
      elem.setAttribute("data-label-json", JSON.stringify(playlistJson));
      expect(elem.querySelector(".title").textContent).toBe("Default playlist");

      const updated = { ...playlistJson, title: "Updated playlist" };
      elem.setAttribute("data-label-json", JSON.stringify(updated));
      expect(elem.querySelector(".title").textContent).toBe("Updated playlist");
    });
  });

  describe("Malformed JSON does not throw", () => {
    it("does not throw when data-label-json is invalid", () => {
      const elem = makeElement();
      expect(() => {
        elem.setAttribute("data-label-json", "not-valid-json");
      }).not.toThrow();
    });
  });

  describe("Timer hidden when no acmi-mqtt-sync ancestor", () => {
    it("sets data-hidden on timer when not wrapped in acmi-mqtt-sync", () => {
      const elem = makeElement(false);
      const timer = elem.querySelector("acmi-reverb-timer");
      expect(timer.hasAttribute("data-hidden")).toBe(true);
    });
  });

  describe("Timer visible when acmi-mqtt-sync has data-xos-media-player", () => {
    it("does not set data-hidden when wrapped in acmi-mqtt-sync with data-xos-media-player", () => {
      const elem = makeElement(true, { "data-xos-media-player": "player1" });
      const timer = elem.querySelector("acmi-reverb-timer");
      expect(timer.hasAttribute("data-hidden")).toBe(false);
    });
  });

  describe("Works with JS-only attribute (no Jinja)", () => {
    it("renders correctly when data-label-json is set via JS setAttribute", () => {
      const elem = makeElement();
      elem.setAttribute("data-label-json", JSON.stringify(playlistJson));

      expect(elem.querySelector(".title").textContent).toBe("Default playlist");
      expect(elem.querySelector(".content").innerHTML).toContain("Music video");
    });
  });

  describe("playbackSignal sets timer attributes", () => {
    it("sets data-video-duration and data-video-start-time on timer when playbackSignal updates", () => {
      const elem = makeElement(true, { "data-xos-media-player": "player1" });
      const timer = elem.querySelector("acmi-reverb-timer");

      playbackSignal.value = { duration: 60000, startTime: 12345 };

      expect(timer.getAttribute("data-video-duration")).toBe("60000");
      expect(timer.getAttribute("data-video-start-time")).toBe("12345");
    });
  });

  describe("Effect cleanup in disconnectedCallback", () => {
    it("stops re-rendering after element is removed from DOM", () => {
      const elem = makeElement();
      elem.setAttribute("data-label-json", JSON.stringify(playlistJson));
      expect(elem.querySelector(".title").textContent).toBe("Default playlist");

      elem.remove();

      const updated = { ...playlistJson, title: "Should not appear" };
      labelSignal.value = updated;

      expect(elem.querySelector(".title").textContent).toBe("Default playlist");
    });
  });
});
