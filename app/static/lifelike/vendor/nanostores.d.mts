//#region atom/index.d.ts
type AllKeys<T> = T extends any ? keyof T : never;
type Primitive = boolean | number | string;
type ReadonlyIfObject<Value> = Value extends undefined ? Value : Value extends ((...args: any) => any) ? Value : Value extends Primitive ? Value : Value extends object ? Readonly<Value> : Value;
/**
 * Store object.
 */
export interface ReadableAtom<Value = any> {
  /**
   * Compares the previous and next values on every `set`.
   *
   * Returning `true` means the values are the same, so the store keeps the old
   * value and no listener is called.
   *
   * @remarks
   * Called only by the store's own writes, so a store that never writes never
   * calls it. `Map#setKey` uses {@link MapStore#eqKey} instead.
   *
   * Before the first write, `oldValue` can be `undefined`, for instance on the
   * first run of a computed store.
   *
   * @default Object.is
   * @returns `true` if the values are equal, `false` otherwise.
   */
  eq(oldValue: ReadonlyIfObject<Value> | undefined, newValue: ReadonlyIfObject<Value>): boolean;
  /**
   * Get store value.
   *
   * In contrast with {@link ReadableAtom#value} this value will be always
   * initialized even if store had no listeners.
   *
   * ```js
   * $store.get()
   * ```
   *
   * @returns Store value.
   */
  get(): Value;
  /**
   * Low-level attribute to read store’s initial value.
   */
  readonly init: undefined | Value;
  /**
   * Listeners count.
   */
  readonly lc: number;
  /**
   * Subscribe to store changes.
   *
   * In contrast with {@link Store#subscribe} it do not call listener
   * immediately.
   *
   * @param listener Callback with store value and old value.
   * @returns Function to remove listener.
   */
  listen(listener: (value: ReadonlyIfObject<Value>, oldValue: ReadonlyIfObject<Value> | undefined) => void): () => void;
  /**
   * Low-level method to notify listeners about changes in the store.
   *
   * Can cause unexpected behaviour when combined with frontend frameworks
   * that perform equality checks for values, such as React.
   */
  notify(oldValue?: ReadonlyIfObject<Value>): void;
  /**
   * Unbind all listeners.
   */
  off(): void;
  /**
   * Subscribe to store changes and call listener immediately.
   *
   * ```
   * import { $router } from '../store'
   *
   * $router.subscribe(page => {
   *   console.log(page)
   * })
   * ```
   *
   * @param listener Callback with store value and old value.
   * @returns Function to remove listener.
   */
  subscribe(listener: (value: ReadonlyIfObject<Value>, oldValue?: ReadonlyIfObject<Value>) => void): () => void;
  /**
   * Low-level method to read store’s value without calling `onStart`.
   *
   * Try to use only {@link ReadableAtom#get}.
   * Without subscribers, value can be undefined.
   */
  readonly value: undefined | Value;
}
/**
 * Store with a way to manually change the value.
 */
export interface WritableAtom<Value = any> extends ReadableAtom<Value> {
  /**
   * Change store value.
   *
   * ```js
   * $router.set({ path: location.pathname, page: parse(location.pathname) })
   * ```
   *
   * @param newValue New store value.
   */
  set(newValue: Value): void;
}
export interface PreinitializedWritableAtom<Value> extends WritableAtom<Value> {
  readonly value: Value;
}
export type Atom<Value = any> = ReadableAtom<Value> | WritableAtom<Value>;
/**
 * Create store with atomic value. It could be a string or an object, which you
 * will replace completely.
 *
 * If you want to change keys in the object inside store, use {@link map}.
 *
 * ```js
 * import { atom, onMount } from 'nanostores'
 *
 * // Initial value
 * export const $router = atom({ path: '', page: 'home' })
 *
 * function parse () {
 *   $router.set({ path: location.pathname, page: parse(location.pathname) })
 * }
 *
 * // Listen for URL changes on first store’s listener.
 * onMount($router, () => {
 *   parse()
 *   window.addEventListener('popstate', parse)
 *   return () => {
 *     window.removeEventListener('popstate', parse)
 *   }
 * })
 * ```
 *
 * @param initialValue Initial value of the store.
 * @returns The store object with methods to subscribe.
 */
