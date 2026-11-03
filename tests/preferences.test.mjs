import assert from "node:assert/strict";
import { test } from "node:test";
import { createPreferenceStorage } from "../src/lib/preference-storage-model.ts";
const adapter = (legacy, native, options = {}) => createPreferenceStorage({
  legacyRead: async (key) => legacy.get(key) ?? null,
  legacyWrite: async (key, value) => { legacy.set(key, value); },
  nativeRead: async (key, fallback) => { if (!native.has(key) && fallback !== null) native.set(key, fallback); return native.get(key) ?? null; },
  nativeWrite: async (key, value) => { native.set(key, value); }, ...options,
});
test("migration preserves SQLite values and imports a legacy preference once", async () => {
  const legacy = new Map([["theme", "dark"]]); const native = new Map();
  const store = adapter(legacy, native);
  assert.equal(await store.getItem("theme"), "dark"); native.set("theme", "light");
  assert.equal(await store.getItem("theme"), "light");
});
test("concurrent writes and reads preserve the newest committed value", async () => {
  const legacy = new Map(); const native = new Map(); const store = adapter(legacy, native);
  const first = store.setItem("radio", "old"); const second = store.setItem("radio", "new"); const read = store.getItem("radio");
  await Promise.all([first, second]); assert.equal(await read, "new"); assert.equal(native.get("radio"), "new");
});
test("failed SQLite write is recovered after reopening instead of restoring stale SQLite", async () => {
  const legacy = new Map([["radio", "old"]]); const native = new Map([["radio", "old"]]);
  const failing = adapter(legacy, native, { nativeWrite: async () => { throw Error(); } });
  await failing.setItem("radio", "new"); assert.equal(await failing.getItem("radio"), "new");
  const reopened = adapter(legacy, native);
  assert.equal(await reopened.getItem("radio"), "new"); assert.equal(native.get("radio"), "new");
});
test("web and old APK use the same preferences through legacy storage", async () => {
  const legacy = new Map(); const store = adapter(legacy, new Map(), { nativeRead: undefined, nativeWrite: undefined });
  await store.setItem("theme", "dark"); assert.equal(await store.getItem("theme"), "dark");
});
test("a journal failure leaves the previous committed preference intact", async () => {
  const legacy = new Map([["radio", "old"]]); const native = new Map([["radio", "old"]]);
  const store = adapter(legacy, native, { legacyWrite: async () => { throw Error("Storage full"); } });
  await assert.rejects(store.setItem("radio", "new"));
  assert.equal(native.get("radio"), "old");
});
