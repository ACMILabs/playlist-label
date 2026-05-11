/**
 * @jest-environment jsdom
 */
import "../../../app/static/qr-block.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

function makeQR(attrs = {}) {
  const elem = document.createElement("acmi-qr-block");
  Object.entries(attrs).forEach(([k, v]) => elem.setAttribute(k, v));
  document.body.appendChild(elem);
  return elem;
}

describe("acmi-qr-block", () => {
  describe("Hidden when data-qr-svg absent or empty", () => {
    it("is hidden when no attributes set", () => {
      const elem = makeQR();
      expect(elem.style.display).toBe("none");
    });

    it("is hidden when data-qr-svg is empty string", () => {
      const elem = makeQR({ "data-qr-svg": "" });
      expect(elem.style.display).toBe("none");
    });
  });

  describe("Visible when data-qr-svg is non-empty", () => {
    it("is visible and renders SVG when data-qr-svg is set", () => {
      const elem = makeQR({ "data-qr-svg": "<svg>test</svg>" });
      expect(elem.style.display).not.toBe("none");
      expect(elem.innerHTML).toContain("<svg>test</svg>");
    });
  });

  describe("Language strip renders alongside QR SVG", () => {
    it("renders English, 简体字, ਪੰਜਾਬੀ, हिन्दी text", () => {
      const elem = makeQR({ "data-qr-svg": "<svg>qr</svg>" });
      const text = elem.innerHTML;
      expect(text).toContain("English");
      expect(text).toContain("简体字");
      expect(text).toContain("ਪੰਜਾਬੀ");
      expect(text).toContain("हिन्दी");
    });
  });

  describe("Caption icon visible when data-show-caption-icon is set", () => {
    it("renders caption SVG and 'and captions' text when attribute is present", () => {
      const elem = makeQR({
        "data-qr-svg": "<svg>qr</svg>",
        "data-show-caption-icon": "",
      });
      expect(elem.innerHTML).toContain("and captions");
      expect(elem.innerHTML).toContain("M54.2,129.94");
    });
  });

  describe("Caption icon absent when data-show-caption-icon is not set", () => {
    it("does not render caption SVG when attribute is absent", () => {
      const elem = makeQR({ "data-qr-svg": "<svg>qr</svg>" });
      expect(elem.innerHTML).not.toContain("and captions");
      expect(elem.innerHTML).not.toContain("M54.2,129.94");
    });
  });

  describe("Reactivity", () => {
    it("hides when data-qr-svg is removed", () => {
      const elem = makeQR({ "data-qr-svg": "<svg>qr</svg>" });
      expect(elem.style.display).not.toBe("none");
      elem.removeAttribute("data-qr-svg");
      expect(elem.style.display).toBe("none");
    });
  });
});