export declare function atom<Value, StoreExt = object>(...args: undefined extends Value ? [] | [Value] : [Value]): PreinitializedWritableAtom<Value> & StoreExt;
/**
 * Change store type for readonly for export.
 *
 * ```ts
 * import { readonlyType } from 'nanostores'
 *
 * const $storePrivate = atom(0)
 *
 * export const $store = readonlyType($storePrivate)
 * ```
 *
 * @param store The store to be exported.
 * @returns The readonly store.
 */
export declare function readonlyType<Value>(store: ReadableAtom<Value>): ReadableAtom<Value>;
/**
 * Run multiple store changes as a single transaction. While inside `batch`,
 * listeners are deferred and each listener fires at most once when the
 * outermost `batch` returns — with the final store values.
 *
 * Batches can be nested; only the outermost batch triggers the flush.
 *
 * Synchronous only. The batch closes when `fn` returns, so writes performed
 * in microtasks, timers, or after `await` will not be batched. Pass a sync
 * function.
 *
 * `Map#setKey` writes are coalesced as well, so the listener's `changed`
 * argument is `undefined` for the batched notification.
 *
 * ```ts
 * import { atom, batch } from 'nanostores'
 *
 * let $a = atom(0)
 * let $b = atom(0)
 *
 * batch(() => {
 *   $a.set(1)
 *   $b.set(2)
 * })
 * ```
 *
 * @param fn Callback that performs the store writes.
 */
export declare function batch(fn: () => void): void;
//#endregion
//#region map/index.d.ts
type KeyofBase = keyof any;
type Get<T, K extends KeyofBase> = T extends any ? K extends keyof T ? T[K] : never : never;
type HasIndexSignature<T> = string extends keyof T ? true : false;
type ValueWithUndefinedForIndexSignatures<Value, Key extends KeyofBase> = Value extends any ? HasIndexSignature<Value> extends true ? undefined | Get<Value, Key> : Get<Value, Key> : never;
export type WritableStore<Value = any> = (Value extends object ? MapStore<Value> : never) | WritableAtom<Value>;
export type Store<Value = any> = ReadableAtom<Value> | WritableStore<Value>;
export type Gettable<Value = any> = {
  get(): Value;
};
export type AnyStore<Value = any> = Gettable<Value> & {
  readonly value: undefined | Value;
};
export type ListenableStore<Value = any> = Gettable<Value> & {
  listen(listener: () => void): () => void;
};
export type StoreValue<SomeStore> = SomeStore extends Gettable<infer Value> ? Value : any;
export type MapStoreKeys<SomeStore> = SomeStore extends MapStore ? AllKeys<StoreValue<SomeStore>> : SomeStore extends {
  setKey: (key: infer K, ...args: any[]) => any;
} ? K : AllKeys<StoreValue<SomeStore>>;
export interface MapStore<Value extends object = any> extends WritableAtom<Value> {
  /**
   * Compares the previous and next values for a key on `setKey`.
   *
   * Returning `true` means the values are the same, so the store keeps the old
   * value and no listener is called.
   *
   * One function serves every key of the map, so the key name comes as the
   * third argument. The old value is `undefined` when the key is not in the map
   * yet.
   *
   * @remarks
   * Deleting an existing key skips the comparison and notifies either way.
   * Whole-value writes use {@link ReadableAtom#eq} instead.
   *
   * @default Object.is
   * @returns `true` if the values are equal, `false` otherwise.
   */
  eqKey<Key extends AllKeys<Value>>(oldValue: Get<Value, Key> | undefined, newValue: Get<Value, Key> | undefined, key: Key): boolean;
  /**
   * Subscribe to store changes.
   *
   * In contrast with {@link Store#subscribe} it do not call listener
   * immediately.
   *
   * @param listener Callback with store value and old value.
   * @param changedKey Key that changed, when the notification carries one.
   * @returns Function to remove listener.
   */
  listen(listener: (value: ReadonlyIfObject<Value>, oldValue: ReadonlyIfObject<Value> | undefined, changedKey: AllKeys<Value> | undefined) => void): () => void;
  /**
   * Low-level method to notify listeners about changes in the store.
   *
   * Can cause unexpected behaviour when combined with frontend frameworks
   * that perform equality checks for values, such as React.
   */
  notify(oldValue?: ReadonlyIfObject<Value>, changedKey?: AllKeys<Value>): void;
  /**
   * Change store value.
   *
   * ```js
   * $settings.set({ theme: 'dark' })
   * ```
   *
   * Operation is atomic, subscribers will be notified once with the new value.
   * `changedKey` will be undefined
   *
   * @param newValue New store value.
   */
  set(newValue: Value): void;
  /**
   * Change key in store value.
   *
   * ```js
   * $settings.setKey('theme', 'dark')
   * ```
   *
   * To delete key set `undefined`.
   *
   * ```js
   * $settings.setKey('theme', undefined)
   * ```
   *
   * @param key The key name.
   * @param value New value.
   */
  setKey<Key extends AllKeys<Value>>(key: Key, value: ValueWithUndefinedForIndexSignatures<Value, Key>): void;
  /**
   * Subscribe to store changes and call listener immediately.
   *
   * ```
   * import { $router } from '../store'
   *
   * $router.subscribe(page => {
   *   console.log(page)
   * })
   * ```
   *
   * @param listener Callback with store value and old value.
   * @param changedKey Key that changed, when the notification carries one.
   * @returns Function to remove listener.
   */
  subscribe(listener: (value: ReadonlyIfObject<Value>, oldValue: ReadonlyIfObject<Value> | undefined, changedKey: AllKeys<Value> | undefined) => void): () => void;
}
export interface PreinitializedMapStore<Value extends object = any> extends MapStore<Value> {
  readonly value: Value;
}
/**
 * Create map store with an initial value. Map store is a store with
 * key-value object as a store value.
 *
 * @param value Initial store value.
 * @returns The store object with methods to subscribe.
 */
