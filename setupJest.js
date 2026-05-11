/* eslint-disable */
global.fetch = require('jest-fetch-mock');

// EventSource mock — captures onmessage/onerror so tests can drive SSE events.
global.EventSource = jest.fn().mockImplementation((url) => ({
  url,
  onmessage: null,
  onerror: null,
  close: jest.fn(),
}));

// Paho mock kept for legacy test files; no longer used by mqtt-sync.js.
global.Paho = {
  'MQTT': {
    'Client': jest.fn(() => ({
      'connect': jest.fn(),
    }))
  }
}
