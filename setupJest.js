/* eslint-disable */
global.fetch = require('jest-fetch-mock');

// Tests drive the stream through onmessage and onerror.
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

global.Paho = {
  'MQTT': {
    'Client': jest.fn(() => ({
      'connect': jest.fn(),
    }))
  }
}