export declare function map<Value extends object, StoreExt extends object = object>(value: Value): PreinitializedMapStore<Value> & StoreExt;
/**
 * Create map store with no initial value, or one that may be missing.
 *
 * @param value Initial store value, if there is one.
 * @returns The store object with methods to subscribe.
 */
export declare function map<Value extends object, StoreExt extends object = object>(value?: Value): PreinitializedMapStore<Partial<Value>> & StoreExt;
//#endregion
//#region map-creator/index.d.ts
export interface MapCreator<Value extends object = any, Args extends any[] = []> {
  (id: string, ...args: Args): MapStore<{
    id: string;
  } & Value>;
  build(id: string, ...args: Args): MapStore<{
    id: string;
  } & Value>;
  cache: {
    [id: string]: MapStore<{
      id: string;
    } & Value>;
  };
}
/**
 * Create function to create map stores. It will be like a class for store.
 *
 * @param init Store’s initializer. Returns store destructor.
 */
export declare function mapCreator<Value extends object, Args extends any[] = [], StoreExt extends object = object>(init?: (store: MapStore<{
  id: string;
} & Value> & StoreExt, id: string, ...args: Args) => (() => void) | void): MapCreator<Value, Args>;
//#endregion
//#region clean-stores/index.d.ts
export declare const clean: unique symbol;
/**
 * Destroys all cached stores and call
 *
 * It also reset all tasks by calling {@link cleanTasks}.
 *
 * ```js
 * import { cleanStores } from 'nanostores'
 *
 * afterEach(() => {
 *   cleanStores($router, $settings)
 * })
 * ```
 *
 * @param stores Used store classes.
 * @return Promise for stores destroying.
 */
