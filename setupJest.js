/* eslint-disable */
global.fetch = require('jest-fetch-mock');

// EventSource mock — captures onmessage/onerror so tests can drive SSE events.
global.EventSource = jest.fn().mockImplementation((url) => ({
  url,
  onmessage: null,
  onerror: null,
  close: jest.fn(),
}));

// jsdom has no layout, so it has no ResizeObserver and no Web Animations.
// The lifelike label watches its copy for overflow and waits on the timer
// line's fades: these stand in, observing nothing and fading nothing.
if (typeof window !== 'undefined') {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.getAnimations ??= () => [];
}

// Paho mock kept for legacy test files; no longer used by mqtt-sync.js.
global.Paho = {
  'MQTT': {
    'Client': jest.fn(() => ({
      'connect': jest.fn(),
    }))
  }
}
