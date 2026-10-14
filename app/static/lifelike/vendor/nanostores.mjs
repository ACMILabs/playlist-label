//#region task/index.js
let tasks = 0;
let taskId = 0;
let resolves = [];
function startTask() {
	let id = taskId;
	tasks += 1;
	return () => {
		if (id !== taskId) return;
		tasks -= 1;
		if (tasks === 0) {
			let prevResolves = resolves;
			resolves = [];
			for (let i of prevResolves) i();
		}
	};
}
function task(cb) {
	let endTask = startTask();
	let promise;
	try {
		promise = Promise.resolve(cb()).finally(endTask);
	} catch (error) {
		endTask();
		throw error;
	}
	promise.t = true;
	return promise;
}
function allTasks() {
	if (tasks === 0) return Promise.resolve();
	else return new Promise((resolve) => {
		resolves.push(resolve);
	});
}
function cleanTasks() {
	taskId += 1;
	tasks = 0;
	let prevResolves = resolves;
	resolves = [];
	for (let i of prevResolves) i();
}
//#endregion
//#region clean-stores/index.js
const clean = Symbol("clean");
const cleanStores = (...stores) => {
	if ("production" === "production") throw new Error("cleanStores() can be used only during development or tests");
	cleanTasks();
	for (let $store of stores) if ($store) {
		if ($store.mocked) delete $store.mocked;
		if ($store[clean]) $store[clean]();
	}
};
//#endregion
//#region atom/index.js
let listenerQueue = [];
let lqIndex = 0;
let batchSeen = null;
const QUEUE_ITEMS_PER_LISTENER = 4;
const nanostoresGlobal = globalThis.nanostoresGlobal ||= { epoch: 0 };
let drainQueue = () => {
	let thrown;
	let i;
	while (lqIndex < listenerQueue.length) {
		i = lqIndex;
		lqIndex += QUEUE_ITEMS_PER_LISTENER;
		try {
			listenerQueue[i](listenerQueue[i + 1].value, listenerQueue[i + 2], listenerQueue[i + 3]);
		} catch (e) {
			thrown = e;
		}
	}
	listenerQueue.length = lqIndex = 0;
	if (thrown) throw thrown;
};
const batch = (fn) => {
	let outer = !batchSeen;
	if (outer) batchSeen = /* @__PURE__ */ new Set();
	try {
		fn();
	} finally {
		if (outer) try {
			if (listenerQueue.length) drainQueue();
		} finally {
			batchSeen = null;
		}
	}
};
const atom = /* @__NO_SIDE_EFFECTS__ */ (initialValue) => {
	let listeners = [];
	let $atom = {
		eq: Object.is,
		get() {
			if (!$atom.lc) $atom.listen(() => {})();
			return $atom.value;
		},
		init: initialValue,
		lc: 0,
		listen(listener) {
			$atom.lc = listeners.push(listener);
			return () => {
				for (let i = lqIndex; i < listenerQueue.length;) if (listenerQueue[i] === listener) listenerQueue.splice(i, QUEUE_ITEMS_PER_LISTENER);
				else i += QUEUE_ITEMS_PER_LISTENER;
				let index = listeners.indexOf(listener);
				if (~index) {
					listeners.splice(index, 1);
					if (!--$atom.lc) $atom.off();
				}
			};
		},
		notify(oldValue, changedKey) {
			nanostoresGlobal.epoch++;
			let runListenerQueue = !listenerQueue.length && !batchSeen;
			for (let listener of listeners) {
				if (batchSeen?.has(listener)) continue;
				batchSeen?.add(listener);
				listenerQueue.push(listener, $atom, oldValue, batchSeen ? void 0 : changedKey);
			}
			if (runListenerQueue) drainQueue();
		},
		off() {},
		set(newValue) {
			let oldValue = $atom.value;
			if (!$atom.eq(oldValue, newValue)) {
				$atom.value = newValue;
				$atom.notify(oldValue);
			}
		},
		subscribe(listener) {
			let unbind = $atom.listen(listener);
			listener($atom.value);
			return unbind;
		},
		value: initialValue
	};
	if ("production" !== "production") $atom[clean] = () => {
		listeners = [];
		$atom.lc = 0;
		$atom.off();
	};
	return $atom;
};
const readonlyType = (store) => store;
//#endregion
//#region lifecycle/index.js
const START = 0;
const STOP = 1;
const SET = 2;
const NOTIFY = 3;
const MOUNT = 5;
const UNMOUNT = 6;
const REVERT_MUTATION = 10;
let on = (object, listener, eventKey, mutateStore) => {
	object.events = object.events || {};
	if (!object.events[eventKey + REVERT_MUTATION]) object.events[eventKey + REVERT_MUTATION] = mutateStore((eventProps) => {
		object.events[eventKey].reduceRight((event, l) => (l(event), event), {
			shared: {},
			...eventProps
		});
	});
	object.events[eventKey] = object.events[eventKey] || [];
	object.events[eventKey].push(listener);
	return () => {
		let currentListeners = object.events[eventKey];
		let index = currentListeners.indexOf(listener);
		if (~index) {
			currentListeners.splice(index, 1);
			if (!currentListeners.length) {
				object.events[eventKey + REVERT_MUTATION]();
				delete object.events[eventKey + REVERT_MUTATION];
			}
		}
	};
};
let onStart = ($store, listener) => on($store, listener, START, (runListeners) => {
	let originListen = $store.listen;
	$store.listen = (arg) => {
		if (!$store.lc && !$store.starting) {
			$store.starting = true;
			runListeners();
			delete $store.starting;
		}
		return originListen(arg);
	};
	return () => {
		$store.listen = originListen;
	};
});
let onStop = ($store, listener) => on($store, listener, STOP, (runListeners) => {
	let originOff = $store.off;
	$store.off = () => {
		runListeners();
		originOff();
	};
	return () => {
		$store.off = originOff;
	};
});
let onSet = ($store, listener) => on($store, listener, SET, (runListeners) => {
	let originSet = $store.set;
	let originSetKey = $store.setKey;
	if ($store.setKey) $store.setKey = (changed, changedValue) => {
		let isAborted;
		let abort = () => {
			isAborted = true;
		};
		runListeners({
			abort,
			changed,
			newValue: {
				...$store.value,
				[changed]: changedValue
			}
		});
		if (!isAborted) return originSetKey(changed, changedValue);
	};
	$store.set = (newValue) => {
		let isAborted;
		let abort = () => {
			isAborted = true;
		};
		runListeners({
			abort,
			newValue
		});
		if (!isAborted) return originSet(newValue);
	};
	return () => {
		$store.set = originSet;
		$store.setKey = originSetKey;
	};
});
let onNotify = ($store, listener) => on($store, listener, NOTIFY, (runListeners) => {
	let originNotify = $store.notify;
	$store.notify = (oldValue, changed) => {
		let isAborted;
		let abort = () => {
			isAborted = true;
		};
		runListeners({
			abort,
			changed,
			oldValue
		});
		if (!isAborted) return originNotify(oldValue, changed);
	};
	return () => {
		$store.notify = originNotify;
	};
});
const STORE_UNMOUNT_DELAY = 1e3;
let onMount = ($store, initialize) => {
	let listener = (payload) => {
		let destroy = initialize(payload);
		if (destroy) $store.events[UNMOUNT].push(destroy);
	};
	return on($store, listener, MOUNT, (runListeners) => {
		let originListen = $store.listen;
		$store.listen = (...args) => {
			if (!$store.lc && !$store.active) {
				$store.active = true;
				runListeners();
			}
			return originListen(...args);
		};
		let originOff = $store.off;
		$store.events[UNMOUNT] = [];
		$store.off = () => {
			originOff();
			setTimeout(() => {
				if ($store.active && !$store.lc) {
					$store.active = false;
					for (let destroy of $store.events[UNMOUNT]) destroy();
					$store.events[UNMOUNT] = [];
				}
			}, STORE_UNMOUNT_DELAY);
		};
		if ("production" !== "production") {
			let originClean = $store[clean];
			$store[clean] = () => {
				for (let destroy of $store.events[UNMOUNT]) destroy();
				$store.events[UNMOUNT] = [];
				$store.active = false;
				originClean();
			};
		}
		return () => {
			$store.listen = originListen;
			$store.off = originOff;
		};
	});
};
//#endregion
//#region warn/index.js
let warned = {};
function warn(text) {
	if (!warned[text]) {
		warned[text] = true;
		if (typeof console !== "undefined" && console.warn) {
			console.groupCollapsed("Nano Stores: " + text);
			console.trace("Source of deprecated call");
			console.groupEnd();
		}
	}
}
//#endregion
//#region computed/index.js
let computedStore = (stores, cb, batched) => {
	if (!Array.isArray(stores)) stores = [stores];
	let previousArgs;
	let currentEpoch;
	let set = () => {
		if (currentEpoch === nanostoresGlobal.epoch) return;
		currentEpoch = nanostoresGlobal.epoch;
		let args = stores.map(($store) => $store.get());
		if (!previousArgs?.every((arg, i) => stores[i].eq(arg, args[i]))) {
			previousArgs = args;
			let value = cb(...args);
			if (value && value.then && value.t) {
				if ("production" !== "production") warn("Use @nanostores/async for async computed. We will remove Promise support in computed() in Nano Stores 2.0");
				value.then((asyncValue) => {
					if (previousArgs === args) $computed.set(asyncValue);
				});
			} else {
				$computed.set(value);
				currentEpoch = nanostoresGlobal.epoch;
			}
		}
	};
	let $computed = /* @__PURE__ */ atom();
	let get = $computed.get;
	$computed.get = () => {
		set();
		return get();
	};
	if ("production" !== "production") {
		let cleanComputed = $computed[clean];
		$computed[clean] = () => {
			previousArgs = void 0;
			currentEpoch = void 0;
			$computed.value = void 0;
			cleanComputed();
		};
	}
	let timer;
	let run = batched ? () => {
		clearTimeout(timer);
		timer = setTimeout(set);
	} : set;
	onMount($computed, () => {
		let unbinds = stores.map(($store) => $store.listen(run));
		set();
		return () => {
			for (let unbind of unbinds) unbind();
		};
	});
	return $computed;
};
const computed = /* @__NO_SIDE_EFFECTS__ */ (stores, fn) => computedStore(stores, fn);
const batched = /* @__NO_SIDE_EFFECTS__ */ (stores, fn) => computedStore(stores, fn, true);
//#endregion
//#region deep-map/path.js
function getPath(obj, path) {
	let allKeys = getAllKeysFromPath(path);
	let res = obj;
	for (let key of allKeys) {
		if (res == null) return;
		res = res[key];
	}
	return res;
}
function setPath(obj, path, value) {
	return setByKey(obj != null ? obj : {}, getAllKeysFromPath(path), value);
}
function setByKey(obj, splittedKeys, value) {
	let key = splittedKeys[0];
	let copy = Array.isArray(obj) ? [...obj] : { ...obj };
	if (splittedKeys.length === 1) {
		if (value === void 0) {
			if (Array.isArray(copy)) copy.splice(key, 1);
			else delete copy[key];
		} else copy[key] = value;
		return copy;
	}
	ensureKey(copy, key, splittedKeys[1]);
	copy[key] = setByKey(copy[key], splittedKeys.slice(1), value);
	return copy;
}
const ARRAY_INDEX = /(.*)\[(\d+)\]/;
function getAllKeysFromPath(path) {
	return path.split(".").flatMap((key) => getKeyAndIndicesFromKey(key));
}
function getKeyAndIndicesFromKey(key) {
	if (ARRAY_INDEX.test(key)) {
		let [, keyPart, index] = key.match(ARRAY_INDEX);
		return [...getKeyAndIndicesFromKey(keyPart), index];
	}
	return [key];
}
const IS_NUMBER = /^\d+$/;
function ensureKey(obj, key, nextKey) {
	if (key in obj) return;
	if (IS_NUMBER.test(nextKey)) obj[key] = Array(parseInt(nextKey, 10) + 1);
	else obj[key] = {};
}
//#endregion
//#region deep-map/index.js
const deepMap = /* @__NO_SIDE_EFFECTS__ */ (initial = {}) => {
	if ("production" !== "production") warn("Move to deepmap() from @nanostores/deepmap. deepmap() will be removed in 2.0.");
	let $deepMap = /* @__PURE__ */ atom(initial);
	$deepMap.setKey = (key, value) => {
		if (getPath($deepMap.value, key) !== value) {
			let oldValue = $deepMap.value;
			$deepMap.value = setPath($deepMap.value, key, value);
			$deepMap.notify(oldValue, key);
		}
	};
	return $deepMap;
};
function getKey(store, key) {
	return getPath(store.get(), key);
}
//#endregion
//#region effect/index.js
const effect = (stores, callback) => {
	if (!Array.isArray(stores)) stores = [stores];
	let unbinds = [];
	let lastRunUnbind;
	let run = () => {
		lastRunUnbind && lastRunUnbind();
		lastRunUnbind = callback(...stores.map((store) => store.get()));
	};
	try {
		for (let store of stores) unbinds.push(store.listen(run));
		run();
	} catch (error) {
		unbinds.forEach((unbind) => unbind());
		throw error;
	}
	return () => {
		unbinds.forEach((unbind) => unbind());
		lastRunUnbind && lastRunUnbind();
	};
};
//#endregion
//#region keep-mount/index.js
const keepMount = ($store) => {
	$store.listen(() => {});
};
//#endregion
//#region listen-keys/index.js
function listenKeys($store, keys, listener) {
	let keysSet = new Set(keys);
	return $store.listen((value, oldValue, changed) => {
		if (changed === void 0 ? keys.some((key) => oldValue === void 0 || ($store.eqKey ? !$store.eqKey(oldValue[key], value[key], key) : !Object.is(getPath(value, key), getPath(oldValue, key)))) : keysSet.has(changed) || typeof changed === "string" && keysSet.has(changed.split(/\.|\[/)[0])) listener(value, oldValue, changed);
	});
}
function subscribeKeys($store, keys, listener) {
	let unbind = listenKeys($store, keys, listener);
	listener($store.value);
	return unbind;
}
//#endregion
//#region map/index.js
const map = /* @__NO_SIDE_EFFECTS__ */ (initial = {}) => {
	let $map = /* @__PURE__ */ atom(initial);
	$map.eqKey = Object.is;
	$map.setKey = function(key, value) {
		let oldMap = $map.value;
		if (typeof value === "undefined" && key in $map.value) {
			$map.value = { ...$map.value };
			delete $map.value[key];
			$map.notify(oldMap, key);
		} else if (!$map.eqKey($map.value[key], value, key)) {
			$map.value = {
				...$map.value,
				[key]: value
			};
			$map.notify(oldMap, key);
		}
	};
	return $map;
};
//#endregion
//#region map-creator/index.js
function mapCreator(init) {
	let Creator = (id, ...args) => {
		if (id in Object.prototype) throw Error(id);
		if (!Creator.cache[id]) Creator.cache[id] = Creator.build(id, ...args);
		return Creator.cache[id];
	};
	Creator.build = (id, ...args) => {
		let store = /* @__PURE__ */ map({ id });
		onMount(store, () => {
			let destroy;
			if (init) destroy = init(store, id, ...args);
			return () => {
				delete Creator.cache[id];
				if (destroy) destroy();
			};
		});
		return store;
	};
	Creator.cache = {};
	if ("production" !== "production") Creator[clean] = () => {
		for (let id in Creator.cache) Creator.cache[id][clean]();
		Creator.cache = {};
	};
	return Creator;
}
//#endregion
export { STORE_UNMOUNT_DELAY, allTasks, atom, batch, batched, clean, cleanStores, cleanTasks, computed, deepMap, effect, getKey, getPath, keepMount, listenKeys, map, mapCreator, onMount, onNotify, onSet, onStart, onStop, readonlyType, setByKey, setPath, startTask, subscribeKeys, task };