export declare function cleanStores(...stores: (MapCreator<any, any[]> | Store | undefined)[]): void;
//#endregion
//#region task/index.d.ts
export interface Task<Value> extends Promise<Value> {
  t: true;
}
/**
 * Track store async task by start/end functions.
 * It is useful for test to wait end of the processing.
 *
 * It you use `async`/`await` in task, you can use {@link task}.
 *
 * ```ts
 * import { startTask } from 'nanostores'
 *
 * function saveUser () {
 *   const endTask = startTask()
 *   api.submit('/user', user.get(), () => {
 *     $user.setKey('saved', true)
 *     endTask()
 *   })
 * }
 * ```
 */
export declare function startTask(): () => void;
/**
 * Track store async task by wrapping promise callback.
 * It is useful for test to wait end of the processing.
 *
 * ```ts
 * import { task } from 'nanostores'
 *
 * async function saveUser () {
 *   await task(async () => {
 *     await api.submit('/user', user.get())
 *     $user.setKey('saved', true)
 *   })
 * }
 * ```
 *
 * @param cb Async callback with task.
 * @return Return value from callback.
 */
export declare function task<Return = never>(cb: () => Promise<Return> | Return): Task<Return>;
/**
 * Return Promise until all current tasks (and tasks created while waiting).
 *
 * It is useful in tests to wait all async processes in the stores.
 *
 * ```ts
 * import { allTasks } from 'nanostores'
 *
 * it('saves user', async () => {
 *   saveUser()
 *   await allTasks()
 *   expect($user.get().saved).toBe(true)
 * })
 * ```
 */
export declare function allTasks(): Promise<void>;
/**
 * Forget all tracking tasks. Use it only for tests.
 * {@link cleanStores} cleans tasks automatically.
 *
 * ```js
 * import { cleanTasks } from 'nanostores'
 *
 * afterEach(() => {
 *   cleanTasks()
 * })
 * ```
 */
