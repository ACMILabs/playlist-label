import { WritableAtom } from "nanostores";
import { StandardSchemaV1 } from "@standard-schema/spec";

//#region src/types.d.ts
type TypedEvent<T extends EventTarget, D = unknown> = CustomEvent<D> & {
  target: T;
};
type AnySchema = StandardSchemaV1;
type PropDef<T = unknown> = {
  schema: StandardSchemaV1<unknown, T>;
  get?: (host: HTMLElement, key: string) => unknown;
  attribute?: boolean;
  "~standard"?: never;
};
type PropEntry = AnySchema | PropDef;
type PropsSchema = Record<string, PropEntry>;
type StrictPropEntry<T> = "schema" extends keyof T ? Pick<T, Extract<keyof T, keyof PropDef>> & Record<Exclude<keyof T, keyof PropDef>, never> : T;
type Infer<S> = S extends PropDef<infer T> ? T : S extends StandardSchemaV1<any, infer O> ? O : never;
type AttrPropKeys<S extends PropsSchema> = { [K in keyof S]: S[K] extends PropDef ? (S[K]["attribute"] extends true ? K : never) : K }[keyof S] & string;
type ReactiveProps<Schema extends PropsSchema> = { [Key in keyof Schema as `$${Key & string}`]: WritableAtom<Infer<Schema[Key]>> };
type ComponentProps<Schema extends PropsSchema> = { [Key in keyof Schema]: Infer<Schema[Key]> };
type TagName = keyof HTMLElementTagNameMap | keyof SVGElementTagNameMap;
type SingleRefMarker<Tag extends TagName | undefined = undefined> = {
  readonly __list?: false;
  readonly __selector?: string;
  readonly schema: AnySchema;
} & ([Tag] extends [undefined] ? {} : {
  readonly __tag: Tag & TagName;
});
type ListRefMarker<Tag extends TagName | undefined = undefined> = {
  readonly __list: true;
  readonly __selector?: string;
  readonly schema: AnySchema;
} & ([Tag] extends [undefined] ? {} : {
  readonly __tag: Tag & TagName;
});
type RefsSchema = Record<string, SingleRefMarker | ListRefMarker>;
type InferRef<M> = M extends {
  __el: infer El;
  __list: true;
} ? El[] : M extends {
  __el: infer El;
} ? El : M extends {
  __tag: infer Tag extends keyof HTMLElementTagNameMap;
  __list: true;
} ? HTMLElementTagNameMap[Tag][] : M extends {
  __tag: infer Tag extends keyof SVGElementTagNameMap;
  __list: true;
} ? SVGElementTagNameMap[Tag][] : M extends {
  __list: true;
} ? Element[] : M extends {
  __tag: infer Tag extends keyof HTMLElementTagNameMap;
} ? HTMLElementTagNameMap[Tag] : M extends {
  __tag: infer Tag extends keyof SVGElementTagNameMap;
} ? SVGElementTagNameMap[Tag] : Element;
type InferRefs<Schema extends RefsSchema> = { [Key in keyof Schema]: InferRef<Schema[Key]> };
type Consumable<T> = {
  consume(ctx: {
    readonly host: HTMLElement;
    readonly onCleanup: (cb: VoidFunction) => void;
  }, callback: (value: T) => void): void;
};
type ContextsSchema = Record<string, Consumable<unknown>>;
type InferContexts<S extends ContextsSchema> = { [K in keyof S]: S[K] extends Consumable<infer T> ? T : never };
type BindOptions = {
  prop?: string;
  event?: string;
};
//#endregion
export { SingleRefMarker as _, Consumable as a, InferContexts as c, ListRefMarker as d, PropDef as f, RefsSchema as g, ReactiveProps as h, ComponentProps as i, InferRef as l, PropsSchema as m, AttrPropKeys as n, ContextsSchema as o, PropEntry as p, BindOptions as r, Infer as s, AnySchema as t, InferRefs as u, StrictPropEntry as v, TypedEvent as y };