import { _ as SingleRefMarker, a as Consumable, c as InferContexts, d as ListRefMarker, f as PropDef, g as RefsSchema, h as ReactiveProps, i as ComponentProps, l as InferRef, m as PropsSchema, n as AttrPropKeys, o as ContextsSchema, p as PropEntry, r as BindOptions, s as Infer, t as AnySchema, u as InferRefs, v as StrictPropEntry, y as TypedEvent } from "./types-BplJSBOW.mjs";
import { ReadableAtom, StoreValue, WritableAtom } from "nanostores";
import { StandardSchemaV1 } from "@standard-schema/spec";
//#region src/setup-context.d.ts
declare const __ctx: unique symbol;
type ReservedKeys = keyof HTMLElement;
type StoreValues<Stores extends ReadableAtom<any>[]> = { [Index in keyof Stores]: StoreValue<Stores[Index]> };
type SetupContext<Props extends PropsSchema, Refs extends RefsSchema, Contexts extends ContextsSchema = {}> = Context<Props, Refs, Contexts>;
type SetupFn<Props extends PropsSchema, Refs extends RefsSchema, Contexts extends ContextsSchema = {}> = (ctx: SetupContext<Props, Refs, Contexts>) => Record<string, unknown> | void;
declare const __nano: unique symbol;
type ComponentBrand = {
  readonly [__nano]: true;
};
type ContextOptions<Props extends PropsSchema, Refs extends RefsSchema, Contexts extends ContextsSchema = {}> = {
  host: HTMLElement;
  props: ReactiveProps<Props>;
  refs: InferRefs<Refs>;
  onCleanup: (callback: VoidFunction) => void;
  contexts: InferContexts<Contexts>;
};
type ComponentCtor<Props extends PropsSchema, Refs extends RefsSchema, Mixin = {}, Contexts extends ContextsSchema = {}> = (new () => HTMLElement & ComponentProps<Props> & {
  readonly [__ctx]: Context<Props, Refs, Contexts>;
} & Mixin) & ComponentBrand;
declare class Context<Props extends PropsSchema, Refs extends RefsSchema, Contexts extends ContextsSchema = {}> {
  readonly host: HTMLElement;
  /** Reactive property stores of the component. */
  readonly props: ReactiveProps<Props>;
  /** References to elements within the component. */
  readonly refs: InferRefs<Refs>;
  /** Resolved context values declared via withContexts. */
  readonly contexts: InferContexts<Contexts>;
  /** Registers a cleanup function to be called when the component is disconnected. */
  readonly onCleanup: (callback: VoidFunction) => void;
  constructor({
    host,
    onCleanup,
    props,
    refs,
    contexts
  }: ContextOptions<Props, Refs, Contexts>);
  /**
  * Adds an event listener to one or more elements, Document, or Window and registers automatic cleanup on disconnect.
  */
  on<T extends Element, K extends keyof HTMLElementEventMap>(target: T, type: K, listener: (this: T, ev: HTMLElementEventMap[K] & {
    currentTarget: T;
  }) => any, options?: boolean | AddEventListenerOptions): void;
  on<T extends Element, K extends keyof HTMLElementEventMap>(target: T[], type: K, listener: (this: T, ev: HTMLElementEventMap[K] & {
    currentTarget: T;
  }) => any, options?: boolean | AddEventListenerOptions): void;
  on<K extends keyof DocumentEventMap>(target: Document, type: K, listener: (this: Document, ev: DocumentEventMap[K] & {
    currentTarget: Document;
  }) => any, options?: boolean | AddEventListenerOptions): void;
  on<K extends keyof WindowEventMap>(target: Window, type: K, listener: (this: Window, ev: WindowEventMap[K] & {
    currentTarget: Window;
  }) => any, options?: boolean | AddEventListenerOptions): void;
  on(target: Element | Element[] | Document | Window, type: string, listener: (this: Element | Document | Window, ev: Event) => any, options?: boolean | AddEventListenerOptions): void;
  /** Dispatches an existing Event, or creates and dispatches a bubbling CustomEvent. */
  emit(event: Event): void;
  emit<D>(name: string, detail?: D, options?: Omit<CustomEventInit<D>, "detail">): void;
  /** Queries a single required element by CSS selector. Throws if not found. */
  getElement<const Tag extends keyof HTMLElementTagNameMap>(selector: Tag): HTMLElementTagNameMap[Tag];
  getElement<const Tag extends keyof HTMLElementTagNameMap>(root: DocumentFragment | Element, selector: Tag): HTMLElementTagNameMap[Tag];
  getElement<const Tag extends Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>>(selector: Tag): SVGElementTagNameMap[Tag];
  getElement<const Tag extends Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>>(root: DocumentFragment | Element, selector: Tag): SVGElementTagNameMap[Tag];
  getElement<E extends Element>(selector: string): E;
  getElement<E extends Element>(root: DocumentFragment | Element, selector: string): E;
  getElement(selector: string): Element;
  getElement(root: DocumentFragment | Element, selector: string): Element;
  /** Queries all matching elements by CSS selector. Throws if none found. */
  getElements<const Tag extends keyof HTMLElementTagNameMap>(selector: Tag): HTMLElementTagNameMap[Tag][];
  getElements<const Tag extends keyof HTMLElementTagNameMap>(root: DocumentFragment | Element, selector: Tag): HTMLElementTagNameMap[Tag][];
  getElements<const Tag extends Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>>(selector: Tag): SVGElementTagNameMap[Tag][];
  getElements<const Tag extends Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>>(root: DocumentFragment | Element, selector: Tag): SVGElementTagNameMap[Tag][];
  getElements<E extends Element>(selector: string): E[];
  getElements<E extends Element>(root: DocumentFragment | Element, selector: string): E[];
  getElements(selector: string): Element[];
  getElements(root: DocumentFragment | Element, selector: string): Element[];
  /**
  * Subscribes `callback` to one store or an array of stores and registers automatic cleanup
  * on disconnect. Immediately invokes the callback with the current value(s).
  */
  effect<T>(store: ReadableAtom<T>, callback: (value: T) => void): void;
  effect<Stores extends ReadableAtom<any>[]>(stores: [...Stores], callback: (...values: StoreValues<Stores>) => void): void;
  /**
  * Binds a writable atom to a DOM element property.
  * Store is the source of truth: element is set from the store on bind.
  *
  * No options → full auto-detect (native controls + custom `.value`/`change`), two-way.
  * Options present → `prop` defaults to auto-detected, `event` undefined = one-way.
  */
  bind(store: WritableAtom<any>, control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, opts?: BindOptions): void;
  bind<CV, SV extends CV>(store: WritableAtom<SV>, control: Element & {
    value: CV;
  }, opts?: BindOptions): void;
  bind(store: WritableAtom<unknown>, control: Element, opts: BindOptions): void;
}
//#endregion
//#region src/builders.d.ts
declare const propBuilders: {
  string: {
    (fallback: null): StandardSchemaV1<unknown, string | null>;
    (fallback?: string): StandardSchemaV1<unknown, string>;
  };
  number: {
    (fallback: null): StandardSchemaV1<unknown, number | null>;
    (fallback?: number): StandardSchemaV1<unknown, number>;
  };
  boolean: {
    (fallback: null): StandardSchemaV1<unknown, boolean | null>;
    (fallback?: boolean): StandardSchemaV1<unknown, boolean>;
  };
  oneOf: {
    <const V extends string | number | bigint>(options: readonly V[], fallback: null): StandardSchemaV1<unknown, V | null>;
    <const V extends string | number | bigint>(options: readonly V[], fallback?: V): StandardSchemaV1<unknown, V>;
  };
  json: {
    <S extends StandardSchemaV1>(schema: S, fallback: null): PropDef<StandardSchemaV1.InferOutput<S> | null>;
    <S extends StandardSchemaV1>(schema: S, fallback: StandardSchemaV1.InferOutput<S>): PropDef<StandardSchemaV1.InferOutput<S>>;
    <S extends StandardSchemaV1>(schema: S): PropDef<StandardSchemaV1.InferOutput<S> | null>;
  };
};
type SvgOnlyTag = Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>;
declare function one(): SingleRefMarker;
declare function one<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): SingleRefMarker<Tag>;
declare function one<const Tag extends SvgOnlyTag>(tag: Tag): SingleRefMarker<Tag>;
declare function one<El extends Element>(): SingleRefMarker & {
  readonly __el: El;
};
declare function one<El extends Element>(selector: string): SingleRefMarker & {
  readonly __el: El;
};
declare function one(selector: string): SingleRefMarker;
declare function many(): ListRefMarker;
declare function many<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): ListRefMarker<Tag>;
declare function many<const Tag extends SvgOnlyTag>(tag: Tag): ListRefMarker<Tag>;
declare function many<El extends Element>(): ListRefMarker & {
  readonly __el: El;
};
declare function many<El extends Element>(selector: string): ListRefMarker & {
  readonly __el: El;
};
declare function many(selector: string): ListRefMarker;
declare const refBuilders: {
  one: typeof one;
  many: typeof many;
};
//#endregion
//#region src/define.d.ts
declare class ComponentBuilder<Name extends string, Props extends PropsSchema = {}, Refs extends RefsSchema = {}, Contexts extends ContextsSchema = {}> {
  readonly name: Name;
  readonly propsSchema: Props;
  readonly refsSchema: Refs;
  readonly contextsSchema: Contexts;
  constructor(name: Name, propsSchema?: Props, refsSchema?: Refs, contextsSchema?: Contexts);
  withProps<P extends PropsSchema>(factory: (builders: typeof propBuilders) => P & { [K in keyof P]: StrictPropEntry<P[K]> }): ComponentBuilder<Name, Props & P, Refs, Contexts>;
  withRefs<R extends RefsSchema>(factory: (builders: typeof refBuilders) => R): ComponentBuilder<Name, Props, Refs & R, Contexts>;
  withContexts<C extends ContextsSchema>(contexts: C): ComponentBuilder<Name, Props, Refs, Contexts & C>;
  setup<M extends Record<string, unknown> = {}>(setupFn: (ctx: SetupContext<Props, Refs, Contexts>) => M | void): ComponentCtor<Props, Refs, M, Contexts>;
}
declare function define<const Name extends string>(name: Name): ComponentBuilder<Name>;
declare function define<const Name extends string, M extends Record<string, unknown> = {}>(name: Name, setup: (ctx: SetupContext<{}, {}>) => M | void): ComponentCtor<{}, {}, M>;
//#endregion
export { type AnySchema, type AttrPropKeys, type BindOptions, type ComponentCtor, type ComponentProps, type Consumable, type ContextsSchema, type Infer, type InferContexts, type InferRef, type InferRefs, type ListRefMarker, type PropDef, type PropEntry, type PropsSchema, type ReactiveProps, type RefsSchema, type ReservedKeys, type SetupContext, type SetupFn, type SingleRefMarker, type TypedEvent, __ctx, define };