export declare function cleanTasks(): void;
//#endregion
//#region computed/index.d.ts
export type StoreValues<Stores extends readonly Gettable[]> = { -readonly [Index in keyof Stores]: StoreValue<Stores[Index]>; };
interface Computed {
  /**
   * @deprecated Use `@nanostores/async`.
   */
  <Value, OriginStore extends Store>(stores: OriginStore, cb: (value: StoreValue<OriginStore>) => Task<Value>): ReadableAtom<undefined | Value>;
  /**
   * @deprecated Use `@nanostores/async`.
   */
  <Value, OriginStores extends readonly Store[]>(stores: readonly [...OriginStores], cb: (...values: StoreValues<OriginStores>) => Task<Value>): ReadableAtom<undefined | Value>;
  <Value, OriginStore extends Store>(stores: OriginStore, cb: (value: StoreValue<OriginStore>) => Value): ReadableAtom<Value>;
  /**
   * Create derived store, which use generates value from another stores.
   *
   * ```js
   * import { computed } from 'nanostores'
   *
   * import { $users } from './users.js'
   *
   * export const $admins = computed($users, users => {
   *   return users.filter(user => user.isAdmin)
   * })
   * ```
   *
   * Use `@nanostores/async` for async function.
   */
  <Value, OriginStores extends readonly Store[]>(stores: readonly [...OriginStores], cb: (...values: StoreValues<OriginStores>) => Task<Value> | Value): ReadableAtom<Value>;
}
export declare const computed: Computed;
interface Batched {
  <Value, OriginStore extends Store>(stores: OriginStore, cb: (value: StoreValue<OriginStore>) => Task<Value> | Value): ReadableAtom<Value>;
  /**
   * Create derived store, which use generates value from another stores.
   *
   * ```js
   * import { batched } from 'nanostores'
   *
   * const $sortBy = atom('id')
   * const $category = atom('')
   *
   * export const $link = batched([$sortBy, $category], (sortBy, category) => {
   *   return `/api/entities?sortBy=${sortBy}&category=${category}`
   * })
   * ```
   */
  <Value, OriginStores extends readonly Store[]>(stores: readonly [...OriginStores], cb: (...values: StoreValues<OriginStores>) => Task<Value> | Value): ReadableAtom<Value>;
}
export declare const batched: Batched;
//#endregion
//#region deep-map/path.d.ts
type ConcatPath<T extends string, P extends string> = T extends '' ? P : `${T}.${P}`;
type Length<T extends any[]> = T extends {
  length: infer L;
} ? L : never;
type BuildTuple<L extends number, T extends any[] = []> = T extends {
  length: L;
} ? T : BuildTuple<L, [...T, any]>;
type Subtract<A extends number, B extends number> = BuildTuple<A> extends [...infer U, ...BuildTuple<B>] ? Length<U> : never;
export type AllPaths<T, P extends string = '', MaxDepth extends number = 10> = T extends (infer U)[] ? `${P}[${number}]` | AllPaths<U, `${P}[${number}]`, Subtract<MaxDepth, 1>> | P : T extends BaseDeepMap ? MaxDepth extends 0 ? never : { [K in keyof T]-?: K extends number | string ? AllPaths<T[K], ConcatPath<P, `${K}`>, Subtract<MaxDepth, 1>> | (P extends '' ? never : P) : never; }[keyof T] : P;
type IsNumber<T extends string> = T extends `${number}` ? true : false;
type ElementType<T> = T extends (infer U)[] ? U : never;
type Unwrap<T, P> = P extends `[${infer I}]${infer R}` ? [ElementType<T>, IsNumber<I>] extends [infer Item, true] ? R extends '' ? Item : Unwrap<Item, R> : never : never;
type NestedObjKey<T, P> = P extends `${infer A}.${infer B}` ? A extends keyof T ? FromPath<NonNullable<T[A]>, B> : never : never;
type NestedObjKeyWithIndexSignatureUndefined<T, P> = P extends `${infer A}.${infer B}` ? A extends keyof T ? FromPathWithIndexSignatureUndefined<NonNullable<T[A]>, B> : never : never;
type NestedArrKey<T, P> = P extends `${infer A}[${infer I}]${infer R}` ? [A, NonNullable<T[Extract<A, keyof T>]>, IsNumber<I>] extends [keyof T, (infer Item)[], true] ? R extends '' ? Item : R extends `.${infer NewR}` ? FromPath<Item, NewR> : R extends `${infer Indices}.${infer MoreR}` ? FromPath<Unwrap<Item, Indices>, MoreR> : Unwrap<Item, R> : never : never;
export type FromPath<T, P> = T extends unknown ? NestedArrKey<T, P> extends never ? NestedObjKey<T, P> extends never ? P extends keyof T ? T[P] : never : NestedObjKey<T, P> : NestedArrKey<T, P> : never;
type FromPathWithIndexSignatureUndefined<T, P> = T extends unknown ? NestedArrKey<T, P> extends never ? NestedObjKeyWithIndexSignatureUndefined<T, P> extends never ? P extends keyof T ? ValueWithUndefinedForIndexSignatures<T, P> : never : NestedObjKeyWithIndexSignatureUndefined<T, P> : NestedArrKey<T, P> : never;
export type BaseDeepMap = Record<string, unknown>;
/**
 * Get a value by object path. `undefined` if key is missing.
 *
 * ```
 * import { getPath } from 'nanostores'
 *
 * getPath({ a: { b: { c: ['hey', 'Hi!'] } } }, 'a.b.c[1]') // Returns 'Hi!'
 * ```
 *
 * @param obj Any object.
 * @param path Path split by dots and `[]`. Like: `props.arr[1].nested`.
 * @returns The value for this path. Undefined if key is missing.
 */
export declare function getPath<T extends BaseDeepMap, K extends AllPaths<T>>(obj: T, path: K): FromPath<T, K>;
/**
 * Set a deep value by path. Copies are made at each level of `path` so that no
 * part of the original object is mutated (but it does not do a full deep copy
 * -- some sub-objects may still be shared between the old value and the new
 * one). Sparse arrays will be created if you set arbitrary length.
 *
 * ```
 * import { setPath } from 'nanostores'
 *
 * setPath({ a: { b: { c: [] } } }, 'a.b.c[1]', 'hey')
 * // Returns `{ a: { b: { c: [<empty>, 'hey'] } } }`
 * ```
 *
 * @param obj Any object.
 * @param path Path split by dots and `[]`. Like: `props.arr[1].nested`.
 * @returns The new object.
 */
