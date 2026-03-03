/**
 * @jest-environment jsdom
 */

import { signal, computed, effect } from "../../../app/static/signals";

describe("signal", () => {
  it("should store and return a value", () => {
    const s = signal(42);
    expect(s.get()).toBe(42);
  });

  it("should update value with set", () => {
    const s = signal("hello");
    s.set("world");
    expect(s.get()).toBe("world");
  });

  it("should store null and undefined", () => {
    const s = signal(null);
    expect(s.get()).toBeNull();
    s.set(undefined);
    expect(s.get()).toBeUndefined();
  });
});

describe("computed", () => {
  it("should derive a value from a signal", () => {
    const count = signal(5);
    const doubled = computed(() => count.get() * 2);
    expect(doubled.get()).toBe(10);
  });

  it("should update when the source signal changes", () => {
    const name = signal("A");
    const greeting = computed(() => `Hello, ${name.get()}`);
    expect(greeting.get()).toBe("Hello, A");

    name.set("B");
    expect(greeting.get()).toBe("Hello, B");
  });

  it("should derive from multiple signals", () => {
    const a = signal(3);
    const b = signal(7);
    const sum = computed(() => a.get() + b.get());
    expect(sum.get()).toBe(10);

    a.set(10);
    expect(sum.get()).toBe(17);

    b.set(20);
    expect(sum.get()).toBe(30);
  });

  it("should chain computed values", () => {
    const base = signal(2);
    const doubled = computed(() => base.get() * 2);
    const quadrupled = computed(() => doubled.get() * 2);
    expect(quadrupled.get()).toBe(8);

    base.set(5);
    expect(doubled.get()).toBe(10);
    expect(quadrupled.get()).toBe(20);
  });
});

describe("effect", () => {
  it("should run immediately on creation", () => {
    const fn = jest.fn();
    const s = signal(1);
    effect(() => {
      s.get();
      fn();
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should re-run when a tracked signal changes", () => {
    const s = signal("initial");
    const values = [];
    effect(() => {
      values.push(s.get());
    });
    expect(values).toEqual(["initial"]);

    s.set("updated");
    expect(values).toEqual(["initial", "updated"]);
  });

  it("should track multiple signals", () => {
    const a = signal(1);
    const b = signal(2);
    const results = [];
    effect(() => {
      results.push(a.get() + b.get());
    });
    expect(results).toEqual([3]);

    a.set(10);
    expect(results).toEqual([3, 12]);

    b.set(20);
    expect(results).toEqual([3, 12, 30]);
  });

  it("should re-run when a computed dependency changes", () => {
    const base = signal(5);
    const doubled = computed(() => base.get() * 2);
    const values = [];
    effect(() => {
      values.push(doubled.get());
    });
    expect(values).toEqual([10]);

    base.set(7);
    expect(values).toEqual([10, 14]);
  });
});
