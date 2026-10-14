import { atom, effect } from "./nanostores.mjs";
//#region src/utils.ts
function invariant(condition, message) {
	if (!condition) throw new Error(message);
}
function camelToKebab(str) {
	return str.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
//#endregion
//#region src/builders.ts
function schema(validate) {
	return { "~standard": {
		version: 1,
		vendor: "nanotags",
		validate
	} };
}
function propSchema(fallback, coerce) {
	const nullable = fallback === null;
	return schema((value) => {
		const v = fallback !== void 0 && value === null ? fallback : value;
		if (nullable && v === null) return { value: null };
		return coerce(v);
	});
}
function fail(message) {
	return { issues: [{ message }] };
}
const propBuilders = {
	string(fallback) {
		return propSchema(fallback, (v) => ({ value: v == null ? "" : String(v) }));
	},
	number(fallback) {
		return propSchema(fallback, (v) => {
			const num = Number(v);
			return Number.isNaN(num) ? fail("Invalid number") : { value: num };
		});
	},
	boolean(fallback) {
		return propSchema(fallback, (v) => ({ value: v === "false" ? false : v === "" || !!v }));
	},
	oneOf(options, fallback) {
		return propSchema(fallback, (v) => options.includes(v) ? { value: v } : fail(`Invalid value: ${JSON.stringify(v)}`));
	},
	json(schema, fallback) {
		const fb = fallback ?? null;
		return {
			schema,
			attribute: false,
			get(host, propName) {
				const raw = host.querySelector(`script[type="application/json"][data-prop="${propName}"]`)?.textContent ?? host.getAttribute(camelToKebab(propName));
				return raw !== null ? JSON.parse(raw) : fb;
			}
		};
	}
};
const TAG_RE = /^[a-z][a-zA-Z0-9-]*$/;
function parseRefArgs(tagOrSelector) {
	const tag = typeof tagOrSelector === "string" && TAG_RE.test(tagOrSelector) ? tagOrSelector : void 0;
	const sel = typeof tagOrSelector === "string" && !tag ? tagOrSelector : void 0;
	const tagLower = tag?.toLowerCase();
	return {
		...tag && { __tag: tag },
		...sel && { __selector: sel },
		schema: schema((value) => {
			if (!(value instanceof Element)) return fail("Expected Element");
			if (tagLower && value.tagName.toLowerCase() !== tagLower) return fail(`Expected <${tag}>`);
			return { value };
		})
	};
}
function one(tagOrSelector) {
	return parseRefArgs(tagOrSelector);
}
function many(tagOrSelector) {
	return {
		__list: true,
		...parseRefArgs(tagOrSelector)
	};
}
const refBuilders = {
	one,
	many
};
//#endregion
//#region src/setup-context.ts
const __ctx = Symbol("ctx");
var Context = class {
	host;
	/** Reactive property stores of the component. */
	props;
	/** References to elements within the component. */
	refs;
	/** Resolved context values declared via withContexts. */
	contexts;
	/** Registers a cleanup function to be called when the component is disconnected. */
	onCleanup;
	constructor({ host, onCleanup, props, refs, contexts }) {
		this.host = host;
		this.onCleanup = onCleanup;
		this.props = props;
		this.refs = refs;
		this.contexts = contexts;
	}
	on(target, type, listener, options) {
		const targets = Array.isArray(target) ? target : [target];
		for (const t of targets) {
			t.addEventListener(type, listener, options);
			this.onCleanup(() => t.removeEventListener(type, listener, options));
		}
	}
	emit(nameOrEvent, detail, options) {
		if (nameOrEvent instanceof Event) return void this.host.dispatchEvent(nameOrEvent);
		this.host.dispatchEvent(new CustomEvent(nameOrEvent, {
			bubbles: true,
			composed: true,
			...options,
			detail
		}));
	}
	getElement(selectorOrRoot, maybeSelector) {
		return this.getElements(selectorOrRoot, maybeSelector)[0];
	}
	getElements(selectorOrRoot, maybeSelector) {
		const hasRoot = maybeSelector !== void 0;
		const root = hasRoot ? selectorOrRoot : this.host;
		const selector = hasRoot ? maybeSelector : selectorOrRoot;
		const elements = Array.from(root.querySelectorAll(selector));
		invariant(elements.length > 0, `${this.host.localName}: missing ${selector}`);
		return elements;
	}
	effect(storeOrStores, callback) {
		this.onCleanup(effect(storeOrStores, callback));
	}
	bind(store, control, opts) {
		const input = control instanceof HTMLInputElement ? control : void 0;
		let propEvent = ["value", "change"];
		if (input?.type === "checkbox") propEvent = ["checked", "change"];
		else if (input?.type === "number" || input?.type === "range") propEvent = ["valueAsNumber", "input"];
		else if (input || control instanceof HTMLTextAreaElement) propEvent = ["value", "input"];
		const prop = opts?.prop ?? propEvent[0];
		const event = opts ? opts?.event : propEvent[1];
		const el = control;
		event && this.on(control, event, () => store.set(el[prop]));
		this.effect(store, (value) => {
			el[prop] = value;
		});
	}
};
//#endregion
//#region src/factory.ts
function belongsTo(element, host) {
	let ancestor = element.parentElement;
	while (ancestor && ancestor !== host) {
		if (ancestor.tagName.includes("-")) return false;
		ancestor = ancestor.parentElement;
	}
	return true;
}
function refSelector(ref, hostTag) {
	return `[data-ref="${hostTag ? `${hostTag}:` : ""}${ref}"]`;
}
function isDangerousPrototypeProp(host, key) {
	let proto = Object.getPrototypeOf(host);
	while (proto) {
		const desc = Object.getOwnPropertyDescriptor(proto, key);
		if (desc) return typeof desc.value === "function" || !desc.configurable;
		proto = Object.getPrototypeOf(proto);
	}
	return false;
}
function isPropDef(entry) {
	return !("~standard" in entry);
}
const defaultDef = {
	attribute: true,
	get: (host, key) => host.getAttribute(camelToKebab(key))
};
function normalizeProp(entry) {
	if (isPropDef(entry)) return {
		...defaultDef,
		...entry
	};
	return {
		...defaultDef,
		schema: entry
	};
}
function parseWithSchema(schema, value, context) {
	const result = schema["~standard"].validate(value);
	if (result instanceof Promise) throw new TypeError(`${context}: async schemas not supported`);
	if (result.issues) throw new TypeError(`${context}: invalid value ${JSON.stringify(value)}: ${result.issues.map((i) => i.message).join(", ")}`);
	return result.value;
}
function createReactiveProps(host, schema) {
	const stores = {};
	const storesInit = {};
	const updaters = {};
	const keys = Object.keys(schema);
	const normalized = new Map(keys.map((key) => {
		const entry = schema[key];
		invariant(entry, `${host.tagName} component. No schema found for prop "${key}"`);
		invariant(!isDangerousPrototypeProp(host, key), `reserved prop: ${key}`);
		return [key, normalizeProp(entry)];
	}));
	normalized.forEach((def, key) => {
		const ctx = `${host.tagName} component. Prop "${key}"`;
		const attrName = camelToKebab(key);
		const ownDesc = Object.getOwnPropertyDescriptor(host, key);
		const hasPre = ownDesc !== void 0 && "value" in ownDesc;
		if (hasPre) delete host[key];
		const store = hasPre ? atom(def.attribute ? parseWithSchema(def.schema, ownDesc.value, ctx) : ownDesc.value) : def.attribute ? atom(parseWithSchema(def.schema, host.getAttribute(attrName), ctx)) : atom();
		if (hasPre) storesInit[key] = true;
		const updateFromAttr = def.attribute ? (v) => store.set(parseWithSchema(def.schema, v, ctx)) : null;
		const updateFromProp = def.attribute ? function(v) {
			if (v === null) this.removeAttribute(attrName);
			else this.setAttribute(attrName, String(v));
		} : (v) => {
			store.set(v);
			storesInit[key] = true;
		};
		stores[`$${key}`] = store;
		updaters[key] = updateFromAttr;
		Object.defineProperty(host, key, {
			enumerable: true,
			get: () => store.get(),
			set: updateFromProp
		});
	});
	return {
		stores,
		updaters,
		hydrateProps(h) {
			for (const [key, def] of normalized) {
				const store = stores[`$${key}`];
				if (storesInit[key]) {
					if (def.attribute) h[key] = store.get();
					continue;
				}
				const raw = def.get ? def.get(h, key) : void 0;
				store.set(parseWithSchema(def.schema, raw, `${h.tagName} component. Prop "${key}"`));
			}
		}
	};
}
function collectRefs(host, schema) {
	const result = {};
	const missingSingleRefs = [];
	const hostTag = host.tagName.toLowerCase();
	for (const key of Object.keys(schema)) {
		const entry = schema[key];
		invariant(entry, `${host.tagName} component. No schema found for ref "${key}"`);
		const isListRef = "__list" in entry && entry.__list === true;
		const sel = entry.__selector ?? refSelector(key);
		const ownedSel = refSelector(key, hostTag);
		const all = host.querySelectorAll(`${sel},${ownedSel}`);
		const shallow = [];
		all.forEach((el) => {
			if (el.matches(ownedSel) || belongsTo(el, host)) shallow.push(el);
		});
		if (isListRef) {
			invariant(shallow.length > 0, `${host.tagName} component. Missing elements for list ref "${key}"`);
			result[key] = shallow.map((el) => parseWithSchema(entry.schema, el, `${host.tagName} component. List ref "${key}"`));
		} else {
			if (!shallow[0]) {
				missingSingleRefs.push(key);
				continue;
			}
			result[key] = parseWithSchema(entry.schema, shallow[0], `${host.tagName} component. Ref "${key}"`);
		}
	}
	if (missingSingleRefs.length > 0) throw new Error(`${host.tagName} component. Missing elements for refs "${missingSingleRefs.join(", ")}"`);
	return result;
}
function createComponent(name, propsSchema, refsSchema, setupFn, contextsSchema = {}) {
	if (customElements.get(name)) {
		console.warn(`${name} already defined, reusing existing class`);
		return customElements.get(name);
	}
	const attrPropKeys = Object.keys(propsSchema).filter((k) => {
		const entry = propsSchema[k];
		return entry !== void 0 && (!isPropDef(entry) || entry.attribute);
	});
	const attrToPropKey = Object.fromEntries(attrPropKeys.map((k) => [camelToKebab(k), k]));
	const ctxKeys = Object.keys(contextsSchema);
	class Component extends HTMLElement {
		#cleanups = [];
		#props;
		[__ctx];
		static get observedAttributes() {
			return attrPropKeys.map(camelToKebab);
		}
		constructor() {
			super();
			this.#props = createReactiveProps(this, propsSchema);
		}
		#onCleanup = (callback) => {
			this.#cleanups.push(callback);
		};
		disconnectedCallback() {
			let err;
			for (const fn of this.#cleanups) try {
				fn();
			} catch (e) {
				err ??= e;
			}
			this.#cleanups = [];
			if (err) throw err;
		}
		attributeChangedCallback(attrName, oldValue, newValue) {
			if (oldValue === newValue) return;
			const propKey = attrToPropKey[attrName];
			if (propKey) this.#props.updaters[propKey]?.(newValue);
		}
		connectedCallback() {
			this.#props.hydrateProps(this);
			const refs = collectRefs(this, refsSchema);
			if (ctxKeys.length === 0) {
				this.#runSetup(refs, {});
				return;
			}
			const resolved = {};
			let remaining = ctxKeys.length;
			const ctxLike = {
				host: this,
				onCleanup: this.#onCleanup
			};
			for (const k of ctxKeys) contextsSchema[k].consume(ctxLike, (value) => {
				resolved[k] = value;
				if (--remaining === 0) this.#runSetup(refs, resolved);
			});
		}
		#runSetup(refs, contexts) {
			this[__ctx] = new Context({
				host: this,
				onCleanup: this.#onCleanup,
				props: this.#props.stores,
				refs,
				contexts
			});
			const mixin = setupFn(this[__ctx]);
			if (mixin) {
				const proto = Object.getPrototypeOf(this);
				const descriptors = Object.getOwnPropertyDescriptors(mixin);
				for (const key of Object.keys(descriptors)) invariant(!(key in proto), `reserved mixin: ${key}`);
				Object.defineProperties(this, descriptors);
			}
		}
	}
	customElements.define(name, Component);
	return Component;
}
//#endregion
//#region src/define.ts
var ComponentBuilder = class ComponentBuilder {
	name;
	propsSchema;
	refsSchema;
	contextsSchema;
	constructor(name, propsSchema = {}, refsSchema = {}, contextsSchema = {}) {
		this.name = name;
		this.propsSchema = propsSchema;
		this.refsSchema = refsSchema;
		this.contextsSchema = contextsSchema;
	}
	withProps(factory) {
		const newProps = factory(propBuilders);
		return new ComponentBuilder(this.name, {
			...this.propsSchema,
			...newProps
		}, this.refsSchema, this.contextsSchema);
	}
	withRefs(factory) {
		const newRefs = factory(refBuilders);
		return new ComponentBuilder(this.name, this.propsSchema, {
			...this.refsSchema,
			...newRefs
		}, this.contextsSchema);
	}
	withContexts(contexts) {
		return new ComponentBuilder(this.name, this.propsSchema, this.refsSchema, {
			...this.contextsSchema,
			...contexts
		});
	}
	setup(setupFn) {
		return createComponent(this.name, this.propsSchema, this.refsSchema, setupFn, this.contextsSchema);
	}
};
function define(name, setup) {
	if (setup) return createComponent(name, {}, {}, setup);
	return new ComponentBuilder(name);
}
//#endregion
export { __ctx, define };