export declare function setPath<T extends BaseDeepMap, K extends AllPaths<T>>(obj: T, path: K, value: FromPath<T, K>): T;
/**
 * Set a deep value by key. Copies are made at each level of `path` so that no
 * part of the original object is mutated (but it does not do a full deep copy
 * -- some sub-objects may still be shared between the old value and the new
 * one). Sparse arrays will be created if you set arbitrary length.
 *
 * ```
 * import { setByKey } from 'nanostores'
 *
 * setByKey({ a: { b: { c: [] } } }, ['a', 'b', 'c', 1], 'hey')
 * // Returns `{ a: { b: { c: [<empty>, 'hey'] } } }`
 * ```
 *
 * @param obj Any object.
 * @param splittedKeys An array of keys representing the path to the value.
 * @param value New value.
 * @returns The new object.
 */
export declare function setByKey<T extends BaseDeepMap>(obj: T, splittedKeys: PropertyKey[], value: unknown): T;
//#endregion
//#region deep-map/index.d.ts
export type DeepMapStore<T extends BaseDeepMap> = {
  /**
   * Subscribe to store changes.
   *
   * In contrast with {@link Store#subscribe} it do not call listener
   * immediately.
   *
   * @param listener Callback with store value and old value.
   * @param changedKey Key that changed, when the notification carries one.
   * @returns Function to remove listener.
   */
  listen(listener: (value: T, oldValue: T | undefined, changedKey: AllPaths<T> | undefined) => void): () => void;
  /**
   * Low-level method to notify listeners about changes in the store.
   *
   * Can cause unexpected behaviour when combined with frontend frameworks
   * doing equality checks for values, e.g. React.
   */
  notify(oldValue?: T, changedKey?: AllPaths<T>): void;
  /**
   * Change key in store value. Copies are made at each level of `key` so that
   * no part of the original object is mutated (but it does not do a full deep
   * copy -- some sub-objects may still be shared between the old value and the
   * new one).
   *
   * ```js
   * $settings.setKey('visuals.theme', 'dark')
   * ```
   *
   * @param key The key name. Attributes can be split with a dot `.` and `[]`.
   * @param value New value.
   */
  setKey: <K extends AllPaths<T>>(key: K, value: FromPathWithIndexSignatureUndefined<T, K>) => void;
  /**
   * Subscribe to store changes and call listener immediately.
   *
   * ```
   * import { $settings } from '../store'
   *
   * $settings.subscribe(settings => {
   *   console.log(settings)
   * })
   * ```
   *
   * @param listener Callback with store value and old value.
   * @param changedKey Key that changed, when the notification carries one.
   * @returns Function to remove listener.
   */
  subscribe(listener: (value: T, oldValue: T | undefined, changedKey: AllPaths<T> | undefined) => void): () => void;
} & Omit<WritableAtom<T>, 'listen' | 'notify' | 'setKey' | 'subscribe'>;
/**
 * Create deep map store. Deep map store is a store with an object as store
 * value, that supports fine-grained reactivity for deeply nested properties.
 *
 * @param init Initialize store and return store destructor.
 * @returns The store object with methods to subscribe.
 *
 * @deprecated Use `@nanostores/deepmap`.
 */
export declare function deepMap<T extends BaseDeepMap>(init?: T): DeepMapStore<T>;
/**
 * Get a value by key from a store with an object value.
 * Works with `map`, `deepMap`, and `atom`.
 *
 * ```js
 * import { getKey, map } from 'nanostores'
 *
 * const $user = map({ name: 'John', profile: { age: 30 } })
 *
 * // Simple key access
 * getKey($user, 'name') // Returns 'John'
 *
 * // Nested access with dot notation
 * getKey($user, 'profile.age') // Returns 30
 *
 * // Array access
 * const $items = map({ products: ['apple', 'banana'] })
 * getKey($items, 'products[1]') // Returns 'banana'
 * ```
 *
 * @param store The store to get the value from.
 * @param key The key to access. Can be a simple key or a path with dot notation.
 * @returns The value for this key
 */
