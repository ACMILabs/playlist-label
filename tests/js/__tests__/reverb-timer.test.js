/**
 * @jest-environment jsdom
 */
import "../../../app/static/reverb-timer.js";

beforeEach(() => {
  jest.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  document.body.innerHTML = "";
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeTimer() {
  const elem = document.createElement("acmi-reverb-timer");
  elem.innerHTML = `<pre class="ticker"></pre><p class="subtitle"></p>`;
  document.body.appendChild(elem);
  return elem;
}

describe("acmi-reverb-timer", () => {
  describe("Timer loop starts on connect with required attributes", () => {
    it("calls requestAnimationFrame when connected", () => {
      makeTimer();
      expect(window.requestAnimationFrame).toHaveBeenCalled();
    });

    it("updates duration signal when data-video-duration attribute changes", () => {
      const elem = makeTimer();
      elem.setAttribute("data-video-duration", "120000");
      expect(elem.duration.value).toBe(120000);
    });

    it("drives rAF callback and updates ticker text and stroke on frame", () => {
      let rafCallback;
      jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        rafCallback = cb;
        return 42;
      });

      const elem = makeTimer();
      const fiveSecondsAgo = Date.now() - 5000;
      elem.setAttribute("data-video-duration", "60000");
      elem.setAttribute("data-video-start-time", String(fiveSecondsAgo));

      // Invoke the rAF callback manually
      rafCallback();

      const ticker = elem.querySelector(".ticker");
      expect(ticker.textContent).toBe("0:05");
      expect(elem.style.getPropertyValue("--disk-ratio")).toBeTruthy();
    });
  });

  describe("data-hidden attribute", () => {
    it("sets visibility hidden when data-hidden is present", () => {
      const elem = makeTimer();
      elem.setAttribute("data-hidden", "");
      expect(elem.style.visibility).toBe("hidden");
    });

    it("sets visibility visible when data-hidden is removed", () => {
      const elem = makeTimer();
      elem.setAttribute("data-hidden", "");
      elem.removeAttribute("data-hidden");
      expect(elem.style.visibility).toBe("visible");
    });
  });

  describe("rAF cancelled in disconnectedCallback", () => {
    it("calls cancelAnimationFrame with the handler ID on disconnect", () => {
      const elem = makeTimer();
      document.body.removeChild(elem);
      expect(window.cancelAnimationFrame).toHaveBeenCalledWith(42);
    });
  });
});
