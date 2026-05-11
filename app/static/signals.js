/* eslint-disable max-classes-per-file */
/** @extends EventTarget */
class Signal extends EventTarget {
  #value;

  /**
   * @param {T} value
   */
  constructor(value) {
    super();
    this.#value = value;
  }

  /**
   * @returns {T}
   */
  get value() {
    return this.#value;
  }

  /**
   * @param {T} value
   */
  set value(value) {
    if (this.#value === value) return;
    this.#value = value;
    this.dispatchEvent(new CustomEvent("change"));
  }

  /**
   * @param {() => void} fn
   * @returns {() => void}
   */
  effect(fn) {
    fn();
    this.addEventListener("change", fn);
    return () => this.removeEventListener("change", fn);
  }

  /**
   * @returns {T}
   */
  valueOf() {
    return this.#value;
  }

  /**
   * @returns {string}
   */
  toString() {
    return String(this.#value);
  }
}
/** @extends Signal<T> */
class Computed extends Signal {
  /**
   * @param {() => T} fn
   * @param {Signal<unknown>[]} deps
   */
  constructor(fn, deps) {
    super(fn());
    const listener = () => {
      this.value = fn();
    };
    deps.forEach((dep) => dep.addEventListener("change", listener));
    this.#dispose = () =>
      deps.forEach((dep) => dep.removeEventListener("change", listener));
  }

  #dispose;

  dispose() {
    this.#dispose();
  }
}
/**
 * Creates a reactive variable (signal) with the given data.
 * What are signals?: https://www.dhiwise.com/post/how-to-implement-signals-in-javascript-for-event-handling
 * @template T
 * @param {T} data
 * @returns {Signal<T>}
 */
export const signal = (data) => new Signal(data);
/**
 * Creates a computed signal that recomputes its value when any of the dependencies change.
 * @template T
 * @param {() => T} fn - Function that computes the value of the signal.
 * @param {Signal<unknown>[]} deps - Dependencies of the computed signal that trigger a recompute when they change.
 * @returns {Computed<T>}
 */
export const computed = (fn, deps) => new Computed(fn, deps);
/**
 * Creates an effect that runs the given function when any of the dependencies change.
 * @param {Signal<unknown>[]} deps - Dependencies of the effect that trigger a recompute when they change.
 * @param {() => void} fn - Function to run when the dependencies change.
 * @returns {() => void}
 */
export function effect(deps, fn) {
  const removeListeners = deps.map((dep) => dep.effect(fn));
  return () => removeListeners.forEach((removeListener) => removeListener());
}