/**
 * @deprecated Use `@nanostores/deepmap`.
 */
export declare function getKey<T extends Record<string, unknown>, K extends AllPaths<T>>(store: AnyStore<T>, key: K): FromPath<T, K>;
//#endregion
//#region effect/index.d.ts
interface Effect {
  <OriginStore extends ListenableStore>(stores: OriginStore, cb: (value: StoreValue<OriginStore>) => (() => void) | void): () => void;
  /**
   * Subscribe for multiple stores. Also you can define cleanup function
   * to call on stores changes.
   *
   * ```js
   * const $enabled = atom(true)
   * const $interval = atom(1000)
   *
   * const cancelPing = effect([$enabled, $interval], (enabled, interval) => {
   *   if (!enabled) return
   *   const intervalId = setInterval(() => {
   *     sendPing()
   *   }, interval)
   *   return () => {
   *     clearInterval(intervalId)
   *   }
   * })
   * ```
   */
  <OriginStores extends readonly ListenableStore[]>(stores: readonly [...OriginStores], cb: (...values: StoreValues<OriginStores>) => (() => void) | void): () => void;
}
export declare const effect: Effect;
//#endregion
//#region keep-mount/index.d.ts
/**
 * Prevent destructor call for the store.
 *
 * Together with {@link cleanStores} is useful tool for tests.
 *
 * ```js
 * import { keepMount } from 'nanostores'
 *
 * keepMount($store)
 * ```
 *
 * @param $store The store.
 */
export declare function keepMount($store: MapCreator | Store): void;
//#endregion
//#region lifecycle/index.d.ts
type KeyedStore = Store & {
  setKey: (...args: any[]) => any;
};
type AtomSetPayload<Shared, SomeStore extends Store> = {
  abort(): void;
  changed: undefined;
  newValue: StoreValue<SomeStore>;
  shared: Shared;
};
type MapSetPayload<Shared, SomeStore extends Store> = {
  abort(): void;
  changed: MapStoreKeys<SomeStore>;
  newValue: StoreValue<SomeStore>;
  shared: Shared;
} | AtomSetPayload<Shared, SomeStore>;
type AtomNotifyPayload<Shared, SomeStore extends Store> = {
  abort(): void;
  changed: undefined;
  oldValue: StoreValue<SomeStore> | undefined;
  shared: Shared;
};
type MapNotifyPayload<Shared, SomeStore extends Store> = {
  abort(): void;
  changed: MapStoreKeys<SomeStore>;
  oldValue: StoreValue<SomeStore> | undefined;
  shared: Shared;
} | AtomNotifyPayload<Shared, SomeStore>;
/**
 * Add listener to store chagings.
 *
 * ```js
 * import { onSet } from 'nanostores'
 *
 * onSet($store, ({ newValue, abort }) => {
 *   if (!validate(newValue)) {
 *     abort()
 *   }
 * })
 * ```
 *
 * You can communicate between listeners by `payload.shared`
 * or cancel changes by `payload.abort()`.
 *
 * New value of the all store will be `payload.newValue`.
 * On `MapStore#setKey()` call, changed value will be in `payload.changed`.
 *
 * @param $store The store to add listener.
 * @param listener Event callback.
 * @returns A function to remove listener.
 */
export declare function onSet<Shared = never, SomeStore extends Store = Store>($store: SomeStore, listener: (payload: SomeStore extends KeyedStore ? MapSetPayload<Shared, SomeStore> : AtomSetPayload<Shared, SomeStore>) => void): () => void;
/**
 * Add listener to notifying about store changes.
 *
 * You can communicate between listeners by `payload.shared`
 * or cancel changes by `payload.abort()`.
 *
 * On `MapStore#setKey()` call, changed value will be in `payload.changed`.
 *
 * @param $store The store to add listener.
 * @param listener Event callback.
 * @returns A function to remove listener.
 */
