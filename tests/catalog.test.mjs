import assert from "node:assert/strict";
import { test } from "node:test";
import { createCatalog } from "../src/lib/catalog.ts";
const item = (provider, id = provider) => ({ provider, id, title: id, artist: "Artista", duration: 120, thumbnail: null, url: `https://example.org/${id}`, downloadable: false });
const sources = async () => [{ id: "youtube", available: true }, { id: "audius", available: true }, { id: "jamendo", available: false }];
test("automatic search interleaves available catalogs and isolates one failed source", async () => {
  const calls = [];
  const catalog = createCatalog({ sources, search: async (id) => { calls.push(id); if (id === "youtube") throw Error(); return [item(id)]; }, popular: async () => [] });
  const result = await catalog.search("artist");
  assert.deepEqual(calls.sort(), ["audius", "youtube"]);
  assert.deepEqual(result.items.map((t) => t.provider), ["audius"]);
  assert.ok(result.errors.youtube);
});
test("timeout delivers other results and prevents piling up native requests", async () => {
  let calls = 0; let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const catalog = createCatalog({ sources, timeoutMs: 15, search: async (id) => { if (id === "youtube") { calls++; return delayed; } return [item(id)]; }, popular: async () => [] });
  const result = await catalog.search("first");
  assert.equal(result.items.length, 1); assert.ok(result.errors.youtube);
  await catalog.search("second"); assert.equal(calls, 1);
  release([item("youtube")]);
});
test("cached results match the query, survive a failed refresh, and remain bounded", async () => {
  let now = 0; let failing = false; let saved;
  const catalog = createCatalog({ sources, now: () => now, writeCache: async (value) => { saved = value; }, search: async (id, q) => { if (failing) throw Error(); return [item(id, q)]; }, popular: async () => [] });
  await catalog.search("first"); failing = true; now = 600000;
  const cached = await catalog.search("first");
  assert.equal(cached.items.length, 2); assert.ok(cached.errors.youtube);
  assert.equal((await catalog.search("other")).items.length, 0);
  assert.ok(JSON.parse(saved).length <= 24);
});
test("malformed cache is ignored and fresh cached searches avoid repeat traffic", async () => {
  let calls = 0;
  const catalog = createCatalog({ sources, readCache: async () => '{broken', search: async (id) => { calls++; return [item(id), item(id)]; }, popular: async () => [] });
  assert.equal((await catalog.search("artist")).items.length, 2);
  assert.equal((await catalog.search("artist")).items.length, 2); assert.equal(calls, 2);
  await assert.rejects(catalog.search(" "));
});
test("popular uses all configured sources while a disabled catalog is never queried", async () => {
  const catalog = createCatalog({ sources, search: async () => [], popular: async (id) => [item(id, "1"), item(id, "2")] });
  assert.deepEqual((await catalog.popular()).items.map((i) => `${i.provider}:${i.id}`), ["youtube:1", "audius:1", "youtube:2", "audius:2"]);
});
test("fast catalogs appear progressively before a slower source finishes", async () => {
  let release; let notify;
  const delayed = new Promise((resolve) => { release = resolve; });
  const appeared = new Promise((resolve) => { notify = resolve; });
  const catalog = createCatalog({ sources, search: async (id) => id === "youtube" ? delayed : [item(id)], popular: async () => [] });
  const final = catalog.search("artist", "all", (items) => { if (items.length) notify(items); });
  assert.deepEqual((await appeared).map((t) => t.provider), ["audius"]);
  release([item("youtube")]); assert.equal((await final).items.length, 2);
});
test("a pending or failed home refresh does not block an explicit music search", async () => {
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const catalog = createCatalog({ sources, search: async (id) => [item(id)], popular: async () => delayed });
  const home = catalog.popular();
  assert.equal((await catalog.search("artist")).items.length, 2);
  release([]); await home;
});
test("explicit refresh renews home results while ordinary navigation reuses the cache", async () => {
  let calls = 0;
  const catalog = createCatalog({ sources, search: async () => [], popular: async (id) => { calls++; return [item(id)]; } });
  await catalog.popular(); await catalog.popular(); assert.equal(calls, 2);
  await catalog.popular(true); assert.equal(calls, 4);
});
