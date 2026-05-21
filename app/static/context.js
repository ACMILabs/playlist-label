// @ts-check
import { signal } from "./signals.js";

/** @type {import('./signals.js').Signal<Object|null>} */
export const labelSignal = signal(null);

/** @type {import('./signals.js').Signal<Object|null>} */
export const playbackSignal = signal(null);

/** @type {import('./signals.js').Signal<'normal'|'closed'|'doors'|'eventRunning'>} */
export const lrMode = signal("normal");

/** @type {import('./signals.js').Signal<boolean>} */
export const isFilming = signal(false);

/** @type {import('./signals.js').Signal<any>} */
export const doorTime = signal(null);
