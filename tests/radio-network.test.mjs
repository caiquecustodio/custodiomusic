import assert from "node:assert/strict";
import { test } from "node:test";
import { radioSearchPlan, interleaveLocal } from "../src/lib/radio-network-model.ts";
const local = (id) => ({ track: { id, uri: `file:///${id}`, title: id, artist: "Artista" } });
const remote = (id) => ({ track: { id, uri: "", online: { provider: "youtube", sourceId: id }, title: id, artist: "Artista" } });
test("a cold start uses genuine popular sources rather than a query labeled popular", () => {
  assert.deepEqual(radioSearchPlan([], [], [], {}, () => 0.5), { kind: "popular" });
  assert.deepEqual(radioSearchPlan([], [], [], { genre: "Rock" }, () => 0.5), { kind: "search", query: "Rock música" });
});
test("qualified listening personalizes the search while retaining exploration", () => {
  const history = [{ artist: "Autor", plays: 40, completions: 30, skips: 0 }];
  assert.deepEqual(radioSearchPlan(history, [], [], {}, () => 0.1), { kind: "search", query: "Autor músicas" });
  assert.deepEqual(radioSearchPlan(history, [], [], {}, () => 0.95), { kind: "popular" });
  assert.deepEqual(radioSearchPlan([{ ...history[0], skips: 200 }], [], [], {}, () => 0.1), { kind: "popular" });
});
test("local tracks bridge online discovery without replacing it", () => {
  const entries = [local("l1"), local("l2"), remote("r1"), remote("r2"), remote("r3"), remote("r4")];
  assert.deepEqual(interleaveLocal(entries).map((entry) => entry.track.id), ["r1", "r2", "l1", "r3", "r4", "l2"]);
  assert.equal(entries.length, 6);
  assert.deepEqual(interleaveLocal([local("only")]).map((entry) => entry.track.id), ["only"]);
  assert.deepEqual(interleaveLocal([]), []);
  assert.equal(interleaveLocal(Array.from({ length: 20 }, (_, i) => remote(String(i)))).length, 8);
});