export declare function onNotify<Shared = never, SomeStore extends Store = Store>($store: SomeStore, listener: (payload: SomeStore extends KeyedStore ? MapNotifyPayload<Shared, SomeStore> : AtomNotifyPayload<Shared, SomeStore>) => void): () => void;
/**
 * Add listener on first store listener.
 *
 * We recommend to always use `onMount` instead to prevent flickering
 * (`onMount` have small delay before unsubscribe callback).
 * See {@link onMount} to add constructor and destructor for the store.
 *
 * You can communicate between listeners by `payload.shared`.
 *
 * @param $store The store to add listener.
 * @param listener Event callback.
 * @returns A function to remove listener.
 */
export declare function onStart<Shared = never>($store: Store, listener: (payload: {
  shared: Shared;
}) => void): () => void;
/**
 * Add listener on last store listener unsubscription.
 *
 * We recommend to always use `onMount` instead to prevent flickering
 * (`onMount` have small delay before unsubscribe callback).
 * See {@link onMount} to add constructor and destructor for the store.
 *
 * You can communicate between listeners by `payload.shared`.
 *
 * @param $store The store to add listener.
 * @param listener Event callback.
 * @returns A function to remove listener.
 */
export declare function onStop<Shared = never>($store: Store, listener: (payload: {
  shared: Shared;
}) => void): () => void;
export declare const STORE_UNMOUNT_DELAY: number;
/**
 * Run constructor on first store’s listener and run destructor on last listener
 * unsubscription. It has a debounce to prevent flickering.
 *
 * A way to reduce memory and CPU usage when you do not need a store.
 *
 * You can communicate between listeners by `payload.shared`.
 *
 * ```js
 * import { onMount } from 'nanostores'
 *
 * // Listen for URL changes on first store’s listener.
 * onMount($router, () => {
 *   parse()
 *   window.addEventListener('popstate', parse)
 *   return () => {
 *     window.removeEventListener('popstate', parse)
 *   }
 * })
 * ```
 *
 * @param $store Store to listen.
 * @param initialize Store constructor. Returns store destructor.
 * @return A function to remove constructor and destructor from store.
 */
export declare function onMount<Shared = never>($store: Store, initialize: (payload: {
  shared: Shared;
}) => (() => void) | void): () => void;
//#endregion
//#region listen-keys/index.d.ts
/**
 * Listen for specific keys of the store.
 *
 * In contrast with {@link subscribeKeys} it do not call listener
 * immediately.
 * ```js
 * import { listenKeys } from 'nanostores'
 *
 * listenKeys($page, ['blocked'], (value, oldValue, changed) => {
 *   if (value.blocked) {
 *     console.log('You has no access')
 *   }
 * })
 * ```
 *
 * @param $store The store to listen.
 * @param keys The keys to listen.
 * @param listener Standard listener.
 */
export declare function listenKeys<SomeStore extends {
  setKey: (key: any, value: any) => void;
}>($store: SomeStore, keys: readonly MapStoreKeys<SomeStore>[], listener: (value: StoreValue<SomeStore>, oldValue: StoreValue<SomeStore> | undefined, changed: MapStoreKeys<SomeStore> | undefined) => void): () => void;
/**
 * Listen for specific keys of the store and call listener immediately.
 * Note that the oldValue and changed arguments in the listener are
 * undefined during the initial call.
 *
 * ```js
 * import { subscribeKeys } from 'nanostores'
 *
 * subscribeKeys($page, ['blocked'], (value, oldValue, changed) => {
 *   if (value.blocked) {
 *     console.log('You has no access')
 *   }
 * })
 * ```
 *
 * @param $store The store to listen.
 * @param keys The keys to listen.
 * @param listener Standard listener.
 */
export declare function subscribeKeys<SomeStore extends {
  setKey: (key: any, value: any) => void;
}>($store: SomeStore, keys: readonly MapStoreKeys<SomeStore>[], listener: (value: StoreValue<SomeStore>, oldValue: StoreValue<SomeStore> | undefined, changed: MapStoreKeys<SomeStore> | undefined) => void): () => void;
//#endregion