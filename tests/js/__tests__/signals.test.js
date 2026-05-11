import { signal, computed, effect } from "../../../app/static/signals.js";

describe("Signals", () => {
  describe("signal", () => {
    it("should create a signal with an initial value", () => {
      const s = signal(5);
      expect(s.value).toBe(5);
    });

    it("should update value when set", () => {
      const s = signal(5);
      s.value = 10;
      expect(s.value).toBe(10);
    });

    it("should not update if value is the same", () => {
      const s = signal(5);
      const listener = jest.fn();
      s.addEventListener("change", listener);
      s.value = 5;
      expect(listener).not.toHaveBeenCalled();
    });

    it("should emit change event when value changes", () => {
      const s = signal(5);
      const listener = jest.fn();
      s.addEventListener("change", listener);
      s.value = 10;
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should emit multiple change events for multiple updates", () => {
      const s = signal(5);
      const listener = jest.fn();
      s.addEventListener("change", listener);
      s.value = 10;
      s.value = 15;
      s.value = 20;
      expect(listener).toHaveBeenCalledTimes(3);
    });
  });

  describe("computed", () => {
    it("should compute initial value from function", () => {
      const a = signal(5);
      const c = computed(() => a.value * 2, [a]);
      expect(c.value).toBe(10);
    });

    it("should recompute when a declared dep changes", () => {
      const a = signal(3);
      const b = signal(4);
      const sum = computed(() => a.value + b.value, [a, b]);
      expect(sum.value).toBe(7);
      a.value = 10;
      expect(sum.value).toBe(14);
      b.value = 1;
      expect(sum.value).toBe(11);
    });

    it("should support empty dependencies", () => {
      const c = computed(() => 42, []);
      expect(c.value).toBe(42);
    });

    it("should be a Signal and emit change events", () => {
      const a = signal(5);
      const c = computed(() => a.value * 2, [a]);
      const listener = jest.fn();
      c.addEventListener("change", listener);
      a.value = 10;
      expect(listener).toHaveBeenCalledTimes(1);
      expect(c.value).toBe(20);
    });

    it("should handle complex computations with multiple deps", () => {
      const x = signal(2);
      const y = signal(3);
      const z = signal(4);
      const result = computed(() => x.value + y.value * z.value, [x, y, z]);
      expect(result.value).toBe(14); // 2 + 3*4
      x.value = 5;
      expect(result.value).toBe(17); // 5 + 3*4
      y.value = 2;
      expect(result.value).toBe(13); // 5 + 2*4
    });
  });

  describe("effect", () => {
    it("should run function on signal change", () => {
      const s = signal(5);
      const calls = [];
      effect([s], () => calls.push(s.value));
      expect(calls).toEqual([5]);
      s.value = 10;
      expect(calls).toEqual([5, 10]);
    });

    it("should run with multiple dependencies", () => {
      const a = signal(1);
      const b = signal(2);
      const calls = [];
      effect([a, b], () => calls.push(a.value + b.value));
      // When effect has multiple deps, the function is called for each dep registration
      expect(calls).toEqual([3, 3]);
      a.value = 2;
      expect(calls).toEqual([3, 3, 4]);
      b.value = 3;
      expect(calls).toEqual([3, 3, 4, 5]);
    });

    it("should return a cleanup function", () => {
      const s = signal(1);
      const calls = [];
      const cleanup = effect([s], () => calls.push(s.value));
      expect(typeof cleanup).toBe("function");
      expect(calls).toEqual([1]);
      s.value = 2;
      expect(calls).toEqual([1, 2]);
      cleanup();
      s.value = 3;
      expect(calls).toEqual([1, 2]);
    });

    it("should stop re-running after cleanup is called", () => {
      const s = signal(1);
      const calls = [];
      const cleanup = effect([s], () => calls.push(s.value));
      expect(calls).toEqual([1]);
      s.value = 2;
      expect(calls).toEqual([1, 2]);
      cleanup();
      s.value = 3;
      expect(calls).toEqual([1, 2]);
    });

    it("should handle cleanup with multiple dependencies", () => {
      const a = signal(1);
      const b = signal(2);
      const calls = [];
      const cleanup = effect([a, b], () => calls.push(a.value + b.value));
      expect(calls).toEqual([3, 3]);
      a.value = 2;
      expect(calls).toEqual([3, 3, 4]);
      cleanup();
      a.value = 3;
      expect(calls).toEqual([3, 3, 4]);
      b.value = 3;
      expect(calls).toEqual([3, 3, 4]);
    });

    it("should work with computed signals as dependencies", () => {
      const a = signal(2);
      const b = signal(3);
      const sum = computed(() => a.value + b.value, [a, b]);
      const calls = [];
      effect([sum], () => calls.push(sum.value));
      expect(calls).toEqual([5]);
      a.value = 3;
      expect(calls).toEqual([5, 6]);
      b.value = 2;
      expect(calls).toEqual([5, 6, 5]);
    });

    it("should handle empty dependencies", () => {
      const calls = [];
      effect([], () => calls.push(1));
      // With no dependencies, effect is never called (no listeners registered)
      expect(calls).toEqual([]);
    });
  });

  describe("Effect cleanup stops re-runs", () => {
    it("should stop re-running after cleanup is called", () => {
      const s = signal(1);
      const calls = [];
      const cleanup = effect([s], () => calls.push(s.value));
      expect(calls).toEqual([1]);
      s.value = 2;
      expect(calls).toEqual([1, 2]);
      cleanup();
      s.value = 3;
      expect(calls).toEqual([1, 2]);
    });

    it("should allow multiple cleanup calls without error", () => {
      const s = signal(1);
      const calls = [];
      const cleanup = effect([s], () => calls.push(s.value));
      cleanup();
      cleanup(); // Should not error
      expect(calls).toEqual([1]);
    });
  });

  describe("Computed recomputes on declared dep change", () => {
    it("should recompute when a declared dep changes", () => {
      const a = signal(3);
      const b = signal(4);
      const sum = computed(() => a.value + b.value, [a, b]);
      expect(sum.value).toBe(7);
      a.value = 10;
      expect(sum.value).toBe(14);
      b.value = 1;
      expect(sum.value).toBe(11);
    });

    it("should recompute with single dependency", () => {
      const x = signal(5);
      const double = computed(() => x.value * 2, [x]);
      expect(double.value).toBe(10);
      x.value = 7;
      expect(double.value).toBe(14);
      x.value = 0;
      expect(double.value).toBe(0);
    });

    it("should recompute with chain of computed signals", () => {
      const a = signal(2);
      const b = computed(() => a.value * 2, [a]);
      const c = computed(() => b.value + 1, [b]);
      expect(c.value).toBe(5); // (2*2)+1
      a.value = 3;
      expect(c.value).toBe(7); // (3*2)+1
    });
  });
});
